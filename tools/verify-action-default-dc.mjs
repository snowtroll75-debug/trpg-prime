#!/usr/bin/env node
/**
 * verify-action-default-dc — an action whose consequence needs a degree
 * must be able to have one.
 *
 * NEW at 3.422.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT.
 *
 * Graham, 27 August 2026: "Using the Study Target action does not allow
 * you to add anything to Studied Targets."
 *
 * Study Target declares `against: "none"`. `actionTargetDC` answers
 * `dc: null`, the roll dialog opens on "Set by the GM (roll total only)",
 * and `buildOutcome` returns `degree: null` whenever there is no DC. The
 * whole Study Target consequence lives behind `if (degree)`, so the
 * action rolled, printed the capacity, and recorded nothing — every
 * time, for everyone.
 *
 * The card's "Set DC" box is not the way out. It recomputes the degree
 * and re-renders; it does not re-run the consequence. Driven live on
 * 3.421.0 the card ended up reading "Heroic — exceeds DC by 21" over an
 * empty studied-target list. A card asserting an outcome the system
 * never acted on is the UI form of a check that proves the wrong thing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS FILE READS THE WORKFLOW'S SOURCE.
 *
 * The list of degree-gated actions is not data anywhere — it is the set
 * of `action.key === "..."` branches in `resolveAction` that happen to
 * consult `degree`. Writing that list by hand into a table would make it
 * true today and stale the first time somebody adds an action.
 *
 * So section B derives it from the source and asserts every member can
 * reach a DC. That is the whole point: the next action of this shape
 * fails this check on the day it is written, rather than shipping inert
 * and being found in play eight months later.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  DEGREE_GATED_WITHOUT_DC, needsDefaultDC, defaultActionDC, defaultDCLabel,
  labelIsDefault, defaultDCCaption
} from "../module/combat/action-default-dc.mjs";
import { levelDC } from "../module/dice/resolution.mjs";
import { ACTION_CHECK_TYPES, actionTargetDC } from "../module/combat/action.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";
import { BASIC_ACTIONS } from "../module/data/basic-actions.mjs";
import { SPECIAL_ACTIONS } from "../module/data/special-actions.mjs";

const ALL_ACTIONS = [
  ...(SKILL_ACTIONS ?? []), ...(BASIC_ACTIONS ?? []), ...(SPECIAL_ACTIONS ?? [])
];
// A TARGET WITH EVERY DC AN ACTION MIGHT RESOLVE AGAINST, so E6 exercises
// the opposed actions rather than skipping them for want of a defender.
const TARGET_SHEET = {
  skills: {
    deception: { dc: 13 }, perception: { dc: 12 }, acrobatics: { dc: 11 },
    senseMotive: { dc: 12 }, diplomacy: { dc: 12 }, stealth: { dc: 12 },
    athletics: { dc: 12 }, thievery: { dc: 12 }, survival: { dc: 12 },
    intimidate: { dc: 12 }, medicine: { dc: 12 }, nature: { dc: 12 }
  },
  combat: {
    saves: { fortitude: { dc: 15 }, reflex: { dc: 14 }, will: { dc: 13 } },
    attack: { dc: 16 }, defence: { total: 14 }
  },
  identity: { level: 2 }
};

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const workflow = read("module", "combat", "action-workflow.mjs");
const actionsSrc = read("module", "data", "skill-actions.mjs");
const basicSrc = read("module", "data", "basic-actions.mjs");

/* ================================================================== *
 * A. The rule itself
 * ================================================================== */

ok("A1 Study Target falls back to a DC", needsDefaultDC("studyTarget", "none") === true);
ok("A2 Medium is the level-based DC unmodified",
  defaultActionDC({ actionKey: "studyTarget", against: "none", level: 5 }) === levelDC(5),
  `got ${defaultActionDC({ actionKey: "studyTarget", against: "none", level: 5 })}, levelDC(5) is ${levelDC(5)}`);
ok("A3 it scales with the character's level",
  defaultActionDC({ actionKey: "studyTarget", against: "none", level: 1 })
  !== defaultActionDC({ actionKey: "studyTarget", against: "none", level: 9 }));

// A DEFAULT MUST NEVER OVERRIDE A DECISION. This is the half that could
// silently break every targeted action in the game.
ok("A4 a resolved DC is never replaced",
  defaultActionDC({ actionKey: "studyTarget", against: "none", resolvedDC: 17, level: 5 }) === 17,
  "a target's Defence, a fixed DC and Learn a Spell's own band must all win");
ok("A5 a resolved DC of zero is still a decision",
  defaultActionDC({ actionKey: "studyTarget", against: "none", resolvedDC: 0, level: 5 }) === 0,
  "0 is falsy and a GM may legitimately set it — this must not be a truthiness test");

// AN ACTION THAT IS NOT LISTED GETS NOTHING, so a GM-set action with no
// degree-gated consequence keeps its "Set by the GM" default.
ok("A6 an unlisted action is left alone",
  defaultActionDC({ actionKey: "coerce", against: "none", level: 5 }) === null);
ok("A7 and an action with a real target is left alone",
  defaultActionDC({ actionKey: "studyTarget", against: "willDC", level: 5 }) === null,
  "the fallback is for actions with no DC source, not for every action");

ok("A8 the label names the rung and the arithmetic",
  /Medium/.test(defaultDCLabel(3)) && /3/.test(defaultDCLabel(3)),
  defaultDCLabel(3));

/* ================================================================== *
 * B. THE RATCHET — derived from the workflow's own source
 *
 * Every action branch that consults `degree` must be able to have one.
 * ================================================================== */

// The outcome section — which at 3.423.0 became a function of its own,
// `applyActionOutcome`, so that a degree settled after the roll could
// reach it. This check located it by the old inline anchor and failed
// loudly on the day it moved, which is the behaviour its own mutation
// #11 was written to guarantee: a derivation that cannot find its
// subject must fail, not quietly report an empty set.
const outcomeAt = workflow.indexOf("async function applyActionOutcome({");
ok("B1 the outcome section was located", outcomeAt > 0,
  "every derivation below would be empty and pass vacuously");
const outcome = workflow.slice(outcomeAt);

const degreeGated = new Set();
for (const m of outcome.matchAll(/action\.key === "(\w+)"/g)) {
  const window = outcome.slice(m.index, m.index + 2000);
  if (/\bdegree\b/.test(window)) degreeGated.add(m[1]);
}
ok("B2 the derivation found the degree-gated actions", degreeGated.size >= 15,
  `${degreeGated.size} found — the shape of resolveAction changed`);

/**
 * Every action's `against`, read from the two data tables.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PER BLOCK, NOT PER WINDOW, and the first version was the latter.
 *
 * It matched `key: "x"` and then the NEXT `against:` within three
 * thousand characters — so an action that declares no `against` of its
 * own silently took the FOLLOWING action's, and that action then got
 * nothing. Twenty-two of the thirty-one basic actions declare none, and
 * sixteen actions across the two tables came out wrong: Charge wore
 * Disarm's `attackDC`, Full Defence wore Grapple's `fortitudeDC`, and
 * Escape — which really is `none` — read as null.
 *
 * It happened not to change this file's verdict, because none of the
 * six listed actions was among the sixteen. That is luck, not
 * correctness: a mis-read `none` is exactly what B5 looks for, so the
 * next edit to those tables could have hidden a stranded action or
 * invented one.
 *
 * Found by `verify-checks-read-source`, which noticed that blanking
 * basic-actions.mjs changed nothing here — the table was read and never
 * depended upon, which is what sent anybody looking at all.
 */
const against = new Map();
for (const src of [actionsSrc, basicSrc]) {
  const keys = [...src.matchAll(/key:\s*"(\w+)"/g)];
  keys.forEach((match, index) => {
    const from = match.index;
    const to = index + 1 < keys.length ? keys[index + 1].index : src.length;
    const own = /against:\s*("(?:[^"]*)"|\[[^\]]*\])/.exec(src.slice(from, to));
    if (own && !against.has(match[1])) against.set(match[1], own[1].replace(/"/g, ""));
  });
}
ok("B3 the action tables were parsed", against.size > 80, `${against.size} actions read`);
// BOTH TABLES, NAMED. `verify-checks-read-source` found that blanking
// basic-actions.mjs changed nothing here: the skill table alone clears
// eighty, so the basic one was read and never depended upon. A basic
// action is named so the second table has to be there.
ok("B3b including the basic actions, not only the skill ones",
  ["disarmAttack", "grappleAttack", "shieldBash"].every((k) => against.has(k)),
  "these exist only in basic-actions.mjs and each declares its own against");

// An action escapes the list only by resolving a DC some other way, and
// the only such escape today is an explicit `resolved.dc =` override
// naming it. Named rather than assumed, so a future override has to be
// visible here too.
const overrides = new Set();
for (const m of workflow.matchAll(/action\.key === "(\w+)"[^\n]*\)\s*\{\s*\n\s*resolved\.dc =/g)) {
  overrides.add(m[1]);
}
ok("B4 Learn a Spell is recognised as setting its own DC", overrides.has("learnSpell"),
  "it declares against:\"none\" but overrides the DC from the spell's PP band");

const stranded = [...degreeGated].filter(
  (key) => against.get(key) === "none"
    && !DEGREE_GATED_WITHOUT_DC.includes(key)
    && !overrides.has(key)
).sort();
ok("B5 no degree-gated action can reach its roll without a DC",
  stranded.length === 0,
  `${stranded.join(", ")} would resolve to degree:null and apply nothing, silently`);

// AND THE LIST MUST NOT ROT IN THE OTHER DIRECTION. A key listed here
// that is no longer degree-gated, or has gained a target, is a default
// applied to an action nobody checked.
const spurious = DEGREE_GATED_WITHOUT_DC.filter(
  (key) => !degreeGated.has(key) || against.get(key) !== "none"
);
ok("B6 every listed action is still degree-gated and still has no target",
  spurious.length === 0,
  `${spurious.join(", ")} no longer need a fallback`);

ok("B7 Study Target is one of them", DEGREE_GATED_WITHOUT_DC.includes("studyTarget"));
// SIX, NOT EIGHT. The first draft of the list carried identifyPower and
// subsist, whose `degree` mentions are pre-roll branches rather than
// outcomes; B6 rejected them on this file's first run.
//
// TEN AT 3.565.0. Pages 91-96 gave coverTracks, gatherHerbs,
// disableADevice and pickLock outcomes that read the degree, and B5
// caught all four the moment they did. The number is asserted rather
// than bounded so that the list cannot grow by accident — every entry
// is a DC applied to an action nobody checked if it is wrong.
ok("B8 the list is the ten the outcome section actually contains",
  DEGREE_GATED_WITHOUT_DC.length === 10, `${DEGREE_GATED_WITHOUT_DC.length} listed`);

/* ================================================================== *
 * C. Wired into the workflow, once, after everything else has spoken
 * ================================================================== */

ok("C1 the workflow asks for a fallback DC", /defaultActionDC\(\{/.test(workflow));
ok("C2 it is handed the DC already resolved, so it can refuse to override",
  /defaultActionDC\(\{[\s\S]{0,200}resolvedDC: resolved\.dc/.test(workflow),
  "passing null here would make every target's Defence overridable");
// AFTER Learn a Spell's own override, or that band would be replaced.
ok("C3 after Learn a Spell has set its own",
  workflow.indexOf("learnSpellSetup.cost.dc") < workflow.indexOf("defaultActionDC({"),
  "ordering is the whole correctness argument for C2");

/* ================================================================== *
 * E. A SUGGESTION, NOT A WRITE
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS SECTION EXISTS FOR, found by driving 3.423.0 live and
 * by nothing in this file.
 *
 * The first version assigned the fallback straight onto `resolved.dc`.
 * That reads as harmless and is not: `finalDC` is
 * `situational?.dc ?? resolved.dc`, so a GM who deliberately chose "Set
 * by the GM (roll total only)" got a null out of the dialog, fell
 * through the `??` onto the default, and rolled against it anyway.
 *
 * Two things were wrong with that. The GM's explicit choice was
 * discarded — and `action-default-dc.mjs`'s own header promised it would
 * not be ("or switch back to Set by the GM deliberately"). It was
 * therefore the identical defect to the one that started this whole
 * thread: a comment describing an intention the code did not carry.
 *
 * It also made the 3.423.0 resume path unreachable for the six actions
 * that motivated it, since no card could ever be left awaiting a DC.
 * ================================================================== */

ok("E1 the fallback is never written onto the resolved DC",
  !/resolved\.dc = suggested/.test(workflow),
  "assigning it means a deliberate 'Set by the GM' falls through the ?? onto it");
ok("E2 it is offered to the dialog as a pre-fill",
  /dc: resolved\.dc \?\? suggestedDC/.test(workflow),
  "so the dialog opens on Fixed DC with a sensible number");
ok("E3 a GM who answered the dialog is obeyed, even when the answer was 'no DC'",
  /situational\s*\?\s*situational\.dc \?\? resolved\.dc\s*:\s*resolved\.dc \?\? suggestedDC/.test(workflow),
  "the suggestion applies only where nothing was asked");
// AND THE UNTOUCHED HALF. Inside the dialog branch the original `??`
// must survive, or a deliberate "unknown" would erase a target's Defence.
ok("E4 a deliberate 'unknown' still cannot erase a real target's DC",
  /situational\.dc \?\? resolved\.dc/.test(workflow),
  "that fallback predates this work and is not ours to change");
/*
 * E5 WAS A GREP FOR THE CONDITION, AND THE CONDITION WAS WRONG.
 *
 * It asserted that the workflow contained the literal text
 * `if (suggestedDC !== null && finalDC === suggestedDC)` — which it did,
 * for three releases, while that test was true for every action that
 * resolved a DC at all. `defaultActionDC` returns the resolved DC
 * unchanged when there is one, so `finalDC === suggestedDC` said nothing.
 *
 * 47 action cards carried "Medium (level N + 14)" over a DC that came
 * from somewhere else: Kip Up's fixed 20, Pierce Disguise's target
 * Deception DC, every opposed action in the book. Measured 6 Sep 2026.
 *
 * The check ran no rule. It read a line and agreed with it.
 */
ok("E5 the DC is named Medium only when this module supplied it",
  labelIsDefault({ resolvedDC: null, suggestedDC: 17, finalDC: 17 }) === true);
ok("E5b A RESOLVED DC KEEPS ITS OWN CAPTION",
  labelIsDefault({ resolvedDC: 20, suggestedDC: 20, finalDC: 20 }) === false,
  "a fixed DC 20 called \"Medium (level 3 + 14)\" describes a DC of 17");
ok("E5c and so does a target's DC",
  labelIsDefault({ resolvedDC: 13, suggestedDC: 13, finalDC: 13 }) === false);
ok("E5d a GM's own number gets no caption",
  labelIsDefault({ resolvedDC: null, suggestedDC: 17, finalDC: 22 }) === false,
  "the rule the old comment stated and the old condition did not test");
ok("E5e no suggestion, no caption",
  labelIsDefault({ resolvedDC: null, suggestedDC: null, finalDC: 17 }) === false);
ok("E5f and a resolved DC of zero is still resolved",
  labelIsDefault({ resolvedDC: 0, suggestedDC: 0, finalDC: 0 }) === false,
  "zero is a decision, which A5 already says about the DC itself");

/*
 * E6 THE WHOLE ACTION TABLE, ROLLED THROUGH THE RULE.
 *
 * The six that legitimately carry the caption are the six this module's
 * header names. Asserted as a SET rather than a count, so the next change
 * says which action moved rather than only that the number did.
 */
const captioned = [];
for (const a of ALL_ACTIONS) {
  const kind = (ACTION_CHECK_TYPES[a.checkType] ?? ACTION_CHECK_TYPES.none).checkType;
  if (!kind) continue;
  const res = actionTargetDC(a.against, TARGET_SHEET, a.fixedDC, { identity: { level: 3 } });
  const suggested = defaultActionDC({
    actionKey: a.key, against: a.against, resolvedDC: res.dc, level: 3 });
  const finalDC = res.dc ?? suggested;
  if (labelIsDefault({ resolvedDC: res.dc, suggestedDC: suggested, finalDC })) captioned.push(a.key);
}
ok("E6 ONLY THE SIX DEFAULTING ACTIONS ARE CAPTIONED",
  JSON.stringify(captioned.sort()) === JSON.stringify([...DEGREE_GATED_WITHOUT_DC].sort()),
  `captioned: ${captioned.sort().join(", ")} — 47 others carried it until 3.509.0`);

/*
 * E7 THE CAPTION ITSELF, because the workflow no longer decides anything.
 *
 * The first repair left an `if (labelIsDefault(...))` in the workflow and
 * its mutation SURVIVED — nothing in this harness can reach that file,
 * and the obvious patch was a grep asserting the call, which is what E5
 * was and how the defect shipped. So the workflow asks for a caption and
 * uses one if given; the decision lives here, where it can be run.
 */
ok("E7 A DEFAULTED DC IS CAPTIONED",
  defaultDCCaption({ resolvedDC: null, suggestedDC: 17, finalDC: 17, level: 3 })
    === "Medium (level 3 + 14)",
  String(defaultDCCaption({ resolvedDC: null, suggestedDC: 17, finalDC: 17, level: 3 })));
ok("E7b A RESOLVED ONE IS NOT",
  defaultDCCaption({ resolvedDC: 20, suggestedDC: 20, finalDC: 20, level: 3 }) === null,
  "there is nothing to overwrite \"Fixed DC\" with");
ok("E7c nor a DC the GM typed",
  defaultDCCaption({ resolvedDC: null, suggestedDC: 17, finalDC: 22, level: 3 }) === null);
ok("E7d the caption carries the character's own level",
  defaultDCCaption({ resolvedDC: null, suggestedDC: 24, finalDC: 24, level: 10 })
    === "Medium (level 10 + 14)");

/* ================================================================== *
 * D. The comment that described this all along
 * ================================================================== */

ok("D1 Study Target's own entry still claims the Medium default",
  /defaults\s*(?:\n\s*\/\/)?\s*to Medium \(Difficulty Modifier Table\)/.test(actionsSrc),
  "the comment described an intention nothing implemented — it is true now");

/* ================================================================== */

const label = "verify-action-default-dc";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
