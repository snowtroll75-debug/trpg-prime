#!/usr/bin/env node
/**
 * verify-ranged-ability — a ranged attack rolls with Dexterity.
 *
 * NEW at 3.489.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EVERY MISSILE AND THROWN STRIKE ROLLED WITH STRENGTH.
 *
 * `finesse = !isRanged && …` was the only route Dexterity had into an
 * attack roll, so a bow used `combat.attack.abilityKey`, which defaults
 * to `"strength"`. And there is one ability key per ACTOR, not per
 * weapon, so an archer could not be built correctly at all: setting the
 * key to dexterity would have moved their melee attacks too.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BOOK IS NOT VAGUE ABOUT THIS. Chapter 1, THE ABILITY SCORES:
 *
 *   STRENGTH  "influences carrying capacity, MELEE attack rolls, and
 *              damage dealt with MELEE weapons."
 *   DEXTERITY "affects RANGED attack rolls, DB, initiative… vital for
 *              characters seeking to excel with ranged weapons, such as
 *              the bow or sling."
 *
 * Strength's own entry scopes itself to melee, twice, and never claims
 * ranged. The glossary names two bonuses — "your attack bonus" for melee
 * against "your RANGED attack bonus". Chapter 7 puts thrown weapons under
 * ranged attacks explicitly.
 *
 * Graham, 4 September 2026: make the rulebook exact.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT SURVIVED, WHICH IS THE INTERESTING PART.
 *
 * Core ships no statblocks, and a sweep of the whole rulebook for a
 * printed ranged attack line — a bow, sling or crossbow with `+N
 * (damage)` — returns ZERO. There has never been a worked ranged example
 * to check against. The melee half CAN be checked, against the Chapter 5
 * animal companions, and it is right: Cat (Str 1, Dex 5, Weapon Finesse)
 * attacks at +5, Bird and Wolverine likewise at Dex, and the Horse —
 * Str 3, Dex 1, no Finesse — attacks at +3, which is Strength. Four for
 * four. Section C pins those four, because they are the only worked
 * attack examples this rulebook contains and they are what proves the
 * melee half was never the thing that was broken.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS A REGRESSION GUARD ON THE HALF THAT WAS ALREADY RIGHT.
 *
 * Ranged DAMAGE has always excluded Strength — `propulsiveStrengthBonus`
 * returns 0 without the Propulsive trait — exactly as "damage dealt with
 * melee weapons" requires. The system was asymmetric with itself, and
 * that asymmetry was the strongest evidence there was, because nobody
 * chose it. The obvious way to "finish" this change is to make ranged
 * damage use Dexterity as well, or to add Strength back to it for
 * symmetry. Both are wrong, and D says so.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  finesseAdjustment, rangedAbilityAdjustment, propulsiveStrengthBonus
} from "../module/combat/attack.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ================================================================== *
 * R. THE RULE
 * ================================================================== */

equal("R1 a melee attack is untouched", rangedAbilityAdjustment(false, 3, 5), 0);
equal("R2 a ranged attack swaps to Dexterity", rangedAbilityAdjustment(true, 3, 5), 2);
equal("R3 and nothing moves when the ability already IS Dexterity",
  rangedAbilityAdjustment(true, 4, 4), 0);

// R4 THE ONE THAT MATTERS. A high-Strength character firing a bow is
// genuinely worse at it, and the swap must be applied downward.
equal("R4 THE SWAP APPLIES EVEN WHEN DEXTERITY IS LOWER",
  rangedAbilityAdjustment(true, 5, 1), -4);
equal("R4b including into negative Dexterity", rangedAbilityAdjustment(true, 2, -1), -3);

/* ================================================================== *
 * F. THE CONTRAST WITH FINESSE, which is the thing most likely to be
 *    "tidied" into agreement by someone reading the two side by side.
 * ================================================================== */

// F1 Finesse takes the better of the two, because Finesse is an OPTION a
// weapon grants: "you CAN use your Dexterity instead".
equal("F1 Finesse never applies a penalty", finesseAdjustment(true, 5, 1), 0);
equal("F1b and does apply a benefit", finesseAdjustment(true, 1, 5), 4);

// F2 The ranged rule is not an option, it is what the ability IS — so
// the two functions MUST differ on the same inputs.
ok("F2 THE TWO RULES DISAGREE, DELIBERATELY",
  finesseAdjustment(true, 5, 1) !== rangedAbilityAdjustment(true, 5, 1),
  "if these ever agree, one of them has been made to clamp like the other");

const attackSource = read("module", "combat", "attack.mjs");
ok("F3 and only one of them clamps",
  /export function finesseAdjustment[\s\S]{0,300}?delta > 0 \? delta : 0;/.test(attackSource)
  && /export function rangedAbilityAdjustment[\s\S]{0,200}?return Number\(dexMod\) - Number\(currentAbilityMod\);/
    .test(attackSource),
  "the ranged rule must return the raw delta");

/* ================================================================== *
 * W. IS IT REACHED
 * ================================================================== */

const workflow = read("module", "combat", "attack-workflow.mjs");

ok("W1 the workflow calls the rule",
  /const rangedAbilityBonus = rangedAbilityAdjustment\(\s*\n\s*isRanged,/.test(workflow),
  "imported and never called is this project's most-repeated defect");
ok("W1b against the configured ability and the actor's Dexterity",
  /rangedAbilityAdjustment\(\s*\n\s*isRanged,\s*\n\s*Number\(system\.combat\?\.attack\?\.ability \?\? 0\),\s*\n\s*Number\(system\.attributes\?\.dexterity\?\.total \?\? 0\)/
    .test(workflow));

// W2 PUSHED EVEN WHEN NEGATIVE. `if (rangedAbilityBonus)` is falsy only
// at exactly zero, which is the no-op case. A guard of `> 0` would keep
// the better number silently, which is how the wrong ability survived.
ok("W2 the modifier is pushed on any non-zero delta",
  /if \(rangedAbilityBonus\) \{/.test(workflow)
  && !/if \(rangedAbilityBonus > 0\)/.test(workflow),
  "a penalty the player cannot see is the defect this change exists to fix");
ok("W2b and a penalty says what it replaced",
  workflow.includes('rangedAbilityBonus < 0 ? " — replaces Strength" : ""'));

// W3 THE TWO CAN NEVER BOTH FIRE. Finesse is computed as `!isRanged &&`,
// so this is a property of the existing code rather than a new promise —
// asserted so that widening Finesse to ranged weapons has to come here.
ok("W3 Finesse and the ranged swap are mutually exclusive",
  workflow.includes('const finesse = !isRanged && /\\bfinesse\\b/i.test(String(weaponData.traits ?? ""));'),
  "if Finesse ever applies to a ranged weapon both swaps would stack");

/* ================================================================== *
 * B. THE BOMB, which was adding Dexterity TWICE
 * ================================================================== */

const alch = read("module", "alchemical-workflow.mjs");

ok("B1 the bomb path uses the same rule",
  alch.includes("const swap = rangedAbilityAdjustment(true, configured, dexterity);"),
  "one answer to 'which ability does a thrown attack use', not two");
ok("B1b and no longer adds a bare Dexterity on top of the resolved total",
  !/total: bab \+ dexterity \+ penalty/.test(alch),
  "`combat.attack.total` already contains an ability — its own label reads "
  + "'BAB and ability' — so this was BAB + Strength + Dexterity");
ok("B2 it still reads the resolved attack total, not the raw BAB",
  alch.includes("Number(system.combat?.attack?.total ?? system.combat?.bab ?? 0)"),
  "switching to bab.total would silently drop magic, feat and effect bonuses — "
  + "a second bug traded for the first");
ok("B3 and the proficiency penalty is still separate",
  alch.includes("total: resolved + swap + penalty")
  && alch.includes("bab: resolved + swap"),
  "the card shows the -4 as its own line with its own reason");

/* ================================================================== *
 * D. THE DAMAGE SIDE WAS ALREADY RIGHT. DO NOT 'FINISH' IT.
 * ================================================================== */

equal("D1 ranged damage adds no Strength without Propulsive",
  propulsiveStrengthBonus(false, 5), 0);
equal("D2 Propulsive adds half, as printed", propulsiveStrengthBonus(true, 5), 2);
equal("D2b and a Strength penalty applies in full", propulsiveStrengthBonus(true, -3), -3);

ok("D3 the damage path still branches on melee for the Strength term",
  // 3.575.0: the melee branch takes `usedTwoHanded` whole (the x1.5 for a
  // weapon one size larger as well as Hand & a Half) — the branch on
  // melee, which is what this check guards, is unchanged.
  // 3.576.0: a missile weapon that declares `thrownDamage` (the sling,
  // Graham's R2: "treated as a thrown weapon for determining damage
  // modifiers") takes full Strength, as a thrown weapon does — which is
  // Strength, not Dexterity, so the melee/ranged split this guards holds.
  workflow.includes("const strength = isMelee\n    ? handAndAHalfStrengthBonus(usedTwoHanded, strengthMod)\n    : thrownDamage ? strengthMod : propulsiveStrengthBonus(hasPropulsive, strengthMod);"),
  "\"damage dealt with MELEE weapons\" — this half was built to the book and "
  + "must not be made 'symmetrical' with the attack change");
ok("D3b and the ranged swap is nowhere in the damage builder",
  !/rangedAbilityAdjustment/.test(workflow.slice(workflow.indexOf("const isMelee ="))),
  "Dexterity governs the ranged ATTACK ROLL; the book never gives it to damage");

/* ================================================================== *
 * S. THE SHEET NAMES BOTH BONUSES, BECAUSE THE GLOSSARY DOES
 *
 * "A basic melee attack is a d20 roll + your ATTACK BONUS" against
 * "A basic ranged attack is a d20 roll + your RANGED ATTACK BONUS."
 * Without this a Str 3 / Dex 5 character reads one number and watches
 * their bow roll two higher.
 * ================================================================== */

const actorSource = read("module", "documents", "actor.mjs");
const sheet = read("templates", "actor", "actor-sheet.hbs");

ok("S1 the ranged total is derived on the actor",
  /combat\.attack\.ranged = combat\.attack\.total \+ rangedAbilityAdjustment\(/.test(actorSource),
  "derived from the same rule the roll uses, so the two cannot drift apart");
ok("S1b from the actor's Dexterity and configured ability",
  /combat\.attack\.ranged[\s\S]{0,200}?combat\.attack\.ability,\s*\n\s*Number\(system\.attributes\?\.dexterity\?\.total \?\? 0\)/
    .test(actorSource));

// S2 `total` IS LEFT ALONE. The action workflow, the critical tables and
// the alchemical path all read it; moving it would have changed melee
// numbers as a side effect of a ranged fix.
ok("S2 and the melee total is unchanged",
  actorSource.includes("combat.attack.base = Number(combat.bab?.total ?? 0);")
  && !/combat\.attack\.total = combat\.attack\.total/.test(actorSource),
  "a ranged fix must not move a melee number");

ok("S3 the sheet shows both", sheet.includes("{{system.combat.attack.ranged}}")
  && sheet.includes("{{system.combat.attack.total}}"));
ok("S3b and labels them by which attack they are for",
  sheet.includes("Melee Attack") && sheet.includes("Ranged Attack"),
  "one row called \"Attack Bonus\" is now ambiguous between two real numbers");

/* ================================================================== *
 * C. THE ONLY WORKED ATTACK EXAMPLES IN THE RULEBOOK
 *
 * Chapter 5's animal companions. They are all MELEE, which is exactly
 * why they are here: they prove the half that was left alone is right,
 * so a later reader cannot conclude that the melee model was ever in
 * question. The Horse is the control — the one without Weapon Finesse.
 * ================================================================== */

const COMPANIONS = [
  { name: "Cat", str: 1, dex: 5, printed: 5, finesse: true },
  { name: "Bird", str: 0, dex: 3, printed: 3, finesse: true },
  { name: "Wolverine", str: 0, dex: 3, printed: 3, finesse: true },
  { name: "Horse", str: 3, dex: 1, printed: 3, finesse: false }
];

for (const c of COMPANIONS) {
  // BAB 0 for a companion's natural attack; the printed bonus is the
  // ability alone. Modelled the way the workflow models it: the actor's
  // configured ability is Strength, and Finesse is a delta on top.
  const rolled = c.str + finesseAdjustment(c.finesse, c.str, c.dex);
  equal(`C ${c.name} (Str ${c.str}, Dex ${c.dex}${c.finesse ? ", Finesse" : ""})`,
    rolled, c.printed);
}

ok("C5 the control is the one WITHOUT Finesse",
  COMPANIONS.filter((c) => !c.finesse).length === 1
  && COMPANIONS.find((c) => !c.finesse).name === "Horse",
  "three companions matching Dex proves nothing on its own — the Horse, whose "
  + "printed bonus is its Strength, is what makes the other three evidence");

if (failures.length) {
  process.stderr.write(`verify-ranged-ability: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-ranged-ability: OK — ${checks} checks. Missile and thrown Strikes roll with `
  + "Dexterity, the bomb path stopped counting it twice, and ranged damage still "
  + "excludes Strength.\n");
