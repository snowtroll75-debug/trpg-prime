#!/usr/bin/env node
/**
 * mutate-sustain-spell — can verify-sustain-spell fail?
 *
 * NEW at 3.424.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 AND #2 ARE THE TWO SHIPPED HALVES, restored one at a time: the
 * action that charged for a sustain it never performed, and the Magic
 * tab button that performed one for free.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "magic", "sustain.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "magic", "sustain-workflow.mjs");
const ACTIONS = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const DATA = path.join(SYSTEM_ROOT, "module", "data", "special-actions.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-sustain-spell.mjs");

const MUTATIONS = [
  {
    // SHIPPED HALF ONE: the action has no handler and falls through to
    // the generic path, which spends the AP and posts the description.
    file: ACTIONS,
    name: "THE SHIPPED DEFECT 1: the action goes back to having no handler",
    from: '    if (action.key === "sustainASpell") {',
    to: '    if (action.key === "sustainASpellX") {',
    breaks: "D5 — an AP is spent, a card is posted, and no spell is sustained"
  },
  {
    // SHIPPED HALF TWO: the Magic tab calls the storage primitive.
    file: SHEET,
    name: "THE SHIPPED DEFECT 2: the Magic tab calls the storage primitive again",
    from: "    const { sustainSpellAction } = await import(\"../magic/sustain-workflow.mjs\");\n    await sustainSpellAction(this.actor, { spellId: target?.dataset?.spellId });",
    to: "    const { sustainActiveSpell } = await import(\"../magic/active-spells.mjs\");\n    await sustainActiveSpell(this.actor, target?.dataset?.spellId, game.combat?.round ?? 0);",
    breaks: "D6/D7/D12 — the spell is sustained for free, with no requirements checked"
  },
  {
    // THE DOUBLE SPEND. Moving the branch after the generic spend makes
    // one Sustain cost two AP — worse than the defect being fixed.
    file: ACTIONS,
    name: "the action's branch no longer returns, so the cost is paid twice",
    from: '      const { sustainSpellAction } = await import("../magic/sustain-workflow.mjs");\n      await sustainSpellAction(actor);\n      return null;',
    to: '      const { sustainSpellAction } = await import("../magic/sustain-workflow.mjs");\n      await sustainSpellAction(actor);',
    breaks: "D10 — falls through to the generic checkType:\"none\" AP spend"
  },
  {
    file: FLOW,
    name: "the sustain stops spending the action cost",
    from: "  await spendActionCost(actor, SUSTAIN_AP_COST, \"Sustain a Spell\", { traits: SUSTAIN_TRAITS });",
    to: "",
    breaks: "D1 — both doors become free again"
  },
  {
    file: FLOW,
    name: "the AP is spent before the requirements are checked",
    from: "  const entries = getActiveSpells(actor);\n  const refusal = sustainRefusal({",
    to: "  await spendActionCost(actor, SUSTAIN_AP_COST, \"Sustain a Spell\", { traits: SUSTAIN_TRAITS });\n  const entries = getActiveSpells(actor);\n  const refusal = sustainRefusal({",
    breaks: "D3 — a refused sustain costs an action"
  },
  {
    file: FLOW,
    name: "the AP is spent before the spell is chosen",
    from: "  let entry = target.entry ?? null;",
    to: "  await ensureActionPoints(actor, SUSTAIN_AP_COST, \"Sustain a Spell\");\n  let entry = target.entry ?? null;",
    breaks: "D4 — cancelling the picker costs an action"
  },
  {
    file: RULE,
    name: "a Sustain becomes free",
    from: 'export const SUSTAIN_AP_COST = "1";',
    to: 'export const SUSTAIN_AP_COST = "0";',
    breaks: "A1/A4 — the printed cost and the charged cost disagree"
  },
  {
    file: RULE,
    name: "the cost becomes a number",
    from: 'export const SUSTAIN_AP_COST = "1";',
    to: "const SUSTAIN_AP_COST = 1;",
    breaks: "A2 — the action pipeline parses a cost string"
  },
  {
    file: RULE,
    name: "the Concentrate trait is dropped from the spend",
    from: 'export const SUSTAIN_TRAITS = "Concentrate";',
    to: 'export const SUSTAIN_TRAITS = "";',
    breaks: "A3 — trait usage is recorded wrongly"
  },
  {
    // THE REQUIREMENTS, which were enforced nowhere before this release.
    file: RULE,
    name: "fatigue stops mattering",
    from: "  if (Number(fatigued) > 0) {",
    to: "  if (false) {",
    breaks: "B3/B4 — a printed requirement enforced nowhere, again"
  },
  {
    file: RULE,
    name: "a caster with nothing running may still Sustain",
    from: "  if (!sustainableEntries(entries).length) {",
    to: "  if (false) {",
    breaks: "B1/B2/B6 — an action with no possible subject"
  },
  {
    file: RULE,
    name: "fatigue is reported after the missing spell",
    from: "  if (Number(fatigued) > 0) {\n    return `${name} is Fatigued — Sustain a Spell requires that you are not fatigued.`;\n  }\n  if (!sustainableEntries(entries).length) {\n    return `${name} has no spell running with a sustained duration to sustain.`;",
    to: "  if (!sustainableEntries(entries).length) {\n    return `${name} has no spell running with a sustained duration to sustain.`;\n  }\n  if (Number(fatigued) > 0) {\n    return `${name} is Fatigued — Sustain a Spell requires that you are not fatigued.`;",
    breaks: "B4 — a fatigued caster is told to go and cast something first"
  },
  {
    file: RULE,
    name: "a PP-locked spell counts as sustainable",
    from: "  return (Array.isArray(entries) ? entries : []).filter((e) => Boolean(e?.sustained));",
    to: "  return (Array.isArray(entries) ? entries : []).filter((e) => Boolean(e?.sustained || e?.lock));",
    breaks: "B6/C2/C5 — clicking a locked row sustains a duration it does not have"
  },
  {
    file: RULE,
    name: "a named spell that is not sustainable is sustained anyway",
    from: "    const named = candidates.find((e) => e.id === spellId);\n    return named ? { entry: named } : null;",
    to: "    const named = candidates.find((e) => e.id === spellId);\n    return { entry: named ?? candidates[0] };",
    breaks: "C2/C3 — clicking one row sustains a different spell"
  },
  {
    file: RULE,
    name: "a caster with one running spell is asked anyway",
    from: "  if (candidates.length === 1) return { entry: candidates[0] };",
    to: "",
    breaks: "C4 — a dialog with one row in it"
  },
  {
    file: DATA,
    name: "the action's printed cost drifts from the rule's",
    from: '    key: "sustainASpell",\n    name: "Sustain a Spell",\n    traits: "Concentrate",\n    apCost: "1",',
    to: '    key: "sustainASpell",\n    name: "Sustain a Spell",\n    traits: "Concentrate",\n    apCost: "2",',
    breaks: "A4 — the cost is printed in two places and they must not drift"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RULE, FLOW, ACTIONS, SHEET, DATA, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-sustain-spell: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-sustain-spell: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-sustain-spell: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
