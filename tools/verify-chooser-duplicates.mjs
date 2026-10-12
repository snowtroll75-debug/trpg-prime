#!/usr/bin/env node
/**
 * verify-chooser-duplicates — a spell the character already has, and
 * what a chooser does about it. NEW at 3.552.9.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULING.
 *
 * Found live at 3.552.7: the Test Cleric already knew Daze, Arcane
 * Knowledge offered Daze, and he finished the test holding two of them.
 * Graham's ruling of 15 September 2026 took the recommendation offered
 * with the finding — hide the duplicate where a second copy would do
 * nothing, label it where it would not:
 *
 *   - an INNATE grant (Noldorni, Gul-Fyr, Tirvni, Arcane Knowledge)
 *     hands over a focus copy cast outside the memorisation cycle. That
 *     is not the spell the character already knows, so it is offered
 *     and marked "(already known)";
 *   - a REPERTOIRE grant (the other thirteen) would add a second copy
 *     of the same spell to the same list, which does nothing at all, so
 *     it is hidden.
 *
 * The GRANT path has refused duplicates since the Crusader turned up
 * holding two copies of Strike of Retribution under a card that said
 * "Granted" (grants-workflow's `held` set). This is the same question
 * asked one layer further out, where nobody had asked it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS PINS.
 *
 *   A. The rule itself, driven: which mode each kind of chooser gets.
 *   B. What the rule does to a list — hidden, labelled, untouched.
 *   C. That the workflow ASKS it, with the actor's own item names, and
 *      excludes the pick being replaced.
 *   D. That "everything is already known" has its own words, and is not
 *      reported as the empty compendium the cold-index bug reported for
 *      six releases.
 *   E. Which choosers land innate, read from the registry rather than
 *      listed here — so a new innate chooser inherits the ruling.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  duplicateMode, applyDuplicateRule, allKnownRefusal, ALREADY_KNOWN_SUFFIX
} from "../module/feats.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ================================================================== *
 * A. THE RULE
 * ================================================================== */
eq("A1 an innate grant labels the duplicate", duplicateMode({ innate: true }), "label");
eq("A2 a repertoire grant hides it", duplicateMode({ innate: false }), "hide");
eq("A3 and a chooser that says nothing is a repertoire grant", duplicateMode(), "hide");
eq("A4 asked with nothing at all, it still answers", duplicateMode(undefined), "hide");

/* ================================================================== *
 * B. WHAT IT DOES TO A LIST
 * ================================================================== */
const CANDIDATES = [
  { _id: "a", name: "Daze" },
  { _id: "b", name: "Chill Touch" },
  { _id: "c", name: "Mage Hand" }
];
{
  const hidden = applyDuplicateRule(CANDIDATES, ["Daze"], "hide");
  eq("B1 hide drops the spell already held", hidden.map((r) => r.name),
    ["Chill Touch", "Mage Hand"]);
  ok("B2 and leaves the rest unlabelled", hidden.every((r) => r.label === r.name && !r.held));

  const labelled = applyDuplicateRule(CANDIDATES, ["Daze"], "label");
  eq("B3 label keeps every candidate", labelled.map((r) => r.name),
    ["Daze", "Chill Touch", "Mage Hand"]);
  eq("B4 and marks the one already held", labelled.find((r) => r.name === "Daze")?.label,
    `Daze (${ALREADY_KNOWN_SUFFIX})`);
  ok("B5 marking nothing else", labelled.filter((r) => r.held).length === 1);
  ok("B6 the id is carried through, since it is what the dialog returns",
    labelled.every((r) => ["a", "b", "c"].includes(r.id)));

  // A NAME IS A NAME whatever the sheet did to its spacing or case: the
  // compendium writes "Mage Hand" and an item on the sheet can be
  // "mage hand " after an import or a rename.
  eq("B7 the comparison ignores case and surrounding space",
    applyDuplicateRule(CANDIDATES, ["  mage HAND "], "hide").map((r) => r.name),
    ["Daze", "Chill Touch"]);
  // AND IT IS THE WHOLE NAME. Both of these are real spells in the
  // pack: knowing Light must not hide Dancing Lights.
  eq("B8 and matches the whole name, not a piece of it",
    applyDuplicateRule([{ _id: "d", name: "Dancing Lights" }], ["Light"], "hide").map((r) => r.name),
    ["Dancing Lights"]);
  eq("B8a nor the other way round",
    applyDuplicateRule([{ _id: "e", name: "Light" }], ["Dancing Lights"], "hide").map((r) => r.name),
    ["Light"]);
  eq("B9 nothing held changes nothing", applyDuplicateRule(CANDIDATES, [], "hide").length, 3);
  eq("B10 everything held empties a hide list",
    applyDuplicateRule(CANDIDATES, ["Daze", "Chill Touch", "Mage Hand"], "hide"), []);
  eq("B11 but never empties a label list",
    applyDuplicateRule(CANDIDATES, ["Daze", "Chill Touch", "Mage Hand"], "label").length, 3);
}

/* ================================================================== *
 * C. THE WORKFLOW ASKS IT
 *
 * A rule nothing consults is not automation — and asserted as whole
 * statements, because `if (false && rows)` keeps every name this check
 * could otherwise look for.
 * ================================================================== */
{
  const workflow = strip(read("module", "feats-workflow.mjs"));
  ok("C1 the chooser imports the rule",
    /import \{[\s\S]{0,160}duplicateMode,[\s\S]{0,160}\} from "\.\/feats\.mjs";/.test(workflow));
  ok("C2 and builds the list through it",
    /const rows = applyDuplicateRule\(candidates, heldNames, duplicateMode\(\{ innate \}\)\);/
      .test(workflow),
    "the mode must come from the grant's own innate flag, not a per-caller setting");
  ok("C3 the held names are the actor's own items",
    /const heldNames = Array\.from\(actor\.items \?\? \[\]\)/.test(workflow));
  ok("C4 minus the pick this press would replace",
    /\.filter\(\(item\) => item\.id !== already\?\.id\)/.test(workflow),
    "otherwise the chooser hides the answer the player pressed Use to change");
  ok("C5 and the dialog is built from the rows, not the raw candidates",
    /rows\.map\(\(row\) => \[row\.id, row\.label\]\)\);/.test(workflow),
    "labels that never reach the dialog are decoration");
  ok("C6 the raw candidate list no longer reaches the dialog",
    !/candidates\.map\(\(s\) => \[s\._id, s\.name\]\)/.test(workflow));
}

/* ================================================================== *
 * D. THE EMPTY LIST HAS ITS OWN WORDS
 * ================================================================== */
{
  const workflow = strip(read("module", "feats-workflow.mjs"));
  ok("D1 an all-known list is refused in its own words",
    /if \(!rows\.length\) \{\s*ui\.notifications\.warn\(allKnownRefusal\(title\)\);\s*return null;\s*\}/
      .test(workflow),
    "reporting it as an empty compendium is the sentence the cold-index bug hid behind");
  ok("D2 and that sentence says what actually happened",
    /every spell it could offer is already on your sheet/.test(allKnownRefusal("Lorist")));
  ok("D3 naming the chooser", allKnownRefusal("Lorist").startsWith("Lorist:"));
  ok("D4 the compendium-miss warning still exists for a real miss",
    /no matching spells found in the compendium/.test(workflow));
  ok("D5 and the two are not the same sentence",
    allKnownRefusal("Lorist") !== "Lorist: no matching spells found in the compendium.");
}

/* ================================================================== *
 * E. WHICH CHOOSERS GET WHICH, READ FROM THE REGISTRY
 *
 * Not a list kept here: the point of deciding from `innate` is that a
 * chooser added later inherits the ruling. This asserts the shape of
 * the population rather than its names — that both kinds exist, and
 * that every innate one is a focus grant, which is the reason an innate
 * duplicate is a different spell from the one already held.
 * ================================================================== */
{
  const workflow = strip(read("module", "feats-workflow.mjs"));
  const keys = [...workflow.matchAll(/^ {2}"([^"]+)": \{$/gm)];
  const choosers = [];
  for (let i = 0; i < keys.length; i += 1) {
    const start = keys[i].index;
    const end = i + 1 < keys.length ? keys[i + 1].index : workflow.length;
    const block = workflow.slice(start, end);
    if (!/grantChosenSpell\(actor, \{/.test(block)) continue;
    choosers.push({
      key: keys[i][1],
      innate: /innate: true/.test(block),
      focus: /addTrait: "focus"/.test(block)
    });
  }
  ok("E1 the scan found the choosers", choosers.length >= 15, `found ${choosers.length}`);
  const innate = choosers.filter((c) => c.innate);
  ok("E2 some choosers grant an innate copy", innate.length > 0);
  ok("E3 and some grant a repertoire copy", choosers.length - innate.length > 0);
  eq("E4 every innate grant is a focus grant — which is why it is a different spell",
    innate.filter((c) => !c.focus).map((c) => c.key), []);
}

console.log(`verify-chooser-duplicates: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-chooser-duplicates: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-chooser-duplicates: all pass");
