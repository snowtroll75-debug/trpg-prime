/**
 * Storm Of Vengeance on the board: the cast's strike, and one on each Sustain.
 *
 * NEW at 3.610.0. The rules are in magic/storm.mjs. The storm is the Region
 * its cast placed; it carries the DC, the modes, and the one last used.
 */

import {
  STORM_FLAG, THUNDER_IMMUNE_FLAG, normaliseStorm, spanSeconds, stormDie, stormExpired, stormModeForFace,
  stormModesOffered, stormStrikeLine, stormStruckThisRound, thunderImmune
} from "./storm.mjs";
import { isActingGM } from "../acting-gm.mjs";

const SYSTEM_ID = "trg-prime";
const STORM_TERRAIN_FLAG = "stormTerrain";

/** Ask which strike; the one just used is not offered. */
async function promptStormMode(spec, last, label) {
  const offered = stormModesOffered(spec, last);
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${label} — the storm` },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog"><p class="hint">Choose the storm's effect this round`
      + `${last ? ` (not ${spec.modes.find((m) => m.key === last)?.label ?? last} again)` : ""}.</p></div>`,
    buttons: offered.map((m) => ({ action: m.key, label: m.label })),
    rejectClose: false
  });
  return offered.find((m) => m.key === picked) ?? null;
}

/**
 * THIS STRIKE'S MODE (3.687.0, H16): chosen, as Storm of Vengeance's are, or
 * rolled on the storm's die (Storm of Unmaking's 1d6), the face said first.
 *
 * @returns {Promise<{mode: object|null, lines: string[]}>}
 */
async function strikeMode(spec, last, label) {
  if (spec.pick !== "roll") return { mode: await promptStormMode(spec, last, label), lines: [] };
  const die = stormDie(spec);
  const roll = await new Roll(die).evaluate();
  const mode = stormModeForFace(spec, roll.total);
  return { mode, lines: [`${label}: the storm's ${die} — <strong>${roll.total}</strong>${mode ? `, ${mode.label}` : ""}.`] };
}

/** The weather of Rain and Wind: put down, or taken away. */
async function setRainAndWind(region, on, label) {
  const existing = Array.from(region.behaviors ?? []).filter((b) => b.getFlag?.(SYSTEM_ID, STORM_TERRAIN_FLAG));
  if (!on) {
    if (existing.length) await region.deleteEmbeddedDocuments("RegionBehavior", existing.map((b) => b.id));
    return;
  }
  if (existing.length) return;
  const { normaliseDifficultTerrain, terrainAuraShape } = await import("./difficult-terrain.mjs");
  const { terrainBehaviours } = await import("../creature-aura-workflow.mjs");
  const spec = normaliseDifficultTerrain({ kind: "difficultTerrain", label, target: "area" });
  const behaviours = terrainBehaviours(terrainAuraShape(spec, label))
    // THE BEHAVIOUR'S OWN FLAGS KEPT (3.683.0): the magical-terrain mark
    // (seam C16) rides beside the storm's own.
    .map((b) => ({ ...b, flags: { ...(b.flags ?? {}), [SYSTEM_ID]: { ...(b.flags?.[SYSTEM_ID] ?? {}), [STORM_TERRAIN_FLAG]: true } } }));
  if (behaviours.length) await region.createEmbeddedDocuments("RegionBehavior", behaviours);
}

/**
 * Strike once with the chosen mode at everything in the storm.
 *
 * @returns {Promise<string[]>} card lines
 */
async function stormStrike(caster, region, record, mode) {
  const lines = [];
  const spec = normaliseStorm(record.spec);
  const { tokensInRegion, basicSaveHit } = await import("./area-save-workflow.mjs");
  const inside = tokensInRegion(region);
  lines.push(stormStrikeLine(spec, mode, record.dc));

  await setRainAndWind(region, mode.terrain, record.label);
  await region.setFlag(SYSTEM_ID, STORM_FLAG, { ...record, last: mode.key, screen: Boolean(mode.screen) });
  if (mode.terrain) {
    lines.push("The storm's area is <strong>difficult terrain</strong>, and everything seen within or through it is "
      + "<strong>concealed</strong>, until another effect replaces the rain.");
    return lines;
  }
  if (!inside.length) {
    lines.push("<em>Nobody is under the storm.</em>");
    return lines;
  }

  const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
  const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");

  if (mode.condition) {
    // THUNDERCLAP: a save, a condition, and an hour's immunity for a success.
    const { TRGCheck } = await import("../dice/check.mjs");
    const { applyConditionTags } = await import("../combat/effect-application-workflow.mjs");
    const now = Number(game.time?.worldTime ?? 0);
    for (const t of inside) {
      const actor = t.actor;
      if (thunderImmune(actor.getFlag?.(SYSTEM_ID, THUNDER_IMMUNE_FLAG), now)) {
        lines.push(`${actor.name}: immune to thunderclaps for now.`);
        continue;
      }
      const saveName = mode.save.charAt(0).toUpperCase() + mode.save.slice(1);
      const saveData = actor.system?.combat?.saves?.[mode.save];
      const check = await TRGCheck.roll({
        actor, label: `${actor.name} — ${saveName} Save`, subtitle: `vs ${record.label} — DC ${record.dc}`,
        type: "save", saveSource: record.label, sourceUuid: caster?.uuid ?? "", subject: mode.save, dc: record.dc,
        modifiers: saveData?.checkModifiers ?? [{ label: `${saveName} save`, value: Number(saveData?.total ?? 0), type: "untyped" }]
      });
      if (check?.outcome?.degree?.success) {
        await actor.setFlag(SYSTEM_ID, THUNDER_IMMUNE_FLAG, now + spanSeconds(mode.immunity));
        lines.push(`${actor.name}: <strong>${check.outcome.degree.label}</strong> — unaffected, and immune to thunderclaps for ${mode.immunity}.`);
        continue;
      }
      const seconds = spanSeconds(mode.duration);
      await applyConditionTags(actor, [{ key: mode.condition, label: mode.condition.charAt(0).toUpperCase() + mode.condition.slice(1) }], {
        spellEffect: true, spellEffectEnd: seconds ? now + seconds : null
      });
      lines.push(`${actor.name}: <strong>${check?.outcome?.degree?.label ?? "Failure"}</strong> — <strong>${mode.condition}</strong> for ${mode.duration}.`);
    }
    return lines;
  }

  if (!mode.save) {
    // ACID RAIN: one roll, everyone under it, no save.
    const roll = await new Roll(mode.formula).evaluate();
    lines.push(`Rolled <strong>${roll.total}</strong>.`);
    for (const t of inside) {
      const actor = t.actor;
      // A DAMAGE REACTION, BEFORE THE DEFENCES (3.681.0; found in review).
      {
        const { spellDamageReactionsFor } = await import("../reactions/reactions-workflow.mjs");
        lines.push(...await spellDamageReactionsFor(actor, mode.type, { spellName: record?.label ?? "", source: caster }));
      }
      const packet = resolveAgainstDefences(actor.system ?? {}, {
        amount: roll.total, type: mode.type, creatureTypeSystem: ownedCreatureTypeSystem(actor), magical: true, area: true
      });
      const applied = packet.taken > 0 ? await applyDamageAndCheckDying(actor, packet.taken, { isCritical: false }) : null;
      lines.push(`${actor.name}: <strong>${packet.taken} ${mode.type}</strong>${applied?.newHP != null ? ` — now ${applied.newHP} HP` : ""}.`);
    }
    return lines;
  }

  let struck = inside.map((t) => t.actor);
  let amount = null;
  if (mode.bolts > 0) {
    // LIGHTNING: creatures of the caster's choice, one bolt each, each rolled.
    const { promptAreaChoice } = await import("./area-choice-workflow.mjs");
    const chosen = await promptAreaChoice(`${record.label} — lightning`, struck, caster?.uuid || caster?.id || "");
    if (chosen === null) {
      lines.push("<em>No bolts were called down.</em>");
      return lines;
    }
    const { applyAreaChoice } = await import("./area-choice.mjs");
    struck = applyAreaChoice(struck, chosen);
    if (struck.length > mode.bolts) {
      lines.push(`<em>Only ${mode.bolts} bolts fall — the first ${mode.bolts} chosen are struck.</em>`);
      struck = struck.slice(0, mode.bolts);
    }
  } else {
    // HAIL: one roll, scaled by each creature's save.
    amount = (await new Roll(mode.formula).evaluate()).total;
    lines.push(`Rolled <strong>${amount}</strong>.`);
  }
  for (const actor of struck) {
    const hit = await basicSaveHit({
      caster, target: actor, save: mode.save, dc: record.dc, label: record.label,
      formula: mode.formula, amount, type: mode.type, baseDamage: record.baseDamage
    });
    lines.push(hit.line);
  }
  return lines;
}

/**
 * The cast: record the storm on its Region and strike once.
 *
 * @returns {Promise<string[]>} card lines
 */
export async function castStorm(region, row, { caster, castId, dc, spellName, baseDamage, follow = null, until = null }) {
  const spec = normaliseStorm(row);
  if (!spec) return [`<em>${spellName} declares a malformed storm.</em>`];
  // WHAT IT FOLLOWS AND WHEN IT ENDS (3.687.0, H16): the caster's token, when
  // the row (or the module raising it) says it follows; a module's storm keeps
  // its own clock, since no cast of it is running.
  const follows = follow === null ? spec.follow : follow === true;
  const casterToken = caster?.getActiveTokens?.()[0]?.document ?? caster?.token ?? null;
  const record = { castId, casterUuid: caster?.uuid ?? "", label: spellName, dc: Number(dc) || 0,
    baseDamage: String(baseDamage ?? ""), spec: row, last: "", screen: false,
    ...(follows && casterToken?.id ? { followTokenId: casterToken.id } : {}),
    ...(Number.isFinite(Number(until)) && until !== null ? { ownExpiry: true, until: Number(until) } : {}) };
  await region.setFlag(SYSTEM_ID, STORM_FLAG, record);
  const { mode, lines } = await strikeMode(spec, "", spellName);
  if (!mode) {
    return [...lines, spec.strikes === "turnStart"
      ? `<em>${spellName}: no effect this time — it strikes again at the start of your next turn.</em>`
      : `<em>${spellName}: no effect chosen this round — choose one when you Sustain it.</em>`];
  }
  return [...lines, ...await stormStrike(caster, region, record, mode)];
}

/**
 * A Sustain: strike again with a different mode.
 *
 * @returns {Promise<string[]>} card lines, wrapped as paragraphs
 */
export async function stormOnSustain(actor, castId) {
  const region = Array.from(canvas?.scene?.regions ?? [])
    .find((r) => r.getFlag?.(SYSTEM_ID, STORM_FLAG)?.castId === castId);
  if (!region) return [];
  const record = region.getFlag(SYSTEM_ID, STORM_FLAG);
  const spec = normaliseStorm(record.spec);
  if (!spec) return [];
  // A STORM THAT STRIKES AT ITS CASTER'S TURN START (3.687.0, H16) strikes
  // nothing on a Sustain.
  if (spec.strikes === "turnStart") return [];
  // "THE FIRST TIME EACH ROUND you Sustain the Spell" (3.610.1, F2 of the
  // 3.610.0 drive). Nothing stops a second Sustain in a round, and this
  // struck on every one. Out of combat there are no rounds to count, so
  // each Sustain strikes, as before.
  const round = game.combat?.started ? Number(game.combat.round) : null;
  if (stormStruckThisRound(record.sustainRound, round)) {
    return [`<p style="margin:2px 0"><em>${record.label} has already struck this round — `
      + `only the first Sustain each round chooses a storm effect.</em></p>`];
  }
  const mode = await promptStormMode(spec, record.last, record.label);
  if (!mode) return [`<p style="margin:2px 0"><em>${record.label}: no effect chosen this round.</em></p>`];
  if (round !== null) record.sustainRound = round;
  const lines = await stormStrike(actor, region, record, mode);
  return lines.map((l) => `<p style="margin:2px 0">${l}</p>`);
}

/* ------------------------------------------------------------------ */
/* 3.687.0, H16: the turn-start strike, the follower, a module's storm  */
/* ------------------------------------------------------------------ */

/** The storms on a scene: [{ region, record, spec }]. */
function stormsOn(scene) {
  const out = [];
  for (const region of Array.from(scene?.regions ?? [])) {
    const record = region.getFlag?.(SYSTEM_ID, STORM_FLAG);
    const spec = record ? normaliseStorm(record.spec) : null;
    if (spec) out.push({ region, record, spec });
  }
  return out;
}

/** Is the cast that raised this storm still running? (A module's storm keeps its own clock.) */
async function stormCastRunning(caster, record) {
  if (record.ownExpiry === true) return true;
  if (!record.castId) return true;
  const { getActiveSpells } = await import("./active-spells.mjs");
  return getActiveSpells(caster).some((e) => e.id === record.castId);
}

/**
 * AT THE START OF EACH OF ITS CASTER'S TURNS (3.687.0, H16; Storm of
 * Unmaking: "When you initially cast the spell and then at the beginning of
 * each of your turns, roll 1d6"). Called from the turn start, on the acting
 * GM; a storm whose own clock has run out is taken away instead.
 *
 * @returns {Promise<string[]>} card lines
 */
export async function applyStormTurnStarts(actor) {
  const lines = [];
  try {
    if (!actor) return lines;
    const now = Number(game.time?.worldTime ?? 0);
    for (const { region, record, spec } of stormsOn(canvas?.scene)) {
      if (spec.strikes !== "turnStart" || String(record.casterUuid ?? "") !== String(actor.uuid ?? "")) continue;
      if (stormExpired(record, now)) {
        await region.delete().catch(() => {});
        lines.push(`<em>${record.label}: the storm passes.</em>`);
        continue;
      }
      if (!(await stormCastRunning(actor, record))) continue;
      const { mode, lines: said } = await strikeMode(spec, record.last, record.label);
      lines.push(...said);
      if (!mode) { lines.push(`<em>${record.label}: no effect this turn.</em>`); continue; }
      lines.push(...await stormStrike(actor, region, region.getFlag(SYSTEM_ID, STORM_FLAG) ?? record, mode));
    }
  } catch (error) {
    console.error("TRG Prime | a storm could not strike this turn", error);
  }
  return lines;
}

/** A module's storms whose own clock has run out, on every scene (the acting GM). */
export async function expireStorms(worldTime = Number(game.time?.worldTime ?? 0)) {
  if (!isActingGM()) return 0;
  let n = 0;
  for (const scene of Array.from(game.scenes ?? [])) {
    const gone = stormsOn(scene).filter(({ record }) => stormExpired(record, worldTime)).map(({ region }) => region.id);
    if (gone.length) await scene.deleteEmbeddedDocuments("Region", gone).catch(() => {});
    n += gone.length;
  }
  return n;
}

/**
 * A FOLLOWING STORM MOVES WITH ITS CASTER (3.687.0, H16). Where the move ends
 * is read from the change, not the document (an animated move's document is
 * still at its start when the hook fires).
 */
export async function followStorms(tokenDocument, changed = {}) {
  if (!isActingGM()) return 0;
  if (changed?.x === undefined && changed?.y === undefined) return 0;
  const scene = tokenDocument?.parent;
  const size = Number(scene?.grid?.size ?? canvas?.grid?.size ?? 100);
  const x = Number(changed.x ?? tokenDocument.x ?? 0) + (Math.max(1, Number(tokenDocument.width ?? 1)) * size) / 2;
  const y = Number(changed.y ?? tokenDocument.y ?? 0) + (Math.max(1, Number(tokenDocument.height ?? 1)) * size) / 2;
  let n = 0;
  for (const { region, record } of stormsOn(scene)) {
    if (!record.followTokenId || record.followTokenId !== tokenDocument.id) continue;
    const shape = region.shapes?.[0];
    if (!shape || shape.type !== "circle") continue;
    const data = typeof shape.toObject === "function" ? shape.toObject() : { ...shape };
    await region.update({ shapes: [{ ...data, x, y }] }).catch(() => {});
    n += 1;
  }
  return n;
}

/**
 * A STORM A MODULE RAISES (3.687.0, H16; helpers.placeStorm) — Storm of
 * Unmaking's fumble: "storm appears above you and follows you wherever you
 * go". A circle of `radiusFeet` centred on `centre` (the caster's token by
 * default), striking at once as a cast's storm would, with its own clock of
 * `seconds`. `row` is a `storm` row; `follow` overrides the row's own.
 *
 * @returns {Promise<{regionId: string|null, lines: string[]}>}
 */
export async function placeStorm(actor, row, { centre = null, radiusFeet = 0, follow = null, dc = 0, castId = "", seconds = 60, spellName = "", baseDamage = "" } = {}) {
  const spec = normaliseStorm(row);
  const label = String(spellName || spec?.label || "Storm");
  if (!spec) return { regionId: null, lines: [`<em>${label} declares a malformed storm.</em>`] };
  const scene = canvas?.scene;
  const token = actor?.getActiveTokens?.()[0] ?? null;
  const at = centre ?? token?.center ?? null;
  const feet = Math.max(0, Number(radiusFeet) || 0);
  if (!scene || !at || !feet) return { regionId: null, lines: [`<em>${label}: no token or radius to raise the storm on — the GM places it.</em>`] };
  const pxPerFt = Number(canvas.dimensions?.size ?? 100) / Number(canvas.dimensions?.distance ?? 5);
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: label, color: game.user?.color?.css ?? "#5a3fa0",
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    shapes: [{ type: "circle", x: Number(at.x), y: Number(at.y), radius: feet * pxPerFt, hole: false }]
  }]);
  if (!region) return { regionId: null, lines: [`<em>${label}: the storm's area could not be made.</em>`] };
  const until = Number(game.time?.worldTime ?? 0) + Math.max(1, Math.trunc(Number(seconds) || 60));
  const lines = await castStorm(region, row, { caster: actor, castId, dc, spellName: label, baseDamage, follow, until });
  return { regionId: region.id, lines };
}

/** The follower and the clock (the acting GM). */
export function registerStorms() {
  Hooks.on("updateToken", (tokenDocument, changed) => {
    followStorms(tokenDocument, changed).catch((error) => console.error("TRG Prime | a storm could not follow", error));
  });
  Hooks.on("updateWorldTime", (worldTime) => {
    expireStorms(worldTime).catch((error) => console.error("TRG Prime | a storm could not end", error));
  });
}
