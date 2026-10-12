/**
 * Counter Perform against real documents.
 *
 * NEW at 3.443.0. The Foundry half of `counter-perform.mjs`, kept apart
 * so the rule stays importable by the harness — the split this project
 * has now paid for nine times.
 *
 * Every function here mirrors one in `cutting-words-workflow.mjs`, and
 * deliberately so: the two spells are the same mechanism pointed at
 * different people, and a reader who knows one should recognise the
 * other on sight.
 */

import { COUNTER_PERFORM_FLAG, counterPerformRecord } from "./counter-perform.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Leave the bonus waiting on the ally.
 *
 * A SECOND CAST REPLACES THE FIRST ONLY IF IT IS BIGGER, rather than
 * stacking. The bonus is status-typed, so Appendix 1's highest-wins rule
 * governs two of them wherever they land; keeping the larger here means
 * the flag says what the pool would have said.
 *
 * @returns {Promise<object|null>} the record now held, or null
 */
export async function recordCounterPerform(target, { bonus = 0, casterName = "", round = null } = {}) {
  if (!target) return null;
  const record = counterPerformRecord({ bonus, casterName, round });
  if (!record) return null;
  const held = target.getFlag(SYSTEM_ID, COUNTER_PERFORM_FLAG) ?? null;
  if (held && Number(held.bonus) >= record.bonus) return held;
  await target.setFlag(SYSTEM_ID, COUNTER_PERFORM_FLAG, record);
  return record;
}

/** What this creature is carrying, or null. */
export function pendingCounterPerform(actor) {
  return actor?.getFlag?.(SYSTEM_ID, COUNTER_PERFORM_FLAG) ?? null;
}

/**
 * Take the spent bonus off the creature.
 *
 * CLEARED WHETHER OR NOT IT CHANGED THE OUTCOME. The spell was cast at
 * one announced save and that save has now happened; a bonus that lost
 * to a larger status modifier was still spent on that roll.
 *
 * SWALLOWS ITS OWN FAILURE, deliberately — this runs inside a roll that
 * has already happened, and throwing here would lose the roll to tidy up
 * a flag.
 */
export async function consumeCounterPerform(actor) {
  if (!actor?.unsetFlag) return;
  try {
    await actor.unsetFlag(SYSTEM_ID, COUNTER_PERFORM_FLAG);
  } catch (error) {
    console.error("TRG Prime | Could not clear a spent Counter Perform bonus", error);
  }
}

/**
 * The Save DC of the incoming effect, asked of the caster.
 *
 * NOTHING CAN DERIVE THIS. "Compared to the Bonus check table against the
 * Save DC of the incoming spell" — the incoming spell is somebody else's,
 * its save has not been rolled, and this one is a Reaction cast at an
 * announced action. So the number is asked for rather than guessed, and
 * a guess would size every Counter Perform in the game off the wrong DC.
 *
 * CANCELLING RETURNS NULL and the applier refuses the effect out loud,
 * rather than recording a bonus of zero that would look like an effect
 * and be eaten by the next save.
 *
 * @returns {Promise<number|null>}
 */
export async function promptIncomingSaveDC(spellName = "Counter Perform") {
  const { DialogV2 } = foundry.applications.api;
  const answer = await DialogV2.wait({
    window: { title: `${spellName} — the incoming Save DC`, icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Your Perform check is compared to the Bonus Check
      Table against the Save DC of the effect being resisted.</p>
      <input type="number" name="dc" value="15" step="1" style="width:100%">
    </div>`,
    buttons: [
      {
        action: "confirm", label: "Compare", icon: "fa-solid fa-music", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.dc;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (answer === null || answer === undefined || answer === "cancel") return null;
  const dc = Number(answer);
  return Number.isFinite(dc) ? dc : null;
}
