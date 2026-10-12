#!/usr/bin/env node
/**
 * verify-action-degrees — Mount/Dismount, and the DC nobody rolls against.
 *
 * NEW at 3.506.0. Two rulings of Graham's, 6 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "MOUNT/DISMOUNT SHOULD BE A ROLLABLE ACTION ONLY IF A COMBAT IS
 * RUNNING (SUCCESS OR FAILURE ONLY). OUTSIDE OF COMBAT IT SHOULD BE AN
 * AUTOMATIC SUCCESS."
 *
 * It had been `checkType: "none"`, which is why the PLAINS HERITAGE's
 * advantage on `["mountDismount", "expressRider", "guideWithKnees",
 * "stayInSaddle"]` had been three-quarters live and one-quarter inert
 * since it was written. Section H asserts that quarter now works, because
 * a rule that fixes something nobody asked about is exactly the kind that
 * gets undone by accident later.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "ANY MODIFIERS TO DISGUISE SHOULD BENEFIT THE DISGUISED CHARACTER SO
 * THE DC REQUIRED TO PIERCE THE DISGUISE SHOULD BE INCREASED."
 *
 * Self Mirage was inert twice over — scoped to a non-check action, and on
 * the wrong side of the roll besides. Section D asserts it reaches the
 * DC, and section N asserts what it must NOT reach: the caster's own
 * Deception checks. A `deception` slot bonus would have raised every
 * Bluff and Feint they make, which is the wrong spell.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";
import {
  rollsAsCheck, automaticSuccessLine, listedOutcomesFor,
  declaredDegree, bannerDisplay,
  unmatchedOutcomeLine
} from "../module/combat/action-degrees.mjs";
import { ACTION_CHECK_TYPES, actionTargetDC, pickOutcome, OUTCOME_KEYS } from "../module/combat/action.mjs";
import { DEGREES } from "../module/dice/resolution.mjs";
import {
  normaliseDefenceDC, isDefendableDC, DEFENCE_DC_KEYS, defenceDCRowFrom
} from "../module/combat/defence-dc.mjs";
import { SKILL_ACTION_KEYS } from "./lib/skill-action-keys.mjs";

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

const action = (key) => SKILL_ACTIONS.find((a) => a.key === key);
const mount = action("mountDismount");

// THE BOOK'S OWN LIST for an action, and the degree it resolves to.
const declaredOf = (a) => OUTCOME_KEYS.filter((k) => String(a?.outcomes?.[k] ?? "").trim());
const banner = (a, degree) => declaredDegree(declaredOf(a), degree, DEGREES);


/* ================================================================== *
 * M. MOUNT / DISMOUNT AS DECLARED
 * ================================================================== */

ok("M1 Mount/Dismount is a check at all now", Boolean(mount));
equal("M2 IT IS A SKILL CHECK", mount?.checkType, "skill",
  "it was `none`, so checkConfiguration returned null and no check was ever built");
equal("M2b through Handle Animal", JSON.stringify(mount?.skills), JSON.stringify(["handleAnimal"]));
equal("M3 against a flat DC 20", `${mount?.against}:${mount?.fixedDC}`, "fixed:20",
  "the number Kip Up, Nimble Crawl, Pain Tolerance, Treat Wounds and Sigil already use");
ok("M4 the DC resolves without a target",
  actionTargetDC(mount?.against, null, mount?.fixedDC, null).dc === 20,
  "a mount is not a target actor — a DC needing one would report missingTarget forever");
equal("M5 it declares the encounter gate", mount?.checkInEncounterOnly, true);
// M6 IT DECLARES NO DEGREE COUNT, because it does not need one — see
// section B. The field it carried until 3.510.0 said what its own
// outcome list already says.
ok("M6 it declares no degree count of its own", mount?.degrees === undefined);
equal("M6b and its outcome list is the two the book gives",
  JSON.stringify(declaredOf(mount)), JSON.stringify(["success", "failure"]));
// M7 THE OUTCOMES MATCH THE DEGREES IT CAN REPORT. An action that
// collapses to two and declares text for seven would print a line the
// die can never produce.
const declaredOutcomes = OUTCOME_KEYS.filter((k) => String(mount?.outcomes?.[k] ?? "").trim());
equal("M7 EXACTLY TWO OUTCOMES CARRY TEXT", JSON.stringify(declaredOutcomes),
  JSON.stringify(["success", "failure"]),
  "a binary action declaring a critical line would advertise a degree it cannot reach");
ok("M8 both are reachable through pickOutcome",
  pickOutcome("success", mount.outcomes).matched && pickOutcome("failure", mount.outcomes).matched);

/* ================================================================== *
 * G. THE ENCOUNTER GATE
 * ================================================================== */

ok("G1 IN AN ENCOUNTER IT ROLLS", rollsAsCheck(mount, { inEncounter: true }));
ok("G2 OUT OF ONE IT DOES NOT", rollsAsCheck(mount, { inEncounter: false }) === false);
ok("G2b and the default is the safe one",
  rollsAsCheck(mount, {}) === false && rollsAsCheck(mount) === false,
  "a missing encounter flag must not silently become a roll");
// G3 EVERY OTHER ACTION IS UNTOUCHED. The gate reads one declared field,
// so this is 96 pass-throughs and one rule — asserted rather than assumed,
// because a gate that accidentally caught everything would make the whole
// action list stop rolling out of combat and nothing else here would say so.
const gated = SKILL_ACTIONS.filter((a) => !rollsAsCheck(a, { inEncounter: false }));
equal("G3 ONLY MOUNT/DISMOUNT IS GATED", JSON.stringify(gated.map((a) => a.key)),
  JSON.stringify(["mountDismount"]));
ok("G4 the card says why there was nothing to roll",
  /succeeds automatically/i.test(automaticSuccessLine(mount) ?? ""),
  String(automaticSuccessLine(mount)));
ok("G4b and names the action", /Mount \/ Dismount/.test(automaticSuccessLine(mount) ?? ""));
ok("G5 an ungated action gets no such line",
  automaticSuccessLine(action("climb")) === null,
  "every other card would grow a sentence that is not true of it");

/*
 * G6 THE CARD SAID IT SUCCEEDED AND THEN OFFERED THE FAILURE LINE.
 *
 * Found live at 3.506.0, on Mount/Dismount's first card out of combat.
 * The no-check path prints every declared outcome, which is right for the
 * actions it was written for — they list their degrees because nothing
 * decided one — and wrong for an action that has definitely succeeded.
 *
 * The same mistake as the remainder line two releases ago: a sentence
 * added above a block that was not re-read. G4 asserted the new sentence
 * was there and asked nothing about what followed it.
 */
const mountListed = pickOutcome("success", mount.outcomes).listed;
equal("G6 AN AUTOMATIC SUCCESS PRINTS ONLY THE SUCCESS LINE",
  JSON.stringify(listedOutcomesFor(mount, mountListed).map((e) => e.key)),
  JSON.stringify(["success"]),
  "a Failure line beneath 'succeeds automatically' contradicts the line above it");
// G6b AND EVERY OTHER ACTION STILL PRINTS ALL OF THEM, which is the
// behaviour 21 no-check actions depend on.
const kip = action("kipUp");
ok("G6b an ungated action keeps every listed outcome",
  listedOutcomesFor(kip, pickOutcome("success", kip.outcomes ?? {}).listed).length
    === pickOutcome("success", kip.outcomes ?? {}).listed.length,
  "Avert Gaze and its neighbours list their degrees for the table to adjudicate");

/* ================================================================== *
 * B. THE TWO DEGREES
 * ================================================================== */

/*
 * MOUNT'S TWO DEGREES, NOW WITHOUT A FIELD SAYING SO.
 *
 * `collapsedDegree` and `degrees: "binary"` were deleted at 3.510.0: the
 * action prints Success and Failure, so the rulebook rule already answers
 * `success` for the three better degrees and `failure` for the four
 * worse ones. The equivalence was checked across all seven before the
 * deletion and is asserted here so it stays true.
 */
for (const better of ["heroic", "critical", "success"]) {
  equal(`B1:${better} counts as a success`, banner(mount, better), "success");
}
for (const worse of ["partial", "failure", "fumble", "blunder"]) {
  equal(`B2:${worse} counts as a failure`, banner(mount, worse), "failure");
}
// B3 AND NO OTHER ACTION IS FLATTENED. Climb prints five degrees and
// keeps all five; only the two it does not print are moved.
ok("B3 an action keeps every degree it prints",
  declaredOf(action("climb")).every((d) => banner(action("climb"), d) === d));
equal("B4 a null degree stays null", banner(mount, null), null,
  "an action that was never rolled must not report a failure");
ok("B5 no action declares a degree count of its own any more",
  SKILL_ACTIONS.every((a) => a.degrees === undefined),
  "the printed outcome list is the only place that says how many results there are");

/* ================================================================== *
 * A. THE BANNER SHOWS ONLY AVAILABLE RESULTS
 *
 * Graham's ruling, 6 September 2026. Measured before building: of the
 * 105 actions that roll a check, exactly TWO declare all seven degrees.
 * Mount/Dismount's card reading "Heroic" over an outcome card reading
 * "Success" was one of 103, not a one-off.
 *
 * THE DISPLAY MOVES AND THE DEGREE DOES NOT — his other ruling in the
 * same breath, "Chaos result for Mount is fine", settles that: a fumbled
 * Mount still fires Chaos, so it must still BE a fumble.
 * ================================================================== */


equal("A1 A HEROIC MOUNT READS AS A SUCCESS", banner(mount, "heroic"), "success");
equal("A1b and a fumbled one as a failure", banner(mount, "fumble"), "failure");
equal("A1c a blunder too", banner(mount, "blunder"), "failure");
// A2 THE ACHIEVED DEGREE IS UNCHANGED. Everything that reads it as a
// rule — the Chaos gate above all, which Graham kept — reads the real one.
// A2 THE ACTION'S DEGREE AND THE BANNER ARE NOW THE SAME WORD, resolved
// once. What is NOT resolved is the check's own result: Graham kept the
// Chaos Result for a fumbled Mount in the same breath as this ruling, so
// the dice still know they rolled a fumble.
equal("A2 the action's degree is the one the card shows",
  banner(mount, "fumble"), "failure");

// A3 A DECLARED DEGREE IS NEVER MOVED.
for (const key of declaredOf(action("climb"))) {
  equal(`A3:${key} a declared degree is shown as itself`, banner(action("climb"), key), key);
}
/* ── A4: THE LADDER ITSELF (3.545.0) ──────────────────────────────────
 *
 * THESE CHECKS ARE NEW BECAUSE THE OLD ONES ALL PASSED.
 *
 * The rule changed from "nearest declared degree on the same side, ties
 * to the milder" to Graham's declared ladder, and 77 of the banner
 * answers across the 101 actions changed with it — and this file went on
 * reporting 81 checks OK. Every case it asserted (Mount/Dismount's two
 * degrees, Climb's near neighbours) happens to agree under both rules.
 * A check whose examples all sit in the overlap measures the overlap.
 *
 * So the ladder is asserted as a TABLE, entry by entry, against a
 * fixture that declares nothing at all — which is the only way to see
 * where each chain terminates. */
const LADDER = [
  ["heroic", ["heroic", "critical", "success"]],
  ["critical", ["critical", "success"]],
  ["success", ["success"]],
  ["partial", ["partial", "failure"]],
  ["failure", ["failure"]],
  ["fumble", ["fumble", "failure"]],
  ["blunder", ["blunder", "fumble", "failure"]]
];

for (const [rolled, chain] of LADDER) {
  // Each step of the chain in turn: declare ONLY that step, and the
  // banner must land on it. Declaring one key at a time is what tells
  // "walks the chain" apart from "returns the terminal every time".
  for (const step of chain) {
    equal(`A4:${rolled}→${step} the ladder stops at the first declared step`,
      declaredDegree([step], rolled, DEGREES), step);
  }
  // And with NOTHING on the chain declared, the terminal stands anyway.
  equal(`A4:${rolled} terminates at ${chain[chain.length - 1]} when nothing on its chain is declared`,
    declaredDegree(["nonsense-but-non-empty"], rolled, DEGREES), chain[chain.length - 1],
    "a Failure with no text is still a Failure — the action fails and nothing happens");
}

/* A4b IS GRAHAM'S OWN EXAMPLE, 9 Sep 2026.
 *
 * "Not all actions display information for a failure (such as Treat
 * Wounds), but a Failure is always a Failure regardless." Treat Wounds
 * declares critical, success, partial and fumble; the old rule showed a
 * Failure as "Partial", announcing it as better than it was. */
const TREAT_WOUNDS = ["critical", "success", "partial", "fumble"];
equal("A4b A FAILURE ON TREAT WOUNDS READS AS A FAILURE",
  declaredDegree(TREAT_WOUNDS, "failure", DEGREES), "failure",
  "it declared no failure text, so the old rule borrowed the Partial sitting next door");
equal("A4b2 and its blunder still reads as a fumble",
  declaredDegree(TREAT_WOUNDS, "blunder", DEGREES), "fumble",
  "blunder → fumble → failure, and fumble IS declared");

/* A4c THE TWO MOVES NO DISTANCE FUNCTION MAKES.
 *
 * These are why the fallback is a table. Partial sits one step from
 * Fumble and Blunder two from Failure; the ladder ignores both facts. */
equal("A4c A PARTIAL DOES NOT FALL TO THE FUMBLE ONE STEP AWAY",
  declaredDegree(["critical", "success", "fumble"], "partial", DEGREES), "failure",
  "nineteen actions declare exactly this, and the mildest failure in the game was being "
  + "announced as a Fumble");
equal("A4c2 AND A BLUNDER SKIPS PARTIAL ENTIRELY",
  declaredDegree(["critical", "success", "partial"], "blunder", DEGREES), "failure",
  "the worst result in the game was being announced as the mildest");

/* A4d NOTHING IS EVER FLATTERED ON THE SUCCESS SIDE EITHER.
 *
 * One action declares Critical and nothing else, and the old rule showed
 * a plain Success as "Critical" — an upgrade, from a rule whose whole
 * premise was that it never announced a result as better than it was. */
equal("A4d A PLAIN SUCCESS IS NEVER SHOWN AS A CRITICAL",
  declaredDegree(["critical"], "success", DEGREES), "success");
equal("A4d2 while a heroic with no heroic text takes the critical",
  declaredDegree(["critical"], "heroic", DEGREES), "critical");
equal("A4d3 and falls through to success when neither is declared",
  declaredDegree(["failure"], "heroic", DEGREES), "success",
  "every action has a Success, declared or not");

/* ── A4e: WHAT THE CARD SAYS WHEN THERE IS NO TEXT (3.545.1) ──────────
 *
 * FOUND LIVE ON THE 3.545.0 TEST, on the very card the release was
 * written for. The banner read "Failure" correctly and the paragraph
 * underneath it said:
 *
 *   The action lists no failure outcome — the table adjudicates from
 *   the listed results:  Critical: regains 20...  Success: regains
 *   10...  Partial: regains 5...
 *
 * Three healing lines offered on a FAILED check. Half the rule had been
 * fixed and the other half still invited the table to pick a success.
 *
 * The rule lives in a pure function now for the same reason the banner
 * label does — it spent a release inline in `resolveAction` where no
 * check could reach it. */
equal("A4e A FAILURE WITH NO TEXT SAYS SO, AND OFFERS NOTHING",
  unmatchedOutcomeLine("failure", [{ key: "success", text: "regains 10" }]).line,
  "The action fails and nothing happens.",
  "Graham's ruling, in as many words");
equal("A4e2 AND DOES NOT PRINT THE LIST",
  unmatchedOutcomeLine("failure", [{ key: "success", text: "regains 10" }]).showList, false,
  "the list is what put three healing lines on a failed Treat Wounds");
equal("A4e3 a success with no text says it succeeded",
  unmatchedOutcomeLine("success", [{ key: "fumble", text: "takes 10" }]).line,
  "The action succeeds.",
  "Disguise and Conceal an Object declare outcomes but no success text; reciting the "
  + "failure lines at someone who passed is the same defect mirrored");
equal("A4e4 and an action declaring nothing gets no line at all",
  unmatchedOutcomeLine("failure", []).line, null,
  "those fall through to the action's description, as they always did");

/* A4f IS THE STRUCTURAL CLAIM THE BLOCK ABOVE RESTS ON.
 *
 * It handles `failure` and `success` and nothing else, and the reason is
 * not a fact about today's data — every fallback chain TERMINATES at one
 * of those two, so a resolved degree with no text can only be one of
 * them. Asserted rather than asserted-in-a-comment: measured across the
 * real actions, 83 unmatched failures and 4 unmatched successes. */
{
  const seen = new Set();
  for (const a of SKILL_ACTIONS) {
    const keys = declaredOf(a);
    if (!keys.length) continue;
    for (const key of OUTCOME_KEYS) {
      const shown = declaredDegree(keys, key, DEGREES);
      if (!pickOutcome(shown, a.outcomes ?? {}).matched) seen.add(shown);
    }
  }
  equal("A4f ONLY success AND failure CAN EVER LACK TEXT",
    JSON.stringify([...seen].sort()), JSON.stringify(["failure", "success"]),
    "if a third ever appears here the card falls back to the adjudication list, which is "
    + "the behaviour this release removed — so it must be noticed");
}

/*
 * A5 IS THE ONE THAT MATTERS MOST. A banner that turned a fumble into a
 * "Success" because the action declared no failure text would be the
 * worst possible version of this rule — worse than the mismatch it was
 * written to fix, because a player would act on it.
 *
 * Asserted across EVERY action and EVERY degree rather than on an
 * example, because the rule is a hard filter and one exception is all it
 * would take.
 */
const sideOf = (key) => DEGREES.find((d) => d.key === key)?.success;
let crossings = [];
for (const a of SKILL_ACTIONS) {
  for (const key of OUTCOME_KEYS) {
    const shown = banner(a, key);
    if (shown && sideOf(shown) !== sideOf(key)) crossings.push(`${a.key}:${key}→${shown}`);
  }
}
equal("A5 NO BANNER EVER CROSSES THE SUCCESS/FAILURE LINE",
  JSON.stringify(crossings), JSON.stringify([]),
  "a failure displayed as a success is a card the table would act on");

// A6 AN ACTION THAT DECLARES NOTHING IS LEFT ALONE, and so is a check
// rolled outside the action workflow, which carries no list at all.
ok("A6 no declared list, no change",
  OUTCOME_KEYS.every((k) => declaredDegree([], k, DEGREES) === k),
  "cutting those banners down would say less than the card says today");
ok("A6b an unknown degree key is passed through",
  declaredDegree(["success"], "nonsense", DEGREES) === "nonsense");
equal("A6c and a check with no degree stays without one",
  declaredDegree(["success"], null, DEGREES), null);

/* A7 WAS "TIES BREAK TOWARD THE MILDER DEGREE", and there are no ties
 * any more — the ladder is ordered, so nothing is equidistant. What the
 * old check was really protecting is kept: a fumble must not be
 * announced as worse than it was rolled. Under the ladder that follows
 * from the chain rather than from a tie-break. */
equal("A7 A FUMBLE IS NEVER ANNOUNCED AS A BLUNDER",
  declaredDegree(["success", "failure", "blunder"], "fumble", DEGREES), "failure",
  "fumble → failure; the declared Blunder sitting one rank below is not on its chain");

/*
 * A8 THE WORD, NOT ONLY THE KEY — and this is the defect the live test
 * found on the release that was supposed to fix the banner.
 *
 * `buildOutcomeDisplay` returned `degreeKey` and nothing else, and
 * `check-card.hbs` uses that only for the CSS class: the banner's TEXT
 * came from `outcome.degree.label`, which nothing had changed. The card
 * came out coloured as a Success with the word "Heroic" written on it.
 *
 * Every check in section A ran `bannerDegree` and passed. A check that
 * runs the rule but never the thing that renders it cannot catch a rule
 * wired to the wrong field, so the label is derived in the module and
 * asserted here.
 */
equal("A8 THE BANNER CARRIES THE WORD FOR ITS OWN DEGREE",
  bannerDisplay(declaredOf(mount), "heroic", DEGREES).label, "Success",
  "the card read \"Heroic\" while its own CSS class said success");
equal("A8b and the key beside it", bannerDisplay(declaredOf(mount), "heroic", DEGREES).key, "success");
equal("A8c a fumble reads Failure",
  bannerDisplay(declaredOf(mount), "fumble", DEGREES).label, "Failure");
equal("A8d an undeclared list leaves the word alone",
  bannerDisplay([], "heroic", DEGREES).label, "Heroic");
equal("A8e no degree, no word", bannerDisplay(declaredOf(mount), null, DEGREES).label, "");

/*
 * A9 THE TEMPLATE ACTUALLY RENDERS IT.
 *
 * A SOURCE ASSERTION, and said so plainly: a Handlebars template cannot
 * be executed here, so this reads the file. It is the weakest kind of
 * check in this project and it is here because the alternative — after a
 * live test found exactly this — is nothing at all. The binding it
 * guards is the one that was wrong.
 */
// READ THROUGH A STATIC `fs` IMPORT, like every other check that scans a
// file. The first version used `(await import("node:fs")).readFileSync`,
// and `verify-checks-read-source` B1 reported the pair VACUOUS: its
// blank-file harness patches the `fs` module the checks import, and a
// dynamic import slipped past it. A check the ratchet cannot blank is a
// check the ratchet cannot vouch for.
const cardTemplate = fs.readFileSync(
  path.join(SYSTEM_ROOT, "templates", "chat", "check-card.hbs"), "utf8");
ok("A9 the banner renders `degreeLabel`",
  /class="degree-label">\{\{degreeLabel\}\}/.test(cardTemplate),
  "the field the module derives, not the raw degree's own label");
ok("A9b and no longer renders the raw degree's label",
  !/degree-label">\{\{outcome\.degree\.label\}\}/.test(cardTemplate),
  "that binding is what printed \"Heroic\" over a Success-coloured card");

/* ================================================================== *
 * H. THE PLAINS HERITAGE QUARTER THAT WAS INERT
 * ================================================================== */

const plains = [];
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "heritages"), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, v] of db.iterator()) {
      if (v?.name !== "Plains") continue;
      // ON THE FLAG, NOT ON `system`. `collectConditionals` reads
      // `flags["trg-prime"].conditionals`, and my first version of this
      // check read `system.conditionals` — which does not exist, found
      // nothing, and would have passed the moment the list was empty.
      for (const c of v?.flags?.["trg-prime"]?.conditionals ?? []) {
        plains.push(...(c?.when?.actions ?? []));
      }
    }
  } finally { await db.close().catch(() => {}); }
}
ok("H1 the Plains heritage still names mountDismount", plains.includes("mountDismount"),
  JSON.stringify(plains));
// H2 IS THE POINT OF THIS SECTION. Every action that heritage names must
// be one that produces a check, or the grant is partly inert again — and
// nothing in the system said so for the whole time it was.
const inert = plains.filter((key) => {
  const a = action(key);
  return !a || !(ACTION_CHECK_TYPES[a.checkType] ?? ACTION_CHECK_TYPES.none).checkType;
});
equal("H2 EVERY ACTION IT NAMES IS A CHECK", JSON.stringify(inert), JSON.stringify([]),
  "a grant scoped to a non-check action can never apply, and only this says so");

// H3 AND THE GENERAL RULE, so the next one is caught the day it is
// written rather than by a live test months later.
const nonCheck = SKILL_ACTION_KEYS.filter((key) => {
  const a = action(key);
  return a && !(ACTION_CHECK_TYPES[a.checkType] ?? ACTION_CHECK_TYPES.none).checkType;
});
equal("H3 exactly one declared skill action is not a check",
  JSON.stringify(nonCheck), JSON.stringify(["disguise"]),
  "Disguise is 10 minutes of work and no roll; the roll is the observer's Pierce Disguise. "
  + "If this list grows, check what is scoped to the newcomer before shipping it");

/* ================================================================== *
 * D. SELF MIRAGE ON THE DC SIDE
 * ================================================================== */

const spells = new Map();
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, v] of db.iterator()) if (v?.type === "spell") spells.set(v.name, v);
  } finally { await db.close().catch(() => {}); }
}

const mirage = (spells.get("Self Mirage")?.system?.effects ?? [])[0];
equal("D1 SELF MIRAGE RAISES A DC", mirage?.kind, "defenceDC",
  "as a conditional it was inert twice over — a non-check action, and the wrong side of the roll");
equal("D2 the Deception DC specifically", mirage?.dc, "skillDC:deception",
  "the string Pierce Disguise's own `against` carries, so no new comparison is needed anywhere");
equal("D3 against Pierce Disguise", JSON.stringify(mirage?.actions), JSON.stringify(["pierceDisguise"]));
equal("D4 the printed +4", Number(mirage?.value), 4);
equal("D4b as a status bonus", mirage?.bonusType, "status");
ok("D5 pierceDisguise is a real action key", SKILL_ACTION_KEYS.includes("pierceDisguise"));
equal("D5b and it does resolve against the Deception DC",
  action("pierceDisguise")?.against, "skillDC:deception",
  "the entry and the action must name the same DC or the bonus meets nothing");
// D6 THE ROW THE APPLIER BUILDS, not the row the pack carries. The pack
// row spells its scope `actions` at the top level, the way every other
// spell effect row spells its own fields; `normaliseDefenceDC` reads
// `when.actions`, because that is the vocabulary the conditional engine
// established. The applier translates between them, and it is the
// TRANSLATED row that has to survive — asserting the pack row directly
// was checking a shape nothing downstream ever sees.
const mirageEntry = normaliseDefenceDC({
  dc: mirage?.dc, value: mirage?.value, label: mirage?.label,
  scope: mirage?.scope, when: { actions: mirage?.actions }
}, { id: "spell", name: "Self Mirage" });
ok("D6 the row the applier builds survives the defence-DC normaliser",
  Boolean(mirageEntry), JSON.stringify(mirage));
equal("D6b and keeps the action it defends against",
  JSON.stringify(mirageEntry?.actions), JSON.stringify(["piercedisguise"]),
  "lower-cased by the normaliser, and defenceDCBonus lower-cases the incoming key to meet it");
ok("D7 a skill DC is a DC a defender may raise", isDefendableDC("skillDC:deception"));
ok("D7b and the five original keys still are",
  DEFENCE_DC_KEYS.every((k) => isDefendableDC(k)));
ok("D7c but not a malformed one",
  !isDefendableDC("skillDC:") && !isDefendableDC("bananaDC") && !isDefendableDC(""));

/* ================================================================== *
 * N. WHAT IT MUST NOT DO
 * ================================================================== */

// N1 THE ALTERNATIVE THAT WAS REFUSED. A `deception` slot bonus would
// have raised the DC — and every Bluff, Feint and Create a Diversion the
// caster rolls for the duration, which the book does not grant.
ok("N1 SELF MIRAGE GRANTS NO WHOLE-SKILL DECEPTION BONUS",
  !(spells.get("Self Mirage")?.system?.effects ?? [])
    .some((e) => e.kind === "bonus" && e.slot === "deception"),
  "the caster's own Bluff and Feint are not raised by a disguise");
ok("N2 nor is it still a conditional on a roll that never happens",
  !(spells.get("Self Mirage")?.system?.effects ?? []).some((e) => e.kind === "conditional"));
// N3 THE SCOPE IS COMPULSORY. An entry naming no action would raise the
// DC against everything resolved against that skill, silently.
// N3 THE NORMALISER ALREADY REFUSES AN UNSCOPED ENTRY, which I had
// assumed it merely tolerated. Asserted at the level it actually holds:
// a DC bonus that names nothing would raise that DC against every action
// resolved against it, silently, which is the Stone Shield shape.
ok("N3 AN UNSCOPED DC ENTRY IS REFUSED OUTRIGHT",
  normaliseDefenceDC({ dc: "skillDC:deception", value: 4 }, {}) === null,
  "an entry naming no action would raise the DC against everything");
ok("N3b and a malformed DC key is refused by the normaliser too",
  normaliseDefenceDC({ dc: "skillDC:", value: 4, when: { actions: ["x"] } }, {}) === null
  && normaliseDefenceDC({ dc: "bananaDC", value: 4, when: { actions: ["x"] } }, {}) === null,
  "the key check must hold where entries are actually built, not only in isDefendableDC");

/*
 * N4 THE APPLIER'S GUARDS, RUN RATHER THAN GREPPED.
 *
 * This check used to assert that the refusal sentence appeared in
 * `spell-effects.mjs`. A mutation changing `if (!dcActions.length)` to
 * `if (false)` left the sentence exactly where it was and survived — the
 * third time this system has recorded a check that cannot catch its own
 * assertion being neutered. The decision now lives in `defenceDCRowFrom`,
 * which is pure, and this runs it.
 */
equal("N4 A DC BONUS NAMING NO ACTION IS REFUSED",
  defenceDCRowFrom({ dc: "skillDC:deception", value: 4 }, "Test").row, null);
ok("N4b and says so out loud",
  /naming what against/.test(defenceDCRowFrom({ dc: "skillDC:deception", value: 4 }, "Test").error ?? ""));
equal("N4c an unknown DC is refused", defenceDCRowFrom({ dc: "bananaDC", value: 4, actions: ["x"] }, "Test").row, null);
ok("N4d and names the DC it did not recognise",
  /bananaDC/.test(defenceDCRowFrom({ dc: "bananaDC", value: 4, actions: ["x"] }, "Test").error ?? ""));
const goodRow = defenceDCRowFrom(mirage, "Self Mirage");
ok("N4e SELF MIRAGE'S OWN ROW IS BUILT WITHOUT COMPLAINT",
  Boolean(goodRow.row) && goodRow.error === null, JSON.stringify(goodRow));
equal("N4f and carries the scope onto the entry",
  JSON.stringify(goodRow.row?.when?.actions), JSON.stringify(["pierceDisguise"]));
equal("N4g a warp raises the value", defenceDCRowFrom(mirage, "Self Mirage", 2).row?.value, 6,
  "the same warp channel every other bonus-carrying effect kind uses");

if (failures.length) {
  process.stderr.write(`verify-action-degrees: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-action-degrees: OK — ${checks} checks. Mount/Dismount rolls only in an encounter and `
  + "in two degrees; Self Mirage raises the DC that Pierce Disguise is rolled against.\n");
