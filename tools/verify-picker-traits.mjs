#!/usr/bin/env node
/**
 * verify-picker-traits — do a feat's TRAITS decide who may take it?
 *
 * NEW at 3.544.0. `module/picker-filters.mjs` had no verify of its own,
 * which is how both defects below survived: nothing ever asked.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG.
 *
 * Graham, 9 Sep 2026: "The feat Enigma (Adept, Heritage) is being offered
 * to my 4th level Rogue PC."
 *
 * Two independent holes, and the feat sat in exactly the overlap.
 *
 * 1. THE TIER TRAIT WAS IGNORED IN THE ARCHETYPE SLOT. Measured before
 *    the repair: a 4th-level Rogue, a 4th-level Fighter and a Wizard were
 *    each offered the IDENTICAL 22 archetype feats. The classFeat branch
 *    gates tiers correctly; archetypeFeat carried a comment saying they
 *    "pass untouched" — true when written, because classes had no tier
 *    data, and never revisited when classFeat was brought up to date.
 *
 * 2. THE HERITAGE TRAIT WAS READ BY NOTHING AT ALL. Six feats carry it
 *    and every one was offered at every level. Beastman states "Level 1
 *    only" in its prerequisites field as PROSE — which would not have
 *    worked even if parsed, since a level clause is a minimum.
 *
 * ─────────────────────────────────────────────────────────────────────
 * T8 IS THE CHECK THAT WOULD HAVE CAUGHT IT, and it is deliberately not
 * about any one feat. The symptom was that the answer did not vary: three
 * classes, one list. A per-feat check can be satisfied by a filter that
 * refuses everything; only comparing whole populations catches a gate
 * that has stopped gating in EITHER direction.
 *
 * DRIVEN AGAINST THE REAL PACK, because "which feats may this character
 * take" is only interesting if the answer is the feats actually in the
 * game. Fixtures are used only where the pack cannot pose the question.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  buildPickerFilter, withHeritageGate, hasHeritageTrait, heritageBlockReason
} from "../module/picker-filters.mjs";

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

async function readPack(name) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, v] of db.iterator()) if (v?.name) out.push(v);
  await db.close();
  return out;
}

const feats = await readPack("feats");
const classes = await readPack("classes");

/** A stand-in actor carrying only what these gates read: a level. */
const at = (level) => ({ system: { identity: { level } } });

/** Everything the pickers would offer this character in one slot. */
function offered(slotKey, ctx, level) {
  const base = buildPickerFilter(slotKey, ctx);
  const filter = withHeritageGate(base, at(level), slotKey);
  return feats.filter((f) => (filter ? filter(f) : true)).map((f) => f.name);
}

const ROGUE = { race: "Human", class: "Rogue", ownClass: "Rogue", tier: "Expert", archetypes: "" };
const FIGHTER = { race: "Human", class: "Fighter", ownClass: "Fighter", tier: "Martial", archetypes: "" };
const WIZARD = { race: "Human", class: "Wizard", ownClass: "Wizard", tier: "Adept", archetypes: "" };
const BARD = { race: "Human", class: "Bard", ownClass: "Bard", tier: "Adept/Expert", archetypes: "" };
const CLERIC = { race: "Human", class: "Cleric", ownClass: "Cleric", tier: "Adept", archetypes: "" };

/* ── P: THE POPULATIONS THESE CHECKS ASSUME ───────────────────────────
 *
 * PINNED, so a check below cannot start passing because the pack emptied
 * out underneath it. "No violations" is also what an empty search
 * returns. */

const heritageFeats = feats.filter(hasHeritageTrait).map((f) => f.name).sort();
equal("P1 THE SIX HERITAGE FEATS ARE STILL THE SIX",
  JSON.stringify(heritageFeats),
  JSON.stringify(["Adoptive Race", "Beastman", "Enigma", "Half-Elf", "Half-Ogre", "Half-Orc"]),
  "they span Racial, General and Archetype categories — the gate is not one slot's business");

const TIER_NAMES = ["martial", "expert", "adept"];
const tierArchetypes = feats
  .filter((f) => f.system?.category === "Archetype")
  .filter((f) => String(f.system?.traits ?? "").split(/,\s*/)
    .map((t) => t.trim().toLowerCase()).some((t) => TIER_NAMES.includes(t)))
  .map((f) => f.name).sort();
equal("P2 THE FIVE TIER-TRAITED ARCHETYPE FEATS ARE STILL THE FIVE",
  JSON.stringify(tierArchetypes),
  JSON.stringify(["Aegis", "Armour Master", "Assassin", "Cavalier", "Enigma"]),
  "these are the ones that were ungated; if the list shrinks the checks below go quiet");

const classTypes = Object.fromEntries(classes.map((c) => [c.name, String(c.system?.classType ?? "")]));
equal("P3 THE CLASSES STILL CARRY THEIR TIERS",
  JSON.stringify([classTypes.Rogue, classTypes.Fighter, classTypes.Wizard, classTypes.Bard]),
  JSON.stringify(["Expert", "Martial", "Adept", "Adept/Expert"]),
  "the tier gate compares against this field — empty it and every tier-traited feat "
  + "disappears for everyone, which no per-feat check below would call wrong");

/* ── T: THE TIER TRAIT ────────────────────────────────────────────────
 *
 * THE DEFECT ITSELF FIRST. */

ok("T1 ENIGMA IS NOT OFFERED TO A 4th-LEVEL ROGUE",
  !offered("archetypeFeat", ROGUE, 4).includes("Enigma"),
  "Graham's report. Adept gates it to Adept classes and Heritage to 1st level; the Rogue "
  + "fails both, and was offered it anyway");

ok("T1b BUT IT IS OFFERED TO A 1st-LEVEL WIZARD",
  offered("archetypeFeat", WIZARD, 1).includes("Enigma"),
  "WITHOUT THIS, T1 passes on a filter that refuses everything — the failure mode this "
  + "harness has recorded five times");

ok("T2 THE EXPERT ARCHETYPE GOES TO THE EXPERT CLASS",
  offered("archetypeFeat", ROGUE, 4).includes("Assassin")
  && !offered("archetypeFeat", FIGHTER, 4).includes("Assassin"),
  "Assassin is traited Expert; a Rogue is Expert and a Fighter is not");

ok("T3 THE MARTIAL ARCHETYPES GO TO THE MARTIAL CLASS",
  offered("archetypeFeat", FIGHTER, 4).includes("Aegis")
  && offered("archetypeFeat", FIGHTER, 4).includes("Cavalier")
  && !offered("archetypeFeat", ROGUE, 4).includes("Aegis"),
  "Aegis and Cavalier are traited Martial");

ok("T4 THE BARD'S TWO TIERS BOTH COUNT",
  offered("archetypeFeat", BARD, 4).includes("Assassin")
  && offered("archetypeFeat", BARD, 1).includes("Enigma"),
  "\"Adept/Expert\" is one class with two tiers — split on the slash, or a Bard matches "
  + "neither and loses both");

/* T5 NAMED THIEF FIRST AND FAILED, AND THE CODE WAS RIGHT.
 *
 * Thief carries no trait gate but reads "Non-Rogue" in its prerequisites,
 * so a Rogue is correctly refused it — by meetsClassPrerequisite, which
 * is a different gate entirely. The check had assumed "no traits" meant
 * "offered to everyone" and was simply wrong about this pack. Recorded
 * because a check corrected to match the code is worth exactly as much
 * as one that caught a defect, provided the correction is the honest way
 * round — and T5b now asserts the refusal instead of ignoring it. */
ok("T5 AN ARCHETYPE FEAT WITH NEITHER GATE IS OPEN TO ALL",
  ["Archer", "Medic", "Gymnast"].every((n) =>
    offered("archetypeFeat", ROGUE, 4).includes(n)
    && offered("archetypeFeat", FIGHTER, 4).includes(n)),
  "seventeen of the twenty-eight carry no class name and no tier; gating harder must not "
  + "catch them");

ok("T5b WHILE A \"Non-Rogue\" PREREQUISITE STILL REFUSES A ROGUE",
  !offered("archetypeFeat", ROGUE, 4).includes("Thief")
  && offered("archetypeFeat", FIGHTER, 4).includes("Thief"),
  "the gate that already worked, kept honest beside the new one");

ok("T6 A CLASS-NAMED ARCHETYPE FEAT STILL GATES ON THE CLASS",
  offered("archetypeFeat", CLERIC, 4).includes("War Priest")
  && !offered("archetypeFeat", ROGUE, 4).includes("War Priest"),
  "War Priest is traited Cleric — the gate that already worked must survive the new one "
  + "being added beside it");

/* T7 IS THE SHAPE OF THE BUG, NOT AN INSTANCE OF IT.
 *
 * Before the repair these three lists were identical — 22 feats each.
 * That is the measurement that found the defect, and it is the one that
 * cannot be satisfied by a filter which has quietly stopped filtering in
 * either direction. */
{
  const r = offered("archetypeFeat", ROGUE, 4).sort().join("|");
  const f = offered("archetypeFeat", FIGHTER, 4).sort().join("|");
  const w = offered("archetypeFeat", WIZARD, 4).sort().join("|");
  ok("T7 THREE CLASSES DO NOT ALL SEE THE SAME ARCHETYPE LIST",
    r !== f && f !== w && r !== w,
    "measured at 3.543.1: Rogue, Fighter and Wizard were each offered the identical 22. "
    + "A gate that stops gating and a gate that never gated look the same from inside a "
    + "per-feat check");
  ok("T7b AND NONE OF THEM SEES AN EMPTY ONE",
    [r, f, w].every((x) => x.split("|").filter(Boolean).length > 10),
    "the other way the lists could agree");
}

/* ── H: THE HERITAGE TRAIT ────────────────────────────────────────── */

ok("H1 HERITAGE FEATS ARE OFFERED AT 1st LEVEL",
  ["Half-Elf", "Half-Orc", "Half-Ogre", "Beastman"]
    .every((n) => offered("racialFeat", ROGUE, 1).includes(n)),
  "\"selected at 1st level only\" — 1st level is when they ARE selectable");

ok("H2 AND NOT AT 2nd",
  ["Half-Elf", "Half-Orc", "Half-Ogre", "Beastman"]
    .every((n) => !offered("racialFeat", ROGUE, 2).includes(n)),
  "the window closes the moment the character advances; before 3.544.0 it never closed");

ok("H2b NOR AT 4th, WHICH IS THE CHARACTER THAT WAS REPORTED",
  !offered("racialFeat", ROGUE, 4).some((n) =>
    ["Half-Elf", "Half-Orc", "Half-Ogre", "Beastman"].includes(n)));

ok("H3 BUT AN ORDINARY RACIAL FEAT IS STILL OFFERED AT 4th",
  offered("racialFeat", ROGUE, 4).length > 10,
  "WITHOUT THIS, H2 passes on a gate that empties the whole racial list above 1st level");

ok("H4 THE GATE SPANS CATEGORIES, NOT SLOTS",
  !offered("generalFeat", ROGUE, 4).includes("Adoptive Race")
  && offered("generalFeat", ROGUE, 1).includes("Adoptive Race"),
  "Adoptive Race is a GENERAL feat carrying Heritage; a gate written into the racial slot "
  + "alone would have missed it, and Enigma too");

ok("H4b AND ORDINARY GENERAL FEATS ARE UNTOUCHED",
  offered("generalFeat", ROGUE, 4).length > 20,
  "the positive control for H4");

equal("H5 THE PICKER SAYS WHY IT IS EMPTY",
  heritageBlockReason(at(4)),
  "Heritage feats may be selected at 1st level only — this character is level 4.",
  "a player who cannot find Half-Elf has no way to tell a rule from a bug");

equal("H5b AND SAYS NOTHING AT 1st LEVEL", heritageBlockReason(at(1)), null);

ok("H6 A LEVEL-0 CHARACTER IS TREATED AS 1st, NOT AS BLOCKED",
  offered("racialFeat", ROGUE, 0).includes("Half-Elf"),
  "an actor mid-creation reads level 0 before the field is set; refusing there would hide "
  + "the feats at exactly the moment they are meant to be picked");

/* H7 IS A QUESTION THE PACK CANNOT POSE.
 *
 * The mutation runner asked for it: swapping the trait test for a
 * substring match — `/heritage/i` against the whole traits string —
 * SURVIVED every check above, because no trait in this pack today merely
 * contains the word. It agrees by luck, and a trait added tomorrow ends
 * the luck silently. So the predicate is asked directly, with a word the
 * pack does not have. */
ok("H7 THE TRAIT IS MATCHED WHOLE, NOT AS A SUBSTRING",
  hasHeritageTrait({ system: { traits: "Adept, Heritage" } })
  && !hasHeritageTrait({ system: { traits: "Heritageborn" } })
  && !hasHeritageTrait({ system: { traits: "Anti-Heritage, Martial" } }),
  "a comma-separated trait list is a list of words, and \"Heritageborn\" is not one of "
  + "them — the same mistake exact-string matching made in the spell-tradition filter, "
  + "inverted");

ok("H7b AND AN ENTRY WITH NO TRAITS AT ALL IS NOT HERITAGE",
  !hasHeritageTrait({ system: {} }) && !hasHeritageTrait({}),
  "seventeen archetype feats and most general feats have an empty traits string");

/* ── D: A DATA DEFECT, PINNED RATHER THAN HIDDEN ────────────────────── */

const beastman = feats.find((f) => f.name === "Beastman");
equal("D1 BEASTMAN STILL CARRIES ITS PROSE PREREQUISITE",
  String(beastman?.system?.prerequisites ?? ""), "Level 1 only",
  "NOT A PASSING GRADE — this pins a defect. The rule now lives in the Heritage trait, so "
  + "this sentence is redundant; worse, as a parsed clause \"Level 1\" is a MINIMUM and "
  + "would mean the opposite of what it says. The other five Heritage feats say nothing. "
  + "When it is cleared this check FAILS, and the fix is to delete it");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-picker-traits: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-picker-traits: OK — ${checks} checks. A feat's tier trait and its `
  + `Heritage trait both decide who may take it, and three classes see three lists.\n`);
