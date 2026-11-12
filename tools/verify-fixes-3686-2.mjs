#!/usr/bin/env node
/**
 * verify-fixes-3686-2 — TRG Prime 3.686.2: Graham's 3.686.1 kept, and the
 * defects its review found fixed. The election itself is
 * verify-gm-connection's; an ask with no live holder is
 * verify-fixes-3685-3b's X; this file holds the rest.
 *
 *   A  Every GM-side writer that compared `game.users.activeGM` with this
 *      user goes through the election too (finding 7) — one connection of
 *      the acting GM, so two tabs of one GM apply a relayed hit once.
 *      Driven: the target and party relays' pure handlers; read: the rest.
 *   C  Graham's condition-writer queue: one actor's condition writes run one
 *      at a time, keyed by the full UUID; a failure does not jam the queue.
 *   R  Refocus on a shared uses pool (Graham's 3.686.1), and a pending
 *      restore written on a pool MEMBER before it (finding 10): moved to the
 *      owner once, cleared from the member, applied once.
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
const later = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

globalThis.foundry = { applications: { api: { DialogV2: class {} } }, utils: {} };
globalThis.ChatMessage = { create: async () => ({}), getSpeaker: () => ({}) };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

/* ------------------------------------------------------------ A. the relays, driven */
const TR = await imp("combat/target-relay.mjs");
const PS = await imp("party-socket.mjs");
const gm = { id: "gm", isGM: true };
equal("A1 the target relay: the active GM's elected connection handles it; another tab of that GM does not",
  [TR.shouldHandleAsGM(gm, gm), TR.shouldHandleAsGM(gm, gm, true), TR.shouldHandleAsGM(gm, gm, false), TR.shouldHandleAsGM({ id: "p", isGM: false }, gm, true)],
  [true, true, false, false]);
equal("A2 the party relay: the same", [PS.shouldHandleAsGM(gm, gm), PS.shouldHandleAsGM(gm, gm, false)], [true, false]);
{
  // FIXED 3.686.2 (second review, LOW 8): the counters are real — every
  // acknowledgement and every answer the handler gives is counted, and the
  // same request on the writer tab is the control.
  let answered = 0, acknowledged = 0;
  const deps = { acknowledge: () => { acknowledged += 1; }, reply: () => { answered += 1; } };
  const data = { action: "target.damage", requestId: "r1", userId: "p" };
  const out = await TR.handleRelayMessage(data, { user: gm, activeGM: gm, deps, connectionWriter: false });
  equal("A3 a damage request reaching the GM's non-writer tab is neither acknowledged nor carried out", [out.handled, acknowledged, answered], [false, 0, 0]);
  const control = await TR.handleRelayMessage(data, { user: gm, activeGM: gm, deps, connectionWriter: true });
  equal("A3b ...while the writer tab acknowledges it and answers", [control.handled, acknowledged, answered], [true, 1, 1]);
  const party = await PS.handlePartyMessage({ action: Object.values(PS.PARTY_ACTIONS ?? { x: "party.takeItem" })[0] }, { user: gm, activeGM: gm, deps: {}, connectionWriter: false });
  equal("A4 a party Take reaching the GM's non-writer tab is not carried out", party.handled, false);
}

/* ------------------------------------------------------------ A. the rest, read */
{
  const files = {
    boot: strip(read("scripts", "trg-prime.mjs")),
    trw: strip(read("module", "combat", "target-relay-workflow.mjs")),
    party: strip(read("module", "party-socket.mjs")),
    mig: strip(read("module", "migration.mjs")),
    linked: strip(read("module", "combat", "linked-conditions-workflow.mjs")),
    material: strip(read("module", "magic", "material-shift-workflow.mjs")),
    stasis: strip(read("module", "magic", "stasis-workflow.mjs")),
    endSave: strip(read("module", "magic", "end-save-workflow.mjs")),
    aligned: strip(read("module", "aligned-control-workflow.mjs")),
    runes: strip(read("module", "rune-timers-workflow.mjs")),
    spellRune: strip(read("module", "magic", "spell-rune-workflow.mjs")),
    lightShift: strip(read("module", "magic", "light-shift-workflow.mjs"))
  };
  ok("A5 both relays pass the election's answer to their handler",
    /activeGM: game\.users\.activeGM \?\? null,\s*connectionWriter: isGMConnectionWriter\(\),/.test(files.trw)
    && /activeGM: game\.users\.activeGM \?\? null,\s*connectionWriter: isGMConnectionWriter\(\),/.test(files.party));
  ok("A6 the migration offer: one connection of the active GM", /if \(activeGM && activeGM\.id !== game\.user\.id\) return;\s*if \(!isActingGM\(\)\) return;/.test(files.mig));
  ok("A7 the five deleteActiveEffect writers and Aligned Control ask isActingClientFor of their creature",
    /if \(!isActingClientFor\(actor\)\) return;/.test(files.linked)
    && /if \(!isActingClientFor\(effect\.parent\)\) return;/.test(files.material)
    && /if \(!isActingClientFor\(effect\.parent\)\) return;/.test(files.stasis)
    && /if \(!isActingClientFor\(actor\)\) return;/.test(files.endSave)
    && /if \(!isActingClientFor\(target\)\) return;/.test(files.aligned)
    && /if \(!isActingClientFor\(effect\.parent\)\) return;/.test(files.runes));
  ok("A8 a spell's lent rune comes back on the GM's elected connection", /const mine = activeGM \? shouldHandleAsGM\(game\.user, activeGM, isGMConnectionWriter\(\)\) : item\.isOwner;/.test(files.spellRune));
  ok("A9 rage switched off ends on the actor's acting client; the world clock and the one-time purge on the acting GM",
    /if \(!Object\.hasOwn\(changed \?\? \{\}, "disabled"\) \|\| !effect\?\.disabled\) return;\s*if \(!isActingClientFor\(effect\.parent\)\) return;/.test(files.boot)
    && /Hooks\.on\("updateWorldTime", async \(worldTime\) => \{\s*if \(!isActingGM\(\)\) return;/.test(files.boot)
    && /if \(isActingGM\(\)\) \{\s*await purgeOrphanedItemsOfType\("action"\);/.test(files.boot));
  ok("A10 a light-shift circle follows its creature on the acting GM's connection", /if \(!isActingGM\(\)\) return;\s*const scene = tokenDoc\?\.parent \?\? null;/.test(files.lightShift));
  // No GM-side WRITER compares the active GM's id by hand any more. The ids
  // still read for ADDRESSING (whom to ask) are not guards and are left.
  const all = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".mjs")) all.push(p); } };
  walk(path.join(SYSTEM_ROOT, "module")); walk(path.join(SYSTEM_ROOT, "scripts"));
  const handRolled = all.filter((p) => /activeGM(\?)?\.id !== game\.user(\?)?\.id\) return|activeGM\.id === game\.user\.id\)\)/.test(strip(fs.readFileSync(p, "utf8"))))
    .map((p) => path.relative(SYSTEM_ROOT, p)).filter((p) => p !== "module/migration.mjs" && p !== "module/acting-gm.mjs");
  equal("A11 no hand-rolled active-GM guard is left on a writer (migration keeps its own beside the election; acting-gm.mjs is the answer itself)", handRolled, []);
}

/* ------------------------------------------------------------ C. the condition writer */
{
  const { withActorConditionWriter } = await imp("condition-writer.mjs");
  const log = [];
  const work = (tag, ms) => async () => { log.push(`${tag}+`); await later(ms); log.push(`${tag}-`); return tag; };
  const actor = { id: "a1", uuid: "Scene.s.Token.t1.Actor.a1" };
  const twin = { id: "a1", uuid: "Scene.s.Token.t2.Actor.a1" };
  const r = await Promise.all([withActorConditionWriter(actor, work("x", 20)), withActorConditionWriter(actor, work("y", 1)), withActorConditionWriter(twin, work("z", 1))]);
  equal("C1 one actor's writes run one after another; a synthetic twin (same id, another token) is not held up by them",
    [r, log.indexOf("y+") > log.indexOf("x-"), log.indexOf("z-") < log.indexOf("x-")], [["x", "y", "z"], true, true]);
  log.length = 0;
  const failed = withActorConditionWriter(actor, async () => { throw new Error("boom"); });
  const next = withActorConditionWriter(actor, work("after", 1));
  let threw = false; try { await failed; } catch { threw = true; }
  equal("C2 a failed write is reported to its caller and does not jam the next", [threw, await next], [true, "after"]);
  const src = strip(read("module", "condition-writer.mjs"));
  ok("C3 keyed by the full UUID first", /const key = actor\?\.uuid \?\? actor\?\.id;/.test(src));
  ok("C4 both condition workflows write through it",
    /return withActorConditionWriter\(actor, \(\) => settleAbilityCollapseNow\(actor\)\);/.test(read("module", "combat", "ability-collapse-workflow.mjs"))
    && /return withActorConditionWriter\(actor, \(\) => syncEncumbranceNow\(actor, \{ quiet \}\)\);/.test(read("module", "encumbrance-workflow.mjs")));
}

/* ------------------------------------------------------------ R. Refocus and the shared pool */
globalThis.game = { time: { worldTime: 100 }, user: { id: "g", isGM: true }, users: [] };
const RW = await imp("combat/refocus-workflow.mjs");
const { mergeRefocusStates } = RW;
function item(name, system, flags = {}) {
  const it = {
    id: name.replace(/\W/g, "").padEnd(16, "0").slice(0, 16), name, type: "spell", system, flags: { "trg-prime": structuredClone(flags) }, log: [],
    getFlag: (_s, k) => it.flags["trg-prime"][k],
    setFlag: async (_s, k, v) => { it.log.push(`set ${k}`); it.flags["trg-prime"][k] = structuredClone(v); },
    unsetFlag: async (_s, k) => { it.log.push(`unset ${k}`); delete it.flags["trg-prime"][k]; },
    update: async (u) => { it.log.push(`update ${JSON.stringify(u)}`); if ("system.usesValue" in u) it.system.usesValue = u["system.usesValue"]; }
  };
  return it;
}
function druid({ ownerState = null, memberState = null, spent = 0, memberFirst = false } = {}) {
  const owner = item("Shape Of The Animal", { usesPerDay: "2", usesValue: spent, innate: true }, ownerState ? { refocus: ownerState } : {});
  const member = item("Shape Of The Plant", { usesPerDay: "", innate: true }, memberState ? { refocus: memberState } : {});
  const actor = { id: "druid00000000001", items: memberFirst ? [member, owner] : [owner, member], effects: [], system: { attributes: {}, identity: { level: 5 } } };
  owner.actor = actor; member.actor = actor;
  return { actor, owner, member };
}
const due = { restoreAt: 50, nextTurn: false, blockedUntil: null, dailyPrep: false };
const notYet = { restoreAt: 500, nextTurn: false, blockedUntil: null, dailyPrep: false };
{
  const d = druid({ memberState: due });
  const first = await RW.sweepRefocusRestores(d.actor);
  equal("R1 THE GAP, closed: a restore written on a member before 3.686.1 is applied — once, to the pool's owner",
    [first.map((x) => x.name), d.owner.system.usesValue, d.member.flags["trg-prime"].refocus ?? null, d.owner.flags["trg-prime"].refocus ?? null],
    [["Shape Of The Animal"], 1, null, null]);
  const second = await RW.sweepRefocusRestores(d.actor);
  equal("R2 and a second sweep restores nothing more", [second.length, d.owner.system.usesValue], [0, 1]);
}
{
  const d = druid({ ownerState: notYet, memberState: due });
  const out = await RW.sweepRefocusRestores(d.actor);
  // RE-PINNED 3.686.2 (the second review, LOW 6): a pool has one state, so the
  // owner's and the member's are merged — the earlier restore is kept.
  equal("R3 an owner's own state and a member's legacy one are merged: the earlier restore applies, once, and both flags go",
    [out.length, d.owner.system.usesValue, d.owner.flags["trg-prime"].refocus ?? null, d.member.flags["trg-prime"].refocus ?? null], [1, 1, null, null]);
}
{
  // The member is listed FIRST, so a sweep that visited it would restore before the owner cleared its state.
  const d = druid({ ownerState: due, memberFirst: true });
  ok("R4 a member reads the owner's state (Graham's 3.686.1)", RW.refocusStateOf(d.member)?.restoreAt === 50);
  const out = await RW.sweepRefocusRestores(d.actor);
  equal("R5 the owner's restore is applied once, not once per form alias", [out.length, d.owner.system.usesValue], [1, 1]);
}

{
  // Two members AND the owner carry flags: nothing pending is dropped.
  const d = druid({ ownerState: { restoreAt: 900, nextTurn: false, blockedUntil: 300, dailyPrep: false } });
  const second = item("Shape Of The Humanoid", { usesPerDay: "", innate: true }, { refocus: { restoreAt: 700, nextTurn: false, blockedUntil: 2000, dailyPrep: false } });
  d.member.flags["trg-prime"].refocus = { restoreAt: 400, nextTurn: false, blockedUntil: null, dailyPrep: true };
  second.actor = d.actor; d.actor.items.push(second);
  const out = await RW.sweepRefocusRestores(d.actor);
  equal("R6 two members' legacy flags and the owner's merge into one: the earliest restore, the longest block, daily prep kept; members cleared",
    [out.length, d.owner.flags["trg-prime"].refocus, d.member.flags["trg-prime"].refocus ?? null, second.flags["trg-prime"].refocus ?? null],
    [0, { restoreAt: 400, nextTurn: false, blockedUntil: 2000, dailyPrep: true }, null, null]);
  equal("R7 the merge rule, pure: nothing in, nothing out; next turn carries", [mergeRefocusStates([]), mergeRefocusStates([null, { restoreAt: null, nextTurn: true, blockedUntil: null, dailyPrep: false }])?.nextTurn], [null, true]);
}

/* ------------------------------------------------------------ S. waits that make a startup sweep happen (3.686.2) */
// NEW 3.686.2 (second review, LOW 8). A GM page's election has not settled
// for its first ~400 ms; a sweep that asked `isActingGM` then would be
// skipped for good. Each is driven on a fresh, unsettled GM connection:
// the sweep must still run once the election settles.
const hooksOf = () => { const h = {}; globalThis.Hooks = { on: (n, f) => { (h[n] ??= []).push(f); }, once: (n, f) => { (h[n] ??= []).push(f); }, callAll() {} }; return h; };
const fakeSocket = (id) => { const sk = { id, sent: [], handlers: [], emit: (_c, d) => sk.sent.push(d), on: (_c, f) => sk.handlers.push(f), off() {} }; return sk; };
const unsettledGM = (id) => { globalThis.game = { user: { id: "gmS", isGM: true, active: true }, users: Object.assign([{ id: "gmS", isGM: true, active: true }], { activeGM: { id: "gmS" }, get: () => null }), socket: fakeSocket(id), actors: [] }; return globalThis.game; };
const quietly = async (fn) => { const e = console.error, w = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };
{
  const h = hooksOf();
  const { registerAllyAuraEffectHooks } = await imp("ally-aura-effects-workflow.mjs");
  registerAllyAuraEffectHooks();
  unsettledGM("ally-sock");
  let read = 0;
  globalThis.canvas = { ready: true, get tokens() { read += 1; return { placeables: [] }; }, scene: null };
  await quietly(async () => { for (const f of h.canvasReady ?? []) f(); await later(900); });
  ok("S1 ally auras: a canvasReady on an unsettled GM page still syncs, once the election settles", read > 0, `tokens read ${read} times`);
}
{
  const h = hooksOf();
  const { registerWardZones } = await imp("combat/ward-zone-workflow.mjs");
  registerWardZones();
  unsettledGM("ward-sock");
  let read = 0;
  const scene = { id: "sceneWard0000001", get regions() { read += 1; return []; }, tokens: [] };
  globalThis.canvas = { ready: true, scene };
  await quietly(async () => { for (const f of h.canvasReady ?? []) f(); await later(900); });
  ok("S2 ward zones: a canvasReady on an unsettled GM page still syncs, once the election settles", read > 0, `regions read ${read} times`);
}
{
  const h = hooksOf();
  const PCW = await imp("magic/pending-cast-workflow.mjs");
  PCW.registerPendingCastHooks();
  const g = unsettledGM("pc-sock");
  const flags = { pendingCast: { spellName: "Fireball", dc: 18, handle: {}, increments: 1, unit: "minute", size: 1, bonus: 1, apOwed: 0, apPaid: 0, userId: "goneUser00000000", castId: "startupcast00001" } };
  let unsets = 0;
  const actor = { id: "startupWiz000001", uuid: "Actor.startupWiz", name: "Wiz", getFlag: (_s, k) => flags[k], unsetFlag: async (_s, k) => { unsets += 1; delete flags[k]; }, testUserPermission: () => false };
  g.actors = [actor];
  await quietly(async () => { await Promise.all((h.ready ?? []).map((f) => f())); });
  ok("S3 the pending-cast startup sweep on an unsettled GM page waits for the election and lapses an orphaned casting, once", unsets === 1, `unsets ${unsets}`);
}
{
  // MEDIUM 1: GM authorisation is a QUESTION — any tab of the active GM answers.
  const GA = await imp("combat/gm-authorisation.mjs");
  const g = unsettledGM("auth-sock");
  globalThis.foundry.applications.api.DialogV2 = { confirm: async () => true };
  GA.registerGMAuthorisation();
  await imp("gm-connection.mjs").then((m) => m.gmConnectionReady());
  // Another tab of this GM account holds the writer role.
  for (const f of g.socket.handlers) f({ action: "trgPrime.gmConnection", userId: "gmS", id: "other-tab", owner: "other-tab", term: 9, since: 0, kind: "pulse" });
  const { isActingGM } = await imp("acting-gm.mjs");
  const notWriter = isActingGM() === false;
  g.socket.sent.length = 0;
  for (const f of g.socket.handlers) await f({ action: "gm.authorise", requestId: "auth00000000001", userId: "p1", userName: "Player", who: "Borin", what: "a Strike" });
  await later(20);
  const answers = g.socket.sent.filter((d) => d?.requestId === "auth00000000001");
  ok("S4 THE REVIEW'S MEDIUM 1: a GM tab that is NOT the elected writer still answers an off-turn strike's question",
    notWriter && answers.length === 1 && answers[0].allowed === true, JSON.stringify({ notWriter, answers }));
}

{
  // (a) of the third review: another tab's answer closes this tab's dialog, and this tab then says nothing.
  const GA = await imp("combat/gm-authorisation.mjs");
  const g = unsettledGM("auth-close-sock");
  let closed = 0;
  globalThis.foundry.applications.api.DialogV2 = { confirm: (opts) => new Promise((resolve) => {
    const dialog = { close: () => { closed += 1; resolve(null); } };
    opts.render?.(null, dialog);
  }) };
  GA.registerGMAuthorisation();
  const handlers = [...g.socket.handlers];
  g.socket.sent.length = 0;
  for (const f of handlers) f({ action: "gm.authorise", requestId: "auth00000000002", userId: "p1", userName: "Player", who: "Borin", what: "a Strike" });
  await later(10);
  for (const f of handlers) f({ action: "gm.authorised", requestId: "auth00000000002", userId: "p1", allowed: true });
  await later(20);
  const mine = g.socket.sent.filter((d) => d?.requestId === "auth00000000002");
  ok("S5 another GM tab's answer closes this tab's open dialog, and this tab sends no second answer", closed === 1 && mine.length === 0, JSON.stringify({ closed, mine }));
}
{
  // (b) of the third review: a merged state with a next-turn AND a minute restore comes due by whichever applies first.
  const { refocusRestoreDue } = await imp("combat/refocus.mjs");
  equal("R8 a merged state's minute restore comes due out of combat; its next-turn half still comes due on the turn",
    [refocusRestoreDue({ nextTurn: true, restoreAt: 50 }, { worldTime: 100 }), refocusRestoreDue({ nextTurn: true, restoreAt: 500 }, { worldTime: 100, ownTurnStarted: true }),
     refocusRestoreDue({ nextTurn: true, restoreAt: null }, { worldTime: 100 }), refocusRestoreDue({ nextTurn: false, restoreAt: 500 }, { worldTime: 100, ownTurnStarted: true })],
    [true, true, false, false]);
}

/* ------------------------------------------------------------ G. Graham's 3.686.1, held */
{
  const feats = read("module", "feats-workflow.mjs");
  ok("G1 Wild Shape's configuration keeps spent uses: only a new or unconfigured pool starts full",
    /const initialiseUses = !spell \|\| !spell\.system\.innate;/.test(feats)
    && /"system\.usesValue": initialiseUses \|\| !Number\.isFinite\(spell\.system\.usesValue\)\s*\? uses : Math\.max\(0, Math\.min\(uses, spell\.system\.usesValue\)\)/.test(feats));
  const tether = strip(read("module", "magic", "distance-trigger-workflow.mjs"));
  ok("G2 the distance tether measures both ends from the committed (toObject) coordinates, not the animating ones",
    /const source = document\.toObject\(\);/.test(tether) && /const moved = recordedToken\(tokenDocument\);/.test(tether)
    && /const anchor = anchorDoc \? recordedToken\(anchorDoc\) : null;/.test(tether));
  ok("G3 Submerged and the aura trait effect use waterfall.svg",
    /img: "icons\/svg\/waterfall\.svg"/.test(read("module", "combat", "underwater-workflow.mjs"))
    && /img: "icons\/svg\/waterfall\.svg"/.test(read("module", "aura-trait-effect-workflow.mjs")));
}

/* ------------------------------------------------------------ Z. the version */
const manifest = JSON.parse(read("system.json"));
equal("Z1 the version is 3.686.2, and the download names it", [manifest.version, manifest.download],
  ["3.686.2", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.686.2/trg-prime.zip"]);
equal("Z2 package.json agrees", JSON.parse(read("package.json")).version, "3.686.2");

const EXPECTED = 35;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-fixes-3686-2: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
console.log(`verify-fixes-3686-2: ${checks} checks — all green.`);
process.exit(0);
