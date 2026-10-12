/**
 * turn-records — clearing what a creature records about its own turn.
 *
 * NEW at 3.622.1 (the 3.622.0 drive's F4 and F6; Graham's R4 and R6 of
 * 5 October 2026, "your recommendation").
 *
 * AN UNLINKED TOKEN CANNOT UNSET WHAT IT INHERITS (F4). Its actor is its base
 * actor's data with the token's delta laid over it, and `unsetFlag` writes a
 * deletion into the DELTA — which removes the delta's own copy and leaves the
 * base actor's showing through. Ten world actors carried a per-turn trait
 * record written out of combat before 3.622.0 (one read `actions: 50`), and
 * every unlinked copy of such an actor kept it for ever: the start of each
 * turn "cleared" it and it was still there, so a Word spell was refused on
 * every turn. The cure is to overwrite, not delete, when a deletion leaves a
 * live value behind.
 *
 * THE MULTIPLE ATTACK PENALTY OUTLIVED THE FIGHT (F6). The counter was reset
 * only at the start of a combat turn, so the last turn's attacks were still
 * counted against the first attack after the combat ended. The end of a
 * combat now clears it, and the trait record with it.
 */

import { emptyTraitUsage } from "../traits.mjs";

const SYSTEM_ID = "trg-prime";
const ATTACK_COUNT_FLAG = "attackCount";
const TRAIT_USAGE_FLAG = "traitUsage";

/** Whether a per-turn trait record is as good as empty. */
export function traitUsageIsClear(record) {
  if (!record || typeof record !== "object") return true;
  return Object.entries(record).every(([, v]) => !v);
}

/** Whether an attack count is as good as zero. */
export function attackCountIsClear(value) {
  return !(Number(value) > 0);
}

/**
 * Clears one flag, overwriting with `empty` when the deletion leaves an
 * inherited value showing (an unlinked token over a base actor that holds
 * one). A record already clear costs no write.
 */
async function clearFlag(actor, key, isClear, empty) {
  if (!actor?.getFlag) return;
  if (isClear(actor.getFlag(SYSTEM_ID, key))) return;
  await actor.unsetFlag(SYSTEM_ID, key);
  if (!isClear(actor.getFlag(SYSTEM_ID, key))) await actor.setFlag(SYSTEM_ID, key, empty);
}

/** The per-turn trait record (Open, Flourish, Defence, Teleportation, Word). */
export async function clearTraitUsageRecord(actor) {
  await clearFlag(actor, TRAIT_USAGE_FLAG, traitUsageIsClear, emptyTraitUsage());
}

/** The multiple attack penalty's counter. */
export async function clearAttackCount(actor) {
  await clearFlag(actor, ATTACK_COUNT_FLAG, attackCountIsClear, 0);
}

/**
 * THE OPENING FLAT-FOOTED (3.622.2; the 3.622.1 drive's F3, Graham's R3).
 * A combatant is flat-footed until its first turn; one whose first turn never
 * came — the combat was ended first — kept it for good. The ids of the
 * stamped effects, by the stamp, never by status: a Flat-Footed from
 * anything else (a condition, a spell) is not the combat's to take away.
 */
function openingFlatFootedIds(effects = [], systemId = SYSTEM_ID) {
  return Array.from(effects ?? [])
    .filter((e) => e?.flags?.[systemId]?.initialFlatFooted === true)
    .map((e) => e.id);
}

/** Removes the combat's opening Flat-Footed from one creature. */
async function clearOpeningFlatFooted(actor) {
  const ids = openingFlatFootedIds(actor?.effects ?? []);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

/**
 * The creatures of a combat that has just ended, once each. A combatant whose
 * token has gone has no actor to clear.
 */
function combatActors(combat) {
  const seen = new Set();
  const out = [];
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant?.actor ?? null;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    out.push(actor);
  }
  return out;
}

/** The end of a combat clears its per-turn records (F6). GM only. */
export function registerTurnRecordHooks() {
  Hooks.on("deleteCombat", async (combat) => {
    if (!game.user?.isGM) return;
    for (const actor of combatActors(combat)) {
      try {
        await clearAttackCount(actor);
        await clearTraitUsageRecord(actor);
        await clearOpeningFlatFooted(actor);
      } catch (error) {
        console.error(`TRG Prime | ${actor.name}: the combat's turn records could not be cleared`, error);
      }
    }
  });
}
