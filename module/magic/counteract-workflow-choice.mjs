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
export async function promptCounteractChoice(spellName, targetName, candidates, limit = 1, { confirm = false } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const cap = Math.max(0, Math.trunc(Number(limit) || 0)) || list.length;
  if (!confirm && list.length <= cap) return list;
  const DialogV2 = foundry.applications.api.DialogV2;
  // ONE PICK OR SEVERAL (3.696.0, CD3): a warp may raise the limit above one,
  // and a confirming row may be answered "none of these".
  const many = cap > 1;
  const rows = list.map((c, i) => many
    ? `<label class="checkbox"><input type="checkbox" name="pick" value="${i}"${i < cap ? " checked" : ""}> ${c.label}</label>`
    : `<option value="${i}">${c.label}</option>`).join("");
  const body = many
    ? `<p>${targetName}: choose up to ${cap} effect${cap === 1 ? "" : "s"} for ${spellName} to counteract${confirm ? " — untick an effect the target accepted willingly" : ""}:</p><div class="form-group stacked">${rows}</div>`
    : `<p>${targetName} carries ${list.length > 1 ? "more than one effect" : "an effect"} ${spellName} can address. Choose one to counteract${confirm ? ", or none if the target accepted it willingly" : ""}:</p>`
      + `<div class="form-group"><select name="pick">${rows}</select></div>`;
  const picked = await DialogV2.wait({
    window: { title: `${spellName} — counteract which?` },
    content: body,
    buttons: [
      {
        action: "ok", label: "Counteract", default: true,
        callback: (event, button) => many
          ? Array.from(button.form?.querySelectorAll?.('input[name="pick"]:checked') ?? []).map((el) => Number(el.value))
          : [Number(button.form?.elements?.pick?.value ?? 0)]
      },
      ...(confirm ? [{ action: "none", label: "None of these", callback: () => [] }] : []),
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (!Array.isArray(picked)) return [];
  return chosenCandidates(list, picked, cap);
}

/** The candidates at the chosen indexes, at most `cap`, in order. Pure. */
export function chosenCandidates(list = [], indexes = [], cap = 1) {
  const seen = new Set();
  const out = [];
  for (const i of indexes ?? []) {
    const n = Math.trunc(Number(i));
    if (!Number.isInteger(n) || seen.has(n) || !list[n]) continue;
    seen.add(n);
    out.push(list[n]);
    if (out.length >= Math.max(1, cap)) break;
  }
  return out;
}
