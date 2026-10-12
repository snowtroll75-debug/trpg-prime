/**
 * THE WARPS THAT ADD TO A FORM (3.595.0).
 *
 * Graham, 26 September 2026, block 31: R3 *"Your Recommendation"* (the
 * size steps) and R4 *"Build"* (the extra natural attacks).
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO KEYS, AND THE ONLY REASON THEY SHARE A FILE.
 *
 * `sizeSteps` and `extraFormAttacks` are different rules with nothing in
 * common except WHERE they act: both add a row to the form a Shape spell
 * has just chosen, which is the one thing no existing warp mod does. The
 * inert-warp register calls that family "add a whole second effect" and
 * my recommendation there was NOT to build a general `warpEffects` key,
 * because a warp that can author arbitrary rows is a second authoring
 * surface editable by nobody. These two are the narrow version of that:
 * each produces ONE named kind of row, and neither can express anything
 * else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY `morphForms` IS NOT THE KEY FOR THE ATTACKS, measured before a line
 * of this was written.
 *
 * Five Shape spells print *"gain an additional natural attack (max of two
 * additional attacks)"*. `morphForms` exists, is read, is capped at three,
 * and its own text is *"You gain an additional natural attack form (max
 * 3)"* — one word away. It is still the wrong key: it is read at exactly
 * one place, inside the `wildMorph` case, which grows an attack COPIED
 * FROM A STUDIED TARGET and refuses outright without one. The Shape
 * forms' attacks are `attack` rows resolved from the creature-attacks
 * pack. A Shape spell wired to `morphForms` would charge a PP and then
 * ask for a studied creature that has nothing to do with the form.
 *
 * That is the `targetTypes` mistake, which cost two spells four PP each
 * for nothing at 3.590.0, and the `casterGains` mistake before it:
 *
 * > A name that exists somewhere is the most convincing kind of wrong
 * > name, because it survives every search.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ATTACK NAMES ARE READ FROM THE PACK, never listed here. The
 * creature-attacks pack is what `applyAttackEffect` resolves against, and
 * a name this file invented would print "no such creature attack" at the
 * table. The pages agree with that: "(tentacle, claw, bite, pseudopod,
 * etc.)" and "available to your type" are invitations, not lists.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/** "max of two additional attacks", printed on all five spells. */
export const EXTRA_ATTACK_CAP = 2;

/**
 * How many extra natural attacks were bought, capped as printed.
 *
 * CAPPED HERE rather than at the prompt, for `normaliseWildMorph`'s
 * reason: the cap is a rule the page states, and a rule enforced only in
 * the dialog is a rule the next caller forgets.
 */
export function extraAttackCount(mods) {
  return Math.min(EXTRA_ATTACK_CAP, Math.max(0, int(mods?.extraFormAttacks)));
}

/** One extra natural attack, as a row the `attack` case already handles. */
export function extraAttackRow(attackName, spellName = "") {
  const name = String(attackName ?? "").trim();
  if (!name) return null;
  return {
    kind: "attack",
    target: "self",
    attack: name,
    note: "additional natural attack",
    // MAGICAL, BECAUSE THE FORM'S OWN ATTACKS ARE. Every Shape spell
    // prints "Natural attacks automatically gain the Magical trait", so an
    // attack bought with a warp that did not would be the one exception
    // nobody intended.
    extraTraits: "magical",
    ...(spellName ? { label: spellName } : {})
  };
}

/**
 * How many size steps were bought, and in which direction.
 *
 * THE DEARER OFFER WINS, on `targetCap`'s reasoning: a caster who buys
 * both the one-step and the two-step option has bought two steps, not
 * three — these are alternatives printed as separate lines, not additions.
 * The direction is not in the mod at all; it is the caster's to choose at
 * cast time, because the page says "increase or decrease".
 */
export function sizeStepsBought(mods) {
  return Math.max(0, int(mods?.sizeSteps));
}

/** The size row, signed by the chosen direction. */
export function sizeStepRow(steps, direction, spellName = "") {
  const count = Math.max(0, int(steps));
  if (count === 0) return null;
  const sign = String(direction ?? "").toLowerCase() === "smaller" ? -1 : 1;
  return {
    kind: "sizeStep",
    target: "self",
    steps: sign * count,
    ...(spellName ? { label: spellName } : {})
  };
}
