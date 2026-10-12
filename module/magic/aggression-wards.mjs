/**
 * TWO MORE THINGS AN ATTACK HAS TO GET PAST.
 *
 * NEW at 3.609.0. Pure; no Foundry. The gate that rolls and posts is
 * combat/sanctuary-gate.mjs, which already sits at every place an attack
 * or a targeted spell is committed — so these ride the same door rather
 * than asking each call site to remember a second one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * VISAGE OF HORROR (PP 14, page 337) — block 33's R6.
 *   "When any creature makes an aggressive move against the target, it
 *    must make a Will save. It is then temporarily immune until the end of
 *    its next turn.
 *      Success  The creature is unaffected.
 *      Failure  The creature becomes frightened 2 before using its action.
 *      Fumble   The creature becomes frightened 2, and its action fails and
 *               is wasted."
 *
 * SANCTUARY'S SHAPE WITH DIFFERENT RUNGS. The opponent rolls, at the moment
 * it swings, against the DC the spell was cast at. What differs is what
 * the rungs do and how long a roll lasts: Sanctuary remembers a pass for
 * the whole spell; this remembers ANY roll until the end of the opponent's
 * next turn, and then asks again. "Aggressive move" is read, as Graham's
 * R6 recommended, as an attack or a hostile spell aimed at the target —
 * the two things the gate already sees.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PAINFUL REBUKE (PP 8) — block 33's R2.
 *   "Each time the target makes an attack against you, targets you with a
 *    harmful spell, or otherwise takes and action that would harm you, it
 *    is affected based upon its save.
 *      Success  2d6 mental damage and then the spell ends.
 *      Failure  2d6 mental damage each time for 1 minute.
 *      Fumble   As failure, and the target also takes a Minor Critical."
 *
 * THE SAVE IS MADE AT THE CAST, by the rebuked creature; what it bought is
 * carried on that creature, naming the caster. The bite comes when it
 * turns on the caster, from the same door. A Fumble's Minor Critical is
 * read as part of each rebuke — "as failure, and" — so it lands every
 * time, which the release notes say.
 */

import { effectiveSaveDegree } from "./spell-degrees.mjs";

/** The marker a Visage effect carries, and where its memory lives. */
export const HORROR_WARD_FLAG = "horrorWard";
export const HORROR_MEMORY_FLAG = "horror";
/** The record a rebuked creature carries. */
export const REBUKE_FLAG = "rebuke";

export const HORROR = Object.freeze({ PASSED: "passed", FRIGHTENED: "frightened", WASTED: "wasted" });

const LADDER = Object.freeze([
  Object.freeze({ onSave: ["success"], outcome: HORROR.PASSED }),
  Object.freeze({ onSave: ["failure"], outcome: HORROR.FRIGHTENED }),
  Object.freeze({ onSave: ["fumble"], outcome: HORROR.WASTED })
]);

/** What a rolled degree does to the opponent. A save better than Success passes. */
export function horrorOutcome(rolled) {
  const key = effectiveSaveDegree(LADDER, rolled);
  return LADDER.find((row) => row.onSave.includes(key))?.outcome ?? HORROR.PASSED;
}

/**
 * Must this opponent save now?
 *
 * IMMUNE "UNTIL THE END OF ITS NEXT TURN": a roll in round r covers the
 * rest of round r and the opponent's turn in round r + 1. Outside combat
 * there are no turns to count, so every aggressive move asks again — the
 * safe direction, since the table can wave a second roll away.
 */
export function horrorMustSave(memory, attackerId, round) {
  const until = Number((memory ?? {})[String(attackerId)]);
  if (round === null || round === undefined || !Number.isFinite(until)) return true;
  return Number(round) > until;
}

/** The memory after this opponent rolled in `round`. */
export function horrorMemoryAfter(memory, attackerId, round) {
  const next = { ...(memory ?? {}) };
  if (round !== null && round !== undefined && Number.isFinite(Number(round))) {
    next[String(attackerId)] = Number(round) + 1;
  }
  return next;
}

/** A rebuke record as stored, or null. */
export function normaliseRebuke(raw) {
  if (!raw || typeof raw !== "object") return null;
  const casterUuid = String(raw.casterUuid ?? "").trim();
  const formula = String(raw.formula ?? "").trim();
  const type = String(raw.type ?? "").trim().toLowerCase();
  if (!casterUuid || !/^\d+(d\d+)?(\s*\+\s*\d+)?$/i.test(formula) || !type) return null;
  const critical = ["minor", "serious", "deadly"].includes(String(raw.critical ?? "").toLowerCase())
    ? String(raw.critical).toLowerCase() : null;
  return { casterUuid, casterName: String(raw.casterName ?? ""), formula, type, once: raw.once === true, critical,
    dc: Number(raw.dc) || null, label: String(raw.label ?? "Painful Rebuke") };
}

/** The rebukes this creature carries that bite when it turns on `casterUuid`. */
export function rebukesAgainst(records, casterUuid) {
  return (Array.isArray(records) ? records : [])
    .map((r) => ({ ...r, spec: normaliseRebuke(r.spec) }))
    .filter((r) => r.spec && r.spec.casterUuid === String(casterUuid ?? ""));
}
