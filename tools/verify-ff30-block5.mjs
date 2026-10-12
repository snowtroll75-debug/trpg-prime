#!/usr/bin/env node
/**
 * verify-ff30-block5 — 3.635.0, Fiends & Fables 3.0 block 5 (Animated
 * Objects, Ankhegs, Apes; Graham's rulings of 12 October 2026).
 *
 *   A  the pure rules, driven — a stat-block weapon is proficient; an
 *      after-strike's self-condition and its "takes damage" gate; the
 *      Animated Objects' magic/physical resistance and adamantine/fire
 *      weakness through the defence rail (R2, "these need to be automated")
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

/* ------------------------------------------------------------ A. R1 stat-block weapons */
const pr = await mod("proficiency-rules.mjs");
const profile = pr.proficiencyProfile({ items: [], system: {} });
const halberd = { type: "weapon", name: "Halberd", system: { category: "Martial", group: "Polearm" } };
equal("A1 a creature with no class is not trained in a martial weapon it picked up, but is in its stat block's", [
  pr.proficiencyOf(profile, halberd).proficient,
  pr.proficiencyOf(profile, { ...halberd, flags: { "trg-prime": { statBlockWeapon: true } } }).proficient,
  pr.proficiencyOf(profile, { ...halberd, flags: { "trg-prime": { statBlockWeapon: "yes" } } }).proficient
], [false, true, false]);
ok("A2 the mark speaks only for weapons", pr.proficiencyOf(profile, { type: "armour", name: "Full Plate", system: { category: "Heavy" }, flags: { "trg-prime": { statBlockWeapon: true } } }).proficient === false);

/* ------------------------------------------------------------ A. R5 self-conditions */
const das = await mod("combat/declared-after-strikes.mjs");
const haze = { flags: { "trg-prime": { afterStrikes: [{ key: "dusty-haze", label: "Dusty Haze", selfCondition: { key: "concealed", rounds: 1, onDamage: true } }] } } };
const [spec] = das.declaredAfterStrikes([haze]);
equal("A3 a self-condition alone is a declaration: its key, one round, on damage", spec?.selfCondition, { key: "concealed", rounds: 1, onDamage: true });
equal("A4 it fires only when the blow dealt damage; one not asking for damage always fires", [
  das.declaredAfterStrikeFires(spec, { damageTaken: 3 }), das.declaredAfterStrikeFires(spec, { damageTaken: 0 }), das.declaredAfterStrikeFires(spec, {}),
  das.declaredAfterStrikeFires(das.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ key: "x", selfCondition: { key: "hidden", onDamage: false } }] } } }])[0], { damageTaken: 0 })
], [true, false, false, true]);
equal("A5 a self-condition with no key is no declaration", das.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ key: "y", selfCondition: { key: "" } }] } } }]).length, 0);

/* ------------------------------------------------------------ A. R2 the Animated Objects' defences */
const ct = await mod("creature-traits.mjs");
const dm = await mod("combat/damage.mjs");
const animus = ct.actorDefences({ combat: { resistances: "magic, physical", weaknesses: "adamantine, fire", immunities: "" } });
const taken = (o) => dm.resolveDamagePacket({ amount: 10, ...animus, ...o }).taken;
equal("A6 physical halves a mundane blow; magic halves a magical one once; fire +50%, halved again if magical; adamantine +50% then halved; cold untouched", [
  taken({ type: "slashing" }), taken({ type: "slashing", magical: true }), taken({ type: "fire" }), taken({ type: "fire", magical: true }), taken({ type: "bludgeoning", material: "adamantine" }), taken({ type: "cold" })
], [5, 5, 15, 7, 7, 10]);

/* ------------------------------------------------------------ B. the workflows */
const src = {
  attack: read("module", "combat", "attack-workflow.mjs"), wf: read("module", "combat", "declared-after-strikes-workflow.mjs"),
  act: read("module", "creature-activation-workflow.mjs")
};
ok("B1 the attack passes the damage the blow dealt to the after-strikes", /applyDeclaredAfterStrikes\(actor, weapon, targetActor, \{ critical: critical \|\| null, damageTaken: Number\(packet\?\.taken \?\? 0\) \|\| 0 \}\)/.test(src.attack));
ok("B2 the after-strike workflow gates on it and lays the self-condition on the striker", /    damageTaken\n  \};/.test(src.wf) && /if \(spec\.selfCondition\) lines\.push\(\.\.\.await applySelfCondition\(actor, spec\)\);/.test(src.wf) && /const applied = await applyConditionTags\(actor, \[\{ key: spec\.selfCondition\.key/.test(src.wf));
ok("B3 an area ability with a use count refuses when spent and spends one when used", /if \(counted && usesLeft <= 0\) \{ ui\.notifications\?\.warn/.test(src.act) && /await item\.update\(\{ "system\.usesValue": usesLeft - 1 \}\);/.test(src.act));

const EXPECTED = 10;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block5: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block5: ${checks} checks — all green.`);
