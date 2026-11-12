#!/usr/bin/env node
/**
 * mutate-gm-connection — can verify-gm-connection fail? (3.686.2)
 *
 * Each mutation puts back one way the election could go wrong — several
 * are exactly 3.686.1's defects as its review found them. SURVIVED and an
 * unmatched anchor are both failures.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const GC = path.join(SYSTEM_ROOT, "module", "gm-connection.mjs");
const AGM = path.join(SYSTEM_ROOT, "module", "acting-gm.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");

const MUTATIONS = [
  { name: "THE 3.686.1 DEFECT: a stale local timer loses leadership (a lone background tab)", file: GC,
    from: "    if (!known.size) return time - createdAt >= SETTLE_MS;\n",
    to: "    if (time - lastTick > LEASE_MS) return false;\n    if (!known.size) return time - createdAt >= SETTLE_MS;\n", breaks: "L3/L4" },
  { name: "THE JOIN WINDOW (3.686.2 review): a brand-new tab counts itself lone at once", file: GC,
    from: "    if (!known.size) return time - createdAt >= SETTLE_MS;\n", to: "    if (!known.size) return true;\n", breaks: "L1/J1/D3a" },
  { name: "equal terms go to id order, not the older connection", file: GC,
    from: "    if (aSince !== bSince && Number.isFinite(aSince) && Number.isFinite(bSince)) return aSince < bSince;\n", to: "", breaks: "J3b" },
  { name: "a probe is decided only at the next hook or tick", file: GC,
    from: "          schedule?.(() => elect(), PROBE_MS + 50);\n", to: "", breaks: "J4" },
  { name: "a reconnect forgets the terms it saw (pure)", file: GC,
    from: "maxTerm = Math.max(0, Number(knownTerm) || 0);", to: "maxTerm = 0;", breaks: "J5/W4" },
  { name: "a reconnect forgets the terms it saw (the live wrapper)", file: GC,
    from: "  const knownTerm = same ? record.election.knownTerm() : 0;", to: "  const knownTerm = 0;", breaks: "W4" },
  { name: "a lost owner is out-claimed though a live claim was heard", file: GC,
    from: "    if (best) { owner = best.peer; term = best.term; ownerSince = best.since; lostAt = null; }\n", to: "", breaks: "J6" },
  { name: "THE 3.686.1 DEFECT: id order, not term, settles a conflict", file: GC,
    from: "    if (aTerm !== bTerm) return aTerm > bTerm;\n", to: "", breaks: "T3/R6" },
  { name: "a gap demotes the owner too", file: GC,
    from: "    if (owner !== id) beginRevalidate(time);\n", to: "    beginRevalidate(time);\n", breaks: "R1b" },
  { name: "an owner is replaced without being probed", file: GC,
    from: "        else if (time - probeAt > PROBE_MS) ownerLost(time);\n", to: "        else ownerLost(time);\n", breaks: "R1c" },
  { name: "an owner silent past the lease is dropped without a probe going out", file: GC,
    from: "          probeAt = time; publish('probe');\n", to: "          probeAt = time - PROBE_MS - 1; ownerLost(time);\n", breaks: "R1c" },
  { name: "a probe is not answered", file: GC,
    from: "    if (message.kind === 'hello' || message.kind === 'probe') publish('pulse');\n",
    to: "    if (message.kind === 'hello') publish('pulse');\n", breaks: "R1c" },
  { name: "a reconnected page with peers claims without hearing them first", file: GC,
    from: "  if (known.size) { owner = null; lostAt = createdAt; beginRevalidate(createdAt); }\n", to: "", breaks: "R9" },
  { name: "the provisional claim is never made real, so a late joiner can take over", file: GC,
    from: "      claim(); // the provisional claim becomes a real one\n", to: "      ; // never\n", breaks: "T3" },
  // NEW 3.686.2 (third review): reconnects.
  { name: "MEDIUM 1: a lone page's reconnect waits out the settle window again (pure)", file: GC, from: "  const createdAt = now() - (settled && !knownPeers.length ? SETTLE_MS : 0);", to: "  const createdAt = now();", breaks: "K1" },
  { name: "MEDIUM 1: the live wrapper never passes `settled`", file: GC, from: "  const settled = Boolean(same && !knownPeers.length && record.election.settleRemaining() <= 0);", to: "  const settled = false;", breaks: "K1" },
  { name: "MEDIUM 1: no rebuild on the socket's connect", file: GC, from: "    sock.on?.(\"connect\", () => connectionFor({ socket: sock, user: { id: record.userId, isGM: true } }));\n", to: "", breaks: "K2" },
  { name: "LOW 2: revalidation's end does not restart the claim grace", file: GC, from: "      if (!owner) lostAt = time;\n", to: "", breaks: "K3" },
  { name: "(c): a superseded socket's record is never retired", file: GC, from: "    for (const old of [...live]) {", to: "    for (const old of []) {", breaks: "K4" },
  { name: "(d): revalidation waits for a hook or tick to end", file: GC, from: "    schedule?.(() => elect(), REVALIDATE_MS + 50);\n", to: "", breaks: "K5" },
  { name: "a bye is ignored", file: GC,
    from: "      known.delete(message.id);\n      claims.delete(message.id);\n      if (owner === message.id) ownerLost(time);\n", to: "", breaks: "H2" },
  { name: "another account's connections join the election", file: GC,
    from: "    if (message?.action !== CONNECTION_ACTION || message.userId !== userId) return;\n",
    to: "    if (message?.action !== CONNECTION_ACTION) return;\n", breaks: "P1" },
  { name: "an unknown kind is taken as a peer", file: GC,
    from: "    if (!KINDS.includes(message.kind)) return;\n", to: "", breaks: "P3" },
  { name: "a disconnected socket is still the writer", file: GC,
    from: "  if (current.socket.connected === false) return false;\n  const record = connectionFor(current);",
    to: "  const record = connectionFor(current);", breaks: "D2" },
  { name: "THE 3.686.1 DEFECT: a socket without `connected` is taken as disconnected", file: GC,
    from: "  if (current.socket.connected === false) return false;\n  const record = connectionFor(current);",
    to: "  if (!current.socket.connected) return false;\n  const record = connectionFor(current);", breaks: "D3" },
  { name: "a player can be the writer", file: GC,
    from: "  if (!current?.user?.isGM) return false;\n  if (!current.socket) return true;\n",
    to: "  if (!current.socket) return true;\n", breaks: "P5" },
  { name: "THE 3.686.1 DEFECT: a hook registered at import", file: GC,
    from: "/** 3.686.1's name for the same wait. */\n",
    to: "Hooks.once('setup', () => {});\n/** 3.686.1's name for the same wait. */\n", breaks: "S2" },
  { name: "the settle wait resolves at once", file: GC,
    from: "      if (wait <= 0) resolve(); else setTimeout(check, wait);\n", to: "      resolve();\n", breaks: "S3" },
  { name: "a fresh connection claims to be settled", file: GC,
    from: "  return !record || record.election.settleRemaining() <= 0;\n", to: "  return true;\n", breaks: "S0" },
  { name: "isActingGM ignores the election", file: AGM,
    from: "  return Boolean(game?.user?.isGM) && isGMConnectionWriter();\n", to: "  return Boolean(game?.user?.isGM);\n", breaks: "W1" },
  { name: "THE 3.686.1 DEFECT (finding 8): ready waits before registering its listeners", file: BOOT,
    from: "Hooks.once(\"ready\", async () => {\n", to: "Hooks.once(\"ready\", async () => {\n  await gmConnectionReady();\n", breaks: "S7" },
  { name: "the one-time sweep does not wait for the election", file: BOOT,
    from: "  if (!gmConnectionSettled()) await gmConnectionReady();\n  if (isActingGM()) {\n", to: "  if (isActingGM()) {\n", breaks: "S8" },
  { name: "the election is never registered", file: BOOT,
    from: "  registerGMConnection();\n", to: "", breaks: "S6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-gm-connection.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-gm-connection: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-gm-connection: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-gm-connection: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
