#!/usr/bin/env node
/**
 * mutate-rolled-auras-sunlight — the mutation half of verify-rolled-auras-sunlight.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CA = m("creature-auras.mjs"), AW = m("creature-aura-workflow.mjs"), DA = m("combat", "declared-after-strikes.mjs");
const SU = m("sunlight.mjs"), SW = m("sunlight-workflow.mjs"), TS = m("creature-turn-start-workflow.mjs"), CB = m("documents", "combat.mjs");
const MUTATIONS = [
  { name: "every aura with a save rolls, Codex ones included", file: CA, from: "  return Boolean(aura?.save && ((aura?.conditions && Object.keys(aura.conditions).length) || aura?.damage || aura?.traitEffect));", to: "  return Boolean(aura?.save);", breaks: "A2" },
  { name: "living-only is dropped in normalising", file: CA, from: "    livingOnly: raw.livingOnly === true,", to: "    livingOnly: false,", breaks: "A1" },
  { name: "the partial window drops nothing", file: CA, from: "    .filter((row) => !partial || String(row.key).trim().toLowerCase() !== partial)\n", to: "", breaks: "A5" },
  { name: "the window opens whatever the result", file: CA, from: "  return aura.immunityOn === \"success\" ? Boolean(degreeSucceeded) : true;", to: "  return true;", breaks: "A8" },
  { name: "the slowed outlasts the sickened", file: DA, from: "  if (row?.endsWith) tag.endsWith = String(row.endsWith).trim();\n", to: "", breaks: "A3" },
  { name: "the collapse is lost", file: DA, from: "  if (row?.zeroHP === true || tag.key === \"zeroHP\") tag.zeroHP = true;", to: "  if (row?.zeroHP === true) tag.zeroHP = true;", breaks: "A7" },
  { name: "the rolled aura is never rolled", file: AW, from: "  const rolled = auraRolls(aura) ? await rollAuraSave(subjectToken, aura, emitterToken) : null;", to: "  const rolled = null;", breaks: "A9" },
  { name: "the save is always against a flat 10", file: AW, from: "  const dc = aura.dc || levelDC(emitterLevel);", to: "  const dc = aura.dc || 10;", breaks: "A10" },
  { name: "the token's word does not beat the scene's", file: SU, from: "  if (token === \"shade\") return \"shade\";\n", to: "", breaks: "B1" },
  { name: "the sun takes away an injury it did not give", file: SU, from: "    if (now > value) continue;\n", to: "", breaks: "B3" },
  { name: "the old card is posted in the sun too", file: TS, from: "      if (state === \"sun\") { await applySunlightAtTurnStart(tokenDocument, a); continue; }", to: "      if (state === \"sun\") { await applySunlightAtTurnStart(tokenDocument, a); }", breaks: "B5" },
  { name: "the weakness is re-applied every turn", file: SW, from: "  if (!actor.getFlag?.(SYSTEM_ID, SUNLIGHT_STATE_FLAG)?.active) {\n    const before = ", to: "  if (true) {\n    const before = ", breaks: "B6" },
  { name: "Fast Healing ignores the sun", file: CB, from: "      .filter((e) => !(sunlit && suppressedInSunlight(e)))\n", to: "", breaks: "B8" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-rolled-auras-sunlight.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-rolled-auras-sunlight: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-rolled-auras-sunlight: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-rolled-auras-sunlight: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
