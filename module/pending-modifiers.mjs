/**
 * Modifiers a Skill Action has granted, waiting for the roll they apply to.
 *
 * Fifteen outcome rows across nine Skill Actions state a circumstance
 * bonus or penalty, and not one of them was applied to anything — a
 * player read the number off the chat card and remembered it, or didn't.
 *
 * They cannot simply be pushed into the bonus pools, because every one of
 * them is *scoped*. Treat Disease grants "+4 to its next saving throw
 * against the disease" — not to saves in general, and not for ever.
 * Detect Deception's fumble is "-4 on all future Detect Deception checks
 * against the target". Bluff's is "-4 to any future attempts to disbelieve
 * it". A pool entry would apply each of these to every roll of that kind
 * against everyone, permanently, which is worse than leaving it manual.
 *
 * So the system remembers the modifier, its wording and where it came
 * from, and offers it in the roll dialog the next time that character
 * rolls. Whether it applies to *this* roll is the one judgement the text
 * genuinely leaves to a person; the number, its type and its existence
 * are not, and those are what was being lost.
 *
 * Ticked ones are consumed if the outcome said "next" and kept if it said
 * "future" or gave a span of time.
 */
import { duplicateLasting } from "./combat/dedicated-rows.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "pendingModifiers";

/**
 * What a pending entry DOES to the roll it is ticked against.
 *
 * Until 3.587.0 there was only one answer — add a number — and an entry
 * that carried no number was refused at the door. Two spells print the
 * other answer: Disorient's Failure is "disadvantage on the next check"
 * and Clarity's is "advantage on the next mental saving throw". Clarity
 * shipped at 3.586.0 as a conditional lasting the whole duration with a
 * card note asking the player to dismiss it once used, because this
 * channel did not exist. A swing is not a modifier of value 0; it is a
 * different thing the dialog does with the tick, and it is reconciled
 * through `resolveBias` with everything else that swings, so one
 * advantage and one disadvantage cancel exactly as they should.
 */
export const PENDING_KINDS = Object.freeze({
  MODIFIER: "modifier",
  ADVANTAGE: "advantage",
  DISADVANTAGE: "disadvantage"
});

const PENDING_KIND_VALUES = Object.freeze(Object.values(PENDING_KINDS));

/**
 * Read a stored or supplied kind.
 *
 * Entries written before 3.587.0 carry no `kind` at all, and every one
 * of them is a modifier — so absence reads as MODIFIER rather than being
 * refused. An unrecognised string reads the same way: a stored flag is
 * data, and data that has drifted should degrade to the old behaviour,
 * not throw in a roll dialog.
 */
export function normalisePendingKind(raw) {
  const kind = String(raw ?? "").trim().toLowerCase();
  return PENDING_KIND_VALUES.includes(kind) ? kind : PENDING_KINDS.MODIFIER;
}

/** Every pending modifier on an actor. */
export function pendingModifiers(actor) {
  const stored = actor?.getFlag?.(SYSTEM_ID, FLAG);
  return Array.isArray(stored) ? stored : [];
}

/**
 * Record a modifier for later.
 *
 * @param {Actor} actor
 * @param {object} entry
 * @param {number} entry.value Signed; a penalty is negative.
 * @param {string} entry.type Bonus type, almost always "circumstance".
 * @param {string} entry.label Where it came from, e.g. "Treat Disease".
 * @param {string} entry.scope The outcome's own words about what it
 *   applies to — shown verbatim, because paraphrasing it is what would
 *   introduce the error.
 * @param {boolean} [entry.oneShot] Consumed when used.
 */
export async function addPendingModifier(actor, entry) {
  if (!actor) return null;
  const kind = normalisePendingKind(entry?.kind);
  const value = Math.trunc(Number(entry?.value)) || 0;
  // A modifier with no number is nothing; a swing HAS no number, and
  // refusing it for lacking one is how "disadvantage on the next check"
  // stayed unautomatable for two blocks.
  if (kind === PENDING_KINDS.MODIFIER && !value) return null;
  const existing = pendingModifiers(actor);
  // THE SAME LASTING MODIFIER IS OWED ONCE (3.666.3). Keldran carried ten
  // copies of one "-4 on all future Detect Deception checks", each offered
  // on every roll. See combat/dedicated-rows.mjs.
  const same = duplicateLasting({ ...entry, kind }, existing);
  if (same) return same;
  const turns = Number(entry?.turns);
  const record = {
    id: `${Date.now().toString(36)}-${existing.length}`,
    kind,
    value: kind === PENDING_KINDS.MODIFIER ? value : 0,
    type: kind === PENDING_KINDS.MODIFIER ? (entry.type || "circumstance") : "",
    label: String(entry?.label ?? "Skill Action"),
    scope: String(entry?.scope ?? ""),
    oneShot: Boolean(entry?.oneShot),
    // Pre-ticked when the entry's own scope leaves no judgement — see
    // `auto` in conditionals.mjs, which this deliberately copies.
    auto: Boolean(entry?.auto)
  };
  // Absent means no clock, which is what every entry written before
  // 3.587.0 has and what "future checks" genuinely means. Only a stated
  // span gets one.
  if (Number.isFinite(turns) && turns > 0) record.turnsRemaining = Math.trunc(turns);
  // SPENT MORE THAN ONCE (3.630.0): Unfold the Future's three Portents.
  const uses = Math.trunc(Number(entry?.uses) || 0);
  if (uses > 1 && record.oneShot) record.usesLeft = uses;
  // ONE KIND OF CHECK (3.650.0): "-2 to its next attack" waits for an attack.
  if (Array.isArray(entry?.checkTypes) && entry.checkTypes.length) record.checkTypes = entry.checkTypes.map((t) => String(t).toLowerCase());
  // ONE ACTION'S CHECKS (3.666.3): "-2 to Subsist checks for 1 week" is
  // offered on Subsist and nowhere else. See `pendingFitsCheck`.
  if (Array.isArray(entry?.actions) && entry.actions.length) record.actions = entry.actions.map(String);
  await actor.setFlag(SYSTEM_ID, FLAG, [...existing, record]);
  return record;
}

/**
 * How many of a creature's own end-of-turns "before the end of its next
 * turn" spans.
 *
 * Its next turn is the one AFTER the current one if it is taking a turn
 * right now, and the upcoming one otherwise — so the same sentence is
 * one end-of-turn or two depending on who is acting when it lands. The
 * rule is written here once rather than being worked out at each call
 * site, which is how the two would come to disagree.
 *
 * @param {boolean} isOwnTurn the target is the combatant currently acting
 */
export function pendingTurnsFor(isOwnTurn) {
  return isOwnTurn ? 2 : 1;
}

/**
 * Tick every clocked entry down one of the actor's turns and drop the
 * ones that have run out.
 *
 * Driven from TRGCombat._onEndTurn, because the spans these carry are
 * all written as "until the end of ... turn" — the end of the turn IS
 * the boundary, so measuring it anywhere else would be measuring a
 * different moment and calling it this one.
 *
 * Unclocked entries are untouched. "-4 on all FUTURE Detect Deception
 * checks against the target" does not end because a round went by, and
 * the header above says so.
 *
 * @returns {string[]} labels of whatever ran out, for the turn card
 */
export async function expirePendingModifiers(actor) {
  const entries = pendingModifiers(actor);
  if (!entries.length) return [];
  const expired = [];
  const kept = [];
  for (const entry of entries) {
    const left = Number(entry?.turnsRemaining);
    if (!Number.isFinite(left)) { kept.push(entry); continue; }
    const next = left - 1;
    if (next <= 0) { expired.push(String(entry.label ?? "Pending modifier")); continue; }
    kept.push({ ...entry, turnsRemaining: next });
  }
  if (!expired.length) return [];
  await actor.setFlag(SYSTEM_ID, FLAG, kept);
  return expired;
}

/** Remove specific pending modifiers by id. */
export async function consumePendingModifiers(actor, ids = []) {
  if (!actor || !ids.length) return;
  // An entry with uses left loses one rather than going (3.630.0).
  const remaining = [];
  for (const entry of pendingModifiers(actor)) {
    if (!ids.includes(entry.id)) { remaining.push(entry); continue; }
    const left = Number(entry.usesLeft);
    if (Number.isFinite(left) && left > 1) remaining.push({ ...entry, usesLeft: left - 1 });
  }
  await actor.setFlag(SYSTEM_ID, FLAG, remaining);
}

/**
 * Clear the lot — the roll dialog's "Clear all", offered beside the rows.
 *
 * THIS COMMENT USED TO SAY "and used by a full rest", and nothing called
 * it at all. Both halves were wrong, and the second one was wrong on
 * purpose-looking grounds: these entries carry their own scope in the
 * outcome's words, and "-4 on all FUTURE Detect Deception checks against
 * the target" does not end at dawn. Nothing records which are
 * time-bounded, so a rest cannot tell them apart and must not guess.
 */
export async function clearPendingModifiers(actor) {
  if (!actor) return;
  await actor.setFlag(SYSTEM_ID, FLAG, []);
}

/**
 * The dialog rows for an actor's pending modifiers.
 *
 * Returned as data rather than HTML so the same list can be rendered by
 * the check dialog and asserted by a test without a browser.
 */
export function pendingModifierRows(actor) {
  return pendingModifiers(actor).map((entry) => {
    const kind = normalisePendingKind(entry.kind);
    const swing = kind !== PENDING_KINDS.MODIFIER;
    return {
      ...entry,
      kind,
      // A swing has nothing to sign. The dialog prints `lead` in the
      // place the number used to sit, so the two shapes render through
      // one template rather than two.
      signed: swing ? "" : entry.value > 0 ? `+${entry.value}` : String(entry.value),
      lead: swing
        ? kind === PENDING_KINDS.ADVANTAGE ? "Advantage" : "Disadvantage"
        : `${entry.value > 0 ? `+${entry.value}` : String(entry.value)} ${entry.type}`.trim(),
      auto: Boolean(entry.auto),
      summary: (entry.scope ? `${entry.label}: ${entry.scope}` : entry.label)
        + (Number(entry.usesLeft) > 1 ? ` (${entry.usesLeft} left)` : "")
    };
  });
}

/**
 * Split ticked pending rows into what the check needs: the modifiers to
 * add, the bias kinds to reconcile, and the ids to spend.
 *
 * This exists so the check dialog stops hand-rolling the same loop. The
 * `applyConditionalSelections` twin next door has done it this way since
 * conditionals were built, and the two lists are now the same two shapes;
 * keeping one of them inline is how a swing would get added to `modifiers`
 * as a zero and silently do nothing.
 */
export function applyPendingSelections(rows = [], tickedIds = []) {
  const ticked = rows.filter((row) => tickedIds.includes(row.id));
  const modifiers = [];
  const kinds = [];
  const consume = [];

  for (const row of ticked) {
    const kind = normalisePendingKind(row.kind);
    if (kind === PENDING_KINDS.MODIFIER) {
      modifiers.push({ label: row.label, value: row.value, type: row.type });
    } else {
      kinds.push(kind);
    }
    // "Its next saving throw" is spent once. "Future checks" and spans of
    // time are not, so those stay on offer until cleared.
    if (row.oneShot) consume.push(row.id);
  }

  return { modifiers, kinds, consume };
}
