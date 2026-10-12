/**
 * Underwater combat (Chapter 7, page 201) — the rules, pure.
 *
 * NEW at 3.580.0, for the block-20 audit's D2 and Graham's R2 of
 * 21 September 2026: "Yes."
 *
 * WHAT WAS WRONG. The whole rule was absent, and the system said so
 * itself: a comment beside the Submersible rune explains that the rune
 * "lifts an underwater attack penalty this system does not yet impose".
 *
 * HOW WATER IS DECLARED (R2). A Foundry Region carrying
 * `flags.trg-prime.underwater`, which is where difficult ground and
 * unusual surfaces already live, so a GM marks water the same way they
 * mark the other two. A Region merely NAMED for it counts, on the same
 * reasoning as `surfaces.mjs`: a GM who has drawn one and called it
 * "The flooded vault (underwater)" has said what they mean.
 *
 * THE PAGE, in its own words:
 *
 *   "You're flat-footed when fighting or moving in the water unless you
 *    have a swim Speed.
 *
 *    You gain acid and fire resistance.
 *
 *    You take a -2 circumstance penalty to melee slashing or
 *    bludgeoning attacks that pass-through water.
 *
 *    Ranged attacks that deal bludgeoning or slashing damage
 *    automatically miss if the attacker or target is underwater, and
 *    piercing ranged attacks made by an underwater creature or against
 *    an underwater target have their range increments halved.
 *
 *    Any attempt to use a fire spell underwater results in a failure.
 *    Furthermore, actions with the fire trait also fail automatically.
 *
 *    Any spells or electricity abilities used underwater immediately
 *    have radius equal to the normal range of the spell emanating from
 *    their originator or caster. The creator of such an effect always
 *    takes double damage from the effect.
 *
 *    Some ground-based actions might not work underwater or while
 *    floating (GM discretion)."
 */

/** The flag a Region carries. */
const UNDERWATER_FLAG = "underwater";

/** A Region whose name says so, for a GM who typed rather than flagged. */
const NAMED = /\b(underwater|submerged)\b/i;

/** "You gain acid and fire resistance." */
export const UNDERWATER_RESISTANCES = Object.freeze(["acid", "fire"]);

/** The melee penalty, and the two types that pay it. */
export const UNDERWATER_MELEE_PENALTY = -2;
export const UNDERWATER_PENALISED_MELEE = Object.freeze(["slashing", "bludgeoning"]);

/** The two types a ranged attack cannot deliver through water at all. */
export const UNDERWATER_BLOCKED_RANGED = Object.freeze(["bludgeoning", "slashing"]);

/**
 * Does this Region declare water?
 *
 * @param {object} region a RegionDocument, or anything with name and flags
 * @returns {{label: string}|null}
 */
export function underwaterRegion(region) {
  if (!region) return null;
  const raw = region?.flags?.["trg-prime"]?.[UNDERWATER_FLAG] ?? null;
  const named = NAMED.test(String(region?.name ?? ""));
  if (!raw && !named) return null;
  const spec = raw && typeof raw === "object" ? raw : {};
  return { label: String(spec.label ?? region?.name ?? "").trim() || "water" };
}

/**
 * "You're flat-footed when fighting or moving in the water unless you
 * have a swim Speed."
 *
 * @param {object} state
 * @param {boolean} state.underwater
 * @param {number} [state.swimSpeed]
 * @returns {boolean}
 */
export function underwaterFlatFooted({ underwater = false, swimSpeed = 0 } = {}) {
  if (!underwater) return false;
  return !(Number(swimSpeed) > 0);
}

/**
 * "You take a -2 circumstance penalty to melee slashing or bludgeoning
 * attacks that pass-through water."
 *
 * THE BLOW PASSES THROUGH WATER if either end of it is in the water —
 * a swimmer struck from the bank and a swimmer striking the bank are
 * both swinging through it. Piercing is exempt, which is the point of
 * the sentence naming two types out of three.
 *
 * @param {object} state
 * @param {boolean} [state.attackerUnderwater]
 * @param {boolean} [state.targetUnderwater]
 * @param {string} [state.damageType]
 * @returns {number} 0 or -2
 */
export function underwaterMeleePenalty({
  attackerUnderwater = false, targetUnderwater = false, damageType = ""
} = {}) {
  if (!attackerUnderwater && !targetUnderwater) return 0;
  const type = String(damageType).trim().toLowerCase();
  return UNDERWATER_PENALISED_MELEE.includes(type) ? UNDERWATER_MELEE_PENALTY : 0;
}

/**
 * "Ranged attacks that deal bludgeoning or slashing damage
 * automatically miss if the attacker or target is underwater, and
 * piercing ranged attacks made by an underwater creature or against an
 * underwater target have their range increments halved."
 *
 * @param {object} state
 * @param {boolean} [state.attackerUnderwater]
 * @param {boolean} [state.targetUnderwater]
 * @param {string} [state.damageType]
 * @returns {{automaticMiss: boolean, rangeIncrementFactor: number, note: string}}
 */
export function underwaterRangedOutcome({
  attackerUnderwater = false, targetUnderwater = false, damageType = ""
} = {}) {
  const involved = attackerUnderwater || targetUnderwater;
  if (!involved) return { automaticMiss: false, rangeIncrementFactor: 1, note: "" };
  const type = String(damageType).trim().toLowerCase();
  if (UNDERWATER_BLOCKED_RANGED.includes(type)) {
    return {
      automaticMiss: true,
      rangeIncrementFactor: 1,
      note: "a ranged attack dealing bludgeoning or slashing damage automatically misses through water"
    };
  }
  if (type === "piercing") {
    return {
      automaticMiss: false,
      rangeIncrementFactor: 0.5,
      note: "a piercing ranged attack has its range increments halved through water"
    };
  }
  return { automaticMiss: false, rangeIncrementFactor: 1, note: "" };
}

/**
 * "Any attempt to use a fire spell underwater results in a failure.
 * Furthermore, actions with the fire trait also fail automatically."
 *
 * TWO SENTENCES, TWO TESTS — a spell that DEALS fire, and anything
 * carrying the fire TRAIT. Either is enough.
 *
 * @param {object} state
 * @param {boolean} [state.underwater]
 * @param {string} [state.damageType]
 * @param {string} [state.traits]
 * @returns {boolean}
 */
export function underwaterFireFails({ underwater = false, damageType = "", traits = "" } = {}) {
  if (!underwater) return false;
  if (String(damageType).trim().toLowerCase() === "fire") return true;
  return /(^|[,\s])fire([,\s]|$)/i.test(String(traits ?? ""));
}

/**
 * "Any spells or electricity abilities used underwater immediately have
 * radius equal to the normal range of the spell emanating from their
 * originator or caster. The creator of such an effect always takes
 * double damage from the effect."
 *
 * THE RANGE BECOMES THE RADIUS. Not the area — the RANGE, which is what
 * makes this frightening: a 60-foot lightning bolt becomes a 60-foot
 * ball centred on the person who cast it, and they are in it.
 *
 * @param {object} state
 * @param {boolean} [state.underwater]
 * @param {string} [state.damageType]
 * @param {number} [state.rangeFeet] the spell's normal range
 * @returns {{applies: boolean, radiusFeet: number, creatorTakesDouble: boolean}}
 */
export function underwaterElectricity({ underwater = false, damageType = "", traits = "" } = {}) {
  const applies = Boolean(underwater)
    && (String(damageType).trim().toLowerCase() === "electricity"
      || /(^|,)\s*electricity\s*(,|$)/i.test(String(traits ?? "")));
  // THE ELECTRICITY TRAIT'S OWN SHAPE (3.622.0; block 39's R8, Graham's
  // "your recommendation"): "the range becomes Personal and the Area becomes
  // an explosive sphere with a 10' radius. Everyone in the area suffers the
  // effect, including the caster." The trait defines the spell, so its
  // 10-foot sphere replaces page 201's range-as-radius; page 201's "the
  // creator … always takes double damage" is kept beside it, as additional.
  return {
    applies,
    radiusFeet: applies ? 10 : 0,
    personal: applies,
    includesCaster: applies,
    creatorTakesDouble: applies
  };
}

/**
 * "Some ground-based actions might not work underwater or while
 * floating (GM discretion)."
 *
 * OFFERED, NOT REFUSED — the same shape the unusual-surface note takes,
 * and for the same reason: the page hands the decision to the GM, so
 * the card carries the sentence and the call stays at the table.
 *
 * @param {object} state
 * @param {boolean} [state.underwater]
 * @param {string} [state.actionName]
 * @returns {string}
 */
export function underwaterGroundActionNote({ underwater = false, actionName = "" } = {}) {
  if (!underwater || !actionName) return "";
  return `<strong>${actionName} underwater.</strong> Page 201: some ground-based actions `
    + "might not work underwater or while floating — the GM's call.";
}

/**
 * WHAT AQUATIC AND SUBMERSIBLE LIFT (3.632.0; Fiends & Fables 3.0 block 2,
 * ruling 6). Aquatic: "Their Strikes with bludgeoning and slashing attacks do
 * not incur the usual –2 penalty for being submerged." Submersible: "You
 * ignore the usual attack penalties and limitations associated with
 * underwater combat when wielding it. If the weapon can deal fire damage, the
 * flames remain active even while submerged." Submersible is a melee rune, so
 * the ranged limitations never reach it.
 *
 * @returns {{meleePenalty: boolean, fireFails: boolean}} true = lifted
 */
export function underwaterStrikeExemption({ aquaticAttacker = false, submersibleWeapon = false, marauder = false } = {}) {
  return {
    // UNDERWATER MARAUDER (Chapter 5, general): "you ignore attack penalties
    // when fighting" — the same −2, lifted by the feat (3.632.0, the feat
    // the 131–140 audit's K39 kept waiting for this rail).
    meleePenalty: Boolean(aquaticAttacker || submersibleWeapon || marauder),
    fireFails: Boolean(submersibleWeapon)
  };
}

/** Underwater Marauder: "You are not flat-footed whilst in water." */
export const UNDERWATER_MARAUDER = "Underwater Marauder";

/**
 * Crossing the waterline: does the creature start holding its breath, or get
 * its air back? An Aquatic creature "can breathe water but [is] unable to
 * breathe air" — the rail inverted for it.
 *
 * @returns {"hold"|"restore"}
 */
export function breathOnWaterline({ entering = false, aquatic = false } = {}) {
  return Boolean(entering) !== Boolean(aquatic) ? "hold" : "restore";
}
