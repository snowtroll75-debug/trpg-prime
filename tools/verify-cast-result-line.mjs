#!/usr/bin/env node
/**
 * verify-cast-result-line — the card does not claim what did not happen.
 *
 * NEW at 3.481.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND BY DRIVING 3.480.0, 3 September 2026.
 *
 * A cancelled Missile Storm refunded perfectly — PP 90 → 80 → 90, AP
 * 3 → 0 → 3, Region released, nobody damaged — and printed a card
 * headed "THE SPELL TAKES EFFECT. 10 PP SPENT", followed by the refund
 * line, followed by "the missiles simply land", followed by
 * "missileStorm effect — no target to apply to".
 *
 * THE MECHANISM WAS RIGHT AND THE CARD CONTRADICTED IT — the defect this
 * project keeps finding elsewhere, found in its own work.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE CHECKS THAT CARRY THE DESIGN.
 *
 *   H1  A REFUNDED CAST NEVER TOOK EFFECT, whatever the check rolled.
 *       The refund branch is tested FIRST in the headline because every
 *       other branch asserts something no longer true once the cast has
 *       been called off — including the fail branch, which would
 *       otherwise claim PP was lost that has just been given back.
 *
 *   W3  THE HEADLINE IS REWRITTEN, NOT APPENDED TO. Appending leaves
 *       "The spell takes effect. 10 PP spent" standing three rows above
 *       its own contradiction, which is exactly what 3.480.0 shipped.
 *
 *   N1  THE DIAGNOSTIC SPEAKS THE SPELL'S LANGUAGE. `effect.kind` is an
 *       internal identifier — `missileStorm`, `elementalNexus`,
 *       `heldBonus` — and printing it tells a player nothing while
 *       looking like an error. This one is PRE-EXISTING AND WIDER than
 *       the refund: Spike Stones printed "hazard effect — no target to
 *       apply to" on an ordinary successful cast in the same session.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  castResultHeadline, automaticHitNoteApplies, effectNoTargetLine,
  reportsItsOwnAbsence, SELF_REPORTING_KINDS
} from "../module/magic/cast-result-line.mjs";

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

/* ── H. THE HEADLINE ─────────────────────────────────────────────── */
/*
 * H1 IS THE WHOLE POINT OF THE RELEASE, and it is asserted in both
 * directions: the refunded card must not claim the spell worked, and it
 * must not claim PP was spent.
 */
const refunded = castResultHeadline({ cast: true, ppSpent: 10, degree: "heroic", refunded: true });
ok("H1 A REFUNDED CAST DOES NOT CLAIM TO HAVE TAKEN EFFECT",
  !/takes effect/i.test(refunded) && /called off/i.test(refunded),
  "3.480.0 printed \"The spell takes effect. 10 PP spent\" above its own refund");
ok("H1b and does not claim the PP was spent",
  !/10 PP spent/.test(refunded) && /Nothing was spent/i.test(refunded));
/*
 * H2 — A REFUND OVERRIDES A FAILED CHECK TOO. The fail branch says "N PP
 * lost", which is equally false once the PP has come back; testing the
 * refund first is what makes that impossible.
 */
ok("H2 A REFUND OVERRIDES A FAILED CHECK AS WELL",
  !/PP lost/.test(castResultHeadline({ cast: false, ppSpent: 10, degree: "failure", refunded: true })),
  "a refunded failure has lost nothing either");
ok("H3 an ordinary successful cast is unchanged",
  castResultHeadline({ cast: true, ppSpent: 10, degree: "heroic" })
    === "<strong>The spell takes effect.</strong> 10 PP spent (Heroic: total halved).");
ok("H4 a critical says so", /Critical: base halved/.test(
  castResultHeadline({ cast: true, ppSpent: 4, degree: "critical" })));
ok("H5 an innate cast spends nothing and says nothing about PP",
  castResultHeadline({ cast: true, isInnate: true, ppSpent: 0 })
    === "<strong>The spell takes effect.</strong>");
ok("H6 a plain failure reports the loss",
  /No PP lost/.test(castResultHeadline({ cast: false, ppSpent: 0 }))
  && /6 PP lost \(half, rounded down\)/.test(
    castResultHeadline({ cast: false, ppSpent: 6, degree: "failure" })));
ok("H7 called with nothing at all it still returns a sentence",
  typeof castResultHeadline() === "string" && castResultHeadline().length > 0);

/* ── A. THE AUTOMATIC-HIT NOTE ───────────────────────────────────── */
/*
 * A1 — IT IS A PROMISE ABOUT DAMAGE. "The missiles simply land" exists so
 * an area spell with no save prompt does not read as a broken save; with
 * nobody targeted it becomes a claim about missiles that never flew.
 */
ok("A1 THE AUTO-HIT NOTE IS SUPPRESSED WHEN NOBODY IS HIT",
  automaticHitNoteApplies(0) === false,
  "\"the missiles simply land\" printed above \"finds nothing to answer\"");
ok("A2 and shown when somebody is",
  automaticHitNoteApplies(1) === true && automaticHitNoteApplies(5) === true);
ok("A3 a nonsense count is treated as nobody",
  automaticHitNoteApplies(undefined) === false && automaticHitNoteApplies(-2) === false);

/* ── N. THE NO-TARGET DIAGNOSTIC ─────────────────────────────────── */
/*
 * N1 — NEVER THE INTERNAL KIND. Every one of these is a real value from
 * the pack, and every one of them used to reach a player's card verbatim.
 */
for (const kind of ["missileStorm", "elementalNexus", "heldBonus", "inspireCompetence", "hazard"]) {
  ok(`N1 "${kind}" never appears on the card`,
    !effectNoTargetLine({ kind }, "Some Spell").includes(kind),
    "an internal identifier reads as an error to a player");
}
ok("N2 the row's own label is preferred",
  /Missile Storm finds nobody/.test(
    effectNoTargetLine({ kind: "missileStorm", label: "Missile Storm" }, "Some Spell")));
ok("N3 the spell's name is the fallback",
  /Spike Stones finds nobody/.test(effectNoTargetLine({ kind: "hazard" }, "Spike Stones")));
ok("N4 and something sensible is said with neither",
  /The spell finds nobody/.test(effectNoTargetLine(null, "")));
/*
 * N5 — THE DIAGNOSTIC IS KEPT, NOT DELETED. Its own comment records why
 * it exists: a spell tried to affect somebody and there was nobody there.
 * Silencing it would hide that.
 */
ok("N5 IT STILL REPORTS THAT NOBODY WAS FOUND",
  /finds nobody to affect/.test(effectNoTargetLine({ label: "X" }, "Y")),
  "the diagnostic is reworded, not removed");

/* ── K. KINDS THAT SPEAK FOR THEMSELVES ──────────────────────────── */
/*
 * K1 — A MISSED ORB OF ACID printed "finds nobody to affect" under its
 * own "Miss vs …" line. It found somebody and missed them; the splash
 * row simply has no recipients once the attack misses.
 */
ok("K1 SPLASH REPORTS ITS OWN ABSENCE", reportsItsOwnAbsence({ kind: "splash" }) === true,
  "a missed attack already said why nobody was affected");
ok("K2 and so does every kind resolved outside the applier",
  ["missileStorm", "elementalNexus", "areaRider", "hazard"]
    .every((k) => reportsItsOwnAbsence({ kind: k })));
/*
 * K3 — BUT AN ORDINARY EFFECT STILL SAYS SO. The diagnostic's whole
 * reason for existing is a spell that tried to reach somebody and found
 * nobody there; silencing it generally would lose that.
 */
ok("K3 AN ORDINARY EFFECT STILL REPORTS FINDING NOBODY",
  reportsItsOwnAbsence({ kind: "condition" }) === false
  && reportsItsOwnAbsence({ kind: "bonus" }) === false
  && reportsItsOwnAbsence(null) === false,
  "the diagnostic is narrowed, not removed");
// TEN AT 3.609.0: a second save owed only by those a critical reached
// (followUpSave) and a save rolled at the start of a turn, not at the cast
// (turnSave). Both find nobody at the cast by design.
// TWELVE AT 3.610.0: the wall and the storm print from the cast workflow.
ok("K4 the self-reporting set is the twelve resolved elsewhere",
  SELF_REPORTING_KINDS.length === 12);

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const cast = strip(read("module", "magic", "cast-workflow.mjs"));
const storm = strip(read("module", "magic", "missile-storm-workflow.mjs"));
const effects = strip(read("module", "magic", "spell-effects.mjs"));
ok("W1 the headline comes from the rule, not from an inline string",
  cast.includes("line(castResultHeadline(headlineFacts))")
  && !cast.includes('`<strong>The spell takes effect.</strong> ${ppSpent} PP spent'),
  "a second copy of the wording would drift out of step");
ok("W2 the refund asks for the same sentence with one fact changed",
  cast.includes("castResultHeadline({ ...headlineFacts, refunded: true })"));
/*
 * W3 — REWRITTEN IN PLACE. An append leaves the false headline standing;
 * that is the shipped defect this release exists for.
 */
ok("W3 THE HEADLINE IS REWRITTEN IN PLACE, NOT APPENDED",
  cast.includes("lines[headlineIndex] = corrected;"),
  "appending leaves \"The spell takes effect\" above its own contradiction");
/*
 * W4 — AND THE REWRITE VERIFIES ITS TARGET. Overwriting the wrong line
 * would silently replace somebody else's sentence, which is worse than
 * the duplicate being avoided.
 */
ok("W4 and it checks it is changing the line it thinks it is",
  cast.includes("if (lines[headlineIndex] === headlineHtml) {")
  && cast.includes("lines.push(corrected);"),
  "a wrong rewrite would overwrite another sentence silently");
ok("W5 the storm's auto-hit note is gated on somebody being hit",
  storm.includes("if (automaticHitNoteApplies(caught.length)) lines.push(stormAutomaticLine(spec));"));
/*
 * W6 — THE ARRAY STARTS EMPTY, and that is the actual invariant.
 *
 * The first draft of this check compared the POSITIONS of the empty-case
 * push and the gated note, and a mutation re-seeding the array with
 * `[stormAutomaticLine(spec)]` walked straight through it: both
 * statements stayed exactly where they were, and the promise was back on
 * the card regardless. The defect was never about the order of two
 * statements — it was that the note was the array's first element,
 * built before anything had been counted. Assert the initialiser.
 */
ok("W6 AND THE LINE ARRAY IS NOT SEEDED WITH THE PROMISE",
  storm.includes("const lines = [];")
  && !/const lines = \[stormAutomaticLine/.test(storm),
  "seeding the array puts the promise back on an empty card");
ok("W7b the applier asks whether the kind speaks for itself",
  // RE-ANCHORED 3.614.0: an attack-gated row is excused beside it (F1 of the 3.613.0 drive).
  effects.includes("!isDegreeGated(effect) && !isAttackGated(effect) && !reportsItsOwnAbsence(effect)"),
  "a missed attack must not print \"finds nobody\" under its own miss");
ok("W7 the no-target diagnostic no longer prints the internal kind",
  effects.includes("lines.push(line(effectNoTargetLine(effect, spell?.name)));")
  && !effects.includes("${effect.kind} effect — no target to apply to"));

/* ── report ──────────────────────────────────────────────────────── */
if (failures.length) {
  console.error(`verify-cast-result-line: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-cast-result-line: ${checks} checks passed`);
