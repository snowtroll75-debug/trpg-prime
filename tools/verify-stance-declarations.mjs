#!/usr/bin/env node
/**
 * verify-stance-declarations — 3.664.0: stances a module can enter and
 * read, stance-gated declarations, and the creature-trait axes (Inner
 * Tempest's Spirit Stance, Martial Affinity and Tranquil Mind).
 *
 *   A  what counts as a stance
 *   B  stance-gated conditionals
 *   C  stance-gated defence rows, and the trait axis on the defence channel
 *   D  the target-trait axis on conditionals
 *   E  the target-trait axis on magical attacks
 *   F  the wiring (and the move/strike helpers a module ability uses)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const sd = await import(new URL("../module/stance-declarations.mjs", import.meta.url));
const cond = await import(new URL("../module/conditionals.mjs", import.meta.url));
const ddc = await import(new URL("../module/combat/defence-dc.mjs", import.meta.url));
const ma = await import(new URL("../module/combat/magical-attacks.mjs", import.meta.url));

const F = (flags) => ({ "trg-prime": flags });
const stance = { id: "s1", name: "Crane Stance", flags: F({ featStance: true, featSource: "x" }) };
const offStance = { ...stance, id: "s2", disabled: true };
const fightDef = { id: "fd", name: "Fight Defensively", flags: F({ stanceExpiresAtTurnStart: true }) };

/* A — what counts as a stance */
equal("A1 a feat stance's effect is a stance; a disabled one is not", [sd.inAnyStance([stance]), sd.inAnyStance([offStance])], [true, false]);
equal("A2 Fight Defensively's effect is not a stance (its action has no Stance trait)", [sd.activeStanceEffects([fightDef]).length, sd.inAnyStance([fightDef]), sd.inAnyStance([fightDef, stance])], [0, false, true]);
equal("A3 the active stances are listed in order", sd.activeStanceEffects([fightDef, stance, offStance]).map((e) => e.id), ["s1"]);
equal("A4 gated rows are read only as arrays", [sd.stanceGatedRows({ flags: F({ stanceConditionals: [{ a: 1 }] }) }, "stanceConditionals").length, sd.stanceGatedRows({ flags: F({ stanceConditionals: { a: 1 } }) }, "stanceConditionals").length, sd.stanceGatedRows(null, "stanceConditionals").length], [1, 0, 0]);

/* B — stance-gated conditionals */
const affinity = {
  id: "ma", name: "Martial Affinity", type: "ability",
  flags: F({
    conditionals: [{ kind: "modifier", value: 1, type: "race", label: "Plain", auto: true, when: { checkTypes: ["skill"] } }],
    stanceConditionals: [{ kind: "modifier", value: 1, type: "race", label: "Martial Affinity", auto: true, when: { checkTypes: ["attack"] } }]
  })
};
const outOf = cond.collectConditionals([affinity], [fightDef]);
const inIt = cond.collectConditionals([affinity], [stance]);
equal("B1 out of a stance only the plain row is read", outOf.map((e) => e.label), ["Plain"]);
equal("B2 in a stance the gated row joins it, with its own id", [inIt.map((e) => e.label), new Set(inIt.map((e) => e.id)).size], [["Plain", "Martial Affinity"], 2]);
equal("B3 a disabled stance gates nothing", cond.collectConditionals([affinity], [offStance]).map((e) => e.label), ["Plain"]);
const gatedOnly = { id: "tm", name: "Tranquil Mind", type: "feat", flags: F({ stanceConditionals: [{ kind: "advantage", label: "Tranquil Mind", auto: true, when: { checkTypes: ["save"], traits: ["emotion", "fear"] } }] }) };
equal("B4 an item with only gated rows is read in a stance and not out of one", [cond.collectConditionals([gatedOnly], [stance]).length, cond.collectConditionals([gatedOnly], []).length], [1, 0]);
const applied = cond.automaticSelections(cond.collectConditionals([affinity], [stance]), { checkType: "attack" });
equal("B5 the gated row applies on an attack, typed racial", applied.modifiers.map((m) => [m.value, m.type]), [[1, "race"]]);

/* C — stance-gated defence rows and the trait axis */
const actor = (items, effects) => ({ items, appliedEffects: effects });
const dbItem = { id: "ma", name: "Martial Affinity", flags: F({ stanceDefenceDC: [{ dc: "defence", value: 1, label: "Martial Affinity" }], defenceDC: [{ dc: "defence", value: 2, label: "Unscoped" }] }) };
equal("C1 a gated defence row needs no other scope, and counts only in a stance", [ddc.defenceDCBonus(actor([dbItem], [stance]), "defence", "").total, ddc.defenceDCBonus(actor([dbItem], []), "defence", "").total], [1, 0]);
ok("C2 an ungated unscoped row is still refused", ddc.collectDefenceDC(actor([dbItem], [stance])).every((e) => e.label !== "Unscoped"));
const spiritDb = { id: "ss", name: "Spirit Stance", flags: F({ featStance: true, defenceDC: [{ dc: "defence", value: 1, label: "Spirit Stance", when: { sourceTraits: ["spirit", "incorporeal"] } }] }) };
equal("C3 a trait-scoped row counts against an attacker with the trait, not one without, not an unknown one",
  [ddc.defenceDCBonus(actor([], [spiritDb]), "defence", "", ["undead"], "", [], ["incorporeal", "undead"]).total,
   ddc.defenceDCBonus(actor([], [spiritDb]), "defence", "", ["undead"], "", [], ["undead"]).total,
   ddc.defenceDCBonus(actor([], [spiritDb]), "defence", "").total], [1, 0, 0]);
equal("C4 a trait string is read as a list", ddc.defenceDCBonus(actor([], [spiritDb]), "defence", "", [], "", [], "Spirit, Haunt").total, 1);
ok("C5 a row scoped by traits alone is legal", ddc.normaliseDefenceDC({ dc: "defence", value: 1, when: { sourceTraits: ["spirit"] } }) !== null);

/* D — the target-trait axis on conditionals */
const vsSpirit = cond.normaliseConditional({ kind: "modifier", value: 1, type: "circumstance", label: "Spirit Stance", auto: true, when: { checkTypes: ["attack"], targetTraits: ["spirit", "incorporeal"] } }, { id: "x" });
equal("D1 a target-trait entry matches a target with the trait, not one without, not no target",
  [cond.matchesCheck(vsSpirit, { checkType: "attack", targetTraits: ["incorporeal"] }), cond.matchesCheck(vsSpirit, { checkType: "attack", targetTraits: ["undead"] }), cond.matchesCheck(vsSpirit, { checkType: "attack" })], [true, false, false]);
const notSpirit = cond.normaliseConditional({ kind: "modifier", value: 1, label: "Possessor", when: { checkTypes: ["attack"], not: { targetTraits: ["spirit", "incorporeal"] } } }, { id: "y" });
equal("D2 the exclusion stands the manual row down when the target is a spirit", [cond.matchesCheck(notSpirit, { checkType: "attack", targetTraits: "Spirit" }), cond.matchesCheck(notSpirit, { checkType: "attack", targetTraits: "" })], [false, true]);
ok("D3 the axis is declared with its context key", cond.SCOPE_AXES.includes("targetTraits") && cond.AXIS_CONTEXT_KEYS.targetTraits === "targetTraits");

/* E — magical attacks against a trait */
const declared = ma.declaredMagicalAttacks([{ name: "Spirit Stance", flags: F({ magicalAttacks: { label: "Spirit Stance", targetTraits: ["Incorporeal", "spirit"] } }) }]);
equal("E1 the declaration keeps its traits, folded", declared[0].targetTraits, ["incorporeal", "spirit"]);
equal("E2 it makes a strike magical against those traits only", [Boolean(ma.magicalAttackSource(declared, { targetTraits: ["incorporeal"] })), Boolean(ma.magicalAttackSource(declared, { targetTraits: ["undead"] })), Boolean(ma.magicalAttackSource(declared, {}))], [true, false, false]);
const plain = ma.declaredMagicalAttacks([{ name: "Sanctioned", flags: F({ magicalAttacks: { label: "x" } }) }]);
ok("E3 a declaration without traits still reaches every strike", Boolean(ma.magicalAttackSource(plain, {})));

/* F — the wiring */
const aw = read("module", "combat", "attack-workflow.mjs");
ok("F1 the weapon attack hands the target's traits to the conditionals", /targetTypes: creatureTypesOf\(targetActor\?\.system \?\? \{\}\),\s*(\/\/[^\n]*\n\s*)*targetTraits: creatureTraits\(targetActor\?\.system \?\? \{\}\),\s*(\/\/[^\n]*\n\s*)*attackMode: isRanged/.test(aw));
ok("F2 …the attacker's traits to the defender's channel", aw.includes('defenceDCBonus(targetActor, "defence", "", attackerTypes, actor?.uuid ?? "", attackerAlignments, creatureTraits(actor.system ?? {}))'));
ok("F3 …and the target's traits to the magical-attack test", aw.includes('weaponName: weapon?.name ?? "", targetTraits: creatureTraits(targetActor?.system ?? {}) }))'));
const acw = read("module", "combat", "action-workflow.mjs");
ok("F4 an action's dialog and roll both carry the target's traits", (acw.match(/targetTypes: creatureTypesOf\(targetActor\?\.system \?\? \{\}\),\s*targetTraits: creatureTraits\(targetActor\?\.system \?\? \{\}\),/g) ?? []).length === 2);
ok("F5 an action against a static DC tells the defender the attacker's traits", acw.includes('creatureTypesOf(actor?.system ?? {}), actor?.uuid ?? "", [], creatureTraits(actor?.system ?? {}));'));
ok("F6 a bomb does too", /alignedTraitsOf\(actor\.system \?\? \{\}\),\s*creatureTraits\(actor\.system \?\? \{\}\)\s*\);/.test(read("module", "alchemical-workflow.mjs")));
const chk = read("module", "dice", "check.mjs");
ok("F7 the check carries the axis into its automatic conditionals", /this\.targetTraits = config\.targetTraits \?\? "";/.test(chk) && /targetTraits: check\.targetTraits/.test(chk));
ok("F8 the dialog supplies it", /sourceTypes, targetTypes, sourceUuid, targetUuid, attackMode, targetTraits/.test(read("module", "apps", "check-dialog.mjs")));
const fw = read("module", "feats-workflow.mjs");
ok("F9 the module helpers enter stances and list them", /enterStance: \(actor, item, options = \{\}\) => enterFeatStance\(actor, item, options\),/.test(fw) && /activeStances: \(actor\) => activeStanceEffects\(Array\.from\(actor\?\.effects \?\? \[\]\)\),/.test(fw));
ok("F10 a stance's own flags ride on its effect and cannot unmake it a stance", /\.\.\.\(flags && typeof flags === "object" \? flags : \{\}\),\s*\[FEAT_STANCE_FLAG\]: true,\s*\[FEAT_SOURCE_FLAG\]: item\.id,/.test(fw));
ok("F11 a refused stance says so to its caller", /before using another\.`\);\s*return false;/.test(fw) && /\$\{apCost\} AP required\.`\);\s*return false;\s*\}\s*const existing = Array\.from\(actor\.effects/.test(fw) && /\.\.\.extraLines\s*\]\);\s*return true;\s*\}/.test(fw));
const api = read("module", "module-api-workflow.mjs");
ok("F12 a module ability can arm a free move on the compound-leg rail", /armMove: async \(actor, leg = \{\}, label = ""\) => \{\s*const \{ armCompoundLeg \} = await import\("\.\/combat\/compound-action-workflow\.mjs"\);[\s\S]{0,400}provokes: leg\.provokes !== false\s*\};\s*return armCompoundLeg\(actor, clean, String\(label \|\| "Move"\)\);/.test(api));
ok("F13 …and roll the Strike workflow itself", /rollWeaponAttack: async \(\.\.\.args\) => \(await import\("\.\/combat\/attack-workflow\.mjs"\)\)\.rollWeaponAttack\(\.\.\.args\),/.test(api));
ok("F14 …and ask and record the trait rules as a core action does", /traitGate: async \(\.\.\.args\) => \(await import\("\.\/traits-workflow\.mjs"\)\)\.traitGate\(\.\.\.args\),/.test(api) && /recordTraitUsage: async \(\.\.\.args\) => \(await import\("\.\/traits-workflow\.mjs"\)\)\.recordTraitUsage\(\.\.\.args\),/.test(api));

const EXPECTED = 35;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-stance-declarations: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-stance-declarations: ${checks} checks — all green.`);
