#!/usr/bin/env node
/**
 * verify-spell-maneuver — a spell that performs a basic action.
 *
 * NEW at 3.401.0, for Tanglefoot (Chapter 10, PP 0).
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION C IS THE POINT: THE SPELL MUST NOT HOLD ITS OWN COPY.
 *
 * The temptation with Tanglefoot was to write its outcomes out — grabbed
 * on a success, grabbed plus a -4 to Escape on a critical — and that
 * would have been a second copy of a table Graham has already corrected
 * once, against a TYPO in the printed book. The book says a critical
 * leaves the target "immobilised"; `grabbed` is a strict superset of
 * immobilised, so as printed a critical left the target LESS affected
 * than a success. Rolling better made things worse.
 *
 * So C does not assert what grapple does. It asserts that the SPELL and
 * the ACTION return the same thing, from the same table — which stays
 * true when the table changes and fails the moment somebody writes a
 * second copy.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND SECTION E RECORDS A CLAIM I GOT WRONG. I told Graham that
 * finishing Tanglefoot meant extracting grapple from action-workflow.mjs
 * "where nothing can currently call it". Grapple's outcomes had been
 * data for months; the only thing genuinely trapped was the size-penalty
 * table. E checks that what I said needed extracting is in fact
 * reachable, so the claim cannot quietly be made again.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  spellManeuverModifiers, spellManeuverEffects, spellManeuverLanded, spellIsManeuver
} from "../module/magic/spell-maneuver.mjs";
import {
  MANEUVER_SIZE_PENALTY, maneuverSizePenalty, sizeCategoryDifference
} from "../module/combat/attack.mjs";
import {
  basicActionConditionEffects, BASIC_ACTION_CONDITION_EFFECTS
} from "../module/combat/basic-action-conditions.mjs";
import { spellDealsDamage, spellInflictsCriticalInjury } from "../module/magic/spell-damage.mjs";
import { BASIC_ACTIONS } from "../module/data/basic-actions.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const TANGLEFOOT_PENALTY = -4;
const ACTION = "grappleAttack";

/* ================================================================== *
 * A. The spell's own penalty
 * ================================================================== */

{
  const mods = spellManeuverModifiers({
    actionKey: ACTION, spellPenalty: TANGLEFOOT_PENALTY,
    actorSize: "medium", targetSize: "medium", label: "Tanglefoot"
  });
  ok("A1 the spell's penalty is applied", mods.some((m) => m.value === -4));
  ok("A2 it is labelled with the spell", mods.some((m) => m.label === "Tanglefoot"));
  // A3. UNTYPED, SO IT ALWAYS APPLIES. A circumstance penalty would be
  // pooled highest-wins against the size penalty and one of them would
  // vanish — which is the whole reason these are two entries.
  ok("A3 the spell's own penalty is untyped",
    mods.find((m) => m.label === "Tanglefoot")?.type === "untyped",
    "typed, it would pool against the size penalty and one would be lost");
  ok("A4 against an equal-sized target there is nothing else", mods.length === 1,
    JSON.stringify(mods));
  ok("A5 no penalty means no entry",
    spellManeuverModifiers({ actionKey: ACTION, spellPenalty: 0 }).length === 0);
}

/* ================================================================== *
 * B. The size penalty, on top — Graham's ruling of 25 August
 * ================================================================== */

const total = (over) => spellManeuverModifiers({
  actionKey: ACTION, spellPenalty: TANGLEFOOT_PENALTY,
  actorSize: "medium", label: "Tanglefoot", ...over
}).reduce((n, m) => n + m.value, 0);

ok("B1 an equal-sized target is just the spell's -4", total({ targetSize: "medium" }) === -4);
ok("B2 one category larger is still just -4", total({ targetSize: "large" }) === -4,
  "grapple's threshold is TWO categories, not one");
// B3. GRAHAM'S RULING. "Perform a grapple action" brings the action's
// rules with it, so the size penalty stacks on the spell's own.
ok("B3 two categories larger adds the action's -4", total({ targetSize: "huge" }) === -8,
  `got ${total({ targetSize: "huge" })}`);
ok("B4 three categories larger is cumulative",
  total({ targetSize: "gargantuan" }) === -12, `got ${total({ targetSize: "gargantuan" })}`);
ok("B5 a smaller target adds nothing", total({ targetSize: "small" }) === -4);

// B6. THE SIZE PENALTY IS A CIRCUMSTANCE PENALTY, which is what the
// action itself applies it as.
{
  const mods = spellManeuverModifiers({
    actionKey: ACTION, spellPenalty: -4, actorSize: "medium", targetSize: "huge"
  });
  ok("B6 the size penalty is a circumstance penalty",
    mods.find((m) => m.label === "Target size")?.type === "circumstance");
}

// B7. READ FROM THE ACTION'S TABLE, NOT WRITTEN HERE. Disarm's threshold
// differs, and a spell that later borrowed it must get Disarm's rule.
ok("B7 the table is the action's own, not a copy",
  spellManeuverModifiers({ actionKey: "disarmAttack", spellPenalty: 0,
    actorSize: "medium", targetSize: "large" })
    .some((m) => m.value === maneuverSizePenalty(
      sizeCategoryDifference("medium", "large"),
      MANEUVER_SIZE_PENALTY.disarmAttack.threshold,
      MANEUVER_SIZE_PENALTY.disarmAttack.perCategory)),
  "Disarm penalises at ONE category where grapple needs two");
ok("B8 an unknown action adds no size penalty",
  spellManeuverModifiers({ actionKey: "notAnAction", spellPenalty: -4,
    actorSize: "medium", targetSize: "gargantuan" }).length === 1);

/* ================================================================== *
 * C. The outcomes come from the ACTION, never from the spell
 * ================================================================== */

const DEGREES = ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"];

for (const degree of DEGREES) {
  // THE WHOLE POINT. Not "a critical grabs" — that would be a second
  // copy of a table already corrected once. The spell and the action
  // must return the SAME thing, whatever that is.
  ok(`C1 ${degree}: the spell returns exactly what the action does`,
    JSON.stringify(spellManeuverEffects(ACTION, degree))
      === JSON.stringify(basicActionConditionEffects(ACTION, degree)),
    "a divergence here is a second copy of the outcome table");
}

// C2. AND THE TABLE STILL SAYS THE CORRECTED THING. Graham's August fix
// against the book's typo: a critical must GRAB, not merely immobilise,
// because grabbed is a strict superset — as printed, a critical left the
// target less affected than a success.
{
  const crit = basicActionConditionEffects(ACTION, "critical");
  ok("C2 a critical grabs the target", crit.some(
    (e) => e.conditionKey === "grabbed" && e.active === true),
    "the printed 'immobilised' is a typo; grabbed is a superset of it");
  ok("C2b and carries the extra Escape penalty",
    crit.some((e) => Array.isArray(e.conditionals) && e.conditionals.length),
    "the corrected critical adds -4 to Escape checks");
  ok("C2c a success grabs without it",
    basicActionConditionEffects(ACTION, "success")
      .some((e) => e.conditionKey === "grabbed" && e.active === true));
  ok("C2d a critical is not weaker than a success",
    crit.filter((e) => e.active).length >= basicActionConditionEffects(ACTION, "success")
      .filter((e) => e.active).length,
    "rolling better must not make things worse — the bug the correction fixed");
}

// C3. A FAILURE IS NOT NOTHING. "If you already had the target grabbed
// or immobilised, those conditions end" — a failed Tanglefoot RELEASES
// a creature the caster was already holding.
{
  const fail = spellManeuverEffects(ACTION, "failure");
  ok("C3 a failure releases an existing grab",
    fail.some((e) => e.conditionKey === "grabbed" && e.active === false),
    JSON.stringify(fail));
  ok("C3b and it counts as having landed something",
    spellManeuverLanded(ACTION, "failure") === true,
    "a card saying 'no effect' would hide a creature being let go");
}
ok("C4 a degree the action says nothing about lands nothing",
  spellManeuverLanded(ACTION, "partial") === false);

/* ================================================================== *
 * D. The pack carries the spell, not a description of it
 * ================================================================== */

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
ok("D0 the spells pack could be read", spells !== null);
const spell = spells?.get("tanglefoot") ?? null;
ok("D1 Tanglefoot is a real spell", spell !== null);

if (spell) {
  const maneuver = (spell.system?.effects ?? []).find((e) => e.kind === "maneuver");
  ok("D2 it carries a maneuver effect", Boolean(maneuver),
    JSON.stringify(spell.system?.effects));
  if (maneuver) {
    ok("D3 it performs a grapple", maneuver.action === ACTION, `action: ${maneuver.action}`);
    ok("D4 with the printed -4", Number(maneuver.penalty) === TANGLEFOOT_PENALTY,
      `penalty: ${maneuver.penalty}`);
    ok("D5 against the target, not the caster", maneuver.target === "targets");
    // D6. THE ACTION IT NAMES IS REAL. The Improved Combat Reflexes
    // shape: a key nothing matches is a spell that silently does nothing.
    ok("D6 the action it names exists",
      BASIC_ACTIONS.some((a) => a.key === maneuver.action),
      `no basic action with key "${maneuver.action}"`);
  }
  // D6b. IT IS STILL AN ATTACK SPELL, and that is the point of the fix.
  // My first attempt relabelled the category to "utility" to stop a
  // spurious second attack roll — which stopped the symptom by lying
  // about the spell. Graham's ruling put it right: attack spells follow
  // the attack-action path, and a spell emulating an action that deals
  // no damage deals none and inflicts no critical either. So the
  // category stays true and the MECHANISM skips the second roll.
  ok("D6b Tanglefoot is still an attack spell",
    String(spell.system?.category ?? "").toLowerCase() === "attack",
    "the book prints it as one; relabelling it was the wrong lever");
  ok("D6c and the mechanism recognises it as a maneuver",
    spellIsManeuver(spell.system) === true,
    "this is what stops the spell-attack and damage pipeline running as well");

  // D7. AND THE PROSE NOTE IS GONE. It described the rule instead of
  // performing it — automation that is really a reminder.
  ok("D7 the prose note has been replaced, not kept alongside",
    !(spell.system?.effects ?? []).some((e) => e.kind === "note" && /Spellcraft/i.test(e.text ?? "")),
    "a note describing what the maneuver now does would be a second answer");
}

/* ================================================================== *
 * G. A Heroic is never worse than a Success
 * ================================================================== *
 *
 * FOUND BY THE LIVE PASS ON 3.402.0. A forced natural 20 went
 * open-ended to 36, produced a HEROIC, and the card read "heroic — no
 * effect" — a 22-point margin applying nothing where an 11-point margin
 * grabs. Not one action declared a `heroic` entry.
 *
 *   "Heroic: The check succeeds in the best way possible; this result is
 *    treated as a Critical with extra benefit."  — Actions Resolution Table
 *
 * This is the same bug basic-action-conditions.mjs already fixed once,
 * one degree higher: its note on grapple's critical ends "Rolling better
 * made things worse." G1 is that sentence turned into a check, and it is
 * written over EVERY action in the table rather than the five that have
 * a critical today — so an action added tomorrow cannot reintroduce it.
 */

for (const actionKey of Object.keys(BASIC_ACTION_CONDITION_EFFECTS)) {
  const heroic = basicActionConditionEffects(actionKey, "heroic");
  const critical = basicActionConditionEffects(actionKey, "critical");
  const success = basicActionConditionEffects(actionKey, "success");

  // G1. THE INVARIANT. Rolling better must not do less.
  ok(`G1 ${actionKey}: a heroic is not weaker than a success`,
    heroic.filter((e) => e.active).length >= success.filter((e) => e.active).length,
    `heroic applies ${heroic.length}, success applies ${success.length}`);
  ok(`G1b ${actionKey}: a heroic is not weaker than a critical`,
    heroic.filter((e) => e.active).length >= critical.filter((e) => e.active).length);

  // G2. AND WHERE A CRITICAL EXISTS, THE HEROIC IS IT — "treated as a
  // Critical" is the printed floor, so the fallback returns the critical
  // itself rather than an approximation of it.
  if (critical.length) {
    ok(`G2 ${actionKey}: a heroic falls back to the critical`,
      JSON.stringify(heroic) === JSON.stringify(critical),
      `heroic ${JSON.stringify(heroic)} vs critical ${JSON.stringify(critical)}`);
  }
}

// G3. ONLY HEROIC FALLS BACK. A partial does not become a success and a
// fumble does not become a failure — the book defines those as their own
// outcomes, and only Heroic is written as "treated as" another degree.
ok("G3 a partial does not fall back to a success",
  basicActionConditionEffects("grappleAttack", "partial").length === 0,
  "only Heroic is printed as being treated as another degree");
ok("G3b a blunder does not fall back to a fumble",
  basicActionConditionEffects("grappleAttack", "blunder").length === 0);
// G4. THE FALLBACK INVENTS NOTHING. `shoveAttack` declares only a
// fumble — no succeeding degree at all — so there is nothing below a
// heroic to fall back to and it stays empty.
//
// THIS CHECK ORIGINALLY NAMED `dropProne`, and that was wrong: dropProne
// declares a success, so its heroic correctly falls back to it. The
// check was written against the first, narrower fix (heroic -> critical
// only) and would have gone on asserting the bug it was meant to guard.
ok("G4 the fallback invents nothing where nothing succeeds",
  basicActionConditionEffects("shoveAttack", "heroic").length === 0,
  "shoveAttack declares only a fumble");
ok("G4b and a success-only action DOES lift its heroic",
  basicActionConditionEffects("dropProne", "heroic").length === 1,
  "dropProne declares a success and no critical — a heroic must not do less");
ok("G4c an unknown DEGREE returns nothing rather than throwing",
  basicActionConditionEffects("grappleAttack", "nonsense").length === 0,
  "the one thing the remaining guard is for");
ok("G5 an unknown action still returns nothing",
  basicActionConditionEffects("notAnAction", "heroic").length === 0);

/* ================================================================== *
 * H. No damage, no critical injury — Graham's Sickly Ray ruling
 * ================================================================== *
 *
 *   "This spell inflicts no actual HP damage."  — Sickly Ray
 *   "So it inflicts no critical as it inflicts no damage."  — Graham
 *
 * An injury is a wound and a wound needs damage. Without this a spell
 * dealing none can critically hit for ZERO and still maim its target —
 * which is what the live pass caught Tanglefoot doing, and which the
 * maneuver rule does not reach for Sickly Ray, since Sickly Ray really
 * does make a spell attack.
 */

ok("H1 a spell with a damage formula deals damage",
  spellDealsDamage({ damage: { formula: "1d6" } }) === true);
ok("H2 a multi-part damage spell deals damage",
  spellDealsDamage({ damage: { parts: [{ formula: "1d4" }] } }) === true);
// H3. MAGIC MISSILE AND ITS KIN carry damage in the effects array, not
// in `damage`. Checking only the obvious field would have called them
// damage-free and switched their criticals off.
ok("H3 a spell whose damage is an effect entry deals damage",
  spellDealsDamage({ effects: [{ kind: "damage", formula: "1d4+1" }] }) === true);
ok("H4 a spell with none deals none",
  spellDealsDamage({ damage: { formula: "" }, effects: [{ kind: "maneuver" }] }) === false);
ok("H5 a spell with nothing at all deals none", spellDealsDamage({}) === false);
ok("H6 nothing at all deals none", spellDealsDamage(undefined) === false);

ok("H7 no damage means no critical injury",
  spellInflictsCriticalInjury({ effects: [{ kind: "maneuver" }] }) === false);
ok("H8 damage means the injury still rolls",
  spellInflictsCriticalInjury({ damage: { formula: "2d6" } }) === true);

// H9. THE SEAM IS WIRED — the predicate is worth nothing if the cast
// workflow does not ask it before rolling the injury.
{
  const cast = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
  const text = fs.existsSync(cast) ? fs.readFileSync(cast, "utf8") : "";
  ok("H9 the cast workflow imports the predicate", /spellInflictsCriticalInjury/.test(text));
  /*
   * RE-ANCHORED at 3.600.0. The injury became a loop over a volley's rays, so a
   * three-ray Scorching Ray can injure more than one creature — the old anchor
   * read `spellAttack?.critical` and that field is now the FIRST ray's. The rule
   * is unchanged: no injury without the predicate.
   */
  ok("H9b and gates the critical injury on it",
    /if \(!ray\?\.critical \|\| !ray\.targetActor\) continue;\s*if \(!spellInflictsCriticalInjury\(spellData\)\) continue;\s*await rollCriticalInjury/
      .test(text),
    "the injury must be gated, not merely the predicate defined");
}

// H10. AND THE FIVE DAMAGE-FREE ATTACK SPELLS ARE STILL DAMAGE-FREE.
// Read from the pack, so a later edit that gave one of them a damage
// formula would surface here rather than silently switching criticals
// back on.
if (spells) {
  const DAMAGE_FREE = ["sickly ray", "spectral grasp", "tanglefoot",
    "tangling creepers", "telekinetic manoeuvre"];
  for (const name of DAMAGE_FREE) {
    const s = spells.get(name);
    ok(`H10 "${name}" is in the pack`, Boolean(s));
    if (s) {
      ok(`H10b "${name}" still inflicts no damage`,
        spellDealsDamage(s.system) === false,
        "if this now deals damage, its criticals switch back on — deliberate?");
    }
  }
}

/* ================================================================== *
 * F. Graham's ruling — one attack per spell
 * ================================================================== *
 *
 * "Attack spells follow the same path as attack actions as a general
 * rule. So if a spell emulates an attack action that does not inflict
 * damage (grapple, shove etc), it should also inflict no damage. Also,
 * such actions do not inflict criticals so the spells that emulate them
 * should not either." — 25 August 2026, after the live pass found
 * Tanglefoot critically hitting for zero damage and rolling a critical
 * injury on top of its own grapple.
 */

ok("F1 a spell carrying a maneuver is recognised",
  spellIsManeuver({ effects: [{ kind: "maneuver", action: ACTION }] }) === true);
ok("F2 a spell with other effects is not",
  spellIsManeuver({ effects: [{ kind: "note", text: "x" }, { kind: "bonus", value: 1 }] }) === false);
ok("F3 a spell with no effects is not", spellIsManeuver({ effects: [] }) === false);
ok("F4 a spell with no effects array is not", spellIsManeuver({}) === false);
ok("F5 nothing at all is not", spellIsManeuver(undefined) === false);
// F6. A MANEUVER AMONG OTHERS STILL COUNTS. A spell could carry a note
// beside its maneuver; the attack path must still be skipped.
ok("F6 a maneuver alongside other effects still counts",
  spellIsManeuver({ effects: [{ kind: "note" }, { kind: "maneuver", action: ACTION }] }) === true);

// F7. THE SEAM IS WIRED. The predicate is worth nothing if the cast
// workflow does not ask it — the "a rule with no caller is not
// automation" lesson, checked rather than trusted.
{
  const cast = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
  const text = fs.existsSync(cast) ? fs.readFileSync(cast, "utf8") : "";
  ok("F7 the cast workflow imports the predicate", /spellIsManeuver/.test(text));
  ok("F7b and uses it to decide whether the spell attacks",
    /isAttack\s*=[\s\S]{0,240}spellIsManeuver/.test(text),
    "the predicate must gate `isAttack`, which drives both the attack roll and damage");
}

/* ================================================================== *
 * E. What was already reachable — a claim I got wrong
 * ================================================================== */

// I said finishing Tanglefoot meant extracting grapple from
// action-workflow.mjs "where nothing can currently call it". These are
// the four things that were already callable, checked so the claim
// cannot be quietly repeated.
ok("E1 the grapple action is declared data",
  BASIC_ACTIONS.some((a) => a.key === ACTION));
{
  const grapple = BASIC_ACTIONS.find((a) => a.key === ACTION);
  ok("E2 it declares what it rolls against", grapple?.against === "fortitudeDC",
    `against: ${grapple?.against}`);
  ok("E3 it declares its own check type", grapple?.checkType === "unarmed",
    "which is exactly what Tanglefoot substitutes away from");
}
ok("E4 its outcomes are reachable as data",
  basicActionConditionEffects(ACTION, "success").length > 0);
ok("E5 the size-penalty table is reachable", Boolean(MANEUVER_SIZE_PENALTY[ACTION]));

// E6. THE ONE THING THAT REALLY WAS TRAPPED: the size table was a
// module-private constant in the workflow. It moved to attack.mjs beside
// the function that consumes it, and this is what stops a second copy
// reappearing in the workflow.
{
  const workflow = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
  const text = fs.existsSync(workflow) ? fs.readFileSync(workflow, "utf8") : "";
  ok("E6 the workflow no longer defines its own size table",
    !/const MANEUVER_SIZE_PENALTY_CONFIG = \{/.test(text),
    "two copies of one rule, with nothing to notice them drifting");
  ok("E6b and imports the shared one", /MANEUVER_SIZE_PENALTY/.test(text));
}

/* ================================================================== */

process.stdout.write(`verify-spell-maneuver: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
