#!/usr/bin/env node
/**
 * verify-cutting-words — the Bard's penalty reaches the action it was
 * cast at.
 *
 * NEW at 3.432.0, and the absence of this file until now is part of the
 * story: Cutting Words had a pure rules module, a workflow, a card hook
 * and a `selfApplying` flag, and no harness at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT — a promise with no keeper.
 *
 * Graham, 28 August 2026: "At the moment it just seems to leave a log on
 * the chat card for a friendly player."
 *
 * `flags.trg-prime.selfApplying` means "code resolves this, do not tell
 * the GM to apply it by hand". Its ONLY reader was `nonBasicSaveLine`,
 * which used it to SUPPRESS that advice. Nothing applied the penalty. The
 * cast card read "is affected", withheld the sentence that would have
 * told a GM to do it themselves, and the -3 went nowhere.
 *
 * The penalty had one applier: a button on the triggering check's card,
 * which needed the roller's token from `activeToken` — and that asked
 * `getActiveTokens(true)`, Foundry's LINKED parameter. Unlinked tokens
 * answer zero, and every monster is unlinked, so the button appeared on
 * linked actors' cards only. Hence "for a friendly player".
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING replaced the design: the trigger is a sentence at the
 * table, the Bard casts from their own sheet at an eligible enemy, and
 * the penalty WAITS on that creature until their next attack or skill
 * check spends it.
 *
 * Section F is therefore the one that would have caught the original:
 * it asks that something actually applies what `selfApplying` promises.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  CUTTING_WORDS_FLAG, CUTTING_WORDS_LADDER, CUTTING_WORDS_RANGE,
  cuttingWordsConsumes, cuttingWordsModifier, cuttingWordsPenalty,
  cuttingWordsRecord, cuttingWordsTargetEligibility, cuttingWordsTriggers,
  pendingCuttingWordsModifier
} from "../module/magic/cutting-words.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const rules = read("module", "magic", "cutting-words.mjs");
const flow = read("module", "magic", "cutting-words-workflow.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");
const check = read("module", "dice", "check.mjs");
const cards = read("module", "dice", "check-card-interactions.mjs");
const geometry = read("module", "combat", "geometry.mjs");


/**
 * "`a` appears before `b`" — in CODE, and with both actually present.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO TRAPS, AND THIS FILE FELL INTO BOTH ON ITS FIRST RUN.
 *
 *   - `String.indexOf` answers -1 for something absent, and -1 is less
 *     than every real index, so a naive `<` is satisfied by DELETING the
 *     thing that should come first.
 *   - AND COMMENTS COUNT AS TEXT. F6 compared the call to
 *     `#takeCuttingWords` against `buildOutcome` and failed, because a
 *     COMMENT inside `evaluate` explaining why the order matters
 *     mentions `buildOutcome` two lines earlier. G6 compared a call
 *     against `spendActionCost` and failed on the IMPORT at line 7.
 *
 * Both have been met before in this project — the import one three times.
 * Stripping comments and slicing the function first is the answer to all
 * of it.
 */
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
function before(body, a, b) {
  const clean = stripComments(body);
  const i = clean.indexOf(a);
  const j = clean.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}
/** One function's body, so a claim is about it and not about the file. */
function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  return start === -1 ? "" : src.slice(start);
}

/* ================================================================== *
 * A. THE LADDER RUNS THE OTHER WAY
 * ================================================================== */

// THIS IS THE TARGET'S SAVE, so a good roll for them is a small number
// for us. Reading it as the caster's ladder inverts the whole spell.
ok("A1 a Critical save shrugs it off", cuttingWordsPenalty("critical") === 0);
ok("A2 a Success still costs one", cuttingWordsPenalty("success") === -1);
ok("A3 a Failure costs two", cuttingWordsPenalty("failure") === -2);
ok("A4 a Fumble costs three", cuttingWordsPenalty("fumble") === -3);
// THE THREE DEGREES THE BOOK DOES NOT PRINT, answered the way every
// other save in the game answers them.
ok("A5 heroic resolves as a critical", cuttingWordsPenalty("heroic") === 0);
ok("A6 blunder resolves as a fumble", cuttingWordsPenalty("blunder") === -3);
ok("A7 partial resolves as a failure", cuttingWordsPenalty("partial") === -2);
// AN UNRESOLVED DEGREE IS NOT A SHRUG. Returning 0 would quietly refund
// the PP and the reaction the Bard already spent.
ok("A8 an unresolved degree takes the failure rung",
  cuttingWordsPenalty("") === -2 && cuttingWordsPenalty(undefined) === -2);
ok("A9 every rung is zero or negative",
  Object.values(CUTTING_WORDS_LADDER).every((v) => v <= 0),
  "a positive rung would mean the target's bad save HELPED them");

/* ================================================================== *
 * B. WHAT THE CAST LEAVES BEHIND
 * ================================================================== */

ok("B1 a failed save leaves a record",
  cuttingWordsRecord({ degree: "failure", casterName: "Grokash" })?.penalty === -2);
// A CRITICAL WRITES NOTHING AT ALL, rather than a zero. A stored 0 would
// look like an effect, be consumed by the next roll, and print a line
// saying nothing happened.
ok("B2 a Critical save records nothing",
  cuttingWordsRecord({ degree: "critical", casterName: "Grokash" }) === null);
ok("B3 the caster's name travels with it",
  cuttingWordsRecord({ degree: "fumble", casterName: "Grokash" })?.casterName === "Grokash",
  "by the time it lands the cast card has scrolled away");
ok("B4 and the round it was cast in",
  cuttingWordsRecord({ degree: "fumble", casterName: "G", round: 4 })?.round === 4);

/* ================================================================== *
 * C. WHICH ROLL SPENDS IT
 * ================================================================== */

ok("C1 an attack roll spends it", cuttingWordsTriggers("attack") === true);
ok("C2 a skill check spends it", cuttingWordsTriggers("skill") === true);
// THE PRINTED TRIGGER NAMES TWO THINGS AND NO OTHERS. Without this the
// waiting penalty is eaten by the first unrelated roll the target makes.
for (const other of ["save", "initiative", "flat", "spellcraft", "dying", "generic"]) {
  ok(`C3 a ${other} check does not`, cuttingWordsTriggers(other) === false);
}
const pending = cuttingWordsRecord({ degree: "failure", casterName: "Grokash" });
ok("C4 a real record on a named check is consumed", cuttingWordsConsumes("attack", pending) === true);
ok("C5 no record means nothing to consume", cuttingWordsConsumes("attack", null) === false);
ok("C6 a zero penalty is not consumed",
  cuttingWordsConsumes("attack", { penalty: 0 }) === false,
  "a record that does nothing must not be spent by a roll");
ok("C7 the right record on the wrong check is left alone",
  cuttingWordsConsumes("save", pending) === false);

/* ================================================================== *
 * D. THE MODIFIER IT BECOMES
 * ================================================================== */

const mod = pendingCuttingWordsModifier(pending);
ok("D1 it is a circumstance penalty", mod?.type === "circumstance",
  "highest-wins: two Bards cutting at one swing do not stack to -5");
ok("D2 carrying the rolled value", mod?.value === -2);
ok("D3 named with its caster", mod?.label === "Cutting Words (Grokash)");
ok("D4 and named plainly when there is no caster",
  pendingCuttingWordsModifier({ penalty: -1 })?.label === "Cutting Words");
ok("D5 nothing to add is null",
  pendingCuttingWordsModifier(null) === null && pendingCuttingWordsModifier({ penalty: 0 }) === null);
// ONE OWNER FOR THE TYPE. `cuttingWordsModifier` builds from a degree and
// this builds from a record; if they disagreed the pool would treat two
// castings of one spell as two different kinds of penalty.
ok("D6 both builders agree on the type",
  cuttingWordsModifier("failure")?.type === pendingCuttingWordsModifier(pending)?.type);

/* ================================================================== *
 * E. WHO MAY BE TARGETED
 * ================================================================== */

const near = { isEnemy: true, distance: 20, isSelf: false };
ok("E1 an enemy in range is eligible", cuttingWordsTargetEligibility(near).eligible === true);
// ENEMIES ONLY — Graham, 28 August 2026. The Targets line says "1
// creature", which is what let the old design offer this on every ally's
// card; the spell's own sentence says "the mind of your ENEMIES".
ok("E2 an ally is not", cuttingWordsTargetEligibility({ ...near, isEnemy: false }).eligible === false);
ok("E3 and says why", /not an enemy/.test(cuttingWordsTargetEligibility({ ...near, isEnemy: false }).reason));
ok("E4 the caster cannot cut at themselves",
  cuttingWordsTargetEligibility({ ...near, isSelf: true }).eligible === false);
ok("E5 range is enforced",
  cuttingWordsTargetEligibility({ ...near, distance: CUTTING_WORDS_RANGE + 1 }).eligible === false);
ok("E6 and the boundary is inclusive",
  cuttingWordsTargetEligibility({ ...near, distance: CUTTING_WORDS_RANGE }).eligible === true,
  "'range 30 feet' includes thirty");
// NULL IS A FAILURE TO ANSWER, NOT A PASS. Two tokens on different
// scenes have no distance between them.
ok("E7 no common scene is a refusal",
  cuttingWordsTargetEligibility({ ...near, distance: null }).eligible === false);

/* ================================================================== *
 * F. THE PROMISE `selfApplying` MAKES IS KEPT
 * ================================================================== */

// THE CHECK THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT. The flag
// suppresses the "apply by hand" advice; something must therefore apply
// it. Before 3.432.0 nothing did.
ok("F1 the cast records the penalty on the target",
  /recordCuttingWords\(target, \{/.test(cast),
  "selfApplying suppresses the by-hand advice, so code must keep that promise");
ok("F2 keyed on the flag rather than on the spell's name",
  /if \(spellAppliesItself\(spell\) && !saved\) \{/.test(cast),
  "the next spell of this kind should work without editing castSpell");
ok("F3 and only on a failed save", /&& !saved\) \{/.test(cast));
ok("F4 the cast card says where the penalty went",
  /circumstance penalty[\s\S]{0,80}next attack roll or skill check/.test(cast));

ok("F5 the check consumes a waiting penalty",
  /await this\.#takeCuttingWords\(\);/.test(check));
// BEFORE THE OUTCOME IS BUILT. `buildOutcome` reads `this.modifiers`, so
// a modifier pushed afterwards prints on the card and changes no degree.
// AND ITS LABEL PROMISED TWO THINGS WHILE ASSERTING ONE. Moving the call
// to sit BELOW the roll but still above `buildOutcome` left this green —
// found at 3.443.0 by a mutation that moved it rather than deleting it.
// The dice half is now asked for as well, because "before the dice are
// rolled" is the half a reader would rely on.
const cwEvaluate = bodyOf(check, "  async evaluate() {");
ok("F6 before the dice are rolled and the outcome built",
  before(cwEvaluate, "#takeCuttingWords", "this.#rollD20()")
  && before(cwEvaluate, "#takeCuttingWords", "buildOutcome"),
  "a modifier added after buildOutcome prints but does not change the degree");
ok("F7 and clears it, so it is spent once",
  /await consumeCuttingWords\(this\.actor\);/.test(check));
ok("F8 the modifier comes from the one builder",
  /pendingCuttingWordsModifier\(pending\)/.test(check),
  "the first attempt wrote the object by hand and faked a use of the builder");

/* ================================================================== *
 * G. THE OLD DESIGN IS GONE, AND THE HELPER IT BROKE ON IS FIXED
 * ================================================================== */

ok("G1 no Cutting Words button is drawn on anybody's check card",
  !/maybeAddCuttingWords/.test(cards),
  "Graham: it should be triggered only by the caster of the spell");
ok("G2 and the removal is recorded rather than silent",
  /NO CUTTING WORDS BUTTON HERE ANY MORE/.test(cards));

// THE MISREAD PARAMETER. `getActiveTokens(true)` asks for LINKED tokens
// and answers nothing for every monster in the game.
ok("G3 activeToken no longer demands a linked token",
  /return actor\?\.getActiveTokens\?\.\(\)\?\.\[0\] \?\? null;/.test(geometry),
  "unlinked tokens answered zero, which is every monster");
ok("G4 the misread is recorded where the next reader will meet it",
  /Foundry's first parameter is\n \* `linked`/.test(geometry));

// THE SIDE GATE IS ENFORCED BEFORE ANYTHING IS SPENT.
//
// RENAMED AT 3.443.1. It was `enemiesOnlyRefusal` and answered only to the
// word "enemies"; Counter Perform declared "allies" and the gate ignored
// it, so a Bard could shield a foe. One gate answers the side question for
// both spells now, and these three claims follow the new name.
ok("G5 the cast asks the refusal", /dispositionRefusal\(actor, spell, Array\.from\(game\.user\?\.targets/.test(cast));
ok("G6 before the PP and the reaction go",
  before(bodyOf(cast, "export async function castSpell"),
    "dispositionRefusal", "spendActionCost("),
  "a refusal must cost nothing");
// DECLARED, NOT NAME-KEYED (3.434.0). The 3.432.0 version matched
// `spell.name === "cutting words"` and said so in its own comment as the
// weak part of the fix. `areaTargeting: "enemies"` on a spell with no
// area is the declaration now, and it lives in `system` so the repair
// manifest reaches copies characters already own.
ok("G7 the gate is keyed on the spell's declaration, not its name",
  /const side = String\(system\.areaTargeting \?\? ""\)\.trim\(\)\.toLowerCase\(\);/.test(flow)
  && /side !== "enemies" && side !== "allies"/.test(flow)
  && !/spell\?\.name[\s\S]{0,60}CUTTING_WORDS_NAME/.test(flow),
  "a name match is a rule only its author can find");
// AND IT ANSWERS FOR BOTH SIDES, which is what 3.443.1 widened it for.
ok("G7c the side it read is the side it judges by",
  /side\n\s*\}\);/.test(flow) || /rangeFeet,\n\s*side\n/.test(flow),
  "reading the word and then not passing it on is the shape of an inert gate");
ok("G7b and only for a TARGETED spell",
  /if \(String\(system\.area \?\? ""\)\.trim\(\)\) return null;/.test(flow),
  "an area spell already filters by disposition when its template is placed");
ok("G7c reading the range from the spell rather than a constant",
  /parseRangeFeet\(String\(system\.range \?\? ""\)\)/.test(flow));
// DISPOSITION IS A FACT ABOUT A TOKEN — Graham, 18 August 2026 — and the
// rule has one owner rather than a second copy here.
ok("G8 the side test is imported, not rewritten",
  /import \{ sameSide \} from "\.\.\/combat\/aid-bonus\.mjs";/.test(flow)
  && !/function sameSide/.test(flow));
// AND CALLED WITH WHAT IT ACTUALLY TAKES.
//
// `sameSide(mine, theirs)` takes two dispositions as NUMBERS. 3.432.0
// passed the token objects, so `Number(token)` was NaN, it answered
// false for every pair, `!false` made every ally an enemy, and the gate
// refused nothing from the day it shipped. G8 passed throughout, because
// it asked only whether the function was imported.
//
// The lesson is the one this project keeps relearning: a check that the
// right function is REACHED says nothing about whether it is reached
// with the right arguments.
ok("G8b and handed dispositions rather than tokens",
  /sameSide\(casterToken\.document\?\.disposition, token\.document\?\.disposition\)/.test(flow),
  "Number(token) is NaN, and sameSide answers false for every pair it cannot read");

ok("G9 the flag has one name", /CUTTING_WORDS_FLAG = "cuttingWords"/.test(rules)
  && (flow.match(/CUTTING_WORDS_FLAG/g) ?? []).length >= 3);

/* ================================================================== */

const label = "verify-cutting-words";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
