#!/usr/bin/env node
/**
 * verify-racial-pp — racial and heritage Power Points, and their scale.
 *
 * NEW at 3.417.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS CHAPTER EXISTS TO KEEP DEAD.
 *
 * Graham, 27 August 2026: "The Sharuk-Xal Heritage is not adding PP
 * correctly to the character."
 *
 * Every plumbing check passed, and would have passed. `heritage` is an
 * autogrant type; the hook fires on `createItem`; the stored delta
 * reconciles on level change; the +2 landed exactly as authored. What
 * was wrong was the SCALE — races and Sharuk-Xal granted their Power
 * Points once, while the three heritages printing "an additional PP per
 * level" granted them per level. One printed phrase, two meanings,
 * depending on which item carried it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY SECTION C IS THE ONE THAT MATTERS.
 *
 * -1 and +2 net to +1 at EVERY level. A flat implementation and a
 * per-level one produce identical numbers at level 1, which is the level
 * you build a character at and therefore the level you check it at. The
 * two readings only separate at level 2 and above, and the gap widens by
 * a point each time.
 *
 * So a check that reads the pair at one level proves nothing at all. C
 * reads it at several, and that is the whole design of this file.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  RACIAL_PP_PER_LEVEL, HERITAGE_PP_PER_LEVEL, ppLevels, racialPPDue, racialPPTotal
} from "../module/racial-pp.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. The printed figures
 * ================================================================== */

for (const [race, expected] of Object.entries({
  ascendan: 1, elf: 1, gnome: 1, orc: -1, dwarf: 0, halfling: 0, human: 0, kornargon: 0
})) {
  ok(`A1 ${race} grants ${expected} racial PP per level`,
    RACIAL_PP_PER_LEVEL[race] === expected,
    `table says ${RACIAL_PP_PER_LEVEL[race]}`);
}
// A ZERO MUST BE PRESENT, not absent. "This race grants nothing" and
// "nobody has checked this race" are different facts, and the pack could
// not tell them apart before.
ok("A2 the races printing zero are recorded as zero",
  ["dwarf", "halfling", "human", "kornargon"].every((r) => RACIAL_PP_PER_LEVEL[r] === 0));
ok("A3 every race in the pack's own list is covered",
  Object.keys(RACIAL_PP_PER_LEVEL).length === 8,
  `${Object.keys(RACIAL_PP_PER_LEVEL).length} listed`);

ok("A4 Sharuk-Xal carries the difference, not the destination",
  HERITAGE_PP_PER_LEVEL["sharuk-xal"] === 2,
  '"+1 instead of -1" against a race that already granted -1');
ok("A5 the three per-level heritages each grant one",
  ["urloch", "gul-fyr", "fey"].every((h) => HERITAGE_PP_PER_LEVEL[h] === 1));

/* ================================================================== *
 * B. The level rule
 * ================================================================== */

ok("B1 levels are counted from one", ppLevels(1) === 1 && ppLevels(5) === 5);
ok("B2 a level of zero grants nothing", ppLevels(0) === 0);
// A NEGATIVE MULTIPLE OF A NEGATIVE FIGURE WOULD PAY AN ORC. Floored.
ok("B3 a negative level cannot pay an Orc", ppLevels(-3) === 0
  && racialPPDue("Orc", -3) === 0);
ok("B4 a missing level grants nothing", ppLevels(undefined) === 0 && ppLevels(null) === 0);
ok("B5 a fractional level is truncated", ppLevels(3.9) === 3);

/* ================================================================== *
 * C. THE PAIR, READ AT SEVERAL LEVELS
 *
 * The section the defect bought. See the header: flat and per-level are
 * indistinguishable at level 1.
 * ================================================================== */

ok("C1 an Orc Sharuk-Xal nets +1 at first level", racialPPTotal("Orc", "Sharuk-Xal", 1) === 1);
// AND HERE IS WHERE THE TWO READINGS SEPARATE. A flat implementation
// answers 1 to all three of these.
ok("C2 and +3 at third", racialPPTotal("Orc", "Sharuk-Xal", 3) === 3,
  "a flat grant answers 1 here — this is the defect");
ok("C3 and +5 at fifth", racialPPTotal("Orc", "Sharuk-Xal", 5) === 5);
ok("C4 the pair scales strictly with level",
  [1, 2, 3, 4, 5, 10].every((l) => racialPPTotal("Orc", "Sharuk-Xal", l) === l),
  "net +1 per level, at every level");

// THE HALVES, SEPARATELY, so a future edit cannot fix the net by
// breaking both.
ok("C5 the Orc's own line is -1 per level",
  [1, 3, 5].every((l) => racialPPDue("Orc", l) === -l));
ok("C6 Sharuk-Xal's own line is +2 per level",
  [1, 3, 5].every((l) => racialPPDue("Sharuk-Xal", l) === 2 * l));

/* ================================================================== *
 * D. Everyone else
 * ================================================================== */

ok("D1 an Elf gains one per level", [1, 3, 5].every((l) => racialPPDue("Elf", l) === l));
ok("D2 a Dwarf gains none, at any level",
  [1, 5, 20].every((l) => racialPPDue("Dwarf", l) === 0));
ok("D3 a name the tables do not know grants nothing",
  racialPPDue("Tiefling", 5) === 0,
  "a homebrew race is an ordinary thing to have, not an error");
ok("D4 the name is matched without regard to case",
  racialPPDue("ORC", 3) === -3 && racialPPDue("sharuk-xal", 3) === 6);
ok("D5 and without surrounding space", racialPPDue("  Elf  ", 2) === 2);

/* ================================================================== *
 * E. One owner — the workflow reads this table, not a second copy
 * ================================================================== */

const workflow = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs"), "utf8");

ok("E1 the grant table imports the racial figures",
  /import \{[^}]*RACIAL_PP_PER_LEVEL[^}]*\} from "\.\/racial-pp\.mjs"/.test(workflow),
  "two copies of a value agree until one is edited");
ok("E2 the racial rows are built FROM the table",
  /Object\.entries\(RACIAL_PP_PER_LEVEL\)/.test(workflow));
ok("E3 the heritage rows read the table too",
  /HERITAGE_PP_PER_LEVEL\["sharuk-xal"\]/.test(workflow));
ok("E4 no hand-written race list survives beside it",
  !/\{ race: "Ascendan", value: 1 \}/.test(workflow),
  "the literal list this replaced must be gone, not merely unused");
// COUNTS THE USES, NOT THE DECLARATION. The first draft matched
// `racialPPLevels(actor)`, which the function's own signature satisfies
// — so deleting one of the three call sites still left three matches and
// the mutation survived. A definition is not a use.
ok("E5 every per-level PP grant counts levels the same way",
  (workflow.match(/value \* racialPPLevels\(actor\)/g) ?? []).length === 3,
  `the racial, corrective and printed-per-level lines share one rule — `
  + `found ${(workflow.match(/value \* racialPPLevels\(actor\)/g) ?? []).length}`);

/* ================================================================== */

const label = "verify-racial-pp";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
