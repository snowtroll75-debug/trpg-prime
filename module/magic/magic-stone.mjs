/**
 * MAGIC STONE — three pebbles a sling can throw.
 *
 * NEW at 3.513.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MAGIC STONE (PP 2, touch, Essence / Soul, 1 minute)
 *
 *   "You imbue positive energy into a maximum of 3 pebbles. Each of these
 *    pebbles gains a +1 item (magic) bonus and the disruptive magical
 *    trait. The pebbles may be fired from a sling weapon. Each pebble
 *    crumbles to dust after it is used or when the spell's duration
 *    expires."
 *      +2 PP: increase the bonus to +2
 *
 * The pack shipped it with `effects: []`. One of the four PP 2 spells
 * deliberately left unbuilt in the 3.504.0 batch.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT IS A REAL PIECE OF AMMUNITION, WHICH IS WHY THE SPELL IS CHEAP AND
 * THE FIELD IT NEEDED WAS NOT.
 *
 * Everything the pebbles do already exists: `ammunitionFitsWeapon`
 * matches a round to a weapon by GROUP, and the Sling's group is "Sling";
 * `roundsRemaining` and the consume step spend one per shot, which is
 * "crumbles to dust after it is used" with nothing added; and the attack
 * workflow already folds a round's damage modifier into the formula.
 *
 * WHAT DID NOT EXIST WAS HALF THE BONUS. Ammunition could change damage,
 * damage type, range, armour rending, splash and subdual — everything
 * except whether the shot lands. Graham ruled on 7 September 2026 that
 * "+1 item (magic) bonus" covers ATTACK AND DAMAGE, the ordinary reading
 * of an enhancement bonus, so `attackModifier` was added to ammunition in
 * the same release. That is a wider change than this spell: every one of
 * the nine authored rounds can now declare one, and all nine declare zero.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE `item` TYPE IS DELIBERATE AND IT COSTS THE SPELL SOMETHING.
 *
 * A +1 Magic Stone fired from a +2 sling gives +2, not +3, because two
 * item bonuses on one roll do not stack. That is the correct reading of
 * an enhancement bonus and it is why `ammunitionAttackModifier` returns a
 * TYPED ROW rather than a number for the workflow to add up.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DISRUPTIVE TRAIT IS PRINTED, NOT APPLIED.
 *
 * Measured before building: **"Disruptive" appears in no pack and in no
 * line of code anywhere in this system.** "Magical" exists on three
 * documents and nothing reads it either. So there is no rule for the
 * pebbles to carry — automating it would mean inventing the trait, the
 * thing it disrupts, and the check it interrupts, none of which the book
 * gives here.
 *
 * The trait goes on the item where a reader will see it, and the card
 * says plainly that the table settles what it does. Same position as
 * Hunter's Spirit's travel-pace clause and the fifty other places this
 * project prints a rule rather than pretending to run one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE PEBBLES HAVE NO CLOCK OF THEIR OWN — Wild Morph's lesson, and the
 * comment beside it says so in as many words: the ITEMS are stamped
 * `endsWithSpell`, and a companion effect carries the duration that the
 * world-time sweep expires. Deleting that effect is what removes them.
 * Without it the pebbles would be permanent +1 ammunition.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/** The printed number of pebbles. */
export const MAGIC_STONE_COUNT = 3;

/** The weapon group the pebbles fit. Matches the Sling's own `group`. */
export const MAGIC_STONE_GROUP = "Sling";

/**
 * The traits the pebbles carry.
 *
 * BOTH WORDS, because the book gives both and a reader of the item should
 * see what the book says. Neither is read by any rule in this system —
 * see the header.
 */
export const MAGIC_STONE_TRAITS = "Disruptive, Magical";

/**
 * The bonus each pebble carries, once the warp is taken into account.
 *
 * THE ORDINARY NUMERIC CHANNEL. The book's "+2 PP: increase the bonus to
 * +2" is declared as `bonusValue: 1` rather than as a set-to-2, so the
 * same `warpedBonusValue` that caps every other numeric warp caps this
 * one, and a future "+4 PP: increase it again" is arithmetic rather than
 * a second special case.
 *
 * INJECTED rather than imported, the shape `slotChoiceRows` and
 * `warpedGrants` use, so this file stays pure.
 *
 * @param {object} warpMods the aggregated warp mods
 * @param {Function|null} warpValue `warpedBonusValue`, injected
 * @returns {number}
 */
export function magicStoneBonus(warpMods = {}, warpValue = null) {
  // A WARP ONLY EVER BUYS MORE. `warpedBonusValue` adds whatever it is
  // handed, sign and all, so a negative mod arriving here would sell the
  // caster a WEAKER pebble than the printed one.
  const added = Math.max(0, int(warpMods?.bonusValue));
  if (!added || typeof warpValue !== "function") return 1;
  return warpValue(1, added, warpMods?.bonusMax ?? null);
}

/**
 * The ammunition item the spell creates. THE SINGLE WRITER of its shape.
 *
 * EVERY FIELD IS LOAD-BEARING for machinery that already exists:
 * `type: "ammunition"` and `compatibleWeaponGroup` are what
 * `ammunitionFitsWeapon` matches on, `quantity` is what `roundsRemaining`
 * counts down, and `attackModifier` / `damageModifier` are what the
 * attack workflow reads. Miss one and the pebbles sit in the inventory
 * looking correct and doing nothing — so the checks hold this object
 * against those readers rather than against a list typed out by hand.
 *
 * @param {object} options
 * @param {number} options.value the per-pebble bonus
 * @param {number} [options.count] how many pebbles
 * @param {string|null} [options.castId] the casting that made them
 * @param {string} [options.img]
 * @returns {object} an Item creation payload
 */
export function magicStoneItemData({ value = 1, count = MAGIC_STONE_COUNT, castId = null, img = "" } = {}) {
  const bonus = int(value);
  return {
    name: "Magic Stone",
    type: "ammunition",
    img: img || "icons/commodities/stone/stone-pile-grey.webp",
    system: {
      quantity: Math.max(1, int(count)),
      weight: 0,
      price: 0,
      equipped: false,
      invested: false,
      traits: MAGIC_STONE_TRAITS,
      compatibleWeaponGroup: MAGIC_STONE_GROUP,
      attackModifier: bonus,
      damageModifier: bonus,
      description:
        `A pebble imbued with positive energy, carrying a +${bonus} item (magic) bonus to `
        + "attack and damage when fired from a sling. It crumbles to dust when it is used "
        + "or when the spell ends. Its disruptive trait is settled at the table."
    },
    flags: {
      "trg-prime": {
        castId: castId ?? null,
        // THE DECLARATION THAT MAKES IT TEMPORARY. Bless Water's Holy
        // Water is also made by a spell and is meant to be kept, so the
        // cleanup removes only what says it should be removed.
        endsWithSpell: true
      }
    }
  };
}

/** What the card says when the pebbles appear. */
export function magicStoneLine(targetName, count, value) {
  const n = Math.max(1, int(count));
  const stones = n === 1 ? "pebble" : "pebbles";
  return `<strong>${targetName}</strong> holds <strong>${n} ${stones}</strong>`
    + ` — +${int(value)} item bonus to attack and damage, fired from a sling.`;
}

/**
 * The sentence the card prints about the half nothing runs.
 *
 * SAID OUT LOUD rather than left off. A player who reads "the disruptive
 * magical trait" in the spell's own text and sees nothing about it on the
 * card has no way to tell an unimplemented rule from a working one.
 */
export function magicStoneTraitLine() {
  return "<em>The pebbles carry the Disruptive trait — no rule in this system reads it,"
    + " so what it disrupts is settled at the table.</em>";
}
