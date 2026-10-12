#!/usr/bin/env node
/**
 * verify-light-shift — a spell that moves the illumination level.
 *
 * NEW at 3.490.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * UMBRAL VEIL (PP 1) SHIPPED WITH `effects: []`.
 *
 *   "Within a 20-foot emanation centred on the target, the illumination
 *    level is reduced by three steps (to a minimum of 2)."
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION A IS THE ARITHMETIC, AND ITS EDGE IS THE FLOOR.
 *
 * "To a minimum of 2" is where a reduction STOPS. It is not a level the
 * spell drags an area up to — casting Umbral Veil in Abyssal Darkness
 * must not brighten the room. That is the one case a sign-flipped
 * `raiseLightLevel` would have got wrong in the direction nobody tests.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION O IS THE ORDERING, AND IT IS THE SPELL.
 *
 * The shift is applied AFTER light sources. Umbral Veil reduces "the
 * illumination level" — the one that is actually there, torches
 * included. Applied first, a lantern carried into the shadow would light
 * it back to bright and the spell would have bought nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION N IS THE ANCHOR, WHICH IS THE ONLY NEW THING IN THE EMANATION
 * LOOP — AND IT HAS A THREE-STATE FIELD.
 *
 *   absent  →  the caster. Bless, Bane, every emanation before this.
 *   an id   →  that token. Umbral Veil, centred on its target.
 *   null    →  nothing. The cloak has been put down and stays put.
 *
 * `??` instead of `=== undefined` collapses the last two and snaps every
 * dropped cloak back to the caster on the next refresh — the whole decoy
 * undone by one operator, silently, and only in play.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { shiftLightLevel, raiseLightLevel, DEFAULT_LIGHT_LEVEL } from "../module/light.mjs";
import { regionLightShifts } from "../module/light-workflow.mjs";
import { emanationIsLive } from "../module/magic/emanation.mjs";
import { castWillRegister } from "../module/magic/active-spells.mjs";
import {
  normaliseLightShift, lightShiftLine, lightShiftDropLine, lightShiftDroppedLine
} from "../module/magic/light-shift.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ================================================================== *
 * A. THE ARITHMETIC — measured against all three printed spells
 * ================================================================== */

// Umbral Veil: -3, floor 2
equal("A1 bright light (8) drops three steps", shiftLightLevel(8, -3, 2), 5);
equal("A1b twilight (6) drops three steps", shiftLightLevel(6, -3, 2), 3);
equal("A2 THE FLOOR STOPS IT", shiftLightLevel(5, -3, 2), 2);
equal("A2b and holds at the floor", shiftLightLevel(3, -3, 2), 2);
equal("A2c a level already at the floor is unchanged", shiftLightLevel(2, -3, 2), 2);

// A3 THE EDGE THAT MATTERS. Abyssal Darkness is BELOW the floor. The
// spell must leave it alone, not raise it to the minimum.
equal("A3 A LEVEL BELOW THE FLOOR IS NOT RAISED TO IT", shiftLightLevel(1, -3, 2), 1);

// Darkness (PP 4): -4, floor 3, and warps that move BOTH numbers
equal("A4 Darkness as printed", shiftLightLevel(8, -4, 3), 4);
equal("A4b Darkness with its floor warped down", shiftLightLevel(6, -4, 2), 2);
equal("A4c and with a step warped on", shiftLightLevel(8, -5, 2), 3);

// Unwelcome Halo (PP 2): +2, no printed maximum
equal("A5 a raise goes up", shiftLightLevel(4, 2, 1), 6);
equal("A5b and stops at the top of the scale", shiftLightLevel(9, 2, 1), 10);
equal("A5c the floor is ignored for a raise", shiftLightLevel(4, 2, 8), 6);

equal("A6 a zero shift is a no-op", shiftLightLevel(7, 0, 1), 7);
equal("A6b and nonsense falls back to the default",
  shiftLightLevel("dark", -3, 2), DEFAULT_LIGHT_LEVEL);

// A7 IT IS NOT `raiseLightLevel` WITH A NEGATIVE, and the two must stay
// different: that one carries the SPECIAL-SENSE cap of 8, which would
// hold Unwelcome Halo below its own printed effect, and refuses
// negatives outright.
equal("A7 raiseLightLevel still refuses a negative", raiseLightLevel(8, -3), 8);
ok("A7b and still caps a raise at the special-sense limit",
  raiseLightLevel(7, 3) === 8 && shiftLightLevel(7, 3, 1) === 10,
  "a spell has no special-sense cap; a darkvision step does");

/* ================================================================== *
 * D. THE DECLARED ROW
 * ================================================================== */

ok("D1 a malformed row is refused", normaliseLightShift(null) === null
  && normaliseLightShift({ kind: "light" }) === null);
ok("D2 A SHIFT OF ZERO IS REFUSED",
  normaliseLightShift({ kind: "lightShift", steps: 0, radiusFeet: 20 }) === null,
  "a circle that changes nothing looks exactly like a broken one on the map");
ok("D3 and so is a circle with no radius",
  normaliseLightShift({ kind: "lightShift", steps: -3, radiusFeet: 0 }) === null);

const veil = normaliseLightShift({
  kind: "lightShift", steps: -3, floor: 2, radiusFeet: 20, follows: true, droppable: true
});
ok("D4 Umbral Veil's row reads back whole",
  veil.steps === -3 && veil.floor === 2 && veil.radiusFeet === 20
  && veil.follows === true && veil.droppable === true);

// D5 THE DEFAULTS ARE THE GENERAL CASE, not Umbral Veil's numbers.
const bare = normaliseLightShift({ kind: "lightShift", steps: 2, radiusFeet: 20 });
ok("D5 a row that declares no floor gets the bottom of the scale", bare.floor === 1);
ok("D5b following is the default, dropping is not",
  bare.follows === true && bare.droppable === false,
  "only Umbral Veil prints a decoy; it must be opt-in");

/* ================================================================== *
 * O. THE ORDERING, AND THE REGION FLAG
 * ================================================================== */

const lw = read("module", "light-workflow.mjs");

ok("O1 shifts are read from their own flag",
  lw.includes('r?.getFlag?.(SYSTEM_ID, "lightShift")'),
  "a shift is not an absolute level and must not share the lightLevel flag");

// O2 EVERY SHIFT, NOT THE FIRST. Two globes of Darkness overlapping are
// two spells doing their work.
const fakes = (...shifts) => shifts.map((s) => ({ getFlag: (_ns, k) => (k === "lightShift" ? s : undefined) }));
equal("O2 two overlapping circles both count",
  regionLightShifts(fakes({ steps: -3, floor: 2 }, { steps: -4, floor: 3 })).length, 2);
equal("O2b a region with no shift contributes nothing",
  regionLightShifts(fakes(null, { steps: -3, floor: 2 })).length, 1);
equal("O2c and neither does a zero one",
  regionLightShifts(fakes({ steps: 0, floor: 2 })).length, 0);

// O3 THE ORDERING IS THE SPELL. Applied before sources, a lantern would
// undo the shadow.
ok("O3 THE SHIFT IS APPLIED AFTER LIGHT SOURCES",
  lw.indexOf("resolveLightLevelWithSources(ambient, tokenDocument, scene)")
    < lw.indexOf("const shifts = regionLightShifts(tokenDocument?.regions);"),
  "a torch carried into the shadow must raise the level the shadow then reduces");
ok("O3b and it uses the pure arithmetic rather than its own",
  // 3.622.0: and its cap (block 39's R9).
  /for \(const shift of shifts\) level = shiftLightLevel\(level, shift\.steps, shift\.floor, shift\.cap\);/.test(lw),
  "one place decides what a step is worth");
// 3.620.0: AND NO WEATHER (Chapter 12, block 38's R16) — a scene's or a
// region's Weather shifts the level too, so both must be absent.
ok("O3c a token in no shifted region gets the untouched resolution",
  lw.includes("if (!shifts.length && !weather) return withSources;"));

/* ================================================================== *
 * N. THE ANCHOR — three states, and the one that is easy to lose
 * ================================================================== */

const em = read("module", "magic", "emanation-workflow.mjs");

ok("N1 THE ANCHOR DISTINGUISHES ABSENT FROM NULL",
  /emanation\.anchorTokenId === undefined\s*\n\s*\?\s*token\s*\n\s*:\s*emanation\.anchorTokenId === null\s*\n\s*\?\s*null/.test(em),
  "absent means the caster, null means nothing — `??` would collapse them and "
  + "snap every dropped cloak back to the caster");
ok("N1b a circle with no anchor is not moved",
  em.includes("if (region && anchorToken) {"),
  "a dropped cloak stays exactly where it was let go");
ok("N2 and membership measures from the same anchor",
  em.includes("const centreFeet = anchorToken\n    ? tokenCentreFeet(anchorToken.document)\n    : regionCentreFeet(region);"),
  "two answers to \"where is this circle\" means affecting one set and drawing another");
ok("N2b a dropped circle reads its place off its own Region",
  /function regionCentreFeet\(region\)/.test(em)
  && em.includes("if (!shape || shape.type !== \"circle\") return null;"),
  "the Region is where the circle actually is; a second copy could disagree");
// N2c ANCHORED ON THE CONDITION, NOT THE TAIL. The first version of this
// asserted that `}) : [];` appeared — the ELSE half of the ternary, which
// survives untouched when the TEST is replaced by `true`. A mutation
// walked straight through it. What matters is what is being asked, not
// that a branch exists somewhere below it.
ok("N2c and a circle that is gone catches nobody",
  em.includes("const inside = centreFeet ? emanationMembers({"),
  "falling back to the caster would quietly reattach a cloak they put down");

/* ================================================================== *
 * W. IS IT REACHED
 * ================================================================== */

const se = read("module", "magic", "spell-effects.mjs");
const wf = read("module", "magic", "light-shift-workflow.mjs");

ok("W1 the effect kind is handled", se.includes('case "lightShift": {'));
ok("W1b and it calls the workflow",
  se.includes("const made = await createLightShiftRegion(caster, target, spell, spec, {"));
ok("W2 A CIRCLE THAT COULD NOT BE DRAWN IS SAID OUT LOUD",
  se.includes("could not draw its circle on this scene"),
  "this spell's ENTIRE effect is the circle; a silent failure is a silent spell");
ok("W3 the region carries the shift flag",
  // 3.622.0: with the raise's cap (block 39's R9).
  wf.includes("lightShift: { steps: spec.steps, floor: spec.floor, cap: spec.cap ?? 10 },"));
// 3.622.2 (the 3.622.1 drive's F1, Graham's R1): the anchor is the Region's
// own flag — the emanation record it was handed to could never be written.
ok("W4 and is anchored to the target, not the caster",
  wf.includes("[LIGHT_SHIFT_ANCHOR_FLAG]: spec.follows ? (token?.id ?? null) : null,"));
ok("W5 a creature-centred circle needs a creature on the map",
  wf.includes("if (spec.follows && !token) return null;"),
  "dropped at the origin it would dim an empty corner and look like it worked");

// W6 THE DROP CHANGES ONE FIELD AND ENDS NOTHING. The book: the cloak
// "continues to diminish the light for the remaining duration".
ok("W6 dropping only clears the anchor",
  wf.includes("for (const region of held) await region.setFlag(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG, null);"));
/*
 * W6b SLICED, NOT BUDGETED — and this one is a NEGATIVE assertion, which
 * is what makes the budget dangerous rather than merely wrong.
 *
 * It read `!/dropLightShift[\s\S]{0,900}?(endEmanation…)/`. Adding the
 * wearer lookup above pushed the end-the-spell call past 900 characters,
 * and a negative match over a window too small to reach the defect is
 * vacuously true: the check went green because it could no longer see
 * far enough to fail. A positive assertion with a short budget fails
 * loudly; a negative one passes quietly.
 */
const dropStart = wf.indexOf("export async function dropLightShift(");
const dropEnd = wf.indexOf("\nexport ", dropStart + 1);
const dropBody = dropStart === -1 ? "" : wf.slice(dropStart, dropEnd === -1 ? wf.length : dropEnd);
ok("W6a the drop function was found", dropBody.length > 400,
  `sliced ${dropBody.length} chars — an empty slice makes W6b vacuously true`);
ok("W6b it does not end the spell",
  !/endEmanationEverywhere|deleteEmbeddedDocuments|endActiveSpell/.test(dropBody),
  "only somebody RETRIEVING the cloak ends it, and that is the table's half");
// 3.622.2: asked of the circles themselves (light-shift.mjs's
// `droppableCircles`), run rather than read.
{
  const { droppableCircles } = await import("../module/magic/light-shift.mjs");
  const circle = (castId, droppable, anchor) => ({ id: castId + anchor, flags: { "trg-prime": { lightShift: { steps: -3 }, castId, lightShiftDroppable: droppable, lightShiftAnchor: anchor } } });
  ok("W6c and a spell that prints no decoy cannot be dropped",
    droppableCircles([circle("c", false, "t1")], "c").length === 0 && droppableCircles([circle("c", true, "t1")], "c").length === 1
    && wf.includes("if (!held.length) return null;"));
  ok("W6d nor can one already on the floor be dropped twice",
    droppableCircles([circle("c", true, null)], "c").length === 0 && droppableCircles([circle("d", true, "t1")], "c").length === 0);
}

/* ================================================================== *
 * C. THE CARD
 * ================================================================== */

const cardLine = lightShiftLine(veil, "Umbral Veil", "Jonas");
ok("C1 the card names the steps, the floor and the reach",
  cardLine.includes("3 steps") && cardLine.includes("minimum of 2")
  && cardLine.includes("20 ft") && cardLine.includes("Jonas"));
ok("C1b a raise reads as brightening, not dimming",
  lightShiftLine(bare, "Unwelcome Halo", "Jonas").includes("brightens"));
ok("C2 the decoy is offered at the cast",
  lightShiftDropLine(veil, "Jonas").includes("1 AP (Interact)"),
  "the target has to know the option exists before they can spend AP on it");
ok("C2b and names the half the table adjudicates",
  /retrieves the cloak/.test(lightShiftDropLine(veil, "Jonas")));
ok("C2c a spell with no decoy offers none",
  lightShiftDropLine(bare, "Jonas") === null);
ok("C3 and the drop says what changed",
  lightShiftDroppedLine("Umbral Veil", "Jonas").includes("no longer follows"));

// C4 THE TARGET LETS IT GO, NOT THE CASTER. Found by driving it: the
// card read "Merrick Thorne lets the shadows fall" for a cloak worn by
// Borin, sixty feet away. The book gives the action to the target.
ok("C4 the drop names the creature WEARING the cloak",
  wf.includes("const wearer = anchor ? (canvas?.tokens?.get(anchor)?.name ?? null) : null;")
  && wf.includes("return lightShiftDroppedLine(name || \"The shadows\", wearer ?? actor.name);"),
  "the caster owns the entry and need not be anywhere near the circle");
ok("C4b read BEFORE the anchor is cleared",
  wf.indexOf("const wearer = anchor") > -1
  && wf.indexOf("const wearer = anchor") < wf.indexOf("for (const region of held) await region.setFlag(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG, null);"),
  "read afterwards it is always null, and the line silently falls back to the caster");

/* ================================================================== *
 * S. THE SPELL AS SHIPPED, AND THE RATCHET
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let umbral = null;
const declarers = [];
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.name === "Umbral Veil") umbral = value;
    if ((value?.system?.effects ?? []).some((e) => e?.kind === "lightShift")) {
      declarers.push({ name: value.name, pp: Number(value.system.ppCost) });
    }
  }
} finally {
  await db.close().catch(() => {});
}

const row = (umbral?.system?.effects ?? []).find((e) => e.kind === "lightShift");
ok("S1 Umbral Veil declares a light shift", Boolean(row));
ok("S2 as printed: three steps down, minimum 2, twenty feet",
  row?.steps === -3 && row?.floor === 2 && row?.radiusFeet === 20);
ok("S3 it follows its target and can be put down",
  row?.follows === true && row?.droppable === true);

// S4 THE TIER RATCHET. The mechanism now serves Unwelcome Halo (PP 2)
// and Darkness (PP 4) too, and NEITHER is wired — Graham's ruling of
// 4 September 2026 is to finish PP 1, then PP 2. A third declarer
// appearing without the tier having reached it is the drift this
// project has corrected twice.
// 1 -> 2 AT 3.590.0 (block 28, pages 281-290): INNER SANCTUM, whose
// stat line ends "the spell increases the light level within its area by
// 1 step". It arrived through the PAGE ORDER rather than the tier order,
// which is what this ratchet is really guarding against drifting
// silently -- so the rule is restated rather than loosened: a declarer
// is here because an audited page put it here, and Unwelcome Halo (PP 2)
// and Darkness (PP 4) are still waiting on the tier order.
//
// IT IS ALSO THE FIRST WITH `follows: false`. A sanctum is a placed
// area, so `anchorTokenId` is null and the circle stays where it was
// drawn while the caster walks out of it -- the branch
// createLightShiftRegion has carried since 3.492.0 and nothing had ever
// taken.
ok("S4 the declarers are the audited ones, and no spell wired itself in", (() => {
  const names = declarers.map((d) => d.name).sort();
  return JSON.stringify(names) === JSON.stringify(["Inner Sanctum", "Umbral Veil"]);
})(), `declarers: ${JSON.stringify(declarers)} — Unwelcome Halo (PP 2) and Darkness (PP 4) `
  + "are ready to be wired when the tier order reaches them, and not before");
ok("S4b Umbral Veil is still the PP 1 one it was wired as",
  declarers.find((d) => d.name === "Umbral Veil")?.pp === 1,
  "the tier order's starting point, kept asserted now that it is no longer the only entry");

/* ================================================================== *
 * B. THE BUTTON — the drop needs a door, or it is dead code
 * ================================================================== */

const sheet = read("module", "sheets", "actor-sheet.mjs");
const hbs = read("templates", "actor", "actor-sheet.hbs");

ok("B1 the sheet registers a drop action",
  sheet.includes("dropSpell: TRGActorSheet.dropSpell,")
  && sheet.includes("static async dropSpell(event, target) {"));
ok("B1b and it calls the workflow",
  sheet.includes("const said = await dropLightShift(this.actor, target?.dataset?.spellId);"),
  "a rule with no door is dead code, and verify-rules-have-callers says so");

// B2 IT IS NOT DISMISS. The book keeps the spell running after the drop.
ok("B2 dropping does not go through the dismiss path",
  !/static async dropSpell\([\s\S]{0,600}?dismissSpellAction/.test(sheet),
  "the discarded cloak keeps dimming for the remaining duration");

ok("B3 the button is offered only while there is something to drop",
  hbs.includes('{{#if spell.canDrop}}<button type="button" data-action="dropSpell"'),
  "a cloak already on the floor cannot be put down again");
ok("B3b and canDrop is derived from the circles, not stored",
  sheet.includes("canDrop: lightShiftCanDrop(entry.id),")
  && wf.includes("return droppableCircles(Array.from(canvas?.scene?.regions ?? []), castId, SYSTEM_ID).length > 0;"),
  "a stored copy could disagree with the record after a drop");

/* ================================================================== *
 * G. THE REGISTRATION GATE — the defect live testing found
 *
 * The circle is drawn by `createLightShiftRegion` and then handed to
 * `recordEmanation`, which looks the cast up in the ACTIVE-SPELL
 * REGISTRY and returns null when it is not there. Umbral Veil was not
 * there: cast-workflow registers only a spell that is PP-locked,
 * sustained, or `emanationIsLive`, and `emanationIsLive` tested the
 * printed AREA — which Umbral Veil does not have, because its circle is
 * described in prose.
 *
 * Everything visible still worked. The Region existed, the light really
 * dropped three steps, the card said all the right things. Only the
 * FOLLOWING was dead, and it took walking Borin sixty feet across the
 * map to see his own shadow stay behind on two other characters.
 *
 * SECTIONS W AND N COULD NOT HAVE CAUGHT IT. They assert that
 * `recordEmanation` is CALLED, and with the right anchor — which it was.
 * Asserting a call is not asserting its effect.
 * ================================================================== */

ok("G1 a spell whose effect draws its own circle is a live emanation",
  emanationIsLive({ area: "", effects: [{ kind: "lightShift", steps: -3, radiusFeet: 20 }] }) === true,
  "without this the registration gate skips it and nothing follows anybody");
ok("G1b even with no area field at all",
  emanationIsLive({ effects: [{ kind: "lightShift", steps: -3, radiusFeet: 20 }] }) === true);
ok("G1c and a spell with neither is still not one",
  emanationIsLive({ area: "", effects: [{ kind: "condition" }] }) === false,
  "the widening must not make every spell a live emanation");
ok("G1d while the printed-area route is untouched",
  emanationIsLive({ area: "30-foot emanation", effects: [{ kind: "bonus" }] }) === true
  && emanationIsLive({ area: "20-foot burst", effects: [{ kind: "bonus" }] }) === false,
  "Bless and Bane must behave exactly as before");

/*
 * G2 THE GATE ITSELF — RUN, NOT READ (3.528.0).
 *
 * This read cast-workflow's guard text and had already been narrowed once
 * when the guard gained a fourth question at 3.494.0. At 3.528.0 the five
 * questions moved behind `castWillRegister`, and it broke again on
 * punctuation while the rule was untouched. Its ANSWER has never changed:
 * a live emanation gets a registry entry whatever its duration says.
 *
 * THE cast-workflow READ WENT WITH IT. `verify-checks-read-source` caught
 * the leftover — a file scanned by a check that no longer asserts anything
 * about it is a read that would not notice the file going blank.
 */
ok("G2 the registration gate consults it",
  castWillRegister({ durationText: "1 minute", emanationLive: true }) === true,
  "the gate is what creates the entry recordEmanation writes onto");

// G3 UMBRAL VEIL, AS SHIPPED, PASSES THE GATE. The end-to-end fact,
// asked of the real pack row rather than of a fixture.
ok("G3 UMBRAL VEIL AS SHIPPED WOULD BE REGISTERED",
  emanationIsLive(umbral?.system ?? {}) === true,
  "it is not PP-locked and not sustained, so this predicate is the only thing "
  + "that can put it in the registry — and without the registry it never follows");

// G4 AND THE SILENT RETURN IS GONE. This exact miss has now happened
// twice; the third time must be loud.
const emsrc = read("module", "magic", "emanation-workflow.mjs");
/*
 * G4 ANCHORED ON ORDER, NOT ON PRESENCE.
 *
 * The first version asked whether `console.error(` appeared somewhere in
 * the 900 characters after `if (!entry) {`. A mutation that restored the
 * silent return AND left the old branch below it walked straight
 * through: both strings were still there, in that order, and the check
 * was satisfied by text that no longer runs.
 *
 * So: find the guard, and require that the complaint comes BEFORE the
 * return that leaves. That is the property — not that the words exist.
 */
// COMMENTS STRIPPED FIRST. The comment above this guard QUOTES the very
// line it warns about — "`if (!entry) return null;` hid this defect" —
// so a search over the raw source finds the warning and reads it as the
// code. A check that cannot tell a rule from a note about the rule is
// the same mistake as one that cannot tell a name from a branch.
const stripComments = (src) => String(src)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const emCode = stripComments(emsrc);
const guardAt = emCode.indexOf("const entry = entries.find((e) => e.id === castId);");
const afterGuard = guardAt === -1 ? "" : emCode.slice(guardAt, guardAt + 1600);
const complainAt = afterGuard.indexOf("console.error(");
const leaveAt = afterGuard.indexOf("return null;");
ok("G4a the guard was found", guardAt !== -1 && afterGuard.length > 200);
ok("G4 recordEmanation COMPLAINS BEFORE IT LEAVES",
  complainAt !== -1 && leaveAt !== -1 && complainAt < leaveAt,
  "`if (!entry) return null;` hid this defect for Aura Of Vitality and again for "
  + `Umbral Veil — complain@${complainAt}, leave@${leaveAt}`);

if (failures.length) {
  process.stderr.write(`verify-light-shift: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-light-shift: OK — ${checks} checks. The shadow follows its target, dims what is `
  + "actually there, stops at its printed floor, and stays where it is dropped.\n");
