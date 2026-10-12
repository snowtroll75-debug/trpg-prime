/**
 * Asking the caster which damage type (see damage-type-choice.mjs).
 *
 * WIDENED at 3.603.0 from `elemental-choice-workflow.mjs` (3.473.0).
 *
 * ─────────────────────────────────────────────────────────────────────
 * ASKED IN THE APPLIER, NOT IN THE CAST DIALOG.
 *
 * The warp dialog would have been the tidier home, but it is built before
 * the spellcasting check and a spell that fails never needs the question
 * — so asking there would interrupt every fumbled Elemental Shield for a
 * choice nobody gets to use. The target picker already prompts from this
 * side of the check for the same reason.
 *
 * ONE OFFER IS NOT A QUESTION. A row naming a single type resolves without
 * a dialog, which keeps a one-type spell from asking something that has
 * only one answer.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE QUESTION USES THE BOOK'S OWN WORD, AND DERIVES IT.
 *
 * Nexus and Elemental Shield print "element"; Shadow Blast prints neither
 * word and offers slashing and force alongside fire. Asking "which
 * element?" over a list containing *piercing* would be the system telling
 * the player something untrue about their own spell. So the wording comes
 * from the OFFER — all four elements or fewer, it is an element; anything
 * wider, it is a damage type — rather than from a field somebody has to
 * remember to set.
 */

import { allAreElements, damageTypeLabel, damageReductionNote } from "./damage-type-choice.mjs";

/**
 * Ask which of the offered damage types this cast uses.
 *
 * @param {string} label the spell's own name for itself
 * @param {string[]} offered from `offeredTypes`
 * @returns {Promise<string>} the chosen type, or "" if cancelled
 */
export async function promptTypeChoice(label, offered) {
  const choices = Array.isArray(offered) ? offered : [];
  if (choices.length <= 1) return choices[0] ?? "";
  const noun = allAreElements(choices) ? "element" : "damage type";
  const buttons = choices.map((type) => ({ action: type, label: damageTypeLabel(type) }));
  try {
    const picked = await foundry.applications.api.DialogV2.wait({
      window: { title: `${label} — Which ${noun}?` },
      classes: ["trg-prime"],
      // WHAT EACH ANSWER COSTS THE TARGET, listed with the buttons. The
      // choice is not cosmetic — a physical type is reduced by Damage
      // Reduction in full and force not at all — and a player who has to
      // leave the dialog to find that out will stop reading it.
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">Choose the ${noun} `
        + `for this casting.</p><ul>${choices.map((t) => {
          const dr = damageReductionNote(t);
          return `<li><strong>${damageTypeLabel(t)}</strong>${dr ? ` — ${dr}` : ""}</li>`;
        }).join("")}</ul></div>`,
      buttons,
      // CANCELLING PICKS NOTHING rather than silently taking the first.
      // The caller prints a refusal, which is the honest outcome of a
      // question nobody answered.
      rejectClose: false
    });
    return String(picked ?? "");
  } catch {
    return "";
  }
}
