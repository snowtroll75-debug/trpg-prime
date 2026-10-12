/**
 * Spell armour — Mage Armour, rebuilt as armour (3.617.2).
 *
 * WHAT WAS WRONG. Block 29's audit (D5, R5) asked for Mage Armour's DR to
 * be built "base, BSB scaling, and the warp". 3.591.0 shipped a +1 status
 * bonus to the Bonus DR pool — which ADDS to worn armour — and left the BSB
 * scaling as a note, without saying so. So the page's own worked example,
 *
 *   "a Wizard with a BSB of 6, would gain DR 2 from the unmodified casting
 *    of this spell. If that Wizard was to then warp the spell by +4 PP, the
 *    DR would increase to 4",
 *
 * came out 1 and 2, on top of any armour, with no 20 HP, no destruction,
 * no hour's lockout and nothing at CL 4, 6, 8 or 10. Graham, 4 October
 * 2026: "it needs to be done this way otherwise the spell is not automated!"
 *
 * THE RULINGS (MA1–MA4, all "your recommendation"):
 *   MA1 — its DR is ARMOUR: the higher of it and worn armour's, never both;
 *   MA2 — with Bracers of Armour, only the highest Base DR counts;
 *   MA3 — a critical to an unarmoured location bypasses it;
 *   MA4 — its CR (CL 8) and rigidity (CL 10) last only while it has HP.
 *
 * ONE CHANNEL WITH THE BRACERS. Both are a Base DR scaled by BSB with an HP
 * pool that absorbs what the DR stops (3.617.0–3.617.1). The bracers go
 * inert for an hour at 0; Mage Armour "is destroyed and the spell cannot be
 * cast again for 1 hour" — the same pool, a different ending. So the spell's
 * effect becomes one more Base DR entry beside the bracers', and
 * wondrous-effects.mjs `bracersBaseDR` picks the highest.
 *
 * Pure. The cast writes the state onto the spell's own ActiveEffect, so it
 * ends with the spell: dismissed, expired or destroyed.
 */

/** The ActiveEffect flag holding a cast's armour state. */
export const SPELL_ARMOUR_FLAG = "spellArmour";

const step = (raw) => ({
  every: Math.max(0, Math.trunc(Number(raw?.every) || 0)),
  value: Math.max(0, Math.trunc(Number(raw?.value) || 0))
});

/**
 * A spellArmour row, or null when malformed (refused, not defaulted — the
 * same rule as every `normalise*` beside it).
 */
export function normaliseSpellArmour(effect = {}) {
  if (effect?.kind !== "spellArmour") return null;
  const baseDR = Number(effect?.baseDR);
  const hp = Number(effect?.hp);
  if (!Number.isFinite(baseDR) || baseDR < 0 || !Number.isFinite(hp) || hp <= 0) return null;
  return {
    label: String(effect?.label ?? "").trim() || "Spell Armour",
    baseDR: Math.trunc(baseDR),
    hp: Math.trunc(hp),
    hpStep: step(effect?.hpStep),
    multiplierStep: step(effect?.multiplierStep),
    crStep: step(effect?.crStep),
    rigidAt: Math.max(0, Math.trunc(Number(effect?.rigidAt) || 0)),
    lockoutMinutes: Math.max(0, Math.trunc(Number(effect?.lockoutMinutes) || 0))
  };
}

/** "CL N+": once at N and again every N levels (caster-level-mods.mjs). */
function steps(spec, casterLevel) {
  return spec.every > 0 ? Math.floor(Math.max(0, Number(casterLevel) || 0) / spec.every) * spec.value : 0;
}

/**
 * The armour a cast makes, fixed at the cast: the caster's level and BSB,
 * and the warp bought.
 *
 * "+4 PP: the DR increases by +1" raises the BASE — the page's example
 * warps a BSB-6 Wizard from 2 to 4, which is (1 + 1) × 2, not 2 + 1. It is
 * the warp's existing `bonusValue` mod, so an owned copy's warp needs no
 * change.
 *
 * @param {object} spec from normaliseSpellArmour
 * @param {{casterLevel?: number, bsb?: number, warpMods?: object}} at
 */
export function spellArmourAtCast(spec, { casterLevel = 0, bsb = 0, warpMods = {} } = {}) {
  const bump = Math.max(0, Math.trunc(Number(warpMods?.bonusValue) || 0));
  const max = spec.hp + steps(spec.hpStep, casterLevel);
  return {
    label: spec.label,
    baseDR: spec.baseDR + bump,
    bsb: Math.max(0, Math.trunc(Number(bsb) || 0)),
    multiplierBonus: steps(spec.multiplierStep, casterLevel),
    cr: steps(spec.crStep, casterLevel),
    rigid: spec.rigidAt > 0 && Number(casterLevel) >= spec.rigidAt,
    hp: max,
    max,
    lockoutMinutes: spec.lockoutMinutes
  };
}

/**
 * The live spell armours on an actor, as Base DR entries for
 * `bracersBaseDR` — and their CR and rigidity, which last while the armour
 * has HP (MA4).
 *
 * @param {Array} effects the actor's ActiveEffects
 * @returns {{entries: object[], cr: number, rigid: boolean}}
 */
export function spellArmourEntries(effects = []) {
  const out = { entries: [], cr: 0, rigid: false };
  for (const effect of effects ?? []) {
    if (effect?.disabled) continue;
    const state = effect?.flags?.["trg-prime"]?.[SPELL_ARMOUR_FLAG];
    if (!state || typeof state !== "object") continue;
    const hp = Math.max(0, Math.trunc(Number(state.hp) || 0));
    if (hp <= 0) continue;
    out.entries.push({
      source: "effect",
      itemId: "",
      effectId: effect.id ?? effect._id ?? "",
      castId: effect?.flags?.["trg-prime"]?.castId ?? null,
      itemName: String(state.label ?? effect.name ?? "Spell Armour"),
      value: Math.max(0, Math.trunc(Number(state.baseDR) || 0)),
      armourHP: Math.max(hp, Math.trunc(Number(state.max) || 0)),
      stored: { hp, inertUntil: 0 },
      bsb: Math.max(0, Math.trunc(Number(state.bsb) || 0)),
      multiplierBonus: Math.max(0, Math.trunc(Number(state.multiplierBonus) || 0)),
      lockoutMinutes: Math.max(0, Math.trunc(Number(state.lockoutMinutes) || 0))
    });
    out.cr = Math.max(out.cr, Math.max(0, Math.trunc(Number(state.cr) || 0)));
    out.rigid = out.rigid || Boolean(state.rigid);
  }
  return out;
}
