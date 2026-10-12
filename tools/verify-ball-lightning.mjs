#!/usr/bin/env node
/**
 * verify-ball-lightning — a strike aimed again every turn.
 *
 * NEW at 3.588.0. Graham's three Ball Lightning rulings of
 * 24 September 2026, and the one thing still inferred.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS THERE BEFORE THIS RELEASE, AND WHY IT COUNTED AS NOTHING.
 *
 * The cast was automated and everything after it was a note reading
 * "Cast the strike again from the spell card each turn — the turn clock
 * does not yet offer it." That is an instruction to a player printed by
 * a system that could have done the work: nine rounds of a ten-round
 * spell, manual. It is the same shape as Clarity's "dismiss it then"
 * (fixed last release) and Acid Arrow's unreachable Sustain, and this
 * file's job is to keep it dead.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE RULINGS, EACH WITH A CHECK THAT FAILS IF IT IS REVERSED.
 *
 *   1. A turn with no free action STILL STRIKES, at the current target.
 *      Section B. The failure this guards is the tempting one: treating
 *      an unanswered dialog as "do nothing", which would make an
 *      unattended game silently drop nine tenths of the spell.
 *   2. EACH STRIKE IS ITS OWN BASIC REFLEX SAVE. Section D.
 *   3. "WITHIN RANGE" IS MEASURED FROM THE CASTER. Section C.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LIVE DRIVE, 24 SEPTEMBER 2026, AND WHAT IT CHANGED.
 *
 * `withinDirectRange` first guarded its range with
 * `!Number.isFinite(Number(rangeFeet))` alone — and `Number(null)` is 0,
 * which is finite. A spell with no printed range therefore had a range
 * of ZERO FEET and refused every redirect, in the one function whose own
 * comment warns about that confusion. Caught by its first test run.
 * Section C1c is the check.
 *
 * `saveDC` was read off `rollData` — a name believed rather than
 * measured. `rollData` is the Roll data object formulas evaluate
 * against and has never carried a save DC, so every ball would have
 * frozen at DC 0 and every target would have saved automatically, for
 * ever, silently. Section E.
 *
 * And four primitives were measured in Graham's world before any check
 * here was written: `outcome.margin` exists and is negative on a failure
 * (so `basicSavingThrow` can read a severity); `distanceBetween` returns
 * 20 and 65 feet for the two probe positions; the ball's spec survives
 * an ActiveEffect flag round trip intact and a DISABLED effect is
 * skipped; and a `<select name="pick">` really does come back as `.pick`
 * — that last one mattered because `undefined` would have degraded to
 * "strike the current target" and looked exactly like ruling 1 working.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  DIRECTED_STRIKE_FLAG, directableTargets, directedStrikeLine,
  normaliseDirectedStrike, strikeTargetFor, targetsAreDistinct, withinDirectRange
} from "../module/magic/directed-strike.mjs";
import { runningBalls } from "../module/magic/directed-strike-workflow.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { basicSavingThrow } from "../module/dice/resolution.mjs";
import { criticalBonusDamage } from "../module/magic/spell-damage.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const code = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
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
const ball = spells?.get("ball lightning")?.system ?? null;
const rows = ball?.effects ?? [];
const strikeRow = rows.find((r) => r.kind === "directedStrike") ?? null;

/* ================================================================== *
 * A. THE SPELL IS WIRED, AND THE NOTE THAT REPLACED AUTOMATION IS GONE
 * ================================================================== */

ok("A1 Ball Lightning declares a directed strike", strikeRow !== null);
ok("A2 the kind is one the applier can reach",
  HANDLED_EFFECT_KINDS.includes("directedStrike"),
  "a declared kind with no case prints Unhandled effect kind on a paid-for cast");
ok("A3 the applier has a case for it",
  codeOnly("module", "magic", "spell-effects.mjs").includes('case "directedStrike": {'));
ok("A4 and the case actually records a ball",
  /case "directedStrike": \{[\s\S]*?await recordDirectedStrike\(caster, \{/
    .test(codeOnly("module", "magic", "spell-effects.mjs")),
  "a case that only pushes a line is the archetype-ability shape: reachable, named, inert");
ok("A5 the old do-it-yourself note is gone",
  !rows.some((r) => r.kind === "note" && /turn clock does not yet offer it/i.test(r.text ?? "")),
  "an instruction to cast the spell again by hand is what this release replaced");
ok("A6 a note still states the rule the dialog implements",
  rows.some((r) => r.kind === "note" && /free action/i.test(r.text ?? "")
    && /current target again/i.test(r.text ?? "")),
  "the automation does it; the card still has to say what it did");
ok("A7 the row carries everything a later turn needs",
  strikeRow?.formula === "6d8" && strikeRow?.damageType === "electricity"
  && strikeRow?.save === "reflex" && strikeRow?.rangeFeet === 40);
ok("A8 the spell still prints its own parameters unchanged",
  ball?.range === "40 feet" && ball?.defence === "Basic Reflex"
  && ball?.duration === "1 minute" && ball?.baseDamage === "1d8",
  "this release automates the entry; it does not re-author it");

/* ── the row parses, and the ways it can be wrong are refused ── */
ok("A9 the authored row normalises",
  normaliseDirectedStrike(strikeRow) !== null);
ok("A10 a row with no dice is refused",
  normaliseDirectedStrike({ damageType: "electricity", save: "reflex" }) === null,
  "it would reach `new Roll(\"\")` inside the turn-advance path");
ok("A11 a row with unparseable dice is refused",
  normaliseDirectedStrike({ formula: "six d8", damageType: "electricity", save: "reflex" }) === null);
ok("A12 a row with no damage type is refused",
  normaliseDirectedStrike({ formula: "6d8", save: "reflex" }) === null,
  "an empty type means \"the weapon's own\" elsewhere; a spell must not inherit that");
ok("A13 a row naming a save that does not exist is refused",
  normaliseDirectedStrike({ formula: "6d8", damageType: "electricity", save: "luck" }) === null);

/* ================================================================== *
 * B. RULING 1 — A TURN WITH NO FREE ACTION STILL STRIKES
 * ================================================================== */

ok("B1 no free action spent strikes the current target",
  (() => {
    const aim = strikeTargetFor({ current: "Actor.A" });
    return aim?.uuid === "Actor.A" && aim.redirected === false;
  })(),
  "Graham, 24 September 2026: \"Strike its current target\"");
ok("B2 a free action redirects, and says it did",
  (() => {
    const aim = strikeTargetFor({ current: "Actor.A", chosen: "Actor.B" });
    return aim?.uuid === "Actor.B" && aim.redirected === true;
  })());
ok("B3 a ball with no target at all strikes nothing, rather than picking someone",
  strikeTargetFor({}) === null,
  "the caller reports the miss; it does not choose a victim for the player");
ok("B4 and the card says so rather than passing silently",
  /nothing to strike/.test(directedStrikeLine("Ball Lightning", "")),
  "a turn that quietly does nothing is indistinguishable from a spell that ended");
ok("B5 every way of not answering the dialog means the same thing",
  (() => {
    const src = codeOnly("module", "magic", "directed-strike-workflow.mjs");
    // A cancel, a close and a throw all collapse to "" before the rule sees them.
    return /if \(!chosen \|\| chosen === "cancel"\) return "";/.test(src)
      && /\.catch\(\(\) => null\)/.test(src);
  })(),
  "an unattended game must lose the choice of target, never the strike");
ok("B6 the workflow asks the rule rather than re-deciding it",
  /const aim = strikeTargetFor\(\{ current, chosen \}\);/
    .test(codeOnly("module", "magic", "directed-strike-workflow.mjs")),
  "a rule written then hand-rolled at its call site is this project's named shape");

/* ================================================================== *
 * C. RULING 3 — "WITHIN RANGE" IS MEASURED FROM THE CASTER
 * ================================================================== */

ok("C1 a creature inside the range may be directed at",
  withinDirectRange(40, 40) === true && withinDirectRange(20, 40) === true,
  "measured live: the near probe stood at 20 feet");
ok("C1b one outside it may not",
  withinDirectRange(41, 40) === false && withinDirectRange(65, 40) === false,
  "measured live: the far probe stood at 65 feet");
/*
 * THE DEFECT THE FIRST TEST RUN FOUND, pinned so it cannot come back.
 * `Number(null)` is 0 and 0 is finite, so a `!Number.isFinite` guard
 * alone turned "no range printed" into "a range of zero feet".
 */
ok("C1c no printed range is no limit, not a limit of zero",
  withinDirectRange(500, null) === true && withinDirectRange(500, undefined) === true
  && withinDirectRange(500, 0) === true,
  "Number(null) is 0 and 0 is finite — the guard has to test null before the number");
ok("C1d an unmeasured distance is not too far",
  withinDirectRange(null, 40) === true && withinDirectRange(undefined, 40) === true,
  "refusing every redirect on a gridless scene switches the spell off rather than degrading it");
ok("C2 the range is measured from the CASTER, not from the ball",
  (() => {
    const src = codeOnly("module", "magic", "directed-strike-workflow.mjs");
    // distances are built once, against the caster's own token
    return /distance = casterToken \? distanceBetween\(casterToken, token\) : null;/.test(src);
  })(),
  "a ball sent 40 feet cannot be walked a further 40 — the caster's bubble is the whole reach");
ok("C3 the picker offers only creatures inside it",
  (() => {
    const near = { uuid: "a", name: "Near", distance: 20 };
    const far = { uuid: "b", name: "Far", distance: 65 };
    const offered = directableTargets([near, far], 40, [], "");
    return offered.length === 1 && offered[0].uuid === "a";
  })());
ok("C4 the caster is never offered their own ball",
  directableTargets([{ uuid: "me", name: "Me", distance: 0 }], 40, [], "me").length === 0);
ok("C5 the row's rangeFeet is the spell's printed range",
  normaliseDirectedStrike(strikeRow)?.rangeFeet === 40 && ball?.range === "40 feet");

/* ── the warp: two balls, two creatures ── */
ok("C6 a target another ball has taken is not offered",
  directableTargets([{ uuid: "a", name: "A", distance: 10 }, { uuid: "b", name: "B", distance: 10 }],
    40, ["a"], "").map((c) => c.uuid).join(",") === "b");
ok("C7 and the finished assignment is asked, not assumed",
  targetsAreDistinct(["a", "b"]) === true && targetsAreDistinct(["a", "a"]) === false,
  "the picker is the thing most likely to be changed later; the constraint is the page's");
ok("C8 the workflow asks it after collecting the turn's aims",
  /if \(!targetsAreDistinct\(claimed\)\) \{/
    .test(codeOnly("module", "magic", "directed-strike-workflow.mjs")));
ok("C9 the warp's key is the ball count, and is still targetCap",
  (spells?.get("ball lightning")?.system?.warps ?? []).some((w) =>
    /additional ball/i.test(w.text) && Number(w.mods?.targetCap) === 2),
  "block 25 corrected this from extraTargets, which multiplied and left the count uncapped");
ok("C10 the applier reads the ball count from that key",
  /Number\(warpMods\?\.targetCap \?\? effect\.count \?\? 1\)/
    .test(codeOnly("module", "magic", "spell-effects.mjs")));
ok("C11 the second ball starts on nobody",
  /targetUuid: i === 0 \? String\(descriptor\.targetUuid \?\? ""\) : ""/
    .test(codeOnly("module", "magic", "directed-strike-workflow.mjs")),
  "the cast gives ONE target and the warp says the second must differ, so it is aimed on the first turn");

/* ================================================================== *
 * D. RULING 2 — EACH STRIKE IS ITS OWN BASIC REFLEX SAVE
 * ================================================================== */

{
  const src = codeOnly("module", "magic", "directed-strike-workflow.mjs");
  ok("D1 a save is rolled on every strike",
    /const check = await TRGCheck\.roll\(\{[\s\S]*?type: "save",[\s\S]*?save: spec\.save,/.test(src),
    "a save at the cast that held for the minute would be a different spell");
  ok("D2 the degree scales the damage through the shared basic-save rule",
    /const bs = basicSavingThrow\(degreeKey, margin\);/.test(src)
    && /Math\.floor\(roll\.total \* bs\.damageMultiplier\)/.test(src));
  ok("D3 the margin is passed, so a badly failed save can reach a critical",
    /margin = Number\.isFinite\(Number\(check\?\.outcome\?\.margin\)\)/.test(src),
    "measured live: outcome.margin exists and reads -7 and -21 on two forced failures");
  ok("D4 the critical bonus dice come from the BASE damage entry",
    /criticalBonusDamage\(\s*\{ baseDamage: String\(raw\?\.baseDamage \?\? ""\) \}/.test(src),
    "3.585.1: reading damage.formula instead hands 20 spells dice their page denies them");
  ok("D5 the ball carries its base damage so a later turn still has it",
    /baseDamage: String\(spell\.system\?\.baseDamage \?\? ""\)/
      .test(codeOnly("module", "magic", "spell-effects.mjs")));
  ok("D6 damage goes through the defence vocabulary as a magical source",
    /magical: true,/.test(src),
    "verify-defence-vocabulary W1 names any spell path that forgets it; it caught the recurring ladder last release");
  ok("D7 and is neither an area nor a targeted attack",
    /area: false,\s*targeted: false/.test(src),
    "a ball that hits one creature is not an area, and it makes no attack roll");
  ok("D8 a failed save that reaches a severity lands a real injury",
    /await rollCriticalInjury\(caster, \{/.test(src));
  ok("D9 the card reports immunity rather than printing a zero",
    /packet\.immune/.test(src));
}
// The shared rule really does what D2 relies on, asked of the rule itself.
ok("D10 a critical save takes nothing and a success takes half",
  basicSavingThrow("critical").damageMultiplier === 0
  && basicSavingThrow("success").damageMultiplier === 0.5
  && basicSavingThrow("failure", -2).damageMultiplier === 1);
/*
 * THE BANDS, MEASURED RATHER THAN REMEMBERED. This check first asserted
 * that a margin of -7 carries no severity, on the assumption the first
 * band opens at 10. It opens at 5 — base 5, plain increment 10, so
 * 5 / 15 / 25 — and -7 is already a Minor. The rule was right and the
 * check was wrong, which is the better way round but worth recording:
 * the number came from memory, and the whole file is about not doing
 * that.
 */
ok("D11 a save failed badly enough carries a severity, at the real bands",
  basicSavingThrow("failure", -4).criticalSeverity === null
  && basicSavingThrow("failure", -5).criticalSeverity === "minor"
  && basicSavingThrow("failure", -15).criticalSeverity === "serious"
  && basicSavingThrow("failure", -25).criticalSeverity === "deadly",
  "5 / 15 / 25, not 10 / 20 / 30 — and the live probes came back at margin -7 and -21");
ok("D12 and the bonus dice are Ball Lightning's own 1d8s",
  /d8/.test(criticalBonusDamage({ baseDamage: "1d8" }, "minor", 1)),
  "the spell prints Base Damage 1d8 and damage 6d8; the critical scales the first");

/* ================================================================== *
 * E. THE SAVE DC IS FROZEN, AND IT REACHES THE BALL AT ALL
 * ================================================================== */

/*
 * E1 ORIGINALLY ASSERTED THAT NOTHING IN THE APPLIER READS
 * `rollData.saveDC`, and it failed on its first run — three other places
 * in that file read exactly that, and my reason for changing the line
 * ("rollData has never carried a save DC") was simply false.
 *
 * The change was still right, for a different reason, and the check now
 * says the real one: `rollData.saveDC` is the NOMINAL DC — the one the
 * spell HAS, computed whenever a cast lands so a granted spell-like can
 * borrow it — while the parameter is the DC this spell's targets
 * actually rolled against, which is null when there is no save. A ball
 * runs for a minute against one number, and it has to be that one.
 */
ok("E1 the ball freezes the DC the saves were rolled against",
  /const dsCount[\s\S]*?saveDC: Number\(saveDC \?\? 0\) \|\| 0,/
    .test(codeOnly("module", "magic", "spell-effects.mjs")),
  "not rollData.saveDC, which is the nominal DC a granted spell-like borrows");
ok("E1b and the nominal one is still read where it is the right answer",
  /rollData\?\.saveDC/.test(codeOnly("module", "magic", "spell-effects.mjs")),
  "three callers want the spell's own DC; this check exists so removing them is deliberate");
ok("E2 applySpellEffects takes saveDC in its signature",
  /saveResults = \[\], saveDC = null,/.test(codeOnly("module", "magic", "spell-effects.mjs")));
ok("E3 and the cast passes the DC it rolled the degrees against",
  /saveResults: spellSave\?\.results \?\? \[\],\s*saveDC,/
    .test(codeOnly("module", "magic", "cast-workflow.mjs")));
ok("E4 the ball reads its frozen DC, not the caster's current one",
  /const saveDC = Number\(raw\?\.saveDC\) \|\| 0;/
    .test(codeOnly("module", "magic", "directed-strike-workflow.mjs")),
  "a caster who later changes must not change a spell already running");

/* ================================================================== *
 * F. LIFECYCLE — THE BALL IS AN EFFECT, SO THE MINUTE ENDS IT
 * ================================================================== */

{
  const src = codeOnly("module", "magic", "directed-strike-workflow.mjs");
  const applier = codeOnly("module", "magic", "spell-effects.mjs");
  ok("F1 a ball is an ActiveEffect on the caster",
    /await createEffectsOn\(caster, made\);/.test(src));
  ok("F2 it is recorded on the CASTER however the row's target resolved",
    /recordDirectedStrike\(caster,/.test(applier),
    "the ball belongs to whoever conjured it; the target is a field on the ball");
  ok("F3 and only once per cast, not once per recipient",
    /if \(directedStrikeRecorded\) break;\s*directedStrikeRecorded = true;/.test(applier),
    "a two-target cast would otherwise hand the caster a second ball nobody paid for");
  ok("F4 it carries the standard spell-effect timing, so the minute ends it",
    /dsFlags\[SYSTEM_ID\]\.spellEffect = true/.test(applier)
    && /dsFlags\[SYSTEM_ID\]\.conditionExpiresRound = dsTiming\.expiresRound/.test(applier),
    "a bespoke clock would be a second clock; this project has a list of what happens to those");
  ok("F5 and its castId, so a dispel and a sustain lapse both reach it",
    /if \(castId\) dsFlags\[SYSTEM_ID\]\.castId = castId;/.test(applier));
  ok("F6 one effect per ball, so a GM can delete one of two",
    /for \(let i = 0; i < spec\.count; i \+= 1\)/.test(src));
  /*
   * F7 IS DRIVEN, NOT MATCHED. It began as a text match on
   * `if (effect.disabled) continue;` — which `if (false) continue;`
   * walks straight through, the B4/B7 shape 3.586.3 recorded. It also
   * left `runningBalls` with no caller outside its own file, which the
   * uncalled-export ratchet refused, so the ratchet and the loose check
   * had the same cure.
   *
   * The fake actor is the whole Foundry surface this function touches:
   * an `effects` list whose members answer `getFlag` and carry
   * `disabled`. Measured live on 24 September 2026 — a real effect read
   * one ball, reading it again with `disabled: true` read none, and
   * re-enabling it read one.
   */
  const fakeBall = (disabled) => ({
    disabled,
    getFlag: (system, flag) => (system === "trg-prime" && flag === DIRECTED_STRIKE_FLAG
      ? { label: "Ball Lightning", formula: "6d8", damageType: "electricity",
        save: "reflex", rangeFeet: 40, saveDC: 25, targetUuid: "Actor.A" }
      : null)
  });
  ok("F7 a running ball is found",
    runningBalls({ effects: [fakeBall(false)] }).length === 1);
  ok("F7b a disabled ball does not strike",
    runningBalls({ effects: [fakeBall(true)] }).length === 0,
    "measured live: an Antimagic Field disables the effect, and a disabled one must stop firing");
  ok("F7c an effect carrying no ball is ignored",
    runningBalls({ effects: [{ disabled: false, getFlag: () => null }] }).length === 0);
  ok("F7d a malformed ball is not returned as a running one",
    runningBalls({ effects: [{ disabled: false, getFlag: () => ({ formula: "6d8" }) }] }).length === 0,
    "no damage type and no save — it would reach the turn clock and throw");
  ok("F7e and an actor with no effects at all answers cleanly",
    runningBalls(null).length === 0 && runningBalls({}).length === 0);
  ok("F8 the sweep swallows its own failure",
    /catch \(error\) \{[\s\S]*?a directed strike could not be fired this turn/.test(src),
    "it runs inside the turn-advance path; a throw would leave the encounter mid-turn");
}

/* ================================================================== *
 * G. THE CLOCK — THE CASTER'S TURN, AT ITS START
 * ================================================================== */

ok("G1 the ball is fired from the start of a turn",
  /for \(const bolt of await fireDirectedStrikes\(actor, combatant\.token\?\.object \?\? null\)\)/
    .test(codeOnly("module", "documents", "combat.mjs")),
  "\"At the START of each of your turns\" — the page names the boundary");
ok("G2 it sits in _onStartTurn, not _onEndTurn",
  (() => {
    const src = codeOnly("module", "documents", "combat.mjs");
    const start = src.indexOf("async _onStartTurn");
    const end = src.indexOf("async _onEndTurn");
    const fire = src.indexOf("fireDirectedStrikes(actor");
    return start > -1 && end > -1 && fire > start && fire < end;
  })(),
  "the recurring ladder is at the other boundary; measuring one and calling it the other is the shape");
ok("G3 it asks the ACTOR whose turn is starting what balls they have",
  /export async function fireDirectedStrikes\(caster, casterToken\)/
    .test(codeOnly("module", "magic", "directed-strike-workflow.mjs")),
  "it is the caster's turn that matters, not the target's, and not who is standing where");

/* ================================================================== *
 * H. THE ONE INFERENCE, SAID OUT LOUD
 * ================================================================== */

ok("H1 the reading is recorded in the rule module's header",
  /THE ONE THING STILL INFERRED/.test(code("module", "magic", "directed-strike.mjs")),
  "ruling 3 governs where the ball may be SENT; the page says nothing about a target who runs");
ok("H2 and the card says so on a turn where it matters",
  /beyond the spell's range/.test(
    directedStrikeLine("Ball Lightning", "Foe", { redirected: false, outOfRange: true })),
  "a reading the table cannot see is a reading nobody can correct");
ok("H3 but not on a turn where it does not",
  !/beyond the spell's range/.test(
    directedStrikeLine("Ball Lightning", "Foe", { redirected: false, outOfRange: false })),
  "a caveat on every line is a caveat nobody reads");
ok("H4 a redirect is never flagged out of range, because it cannot be",
  !/beyond the spell's range/.test(
    directedStrikeLine("Ball Lightning", "Foe", { redirected: true, outOfRange: true })),
  "the picker only offers creatures inside it");

/* ================================================================== *
 * I. THE AUTHORING SCRIPT
 * ================================================================== */

{
  const src = codeOnly("tools", "author-ball-lightning.mjs");
  ok("I1 it replaces the field it owns",
    /y\.effects = \[/.test(src) && !/y\.effects\.push\(/.test(src));
  ok("I2 and does not spread the warp's existing mods",
    !/mods: \{ \.\.\./.test(src),
    "block 25 carried extraTargets and targetCap together for two runs that way");
  ok("I3 the flag name is taken from the rule, not retyped",
    DIRECTED_STRIKE_FLAG === "directedStrike"
    && codeOnly("module", "magic", "directed-strike-workflow.mjs")
      .includes("[DIRECTED_STRIKE_FLAG]:"));
}

/* ================================================================== */

process.stdout.write(failures.length
  ? `\nverify-ball-lightning: FAILED — ${failures.length} of ${checks}:\n  ${failures.join("\n  ")}\n`
  : `\nverify-ball-lightning: OK — ${checks} checks. The ball is aimed every turn, and a forgotten free action costs the choice, not the strike.\n`);
process.exit(failures.length ? 1 : 0);
