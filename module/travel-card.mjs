/**
 * THE TRAVEL CARD'S BODY — page 226's table for the party you have.
 *
 * SPLIT OUT OF `travel-dialog.mjs` AT 3.582.1 so the harness can drive
 * it. The dialog reaches `restCandidates`, which reaches the rest
 * workflow, which reaches the exhaustion workflow — and that one calls
 * `foundry.applications.api` at module scope. Importing the dialog into
 * a check therefore imports Foundry, which does not exist in node.
 *
 * The rule is the arithmetic and the sentence it prints. Neither needs
 * Foundry, so neither lives with it.
 *
 * Pure; no Foundry.
 */

import {
  travelSpeed,
  partyTravelSpeed,
  travelTime,
  formatDistance
} from "./travel.mjs";

export const TERRAIN_LABELS = Object.freeze({
  normal: "Normal",
  difficult: "Difficult (halved)",
  formidable: "Formidable (quartered)"
});

/**
 * The card's body for one party, one terrain and one optional journey.
 *
 * Pure but for the numbers handed to it, so the harness can drive it.
 *
 * @param {Array<{name: string, speed: number}>} members
 * @param {string} terrain
 * @param {number} miles 0 for "no journey asked"
 * @returns {string}
 */
export function travelCardBody(members, terrain, miles) {
  const party = partyTravelSpeed(members);
  if (!party.speed) return "<p>No one in the party has a Speed to travel at.</p>";

  const pace = travelSpeed(party.speed, terrain);
  const rows = party.members
    .map((member) => {
      const own = travelSpeed(member.speed, terrain);
      const slow = member.name === party.pacedBy && member.speed === party.speed;
      return `<tr${slow ? ' style="font-weight:600"' : ""}>`
        + `<td>${member.name}</td><td>${member.speed}</td>`
        + `<td>${formatDistance(own.feetPerMinute)}</td>`
        + `<td>${formatDistance(own.milesPerHour)}</td>`
        + `<td>${formatDistance(own.milesPerDay)}</td></tr>`;
    })
    .join("");

  let journey = "";
  if (miles > 0) {
    const time = travelTime(miles, party.speed, terrain);
    journey = time
      ? `<p style="margin:4px 0"><strong>${formatDistance(miles)} miles:</strong> `
        + `${formatDistance(time.days)} day${time.days === 1 ? "" : "s"} `
        + `(${formatDistance(time.hours)} hours of travel).</p>`
      : "";
  }

  return `<p style="margin:2px 0"><strong>${TERRAIN_LABELS[pace.terrain] ?? "Normal"}</strong> — the party travels at `
    + `<strong>${party.speed}</strong>, paced by <strong>${party.pacedBy}</strong>: `
    + `${formatDistance(pace.feetPerMinute)} feet a minute, ${formatDistance(pace.milesPerHour)} mph, `
    + `<strong>${formatDistance(pace.milesPerDay)} miles a day</strong>.</p>`
    + journey
    + '<table style="width:100%;text-align:left;font-size:0.85rem">'
    + "<thead><tr><th>Character</th><th>Speed</th><th>ft/min</th><th>mph</th><th>miles/day</th></tr></thead>"
    + `<tbody>${rows}</tbody></table>`;
}

