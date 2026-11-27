#!/usr/bin/env node
/**
 * mutate-fixes-3718-1 — can verify-fixes-3718-1 fail? NEW at 3.718.1.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CASTWF = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const SIZE = path.join(SYSTEM_ROOT, "module", "magic", "size-step.mjs");
const GRANT = path.join(SYSTEM_ROOT, "module", "magic", "granted-ability.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3718-1.mjs");

const MUTATIONS = [
  { file: CASTWF, name: "the picker asks the item again", from: "  if (spellNeedsTarget(castShape, spell) && !storingNow && !reaction?.presetTargets && !presetTargets) {",
    to: "  if (spellNeedsTarget(spellData, spell) && !storingNow && !reaction?.presetTargets && !presetTargets) {", breaks: "A2" },
  { file: CASTWF, name: "the count is the item's again", from: "targetCapFor(castShape?.targets, warp.mods, casterLevel)",
    to: "targetCapFor(apMode?.targets ?? spellData?.targets, warp.mods, casterLevel)", breaks: "A3" },
  { file: CASTWF, name: "an area mode keeps the item's targets",
    from: "targets: apMode.targets ?? (String(effArea ?? \"\").trim() ? \"\" : spellData.targets) }",
    to: "targets: apMode.targets ?? spellData.targets }", breaks: "A1" },
  { file: SIZE, name: "a disabled size effect still counts", from: "    if (!effect || effect.disabled) continue;", to: "    if (!effect) continue;", breaks: "B2" },
  { file: EFFECTS, name: "the steps are never stamped", from: "            sizeData.flags[SYSTEM_ID][EQUIPMENT_SIZE_FLAG] = steps;", to: "", breaks: "B6" },
  { file: EFFECTS, name: "the card is silent about the die", from: " Its weapons' damage die ", to: " The die ", breaks: "B7" },
  { file: AW, name: "the weapon never grows", from: "    if (grown) strikeBase = steppedCreatureDamage(strikeBase, grown) ?? strikeBase;", to: "", breaks: "B8" },
  { file: AW, name: "a fist grows like a sword", from: "    const grown = weapon?.type === \"weapon\" && !unarmed?.damage && !isUnarmedAttack(weaponData) ? equipmentSizeSteps(actor) : 0;",
    to: "    const grown = equipmentSizeSteps(actor);", breaks: "B8" },
  { file: AW, name: "the formula ignores the grown dice", from: "  let formula = buildWeaponDamageFormula(strikeBase, {",
    to: "  let formula = buildWeaponDamageFormula(handAndAHalfDamage ?? damageOverride ?? weaponData.damage, {", breaks: "B9" },
  { file: GRANT, name: "the caster's own spell counts as the ability again", from: "item?.type !== \"spell\" && ", to: "", breaks: "C1" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([CASTWF, EFFECTS, AW, SIZE, GRANT, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-fixes-3718-1: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
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
    ? `\nmutate-fixes-3718-1: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-fixes-3718-1: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
