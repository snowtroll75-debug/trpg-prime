#!/usr/bin/env node
/**
 * mutate-action-skill-choice — can the skill-choice checks fail?
 *
 * NEW at 3.593.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE TWO THAT MATTER MOST put the defect back:
 *   B2/B3  Flowing Movement loses its skills again and rolls a bare d20.
 *   D1     the sheet hands the workflow skills[0], and the prompt that
 *          exists and is correct never fires once.
 *
 * The second is the one no check caught before it was written, and it
 * is the whole reason section D exists.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "combat", "action.mjs");
const DATA = at("module", "data", "basic-actions.mjs");
const WF = at("module", "combat", "action-workflow.mjs");
const SHEET = at("module", "sheets", "actor-sheet.mjs");
const VERIFY = at("tools", "verify-action-skill-choice.mjs");

const MUTATIONS = [
  /* ── the rule ─────────────────────────────────────────────────── */
  { file: RULE, name: "a blank entry counts as a choice",
    from: `    if (!k || seen.has(k)) continue;`, to: `    if (seen.has(k)) continue;`, breaks: "A1b" },
  { file: RULE, name: "a repeated skill is offered twice",
    from: `    if (!k || seen.has(k)) continue;`, to: `    if (!k) continue;`, breaks: "A1c" },
  { file: RULE, name: "ONE skill becomes a question with one answer",
    from: `  return actionSkillChoices(action).length > 1;`,
    to: `  return actionSkillChoices(action).length > 0;`, breaks: "A2b" },
  { file: RULE, name: "a caller who already chose is asked again",
    from: `  if (String(invokedSkillKey ?? "").trim()) return false;`, to: `  ;`, breaks: "A2d" },
  { file: RULE, name: "a blank invoked key reads as a decision",
    from: `  if (String(invokedSkillKey ?? "").trim()) return false;`,
    to: `  if (invokedSkillKey !== null && invokedSkillKey !== undefined) return false;`,
    breaks: "A2e" },
  { file: RULE, name: "an attack action is asked which skill to roll",
    from: `  if (action?.checkType !== "skill") return false;`, to: `  ;`, breaks: "A3" },
  { file: RULE, name: "an action naming no skill is not a fault",
    from: `  return action?.checkType === "skill" && actionSkillChoices(action).length === 0;`,
    to: `  return false;`, breaks: "A4" },

  /* ── the data ─────────────────────────────────────────────────── */
  { file: DATA, name: "THE ORIGINAL DEFECT: Flowing Movement names no skill again",
    from: `    skills: ["athletics", "acrobatics", "climbing"],`, to: ``, breaks: "B2" },
  { file: DATA, name: "it names one skill, and the GM's choice disappears",
    from: `    skills: ["athletics", "acrobatics", "climbing"],`,
    to: `    skills: ["athletics"],`, breaks: "B2" },
  { file: DATA, name: "it offers a skill that is not one of the three",
    from: `    skills: ["athletics", "acrobatics", "climbing"],`,
    to: `    skills: ["athletics", "acrobatics", "stealth"],`, breaks: "B2" },

  /* ── the prompt ───────────────────────────────────────────────── */
  { file: WF, name: "THE WORKFLOW STOPS ASKING",
    from: `  if (actionNeedsSkillChoice(action, invokedSkillKey)) {`,
    to: `  if (false) {`, breaks: "C1" },
  { file: WF, name: "a cancelled question falls through to a default roll",
    from: `      if (!picked || picked === "cancel") return null;`, to: `      ;`, breaks: "C3" },
  { file: WF, name: "the chosen skill is recorded and the action still rolls the first",
    from: `    action = { ...action, skills: [invokedSkillKey] };`, to: `    ;`, breaks: "C4" },
  { file: WF, name: "a held modifier takes no skill at all",
    from: `      invokedSkillKey = choices[0];`, to: `      ;`, breaks: "C5" },
  { file: WF, name: "the prompt hides what each skill is worth",
    from: `            const total = Number(skill?.total ?? 0);`, to: `            const total = 0;`,
    breaks: "C6" },
  { file: WF, name: "SILENT NOTHING: an action naming no skill rolls a bare d20 again",
    // `ui.notifications.warn(` appears 46 times in this file, so the
    // anchor carries the sentence that only this one prints.
    from: "    ui.notifications.warn(`${action.name} declares a skill check but names no skill.`);\n"
      + "    return null;",
    to: "    return null;", breaks: "C7" },

  /* ── the call site ────────────────────────────────────────────── */
  { file: SHEET, name: "D THE ONE THAT NEARLY SHIPPED: the sheet decides, so the prompt never fires",
    from: `      invokedSkillKey: actionNeedsSkillChoice(action) ? null : (action.skills?.[0] ?? null),`,
    to: `      invokedSkillKey: action.skills?.[0] ?? null,`, breaks: "D1" },
  { file: SHEET, name: "D: the sheet hands over nothing, and a single-skill action loses its skill",
    from: `      invokedSkillKey: actionNeedsSkillChoice(action) ? null : (action.skills?.[0] ?? null),`,
    to: `      invokedSkillKey: null,`, breaks: "D2b" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!run()) {
  console.error("verify-action-skill-choice does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) {
      console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`);
      unmatched++;
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) {
      console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`);
      survived++;
    } else {
      console.log(`  caught    ${m.name}`);
    }
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}

process.stdout.write(survived + unmatched
  ? `\nmutate-action-skill-choice: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-action-skill-choice: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
