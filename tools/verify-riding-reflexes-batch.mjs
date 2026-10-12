#!/usr/bin/env node
/**
 * verify-riding-reflexes-batch — three Chapter 5 feats built at 3.378.0.
 *
 *   SKITTER                   Crawl covers half your Speed, not a flat 5 ft
 *   IMPROVED COMBAT REFLEXES  +Dex reactions at turn start, and one AoO a
 *                             round even while Flat-Footed
 *   BORN TO RIDE              one riding action a round is Free
 *
 * All three were `featNote`-only in the pack.
 *
 * WHAT THIS FILE GUARDS. Each of the three is a rule with a LIMIT — a
 * floor, a cap, or a once-a-round — and a limit is the part that gets lost
 * first, because losing it makes the feat feel better rather than worse.
 * Nobody at a table reports "my feat is too good". So most of what follows
 * asks whether the limits hold, not whether the bonus arrives.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { armedMoveLimit, validateArmedMove } from "../module/combat/movement.mjs";
import { movementFractionOverride, movementLimitBonus, oncePerRoundFreeAction } from "../module/feats.mjs";
import { flatFootedOpportunityAllowed, reactionsAtTurnStart, reactorEligibility } from "../module/combat/opportunity-rules.mjs";
import { FLAT_FOOTED_BLOCK } from "../module/combat/reactions.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== *
 * A. SKITTER
 * ================================================================== */

const SKIT = ["Skitter"];
const crawlOverride = (feats) => movementFractionOverride("crawl", feats);
const crawl = (speed, feats = SKIT) => armedMoveLimit("crawl", speed, 0, crawlOverride(feats));

equal("A1 Crawl is 5 ft without the feat, whatever the Speed", armedMoveLimit("crawl", 60), 5);
equal("A2 half of a 30 ft Speed", crawl(30), 15);
equal("A3 half of a 25 ft Speed rounds DOWN", crawl(25), 12);
equal("A4 half of a 60 ft Speed", crawl(60), 30);
// THE FLOOR IS THE POINT. Half of a 5 ft Speed is 2, which is LESS than
// the flat 5 everyone already gets — a feat that reads "you can Crawl up
// to half your Speed" must never leave its owner crawling less far than
// somebody without it.
equal("A5 a 10 ft Speed still crawls its full 5", crawl(10), 5);
equal("A6 a 5 ft Speed still crawls 5", crawl(5), 5);
equal("A7 even a 0 ft Speed does not go negative", crawl(0), 5);
// Scope. THE ACTION GATE LIVES IN THE LOOKUP, not in armedMoveLimit —
// which applies whatever override it is handed, exactly as it applies
// whatever limitBonus it is handed. So the check that matters is that the
// lookup refuses to produce an override for the wrong action; testing
// armedMoveLimit with a crawl override on a step would only prove that a
// caller can misuse it, which is true of every function here.
ok("A8 the lookup gives Step no override", movementFractionOverride("step", SKIT) === null,
  "Skitter names Crawl and nothing else");
equal("A8b so Step keeps its 5 ft",
  armedMoveLimit("step", 60, 0, movementFractionOverride("step", SKIT)), 5);
equal("A9 no feat, no change", crawl(60, []), 5);
equal("A10 a different feat is not this one", crawl(60, ["Fleet Footed"]), 5);
equal("A11 case and spacing are tolerated", crawl(30, [" skitter "]), 15);
// Graceful Step's flat bonus and Skitter's fraction are different tables
// and must not be confused with one another.
equal("A12 Graceful Step still lengthens Step", armedMoveLimit("step", 30, movementLimitBonus("step", ["Graceful Step"])), 10);
equal("A13 Graceful Step does nothing to Crawl", movementLimitBonus("crawl", ["Graceful Step"]), 0);
ok("A14 Skitter grants no flat bonus", movementLimitBonus("crawl", SKIT) === 0,
  "the two mechanisms must stay separate or a feat could collect both");

// The validator must report the same limit the arming UI shows.
const validated = validateArmedMove("crawl", {
  moveCost: 15, speed: 30, prone: true, fractionOverride: crawlOverride(SKIT)
});
equal("A15 a 15 ft crawl is allowed at Speed 30 with Skitter", validated.allowed, true);
equal("A16 and the validator's limit matches", validated.limit, 15);
const refused = validateArmedMove("crawl", { moveCost: 15, speed: 30, prone: true });
equal("A17 the same crawl is refused without the feat", refused.allowed, false);
// Crawl's own requirement is untouched: the feat lengthens the crawl, it
// does not let you crawl standing up.
equal("A18 Skitter does not waive the prone requirement",
  validateArmedMove("crawl", { moveCost: 5, speed: 30, prone: false, fractionOverride: crawlOverride(SKIT) }).allowed,
  false);

/* ================================================================== *
 * B. IMPROVED COMBAT REFLEXES
 * ================================================================== */

const ICR = ["Improved Combat Reflexes"];
const react = (o) => reactionsAtTurnStart(o);

equal("B1 without the feat the pool is just its max", react({ maxReactions: 1, dexterity: 4 }).value, 1);
equal("B2 with the feat, +Dex", react({ maxReactions: 1, dexterity: 4, featNames: ICR }).value, 5);
equal("B3 and the bonus is reported separately", react({ maxReactions: 1, dexterity: 4, featNames: ICR }).bonus, 4);
equal("B4 a larger base pool still gains it", react({ maxReactions: 3, dexterity: 2, featNames: ICR }).value, 5);
// A NEGATIVE DEX MUST NOT SHRINK THE POOL. The feat only ever adds, and a
// clumsy character with it should be no worse off than without.
equal("B5 a negative Dex adds nothing", react({ maxReactions: 1, dexterity: -3, featNames: ICR }).value, 1);
equal("B6 a zero Dex adds nothing", react({ maxReactions: 1, dexterity: 0, featNames: ICR }).value, 1);
equal("B7 a nonsense Dex adds nothing", react({ maxReactions: 1, dexterity: "lots", featNames: ICR }).value, 1);
// A lost reaction stays lost — the feat grants these "when you regain your
// actions", so a creature regaining none regains none of these either.
equal("B8 a lost turn grants nothing", react({ maxReactions: 1, dexterity: 4, featNames: ICR, reactionLost: true }).value, 0);
equal("B9 no feat, no bonus", react({ maxReactions: 1, dexterity: 4, featNames: [] }).bonus, 0);

// The Flat-Footed clause.
ok("B10 the feat permits an AoO while Flat-Footed", flatFootedOpportunityAllowed({ featNames: ICR }));
ok("B11 but only once a round", !flatFootedOpportunityAllowed({ featNames: ICR, usedThisRound: true }));
ok("B12 and not at all without it", !flatFootedOpportunityAllowed({ featNames: [] }));
// THE BASE FEAT IS REAL AND SEPARATE. This check first carried a comment
// saying Combat Reflexes did not exist; it does, and it is automated by
// an active effect rather than by code. What matters here is unchanged
// and now correctly stated: holding the BASE feat must not grant the
// IMPROVED one's Flat-Footed clause.
ok("B13 the base Combat Reflexes does not grant the Improved clause",
  !flatFootedOpportunityAllowed({ featNames: ["Combat Reflexes"] }),
  "the two are different feats and only the Improved one waives Flat-Footed");
// AND THE TWO COMPOSE. Combat Reflexes raises reactions.max by 1 through
// its own effect; this function reads that max and adds Dex on top. B4
// drives the composed case — a base pool already raised by the base feat.
equal("B13b base feat (max 2) plus Improved (+Dex 3) starts the turn on 5",
  react({ maxReactions: 2, dexterity: 3, featNames: ICR }).value, 5);

// THE BLOCK IT WAIVES MUST BE THE ONE IT NAMES. Read off the source of
// reactions.mjs rather than by importing `reactionBlockReason`, which is
// exported but called only inside its own file — importing it HERE made
// the uncalled-exports ratchet report that a genuine orphan had found a
// caller, and a harness must not be able to flatter the numbers it is
// measuring. (Same trap, and the same fix, as the TIME_LADDERS import in
// verify-chapter5-batch on 24 August.)
//
// What matters is that the constant the waiver compares against is the
// same value the block actually returns — if those two ever drift, the
// waiver silently stops matching and the feat quietly dies.
const reactSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/reactions.mjs"), "utf8");
ok("B14 the Flat-Footed block returns the named constant",
  /if \(flatFooted\) return FLAT_FOOTED_BLOCK;/.test(reactSrc),
  "a literal here would drift from the constant the waiver compares against");
ok("B15 Confused returns something else",
  /if \(confused\) return "Confused creatures cannot use Reactions";/.test(reactSrc));
ok("B16 Full Defence returns something else again",
  /if \(fullDefence\) return "Full Defence/.test(reactSrc));
ok("B16b and the constant is a non-empty string",
  typeof FLAT_FOOTED_BLOCK === "string" && FLAT_FOOTED_BLOCK.length > 10);
// Waiving the block must not waive the need for a reaction to spend.
equal("B17 a waived block still needs a reaction in the pool",
  reactorEligibility({ inCombat: true, reactions: 0, blockReason: null }).eligible, false);
equal("B18 with a reaction and no block, the AoO is on",
  reactorEligibility({ inCombat: true, reactions: 1, blockReason: null }).eligible, true);

/* ================================================================== *
 * C. BORN TO RIDE
 * ================================================================== */

const BTR = ["Born to Ride"];
const btr = (key, cost, feats = BTR) => oncePerRoundFreeAction(key, cost, feats);

ok("C1 Command an Animal is covered and its cost changes", btr("commandAnAnimal", "1").applies && btr("commandAnAnimal", "1").changes);
ok("C2 Stay in Saddle is covered — a Reaction saved", btr("stayInSaddle", "Reaction").changes);
// GUIDE WITH KNEES IS ALREADY FREE. The feat covers it, but applying it
// changes nothing — and must therefore NOT consume the round's one use,
// or a rider guiding with knees would silently lose the discount they
// were saving for Command an Animal.
ok("C3 Guide with Knees is covered", btr("guideWithKnees", "Free").applies);
ok("C4 but changes nothing, so spends nothing", !btr("guideWithKnees", "Free").changes);
ok("C5 a cost already at 0 likewise", !btr("commandAnAnimal", "0").changes);
// Scope.
ok("C6 an unrelated action is not covered", !btr("stride", "1").applies);
ok("C7 no feat, no cover", !btr("commandAnAnimal", "1", []).applies);
ok("C8 a different feat is not this one", !btr("commandAnAnimal", "1", ["Mount"]).applies);
ok("C9 the feat names itself for the card", btr("commandAnAnimal", "1").featName === "Born to Ride");
ok("C10 case and spacing are tolerated", btr("commandAnAnimal", "1", [" born to ride "]).changes);
ok("C11 cost matching ignores case", !btr("guideWithKnees", "FREE").changes);

/* ================================================================== *
 * D. The wiring — a rule with no caller is not automation (§5.1)
 * ================================================================== */

const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");
const moveWork = read("module/combat/movement-workflow.mjs");
const combatDoc = read("module/documents/combat.mjs");
const opp = read("module/combat/opportunity.mjs");
const actionWork = read("module/combat/action-workflow.mjs");

ok("D1 Skitter reaches the move validator",
  /fractionOverride: featMovementFraction\(actor, state\.armed\)/.test(moveWork));
// THE NUMBER SHOWN MUST BE THE NUMBER ENFORCED. The arming UI and the
// validator are two different call sites for one limit; if only one knew
// about the feat, a player would be shown 15 ft and stopped at 5.
ok("D2 and the arming UI shows the same limit",
  /armedMoveLimit\(armed, speed, featMovementBonus\(actor, armed\), featMovementFraction\(actor, armed\)\)/.test(moveWork));
ok("D3 Improved Combat Reflexes reaches the turn-start refill",
  // 3.578.0 (block 18, D10): a creature that cannot act gets none at all.
  /reactionsAtTurnStart\(\{/.test(combatDoc) && /const newReactions = acting\.canAct \? reactionState\.value : 0;/.test(combatDoc));
ok("D4 and reads the Dex MODIFIER, not the score",
  /dexterity: Number\(actor\.system\?\.attributes\?\.dexterity\?\.total \?\? 0\)/.test(combatDoc),
  "reading a raw score would grant roughly four times too many reactions");
ok("D5 the Flat-Footed waiver is applied where eligibility is decided",
  /function effectiveReactionBlock\(actor\)/.test(opp)
  && (opp.match(/blockReason: effectiveReactionBlock\(actor\)/g) ?? []).length === 2,
  "both the offer and the explain-why path must agree, or a card says one thing and does another");
ok("D6 the waiver is identified by constant, not by matching its prose",
  /raw !== FLAT_FOOTED_BLOCK/.test(opp));
ok("D7 the Flat-Footed allowance is spent only when an AoO is really taken",
  /const wasFlatFooted = actorReactionBlock\(reactor\) === FLAT_FOOTED_BLOCK;/.test(opp));
ok("D8 and given back when no attack happened",
  /if \(wasFlatFooted\) await reactor\.unsetFlag\(SYSTEM_ID, "flatFootedOpportunityUsed"\);/.test(opp),
  "a cancelled prompt must not cost the round's only Flat-Footed opportunity");
ok("D9 Born to Ride reaches the AP cost",
  /const bornToRide = oncePerRoundFreeAction\(action\.key, effectiveApCost, actorFeatNames\)/.test(actionWork));
ok("D10 and is spent at the point of commitment, not when the cost is worked out",
  actionWork.indexOf('await actor.setFlag(SYSTEM_ID, "bornToRideUsed", true)')
    > actionWork.indexOf("await spendActionCost(actor, effectiveApCost"),
  "marking it earlier would burn the round's use on an action that never happened");
// D11 FIRST ASSERTED THAT THE SENTENCE EXISTED, and a mutation that
// disabled the branch with `false &&` left the sentence sitting in the
// source and walked straight through. The literal proves nothing; the
// guard is the part that can be switched off. §5.3, and the same shape
// that got past D2 in the Grapple file on 23 August.
ok("D11 and says so on the card",
  /if \(bornToRideSpent\) \{\s*\n\s*lines\.push\(line\(/.test(actionWork)
  && /this round's one use/.test(actionWork),
  "an action that suddenly costs nothing looks like a bug unless it explains itself");

// EVERY per-round marker must clear at the round boundary. A stuck flag
// silently removes the feat for the rest of the fight, which is the
// quietest way for one of these to fail.
for (const flag of ["flatFootedOpportunityUsed", "bornToRideUsed"]) {
  ok(`D12 ${flag} is cleared at turn start`,
    new RegExp(`flags\\.\\$\\{SYSTEM_ID\\}\\.${flag}\`\\]: deletionValue\\(\\)`).test(combatDoc),
    "a marker that never resets is a feat that works once per campaign");
}

/* ================================================================== *
 * E. THE PACK, NOT AN ASSUMPTION ABOUT IT
 *
 * Improved Combat Reflexes adds Dex on top of `reactions.max`, and the
 * base Combat Reflexes is what raises that max — through an ACTIVE
 * EFFECT on the feat item, not through code. So the arithmetic in
 * section B rests on a fact about the DATA, and this reads the data.
 *
 * IT EXISTS BECAUSE THE ASSUMPTION WAS ALREADY WRONG ONCE. This batch
 * shipped with a comment asserting the base feat did not exist at all,
 * written from a grep of `module/` that could not see an active effect.
 * A claim about the pack belongs in a check that opens the pack.
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const featsDb = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "feats"), { valueEncoding: "json" });
await featsDb.open();
let baseFeat = null;
let baseReactionEffect = null;
let improvedFeat = null;
const featNamesInPack = [];
try {
  for await (const [key, value] of featsDb.iterator()) {
    const name = String(value?.name ?? "");
    // Collected in the SAME pass section E already makes. A second open
    // of the same database to ask a second question about it would be
    // two reads where one does.
    if (key.startsWith("!items!") && value?.type === "feat" && name) featNamesInPack.push(name);
    if (key.startsWith("!items!") && /^combat reflexes$/i.test(name)) baseFeat = value;
    if (key.startsWith("!items!") && /^combat reflexes, improved$/i.test(name)) improvedFeat = value;
    if (key.startsWith("!items.effects!") && /combat reflexes/i.test(name)) {
      const change = (value.changes ?? []).find((c) => c.key === "system.resources.reactions.max");
      if (change) baseReactionEffect = { name, change };
    }
  }
} finally {
  await featsDb.close();
}

ok("E1 the base Combat Reflexes feat is in the pack", Boolean(baseFeat),
  "section B's arithmetic assumes this feat raises the max it adds to");
ok("E2 and Improved Combat Reflexes is a SEPARATE feat", Boolean(improvedFeat),
  "one feat doing both jobs would make the Flat-Footed clause unconditional");
ok("E3 the base feat raises reactions.max by an active effect",
  Boolean(baseReactionEffect), "no code raises it — the effect is the whole mechanism");
equal("E4 by exactly 1", Number(baseReactionEffect?.change?.value), 1);
// mode 2 is Foundry's ADD. A mode that OVERRODE would make the base feat
// cap everyone at 1 reaction rather than granting one.
equal("E5 and it ADDS rather than overrides", Number(baseReactionEffect?.change?.mode), 2);

/* ================================================================== *
 * F. THE FEAT NAMES, READ OFF THE PACK
 *
 * ADDED AFTER THE LIVE PASS FOUND THIS BATCH'S ONE REAL DEFECT. The feat
 * is filed as "Combat Reflexes, Improved" — surname-first, so it sorts
 * beside its base feat — and 3.378.0 matched "improved combat reflexes",
 * which is what the PROSE calls it and what nothing in the data is
 * called. Improved Combat Reflexes did nothing whatsoever.
 *
 * The harness could not catch it, because the harness used the same
 * invented name the code did: the two agreed with each other and both
 * disagreed with the pack. A rule keyed to a name in the DATA has to be
 * checked against the data, exactly as the heritage checks are.
 * ================================================================== */

// Each feat this batch wires, by the name the PACK uses.
for (const name of ["Combat Reflexes, Improved", "Combat Reflexes", "Skitter", "Born to Ride"]) {
  ok(`F1 the pack holds "${name}"`, featNamesInPack.includes(name),
    "a rule keyed to a name that is not in the data is a rule that never fires");
}

// AND THE RULES ACTUALLY MATCH THOSE NAMES. This is the check that was
// missing: not "is the name in the pack" but "does the feat, named as the
// pack names it, switch the rule on".
// MATCHED PRECISELY. A first version of this looked for any feat whose
// name merely CONTAINED "improved" and found "Improved Initiative" — a
// loose match in the check that exists because of a loose match in the
// code would have been a poor joke.
const packName = (re) => featNamesInPack.find((n) => re.test(n));
const improvedName = packName(/^combat reflexes, improved$/i);
ok("F2 the pack's Improved Combat Reflexes grants its reactions",
  reactionsAtTurnStart({ maxReactions: 1, dexterity: 4, featNames: [improvedName] }).bonus === 4,
  `named "${improvedName}" in the pack — this is the check that went red on the live world`);
ok("F3 and waives the Flat-Footed block under that same name",
  flatFootedOpportunityAllowed({ featNames: [improvedName] }));
// The BASE feat must not pick up the Improved feat's clauses just because
// its name is a substring of the other's.
ok("F4 the base Combat Reflexes still grants neither",
  reactionsAtTurnStart({ maxReactions: 1, dexterity: 4, featNames: ["Combat Reflexes"] }).bonus === 0
  && !flatFootedOpportunityAllowed({ featNames: ["Combat Reflexes"] }),
  "the base feat's name is a prefix of the Improved one's — a loose match would grant both");
ok("F5 Skitter's pack name switches the crawl rule on",
  movementFractionOverride("crawl", [packName(/^skitter$/i)]) !== null);
ok("F6 Born to Ride's pack name switches its rule on",
  oncePerRoundFreeAction("commandAnAnimal", "1", ["Born to Ride"]).changes);

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\nverify-riding-reflexes-batch: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-riding-reflexes-batch: OK — ${checks} checks.\n`);
