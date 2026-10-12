#!/usr/bin/env node
/**
 * verify-damage-categories — mundane, magic, and the special materials.
 *
 * NEW at 3.547.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG — AND WHAT WAS NOT.
 *
 * Measured across the 294 Fiends & Fables creatures with the system's
 * OWN classifier (the first measurement used a hand-written damage-type
 * list and was wrong: `physical` is a defined damage GROUP, `sleep` a
 * trait, `paralysis` an alias for `paralyzed`, and all three resolve
 * perfectly well). What genuinely resolved to nothing:
 *
 *   disease          54     cold iron       24
 *   precision        24     mundane         34  (20 resist + 14 immune)
 *   stunning         17     adamantine      14
 *   silver           12     magic           11
 *   death effects     9
 *
 * Three separate faults sat underneath that list.
 *
 * 1. A PARENTHETICAL SPLIT THE ENTRY IN HALF. Four creatures declare
 *    `"all damage (force, essence)"`, which split on the comma INSIDE
 *    the brackets into "all damage (force" and "essence)". Four more
 *    carry "physical (bludgeoning)", which failed where the bare word
 *    "physical" works. `parseRunes` had already learned this lesson —
 *    it strips `(...)` before splitting, under a comment about a phantom
 *    rune called "3/day)" — and the defence parser never did.
 *
 * 2. `stunning` HAD NO ALIAS while `stun` and `stuns` both had one.
 *
 * 3. THE VOCABULARY HAD NO ROOM FOR A CATEGORY OR A MATERIAL. "Mundane"
 *    describes the SOURCE and "cold iron" the WEAPON; neither is a
 *    damage type, so both were matched against the fourteen types, found
 *    wanting, and dropped.
 *
 * AND NOTHING SAID SO. `resolveDamageTypeField` computed an `unresolved`
 * list for the resistance and weakness fields — under a comment
 * promising "neither kind is silent" — and `actorDefences` kept only the
 * immunity one and discarded the other two.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULINGS, 10 September 2026.
 *
 *   MUNDANE is "non-magical source entirely" — a spell or a weapon
 *   carrying a Potency rune is magical; an ordinary blade is not.
 *
 *   A MATERIAL TRIGGERS THE WEAKNESS: +50%, through the same step a
 *   damage-type weakness already uses, rather than merely bypassing a
 *   resistance.
 */

import {
  classifyDefence, parseDefenceList, resolveDamageTypeField,
  DAMAGE_CATEGORIES, DEFENCE_MATERIALS, DEFENCE_TRAITS, bypassMaterialsFor
} from "../module/defences.mjs";
import { actorDefences } from "../module/creature-traits.mjs";
import { resolveDamagePacket } from "../module/combat/damage.mjs";
import { materialDefenceWord } from "../module/item-quality.mjs";

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

/* ── S: THE SPLIT ─────────────────────────────────────────────────── */

equal("S1 A COMMA INSIDE BRACKETS NO LONGER SPLITS THE ENTRY",
  JSON.stringify(parseDefenceList("all damage (force, essence)")),
  JSON.stringify(["all damage"]),
  "it split into \"all damage (force\" and \"essence)\", neither of which is anything");

equal("S1b AND A QUALIFIED GROUP RESOLVES AGAIN",
  JSON.stringify([...resolveDamageTypeField("physical (bludgeoning)").damageTypes]),
  JSON.stringify(["bludgeoning", "piercing", "slashing", "subdual"]),
  "four creatures write it this way; the bare word always worked");

equal("S1c WHILE ORDINARY COMMAS STILL SEPARATE",
  JSON.stringify(parseDefenceList("fire, cold; poison")),
  JSON.stringify(["fire", "cold", "poison"]),
  "WITHOUT THIS, S1 passes on a parser that stopped splitting at all");

equal("S2 stunning IS ALIASED LIKE stun AND stuns",
  JSON.stringify(classifyDefence("stunning").conditions), JSON.stringify(["stunned"]),
  "seventeen creature entries say \"stunning\"");

/* ── V: THE NEW VOCABULARY ────────────────────────────────────────── */

equal("V1 mundane IS A CATEGORY, NOT A DAMAGE TYPE",
  JSON.stringify(classifyDefence("mundane").categories), JSON.stringify(["mundane"]),
  "it describes the SOURCE; keeping it out of damageTypes means no consumer has to know "
  + "that one member of that set is not really a type");
ok("V1b AND IT MATCHES", classifyDefence("mundane").matched);
ok("V1c AND CARRIES NO DAMAGE TYPE", classifyDefence("mundane").damageTypes.length === 0);

equal("V2 cold iron IS A MATERIAL",
  JSON.stringify(classifyDefence("cold iron").materials), JSON.stringify(["cold iron"]));

ok("V3 A REAL DAMAGE TYPE IS STILL A DAMAGE TYPE",
  classifyDefence("fire").damageTypes.includes("fire")
  && classifyDefence("fire").categories.length === 0,
  "WITHOUT THIS, V1 passes on a classifier that calls everything a category");

/* THIS FIXTURE SAID "death effects" UNTIL 3.548.0, AND THEN THAT WORD
 * WAS IMPLEMENTED TOO — it became a PRINTED_DEFENCE, so the check
 * silently stopped testing anything, exactly as the `disease` fixture in
 * U1c had one release earlier.
 *
 * THAT IS THE SAME MISTAKE THREE TIMES IN TWO RELEASES, and the lesson
 * is not "pick a better word" but "never point a negative control at a
 * real backlog item". A word from the unresolved list is a word somebody
 * intends to implement; the moment they do, the check goes green while
 * measuring nothing. `wibble` and `bananas` are safe precisely because
 * no one will ever add them. */
ok("V4 AND NONSENSE STILL MATCHES NOTHING",
  !classifyDefence("bananas").matched && !classifyDefence("wibble").matched,
  "a category vocabulary that swallowed an unknown word would stop reporting the "
  + "entries a GM has actually mistyped");

equal("V5 THE CATEGORY LIST IS THE TWO",
  JSON.stringify([...DAMAGE_CATEGORIES]), JSON.stringify(["mundane", "magic"]));
equal("V5b AND THE MATERIAL LIST THE THREE",
  JSON.stringify([...DEFENCE_MATERIALS]),
  JSON.stringify(["cold iron", "silver", "adamantine"]));

/* ── U: NOTHING IS DROPPED IN SILENCE ─────────────────────────────── */

const noisy = actorDefences({
  combat: { resistances: "mundane, fire, bananas", immunities: "poison, wibble",
    weaknesses: "cold iron, sonic, nonsense" }
});

equal("U1 AN UNKNOWN RESISTANCE IS REPORTED",
  JSON.stringify(noisy.unresolvedByField.resistances), JSON.stringify(["bananas"]),
  "the resistance field's leftovers were computed and thrown away");
equal("U1b AND AN UNKNOWN WEAKNESS",
  JSON.stringify(noisy.unresolvedByField.weaknesses), JSON.stringify(["nonsense"]));
/* THE FIXTURE SAID "disease" UNTIL 3.547.1, and then the word started
 * resolving — six templates declare it, so it became a trait. A check
 * whose "unknown" word gets implemented is a check that quietly stops
 * testing anything, so the fixture uses a word nothing will ever add. */
equal("U1c AND THE IMMUNITY FIELD STILL REPORTS ITS OWN",
  JSON.stringify(noisy.unresolvedByField.immunities), JSON.stringify(["wibble"]),
  "this third was the only one that ever worked");

/* U1d ASSERTS THE COMBINED LIST TOO, and the mutation runner asked for
 * it: emptying `unresolved` back to the immunities alone SURVIVED,
 * because U1–U1c all read the per-field breakdown I had just added.
 * `unresolved` is the older contract — every existing consumer reads
 * that one — so a repair that fixed only the new field would have left
 * the actual reporting path exactly as broken as it was. */
ok("U1d AND ALL THREE REACH THE COMBINED LIST",
  ["bananas", "nonsense", "wibble"].every((w) => noisy.unresolved.includes(w)),
  `unresolved: ${JSON.stringify(noisy.unresolved)} — this is the field the rest of the `
  + "system already reads");

ok("U2 WHILE THE WORDS THAT DO RESOLVE ARE NOT REPORTED AS BROKEN",
  !noisy.unresolved.includes("mundane") && !noisy.unresolved.includes("cold iron")
  && !noisy.unresolved.includes("fire"),
  `unresolved: ${JSON.stringify(noisy.unresolved)} — a category and a material are "
  + "applicable entries, unlike a condition typed into a resistance field`);

ok("U3 AND THE CATEGORY REACHES THE DEFENCES",
  noisy.resistanceCategories.has("mundane") && noisy.weaknessMaterials.has("cold iron"),
  "parsed is not the same as delivered");

/* ── D: THE RULE ITSELF ───────────────────────────────────────────── */

const target = actorDefences({
  combat: { resistances: "mundane", weaknesses: "cold iron", immunities: "" }
});
const hit = (extra) => resolveDamagePacket({
  amount: 20, type: "slashing",
  resistances: target.resistances, weaknesses: target.weaknesses,
  immunities: target.immunities,
  resistanceCategories: target.resistanceCategories,
  weaknessMaterials: target.weaknessMaterials,
  ...extra
});

equal("D1 A PLAIN BLADE IS HALVED BY MUNDANE RESISTANCE", hit({}).taken, 10,
  "twenty creatures declare this and it did nothing at all");

equal("D1b A RUNED BLADE IS NOT", hit({ magical: true }).taken, 20,
  "Graham's ruling: a Potency rune makes the source magical. WITHOUT THIS, D1 passes on "
  + "a rule that halves everything");

equal("D2 A COLD IRON BLADE TRIGGERS THE WEAKNESS", hit({ material: "cold iron" }).taken, 15,
  "+50% then halved, because plain cold iron is still a mundane source: 20 → 30 → 15");

equal("D2b AND A RUNED COLD IRON BLADE GETS BOTH",
  hit({ material: "cold iron", magical: true }).taken, 30,
  "weakness applies, mundane resistance does not");

equal("D2c WHILE A MATERIAL THE TARGET DOES NOT FEAR DOES NOTHING",
  hit({ material: "silver" }).taken, 10,
  "WITHOUT THIS, D2 passes on a rule that treats every material as a weakness");

ok("D3 A PACKET IS HALVED ONCE, NOT TWICE",
  resolveDamagePacket({
    amount: 20, type: "fire", resistances: ["fire"],
    resistanceCategories: ["mundane"], magical: false
  }).taken === 10,
  "resisted by type AND by category — the book's word is \"half\", and halving twice "
  + "would quarter it");

/* ── B: A MATERIAL IN BRACKETS OVERCOMES THE RESISTANCE (3.547.1) ─────
 *
 * One template reads `resistances: "mundane (silver)"`. Stripping the
 * bracket made it plain `mundane` and threw the qualifier away — but the
 * bracket is the rule: mundane resistance that silver ignores.
 *
 * THE DATA USES BOTH PATTERNS AND THEY MEAN DIFFERENT THINGS. Seven
 * templates carry `weaknesses: silver` (+50%, ruled earlier); one
 * carries `resistances: mundane (silver)` (bypass, ruled 10 Sep 2026).
 * A single reading would have got one of them wrong. */
equal("B1 A BRACKETED MATERIAL IS EXTRACTED",
  JSON.stringify([...bypassMaterialsFor("mundane (silver)")]), JSON.stringify(["silver"]));

equal("B1b WHILE A NON-MATERIAL BRACKET IS NOT",
  JSON.stringify([...bypassMaterialsFor("physical (bludgeoning)")]), JSON.stringify([]),
  "the same bracket shape glosses a group there; guessing at every bracket would make "
  + "one parser into two rules that disagree");

{
  const bypassTarget = actorDefences({
    combat: { resistances: "mundane (silver)", weaknesses: "", immunities: "" }
  });
  const swing = (extra) => resolveDamagePacket({
    amount: 20, type: "slashing",
    resistances: bypassTarget.resistances, weaknesses: bypassTarget.weaknesses,
    immunities: bypassTarget.immunities,
    resistanceCategories: bypassTarget.resistanceCategories,
    weaknessMaterials: bypassTarget.weaknessMaterials,
    resistanceBypassMaterials: bypassTarget.resistanceBypassMaterials,
    ...extra
  });
  equal("B2 A SILVER BLADE IGNORES THE MUNDANE RESISTANCE",
    swing({ material: "silver" }).taken, 20);
  equal("B2b WHILE PLAIN STEEL IS STILL HALVED", swing({}).taken, 10,
    "WITHOUT THIS, B2 passes on a resistance that stopped applying to anyone");
  equal("B2c AND A DIFFERENT MATERIAL DOES NOT BYPASS",
    swing({ material: "cold iron" }).taken, 10,
    "only the material NAMED in the bracket overcomes it");
}

/* ── A: ALL DAMAGE ────────────────────────────────────────────────── */

equal("A1 all damage IS A CATEGORY",
  JSON.stringify(classifyDefence("all damage").categories), JSON.stringify(["all damage"]),
  "one template declares it; a list of fourteen types would go stale the day a "
  + "fifteenth is added");

{
  const everything = actorDefences({
    combat: { resistances: "all damage", weaknesses: "", immunities: "" }
  });
  const anyType = (type) => resolveDamagePacket({
    amount: 20, type, resistances: everything.resistances,
    resistanceCategories: everything.resistanceCategories
  }).taken;
  ok("A2 AND IT HALVES EVERY TYPE",
    anyType("fire") === 10 && anyType("slashing") === 10 && anyType("mental") === 10,
    `fire ${anyType("fire")}, slashing ${anyType("slashing")}, mental ${anyType("mental")}`);
}

/* ── T: THE BESTIARY'S OWN TRAIT WORDS ────────────────────────────── */

ok("T1 disease, charm AND precision RESOLVE",
  ["disease", "charm", "precision"].every((w) => classifyDefence(w).traits.includes(w)),
  "six templates declare a disease immunity; they are trait words, kept OUT of "
  + "APPENDIX_TRAITS because that list is a transcription of the rulebook's own appendix");

equal("T1b AND THE LIST IS THOSE THREE",
  JSON.stringify([...DEFENCE_TRAITS]),
  JSON.stringify(["disease", "charm", "precision"]));

/* ── M: THE BRIDGE BETWEEN THE ITEM AND THE BESTIARY ──────────────── */

equal("M1 THE ITEM'S KEY BECOMES THE BESTIARY'S WORD",
  materialDefenceWord("coldIron"), "cold iron",
  "the item stores `coldIron`, the creature says `cold iron`; derived from the label "
  + "rather than a second hand-written table");
equal("M1b silver too", materialDefenceWord("silver"), "silver");
equal("M2 AND AN ITEM OF NO SPECIAL MATERIAL SAYS NOTHING",
  materialDefenceWord(""), "");
equal("M2b nor does an unknown key", materialDefenceWord("madeUpAlloy"), "",
  "WITHOUT THIS, M1 passes on a function that echoes whatever it is given");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-damage-categories: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-damage-categories: OK — ${checks} checks. Mundane resistance, `
  + `material weakness, bracketed entries, and nothing dropped in silence.\n`);
