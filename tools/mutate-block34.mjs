#!/usr/bin/env node
/**
 * mutate-block34 — can verify-block34 fail?
 *
 * NEW at 3.611.0. Each mutation puts back a defect the block's audit found,
 * or breaks one of the channels built to answer it. SURVIVED and an
 * unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const GATE = at("module", "magic", "condition-warp.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const HELD = at("module", "magic", "held-bonus.mjs");
const CHOICE = at("module", "magic", "defence-choice.mjs");
const UPGRADE = at("module", "magic", "damage-die-upgrade.mjs");
const ABILITY = at("module", "magic", "spell-damage-ability.mjs");
const PENALTY = at("module", "combat", "dr-penalty.mjs");
const BLEED = at("module", "magic", "bleed-relief.mjs");
const SLOT = at("module", "magic", "slot-choice.mjs");
const DURATION = at("module", "magic", "effect-duration.mjs");
const LIGHTS = at("module", "light-sources.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const EFFECTS = at("module", "magic", "spell-effects.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const RELAY = at("module", "combat", "target-relay.mjs");
const VERIFY = at("tools", "verify-block34.mjs");

const MUTATIONS = [
  { file: GATE, name: "a condition warp has no ceiling",
    from: "  return ceiling > 0 ? Math.max(base, Math.min(grown, ceiling)) : grown;", to: "  return grown;", breaks: "A3" },
  { file: GATE, name: "a ceiling lowers what the row gave",
    from: "Math.max(base, Math.min(grown, ceiling))", to: "Math.min(grown, ceiling)", breaks: "A4" },
  { file: GATE, name: "an unlocked row applies without its warp",
    // RE-ANCHORED 3.611.1: one line now that `supersededBy` reads `bought` too.
    from: "  if (unlockedBy && !bought.includes(unlockedBy)) return false;\n", to: "", breaks: "A9" },
  { file: GATE, name: "Number(null) is a PP total again",
    from: "  const pp = totalPP === null || totalPP === undefined || totalPP === \"\" ? NaN : Number(totalPP);",
    to: "  const pp = Number(totalPP);", breaks: "A12" },
  { file: GATE, name: "14 PP is not yet 14",
    from: "pp < Number(effect.ppAtLeast)", to: "pp <= Number(effect.ppAtLeast)", breaks: "A10/A13" },
  { file: WARP, name: "a condition warp bought twice counts once",
    from: "    if (m.conditionBump) mods.conditionBump += Number(m.conditionBump) * times;",
    to: "    if (m.conditionBump) mods.conditionBump = Number(m.conditionBump);", breaks: "B1" },
  { file: WARP, name: "the last unlock replaces the others",
    from: "      mods.unlocks = [...new Set([...mods.unlocks, ...m.unlocks.map((u) => String(u))])];",
    to: "      mods.unlocks = m.unlocks.map((u) => String(u));", breaks: "B4" },
  { file: WARP, name: "the die step has no ceiling",
    from: "  if (m.heldDieStep && m.heldDieFrom) return heldDieStepMaxTimes(m.heldDieFrom, m.heldDieStep);\n", to: "", breaks: "B8" },
  { file: HELD, name: "the die step is ignored",
    from: "      const faces = at < 0 ? Number(m[2]) : DIE_STEPS[Math.min(DIE_STEPS.length - 1, at + steps)];",
    to: "      const faces = Number(m[2]);", breaks: "C2/C3" },
  { file: HELD, name: "any check type is accepted",
    from: "    .filter((c) => CHECK_TYPES.includes(c));", to: "    .filter(Boolean);", breaks: "C6" },
  { file: CHOICE, name: "a pick off the list is applied",
    from: "  return Array.isArray(choices) && choices.includes(p) ? p : defaultDefenceChoice(choices);",
    to: "  return p || defaultDefenceChoice(choices);", breaks: "D3" },
  { file: UPGRADE, name: "only the first d8 grows",
    from: "`(\\\\d+)d${upgrade.from}\\\\b`, \"g\")", to: "`(\\\\d+)d${upgrade.from}\\\\b`)", breaks: "E2" },
  { file: ABILITY, name: "a negative Strength is added",
    from: "${added < 0 ? \"-\" : \"+\"} ${Math.abs(added)}", to: "+ ${added}", breaks: "F3" },
  { file: PENALTY, name: "the penalty comes off the armour first",
    from: "  const fromNatural = Math.min(natural, penalty);", to: "  const fromNatural = 0;", breaks: "G2" },
  { file: BLEED, name: "Animal Healing chooses again",
    from: "  if (warpMods?.bleedAndHeal || spec?.both) return { heal: true, bleed: points };",
    to: "  if (warpMods?.bleedAndHeal) return { heal: true, bleed: points };", breaks: "H1" },
  { file: SLOT, name: "no mental list",
    from: "saves: SAVE_SLOTS, mental: MENTAL_ATTRIBUTE_SLOTS", to: "saves: SAVE_SLOTS", breaks: "H3" },
  { file: DURATION, name: "\"the current turn\" is unreadable",
    from: "  if (/until the end of the (?:current )?turn/i.test(source)) return 1;\n", to: "", breaks: "H4" },
  { file: LIGHTS, name: "Luminance lights two steps",
    from: "  luminance: Object.freeze({\n    label: \"Luminance\", item: \"Luminance\", pack: \"spells\",\n    steps: 3,",
    to: "  luminance: Object.freeze({\n    label: \"Luminance\", item: \"Luminance\", pack: \"spells\",\n    steps: 2,", breaks: "H5" },
  { file: CAST, name: "H1: an empty area prints the hand-roll line again",
    from: "    if (!isAreaResolution) {\n      lines.push(", to: "    {\n      lines.push(", breaks: "J1" },
  { file: EFFECTS, name: "no row gate",
    from: "    if (!rowAppliesToCast(effect, warpMods, rollData?.pp ?? null)) continue;\n", to: "", breaks: "J2" },
  { file: EFFECTS, name: "a condition reads no warp",
    from: "          if (cond.valued) conditionValue = warpedConditionValue(conditionValue, warpMods, effect);\n", to: "", breaks: "J3" },
  { file: EFFECTS, name: "a held bonus is stored unwarped",
    from: "          const spec = warpedHeldBonus(authored, warpMods);", to: "          const spec = authored;", breaks: "J5" },
  { file: EFFECTS, name: "Element Ward's immunity warp is ignored",
    from: "          if (warpMods?.defenceField && effect.field === \"resistance\") {", to: "          if (false) {", breaks: "J6" },
  { file: EFFECTS, name: "a flat temp HP warp is dropped",
    from: "          const flatTemp = Math.max(0, Math.trunc(Number(warpMods?.tempHPBonus) || 0));",
    to: "          const flatTemp = 0;", breaks: "J8" },
  { file: CAST, name: "Guiding Stone adds nothing",
    from: "  const damageFormula = withDamageAbility(", to: "  const damageFormula = ((f) => ({ formula: f }))(", breaks: "J9" },
  { file: CAST, name: "an AP mode's target count is ignored",
    from: "cap: targetCapFor(apMode?.targets ?? spellData?.targets, warp.mods, casterLevel),",
    to: "cap: targetCapFor(spellData?.targets, warp.mods, casterLevel),", breaks: "J11" },
  { file: ATTACK, name: "a weapon meets full DR under Devastating Might",
    from: "    const dr = penalisedPools.armourDr;",
    to: "    const dr = effectiveDR(equippedArmourDR, targetSystem.combat?.bdb?.total ?? 0);", breaks: "J12" },
  { file: RELAY, name: "the relay drops Death's Defiance's no-fatigue recovery",
    from: "        noDyingFatigue: payload.noDyingFatigue === true,\n", to: "", breaks: "J13" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-block34 does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}
let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) { console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`); unmatched++; continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
    else console.log(`  caught    ${m.name}`);
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}
process.stdout.write(survived + unmatched
  ? `\nmutate-block34: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-block34: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
