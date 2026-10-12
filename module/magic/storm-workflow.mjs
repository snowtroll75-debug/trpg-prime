/**
 * Storm Of Vengeance on the board: the cast's strike, and one on each Sustain.
 *
 * NEW at 3.610.0. The rules are in magic/storm.mjs. The storm is the Region
 * its cast placed; it carries the DC, the modes, and the one last used.
 */

import {
  STORM_FLAG, THUNDER_IMMUNE_FLAG, normaliseStorm, spanSeconds, stormModesOffered,
  stormStrikeLine, stormStruckThisRound, thunderImmune
} from "./storm.mjs";

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
    .map((b) => ({ ...b, flags: { ...(b.flags ?? {}), [SYSTEM_ID]: { [STORM_TERRAIN_FLAG]: true } } }));
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
export async function castStorm(region, row, { caster, castId, dc, spellName, baseDamage }) {
  const spec = normaliseStorm(row);
  if (!spec) return [`<em>${spellName} declares a malformed storm.</em>`];
  const record = { castId, casterUuid: caster?.uuid ?? "", label: spellName, dc: Number(dc) || 0,
    baseDamage: String(baseDamage ?? ""), spec: row, last: "", screen: false };
  await region.setFlag(SYSTEM_ID, STORM_FLAG, record);
  const mode = await promptStormMode(spec, "", spellName);
  if (!mode) return [`<em>${spellName}: no effect chosen this round — choose one when you Sustain it.</em>`];
  return stormStrike(caster, region, record, mode);
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
