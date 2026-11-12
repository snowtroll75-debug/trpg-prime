/**
 * REST RATES FROM AN EFFECT (3.687.0, H15; Eldritch Arts Block 8b).
 *
 * Pure; no Foundry. Eternal Invocation (PP 20): creatures sharing the
 * caster's aligned traits gain "Double natural HP recovery / Double PP
 * recovery"; those of an opposed aligned trait "Half natural HP recovery /
 * Half PP recovery".
 *
 * THE SHAPE. An ActiveEffect carries `flags.trg-prime.restRate = { hp, pp,
 * label }`: each a multiplier (2 doubles, 0.5 halves; 1 or absent changes
 * nothing). The rest multiplies its Natural Healing by every `hp` and its
 * PP recovered by every `pp`, as Quick Recovery's ×2 and Healing Trance's
 * multiplier already multiply — so a double and a half cancel. The result
 * is rounded down (m128: "round down unless stated").
 *
 * WHAT A RATE IS NOT. It moves neither maximum HP nor the PP locked by a
 * long spell, which the rest still sets aside; nor Soul Drain, Doomed or
 * fatigue, which a night's rest lowers by its own rules.
 */

/** The flag an effect carries its rate on. */
export const REST_RATE_FLAG = "restRate";

/** No rate this far from 1 is a printed one; a larger number is a mistake. */
const MIN_RATE = 0.1;
const MAX_RATE = 10;

/** One multiplier, or 1 when absent or malformed. */
function rate(value) {
  if (value === undefined || value === null || value === "") return 1;
  const n = Number(value);
  if (!Number.isFinite(n) || n < MIN_RATE || n > MAX_RATE) return 1;
  return n;
}

/** A `restRate` record, or null when it changes nothing. */
export function normaliseRestRate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const hp = rate(raw.hp);
  const pp = rate(raw.pp);
  if (hp === 1 && pp === 1) return null;
  return { hp, pp, label: String(raw.label ?? "").trim() || "Rest rate" };
}

/**
 * Every live rate on an actor, multiplied.
 *
 * @param {Array<{disabled?: boolean, flags?: object}>} effects the actor's effects
 * @returns {{hp: number, pp: number, labels: string[]}}
 */
export function restRatesOf(effects) {
  let hp = 1;
  let pp = 1;
  const labels = [];
  for (const effect of Array.isArray(effects) ? effects : Array.from(effects ?? [])) {
    if (!effect || effect.disabled || effect.isSuppressed) continue;
    const spec = normaliseRestRate(effect.flags?.["trg-prime"]?.[REST_RATE_FLAG]);
    if (!spec) continue;
    hp *= spec.hp;
    pp *= spec.pp;
    labels.push(spec.label);
  }
  return { hp, pp, labels };
}

/** A rest's totals at those rates, rounded down. */
export function applyRestRates(totals, rates) {
  const hpRate = Number.isFinite(Number(rates?.hp)) ? Number(rates.hp) : 1;
  const ppRate = Number.isFinite(Number(rates?.pp)) ? Number(rates.pp) : 1;
  return {
    hp: Math.max(0, Math.floor(Math.max(0, Number(totals?.hp) || 0) * hpRate)),
    pp: Math.max(0, Math.floor(Math.max(0, Number(totals?.pp) || 0) * ppRate))
  };
}

/** The card's line, or "" when no rate applied. */
export function restRateLine(rates) {
  if (!rates || (rates.hp === 1 && rates.pp === 1)) return "";
  const word = (r) => (r === 2 ? "doubled" : r === 0.5 ? "halved" : `×${Math.round(r * 100) / 100}`);
  const parts = [];
  if (rates.hp !== 1) parts.push(`Natural Healing ${word(rates.hp)}`);
  if (rates.pp !== 1) parts.push(`PP recovery ${word(rates.pp)}`);
  const by = (rates.labels ?? []).filter(Boolean);
  return `${parts.join(", ")}${by.length ? ` (${[...new Set(by)].join(", ")})` : ""}.`;
}
