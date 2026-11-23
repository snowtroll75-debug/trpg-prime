/**
 * PARTY TRANSFERS (3.711.0, Party Sheet V2 Stage 4).
 *
 * Every movement of goods or coin into, out of or across the party goes
 * through here: a withdrawal (party → character), a deposit (character →
 * party), a GM's distribution by drag, and the treasury's Deposit, Take,
 * Give and Split. The party sheet and the socket relay (party-socket.mjs)
 * only build requests; this module decides and carries them out.
 *
 * THE TRUST BOUNDARY IS UNCHANGED FROM 3.600's RELAY. A request is a
 * player's assertion. Nothing in it is trusted: the handler resolves every
 * document itself, reads every quantity from the documents it found, and
 * decides ownership and membership from its own copy of the world.
 *
 * WHAT A TRANSFER IS. A list of STEPS, each a write with its UNDO. The
 * destination is written first and the source second, so that a failure
 * part-way leaves a surplus that is undone, never a loss. Immediately
 * before the source write the source is read again; if it no longer holds
 * enough, the destination write is undone and the transfer refused.
 *
 * WHAT IS NOT ATOMIC, AND WHAT IS DONE ABOUT IT. Foundry writes one
 * document per request, so two documents cannot change together. The
 * defences, in order:
 *   1. ONE AT A TIME. All transfers on one party run in a queue on the
 *      one client that performs them (the designated GM's elected
 *      connection); a GM on another client relays to it as a player does.
 *   2. ONE TIME ONLY. Every request carries an id. An id already seen —
 *      in this client's memory or in the party's journal — is refused, so
 *      a replayed or doubled message moves nothing.
 *   3. UNDO. A failed step undoes the steps before it, in reverse.
 *   4. THE JOURNAL. Before the first write the transfer is recorded on the
 *      party as pending; after the last it is marked done. If the GM's
 *      client dies between the two (a disconnect, a closed tab), the record
 *      stays pending, and the party sheet shows it to the GM with what it
 *      was meant to do, so it can be checked by hand. If an UNDO fails, the
 *      record stays pending with what is out of step.
 * What remains: a GM editing the same quantity by hand at the same moment,
 * or two GM clients both believing themselves the writer during a hand-
 * over, can still race. Both are disclosed in the Stage 4 report.
 */

import {
  COIN_DENOMINATIONS, PARTY_TYPE, addCoin, coinIsEmpty, coinLine, findMergeTarget, isLootItem,
  normaliseCoin, normaliseMembers, quantityOf
} from "./party.mjs";

const SYSTEM_ID = "trg-prime";

/** The party flag holding pending and recently finished transfers. */
export const TRANSFER_JOURNAL_FLAG = "transferJournal";

/** How many finished request ids the journal keeps, to refuse a replay. */
export const JOURNAL_DONE_LIMIT = 200;

/** The kinds of transfer. */
export const TRANSFER_KINDS = Object.freeze({
  WITHDRAW: "withdraw",
  DEPOSIT: "deposit",
  COIN_TAKE: "coinTake",
  COIN_DEPOSIT: "coinDeposit",
  COIN_SPLIT: "coinSplit"
});

/** The actor types that may hold party goods. */
export const HOLDER_TYPES = Object.freeze(["character", "npc"]);

const str = (value) => String(value ?? "").trim();
const whole = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------ */
/* Who may receive, and who may give                                  */
/* ------------------------------------------------------------------ */

/** Is this actor on the party's roster? By UUID, as the roster stores it. */
export function isPartyMember(party, actor) {
  if (!party || !actor?.uuid) return false;
  return normaliseMembers(party.system?.members).includes(actor.uuid);
}

/**
 * May goods go TO this actor? The default is the party's own members; a GM
 * may say, explicitly, that it is someone outside the roster (the
 * override). A player's request for the override is refused.
 *
 * @returns {{ok: true, override: boolean} | {ok: false, reason: string}}
 */
export function destinationAllowed({ party, dest, requesterIsGM, override = false, userOwnsDestination }) {
  if (!dest) return { ok: false, reason: "that character is no longer available" };
  if (!HOLDER_TYPES.includes(str(dest.type))) return { ok: false, reason: `${str(dest.name) || "that"} cannot carry party goods` };
  if (dest.uuid && party?.uuid && dest.uuid === party.uuid) return { ok: false, reason: "that is the party itself" };
  if (!requesterIsGM && !userOwnsDestination) return { ok: false, reason: "you do not own that character" };
  if (isPartyMember(party, dest)) return { ok: true, override: false };
  if (override && requesterIsGM) return { ok: true, override: true };
  if (override) return { ok: false, reason: "only the GM can give to someone outside the party" };
  return { ok: false, reason: `${str(dest.name) || "that character"} is not in ${str(party?.name) || "the party"}` };
}

/**
 * May goods come FROM this actor? A player deposits only from a character
 * they own that is in the party; the GM from anyone who can hold goods.
 */
export function sourceAllowed({ party, source, requesterIsGM, userOwnsSource }) {
  if (!source) return { ok: false, reason: "that character is no longer available" };
  if (!HOLDER_TYPES.includes(str(source.type))) return { ok: false, reason: `${str(source.name) || "that"} has no goods to deposit` };
  if (requesterIsGM) return { ok: true };
  if (!userOwnsSource) return { ok: false, reason: "you do not own that character" };
  if (!isPartyMember(party, source)) return { ok: false, reason: `${str(source.name) || "that character"} is not in ${str(party?.name) || "the party"}` };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Plans: pure, so the harness can exhaust them                       */
/* ------------------------------------------------------------------ */

/**
 * How many of an item may move, read from the item as the HOLDER has it.
 * The requested number is clamped to nothing: an amount above what is held
 * is refused, not quietly reduced, so a stale dialog cannot take less than
 * the player thought without saying so.
 */
export function planItemMove({ item, holder, requested }) {
  if (!item || (holder && item.parent && item.parent !== holder && item.parent?.uuid !== holder.uuid)) {
    return { ok: false, reason: "that item is no longer there" };
  }
  if (!isLootItem(item)) {
    return { ok: false, reason: `${str(item.name) || "that"} is ${/^[aeiou]/i.test(str(item.type)) ? "an" : "a"} ${str(item.type) || "document"}, which the party inventory does not hold` };
  }
  // WHAT STAYS WITH ITS OWNER. A natural or unarmed weapon is part of the
  // creature, and an item granted by a feature (grants-workflow) goes when
  // that feature goes (grant-cleanup.mjs): neither is a thing to hand over.
  const kept = transferRestriction(item);
  if (kept) return { ok: false, reason: kept };
  const have = quantityOf(item);
  const want = whole(requested);
  if (want < 1) return { ok: false, reason: "ask for at least one" };
  if (have < 1) return { ok: false, reason: "there are none left" };
  if (want > have) return { ok: false, reason: `only ${have} left of ${str(item.name)}` };
  return { ok: true, take: want, remaining: have - want, deleteSource: want === have };
}

/**
 * Why an item, of a type the inventory holds, still may not move, or null.
 * Read from fields the item stores: `natural` and `unarmed` on a weapon
 * (template.json), and the `grantedBy` flag the grants workflow writes.
 */
export function transferRestriction(item) {
  const name = str(item?.name) || "That";
  if (item?.system?.natural === true || item?.system?.unarmed === true) return `${name} is part of whoever has it, not something to hand over`;
  const granted = item?.flags?.[SYSTEM_ID]?.grantedBy;
  if (granted) return `${name} was granted by ${str(granted.sourceName) || "a feature"} and stays with it`;
  return null;
}

/** The copy that lands on the receiver: the item as it is, in someone else's hands. */
export function payloadFor(item, quantity) {
  const payload = typeof item?.toObject === "function" ? item.toObject() : JSON.parse(JSON.stringify(item ?? {}));
  payload.system = { ...(payload.system ?? {}), quantity };
  // CARRY STATE BELONGS TO THE CARRIER. Taken out of the pile, an item is
  // in your hands: not in your sack, not worn, not invested.
  if (payload.system.stowed) payload.system.stowed = false;
  if (payload.system.equipped) payload.system.equipped = false;
  if (payload.system.invested) payload.system.invested = false;
  delete payload._id;
  return payload;
}

/**
 * Coin moving between two purses, denomination by denomination (the
 * existing rule: a pile of coin is specific coins, not a gp value).
 */
export function planCoinMove({ from, request, fromLabel = "the party" }) {
  const have = normaliseCoin(from);
  const want = normaliseCoin(request);
  if (coinIsEmpty(want)) return { ok: false, reason: "no coin was asked for" };
  const short = COIN_DENOMINATIONS.filter((key) => want[key] > have[key]);
  if (short.length) {
    return { ok: false, reason: `${fromLabel} does not have that much ${short.map((k) => k.toUpperCase()).join(", ")}` };
  }
  const remaining = {};
  for (const key of COIN_DENOMINATIONS) remaining[key] = have[key] - want[key];
  return { ok: true, moved: want, remaining };
}

/** Take one purse from another. Never below zero: the plan has already refused that. */
export function subtractCoin(purse, taken) {
  const a = normaliseCoin(purse);
  const b = normaliseCoin(taken);
  const out = {};
  for (const key of COIN_DENOMINATIONS) out[key] = a[key] - b[key];
  return out;
}

/**
 * SPLIT COIN (Graham, 23 Nov 2026: "stays in the treasury"). Each
 * denomination is shared on its own: every recipient gets the same whole
 * number of that coin, and what does not divide stays in the party. No
 * coin is broken into smaller ones, so no conversion rule is invented,
 * and the shares plus the remainder are exactly the pot.
 *
 * @param {object} options
 * @param {object} options.pot the party's coin
 * @param {Array<{uuid: string, name: string}>} options.recipients
 * @returns {{ok: true, share: object, allocations: Array, remainder: object, distributed: object}
 *   | {ok: false, reason: string}}
 */
export function planCoinSplit({ pot, recipients = [] }) {
  const seen = new Set();
  const people = recipients.filter((r) => r?.uuid && !seen.has(r.uuid) && seen.add(r.uuid));
  if (!people.length) return { ok: false, reason: "choose at least one member to share with" };
  const have = normaliseCoin(pot);
  if (coinIsEmpty(have)) return { ok: false, reason: "the party has no coin to split" };
  const share = {};
  const remainder = {};
  const distributed = {};
  for (const key of COIN_DENOMINATIONS) {
    share[key] = Math.floor(have[key] / people.length);
    distributed[key] = share[key] * people.length;
    remainder[key] = have[key] - distributed[key];
  }
  if (coinIsEmpty(share)) {
    return { ok: false, reason: `there is not enough of any one coin to give each of the ${people.length} a share` };
  }
  return {
    ok: true,
    share,
    distributed,
    remainder,
    allocations: people.map((r) => ({ uuid: r.uuid, name: str(r.name), coin: { ...share } }))
  };
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

let counter = 0;
/** A request id: unique per user and per click. */
export function newRequestId(userId, random = () => Math.random().toString(36).slice(2, 10)) {
  counter += 1;
  return `${str(userId) || "user"}-${Date.now().toString(36)}-${counter}-${random()}`;
}

/** The shape every transfer request takes. Built in one place. */
export function buildTransferRequest({ kind, requestId, partyUuid, userId, itemUuid = "", quantity = 0, sourceUuid = "", destUuid = "", coin = null, recipients = [], override = false, origin = "" }) {
  return {
    action: "party.transfer",
    kind: str(kind),
    requestId: str(requestId),
    partyUuid: str(partyUuid),
    userId: str(userId),
    itemUuid: str(itemUuid),
    quantity: whole(quantity),
    sourceUuid: str(sourceUuid),
    destUuid: str(destUuid),
    coin: coin ? normaliseCoin(coin) : null,
    recipients: Array.isArray(recipients) ? recipients.map(str).filter(Boolean) : [],
    override: override === true,
    origin: str(origin)
  };
}

/* ------------------------------------------------------------------ */
/* The engine (runs on the performing client)                          */
/* ------------------------------------------------------------------ */

/** Ids this client has already accepted, so a replay is refused before any read. */
export class RequestLedger {
  constructor(limit = 1000) { this.limit = limit; this.ids = new Map(); }
  has(id) { return this.ids.has(id); }
  add(id) {
    this.ids.set(id, Date.now());
    while (this.ids.size > this.limit) this.ids.delete(this.ids.keys().next().value);
  }
}

/** One transfer per party at a time, on this client. */
export class PartyQueue {
  constructor() { this.tails = new Map(); }
  run(key, work) {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    const tail = next.catch(() => {});
    this.tails.set(key, tail);
    tail.then(() => { if (this.tails.get(key) === tail) this.tails.delete(key); });
    return next;
  }
  busy(key) { return this.tails.has(key); }
}

/** The journal as stored, cleaned. */
export function readJournal(party) {
  const raw = party?.flags?.[SYSTEM_ID]?.[TRANSFER_JOURNAL_FLAG] ?? party?.getFlag?.(SYSTEM_ID, TRANSFER_JOURNAL_FLAG) ?? {};
  return {
    pending: Array.isArray(raw.pending) ? raw.pending.filter((p) => p?.id) : [],
    done: Array.isArray(raw.done) ? raw.done.map(str).filter(Boolean) : []
  };
}

/** Has this request already been seen by the party? */
export function journalHas(journal, id) {
  return journal.done.includes(id) || journal.pending.some((p) => p.id === id);
}

/** The journal after a transfer is claimed. */
export function journalClaim(journal, record) {
  return { pending: [...journal.pending.filter((p) => p.id !== record.id), record], done: journal.done };
}

/** The journal after a transfer is finished (done, or fully undone). */
export function journalFinish(journal, id) {
  const done = [...journal.done.filter((d) => d !== id), id];
  return { pending: journal.pending.filter((p) => p.id !== id), done: done.slice(-JOURNAL_DONE_LIMIT) };
}

/** The journal when a transfer could not be put right: it stays pending, with what is wrong. */
export function journalUnresolved(journal, id, problem) {
  return {
    pending: journal.pending.map((p) => (p.id === id ? { ...p, unresolved: str(problem) } : p)),
    done: journal.done
  };
}

/**
 * Run steps in order; on a failure, undo the ones that ran, newest first.
 *
 * @param {Array<{label: string, run: () => Promise<any>, undo?: () => Promise<any>}>} steps
 * @returns {Promise<{ok: true} | {ok: false, failed: string, error: any, undoFailed: string[]}>}
 */
export async function runSteps(steps) {
  const done = [];
  for (const step of steps) {
    try {
      await step.run();
      done.push(step);
    } catch (error) {
      const undoFailed = [];
      for (const prior of done.reverse()) {
        if (!prior.undo) continue;
        try { await prior.undo(); } catch (undoError) {
          undoFailed.push(prior.label);
          console.error(`TRG Prime | party transfer: could not undo "${prior.label}"`, undoError);
        }
      }
      return { ok: false, failed: step.label, error, undoFailed };
    }
  }
  return { ok: true };
}

/**
 * Carry out one transfer request.
 *
 * @param {object} request built by buildTransferRequest; every field a claim
 * @param {object} deps
 * @param {(uuid: string) => Promise<object|null>} deps.resolve
 * @param {(actor: object, userId: string) => boolean} deps.ownsActor
 * @param {(userId: string) => boolean} deps.isGMUser
 * @param {(userId: string) => string} [deps.userName]
 * @param {(party: object, journal: object) => Promise<void>} deps.writeJournal
 * @param {(content: string) => Promise<void>} [deps.announce]  public card
 * @param {(content: string) => Promise<void>} [deps.alertGM]   GM-only card
 * @param {RequestLedger} deps.ledger
 * @param {PartyQueue} deps.queue
 * @returns {Promise<object>}
 */
export async function performTransfer(request, deps) {
  const id = str(request?.requestId);
  if (!id) return { ok: false, reason: "the request has no id" };
  if (!Object.values(TRANSFER_KINDS).includes(request?.kind)) return { ok: false, reason: "that is not a party transfer" };
  if (deps.ledger.has(id)) return { ok: false, duplicate: true, reason: "that request has already been handled" };
  deps.ledger.add(id);
  return deps.queue.run(str(request.partyUuid) || "?", () => transferNow(request, deps));
}

async function transferNow(request, deps) {
  const party = await deps.resolve(request.partyUuid);
  if (!party || party.type !== PARTY_TYPE) return { ok: false, reason: "that party is no longer available" };
  const journal = readJournal(party);
  if (journalHas(journal, request.requestId)) return { ok: false, duplicate: true, reason: "that request has already been handled" };

  const requesterIsGM = deps.isGMUser(request.userId) === true;
  const who = deps.userName?.(request.userId) ?? "";

  let plan;
  switch (request.kind) {
    case TRANSFER_KINDS.WITHDRAW: plan = await planWithdrawal(request, party, requesterIsGM, deps); break;
    case TRANSFER_KINDS.DEPOSIT: plan = await planDeposit(request, party, requesterIsGM, deps); break;
    case TRANSFER_KINDS.COIN_TAKE: plan = await planCoinTake(request, party, requesterIsGM, deps); break;
    case TRANSFER_KINDS.COIN_DEPOSIT: plan = await planCoinDepositOf(request, party, requesterIsGM, deps); break;
    case TRANSFER_KINDS.COIN_SPLIT: plan = await planSplit(request, party, requesterIsGM, deps); break;
    default: plan = { ok: false, reason: "that is not a party transfer" };
  }
  if (!plan.ok) return plan;

  // CLAIM. Recorded before the first write, so a transfer cut off half-way
  // is visible afterwards rather than silent.
  const record = { id: request.requestId, kind: request.kind, at: Date.now(), userId: request.userId, user: who, summary: plan.summary };
  await deps.writeJournal(party, journalClaim(readJournal(party), record));

  const result = await runSteps(plan.steps);
  if (!result.ok) {
    if (result.undoFailed.length) {
      const problem = `${plan.summary} failed at "${result.failed}", and could not be undone for: ${result.undoFailed.join(", ")}. Check both inventories by hand.`;
      await deps.writeJournal(party, journalUnresolved(readJournal(party), request.requestId, problem)).catch(() => {});
      await deps.alertGM?.(`<p><strong>Party transfer needs checking.</strong> ${problem}</p>`);
      return { ok: false, unresolved: true, reason: problem };
    }
    await deps.writeJournal(party, journalFinish(readJournal(party), request.requestId)).catch(() => {});
    const why = result.error?.trgReason ?? "a write failed, and everything was put back";
    return { ok: false, reason: `${plan.summary} did not happen: ${why}` };
  }

  await deps.writeJournal(party, journalFinish(readJournal(party), request.requestId));
  // ANNOUNCED ONLY NOW, when every write has landed.
  await deps.announce?.(plan.card(who));
  return { ok: true, ...plan.outcome };
}

/** A refusal raised inside a step, so the undo runs and the reason is the plain one. */
function refusal(reason) {
  const error = new Error(reason);
  error.trgReason = reason;
  return error;
}

/** The steps that move `take` of `item` from `holder` to `receiver`. */
function itemSteps({ item, holder, receiver, take, payload }) {
  let mergedInto = null;
  let created = null;
  let deletedSnapshot = null;
  const steps = [
    {
      label: `add to ${receiver.name}`,
      run: async () => {
        const merge = findMergeTarget(Array.from(receiver.items ?? []), payload);
        if (merge) {
          mergedInto = merge.id;
          await receiver.updateEmbeddedDocuments("Item", [{ _id: merge.id, "system.quantity": quantityOf(merge) + take }]);
        } else {
          const made = await receiver.createEmbeddedDocuments("Item", [payload], { trgPartyTransfer: true });
          created = made?.[0]?.id ?? made?.[0]?._id ?? null;
          if (!created) throw refusal(`${receiver.name} did not receive it`);
        }
      },
      undo: async () => {
        if (created) await receiver.deleteEmbeddedDocuments("Item", [created]);
        else if (mergedInto) {
          const now = receiver.items?.get?.(mergedInto);
          if (now) await receiver.updateEmbeddedDocuments("Item", [{ _id: mergedInto, "system.quantity": Math.max(0, quantityOf(now) - take) }]);
        }
      }
    },
    {
      label: `remove from ${holder.name}`,
      run: async () => {
        // READ AGAIN, IMMEDIATELY BEFORE THE WRITE. What the plan saw may
        // have changed while the receiver was written.
        const current = holder.items?.get?.(item.id);
        const have = current ? quantityOf(current) : 0;
        if (!current || have < take) throw refusal(`${holder.name} no longer has ${take} of ${item.name}`);
        if (have === take) {
          deletedSnapshot = typeof current.toObject === "function" ? current.toObject() : { ...current };
          await holder.deleteEmbeddedDocuments("Item", [current.id]);
        } else {
          await holder.updateEmbeddedDocuments("Item", [{ _id: current.id, "system.quantity": have - take }]);
        }
      },
      undo: async () => {
        if (deletedSnapshot) await holder.createEmbeddedDocuments("Item", [deletedSnapshot], { keepId: true, trgPartyTransfer: true });
        else {
          const now = holder.items?.get?.(item.id);
          if (now) await holder.updateEmbeddedDocuments("Item", [{ _id: item.id, "system.quantity": quantityOf(now) + take }]);
        }
      }
    }
  ];
  return steps;
}

/** The steps that move `coin` from one purse to another. */
function coinSteps({ from, to, coin, fromLabel }) {
  return [
    {
      label: `add coin to ${to.name}`,
      run: () => to.update({ "system.currency": addCoin(to.system?.currency, coin) }),
      undo: () => to.update({ "system.currency": subtractCoinFloor(to.system?.currency, coin) })
    },
    {
      label: `take coin from ${from.name}`,
      run: async () => {
        const check = planCoinMove({ from: from.system?.currency, request: coin, fromLabel });
        if (!check.ok) throw refusal(check.reason);
        await from.update({ "system.currency": check.remaining });
      },
      undo: () => from.update({ "system.currency": addCoin(from.system?.currency, coin) })
    }
  ];
}

/** An undo's subtraction: it removes what the step added, and never goes negative. */
function subtractCoinFloor(purse, taken) {
  const out = subtractCoin(purse, taken);
  for (const key of COIN_DENOMINATIONS) out[key] = Math.max(0, out[key]);
  return out;
}

const times = (n) => (n === 1 ? "" : `${n} × `);

async function planWithdrawal(request, party, requesterIsGM, deps) {
  const dest = await deps.resolve(request.destUuid);
  const allowed = destinationAllowed({
    party, dest, requesterIsGM, override: request.override,
    userOwnsDestination: dest ? deps.ownsActor(dest, request.userId) : false
  });
  if (!allowed.ok) return allowed;
  const item = await deps.resolve(request.itemUuid);
  if (!item || item.parent?.uuid !== party.uuid) return { ok: false, reason: "that item is no longer in the party inventory" };
  const move = planItemMove({ item, holder: party, requested: request.quantity });
  if (!move.ok) return move;
  const verb = request.origin === "drag" ? "gave" : "took";
  return {
    ok: true,
    summary: `${times(move.take)}${item.name} from ${party.name} to ${dest.name}`,
    steps: itemSteps({ item, holder: party, receiver: dest, take: move.take, payload: payloadFor(item, move.take) }),
    outcome: { take: move.take, remaining: move.remaining },
    card: (who) => transferCard({
      title: request.origin === "drag" ? "Distributed from the party" : "Taken from the party",
      line: request.origin === "drag"
        ? `<strong>${dest.name}</strong> was given ${times(move.take)}<strong>${item.name}</strong> from ${party.name}.`
        : `<strong>${dest.name}</strong> ${verb} ${times(move.take)}<strong>${item.name}</strong> from ${party.name}.`,
      who, override: allowed.override
    })
  };
}

async function planDeposit(request, party, requesterIsGM, deps) {
  const item = await deps.resolve(request.itemUuid);
  const source = item?.parent ?? null;
  if (!item || !source || source.documentName === "Item") return { ok: false, reason: "that item is no longer on a character" };
  if (source.uuid === party.uuid) return { ok: false, reason: "that item is already in the party inventory" };
  const allowed = sourceAllowed({ party, source, requesterIsGM, userOwnsSource: deps.ownsActor(source, request.userId) });
  if (!allowed.ok) return allowed;
  const move = planItemMove({ item, holder: source, requested: request.quantity });
  if (!move.ok) return move;
  return {
    ok: true,
    summary: `${times(move.take)}${item.name} from ${source.name} to ${party.name}`,
    steps: itemSteps({ item, holder: source, receiver: party, take: move.take, payload: payloadFor(item, move.take) }),
    outcome: { take: move.take, remaining: move.remaining },
    card: (who) => transferCard({
      title: "Deposited with the party",
      line: `<strong>${source.name}</strong> put ${times(move.take)}<strong>${item.name}</strong> into ${party.name}'s inventory.`,
      who
    })
  };
}

async function planCoinTake(request, party, requesterIsGM, deps) {
  const dest = await deps.resolve(request.destUuid);
  const allowed = destinationAllowed({
    party, dest, requesterIsGM, override: request.override,
    userOwnsDestination: dest ? deps.ownsActor(dest, request.userId) : false
  });
  if (!allowed.ok) return allowed;
  const move = planCoinMove({ from: party.system?.currency, request: request.coin, fromLabel: "the party" });
  if (!move.ok) return move;
  // The GM gives coin (Give Coin); a player takes it (Take Coin).
  const gave = requesterIsGM;
  return {
    ok: true,
    summary: `${coinLine(move.moved)} from ${party.name} to ${dest.name}`,
    steps: coinSteps({ from: party, to: dest, coin: move.moved, fromLabel: "the party" }),
    outcome: { taken: move.moved },
    card: (who) => transferCard({
      title: "Coin from the party",
      line: `<strong>${dest.name}</strong> ${gave ? "was given" : "took"} ${coinLine(move.moved)} from ${party.name}.`,
      who, override: allowed.override
    })
  };
}

async function planCoinDepositOf(request, party, requesterIsGM, deps) {
  const source = await deps.resolve(request.sourceUuid);
  const allowed = sourceAllowed({ party, source, requesterIsGM, userOwnsSource: source ? deps.ownsActor(source, request.userId) : false });
  if (!allowed.ok) return allowed;
  const move = planCoinMove({ from: source.system?.currency, request: request.coin, fromLabel: source.name });
  if (!move.ok) return move;
  return {
    ok: true,
    summary: `${coinLine(move.moved)} from ${source.name} to ${party.name}`,
    steps: coinSteps({ from: source, to: party, coin: move.moved, fromLabel: source.name }),
    outcome: { deposited: move.moved },
    card: (who) => transferCard({
      title: "Coin deposited",
      line: `<strong>${source.name}</strong> put ${coinLine(move.moved)} into ${party.name}'s treasury.`,
      who
    })
  };
}

async function planSplit(request, party, requesterIsGM, deps) {
  if (!requesterIsGM) return { ok: false, reason: "only the GM can split the party's coin" };
  const members = normaliseMembers(party.system?.members);
  const recipients = [];
  for (const uuid of request.recipients) {
    if (!members.includes(uuid)) return { ok: false, reason: "a share can only go to a member of the party" };
    const actor = await deps.resolve(uuid);
    if (!actor || !HOLDER_TYPES.includes(str(actor.type))) return { ok: false, reason: "a member chosen for a share is no longer available" };
    recipients.push(actor);
  }
  const split = planCoinSplit({ pot: party.system?.currency, recipients: recipients.map((a) => ({ uuid: a.uuid, name: a.name })) });
  if (!split.ok) return split;
  // WHAT THE GM SAW IS WHAT HAPPENS. The preview's shares travel with the
  // request; if the treasury changed since, the split is refused, not redone.
  if (request.coin && JSON.stringify(normaliseCoin(request.coin)) !== JSON.stringify(split.share)) {
    return { ok: false, reason: "the treasury changed since the split was shown; open Split Coin again" };
  }
  const steps = recipients.map((actor) => ({
    label: `add a share to ${actor.name}`,
    run: () => actor.update({ "system.currency": addCoin(actor.system?.currency, split.share) }),
    undo: () => actor.update({ "system.currency": subtractCoinFloor(actor.system?.currency, split.share) })
  }));
  steps.push({
    label: `take the shares from ${party.name}`,
    run: async () => {
      const check = planCoinMove({ from: party.system?.currency, request: split.distributed, fromLabel: "the party" });
      if (!check.ok) throw refusal(check.reason);
      await party.update({ "system.currency": check.remaining });
    },
    undo: () => party.update({ "system.currency": addCoin(party.system?.currency, split.distributed) })
  });
  return {
    ok: true,
    summary: `a split of ${coinLine(split.distributed)} from ${party.name} among ${recipients.length}`,
    steps,
    outcome: { share: split.share, remainder: split.remainder, distributed: split.distributed },
    card: (who) => transferCard({
      title: "Party coin split",
      line: `${coinLine(split.distributed)} shared among ${recipients.map((a) => `<strong>${a.name}</strong>`).join(", ")}: `
        + `${coinLine(split.share)} each.${coinIsEmpty(split.remainder) ? "" : ` ${coinLine(split.remainder)} stays in the treasury.`}`,
      who
    })
  };
}

/** The public card (Graham: everyone sees party transfers). */
export function transferCard({ title, line, who = "", override = false }) {
  const by = who ? `<p class="hint" style="margin:2px 0">By ${who}${override ? " (GM, to someone outside the party)" : ""}.</p>` : "";
  return `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><h3>${title}</h3></div></header>`
    + `<p style="margin:2px 0">${line}</p>${by}</div>`;
}

/* ------------------------------------------------------------------ */
/* The inventory page                                                  */
/* ------------------------------------------------------------------ */

/**
 * One line of what an item is, from fields its type actually has
 * (template.json). Nothing is shown that the item does not store.
 */
export function itemDetail(item) {
  const s = item?.system ?? {};
  const parts = [];
  const quality = str(s.quality);
  switch (str(item?.type)) {
    case "weapon":
      if (str(s.damage)) parts.push(`${str(s.damage)}${str(s.damageType) ? ` ${str(s.damageType)}` : ""}`);
      if (str(s.range)) parts.push(`range ${str(s.range)}`);
      break;
    case "armour":
      if (Number(s.dr)) parts.push(`DR ${Number(s.dr)}`);
      if (str(s.category)) parts.push(str(s.category));
      break;
    case "shield":
      if (Number(s.defenceBonus)) parts.push(`Defence +${Number(s.defenceBonus)}`);
      if (Number(s.dr)) parts.push(`DR ${Number(s.dr)}`);
      break;
    case "gear":
      if (Number(s.uses?.max) > 0) parts.push(`${Number(s.uses?.value) || 0}/${Number(s.uses.max)} uses`);
      break;
    case "consumable":
      if (Number(s.uses?.max) > 1) parts.push(`${Number(s.uses?.value) || 0}/${Number(s.uses.max)} uses`);
      if (str(s.activation)) parts.push(str(s.activation));
      break;
    case "ammunition":
      if (str(s.damage)) parts.push(str(s.damage));
      if (str(s.compatibleWeaponGroup)) parts.push(str(s.compatibleWeaponGroup));
      break;
    default: break;
  }
  if (quality && quality !== "standard") parts.push(quality);
  if (str(s.material)) parts.push(str(s.material));
  if (str(s.runes)) parts.push("runes");
  return parts.join(" · ");
}

/**
 * Does an inventory row pass the page's search and type filter? The name
 * matches anywhere, in any case; an empty filter passes everything.
 */
export function matchesInventoryFilter(row, { search = "", type = "" } = {}) {
  const needle = str(search).toLowerCase();
  return (!type || str(row?.type) === type) && (!needle || str(row?.name).toLowerCase().includes(needle));
}
