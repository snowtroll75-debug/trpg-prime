import { DAMAGE_TYPES } from "../config.mjs";
import { ALL_DAMAGE } from "../defences.mjs";

/**
 * DR Multiplier Table (Chapter 6, Armour Statistics): "As you become
 * more experienced the DR provided by your armour also increases,
 * this is represented by you gaining a DR multiplier as your BDB
 * increases." 0-5 Base, 6-11 x2, 12-17 x3, 18-23 x4, 24+ x5.
 */
export function drMultiplier(bdb) {
  const value = Math.max(0, Math.floor(Number(bdb) || 0));
  if (value >= 24) return 5;
  if (value >= 18) return 4;
  if (value >= 12) return 3;
  if (value >= 6) return 2;
  return 1;
}

/** Effective DR from a base armour value and the wearer's own BDB. */
export function effectiveDR(baseDR, bdb) {
  return Math.max(0, Math.floor(Number(baseDR) || 0)) * drMultiplier(bdb);
}

/**
 * Natural Armour (in preparation for later race/feat/spell content,
 * per Graham directly): comes in two forms. A flat bonus adds a
 * static value straight to DR, with no BDB scaling at all. A Base
 * bonus scales with BDB exactly the same way armour's own DR does —
 * reusing drMultiplier directly rather than a separate formula, since
 * it's the same mechanic. The two forms don't add together: like
 * every other source of the existing `naturalArmour` bonus type
 * (already defined with "highest" stacking in the bonus registry),
 * only the better of the two applies at once, not both.
 *
 * @param {number} flatValue
 * @param {number} baseValue
 * @param {number} bdb
 * @returns {number}
 */
export function naturalArmourDR(flatValue, baseValue, bdb) {
  const flat = Math.max(0, Math.floor(Number(flatValue) || 0));
  const scaledBase = effectiveDR(baseValue, bdb);
  return Math.max(flat, scaledBase);
}

/**
 * The DR an ordinary hit actually gets reduced by — the whole pool, from
 * every source, as `resolveDamagePacket` will compose it.
 *
 * WHY THIS EXISTS. The sheet had no such number. Its Summary panel's
 * "Armour DR" stat read `system.combat.armour.dr` straight, which is the
 * raw sum of equipped armour BEFORE the Chapter 6 multiplier and with no
 * term for natural armour or bonus DR at all. On a companion — a Wolf
 * with DR 2 from its own hide and no armour — the headline readiness
 * figure read 0 (reported live by Graham, 3.233.2). On an armoured
 * character above BDB 5 it understated the real figure by the multiplier.
 *
 * WHY IT LIVES HERE RATHER THAN IN THE SHEET. Because the sheet must not
 * own a second copy of this arithmetic (lesson 13). The attack workflow
 * composes exactly these three terms before handing them to
 * `resolveDamagePacket`, and `verify-damage.mjs` asserts that this
 * function agrees with what that pipeline actually subtracts — so the
 * displayed number cannot drift away from the applied one without a
 * harness failure.
 *
 * WHAT IT DELIBERATELY DOES NOT MODEL. The per-attack reductions:
 * energy types halve the pool, essence/force/aligned/mental/poison ignore
 * it, Armour Rending and Penetrating cut it, and a critical to an
 * unarmoured location drops the equipped half. All four depend on the
 * incoming attack, which a character sheet does not have. This is the
 * full-effectiveness figure against an ordinary physical hit, and the
 * tooltip says so rather than letting a player read it as a floor.
 *
 * Shields are absent on purpose: `armourContributesToHit` admits only
 * `armour` items, so an equipped shield's DR is displayed on the Combat
 * tab but never enters the damage pipeline. Adding it here would make
 * the sheet disagree with resolution rather than agree with it.
 *
 * @param {object} options
 * @param {number} [options.armourDr] `system.combat.armour.dr` — the RAW
 *   equipped sum, unscaled. Scaled here, once.
 * @param {number} [options.naturalArmourDr] `system.combat.naturalArmour.dr`,
 *   already scaled by `naturalArmourDR` above.
 * @param {number} [options.bonusDr] `system.combat.dr.total` (Dracoris,
 *   Iron Hide, a Construct's own DR). Clamped at zero the same way the
 *   attack workflow clamps it.
 * @param {number} [options.bdb]
 * @returns {number}
 */
export function totalDamageReduction({
  armourDr = 0, naturalArmourDr = 0, bonusDr = 0, bdb = 0
} = {}) {
  const nonNegative = (value) => Math.max(0, Math.floor(Number(value) || 0));
  return effectiveDR(armourDr, bdb)
    + nonNegative(naturalArmourDr)
    + nonNegative(bonusDr);
}

/**
 * The damage pipeline (Core 3.1, Chapter 7), in the book's stated order:
 * amount -> type -> DR -> immunity -> weakness -> resistance -> HP.
 *
 * DR applies to each damage type separately. Armour may use only half its DR
 * against the five energy types and none at all against essence, force,
 * aligned, mental and poison. Resistance halves once, "applied after all
 * other modifiers, such as bonuses and DR" (the Dondo worked example: DR 4
 * halved to 2 against fire, 12 - 2 = 10, then halved to 5). Weakness
 * increases the damage by 50%. Immunity ignores the packet entirely.
 */

/** The first trait on a source that the target is immune to, if any. */
function immuneTraitFor(immuneTraits, sourceTraits) {
  if (!immuneTraits || !sourceTraits?.length) return null;
  const set = immuneTraits instanceof Set ? immuneTraits : new Set(immuneTraits);
  if (!set.size) return null;
  for (const trait of sourceTraits) {
    const key = String(trait ?? "").trim().toLowerCase();
    if (key && set.has(key)) return key;
  }
  return null;
}

/**
 * The first trait on a source that a resistance or weakness names.
 *
 * IDENTICAL LOGIC TO `immuneTraitFor` AND DELIBERATELY A SECOND
 * FUNCTION, because the two answer different questions of the same
 * shape: one asks what stops the packet, the other what halves or
 * swells it. Sharing one name for both would mean a caller reading
 * "immune" while applying a weakness. The bodies are three lines; the
 * confusion would not be.
 */
function traitMatch(fieldTraits, sourceTraits) {
  return immuneTraitFor(fieldTraits, sourceTraits);
}

/**
 * COLDFIRE (3.642.0; F&F 3.0 block 12, Graham's ruling R4 of 14 October
 * 2026). The Shade Dragon's breath, bite and aura deal coldfire, "both cold
 * and fire". Graham: resistance and immunity "only come into play if the
 * target has both fire and cold"; weakness "should apply if the target has
 * either, although only apply once (not both)".
 *
 * An immunity covers its element for the resistance question: a creature
 * immune to fire and resistant to cold has something against both, so the
 * coldfire is resisted; immune to both, it is immune.
 *
 * @returns {{immune: boolean, resisted: boolean, weak: boolean}}
 */
function coldfireDefences({ resistances = [], immunities = [], weaknesses = [] } = {}) {
  const has = (collection, key) => (collection instanceof Set ? collection.has(key) : Array.from(collection ?? []).includes(key));
  const immune = has(immunities, "cold") && has(immunities, "fire");
  const covers = (el) => has(immunities, el) || has(resistances, el);
  return {
    immune,
    resisted: !immune && covers("cold") && covers("fire"),
    weak: has(weaknesses, "cold") || has(weaknesses, "fire")
  };
}

/**
 * Resolve one damage packet.
 *
 * @param {object} options
 * @param {number} options.amount Rolled damage.
 * @param {string} options.type Damage type key.
 * @param {number} [options.dr] Target's Damage Reduction (from equipped
 *   armour/shields — subject to drBypassed).
 * @param {boolean} [options.drBypassed] Critical struck an unarmoured
 *   location, so equipped-armour DR does not apply (Chapter 7, DR &
 *   Criticals) — a separate rule from Armour Rending/Penetrating.
 *   Does not affect naturalArmourDr — a creature's own hide/scales
 *   covers the whole body and isn't location-dependent the way a
 *   single piece of equipped armour is.
 * @param {number} [options.naturalArmourDr] Natural Armour's DR
 *   (Chapter 7), already reduced/bypassed by Armour Rending or
 *   Penetrating upstream if either applies (per Graham directly,
 *   both traits affect Natural Armour DR too, not just manufactured)
 *   — never bypassed by drBypassed specifically, since that's the
 *   unrelated unarmoured-location-critical rule.
 * @param {Set<string>|string[]} [options.resistances]
 * @param {Set<string>|string[]} [options.immunities]
 * @param {Set<string>|string[]} [options.weaknesses]
 * @param {string[]} [options.sourceTraits] Traits carried by whatever is
 *   dealing this damage. Immunity to a trait stops the damage as surely
 *   as immunity to its type: per Graham, immunity to Mental means "no
 *   damage from attacks with this damage type and immune to any effect
 *   which has the mental trait", and a Mental-traited effect that happens
 *   to deal fire damage is still an effect he is immune to.
 * @param {Set<string>|string[]} [options.immuneTraits]
 * @returns {{taken: number, drApplied: number, immune: boolean,
 *   resisted: boolean, weakened: boolean, nonlethal: boolean, steps: string[]}}
 */
export function resolveDamagePacket({
  amount,
  type,
  dr = 0,
  drBypassed = false,
  naturalArmourDr = 0,
  resistances = [],
  immunities = [],
  weaknesses = [],
  sourceTraits = [],
  immuneTraits = [],
  // WHAT THE DAMAGE CAME FROM, for the category and material rules added
  // at 3.547.0. `magical` is true for a spell or a weapon carrying a
  // Potency rune; `material` names the weapon's special material.
  resistanceCategories = [],
  weaknessMaterials = [],
  resistanceBypassMaterials = [],
  magical = false,
  material = "",
  /*
   * THE SHAPE OF THE INCOMING EFFECT (3.548.0).
   *
   * Graham's rulings, 10 Sep 2026: `area` is "any damage resulting from
   * a spell or effect with an area (such as fireball) rather than a
   * targeted effect"; `targeted` is "any attack that requires an attack
   * roll to hit (weapon or spell)".
   *
   * Both default false because an unspecified source is neither, and a
   * defence keyed on a fact nobody supplied must not fire. That is the
   * defaulting `magical` and `material` took at 3.547.0, for the same
   * reason: a rule that guesses is worse than one that waits.
   */
  area = false,
  targeted = false,
  resistanceSources = [],
  weaknessSources = [],
  // The traits of the effect that dealt the damage — how a `divinity`
  // weakness finds a divinity spell. `sourceTraits` already carried them
  // for the immunity check; these are the resistance and weakness ends
  // of the same question.
  resistanceTraits = [],
  weaknessTraits = [],
  // The types a blanket "all damage except X" resistance does NOT cover.
  resistanceExcept = [],
  /*
   * GHOST TOUCH (3.618.0, C6 of block 37): "The weapon affects incorporeal
   * creatures normally." Passed only when the target IS incorporeal, and it
   * strips exactly the two things the trait adds: the immunity to
   * non-magical attack forms, and the resistance to all damage.
   */
  incorporealTouch = false
} = {}) {
  const meta = DAMAGE_TYPES[type] ?? { label: type, dr: "full" };
  const has = (collection, key) =>
    collection instanceof Set ? collection.has(key) : collection.includes(key);

  const steps = [];
  let value = Math.max(0, Math.floor(Number(amount) || 0));
  steps.push(`${value} ${meta.label ?? type}`);

  // COLDFIRE: its cold and fire meet the target together, by the rule
  // above — not one at a time through the type or trait paths below, which
  // would let a fire immunity alone stop the Shade Dragon's breath.
  const coldfire = type === "coldfire" ? coldfireDefences({ resistances, immunities, weaknesses }) : null;
  if (coldfire) sourceTraits = Array.from(sourceTraits ?? []).filter((t) => !/^(cold|fire)$/i.test(String(t).trim()));
  const blockingTrait = immuneTraitFor(immuneTraits, sourceTraits);
  /*
   * IMMUNE TO NON-MAGICAL ATTACK FORMS (3.548.0).
   *
   * The Incorporeal trait's first clause, and until this release the
   * token it pushed — `IMMUNITY_TOKENS.nonMagical` — was read by nothing
   * at all. `codex-trait-rules.mjs` says its defences "are enforced the
   * moment this ships, by the same code that already enforces an Ooze's
   * critical immunity". Measured 10 Sep 2026: `critical` and `mental`
   * were; `non-magical`, `precision` and `movement-reaction` were not.
   * Three of the five immunities behind that sentence did nothing.
   *
   * It is one line here because `magical` already arrives — the fact the
   * rule needs was wired at 3.547.0 for a different rule entirely.
   */
  const nonMagicalImmune = has(immunities, "non-magical") && !magical && !incorporealTouch;
  if (has(immunities, type) || coldfire?.immune || blockingTrait || nonMagicalImmune) {
    steps.push(
      nonMagicalImmune && !has(immunities, type) && !blockingTrait
        ? "immune to non-magical attack forms — no damage"
        : blockingTrait && !has(immunities, type)
          ? `immune to the ${blockingTrait} trait — no damage`
          : coldfire?.immune && !has(immunities, type) ? "immune to cold and fire — no damage" : "immune — no damage"
    );
    return {
      taken: 0, drApplied: 0, immune: true, immuneTrait: blockingTrait ?? null,
      resisted: false, weakened: false, nonlethal: Boolean(meta.nonlethal), steps
    };
  }

  // Damage Reduction, scaled by the type's DR effectiveness. Equipped
  // armour's DR respects drBypassed (an unarmoured critical location
  // ignores it entirely); Natural Armour's DR (Chapter 7) does not —
  // it covers the whole creature, not a single equipped piece, so it
  // keeps applying even when a critical bypasses equipped armour.
  // The attacking weapon's special material, settled once: it decides
  // both a bracketed bypass below and the material weakness after it.
  const materialKey = String(material ?? "").trim().toLowerCase();
  // MORE THAN ONE MATERIAL (3.667.0): Powerful Fists' blows are "treated as
  // cold iron and silver", so the field may name several, comma-separated.
  const materialKeys = materialKey.split(",").map((m) => m.trim()).filter(Boolean);

  let drApplied = 0;
  // WHAT THE WORN ARMOUR ACTUALLY STOPPED (3.617.0, Graham's R17 of block
  // 37): the Bracers of Armour's HP pool "absorbs what the DR stops". The
  // equipped share is spent first — armour is the outer layer — and never
  // more than the damage that reached it.
  let equippedDrStopped = 0;
  const naturalPool = Math.max(0, Math.floor(Number(naturalArmourDr) || 0));
  const equippedPool = drBypassed ? 0 : Math.max(0, Math.floor(Number(dr) || 0));
  const pool = equippedPool + naturalPool;
  if (meta.dr !== "none") {
    drApplied = meta.dr === "half" ? Math.floor(pool / 2) : pool;
    if (drApplied) {
      const equippedShare = meta.dr === "half" ? Math.floor(equippedPool / 2) : equippedPool;
      equippedDrStopped = Math.min(Math.max(0, value), equippedShare);
      value = Math.max(0, value - drApplied);
      steps.push(
        `DR ${drApplied}${meta.dr === "half" ? " (halved vs energy)" : ""} -> ${value}`
      );
    }
    if (drBypassed) {
      steps.push(
        naturalPool
          ? "Equipped armour DR bypassed (unarmoured location) — Natural Armour still applies"
          : "DR bypassed (unarmoured location)"
      );
    }
  } else {
    steps.push("DR ineffective against this type");
  }

  /*
   * Weakness: +50%.
   *
   * A MATERIAL COUNTS AS A WEAKNESS (3.547.0). Graham's ruling, 10 Sep
   * 2026: a cold iron blade against a creature weak to cold iron uses
   * the same +50% step a damage-type weakness already uses, rather than
   * merely bypassing a resistance.
   *
   * Both ends of this were authored long before the middle existed:
   * `item-quality.mjs` gave Cold Iron and Silver an `overcomesResistance`
   * field nothing read, and 50 creatures declare a material weakness
   * that nothing applied.
   */
  const materialWeak = materialKeys.some((key) => has(weaknessMaterials, key));
  /*
   * A WEAKNESS MAY KEY ON THE SHAPE OR THE TRAIT OF THE EFFECT (3.548.0).
   *
   * "Weakness to area effects" is the Swarm's, and "Weakness to divine"
   * is what five undead write — Graham's ruling: damage from a divinity
   * spell. Both use the same +50% step, because the book states one
   * weakness rule and this is it applied to a different fact about the
   * attack, not a second mechanic.
   */
  const sourceWeak = (area && has(weaknessSources, "area"))
    || (targeted && has(weaknessSources, "targeted"));
  const traitWeak = traitMatch(weaknessTraits, sourceTraits);
  const weakened = has(weaknesses, type) || Boolean(coldfire?.weak) || materialWeak || sourceWeak || Boolean(traitWeak);
  if (weakened && value > 0) {
    value = Math.floor(value * 1.5);
    steps.push(traitWeak && !has(weaknesses, type) && !materialWeak && !sourceWeak
      ? `weakness to ${traitWeak} +50% -> ${value}`
      : coldfire?.weak && !has(weaknesses, type) ? `weakness to cold or fire +50% -> ${value}` : `weakness +50% -> ${value}`);
  }

  /*
   * Resistance: half, once, after everything else.
   *
   * A CATEGORY RESISTS BY SOURCE, NOT BY TYPE (3.547.0). "Mundane"
   * halves any damage that did not come from a spell or a runed weapon;
   * "magic" halves the damage that did. Twenty creatures declare the
   * first and eleven the second, and before this release both were
   * dropped in silence by the field parser.
   *
   * STILL HALVED ONCE. A packet that is both resisted by type and by
   * category is halved a single time — the book's word is "half", and
   * two halvings would quarter it.
   */
  /*
   * A MATERIAL IN BRACKETS OVERCOMES THE CATEGORY (3.547.1). Graham's
   * ruling, 10 Sep 2026: "mundane (silver)" is mundane resistance that a
   * silver weapon ignores entirely — the reading `item-quality.mjs` has
   * always implied with its `overcomesResistance` field, and distinct
   * from `weaknesses: silver`, which adds 50% instead. Both patterns are
   * in the template data, meaning different things.
   */
  const bypassed = materialKeys.some((key) => has(resistanceBypassMaterials, key));
  /*
   * "ALL DAMAGE EXCEPT ESSENCE OR FORCE" (3.548.0). The blanket
   * resistance stops covering the types the record names as exceptions —
   * the Human Ghost's shape, and the general form of the Incorporeal
   * trait's own "every type except force".
   */
  const excepted = has(resistanceExcept, type);
  const categoryResisted = !bypassed && !excepted && (
    (has(resistanceCategories, "mundane") && !magical)
    || (has(resistanceCategories, "magic") && Boolean(magical))
    // "All damage" resists every type at once, whatever the source —
    // except a Ghost Touch blow against the incorporeal (3.618.0).
    || (has(resistanceCategories, ALL_DAMAGE) && !incorporealTouch));
  /*
   * A RESISTANCE MAY KEY ON THE SHAPE OR THE TRAIT TOO (3.548.0) — the
   * Swarm's "Resistance to targeted attacks", carried as prose by
   * codex-trait-rules since it was written.
   */
  const sourceResisted = !bypassed && (
    (area && has(resistanceSources, "area"))
    || (targeted && has(resistanceSources, "targeted")));
  const traitResisted = !bypassed ? traitMatch(resistanceTraits, sourceTraits) : null;
  const resisted = has(resistances, type) || Boolean(coldfire?.resisted) || categoryResisted
    || sourceResisted || Boolean(traitResisted);
  if (resisted && value > 0) {
    value = Math.floor(value / 2);
    steps.push(
      sourceResisted && !has(resistances, type) && !categoryResisted
        ? `resistance to ${targeted && has(resistanceSources, "targeted") ? "targeted attacks" : "area effects"} halves -> ${value}`
        : traitResisted && !has(resistances, type) && !categoryResisted
          ? `resistance to ${traitResisted} halves -> ${value}`
          : categoryResisted && !has(resistances, type)
            ? `${magical ? "magic" : "mundane"} resistance halves -> ${value}`
            : coldfire?.resisted && !has(resistances, type) ? `resistance to cold and fire halves -> ${value}` : `resistance halves -> ${value}`);
  }

  return {
    taken: value,
    drApplied,
    equippedDrStopped,
    immune: false,
    immuneTrait: null,
    resisted,
    weakened,
    nonlethal: Boolean(meta.nonlethal),
    steps
  };
}

/*
 * A MULTI-PACKET AGGREGATOR USED TO LIVE HERE, and it was removed at
 * 3.364.0 rather than wired, because the rule it stated was the opposite
 * of the real one.
 *
 * It said: "The packet with the highest output is the primary damage; a
 * critical is inflicted only in the primary type unless an ability says
 * otherwise." Nothing called it, so nothing was wrong at the table — but
 * it read as the rule to anyone opening this file, and it would have made
 * a flaming sword's critical land as FIRE whenever the rune outdamaged
 * the blade.
 *
 * Graham's ruling, 22 August 2026: the general rule is that NO critical is
 * inflicted from secondary damage at all. The critical belongs to the
 * weapon's own damage, full stop. A secondary critical exists only where a
 * specific rune grants one — the Type II energy runes (Acidic, Flaming,
 * Frost, Shock, Thundering) and Disrupting — which is a named override of
 * the general rule, and is declared per tier in module/rune-damage.mjs
 * (`secondaryCritical`, null for every rune that does not grant one).
 *
 * That is exactly what attack-workflow.mjs already does: the critical
 * rolls on the weapon's own `effectiveDamageType`, and a rune adds its own
 * secondary critical only when its tier declares a modifier. The live code
 * was right and the doc comment was an interpretation, so what went was
 * the interpretation. See tools/verify-secondary-criticals.mjs.
 */
