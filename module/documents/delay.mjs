/**
 * Delay (Chapter 4): "By choosing to Delay, you temporarily remove
 * yourself from the current initiative order... You do not take any
 * further actions until you decide to return to the initiative
 * order, which you can do as a free action triggered by the end of
 * any other creature's turn. When you return to the initiative
 * order, your initiative permanently changes to the new position...
 * if you choose to Delay for an entire round without returning to
 * the initiative order, the actions you had Delayed are lost.
 * Additionally, your initiative remains unchanged, and your next
 * turn occurs at your original position in the initiative order."
 *
 * Built entirely on mechanisms this codebase already has, rather
 * than new combat-tracker machinery: Foundry re-sorts the turn order
 * automatically whenever a combatant's initiative value changes, and
 * this project's own rollInitiative already re-points the active
 * turn index at a specific combatant after such a re-sort ("preserve
 * whose turn it is across the re-sort"). Returning from Delay is the
 * same operation aimed at a different combatant.
 *
 * Entering Delay needs no special turn-order logic at all: it's
 * simply calling nextTurn() immediately, exactly as if the delaying
 * combatant had ended a normal turn without acting. They're never
 * removed from the turn order, just skipped once — which is why the
 * expiry case ("Delay for an entire round without returning") needs
 * no active skipping either: their combatant entry naturally comes
 * up again on its own next round, at which point _onStartTurn simply
 * clears the stale flag and they get a normal turn.
 */

const SYSTEM_ID = "trg-prime";
const DELAYED_FLAG = "delayed";

/**
 * The initiative value a returning combatant should take: just below
 * the currently active combatant's own initiative, so Foundry's own
 * sort places them immediately after — "triggered by the end of any
 * other creature's turn."
 *
 * @param {number} currentCombatantInitiative
 * @returns {number}
 */
export function delayReturnInitiative(currentCombatantInitiative) {
  return Number(currentCombatantInitiative || 0) - 0.01;
}

/**
 * Enters Delay: flags the combatant, then advances the turn — no
 * different from ending a normal turn, since Delay takes no actions
 * right now.
 *
 * @param {Combat} combat
 * @param {Combatant} combatant
 * @returns {Promise<void>}
 */
export async function enterDelay(combat, combatant) {
  await combatant.setFlag(SYSTEM_ID, DELAYED_FLAG, true);
  await combat.nextTurn();
}

/**
 * Returns from Delay: re-points this combatant's initiative to sort
 * immediately after whoever's turn is currently active, clears the
 * Delayed flag, and jumps the active turn index to them so they act
 * right now — matching "triggered by the end of any other creature's
 * turn... your initiative permanently changes to the new position."
 *
 * @param {Combat} combat
 * @param {Combatant} combatant The delayed combatant returning.
 * @returns {Promise<void>}
 */
export async function returnFromDelay(combat, combatant) {
  const currentInitiative = Number(combat.combatant?.initiative ?? 0);
  const newInitiative = delayReturnInitiative(currentInitiative);

  await combatant.update({ initiative: newInitiative });
  await combatant.unsetFlag(SYSTEM_ID, DELAYED_FLAG);

  // Preserve-turn-across-re-sort — the same pattern rollInitiative
  // already uses.
  const turn = combat.turns.findIndex((t) => t.id === combatant.id);
  if (turn >= 0) await combat.update({ turn });
}

/**
 * Clears a stale Delayed flag once the delaying combatant's own next
 * turn naturally comes back around without them having returned —
 * "the actions you had Delayed are lost... your next turn occurs at
 * your original position." Called from _onStartTurn; a no-op if the
 * combatant isn't (or is no longer) delayed.
 *
 * @param {Combatant} combatant
 * @returns {Promise<void>}
 */
export async function expireStaleDelay(combatant) {
  if (!combatant?.getFlag(SYSTEM_ID, DELAYED_FLAG)) return;
  await combatant.unsetFlag(SYSTEM_ID, DELAYED_FLAG);
}

/**
 * Whether this actor is currently in the Delayed state, per their
 * combatant entry in the given combat.
 *
 * @param {Combat|null} combat
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isActorDelayed(combat, actor) {
  const combatant = combat?.combatants?.find((c) => c.actor?.id === actor.id);
  return Boolean(combatant?.getFlag(SYSTEM_ID, DELAYED_FLAG));
}
