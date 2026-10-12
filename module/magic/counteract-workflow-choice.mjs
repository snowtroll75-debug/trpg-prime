/**
 * Which effect a limited counteract addresses — NEW at 3.613.0.
 *
 * Soothing Words "can attempt to counteract ONE emotion effect on the
 * target". When the target carries more than one, the caster chooses; the
 * engine picking would be deciding which fear the cleric meant to lift.
 * The Foundry half of counteract-row.mjs.
 */

/**
 * @param {string} spellName
 * @param {string} targetName
 * @param {Array<{kind: string, key: string, label: string}>} candidates
 * @param {number} limit how many may be chosen
 * @returns {Promise<Array<object>>} the chosen candidates (none if cancelled)
 */
export async function promptCounteractChoice(spellName, targetName, candidates, limit = 1) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length <= limit) return list;
  const DialogV2 = foundry.applications.api.DialogV2;
  const options = list.map((c, i) => `<option value="${i}">${c.label}</option>`).join("");
  const picked = await DialogV2.wait({
    window: { title: `${spellName} — counteract which?` },
    content: `<p>${targetName} carries more than one effect ${spellName} can address. Choose one to counteract:</p>`
      + `<div class="form-group"><select name="pick">${options}</select></div>`,
    buttons: [
      {
        action: "ok", label: "Counteract", default: true,
        callback: (event, button) => Number(button.form?.elements?.pick?.value ?? 0)
      },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (picked === null || picked === undefined || picked === "cancel") return [];
  const index = Number(picked);
  return Number.isInteger(index) && list[index] ? [list[index]] : [];
}
