#!/usr/bin/env node
/**
 * verify-spell-range — how far a spell reaches, and who is inside that.
 *
 * NEW at 3.519.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A TOUCH SPELL LANDED ON A CREATURE ACROSS THE ROOM.
 *
 * Measured before building: every spell in the pack carries a printed
 * `range`, and the only things that ever read it were a Cure feat's
 * ranged/melee split, area template placement, and Reach Spell's
 * eligibility test. NOTHING compared a distance to it. 141 spells print
 * "touch" and not one of them checked whether you could reach.
 *
 * A WEAPON HAS REFUSED THIS ALL ALONG — "Toben is 40 ft away — beyond
 * Longsword's reach (max 10 ft)" — so this release is one rule reaching
 * the other half of the game rather than a new rule. Graham's ruling,
 * 7 September 2026: enforce it, and refuse.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION U IS THE HALF THAT MATTERS MOST, and it is the one a careless
 * gate gets wrong: 217 spells print NO range at all, and a handful print
 * "self", "varies", "see text", "planetary" or "unlimited". Every one of
 * those must stay UNGATED. A range nothing can read is not a range of
 * zero, and a gate that guessed would refuse casts the book permits —
 * which is a worse defect than the one being fixed, because it stops
 * play rather than permitting too much.
 *
 * SECTION W is the 25-warp channel this unlocks, of which ten are built.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  DEFAULT_REACH, outOfRangeLine, outOfSpellRange, rangeLabel,
  effectiveRangeText, spellRangeFeet, targetsOutOfRange, touchReach, warpedRange
} from "../module/magic/spell-range.mjs";
import { parseRangeFeet } from "../module/magic/spell-template.mjs";
import { aggregateWarpSelection, emptyWarp, warpMaxTimes } from "../module/magic/spell-warp.mjs";

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

/* ================================================================== *
 * R. READING A RANGE
 * ================================================================== */

equal("R1 plain feet", spellRangeFeet("30 feet"), 30);
equal("R2 and a longer one", spellRangeFeet("120 feet"), 120);
equal("R3 MILES BECOME FEET", spellRangeFeet("10 miles"), 52800,
  "Whispering Wind prints miles and nothing had ever asked it for a number");
equal("R4 A HYPHEN DOES NOT DEFEAT IT", spellRangeFeet("30-feet"), 30,
  "exactly one spell in the pack is written this way, and it would otherwise be silently ungated");
equal("R4b which `parseRangeFeet` alone cannot do", parseRangeFeet("30-feet"), null,
  "the normalising is this file's job, and this pins WHY it exists");
equal("R5 case is not significant", spellRangeFeet("Touch"), DEFAULT_REACH);
equal("R6 nor is surrounding space", spellRangeFeet("  60 feet  "), 60);

/* ================================================================== *
 * T. TOUCH IS THE CASTER'S OWN REACH
 * ================================================================== */

equal("T1 a sheet that says nothing touches at five feet", touchReach({}), 5);
equal("T2 AND A LONG-REACHED CREATURE TOUCHES AT ITS REACH",
  touchReach({ combat: { reach: 10 } }), 10,
  "the same field `meleeReach` reads, so a caster punches and touches at one distance");
equal("T3 a zero reach still touches at five", touchReach({ combat: { reach: 0 } }), 5);
equal("T4 and touch reads that reach back", spellRangeFeet("touch", 10), 10);
equal("T5 with the default when none is given", spellRangeFeet("touch"), 5);

/* ================================================================== *
 * U. WHAT MUST NEVER BE GATED — AND THE TWO WORDS THAT LEFT (3.532.0)
 * ================================================================== *
 *
 * "self" and "personal" USED TO BE ON THIS LIST, and that was the defect
 * live testing found: they answered null, null means "no limit to
 * enforce", and a spell saying it affects only the caster reached anyone
 * on the board. They are a range of ZERO, which is a limit, and section
 * S below is that rule.
 *
 * The rest of the list is unchanged and the reasoning behind it is
 * untouched: a value nothing can READ is not a value of zero, and
 * guessing one would refuse a cast the book permits.
 */

for (const [i, v] of ["", "  ", "varies", "see text",
  "planetary", "unlimited", "special"].entries()) {
  equal(`U1.${i} "${v}" names no limit`, spellRangeFeet(v), null);
}
equal("U2 NOR DOES A LABEL NOTHING CAN READ", spellRangeFeet("as far as you can shout"), null,
  "guessing a number here would refuse a cast the book permits — worse than permitting too much");
ok("U3 AND NONE OF THEM REFUSES ANYONE, AT ANY DISTANCE",
  ["", "unlimited", "planetary", "as far as you can shout"]
    .every((v) => outOfSpellRange(9999, spellRangeFeet(v)) === false),
  "`9999 > null` is TRUE in JavaScript — without the guard, every ungated spell refuses every target");

/* ================================================================== *
 * S. SILENCE IS A STATEMENT (3.532.0)
 * ================================================================== *
 *
 * GRAHAM, 8 SEPTEMBER 2026: "Spells that have no range or area affect
 * the caster. So if a warping option increases that to a range (such as
 * touch) then it gains that range with the warping option."
 *
 * Live testing is what sent this question up: Shield Of Faith prints no
 * range and no area, and it landed on an ally seven feet away — then its
 * own warp reading "increase the range to touch" changed nothing, because
 * an override onto an unenforced range is still unenforced.
 */

equal("S1 SELF IS A RANGE OF ZERO, NOT AN ABSENT ONE", spellRangeFeet("self"), 0);
equal("S1b and so is personal", spellRangeFeet("personal"), 0);
equal("S1c whatever its capitals", spellRangeFeet("  SELF "), 0);

ok("S2 SO THE CASTER IS IN RANGE OF THEMSELVES",
  outOfSpellRange(0, spellRangeFeet("self")) === false);
ok("S2b AND NOBODY ELSE IS, at any distance at all",
  [1, 5, 7, 30, 9999].every((d) => outOfSpellRange(d, spellRangeFeet("self")) === true),
  "this is the whole behaviour change — an ally seven feet away used to be reachable");

equal("S3 NO RANGE AND NO AREA READS AS SELF", effectiveRangeText("", ""), "self");
equal("S3b A BLANK RANGE BESIDE AN AREA IS THE AREA SPEAKING",
  effectiveRangeText("", "15-foot cone"), "",
  "68 spells are this shape — an emanation reaches what its template covers, and its "
  + "silence about range is not a claim about the caster");
equal("S3c A PRINTED RANGE IS NEVER OVERRIDDEN", effectiveRangeText("30 feet", ""), "30 feet");
equal("S3d NOR IS AN UNREADABLE ONE — that is the case the old rule was right about",
  effectiveRangeText("planetary", ""), "planetary");
equal("S3e and a warp that grants a range lifts the restriction",
  spellRangeFeet(effectiveRangeText(warpedRange("", { rangeOverride: "touch" }), ""), 5), 5,
  "Shield Of Faith — the warp is what makes this rule visible rather than merely strict");



/* ================================================================== *
 * X. THE WIRING
 * ================================================================== *
 *
 * A rule nobody calls is a rule that does nothing, and this file has
 * eleven deleted dead guards to show for guessing about that. It counts
 * the RAW expression rather than searching for the rule's name, because
 * a search for a name is the shape that has lied in this harness nine
 * times.
 */

const workflowSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");

equal("X1 THE GATE ASKS THE RULE, WITH BOTH HALVES",
  [...workflowSrc.matchAll(/effectiveRangeText\(\s*\n?\s*warpedRange\(effRange, warpMods\),\s*\n?\s*warpedAreaText\(effArea, warpMods\)\s*\n?\s*\)/g)].length, 1,
  "the warped range AND the warped area — a warp that grants either one has to be "
  + "able to lift the restriction it would otherwise be gated by");
equal("X1b AND NOTHING GATES ON THE BARE WARPED RANGE ANY MORE",
  [...workflowSrc.matchAll(/castRange = warpedRange\(/g)].length, 0,
  "the old expression left in place is the version that reached an ally seven feet away");
ok("X2 THE RULE IS IMPORTED RATHER THAN REDECLARED",
  /import \{[^}]*effectiveRangeText[^}]*\} from "\.\/spell-range\.mjs"/s.test(workflowSrc));

/* ================================================================== *
 * G. THE GATE
 * ================================================================== */

ok("G1 inside is fine", outOfSpellRange(30, 30) === false, "exactly at the limit is in range");
ok("G2 AND A FOOT BEYOND IS NOT", outOfSpellRange(31, 30) === true);
ok("G3 adjacent is within touch", outOfSpellRange(5, 5) === false);
ok("G4 across the room is not", outOfSpellRange(40, 5) === true);
ok("G5 A CAST WITH NOTHING TO MEASURE IS NEVER REFUSED",
  [null, undefined, NaN].every((d) => outOfSpellRange(d, 30) === false),
  "no token, no canvas — the comparison itself gives this answer, which is why no guard sits in front of it");

/* ================================================================== *
 * M. EVERY TARGET THAT IS TOO FAR, NOT THE FIRST
 * ================================================================== */

const group = [
  { name: "Toben", distance: 10 },
  { name: "Lysa", distance: 45 },
  { name: "Oren", distance: 30 },
  { name: "Edda", distance: 120 }
];
equal("M1 THE WHOLE LIST IS NAMED",
  JSON.stringify(targetsOutOfRange(group, "30 feet").map((t) => t.name)),
  JSON.stringify(["Lysa", "Edda"]),
  "a cleric who caught four allies and walked one out of range should be told WHICH one");
equal("M1b carrying each distance",
  JSON.stringify(targetsOutOfRange(group, "30 feet").map((t) => t.distance)),
  JSON.stringify([45, 120]));
equal("M2 nobody is too far for an ungated spell",
  targetsOutOfRange(group, "").length, 0);
equal("M3 EVERYONE BUT THE ADJACENT ONE IS TOO FAR FOR TOUCH",
  targetsOutOfRange(group, "touch", 10).length, 3);
equal("M3b and the long-reached caster keeps the nearest",
  JSON.stringify(targetsOutOfRange(group, "touch", 10).map((t) => t.name)),
  JSON.stringify(["Lysa", "Oren", "Edda"]));
equal("M4 an empty list refuses nobody", targetsOutOfRange([], "touch").length, 0);
equal("M4b and so does a missing one", targetsOutOfRange(null, "touch").length, 0);

/* ================================================================== *
 * L. THE REFUSAL SAYS THE THREE FACTS
 * ================================================================== */

const line = outOfRangeLine("Cure", "Toben", 40, "touch", 5);
ok("L1 it names the creature", /Toben/.test(line), line);
ok("L2 the distance", /40 ft/.test(line), line);
ok("L3 AND THE LIMIT, ONCE", /\(5 ft\)/.test(line) && !/max/.test(line),
  `3.519.1: the suffix "(max 5 ft)" repeated what the label already said — got: ${line}`);
ok("L4 and the spell", /Cure/.test(line), line);
ok("L4b A NUMERIC RANGE IS NOT SAID TWICE EITHER",
  outOfRangeLine("Blindness", "Grokash", 40, "30 feet") === (
    "<strong>Grokash</strong> is 40 ft away — beyond <strong>Blindness</strong>'s range of 30 feet."),
  `live testing read "range of 30 feet (max 30 ft)" — got: ${outOfRangeLine("Blindness", "Grokash", 40, "30 feet")}`);
ok("L5 TOUCH SAYS HOW FAR TOUCH REACHED",
  /touch \(5 ft\)/.test(line),
  `"beyond touch" is an argument; "beyond touch (5 ft)" is answerable — got: ${line}`);
ok("L5b and a long-reached caster's says ten",
  /touch \(10 ft\)/.test(outOfRangeLine("Cure", "Toben", 40, "touch", 10)));
equal("L6 an ungated spell produces no refusal line",
  outOfRangeLine("Prayer", "Toben", 999, ""), null,
  "a line for a refusal that cannot happen is unreachable text");
equal("L7 nor does a nameless spell", outOfRangeLine("", "Toben", 40, "touch"), null);
equal("L8 nor a nameless target", outOfRangeLine("Cure", "", 40, "touch"), null);
equal("L9 nor an unmeasured distance", outOfRangeLine("Cure", "Toben", null, "touch"), null);
equal("R7 a plain range prints as written", rangeLabel("30 feet"), "30 feet");
equal("R8 and nothing prints nothing", rangeLabel(""), "");

/* ================================================================== *
 * W. THE WARP KEY
 * ================================================================== */

equal("W1 rangeOverride IS DECLARED VOCABULARY", emptyWarp().mods.rangeOverride, null,
  "an undeclared mod key is offered, charged, and silently dropped");
const RW = [{ ppCost: 2, text: "increase the range to 30 feet", mods: { rangeOverride: "30 feet" } }];
equal("W2 A WARP REPLACES THE PRINTED RANGE",
  warpedRange("touch", aggregateWarpSelection(RW, { "warp-0": 1 }).mods), "30 feet");
equal("W3 AND BUYING IT TWICE NAMES THE SAME RANGE",
  warpedRange("touch", aggregateWarpSelection(RW, { "warp-0": 2 }).mods), "30 feet",
  "an override is a state; the aggregator must not multiply it");
equal("W4 an unwarped cast keeps its printed range", warpedRange("touch", {}), "touch");
equal("W5 and an empty override is not an override", warpedRange("touch", { rangeOverride: "" }), "touch");
equal("W6 A SET IS BOUGHT ONCE", warpMaxTimes(RW[0]), 1,
  "repeating it changes nothing, so the chooser draws a checkbox");
equal("W7 AND IT REALLY MOVES THE GATE",
  outOfSpellRange(25, spellRangeFeet(warpedRange("touch", { rangeOverride: "30 feet" }))), false,
  "a target 25 ft away is out of touch and inside the warped 30 — which is what the 2 PP buys");
equal("W7b while the unwarped cast still refuses them",
  outOfSpellRange(25, spellRangeFeet("touch", 5)), true);
equal("W8 AND A WARP MAY REMOVE THE GATE ENTIRELY",
  spellRangeFeet(warpedRange("30 feet", { rangeOverride: "unlimited" })), null,
  "Mana Drain's \"increase the link range to unlimited\"");

/* ================================================================== *
 * THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) spells.push(v);
await db.close();

/* ── S4: THE PACK, so the blast radius is a measurement ──────────── */

const selfBound = spells.filter((s) =>
  !String(s.system?.range ?? "").trim() && !String(s.system?.area ?? "").trim());
// 149 → 148 AT 3.587.0, and the one that left is the point of S4b.
// Deflections printed no range and no area, so it was self-bound — and
// its -4 belongs on the creature that shot at you. The page's limit is
// awareness, not distance, so its range is now "see text", which the
// gate already reads as no limit to enforce. See
// tools/author-block26-effects.mjs for the full reasoning; it is the one
// printed parameter this block changed.
equal("S4 148 SPELLS BECOME SELF-ONLY", selfBound.length, 148,
  "measured before building rather than discovered after");

const reaching = selfBound.filter((s) => (s.system?.effects ?? [])
  .some((e) => e?.kind !== "note" && e?.target === "targets")).map((s) => s.name);
// NONE SINCE 3.617.3. Invisibility and Shield Of Faith were the two, and
// the 3.617.2 drive showed what a `targets` row on a self spell does with
// nothing targeted: "finds nobody to affect". Their rows are the caster's
// now, and their touch warps move them (`retargetSelfRows`). verify-self-rows
// asks the same of every spell.
equal("S4b NO SELF-BOUND SPELL HAS A ROW AIMED AT ANOTHER CREATURE",
  JSON.stringify(reaching.sort()), JSON.stringify([]),
  "a self spell's cast has no targets, so a `targets` row lands on nobody — the 3.617.2 drive");

/* ── S5: A WARP MAY NOT SELL A TARGET THE GATE REFUSES ────────────
 *
 * THE RATCHET THIS RELEASE EXISTS FOR. 3.532.0 made a blank range mean
 * the caster, and that turned one warp into a lie: Ethereal Jaunt's
 * "+1 PP: target an additional willing creature AT A RANGE OF TOUCH"
 * carried `extraTargets: 1` and nothing else, so the gate began refusing
 * the creature the warp charges PP to permit.
 *
 * It was found by measuring after the fact. This is the check that finds
 * the next one before it ships: a self-bound spell whose warp buys REACH
 * — more targets, a bigger cap — must also carry something that lifts
 * the restriction, or the purchase cannot be delivered.
 *
 * DERIVED FROM THE MODS, NOT A LIST OF SPELL NAMES, so a warp authored
 * next year is covered without anybody remembering this paragraph. */

const REACH_MODS = ["extraTargets", "targetCap", "targetCapPerLevel"];
const LIFT_MODS = ["rangeOverride", "areaOverride", "areaGrowth"];

const reachWarps = [];
const unreachable = [];
for (const sp of selfBound) {
  for (const [i, w] of (sp.system?.warps ?? []).entries()) {
    const m = w?.mods ?? {};
    if (!REACH_MODS.some((k) => m[k])) continue;
    reachWarps.push(`${sp.name} w${i}`);
    if (LIFT_MODS.some((k) => m[k])) continue;
    unreachable.push(`${sp.name} w${i}: ${JSON.stringify(m)}`);
  }
}

/* THE POSITIVE CONTROL, and it is here because the first version of this
 * ratchet did not have one and TWO MUTATIONS SURVIVED because of it.
 * "No violations" is also what an empty search returns, so a ratchet that
 * looked for the wrong mod names would have reported a clean pack for
 * ever. This asserts the search finds something before the next line
 * asserts what it found is clean. */
ok("S5 THE RATCHET ACTUALLY SEES A REACH WARP TO JUDGE",
  reachWarps.length > 0,
  `${JSON.stringify(reachWarps)} — zero here means REACH_MODS names nothing real, and `
  + "the clean result below would be an empty search rather than a healthy pack");
ok("S5b NO SELF-BOUND SPELL SELLS REACH IT CANNOT DELIVER",
  unreachable.length === 0,
  `${JSON.stringify(unreachable)} — a warp on a spell with no range and no area that `
  + "buys extra targets, without a rangeOverride or an area to reach them with, charges "
  + "PP for a creature the gate then refuses. Ethereal Jaunt was exactly this at "
  + "3.532.0 and is why this check exists");

/* ── S6: THE TWO SPELLS THE RULING FINISHED ──────────────────────── */

{
  const ej = spells.find((x) => x.name === "Ethereal Jaunt");
  const w = ej?.system?.warps?.[0];
  equal("S6 ETHEREAL JAUNT REACHES THE DISTANCE ITS WARP NAMES",
    w?.mods?.rangeOverride, "touch",
    "\"target an additional willing creature at a range of touch\" — the gate refused "
    + "that creature from 3.532.0 until this fix");
  equal("S6b and it keeps the extra target it always bought", w?.mods?.extraTargets, 1);
  ok("S6c THIS IS A GATE REPAIR AND NOT A CLAIM THE SPELL DOES ANYTHING",
    (ej?.system?.effects ?? []).length === 0,
    "Ethereal Jaunt has no effect rows at all — becoming ethereal lives in its "
    + "description. Pinned so nobody later reads this fix as having built the spell");
}

{
  const inv = spells.find((x) => x.name === "Invisibility");
  const w = inv?.system?.warps?.[0];
  equal("S7 INVISIBILITY CAN BE PUT ON SOMEBODY ELSE",
    w?.mods?.rangeOverride, "touch");
  // CORRECTED AT 3.617.3. This read "a `targets` row resolves to the caster
  // while the range is blank" — and it did not: cast with nothing targeted,
  // Invisibility made nobody invisible. The row is the caster's, and the
  // warp moves it to the creature touched.
  equal("S7b ITS ROW IS THE CASTER'S, AND THE TOUCH WARP MOVES IT",
    `${(inv?.system?.effects ?? []).find((e) => e?.kind === "condition")?.target}/${w?.mods?.retargetSelfRows}`, "self/true",
    "a `targets` row on a self spell reaches nobody when nothing is targeted — the 3.617.2 drive");
}


const warpOf = (n, i) => spells.find((s) => s.name === n)?.system?.warps?.[i];
const rangeOf = (n) => spells.find((s) => s.name === n)?.system?.range;

/* ── P. THE TEN BUILT ─────────────────────────────────────────────── */

const BUILT = [
  ["Fatigue", 0, "30 feet"], ["Lifekeeping", 0, "30 feet"],
  ["Remove Fear", 1, "30 feet"], ["Trade Essence", 1, "30 feet"],
  ["Mana Drain", 0, "unlimited"], ["Whispering Wind", 1, "100 miles"],
  ["Blindness", 0, "60 feet"], ["Flame Prison", 0, "60 feet"],
  ["Force Prison", 0, "60 feet"], ["Dance Macabre", 0, "50 feet"]
];
for (const [name, i, to] of BUILT) {
  equal(`P ${name} warp ${i}`, warpOf(name, i)?.mods?.rangeOverride, to);
}
ok("P1 EACH SITS UNDER A SENTENCE ABOUT RANGE",
  BUILT.every(([n, i]) => /range/i.test(String(warpOf(n, i)?.text ?? ""))),
  "a mod on the wrong index buys the right thing for the wrong option");
ok("P2 AND EVERY ONE ACTUALLY CHANGES THE SPELL'S REACH",
  BUILT.every(([n, i]) => {
    const printed = spellRangeFeet(rangeOf(n));
    const warped = spellRangeFeet(warpOf(n, i).mods.rangeOverride);
    return printed !== warped;
  }),
  "a warp that lands on the range it already had is a warp that buys nothing");

const FOUR = ["Blindness", "Flame Prison", "Force Prison", "Dance Macabre"];
ok("P3 THE FOUR COMPOUND ONES BUY THEIR AREA TOO",
  FOUR.every((n) => {
    const w = spells.find((s) => s.name === n).system.warps[0];
    return Boolean(w.mods.areaOverride) && Boolean(w.mods.rangeOverride);
  }),
  "each sentence changes two things, and `areaOverride` has existed since 3.445.0");
ok("P3b and each of those spells printed no area at all before",
  FOUR.every((n) => !String(spells.find((s) => s.name === n).system.area ?? "").trim()),
  "so the override creates the area rather than replacing one");

/* ── U. THE PACK'S UNGATED POPULATION ─────────────────────────────── */

const gated = spells.filter((s) => spellRangeFeet(s.system?.range) !== null);
const ungated = spells.filter((s) => spellRangeFeet(s.system?.range) === null);
// 464/228 → 465/227 AT 3.611.0: Death's Defiance's 20-foot radius became
// the reach of the creatures it targets (block 34's R7).
equal("U4 THE PACK SPLITS 465 GATED / 227 UNGATED", `${gated.length}/${ungated.length}`, "465/227",
  "an exact measurement, and it corrects a first draft that wrote 475/217 from impression — "
  + "the 217 blanks are joined by 6 planetary, 3 varies, 1 unlimited and 1 see-text");
ok("U5 AND EVERY UNGATED ONE IS UNGATED FOR A NAMED REASON",
  ungated.every((s) => {
    const t = String(s.system?.range ?? "").trim();
    return !t || /^(self|personal|varies|see text|planetary|unlimited|special)$/i.test(t);
  }),
  `not: ${JSON.stringify(ungated.filter((s) => {
    const t = String(s.system?.range ?? "").trim();
    return t && !/^(self|personal|varies|see text|planetary|unlimited|special)$/i.test(t);
  }).map((s) => [s.name, s.system.range]))}`);

equal("U6 142 SPELLS ARE TOUCH SPELLS",
  spells.filter((s) => /^touch$/i.test(String(s.system?.range ?? "").trim())).length, 142,
  "141 write it \"touch\" and one writes \"Touch\" — every one landed at any distance until this release");

/* ── C. THE CHANNEL'S REMAINDER, MEASURED RATHER THAN GUESSED ────── */

const rangeWarps = [];
for (const s of spells) {
  for (const [i, w] of (s.system?.warps ?? []).entries()) {
    if (/\brange\b/i.test(String(w.text ?? ""))) {
      rangeWarps.push({ s: s.name, i, mods: w.mods ?? {}, live: Boolean(w.mods?.rangeOverride) });
    }
  }
}
equal("C1 28 WARPS IN THE PACK TALK ABOUT RANGE", rangeWarps.length, 28,
  "25 of them shipped inert; the other three were already live on other keys");
// C2/C3 MOVED 10 → 11 AND 14 → 13 AT 3.531.0, and it is ONE warp
// crossing between them: Shield Of Faith's "increase the range to touch".
//
// It sat in the inert list because its base range field is BLANK, where
// every other rangeOverride in the pack sits on a written base range —
// so it looked like the note-only-base trap, a warp on something the
// data does not express.
//
// GRAHAM RULED ON 8 SEPTEMBER 2026 that it is not: "Spells that have no
// range or area affect the caster. So if a warping option increases that
// to a range (such as touch) then it gains that range with the warping
// option." A blank range is SELF, stated by omission. Its row already
// targets `targets`, which resolves to the caster while the range is
// blank and to the touched creature once it is not — so nothing had to
// be redirected, which is what still separates it from the thirteen
// below. See verify-warped-healing section F4.
// AND 11 → 13 AT 3.533.0, both consequences of the ruling rather than
// new ideas. Invisibility's "the spells range becomes touch, and you may
// target another creature" needed no redirect — its row already targets
// `targets`, so the range is what changes who it reaches. Ethereal Jaunt
// is the repair: its warp buys a target "at a range of touch" and 3.532.0
// had started refusing that creature. See sections S5–S7.
// AND 13 → 14 AT 3.534.0: Jump's "the range becomes touch and the target
// changes to one touched creature". Only ONE of that release's two
// retargeting warps lands here — Loremasters Edge says "target an ally
// within 30 feet" and never uses the word "range", so this survey by text
// does not see it. Recorded rather than widened: the survey is of what
// the pack SAYS, and a warp that grants reach without saying "range" is
// caught by verify-self-row-reach section G instead.
// 14 → 16 AT 3.587.0: Dimension Door's "+2 PP: range increases to 1
// mile" and Darkvision's "+1 PP: the range is touch", both inert since
// they were authored and both plain `rangeOverride` strings.
// 16 → 17 AT 3.591.0: Nightvision's "the spell's range is touch and it
// targets 1 willing creature" — the twin of Darkvision's, wired in the
// same shape (`rangeOverride` plus `retargetSelfRows`, since the spell's
// own row targets `self`) one release after it. That the two halves of a
// pair were built four releases apart is itself worth the note: the
// survey found Darkvision at 3.587.0 and nobody thought to ask what its
// sibling did.
equal("C2 SEVENTEEN ARE LIVE ON THE NEW KEY", rangeWarps.filter((w) => w.live).length, 17);
// C3 MOVED 15 → 14 AT 3.520.0, and by a warp that was never really a
// range warp: Sudden Sickening's "you can target up to 10 targets
// WITHIN RANGE" matches on the word while changing a COUNT, and the
// target-cap channel built it. The remaining fourteen redirect a TARGET
// rather than lengthening a reach.
// 11 → 9 AT 3.587.0, the other side of C2's move.
// 9 → 8 AT 3.591.0: Nightvision left this list for the one above.
equal("C3 EIGHT ARE STILL FULLY INERT, DELIBERATELY",
  rangeWarps.filter((w) => !Object.keys(w.mods).length).length, 8,
  "they redirect a TARGET rather than only lengthening a reach — a key no release has built yet");
/*
 * C4 IS A DEFECT THIS CHANNEL FOUND AND DID NOT FIX, pinned so it cannot
 * be forgotten. Slide's "+1 PP: the range increases by 5 feet" is the
 * one range warp that adds a step rather than naming a new range — and
 * it carries `bonusValue: 5`, which for this spell is read by NOBODY.
 * `bonusValue` is consumed by sacrificing-shield, magic-stone,
 * spell-conditional and slot-choice; Slide is none of them. Its printed
 * range is "touch" and the thirty feet the warp lengthens is the slide
 * distance in its description, which the spell does not model at all.
 */
const slide = rangeWarps.find((w) => w.s === "Slide");
ok("C4 SLIDE'S RANGE WARP IS STILL POINTED AT A KEY NOBODY READS FOR IT",
  slide?.mods?.bonusValue === 5 && !slide?.mods?.rangeOverride,
  `if this fails somebody has moved it — check they moved it somewhere that is read: ${JSON.stringify(slide?.mods)}`);

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-spell-range: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-spell-range: OK — ${checks} checks. `
  + "464 spells now reach only as far as they say; 149 that name neither range nor area now reach only the caster.\n");
