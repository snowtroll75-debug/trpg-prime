#!/usr/bin/env node
/**
 * verify-action-skill-choice — an action that rolls a skill names one,
 * and one that offers several asks which.
 *
 * NEW at 3.593.0. Graham, 25 September 2026: "the Flowing Movement Basic
 * Action does not ask for a Skill. When selected, it should ask for a
 * skill. I would say that Athletics, Acrobatics and Climbing are the
 * three to be selected from."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IT WAS DOING INSTEAD.
 *
 * Flowing Movement declared `checkType: "skill"` and named NO skill.
 * Every other skill action carries a `skills` array and the workflow
 * reads `action.skills?.[0]`; with no array the key came out undefined,
 * `system.skills[undefined]` was undefined, and the check fell to its
 * fallback: a modifier list of one entry reading
 * `{ label: "Skill", value: 0 }`.
 *
 * So it rolled a BARE d20 against the DC, on a card headed "Flowing
 * Movement — Skill", with the character's Athletics nowhere in it. No
 * refusal, no warning. The card looked exactly like a check.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE FIX NEARLY SHIPPED UNREACHABLE.
 *
 * Giving the action its three skills is not enough, because
 * `useStaticAction` — the sheet path that runs a basic action — passed
 * `invokedSkillKey: action.skills?.[0]` unconditionally, and
 * `resolveAction` treats an invoked key as a decision already made.
 * Handing it the first skill is precisely what stops it asking. The
 * prompt would have existed, been correct, and never fired once.
 *
 * That is this project's most-repeated defect wearing its newest hat,
 * and section D is the check that would have caught it. It was found by
 * reading the call site rather than by any check, which is why the call
 * site now has one.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  actionNeedsSkillChoice, actionSkillChoices, actionSkillIsUnnamed
} from "../module/combat/action.mjs";
import { BASIC_ACTIONS } from "../module/data/basic-actions.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const eq = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
// COMMENTS STRIPPED. A comment about a prompt that never fires contains
// every word a grep for the prompt would look for.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const workflow = strip(read("module", "combat", "action-workflow.mjs"));
const sheet = strip(read("module", "sheets", "actor-sheet.mjs"));

/* ================================================================== *
 * A. THE RULE
 * ================================================================== */

{
  const three = { checkType: "skill", skills: ["athletics", "acrobatics", "climbing"] };
  const one = { checkType: "skill", skills: ["acrobatics"] };
  const bare = { checkType: "skill" };

  eq("A1 the offers are the array, in order",
    JSON.stringify(actionSkillChoices(three)),
    JSON.stringify(["athletics", "acrobatics", "climbing"]));
  eq("A1b a blank entry is not a choice",
    JSON.stringify(actionSkillChoices({ skills: ["athletics", "", "climbing"] })),
    JSON.stringify(["athletics", "climbing"]),
    "a nameless option resolves to no skill at all, which is the shape this rule ends");
  eq("A1c and a repeat is not two choices",
    JSON.stringify(actionSkillChoices({ skills: ["athletics", "athletics"] })),
    JSON.stringify(["athletics"]));
  eq("A1d an action with no array offers nothing", JSON.stringify(actionSkillChoices({})), "[]");

  ok("A2 MORE THAN ONE IS A QUESTION", actionNeedsSkillChoice(three));
  ok("A2b exactly one is not", !actionNeedsSkillChoice(one),
    "asking a question with one answer is a click for nothing");
  ok("A2c none is not a question either", !actionNeedsSkillChoice(bare),
    "there is nothing to offer; section A4 is what happens instead");
  ok("A2d A CALLER WHO ALREADY CHOSE IS NOT ASKED AGAIN",
    !actionNeedsSkillChoice(three, "climbing"),
    "the Ready dialog expands an action per skill, and Schooled in Secrets substitutes "
    + "Religion outright — both arrive having decided");
  ok("A2e a blank invoked key is not a decision",
    actionNeedsSkillChoice(three, "   "),
    "\"\" would otherwise read as a choice and silently take skills[0]");
  ok("A3 an action that rolls no skill is never asked about",
    !actionNeedsSkillChoice({ checkType: "attack", skills: ["a", "b"] }),
    "the array is meaningless on a check type that does not read it");

  ok("A4 AN ACTION THAT ROLLS A SKILL AND NAMES NONE IS A DATA FAULT", actionSkillIsUnnamed(bare));
  ok("A4b one that names some is not", !actionSkillIsUnnamed(three));
  ok("A4c and a non-skill action is not", !actionSkillIsUnnamed({ checkType: "none" }));
}

/* ================================================================== *
 * B. THE DATA
 * ================================================================== */

{
  const fm = BASIC_ACTIONS.find((a) => a.key === "flowingMovement");
  ok("B1 Flowing Movement is still there", Boolean(fm));
  eq("B2 IT NAMES GRAHAM'S THREE",
    JSON.stringify(actionSkillChoices(fm)),
    JSON.stringify(["athletics", "acrobatics", "climbing"]),
    "\"a check appropriate to one of the movement types involved\" — the three it is between");
  eq("B2b and it still declares a skill check", fm?.checkType, "skill");
  ok("B3 SO IT ASKS", actionNeedsSkillChoice(fm),
    "this is the whole request; if it ever reads false the feature is gone");

  /*
   * B4 IS THE INVARIANT THAT MAKES THE A4 GUARD WORTH HAVING. Flowing
   * Movement was the only action in this state and is now fixed, so the
   * guard protects against a FUTURE entry rather than a present one —
   * and a census is what keeps that true instead of hopeful.
   */
  const all = [...BASIC_ACTIONS, ...SKILL_ACTIONS];
  const unnamed = all.filter((a) => actionSkillIsUnnamed(a)).map((a) => a.name);
  eq("B4 NO SHIPPED ACTION ROLLS A SKILL IT CANNOT NAME", unnamed.join(", "), "",
    "Flowing Movement was the last one; a new name here is an action that would roll a bare d20");

  /*
   * B5 NAMES THE MULTI-SKILL ACTIONS rather than counting them. A bare
   * count going up says nothing about which action joined or whether it
   * wants a prompt; the names make that answerable from the check.
   */
  const multi = all.filter((a) => actionSkillChoices(a).length > 1).map((a) => a.name).sort();
  // THIRTEEN AT 3.620.0: Disable a Peril (Chapter 12, block 38's R17) is
  // Nature, Survival, Occultism or Religion — the peril's own skill.
  eq("B5 the actions that offer a choice are these thirteen",
    JSON.stringify(multi),
    JSON.stringify(["Aggravate", "Create", "Disable a Peril", "Earn Income", "Flowing Movement", "Identify Power",
      "Learn a Spell", "Recall Knowledge", "Research", "Spell Concentration", "Study Target",
      "Subsist", "Transfer Runes"]),
    "the other eleven are SKILL actions, invoked FROM a skill, so they arrive with the "
    + "choice already made and never reach the prompt");
}

/* ================================================================== *
 * C. THE PROMPT
 * ================================================================== */

ok("C1 THE WORKFLOW ASKS", /if \(actionNeedsSkillChoice\(action, invokedSkillKey\)\) \{/.test(workflow),
  "a rule nothing calls is the defect this file is named after");
ok("C1b and it asks with the action's own offers",
  /const choices = actionSkillChoices\(action\);/.test(workflow));
/*
 * C2 IS WHY IT IS ASKED WHERE IT IS. Schooled in Secrets settled this
 * shape: ask before the trait gate and before any AP, so a cancelled
 * question costs nothing.
 */
ok("C2 IT ASKS BEFORE ANY AP IS SPENT",
  workflow.indexOf("actionNeedsSkillChoice(action, invokedSkillKey)")
    < workflow.indexOf("const featActionModifiers = actionFeatModifiers("),
  "asking after the cost would charge a player for a question they then cancelled");
ok("C3 A CANCELLED QUESTION IS A CANCELLED ACTION",
  /if \(!picked \|\| picked === "cancel"\) return null;/.test(workflow),
  "falling through to a default roll would be the silent-wrong-skill defect again");
ok("C4 the chosen skill becomes the one the action rolls",
  /invokedSkillKey = String\(picked\);[\s\S]{0,120}?action = \{ \.\.\.action, skills: \[invokedSkillKey\] \};/
    .test(workflow),
  "setting the invoked key alone would leave `action.skills[0]` disagreeing with it");
ok("C5 a held modifier skips the question and takes the first offer",
  /if \(skipDialog\(event\)\) \{\s*\n?\s*invokedSkillKey = choices\[0\];/.test(workflow),
  "the convention this file already uses everywhere else");
ok("C6 THE PROMPT SHOWS WHAT EACH SKILL IS WORTH",
  /const total = Number\(skill\?\.total \?\? 0\);/.test(workflow)
  && /\$\{total >= 0 \? "\+" : ""\}\$\{total\}/.test(workflow),
  "choosing between three skills you cannot see the totals of is guessing");
ok("C7 an action that rolls a skill and names none is REFUSED OUT LOUD",
  /} else if \(actionSkillIsUnnamed\(action\)\) \{[\s\S]{0,300}?ui\.notifications\.warn\([\s\S]{0,120}?return null;/
    .test(workflow),
  "rolling a bare d20 is what hid this for as long as it hid");

/* ================================================================== *
 * D. THE CALL SITE THAT NEARLY MADE ALL OF THE ABOVE UNREACHABLE
 * ================================================================== */

ok("D1 THE SHEET DEFERS THE CHOICE INSTEAD OF MAKING IT",
  /invokedSkillKey: actionNeedsSkillChoice\(action\) \? null : \(action\.skills\?\.\[0\] \?\? null\),/
    .test(sheet),
  "passing skills[0] unconditionally is what would have stopped the prompt ever firing");
ok("D1b and it asks the rule rather than re-deriving it from the array",
  !/invokedSkillKey: \(action\.skills \?\? \[\]\)\.length === 1/.test(sheet)
  && /import \{ actionNeedsSkillChoice,/.test(sheet),
  "two places deciding one thing is how they come to disagree");
/*
 * D2 MEASURES THE ROUND TRIP rather than the source: what does the sheet
 * actually hand `resolveAction` for each shape of action? This is the
 * check that fails if either half drifts.
 */
{
  const handedTo = (a) => (actionNeedsSkillChoice(a) ? null : (a?.skills?.[0] ?? null));
  const fm = BASIC_ACTIONS.find((a) => a.key === "flowingMovement");
  const single = BASIC_ACTIONS.find((a) => actionSkillChoices(a).length === 1);
  eq("D2 A MULTI-SKILL ACTION REACHES THE WORKFLOW UNDECIDED", handedTo(fm), null,
    "null is what makes the workflow ask");
  ok("D2b while a single-skill action still arrives decided",
    single && handedTo(single) === actionSkillChoices(single)[0],
    `${single?.name} hands over ${JSON.stringify(handedTo(single))}`);
  ok("D2c and a checkless action hands over nothing either way",
    handedTo({ checkType: "none" }) === null);
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-action-skill-choice: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-action-skill-choice: OK — ${checks} checks. `
  + "Flowing Movement asks which skill, and the sheet lets it.\n");
