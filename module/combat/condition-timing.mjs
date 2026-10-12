/**
 * Whose clock is it — deciding when a NEW application may set, extend or
 * leave alone the expiry already sitting on a condition.
 *
 * NEW at 3.433.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD.
 *
 * Graham, 29 August 2026: "flat-footed vanished from a PC after they were
 * hit (before they acted)."
 *
 * `applyConditionTags` stamped its timing onto whatever effect currently
 * carried the status — found by `statuses.has(key)` — WITHOUT asking
 * whether it had placed that effect. A creature already Flat-Footed from
 * Chapter 4 Step 4 (which is deliberately untimed: it is shed at the
 * start of its owner's turn, by its own rule, and stamped
 * `initialFlatFooted` so that only that rule clears it) was then hit by
 * something whose outcome also inflicts Flat-Footed for a stated window.
 *
 * The hit did not create a second effect — the guard above it correctly
 * declines to — but it wrote its own countdown onto Step 4's effect
 * anyway. Reproduced live on 29 August 2026: a Flat-Footed carrying
 * `initialFlatFooted: true` and no expiry came out of one
 * `applyConditionTags` call carrying `conditionExpiresRound: 99`, and
 * `expireTimedConditions` deletes on that flag alone.
 *
 * So a rule that says "until you act" acquired a clock belonging to a
 * different rule, and whichever fired first won.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE CASES, AND ONLY ONE OF THEM WRITES A NEW CLOCK.
 *
 *   - WE PLACED IT. There was no such condition until this application,
 *     so the timing is ours to set. Stamp it.
 *   - IT WAS ALREADY THERE AND ALREADY TIMED. Two timed applications of
 *     one condition, so the LATER expiry wins: a second injury extends
 *     the first, and can never cut it short. "Bleeding for 3 more rounds"
 *     on top of "bleeding for 1" is four rounds of bleeding, not one.
 *   - IT WAS ALREADY THERE AND UNTIMED. Somebody else's rule owns it and
 *     has decided it has no clock — Step 4's Flat-Footed, a GM's
 *     hand-applied condition, a permanent injury. LEAVE IT ALONE. The
 *     new application still lands (the condition is already present,
 *     which is what it wanted), it simply does not get to impose a
 *     deadline on a condition it did not create.
 *
 * THAT THIRD CASE IS THE ONE THE OLD CODE GOT WRONG, and it got it wrong
 * in the direction that removes things early — which is always the worse
 * direction, because a condition that lingers is visible and a condition
 * that vanished is not.
 */

/**
 * The expiry a new application may write, or null for "write nothing".
 *
 * @param {object} options
 * @param {boolean} options.weApplied   this call created the effect
 * @param {number|null} options.existing the expiry already on it
 * @param {number|null} options.incoming the expiry this call wants
 * @returns {number|null} the expiry to write, or null to write none
 */
export function expiryToWrite({ weApplied = false, existing = null, incoming = null } = {}) {
  const wants = incoming === null || incoming === undefined ? null : Number(incoming);
  if (wants === null || Number.isNaN(wants)) return null;

  // We placed it, so the clock is ours to set.
  if (weApplied) return wants;

  const held = existing === null || existing === undefined ? null : Number(existing);
  // Somebody else's untimed condition. Not ours to put a deadline on.
  if (held === null || Number.isNaN(held)) return null;

  // Two clocks on one condition: the later one wins, so a second
  // application can only ever extend.
  return Math.max(held, wants);
}

/*
 * NO `mayWriteTiming` HELPER. One was written here so a caller could ask
 * "may I write?" separately from "what do I write?", and the
 * uncalled-export ratchet refused it the moment it existed — rightly:
 * `expiryToWrite` returning null IS the answer to both, and two ways to
 * ask one question is how two answers start to disagree.
 */
