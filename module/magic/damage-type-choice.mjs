/**
 * A DAMAGE TYPE CHOSEN WHEN THE SPELL IS CAST.
 *
 * WIDENED at 3.603.0 from `elemental-choice.mjs` (3.473.0), on Graham's R9
 * of block 31. That file answered one question — "which of these four
 * elements is this cast?" — for Elemental Shield and Nexus Of Elemental
 * Energy. This answers the same question for any damage type the system
 * has, because the Grimoire asks it more widely than four:
 *
 *   SHADOW BLAST     "Select acid, bludgeoning, cold, electricity, fire,
 *                     force, piercing, slashing, or sonic"     — NINE
 *   ENERGY BOLT      "select an element type from the following: acid,
 *   SEARING BURST     cold, electricity or fire"               — four
 *   ELEMENTAL SHIELD "either fire or cold"                     — two
 *   NEXUS            "acid, cold, electricity, or fire"        — four
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE MECHANISM, BECAUSE IT IS ONE SENTENCE.
 *
 * The alternative was a second chooser for the spells whose list is wider
 * than four, and this project has regretted that shape every time: two
 * mechanisms answering one printed sentence drift, and the second one is
 * always the one nobody remembers to update. So the whitelist is now the
 * system's own damage vocabulary (`DAMAGE_TYPES` in config.mjs) and the
 * four-element facts below stay as facts ABOUT ELEMENTS — they answer for
 * an element and answer `null` for anything else, which is what lets one
 * picker serve both kinds of spell.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE CHOICE IS WORTH, WHICH IS MORE THAN A WORD ON A CARD.
 *
 * Every entry in `DAMAGE_TYPES` carries a `dr` rule: physical types are
 * reduced by Damage Reduction IN FULL, the five energy types by HALF, and
 * force, essence and the rest NOT AT ALL. So a Shadow Blast is a genuinely
 * different spell depending on the answer, and the card says which rule
 * the chosen type brought with it — that is the reason the question is
 * worth asking rather than a flavour note.
 *
 * It is also why the frozen types this replaces mattered. Shadow Blast was
 * authored as FORCE, the one answer on its own list that ignores DR
 * altogether: the spell has been quietly stronger than the book allows
 * against every armoured target since it was authored.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A CHOICE THAT WAS NOT OFFERED IS STILL NOT HONOURED.
 *
 * Inherited from the file this widens, and it matters more now rather than
 * less. The picker can only show what the row declares, but a stale flag
 * or a hand-edited cast could carry anything — and with the whitelist
 * widened to every damage type, the ROW'S OWN OFFER is the only thing
 * standing between a four-element Nexus and a save table that has no
 * answer for "slashing". `chosenType` checks membership of the offer, and
 * Nexus additionally refuses a type it cannot find a save for.
 */

import { DAMAGE_TYPES } from "../config.mjs";

/**
 * The four the book calls elements.
 *
 * KEPT NARROW ON PURPOSE. These are the types that have an opposite and a
 * save in the printed rules; widening this list would silently give Nexus
 * a save table it does not have and Elemental Shield an opposite the book
 * never names.
 */
export const ELEMENTS = Object.freeze(["acid", "cold", "electricity", "fire"]);

/**
 * Which element opposes which.
 *
 * ONLY FIRE AND COLD HAVE AN OPPOSITE, and that is the book's own
 * parenthesis — "fire grants cold resistance and cold grants fire". Acid
 * and electricity are named by Nexus and have no printed opposite, so
 * asking for one returns nothing rather than inventing a pairing.
 */
const OPPOSITES = Object.freeze({ fire: "cold", cold: "fire" });

/**
 * Which save each element calls for.
 *
 * NEXUS'S OWN SENTENCE — "Fortitude for Acid and Cold, Reflex for
 * Electricity and Fire". Kept here rather than on the spell row because it
 * is a fact about the elements, and a second spell keying off the same
 * four would otherwise have to repeat it and could disagree.
 */
const ELEMENT_SAVES = Object.freeze({
  acid: "Fortitude",
  cold: "Fortitude",
  electricity: "Reflex",
  fire: "Reflex"
});

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/** Is this a damage type the system knows? */
export function isDamageType(type) {
  return Object.prototype.hasOwnProperty.call(DAMAGE_TYPES, lower(type));
}

/** Is this one of the four the book calls elements? */
export function isElement(type) {
  return ELEMENTS.includes(lower(type));
}

/**
 * The damage types a row offers, or an empty list when it offers none.
 *
 * READS BOTH FIELD NAMES. `elements` is what the two spells built in
 * 3.473.0 already carry in the pack, and rewriting their rows to say
 * `damageTypes` would be a migration with no gain — the field name is not
 * the rule. A row carrying both is not a thing the authoring tools make;
 * `damageTypes` wins so that a widened row can be added beside an old one
 * without the old one silently overriding it.
 */
export function offeredTypes(raw) {
  const declared = Array.isArray(raw?.damageTypes)
    ? raw.damageTypes
    : Array.isArray(raw?.elements) ? raw.elements : [];
  const seen = [];
  for (const t of declared) {
    const k = lower(t);
    if (isDamageType(k) && !seen.includes(k)) seen.push(k);
  }
  return seen;
}

/**
 * The damage type a cast actually uses.
 *
 * @param {object|null} raw the effect row
 * @param {string} chosen what the caster picked
 * @returns {string|null}
 */
export function chosenType(raw, chosen) {
  const offered = offeredTypes(raw);
  const pick = lower(chosen);
  if (offered.includes(pick)) return pick;
  // ONE OFFER NEEDS NO CHOICE. A row naming a single type is not a choice
  // at all, and refusing it for want of a pick would break a spell nobody
  // was asked about.
  return offered.length === 1 ? offered[0] : null;
}

/** What this element grants resistance to, or null. */
export function opposingElement(element) {
  return OPPOSITES[lower(element)] ?? null;
}

/** Which save this element calls for, or null for a type with none. */
export function elementSave(element) {
  return ELEMENT_SAVES[lower(element)] ?? null;
}

/** The system's own label for a type, for the card. */
export function damageTypeLabel(type) {
  return DAMAGE_TYPES[lower(type)]?.label ?? text(type);
}

/**
 * What Damage Reduction does to this type, in the card's words.
 *
 * THE REASON THE CHOICE MATTERS, so the card says it rather than leaving a
 * player to look it up mid-turn. Straight out of `DAMAGE_TYPES`, so it
 * cannot drift from what `damage.mjs` actually does.
 */
export function damageReductionNote(type) {
  switch (DAMAGE_TYPES[lower(type)]?.dr) {
    case "full": return "Damage Reduction applies in full";
    case "half": return "armour may use only half its Damage Reduction";
    case "none": return "Damage Reduction does not apply";
    default: return "";
  }
}

/** Do every one of these types count as an element? */
export function allAreElements(types) {
  const list = Array.isArray(types) ? types : [];
  return list.length > 0 && list.every((t) => isElement(t));
}

/** What the card says about the type a cast took. */
export function typeChosenLine(label, type) {
  const dr = damageReductionNote(type);
  return `<strong>${label}</strong> — <strong>${damageTypeLabel(type)}</strong> chosen`
    + `${dr ? ` (${dr})` : ""}.`;
}

/** What the card says when no type could be settled. */
export function typeRefusal(label) {
  return `<em>${label} names no damage type to use — nothing happens.</em>`;
}
