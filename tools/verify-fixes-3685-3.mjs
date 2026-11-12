#!/usr/bin/env node
/**
 * verify-fixes-3685-3 — TRG Prime 3.685.3, a patch on 3.685.2. Graham, after
 * the 3.685.2 review: "Fix the problems first". These are the hooks that
 * review listed under "For Graham", each of which asked `game.user.isGM`
 * and so did the wrong thing on some client.
 *
 *   C  A conjured item's clock is deleted ONCE (conjured-item-workflow.mjs,
 *      `deleteItem`). Every GM deleted it; now the acting GM.
 *   K  Power Crystals (power-crystal-workflow.mjs).
 *      `createItem` / `deleteItem` fire on every client, so every GM settled
 *      a crystal's arrival or departure, and a crystal could be counted in or
 *      out twice. Now the acting GM.
 *      `preUpdateActor` fires ONLY on the client that made the update. Asking
 *      `isGM` there meant a spend a player made on their own client — every
 *      cast from their own sheet — never drew a crystal down. Now it asks
 *      whether this client owns the actor, which every write it makes needs.
 *   P  A suppressed peril is re-armed ONCE (peril-workflow.mjs,
 *      `updateWorldTime`). Every GM re-armed and whispered; now the acting GM.
 *   Q  A pending cast lapses only when it is orphaned (pending-cast-workflow
 *      `ready`). Every GM's load lapsed every casting, including one a player
 *      was still making in their own browser, and two GMs each posted
 *      "— Lapsed". Now a record names its user, and the rule is
 *      `pendingCastLapsesAtStartup`.
 *   Z  The version.
 *
 * Each hook is the real one, registered by its own module and driven on the
 * clients Foundry fires it on, together, with each write landing a moment
 * later as the server's round trip does.
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
const later = () => new Promise((resolve) => setTimeout(resolve, 5));
const settleAll = async () => { for (let i = 0; i < 8; i += 1) await later(); };

/* ------------------------------------------------------------ the world */
globalThis.foundry ??= { applications: { api: { DialogV2: class {} } }, utils: {} };
const cards = [];
globalThis.ChatMessage = {
  create: async (data) => { cards.push(data); return data; },
  getSpeaker: () => ({}),
  getWhisperRecipients: () => [{ id: "gmA0000000000000" }]
};
/** Each module registers into its own table, so two `deleteItem` hooks are told apart. */
function registered(register) {
  const handlers = {};
  globalThis.Hooks = { on: (name, fn) => { (handlers[name] ??= []).push(fn); }, once: (name, fn) => { (handlers[name] ??= []).push(fn); } };
  register();
  return handlers;
}
const gmA = { id: "gmA0000000000000", isGM: true, active: true };
const gmB = { id: "gmB0000000000000", isGM: true, active: true };
const player = { id: "player0000000000", isGM: false, active: true };
const other = { id: "other00000000000", isGM: false, active: true };
/**
 * Every listed client runs the hook together, as Foundry fires it on each.
 * Each call reads `game.user` before its first await, so each is set up as
 * its own client.
 */
async function onClients(clients, activeGM, run, extra = {}) {
  const errors = [];
  const error = console.error; console.error = (...a) => errors.push(a.map(String).join(" "));
  try {
    const runs = [];
    for (const user of clients) {
      globalThis.game = { user, users: { activeGM }, ...extra };
      runs.push(run());
    }
    await Promise.all(runs);
    await settleAll();
  } finally { console.error = error; }
  return errors;
}

/* ------------------------------------------------------------ C. the conjured item's clock */
const conjured = await imp("magic/conjured-item-workflow.mjs");
const conjuredHook = registered(conjured.registerConjuredItemHooks).deleteItem?.[0];
function holderWithClock() {
  const effects = [{ id: "clock00000000000a", getFlag: (_s, k) => (k === "conjuredItemId" ? "berry00000000001" : null) }];
  const log = { deletes: 0, failed: 0 };
  const collection = {
    get size() { return effects.length; },
    filter: (fn) => effects.filter(fn)
  };
  const actor = {
    get effects() { return collection; },
    deleteEmbeddedDocuments: async (_t, ids) => {
      log.deletes += 1;
      await later();
      for (const id of ids) { const i = effects.findIndex((e) => e.id === id); if (i < 0) { log.failed += 1; throw new Error(`ActiveEffect ${id} does not exist`); } effects.splice(i, 1); }
    }
  };
  return { actor, log, item: { id: "berry00000000001", parent: actor } };
}
{
  const h = holderWithClock();
  await onClients([gmB, gmA, player], gmA, () => conjuredHook?.(h.item));
  equal("C1 THE DEFECT, cured: with two GMs connected a conjured item's clock is deleted once, and no second delete fails", [h.log.deletes, h.log.failed], [1, 0]);
}
{
  const h = holderWithClock();
  await onClients([gmB], gmA, () => conjuredHook?.(h.item));
  await onClients([player], gmA, () => conjuredHook?.(h.item));
  equal("C2 the GM who is not active, and a player, delete nothing", h.log.deletes, 0);
  await onClients([gmA], null, () => conjuredHook?.(h.item));
  equal("C3 a lone GM with no active GM designated still deletes it", h.log.deletes, 1);
}

/* ------------------------------------------------------------ K. Power Crystals */
const { CRYSTAL_FLAG, crystalTotal } = await imp("magic/power-crystal.mjs");
const crystalHooks = registered((await imp("magic/power-crystal-workflow.mjs")).registerPowerCrystalHooks);
const spendHook = crystalHooks.preUpdateActor?.[0];
const arrivalHook = crystalHooks.createItem?.[0];
const departureHook = crystalHooks.deleteItem?.[0];
/**
 * A holder: their own maximum, a pool, crystals. Owned by `owners` (and by
 * every GM, as Foundry has it). The derived maximum reads the crystals, as
 * actor.mjs does. A pool write is applied at once and acknowledged a moment
 * later, so a second client settling the same crystal reads the first's
 * write and adds or takes again, the count the review warned of. Every write
 * is logged against the document it touched.
 */
function holder({ name = "H", value, ownMax, crystals = [], owners = [] }) {
  const writes = [];
  const flags = {};
  const items = [];
  items.get = (id) => items.find((i) => i.id === id);
  const pp = { value, get max() { return ownMax + crystalTotal(items); } };
  const actor = {
    name, uuid: `Actor.${name}`,
    system: { resources: { pp } },
    items,
    get isOwner() { return Boolean(globalThis.game?.user?.isGM || owners.includes(globalThis.game?.user?.id)); },
    getFlag: (_s, k) => flags[k],
    update: async (changes) => {
      writes.push({ doc: actor.uuid, kind: "update", by: game.user.id, changes });
      if ("system.resources.pp.value" in changes) pp.value = changes["system.resources.pp.value"];
      await later();
    },
    deleteEmbeddedDocuments: async (type, ids) => {
      writes.push({ doc: actor.uuid, kind: "delete", by: game.user.id, type, ids: [...ids] });
      await later();
      for (const id of ids) { const i = items.findIndex((x) => x.id === id); if (i < 0) throw new Error(`Item ${id} does not exist`); items.splice(i, 1); }
    }
  };
  for (const [id, points] of crystals) {
    const item = {
      id, parent: actor, flags: { "trg-prime": { [CRYSTAL_FLAG]: { pp: points } } },
      setFlag: async (s, k, v) => { writes.push({ doc: `${actor.uuid}.Item.${id}`, kind: "setFlag", by: game.user.id, value: v }); item.flags[s][k] = v; await later(); }
    };
    items.push(item);
  }
  return { actor, writes, pp };
}
const spend = (actor, to) => spendHook?.(actor, { system: { resources: { pp: { value: to } } } }, {}, game.user.id);
const crystalPP = (h, id) => h.actor.items.get(id)?.flags?.["trg-prime"]?.[CRYSTAL_FLAG]?.pp;

{
  // A wizard of 10 PP holding a 3-PP crystal, at 13, casts a 3-PP spell from
  // their own sheet: castSpell's `actor.update` runs on THEIR client, so this
  // hook runs there and only there.
  const h = holder({ value: 13, ownMax: 10, crystals: [["crystal000000001", 3]], owners: [player.id] });
  cards.length = 0;
  await onClients([player], gmA, () => spend(h.actor, 10));
  ok("K1 THE DEFECT, cured: a spend a player makes on their own client draws their crystal down — emptied, then dissolved, with its card",
    h.actor.items.length === 0 && h.writes.some((w) => w.kind === "setFlag" && w.value?.pp === 0)
    && h.writes.some((w) => w.kind === "delete" && w.ids[0] === "crystal000000001") && cards.length === 1,
    JSON.stringify({ items: h.actor.items.length, writes: h.writes.map((w) => w.kind), cards: cards.length }));
  ok("K1b and every write it made was to that player's own actor's items, by that player, and none to the pool",
    h.writes.length > 0 && h.writes.every((w) => w.by === player.id && w.doc.startsWith("Actor.H") && w.kind !== "update"),
    JSON.stringify(h.writes));
}
{
  const h = holder({ value: 13, ownMax: 10, crystals: [["crystal000000001", 3]], owners: [player.id] });
  await onClients([player], gmA, () => spend(h.actor, 12));
  ok("K2 a part-spent crystal keeps the rest", h.actor.items.length === 1 && crystalPP(h, "crystal000000001") === 2, JSON.stringify(h.writes));
}
{
  const h = holder({ value: 13, ownMax: 10, crystals: [["crystal000000001", 3]], owners: [player.id] });
  await onClients([gmA], gmA, () => spend(h.actor, 10));
  ok("K3 a GM's spend, on the GM's client, still settles", h.actor.items.length === 0, JSON.stringify(h.writes));
  const n = holder({ value: 13, ownMax: 10, crystals: [["crystal000000001", 3]], owners: [player.id] });
  await onClients([other], gmA, () => spend(n.actor, 10));
  ok("K4 a client that does not own the actor writes nothing", n.writes.length === 0 && n.actor.items.length === 1, JSON.stringify(n.writes));
}
{
  // ARRIVING: 5 of 10 own points, a 3-PP crystal handed over. The hook
  // fires on every client; the item is already on the sheet when it does.
  const h = holder({ value: 5, ownMax: 10, crystals: [["crystal000000002", 3]], owners: [player.id] });
  const item = h.actor.items.get("crystal000000002");
  await onClients([gmB, gmA, player], gmA, () => arrivalHook?.(item));
  equal("K5 THE DEFECT, cured: a crystal arriving with two GMs connected adds its points once (5 + 3 = 8, not 11)",
    [h.pp.value, h.writes.filter((w) => w.kind === "update").length], [8, 1]);
}
{
  // LEAVING: 13 (10 own + 3), the crystal expires with its 3 points in it.
  const h = holder({ value: 13, ownMax: 10, crystals: [], owners: [player.id] });
  const gone = { id: "crystal000000003", parent: h.actor, flags: { "trg-prime": { [CRYSTAL_FLAG]: { pp: 3 } } } };
  await onClients([gmB, gmA, player], gmA, () => departureHook?.(gone));
  equal("K6 THE DEFECT, cured: a crystal leaving with two GMs connected takes its points once (13 − 3 = 10, not 7)",
    [h.pp.value, h.writes.filter((w) => w.kind === "update").length], [10, 1]);
}
{
  const h = holder({ value: 5, ownMax: 10, crystals: [["crystal000000004", 3]], owners: [player.id] });
  const item = h.actor.items.get("crystal000000004");
  await onClients([gmB], gmA, () => arrivalHook?.(item));
  await onClients([player], gmA, () => arrivalHook?.(item));
  await onClients([gmB], gmA, () => departureHook?.(item));
  await onClients([player], gmA, () => departureHook?.(item));
  equal("K7 the GM who is not active, and a player, settle no arrival or departure", h.writes.length, 0);
  await onClients([gmA], null, () => arrivalHook?.(item));
  equal("K8 a lone GM with no active GM designated still settles an arrival", h.pp.value, 8);
}
{
  // THE WHOLE ROUND: a player's spend empties the crystal on their client;
  // its deletion then fires `deleteItem` on every client. The emptied
  // crystal holds nothing, so nobody takes anything more from the pool.
  const h = holder({ value: 13, ownMax: 10, crystals: [["crystal000000005", 3]], owners: [player.id] });
  const crystal = h.actor.items.get("crystal000000005");
  await onClients([player], gmA, () => spend(h.actor, 10));
  h.pp.value = 10; // the spend itself, landed
  await onClients([gmB, gmA, player], gmA, () => departureHook?.(crystal));
  equal("K9 a player's spend that empties a crystal is charged once: the departure that follows takes nothing", [h.pp.value, h.writes.filter((w) => w.kind === "update").length], [10, 0]);
}

/* ------------------------------------------------------------ P. a suppressed peril */
const perilHook = registered((await imp("peril-workflow.mjs")).registerPerilHooks).updateWorldTime?.[0];
function suppressedPeril() {
  const log = { updates: 0 };
  const gm = { peril: { enabled: true, state: "suppressed", suppressedUntil: 100, progress: 1 } };
  const peril = {
    name: "Weeping Stair", uuid: "Actor.peril", type: "npc", system: { gm },
    update: async (changes) => {
      log.updates += 1;
      await later();
      if (changes["system.gm.peril.state"]) gm.peril.state = changes["system.gm.peril.state"];
      if ("system.gm.peril.suppressedUntil" in changes) gm.peril.suppressedUntil = changes["system.gm.peril.suppressedUntil"];
    }
  };
  return { peril, log };
}
{
  const p = suppressedPeril();
  cards.length = 0;
  await onClients([gmB, gmA, player], gmA, () => perilHook?.(200), { actors: [p.peril], scenes: [] });
  equal("P1 THE DEFECT, cured: with two GMs connected a suppressed peril is re-armed once, with one whispered card",
    [p.log.updates, cards.length, p.peril.system.gm.peril.state], [1, 1, "armed"]);
}
{
  const p = suppressedPeril();
  await onClients([gmB], gmA, () => perilHook?.(200), { actors: [p.peril], scenes: [] });
  await onClients([player], gmA, () => perilHook?.(200), { actors: [p.peril], scenes: [] });
  equal("P2 the GM who is not active, and a player, re-arm nothing", p.log.updates, 0);
  await onClients([gmA], null, () => perilHook?.(200), { actors: [p.peril], scenes: [] });
  equal("P3 a lone GM with no active GM designated still re-arms", p.log.updates, 1);
}

/* ------------------------------------------------------------ Q. a pending cast */
const { pendingCastLapsesAtStartup, lapsedLine, PENDING_CAST_FLAG } = await imp("magic/pending-cast.mjs");
const pendingWorkflow = await imp("magic/pending-cast-workflow.mjs");
const readyHook = registered(pendingWorkflow.registerPendingCastHooks).ready?.[0];
/** A caster with a casting in progress, owned by `owners`. */
function caster(name, record, owners = []) {
  const flags = record ? { [PENDING_CAST_FLAG]: record } : {};
  const log = { unsets: 0 };
  const actor = {
    id: `${name}0000000000000`.slice(0, 16), name, uuid: `Actor.${name}`,
    getFlag: (_s, k) => flags[k],
    setFlag: async (_s, k, v) => { await later(); flags[k] = v; },
    unsetFlag: async (_s, k) => { log.unsets += 1; await later(); delete flags[k]; },
    testUserPermission: (u, level) => level === "OWNER" && (u.isGM || owners.includes(u.id))
  };
  return { actor, log, flags };
}
const record = (userId) => ({ spellName: "Fireball", dc: 18, handle: {}, increments: 1, unit: "minute", size: 1, bonus: 1, apOwed: 0, apPaid: 0, ...(userId === undefined ? {} : { userId }) });
/**
 * The clients that load, and who else is connected. `together`: they load at
 * the same moment, each reading the flag before the other's unset lands —
 * used with ONE caster only, since a later actor in the loop is read after
 * an await, when `game` names whichever client was set up last.
 */
async function loadOn(clients, activeGM, connected, actors, { together = false } = {}) {
  const users = [...connected];
  users.get = (id) => users.find((u) => u.id === id);
  cards.length = 0;
  const runs = [];
  for (const user of clients) {
    globalThis.game = { user, users: Object.assign(users, { activeGM }), actors };
    if (together) runs.push(readyHook?.()); else await readyHook?.();
  }
  await Promise.all(runs);
  await settleAll();
}
const lapsedCards = () => cards.filter((c) => /— Lapsed/.test(c.content)).length;

{
  // Graham's world: the Gamemaster reloads mid-session while a player, still
  // connected, is standing there for a Fireball in their own browser.
  const c = caster("Wiz", record(player.id), [player.id]);
  await loadOn([gmA], gmA, [gmA, player], [c.actor]);
  ok("Q1 THE DEFECT, cured: a GM reloading mid-session leaves a connected player's casting open — no lapse, no card",
    c.log.unsets === 0 && Boolean(c.flags[PENDING_CAST_FLAG]) && lapsedCards() === 0, JSON.stringify({ unsets: c.log.unsets, cards: lapsedCards() }));
}
{
  // The player is gone; two GMs load together.
  const c = caster("Wiz", record(player.id), [player.id]);
  await loadOn([gmB, gmA], gmA, [gmA, gmB], [c.actor], { together: true });
  equal("Q2 THE DEFECT, cured: a disconnected player's casting lapses once when two GMs load together", [c.log.unsets, lapsedCards()], [1, 1]);
  ok("Q2b and the card says why", /no longer connected/.test(cards[0]?.content ?? ""), cards[0]?.content);
}
{
  const c = caster("Wiz", record(player.id), [player.id]);
  await loadOn([gmB], gmA, [gmA, gmB], [c.actor]);
  equal("Q3 the GM who is not active lapses nobody else's casting", c.log.unsets, 0);
}
{
  // A GM's own casting (an NPC), and that GM reloads. Not the acting GM,
  // even: its browser held the promise, and it has just let go of it.
  const c = caster("Npc", record(gmB.id));
  await loadOn([gmB], gmA, [gmA, gmB], [c.actor]);
  equal("Q4 a client lapses its own casting when it reloads, acting GM or not", [c.log.unsets, lapsedCards()], [1, 1]);
  ok("Q4b and says the world reloaded", /when the world reloaded/.test(cards[0]?.content ?? ""));
}
{
  const mine = caster("Wiz", record(player.id), [player.id]);
  const theirs = caster("Clr", record(other.id), [other.id]);
  await loadOn([player], gmA, [gmA, player], [mine.actor, theirs.actor]);
  equal("Q5 a player's reload lapses the player's own casting, and not another player's (even one disconnected)", [mine.log.unsets, theirs.log.unsets], [1, 0]);
}
{
  // RECORDS FROM BEFORE 3.685.3 NAME NOBODY.
  const kept = caster("Wiz", record(undefined), [player.id]);
  await loadOn([gmA], gmA, [gmA, player], [kept.actor]);
  equal("Q6 a record naming nobody is kept while a player who owns the caster is connected", kept.log.unsets, 0);
  const gone = caster("Wiz", record(undefined), [player.id]);
  const npc = caster("Npc", record(undefined));
  await loadOn([gmB, gmA], gmA, [gmA, gmB], [gone.actor, npc.actor]);
  equal("Q6b and lapsed once, by the acting GM, when none is (a GM's NPC has no such player)", [gone.log.unsets, npc.log.unsets, lapsedCards()], [1, 1, 2]);
}
{
  // The rule itself, row by row.
  const r = (o) => pendingCastLapsesAtStartup(o);
  equal("Q7 the rule: own → lapse; another's connected → keep; another's gone → acting GM lapses; nobody named → by owners", [
    r({ startedBy: "u1", thisUser: "u1" }),
    r({ startedBy: "u1", thisUser: "g", actingGM: true, starterConnected: true }),
    r({ startedBy: "u1", thisUser: "g", actingGM: true, starterConnected: false }),
    r({ startedBy: "u1", thisUser: "g", actingGM: false, starterConnected: false }),
    r({ startedBy: null, thisUser: "g", actingGM: true, ownerConnected: true }),
    r({ startedBy: null, thisUser: "g", actingGM: true, ownerConnected: false }),
    r({ startedBy: null, thisUser: null, actingGM: false, ownerConnected: false })
  ], [true, false, true, false, false, true, false]);
  ok("Q7b the card keeps page 237's promise either way", /No PP was spent/.test(lapsedLine("X")) && /No PP was spent/.test(lapsedLine("X", { reloaded: false })));
}
{
  // A NEW RECORD NAMES ITS USER. Driven through `awaitPendingCast` itself,
  // a minute-unit window outside combat, which owes no AP.
  const c = caster("Wiz", null, [player.id]);
  globalThis.game = { user: player, users: { activeGM: gmA }, combat: null, time: { worldTime: 50 } };
  cards.length = 0;
  void pendingWorkflow.awaitPendingCast(c.actor, { spell: { id: "fireball00000001", name: "Fireball" }, increments: 1, unit: "minute", size: 1, bonus: 1, dc: 18 });
  await settleAll();
  equal("Q8 a casting started now records the user whose browser holds it", c.flags[PENDING_CAST_FLAG]?.userId, player.id);
}
{
  const src = strip(read("module", "magic", "pending-cast-workflow.mjs"));
  ok("Q9 the ready hook asks the rule, with isActingGM imported from acting-gm.mjs, and no isGM guard is left",
    /import \{ isActingGM \} from "\.\.\/acting-gm\.mjs";/.test(src)
    // RE-PINNED 3.686.2: the hook first registers the relay (Graham's 3.686.1)
    // and lets the GM-connection election settle (3.686.2), then asks; a
    // lapse also waits for the live-holder probe (3.686.1).
    && /Hooks\.once\("ready", async \(\) => \{\s*registerPendingCastRelay\(\);\s*if \(!gmConnectionSettled\(\)\) await gmConnectionReady\(\);\s*const thisUser = game\.user\?\.id \?\? null;\s*const actingGM = isActingGM\(\);/.test(src)
    && /pendingCastLapsesAtStartup\(\{/.test(src) && /if \(!lapses \|\| await hasLiveHolder\(actor, record\)\) continue;/.test(src)
    && !/game\.user\?\.isGM/.test(src));
}

/* ------------------------------------------------------------ the guards, read */
{
  const conj = strip(read("module", "magic", "conjured-item-workflow.mjs"));
  const peril = strip(read("module", "peril-workflow.mjs"));
  ok("G1 the conjured clock's hook asks isActingGM, imported, and no isGM is left in the file",
    /import \{ isActingGM \} from "\.\.\/acting-gm\.mjs";/.test(conj) && /Hooks\.on\("deleteItem", \(item\) => \{\s*if \(!isActingGM\(\)\) return;/.test(conj) && !/\.isGM\b/.test(conj));
  ok("G2 the peril's world-time hook asks isActingGM, imported",
    /import \{ isActingGM \} from "\.\/acting-gm\.mjs";/.test(peril) && /Hooks\.on\("updateWorldTime", \(worldTime\) => \{\s*if \(!isActingGM\(\)\) return;/.test(peril));
}

/* ------------------------------------------------------------ Z. the version */
const manifest = JSON.parse(read("system.json"));
const v = String(manifest.version).split(".").map(Number);
ok("Z1 the version is 3.685.3 or later", v[0] > 3 || (v[0] === 3 && (v[1] > 685 || (v[1] === 685 && v[2] >= 3))), manifest.version);
ok("Z2 and the download names it", manifest.download === `https://github.com/snowtroll75-debug/trpg-prime/releases/download/v${manifest.version}/trg-prime.zip`, manifest.download);

const EXPECTED = 34;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-fixes-3685-3: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-fixes-3685-3: ${checks} checks — all green.`);
