#!/usr/bin/env node
/**
 * verify-percentile-bias — advantage on a d100 reorders, it does not reroll.
 *
 * NEW at 3.419.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE, IN GRAHAM'S OWN WORDS (27 August 2026).
 *
 *   "A d100 roll at advantage chooses the highest die as tens (so a roll
 *    of 67 would be 76, a roll of 23 would be 32). A d100 roll at
 *    disadvantage chooses the lowest die as tens (so 87 would be 78, 91
 *    would be 19)."
 *
 * Two dice are rolled ONCE. The bias decides which of them stands in the
 * tens place; the other takes the units. Nothing extra is drawn.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS THERE, AND WHY IT READ AS CORRECT.
 *
 * `rollPercentile` drew a SECOND TENS DIE and kept the higher or lower
 * of the two, leaving the units die untouched. Its own comment said
 * "select the more favourable die as the tens digit... so an extra tens
 * die is drawn" — the d20 habit of rolling twice and keeping one, wearing
 * a d100's clothes.
 *
 * It is a different distribution, and it fails in a way a table would
 * struggle to notice: the numbers still look like plausible d100 rolls.
 * Only the worked examples separate the two readings, which is why this
 * file leads with all four of them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND IT IS NOT COSMETIC, BECAUSE THE UNITS DIGIT IS LOAD-BEARING.
 *
 * `hitLocationFromUnitDie` reads the units die of a critical injury to
 * decide WHERE the blow landed. The correct rule moves a digit into the
 * units place; the old one never touched it. So a deadly hit rolled at
 * advantage struck the wrong part of the body as well as reading the
 * wrong row — and severity drives the bias, so every Minor and every
 * Deadly critical in the game was affected.
 */

import fs from "node:fs";
import path from "node:path";
import * as acorn from "acorn";
import { SYSTEM_ROOT, findSourceFiles, rel } from "./lib/sources.mjs";
import { rollPercentile, percentileValue, percentileDigits } from "../module/dice/open-ended.mjs";
import { hitLocationFromUnitDie } from "../module/combat/hit-location.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/** Roll with the two digits forced, in draw order. */
const roll = async (first, second, bias) => {
  const seq = [first, second];
  let i = 0;
  return rollPercentile({ drawTen: () => seq[i++], drawUnit: () => seq[i++], bias });
};

/* ================================================================== *
 * A. GRAHAM'S FOUR WORKED EXAMPLES
 *
 * The section that separates the two readings. The old implementation
 * cannot produce these numbers from these dice.
 * ================================================================== */

for (const [a, b, bias, want] of [
  [6, 7, "advantage", 76],
  [2, 3, "advantage", 32],
  [8, 7, "disadvantage", 78],
  [9, 1, "disadvantage", 19]
]) {
  const r = await roll(a, b, bias);
  ok(`A1 ${a}${b} at ${bias} reads ${want}`, r.value === want, `got ${r.value}`);
}

/* ================================================================== *
 * B. The reordering itself
 * ================================================================== */

{
  const adv = await roll(3, 8, "advantage");
  ok("B1 advantage puts the higher digit in the tens", adv.tens === 8);
  ok("B2 and the lower digit in the units", adv.unit === 3);
  const dis = await roll(3, 8, "disadvantage");
  ok("B3 disadvantage puts the lower digit in the tens", dis.tens === 3);
  ok("B4 and the higher digit in the units", dis.unit === 8);
  ok("B5 the two biases are mirror images", adv.value === 83 && dis.value === 38);
}

// NORMAL LEAVES THE ORDER ALONE. The first die drawn is the tens.
{
  const plain = await roll(6, 7, "normal");
  ok("B6 an unbiased roll keeps its draw order", plain.value === 67
    && plain.tens === 6 && plain.unit === 7);
  ok("B7 and reports that nothing was swapped", plain.swapped === false);
}

// ONLY TWO DICE, EVER. The old rule drew a third under a bias.
{
  let draws = 0;
  const count = () => { draws += 1; return 5; };
  await rollPercentile({ drawTen: count, drawUnit: count, bias: "advantage" });
  ok("B8 a biased roll draws exactly two dice", draws === 2,
    `drew ${draws} — the old rule drew a second tens die`);
}

ok("B9 the pair is reported as rolled, for the card",
  (await roll(2, 9, "advantage")).drawn.join() === "2,9");
ok("B10 a swap is reported", (await roll(2, 9, "advantage")).swapped === true);
ok("B11 and a roll needing no swap is not",
  (await roll(9, 2, "advantage")).swapped === false,
  "9 is already the higher digit and already in the tens");

/* ================================================================== *
 * C. Edges
 * ================================================================== */

{
  const zero = await roll(0, 0, "disadvantage");
  ok("C1 a double zero is 100 under either bias", zero.value === 100
    && (await roll(0, 0, "advantage")).value === 100,
    "nothing to reorder when the digits match — a consequence of 00 reading as 100");
  const matched = await roll(4, 4, "advantage");
  ok("C2 matching digits are unchanged", matched.value === 44 && matched.swapped === false);
  const nought = await roll(0, 7, "disadvantage");
  ok("C3 a leading zero disadvantages correctly", nought.value === 7,
    "0 and 7: the lower is 0, so 07");
  const highAdv = await roll(0, 7, "advantage");
  ok("C4 and advantages correctly", highAdv.value === 70);
}

/* ================================================================== *
 * D. THE UNITS DIGIT DRIVES HIT LOCATION
 *
 * The half that makes this more than a numbers change.
 * ================================================================== */

{
  const plain = await roll(6, 7, "normal");
  const adv = await roll(6, 7, "advantage");
  ok("D1 the swap moves the units digit", plain.unit !== adv.unit,
    "the old rule left the units die untouched by any bias");
  ok("D2 so the hit location moves with it",
    hitLocationFromUnitDie(plain.unit) !== hitLocationFromUnitDie(adv.unit),
    `${hitLocationFromUnitDie(plain.unit)} vs ${hitLocationFromUnitDie(adv.unit)}`);
  ok("D3 the location is read from the digit that ended up in the units",
    hitLocationFromUnitDie(adv.unit) === hitLocationFromUnitDie(6));
}

/* ================================================================== *
 * E. Severity chooses the bias
 * ================================================================== */

const attack = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs"), "utf8");

ok("E1 a deadly critical rolls at advantage",
  /severity === "deadly"\s*\?\s*"advantage"/.test(attack));
ok("E2 a minor critical rolls at disadvantage",
  /severity === "minor"\s*\?\s*"disadvantage"/.test(attack));
ok("E3 a serious critical rolls normally",
  /:\s*"normal";/.test(attack),
  "Minor disadvantage, Serious normal, Deadly advantage");
ok("E4 the injury roll goes through rollPercentile",
  /await rollPercentile\(\{/.test(attack),
  "the bias must reach the one place that knows the rule");

/* ================================================================== *
 * F. Nothing still expects the old shape
 * ================================================================== */

const openEnded = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "dice", "open-ended.mjs"), "utf8");
ok("F1 no second tens die is drawn", !/tens\.push\(/.test(openEnded),
  "the old rule's signature line");
ok("F2 chosenTen is gone from the engine", !/chosenTen/.test(openEnded));

const check = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "dice", "check.mjs"), "utf8");
ok("F3 and from the card's data", !/chosenTen/.test(check),
  "it mapped an array of tens dice, which only the wrong rule produces");
const card = fs.readFileSync(
  path.join(SYSTEM_ROOT, "templates", "chat", "check-card.hbs"), "utf8");
ok("F4 the card no longer iterates a list of tens dice",
  !/#each percentile\.tens/.test(card));
ok("F5 and shows the reordering when it happens",
  /percentile\.swapped/.test(card),
  "a number a player cannot account for is worse than no number");

/* ================================================================== *
 * G. THE ZERO RULE
 *
 * Graham, 27 August 2026:
 *
 *   "When making a percentile roll a 0 rolled on the tens die is
 *    considered to be a 0 unless the units die is a 0 as well (in which
 *    case the combined total is always a 100)."
 *
 * The engine already did this. What it did NOT have was one place that
 * did it: the line `value === 0 ? 100 : value` was written out by hand
 * in four separate files, and the fourth — the inverse, used when Ambush
 * or Sniping shifts a critical — got it wrong. See section H.
 *
 * These read the rule as a RULE rather than at a handful of points,
 * because the interesting thing about a special case is not that it
 * fires where it should but that it fires NOWHERE ELSE.
 * ================================================================== */

// A ZERO IN THE TENS PLACE IS WORTH NOTHING. Not ten, not a hundred.
for (let u = 1; u <= 9; u += 1) {
  ok(`G1 a tens die of 0 with a units die of ${u} reads ${u}`,
    percentileValue(0, u) === u, `got ${percentileValue(0, u)}`);
}
ok("G2 and the pair 00 reads 100", percentileValue(0, 0) === 100);

// EXHAUSTIVE, BECAUSE THE CLAIM IS ABOUT EVERY PAIR. A special case is
// only correct if it is also rare: 100 must arise from 00 and from
// nothing else, and 0 must never arise at all.
{
  let zeros = 0;
  const hundredFrom = [];
  for (const bias of ["normal", "advantage", "disadvantage"]) {
    for (let t = 0; t <= 9; t += 1) {
      for (let u = 0; u <= 9; u += 1) {
        const r = await roll(t, u, bias);
        if (r.value === 0) zeros += 1;
        if (r.value === 100) hundredFrom.push(`${t}${u}@${bias}`);
      }
    }
  }
  ok("G3 no pair of digits, under any bias, produces a 0", zeros === 0,
    `${zeros} pairs read as zero — a roll off the bottom of every table`);
  ok("G4 and 100 comes from the pair 00, under every bias, and nothing else",
    hundredFrom.join() === "00@normal,00@advantage,00@disadvantage",
    hundredFrom.join());
}

// THE STRONGEST STATEMENT OF THE RULE. Unbiased, the hundred pairs of
// digits map onto the hundred values 1-100 exactly once each. That is
// what makes it a d100 and not a d100-shaped thing, and it is a claim
// the four hand-written copies could not have made about themselves.
{
  const seen = new Map();
  for (let t = 0; t <= 9; t += 1) {
    for (let u = 0; u <= 9; u += 1) seen.set(percentileValue(t, u), (seen.get(percentileValue(t, u)) ?? 0) + 1);
  }
  ok("G5 the hundred digit pairs cover 1-100 exactly once each",
    seen.size === 100 && [...seen.values()].every((n) => n === 1)
      && [...seen.keys()].every((v) => v >= 1 && v <= 100),
    `${seen.size} distinct values`);
}

// A d10 SHOWS 10, NOT 0. Foundry's 1d10 returns 1-10 and every caller
// writes `% 10` to make a digit of it. The fold belongs in the rule too,
// so that forgetting it upstream is harmless rather than catastrophic.
ok("G6 a d10's 10 is folded to the digit zero", percentileValue(10, 7) === 7
  && percentileValue(10, 10) === 100);
// AND FOLDED BEFORE THE BIAS COMPARES THEM. Zero is the smallest digit
// but 10 is the largest number: comparing raw faces would hand advantage
// a leading zero and call it the best of the two.
{
  const r = await roll(10, 7, "advantage");
  ok("G7 advantage reads an unfolded 10 as the zero it is", r.value === 70,
    `got ${r.value} — a raw Math.max would answer 07`);
}

// THE ROUND TRIP. percentileDigits is the inverse, and the critical-shift
// path depends on it landing on the same pair the dice would have.
{
  const bad = [];
  for (let v = 1; v <= 100; v += 1) {
    const d = percentileDigits(v);
    if (percentileValue(d.tens, d.unit) !== v) bad.push(v);
    if (d.tens < 0 || d.tens > 9 || d.unit < 0 || d.unit > 9) bad.push(`${v}:digit`);
  }
  ok("G8 every value 1-100 takes apart into the digits that make it",
    bad.length === 0, bad.join());
}
// THE ONE THAT WAS WRONG. `Math.floor(100 / 10)` is 10, and a tens
// DIGIT of ten was printed on the card.
ok("G9 a forced 100 is the pair 00, not a tens die of ten",
  percentileDigits(100).tens === 0 && percentileDigits(100).unit === 0,
  `got tens ${percentileDigits(100).tens}`);
ok("G10 and its units digit sends the blow to the head, as a rolled 100 does",
  hitLocationFromUnitDie(percentileDigits(100).unit) === "headNeck");

ok("G11 the critical-shift path takes its digits from the rule",
  /percentileDigits\(forced\)/.test(attack),
  "Ambush and Sniping feed a shifted result back in as a forced value");

/* ================================================================== *
 * H. ONE OWNER FOR THE ZERO RULE
 *
 * The racial-PP hazard, in a shorter line. `value === 0 ? 100 : value`
 * is small enough to look like it needs no owner, which is exactly how
 * it acquired three unowned copies — and the moment a rule is STATED
 * OUT LOUD is the moment somebody edits one copy of it.
 * ================================================================== */

// COMMENTS BLANKED FIRST, and the first draft of this check did not do
// it — so it reported five owners, of which four were the paragraphs
// ABOVE the fix explaining that the copies were gone. §5.3 of the
// handover, in the other direction: there the helper stripped the
// comments a check needed, here the check read comments as if they were
// code. Either way the check answered a question about its own prose.
//
// AND ONLY THE FORWARD SHAPE IS SOUGHT. The first draft also looked for
// `Math.floor(x / 10)` as the inverse, which is ordinary arithmetic —
// it matched a coin conversion and an Earn Income division, neither of
// them anything to do with percentiles. A pattern that broad proves
// nothing; the inverse is pinned by G11 and H4 instead, which name the
// function rather than guessing at its shape.
function codeOnly(source) {
  const comments = [];
  try {
    acorn.parse(source, {
      ecmaVersion: "latest", sourceType: "module", allowHashBang: true,
      onComment: (block, text, start, end) => comments.push([start, end])
    });
  } catch {
    return source; // Unparseable: scan it whole rather than skip it.
  }
  const chars = [...source];
  for (const [start, end] of comments) {
    for (let i = start; i < end; i += 1) if (chars[i] !== "\n") chars[i] = " ";
  }
  return chars.join("");
}

const owners = findSourceFiles().filter(
  (file) => /===\s*0\s*\?\s*100/.test(codeOnly(fs.readFileSync(file, "utf8")))
);
ok("H1 the zero rule is written out in exactly one file",
  owners.length === 1 && /open-ended\.mjs$/.test(owners[0] ?? ""),
  owners.map((f) => rel(f)).join(", ") || "none — the rule has vanished");

const cast = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
ok("H2 the Spell Fumble and Resonance rolls read the owner",
  (cast.match(/percentileValue\(/g) ?? []).length === 2,
  `both top-open-ended percentile tables — found `
  + `${(cast.match(/percentileValue\(/g) ?? []).length}`);
ok("H3 and import it rather than restating it",
  /import \{[^}]*percentileValue[^}]*\} from "\.\.\/dice\/open-ended\.mjs"/.test(cast));
ok("H4 the injury card's forced path imports the inverse",
  /import \{[^}]*percentileDigits[^}]*\} from "\.\.\/dice\/open-ended\.mjs"/.test(attack));

/* ================================================================== */

const label = "verify-percentile-bias";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
