#!/usr/bin/env node
/**
 * verify-caster-level — a caster level is earned, not assumed.
 *
 * NEW at 3.385.0.
 *
 * THE DEFECT THIS GUARDS was found by Graham reading a live-testing
 * report, not by the harness. 3.384.0's pass drove a 10th-level Arcanist
 * and reported caster level 10 as CORRECT behaviour. It is not: the
 * archetype casting feats grant cantrips and a BSB, and the linked Class
 * feat — Arcane Knight and its three siblings — is what grants a caster
 * level.
 *
 * The tell was in the same report and I walked past it. An Arcanist and
 * a plain Fighter of the same level resolved IDENTICALLY, because
 * `resolvedCasterLevel` never consulted the archetype at all: both were
 * falling through to a CHARACTER-LEVEL fallback that stood in for "we do
 * not know". Two very different characters agreeing exactly is what a
 * rule that is not running looks like.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS THE ONE THAT WOULD HAVE CAUGHT IT
 *
 * A and B check the arithmetic, which was never the problem. D checks
 * that characters who should differ DO differ — an Arcanist against a
 * Fighter, a knight against a non-caster. A test that only asserts
 * expected values passes happily while two cases quietly collapse into
 * one, because each of them individually looks reasonable.
 *
 * SECTION C GUARDS THE BLAST RADIUS. Changing the fallback moved a
 * number that twenty call sites read. Two of them had comments already
 * describing the NEW behaviour — spell-warp.mjs claiming a Fighter reads
 * 0, and Mystical Conduit's "a non-caster gains nothing" — so the fix
 * made two long-standing comments true and one false. C pins the two
 * feats whose printed text says "per caster level", because those are
 * where a wrong zero would be silent.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { KNIGHT_CASTING, knightCasterLevel, resolvedCasterLevel } from "../module/magic/feat-casting.mjs";
import { ARCHETYPE_CASTING, archetypeCasterLevelNote } from "../module/magic/archetype-casting.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const cl = (args) => resolvedCasterLevel(args);

/* ================================================================== *
 * A. Earned, and by what
 * ================================================================== */

equal("A1 a class caster reads its class table",
  cl({ level: 6, classCasterLevel: 3 }).value, 3);
equal("A2 and says so", cl({ level: 6, classCasterLevel: 3 }).source, "class");

equal("A3 a non-caster with a Knight feat casts at half level (round up)",
  cl({ level: 9, classCasterLevel: null, hasKnightFeat: true }).value, 5);
equal("A4 and says the feat did it",
  cl({ level: 9, classCasterLevel: null, hasKnightFeat: true }).source, "feat");

// THE FEAT IS A FLOOR FOR A CLASS CASTER — taking it must never COST a
// Cleric caster levels, which is the whole reason it is not a plain
// replacement.
equal("A5 a class caster keeps the higher class value",
  cl({ level: 10, classCasterLevel: 10, hasKnightFeat: true }).value, 10);
equal("A6 and is still sourced to the class",
  cl({ level: 10, classCasterLevel: 10, hasKnightFeat: true }).source, "class");
equal("A7 but the feat wins when the class lags",
  cl({ level: 10, classCasterLevel: 2, hasKnightFeat: true }).value, 5);

/* ================================================================== *
 * B. Not earned, so zero
 * ================================================================== */

equal("B1 a Fighter has no caster level", cl({ level: 10 }).value, 0);
equal("B2 and the reason is 'none', not a class table printing 0",
  cl({ level: 10 }).source, "none");
// A CLASS THAT GENUINELY PRINTS 0 IS A DIFFERENT FACT from having no
// class at all, and the sheet needs to tell them apart.
equal("B3 a class table of 0 is sourced to the class",
  cl({ level: 10, classCasterLevel: 0 }).source, "class");
equal("B4 an archetype caster is zero too — nothing here consults them",
  cl({ level: 10 }).value, 0);
equal("B5 level 0 is unremarkable", cl({ level: 0 }).value, 0);
equal("B6 rubbish input does not throw", cl().value, 0);
equal("B7 a negative level cannot buy a caster level",
  cl({ level: -5, hasKnightFeat: true }).value, 0);

equal("B8 knightCasterLevel rounds UP", knightCasterLevel(9), 5);
equal("B9 and floors at zero", knightCasterLevel(-3), 0);

/* ================================================================== *
 * C. The note that stops a player reporting this as a bug
 * ================================================================== */

const arcanist = ARCHETYPE_CASTING.arcanist;

const note = archetypeCasterLevelNote(arcanist, {
  casterLevelSource: "none", knightTable: KNIGHT_CASTING
});
ok("C1 an archetype caster with no caster level is told why", Boolean(note));
ok("C2 and the note names the feat that would grant one",
  /Arcane Knight/.test(note), `got: ${note}`);
// THE PAIRING IS BY TRADITION, so every archetype must find its own
// knight — a note that names the wrong feat is worse than none.
for (const arch of Object.values(ARCHETYPE_CASTING)) {
  const n = archetypeCasterLevelNote(arch, {
    casterLevelSource: "none", knightTable: KNIGHT_CASTING
  });
  const linked = Object.values(KNIGHT_CASTING).find((k) => k.tradition === arch.tradition);
  ok(`C3 ${arch.label} names ${linked?.label}`, Boolean(linked) && n.includes(linked.label), `got: ${n}`);
}
// AND SILENCE WHEN THERE IS NOTHING TO EXPLAIN. A Cleric who also holds
// Arcanist HAS a caster level, and telling them they do not would be the
// §5.9 shape — a card describing something the system did not do.
for (const source of ["class", "feat", "override"]) {
  equal(`C4 no note when the caster level came from '${source}'`,
    archetypeCasterLevelNote(arcanist, { casterLevelSource: source, knightTable: KNIGHT_CASTING }), "");
}
equal("C5 no note without a knight table to name from — but still no crash",
  archetypeCasterLevelNote(arcanist, { casterLevelSource: "none" }),
  "Arcanist grants cantrips and a BSB, not a caster level.");
equal("C6 rubbish archetype does not throw",
  archetypeCasterLevelNote(null, { casterLevelSource: "none" }), "");

/* ================================================================== *
 * D. Characters who differ must DIFFER
 * ================================================================== */

// THIS IS THE SECTION THAT WOULD HAVE CAUGHT THE BUG. Every assertion
// above can pass while two unrelated characters silently collapse onto
// the same number, which is exactly what happened: an Arcanist and a
// Fighter both read their character level and each looked plausible
// alone.
const fighter10 = cl({ level: 10 });
const knight10 = cl({ level: 10, hasKnightFeat: true });
const bard6 = cl({ level: 6, classCasterLevel: 3 });

ok("D1 a Knight and a non-caster of the same level do NOT agree",
  knight10.value !== fighter10.value,
  `both read ${fighter10.value} — the feat is not being consulted`);
ok("D2 a class caster and a non-caster do NOT agree",
  bard6.value !== cl({ level: 6 }).value);
// AND THE OLD FALLBACK MUST NOT COME BACK. Character level is the one
// value this may never resolve to by accident.
for (const level of [1, 5, 10, 20]) {
  ok(`D3 an unearned caster level at L${level} is not the character level`,
    cl({ level }).value !== level || level === 0,
    `read ${cl({ level }).value} at level ${level} — the fallback is back`);
}

/* ================================================================== *
 * E. The source files still say what they now do
 * ================================================================== */

const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

// A COMMENT THAT DESCRIBES THE SYSTEM BETTER THAN THE SYSTEM DOES is how
// this bug survived: two of them predicted this ruling and nobody
// noticed the code disagreed. These anchors are deliberately about the
// RECORD of that, not about behaviour — the behaviour is A–D's job.
const warp = read("module/magic/spell-warp.mjs");
ok("E1 spell-warp records that its claim was false until 3.385.0",
  /WAS FALSE WHEN IT WAS WRITTEN/.test(warp));
const effects = read("module/magic/spell-effects.mjs");
ok("E2 Mystical Conduit records the same",
  /ONLY BECAME TRUE AT 3\.385\.0/.test(effects));

// INNATE CASTING MUST STILL TAKE CHARACTER LEVEL. This is the case the
// old fallback was kept for, and the reason removing it is safe — if
// this branch ever goes, a Fighter's spell-like silently drops to 0.
const cast = read("module/magic/cast-workflow.mjs");
// 3.617.0 (R23 of block 37): an ITEM's spell reads the item's level, and
// every other innate cast still falls back to the character's.
ok("E3 an innate cast still reads the CHARACTER's level, not this value",
  /isInnate\s*\n?\s*\?\s*innateLevel/.test(cast)
    && cast.includes("const innateAt = innateCastLevel(spell, Array.from(actor.items ?? []), characterLevel);"),
  "the fallback was removed on the strength of this branch existing");

/* ================================================================== */

process.stdout.write(`verify-caster-level: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
