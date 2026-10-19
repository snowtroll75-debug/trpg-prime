#!/usr/bin/env node
/**
 * mutate-ff30-block33 — the mutation half of verify-ff30-block33 (3.663.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const SS = m("combat", "spiteful-strike.mjs"), WF = m("spiteful-strike-workflow.mjs"), CH = m("codex-hooks-workflow.mjs");
const MUTATIONS = [
  { name: "the named weapon is ignored", file: SS, from: "return (wanted && weapons.find(", to: "return (false && weapons.find(", breaks: "S2" },
  { name: "the whole damage heals", file: SS, from: "const heal = Math.floor(Math.max(0, Number(dealt) || 0) / 2);", to: "const heal = Math.floor(Math.max(0, Number(dealt) || 0));", breaks: "S3" },
  { name: "the heal is not capped", file: SS, from: "const hp = Math.min(Math.max(0, Number(maxHP) || 0), heal);", to: "const hp = heal;", breaks: "S3" },
  { name: "the rule is read from any ability", file: SS, from: "    if (!rule) continue;", to: "    if (false) continue;", breaks: "S1" },
  { name: "no reaction is spent", file: WF, from: '  await spendReaction(actor, "Spiteful Strike", { traits: "attack" });\n', to: "", breaks: "W1" },
  { name: "the corpse makes the Strike (3.663.0 as shipped)", file: WF, from: '  for (const key of ["dead", "dying", "unconscious", "prone"]) if (actor.statuses?.has?.(key)) await actor.toggleStatusEffect(key, { active: false });\n  const { spendReaction }', to: '  const { spendReaction }', breaks: "W2" },
  { name: "a destroyed Wight keeps no skull", file: WF, from: '    if (lying.dead) await actor.toggleStatusEffect("dead", { active: true, overlay: true });\n', to: "", breaks: "W2" },
  { name: "a survivor stays skulled (3.663.1 as shipped)", file: WF, from: '    for (const key of ["dead", "dying", "unconscious", "prone"]) if (actor.statuses?.has?.(key)) await actor.toggleStatusEffect(key, { active: false });\n    lines.push', to: '    lines.push', breaks: "W2b" },
  { name: "a survivor's HP is not written", file: WF, from: '    await actor.update({ "system.resources.hp.value": outcome.hp });', to: '    void outcome.hp;', breaks: "W2b" },
  { name: "the button can be pressed twice", file: WF, from: "      if (data.used) { btn.disabled = true; return; }\n", to: "", breaks: "W3" },
  { name: "the kill never offers it", file: CH, from: "  await offerSpitefulStrike(victim);", to: "  void offerSpitefulStrike;", breaks: "H1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block33.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block33: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block33: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block33: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
