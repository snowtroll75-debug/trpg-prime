#!/usr/bin/env node
/**
 * verify-module-feats — what a companion module's FEATS need from the
 * system (3.571.0), shipped with Pillars of Faith's Chapter 5.
 *
 * DRIVEN, pure:
 *   A  Registered feat access — registerFeatAccess and
 *      hasRegisteredFeatAccess: a race or class list opens a feat by
 *      name, case-blind, to any owner in a comma-joined list; a bad kind,
 *      an empty owner or an empty list registers nothing; two
 *      registrations for one owner merge; the registry resets.
 *   B  The pickers read it — buildPickerFilter's racialFeat and classFeat
 *      branches admit a feat tagged for another race or class once the
 *      list is registered, and refuse it before.
 *   C  Modifier ally auras — allyAuraConditionals yields typed rows with
 *      the value, the traits split into the exact and judged rows, an
 *      aura may name actions, and a modifier without a usable value
 *      yields nothing.
 *
 * STRUCTURAL, marked so: a feat's grantedWeapons field from the
 * companions pack (template, grant table, sheet), and the class-skill
 * chooser exposed to modules.
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

const api = await import(new URL("../module/module-api.mjs", import.meta.url));
const filters = await import(new URL("../module/picker-filters.mjs", import.meta.url));
const auras = await import(new URL("../module/aura-conditionals.mjs", import.meta.url));

/* ------------------------------------------------------------------ *
 * A. Registered feat access
 * ------------------------------------------------------------------ */

api.resetModuleRegistry();
equal("A1 nothing registered → nothing opened", api.hasRegisteredFeatAccess("race", "Rhevani", "Self Aware"), false);
equal("A2 a race list registers", api.registerFeatAccess("race", "Rhevani", ["Self Aware", "Worldly"], "pof"), true);
equal("A3 ...and opens each feat to that race", ["Self Aware", "Worldly", "Familiar"].map((f) => api.hasRegisteredFeatAccess("race", "Rhevani", f)), [true, true, false]);
equal("A4 case-blind on owner and feat", api.hasRegisteredFeatAccess("race", "rhevani", "self aware"), true);
equal("A5 another race is not opened by it", api.hasRegisteredFeatAccess("race", "Eshari", "Self Aware"), false);
equal("A6 a comma-joined owner list passes on any member", [api.hasRegisteredFeatAccess("race", "Eshari, Rhevani", "Worldly"), api.hasRegisteredFeatAccess("race", "Eshari, Kethrani", "Worldly")], [true, false]);
equal("A7 a class list is a separate kind", [api.registerFeatAccess("class", "Archivist", ["Bardic Lore"], "pof"), api.hasRegisteredFeatAccess("class", "Archivist", "Bardic Lore"), api.hasRegisteredFeatAccess("race", "Archivist", "Bardic Lore")], [true, true, false]);
equal("A8 a second registration for one owner merges", [api.registerFeatAccess("class", "Archivist", "Familiar", "pof"), api.hasRegisteredFeatAccess("class", "Archivist", "Bardic Lore"), api.hasRegisteredFeatAccess("class", "Archivist", "Familiar")], [true, true, true]);
equal("A9 a bad kind registers nothing", api.registerFeatAccess("heritage", "Rhevani", ["Self Aware"], "pof"), false);
equal("A10 an empty owner registers nothing", api.registerFeatAccess("race", "  ", ["Self Aware"], "pof"), false);
equal("A11 an empty list registers nothing", api.registerFeatAccess("race", "Rhevani", [], "pof"), false);
equal("A12 an empty feat name is never opened", api.hasRegisteredFeatAccess("race", "Rhevani", ""), false);
ok("A13 the module id is noted as a contributor", api.registryContributors().includes("pof"));
api.resetModuleRegistry();
equal("A14 the registry resets", api.hasRegisteredFeatAccess("race", "Rhevani", "Self Aware"), false);

/* ------------------------------------------------------------------ *
 * B. The pickers read it
 * ------------------------------------------------------------------ */

const racialFeat = (name, sourceRace) => ({ name, system: { category: "Racial", sourceRace } });
const classFeat = (name, traits) => ({ name, system: { category: "Class", traits } });
const rf = filters.buildPickerFilter("racialFeat", { race: "Rhevani" });
equal("B1 a feat tagged for another race is refused before registration", rf(racialFeat("Self Aware", "Human")), false);
equal("B2 the race's own feat passes, an untagged feat passes", [rf(racialFeat("Rhevani Feat", "Rhevani")), rf(racialFeat("Open Feat", ""))], [true, true]);
api.registerFeatAccess("race", "Rhevani", ["Self Aware"], "pof");
equal("B3 ...and the registered feat passes for the race", rf(racialFeat("Self Aware", "Human")), true);
equal("B4 ...by name: another Human feat still does not", rf(racialFeat("Stone-Like Endurance", "Human")), false);
equal("B5 ...and not for a race the list did not name", filters.buildPickerFilter("racialFeat", { race: "Eshari" })(racialFeat("Self Aware", "Human")), false);
equal("B6 a non-racial entry is never a racial feat", rf({ name: "Self Aware", system: { category: "Class", sourceRace: "" } }), false);

const cf = filters.buildPickerFilter("classFeat", { class: "Archivist" });
equal("B7 a Bard-traited class feat is refused to the Archivist before registration", cf(classFeat("Bardic Lore", "Bard")), false);
api.registerFeatAccess("class", "Archivist", ["Bardic Lore"], "pof");
equal("B8 ...and admitted once registered", cf(classFeat("Bardic Lore", "Bard")), true);
equal("B9 ...by name: Inspire Courage is still the Bard's", cf(classFeat("Inspire Courage", "Bard")), false);
equal("B10 an untraited class feat passes regardless", cf(classFeat("Toughness", "")), true);
equal("B11 a class feat the Archivist's own trait opens still passes", cf(classFeat("Perfect Exegesis", "Archivist")), true);
equal("B12 an effective class list with the Archivist in it is opened too", filters.buildPickerFilter("classFeat", { class: "Fighter, Archivist" })(classFeat("Bardic Lore", "Bard")), true);
api.resetModuleRegistry();
equal("B13 after the reset the Bard feat is refused again", cf(classFeat("Bardic Lore", "Bard")), false);

/* ------------------------------------------------------------------ *
 * C. Modifier ally auras
 * ------------------------------------------------------------------ */

const emitter = { id: "em1", name: "Keeper" };
const modifierAura = { id: "keeper", kind: "ally", name: "Keeper at the Threshold", radius: 10, triggers: ["enter"], grants: { kind: "modifier", value: 1, type: "status", traits: ["possession"], scope: "saving throws against possession" } };
const rows = auras.allyAuraConditionals(modifierAura, emitter);
equal("C1 a traited modifier aura yields the exact and judged rows", rows.map((r) => r.id), ["aura-grant:em1:keeper:exact", "aura-grant:em1:keeper:judged"]);
equal("C2 both rows carry the kind, value and type", rows.map((r) => [r.kind, r.value, r.type]), [["modifier", 1, "status"], ["modifier", 1, "status"]]);
equal("C3 the exact row is automatic on the trait; the judged row is offered and excludes it", [rows[0].auto, rows[0].when, rows[1].auto, rows[1].when], [true, { checkTypes: ["save"], traits: ["possession"] }, false, { checkTypes: ["save"], not: { traits: ["possession"] } }]);
equal("C4 the label names the emitter", rows[0].label, "Keeper at the Threshold (Keeper)");
const untraited = auras.allyAuraConditionals({ ...modifierAura, grants: { kind: "modifier", value: 2, type: "circumstance", scope: "resisting being moved" } }, emitter);
equal("C5 an untraited modifier aura yields one offered row with its figure", untraited.map((r) => [r.id, r.auto, r.value, r.type]), [["aura-grant:em1:keeper", false, 2, "circumstance"]]);
const actioned = auras.allyAuraConditionals({ ...modifierAura, grants: { kind: "modifier", value: 1, type: "status", checkTypes: ["skill"], actions: ["senseDirection"], scope: "Sense Direction" } }, emitter);
equal("C6 an aura may name the actions it reaches", actioned.map((r) => r.when), [{ checkTypes: ["skill"], actions: ["senseDirection"] }]);
equal("C7 a modifier with no value yields nothing", auras.allyAuraConditionals({ ...modifierAura, grants: { kind: "modifier", type: "status", scope: "x" } }, emitter), []);
equal("C8 a modifier of zero yields nothing", auras.allyAuraConditionals({ ...modifierAura, grants: { kind: "modifier", value: 0, type: "status", scope: "x" } }, emitter), []);
equal("C9 a modifier's value is truncated to an integer and its type lower-cased", auras.allyAuraConditionals({ ...modifierAura, grants: { kind: "modifier", value: 1.9, type: "Status", scope: "x" } }, emitter).map((r) => [r.value, r.type]), [[1, "status"]]);
equal("C10 a missing type falls to circumstance", auras.allyAuraConditionals({ ...modifierAura, grants: { kind: "modifier", value: 1, scope: "x" } }, emitter)[0].type, "circumstance");
const advantage = auras.allyAuraConditionals({ ...modifierAura, grants: { kind: "advantage", traits: ["fear"], scope: "x" } }, emitter);
equal("C11 an advantage aura carries no figure (unchanged)", advantage.map((r) => ["value" in r, "type" in r, r.kind]), [[false, false, "advantage"], [false, false, "advantage"]]);

/* ------------------------------------------------------------------ *
 * D. Structural: weapons from a feat, the chooser for modules
 * ------------------------------------------------------------------ */

const gw = read("module/grants-workflow.mjs");
ok("D1 STRUCTURAL: a feat's grant table includes grantedWeapons from the companions pack", /feat: \[[\s\S]*?\{ field: "grantedWeapons", pack: "companions" \}[\s\S]*?\],\s*\/\/ Appendix 4/.test(gw));
ok("D2 STRUCTURAL: the feat template carries the field", /"grantedWeapons": ""/.test(read("template.json")) && (read("template.json").match(/"grantedWeapons": ""/g) ?? []).length >= 2);
ok("D3 STRUCTURAL: the item sheet exposes it beside a feat's granted spells", /system\.grantedSpells[\s\S]*?Granted Weapons[\s\S]*?system\.grantedWeapons/.test(read("templates/item/item-sheet.hbs")));
ok("D4 STRUCTURAL: useClassSkillGrant is a module helper that finds the registered entry by the item's name", /useClassSkillGrant: async \(actor, item\) => \{\s*const grant = CLASS_SKILL_GRANTS\.find\(\(g\) => g\.name === normalise\(item\?\.name\)\);/.test(read("module/feats-workflow.mjs")));
ok("D5 STRUCTURAL: registerFeatAccess is on the public API object", /registerFeatAccess: \(kind, ownerName, featNames, moduleId\) => registerFeatAccess\(kind, ownerName, featNames, moduleId\)/.test(read("module/module-api-workflow.mjs")));

/* ------------------------------------------------------------------ *
 * Z. The pinned total
 * ------------------------------------------------------------------ */
const EXPECTED_CHECKS = 44;
equal("Z1 the suite ran every check it is meant to", checks + 1, EXPECTED_CHECKS);

if (failures.length) {
  console.log(`verify-module-feats: ${checks} checks — ${failures.length} FAILED\n`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`verify-module-feats: ${checks} checks — all green.`);
}
