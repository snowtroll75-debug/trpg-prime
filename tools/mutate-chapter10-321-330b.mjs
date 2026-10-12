#!/usr/bin/env node
/**
 * mutate-chapter10-321-330b — can the Spirit Trap and Shroud checks fail?
 *
 * NEW at 3.606.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IN SECTION F IS THE DEFECT FOUND BUILDING SPIRIT TRAP:
 * the flat ladder walking every save result inside a loop that already runs
 * once per recipient, so two creatures caught by Serenity were each bitten
 * twice.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const BIND = at("module", "magic", "movement-bind.mjs");
const BIND_WF = at("module", "magic", "movement-bind-workflow.mjs");
const MOVE = at("module", "combat", "movement-workflow.mjs");
const COMBAT = at("module", "documents", "combat.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const FLAT = at("module", "magic", "flat-ladder.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const LIGHT = at("module", "light-check.mjs");
const DIALOG = at("module", "apps", "check-dialog.mjs");
const SHEET = at("module", "sheets", "actor-sheet.mjs");
const SKL = at("module", "magic", "skill-ladder.mjs");
const SKL_WF = at("module", "magic", "skill-ladder-workflow.mjs");
const VERIFY = at("tools", "verify-chapter10-321-330b.mjs");

const MUTATIONS = [
  /* ---------------- M. the bind ---------------- */
  { file: BIND, name: "M: a Blunder falls off the bottom and goes free",
    from: `  for (let i = DEGREE_ORDER.length - 1; i >= 0; i -= 1) if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];`,
    to: `  ;`, breaks: "M5b" },
  { file: BIND, name: "M: the floor doubles ground that was already difficult",
    from: `  return Math.max(c, d * 2);`, to: `  return c * 2;`, breaks: "M8b" },
  { file: BIND, name: "M: the leash refuses its own length",
    from: `  return d > Number(leashFeet);`, to: `  return d >= Number(leashFeet);`, breaks: "M9" },
  { file: BIND, name: "M: an unmeasured point is refused",
    from: `  if (!Number.isFinite(d)) return false;`, to: `  if (!Number.isFinite(d)) return true;`, breaks: "M9d" },
  { file: BIND, name: "M: a negative leash is accepted",
    from: `    if (leash !== null && (!Number.isFinite(leash) || leash < 0)) return null;`,
    to: `    if (leash !== null && !Number.isFinite(leash)) return null;`, breaks: "M7b" },
  { file: BIND, name: "M: the Fumble owes a new save after all",
    from: `      resave: r.resave === true`, to: `      resave: true`, breaks: "M5" },
  /* ---------------- V. the hook ---------------- */
  { file: BIND_WF, name: "V: only the destination is asked — out and back escapes",
    from: `      ...(movement?.pending?.waypoints ?? []),\n`, to: ``, breaks: "V3" },
  { file: BIND_WF, name: "V: a leash on another scene binds this one",
    from: `      if (anchor.sceneId && tokenDocument.parent?.id && anchor.sceneId !== tokenDocument.parent.id) continue;`,
    to: `      ;`, breaks: "V4" },
  { file: BIND_WF, name: "V: a disabled bind still binds",
    from: `    if (effect?.disabled) continue;\n    const record = effect.getFlag?.(SYSTEM_ID, MOVEMENT_BIND_FLAG)`,
    to: `    const record = effect.getFlag?.(SYSTEM_ID, MOVEMENT_BIND_FLAG)`, breaks: "V6" },
  { file: MOVE, name: "V: the hook never refuses a leashed move",
    from: `  if (bound.refused) {`, to: `  if (false) {`, breaks: "V8" },
  { file: MOVE, name: "V: heavy ground is never charged",
    // RE-ANCHORED AT 3.621.0: the Blinded's terrain joins a bind's (block 39's R7).
    from: `  const cost = allDifficult ? difficultFloor(surcharged, proposedDistance(movement)) : surcharged;`,
    to: `  const cost = surcharged;`, breaks: "V9" },
  /* ---------------- T. the new save ---------------- */
  { file: COMBAT, name: "T: nobody ever rolls the new save",
    from: `      for (const said of await rollMovementBindSaves(actor, combatant.token ?? null)) {`,
    to: `      for (const said of []) {`, breaks: "T1" },
  { file: BIND_WF, name: "T: a Fumble's locked leash is re-rolled every turn",
    from: `filter(({ record }) => record.bind.resave)`, to: `filter(({ record }) => record.bind)`, breaks: "T2" },
  { file: BIND_WF, name: "T: a freeing save leaves the bind in place",
    from: `      if (outcome.free) {\n        await effect.delete();`, to: `      if (outcome.free) {\n        void effect;`,
    breaks: "T3" },
  { file: BIND_WF, name: "T: a leash is anchored at the map's corner",
    from: `    anchor: outcome.bind.leashFeet !== null ? anchorOf(tokenDocument) : null`,
    to: `    anchor: outcome.bind.leashFeet !== null ? { x: 0, y: 0, sceneId: null } : null`, breaks: "T5" },
  /* ---------------- S. the applier ---------------- */
  { file: FLAT, name: "S: a movement bind is handed only the failures — a Critical never frees anybody",
    from: `export const LADDER_KINDS = Object.freeze(["flatLadder", "movementBind"]);`,
    to: `export const LADDER_KINDS = Object.freeze(["flatLadder"]);`, breaks: "S2" },
  { file: APPLIER, name: "S: a freeing rung still creates an effect",
    from: `          if (outcome.free) break;\n          const { bindRecord }`, to: `          const { bindRecord }`, breaks: "S3b" },
  { file: KINDS, name: "S: movementBind leaves the handled vocabulary",
    from: `  "movementBind",\n`, to: ``, breaks: "S1" },
  /* ---------------- L. the light ---------------- */
  { file: LIGHT, name: "L: two shrouds stack into a deeper one",
    from: `    if (n < worst) worst = n;`, to: `    if (n < 0) worst += n;`, breaks: "L1c" },
  { file: LIGHT, name: "L: a disabled shroud still dims",
    from: `    if (effect?.disabled) continue;\n    const n = Math.trunc(Number(effect?.flags?.[SYSTEM_ID]?.[LIGHT_PERCEPTION_FLAG]));`,
    to: `    const n = Math.trunc(Number(effect?.flags?.[SYSTEM_ID]?.[LIGHT_PERCEPTION_FLAG]));`, breaks: "L1e" },
  { file: LIGHT, name: "L: the penalty row ignores the shroud",
    from: `  const shrouded = shiftLightLevel(ambientLevel, shift, 1);`, to: `  const shrouded = Number(ambientLevel);`,
    breaks: "L2b" },
  { file: LIGHT, name: "L: senses first, then the shroud — darkvision cannot answer it",
    from: `  const shrouded = shiftLightLevel(ambientLevel, shift, 1);\n  const effective = raiseLightLevel(shrouded, steps);`,
    to: `  const shrouded = Number(ambientLevel);\n  const effective = shiftLightLevel(raiseLightLevel(shrouded, steps), shift, 1);`,
    breaks: "L3" },
  { file: LIGHT, name: "L: the range report ignores the shroud",
    from: `  const effective = raiseLightLevel(shiftLightLevel(ambientLevel, shift, 1), steps);`,
    to: `  const effective = raiseLightLevel(ambientLevel, steps);`, breaks: "L4" },
  { file: DIALOG, name: "L: the check dialog forgets the shroud",
    from: `      shift: perceivedLightShift(Array.from(actor.effects ?? []))`, to: `      shift: 0`, breaks: "L5" },
  { file: SHEET, name: "L: the sheet forgets the shroud",
    from: `          shift: perceivedLightShift(Array.from(this.actor.effects ?? []))`, to: `          shift: 0`, breaks: "L5b" },
  /* ---------------- G. the governing ladder ---------------- */
  { file: SKL, name: "G: a scene ladder may govern",
    from: `    governs: candidates === "targets" && raw.governs === true,`, to: `    governs: raw.governs === true,`,
    breaks: "G1d" },
  { file: SKL, name: "G: a rung's declared unaffected is ignored",
    from: `    unaffected: !rung || rung.unaffected === true`, to: `    unaffected: !rung`, breaks: "G2" },
  { file: SKL, name: "G: THE WILLING ARE ASKED TO ROLL — an unticked target takes nothing",
    from: `    if (r.resisted && (!r.outcome || r.outcome.unaffected)) continue;`,
    to: `    if (!r.resisted || !r.outcome || r.outcome.unaffected) continue;`, breaks: "G5" },
  { file: SKL, name: "G: a Success is shrouded for the full duration",
    from: `    const length = r.resisted ? String(r.outcome.duration ?? "") : "";`, to: `    const length = "";`,
    breaks: "G5b" },
  { file: SKL, name: "G: Shroud's card closes by talking about a stone",
    from: `  if (spec?.judged) return \`<em>\${spec.judged}</em>\`;`, to: `  ;`, breaks: "G6" },
  { file: APPLIER, name: "G: the groups are applied at the spell's own length",
    from: `          durationOverride: group.duration || null`, to: `          durationOverride: null`, breaks: "G8" },
  { file: APPLIER, name: "G: the governed rows are ALSO applied to everybody by the loop",
    from: `    if (governed && (effect === governing || effect?.kind !== "note")) continue;`, to: `    ;`, breaks: "G9" },
  { file: APPLIER, name: "G: a length handed down is ignored",
    from: `  const spellDurationSource = durationOverride || warpedDurationText(spell.system?.duration, warpMods);`,
    to: `  const spellDurationSource = warpedDurationText(spell.system?.duration, warpMods);`, breaks: "G10" },
  { file: SKL_WF, name: "G: an unticked target is left out rather than willing",
    from: `      if (!uuid || !chosen.includes(uuid)) governed.push({ actor, resisted: false, outcome: null });`,
    to: `      ;`, breaks: "G11b" },
  /* ---------------- F. one target at a time ---------------- */
  { file: APPLIER, name: "F THE DEFECT RESTORED: every target is handed every result",
    from: `          const mine = ladderResults.find((r) => r?.target === target);`,
    to: `          for (const r of ladderResults) { void r; }\n          const mine = ladderResults.find((r) => r?.target === target);`,
    breaks: "F1b" }
];

const PACK = [
  { spell: "Spirit Trap", name: "P THE DEFECT RESTORED: the shadow is pinned and nothing happens",
    mutate: (sy) => { sy.effects = []; }, breaks: "P1" },
  { spell: "Spirit Trap", name: "P: the leash is 10 feet",
    mutate: (sy) => { sy.effects[0].rungs.failure.leashFeet = 10; }, breaks: "P1" },
  { spell: "Spirit Trap", name: "P: the extra-target warp goes inert",
    mutate: (sy) => { sy.warps[0].mods = {}; }, breaks: "P2b" },
  { spell: "Shroud", name: "P: the shroud gains a save of its own",
    mutate: (sy) => { sy.defence = "Will"; }, breaks: "P3" },
  { spell: "Shroud", name: "P: the bonus is to saves against fire",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conditional").grants[0].when.traits = ["fire"]; },
    breaks: "P3b" },
  { spell: "Shroud", name: "P: the shift is one step",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "lightPerception").steps = -1; }, breaks: "P3c" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-chapter10-321-330b does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const m of MUTATIONS) {
  const original = originals.get(m.file);
  const n = original.split(m.from).length - 1;
  if (n !== 1) {
    console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(m.file, original.replace(m.from, m.to));
  const stillPasses = run();
  fs.writeFileSync(m.file, original);
  if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else console.log(`  caught    ${m.name}`);
}
for (const [file, original] of originals) fs.writeFileSync(file, original);

const { ClassicLevel } = await import("classic-level");
const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");
async function withSpell(name, fn) {
  const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
  await db.open();
  let key = null;
  let pristine = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() !== name.toLowerCase()) continue;
      key = k; pristine = JSON.parse(JSON.stringify(v)); break;
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(pristine));
    fn(mutated.system);
    await db.put(key, mutated);
  } finally { if (db.status === "open") await db.close(); }
  try {
    return run() ? "SURVIVED" : "caught";
  } finally {
    const db2 = new ClassicLevel(SPELLS, { valueEncoding: "json" });
    await db2.open();
    try { await db2.put(key, pristine); } finally { await db2.close(); }
  }
}
for (const m of PACK) {
  let state;
  try { state = await withSpell(m.spell, (sy) => m.mutate(sy)); }
  catch (err) { state = `ERROR ${err.message}`; }
  if (state === "caught") console.log(`  caught    ${m.name}`);
  else if (state === "SURVIVED") { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else { console.error(`  ${state}  ${m.name} (${m.spell})`); unmatched++; }
}

const TOTAL = MUTATIONS.length + PACK.length;
process.stdout.write(survived + unmatched
  ? `\nmutate-chapter10-321-330b: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-321-330b: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
