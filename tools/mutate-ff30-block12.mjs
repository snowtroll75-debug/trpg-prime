#!/usr/bin/env node
/**
 * mutate-ff30-block12 — the mutation half of verify-ff30-block12 (3.642.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const DM = path.join(SYSTEM_ROOT, "module", "combat", "damage.mjs");
const MUTATIONS = [
  { name: "one immunity stops coldfire", file: DM, from: '  const immune = has(immunities, "cold") && has(immunities, "fire");', to: '  const immune = has(immunities, "cold") || has(immunities, "fire");', breaks: "C1" },
  { name: "an immunity does not cover its element", file: DM, from: '  const covers = (el) => has(immunities, el) || has(resistances, el);', to: "  const covers = (el) => has(resistances, el);", breaks: "C1" },
  { name: "one resistance halves coldfire", file: DM, from: '    resisted: !immune && covers("cold") && covers("fire"),', to: '    resisted: !immune && (covers("cold") || covers("fire")),', breaks: "C1" },
  { name: "weakness needs both", file: DM, from: '    weak: has(weaknesses, "cold") || has(weaknesses, "fire")', to: '    weak: has(weaknesses, "cold") && has(weaknesses, "fire")', breaks: "C1" },
  { name: "the traits still carry cold and fire", file: DM, from: "  if (coldfire) sourceTraits = Array.from(sourceTraits ?? []).filter((t) => !/^(cold|fire)$/i.test(String(t).trim()));", to: "", breaks: "C2" },
  { name: "the immunity is not read", file: DM, from: "if (has(immunities, type) || coldfire?.immune || blockingTrait", to: "if (has(immunities, type) || blockingTrait", breaks: "C2" },
  { name: "the resistance is not read", file: DM, from: "const resisted = has(resistances, type) || Boolean(coldfire?.resisted) || categoryResisted", to: "const resisted = has(resistances, type) || categoryResisted", breaks: "C3" },
  { name: "the weakness is not read", file: DM, from: "const weakened = has(weaknesses, type) || Boolean(coldfire?.weak) || materialWeak", to: "const weakened = has(weaknesses, type) || materialWeak", breaks: "C4" },
  { name: "every type is coldfire", file: DM, from: 'const coldfire = type === "coldfire" ? coldfireDefences', to: "const coldfire = type ? coldfireDefences", breaks: "C5" },
  { name: "the card hides why", file: DM, from: '? `resistance to cold and fire halves -> ${value}` :', to: '? `resistance halves -> ${value}` :', breaks: "C6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block12.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block12: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block12: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block12: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
