/**
 * A SAVE LADDER ROLLED AGAIN ON A TURN BOUNDARY (3.685.0, H3) — the Foundry
 * half of magic/turn-ladder.mjs.
 *
 *   (b) an area's ladder: recorded on the cast's Region (`recordAreaTurnLadder`),
 *       rolled for everyone inside at the cast when `atCast`, and at the start
 *       of each of the CASTER's turns;
 *   (c) a target's ladder: a `turnLadder` effect row leaves a marker effect on
 *       each target the cast's save reached (`markTargetTurnLadder`), rolled at
 *       the start of each of THAT creature's turns while the cast lasts — the
 *       marker carries the cast's id, so it ends with the spell.
 *
 * Both roll through `rollTurnLadderFor`, from the turn-start pass in
 * documents/combat.mjs (`applyTurnLadders`).
 */

import {
  TURN_LADDER_FLAG, normaliseTurnLadder, turnLadderRollsAgain, turnLadderStep, turnLadderLine
} from "./turn-ladder.mjs";

const SYSTEM_ID = "trg-prime";

async function actorOf(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    return doc?.documentName === "Actor" ? doc : (doc?.actor ?? null);
  } catch { return null; }
}

/** The creature's own effects this cast left, less the ladder's marker. */
function castEffectsOn(creature, castId) {
  return Array.from(creature?.effects ?? []).filter((e) =>
    e?.flags?.[SYSTEM_ID]?.castId === castId && !e?.flags?.[SYSTEM_ID]?.[TURN_LADDER_FLAG]);
}

/** Add a creature to a running cast's targets, so the spell's end reaches it. */
async function joinCastTargets(caster, castId, uuid) {
  if (!caster || !castId || !uuid) return;
  const { getActiveSpells, setActiveSpells } = await import("./active-spells.mjs");
  const entries = getActiveSpells(caster);
  const entry = entries.find((e) => e.id === castId);
  if (!entry || (entry.targets ?? []).includes(uuid)) return;
  entry.targets = [...(entry.targets ?? []), uuid];
  await setActiveSpells(caster, entries);
}

/**
 * Roll one creature's save on a recorded ladder and apply what it does.
 *
 * @param {Actor} creature
 * @param {object} record a normalised ladder plus `{dc, castId, casterUuid, spellUuid, spellName, damageType}`
 * @param {string|null} previous the degree it last rolled
 * @returns {Promise<{lines: string[], record: string|null, rolled: boolean, ended: boolean}>}
 */
async function rollTurnLadderFor(creature, record, previous = null) {
  const lines = [];
  const spec = normaliseTurnLadder(record);
  if (!creature || !spec) return { lines, record: previous, rolled: false, ended: false };
  if (!turnLadderRollsAgain(spec, previous)) return { lines, record: previous, rolled: false, ended: false };
  const label = spec.label || String(record.spellName ?? "A save");
  const dc = Math.max(0, Math.trunc(Number(record.dc) || 0));
  const word = `${spec.save.charAt(0).toUpperCase()}${spec.save.slice(1)}`;
  const { TRGCheck } = await import("../dice/check.mjs");
  const check = await TRGCheck.roll({
    actor: creature, label: `${creature.name} — ${word} Save`, subtitle: `${label} — again`,
    type: "save", save: spec.save, dc, sourceUuid: String(record.casterUuid ?? "")
  });
  const rolled = check?.outcome?.degree?.key ?? "failure";
  const step = turnLadderStep(spec, previous, rolled);
  lines.push(turnLadderLine(label, creature.name, check?.outcome?.degree?.label ?? rolled, step, { total: check?.outcome?.total ?? "—", dc }));
  if (!step.apply) return { lines, record: step.record, rolled: true, ended: false };

  const caster = await actorOf(record.casterUuid);
  const castId = String(record.castId ?? "") || null;
  // THE NEW RESULT REPLACES THE LAST: the effects this cast left on the
  // creature go before the new rung's land (Q156, m100).
  if (step.replaceOld && castId) {
    const old = castEffectsOn(creature, castId).map((e) => e.id);
    if (old.length) await creature.deleteEmbeddedDocuments("ActiveEffect", old).catch(() => {});
  }
  const rung = step.rung;
  if (rung?.dice && !rung.unaffected) {
    const type = rung.damageType || spec.damageType || String(record.damageType ?? "") || "force";
    const roll = await new Roll(rung.dice).evaluate();
    const { spellDamageReactionsFor } = await import("../reactions/reactions-workflow.mjs");
    lines.push(...await spellDamageReactionsFor(creature, type, { spellName: label, source: caster }));
    const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
    const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
    const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
    const packet = resolveAgainstDefences(creature.system ?? {}, {
      amount: roll.total, type, creatureTypeSystem: ownedCreatureTypeSystem(creature), magical: true
    });
    if (packet.taken > 0) await applyDamageAndCheckDying(creature, packet.taken, { isCritical: false });
    lines.push(`${creature.name} takes <strong>${packet.taken}</strong> ${type} (${rung.dice} rolled ${roll.total}${packet.taken !== roll.total ? ", after defences" : ""}).`);
  }
  if (rung?.rows?.length && !rung.unaffected && !step.endsSpell) {
    const item = record.spellUuid ? await fromUuid(record.spellUuid).catch(() => null) : null;
    const spell = item ?? { name: label, img: "", uuid: null, system: { duration: String(record.duration ?? ""), effects: rung.rows } };
    const { applySpellEffects } = await import("./spell-effects.mjs");
    const applied = [];
    await applySpellEffects(caster ?? creature, spell, { targets: [creature], effects: rung.rows, lines: applied, saveDC: dc, castId });
    lines.push(...applied);
    await joinCastTargets(caster, castId, creature.uuid);
  }
  let ended = false;
  if (step.endsSpell && caster && castId) {
    const { endActiveSpell } = await import("./active-spells.mjs");
    ended = Boolean(await endActiveSpell(caster, castId, { dismissed: false }));
    if (!ended) {
      const marker = Array.from(creature.effects ?? []).find((e) => e?.flags?.[SYSTEM_ID]?.[TURN_LADDER_FLAG]?.castId === castId);
      if (marker) await marker.delete().catch(() => {});
      ended = true;
    }
  }
  return { lines, record: step.record, rolled: true, ended };
}

/**
 * (c) Leave a target's ladder on it: a marker effect carrying the record and
 * the cast's id. Called by the spell engine's `turnLadder` row for each
 * creature the cast's save reached; one whose first result ends the spell is
 * not marked (it never saves again).
 */
export async function markTargetTurnLadder(target, row, { dc = 0, castId = null, casterUuid = "", spellUuid = "", spellName = "", damageType = "", first = null, img = "" } = {}) {
  const spec = normaliseTurnLadder(row);
  if (!target || !spec || spec.on !== "targetTurnStart") return null;
  if (first) {
    const step = turnLadderStep(spec, null, first);
    if (step.endsSpell) return { spec, marked: false };
  }
  const { createEffectsOn } = await import("../combat/target-relay-workflow.mjs");
  const data = {
    name: `${spec.label || spellName} — save each turn`,
    img: img || "icons/svg/daze.svg",
    changes: [],
    flags: { [SYSTEM_ID]: {
      [TURN_LADDER_FLAG]: { ...row, dc: Number(dc) || 0, castId, casterUuid, spellUuid, spellName, damageType, last: first ?? null },
      ...(castId ? { castId, spellEffect: true } : {})
    } }
  };
  // RELAYED WHEN THE TARGET IS NOT OURS, as every spell effect is.
  await createEffectsOn(target, [data]);
  return { spec, marked: true };
}

/** (b) Record an area's ladder on its Region; roll it at the cast when `atCast`. */
export async function recordAreaTurnLadder(region, row, { dc = 0, castId = null, casterUuid = "", spellUuid = "", spellName = "", damageType = "", caught = [] } = {}) {
  const spec = normaliseTurnLadder(row);
  if (!region?.setFlag || !spec || spec.on !== "casterTurnStart") return null;
  const record = { ...row, dc: Number(dc) || 0, castId, casterUuid, spellUuid, spellName, damageType, results: {} };
  const lines = [];
  if (spec.atCast) {
    for (const creature of caught ?? []) {
      const done = await rollTurnLadderFor(creature, record, null);
      lines.push(...done.lines);
      if (done.rolled && creature?.uuid) record.results[creature.uuid] = done.record;
      if (done.ended) break;
    }
  }
  await region.setFlag(SYSTEM_ID, TURN_LADDER_FLAG, record);
  return { spec, lines };
}

/** Is this token inside the Region? (The Region answers, as the ladders ask it.) */
function inside(region, token) {
  try {
    return region.testPoint({ x: token.center?.x ?? token.x, y: token.center?.y ?? token.y, elevation: token.document?.elevation ?? 0 });
  } catch { return false; }
}

/**
 * The turn-start pass: (c) this creature's own ladders, and (b) the areas
 * whose caster's turn this is. Swallows its own failure, as the other turn
 * sweeps do.
 * @returns {Promise<string[]>}
 */
export async function applyTurnLadders(actor, token) {
  const lines = [];
  try {
    if (!actor) return lines;
    // (c) A TARGET'S OWN, while its cast lasts.
    for (const marker of Array.from(actor.effects ?? [])) {
      const record = marker?.flags?.[SYSTEM_ID]?.[TURN_LADDER_FLAG];
      if (!record || marker.disabled || normaliseTurnLadder(record)?.on !== "targetTurnStart") continue;
      const caster = await actorOf(record.casterUuid);
      if (caster && record.castId) {
        const { getActiveSpells } = await import("./active-spells.mjs");
        if (!getActiveSpells(caster).some((e) => e.id === record.castId)) {
          await marker.delete().catch(() => {});
          continue;
        }
      }
      const done = await rollTurnLadderFor(actor, record, record.last ?? null);
      lines.push(...done.lines);
      if (!done.ended && done.rolled) await marker.setFlag?.(SYSTEM_ID, TURN_LADDER_FLAG, { ...record, last: done.record }).catch(() => {});
    }
    // (b) THE AREAS THIS CASTER KEEPS, for everyone in them.
    const regions = Array.from(globalThis.canvas?.scene?.regions ?? []);
    for (const region of regions) {
      const record = region.getFlag?.(SYSTEM_ID, TURN_LADDER_FLAG);
      if (!record || String(record.casterUuid ?? "") !== String(actor.uuid ?? "")) continue;
      if (normaliseTurnLadder(record)?.on !== "casterTurnStart") continue;
      const results = { ...(record.results ?? {}) };
      let ended = false;
      for (const tok of Array.from(globalThis.canvas?.tokens?.placeables ?? [])) {
        const creature = tok?.actor;
        if (!creature || !inside(region, tok)) continue;
        const done = await rollTurnLadderFor(creature, record, results[creature.uuid] ?? null);
        lines.push(...done.lines);
        if (done.rolled) results[creature.uuid] = done.record;
        if (done.ended) { ended = true; break; }
      }
      if (!ended) await region.setFlag(SYSTEM_ID, TURN_LADDER_FLAG, { ...record, results }).catch(() => {});
    }
  } catch (error) {
    console.error("TRG Prime | a turn ladder could not be rolled this turn", error);
  }
  return lines;
}
