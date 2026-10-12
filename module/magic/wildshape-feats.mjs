/**
 * The six Chapter 5 feats that extend Wild Shape.
 *
 *   Humanoid Shape   (BSB +4)   take the form of a Humanoid
 *   Natural Casting  (BSB +4)   cast without the components a form denies you
 *   Ferocious Shape  (BSB +6)   +2 to natural attacks, +2 dodge DB, in form
 *   Plant Shape      (BSB +8)   take the form of a Plant
 *   Elemental Shape  (BSB +10)  …of an Elemental, plus a resistance
 *   Wyrm Shape       (BSB +12)  …of a Wyrm, plus a wider resistance
 *
 * ONE POOL, FOUR FORMS. Graham's ruling, 21 August 2026. The four form
 * feats each say *"You may use your Wild Shape ability to take the form
 * of X"* — the ability, not a new allowance. So a 9th-level Druid with
 * all four still has four shapeshifts a day and may spend any of them on
 * any unlocked form.
 *
 * That is why `USES_POOL` exists rather than four spells each tracking
 * their own count. Giving each form its own allowance would have been
 * far easier to build and would have taken that Druid from four
 * shapeshifts a day to twenty — the kind of error that reads as
 * generosity right up until it decides an encounter.
 *
 * THE POOL IS A POINTER, NOT A SUM. Exactly one item owns the counter
 * (Shape Of The Animal, written by the Wild Shape button); the other
 * four read and spend from it and own nothing. Anything else means two
 * places holding one number, which is the defect shape that has cost
 * this chapter more than any other.
 */

const normalise = (name) => String(name ?? "").trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* The forms                                                           */
/* ------------------------------------------------------------------ */

/** feat (normalised) → the form spell it unlocks. */
export const WILD_SHAPE_FORM_FEATS = Object.freeze({
  "humanoid shape": "Shape Of The Humanoid",
  "plant shape": "Shape Of The Plant",
  "elemental shape": "Shape Of The Elemental",
  "wyrm shape": "Shape Of The Wyrm"
});

/**
 * The ability that owns the daily allowance, and the spell that holds it.
 *
 * WHAT `WILD_SHAPE_ABILITY` IS FOR, and it is not tidiness. Both strings
 * are LOOKUP KEYS matched against a pack item's own `name`, so the value
 * here has to equal what the pack says or the lookup silently finds
 * nothing and the ability quietly does not exist.
 *
 * Until 3.384.0 the constant was exported and then ignored: five call
 * sites across four files wrote `"Wild Shape"` out by hand, and this
 * line — the thing whose entire job was to stop that — had no reader.
 *
 * AND A CONSTANT ALONE WOULD NOT HAVE SAVED THEM. Renaming the ability
 * in the pack breaks all five lookups whether they share a constant or
 * not; sharing one only means there is a single line to correct once
 * somebody notices. What makes it a guard rather than a convenience is
 * `verify-wildshape-vocabulary.mjs`, which opens the packs and fails if
 * either string does not name a real item.
 *
 * That check is the Improved Combat Reflexes lesson, paid for on 23
 * August: the code matched `"improved combat reflexes"` while the pack
 * held **"Combat Reflexes, Improved"**, and the harness agreed with the
 * code because both used the name I had invented. Nothing in the system
 * compared either against the pack, so the feat did nothing for a
 * release and every test was green.
 */
export const WILD_SHAPE_ABILITY = "Wild Shape";
export const WILD_SHAPE_POOL_SPELL = "Shape Of The Animal";

/**
 * Every spell that spends from a shared pool, and which item holds it.
 *
 * Keyed by the MEMBER's normalised name so a lookup is one step. The
 * pool owner is deliberately not a member of itself: `usesPoolNameFor`
 * returning null for Shape Of The Animal is what stops the redirect
 * looping and what makes "does this item own its own counter?" a
 * question with a plain answer.
 */
export const USES_POOL = Object.freeze(
  Object.fromEntries(
    Object.values(WILD_SHAPE_FORM_FEATS).map((spell) => [normalise(spell), WILD_SHAPE_POOL_SPELL])
  )
);

/**
 * Which item's daily counter governs this one, or null if it owns its own.
 * @param {string} itemName
 * @returns {string|null}
 */
export function usesPoolNameFor(itemName) {
  return USES_POOL[normalise(itemName)] ?? null;
}

/* ------------------------------------------------------------------ */
/* The resistance rider                                                */
/* ------------------------------------------------------------------ */

/*
 * "Whenever you use Wildshape to change into a different form, you gain
 * resistance to either acid, cold, electricity or fire for the
 * duration." — Elemental Shape. Wyrm Shape prints the same sentence with
 * poison added.
 *
 * A CHOICE AT SHAPESHIFT TIME, per Graham's ruling of 21 August 2026,
 * not a standing pick made each morning: the text says "your choice"
 * about a specific change of form, and the resistance ends with it.
 */
export const SHAPE_RESISTANCE_FEATS = Object.freeze({
  "elemental shape": Object.freeze(["acid", "cold", "electricity", "fire"]),
  "wyrm shape": Object.freeze(["acid", "cold", "electricity", "fire", "poison"])
});

/** Canonical order, so a union of two feats reads the same every time. */
const RESISTANCE_ORDER = ["acid", "cold", "electricity", "fire", "poison"];

/**
 * What this actor may choose resistance to when they change form.
 *
 * A UNION, NOT THE BEST ONE. A Druid with both feats has both sentences
 * on their sheet and neither cancels the other; taking the longer list
 * happens to give the same answer here, but "whichever feat is higher
 * tier wins" is a rule nothing printed, and it would silently break if a
 * later feat offered a type Wyrm Shape does not.
 *
 * @param {string[]} featNames
 * @returns {string[]} possibly empty
 */
export function shapeResistanceChoices(featNames) {
  const chosen = new Set();
  for (const name of Array.isArray(featNames) ? featNames : []) {
    for (const type of SHAPE_RESISTANCE_FEATS[normalise(name)] ?? []) chosen.add(type);
  }
  return RESISTANCE_ORDER.filter((type) => chosen.has(type));
}

/* ------------------------------------------------------------------ */
/* What counts as changing form                                        */
/* ------------------------------------------------------------------ */

/**
 * Is this spell a change of form?
 *
 * READ OFF THE POLYMORPH TRAIT, not off a list of nine spell names. The
 * riders below say "whenever you use Wildshape to change into a
 * different form", and the trait is the system's own answer to what a
 * change of form is — a list would go stale the first time a form spell
 * was added, and go stale silently.
 */
export function isFormSpell(traits) {
  return /\bpolymorph\b/i.test(String(traits ?? ""));
}

/**
 * Is this actor currently in a form?
 *
 * TWO SIGNALS, because each is blind on its own. The spell's own active
 * effect is the reliable one — every form spell leaves an effect named
 * after itself. The natural weapon is the fallback for a form applied
 * before this existed, and it is the signal `wildShapeAttackBonus`
 * already trusts (druid.mjs): nothing except a shapeshift puts a
 * non-Unarmed natural weapon on a Druid's sheet.
 *
 * @param {object} opts
 * @param {Array<{name?: string, disabled?: boolean}>} opts.effects
 * @param {Array<{system?: object, name?: string}>} opts.items
 */
export function inFormNow({ effects = [], items = [] } = {}) {
  const named = (Array.isArray(effects) ? effects : []).some(
    (e) => !e?.disabled && /^shape of the\b/i.test(String(e?.name ?? ""))
  );
  if (named) return true;
  return (Array.isArray(items) ? items : []).some(
    (i) => i?.system?.natural && normalise(i.name) !== "unarmed strike"
  );
}

/* ------------------------------------------------------------------ */
/* Ferocious Shape                                                     */
/* ------------------------------------------------------------------ */

/**
 * "You gain a +2-circumstance bonus to all natural attacks and a
 * +2-dodge bonus to DB when using your Wildshape ability."
 *
 * SEPARATE FROM WILD SHAPE'S OWN +1, which is a CLASS bonus on natural
 * weapons and applies whether or not this feat is held. Two bonuses of
 * different types stack, and folding them into one number would have
 * quietly made them one bonus that does not.
 */
export const FEROCIOUS_SHAPE_BONUS = 2;

/**
 * How the attack card labels and TYPES this bonus.
 *
 * THE TYPE IS THE RULE, so it lives where the rule lives. Wild Shape's
 * own +1 is a CLASS bonus and this is a CIRCUMSTANCE bonus; two types
 * stack where two of a kind do not, so a Druid in a form with a claw
 * should be at +3, not +2. Typed inline in attack-workflow.mjs, that
 * distinction was one word in a 3,000-line file that no harness could
 * run — and changing it to "class" produced a perfectly plausible card
 * showing a smaller number.
 */
export const FEROCIOUS_MODIFIER = Object.freeze({
  label: "Ferocious Shape (natural attack)",
  type: "circumstance"
});

/** The natural-attack half. Zero without the feat, or out of a form. */
export function ferociousAttackBonus({ featNames = [], inForm = false, weaponNatural = false, weaponName = "" } = {}) {
  if (!inForm || !weaponNatural) return 0;
  if (normalise(weaponName) === "unarmed strike") return 0;
  return hasFeat(featNames, "ferocious shape") ? FEROCIOUS_SHAPE_BONUS : 0;
}

/** The dodge-DB half, applied as an effect for the form's duration. */
export function ferociousDefenceBonus(featNames) {
  return hasFeat(featNames, "ferocious shape") ? FEROCIOUS_SHAPE_BONUS : 0;
}

/* ------------------------------------------------------------------ */
/* Natural Casting                                                     */
/* ------------------------------------------------------------------ */

/**
 * "You can complete the verbal and somatic components of spells even
 * when in a different form… you have mastered the art of utilizing
 * material components and focuses even when they are seamlessly
 * integrated into your transformed form."
 *
 * SOMATIC AND MATERIAL, and only in a form. Verbal is not gated by this
 * system at all (component-gate.mjs leaves silence to the GM), so there
 * is nothing there to waive.
 *
 * THE FEAT'S OWN CAVEAT IS NOT WAIVED: *"you remain unable to speak
 * while employing your wild shape abilities"* and it grants no use of
 * magic items a form could not hold. Neither is modelled here, because
 * neither is modelled anywhere — saying so is more honest than quietly
 * widening the feat to cover them.
 *
 * @returns {{somatic: boolean, material: boolean}}
 */
export function naturalCastingWaives({ featNames = [], inForm = false } = {}) {
  const on = inForm && hasFeat(featNames, "natural casting");
  return { somatic: on, material: on };
}

/* ------------------------------------------------------------------ */

function hasFeat(featNames, wanted) {
  return (Array.isArray(featNames) ? featNames : []).some((n) => normalise(n) === wanted);
}

/*
 * `WILD_SHAPE_FEATS` stood here until 3.384.0 — the four form feats plus
 * Ferocious Shape and Natural Casting, described as *"the register's
 * evidence"*. THE REGISTER NEVER READ IT. Nothing did: not
 * feat-evidence.mjs, not the coverage register, not a verify tool. It
 * was a claim about this module's coverage written in the shape of a
 * constant, and a claim nothing checks is a comment wearing a type.
 *
 * The coverage question it was meant to answer is answered properly by
 * feat-evidence.mjs, which reads the pack and the code rather than a
 * list this file maintains about itself — §5.3, a check written beside
 * the code encodes the same mistake as the code.
 */
