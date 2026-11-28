#!/usr/bin/env node
/**
 * verify-party-sheet-stage1: TRG Prime 3.708.0, Party Sheet V2 Stage 1
 * (foundation, live updating, performance and security).
 *
 *   R  Member resolution: one batch, roster order kept, duplicates once,
 *      missing / ineligible / failed lookups reported and never removed.
 *   L  Live sync: a member's change re-renders the sheets that show it, an
 *      unrelated actor's renders nothing, two parties sharing a member, a
 *      deleted actor or token, hooks installed once and removed with the
 *      last sheet, repeated open/close.
 *   C  The render coalescer: a burst is one render, nothing after close,
 *      typing defers it to focus-out.
 *   S  Membership integrity and persistence: add/remove/duplicates, an
 *      ineligible type refused, the sheet never writes while it renders.
 *   D  Item drops: unsupported types, quantity, GM-only, a re-sort; a
 *      player's drag of party loot onto a sheet refused.
 *   V  Visibility: NPC members gated by Observer (Graham), player
 *      characters always shown, the Rewards tab and its context GM-only,
 *      no `system` in the context.
 *   T  Foundry v14's own tabs.
 *   W  Existing workflows: Take item/coin conserve stock, XP award and
 *      Begin Session still run, through the shared resolver.
 *   F  What the live test of 3.708.0 found (fixed in 3.708.1).
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

/* ------------------------------------------------------------ the fake world */
const chat = [];
const warnings = [];
globalThis.foundry = { applications: { api: { DialogV2: class {} } }, utils: {} };
globalThis.ui = { notifications: { info() {}, warn(m) { warnings.push(m); }, error() {} } };
globalThis.ChatMessage = { create: async (data) => { chat.push(data); return data; }, getSpeaker: () => ({}) };
globalThis.game = { user: { id: "gm", isGM: true }, settings: { get: () => true } };

function fakeActor({ id, type = "character", name = id, level = 3, hp = [10, 20], pp = [4, 8], xp = 0, conviction = [0, 2], feats = [], observers = [] }) {
  const actor = {
    id, uuid: `Actor.${id}`, name, img: `${id}.webp`, type, documentName: "Actor",
    items: feats.map((f) => ({ type: "feat", name: f })),
    system: {
      identity: { level, race: "Human", class: "Fighter", xp: { value: xp } },
      resources: { hp: { value: hp[0], max: hp[1], temp: 0 }, pp: { value: pp[0], max: pp[1] }, conviction: { value: conviction[0], max: conviction[1] } }
    },
    updates: [],
    async update(change) {
      this.updates.push(change);
      for (const [key, value] of Object.entries(change)) {
        const parts = key.split(".");
        let at = this;
        for (const part of parts.slice(0, -1)) at = at[part] ??= {};
        at[parts.at(-1)] = value;
      }
      return this;
    },
    testUserPermission(user, level) { return level === "OBSERVER" && observers.includes(user.id); }
  };
  return actor;
}

const world = new Map();
let syncCalls = 0;
let asyncCalls = 0;
const throwing = new Set();
globalThis.fromUuidSync = (uuid) => { syncCalls += 1; if (throwing.has(uuid)) throw new Error("bad uuid"); return world.get(uuid) ?? null; };
globalThis.fromUuid = async (uuid) => { asyncCalls += 1; if (throwing.has(uuid)) throw new Error("bad uuid"); return world.get(uuid) ?? null; };
const put = (actor) => { world.set(actor.uuid, actor); return actor; };

const P = await imp("party.mjs");
const M = await imp("party-members.mjs");
const LS = await imp("party-live-sync.mjs");
const RW = await imp("party-rewards-workflow.mjs");
const PS = await imp("party-socket.mjs");

const SHEET = strip(read("module", "sheets", "party-sheet.mjs"));
const HBS = read("templates", "actor", "party-sheet.hbs");
const BOOT = strip(read("scripts", "trg-prime.mjs"));
const RWS = strip(read("module", "party-rewards-workflow.mjs"));

/* ------------------------------------------------------------ R. resolution */
{
  const a = put(fakeActor({ id: "A" }));
  const b = put(fakeActor({ id: "B", type: "npc" }));
  const comp = put(fakeActor({ id: "C", type: "companion" }));
  throwing.add("Actor.BAD");
  const resolvers = {
    resolveSync: (u) => globalThis.fromUuidSync(u),
    resolveAsync: (u) => globalThis.fromUuid(u)
  };
  syncCalls = 0; asyncCalls = 0;
  const out = await M.resolveActorUuids(["Actor.B", "Actor.A", "Actor.A", "", "Actor.GONE", "Actor.C", "Actor.BAD"], resolvers);
  equal("R1 roster order is kept and a duplicate is resolved once",
    out.map((e) => e.uuid), ["Actor.B", "Actor.A", "Actor.GONE", "Actor.C", "Actor.BAD"]);
  equal("R2 each entry's status: ok, ok, missing, ineligible, error",
    out.map((e) => e.status), ["ok", "ok", "missing", "ineligible", "error"]);
  ok("R3 the resolved entries hold the live documents, not copies", out[0].actor === b && out[1].actor === a && out[3].actor === comp);
  equal("R4 one sync lookup per unique UUID; only the unresolved go async, in one batch", [syncCalls, asyncCalls], [5, 2]);
  equal("R5 activeMembers is the eligible ones, in order", M.activeMembers(out).map((x) => x.id), ["B", "A"]);
  ok("R6 a failed lookup carries its reason", /bad uuid/.test(out[4].error ?? ""));

  // A compendium index entry (no update method) is fetched properly.
  const indexEntry = { name: "index only" };
  const full = fakeActor({ id: "PK" });
  const viaPack = await M.resolveActorUuids(["Compendium.x.y.Actor.PK"], {
    resolveSync: () => indexEntry, resolveAsync: async () => full
  });
  ok("R7 a compendium index entry is not mistaken for the actor", viaPack[0].actor === full && viaPack[0].status === "ok");

  // A UUID naming something that is not an Actor.
  const item = { uuid: "Item.X", documentName: "Item", type: "weapon", update() {} };
  const notActor = await M.resolveActorUuids(["Item.X"], { resolveAsync: async () => item });
  equal("R8 a UUID that names an Item is ineligible, not a member", notActor[0].status, "ineligible");

  // Rewards consumes the resolved roster instead of resolving it again.
  const party = { uuid: "Actor.P", type: "party", system: { members: ["Actor.A", "Actor.B"], encounter: { threat: "medium", creatures: [] } } };
  syncCalls = 0; asyncCalls = 0;
  const ctx = await RW.rewardsContext(party, { members: [a, b] });
  equal("R9 rewardsContext given the members looks none of them up", [syncCalls, asyncCalls], [0, 0]);
  equal("R10 ...and counts them for the APL", ctx.apl.members, 2);
  const alone = await RW.rewardsContext(party);
  equal("R11 without them it resolves the roster itself (2 lookups)", [alone.apl.members, syncCalls], [2, 2]);

  // An adversary list with a deleted creature and a party in it.
  const foe = put(fakeActor({ id: "F", type: "npc", level: 5 }));
  const withFoes = { ...party, system: { ...party.system, encounter: { threat: "medium", creatures: [{ uuid: "Actor.F", count: 2 }, { uuid: "Actor.DEAD", count: 1 }, { uuid: "Actor.P2", count: 1 }] } } };
  put({ ...fakeActor({ id: "P2", type: "party" }) });
  const fctx = await RW.rewardsContext(withFoes, { members: [a, b] });
  equal("R12 adversaries: the live one counted, a deleted one and a party shown as missing",
    fctx.creatures.map((c) => [c.uuid, c.missing, c.count]), [["Actor.F", false, 2], ["Actor.DEAD", true, 1], ["Actor.P2", true, 1]]);
  ok("R13 ...and the sheet is told which documents they came from", fctx.watchEntries.some((e) => e.uuid === "Actor.F"));
  ok("R14 the sheet resolves the roster once and hands it to Rewards",
    // RE-ANCHORED 3.709.0: counted within the render (_prepareContext); the Stage 2
    // party-initiative button resolves again when pressed, which is not a render.
    (SHEET.slice(SHEET.indexOf("async _prepareContext"), SHEET.indexOf("#watchKeys = new Set()")).match(/resolvePartyRoster\(/g) ?? []).length === 1
    && /rewardsContext\(actor, \{ members: activeMembers\(roster\) \}\)/.test(SHEET)
    && !/await fromUuid\(uuid\)/.test(SHEET.slice(SHEET.indexOf("async _prepareContext"), SHEET.indexOf("#watchKeys = new Set()"))));
  ok("R15 the rewards workflow has no lookup loop of its own any more",
    !/for \(const uuid of normaliseMembers/.test(RWS) && /activeMembers\(await resolvePartyRoster\(party\)\)/.test(RWS));
  void foe;
}

/* ------------------------------------------------------------ L. live sync */
{
  const hooks = (() => {
    let next = 1;
    const on = new Map();
    return {
      on(event, fn) { const id = next++; on.set(id, { event, fn }); return id; },
      off(event, id) { const entry = on.get(id); if (entry && entry.event === event) on.delete(id); },
      call(event, ...args) { for (const { event: e, fn } of [...on.values()]) if (e === event) fn(...args); },
      get size() { return on.size; }
    };
  })();
  const sync = new LS.PartyLiveSync(hooks);
  const sheet = (name) => ({ name, told: 0, onPartyDocumentChanged() { this.told += 1; } });
  const partyA = sheet("A");
  const partyB = sheet("B");
  const actor = (uuid, extra = {}) => ({ uuid, documentName: "Actor", ...extra });

  equal("L1 no sheet open: no hooks", [sync.hookCount, hooks.size], [0, 0]);
  sync.watch(partyA, ["Actor.a1", "Actor.a2", "Actor.shared"]);
  sync.watch(partyB, ["Actor.b1", "Actor.shared"]);
  equal("L2 two sheets open: one set of hooks, every event once", [sync.hookCount, hooks.size, sync.sheetCount], [LS.PARTY_SYNC_EVENTS.length, LS.PARTY_SYNC_EVENTS.length, 2]);
  for (const event of ["updateActor", "deleteActor", "createActor", "updateItem", "createActiveEffect", "deleteActiveEffect", "deleteToken"]) {
    ok(`L3 the ${event} hook is installed`, LS.PARTY_SYNC_EVENTS.includes(event));
  }

  hooks.call("updateActor", actor("Actor.a1"), { "system.resources.hp.value": 3 }, {}, "u");
  equal("L4 a member's HP change tells its party's sheet only", [partyA.told, partyB.told], [1, 0]);
  hooks.call("updateActor", actor("Actor.stranger"), { name: "x" }, {}, "u");
  equal("L5 an actor on no roster tells nobody", [partyA.told, partyB.told], [1, 0]);
  hooks.call("updateActor", actor("Actor.shared"), { img: "new.webp" }, {}, "u");
  equal("L6 a member of both parties tells both sheets", [partyA.told, partyB.told], [2, 1]);

  const owner = actor("Actor.b1");
  hooks.call("updateItem", { documentName: "Item", parent: owner }, { "system.equipped": true }, {}, "u");
  equal("L7 an item on a member (armour equipped) tells its party", partyB.told, 2);
  hooks.call("createActiveEffect", { documentName: "ActiveEffect", parent: { documentName: "Item", parent: owner } }, {}, "u");
  equal("L8 an effect on a member's item (a condition from gear) tells its party", partyB.told, 3);
  hooks.call("createActiveEffect", { documentName: "ActiveEffect", parent: actor("Actor.a2") }, {}, "u");
  equal("L9 a condition applied to a member tells its party", partyA.told, 3);
  hooks.call("updateItem", { documentName: "Item", parent: null }, {}, {}, "u");
  equal("L10 a world item belongs to no actor and tells nobody", [partyA.told, partyB.told], [3, 3]);
  hooks.call("updateActor", actor("Actor.a1"), {}, { render: false }, "u");
  equal("L11 an update made with render:false is respected", partyA.told, 3);

  hooks.call("deleteActor", actor("Actor.a2"), {}, "u");
  equal("L12 a member deleted from the world tells its party (it now shows as missing)", partyA.told, 4);

  // An unlinked token's actor on a roster, and its token deleted.
  sync.watch(partyB, ["Actor.b1", "Actor.shared", "Scene.s.Token.t1.Actor.b9"]);
  hooks.call("deleteToken", { uuid: "Scene.s.Token.t1", documentName: "Token" }, {}, "u");
  equal("L13 deleting the token whose actor is on the roster tells that party", partyB.told, 4);
  // A sheet showing the actor of token t10. Deleting token t1 must not reach
  // it, though "Scene.s.Token.t10..." starts with "Scene.s.Token.t1".
  const partyT = sheet("T");
  sync.watch(partyT, ["Scene.s.Token.t10.Actor.b8"]);
  hooks.call("deleteToken", { uuid: "Scene.s.Token.t1", documentName: "Token" }, {}, "u");
  equal("L14 ...and a token whose id merely starts the same does not", [partyB.told, partyT.told], [5, 0]);
  sync.unwatch(partyT);

  // Re-watching replaces, never accumulates (a member removed stops counting).
  sync.watch(partyA, ["Actor.a1"]);
  hooks.call("updateActor", actor("Actor.shared"), {}, {}, "u");
  equal("L15 after a re-render without a member, its changes no longer reach that sheet", [partyA.told, partyB.told], [4, 6]);
  equal("L16 ...and the reverse index forgot it", sync.sheetsFor("Actor.shared").size, 1);

  // Repeated opening and closing: the hook count never grows, and the last
  // close takes them all down.
  for (let i = 0; i < 25; i += 1) {
    const s = sheet(`tmp${i}`);
    sync.watch(s, ["Actor.a1"]);
    sync.watch(s, ["Actor.a1"]);
    sync.unwatch(s);
  }
  equal("L17 25 open/close cycles later, still one set of hooks", [sync.hookCount, hooks.size, sync.sheetCount], [LS.PARTY_SYNC_EVENTS.length, LS.PARTY_SYNC_EVENTS.length, 2]);
  sync.unwatch(partyA);
  sync.unwatch(partyB);
  equal("L18 the last sheet closing removes every hook", [sync.hookCount, hooks.size, sync.sheetCount], [0, 0, 0]);
  hooks.call("updateActor", actor("Actor.a1"), {}, {}, "u");
  equal("L19 a closed sheet is never told again", [partyA.told, partyB.told], [4, 6]);
  sync.watch(partyA, ["Actor.a1"]);
  equal("L20 reopening reinstalls exactly one set", hooks.size, LS.PARTY_SYNC_EVENTS.length);
  sync.unwatch(partyA);

  // A sheet that throws does not stop the others.
  const bad = { onPartyDocumentChanged() { throw new Error("boom"); } };
  const good = sheet("good");
  const quiet = console.error; console.error = () => {};
  sync.watch(bad, ["Actor.x"]); sync.watch(good, ["Actor.x"]);
  const told = sync.handle("updateActor", actor("Actor.x"), {}, {}, "u");
  console.error = quiet;
  equal("L21 one sheet failing does not stop the next being told", [told, good.told], [2, 1]);
  sync.unwatch(bad); sync.unwatch(good);

  // The keys a sheet watches: entries, and an unlinked token's base actor.
  const keys = M.watchKeysFor([
    { uuid: "Actor.a", actor: { uuid: "Actor.a" } },
    { uuid: "Scene.s.Token.t.Actor.b", actor: { uuid: "Scene.s.Token.t.Actor.b", isToken: true, baseActor: { uuid: "Actor.b" } } },
    { uuid: "Actor.gone", actor: null }
  ]);
  equal("L22 watched: each entry, a missing one too, and a token actor's base", [...keys].sort(), ["Actor.a", "Actor.b", "Actor.gone", "Scene.s.Token.t.Actor.b"]);

  ok("L23 the sheet watches after every render and leaves on close",
    /async _onRender\(context, options\) \{\s*await super\._onRender\(context, options\);[\s\S]*?partyLiveSync\(\)\.watch\(this, this\.#watchKeys\);/.test(SHEET)
    && /_onClose\(options\) \{\s*super\._onClose\(options\);\s*this\.#coalescer\.cancel\(\);\s*partyLiveSync\(\)\.unwatch\(this\);/.test(SHEET));
  ok("L24 the watched keys come from the roster and the GM's adversaries",
    /this\.#watchKeys = watchKeysFor\(\[\.\.\.roster, \.\.\.\(rewards\?\.watchEntries \?\? \[\]\)\]\);/.test(SHEET));
  ok("L25 a notification only requests a coalesced render",
    /onPartyDocumentChanged\(\) \{\s*this\.#coalescer\.request\(\);\s*\}/.test(SHEET));
}

/* ------------------------------------------------------------ C. coalescer */
{
  const timers = [];
  const mk = (over = {}) => {
    const state = { renders: 0, rendered: true, busy: false, idle: null };
    const c = new LS.RenderCoalescer({
      render: () => { state.renders += 1; },
      isRendered: () => state.rendered,
      isBusy: () => state.busy,
      whenIdle: (cb) => { state.idle = cb; },
      setTimer: (fn) => { timers.push(fn); return timers.length; },
      clearTimer: () => {},
      ...over
    });
    return { c, state };
  };
  const flush = () => { while (timers.length) timers.shift()(); };

  const { c, state } = mk();
  for (let i = 0; i < 20; i += 1) c.request();
  equal("C1 twenty changes in one moment start one timer", timers.length, 1);
  flush();
  equal("C2 ...and give one render", state.renders, 1);
  c.request(); flush();
  equal("C3 a later change renders again", state.renders, 2);

  const closed = mk();
  closed.c.request(); closed.state.rendered = false; flush();
  equal("C4 a sheet closed before the timer fires is not rendered", closed.state.renders, 0);

  const typing = mk();
  typing.state.busy = true;
  typing.c.request(); flush();
  equal("C5 while the GM types in a field, the render waits", typing.state.renders, 0);
  typing.c.request(); typing.c.request();
  equal("C6 ...more changes meanwhile add nothing", timers.length, 0);
  typing.state.busy = false; typing.state.idle();
  equal("C7 focus leaves the field: one render", typing.state.renders, 1);
  ok("C8 ...and the coalescer is free again", !typing.c.pending);

  const cancelled = mk();
  cancelled.state.busy = true;
  cancelled.c.request(); flush(); cancelled.c.cancel(); cancelled.state.idle();
  equal("C9 cancelled on close while waiting for focus-out: no render", cancelled.state.renders, 0);
}

/* ------------------------------------------------------------ S. membership */
{
  equal("S1 adding the same actor twice keeps one entry", P.addMember(["Actor.a"], "Actor.a"), ["Actor.a"]);
  equal("S2 a stored roster with duplicates and blanks is cleaned, order kept", P.normaliseMembers(["Actor.b", "", "Actor.a", "Actor.b", null]), ["Actor.b", "Actor.a"]);
  equal("S3 removing an entry, a missing one included, removes just it", P.removeMember(["Actor.a", "Actor.GONE", "Actor.b"], "Actor.GONE"), ["Actor.a", "Actor.b"]);
  ok("S4 only characters and NPCs may join",
    P.canJoinRoster({ type: "character" }) && P.canJoinRoster({ type: "npc" })
    && !P.canJoinRoster({ type: "companion" }) && !P.canJoinRoster({ type: "familiar" }) && !P.canJoinRoster({ type: "party" }));
  ok("S5 the drop handler refuses an ineligible type and a party joining itself",
    /if \(!canJoinRoster\(actor\)\) \{/.test(SHEET) && /if \(actor\.id === this\.actor\.id\) \{/.test(SHEET));
  const ctxSrc = SHEET.slice(SHEET.indexOf("async _prepareContext"), SHEET.indexOf("#watchKeys = new Set()"));
  ok("S6 rendering never writes the party (a failed lookup does not prune the roster)",
    !/\.update\(|updateEmbeddedDocuments|deleteEmbeddedDocuments/.test(ctxSrc));
  const missing = P.memberSummary(null, "Actor.GONE", () => [], { status: "missing" });
  const errored = P.memberSummary(null, "Actor.BAD", () => [], { status: "error" });
  ok("S7 a missing row keeps its UUID for Remove, and says why", missing.missing && missing.uuid === "Actor.GONE" && /deleted/.test(missing.missingReason));
  ok("S8 a lookup that failed says so, and that it is kept", errored.status === "error" && /kept until the GM removes it/.test(errored.missingReason));
  const ineligible = P.memberSummary({ name: "Rex", type: "companion" }, "Actor.C", () => [], { status: "ineligible" });
  ok("S9 an ineligible entry is flagged, with no statistics", ineligible.missing && ineligible.status === "ineligible" && ineligible.hp === undefined && /companion/.test(ineligible.missingReason));
  ok("S10 the GM is told when any entry needs attention, and every row has Remove",
    /\{\{#if isGM\}\}\{\{#if hasUnresolved\}\}/.test(HBS) && /data-action="removeMember"/.test(HBS) && /hasUnresolved: members\.some\(\(m\) => m\.missing\)/.test(SHEET));
  ok("S11 the stored shape is unchanged: members is still a list of UUIDs",
    JSON.parse(read("template.json")).Actor.party.members instanceof Array);
}

/* ------------------------------------------------------------ D. drops */
{
  const party = { uuid: "Actor.P" };
  const plan = (item, isGM = true) => P.planLootDrop({ item, isGM, partyUuid: party.uuid });
  ok("D1 a GM's sword goes in", plan({ type: "weapon", name: "Sword", system: { quantity: 1 } }).ok);
  for (const type of ["spell", "feat", "affliction", "class", "background"]) {
    const result = plan({ type, name: `A ${type}`, system: { quantity: 1 } });
    ok(`D2 a ${type} is refused, with the reason`, !result.ok && /party loot takes/.test(result.reason));
  }
  ok("D3 a player's drop is refused", !plan({ type: "gear", system: { quantity: 1 } }, false).ok);
  ok("D4 a stack of zero is refused", !plan({ type: "gear", name: "Rope", system: { quantity: 0 } }).ok);
  ok("D5 a negative or non-number quantity is refused",
    !plan({ type: "gear", system: { quantity: -3 } }).ok && !plan({ type: "gear", system: { quantity: "lots" } }).ok);
  ok("D6 an item with no quantity field counts as one", plan({ type: "armour", system: {} }).ok);
  ok("D7 nothing to drop is refused", !plan(null).ok);
  const sort = plan({ type: "spell", parent: { uuid: "Actor.P" }, system: {} });
  ok("D8 a row already in the pile dragged within it is a re-sort", sort.ok && sort.sort);
  ok("D9 the sheet checks every item drop before Foundry creates it, and refuses effects",
    /async _onDropItem\(event, item\) \{\s*const plan = planLootDrop\(/.test(SHEET)
    && /if \(!plan\.ok\) \{\s*ui\.notifications\?\.warn\(plan\.reason\);\s*return null;/.test(SHEET)
    && /async _onDropActiveEffect\(\) \{[\s\S]*?return null;/.test(SHEET));

  equal("D10 a player dragging party loot onto their character is refused",
    Boolean(P.refusePartyLootDrag({ sourceParentType: "party", targetType: "character", isGM: false })), true);
  equal("D11 ...a GM may (a GM can create any item)", P.refusePartyLootDrag({ sourceParentType: "party", targetType: "character", isGM: true }), null);
  equal("D12 ...an item from anywhere else is not this rule's business", P.refusePartyLootDrag({ sourceParentType: "character", targetType: "character", isGM: false }), null);
  ok("D13 the guard is installed once, at init, and only a GM may start a loot drag",
    /registerPartyLootDragGuard\(\);/.test(BOOT) && /if \(lootDragGuardInstalled\) return;/.test(SHEET)
    && /Hooks\.on\("dropActorSheetData"/.test(SHEET) && /_canDragStart\(selector\) \{\s*return game\.user\?\.isGM === true;/.test(SHEET));
}

/* ------------------------------------------------------------ V. visibility */
{
  const player = { id: "p1", isGM: false };
  const gm = { id: "gm", isGM: true };
  const pc = fakeActor({ id: "PC" });
  const npc = fakeActor({ id: "NPC", type: "npc" });
  const watchedNpc = fakeActor({ id: "NPC2", type: "npc", observers: ["p1"] });
  equal("V1 a player sees a PC's statistics (Graham: PCs stay visible)", M.canSeeMemberDetails(pc, player), true);
  equal("V2 ...not an NPC's they do not observe", M.canSeeMemberDetails(npc, player), false);
  equal("V3 ...an NPC they observe, yes", M.canSeeMemberDetails(watchedNpc, player), true);
  equal("V4 a GM sees everything", M.canSeeMemberDetails(npc, gm), true);
  const row = P.memberSummary(npc, npc.uuid, () => ["Weakened 2"], { status: "ok", restricted: true });
  ok("V5 a gated NPC's row carries its name and portrait and nothing else",
    row.restricted && row.name === "NPC" && row.img && row.hp === undefined && row.pp === undefined
    && row.level === undefined && row.class === undefined && row.conditions.length === 0);
  const full = P.memberSummary(pc, pc.uuid, () => [], { status: "ok" });
  ok("V6 an ungated row is the full summary as before", full.hp.max === 20 && full.pp.max === 8 && full.restricted === false);
  ok("V7 the sheet gates by the ruling", /restricted: entry\.status === MEMBER_STATUS\.OK && !canSeeMemberDetails\(entry\.actor, game\.user\)/.test(SHEET));
  ok("V8 the Rewards tab is not offered to a player",
    /if \(!config \|\| group !== "primary" \|\| game\.user\?\.isGM\) return config;\s*return \{ \.\.\.config, tabs: config\.tabs\.filter\(\(tab\) => tab\.id !== "rewards"\) \};/.test(SHEET));
  ok("V9 ...its context is built for a GM only", /const rewards = isGM \? await rewardsContext\(/.test(SHEET));
  ok("V10 ...and its panel is inside an isGM block", /\{\{#if isGM\}\}\s*<section class="tab sheet-tab-panel \{\{tabs\.rewards\.cssClass\}\}"/.test(HBS));
  const ctxReturn = SHEET.slice(SHEET.indexOf("return {\n      ...context,"), SHEET.indexOf("#watchKeys = new Set()"));
  ok("V11 the context no longer carries the whole `system` (encounter, GM notes)", !/^\s*system,\s*$/m.test(ctxReturn));
  ok("V12 the award workflow still refuses a player in its own code", /if \(!game\.user\?\.isGM\) \{\s*ui\.notifications\?\.warn\("Only the GM awards experience\."\);/.test(RWS)
    && /export async function beginSession\(party\) \{\s*if \(!game\.user\?\.isGM\) return null;/.test(RWS));
  ok("V13 the template's gated row prints no bars", /\{\{else if m\.restricted\}\}(?:(?!party-bar)[\s\S])*?\{\{else\}\}/.test(HBS));
}

/* ------------------------------------------------------------ T. tabs */
{
  ok("T1 the old copy of selectTab is gone", !/static selectTab\(/.test(SHEET) && !/selectTab: TRGPartySheet\.selectTab/.test(SHEET) && !/data-action="selectTab"/.test(HBS));
  ok("T2 the nav uses Foundry's tab action, inside a .tabs container", /<nav class="sheet-tabs tabs" data-group="primary"/.test(HBS) && /data-action="tab"/.test(HBS));
  ok("T3 a click on the tab's icon or label still changes tab", /_onClickTab\(event\) \{\s*const button = event\.target\?\.closest\?\.\("\[data-tab\]"\);/.test(SHEET));
  ok("T4 changeTab is Foundry's, with the aria state kept in step", /changeTab\(tab, group, options = \{\}\) \{\s*super\.changeTab\(tab, group, options\);/.test(SHEET));
  // Re-anchored 3.712.0 (Stage 5), same meaning: five panels now (Skills and Notes built).
  ok("T5 each panel is still a .tab with its group, as changeTab finds them", (HBS.match(/class="tab sheet-tab-panel/g) ?? []).length === 5);
  ok("T6 scroll positions survive a live re-render", /scrollable: \['section\[data-tab="roster"\]'/.test(SHEET));
  ok("T7 the three tabs are still declared", /\{ id: "roster"/.test(SHEET) && /\{ id: "loot"/.test(SHEET) && /\{ id: "rewards"/.test(SHEET));
}

/* ------------------------------------------------------------ W. existing workflows */
{
  // Take an item: the stack is conserved between party and character.
  // RE-ANCHORED 3.711.0 (Stage 4), same meaning: the take now runs through
  // the transfer engine (party-transfers.mjs), and the character must be a
  // member of the party, as Stage 4 requires.
  const PT = await imp("party-transfers.mjs");
  const partyItems = new Map();
  const party = { uuid: "Actor.P", name: "P", type: "party", flags: {}, items: { get: (id) => partyItems.get(id), [Symbol.iterator]: () => partyItems.values() },
    async updateEmbeddedDocuments(_t, rows) { for (const r of rows) partyItems.get(r._id).system.quantity = r["system.quantity"]; },
    async deleteEmbeddedDocuments(_t, ids) { for (const id of ids) partyItems.delete(id); },
    system: { members: ["Actor.H"], currency: { mp: 0, pp: 0, gp: 10, sp: 5, cp: 0 } },
    async update(c) { if (c["system.currency"]) this.system.currency = c["system.currency"]; for (const [k, v] of Object.entries(c)) if (k.startsWith("flags.")) { this.flags["trg-prime"] = { ...(this.flags["trg-prime"] ?? {}), transferJournal: v }; } } };
  const sword = { id: "i1", uuid: "Actor.P.Item.i1", name: "Sword", type: "weapon", parent: party, system: { quantity: 5 }, toObject() { return { name: "Sword", type: "weapon", system: { quantity: this.system.quantity } }; } };
  partyItems.set("i1", sword);
  const created = [];
  const hero = { uuid: "Actor.H", name: "H", type: "character", items: [], async createEmbeddedDocuments(_t, rows) { created.push(...rows); return rows.map((r, i) => ({ id: `n${created.length}${i}` })); },
    async updateEmbeddedDocuments() {}, system: { currency: { mp: 0, pp: 0, gp: 0, sp: 0, cp: 0 } }, async update(c) { Object.assign(this.system, { currency: c["system.currency"] }); } };
  const docs = { "Actor.P": party, "Actor.H": hero, "Actor.P.Item.i1": sword };
  const deps = { resolve: async (u) => docs[u] ?? null, ownsActor: (a, u) => u === "p1" && a === hero, isGMUser: () => false, userName: () => "",
    writeJournal: (p, j) => p.update({ "flags.trg-prime.transferJournal": j }), announce: async () => {}, ledger: new PT.RequestLedger(), queue: new PT.PartyQueue() };
  const req = (fields) => PT.buildTransferRequest({ partyUuid: "Actor.P", requestId: PT.newRequestId(fields.userId), ...fields });
  const take = await PT.performTransfer(req({ kind: "withdraw", itemUuid: "Actor.P.Item.i1", quantity: 2, destUuid: "Actor.H", userId: "p1" }), deps);
  equal("W1 Take 2 of 5: 2 to the character, 3 left, 5 in all", [take.ok, created[0]?.system.quantity, partyItems.get("i1").system.quantity], [true, 2, 3]);
  const refused = await PT.performTransfer(req({ kind: "withdraw", itemUuid: "Actor.P.Item.i1", quantity: 1, destUuid: "Actor.H", userId: "p2" }), deps);
  equal("W2 a player taking for a character they do not own is refused, nothing moves", [refused.ok, partyItems.get("i1").system.quantity, created.length], [false, 3, 1]);
  const coin = await PT.performTransfer(req({ kind: "coinTake", coin: { gp: 4 }, destUuid: "Actor.H", userId: "p1" }), deps);
  equal("W3 Take Coin: 4 gp moves, 10 gp in all", [coin.ok, hero.system.currency.gp, party.system.currency.gp], [true, 4, 6]);
  const twoGMs = [PS.shouldHandleAsGM({ id: "g1", isGM: true }, { id: "g1" }), PS.shouldHandleAsGM({ id: "g2", isGM: true }, { id: "g1" })];
  equal("W4 with two GMs connected exactly one carries a take out", twoGMs, [true, false]);

  // XP and Begin Session run through the shared resolver.
  world.clear();
  const a = put(fakeActor({ id: "XA", xp: 100 }));
  const n = put(fakeActor({ id: "XN", type: "npc" }));
  const c = put(fakeActor({ id: "XC", type: "companion", xp: 0 }));
  const r = put(fakeActor({ id: "XR", conviction: [0, 2], feats: ["Hero's Resolve"] }));
  const xparty = { uuid: "Actor.XP", name: "XP Party", system: { members: ["Actor.XA", "Actor.XN", "Actor.XC", "Actor.XGONE", "Actor.XR", "Actor.XA"] } };
  chat.length = 0;
  const award = await RW.awardPartyXP(xparty, 300, "a test");
  equal("W5 300 XP across the three eligible members (a companion, a deleted actor and a duplicate do not count)", award, { each: 100, remainder: 0 });
  equal("W6 ...each character's XP is written once; the NPC's and companion's are not", [a.system.identity.xp.value, r.system.identity.xp.value, n.updates.length, c.updates.length, a.updates.length], [200, 100, 0, 0, 1]);
  ok("W7 ...and the card is posted", chat.length === 1 && /Experience Awarded/.test(chat[0].content));
  const session = await RW.beginSession(xparty);
  ok("W8 Begin Session: Hero's Resolve's member gains one point", session >= 1 && r.system.resources.conviction.value === 1);
  globalThis.game.user = { id: "p1", isGM: false };
  const before = a.system.identity.xp.value;
  const playerAward = await RW.awardPartyXP(xparty, 300, "a test");
  equal("W9 a player's award is refused in the workflow itself; nothing written", [playerAward, a.system.identity.xp.value], [null, before]);
  equal("W10 ...and so is a player's Begin Session", await RW.beginSession(xparty), null);
  globalThis.game.user = { id: "gm", isGM: true };
}

/* ------------------------------------------------------------ F. found in the live test (3.708.1) */
{
  // F1: the roster's Remove button. Inside {{#each members as |m|}} a bare
  // isGM is read from the member, so the GM never had the button.
  const rosterEach = HBS.slice(HBS.indexOf("{{#each members as |m|}}"), HBS.indexOf("{{/each}}", HBS.indexOf('data-action="removeMember"')));
  ok("F1 the roster's Remove button reads the sheet's isGM (../isGM), not the member's",
    /\{\{#if \.\.\/isGM\}\}\s*<button type="button" class="party-remove" data-action="removeMember"/.test(rosterEach)
    && !/\{\{#if isGM\}\}\s*<button type="button" class="party-remove"/.test(rosterEach));

  // F2: v14's synthetic actor has no baseActor; the token has it.
  const keys = M.watchKeysFor([{ uuid: "Scene.s.Token.t.Actor.o", actor: { uuid: "Scene.s.Token.t.Actor.o", isToken: true, token: { baseActor: { uuid: "Actor.o" } } } }]);
  ok("F2 an unlinked token's base actor is watched through the token (v14)", keys.has("Actor.o"), [...keys].join(", "));

  // F3: a stack merges with an existing PREPARED item whose derived fields differ.
  const existing = {
    id: "e1", name: "Rope", type: "gear", flags: {},
    system: { quantity: 2, weight: 1, totalWeight: 2, description: "hemp" },
    _source: { name: "Rope", type: "gear", flags: {}, system: { quantity: 2, weight: 1, description: "hemp" } }
  };
  const payload = { name: "Rope", type: "gear", flags: {}, system: { quantity: 1, weight: 1, description: "hemp" } };
  ok("F3 a taken stack joins the character's prepared stack (derived totalWeight ignored)", P.findMergeTarget([existing], payload) === existing);
  const other = { ...payload, system: { ...payload.system, description: "silk" } };
  ok("F3b ...and a genuinely different item still does not", P.findMergeTarget([existing], other) === null);

  // F4: "an affliction", not "a affliction".
  const aff = P.planLootDrop({ item: { type: "affliction", name: "Plague", system: { quantity: 1 } }, isGM: true });
  ok("F4 the refusal reads 'an affliction'", /is an affliction\./.test(aff.reason ?? ""), aff.reason);
}

/* ------------------------------------------------------------ Z. version */
{
  const sys = JSON.parse(read("system.json"));
  equal("Z1 the version is 3.713.0 (3.708.1 or later), the download names it, and package.json agrees",
    [sys.version, sys.download.includes("/v3.719.1/"), JSON.parse(read("package.json")).version], ["3.719.1", true, "3.719.1"]);
  ok("Z2 the manifest URL is unchanged", sys.manifest === "https://raw.githubusercontent.com/snowtroll75-debug/trpg-prime/main/system.json");
}

if (failures.length) {
  console.log(`verify-party-sheet-stage1: ${failures.length} of ${checks} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-party-sheet-stage1: ${checks} checks — all green.`);
