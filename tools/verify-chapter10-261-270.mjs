#!/usr/bin/env node
/**
 * verify-chapter10-261-270 — the Grimoire, Conjure Fey to Disturbing
 * Tentacles.
 *
 * NEW at 3.587.0. Graham's R1-R7 of 24 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS BLOCK'S LESSON CAME FROM THE LIVE DRIVE, AND IT WAS A PATH NAME.
 *
 * Death Knell heals the caster "1 HP for every 2 levels" the target
 * possesses. The first draft read `target.system.details.level` — the
 * path a d20 system would use, typed from habit, never measured. This
 * system keeps it at `system.identity.level`. Every creature in Graham's
 * world returned `undefined`, so the spell would have healed nothing,
 * reported "no recorded level", and looked like a data problem with the
 * bestiary rather than a defect in the spell. Section C pins the path.
 *
 * TWO MORE THINGS THE LIVE DRIVE SETTLED, both of them measurements no
 * amount of reading would have produced:
 *
 *   `actor.effects.get(id)` FINDS DIRECT EFFECTS AND NOT TRANSFERRED
 *   ONES. Measured on four actors: Borin's "Dwarf: ability modifiers",
 *   Garran's "Bonus Feat" and every other item-owned effect came back
 *   undefined. A `oneShot` conditional on one of those would have been
 *   used and never spent — offered again for ever. Section F.
 *
 *   THE INSTALLED CHECK DIALOG RENDERS A SWING ROW AS "0 —". Driven on
 *   the real DOM with three pending rows written onto an actor: the two
 *   swings printed a bare zero, unticked, and ticking one would have
 *   pushed a +0 modifier. The row was REACHABLE and did NOTHING, which
 *   is this project's named shape. Section D.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE THING THIS FILE IS MOST CAREFUL ABOUT.
 *
 * Every check below that claims a spell is automated asks what the row
 * DOES, not that a row exists. The pages 111-120 audit put three
 * archetype abilities in the "code" tier because a handler existed with
 * the right name; all three applied nothing and none could be reached
 * from the sheet. That was three weeks ago and it has a section of its
 * own in 3.586.3's notes. So: Section B asks whether each authored kind
 * is one the applier can reach, Section G asks what the applier does
 * with it, and no check here is satisfied by a name.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  PENDING_KINDS, applyPendingSelections, normalisePendingKind,
  pendingModifierRows, pendingTurnsFor
} from "../module/pending-modifiers.mjs";
import {
  PENDING_SPAN_NEXT_TURN, normalisePendingGrant, pendingGrantLine
} from "../module/magic/spell-pending.mjs";
import { deathKnellLine, deathKnellOutcome } from "../module/magic/death-knell.mjs";
import {
  alreadyHasAbility, grantedAbilityLine, normaliseGrantedAbility
} from "../module/magic/granted-ability.mjs";
import {
  normaliseSuppression, normaliseSuppressionChoice, suppressedConditionValues,
  suppressionCastLine, suppressionChoiceFor, warpedSuppression
} from "../module/conditions/suppression.mjs";
import {
  applyConditionalSelections, collectConditionals, conditionalRows,
  normaliseConditional, resolveBias, spentConditionalSources
} from "../module/conditionals.mjs";
import { normaliseRecurringLadder, normaliseSaveLadder } from "../module/magic/save-ladder.mjs";
import { declaredDegrees } from "../module/magic/spell-degrees.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { bonusTargetFor } from "../module/magic/spell-effects.mjs";
import { effectiveRangeText, spellRangeFeet } from "../module/magic/spell-range.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const code = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/*
 * THE SOURCE WITH ITS COMMENTS TAKEN OUT.
 *
 * Two checks in this file failed on their first run, and both failed
 * for the same reason: they matched PROSE. D24 compared the position of
 * the pending sweep against `if (!bleeds.length`, and found that string
 * in the comment I had written six lines above the sweep explaining why
 * the sweep is not there. I2 asserted that no authoring script spreads
 * `w.mods`, and found `mods: { ...(w.mods ?? {}), key: v }` in the
 * header of the script whose whole header is about NOT doing that.
 *
 * This is the defect shape the project's own list calls "a check
 * satisfied by an unrelated occurrence", and this file is the third
 * place it has turned up in my own checks. A comment that describes a
 * bug will always contain the bug; the fix is to stop asking comments
 * anything.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");
const codeOnly = (...p) => stripComments(code(...p));

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.set(String(value.name).trim().toLowerCase(), value);
    }
  } finally {
    await db.close();
  }
  return out;
}
const spells = await spellsPack();
ok("A0 the spells pack could be read", spells !== null);
const rowsOf = (name) => spells?.get(name)?.system?.effects ?? [];
const sysOf = (name) => spells?.get(name)?.system ?? null;
const rowOf = (name, kind) => rowsOf(name).find((r) => r.kind === kind) ?? null;

/* ================================================================== *
 * A. R1/R2 — THE LADDERS THE FIRST PASS AUTHORED ARE STILL THERE
 *
 * A census, so a later authoring script that replaces `y.effects`
 * wholesale (which every script in this directory does, deliberately)
 * cannot quietly drop one.
 * ================================================================== */

const LADDERED = [
  "conjuring control", "control undead", "crushing despair", "dance macabre",
  "deafness", "deific presence", "disorient", "death knell"
];
ok("A1 the eight condition ladders all gate on a degree",
  LADDERED.every((n) => rowsOf(n).some((r) => (declaredDegrees(r) ?? []).length > 0)),
  LADDERED.filter((n) => !rowsOf(n).some((r) => (declaredDegrees(r) ?? []).length > 0)).join(", "));
ok("A2 the two damage ladders parse as save ladders",
  ["dangerous vision", "disintegrate"].every((n) =>
    normaliseSaveLadder(rowOf(n, "saveLadder")) !== null));
/*
 * ONE RUNG PARSER, NOT TWO. `normaliseRecurringLadder` was written by
 * copying `normaliseSaveLadder`'s loops exactly, and the full sweep
 * found the copy the way this project always finds one: an existing
 * mutation reported ANCHOR AMBIGUOUS, because the line it mutates to
 * prove the guard works now existed twice. Two copies of "what counts
 * as a rung" drift the first time one learns a new dice shape — on
 * exactly the spells where a mismatch is invisible.
 */
ok("A2b both ladders refuse unparseable dice, through one parser",
  normaliseSaveLadder({ kind: "saveLadder", damageType: "force", ladder: { success: "two dice" } }) === null
  && normaliseRecurringLadder({ save: "will", damageType: "mental", ladder: { failure: "two dice" } }) === null,
  "a ladder that parses at the cast and refuses at the end of the turn is the worst of both");
ok("A3 Disintegrate prints no harmless rung, and none was invented",
  normaliseSaveLadder(rowOf("disintegrate", "saveLadder"))?.ladder?.critical != null,
  "every rung of this spell does damage, including the Critical");
ok("A4 Disturbing Tentacles carries BOTH of its ladders",
  normaliseSaveLadder(rowOf("disturbing tentacles", "saveLadder")) !== null
  && normaliseRecurringLadder(rowOf("disturbing tentacles", "saveLadder")?.recurring) !== null,
  "R2: the first save at the cast, the second at the end of each turn still inside");
ok("A5 and the recurring one is the Will save Graham ruled, not the Reflex",
  normaliseRecurringLadder(rowOf("disturbing tentacles", "saveLadder")?.recurring)?.save === "will");
ok("A6 the recurring save happens at the END of a turn",
  normaliseRecurringLadder(rowOf("disturbing tentacles", "saveLadder")?.recurring)?.on === "endOfTurn",
  "\"a creature that is still in the area\" is measured when its turn ends");

/* ================================================================== *
 * B. EVERY KIND THIS BLOCK AUTHORED IS ONE THE APPLIER CAN REACH
 *
 * The 3.586.3 question, asked first: not "does a handler exist with
 * this name" but "is this name one the switch has a case for". An
 * authored kind with no case prints `Unhandled effect kind` on the card
 * of a spell the table has just paid for.
 * ================================================================== */

const NEW_KINDS = ["pending", "deathKnell", "grantAbility"];
ok("B1 the three new kinds are declared as handled",
  NEW_KINDS.every((k) => HANDLED_EFFECT_KINDS.includes(k)),
  NEW_KINDS.filter((k) => !HANDLED_EFFECT_KINDS.includes(k)).join(", "));
{
  const applier = code("module", "magic", "spell-effects.mjs");
  for (const kind of NEW_KINDS) {
    ok(`B2 the applier has a case for "${kind}"`,
      applier.includes(`case "${kind}": {`),
      "a declared kind with no case is an Unhandled-effect-kind line on a paid-for cast");
  }
  // AND EACH CASE DOES SOMETHING. A case that only pushes a note is the
  // archetype-ability shape: reachable, named, inert.
  ok("B3 the pending case actually writes a pending entry",
    /case "pending": \{[\s\S]*?await addPendingModifier\(target, grant\)/.test(applier));
  ok("B4 the deathKnell case actually moves the target's Dying",
    /case "deathKnell": \{[\s\S]*?await target\.toggleStatusEffect\("dying", \{ value: outcome\.dyingTo \}\)/
      .test(applier));
  // ANCHORED TO THE STATEMENT, NOT THE CALL TEXT. The first version
  // matched `await caster.update(...)` anywhere, and the mutation
  // `if (false) await caster.update(...)` walked straight through it —
  // word for word the B4/B7 defect 3.586.3 recorded, in a file whose
  // header is about not believing a name.
  ok("B5 and actually moves the caster's hit points",
    /case "deathKnell": \{[\s\S]*?if \(gained > 0\) await caster\.update\(\{ "system\.resources\.hp\.value": kbefore \+ gained \}\);/
      .test(applier));
  ok("B6 the grantAbility case actually creates the item",
    /case "grantAbility": \{[\s\S]*?await target\.createEmbeddedDocuments\("Item", \[payload\]\)/
      .test(applier));
  ok("B7 and hands it the grantedItems lifecycle, so the spell can take it back",
    /case "grantAbility": \{[\s\S]*?grantedItems: \[madeAbility\.id\]/.test(applier),
    "a granted ability with no teardown is a permanent gift from a one-hour spell");
}
{
  // EVERY AUTHORED KIND IN THIS BLOCK'S SPELLS, not just the new ones.
  const touched = [
    "death knell", "disorient", "clarity", "death ward", "delay pain",
    "decursive veil", "deflections", "disgrace", "deific knowing", "darkvision"
  ];
  const unknown = [];
  for (const name of touched) {
    for (const row of rowsOf(name)) {
      if (!HANDLED_EFFECT_KINDS.includes(row.kind)) unknown.push(`${name}:${row.kind}`);
    }
  }
  ok("B8 no spell this block touched carries a kind the applier cannot reach",
    unknown.length === 0, unknown.join(", "));
}

/* ================================================================== *
 * C. R3 — DEATH KNELL
 *
 * The level path is pinned here because the live drive is the only
 * thing that found it, and a rename would put it back silently.
 * ================================================================== */

ok("C1 the applier reads the level from system.identity.level",
  /targetLevel: target\.system\?\.identity\?\.level \?\? null/
    .test(code("module", "magic", "spell-effects.mjs")),
  "measured live: system.details.level is undefined on every creature in the world");
ok("C1b and nothing in the applier reads the path that does not exist",
  !/system\?\.details\?\.level/.test(code("module", "magic", "spell-effects.mjs")));
ok("C2 Success raises Dying by one and heals half the target's level",
  (() => {
    const o = deathKnellOutcome({ mode: "dying", targetLevel: 7, targetDying: 2, hasDying: true });
    return o.dyingTo === 3 && o.healing === 3 && o.kills === false;
  })(),
  "1 HP for every 2 levels, rounded down");
ok("C3 Failure kills, at one past the target's EFFECTIVE death state",
  (() => {
    const o = deathKnellOutcome({ mode: "kill", targetLevel: 7, hasDying: true, deathState: 4 });
    return o.kills === true && o.dyingTo === 5 && o.healing === 7;
  })(),
  "Doomed is folded in by the caller, from turn-economy, not restated in the rule");
ok("C4 a target without Dying is refused rather than killed",
  deathKnellOutcome({ mode: "kill", targetLevel: 7, hasDying: false }).refusal !== null,
  "\"Targets 1 creature that has the Dying condition\" is a rule, not a hint");
ok("C5 an unrecorded level heals nothing AND says which it was",
  (() => {
    const o = deathKnellOutcome({ mode: "kill", targetLevel: null, hasDying: true });
    return o.healing === 0 && o.levelUnknown === true;
  })(),
  "Number(null) is 0 and 0 is finite — the two must not be one answer");
ok("C6 and the card distinguishes them",
  deathKnellLine("Death Knell", "Ghoul", "Grokash",
    deathKnellOutcome({ mode: "kill", targetLevel: null, hasDying: true })) !==
  deathKnellLine("Death Knell", "Ghoul", "Grokash",
    deathKnellOutcome({ mode: "kill", targetLevel: 0, hasDying: true })),
  "\"no recorded level\" and \"level 0\" are different facts about the table");
ok("C7 a rung the spell does not have is refused",
  deathKnellOutcome({ mode: "maim", targetLevel: 7, hasDying: true }).refusal !== null);
ok("C8 the pack gates the two rungs on the degrees the page prints",
  (() => {
    const dying = rowsOf("death knell").find((r) => r.kind === "deathKnell" && r.mode === "dying");
    const kill = rowsOf("death knell").find((r) => r.kind === "deathKnell" && r.mode === "kill");
    return JSON.stringify(declaredDegrees(dying)) === JSON.stringify(["success"])
      && JSON.stringify(declaredDegrees(kill)) === JSON.stringify(["failure", "fumble"]);
  })(),
  "Critical is unaffected, which is the absence of a row");
ok("C9 the killing rung zeroes hit points before setting Dying",
  (() => {
    const src = code("module", "magic", "spell-effects.mjs");
    const block = src.slice(src.indexOf('case "deathKnell": {'));
    const zero = block.indexOf('"system.resources.hp.value": 0');
    const dying = block.indexOf('toggleStatusEffect("dying"');
    return zero > -1 && dying > -1 && zero < dying;
  })(),
  "a creature at full hit points carrying a death-state Dying is a contradiction the sheet would show");

/* ================================================================== *
 * D. R4 — A RUNG MADE OF ADVANTAGE
 *
 * Driven on the installed dialog before any of this was built: three
 * pending rows written onto an actor rendered as "0 —", "0 —" and
 * "-1 circumstance —". The first two are the defect.
 * ================================================================== */

ok("D1 a swing is a kind, not a modifier of zero",
  PENDING_KINDS.ADVANTAGE === "advantage" && PENDING_KINDS.DISADVANTAGE === "disadvantage"
  && PENDING_KINDS.MODIFIER === "modifier");
ok("D2 an entry written before this release still reads as a modifier",
  normalisePendingKind(undefined) === PENDING_KINDS.MODIFIER,
  "every stored entry in every world predates the field");
ok("D3 and so does a stored value that has drifted",
  normalisePendingKind("sideways") === PENDING_KINDS.MODIFIER,
  "a flag is data; data that has drifted degrades, it does not throw in a roll dialog");
{
  // THE RENDERING DEFECT, ASSERTED AS A DIFFERENCE. `lead` is what the
  // dialog prints, and it must not be blank for a swing — which is
  // exactly what the installed build did.
  const store = { pendingModifiers: [
    { id: "s", kind: "disadvantage", value: 0, type: "", label: "Disorient",
      scope: "all checks", oneShot: false, auto: true },
    { id: "m", kind: "modifier", value: -1, type: "circumstance", label: "Disorient",
      scope: "the next check", oneShot: true, auto: false },
    { id: "old", value: 4, type: "circumstance", label: "Treat Disease", scope: "next save" }
  ] };
  const actor = { getFlag: (_s, f) => store[f] };
  const rows = pendingModifierRows(actor);
  ok("D4 a swing row prints something a player can read",
    rows[0].lead === "Disadvantage" && rows[0].lead.length > 0,
    "the installed build printed \"0\" here, which is the live measurement this section exists for");
  ok("D5 a modifier row still prints its number and type",
    rows[1].lead === "-1 circumstance");
  ok("D6 a pre-release row prints correctly too",
    rows[2].lead === "+4 circumstance" && rows[2].kind === PENDING_KINDS.MODIFIER);
  ok("D7 only the row whose scope leaves no judgement arrives ticked",
    rows[0].auto === true && rows[1].auto === false && rows[2].auto === false,
    "\"all checks\" asks nothing; \"the next check it makes\" asks which one");

  const picked = applyPendingSelections(rows, ["s", "m", "old"]);
  ok("D8 a ticked swing becomes a bias, never a modifier",
    picked.kinds.includes("disadvantage")
    && !picked.modifiers.some((m) => m.label === "Disorient" && m.value === 0),
    "pushing it as a +0 is the shape that looks implemented and does nothing");
  ok("D9 ticked modifiers still become modifiers",
    picked.modifiers.length === 2);
  ok("D10 and only the one-shots are spent",
    picked.consume.length === 1 && picked.consume[0] === "m");
  // THE RECONCILIATION. One advantage and one disadvantage cancel, which
  // is why these go through resolveBias rather than being assigned.
  const BIAS = { NORMAL: "normal", ADVANTAGE: "advantage", DISADVANTAGE: "disadvantage" };
  ok("D11 a pending disadvantage cancels against a conditional advantage",
    resolveBias(BIAS.NORMAL, ["advantage", ...picked.kinds], BIAS) === BIAS.NORMAL,
    "assigning it would silently overwrite the other side instead of cancelling with it");
}
ok("D12 the dialog combines pending kinds with conditional kinds rather than replacing them",
  /resolveBias\(result\.bias \?\? BIAS\.NORMAL, \[\.\.\.conditionalKinds, \.\.\.pendingKinds\], BIAS\)/
    .test(code("module", "apps", "check-dialog.mjs")));
ok("D13 the dialog prints `lead`, not the old signed+type pair",
  /\$\{escapeHTML\(entry\.lead\)\}/.test(code("module", "apps", "check-dialog.mjs"))
  && !/\$\{entry\.signed\}<\/strong> \$\{entry\.type\}/.test(code("module", "apps", "check-dialog.mjs")));
ok("D14 and it pre-ticks an auto row",
  // 3.650.0: and only for the kind of check a scoped row waits for.
  /name="pending" value="\$\{entry\.id\}"\$\{entry\.auto && \(!entry\.checkTypes\?\.length \|\| entry\.checkTypes\.includes\(checkType\)\) \? " checked" : ""\}/
    .test(code("module", "apps", "check-dialog.mjs")));
ok("D15 the dialog splits ticked rows through the rule rather than looping in place",
  /const selection = applyPendingSelections\(pending, ticked\)/
    .test(code("module", "apps", "check-dialog.mjs")),
  "the loop it replaced pushed every ticked row into `modifiers` unconditionally");

/* ── the clock, which is what makes an UNUSED rung go away ── */

ok("D16 \"before the end of its next turn\" is one end-of-turn away, or two on its own turn",
  pendingTurnsFor(false) === 1 && pendingTurnsFor(true) === 2,
  "its next turn is the one AFTER the current one if it is taking a turn right now");
ok("D17 a span is only honoured when the row asks for one",
  normalisePendingGrant({ swing: "disadvantage", scope: "x" }, false, pendingTurnsFor).turns === undefined
  && normalisePendingGrant({ swing: "disadvantage", scope: "x", span: PENDING_SPAN_NEXT_TURN },
    false, pendingTurnsFor).turns === 1);
ok("D18 out of combat the span simply is not honoured, visibly",
  normalisePendingGrant({ swing: "disadvantage", scope: "x", span: PENDING_SPAN_NEXT_TURN },
    false, () => 0).turns === undefined,
  "there are no turns to count down; lingering is the safer of the two failures");
ok("D19 a row with no words is refused",
  normalisePendingGrant({ swing: "disadvantage" }, false, pendingTurnsFor) === null,
  "an unlabelled tick box is worse than a printed note, because it looks decided");
ok("D20 a modifier row with no number is refused",
  normalisePendingGrant({ scope: "x" }, false, pendingTurnsFor) === null);
ok("D21 a swing that is not one of the two is refused",
  normalisePendingGrant({ swing: "sideways", scope: "x" }, false, pendingTurnsFor) === null);
ok("D22 the card says when a clock is running",
  /until then/.test(pendingGrantLine("Foe",
    normalisePendingGrant({ swing: "disadvantage", scope: "x", span: PENDING_SPAN_NEXT_TURN },
      false, pendingTurnsFor))),
  "a tick box that quietly disappears two turns later is the silent shape in reverse");
ok("D23 the turn clock sweeps lapsed entries at the END of a turn",
  /const lapsed = await expirePendingModifiers\(actor\);/
    .test(code("module", "documents", "combat.mjs")),
  "the page says \"until the end of\"; counting it at a start would be a different moment");
ok("D24 and it posts its own card rather than appending to a collector declared later",
  (() => {
    const src = codeOnly("module", "documents", "combat.mjs");
    const sweep = src.indexOf("const lapsed = await expirePendingModifiers(actor);");
    const collector = src.indexOf("if (!bleeds.length");
    return sweep > -1 && collector > -1 && sweep < collector;
  })(),
  "3.587.0's first draft appended to `lines`, which is declared behind an early return");

/* ── Disorient's three rungs, as the page prints them ── */

{
  const rows = rowsOf("disorient").filter((r) => r.kind === "pending");
  const byDegree = Object.fromEntries(rows.map((r) => [(r.onSave ?? []).join("+"), r]));
  ok("D25 Disorient authors three pending rungs", rows.length === 3);
  ok("D26 Success is a -1 circumstance on the next check",
    byDegree.success?.value === -1 && byDegree.success?.bonusType === "circumstance"
    && byDegree.success?.swing === undefined);
  ok("D27 Failure is disadvantage on the next check, spent when used",
    byDegree.failure?.swing === "disadvantage" && byDegree.failure?.oneShot !== false
    && byDegree.failure?.auto !== true);
  ok("D28 Fumble is disadvantage on ALL checks, pre-ticked and not spent",
    byDegree.fumble?.swing === "disadvantage" && byDegree.fumble?.oneShot === false
    && byDegree.fumble?.auto === true,
    "every roll until the clock runs out, and asking the player which roll would be absurd");
  ok("D29 all three are bounded by the end of its next turn",
    rows.every((r) => r.span === PENDING_SPAN_NEXT_TURN),
    "an unused one-shot with no clock sits in the dialog for the rest of the session");
  ok("D30 and no rung is gated on a degree the page does not print",
    rows.every((r) => !(r.onSave ?? []).includes("partial")),
    "Critical is unaffected — the absence of a row, not a row saying nothing");
}

/* ================================================================== *
 * E. R4's OTHER HALF — CLARITY IS SPENT BY BEING USED
 *
 * It shipped at 3.586.0 with a card line asking the player to dismiss
 * it by hand. An instruction is not automation.
 * ================================================================== */

{
  const grant = rowOf("clarity", "conditional")?.grants?.[0] ?? null;
  ok("E1 Clarity's grant is marked one-shot", grant?.oneShot === true);
  ok("E2 and it is still a conditional, not a pending entry",
    rowOf("clarity", "conditional") !== null,
    "its bound is the spell's DURATION, which the effect already tracks; pending has no world clock");
  ok("E3 the manual-dismiss note is gone",
    !rowsOf("clarity").some((r) => r.kind === "note" && /dismiss/i.test(r.text ?? "")),
    "leaving it would tell a player to do by hand what the system now does");
  ok("E4 normaliseConditional carries oneShot through",
    normaliseConditional({ kind: "advantage", scope: "s", oneShot: true, when: { checkTypes: ["save"] } },
      { id: "e", name: "Clarity", kind: "effect" }, 0, {})?.oneShot === true);
  ok("E5 and defaults it off, so nothing already in the pack becomes spendable",
    normaliseConditional({ kind: "advantage", scope: "s", when: { checkTypes: ["save"] } },
      { id: "e", name: "X", kind: "effect" }, 0, {})?.oneShot === false);
}

/* ================================================================== *
 * F. WHAT MAY BE SPENT — THE LIVE MEASUREMENT
 *
 * `actor.effects.get(id)` finds a direct effect and misses every
 * item-transferred one. Measured 24 September 2026 on Borin Slatevein,
 * Garran, the Giant Rat and the Goblin Warrior: eight transferred
 * effects, zero found.
 * ================================================================== */

{
  const g = (label) => ({ kind: "advantage", label, scope: "s", oneShot: true,
    when: { checkTypes: ["save"] } });
  const direct = { id: "e1", name: "Clarity", flags: { "trg-prime": { conditionals: [g("Clarity")] } } };
  const transferred = { id: "e2", name: "Dwarf", parent: { documentName: "Item" },
    flags: { "trg-prime": { conditionals: [g("Dwarf")] } } };
  const item = { id: "i1", name: "Boots", flags: { "trg-prime": { conditionals: [g("Boots")] } } };
  const entries = collectConditionals([item], [direct, transferred], [], {});
  const kinds = Object.fromEntries(entries.map((e) => [e.label, e.sourceKind]));

  ok("F1 an effect an item transferred is labelled apart from one the actor carries",
    kinds.Clarity === "effect" && kinds.Dwarf === "itemEffect",
    "they are indistinguishable in appliedEffects and behave differently in effects.get");
  ok("F2 an item's own conditional is still an item",
    kinds.Boots === "item");

  const rows = conditionalRows(entries, { checkType: "save" });
  const spent = spentConditionalSources(rows.filter((r) => r.oneShot));
  ok("F3 only the actor's own effect may be spent",
    spent.length === 1 && spent[0].sourceId === "e1",
    "spending a transferred one either does nothing or deletes a racial feature for good");
  ok("F4 applyConditionalSelections reports the same set",
    JSON.stringify(applyConditionalSelections(rows, rows.map((r) => r.id)).spent) ===
    JSON.stringify(spent),
    "two ways to answer one question is how two answers start to disagree");
  ok("F5 a row that is not one-shot is never spent",
    spentConditionalSources([{ oneShot: false, sourceKind: "effect", sourceId: "z" }]).length === 0);
  ok("F6 and the same source is not spent twice",
    spentConditionalSources([
      { oneShot: true, sourceKind: "effect", sourceId: "e1", label: "a" },
      { oneShot: true, sourceKind: "effect", sourceId: "e1", label: "b" }
    ]).length === 1);
}
ok("F7 the dialog warns when a spend could not land",
  /could not be cleared/.test(code("module", "apps", "check-dialog.mjs")),
  "a one-shot used and not spent is offered again for ever");
ok("F8 so does the dialog-less path, which is the one a forced save takes",
  /could not be cleared/.test(code("module", "dice", "check.mjs")));
ok("F9 the dialog-less path spends one-shots at all",
  /for \(const \{ sourceId, label \} of applied\.spent \?\? \[\]\)/
    .test(code("module", "dice", "check.mjs")),
  "a rule with two call sites and one implementation is this project's named shape");
ok("F10 and it applies AUTO pending entries there too, but only the auto ones",
  (() => {
    const src = code("module", "dice", "check.mjs");
    // 3.650.0: a row scoped to a kind of check also waits for one.
    return /pendingModifierRows\(check\.actor\)\.filter\(\(row\) => row\.auto\n\s+&& \(/.test(src);
  })(),
  "a forced save has nobody to ask which roll \"the next check\" meant");

/* ================================================================== *
 * G. R6 — THE SEVEN WITH A RAIL, AND WHAT EACH ROW ACTUALLY DOES
 * ================================================================== */

/* ── Death Ward ── */
{
  const grant = rowOf("death ward", "conditional")?.grants?.[0] ?? null;
  ok("G1 Death Ward's +4 is a status bonus, scoped to saves",
    grant?.value === 4 && grant?.type === "status"
    && JSON.stringify(grant?.when?.checkTypes) === JSON.stringify(["save"]));
  ok("G2 and scoped to the two traits the page names",
    JSON.stringify(grant?.when?.traits) === JSON.stringify(["essence", "death"]));
  ok("G3 it reaches a save carrying either trait, and not a save carrying neither",
    (() => {
      const e = normaliseConditional(grant, { id: "dw", name: "Death Ward", kind: "effect" }, 0, {});
      const hit = conditionalRows([e], { checkType: "save", traits: ["death"] });
      const miss = conditionalRows([e], { checkType: "save", traits: ["poison"] });
      return hit.length === 1 && miss.length === 0;
    })(),
    "the axis is any-of, which is what \"essence and death effects\" means in a scope");
  ok("G4 the essence resistance is a defence row, not a note",
    rowOf("death ward", "defence")?.field === "resistance"
    && /essence/i.test(String(rowOf("death ward", "defence")?.value ?? "")));
  ok("G5 Doomed is ignored ENTIRELY rather than by a number",
    (() => {
      const row = rowOf("death ward", "suppress");
      const spec = normaliseSuppression(row);
      return spec?.all === true && row.amount === undefined;
    })(),
    "Doomed has no printed maximum, so any number would be a guess wearing a number's clothes");
  ok("G6 and a complete ignore actually zeroes the value the death-state rule reads",
    suppressedConditionValues(new Map([["doomed", 6]]),
      [normaliseSuppression({ condition: "doomed", all: true })]).get("doomed") === 0,
    "measured live: getConditionValue returns the suppressed number and effectiveDeathState takes it");
  // THE AMOUNT, NOT THE FLAG. `all` rides through the ordinary
  // arithmetic path untouched, so asserting it proved nothing: with the
  // guard removed the spec came back `all: true, amount: 3`. What the
  // cap must not be able to touch is the number.
  ok("G7 a warp cannot turn a complete ignore into a capped one",
    warpedSuppression(normaliseSuppression({ condition: "doomed", all: true }),
      { suppressBump: 1, suppressMax: 3 })?.amount === Infinity,
    "surviving the arithmetic by luck is how Math.min quietly makes \"entirely\" mean three");
  ok("G8 and the card says \"entirely\" rather than a number",
    /entirely/.test(suppressionCastLine(normaliseSuppression({ condition: "doomed", all: true })))
    && !/Infinity/.test(suppressionCastLine(normaliseSuppression({ condition: "doomed", all: true }))));
}

/* ── Delay Pain and Decursive Veil: a choice between unequal options ── */
{
  const dp = normaliseSuppressionChoice(rowOf("delay pain", "suppress"));
  ok("G9 Delay Pain offers three options", dp?.options?.length === 3);
  ok("G10 and each keeps its own amount",
    (() => {
      const by = Object.fromEntries(dp.options.map((o) => [o.condition, o.amount]));
      return by.dazed === 10 && by.weakened === 10 && by.injured === 5;
    })(),
    "one row naming three conditions would have to pick a number and be wrong about two");
  ok("G11 every option names a condition the registry knows",
    dp.options.every((o) => Boolean(CONDITIONS[o.condition])));
  ok("G12 a cancelled dialog produces no suppression at all",
    suppressionChoiceFor(dp, "") === null,
    "falling back to the first option would make cancel and \"dazed\" the same spell");
  // THE CHOICE MUST DRIVE THE SPEC, not merely be computed before it.
  // The first version compared the position of the CALL TEXT, and a
  // mutation that kept the call and threw the answer away
  // (`const suppressChoice = null; const unused = normalise...(effect)`)
  // passed it while the spell silently stopped offering a choice.
  ok("G13 the applier asks BEFORE warping, so a bought bump raises what was chosen",
    (() => {
      const block = codeOnly("module", "magic", "spell-effects.mjs")
        .slice(codeOnly("module", "magic", "spell-effects.mjs").indexOf('case "suppress": {'));
      const ask = block.indexOf("const suppressChoice = normaliseSuppressionChoice(effect);");
      const feed = block.indexOf("chosenSuppression ?? normaliseSuppression(effect)");
      const warp = block.indexOf("warpedSuppression(");
      return ask > -1 && feed > -1 && warp > -1 && ask < warp && warp < feed;
    })(),
    "the answer must reach warpedSuppression, not just be computed above it");
  ok("G14 Delay Pain's warp is no longer inert",
    (sysOf("delay pain")?.warps ?? []).some((w) =>
      /additional point/i.test(w.text) && Number(w.mods?.suppressBump) === 1));
  const dv = normaliseSuppressionChoice(rowOf("decursive veil", "suppress"));
  ok("G15 Decursive Veil offers frightened or sickened, one point each",
    dv?.options?.length === 2 && dv.options.every((o) => o.amount === 1));
  ok("G16 and it applies concealed as a condition rather than describing it",
    rowOf("decursive veil", "condition")?.condition === "concealed");
  ok("G17 its unautomatable clause is still printed",
    rowsOf("decursive veil").some((r) => r.kind === "note" && /PP 2 or lower/i.test(r.text ?? "")),
    "flagged is not the same as silently missing");
}

/* ── Disgrace: four slots, and one of them is not called what the page calls it ── */
{
  const rows = rowsOf("disgrace").filter((r) => r.kind === "bonus");
  ok("G18 Disgrace penalises four skills", rows.length === 4);
  ok("G19 each is -2 status", rows.every((r) => r.value === -2 && r.bonusType === "status"));
  ok("G20 and EVERY slot is one the sheet actually has",
    rows.every((r) => String(bonusTargetFor(r.slot)).startsWith("system.skills.")),
    "\"performance\" resolves to system.combat.performance, which exists as a path and takes the penalty silently");
  ok("G21 the Performance row uses the skill's real key",
    rows.some((r) => r.slot === "perform") && !rows.some((r) => r.slot === "performance"),
    "measured against the skill registry rather than typed from the page");
  ok("G22 its two unautomatable clauses are still printed",
    rowsOf("disgrace").some((r) => r.kind === "note" && /cooperative/i.test(r.text ?? "")));
}

/* ── Deflections and Deific Knowing ── */
{
  const row = rowOf("deflections", "bonus");
  ok("G23 Deflections is -4 circumstance to the attack",
    row?.value === -4 && row?.bonusType === "circumstance" && row?.slot === "attack");
  ok("G24 and its existing warp still raises the penalty to a printed cap",
    (sysOf("deflections")?.warps ?? []).some((w) =>
      Number(w.mods?.bonusValue) === 1 && Number(w.mods?.bonusMax) === 10));
  /*
   * THE REACH, WHICH IS THE HALF THAT WOULD HAVE BEEN SILENT.
   *
   * Deflections printed no Range and no area, which since 3.532.0 means
   * the caster — so the -4 above, which belongs on the creature that
   * shot at you, would have been refused for every attacker but
   * yourself. Automated and unreachable, which is the shape 3.586.3 is
   * about. Found by `verify-spell-range` S4b naming it as a third
   * self-bound spell with a row that reaches another creature.
   */
  ok("G24b Deflections can actually reach the attacker",
    (() => {
      const sys = sysOf("deflections");
      const effective = effectiveRangeText(sys?.range, sys?.area);
      return effective !== "self" && spellRangeFeet(effective) === null;
    })(),
    "the page's limit is awareness, not distance — a blank range would gate it to zero feet");
  ok("G24c and it says \"see text\" rather than a number invented to pass a gate",
    sysOf("deflections")?.range === "see text");
  ok("G25 its judgement clause is printed rather than guessed at",
    rowsOf("deflections").some((r) => r.kind === "note" && /massive/i.test(r.text ?? "")));
  const dk = rowOf("deific knowing", "conditional")?.grants?.[0] ?? null;
  ok("G26 Deific Knowing grants advantage, not a number", dk?.kind === "advantage");
  ok("G27 scoped to Religion, on the caster",
    JSON.stringify(dk?.when?.subjects) === JSON.stringify(["religion"])
    && rowOf("deific knowing", "conditional")?.target === "self");
  ok("G28 and it reaches a Religion check and not an Arcana one",
    (() => {
      const e = normaliseConditional(dk, { id: "dk", name: "Deific Knowing", kind: "effect" }, 0, {});
      return conditionalRows([e], { checkType: "skill", subject: "religion" }).length === 1
        && conditionalRows([e], { checkType: "skill", subject: "arcana" }).length === 0;
    })());
}

/* ── Darkvision: granted from the pack entry, not redefined ── */
{
  const row = rowOf("darkvision", "grantAbility");
  ok("G29 Darkvision grants an ability by uuid",
    normaliseGrantedAbility(row) !== null && /^Compendium\./.test(row?.uuid ?? ""));
  ok("G30 it points at the abilities pack, where Chapter 8 defines it",
    /Compendium\.trg-prime\.abilities\.Item\./.test(row?.uuid ?? ""));
  ok("G31 the spell carries no second copy of what Darkvision does",
    !JSON.stringify(rowsOf("darkvision")).includes("raisesLevelBy"),
    "two definitions of one ability is two things to keep in step");
  ok("G32 a row with no uuid is refused",
    normaliseGrantedAbility({ label: "Darkvision" }) === null,
    "an empty string reaches fromUuid as null, indistinguishable from a moved compendium");
  ok("G33 a creature that already has it is told, not given a second copy",
    alreadyHasAbility([{ name: "Darkvision" }], "darkvision") === true
    && /already has/.test(grantedAbilityLine("Darkvision", "Foe",
      { name: "Darkvision", already: true })));
  ok("G34 and a missing compendium entry says so rather than passing silently",
    /does not hold/.test(grantedAbilityLine("Darkvision", "Foe", { missing: true })));
  ok("G35 the warp that moves it off the caster says so",
    (sysOf("darkvision")?.warps ?? []).some((w) =>
      /range is touch/i.test(w.text) && w.mods?.retargetSelfRows === true),
    "range and cap describe where the spell reaches, not who a self row lands on");
  ok("G36 and that warp still carries its range and cap",
    (sysOf("darkvision")?.warps ?? []).some((w) =>
      w.mods?.rangeOverride === "touch" && Number(w.mods?.targetCap) === 1));
}

/* ================================================================== *
 * H. R5 AND R7 — THE DATA FIXES
 * ================================================================== */

ok("H1 Defer Fatality has the duration its page prints",
  sysOf("defer fatality")?.duration === "1 hour");
ok("H2 Create Undead and Control Undead carry the conjure key the other nine have",
  ["create undead", "control undead"].every((n) =>
    (sysOf(n)?.warps ?? []).some((w) => Number(w.mods?.conjuredLevel) === 1)),
  "one rule, eleven spells, nine wired");
ok("H3 and each knows its own starting level",
  ["create undead", "control undead"].every((n) =>
    (sysOf(n)?.warps ?? []).some((w) => w.mods?.conjuredBase !== undefined)));

/* ================================================================== *
 * I. THE AUTHORING SCRIPTS
 * ================================================================== */

{
  // COMMENTS STRIPPED. Both of these scripts have headers ABOUT the
  // bug I2 forbids, and a header that names a bug contains it.
  const first = codeOnly("tools", "author-block26-spells.mjs");
  const second = codeOnly("tools", "author-block26-effects.mjs");
  for (const [name, src] of [["first", first], ["second", second]]) {
    ok(`I1 the ${name} authoring script replaces the fields it owns`,
      /y\.effects = \[/.test(src) && !/y\.effects\.push\(/.test(src));
    ok(`I2 and its warp edits replace mods rather than spreading them`,
      !/mods: \{ \.\.\.\(w\.mods \?\? \{\}\)/.test(src),
      "block 25 carried extraTargets and targetCap together for two runs this way");
  }
  ok("I3 nothing was authored on a degree the pages do not print",
    !/onSave: \["partial"\]/.test(first) && !/onSave: \["partial"\]/.test(second));
  ok("I4 the second script records what it deliberately left as a note",
    /LEFT AS A NOTE/.test(code("tools", "author-block26-effects.mjs")),
    "so a later reader does not mistake a decision for an omission");
}

/* ================================================================== */

process.stdout.write(failures.length
  ? `\nverify-chapter10-261-270: FAILED — ${failures.length} of ${checks}:\n  ${failures.join("\n  ")}\n`
  : `\nverify-chapter10-261-270: OK — ${checks} checks. Pages 261-270: Conjure Fey to Disturbing Tentacles.\n`);
process.exit(failures.length ? 1 : 0);
