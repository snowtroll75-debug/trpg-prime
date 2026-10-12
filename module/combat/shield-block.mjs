/**
 * Shield Block (Chapter 4, Martial).
 *
 * > "You quickly block an incoming attack with your shield.
 * >  Action Reaction; Trigger You take damage from an attack.
 * >  Your shield grants you DR against the incoming attack equal to its
 * >  DR bonus (if it has one). You and your shield take any further
 * >  damage. Furthermore, after using Shield Block, you lose your shield
 * >  bonus to DB until the beginning of your next turn.
 * >  Be aware that if your shield does not have a DR bonus, it cannot be
 * >  used to Shield Block."
 *
 * WHAT WAS THERE BEFORE. A number and nothing else. `blockDR` has been
 * derived on every actor since 3.233.5 — the shield's printed DR scaled
 * by BDB, deliberately kept out of passive Damage Reduction because
 * "Shield DR only comes into play when using a Shield Block action" —
 * and there was no such action. The figure was computed every
 * preparation and spent by nothing.
 *
 * TWO READINGS THIS FILE MAKES, both worth disagreeing with out loud:
 *
 * 1. THE DR IS APPLIED ONCE. "Your shield grants you DR … You and your
 *    shield take any further damage." Chapter 6's general item rule —
 *    "each time an item takes HP damage, reduce it by an amount equal to
 *    the item's DR" — would take the same DR off again on the way into
 *    the shield's hit points. Read here as one application: the sentence
 *    gives the DR, then says what is left hits both of you, and taking
 *    it twice would make a shield that stops 9 lose nothing to a blow of
 *    17.
 * 2. BOTH TAKE THE SAME REMAINDER. "You and your shield take any further
 *    damage" — not half each, not the shield first. The blow gets
 *    through and hurts them both.
 *
 * THE DB LOSS IS THE SAME RULE SHIELD BASH ALREADY CARRIES, word for
 * word, so it is the same mechanism: `loseShieldBonusUntilNextTurn`,
 * cleared at turn start. A second flag meaning the same thing would be a
 * second thing to clear.
 *
 * Pure logic; the workflow that prompts, damages the shield and posts
 * the card is `shield-block-workflow.mjs`.
 */

import { effectiveShieldDR } from "../items.mjs";
import { effectiveDR } from "./damage.mjs";

/**
 * Can this character Shield Block, and with what?
 *
 * "If your shield does not have a DR bonus, it cannot be used to Shield
 * Block." A shield with no DR is not a worse Shield Block, it is no
 * Shield Block — so this answers with a reason rather than a zero.
 *
 * BROKEN AND DESTROYED SHIELDS ANSWER THEMSELVES. `effectiveShieldDR`
 * already halves a broken shield's DR and gives a destroyed one none, so
 * a destroyed shield fails this test without a rule being written twice.
 *
 * @param {object[]} items the character's items
 * @returns {{able: boolean, shield: object|null, dr: number, why: string}}
 */
export function shieldBlockEligibility(items = [], spellShields = [], { bdb = 0 } = {}) {
  const shields = (items ?? []).filter(
    (item) => item?.type === "shield" && item?.system?.equipped);
  const spellSources = (Array.isArray(spellShields) ? spellShields : [])
    .filter((s) => Number(s?.dr) > 0);
  if (!shields.length) {
    /* NOT "no shield is equipped" ANY MORE when a spell made one. That
     * message was the whole bug: true about the character's inventory,
     * false about whether they could block. */
    if (spellSources.length) {
      const top = spellSources.reduce((a, b) => (Number(b.dr) > Number(a.dr) ? b : a));
      return { able: true, shield: null, spellShield: top, dr: Math.trunc(Number(top.dr)), why: "" };
    }
    return { able: false, shield: null, spellShield: null, dr: 0, why: "no shield is equipped" };
  }
  // The best of them, because "multiple Shield bonuses do not stack" is
  // the chapter's rule about DB and the same choice applies here: one
  // shield does the blocking, and it is the one that blocks most.
  //
  // WEIGHED AT WHAT IT ACTUALLY STOPS (3.575.0): a carried shield's DR is
  // a base that BDB multiplies (Graham, 3.233.5), and a spell's is already
  // its final figure. They were compared base-to-final, so a heavy shield
  // stopping 2 x3 = 6 lost to a spell shield stopping 5. `bdb` defaults to
  // 0, where the multiplier is 1 and nothing changes.
  let best = null;
  let bestDR = 0;
  for (const shield of shields) {
    const dr = effectiveDR(effectiveShieldDR(shield), bdb);
    if (dr > bestDR) {
      best = shield;
      bestDR = dr;
    }
  }
  /* A SHIELD A SPELL MADE COUNTS TOO (3.542.0).
   *
   * Until this release the filter above was the whole answer, and it
   * asks for an equipped ITEM — so a caster with the Shield spell up and
   * nothing on their arm was told "no shield is equipped" while the
   * spell's own text promised a Shield Block. Measured before it was
   * fixed; see magic/spell-shield.mjs for why the spell's DR cannot be
   * an item.
   *
   * THE SAME "BEST OF THEM" RULE decides between the two kinds, because
   * the reason is unchanged: one shield does the blocking and it is the
   * one that blocks most. A caster holding a heavy steel shield and
   * running Shield does not get to add them together, any more than two
   * carried shields would.
   *
   * A TIE GOES TO THE CARRIED SHIELD. Blocking with the spell ends it,
   * so when the two stop the same amount the one that survives is the
   * better answer — and it is the one the player did not pay PP for. */
  const spellBest = (Array.isArray(spellShields) ? spellShields : [])
    .filter((s) => Number(s?.dr) > 0)
    .reduce((top, s) => (!top || Number(s.dr) > Number(top.dr) ? s : top), null);

  if (spellBest && Number(spellBest.dr) > bestDR) {
    return {
      able: true,
      shield: null,
      spellShield: spellBest,
      dr: Math.trunc(Number(spellBest.dr)),
      why: ""
    };
  }

  if (!best) {
    if (spellBest) {
      return {
        able: true, shield: null, spellShield: spellBest,
        dr: Math.trunc(Number(spellBest.dr)), why: ""
      };
    }
    return {
      able: false,
      shield: shields[0],
      dr: 0,
      why: `${shields[0].name} has no DR bonus, so it cannot be used to Shield Block`
    };
  }
  return { able: true, shield: best, spellShield: null, dr: bestDR, why: "" };
}

/**
 * What a Shield Block does to one incoming blow.
 *
 * @param {object} options
 * @param {number} options.damage the damage that arrived
 * @param {number} options.blockDR the shield's DR, BDB-scaled
 * @param {boolean} options.halveShieldDamage Shellback's clause
 * @returns {{damage, blockDR, prevented, toCharacter, toShield, halved}}
 */
export function shieldBlockOutcome({ damage, blockDR, halveShieldDamage = false } = {}) {
  const incoming = Math.max(0, Math.trunc(Number(damage) || 0));
  const dr = Math.max(0, Math.trunc(Number(blockDR) || 0));
  const through = Math.max(0, incoming - dr);
  // SHELLBACK (Creature Codex, Chapter 3): "halves any HP damage it
  // takes in conjunction with using the Shield Block feat." The
  // SHIELD's damage only — the character's share is untouched, because
  // the rune is on the shield and the sentence says "it".
  const toShield = halveShieldDamage ? Math.floor(through / 2) : through;
  return {
    damage: incoming,
    blockDR: dr,
    prevented: Math.min(incoming, dr),
    toCharacter: through,
    toShield,
    halved: Boolean(halveShieldDamage) && through !== toShield
  };
}
