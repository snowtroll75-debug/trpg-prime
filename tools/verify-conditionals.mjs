#!/usr/bin/env node
/**
 * verify-conditionals — the engine that decides which bonuses reach a roll.
 *
 * NEW at 3.415.0, and it should have existed years of releases ago: this
 * module answers "what modifies this check" for every roll in the game
 * and had no harness of its own. `verify-ward` checked one caller's use
 * of it; nothing checked the engine.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION F IS WHY THIS FILE EXISTS.
 *
 * `sourceUuids` shipped at 3.406.0. `matchesCheck` has read it on every
 * roll since. NOTHING HAS EVER SUPPLIED IT — neither the automatic path
 * in dice/check.mjs nor the dialog in apps/check-dialog.mjs put a
 * `sourceUuid` in the context — so the test ran against an empty list,
 * returned false, and every uuid-scoped conditional matched nothing for
 * nine releases. Forbidding Ward's "+1 to saving throws against that
 * enemy" never once applied.
 *
 * IT SURVIVED BECAUSE ITS OTHER HALF WORKED. A ward writes two flags for
 * one printed sentence: DB down `defence-dc.mjs`, saves down this engine.
 * `attack-workflow.mjs` hands the DB channel the attacker's uuid, so that
 * half was right and visible in play. `ward.mjs` exists precisely to keep
 * the two halves consistent, and its harness proves they AGREE — same
 * value, same scope, same label. Agreement is not delivery. Both halves
 * agreed perfectly and one of them went nowhere.
 *
 * So section F does not check a value. It checks REACHABILITY: every axis
 * the engine reads must be a key some call site actually writes. It is
 * the same shape as verify-speed-pool's migration-gate check, and it
 * exists for the same reason — a thing can be perfectly correct and
 * completely unreachable, and no test of its correctness will ever say so.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SCOPE_AXES, AXIS_CONTEXT_KEYS, normaliseConditional, matchesCheck,
  automaticSelections, conditionalRows, resolveBias
} from "../module/conditionals.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const A = "Scene.aaa.Token.AAA";
const B = "Scene.aaa.Token.BBB";
const src = (f) => fs.readFileSync(path.join(SYSTEM_ROOT, ...f), "utf8");

const entry = (when, extra = {}) => normaliseConditional(
  { kind: "modifier", value: 1, type: "status", label: "T", when, ...extra },
  { id: "t", name: "T", kind: "effect" }, 0);

/* ================================================================== *
 * A. The axis table
 * ================================================================== */

ok("A1 every axis has a context key", SCOPE_AXES.every((a) => AXIS_CONTEXT_KEYS[a]));
ok("A2 no context key is declared for an axis that does not exist",
  Object.keys(AXIS_CONTEXT_KEYS).every((a) => SCOPE_AXES.includes(a)),
  Object.keys(AXIS_CONTEXT_KEYS).filter((a) => !SCOPE_AXES.includes(a)).join(", "));
ok("A3 both uuid axes are present", SCOPE_AXES.includes("sourceUuids")
  && SCOPE_AXES.includes("targetUuids"));
// AND BOTH TYPE AXES (3.567.0). The pairing is the point: two questions
// ("who provokes" / "who is aimed at") across two granularities ("a
// category" / "that one creature") is four axes, and for three releases
// only three of the four existed. A rule about a CATEGORY the roll is
// AIMED AT had nowhere honest to go.
ok("A4 both type axes are present", SCOPE_AXES.includes("sourceTypes")
  && SCOPE_AXES.includes("targetTypes"));

/* ================================================================== *
 * B. The mirror axis (3.415.0)
 * ================================================================== */

const against = entry({ checkTypes: ["attack"], targetUuids: [A] });
ok("B1 a target-scoped entry matches a roll aimed at that creature",
  matchesCheck(against, { checkType: "attack", targetUuid: A }) === true);
ok("B2 and not one aimed at somebody else",
  matchesCheck(against, { checkType: "attack", targetUuid: B }) === false);
// AN UNAIMED ROLL IS NOT A MATCH, and that is the correct answer rather
// than the cautious one — applying it would penalise every swing at
// everybody, the Stone Shield defect with the sign flipped.
ok("B3 and not a roll aimed at nobody",
  matchesCheck(against, { checkType: "attack" }) === false);
ok("B4 a uuid's case is not folded", matchesCheck(
  entry({ targetUuids: ["Scene.AbC.Token.DeF"] }),
  { targetUuid: "scene.abc.token.def" }) === false,
  "a Foundry uuid is case-sensitive; folding it matches the wrong creature");
ok("B5 the two uuid axes are independent",
  matchesCheck(entry({ sourceUuids: [A], targetUuids: [B] }),
    { sourceUuid: A, targetUuid: B }) === true
  && matchesCheck(entry({ sourceUuids: [A], targetUuids: [B] }),
    { sourceUuid: A, targetUuid: A }) === false,
  "a rule may name both, and both must hold");
ok("B6 a plural context key works too",
  matchesCheck(against, { checkType: "attack", targetUuids: [B, A] }) === true);
ok("B7 an entry naming no target axis is unaffected by one",
  matchesCheck(entry({ checkTypes: ["attack"] }), { checkType: "attack", targetUuid: A }) === true);
// EXCLUSIONS LIVE UNDER `when.not`, not at the top level — the first
// version of this check put them at the top level, where they are
// silently ignored, and it failed. Worth keeping as written: an
// exclusion authored in the wrong place produces an entry that applies
// everywhere, which is the opposite of what its author meant.
ok("B8 a target exclusion refuses that creature",
  matchesCheck(entry({ checkTypes: ["attack"], not: { targetUuids: [A] } }),
    { checkType: "attack", targetUuid: A }) === false);
ok("B9 and still applies to everyone else",
  matchesCheck(entry({ checkTypes: ["attack"], not: { targetUuids: [A] } }),
    { checkType: "attack", targetUuid: B }) === true);

/* ================================================================== *
 * H. THE TYPE MIRROR (3.567.0) — Chapter 5's Dracoris
 *
 * "+1 racial bonus to all interactions with creatures of the Wyrm type."
 * Graham's ruling of 17 September 2026 fixed "all interactions" to the
 * four social skills, which leaves the hard half: a bonus scoped to what
 * the check is AIMED AT, by category. `sourceTypes` is the wrong axis and
 * would have been the wrong answer QUIETLY — firing when a Wyrm attacked
 * the Dracoris and never when the Dracoris spoke to one.
 * ================================================================== */

const wyrm = entry({ checkTypes: ["skill"], subjects: ["diplomacy"], targetTypes: ["wyrm"] },
  { auto: true });

ok("H1 a type-scoped entry matches a check aimed at that kind of creature",
  matchesCheck(wyrm, { checkType: "skill", subject: "diplomacy", targetTypes: ["wyrm"] }) === true);
ok("H2 and not one aimed at something else",
  matchesCheck(wyrm, { checkType: "skill", subject: "diplomacy", targetTypes: ["humanoid"] }) === false);
// THE ONE THAT MAKES IT A RULE RATHER THAN A FLAT BONUS. A Diplomacy
// check with nothing targeted is not an interaction with a Wyrm, and
// matching it would turn "+1 against Wyrms" into "+1 to Diplomacy".
ok("H3 and not a check aimed at nobody",
  matchesCheck(wyrm, { checkType: "skill", subject: "diplomacy" }) === false);
// THE WHOLE REASON THE AXIS EXISTS. If these two were one axis, the
// Dracoris would get the bonus when a Wyrm breathed on it — and the
// failure would be invisible, because a bonus that appears is never
// questioned as hard as one that does not.
ok("H4 the two type axes are not the same axis",
  matchesCheck(wyrm, { checkType: "skill", subject: "diplomacy", sourceTypes: ["wyrm"] }) === false,
  "a Wyrm attacking a Dracoris is not a Dracoris talking to a Wyrm");
ok("H5 and a source-typed entry is not fed by the target",
  matchesCheck(entry({ checkTypes: ["save"], sourceTypes: ["undead"] }),
    { checkType: "save", targetTypes: ["undead"] }) === false,
  "Thengar's +1 is against undead attacks, not against undead in general");
ok("H6 a creature holding several types matches on any of them",
  matchesCheck(wyrm, { checkType: "skill", subject: "diplomacy", targetTypes: ["beast", "wyrm"] }) === true);
ok("H7 the comma-separated string shape is read too",
  matchesCheck(wyrm, { checkType: "skill", subject: "diplomacy", targetTypes: "Beast, Wyrm" }) === true,
  "a creature's system field is a string; only some callers have split it");
ok("H8 a target type's case is folded",
  matchesCheck(wyrm, { checkType: "skill", subject: "diplomacy", targetTypes: ["WYRM"] }) === true,
  "unlike a uuid, a creature type is a word and the pack capitalises it");
ok("H9 a target-type exclusion refuses that kind",
  matchesCheck(entry({ checkTypes: ["skill"], not: { targetTypes: ["wyrm"] } }),
    { checkType: "skill", targetTypes: ["wyrm"] }) === false
  && matchesCheck(entry({ checkTypes: ["skill"], not: { targetTypes: ["wyrm"] } }),
    { checkType: "skill", targetTypes: ["humanoid"] }) === true);

/* ================================================================== *
 * C. The axis that was dead — sourceUuids, restored
 * ================================================================== */

const ward = entry({ checkTypes: ["save"], subjects: ["will"], sourceUuids: [B] }, { auto: true });
ok("C1 a ward matches a save forced by the warded creature",
  matchesCheck(ward, { checkType: "save", subject: "will", sourceUuid: B }) === true);
ok("C2 and not one forced by anybody else",
  matchesCheck(ward, { checkType: "save", subject: "will", sourceUuid: A }) === false);
ok("C3 and not an unattributed save",
  matchesCheck(ward, { checkType: "save", subject: "will" }) === false);
// AND IT MUST REACH THE AUTOMATIC PATH. A ward's save half is `auto`
// precisely because a save forced by a spell never opens a dialog.
ok("C4 an auto ward is selected automatically when the source is known",
  automaticSelections([ward], { checkType: "save", subject: "will", sourceUuid: B })
    .modifiers.length === 1,
  "this is the path the dead axis made unreachable");
ok("C5 and is not selected when it is not",
  automaticSelections([ward], { checkType: "save", subject: "will" })
    .modifiers.length === 0);

/* ================================================================== *
 * D. Bias reconciliation, unchanged
 * ================================================================== */

const BIAS = { NORMAL: "normal", ADVANTAGE: "advantage", DISADVANTAGE: "disadvantage" };
ok("D1 advantage and disadvantage cancel to normal",
  resolveBias(BIAS.NORMAL, ["advantage", "disadvantage"], BIAS) === BIAS.NORMAL);
ok("D2 advantage alone is advantage",
  resolveBias(BIAS.NORMAL, ["advantage"], BIAS) === BIAS.ADVANTAGE);
ok("D3 an existing disadvantage is not overwritten by advantage",
  resolveBias(BIAS.DISADVANTAGE, ["advantage"], BIAS) === BIAS.NORMAL,
  "a save already at disadvantage must come out NORMAL, not advantage");

/* ================================================================== *
 * E. Rows offered to a player
 * ================================================================== */

{
  const rows = conditionalRows([against, ward], { checkType: "attack", targetUuid: A });
  ok("E1 a matching entry is offered", rows.length === 1);
  const none = conditionalRows([against], { checkType: "attack", targetUuid: B });
  ok("E2 a non-matching one is not", none.length === 0,
    "an entry that cannot apply must not be offered as a tickbox");
}

/* ================================================================== *
 * G. THE MIRROR'S FIRST WRITER — hinder.mjs
 * ================================================================== */

{
  const hinder = await import("../module/magic/hinder.mjs");
  const entries = hinder.hinderFlagData({
    value: -1, bonusType: "circumstance", label: "Enchanting Utterance", targetUuids: [A]
  });
  ok("G1 a hindrance writes one entry per covered roll", entries.length === 2,
    JSON.stringify(entries.map((e) => e.when?.checkTypes?.[0])));
  ok("G2 it covers attack and damage by default",
    ["attack", "damage"].every((slot) =>
      entries.some((e) => e.when?.checkTypes?.includes(slot))),
    "the sentence names both; making authors retype the pair drops one");
  ok("G3 every entry is scoped to the named creature",
    entries.every((e) => e.when?.targetUuids?.includes(A)));
  ok("G4 the entries normalise and match a roll aimed at that creature",
    entries.every((e) => {
      const n = normaliseConditional(e, { id: "h", name: "H", kind: "effect" }, 0);
      return n && matchesCheck(n, { checkType: e.when.checkTypes[0], targetUuid: A });
    }),
    "the written flag must survive the trip back through the engine");
  ok("G5 and match nothing aimed elsewhere",
    entries.every((e) => {
      const n = normaliseConditional(e, { id: "h", name: "H", kind: "effect" }, 0);
      return n && !matchesCheck(n, { checkType: e.when.checkTypes[0], targetUuid: B });
    }));
  // AUTO, because a great many attacks never open a dialog to be asked in.
  ok("G6 a hindrance applies without being asked", entries.every((e) => e.auto === true));

  // A HINDRANCE AGAINST NOBODY IS NOT A HINDRANCE — Stone Shield's
  // defect with the sign flipped.
  ok("G7 an unscoped hindrance writes nothing", hinder.hinderFlagData({
    value: -1, bonusType: "circumstance", label: "X", targetUuids: [] }).length === 0);
  ok("G8 a zero hindrance writes nothing", hinder.hinderFlagData({
    value: 0, bonusType: "circumstance", label: "X", targetUuids: [A] }).length === 0);
  ok("G9 a roll it cannot reach is refused",
    hinder.unknownHinderSlots({ slots: ["morale"] }).join() === "morale");
  ok("G10 the entries of one hindrance agree with each other",
    hinder.hinderEntriesDisagree(entries).length === 0);
  ok("G11 and a disagreement is reported",
    hinder.hinderEntriesDisagree([entries[0], { ...entries[1], value: -3 }]).length > 0,
    "a later author must not be able to give one slot a different number");
}

/* ================================================================== *
 * F. REACHABILITY — is every axis actually SUPPLIED?
 *
 * The section this file was written for. See the header.
 * ================================================================== */

const checkSrc = src(["module", "dice", "check.mjs"]);
const dialogSrc = src(["module", "apps", "check-dialog.mjs"]);

/**
 * The object literal handed to a context-consuming call.
 *
 * `callee` may be a string or a RegExp. THE DIALOG'S ANCHOR IS A REGEXP
 * AND HAD TO BECOME ONE (3.567.0): it was the literal text
 * `"{ checkType, subject, actionKey"`, which meant the context object had
 * to stay on ONE LINE with those three keys in that order and single
 * spaces between them. Adding a tenth axis wrapped the line, the anchor
 * stopped matching, and eleven checks failed at once for a reformat that
 * changed no behaviour.
 *
 * That is a false failure, and a check that cries wolf over whitespace
 * gets its anchor loosened by whoever is in a hurry — the failure mode
 * this project has paid for twice. So the anchor tolerates whitespace
 * while still naming the keys it expects to lead the block, and F2b
 * remains the guard that a scan finding NOTHING fails loudly.
 */
const contextBlock = (source, callee) => {
  const at = typeof callee === "string"
    ? source.indexOf(callee)
    : (source.match(callee)?.index ?? -1);
  if (at === -1) return null;
  const open = source.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
};

const autoContext = contextBlock(checkSrc, "automaticSelections(entries,");
const dialogContext = contextBlock(dialogSrc, /\{\s*checkType,\s*subject,\s*actionKey/);

ok("F1 the automatic path's context was found", Boolean(autoContext),
  "if this fails the scan has drifted and every check below proves nothing");
ok("F2 the dialog's context was found", Boolean(dialogContext),
  "same — a scan that finds nothing must fail loudly, not pass quietly");

/**
 * The KEYS an object literal declares — not every identifier inside it.
 *
 * THE FIRST VERSION OF THIS TESTED THE WHOLE BLOCK FOR THE NAME, and a
 * mutation renaming the key to `targetUuidX` survived it: the block still
 * read `targetUuidX: check.targetUuid`, so the name was present as a
 * VALUE while the key was gone. A check that cannot tell a key from the
 * expression assigned to it proves the wrong thing, which on this project
 * is worse than proving nothing.
 */
const declaredKeys = (block) => {
  const keys = new Set();
  // `key: value` and bare shorthand `key,` / `key}` alike.
  for (const m of block.matchAll(/(?:^|[{,])\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_$][\w$]*)\s*(?=[:,}])/g)) {
    keys.add(m[1]);
  }
  return keys;
};

const autoKeys = autoContext ? declaredKeys(autoContext) : new Set();
const dialogKeys = dialogContext ? declaredKeys(dialogContext) : new Set();

ok("F2b the key scan found the keys it should", autoKeys.has("checkType") && dialogKeys.has("checkType"),
  "if the scan cannot see a key everyone agrees is there, it can see nothing");

for (const axis of SCOPE_AXES) {
  const key = AXIS_CONTEXT_KEYS[axis];
  ok(`F3 the automatic path supplies "${axis}" (as ${key})`,
    autoKeys.has(key),
    "an axis nothing supplies is read on every roll and matches on none");
  ok(`F4 the dialog supplies "${axis}" (as ${key})`,
    dialogKeys.has(key),
    "both paths, because a rule that works only in the dialog works almost nowhere");
}

// AND THE CHECK MUST CARRY THEM AT ALL. A context key spelled in the
// object literal but never set on the check is the same defect wearing a
// different hat.
//
// DRIVEN FROM THE AXIS TABLE SINCE 3.567.0, not from a hand-written pair.
// The list used to read ["sourceUuid", "targetUuid"], which meant the new
// type axis could be added to the table, spelled into both contexts, and
// stored by NEITHER the check nor the dialog without a single check
// noticing — the mutation harness caught exactly that and it is the
// reason this loop changed. A list that has to be remembered is a list
// that will be forgotten on the release where it matters.
//
// `checkTypes` is the one axis exempt, and deliberately: the check has
// carried it as `this.type` since long before the axis table existed, and
// renaming a field used everywhere to satisfy a loop would be the tail
// wagging the dog. It is covered by F2b instead.
const STORED_AXIS_KEYS = SCOPE_AXES
  .map((axis) => AXIS_CONTEXT_KEYS[axis])
  .filter((key) => key !== "checkType");

ok("F4b the stored-key list is not empty", STORED_AXIS_KEYS.length > 0,
  "a loop over nothing passes every check inside it");

for (const field of STORED_AXIS_KEYS) {
  ok(`F5 TRGCheck stores ${field}`,
    new RegExp(`this\\.${field} = config\\.${field}`).test(checkSrc),
    "the context can only pass on what the check was given");
}

// THE DIALOG MUST BE ABLE TO ACCEPT THEM. An axis the dialog cannot be
// handed is one no caller can ever fix from the outside.
for (const field of STORED_AXIS_KEYS) {
  ok(`F6 the dialog accepts ${field} as a parameter`,
    new RegExp(`\\n\\s*${field} = ""`).test(dialogSrc));
}

/* ================================================================== */

const label = "verify-conditionals";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed (${SCOPE_AXES.length} axes, both paths)`);
