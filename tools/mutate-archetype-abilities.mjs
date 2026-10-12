#!/usr/bin/env node
/**
 * mutate-archetype-abilities — can the checks fail?
 *
 * NEW at 3.586.3. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST TWO MUTATIONS ARE THE SHIPPED STATE, put back exactly: the
 * grouping branch removed, and the Uncategorised table's Use control
 * removed. That is the world Graham reported from — three complete
 * handlers with nowhere on the sheet to press them.
 *
 * The rest put back the silence underneath it: handlers that roll, name
 * a degree and apply nothing.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, ...parts);
const SHEET = at("module", "sheets", "actor-sheet.mjs");
const HBS = at("templates", "actor", "actor-sheet.hbs");
const MARK = at("module", "combat", "death-mark.mjs");
const FEATS = at("module", "feats-workflow.mjs");
const ATK = at("module", "combat", "attack-workflow.mjs");
const CHECK = at("tools", "verify-archetype-abilities.mjs");

const MUTATIONS = [
  /* ── A: reachability — the fault Graham actually hit ───────────── */
  { file: SHEET, name: "A THE SHIPPED DEFECT: an Archetype ability has no branch and falls to Uncategorised",
    from: '        else if (item.type === "ability" && category === "Archetype") groups.archetypeFeats.push(row);\n',
    to: "", breaks: "A2" },
  { file: HBS, name: "A THE OTHER HALF: the Uncategorised table loses its Use control",
    from: `                {{#if item.hasFeatAction}}
                  <button type="button" data-action="useFeat" data-tooltip="{{item.featActionHint}}"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                {{else if item.passiveAutomation}}
                  <button type="button" class="passive-info" data-action="useFeat" data-tooltip="{{item.featActionHint}}"><i class="fa-solid fa-circle-info"></i></button>
                {{/if}}
                {{#if item.usesTracked}}
                  <button type="button" data-action="useItemCharge" data-tooltip="Use a charge"><i class="fa-solid fa-bolt-lightning"></i></button>
                {{/if}}`,
    to: `                {{#if item.usesTracked}}
                  <button type="button" data-action="useItemCharge" data-tooltip="Use a charge"><i class="fa-solid fa-bolt-lightning"></i></button>
                {{/if}}`, breaks: "A4" },

  /* ── B: the handlers doing nothing ─────────────────────────────── */
  { file: FEATS, name: "B: Death Mark records a name again, and nothing can scope to it",
    from: "            ...(markedUuid ? { [DEATH_MARK_FLAG]: { uuid: markedUuid, name: targetName } } : {}),",
    to: "", breaks: "B1" },
  { file: FEATS, name: "B: the mark places no conditionals, only a description",
    from: "            ...(conditionals.length ? { conditionals } : {})",
    to: "", breaks: "B2" },
  { file: FEATS, name: "B: a name-only mark claims to have automated something",
    from: "          : line(\"<em>Marked by name only",
    to: "          : line(\"<em>Marked", breaks: "B3" },
  { file: FEATS, name: "B THE LIVE DEFECT: Agile Display prints the outcome and applies nothing",
    from: `        await applyConditionTags(ffTarget, [{ key: "flatFooted", label: "Flat-Footed" }], {`,
    to: `        if (false) await applyConditionTags(ffTarget, [{ key: "flatFooted", label: "Flat-Footed" }], {`,
    breaks: "B4" },
  { file: FEATS, name: "B: its critical loses the success half it is written as 'plus'",
    from: `        const did = await applyFlatFooted();
        lines.push(line(\`<strong>Critical:</strong>`,
    to: `        const did = false;
        lines.push(line(\`<strong>Critical:</strong>`, breaks: "B5" },
  { file: FEATS, name: "B: Sense Weakness goes back to describing its ladder",
    from: `        await applyConditionTags(swTarget, [{ key: "flatFooted", label: "Flat-Footed" }], {`,
    to: `        if (false) await applyConditionTags(swTarget, [{ key: "flatFooted", label: "Flat-Footed" }], {`,
    breaks: "B7" },
  { file: FEATS, name: "B: its critical and success share one clock",
    from: "        const did = await markFlatFooted(10);",
    to: "        const did = await markFlatFooted(1);", breaks: "B8" },

  /* ── C: the mark's rules ───────────────────────────────────────── */
  { file: MARK, name: "C: the mark applies to every creature, not the one marked",
    from: "  if (!marked || marked !== text(targetUuid)) return false;",
    to: "  if (!marked) return false;", breaks: "C5" },
  { file: MARK, name: "C: a plain greatsword qualifies",
    from: "  return Boolean(agile || finesse || unarmed);", to: "  return true;", breaks: "C4" },
  { file: MARK, name: "C: a ranged attack is judged by its trait line instead of the distance",
    from: "  if (isRanged) return Boolean(withinFirstIncrement);",
    to: "  if (isRanged) return Boolean(agile || finesse || withinFirstIncrement);", breaks: "C8" },
  // THE BRANCH A HURRIED IMPLEMENTATION LOSES.
  { file: MARK, name: "C: an already-Deadly weapon is granted Deadly again and gains nothing",
    from: `  return alreadyDeadly
    ? { grantsDeadly: false, damageBonus: 1 }
    : { grantsDeadly: true, damageBonus: 0 };`,
    to: "  return { grantsDeadly: true, damageBonus: 0 };", breaks: "C11" },
  { file: MARK, name: "C: a disabled mark still marks",
    from: "    if (effect?.disabled) continue;", to: "", breaks: "C14" },
  { file: MARK, name: "C: the +2 is authored unscoped",
    from: "    scope, when: { ...when, targetUuids: [marked] }",
    to: "    scope, when: { ...when }", breaks: "D2" },
  { file: MARK, name: "C: a mark of nobody authors three rows that match everything",
    from: "  if (!marked) return [];", to: "", breaks: "D5" },
  { file: MARK, name: "C: the attack row loses its check type and reaches every roll",
    from: `    row(\`Attack rolls against \${who}\`, { checkTypes: ["attack"] }),`,
    to: "    row(`Attack rolls against ${who}`, {}),", breaks: "D9" },

  /* ── E: the attack pipeline ────────────────────────────────────── */
  { file: ATK, name: "E: the mark stops granting Deadly at all",
    from: "  const deadly = weaponIsDeadly || mark.grantsDeadly;",
    to: "  const deadly = weaponIsDeadly;", breaks: "E1" },
  { file: ATK, name: "E: an unmeasured distance counts as within the first increment",
    from: "      withinFirstIncrement: Number.isFinite(Number(distanceToTarget))",
    to: "      withinFirstIncrement: !Number.isFinite(Number(distanceToTarget))", breaks: "E3" },
  { file: ATK, name: "E: the +1 never reaches the formula",
    from: "  if (Number(deathMarkBonus) > 0) {", to: "  if (false) {", breaks: "E4" },
  { file: ATK, name: "E: the mark is read only from actor.effects, missing a transferred one",
    from: "      markedUuid: markedUuidOf(actor.appliedEffects ?? actor.effects ?? []),",
    to: "      markedUuid: markedUuidOf(actor.effects ?? []),", breaks: "E6" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const files = Array.from(new Set(MUTATIONS.map((m) => m.file)));
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

if (!run()) {
  console.error("mutate-archetype-abilities: the check FAILS before any mutation.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

process.stdout.write(survived + unmatched
  ? `\nmutate-archetype-abilities: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-archetype-abilities: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
