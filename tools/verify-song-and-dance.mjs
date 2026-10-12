#!/usr/bin/env node
/**
 * verify-song-and-dance — the Bard's class bonus, and the sentence that
 * takes it away again.
 *
 * NEW at 3.443.3.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE, as Graham quoted it on 31 August 2026:
 *
 *   "SONG & DANCE — A bard does not cast spells in the same way as other
 *    casters and each spell that you cast is part of a performance. When
 *    casting spells you always use one of your perform specialties and
 *    this allows you to add your class bonus to ALL SPELLCRAFT CHECKS AND
 *    DC'S. ... Be aware that this only applies when casting spells using
 *    Spellcraft. IF YOU ARE USING BARDIC PERFORMANCE THE CLASS BONUS DOES
 *    NOT APPLY."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG, AND WHERE IT HID.
 *
 * The check always lost the bonus, because a Bardic Performance cast
 * swaps the whole modifier list for one Perform entry. Everything DERIVED
 * from the Spellcraft bonus kept it. For a Specialist Spell the Save DC
 * is `max(10 + ability + level, 10 + spellcraft)` — so the class bonus
 * walked straight back in through a formula nobody thought of as a
 * Spellcraft check.
 *
 * Found by casting it in Graham's world: Grokash Hervik, level 3, Cha +4,
 * Spellcraft 8 including Song & Dance +2. Bardic Performance cast of
 * Cutting Words rolled "Perform (Bardic Performance) Untyped +9" and set
 * a Will save at DC 18. Without the class bonus: max(17, 16) = 17.
 *
 * SECTION F IS THE ONE THAT WOULD HAVE CAUGHT IT. Three call sites each
 * read the raw Spellcraft total, and no check anywhere asked whether a
 * cast that had given the bonus up still spent it.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  songAndDanceModifier, withoutSongAndDance, SONG_AND_DANCE_SOURCE,
  hasClassAbility, hasCompositionTrait, bardicPerformSpellcraftModifiers
} from "../module/bard.mjs";
import { resolveBonuses } from "../module/bonuses/registry.mjs";
import { BONUS_TYPES } from "../module/dice/resolution.mjs";
import { specialistSaveDC, innateSaveDC, specialistAttackUplift } from "../module/magic/casting.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const actorSrc = read("module", "documents", "actor.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");

const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const bard = { items: [{ type: "ability", name: "Song & Dance" }] };
const notBard = { items: [{ type: "ability", name: "Bardic Performance" }] };

/* ================================================================== *
 * A. THE GRANT
 * ================================================================== */

ok("A1 a Bard with the ability gets their class bonus",
  songAndDanceModifier(bard, 2)?.value === 2);
ok("A2 typed class, which is what the book calls it",
  songAndDanceModifier(bard, 2)?.type === "class");
ok("A3 and carries the source the exclusion recognises",
  songAndDanceModifier(bard, 2)?.source === SONG_AND_DANCE_SOURCE,
  "a grant the filter cannot see is a grant that can never be taken away");
ok("A4 somebody without the ability gets nothing",
  songAndDanceModifier(notBard, 2) === null);
ok("A5 and a class bonus of zero is not a modifier",
  songAndDanceModifier(bard, 0) === null);
ok("A6 the ability is matched by name, case and spacing aside",
  hasClassAbility({ items: [{ type: "ability", name: "  SONG & DANCE " }] }, "song & dance"));

/* ================================================================== *
 * B. THE EXCLUSION, AS A FILTER
 * ================================================================== */

const song = songAndDanceModifier(bard, 2);
const other = { label: "Something else", value: 1, type: "class", source: "elsewhere" };

ok("B1 the filter removes Song & Dance",
  withoutSongAndDance([song, other]).length === 1);
ok("B1b and removes only Song & Dance",
  withoutSongAndDance([song, other])[0] === other,
  "an exclusion that took a neighbour with it would silently nerf the Bard");
ok("B2 a pool without it is unchanged",
  withoutSongAndDance([other]).length === 1);
ok("B3 an empty or missing pool is survivable",
  withoutSongAndDance([]).length === 0 && withoutSongAndDance().length === 0
  && withoutSongAndDance(null).length === 0);
ok("B4 the input is not mutated",
  (() => { const pool = [song, other]; withoutSongAndDance(pool); return pool.length === 2; })(),
  "prepareDerivedData runs this beside the pool the ordinary total came from");
// A BONUS WITH NO SOURCE IS SOMEBODY ELSE'S. Only the named source goes.
ok("B5 an unsourced bonus is kept",
  withoutSongAndDance([{ label: "Mystery", value: 3, type: "class" }]).length === 1);

/* ================================================================== *
 * C. FILTERING THE POOL, NOT SUBTRACTING A NUMBER
 *
 * THE FIRST DRAFT OF THIS SECTION WAS WRONG, and it failed on its own
 * claim, which is the good direction. It asserted that Song & Dance is
 * class-typed and that class bonuses resolve HIGHEST-WINS, so removing
 * one could drop the total by less than its value or by nothing at all.
 * Appendix 1's table says otherwise: `class` STACKS. C0 pins that, so
 * the day it changes this file says so out loud rather than a Bard's DC
 * quietly moving.
 *
 * So today the two methods agree, and the filter is not chosen because
 * subtraction is broken. It is chosen because it does not depend on
 * knowing the answer to C0 — it asks the same resolver the same
 * question with one entry gone, and stays right whatever the type table
 * says. C3 is what that buys, driven through a type that does compete.
 * ================================================================== */

const resolve = (pool) => resolveBonuses({ slots: {}, slotTypes: {}, pool, stacking: {}, extra: 0 }).total;

ok("C0 class bonuses stack — the fact that makes the two methods agree",
  BONUS_TYPES.class?.stacking === "stack",
  "if this ever becomes \"highest\", subtracting a value would stop being the same operation");

{
  const other = { label: "Another class bonus", value: 5, type: "class", source: "elsewhere" };
  const withSong = resolve([song, other]);
  const without = resolve(withoutSongAndDance([song, other]));
  ok("C1 removing Song & Dance removes exactly its own contribution",
    withSong === 7 && without === 5,
    `with ${withSong}, without ${without}`);
}

{
  const withSong = resolve([song]);
  const without = resolve(withoutSongAndDance([song]));
  ok("C2 and with nothing else class-typed the bonus simply goes",
    withSong === 2 && without === 0);
}

{
  // WHAT THE FILTER BUYS, shown through a type that COMPETES. A status
  // bonus is highest-wins, so a smaller one queued behind a larger is
  // promoted the moment the larger leaves: the total falls by 3, not by
  // the 5 a subtraction would have taken. Song & Dance is not status
  // typed and this is not its behaviour today — the point is that the
  // filter would be right if it ever were, and a subtraction would not.
  const big = { label: "Big", value: 5, type: "status", source: SONG_AND_DANCE_SOURCE };
  const small = { label: "Small", value: 2, type: "status", source: "elsewhere" };
  const before = resolve([big, small]);
  const after = resolve(withoutSongAndDance([big, small]));
  ok("C3 for a competing type the filter and a subtraction disagree",
    before === 5 && after === 2,
    `${before} → ${after}: subtracting 5 would have given 0, and the resolver says 2`);
}

/* ================================================================== *
 * D. THE NUMBER IT MOVED, AT A TABLE
 *
 * Grokash Hervik as measured on 31 August 2026.
 * ================================================================== */

const ABILITY = 4, LEVEL = 3, SPELLCRAFT = 8, CLASS_BONUS = 2;

ok("D1 the specialist Save DC as it shipped",
  specialistSaveDC(ABILITY, LEVEL, SPELLCRAFT) === 18,
  "10 + spellcraft 8 beats 10 + ability 4 + level 3");
ok("D2 and without the class bonus",
  specialistSaveDC(ABILITY, LEVEL, SPELLCRAFT - CLASS_BONUS) === 17,
  "the ability+level floor takes over — the defect was worth exactly one point of DC");
// THE FLOOR IS WHY IT IS ONE POINT AND NOT TWO, and a check that assumed
// two would be a second place computing the formula.
ok("D2b the floor is what stops it falling by two",
  specialistSaveDC(ABILITY, LEVEL, SPELLCRAFT - CLASS_BONUS) === innateSaveDC(ABILITY, LEVEL));
// A NON-SPECIALIST SAVE DC NEVER READ SPELLCRAFT AT ALL, so nothing there
// moves — worth stating, because it bounds the blast radius of the fix.
ok("D3 an ordinary spell's Save DC is untouched by any of this",
  !/spellSaveDC\(\{[^}]*spellcraft/i.test(strip(cast)),
  "10 + PP + ability has no Spellcraft term, so it never carried the bonus either way");

/* ================================================================== *
 * E. THE ACTOR PUBLISHES THE SECOND ANSWER
 * ================================================================== */

const actorClean = strip(actorSrc);
ok("E1 the Bardic Performance total is published beside the ordinary one",
  actorClean.includes("spellcraft.bardicPerformanceTotal = song"));
ok("E2 it is resolved from the pool with Song & Dance filtered out",
  actorClean.includes("pool: withoutSongAndDance(actor.getBonusPool(\"system.magic.spellcraft\"))"),
  "reading the unfiltered pool would publish the same number twice");
// THE SAME RESOLVER, THE SAME SLOTS, THE SAME STACKING, THE SAME EXTRA.
// A second resolution that differed in any of these would answer a
// different question and nobody would see it.
for (const part of [
  "slotTypes: TARGET_SLOTS.spellcraft",
  "stacking: STACKING_OVERRIDES.spellcraft",
  "extra: spellcraftExtra"
]) {
  ok(`E3 and asks it the same way (${part})`, actorClean.includes(part));
}
ok("E3b including the flat term, which is hoisted rather than retyped",
  /const spellcraftExtra = Number\(system\.magic\.bsb \?\? 0\) \+ Number\(system\.progression\?\.bsb \?\? 0\);/.test(actorSrc)
  && (actorClean.match(/extra: spellcraftExtra/g) ?? []).length === 2,
  "two copies of the BSB expression is one place for a BSB to go missing");
// A NON-BARD PUBLISHES ITS ORDINARY TOTAL rather than nothing, so the
// cast's fallback is never the thing carrying the rule.
ok("E4 a caster without the ability publishes the ordinary total",
  actorClean.includes(": resolved.total;"));

/* ================================================================== *
 * F. AND THE CAST READS IT — ONCE
 * ================================================================== */

const castClean = strip(cast);
ok("F1 the cast resolves one Spellcraft bonus for the whole cast",
  /const spellcraftForCast = Number\(/.test(castClean));
// RESHAPED AT 3.444.0. At 3.443.3 this base was conditional — the whole
// total on an ordinary cast, the Song-free one on a Bardic Performance
// cast — because the bonus was still expected to ride INSIDE it. Now the
// base is always Song-free and the bonus is added by name, so what is
// conditional is the bonus (§H5), not the base.
ok("F2 the base is the Song-free total, unconditionally",
  castClean.includes("system.magic?.spellcraft?.bardicPerformanceTotal ?? spellcraftWhole"),
  "a base that still contained the bonus would double-count it once it is added by name");
ok("F2b and falls back to the whole total when the sheet has no second answer",
  /const spellcraftWhole = Number\(system\.magic\?\.spellcraft\?\.total \?\? 0\);/.test(cast)
  && castClean.includes("?? spellcraftWhole"),
  "an actor prepared before 3.443.3 must keep its Spellcraft rather than lose it");
// EVERY DERIVED NUMBER, not a chosen one. This is the check that would
// have caught the defect: three call sites each read the raw total.
const derived = [
  ["F3 the Save DC", "specialistSaveDC(castingAbility, characterLevel, spellcraftForCast)"],
  ["F4 the Disbelieve DC", "specialistSaveDC(abilityForDisbelief, characterLevel, spellcraftForCast)"],
  ["F5 the specialist attack uplift", "specialistAttackUplift(castingAbility, characterLevel, spellcraftForCast)"]
];
for (const [label, needle] of derived) {
  ok(`${label} reads it`, castClean.includes(needle));
}
ok("F6 and no derived number still reads the raw total",
  !/specialist(SaveDC|AttackUplift)\([^)]*spellcraft\?\.total/.test(castClean),
  "the defect was three call sites reading past the rule");

/* ================================================================== *
 * H. THE BONUS IS ADDED, NOT MERELY CARRIED (3.444.0)
 *
 * Graham, 31 August 2026: "with Song and Dance the bonus needs to be
 * applied to the attack bonus and Save DC."
 *
 * IT WAS NEVER ADDED TO ANYTHING. The Specialist formulas are
 * `max(ability + level, spellcraft)` — a MAX, not a sum — so the class
 * bonus inside the Spellcraft half applied when that half won and
 * vanished when the other half won. It was one of two candidates to
 * REPLACE the Bard's number, not a bonus to it. And the other two bases,
 * `10 + PP + ability` and the innate `10 + ability + level`, have no
 * Spellcraft term at all and never carried it in any branch.
 * ================================================================== */

ok("H1 the cast separates the bonus from the bonus pool it lived in",
  /const spellcraftWhole = Number\(system\.magic\?\.spellcraft\?\.total \?\? 0\);/.test(cast)
  && /const songAndDanceForCast = castWithSpellcraft/.test(cast));
// THE AMOUNT IS THE DIFFERENCE BETWEEN THE RESOLVER'S TWO ANSWERS. Taking
// `identity.classBonus` here would be a third place deciding what Song &
// Dance is worth, and would be wrong the moment stacking touched it.
ok("H1b measured as what it actually contributed, not as the raw class bonus",
  castClean.includes("Math.max(0, spellcraftWhole - spellcraftForCast)"),
  "the two resolver answers differ by exactly what the bonus was worth after stacking");
ok("H1c and never negative",
  castClean.includes("Math.max(0, spellcraftWhole - spellcraftForCast)"),
  "a grant must never become a penalty on somebody's save DC");
// THE BASE IS SONG-FREE ALWAYS NOW, not only on a Bardic Performance
// cast. That is what makes "added once" true rather than "added when the
// spellcraft branch happens to lose".
ok("H2 every Spellcraft-derived base is built without the bonus",
  castClean.includes("system.magic?.spellcraft?.bardicPerformanceTotal ?? spellcraftWhole")
  && !/spellcraftForCast = Number\(\s*\(usePerform/.test(castClean),
  "a base that still contained it would double-count the moment it was added by name");
ok("H3 and the save DC assembly is handed the bonus by name",
  castClean.includes("songAndDance: songAndDanceForCast"));
ok("H4 the Disbelieve DC gains it too",
  castClean.includes("+ songAndDanceForCast"),
  "an illusion's DC is a save DC the Bard's spell sets");

// WHAT DOES *NOT* GET IT, and why. "This only applies when casting spells
// using Spellcraft" — an innate spell-like rolls no casting check and
// derives from ability + level, and an item cast's DC belongs to the
// scroll or wand.
ok("H5 innate and item casts are outside the grant",
  /const castWithSpellcraft = !usePerform && !isInnate && !isItemCast;/.test(cast),
  "\"this only applies when casting spells using Spellcraft\"");
ok("H5b and a Bardic Performance cast still gets nothing",
  /const castWithSpellcraft = !usePerform/.test(cast));
// A NO-CHECK CANTRIP IS *NOT* EXCLUDED, deliberately: it is the Bard's
// own spell through their own perform specialty, and a save DC that moved
// depending on whether the caster happened to be penalised enough to roll
// would be absurd.
ok("H5c a no-check cantrip is not excluded",
  !/castWithSpellcraft = [^;]*noCheckCantrip/.test(cast),
  "the same spell would set two different DCs depending on the situation");

/* ================================================================== *
 * J. THE ATTACK — ALREADY CARRIED, AND THAT IS WHY THE UPLIFT MOVED
 *
 * A caster's spell attack IS their Cast a Spell check: `resolveSpellAttack`
 * compares that check's own total against the target's Defence Bonus. The
 * check's modifier list is the Spellcraft one, class bonus included — so
 * "applied to the attack bonus" is already true for an ordinary cast and
 * adding it again would double it.
 *
 * The specialist uplift is the exception, and the reason is arithmetic.
 * It is a DIFFERENCE against the number already in the roll:
 * `max(A+L, S) - S`. With the bonus on both sides it cancelled, so a
 * specialist Bard whose ability+level beat their Spellcraft lost it
 * entirely. Measured from the Song-free bonus instead, the roll totals
 * `d20 + max(A+L, S0) + bonus`, which is the ruling.
 * ================================================================== */

ok("J1 the cast check carries the Spellcraft modifiers, class bonus and all",
  /modifiers: \[\.\.\.modifiers\]/.test(castClean)
  && /system\.magic\?\.spellcraft\?\.checkModifiers/.test(castClean),
  "this is why the attack needs no second addition");
ok("J2 and the attack is that check, not a roll of its own",
  /The cast check total is the attack roll/.test(cast),
  "resolveSpellAttack compares the casting check against the target's DB");
ok("J3 the specialist uplift is measured from the Song-free bonus",
  castClean.includes("specialistAttackUplift(castingAbility, characterLevel, spellcraftForCast)"));
// DRIVEN, with Grokash's own numbers, both branches of the max.
{
  const A = ABILITY, L = LEVEL, S0 = SPELLCRAFT - CLASS_BONUS, B = CLASS_BONUS;
  // ability+level (7) beats the Song-free Spellcraft (6): the branch where
  // the bonus used to disappear completely.
  const upliftNow = specialistAttackUplift(A, L, S0);
  const upliftBefore = specialistAttackUplift(A, L, S0 + B);
  ok("J4 the uplift now leaves room for the bonus in the roll",
    (S0 + B) + upliftNow === Math.max(A + L, S0) + B,
    `spellcraft-in-roll ${S0 + B} + uplift ${upliftNow} should equal max(${A + L}, ${S0}) + ${B}`);
  ok("J4b where before it replaced it",
    (S0 + B) + upliftBefore === Math.max(A + L, S0 + B),
    `the old sum was max(A+L, spellcraft-with-bonus) = ${Math.max(A + L, S0 + B)} — the bonus cancelled`);
  ok("J4c and the two differ, which is the defect",
    (S0 + B) + upliftNow !== (S0 + B) + upliftBefore,
    "if these agreed for Grokash the check would be proving nothing");
}

/* ================================================================== *
 * G. THE CHECK ITSELF STILL LOSES IT, which is where this always worked
 * ================================================================== */

ok("G1 a Bardic Performance cast rolls one Perform entry and nothing else",
  bardicPerformSpellcraftModifiers(9).length === 1
  && bardicPerformSpellcraftModifiers(9)[0].value === 9,
  "the whole list is swapped, so Song & Dance is not in it");
ok("G1b and it is not typed class",
  bardicPerformSpellcraftModifiers(9)[0].type !== "class");
ok("G2 the substitution is still offered only for composition spells",
  hasCompositionTrait({ system: { traits: "Composition, Emotion, Enchantment" } })
  && !hasCompositionTrait({ system: { traits: "Evocation, Fire" } }),
  "Graham, 31 Aug 2026: \"they may also use Bardic Performance to cast a spell with the composition trait\"");
ok("G2b and the cast asks that question before offering it",
  /if \(actor && hasCompositionTrait\(spell\)\) \{/.test(cast));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-song-and-dance: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-song-and-dance: OK — ${checks} checks. The class bonus reaches the DCs, `
  + `and a Bardic Performance cast loses it from all of them.\n`);
