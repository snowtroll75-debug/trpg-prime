#!/usr/bin/env node
/**
 * mutate-healing-riders — six mutations against verify-healing-riders.mjs:
 * the half-HP test read as strictly below, the self exclusion dropped, the
 * minimum of 1 dropped, the once-per-round marker ignored, the maximise
 * transform maximising nothing, and healActor refusing a Dying heal with
 * dyingHalf.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const H = path.join(SYSTEM_ROOT, "module", "magic", "healing-riders.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const MUTATIONS = [
  { name: "half HP read as strictly below", file: H, from: "const low = targetMax > 0 && targetHp <= Math.floor(targetMax / 2);", to: "const low = targetMax > 0 && targetHp < Math.floor(targetMax / 2);", breaks: "C3" },
  { name: "the self exclusion is dropped", file: H, from: "if (r.lowHalfBonus && low && !self) {", to: "if (r.lowHalfBonus && low) {", breaks: "C4" },
  { name: "the minimum of 1 is dropped", file: H, from: "Math.max(1, Math.floor(Math.max(0, Number(casterLevel) || 0) / 2))", to: "Math.floor(Math.max(0, Number(casterLevel) || 0) / 2)", breaks: "C5" },
  { name: "the once-per-round marker is ignored", file: H, from: "    if (r.oncePerRound && used?.[r.id]) continue;\n", to: "", breaks: "C7" },
  { name: "the transform maximises nothing", file: H, from: "  const replacement = rest > 0 ? `${rest}d${faces} + ${faces}` : `${faces}`;", to: "  const replacement = m[0];", breaks: "B1" },
  { name: "the marker is read outside combat too (Vital Surge once a day)", file: E, from: "  const ridersUsed = ridersClocked ? (caster?.getFlag?.(SYSTEM_ID, HEALING_RIDERS_USED_FLAG) ?? {}) : {};", to: "  const ridersUsed = caster?.getFlag?.(SYSTEM_ID, HEALING_RIDERS_USED_FLAG) ?? {};", breaks: "D5" },
  { name: "healActor refuses a Dying heal despite dyingHalf", file: E, from: "    if (!rule.healsHP && !dyingHalf) return 0;", to: "    if (!rule.healsHP) return 0;", breaks: "D2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-healing-riders.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([H, E]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-healing-riders: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-healing-riders: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-healing-riders: OK — all ${results.length} mutations caught, tree restored.\n`);
