/**
 * The two prompts the form-adding warps need (3.595.0).
 *
 * See magic/polymorph-warps.mjs for the rules and for why `morphForms`
 * is not the key for the attacks.
 *
 * ASKED ONLY WHEN BOUGHT. Neither prompt appears on a cast that did not
 * purchase the option, which is why both are behind a count rather than
 * behind a spell name: the moment Size Alteration's own steps are wired
 * to the same key, this asks for them too and nothing here changes.
 */

import { contentPack } from "../content-packs.mjs";
import {
  extraAttackCount, extraAttackRow, sizeStepRow, sizeStepsBought
} from "./polymorph-warps.mjs";

const { DialogV2 } = foundry.applications.api;

/** The natural attacks this system actually ships, by name. */
async function attackNames() {
  const pack = contentPack("creature-attacks");
  if (!pack) return [];
  const index = await pack.getIndex();
  return index.map((e) => String(e.name)).sort((a, b) => a.localeCompare(b));
}

/**
 * The rows the purchased warps add to a form, after asking what is needed.
 *
 * RETURNS ROWS, and applies nothing: they join the chosen form's own rows
 * and travel through the same applier, so a warped form ends the spell
 * exactly as an unwarped one does. Nothing here knows about durations,
 * cast ids or effects, and that is deliberate — those were got wrong once
 * already by a mechanism that applied its own extras on the side.
 *
 * @param {Item} spell
 * @param {object} warpMods the aggregated purchase
 * @param {string} currentSize the size the creature is now
 * @returns {Promise<{rows: object[], cancelled: boolean}>}
 */
export async function polymorphWarpRows(spell, warpMods, currentSize = "") {
  const rows = [];
  const steps = sizeStepsBought(warpMods);
  if (steps > 0) {
    const direction = await DialogV2.wait({
      window: { title: `${spell?.name ?? "Spell"} — Size` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p>You bought `
        + `<strong>${steps === 1 ? "one size step" : `${steps} size steps`}</strong>`
        + `${currentSize ? ` from <strong>${currentSize}</strong>` : ""}. Which way?</p></div>`,
      buttons: [
        { action: "larger", label: `Larger (${steps === 1 ? "+1" : `+${steps}`} step${steps === 1 ? "" : "s"})` },
        { action: "smaller", label: `Smaller (${steps === 1 ? "−1" : `−${steps}`} step${steps === 1 ? "" : "s"})` }
      ],
      rejectClose: false
    });
    // A CANCELLED SIZE PROMPT IS NOT A CANCELLED CAST. The spell has been
    // paid for by the time this is asked; dropping the step the caster
    // declined to aim is the smaller loss, and the card says it was not
    // taken.
    const row = direction ? sizeStepRow(steps, direction, spell?.name) : null;
    if (row) rows.push(row);
  }

  const attacks = extraAttackCount(warpMods);
  if (attacks > 0) {
    const names = await attackNames();
    for (let i = 0; i < attacks; i += 1) {
      if (!names.length) break;
      const picked = await DialogV2.wait({
        window: { title: `${spell?.name ?? "Spell"} — Natural Attack ${i + 1} of ${attacks}` },
        classes: ["trg-prime"],
        content: `<div class="trg-prime trg-check-dialog"><p class="hint">`
          + "Which additional natural attack does the form grow?</p></div>",
        buttons: names.map((n) => ({ action: n, label: n })),
        rejectClose: false
      });
      const row = picked ? extraAttackRow(picked, spell?.name) : null;
      if (row) rows.push(row);
    }
  }
  return rows;
}
