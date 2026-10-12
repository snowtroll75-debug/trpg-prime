#!/usr/bin/env node
/**
 * verify-luminance — an emanation that acts on a clock rather than on a
 * boundary.
 *
 * NEW at 3.435.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SPELL, AND THE FIFTH MECHANISM.
 *
 * "A bright light emanates from you in a 10-foot radius... All creatures
 * that BEGIN THEIR TURN in the radius are healed of 1d8 HP, or in the
 * case of an Undead creature, take 1d8 HP of essence damage. At the
 * beginning of each of your turns, you can Sustain the spell to increase
 * the healing by 1d8 (max 5d8) or allow the spell to remove 1 point of
 * bleed damage."
 *
 * Four mechanisms already exist and every one answers "what is TRUE of
 * you while you stand here" — Bless's travelling bonus, Bane's
 * remembered save, Song Of Despair's floor, Protective Ward's growing
 * circle. This one answers "what HAPPENS to you, and WHEN", so it hangs
 * off the turn clock and the movement sweep never touches it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE PACK ENTRY WAS EMPTY IN FIVE PLACES, which is why the spell did
 * nothing at all: no area (so it was not an emanation), `sustained:
 * false` (so no entry, no Magic-tab row, no Sustain target), no
 * sustainType, no effects (so it healed nobody) and no declared choices.
 *
 * GRAHAM'S RULINGS, 29 August 2026: the healing is automatic; an undead
 * is identified by its creature type; the Sustain asks each time; and
 * bleed removal, once bought, applies every round to everyone healed.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  luminanceChoiceRefusal, luminanceState, luminanceSustain, luminanceSustainOptions,
  luminanceTurnEffect, luminanceWarpedLimits
} from "../module/magic/luminance.mjs";
import { emanationIsLive } from "../module/magic/emanation.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const flow = read("module", "magic", "luminance-workflow.mjs");
const combat = read("module", "documents", "combat.mjs");
const sustain = read("module", "magic", "sustain-workflow.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");

const strip = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
/** One named function's body, so a claim is about it and not the file. */
function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  return start === -1 ? "" : src.slice(start);
}
function before(body, a, b) {
  const clean = strip(body);
  const i = clean.indexOf(a), j = clean.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

/* ================================================================== *
 * A. THE STATE ONE CASTING CARRIES
 * ================================================================== */

ok("A1 a fresh casting is 1d8 and no bleed removal",
  luminanceState(null).healingDice === 1 && luminanceState(null).bleedRemoved === 0);
// A SPELL CAST BEFORE THIS RELEASE HAS NO RECORD, and that is a spell at
// its printed strength rather than a broken one.
ok("A2 a missing record reads as the printed spell",
  luminanceState(undefined).healingDice === 1);
ok("A3 a stored state is read back", luminanceState({ healingDice: 3, bleedRemoved: 2 }).healingDice === 3);
ok("A4 and clamped to the cap",
  luminanceState({ healingDice: 99 }, 5).healingDice === 5,
  "a hand-edited flag must not out-heal the printed maximum");
ok("A5 rubbish reads as the base", luminanceState({ healingDice: "x" }).healingDice === 1);

/* ================================================================== *
 * B. WHAT A SUSTAIN BUYS
 * ================================================================== */

const base = luminanceState(null);
const oneDie = luminanceSustain(base, "healing");
ok("B1 healing rises by one die", oneDie.state.healingDice === 2 && oneDie.changed);
ok("B2 and says so", /rises to <strong>2d8/.test(oneDie.note));
const bled = luminanceSustain(base, "bleed");
ok("B3 bleed removal rises by one", bled.state.bleedRemoved === 1 && bled.changed);
ok("B4 leaving the healing alone", bled.state.healingDice === 1,
  "one Sustain buys one thing");
// AT THE CAP IT REPORTS WHAT HAPPENED, NOT WHAT WAS ASKED — Song Of
// Despair's lesson, applied at the source.
const capped = luminanceSustain(luminanceState({ healingDice: 5 }, 5), "healing");
ok("B5 a Sustain at the cap changes nothing", capped.changed === false && capped.state.healingDice === 5);
ok("B6 and says that rather than announcing a die",
  /already at its maximum/.test(capped.note) && !/rises to/.test(capped.note));
// BLEED HAS NO PRINTED CEILING, so none is invented.
ok("B7 bleed removal is never capped",
  luminanceSustain(luminanceState({ bleedRemoved: 9 }), "bleed").state.bleedRemoved === 10);

const options = luminanceSustainOptions(luminanceState({ healingDice: 5 }, 5));
ok("B8 the capped option is offered but disabled",
  options.length === 2 && options[0].available === false,
  "a picker whose contents change shape is one a player must re-read every round");
ok("B9 and the bleed option stays live", options[1].available === true);

/* ================================================================== *
 * C. WHAT A CREATURE RECEIVES
 * ================================================================== */

const state = luminanceState({ healingDice: 3, bleedRemoved: 2 }, 5);
const living = luminanceTurnEffect({ state, undead: false });
const undead = luminanceTurnEffect({ state, undead: true });
ok("C1 the living are healed", living.mode === "heal" && living.formula === "3d8");
// A DAMAGE PACKET WITH A TYPE, not a negative heal — so resistances and
// immunities to essence apply, which a subtraction would skip entirely.
ok("C2 the undead take essence damage",
  undead.mode === "damage" && undead.damageType === "essence" && undead.formula === "3d8");
ok("C3 the dice grow with the Sustains spent", living.formula === "3d8");
ok("C4 bleed is removed from those it heals", living.bleedRemoved === 2);
ok("C5 and not from those it burns", undead.bleedRemoved === 0,
  "a creature the spell is searing is not being tended");

/* ================================================================== *
 * D. THE WARP LIFTS BOTH ENDS
 * ================================================================== */

// "+2 PP: increase the healing amount AND THE SUSTAINED MAX by 1d8" —
// reading it as raising only the start would let one Sustain hit a cap
// the caster had paid to lift.
ok("D1 an unwarped casting is 1d8 rising to 5d8",
  luminanceWarpedLimits(null).startingDice === 1 && luminanceWarpedLimits(null).maxDice === 5);
ok("D2 one warp raises both ends",
  luminanceWarpedLimits({ damageDice: "1d8" }).startingDice === 2
  && luminanceWarpedLimits({ damageDice: "1d8" }).maxDice === 6);
ok("D3 two warps raise both by two",
  luminanceWarpedLimits({ damageDice: "2d8" }).startingDice === 3
  && luminanceWarpedLimits({ damageDice: "2d8" }).maxDice === 7);
ok("D4 a dice string it cannot read adds nothing",
  luminanceWarpedLimits({ damageDice: "3d6" }).maxDice === 5);

/* ================================================================== *
 * E. THE PACK ENTRY
 * ================================================================== */

const spellDir = path.join(SYSTEM_ROOT, "packs", "spells");
if (fs.existsSync(spellDir)) {
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(spellDir, { valueEncoding: "json" });
  await db.open();
  let lum = null;
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!items!") && value?.name === "Luminance") lum = value;
  }
  await db.close();
  ok("E1 Luminance is in the pack", Boolean(lum));
  if (lum) {
    const s = lum.system;
    ok("E2 its area is an emanation", /emanation/i.test(s.area), JSON.stringify(s.area));
    ok("E3 it is sustainable", s.sustained === true,
      "false left no entry, no Magic-tab row and no emanation record");
    ok("E4 by the round shape, not duration", s.sustainType === "round",
      '"duration" would lapse a spell whose printed duration is a flat minute');
    const perTurn = (s.effects ?? []).find((e) => e.kind === "perTurn");
    ok("E5 it carries a perTurn effect", Boolean(perTurn),
      "the effects array was empty, so the spell healed nobody");
    ok("E6 healing the living and burning the undead",
      perTurn?.mode === "heal" && perTurn?.undeadMode === "damage"
      && perTurn?.undeadDamageType === "essence");
    ok("E7 and the choices a Sustain offers are declared",
      Array.isArray(s.sustainChoices) && s.sustainChoices.length === 2
      && s.sustainChoices.some((c) => c.key === "healing")
      && s.sustainChoices.some((c) => c.key === "bleed"));
    ok("E8 the cap on the entry matches the printed 5d8",
      s.sustainChoices?.find((c) => c.key === "healing")?.max === 5);
  }
}

/* ================================================================== *
 * F. THE WIRING
 * ================================================================== */

// THE TURN CLOCK, NOT THE MOVEMENT SWEEP. "Creatures that BEGIN THEIR
// TURN in the radius" is a question movement cannot answer.
ok("F1 the per-turn effect fires at the start of a turn",
  /await applyPerTurnEmanations\(actor, combatant\.token\?\.object \?\? null\)/.test(combat));
ok("F2 an undead is identified by its creature type",
  /import \{ isUndead \} from "\.\.\/aligned\.mjs";/.test(flow) && /isUndead\(actor\.system\)/.test(flow),
  "Graham, 29 August 2026 — not guessed from a name or an alignment");
ok("F3 membership is measured, not assumed",
  /emanationMembers\(\{/.test(flow) && /if \(!inside\.length\) continue;/.test(flow));
// A DAMAGE PACKET, so resistances apply.
ok("F4 the undead take damage through the damage pipeline",
  /resolveAgainstDefences\(actor\.system \?\? \{\}, \{/.test(flow)
  && /applyDamageAndCheckDying\(actor, packet\.taken\)/.test(flow),
  "a negative heal would bypass every resistance and immunity");
// HEALING IS CAPPED AT THE MAXIMUM, and the card reports what landed.
ok("F5 healing never exceeds the missing HP",
  /Math\.min\(amount, Math\.max\(0, max - before\)\)/.test(flow));
ok("F6 and a creature at full health is told so",
  /already at full health/.test(flow),
  "saying 'healed 6' over an unchanged HP bar is the card lying");

// SCOPED TO THE FUNCTION. `ensureActionPoints` is imported at the top of
// the file, so a whole-file ordering claim is decided by line 20 and says
// nothing about the call site. The import trap, met for the sixth time in
// this project and the second time in a file whose own comments warn
// about it.
// ANCHORED ON THE CALL, NOT THE NAME. Until 3.436.0 this asked for
// "promptLuminanceChoice" before "ensureActionPoints" — and the name also
// appears in the `await import(...)` destructure two lines above the call,
// so deleting the call entirely still satisfied it. The import trap for
// the SEVENTH time, this time inside the check written to avoid it.
ok("F7 the Sustain asks before it charges",
  before(bodyOf(sustain, "export async function sustainSpellAction(actor, { spellId = null } = {}) {"),
    "await promptLuminanceChoice(actor, entry)", "ensureActionPoints"),
  "a cancelled picker must cost nothing");
ok("F8 a cancelled choice stops the Sustain",
  /if \(offersChoice && !choice\) return null;/.test(sustain));
ok("F9 and the card reports which was bought",
  /const bought = choiceNote/.test(sustain));

// TIGHTENED AT 3.586.0, and by its own mutation. This matched
// `sustainChoices: Array.isArray(spellData.sustainChoices)` anywhere in
// cast-workflow — fine while there was one such line, and worthless the
// moment a SECOND appeared. 3.586.0 added one, recording the choices on
// the active-spell ENTRY so a spell with no area can offer them at all;
// `mutate-luminance` then neutered the EMANATION copy and this check
// went on passing, matching the new line instead.
//
// It is the same shape as F7's note three assertions up: a check
// satisfied by an occurrence that has nothing to do with what it claims.
// Pinned to the emanation copy by the line that follows it, which is
// where the two differ.
ok("F10 the cast records the declared choices ON THE EMANATION",
  /sustainChoices: Array\.isArray\(spellData\.sustainChoices\)\s*\n\s*\? spellData\.sustainChoices\.map\(\(c\) => \(\{ \.\.\.c \}\)\) : \[\],/.test(cast),
  "a second such line now exists for the entry, and this one is not it");
ok("F11 and the cap the warps left",
  /maxDice: luminanceOpeningState\(warpMods\)\.maxDice/.test(cast));

ok("F6b and the sear line reports the roll as well as the damage",
  /rolled \$\{amount\}/.test(flow.slice(flow.indexOf("sears the undead"))),
  "'0 essence damage' alone cannot tell an immunity from a bad die");
ok("F6c and says so when defences ate it",
  /reduced by its defences/.test(flow));

/* ================================================================== *
 * G. THE GATE IN FRONT OF ALL OF IT
 * ================================================================== *
 *
 * FOUND BY DRIVING THE SPELL LIVE ON 29 AUGUST 2026, with 42 checks
 * already green and every one of the 14 mutations caught.
 *
 * `emanationIsLive` decides whether a cast records an emanation at all.
 * It asked two questions — is the area an emanation, and is there an
 * effect kind that follows the area — and `LIVE_EMANATION_EFFECT_KINDS`
 * held only `["bonus"]`. Luminance's only live effect is `perTurn`, so
 * the answer was NO: no `recordEmanation`, no running emanation, and the
 * whole mechanism built for this spell iterating an empty list for ever.
 * The chat card said "10 ft emanation template placed — caught 3" and
 * nothing was healed, then or on any turn after.
 *
 * EVERY CHECK IN SECTION F PASSED THROUGHOUT. They asked whether the
 * wiring existed; not one asked whether it was ever reached. The gate is
 * a pure function that has been importable all along — this is the
 * question I did not think to ask, written down so it is asked for ever.
 */

const LUMINANCE_SHAPE = {
  area: "10-foot emanation",
  effects: [
    { kind: "perTurn", mode: "heal", formula: "1d8", undeadMode: "damage", undeadDamageType: "essence" },
    { kind: "note", text: "Light within the radius is increased by three steps." }
  ]
};

ok("G1 a per-turn emanation is a LIVE emanation",
  emanationIsLive(LUMINANCE_SHAPE) === true,
  "without this the cast records nothing and the turn pass has nothing to find");
ok("G2 a bonus emanation still is", emanationIsLive({
  area: "20-foot emanation", effects: [{ kind: "bonus", value: 1 }]
}) === true, "Bless must not be broken by widening the gate");
// THE GATE IS NOT OPENED TO EVERYTHING. A spell whose only effect is a
// line of text for a person to read has nothing that follows the area.
ok("G3 a note-only emanation is not live",
  emanationIsLive({ area: "10-foot emanation", effects: [{ kind: "note", text: "x" }] }) === false);
ok("G4 and the area word is still required",
  emanationIsLive({ area: "10-foot radius centred on you", effects: LUMINANCE_SHAPE.effects }) === false,
  "Protective Ward's first fault, still refused");

// THE CARD MUST NOT CALL IT BROKEN. Falling through to the applier's
// default printed 'Unhandled effect kind "perTurn"' once per creature
// caught — three lines on Luminance's first live card.
const applier = read("module", "magic", "spell-effects.mjs");
ok("G5 the cast applier knows perTurn is somebody else's job",
  /case "perTurn":/.test(strip(applier)),
  "the turn clock owns it; the applier must say nothing rather than 'Unhandled'");

/* ================================================================== *
 * H. A CHOICE THAT BUYS NOTHING IS REFUSED (3.436.0)
 * ================================================================== *
 *
 * Reported rather than shipped as a defect on 29 August 2026: the picker
 * disables the capped option, so an AP could only be spent on it by
 * forcing a disabled control. Graham asked for the guard anyway, and he
 * is right — the disabled control is UI, this is the rule, and the two
 * should not be able to disagree.
 *
 * NOT PROTECTIVE WARD'S REFUSAL. There the whole Sustain is refused,
 * because a ward at its cap has nothing else to sell. Here only one of
 * two options can be exhausted, so the refusal is about the CHOICE.
 */

const cappedState = luminanceState({ healingDice: 5 }, 5);
ok("H1 the capped healing choice is refused",
  /already at its maximum/.test(luminanceChoiceRefusal(cappedState, "healing") ?? ""));
// THE DANGEROUS DIRECTION, and the one that would make the spell worse
// than before: bleed removal has no printed ceiling, so a Sustain spent
// on it can never buy nothing however high the dice have climbed.
ok("H2 bleed removal is never refused", luminanceChoiceRefusal(cappedState, "bleed") === null,
  "the printed spell puts no ceiling on it");
ok("H3 a healing choice below the cap is never refused",
  luminanceChoiceRefusal(luminanceState({ healingDice: 4 }, 5), "healing") === null);
ok("H4 a warped cap is refused only at the warped maximum",
  luminanceChoiceRefusal(luminanceState({ healingDice: 5 }, 6), "healing") === null
  && luminanceChoiceRefusal(luminanceState({ healingDice: 6 }, 6), "healing") !== null,
  "a caster who paid to lift the ceiling must be able to reach it");
ok("H5 no choice, no refusal", luminanceChoiceRefusal(cappedState, null) === null);

// SCOPED TO THE FUNCTION, for the same reason F7 is: `ensureActionPoints`
// is imported at the top of the file, so a whole-file ordering claim is
// decided by line 20. The import trap, met seven times in this project.
ok("H6 the refusal is asked before the AP is charged",
  before(bodyOf(sustain, "export async function sustainSpellAction(actor, { spellId = null } = {}) {"),
    "luminanceRefusal(entry", "ensureActionPoints"),
  "a refused Sustain must keep its action point");
// A SPELL THAT DECLARES NO CHOICES IS NEVER REFUSED BY THIS PATH —
// Bless, Bane and Protective Ward must be untouched by it.
// SCOPED TO THE REFUSAL'S OWN BODY. The identical guard opens
// `promptLuminanceChoice` as well, so a whole-file claim was satisfied by
// the picker's copy while the refusal's had been deleted — the same trap
// as F7 above, found by the same mutation run.
ok("H7 a spell with no declared choices is never refused",
  /if \(!choices\.length\) return null;/.test(
    strip(bodyOf(flow, "export function luminanceRefusal(entry, choice, name"))));

/* ================================================================== */

const label = "verify-luminance";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
