import { BONUS_TYPES, applyStacking } from "../dice/resolution.mjs";

/**
 * The bonus collection layer.
 *
 * Foundry's Active Effects can only add, multiply, override or clamp a number.
 * They cannot express "only the highest bonus of this type applies", which is
 * the core of Appendix 1. So typed bonuses are not written into the actor at
 * all: they are collected into pools during the Active Effect phase and
 * resolved together with the sheet's manually entered values in derived data.
 *
 * A change with CUSTOM mode and a key of `system.skills.religion.item`
 * contributes a +N item bonus to the Religion skill. The last path segment
 * names the bonus type; everything before it names the target.
 */

/**
 * Aliases from the slot names already used by the data model to the Appendix 1
 * bonus type names. A null value means the slot is not a typed bonus at all and
 * is always added (character level, ability score, skill ranks, and so on).
 */
export const SLOT_TYPE_ALIASES = Object.freeze({
  racial: "race",
  race: "race",
  class: "class",
  item: "item",
  status: "status",
  circumstance: "circumstance",
  dodge: "dodge",
  luck: "luck",
  armour: "armour",
  naturalArmour: "naturalArmour",
  natural: "naturalArmour",
  resistance: "resistance",
  shield: "shield",
  // `magic` is not one of the eleven Appendix 1 types. It is treated as untyped
  // (fully cumulative) until the rules say otherwise.
  magic: "untyped",
  other: "untyped",
  untyped: "untyped"
});

/** Slots that are never typed bonuses and are always summed. */
export const ADDITIVE_SLOTS = Object.freeze([
  "base",
  "ability",
  "ranks",
  "bsb",
  "level"
]);

/**
 * Slot maps for each derived target. `null` marks an additive slot.
 */
export const TARGET_SLOTS = Object.freeze({
  attribute: {
    base: null,
    racial: "race",
    class: "class",
    item: "item",
    magic: "untyped",
    status: "status",
    other: "untyped"
  },
  /**
   * MOVEMENT SPEEDS, pooled at 3.412.0 on Graham's ruling.
   *
   * Until then each speed was a BARE NUMBER, and every typed bonus aimed
   * at one silently vanished: `applyBonusEffect` and the Universal
   * Modifier both write to `<path>.<bonusType>`, so `movement.land.status`
   * was a property set on the number 30. Live proof, one cast of Physical
   * Surge: Athletics 0 → 2, land 20 → 20.
   *
   * TWO SHIPPED FEATURES WERE AFFECTED, not one. The Universal Modifier
   * registers all five speeds as bonus targets, so its typed bonuses to
   * movement had never worked either.
   *
   * `base` IS THE STORED FIGURE the sheet edits; armour, encumbrance and
   * grid rounding are applied to the resolved total afterwards, because
   * they are not typed bonuses and must not pool with them.
   *
   * THERE WERE TWO OF THESE UNTIL 3.595.0 — this entry and an identical one
   * above it, comment and all, in the same object literal. The later won
   * silently, as a duplicate key always does, and because both were the
   * same the sheet never showed it. Found while reading this file for the
   * Shape family's speeds; removed with a check beside it, because the next
   * duplicate may not be a copy.
   */
  movement: {
    base: null,
    item: "item",
    status: "status",
    circumstance: "circumstance",
    other: "untyped"
  },
  skill: {
    ranks: null,
    class: "class",
    racial: "race",
    item: "item",
    status: "status",
    other: "untyped"
  },
  specialistSkill: {
    class: "class",
    racial: "race",
    item: "item",
    status: "status",
    other: "untyped"
  },
  attack: {
    base: null,
    ability: null,
    class: "class",
    item: "item",
    status: "status",
    circumstance: "circumstance",
    other: "untyped"
  },
  defence: {
    base: null,
    ability: null,
    class: "class",
    item: "item",
    status: "status",
    circumstance: "circumstance",
    other: "untyped"
  },
  initiative: {
    ability: null,
    class: "class",
    item: "item",
    status: "status",
    other: "untyped"
  },
  save: {
    ability: null,
    // Creature Type (Creature Codex): the first source that has ever
    // granted a flat racial bonus to a saving throw in this system — no
    // race or heritage has, so this slot sat unused since the attribute
    // schema's own `racial` was added. Same alias as attribute.racial
    // ("race", fully cumulative — Appendix 1's race bonus type stacks,
    // never highest-wins), so it composes correctly if a heritage or
    // feat ever adds one too.
    racial: "race",
    class: "class",
    item: "item",
    status: "status",
    other: "untyped"
  },
  spellcraft: {
    ability: null,
    racial: "race",
    class: "class",
    item: "item",
    status: "status",
    other: "untyped"
  },
  // Natural Armour (in preparation for later race/feat/spell content):
  // deliberately two separate target slots, not one — the Flat and
  // Base forms are combined manually via naturalArmourDR (which
  // applies the "highest of the two, not both" rule directly) rather
  // than through a single shared pool, since Base needs its own BDB
  // scaling applied before that comparison can happen at all. No
  // "other/untyped" slot here on purpose — Natural Armour is always
  // specifically the naturalArmour bonus type, so an always-additive
  // pathway would undermine the "highest wins" rule that's the whole
  // point of it.
  naturalArmourFlat: {
    natural: "naturalArmour"
  },
  naturalArmourBase: {
    natural: "naturalArmour"
  },
  // Bonus DR (Graham's ruling, 3.170.1): feats like Dracoris and Iron Hide
  // grant DR that ALWAYS ADDS on top of armour and natural armour rather
  // than competing highest-wins. Pool-only — no sheet slots; typed entries
  // still stack by their own Appendix 1 rules within the pool.
  dr: {}
});

/**
 * Per-target stacking overrides. There are none, and there should not be.
 *
 * WHAT THIS COMMENT USED TO SAY, corrected by the pages 61-70 audit on
 * 16 September 2026: "The rulebook contradicts itself on race bonuses.
 * Appendix 1 says racial bonuses stack when gained from different
 * sources; Chapter 4 says multiple race bonuses to the same *skill* do
 * not stack and are wasted", and it went on to give the exact override
 * that would adopt that reading for skills.
 *
 * THERE IS NO SUCH CHAPTER 4 SENTENCE. Every stacking statement in the
 * book was searched for that audit. Chapter 4 (page 62) says the exact
 * opposite, word for word with Appendix 1: "Racial bonuses stack if
 * gained from different sources."
 *
 * A real contradiction did exist, and it was narrower: page 62 gave the
 * per-type rules and then closed with a blanket line — "if you gain
 * multiple bonuses of the same type, only the highest bonus applies" —
 * which is true of eight of the eleven types and false of Class, Race
 * and Dodge. Appendix 1 and the per-type lines agreed against it, which
 * is why this table follows them. GRAHAM REMOVED THE BLANKET LINE from
 * the rulebook on 16 September 2026, so nothing contradicts anything now.
 *
 * The hook stays because a house rule may one day want it. The recipe for
 * flipping race bonuses does not, and is deliberately not repeated here:
 * it cited a rule that was never printed, and following it would have
 * broken a correct one.
 */
export const STACKING_OVERRIDES = Object.freeze({});

/**
 * Parse an Active Effect change key into a bonus target and type.
 * @param {string} key e.g. "system.skills.religion.item"
 * @returns {{target: string, type: string}|null}
 */
export function parseBonusKey(key) {
  const path = String(key ?? "").trim();
  if (!path.includes(".")) return null;

  const segments = path.split(".");
  const last = segments.pop();
  const type = SLOT_TYPE_ALIASES[last];

  if (!type || !BONUS_TYPES[type]) return null;
  if (!segments.length) return null;

  return { target: segments.join("."), type };
}

/**
 * Resolve a target's manual slot values together with any pooled effect
 * bonuses, applying the Appendix 1 stacking rules.
 *
 * @param {object} options
 * @param {object} options.slots The stored slot values for the target.
 * @param {object} options.slotTypes A TARGET_SLOTS entry.
 * @param {object[]} [options.pool] Entries contributed by Active Effects.
 * @param {object} [options.stacking] Per-type stacking overrides.
 * @param {number} [options.extra] Additional flat value to add to the total.
 * @returns {{entries: object[], additive: number, typedTotal: number,
 *   total: number, byType: object}}
 */
export function resolveBonuses({
  slots = {},
  slotTypes = {},
  pool = [],
  stacking = {},
  extra = 0
} = {}) {
  const entries = [];
  let additive = Number(extra) || 0;

  for (const [slot, type] of Object.entries(slotTypes)) {
    const value = Number(slots?.[slot] ?? 0);
    if (!Number.isFinite(value)) continue;

    if (type === null) {
      additive += value;
      continue;
    }

    // A zero slot contributes nothing and would only clutter the breakdown.
    if (value === 0) continue;

    entries.push({
      label: slotLabel(slot),
      value,
      type,
      source: "sheet"
    });
  }

  for (const entry of pool) {
    const value = Number(entry?.value ?? 0);
    if (!Number.isFinite(value) || value === 0) continue;

    entries.push({
      label: entry.label ?? "Effect",
      value,
      type: BONUS_TYPES[entry.type] ? entry.type : "untyped",
      source: entry.source ?? "effect"
    });
  }

  const stacked = applyStacking(entries, { stacking });

  const byType = {};
  for (const entry of stacked.modifiers) {
    if (!entry.applied) continue;
    byType[entry.type] = (byType[entry.type] ?? 0) + entry.value;
  }

  return {
    entries: stacked.modifiers,
    additive,
    typedTotal: stacked.total,
    total: additive + stacked.total,
    byType
  };
}

const SLOT_LABELS = {
  racial: "Racial",
  class: "Class",
  item: "Item",
  status: "Status",
  circumstance: "Circumstance",
  magic: "Magic",
  other: "Other"
};

function slotLabel(slot) {
  return SLOT_LABELS[slot] ?? slot.charAt(0).toUpperCase() + slot.slice(1);
}

/**
 * Render a resolved breakdown as a plain-text tooltip.
 * @param {object} resolved The result of resolveBonuses.
 * @param {string} [additiveLabel]
 * @returns {string}
 */
export function breakdownTooltip(resolved, additiveLabel = "Base") {
  const parts = [`${additiveLabel} ${signed(resolved.additive)}`];

  for (const entry of resolved.entries) {
    const text = `${entry.label} ${signed(entry.value)} (${entry.type})`;
    parts.push(entry.applied ? text : `${text} — suppressed`);
  }

  parts.push(`Total ${signed(resolved.total)}`);
  return parts.join("\n");
}

function signed(value) {
  return value >= 0 ? `+${value}` : String(value);
}
