#!/usr/bin/env node
/**
 * mutate-block40-aspects — can verify-block40-aspects fail?
 *
 * NEW at 3.623.0. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULES = at("module", "aspect-rules.mjs");
const FEATS = at("module", "feats-workflow.mjs");
const PICKER = at("module", "picker-filters.mjs");
const ITEM = at("module", "documents", "item.mjs");
const SHEET = at("module", "sheets", "actor-sheet.mjs");
const AUTORUN = at("module", "grant-autorun.mjs");
const PROF_RULES = at("module", "proficiency-rules.mjs");
const PROFS = at("module", "proficiencies.mjs");
const VERIFY = at("tools", "verify-block40-aspects.mjs");

const MUTATIONS = [
  { file: RULES, name: "R2: THE OLD DEFECT — an aspect spell is just a class-tagged spell", from: "  if (allAspectKeys.has(key)) {\n    if (myAspectKeys.has(key)) return true;", to: "  if (false) {\n    if (myAspectKeys.has(key)) return true;", breaks: "A1/A2/A3" },
  { file: RULES, name: "R2: the word \"Cleric\" reaches another aspect's spells", from: "    return tags.some((tag) => tag !== \"cleric\" && mine.has(tag));", to: "    return tags.some((tag) => mine.has(tag));", breaks: "A2/A9" },
  { file: RULES, name: "R2: an aspect holder loses the free Cleric spells", from: "  if (holdsAspect && tags.includes(\"cleric\")) return true;\n", to: "", breaks: "A4" },
  { file: FEATS, name: "R2: the feat's filter skips the rule", from: "          if (!specialistSpellAccess({", to: "          if (!(() => true)({", breaks: "J1/(live)" },
  { file: RULES, name: "R3: Cloistered Priest reaches any Cleric-tagged aspect spell", from: "  if (allAspectKeys.has(key)) return myAspectKeys.has(key);\n  return list(specialistClass)", to: "  return list(specialistClass)", breaks: "B2" },
  { file: FEATS, name: "R3: THE OLD DEFECT — the chooser excludes specialist spells", from: "        title: \"Cloistered Priest\",\n        allowSpecialist: true,\n", to: "        title: \"Cloistered Priest\",\n", breaks: "B4" },
  { file: RULES, name: "R8: no specialist spell is hidden", from: "  if (!entry?.system?.specialist) return true;", to: "  return true;", breaks: "C2" },
  { file: PICKER, name: "R8: the tradition filter skips the specialist gate", from: "        if (!specialistOk(entry)) return false;\n", to: "", breaks: "C2/C6" },
  { file: PICKER, name: "R8: no tradition means no gate at all", from: "      if (!tradition) return specialistAccess ? specialistOk : null;", to: "      if (!tradition) return null;", breaks: "C7" },
  { file: RULES, name: "R4: a Fighter's chosen tradition makes it a caster", from: "    || (!classDeclinesAspect && String(classTradition ?? \"\").trim().toLowerCase() === \"divinity\" && String(classCasterStyle ?? \"\").trim()))) {", to: "    || (!classDeclinesAspect && String(classTradition ?? \"\").trim().toLowerCase() === \"divinity\"))) {", breaks: "D3" },
  { file: RULES, name: "R4: the Champion is not a divinity source", from: "const DIVINITY_ARCHETYPES = Object.freeze([\"priest\", \"champion\", \"cloistered priest\"]);", to: "const DIVINITY_ARCHETYPES = Object.freeze([\"priest\", \"cloistered priest\"]);", breaks: "D4" },
  { file: RULES, name: "R4: the banner stays with one aspect held", from: "  if (!sources.length || aspectCount > 0) return null;", to: "  if (!sources.length || aspectCount > 1) return null;", breaks: "D7" },
  { file: ITEM, name: "R5: THE OLD DEFECT — a second aspect is created", from: "    if (this._refusedAsSecondAspect(options)) return false;\n", to: "", breaks: "E4" },
  { file: RULES, name: "R5: a repair tool cannot declare itself", from: "  if (options?.trgAllowSecondAspect) return null;\n", to: "", breaks: "E3" },
  { file: RULES, name: "R6: an off-list ethic vanishes from the dropdown", from: "  if (current && !keys.includes(current) && ethics[current]) {", to: "  if (false) {", breaks: "F2" },
  { file: SHEET, name: "R6: the sheet offers all fifteen", from: "    context.ethicsChoices = ethicsView.choices;", to: "    context.ethicsChoices = { \"\": \"—\" };", breaks: "F6" },
  { file: RULES, name: "R7: a spell AT the level is taken back too", from: "    .filter((e) => Number(e.level) > lvl)", to: "    .filter((e) => Number(e.level) >= lvl)", breaks: "G2" },
  { file: RULES, name: "R7: another aspect's grant is taken back", from: "      && s.grantedBy?.sourceId === aspect.id\n", to: "\n", breaks: "G3" },
  { file: RULES, name: "R7: the specialist pick is taken back", from: "    .filter((s) => !s.specialistPick\n      && s.grantedBy", to: "    .filter((s) => true\n      && s.grantedBy", breaks: "G1/G3" },
  { file: AUTORUN, name: "R7: THE OLD DEFECT — the level hook never prunes", from: "    const pruned = await pruneAspectBonusSpells(actor);", to: "    const pruned = [];", breaks: "G5" },
  { file: PROF_RULES, name: "R10: only the class table grants the favoured weapon", from: "  if (deityWeaponsApply(entry, items)) {", to: "  if (entry?.deityWeapons) {", breaks: "H4" },
  { file: PROF_RULES, name: "R10: the Deific Aspect ability counts for nothing", from: "  if (entry?.deityWeapons) return true;\n  return Array.from(items ?? []).some(", to: "  if (entry?.deityWeapons) return true;\n  return false && Array.from(items ?? []).some(", breaks: "H2/H4" },
  { file: PROFS, name: "R10: the summary lists the weapon for everyone", from: "  for (const item of deityWeapons ? items : []) {", to: "  for (const item of items) {", breaks: "H6" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-block40-aspects: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-block40-aspects: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block40-aspects: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
