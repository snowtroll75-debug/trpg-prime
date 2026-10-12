import { parseBonusKey } from "../bonuses/registry.mjs";
import { itemStatus } from "../items.mjs";

/**
 * Active Effect document for TRG Prime.
 *
 * A change using CUSTOM mode whose key ends in a recognised bonus type is not
 * written onto the actor. It is pushed into a typed pool instead, so that the
 * Appendix 1 stacking rules can be applied in derived data once every
 * contribution is known.
 *
 *   key   system.skills.religion.item
 *   mode  Custom
 *   value 2
 *
 * grants a +2 item bonus to Religion which will not stack with another item
 * bonus to the same skill.
 *
 * Every other mode behaves exactly as Foundry intends. An Add-mode change to
 * the same key still increments the sheet's own slot, and that slot then enters
 * the pool as a single entry of its type.
 */
export class TRGActiveEffect extends ActiveEffect {
  /**
   * BROKEN ITEMS GRANT NOTHING (3.573.0).
   *
   * Chapter 6, the Broken Condition: "With the exception of armour (see
   * below), a broken object can't be used for its normal function, nor
   * does it grant bonuses." Until Graham ruled on 18 September 2026 that
   * this should be enforced, the rule was printed to chat as prose and
   * left to the GM — a broken tool went on granting its item bonus.
   *
   * `isSuppressed` IS FOUNDRY'S OWN HOOK for exactly this question, and
   * suppressing here rather than at each consumer means every path stops
   * at once: the bonus pool, the sheet, the check dialog and anything
   * added later. An effect that is suppressed is left out of
   * `appliedEffects` without being disabled, so nothing is written to the
   * item and the bonus returns by itself the moment it is Repaired.
   *
   * ARMOUR AND SHIELDS ARE NOT EXCEPTED HERE, and that is deliberate.
   * Their DR is read straight off `system.dr` by `effectiveArmourDR` and
   * `effectiveShieldDR`, which already halve it for a broken piece and
   * zero it for a destroyed one — that path never touches an Active
   * Effect. So the printed exception keeps working exactly as before,
   * while a rune or enchantment riding on the same broken plate correctly
   * stops. Suppressing the effects is what implements "nor does it grant
   * bonuses"; it is not what implements the DR.
   *
   * An item with no maximum HP is `untracked` and can never be broken, so
   * this changes nothing for the great majority of gear.
   */
  get isSuppressed() {
    if (super.isSuppressed) return true;
    const item = this.parent;
    if (item?.documentName !== "Item") return false;
    const hp = item.system?.hp;
    if (!hp) return false;
    return itemStatus(hp.value, hp.max) !== "intact"
      && itemStatus(hp.value, hp.max) !== "untracked";
  }
}

/**
 * Route a CUSTOM-mode Active Effect change whose key names a bonus slot into the
 * actor's Appendix-1 bonus pool, instead of writing it to the actor directly.
 *
 * Foundry V13+ no longer calls `ActiveEffect#apply()` per change during
 * `applyActiveEffects` — CUSTOM-mode changes are dispatched through the
 * `applyActiveEffect` hook. So this is registered as that hook's handler (see
 * scripts/trg-prime.mjs); an override of `apply()` would silently never run.
 *
 *   key   system.combat.attack.status   → +N status bonus to attack rolls
 *   key   system.skills.religion.item   → +N item bonus to Religion
 *
 * The bonus enters the typed pool (via `actor.addBonus`) so the Appendix-1
 * stacking rules apply in derived data once every contribution is known.
 *
 * @param {Actor} actor  the actor the effect is applied to
 * @param {object} change  the effect change ({key, value, type, effect})
 */
export function applyCustomBonusChange(actor, change) {
  // `mode` (numeric) is a deprecated compatibility getter on a V14
  // change; `type` (string) is the field it now derives from, and is
  // read directly here rather than through the getter.
  if (change?.type !== "custom") return;

  const parsed = parseBonusKey(change.key);
  if (!parsed) return;
  if (typeof actor?.addBonus !== "function") return;

  const value = Number(change.value);
  if (!Number.isFinite(value)) {
    console.warn(
      `TRG Prime | Effect "${change.effect?.name ?? "?"}" has a non-numeric value for ${change.key}`
    );
    return;
  }

  actor.addBonus(parsed.target, {
    label: change.effect?.name ?? "Effect",
    value,
    type: parsed.type,
    source: change.effect?.uuid
  });
}
