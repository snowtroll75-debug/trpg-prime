#!/usr/bin/env node
/**
 * verify-sustain-spell — one rule, two doors, one implementation.
 *
 * NEW at 3.424.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT.
 *
 * Graham, 27 August 2026:
 *
 *   "1. The Sustain a Spell action on the Actions tab deducts an AP,
 *    creates an entry on the chat card but does nothing else.
 *    2. The sustain button on the magic tab actually sustains the spell,
 *    but does not deduct an AP."
 *
 * Two doors onto one rule, each performing the half the other did not.
 * Between them they were a correct Sustain; separately, one charged for
 * nothing and the other gave it away.
 *
 * `sustainASpell` appeared exactly ONCE in the whole system — in its own
 * data entry. Nothing read the key. As a `checkType: "none"` action,
 * `resolveAction` checked the AP, spent it, and posted the printed
 * description, and there was no handler to do anything further. The
 * button was real, its cost was real, and its effect had never been
 * written. The Magic tab meanwhile called `sustainActiveSpell`, the
 * storage primitive, which knows nothing of actions or AP.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SO THE CHECKS THAT MATTER ARE THE ONES ABOUT OWNERSHIP.
 *
 * Section D is the point of this file: exactly one place spends the AP,
 * exactly one place extends the duration, and both doors reach the rule
 * rather than the primitive. A second implementation is how these two
 * came to disagree in the first place.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SUSTAIN_AP_COST, SUSTAIN_TRAITS, sustainRefusal, resolveSustainTarget
} from "../module/magic/sustain.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
// NOT READ AS TEXT. `verify-checks-read-source` found this file
// reading magic/sustain.mjs into a variable nothing used — a scan
// that could not have failed. The module is covered properly by
// sections A-C, which import its functions and exercise them, and
// that is the better test: it checks what the rule DOES rather than
// what its source happens to say.
const flow = read("module", "magic", "sustain-workflow.mjs");
const actions = read("module", "combat", "action-workflow.mjs");
const sheet = read("module", "sheets", "actor-sheet.mjs");
const data = read("module", "data", "special-actions.mjs");


/**
 * The body of a named function, paren-aware so a destructured parameter
 * list is not mistaken for the body.
 *
 * ORDERING CLAIMS MUST BE SCOPED TO A BODY. The first draft of D2-D4
 * compared `flow.indexOf(...)` across the WHOLE FILE, and every one of
 * those names appears in the import block at the top — so the check was
 * comparing the order of imports, not of calls. Two of them failed
 * immediately and the third passed for the wrong reason, which is worse.
 * The same mistake as 3.423.2's C2, made again three hours later.
 */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  let i = source.indexOf("(", start);
  if (i < 0) return "";
  let parens = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === "(") parens += 1;
    else if (source[i] === ")") { parens -= 1; if (!parens) { i += 1; break; } }
  }
  const open = source.indexOf("{", i);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < source.length; j += 1) {
    if (source[j] === "{") depth += 1;
    else if (source[j] === "}") { depth -= 1; if (!depth) return source.slice(open, j + 1); }
  }
  return "";
}

const sustainBody = functionBody(flow, "export async function sustainSpellAction(actor,");

const sustained = (id, name, extra = {}) =>
  ({ id, name, sustained: true, sustainType: "duration", ...extra });
const locked = (id, name) => ({ id, name, sustained: false, lock: "dailyPrep" });

/* ================================================================== *
 * A. The printed cost and traits
 * ================================================================== */

ok("A1 a Sustain costs 1 AP", SUSTAIN_AP_COST === "1", `got ${SUSTAIN_AP_COST}`);
ok("A2 as a string, which is what the action pipeline speaks",
  typeof SUSTAIN_AP_COST === "string",
  "spendActionCost parses a cost; a number here would be a different code path");
ok("A3 and carries the Concentrate trait", SUSTAIN_TRAITS === "Concentrate");
ok("A4 matching the action's own data entry",
  /key: "sustainASpell"[\s\S]{0,200}apCost: "1"/.test(data)
  && /key: "sustainASpell"[\s\S]{0,120}traits: "Concentrate"/.test(data),
  "the cost is printed in two places and they must not drift");

/* ================================================================== *
 * B. THE REQUIREMENTS, which were enforced nowhere at all
 *
 * "You have at least one spell active with a sustained duration, and
 * you are not fatigued."
 * ================================================================== */

ok("B1 a caster with nothing running is refused",
  typeof sustainRefusal({ entries: [], name: "Vex" }) === "string");
ok("B2 and told what is missing",
  /sustained duration/.test(sustainRefusal({ entries: [], name: "Vex" })),
  "a refusal with no reason is one a player retries three times");
ok("B3 a fatigued caster is refused",
  /Fatigued/.test(sustainRefusal({ entries: [sustained("a", "Haste")], fatigued: 1, name: "Vex" })));
// FATIGUE IS REPORTED FIRST. A fatigued caster holding three sustained
// spells should hear the thing actually stopping them.
ok("B4 fatigue is reported ahead of the spell list",
  /Fatigued/.test(sustainRefusal({ entries: [], fatigued: 2, name: "Vex" })),
  "with neither requirement met, the actionable one is named");
ok("B5 a rested caster with something running is allowed",
  sustainRefusal({ entries: [sustained("a", "Haste")], fatigued: 0, name: "Vex" }) === null);
// A PP-LOCKED SPELL IS NOT A SUSTAINED ONE. It runs, and it shows on the
// Magic tab, but its duration is not measured in turns.
ok("B6 a merely PP-locked spell does not make a Sustain possible",
  typeof sustainRefusal({ entries: [locked("b", "Arcane Lock")], name: "Vex" }) === "string",
  "nothing to sustain — its duration is not counted in turns");
ok("B7 fatigue 0 is not fatigue", sustainRefusal({ entries: [sustained("a", "X")], fatigued: 0 }) === null);

/* ================================================================== *
 * C. WHICH SPELL — the only thing the two doors legitimately differ on
 * ================================================================== */

const three = [sustained("a", "Haste"), sustained("b", "Bless"), locked("c", "Lock")];

ok("C1 the Magic tab's named spell is used directly",
  resolveSustainTarget(three, "b")?.entry?.name === "Bless");
ok("C2 a named spell that is not sustainable is refused",
  resolveSustainTarget(three, "c") === null,
  "clicking a PP-locked row must not sustain it");
ok("C3 a named spell that does not exist is refused",
  resolveSustainTarget(three, "zzz") === null);
// ONE CANDIDATE IS NOT A CHOICE.
ok("C4 a caster with one running spell is not asked",
  resolveSustainTarget([sustained("a", "Haste"), locked("c", "Lock")])?.entry?.name === "Haste",
  "a dialog with one row is a click that can only be answered one way");
ok("C5 a caster with several is asked",
  (resolveSustainTarget(three)?.ask ?? []).length === 2,
  "and only the sustainable ones are offered");
ok("C6 with nothing running, there is nothing to resolve",
  resolveSustainTarget([]) === null && resolveSustainTarget([locked("c", "Lock")]) === null);

/* ================================================================== *
 * D. ONE OWNER — the section this file exists for
 * ================================================================== */

// THE AP IS SPENT IN EXACTLY ONE PLACE.
ok("D0 the workflow function was located", sustainBody.length > 400,
  "every ordering claim below would compare -1 against -1 and pass");
ok("D1 the sustain workflow spends the action cost",
  /spendActionCost\(actor, SUSTAIN_AP_COST/.test(sustainBody));
ok("D2 and checks the AP is there first",
  sustainBody.indexOf("ensureActionPoints") < sustainBody.indexOf("spendActionCost"),
  "a refused sustain must cost nothing");
// REQUIREMENTS BEFORE THE SPEND, and the picker before it too.
ok("D3 the requirements are checked before anything is spent",
  sustainBody.indexOf("sustainRefusal(") < sustainBody.indexOf("ensureActionPoints"),
  "the same order Repair's kit check uses");
ok("D4 the spell is chosen before anything is spent",
  sustainBody.indexOf("promptSustainChoice(") < sustainBody.indexOf("ensureActionPoints"),
  "cancelling the picker must cost nothing");

// BOTH DOORS REACH THE RULE.
ok("D5 the Actions tab routes the action to the workflow",
  /action\.key === "sustainASpell"[\s\S]{0,400}sustainSpellAction\(actor\)/.test(actions),
  "the key appeared exactly once in the system before this — in its own data entry");
ok("D6 the Magic tab's button reaches the same function",
  /sustainSpellAction\(this\.actor, \{ spellId:/.test(sheet));
ok("D7 and no longer calls the storage primitive directly",
  !/sustainActiveSpell\(this\.actor/.test(sheet) && !/^import \{[^}]*sustainActiveSpell/m.test(sheet),
  "that primitive knows nothing about actions, AP or the printed requirements");

// THE ACTION MUST NOT PAY TWICE. Its branch has to return before the
// generic checkType:"none" path spends the cost itself.
const branchAt = actions.indexOf('action.key === "sustainASpell"');
const genericSpendAt = actions.indexOf('if (!(await ensureActionPoints(actor, action.apCost, action.name, { traits: action.traits }))) return null;\n    if (preparedPaysFor)');
ok("D8 both positions were located", branchAt > 0 && genericSpendAt > 0,
  `branch@${branchAt} genericSpend@${genericSpendAt}`);
ok("D9 the action's branch returns before the generic AP spend",
  branchAt < genericSpendAt,
  "one action paying twice would be a worse defect than the one being fixed");
ok("D10 and it returns rather than falling through",
  /action\.key === "sustainASpell"[\s\S]{0,400}return null;\n    \}/.test(actions));

// THE DURATION IS EXTENDED IN EXACTLY ONE PLACE.
ok("D11 only the workflow extends the sustain",
  /sustainActiveSpell\(actor, entry\.id/.test(flow));
ok("D12 and the storage primitive has no other caller in a sheet or action",
  !/sustainActiveSpell\(/.test(sheet) && !/sustainActiveSpell\(/.test(actions),
  "a second caller is how these two came to disagree");

/* ================================================================== */

const label = "verify-sustain-spell";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
