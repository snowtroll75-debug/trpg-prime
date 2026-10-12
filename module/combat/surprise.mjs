/**
 * The Surprise round (Chapter 4, Steps 2-4). Kept as pure logic here,
 * separate from the actual Foundry combat-flow wiring
 * (module/documents/combat.mjs), same separation used throughout
 * this system (attack.mjs vs attack-workflow.mjs, and so on).
 *
 * Three distinct rules worth keeping straight, since the rulebook's
 * own wording intertwines them but they're independently true:
 *
 * 1. Surprise (Step 2): "If neither side tries to be stealthy, they
 *    automatically notice each other" — no one is surprised, and (per
 *    below) no separate surprise round happens at all.
 * 2. The surprise round itself (Step 3): only characters who are NOT
 *    surprised may act in it, capped at 2 AP each — everyone else is
 *    skipped entirely for this round.
 * 3. Round 1's general Flat-Footed rule (Step 4): "All combatants are
 *    considered to be Flat-Footed until they have acted for the first
 *    time" — this applies to everyone, surprised or not, and isn't
 *    conditional on a surprise round happening at all.
 */

/**
 * Whether a surprise round should actually happen. Per the
 * rulebook's own logic: pointless unless there's a genuine split —
 * at least one combatant unaware (surprised) and at least one aware
 * enough to act early (not surprised). If no one is surprised, there's
 * nothing to distinguish round 1 with. If everyone is surprised,
 * there's no one left to act in a surprise round anyway.
 *
 * @param {number} surprisedCount
 * @param {number} unsurprisedCount
 * @returns {boolean}
 */
export function surpriseRoundApplies(surprisedCount, unsurprisedCount) {
  return surprisedCount > 0 && unsurprisedCount > 0;
}

/**
 * Whether this specific combatant's turn should be skipped during an
 * active surprise round — true only for surprised combatants while
 * the surprise round is actually in effect.
 *
 * @param {boolean} isSurprised
 * @param {boolean} surpriseRoundActive
 * @returns {boolean}
 */
export function shouldSkipDuringSurpriseRound(isSurprised, surpriseRoundActive) {
  return Boolean(surpriseRoundActive) && Boolean(isSurprised);
}

/** The surprise round is round one; normal play begins at round two. */
export const SURPRISE_ROUND = 1;

/**
 * Full Defence's printed AP cost, named here because Ambush Awareness's
 * whole effect is measured against it. Asserted against the basic-action
 * table by the harness, so the two cannot drift apart.
 */
export const FULL_DEFENCE_AP = 3;

/**
 * Is the surprise round actually in force for a turn starting now?
 *
 * THE FLAG ALONE IS NOT ENOUGH, because the flag is raised and lowered
 * by a document whose turn-start fires in the middle of both operations.
 * Live testing on 12 Aug 2026 found the same off-by-one at each end of
 * the round:
 *
 *   - raised too late — `super.startCombat()` began the FIRST combatant's
 *     turn before the flag went up, so they got a full pool;
 *   - lowered too late — `super.nextTurn()` began the first turn of ROUND
 *     TWO before the flag came down, so that combatant was still capped.
 *
 * The first was fixed by moving the flag. The second is fixed here
 * instead, by asking a question with a second, independent answer in it:
 * **the surprise round is round one**. A turn starting in round two is
 * not in a surprise round however the flag happens to be sitting at that
 * instant, and no amount of reordering can make it one.
 *
 * @param {boolean} flagActive the combat's `surpriseRoundActive` flag
 * @param {number} round the round the turn is starting in
 * @returns {boolean}
 */
export function surpriseRoundInEffect(flagActive, round) {
  return Boolean(flagActive) && (Number(round) || 0) <= SURPRISE_ROUND;
}

/**
 * AP granted for the turn — capped at 2 during an active surprise
 * round ("up to 2 AP worth of actions"), otherwise whatever the
 * normal turn-start regain already computed.
 *
 * @param {number} normalAP
 * @param {boolean} surpriseRoundActive
 * @returns {number}
 */
export function apForTurn(normalAP, surpriseRoundActive, ambushAwareness = false) {
  const normal = Math.max(0, Number(normalAP) || 0);
  if (!surpriseRoundActive) return normal;

  // AMBUSH AWARENESS (Chapter 5), on Graham's ruling of 20 Aug 2026: the
  // feat "allows the character to use Full Defence (and only Full
  // Defence) despite the increased AP cost."
  //
  // Full Defence costs 3 and the surprise round caps AP at 2, so without
  // this the feat buys a character a turn they cannot spend — not
  // skipped any more, and still unable to afford the one action it lets
  // them take. Capping at the cost of that action, rather than handing
  // over a full pool, is what keeps "and only Full Defence" true in the
  // one place the system can enforce it: they can afford exactly this.
  if (ambushAwareness) return Math.min(FULL_DEFENCE_AP, normal);
  return Math.min(2, normal);
}

/**
 * Ambush Awareness (Chapter 5): "If you are unable to act in the surprise
 * round because you failed a Perception check, you can still act on your
 * initiative count in the surprise round, but only to take the Full
 * Defence action."
 *
 * The machinery already skips surprised combatants outright, so the feat
 * is expressed by NOT skipping this one. Pure, and separate from the skip
 * rule above, because the two answer different questions: that one is the
 * general rule, this one is the exception a character bought.
 *
 * @param {boolean} isSurprised
 * @param {boolean} surpriseRoundActive
 * @param {boolean} hasAmbushAwareness
 * @returns {boolean}
 */
export function shouldSkipWithAmbushAwareness(isSurprised, surpriseRoundActive, hasAmbushAwareness) {
  if (hasAmbushAwareness) return false;
  return shouldSkipDuringSurpriseRound(isSurprised, surpriseRoundActive);
}

/**
 * Surprise Attack (Chapter 5): "All opponents are flat-footed to you in
 * the surprise round regardless of whether they have acted or not."
 *
 * NOT A CONDITION ON THE TARGET. Round one's Flat-Footed is shed at the
 * start of each combatant's own turn, so by the time a character acts,
 * anyone above them in the order has already lost it. This feat says
 * they are flat-footed TO YOU, which is a property of the pairing rather
 * than of either creature — so it is resolved at the attack, where both
 * are known, and never written onto the target.
 *
 * @param {boolean} hasFeat
 * @param {boolean} surpriseRoundActive
 * @returns {boolean}
 */
export function surpriseAttackApplies(hasFeat, surpriseRoundActive) {
  return Boolean(hasFeat) && Boolean(surpriseRoundActive);
}

/**
 * How much of the target's Defence Surprise Attack gives back to this
 * attacker.
 *
 * Being flat-footed costs a creature its Dexterity in Defence, and
 * `system.combat.defence.ability` holds exactly that contribution — it is
 * ALREADY ZERO on a creature that really is flat-footed, so a target who
 * has not yet acted contributes nothing here and cannot be counted twice.
 *
 * Pure, and separate from the attack workflow, because the two mutations
 * that first escaped this feature both lived in the arithmetic: a version
 * that pushed the bonus unconditionally, and one that pushed it while
 * doing nothing. A string in a source file cannot tell those apart; a
 * number can.
 *
 * @param {number} dexToDefence the target's `defence.ability`
 * @param {boolean} applies from `surpriseAttackApplies`
 * @returns {number} the bonus to add to the attack, or 0
 */
export function surpriseAttackDefenceBonus(dexToDefence, applies) {
  if (!applies) return 0;
  return Math.max(0, Number(dexToDefence) || 0);
}
