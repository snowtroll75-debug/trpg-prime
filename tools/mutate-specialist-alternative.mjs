#!/usr/bin/env node
/** mutate-specialist-alternative — the mutation half of verify-specialist-alternative. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const SG = m("specialist-grants.mjs"), FW = m("feats-workflow.mjs"), GW = m("grants-workflow.mjs");
const MUTATIONS = [
  { name: "no declaration is needed", file: SG, from: "  if (!alternative || typeof alternative !== \"object\") return [];\n", to: "", breaks: "A4" },
  { name: "the item counts as its own other source", file: SG, from: "    if (!other || other === item || (item?.id && other.id === item.id)) continue;", to: "    if (!other) continue;", breaks: "A3" },
  { name: "case is not ignored", file: SG, from: "  return mine.filter((name) => elsewhere.has(String(name).trim().toLowerCase()));", to: "  return mine.filter((name) => elsewhere.has(String(name)));", breaks: "A5" },
  { name: "the Use button never asks", file: FW, from: "  if (alternativeDeclared) did = await useSpecialistAlternative(actor, item) || did;\n", to: "", breaks: "B1" },
  { name: "the chooser ignores the override", file: FW, from: "  const choice = choiceOverride ?? item?.getFlag?.(SYSTEM_ID, \"specialistChoice\");", to: "  const choice = item?.getFlag?.(SYSTEM_ID, \"specialistChoice\");", breaks: "B3" },
  { name: "Apply Grants keeps naming a chosen alternative", file: GW, from: "      if ((actor.getFlag?.(\"trg-prime\", \"backgroundChoiceKeys\") ?? {})[carrier.id]?.some?.(Boolean)) continue;\n", to: "", breaks: "B4" },
  { name: "the generic nudge names it twice", file: GW, from: "    const alreadyNamed = [\"specialistChoice\", \"skillChoice\", \"spellChoice\", \"specialistAlternative\"]", to: "    const alreadyNamed = [\"specialistChoice\", \"skillChoice\", \"spellChoice\"]", breaks: "B5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-specialist-alternative.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-specialist-alternative: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-specialist-alternative: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-specialist-alternative: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
