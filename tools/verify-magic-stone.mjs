#!/usr/bin/env node
/**
 * verify-magic-stone — three pebbles a sling can throw.
 *
 * NEW at 3.513.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION F IS THE WIDE CHANGE, AND IT IS WIDER THAN THIS SPELL.
 *
 * Ammunition could already change damage, damage type, range, armour
 * rending, splash and subdual — everything except whether the shot lands.
 * Graham ruled on 7 September 2026 that Magic Stone's "+1 item (magic)
 * bonus" covers ATTACK AND DAMAGE, so `attackModifier` joined the
 * template. Every one of the nine authored rounds can now declare one and
 * every one of them declares nothing, which is what F3 asserts: this
 * release must not have moved a single existing arrow.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION T IS THE `item` TYPE, and it is the check that costs the spell
 * something. A +1 Magic Stone fired from a +2 sling gives +2, not +3,
 * because two item bonuses on one roll do not stack. That is the right
 * reading of an enhancement bonus, and it only works because the modifier
 * is a TYPED ROW rather than a number the workflow adds up.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION I HOLDS THE ITEM AGAINST ITS READERS rather than against a list
 * typed out here — the shape `verify-healing-earth` established. Every
 * field on a conjured item is load-bearing for machinery somewhere else,
 * and a payload that merely looks right is how a spell ends up putting
 * pebbles in the inventory that no sling will accept.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  MAGIC_STONE_COUNT, MAGIC_STONE_GROUP, MAGIC_STONE_TRAITS,
  magicStoneBonus, magicStoneItemData, magicStoneLine, magicStoneTraitLine
} from "../module/magic/magic-stone.mjs";
import {
  ammunitionAttackModifier, ammunitionEffects, ammunitionFitsWeapon, roundsRemaining
} from "../module/combat/ammunition.mjs";
import { warpedBonusValue } from "../module/magic/spell-warp.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

const packs = {};
for (const name of ["spells", "weapons", "ammunition"]) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  const rows = [];
  try {
    await db.open();
    for await (const [, v] of db.iterator()) rows.push(v);
  } finally { await db.close().catch(() => {}); }
  packs[name] = rows;
}

const stone = packs.spells.find((s) => s?.name === "Magic Stone");
const row = (stone?.system?.effects ?? [])[0];
ok("P1 Magic Stone declares an effect at all", Boolean(row),
  "it carried `effects: []` and did nothing");
equal("P2 THE KIND", row?.kind, "magicStone");
ok("P2b which the applier handles", HANDLED_EFFECT_KINDS.includes(String(row?.kind)),
  "a kind outside the list is dropped in silence");
equal("P3 ON THE CASTER, like Healing Earth", row?.target, "self",
  "\"up to 3 pebbles\" names an OBJECT, and the caster is who ends up carrying them");
equal("P4 one minute, as printed", stone?.system?.duration, "1 minute");

const warp = (stone?.system?.warps ?? [])[0];
ok("W1 the +2 PP warp is still printed", /increase the bonus to \+2/i.test(String(warp?.text ?? "")));
equal("W1b AND NOW BUYS SOMETHING", warp?.mods?.bonusValue, 1,
  "it shipped with `mods: {}` — offered, charged, and doing nothing");
equal("W1c CAPPED AT THE PRINTED WORDS", warp?.mods?.bonusMax, 2,
  "\"increase the bonus to +2\" is a ceiling; taking it twice must not reach +3");
equal("W1d at the printed price", Number(warp?.ppCost), 2);

/* ================================================================== *
 * B. THE BONUS
 * ================================================================== */

equal("B1 UNWARPED IT IS +1", magicStoneBonus({}, warpedBonusValue), 1);
equal("B2 THE WARP BUYS +2", magicStoneBonus({ bonusValue: 1, bonusMax: 2 }, warpedBonusValue), 2);
equal("B2b and taking it twice still stops at +2",
  magicStoneBonus({ bonusValue: 2, bonusMax: 2 }, warpedBonusValue), 2,
  "the book says the bonus BECOMES +2");
// B3 THE FLOOR. `warpedBonusValue` adds whatever it is handed, sign and
// all, so a negative mod would sell the caster a WEAKER pebble than the
// printed one. `bonusValue: 0` cannot catch this — zero takes the early
// return — which is how the same gap survived twice already this week.
equal("B3 A NEGATIVE MOD NEVER SHRINKS THE PRINTED BONUS",
  magicStoneBonus({ bonusValue: -3 }, warpedBonusValue), 1,
  "a warp only ever buys more");
equal("B4 without the arithmetic injected, nothing is warped",
  magicStoneBonus({ bonusValue: 1 }, null), 1,
  "the validator-injection shape that keeps the module pure");

/* ================================================================== *
 * I. THE ITEM, HELD AGAINST ITS READERS
 * ================================================================== */

const item = magicStoneItemData({ value: 1, castId: "cast-1" });

equal("I1 it is ammunition", item.type, "ammunition");
equal("I2 THREE PEBBLES", item.system.quantity, MAGIC_STONE_COUNT);
equal("I2b which is what roundsRemaining counts", roundsRemaining(item.system), 3);

// I3 IT FITS A SLING AND NOTHING ELSE — run through the real matcher
// against the real weapon, not asserted from the string I typed.
const sling = packs.weapons.find((w) => w?.name === "Sling");
ok("I3 the Sling is in the pack", Boolean(sling));
ok("I3b THE PEBBLES FIT IT", ammunitionFitsWeapon(item.system, sling?.system ?? {}),
  `pebbles want "${item.system.compatibleWeaponGroup}", the Sling is "${sling?.system?.group}"`);
equal("I3c and the declared group is the Sling's own", MAGIC_STONE_GROUP, String(sling?.system?.group));
const otherGroups = [...new Set(packs.weapons.map((w) => String(w?.system?.group ?? "")).filter(Boolean))]
  .filter((g) => g !== MAGIC_STONE_GROUP);
ok("I3d AND FIT NOTHING ELSE IN THE PACK",
  otherGroups.every((g) => !ammunitionFitsWeapon(item.system, { group: g })),
  `${otherGroups.length} other weapon groups`);

const effects = ammunitionEffects(item.system);
equal("I4 THE ATTACK BONUS REACHES THE READER", effects.attackModifier, 1,
  "the field the attack workflow reads");
equal("I4b and so does the damage bonus", effects.damageModifier, 1);
equal("I5 warped, both halves move",
  JSON.stringify([
    ammunitionEffects(magicStoneItemData({ value: 2 }).system).attackModifier,
    ammunitionEffects(magicStoneItemData({ value: 2 }).system).damageModifier
  ]), JSON.stringify([2, 2]),
  "one bonus, two fields — they must never disagree");

equal("I6 THE PEBBLES END WITH THE SPELL", item.flags["trg-prime"].endsWithSpell, true,
  "without this they are permanent +1 ammunition");
equal("I6b stamped with the casting that made them", item.flags["trg-prime"].castId, "cast-1",
  "removeSpellItemsByCastId visits by castId AND the declaration — both or neither");
ok("I7 it carries the printed traits", item.system.traits === MAGIC_STONE_TRAITS
  && /disruptive/i.test(MAGIC_STONE_TRAITS), MAGIC_STONE_TRAITS);

/* ================================================================== *
 * F. THE FIELD, AND THE NINE ROUNDS IT MUST NOT HAVE MOVED
 * ================================================================== */

equal("F1 ammunitionEffects reports an attack modifier at all",
  ammunitionEffects({ attackModifier: 3 }).attackModifier, 3);
equal("F1b absent reads as zero", ammunitionEffects({}).attackModifier, 0);
equal("F1c NOT CLAMPED — a round that flies worse is authorable",
  ammunitionEffects({ attackModifier: -2 }).attackModifier, -2,
  "the damage modifier beside it has never been clamped either");

// F3 IS THE ONE THAT GUARDS THE REST OF THE GAME. This release widened a
// shared item type; every authored round must be exactly where it was.
const unchanged = packs.ammunition.filter((a) => ammunitionEffects(a?.system).attackModifier === 0);
equal("F3 EVERY AUTHORED ROUND STILL ADDS NOTHING TO ATTACK",
  unchanged.length, packs.ammunition.length,
  packs.ammunition.filter((a) => ammunitionEffects(a?.system).attackModifier !== 0)
    .map((a) => a.name).join(", "));
ok("F3b and there are nine of them", packs.ammunition.length === 9,
  `${packs.ammunition.length} rows — if this moved, F3's claim covers a different set`);

/* ================================================================== *
 * T. THE TYPED ROW
 * ================================================================== */

const modRow = ammunitionAttackModifier(item.system, "Magic Stone");
ok("T1 a round with a bonus contributes a row", Boolean(modRow));
equal("T1b naming itself", modRow?.label, "Magic Stone",
  "the caster reads why the shot landed");
equal("T1c carrying the value", modRow?.value, 1);
equal("T2 AN `item` BONUS, WHICH IS WHY IT DOES NOT STACK WITH THE WEAPON",
  modRow?.type, "item",
  "a +1 stone from a +2 sling is +2 — the typed engine can only know that if this says so");
equal("T3 A ROUND WITH NO BONUS CONTRIBUTES NOTHING",
  ammunitionAttackModifier({ damageModifier: 2 }, "Arrows"), null,
  "a zero row would print a line on every shot saying the arrows gave nothing");
equal("T3b and nor does nothing at all", ammunitionAttackModifier(null), null);
/*
 * T4 TESTED THE DEFAULT PARAMETER, NOT THE GUARD, and the mutation runner
 * said so: `String(ammoName || "Ammunition")` → `String(ammoName ?? "")`
 * SURVIVED, because calling with no second argument never reaches either
 * — the signature's own default has already supplied the word.
 *
 * The guard exists for a name that ARRIVES and is empty: the workflow
 * passes `ammo?.name`, and an item created without a name gives "".
 * `undefined` takes the default; "" and null do not. So the check has to
 * hand it one.
 *
 * The fourth time this project has recorded a check that could not catch
 * its own assertion being neutered, and the second this week.
 */
equal("T4 A ROUND WHOSE NAME ARRIVES EMPTY STILL NAMES SOMETHING",
  ammunitionAttackModifier({ attackModifier: 1 }, "")?.label, "Ammunition",
  "a blank label on a modifier row is a blank line in the roll breakdown");
equal("T4b and so does one whose name is null",
  ammunitionAttackModifier({ attackModifier: 1 }, null)?.label, "Ammunition");
equal("T4c while an omitted name takes the signature's default",
  ammunitionAttackModifier({ attackModifier: 1 })?.label, "Ammunition");

/* ================================================================== *
 * L. WHAT THE CARD SAYS
 * ================================================================== */

const said = magicStoneLine("Merrick", 3, 1);
ok("L1 it names the count", /3 pebbles/.test(said), said);
ok("L1b and the bonus", /\+1 item bonus to attack and damage/.test(said), said);
ok("L1c and the weapon", /sling/i.test(said), said);
ok("L2 one pebble is singular", /1 pebble\b/.test(magicStoneLine("Merrick", 1, 1)),
  magicStoneLine("Merrick", 1, 1));

// L3 THE HALF NOTHING RUNS IS SAID OUT LOUD. A player who reads "the
// disruptive magical trait" in the spell text and sees nothing on the
// card cannot tell an unimplemented rule from a working one.
const trait = magicStoneTraitLine();
ok("L3 THE DISRUPTIVE TRAIT IS DECLARED UNAUTOMATED", /no rule in this system reads it/i.test(trait),
  trait);
ok("L3b and says who settles it", /settled at the table/i.test(trait), trait);

/* ================================================================== *
 * D. AND THE MEASUREMENT BEHIND THAT REFUSAL
 * ================================================================== */

// "Disruptive" is in no pack. Asserted rather than remembered, because
// the day somebody authors one is the day this spell should stop
// printing "no rule reads it".
const anyDisruptive = [];
for (const name of Object.keys(packs)) {
  for (const doc of packs[name]) {
    if (/\bdisruptive\b/i.test(String(doc?.system?.traits ?? ""))) anyDisruptive.push(`${name}:${doc.name}`);
  }
}
equal("D1 NOTHING ELSE IN THESE PACKS CARRIES THE DISRUPTIVE TRAIT",
  anyDisruptive.length, 0,
  `if this fires, the trait now means something and the card should stop apologising: ${anyDisruptive.join(", ")}`);

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-magic-stone: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-magic-stone: OK — ${checks} checks.\n`);
