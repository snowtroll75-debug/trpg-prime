/**
 * "Should THIS client run this piece of combat automation?" — asked two
 * different ways, because it is two different questions.
 *
 * NEW at 3.430.1. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD.
 *
 * Graham, 28 August 2026:
 *
 *   "1. No surprise round is being prompted at the start of a combat.
 *    2. Actors are not beginning the fight flat-footed.
 *    You should not be disabling rules that work!"
 *
 * Both were caused by ONE expression — `TRGCombat.automates`, which read
 * `turnAutomation && isActingGM()` — evaluating false on the GM's own
 * client, silently, with no error anywhere.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RIGHT IDIOM IN THE WRONG PLACE.
 *
 * `acting-gm.mjs` exists for a good reason and states it well: a HOOK
 * fires on every connected client, so world-changing work inside one
 * must be done by exactly one of them or it happens once per GM logged
 * in. That is correct, and `_onStartTurn` and `_onEndTurn` need it —
 * this Foundry build's `_manageTurnEvents` is not gated on the active GM,
 * so those callbacks really do run everywhere.
 *
 * `startCombat()` and `nextTurn()` ARE NOT HOOKS. They are methods, run
 * on the one client whose user clicked the button. Asking them "am I the
 * DESIGNATED GM client?" answers a question nobody posed, and answers it
 * wrongly the moment a second GM connects: `game.users.activeGM` picks
 * one GM, and every other GM — including the person actually running the
 * game — silently gets no automation at all.
 *
 * WHAT MADE IT INVISIBLE, and it is the same sentence combat/target-relay
 * already records about a permission defect found in Graham's live
 * session: "every automated pass this project has run drove combat as a
 * GM, who can write to anything." Here it is narrower and worse — every
 * pass drove combat as the seat that happened to BE `activeGM`, so the
 * failing branch was unreachable by the method used to test it.
 *
 * MY OWN TEST SEAT WAS THE SECOND GM. Graham's world holds two GM users,
 * "Gamemaster" (his) and "Testing Dude" (the seat these sessions drive
 * live testing from). `game.users.activeGM` resolved to Testing Dude for
 * as long as that client stayed connected, so the automation ran happily
 * on the tab nobody was looking at and not at all on the one he was
 * playing in. The rules were never disabled; they were being performed
 * for an empty chair.
 *
 * A GUARD THAT CANNOT FAIL LOUDLY IS A GUARD THAT MUST BE RIGHT. Both
 * call sites read `if (!automates) return`, so being wrong produces
 * nothing at all: no prompt, no condition, no warning, no console line.
 * That is why this is worth a file and a name rather than a changed
 * expression.
 */

/**
 * For work reached by a method the user's own click invoked.
 *
 * `startCombat`, `nextTurn` — Foundry runs these on ONE client already,
 * the one that called them. There is nothing to de-duplicate, so the
 * only question left is permission: may this user drive combat?
 *
 * @param {object} options
 * @param {boolean} options.enabled the `turnAutomation` setting
 * @param {boolean} options.isGM `game.user.isGM`
 * @returns {boolean}
 */
export function automatesInvoked({ enabled = false, isGM = false } = {}) {
  return Boolean(enabled) && Boolean(isGM);
}

/**
 * For work reached by a callback that fires on EVERY connected client.
 *
 * `_onStartTurn`, `_onEndTurn` — every client runs these, so exactly one
 * of them must do the world-changing part or a two-GM table applies each
 * turn's bookkeeping twice. This is `acting-gm.mjs`'s question, asked
 * where it is actually the right one.
 *
 * @param {object} options
 * @param {boolean} options.enabled the `turnAutomation` setting
 * @param {boolean} options.isActingGM `isActingGM()`
 * @returns {boolean}
 */
export function automatesBroadcast({ enabled = false, isActingGM = false } = {}) {
  return Boolean(enabled) && Boolean(isActingGM);
}

/*
 * NO `invokedSurvivesASecondGM` HELPER. One was written here, meaning to
 * state the defect as data — and both sides of its comparison were the
 * same expression, so it could only ever return true. A function that
 * cannot fail is the vacuous-anchor shape this project has now found
 * nine times, and writing one INSIDE the fix for a guard that failed
 * silently would have been the same mistake twice in one file.
 *
 * The property it was reaching for is real, and it is stated where it
 * can actually fail: verify-turn-automation asserts that
 * `automatesInvoked` does not take `isActingGM` at all — a decision that
 * cannot consult the second GM cannot be changed by one.
 */
