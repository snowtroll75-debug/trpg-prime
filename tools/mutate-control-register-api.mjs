#!/usr/bin/env node
/** mutate-control-register-api — the mutation half of verify-control-register-api. NEW at 3.686.0 (H12, Q170). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CR = m("magic", "control-register.mjs"), CW = m("magic", "control-register-workflow.mjs"), API = m("module-api-workflow.mjs"),
  AS = m("magic", "active-spells.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "C1 no bound source", file: CR, from: "  bound: \"Bound\",\n", to: "", breaks: "C1/C3" },
  { name: "C1b the hook is renamed", file: CR, from: "export const CONTROL_RELEASED_HOOK = \"trgPrimeControlReleased\";", to: "export const CONTROL_RELEASED_HOOK = \"trgPrimeControlFreed\";", breaks: "C1b/R1" },
  { name: "C2 every entry carries an empty cast id", file: CW, from: "    ...(castId ? { castId: String(castId) } : {}),", to: "    castId: String(castId ?? \"\"),", breaks: "C2" },
  { name: "C3 the cast id is dropped", file: CW, from: "    ...(castId ? { castId: String(castId) } : {}),", to: "", breaks: "C3/R3" },
  { name: "C3 the facts are kept by reference", file: CW, from: "{ data: JSON.parse(JSON.stringify(data)) }", to: "{ data }", breaks: "C3" },
  { name: "R1 a release fires nothing", file: CW, from: "    globalThis.Hooks?.callAll?.(CONTROL_RELEASED_HOOK, {", to: "    globalThis.Hooks?.call?.(CONTROL_RELEASED_HOOK, {", breaks: "R1" },
  { name: "R2 a release of nothing fires too", file: CW, from: "  if (gone) {\n    globalThis.Hooks", to: "  {\n    globalThis.Hooks", breaks: "R2" },
  { name: "R1 the default reason is blank", file: CW, from: "{ reason = \"released\", degree = null, creature = null } = {}", to: "{ reason = \"\", degree = null, creature = null } = {}", breaks: "R1" },
  { name: "R2b the creature is not carried", file: CW, from: "controller: actor, entry: gone, creature: creature ?? null,", to: "controller: actor, entry: gone, creature: null,", breaks: "R2b/R3" },
  { name: "R3 the sweep says no reason", file: CW, from: "  if (freed) await releaseControlled(actor, overflow.highest.id, { reason: \"overflow\", degree, creature });", to: "  if (freed) await releaseControlled(actor, overflow.highest.id);", breaks: "R3/R6" },
  { name: "R8 an entry's creature is never resolved", file: CW, from: "  return entry?.handle ? resolveActorHandle(entry.handle) : null;", to: "  return null;", breaks: "R8b/H2" },
  { name: "H1 recordControlled is not on the API", file: API, from: "      recordControlled: async (...args) => (await import(\"./magic/control-register-workflow.mjs\")).recordControlled(...args),\n", to: "", breaks: "H1" },
  { name: "H2 the API's release drops its options", file: API, from: "      releaseControlled: async (...args) => (await import(\"./magic/control-register-workflow.mjs\")).releaseControlled(...args),", to: "      releaseControlled: async (actor, id) => (await import(\"./magic/control-register-workflow.mjs\")).releaseControlled(actor, id),", breaks: "H2" },
  { name: "L1 until dismissed locks nothing", file: AS, from: "  if (/until dismissed/.test(t)) return \"unlimited\";\n", to: "", breaks: "L1/L3" },
  { name: "L1 until dismissed locks to the daily preparation", file: AS, from: "  if (/until dismissed/.test(t)) return \"unlimited\";", to: "  if (/until dismissed/.test(t)) return \"dailyPrep\";", breaks: "L1" },
  { name: "L2 a (D) locks too", file: AS, from: "  if (/until dismissed/.test(t)) return \"unlimited\";", to: "  if (/until dismissed|\\(d\\)/.test(t)) return \"unlimited\";", breaks: "L2" },
  { name: "Z1 the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.685.3\"", breaks: "Z1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-control-register-api.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-control-register-api: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-control-register-api: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-control-register-api: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
