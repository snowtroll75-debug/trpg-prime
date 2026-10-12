#!/usr/bin/env node
/**
 * verify-feat-gates — 3.627.0: a module may gate a trait's feats behind
 * owning another feat, and may make a group of feats exclusive (Pillars of
 * Faith, Chapter 9: "Type-specific class feats require the named Unliving
 * Archetype"; "a character may only ever select one Unliving Archetype
 * Feat"). Also the owned-exclusion fix: a feat picked from a MODULE pack
 * counts as owned.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const api = await import(new URL("../module/module-api.mjs", import.meta.url));
const pf = await import(new URL("../module/picker-filters.mjs", import.meta.url));

const ARCHETYPES = ["Unliving Skeleton", "Unliving Zombie", "Unliving Ghoul", "Unliving Mummy", "Unliving Vampire", "Unliving Ghost", "Unliving Lich"];
api.resetModuleRegistry();
ok("A1 a gate registers", api.registerFeatGate("Unliving", ARCHETYPES, "test"));
ok("A2 a second registration for another trait registers", api.registerFeatGate("Unliving-Skeleton", ["Unliving Skeleton"], "test"));
ok("A3 a gate with no feats is refused and reported", !api.registerFeatGate("Spirit", [], "test") && api.registrationProblems().some((p) => p.startsWith("registerFeatGate")));

/* B. The gate, pure */
equal("B1 a feat with a gated trait is blocked for an actor owning none of the openers", api.featGateBlock("Unliving", ["Power Attack"])?.trait, "unliving");
equal("B2 owning any opener opens it, whatever the case", api.featGateBlock("Unliving", ["unliving ghoul"]), null);
equal("B3 a type trait needs its own archetype — another Unliving archetype does not open it", api.featGateBlock("Movement, Unliving-Skeleton", ["Unliving Ghoul"])?.trait, "unliving-skeleton");
equal("B4 the right archetype opens the type trait", api.featGateBlock("Movement, Unliving-Skeleton", ["Unliving Skeleton"]), null);
equal("B5 a feat with no gated trait is never blocked", api.featGateBlock("Martial, Movement", []), null);
equal("B6 two gated traits are two requirements", api.featGateBlock("Unliving, Unliving-Skeleton", ["Unliving Ghoul"])?.trait, "unliving-skeleton");
equal("B8 an opener is not kept behind its own trait — the archetypes print Unliving themselves", [api.featGateBlock("Unliving", [], "Unliving Lich"), api.featGateBlock("Unliving", [], "Bloodless Frame")?.trait], [null, "unliving"]);
equal("B7 the traits line splits on commas and semicolons, trims and lowercases", api.featGateBlock(" Soul ; UNLIVING ,Healing", [])?.trait, "unliving");

/* C. Exclusive groups, pure */
ok("C1 an exclusive group registers", api.registerExclusiveFeats("Unliving Archetype", ARCHETYPES, "test"));
ok("C2 a group of one is refused", !api.registerExclusiveFeats("Lonely", ["One"], "test"));
equal("C3 owning one member conflicts with another", api.exclusiveFeatConflict("Unliving Lich", ["Power Attack", "Unliving Vampire"]), { group: "Unliving Archetype", held: "Unliving Vampire" });
equal("C4 owning the feat itself is not a conflict", api.exclusiveFeatConflict("Unliving Vampire", ["Unliving Vampire"]), null);
equal("C5 a feat outside every group never conflicts", api.exclusiveFeatConflict("Warrior", ["Unliving Vampire"]), null);
ok("C6 the refusal names what is held and the group", /already holds Unliving Vampire, and a character may hold only one Unliving Archetype feat/.test(api.exclusiveFeatRefusal("Unliving Lich", ["Unliving Vampire"], "Mara") ?? ""));
equal("C7 a deliberate script passes with trgAllowExclusiveFeat", api.exclusiveFeatRefusal("Unliving Lich", ["Unliving Vampire"], "Mara", { trgAllowExclusiveFeat: true }), null);

/* D. The picker wrapper */
const actor = (names) => ({ items: names.map((n) => ({ type: "feat", name: n })) });
const unliving = { name: "Bloodless Frame", system: { traits: "Unliving" } };
const skeleton = { name: "Bone Stride", system: { traits: "Movement, Unliving-Skeleton" } };
const lich = { name: "Unliving Lich", system: { traits: "Unliving" } };
const firstArchetype = pf.withFeatGates(null, actor(["Power Attack"]), "archetypeFeat");
const plain = { name: "Power Attack", system: { traits: "Martial" } };
const f0 = pf.withFeatGates(null, actor(["Power Attack"]), "classFeat");
equal("D1 with no archetype: generic and type feats hidden, others shown", [unliving, skeleton, plain].map(f0), [false, false, true]);
const f1 = pf.withFeatGates(null, actor(["Unliving Skeleton"]), "classFeat");
equal("D2 a Skeleton sees the generic and its own type's feats", [unliving, skeleton].map(f1), [true, true]);
const f2 = pf.withFeatGates(null, actor(["Unliving Skeleton"]), "archetypeFeat");
equal("D3 a Skeleton is not offered a second Unliving archetype", f2(lich), false);
equal("D3b a character with none is offered the archetypes", firstArchetype(lich), true);
equal("D4 the wrapper keeps the base filter's answer", pf.withFeatGates(() => false, actor(["Unliving Skeleton"]), "classFeat")(unliving), false);
equal("D5 other slots are untouched", pf.withFeatGates(null, actor([]), "racialAbility"), null);
equal("D6 owned feats are read from feat items only", pf.ownedFeatNames({ items: [{ type: "feat", name: "A" }, { type: "ability", name: "B" }] }), ["A"]);

/* E. Owned exclusion counts module packs */
const packs = [
  { collection: "trg-prime.feats", metadata: { packageName: "trg-prime", name: "feats", type: "Item" } },
  { collection: "trg-pillars-of-faith.pof-feats", metadata: { packageName: "trg-pillars-of-faith", name: "pof-feats", type: "Item", flags: { "trg-prime": { extends: "feats" } } } },
  { collection: "other.unrelated", metadata: { packageName: "other", name: "unrelated", type: "Item", flags: { "trg-prime": { extends: "spells" } } } }
];
equal("E1 the system pack still counts as owned", [...pf.ownedSourceIds({ items: [{ _stats: { compendiumSource: "Compendium.trg-prime.feats.Item.systemfeat000001" } }] }, "feats", packs)], ["systemfeat000001"]);
const owner = { items: [
  { _stats: { compendiumSource: "Compendium.trg-pillars-of-faith.pof-feats.Item.abcdefghijklmnop" } },
  { _stats: { compendiumSource: "Compendium.other.unrelated.Item.zzzzzzzzzzzzzzzz" } }
] };
equal("E2 a feat picked from the module pack counts as owned; an unrelated pack's does not", [...pf.ownedSourceIds(owner, "feats", packs)], ["abcdefghijklmnop"]);
equal("E3 copies are counted across the federation too", pf.ownedCopies(owner, "feats", "abcdefghijklmnop", packs), 1);

/* F. Wiring */
const sheet = read("module", "sheets", "actor-sheet.mjs");
ok("F1 the picker chain wraps the owned exclusion in the feat gates", /withFeatGates\(withOwnedExclusion\(buildPickerFilter\(slotKey, context\), this\.actor, slotKey\), this\.actor, slotKey\)/.test(sheet));
const item = read("module", "documents", "item.mjs");
ok("F2 creation refuses a second exclusive feat beside the second-aspect refusal", /if \(this\._refusedAsSecondAspect\(options\)\) return false;\s*if \(this\._refusedAsExclusiveFeat\(options\)\) return false;/.test(item) && /const refusal = exclusiveFeatRefusal\(this\.name, owned, actor\.name, options\);/.test(item));
const wf = read("module", "module-api-workflow.mjs");
ok("F3 both registrations are on the module API", /registerFeatGate: \(trait, featNames, moduleId\) => registerFeatGate\(trait, featNames, moduleId\)/.test(wf) && /registerExclusiveFeats: \(group, featNames, moduleId\) => registerExclusiveFeats\(group, featNames, moduleId\)/.test(wf));

ok("F4 a module Use can heal and roll through the API (3.627.0)", /healActor: async \(\.\.\.args\) => \(await import\("\.\/magic\/spell-effects\.mjs"\)\)\.healActor\(\.\.\.args\)/.test(wf) && /rollCheck: async \(config\) => \{[\s\S]{0,160}\.TRGCheck\.roll\(withCheckModifiers\(config\)\)/.test(wf)
  && /applyConditionTagsTo: async \(target, tags, options = \{\}\) => \{\s*const \{ relayConditionTags \} = await import\("\.\/combat\/target-relay-workflow\.mjs"\);\s*return relayConditionTags\(target, tags, options, \(\) => applyConditionTags\(target, tags, options\)\);/.test(wf));

api.resetModuleRegistry();
const EXPECTED = 33;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-feat-gates: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-feat-gates: ${checks} checks — all green.`);
