/**
 * LENT METAMAGIC (3.685.0, H9). Pure; no Foundry.
 *
 * Eldritch Arts' Metamagic Resonance: "Choose one metamagic feat you possess
 * when you cast this spell … All willing allies within 30 feet may apply the
 * chosen feat to one spell they cast per round during the duration. Applying
 * the metamagic feat increases the PP cost of the targets spells as normal."
 * "+3 PP: targets only have to expend half the extra PP. +6 PP: targets do
 * not have to expend additional PP." Graham's Q163: "No requirements but the
 * caster's; the ally pays from its own pool; half rounds down (m128), minimum
 * 0. Core and Eldritch Arts metamagic both count."
 *
 * An effect on the bearer carries
 *
 *   flags["trg-prime"].lentMetamagic = { key, costFactor: 1 | 0.5 | 0, label, from }
 *
 * `key` is a core Metamagic feat's name ("empower spell", lower case) or a
 * module option's `registerMetamagic` key. The bearer is offered it in the
 * Warp? dialog as if it held the feat, once a round (in combat: one spell per
 * round; out of combat, every cast). What it pays is the option's PP times the
 * factor, rounded down — a payment only (G4's channel): the Casting DC, the
 * cap and the Save DC read the PP as cast, "as normal".
 */

import { coreOptionPP, takenPP } from "./module-metamagic.mjs";

const LENT_METAMAGIC_FLAG = "lentMetamagic";
/** Where an effect remembers the round its lent option was last used. */
export const LENT_USED_FLAG = "lentMetamagicUsed";

const text = (v) => String(v ?? "").trim();
const FACTORS = Object.freeze([1, 0.5, 0]);

/** One lent option, or null. */
function normaliseLentMetamagic(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = text(raw.key).toLowerCase();
  if (!key) return null;
  const f = Number(raw.costFactor ?? 1);
  return {
    key,
    costFactor: FACTORS.includes(f) ? f : 1,
    label: text(raw.label) || "Lent metamagic",
    from: text(raw.from)
  };
}

/**
 * Every lent option on a creature's effects, with whether it is spent this
 * round (`roundKey` "combatId:round"; "" out of combat, where it never is).
 */
export function lentMetamagicOf(effects = [], roundKey = "", systemId = "trg-prime") {
  const out = [];
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.[systemId]?.[LENT_METAMAGIC_FLAG];
    for (const row of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const spec = normaliseLentMetamagic(row);
      if (!spec) continue;
      const usedAt = text(effect.flags?.[systemId]?.[LENT_USED_FLAG]);
      out.push({ ...spec, effectId: String(effect.id ?? ""), used: Boolean(roundKey) && usedAt === roundKey });
    }
  }
  return out;
}

/** What the bearer pays for `pp` of a lent option: ×1, half rounded down, or 0. */
function lentCost(pp, factor = 1) {
  const n = Math.max(0, Math.trunc(Number(pp) || 0));
  if (factor === 0) return 0;
  if (factor === 0.5) return Math.max(0, Math.floor(n / 2));
  return n;
}

/**
 * The PP a cast's lent options take off what is paid, and which lending
 * effects it spent. `coreOptions` carry `lent` when lent; module `offers` do
 * too. Half is taken of each option's own total, as ticked.
 *
 * @returns {{pp: number, label: string, effectIds: string[]}}
 */
export function lentMetamagicDiscount({ coreOptions = [], form = {}, offers = [], taken = [] } = {}) {
  let pp = 0;
  const labels = [];
  const effectIds = new Set();
  for (const o of coreOptions ?? []) {
    if (!o?.lent) continue;
    const full = coreOptionPP(o, form);
    if (!full) continue;
    pp += full - lentCost(full, o.lent.costFactor);
    labels.push(o.lent.label);
    if (o.lent.effectId) effectIds.add(o.lent.effectId);
  }
  for (const t of taken ?? []) {
    const offer = (offers ?? []).find((x) => x.key === t.key && x.lent);
    if (!offer) continue;
    const full = takenPP(offer, t);
    pp += full - lentCost(full, offer.lent.costFactor);
    labels.push(offer.lent.label);
    if (offer.lent.effectId) effectIds.add(offer.lent.effectId);
  }
  return { pp, label: [...new Set(labels)].join(", "), effectIds: [...effectIds] };
}
