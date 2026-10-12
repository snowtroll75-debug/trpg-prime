/**
 * WHEN A SPELL'S REGION STOPS EXISTING.
 *
 * NEW at 3.500.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE HALF 3.480.0 DID NOT DO.
 *
 * `area-region-life.mjs` made a placed Region TEMPORARY UNLESS SOMETHING
 * CLAIMS IT, and that stopped 113 of the pack's 152 area spells littering
 * the scene on every cast. It said nothing about the ones that DO claim
 * theirs, and nothing ever deleted those — so six spells still leave a
 * Region behind for ever, and every one of them prints a finite duration:
 *
 *   Wall Of Thorns            10 minutes
 *   Nexus Of Elemental Energy  1 minute
 *   Spike Stones               1 hour
 *   Consecrate                 1 day
 *   Desecrate                  1 day
 *   Verdant Retribution        1 minute
 *
 * NOT ONE OF THEM IS PERMANENT BY DESIGN. The Region was claimed because
 * the mechanism reads it, and the mechanism stops when the spell does —
 * so what was missing was never a reason to keep the Region, only a
 * moment to let it go. Found on 5 September 2026 while scoping the
 * terrain pair, which would have walked into the same gap: a one-minute
 * illusion outliving the session it was cast in.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE STAMP IS THE ONE THAT ALREADY EXISTS.
 *
 * `endsStamp` and `endsHaveElapsed` were written for emanations at
 * 3.430.0 and widened to active spells at 3.494.0. A Region is the third
 * thing to wear the same clock, and it asks the same two functions rather
 * than growing a copy that agrees with them only until somebody edits
 * one — which is the argument spell-ends.mjs makes in its own header.
 *
 * TWO CLOCKS, FOR THE REASON RAGE AND THE WARD BOTH RECORD: a spell cast
 * in an encounter counts rounds and the same spell cast in a corridor
 * counts seconds, so the sweep runs at the start of a turn AND on
 * `updateWorldTime`. Consecrate's day will never elapse inside a combat;
 * Verdant Retribution's minute may never see the world clock move.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AN UNSTAMPED REGION IS LEFT ALONE, and that is deliberate.
 *
 * A duration nothing can count — "varies", or a Sustained-word spell
 * whose ending is the lapse sweep's business, or an emanation which
 * `emanation-workflow` already deletes by its own path — gets no stamp,
 * and this sweep never touches it. Deleting on a clock nobody set would
 * take a GM's hand-placed Region out from under them, which is a worse
 * failure than the litter this fixes: litter is invisible and annoying,
 * and a wall that vanishes mid-fight is a rules dispute.
 *
 * THAT IS ALSO WHY THE SWEEP ONLY EVER TOUCHES REGIONS IT STAMPED. The
 * flag is the permission: no flag, no opinion.
 */

import { endsHaveElapsed } from "./spell-ends.mjs";

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** Written on a Region the moment a cast claims it. */
export const REGION_EXPIRY_FLAG = "spellRegion";

/**
 * The record a claimed Region wears.
 *
 * THE SPELL'S NAME TRAVELS WITH IT so the sweep can say what went. A
 * Region vanishing with no line is the same silence `castRefundedLine`
 * was written to end — indistinguishable, from the table's side, from
 * something having broken.
 *
 * @param {object} options
 * @param {string} options.castId the cast that placed it
 * @param {string} options.spellName for the line the sweep prints
 * @param {object|null} options.ends an `endsStamp`, or null for no clock
 */
export function regionExpiryRecord({ castId = "", spellName = "", ends = null } = {}) {
  return {
    castId: text(castId),
    spellName: text(spellName) || "A spell",
    ends: normaliseEnds(ends)
  };
}

/** An `endsStamp` read back off a document, or null. */
function normaliseEnds(raw) {
  if (!raw || typeof raw !== "object") return null;
  const byTime = raw.endsAtWorldTime == null ? null : int(raw.endsAtWorldTime);
  const byRound = raw.endsOnRound == null ? null : int(raw.endsOnRound);
  // THE SAME REFUSAL `endsStamp` MAKES. A stamp of two nulls is not a
  // clock, and storing one would leave the sweep asking about it forever.
  if (byTime === null && byRound === null) return null;
  return { endsAtWorldTime: byTime, endsOnRound: byRound };
}

/**
 * A stored record, or null when the Region is not one of ours.
 *
 * `castId` IS NOT REQUIRED. A Region placed before this release, or by a
 * path that has no cast id to give, is still ours to expire if it carries
 * a clock — the id is for tracing, not for permission.
 */
export function normaliseRegionExpiry(raw) {
  if (!raw || typeof raw !== "object") return null;
  return regionExpiryRecord(raw);
}

/**
 * Is this Region's time up?
 *
 * @param {object|null} record the stored record
 * @param {object} now {worldTime, round}
 */
export function regionHasExpired(record, { worldTime = null, round = null } = {}) {
  // ONE LINE, BECAUSE THE GUARD THAT STOOD HERE WAS DEAD.
  // `if (!parsed?.ends) return false;` read as care and proved nothing:
  // `endsHaveElapsed` opens with its own `if (!ends) return false`, so
  // every input the guard refused was already refused one call later, and
  // `mutate-region-expiry` removed it without breaking a single check.
  // The rule target-count.mjs set stands — a guard nothing can reach is
  // one nobody should trust.
  return endsHaveElapsed(normaliseRegionExpiry(record)?.ends, { worldTime, round });
}

/**
 * Which of these Regions should go now.
 *
 * TAKES THE FLAGS, NOT THE DOCUMENTS, so the whole decision is driveable
 * without a canvas — the shape `sweepActiveSpellExpiry` could not take
 * and had to be tested through Foundry instead.
 *
 * @param {Array<{id: string, record: object|null}>} regions
 * @param {object} now {worldTime, round}
 * @returns {Array<{id: string, spellName: string}>}
 */
export function expiredRegions(regions, { worldTime = null, round = null } = {}) {
  const out = [];
  for (const entry of Array.isArray(regions) ? regions : []) {
    if (!entry?.id) continue;
    if (!regionHasExpired(entry.record, { worldTime, round })) continue;
    out.push({ id: entry.id, spellName: normaliseRegionExpiry(entry.record).spellName });
  }
  return out;
}

/** What the sweep says when a Region's time is up. */
export function regionExpiredLine(spellName) {
  return `<strong>${spellName}</strong>'s area disperses — its duration is spent.`;
}
