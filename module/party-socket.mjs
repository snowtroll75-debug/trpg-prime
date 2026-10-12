/**
 * The GM relay behind the party sheet's Take buttons.
 *
 * THE PROBLEM. Taking loot means deleting an item from the party actor
 * and creating it on a character. A player cannot delete from a document
 * they do not own, so the naive fix is to give every player Owner on the
 * party actor — which also lets any player empty the pile, rename it, or
 * delete the roster. Graham chose the relay instead (12 Aug 2026): the
 * player needs only Observer, and asks the GM's client to do the move.
 *
 * WHERE THE TRUST BOUNDARY IS. The request is a message from a player's
 * client, so every field in it is that player's assertion — including
 * which character receives the goods. NOTHING in the message is trusted:
 * the GM's client resolves both documents itself, decides ownership from
 * its own copy of the world, and runs `planTake` (party.mjs) on what it
 * found rather than on what it was told. A player who edits the payload
 * to name someone else's character is refused by the same line that
 * refuses an honest mistake.
 *
 * EXACTLY ONE GM ACTS. Every connected GM receives the broadcast, and if
 * each of them performed the move the party would lose one item per GM
 * online. `shouldHandleAsGM` picks the single designated GM, and it is
 * pure so the harness can prove that a two-GM table moves one sword.
 */

import {
  addCoin, coinLine, findMergeTarget, planCoinTake, planTake, quantityOf
} from "./party.mjs";

const SYSTEM_ID = "trg-prime";

/** The socket channel. Foundry namespaces system sockets by id. */
export const PARTY_SOCKET = `system.${SYSTEM_ID}`;

export const PARTY_ACTIONS = Object.freeze({
  TAKE_ITEM: "party.takeItem",
  TAKE_COIN: "party.takeCoin"
});

/**
 * Should THIS client carry out a relayed request?
 *
 * Pure, and separate from the handler, because the failure it prevents
 * is invisible in a one-GM test world: with two GMs connected, a
 * handler that only asked "am I a GM?" would run twice and take two
 * swords out of the pile for one click.
 *
 * @param {{isGM: boolean, id: string}} user the client asking itself
 * @param {{id: string}|null} activeGM Foundry's designated GM
 * @returns {boolean}
 */
export function shouldHandleAsGM(user, activeGM) {
  if (!user?.isGM) return false;
  // No designated GM (the property is absent on some builds, or every
  // GM just disconnected): fall back to acting, because refusing here
  // means a player's click silently does nothing at all. A duplicated
  // take is recoverable and visible; a dead button is neither.
  if (!activeGM?.id) return true;
  return activeGM.id === user.id;
}

/**
 * The message a client sends. Built here rather than at the call site so
 * the shape exists in one place, and so the harness can assert that what
 * the sender builds is what the handler reads.
 */
export function buildTakeItemRequest({ partyUuid, itemId, quantity, destUuid, userId }) {
  return {
    action: PARTY_ACTIONS.TAKE_ITEM,
    partyUuid: String(partyUuid ?? ""),
    itemId: String(itemId ?? ""),
    quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
    destUuid: String(destUuid ?? ""),
    userId: String(userId ?? "")
  };
}

export function buildTakeCoinRequest({ partyUuid, coin, destUuid, userId }) {
  return {
    action: PARTY_ACTIONS.TAKE_COIN,
    partyUuid: String(partyUuid ?? ""),
    coin: coin ?? {},
    destUuid: String(destUuid ?? ""),
    userId: String(userId ?? "")
  };
}

/* ------------------------------------------------------------------ */
/* Carrying it out (runs on the GM's client)                           */
/* ------------------------------------------------------------------ */

/**
 * Perform a relayed item take.
 *
 * `deps` is injected so this whole function is testable without Foundry:
 * the harness supplies fake document lookups and records what would have
 * been written. A transfer rule that is only ever exercised through a
 * live socket is a rule nobody checks.
 *
 * @param {object} request
 * @param {object} deps
 * @param {(uuid: string) => Promise<object|null>} deps.resolve
 * @param {(actor: object, userId: string) => boolean} deps.ownsActor
 * @param {(message: string, userId: string) => void} deps.notify
 * @param {(text: string) => Promise<void>} [deps.announce]
 */
export async function performTakeItem(request, deps) {
  const { resolve, ownsActor, notify, announce } = deps;
  const party = await resolve(request.partyUuid);
  const dest = await resolve(request.destUuid);

  if (!party || !dest) {
    notify("that party or character is no longer available", request.userId);
    return { ok: false, reason: "missing document" };
  }

  const item = party.items?.get?.(request.itemId) ?? null;
  // OWNERSHIP IS DECIDED HERE, from this client's own documents, never
  // from the request. See the header.
  const plan = planTake({
    item,
    requested: request.quantity,
    userOwnsDestination: ownsActor(dest, request.userId)
  });

  if (!plan.ok) {
    notify(plan.reason, request.userId);
    return plan;
  }

  // Build the copy that lands on the character BEFORE touching the
  // source, so a failure to create cannot leave the loot already gone.
  const payload = item.toObject();
  payload.system = { ...(payload.system ?? {}), quantity: plan.take };
  // A stowed flag belongs to whoever stowed it, not to the item — an
  // item taken out of the party pile is in your hands, not in your sack.
  if (payload.system.stowed) payload.system.stowed = false;
  if (payload.system.equipped) payload.system.equipped = false;
  delete payload._id;

  // Join an identical stack the character already has, rather than
  // adding a second row of the same thing. findMergeTarget decides what
  // "identical" means and is deliberately strict about it.
  const merge = findMergeTarget(Array.from(dest.items ?? []), payload);
  if (merge) {
    await dest.updateEmbeddedDocuments("Item", [
      { _id: merge.id, "system.quantity": quantityOf(merge) + plan.take }
    ]);
  } else {
    // trgPartyTransfer: transient, and read by customise-on-add.mjs so a
    // take does not pop a Customise dialog on the GM's screen.
    await dest.createEmbeddedDocuments("Item", [payload], { trgPartyTransfer: true });
  }

  if (plan.deleteSource) {
    await party.deleteEmbeddedDocuments("Item", [item.id]);
  } else {
    await party.updateEmbeddedDocuments("Item", [
      { _id: item.id, "system.quantity": plan.remaining }
    ]);
  }

  await announce?.(
    `<p><strong>${dest.name}</strong> took ${plan.take === 1 ? "" : `${plan.take} × `}` +
    `<strong>${item.name}</strong> from ${party.name}.</p>`
  );
  return { ok: true, take: plan.take, remaining: plan.remaining };
}

/** Perform a relayed coin withdrawal. Same trust rules as above. */
export async function performTakeCoin(request, deps) {
  const { resolve, ownsActor, notify, announce } = deps;
  const party = await resolve(request.partyUuid);
  const dest = await resolve(request.destUuid);

  if (!party || !dest) {
    notify("that party or character is no longer available", request.userId);
    return { ok: false, reason: "missing document" };
  }

  const plan = planCoinTake({
    pot: party.system?.currency,
    request: request.coin,
    userOwnsDestination: ownsActor(dest, request.userId)
  });

  if (!plan.ok) {
    notify(plan.reason, request.userId);
    return plan;
  }

  await dest.update({
    "system.currency": addCoin(dest.system?.currency, plan.taken)
  });
  await party.update({ "system.currency": plan.remaining });

  await announce?.(
    `<p><strong>${dest.name}</strong> took ${coinLine(plan.taken)} from ${party.name}.</p>`
  );
  return { ok: true, taken: plan.taken, remaining: plan.remaining };
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

/** The Foundry-side dependencies, in one place. */
function liveDeps() {
  return {
    resolve: (uuid) => fromUuid(uuid).catch(() => null),
    ownsActor: (actor, userId) => {
      const user = game.users.get(userId);
      return Boolean(user) && actor.testUserPermission(user, "OWNER");
    },
    notify: (message, userId) => {
      if (game.user.id === userId) ui.notifications?.warn(message);
      else game.socket.emit(PARTY_SOCKET, { action: "party.refused", userId, message });
    },
    announce: (content) => ChatMessage.create({ content })
  };
}

/** Dispatch one inbound message. Exported so the harness can drive it. */
export async function handlePartyMessage(data, { user, activeGM, deps }) {
  if (data?.action === "party.refused") {
    if (user.id === data.userId) ui.notifications?.warn(data.message);
    return { handled: false, reason: "refusal notice" };
  }
  if (!Object.values(PARTY_ACTIONS).includes(data?.action)) {
    return { handled: false, reason: "not a party message" };
  }
  if (!shouldHandleAsGM(user, activeGM)) {
    return { handled: false, reason: "another client is the designated GM" };
  }
  const result = data.action === PARTY_ACTIONS.TAKE_ITEM
    ? await performTakeItem(data, deps)
    : await performTakeCoin(data, deps);
  return { handled: true, result };
}

/** Install the listener. Called once from the ready hook. */
export function registerPartySocket() {
  game.socket.on(PARTY_SOCKET, (data) => {
    handlePartyMessage(data, {
      user: game.user,
      activeGM: game.users.activeGM ?? null,
      deps: liveDeps()
    }).catch((error) => console.error("TRG Prime | party socket", error));
  });
}

/**
 * Ask for something from the party pile.
 *
 * A GM does it directly — there is no reason to bounce a message off
 * yourself, and doing so would make the GM's own Take button depend on
 * the socket being healthy.
 */
export async function requestTakeItem({ party, item, quantity, destination }) {
  const request = buildTakeItemRequest({
    partyUuid: party.uuid, itemId: item.id, quantity,
    destUuid: destination.uuid, userId: game.user.id
  });
  if (game.user.isGM) return performTakeItem(request, liveDeps());
  game.socket.emit(PARTY_SOCKET, request);
  return { ok: true, relayed: true };
}

export async function requestTakeCoin({ party, coin, destination }) {
  const request = buildTakeCoinRequest({
    partyUuid: party.uuid, coin, destUuid: destination.uuid, userId: game.user.id
  });
  if (game.user.isGM) return performTakeCoin(request, liveDeps());
  game.socket.emit(PARTY_SOCKET, request);
  return { ok: true, relayed: true };
}

export { quantityOf };
