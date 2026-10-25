#!/usr/bin/env node
/** mutate-attack-forms — the mutation half of verify-attack-forms. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const UP = m("combat", "unarmed-profile.mjs"), CD = m("conditionals.mjs"), AW = m("combat", "attack-workflow.mjs"), CK = m("dice", "check.mjs");
const MUTATIONS = [
  { name: "nothing counts as unarmed", file: UP, from: "  if (countsAsUnarmed(weaponSystem)) return \"unarmed\";\n", to: "", breaks: "A1" },
  { name: "a claw counts as unarmed", file: UP, from: "  if (weaponSystem?.natural) return \"natural\";\n  return \"weapon\";", to: "  if (weaponSystem?.natural) return \"unarmed\";\n  return \"weapon\";", breaks: "A4" },
  { name: "everything else is natural", file: UP, from: "  if (weaponSystem?.natural) return \"natural\";\n  return \"weapon\";", to: "  return \"natural\";", breaks: "A5" },
  { name: "the axis is not declared", file: CD, from: "  \"attackForms\",\n  // THE WEAPON'S GROUP", to: "  // THE WEAPON'S GROUP", breaks: "B1" },
  { name: "the axis's context key is misspelt", file: CD, from: "  attackForms: \"attackForm\",\n", to: "  attackForms: \"attackForms\",\n", breaks: "B1" },
  { name: "THE DEFECT: the axis is never tested", file: CD, from: "  if (wantedAttackForms && !wantedAttackForms.some((t) => attackForms.includes(t))) return false;\n", to: "", breaks: "B4" },
  { name: "a roll with no form matches anything", file: CD, from: "  if (wantedAttackForms && !wantedAttackForms.some((t) => attackForms.includes(t))) return false;\n", to: "  if (wantedAttackForms && attackForms.length && !wantedAttackForms.some((t) => attackForms.includes(t))) return false;\n", breaks: "B6" },
  { name: "the form is read case-sensitively", file: CD, from: "  const attackForms = [String(context.attackForm ?? \"\").trim().toLowerCase()].filter(Boolean);", to: "  const attackForms = [String(context.attackForm ?? \"\").trim()].filter(Boolean);", breaks: "B7" },
  { name: "an exclusion on the axis is ignored", file: CD, from: "  if (excludes(excluded.attackForms, attackForms)) return false;\n", to: "", breaks: "B8" },
  { name: "THE LIVE DEFECT: the attack does not say what it is struck with", file: AW, from: "    attackForm: attackFormOf(abilityData),\n", to: "", breaks: "C1" },
  { name: "every attack is unarmed", file: AW, from: "    attackForm: attackFormOf(abilityData),\n", to: "    attackForm: \"unarmed\",\n", breaks: "C1" },
  { name: "the check drops it", file: CK, from: "    this.attackForm = config.attackForm ?? \"\";\n", to: "", breaks: "C3" },
  { name: "the automatic conditionals never hear it", file: CK, from: "          targetTraits: check.targetTraits,\n          attackForm: check.attackForm,\n", to: "          targetTraits: check.targetTraits,\n", breaks: "C4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-attack-forms.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-attack-forms: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-attack-forms: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-attack-forms: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
