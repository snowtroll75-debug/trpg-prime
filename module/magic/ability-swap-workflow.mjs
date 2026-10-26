/**
 * The caster's choice on a tie, for `ability-swap.mjs` (3.672.0).
 *
 * "casters choice for any ties" — asked of whoever is casting, on this
 * client, only when two or more scores share the highest or the lowest
 * total. One candidate is not a question.
 */
import { abilityLabel } from "./ability-swap.mjs";

/**
 * @param {string} spellName
 * @param {string} targetName
 * @param {string[]} keys the tied scores
 * @param {"highest"|"lowest"} which
 * @param {number} total their shared total
 * @returns {Promise<string>} the chosen key, or "" if the dialog was closed
 */
export async function chooseTiedAbility(spellName, targetName, keys, which, total) {
  const list = Array.isArray(keys) ? keys : [];
  if (list.length <= 1) return list[0] ?? "";
  try {
    const picked = await foundry.applications.api.DialogV2.wait({
      window: { title: `${spellName} — which ${which} score?` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">${targetName}'s ${which} ability scores are tied at `
        + `<strong>${total}</strong>. The caster chooses which is switched.</p></div>`,
      buttons: list.map((key, i) => ({ action: key, label: abilityLabel(key), default: i === 0 })),
      rejectClose: false
    });
    return list.includes(String(picked ?? "")) ? String(picked) : "";
  } catch {
    return "";
  }
}
