/**
 * A spell rung that hands its target something waiting for their NEXT
 * roll — a number, or a swing.
 *
 * NEW at 3.587.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A KIND AND NOT THREE NOTES.
 *
 * Disorient (page 261) prints a ladder made of advantage rather than
 * hit points:
 *
 *   Success  -1 circumstance to the NEXT check made before the end of
 *            their next turn
 *   Failure  the next check before the end of their next turn is made
 *            with DISADVANTAGE
 *   Fumble   disadvantage on ALL checks until the end of their next turn
 *
 * The first rung has been buildable since Skill Actions got pending
 * modifiers; the other two were not, because a pending entry carried a
 * VALUE and there was no channel for a swing. Clarity (page 254) hit the
 * same wall a block earlier and shipped at 3.586.0 as a conditional
 * lasting the spell's whole duration with a card note asking the player
 * to dismiss it once used — which is a note dressed as automation.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE THINGS A RUNG HAS TO SAY, AND ALL THREE ARE ON THE PAGE.
 *
 *   WHAT — a signed number of a bonus type, or advantage/disadvantage.
 *   HOW MANY ROLLS — "the next check" is one; "all checks" is every one
 *     until the clock runs out. That is `oneShot`, and it is not the
 *     same question as the clock.
 *   HOW LONG — "before the end of their next turn". Both of Disorient's
 *     first two rungs can go UNUSED, and an unused one has to stop being
 *     offered; a one-shot with no clock would sit in the dialog for the
 *     rest of the session.
 *
 * Those are three independent axes and the page sets each of them
 * separately, so the row does too. Collapsing any two is how the Fumble
 * rung — every roll, bounded — becomes unrepresentable.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SCOPE IS COPIED, NOT PARAPHRASED. `pending-modifiers.mjs` has said
 * since it was written that the wording is shown verbatim because
 * paraphrasing it is what would introduce the error. A row that cannot
 * say what it applies to in the page's words gets refused here rather
 * than reaching a player as an unlabelled tick box.
 */

const SWINGS = Object.freeze(["advantage", "disadvantage"]);

/** "until the end of their next turn", the only span these rungs print. */
export const PENDING_SPAN_NEXT_TURN = "endOfNextTurn";

const lower = (v) => String(v ?? "").trim().toLowerCase();

/**
 * Read a `pending` effect row into what `addPendingModifier` takes.
 *
 * @param {object} effect the authored row
 * @param {boolean} isOwnTurn the target is the combatant acting right now
 * @param {(own: boolean) => number} turnsFor pendingTurnsFor, injected so
 *   this file stays free of the flag store it feeds
 * @returns {object|null} null when the row cannot be honoured
 */
export function normalisePendingGrant(effect, isOwnTurn, turnsFor) {
  if (!effect || typeof effect !== "object") return null;

  const scope = String(effect.scope ?? "").trim();
  // No words, no row. See the header: an unlabelled tick box is worse
  // than a printed note, because it looks decided.
  if (!scope) return null;

  const swing = lower(effect.swing);
  const value = Math.trunc(Number(effect.value)) || 0;

  let kind = "modifier";
  if (swing) {
    if (!SWINGS.includes(swing)) return null;
    kind = swing;
  } else if (!value) {
    // A modifier rung with no number is not a rung. It is a typo.
    return null;
  }

  const grant = {
    kind,
    label: String(effect.label ?? "").trim(),
    scope,
    // "The next check" is spent; "all checks" is not. Default to spent,
    // because every rung that has wanted this so far says "next".
    oneShot: effect.oneShot === undefined ? true : Boolean(effect.oneShot),
    // Pre-ticked only when the row's own scope settles it. "All checks"
    // asks the player nothing; "the next check it makes" asks which roll
    // the player means, and that is theirs.
    auto: Boolean(effect.auto)
  };
  if (kind === "modifier") {
    grant.value = value;
    grant.type = String(effect.bonusType ?? "circumstance").trim() || "circumstance";
  }
  if (lower(effect.span) === lower(PENDING_SPAN_NEXT_TURN)) {
    const turns = typeof turnsFor === "function" ? Number(turnsFor(Boolean(isOwnTurn))) : NaN;
    // Out of combat there are no turns to count down, so the span cannot
    // be honoured and the entry simply has no clock — visible, which is
    // the safer of the two failures. See condition-timing.mjs.
    if (Number.isFinite(turns) && turns > 0) grant.turns = turns;
  }
  // A COUNT OF THEM, AND A SPAN IN TURNS (3.630.0) — Unfold the Future's
  // "three Portents … All unused Portents disappear when the spell ends"
  // (1 minute: ten of the creature's turns). One entry spent three times,
  // not three entries, so the dialog shows one box and "only one Portent
  // may be expended on a single check" holds by construction.
  const uses = Math.trunc(Number(effect.uses) || 0);
  if (uses > 1) grant.uses = uses;
  const span = Math.trunc(Number(effect.turns) || 0);
  if (span > 0 && !grant.turns) grant.turns = span;
  return grant;
}

/**
 * The card line for a granted entry.
 *
 * Says the scope in the page's words and, when there is one, that a
 * clock is running — because a tick box that quietly disappears two
 * turns later is the "silent nothing" shape in reverse.
 */
export function pendingGrantLine(targetName, grant) {
  if (!grant) return "";
  const what = grant.kind === "modifier"
    ? `${grant.value > 0 ? `+${grant.value}` : String(grant.value)} ${grant.type}`
    : grant.kind === "advantage" ? "advantage" : "disadvantage";
  const clock = grant.turns ? " It is offered in the roll dialog until then." : "";
  const count = grant.uses > 1 ? ` (${grant.uses} uses)` : "";
  return `${targetName}: ${what}${count} — ${grant.scope}.${clock}`;
}
