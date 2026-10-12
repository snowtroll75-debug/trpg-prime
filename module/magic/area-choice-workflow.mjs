/**
 * The Foundry side of the area choice (see area-choice.mjs).
 *
 * NEW at 3.479.0.
 *
 * THE SAME SPLIT AS `kind-gate.mjs`: the rule is pure and drivable, and
 * this half is the part that needs a live world — it opens a dialog and
 * reads what came back.
 */

import { areaChoiceRows } from "./area-choice.mjs";

/**
 * Ask the caster which of the caught creatures the spell affects.
 *
 * @param {string} spellName for the dialog's title
 * @param {Array} caught the actors the template caught
 * @param {string} casterId
 * @returns {Promise<string[]|null>} the chosen ids, or null if the
 *   caster cancelled — null means "make no choice", and the caller
 *   leaves the caught list alone rather than silently sparing everybody.
 */
export async function promptAreaChoice(spellName, caught, casterId) {
  const rows = areaChoiceRows(caught, casterId);
  if (!rows.length) return null;

  const body = rows.map((r) => `
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;font-weight:normal">
        <input type="checkbox" name="t" value="${r.id}" ${r.ticked ? "checked" : ""}>
        <span>${foundry.utils.escapeHTML?.(r.name) ?? r.name}${
          r.isCaster ? " <em>(you — the caster)</em>" : ""
        }</span>
      </label>
    </div>`).join("");

  const content = `
    <p>${foundry.utils.escapeHTML?.(spellName) ?? spellName} lets you choose which characters
    in the area it affects.</p>
    <p style="opacity:.8;font-size:.9em">Everyone the area caught is ticked, except you —
    tick yourself to be caught by your own spell.</p>
    ${body}`;

  return new Promise((resolve) => {
    new foundry.applications.api.DialogV2({
      window: { title: `${spellName} — Choose Targets` },
      content,
      buttons: [
        {
          action: "ok",
          label: "Confirm",
          default: true,
          callback: (_e, button) => {
            const form = button.form ?? button.closest?.("form") ?? null;
            const boxes = form
              ? form.querySelectorAll('input[name="t"]:checked')
              : [];
            resolve([...boxes].map((b) => b.value));
          }
        },
        // CANCEL IS NOT "SPARE EVERYBODY". It returns null, and the
        // caller treats null as "no choice made" — the same distinction
        // `promptTargetSelection` draws between an explicit empty
        // selection and a dialog that was dismissed.
        { action: "cancel", label: "Cancel", callback: () => resolve(null) }
      ],
      close: () => resolve(null)
    }).render(true);
  });
}
