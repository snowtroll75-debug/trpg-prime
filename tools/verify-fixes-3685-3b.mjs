#!/usr/bin/env node
/**
 * verify-fixes-3685-3b — TRG Prime 3.685.3, the independent review's findings
 * folded into the same release (Graham: "Fix the problems first").
 *
 *   R  Power Crystal settlements on one creature run one at a time. A cast
 *      and its surcharge write the pool twice in a row; the second
 *      settlement read the crystal before the first's write had landed and
 *      wrote over it (3 PP spent 2 then 1 was left at 2, not dissolved).
 *   D  A crystal leaving does not drain the others: the departure's own pool
 *      write is marked, and the spend hook passes it by.
 *   U  Going under water is settled by one client (underwater-workflow's
 *      `updateToken`, which had no guard).
 *   A  An affliction's deletion withdraws its conditions once.
 *   B  A temporary conviction point is reclaimed once.
 *   Q  A casting held in a player's browser is reached from the GM's: Phase 1
 *      pays it down, damage the GM applies interrupts it, and the GM's stop
 *      stops it, each run on the holder's client over the system socket.
 *   Z  The version.
 *
 * THE MOCKS CHANGE LOCAL DATA ONLY WHEN THE SERVER ANSWERS, as Foundry does:
 * a write is acknowledged a moment later, and only then does the local
 * document hold it. For Q, each client is its own instance of the module,
 * with its own `game`, hooks and socket, kept apart by AsyncLocalStorage;
 * the socket delivers to every other client, a moment later.
 */
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const moduleUrl = (rel, tag = "") => new URL(`../module/${rel}${tag ? `?client=${tag}` : ""}`, import.meta.url).href;
const imp = (rel, tag = "") => import(moduleUrl(rel, tag));
const later = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const settleAll = async (n = 12) => { for (let i = 0; i < n; i += 1) await later(); };

/* A hook that fires a write and does not await it (`void settleSubmersion(...)`)
 * fails out of sight, as it does in a browser console: counted, not fatal. */
const unhandled = [];
process.on("unhandledRejection", (error) => { unhandled.push(String(error?.message ?? error)); });

/* ------------------------------------------------------------ one world, many clients */
const als = new AsyncLocalStorage();
const clientOf = () => als.getStore() ?? fallback;
let fallback = null;
/** `game` and `Hooks` are whichever client is running. */
globalThis.game = new Proxy({}, { get: (_t, k) => clientOf()?.game?.[k], set: (_t, k, v) => { clientOf().game[k] = v; return true; } });
globalThis.Hooks = new Proxy({}, { get: (_t, k) => (k === "on" || k === "once")
  ? (name, fn) => { (clientOf().hooks[name] ??= []).push(fn); }
  : undefined });
const cards = [];
globalThis.ChatMessage = {
  create: async (data) => { cards.push({ by: clientOf()?.game?.user?.id ?? null, ...data }); return data; },
  getSpeaker: () => ({}),
  getWhisperRecipients: () => []
};
const clients = [];
const actorsByUuid = new Map();
globalThis.fromUuid = async (uuid) => actorsByUuid.get(uuid) ?? null;
globalThis.foundry = { applications: { api: { DialogV2: class {} } }, utils: { randomID: () => Math.random().toString(36).slice(2, 18).padEnd(16, "0") } };
const notices = [];
const notice = (kind) => (message) => { notices.push({ by: clientOf()?.game?.user?.id ?? null, kind, message: String(message) }); };
globalThis.ui = { notifications: { info: notice("info"), warn: notice("warn"), error: notice("error") } };

const gmA = { id: "gmA0000000000000", isGM: true, active: true, name: "Gamemaster" };
const gmB = { id: "gmB0000000000000", isGM: true, active: true, name: "Claude" };
const player = { id: "player0000000000", isGM: false, active: true, name: "Player" };
const player2 = { id: "player2000000000", isGM: false, active: true, name: "Another Player" };
const users = [gmA, gmB, player, player2];
users.get = (id) => users.find((u) => u.id === id);

/** A connected client: its user, its hooks, its socket. */
function client(user, extra = {}) {
  const c = { hooks: {}, socketHandlers: [], muted: false };
  c.game = {
    user, users: Object.assign(users, { activeGM: gmA }), combat: null, time: { worldTime: 0 },
    socket: {
      on: (_name, fn) => c.socketHandlers.push(fn),
      emit: (_name, data) => {
        for (const other of clients) {
          if (other === c || other.muted) continue;
          if (other.held) { other.held.push(data); continue; } // 3.686.2: delivered later, in order
          if (other.drop?.has?.(data?.action)) continue; // 3.686.2: a message lost on the way

          setTimeout(() => als.run(other, () => { for (const h of other.socketHandlers) h(structuredClone(data)); }), 2);
        }
      }
    },
    ...extra
  };
  clients.push(c);
  return c;
}
const on = (c, fn) => als.run(c, fn);
/** Every listed client runs it together, as Foundry fires a hook on each. */
async function together(list, fn) {
  const errors = [];
  const error = console.error; console.error = (...a) => errors.push(a.map(String).join(" "));
  try {
    const runs = await Promise.allSettled(list.map((c) => on(c, fn)));
    for (const r of runs) if (r.status === "rejected") errors.push(String(r.reason?.message ?? r.reason));
    await settleAll();
  } finally { console.error = error; }
  return errors;
}
const hook = (c, name) => (...args) => Promise.all((c.hooks[name] ?? []).map((fn) => fn(...args)));

/* ------------------------------------------------------------ R, D. Power Crystals */
const cGM = client(gmA), cGMB = client(gmB), cPlayer = client(player), cPlayer2 = client(player2);
// 3.686.2: a GM's connection is the writer once the election has settled
// (about 400 ms; a lone tab no longer counts itself lone before its hello
// could be answered). Each GM client here is its account's only tab.
{
  const { gmConnectionReady } = await imp("gm-connection.mjs");
  await Promise.all([cGM, cGMB].map((c) => on(c, () => gmConnectionReady())));
}
/** No GM connected, for the length of `fn`. */
async function withNoGM(fn) {
  const was = [gmA.active, gmB.active, users.activeGM];
  gmA.active = false; gmB.active = false; users.activeGM = null;
  try { return await fn(); } finally { [gmA.active, gmB.active, users.activeGM] = was; }
}
const { CRYSTAL_FLAG, crystalTotal } = await imp("magic/power-crystal.mjs");
for (const c of [cGM, cGMB, cPlayer, cPlayer2]) {
  const wf = await imp("magic/power-crystal-workflow.mjs", `crystal-${c.game.user.id}`);
  on(c, () => wf.registerPowerCrystalHooks());
}
/**
 * A holder whose local document changes only when the server answers. An
 * update runs `preUpdateActor` on the updating client first, with its
 * options, as Foundry does; a deletion fires `deleteItem` on every client.
 */
function serverHolder({ value, ownMax, crystals, owners = [] }) {
  const log = { deletes: [], updates: [] };
  const items = [];
  items.get = (id) => items.find((i) => i.id === id);
  const pp = { value, get max() { return ownMax + crystalTotal(items); } };
  const actor = {
    name: "H", uuid: "Actor.H", system: { resources: { pp } }, items,
    get isOwner() { return Boolean(game.user?.isGM || owners.includes(game.user?.id)); },
    update: async (changes, options = {}) => {
      const after = changes["system.resources.pp.value"];
      await hook(clientOf(), "preUpdateActor")(actor, { system: { resources: { pp: { value: after } } } }, options, game.user.id);
      log.updates.push({ after, options });
      await later();
      pp.value = after;
    },
    deleteEmbeddedDocuments: async (_t, ids) => {
      log.deletes.push([...ids]);
      await later();
      for (const id of ids) {
        const i = items.findIndex((x) => x.id === id);
        if (i < 0) throw new Error(`Item ${id} does not exist`);
        const [gone] = items.splice(i, 1);
        for (const c of [cGM, cGMB, cPlayer, cPlayer2]) on(c, () => hook(c, "deleteItem")(gone));
      }
    }
  };
  for (const [id, points] of crystals) {
    const item = { id, parent: actor, flags: { "trg-prime": { [CRYSTAL_FLAG]: { pp: points } } },
      // A flag write is slower to come back than the pool's, so the next spend
      // is queued while it is still in flight — the order the review measured.
      setFlag: async (s, k, v) => { await later(15); item.flags[s][k] = v; } };
    items.push(item);
  }
  return { actor, log, pp, left: (id) => items.get(id)?.flags["trg-prime"][CRYSTAL_FLAG].pp ?? "dissolved" };
}
const dissolveCards = () => cards.filter((c) => /Power Crystal<\/strong>|Power Crystal&rsquo;|dissolves/.test(c.content ?? "")).length;

{
  // A cast and its surcharge, from the player's own sheet: 2 PP, then 1.
  const h = serverHolder({ value: 13, ownMax: 10, crystals: [["c1", 3]], owners: [player.id] });
  cards.length = 0;
  await on(cPlayer, async () => { await h.actor.update({ "system.resources.pp.value": 11 }); await h.actor.update({ "system.resources.pp.value": 10 }); });
  await settleAll(20);
  equal("R1 THE DEFECT, cured: a 3 PP crystal spent 2 and then 1 dissolves — deleted once, one card", [h.left("c1"), h.log.deletes.length, dissolveCards(), h.pp.value, h.pp.max], ["dissolved", 1, 1, 10, 10]);
}
{
  const h = serverHolder({ value: 15, ownMax: 10, crystals: [["c1", 5]], owners: [player.id] });
  cards.length = 0;
  await on(cPlayer, async () => { for (const to of [14, 13, 12]) await h.actor.update({ "system.resources.pp.value": to }); });
  await settleAll(20);
  equal("R2 three spends of 1 in a row each see the last: 5 → 2, nothing dissolved, no card", [h.left("c1"), h.log.deletes.length, dissolveCards()], [2, 0, 0]);
}
{
  // Two crystals, two spends of 2: the first empties the 1 and takes 1 from the 3; the second empties the 3.
  const h = serverHolder({ value: 14, ownMax: 10, crystals: [["c1", 1], ["c3", 3]], owners: [player.id] });
  cards.length = 0;
  await on(cPlayer, async () => { await h.actor.update({ "system.resources.pp.value": 12 }); await h.actor.update({ "system.resources.pp.value": 10 }); });
  await settleAll(20);
  equal("R3 two crystals, two spends: each emptied crystal is deleted once, one card for each spend that emptied one", [h.left("c1"), h.left("c3"), h.log.deletes, dissolveCards()], ["dissolved", "dissolved", [["c1"], ["c3"]], 2]);
}
{
  // THE REVIEW'S DRAIN: own 10, crystals of 3 and 2, pool 15. The 3 expires.
  const h = serverHolder({ value: 15, ownMax: 10, crystals: [["c3", 3], ["c2", 2]], owners: [player.id] });
  cards.length = 0;
  await on(cGM, () => h.actor.deleteEmbeddedDocuments("Item", ["c3"]));
  await settleAll(20);
  equal("D1 THE DEFECT, cured: a crystal leaving takes its own points and no other crystal's — pool 12 under a maximum of 12, the 2 intact, no card",
    [h.pp.value, h.pp.max, h.left("c2"), dissolveCards()], [12, 12, 2, 0]);
  ok("D1b the departure's pool write is the marked one, and the only one", h.log.updates.length === 1 && h.log.updates[0].options?.trgCrystalDeparture === true, JSON.stringify(h.log.updates));
}
{
  const h = serverHolder({ value: 12, ownMax: 10, crystals: [["c3", 3], ["c2", 2]], owners: [player.id] });
  await on(cGM, () => h.actor.deleteEmbeddedDocuments("Item", ["c3"]));
  await settleAll(20);
  equal("D2 below the maximum too: 12 − 3 = 9, under the new 12, the 2 intact", [h.pp.value, h.pp.max, h.left("c2")], [9, 12, 2]);
}
{
  // A REAL SPEND STILL DRAWS: the option is the departure's alone.
  const h = serverHolder({ value: 15, ownMax: 10, crystals: [["c3", 3], ["c2", 2]], owners: [player.id] });
  await on(cGM, () => h.actor.update({ "system.resources.pp.value": 12 }));
  await settleAll(20);
  equal("D3 an unmarked fall of 3 is still a spend: the 2 empties, the 3 keeps 2", [h.left("c2"), h.left("c3")], ["dissolved", 2]);
}
{
  // A WRITE THAT NEVER COMES BACK: the first settlement's flag write hangs.
  const h = serverHolder({ value: 15, ownMax: 10, crystals: [["c5", 5]], owners: [player.id] });
  const item = h.actor.items.get("c5");
  const calls = [];
  const realSet = item.setFlag;
  item.setFlag = (sc, k, v) => { calls.push(v.pp); return calls.length === 1 ? new Promise(() => {}) : realSet(sc, k, v); };
  const warned = [];
  const warn = console.warn; console.warn = (...a) => warned.push(a.join(" "));
  try {
    await on(cPlayer, async () => { await h.actor.update({ "system.resources.pp.value": 14 }); await h.actor.update({ "system.resources.pp.value": 13 }); });
    await later(3000);
    const before = calls.length;
    await later(8000);
    ok("S1 a settlement whose write never returns holds the next one for at most 10 seconds, then lets it go, with a warning",
      before === 1 && calls.length === 2 && warned.some((w) => /did not finish in 10 seconds/.test(w)), JSON.stringify({ before, calls, warned }));
  } finally { console.warn = warn; }
}

/* ------------------------------------------------------------ U. going under water */
for (const c of [cGM, cGMB, cPlayer, cPlayer2]) {
  const uw = await imp("combat/underwater-workflow.mjs", `uw-${c.game.user.id}`);
  on(c, () => uw.registerUnderwaterHooks());
}
function swimmer({ underwater, submerged = false, owners = [player.id] }) {
  const log = { creates: 0, deletes: 0, failed: 0, attempts: 0 };
  const flags = {};
  const effects = [];
  const actor = {
    name: "Swimmer", uuid: "Actor.Swimmer", type: "character", system: { attributes: { constitution: { total: 2 } } }, items: [],
    get effects() { return effects; },
    get isOwner() { return Boolean(game.user?.isGM || owners.includes(game.user?.id)); },
    testUserPermission: (u, level) => level === "OWNER" && Boolean(u?.isGM || owners.includes(u?.id)),
    hasCondition: () => false,
    getFlag: (_s, k) => flags[k], setFlag: async (_s, k, v) => { await later(); flags[k] = v; }, unsetFlag: async (_s, k) => { await later(); delete flags[k]; },
    toggleStatusEffect: async () => { await later(); },
    createEmbeddedDocuments: async (_t, data) => {
      log.attempts += 1;
      if (!actor.isOwner) throw new Error("permission denied");
      log.creates += 1;
      await later();
      for (const d of data) {
        const e = { ...d, id: `eff${log.creates}`, getFlag: (_s, k) => d.flags?.["trg-prime"]?.[k],
          delete: async () => { log.deletes += 1; await later(); const i = effects.indexOf(e); if (i < 0) { log.failed += 1; throw new Error("ActiveEffect does not exist"); } effects.splice(i, 1); } };
        effects.push(e);
      }
    }
  };
  if (submerged) effects.push({ id: "effSub", getFlag: (_s, k) => (k === "submerged" ? true : null), delete: async () => { log.deletes += 1; await later(); const i = effects.findIndex((e) => e.id === "effSub"); if (i < 0) { log.failed += 1; throw new Error("ActiveEffect does not exist"); } effects.splice(i, 1); } });
  const token = { id: "tok", actor };
  const region = { name: "Underwater", tokens: new Set(underwater ? [token] : []) };
  token.parent = { regions: [region] };
  return { actor, token, log };
}
const underCards = () => cards.filter((c) => /is underwater/.test(c.content ?? "")).length;
{
  const s = swimmer({ underwater: true });
  cards.length = 0;
  await together([cGM, cPlayer], () => hook(clientOf(), "updateToken")(s.token, { x: 100 }));
  equal("U1 THE DEFECT, cured: the GM and the owning player see one creature go under — one Submerged effect, one card", [s.log.creates, s.actor.effects.length, underCards()], [1, 1, 1]);
}
{
  const s = swimmer({ underwater: true });
  cards.length = 0;
  await together([cGMB, cGM, cPlayer], () => hook(clientOf(), "updateToken")(s.token, { x: 100 }));
  equal("U2 and with two GMs connected as well", [s.log.creates, underCards()], [1, 1]);
}
{
  const s = swimmer({ underwater: false, submerged: true });
  await together([cGMB, cGM, cPlayer], () => hook(clientOf(), "updateToken")(s.token, { x: 0 }));
  equal("U3 leaving the water takes the effect off once, with no failed second delete", [s.log.deletes, s.log.failed, s.actor.effects.length], [1, 0, 0]);
}
{
  const s = swimmer({ underwater: true, owners: [] });
  const errors = await together([cGMB, cPlayer], () => hook(clientOf(), "updateToken")(s.token, { x: 100 }));
  equal("U4 the GM who is not active, and a player who does not own the creature, write nothing (and are not refused)", [s.log.creates, errors.length], [0, 0]);
}

/* ------------------------------------------------------------ A. an affliction's cure */
for (const c of [cGM, cGMB, cPlayer, cPlayer2]) {
  const af = await imp("combat/affliction-workflow.mjs", `af-${c.game.user.id}`);
  on(c, () => af.registerAfflictionConditionLock());
}
function afflicted(owners = [player.id]) {
  const log = { toggles: 0, failed: 0 };
  const statuses = new Set(["sickened"]);
  const actor = {
    name: "Sick", items: { get: () => null },
    testUserPermission: (u, level) => level === "OWNER" && Boolean(u?.isGM || owners.includes(u?.id)),
    hasCondition: (k) => statuses.has(k), getConditionValue: () => 1,
    toggleStatusEffect: async (k) => { log.toggles += 1; await later(); if (!statuses.delete(k)) { log.failed += 1; throw new Error("ActiveEffect does not exist"); } }
  };
  const item = { id: "aff0000000000001", type: "affliction", parent: actor, flags: { "trg-prime": { affliction: { applied: [{ key: "sickened", value: null, added: true }] } } } };
  return { actor, item, log };
}
{
  const a = afflicted();
  await together([cGMB, cGM, cPlayer], () => hook(clientOf(), "deleteItem")(a.item));
  equal("A1 THE DEFECT, cured: deleting an affliction withdraws its condition once, with no failed second removal", [a.log.toggles, a.log.failed], [1, 0]);
  const b = afflicted();
  await together([cGMB, cPlayer], () => hook(clientOf(), "deleteItem")(b.item));
  equal("A2 the GM who is not active, and a player, withdraw nothing", b.log.toggles, 0);
}

/* ------------------------------------------------------------ B. a temporary conviction point */
for (const c of [cGM, cGMB, cPlayer, cPlayer2]) {
  const bc = await imp("magic/bardic-conviction.mjs", `bc-${c.game.user.id}`);
  on(c, () => bc.registerTemporaryConvictionCleanup());
}
{
  const log = { updates: [] };
  const actor = { _source: { system: { resources: { conviction: { value: 3 } } } }, update: async (u) => { log.updates.push(u); await later(); } };
  const effect = { parent: actor, getFlag: (_s, k) => (k === "temporaryConviction" ? { granted: 3 } : null) };
  await together([cGMB, cGM, cPlayer], () => hook(clientOf(), "deleteActiveEffect")(effect));
  equal("B1 THE DEFECT, cured: an unspent temporary point is reclaimed by one client", log.updates, [{ "system.resources.conviction.value": 2 }]);
  const quiet = { updates: [] };
  const a2 = { _source: actor._source, update: async (u) => { quiet.updates.push(u); } };
  await together([cGMB, cPlayer], () => hook(clientOf(), "deleteActiveEffect")({ parent: a2, getFlag: effect.getFlag }));
  equal("B2 the GM who is not active, and a player, write nothing", quiet.updates.length, 0);
}

/* ------------------------------------------------------------ N. no GM connected */
{
  // Two players who both own the creature, and no GM: exactly one of them acts.
  const both = [player.id, player2.id];
  const s1 = swimmer({ underwater: true, owners: both });
  cards.length = 0;
  await withNoGM(() => together([cPlayer2, cPlayer], () => hook(clientOf(), "updateToken")(s1.token, { x: 100 })));
  equal("N1 with no GM connected, going under water is still settled — by one owner, not by none (3.685.2's duplicate, without the duplicate)", [s1.log.creates, underCards()], [1, 1]);
  const a = afflicted(both);
  await withNoGM(() => together([cPlayer2, cPlayer], () => hook(clientOf(), "deleteItem")(a.item)));
  equal("N2 and a cured affliction still withdraws its condition, once", [a.log.toggles, a.log.failed], [1, 0]);
  const log = { updates: [] };
  const actor = { _source: { system: { resources: { conviction: { value: 3 } } } }, update: async (u) => { log.updates.push(u); await later(); },
    testUserPermission: (u, level) => level === "OWNER" && both.includes(u?.id) };
  await withNoGM(() => together([cPlayer2, cPlayer], () => hook(clientOf(), "deleteActiveEffect")({ parent: actor, getFlag: (_s, k) => (k === "temporaryConviction" ? { granted: 3 } : null) })));
  equal("N3 and a temporary conviction point is still reclaimed, once", log.updates.length, 1);
  const lone = swimmer({ underwater: true, owners: [player2.id] });
  await withNoGM(() => together([cPlayer], () => hook(clientOf(), "updateToken")(lone.token, { x: 100 })));
  equal("N4 a connected player who does not own the creature is not the one (it does not even try)", lone.log.attempts, 0);
  const { isActingClientFor = () => null } = await imp("acting-gm.mjs");
  const doc = { testUserPermission: (u) => [player.id, player2.id].includes(u?.id) };
  const answers = await withNoGM(() => [cPlayer, cPlayer2].map((c) => on(c, () => isActingClientFor(doc))));
  equal("N5 the rule: the connected owner with the lowest id, the same answer on every client", answers, [true, false]);
}

/* ------------------------------------------------------------ Q. the casting in another browser */
const { PENDING_CAST_FLAG, pendingCastHolder } = await imp("magic/pending-cast.mjs");
const PW = new Map();
for (const c of [cGM, cPlayer, cPlayer2]) {
  const pw = await imp("magic/pending-cast-workflow.mjs", `pc-${c.game.user.id}`);
  PW.set(c, pw);
  on(c, () => { pw.registerPendingCastHooks(); pw.registerPendingCastRelay?.(); });
}
/** A caster the player owns, in combat; its document is the world's, its writes acknowledged a moment later. */
function wizard(name, { ap = 0, hp = 20 } = {}) {
  const flags = {};
  const log = { apWrites: [], slow: 0, slowFlag: 0, flagWrites: [] };
  const actor = {
    id: `${name}`.padEnd(16, "0").slice(0, 16), uuid: `Actor.${name}`, name, inCombat: true, token: null,
    getActiveTokens: () => [],
    system: { resources: { ap: { value: ap, max: 6 }, hp: { value: hp } } },
    get isOwner() { return Boolean(game.user?.isGM || game.user?.id === player.id); },
    testUserPermission: (u, level) => level === "OWNER" && (u.isGM || u.id === player.id),
    getFlag: (_s, k) => flags[k],
    setFlag: async (_s, k, v) => { log.flagWrites.push(Date.now()); await later(log.slowFlag || 5); flags[k] = structuredClone(v); },
    unsetFlag: async (_s, k) => { if (!actor.isOwner) throw new Error("permission denied"); await later(); delete flags[k]; },
    update: async (u) => {
      log.apWrites.push({ by: game.user.id, u });
      await later(log.slow || 5);
      if ("system.resources.ap.value" in u) actor.system.resources.ap.value = u["system.resources.ap.value"];
    }
  };
  actorsByUuid.set(actor.uuid, actor);
  return { actor, flags, log };
}
const inCombat = { id: "combat0000000001", started: true, round: 1, turn: 0, combatants: [] };
cGM.game.combat = inCombat; cPlayer.game.combat = inCombat; cPlayer2.game.combat = inCombat;
/** The player opens a window of 2 × 3 AP for Fireball, with nothing left in the pool, from their own browser. */
async function playerCasts(w) {
  let outcome = null;
  on(cPlayer, () => { PW.get(cPlayer).awaitPendingCast(w.actor, { spell: { id: "fireball00000001", name: "Fireball" }, increments: 2, unit: "AP", size: 3, bonus: 2, dc: 18, castAP: 2 }).then((o) => { outcome = o; }); });
  await settleAll();
  return () => outcome;
}
{
  const w = wizard("WizPay");
  const outcome = await playerCasts(w);
  equal("Q0 the window is open on the player's client, owing 6 AP, paid 0, held by the player", [w.flags[PENDING_CAST_FLAG]?.apOwed, w.flags[PENDING_CAST_FLAG]?.apPaid, w.flags[PENDING_CAST_FLAG]?.userId], [6, 0, player.id]);
  // Turn 1: Phase 1 on the GM's client grants the turn's AP, then asks.
  w.actor.system.resources.ap.value = 3;
  cards.length = 0;
  const turn1 = await on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  await settleAll();
  ok("Q1 THE DEFECT, cured: Phase 1 on the GM's client pays a player's window down — the line comes back for the GM's card",
    /3 of 6 AP/.test(turn1?.line ?? "") && w.flags[PENDING_CAST_FLAG]?.apPaid === 3, JSON.stringify({ turn1, record: w.flags[PENDING_CAST_FLAG] }));
  ok("Q1b and the payment was made on the player's client, the one that holds the cast", w.log.apWrites.length > 0 && w.log.apWrites.every((x) => x.by === player.id), JSON.stringify(w.log.apWrites));
  w.actor.system.resources.ap.value = 3;
  const turn2 = await on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  await settleAll();
  ok("Q2 the turn that finishes paying carries the Complete button to the GM's card", /data-action="completePendingCast"/.test(turn2?.buttons ?? "") && w.flags[PENDING_CAST_FLAG]?.apPaid === 6, JSON.stringify(turn2));
  // Damage the GM applies: the GM's client makes the hit-point update, so only its preUpdateActor runs.
  await on(cGM, () => hook(cGM, "preUpdateActor")(w.actor, { system: { resources: { hp: { value: 12 } } } }, {}, gmA.id));
  await settleAll(20);
  ok("Q3 THE DEFECT, cured: damage the GM applies interrupts the player's casting — the cast in their browser resolves as interrupted",
    outcome()?.outcome === "interrupted" && outcome()?.criticalSeverity === null && !w.flags[PENDING_CAST_FLAG], JSON.stringify(outcome()));
  ok("Q3b and the Interrupted card, with its Spell Concentration button, is posted by the player's client", cards.some((c) => c.by === player.id && /— Interrupted/.test(c.content) && /pendingCastConcentration/.test(c.content)));
}
{
  const w = wizard("WizCrit");
  const outcome = await playerCasts(w);
  const answered = await on(cGM, () => PW.get(cGM).interruptPendingCast(w.actor, { criticalSeverity: "minor" }));
  await settleAll(20);
  equal("Q4 a critical injury the GM rolls interrupts it too, with its severity (a fumble)", [outcome()?.outcome, outcome()?.criticalSeverity], ["interrupted", "minor"]);
  equal("Q4b and the GM's client hears the holder's answer: interrupted", answered, true);
}
{
  const w = wizard("WizStop");
  const outcome = await playerCasts(w);
  cards.length = 0;
  const stopped = await on(cGM, () => PW.get(cGM).stopPendingCast(w.actor));
  await settleAll();
  ok("Q5 the GM's stop stops the player's casting: true, the cast resolves stopped, and the Stopped card is posted",
    stopped === true && outcome()?.outcome === "stopped" && cards.some((c) => /— Stopped/.test(c.content)) && !w.flags[PENDING_CAST_FLAG], JSON.stringify({ stopped, o: outcome() }));
}
{
  // THE HOLDER IS GONE: nobody holds a promise, as before 3.685.3.
  const w = wizard("WizGone");
  w.flags[PENDING_CAST_FLAG] = { spellName: "Fireball", apOwed: 6, apPaid: 0, handle: {}, dc: 18, userId: "left000000000000" };
  cards.length = 0;
  const pay = await on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  const hit = await on(cGM, () => PW.get(cGM).interruptPendingCast(w.actor, {}));
  equal("Q6 a holder who is not connected is not asked: no payment and no interruption, as before", [pay, hit, Boolean(w.flags[PENDING_CAST_FLAG])], [null, false, true]);
  const stopped = await on(cGM, () => PW.get(cGM).stopPendingCast(w.actor));
  await settleAll();
  ok("Q6b and the GM's stop clears the flag, answers true and posts the Stopped card", stopped === true && !w.flags[PENDING_CAST_FLAG] && cards.some((c) => /— Stopped/.test(c.content)));
}
{
  // THE HOLDER LEAVES WHILE ASKED: the asker hears at once.
  const w = wizard("WizLeaves");
  await playerCasts(w);
  cPlayer.muted = true;
  const asked = on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  await later(10);
  on(cGM, () => hook(cGM, "userConnected")(player, false));
  const answer = await Promise.race([asked, later(2000).then(() => "hung")]);
  cPlayer.muted = false;
  equal("Q7 a holder who leaves mid-ask answers nothing at once, and the turn goes on as before", answer, null);
}
{
  // A PLAYER WHO DOES NOT OWN THE CASTER asks the holder to stop it.
  const w = wizard("WizStranger");
  const outcome = await playerCasts(w);
  cards.length = 0; notices.length = 0;
  const stopped = await on(cPlayer2, () => PW.get(cPlayer2).stopPendingCast(w.actor));
  await settleAll();
  ok("Q10 THE DEFECT, cured: a player who does not own the caster cannot stop another player's casting — refused, still open, no card",
    stopped === false && outcome() === null && Boolean(w.flags[PENDING_CAST_FLAG]) && !cards.some((c) => /— Stopped/.test(c.content))
    && notices.some((n) => n.by === player2.id && /owner or the GM/.test(n.message)), JSON.stringify({ stopped, o: outcome(), notices }));
  const completed = await on(cPlayer2, () => PW.get(cPlayer2).completePendingCast(w.actor));
  await settleAll();
  ok("Q10b nor complete it", completed === false && outcome() === null && Boolean(w.flags[PENDING_CAST_FLAG]));
  // A RELAYED COMPLETE BEFORE THE TIME IS PAID: the button's rule.
  const early = await on(cGM, () => PW.get(cGM).completePendingCast(w.actor));
  await settleAll();
  ok("Q11 a relayed Complete before the time is paid is refused, as the card withholds the button", early === false && outcome() === null && Boolean(w.flags[PENDING_CAST_FLAG]));
  w.flags[PENDING_CAST_FLAG] = { ...w.flags[PENDING_CAST_FLAG], apPaid: 6 };
  const done = await on(cGM, () => PW.get(cGM).completePendingCast(w.actor));
  await settleAll();
  ok("Q11b and once it is paid, the GM's Complete completes it", done === true && outcome()?.outcome === "complete");
}
{
  // GRAHAM'S RULING: an interruption is what damage does, whoever strikes.
  const w = wizard("WizFriendly");
  const outcome = await playerCasts(w);
  const answered = await on(cPlayer2, () => PW.get(cPlayer2).interruptPendingCast(w.actor, { criticalSeverity: "minor" }));
  await settleAll(20);
  ok("Q20 a player's critical injury on another player's casting caster interrupts it, at the fumble degree",
    answered === true && outcome()?.outcome === "interrupted" && outcome()?.criticalSeverity === "minor", JSON.stringify({ answered, o: outcome() }));
}
{
  // PHASE 1 IS THE GM'S: a player cannot ask for a payment.
  const w = wizard("WizNoPay");
  await playerCasts(w);
  w.actor.system.resources.ap.value = 3;
  const turn = await on(cPlayer2, () => PW.get(cPlayer2).payPendingCastTurn(w.actor));
  await settleAll();
  ok("Q21 a payment asked by a player is refused: nothing spent, nothing credited", turn === null && w.flags[PENDING_CAST_FLAG]?.apPaid === 0 && w.log.apWrites.length === 0, JSON.stringify({ turn, record: w.flags[PENDING_CAST_FLAG] }));
}
{
  // THE HOLDER IS CONNECTED BUT SAYS NOTHING (its socket has stalled).
  const w = wizard("WizSilent");
  const outcome = await playerCasts(w);
  cPlayer.muted = true;
  cards.length = 0; notices.length = 0;
  const stopped = await on(cGM, () => PW.get(cGM).stopPendingCast(w.actor));
  cPlayer.muted = false;
  await settleAll();
  ok("Q12 THE DEFECT, cured: a Stop the holder never answered stops nothing — the flag stays, no card, and the GM is told",
    stopped === false && Boolean(w.flags[PENDING_CAST_FLAG]) && !cards.some((c) => /— Stopped/.test(c.content)) && outcome() === null
    && notices.some((n) => n.by === gmA.id && /did not answer/.test(n.message)), JSON.stringify({ stopped, notices }));
}
{
  // NOBODY HOLDS IT, and a player who may not write the flag presses Stop.
  const w = wizard("WizOrphan");
  w.flags[PENDING_CAST_FLAG] = { spellName: "Fireball", apOwed: 6, apPaid: 0, handle: {}, dc: 18, userId: "left000000000000" };
  cards.length = 0;
  const stopped = await on(cPlayer2, () => PW.get(cPlayer2).stopPendingCast(w.actor));
  await settleAll();
  ok("Q13 a Stop whose flag could not be cleared says nothing: false, no card", stopped === false && Boolean(w.flags[PENDING_CAST_FLAG]) && !cards.some((c) => /— Stopped/.test(c.content)));
}
{
  // A FORGED ANSWER: another client answers every ask first, as if it held the cast.
  const w = wizard("WizForged");
  await playerCasts(w);
  const forger = (data) => {
    if (data?.action !== "pendingCast.ask") return;
    cPlayer2.game.socket.emit("system.trg-prime", { action: "pendingCast.answer", requestId: data.requestId, userId: data.userId, answererId: player2.id, result: { line: "FORGED", buttons: "" } });
  };
  cPlayer2.socketHandlers.unshift(forger);
  w.actor.system.resources.ap.value = 3;
  notices.length = 0;
  const turn = await on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  cPlayer2.socketHandlers.splice(cPlayer2.socketHandlers.indexOf(forger), 1);
  ok("Q14 THE DEFECT, cured: the asker takes an answer only from the holder it asked", /3 of 6 AP/.test(turn?.line ?? "") && !/FORGED/.test(turn?.line ?? ""), JSON.stringify(turn));
  ok("Q15 and the GM's screen said who it was waiting for", notices.some((n) => n.by === gmA.id && /Waiting for Player/.test(n.message)), JSON.stringify(notices));
}
{
  // A MODULE'S STEP THAT TAKES LONGER THAN THE ACKNOWLEDGEMENT WAIT (Magical Retribution's dialog).
  const { registerPendingCastStep } = await imp("module-api.mjs");
  let slow = true;
  registerPendingCastStep("verify-slow-step", async () => { if (slow) await later(12000); return { lines: [] }; });
  const w = wizard("WizSlow");
  const outcome = await playerCasts(w);
  const answered = await on(cGM, () => PW.get(cGM).interruptPendingCast(w.actor, { criticalSeverity: "minor" }));
  slow = false;
  ok("Q16 THE DEFECT, cured: the holder acknowledges at once, and the GM waits for a step that takes 12 seconds rather than rolling on at 10",
    answered === true && outcome()?.outcome === "interrupted", JSON.stringify({ answered, o: outcome() }));
}
{
  // A PAY AND A BLOW TOGETHER: the AP is still being spent when the interruption settles the window.
  const w = wizard("WizRace");
  const outcome = await playerCasts(w);
  w.actor.system.resources.ap.value = 3;
  w.log.slow = 60;
  const writesBefore = w.log.flagWrites.length;
  const paying = on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  await later(20);
  await on(cGM, () => hook(cGM, "preUpdateActor")(w.actor, { system: { resources: { hp: { value: 12 } } } }, {}, gmA.id));
  await paying;
  await settleAll(30);
  w.log.slow = 0;
  ok("Q17 THE DEFECT, cured: a payment finishing after the window was interrupted does not write its record back at all",
    outcome()?.outcome === "interrupted" && !w.flags[PENDING_CAST_FLAG] && w.log.flagWrites.length === writesBefore,
    JSON.stringify({ o: outcome(), flag: w.flags[PENDING_CAST_FLAG], writes: w.log.flagWrites.length - writesBefore }));
}
{
  // …AND ONE INTERRUPTED WHILE THE RECORD'S OWN WRITE IS IN FLIGHT.
  const w = wizard("WizRace2");
  const outcome = await playerCasts(w);
  w.actor.system.resources.ap.value = 3;
  w.log.slowFlag = 80;
  const paying = on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  await later(40);
  await on(cGM, () => hook(cGM, "preUpdateActor")(w.actor, { system: { resources: { hp: { value: 12 } } } }, {}, gmA.id));
  await paying;
  await settleAll(40);
  w.log.slowFlag = 0;
  ok("Q17b and if the blow lands while the record is being written, the record is taken back off",
    outcome()?.outcome === "interrupted" && !w.flags[PENDING_CAST_FLAG], JSON.stringify({ o: outcome(), flag: w.flags[PENDING_CAST_FLAG] }));
}
{
  // TWO SCREENS, TWO COMBATS: the GM runs combat 1; the player is viewing combat 2.
  const w = wizard("WizOther");
  await playerCasts(w);
  cPlayer.game.combat = { id: "combat0000000002", started: true, round: 1, turn: 0, combatants: [] };
  w.actor.system.resources.ap.value = 3;
  const turn = await on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  await settleAll();
  ok("Q18 THE DEFECT, cured: a holder viewing a different combat spends nothing, is credited nothing, and the line says why",
    /different combat/.test(turn?.line ?? "") && w.flags[PENDING_CAST_FLAG]?.apPaid === 0 && w.log.apWrites.length === 0, JSON.stringify({ turn, record: w.flags[PENDING_CAST_FLAG] }));
  // The same combat, but not started on the player's screen: `spendActionPoints` spends nothing.
  cPlayer.game.combat = { id: "combat0000000001", started: false, round: 1, turn: 0, combatants: [] };
  const turn2 = await on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  await settleAll();
  ok("Q19 THE DEFECT, cured: AP the spender did not take is not counted toward the window", w.flags[PENDING_CAST_FLAG]?.apPaid === 0 && w.log.apWrites.length === 0 && /no AP/.test(turn2?.line ?? ""), JSON.stringify({ turn2, record: w.flags[PENDING_CAST_FLAG] }));
  cPlayer.game.combat = inCombat;
}
equal("Q8 the holder, row by row: the starter if connected; else nobody; an old record's connected player owner, never a GM", [
  pendingCastHolder({ startedBy: "p", users: [{ id: "p", active: true }] }),
  pendingCastHolder({ startedBy: "p", users: [{ id: "p", active: false }, { id: "q", active: true, owner: true }] }),
  pendingCastHolder({ startedBy: null, users: [{ id: "g", active: true, isGM: true, owner: true }, { id: "q", active: true, owner: true }] }),
  pendingCastHolder({ startedBy: null, users: [{ id: "g", active: true, isGM: true, owner: true }, { id: "q", active: false, owner: true }] })
], ["p", null, "q", null]);
{
  const src = strip(read("module", "magic", "pending-cast-workflow.mjs"));
  const boot = strip(read("scripts", "trg-prime.mjs"));
  ok("Q9 the relay rides the system socket with its own actions, and is registered at ready beside the reaction ask",
    /const RELAY_SOCKET = `system\.\$\{SYSTEM_ID\}`;/.test(src) && /"pendingCast\.ask"/.test(src) && /"pendingCast\.accepted"/.test(src) && /"pendingCast\.answer"/.test(src)
    && (src.match(/if \(actor && mayAct\(actor\)\)/g) ?? []).length === 2
    && /registerReactionAsk\(\);\s*registerPendingCastRelay\(\);/.test(boot));
}

/* ------------------------------------------------------------ X. 3.686.2: nobody holds it, said at once */
// NEW 3.686.2 (the 3.686.1 review, finding 6). 3.686.1 stopped a tab of the
// holder's account that does not hold the casting from acknowledging — right
// — but it then said nothing, so an ask with no live holder waited out its
// ten seconds: Phase 1 stalled every turn, and Stop and Complete failed and
// left the flag. Such a tab now answers at once with a "ghost" answer.
const cPlayerTab2 = client(player), cGMTab2 = client(gmA);
// The non-holding tab hears every ask FIRST, so its ghost answer reaches the
// asker before the holder's acknowledgement does (the order X3 needs).
clients.splice(clients.indexOf(cPlayerTab2), 1); clients.unshift(cPlayerTab2);
for (const c of [cPlayerTab2, cGMTab2]) {
  const pw = await imp("magic/pending-cast-workflow.mjs", `pc-tab2-${c.game.user.id}`);
  PW.set(c, pw);
  on(c, () => { pw.registerPendingCastHooks(); pw.registerPendingCastRelay?.(); });
}
const timed = async (fn) => { const t0 = Date.now(); const out = await fn(); return { out, ms: Date.now() - t0 }; };
{
  // The player's casting browser reloaded; the player is still connected.
  const w = wizard("WizGhost");
  w.flags[PENDING_CAST_FLAG] = { spellName: "Fireball", apOwed: 6, apPaid: 0, handle: {}, dc: 18, userId: player.id, castId: "ghostcast0000001" };
  w.actor.system.resources.ap.value = 3;
  const pay = await timed(() => on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor)));
  ok("X1 THE DEFECT, cured: Phase 1 with no live holder goes on at once (no ten-second stall), paying nothing",
    pay.out === null && pay.ms < 3000 && w.log.apWrites.length === 0, JSON.stringify(pay));
  cards.length = 0; notices.length = 0;
  const stop = await timed(() => on(cGM, () => PW.get(cGM).stopPendingCast(w.actor)));
  await settleAll();
  ok("X2 THE DEFECT, cured: the GM's Stop with no live holder clears the flag and posts the card, at once, with no warning",
    stop.out === true && stop.ms < 3000 && !w.flags[PENDING_CAST_FLAG] && cards.some((c) => /— Stopped/.test(c.content))
    && !notices.some((n) => n.kind === "warn"), JSON.stringify({ stop, notices }));
}
{
  // Two tabs of the player; the first holds the casting, the second does not.
  const w = wizard("WizTwoTabs");
  const outcome = await playerCasts(w);
  cards.length = 0;
  const stop = await timed(() => on(cGM, () => PW.get(cGM).stopPendingCast(w.actor)));
  await settleAll();
  const stoppedCards = cards.filter((c) => /— Stopped/.test(c.content ?? ""));
  ok("X3 a ghost answer from the player's other tab does not pre-empt the tab that holds it: relayed, stopped there, one card from the holder",
    stop.out === true && outcome()?.outcome === "stopped" && !w.flags[PENDING_CAST_FLAG]
    && stoppedCards.length === 1 && stoppedCards[0].by === player.id, JSON.stringify({ stop, o: outcome(), cards: stoppedCards.map((c) => c.by) }));
}
{
  // THE ASKER'S OWN ACCOUNT holds it, in a tab that is gone; its other tab is here.
  const w = wizard("WizSelf");
  w.flags[PENDING_CAST_FLAG] = { spellName: "Fireball", apOwed: 0, apPaid: 0, handle: {}, dc: 18, userId: gmA.id, castId: "selfcast00000001" };
  const stop = await timed(() => on(cGM, () => PW.get(cGM).stopPendingCast(w.actor)));
  ok("X4 the asker's own account, another tab answering as a ghost: the local stop runs at once",
    stop.out === true && stop.ms < 3000 && !w.flags[PENDING_CAST_FLAG], JSON.stringify(stop));
  w.flags[PENDING_CAST_FLAG] = { spellName: "Fireball", apOwed: 0, apPaid: 0, handle: {}, dc: 18, userId: gmA.id, castId: "selfcast00000002" };
  cGMTab2.muted = true;
  const alone = await timed(() => on(cGM, () => PW.get(cGM).stopPendingCast(w.actor)));
  cGMTab2.muted = false;
  ok("X5 ...and with no other tab of the account to answer, the short wait means nobody holds it, not a ten-second timeout",
    alone.out === true && alone.ms < 3000 && !w.flags[PENDING_CAST_FLAG], JSON.stringify(alone));
}
{
  const src = strip(read("module", "magic", "pending-cast-workflow.mjs"));
  const body = src.slice(src.indexOf("export async function awaitPendingCast"), src.indexOf("function pendingCastButtons"));
  ok("X6 the casting's resolver is held before its flag is written (the probe/ask race at the flag)",
    body.indexOf("waiting.set(actor.id, resolveCast);") > 0
    && body.indexOf("waiting.set(actor.id, resolveCast);") < body.indexOf("await actor.setFlag(SYSTEM_ID, PENDING_CAST_FLAG, record);"));
}

/* ------------------------------------------------------------ X. 3.686.2: an answer after the window */
// NEW 3.686.2 (the review's LOW 3). The holding tab hears the ask only after
// the asker's window has lapsed (here: its messages are held, then delivered
// in order). The asker sends a cancel when it stops waiting; the holder does
// not act on a cancelled ask; and a window whose flag another client has
// cleared is settled, not left waiting for the actor's next casting.
// Held messages arrive together, in order, as a burst does when a stalled socket catches up.
const release = async (c) => { const q = c.held ?? []; c.held = null; for (const d of q) als.run(c, () => { for (const h of c.socketHandlers) h(structuredClone(d)); }); await settleAll(); };
{
  const w = wizard("WizLatePay");
  await playerCasts(w);
  w.actor.system.resources.ap.value = 3;
  cPlayer.held = [];
  const pay = await on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  const emitted = []; const emit = cPlayer.game.socket.emit;
  cPlayer.game.socket.emit = (name, data) => { emitted.push(data?.action); return emit(name, data); };
  await release(cPlayer);
  cPlayer.game.socket.emit = emit;
  ok("X7b ...the cancel reached it first, so it did not even acknowledge the lapsed ask", !emitted.includes("pendingCast.accepted"), JSON.stringify(emitted));
  ok("X7 a payment the holder hears only after the GM's window lapsed is not made: no AP spent with no line on the GM's card",
    pay === null && w.log.apWrites.length === 0 && w.flags[PENDING_CAST_FLAG]?.apPaid === 0, JSON.stringify({ pay, writes: w.log.apWrites }));
}
{
  // The ask arrives late and ALONE; the cancel only later still. The holder has
  // acknowledged by then, so only the go it never gets keeps it from acting.
  const w = wizard("WizLatePay2");
  await playerCasts(w);
  w.actor.system.resources.ap.value = 3;
  cPlayer.held = [];
  const pay = await on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor));
  const queued = cPlayer.held; cPlayer.held = null;
  const asks = queued.filter((d) => d?.action === "pendingCast.ask"), rest = queued.filter((d) => d?.action !== "pendingCast.ask");
  for (const d of asks) als.run(cPlayer, () => { for (const h of cPlayer.socketHandlers) h(structuredClone(d)); });
  await settleAll();
  for (const d of rest) als.run(cPlayer, () => { for (const h of cPlayer.socketHandlers) h(structuredClone(d)); });
  await settleAll();
  ok("X7c an ask acknowledged after its asker lapsed is still not acted on: the holder waits for a go that never comes",
    pay === null && w.log.apWrites.length === 0, JSON.stringify({ pay, writes: w.log.apWrites.length }));
}
{
  const w = wizard("WizLateStop");
  const outcome = await playerCasts(w);
  cPlayer.held = [];
  cards.length = 0;
  const stopped = await on(cGM, () => PW.get(cGM).stopPendingCast(w.actor));
  await release(cPlayer);
  // The GM's fallback cleared the flag; the world tells the holder's client so.
  await on(cPlayer, () => hook(cPlayer, "updateActor")(w.actor, { flags: { "trg-prime": { [`-=${PENDING_CAST_FLAG}`]: null } } }, {}, gmA.id));
  await settleAll();
  const stops = cards.filter((c) => /— Stopped/.test(c.content ?? ""));
  ok("X8 a Stop the holder hears late: one Stopped card (the GM's), and the holder's own promise is settled, not left waiting",
    stopped === true && stops.length === 1 && outcome()?.outcome === "stopped", JSON.stringify({ stopped, cards: stops.map((c) => c.by), o: outcome() }));
}
{
  const w = wizard("WizGoneComplete");
  const outcome = await playerCasts(w);
  delete w.flags[PENDING_CAST_FLAG]; // cleared by another client; no update reached this one yet
  on(cGM, () => cGM.game.socket.emit("system.trg-prime", { action: "pendingCast.ask", requestId: "latecomplete0001", userId: gmA.id, holderId: player.id, op: "complete", actorUuid: w.actor.uuid, args: {} }));
  await settleAll();
  // The asker's go, as an asker still waiting sends on the acknowledgement.
  on(cGM, () => cGM.game.socket.emit("system.trg-prime", { action: "pendingCast.go", requestId: "latecomplete0001", userId: gmA.id, holderId: player.id }));
  await settleAll(20);
  equal("X9 a relayed Complete that finds the flag gone settles the holder's promise (as stopped) and completes nothing", outcome()?.outcome, "stopped");
}

/* ------------------------------------------------------------ X. 3.686.2's third review */
{
  // LOW 3: the asker's go is LOST (no cancel either). The holder waits for it,
  // does nothing, and says so; the asker settles then, not after five minutes.
  const w = wizard("WizLostGo");
  await playerCasts(w);
  w.actor.system.resources.ap.value = 3;
  cPlayer.drop = new Set(["pendingCast.go"]);
  const t0 = Date.now();
  const pay = await Promise.race([on(cGM, () => PW.get(cGM).payPendingCastTurn(w.actor)), later(15000).then(() => "stalled")]);
  const ms = Date.now() - t0;
  cPlayer.drop = null;
  await settleAll();
  ok("X10 a lost go: the holder spends nothing and answers when its wait ends, so the asker settles within seconds (not RELAY_WORK_MS)",
    pay === null && ms < 13000 && w.log.apWrites.length === 0, JSON.stringify({ pay, ms, writes: w.log.apWrites.length }));
}
{
  // LOW 4: the PREVIOUS casting's flag removal lands while a new casting is
  // held but its flag not yet written. The new casting must survive it.
  const w = wizard("WizRemovalRace");
  w.log.slowFlag = 60;
  let outcome = null;
  on(cPlayer, () => { PW.get(cPlayer).awaitPendingCast(w.actor, { spell: { id: "fireball00000001", name: "Fireball" }, increments: 1, unit: "minute", size: 1, bonus: 1, dc: 18 }).then((o) => { outcome = o; }); });
  await later(20); // held; its setFlag is in flight
  await on(cPlayer, () => hook(cPlayer, "updateActor")(w.actor, { flags: { "trg-prime": { [`-=${PENDING_CAST_FLAG}`]: null } } }, {}, gmA.id));
  await settleAll(30);
  w.log.slowFlag = 0;
  ok("X11 a removal of the previous casting's flag, landing before the new casting's flag is written, does not end the new casting",
    outcome === null && Boolean(w.flags[PENDING_CAST_FLAG]), JSON.stringify({ outcome, flag: Boolean(w.flags[PENDING_CAST_FLAG]) }));
  // ...while a removal of THIS casting's (written) flag still ends it.
  delete w.flags[PENDING_CAST_FLAG];
  await on(cPlayer, () => hook(cPlayer, "updateActor")(w.actor, { flags: { "trg-prime": { [`-=${PENDING_CAST_FLAG}`]: null } } }, {}, gmA.id));
  await settleAll();
  equal("X11b ...and once its flag is written, a removal does end it", outcome?.outcome, "stopped");
}

/* ------------------------------------------------------------ the guards, read */
{
  const uw = strip(read("module", "combat", "underwater-workflow.mjs"));
  const af = strip(read("module", "combat", "affliction-workflow.mjs"));
  const bc = strip(read("module", "magic", "bardic-conviction.mjs"));
  ok("G1 the three hooks ask isActingClientFor of the creature, each importing it from acting-gm.mjs",
    /if \(!actor\) return;\s*if \(!isActingClientFor\(actor\)\) return;/.test(uw)
    && /if \(!actor\?\.items\) return;\s*if \(!isActingClientFor\(actor\)\) return;/.test(af)
    && /if \(!actor\?\.update\) return;\s*if \(!isActingClientFor\(actor\)\) return;/.test(bc)
    && [uw, af, bc].every((t) => /import \{ isActingClientFor \} from "\.\.\/acting-gm\.mjs";/.test(t)));
}

/* ------------------------------------------------------------ Z. the version */
const manifest = JSON.parse(read("system.json"));
// RE-PINNED 3.686.0: "3.685.3 or later", as verify-fixes-3685-3's Z1 reads it.
{
  const v = String(manifest.version).split(".").map(Number);
  equal("Z1 the version is 3.685.3 or later, and the download names it", [v[0] > 3 || (v[0] === 3 && (v[1] > 685 || (v[1] === 685 && v[2] >= 3))), manifest.download],
    [true, `https://github.com/snowtroll75-debug/trpg-prime/releases/download/v${manifest.version}/trg-prime.zip`]);
}

const EXPECTED = 67; // 3.686.2: X1-X11
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-fixes-3685-3b: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-fixes-3685-3b: ${checks} checks — all green.`);
process.exit(process.exitCode ?? 0);
