/**
 * held-change-workflow — the sheet's equip tickbox, in combat (3.702.0).
 * The rules and Graham's rulings are in held-change.mjs.
 *
 * ROUTED THROUGH THE ACTIONS THEMSELVES, not a copy of them. A draw is the
 * Interact action and a drop is the Release action, run by `resolveAction`
 * with the item pre-chosen (`heldChange`). So the AP, the Manipulate trait's
 * Attack of Opportunity, the conditions that forbid manipulating (Grabbed
 * and the rest), and the card are the actions' own. A refused Interact
 * changes nothing in hand.
 */

import { actorInCombat } from "./action-points-workflow.mjs";
import { heldChangeIsAction, drawChanges } from "./held-change.mjs";

/**
 * Change what the actor holds in combat, as an action.
 *
 * @param {Actor} actor
 * @param {Item} item
 * @param {object} p
 * @param {boolean} p.equip       true to draw, false to put away or drop
 * @param {boolean|null} [p.grip] a Hand & a Half grip already chosen
 * @returns {Promise<{handled: boolean, changed: boolean}>}
 *   `handled` false means "not an action here: change it freely";
 *   otherwise `changed` says whether the item ended up as asked.
 */
export async function heldChangeInCombat(actor, item, { equip, grip = null } = {}) {
  const isAction = heldChangeIsAction({
    combatStarted: Boolean(game.combat?.started),
    actorInCombat: actorInCombat(actor),
    item,
    actorSize: actor?.system?.identity?.size ?? "medium"
  });
  if (!isAction) return { handled: false, changed: false };

  const { DialogV2 } = foundry.applications.api;
  // A GM'S CORRECTION COSTS NOTHING (Graham's ruling): asked, not assumed.
  if (game.user?.isGM) {
    const how = await DialogV2.wait({
      window: { title: `${item.name} — In Combat` },
      content: `<p>${equip ? "Drawing" : "Putting away"} <strong>${item.name}</strong> during combat is an action for ${actor.name}.</p>`,
      buttons: [
        { action: "act", label: equip ? "As an Interact (1 AP)" : "As an action", default: true },
        { action: "set", label: "Just set it (no action)" },
        { action: "cancel", label: "Cancel" }
      ],
      rejectClose: false
    });
    if (how === "set") return { handled: false, changed: false };
    if (how !== "act") return { handled: true, changed: false };
  }

  const { BASIC_ACTIONS } = await import("../data/basic-actions.mjs");
  const { resolveAction } = await import("./action-workflow.mjs");
  const interact = BASIC_ACTIONS.find((a) => a.key === "interact");
  const release = BASIC_ACTIONS.find((a) => a.key === "release");

  if (equip) {
    await resolveAction(actor, interact, { heldChange: { item, equip: true, changes: drawChanges(item, grip) } });
    return { handled: true, changed: Boolean(actor.items.get(item.id)?.system?.equipped) };
  }

  // PUT AWAY: DROP OR SHEATHE (Graham's ruling). Release is free and does not
  // provoke; sheathing or stowing is an Interact.
  const way = await DialogV2.wait({
    window: { title: `${item.name} — Put Away` },
    content: `<p>How does ${actor.name} let go of <strong>${item.name}</strong>?</p>`
      + "<p><strong>Drop</strong>: Release, a free action that does not provoke. It falls to the ground.<br>"
      + "<strong>Sheathe or stow</strong>: Interact, 1 AP. It provokes from enemies in reach.</p>",
    buttons: [
      { action: "drop", label: "Drop (Release, free)" },
      { action: "sheathe", label: "Sheathe or Stow (Interact, 1 AP)", default: true },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (way === "drop") {
    await resolveAction(actor, release, { heldChange: { item, equip: false } });
  } else if (way === "sheathe") {
    await resolveAction(actor, interact, { heldChange: { item, equip: false, changes: { "system.equipped": false } } });
  } else {
    return { handled: true, changed: false };
  }
  return { handled: true, changed: !actor.items.get(item.id)?.system?.equipped };
}
