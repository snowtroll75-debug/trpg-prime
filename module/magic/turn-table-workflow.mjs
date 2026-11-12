/**
 * A TABLE ROLLED AT THE START OF EACH OF A CREATURE'S TURNS (3.686.0, H18) —
 * the Foundry half of magic/turn-table.mjs.
 *
 *   markTurnTable    a `turnTable` row (or "insanity", core Insanity's own)
 *                    leaves a marker effect on the creature for its rounds;
 *                    reached by the spell engine's `turnTable` case, and by a
 *                    module through `helpers.markTurnTable` (Eldritch Arts'
 *                    Symbol of Insanity).
 *   applyTurnTables  the turn-start pass (documents/combat.mjs, beside the
 *                    turn ladders, before AP are regained): the last roll's
 *                    effects go, the die is rolled and its row lands, and a
 *                    marker with no turns left goes with its effects.
 *
 * The turn-start pass runs on the acting GM's client (`TRGCombat.automates`),
 * so each roll is made once.
 */

import {
  INSANITY_TURN_TABLE, TURN_TABLE_FLAG, countsTurnsIn, normaliseTurnTable, riseTakenBackTo, splitTurnTableRows, turnTableEndTime, turnTableLine, turnTableRollTag, turnTableRounds, turnTableRow
} from "./turn-table.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Mark a creature with a table for its rounds.
 * @param {Actor} target
 * @param {object|string} row a `turnTable` row, or "insanity"
 * @param {object} options
 * @param {number|null} options.margin the save's margin (negative on a failure)
 * @param {number} [options.per] a warp's `turnTablePer`
 * @returns {Promise<{marked: boolean, rounds: number|null, line: string}|null>} null for a malformed row
 */
export async function markTurnTable(target, row, { margin = null, per = 0, dc = 0, castId = null, casterUuid = "", spellName = "", img = "" } = {}) {
  const raw = row === "insanity" ? INSANITY_TURN_TABLE : row;
  const spec = normaliseTurnTable(raw);
  if (!target || !spec) return null;
  const rounds = turnTableRounds(spec, margin, per);
  const label = spec.label || spellName || "A table";
  if (rounds === null) {
    return { marked: false, rounds: null, line: `<em>${label}: no save margin to count ${target.name}'s rounds from — roll its ${spec.die} by hand.</em>` };
  }
  const { createEffectsOn } = await import("../combat/target-relay-workflow.mjs");
  await createEffectsOn(target, [{
    name: `${label} — ${rounds} round${rounds === 1 ? "" : "s"}`,
    img: img || "icons/svg/daze.svg",
    changes: [],
    flags: { [SYSTEM_ID]: {
      [TURN_TABLE_FLAG]: { ...JSON.parse(JSON.stringify(raw)), turnsLeft: rounds, dc: Number(dc) || 0, casterUuid, spellName },
      ...(castId ? { castId } : {}),
      // ITS DURATION ON THE WORLD CLOCK UNLESS ITS TURNS ARE COUNTED (the Block
      // 8a re-review, B and H): a creature that is itself a combatant in a
      // started combat takes no world-clock end (rounds × 6 could fall at the
      // round change before its first roll); any other — marked from another
      // scene, not in the tracker, in a combat not started — gets rounds × 6.
      // A combatant deleted, or its combat, gives the marker its clock then.
      ...(countsTurnsIn(target, allCombats()) ? {} : { spellEffect: true, spellEffectEnd: turnTableEndTime(game.time?.worldTime, rounds) })
    } }
  }]);
  return {
    marked: true, rounds,
    line: `${target.name} is <strong>${label.toLowerCase() === "insanity" ? "insane" : label}</strong> for ${rounds} round${rounds === 1 ? "" : "s"}: ${spec.die} at the start of each of its turns.`
  };
}

/** Every combat in the world (the tracker's), else the one being viewed. */
function allCombats() {
  const list = Array.from(globalThis.game?.combats ?? []);
  return list.length ? list : [globalThis.game?.combat].filter(Boolean);
}

/** The effects one marker's last roll laid. */
function rollEffectsOf(actor, markerId) {
  const tag = turnTableRollTag(markerId);
  return Array.from(actor?.effects ?? []).filter((e) => e?.flags?.[SYSTEM_ID]?.castId === tag);
}

/** Does the creature have this condition directly (an effect carrying it)? */
const hasDirect = (actor, key) => Array.from(actor?.effects ?? []).some((e) => !e?.disabled && e?.statuses?.has?.(key));

/**
 * THE LAST ROLL'S BEHAVIOUR ENDS WITH ITS TURN, AND ONLY ITS OWN (3.686.0; the
 * Block 8a re-review): the conditions it created (its stamp) go; on one that
 * already stood, its rise comes off, never below what it was.
 */
async function undoLastRoll(actor, markerId, record) {
  const old = rollEffectsOf(actor, markerId).map((e) => e.id);
  if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old).catch(() => {});
  for (const entry of Array.isArray(record?.raised) ? record.raised : []) {
    const to = riseTakenBackTo(entry, actor.getConditionValue?.(entry.key) ?? null);
    if (to !== null) await actor.toggleStatusEffect?.(entry.key, { active: true, value: to })?.catch?.(() => {});
  }
}

/**
 * A ROLL ON A CONDITION ALREADY STANDING (3.686.0; the Block 8a re-review): a
 * valued one's value is raised by the condition's own stacking rule and the
 * rise recorded for the marker; an unvalued one is left as it is. Its cast id,
 * clock and duration are never touched, and the general condition path is not
 * used. Returns the rises.
 */
async function raiseStanding(actor, rows, label, lines) {
  const { CONDITIONS } = await import("../conditions/registry.mjs");
  const { combinedConditionValue } = await import("../conditions/condition-rules.mjs");
  const raised = [];
  for (const r of rows) {
    const key = String(r.condition);
    const name = CONDITIONS[key]?.label ?? key;
    if (!CONDITIONS[key]?.valued) { lines.push(`<em>${actor.name} is already ${name}: ${label} leaves it as it is.</em>`); continue; }
    const incoming = r.formula ? Number((await new Roll(String(r.formula)).evaluate()).total) : Number(r.value ?? 1);
    const before = Number(actor.getConditionValue?.(key) ?? 0);
    const after = combinedConditionValue(key, before, incoming);
    if (!(after > before)) { lines.push(`<em>${actor.name} is already ${name} ${before}: no higher this turn.</em>`); continue; }
    await actor.toggleStatusEffect?.(key, { active: true, value: after });
    // HOW IT STACKS, by the core's own rule: an adding condition's rise comes
    // off by subtraction, a keep-the-higher one's only while it still stands at this.
    raised.push({ key, before, after, adds: combinedConditionValue(key, 1, 1) > 1 });
    lines.push(`${actor.name}: ${name} ${before} → <strong>${after}</strong> for this turn (${label}).`);
  }
  return raised;
}

/** Effects a roll laid whose marker is gone (deleted by hand, ended with its spell). */
function strandedRollEffects(actor) {
  const markers = new Set(Array.from(actor?.effects ?? []).filter((e) => e?.flags?.[SYSTEM_ID]?.[TURN_TABLE_FLAG]).map((e) => e.id));
  return Array.from(actor?.effects ?? []).filter((e) => {
    const c = String(e?.flags?.[SYSTEM_ID]?.castId ?? "");
    return c.startsWith("turnTable:") && !markers.has(c.slice("turnTable:".length));
  });
}

/**
 * The turn-start pass for one creature. Swallows its own failure, as the
 * other turn sweeps do.
 * @returns {Promise<string[]>} the card's lines
 */
export async function applyTurnTables(actor) {
  const lines = [];
  try {
    if (!actor) return lines;
    const stranded = strandedRollEffects(actor).map((e) => e.id);
    if (stranded.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stranded).catch(() => {});
    for (const marker of Array.from(actor.effects ?? [])) {
      const record = marker?.flags?.[SYSTEM_ID]?.[TURN_TABLE_FLAG];
      if (!record || marker.disabled) continue;
      const spec = normaliseTurnTable(record);
      const label = spec?.label || String(record.spellName ?? "A table");
      await undoLastRoll(actor, marker.id, record);
      const left = Math.trunc(Number(record.turnsLeft) || 0);
      if (!spec || left <= 0) {
        endingByPass.add(marker.id);
        await marker.delete().catch(() => {});
        endingByPass.delete(marker.id);
        if (spec) lines.push(`<strong>${label}</strong> — ${actor.name} is itself again.`);
        continue;
      }
      const roll = await new Roll(spec.die).evaluate();
      const row = turnTableRow(spec, roll.total);
      lines.push(turnTableLine(label, actor.name, roll.total, row, left - 1));
      let raised = [];
      const { fresh, standing } = splitTurnTableRows(row?.rows?.length && !row.unaffected ? row.rows : [], (key) => hasDirect(actor, key));
      if (standing.length) raised = await raiseStanding(actor, standing, label, lines);
      if (fresh.length) {
        const { applySpellEffects } = await import("./spell-effects.mjs");
        const caster = record.casterUuid ? await fromUuid(record.casterUuid).then((d) => d?.actor ?? d).catch(() => null) : null;
        const applied = [];
        // "THIS ROUND": each roll's behaviour is a 1-round spell effect, so
        // it ends on the world clock too if the turn table stops (combat over).
        const spell = { name: label, img: marker.img ?? "", uuid: null, system: { duration: "1 round", effects: fresh } };
        await applySpellEffects(caster ?? actor, spell, {
          targets: [actor], effects: fresh.map((r) => ({ ...r, target: "targets" })), lines: applied,
          saveDC: Number(record.dc) || 0, castId: turnTableRollTag(marker.id)
        });
        lines.push(...applied);
      }
      await marker.update?.({
        [`flags.${SYSTEM_ID}.${TURN_TABLE_FLAG}`]: { ...record, turnsLeft: left - 1, raised },
        // A ROLL IS A TURN IN COMBAT: from here the counted turns govern, so any world-clock end goes.
        [`flags.${SYSTEM_ID}.spellEffect`]: false
      })?.catch?.(() => {});
    }
  } catch (error) {
    console.error("TRG Prime | a turn table could not be rolled this turn", error);
  }
  return lines;
}

/** Markers this pass is ending itself (their roll already undone). */
const endingByPass = new Set();

/** Give each marker on these actors with no clock its remaining turns on the world clock. */
async function clockMarkersOf(actors) {
  const now = Number(globalThis.game?.time?.worldTime ?? 0);
  let n = 0;
  for (const actor of actors) {
    for (const marker of Array.from(actor?.effects ?? [])) {
      const record = marker?.flags?.[SYSTEM_ID]?.[TURN_TABLE_FLAG];
      if (!record || marker.disabled || marker.flags?.[SYSTEM_ID]?.spellEffect) continue;
      await marker.update?.({ [`flags.${SYSTEM_ID}.spellEffect`]: true, [`flags.${SYSTEM_ID}.spellEffectEnd`]: turnTableEndTime(now, record.turnsLeft) })?.catch?.(() => {});
      n += 1;
    }
  }
  return n;
}

/**
 * COMBAT OVER, TURNS LEFT (3.686.0; the Block 8a re-review): no turn starts
 * outside combat, so a marker left behind is given its world-clock end, its
 * remaining turns × 6 seconds, on the acting GM's client. The combat's
 * combatants and every token on its scene are swept. Hooks.on("deleteCombat")
 * in scripts/trg-prime.mjs.
 * @returns {Promise<number>} how many markers were clocked
 */
export async function clockTurnTablesAfterCombat(combat) {
  const { isActingGM } = await import("../acting-gm.mjs");
  if (!isActingGM()) return 0;
  const actors = new Set();
  for (const c of Array.from(combat?.combatants ?? [])) if (c?.actor) actors.add(c.actor);
  for (const t of Array.from(combat?.scene?.tokens ?? [])) if (t?.actor) actors.add(t.actor);
  return clockMarkersOf(actors);
}

/**
 * A COMBATANT REMOVED FROM THE TRACKER (the Block 8a re-review, H): its turns
 * are no longer counted, so its markers take the clock, unless it is still a
 * combatant in another started combat. Hooks.on("deleteCombatant"), acting GM.
 */
export async function clockTurnTablesOfCombatant(combatant) {
  const { isActingGM } = await import("../acting-gm.mjs");
  if (!isActingGM()) return 0;
  const actor = combatant?.actor;
  if (!actor || countsTurnsIn(actor, allCombats(), { except: combatant })) return 0;
  return clockMarkersOf([actor]);
}

/**
 * A MARKER GONE OTHERWISE THAN BY ITS LAST TURN (its world clock, its spell's
 * end, the GM): its last roll is undone — the roll's own conditions go, a rise
 * on a standing one comes off (the Block 8a re-review). On the acting client
 * for the creature. Hooks.on("deleteActiveEffect") in scripts/trg-prime.mjs.
 */
export async function onTurnTableMarkerDeleted(effect) {
  const record = effect?.flags?.[SYSTEM_ID]?.[TURN_TABLE_FLAG];
  const actor = effect?.parent;
  if (!record || !actor || endingByPass.has(effect.id)) return false;
  const { isActingClientFor } = await import("../acting-gm.mjs");
  if (!isActingClientFor(actor)) return false;
  await undoLastRoll(actor, effect.id, record);
  return true;
}

/** Take the world clock off each marker on these actors: their turns are counted now. */
async function unclockMarkersOf(actors) {
  let n = 0;
  for (const actor of actors) {
    for (const marker of Array.from(actor?.effects ?? [])) {
      if (!marker?.flags?.[SYSTEM_ID]?.[TURN_TABLE_FLAG] || marker.disabled || !marker.flags?.[SYSTEM_ID]?.spellEffect) continue;
      await marker.update?.({ [`flags.${SYSTEM_ID}.spellEffect`]: false, [`flags.${SYSTEM_ID}.-=spellEffectEnd`]: null })?.catch?.(() => {});
      n += 1;
    }
  }
  return n;
}

/**
 * A CREATURE JOINS A STARTED COMBAT (the Block 8a re-review, J): its turns are
 * counted from now, so a world clock laid before must go — it could fall at a
 * round change before its first roll. Hooks.on("createCombatant"), acting GM.
 */
export async function unclockTurnTablesOfCombatant(combatant) {
  const { isActingGM } = await import("../acting-gm.mjs");
  if (!isActingGM() || !combatant?.parent?.started || !combatant.actor) return 0;
  return unclockMarkersOf([combatant.actor]);
}

/**
 * A COMBAT STARTS (or turns a round): every combatant's turns are counted, so
 * their markers' world clocks go. Hooks.on("updateCombat") with a round
 * change, acting GM.
 */
export async function unclockTurnTablesOfCombat(combat, change = {}) {
  const { isActingGM } = await import("../acting-gm.mjs");
  if (!isActingGM() || !combat?.started || !("round" in (change ?? {}))) return 0;
  return unclockMarkersOf(Array.from(combat.combatants ?? []).map((c) => c?.actor).filter(Boolean));
}
