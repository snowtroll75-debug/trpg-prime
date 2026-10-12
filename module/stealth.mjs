/**
 * STEALTH (Chapter 4, pages 93–94). Pure; no Foundry.
 *
 * NEW at 3.565.0. Ambush and Sniping were already fully built — the Hard
 * difficulty, the size-category step, the 20/15/10/5 critical-modify
 * allowance. Sneak and Conceal an Object were not.
 */

/**
 * "If you maintain cover or greater cover against a creature throughout
 * your movement, you gain a +2-circumstance bonus (or +4 for greater
 * cover) to your Stealth check."
 */
export const SNEAK_COVER_BONUS = Object.freeze({
  none: 0,
  standard: 2,
  greater: 4
});

/** "By taking a -4-circumstance penalty to the check you can sneak at full speed." */
const FULL_SPEED_SNEAK_PENALTY = -4;

/**
 * The modifier rows a Sneak earns.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THIRD ARGUMENT IS THE WHOLE REASON THIS FUNCTION EXISTS.
 *
 * Page 93, in the same paragraph as the +2/+4: "However, THE BONUS
 * INCREASE FROM TAKING COVER DOES NOT APPLY because you are actively
 * moving."
 *
 * Take Cover (Greater) is a real Active Effect in this system and it
 * writes `system.skills.stealth.circumstance = 8`. So a character who
 * Took Cover and then Sneaked rolled at +8 where the book allows +4 —
 * a printed exception silently overridden by an effect that does not
 * know it exists. Found in the page 91–100 audit as D9.
 *
 * CORRECTED WITH A VISIBLE ROW RATHER THAN BY EDITING THE EFFECT. The
 * effect is right for everything else it does; what is wrong is this one
 * action reading it. A negative row that names the printed sentence
 * shows its working on the card, where a silently smaller number would
 * look like a bug — and the same lesson the Take Cover comment records
 * about a fix that "had never done anything" applies to quietly changing
 * a value nobody can see.
 *
 * @param {object} options
 * @param {string} options.cover "none" | "standard" | "greater"
 * @param {boolean} options.fullSpeed
 * @param {number} options.takeCoverStealthBonus what an active Take
 *   Cover effect is already adding to Stealth
 * @returns {Array<{label: string, value: number, type: string}>}
 */
export function sneakModifiers({ cover = "none", fullSpeed = false, takeCoverStealthBonus = 0 } = {}) {
  const rows = [];
  const level = String(cover ?? "none");
  const bonus = SNEAK_COVER_BONUS[level] ?? 0;
  if (bonus) {
    rows.push({
      label: `${level === "greater" ? "Greater cover" : "Cover"} maintained while moving`,
      value: bonus,
      type: "circumstance"
    });
  }
  const standing = Math.max(0, Math.trunc(Number(takeCoverStealthBonus) || 0));
  if (standing) {
    rows.push({
      label: "Taking Cover's increase does not apply while moving",
      value: -standing,
      type: "circumstance"
    });
  }
  if (fullSpeed) {
    rows.push({
      label: "Sneaking at full Speed",
      value: FULL_SPEED_SNEAK_PENALTY,
      type: "circumstance"
    });
  }
  return rows;
}

/**
 * "The item can have a size of no larger than small." (Conceal an
 * Object, page 93.)
 *
 * REPORTED, NOT REFUSED. Size lives on an item and the action is
 * routinely used on things that are not on the sheet at all — a stolen
 * key, a letter, a vial the GM has just described. A gate here would
 * refuse the commonest case for lack of data, so this answers the
 * question and the card states it.
 */
const CONCEALABLE_SIZES = Object.freeze(["tiny", "small"]);

/**
 * Is an item small enough to Conceal?
 * @param {string} size
 * @returns {boolean|null} null when the size is unknown
 */
export function isConcealable(size) {
  const key = String(size ?? "").trim().toLowerCase();
  if (!key) return null;
  return CONCEALABLE_SIZES.includes(key);
}

/** Concealable's printed bonus. */
const CONCEALABLE_BONUS = 2;

/**
 * CONCEALABLE (Chapter 6, weapon trait): "You gain a +2-circumstance bonus
 * to Conceal an Object (Stealth) checks if a weapon has this trait."
 *
 * NEW at 3.575.0 — the trait was printed on the Sword Cane and read by
 * nothing. A conditional OFFERED on Conceal an Object rather than a pooled
 * bonus, because the check is about whichever object is being hidden and
 * only the player knows whether it is the sword cane. One entry per
 * concealable weapon carried, each naming its weapon.
 *
 * @param {Array} items The actor's items.
 * @returns {Array} conditional entries
 */
export function concealableWeaponConditionals(items = []) {
  return (items ?? [])
    .filter((item) => item?.type === "weapon" && /\bconcealable\b/i.test(String(item?.system?.traits ?? "")))
    .map((item) => ({
      kind: "modifier",
      value: CONCEALABLE_BONUS,
      type: "circumstance",
      label: `Concealable (${item.name})`,
      scope: `Conceal an Object — hiding the ${item.name}`,
      auto: false,
      when: { actions: ["concealAnObject"] }
    }));
}
