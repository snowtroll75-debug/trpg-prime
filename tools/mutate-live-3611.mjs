#!/usr/bin/env node
/**
 * mutate-live-3611 — can verify-live-3611 fail?
 *
 * NEW at 3.611.1. Each mutation puts back one of the defects the 3.611.0
 * drive found. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const PLANF = at("tools", "block34-plan.mjs");
const DEATH = at("module", "combat", "death-state.mjs");
const EFFECTS = at("module", "magic", "spell-effects.mjs");
const GATE = at("module", "magic", "condition-warp.mjs");
const SLOT = at("module", "magic", "slot-choice.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const CASTING = at("module", "magic", "casting.mjs");
const SPARE = at("module", "magic", "caster-in-area.mjs");
const VERIFY = at("tools", "verify-live-3611.mjs");

const MUTATIONS = [
  { file: PLANF, name: "F1 — the immunity names all seven degrees again",
    from: "const PRINTED_DEGREES = [\"critical\", \"success\", \"failure\", \"fumble\"];",
    to: "const PRINTED_DEGREES = [\"heroic\", \"critical\", \"success\", \"partial\", \"failure\", \"fumble\", \"blunder\"];", breaks: "A1/A2" },
  { file: DEATH, name: "F2 — the no-fatigue recovery writes Fatigued 0",
    from: "  if (!noFatigue) await actor.toggleStatusEffect(\"fatigued\", { value: state.fatigued });",
    to: "  await actor.toggleStatusEffect(\"fatigued\", { value: state.fatigued });", breaks: "B1" },
  { file: EFFECTS, name: "F3 — a relief reads the suppressed value",
    from: "            target.conditions?.rawValues?.get?.(relief.condition)\n            ?? target.getConditionValue?.(relief.condition) ?? 0));",
    to: "            target.getConditionValue?.(relief.condition) ?? 0));", breaks: "C1" },
  { file: GATE, name: "F3 — a superseded row still applies",
    from: "  if (supersededBy && bought.includes(supersededBy)) return false;", to: "", breaks: "C2/C4" },
  { file: PLANF, name: "F3 — Banish Fatigue's ignoring is not superseded",
    from: ", label: \"Banish Fatigue\", supersededBy: \"permanent\" },", to: ", label: \"Banish Fatigue\" },", breaks: "C3/C4" },
  { file: SLOT, name: "G1 — a mental choice asks for a saving throw",
    from: "  if (text(chooseFrom) === \"mental\") {", to: "  if (false) {", breaks: "D1/D3" },
  { file: EFFECTS, name: "G1 — the prompt is not given the words",
    from: "await promptSlotChoice(spell.name, choice.options, count, slotChoiceWords(choice.chooseFrom)));",
    to: "await promptSlotChoice(spell.name, choice.options, count));", breaks: "D4" },
  { file: CAST, name: "G2 — a chosen area is not capped",
    from: "            if (areaCap > 0 && areaTargets.length > areaCap) {", to: "            if (false) {", breaks: "E1" },
  { file: PLANF, name: "G2 — Wits is not chosen",
    from: "  Wits: {\n    areaChoice: true,\n", to: "  Wits: {\n", breaks: "E2" },
  { file: CASTING, name: "G3 — a reached Success resists again",
    from: "  if (saved && reachedOnSave) return `${head}is affected even so.`;\n", to: "", breaks: "F3" },
  { file: CASTING, name: "G3 — immunities count as affected",
    from: "e.kind !== \"note\" && e.kind !== \"tempImmunity\");", to: "e.kind !== \"note\");", breaks: "F2" },
  { file: CAST, name: "G3 — the cast does not tell the line",
    from: "          reachedOnSave: saved && savedRungActs(spellData.effects, degreeKey)\n", to: "", breaks: "F4" },
  { file: EFFECTS, name: "G4 — the choice line once per recipient",
    from: "            if (chosenLine && !castChoices.has(`slotSaid:${effects.indexOf(effect)}`)) {", to: "            if (chosenLine) {", breaks: "G1" },
  { file: SPARE, name: "Q1 — every caster-centred area catches the caster again",
    from: "  if (!centredOnCaster) return false;", to: "  return false;", breaks: "H1/H2" },
  { file: SPARE, name: "Q1 — a beneficial area spares the caster too",
    from: "  return asksSave || cat === \"save\" || cat === \"attack\";", to: "  return true;", breaks: "H3/H5" },
  { file: CAST, name: "Q1 — the cast never asks",
    from: "          .filter((tok) => !(sparesCaster && casterToken && tok === casterToken))\n", to: "", breaks: "H6" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-live-3611 does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-live-3611: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-live-3611: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
