#!/usr/bin/env node
/**
 * verify-conjure-warp — the conjure spells' one warping option.
 *
 * NEW at 3.565.0, from Graham's report of 17 September 2026: "The sheet
 * only allows the warping option to be applied once. This warping should
 * be allowed multiple times (the same with the other conjure spells)."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE PACK IS READ RATHER THAN A FIXTURE.
 *
 * The nine `conjuredBase` values are the whole rule. They are declared in
 * `tools/data-fixes.json` rather than parsed out of the descriptions,
 * because the nine descriptions phrase the same ceiling six different
 * ways — "must be 1st level or lower", "can be no more than 1st level",
 * "must no more than level 1" — and a parser over that is a parser that
 * fails silently when a revision rewords one sentence.
 *
 * Declared data has the opposite failure: it goes stale without saying
 * so. So section P reads BOTH — the number from the pack and the number
 * out of the printed description — and refuses if they disagree. That is
 * the check that would have caught a typed 6 for a 9, and it is the one
 * that keeps working when the 3.9 revision rewords Conjure Swarm.
 */

import path from "node:path";
import fs from "node:fs";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { aggregateWarpSelection, warpMaxTimes, WARP_UNLIMITED }
  from "../module/magic/spell-warp.mjs";
import { conjuredLevelMaxTimes, conjuredCreatureLevel, conjuredCreatureNote }
  from "../module/magic/conjured-creature.mjs";

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

const warpOf = (base) => ({
  ppCost: 1,
  text: "increase the max level of the creature by 1 (to a maximum of your caster level)",
  mods: { conjuredLevel: 1, conjuredBase: base }
});

/* ================================================================== *
 * C. THE PURCHASE COUNT
 * ================================================================== */

equal("C1 A 1ST-LEVEL CONJURE AT CASTER LEVEL 20 BUYS NINETEEN STEPS",
  warpMaxTimes(warpOf(1), "", 20), 19,
  "level 1 to level 20 is nineteen +1 purchases");
equal("C1b and four at caster level 5", warpMaxTimes(warpOf(1), "", 5), 4);

equal("C2 A CASTER AT THE SPELL'S OWN CEILING STILL GETS ONE",
  warpMaxTimes(warpOf(1), "", 1), 1,
  "the floor, not a separate guard — the same shape as areaGrowthMaxTimes");
equal("C2b and so does one BELOW it",
  warpMaxTimes(warpOf(9), "", 5), 1,
  "Conjure Entity's printed 9 is above a 5th-level caster; the division goes negative");

equal("C3 AN UNKNOWN CASTER LEVEL IS NOT A CEILING OF ZERO",
  warpMaxTimes(warpOf(1), ""), WARP_UNLIMITED,
  "the magic-item workbench builds a chooser from a bare {name, system:{warps}} with no "
  + "actor; refusing the purchase there would be a rule the book does not contain");
equal("C3b and the helper says so by returning null",
  conjuredLevelMaxTimes(warpOf(1).mods, null), null);
equal("C3c a caster level of 0 is unknown too",
  conjuredLevelMaxTimes(warpOf(1).mods, 0), null);

equal("C4 A WARP WITH NO conjuredBase CANNOT BE COUNTED",
  conjuredLevelMaxTimes({ conjuredLevel: 1 }, 20), null,
  "a base that never landed must fall through to the unlimited answer, not to a "
  + "silently wrong cap");
equal("C4b and one with no conjuredLevel is not this rule at all",
  conjuredLevelMaxTimes({ conjuredBase: 1 }, 20), null);

/* ================================================================== *
 * A. THE AGGREGATOR SCALES IT
 * ================================================================== *
 *
 * This is the half that was actually broken. `warpScalesWithRepeats`
 * asks the aggregator whether a second purchase differs from a first —
 * so if the aggregator does not scale `conjuredLevel`, the chooser goes
 * back to a checkbox however right the arithmetic above is.
 */

{
  const w = [warpOf(1)];
  const once = aggregateWarpSelection(w, { "warp-0": 1 });
  const thrice = aggregateWarpSelection(w, { "warp-0": 3 });
  equal("A1 ONE PURCHASE IS ONE LEVEL", once.mods.conjuredLevel, 1);
  equal("A2 THREE PURCHASES ARE THREE", thrice.mods.conjuredLevel, 3,
    "the property warpScalesWithRepeats measures — without it the chooser is a checkbox");
  equal("A2b and cost three PP", thrice.ppSpent, 3);
  equal("A3 THE BASE IS NOT MULTIPLIED", thrice.mods.conjuredBase, 1,
    "a base is the spell's number, not a purchase — the same rule as areaMax");
  equal("A4 AN UNBOUGHT WARP ADDS NOTHING",
    aggregateWarpSelection(w, {}).mods.conjuredLevel, 0);
}

/* ================================================================== *
 * L. THE RESULTING CREATURE LEVEL
 * ================================================================== */

{
  const mods = aggregateWarpSelection([warpOf(1)], { "warp-0": 3 }).mods;
  const high = conjuredCreatureLevel(mods, 20);
  equal("L1 THREE STEPS OFF A PRINTED 1 IS A 4TH-LEVEL CREATURE", high.level, 4);
  equal("L1b and is not reported as clamped", high.clamped, false);

  const low = conjuredCreatureLevel(mods, 3);
  equal("L2 THE CASTER LEVEL IS AN ABSOLUTE CEILING", low.level, 3);
  equal("L2b and the clamp is reported", low.clamped, true,
    "the PP was spent before the ceiling was read, so a caster who over-bought has "
    + "paid for steps they cannot use and must be told");

  equal("L3 AN UNKNOWN CASTER LEVEL LOWERS NOTHING",
    conjuredCreatureLevel(mods, null).level, 4,
    "an item cast reads the item's own level and a workbench preview has none; neither "
    + "is a reason to report a creature weaker than the PP spent on it");

  equal("L4 A SPELL THAT CONJURES NOTHING HAS NO LEVEL",
    conjuredCreatureLevel({ damageDice: "2d6" }, 20), null);
}

/* ================================================================== *
 * N. THE CARD LINE
 * ================================================================== */

{
  const mods = aggregateWarpSelection([warpOf(1)], { "warp-0": 3 }).mods;
  ok("N1 THE NOTE NAMES THE RESULTING LEVEL",
    /level 4/.test(conjuredCreatureNote(mods, 20)),
    conjuredCreatureNote(mods, 20));
  ok("N2 AND SAYS SO WHEN IT CLAMPS",
    /capped at your caster level 3/.test(conjuredCreatureNote(mods, 3)),
    conjuredCreatureNote(mods, 3));
  equal("N3 AN UNWARPED CONJURE PRINTS NO LINE",
    conjuredCreatureNote(aggregateWarpSelection([warpOf(1)], {}).mods, 20), "",
    "a caster who bought nothing has nothing to be told");
  equal("N4 AND NEITHER DOES A SPELL THAT IS NOT A CONJURE",
    conjuredCreatureNote({ damageDice: "2d6" }, 20), "");
}

/* ================================================================== *
 * P. THE PACK, AGAINST THE PRINTED DESCRIPTIONS
 * ================================================================== *
 *
 * Six phrasings, read with one pattern each rather than one clever
 * pattern for all six — a regex broad enough to catch all of them is
 * broad enough to catch a sentence that is not the ceiling.
 */

const LEVEL_PHRASES = [
  /must be (\d+)(?:st|nd|rd|th) level or lower/i,
  /must be of (\d+)(?:st|nd|rd|th) level or lower/i,
  /can be no more than (\d+)(?:st|nd|rd|th) level/i,
  /must be no more than level (\d+)/i,
  /must no more than level (\d+)/i
];

function printedCeiling(description) {
  for (const rx of LEVEL_PHRASES) {
    const m = rx.exec(String(description ?? ""));
    if (m) return Number(m[1]);
  }
  return null;
}

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const conjures = [];
for await (const [, v] of db.iterator()) {
  if (/^conjure\b/i.test(String(v?.name ?? ""))) conjures.push(v);
}
await db.close();

equal("P1 THE PACK CARRIES NINE CONJURE SPELLS", conjures.length, 9);

for (const spell of conjures) {
  const warps = Array.isArray(spell.system?.warps) ? spell.system.warps : [];
  equal(`P2 ${spell.name} sells exactly one warp`, warps.length, 1);
  const mods = warps[0]?.mods ?? {};
  equal(`P3 ${spell.name} buys a level per purchase`, Number(mods.conjuredLevel), 1);

  const printed = printedCeiling(spell.system?.description);
  ok(`P4 ${spell.name}'s description states a ceiling`, printed !== null,
    "none of the five known phrasings matched — if a revision reworded it, add the "
    + "phrasing here rather than deleting this check");
  equal(`P4b ${spell.name}'s declared base matches the printed one`,
    Number(mods.conjuredBase), printed,
    "the declared number is the whole rule; this is what catches a typed 6 for a 9");

  const warp = { ppCost: warps[0].ppCost, mods };
  ok(`P5 ${spell.name} is a count box at caster level 20`,
    warpMaxTimes(warp, String(spell.system?.area ?? ""), 20) > 1,
    "this is Graham's report: a max of 1 draws a checkbox and the option can be "
    + "bought exactly once");
}

/* ================================================================== *
 * W. THE WIRING
 * ================================================================== *
 *
 * The arithmetic above is all reachable from a fixture. None of it does
 * anything unless the chooser is told the caster's level and the card
 * asks for the note, so both call sites are counted rather than trusted.
 */

const warpSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs"), "utf8");
const castSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");

equal("W1 THE CHOOSER PASSES THE CASTER LEVEL THROUGH TO THE COUNT",
  [...warpSrc.matchAll(/warpMaxTimes\(w, areaText, casterLevel\)/g)].length, 1,
  "without the third argument every conjure falls through to UNLIMITED and the "
  + "printed ceiling is enforced by nobody");
equal("W2 AND THE COUNT ASKS THE RULE",
  [...warpSrc.matchAll(/conjuredLevelMaxTimes\(m, casterLevel\)/g)].length, 1);

equal("W3 BOTH CAST-TIME CHOOSERS KNOW THE CASTER LEVEL",
  [...castSrc.matchAll(/buildWarpChooser\((?:spell|warpSpell), basePP, \{[^}]*casterLevel[^}]*\}\)/g)].length, 2,
  "the pre-cast chooser and Warp Manipulation's — the second is the one that would "
  + "have been missed");
equal("W4 THE CARD ASKS FOR THE NOTE",
  [...castSrc.matchAll(/conjuredCreatureNote\(warpMods, casterLevel\)/g)].length, 1);

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-conjure-warp: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-conjure-warp: OK — ${checks} checks. `
  + "Nine conjures buy their level a step at a time, capped at the caster's own.\n");
