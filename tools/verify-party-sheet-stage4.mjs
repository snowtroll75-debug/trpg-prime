#!/usr/bin/env node
/**
 * verify-party-sheet-stage4 — TRG Prime 3.711.0, Party Sheet V2 Stage 4
 * (the shared inventory, item transfers and the party treasury).
 *
 * Driven through the transfer engine itself (party-transfers.mjs) on a
 * fake world whose documents can be told to fail. After every operation
 * the CONSERVATION check runs: the number of each item across every
 * holder, and the value of every purse in copper, are what they were
 * before (for a refused or failed transfer) or exactly what moved.
 *
 *   W  Withdrawals: full stack, part of a stack, onto an existing stack.
 *   D  Deposits: full and partial; onto an existing party stack.
 *   T  Item types: only what the inventory holds.
 *   O  Ownership and membership: a player's own members only.
 *   G  The GM's override: outside the roster, explicitly, the GM alone.
 *   C  Coin: take, give, deposit, insufficient funds.
 *   S  Split Coin: the remainder stays; what was shown is what happens.
 *   Q  Concurrency: two requests for the last one; one wins, none duplicates.
 *   R  Duplicates and replays: by this client's memory and by the journal.
 *   M  Multiple GMs and connections: one performs; the reply.
 *   F  Failures: a failed write is undone; an undo that fails is recorded.
 *   X  Missing actors and items, before and during a transfer.
 *   P  Repeated drag and drop.
 *   I  The inventory page: details, filter, carry state.
 *   U  The sheet's wiring.
 *   Z  The version.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

globalThis.foundry = { applications: { api: { DialogV2: class {} } }, utils: {} };
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };

const PT = await imp("party-transfers.mjs");
const PS = await imp("party-socket.mjs");
const P = await imp("party.mjs");

/* ------------------------------------------------------------ the fake world */
const clone = (x) => JSON.parse(JSON.stringify(x));
let nextId = 0;
const world = new Map();
const allHolders = [];

function fakeItem(parent, { id, name, type = "gear", quantity = 1, system = {} }) {
  const item = {
    id, name, type, parent, flags: {},
    get uuid() { return `${parent.uuid}.Item.${this.id}`; },
    system: { quantity, ...clone(system) },
    toObject() { return { _id: this.id, name: this.name, type: this.type, flags: clone(this.flags), system: clone(this.system) }; }
  };
  return item;
}

function fakeHolder({ id, type = "character", members, currency = {} }) {
  const map = new Map();
  const holder = {
    id, name: id, type, uuid: `Actor.${id}`, documentName: "Actor", flags: {}, fail: {},
    system: { currency: { mp: 0, pp: 0, gp: 0, sp: 0, cp: 0, ...currency }, ...(members ? { members } : {}) },
    items: { get: (i) => map.get(i), [Symbol.iterator]: () => map.values(), get size() { return map.size; } },
    _map: map,
    add(spec) { const item = fakeItem(holder, spec); map.set(item.id, item); return item; },
    async createEmbeddedDocuments(_t, rows, options = {}) {
      if (holder.fail.create) throw new Error(`create on ${id} failed`);
      const made = [];
      for (const row of rows) {
        const itemId = options.keepId && row._id ? row._id : `n${(nextId += 1)}`;
        const item = fakeItem(holder, { id: itemId, name: row.name, type: row.type, quantity: row.system?.quantity, system: row.system });
        item.flags = clone(row.flags ?? {});
        map.set(itemId, item);
        made.push(item);
      }
      holder.onCreate?.();
      return made;
    },
    async updateEmbeddedDocuments(_t, rows) {
      if (holder.fail.updateItems) throw new Error(`item update on ${id} failed`);
      for (const r of rows) { const it = map.get(r._id); if (!it) throw new Error("no such item"); it.system.quantity = r["system.quantity"]; }
      holder.onUpdateItems?.();
    },
    async deleteEmbeddedDocuments(_t, ids) {
      if (holder.fail.delete) throw new Error(`delete on ${id} failed`);
      for (const i of ids) map.delete(i);
    },
    async update(change) {
      if (holder.fail.update && !Object.keys(change).every((k) => k.startsWith("flags."))) throw new Error(`update on ${id} failed`);
      for (const [k, v] of Object.entries(change)) {
        if (k === "system.currency") holder.system.currency = clone(v);
        else if (k.startsWith("flags.trg-prime.")) holder.flags["trg-prime"] = { ...(holder.flags["trg-prime"] ?? {}), [k.split(".").at(-1)]: clone(v) };
      }
    }
  };
  world.set(holder.uuid, holder);
  allHolders.push(holder);
  return holder;
}

const resolve = async (uuid) => {
  if (world.has(uuid)) return world.get(uuid);
  const m = /^(Actor\.[^.]+)\.Item\.(.+)$/.exec(uuid ?? "");
  return m ? world.get(m[1])?.items.get(m[2]) ?? null : null;
};

/* Everything, counted. */
const countOf = (name) => allHolders.filter((h) => world.has(h.uuid)).reduce((n, h) => n + [...h.items].filter((i) => i.name === name).reduce((s, i) => s + i.system.quantity, 0), 0);
const rowsOf = (holder, name) => [...holder.items].filter((i) => i.name === name).length;
const cp = (c) => (c.mp * 10000) + (c.pp * 1000) + (c.gp * 100) + (c.sp * 10) + c.cp;
const wealth = () => allHolders.filter((h) => world.has(h.uuid)).reduce((n, h) => n + cp(h.system.currency), 0);

const announced = [];
const alerted = [];
const users = { gm: { isGM: true }, gm2: { isGM: true }, p1: { isGM: false }, p2: { isGM: false } };
const owners = new Map();
function makeDeps(overrides = {}) {
  return {
    resolve,
    ownsActor: (actor, userId) => users[userId]?.isGM === true || (owners.get(actor?.uuid) ?? []).includes(userId),
    isGMUser: (userId) => users[userId]?.isGM === true,
    userName: (userId) => `User ${userId}`,
    writeJournal: (party, journal) => party.update({ "flags.trg-prime.transferJournal": journal }),
    announce: async (c) => { announced.push(c); },
    alertGM: async (c) => { alerted.push(c); },
    ledger: new PT.RequestLedger(),
    queue: new PT.PartyQueue(),
    ...overrides
  };
}
let deps = makeDeps();
const req = (fields) => PT.buildTransferRequest({ partyUuid: "Actor.Party", requestId: PT.newRequestId(fields.userId ?? "x"), ...fields });
const run = (fields, d = deps) => PT.performTransfer(req(fields), d);

/* The party and its members. Wiz and Rog are players'; Hen is an NPC member; Out is not in the party. */
const party = fakeHolder({ id: "Party", type: "party", members: ["Actor.Wiz", "Actor.Rog", "Actor.Hen"], currency: { gp: 7, sp: 5, cp: 2 } });
const wiz = fakeHolder({ id: "Wiz", currency: { gp: 10, sp: 3 } });
const rog = fakeHolder({ id: "Rog", currency: { gp: 1 } });
const hen = fakeHolder({ id: "Hen", type: "npc" });
const out = fakeHolder({ id: "Out", currency: { gp: 2 } });
owners.set(wiz.uuid, ["p1"]);
owners.set(rog.uuid, ["p2"]);
owners.set(out.uuid, ["p1"]);

party.add({ id: "sword", name: "Sword", type: "weapon", quantity: 1, system: { damage: "1d8", damageType: "slashing" } });
party.add({ id: "arrows", name: "Arrows", type: "ammunition", quantity: 20 });
party.add({ id: "potion", name: "Potion", type: "consumable", quantity: 1 });
party.add({ id: "spell", name: "Fireball", type: "spell", quantity: 1 });
wiz.add({ id: "warrows", name: "Arrows", type: "ammunition", quantity: 5 });
wiz.add({ id: "rope", name: "Rope", type: "gear", quantity: 3, system: { equipped: true } });
wiz.add({ id: "wspell", name: "Shield", type: "spell", quantity: 1 });
rog.add({ id: "dagger", name: "Dagger", type: "weapon", quantity: 2 });
out.add({ id: "gem", name: "Gem", type: "gear", quantity: 1 });

const totals = () => ({ Sword: countOf("Sword"), Arrows: countOf("Arrows"), Potion: countOf("Potion"), Rope: countOf("Rope"), Dagger: countOf("Dagger"), Gem: countOf("Gem"), Fireball: countOf("Fireball"), Shield: countOf("Shield"), wealth: wealth() });
let start = totals();
/* After the harness itself sets a purse, the baseline is taken again. */
const rebase = () => { start = totals(); };
const conserved = (label) => equal(`${label} — conservation: every item and every copper accounted for`, totals(), start);

/* ------------------------------------------------------------ W. withdrawals */
{
  const r = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.sword", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  equal("W1 a full-stack withdrawal: the sword is Wiz's and the party's row is gone", [r.ok, rowsOf(wiz, "Sword"), party.items.get("sword") ?? null], [true, 1, null]);
  conserved("W1");
  const r2 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.arrows", quantity: 6, destUuid: "Actor.Wiz", userId: "p1" });
  equal("W2 a partial withdrawal onto Wiz's existing arrows: one row of 11, 14 left", [r2.ok, rowsOf(wiz, "Arrows"), wiz.items.get("warrows").system.quantity, party.items.get("arrows").system.quantity], [true, 1, 11, 14]);
  conserved("W2");
  ok("W3 the card is posted only once it is done, and names the user", announced.length === 2 && /Wiz<\/strong> took 6 × <strong>Arrows/.test(announced[1]) && /User p1/.test(announced[1]), announced[1]);
  equal("W4 the journal has nothing pending, and both ids are recorded done", [PT.readJournal(party).pending.length, PT.readJournal(party).done.length], [0, 2]);
}

/* ------------------------------------------------------------ D. deposits */
{
  const r = await run({ kind: "deposit", itemUuid: "Actor.Wiz.Item.rope", quantity: 2, userId: "p1" });
  const pRope = [...party.items].find((i) => i.name === "Rope");
  equal("D1 a partial deposit: 2 rope to the party, 1 stays with Wiz", [r.ok, pRope?.system.quantity, wiz.items.get("rope").system.quantity], [true, 2, 1]);
  equal("D2 ...and it arrives unequipped (carry state belongs to the carrier)", pRope?.system.equipped, false);
  const r2 = await run({ kind: "deposit", itemUuid: "Actor.Wiz.Item.rope", quantity: 1, userId: "p1" });
  equal("D3 a full deposit: the last rope joins the party's stack of 2 (one row of 3), Wiz's row is gone", [r2.ok, rowsOf(party, "Rope"), [...party.items].find((i) => i.name === "Rope")?.system.quantity, wiz.items.get("rope") ?? null], [true, 1, 3, null]);
  conserved("D3");
  const r3 = await run({ kind: "deposit", itemUuid: "Actor.Wiz.Item.warrows", quantity: 11, userId: "p1" });
  equal("D4 a deposit onto the party's existing stack: the arrows are one row of 25", [r3.ok, rowsOf(party, "Arrows"), party.items.get("arrows").system.quantity], [true, 1, 25]);
  conserved("D4");
}

/* ------------------------------------------------------------ T. item types */
{
  const r = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.spell", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  ok("T1 a spell is not withdrawn: the inventory holds physical goods only", !r.ok && /spell, which the party inventory does not hold/.test(r.reason), r.reason);
  const r2 = await run({ kind: "deposit", itemUuid: "Actor.Wiz.Item.wspell", quantity: 1, userId: "p1" });
  ok("T2 nor is a spell deposited", !r2.ok && /spell/.test(r2.reason), r2.reason);
  wiz.add({ id: "claws", name: "Claws", type: "weapon", quantity: 1, system: { natural: true } });
  wiz.add({ id: "fist", name: "Fist", type: "weapon", quantity: 1, system: { unarmed: true } });
  wiz.add({ id: "gift", name: "Blessed Blade", type: "weapon", quantity: 1 }).flags = { "trg-prime": { grantedBy: { sourceId: "x", sourceName: "Divine Gift" } } };
  const nat = await run({ kind: "deposit", itemUuid: "Actor.Wiz.Item.claws", quantity: 1, userId: "p1" });
  const fist = await run({ kind: "deposit", itemUuid: "Actor.Wiz.Item.fist", quantity: 1, userId: "gm" });
  const gift = await run({ kind: "deposit", itemUuid: "Actor.Wiz.Item.gift", quantity: 1, userId: "gm" });
  ok("T4 a natural or unarmed weapon stays with its owner, even for the GM", !nat.ok && !fist.ok && /part of whoever has it/.test(nat.reason), nat.reason);
  ok("T5 an item granted by a feature stays with it, and says by what", !gift.ok && /granted by Divine Gift/.test(gift.reason), gift.reason);
  ok("T6 the deposit chooser leaves them out", /isLootItem\(i\) && quantityOf\(i\) > 0 && !transferRestriction\(i\)/.test(strip(read("module", "sheets", "party-sheet.mjs"))));
  rebase();
  equal("T3 the inventory types are the existing six", P.LOOT_ITEM_TYPES, ["weapon", "armour", "shield", "gear", "consumable", "ammunition"]);
  conserved("T");
}

/* ------------------------------------------------------------ O. ownership and membership */
{
  const r = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.potion", quantity: 1, destUuid: "Actor.Rog", userId: "p1" });
  ok("O1 a player cannot withdraw to another player's character", !r.ok && /do not own/.test(r.reason), r.reason);
  const r2 = await run({ kind: "deposit", itemUuid: "Actor.Rog.Item.dagger", quantity: 1, userId: "p1" });
  ok("O2 nor deposit another player's character's item", !r2.ok && /do not own/.test(r2.reason), r2.reason);
  const r3 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.potion", quantity: 1, destUuid: "Actor.Out", userId: "p1" });
  ok("O3 a player's own character outside the party is not a destination", !r3.ok && /not in Party/.test(r3.reason), r3.reason);
  const r4 = await run({ kind: "deposit", itemUuid: "Actor.Out.Item.gem", quantity: 1, userId: "p1" });
  ok("O4 nor a source", !r4.ok && /not in Party/.test(r4.reason), r4.reason);
  const r5 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.potion", quantity: 1, destUuid: "Actor.Party", userId: "gm" });
  ok("O5 the party is never its own destination", !r5.ok, r5.reason);
  conserved("O");
}

/* ------------------------------------------------------------ G. the GM's override */
{
  const r = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.potion", quantity: 1, destUuid: "Actor.Out", userId: "gm" });
  ok("G1 the GM, without the override, cannot give outside the roster either", !r.ok && /not in Party/.test(r.reason), r.reason);
  const r2 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.potion", quantity: 1, destUuid: "Actor.Out", userId: "p1", override: true });
  ok("G2 a player's request for the override is refused", !r2.ok && /only the GM/.test(r2.reason), r2.reason);
  const r3 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.potion", quantity: 1, destUuid: "Actor.Out", userId: "gm", override: true });
  equal("G3 the GM, with the override, gives the potion to Out", [r3.ok, rowsOf(out, "Potion")], [true, 1]);
  ok("G4 ...and the card says it went outside the party", /outside the party/.test(announced.at(-1)), announced.at(-1));
  ok("G4b the GM's Give reads as given, not taken (3.711.1, found live)", /Out<\/strong> was given <strong>Test|Out<\/strong> was given <strong>Potion/.test(announced.at(-1)) && /Given from the party/.test(announced.at(-1)), announced.at(-1));
  const r4 = await run({ kind: "deposit", itemUuid: "Actor.Out.Item.gem", quantity: 1, userId: "gm" });
  equal("G5 the GM may deposit from anyone", [r4.ok, rowsOf(party, "Gem")], [true, 1]);
  equal("G6 the GM gives to an NPC member", (await run({ kind: "withdraw", itemUuid: [...party.items].find((i) => i.name === "Gem").uuid, quantity: 1, destUuid: "Actor.Hen", userId: "gm" })).ok, true);
  conserved("G");
}

/* ------------------------------------------------------------ C. coin */
{
  const r = await run({ kind: "coinTake", coin: { gp: 2 }, destUuid: "Actor.Wiz", userId: "p1" });
  equal("C1 Take Coin: 2 gp to Wiz", [r.ok, wiz.system.currency.gp, party.system.currency.gp], [true, 12, 5]);
  const r2 = await run({ kind: "coinTake", coin: { gp: 50 }, destUuid: "Actor.Wiz", userId: "p1" });
  ok("C2 insufficient funds: 50 gp from a party with 5 is refused, nothing moves", !r2.ok && /does not have that much GP/.test(r2.reason) && party.system.currency.gp === 5, r2.reason);
  const r3 = await run({ kind: "coinTake", coin: { sp: 20 }, destUuid: "Actor.Wiz", userId: "p1" });
  ok("C3 coin is taken as coins: 20 sp from a party with 5 sp is refused, gold is not broken", !r3.ok && /SP/.test(r3.reason), r3.reason);
  const r4 = await run({ kind: "coinDeposit", coin: { gp: 3, sp: 3 }, sourceUuid: "Actor.Wiz", userId: "p1" });
  equal("C4 Deposit Coin: 3 gp 3 sp from Wiz to the treasury", [r4.ok, wiz.system.currency.gp, wiz.system.currency.sp, party.system.currency.gp, party.system.currency.sp], [true, 9, 0, 8, 8]);
  const r5 = await run({ kind: "coinDeposit", coin: { gp: 100 }, sourceUuid: "Actor.Wiz", userId: "p1" });
  ok("C5 insufficient funds on a deposit is refused in the character's name", !r5.ok && /Wiz does not have that much GP/.test(r5.reason), r5.reason);
  const r6 = await run({ kind: "coinDeposit", coin: { gp: 1 }, sourceUuid: "Actor.Rog", userId: "p1" });
  ok("C6 a player cannot deposit another's coin", !r6.ok && /do not own/.test(r6.reason), r6.reason);
  const r7 = await run({ kind: "coinTake", coin: { gp: 1 }, destUuid: "Actor.Rog", userId: "gm" });
  ok("C7 the GM gives coin to a member (Give Coin)", r7.ok && /was given/.test(announced.at(-1)), announced.at(-1));
  const r8 = await run({ kind: "coinTake", coin: {}, destUuid: "Actor.Wiz", userId: "p1" });
  ok("C8 no coin asked for is refused", !r8.ok, r8.reason);
  conserved("C");
}

/* ------------------------------------------------------------ S. split */
{
  equal("S1 the plan: 7 gp 5 sp 2 cp among 3 is 2 gp 1 sp each; 1 gp 2 sp 2 cp stay", (() => {
    const p = PT.planCoinSplit({ pot: { gp: 7, sp: 5, cp: 2 }, recipients: [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }] });
    return [p.share, p.remainder];
  })(), [{ mp: 0, pp: 0, gp: 2, sp: 1, cp: 0 }, { mp: 0, pp: 0, gp: 1, sp: 2, cp: 2 }]);
  const p = PT.planCoinSplit({ pot: { mp: 1, pp: 3, gp: 7, sp: 5, cp: 2 }, recipients: [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }, { uuid: "a" }] });
  ok("S2 shares plus remainder are exactly the pot (no value created or destroyed), a duplicate recipient counted once", p.allocations.length === 3
    && P.COIN_DENOMINATIONS.every((k) => p.share[k] * 3 + p.remainder[k] === ({ mp: 1, pp: 3, gp: 7, sp: 5, cp: 2 })[k]));
  ok("S3 a pot too small for anyone is refused, not split into nothing", !PT.planCoinSplit({ pot: { gp: 2 }, recipients: [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }] }).ok);
  // The live split: the party has 7 gp 8 sp 2 cp.
  party.system.currency = { mp: 0, pp: 0, gp: 7, sp: 8, cp: 2 };
  rebase();
  const before = wealth();
  const preview = PT.planCoinSplit({ pot: party.system.currency, recipients: [wiz, rog, hen].map((a) => ({ uuid: a.uuid, name: a.name })) });
  const r = await run({ kind: "coinSplit", recipients: ["Actor.Wiz", "Actor.Rog", "Actor.Hen"], coin: preview.share, userId: "gm" });
  equal("S4 the split: each member +2 gp 2 sp; 1 gp 2 sp 2 cp stay in the treasury", [r.ok, party.system.currency, hen.system.currency.gp, hen.system.currency.sp], [true, { mp: 0, pp: 0, gp: 1, sp: 2, cp: 2 }, 2, 2]);
  equal("S5 ...and no copper was made or lost", wealth(), before);
  ok("S6 the card names each share and what stays", /2 GP, 2 SP each/.test(announced.at(-1)) && /stays in the treasury/.test(announced.at(-1)), announced.at(-1));
  const r2 = await run({ kind: "coinSplit", recipients: ["Actor.Wiz"], coin: { gp: 9 }, userId: "gm" });
  ok("S7 a split whose shown shares no longer match the treasury is refused, not redone", !r2.ok && /changed since/.test(r2.reason), r2.reason);
  const r3 = await run({ kind: "coinSplit", recipients: ["Actor.Wiz", "Actor.Rog"], userId: "p1" });
  ok("S8 a player cannot split (Graham: GM only)", !r3.ok && /only the GM/.test(r3.reason), r3.reason);
  const r4 = await run({ kind: "coinSplit", recipients: ["Actor.Out"], userId: "gm" });
  ok("S9 a share goes only to a member", !r4.ok && /member/.test(r4.reason), r4.reason);
  conserved("S");
}

/* ------------------------------------------------------------ Q. concurrency */
{
  party.add({ id: "elixir", name: "Elixir", type: "consumable", quantity: 1 });
  const before = countOf("Elixir");
  const [a, b] = await Promise.all([
    run({ kind: "withdraw", itemUuid: "Actor.Party.Item.elixir", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" }),
    run({ kind: "withdraw", itemUuid: "Actor.Party.Item.elixir", quantity: 1, destUuid: "Actor.Rog", userId: "p2" })
  ]);
  equal("Q1 two players ask for the last elixir at once: exactly one gets it", [a.ok, b.ok].filter(Boolean).length, 1);
  ok("Q2 ...the other is told plainly", /no longer in the party inventory/.test((a.ok ? b : a).reason), (a.ok ? b : a).reason);
  equal("Q3 ...and there is still exactly one elixir", countOf("Elixir"), before);
  party.system.currency = { mp: 0, pp: 0, gp: 3, sp: 0, cp: 0 };
  rebase();
  const w = wealth();
  const coins = await Promise.all([1, 2, 3].map(() => run({ kind: "coinTake", coin: { gp: 2 }, destUuid: "Actor.Wiz", userId: "p1" })));
  equal("Q4 three requests for 2 gp from 3 gp at once: one succeeds, the treasury never goes negative", [coins.filter((c) => c.ok).length, party.system.currency.gp], [1, 1]);
  equal("Q5 ...and no copper was made", wealth(), w);
}

/* ------------------------------------------------------------ R. duplicates and replays */
{
  party.add({ id: "tonic", name: "Tonic", type: "consumable", quantity: 3 });
  const one = req({ kind: "withdraw", itemUuid: "Actor.Party.Item.tonic", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  const first = await PT.performTransfer(one, deps);
  const again = await PT.performTransfer(one, deps);
  equal("R1 the same request twice: the second is refused as already handled, one tonic moved", [first.ok, again.ok, again.duplicate, party.items.get("tonic").system.quantity], [true, false, true, 2]);
  const otherClient = makeDeps();
  const replay = await PT.performTransfer(one, otherClient);
  equal("R2 replayed to a client that has never seen it (a second GM): the party's journal refuses it", [replay.ok, replay.duplicate, party.items.get("tonic").system.quantity], [false, true, 2]);
  const both = await Promise.all([PT.performTransfer({ ...one, requestId: "same-id" }, deps), PT.performTransfer({ ...one, requestId: "same-id" }, deps)]);
  equal("R3 the same id twice at the same moment: one runs", both.filter((r) => r.ok).length, 1);
  ok("R4 a request without an id is refused", !(await PT.performTransfer({ ...one, requestId: "" }, deps)).ok);
  equal("R5 the journal keeps the last ids, no more", (() => {
    let j = { pending: [], done: [] };
    for (let i = 0; i < PT.JOURNAL_DONE_LIMIT + 5; i++) j = PT.journalFinish(PT.journalClaim(j, { id: `r${i}` }), `r${i}`);
    return [j.done.length, j.done[0], PT.journalHas(j, `r${PT.JOURNAL_DONE_LIMIT + 4}`), j.pending.length];
  })(), [PT.JOURNAL_DONE_LIMIT, "r5", true, 0]);
  // Where the journal cannot help (its write was lost), this client's own
  // memory still refuses the second copy.
  const forgetful = makeDeps({ writeJournal: async () => {} });
  const lost = req({ kind: "withdraw", itemUuid: "Actor.Party.Item.tonic", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  const l1 = await PT.performTransfer(lost, forgetful);
  const l2 = await PT.performTransfer(lost, forgetful);
  equal("R7 with the journal's writes lost, the same request twice still moves one tonic", [l1.ok, l2.ok, l2.duplicate, rowsOf(party, "Tonic"), countOf("Tonic")], [true, false, true, 0, 3]);
  const ledger = new PT.RequestLedger(3);
  for (const id of ["a", "b", "c", "d"]) ledger.add(id);
  equal("R6 this client's memory is bounded", [ledger.has("a"), ledger.has("d")], [false, true]);
}

/* ------------------------------------------------------------ M. multiple GMs */
{
  const gmA = { id: "gmA", isGM: true }, gmB = { id: "gmB", isGM: true }, player = { id: "p1", isGM: false };
  equal("M1 with two GMs connected, only the designated one performs", [PS.shouldHandleAsGM(gmA, gmA), PS.shouldHandleAsGM(gmB, gmA), PS.shouldHandleAsGM(player, gmA)], [true, false, false]);
  equal("M2 a second tab of the designated GM does not", PS.shouldHandleAsGM(gmA, gmA, false), false);
  party.add({ id: "salve", name: "Salve", type: "consumable", quantity: 2 });
  const replies = [];
  const message = req({ kind: "withdraw", itemUuid: "Actor.Party.Item.salve", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  const sharedJournalParty = deps;
  const onA = await PS.handlePartyMessage(message, { user: gmA, activeGM: gmA, deps: sharedJournalParty, reply: (m) => replies.push(m) });
  const onB = await PS.handlePartyMessage(message, { user: gmB, activeGM: gmA, deps: makeDeps(), reply: (m) => replies.push(m) });
  equal("M3 the broadcast reaches both GMs; one salve moves", [onA.handled, onB.handled, party.items.get("salve").system.quantity], [true, false, 1]);
  equal("M4 the performer answers the requester, once, with the result", [replies.length, replies[0]?.action, replies[0]?.requestId === message.requestId, replies[0]?.result?.ok], [1, PS.PARTY_RESULT, true, true]);
  const dup = await PS.handlePartyMessage(message, { user: gmA, activeGM: gmA, deps: sharedJournalParty, reply: (m) => replies.push(m) });
  equal("M5 a duplicate is not answered: the first answer stands", [dup.result.duplicate, replies.length], [true, 1]);
  const handover = await PS.handlePartyMessage(message, { user: gmB, activeGM: gmB, deps: makeDeps(), reply: (m) => replies.push(m) });
  equal("M6 after a hand-over to the other GM, the replayed message still moves nothing (the journal)", [handover.result.ok, party.items.get("salve").system.quantity], [false, 1]);
  const SOCK = strip(read("module", "party-socket.mjs"));
  ok("M7 a GM who is not the performer relays like a player", /if \(iPerform\(\)\) \{\s*result = await performTransfer\(request, liveDeps\(\)\);\s*\} else if \(!game\.users\.activeGM\) \{/.test(SOCK));
  ok("M8 with no GM connected the player is told, rather than a request vanishing", /no GM is connected to carry out party transfers/.test(SOCK));
  ok("M9 an unanswered request is reported as unknown, never as failed", /it may have happened/.test(SOCK) && /unknown: true/.test(SOCK) && PS.REPLY_TIMEOUT_MS >= 5000);
  conserved("M");
}

/* ------------------------------------------------------------ F. failures */
{
  party.add({ id: "lamp", name: "Lamp", type: "gear", quantity: 2 });
  wiz.fail.create = true;
  const r1 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.lamp", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  wiz.fail.create = false;
  equal("F1 the destination's write fails: nothing moved, nothing pending", [r1.ok, party.items.get("lamp").system.quantity, rowsOf(wiz, "Lamp"), PT.readJournal(party).pending.length], [false, 2, 0, 0]);
  party.fail.updateItems = true;
  const r2 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.lamp", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  party.fail.updateItems = false;
  equal("F2 the source's write fails after the destination's: Wiz's new lamp is undone", [r2.ok, party.items.get("lamp").system.quantity, rowsOf(wiz, "Lamp")], [false, 2, 0]);
  ok("F3 ...and the player is told it did not happen", /did not happen/.test(r2.reason), r2.reason);
  wiz.add({ id: "wlamp", name: "Lamp", type: "gear", quantity: 4 });
  party.fail.updateItems = true;
  const r3 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.lamp", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  party.fail.updateItems = false;
  equal("F4 onto an existing stack: the merge is undone to its old quantity", [r3.ok, wiz.items.get("wlamp").system.quantity, party.items.get("lamp").system.quantity], [false, 4, 2]);
  const alertsBefore = alerted.length;
  party.fail.updateItems = true;
  // Wiz's merge lands; then Wiz refuses every write after it, so the undo fails.
  wiz.onUpdateItems = () => { wiz.fail.updateItems = true; wiz.onUpdateItems = null; };
  const r4 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.lamp", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  party.fail.updateItems = false;
  wiz.fail.updateItems = false;
  const pend = PT.readJournal(party).pending;
  ok("F5 the undo fails too: the result says so, plainly", !r4.ok && r4.unresolved === true && /could not be undone/.test(r4.reason), r4.reason);
  ok("F6 ...the journal keeps it pending, with what is out of step", pend.length === 1 && /Check both inventories by hand/.test(pend[0].unresolved));
  ok("F7 ...and the GMs are told", alerted.length === alertsBefore + 1 && /needs checking/.test(alerted.at(-1)));
  ok("F8 ...and no success card was posted for it", !announced.some((c) => /Lamp/.test(c)));
  // Put Wiz right by hand, as the GM would, and mark it checked.
  wiz.items.get("wlamp").system.quantity = 4;
  await party.update({ "flags.trg-prime.transferJournal": PT.journalFinish(PT.readJournal(party), pend[0].id) });
  equal("F9 the GM marks it checked: nothing pending", PT.readJournal(party).pending.length, 0);
  const w = wealth();
  party.fail.update = true;
  const r5 = await run({ kind: "coinTake", coin: { gp: 1 }, destUuid: "Actor.Wiz", userId: "p1" });
  party.fail.update = false;
  equal("F10 coin: the treasury's write fails after Wiz's: Wiz's purse is put back", [r5.ok, wealth()], [false, w]);
  rog.fail.update = true;
  party.system.currency = { mp: 0, pp: 0, gp: 6, sp: 0, cp: 0 };
  const w2 = wealth();
  const r6 = await run({ kind: "coinSplit", recipients: ["Actor.Wiz", "Actor.Rog", "Actor.Hen"], coin: { mp: 0, pp: 0, gp: 2, sp: 0, cp: 0 }, userId: "gm" });
  rog.fail.update = false;
  equal("F11 a split where one member's write fails: the shares already paid are taken back", [r6.ok, wealth(), party.system.currency.gp], [false, w2, 6]);
  equal("F12 runSteps itself: a failure undoes the earlier steps, newest first", await (async () => {
    const log = [];
    const res = await PT.runSteps([
      { label: "a", run: async () => log.push("a"), undo: async () => log.push("undo a") },
      { label: "b", run: async () => log.push("b"), undo: async () => log.push("undo b") },
      { label: "c", run: async () => { throw new Error("no"); }, undo: async () => log.push("undo c") }
    ]);
    return [res.ok, res.failed, log];
  })(), [false, "c", ["a", "b", "undo b", "undo a"]]);
}

/* ------------------------------------------------------------ X. missing actors and items */
{
  const r1 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.nothing", quantity: 1, destUuid: "Actor.Wiz", userId: "p1" });
  ok("X1 an item that is gone is refused", !r1.ok && /no longer in the party inventory/.test(r1.reason), r1.reason);
  const r2 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.lamp", quantity: 1, destUuid: "Actor.Gone", userId: "gm" });
  ok("X2 a destination that is gone is refused", !r2.ok && /no longer available/.test(r2.reason), r2.reason);
  const r3 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.lamp", quantity: 1, destUuid: "Actor.Wiz", userId: "p1", partyUuid: "Actor.NoParty" });
  ok("X3 a party that is gone is refused", !r3.ok && /party is no longer available/.test(r3.reason), r3.reason);
  // The source item vanishes WHILE the destination is written (another hand deletes it).
  rog.onCreate = () => { party._map.delete("lamp"); rog.onCreate = null; };
  const lampsBefore = countOf("Lamp");
  const r4 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.lamp", quantity: 2, destUuid: "Actor.Rog", userId: "p2" });
  equal("X4 the source is gone by the time it is written: the destination's copy is undone", [r4.ok, countOf("Lamp"), lampsBefore - 2], [false, lampsBefore - 2, lampsBefore - 2]);
  ok("X5 ...with the reason", /no longer has 2 of Lamp/.test(r4.reason), r4.reason);
  // The source stack shrinks while the destination is written.
  party.add({ id: "chalk", name: "Chalk", type: "gear", quantity: 5 });
  wiz.onCreate = () => { party._map.get("chalk").system.quantity = 1; wiz.onCreate = null; };
  // (Wiz has no chalk, so this is a create, and the hook fires.)
  const r5 = await run({ kind: "withdraw", itemUuid: "Actor.Party.Item.chalk", quantity: 3, destUuid: "Actor.Wiz", userId: "p1" });
  equal("X6 read again before the source write: 3 asked, 1 left, refused and undone", [r5.ok, countOf("Chalk")], [false, 1]);
  world.delete("Actor.Out");
  const r6 = await run({ kind: "coinTake", coin: { gp: 1 }, destUuid: "Actor.Out", userId: "gm", override: true });
  ok("X7 a destination actor deleted is refused", !r6.ok, r6.reason);
  world.set("Actor.Out", out);
}

/* ------------------------------------------------------------ P. repeated drag and drop */
{
  party.add({ id: "torch", name: "Torch", type: "gear", quantity: 2 });
  const drops = await Promise.all([1, 2, 3].map(() => run({ kind: "withdraw", itemUuid: "Actor.Party.Item.torch", quantity: 2, destUuid: "Actor.Hen", userId: "gm", origin: "drag" })));
  equal("P1 the same stack dropped on a member three times: it moves once, none duplicated", [drops.filter((d) => d.ok).length, countOf("Torch"), rowsOf(hen, "Torch")], [1, 2, 1]);
  ok("P2 the card says it was given by the GM's drag", /was given 2 × <strong>Torch/.test(announced.filter((c) => /Torch/.test(c)).at(-1) ?? ""));
  const SHEET = strip(read("module", "sheets", "party-sheet.mjs"));
  ok("P3 every transfer from the sheet holds one lock for the party, dialogs included", /#transferOnce\(work\) \{\s*return runOnce\(TRGPartySheet\.#running, `\$\{this\.actor\.uuid\}:transfer`, work\);/.test(SHEET)
    && (SHEET.match(/this\.#transferOnce\(/g) ?? []).length >= 6);
  ok("P4 a drag onto a character's own sheet by the GM is a move through the same lock, not Foundry's copy", /TRGPartySheet\.distributeByDrag\(source, actor\)/.test(SHEET) && /return false;\s*\}\s*const reason = refusePartyLootDrag/.test(SHEET)
    && /static async distributeByDrag\(item, actor\) \{[\s\S]*?runOnce\(TRGPartySheet\.#running, `\$\{party\.uuid\}:transfer`/.test(SHEET));
  ok("P5 a drop from the party onto the member strip is a withdrawal, not a create", /const strip = event\.target\?\.closest\?\.\("\[data-drop-member\]"\);\s*if \(strip && isGM\) return this\.#distribute\(item, strip\.dataset\.dropMember\);/.test(SHEET));
  ok("P6 a drop from a character is a deposit (a move), not a copy", /if \(holder\?\.documentName === "Actor"\) \{[\s\S]*?kind: TRANSFER_KINDS\.DEPOSIT/.test(SHEET));
  ok("P7 a player's drop of new loot is refused; the GM's still runs the drop hook and the type check", /Only the GM can add new loot/.test(SHEET) && /Hooks\.call\("dropActorSheetData", this\.actor, this, data\);\s*if \(allowed === false\) return null;\s*return this\._onDropItem\(event, item\);/.test(SHEET) && /planLootDrop\(\{ item, isGM/.test(SHEET));
}

/* ------------------------------------------------------------ I. the inventory page */
{
  equal("I1 weapon details from the weapon's own fields", PT.itemDetail({ type: "weapon", system: { damage: "1d8", damageType: "slashing", quality: "superior", runes: "x" } }), "1d8 slashing · superior · runes");
  equal("I2 armour, shield, consumable", [
    PT.itemDetail({ type: "armour", system: { dr: 3, category: "medium" } }),
    PT.itemDetail({ type: "shield", system: { defenceBonus: 2, dr: 1 } }),
    PT.itemDetail({ type: "consumable", system: { uses: { value: 2, max: 3 }, activation: "action" } })
  ], ["DR 3 · medium", "Defence +2 · DR 1", "2/3 uses · action"]);
  equal("I3 nothing invented for an item that stores nothing", PT.itemDetail({ type: "gear", system: { quality: "standard" } }), "");
  equal("I4 the filter: by name anywhere, any case, and by type", [
    PT.matchesInventoryFilter({ name: "Potion of Healing", type: "consumable" }, { search: "HEAL" }),
    PT.matchesInventoryFilter({ name: "Potion of Healing", type: "consumable" }, { type: "weapon" }),
    PT.matchesInventoryFilter({ name: "Sword", type: "weapon" }, {})
  ], [true, false, true]);
  const payload = PT.payloadFor({ toObject: () => ({ _id: "x", name: "Ring", type: "gear", system: { quantity: 9, equipped: true, stowed: true, invested: true } }) }, 2);
  equal("I5 what arrives: the quantity moved, in hand (not equipped, stowed or invested), with a new id", [payload.system.quantity, payload.system.equipped, payload.system.stowed, payload.system.invested, "_id" in payload], [2, false, false, false, false]);
  ok("I6 a merge ignores carry state, so an invested ring still joins its stack", P.findMergeTarget([{ name: "Ring", type: "gear", system: { quantity: 1, invested: false }, flags: {} }], { name: "Ring", type: "gear", system: { quantity: 1, invested: true }, flags: {} }) !== null);
  equal("I7 a quantity above what is held is refused, not quietly reduced", PT.planItemMove({ item: { name: "X", type: "gear", system: { quantity: 2 } }, requested: 3 }).ok, false);
  equal("I8 subtractCoin", PT.subtractCoin({ gp: 5, sp: 2 }, { gp: 1 }), { mp: 0, pp: 0, gp: 4, sp: 2, cp: 0 });
  equal("I9 planCoinMove names the holder", PT.planCoinMove({ from: { gp: 1 }, request: { gp: 2 }, fromLabel: "Wiz" }).reason, "Wiz does not have that much GP");
  equal("I10 destination and source rules, directly", [
    PT.destinationAllowed({ party, dest: wiz, requesterIsGM: false, userOwnsDestination: true }).ok,
    PT.destinationAllowed({ party, dest: { uuid: "Actor.Z", name: "Z", type: "vehicle" }, requesterIsGM: true }).ok,
    PT.sourceAllowed({ party, source: out, requesterIsGM: false, userOwnsSource: true }).ok,
    PT.sourceAllowed({ party, source: out, requesterIsGM: true }).ok
  ], [true, false, false, true]);
  ok("I11 the card helper names who did it", /By Testing Dude/.test(PT.transferCard({ title: "t", line: "l", who: "Testing Dude" })));
}

/* ------------------------------------------------------------ U. the sheet */
{
  const SHEET = strip(read("module", "sheets", "party-sheet.mjs"));
  const HBS = read("templates", "actor", "party-sheet.hbs");
  ok("U1 players' controls are marked for players: Take, Deposit Item, Deposit Coin, Take Coin, open item, search and filter",
    /data-player-ok data-action="takeItem"/.test(HBS) && /data-player-ok data-action="depositItem"/.test(HBS) && /data-player-ok data-action="depositCoin"/.test(HBS)
    && /class="party-take-coin" data-player-ok data-action="takeCoin"/.test(HBS) && /data-player-ok data-action="openLootItem"/.test(HBS)
    && /<input type="search" data-inventory-search data-player-ok/.test(HBS) && /<select data-inventory-type data-player-ok/.test(HBS));
  ok("U2 the GM's are not: Give Coin, Split Coin, Checked, Remove", /class="party-take-coin" data-action="takeCoin"><i[^>]*><\/i> Give Coin/.test(HBS)
    && !/data-player-ok[^>]*data-action="splitCoin"/.test(HBS) && !/data-player-ok[^>]*data-action="resolveTransfer"/.test(HBS) && !/data-player-ok[^>]*data-action="deleteLoot"/.test(HBS));
  ok("U3 the search and filter are unnamed (they never reach the actor) and kept across renders", !/data-inventory-search[^>]*name=/.test(HBS) && /value="\{\{inventory\.search\}\}"/.test(HBS) && /#filter = \{ search: "", type: "" \};/.test(SHEET)
    && /if \(input\?\.dataset\?\.inventorySearch !== undefined \|\| input\?\.dataset\?\.inventoryType !== undefined\) return;/.test(SHEET));
  ok("U4 the table shows icon, name, type, quantity, weight and details; the type list is built from the types present", /<th>Name<\/th><th>Type<\/th><th>Qty<\/th>/.test(HBS) && /<th>Details<\/th>/.test(HBS) && /\{\{row\.typeLabel\}\}/.test(HBS) && /\{\{row\.detail\}\}/.test(HBS)
    && /const types = LOOT_ITEM_TYPES\s*\.filter\(\(type\) => loot\.rows\.some\(\(row\) => row\.type === type\)\)/.test(SHEET));
  ok("U5 an item opens its own sheet only where this user may observe it", /canOpen: Boolean\(item\) && \(isGM \|\| item\.testUserPermission\?\.\(game\.user, "OBSERVER"\) === true\)/.test(SHEET) && /static async openLootItem\(event, target\) \{[\s\S]*?testUserPermission\?\.\(game\.user, "OBSERVER"\) !== true[\s\S]*?item\.sheet\?\.render\(true\);/.test(SHEET));
  ok("U6 destinations default to the party's members this user owns; the GM's override is a separate, labelled group", /\.filter\(\(a\) => HOLDER_TYPES\.includes\(a\.type\) && \(isGM \|\| a\.isOwner\)\)/.test(SHEET) && /<optgroup label="Outside the party \(GM\)">/.test(SHEET)
    && /override: picked\.override && isGM/.test(SHEET));
  ok("U7 the split preview is the engine's own plan, recalculated as the ticks change, and its shares travel with the request", /const plan = planCoinSplit\(\{ pot, recipients: chosen \}\);/.test(SHEET) && /form\.addEventListener\("change", \(\) => preview\(form\)\);/.test(SHEET)
    && /recipients: choice\.recipients, coin: choice\.share/.test(SHEET));
  ok("U8 a typed quantity is not clamped on the way: too many is refused with the reason", /NOT CLAMPED/.test(read("module", "sheets", "party-sheet.mjs")) && /return Math\.max\(0, Math\.floor\(Number\(value\) \|\| 0\)\);/.test(SHEET));
  ok("U9 unfinished transfers are shown to the GM alone, and marking one checked moves nothing", /const pending = isGM \? this\.#pendingTransfers\(\) : \[\];/.test(SHEET) && /\{\{#if inventory\.hasPending\}\}/.test(HBS)
    && /static async resolveTransfer\(event, target\) \{\s*event\.preventDefault\(\);\s*if \(!game\.user\.isGM\) return;/.test(SHEET));
  ok("U10 nothing writes the party's items or coin from the sheet except the GM's own edit and the engine", !/this\.actor\.(update|updateEmbeddedDocuments|deleteEmbeddedDocuments|createEmbeddedDocuments)\(\{?\s*"?system\.currency/.test(SHEET)
    && !/requestTake(Item|Coin)/.test(SHEET));
  const ENG = strip(read("module", "party-transfers.mjs"));
  ok("U11 the engine announces only after the journal says done", /await deps\.writeJournal\(party, journalFinish\(readJournal\(party\), request\.requestId\)\);\s*await deps\.announce\?\.\(plan\.card\(who\)\);/.test(ENG));
  ok("U12 the claim is written before the first step runs", /await deps\.writeJournal\(party, journalClaim\(readJournal\(party\), record\)\);\s*const result = await runSteps\(plan\.steps\);/.test(ENG));
  ok("U13 the destination is written before the source, in every item move", /label: `add to \$\{receiver\.name\}`[\s\S]*?label: `remove from \$\{holder\.name\}`/.test(ENG));
  ok("U14 the deposit button, the treasury buttons and the drop strip are offered only when this user has a member to act for", /canDeposit: myMembers\.length > 0/.test(SHEET) && /\{\{#if inventory\.members\.length\}\}/.test(HBS) && /members: isGM \? myMembers : \[\]/.test(SHEET));
}

/* ------------------------------------------------------------ L. found live on 3.711.0, fixed in 3.711.1 */
{
  const SHEET = strip(read("module", "sheets", "party-sheet.mjs"));
  const LANG = JSON.parse(read("lang", "en.json"));
  ok("L1 a player's drop reaches the sheet: drops are heard from everyone, and _onDrop decides", /_canDragDrop\(selector\) \{\s*return true;\s*\}/.test(SHEET)
    && /if \(!isGM && !holder\.isOwner\) \{/.test(SHEET) && /Only the GM can change the party roster/.test(SHEET));
  ok("L2 the deposit chooser reads its field by name, not the collection's item() method", /<select name="depositItem">/.test(SHEET) && /button\.form\.elements\.namedItem\("depositItem"\)\?\.value/.test(SHEET) && !/elements\.item\b/.test(SHEET));
  equal("L3 every item type has a label (the inventory's Type column and the item sheet's title)",
    JSON.parse(read("template.json")).Item.types.filter((t) => !LANG.TYPES?.Item?.[t]), []);
  ok("L4 an unlocalised type falls back to the type, never the raw key", /return label && label !== key \? label : type\.charAt\(0\)\.toUpperCase\(\) \+ type\.slice\(1\);/.test(SHEET));
}

/* ------------------------------------------------------------ Z. the version */
{
  const sys = JSON.parse(read("system.json"));
  equal("Z1 the version is 3.713.0, the download names it, and package.json agrees",
    [sys.version, sys.download.includes("/v3.720.0/"), JSON.parse(read("package.json")).version], ["3.720.0", true, "3.720.0"]);
}

if (failures.length) {
  console.log(`verify-party-sheet-stage4: ${failures.length} of ${checks} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log(`verify-party-sheet-stage4: ${checks} checks — all green.`);
}
