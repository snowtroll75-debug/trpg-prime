/**
 * The Foundry half of Spell Turning (see spell-turning.mjs).
 *
 * NEW at 3.608.0. ONE CALLER: cast-workflow.mjs, after a casting has
 * succeeded and before it resolves.
 */

import {
  SPELL_TURNING_FLAG, normaliseSpellTurning, notTurnedLine, turnedLine, turningModifierRow
} from "./spell-turning.mjs";

const SYSTEM_ID = "trg-prime";

/** The ward on a creature, or null. */
function turningWardOn(actor) {
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    const raw = effect.getFlag?.(SYSTEM_ID, SPELL_TURNING_FLAG);
    const spec = normaliseSpellTurning(raw);
    if (spec) return spec;
  }
  return null;
}

/**
 * Offer every warded target its reaction, and turn what it turns.
 *
 * @param {Actor} caster
 * @param {Item} spell
 * @param {{spellPP: number, castTotal: number}} cast
 * @returns {Promise<string[]>} card lines
 */
export async function offerSpellTurning(caster, spell, { spellPP = 0, castTotal = 0 } = {}) {
  const lines = [];
  const marked = Array.from(game.user?.targets ?? []);
  const casterToken = caster?.token?.object ?? caster?.getActiveTokens?.()[0] ?? null;
  for (const token of marked) {
    const holder = token?.actor ?? null;
    if (!holder || holder === caster) continue;
    const ward = turningWardOn(holder);
    if (!ward) continue;
    const answer = await foundry.applications.api.DialogV2.wait({
      window: { title: `${ward.label} — ${holder.name}` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p><strong>${holder.name}</strong> is warded by `
        + `${ward.label} (${ward.pp} PP). Does it spend its reaction to turn <strong>${spell.name}</strong> `
        + `(${spellPP} PP) back on ${caster.name}?</p><p class="hint">Counteract check: Spellcraft against `
        + `${caster.name}'s Spellcasting result of ${castTotal}.</p></div>`,
      buttons: [
        { action: "turn", label: "Turn it (reaction)" },
        { action: "let", label: "Let it land", default: true }
      ],
      rejectClose: false
    });
    if (answer !== "turn") continue;
    const { spendReaction } = await import("../combat/action-points-workflow.mjs");
    await spendReaction(holder, ward.label);
    const { TRGCheck } = await import("../dice/check.mjs");
    const row = turningModifierRow(ward.pp, spellPP);
    const check = await TRGCheck.roll({
      actor: holder,
      type: "spellcraft",
      subject: "spellcraft",
      label: `${ward.label} — counteract ${spell.name}`,
      dc: Number(castTotal) || 0,
      modifiers: [
        ...(holder.system?.magic?.spellcraft?.checkModifiers ?? [{
          label: "Spellcraft", value: Number(holder.system?.magic?.spellcraft?.total ?? 0), type: "untyped"
        }]),
        ...(row ? [row] : [])
      ]
    });
    if (!check?.outcome?.degree?.success) {
      lines.push(notTurnedLine(ward.label, holder.name, spell.name));
      continue;
    }
    // THE CASTER TAKES THE WARDED CREATURE'S PLACE among the targets, so
    // every reader of the marked targets below resolves the spell on them.
    token.setTarget?.(false, { releaseOthers: false, groupSelection: true });
    casterToken?.setTarget?.(true, { releaseOthers: false, groupSelection: true });
    lines.push(turnedLine(ward.label, holder.name, spell.name, caster.name));
  }
  return lines;
}

/**
 * REFLECTING (3.616.0, Graham's R7 of block 36: "Your recommendation,
 * automate"). "Activate Reaction; the wielder is the trigger of a spell …
 * The shield's wielder can reflect a spell back upon its caster as if
 * using the spell turning spell."
 *
 * Offered beside Spell Turning, to every marked target wielding a shield
 * with the rune and an allowance that reaches the spell's PP. The rune's
 * allowance IS its gate — there is no counteract check, because the rune
 * prints none and has no PP of its own to roll with. Item casts are
 * offered too: a wand's spell is as much a spell as anyone's.
 *
 * Spends the reaction, the allowance and the rune's count, and swaps the
 * wielder for the caster among the targets, as Spell Turning does.
 *
 * @returns {Promise<string[]>} card lines
 */
export async function offerReflecting(caster, spell, { spellPP = 0 } = {}) {
  const lines = [];
  const { equippedEventRune, reflectionAvailable, reflectionSpendUpdates } = await import("../rune-events.mjs");
  const { actorInCombat, spendReaction } = await import("../combat/action-points-workflow.mjs");
  const marked = Array.from(game.user?.targets ?? []);
  const casterToken = caster?.token?.object ?? caster?.getActiveTokens?.()[0] ?? null;
  for (const token of marked) {
    const holder = token?.actor ?? null;
    if (!holder || holder === caster) continue;
    const found = equippedEventRune(Array.from(holder.items ?? []).filter((i) => i.type === "shield"), "reflecting");
    if (!found) continue;
    const { item, rune } = found;
    const spent = item.flags?.[SYSTEM_ID]?.runeState?.spent ?? {};
    const allowance = reflectionAvailable(rune, spellPP, spent);
    if (!allowance.available) {
      lines.push(`<em>${holder.name}'s ${item.name} cannot reflect it: ${allowance.reason}</em>`);
      continue;
    }
    if (actorInCombat(holder) && Number(holder.system?.resources?.reactions?.value ?? 0) < 1) {
      lines.push(`<em>${holder.name}'s ${item.name} could reflect it, but ${holder.name} has no reaction left.</em>`);
      continue;
    }
    const answer = await foundry.applications.api.DialogV2.wait({
      window: { title: `${rune.label} — ${holder.name}` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p><strong>${holder.name}</strong>'s ${item.name} `
        + `bears ${rune.label}. Does ${holder.name} spend a reaction to reflect <strong>${spell.name}</strong> `
        + `(${spellPP} PP) back on ${caster.name}?</p><p class="hint">Uses the up-to-PP-${allowance.maxPP} `
        + `allowance (${allowance.remaining} left today). No check: the rune turns it.</p></div>`,
      buttons: [
        { action: "reflect", label: "Reflect it (reaction)" },
        { action: "let", label: "Let it land", default: true }
      ],
      rejectClose: false
    });
    if (answer !== "reflect") continue;
    await spendReaction(holder, rune.label);
    const updates = {};
    for (const [k, v] of Object.entries(reflectionSpendUpdates(spent, allowance.maxPP))) {
      updates[`flags.${SYSTEM_ID}.runeState.spent.${k}`] = v;
    }
    await item.update(updates);
    token.setTarget?.(false, { releaseOthers: false, groupSelection: true });
    casterToken?.setTarget?.(true, { releaseOthers: false, groupSelection: true });
    lines.push(`<strong>${rune.label}</strong>: ${holder.name}'s ${item.name} reflects <strong>${spell.name}</strong> `
      + `back on <strong>${caster.name}</strong> — it resolves on its caster with the same Spellcasting result. `
      + `<em>${allowance.remaining - 1} reflection${allowance.remaining - 1 === 1 ? "" : "s"} up to PP ${allowance.maxPP} left today.</em>`);
  }
  return lines;
}
