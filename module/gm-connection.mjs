/**
 * ONE AUTOMATION WRITER PER GM ACCOUNT, EVEN ACROSS BROWSER TABS
 * (Graham, 3.686.1; reworked 3.686.2).
 *
 * `game.users.activeGM` names a USER, and one user may have several
 * connections — two tabs, two browser profiles. Every one of them sees
 * the same hooks and socket messages, so every one of them would act.
 * This module picks one CONNECTION of the active GM account to write.
 * It uses the system socket only; no world document or setting is
 * written.
 *
 * WHAT 3.686.2 CHANGED, AND WHY (the 3.686.1 review, findings 1, 2, 5):
 *
 * LEADERSHIP IS DECIDED BY WHAT PEERS CAN SEE, NOT BY THE LOCAL TIMER.
 * A hidden tab's `setInterval` is throttled to about once a minute, but
 * its socket and document hooks still arrive. 3.686.1 dropped leadership
 * whenever its own timer looked stale, so a GM whose only tab was in the
 * background silently stopped automating. Now:
 *   - a connection that knows of no peer IS the writer, at once and
 *     always — a lone GM tab never waits and never loses the role;
 *   - an owner is replaced only when it fails to answer a PROBE. Probes
 *     and hellos are answered from the socket handler, which throttling
 *     does not delay, so a background owner stays the owner;
 *   - a stale local gap triggers a re-hello, never a loss of leadership.
 *     A non-owner coming back from a gap will not elect itself until it
 *     has heard a pulse interval of traffic, unless it knows no peer.
 *
 * TERMS, NOT ID ORDER, DECIDE A CONFLICT. Every claim carries a term; a
 * takeover claims one higher than any it has seen. A resumed tab holding
 * an older claim yields to the newer one. Claims of the SAME term go to
 * the OLDER connection (its start time, carried on every message), and
 * only then to id order. A brand-new tab claims term 0 (provisional), so
 * a late joiner yields to the established writer rather than taking over.
 *
 * THE JOIN WINDOW (the 3.686.2 review). A brand-new tab is NOT the writer
 * until it has heard another tab or the settle window has passed: while
 * its hello is in flight it cannot know an established writer exists, and
 * counting itself lone made two writers for a round trip. So a lone GM
 * becomes the writer about 400 ms after the page starts (the startup
 * sweeps wait for that — `gmConnectionReady`). Only where a round trip
 * takes longer than the settle window can a joiner and the writer
 * overlap, and then the joiner yields as soon as it hears the writer.
 */
export const CONNECTION_ACTION = 'trgPrime.gmConnection';
/** How often a connection pulses when its timer runs normally. */
const PULSE_MS = 1000;
/** A brand-new connection's provisional window; also `gmConnectionReady`'s wait. */
export const SETTLE_MS = 400;
/** An owner not heard from for this long is probed. */
export const LEASE_MS = 6000;
/** A probed owner that does not answer within this is gone. */
export const PROBE_MS = 1500;
/** A peer silent for this long is forgotten (no `bye` — a crash, a lost network). */
const PEER_TTL_MS = 180000;
/** After a stale gap: a pulse interval of traffic, and a margin, before claiming. */
const REVALIDATE_MS = PULSE_MS + 500;

const KINDS = ['hello', 'pulse', 'probe', 'bye'];

/**
 * The election, pure: no timers, no socket. `send` carries a message to
 * every other connection; `receive` takes one from them; `now` is a clock.
 *
 * @param {object} o
 * @param {string} o.id this connection's id
 * @param {string} o.userId the GM account
 * @param {() => number} o.now
 * @param {(message: object) => void} o.send
 * @param {string[]} [o.knownPeers] peers a previous connection of this
 *   page knew of: a reconnecting page is not lone, and must hear traffic
 *   before it may claim.
 * @param {boolean} [o.settled] a reconnect of a page that knew NO peer:
 *   it is lone already, so it starts settled (3.686.2, the third review).
 */
export function createConnectionElection({ id, userId, now, send, knownPeers = [], knownTerm = 0, bornAt = null, schedule = null, settled = false }) {
  const known = new Map();             // peer id -> last heard
  // A page that was already settled and lone before its socket reconnected
  // does not wait out the settle window again (3.686.2, the third review):
  // its first hook after the reconnect would be lost.
  const createdAt = now() - (settled && !knownPeers.length ? SETTLE_MS : 0);
  // The start time other tabs compare: a shared clock (the live wrapper
  // passes Date.now()), not `now`, which may be per-tab.
  const since = Number.isFinite(bornAt) ? bornAt : createdAt;
  const claims = new Map();            // peer id -> { term, since } of its live self-claim
  let owner = id, term = 0, ownerSince = since, maxTerm = Math.max(0, Number(knownTerm) || 0);
  let lastTick = createdAt, lastHeard = createdAt;
  let probeAt = null, lostAt = null;
  let revalidateUntil = null, heard = new Set();
  for (const peer of knownPeers) if (peer && peer !== id) known.set(peer, createdAt);
  if (known.size) { owner = null; lostAt = createdAt; beginRevalidate(createdAt); }

  function publish(kind = 'pulse') {
    send({ action: CONNECTION_ACTION, userId, id, owner, term: owner === id ? term : null, since, kind });
  }
  function beginRevalidate(time) {
    revalidateUntil = time + REVALIDATE_MS; heard = new Set();
    // Finish on time even if no timer or hook runs here, as the probe does.
    schedule?.(() => elect(), REVALIDATE_MS + 50);
  }
  function stronger(aId, aTerm, aSince, bId, bTerm, bSince) {
    if (!bId) return true;
    if (aTerm !== bTerm) return aTerm > bTerm;
    if (aSince !== bSince && Number.isFinite(aSince) && Number.isFinite(bSince)) return aSince < bSince;
    return aId < bId;
  }
  function ownerLost(time) {
    owner = null; term = 0; probeAt = null; lostAt = time;
    // A LIVE CLAIM ALREADY HEARD is adopted rather than out-claimed
    // (3.686.2): another tab that has claimed and is still talking is the
    // writer the others will follow.
    let best = null;
    for (const [peer, c] of claims) {
      if (!known.has(peer) || time - known.get(peer) > LEASE_MS) continue;
      if (!best || stronger(peer, c.term, c.since, best.peer, best.term, best.since)) best = { peer, ...c };
    }
    if (best) { owner = best.peer; term = best.term; ownerSince = best.since; lostAt = null; }
  }
  function claim() {
    owner = id; term = maxTerm + 1; maxTerm = term; ownerSince = since; probeAt = null; lostAt = null;
    publish('pulse');
  }

  function receive(message) {
    if (message?.action !== CONNECTION_ACTION || message.userId !== userId) return;
    if (typeof message.id !== 'string' || !message.id || message.id === id) return;
    if (!KINDS.includes(message.kind)) return;
    const time = now();
    lastHeard = time;
    if (message.kind === 'bye') {
      known.delete(message.id);
      claims.delete(message.id);
      if (owner === message.id) ownerLost(time);
      return;
    }
    known.set(message.id, time);
    heard.add(message.id);
    const theirTerm = Number.isFinite(message.term) && message.term >= 0 ? message.term : null;
    const theirSince = Number.isFinite(message.since) ? message.since : null;
    if (message.owner === message.id && theirTerm !== null) claims.set(message.id, { term: theirTerm, since: theirSince });
    else claims.delete(message.id);
    if (message.owner === message.id && theirTerm !== null) {
      maxTerm = Math.max(maxTerm, theirTerm);
      if (owner === message.id) { term = Math.max(term, theirTerm); ownerSince = theirSince; probeAt = null; }
      else if (stronger(message.id, theirTerm, theirSince, owner, term, owner === id ? since : ownerSince)) {
        owner = message.id; term = theirTerm; ownerSince = theirSince; probeAt = null; lostAt = null;
      } else if (owner === id) publish('pulse'); // ours is stronger: tell them now
    } else if (owner === message.id) {
      // Our owner no longer claims. Whoever it follows will speak for itself.
      ownerLost(time);
    }
    if (owner === message.id) probeAt = null;
    if (message.kind === 'hello' || message.kind === 'probe') publish('pulse');
  }

  /** A local gap: the timer did not run and nothing was heard. */
  function checkGap(time) {
    if (!known.size || revalidateUntil !== null) return;
    if (time - Math.max(lastTick, lastHeard) <= LEASE_MS) return;
    lastTick = time;
    // An owner keeps the role and re-announces it; a newer claim made
    // while it was away is answered at once and wins on its term.
    if (owner !== id) beginRevalidate(time);
    publish('hello');
  }

  function elect() {
    const time = now();
    for (const [peer, seen] of known) if (time - seen > PEER_TTL_MS) known.delete(peer);
    if (revalidateUntil !== null && time >= revalidateUntil) {
      for (const peer of [...known.keys()]) if (!heard.has(peer)) known.delete(peer);
      if (owner && owner !== id && !heard.has(owner)) ownerLost(time);
      revalidateUntil = null;
      // The grace before a non-lowest tab may claim runs from HERE (3.686.2,
      // the third review): two tabs reconnecting together both had it used
      // up by the revalidation, and both claimed the same term.
      if (!owner) lostAt = time;
    }
    if (owner && owner !== id) {
      if (!known.has(owner)) ownerLost(time);
      else if (time - known.get(owner) > LEASE_MS) {
        if (probeAt === null) {
          probeAt = time; publish('probe');
          // Decide on time even if no timer or hook runs here (3.686.2): a
          // hidden follower would otherwise sit without a writer until its
          // throttled timer next ran.
          schedule?.(() => elect(), PROBE_MS + 50);
        }
        else if (time - probeAt > PROBE_MS) ownerLost(time);
      }
    }
    if (revalidateUntil !== null) return;
    if (!owner) {
      const live = [id, ...[...known].filter(([, seen]) => time - seen <= LEASE_MS).map(([peer]) => peer)].sort();
      if (live[0] === id || time - (lostAt ?? time) > PROBE_MS) claim();
    } else if (owner === id && term === 0 && time - createdAt >= SETTLE_MS) {
      claim(); // the provisional claim becomes a real one
    }
  }

  function tick() {
    const time = now();
    checkGap(time);
    lastTick = time;
    elect();
    publish('pulse');
  }
  function isLeader() {
    const time = now();
    checkGap(time);
    elect();
    // NO PEER: the writer — once its hello has had the settle window to be
    // answered (3.686.2), so a joiner is not a second writer meanwhile.
    if (!known.size) return time - createdAt >= SETTLE_MS;
    return revalidateUntil === null && owner === id;
  }
  /** Milliseconds until this connection's view has settled. */
  function settleRemaining() {
    elect();
    const time = now();
    return Math.max(0, createdAt + SETTLE_MS - time, revalidateUntil === null ? 0 : revalidateUntil - time);
  }
  return {
    receive, tick, isLeader, settleRemaining,
    hello: () => publish('hello'), leave: () => publish('bye'),
    knownPeers: () => [...known.keys()],
    knownTerm: () => maxTerm,
    state: () => ({ id, userId, owner, term, revalidating: revalidateUntil !== null, peers: [...known.keys()] })
  };
}

/* ------------------------------------------------- the live connection */

const CHANNEL = 'system.trg-prime';
/**
 * ONE RECORD PER SOCKET (3.686.2). Foundry has one socket per page; a test
 * harness that models several clients in one process gives each its own
 * socket, and a single module-wide election swapped between them would
 * restart on every call. The map is keyed weakly, but `live` (for the
 * pagehide goodbye) holds each record, so a record does not simply go with
 * its socket: when a NEW socket object appears for an account whose old
 * socket is disconnected, the old record is retired — its interval
 * cleared, its listener removed, dropped from `live` — and its peers and
 * terms carried over.
 */
const connections = new WeakMap();
const live = new Set();
let fallbackSeq = 0;

function clock() { return globalThis.performance?.now?.() ?? Date.now(); }
function socketIdOf(sock, record) {
  if (sock?.id) return String(sock.id);
  record.fallbackId ??= `local-${Math.random().toString(36).slice(2, 10)}-${++fallbackSeq}`;
  return record.fallbackId;
}

/** This page's record for the current socket — started (or restarted after a reconnect) as needed. */
function connectionFor(current = globalThis.game) {
  if (!current?.socket || current.socket.connected === false || !current.user?.isGM) return null;
  const sock = current.socket;
  let record = connections.get(sock);
  if (!record) {
    record = { socket: sock, election: null, id: null, userId: null, timer: null, ready: null, fallbackId: null };
    record.receive = (data) => record.election?.receive(data);
    // A superseded socket of this account (disconnected) is retired, and
    // what it knew is carried over.
    for (const old of [...live]) {
      if (old.socket === sock || old.userId !== current.user.id || old.socket?.connected !== false) continue;
      if (old.timer) globalThis.clearInterval?.(old.timer);
      old.socket.off?.(CHANNEL, old.receive);
      live.delete(old); connections.delete(old.socket);
      record.election = old.election; record.userId = old.userId; record.id = old.id;
    }
    connections.set(sock, record);
    live.add(record);
    // REBUILT ON CONNECT (3.686.2, the third review): socket.io's own event,
    // which a hidden tab does not throttle, rather than the next hook or tick.
    sock.on?.("connect", () => connectionFor({ socket: sock, user: { id: record.userId, isGM: true } }));
  }
  const id = socketIdOf(sock, record);
  if (record.election && record.id === id && record.userId === current.user.id) return record;
  // A reconnect of the same account carries the peers it knew and the
  // highest term it has seen; another account's do not apply.
  const same = record.election && record.userId === current.user.id;
  const knownPeers = same ? record.election.knownPeers() : [];
  const knownTerm = same ? record.election.knownTerm() : 0;
  // A lone page that had settled stays settled across the reconnect.
  const settled = Boolean(same && !knownPeers.length && record.election.settleRemaining() <= 0);
  if (record.election && record.socket === sock) sock.off?.(CHANNEL, record.receive);
  if (record.timer) globalThis.clearInterval?.(record.timer);
  record.id = id; record.userId = current.user.id; record.ready = null;
  record.election = createConnectionElection({ id, userId: current.user.id, now: clock, knownPeers, knownTerm, settled,
    bornAt: Date.now(),
    schedule: (fn, ms) => { const t = setTimeout(fn, ms); t?.unref?.(); },
    send: (data) => { if (sock.connected !== false) sock.emit?.(CHANNEL, data); } });
  sock.on?.(CHANNEL, record.receive);
  record.election.hello();
  record.timer = globalThis.setInterval?.(() => {
    if (sock.connected === false) return;
    if (socketIdOf(sock, record) !== record.id) { connectionFor({ socket: sock, user: { id: record.userId, isGM: true } }); return; }
    record.election.tick();
  }, PULSE_MS) ?? null;
  record.timer?.unref?.(); // a test harness must still be able to exit
  return record;
}
function initialiseGMConnection() { connectionFor(); }

/**
 * Is THIS connection its GM account's writer? False for a player, and
 * for a connection whose socket reports `connected === false`. With no
 * socket at all (a harness), true: the pure helpers' offline contract.
 */
export function isGMConnectionWriter() {
  const current = globalThis.game;
  if (!current?.user?.isGM) return false;
  if (!current.socket) return true;
  if (current.socket.connected === false) return false;
  const record = connectionFor(current);
  return record ? record.election.isLeader() : true;
}

export function gmConnectionState() { return connectionFor()?.election.state() ?? null; }

/**
 * Resolves once this connection's view of the election has settled —
 * long enough to have heard any other tab of the same account. A sweep
 * that runs ONCE at startup awaits this before asking `isActingGM`, so
 * it is neither skipped nor run twice.
 */
export function gmConnectionReady() {
  const record = connectionFor();
  if (!record) return Promise.resolve();
  if (record.ready) return record.ready;
  const mine = record.election;
  record.ready = new Promise((resolve) => {
    const check = () => {
      const wait = record.election === mine ? mine.settleRemaining() : 0;
      if (wait <= 0) resolve(); else setTimeout(check, wait);
    };
    check();
  });
  return record.ready;
}
/**
 * Has this connection's view settled — or is there nothing to settle (a
 * player, no socket)? Lets a caller skip the await when it need not wait,
 * so a hook that was synchronous stays synchronous.
 */
export function gmConnectionSettled() {
  const record = connectionFor();
  return !record || record.election.settleRemaining() <= 0;
}
/** 3.686.1's name for the same wait. */
export const waitForGMConnection = gmConnectionReady;

/**
 * Registered from the system's init hook — never at import, which some
 * harnesses' Hooks proxies refuse. The election starts lazily on the
 * first `isActingGM`; these only make it start as early as possible and
 * say goodbye when the page goes.
 */
let registered = false;
export function registerGMConnection() {
  if (registered) return;
  registered = true;
  globalThis.Hooks?.once?.('setup', initialiseGMConnection);
  globalThis.Hooks?.once?.('ready', initialiseGMConnection);
  globalThis.addEventListener?.('pagehide', () => { for (const record of live) record.election?.leave(); });
}
