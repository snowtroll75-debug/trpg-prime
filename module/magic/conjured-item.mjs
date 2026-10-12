/**
 * A SPELL THAT MAKES A REAL ITEM.
 *
 * NEW at 3.487.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BLESS WATER (PP 1, touch, Alteration / Good / Essence)
 *
 *   "Cost: religious ingredients worth 15 gp. You imbue a flask of water
 *    with positive energy, turning it into holy water."
 *
 * That is the whole spell, and the pack shipped it with `effects: []`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT COPIES THE REAL ITEM. IT DOES NOT DESCRIBE ONE.
 *
 * This is the difference from `healing-earth.mjs`, which is the nearest
 * existing shape. Healing Earth conjures a substance the compendium does
 * not contain, so it has no choice but to build the item data by hand.
 *
 * **Holy Water is a real entry in the alchemical pack** — a consumable
 * priced 25 gp, traits `Alchemical Bomb Consumable Essence Good Splash`,
 * dealing 1d8 good/essence and 1 splash, and usable as a divinity-spell
 * reagent for +2 Spellcraft. So the flask this spell makes must BE that
 * item, not a hand-written imitation of it.
 *
 * Fabricating it here would have produced a second Holy Water that is
 * subtly not the first: no Splash trait (so the splash mechanism built at
 * 3.482.0 would ignore it), no reagent clause, a different price. Two
 * objects with one name, differing in exactly the fields nobody checks —
 * which is the racial-PP hazard wearing a flask.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NAMED IN THE PACK ROW, RESOLVED AT CAST.
 *
 * The row declares the item by pack and name rather than by id. An id is
 * stabler, and it is also unreadable: `!items!nWwj2wrLscqo5qQP` tells
 * nobody what the spell makes, and a wrong one fails silently. A name
 * that stops resolving fails LOUDLY — the cast says so on its own card —
 * and `verify-conjured-item` holds every declared name against the real
 * pack, so a rename is a failing check rather than a dead spell.
 */

const text = (v) => String(v ?? "").trim();

/** Packs a spell may conjure from. Named, so a typo cannot reach a random pack. */
export const CONJURABLE_PACKS = Object.freeze(["alchemical", "gear", "consumables"]);

/**
 * A conjured-item row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normaliseConjuredItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "conjureItem") return null;

  const itemName = text(raw.itemName);
  if (!itemName) return null;

  const pack = text(raw.pack).toLowerCase();
  if (!CONJURABLE_PACKS.includes(pack)) return null;

  return {
    itemName,
    pack,
    // HOW MANY. Declared rather than assumed to be one, because "a flask"
    // and "three flasks" are the same mechanism and the difference
    // belongs in the data.
    quantity: Math.max(1, Math.trunc(Number(raw.quantity) || 1)),
    // THE MATERIAL COST IS PRINTED, NOT CHARGED. Bless Water's "religious
    // ingredients worth 15 gp" is a Cost line, and this system does not
    // deduct currency for spell components anywhere — the component gate
    // asks whether a pouch is carried and stops there. Charging here
    // would make one spell in the game uniquely expensive, so the figure
    // is carried to be SAID and the GM settles it, exactly as every other
    // component cost is settled.
    costGp: Math.max(0, Math.trunc(Number(raw.costGp) || 0))
  };
}

/**
 * The name a conjured stack should carry.
 *
 * The pack item's own name, unchanged. A conjured flask that reads
 * "Holy Water (conjured)" would sort apart from a bought one, stack
 * separately, and quietly tell every later reader that the two are
 * different things.
 */
export function conjuredItemName(spec) {
  return spec?.itemName ?? "";
}

/** What the card says when the flask appears. */
export function conjuredItemLine(spec, targetName, itemName) {
  const many = spec.quantity > 1 ? ` &times;${spec.quantity}` : "";
  const cost = spec.costGp > 0
    ? ` <em>(the ${spec.costGp} gp of ingredients are consumed &mdash; settled at the table)</em>`
    : "";
  return `<strong>${targetName}</strong> now carries <strong>${itemName}${many}</strong>${cost}.`;
}

/**
 * What the card says when the named item is not in the pack.
 *
 * SAID OUT LOUD. A spell that quietly makes nothing is the failure this
 * whole tier of work exists to remove, and a compendium rename is
 * exactly how it would happen.
 */
export function conjuredItemMissingLine(spec, spellName) {
  return `<em>${spellName} names "${spec.itemName}" in the ${spec.pack} compendium and it is not there `
    + `&mdash; nothing was created. This is a gap in the data, not a rule.</em>`;
}

/**
 * Who ends up holding a conjured item when nobody was named.
 *
 * GRAHAM'S RULING, 26 September 2026: "Yes go with your idea on Power
 * Crystal" — a conjuration with no target falls back to the CASTER.
 *
 * WHAT IT COST TO ASK. Driving 3.594.1 I cast Power Crystal at a caster
 * with nothing targeted: the card said "Power Crystal finds nobody to
 * affect", two PP were gone, and no crystal existed. Nothing was broken —
 * the row targets `targets`, the range is touch, and the spell had done
 * exactly what it was told — but a spell whose whole output is an object
 * you hold has no business making nothing because the object's eventual
 * owner was not clicked first. You can always hand the thing over
 * afterwards; you cannot get the points back.
 *
 * ANY RANGE REACHES YOURSELF, so this asks nothing about range. It is the
 * FALLBACK that is narrow: a row that named recipients keeps them, and a
 * DEGREE-GATED row with none is silent on purpose — its degree did not
 * come up, and handing the caster a flask because a save succeeded would
 * be a new bug of the shape this project keeps finding.
 *
 * @param {Array} recipients who the row resolved to
 * @param {Actor|null} caster
 * @param {object} [opts]
 * @param {boolean} [opts.gated] whether the row is degree-gated
 * @returns {Array} the recipients to use
 */
export function conjuredItemRecipients(recipients, caster, { gated = false } = {}) {
  const named = (recipients ?? []).filter(Boolean);
  if (named.length) return named;
  if (gated) return [];
  return caster ? [caster] : [];
}

/** What the card says when the caster kept it for want of a target. */
export function conjuredItemNobodyNamedLine(casterName) {
  return `<em>Nobody was targeted, so <strong>${casterName}</strong> is holding it &mdash; `
    + "target a creature when casting to hand it straight to somebody else.</em>";
}
