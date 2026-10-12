/**
 * The Foundry side of the tradition-warding spells (see
 * spell-conditional.mjs).
 *
 * NEW at 3.497.0.
 *
 * ONE PROMPT, BECAUSE THE BOOK ASKS FOR ONE. Cancel Magic: "when you
 * cast this spell select one of the four magical traditions" — so the
 * choice belongs to the cast, not to the pack row, and the warp buys a
 * second pick rather than a second spell.
 */

import { TRADITIONS } from "./spell-conditional.mjs";

const { DialogV2 } = foundry.applications.api;

const esc = (v) => String(v ?? "").replace(
  /[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
);

/**
 * Ask which traditions this casting wards against.
 *
 * EVERY TRADITION IS OFFERED and the count is enforced on submission
 * rather than by disabling boxes: a player who ticks three for a
 * two-tradition casting is told which rule they met, instead of finding
 * a checkbox that will not tick and having to guess why.
 *
 * @returns {Promise<string[]>} the chosen traditions, or [] on cancel
 */
export async function promptTraditions(spellName, count) {
  const rows = TRADITIONS.map((t) => `<label style="display:block;margin:3px 0">`
    + `<input type="checkbox" name="${t}"> ${esc(t[0].toUpperCase() + t.slice(1))}</label>`).join("");

  const chosen = await DialogV2.wait({
    window: { title: `${spellName} — Which tradition?`, icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    content: `<p>Ward against <strong>${count}</strong> of the four magical traditions.</p>${rows}`,
    buttons: [
      {
        action: "ok",
        label: "Ward",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          const data = new FDE(form).object;
          return TRADITIONS.filter((t) => data[t]).join(",");
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);

  if (!chosen || chosen === "cancel") return [];
  const picked = String(chosen).split(",").filter(Boolean);
  // MORE THAN PAID FOR IS TRIMMED, and the caster is told. Silently
  // applying all of them would hand out a warp nobody bought.
  if (picked.length > count) {
    ui.notifications.warn(
      `${spellName} wards against ${count}; the first ${count} of your picks were taken.`);
    return picked.slice(0, count);
  }
  return picked;
}
