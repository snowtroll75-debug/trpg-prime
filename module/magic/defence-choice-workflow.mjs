/**
 * The Foundry side of a chosen defence type (3.611.0). See defence-choice.mjs.
 */

import { acceptedDefenceChoice } from "./defence-choice.mjs";

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/**
 * Ask which type the resistance (or immunity) answers to.
 *
 * @param {string} spellName
 * @param {string[]} choices the printed list
 * @param {string} field "resistance" | "immunity"
 * @returns {Promise<string>} one of `choices`
 */
export async function promptDefenceChoice(spellName, choices, field = "resistance") {
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${spellName} — which type` },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog"><p class="hint">Choose the damage type the ${field} answers to.</p></div>`,
    buttons: choices.map((c, i) => ({ action: c, label: cap(c), default: i === 0 })),
    rejectClose: false
  }).catch(() => null);
  return acceptedDefenceChoice(choices, picked);
}
