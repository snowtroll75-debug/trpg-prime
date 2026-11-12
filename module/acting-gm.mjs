import { isGMConnectionWriter } from './gm-connection.mjs';
export { waitForGMConnection, gmConnectionState } from './gm-connection.mjs';

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
  if (activeGM && activeGM.id !== game.user?.id) return false;
  return Boolean(game?.user?.isGM) && isGMConnectionWriter();
}

/**
 * Is this USER the active GM — on any of its tabs? (3.686.2)
 *
 * For a question put to the GM, not for a write: every tab of the active
 * GM account shows the dialog and the first answer wins, as defence offers
 * and `askOwner` already do. The elected writer (`isActingGM`) may be a
 * tab out of sight, and a player would wait out the timeout for it. This
 * is 3.686.0's `isActingGM`, without the connection election.
 *
 * @returns {boolean}
 */
export function isActiveGMAccount() {
  const activeGM = game?.users?.activeGM;
  if (activeGM) return activeGM.id === game.user?.id;
  return Boolean(game?.user?.isGM);
}

/**
 * Is this client the one that should do world-changing work FOR THIS
 * DOCUMENT? (3.685.3)
 *
 * The acting GM when there is one, exactly as `isActingGM`. With NO GM
 * connected, `isActingGM` answers false on every client, so a hook guarded
 * by it does nothing at all — a player alone in the world went under water
 * with no Submerged effect. So, with no GM: exactly one of the connected
 * users who own the document, the one with the lowest user id, so every
 * client reaches the same answer without asking each other.
 *
 * @param {object} document anything with `testUserPermission` (an Actor)
 * @returns {boolean}
 */
export function isActingClientFor(document) {
  // A GM IS CONNECTED (or this client is one): exactly `isActingGM`'s answer.
  if (game?.users?.activeGM || game?.user?.isGM) return isActingGM();
  const me = game?.user?.id;
  if (!me || typeof document?.testUserPermission !== "function") return false;
  const owners = Array.from(game?.users ?? [])
    .filter((u) => u?.active && document.testUserPermission(u, "OWNER"))
    .map((u) => String(u.id))
    .sort();
  return owners[0] === me;
}
