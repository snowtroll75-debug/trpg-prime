#!/usr/bin/env node
/**
 * verify-ff30-block4 — 3.634.0, Fiends & Fables 3.0 block 4 (the Agothians
 * and the Angels; Graham's rulings of 12 October 2026: "go with your
 * recommendations for the rulings").
 *
 *   A  the pure rules, driven — regeneration's negating type and its hold
 *      on death, aligned packets' traits, ally-aura effects, versus damage
 *      against an alignment, the area damage-type choice, Harmonize
 *   B  the workflows read them where the rule lives (source anchors)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (p) => import(new URL(`../module/${p}`, import.meta.url));

/* ------------------------------------------------------------ A. regeneration (R2) */
const rg = await mod("regeneration-rules.mjs");
const regen = (name, extra = {}, active = true) => ({ name, type: "ability", system: { active }, flags: { "trg-prime": { creatureAbility: { derives: { turnStart: { kind: "regeneration", auto: true, ...extra } } } } } });
equal("A1 the negating type: declared, else the name's bracket; none without the derive", [
  rg.regenerationNegatedBy(regen("Regeneration 20 (Evil)")), rg.regenerationNegatedBy(regen("Regeneration", { negatedBy: ["Fire", "acid"] })),
  rg.regenerationNegatedBy({ name: "Regeneration 20 (Evil)", flags: {} })
], [["evil"], ["fire", "acid"], []]);
const r20 = regen("Regeneration 20 (Evil)");
equal("A2 active regeneration holds — not against its type in the blow or since its turn, nor when switched off", [
  rg.regenerationHolds([r20], { blowTypes: ["slashing"] })?.label, rg.regenerationHolds([r20], { blowTypes: ["aligned", "evil"] }),
  rg.regenerationHolds([r20], { sinceTypes: ["evil"] }), rg.regenerationHolds([regen("Regeneration 20 (Evil)", {}, false)], {})
], ["Regeneration 20 (Evil)", null, null, null]);
equal("A3 the types since its turn gather without repeats", rg.withDamageTypes(["fire"], ["Fire", "aligned", "evil"]), ["fire", "aligned", "evil"]);

/* ------------------------------------------------------------ A. aligned packets (R3) */
const sec = await mod("combat/creature-secondary.mjs");
equal("A4 an aligned packet carries its alignment as source traits; others none", [
  sec.alignedPacketTraits({ type: "aligned", parameter: "Good" }), sec.alignedPacketTraits({ type: "fire", parameter: "" }), sec.alignedPacketTraits({ type: "aligned", parameter: "shiny" })
], [["good"], [], []]);

/* ------------------------------------------------------------ A. ally aura effects (R1) */
const ae = await mod("ally-aura-effects.mjs");
const ca = await mod("creature-auras.mjs");
const radiant = ca.normaliseAura({ kind: "ally", radius: 20, allyEffect: { changes: [{ key: "system.combat.defence.status", value: 1, type: "custom" }, { key: "x", value: 1 }], warpFreeSchool: { school: "healing", value: 2 } } }, { id: "r", name: "Radiant Aura" });
equal("A5 an ally aura keeps its effect (bad changes dropped); a save aura has none", [radiant.allyEffect.changes.map((c) => c.key), radiant.allyEffect.warpFreeSchool, ca.normaliseAura({ radius: 5, save: "will" }, { id: "s" }).allyEffect, ae.allyEffectOf({})],
  [["system.combat.defence.status"], { school: "healing", value: 2 }, null, null]);
const em = { id: "D", name: "Dracoral", centreFeet: { x: 0, y: 0 }, widthFeet: 10, disposition: 1, auras: [radiant] };
const sub = (id, x, disposition = 1, widthFeet = 5) => ({ id, centreFeet: { x, y: 0 }, widthFeet, disposition });
const wanted = ae.wantedAllyGrants({ subjects: [sub("ally", 20), sub("far", 40), sub("foe", 10, -1), sub("D", 0), sub("big", 32.5, 0, 20)], emitters: [em] });
equal("A6 allies inside receive it; the emitter, a plain foe and a creature beyond do not; a large one by its edge", ["ally", "far", "foe", "D", "big"].map((k) => wanted.get(k).length), [1, 0, 0, 0, 1]);
const data = ae.allyGrantEffectData(wanted.get("ally")[0]);
equal("A7 the effect: named for aura and emitter, its changes, its keyed flag and the healing warp", [data.name, data.changes.length, data.flags["trg-prime"].allyAuraGrant, data.flags["trg-prime"].warpFreeSchool.school], ["Radiant Aura (Dracoral)", 1, "D:r-0", "healing"]);
equal("A8 the delta lays what is new and lifts what has gone", ae.allyGrantDelta(["D:r-0", "X:y"], [{ key: "D:r-0" }, { key: "E:z" }]), { add: [{ key: "E:z" }], remove: ["X:y"] });

/* ------------------------------------------------------------ A. versus damage, choice, Harmonize */
const vd = await mod("magic/versus-damage.mjs");
const sera = vd.normaliseVersusDamage({ value: 2, vsAlignments: ["Evil"], label: "Seraphim Aura" });
equal("A9 a damage bonus against an alignment reaches that alignment only", [vd.versusDamageReaching([sera], ["fiend"], ["evil"]).length, vd.versusDamageReaching([sera], ["fiend"], ["good"]).length, vd.normaliseVersusDamage({ value: 2 })], [1, 0, null]);
const area = await mod("creature-area.mjs");
const eyes = { save: "reflex", damage: { formula: "2d6", type: "fire" }, damageChoice: ["cold", "fire"] };
equal("A10 a choice of damage type is offered and the pick applied; an unoffered pick changes nothing", [area.areaDamageChoices(eyes), area.withChosenDamageType(eyes, "cold").damage.type, area.withChosenDamageType(eyes, "acid").damage.type, area.areaDamageChoices({ damage: { formula: "1d6", type: "fire" } })], [["cold", "fire"], "cold", "fire", []]);
const hz = await mod("harmonize.mjs");
const now = { combatId: "c", round: 3, worldTime: 100 };
let rec = hz.withHarmony(null, { by: "v1", bonus: hz.harmonizeBonus("heroic"), when: now });
rec = hz.withHarmony(rec, { by: "v2", bonus: hz.harmonizeBonus("partial"), when: now });
rec = hz.withHarmony(rec, { by: "v2", bonus: hz.harmonizeBonus("success"), when: now });
equal("A11 Harmonize: the Bonus Check Table capped at ±2, one bonus per Virtue, this round only", [hz.harmonizeBonus("heroic"), hz.harmonizeBonus("blunder"), hz.harmonyTotal(rec, now), hz.harmonyTotal(rec, { ...now, round: 4 }), hz.harmonyTotal({ when: { worldTime: 10 }, from: [{ by: "a", bonus: 2 }] }, { worldTime: 14 })], [2, -2, 4, 0, 2]);

/* ------------------------------------------------------------ B. the workflows */
const src = {
  dying: read("module", "combat", "dying-workflow.mjs"), turn: read("module", "creature-turn-start-workflow.mjs"), attack: read("module", "combat", "attack-workflow.mjs"),
  sync: read("module", "ally-aura-effects-workflow.mjs"), init: read("scripts", "trg-prime.mjs"), vdw: read("module", "magic", "versus-damage-workflow.mjs"),
  act: read("module", "creature-activation-workflow.mjs"), codex: read("module", "codex-actions-workflow.mjs"), cast: read("module", "magic", "cast-workflow.mjs")
};
ok("B1 damage records its types, and active regeneration holds at 0 HP", /await actor\.setFlag\("trg-prime", "damageTypesSinceTurn", withDamageTypes\(/.test(src.dying) && /const regenHeld = regenerationHolds\(Array\.from\(actor\.items \?\? \[\]\), \{/.test(src.dying) && /return \{ case: "regeneration-holds", guard: regenHeld\.label, newHP: 0 \};/.test(src.dying));
ok("B2 the turn start negates by type, and wakes a creature its heal raises", /const negated = negatedByTypes\(negatedBy, typesSince\);/.test(src.turn) && /if \(!locked && !negated && a\.amount > 0\) \{/.test(src.turn) && /if \(!locked && !negated && a\.amount > 0\) \{[\s\S]{0,800}?\n {10}await clearUnconsciousIfConscious\(actor\);/.test(src.turn));
ok("B3 aligned packets meet alignment defences and report their alignment", /sourceTraits: alignedPacketTraits\(rune\)/.test(src.attack) && /damageTypes: \[String\(rune\.type \?\? ""\)\.trim\(\)\.toLowerCase\(\), \.\.\.alignedPacketTraits\(rune\)\]/.test(src.attack));
ok("B4 ally-aura effects are kept in step on moves and are registered", /if \("x" in changed \|\| "y" in changed \|\| "disposition" in changed \|\| "width" in changed\) syncAllyAuraEffects\(\);/.test(src.sync) && /await actor\.createEmbeddedDocuments\("ActiveEffect", delta\.add\.map\(\(g\) => allyGrantEffectData\(g\)\)\);/.test(src.sync) && /registerAllyAuraEffectHooks\(\);/.test(src.init));
ok("B5 versus damage asks the target's alignments", /alignedTraitsOf\(targetActor\.system \?\? \{\}\)\);/.test(src.vdw));
ok("B6 the Use button asks for the damage type when one is offered", /use\.spec = withChosenDamageType\(use\.spec, picked\);/.test(src.act));
ok("B7 Harmonize is a codex action and its aid reaches the innate save DC", /eternalSummons, trample, draconicShifting, harmonize[,}]/.test(src.codex) && /\+ harmonyHere;/.test(src.cast) && /if \(harmonyRecord && actor\.unsetFlag\) await actor\.unsetFlag\(SYSTEM_ID, HARMONIZE_FLAG\);/.test(src.cast));

const EXPECTED = 19;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block4: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block4: ${checks} checks — all green.`);
