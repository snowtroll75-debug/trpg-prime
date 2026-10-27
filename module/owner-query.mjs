/**
 * ASKING A CREATURE'S OWN PLAYER (3.673.0). Pure half: who answers.
 *
 * Inner Tempest's Chapter 9 prints two armour runes that are their wearer's
 * reactions to someone else's blow — Guarded ("the wielder takes a critical
 * hit") and Karmic Resilience ("the wielder gains the dying condition"). The
 * blow is resolved on the attacker's client, or on the GM's through the
 * relay; the choice is the wearer's. So the question goes to the wearer's
 * player, through Foundry's user query (Foretell Failure's door, 3.672.0),
 * and the blow waits for the answer.
 *
 * WHO: an active non-GM owner first (the player whose character it is), then
 * the active GM, then this client when nobody else is there to ask.
 */

/** The user who answers for this actor: id, or "" for "ask here". */
export function answeringUserId(owners = [], { gmId = "", selfId = "" } = {}) {
  const player = (owners ?? []).find((u) => u && u.active && !u.isGM);
  if (player) return player.id === selfId ? "" : player.id;
  if (gmId && gmId !== selfId) return gmId;
  return "";
}

/**
 * HOW LONG THE ANSWERING CLIENT MAY TAKE (3.673.0, found in review). The asker
 * waits a minute (owner-query-workflow `WAIT_MS`), then carries on as if told
 * no. A yes given after that would still have spent the reaction and the
 * rune's day for a blow already resolved without it. So the answering
 * client's own window closes first, a few seconds inside the asker's, and an
 * answer outside it is a no that spends nothing.
 */
export const ASK_WAIT_MS = 60 * 1000;
export const ANSWER_WINDOW_MS = ASK_WAIT_MS - 5 * 1000;

/** Was this answer given inside the window? Pure. */
export function answeredInTime(askedAt, answeredAt, windowMs = ANSWER_WINDOW_MS) {
  if (askedAt === null || askedAt === undefined || answeredAt === null || answeredAt === undefined) return false;
  const asked = Number(askedAt), answered = Number(answeredAt);
  if (!Number.isFinite(asked) || !Number.isFinite(answered)) return false;
  return answered - asked <= Number(windowMs);
}
