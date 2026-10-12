#!/usr/bin/env node
/**
 * verify-warp-repeats — a warp you can take more than once.
 *
 * NEW at 3.515.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * REPORTED BY GRAHAM, 7 September 2026, on Cure:
 *
 *   "+2 PP: stop an additional point of bleeding.
 *    +2 PP: the spell heals both HP and bleed.
 *    +2 PP: the amount of healing increases by 1d8 …
 *    The first and third option should be able to be selected multiple
 *    times (with no limit)."
 *
 * The chooser had exactly two answers — a computed cap, or a checkbox —
 * and everything without a printed ceiling fell through to the checkbox.
 * So an option with no limit could be bought exactly once.
 *
 * MEASURED ACROSS THE PACK: 702 warps, 43 offering a count box, and
 * **140 more that the aggregator would have scaled if the dialog had
 * ever let them**. Every "per additional target" in the game —
 * Banishment, Teleport, Shadow Walk, Resist Energy, Counter Perform,
 * Qualm, Levitate — was capped at one extra creature by the chooser
 * rather than by any rule in the book.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION R IS WHY THIS CANNOT DRIFT AGAIN.
 *
 * The old test was two hand-written mod keys, and those two were simply
 * the ones somebody remembered: `damageDice` and `extraTargets` are
 * scaled by the aggregator and were never named here. The new rule ASKS
 * the aggregator — take the warp once, take it twice, compare — so there
 * is no list to keep in step, because the aggregator is the list.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS RELEASE DID NOT FIX, AND WHAT THE NEXT ONE DID.
 *
 * 3.515.0 delivered Graham's THIRD option and not his first: `mods: {}`
 * multiplied by any number is still nothing, and Cure had no bleed
 * handling at all — its only effect row was `{kind: "heal"}`, so even the
 * base spell's "or stops 1 point of ongoing bleed" was unbuilt.
 *
 * 3.516.0 built it, as a channel across Cure, Self Healing and Voice Of
 * Healing (see magic/bleed-relief.mjs), and section G below broke —
 * because it asserted Cure was still unfinished. That is the section
 * working exactly as written, the same way `verify-pp2-bonuses` broke
 * when Magic Stone left its deferred list. Section G now asserts both
 * halves delivered, and names the one clause that is still open.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  WARP_UNLIMITED, aggregateWarpSelection, buildWarpChooser,
  warpMaxTimes, warpScalesWithRepeats
} from "../module/magic/spell-warp.mjs";

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

const warp = (mods, text = "an option", ppCost = 2) => ({ ppCost, text, mods });

/* ================================================================== *
 * R. THE RULE
 * ================================================================== */

// R1 THE KEYS THE AGGREGATOR MULTIPLIES. Not asserted from a list typed
// here — each one is run through the real aggregator by the real rule.
for (const [key, value] of [
  ["damageDice", "1d6"], ["extraTargets", 1], ["bonusValue", 1], ["persistent", 1],
  ["traitPicks", 1], ["weaponDamageBonus", 2], ["morphForms", 1], ["saveDC", 2],
  ["extraConditionals", 1], ["extraTraditions", 1]
]) {
  ok(`R1:${key} makes a warp repeatable`, warpScalesWithRepeats(warp({ [key]: value })),
    "the aggregator multiplies it by `times`, so a second purchase buys more");
  equal(`R1b:${key} has no ceiling of its own`, warpMaxTimes(warp({ [key]: value })), WARP_UNLIMITED);
}

// R2 THE KEYS IT DELIBERATELY DOES NOT. "Taken is taken" — a flag has no
// count to multiply, and an override states a total.
for (const key of [
  "freezeMembership", "storedReleaseReaction", "storedReleaseFree",
  "absorbConditions", "reduceBleed", "terrainInAir", "allSlots"
]) {
  ok(`R2:${key} is a flag, taken once`, !warpScalesWithRepeats(warp({ [key]: true })),
    "buying it twice must not become a third state");
  equal(`R2b:${key} draws a checkbox`, warpMaxTimes(warp({ [key]: true })), 1);
}
ok("R2c an area override is not multiplied",
  !warpScalesWithRepeats(warp({ areaOverride: "15-foot cone" })),
  "\"the area becomes a 15-foot cone\" is true or it is not");
ok("R2d a weapon COUNT states a total",
  !warpScalesWithRepeats(warp({ weapons: 2 })),
  "\"you can affect two weapons\" bought twice states the same total twice");
ok("R2e a duration override is not multiplied",
  !warpScalesWithRepeats(warp({ durationText: "8 hours" })));

// R3 AN INERT WARP IS NOT REPEATABLE, which is the honest answer to half
// of Graham's report: nothing multiplied by two is still nothing.
ok("R3 A WARP THAT BUYS NOTHING CANNOT BE BOUGHT TWICE",
  !warpScalesWithRepeats(warp({})),
  "Cure's \"stop an additional point of bleeding\" ships `mods: {}`");
equal("R3b and it draws a checkbox", warpMaxTimes(warp({})), 1);
ok("R3c nor does a malformed one throw", !warpScalesWithRepeats(null));

/* ================================================================== *
 * C. A PRINTED CEILING STILL WINS
 * ================================================================== */

equal("C1 \"+1, max +4\" IS FOUR PURCHASES",
  warpMaxTimes(warp({ bonusValue: 1, bonusMax: 4 })), 4);
equal("C1b \"+5, max +20\" is four", warpMaxTimes(warp({ bonusValue: 5, bonusMax: 20 })), 4);
ok("C2 A CAP BEATS THE SCALING TEST",
  Number.isFinite(warpMaxTimes(warp({ bonusValue: 1, bonusMax: 4 }))),
  "the option scales AND has a ceiling; the ceiling is the answer");
equal("C3 an area cap is read against the spell's own area",
  warpMaxTimes(warp({ areaGrowth: 10, areaMax: 50 }), "10-foot emanation"), 4,
  "four purchases from a 10-foot emanation, three from a 20-foot one");
ok("C3b and a different area gives a different count",
  warpMaxTimes(warp({ areaGrowth: 10, areaMax: 50 }), "20-foot emanation")
    !== warpMaxTimes(warp({ areaGrowth: 10, areaMax: 50 }), "10-foot emanation"));

/* ================================================================== *
 * H. WHAT THE CHOOSER DRAWS
 * ================================================================== */

const chooserFor = (warps, area = "") =>
  buildWarpChooser({ name: "Probe", system: { warps, area } }, 2);

{
  const html = chooserFor([warp({ extraTargets: 1 }, "per additional target", 1)]);
  ok("H1 AN UNLIMITED OPTION DRAWS A NUMBER BOX", /type="number" name="warp-0"/.test(html), html.slice(0, 200));
  ok("H1b WITH NO max ATTRIBUTE", !/name="warp-0"[^>]*\smax="/.test(html),
    "a number the browser silently clamps is worse than one it accepts");
  ok("H1c and the hint explains the box", /how many <em>times<\/em>/.test(html));
}
{
  const html = chooserFor([warp({ bonusValue: 1, bonusMax: 4 }, "increase the bonus by +1")]);
  ok("H2 a capped option carries its ceiling", /name="warp-0"[^>]*\smax="4"/.test(html), html.slice(0, 220));
}
{
  const html = chooserFor([warp({}, "stop an additional point of bleeding")]);
  ok("H3 AN INERT OPTION IS STILL A CHECKBOX", /type="checkbox" name="warp-0"/.test(html));
  ok("H3b and no count hint is printed", !/how many <em>times<\/em>/.test(html),
    "the sentence is about boxes, and there are none");
}

/* ================================================================== *
 * A. AND THE AGGREGATOR HONOURS THE COUNT
 * ================================================================== */

// A1 IS THE OTHER HALF OF THE CLAIM. The chooser now hands out a count;
// this is that count arriving.
equal("A1 THREE PURCHASES OF 1d8 IS 3d8",
  aggregateWarpSelection([warp({ damageDice: "1d8" })], { "warp-0": 3 }).mods.damageDice, "3d8");
equal("A1b and three targets is three",
  aggregateWarpSelection([warp({ extraTargets: 1 })], { "warp-0": 3 }).mods.extraTargets, 3);
equal("A1c and the PP is charged three times",
  aggregateWarpSelection([warp({ extraTargets: 1 }, "t", 2)], { "warp-0": 3 }).ppSpent, 6);
ok("A1d and the card says how many",
  aggregateWarpSelection([warp({ extraTargets: 1 }, "per additional target", 1)], { "warp-0": 3 })
    .notes.join().includes("×3"));

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

const spells = [];
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, v] of db.iterator()) spells.push(v);
  } finally { await db.close().catch(() => {}); }
}

let capped = 0; let unlimited = 0; let single = 0;
const uncappedTargetWarps = [];
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    const mt = warpMaxTimes(w, String(s.system?.area ?? ""));
    if (mt === WARP_UNLIMITED) unlimited++;
    else if (mt > 1) capped++;
    else single++;
    if (/per additional target|an additional (creature|target)|additional target/i.test(String(w.text ?? ""))
      && (w.mods?.extraTargets)) {
      uncappedTargetWarps.push({ name: s.name, unlimited: mt === WARP_UNLIMITED });
    }
  }
}

equal("P1 the pack's warp count", capped + unlimited + single, 702);
/*
 * P2 HAS MOVED TWICE SINCE THIS RELEASE, and both times upward:
 *
 *   140 → 143 at 3.516.0  Cure, Self Healing and Voice Of Healing each
 *                         gained a `bleedPoints` warp — a count, so no
 *                         ceiling. Graham's own report is one of them.
 *   143 → 144 at 3.517.0  Restoration's "+2 PP: increase the amount of a
 *                         condition reduced by 1 (or 5 for soul drain)".
 *   NOTHING AT 3.521.0, and that is the point: Gentle Repose's "one more
 *                         action to cast" was briefly authored as a DELTA,
 *                         this count moved 145 → 146, and the movement is
 *                         what said the shape was wrong. It is a SET now.
 *   144 → 145 at 3.518.0  Lifekeeping's "+2 PP: lower the AP cost to cast
 *                         the spell by 1 AP (min 1)" — and the printed
 *                         "(min 1)" is the clue it was always meant to be
 *                         bought more than once, since a single purchase
 *                         off a 3 AP cast could never reach the floor.
 *                         The other four cast-time warps SET a new time
 *                         and rightly stayed checkboxes.
 *
 * Its four "instead reduce X" warps did NOT move the number, which is the
 * rule working: "instead" states which condition and states it once, so
 * they stay checkboxes. Only the amount is a quantity.
 */
equal("P2 OPTIONS WITH NO PRINTED CEILING", unlimited, 184,
  "these were all checkboxes before 3.515.0. 145 → 146 at 3.529.0: Banish\n  Fatigue's \"ignore an additional point of fatigue\", which prints no ceiling —\n  so the caster's PP is the only limit, as it has been for every uncapped warp\n  since 3.515.0. 146 → 150 at 3.531.0: three healing bumps (Soothing Ballad,\n  Make Whole, Wash Away Sin) and Swift Sonata's \"affect an additional ally\" —\n  none of the four prints a ceiling, so none of them gets one. 150 → 149 at 3.531.1:\n  Wash Away Sin was reverted — its cone is allies-only and the 1d6 it was given\n  falls on the allies it exists to heal, so the mod was doubling the wrong number.\n  149 → 150 at 3.540.0: Dead Tongue's \"add one target\". Graham ruled it is one\n  additional target PER PP, so it prints no ceiling and takes a count box — it\n  was built, reverted the same release when this very count moved, and restored\n  once the scaling was confirmed rather than assumed.\n  150 → 159 at 3.565.0: the nine CONJURE spells. Graham reported from his own\n  session that the warping option could only be applied once; all nine carried\n  `mods: {}`, so the aggregator saw no difference between one purchase and two\n  and the chooser drew a checkbox. They now carry `conjuredLevel`, and they land\n  in THIS bucket rather than the capped one because their ceiling is the CASTER'S\n  level, which this count does not have — `warpMaxTimes` is called here with no\n  caster, exactly as the magic-item workbench calls it. At the table, where the\n  level is known, each one is a capped count box. See verify-conjure-warp.\n  159 -> 161 at 3.587.0: CREATE UNDEAD and CONTROL UNDEAD, which print the same\n  sentence as those nine, 'increase the level by 1', and were left behind because\n  they are not called Conjure. One rule, eleven spells, nine wired.\n  161 -> 162 at 3.587.0: DELAY PAIN's 'ignore an additional point of a\n  condition' — the same sentence Banish Fatigue moved this count with at\n  3.529.0, and inert for the same reason, an empty mods object. It prints no\n  ceiling, so it takes a count box.\n  165 -> 170 at 3.609.0 (block 33): Vital Beacon's\n  additional die, Trade Essence's +1 PP per caster level, Turn Undead's +1\n  undead level, Time Stop's additional 1d6 actions and True Target's extra\n  creature — five warps that carried empty mods, none printing a ceiling.\n  170 -> 178 at 3.610.0 (R9): the eight walls' length options and two ring\n  radii, less the two destroyed-section damage warps that left a roll no wall makes.\n  178 -> 180 at 3.611.0 (block 34): Zealous Conviction's +1 temporary HP,\n  Devastating Might's DR -1 and Inspiration's additional die joined (empty mods\n  before), and Cloud Mind left for P2b — its \"(max 5d6)\" and \"(max 5)\" are a\n  printed ceiling `conditionMax` now carries.\n  180 -> 182 at 3.613.0 (block 35): Wash Away Sin's 'one die' is re-armed now its\n  targeting has been driven, and Unliving Vitality's fast-healing step joins Rapid\n  Repair's shape — a ceiling `healingRateMax` clamps at the cast, not a count.\n  182 -> 184 at 3.614.0 (block 35, R8): Renewal's Touch's 'reduce bleeding by an\n  additional 1' and 'reduce the fatigued condition by an additional 1' feed its\n  turn options now, and neither prints a ceiling.");
equal("P2b options with a computed ceiling", capped, 62,
  "43 → 47 at 3.523.0: the four potency-step warps, each printing its own\n  ceiling. 47 → 48 at 3.529.0: Voice Of Healing's \"ignore a further -1 injury\n  (max -5)\" — the row already ignores one point, so the printed total is four\n  purchases, which is the same arithmetic the potency ladder needed. 48 → 49 at\n  3.531.0: Luminous Flare's \"increase the area by 15-feet (max 60 feet)\", whose\n  count comes from its own printed 15-foot cone — three purchases, not four.\n  49 → 50 at 3.542.0: Shield's \"increase shield bonus & base DR by +1 (max +5)\",\n  which could not be built until the spell had a real spellShield row for the DR\n  half to land on — the bonus half alone would have been half a sentence.\n  50 -> 53 at 3.589.0: Fatigue's fatigue level (max 5), Earth Glide's burrow\n  speed (max 20) and Divine Might's Str/Con bonus (max +4). All three print\n  their ceiling and all three were checkboxes for the same reason as every\n  other entry in this list — empty mods.\n  53 -> 58 at 3.595.0: the five Shape spells' 'gain an additional natural attack\n  (max of two additional attacks)'. The ceiling is printed on all five and the\n  cap lives with the rule that enforces it, so the chooser sells two and not the\n  third the page forbids.\n  AND THE EIGHTEEN SIZE-STEP WARPS DID NOT COME HERE, though they were wired in\n  the same release: `sizeSteps` takes the dearer of two alternatives rather than\n  adding, so one purchase and two aggregate identically and the chooser draws a\n  checkbox on its own. A key that does not scale needs no ceiling.\n  58 -> 59 at 3.608.0: Sonic Bolt's 'the type of armour ignored increases by one\n  step' — light, then medium, then heavy, so two purchases and no third.\n  59 -> 62 at 3.611.0 (block 34): Waves Of Fatigue's 'fatigue by 1 (max 5)' and\n  Cloud Mind's 'Dazed by 1 (max 5)', both `conditionMax`, and Inspiration's die\n  step 'max d10' — two purchases from its printed d6.");
equal("P2c genuinely one-shot options", single, 456,
  "514 → 510 at 3.523.0 — the four potency steps, checkboxes only because their\n  mods were empty. 510 → 508 at 3.529.0 — the two suppression bumps, for the same\n  reason. Voice Of Healing's SWAP stayed here and should: \"instead ignore the\n  injured condition\" states which, and stating it twice states it once. 508 → 503\n  at 3.531.0 — the five above, checkboxes only because their mods were empty.\n  Shield Of Faith's \"increase the range to touch\" STAYED here and should: an\n  override is not multiplied, so touch bought twice is still touch. 503 → 504 at\n  3.531.1 as Wash Away Sin came back — a warp with no mod is a checkbox again,\n  which is the correct shape for one that currently does nothing.\n  504 → 503 at 3.540.0 — Dead Tongue's \"add one target\" left this bucket the\n  moment it stopped being inert. The word \"one\" made it look one-shot; the\n  ruling made it per-PP, and that is a scaling economy nobody should read off\n  a singular noun.\n  503 → 502 at 3.542.0 — Shield's DR warp left this bucket when it stopped being\n  inert. It was a checkbox only because its mods were empty, which is the shape\n  every unbuilt warp wears.\n  502 → 493 at 3.565.0 — the nine conjures, all nine leaving this bucket at once\n  for the same reason: empty mods. Nine spells sharing one wrong shape is what\n  made it findable; a single one would have looked like a deliberate checkbox.\n  493 -> 491 at 3.587.0 — Create Undead and Control Undead gaining conjuredLevel.\n  491 -> 490 at 3.587.0 — Delay Pain's suppression bump, the mirror of the\n  Banish Fatigue move at 3.529.0.\n  490 -> 487 at 3.589.0 — three warps that print their own ceiling and were\n  checkboxes only because their mods were empty: FATIGUE's 'increase the level\n  of fatigue by 1 (max 5)', EARTH GLIDE's 'increase the speed by 5 feet (max\n  20)' and DIVINE MIGHT's 'increase status bonus to Str and Con by +1 (max +4)'.\n  The last of those is the interesting one: its key has existed for months and\n  the warp was inert because the BASE SPELL had no bonus row for it to raise —\n  only a note. The key existed; the row it would act on did not.\n  484 -> 479 at 3.595.0 — the five extra-natural-attack warps, leaving for the\n  usual reason: empty mods. The eighteen size-step warps STAYED here and should,\n  which is the interesting half: they are now wired and still one-shot, because\n  'one step OR two steps' is two printed alternatives and buying the same one\n  twice buys nothing.\n  478 -> 473 at 3.609.0 — the five block 33 warps that left for P2 above, each\n  a checkbox only because its mods were empty.\n  465 -> 460 at 3.611.0 — Zealous Conviction's temp HP, Devastating Might's DR\n  step, Waves Of Fatigue's fatigue and Inspiration's die step and second die,\n  each a checkbox only because its mods were empty.\n  460 -> 458 at 3.613.0 — Wash Away Sin (re-armed, above) and Spoil The Profane's\n  'weakened by 1 (max +5)', a printed ceiling `conditionMax` carries. Talon\n  Strike's 'to 2d6' STAYED here and should: it is bought once, and says so.\n  458 -> 456 at 3.614.0 — Renewal's Touch's bleeding and fatigue steps, above. Its two\n  unlocks, Precious Metals' metals and Wild Morph's 'instead' warps STAYED here: each is\n  a thing bought once.");

// P3 THE GENERAL CLAIM, not a spot check: every warp that declares
// `extraTargets` and reads like "an additional target" may now be taken
// more than once.
ok("P3 EVERY \"ADDITIONAL TARGET\" WARP IS UNLIMITED NOW",
  uncappedTargetWarps.length > 0 && uncappedTargetWarps.every((w) => w.unlimited),
  uncappedTargetWarps.filter((w) => !w.unlimited).map((w) => w.name).join(", "));
ok("P3b and there are several of them", uncappedTargetWarps.length >= 5,
  `${uncappedTargetWarps.length} found`);

// P4 NOTHING WITH A PRINTED CEILING BECAME UNLIMITED. The one way this
// release could have made the game worse.
const brokeACap = [];
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    if (!(w.mods?.bonusMax || w.mods?.areaMax)) continue;
    if (warpMaxTimes(w, String(s.system?.area ?? "")) === WARP_UNLIMITED) brokeACap.push(s.name);
  }
}
equal("P4 NO PRINTED CEILING WAS LIFTED", brokeACap.length, 0, brokeACap.join(", "));

/* ================================================================== *
 * G. GRAHAM'S REPORT, SPELL BY SPELL
 * ================================================================== */

/*
 * THIS SECTION USED TO ASSERT THAT CURE WAS STILL UNBUILT, and 3.516.0
 * broke it by building Cure. That is the section working exactly as
 * written — the same way `verify-pp2-bonuses` failed when Magic Stone
 * left its deferred list, and Resistance before that.
 *
 * Graham reported two things on Cure. 3.515.0 delivered the third option
 * by teaching the chooser to ask the aggregator; 3.516.0 delivered the
 * first by giving Cure bleed handling at all. Both halves are asserted
 * here now, and the history is kept rather than overwritten.
 */
const cure = spells.find((s) => s?.name === "Cure");
const cureWarps = cure?.system?.warps ?? [];
equal("G1 Cure still prints three options", cureWarps.length, 3);

equal("G2 THE THIRD OPTION IS UNLIMITED (3.515.0)",
  warpMaxTimes(cureWarps[2], ""), WARP_UNLIMITED,
  "\"the amount of healing increases by 1d8\" — it always scaled, and could never be taken twice");
ok("G2b because it declares dice", Boolean(cureWarps[2]?.mods?.damageDice));

equal("G3 AND THE FIRST OPTION IS UNLIMITED TOO (3.516.0)",
  warpMaxTimes(cureWarps[0], ""), WARP_UNLIMITED,
  "\"stop an additional point of bleeding\" — this release gave it a mod, so the last one's rule could uncap it");
equal("G3b because it now buys bleed points", cureWarps[0]?.mods?.bleedPoints, 1);
equal("G3c while the second is a flag, correctly one-shot",
  warpMaxTimes(cureWarps[1], ""), 1,
  "\"heals both HP and bleed\" is a state, and buying it twice heals no third thing");
equal("G3d and that flag is live", cureWarps[1]?.mods?.bleedAndHeal, true);

// G4 IS THE HALF THAT REMAINS, so nobody reads Cure as finished: the
// "+8 for the 2-action version" clause of the third warp is still
// unbuilt, and it shares an axis with Inflict rather than with bleeding.
ok("G4 THE 2-ACTION CLAUSE OF THE THIRD WARP IS STILL UNBUILT",
  /2-action version/.test(String(cureWarps[2]?.text ?? ""))
  && !Object.keys(cureWarps[2]?.mods ?? {}).some((k) => /ap|action/i.test(k)),
  "\"the extra healing for the 2-action version increases by 8\" — Cure and Inflict share that axis, and it is its own channel");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-warp-repeats: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  \u2717 ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-warp-repeats: OK — ${checks} checks. `
  + `${unlimited} warps have no printed ceiling and may now be taken more than once.\n`);
