/**
 * REACTIVE STANCE (Chapter 5, Fighter/Rogue, BAB +10):
 *
 *   Action Free; Trigger You roll initiative.
 *   Enter any one known Stance that you know.
 *
 * OFFERED WHERE INITIATIVE IS ROLLED, because that is the printed
 * trigger and because a stance entered before the first turn is the whole
 * point: a Fighter who has to spend their first action getting into
 * Lunging Stance has bought nothing this feat sells.
 *
 * IT ENTERS NOTHING ITSELF. Every Stance feat already knows how to enter
 * itself — `enterFeatStance` polices the per-round rule, replaces the
 * previous stance, spends the AP and creates the effect with whatever
 * changes that particular stance carries. What this feat changes is the
 * COST and the MOMENT, so it calls the stance's own handler with the AP
 * waived rather than growing a second way to be in a stance. A stance
 * entered here and a stance entered on your turn must be the same stance.
 */

import { reactiveStanceOptions } from "./grant-feats.mjs";

const SYSTEM_ID = "trg-prime";

const { DialogV2 } = foundry.applications.api;

/**
 * Offer the free stance to one combatant who has just rolled initiative.
 *
 * NOTHING HERE MAY THROW INTO INITIATIVE. The combat tracker is mid-roll
 * when this runs, and an exception escaping would leave a combat half
 * sorted — the same reason `opportunity.mjs` and the reaction-feat
 * detection both swallow. A missing offer is a nuisance; a broken
 * initiative roll is a ruined encounter.
 *
 * @param {Actor} actor
 * @returns {Promise<string|null>} the stance entered, or null
 */
export async function offerReactiveStance(actor) {
  try {
    if (!actor?.isOwner) return null;
    const featNames = Array.from(actor.items ?? [])
      .filter((i) => i.type === "feat").map((i) => i.name);
    const { offered, stances } = reactiveStanceOptions(featNames, Array.from(actor.items ?? []));
    if (!offered) return null;

    const choice = await DialogV2.wait({
      window: { title: "Reactive Stance", icon: "fa-solid fa-person-walking" },
      classes: ["trg-prime"],
      position: { width: 380 },
      content: `<div class="trg-prime trg-check-dialog">`
        + `<p><strong>${actor.name}</strong> rolls initiative — drop into a stance, free.</p>`
        + `<div class="form-group stacked"><label>Stance</label>`
        + `<select name="stance">${stances
          .map((s, i) => `<option value="${i}">${s}</option>`).join("")}</select></div></div>`,
      buttons: [
        {
          action: "enter", label: "Enter stance", icon: "fa-solid fa-person-walking", default: true,
          callback: (event, button) => {
            const form = button.form ?? button.closest?.("form");
            // BY NAME, NEVER AS A PROPERTY — see refocus-workflow's
            // `selectedFocusIndex` for the collision that reads as working.
            return Number(form?.elements?.namedItem?.("stance")?.value ?? 0);
          }
        },
        { action: "cancel", label: "Not this time", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (choice === "cancel" || choice === null || choice === undefined) return null;

    const name = stances[Number(choice)] ?? null;
    if (!name) return null;

    const item = Array.from(actor.items ?? []).find(
      (i) => i.type === "feat" && i.name === name
    );
    if (!item) return null;

    // THE STANCE'S OWN HANDLER, with the cost waived for this one entry.
    // The flag is read by `enterFeatStance` and cleared as soon as it has
    // been honoured, so a stance entered later in the encounter pays for
    // itself as usual.
    await actor.setFlag(SYSTEM_ID, "reactiveStanceFree", true);
    try {
      const { useFeat } = await import("../feats-workflow.mjs");
      await useFeat(actor, item);
    } finally {
      await actor.unsetFlag(SYSTEM_ID, "reactiveStanceFree");
    }
    return name;
  } catch (_error) {
    // Deliberately swallowed. See the file comment.
    return null;
  }
}
