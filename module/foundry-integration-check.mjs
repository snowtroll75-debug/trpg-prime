/**
 * The live suite: what node structurally cannot check.
 *
 * WHY THIS EXISTS. On 11 August 2026 three consecutive releases shipped
 * three defects, all in the same seam, none visible to 1,335 green
 * checks:
 *
 *   3.267.0  a hook Foundry does not await, run concurrently — one aura
 *            drew no circle, three drew three copies of one circle;
 *   3.267.1  a schema key Foundry silently discards — a behaviour that
 *            was created, validated, logged, and did nothing;
 *   3.267.2  an embedded collection handed to update(), which appends
 *            rather than replaces — a behaviour multiplying on every step.
 *
 * Every one of them is a fact about FOUNDRY, and the node harness only
 * ever sees this system's half of the conversation. tools/verify-foundry
 * -integration.mjs encodes as much of Foundry's half as can be encoded
 * outside it — a recorded snapshot, and static rules about how its API
 * must be called. But a recorded snapshot has one failure mode it cannot
 * report: going stale. Foundry renames a field, the snapshot still says
 * the old name, the guard still says yes, and the payload is discarded
 * exactly as before.
 *
 * So this runs inside the game and does the two things only the game can:
 *
 *   1. RE-READS Foundry's own schemas and says where they have parted
 *      company with the snapshot.
 *   2. DRIVES THE REAL HOOKS on a scratch scene and READS BACK the
 *      documents Foundry actually created — not the payloads this system
 *      sent. Reading back is the whole point: every one of the three
 *      defects looked correct on the sending side.
 *
 * It creates nothing outside its own scratch scene and deletes that
 * scene in a `finally`, so a failure part-way through still cleans up.
 * It never touches the world's own actors, scenes or settings.
 */

import {
  FOUNDRY_SCHEMA_SNAPSHOT, captureSchemas, coreSchemasOnly, driftNotes, driftProblems,
  moduleSchemaNames, snapshotDrift
} from "./foundry-schemas.mjs";
import { schemaProblems } from "./schema-guard.mjs";
import { auraWorkSettled, tokenCentre } from "./creature-aura-workflow.mjs";
import { auraReachFeet } from "./creature-auras.mjs";
import { contentPack } from "./content-packs.mjs";

const SYSTEM_ID = "trg-prime";
const SCRATCH = "TRG Prime — Integration Check (scratch)";

/**
 * The abilities the drive uses, and why these three.
 *
 * They are the SHIPPED items, pulled from the compendium by name, not
 * fixtures invented here — so a Codex edit that breaks an aura is caught
 * by the same run. One of each kind that draws a circle, plus the one
 * whose radius scales:
 *
 *   Stench          save aura, flat 10 ft — the plain case.
 *   Whirlwind       terrain aura — the one carrying a RegionBehavior,
 *                   which is where the discarded key lived.
 *   Frightful Aura  5 ft x level — the one that must be redrawn when the
 *                   creature levels.
 */
const DRIVE_ABILITIES = Object.freeze(["Stench", "Whirlwind", "Frightful Aura"]);

/** A tiny recorder, so a failing check names itself and the run goes on. */
export function makeLedger() {
  const results = [];
  const ok = (label, condition, detail = "") => {
    results.push({ label, pass: !!condition, detail: condition ? "" : String(detail) });
    return !!condition;
  };
  const eq = (label, actual, expected) => ok(
    label,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
  return {
    results, ok, eq,
    get failures() { return results.filter((r) => !r.pass); }
  };
}

/**
 * Step one: is the snapshot still true?
 *
 * Pure apart from reading CONFIG, and the CONFIG read is passed in so a
 * harness can drive it with a stand-in.
 */
export function checkSchemaSnapshot(ledger, {
  dataModels = globalThis.CONFIG?.RegionBehavior?.dataModels ?? {},
  foundryVersion = globalThis.game?.version ?? "",
  snapshot = FOUNDRY_SCHEMA_SNAPSHOT
} = {}) {
  const everything = captureSchemas(dataModels);
  // MODULES ARE NOT FOUNDRY. A type another module registers varies per
  // world, so failing on it fails every run, and a check that always
  // fails is a check nobody reads. Found on the first live run, against
  // Monk's Active Tile Triggers.
  const captured = coreSchemasOnly(everything);
  const fromModules = moduleSchemaNames(everything);
  const drift = snapshotDrift(captured, snapshot.schemas);
  const problems = driftProblems(drift);
  const notes = driftNotes(drift);

  ledger.ok("S1 Foundry exposes its RegionBehavior schemas at all",
    Object.keys(captured).length > 0,
    "CONFIG.RegionBehavior.dataModels held no core types — the capture read nothing, so a clean result below would be meaningless");

  ledger.ok(`S2 the recorded schemas still exist in Foundry ${foundryVersion || "(unknown build)"}`,
    problems.length === 0, problems.join("; "));

  // Not a failure — the snapshot merely being behind cannot break
  // anything — but it is worth saying, because it is the moment to
  // re-record rather than six months later when a payload needs a field
  // the guard refuses.
  ledger.ok("S3 the snapshot is not behind this Foundry build",
    notes.length === 0, notes.join("; "));

  const sameBuild = String(foundryVersion).startsWith(String(snapshot.foundry));
  ledger.ok(`S4 the snapshot was recorded on this build (${snapshot.foundry})`,
    sameBuild, `snapshot says ${snapshot.foundry}, this game is ${foundryVersion}`);

  // Reported, never recorded and never failed on — but said out loud,
  // because "another module has added a Region behaviour" is worth
  // knowing when a Region starts behaving oddly.
  ledger.ok(fromModules.length
    ? `S5 ${fromModules.length} Region behaviour(s) come from modules, and are left alone: ${fromModules.join(", ")}`
    : "S5 no module has added a Region behaviour to this world", true);

  return { captured, drift, problems, notes, fromModules };
}

/** The snapshot as it should now read, ready to paste into the module. */
export function snapshotSource(captured, foundryVersion) {
  // Filtered again here, not only at the capture. This string is pasted
  // into a module that ships to every world, and a module's schema baked
  // into it would have the guard approving payloads against a shape most
  // installs do not have.
  const body = Object.entries(coreSchemasOnly(captured))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, paths]) => `    ${JSON.stringify(name)}: Object.freeze(${JSON.stringify(paths)})`)
    .join(",\n");
  return `export const FOUNDRY_SCHEMA_SNAPSHOT = Object.freeze({\n`
    + `  foundry: ${JSON.stringify(String(foundryVersion))},\n`
    + `  capturedFrom: "CONFIG.RegionBehavior.dataModels, walked to depth 3",\n`
    + `  capturedBy: "the 'Verify Foundry Integration' macro",\n`
    + `  schemas: Object.freeze({\n${body}\n  })\n});\n`;
}

/**
 * Step two: drive the real hooks and read back what Foundry made.
 *
 * Everything here is deliberately done the way a person does it — create
 * a token, move it, add an ability, level the creature — and then asks
 * the DOCUMENT what happened, never the function that was called.
 */
export async function driveAuraLifecycle(ledger) {
  const previousScene = globalThis.canvas?.scene ?? null;
  let scene = null;
  let actor = null;

  try {
    scene = await Scene.create({
      name: SCRATCH,
      width: 3000,
      height: 3000,
      padding: 0,
      backgroundColor: "#111111",
      tokenVision: false,
      grid: { type: CONST.GRID_TYPES.SQUARE, size: 100, distance: 5, units: "ft" }
    });
    // Viewed, not activated: this client looks at it, the players do not
    // get dragged along, and the geometry below reads the scratch scene's
    // own grid rather than whatever was on screen.
    await scene.view();

    const pack = contentPack("creature-abilities");
    const abilities = [];
    for (const name of DRIVE_ABILITIES) {
      const [doc] = (await pack?.getDocuments({ name })) ?? [];
      if (doc) abilities.push(doc.toObject());
      else ledger.ok(`D0 the compendium still has "${name}"`, false,
        "the drive needs it; a renamed or deleted ability makes every check below vacuous");
    }
    if (abilities.length !== DRIVE_ABILITIES.length) return;
    ledger.ok("D0 the compendium still has all three drive abilities", true);

    actor = await Actor.create({
      name: `${SCRATCH} subject`,
      type: "npc",
      system: { identity: { level: 6 } }
    });

    const [token] = await scene.createEmbeddedDocuments("Token", [{
      name: "Scratch", actorId: actor.id, actorLink: true, x: 500, y: 500, width: 1, height: 1
    }]);
    await auraWorkSettled();

    const regions = () => scene.regions.filter(
      (r) => r.getFlag(SYSTEM_ID, "auraRegion")?.tokenId === token.id);

    ledger.eq("D1 a creature with no abilities emits no circles", regions().length, 0);

    // --- the 3.267.0 defect: three hooks at once -------------------------
    // Foundry does not await hook callbacks, so this fires three
    // `createItem` hooks that all read the scene before any of them has
    // written to it. Unserialised, this produced one circle for three
    // abilities on one run and three copies of one circle on the next.
    await actor.createEmbeddedDocuments("Item", abilities);
    await auraWorkSettled();

    ledger.eq("D2 three abilities added at once make exactly three circles",
      regions().length, 3);
    const auraIds = regions().map((r) => r.getFlag(SYSTEM_ID, "auraRegion")?.auraId).sort();
    ledger.eq("D3 …one per aura, none duplicated", auraIds,
      ["aura-frightful-aura", "aura-stench", "aura-whirlwind"]);

    // --- the 3.267.1 defect: a key Foundry discards ----------------------
    // Read back from the CREATED document. The payload this system sent
    // was `{terrain: {difficulty: 2}}`, Foundry accepted the document,
    // dropped the key, defaulted every difficulty to 1, and difficult
    // terrain cost exactly normal movement.
    const whirlwind = regions().find(
      (r) => r.getFlag(SYSTEM_ID, "auraRegion")?.auraId === "aura-whirlwind");
    const behaviours = Array.from(whirlwind?.behaviors ?? []);
    ledger.eq("D4 the terrain aura's Region carries exactly one behaviour",
      behaviours.length, 1);
    const stored = behaviours[0]?.toObject?.() ?? {};
    ledger.eq("D5 …of the type Foundry has for difficult ground",
      stored.type, "modifyMovementCost");
    ledger.eq("D6 …and Foundry KEPT the walk difficulty (3.267.1: it did not)",
      stored.system?.difficulties?.walk, 2);
    ledger.eq("D7 …and every other movement type with it",
      [stored.system?.difficulties?.fly, stored.system?.difficulties?.swim,
        stored.system?.difficulties?.burrow], [2, 2, 2]);
    ledger.ok("D8 …with nothing left over that Foundry silently dropped",
      schemaProblems(stored.system ?? {}, "RegionBehavior:modifyMovementCost",
        { schemas: { "RegionBehavior:modifyMovementCost": captureSchemas(CONFIG.RegionBehavior.dataModels)["RegionBehavior:modifyMovementCost"] } }).length === 0,
      "the stored behaviour has keys this Foundry does not define");

    // A save aura is not difficult ground and must not have acquired a
    // behaviour by being near one.
    const stench = regions().find(
      (r) => r.getFlag(SYSTEM_ID, "auraRegion")?.auraId === "aura-stench");
    ledger.eq("D9 a save aura's Region carries no behaviours",
      Array.from(stench?.behaviors ?? []).length, 0);

    // --- the 3.267.2 defect: update() appends embedded collections -------
    // Moving is the ordinary thing a token does, and it used to add a
    // copy of the behaviour every single time.
    for (const [i, x] of [700, 900, 1100].entries()) {
      await token.update({ x, y: 500 + (i * 100) });
      await auraWorkSettled();
    }
    ledger.eq("D10 after three moves there are still three circles", regions().length, 3);
    ledger.eq("D11 …and still exactly one behaviour (3.267.2: there were four)",
      Array.from(regions().find(
        (r) => r.getFlag(SYSTEM_ID, "auraRegion")?.auraId === "aura-whirlwind")?.behaviors ?? []).length,
      1);

    // The circle has to be where the creature is, not where it started.
    const centre = tokenCentre(token);
    const moved = regions()[0]?.toObject?.().shapes?.[0] ?? {};
    ledger.eq("D12 the circle followed the creature",
      [Math.round(moved.x), Math.round(moved.y)],
      [Math.round(centre.x), Math.round(centre.y)]);

    // --- the second 3.267.1 defect: a scaled radius frozen at first draw --
    const pxPerFt = canvas.dimensions.size / canvas.dimensions.distance;
    const frightfulRadius = () => (regions().find(
      (r) => r.getFlag(SYSTEM_ID, "auraRegion")?.auraId === "aura-frightful-aura")
      ?.toObject?.().shapes?.[0]?.radius ?? 0);
    ledger.eq("D13 Frightful Aura is 5 ft x level at level 6",
      Math.round(frightfulRadius()), Math.round(auraReachFeet(30, 5) * pxPerFt));

    // FLATTENED, which is the shape a sheet submits — a form field's
    // name is a dotted path. Code writes the nested shape, so a guard
    // that only reads that one works from the console and fails at the
    // sheet. Both are driven, in that order, because the flattened one
    // is the one a person actually produces.
    await actor.update({ "system.identity.level": 10 });
    await auraWorkSettled();
    ledger.eq("D14 …and is redrawn when the creature levels (sheet's flattened update)",
      Math.round(frightfulRadius()), Math.round(auraReachFeet(50, 5) * pxPerFt));

    await actor.update({ system: { identity: { level: 4 } } });
    await auraWorkSettled();
    ledger.eq("D14b …and by a nested update too",
      Math.round(frightfulRadius()), Math.round(auraReachFeet(20, 5) * pxPerFt));

    // --- removal ---------------------------------------------------------
    const stenchItem = actor.items.find((i) => i.name === "Stench");
    await stenchItem?.delete();
    await auraWorkSettled();
    ledger.eq("D15 removing one ability removes only its circle", regions().length, 2);
    ledger.ok("D16 …and it is the right one gone",
      !regions().some((r) => r.getFlag(SYSTEM_ID, "auraRegion")?.auraId === "aura-stench"));

    await token.delete();
    await auraWorkSettled();
    ledger.eq("D17 deleting the creature takes its circles with it",
      scene.regions.filter((r) => r.getFlag(SYSTEM_ID, "auraRegion")).length, 0);
  } finally {
    // Cleanup runs even when a check above throws, because a suite that
    // leaves a scratch scene behind on failure is a suite people stop
    // running.
    //
    // THE ORDER MATTERS, and it was wrong on the first live run: the
    // view was put back AFTER the scratch scene was deleted, and
    // deleting the scene you are looking at tears the canvas down under
    // you — `canvas.scene` came back null and the GM was left staring at
    // a blank screen until they re-opened their own scene by hand. Look
    // away first, then delete.
    try { if (previousScene && previousScene.id !== scene?.id) await previousScene.view(); } catch (e) {
      console.error("TRG Prime | restoring the view", e);
    }
    try { if (actor) await actor.delete(); } catch (e) { console.error("TRG Prime | scratch actor", e); }
    try { if (scene) await scene.delete(); } catch (e) { console.error("TRG Prime | scratch scene", e); }
  }
}

/**
 * Step three: the facts that need a running game but not a scratch scene.
 */
export function checkWorldWiring(ledger) {
  // The clock. Core Foundry defaults roundTime to 0 and expects the
  // system to set it; with 0 the world time never advanced, so every
  // duration in the game was effectively infinite and no aura immunity
  // window ever expired.
  ledger.eq("W1 a combat round advances the world clock by six seconds",
    CONFIG.time?.roundTime, 6);
  ledger.eq("W2 …and a turn advances it by none", CONFIG.time?.turnTime, 0);
  ledger.ok("W3 the system's API is published", !!globalThis.game?.trgPrime?.version);
}

/**
 * Everything, with a report.
 *
 * @returns {{results: object[], failures: object[], snapshot: string|null}}
 */
export async function runIntegrationCheck({ chat = true } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can run the Foundry integration check.");
    return null;
  }
  const ledger = makeLedger();
  const started = Date.now();

  const schema = checkSchemaSnapshot(ledger);
  checkWorldWiring(ledger);
  try {
    await driveAuraLifecycle(ledger);
  } catch (error) {
    ledger.ok("D— the drive ran to completion", false, String(error?.message ?? error));
    console.error("TRG Prime | integration check", error);
  }

  const failures = ledger.failures;
  const fresh = (schema.problems.length || schema.notes.length)
    ? snapshotSource(schema.captured, game.version)
    : null;

  console.groupCollapsed(
    `TRG Prime | Foundry integration: ${ledger.results.length - failures.length}/${ledger.results.length} passed`);
  console.table(ledger.results.map((r) => ({ check: r.label, result: r.pass ? "pass" : "FAIL", detail: r.detail })));
  if (fresh) {
    console.warn("TRG Prime | module/foundry-schemas.mjs is out of date. Replace its export with:\n" + fresh);
    try { await game.clipboard.copyPlainText(fresh); } catch { /* clipboard is a nicety */ }
  }
  console.groupEnd();

  if (chat) {
    const row = (r) => `<p style="margin:1px 0">${r.pass ? "✔" : "✖"} ${r.label}`
      + `${r.detail ? `<br><span style="opacity:.75">${foundry.utils.escapeHTML?.(r.detail) ?? r.detail}</span>` : ""}</p>`;
    const shown = failures.length ? failures : ledger.results;
    await ChatMessage.create({
      whisper: [game.user.id],
      content: `<div class="trg-prime trg-check-card"><header class="check-header">`
        + `<div class="check-heading"><span class="check-actor">Foundry ${game.version}</span>`
        + `<h3>Integration check — ${failures.length ? `${failures.length} FAILED` : "all clear"}</h3></div></header>`
        + `<p style="margin:2px 0">${ledger.results.length - failures.length} of ${ledger.results.length} checks passed `
        + `in ${((Date.now() - started) / 1000).toFixed(1)}s.</p>`
        + shown.map(row).join("")
        + (fresh ? `<p style="margin:4px 0"><em>A fresh snapshot has been copied to your clipboard and logged to the console — paste it into module/foundry-schemas.mjs.</em></p>` : "")
        + `</div>`
    });
  }

  if (failures.length) ui.notifications.error(`TRG Prime | ${failures.length} integration check(s) failed — see chat.`);
  else ui.notifications.info(`TRG Prime | Foundry integration: all ${ledger.results.length} checks passed.`);

  return { results: ledger.results, failures, snapshot: fresh };
}
