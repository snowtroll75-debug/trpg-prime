/**
 * The Foundry side of Hide From Animals (see hide-from-animals.mjs).
 *
 * NEW at 3.503.0.
 *
 * TWO GATES, BOTH ALREADY SINGLE. `rollWeaponAttack` and `castSpell` are
 * each one function that every route to that action crosses — the
 * argument Delayed Respite's damage gate made and Sacrificing Shield's
 * inherited. A ward that asked each caller to remember would end on a
 * Strike from the sheet and not on one from a reaction feat.
 */

import {
  HIDE_FLAG, normaliseHideFromAnimals, hideEndedLine, HIDE_END_REASONS
} from "./hide-from-animals.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * End every Hide From Animals ward on this creature.
 *
 * SILENT WHEN THERE IS NOTHING TO END, which is almost always: this runs
 * on every weapon attack and every hostile cast in the game, and a
 * function that posted a card each time would be unusable.
 *
 * @param {Actor} actor the creature that just acted
 * @param {"weapon"|"spell"} reason which gate called
 * @returns {Promise<number>} how many wards ended
 */
export async function endHidingWards(actor, reason = "weapon") {
  const wards = Array.from(actor?.effects ?? []).filter((e) => {
    if (e.disabled) return false;
    return Boolean(normaliseHideFromAnimals(e.getFlag?.(SYSTEM_ID, HIDE_FLAG)));
  });
  if (!wards.length) return 0;

  // DELETED BEFORE THE CARD, the ordering Delayed Respite paid for live
  // on 4 September: a card posted first is a card that can be read while
  // the thing it describes is still in place.
  await actor.deleteEmbeddedDocuments("ActiveEffect", wards.map((w) => w.id));

  // SAID OUT LOUD, ONCE. A ward that vanishes with no line is a player
  // who thinks they are still hidden — which is the exact failure this
  // whole release exists to prevent, arriving by a different road.
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime"><p style="margin:2px 0">`
      + `${hideEndedLine(actor.name, HIDE_END_REASONS[reason] ?? HIDE_END_REASONS.weapon)}`
      + "</p></div>"
  });
  return wards.length;
}
