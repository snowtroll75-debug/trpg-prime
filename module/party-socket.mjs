/**
 * The GM relay behind every party transfer.
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
 * the GM's client resolves every document itself, decides ownership and
 * membership from its own copy of the world, and plans on what it found
 * (party-transfers.mjs) rather than on what it was told.
 *
 * EXACTLY ONE CLIENT ACTS (3.711.0, Stage 4). Every connected GM receives
 * the broadcast; `shouldHandleAsGM` picks the designated GM's elected
 * connection. Since 3.711.0 a GM on any OTHER client relays too, rather
 * than writing from their own: every transfer on a party then runs in one
 * queue on one client, which is what makes "one at a time" true.
 *
 * THE REPLY. The performing client answers each request with its result,
 * so the requester's button stays locked until the move is done and the
 * requester hears a refusal in plain words. A request with no answer
 * within REPLY_TIMEOUT_MS is reported as unknown, never as failed: it may
 * still have happened, and the chat card is the record.
 */

import { isGMConnectionWriter } from "./gm-connection.mjs";
import {
  PartyQueue, RequestLedger, TRANSFER_JOURNAL_FLAG, buildTransferRequest, newRequestId, performTransfer, readJournal
} from "./party-transfers.mjs";
import { quantityOf } from "./party.mjs";

const SYSTEM_ID = "trg-prime";

/** The socket channel. Foundry namespaces system sockets by id. */
export const PARTY_SOCKET = `system.${SYSTEM_ID}`;

export const PARTY_ACTIONS = Object.freeze({
  TRANSFER: "party.transfer"
});

/** The performing client's answer. */
export const PARTY_RESULT = "party.result";

/** How long a requester waits for the answer. */
export const REPLY_TIMEOUT_MS = 15000;

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
export function shouldHandleAsGM(user, activeGM, connectionWriter = true) {
  if (!user?.isGM) return false;
  // ONE CONNECTION OF THAT GM (3.686.2): every tab of the designated GM
  // receives the request, so only the elected one (gm-connection.mjs)
  // carries it out. Defaults to true so the pure two-argument contract holds.
  if (connectionWriter === false) return false;
  // No designated GM (the property is absent on some builds, or every
  // GM just disconnected): fall back to acting, because refusing here
  // means a player's click silently does nothing at all. A duplicated
  // take is recoverable and visible; a dead button is neither.
  if (!activeGM?.id) return true;
  return activeGM.id === user.id;
}

/* ------------------------------------------------------------------ */
/* The performing client                                               */
/* ------------------------------------------------------------------ */

/** This client's memory of handled requests, and its queue. One of each. */
const ledger = new RequestLedger();
const queue = new PartyQueue();

/** The Foundry-side dependencies, in one place. */
function liveDeps() {
  return {
    resolve: (uuid) => (uuid ? fromUuid(uuid).catch(() => null) : Promise.resolve(null)),
    ownsActor: (actor, userId) => {
      const user = game.users.get(userId);
      return Boolean(user) && actor.testUserPermission(user, "OWNER");
    },
    isGMUser: (userId) => game.users.get(userId)?.isGM === true,
    userName: (userId) => game.users.get(userId)?.name ?? "",
    writeJournal: (party, journal) => party.update({ [`flags.${SYSTEM_ID}.${TRANSFER_JOURNAL_FLAG}`]: journal }),
    announce: (content) => ChatMessage.create({ content }),
    alertGM: (content) => ChatMessage.create({ content, whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id) }),
    ledger,
    queue
  };
}

/** Dispatch one inbound message. Exported so the harness can drive it. */
export async function handlePartyMessage(data, { user, activeGM, deps, connectionWriter = true, reply = () => {} }) {
  if (data?.action === PARTY_RESULT) return { handled: false, reason: "a reply" };
  if (!Object.values(PARTY_ACTIONS).includes(data?.action)) {
    return { handled: false, reason: "not a party message" };
  }
  if (!shouldHandleAsGM(user, activeGM, connectionWriter)) {
    return { handled: false, reason: "another client is the designated GM" };
  }
  const result = await performTransfer(data, deps).catch((error) => {
    console.error("TRG Prime | party transfer", error);
    return { ok: false, reason: "the transfer failed on the GM's side; check the party sheet" };
  });
  // A duplicate is not answered: the first copy's answer is the answer.
  if (!result.duplicate) reply({ action: PARTY_RESULT, requestId: data.requestId, userId: data.userId, result });
  return { handled: true, result };
}

/* ------------------------------------------------------------------ */
/* The requesting client                                               */
/* ------------------------------------------------------------------ */

/** Requests this client sent and is waiting on. */
const waiting = new Map();

/** Install the listener. Called once from the ready hook. */
export function registerPartySocket() {
  game.socket.on(PARTY_SOCKET, (data) => {
    if (data?.action === PARTY_RESULT) {
      if (data.userId === game.user?.id) waiting.get(data.requestId)?.(data.result);
      return;
    }
    handlePartyMessage(data, {
      user: game.user,
      activeGM: game.users.activeGM ?? null,
      connectionWriter: isGMConnectionWriter(),
      deps: liveDeps(),
      reply: (message) => game.socket.emit(PARTY_SOCKET, message)
    }).catch((error) => console.error("TRG Prime | party socket", error));
  });
  // A TRANSFER CUT OFF LAST TIME (Stage 4). Once the GM connections have
  // settled, the performing GM is told of any party whose journal still
  // holds an unfinished transfer; the party sheet lists what each was.
  setTimeout(() => {
    if (!iPerform()) return;
    const parties = game.actors.filter((a) => a.type === "party" && readJournal(a).pending.length);
    if (parties.length) {
      ui.notifications?.warn(`Unfinished party transfer${parties.length === 1 ? "" : "s"} in ${parties.map((a) => a.name).join(", ")}: open the party's Inventory to check.`);
    }
  }, 3000);
}

/** Am I the client that performs transfers? */
function iPerform() {
  return shouldHandleAsGM(game.user, game.users.activeGM ?? null, isGMConnectionWriter());
}

/**
 * Send a transfer, and wait for its outcome.
 *
 * The designated GM's own connection performs it in place (through the
 * same queue and ledger); everyone else relays and waits for the answer.
 */
export async function requestTransfer(fields) {
  const request = buildTransferRequest({ ...fields, requestId: newRequestId(game.user.id), userId: game.user.id });
  let result;
  if (iPerform()) {
    result = await performTransfer(request, liveDeps());
  } else if (!game.users.activeGM) {
    result = { ok: false, reason: "no GM is connected to carry out party transfers" };
  } else {
    result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(request.requestId);
        resolve({ ok: false, unknown: true, reason: "the GM's client did not answer. Check the party sheet and chat before trying again: it may have happened" });
      }, REPLY_TIMEOUT_MS);
      waiting.set(request.requestId, (answer) => {
        clearTimeout(timer);
        waiting.delete(request.requestId);
        resolve(answer ?? { ok: false, reason: "no answer" });
      });
      game.socket.emit(PARTY_SOCKET, request);
    });
  }
  if (!result?.ok && result?.reason) ui.notifications?.warn(`Party: ${result.reason}.`);
  return result;
}

/** Is a transfer on this party running on this client right now? */
export function transferInFlight(partyUuid) {
  return queue.busy(String(partyUuid ?? ""));
}

export { quantityOf };
