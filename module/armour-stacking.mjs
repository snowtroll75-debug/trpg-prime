/**
 * armour-stacking — which worn armour's DR counts (3.621.0).
 *
 * Appendix 1 (block 39's A2, Graham's R3): "Armour bonuses do not stack, and
 * you may only apply the highest bonus." Every equipped armour piece's DR
 * was summed, which is right for the fittings — bracers, greaves and helmets
 * are "applied directly to the base armour" — and wrong for a second suit:
 * a Chain Shirt and a Breastplate gave DR 7.
 *
 * So: the highest-DR body armour counts, and the fittings add to it. A body
 * armour is a piece that covers the torso; the fittings are the "Other"
 * pieces that cover an arm, a leg or the head.
 *
 * Pure, and given plain pieces, so the harness can run it.
 */

/** Whether an armour item is a suit of body armour rather than a fitting. */
export function isBodyArmour(item) {
  if (item?.type !== undefined && item.type !== "armour") return false;
  const system = item?.system ?? item ?? {};
  if (String(system.category ?? "").trim().toLowerCase() === "other") return false;
  return system.coversTorso !== false;
}

/**
 * The DR a set of worn pieces gives.
 *
 * @param {{dr:number, suit:boolean, name?:string}[]} pieces
 * @returns {{dr:number, suits:number, counted:string|null, ignored:string[]}}
 */
export function stackedArmourDR(pieces = []) {
  const suits = [];
  let fittings = 0;
  for (const piece of pieces ?? []) {
    const dr = Math.max(0, Number(piece?.dr) || 0);
    if (piece?.suit) suits.push({ name: piece?.name ?? "armour", dr });
    else fittings += dr;
  }
  let best = -1;
  suits.forEach((suit, index) => {
    if (best < 0 || suit.dr > suits[best].dr) best = index;
  });
  return {
    dr: (best >= 0 ? suits[best].dr : 0) + fittings,
    suits: suits.length,
    counted: best >= 0 ? suits[best].name : null,
    ignored: suits.filter((_, index) => index !== best).map((suit) => suit.name)
  };
}

/** The sheet's warning when more than one suit is worn, or "". */
export function suitsWarning(result) {
  if (!result || result.suits < 2) return "";
  return `${result.suits} suits of body armour are worn — only the best (${result.counted ?? "the highest"}) counts; `
    + `${result.ignored.join(", ")} add${result.ignored.length === 1 ? "s" : ""} nothing.`;
}
