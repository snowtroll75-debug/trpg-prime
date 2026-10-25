/**
 * Feat picks by level (Chapter 5, Feat Categories). Pure logic only.
 *
 * Archetype feats draw from the same pool as Class feats ("Archetype
 * feats are a special type of class feat and may be selected only with
 * class feat picks") — there is no separate archetype allowance to
 * compute, only Racial, Class, and General.
 *
 * The Class and General formulas are verified against Chapter 1's own
 * Level Table (its "Class Feats"/"General Feats" columns) rather than
 * derived solely from Chapter 5's prose, so they match the table exactly
 * across all 20 levels, not just the stated progression rule.
 */
import { registeredArchetype, registeredFeatPickBonuses, registeredHeritageRaceGrant, registeredSkillSubstitution } from "./module-api.mjs";

/** "1st level, 5th level and then every 5 levels thereafter." */
export function racialFeatPicks(level) {
  const lvl = Math.max(0, Number(level) || 0);
  return 1 + Math.floor(lvl / 5);
}

/** "1 at 1st level. At 2nd level and then every 2 levels thereafter." */
export function classFeatPicks(level) {
  const lvl = Math.max(0, Number(level) || 0);
  return 1 + Math.floor(lvl / 2);
}

/** "1 at 1st level. At 3rd level and then every 2 levels thereafter." */
export function generalFeatPicks(level) {
  const lvl = Math.max(0, Number(level) || 0);
  return 1 + Math.floor(Math.max(0, lvl - 1) / 2);
}

/** All three pick counts together, for the sheet's reference banner. */
/**
 * The whole feat budget — spent and available, for all three groups.
 *
 * Extracted from the sheet and EXPORTED so the harness can run it. It
 * lived inline in `_prepareContext` and was checked with regexes over
 * that file, and the same bug got through twice:
 *
 *   3.207.0 announced that class-granted feats no longer spend a pick.
 *   The filter read `item.flags` off view-model ROWS, which have never
 *   carried a `flags` key — so it was always undefined, the filter kept
 *   every feat, and a 1st-level Druid still read 2 of 1. The harness
 *   check asserted the exact broken expression.
 *
 *   3.210.1 then charged every character for the bonus feat their
 *   BACKGROUND gives them, because only the class group filtered at
 *   all. Reported live.
 *
 * A regex over a sheet cannot tell a working filter from a broken one.
 * Running it can.
 *
 * @param {object} options
 * @param {{racial: object[], classFeats: object[], archetypeFeats: object[], generalFeats: object[]}} options.groups
 *   The sheet's row groups. Each row carries `bonusFeat`.
 * @param {number} options.level
 * @param {string[]} options.featNames Feat and ability names, for the
 *   allowances Ambitious and the Human Bonus Feat raise.
 * @param {number} options.classBonusFeats The class table's Bonus Feats
 *   column at this level — additional to the Level Table's allowance.
 * @param {{general: number, racial: number, class: number}} [options.endeavourFeats]
 *   Flat, one-time picks bought with Endeavour (module/endeavour.mjs) —
 *   same shape as classBonusFeats: additional to the Level Table's
 *   allowance, not multiplied by anything.
 */
/**
 * Every item whose grants cost the character nothing.
 *
 * WHY A CLOSURE AND NOT A LIST OF TYPES
 *
 * The sheet used to seed this with the foundation items alone — class,
 * race, heritage, background, origin, divine aspect, wizard school,
 * creature type — and ask whether a feat's `grantedBy.sourceId` was one
 * of them. That misses anything handed over ONE STEP FURTHER DOWN.
 *
 * Reported live by Graham, 12 Aug 2026: the Cleric and the Rogue were
 * charging a class pick for their own archetype. The chain is
 *
 *     Cleric (class) → Priestly Path (class ability)  → War Priest
 *     Rogue  (class) → Archetypal Path (class ability) → Assassin
 *
 * The archetype feat is granted by the ABILITY, and an ability is not a
 * foundation item, so the feat read as paid. Nick's sheet showed the
 * consequence plainly — "Class: 3 spent / 2 available", over budget on a
 * character who had chosen two class feats and been charged for three.
 *
 * Adding "ability" to the seed list would have fixed those two cases and
 * left the next link unfixed. What is actually true is transitive: a
 * feat granted by something you did not pay for is itself free, however
 * many steps back the chain goes. So the set is closed over
 * `grantedBy.sourceId` until it stops growing.
 *
 * Pure, and takes plain rows rather than documents, so the harness can
 * build a three-deep chain without a world.
 *
 * @param {Array<{id: string, type: string, flags?: object}>} items
 * @param {string[]} seedTypes Item types that are free by their nature.
 * @param {string} [systemId]
 * @returns {Set<string>} ids whose grants spend nothing
 */
export function freeGrantSources(items = [], seedTypes = [], systemId = "trg-prime") {
  const all = Array.from(items ?? []).filter(Boolean);
  const free = new Set(
    all.filter((i) => seedTypes.includes(String(i?.type ?? ""))).map((i) => i.id)
  );
  // Iterate to a fixed point. Bounded by the item count, so a circular
  // grantedBy chain — which nothing should produce, but a hand-edited
  // world could — terminates instead of spinning.
  for (let pass = 0; pass < all.length; pass += 1) {
    let grew = false;
    for (const item of all) {
      if (free.has(item.id)) continue;
      const from = item?.flags?.[systemId]?.grantedBy?.sourceId;
      if (from && free.has(from)) { free.add(item.id); grew = true; }
    }
    if (!grew) break;
  }
  return free;
}

export function featBudget({
  groups = {}, level = 0, featNames = [], classBonusFeats = 0, endeavourFeats = null, extraPicks = []
} = {}) {
  const available = featPicksByLevel(level);
  const bonuses = featPickBonuses(featNames);
  const endeavour = {
    racial: Number(endeavourFeats?.racial) || 0,
    class: Number(endeavourFeats?.class) || 0,
    general: Number(endeavourFeats?.general) || 0
  };
  // Picks a module's campaign option grants (3.630.0, registerFeatPickBonus).
  const extra = { racial: 0, class: 0, general: 0, archetype: 0 };
  const extraLabels = [];
  for (const row of Array.isArray(extraPicks) ? extraPicks : []) {
    if (!row || typeof row !== "object") continue;
    let any = false;
    for (const k of Object.keys(extra)) {
      const n = Math.max(0, Math.trunc(Number(row[k]) || 0));
      extra[k] += n;
      if (n) any = true;
    }
    if (any && row.label) extraLabels.push(String(row.label));
  }
  // A feat a FOUNDATION item handed over — your class, background, race
  // or heritage — is a bonus feat and spends nothing. The same test in
  // all three groups, because the grants do not respect the grouping:
  // 36 of the 37 feats a background gives are General-category, but the
  // Miner's Favoured Terrain is Class.
  const paid = (rows = []) => rows.filter((row) => !row?.bonusFeat).length;
  // An Archetype-only pick (the Undead Lords campaign's bonus feat) is
  // spent first by Archetype feats; any more of them draw on Class picks.
  const archetypePaid = paid(groups.archetypeFeats);
  const archetypeSpent = Math.min(archetypePaid, extra.archetype);
  const out = {
    racial: {
      spent: paid(groups.racialFeats),
      available: available.racial + bonuses.racial + endeavour.racial + extra.racial
    },
    class: {
      spent: paid(groups.classFeats) + (archetypePaid - archetypeSpent),
      available: available.class + bonuses.class + (Number(classBonusFeats) || 0) + endeavour.class + extra.class
    },
    general: {
      spent: paid(groups.generalFeats),
      available: available.general + bonuses.general + endeavour.general + extra.general
    }
  };
  if (extra.archetype > 0) out.archetype = { spent: archetypeSpent, available: extra.archetype };
  if (extraLabels.length) out.extraLabels = extraLabels;
  return out;
}

/**
 * Every extra pick the registered modules grant this actor (3.630.0). A
 * module's function that throws is skipped, never the banner.
 */
export function registeredFeatPicks(actor) {
  const rows = [];
  for (const picks of registeredFeatPickBonuses()) {
    try {
      const row = picks(actor);
      if (row && typeof row === "object") rows.push(row);
    } catch (err) {
      console.warn("TRG Prime | a module's feat-pick bonus failed", err);
    }
  }
  return rows;
}

/**
 * The feat groups a companion's picks can land in.
 *
 * All four, because a companion's feats have no category. The nineteen
 * Companion-trait feats are authored with ordinary categories (most are
 * Class), and a GM is free to hand one a General feat as well — so the
 * pool is charged for whatever is on the sheet rather than for one
 * favoured group.
 */
export const COMPANION_FEAT_GROUPS = Object.freeze([
  "racialFeats", "classFeats", "archetypeFeats", "generalFeats"
]);

/**
 * An animal companion's feat budget: ONE pool, not three.
 *
 * The Animal Companion table prints a single "Feats" column — 1 at 1st
 * rising to 10 at 20th — and that column is the whole allowance, not an
 * addition to anything. A companion has no Chapter 1 Level Table entry
 * to draw Racial, Class and General picks from; it is not a character.
 *
 * WHY THIS IS A SEPARATE FUNCTION rather than a flag on `featBudget`.
 * Because the two share no arithmetic at all: `featBudget` sums three
 * level formulas, two allowance-raising feat registries and the
 * Endeavour purchases, and a companion has none of those. Threading a
 * `singlePool` flag through it would mean four dead parameters and a
 * branch that skips most of the body — the shape that invites someone to
 * "simplify" the two back together later.
 *
 * Found live at 3.233.2: an 8th-level companion's sheet read
 * "Racial 0/2, Class 0/9, General 0/4" — fifteen picks where the table
 * grants four. `system.progression.bonusFeats` was already correct and
 * already on the actor; nothing was reading it for this actor type.
 *
 * @param {object} options
 * @param {object} options.groups The sheet's row groups, as featBudget takes.
 * @param {number} options.bonusFeats The table's Feats column at this
 *   level — `system.progression.bonusFeats`.
 * @returns {{single: {spent: number, available: number}}}
 */
export function companionFeatBudget({ groups = {}, bonusFeats = 0 } = {}) {
  // The same granted-feats-are-free rule characters get: Evasion and
  // Improved Evasion arrive from the Animal Companion class itself, and
  // charging the companion a pick for a feature it cannot decline would
  // eat two of its ten.
  const paid = (rows = []) => rows.filter((row) => !row?.bonusFeat).length;
  const spent = COMPANION_FEAT_GROUPS.reduce(
    (total, key) => total + paid(groups[key]), 0
  );
  return {
    single: {
      spent,
      available: Math.max(0, Math.floor(Number(bonusFeats) || 0))
    }
  };
}

export function featPicksByLevel(level) {
  return {
    racial: racialFeatPicks(level),
    class: classFeatPicks(level),
    general: generalFeatPicks(level)
  };
}

/**
 * Feats that change the pick allowances themselves (Chapter 5).
 * Ambitious: "You gain any one class feat" — an extra class feat pick,
 * not a picked feat that consumes one.
 * Keyed by normalised feat name; later batches extend this map.
 */
export const FEAT_PICK_BONUSES = Object.freeze({
  ambitious: Object.freeze({ class: 1 }),
  // General feat (Chapter 5): "You can select any one Class Feat for which
  // you meet the pre-requisites" — an extra class feat pick, like Ambitious.
  "class training": Object.freeze({ class: 1 }),
  // General feat (Chapter 5): "You can select any one Metamagic (Class)
  // feat" — an extra class pick; the metamagic-only restriction (and the
  // no-class-trait rule) rides on the feat's note, adjudicated when picking.
  "metamagic training": Object.freeze({ class: 1 }),
  // Human racial ability (Chapter 2): "an additional racial feat and an
  // additional general feat at 1st level."
  "bonus feat": Object.freeze({ racial: 1, general: 1 }),
  // Human racial feat (Chapter 5): "you gain a general feat."
  "general versatility": Object.freeze({ general: 1 })
});

/**
 * Abilities and feats that grant extra SKILL POINTS PER LEVEL.
 *
 * The Human's Skilled: "Your ingenuity grants you an additional skill
 * point each level." It is the only one in the book today, and it was
 * doing nothing at all — the budget was the class's printed figure plus
 * Intelligence and had no term for anything else, so a Human read the
 * same number of points a level as everybody else. Reported live by
 * Graham at 3.211.0.
 *
 * A registry rather than a special case, for the same reason
 * FEAT_PICK_BONUSES is one: the next source of skill points should be a
 * line of data, not a change to the derivation.
 *
 * Keyed by normalised item name → points per level.
 */
export const SKILL_POINT_BONUSES = Object.freeze({
  skilled: 1
});

/**
 * The extra skill points per level an actor's abilities and feats grant.
 *
 * @param {string[]} names Ability and feat item names.
 */
export function skillPointBonuses(names = []) {
  let total = 0;
  // DEDUPED by name. Two copies of Skilled on one sheet is not two extra
  // skill points a level — it is the same racial ability written down
  // twice. The grant path will not create the second, but a manual drag
  // from the compendium will.
  for (const name of new Set(names.map((n) => String(n ?? "").trim().toLowerCase()))) {
    // `Object.hasOwn`, not a bare lookup: an item named "constructor"
    // otherwise reached Object.prototype and made the bonus a function,
    // which is truthy — the sheet then printed
    // "including +0function Object() { [native code] } from constructor".
    if (Object.hasOwn(SKILL_POINT_BONUSES, name)) total += SKILL_POINT_BONUSES[name];
  }
  return total;
}

/**
 * Feats that lengthen the fixed distance of an armed movement action.
 * Graceful Step (Graham's ruling): one Step covers 10 ft for 1 AP rather
 * than 5 — modelled as a bigger Step, not two Steps.
 * Keyed by normalised feat name → { action, bonus (feet) }.
 */
export const MOVEMENT_LIMIT_FEATS = Object.freeze({
  "graceful step": Object.freeze({ action: "step", bonus: 5 })
});

/**
 * Extra feet a feat grants to one armed movement action.
 * @param {string} actionKey e.g. "step".
 * @param {string[]} featNames The actor's feat item names.
 * @returns {number}
 */
export function movementLimitBonus(actionKey, featNames = []) {
  let bonus = 0;
  for (const name of featNames) {
    const entry = MOVEMENT_LIMIT_FEATS[String(name ?? "").trim().toLowerCase()];
    if (entry && entry.action === actionKey) bonus += entry.bonus;
  }
  return bonus;
}

/**
 * A STEP AN ITEM OR EFFECT LENGTHENS (3.670.0; Inner Tempest's Tiger Stance:
 * "As long as your Speed is at least 20 feet while in Tiger Stance, you can
 * Step 10 feet"). Declared on any item or applied effect:
 *
 *   flags.trg-prime.stepFeet = { feet: 10, minSpeed: 20, label: "Tiger Stance" }
 *
 * The extra feet over a 5-ft Step, from the longest declaration whose Speed
 * condition holds (land Speed at that moment). It does not add to Graceful
 * Step: both say "Step 10 feet", so the longer of the two stands.
 *
 * @param {Iterable<object>} carriers
 * @param {number} speed the creature's land Speed now
 * @returns {number} feet beyond 5
 */
export function declaredStepBonus(carriers = [], speed = 0) {
  let best = 0;
  for (const carrier of carriers ?? []) {
    if (!carrier || carrier.disabled) continue;
    const raw = carrier.flags?.["trg-prime"]?.stepFeet;
    for (const row of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const feet = Math.trunc(Number(row?.feet));
      const min = Math.trunc(Number(row?.minSpeed) || 0);
      if (!Number.isFinite(feet) || feet <= 5 || Number(speed) < min) continue;
      best = Math.max(best, feet - 5);
    }
  }
  return best;
}

/**
 * Feats that change an armed movement action from a FIXED distance to a
 * FRACTION OF SPEED. A different shape from MOVEMENT_LIMIT_FEATS above,
 * and deliberately a separate table rather than a cleverer one entry:
 *
 *   Graceful Step   Step is 5 ft -> 10 ft.        A bigger fixed distance.
 *   SKITTER         Crawl is 5 ft -> half Speed.  A different KIND of limit.
 *
 * Adding a `fraction` field to the bonus table would have let one entry
 * mean either thing depending on which field was filled in, and a caller
 * reading it would have to know which. Two tables, two questions.
 *
 * SKITTER (Racial, Chapter 5, prereq Dex +3 and Fleet Footed): "You can
 * Crawl up to half your Speed." NEW at 3.378.0.
 *
 * Keyed by normalised feat name -> { action, fraction, minDistance }.
 */
const MOVEMENT_FRACTION_FEATS = Object.freeze({
  skitter: Object.freeze({ action: "crawl", fraction: 0.5, minDistance: 5 })
});

/**
 * The fraction-of-Speed limit a feat imposes on an action, or null.
 *
 * NEVER SHORTENS. A Speed of 5 would put half a Speed at 2 feet, which is
 * less than the 5 the action already allows — a feat that reads "you can
 * Crawl up to half your Speed" must not leave a slow character crawling
 * less far than everybody else. `minDistance` is that floor, and it is
 * declared in the table rather than assumed from the action's own config,
 * because the two are different numbers that happen to coincide today.
 *
 * @param {string} actionKey
 * @param {string[]} featNames
 * @returns {{fraction: number, minDistance: number}|null}
 */
export function movementFractionOverride(actionKey, featNames = []) {
  for (const name of featNames) {
    const entry = MOVEMENT_FRACTION_FEATS[String(name ?? "").trim().toLowerCase()];
    if (entry && entry.action === actionKey) {
      return { fraction: entry.fraction, minDistance: entry.minDistance };
    }
  }
  return null;
}

/**
 * Armour-training feats (Chapter 5). Iron Walker: "Ignore the reduction to
 * your Speed from any armour you wear. In addition, the ACP for any armour
 * that you wear is reduced by 1" (per piece).
 */
export const ARMOUR_TRAINING_FEATS = Object.freeze({
  "iron walker": Object.freeze({ ignoreSpeedPenalty: true, acpReductionPerPiece: 1 }),
  // Armour Master archetype (Chapter 5): "reduce the ACP on any armour
  // that you wear by 1" — its Critical Resistance 1 is wired separately
  // in actor prep (conditional on actually wearing armour).
  "armour master": Object.freeze({ ignoreSpeedPenalty: false, acpReductionPerPiece: 1 })
});

/** Accumulated armour-training benefits from the actor's feats. */
export function armourTraining(featNames = []) {
  const result = { ignoreSpeedPenalty: false, acpReductionPerPiece: 0 };
  for (const name of featNames) {
    const entry = ARMOUR_TRAINING_FEATS[String(name ?? "").trim().toLowerCase()];
    if (!entry) continue;
    result.ignoreSpeedPenalty ||= Boolean(entry.ignoreSpeedPenalty);
    result.acpReductionPerPiece += entry.acpReductionPerPiece ?? 0;
  }
  return result;
}

/**
 * Feats granting a flat bonus to Dying Checks (Indomitable Resilience /
 * Stone-Like Endurance: +2 racial; Diehard: +2 circumstance). Applied
 * inside the turn automation's dying check — a flat d20 save where the
 * bonus types never collide, so one summed map is honest.
 */
export const DYING_CHECK_BONUS_FEATS = Object.freeze({
  "indomitable resilience": 2,
  "stone-like endurance": 2,
  diehard: 2
});

/** Total dying-check bonus from the actor's feats. */
export function dyingCheckBonus(featNames = []) {
  let total = 0;
  for (const name of featNames) {
    total += DYING_CHECK_BONUS_FEATS[String(name ?? "").trim().toLowerCase()] ?? 0;
  }
  return total;
}

/**
 * BORN TO RIDE (General, Chapter 5; prereq Handle Animal 5 ranks): "Once
 * per round you may use an action to command your steed, guide with knees
 * or stay in saddle (using Handle Animal) as a Free Action."
 *
 * NEW at 3.378.0.
 *
 * A THIRD AP-COST SHAPE, and none of the two that already exist fits:
 *
 *   AP_COST_REDUCTION_FEATS   subtract N, every time.        Fast Aim.
 *   REACTION_TO_FREE_FEATS    Reaction -> 0, every time.     Practised Killer.
 *   ONCE_PER_ROUND_FREE       any cost -> 0, ONCE a round.   Born to Ride.
 *
 * The once-per-round part is what forces a new table rather than a third
 * column on an old one: the other two are pure functions of the action,
 * and this one needs to know what has already happened this round.
 *
 * THE THREE ACTIONS ARE NOT ALIKE, which matters for what the feat is
 * worth. Guide with Knees is ALREADY Free, so the feat does nothing for
 * it; Stay in Saddle is a Reaction, so the feat saves a reaction rather
 * than AP; only Command an Animal costs AP to begin with. The allowance
 * is therefore spent only when the cost actually CHANGES — otherwise
 * riding along and guiding with knees would silently burn the round's
 * one use and take Command an Animal's discount with it.
 */
const ONCE_PER_ROUND_FREE_FEATS = Object.freeze({
  "born to ride": Object.freeze(["commandAnAnimal", "guideWithKnees", "stayInSaddle"])
});

/**
 * Would a once-per-round feat make this action free, and is that a real
 * change from what it already costs?
 *
 * @param {string} actionKey
 * @param {string} apCost The action's cost as printed ("1", "Free", "Reaction").
 * @param {string[]} featNames
 * @returns {{applies: boolean, changes: boolean, featName: string|null}}
 */
export function oncePerRoundFreeAction(actionKey, apCost, featNames = []) {
  const key = String(actionKey ?? "").trim();
  const cost = String(apCost ?? "").trim().toLowerCase();
  for (const name of (Array.isArray(featNames) ? featNames : [])) {
    const normalised = String(name ?? "").trim().toLowerCase();
    const actions = ONCE_PER_ROUND_FREE_FEATS[normalised];
    if (!actions?.includes(key)) continue;
    // "Free" and "0" are already free; making them free changes nothing
    // and must not consume the round's single use.
    const alreadyFree = cost === "free" || cost === "0";
    return { applies: true, changes: !alreadyFree, featName: name };
  }
  return { applies: false, changes: false, featName: null };
}

/**
 * Feats granting a typed bonus to specific skill ACTIONS (not whole
 * skills) — applied automatically inside the action workflow's check.
 * Deadly Training (Chapter 5): "+2 class bonus when using the Ambush
 * (Stealth) and Sniping actions." Keyed by normalised feat name.
 */
export const ACTION_BONUS_FEATS = Object.freeze({
  "deadly training": Object.freeze({
    actions: Object.freeze(["ambush", "sniping"]),
    value: 2,
    type: "class",
    label: "Deadly Training"
  }),
  // Loremaster archetype (Chapter 5): "+2 class bonus to all Recall
  // Knowledge checks" — Recall Knowledge is one action across many
  // skills, so the action layer is exactly the right hook.
  loremaster: Object.freeze({
    actions: Object.freeze(["recallKnowledge"]),
    value: 2,
    type: "class",
    label: "Loremaster"
  }),
  // Aiding Archery (Class, Chapter 5): "Aid Defensive and Aid Offensive
  // ... gain a +1-circumstance bonus" (the missile-weapon permission is
  // on the feat's note).
  "aiding archery": Object.freeze({
    actions: Object.freeze(["aidDefensive", "aidOffensive"]),
    value: 1,
    type: "circumstance",
    label: "Aiding Archery"
  }),
  // Bardic Lore (Class, Chapter 5): "grants your class bonus to all
  // Recall Knowledge checks" — the VALUE is the actor's own class bonus,
  // resolved via `valueFrom` at roll time (the untrained permission for
  // Arcana/Occultism/Nature/Religion rides the feat's note).
  "bardic lore": Object.freeze({
    actions: Object.freeze(["recallKnowledge"]),
    valueFrom: "classBonus",
    type: "class",
    label: "Bardic Lore"
  })
});

/**
 * Feats that reduce one action's AP cost. Fast Aim (Class, Chapter 5):
 * "It takes you one less action to use the Aim action."
 */
export const AP_COST_REDUCTION_FEATS = Object.freeze({
  "fast aim": Object.freeze({ action: "aim", reduction: 1 }),
  // Sudden Charge (Class, Chapter 5): "It only costs you 2 Action
  // Points to Charge instead of 3."
  "sudden charge": Object.freeze({ action: "charge", reduction: 1 })
});

/**
 * Feats that turn a Reaction-cost action into a free (0 AP) action.
 * Practised Killer (Class, Chapter 5): Ambush and Sniping become Free
 * Actions. Applied before the reaction gate ever sees the action.
 */
export const REACTION_TO_FREE_FEATS = Object.freeze({
  "practised killer": Object.freeze(["ambush", "sniping"])
});

/**
 * AN ACTION'S OWN DECLARED VARIANTS (3.625.0). A skill action entry — a
 * core one or one a module registers — may carry
 *
 *   variants: [{ feat: "Guide the Last Road", apCost: "1 minute",
 *                outcomes: { critical: "…", success: "…", partial: "…" },
 *                note: "…" }]
 *
 * and the first variant whose feat (or class ability) the actor owns
 * replaces the cost and the named outcome rows, so the card the player
 * reads is the feat's version of the action. Pillars of Faith's Guide the
 * Last Road ("You may Perform Last Rites in 1 minute … Critical: 1 month,
 * Success: 7 days, Partial: 24 hours") is the first. Returns the action
 * untouched when no variant applies; never mutates the entry.
 */
export function applyActionVariant(action, featNames = []) {
  const variants = Array.isArray(action?.variants) ? action.variants : [];
  if (!variants.length) return action;
  const owned = new Set((featNames ?? []).map((n) => String(n ?? "").trim().toLowerCase()));
  const variant = variants.find((v) => v && owned.has(String(v.feat ?? "").trim().toLowerCase()));
  if (!variant) return action;
  const out = { ...action, variantApplied: String(variant.feat) };
  if (variant.apCost !== undefined) out.apCost = variant.apCost;
  if (variant.outcomes && typeof variant.outcomes === "object") out.outcomes = { ...(action.outcomes ?? {}), ...variant.outcomes };
  if (variant.note) out.variantNote = String(variant.note);
  return out;
}

/**
 * An action's cost adjusted for reaction-to-free feats. Returns the
 * action untouched when no feat applies.
 */
export function applyReactionToFree(action, featNames = []) {
  if (String(action?.apCost ?? "").trim().toLowerCase() !== "reaction") return action;
  for (const name of featNames) {
    const actions = REACTION_TO_FREE_FEATS[String(name ?? "").trim().toLowerCase()];
    if (actions?.includes(action.key)) {
      return { ...action, apCost: "0" };
    }
  }
  return action;
}

/**
 * Total AP-cost reduction owed to an action from the actor's feats.
 * Only ever applied to plainly numeric costs (never "Reaction"/"Varies").
 * @param {string} actionKey
 * @param {string[]} featNames
 * @returns {number}
 */
export function apCostReduction(actionKey, featNames = []) {
  let total = 0;
  for (const name of featNames) {
    const entry = AP_COST_REDUCTION_FEATS[String(name ?? "").trim().toLowerCase()];
    if (entry && entry.action === actionKey) total += entry.reduction;
  }
  return total;
}

/**
 * Check modifiers owed to an action from the actor's feats.
 * @param {string} actionKey e.g. "ambush".
 * @param {string[]} featNames The actor's feat item names.
 * @returns {{label: string, value: number, type: string}[]}
 */
export function actionFeatModifiers(actionKey, featNames = [], context = {}) {
  const mods = [];
  for (const name of featNames) {
    const entry = ACTION_BONUS_FEATS[String(name ?? "").trim().toLowerCase()];
    if (entry && entry.actions.includes(actionKey)) {
      const value = entry.valueFrom
        ? Number(context[entry.valueFrom] ?? 0)
        : entry.value;
      if (value) mods.push({ label: entry.label, value, type: entry.type });
    }
  }
  return mods;
}

/**
 * Feats that remove a trait from one skill action. Escapologist
 * (Chapter 5): "When making Escape (Acrobatics) checks, the action loses
 * the Attack trait" — stripped before the trait gate and usage recording,
 * so every Attack-trait consumer sees the feat's version of the action.
 */
export const TRAIT_REMOVAL_FEATS = Object.freeze({
  escapologist: Object.freeze({ action: "escape", trait: "attack" }),
  // Fearsome Glare (Chapter 5): "Demoralise... loses the auditory trait
  // and gains the visual trait" (the language-barrier immunity is a note).
  "fearsome glare": Object.freeze({ action: "demoralise", trait: "auditory", addTrait: "Visual" })
});

/**
 * An action adjusted for the actor's trait-removal feats (each entry may
 * also ADD a replacement trait — Fearsome Glare swaps Auditory for
 * Visual). Returns the action untouched when no feat applies.
 * @param {object} action A skill-action definition (carries key/traits).
 * @param {string[]} featNames The actor's feat item names.
 */
export function applyTraitRemovals(action, featNames = []) {
  let adjusted = action;
  for (const name of featNames) {
    const entry = TRAIT_REMOVAL_FEATS[String(name ?? "").trim().toLowerCase()];
    if (!entry || entry.action !== adjusted?.key) continue;
    const traits = String(adjusted.traits ?? "")
      .split(/,\s*/)
      .filter((t) => t && t.toLowerCase() !== entry.trait);
    if (entry.addTrait && !traits.some((t) => t.toLowerCase() === entry.addTrait.toLowerCase())) {
      traits.push(entry.addTrait);
    }
    adjusted = { ...adjusted, traits: traits.join(", ") };
  }
  return adjusted;
}

/**
 * Feats granting a typed bonus to exhaustion checks (Chapter 7's
 * level-based Fortitude save). Inner Reserve: +2 class; Mettle: +4 class
 * — class stacks (Appendix 1), so both together are +6.
 */
export const EXHAUSTION_CHECK_BONUS_FEATS = Object.freeze({
  "inner reserve": Object.freeze({ value: 2, type: "class", label: "Inner Reserve" }),
  mettle: Object.freeze({ value: 4, type: "class", label: "Mettle" })
});

/**
 * Check modifiers owed to an exhaustion check from the actor's feats.
 * @param {string[]} featNames The actor's feat item names.
 * @returns {{label: string, value: number, type: string}[]}
 */
export function exhaustionCheckModifiers(featNames = []) {
  const mods = [];
  for (const name of featNames) {
    const entry = EXHAUSTION_CHECK_BONUS_FEATS[String(name ?? "").trim().toLowerCase()];
    if (entry) mods.push({ label: entry.label, value: entry.value, type: entry.type });
  }
  return mods;
}

/**
 * Feats that open a skill action from another skill. Impressive
 * Performance (Chapter 5): "You can Make an Impression using Performance
 * instead of Diplomacy" — the action appears in Perform's action chooser
 * and rolls with the Perform modifier.
 */
export const SKILL_SUBSTITUTION_FEATS = Object.freeze({
  "impressive performance": Object.freeze({ action: "makeAnImpression", skill: "perform" }),
  // Natural Medicine (Chapter 5): "use Survival instead of Medicine to
  // Treat Wounds" — the wilderness +2 circumstance stays a dialog call.
  "natural medicine": Object.freeze({ action: "treatWounds", skill: "survival" }),
  // Sense Power (Chapter 5): "use the Sense Motive skill to sense the
  // presence of magical auras as if you were using Power Manipulation."
  "sense power": Object.freeze([
    Object.freeze({ action: "senseMagicBroad", skill: "senseMotive" }),
    Object.freeze({ action: "senseMagicFocused", skill: "senseMotive" })
  ]),
  // Streetwise (Chapter 5): "use your Culture modifier instead of your
  // Diplomacy modifier to Gather Information" (urban Stealth +1 is a note).
  streetwise: Object.freeze({ action: "gatherInformation", skill: "culture" }),
  // Urban Tracker (Chapter 5): "use your Perception skill at -2 to make
  // Cover Tracks and Track checks instead of the Survival skill."
  "urban tracker": Object.freeze([
    Object.freeze({
      action: "track", skill: "perception",
      modifier: Object.freeze({ label: "Urban Tracker (Perception)", value: -2, type: "untyped" })
    }),
    Object.freeze({
      action: "coverTracks", skill: "perception",
      modifier: Object.freeze({ label: "Urban Tracker (Perception)", value: -2, type: "untyped" })
    })
  ]),
  // Wheeler Dealer (Chapter 5): "use your Diplomacy skill to make Earn
  // Income checks" (advantage on Barter is a note).
  "wheeler dealer": Object.freeze({ action: "earnIncome", skill: "diplomacy" }),
  // Acrobatic Bluff (Class, Chapter 5): "use your Acrobatics skill in
  // place of your Deception skill to feint in combat."
  "acrobatic bluff": Object.freeze({ action: "feint", skill: "acrobatics" })
});

/**
 * Actions a feat opens on a skill they don't normally belong to. An entry
 * may carry a `modifier`, attached to the returned action copy as
 * `substitutionModifier` — the action workflow folds it into the check
 * (Urban Tracker's -2), so it only ever applies through this route.
 * @param {string} skillKey The skill being rolled from.
 * @param {string[]} featNames The actor's feat item names.
 * @param {object[]} registry The full skill-action registry.
 * @returns {object[]} Action definitions to offer additionally.
 */
export function substituteSkillActions(skillKey, featNames = [], registry = []) {
  const extra = [];
  for (const name of featNames) {
    const key = String(name ?? "").trim().toLowerCase();
    // A module feat (3.560.0) registers its substitutions in the same shape.
    const raw = SKILL_SUBSTITUTION_FEATS[key] ?? registeredSkillSubstitution(key);
    if (!raw) continue;
    for (const entry of Array.isArray(raw) ? raw : [raw]) {
      if (entry.skill !== skillKey) continue;
      const action = registry.find((a) => a.key === entry.action);
      if (!action || extra.some((a) => a.key === action.key)) continue;
      extra.push(entry.modifier ? { ...action, substitutionModifier: entry.modifier } : action);
    }
  }
  return extra;
}

/**
 * Which racial-feat lineages each Heritage feat opens (Chapter 5): e.g.
 * Half-Elf — "you can select elf, and half-elf racial feats." The feat's
 * own name is always included; this maps the extra lineages.
 */
/**
 * ELEVATED LINEAGE (Racial, half-elf, Chapter 5): "you gain the benefits
 * associated with the elf heritage of your elven parent or ancestors."
 *
 * NEW at 3.379.0.
 *
 * THE FEAT'S OWN NOTE SAID THIS COULD NOT BE BUILT — "apply when
 * heritages are built (heritage compendium pending)". The heritage
 * compendium exists and holds six elf heritages (Silvarni, Tolderni,
 * Elarni, Sindarni, Drelvarni, Noldorni), five of them carrying real
 * `conditionals`. The note is stale, not accurate, and a stale apology
 * reads exactly like a genuine blocker — which is how this sat unbuilt
 * next to the data it needed.
 *
 * THE FEAT DOES NOT NAME A HERITAGE, so this cannot be a table: which
 * ancestor a particular half-elf had is a fact about that character, and
 * the only place it exists is in the player's head. The feat therefore
 * OFFERS the six and applies the one chosen.
 */
const ELEVATED_LINEAGE_SOURCE_RACE = "Elf";

/**
 * The heritages Elevated Lineage may grant, from whatever the caller
 * loaded out of the compendium.
 *
 * Pure, and takes the list rather than fetching it, so a harness can ask
 * what happens when the pack is empty, holds another race's heritages, or
 * holds one with no mechanics at all.
 *
 * @param {Array<{name: string, system?: object}>} heritages
 * @returns {Array<object>} Sorted by name, so the dialog is stable.
 */
export function elevatedLineageChoices(heritages = []) {
  return (Array.isArray(heritages) ? heritages : [])
    .filter((h) => String(h?.system?.sourceRace ?? "").trim().toLowerCase()
      === ELEVATED_LINEAGE_SOURCE_RACE.toLowerCase())
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

/**
 * Why Elevated Lineage cannot be applied right now, or null.
 *
 * A HERITAGE IS A SINGLE SLOT. The sheet already warns when a second one
 * is dropped on an actor; this refuses instead, because the sheet's
 * warning is aimed at somebody deliberately comparing two heritages and
 * this is a feat quietly adding one behind them.
 *
 * @param {object} options
 * @param {boolean} options.hasHeritage Actor already holds a heritage item.
 * @param {number} options.choiceCount How many elf heritages were found.
 * @returns {string|null}
 */
export function elevatedLineageBlocked({ hasHeritage = false, choiceCount = 0 } = {}) {
  if (hasHeritage) {
    return "this character already has a heritage — remove it first, since a character has only one";
  }
  if (!Number(choiceCount)) {
    return "no elf heritages were found in the compendium";
  }
  return null;
}

/**
 * What a heritage will actually DO once applied, counted rather than
 * assumed.
 *
 * DRELVARNI CARRIES NOTHING — no conditionals, no granted feats, no
 * abilities. Applying it is legitimate and changes no number, and a
 * player who picked it deserves to be told that rather than left
 * wondering whether the feat failed. Silence and success look identical.
 *
 * @param {object} heritage
 * @returns {{conditionals: number, grants: number, mechanical: boolean}}
 */
export function heritageMechanics(heritage) {
  const conditionals = (heritage?.flags?.["trg-prime"]?.conditionals ?? []).length;
  const listed = [heritage?.system?.grantedFeats, heritage?.system?.racialAbilities]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(",");
  const grants = listed ? listed.split(",").map((x) => x.trim()).filter(Boolean).length : 0;
  return { conditionals, grants, mechanical: conditionals + grants > 0 };
}

export const HERITAGE_RACE_GRANTS = Object.freeze({
  "half-elf": Object.freeze(["Elf", "Half-Elf"]),
  "half-orc": Object.freeze(["Orc", "Half-Orc"]),
  "half-ogre": Object.freeze(["Half-Ogre"]),
  beastman: Object.freeze(["Beastman"])
});

/**
 * Which CLASS feat lists each archetype opens (Chapter 5): "you may also
 * learn feats which are available to the Druid (Adept) class" and kin.
 * Mirrors HERITAGE_RACE_GRANTS exactly.
 *
 * THE PARENTHETICAL IS A SECOND GRANT, not a description of the class —
 * Graham's ruling, 13 Aug 2026. It is handled by ARCHETYPE_TIER_GRANTS
 * below rather than here, because the two open different feats: the
 * class name and the tier are disjoint trait sets in the compendium.
 */
export const ARCHETYPE_CLASS_GRANTS = Object.freeze({
  animist: Object.freeze(["Druid"]),
  arcanist: Object.freeze(["Wizard"]),
  gleeman: Object.freeze(["Bard"]),
  priest: Object.freeze(["Cleric"]),
  champion: Object.freeze(["Crusader"]),
  thief: Object.freeze(["Rogue"]),
  warden: Object.freeze(["Ranger"]),
  warrior: Object.freeze(["Fighter"])
});

/**
 * Which CLASS TIER each archetype adds, on top of the one the character's
 * class already has.
 *
 * THE DEFECT THIS EXISTS FOR. Graham, 13 Aug 2026: War Priest "does not
 * seem to grant Heavy Armour Proficiency or add the Martial trait to the
 * class (which should open up martial class feats)." Its printed text:
 *
 *   "You also become proficient with heavy armour and are considered to
 *    be martial (as well as adept) for the purpose of selecting feats."
 *
 * A class feat traited Martial is offered to anyone whose class TIER
 * includes Martial — the gate has worked since classes started carrying
 * `classType` — but the tier was read straight off the class item and
 * nothing could ever add to it. A Cleric is Adept, so a War Priest was
 * refused all FORTY Martial-traited class feats in the compendium
 * (Bravery, Cleave, Power Attack, Shield Block, Weapon Mastery…), which
 * is the entire point of the archetype.
 *
 * "AS WELL AS", NOT "INSTEAD OF". The text is explicit that the original
 * tier is kept, so this ADDS rather than replaces — a War Priest Cleric
 * counts as Adept and Martial and keeps every Adept feat.
 *
 * Keyed and shaped exactly like ARCHETYPE_CLASS_GRANTS above, because it
 * is the same idea applied to the other half of the same gate.
 */
export const ARCHETYPE_TIER_GRANTS = Object.freeze({
  // War Priest says it outright: "considered to be martial (as well as
  // adept) for the purpose of selecting feats."
  "war priest": Object.freeze(["Martial"]),

  // THE OTHER EIGHT SAY IT THROUGH THE PARENTHETICAL. Every one of them
  // ends with the same sentence, differing only in the two words:
  //
  //   "you may also learn feats which are available only to the
  //    Fighter (Martial) class"
  //
  // Graham's ruling, 13 Aug 2026, asked about Warrior: BOTH — the named
  // class's feat list AND the tier in the bracket. They are not the same
  // feats. In the compendium the two trait sets are DISJOINT: 21 class
  // feats carry "Fighter", 40 carry "Martial", and none carries both.
  // ARCHETYPE_CLASS_GRANTS above opens the 21; this opens the 40.
  //
  // Listed rather than parsed out of the description, because a picker
  // index does not carry descriptions. verify-archetype-tiers.mjs
  // re-derives this table from each feat's printed sentence and fails if
  // the two disagree — so rewording an entry cannot leave this stale.
  animist: Object.freeze(["Adept"]),      // Druid (Adept)
  arcanist: Object.freeze(["Adept"]),     // Wizard (Adept)
  champion: Object.freeze(["Martial"]),   // Crusader (Martial)
  gleeman: Object.freeze(["Adept"]),      // Bard (Adept)
  priest: Object.freeze(["Adept"]),       // Cleric (Adept)
  thief: Object.freeze(["Expert"]),       // Rogue (Expert)
  warden: Object.freeze(["Martial"]),     // Ranger (Martial)
  warrior: Object.freeze(["Martial"])     // Fighter (Martial)
});

/**
 * The class tiers an actor counts as for class-feat picker filtering:
 * the class item's own `classType` plus every tier an owned archetype
 * feat adds.
 *
 * The class's own value may already be a list — the Bard is authored
 * "Adept/Expert" — and the picker splits on both commas and slashes, so
 * joining with a comma composes with it rather than corrupting it.
 *
 * @param {string} classType The embedded class item's `system.classType`.
 * @param {string[]} archetypeFeatNames Names of owned Archetype feats.
 * @returns {string} Comma-joined effective tier list.
 */
export function effectiveTiers(classType, archetypeFeatNames = []) {
  const tiers = [];
  const push = (name) => {
    const clean = String(name ?? "").trim();
    if (clean && !tiers.some((t) => t.toLowerCase() === clean.toLowerCase())) tiers.push(clean);
  };
  // Split the class's own field first, so a Bard's "Adept/Expert" is two
  // entries and a duplicate grant is recognised as one. Pushed whole, it
  // would be a single "adept/expert" string that no de-duplication and
  // no equality test could ever match a bare "Adept" against.
  for (const part of String(classType ?? "").split(/[,/]/)) push(part);
  for (const featName of archetypeFeatNames) {
    const tierKey = String(featName ?? "").trim().toLowerCase();
    for (const extra of ARCHETYPE_TIER_GRANTS[tierKey] ?? registeredArchetype(tierKey)?.tierGrants ?? []) {
      push(extra);
    }
  }
  return tiers.join(", ");
}

/**
 * The archetypes a character counts as owning for archetype-trait class
 * feats (3.671.0): the ones they own, plus any a registered archetype
 * counts as (Inner Tempest's Zen Archer counts as Archer). Comma-joined,
 * owned names first, no repeats.
 *
 * @param {string[]} archetypeFeatNames
 * @returns {string}
 */
export function effectiveArchetypes(archetypeFeatNames = []) {
  const out = [];
  const push = (name) => {
    const clean = String(name ?? "").trim();
    if (clean && !out.some((a) => a.toLowerCase() === clean.toLowerCase())) out.push(clean);
  };
  for (const featName of archetypeFeatNames) {
    push(featName);
    for (const alias of registeredArchetype(featName)?.countsAs ?? []) push(alias);
  }
  return out.join(", ");
}

/**
 * The class names an actor counts as for class-feat picker filtering:
 * the class item's name plus every list an owned archetype feat opens.
 * @param {string} className The embedded class item's name.
 * @param {string[]} archetypeFeatNames Names of owned Archetype feats.
 * @returns {string} Comma-joined effective class list.
 */
export function effectiveClasses(className, archetypeFeatNames = []) {
  const classes = [];
  const push = (name) => {
    const clean = String(name ?? "").trim();
    if (clean && !classes.some((c) => c.toLowerCase() === clean.toLowerCase())) classes.push(clean);
  };
  push(className);
  for (const featName of archetypeFeatNames) {
    const classKey = String(featName ?? "").trim().toLowerCase();
    for (const extra of ARCHETYPE_CLASS_GRANTS[classKey] ?? registeredArchetype(classKey)?.classGrants ?? []) {
      push(extra);
    }
  }
  return classes.join(", ");
}

/**
 * A CLASS'S FEATS OPENED BY ANY OWNED FEAT (3.670.0; Inner Tempest's Inner
 * Magic: "you may also learn feats which are available only to the Mystic
 * (Adept) class", ruled B6-7 as the feats with the Mystic trait). Archetype
 * feats open class lists through `registerArchetype`; a feat of any other
 * category declares it:
 *
 *   flags.trg-prime.classFeatAccess = ["Mystic"]
 *
 * The class names whose TRAIT the picker then accepts on a class feat
 * (`traitClasses`), beside the character's own classes. Only the trait: a
 * class's registered access list and its source-tagged feats are not opened
 * (found in review: Inner Magic opened the Mystic's list of core feats). A
 * class TYPE (Adept) is not opened by this: only the class named.
 *
 * @param {Iterable<object>} items the actor's items
 * @returns {string[]}
 */
export function declaredClassFeatAccess(items = []) {
  const out = [];
  for (const item of items ?? []) {
    if (item?.type !== "feat") continue;
    const raw = item.flags?.["trg-prime"]?.classFeatAccess;
    for (const name of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const clean = String(name ?? "").trim();
      if (clean && !out.some((c) => c.toLowerCase() === clean.toLowerCase())) out.push(clean);
    }
  }
  return out;
}

/**
 * The full list of race names an actor counts as for picker filtering:
 * the race item's name plus every lineage its Heritage feats open.
 * @param {string} raceName The embedded race item's name.
 * @param {string[]} heritageFeatNames Names of owned Heritage-trait feats.
 * @returns {string} Comma-joined effective race list.
 */
export function effectiveRaces(raceName, heritageFeatNames = []) {
  const races = [];
  const push = (name) => {
    const clean = String(name ?? "").trim();
    if (clean && !races.some((r) => r.toLowerCase() === clean.toLowerCase())) races.push(clean);
  };
  push(raceName);
  for (const featName of heritageFeatNames) {
    push(featName);
    const raceKey = String(featName ?? "").trim().toLowerCase();
    for (const extra of HERITAGE_RACE_GRANTS[raceKey] ?? registeredHeritageRaceGrant(raceKey) ?? []) {
      push(extra);
    }
  }
  return races.join(", ");
}

/**
 * Extra picks granted by the feats an actor owns.
 * @param {string[]} featNames The actor's feat item names.
 * @returns {{racial: number, class: number, general: number}}
 */
export function featPickBonuses(featNames = []) {
  const extra = { racial: 0, class: 0, general: 0 };
  for (const name of featNames) {
    const bonus = FEAT_PICK_BONUSES[String(name ?? "").trim().toLowerCase()];
    if (!bonus) continue;
    extra.racial += bonus.racial ?? 0;
    extra.class += bonus.class ?? 0;
    extra.general += bonus.general ?? 0;
  }
  return extra;
}

/**
 * Racial abilities that modify weapon attack rolls.
 *
 * These can't ride the conditional-modifier engine, because a weapon
 * attack doesn't go through the shared check dialog — it has its own
 * flow in combat/attack-workflow.mjs. But they don't need to: the
 * scope is something the system can see for itself. "All Melee Attacks"
 * is the weapon's attack mode, and "bow and sling attack checks" is its
 * weapon group. Nothing is left to a person's judgement, so nothing
 * should be asked of them — the bonus simply applies, named, in the
 * attack's own modifier breakdown.
 *
 * Matching is by feature name across feat AND ability items, the same
 * convention the rest of the workflow uses.
 */
export const RACIAL_ATTACK_BONUSES = Object.freeze([
  Object.freeze({
    name: "ferocious",
    label: "Ferocious",
    value: 1,
    type: "race",
    // "a +1 racial bonus to all Melee Attacks" — the attack mode, so a
    // thrown weapon used at range is not one, and a melee weapon is.
    attackModes: Object.freeze(["melee"])
  }),
  Object.freeze({
    name: "sure shot",
    label: "Sure Shot",
    value: 1,
    type: "race",
    // "a +1 racial bonus to all bow and sling attack checks".
    groups: Object.freeze(["bow", "sling"])
  })
]);

/**
 * Which racial attack bonuses apply to one particular attack.
 *
 * @param {string[]} featureNames Names of the actor's feat and ability items.
 * @param {object} weapon {attackMode, group} of the weapon being used.
 * @returns {Array<{label: string, value: number, type: string}>}
 */
export function racialAttackBonuses(featureNames = [], weapon = {}) {
  const owned = new Set(
    featureNames.map((name) => String(name ?? "").trim().toLowerCase())
  );
  const mode = String(weapon.attackMode ?? "melee").trim().toLowerCase();
  const group = String(weapon.group ?? "").trim().toLowerCase();

  const applied = [];
  for (const bonus of RACIAL_ATTACK_BONUSES) {
    if (!owned.has(bonus.name)) continue;
    if (bonus.attackModes && !bonus.attackModes.includes(mode)) continue;
    if (bonus.groups && !bonus.groups.includes(group)) continue;
    applied.push({ label: bonus.label, value: bonus.value, type: bonus.type });
  }
  return applied;
}

/**
 * A CHOICE THE BOOK PINS TO 1ST LEVEL, and whether this press may change it.
 *
 * GRAHAM'S RULING, 15 September 2026 (R2): "go down the same route as the
 * heritage lock" — which is the shape already proven at documents/item.mjs:
 * refuse for a player, exempt the GM, and only above 1st level.
 *
 * Versatile is the case that asked for it. "Choose your two 1st-level
 * ability scores" is the whole of a Human's ability modifiers, and the
 * chooser let a 12th-level Human re-allocate them at will — the printed
 * rule says 1st level and nothing said otherwise.
 *
 * TWO DELIBERATE LIMITS, both of which are the difference between a lock
 * and a trap:
 *
 *   - A CHOICE NEVER MADE IS NEVER LOCKED. A character who reached 4th
 *     level without ever pressing Use has not "already chosen"; refusing
 *     them would leave a Human permanently without ability modifiers,
 *     which is the very defect D8 was about. The gate asks whether there
 *     is an answer to change, not merely what level they are.
 *   - THE GM IS ALWAYS EXEMPT, exactly as with race, heritage and
 *     background: a table that agrees a rebuild gets one.
 *
 * @param {object} options
 * @param {number} options.level The character's level.
 * @param {boolean} options.isGM Whether the person pressing the button is the GM.
 * @param {boolean} options.alreadyChosen Whether an answer is already recorded.
 * @param {string} options.label The ability's name, for the message.
 * @returns {string} The refusal to show, or "" to allow the press.
 */
export function firstLevelChoiceRefusal({
  level = 1,
  isGM = false,
  alreadyChosen = false,
  label = "This choice"
} = {}) {
  if (isGM) return "";
  if (!alreadyChosen) return "";
  const lvl = Math.trunc(Number(level) || 0);
  if (!(lvl > 1)) return "";
  return `${label} is chosen at 1st level and you are level ${lvl} — ask your GM to change it.`;
}

/**
 * A FEAT THAT HAS RECORDED A CHOICE SAYS SO IN ITS OWN NAME.
 *
 * Graham's request, 15 September 2026: "when the feats Skill Focus and
 * Weapon Focus are selected, the feat should show the selected pick in
 * brackets next to its name on the sheet."
 *
 * The reason it matters is the reason both feats are repeatable. A
 * character with three copies of Weapon Focus had three rows reading
 * "Weapon Focus", and the only way to tell which was which was to press
 * Use on each in turn and read the dialog — on a feat whose whole
 * content is which group it names. Now the row reads "Weapon Focus
 * (Brawling)".
 *
 * DISPLAY ONLY. The item keeps its own name, because the name is what
 * every grant, prerequisite and "already held" test matches on:
 * Improved Critical asks for "the Weapon Focus group", Martial Artist
 * grants "Weapon Focus", and a renamed document would quietly stop
 * answering to either.
 *
 * @param {string} name The item's own name.
 * @param {string} choice The pick it has recorded, or "" for none.
 * @returns {string}
 */
export function featDisplayName(name, choice) {
  const base = String(name ?? "").trim();
  const pick = String(choice ?? "").trim();
  if (!base || !pick) return base;
  // A name that already carries its pick is left alone rather than
  // doubled — the pack prints a few this way, and a background may grant
  // "Weapon Focus (Unarmed)" as written.
  if (base.toLowerCase().endsWith(`(${pick.toLowerCase()})`)) return base;
  return `${base} (${pick})`;
}

/**
 * The pick recorded on a feat's own effect, read for display.
 *
 * TWO READERS, because a world has both kinds of character in it. A
 * choice made from 3.553.1 stamps `choiceLabel` on the effect the
 * chooser creates, which is exact. A choice made before that has only
 * the effect's NAME, which every chooser writes in the same shape —
 * "Weapon Focus: Brawling +1", "Skill Focus: Sneak +2" — so the pick is
 * recoverable from it without a migration, and an existing character
 * sees their picks the moment they update.
 *
 * @param {string} featName The feat's own name.
 * @param {{name?: string, label?: string}} effect The effect it created.
 * @returns {string} The pick, or "" when this effect carries none.
 */
export function choiceFromEffectName(featName, effect) {
  const declared = String(effect?.label ?? "").trim();
  if (declared) return declared;
  const base = String(featName ?? "").trim();
  const text = String(effect?.name ?? "").trim();
  if (!base || !text.toLowerCase().startsWith(`${base.toLowerCase()}:`)) return "";
  return text
    .slice(base.length + 1)
    // The trailing bonus the effect names for the player's benefit —
    // "+1", "+2" — is not part of the pick.
    .replace(/\s*[+-]\d+$/, "")
    .trim();
}

/** How a spell already on the sheet is shown when it is offered anyway. */
export const ALREADY_KNOWN_SUFFIX = "already known";

/**
 * A SPELL THE CHARACTER ALREADY HAS, and what a chooser does about it.
 *
 * GRAHAM'S RULING, 15 September 2026, taking the recommendation offered
 * after live testing 3.552.8: hide the duplicate where it would be
 * pointless, label it where it would not.
 *
 * Found live: the Test Cleric already knew Daze, Arcane Knowledge
 * offered Daze, and he ended the test holding two of them. The GRANT
 * path has refused that since the Crusader turned up holding two copies
 * of Strike of Retribution under a card that said "Granted" — see
 * grants-workflow's `held` set — but no chooser ever asked the question.
 *
 * IT IS NOT ONE ANSWER, because the seventeen choosers are two different
 * things:
 *
 *   - Four hand over an INNATE copy with the focus trait (Noldorni,
 *     Gul-Fyr, Tirvni, Arcane Knowledge). An innate focus copy of a
 *     spell you already know is not the spell you already know: it is
 *     cast outside the memorisation cycle and off a different table.
 *     Hiding it would refuse a legal, sensible pick, so it is offered
 *     and LABELLED.
 *   - The other thirteen add to the REPERTOIRE, where a second copy of
 *     the same spell does nothing whatsoever. Those are HIDDEN.
 *
 * Decided from `innate` rather than per chooser, so a chooser added
 * later inherits the reasoning instead of a default someone has to
 * remember to set — the lesson `system.traits` taught the index fields
 * three releases ago.
 *
 * @param {object} options
 * @param {boolean} options.innate Whether the grant lands as an innate spell.
 * @returns {"label"|"hide"}
 */
export function duplicateMode({ innate = false } = {}) {
  return innate ? "label" : "hide";
}

/**
 * The rows a chooser's list should show, given what the character holds.
 *
 * `heldNames` is every item name on the sheet, and it must EXCLUDE the
 * pick this press would replace — otherwise a chooser hides (or labels)
 * the very answer the player is here to change.
 *
 * @param {Array<{_id?: string, id?: string, name: string}>} candidates
 * @param {Iterable<string>} heldNames
 * @param {"label"|"hide"} mode
 * @returns {Array<{id: string, name: string, label: string, held: boolean}>}
 */
export function applyDuplicateRule(candidates, heldNames, mode = "hide") {
  const held = new Set(
    Array.from(heldNames ?? []).map((name) => String(name ?? "").trim().toLowerCase())
  );
  const rows = [];
  for (const candidate of candidates ?? []) {
    const name = String(candidate?.name ?? "");
    const isHeld = held.has(name.trim().toLowerCase());
    if (isHeld && mode === "hide") continue;
    rows.push({
      id: candidate?._id ?? candidate?.id ?? "",
      name,
      label: isHeld ? `${name} (${ALREADY_KNOWN_SUFFIX})` : name,
      held: isHeld
    });
  }
  return rows;
}

/**
 * What to say when every spell a chooser could offer is already held.
 *
 * Distinct from the compendium-miss warning on purpose: "no matching
 * spells found in the compendium" for a character who simply knows them
 * all reads as the bug that sentence described for six releases.
 */
export function allKnownRefusal(title) {
  return `${title}: every spell it could offer is already on your sheet.`;
}
