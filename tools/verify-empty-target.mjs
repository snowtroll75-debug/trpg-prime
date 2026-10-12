#!/usr/bin/env node
/**
 * verify-empty-target — the picker warns before an empty selection.
 *
 * NEW at 3.450.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 1 September 2026: "If nothing ticked, best route would
 * be to prompt with a warning before allowing to continue."
 *
 * FOUND BY DRIVING 3.449.0. Continue with no box ticked cast the spell,
 * spent the PP and printed "seersVision effect — no target to apply to".
 * The card was honest; the player had still paid for nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION W IS THE ONE THAT MATTERS, and it is not "does the sentence
 * exist" but "is the warning REACHED, and can the player still say yes".
 * A warning that refused would break the 3.286.0 repair — clearing every
 * target is how a stale one is undone — and would be the silent removal
 * Graham's ruling of 27 August 2026 forbids, wearing a different hat.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  warnsOnEmptySelection, selectedTargetIds, EMPTY_SELECTION_WARNING
} from "../module/combat/target-prompt.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * Is `a` present, and before `b`?
 *
 * BOTH HALVES, and the first half is why this exists. W3 was written as a
 * bare `indexOf(a) < indexOf(b)` and a mutation that DELETED the cancel
 * guard survived it: `indexOf` answers -1 for a string that is not there,
 * and -1 is before everything. An ordering claim about a statement that
 * has been removed is not a weaker claim, it is a false one — the same
 * trap as matching text a mutation leaves sitting in dead code, wearing
 * arithmetic instead of a string.
 */
function before(haystack, a, b) {
  const i = haystack.indexOf(a);
  const j = haystack.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  // PAST THE PARAMETER LIST FIRST. `promptTargetSelection`'s options are
  // destructured with defaults, so the first `{` after the signature is
  // the parameter object and not the body — a naive scan returned it and
  // every W check "passed" against the wrong text.
  let cursor = start + signature.length - 1;
  if (src[cursor] === "(") {
    let parens = 0;
    for (; cursor < src.length; cursor += 1) {
      if (src[cursor] === "(") parens += 1;
      else if (src[cursor] === ")") { parens -= 1; if (parens === 0) break; }
    }
  }
  const open = src.indexOf("{", cursor);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  return "";
}

/* ================================================================== *
 * R. WHEN THE WARNING IS OWED
 * ================================================================== */

ok("R1 nothing ticked out of several offered warns",
  warnsOnEmptySelection(0, 4) === true);
ok("R2 one ticked does not", warnsOnEmptySelection(1, 4) === false);
ok("R3 nor does every row ticked", warnsOnEmptySelection(4, 4) === false);
// AN EMPTY SCENE ALREADY RETURNS WITHOUT A DIALOG. Warning that nobody
// was ticked when nobody could be is a sentence about the system, not
// about the player's choice.
ok("R4 NOTHING OFFERED NEVER WARNS", warnsOnEmptySelection(0, 0) === false,
  "there was no choice to get wrong");
ok("R5 rubbish does not warn",
  warnsOnEmptySelection(undefined, 4) === false
  && warnsOnEmptySelection(0, undefined) === false
  && warnsOnEmptySelection("x", "y") === false);

/* ================================================================== *
 * F. THE SHAPE THE FORM ACTUALLY RETURNS
 *
 * 3.450.0's warning was correct, imported, called — and could never
 * fire, because it was handed the number of ROWS instead of the number
 * of creatures. `FormDataExtended` answers with one entry per checkbox
 * and `null` for every unticked one.
 *
 * THESE ARE THE SHAPES MEASURED LIVE in Graham's world on 1 September
 * 2026, not shapes I imagined the form might produce. That distinction
 * is the whole reason this section exists: the previous checks asserted
 * everything about this rule except the one thing that was wrong.
 * ================================================================== */

ok("F1 NOTHING TICKED IS NOT AN EMPTY ARRAY",
  selectedTargetIds([null, null, null, null]).length === 0,
  "four unticked rows came back as four nulls, and length 4 read as four choices");
ok("F2 one ticked out of four is one",
  JSON.stringify(selectedTargetIds([null, "bbb", null, null])) === '["bbb"]');
ok("F3 two ticked keep their order",
  JSON.stringify(selectedTargetIds([null, "bbb", "ccc", null])) === '["bbb","ccc"]');
// A SINGLE CHECKBOX CAN COME BACK BARE.
ok("F4 a lone value is not iterated as characters",
  JSON.stringify(selectedTargetIds("solo")) === '["solo"]');
ok("F5 nothing at all is nothing",
  selectedTargetIds(undefined).length === 0 && selectedTargetIds(null).length === 0);
ok("F6 and rubbish rows are dropped",
  JSON.stringify(selectedTargetIds([false, "", "  ", 0, "id"])) === '["id"]');

// THE JOIN: the count the warning is asked about must be the count this
// function produces, driven end to end rather than asserted separately.
ok("F7 A FULL SLATE OF NULLS WARNS",
  warnsOnEmptySelection(selectedTargetIds([null, null, null, null]).length, 4) === true,
  "this is the exact case that shipped broken");
ok("F7b and one real choice does not",
  warnsOnEmptySelection(selectedTargetIds([null, "bbb", null, null]).length, 4) === false);

/* ================================================================== *
 * S. WHAT IT SAYS
 * ================================================================== */

ok("S1 it says nothing is ticked", /ticked/i.test(EMPTY_SELECTION_WARNING));
ok("S2 and that the cost is still spent", /cost/i.test(EMPTY_SELECTION_WARNING));
ok("S3 and that nothing is affected", /no creature will be affected/i.test(EMPTY_SELECTION_WARNING));
// THREE CALLERS SPEND THREE DIFFERENT THINGS. A sentence promising "the
// PP" would be false for a weapon attack and a thrown flask — the Grapple
// defect in miniature, asserted by the interface this time.
ok("S4 AND IT NAMES NO SPECIFIC COST",
  !/\bPP\b|\bAP\b|power point|action point/i.test(EMPTY_SELECTION_WARNING),
  "this dialog serves spells, attacks and thrown items alike");

/* ================================================================== *
 * W. IS IT REACHED, AND CAN THE PLAYER STILL SAY YES?
 * ================================================================== */

const picker = read("module", "combat", "targeting.mjs");
const clean = strip(picker);
const body = bodyOf(picker, "export async function promptTargetSelection(");
ok("W0 the picker's body was found", body.length > 0);
ok("W0b and reaches its real code",
  body.includes("DialogV2.wait({") && body.includes("game.user.updateTokenTargets"));

const loop = strip(body);
ok("W1 THE WARNING IS ASKED FOR",
  loop.includes("warnsOnEmptySelection(result.length, ordered.length)"),
  "the rule is imported but never consulted is exactly how this defect shipped");
// AND THE COUNT IT IS ASKED ABOUT IS A REAL ONE. `result` is whatever the
// Continue callback returned; if that is the raw form value, its length
// is the row count and the warning is dead on arrival.
ok("W1b and the callback returns only the ticked ids",
  loop.includes("return selectedTargetIds(new FDE(form).object.target);"),
  "3.450.0 returned the raw array, so result.length was always ordered.length");
ok("W2 and it is asked AFTER the dialog answers",
  before(loop, "DialogV2.wait({", "warnsOnEmptySelection("),
  "there is nothing to warn about before the player has chosen");
// A CANCEL IS NOT AN EMPTY SELECTION. Backing out of the picker must
// return false and never reach the warning.
ok("W3 a cancel still returns before the warning",
  before(loop, 'result === "cancel") return false;', "warnsOnEmptySelection("),
  "cancelling is not the same as confirming nobody");

ok("W4 THE PLAYER MAY STILL SAY YES",
  loop.includes('confirmEmptySelection(title) === "continue") break;'),
  "a warning that refused would break the 3.286.0 repair and be a silent removal");
ok("W5 and saying no reopens rather than cancels",
  loop.includes("for (;;) {"),
  "sending a player back to the start of their action makes the warning a punishment");

const confirmBody = bodyOf(picker, "async function confirmEmptySelection(");
ok("W6 the warning dialog was found", confirmBody.length > 0);
ok("W6b it prints the shared sentence, not a retyped one",
  confirmBody.includes("${EMPTY_SELECTION_WARNING}"),
  "two places stating one warning is how they come to disagree");
ok("W7 it offers both answers",
  confirmBody.includes('action: "back"') && confirmBody.includes('action: "continue"'));
// A STRAY ENTER MUST NOT SPEND THE SPELL.
ok("W8 GOING BACK IS THE DEFAULT",
  /action: "back"[^}]*default: true/.test(confirmBody),
  "the safe answer is the one a stray Enter gives");
ok("W9 and dismissing the warning is not agreeing with it",
  confirmBody.includes("rejectClose: false")
  && confirmBody.includes('return answer === "continue" ? "continue" : "back";'),
  "closing a warning is not consent");

/* ================================================================== *
 * C. EVERY CALLER OF THIS PICKER WANTS A TARGET
 *
 * That is what makes one unconditional rule safe. Area spells must keep
 * their own door out, or every area cast would be warned at for a
 * selection it never needed.
 * ================================================================== */

const cast = strip(read("module", "magic", "cast-workflow.mjs"));
// ANCHORED ON THE PREDICATE, NOT THE WHOLE LINE (3.495.0). The gate
// grew a second conjunct in that release — Spell Storing skips the
// picker, because a stored spell's targets are chosen at the release —
// and this check failed on the punctuation rather than on anything it
// cares about. What it asserts is that the gate ASKS whether the spell
// names creatures; a mutation removing the question still breaks it.
ok("C1 AREA SPELLS NEVER REACH THE PICKER",
  cast.includes("if (spellNeedsTarget(spellData)"),
  "their template decides who is caught; warning them would be noise");
ok("C2 and the picker is inside that gate",
  before(cast, "if (spellNeedsTarget(spellData)", "promptTargetSelection(actor, {"));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-empty-target: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-empty-target: OK — ${checks} checks. The player is warned, and may still say yes.\n`);
