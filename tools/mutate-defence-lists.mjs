#!/usr/bin/env node
/** mutate-defence-lists — the mutation half of verify-defence-lists. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DL = m("defence-lists.mjs"), ACT = m("documents", "actor.mjs"), SH = m("sheets", "actor-sheet.mjs"), MG = m("migration.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const MUTATIONS = [
  { name: "THE ECHO: the tidy keeps repeats", file: DL, from: "    if (seen.has(key)) continue;\n", to: "", breaks: "A2/A3" },
  { name: "the tidy forgets the first spelling", file: DL, from: "    out.push(entry);\n  }\n  return out.join(\", \");", to: "    out.push(key);\n  }\n  return out.join(\", \");", breaks: "A2" },
  { name: "granted counts what was typed too", file: DL, from: "filter((entry) => !typed.has(norm(entry)));", to: "filter(() => true);", breaks: "A4/A5" },
  { name: "every list is treated as baked", file: DL, from: "  if (new Set(keys).size === keys.length) return null;\n", to: "", breaks: "A8" },
  { name: "a baked list keeps the effects' entries", file: DL, from: ".filter((entry) => !fromEffects.has(norm(entry)));\n  return cleaned", to: ";\n  return cleaned", breaks: "A6/A7" },
  { name: "an effect counts for every list", file: DL, from: "  if (String(change?.key ?? \"\") !== `system.combat.${key}`) return [];\n", to: "", breaks: "A10" },
  { name: "the derived lists keep repeats", file: ACT, from: "system.combat[key] = tidyDefenceList(system.combat[key]);", to: "system.combat[key] = String(system.combat[key]);", breaks: "B1" },
  { name: "THE COMPOUNDING: the sheet reads the derived lists again", file: SH, from: "const storedCombat = actor._source?.system?.combat ?? {};", to: "const storedCombat = system.combat ?? {};", breaks: "C1" },
  { name: "nothing granted is worked out", file: SH, from: "[key, grantedDefenceEntries(system.combat?.[key], storedCombat[key]).join(\", \")]", to: "[key, \"\"]", breaks: "C2" },
  { name: "the immunities box is filled from the derived value", file: HBS, from: "value=\"{{defenceStored.immunities}}\"", to: "value=\"{{system.combat.immunities}}\"", breaks: "C3" },
  { name: "the resistances box is filled from the derived value", file: HBS, from: "value=\"{{defenceStored.resistances}}\"", to: "value=\"{{system.combat.resistances}}\"", breaks: "C3" },
  { name: "the weaknesses box is filled from the derived value", file: HBS, from: "value=\"{{defenceStored.weaknesses}}\"", to: "value=\"{{system.combat.weaknesses}}\"", breaks: "C3" },
  { name: "the granted immunities are not shown", file: HBS, from: "Also from effects: {{defenceGranted.immunities}}", to: "", breaks: "C4" },
  { name: "the migration reads the derived lists", file: MG, from: "    const stored = actor?._source?.system?.combat;", to: "    const stored = actor?.system?.combat;", breaks: "D1" },
  { name: "a disabled effect still counts as granting", file: MG, from: "        .filter((e) => !e?.disabled)\n        .flatMap((e) => Array.from(e?.changes", to: "        .flatMap((e) => Array.from(e?.changes", breaks: "D1" },
  { name: "every list is rewritten", file: MG, from: "      if (cleaned === null || cleaned === stored[key]) continue;\n", to: "", breaks: "D2" },
  { name: "the pass is never run", file: MG, from: "    () => migrateBakedDefenceLists(actors, tokenActors))) ?? [];", to: "    () => [])) ?? [];", breaks: "D3" },
  { name: "the stamp stays where it was", file: MG, from: "export const TRG_SCHEMA_VERSION = \"3.666.4\";", to: "export const TRG_SCHEMA_VERSION = \"3.666.3\";", breaks: "D4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-defence-lists.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-defence-lists: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-defence-lists: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-defence-lists: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
