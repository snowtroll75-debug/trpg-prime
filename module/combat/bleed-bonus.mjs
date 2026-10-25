/**
 * BLEED THAT YOU INFLICT, RAISED BY A DECLARATION (3.670.0).
 *
 * Inner Tempest's Tiger Stance: "Any bleed damage that you inflict whilst in
 * this stance is increased by 1." The system's other raisers (Savage
 * Strikes, Skewering Strikes, Serrated) are read by name; this is the
 * declared form, on any item or applied effect of the attacker:
 *
 *   flags.trg-prime.bleedBonus = { value: 1, label: "Tiger Stance" }
 *
 * Applied where an attacker's bleed is built: a critical injury's tags and
 * the conditions a Strike lays after it (declared-after-strikes). It raises
 * bleed that is inflicted; it never creates bleed where none was.
 *
 * Pure and Foundry-free.
 */
const SYSTEM_ID = "trg-prime";

/**
 * The bonus these carriers declare, and who declares it.
 *
 * @param {Iterable<object>} carriers the attacker's items and applied effects
 * @returns {{value: number, labels: string[]}}
 */
export function declaredBleedBonus(carriers = []) {
  let value = 0;
  const labels = [];
  for (const carrier of carriers ?? []) {
    if (!carrier || carrier.disabled) continue;
    const raw = carrier.flags?.[SYSTEM_ID]?.bleedBonus;
    for (const row of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const n = Math.trunc(Number(row?.value));
      if (!Number.isFinite(n) || n <= 0) continue;
      value += n;
      labels.push(String(row?.label ?? carrier.name ?? "Bleed bonus"));
    }
  }
  return { value, labels };
}

/**
 * The tags with every valued bleeding tag raised by the bonus; the same list
 * when there is no bleeding or no bonus.
 *
 * @param {Array<{key: string, value: number|null}>} tags
 * @param {number} bonus
 * @returns {Array}
 */
export function withBleedBonus(tags = [], bonus = 0) {
  const list = Array.isArray(tags) ? tags : [];
  const n = Math.trunc(Number(bonus));
  if (!Number.isFinite(n) || n <= 0) return list;
  if (!list.some((t) => t?.key === "bleeding" && t.value !== null && t.value !== undefined)) return list;
  return list.map((t) => (t?.key === "bleeding" && t.value !== null && t.value !== undefined ? { ...t, value: Number(t.value) + n } : t));
}
