/**
 * Ready (Chapter 4): "You prepare an action of no more than 2 AP
 * that will occur outside of your turn and a trigger which will
 * prompt that action. Your turn then ends. If the trigger does not
 * occur before the beginning of your next turn, then the action is
 * wasted. If, however, the trigger does occur before the start of
 * your next turn, you may use the chosen action as a reaction."
 *
 * Scoped deliberately. The trigger itself is inherently narrative —
 * "if the goblin moves," "if the door opens" — this system has no
 * way to mechanically watch for an arbitrary condition, so it's
 * recorded as free text and left for the table to judge when it
 * occurs, the same as "helpless" and other narrative prerequisites
 * elsewhere in this audit. Readying is scoped to basic and skill
 * actions specifically, which all already share resolveAction as a
 * single entry point — a weapon Strike goes through a separate
 * workflow entirely and isn't offered as a choice here.
 *
 * "Your action is subject to any applicable bonuses and penalties
 * that are currently affecting you (such as multiple attack
 * penalties)" doesn't need a snapshot mechanism: within this
 * system's own turn structure, something like Multiple Attack
 * Penalty can't actually change between readying and the trigger
 * firing, since it only resets at the start of the readying actor's
 * *own* next turn — which is exactly the same moment the readied
 * action itself expires if unused. Invoking the stored action
 * through the normal resolveAction pipeline when the trigger fires
 * already picks up whatever's currently affecting the actor, and
 * that's the same thing the rulebook is describing.
 */

const SYSTEM_ID = "trg-prime";
const READY_FLAG = "readiedAction";

/**
 * Whether an action's own AP cost qualifies for Ready — "no more
 * than 2 AP." Free actions qualify trivially.
 *
 * @param {string|number} apCost
 * @returns {boolean}
 */
export function isReadyEligible(apCost) {
  const normalised = String(apCost ?? "").trim().toLowerCase();
  if (normalised === "free" || normalised === "reaction" || normalised === "") return true;
  const value = Number(normalised);
  return Number.isFinite(value) && value >= 0 && value <= 2;
}

/**
 * Whether this actor currently has a readied action pending.
 *
 * @param {Actor} actor
 * @returns {object|null} The stored {actionKey, invokedSkillKey, trigger}, or null.
 */
export function readiedAction(actor) {
  return actor.getFlag(SYSTEM_ID, READY_FLAG) ?? null;
}

/**
 * Stores the readied action and trigger, and ends the actor's turn —
 * "Your turn then ends."
 *
 * @param {Actor} actor
 * @param {Combat} combat
 * @param {{actionKey: string, invokedSkillKey: string|null, trigger: string}} choice
 * @returns {Promise<void>}
 */
export async function readyActionAndEndTurn(actor, combat, choice) {
  await actor.setFlag(SYSTEM_ID, READY_FLAG, choice);
  await combat.nextTurn();
}

/**
 * Clears the readied action without using it — "if the trigger does
 * not occur before the beginning of your next turn, then the action
 * is wasted." Called from _onStartTurn; a no-op if nothing is
 * readied.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether a readied action was actually cleared.
 */
export async function expireStaleReadiedAction(actor) {
  if (!readiedAction(actor)) return false;
  await actor.unsetFlag(SYSTEM_ID, READY_FLAG);
  return true;
}

/**
 * Clears the readied action after it's used.
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function consumeReadiedAction(actor) {
  await actor.unsetFlag(SYSTEM_ID, READY_FLAG);
}
