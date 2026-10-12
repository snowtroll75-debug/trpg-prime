/**
 * The saving throw a creature makes on walking into a live emanation.
 *
 * NEW at 3.428.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT IS ROLLED RATHER THAN OFFERED.
 *
 * Creature auras ANNOUNCE their save and let the table roll it; a spell
 * cast rolls its area saves itself. Bane is a spell, and its cast
 * already rolls a Will save for everyone caught — so a creature walking
 * in afterwards is rolled the same way.
 *
 * The alternative was tempting because the aura machinery is right next
 * door, and it would have been wrong: one spell answering the same
 * question two ways depending on when you arrived is the shape this
 * project keeps finding at the bottom of its defects.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DC IS THE ONE THE SPELL WAS CAST AT.
 *
 * Recorded on the emanation at the cast, not recomputed here. A caster
 * who has since been weakened, or who spent Power Points on something
 * else, does not make their standing Bane easier to resist — the spell
 * is already out.
 */

import { TRGCheck } from "../dice/check.mjs";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/**
 * Roll one creature's save against a running emanation.
 *
 * @param {Actor} actor the creature that walked in
 * @param {object} emanation the descriptor, carrying `save` and `saveDC`
 * @param {Actor|null} caster
 * @returns {Promise<string>} the degree rolled, for the `tested` record
 */
export async function rollEmanationSave(actor, emanation, caster = null) {
  const save = String(emanation?.save ?? "will").toLowerCase();
  const label = `${save[0].toUpperCase()}${save.slice(1)}`;
  const dc = Number(emanation?.saveDC);

  const check = await TRGCheck.roll({
    actor,
    label: `${emanation.name} — ${label} Save`,
    subject: save,
    subtitle: `Entering ${caster ? `${caster.name}'s ` : ""}${emanation.name}`
      + (Number.isFinite(dc) ? ` — DC ${dc}` : " — DC unrecorded, resolve by hand"),
    type: "save",
    // A DC THAT WAS NEVER RECORDED IS LEFT UNSET rather than guessed at.
    // The card then shows the total for a GM to judge, which is the
    // system's own answer everywhere else a DC is unknown.
    dc: Number.isFinite(dc) ? dc : null
  });

  // FAILURE IS THE FALLBACK, NOT SUCCESS. With no DC there is no degree,
  // and treating that as a pass would let an unrecorded DC quietly
  // protect everyone who walked in — a silence that reads as a rule.
  // Treating it as a failure is visible: the penalty lands, the card
  // shows the roll, and a GM who disagrees can clear the effect.
  const degree = check.outcome?.degree?.key ?? "failure";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content:
      `<div class="trg-prime"><p><strong>${actor.name}</strong> walks into `
      + `<strong>${emanation.name}</strong> and rolls a ${label} save`
      + `${Number.isFinite(dc) ? ` against DC ${dc}` : ""} — <strong>${degree}</strong>.</p>`
      + line("<em>Rolled once. Stepping out and back in does not ask again.</em>")
      + "</div>"
  });

  return degree;
}
