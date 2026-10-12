#!/usr/bin/env node
/**
 * verify-target-cap — a warp that names a TOTAL rather than an increment.
 *
 * NEW at 3.520.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE KEY EXISTED AND THREE SENTENCES NEEDED SAYING.
 *
 * 3.498.0 built `extraTargets` for the 46 warps that sell "you can
 * target an additional creature". It is an INCREMENT, and it was the
 * right shape for those. Measured this release: TWELVE MORE warps name
 * a TOTAL, and none of them could be authored at all:
 *
 *    8  a flat total          "you can target up to 10 targets"
 *    3  a total per level     "target up to 1 creature per level"
 *    1  an area instead       "the spell effects all targets in a 10-foot radius"
 *
 * A TOTAL REPLACES; AN INCREMENT ADDS. Section B is that distinction,
 * and it is the one a careless build gets wrong: folding "up to 10" into
 * `extraTargets` makes it ELEVEN on a "1 creature" spell and TWELVE on a
 * "2 creatures" one, so the printed number would mean something
 * different on every spell that bought it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION L IS GRAHAM'S RULING, 7 September 2026: "per level" means
 * CASTER level — the same `casterLevelOf` used for max PP per cast,
 * overcasting DC and resting recovery. Trade Essence writes "per caster
 * level" in full and these three write only "per level"; one concept.
 *
 * SECTION U IS THE POPULATION THAT MUST NOT MOVE — every spell whose
 * printed line gives no number stays uncapped, warp or no warp, because
 * "ten more than no limit" is not a number and refusing on it would turn
 * an unparsed line into a restriction the book never printed.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  baseCapAfterWarps, parseTargetCount, targetCapFor
} from "../module/magic/target-count.mjs";
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
 * B. A TOTAL REPLACES, AN INCREMENT ADDS
 * ================================================================== */

equal("B1 THE PRINTED CAP STANDS WHEN NOTHING IS BOUGHT",
  targetCapFor("1 creature", {}), 1);
equal("B2 AN INCREMENT ADDS TO IT",
  targetCapFor("1 creature", { extraTargets: 1 }), 2,
  "the 3.498.0 shape, unchanged");
equal("B3 A TOTAL REPLACES IT",
  targetCapFor("1 creature", { targetCap: 10 }), 10,
  "\"up to 10 targets\" is ten, not eleven");
equal("B3b AND MEANS THE SAME NUMBER ON A SPELL THAT PRINTS TWO",
  targetCapFor("2 creatures", { targetCap: 10 }), 10,
  "an increment here would have given 12 — the printed number would differ per spell");
equal("B4 A TOTAL SMALLER THAN THE PRINTED CAP DOES NOT SHRINK IT",
  targetCapFor("6 creatures", { targetCap: 5 }), 6,
  "a warp is bought; it can never be a penalty");
equal("B5 BOTH TOGETHER: THE TOTAL FIRST, THEN THE INCREMENT",
  targetCapFor("1 creature", { targetCap: 10, extraTargets: 2 }), 12,
  "nothing in the pack sells both, but the order has to be decided rather than emergent");

/* ================================================================== *
 * L. PER CASTER LEVEL
 * ================================================================== */

equal("L1 ONE PER LEVEL AT LEVEL 12", targetCapFor("1 creature", { targetCapPerLevel: 1 }, 12), 12);
equal("L2 and at level 1 it is the printed cap",
  targetCapFor("1 creature", { targetCapPerLevel: 1 }, 1), 1);
equal("L3 NEVER BELOW THE PRINTED CAP",
  targetCapFor("6 creatures", { targetCapPerLevel: 1 }, 3), 6,
  "a level-3 caster who paid 8 PP must not end up with fewer targets than the spell prints");
equal("L4 A LEVEL THAT CANNOT BE READ BUYS THE PRINTED CAP, NOT ZERO",
  targetCapFor("1 creature", { targetCapPerLevel: 1 }, 0), 1,
  "zero would refuse every target on a spell the caster just paid to widen");
equal("L4b and neither does a missing level argument",
  targetCapFor("1 creature", { targetCapPerLevel: 1 }), 1);
equal("L5 the increment still rides on top",
  targetCapFor("1 creature", { targetCapPerLevel: 1, extraTargets: 1 }, 8), 9);

/* ================================================================== *
 * A. THE COMBINER ON ITS OWN
 * ================================================================== */

equal("A1 nothing bought is the printed cap", baseCapAfterWarps(3, {}), 3);
equal("A2 THE LARGEST OFFER WINS",
  baseCapAfterWarps(1, { targetCap: 5, targetCapPerLevel: 1 }, 12), 12,
  "two offers cannot make a purchase into a penalty");
equal("A2b and the other way round",
  baseCapAfterWarps(1, { targetCap: 20, targetCapPerLevel: 1 }, 12), 20);
equal("A3 a negative total is not an offer", baseCapAfterWarps(2, { targetCap: -5 }), 2);
equal("A4 nor is a negative level", baseCapAfterWarps(2, { targetCapPerLevel: 1 }, -9), 2);

/* ================================================================== *
 * U. WHAT MUST STAY UNCAPPED
 * ================================================================== */

equal("U1 A LINE WITH NO NUMBER HAS NO CAP", targetCapFor("any number of creatures", {}), null);
equal("U2 AND A WARP DOES NOT INVENT ONE",
  targetCapFor("any number of creatures", { targetCap: 10 }), null,
  "\"ten\" is not larger than \"no limit\" — refusing here would restrict a line the book left open");
equal("U2b nor does a per-level one",
  targetCapFor("all creatures in range", { targetCapPerLevel: 1 }, 20), null);
equal("U3 and a spell that prints no targets line at all stays uncapped",
  targetCapFor("", { targetCap: 10 }), null,
  "Clarity — which is why its warp buys an area and no cap");

/* ================================================================== *
 * W. THE VOCABULARY AND THE CHOOSER
 * ================================================================== */

equal("W1 targetCap IS DECLARED", emptyWarp().mods.targetCap, null);
equal("W1b and so is targetCapPerLevel", emptyWarp().mods.targetCapPerLevel, 0);
const TOTAL = [{ ppCost: 6, text: "target up to 10 targets", mods: { targetCap: 10 } }];
const PERLV = [{ ppCost: 8, text: "1 creature per level", mods: { targetCapPerLevel: 1 } }];
equal("W2 a total survives the aggregator",
  aggregateWarpSelection(TOTAL, { "warp-0": 1 }).mods.targetCap, 10);
equal("W3 AND BUYING IT TWICE IS THE SAME TOTAL",
  aggregateWarpSelection(TOTAL, { "warp-0": 2 }).mods.targetCap, 10,
  "a total bought twice is that total, not twenty");
equal("W4 so does a per-level rate",
  aggregateWarpSelection(PERLV, { "warp-0": 1 }).mods.targetCapPerLevel, 1);
equal("W5 and it does not double either",
  aggregateWarpSelection(PERLV, { "warp-0": 2 }).mods.targetCapPerLevel, 1);
equal("W6 A TOTAL IS A CHECKBOX", warpMaxTimes(TOTAL[0]), 1);
equal("W6b and so is a rate", warpMaxTimes(PERLV[0]), 1);

/* ================================================================== *
 * THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) spells.push(v);
await db.close();

const warpOf = (n, i) => spells.find((s) => s.name === n)?.system?.warps?.[i];
const targetsOf = (n) => spells.find((s) => s.name === n)?.system?.targets;

/* ── P. THE THIRTEEN ──────────────────────────────────────────────── */

const FLAT = [
  ["Sudden Sickening", 0, 10], ["Pariah", 0, 10], ["Dream Message", 0, 10],
  ["Visage Of Horror", 0, 5], ["Brawn", 1, 6], ["Wits", 1, 6],
  ["Neutralise Poison", 0, 10], ["Rage", 0, 10]
];
for (const [name, i, cap] of FLAT) {
  equal(`P ${name} warp ${i}`, warpOf(name, i)?.mods?.targetCap, cap);
}
const PER = [["Command", 0], ["Charm Kind", 2], ["Charm Animal", 1]];
for (const [name, i] of PER) {
  equal(`P ${name} warp ${i} is per level`, warpOf(name, i)?.mods?.targetCapPerLevel, 1);
}
equal("P Clarity buys an area", warpOf("Clarity", 0)?.mods?.areaOverride, "10-foot radius");
equal("P Cloak Of Greying buys an area", warpOf("Cloak Of Greying", 0)?.mods?.areaOverride, "50-foot radius");

ok("P1 EACH SITS UNDER A SENTENCE ABOUT WHO IT AFFECTS",
  [...FLAT, ...PER].every(([n, i]) => /target|affect/i.test(String(warpOf(n, i)?.text ?? ""))),
  "a mod on the wrong index buys the right thing for the wrong option");

ok("P2 AND EVERY FLAT TOTAL REALLY RAISES ITS SPELL'S CAP",
  FLAT.every(([n, i, cap]) => {
    const before = targetCapFor(targetsOf(n), {});
    const after = targetCapFor(targetsOf(n), warpOf(n, i).mods);
    return before !== null && after === cap && after > before;
  }),
  `not: ${JSON.stringify(FLAT.filter(([n, i, cap]) =>
    targetCapFor(targetsOf(n), warpOf(n, i).mods) !== cap).map(([n]) => n))}`);

ok("P3 AND EVERY PER-LEVEL ONE SCALES",
  PER.every(([n, i]) => {
    const at1 = targetCapFor(targetsOf(n), warpOf(n, i).mods, 1);
    const at12 = targetCapFor(targetsOf(n), warpOf(n, i).mods, 12);
    return at12 === 12 && at12 > at1;
  }));

equal("P4 CLARITY IS DELIBERATELY UNCAPPED",
  targetCapFor(targetsOf("Clarity"), warpOf("Clarity", 0).mods), null,
  "it prints no targets line, so a cap here would invent a restriction");

/* ── C. THE CHANNEL, MEASURED ─────────────────────────────────────── */

let flat = 0;
let perLevel = 0;
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    if (w?.mods?.targetCap != null) flat += 1;
    if (w?.mods?.targetCapPerLevel) perLevel += 1;
  }
}
// 8 -> 9 at 3.586.0 (BALL LIGHTNING). "Create an additional ball which
// must have a different target, you may direct BOTH balls each turn" —
// and it is a flat TOTAL rather than the increment it first looks like,
// on the strength of that one word. `extraTargets: 1` would have been
// multiplied by `times` and drawn a count box a caster could keep
// feeding; `verify-warp-repeats` is what caught that, by the option
// leaving the one-shot bucket.
// 9 -> 10 at 3.587.0 (DARKVISION). "+1 PP: the spell's range is touch
// and it targets 1 willing creature" -- a range override and a total of
// one, which is a cap rather than an increment because the sentence
// names how many there are rather than how many more.
equal("C1 TEN FLAT TOTALS ARE AUTHORED", flat, 10);
equal("C2 AND THREE PER-LEVEL RATES", perLevel, 3);

const stillInert = [];
for (const s of spells) {
  for (const [i, w] of (s.system?.warps ?? []).entries()) {
    if (!Object.keys(w.mods ?? {}).length && /target up to|affect up to|effect up to \d+ targets/i.test(String(w.text ?? ""))) {
      stillInert.push(`${s.name}[${i}]`);
    }
  }
}
equal("C3 AND NO WARP NAMING A TOTAL IS LEFT INERT", stillInert.length, 0,
  `still inert: ${JSON.stringify(stillInert)}`);

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-target-cap: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-target-cap: OK — ${checks} checks. `
  + "Eleven warps that name a total now raise a cap the gate already enforces.\n");
