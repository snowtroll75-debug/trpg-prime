/**
 * SENSE MOTIVE (Chapter 4, page 92) — Detect Deception's lasting
 * penalty. Pure; no Foundry.
 *
 * NEW at 3.565.0.
 *
 *   "Fumble — As failure but you take a -4-circumstance penalty on all
 *    future Detect Deceptions check against the target UNTIL YOU ACHIEVE
 *    A CRITICAL SUCCESS against them using this skill."
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT IS PER TARGET, AND IT HAS NO CLOCK.
 *
 * Every other lasting state this project has built expires on time — an
 * immunity in seconds, a condition in rounds, a stance at the start of
 * your turn. This one ends on an EVENT and on nothing else, so it is
 * stored as a set of target ids on the reader rather than as a timestamp,
 * and nothing prunes it.
 *
 * THE KEY MUST NOT CONTAIN A DOT. Foundry's `setFlag` reads a dot in a
 * key as a path, so a raw Actor uuid ("Actor.CLlkeanjOvPI6Q0J") nests
 * the record one level deeper than every reader looks for it. That cost
 * this project a live test at 3.559.1 on temporary immunity, and
 * `attitude.mjs` met the same trap at 3.408.0. Third time: the key is
 * flattened here, in the pure module, so no caller can forget.
 */

/**
 * "-4-circumstance penalty on all future Detect Deception checks."
 *
 * MODULE-LOCAL. `misreadModifier` is the only thing that should ever
 * apply it, and an exported constant is a second way to reach the same
 * rule — the uncalled-export ratchet is right to refuse it.
 */
const MISREAD_PENALTY = -4;

/**
 * The flag key for one target, dot-free.
 *
 * @param {string} targetUuid
 * @returns {string} "" when there is no target to key on
 */
export function misreadKey(targetUuid) {
  return String(targetUuid ?? "").trim().replaceAll(".", "_").toLowerCase();
}

/**
 * Is the reader labouring under a misread against this target?
 *
 * @param {object} record the stored flag, key → true
 * @param {string} targetUuid
 * @returns {boolean}
 */
export function hasMisread(record, targetUuid) {
  const key = misreadKey(targetUuid);
  if (!key) return false;
  return Boolean(record?.[key]);
}

/**
 * The record after a Detect Deception resolves against this target.
 *
 * A FUMBLE SETS IT AND A CRITICAL CLEARS IT; every other degree leaves
 * it exactly as it was, including a plain Success. "Until you achieve a
 * critical success against them" is a high bar and the action is
 * untrained — a Success clearing it would make the penalty last one
 * check, which is not what the sentence says.
 *
 * RETURNS A NEW OBJECT, never a mutation of the one passed in: the
 * caller is holding a live document flag, and editing it in place is how
 * a write gets skipped because "nothing changed".
 *
 * @param {object} record
 * @param {string} targetUuid
 * @param {string} degree
 * @returns {object} the record to store
 */
export function withMisread(record, targetUuid, degree) {
  const key = misreadKey(targetUuid);
  const next = { ...(record ?? {}) };
  if (!key) return next;
  const outcome = String(degree ?? "");
  if (outcome === "fumble") next[key] = true;
  else if (outcome === "critical" || outcome === "heroic") delete next[key];
  return next;
}

/**
 * The update patch that makes a document's stored record match `next`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS FUNCTION EXISTS FOR, found by driving 3.565.0 live.
 *
 * `withMisread` is correct: on a Critical it returns the record with the
 * target's key REMOVED. The workflow then wrote that object back with
 * `setFlag` — and the key came back.
 *
 * FOUNDRY'S `setFlag` MERGES, it does not replace. Writing `{x}` over
 * `{x, y}` leaves `{x, y}`. Measured in the live world on 17 September
 * 2026:
 *
 *     setFlag({x:true, y:true})  then  setFlag({x:true})   ->  {x, y}
 *     update({"flags.….-=y": null})                        ->  {x}
 *
 * So the Critical printed "Your -4 against Luicen is cleared" on the
 * card while the -4 stayed on the sheet — the card asserting something
 * the data did not. `deletion.mjs` already records this whole family of
 * bug ("Every deletion in the system was a no-op at once, silently"),
 * and this write had walked straight past it.
 *
 * NO PURE CHECK COULD HAVE CAUGHT IT. `withMisread` returns exactly the
 * right object, and every assertion about it passes. What was wrong was
 * what Foundry did with that object afterwards.
 *
 * THE DELETION VALUE IS PASSED IN rather than imported, so this module
 * stays Foundry-free and the harness can pin the SHAPE of the patch —
 * that a removed key appears in it carrying the deletion, rather than
 * simply being absent, which is the whole difference.
 *
 * @param {object} held the record currently stored
 * @param {object} next the record that should be stored
 * @param {string} prefix the flag path the keys hang off
 * @param {*} deletion the value that deletes a key (see deletion.mjs)
 * @returns {object} an update payload, empty when nothing changed
 */
export function misreadFlagPatch(held, next, prefix, deletion) {
  const patch = {};
  const was = held ?? {};
  const now = next ?? {};
  for (const key of Object.keys(now)) {
    if (!was[key]) patch[`${prefix}.${key}`] = true;
  }
  for (const key of Object.keys(was)) {
    if (!(key in now)) patch[`${prefix}.${key}`] = deletion;
  }
  return patch;
}

/**
 * The modifier row a standing misread earns, or null.
 *
 * @param {object} record
 * @param {string} targetUuid
 * @param {string} targetName
 * @returns {{label: string, value: number, type: string}|null}
 */
export function misreadModifier(record, targetUuid, targetName = "") {
  if (!hasMisread(record, targetUuid)) return null;
  const who = String(targetName ?? "").trim();
  return {
    label: who ? `Misread ${who} before` : "Misread this creature before",
    value: MISREAD_PENALTY,
    type: "circumstance"
  };
}
