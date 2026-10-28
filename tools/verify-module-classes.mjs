#!/usr/bin/env node
/**
 * verify-module-classes — what a companion module's CLASS needs from the
 * system (3.563.0), shipped with Pillars of Faith's Chapter 3.
 *
 * DRIVEN, pure:
 *   A  The repertoire schedule as data — repertoire.mjs's pick and swap
 *      counts under the default schedule (unchanged for the Bard, Ranger
 *      and Crusader) and under the two printed variants (one pick a
 *      level from 2nd; one swap a level from 5th), plus the next-level
 *      markers the card shows, and how a class item declares it.
 *   B  The declared ability chooser — abilityChoicesOf and its hint read
 *      off an item's flag, refuse a malformed one, and report a recorded
 *      choice by the stamp it left.
 *   C  Specialist skills from any item declaring the literal flag —
 *      declaresSpecialistSkills, and that the printed field alone does
 *      not count for a non-foundation item.
 *   D  Class gates that read a registered class name: barredClasses and
 *      the archetype branch (registry-driven, through the module API).
 *
 * STRUCTURAL, marked so: the grant fields (an ability's three, a class's
 * grantedSpells), the autogrant list, the cleanup gate, the waiver for a
 * class-granted archetype, the feat-name lists widened to abilities, and
 * the sheet's wiring of the chooser — each a line that has to be there
 * for the driven rule to reach a sheet.
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
function equal(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

const rep = await import(new URL("../module/magic/repertoire.mjs", import.meta.url));
const specialist = await import(new URL("../module/specialist-grants.mjs", import.meta.url));
const api = await import(new URL("../module/module-api.mjs", import.meta.url));
const grants = await import(new URL("../module/grants.mjs", import.meta.url));

/* ------------------------------------------------------------------ *
 * A. The repertoire schedule as data
 * ------------------------------------------------------------------ */

const core = rep.repertoireSchedule(null);
equal("A1 no flag → the core schedule", core, { pickStep: 2, pickFrom: 3, swapStep: 2, swapFrom: 5 });
equal("A2 the core pick count is unchanged: two at 1st, +1 at 3rd and every two",
  [1, 2, 3, 4, 5, 6, 19, 20].map((l) => rep.repertoirePickCount(l)), [2, 2, 3, 3, 4, 4, 11, 11]);
equal("A3 the core swap count is unchanged: 5th and every two",
  [1, 4, 5, 6, 7, 19, 20].map((l) => rep.repertoireSwapCount(l)), [0, 0, 1, 1, 2, 8, 8]);
const everyLevel = rep.repertoireSchedule({ flags: { "trg-prime": { repertoire: { pickStep: 1, pickFrom: 2 } } } });
equal("A4 a class declaring one pick a level from 2nd keeps the core swaps", everyLevel, { pickStep: 1, pickFrom: 2, swapStep: 2, swapFrom: 5 });
equal("A5 one pick a level from 2nd: 2, 3, 4 ... 21",
  [1, 2, 3, 4, 10, 20].map((l) => rep.repertoirePickCount(l, everyLevel)), [2, 3, 4, 5, 11, 21]);
const healer = rep.repertoireSchedule({ flags: { "trg-prime": { repertoire: { pickStep: 1, pickFrom: 2, swapStep: 1, swapFrom: 5 } } } });
equal("A6 one swap a level from 5th: 0 at 4th, 1 at 5th, 16 at 20th",
  [4, 5, 6, 20].map((l) => rep.repertoireSwapCount(l, healer)), [0, 1, 2, 16]);
equal("A7 a malformed flag falls back field by field",
  rep.repertoireSchedule({ flags: { "trg-prime": { repertoire: { pickStep: 0, swapFrom: "x", pickFrom: 2 } } } }), { pickStep: 2, pickFrom: 2, swapStep: 2, swapFrom: 5 });
equal("A8 level 0 has no picks under any schedule", [rep.repertoirePickCount(0), rep.repertoirePickCount(0, healer)], [0, 0]);
const stateCore = rep.repertoireState({ level: 4, picked: 3 });
equal("A9 the card's next-pick level under the core schedule is 5 at 4th", [stateCore.nextPickLevel, stateCore.nextSwapLevel], [5, 5]);
const stateCore2 = rep.repertoireState({ level: 5, picked: 3 });
equal("A10 ...and 7 / 7 at 5th (the parity arithmetic preserved)", [stateCore2.nextPickLevel, stateCore2.nextSwapLevel], [7, 7]);
const stateHealer = rep.repertoireState({ level: 5, picked: 3, schedule: healer });
equal("A11 the Healer's card says 6 / 6 at 5th", [stateHealer.nextPickLevel, stateHealer.nextSwapLevel, stateHealer.allowed, stateHealer.swapsAllowed], [6, 6, 6, 1]);
const stateEnd = rep.repertoireState({ level: 20, picked: 3, schedule: healer });
equal("A12 past the table the markers are null", [stateEnd.nextPickLevel, stateEnd.nextSwapLevel], [null, null]);
equal("A13 at 19th under the core schedule the last pick has been granted", rep.repertoireState({ level: 19 }).nextPickLevel, null);
equal("A14 at 18th the core schedule still points at 19", rep.repertoireState({ level: 18 }).nextPickLevel, 19);
ok("A15 the schedule reaches the workflow and the class card",
  /schedule: repertoireSchedule\(classItem, actor\)/.test(read("module/magic/repertoire-workflow.mjs")) && /repertoireSchedule\(sourceItem, actor\)/.test(read("module/grants-workflow.mjs")));
ok("A16 the swap path reads the schedule too", /repertoireSwapCount\(Number\(actor\.system\?\.identity\?\.level \?\? 0\), repertoireSchedule\(classItem, actor\)\)/.test(read("module/magic/repertoire-workflow.mjs")));

/* ------------------------------------------------------------------ *
 * B. The declared ability chooser
 * ------------------------------------------------------------------ */

// feats-workflow.mjs needs Foundry globals to import; the two pure
// functions are read out of the source and evaluated on their own.
const fw = read("module/feats-workflow.mjs");
const fnSource = (name) => {
  const m = fw.match(new RegExp(`export function ${name}\\(item\\) \\{[\\s\\S]*?\\n\\}`));
  return m ? m[0].replace("export ", "") : null;
};
const choicesSrc = fnSource("abilityChoicesOf");
const hintSrc = fnSource("abilityChoiceHint");
ok("B1 abilityChoicesOf and abilityChoiceHint are exported pure functions", Boolean(choicesSrc && hintSrc));
const recordedSrc = fw.match(/function recordedAbilityChoice\(item\) \{[\s\S]*?\n\}/)?.[0];
ok("B2 recordedAbilityChoice reads the stamp off the actor's abilities", Boolean(recordedSrc) && /grantedBy\?\.sourceId === item\.id/.test(recordedSrc));
// eslint-disable-next-line no-new-func
const { abilityChoicesOf, abilityChoiceHint } = new Function(`const SYSTEM_ID = "trg-prime"; ${choicesSrc}\n${hintSrc}\n${recordedSrc}\nreturn { abilityChoicesOf, abilityChoiceHint };`)();
equal("B3 a declared list is read and trimmed", abilityChoicesOf({ flags: { "trg-prime": { abilityChoices: [" Canonist ", "Apocryphist", ""] } } }), ["Canonist", "Apocryphist"]);
equal("B4 no flag → null", abilityChoicesOf({ flags: {} }), null);
equal("B5 a string, not a list → null", abilityChoicesOf({ flags: { "trg-prime": { abilityChoices: "Canonist" } } }), null);
equal("B6 an empty list → null", abilityChoicesOf({ flags: { "trg-prime": { abilityChoices: [] } } }), null);
equal("B7 the hint lists the options before a choice", abilityChoiceHint({ flags: { "trg-prime": { abilityChoices: ["A", "B"] } } }), "Choose one: A, B.");
const chooser = { id: "ch1", flags: { "trg-prime": { abilityChoices: ["A", "B"] } }, parent: { items: [{ type: "ability", name: "B", flags: { "trg-prime": { grantedBy: { sourceId: "ch1" } } } }] } };
equal("B8 the hint names the recorded choice by its stamp", abilityChoiceHint(chooser), "Chosen: B.");
equal("B9 a feat stamped by the chooser is not an ability choice", abilityChoiceHint({ ...chooser, parent: { items: [{ type: "feat", name: "B", flags: { "trg-prime": { grantedBy: { sourceId: "ch1" } } } }] } }), "Choose one: A, B.");
equal("B10 no flag → no hint", abilityChoiceHint({ flags: {} }), "");
ok("B11 useFeat runs the chooser when no name-keyed automation claims the item",
  /if \(!automation && abilityChoicesOf\(item\)\) \{[\s\S]*?return await useAbilityChoice\(actor, item\);/.test(fw));
ok("B12 the chooser matches the granted copy by the chooser's own sourceClass",
  /candidates\.find\(\(e\) => normalise\(e\.system\?\.sourceClass \?\? ""\) === wantedClass\) \?\? candidates\[0\]/.test(fw));
ok("B13 the chooser stamps grantedBy so the ability leaves with it",
  /useAbilityChoice[\s\S]*?grantedBy`, \{\s*sourceId: item\.id, sourceName: item\.name, requested: picked/.test(fw));
ok("B14 a second Use reports the recorded choice rather than granting again",
  /useAbilityChoice[\s\S]*?if \(recorded\) \{\s*ui\.notifications\.info/.test(fw));
const sheet = read("module/sheets/actor-sheet.mjs");
ok("B15 the sheet shows a Use button for a declared chooser (both rows)", (sheet.match(/\|\| Boolean\(abilityChoicesOf\(item\)\)/g) ?? []).length === 2);
ok("B16 the sheet's hint falls through to the chooser's", (sheet.match(/\|\| abilityChoiceHint\(item\)/g) ?? []).length === 2);

/* ------------------------------------------------------------------ *
 * C. Specialist skills from any item declaring the flag
 * ------------------------------------------------------------------ */

ok("C1 an ability with the literal flag declares specialist skills", specialist.declaresSpecialistSkills({ flags: { "trg-prime": { grantedSpecialistSkills: "Folk Lore" } } }));
ok("C2 two names count", specialist.declaresSpecialistSkills({ flags: { "trg-prime": { grantedSpecialistSkills: "Canon Lore, Heresy Lore" } } }));
ok("C2b a chooser (specialistChoice) declares one too, so its answer leaves with the item", specialist.declaresSpecialistSkills({ flags: { "trg-prime": { specialistChoice: { label: "Terrain Lore" } } } }) && !specialist.declaresSpecialistSkills({ flags: { "trg-prime": { specialistChoice: "yes" } } }));
ok("C3 a blank flag does not", !specialist.declaresSpecialistSkills({ flags: { "trg-prime": { grantedSpecialistSkills: " , " } } }));
ok("C4 the printed field alone does not (a feat's specialistSkill text was never a grant)", !specialist.declaresSpecialistSkills({ system: { specialistSkill: "Stone Lore" }, flags: {} }));
ok("C5 no flags at all", !specialist.declaresSpecialistSkills({}) && !specialist.declaresSpecialistSkills(null));
equal("C6 specialistNamesFor still prefers the literal flag", specialist.specialistNamesFor({ flags: { "trg-prime": { grantedSpecialistSkills: "Folk Lore" } }, system: { specialistSkills: "Other" } }), ["Folk Lore"]);
const gw = read("module/grants-workflow.mjs");
ok("C7 STRUCTURAL: the apply side reaches non-foundation items that declare", /FOUNDATION_ITEM_TYPES\.includes\(sourceItem\.type\) \|\| declaresSpecialistSkills\(sourceItem\)/.test(gw));
ok("C8 STRUCTURAL: the cleanup side mirrors it", /FOUNDATION_ITEM_TYPES\.includes\(item\.type\) \|\| declaresSpecialistSkills\(item\)/.test(read("module/grant-cleanup.mjs")));
const autorun = read("module/grant-autorun.mjs");
// Re-anchored at 3.667.1: an owed conviction point is a third reason to visit.
ok("C9 STRUCTURAL: the sweep counts the flag as a declaration", /&& !declaresGrants\(item\.system, GRANT_FIELDS\[item\.type\]\)\n\s*&& !declaresSpecialistSkills\(item\)\n[\s\S]{0,200}&& !owesConvictionPoint\(item\)\) continue;/.test(autorun));
ok("C10 STRUCTURAL: the createItem watcher counts it too", /if \(!declaresGrants\(item\.system, GRANT_FIELDS\[item\.type\]\) && !declaresSpecialistSkills\(item\)\n[\s\S]{0,200}&& !owesConvictionPoint\(item\)\) return;/.test(autorun));

/* ------------------------------------------------------------------ *
 * D. Grants and gates
 * ------------------------------------------------------------------ */

ok("D1 STRUCTURAL: an ability grants spells (levelled), abilities and feats",
  /ability: \[\s*\{ field: "grantedSpells", pack: "spells", levelled: true \},\s*\{ field: "grantedAbilities", pack: "abilities" \},\s*\{ field: "grantedFeats", pack: "feats" \}\s*\]/.test(gw));
ok("D2 STRUCTURAL: a class grants spells, levelled", /class: \[[\s\S]*?\{ field: "grantedSpells", pack: "spells", levelled: true \}\s*\]/.test(gw));
ok("D3 STRUCTURAL: an ability's arrival applies its own grants", /"feat", "creature-type",[\s\S]*?"ability"\s*\]\);/.test(autorun));
const tmpl = JSON.parse(read("template.json"));
equal("D4 the ability template carries the three grant fields", ["grantedSpells", "grantedAbilities", "grantedFeats"].map((f) => tmpl.Item.ability[f]), ["", "", ""]);
equal("D5 the class template carries grantedSpells", tmpl.Item.class.grantedSpells, "");
const hbs = read("templates/item/item-sheet.hbs");
ok("D6 the item sheet exposes them", /isAbility[\s\S]*?system\.grantedSpells[\s\S]*?system\.grantedAbilities[\s\S]*?system\.grantedFeats[\s\S]*?isRace/.test(hbs) && /Granted Gear[\s\S]*?system\.grantedSpells[\s\S]*?Magical Tradition/.test(hbs));
equal("D7 a levelled ability grant parses as the aspect's do", grants.parseMaybeLevelledGrantList("1: Doctrinal Ward, 7: Word of Censure"), [{ level: 1, name: "Doctrinal Ward" }, { level: 7, name: "Word of Censure" }]);

api.resetModuleRegistry();
const pf = read("module/picker-filters.mjs");
// barredClasses is exported and pure — but picker-filters imports
// Foundry-free modules only, so it can be driven directly.
const filters = await import(new URL("../module/picker-filters.mjs", import.meta.url));
equal("D8 a core class is barred by 'Non-Fighter'", filters.barredClasses("Non-Fighter, BAB +3"), ["fighter"]);
equal("D9 an unregistered module class name is not", filters.barredClasses("Non-Healer"), []);
api.registerClass("Healer", { wealth: 1 });
equal("D10 ...and is once registered", filters.barredClasses("Non-Healer"), ["healer"]);
ok("D11 the archetype branch reads registered class names as gates", /const traitClasses = archTraits\.filter\(\(t\) => CLASS_NAMES\.includes\(t\) \|\| registeredClassNames\(\)\.includes\(t\)\);/.test(pf));
ok("D12 STRUCTURAL: an archetype a CLASS grants is waived from progression", /if \(sourceId && actor\?\.items\?\.get\?\.\(sourceId\)\?\.type === "class"\) return false;/.test(pf));
ok("D13 STRUCTURAL: the three named waiver choosers still are", /ARCHETYPE_WAIVER_ABILITY_NAMES\.has\(sourceName\)\) return false;/.test(pf));
ok("D14 STRUCTURAL: action gates read feats and abilities", /\.filter\(\(i\) => i\.type === "feat" \|\| i\.type === "ability"\)\s*\.map\(\(i\) => i\.name\);\s*action = applyTraitRemovals/.test(read("module/combat/action-workflow.mjs")));
ok("D15 STRUCTURAL: the sheet's requiresFeat and substitution list includes abilities", /\.map\(\(i\) => i\.name\)\s*\.concat\(abilityNames\);/.test(sheet));
api.resetModuleRegistry();

/* ------------------------------------------------------------------ *
 * Z. The pinned total
 * ------------------------------------------------------------------ */
const EXPECTED_CHECKS = 59;
equal("Z1 the suite ran every check it is meant to", checks + 1, EXPECTED_CHECKS);

if (failures.length) {
  console.log(`verify-module-classes: ${checks} checks — ${failures.length} FAILED\n`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`verify-module-classes: ${checks} checks — all green.`);
}
