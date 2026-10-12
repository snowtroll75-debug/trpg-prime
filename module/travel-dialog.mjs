/**
 * THE TRAVEL CARD — page 226's table, asked of the party you have.
 *
 * NEW at 3.582.1. `module/travel.mjs` shipped at 3.582.0 with the
 * arithmetic right and NOTHING CALLING IT: a derivation verified against
 * all nine printed rows that no GM could reach from inside Foundry.
 * `verify-rules-have-callers` caught it on the first full sweep.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT READS THE PARTY'S REAL SPEEDS rather than asking the GM to type
 * them. That is the difference between this and the printed table: the
 * page can only list nine speeds, and the character who matters is
 * whichever one is slowest right now — the dwarf in full plate, the
 * encumbered mule, the wounded scout. Every one of those is a Speed the
 * sheet already knows and the table does not print.
 *
 * `speedValue` IS WHAT ASKS, not `Number(system.movement.x)`. Speeds are
 * pools, and reading the raw field gets `[object Object]` or `NaN`; the
 * rule that forbids it is `verify-speed-pool`, written after that exact
 * mistake shipped.
 */

import { TERRAIN_DIVISORS } from "./travel.mjs";
import { TERRAIN_LABELS, travelCardBody } from "./travel-card.mjs";
import { speedValue } from "./combat/speed-pool.mjs";
import { restCandidates } from "./rest/rest-workflow.mjs";

/** A character's land Speed, through the pool reader. */
export function landSpeed(actor) {
  return speedValue(actor?.system?.combat?.movement?.land);
}

/**
 * The GM's Travel button.
 *
 * @returns {Promise<object|null>} the posted message, or null
 */
export async function openTravelDialog() {
  const { DialogV2 } = foundry.applications.api;
  const { actors, scopeNote } = restCandidates();

  if (!actors.length) {
    ui.notifications.warn(
      "No characters found to travel. Create a character actor, or select the token(s) you want to move."
    );
    return null;
  }

  const rows = actors
    .map((actor) => `
      <tr>
        <td><label><input type="checkbox" name="include-${actor.id}" checked> ${actor.name}</label></td>
        <td style="text-align:right">${landSpeed(actor)}</td>
      </tr>`)
    .join("");

  const terrainOptions = Object.keys(TERRAIN_DIVISORS)
    .map((key) => `<option value="${key}"${key === "normal" ? " selected" : ""}>${TERRAIN_LABELS[key]}</option>`)
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Travel", icon: "fa-solid fa-person-hiking" },
    classes: ["trg-prime"],
    position: { width: 520 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="notes" style="margin:0 0 6px">${scopeNote}</p>
        <div class="form-group">
          <label for="trg-travel-terrain">Terrain</label>
          <select id="trg-travel-terrain" name="terrain">${terrainOptions}</select>
        </div>
        <div class="form-group">
          <label for="trg-travel-miles">Journey (miles, optional)</label>
          <input id="trg-travel-miles" type="number" name="miles" value="0" min="0" step="any">
        </div>
        <table style="width:100%;text-align:left;font-size:0.85rem">
          <thead><tr><th>Travelling</th><th style="text-align:right">Speed</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
    buttons: [
      {
        action: "travel",
        label: "Travel",
        icon: "fa-solid fa-person-hiking",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;

  const members = actors
    .filter((actor) => result[`include-${actor.id}`])
    .map((actor) => ({ name: actor.name, speed: landSpeed(actor) }));

  if (!members.length) {
    ui.notifications.warn("No characters selected to travel.");
    return null;
  }

  return ChatMessage.create({
    content: '<div class="trg-prime trg-check-card"><header class="check-header">'
      + '<div class="check-heading"><h3>Travel</h3></div></header>'
      + travelCardBody(members, String(result.terrain ?? "normal"), Number(result.miles) || 0)
      + "</div>"
  });
}
