#!/usr/bin/env node
/**
 * verify-spellbook-picker — the Spellbook's browsers filter by school and PP
 * and take several spells at once (3.715.0; Graham, 25 November 2026: "I
 * would [like] a filter by school option and filter by PP. Also, I would like
 * the character to be able to select more than one spell at a time.").
 *
 *   A. THE MENUS (driven). A spell's school is read off its traits; the
 *      Spellbook's facets are School then PP; PP sorts as numbers.
 *   B. HOW MANY ADD TO BOOK TAKES (driven): every slot owed, or what is
 *      left of the opening batch while it is open.
 *   C. FREE SPELL'S ONE QUESTION FOR SEVERAL (driven).
 *   D. THE WIRING (source). The picker's multi-select mode, its cap and
 *      count, the single-pick mode untouched; both book browsers use it.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

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
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

globalThis.foundry = { applications: { api: {} }, utils: {} };
globalThis.game = {};
const filters = await import("../module/picker-filters.mjs");
const workflow = await import("../module/magic/spellbook-workflow.mjs");
const free = await import("../module/magic/spellbook-free-workflow.mjs");

/* A — the menus */
eq("A1 the school is read off the traits", filters.spellSchoolOf({ system: { traits: "Fire, Invocation" } }), "Invocation");
eq("A2 ...whatever the case and spacing", filters.spellSchoolOf({ system: { traits: " mental ,  ENCHANTMENT " } }), "Enchantment");
eq("A3 ...and a spell naming no school has none", filters.spellSchoolOf({ system: { traits: "Fire" } }), "");
eq("A4 every one of the eight schools is recognised",
  ["Alteration", "Enchantment", "Insight", "Invocation", "Shadow", "Soul", "Translocation", "Warding"]
    .map((s) => filters.spellSchoolOf({ system: { traits: s } })),
  ["Alteration", "Enchantment", "Insight", "Invocation", "Shadow", "Soul", "Translocation", "Warding"]);
const facets = filters.PICKER_FACETS.spellbook;
eq("A5 the Spellbook's menus are School then PP", facets.map((f) => f.key), ["school", "pp"]);
eq("A6 ...School reads the school", facets[0].read({ system: { traits: "Shadow, Mental" } }), "Shadow");
ok("A7 ...and asks the index for the traits", facets[0].fields.includes("system.traits"));
eq("A8 ...PP reads the PP cost, and sorts as numbers", [facets[1].read({ system: { ppCost: 6 } }), facets[1].numeric], [6, true]);
eq("A9 numeric values sort 1, 2, 9, 10, not 1, 10, 2, 9",
  filters.sortFacetValues({ numeric: true }, ["10", "2", "1", "9"]), ["1", "2", "9", "10"]);
eq("A10 text values still sort as text", filters.sortFacetValues({}, ["Soul", "Insight"]), ["Insight", "Soul"]);
eq("A11 the ordinary spell slot's PP menu sorts as numbers too", filters.PICKER_FACETS.spell.find((f) => f.key === "pp")?.numeric, true);

/* B — how many Add to Book takes */
const limit = workflow.spellBookPickLimit;
eq("B1 a fresh 1st-level Wizard may take all six opening picks at once",
  limit({ remaining: 6, firstPicksOutstanding: true, firstPicks: 6, owned: 0 }), 6);
eq("B2 a 3rd-level Wizard with an empty book takes the six PP 2 picks first, not ten",
  limit({ remaining: 10, firstPicksOutstanding: true, firstPicks: 6, owned: 0 }), 6);
eq("B3 ...then the four later slots together", limit({ remaining: 4, firstPicksOutstanding: false, firstPicks: 6, owned: 6 }), 4);
eq("B4 part-way through the opening batch: what is left of it", limit({ remaining: 8, firstPicksOutstanding: true, firstPicks: 6, owned: 2 }), 4);
eq("B5 nothing owed, nothing to take", limit({ remaining: 0, firstPicksOutstanding: false, firstPicks: 6, owned: 6 }), 0);
eq("B6 the Spellblade's four opening picks", limit({ remaining: 4, firstPicksOutstanding: true, firstPicks: 4, owned: 0 }), 4);

/* C — Free Spell's one question */
const fly = { name: "Fly", system: { ppCost: 6, tradition: "arcane, verdant" } };
const sleep = { name: "Sleep", system: { ppCost: 2, tradition: "arcane, ethereal" } };
const one = free.freeSpellQuestion(fly);
ok("C1 one spell reads as before", /^asks to add Fly \(PP 6, arcane, verdant\) to their Spellbook for free\. It takes no slot/.test(one), one);
const two = free.freeSpellQuestion([fly, sleep]);
ok("C2 several are named together, with the count, PP and tradition of each",
  /asks to add 2 spells — Fly \(PP 6, arcane, verdant\), Sleep \(PP 2, arcane, ethereal\) — to their Spellbook for free\. They take no slot/.test(two), two);
ok("C3 ...and say they are counted under Free spells", /are counted under Free spells\.$/.test(two));

/* D — the wiring */
const picker = read("module/picker-workflow.mjs");
ok("D1 the picker takes multiple and maxPicks, off by default", /multiple = false, maxPicks = Infinity/.test(picker));
ok("D2 ...a checkbox per row when multiple, the radio otherwise",
  /<input type="\$\{multiple \? "checkbox" : "radio"\}" name="picked"/.test(picker));
ok("D3 ...answers every ticked row as picks, one row otherwise",
  /if \(multiple\) \{\s*\n\s*const picks = Array\.from\(form\?\.querySelectorAll\('input\[name="picked"\]:checked'\)/.test(picker)
  && /return picks\.length \? \{ picks, action \} : null;/.test(picker)
  && /return checked \? \{ \.\.\.splitPicked\(checked\.value\), action \} : null;/.test(picker));
ok("D4 ...undoes a tick past the cap, and says so",
  /if \(box\.checked && Number\.isFinite\(maxPicks\)\s*\n\s*&& root\.querySelectorAll\('input\[name="picked"\]:checked'\)\.length > maxPicks\) \{\s*\n\s*box\.checked = false;/.test(picker)
  && /You can select up to \$\{maxPicks\} here\./.test(picker));
ok("D5 ...shows how many are selected against the cap", /\$\{n\} of \$\{maxPicks\} selected/.test(picker) && /countLabel\.textContent = multiple \? `\$\{listed\} · \$\{selectedLine\(\)\}` : listed;/.test(picker));
ok("D6 ...double-click-to-add stays single-pick only", /if \(!multiple\) rowEls\.forEach\(\(row\) => \{\s*\n\s*row\.addEventListener\("dblclick"/.test(picker));
ok("D7 ...and a menu's values go through sortFacetValues", /const values = sortFacetValues\(facet, Array\.from\(new Set\(/.test(picker));
const wf = read("module/magic/spellbook-workflow.mjs");
ok("D8 Add to Book uses the School and PP menus, several at once, capped",
  /facets: PICKER_FACETS\.spellbook,\s*\n\s*multiple: true,\s*\n\s*maxPicks,/.test(wf) && /const maxPicks = spellBookPickLimit\(context\);/.test(wf));
ok("D9 ...and creates every pick, never more than the cap", /for \(const \{ itemId \} of picked\.picks\.slice\(0, maxPicks\)\)/.test(wf)
  && /await actor\.createEmbeddedDocuments\("Item", datas\)/.test(wf));
ok("D10 ...each still a book pick owned by the class", /spellBookPick: true,\s*\n\s*grantedBy: \{\s*\n\s*sourceId: classItem\.id,/.test(wf));
const fw = read("module/magic/spellbook-free-workflow.mjs");
ok("D11 Free Spell uses the same menus, several at once, uncapped",
  /facets: PICKER_FACETS\.spellbook,\s*\n\s*multiple: true,\s*\n\s*emptyMessage/.test(fw));
ok("D12 ...asks the GM once for the whole selection, before creating any",
  /question: freeSpellQuestion\(documents\)/.test(fw) && fw.indexOf("await requestGMAuthorisation(") < fw.indexOf("createEmbeddedDocuments"));

if (failures.length) {
  process.stderr.write(`verify-spellbook-picker: FAILED ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-spellbook-picker: OK — ${checks} checks.\n`);
process.exit(0);
