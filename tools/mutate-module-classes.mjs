#!/usr/bin/env node
/**
 * mutate-module-classes — eleven mutations against verify-module-classes.mjs.
 *
 * Each is a way the 3.563.0 class support could quietly stop working
 * while every file still parsed: the schedule flag ignored, the chooser
 * never reached from Use, the stamp dropped, the specialist gate
 * narrowed back to foundations, a grant field lost, a class-name gate
 * that forgets the registry. Each must turn the verify red.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const REP = path.join(SYSTEM_ROOT, "module", "magic", "repertoire.mjs");
const REPW = path.join(SYSTEM_ROOT, "module", "magic", "repertoire-workflow.mjs");
const FW = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const SPEC = path.join(SYSTEM_ROOT, "module", "specialist-grants.mjs");
const GRANTS = path.join(SYSTEM_ROOT, "module", "grants-workflow.mjs");
const AUTORUN = path.join(SYSTEM_ROOT, "module", "grant-autorun.mjs");
const PF = path.join(SYSTEM_ROOT, "module", "picker-filters.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");

const MUTATIONS = [
  {
    name: "the schedule flag is read but never used for picks",
    file: REP,
    from: "  return REPERTOIRE_FIRST_PICKS + stepsGranted(value, schedule.pickFrom, schedule.pickStep);",
    to: "  return REPERTOIRE_FIRST_PICKS + stepsGranted(value, 3, 2);",
    breaks: "A5 — a Grimward would get the Bard's picks"
  },
  {
    name: "the schedule's swap half is ignored",
    file: REP,
    from: "  return stepsGranted(value, schedule.swapFrom, schedule.swapStep);",
    to: "  return stepsGranted(value, 5, 2);",
    breaks: "A6 — a Healer's one-swap-a-level never arrives"
  },
  {
    name: "a malformed step is accepted as zero",
    file: REP,
    from: "    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_REPERTOIRE_SCHEDULE[key];",
    to: "    return Number.isFinite(n) ? n : DEFAULT_REPERTOIRE_SCHEDULE[key];",
    breaks: "A7 — a pickStep of 0 would divide the ladder by zero"
  },
  {
    name: "the card's next-level markers go back to parity arithmetic",
    file: REP,
    from: "    nextPickLevel: lvl < 1 ? 1 : nextStep(lvl, schedule.pickFrom, schedule.pickStep),",
    to: "    nextPickLevel: lvl < 1 ? 1 : lvl >= 19 ? null : lvl + (lvl % 2 === 0 ? 1 : 2),",
    breaks: "A11 — the Healer's card would say 7 at 5th"
  },
  {
    name: "the workflow stops reading the class's schedule",
    file: REPW,
    from: "    schedule: repertoireSchedule(classItem)",
    to: "    schedule: undefined",
    breaks: "A15 — the flag would be data nothing reads"
  },
  {
    name: "useFeat never reaches the declared chooser",
    file: FW,
    from: "  if (!automation && abilityChoicesOf(item)) {",
    to: "  if (false) {",
    breaks: "B11 — a discipline chooser's Use says 'no automated action'"
  },
  {
    name: "the chooser stops stamping the granted ability",
    file: FW,
    from: "  foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {\n    sourceId: item.id, sourceName: item.name, requested: picked\n  });",
    to: "",
    breaks: "B13 — the discipline would outlive its chooser and be chosen twice"
  },
  {
    name: "the printed field counts as a declaration for any item",
    file: SPEC,
    from: "  return typeof literal === \"string\" && parseSpecialistList(literal).length > 0;",
    to: "  return (typeof literal === \"string\" && parseSpecialistList(literal).length > 0) || Boolean(sourceItem?.system?.specialistSkill);",
    breaks: "C4 — forty feats' specialistSkill text would become grants"
  },
  {
    name: "the apply side narrows back to foundations",
    file: GRANTS,
    from: "  if (FOUNDATION_ITEM_TYPES.includes(sourceItem.type) || declaresSpecialistSkills(sourceItem)) {",
    to: "  if (FOUNDATION_ITEM_TYPES.includes(sourceItem.type)) {",
    breaks: "C7 — Folk Lore would never land"
  },
  {
    name: "a class stops granting spells",
    file: GRANTS,
    from: "    { field: \"grantedSpells\", pack: \"spells\", levelled: true }\n  ],",
    to: "  ],",
    breaks: "D2 — the Healer's Cure and Restoration would never arrive"
  },
  {
    name: "an ability's arrival no longer applies its grants",
    file: AUTORUN,
    from: "  // A class ability's own grants (3.563.0) — see GRANT_FIELDS.ability.\n  \"ability\"",
    to: "  // (mutated)",
    breaks: "D3 — a discipline's specialist spell belongs to nobody"
  },
  {
    name: "barredClasses forgets the registry",
    file: PF,
    from: "    if (CLASS_NAMES.includes(name) || registeredClassNames().includes(name)) barred.push(name);",
    to: "    if (CLASS_NAMES.includes(name)) barred.push(name);",
    breaks: "D10 — 'Non-Healer' would bar nobody"
  },
  {
    name: "the sheet's gate list drops abilities",
    file: SHEET,
    from: "      .map((i) => i.name)\n      .concat(abilityNames);",
    to: "      .map((i) => i.name);",
    breaks: "D15 — Read the Signs would be offered to nobody"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-module-classes.mjs")], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([REP, REPW, FW, SPEC, GRANTS, AUTORUN, PF, SHEET]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-module-classes: verify-module-classes already fails on an unmodified tree. Fix that first.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${occurrences})` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-module-classes: FAILED — ${bad.length} of ${results.length} mutations were not caught.\n`
    : `\nmutate-module-classes: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
