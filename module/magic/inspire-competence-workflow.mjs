/**
 * The Foundry side of INSPIRE COMPETENCE (see inspire-competence.mjs for
 * the rule and for Graham's Aid ruling of 31 August 2026).
 *
 * NEW at 3.448.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SAME ROAD COUNTER PERFORM TOOK, and deliberately so.
 *
 * A number earned by a cast, left waiting on somebody else, and spent by
 * their next check of a named type, is a shape this system has now built
 * three times: Cutting Words' penalty, Counter Perform's bonus, and this.
 * All three are spent in `dice/check.mjs`'s `evaluate` — the one place
 * every check in the system passes through — because that is the only
 * point at which a modifier can reach the roll BEFORE the outcome is
 * built, which is where Cutting Words failed the first time it shipped.
 */

import {
  INSPIRE_COMPETENCE_FLAG, inspireCompetenceRecord
} from "./inspire-competence.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Leave the bonus waiting on the ally.
 *
 * WRITTEN TO THE TOKEN'S OWN ACTOR, which is what the caller hands over:
 * an unlinked token has its own actor document, and writing to the base
 * actor would encourage every goblin sharing that stat block.
 *
 * A SECOND CAST KEEPS THE LARGER, rather than stacking. The bonus is
 * circumstance-typed, so Appendix 1's highest-wins rule governs two of
 * them wherever they land; keeping the larger here means the flag says
 * what the pool would have said.
 *
 * @param {Actor} target the actor behind the targeted token
 * @returns {Promise<object>} what is now waiting
 */
export async function recordInspireCompetence(target, { bonus = 1, casterName = "", round = null } = {}) {
  if (!target) return null;
  const record = inspireCompetenceRecord({ bonus, casterName, round });
  const held = target.getFlag(SYSTEM_ID, INSPIRE_COMPETENCE_FLAG) ?? null;
  if (held && Number(held.bonus) >= record.bonus) return held;
  await target.setFlag(SYSTEM_ID, INSPIRE_COMPETENCE_FLAG, record);
  return record;
}

/** What this creature is carrying, or null. */
export function pendingInspireCompetence(actor) {
  return actor?.getFlag?.(SYSTEM_ID, INSPIRE_COMPETENCE_FLAG) ?? null;
}

/**
 * Take the spent bonus off the creature.
 *
 * CLEARED WHETHER OR NOT IT CHANGED THE OUTCOME — the encouragement was
 * spent on the check it was spent on, even if a larger circumstance
 * bonus won the pool.
 *
 * SWALLOWS ITS OWN FAILURE, deliberately: this runs inside a roll that
 * has already happened, and throwing here would lose the player their
 * card to tidy up a flag.
 */
export async function consumeInspireCompetence(actor) {
  if (!actor?.unsetFlag) return;
  try {
    await actor.unsetFlag(SYSTEM_ID, INSPIRE_COMPETENCE_FLAG);
  } catch (error) {
    console.error("TRG Prime | Could not clear a spent Inspire Competence bonus", error);
  }
}
