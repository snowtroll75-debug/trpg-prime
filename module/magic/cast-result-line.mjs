/**
 * WHAT THE RESULT CARD SAYS HAPPENED.
 *
 * NEW at 3.481.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND BY DRIVING 3.480.0, 3 September 2026.
 *
 * Cancelling Missile Storm's target picker refunded correctly — PP 90 →
 * 80 → 90, AP 3 → 0 → 3, the Region released, nobody damaged — and then
 * printed this:
 *
 *   "THE SPELL TAKES EFFECT. 10 PP SPENT (Heroic: total halved).
 *    Missile Storm is called off — no targets were chosen — 10 PP and
 *    3 AP refunded.
 *    Area: 50 ft radius template placed — caught 3: …
 *    MISSILE STORM REQUIRES NO ATTACK ROLL AND ALLOWS NO SAVE — THE
 *    MISSILES SIMPLY LAND.
 *    Missile Storm finds nothing in the area to answer.
 *    MISSILESTORM EFFECT — NO TARGET TO APPLY TO."
 *
 * THE MECHANISM WAS RIGHT AND THE CARD CONTRADICTED IT — which is this
 * project's own most-repeated defect, found in its own house. A player
 * who reads "The spell takes effect. 10 PP spent" has no reason to
 * believe the refund line three rows down.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE SEPARATE FAULTS, AND ONLY ONE OF THEM IS NEW.
 *
 *   1. THE HEADLINE is pushed ~380 lines before the refund can happen
 *      and nothing revisits it. Fixed by making the headline a value
 *      this file computes, and REWRITING it in place once the cast
 *      knows whether it was called off.
 *
 *   2. "THE MISSILES SIMPLY LAND" is the storm's automatic-hit note,
 *      printed before checking whether anything was caught. It is a
 *      promise about damage, and it must not appear when there is
 *      nothing to land on.
 *
 *   3. "missileStorm effect — no target to apply to" is DEVELOPER TEXT
 *      on a player-facing card, and it is PRE-EXISTING AND WIDER than
 *      the refund path — Spike Stones printed "hazard effect — no
 *      target to apply to" on an ordinary successful cast in the same
 *      session. `effect.kind` values are internal camelCase identifiers
 *      (`elementalNexus`, `heldBonus`, `inspireCompetence`); none of
 *      them is a phrase anybody at a table would recognise.
 *
 * THE DIAGNOSTIC IS KEPT, NOT DELETED. Its own comment records why it
 * exists — "a spell tried to do something to somebody and there was
 * nobody there" — and that is worth saying. What changes is that it says
 * it in the spell's own words.
 */

const text = (v) => String(v ?? "").trim();

/**
 * The card's headline for a finished cast.
 *
 * COMPUTED RATHER THAN CONCATENATED AT THE CALL SITE, so the refund can
 * ask for the same sentence with one fact changed instead of a second
 * copy of the wording drifting out of step with the first.
 *
 * @param {object} o
 * @param {boolean} o.cast did the check succeed
 * @param {boolean} o.isInnate innate casts spend no PP
 * @param {number} o.ppSpent
 * @param {string} o.degree the rolled degree
 * @param {boolean} o.refunded the cast was called off after committing
 * @returns {string}
 */
export function castResultHeadline({ cast, isInnate = false, ppSpent = 0, degree = "", refunded = false, rodPaid = 0, rodName = "" } = {}) {
  // WHO PAID (3.616.1, Graham's R3 of the 3.616.0 drive): a Rod of the Magi
  // or a Sceptre of the Clergy may pay part of the cost, and "4 PP spent"
  // alone read as the caster's four.
  const fromRod = Number(rodPaid) > 0 ? ` (${Number(rodPaid)} from ${rodName || "the rod"})` : "";
  // A REFUNDED CAST NEVER TOOK EFFECT, whatever the check rolled. This is
  // tested FIRST because every other branch below asserts something that
  // is no longer true once the cast has been called off.
  if (refunded) {
    return "<strong>The spell is called off.</strong> Nothing was spent.";
  }
  if (!cast) {
    const pp = ppSpent ? `${ppSpent} PP lost${fromRod}` : "No PP lost";
    const half = degree === "failure" ? " (half, rounded down)" : "";
    return `<strong>The spell fails.</strong> ${pp}${half}.`;
  }
  if (isInnate) return "<strong>The spell takes effect.</strong>";
  const note = degree === "heroic"
    ? " (Heroic: total halved)"
    : degree === "critical" ? " (Critical: base halved)" : "";
  return `<strong>The spell takes effect.</strong> ${ppSpent} PP spent${fromRod}${note}.`;
}

/**
 * Does this cast's automatic-hit note belong on the card?
 *
 * "THE MISSILES SIMPLY LAND" IS A PROMISE ABOUT DAMAGE. It exists so a
 * 50-foot area spell resolving with no save prompt does not read as a
 * broken save — but with nobody targeted there is no resolution to
 * explain, and the sentence becomes a claim about missiles that never
 * flew.
 *
 * @param {number} targetCount how many the spell will actually hit
 * @returns {boolean}
 */
export function automaticHitNoteApplies(targetCount) {
  return (Number(targetCount) || 0) > 0;
}

/**
 * Effect kinds that resolve OUTSIDE the applier.
 *
 * FOUND BY DRIVING 3.483.0. An Orb Of Acid that MISSED printed "Orb Of
 * Acid finds nobody to affect" — it found somebody and missed them. The
 * splash row has no recipients once the attack misses, so the generic
 * no-target diagnostic fired on a card that had already explained
 * itself two lines above with "Miss vs …".
 *
 * EACH OF THESE IS RESOLVED SOMEWHERE ELSE and already reports its own
 * outcome: splash in the attack path, the storm and the region kinds in
 * the cast workflow. The diagnostic exists for an effect that tried to
 * reach somebody and found nobody there; for these, "nobody" is the
 * ordinary consequence of a result the card has already given.
 *
 * `saveLadder` JOINED AT 3.608.0. Every rung — "unaffected" included — is
 * printed by the save branch of the cast workflow, one line per creature.
 * The row then reached the applier with the FAILURES as its recipients,
 * and when everyone saved the card ended "Sunburst finds nobody to
 * affect" beneath five lines saying who saved. Found on the 3.606.0 drive.
 *
 * `difficultTerrain` and `zone` JOINED WITH IT. Both are placed on the
 * Region by the cast workflow (the terrain) or the live sweep (the fog),
 * and the card says so; on a save spell whose targets all saved — Stone
 * Call — the row would otherwise find "nobody" beneath a line that had
 * just described the rubble.
 */
export const SELF_REPORTING_KINDS = Object.freeze([
  "splash", "missileStorm", "elementalNexus", "areaRider", "hazard", "saveLadder", "difficultTerrain", "zone",
  // A SECOND SAVE OWED ONLY BY THOSE A CRITICAL REACHED (3.609.0): nobody is the
  // ordinary case, and the first save's lines already say why.
  "followUpSave",
  // A SAVE OWED AT THE START OF A TURN (3.609.0) finds nobody at the cast by
  // design: the cast rolls nothing. The card's own line says who it waits for.
  "turnSave",
  // A WALL AND A STORM (3.610.0) print their own lines from the cast
  // workflow, where the Region is known; the applier has nothing to add.
  "wall", "storm"
]);

/** Does this kind speak for itself, making the generic notice noise? */
export function reportsItsOwnAbsence(effect) {
  return SELF_REPORTING_KINDS.includes(text(effect?.kind));
}

/**
 * What a spell says when one of its effects finds nobody.
 *
 * IN THE SPELL'S OWN WORDS. The row's `label` is the author's name for
 * the thing ("Missile Storm", "Protective Ward"); the spell's name is
 * the fallback. `effect.kind` is never shown, because it is an internal
 * identifier and printing it tells a player nothing while looking like
 * an error.
 *
 * @param {object|null} effect the effect row
 * @param {string} spellName
 * @returns {string}
 */
export function effectNoTargetLine(effect, spellName) {
  const named = text(effect?.label) || text(spellName) || "The spell";
  return `<em>${named} finds nobody to affect.</em>`;
}
