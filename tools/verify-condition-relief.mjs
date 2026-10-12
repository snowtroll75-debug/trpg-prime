#!/usr/bin/env node
/**
 * verify-condition-relief — a spell that takes a condition down.
 *
 * NEW at 3.517.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * RESTORATION HAD THE LARGEST CLUSTER OF INERT WARPS IN THE PACK: six,
 * every one carrying `mods: {}`, measured across all 702. Its printed
 * rule is a single line — "This reduces the fatigued condition by 1" —
 * and the pack shipped it with `effects: []`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION S IS THE UNIT THE BOOK COUNTS IN. Soul drain moves in FIVES —
 * "cure 5 points of soul drain", "(or 5 for soul drain)" — and everything
 * else in ones. That parenthesis is not a special case: it is the
 * condition's own step, so the amount warp adds five to soul drain and
 * one to fatigue without either warp saying so.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS THE RULING. "A creature may only benefit from one
 * restoration spell each day" limits the BENEFICIARY, and Graham ruled on
 * 7 September 2026 that it is tracked on them and cleared by THEIR daily
 * preparations — a cleric who rests while the patient does not has not
 * renewed the patient's day. Declared as a KEY rather than a boolean, so
 * a Restoration cannot block some future relief spell.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  RELIEVABLE, alreadyRelievedLine, alreadyRelievedToday, markRelievedToday,
  casterGainsLine, normaliseConditionRelief, reliefChoices, reliefLine, reliefNeedsPrompt,
  reliefNothingLine, reliefPlan
} from "../module/magic/condition-relief.mjs";
import {
  WARP_UNLIMITED, aggregateWarpSelection, emptyWarp, warpMaxTimes
} from "../module/magic/spell-warp.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";

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

const ROW = {
  kind: "conditionRelief", label: "Restoration", target: "targets",
  condition: "fatigued", amount: 1, oncePerDay: "restoration"
};
const SPEC = normaliseConditionRelief(ROW);

/* ================================================================== *
 * V. THE VOCABULARY
 * ================================================================== */

// V1 EVERY CONDITION THIS CHANNEL NAMES IS REAL AND VALUED. A relief on
// something that has no steps would have nothing to come down.
for (const key of Object.keys(RELIEVABLE)) {
  ok(`V1:${key} is a real condition`, Boolean(CONDITIONS[key]), key);
  ok(`V1b:${key} is valued`, CONDITIONS[key]?.valued === true,
    "the relief takes it down a step at a time, so it must have steps");
  equal(`V1c:${key} label matches the registry`, RELIEVABLE[key].label, CONDITIONS[key]?.label,
    "two names for one condition is how a card starts disagreeing with a sheet");
}
// SEVEN SINCE 3.577.0: the six Restoration names, and Bleeding for the
// block-17 alchemy (Blood-Block, Firqueline). V2b pins the seventh by name
// so a count that happens to match cannot hide a swap.
// NINE SINCE 3.625.0: Sickened and Frightened for Pillars of Faith (Bloom of Renewal, Share Burden).
equal("V2 ten conditions: Restoration's six, Bleeding, Sickened, Frightened and Dying (3.630.0)", Object.keys(RELIEVABLE).length, 10);
ok("V2c sickened and frightened are relievable, for Pillars of Faith", Boolean(RELIEVABLE.sickened) && Boolean(RELIEVABLE.frightened));
ok("V2b bleeding is relievable, for Blood-Block and Firqueline", Boolean(RELIEVABLE.bleeding));
ok("V3 the kind is handled by the applier", HANDLED_EFFECT_KINDS.includes("conditionRelief"),
  "a kind outside the list is dropped in silence");

/* ================================================================== *
 * N. THE DECLARATION
 * ================================================================== */

ok("N1 the authored row normalises", Boolean(SPEC));
equal("N1b carrying its condition", SPEC?.condition, "fatigued");
equal("N1c and its printed amount", SPEC?.amount, 1);
equal("N1d and its daily key", SPEC?.oncePerDay, "restoration");
equal("N2 A ROW NAMING AN UNKNOWN CONDITION IS REFUSED",
  normaliseConditionRelief({ ...ROW, condition: "bewildered" }), null,
  "it would reduce nothing and print a line saying it had");
equal("N2b and so is another kind", normaliseConditionRelief({ ...ROW, kind: "heal" }), null);
equal("N2c and nothing at all", normaliseConditionRelief(null), null);
// N3 SOUL DRAIN DEFAULTS TO FIVE, not to one — the book only ever moves
// it in fives, so a row that forgot to say so must not cure a single point.
equal("N3 A SOUL DRAIN ROW DEFAULTS TO ITS OWN STEP",
  normaliseConditionRelief({ kind: "conditionRelief", condition: "soulDrain" })?.amount, 5);
equal("N3b while fatigue defaults to one",
  normaliseConditionRelief({ kind: "conditionRelief", condition: "fatigued" })?.amount, 1);
equal("N4 a row with no daily limit declares none",
  normaliseConditionRelief({ kind: "conditionRelief", condition: "fatigued" })?.oncePerDay, null);

/* ================================================================== *
 * C. WHICH CONDITION
 * ================================================================== */

equal("C1 unwarped, the printed one",
  JSON.stringify(reliefChoices(SPEC, {})), JSON.stringify(["fatigued"]));
ok("C1b and nothing is asked", !reliefNeedsPrompt(SPEC, {}),
  "a prompt with one option is a dialog that decides nothing");

const PAIR = { reliefConditions: ["dazed", "weakened"] };
equal("C2 THE +1 PP WARP OFFERS TWO",
  JSON.stringify(reliefChoices(SPEC, PAIR)), JSON.stringify(["dazed", "weakened"]),
  "\"instead reduce the dazed OR weakened conditions\" is ONE purchase offering two");
ok("C2b so the caster is asked", reliefNeedsPrompt(SPEC, PAIR));
equal("C3 A SINGLE REDIRECT ASKS NOTHING",
  reliefNeedsPrompt(SPEC, { reliefConditions: ["injured"] }), false,
  "\"instead reduce the injured condition\" leaves nothing to choose");

// C4 A TYPO IN A WARP NAMES NOTHING. The mutation runner asked for this:
// dropping the table test from the warp list SURVIVED, because no check
// had ever handed it a condition that does not exist.
equal("C4 AN UNKNOWN CONDITION IN A WARP IS DISCARDED",
  JSON.stringify(reliefChoices(SPEC, { reliefConditions: ["bewildered"] })),
  JSON.stringify(["fatigued"]),
  "a typo in one warp must cost that warp, not the spell");
equal("C4b and the plan falls back to the printed condition",
  reliefPlan(SPEC, { reliefConditions: ["bewildered"] })?.condition, "fatigued");
equal("C4c while a good one beside it survives",
  JSON.stringify(reliefChoices(SPEC, { reliefConditions: ["bewildered", "doomed"] })),
  JSON.stringify(["doomed"]));

/* ================================================================== *
 * P. WHAT IT REDUCES
 * ================================================================== */

equal("P1 unwarped it takes fatigue down one", JSON.stringify(reliefPlan(SPEC, {})),
  JSON.stringify({ condition: "fatigued", label: "Fatigued", amount: 1 }));
equal("P2 THE REDIRECT REPLACES THE CONDITION",
  reliefPlan(SPEC, { reliefConditions: ["injured"] })?.condition, "injured",
  "\"instead\" is the book's own word");
equal("P2b and takes the new condition's own step",
  reliefPlan(SPEC, { reliefConditions: ["soulDrain"] })?.amount, 5,
  "\"instead cure 5 points of soul drain\"");

equal("P3 THE PICK IS HONOURED", reliefPlan(SPEC, PAIR, "weakened")?.condition, "weakened");
equal("P3b and an unanswered prompt takes the first",
  reliefPlan(SPEC, PAIR, "")?.condition, "dazed");
// P3c A PICK THE WARPS DID NOT BUY IS IGNORED — whatever a prompt
// returns, only what this casting bought may be applied.
equal("P3c A PICK NOBODY BOUGHT IS REFUSED",
  reliefPlan(SPEC, PAIR, "doomed")?.condition, "dazed",
  "the +6 PP warp was not taken, so Doomed is not on offer");

/* ================================================================== *
 * S. THE UNIT THE BOOK COUNTS IN
 * ================================================================== */

equal("S1 A BUMP IS ONE MORE FATIGUE", reliefPlan(SPEC, { reliefBump: 1 })?.amount, 2);
equal("S1b and two bumps is two more", reliefPlan(SPEC, { reliefBump: 2 })?.amount, 3);
equal("S2 BUT FIVE MORE SOUL DRAIN",
  reliefPlan(SPEC, { reliefConditions: ["soulDrain"], reliefBump: 1 })?.amount, 10,
  "\"increase the amount … by 1 (or 5 for soul drain)\" — the parenthesis is the step");
equal("S2b and two bumps is fifteen",
  reliefPlan(SPEC, { reliefConditions: ["soulDrain"], reliefBump: 2 })?.amount, 15);
// S3 THE FLOOR. Every numeric channel in this system carries one.
equal("S3 A NEGATIVE MOD NEVER BUYS LESS", reliefPlan(SPEC, { reliefBump: -4 })?.amount, 1,
  "a warp only ever buys more");

/* ================================================================== *
 * D. THE DAILY LIMIT
 * ================================================================== */

ok("D1 a fresh creature has had none", !alreadyRelievedToday({}, "restoration"));
ok("D1b nor has one with no record at all", !alreadyRelievedToday(null, "restoration"));
ok("D2 ONE IS REMEMBERED",
  alreadyRelievedToday(markRelievedToday({}, "restoration"), "restoration"));
// D3 IS WHY IT IS A KEY. A shared boolean would have let a Restoration
// block some future relief spell on the same creature.
ok("D3 AND IT BLOCKS ONLY ITS OWN SPELL",
  !alreadyRelievedToday(markRelievedToday({}, "restoration"), "someOtherRelief"),
  "the book names one spell, not a category");
/*
 * D4 STILL HOLDS, BUT ITS GUARD WAS DEAD AND IS GONE.
 *
 * `alreadyRelievedToday` opened `if (!key) return false;` and the
 * mutation removing it SURVIVED: with no key, `record[undefined]` is
 * undefined, which is not `true`, so the line below already answered
 * false. The seventh dead guard this project has deleted rather than
 * written a check around.
 *
 * The assertion stays — it is the RULE, and the rule is what matters.
 * `markRelievedToday`'s identical-looking guard is NOT dead, because
 * there it decides whether a key is written at all.
 */
ok("D4 A ROW WITH NO LIMIT IS NEVER BLOCKED",
  !alreadyRelievedToday({ restoration: true }, null),
  "Animal Healing carries no such sentence");
ok("D4b nor does marking one without a key invent one",
  Object.keys(markRelievedToday({ a: true }, null)).join() === "a",
  "that guard is live: it decides whether anything is written");
ok("D5 the record keeps what was already there",
  markRelievedToday({ other: true }, "restoration").other === true,
  "one spell's record must not erase another's");

/* ================================================================== *
 * W. THE WARP CHANNEL
 * ================================================================== */

const redirect = { ppCost: 1, text: "instead dazed or weakened", mods: PAIR };
const bump = { ppCost: 2, text: "increase the amount", mods: { reliefBump: 1 } };

// W0 THE VOCABULARY ITSELF. A mod key absent from `emptyWarpMods` is not
// part of the contract — `emptyWarp` is its public form, and a stored or
// item cast rebuilds its mods by spreading it. The mutation renaming the
// key SURVIVED until this asserted the declaration directly.
ok("W0 BOTH KEYS ARE IN THE DECLARED VOCABULARY",
  Object.prototype.hasOwnProperty.call(emptyWarp().mods, "reliefConditions")
  && Object.prototype.hasOwnProperty.call(emptyWarp().mods, "reliefBump"),
  Object.keys(emptyWarp().mods).join(", "));
equal("W0b and the redirect starts empty", emptyWarp().mods.reliefConditions, null);
equal("W0c and the bump starts at zero", emptyWarp().mods.reliefBump, 0);

equal("W1 THE REDIRECT SURVIVES THE AGGREGATOR",
  JSON.stringify(aggregateWarpSelection([redirect], { "warp-0": 1 }).mods.reliefConditions),
  JSON.stringify(["dazed", "weakened"]),
  "a mod key not declared in emptyWarpMods is charged for and dropped in silence");
equal("W2 THE BUMP SURVIVES IT TOO",
  aggregateWarpSelection([bump], { "warp-0": 1 }).mods.reliefBump, 1);
equal("W2b and three purchases buy three",
  aggregateWarpSelection([bump], { "warp-0": 3 }).mods.reliefBump, 3);
// W3 A REDIRECT IS NOT MULTIPLIED. "Instead" states which condition, and
// buying it twice states the same one twice.
equal("W3 A REDIRECT IS A ONE-SHOT CHECKBOX", warpMaxTimes(redirect), 1,
  "\"instead\" states which, and states it once");
equal("W3b while the amount warp has no ceiling", warpMaxTimes(bump), WARP_UNLIMITED,
  "which only became possible at 3.515.0");
// W4 THE LAST REDIRECT WINS. A caster who buys two has changed their
// mind, not bought two spells.
equal("W4 TWO REDIRECTS AND THE LAST ONE WINS",
  JSON.stringify(aggregateWarpSelection(
    [redirect, { ppCost: 2, text: "instead injured", mods: { reliefConditions: ["injured"] } }],
    { "warp-0": 1, "warp-1": 1 }).mods.reliefConditions),
  JSON.stringify(["injured"]));

/* ================================================================== *
 * L. WHAT THE CARD SAYS
 * ================================================================== */

ok("L1 THE NUMBERS ON BOTH SIDES", /2/.test(reliefLine("Toben", "Fatigued", 3, 2))
  && /3/.test(reliefLine("Toben", "Fatigued", 3, 2)), reliefLine("Toben", "Fatigued", 3, 2));
ok("L2 AND WHEN IT CLEARS, IT SAYS SO",
  /no longer/i.test(reliefLine("Toben", "Fatigued", 1, 0)), reliefLine("Toben", "Fatigued", 1, 0));
ok("L2b naming what it was", /was 1/.test(reliefLine("Toben", "Fatigued", 1, 0)));
ok("L3 NOTHING TO REDUCE IS SAID OUT LOUD, AND THE PP IS SPENT",
  /nothing to reduce/i.test(reliefNothingLine("Toben", "Fatigued"))
  && /spent/i.test(reliefNothingLine("Toben", "Fatigued")),
  reliefNothingLine("Toben", "Fatigued"));
ok("L4 THE DAILY REFUSAL NAMES THE RULE",
  /only benefit from one/i.test(alreadyRelievedLine("Toben", "Restoration")),
  "\"nothing happened\" is the shape this project spends its releases removing");
ok("L4b and names the spell", alreadyRelievedLine("Toben", "Restoration").includes("Restoration"));

/* ================================================================== *
 * K. THE PACK
 * ================================================================== */

const spells = [];
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, v] of db.iterator()) spells.push(v);
  } finally { await db.close().catch(() => {}); }
}
const rest = spells.find((s) => s?.name === "Restoration");
const rw = rest?.system?.warps ?? [];

ok("K1 Restoration declares an effect at all", Boolean(normaliseConditionRelief((rest?.system?.effects ?? [])[0])),
  "it carried `effects: []` and did nothing");
equal("K1b reducing fatigue", normaliseConditionRelief((rest?.system?.effects ?? [])[0])?.condition, "fatigued");
equal("K1c AND CARRYING THE DAILY LIMIT",
  normaliseConditionRelief((rest?.system?.effects ?? [])[0])?.oncePerDay, "restoration");

equal("K2 six warps, as printed", rw.length, 6);
equal("K2a the dazed/weakened pair",
  JSON.stringify(rw[0]?.mods?.reliefConditions), JSON.stringify(["dazed", "weakened"]));
equal("K2b injured", JSON.stringify(rw[1]?.mods?.reliefConditions), JSON.stringify(["injured"]));
equal("K2c the amount bump", rw[2]?.mods?.reliefBump, 1);
equal("K2d soul drain", JSON.stringify(rw[3]?.mods?.reliefConditions), JSON.stringify(["soulDrain"]));
equal("K2e doomed", JSON.stringify(rw[5]?.mods?.reliefConditions), JSON.stringify(["doomed"]));

/*
 * K3 WAS "THE CAST-TIME WARP IS STILL INERT, DELIBERATELY" — the one
 * left unbuilt at 3.517.0, asserted so nobody could read Restoration as
 * finished. 3.518.0 built the channel it was pointing at, so the check
 * now asserts the opposite: the warp is LIVE, and Restoration has no
 * inert warp left at all.
 *
 * TURNED ROUND RATHER THAN DELETED. A deliberate gap that is filled
 * leaves a promise behind it, and the cheapest way to keep that promise
 * honest is to make the same line say so.
 */
ok("K3 THE CAST-TIME WARP IS LIVE (3.518.0 — it was the deliberate gap)",
  /cast time/i.test(String(rw[4]?.text ?? "")) && rw[4]?.mods?.castApSet === 3,
  `warp 4 is "${rw[4]?.text}" with mods ${JSON.stringify(rw[4]?.mods)}`);
equal("K3b AND RESTORATION HAS NO INERT WARP LEFT",
  rw.filter((w) => !Object.keys(w?.mods ?? {}).length).length, 0,
  `still inert: ${JSON.stringify(rw.filter((w) => !Object.keys(w?.mods ?? {}).length).map((w) => w.text))}`);

/*
 * K4 IS A CENSUS, and it moved at 3.591.0 for the first time since the
 * channel was built. Metabolism (page 296) is the SECOND spell to use
 * it, and it uses the half Restoration does not: a base-text choice
 * between three conditions, offered by the ROW rather than bought by a
 * warp. Animal Healing's two condition warps are still ADDITIONS to its
 * healing rather than an "instead", so they still need a shape no
 * release has built.
 *
 * NAMED RATHER THAN COUNTED, deliberately. A bare count going from one
 * to two says nothing about which spell joined or why; the names make a
 * later reader's question ("who else relies on this?") answerable from
 * the check itself.
 */
const relievers = spells.filter((s) =>
  (s.system?.effects ?? []).some((e) => String(e.kind) === "conditionRelief"));
// 2 -> 4 at 3.611.0 (block 34): Animal Healing's dazed-or-weakened and
// injured warps, and Banish Fatigue's "removes the fatigue permanently",
// each a relief row a warp UNLOCKS (`unlockedBy`) rather than grows — the
// different shape this note used to name, now built.
equal("K4 FOUR SPELLS USE THE CHANNEL (Metabolism at 3.591.0; Animal Healing and Banish Fatigue at 3.611.0)",
  JSON.stringify(relievers.map((s) => s.name).sort()),
  JSON.stringify(["Animal Healing", "Banish Fatigue", "Metabolism", "Restoration"]),
  "a relief row nobody unlocks would be a channel with a hole in it");
equal("K4b AND THE SECOND ONE USES THE HALF THE FIRST DOES NOT",
  JSON.stringify((relievers.find((s) => s.name === "Metabolism")?.system?.effects ?? [])
    .find((e) => e.kind === "conditionRelief")?.choices ?? []),
  JSON.stringify(["dazed", "injured", "weakened"]),
  "the page's own order \u2014 Restoration's choice is BOUGHT by a warp, Metabolism's is printed in the base text");

/* ================================================================== *
 * X. SHARE BURDEN'S OTHER HALF, AND A PROMPT THAT ASKS ONLY WHAT IS HELD (3.625.1)
 * ================================================================== */

equal("X1 casterGains reads, and is off unless said",
  JSON.stringify([normaliseConditionRelief({ kind: "conditionRelief", condition: "fatigued", casterGains: true }).casterGains,
    normaliseConditionRelief({ kind: "conditionRelief", condition: "fatigued" }).casterGains]), JSON.stringify([true, false]));
ok("X2 the caster's line says the new value and the old",
  /<strong>Mara<\/strong> takes it on: <strong>Fatigued 2<\/strong> \(was 1\)\./.test(casterGainsLine("Mara", "Fatigued", 1, 2))
  && !/was/.test(casterGainsLine("Mara", "Fatigued", 0, 1)));
{
  const effects = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
  ok("X3 STRUCTURAL: the prompt offers only the conditions this creature holds — one held is taken without asking, none held asks nothing",
    /const held = offered\.filter\(\(c\) => Number\([\s\S]{0,160}\) > 0\);\s*if \(held\.length === 1\) reliefPick = held\[0\];\s*else if \(held\.length > 1\) \{/.test(effects));
  ok("X4 STRUCTURAL: the caster takes the relieved condition on one step higher, through applyConditionTags, never when healing themselves",
    /if \(reliefSpec\.casterGains && caster && caster !== target && caster\.uuid !== target\.uuid\) \{[\s\S]{0,600}value: mine \+ 1[\s\S]{0,300}casterGainsLine\(caster\.name, relief\.label, mine, mine \+ 1\)/.test(effects));
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-condition-relief: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-condition-relief: OK — ${checks} checks. `
  + "Restoration's six inert warps are all six live as of 3.518.0.\n");
