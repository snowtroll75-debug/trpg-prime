/**
 * The Foundry side of Selective Spell (see metamagic-targets.mjs).
 *
 * NEW at 3.717.0 (O4). After the template has caught its creatures, and
 * after the kind gate, trait immunity and Aligned Spell have pruned them,
 * the caster ticks up to the number of exclusions they bought. More than
 * that is refused and the dialog asked again, not trimmed: trimming would
 * decide for the caster which of their choices to drop.
 *
 * CANCEL EXCLUDES NOBODY. The PP bought the right to choose; walking away
 * from the choice leaves the spell to land on everyone it caught, and the
 * card says nobody was excluded. (Missile Storm's chooser refunds the cast
 * on Cancel because there the choice IS the targeting; here the targeting
 * was the template.)
 */

import { selectiveExclusion } from "./metamagic-targets.mjs";

/**
 * @param {string} spellName
 * @param {object[]} caught the actors the area will affect
 * @param {number} max the exclusions bought
 * @returns {Promise<{kept:object[], excluded:object[]}>}
 */
export async function promptSelectiveExclusion(spellName, caught, max) {
  const list = (caught ?? []).filter(Boolean);
  if (!list.length || !(max > 0)) return { kept: list, excluded: [] };
  const esc = (t) => foundry.utils.escapeHTML?.(String(t)) ?? String(t);
  let warning = "";
  for (;;) {
    const rows = list.map((a) => `
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;font-weight:normal">
          <input type="checkbox" name="x" value="${esc(a.id)}">
          <span>${esc(a.name)}</span>
        </label>
      </div>`).join("");
    const content = `${warning}
      <p>${esc(spellName)} — Selective Spell: tick up to <strong>${max}</strong>
      creature${max > 1 ? "s" : ""} to exclude from the spell's effect.</p>
      <p style="opacity:.8;font-size:.9em">You must be aware of a creature to exclude it.</p>
      ${rows}`;
    const ids = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `${spellName} — Selective Spell` },
        content,
        buttons: [
          {
            action: "ok", label: "Exclude", default: true,
            callback: (_e, button) => {
              const form = button.form ?? button.closest?.("form") ?? null;
              resolve(form ? [...form.querySelectorAll('input[name="x"]:checked')].map((b) => b.value) : []);
            }
          },
          { action: "cancel", label: "Exclude nobody", callback: () => resolve([]) }
        ],
        close: () => resolve([])
      }).render(true);
    });
    const result = selectiveExclusion(list, ids, max);
    if (!result.over) return { kept: result.kept, excluded: result.excluded };
    warning = `<p style="color:var(--color-level-error, #c00)"><strong>${ids.length} ticked — you bought ${max}.</strong> Tick ${max} or fewer.</p>`;
  }
}
