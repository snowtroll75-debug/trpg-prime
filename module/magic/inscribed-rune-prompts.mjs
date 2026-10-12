/**
 * Asking the caster what an inscribed rune is for (see inscribed-rune.mjs).
 *
 * NEW at 3.604.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO QUESTIONS, ONE PER RUNE, BOTH ASKED AFTER THE RADIUS IS DRAWN.
 *
 *   THE WARD asks WHO. The list is exactly the creatures standing inside
 *   the circle the caster just placed, because "all creatures you
 *   designate at the time of casting" is a designation made at an
 *   inscription, of people who are there.
 *
 *   THE WARNING asks WHAT TRAIT. The book's examples are "elf, orc, etc",
 *   so it is free text rather than a list: the system's trait vocabulary
 *   is not a closed set of ancestries, and offering a fixed menu would
 *   refuse a rune set for something the GM invented last session.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOBODY IS PRE-TICKED, AND THAT IS THE OPPOSITE OF THE AREA PICKER.
 *
 * `area-choice.mjs` arrives with everybody ticked, because its spell's
 * printed default is "each character in the area" and starting empty would
 * make the ordinary cast five clicks.
 *
 * This one starts EMPTY, because the ward's printed default is nothing:
 * "all creatures you designate" names no default set, and a caster who
 * presses Continue without reading should get the ward they explicitly
 * asked for — which is none — rather than silently warding an enemy who
 * happened to be standing in the circle. The card says so out loud when
 * nobody was named, so a cast that bought nothing cannot look like a bug.
 */

const text = (v) => String(v ?? "").trim();

/**
 * Which of the creatures inside the radius are warded.
 *
 * @param {string} spellName
 * @param {Array} candidates token documents inside the circle
 * @returns {Promise<string[]>} their uuids
 */
export async function promptRuneDesignation(spellName, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return [];
  const rows = list.map((t, i) => `<label style="display:block"><input type="checkbox" `
    + `name="ward" value="${t.uuid}" data-index="${i}"> ${t.name}</label>`).join("");
  try {
    const picked = await foundry.applications.api.DialogV2.wait({
      window: { title: `${spellName} — Designate` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">Who does this rune ward? `
        + `Designation is fixed as the rune is inscribed and cannot be added to later.</p>`
        + `<form>${rows}</form></div>`,
      buttons: [
        {
          action: "ok", label: "Inscribe", default: true,
          callback: (_event, button) => {
            const form = button.form ?? button.closest?.("form")
              ?? button.parentElement?.querySelector?.("form");
            if (!form) return [];
            return Array.from(form.querySelectorAll("input[name=ward]:checked"))
              .map((el) => text(el.value)).filter(Boolean);
          }
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    // A CLOSED DIALOG DESIGNATES NOBODY, which is the ward's own default
    // and is reported on the card rather than passed over in silence.
    return Array.isArray(picked) ? picked.map(text).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Which race trait the Rune of Warning watches for.
 *
 * FREE TEXT, LOWERCASED ON THE WAY OUT so a rune set for "Elf" answers a
 * creature whose traits say "elf". The matching is done by
 * `runeWatchesTrait`, which folds case on both sides; this only keeps the
 * record tidy.
 */
export async function promptRuneTrait(spellName) {
  try {
    const picked = await foundry.applications.api.DialogV2.wait({
      window: { title: `${spellName} — Which trait?` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">Which race trait does `
        + `this rune watch for? The book's examples are elf and orc.</p>`
        + `<form><input type="text" name="trait" placeholder="elf" autofocus></form></div>`,
      buttons: [
        {
          action: "ok", label: "Inscribe", default: true,
          callback: (_event, button) => {
            const form = button.form ?? button.closest?.("form")
              ?? button.parentElement?.querySelector?.("form");
            return text(form?.querySelector?.("input[name=trait]")?.value ?? "");
          }
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    return text(picked).toLowerCase();
  } catch {
    return "";
  }
}
