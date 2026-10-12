/**
 * "Am I the client that should do this?"
 *
 * A hook fires on EVERY connected client. Work that changes the world —
 * creating a document, posting a card, sweeping a flag — must therefore
 * be done by exactly one of them, or it happens once per GM logged in.
 *
 * `game.user.isGM` IS THE WRONG GUARD, and it looks like the right one.
 * It answers "may I do this", not "should I be the one". With two GMs
 * connected — a common enough thing, and true of Graham's own world,
 * where a "Claude" GM sits alongside the "Gamemaster" — every isGM-
 * guarded hook runs twice. Found live at 3.255.0: each aura drew TWO
 * Regions, one per GM client, from a single token being placed.
 *
 * `game.users.activeGM` is Foundry's own answer: the one designated GM
 * client, stable while it stays connected, and reassigned when it goes.
 * Comparing against it is the standard idiom.
 *
 * THIS FILE EXISTS BECAUSE THE IDIOM WAS ALREADY HERE FOUR TIMES, in
 * three different spellings — migration.mjs, encumbrance-workflow.mjs,
 * documents/combat.mjs and the system's own world-time sweep each wrote
 * their own version, and a fifth (the aura hooks) reached for isGM
 * instead and got it wrong. One question, one answer.
 */

/**
 * Is this client the one that should perform world-changing work?
 *
 * Falls back to `isGM` when no active GM is designated — a lone GM in a
 * world Foundry has not yet assigned should still get their hooks, and
 * that fallback is what documents/combat.mjs already did.
 *
 * @returns {boolean}
 */
export function isActingGM() {
  const activeGM = game?.users?.activeGM;
  if (activeGM) return activeGM.id === game.user?.id;
  return Boolean(game?.user?.isGM);
}
