#!/usr/bin/env node
/**
 * verify-damage-riders — two 3.564.0 mechanisms from Graham's rulings on
 * Pillars of Faith 0.3.0's Judgement and Inquisition.
 *
 *   A  DECLARED STRIKE RIDERS (combat/damage-riders.mjs, pure): an effect
 *      declaring `strikeDamageRider {dice, label, targetUuids, oncePerRound}`
 *      adds its dice to a Strike's damage — against the named creature
 *      only, once a round when it says so — and the marker resets with
 *      the round. Driven end to end on plain objects.
 *   B  SCALED CONDITIONALS (conditionals.mjs): `valueFrom: "classBonus"`
 *      resolves to the actor's CURRENT class bonus at collection time,
 *      so a bonus written once keeps pace with every level.
 *   C  STRUCTURAL, marked: the attack workflow asks, appends, prints and
 *      burns; the round reset clears the map; both collection sites hand
 *      over the scaling.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

const riders = await import(new URL("../module/combat/damage-riders.mjs", import.meta.url));
const cond = await import(new URL("../module/conditionals.mjs", import.meta.url));

/* A. Declared strike riders */
const flag = (r) => ({ "trg-prime": { strikeDamageRider: r } });
const judged = { id: "e1", name: "Judgement: Rat", flags: flag({ dice: "1d6", label: "Judgement", targetUuids: ["Actor.rat"], oncePerRound: true }) };
const blanket = { id: "e2", name: "Blessed Blade", flags: flag({ dice: "2d4", label: "Blessed Blade" }) };
const disabled = { id: "e3", name: "Off", disabled: true, flags: flag({ dice: "1d6" }) };
const malformed = { id: "e4", name: "Bad", flags: flag({ dice: "d6" }) };
const declared = riders.declaredDamageRiders([judged, blanket, disabled, malformed, null, { id: "e5", flags: {} }]);
equal("A1 two riders declared; disabled, malformed and undeclared dropped", declared.map((r) => r.id), ["e1", "e2"]);
equal("A2 dice parse to count and faces", declared.map((r) => [r.dice, r.count, r.faces]), [["1d6", 1, 6], ["2d4", 2, 4]]);
equal("A3 the label falls back to the effect name", riders.declaredDamageRiders([{ id: "x", name: "Hex", flags: flag({ dice: "1d8" }) }])[0].label, "Hex");
equal("A4 against the named creature both apply", riders.damageRidersFor(declared, { targetUuid: "Actor.rat" }).map((r) => r.id), ["e1", "e2"]);
equal("A5 against another creature only the blanket rider applies", riders.damageRidersFor(declared, { targetUuid: "Actor.ogre" }).map((r) => r.id), ["e2"]);
equal("A6 with no target the named rider sits out", riders.damageRidersFor(declared, {}).map((r) => r.id), ["e2"]);
equal("A7 a burnt once-per-round rider sits out", riders.damageRidersFor(declared, { targetUuid: "Actor.rat", used: { e1: true } }).map((r) => r.id), ["e2"]);
equal("A8 the formula fragment", riders.riderFormula(riders.damageRidersFor(declared, { targetUuid: "Actor.rat" })), " + 1d6 + 2d4");
equal("A9 no riders → empty fragment", riders.riderFormula([]), "");
equal("A10 burning marks only the once-per-round rider", riders.ridersBurnUpdate(declared, {}), { e1: true });
equal("A11 nothing new to burn → null (no write)", riders.ridersBurnUpdate(declared, { e1: true }), null);
equal("A12 a 3d6 rider at 17th parses", riders.declaredDamageRiders([{ id: "z", flags: flag({ dice: " 3d6 " }) }])[0].dice, "3d6");
equal("A13 the marker flag name is the one the round reset clears", riders.RIDERS_USED_FLAG, "damageRidersUsed");

/* B. Scaled conditionals */
const inq = { id: "i1", name: "Inquisition", flags: { "trg-prime": { conditionals: [{ kind: "modifier", valueFrom: "classBonus", type: "class", label: "Inquisition", scope: "x", when: { checkTypes: ["skill"] } }] } } };
equal("B1 valueFrom resolves to the current class bonus", cond.collectConditionals([], [inq], [], { classBonus: 3 })[0]?.value, 3);
equal("B2 ...and moves when the bonus does", cond.collectConditionals([], [inq], [], { classBonus: 5 })[0]?.value, 5);
equal("B3 without scaling the entry is dropped, not zeroed", cond.collectConditionals([], [inq], []).length, 0);
equal("B4 an unknown source is dropped", cond.collectConditionals([], [{ ...inq, flags: { "trg-prime": { conditionals: [{ kind: "modifier", valueFrom: "wealth", type: "class", label: "x", when: { checkTypes: ["skill"] } }] } } }], [], { wealth: 4, classBonus: 2 }).length, 0);
equal("B5 a zero class bonus is a no-op entry, dropped like a literal 0", cond.collectConditionals([], [inq], [], { classBonus: 0 }).length, 0);
equal("B6 sign -1 makes it a penalty", cond.collectConditionals([], [{ ...inq, flags: { "trg-prime": { conditionals: [{ kind: "modifier", valueFrom: "level", sign: -1, type: "circumstance", label: "x", when: { checkTypes: ["save"] } }] } } }], [], { level: 4 })[0]?.value, -4);
equal("B7 a literal value still works beside it", cond.collectConditionals([], [{ ...inq, flags: { "trg-prime": { conditionals: [{ kind: "modifier", value: 2, type: "class", label: "x", when: { checkTypes: ["skill"] } }] } } }], [], { classBonus: 9 })[0]?.value, 2);
// 3.625.0: the six ability modifiers join the figures (Scholarly Exegesis's Int-for-Wis swap).
equal("B8 scalingFor reads the actor's identity", (({ classBonus, level, halfLevel }) => ({ classBonus, level, halfLevel }))(cond.scalingFor({ system: { identity: { classBonus: 4, level: 7 } } })), { classBonus: 4, level: 7, halfLevel: 3 });
equal("B9 the three sources resolve", ["classBonus", "level", "halfLevel"].map((k) => cond.collectConditionals([], [{ id: "s", name: "s", flags: { "trg-prime": { conditionals: [{ kind: "modifier", valueFrom: k, type: "class", label: "x", when: { checkTypes: ["skill"] } }] } } }], [], { classBonus: 1, level: 2, halfLevel: 3 })[0]?.value), [1, 2, 3]);

/* C. Structural */
const aw = read("module/combat/attack-workflow.mjs");
ok("C1 the attack asks which riders apply, by the target's uuid and the marker map", /damageRidersFor\(\s*declaredDamageRiders\(Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)\),\s*\{\s*targetUuid: targetActor\?\.uuid \?\? "", used: actor\.getFlag\?\.\(SYSTEM_ID, RIDERS_USED_FLAG\) \?\? \{\},/.test(aw));
ok("C2 the hit burns the markers before damage rolls", /const ridersBurnt = ridersBurnUpdate\(damageRiders[\s\S]*?if \(ridersBurnt\) await actor\.setFlag\(SYSTEM_ID, RIDERS_USED_FLAG, ridersBurnt\);\s*(\/\/[^\n]*\n\s*)*const declaredDamage = await declaredDamageBonus\(actor, weapon, \{ skipPrompt: skipDialog\(event\) \}\);\s*damageOutcome = await resolveWeaponDamage/.test(aw));
ok("C3 the damage formula appends the riders", /formula \+= riderFormula\(damageRiders\);/.test(aw));
ok("C4 the card prints one line per rider", /for \(const rider of damageRiders \?\? \[\]\) \{\s*lines\.push\(line\(`<strong>\$\{rider\.label\}<\/strong> — \+\$\{rider\.dice\} secondary damage/.test(aw));
ok("C5 the riders reach resolveWeaponDamage as an argument", /damageRiders = \[\], targetSize = null/.test(aw) && /damageOutcome = await resolveWeaponDamage\(actor, weapon, \{\s*damageRiders,/.test(aw));
ok("C6 the round reset clears the marker map beside Precision Hunter's", /precisionHunterUsed`\]: deletionValue\(\),[\s\S]*?damageRidersUsed`\]: deletionValue\(\),/.test(read("module/documents/combat.mjs")));
ok("C7 the dialog hands over the scaling", /allyAuraConditionalsFor\(actor\),?[\s\S]{0,300}?\],\s*scalingFor\(actor\)\s*\)/.test(read("module/apps/check-dialog.mjs")));
ok("C8 the automatic path hands over the scaling", /allyAuraConditionalsFor\(check\.actor\)\s*\],\s*scalingFor\(check\.actor\)\s*\)/.test(read("module/dice/check.mjs")));

const EXPECTED_CHECKS = 31;
equal("Z1 the suite ran every check it is meant to", checks + 1, EXPECTED_CHECKS);
if (failures.length) { console.log(`verify-damage-riders: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-damage-riders: ${checks} checks — all green.`);
