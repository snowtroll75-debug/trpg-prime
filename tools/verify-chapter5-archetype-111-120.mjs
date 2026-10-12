#!/usr/bin/env node
/**
 * verify-chapter5-archetype-111-120 — block 11 of the page-by-page audit.
 *
 * Pages 111–113 finish Chapter 5's Archetype feats (the 20 page 110 did
 * not reach); pages 114–120 open the Class feats, Accurate Spell through
 * Inspired. The data layer came through clean — 20/20 and 79/79 present
 * and categorised, prerequisites matching on 78 of 79 with the one
 * difference being a typo in the book — so this file guards the two
 * things the audit changed.
 *
 * ───────────────────────────────────────────────────────────────────
 * A. THE GATE THAT WAS NOT THERE, and the comment that hid it.
 *
 * `system.progressionRequirements` is what archetype-progression.mjs
 * gates on: you may normally progress one archetype at a time, and taking
 * a second needs your current one's printed requirement satisfied first.
 * Three archetypes printed a requirement and carried an empty field:
 *
 *   Assassin    "Perception and Stealth both +10 ranks"
 *   Gymnast     "Acrobatics +10 ranks"
 *   Mastermind  "Arcana, Crafting, Culture, Nature, Occultism, Planes
 *                or Religion +10 ranks"
 *
 * An empty field never blocks — right for an unparseable requirement,
 * wrong for one never extracted — so those three had no gate at all.
 *
 * AND THE INTERESTING HALF IS WHY IT SURVIVED. The module's own header
 * stated as settled fact that all four of Assassin, Enigma, Gymnast and
 * Mastermind "print no Progression Requirements sentence at all". Three
 * quarters of that was false, and anyone checking would have read the
 * comment, found the empty fields agreeing with it, and stopped. The
 * comment was not merely wrong; it was load-bearing for the wrong answer.
 *
 * So section A reads the requirements OUT OF THE PACK and RUNS them. A
 * check that re-stated the three strings would be the same comment in a
 * different file.
 *
 * ───────────────────────────────────────────────────────────────────
 * B. ASSESS TRACKS, the block's only note-only feat — a whole action
 * (two DC sources, a margin-scaled payout, a retry clause) declared in
 * prose and doing nothing. Graham's R2 ruling of 18 September 2026 set
 * where the automation stops: the system counts, the GM chooses.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { meetsProgressionRequirement } from "../module/archetype-progression.mjs";
import { assessTracksDC, assessTracksNote, assessTracksFailureNote } from "../module/assess-tracks.mjs";
import { DEGREES, DEGREE_BY_KEY } from "../module/dice/resolution.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const src = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");

/** Every item in a pack, by lower-cased name. */
async function readPack(name) {
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const items = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!")) {
        items.set(String(value?.name ?? "").trim().toLowerCase(), value);
      }
    }
  } finally { await db.close(); }
  return items;
}

const feats = await readPack("feats");

/* ================================================================== *
 * A. THE PROGRESSION GATE
 * ================================================================== */

const progOf = (name) => String(feats.get(name)?.system?.progressionRequirements ?? "");

// READ FROM THE PACK AND RUN, never re-stated here. A check that hard-codes
// the string proves the harness can type, not that the gate works.
const ASSASSIN = progOf("assassin");
const GYMNAST = progOf("gymnast");
const MASTERMIND = progOf("mastermind");

ok("A1 Assassin now carries a progression requirement", ASSASSIN.length > 0);
ok("A2 Gymnast too", GYMNAST.length > 0);
ok("A3 Mastermind too", MASTERMIND.length > 0);
// ENIGMA IS THE ONE THE OLD COMMENT GOT RIGHT, and it must stay empty:
// filling it to make the four consistent would invent a rule.
equal("A4 Enigma prints none, and still carries none", progOf("enigma"), "");

const ranks = (obj) => ({ skillRanks: obj });

// EACH MUST PARSE — AND THAT IS ASKED BEHAVIOURALLY, not by inspecting
// the parse tree. An unparsed requirement never blocks, which is the
// state all three were already in, so the question "did this parse" is
// really "does a character who plainly fails it get refused". A character
// with no ranks at all fails every reading of every one of these lines;
// if they are let through, the clause went unparsed.
ok("A5 Assassin's requirement refuses a character with nothing",
  meetsProgressionRequirement(ASSASSIN, ranks({})) === false,
  `unparsed: ${JSON.stringify(ASSASSIN)} — an unparsed requirement never blocks`);
ok("A6 Gymnast's does too", meetsProgressionRequirement(GYMNAST, ranks({})) === false);
ok("A7 Mastermind's does too", meetsProgressionRequirement(MASTERMIND, ranks({})) === false);

// ASSASSIN, RUN. Both skills or neither — the three cases that tell an
// AND from an OR are exactly these.
ok("A10 Assassin: both at 10 passes",
  meetsProgressionRequirement(ASSASSIN, ranks({ perception: 10, stealth: 10 })) === true);
ok("A11 Assassin: Perception alone does NOT",
  meetsProgressionRequirement(ASSASSIN, ranks({ perception: 10, stealth: 9 })) === false,
  "this is the check that fails if the AND is ever read as an OR");
ok("A12 Assassin: Stealth alone does NOT",
  meetsProgressionRequirement(ASSASSIN, ranks({ perception: 9, stealth: 10 })) === false);
ok("A13 Assassin: neither does not",
  meetsProgressionRequirement(ASSASSIN, ranks({ perception: 9, stealth: 9 })) === false);

// GYMNAST, RUN — one skill, and the boundary is the rule.
ok("A14 Gymnast: Acrobatics 10 passes",
  meetsProgressionRequirement(GYMNAST, ranks({ acrobatics: 10 })) === true);
ok("A15 Gymnast: Acrobatics 9 does not",
  meetsProgressionRequirement(GYMNAST, ranks({ acrobatics: 9 })) === false);
ok("A16 Gymnast: a different skill at 10 does not",
  meetsProgressionRequirement(GYMNAST, ranks({ stealth: 10 })) === false);

// MASTERMIND, RUN — any ONE of seven, and not a different seven.
ok("A17 Mastermind: Crafting alone passes",
  meetsProgressionRequirement(MASTERMIND, ranks({ crafting: 10 })) === true);
ok("A18 Mastermind: Religion alone passes",
  meetsProgressionRequirement(MASTERMIND, ranks({ religion: 10 })) === true);
ok("A19 Mastermind: all seven at 9 does not",
  meetsProgressionRequirement(MASTERMIND, ranks({
    arcana: 9, crafting: 9, culture: 9, nature: 9, occultism: 9, planes: 9, religion: 9
  })) === false);
// THE TWO SEVENS ARE NOT THE SAME SEVEN. Mastermind has Crafting where
// Loremaster has Linguistics, mirroring each archetype's prerequisites —
// so a copy-paste of one list into the other is a real risk and this is
// what refuses it.
ok("A20 Mastermind's list is not Loremaster's",
  meetsProgressionRequirement(MASTERMIND, ranks({ linguistics: 10 })) === false
  && meetsProgressionRequirement(progOf("loremaster"), ranks({ linguistics: 10 })) === true,
  "Linguistics satisfies Loremaster and must not satisfy Mastermind");

// AND AN EMPTY REQUIREMENT STILL NEVER BLOCKS — the fail-open choice the
// module documents, which is right for Enigma and was wrong for the other
// three only because their fields should never have been empty.
ok("A21 an empty requirement passes", meetsProgressionRequirement("", ranks({})) === true);

/* ================================================================== *
 * B. THE PARSER — the AND shape, and what it refuses
 *
 * ASKED THROUGH `meetsProgressionRequirement` RATHER THAN THE PARSE TREE.
 * Two reasons, and the second is the better one. First, importing the
 * parser here would make this harness its only caller outside its own
 * file, which the uncalled-export ratchet is right to complain about.
 * Second, the parse tree is an implementation detail and the gate is the
 * rule: "does an AND refuse a character who has only one of the two" is
 * the question that matters, and a check that asserts `type === "skillAll"`
 * would pass on a matcher that then used `some`.
 *
 * A REFUSED CLAUSE IS RECOGNISED BY WHAT IT LETS THROUGH. An unparsed
 * requirement never blocks, so a character with NOTHING passing it is the
 * signature of a refusal — and any successful parse of these lines would
 * have refused them.
 * ================================================================== */

const meets = (text, skillRanks, rest = {}) =>
  meetsProgressionRequirement(text, { skillRanks, ...rest });

// AND: one of the two is not enough. This is R1, stated as behaviour.
ok("B1 'and' refuses a character holding only one of the two",
  meets("Perception and Stealth +10 ranks", { perception: 10 }) === false
  && meets("Perception and Stealth +10 ranks", { perception: 10, stealth: 10 }) === true);
// "both" must come off as a word, not be read as a third skill name — if
// it were, the clause would fail to parse and stop refusing anything.
ok("B2 'both' is stripped rather than treated as a skill",
  meets("Perception and Stealth both +10 ranks", { perception: 10, stealth: 10 }) === true
  && meets("Perception and Stealth both +10 ranks", { perception: 10 }) === false);
ok("B3 'or' still accepts either",
  meets("Arcana or Religion +10 ranks", { arcana: 10 }) === true
  && meets("Arcana or Religion +10 ranks", { religion: 10 }) === true);
ok("B4 one skill still works on its own",
  meets("Acrobatics +10 ranks", { acrobatics: 10 }) === true
  && meets("Acrobatics +10 ranks", { acrobatics: 9 }) === false);
// REFUSED RATHER THAN GUESSED. No such line exists in the book; if one is
// written, an unparsed clause never blocks, which beats picking a reading.
ok("B5 a line using both joiners is refused, so it blocks nobody",
  meets("Arcana and Stealth or Religion +10 ranks", {}) === true,
  "a character with no ranks passes only if the clause went unparsed");
ok("B6 a name that is not a skill is refused the same way",
  meets("Gained class skill +10 ranks", {}) === true);
// THE SHAPES THAT WERE ALREADY WORKING MUST KEEP WORKING.
ok("B7 BAB is untouched",
  meets("BAB +10", {}, { bab: 10 }) === true && meets("BAB +10", {}, { bab: 9 }) === false);
ok("B8 the 'skill' suffix is still stripped",
  meets("Perform skill +10 ranks", { perform: 10 }) === true
  && meets("Perform skill +10 ranks", { perform: 9 }) === false);

/* ================================================================== *
 * C. THE COMMENT THAT HID IT
 *
 * D2 of the audit. A check on prose is unusual and this one earns its
 * place: the false claim is exactly what stopped anyone looking, so
 * restoring it would restore the defect's cover.
 * ================================================================== */

{
  const moduleSrc = src("module", "archetype-progression.mjs");
  ok("C1 the header no longer claims all four print nothing",
    !/Four\s*\n?\s*\*?\s*archetypes \(Assassin, Enigma, Gymnast, Mastermind\) print no Progression/.test(
      moduleSrc.replace(/\s+/g, " ")
    ) && !/archetypes \(Assassin, Enigma, Gymnast, Mastermind\) print no Progression Requirements sentence at all/
      .test(moduleSrc.replace(/\s+/g, " ")),
    "the claim that hid the defect for three releases");
  ok("C2 and records which one of the four was actually right",
    /Only ENIGMA genuinely prints/.test(moduleSrc),
    "deleting the wrong claim without keeping the true part invites the same edit back");
}

/* ================================================================== *
 * D. ASSESS TRACKS
 * ================================================================== */

const assess = SKILL_ACTIONS.find((a) => a.key === "assessTracks");
ok("D1 the action exists", Boolean(assess),
  "it was note-only: a whole action declared in prose and doing nothing");
equal("D2 it rolls Survival", JSON.stringify(assess?.skills), JSON.stringify(["survival"]));
equal("D3 as a skill check", assess?.checkType, "skill");
// THE DEFAULT DC IS THE QUARRY'S LEVEL DC. The second source is a
// condition and is asked, not declared as an array — the array form takes
// the HIGHER of two, which would gate an unwary quarry on a Survival DC
// they were not using. See module/assess-tracks.mjs.
equal("D4 against the target's Level DC by default", assess?.against, "levelDC");
ok("D5 and it is NOT declared as a two-DC array",
  !Array.isArray(assess?.against),
  "the array form takes the higher of two, which is not what 'if they are covering' means");
// GATED ON THE FEAT. Every tracker must not be able to do a class feat's
// trick; `requiresFeat` is the field the sheet filters the action list on.
equal("D6 gated on holding the feat", assess?.requiresFeat, "Assess Tracks");
ok("D7 and the feat it names is really in the pack", feats.has("assess tracks"));

// THE DC CONDITION, RUN.
equal("D8 not covering: the Level DC", assessTracksDC(false, 18, 22).dc, 18);
equal("D9 covering: the Survival DC", assessTracksDC(true, 18, 22).dc, 22);
// AND THE LOWER SURVIVAL DC IS STILL USED WHEN COVERING — proving this is
// a condition rather than a maximum. If someone "simplifies" it to the
// higher of the two, this is the check that goes red.
equal("D10 covering with a LOWER Survival DC still uses it",
  assessTracksDC(true, 25, 12).dc, 12);
ok("D11 a quarry with no readable Survival DC falls back rather than failing",
  assessTracksDC(true, 18, NaN).dc === 18,
  "an unreadable sheet should not cancel the action");
ok("D12 the card says WHICH DC was used",
  /Survival DC/.test(assessTracksDC(true, 18, 22).label)
  && /Level DC/.test(assessTracksDC(false, 18, 22).label),
  "'vs DC 18' does not tell a player whether the system understood the situation");

// THE PAYOUT. "One additional detail for every point by which your check
// EXCEEDS the difficulty" — so a margin of 0 is a success that buys
// nothing further, and that boundary is the easiest thing to get wrong.
ok("D13 margin 0 learns the Speed and no more",
  /base Speed/.test(assessTracksNote(0)) && /no more/.test(assessTracksNote(0))
  && !/further detail/.test(assessTracksNote(0)));
ok("D14 margin 1 earns exactly one, singular",
  /1 further detail<\/strong>/.test(assessTracksNote(1)));
ok("D15 margin 4 earns four, plural",
  /4 further details<\/strong>/.test(assessTracksNote(4)));
ok("D16 a negative margin earns none",
  !/further detail/.test(assessTracksNote(-3)));
ok("D17 the base Speed is always named", /base Speed/.test(assessTracksNote(7)));
ok("D18 and the quarry is named when there is one",
  /the wolf's base Speed/.test(assessTracksNote(3, "the wolf")));

// WHERE THE AUTOMATION STOPS — Graham's R2 ruling. The card repeats the
// printed list and hands the choice back; it does not pick the details.
ok("D19 the card offers the printed list rather than choosing from it",
  /climb or swim speeds/i.test(assessTracksNote(3))
  && /GM chooses which/i.test(assessTracksNote(3)),
  "R2: the system counts, the GM chooses");
ok("D20 the failure states the retry the book grants",
  /retry after an hour/i.test(assessTracksFailureNote()));

// WIRED. A rule with no call site is a well-tested opinion.
{
  const wf = src("module", "combat", "action-workflow.mjs");
  ok("D21 the workflow asks the covering question",
    /action\.key === "assessTracks" && !skipDialog\(event\)/.test(wf));
  ok("D22 and overrides the DC from the answer",
    /action\.key === "assessTracks" && assessTracksSetup && targetActor/.test(wf),
    "written as an action.key test so verify-action-default-dc can see it");
  ok("D23 and prints the payout from the MARGIN, not the degree",
    /assessTracksNote\(Number\(checkMargin \?\? 0\)/.test(wf),
    "the degree says whether you learned anything; the margin says how much");
  ok("D24 with the failure line on the other branch",
    /assessTracksFailureNote\(\)/.test(wf));

  /* ---- D25-D27: WHICH BRANCH RUNS ------------------------------- *
   * THE DEFECT LIVE TESTING FOUND AND THIS FILE DID NOT. D21-D24 prove
   * both notes exist and that the workflow names them. They say nothing
   * about which one a success gets — and the first build picked the
   * wrong one every time, because it wrote `DEGREES[degree]`.
   *
   * `DEGREES` is an ARRAY of degree records. Indexing it with the degree
   * KEY ("success") yields undefined, `?.success` is undefined, the
   * ternary takes the else, and every successful reading of a trail
   * printed "You learn nothing from the tracks." The check card said
   * Success directly above it.
   *
   * TWO CHECKS OUT OF ONE BUG, because the trap is not mine alone: any
   * file that imports DEGREES can reach for it by key. D27 is the
   * general form and it scans the whole module tree.
   * --------------------------------------------------------------- */
  ok("D25 the success test looks the degree up by key",
    /DEGREE_BY_KEY\[degree\]\?\.success/.test(wf),
    "DEGREES is an array — indexing it by degree key is always undefined");
  ok("D26 and DEGREES really is an array, which is what makes that a bug",
    Array.isArray(DEGREES) && DEGREE_BY_KEY.success?.success === true,
    "if DEGREES ever becomes a keyed object this check should be revisited, not deleted");
}

// D27: THE GENERAL FORM. Nowhere in the system may DEGREES be indexed by
// anything but a number — `DEGREES[i]`, `DEGREES[index - 1]` and
// `DEGREES[DEGREES.length - 1]` are all fine; `DEGREES[degree]` and
// `DEGREES["success"]` are the silent-undefined shape this release paid
// for. Scanned across every module rather than the one file that had it.
{
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!entry.name.endsWith(".mjs")) continue;
      const text = fs.readFileSync(p, "utf8");
      for (const m of text.matchAll(/\bDEGREES\s*\[\s*([^\]]+)\]/g)) {
        const index = m[1].trim();
        const numeric = /^\d+$/.test(index)
          || /\b(?:length|index|i|rank|idx)\b/.test(index)
          || /[-+*]/.test(index);
        if (!numeric) offenders.push(`${path.relative(SYSTEM_ROOT, p)}: DEGREES[${index}]`);
      }
    }
  };
  walk(path.join(SYSTEM_ROOT, "module"));
  ok("D27 nothing indexes DEGREES by a degree key anywhere",
    offenders.length === 0,
    `${JSON.stringify(offenders)} — DEGREES is an array; use DEGREE_BY_KEY`);
}

/* ================================================================== *
 * E. THE DATA LAYER — the counts the audit measured
 * ================================================================== */

{
  const all = [...feats.values()];
  const archetypes = all.filter((f) => f.system?.category === "Archetype");
  equal("E1 all 28 archetype feats are present", archetypes.length, 28);
  ok("E2 and every one of the block's 20 is among them",
    ["assassin", "blessed by the gods", "cavalier", "champion", "cloistered priest", "enigma",
      "gleeman", "gymnast", "language master", "loremaster", "mastermind", "medic", "priest",
      "primal warrior", "runemage", "thief", "vanguard", "warden", "war priest", "warrior"]
      .every((n) => feats.get(n)?.system?.category === "Archetype"));
  // THE BOOK'S TYPO, NOT THE PACK'S (erratum E1 of the block). Beyond
  // Reach prints "Acrobatics10 ranks" with no space; the pack has it
  // right, and this check exists so nobody "fixes" the pack to match.
  equal("E3 Beyond Reach's prerequisite keeps the space the book drops",
    String(feats.get("beyond reach")?.system?.prerequisites ?? ""), "Acrobatics 10 ranks");
}

if (failures.length) {
  process.stderr.write(`\nverify-chapter5-archetype-111-120: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter5-archetype-111-120: OK — ${checks} checks.\n`);
