/**
 * THREE SPELLS THAT MOVE LIFE OR POWER FROM ONE PLACE TO ANOTHER.
 *
 * NEW at 3.609.0, for block 33's R8 (Graham, 1 October 2026: "As
 * recommended"). Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * VAMPIRIC TOUCH (PP 8, page 339) — a `siphon` row.
 *   "You gain temporary HP equal to half the damage the target takes. You
 *    lose any remaining temporary HP after 1 minute."
 * Its own note said the `tempHP` kind "cannot yet read the damage actually
 * dealt". The basic-save path is the one place that knows, so it is the one
 * that counts: half of what each creature actually took, after its
 * defences, summed for the cast. Temporary hit points do not stack in this
 * system — the larger pool stands — so the grant is the larger of the old
 * pool and this one, and when the minute ends the pool is cleared only if
 * it is still no larger than what this spell gave (a bigger pool from
 * somewhere else since is not this spell's to take away).
 *
 * TRADE ESSENCE (PP 2, page 336) — an `essenceTrade` row.
 *   "One target transfers up to 2 PP per caster level (yours) to the other.
 *    … the donor cannot reduce their PP below 0, and the recipient cannot
 *    exceed their normal maximum PP."
 *      +2 PP: increase the transferable amount by +1 PP per caster level.
 * The caster names the donor and the amount; the amount is then clamped by
 * all three limits the page prints.
 *
 * VIGOUR (PP 2, page 340) — a `turnHeal` row.
 *   "The target is healed of 2 HP at the end of each of their turns."
 *      +2 PP: the healing increases by 1 HP per round.
 * At the END of the target's own turn, which is why it is not fast healing
 * (the start of the turn): Graham's R8 chose its own clock.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/* ---------------------------------------------------------------- *
 * Siphon.
 * ---------------------------------------------------------------- */

/** A `siphon` row, or null. */
export function normaliseSiphon(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== "siphon") return null;
  const share = Number(raw.share);
  if (!Number.isFinite(share) || share <= 0 || share > 1) return null;
  return { share, duration: text(raw.duration) || "1 minute", label: text(raw.label) || "" };
}

/** What one creature's damage gives back. */
export function siphonAmount(taken, share) {
  return Math.max(0, Math.floor(Math.max(0, int(taken)) * (Number(share) || 0)));
}

/** The temporary hit points after the grant: the larger pool stands. */
export function siphonedPool(currentTemp, granted) {
  return Math.max(Math.max(0, int(currentTemp)), Math.max(0, int(granted)));
}

/** At the minute's end: does the pool still belong to this spell? */
export function siphonExpires(currentTemp, granted) {
  const now = Math.max(0, int(currentTemp));
  return now > 0 && now <= Math.max(0, int(granted));
}

/* ---------------------------------------------------------------- *
 * Trade Essence.
 * ---------------------------------------------------------------- */

/** An `essenceTrade` row, or null. */
export function normaliseEssenceTrade(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== "essenceTrade") return null;
  const perLevel = int(raw.perLevel ?? 2);
  if (perLevel <= 0) return null;
  return { perLevel, label: text(raw.label) || "Trade Essence" };
}

/** The most the cast may move: PP per caster level, warps included. */
export function essenceTradeCap(spec, casterLevel, warpPerLevel = 0) {
  return Math.max(0, (int(spec?.perLevel) + Math.max(0, int(warpPerLevel))) * Math.max(0, int(casterLevel)));
}

/**
 * What actually moves: the asked amount, cut by the cap, by what the donor
 * has (not below 0) and by the room the recipient has (not past maximum).
 * @returns {{amount: number, limitedBy: string|null}}
 */
export function essenceTradeAmount(asked, { cap = 0, donorPP = 0, recipientPP = 0, recipientMax = 0 } = {}) {
  const want = Math.max(0, int(asked));
  const limits = [
    ["the caster's limit", Math.max(0, int(cap))],
    ["what the donor has", Math.max(0, int(donorPP))],
    ["the recipient's maximum", Math.max(0, int(recipientMax) - int(recipientPP))]
  ];
  let amount = want;
  let limitedBy = null;
  for (const [why, ceiling] of limits) {
    if (ceiling < amount) { amount = ceiling; limitedBy = why; }
  }
  return { amount, limitedBy };
}

/* ---------------------------------------------------------------- *
 * Vigour.
 * ---------------------------------------------------------------- */

/** The flag a `turnHeal` effect carries. */
export const TURN_HEAL_FLAG = "turnHeal";

/** A `turnHeal` row, or null. */
export function normaliseTurnHeal(raw, warpBonus = 0) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== "turnHeal") return null;
  const amount = int(raw.amount) + Math.max(0, int(warpBonus));
  if (amount <= 0) return null;
  return { amount, label: text(raw.label) || "Healing" };
}

/** What one end of turn heals, never past maximum. */
export function turnHealed(spec, hp, max) {
  return Math.max(0, Math.min(int(spec?.amount), Math.max(0, int(max) - int(hp))));
}
