#!/usr/bin/env node
/**
 * verify-gm-connection — TRG Prime 3.686.2: one automation writer per GM
 * account (module/gm-connection.mjs; Graham's 3.686.1 election, reworked
 * after its review).
 *
 *   L  A lone tab is the writer once its hello has had the settle window to
 *      be answered (3.686.2), and stays the writer while its timer is
 *      throttled to once a minute (review finding 1: 0 of 40).
 *   T  Two tabs agree on one writer; a late joiner follows the established
 *      writer instead of taking over.
 *   R  A throttled tab never makes two writers (finding 5); a FROZEN owner
 *      that is replaced yields on resume, by term; a follower back from a
 *      gap does not elect itself until it has heard traffic.
 *   H  A closed tab hands over: at once on `bye`, after the probe when the
 *      tab vanished without one.
 *   D  The live wrapper: a socket reporting `connected === false` is not
 *      the writer; a socket with no `connected` property (a harness's) is.
 *   P  A player is never the writer; another account's messages are ignored.
 *   S  Startup: `gmConnectionReady` resolves and a lone GM is the writer
 *      during it; the module registers no hook at import (finding 3).
 *   J  With real message delay (3.686.2's review): a late joiner whose id
 *      sorts first never makes two writers at 50 or 100 ms each way, and
 *      never wins at 250; equal terms go to the older connection; a probed
 *      owner is decided on the follower's own schedule; a reconnect keeps
 *      the highest term it saw; a live claim is adopted when the owner goes.
 *   K  Reconnects (3.686.2's third review): a lone settled page keeps the
 *      role at the first hook after a reconnect; the rebuild happens on the
 *      socket's `connect`; two tabs reconnecting together never both write;
 *      a superseded socket is retired; revalidation ends on its own timer.
 *   W  `isActingGM` asks the election: a stronger claim from another tab of
 *      the same account makes this one stand down.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

/* S2 first, before anything defines Hooks: the import must not touch it. */
const hookCalls = [];
globalThis.Hooks = new Proxy({}, { get: (_t, key) => { hookCalls.push(String(key)); throw new Error(`Hooks.${String(key)} at import`); } });
let GC, importError = null;
try { GC = await import(new URL("../module/gm-connection.mjs", import.meta.url)); } catch (error) { importError = error; }
ok("S2 importing the election touches no Hooks (a harness's proxy refuses it)", !importError && hookCalls.length === 0, importError?.message ?? hookCalls.join(","));
delete globalThis.Hooks;
const { createConnectionElection, LEASE_MS, PROBE_MS, SETTLE_MS, CONNECTION_ACTION, gmConnectionState, gmConnectionSettled, waitForGMConnection, gmConnectionReady } = GC;

/** A table of tabs on one clock. A frozen tab neither ticks nor hears. */
function table() {
  const w = { t: 0, nodes: {}, frozen: new Set() };
  w.mk = (id, userId = "U", knownPeers = []) => {
    w.nodes[id] = createConnectionElection({ id, userId, now: () => w.t, knownPeers,
      send: (m) => { for (const [k, n] of Object.entries(w.nodes)) if (k !== id && !w.frozen.has(k)) n.receive(structuredClone(m)); } });
    return w.nodes[id];
  };
  w.close = (id, { bye = true } = {}) => { const n = w.nodes[id]; if (bye) n.leave(); delete w.nodes[id]; };
  /** Run to `end`, ticking each tab per `ticks(id, t)`, sampling every `every` ms. */
  w.run = (end, { ticks = () => true, every = 1500, sample = null } = {}) => {
    for (; w.t <= end; w.t += 100) {
      if (w.t % 1000 === 0) for (const id of Object.keys(w.nodes)) if (!w.frozen.has(id) && ticks(id, w.t)) w.nodes[id].tick();
      if (sample && w.t % every === 0) sample(w.t);
    }
    w.t = end;
  };
  w.leaders = () => Object.entries(w.nodes).filter(([id, n]) => !w.frozen.has(id) && n.isLeader()).map(([id]) => id).sort();
  return w;
}
const throttled = (hiddenFrom, who) => (id, t) => id !== who || t < hiddenFrom || (t - hiddenFrom) % 60000 === 0;

/* ------------------------------------------------------------ L. a lone tab */
{
  const w = table(); const A = w.mk("a"); A.hello();
  // RE-PINNED 3.686.2 (the review's join window): a brand-new tab is not
  // the writer until its hello has had the settle window to be answered.
  ok("L1 a lone tab is not the writer while its hello may still be answered", A.isLeader() === false);
  w.t = SETTLE_MS - 1;
  ok("L2 ...through the settle window, and is the writer from its end", A.isLeader() === false && ((w.t = SETTLE_MS), A.isLeader()) === true);
  let yes = 0, n = 0;
  w.run(1200000, { ticks: throttled(10000, "a"), every: 30000, sample: (t) => { if (t > 20000) { n++; if (A.isLeader()) yes++; } } });
  equal("L3 hidden (timer once a minute), hooks every 30 s for 20 minutes: the writer on every one", [yes, n], [n, n]);
  let yes2 = 0, n2 = 0;
  const w2 = table(); const B = w2.mk("b");
  w2.run(600000, { ticks: () => false, every: 7000, sample: (t) => { if (t < SETTLE_MS) return; n2++; if (B.isLeader()) yes2++; } });
  equal("L4 a lone tab whose timer never runs at all is still the writer", [yes2, n2], [n2, n2]);
}

/* ------------------------------------------------------------ T. two tabs */
{
  const w = table(); const A = w.mk("b"); const B = w.mk("a"); A.hello(); B.hello();
  let bad = 0, n = 0;
  w.run(60000, { every: 500, sample: (t) => { if (t >= SETTLE_MS) { n++; if (w.leaders().length !== 1) bad++; } } });
  equal("T1 two tabs started together: exactly one writer at every sample", bad, 0);
  equal("T2 ...the same one in each tab's view", [A.state().owner, B.state().owner], [w.leaders()[0], w.leaders()[0]]);

  // A late joiner whose id sorts first must not take over.
  const est = w.leaders()[0];
  const C = w.mk("0-late"); C.hello();
  w.run(w.t + 10000, { every: 500, sample: () => {} });
  equal("T3 a late joiner follows the established writer", w.leaders(), [est]);
  ok("T4 ...and knows who it is", C.state().owner === est, JSON.stringify(C.state()));
}

/* ------------------------------------------------------------ R. resumes */
{
  // sim2: A is the writer and hidden (timer once a minute); B is in front.
  for (const every of [300, 1500, 7000]) {
    const w = table(); const A = w.mk("a"); const B = w.mk("b"); A.hello(); B.hello();
    const c = { both: 0, none: 0 };
    w.run(400000, { ticks: throttled(10000, "a"), every, sample: (t) => { if (t > 17000) { const l = w.leaders().length; if (l === 2) c.both++; if (l === 0) c.none++; } } });
    equal(`R1 a throttled writer and a foreground tab, hooks every ${every} ms: never two writers, never none`, c, { both: 0, none: 0 });
  }
  {
    // The throttled writer keeps the role: it answers B's probes from its socket handler.
    const w = table(); const A = w.mk("a"); const B = w.mk("b"); A.hello(); B.hello();
    w.run(400000, { ticks: throttled(10000, "a") });
    equal("R1c a throttled writer that still answers probes keeps the role", w.leaders(), ["a"]);
  }
  {
    // BOTH tabs hidden: each timer runs once a minute, at different moments.
    const w = table(); const A = w.mk("a"); const B = w.mk("b"); A.hello(); B.hello();
    const both = (id, t) => t < 10000 || (t - (id === "a" ? 10000 : 40000)) % 60000 === 0;
    const c = { both: 0, none: 0 };
    w.run(600000, { ticks: both, every: 7000, sample: (t) => { if (t > 12000) { const l = w.leaders().length; if (l === 2) c.both++; if (l === 0) c.none++; } } });
    equal("R1b both tabs hidden, hooks every 7 s: always exactly one writer (a gap re-hellos, never demotes the owner)", c, { both: 0, none: 0 });
  }
  // The throttled tab is the follower and its id sorts first (3.686.1's tie-break).
  {
    const w = table(); const B = w.mk("b"); B.hello(); w.run(5000);
    const A = w.mk("a"); A.hello();
    const c = { both: 0, none: 0 };
    w.run(400000, { ticks: throttled(10000, "a"), every: 1500, sample: (t) => { if (t > 6000) { const l = w.leaders().length; if (l === 2) c.both++; if (l === 0) c.none++; } } });
    equal("R2 a throttled follower with the lower id never takes the role (established owner preferred)", c, { both: 0, none: 0 });
    equal("R3 ...the established writer keeps it", w.leaders(), ["b"]);
  }
  // A FROZEN owner: hears nothing, answers nothing. B must take over; A must yield on resume.
  {
    const w = table(); const A = w.mk("a"); const B = w.mk("b"); A.hello(); B.hello();
    w.run(10000);
    equal("R4 before the freeze, one writer", w.leaders(), ["a"]);
    w.frozen.add("a");
    w.run(10000 + LEASE_MS + PROBE_MS + 3000);
    equal("R5 an owner that answers no probe is replaced", w.leaders(), ["b"]);
    w.run(130000);
    w.frozen.delete("a");
    const firstLook = [A.isLeader(), B.isLeader()];
    equal("R6 the frozen owner, resumed, stands down at once: the newer term wins", firstLook, [false, true]);
    const c = { both: 0, none: 0 };
    w.run(200000, { every: 700, sample: () => { const l = w.leaders().length; if (l === 2) c.both++; if (l === 0) c.none++; } });
    equal("R7 ...and afterwards never two writers, never none", c, { both: 0, none: 0 });
  }
  // A frozen FOLLOWER back from a gap must hear traffic before it elects itself.
  {
    const w = table(); const A = w.mk("a"); const B = w.mk("b"); A.hello(); B.hello();
    w.run(10000);
    w.frozen.add("b"); w.run(100000); w.frozen.delete("b");
    // B's peer table is stale; A is alive. B must not claim while it relearns.
    const seen = [];
    for (let i = 0; i < 30; i++) { w.t += 100; seen.push(w.leaders().join("+")); if (i % 10 === 0) for (const n of Object.values(w.nodes)) n.tick(); }
    ok("R8 a follower back from a gap does not elect itself", seen.every((s) => s === "a"), seen.join(" "));
  }
  // A reconnecting page (a new socket id) is not lone: it carries its peers.
  {
    const w = table(); const A = w.mk("a"); A.hello(); w.run(5000);
    const B2 = w.mk("b2", "U", ["a", "b-old"]);
    const beforeHearing = B2.isLeader();
    B2.hello();
    ok("R9 a reconnected connection that knew peers does not claim before it has heard them", !beforeHearing && !B2.isLeader() && A.isLeader());
    w.run(w.t + 5000);
    equal("R10 ...and then follows the writer", w.leaders(), ["a"]);
  }
}

/* ------------------------------------------------------------ J. with real message delay (3.686.2) */
/**
 * A table whose messages take `lat` ms each way, delivered in order, and
 * whose `schedule` runs on the same clock (the review's lat.mjs model).
 */
function ltable(lat) {
  const w = { t: 0, nodes: {}, q: [], jobs: [], next: {} };
  w.mk = (id, { knownPeers = [], knownTerm = 0, bornAt = null, tickEvery = 1000, schedule = true } = {}) => {
    w.nodes[id] = createConnectionElection({ id, userId: "U", now: () => w.t, knownPeers, knownTerm, bornAt: bornAt ?? w.t,
      schedule: schedule ? (fn, ms) => w.jobs.push({ at: w.t + ms, fn }) : null,
      send: (m) => { for (const k of Object.keys(w.nodes)) if (k !== id) w.q.push({ at: w.t + lat, to: k, m: structuredClone(m) }); } });
    w.next[id] = { at: w.t + tickEvery, every: tickEvery };
    w.nodes[id].hello();
    return w.nodes[id];
  };
  w.step = () => {
    w.t += 10;
    w.q.sort((a, b) => a.at - b.at);
    while (w.q.length && w.q[0].at <= w.t) { const e = w.q.shift(); w.nodes[e.to]?.receive(e.m); }
    for (const job of w.jobs.filter((j) => j.at <= w.t)) { w.jobs.splice(w.jobs.indexOf(job), 1); job.fn(); }
    for (const [id, n] of Object.entries(w.next)) if (w.nodes[id] && n.every && w.t >= n.at) { w.nodes[id].tick(); n.at = w.t + n.every; }
  };
  w.leaders = () => Object.keys(w.nodes).filter((id) => w.nodes[id].isLeader()).sort();
  w.run = (until, sample) => { while (w.t < until) { w.step(); sample?.(w.leaders()); } };
  return w;
}
for (const lat of [50, 100]) {
  // A writer established at term 1; a joiner whose id sorts FIRST arrives at 5 s.
  const w = ltable(lat); w.mk("b"); w.run(5000);
  w.mk("a"); let both = 0; const solo = new Set();
  w.run(20000, (l) => { if (l.length > 1) both += 10; if (l.length === 1) solo.add(l[0]); });
  equal(`J1 a late joiner with the lower id, ${lat} ms each way: never two writers, and the established one keeps it`, [both, [...solo], w.nodes.a.state().owner], [0, ["b"], "b"]);
}
{
  // A round trip longer than the settle window: an overlap is unavoidable, but the joiner yields.
  const lat = 250;
  const w = ltable(lat); w.mk("b"); w.run(5000);
  w.mk("a"); let both = 0; const solo = new Set();
  w.run(20000, (l) => { if (l.length > 1) both += 10; if (l.length === 1) solo.add(l[0]); });
  ok("J2 at 250 ms each way the joiner never wins outright: the established writer is the only sole writer, and any overlap ends within the round trip",
    JSON.stringify([...solo]) === '["b"]' && w.nodes.a.state().owner === "b" && both <= 2 * lat - SETTLE_MS + 20, JSON.stringify({ both, solo: [...solo] }));
}
{
  // Equal terms: the OLDER connection wins, whatever the ids.
  const lone = (id, bornAt) => { let t = 0; const e = createConnectionElection({ id, userId: "U", now: () => t, bornAt, send: () => {} }); t = SETTLE_MS; e.isLeader(); return e; };
  const older = lone("z-older", 1000), newer = lone("a-newer", 2000);
  equal("J3 two term-1 claims made apart are settled by start time, not id", [older.state().term, newer.state().term], [1, 1]);
  newer.receive({ action: CONNECTION_ACTION, userId: "U", id: "z-older", owner: "z-older", term: 1, since: 1000, kind: "pulse" });
  older.receive({ action: CONNECTION_ACTION, userId: "U", id: "a-newer", owner: "a-newer", term: 1, since: 2000, kind: "pulse" });
  equal("J3b ...each side agrees the older connection writes", [older.isLeader(), newer.isLeader(), newer.state().owner], [true, false, "z-older"]);
}
{
  // A throttled writer under real delay, its follower asked at every 10 ms step: the probe's answer is waited for.
  const w = ltable(50); w.mk("a"); w.mk("b"); w.run(5000);
  w.next.a.every = 60000; w.next.a.at = w.t + 60000;
  let both = 0, none = 0; const solo = new Set();
  w.run(200000, (l) => { if (l.length > 1) both++; if (!l.length) none++; if (l.length === 1) solo.add(l[0]); });
  equal("J7 a throttled writer under 50 ms delay keeps the role while its follower is asked constantly", [both, none, [...solo]], [0, 0, ["a"]]);
}
{
  // LOW 5: a follower whose owner vanishes without a goodbye, timer throttled, decides on time.
  const run = (schedule) => {
    const w = ltable(50); w.mk("a"); w.mk("b", { schedule }); w.run(5000);
    w.next.b.every = 60000; w.next.b.at = w.t + 60000;
    // A third tab, following the same owner, keeps talking: B's own view has
    // no gap, so this is the PROBE path, not the revalidation after a gap.
    const chatter = () => w.nodes.b.receive({ action: CONNECTION_ACTION, userId: "U", id: "c", owner: "a", term: null, since: 0, kind: "pulse" });
    const until = (t) => { while (w.t < t) { w.step(); if (w.t % 1000 === 0) chatter(); } };
    delete w.nodes.a; until(w.t + LEASE_MS + 500);
    w.nodes.b.isLeader(); // a hook: the probe goes out
    until(w.t + PROBE_MS + 200); // no hook, no tick
    return w.nodes.b.state().owner;
  };
  equal("J4 a probed owner that never answers is replaced by the follower's own timer, not at its next hook", run(true), "b");
}
{
  // LOW 4: a reconnect never claims below a term it has seen; a lost owner gives way to a live claim already heard.
  let t = 0; const e = createConnectionElection({ id: "r", userId: "U", now: () => t, knownTerm: 7, send: () => {} });
  t = SETTLE_MS; e.isLeader();
  equal("J5 a reconnected connection that had seen term 7 claims term 8", e.state().term, 8);
  const w = table(); const A = w.mk("a"); const B = w.mk("b"); A.hello(); B.hello(); w.run(5000);
  // C claims at a weaker term than A's and stays live; then A leaves.
  B.receive({ action: CONNECTION_ACTION, userId: "U", id: "c", owner: "c", term: 0, since: 0, kind: "pulse" });
  B.receive({ action: CONNECTION_ACTION, userId: "U", id: "a", owner: null, term: null, kind: "bye" });
  equal("J6 when the owner leaves, a live claim already heard is adopted rather than out-claimed", B.state().owner, "c");
}

/* ------------------------------------------------------------ H. hand-over */
{
  const w = table(); const A = w.mk("a"); const B = w.mk("b"); A.hello(); B.hello(); w.run(5000);
  equal("H1 before: A writes", w.leaders(), ["a"]);
  w.close("a");
  equal("H2 a closed tab (pagehide's bye) hands over at once", w.leaders(), ["b"]);

  const v = table(); const C = v.mk("a"); const D = v.mk("b"); C.hello(); D.hello(); v.run(5000);
  v.close("a", { bye: false });
  ok("H3 a tab that vanished without a bye still holds the role until the probe fails", !D.isLeader());
  v.run(5000 + LEASE_MS + PROBE_MS + 2000);
  equal("H4 ...then the survivor takes over", v.leaders(), ["b"]);
}

/* ------------------------------------------------------------ P. accounts */
{
  const w = table(); const A = w.mk("a", "GM1"); const X = w.mk("x", "GM2"); A.hello(); X.hello(); w.run(5000);
  equal("P1 two GM accounts do not elect across each other: each account has its writer", w.leaders(), ["a", "x"]);
  A.receive({ action: CONNECTION_ACTION, userId: "GM1", id: "a", owner: "a", term: 99, kind: "pulse" });
  ok("P2 a message carrying this connection's own id is ignored", A.isLeader());
  A.receive({ action: CONNECTION_ACTION, userId: "GM1", id: "evil", owner: "evil", term: 5, kind: "shout" });
  ok("P3 an unknown kind is ignored", A.isLeader() && !A.state().peers.includes("evil"));
}

/* ------------------------------------------------------------ D/P/S/W. the live wrapper */
function fakeSocket(id, extra = {}) {
  // One listener per event (3.686.2: the election also listens for `connect`).
  const s = { id, sent: [], handler: null, events: {}, emit(ch, d) { s.sent.push([ch, d]); },
    on(ch, fn) { if (ch === "system.trg-prime") s.handler = fn; else (s.events[ch] ??= []).push(fn); },
    off(ch) { if (ch === "system.trg-prime") s.handler = null; }, ...extra };
  return s;
}
const gm = { id: "GM1", isGM: true };
const AGM = await import(new URL("../module/acting-gm.mjs", import.meta.url));

globalThis.game = { user: { id: "P1", isGM: false }, users: { activeGM: { id: "GM1" } }, socket: fakeSocket("p") };
ok("P4 a player is never the writer", GC.isGMConnectionWriter() === false && AGM.isActingGM() === false);
globalThis.game = { user: { id: "P1", isGM: false }, users: {}, socket: undefined };
ok("P5 ...not even with no socket at all", GC.isGMConnectionWriter() === false);

globalThis.game = { user: gm, users: { activeGM: gm }, socket: undefined };
ok("D1 no socket (the pure helpers' offline contract): the GM writes", GC.isGMConnectionWriter() === true && AGM.isActingGM() === true);
globalThis.game = { user: gm, users: { activeGM: gm }, socket: fakeSocket("s1", { connected: false }) };
ok("D2 a socket that reports connected === false is not the writer", GC.isGMConnectionWriter() === false && AGM.isActingGM() === false);

const live = fakeSocket("s2");
globalThis.game = { user: gm, users: { activeGM: gm }, socket: live };
ok("S0 a fresh connection has not settled yet (a startup sweep must wait)", gmConnectionSettled() === false);
ok("D3a a fresh lone connection is not the writer before the settle window", GC.isGMConnectionWriter() === false);
ok("S1 the election said hello on its channel", live.sent.some(([ch, d]) => ch === "system.trg-prime" && d.kind === "hello" && d.userId === "GM1"));
const t0 = Date.now();
await GC.gmConnectionReady();
const waited = Date.now() - t0;
ok("S3 gmConnectionReady resolves after the settle window", waited >= SETTLE_MS - 50 && waited < SETTLE_MS + 1500, `${waited} ms`);
ok("D3 a harness socket with no `connected` property is connected: once settled, a lone GM writes", GC.isGMConnectionWriter() === true);
ok("S4 ...and isActingGM agrees", AGM.isActingGM() === true);
ok("S5 waitForGMConnection is the same wait, and the settled flag agrees", waitForGMConnection === gmConnectionReady && gmConnectionSettled() === true);
ok("S5b the live state names this connection as owner", gmConnectionState()?.owner === "s2" && AGM.gmConnectionState === gmConnectionState && AGM.waitForGMConnection === waitForGMConnection);

live.handler?.({ action: CONNECTION_ACTION, userId: "GM1", id: "other-tab", owner: "other-tab", term: 50, kind: "pulse" });
ok("W1 a stronger claim from another tab of this account: isActingGM stands down", AGM.isActingGM() === false);
live.handler?.({ action: CONNECTION_ACTION, userId: "GM1", id: "other-tab", owner: "other-tab", term: 50, kind: "bye" });
ok("W2 ...and takes the role back when that tab closes", AGM.isActingGM() === true);
globalThis.game.users.activeGM = { id: "GM2" };
ok("W3 another account being the active GM still wins", AGM.isActingGM() === false);
globalThis.game.users.activeGM = gm;
live.id = "s2-reconnected";
GC.isGMConnectionWriter(); // the new socket id restarts the election
await gmConnectionReady();
ok("W4 a reconnect carries the highest term it saw: it claims above the 51 it held (after the 50 it heard), not term 1",
  GC.isGMConnectionWriter() === true && gmConnectionState()?.owner === "s2-reconnected" && gmConnectionState()?.term === 52, JSON.stringify(gmConnectionState()));

/* K — the third review (3.686.2): reconnects */
{
  // K1: a LONE, settled GM page whose socket reconnects with a new id: the first hook after it is not lost.
  const k = fakeSocket("k1");
  globalThis.game = { user: { id: "GMK", isGM: true }, users: { activeGM: { id: "GMK" } }, socket: k };
  await gmConnectionReady();
  const before = GC.isGMConnectionWriter();
  k.connected = false; const during = GC.isGMConnectionWriter();
  k.connected = true; k.id = "k1-again";
  const firstHook = GC.isGMConnectionWriter();
  equal("K1 a lone settled GM: the writer before, not while disconnected, and at the FIRST hook after a reconnect", [before, during, firstHook], [true, false, true]);
  // K2: the rebuild happens on socket.io's `connect`, before any hook.
  k.id = "k2-new"; k.sent.length = 0;
  for (const fn of k.events.connect ?? []) fn();
  ok("K2 a reconnect rebuilds on the socket's `connect` event, not at the next hook or tick", k.sent.some(([, d]) => d?.kind === "hello" && d?.id === "k2-new"), JSON.stringify(k.sent.map(([, d]) => d?.kind + ":" + d?.id)));
  // K4: a superseded socket object is retired, and what it knew is carried.
  const termBefore = gmConnectionState()?.term ?? 0;
  k.connected = false;
  const k2 = fakeSocket("k4-socket");
  globalThis.game = { user: { id: "GMK", isGM: true }, users: { activeGM: { id: "GMK" } }, socket: k2 };
  const writerNow = GC.isGMConnectionWriter();
  ok("K4 a new socket object for the account retires the disconnected old one (its listener gone) and carries its term and its settled state",
    k.handler === null && writerNow === true && (gmConnectionState()?.term ?? 0) > termBefore, JSON.stringify({ oldHandler: Boolean(k.handler), writerNow, term: gmConnectionState()?.term, termBefore }));
}
{
  // K3: two GM tabs that reconnect together (both carry the same peers and terms); hooks reach both at the same instant.
  const counts = { both: 0, none: 0, n: 0 };
  for (const lat of [20, 60]) for (const [every, phase] of [[250, 0], [1000, 1600], [1000, 1700], [1000, 1900]]) {
    const w = ltable(lat); w.mk("a"); w.mk("b"); w.run(10000);
    const ta = w.nodes.a.knownTerm(), tb = w.nodes.b.knownTerm();
    delete w.nodes.a; delete w.nodes.b; w.q.length = 0; w.next = {};
    w.mk("a2", { knownPeers: ["a", "b"], knownTerm: ta }); w.mk("b2", { knownPeers: ["a", "b"], knownTerm: tb });
    const t0 = w.t;
    while (w.t < t0 + 20000) { w.step(); if (w.t - t0 >= phase && (w.t - t0 - phase) % every === 0) { counts.n++; const l = ["a2", "b2"].filter((k) => w.nodes[k].isLeader()).length; if (l > 1) counts.both++; } }
  }
  equal("K3 two tabs reconnecting together never both write at a hook delivered to both at once", counts.both, 0);
}
{
  // K5: a reconnecting page whose peers are silent finishes its revalidation on its own timer.
  const w = ltable(50); const R = w.mk("r", { knownPeers: ["gone"], tickEvery: 0 });
  w.run(w.t + 1500 + 200);
  equal("K5 revalidation is decided on the page's own schedule, with no hook or tick", R.state().owner, "r");
}

/* S6: the system registers the election from its init hook, and the ready
   hook registers its listeners before it waits for anything. */
const main = fs.readFileSync(path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), "utf8");
const init = main.slice(main.indexOf('Hooks.once("init"'));
ok("S6 the init hook registers the election", /registerGMConnection\(\)/.test(init.slice(0, init.indexOf("\n});"))));
const ready = main.slice(main.indexOf('Hooks.once("ready"'));
const firstAwait = ready.indexOf("await ");
ok("S7 ready registers the relays before its first await (finding 8)", firstAwait > ready.indexOf("registerTargetRelay();") && firstAwait > ready.indexOf("registerPartySocket();") && firstAwait > ready.indexOf("registerGMAuthorisation();") && firstAwait > ready.indexOf("registerPendingCastRelay();"));
ok("S8 ...and settles the election before its one-time sweeps", /await gmConnectionReady\(\);[\s\S]*purgeOrphanedItemsOfType/.test(ready));

if (failures.length) {
  console.log(`verify-gm-connection: ${checks} checks — ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-gm-connection: ${checks} checks — all green.`);
