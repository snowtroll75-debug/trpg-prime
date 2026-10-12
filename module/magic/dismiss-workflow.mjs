/**
 * Dismiss — the Foundry half, and the ONE place a dismissal happens.
 *
 * NEW at 3.434.0.
 *
 * Both doors call this: the Actions tab's "Dismiss" button (via
 * `resolveAction`, which routes the key here before its generic
 * `checkType: "none"` path can spend the AP a second time) and the Magic
 * tab's per-spell end button. Whatever a Dismiss is, it is what this
 * function does.
 *
 * See magic/dismiss.mjs for the decisions and for why this is the third
 * time this project has found the same two-door defect.
 */

import {
  DISMISS_AP_COST, DISMISS_TRAITS, dismissRefusal, dismissReleaseNote, resolveDismissTarget
} from "./dismiss.mjs";
import { endActiveSpell, getActiveSpells } from "./active-spells.mjs";
import { ensureActionPoints, spendActionCost } from "../combat/action-points-workflow.mjs";

/** Which of several running spells to dismiss. */
async function promptDismissChoice(actor, candidates) {
  const { DialogV2 } = foundry.applications.api;
  const rows = candidates
    .map(
      (entry, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="spell" value="${entry.id}" ${index === 0 ? "checked" : ""}>
          <span>${entry.name}${entry.lock ? ` <em style="opacity:.7">(${Number(entry.pp) || 0} PP locked)</em>` : ""}</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Dismiss", icon: "fa-solid fa-hand" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Which effect do you dismiss? Any Power Points it locked are released.</p>
      ${rows}
    </div>`,
    buttons: [
      {
        action: "confirm",
        label: "Dismiss",
        icon: "fa-solid fa-hand",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.spell;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return candidates.find((e) => e.id === result) ?? null;
}

/**
 * Dismiss one running effect: check the requirements, choose it, spend
 * the action, end it, and say so once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE AP IS SPENT HERE, AND NOWHERE ELSE.
 *
 * The Actions-tab door reaches this through an early branch in
 * `resolveAction`, placed beside Sustain's and Shield Block's, so it
 * returns before the generic `checkType: "none"` path spends the cost
 * itself. Two spends for one action would be a worse bug than the one
 * being fixed — the lesson sustain-workflow.mjs records.
 *
 * REQUIREMENTS ARE CHECKED BEFORE THE SPEND, so a refused dismissal
 * costs nothing.
 *
 * @param {Actor} actor
 * @param {object} [options]
 * @param {string|null} [options.spellId] known when the Magic tab's own
 *   row supplied it; null from the Actions tab, which names no spell.
 * @returns {Promise<object|null>} the entry that ended, or null.
 */
export async function dismissSpellAction(actor, { spellId = null } = {}) {
  if (!actor) return null;

  const entries = getActiveSpells(actor);
  const refusal = dismissRefusal({ entries, name: actor.name });
  if (refusal) {
    ui.notifications.warn(refusal);
    return null;
  }

  const target = resolveDismissTarget(entries, spellId);
  if (!target) {
    ui.notifications.warn(`${actor.name} has no such effect running to dismiss.`);
    return null;
  }

  let entry = target.entry ?? null;
  if (!entry && target.ask) {
    entry = await promptDismissChoice(actor, target.ask);
    if (!entry) return null;
  }

  // ASKED, THEN PAID. Cancelling the picker above costs nothing.
  if (!(await ensureActionPoints(actor, DISMISS_AP_COST, "Dismiss"))) return null;
  await spendActionCost(actor, DISMISS_AP_COST, "Dismiss", { traits: DISMISS_TRAITS });

  // THE PP NOTE IS READ BEFORE THE ENTRY IS ENDED, because ending it is
  // what removes the record of what it had locked.
  const release = dismissReleaseNote(entry);
  const ended = await endActiveSpell(actor, entry.id);
  if (!ended) return null;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content:
      `<div class="trg-prime"><p><strong>${actor.name}</strong> dismisses ` +
      `<strong>${ended.name}</strong>${release ? ` — ${release}` : "."}</p>` +
      `<p style="opacity:.75;margin:2px 0 0"><em>1 AP (Concentrate).</em></p></div>`
  });

  return ended;
}
