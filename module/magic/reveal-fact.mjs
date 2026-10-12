/**
 * ONE ACCURATE FACT (3.630.0). Pillars of Faith, Analytical Glance: "Choose
 * one category … The GM provides one accurate fact within the chosen
 * category." Pure; no Foundry.
 *
 * Four of the five categories are facts the sheet already holds, so they
 * are read rather than asked:
 *
 *   Defences   "which of the target's Fortitude, Reflex or Will saves is
 *              lowest" — the save totals.
 *   Resilience "one significant Resistance, Weakness or Immunity" — an
 *              immunity first, then a weakness, then a resistance: the order
 *              in which knowing one changes what a caster does next.
 *   Mobility   "its principal movement types and Speeds" — every speed above 0.
 *   Senses     "its most significant unusual sense" — the first sense that
 *              is not ordinary sight.
 *
 * Capability — "one significant offensive, defensive or reactive ability
 * not already known to you" — needs to know what the caster already knows,
 * which no sheet records. It is the GM's, and the whisper says so.
 */
const lower = (v) => String(v ?? "").trim().toLowerCase();

export const FACT_CATEGORIES = Object.freeze({
  defences: "Defences",
  resilience: "Resilience",
  mobility: "Mobility",
  senses: "Senses",
  capability: "Capability"
});

const SAVE_LABEL = { fortitude: "Fortitude", reflex: "Reflex", will: "Will" };
const ORDINARY_SENSES = new Set(["sight", "vision", "normal vision", "hearing", "smell", "touch", "taste"]);

/**
 * @param {string} category
 * @param {object} facts
 * @param {Record<string, number>} facts.saves totals by save
 * @param {{immunities?: Iterable<string>, weaknesses?: Iterable<string>, resistances?: Iterable<string>}} facts.defences
 * @param {Record<string, number>} facts.speeds feet by movement type
 * @param {Array<{name: string, rangeFeet?: number|null}>} facts.senses
 * @returns {{category: string, label: string, text: string, gm: boolean}}
 */
export function revealFact(category, facts = {}) {
  const key = lower(category);
  const label = FACT_CATEGORIES[key] ?? category;
  if (key === "defences") {
    const rows = Object.entries(facts.saves ?? {}).filter(([k]) => SAVE_LABEL[k]).map(([k, v]) => [k, Number(v) || 0]);
    if (!rows.length) return { category: key, label, text: "its saves are not on its sheet — the GM answers.", gm: true };
    const low = Math.min(...rows.map(([, v]) => v));
    const lowest = rows.filter(([, v]) => v === low).map(([k]) => SAVE_LABEL[k]);
    // READ AS A SENTENCE (3.630.1, F8): "Fortitude and Reflex and Will (tied)".
    const named = lowest.length > 1 ? `${lowest.slice(0, -1).join(", ")} and ${lowest.at(-1)}` : lowest[0];
    return { category: key, label, text: lowest.length === 3
      ? "its three saves are <strong>equal</strong> — none is weaker than the others."
      : `its lowest save is <strong>${named}</strong>${lowest.length > 1 ? " (tied)" : ""}.`, gm: false };
  }
  if (key === "resilience") {
    const d = facts.defences ?? {};
    const first = (list) => Array.from(list ?? []).map((x) => String(x ?? "").trim()).find(Boolean);
    const imm = first(d.immunities);
    if (imm) return { category: key, label, text: `it is <strong>immune to ${imm}</strong>.`, gm: false };
    const weak = first(d.weaknesses);
    if (weak) return { category: key, label, text: `it has <strong>weakness to ${weak}</strong>.`, gm: false };
    const res = first(d.resistances);
    if (res) return { category: key, label, text: `it has <strong>resistance to ${res}</strong>.`, gm: false };
    return { category: key, label, text: "it has no Resistance, Weakness or Immunity on its sheet.", gm: false };
  }
  if (key === "mobility") {
    const moving = Object.entries(facts.speeds ?? {}).filter(([, v]) => Number(v) > 0);
    if (!moving.length) return { category: key, label, text: "it has no Speed on its sheet.", gm: false };
    return { category: key, label, text: `it moves by ${moving.map(([k, v]) => `<strong>${k} ${v} feet</strong>`).join(", ")}.`, gm: false };
  }
  if (key === "senses") {
    const unusual = (facts.senses ?? []).find((s) => s?.name && !ORDINARY_SENSES.has(lower(s.name)));
    if (!unusual) return { category: key, label, text: "it has no unusual sense on its sheet.", gm: false };
    const range = unusual.rangeFeet === null || unusual.rangeFeet === undefined ? "" : ` (${unusual.rangeFeet} ft.)`;
    return { category: key, label, text: `its most significant unusual sense is <strong>${unusual.name}</strong>${range}.`, gm: false };
  }
  return { category: key, label, text: "one significant offensive, defensive or reactive ability you do not already know — the GM answers.", gm: true };
}
