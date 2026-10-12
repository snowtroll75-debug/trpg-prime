/**
 * A WEAPON THAT IGNORES PART OF WHAT DEFENDS AGAINST IT.
 *
 * NEW at 3.585.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT ABJURERS STRIKE ASKS FOR (page 248):
 *
 *   "For the duration of the spell the weapon treats all targets as
 *    unarmoured and ignores all magical bonuses to DB."
 *
 * An 18 PP spell whose whole effect is that sentence, and the pack
 * carried `effects: []` — so it was a name, a cost and a paragraph.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SENTENCE IS TWO DIFFERENT MECHANISMS, AND I GOT THAT WRONG TWICE
 * BEFORE MEASURING. Both drafts are recorded because both are the shape
 * this project keeps finding.
 *
 * DRAFT ONE authored `ignoresArmour: true, ignoresMagicalDB: true` onto
 * a `strikeRider` row. `normaliseStrikeRider` requires `dice` and a
 * `damageType`, so the row would have returned null: two invented key
 * names on a kind that could never normalise, and a card that said the
 * spell was cast while nothing happened. Caught by reading the
 * normaliser instead of trusting the kind's name.
 *
 * DRAFT TWO decided both halves were the `item` slot of
 * `system.combat.defence`, reasoning that armour is an item bonus.
 * DRIVEN AGAINST THE LIVE WORLD on 22 September 2026, and it is not:
 *
 *   Darric, wearing Full Leather ....... defence.item = 0
 *   every other actor in the world ..... defence.item = 0
 *   Full Leather's own contribution .... system.dr = 1
 *
 * ARMOUR IN THIS SYSTEM IS DAMAGE REDUCTION, NOT A DEFENCE BONUS. It
 * never touches DB at all — Darric's 17 is Base and Dexterity 13, Class
 * 3, Creature level 1, and his armour is nowhere in it. So "treats all
 * targets as unarmoured" is not a DB subtraction of any kind, and draft
 * two would have subtracted zero from everybody while looking correct
 * in every test that did not involve a real character.
 *
 * No source pattern could have caught either draft. A live actor did,
 * in one read — which is the whole reason this project drives before it
 * harnesses.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SO THE SENTENCE SPLITS:
 *
 *   "treats all targets as unarmoured"   → `unarmoured`, which zeroes
 *      the target's armour DR exactly as the PENETRATING weapon trait
 *      does. That trait's own words are "treats all armour as none",
 *      and Graham's ruling on it covers BOTH pools — manufactured and
 *      natural — since the rule speaks of Armour DR generally. This
 *      follows that precedent rather than inventing a second reading.
 *
 *   "ignores all magical bonuses to DB"  → `slots`, the DB components
 *      to drop. A magical bonus to DB lands in the `item` slot, which
 *      is why that slot is what Abjurers Strike names.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GENERAL, NOT ABJURERS-STRIKE-SHAPED. The spell is the first thing to
 * need this and will not be the last — "ignores the target's shield",
 * "ignores class bonuses to DB" are the same shape with a different slot
 * — so the rule names slots and the spell names which.
 */

/** The flag an effect carries to pierce defences. */
export const DEFENCE_PIERCE_FLAG = "defencePierce";

/**
 * The defence components a spell may tell a weapon to ignore.
 *
 * `base` IS NOT ON THIS LIST, deliberately. Every creature's DB starts
 * at 10 and a spell that removed it would not be piercing a defence but
 * deleting the target's ability to be missed. Nothing in the book asks
 * for that, and an authoring slip that asked for it by accident should
 * be refused rather than obeyed.
 */
const PIERCEABLE_SLOTS = Object.freeze([
  "ability", "class", "item", "status", "circumstance", "other"
]);

const text = (v) => String(v ?? "").trim();

/**
 * A defence-pierce row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {{label: string, slots: string[], weaponIds: string[]}|null}
 */
export function normaliseDefencePierce(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = text(raw.kind).toLowerCase();
  // Checked only when present, so this normalises both the authored row
  // and the stored flag — the same courtesy `normaliseWeaponDamageBonus`
  // extends, and for the same reason.
  if (kind && kind !== "defencepierce") return null;

  const slots = (Array.isArray(raw.slots) ? raw.slots : [])
    .map((s) => text(s).toLowerCase())
    .filter((s) => PIERCEABLE_SLOTS.includes(s));
  const unarmoured = Boolean(raw.unarmoured);
  // A ROW THAT PIERCES NOTHING IS A ROW THAT SHOULD NOT EXIST. Returning
  // an empty spec instead would put a live effect on the sheet and a
  // line on the card for a spell doing precisely nothing.
  if (!slots.length && !unarmoured) return null;

  return {
    label: text(raw.label) || "Defence pierce",
    slots: Array.from(new Set(slots)),
    unarmoured,
    weaponIds: (Array.isArray(raw.weaponIds) ? raw.weaponIds : []).map(String).filter(Boolean)
  };
}

/**
 * How much of a target's Defence Bonus this attack ignores.
 *
 * @param {object[]} records every live pierce the attacker carries
 * @param {string} weaponId the weapon making this attack
 * @param {object} defence the TARGET's `system.combat.defence`
 * @returns {{amount: number, slots: string[], labels: string[]}}
 */
export function defencePierceFor(records, weaponId, defence) {
  const id = text(weaponId);
  const slots = new Set();
  const labels = [];
  let unarmoured = false;

  for (const record of Array.isArray(records) ? records : []) {
    const spec = normaliseDefencePierce(record);
    if (!spec) continue;
    // AN EMPTY weaponIds LIST MEANS EVERY WEAPON. Abjurers Strike is
    // cast on one weapon and always names it; a future "your attacks
    // pierce" effect would name none, and reading that as "no weapons"
    // would be the more surprising of the two readings.
    if (spec.weaponIds.length && !spec.weaponIds.includes(id)) continue;
    for (const slot of spec.slots) slots.add(slot);
    if (spec.unarmoured) unarmoured = true;
    labels.push(spec.label);
  }

  let amount = 0;
  for (const slot of slots) amount += Math.max(0, Number(defence?.[slot]) || 0);
  // NEGATIVE COMPONENTS ARE NOT A GIFT. A target whose item slot is -2
  // (cursed armour, say) is already worse off; "ignoring" it must not
  // hand the attacker a penalty by subtracting a negative. Each slot is
  // floored at 0 above rather than the total here, so one negative slot
  // cannot cancel a positive one it has nothing to do with.
  return { amount, slots: Array.from(slots), labels, unarmoured };
}

/** The card line for an attack that pierced something. */
export function defencePierceLine(pierce, targetName) {
  if (!pierce || (pierce.amount <= 0 && !pierce.unarmoured)) return "";
  const bits = [];
  if (pierce.unarmoured) bits.push(`treating ${targetName} as unarmoured`);
  if (pierce.amount > 0) {
    bits.push(`ignoring ${pierce.amount} of their Defence Bonus (${pierce.slots.join(", ")})`);
  }
  return `<em>${pierce.labels.join(", ")}: ${bits.join(", and ")}.</em>`;
}
