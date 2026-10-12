/**
 * What a Creature Codex ability derives.
 *
 * Two of the chapter's abilities do something the system already knows
 * how to do — but only from a creature TYPE. An Ooze cannot be flanked
 * because its type says so; a Construct has natural DR because its type
 * says so. All Round Vision and Survival Instinct grant the same two
 * things from an ABILITY, which any creature of any type can carry.
 *
 * So rather than a second flanking rule and a second DR rule, this reads
 * the same facts from a second place, and the two call sites — the
 * attack workflow's flanking gate and the actor's DR pool — ask both.
 *
 * Deliberately pure and Foundry-free: it takes plain item arrays, so
 * every rule below can be run in a harness rather than read back.
 */

const SYSTEM_ID = "trg-prime";

/**
 * The derivation block an ability may carry.
 *
 * Written by tools/build-creature-abilities.mjs from the page, never by
 * hand, and deliberately small: an ability either declares one of these
 * exact keys or derives nothing. There is no free-text rule here for the
 * engine to interpret, because a rule the engine half-understands is
 * worse than one it plainly leaves to the GM.
 */
export function derivationOf(item) {
  const d = item?.flags?.[SYSTEM_ID]?.creatureAbility?.derives;
  return d && typeof d === "object" ? d : null;
}

/**
 * All Round Vision — "The creatures vision allows it to see in 360
 * degrees. This makes the creature immune to being flanked."
 *
 * The same answer the Ooze's type gives, from an ability.
 */
export function abilitiesPreventFlanking(items = []) {
  return (items ?? []).some((i) => derivationOf(i)?.cannotBeFlanked === true);
}

/**
 * Survival Instinct — "gains a bonus to its Natural DR equal to its
 * level."
 *
 * Returns the bonus, not the total. Level is the creature's, and a
 * missing or nonsense level yields 0 rather than NaN, which would
 * otherwise poison the DR pool downstream and be very hard to trace.
 *
 * The page adds "This ability may not work under certain circumstances
 * (such as an eternal on its native plane)" — a GM judgement with no
 * stated trigger, so it is left to the GM and said so on the item.
 */
export function abilityNaturalDR(items = [], level = 0) {
  const perLevel = (items ?? []).reduce(
    (sum, i) => sum + (Number(derivationOf(i)?.naturalDRPerLevel) || 0),
    0
  );
  if (!perLevel) return 0;
  const lvl = Number(level);
  if (!Number.isFinite(lvl) || lvl <= 0) return 0;
  return Math.floor(perLevel * lvl);
}

/*
 * ───────────────────────────────────────────────────────────────────────
 * THE 3.631.0 DERIVES (Fiends & Fables 3.0 block 1, Chapter 2; Graham's
 * ruling of 9 October 2026: "all automated"). Each is one Codex sentence,
 * declared on the entry and read where the rule lives:
 *
 *   hover               "does not have to expend an AP to remain in the
 *                        air" — fly.mjs fallsAtTurnEnd       (Hover, Wingless Flight)
 *   apPenalty: 1        "Slow (I) reduces the creature's AP by 1"
 *                        — documents/combat.mjs AP regain     (Slow)
 *   noMovementProvoke   "does not provoke reactions caused by movement"
 *                        — movement-workflow.mjs               (Elusive Movement;
 *                        { fullMoveOnly: true } for Smoke Form)
 *   breathMultiplier    "hold its breath for 10 x the normal amount"
 *                        — drowning                           (Hold Breath)
 *   noArmourPenalties   "suffers no adverse effects from armour or shields
 *                        such as ACP, Max Dex or Speed Penalty" (Eternal Essence)
 *   fumbleDCAll: -1     "lowers all FDC by 1"                 (Eternal Essence)
 *   healsFromDamage     "fire damage heals the creature … half that taken"
 *                        — damage-workflow.mjs                (Fire Healing)
 *   gallop: 10          "+10 feet for each" of two consecutive Strides (Gallop)
 *   vorpalWeapons       "melee weapons have the Vorpal trait" — codex-runes (Vorpal Weapons)
 *   elementalStrikes    "+1d6 secondary elemental damage" on physical attacks
 *                        — strike riders                      (Elemental Strikes)
 *   penetratingStrikes  "treat all DR as half"               (Penetrating Strikes;
 *                        the attacks carry the trait)
 *   packAttack          — combat/pack-attack.mjs              (Pack Attack)
 *   mapExempt: ["grapple"] no MAP on those actions           (Monstrous Grab / Knockdown)
 *   regeneration.auto   the heal applied, with the lockout   (Regeneration)
 */

/** The merged derives of every ability the creature holds. */
export function abilityDerives(items = []) {
  const out = [];
  for (const i of items ?? []) { const d = derivationOf(i); if (d) out.push({ item: i, derives: d }); }
  return out;
}

/** Hover: the creature never falls for want of a Fly action. */
export function abilitiesHover(items = []) {
  return abilityDerives(items).some(({ derives }) => derives.hover === true);
}

/** Slow (I) / (II): the AP it regains each turn is this much lower. */
export function abilityApPenalty(items = []) {
  return abilityDerives(items).reduce((sum, { derives }) => sum + Math.max(0, Math.floor(Number(derives.apPenalty) || 0)), 0);
}

/**
 * Elusive Movement, Smoke Form: whether THIS move is exempt from reactions.
 * @param {{movedFeet?: number, speedFeet?: number}} move
 */
export function movementProvokeExempt(items = [], { movedFeet = 0, speedFeet = 0 } = {}) {
  for (const { derives } of abilityDerives(items)) {
    const rule = derives.noMovementProvoke;
    if (rule === true) return true;
    if (rule && typeof rule === "object" && rule.fullMoveOnly === true) {
      if (speedFeet > 0 && Number(movedFeet) >= speedFeet) return true;
    }
  }
  return false;
}

/** Hold Breath: the multiplier on how long it can go without air (1 = none). */
export function abilityBreathMultiplier(items = []) {
  return abilityDerives(items).reduce((best, { derives }) => Math.max(best, Number(derives.breathMultiplier) || 1), 1);
}

/** Eternal Essence: no ACP, Max Dex or Speed penalty from armour or shields. */
export function abilitiesIgnoreArmourPenalties(items = []) {
  return abilityDerives(items).some(({ derives }) => derives.noArmourPenalties === true);
}

/** Eternal Essence: every Fumble DC moves by this (−1). */
export function abilityFumbleDCShift(items = []) {
  return abilityDerives(items).reduce((sum, { derives }) => sum + (Math.trunc(Number(derives.fumbleDCAll)) || 0), 0);
}

/**
 * Fire Healing: damage of a type that heals instead. `{ type, fraction }`
 * for the type, or null. "Based upon the fire damage a creature would have
 * taken before immunity and resistance" — so the caller asks before the
 * defences reduce it.
 */
export function healsFromDamage(items = [], damageType = "") {
  const type = String(damageType ?? "").trim().toLowerCase();
  for (const { derives } of abilityDerives(items)) {
    const rule = derives.healsFromDamage;
    if (rule && typeof rule === "object" && String(rule.type ?? "").toLowerCase() === type) {
      return { type, fraction: Math.max(0, Math.min(1, Number(rule.fraction) || 0.5)) };
    }
  }
  return null;
}

/** Gallop: the feet each of two consecutive Strides gains, or 0. */
export function abilityGallop(items = []) {
  return abilityDerives(items).reduce((best, { derives }) => Math.max(best, Number(derives.gallop) || 0), 0);
}

/** Vorpal Weapons: every melee weapon counts as Vorpal. */
export function abilitiesVorpalWeapons(items = []) {
  return abilityDerives(items).some(({ derives }) => derives.vorpalWeapons === true);
}

/** Monstrous Grab / Knockdown: actions this creature takes with no multiple attack penalty. */
export function abilityMapExemptActions(items = []) {
  const out = new Set();
  for (const { derives } of abilityDerives(items)) {
    for (const key of Array.isArray(derives.mapExempt) ? derives.mapExempt : []) out.add(String(key).trim().toLowerCase());
  }
  return out;
}

/**
 * Elemental Strikes: the secondary die every physical attack gains, and
 * the element — from the entry's own name ("Fiery Strikes" is fire) or a
 * declared type. `{ dice, type }` or null.
 */
export function abilityElementalStrikes(items = []) {
  for (const { item, derives } of abilityDerives(items)) {
    const rule = derives.elementalStrikes;
    if (!rule) continue;
    const type = String(rule.type ?? elementOfName(item?.name) ?? "").toLowerCase();
    if (!type) continue;
    return { dice: String(rule.dice ?? "1d6"), type, doubles: rule.doublesExisting !== false };
  }
  return null;
}

/** The element an elemental ability's own name carries, or "". */
export function elementOfName(name) {
  const n = String(name ?? "").toLowerCase();
  if (/\bcaustic\b/.test(n)) return "acid";
  if (/\bfiery\b/.test(n)) return "fire";
  if (/\bfreezing\b/.test(n)) return "cold";
  if (/\bshocking\b/.test(n)) return "electricity";
  if (/\btoxic\b/.test(n)) return "poison";
  return "";
}

/** Regeneration that applies itself: `{ auto: true }` on the turn-start derive. */
export function regenerationIsAutomatic(items = []) {
  return (items ?? []).some((i) => {
    const t = derivationOf(i)?.turnStart;
    return t && t.kind === "regeneration" && t.auto === true;
  });
}

/**
 * "If a creature takes damage of an amount equal to or greater than its
 * regeneration in a given round, its regeneration is disabled for 1 turn."
 * @param {number} damageLastRound what it took since its last turn
 * @param {number} amount its regeneration (= level)
 */
export function regenerationLockedOut(damageLastRound, amount) {
  const dmg = Math.max(0, Number(damageLastRound) || 0);
  const regen = Math.max(0, Number(amount) || 0);
  return regen > 0 && dmg >= regen;
}

/**
 * Fearful Strength: skills whose ability score may be swapped for another
 * when it is higher — `derives.skillAbilitySwap: { skill, ability }`.
 * @returns {Map<string, string>} skill key → ability key
 */
export function abilitySkillSwaps(items = []) {
  const out = new Map();
  for (const { derives } of abilityDerives(items)) {
    const rule = derives.skillAbilitySwap;
    const rows = Array.isArray(rule) ? rule : rule ? [rule] : [];
    for (const row of rows) {
      if (row?.skill && row?.ability) out.set(String(row.skill).trim(), String(row.ability).trim().toLowerCase());
    }
  }
  return out;
}

/**
 * Draconic Shifting (and any form that makes a creature's strikes unarmed
 * subdual): a toggled ability whose `derives.strikesSubdual` is on while
 * the item is active. Read by the attack path as a damage type override.
 */
export function strikesAreSubdual(items = []) {
  return abilityDerives(items).some(({ item, derives }) => derives.strikesSubdual === true && item?.system?.active !== false && item?.flags?.["trg-prime"]?.shifted === true);
}

/**
 * Plant Resistance: of a critical's condition tags, those a plant suffers —
 * bleed and recurring damage — and those left to the GM's anatomy call.
 * The HP damage itself is never filtered here; it is the strike's.
 */
export function plantResistanceSplit(tags = []) {
  const keep = []; const gm = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    const key = String(tag?.key ?? "").toLowerCase();
    if (key === "bleeding" || /^recurring/.test(key) || tag?.recurring) keep.push(tag);
    else gm.push(tag);
  }
  return { keep, gm };
}

/** Whether a creature has Plant Resistance (declared `derives.plantResistance`). */
export function hasPlantResistance(items = []) {
  return abilityDerives(items).some(({ derives }) => derives.plantResistance === true);
}

/**
 * Spell Resilience: "a racial bonus equal to its class bonus to all saving
 * throws and DB against magical attacks" — the modifier row for a spell's
 * save or attack against this creature, or none.
 */
export function spellResilienceModifiers(actor) {
  const items = Array.from(actor?.items ?? []);
  if (!abilityDerives(items).some(({ derives }) => derives.spellResilience === true)) return [];
  const value = Math.max(0, Math.floor(Number(actor?.system?.identity?.classBonus ?? 0) || 0));
  return value ? [{ label: "Spell Resilience", value, type: "race" }] : [];
}

/**
 * The casting derives a creature carries (Arcadian Caster, True Caster):
 *   castNoProvoke   "does not provoke reactions" when casting
 *   specialistAll   "casts all spells as if they were Specialist"
 *   traditions      the traditions it may learn from — ["arcane", "ethereal"]
 *                   (Arcadian), or "any" (True Caster); cast as its own
 */
export function castingDerives(items = []) {
  const out = { castNoProvoke: false, specialistAll: false, traditions: null };
  for (const { derives } of abilityDerives(items)) {
    if (derives.castNoProvoke === true) out.castNoProvoke = true;
    if (derives.specialistAll === true) out.specialistAll = true;
    if (derives.learnTraditions) out.traditions = derives.learnTraditions === "any" ? "any" : (Array.isArray(derives.learnTraditions) ? derives.learnTraditions.map((t) => String(t).toLowerCase()) : null);
  }
  return out;
}

