#!/usr/bin/env node
/**
 * mutate-fixes-3685-2 — can verify-fixes-3685-2 fail? (3.685.2)
 *
 * SURVIVED and an unmatched anchor are both failures.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TREC = path.join(SYSTEM_ROOT, "module", "combat", "turn-records.mjs");
const AGM = path.join(SYSTEM_ROOT, "module", "acting-gm.mjs");
const SCHEMAS = path.join(SYSTEM_ROOT, "module", "foundry-schemas.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");

const MUTATIONS = [
  { name: "THE DEFECT: every GM client clears", file: TREC, from: "    if (!isActingGM()) return;\n", to: "    if (!game.user?.isGM) return;\n", breaks: "G1/G2/G3/G7" },
  { name: "every client clears, players too", file: TREC, from: "    if (!isActingGM()) return;\n", to: "", breaks: "G3/G4/G6" },
  { name: "the active GM is not compared with this client", file: AGM, from: "  if (activeGM && activeGM.id !== game.user?.id) return false;\n", to: "" /* RE-ANCHORED 3.686.2 on Graham's 3.686.1 form */, breaks: "G1/G3" },
  { name: "a lone GM with no active GM does nothing", file: AGM, from: "  return Boolean(game?.user?.isGM) && isGMConnectionWriter();", to: "  return false;" /* RE-ANCHORED 3.686.2 */, breaks: "G5" },
  { name: "the opening Flat-Footed is no longer cleared", file: TREC, from: "        await clearOpeningFlatFooted(actor);\n", to: "", breaks: "G1" },
  { name: "the snapshot keeps the stale build", file: SCHEMAS, from: "  foundry: \"14.367\",", to: "  foundry: \"14.363\",", breaks: "S1" },
  { name: "a recorded field is dropped with the build", file: SCHEMAS, from: "    \"RegionBehavior:pauseGame\": Object.freeze([\"once\"]),", to: "    \"RegionBehavior:pauseGame\": Object.freeze([]),", breaks: "S2" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.685.1\"", breaks: "Z1/Z2" },
  { name: "the download names the last release", file: SJ, from: "releases/download/v3.686.2/trg-prime.zip", to: "releases/download/v3.685.1/trg-prime.zip", breaks: "Z2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3685-2.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3685-2: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3685-2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3685-2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
