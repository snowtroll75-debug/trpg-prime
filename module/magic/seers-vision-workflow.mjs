/**
 * The Foundry side of SEER'S VISION (see seers-vision.mjs for the rule
 * and for Graham's ruling that a recorded 20 is a natural 20).
 *
 * NEW at 3.449.0.
 */

import {
  SEERS_VISION_FLAG, applicableRecordedRoll, recordedRolls, seersVisionRecord,
  visionName, withRecordedRoll
} from "./seers-vision.mjs";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "trg-prime";

/**
 * Record what was foreseen on the target.
 *
 * "CASTING THIS SPELL AGAIN IMMEDIATELY CANCELS ANY ACTIVE INSTANCE" —
 * so this REPLACES rather than keeping the larger, which is the opposite
 * of every other spell on this road. Cutting Words, Counter Perform and
 * Inspire Competence all keep the better of two because their bonuses
 * are typed and Appendix 1 governs; this one is not a bonus at all, and
 * its own sentence says the new vision wins even when it is worse.
 *
 * @returns {Promise<object|null>} what is now waiting, or null
 */
export async function recordSeersVision(
  target, { value, casterName = "", label = "", round = null, types = null, source = "" } = {}
) {
  if (!target) return null;
  const record = seersVisionRecord({ value, casterName, label, round, types, source });
  if (!record) return null;
  /*
   * REPLACES ITS OWN SOURCE AND KEEPS THE REST (3.589.0).
   *
   * This used to `setFlag` a single record, which was right while Seer's
   * Vision was the only spell that recorded a number. Embrace Destiny
   * (page 277) records one too, and neither spell's sentence says
   * anything about the other — Seer's Vision cancels "any active
   * instance" of itself, Embrace Destiny forbids more than one "of
   * embrace destiny". A shared slot would have made casting one cancel
   * the other, which is a rule nobody wrote.
   *
   * See `withRecordedRoll`, which is that reasoning as a function.
   */
  const held = target.getFlag?.(SYSTEM_ID, SEERS_VISION_FLAG) ?? null;
  await target.setFlag(SYSTEM_ID, SEERS_VISION_FLAG, withRecordedRoll(held, record));
  return record;
}

/**
 * The recorded number this check may spend, or null.
 *
 * TAKES THE CHECK, because which record applies now depends on what is
 * being rolled — Seer's Vision cannot be spent on an attack and Embrace
 * Destiny can. A creature carrying both offers the right one.
 */
export function pendingSeersVision(actor, checkType = "", rollMode = "") {
  const held = actor?.getFlag?.(SYSTEM_ID, SEERS_VISION_FLAG) ?? null;
  return applicableRecordedRoll(held, checkType, rollMode);
}

/**
 * "They MAY use the recorded number" — so they are asked.
 *
 * REFUSED BY DEFAULT. `rejectClose: false` returns null when the dialog
 * is dismissed, and anything but an explicit yes leaves the vision
 * intact: a spell the player forgot to decline must not spend itself.
 *
 * @param {object} pending the recorded vision
 * @param {string} label what the check is called
 * @returns {Promise<boolean>}
 */
export async function promptSeersVision(pending, label = "this check") {
  const value = Number(pending?.value);
  if (!Number.isFinite(value)) return false;
  const who = String(pending?.casterName ?? "").trim();
  // THE SPELL'S OWN NAME, not a retyped one — see `visionName`.
  const name = visionName(pending);
  const answer = await DialogV2.wait({
    window: { title: name, icon: "fa-solid fa-eye" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint">You foresaw a <strong>${value}</strong>${who ? ` through ${who}'s ${name}` : ""}.</p>
      <p>Use it instead of rolling <strong>${label}</strong>? This ends the spell.</p>
      <p class="hint"><em>Declining keeps the vision for a later check.</em></p>
    </div>`,
    buttons: [
      { action: "use", label: `Use the ${value}`, icon: "fa-solid fa-eye", default: true },
      { action: "roll", label: "Roll normally", icon: "fa-solid fa-dice-d20" }
    ],
    rejectClose: false
  });
  return answer === "use";
}

/**
 * Take the spent vision off the creature.
 *
 * SWALLOWS ITS OWN FAILURE, for the reason every other spell on this
 * road does: this runs inside a roll that is about to happen, and
 * throwing would cost the player their card to tidy a flag.
 */
export async function consumeSeersVision(actor, source = "") {
  if (!actor?.setFlag) return;
  try {
    const held = actor.getFlag?.(SYSTEM_ID, SEERS_VISION_FLAG) ?? null;
    const spent = String(source ?? "").trim();
    // ONLY THE ONE THAT WAS SPENT (3.589.0). Clearing the flag outright
    // would have taken a Seer's Vision off a character who spent an
    // Embrace Destiny — two spells, one slot, and the wrong one ended.
    const remaining = spent
      ? recordedRolls(held).filter((r) => String(r.source ?? "") !== spent)
      : [];
    if (remaining.length) await actor.setFlag(SYSTEM_ID, SEERS_VISION_FLAG, remaining);
    else await actor.unsetFlag(SYSTEM_ID, SEERS_VISION_FLAG);
  } catch (error) {
    console.error("TRG Prime | Could not clear a spent recorded roll", error);
  }
}
