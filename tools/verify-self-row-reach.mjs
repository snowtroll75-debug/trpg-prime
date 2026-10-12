#!/usr/bin/env node
/**
 * verify-self-row-reach — what a `self` row does once its spell has been
 * given somewhere to reach.
 *
 * NEW at 3.534.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CHANNEL 3.532.0 OPENED.
 *
 * A row targeting `self` went to the caster and nowhere else, which was
 * right for as long as a spell with no range and no area WAS the caster.
 * Once that silence became an explicit rule, six warps in the pack read
 * as buying something the applier had no way to deliver: they grant a
 * range or an area to a spell whose only row says `self`, so the option
 * was offered, the PP was charged, and the effect stayed where it was.
 *
 * These are the four spells 3.530.0 EXCLUDED for exactly this reason —
 * "an effect row targeting `self` would produce a circle that grants
 * nothing to anyone inside it" — plus the two the target-redirect survey
 * wrote off as a dead end. The reason they were excluded has been fixed
 * rather than worked around, which is why they arrive together.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO MODS, BECAUSE THE PACK SAYS TWO THINGS.
 *
 * Graham ruled on 8 September 2026 that these follow the wording of each
 * warp rather than share one flag. Reading them shows why:
 *
 *   MOVE   Jump               "the target CHANGES to one touched creature"
 *          Loremasters Edge   "TARGET AN ALLY within 30 feet"
 *
 *   SHARE  Hunter's Veil      "affects ALL ALLIES within 30 feet"
 *          Prescience         "YOU affect all allies in a 20-foot radius"
 *          Confounded Imagery "affecting ALL TARGETS within"
 *          Concealing Terrain "a 15-foot radius centred on YOU"
 *
 * One flag would have to pick a side and be wrong four times or twice.
 * Two of the SHARE warps name the caster outright.
 *
 * SECTION G IS THE RATCHET, and it is the general form of the defect
 * rather than six pins: a warp that grants reach to a spell whose rows
 * are all `self` must say which of the two it does, or it is buying
 * something nothing delivers.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { selfRowRecipients } from "../module/magic/spell-degrees.mjs";
import { emptyWarp, aggregateWarpSelection, warpMaxTimes } from "../module/magic/spell-warp.mjs";
import { warpedAreaText, warpedAreaTargeting } from "../module/magic/warp-area.mjs";
import { warpedRange, effectiveRangeText, spellRangeFeet } from "../module/magic/spell-range.mjs";

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

const CASTER = { id: "caster" };
const A = { id: "a" };
const B = { id: "b" };
const names = (r) => (r ?? []).map((x) => x.id).join(",");

/* ================================================================== *
 * R. THE RULE
 * ================================================================== */

equal("R1 AN UNWARPED SELF ROW IS STILL THE CASTER ALONE",
  names(selfRowRecipients(CASTER, [A, B], {})), "caster",
  "every spell that worked before this release must be unchanged by it");
equal("R1b even with nobody else reached",
  names(selfRowRecipients(CASTER, [], {})), "caster");

equal("R2 A RETARGET MOVES IT OFF THE CASTER",
  names(selfRowRecipients(CASTER, [A, B], { retargetSelfRows: true })), "a,b",
  "Jump — \"the target CHANGES to one touched creature\"");
equal("R2b AND LEAVES NOBODY HOLDING IT WHEN NOTHING WAS REACHED",
  names(selfRowRecipients(CASTER, [], { retargetSelfRows: true })), "",
  "falling back to the caster here would hand somebody a buff they spent PP to give away");

equal("R3 A SHARE KEEPS THE CASTER AND ADDS THE REST",
  names(selfRowRecipients(CASTER, [A, B], { shareSelfRows: true })), "caster,a,b",
  "Prescience — \"YOU affect all allies in a 20-foot radius\"");
equal("R3b AND COUNTS THE CASTER ONCE",
  names(selfRowRecipients(CASTER, [CASTER, A], { shareSelfRows: true })), "caster,a",
  "an area with no range centres on the caster, so they are usually already in the list");
equal("R3c a share that reached nobody is still the caster",
  names(selfRowRecipients(CASTER, [], { shareSelfRows: true })), "caster");

equal("R4 RETARGET WINS IF BOTH ARE SOMEHOW SET",
  names(selfRowRecipients(CASTER, [A], { retargetSelfRows: true, shareSelfRows: true })), "a",
  "no warp in the pack sets both; pinned so a future fix that did would be readable "
  + "rather than a surprise");
equal("R5 AND A MISSING CASTER IS NOT AN EMPTY SEAT",
  names(selfRowRecipients(null, [A], { shareSelfRows: true })), "a");

/* ================================================================== *
 * A. THE VOCABULARY
 * ================================================================== */

const jumpWarp = { ppCost: 1, text: "the range becomes touch and the target changes to one touched creature",
  mods: { rangeOverride: "touch", retargetSelfRows: true } };
const once = aggregateWarpSelection([jumpWarp], { "warp-0": 1 }).mods;
const twice = aggregateWarpSelection([jumpWarp], { "warp-0": 2 }).mods;
ok("A1 retargetSelfRows IS CARRIED BY THE AGGREGATOR", once.retargetSelfRows === true,
  `${JSON.stringify(once.retargetSelfRows)} — a mod absent from emptyWarpMods() is offered, `
  + "charged, and silently dropped");
equal("A1b AND TAKEN IS TAKEN — buying it twice says it once",
  JSON.stringify(once.retargetSelfRows), JSON.stringify(twice.retargetSelfRows));
equal("A1c so the chooser draws it as a checkbox", warpMaxTimes(jumpWarp, ""), 1);

const veilWarp = { ppCost: 4, text: "affects all allies within 30 feet",
  mods: { areaOverride: "30-foot radius", areaTargetingOverride: "allies", shareSelfRows: true } };
ok("A2 shareSelfRows TOO",
  aggregateWarpSelection([veilWarp], { "warp-0": 1 }).mods.shareSelfRows === true);
ok("A3 AND AN UNWARPED SELECTION CARRIES NEITHER",
  emptyWarp().mods.retargetSelfRows === false && emptyWarp().mods.shareSelfRows === false);

/* ================================================================== *
 * D. THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) if (v?.name) spells.push(v);
await db.close();

const spell = (n) => spells.find((s) => s.name === n);
const rowsOf = (s) => (s?.system?.effects ?? []).filter((e) => e?.kind !== "note");

/* ── D1: the two that MOVE ───────────────────────────────────────── */

for (const [name, wi, range] of [["Jump", 1, "touch"], ["Loremasters Edge", 0, "30 feet"]]) {
  const s = spell(name);
  const w = s?.system?.warps?.[wi];
  ok(`D1 ${name} MOVES ITS SELF ROW`, w?.mods?.retargetSelfRows === true,
    `${JSON.stringify(w?.mods)} — its warp names a different creature INSTEAD of the caster`);
  equal(`D1b ${name} ALSO GAINS THE REACH ITS WARP NAMES`, w?.mods?.rangeOverride, range,
    "without it the 3.532.0 gate refuses the very creature the warp names");
  equal(`D1c ${name} STILL PRINTS NO RANGE OF ITS OWN`,
    String(s?.system?.range ?? "").trim(), "",
    "which is what makes it self-only until the warp is bought");
  ok(`D1d ${name}'s ROWS ARE ALL \`self\`, which is why it needed this at all`,
    rowsOf(s).length > 0 && rowsOf(s).every((e) => e.target === "self"),
    JSON.stringify(rowsOf(s).map((e) => `${e.kind}:${e.target}`)));
  ok(`D1e AND THE WARP DOES NOT ALSO SHARE`, !w?.mods?.shareSelfRows);
}

/* ── D2: the four that SHARE ─────────────────────────────────────── */

for (const [name, wi, area, side] of [
  ["Confounded Imagery", 0, "20-foot radius", null],
  ["Hunter’s Veil", 0, "30-foot radius", "allies"],
  ["Prescience", 1, "20-foot radius", "allies"],
  ["Concealing Terrain", 0, "15-foot radius", null]
]) {
  const s = spell(name);
  const w = s?.system?.warps?.[wi];
  ok(`D2 ${name} SHARES ITS SELF ROW`, w?.mods?.shareSelfRows === true,
    `${JSON.stringify(w?.mods)} — its warp says the effect reaches MORE people, not different ones`);
  equal(`D2b ${name} DRAWS THE CIRCLE ITS WARP NAMES`, w?.mods?.areaOverride, area);
  equal(`D2c AND THAT CIRCLE CENTRES ON THE CASTER, because the spell prints no range`,
    String(s?.system?.range ?? "").trim(), "",
    "placeSpellTemplate drops a no-range circle on the caster, which is what "
    + "\"centred on you\" means — so no emanation wording is needed");
  ok(`D2d ${name}'s ROWS ARE ALL \`self\``,
    rowsOf(s).length > 0 && rowsOf(s).every((e) => e.target === "self"),
    JSON.stringify(rowsOf(s).map((e) => `${e.kind}:${e.target}`)));
  ok(`D2e AND THE WARP DOES NOT ALSO RETARGET`, !w?.mods?.retargetSelfRows);

  if (side) {
    equal(`D2f ${name} NARROWS ITS CIRCLE TO ALLIES, because it says allies`,
      warpedAreaTargeting(s?.system?.areaTargeting, w?.mods ?? {}), side,
      "the spell itself is `all`; without this it would hand its effect to every enemy "
      + "standing in the circle — the defect Aid was saved from at 3.530.0");
  } else {
    equal(`D2f ${name} CATCHES EVERYONE, because its warp names no side`,
      warpedAreaTargeting(s?.system?.areaTargeting, w?.mods ?? {}), "all");
  }
}

/* ── D3: the reach actually arrives ──────────────────────────────── */

{
  const s = spell("Jump");
  const mods = aggregateWarpSelection([s.system.warps[1]], { "warp-0": 1 }).mods;
  equal("D3 JUMP REACHES TOUCH ONCE BOUGHT",
    spellRangeFeet(effectiveRangeText(warpedRange(s.system.range, mods),
      warpedAreaText(s.system.area, mods)), 5), 5);
  equal("D3b AND IS THE CASTER ALONE UNTIL THEN",
    spellRangeFeet(effectiveRangeText(warpedRange(s.system.range, {}),
      warpedAreaText(s.system.area, {})), 5), 0);
}
{
  const s = spell("Hunter’s Veil");
  const mods = aggregateWarpSelection([s.system.warps[0]], { "warp-0": 1 }).mods;
  equal("D3c HUNTER'S VEIL DRAWS ITS THIRTY FEET",
    warpedAreaText(s.system.area, mods), "30-foot radius");
  equal("D3d and an area lifts the self-only gate as surely as a range does",
    effectiveRangeText(warpedRange(s.system.range, mods), warpedAreaText(s.system.area, mods)), "",
    "which is why these four needed no rangeOverride");
}

/* ================================================================== *
 * G. THE RATCHET
 * ================================================================== *
 *
 * The six above are pins. This is the general form: a warp that grants
 * REACH to a spell whose rows are all `self` must say which of the two
 * things it does, or the reach is real and nothing travels along it.
 *
 * Derived from the mods rather than a list of spell names, so a warp
 * authored next year is covered without anybody remembering this file.
 */

const LIFTS = ["rangeOverride", "areaOverride", "areaGrowth"];
const SAYS = ["retargetSelfRows", "shareSelfRows"];

const selfOnlySpells = spells.filter((s) => {
  const rows = rowsOf(s);
  return rows.length > 0 && rows.every((e) => e.target === "self");
});

/* THE PREDICATE IS A FUNCTION so the fixtures below run the SAME code the
 * pack scan does. A fixture beside a re-implementation proves nothing. */
const grantsReach = (m) => LIFTS.some((k) => m?.[k]);
const saysWhat = (m) => SAYS.some((k) => m?.[k]);

const liftWarps = [];
const mute = [];
for (const s of selfOnlySpells) {
  for (const [i, w] of (s.system?.warps ?? []).entries()) {
    const m = w?.mods ?? {};
    if (!grantsReach(m)) continue;
    liftWarps.push(`${s.name} w${i}`);
    if (saysWhat(m)) continue;
    mute.push(`${s.name} w${i}: ${JSON.stringify(m)}`);
  }
}

/* THE POSITIVE CONTROL FIRST. "No violations" is also what an empty
 * search returns — a lesson this harness learned at 3.533.0, when two
 * mutations survived a ratchet that had no such control. */
ok("G1 THE RATCHET SEES REACH-GRANTING WARPS ON SELF-ONLY SPELLS",
  liftWarps.length >= 6,
  `${JSON.stringify(liftWarps)} — fewer than the six this release authored means LIFTS `
  + "names something wrong, and the clean result below would be an empty search");

ok("G2 AND EVERY ONE OF THEM SAYS WHAT ITS SELF ROW DOES",
  mute.length === 0,
  `${JSON.stringify(mute)} — a warp that grants reach to a spell whose only rows target `
  + "`self` must carry retargetSelfRows or shareSelfRows. Without one the option is "
  + "offered, the PP is charged, and the effect stays on the caster — which is exactly "
  + "what these six did for the whole life of the pack");

/* ── G3: FIXTURES, because a clean pack cannot prove a ratchet works ──
 *
 * G2 above passes when nothing violates it — and so would a predicate
 * that had quietly stopped distinguishing anything. That exact mutation
 * SURVIVED when this runner was first written, for the same reason two
 * survived the 3.533.0 reach ratchet: a weaker check still passes on a
 * healthy pack.
 *
 * So these run the predicate over warps that do not exist in the pack,
 * where the right answer is known by construction. */

ok("G3 A REACH-GRANTING WARP THAT SAYS NOTHING IS CAUGHT",
  grantsReach({ areaOverride: "20-foot radius" }) && !saysWhat({ areaOverride: "20-foot radius" }),
  "the defect itself: an area bought, and no word on what the self row does with it");
ok("G3b ONE THAT MOVES ITS ROW IS NOT",
  saysWhat({ rangeOverride: "touch", retargetSelfRows: true }));
ok("G3c NOR IS ONE THAT SHARES IT",
  saysWhat({ areaOverride: "30-foot radius", shareSelfRows: true }));
ok("G3d AND GRANTING REACH IS NOT ITSELF AN ANSWER",
  !saysWhat({ areaOverride: "20-foot radius", rangeOverride: "touch" }),
  "if the two lists ever overlap, every reach-granting warp satisfies the ratchet by "
  + "granting reach — which is the thing it exists to say is not enough");
ok("G3e a warp that grants nothing is not the ratchet's business",
  !grantsReach({ bonusValue: 5 }));

/* ================================================================== *
 * W. THE WIRING
 * ================================================================== */

const effectsSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");

equal("W1 THE APPLIER ASKS THE RULE",
  [...effectsSrc.matchAll(/selfRowRecipients\(caster, targets, warpMods\)/g)].length, 1);
equal("W1b AND NO LONGER HANDS A SELF ROW STRAIGHT TO THE CASTER",
  [...effectsSrc.matchAll(/effect\.target === "self"\s*\n\s*\?\s*\[caster\]/g)].length, 0,
  "the old expression left in place would be a second, drifting copy of the decision");
ok("W2 THE RULE IS IMPORTED RATHER THAN REDECLARED",
  /import \{[\s\S]*?selfRowRecipients[\s\S]*?\} from "\.\/spell-degrees\.mjs"/.test(effectsSrc));

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-self-row-reach: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-self-row-reach: OK — ${checks} checks. `
  + "Two warps move a self row and four share it, each following its own wording.\n");
