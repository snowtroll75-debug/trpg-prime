/**
 * A REACTION'S OFFER, READ ONLY BY THOSE WHO MAY TAKE IT (3.706.0).
 *
 * Found in the player-perspective live test of 3.705.1: a player Lunged at
 * the GM's creature, missed by its shield, and read "ZZ Foe — Disarm Block"
 * in their own chat log. Reaction offers were whispered to the GMs, but a
 * whisper's author always reads it, and the card was created on the player's
 * client by the player's own attack. The same was true of every offer raised
 * by a player's move or attack: Attacks of Opportunity (and "nobody in reach
 * can answer"), the reaction feats, a creature's reaction moves, Knife
 * Flurry, and the two that were not whispered at all, Reactive Disarm and
 * Savage Jaw. Graham, 21 November 2026: "players should not be able to read
 * this card".
 *
 * So an offer is whispered to the GMs and to the players who own a creature
 * it offers to (the reactors), and created on this client only when this
 * client is one of those readers. Otherwise the GM's client creates it
 * (target-relay OFFER_CARD), so the GM is its author. Nothing waits on it.
 */

/**
 * Who reads an offer: every GM, and every player who owns one of the
 * reactors. Pure.
 *
 * @param {Array<{id: string, isGM?: boolean}>} users
 * @param {Array<{testUserPermission?: Function}>} reactors
 * @returns {string[]} user ids
 */
export function offerRecipients(users = [], reactors = []) {
  return [...new Set((users ?? [])
    .filter((u) => u?.isGM || (reactors ?? []).some((a) => a?.testUserPermission?.(u, "OWNER")))
    .map((u) => u.id))];
}

/**
 * Whether this client may create the card itself: a GM, or one of its
 * readers. With no user (a harness, a world still loading) it is created
 * here, as before. Pure.
 *
 * @param {{id: string, isGM?: boolean}|null|undefined} user
 * @param {string[]} recipients from `offerRecipients`
 * @returns {boolean}
 */
export function offerCreatedHere(user, recipients = []) {
  if (!user) return true;
  return Boolean(user.isGM) || recipients.includes(user.id);
}

/**
 * Post an offer card to its readers.
 *
 * @param {object} data ChatMessage data: content, speaker, flags (no whisper)
 * @param {{reactors?: Actor[], anchor?: object}} [options]
 *   reactors  the creatures it offers a reaction to: their players read it
 *   anchor    a document the GM's client can find (the card's creature),
 *             when no reactor is given
 * @returns {Promise<ChatMessage|null>} the message when created here; null
 *   when the GM's client creates it
 */
export async function postOfferCard(data, { reactors = [], anchor = null } = {}) {
  const whisper = offerRecipients(Array.from(globalThis.game?.users ?? []), reactors);
  if (offerCreatedHere(globalThis.game?.user, whisper)) return ChatMessage.create({ ...data, whisper });
  const doc = anchor ?? (reactors ?? []).find((a) => a?.uuid) ?? null;
  const { relayOfferCard } = await import("./target-relay-workflow.mjs");
  void relayOfferCard(doc, { content: data.content, speaker: data.speaker ?? {}, whisper, flags: data.flags ?? {} });
  return null;
}
