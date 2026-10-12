/**
 * THE DAMAGE ROLL'S CONDITIONALS, ASKED AND SPENT (3.626.1). Foundry side
 * of combat/damage-conditionals.mjs.
 *
 * Called from `rollWeaponAttack` on the hit path, before the damage
 * formula is built, so the bonus is IN the roll rather than a line after
 * it. The same three sources the check engine reads — items, the actor's
 * effects, the runes' conditionals — plus the ally auras in force; the
 * `auto` rows are taken, the rest are offered in one dialog, and a
 * one-shot effect that was ticked is deleted the way the dialog deletes
 * it. Nothing is asked when no row needs a person.
 */

import { CONDITIONAL_KINDS, applyConditionalSelections, collectConditionals, scalingFor } from "../conditionals.mjs";
import { autoDamageRowIds, damageConditionalRows, damageConditionalTotal } from "./damage-conditionals.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {object} [options]
 * @param {boolean} [options.skipPrompt] take the auto rows only (a Shift-click Strike)
 * @returns {Promise<{bonus: number, lines: string[]}>}
 */
export async function declaredDamageBonus(actor, weapon, { skipPrompt = false } = {}) {
  if (!actor) return { bonus: 0, lines: [] };
  const { allyAuraConditionalsFor } = await import("../creature-aura-workflow.mjs");
  const entries = collectConditionals(
    Array.from(actor.items ?? []),
    Array.from(actor.appliedEffects ?? actor.effects ?? []),
    [...(actor.system?.combat?.runeConditionals ?? []), ...allyAuraConditionalsFor(actor)],
    scalingFor(actor)
  );
  const rows = damageConditionalRows(entries, { traits: String(weapon?.system?.traits ?? "") });
  if (!rows.length) return { bonus: 0, lines: [] };

  let ticked = autoDamageRowIds(rows);
  const offered = rows.filter((row) => !row.auto);
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (offered.length && !skipPrompt && DialogV2) {
    const picked = await DialogV2.wait({
      window: { title: `${weapon?.name ?? "Damage"} — damage bonuses`, icon: "fa-solid fa-burst" },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p>Does any of this apply to the damage?</p>${offered.map((row) =>
        `<div class="form-group"><label><input type="checkbox" name="row" value="${esc(row.id)}"> <strong>${esc(row.detail)}</strong> — ${esc(row.summary)}</label></div>`).join("")}</div>`,
      buttons: [
        { action: "ok", label: "Roll damage", default: true, callback: (_e, button) => Array.from(button.form?.querySelectorAll?.("input[name=row]:checked") ?? []).map((i) => i.value) },
        { action: "none", label: "None of these", callback: () => [] }
      ],
      rejectClose: false
    });
    if (Array.isArray(picked)) ticked = [...ticked, ...picked];
  }
  if (!ticked.length) return { bonus: 0, lines: [] };

  const chosen = rows.filter((row) => ticked.includes(row.id) && row.kind === CONDITIONAL_KINDS.MODIFIER);
  const { total, lines } = damageConditionalTotal(chosen);
  // A ONE-SHOT EFFECT IS SPENT BY THE ROLL IT JOINED, as the check dialog spends it.
  const { spent } = applyConditionalSelections(rows, ticked);
  for (const { sourceId, label } of spent ?? []) {
    const effect = actor.effects?.get?.(sourceId);
    if (effect?.delete) await effect.delete();
    else ui.notifications?.warn?.(`${label || "A one-shot bonus"} was used but could not be cleared — remove it by hand.`);
  }
  return { bonus: total, lines };
}
