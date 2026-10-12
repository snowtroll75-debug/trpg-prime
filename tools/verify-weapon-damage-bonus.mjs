#!/usr/bin/env node
/**
 * verify-weapon-damage-bonus — Gravity Weapon.
 *
 * NEW at 3.493.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT SHIPPED AS A NOTE, which is automation that is really a reminder.
 *
 *   "You empower the kinetic energy and density of one chosen weapon in
 *    your grasp. The base damage die of the weapon gains a +2 bonus for
 *    duration of the spell."
 *      +1 PP: You can affect two weapons.
 *      +4 PP: You increase the damage by an additional +2 (max +4).
 *
 * BOTH WARPS CARRIED `mods: {}` and bought nothing — the same inert-warp
 * shape Bless and Bane's freeze-membership option had before 3.426.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 4 September 2026: A FLAT +2, NOT A DIE STEP.
 *
 * The die reading was arguable, since the ladder d4→d6→d8→d10→d12 moves
 * in twos. Section S holds the three facts that settled it against —
 * including the seven d12 weapons that would have had nowhere to step —
 * against the live pack rather than against my memory of it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION C IS THE CAP, AND IT IS CHECKED TWICE ON PURPOSE.
 *
 * "Max +4" has to hold against a warped single casting AND against two
 * castings on the same blade. A cap enforced only where the warp is
 * applied is a cap that a second casting walks around, which is the
 * stacking shape this project has paid for under other names.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  MAX_WEAPON_DAMAGE_BONUS, WEAPON_DAMAGE_BONUS_FLAG,
  normaliseWeaponDamageBonus, weaponDamageBonusFor,
  weaponDamageBonusLine, weaponDamageShortfallLine
} from "../module/magic/weapon-damage-bonus.mjs";
import { normaliseStrikeRider } from "../module/magic/strike-riders.mjs";

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
 * D. THE DECLARED ROW
 * ================================================================== */

const row = normaliseWeaponDamageBonus({
  kind: "weaponDamageBonus", label: "Gravity Weapon", value: 2, weapons: 1
});
ok("D1 the row reads back whole",
  row.value === 2 && row.weapons === 1 && row.label === "Gravity Weapon");
ok("D2 a malformed row is refused",
  normaliseWeaponDamageBonus(null) === null
  && normaliseWeaponDamageBonus({ kind: "strikeRider", value: 2 }) === null);
ok("D3 A BONUS OF ZERO IS REFUSED",
  normaliseWeaponDamageBonus({ kind: "weaponDamageBonus", value: 0 }) === null,
  "a spell that adds nothing looks exactly like one that is broken");
ok("D3b and so is a negative one",
  normaliseWeaponDamageBonus({ kind: "weaponDamageBonus", value: -2 }) === null,
  "a penalty is a different rule than this spell prints");

// D4 THE SAME VALIDATOR READS THE PACK ROW AND THE STORED RECORD. The
// row carries `kind`; the record read back off a live effect flag does
// not, and a second shape would be a second chance to disagree.
ok("D4 a stored record with no kind still normalises",
  normaliseWeaponDamageBonus({ label: "Gravity Weapon", value: 2, weaponIds: ["w1"] })?.value === 2,
  "one shape, one validator");

/* ================================================================== *
 * C. THE CAP — "max +4", enforced in both places
 * ================================================================== */

equal("C1 the cap is the printed one", MAX_WEAPON_DAMAGE_BONUS, 4);
equal("C2 a warped row is capped when normalised",
  normaliseWeaponDamageBonus({ kind: "weaponDamageBonus", value: 9 }).value, 4);
equal("C3 AND TWO CASTINGS ON ONE BLADE ARE CAPPED TOO",
  weaponDamageBonusFor([{ weaponIds: ["w1"], value: 4 }, { weaponIds: ["w1"], value: 4 }], "w1"), 4);
equal("C3b while one casting is untouched",
  weaponDamageBonusFor([{ weaponIds: ["w1"], value: 2 }], "w1"), 2);

/* ================================================================== *
 * S. SCOPED TO THE WEAPON IT WAS CAST ON
 * ================================================================== */

equal("S1 another weapon gains nothing",
  weaponDamageBonusFor([{ weaponIds: ["w1"], value: 2 }], "w2"), 0);
equal("S1b and neither does no weapon at all",
  weaponDamageBonusFor([{ weaponIds: ["w1"], value: 2 }], ""), 0);
// S1c AND A RECORD CANNOT CARRY AN EMPTY ID TO MATCH ONE. This is what
// makes the guard that used to sit at the top of `weaponDamageBonusFor`
// unreachable, and it is asserted here so deleting the filter is caught.
ok("S1c an empty weapon id is filtered out of a record",
  normaliseWeaponDamageBonus({ kind: "weaponDamageBonus", value: 2, weaponIds: ["", "w1"] })
    .weaponIds.join() === "w1");
equal("S2 the warp's second weapon is armed",
  weaponDamageBonusFor([{ weaponIds: ["w1", "w2"], value: 2 }], "w2"), 2);
equal("S3 an empty record set gives nothing", weaponDamageBonusFor([], "w1"), 0);

/* ================================================================== *
 * W. IS IT REACHED, AND IN THE RIGHT LIST
 * ================================================================== */

const atk = read("module", "combat", "attack-workflow.mjs");
const se = read("module", "magic", "spell-effects.mjs");

ok("W1 the damage builder asks for it",
  atk.includes("const gravityBonus = weaponDamageBonusFor(weaponDamageBonusesOn(actor), weapon?.id);"),
  "imported and never called is this project's most-repeated defect");
ok("W1b and adds it to the formula",
  atk.includes("if (gravityBonus > 0) formula += ` + ${gravityBonus}`;"));

// W2 IN THE FLAT-BONUS LIST, which the file itself asks for: "added here
// with the other flat feat bonuses ... so there is one list of things
// that add to a damage formula."
ok("W2 beside the other flat bonuses",
  atk.indexOf("if (biggerBonus > 0)") < atk.indexOf("const gravityBonus =")
  && atk.indexOf("const gravityBonus =") < atk.indexOf("const weaponFinesseDamage ="),
  "one list of things that add to a damage formula");

ok("W3 the effect kind is handled", se.includes('case "weaponDamageBonus": {'));
ok("W3b and it scopes to a chosen weapon",
  se.includes("const id = await promptRiderWeapon(target, spell.name);"),
  "unscoped it would arm every weapon the character owns");
// W3c ANCHORED ON THE BRANCH, NOT THE SENTENCE IT PRINTS. The first
// version asserted the refusal text appeared in the file — which it still
// does when the branch guarding it is `if (false)`, so a mutation that
// made the refusal unreachable walked straight through. The condition is
// the rule; the sentence is only what the rule says.
ok("W3c refusing out loud when none was chosen",
  se.includes("if (!chosen.length) {")
  && se.includes("No weapon was chosen for ${spell.name} on ${target.name} — nothing applied."),
  "a spell that armed nothing in silence is the failure this tier exists to remove");
ok("W3d and the same prompt the strike riders use",
  se.includes('await import("./strike-riders-workflow.mjs")'),
  "\"which weapon\" must be answered one way in this system, not two");

/* ================================================================== *
 * P. IT IS NOT A STRIKE RIDER, AND MUST NOT BECOME ONE
 * ================================================================== */

// P1 A RIDER STILL REFUSES THIS ROW. `strike-riders.mjs` records Gravity
// Weapon as out of scope, and it is right: a rider is a second typed
// packet. If it ever accepts a row with no dice, the two mechanisms have
// started to overlap and one of them is wrong.
ok("P1 a strike rider still refuses a row with no dice",
  normaliseStrikeRider({ kind: "strikeRider", value: 2, damageType: "slashing" }) === null,
  "a rider that inherited \"the weapon's own\" by omission is a rune's meaning in a spell");
ok("P1b and one with no damage type",
  normaliseStrikeRider({ kind: "strikeRider", dice: "1d6" }) === null);

/* ================================================================== *
 * R. THE CARD
 * ================================================================== */

ok("R1 the card names the weapon and the number",
  weaponDamageBonusLine(row, "Merrick", ["Longsword"]).includes("Longsword")
  && weaponDamageBonusLine(row, "Merrick", ["Longsword"]).includes("+2"));
ok("R1b and both weapons when the warp bought two",
  weaponDamageBonusLine(row, "Merrick", ["Longsword", "Dagger"]).includes("and"));

// R2 THE WARP THAT WAS PAID FOR AND NOT USED. A caster who bought the
// second weapon and armed one blade has no other way to find out.
const two = normaliseWeaponDamageBonus({ kind: "weaponDamageBonus", value: 2, weapons: 2 });
ok("R2 a shortfall is said out loud", Boolean(weaponDamageShortfallLine(two, 1)));
ok("R2b and nothing is said when the count was met",
  weaponDamageShortfallLine(two, 2) === null
  && weaponDamageShortfallLine(row, 1) === null);

/* ================================================================== *
 * G. THE SPELL AS SHIPPED, AND THE FACTS THAT SETTLED THE RULING
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let gravity = null;
const declarers = [];
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.name === "Gravity Weapon") gravity = value;
    if ((value?.system?.effects ?? []).some((e) => e?.kind === "weaponDamageBonus")) {
      declarers.push({ name: value.name, pp: Number(value.system.ppCost) });
    }
  }
} finally {
  await db.close().catch(() => {});
}

const gRow = (gravity?.system?.effects ?? []).find((e) => e.kind === "weaponDamageBonus");
ok("G1 Gravity Weapon declares the bonus", Boolean(gRow));
ok("G2 as printed: +2 on one weapon", gRow?.value === 2 && (gRow?.weapons ?? 1) === 1);
ok("G2b and it is no longer a note",
  !(gravity?.system?.effects ?? []).some((e) => e.kind === "note"),
  "it shipped as a note, which is automation that is really a reminder");

// G3 THE WARPS BUY SOMETHING NOW.
const warps = gravity?.system?.warps ?? [];
ok("G3 the two-weapon warp is wired",
  warps.some((w) => Number(w.ppCost) === 1 && Number(w.mods?.weapons) === 2),
  "it carried mods: {} and bought nothing");
ok("G3b and the extra-damage warp",
  warps.some((w) => Number(w.ppCost) === 4 && Number(w.mods?.weaponDamageBonus) === 2));
ok("G3c the cast folds them in before the cap is applied",
  se.includes("value: Number(effect.value ?? 0) + Number(warpMods?.weaponDamageBonus ?? 0),"),
  "the printed max belongs to the warped total, not to the base");

// G4 THE d12 FACT, asked of the pack. It is one of the three reasons the
// die-step reading was rejected, and if it ever stops being true the
// ruling deserves re-reading rather than silently outliving its argument.
let d12s = 0;
const db2 = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "weapons"), { valueEncoding: "json" });
try {
  await db2.open();
  for await (const [, value] of db2.iterator()) {
    // NOT `\bd12\b`. There is no word boundary between the "1" and the
    // "d" of "1d12", so the first version of this line counted zero and
    // said so — which is the check doing its job on its own author.
    if (/d12\b/.test(String(value?.system?.damage ?? ""))) d12s += 1;
  }
} finally {
  await db2.close().catch(() => {});
}
ok("G4 weapons already at the top of the die ladder still exist", d12s > 0,
  `${d12s} weapons roll d12 and have nowhere to step — one of the three reasons `
  + "Graham ruled this a flat bonus rather than a die step");

// G5 THE RATCHET. One spell needs this today.
// 1 -> 2 AT 3.589.0: DIVINE FAVOUR (page 272), "+1-circumstance bonus on
// attack checks AND damage rolls". Named rather than counted, because the
// interesting fact is WHICH spells want this and both are now pinned —
// Gravity Weapon at PP 1 and Divine Favour at PP 2.
// 2 → 3 AT 3.594.0: PRAYER — AND BACK TO 2 AT 3.594.1, which is the more
// useful entry. Prayer's "+1-luck bonus to damage checks" for every ally and
// the mirrored penalty for every foe is the first time anybody asked this
// rail to work on somebody other than the caster, and it cannot:
//
//   • it PROMPTS for the weapon (W3b, W3c, W3d). An area spell therefore
//     asks once per recipient and, when nobody answers for an NPC ally,
//     applies nothing;
//   • it REFUSES a value of 0 or less (D3, D3b), so the foes' −1 printed
//     as "declares a malformed weapon bonus".
//
// Both were measured on one card in Graham's world on 26 September. The rows
// were removed and the quarter is printed instead; the decision is pinned in
// verify-chapter10-301-310 (A3, A3b). This rail is for a caster buffing a
// weapon they have chosen, and the two spells left are exactly that.
ok("G5 exactly two spells declare a weapon damage bonus",
  declarers.length === 2
  && declarers.some((d) => d.name === "Gravity Weapon" && d.pp === 1)
  && declarers.some((d) => d.name === "Divine Favour" && d.pp === 2),
  `declarers: ${JSON.stringify(declarers)}`);

if (failures.length) {
  process.stderr.write(`verify-weapon-damage-bonus: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-weapon-damage-bonus: OK — ${checks} checks. A flat +2 on the chosen weapon's own `
  + `damage, capped at +${MAX_WEAPON_DAMAGE_BONUS} however it is warped or stacked.\n`);
