/**
 * The Foundry side of a cast-time slot choice (see slot-choice.mjs).
 *
 * NEW at 3.507.0.
 *
 * ONE PROMPT, BECAUSE THE BOOK ASKS FOR ONE. Resistance: "a +1 resistance
 * bonus to any one of its saving throws (selected when casting)" — so the
 * choice belongs to the cast, and the +2 PP warp buys every save rather
 * than a second prompt.
 *
 * DELIBERATELY THE SAME SHAPE AS `promptTraditions`: every option is
 * offered, the count is enforced on submission rather than by disabling
 * boxes, and an over-pick is trimmed with a warning that says which rule
 * was met. A player who ticks two for a one-save casting should be told
 * why, not find a checkbox that will not tick.
 */

const { DialogV2 } = foundry.applications.api;

const esc = (v) => String(v ?? "").replace(
  /[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
);

const title = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/**
 * Ask which slots this casting covers.
 *
 * GENERALISED AT 3.517.0, and only in its wording. Restoration asks the
 * identical question about a different list — "instead reduce the dazed
 * OR weakened conditions by 1" is one purchase offering two, exactly as
 * Resistance's saves are — so it uses this prompt rather than a second
 * one that would drift from it. The defaults are the saving-throw
 * wording, so nothing about Resistance changed.
 *
 * @param {string} spellName
 * @param {string[]} options the slots on offer
 * @param {number} count how many may be picked
 * @param {object} [words] what this list is called, when it is not saves
 * @param {string} [words.question] the dialog title's question
 * @param {string} [words.noun] plural noun for the instruction line
 * @param {string} [words.confirm] the confirm button's label
 * @returns {Promise<string[]>} the chosen slots, or [] on cancel
 */
export async function promptSlotChoice(spellName, options, count, {
  question = "Which saving throw?",
  noun = "this creature's saving throws",
  confirm = "Protect"
} = {}) {
  const list = Array.isArray(options) ? options.filter(Boolean) : [];
  if (!list.length || count <= 0) return [];
  // NOTHING TO ASK when the spell offers exactly what it will take.
  if (list.length <= count) return [...list];

  const rows = list.map((slot) => `<label style="display:block;margin:3px 0">`
    + `<input type="checkbox" name="${esc(slot)}"> ${esc(title(slot))}</label>`).join("");

  const chosen = await DialogV2.wait({
    window: { title: `${spellName} — ${question}`, icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    content: `<p>Choose <strong>${count}</strong> of ${noun}.</p>${rows}`,
    buttons: [
      {
        action: "ok",
        label: confirm,
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          const data = new FDE(form).object;
          return list.filter((slot) => data[slot]).join(",");
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);

  if (!chosen || chosen === "cancel") return [];
  const picked = String(chosen).split(",").filter(Boolean);
  // MORE THAN PAID FOR IS TRIMMED, and the caster is told — the same
  // position promptTraditions takes, for the same reason: silently
  // applying all of them would hand out a warp nobody bought.
  if (picked.length > count) {
    ui.notifications.warn(
      `${spellName} covers ${count}; the first ${count} of your picks were taken.`);
    return picked.slice(0, count);
  }
  return picked;
}
