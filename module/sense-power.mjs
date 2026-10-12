/**
 * SENSE POWER (Chapter 4, page 91). Pure; no Foundry.
 *
 * NEW at 3.565.0. Both halves of the action — Broad and Focused — carry
 * the full printed text and, until now, no arithmetic at all: the aura
 * table sat in the description and `against: "none"` meant the check was
 * rolled at nothing.
 *
 *   "Some magical auras such as those from a different tradition,
 *    illusions, magical traps and divinations are more difficult to
 *    locate. If such an aura is within the radius of your spell, your
 *    power manipulation check is used as an opposed check against the
 *    spells DC (or level DC if spell DC unknown) with the following
 *    modifiers and result:
 *
 *      Magic is of a different tradition   -5
 *      Active Shadow Magic                -10
 *      Active magical trap                -10
 *      Active Insight Magic                -5"
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ORDINARY CASE IS NO CHECK AT ALL, and that is the first thing this
 * module has to get right. "You send out a pulse that registers the
 * presence of magic" — plain magic is simply found. The opposed check
 * exists only for the four hard auras, so a Sense Power with none of
 * them declared must roll exactly as it did before this existed rather
 * than acquiring a DC it never had.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE WORST PENALTY APPLIES, NOT THE SUM.
 *
 * An aura can plainly be two of these at once — a magical trap laid by a
 * caster of another tradition is both rows. The table prints no rule for
 * that, so this falls back to Appendix 1's: the worst circumstance
 * penalty applies rather than the sum, which is the rule
 * `ladderModifier` already records itself as relying on.
 *
 * SUMMING WOULD REACH -30 off three checkboxes, against a DC the GM has
 * just typed, and the difference between -10 and -30 is the difference
 * between a hard check and an impossible one. Where a rule is unprinted,
 * the reading that cannot silently make an action unusable is the one to
 * take.
 */

/** The four rows of the printed table, in printed order. */
export const AURA_MODIFIERS = Object.freeze([
  Object.freeze({ key: "tradition", label: "Magic is of a different tradition", modifier: -5 }),
  Object.freeze({ key: "shadow", label: "Active Shadow magic", modifier: -10 }),
  Object.freeze({ key: "trap", label: "Active magical trap", modifier: -10 }),
  Object.freeze({ key: "insight", label: "Active Insight magic", modifier: -5 })
]);

/**
 * The single modifier row a set of declared aura types earns, or null.
 *
 * @param {string[]} keys the aura rows the GM ticked
 * @returns {{label: string, value: number, type: string}|null}
 */
export function auraModifier(keys) {
  const chosen = AURA_MODIFIERS.filter((row) =>
    (Array.isArray(keys) ? keys : []).includes(row.key)
  );
  if (!chosen.length) return null;
  // THE WORST, by magnitude — every row is a penalty, so this is the
  // most negative. Written as a reduce over the chosen rows rather than
  // a sort, because a sort would need a tie-break rule that the two
  // -10 rows would otherwise decide by table order.
  const worst = chosen.reduce((a, b) => (b.modifier < a.modifier ? b : a));
  const others = chosen.length - 1;
  return {
    label: others
      ? `${worst.label} (worst of ${chosen.length})`
      : worst.label,
    value: worst.modifier,
    type: "circumstance"
  };
}

/** Is this one of the two Sense Power actions? */
export function isSensePowerAction(actionKey) {
  const key = String(actionKey ?? "");
  return key === "senseMagicBroad" || key === "senseMagicFocused";
}
