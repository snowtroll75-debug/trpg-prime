import { resolveCasterStyle, resolveMemorisationStyle } from "../magic/caster-style.mjs";
import { elAdjustHP, elAdjustOf, elAdjustRows } from "../el-adjust.mjs";
import { runeKindOf, runesCountFor } from "../rune-bearing.mjs";
import { shieldDefenceWithPotency } from "../runes.mjs";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, SIZE_TABLE, TRADITIONS, classBonusForLevel, deriveLevelFromXP, hitPointMax, levelForXP } from "../config.mjs";
import { abilityBaseRange, abilityPointSummary, clampSkillRanks } from "../attributes.mjs";
import { investmentSlots } from "../magic-items.mjs";
import { controlBonusPerLevelFor, controlLevelCap } from "../magic/casting.mjs";
import { archetypeCastingSources } from "../magic/archetype-casting.mjs";
import { featSheetTradition, knightCastingSources, resolvedCasterLevel } from "../magic/feat-casting.mjs";
import { alignedControlAccess, alignedTraitsOf } from "../aligned.mjs";
import { actorSenses } from "../senses.mjs";
import { shieldBonusInForce } from "../combat/shield-bash.mjs";
import { armourguardBonus } from "../oils.mjs";
import { frightenedApplied, shieldBonusKept } from "../combat/passive-feats.mjs";
import { carryStrengthBonus, carriesAsAnimal, isStowed, stowageSummary } from "../stowage.mjs";
import { getActiveSpells, lockedPP } from "../magic/active-spells.mjs";
import {
  carriedWeightOf, coinWeight, effectiveArmourDR, itemStatus, brokenArmourDR, shieldBaseDR, shieldBlockDR
} from "../items.mjs";
import {
  normaliseSkills,
  normaliseSpecialistSkills
} from "../normalise.mjs";
import {
  adjustedMaxDexCap,
  clampToMaxDexBonus,
  encumbranceSteps,
  encumbranceSpeedSteps,
  isEncumbered,
  penaltyMagnitude,
  reducedPenalty,
  tightestMaxDexBonus,
  totalArmourCheckPenalty,
  weightAllowance
} from "../encumbrance.mjs";
// classItemOf and resolveClassProgression moved to class-derive.mjs
// with prepareClassProgression in 3.209.0; this file no longer calls
// them directly.
import { classCasts, powerPointAbilityBonus, powerPointMax } from "../class-progression.mjs";
import { crystalTotal } from "../magic/power-crystal.mjs";
import { classSkillTooltip } from "../class-skills.mjs";
import { applyClassSkillBonuses, prepareClassProgression, prepareSkillBudget, prepareSkillPointBudget } from "../class-derive.mjs";
import { creatureBonusEntries } from "../creature-bonuses.mjs";
import { isCompanion } from "../companion.mjs";
import { companionCurrentSize, companionFeatEntries } from "../companion-feats.mjs";
import { isFamiliar } from "../familiar.mjs";
import {
  familiarSaveEntries, prepareFamiliarHitPoints, prepareFamiliarProgression,
  prepareFamiliarSkills
} from "../familiar-derive.mjs";

/** Every ability name on an actor, for the familiar-ability gates. */
function abilityNamesOf(actor) {
  return Array.from(actor?.items ?? [])
    .filter((i) => i.type === "ability")
    .map((i) => i.name);
}
import { convictionAfterLevelling, convictionEnabled, convictionMax, heroesFortuneBonus } from "../conviction.mjs";
import { divineGraceModifier, divineResolveBonus, shieldAllyBonus } from "../crusader.mjs";
import { armourExemplarAdjust, battleReadinessBonus, warriorsResolveBonus } from "../fighter.mjs";
import { roguishSkillPicks, scoundrelsLuckBonus } from "../rogue.mjs";
import { songAndDanceModifier, withoutSongAndDance } from "../bard.mjs";
import { aspectAlignedTraits, aspectsOf } from "../divine-aspect.mjs";
import { enchantingSmileBonus, ENCHANTING_SMILE_SKILLS, forewarnedBonus, schoolsOf } from "../wizard.mjs";
import { fatigueStatus } from "../exhaustion.mjs";
import { isBodyArmour, stackedArmourDR, suitsWarning } from "../armour-stacking.mjs";
import { PETRIFIED_HARDNESS, defenceRestriction, keepsMagicOrArmour } from "../conditions/condition-rules.mjs";
import { armourTraining, effectiveTiers } from "../feats.mjs";
import { meetsSkillClassType, skillClassTypeRequirement } from "../skill-requirements.mjs";
import { affordableRanks } from "../skill-points.mjs";
import { isProficientWith, proficiencyProfile } from "../proficiency-rules.mjs";
import { PARTY_TYPE } from "../party.mjs";
import { withheldIncludes } from "../elixirs.mjs";

/** The actor's feat item names, for pure feat-lookup helpers. */
function featNamesOf(actor) {
  return Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => i.name);
}
import { woundThresholdPenalty } from "../combat/attack.mjs";
import {
  computeArmourModifiers, computeShieldModifiers,
  dragonhideResistances, eaogSaveConditionals, eaogSpellDCIncrease
} from "../item-quality.mjs";
import { parryBonus } from "../combat/attack.mjs";
import { rangedAbilityAdjustment } from "../combat/attack.mjs";
import { naturalArmourDR } from "../combat/damage.mjs";
import { parseGrantList } from "../grants.mjs";
import { creatureTraits, derivedImmunitySets, mindlessAttributePenalty } from "../creature-traits.mjs";
import { coversCondition, resolveImmunities } from "../defences.mjs";
import {
  criticalResistanceBonus,
  hasBlindsight,
  naturalDR,
  ownedCreatureType,
  ownedCreatureTypeSystem
} from "../creature-type-rules.mjs";
import { abilityNaturalDR } from "../creature-ability-rules.mjs";
import {
  SPEED_KEYS, normaliseMovement, resolveMovement, speedValue
} from "../combat/speed-pool.mjs";
import { grantedSpeeds, setSpeeds } from "../combat/granted-speeds.mjs";
import {
  effectiveLandSpeed,
  encumbranceSpeedPenalty,
  totalArmourSpeedPenalty
} from "../encumbrance.mjs";
import { clampResourceValue, resourcePercentage } from "../dice/resolution.mjs";
import {
  STACKING_OVERRIDES,
  TARGET_SLOTS,
  breakdownTooltip,
  resolveBonuses
} from "../bonuses/registry.mjs";
import {
  CONDITIONS,
  CUMULATIVE_CONDITION_IDS,
  conditionModifiers,
  resolveConditions
} from "../conditions/registry.mjs";
import {
  SUPPRESSION_FLAG, normaliseSuppression, suppressedConditionValues
} from "../conditions/suppression.mjs";
import {
  conditionEffectData,
  promptConditionValue
} from "../conditions/manager.mjs";
import { runeBonusesFor, runeBonusesForActor } from "../rune-effects.mjs";
import { wondrousBonusesForActor, bracersBaseDR } from "../wondrous-effects.mjs";
import { spellArmourEntries } from "../magic/spell-armour.mjs";
import { bucklerState, isBuckler } from "../buckler.mjs";
import { effectGrantedTraits } from "../magic/form-traits.mjs";
import { abilityGrantedTraits } from "../codex-trait-rules.mjs";
import { startingWealthFor } from "../starting-wealth.mjs";
import { coldWeatherConditionals, wornPerceptionPenalty } from "../armour-descriptions.mjs";
import { concealableWeaponConditionals } from "../stealth.mjs";
import { goodsConditionals } from "../goods.mjs";
import { luckOnCreate } from "../luck.mjs";
import { abilitiesIgnoreArmourPenalties, abilitySkillSwaps } from "../creature-ability-rules.mjs";

/** Whether Speed is rounded down to the nearest 5 ft (battle-grid play). */
function gridSpeedRounding() {
  try {
    return Boolean(game.settings.get("trg-prime", "gridSpeedRounding"));
  } catch {
    return true;
  }
}

function sum(source, fields) {
  return fields.reduce((total, field) => {
    return total + Number(source?.[field] ?? 0);
  }, 0);
}

/**
 * Convert a resolved breakdown into the modifier list TRGCheck expects.
 * Suppressed entries are included deliberately: the check re-applies the
 * stacking rules so the chat card can show what was discarded and why.
 */
function toCheckModifiers(resolved, additiveLabel) {
  const modifiers = [];

  if (resolved.additive) {
    modifiers.push({
      label: additiveLabel,
      value: resolved.additive,
      type: "untyped"
    });
  }

  for (const entry of resolved.entries) {
    modifiers.push({
      label: entry.label,
      value: entry.value,
      type: entry.type
    });
  }

  return modifiers;
}

/** Resolve a target and write the derived values back onto it. */
function applyTarget(node, { actor, path, slotTypes, extra = 0, additiveLabel, overrides, poolFilter }) {
  let pool = actor.getBonusPool(path);
  if (poolFilter) pool = pool.filter(poolFilter);

  const resolved = resolveBonuses({
    slots: node,
    slotTypes,
    pool,
    stacking: overrides ?? {},
    extra
  });

  node.total = resolved.total;
  node.breakdown = resolved;
  node.tooltip = breakdownTooltip(resolved, additiveLabel);
  node.checkModifiers = toCheckModifiers(resolved, additiveLabel);

  return resolved;
}

/**
 * Read the actor's active condition effects, expand them through the
 * includes/overrides graph, and push their automatic penalties into the bonus
 * pools. Must run before any applyTarget call.
 */
function prepareConditions(system, actor) {
  const direct = new Map();

  for (const effect of actor.effects ?? []) {
    if (effect.disabled) continue;

    for (const status of effect.statuses ?? []) {
      if (!CONDITIONS[status]) continue;

      const flagged = Number(
        effect.getFlag?.("trg-prime", "value") ??
        effect.flags?.["trg-prime"]?.value ??
        1
      );
      const value = Number.isFinite(flagged) && flagged > 0 ? flagged : 1;

      // Cumulative-by-rule conditions sum across sources; everything else
      // keeps the most severe instance.
      const cumulative = CUMULATIVE_CONDITION_IDS.includes(status);
      const existing = direct.get(status) ?? 0;
      direct.set(status, cumulative ? existing + value : Math.max(existing, value));
    }
  }

  // SMELLING SALTS (page 179; 3.577.0): a dying creature woken by them is
  // conscious but still Dying. See `withheldIncludes` in elixirs.mjs.
  const dyingEffect = Array.from(actor.effects ?? [])
    .find((e) => !e.disabled && (e.statuses?.has?.("dying") || Array.from(e.statuses ?? []).includes("dying")));
  const withhold = withheldIncludes(actor.flags?.["trg-prime"], dyingEffect?.id ?? null);
  // FATIGUE 10 IS UNCONSCIOUSNESS (3.621.0; Graham's R6 of block 39, "Lets
  // automate these"). Granted while the value stands at 10 or more, and gone
  // when it falls — "until your fatigued condition is reduced". Fatigue 20's
  // death is `isDead`'s (combat/death-state.mjs).
  const grants = fatigueStatus(direct.get("fatigued") ?? 0) ? [["unconscious", "fatigued"]] : [];
  const { effective, granted } = resolveConditions(direct.keys(), { withhold, grants });

  const rawValues = new Map();
  for (const id of effective) {
    rawValues.set(id, direct.get(id) ?? 1);
  }

  // IGNORING A POINT (3.439.0). Banish Fatigue and Confident Veil do not
  // remove a condition, they subtract from what it is worth — so the
  // subtraction happens HERE, on the effective values, and every reader
  // downstream follows without being told: `conditionModifiers` takes
  // its numbers from this map, and so does `getConditionValue`.
  //
  // ONE PLACE, and that is the whole argument. `pain-tolerance.mjs`
  // suppresses by writing the reduced number onto the actor and having
  // to put it back — which it cannot do if the condition was cleared in
  // between, as its own code admits. Nothing has to be put back here:
  // the suppression exists only as a reading of a live effect, so when
  // the spell ends it is simply no longer read.
  //
  // The raw map is kept beside it, so a rule that wants what the
  // character actually HAS rather than what they are ignoring can still
  // be given it.
  const suppressions = [];
  for (const effect of actor.effects ?? []) {
    if (effect.disabled) continue;
    const spec = normaliseSuppression(effect.flags?.["trg-prime"]?.[SUPPRESSION_FLAG]);
    if (spec) suppressions.push(spec);
  }
  const values = suppressedConditionValues(rawValues, suppressions);

  // THE CONDITIONS AS APPLIED, BEFORE ANY OVERRIDE (3.621.0; Appendix 2,
  // block 39's A3). "Stunned overrides Slowed" hides Slowed from the sheet,
  // but the AP arithmetic still counts it: "you would lose 1 AP from Stunned
  // and then lose only 1 additional AP by being Slowed".
  actor._trgConditions = { effective, granted, values, rawValues, suppressions, direct };

  const skillAbilities = Object.fromEntries(
    Object.entries(system.skills ?? {}).map(([key, skill]) => [key, skill.ability])
  );
  const specialistAbilities = Object.fromEntries(
    Object.entries(system.specialistSkills ?? {}).map(([key, skill]) => [
      key,
      skill.ability
    ])
  );

  // SPECIFIC LOCATION INJURIES (page 204, optional; R14). The location
  // the critical struck, recorded on the Injured effect itself by the
  // attack workflow when the setting is on — read back here so the
  // penalty can be narrowed to the actions that location governs. Null,
  // and therefore inert, in every game that has not switched it on.
  const injuryLocation = Array.from(actor.effects ?? [])
    .filter((e) => !e.disabled)
    .map((e) => e.getFlag?.("trg-prime", "injuryLocation"))
    .find(Boolean) ?? null;

  const modifiers = conditionModifiers({
    values,
    skillAbilities,
    specialistAbilities,
    attackAbility: system.combat?.attack?.abilityKey ?? "strength",
    castingAbility: system.magic?.castingAbility ?? "intelligence",
    injuryLocation
  });

  for (const modifier of modifiers) {
    actor.addBonus(modifier.target, {
      label: modifier.label,
      value: modifier.value,
      type: modifier.type,
      source: "condition"
    });
  }
}

/** Equipped armour and shields, normalised to what the ACP/Max Dex logic
 * needs. Each piece carries whether THIS character is proficient with it,
 * which is what doubles the check penalty. */
function equippedProtection(actor) {
  // Built once per call rather than per piece — a character wearing a
  // helmet, greaves, bracers, a hauberk and a shield would otherwise
  // rebuild the same profile five times inside one prepare.
  const profile = proficiencyProfile(actor);
  const items = actor?.items;
  const pieces = [];
  for (const item of items ?? []) {
    if (item.type !== "armour" && item.type !== "shield") continue;
    if (!item.system?.equipped) continue;

    const traitKeys = parseGrantList(item.system.superiorTraits || "");
    const quality = item.system.quality || "standard";
    const material = item.system.material || "";

    let penalty = item.system.penalty;
    let maxDexBonus = item.type === "armour" ? item.system.maxDexBonus : -1;
    // Armour records a Speed penalty separately from its check penalty
    // (Chapter 6). Only the check penalty was ever read.
    const speedPenalty = item.type === "armour" ? item.system.speedPenalty : 0;
    let speedPenaltyDelta = 0;

    // FLOORED AT ZERO, not added (3.573.0). A reduction added to a stored
    // negative penalty inverts on armour that already has none: Padded
    // and Leather store 0, so a +2 reduction became a penalty of 2. See
    // `reducedPenalty`.
    // A SPECIFIC ITEM'S PRINTED FIGURES ARE FINAL (3.615.0, Graham's R3 of
    // block 36). Air Drake Armour prints "ACP -3; MAX DEX 6" for the master
    // armour it is, and the pack stores exactly that — so applying master
    // quality on top made it ACP -2, Max Dex 8.
    const printedFinal = Boolean(item.flags?.["trg-prime"]?.specificItem);
    if (printedFinal) {
      // nothing to add: the stored ACP, Max Dex and Speed are the page's.
    } else if (item.type === "armour") {
      const mods = computeArmourModifiers(quality, material, traitKeys, {
        category: item.system.category || ""
      });
      penalty = reducedPenalty(penalty, mods.acpDelta);
      speedPenaltyDelta = mods.speedPenaltyDelta ?? 0;
      if (maxDexBonus !== -1) maxDexBonus += mods.maxDexBonus;
    } else {
      const mods = computeShieldModifiers(quality, material, traitKeys);
      penalty = reducedPenalty(penalty, mods.acpDelta);
    }
    // FORTIFICATION IS THIS PIECE'S OWN ACP (3.615.0, B5 of block 36):
    // "this rune makes the armour bulkier increasing its ACP by -1". It used
    // to be added to the total AFTER Iron Walker and Armour Exemplar had
    // worked, so neither could offset it, although the comment there said
    // they could. On the piece, it is doubled for non-proficiency and
    // reduced by both, like the rest of the armour's penalty.
    if (item.type === "armour" && runesCountFor(item, Array.from(items ?? []))) {
      const bulk = Number(runeBonusesFor(item).acpPenalty ?? 0) || 0;
      if (bulk) penalty = -(penaltyMagnitude(penalty) + bulk);
    }

    // ETERNAL ESSENCE (Creature Codex; 3.631.0): "any armour or shield
    // wielded by the eternal is an extension of its will and the creature
    // suffers no adverse effects from armour or shields such as ACP, Max
    // Dex or Speed Penalty." The piece keeps its DR and DB; its penalties
    // are struck here, where every piece is read, so the three paths that
    // total them (ACP, the Dex cap, the Speed penalty) see none.
    if (abilitiesIgnoreArmourPenalties(Array.from(items ?? []))) {
      penalty = 0;
      speedPenaltyDelta = penaltyMagnitude(speedPenalty);
      maxDexBonus = -1;
    }

    pieces.push({
      penalty,
      speedPenalty,
      speedPenaltyDelta,
      // "Be aware that if you wear armour that you are not proficient in,
      // all penalties are doubled" (Armour Proficiency, Chapter 5).
      //
      // This used to read `item.system.proficiency !== "none"` — a field
      // every armour and shield in the pack ships as "", so the doubling
      // could never fire for anybody. It is also a question about the
      // WEARER, which the armour has no way to answer.
      proficient: isProficientWith(profile, item),
      maxDexBonus,
      maxDexModifier: item.type === "armour" ? Math.trunc(Number(item.system?.maxDexModifier) || 0) : 0,
      // A DESTROYED SHIELD GIVES NO DB (3.575.0). Its DR already went to 0
      // (`effectiveShieldDR`) while its DB stayed whole. A BROKEN one keeps
      // its DB: Graham, 19 Sep 2026, a shield is armour for the Broken
      // condition's exception, which is also why its DR only halves.
      // AND ITS POTENCY IS PART OF THAT BONUS (3.615.0, R2): "the bonus
      // provided by a shield increases the existing shield DB bonus" — so it
      // is suppressed with the shield, and stacks with armour's item bonus.
      defenceBonus: item.type === "shield" && itemStatus(item.system?.hp?.value, item.system?.hp?.max) !== "destroyed"
        ? shieldDefenceWithPotency(item.system)
        : 0,
      // Which piece is a buckler, so a buckler whose arm is busy can be
      // left out of the shield bonus rather than subtracted from it.
      buckler: isBuckler(item)
    });
  }
  return pieces;
}

/**
 * Armour Check Penalty (Chapter 6): "an armour check penalty applies to
 * all Dexterity- and Strength-based skill checks." Summed across every
 * equipped armour piece and shield, doubled per-piece for non-proficiency,
 * and pushed into the same bonus pools Dazed/Weakened already use — so it
 * must run before prepareSkills, same as prepareConditions.
 */
/**
 * Protection (Chapter 6): the Combat tab's summary DR/Hardness for
 * armour and shield, derived from whatever is actually equipped
 * rather than typed in manually. DR sums across every equipped
 * armour piece — matching the same logic already proven in the
 * attack workflow's own DR pipeline (effectiveArmourDR, broken/
 * destroyed handling) — since DR is the one value that genuinely
 * stacks additively in this system. Hardness uses the first equipped
 * piece found, matching the same "one primary body armour item"
 * assumption already used elsewhere (Critical Amendment) — hardness
 * is a property of a specific item, not something that sums.
 */
function prepareArmourProtection(system, actor) {
  const armourItems = Array.from(actor.items ?? []).filter(
    (item) => item.type === "armour" && item.system?.equipped
  );
  // ONE SUIT COUNTS (3.621.0; block 39's A2, Graham's R3): the best body
  // armour's DR, and the fittings on top of it. See armour-stacking.mjs.
  const armourStack = stackedArmourDR(armourItems.map((item) => {
    const status = itemStatus(item.system.hp?.value, item.system.hp?.max);
    const dr = effectiveArmourDR(item);
    return {
      name: item.name,
      suit: isBodyArmour(item),
      dr: status === "destroyed" ? 0 : (status === "broken" ? brokenArmourDR(dr) : dr)
    };
  }));
  const armourDR = armourStack.dr;

  const shieldItems = Array.from(actor.items ?? []).filter(
    (item) => item.type === "shield" && item.system?.equipped
  );
  // Summed by items.mjs rather than here, so the rule can be RUN in a
  // harness (lesson 2) and so Shield Block reads the same definition
  // this does instead of a worse copy of it (lesson 13).
  const shieldDR = shieldBaseDR(shieldItems);

  if (system.combat?.naturalArmourFlat && system.combat?.naturalArmourBase) {
    // AN "INCREASE" ADDS (3.621.0; Graham's R2 of block 39). Barkskin's
    // "natural armour DR increases by +1" and Animal Spirit's Bear were
    // pooled as a status bonus to the flat value, which then competed
    // highest-wins with the creature's own natural DR — so on a companion
    // with natural DR 2 Barkskin did nothing. Only an entry typed as natural
    // armour is a natural armour VALUE; every other entry aimed here is an
    // increase, added to whichever value wins, untyped (the "status" was
    // never printed), as Tough Hide's ruling did (3.233.1).
    const naturalIncrease = actor.getBonusPool("system.combat.naturalArmourFlat")
      .filter((entry) => entry?.type !== "naturalArmour")
      .reduce((sum, entry) => sum + (Number(entry?.value) || 0), 0);
    applyTarget(system.combat.naturalArmourFlat, {
      actor,
      path: "system.combat.naturalArmourFlat",
      slotTypes: TARGET_SLOTS.naturalArmourFlat,
      additiveLabel: "Flat Natural Armour",
      poolFilter: (entry) => entry?.type === "naturalArmour"
    });
    applyTarget(system.combat.naturalArmourBase, {
      actor,
      path: "system.combat.naturalArmourBase",
      slotTypes: TARGET_SLOTS.naturalArmourBase,
      additiveLabel: "Base Natural Armour"
    });
    if (system.combat?.naturalArmour) {
      system.combat.naturalArmour.dr = Math.max(0, naturalArmourDR(
        system.combat.naturalArmourFlat.total,
        system.combat.naturalArmourBase.total,
        system.combat?.bdb?.total ?? 0
      ) + naturalIncrease);
      system.combat.naturalArmour.increase = naturalIncrease;
    }
  }

  // Bonus DR (Graham's ruling): a pool-only target for flat DR bonuses
  // that ALWAYS ADD (Dracoris, Iron Hide) — unlike Natural Armour's
  // highest-wins rule. Derived in memory each cycle; damage resolution
  // adds it alongside natural armour (whole-body, so a critical hitting
  // an unarmoured location cannot bypass it).
  if (system.combat) {
    system.combat.dr = system.combat.dr && typeof system.combat.dr === "object"
      ? system.combat.dr : {};
    applyTarget(system.combat.dr, {
      actor,
      path: "system.combat.dr",
      slotTypes: TARGET_SLOTS.dr,
      additiveLabel: "Bonus DR"
    });

    // Creature Type (Creature Codex): Construct — "will have natural [DR]
    // that reduces damage against them accordingly... determined by the
    // constructs race." A per-instance GM value (no fixed formula in the
    // book), so it's read straight off the owned item and added directly
    // to the pool's total rather than routed through another typed slot —
    // matching Dracoris/Iron Hide's own "always adds" behaviour above.
    const creatureTypeDR = naturalDR(ownedCreatureTypeSystem(actor));
    if (creatureTypeDR) {
      system.combat.dr.total = (Number(system.combat.dr.total) || 0) + creatureTypeDR;
    }

    // Creature Codex: Survival Instinct adds Natural DR equal to the
    // creature's level, from an ability rather than a type. Same pool,
    // same "always adds" footing as the line above.
    const abilityDR = abilityNaturalDR(Array.from(actor.items ?? []), system.identity?.level ?? 0);
    if (abilityDR) {
      system.combat.dr.total = (Number(system.combat.dr.total) || 0) + abilityDR;
    }

    // PETRIFIED (3.621.0; Appendix 2, block 39's R7): "You become an object
    // with … Hardness 8". An object's Hardness is the DR its damage meets
    // (Chapter 6), so it joins the always-adding pool while the stone lasts.
    if (actor?.hasCondition?.("petrified")) {
      system.combat.dr.total = (Number(system.combat.dr.total) || 0) + PETRIFIED_HARDNESS;
      system.combat.dr.petrified = PETRIFIED_HARDNESS;
    }

    // WONDROUS DR (Chapter 11). The Amulet of Natural Resilience's status
    // DR is POOLED in prepareCombat (3.617.0, A13 of block 37) — added raw
    // here it stacked with Mage Armour's status DR. The Bracers of Armour
    // are not a bonus at all but armour's Base DR (Graham's R17): recorded
    // here, and taken as the higher of them and worn armour's DR where
    // damage is resolved.
  }

  if (system.combat) {
    // MAGE ARMOUR JOINS THE BRACERS (3.617.2; MA1, MA2): one more Base DR
    // entry, and only the highest counts. `system.combat.bracers` keeps its
    // name and now holds whichever Base DR armour is in force.
    const spellArmour = spellArmourEntries(Array.from(actor.effects ?? []));
    system.combat.spellArmour = { cr: spellArmour.cr, rigid: spellArmour.rigid };
    system.combat.bracers = bracersBaseDR(
      [...wondrousBonusesForActor(Array.from(actor.items ?? [])).baseDR, ...spellArmour.entries],
      Number(globalThis.game?.time?.worldTime ?? 0),
      // SCALED BY BSB, as Mage Armour is (3.617.1, Graham's Q1).
      Math.max(0, Math.trunc(Number(system.magic?.bsb ?? 0))) + Math.max(0, Math.trunc(Number(system.progression?.bsb ?? 0)))
    );
    // The pool's state, where the sheet prints what the wondrous items do.
    const b = system.combat.bracers;
    if (b.itemId && b.source !== "effect" && Array.isArray(system.combat.wondrousSummary)) {
      system.combat.wondrousSummary.push(b.inert
        ? `${b.itemName}: inert — the magical armour returns at full HP within the hour`
        : `${b.itemName}: DR ${b.effective}, magical armour ${b.hp}/${b.max} HP`);
    }
  }

  if (system.combat?.armour) {
    system.combat.armour.dr = armourDR;
    system.combat.armour.suitsWarning = suitsWarning(armourStack);
    system.combat.armour.hardness = Number(armourItems[0]?.system?.hardness ?? 0);
  }

  // Armour Master archetype (Chapter 5): "Whilst wearing armour you gain
  // Critical Resistance 1" — a derived value the critical workflow reads
  // from system.combat.criticalResistance; conditional on actually
  // wearing armour, so it lives here where the worn pieces are known.
  if (armourItems.length && featNamesOf(actor)
    .some((n) => String(n).trim().toLowerCase() === "armour master")) {
    system.combat.criticalResistance =
      (Number(system.combat.criticalResistance) || 0) + 1;
  }

  // FORTIFICATION (Chapter 11): "the rune provides CR 1 / 2 / 3 / 4",
  // from every equipped runed piece. Adds alongside the feats below,
  // which is how every other source of CR in this system behaves.
  {
    const fortification = runeBonusesForActor(Array.from(actor.items ?? [])).criticalResistance;
    if (fortification) {
      system.combat.criticalResistance =
        (Number(system.combat.criticalResistance) || 0) + fortification;
    }
  }

  // Critical Resilience / Improved (Class, Chapter 5): unconditional
  // Critical Resistance 1, rising to 2 total with the Improved feat
  // ("increases to 2" — replaced, not stacked). Adds alongside Armour
  // Master's armour-conditional point.
  {
    const names = featNamesOf(actor).map((n) => String(n).trim().toLowerCase());
    const resilience = names.includes("critical resilience, improved") ? 2
      : names.includes("critical resilience") ? 1 : 0;
    if (resilience) {
      system.combat.criticalResistance =
        (Number(system.combat.criticalResistance) || 0) + resilience;
    }
  }

  // Armour Grants CR (Chapter 7 optional rule, confirmed by Graham):
  // "a character wearing medium armour has CR 1 and heavy armour CR 2."
  // Recorded SEPARATELY (armourCriticalResistance) as well as added to
  // the total, because location-targeted attacks (Ambush, Vital Strike)
  // bypass exactly this portion where the location is unarmoured.
  {
    let armourCR = 0;
    try {
      if (game?.settings?.get?.("trg-prime", "armourGrantsCR")) {
        for (const item of armourItems) {
          const category = String(item.system?.category ?? "").trim().toLowerCase();
          const cr = category === "heavy" ? 2 : category === "medium" ? 1 : 0;
          if (cr > armourCR) armourCR = cr;
        }
      }
    } catch (err) { /* settings unavailable during early init */ }
    // MAGE ARMOUR'S CR (CL 8+), while it has HP (MA4). Armour's CR, so a
    // named unarmoured location bypasses it as it bypasses the rest (MA3).
    const spellArmourCR = Math.max(0, Number(system.combat.spellArmour?.cr) || 0);
    armourCR += spellArmourCR;
    system.combat.armourCriticalResistance = armourCR;
    if (armourCR) {
      system.combat.criticalResistance =
        (Number(system.combat.criticalResistance) || 0) + armourCR;
    }
  }

  // Creature Type: Construct 4, Elemental 2, Eternal 2 — fixed per type
  // (every member gets the same value), read straight off the owned item
  // rather than routed through an Active Effect, matching how Armour
  // Master's and Critical Resilience's own contributions are computed
  // just above.
  {
    const creatureTypeCR = criticalResistanceBonus(ownedCreatureTypeSystem(actor));
    if (creatureTypeCR) {
      system.combat.criticalResistance =
        (Number(system.combat.criticalResistance) || 0) + creatureTypeCR;
    }
  }
  // SENSES (Chapter 8, and the Codex's stat block): "Each sense is
  // listed along with its range."
  //
  // Derived here rather than computed by the sheet because the ranges
  // depend on Wisdom and on which Enhanced feats are owned, and both of
  // those move — a sheet that worked them out once would show the range
  // the character had when the sheet was opened.
  if (system.details) {
    system.details.senses = actorSenses(system, Array.from(actor.items ?? []));
  }

  // ALIGNED CONTROL (Creature Codex, Appendix): whether this actor can
  // take the action at all. Published as a number because that is what
  // `meetsActionRequirement` reads, and as the routes themselves because
  // the action's own card names which one is being used — the same field
  // consumed twice, which is what keeps it from being decoration.
  if (system.combat) {
    const access = alignedControlAccess(system, Array.from(actor.items ?? [])
      .filter((item) => item.type === "feat")
      .map((item) => item.name));
    system.combat.alignedControl = {
      available: access.available ? 1 : 0,
      routes: access.routes
    };
    // SENSE ALIGNED (3.632.0): the number of aligned traits it carries.
    system.combat.alignedSense = alignedTraitsOf(system).length;
  }
  if (system.combat?.shield) {
    system.combat.shield.dr = shieldDR;
    // What a Shield Block actually stops (Graham's ruling, 3.233.5): a
    // shield's DR is a BASE value and scales with BDB exactly as worn
    // armour's does, through the same Chapter 6 multiplier.
    //
    // `dr` stays the raw sum for the same reason armour's does — it is
    // the figure you can check against the item, and the multiplier
    // belongs where the value is used. `blockDR` is that use. Both are
    // kept because a player looking at a masterwork shield wants to see
    // its 3, and a player pressing Shield Block wants to see the 9.
    system.combat.shield.blockDR = shieldBlockDR(shieldItems, system.combat?.bdb?.total ?? 0);
    system.combat.shield.hardness = Number(shieldItems[0]?.system?.hardness ?? 0);
  }
}

function prepareArmourCheckPenalty(system, actor) {
  const pieces = equippedProtection(actor);
  let total = totalArmourCheckPenalty(pieces);

  // Iron Walker (Chapter 5): "the ACP for any armour that you wear is
  // reduced by 1" — per worn piece that actually has a penalty.
  const training = armourTraining(featNamesOf(actor));
  if (training.acpReductionPerPiece > 0 && total > 0) {
    const penalisedPieces = pieces.filter((p) => Math.abs(Number(p.penalty ?? 0)) > 0).length;
    total = Math.max(0, total - training.acpReductionPerPiece * penalisedPieces);
  }

  // Armour Exemplar (Fighter, 3rd): "Whenever you are wearing armour,
  // you reduce the armour check penalty by 1 (to a minimum of 0)" — the
  // TOTAL, once, not per piece (contrast Iron Walker's explicit "for
  // any armour that you wear"), scaling to −4 at 15th. Gated on an
  // actual armour piece being worn: a shield alone is carried, not worn.
  const wearingArmour = Array.from(actor?.items ?? []).some(
    (i) => i.type === "armour" && i.system?.equipped
  );
  const exemplar = armourExemplarAdjust(
    actor, actor.system?.identity?.level ?? 0, wearingArmour
  );
  if (exemplar.acpReduction > 0 && total > 0) {
    total = Math.max(0, total - exemplar.acpReduction);
  }

  // FORTIFICATION's -1 is on the piece now (3.615.0, B5) — see
  // `equippedProtection` — so Iron Walker and Armour Exemplar see it.

  if (system.combat?.acp) system.combat.acp.total = total;
  if (!total) return;

  const label = `Armour Check Penalty ${total}`;
  for (const [key, skill] of Object.entries(system.skills ?? {})) {
    if (skill.ability === "dexterity" || skill.ability === "strength") {
      actor.addBonus(`system.skills.${key}`, {
        label,
        value: -total,
        type: "untyped",
        source: "acp"
      });
    }
  }
  for (const [key, skill] of Object.entries(system.specialistSkills ?? {})) {
    if (skill.ability === "dexterity" || skill.ability === "strength") {
      actor.addBonus(`system.specialistSkills.${key}`, {
        label,
        value: -total,
        type: "untyped",
        source: "acp"
      });
    }
  }
}

/**
 * HELMETS (Chapter 6, armour descriptions): "-1 item penalty to perception
 * checks" for the leather and metal helmets, "-2" for the full helmet —
 * and, on Graham's ruling of 19 Sep 2026, the same for a suit whose traits
 * carry Helm (-1) or Full Helm (-2). The worst one worn, as an ITEM
 * penalty into Perception's pool. Not applied before 3.575.0 by anything:
 * the only thing `isHelmet` ever decided was hit location.
 */
function prepareHelmPerception(system, actor) {
  if (!system.skills?.perception) return;
  const worst = wornPerceptionPenalty(Array.from(actor?.items ?? []));
  if (!worst) return;
  actor.addBonus("system.skills.perception", {
    label: `${worst.source} (helm)`,
    value: worst.value,
    type: "item",
    source: "helm"
  });
}

/**
 * Level (Chapter 1/3): for a PLAYER CHARACTER, Level is read off the XP
 * total (config.mjs's deriveLevelFromXP — 10,000 per level, Graham's
 * ruling) rather than typed in separately; `xp.max` follows alongside,
 * purely for display, as the threshold that raises them to the NEXT
 * level. NPCs are untouched — see deriveLevelFromXP's own comment.
 *
 * Class Bonus still derives from Level unconditionally, for every actor
 * type, exactly as before this existed — it just now reads whichever
 * Level the line above settled on.
 */
export function prepareIdentity(system, actor) {
  const identity = system.identity;
  if (!identity) return;

  deriveLevelFromXP(identity, actor?.type);

  identity.classBonus = classBonusForLevel(identity.level ?? 0);
}

/**
 * Resolve the character's class table once, onto `system.progression`.
 *
 * Everything downstream reads this one object rather than reaching for
 * the class item itself, so there is a single place where "does this
 * character have a class with a table?" gets answered — and a single
 * `null` meaning "leave the manual fields alone", which is what every
 * NPC and every world without class data installed still relies on.
 *
 * Derived only. Nothing here is written back to the database.
 */
/** The weight (lb) currently carried, honouring the worn-armour half-weight
 * discount. Shared by the Encumbered penalty (needed early, inside
 * prepareAttributes) and the Encumbrance display (prepareEncumbrance). */
function computeCarriedWeight(items, currency) {
  const itemWeight = Array.from(items ?? []).reduce((total, item) => {
    if (!Object.hasOwn(item.system ?? {}, "weight")) return total;
    // STOWED IN A WEIGHTLESS CONTAINER. A Never-Ending Stash Sack
    // "magically adjusts and always weighs the same amount, regardless
    // of the weight of the objects placed within it" — so what is in
    // one is not weight anybody is carrying. See `stowage.mjs`. Counted
    // below, as one sum: only what fits in an invested sack is free.
    if (isStowed(item)) return total;

    // Weight is not always per unit — ammunition is weighed by the
    // bundle. carriedWeightOf owns that, and owns it in one place so the
    // sheet, the party pile and this agree. See items.mjs.
    return total + carriedWeightOf(item, {
      worn: item.type === "armour" && item.system.equipped
    });
  }, 0);

  // OVER CAPACITY, OR NO SACK AT ALL, IS CARRIED (3.617.0, Graham's R22 of
  // block 37): what is stowed beyond the invested sacks' capacity counts as
  // weight, and so does everything stowed when no invested sack holds it.
  const stowedOverflow = stowageSummary(Array.from(items ?? [])).over;

  return itemWeight + stowedOverflow + coinWeight(currency);
}

function prepareAttributes(system, actor) {
  const baseValues = {};
  for (const key of ATTRIBUTE_KEYS) {
    baseValues[key] = Number(system.attributes?.[key]?.base ?? 0);
  }
  if (system.identity) {
    system.identity.abilityPoints = abilityPointSummary(
      system.identity.level ?? 0,
      baseValues
    );
  }

  // Creature Size Modifiers (Chapter 1): Str/Dex bonuses from size apply
  // before either attribute resolves, same as any other untyped bonus.
  const sizeEntry = SIZE_TABLE[system.identity?.size] ?? null;
  if (sizeEntry) {
    if (sizeEntry.strMod) {
      actor.addBonus("system.attributes.strength", {
        label: `Size (${sizeEntry.label})`,
        value: sizeEntry.strMod,
        type: "untyped",
        source: "size"
      });
    }
    if (sizeEntry.dexMod) {
      actor.addBonus("system.attributes.dexterity", {
        label: `Size (${sizeEntry.label})`,
        value: sizeEntry.dexMod,
        type: "untyped",
        source: "size"
      });
    }
  }

  // WONDROUS ATTRIBUTE BONUSES (Chapter 11) — the Agile Sash's status
  // bonus to Dexterity — must be contributed HERE, before the loop
  // below resolves each attribute's pool.
  //
  // Found by Graham's live testing at 3.247.2: contributed from
  // prepareCombat, as the skill and save bonuses correctly are, an
  // attribute bonus is added to a pool that has ALREADY BEEN APPLIED and
  // is simply dropped. It did not throw and nothing warned; the sheet
  // just said "+2 status to Dexterity" in its own summary while
  // Dexterity did not move. A silent version of the DR crash, one
  // release later, and worse for being silent.
  //
  // The lesson is the ordering one: WHEN a bonus is contributed decides
  // whether it counts, and each family of target has its own moment.
  for (const wondrousAttribute of wondrousBonusesForActor(Array.from(actor.items ?? [])).bonuses) {
    if (!wondrousAttribute.target.startsWith("system.attributes.")) continue;
    actor.addBonus(wondrousAttribute.target, wondrousAttribute.entry);
  }

  for (const key of ATTRIBUTE_KEYS) {
    const attribute = system.attributes?.[key];
    if (!attribute) continue;

    // Mindless (Appendix 3): "-25 racial modifier to their Intelligence
    // and Charisma". Contributed to the bonus pool as the racial bonus
    // it says it is, so Appendix 1's stacking applies to it exactly as
    // to any other racial modifier, rather than being subtracted from
    // the total behind the pool's back.
    const mindlessPenalty = mindlessAttributePenalty(system, key);
    if (mindlessPenalty) {
      actor.addBonus(`system.attributes.${key}`, {
        label: "Mindless",
        value: mindlessPenalty,
        type: "race",
        source: "creature-trait"
      });
    }

    applyTarget(attribute, {
      actor,
      path: `system.attributes.${key}`,
      slotTypes: TARGET_SLOTS.attribute,
      additiveLabel: "Base",
      overrides: STACKING_OVERRIDES.attribute
    });

    // Encumbered (Chapter 6): "-1 penalty to your Dex modifiers for each
    // 20 lb in excess" of Weight Allowance. Strength resolves immediately
    // before Dexterity in ATTRIBUTE_KEYS, so its total is already final
    // here — the penalty is pushed into Dexterity's own bonus pool before
    // that attribute's applyTarget call is reached on the next iteration.
    if (key === "strength") {
      const carried = computeCarriedWeight(actor.items, system.currency);
      // Hauler (Chapter 5): "strength is considered to be 2 higher when
      // determining encumbrance limits" — applied to the allowance
      // derivation only, never to Strength itself (pure-strength TESTS
      // stay a note; there is no such check type to hook). A worn
      // Backpack's "+1 Str for carrying capacity" is the same shape and
      // rides the same hook; `carryStrengthBonus` owns both.
      const carryBonus = carryStrengthBonus({
        featNames: featNamesOf(actor),
        items: Array.from(actor.items ?? []),
        animal: carriesAsAnimal(actor.type, system)
      });
      const allowance = weightAllowance(attribute.total + carryBonus);
      // TWO STEP COUNTS, ROUNDED DIFFERENTLY (3.573.0). The Dexterity
      // penalty is per 20 lb "or part thereof" and the Speed penalty is
      // per full 20 lb — page 146 prints the phrase on one and not the
      // other, and Graham ruled page 146 governs. See `encumbranceSteps`.
      const steps = encumbranceSteps(carried, allowance);
      const speedSteps = encumbranceSpeedSteps(carried, allowance);
      if (steps > 0) {
        // "1 lb over" reads better than "1 x 20 lb over" for the part-step
        // that this rounding now produces.
        const over = Math.max(0, Math.round((carried - allowance) * 10) / 10);
        actor.addBonus("system.attributes.dexterity", {
          label: `Encumbered (${over} lb over allowance)`,
          value: -steps,
          type: "untyped",
          source: "encumbrance"
        });
      }
      // Stashed for prepareCombat's Speed penalty and prepareEncumbrance's
      // display, so the weight is only ever computed once per cycle.
      actor._trgEncumbranceSteps = steps;
      actor._trgEncumbranceSpeedSteps = speedSteps;
      actor._trgEncumbered = isEncumbered(carried, allowance);
    }
  }
}

/**
 * Max Hit Points (Chapter 1): "Size Modifier + Con (per level) + Class
 * Mod (per level) + Other Modifiers." "Class Mod" comes from the class
 * item's progression table when there is one, and from the manual
 * hpPerLevel field otherwise — NPCs, and characters with no class.
 * Current HP (value) stays exactly as manually tracked; only the ceiling
 * is derived.
 */
function prepareResources(system, actor) {
  const hp = system.resources?.hp;
  if (!hp) return;

  // The class's printed HP per level wins over the manual field whenever
  // there is one. `hpPerLevel` was only ever a stand-in for it — the
  // sheet's own tooltip said so — and leaving both live would mean a
  // Fighter whose 12 got quietly added to whatever a previous GM typed.
  // The manual field stays for NPCs and for worlds with no class data.
  // `||`, not `??`: a class item carrying a table but a zero HP rate —
  // half-authored homebrew, or a future class mid-build — would otherwise
  // pin every character to 0 HP per level AND hide the manual field they
  // would need to fix it with.
  const classHP = system.progression?.hitPoints;
  hp.max = hitPointMax({
    size: system.identity?.size,
    conTotal: system.attributes?.constitution?.total ?? 0,
    level: system.identity?.level ?? 1,
    hpPerLevel: classHP || hp.hpPerLevel || 0,
    other: hp.other ?? 0
  });

  // TOUGH (Chapter 11): "a status bonus to HP: +20 per tier", from every
  // equipped suit of armour carrying the rune. Added here rather than
  // through the typed pool because max HP is not a pooled target — it is
  // computed outright by hitPointMax — so the rune's contribution is
  // folded in at the one place the ceiling is settled. Highest wins, as
  // a status bonus should: two Tough items do not stack.
  const toughBonus = Math.max(0, ...runeBonusesForActor(Array.from(actor?.items ?? []))
    .bonuses.filter((b) => b.target === "system.resources.hp.max")
    .map((b) => Number(b.entry.value) || 0), 0);
  if (toughBonus) hp.max += toughBonus;

  // The Belt of Vital Stamina's "+5-item bonus to their hit points"
  // arrives the same way and for the same reason, and it ADDS rather
  // than taking the highest: it is an item bonus from a single worn
  // belt, and two belts cannot both be invested in the same slot.
  const wondrousHP = wondrousBonusesForActor(Array.from(actor?.items ?? [])).hp;
  if (wondrousHP) hp.max += wondrousHP;
  // ADJUSTING LEVEL (3.633.0, F&F 3.0 R13): "modifies the creature's HP by 8
  // for each level added or removed."
  const elHP = elAdjustHP(elAdjustOf(actor));
  if (elHP) hp.max = Math.max(1, hp.max + elHP);

  // Soul Drain (Appendix 2): "This amount is applied directly to your
  // character as Hit Point damage but also reduces your maximum hit
  // points." Applied here as a straight reduction to max HP. The HIT POINT
  // DAMAGE is dealt where the value rises (3.621.0; block 39's A7) — this
  // comment used to say Sacrifice dealt it, and nothing did.
  //
  // THE MAXIMUM BEFORE THE DRAIN is kept beside it, because the maximum
  // below is floored at 0 and "if the amount of Soul Drain damage reduces
  // your maximum hit points to less than 0, you die" needs the number the
  // floor hides (combat/death-state.mjs `instantDeathOf`).
  const soulDrain = Number(actor.getConditionValue?.("soulDrain") ?? 0);
  hp.maxBeforeSoulDrain = hp.max;
  if (soulDrain > 0) {
    hp.max = Math.max(0, hp.max - soulDrain);
  }

  // Chapter 8, Rest & Sleep: Fatigue 10+ means unconscious, 20+ means
  // dead. Still surfaced for the sheet; since 3.621.0 (Graham's R6 of block
  // 39) both are also APPLIED — Unconscious granted in prepareConditions,
  // death by `isDead`.
  if (system.identity) {
    const fatigue = actor?.getConditionValue?.("fatigued") ?? 0;
    system.identity.fatigueStatus = fatigueStatus(fatigue);
  }
}

function prepareCombat(system, actor) {
  const combat = system.combat;
  if (!combat) return;

  // The Creature Codex's AB/DB note: every creature and NPC gains an
  // OTHER bonus to both attack and defence equal to half its level, and
  // defence a further STATUS bonus of (class bonus - 2). Both are zero
  // at 1st level, which is why no printed stat block shows them.
  //
  // Pooled BEFORE the applyTarget calls below, which is what resolves
  // the pool — contributing after them would compute a total that
  // silently ignored these.
  for (const [target, entries] of Object.entries(creatureBonusEntries({
    actorType: actor?.type,
    level: system.identity?.level,
    classBonus: system.identity?.classBonus
  }))) {
    for (const entry of entries) actor.addBonus(target, entry);
  }

  // The Companion feat ladders: Natural Defence's Dodge bonus to DB and
  // Tough Hide's increase to BASE natural armour. Pooled here rather
  // than where each is consumed, because prepareCombat runs BEFORE
  // prepareArmourProtection resolves the natural-armour targets — a
  // contribution made any later than this would simply be ignored.
  if (isCompanion(actor)) {
    const ownedFeatNames = Array.from(actor.items ?? [])
      .filter((item) => item.type === "feat")
      .map((item) => item.name);
    for (const [target, entries] of Object.entries(companionFeatEntries(ownedFeatNames))) {
      for (const entry of entries) actor.addBonus(target, entry);
    }
  }

  // Resilience (Familiar ability): "+2 racial bonus to all Saving
  // Throws". Pooled here beside the companion feats for the same reason
  // they are — `racial` is a slot a GM's own edits land in, and
  // assigning into it would eat them.
  if (isFamiliar(actor)) {
    const ownedAbilityNames = Array.from(actor.items ?? [])
      .filter((item) => item.type === "ability")
      .map((item) => item.name);
    for (const [target, entries] of Object.entries(familiarSaveEntries(ownedAbilityNames))) {
      for (const entry of entries) actor.addBonus(target, entry);
    }
  }

  const sizeEntry = SIZE_TABLE[system.identity?.size] ?? null;
  if (sizeEntry) combat.reach = sizeEntry.reach;

  // Wade Through the Mooks (Chapter 7, optional rule, NPC only): a
  // status penalty to attack rolls, defence, and other relevant checks
  // based on the creature's own remaining HP percentage. Computed here
  // directly from HP value/max (rather than waiting on the later
  // prepareResourcePercentages pass) so it's available before attack
  // and defence are derived below.
  let woundPenalty = 0;
  if (actor.type === "npc" && system.gm?.isMook) {
    const hp = system.resources?.hp;
    const hpMax = Number(hp?.max ?? 0);
    const hpPct = hpMax > 0 ? (Math.max(0, Number(hp?.value ?? 0)) / hpMax) * 100 : 100;
    woundPenalty = woundThresholdPenalty(hpPct);
  }

  // The class table's BAB and BDB arrive as their own derived term rather
  // than being assigned into a slot. `bab.base` is the player's field and
  // `bdb.class` is a typed bonus slot that ActiveEffects write into —
  // effects are applied BEFORE prepareDerivedData, so assigning over
  // either would silently eat whatever had already landed there.
  combat.classTableBAB = Number(system.progression?.bab ?? 0);
  combat.classTableBDB = Number(system.progression?.bdb ?? 0);
  if (combat.bab) {
    combat.bab.classTable = combat.classTableBAB;
    combat.bab.total = sum(combat.bab, ["base", "class", "other", "classTable"]);
  }
  if (combat.bdb) {
    combat.bdb.classTable = combat.classTableBDB;
    combat.bdb.total = sum(combat.bdb, ["class", "other", "classTable"]);
  }

  if (combat.attack) {
    combat.attack.base = Number(combat.bab?.total ?? 0);
    combat.attack.ability = Number(
      system.attributes?.[combat.attack.abilityKey]?.total ?? 0
    );
    applyTarget(combat.attack, {
      actor,
      path: "system.combat.attack",
      slotTypes: TARGET_SLOTS.attack,
      extra: woundPenalty,
      additiveLabel: woundPenalty ? "BAB, ability, and Wound Threshold" : "BAB and ability",
      overrides: STACKING_OVERRIDES.attack
    });
    /*
     * AND THE RANGED ATTACK BONUS, WHICH THE BOOK NAMES SEPARATELY
     * (3.489.0).
     *
     * The glossary carries two entries: *"A basic melee attack is a d20
     * roll + your ATTACK BONUS"* and *"A basic ranged attack is a d20
     * roll + your RANGED ATTACK BONUS."* Two named numbers, and until now
     * this system derived one.
     *
     * WITHOUT THIS THE SHEET LIES BY OMISSION. A character with Str 3 and
     * Dex 5 would read "Attack Bonus 8" and then watch a bow roll at 10 —
     * "a number appeared on a roll with nothing on the character to
     * explain it", which is the exact complaint the weapon path was fixed
     * for at 3.215.0 and the alchemical path at 3.303.0.
     *
     * DERIVED, NOT STORED, and `total` is left exactly as it was so that
     * every existing reader of it — the action workflow, the critical
     * tables, the alchemical path — keeps the number it already had.
     */
    combat.attack.ranged = combat.attack.total + rangedAbilityAdjustment(
      true,
      combat.attack.ability,
      Number(system.attributes?.dexterity?.total ?? 0)
    );
  }

  if (combat.defence) {
    const flatFooted = actor.hasCondition("flatFooted");
    // Creature Type: Ooze — "is blind but gains the Blindsight ability."
    // Ooze itself never carries Flat-Footed at all (its own baked
    // immunities text already covers that, refused at the toggle), but
    // Blindsight is a general capability a creature type can grant, so
    // the bypass is written generally here too — the same shape as
    // Combat Awareness below, granted by what the creature is rather
    // than a feat.
    const blindsightBypass = hasBlindsight(ownedCreatureTypeSystem(actor));
    const protectionPieces = equippedProtection(actor);

    combat.defence.base = 10;
    // Flat-Footed: "You lose any Dexterity and Dodge bonus to DB". A Dexterity
    // penalty still applies, so only a positive bonus is suppressed.
    let dexterity = Number(system.attributes?.dexterity?.total ?? 0);
    // Max Dex Bonus (Chapter 6): heavier armour caps the POSITIVE Dex bonus
    // used for DB specifically — "This restriction doesn't affect any
    // other Dexterity-related abilities" — so only this local value used
    // for defence.ability is clamped; every other use of Dexterity reads
    // the attribute's own uncapped total.
    let maxDexCap = tightestMaxDexBonus(
      protectionPieces.map((piece) => piece.maxDexBonus)
    );
    if (maxDexCap !== null) {
      // Armour Exemplar (Fighter, 3rd): "increases the maximum
      // Dexterity bonus allowed by your armour by 1", to +4 at 15th.
      // Raises the armour-derived cap — a character whose armour
      // imposes no cap has nothing to raise, which is why this sits
      // inside the null check.
      const wearingArmour = Array.from(actor?.items ?? []).some(
        (i) => i.type === "armour" && i.system?.equipped
      );
      maxDexCap += armourExemplarAdjust(
        actor, system.identity?.level ?? 0, wearingArmour
      ).maxDexIncrease;
      // The Other table's "-1" (greaves and bracers) reduces the cap the
      // body armour set. See `adjustedMaxDexCap`.
      maxDexCap = adjustedMaxDexCap(maxDexCap, protectionPieces.map((piece) => piece.maxDexModifier));
      dexterity = clampToMaxDexBonus(dexterity, maxDexCap);
    }
    // Shield Bonus (Chapter 6): "multiple Shield bonuses do not stack" —
    // the highest among equipped shields applies, not a sum.
    // Shield Bash (Chapter 4): "you lose any shield bonus gained to DB
    // until the beginning of your next turn" — suppressed here rather
    // than the shield's own defenceBonus being altered, since the
    // shield itself hasn't changed, only this actor's temporary
    // ability to benefit from it.
    const shieldBashSuppressed = Boolean(actor.getFlag?.("trg-prime", "shieldBashLostBonus"));
    // Shield Focus (Class, Chapter 5): "increase the DB bonus granted by
    // any shield by +1" — applied to each piece's own bonus, so the
    // highest-wins selection below already sees the raised values.
    const shieldFocus = featNamesOf(actor)
      .some((n) => String(n).trim().toLowerCase() === "shield focus") ? 1 : 0;
    // Shield Ally (Crusader, 4th): "the shield's bonus increases by
    // +1" — word-for-word the same shape as Shield Focus just above, so
    // it stacks onto each piece's own bonus the same way rather than
    // replacing or capping alongside it.
    const shieldAlly = shieldAllyBonus(actor);
    // THE BUCKLER WHOSE ARM IS BUSY IS LEFT OUT HERE (3.575.0), before
    // highest-wins, instead of being subtracted afterwards. The old
    // subtraction took the buckler's printed DB off whatever shield bonus
    // had won: a flat-footed buckler user, whose shield bonus was already
    // suppressed, went to -1; Shield Focus left +1 standing; and a parry
    // weapon in the buckler hand lost its +1. Found in the pages 151-160
    // audit.
    const bucklerArmBusy = Boolean(bucklerState(Array.from(actor.items ?? []))?.defenceBonusLost);
    const shieldPieces = protectionPieces
      .filter((piece) => !(bucklerArmBusy && piece.buckler))
      .map((piece) =>
        ((piece.defenceBonus ?? 0) > 0
          ? (piece.defenceBonus ?? 0) + shieldFocus + shieldAlly
          : (piece.defenceBonus ?? 0)));
    const parry = parryBonus(
      Array.from(actor.items ?? []),
      new Set(
        Array.from(actor.items ?? [])
          .filter((item) => item.type === "weapon" && item.system?.attackedThisTurn)
          .map((item) => item.id)
      ),
      { featNames: featNamesOf(actor) }
    );
    // The bonus in force, and what the suppression cost — one function,
    // because the sheet has to say the second and cannot work it out
    // from the first. See `shieldBonusInForce`.
    // CONSTANT GUARD, AND THE BASELINE IT EXEMPTS YOU FROM (3.357.0).
    //
    // "You may apply your Shield bonus to DB in combat even in the surprise
    // round or if you are flat-footed" is written against a rule this
    // system had never implemented — so until now every character kept
    // their shield while flat-footed and the feat granted nothing at all.
    // Graham's ruling, 21 Aug 2026: implement the baseline, then the
    // exemption. A shield user is now genuinely worse off in round one and
    // against anything that catches them out, which is what makes the feat
    // worth its BAB +12.
    //
    // Routed through the SAME suppression `shieldBonusInForce` already
    // takes, so the sheet keeps saying what was lost and why rather than
    // the number quietly being smaller — and so Parry, which is not a
    // shield, survives it exactly as it survives a Shield Bash.
    // THE SURPRISE ROUND REACHES THIS THROUGH FLAT-FOOTED, which is how
    // this system already models it: Chapter 4 Step 4 makes everyone
    // Flat-Footed for round one, and `#clearInitialFlatFooted` lifts it at
    // the start of each character's own turn. So the feat's two clauses —
    // "even in the surprise round or if you are flat-footed" — are one
    // state here, and asking a live `game.combat` a second time during data
    // preparation would be a second answer to a question the condition has
    // already settled.
    const guard = shieldBonusKept({
      featNames: featNamesOf(actor),
      flatFooted
    });
    // ONE SHIELD POOL (3.621.0; block 39's A1, Graham's R4). "Shield bonuses
    // stack with all other bonuses to DB except other shield bonuses" — so a
    // shield bonus from an effect (the Shield spell's +1) joins the carried
    // shields' pieces, the highest wins, and Flat-Footed and Shield Bash
    // strip it whatever its source. It leaves the typed pool below, where it
    // used to sit apart and add to a carried shield.
    const pooledShield = Math.max(0, ...actor.getBonusPool("system.combat.defence")
      .filter((entry) => entry?.type === "shield")
      .map((entry) => Number(entry?.value) || 0));
    const { bonus: shieldBonus, lost: shieldBonusLost } = shieldBonusInForce({
      shieldBonuses: pooledShield > 0 ? [...shieldPieces, pooledShield] : shieldPieces,
      parry,
      suppressed: shieldBashSuppressed || !guard.kept
    });
    // THE SHIELD'S OWN CONTRIBUTION, PUBLISHED (3.353.0).
    //
    // It is folded into `combat.defence` below via `extra`, which is
    // right for the total and useless to anything that needs to know how
    // much of that total the shield is. Disarm Block triggers on "an
    // attack fails to inflict damage to you due to missing by your Shield
    // DB" — a question nobody could answer without this number, and one
    // that a second, private recomputation elsewhere would answer
    // differently the first time the parry rule changed.
    system.combat.shield.db = shieldBonus;
    system.combat.shield.dbLost = shieldBonusLost;

    // POTENCY (Chapter 11): "the potency rune imbues the item with magic
    // and provides it with a bonus" — an ITEM bonus to DB, from every
    // equipped suit of armour or shield carrying one. The item's own
    // derivation works the figure out (`_applyRunes` in documents/item.mjs);
    // this is where it reaches the character, because armour has no DB
    // field of its own to put it in.
    //
    // Routed through the typed bonus pool rather than added to
    // `combat.defence` directly, so two potency runes on two worn pieces
    // resolve the way item bonuses always do here — highest wins, not
    // sum — without this call site having to know that rule.
    // ARMOUR ONLY (3.615.0, R2 of block 36): a shield's potency goes into
    // the shield's own bonus, above, where it is suppressed with the shield
    // and stacks with this one rather than competing with it.
    for (const item of actor.items ?? []) {
      const runeKind = runeKindOf(item);
      if (runeKind !== "armour") continue;
      if (!item.system?.equipped) continue;
      // RUNED CLOTHING (3.577.0, R9): only with no body armour over it.
      if (!runesCountFor(item, Array.from(actor.items ?? []))) continue;
      const runeDB = Number(item.system?.runeDefenceBonus ?? 0);
      if (!runeDB) continue;
      actor.addBonus("system.combat.defence", {
        type: "item",
        value: runeDB,
        source: `${item.name} (potency)`
      });
    }

    // ARMOURGUARD ON A SHIELD (3.578.0, the block-18 audit's R9): "a
    // shield gains a +1-item bonus to DB". An item bonus in the same pool
    // as potency, so the two resolve highest-wins; and only while the
    // shield's bonus is in force — a shield that is not raising DB has no
    // DB for the resin to add to.
    if (shieldBonus > 0) {
      for (const item of actor.items ?? []) {
        if (item.type !== "shield" || !item.system?.equipped) continue;
        const resin = armourguardBonus(item);
        if (!resin.db) continue;
        actor.addBonus("system.combat.defence", {
          type: "item",
          value: resin.db,
          source: `${item.name} (${resin.name})`
        });
      }
    }

    // THE BUCKLER (Chapter 6): strapped to the forearm, so it costs no
    // hand — and in exchange it loses its own DB, and cannot be raised,
    // while the shield arm is being used for something else. Published
    // for the sheet as well as applied, because "why is my DB down by
    // one" deserves an answer on the sheet that lowered it.
    {
      const state = bucklerState(Array.from(actor.items ?? []));
      system.combat.buckler = state
        ? {
          name: state.buckler.name,
          armInUse: state.defenceBonusLost,
          attackPenalty: state.attackPenalty,
          canRaise: state.canRaise,
          notes: state.notes
        }
        : null;
      // A buckler whose arm is in use contributes nothing to DB — it is
      // left out of the shield pieces before highest-wins (3.575.0), above,
      // not subtracted here.
      if (state?.attackPenalty) {
        actor.addBonus("system.combat.attack", {
          label: `${state.buckler.name} (shield arm)`,
          value: state.attackPenalty,
          type: "untyped",
          source: "buckler"
        });
      }
    }

    // THE OTHER NUMERIC RUNES (Chapter 11) — Saving, Shadow and Energy
    // Resistance. Slick is a conditional rather than a flat bonus and is
    // published for the check dialog instead; Tough reaches max HP in
    // prepareResources, which is not a pooled target.
    const runeEffects = runeBonusesForActor(Array.from(actor.items ?? []));
    for (const bonus of runeEffects.bonuses) {
      if (bonus.target === "system.resources.hp.max") continue;
      actor.addBonus(bonus.target, bonus.entry);
    }
    // Resistances are a comma-separated text field, which is what every
    // other source of resistance in this system writes to.
    //
    // DRAGONHIDE JOINS THEM (3.574.0): "Dragonhide armour grants the wearer
    // resistance against the same energy type" as the dragon the scales
    // came from. Bare energy words, which `resolveDamageTypeField` reads
    // as damage types — so the one damage pipeline halves them, once,
    // however many sources also resist the same type. The figure had sat
    // on the material since it was written with no dragon to ask; Graham
    // supplied the eight on 19 September 2026.
    const materialResistances = dragonhideResistances(Array.from(actor.items ?? []));
    if ((runeEffects.resistances.length || materialResistances.length) && system.combat) {
      system.combat.resistances = [
        String(system.combat.resistances ?? ""), ...runeEffects.resistances, ...materialResistances
      ].filter(Boolean).join(", ");
    }
    // Published for collectConditionals, which reads item flags — and a
    // rune chosen at the table is not authored data, so it cannot be one.
    //
    // EAOG RIDES THE SAME CHANNEL (3.573.0), and for the same reason: a
    // material chosen during customisation is derived data, not authored
    // flags. "The wearer also gains a +2-item bonus to all saving throws
    // against magic" — CONDITIONAL, so it is a row the player ticks when
    // the save is against magic rather than a pooled bonus, exactly as
    // the familiar's +2 is. Pooling it would give +2 against a pit trap.
    //
    // Until now this value was computed by `computeArmourModifiers` and
    // read by nobody, so Eaog armour granted none of it. Found in the
    // pages 141-150 audit.
    system.combat.runeConditionals = [
      ...runeEffects.conditionals,
      ...eaogSaveConditionals(Array.from(actor.items ?? [])),
      // FURS/PELTS (3.575.0): "+2 item bonus to resist the chilling
      // effects of wintry environments" — offered on Fortitude saves while
      // worn. Published here beside Eaog's for Eaog's reason: a flag on
      // the item itself would be harvested whether or not it is worn.
      ...coldWeatherConditionals(Array.from(actor.items ?? [])),
      // CONCEALABLE (3.575.0): +2 circumstance to Conceal an Object for a
      // weapon with the trait. See stealth.mjs.
      ...concealableWeaponConditionals(Array.from(actor.items ?? [])),
      // THE GOODS (3.576.0; Graham's R8): every printed Goods bonus — the
      // Compass, the Bedroll, Earplugs, the Portable Ram and the rest — as
      // a row the player ticks, offered while the item is equipped. See
      // goods.mjs.
      ...goodsConditionals(Array.from(actor.items ?? []))
    ];
    system.combat.runeProblems = runeEffects.problems;

    // "ALL SPELL CASTING DCs ARE INCREASED BY 2" — Eaog's other half.
    // NOT a pooled bonus: casting DCs are assembled by
    // `assembledCastingDC` from named parts, not from the bonus pool, so
    // this is published for that function to pick up beside the
    // prohibited-armour penalty it already carries.
    system.magic.materialCastingDC = eaogSpellDCIncrease(Array.from(actor.items ?? []));

    // WONDROUS ITEMS (Chapter 11), on the same footing as the runes and
    // for the same reason: an item on the character that changes a
    // number. The gate is INVESTMENT rather than equipped — "when you
    // invest the sash, you gain a status bonus" — and until 3.247.0
    // nothing read these at all, so a fully invested Agile Sash IV
    // changed precisely nothing on the sheet.
    //
    // The class name and tradition are passed because two of the
    // abilities are restricted by them: Faith's Eye works for a cleric
    // or crusader, and a Wizardry Ring's Arcana bonus applies only to an
    // arcane caster. Restricted-out abilities are reported rather than
    // dropped, so a player can see why the number is missing.
    // THE CASTING TRADITION, NOT THE STORED FIELD (3.617.0, B15 of block
    // 37; Graham's R19). The Wizardry Ring's Arcana bonus is for "an
    // arcane spell caster", and this ran before prepareMagic fixes a caster
    // class's tradition below — so a Wizard whose field was still blank lost
    // the bonus, while a non-caster who had picked "arcane" kept it. A
    // caster is one whose class, or caster archetype, fixes a tradition.
    const castingTradition = system.progression?.tradition
      || featSheetTradition(
        archetypeCastingSources(Array.from(actor.items ?? [])),
        knightCastingSources(Array.from(actor.items ?? [])),
        system.progression
      )?.tradition
      // A creature that casts from its own statblock (an NPC with spells and
      // a tradition, and no class to fix it) is a caster too.
      || (Array.from(actor.items ?? []).some((i) => i.type === "spell") ? (system.magic?.tradition ?? "") : "")
      || "";
    const wondrousEffects = wondrousBonusesForActor(Array.from(actor.items ?? []), {
      className: Array.from(actor.items ?? []).find((i) => i.type === "class")?.name ?? "",
      tradition: castingTradition,
      // A TRAIT OR A FEAT AN ABILITY REQUIRES (3.626.0): the creature's own
      // trait line and what it holds, for `requiresTrait` / `requiresFeat`.
      traits: creatureTraits(system).join(", "),
      featNames: Array.from(actor.items ?? []).filter((i) => i.type === "feat" || i.type === "ability").map((i) => i.name)
    });
    // `wondrousBonus`, not `bonus`: the rune loop above pools with an
    // identical line, and two identical lines are one anchor — a
    // mutation aimed at the rune call site silently hit nothing once
    // this block was written beside it. Distinct names, distinct checks.
    for (const wondrousBonus of wondrousEffects.bonuses) {
      // DR IS POOLED HERE TOO (3.617.0, A13 of block 37). At 3.247.1 it
      // was skipped because this point once READ `system.combat.dr.total`
      // before the DR object existed, and the throw aborted prepareCombat
      // (found by Graham's live testing; a source-text check is not an
      // execution). Pooling only appends to the bonus map — nothing is
      // read — and prepareArmourProtection's applyTarget then resolves it
      // with the stacking rules, so the Amulet's status DR no longer adds
      // to Mage Armour's.
      // Attributes resolved long before this point, in prepareAttributes,
      // where they are contributed instead — pooling one here adds it to
      // a total that has already been settled, which is a bonus that
      // silently does nothing.
      if (wondrousBonus.target.startsWith("system.attributes.")) continue;
      actor.addBonus(wondrousBonus.target, wondrousBonus.entry);
    }
    system.combat.wondrousSummary = wondrousEffects.summary;
    system.combat.wondrousReported = wondrousEffects.reported;
    system.combat.wondrousProblems = wondrousEffects.problems;

    // Instinctive Defence (Chapter 5): "+1 dodge bonus to DB" — but only
    // while free of ACP and encumbrance penalties (the feat's own
    // Requirements line). ACP is derived just before prepareCombat for
    // exactly this read; encumbrance steps were stashed by
    // prepareAttributes. Routed through the dodge pool so Flat-Footed's
    // dodge filter strips it like every other dodge bonus.
    if (
      featNamesOf(actor).some((n) => String(n).trim().toLowerCase() === "instinctive defence") &&
      !Number(system.combat?.acp?.total ?? 0) &&
      !Number(actor._trgEncumbranceSteps ?? 0)
    ) {
      actor.addBonus("system.combat.defence", {
        label: "Instinctive Defence",
        value: 1,
        type: "dodge",
        source: "feat"
      });
    }

    // Combat Awareness (Class, Chapter 5): "You do not lose your
    // Dexterity bonus to DB when flat-footed."
    const combatAwareness = featNamesOf(actor)
      .some((n) => String(n).trim().toLowerCase() === "combat awareness");
    combat.defence.ability = flatFooted && !combatAwareness && !blindsightBypass
      ? Math.min(dexterity, 0)
      : dexterity;
    combat.defence.class = Number(combat.bdb?.total ?? 0);
    applyTarget(combat.defence, {
      actor,
      path: "system.combat.defence",
      slotTypes: TARGET_SLOTS.defence,
      extra: woundPenalty + shieldBonus,
      // The label is where this sheet already says what STATE the figure
      // was worked out in — "Base (Flat-Footed)" has done it since the
      // flat-footed rule arrived. A lost shield bonus is the same kind
      // of fact, and saying it here costs no stacking behaviour: it does
      // not add an entry to the typed pool, it names what is missing
      // from the one that is there.
      additiveLabel: [
        flatFooted && !blindsightBypass ? "Base (Flat-Footed)" : "Base and Dexterity",
        shieldBonusLost
          ? (guard.kept
            ? `(shield bonus of ${shieldBonusLost} lost until your next turn)`
            : `(shield bonus of ${shieldBonusLost} lost while ${guard.reason})`)
          : ""
      ].filter(Boolean).join(" "),
      overrides: STACKING_OVERRIDES.defence,
      // A positive shield entry is in the shield pool above, not here.
      poolFilter: flatFooted && !blindsightBypass
        ? (entry) => entry.type !== "dodge" && !(entry.type === "shield" && Number(entry.value) > 0)
        : (entry) => !(entry.type === "shield" && Number(entry.value) > 0)
    });

    // WHAT A CONDITION LEAVES OF IT (3.621.0; Appendix 2, block 39's R7).
    // Paralyzed and Unconscious: "You lose all DB except that provided by
    // magic or armour." Petrified: "an object with … DB 0". Penalties still
    // apply to what is left. See conditions/condition-rules.mjs.
    const restriction = defenceRestriction(actor.conditions?.effective);
    if (restriction === "zero") {
      combat.defence.total = 0;
      combat.defence.tooltip = `Petrified — an object, DB 0`;
      combat.defence.restricted = "Petrified";
    } else if (restriction === "magicArmour") {
      const magic = new Set(Array.from(actor.appliedEffects ?? actor.effects ?? [])
        .filter((e) => e?.getFlag?.("trg-prime", "castId"))
        .map((e) => e.uuid));
      const kept = (combat.defence.breakdown?.entries ?? []).filter((entry) => entry.applied !== false)
        .reduce((sum, entry) => {
          const value = Number(entry.value) || 0;
          if (value < 0) return sum + value;
          return keepsMagicOrArmour(entry) || magic.has(entry.source) ? sum + value : sum;
        }, 0);
      const which = actor.hasCondition("paralyzed") ? "Paralyzed" : "Unconscious";
      combat.defence.total = kept + Math.min(0, woundPenalty);
      combat.defence.tooltip = `${which} — only DB from magic or armour remains: ${combat.defence.total}`;
      combat.defence.restricted = which;
    }
  }

  // Land Speed after armour and encumbrance (Chapter 6). Encumbrance is
  // "-5 penalty to your speed" for every 20 lb over your Weight Allowance
  // — a different penalty from the -1 it applies to Dex, which this
  // previously conflated, costing a single foot of Speed instead of five.
  // Armour's own Speed penalty is applied here too; it had never been read
  // at all. Rounded down to the nearest 5 ft for battle-grid play.
  if (combat.movement) {
    // POOLED AT 3.412.0. Each speed is a bonus pool now, so a typed bonus
    // aimed at one actually lands — see TARGET_SLOTS.movement for what it
    // silently did before, and which two shipped features it broke.
    //
    // WHAT REMAINS IN THIS METHOD IS ONLY THE FETCHING. Every rule — the
    // coercion, the pooling order, armour, encumbrance, grid rounding, the
    // half-land feat speeds and the immobilised flag — is in
    // `resolveMovement`, pure, and driven by `verify-speed-pool` section G.
    //
    // IT USED TO BE THIRTY LINES OF RULES INSIDE THIS METHOD, and one of
    // them assigned `.total` to a bare number and crashed all twelve
    // actors in trg-v14. The first fix added a `normaliseMovement` call up
    // here beside the pooling loop; `mutate-speed-pool` #11 then deleted
    // that call and NOTHING NOTICED, because a line in `prepareDerivedData`
    // is a line no check can reach. So the sequence moved instead of the
    // mutation being deleted, and the caller now has one call with nothing
    // to remember. `applyTarget` is injected because it is the single piece
    // that genuinely needs the actor.
    // THE SPEED STEP COUNT, which floors, not the Dexterity one, which
    // rounds up (3.573.0). Page 146 prints "or part thereof" on the Dex
    // penalty only.
    const speedSteps = Number(actor._trgEncumbranceSpeedSteps ?? 0);
    const protection = equippedProtection(actor);
    const featNames = featNamesOf(actor);
    // Iron Walker (Chapter 5): armour's Speed reduction is ignored entirely.
    const ignoreArmourSpeed = armourTraining(featNames).ignoreSpeedPenalty;
    // Quick Climber / Quick Swimmer (Chapter 5). prepareSkills then grants
    // the matching +4 circumstance (Climbing / Athletics) automatically,
    // because these speeds now exist.
    const featSpeeds = { "quick climber": "climb", "quick swimmer": "swim" };
    const halfLandSpeeds = featNames
      .map((name) => featSpeeds[String(name).trim().toLowerCase()])
      .filter(Boolean);

    /*
     * SPEEDS SOMETHING GAVE THIS CREATURE (3.589.0). Read from items,
     * exactly as `bestLightStep` reads a light step and `actorSenses`
     * reads a sense — a granted speed is the same kind of derived thing,
     * and the spell that grants one creates the same kind of item.
     *
     * This is the ONLY route by which a creature acquires a speed it
     * does not have as the page describes it. A bonus row can give a fly
     * TOTAL — measured live — but cannot say "equal to its land Speed or
     * 20 feet, whichever is greater". See combat/granted-speeds.mjs.
     */
    const granted = grantedSpeeds(Array.from(actor.items ?? []), SPEED_KEYS);
    // AND THE SPEEDS A FORM REPLACES (3.595.1), read the same way and for
    // the same reason. See combat/granted-speeds.mjs.
    const replaced = setSpeeds(Array.from(actor.items ?? []), SPEED_KEYS);

    resolveMovement({
      movement: combat.movement,
      grantedSpeeds: granted,
      setSpeeds: replaced,
      armourPenalty: ignoreArmourSpeed ? 0 : totalArmourSpeedPenalty(protection),
      encumbrancePenalty: encumbranceSpeedPenalty(speedSteps),
      roundToGrid: gridSpeedRounding(),
      // The IMMOBILISED half of the rule: "if your speed is reduced to 0
      // you gain the Immobilised condition until you shed some weight."
      // Asked of the condition, not the step count, so a character one
      // pound over with no Speed left is still immobilised by their load.
      encumbered: Boolean(actor._trgEncumbered),
      halfLandSpeeds,
      applyBonuses: (node, key) => applyTarget(node, {
        actor,
        path: `system.combat.movement.${key}`,
        slotTypes: TARGET_SLOTS.movement,
        additiveLabel: "Base"
      }),
      landSpeed: effectiveLandSpeed
    });
  }

  if (combat.initiative) {
    const dexterity = Number(system.attributes?.dexterity?.total ?? 0);
    const wisdom = Number(system.attributes?.wisdom?.total ?? 0);
    combat.initiative.ability = (dexterity + wisdom) * 5;
    // Forewarned (Wizard School: Insight): "a bonus on initiative checks
    // equal to your wizard level +10." Passive, into the pool — the same
    // shape Divine Grace's save bonus uses.
    if (schoolsOf(actor).some((s) => String(s.name ?? "").trim().toLowerCase() === "insight")) {
      const forewarned = forewarnedBonus(system.identity?.level);
      if (forewarned) {
        actor.addBonus("system.combat.initiative", {
          label: "Forewarned",
          value: forewarned,
          type: "untyped",
          source: "forewarned"
        });
      }
    }
    applyTarget(combat.initiative, {
      actor,
      path: "system.combat.initiative",
      slotTypes: TARGET_SLOTS.initiative,
      additiveLabel: "(Dex x5) + (Wis x5)",
      overrides: STACKING_OVERRIDES.initiative
    });
  }

  const saveAbilities = {
    fortitude: "constitution",
    reflex: "dexterity",
    will: "wisdom"
  };

  for (const [saveKey, attributeKey] of Object.entries(saveAbilities)) {
    const save = combat.saves?.[saveKey];
    if (!save) continue;

    const ability = Number(system.attributes?.[attributeKey]?.total ?? 0);
    // Flat-Footed also removes the Dexterity bonus (not penalty) from Reflex.
    // Creature Type: Blindsight bypasses this suppression too — same
    // reasoning as combat.defence.ability above.
    save.ability =
      saveKey === "reflex" &&
      actor.hasCondition("flatFooted") &&
      !hasBlindsight(ownedCreatureTypeSystem(actor))
        ? Math.min(ability, 0)
        : ability;
    // The class's base save goes in as an additive EXTRA, not into the
    // `.class` slot — see the note on BAB above. Fort/Ref/Will are the
    // three numbers a class table differs most on, so getting this wrong
    // would be both the most visible error and the easiest to miss.
    const classSave = Number(system.progression?.[saveKey] ?? 0);
    save.classTable = classSave;
    // Divine Grace (Crusader, 2nd): "add half your Charisma bonus to all
    // of your saving throws." Into the POOL, so it is visible as its own
    // named line beside the class base rather than folded into a slot
    // something else writes.
    const grace = divineGraceModifier(actor, system.attributes?.charisma?.total);
    if (grace) actor.addBonus(`system.combat.saves.${saveKey}`, grace);
    applyTarget(save, {
      actor,
      path: `system.combat.saves.${saveKey}`,
      slotTypes: TARGET_SLOTS.save,
      extra: classSave,
      additiveLabel: classSave
        ? `${ATTRIBUTE_LABELS[attributeKey] ?? attributeKey} and ${system.progression.source} base`
        : (ATTRIBUTE_LABELS[attributeKey] ?? attributeKey),
      overrides: STACKING_OVERRIDES.save
    });
    // Opposed actions (Grapple, Shove, Trip...) roll against save DCs.
    save.dc = 10 + Number(save.total ?? 0);
  }

  // Disarm and the Injury DC both use the Attack DC: attack bonus + 10.
  if (combat.attack) {
    combat.attack.dc = Number(combat.attack.total ?? 0) + 10;
  }

  if (system.magic) {
    // Caster Level (Chapter 9): a spellcasting class advances its caster
    // level on its own progression, which may lag behind character level
    // (e.g. a level-6 bard casts as caster level 3). The editable
    // `casterLevel` field is a manual override; 0 means "not overridden".
    // `casterLevelValue` is the resolved value every casting path reads,
    // so spells scale off one derived number.
    //
    // Order: a manual override wins, then the class table, then a Knight
    // feat, then NOTHING — a character who has earned no caster level
    // has none, and reads 0 with source "none".
    //
    // THAT LAST STEP USED TO BE CHARACTER LEVEL, and the comment here
    // defended it: the fallback stayed "rather than pinning a Fighter to
    // caster level 0". Graham's ruling, 24 August 2026, is the opposite —
    // "Fighters and Rogues have no caster level" — and the defence did
    // not survive being checked. The case it protected is innate casting,
    // which takes CHARACTER level by name in `cast-workflow.mjs`
    // (`isInnate ? characterLevel`) and in `innateWarpBudget`, and never
    // read this value at all. See `resolvedCasterLevel` for what the
    // fallback was costing an Arcanist and a Mystical Conduit.
    //
    // AND THE KNIGHT FEATS SUPPLY ONE (3.345.0). All four print "a
    // caster level equal to half your level (round up)", and their own
    // notes told the player to type it in by hand. Driven live, a
    // 10th-level Arcane Knight resolved to caster level 10 — the
    // character-level fallback — which is five levels above what the
    // feat grants and governs how far every spell they cast can be
    // warped. Graham's ruling: a FLOOR, as the BSB is. See
    // `resolvedCasterLevel` for why the fallback is replaced rather than
    // floored against.
    const clOverride = Number(system.magic.casterLevel) || 0;
    const clFromClass = system.progression?.casterLevel ?? null;
    const resolvedCL = resolvedCasterLevel({
      level: system.identity?.level,
      classCasterLevel: clFromClass,
      // The Fighter's and the Rogue's tables print 0 from 3.8 onward, so
      // a filled-in cell no longer means the class casts. See R1.
      classCasts: classCasts(system.progression),
      hasKnightFeat: knightCastingSources(Array.from(actor.items ?? [])).length > 0
    });
    system.magic.casterLevelValue = clOverride > 0 ? clOverride : resolvedCL.value;
    system.magic.casterLevelSource = clOverride > 0 ? "override" : resolvedCL.source;
  }

  const spellcraft = system.magic?.spellcraft;
  if (spellcraft) {
    // Chapter 9, Magical Traditions: each tradition governs one fixed
    // ability score. If a known tradition is set, derive castingAbility
    // from it automatically; leave castingAbility as-is (manual) when no
    // tradition is set, so existing actors are unaffected.
    // A caster class fixes its own tradition — "you draw your spells from
    // the verdant tradition" is not a choice — and its own magical
    // ability score. A class with neither leaves both alone, which is
    // every non-caster: those characters still pick a tradition at 1st
    // level and it stays theirs.
    if (system.progression?.tradition) {
      system.magic.tradition = system.progression.tradition;
    }
    // A CASTER ARCHETYPE SUPPLIES ONE WHEN NO CLASS DOES (Graham's
    // ruling, 20 August 2026). A Fighter who takes Gleeman is an
    // ethereal caster and casts off Charisma — the feat's own Cha +3
    // prerequisite IS the tradition's ability, and all four line up the
    // same way. Set BEFORE the lookup below so the ability falls out of
    // the tradition rather than being written twice, and refused
    // outright when a class already fixes either: a Cleric who takes
    // Arcanist stays a divinity caster on Wisdom, and their arcane
    // cantrips swap ability per spell at cast time instead.
    //
    // EXTENDED TO THE KNIGHT FEATS in 3.345.0. Driven live, a Divine
    // Knight with Wisdom +4 and Intelligence −1 rolled Spellcraft at −1:
    // the feat set no tradition, so the ability fell through to the
    // schema default of Intelligence. Arcane Knight had escaped that
    // only because the default happens to be its own ability.
    const archetypeTradition = featSheetTradition(
      archetypeCastingSources(Array.from(actor.items ?? [])),
      knightCastingSources(Array.from(actor.items ?? [])),
      system.progression
    );
    if (archetypeTradition) system.magic.tradition = archetypeTradition.tradition;

    const tradition = TRADITIONS[system.magic.tradition];
    if (tradition) system.magic.castingAbility = tradition.ability;
    if (system.progression?.magicalAbility) {
      system.magic.castingAbility = system.progression.magicalAbility;
    }
    // ...and an EXPLICIT choice still wins over both. Charismatic Caster
    // switches your casting ability to Charisma and posts a card saying
    // so; deriving over the top would have undone it on the next prepare
    // with nothing on screen to explain it. The feat records a flag now
    // rather than writing the field, so the choice survives a class,
    // a tradition change and a level-up alike.
    const chosenAbility = actor.getFlag?.("trg-prime", "castingAbilityChoice");
    if (chosenAbility && system.attributes?.[chosenAbility]) {
      system.magic.castingAbility = chosenAbility;
    }

    // Caster style (Chapter 9: Learned / Instinctive). Derived, not
    // stored — "" for a non-caster or a class built before 3.224.0's
    // field.
    //
    // THE CLASS IS THE BASELINE, NOT THE LAST WORD (fixed 3.547.0). The
    // comment that stood here said the style was "fixed by the class...
    // because no rule lets a character change style within a class", and
    // Enigma — in the pack when that was written — is exactly such a
    // rule: "You are an Instinctive caster... You replace your Class
    // Magical Tradition rules." Measured on a level-12 Wizard holding
    // the feat, casterStyle was still `learned`, so the repertoire card
    // (gated on "instinctive") never appeared and three of the feat's
    // four promises did nothing.
    //
    // See magic/caster-style.mjs — the override is generic, keyed on any
    // owned item declaring `system.casterStyle`, because the field and
    // its vocabulary already existed on the class.
    system.magic.casterStyle = resolveCasterStyle(
      // `actor`, NOT `this`. This function is a module-level function and
      // `this` is undefined inside it, so `this.items` THREW — and it threw
      // in the middle of prepareDerivedData, which meant every actor in the
      // world stopped deriving at this line. Found live on 10 Sep 2026 at
      // 3.552.0, shipped in 3.547.0: 39 "Failed data preparation" errors at
      // world load, every skill total 0, no caster style, no granted traits.
      // The `?? []` made it look guarded and guards nothing — reading
      // `.items` off undefined is what throws, before the ?? is ever reached.
      system.progression?.casterStyle ?? "", Array.from(actor?.items ?? []));
    // The learned caster's pool shape and its two allowances
    // (3.225.0) — same "derived, not stored" treatment, for the same
    // reason. DERIVED FROM THE STYLE rather than copied from the class,
    // because an instinctive caster memorises nothing by definition and
    // two fields that must agree are two fields that will disagree.
    system.magic.memorisationStyle = resolveMemorisationStyle(
      system.progression?.memorisationStyle ?? "", system.magic.casterStyle);
    system.magic.cantripsPerDay = system.progression?.cantripsPerDay ?? 0;
    system.magic.spellBookFirstPicks = system.progression?.spellBookFirstPicks ?? 0;

    // Maximum PP = your own base, plus your class's PP column, plus your
    // MAGICAL ABILITY SCORE — every caster entry in Chapter 3 repeats
    // that last clause word for word.
    //
    // Computed here, after `castingAbility` is settled, rather than up in
    // prepareResources with the rest of the pools. Charismatic Caster
    // switches the casting ability and its card promises "PP, Spellcraft
    // and all casting mechanics now use Cha" — reading the class's
    // DECLARED ability instead would have left a Ranger who took it
    // casting off Charisma and paying off Constitution, with the card
    // saying otherwise.
    //
    // `base` is the stored half and belongs to the character: it is what
    // the Magic tab edits, what the eight stored-delta grants write into
    // (racial PP, Aura of Power, the Knight feats, Lay Healer), and what
    // the Universal Modifier engine treats as a field. `max` is derived
    // and is what everything READS. Assigning the class figure straight
    // over `max` would have made every one of those grants invisible and
    // unrepairable, since each records what it wrote and would find it
    // gone.
    const pp = system.resources?.pp;
    if (pp) {
      const tablePP = system.progression?.pp ?? null;
      // A class that does not cast adds no ability bonus — that is the
      // THE TRADITION ADDS ITS ABILITY, CASTER OR NOT (3.558.1). Graham,
      // 16 September 2026: "Magical Tradition should always add the
      // appropriate ability score to PP (even if the character is not a
      // caster)." The Fighter and the Rogue are required to pick one, and
      // this is what picking one gets them.
      //
      // TWO PREVIOUS SHAPES, BOTH WRONG. Through 3.557.0 this asked
      // whether the class table's PP cell was blank; 3.558.0 changed it to
      // ask whether the class casts. The tell was three lines below: the
      // Spellcraft assignment has never been gated at all, so the same
      // Fighter added Intelligence to Spellcraft and was refused it here.
      const abilityBonus = powerPointAbilityBonus({
        tradition: system.magic?.tradition,
        abilityTotal: system.attributes?.[system.magic.castingAbility]?.total
      });
      pp.classTable = tablePP ?? 0;
      pp.abilityBonus = abilityBonus;
      pp.max = powerPointMax(pp.base, system.progression, abilityBonus);
      /*
       * A POWER CRYSTAL IN THE POCKET IS POWER POINTS IN THE POOL
       * (3.594.0). Page 306: "any character holding it can use [it] as if
       * it was part of their PP reserve."
       *
       * DERIVED, NOT SPENT. Eight places in this system write
       * `resources.pp.value`, and a crystal that intercepted spending
       * would have had to know all eight and the ninth nobody has written
       * yet. Raising the MAXIMUM makes the points part of the pool by
       * arithmetic, and every existing spender draws on them without ever
       * being told they exist. See magic/power-crystal.mjs.
       *
       * READ OFF THE ACTOR'S ITEMS, so it travels: hand the crystal over and its
       * points go with it, which is what "any character holding it"
       * requires and what a flag on one sheet could not do.
       *
       * OUTSIDE THE CASTER QUESTION ABOVE, deliberately — the page says
       * any CHARACTER, and a Fighter handed a crystal can spend it.
       */
      pp.crystals = crystalTotal(actor?.items ?? []);
      pp.max += pp.crystals;
    }

    spellcraft.ability = Number(
      system.attributes?.[system.magic.castingAbility]?.total ?? 0
    );
    // Song & Dance (Bard, 1st): "add your class bonus to all Spellcraft
    // checks and DC's." Into the POOL, so it is a named line beside the
    // BSB rather than folded into a slot something else writes — and the
    // DC follows for free, since it is 10 + the resolved total.
    const song = songAndDanceModifier(actor, system.identity?.classBonus);
    if (song) actor.addBonus("system.magic.spellcraft", song);
    // HOISTED because the Bardic Performance total below re-resolves the
    // same pool, and two copies of "what is added flat" is two places for
    // a BSB to go missing from one of them.
    const spellcraftExtra = Number(system.magic.bsb ?? 0) + Number(system.progression?.bsb ?? 0);
    const resolved = applyTarget(spellcraft, {
      actor,
      path: "system.magic.spellcraft",
      slotTypes: TARGET_SLOTS.spellcraft,
      extra: spellcraftExtra,
      additiveLabel: "BSB and tradition ability",
      overrides: STACKING_OVERRIDES.spellcraft
    });
    spellcraft.dc = 10 + resolved.total;

    // ─────────────────────────────────────────────────────────────────
    // "IF YOU ARE USING BARDIC PERFORMANCE THE CLASS BONUS DOES NOT
    // APPLY" (3.443.3).
    //
    // Song & Dance grants the class bonus to "all Spellcraft checks AND
    // DC's", and its last sentence takes both away again on a Bardic
    // Performance cast. Until now only the CHECK lost it — the cast swaps
    // the whole modifier list for a single Perform entry — while every
    // number derived from the Spellcraft bonus kept it. Measured in
    // Graham's world on 31 August 2026: Cutting Words cast with Bardic
    // Performance rolled Perform +9 with no class bonus, and set a Will
    // save DC of 18, where the specialist formula without Song & Dance
    // gives 17.
    //
    // ONE VALUE, NOT A LIST OF PLACES. "The class bonus does not apply"
    // is most honestly read as the bonus simply being absent from the
    // Spellcraft bonus for that cast, so everything derived from it
    // follows without three call sites each remembering to subtract.
    //
    // RE-RESOLVED RATHER THAN SUBTRACTED, though not because subtraction
    // is wrong: `class` stacks, so today the two agree. Asking the same
    // resolver the same question with one entry gone does not depend on
    // that, and cannot drift from the first answer. See bard.mjs.
    spellcraft.bardicPerformanceTotal = song
      ? resolveBonuses({
        slots: spellcraft,
        slotTypes: TARGET_SLOTS.spellcraft,
        pool: withoutSongAndDance(actor.getBonusPool("system.magic.spellcraft")),
        stacking: STACKING_OVERRIDES.spellcraft,
        extra: spellcraftExtra
      }).total
      : resolved.total;

    // Investment (Chapter 11): 3 base + spellcasting ability score + 1
    // per 5 levels. Spent (currently-invested item count) is computed on
    // the sheet, where the item collection is directly available.
    // Incredibly Invested (Chapter 5): "Increase your limit on invested
    // items by 2" — applied to the derived cap the sheet displays and the
    // investment workflow enforces.
    const investedBonus = featNamesOf(actor).some(
      (n) => String(n).trim().toLowerCase() === "incredibly invested"
    ) ? 2 : 0;
    system.magic.investmentSlots = investmentSlots(
      system.identity?.level ?? 0,
      spellcraft.ability
    ) + investedBonus;

    // Control Levels (Chapter 9): the cap on total creature levels controlled.
    //
    // THE CLASS BONUS IS DERIVED, NOT TYPED (3.585.0). The stored field
    // stays authoritative when something has written one — a modifier
    // targets it, and a homebrew class may want it — but a character who
    // has never been touched now gets the bonus page 242 grants them.
    // See magic/casting.mjs for why Conjurer reads as Translocation.
    const derivedControlBonus = controlBonusPerLevelFor(
      Array.from(actor.items ?? []).find((i) => i.type === "class")?.name ?? "",
      schoolsOf(actor).map((s) => s.name)
    );
    system.magic.controlBonusPerLevel = Math.max(
      Number(system.magic.controlBonusPerLevel) || 0,
      derivedControlBonus
    );
    system.magic.controlLevels = controlLevelCap(
      system.identity?.level ?? 0,
      spellcraft.ability,
      system.magic.controlBonusPerLevel
    );
  }
}

function prepareSkills(system, actor) {
  const level = system.identity?.level ?? 1;

  // Chapter 8, Movement: having a Climb (or Swim) speed grants a +4
  // circumstance bonus to the matching skill check — Climbing for a
  // climb speed, Athletics for a swim speed (Swim is one of Athletics'
  // own actions).
  // READ THROUGH speedValue, NOT Number(). `Number({base:20,…})` is NaN
  // and `NaN > 0` is false, so from 3.412.0 until 3.412.1 this bonus
  // stopped being granted the moment the migration SUCCEEDED — silently,
  // and only for the characters the pooling was supposed to help.
  const movement = system.combat?.movement ?? {};
  if (speedValue(movement.climb) > 0) {
    actor.addBonus("system.skills.climbing", {
      label: "Climb Speed",
      value: 4,
      type: "circumstance",
      source: "movement"
    });
  }
  if (speedValue(movement.swim) > 0) {
    actor.addBonus("system.skills.athletics", {
      label: "Swim Speed",
      value: 4,
      type: "circumstance",
      source: "movement"
    });
  }

  // Class skills (Chapter 3): "Your class will have a number of skills
  // which gain a special bonus type called a class bonus."
  //
  // Contributed to the POOL, one entry per source, rather than written
  // into the skill's class slot. Two reasons. The slot is where flat
  // class-type bonuses land — Favoured Terrain writes "+2 class" into it
  // — and those have to stack on top of the class-skill bonus, not
  // replace or absorb it. And a class bonus cannot be gained from the
  // same source twice, which is a statement about sources; the pool is
  // where sources are visible.
  const sourcesBySkill = applyClassSkillBonuses(system, actor);

  // Roguish Skill (Rogue, 1st): each recorded pick "gains a +1-class
  // bonus". A flat +1 — it does not scale with the class-bonus table —
  // under its own name in the pool, so it stacks with the class-skill
  // bonus above exactly as Favoured Terrain's slot bonus does: a class
  // bonus per SOURCE, and this is its own source.
  for (const key of roguishSkillPicks(actor)) {
    if (!system.skills?.[key]) continue;
    actor.addBonus(`system.skills.${key}`, {
      label: "Roguish Skill",
      value: 1,
      type: "class",
      source: "roguishSkill"
    });
  }

  // Enchanting Smile (Wizard School: Enchantment): "+1 class bonus on
  // Deception, Diplomacy and Intimidate... increases to +2 at 10th level
  // and +3 at 20th level." Flat and passive — nothing to choose, so it is
  // contributed to the pool unconditionally whenever the school is owned,
  // the same shape Roguish Skill's own flat class bonus uses just above.
  if (schoolsOf(actor).some((s) => String(s.name ?? "").trim().toLowerCase() === "enchantment")) {
    const smile = enchantingSmileBonus(level);
    if (smile) {
      for (const key of ENCHANTING_SMILE_SKILLS) {
        if (!system.skills?.[key]) continue;
        actor.addBonus(`system.skills.${key}`, {
          label: "Enchanting Smile",
          value: smile,
          type: "class",
          source: "enchantingSmile"
        });
      }
    }
  }

  // The character's class bonus, for the tooltip below. It used to be a
  // local const a few lines up, and extracting applyClassSkillBonuses in
  // 3.209.0 took the declaration with it and left this reference behind
  // — a plain ReferenceError in the single most-executed function in the
  // system, which aborted data preparation for EVERY actor in the world
  // from this line onward. Skills, encumbrance and everything after them
  // simply stopped deriving.
  //
  // Six harnesses and eleven thousand checks were green. `node --check`
  // parses; it does not resolve identifiers. See verify-lint.mjs, which
  // does.
  const classBonus = Number(system.identity?.classBonus ?? 0);

  // FEARFUL STRENGTH (Creature Codex; 3.631.0): "When making an Intimidate
  // skill check, the creature can choose to use their Strength modifier
  // instead of their Charisma modifier" — declared `derives.skillAbilitySwap:
  // { skill: "intimidate", ability: "strength" }`; the higher of the two.
  const abilitySwaps = abilitySkillSwaps(Array.from(actor.items ?? []));
  for (const [key, skill] of Object.entries(system.skills)) {
    skill.ranks = clampSkillRanks(skill.ranks, level);
    const swap = abilitySwaps.get(key);
    if (swap && Number(system.attributes?.[swap]?.total ?? 0) > Number(system.attributes?.[skill.ability]?.total ?? 0)) {
      skill.ability = swap;
    }
    const ability = Number(system.attributes?.[skill.ability]?.total ?? 0);
    // For the sheet: which sources call this a class skill, and what the
    // tickbox should show. A skill granted by the class or an archetype
    // is a class skill whether or not the player ticked it.
    const sources = sourcesBySkill.get(key) ?? [];
    skill.classSkillSources = sources.map((source) => source.label);
    skill.isClassSkill = sources.length > 0;
    // Ticked and LOCKED when something other than the player says so —
    // unticking it would do nothing, so the sheet should not offer to.
    skill.classSkillLocked = sources.some((source) => source.id !== "manual");
    skill.classSkillTooltip = classSkillTooltip(sources, classBonus);

    const resolved = applyTarget(skill, {
      actor,
      path: `system.skills.${key}`,
      slotTypes: TARGET_SLOTS.skill,
      extra: ability,
      additiveLabel: `${ATTRIBUTE_LABELS[skill.ability] ?? skill.ability} and ranks`,
      overrides: STACKING_OVERRIDES.skill
    });

    skill.dc = 10 + resolved.total;
  }

  for (const [key, skill] of Object.entries(system.specialistSkills)) {
    const ability = Number(system.attributes?.[skill.ability]?.total ?? 0);
    skill.class = Number(system.identity?.classBonus ?? 0);

    // Specialist bonus = Level + Class Bonus + Ability Modifier + 2
    const extra = Number(system.identity?.level ?? 0) + ability + 2;

    const resolved = applyTarget(skill, {
      actor,
      path: `system.specialistSkills.${key}`,
      slotTypes: TARGET_SLOTS.specialistSkill,
      extra,
      additiveLabel: "Level, ability and +2",
      overrides: STACKING_OVERRIDES.specialistSkill
    });

    skill.dc = 10 + resolved.total;
  }

  // Counted AFTER the rank clamp above, so points are not reported
  // spent on ranks the character does not actually have.
  const budget = prepareSkillBudget(system, actor);
  // ...and each offending row marked, so "over the level cap" is a thing
  // the player can SEE in the table rather than a sentence at the top
  // naming skills they then have to go and find.
  for (const entry of budget?.overLevel ?? []) {
    if (system.skills?.[entry.key]) system.skills[entry.key].overLevel = true;
  }
}

function prepareEncumbrance(system, items, actorType = "") {
  const carriedWeight = computeCarriedWeight(items, system.currency);

  if (system.encumbrance) {
    system.encumbrance.value = Math.round(carriedWeight * 100) / 100;
    // Weight Allowance (Chapter 6): 50 + Strength score x 10. The actual
    // Dex/Speed penalties from exceeding it are derived earlier, in
    // prepareAttributes and prepareCombat — this is the display value,
    // so it must show the same Hauler-adjusted allowance they used.
    // THE SAME FUNCTION the penalties above used. This used to re-derive
    // Hauler's +2 by hand, which is how a Backpack could have been added
    // to one of them and not the other.
    const carryBonus = carryStrengthBonus({
      featNames: Array.from(items ?? []).filter((i) => i.type === "feat").map((i) => i.name),
      items: Array.from(items ?? []),
      animal: carriesAsAnimal(actorType, system)
    });
    system.encumbrance.max = weightAllowance(
      Number(system.attributes?.strength?.total ?? 0) + carryBonus
    );
    // And what is riding in a weightless container, against what will fit.
    system.encumbrance.stowage = stowageSummary(Array.from(items ?? []));
  }
}

export function prepareResourcePercentages(system, { apAllowance = 0 } = {}) {
  for (const key of ["hp", "pp", "ap", "reactions", "conviction"]) {
    const resource = system.resources?.[key];
    if (!resource) continue;
    // ACTIONS ABOVE THE CEILING, WHEN SOMETHING GRANTED THEM (3.609.1, the
    // 3.609.0 live test's F9). Time Stop adds 1d6+3 AP "past its maximum";
    // clamped here, seven extra actions read as three. The allowance is the
    // `apOverflow` flag Time Stop writes and the next turn's regain clears.
    const max = Number(resource.max ?? 0) + (key === "ap" ? Math.max(0, Number(apAllowance) || 0) : 0);
    resource.value = clampResourceValue(resource.value, max);
    resource.pct = resourcePercentage(resource.value, max);
  }
}

export class TRGActor extends Actor {
  /**
   * Refuse a skill-rank purchase the character cannot afford.
   *
   * The sheet had no limit at all: a character could put ranks in every
   * skill on it and nothing said a word. Enforced here rather than in
   * the derive, because a derive can only report — it cannot stop the
   * write, and silently lowering the number after the fact reads as the
   * sheet being broken.
   *
   * Lowering ranks is always allowed; it hands points back. Raising is
   * capped by whichever is tighter, the character's level or what they
   * have left to spend. An already-overspent character (built before
   * this existed, or whose Intelligence has since dropped) can still
   * lower ranks freely, and is never silently corrected.
   */
  async _preUpdate(changed, options, user) {
    const result = await super._preUpdate(changed, options, user);
    if (result === false) return result;

    // "YOUR CONVICTION POINTS CAN NEVER BE LESS THAN 0" (3.619.0; Chapter
    // 12, block 38's A3). Every spend floored at 0; a typed −1 did not.
    const typedConviction = foundry.utils.getProperty(changed, "system.resources.conviction.value");
    if (typedConviction !== undefined && !(Number(typedConviction) >= 0)) {
      foundry.utils.setProperty(changed, "system.resources.conviction.value", 0);
    }

    // A POOL THE GM GAVE AN NPC (R11) is remembered, so a duplicate of that
    // NPC keeps it rather than starting again at 0/0.
    if (this.type === "npc") {
      const typedMax = foundry.utils.getProperty(changed, "system.resources.conviction.max");
      if (typedMax !== undefined) {
        foundry.utils.setProperty(changed, "flags.trg-prime.convictionGranted", Number(typedMax) > 0);
      }
    }

    if (this.type !== "character") return result;

    this.#convictionOnLevelling(changed, options);

    this.#clampAbilityBases(changed);

    const incoming = foundry.utils.getProperty(changed, "system.skills");
    if (!incoming || typeof incoming !== "object") return result;

    const level = Number(this.system?.identity?.level ?? 0);
    const budget = this.system?.progression?.skillBudget;

    // "POWER MANIPULATION (Int) — Requirements Adept" (Chapter 4, page
    // 91). The only skill in the book that gates on class type, and
    // Graham's ruling R1 of 17 September 2026 was "Refuse a non-adept" —
    // so it is refused HERE, at build time, rather than at each of the
    // skill's five actions. A sheet that cannot hold the ranks cannot
    // reach the actions, and there is no state where the sheet shows a
    // bonus the character may never roll.
    //
    // LOWERING IS ALWAYS ALLOWED, for the reason the affordability clamp
    // below gives: a character built before this existed, or one who has
    // since retrained out of an Adept class, must be able to put the
    // ranks back rather than being frozen holding them.
    const tiers = effectiveTiers(
      this.items?.find?.((i) => i.type === "class")?.system?.classType ?? "",
      Array.from(this.items ?? [])
        .filter((i) => i.type === "feat" && /archetype/i.test(String(i.system?.traits ?? "")))
        .map((i) => i.name)
    );
    const classRefused = [];
    for (const [key, patch] of Object.entries(incoming)) {
      if (!patch || !Object.hasOwn(patch, "ranks")) continue;
      const needed = skillClassTypeRequirement(key);
      if (!needed || meetsSkillClassType(key, tiers)) continue;
      const current = Number(this.system.skills?.[key]?.ranks ?? 0);
      const wanted = Math.max(0, Math.floor(Number(patch.ranks) || 0));
      if (wanted <= current) continue;
      classRefused.push(`${this.system.skills?.[key]?.label ?? key} (requires ${needed})`);
      patch.ranks = current;
    }
    if (classRefused.length) {
      ui.notifications?.warn(
        `Your class type does not allow ranks in: ${classRefused.join(", ")}.`
      );
    }

    // THE LEVEL CAP APPLIES WHETHER OR NOT THERE IS A CLASS.
    //
    // "Ranks can never exceed your character level" is a rule about the
    // character, not about their class — and this used to return early
    // when there was no budget to check against, so a classless
    // character could type 99 into any skill and it stuck. The input's
    // `max` attribute does not stop a typed value either; only this
    // does. The POINTS cap needs a budget; the level cap does not.
    let remaining = budget ? Number(budget.remaining ?? 0) : Infinity;
    const overLevel = [];
    const unaffordable = [];
    let wouldOverspendBy = 0;

    for (const [key, patch] of Object.entries(incoming)) {
      if (!patch || !Object.hasOwn(patch, "ranks")) continue;
      const label = this.system.skills?.[key]?.label ?? key;
      const current = Number(this.system.skills?.[key]?.ranks ?? 0);
      const wanted = Math.max(0, Math.floor(Number(patch.ranks) || 0));
      const allowed = affordableRanks({ current, wanted, remaining, level });
      // Each skill in one update spends from what the previous ones left.
      if (Number.isFinite(remaining)) remaining -= (allowed - current);
      if (allowed !== wanted) {
        // Which limit bit? Both messages are worth telling apart: one
        // says "you are not high enough level", the other "you cannot
        // afford it", and they are fixed in completely different ways.
        if (wanted > Math.max(1, level)) overLevel.push(`${label} (${wanted} → ${allowed})`);
        else {
          unaffordable.push(`${label} (${wanted} → ${allowed})`);
          wouldOverspendBy += (wanted - allowed);
        }
      }
      patch.ranks = allowed;
    }

    if (overLevel.length) {
      ui.notifications?.warn(
        `Ranks cannot exceed your character level (${level}): ${overLevel.join(", ")}.`
      );
    }
    if (unaffordable.length) {
      ui.notifications?.warn(
        `Not enough skill points — that would put you ${wouldOverspendBy} over. ` +
        `${unaffordable.join(", ")}. ` +
        `${Math.max(0, Number(budget?.remaining ?? 0))} left of ${budget?.available ?? 0}.`
      );
    }
    return result;
  }

  /**
   * A CONVICTION POINT FOR EACH LEVEL GAINED (3.619.0; Chapter 12, page 390,
   * Graham's R7): "A PC gains a conviction point each time they gain a
   * level." Written into the same update that raises the XP, so the point
   * and the level arrive together; the card is posted after (_onUpdate).
   *
   * The new maximum is the new level's, with whatever feats and class
   * abilities add carried across — it is derived, and this runs before the
   * derive sees the new level.
   */
  #convictionOnLevelling(changed, options) {
    const incomingXP = foundry.utils.getProperty(changed, "system.identity.xp.value");
    if (incomingXP === undefined || !convictionEnabled()) return;
    const fromLevel = Number(this.system?.identity?.level ?? 0);
    const toLevel = levelForXP(incomingXP);
    if (!(toLevel > fromLevel)) return;
    const resource = this.system?.resources?.conviction ?? {};
    const bonus = Number(resource.max ?? 0) - convictionMax(fromLevel);
    const max = convictionMax(toLevel) + Math.max(0, bonus);
    const typed = foundry.utils.getProperty(changed, "system.resources.conviction.value");
    const value = typed === undefined ? Number(resource.value ?? 0) : Number(typed) || 0;
    const after = convictionAfterLevelling({ fromLevel, toLevel, value, max });
    if (after === value) return;
    foundry.utils.setProperty(changed, "system.resources.conviction.value", after);
    options.trgConvictionLevelled = { fromLevel, toLevel, before: value, after, max };
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    const levelled = options?.trgConvictionLevelled;
    if (levelled && userId === game.user?.id) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${this.name}</span><h3>Conviction — A New Level</h3></div></header>`
          + `<p style="margin:2px 0">Level ${levelled.fromLevel} → <strong>${levelled.toLevel}</strong>: a conviction point for each level gained.</p>`
          + `<p style="margin:2px 0">Conviction ${levelled.before} → <strong>${levelled.after}</strong> (maximum ${levelled.max}).</p></div>`
      });
    }
  }

  /**
   * THE ABILITY-SCORE CEILING, ENFORCED ON WRITE (3.322.0).
   *
   * Chapter 1: "no ability score can exceed 4 points… You can also use
   * your level-based ability score increases to bring a base ability
   * above 4 to a maximum of 6." Chapter 3's Level Table is where those
   * increases come from — 3rd level and every three thereafter.
   *
   * Live on 17 Aug 2026, 3.321.1: typing 9 into a 1st-level character's
   * Strength base THROUGH THE SHEET was accepted and persisted. The
   * banner said "Remaining: -3" and the input carried `max="4"`, and
   * neither stopped it — the same discovery the skill-ranks clamp below
   * already records in its own comment: *"The input's `max` attribute
   * does not stop a typed value either; only this does."* Ability scores
   * were simply left behind when that lesson was learned.
   *
   * THE CEILING IS CLAMPED, THE POOL IS ONLY WARNED ABOUT (Graham's
   * ruling, 17 Aug 2026), and the asymmetry is deliberate. The ceiling is
   * unambiguous: no legal character ever has a base above the level's
   * maximum, at any moment. The six-point POOL is different, because the
   * rulebook's own example builds through an overspent state — "a -2
   * Strength grants 2 more points elsewhere" means a player may set the
   * +4 before typing the -2 that pays for it. Clamping that would make a
   * legal build impossible to enter in the obvious order.
   *
   * ONLY THE VALUES IN THIS UPDATE are touched, never the rest of the
   * sheet. A GM correcting XP downward must not silently shave points off
   * scores nobody asked about — the same rule the ranks clamp follows,
   * and the reason both loops iterate `incoming` rather than the actor.
   */
  #clampAbilityBases(changed) {
    const incoming = foundry.utils.getProperty(changed, "system.attributes");
    if (!incoming || typeof incoming !== "object") return;

    // The level AFTER this update: XP and a base can move together, and
    // the ceiling that matters is the one the character ends up at.
    const incomingXP = foundry.utils.getProperty(changed, "system.identity.xp.value");
    const level = incomingXP === undefined
      ? Number(this.system?.identity?.level ?? 0)
      : levelForXP(incomingXP);
    const range = abilityBaseRange(level);

    const clamped = [];
    for (const [key, patch] of Object.entries(incoming)) {
      if (!patch || typeof patch !== "object" || !Object.hasOwn(patch, "base")) continue;
      const wanted = Math.round(Number(patch.base) || 0);
      const allowed = Math.min(Math.max(wanted, range.min), range.max);
      if (allowed !== wanted) {
        clamped.push(`${ATTRIBUTE_LABELS[key] ?? key} (${wanted} → ${allowed})`);
      }
      patch.base = allowed;
    }

    if (clamped.length) {
      ui.notifications?.warn(
        `A base ability score at level ${level} must be between ${range.min} and ` +
        `${range.max}: ${clamped.join(", ")}.`
      );
    }

    // THE POOL: warned about, never clamped. Computed from what the sheet
    // will hold after this update, so the warning counts the whole build
    // rather than the one field being edited.
    const after = {};
    for (const key of ATTRIBUTE_KEYS) {
      after[key] = Object.hasOwn(incoming[key] ?? {}, "base")
        ? incoming[key].base
        : Number(this.system?.attributes?.[key]?.base ?? 0);
    }
    const summary = abilityPointSummary(level, after);
    if (summary.remaining < 0) {
      ui.notifications?.warn(
        `That spends ${summary.spent} ability points of ${summary.pool} — ` +
        `${-summary.remaining} over. Lower another score to pay for it.`
      );
    }
  }

  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    const isCharacter = this.type === "character";
    // A party has no hit points and no power points, so pointing its
    // token bars at `resources.hp` names fields its schema does not
    // have. It is not put on a scene in normal play, but a prototype
    // token exists on every actor whether or not anyone places one, and
    // a bar bound to a missing attribute is a broken token waiting for
    // the first GM who drags one out to see what happens.
    const bars = this.type === PARTY_TYPE
      ? {}
      : { bar1: { attribute: "resources.hp" }, bar2: { attribute: "resources.pp" } };
    const prototypeToken = foundry.utils.mergeObject(
      {
        actorLink: isCharacter,
        disposition: isCharacter
          ? CONST.TOKEN_DISPOSITIONS.FRIENDLY
          : CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        displayName: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
        ...bars,
        sight: { enabled: true }
      },
      data.prototypeToken ?? {},
      { inplace: false }
    );

    // AN NPC STARTS WITH NO CONVICTION (3.619.0; Chapter 12, Graham's R11):
    // the GM grants a pool to a major NPC by typing it. A copy of an NPC
    // the GM already gave a pool (a duplicate, an export) keeps it.
    const update = { prototypeToken };
    if (this.type === "npc" && !this.flags?.["trg-prime"]?.convictionGranted) {
      update["system.resources.conviction"] = { value: 0, max: 0 };
    }
    // …NOR ANY LUCK (3.624.0, block 40's R16): "Each player (not character)
    // begins … with a luck score of 15". The template's 15 is the player's;
    // a non-character arriving with exactly that gets 0, and a GM who gives
    // a major NPC a pool types it.
    const luck = luckOnCreate(this.type, this.system?.resources?.luck?.value);
    if (luck !== null) update["system.resources.luck.value"] = luck;
    this.updateSource(update);
  }

  /**
   * Reset the typed bonus pools before Active Effects are applied.
   * Foundry calls this at the start of every preparation cycle, which is the
   * only safe point to clear pools that the effect phase is about to fill.
   */
  prepareBaseData() {
    super.prepareBaseData();

    // Conviction pool maximum: 1, +1 at 5th level and every 5 thereafter
    // (Chapter 12). Set in base data so Active Effects from feats such as
    // Hero's Fortune add on top.
    const conviction = this.system.resources?.conviction;
    // AN NPC'S POOL IS THE GM'S (3.619.0; Chapter 12, Graham's R11): "Some
    // powerful or major NPC's and creatures may be allowed to have
    // conviction points. The details of this is left up to the GM" — so it
    // is typed on the sheet, not derived. New NPCs start at 0/0 (_preCreate).
    if (conviction && this.type !== "npc") {
      // Divine Resolve (Crusader), Warrior's Resolve (Fighter) and
      // Scoundrel's Luck (Rogue) — three classes, one printed sentence
      // — each raise the pool by 1. Added to the base figure here
      // rather than as an effect so an Active Effect from Hero's
      // Fortune still stacks on top.
      // THE LEVEL FROM XP, NOT THE STORED ONE (3.620.0; the 3.619.0 drive's
      // F1). Base data runs before prepareIdentity derives a character's
      // level from XP, so `identity.level` here was the stored field — stale
      // on any character levelled by XP (a 12th-level Bard read 1, max 1),
      // and the point a new level brought was clamped away at once.
      const baseLevel = this.type === "character" && this.system.identity?.xp
        ? levelForXP(this.system.identity.xp.value)
        : (this.system.identity?.level ?? 0);
      conviction.max = convictionMax(baseLevel) +
        divineResolveBonus(this) + warriorsResolveBonus(this) + scoundrelsLuckBonus(this) +
        // HERO'S FORTUNE (3.619.0, R8): "Your maximum conviction pool
        // increases by 1."
        heroesFortuneBonus(this);
    }

    // Battle Readiness (Fighter, 2nd): "At the start of each round, you
    // gain one additional reaction." The pool maximum is derived — one,
    // plus the ability — in base data for the same stacking reason as
    // conviction above. The RESTRICTION on what the extra reaction may
    // be spent on is enforced where reactions are spent
    // (action-points-workflow), not here: a maximum is just a number.
    const reactions = this.system.resources?.reactions;
    if (reactions) {
      reactions.max = 1 + battleReadinessBonus(this);
    }
    this._trgBonuses = new Map();
  }

  /**
   * Record a typed bonus against a derived target.
   * Called by TRGActiveEffect during the Active Effect phase.
   *
   * @param {string} target e.g. "system.skills.religion"
   * @param {object} entry {label, value, type, source}
   */
  addBonus(target, entry) {
    // Deliberately a plain property rather than a private class field. Foundry
    // can run a preparation cycle from inside the Document constructor, before
    // class field initialisers have installed, and touching a private field at
    // that point throws.
    if (!this._trgBonuses) this._trgBonuses = new Map();
    if (!this._trgBonuses.has(target)) this._trgBonuses.set(target, []);
    this._trgBonuses.get(target).push(entry);
  }

  /**
   * Retrieve every bonus contributed to a target.
   * @param {string} target
   * @returns {object[]}
   */
  getBonusPool(target) {
    return this._trgBonuses?.get(target) ?? [];
  }

  /** All pooled bonuses, for inspection and debugging. */
  get bonusPools() {
    return Object.fromEntries(this._trgBonuses ?? new Map());
  }

  /**
   * The resolved condition state from the last preparation cycle.
   * @returns {{effective: Set<string>, granted: Map<string,string>,
   *   values: Map<string, number>}}
   */
  get conditions() {
    return (
      this._trgConditions ?? {
        effective: new Set(),
        granted: new Map(),
        values: new Map()
      }
    );
  }

  /**
   * Whether a condition is in effect, whether applied directly or granted by
   * another condition (Unconscious grants Blinded, and so on).
   * @param {string} id
   * @returns {boolean}
   */
  hasCondition(id) {
    return this.conditions.effective.has(id);
  }

  /**
   * The value of an effective condition, or null if not active.
   * @param {string} id
   * @returns {number|null}
   */
  getConditionValue(id) {
    if (!this.hasCondition(id)) return null;
    return this.conditions.values.get(id) ?? 1;
  }

  /** The directly applied effect for a condition, if any. */
  #findConditionEffect(id) {
    return this.effects.find(
      (effect) => !effect.disabled && effect.statuses?.has?.(id)
    );
  }

  /**
   * The damage types, conditions and traits this actor is immune to —
   * what a GM typed into the field, plus what the creature is.
   */
  get immunities() {
    return resolveImmunities(
      this.system,
      derivedImmunitySets(this.system, ownedCreatureTypeSystem(this))
    );
  }

  /**
   * Whether an application of this condition should be refused.
   *
   * Deliberately a method on the Actor rather than a check inside one
   * workflow. Conditions are applied from some forty-five places, and the
   * only condition immunity that existed before this — Rage stopping
   * Stunned — lived in a helper that most of them bypass, so a Raging
   * character could still be stunned by Conviction or by the combat
   * tracker. Guarding the toggle covers every caller at once.
   */
  isImmuneToCondition(statusId) {
    return coversCondition(this.immunities.conditions, statusId);
  }

  /**
   * Toggle a TRG condition. Valued conditions open a value dialog on both
   * application and re-selection (design decision: explicit dialog rather
   * than increment-on-click). Unvalued conditions toggle as normal.
   *
   * @param {string} statusId
   * @param {object} [options]
   * @param {boolean} [options.active] Force on or off.
   * @param {number} [options.value] Supply a value directly, skipping the
   *   dialog; used by automation.
   * @param {boolean} [options.force] Apply even if the actor is immune.
   *   The GM's override; nothing in the system sets it.
   * @returns {Promise<ActiveEffect|boolean|undefined>}
   */
  async toggleStatusEffect(statusId, options = {}) {
    const condition = CONDITIONS[statusId];

    // Immunity refuses the application outright. Removal is always
    // allowed — an immunity gained while already stunned should not trap
    // the condition in place.
    if (
      options.active !== false &&
      options.force !== true &&
      this.isImmuneToCondition(statusId)
    ) {
      ui.notifications?.info?.(
        `${this.name} is immune to ${condition?.label ?? statusId}.`
      );
      return false;
    }

    if (!condition?.valued) return super.toggleStatusEffect(statusId, options);

    const existing = this.#findConditionEffect(statusId);

    // Automation path: a value was supplied, no dialog.
    if (options.value !== undefined) {
      // BRAVERY (Chapter 5): "you reduce the severity of the frightened
      // condition by 1 each time you succumb to it."
      //
      // HERE, BESIDE THE IMMUNITY GUARD, for the reason recorded there:
      // "most of the forty or so places that apply conditions never call"
      // the shared helper, so a rule written into the helper reaches
      // whichever callers happen to use it. Demoralise, a spell's effect
      // and the condition workflow all apply Frightened by three different
      // routes, and all three arrive at this line.
      //
      // NOT APPLIED ON REMOVAL, and not to a value already on the sheet:
      // "each time you succumb" is the moment it lands. `options.force`
      // skips it for the same reason it skips immunity — a GM setting a
      // value by hand is not the character succumbing to anything.
      const incoming = statusId === "frightened" && options.force !== true
        ? frightenedApplied(options.value, featNamesOf(this))
        : options.value;
      if (statusId === "frightened" && incoming !== options.value) {
        ui.notifications?.info?.(
          `${this.name}'s Bravery softens it — Frightened ${options.value} lands as ${incoming || "nothing"}.`
        );
      }
      if (statusId === "frightened" && !incoming) {
        return existing ? super.toggleStatusEffect(statusId, { active: false }) : false;
      }
      return this.#applyValuedCondition(
        statusId,
        incoming,
        existing,
        options.damageType ?? null
      );
    }

    // Explicit removal request.
    if (options.active === false) {
      if (existing) await existing.delete();
      return false;
    }

    const current = existing
      ? Number(existing.getFlag("trg-prime", "value") ?? 1)
      : null;
    const currentType = existing
      ? (existing.getFlag("trg-prime", "damageType") ?? null)
      : null;

    // The GM's flat-check lever, shown at whatever it is now (R18).
    const currentReduction = existing
      ? Number(existing.getFlag("trg-prime", statusId === "bleeding"
        ? "bleedFlatCheckReduction" : "recurringFlatCheckReduction") ?? 0)
      : 0;

    const result = await promptConditionValue(statusId, current, {
      damageType: currentType,
      reduction: currentReduction
    });
    if (!result) return undefined;

    if (result.action === "remove") {
      if (existing) await existing.delete();
      return false;
    }

    return this.#applyValuedCondition(
      statusId,
      result.value,
      existing,
      result.damageType ?? null,
      result.flatCheckReduction ?? 0
    );
  }

  /** Create or update the effect backing a valued condition. */
  async #applyValuedCondition(id, value, existing, damageType = null, flatCheckReduction = 0) {
    // Recurring damage always has a damage type (ruled). Automation that
    // omits one gets fire, the most common source, rather than an untyped
    // effect that the rules do not recognise.
    if (id === "recurring" && !damageType) damageType = "fire";

    const data = conditionEffectData(id, value, damageType, flatCheckReduction);
    // WHAT IT WAS, for the consequences of the change (3.621.0; block 39).
    const before = existing ? Number(existing.getFlag?.("trg-prime", "value") ?? 1) : 0;
    const settle = async () => {
      const { afterValuedCondition } = await import("../conditions/condition-events-workflow.mjs");
      await afterValuedCondition(this, id, before, Number(value) || 0);
    };

    if (existing) {
      const leverKey = { bleeding: "bleedFlatCheckReduction", recurring: "recurringFlatCheckReduction" }[id];
      await existing.update({
        name: data.name,
        [`flags.trg-prime.value`]: value,
        [`flags.trg-prime.damageType`]: id === "recurring" ? damageType : null,
        ...(leverKey
          ? { [`flags.trg-prime.${leverKey}`]: Math.max(0, Math.round(Number(flatCheckReduction) || 0)) }
          : {})
      });
      await settle();
      return existing;
    }

    const [effect] = await this.createEmbeddedDocuments("ActiveEffect", [data]);
    await settle();
    return effect;
  }

  /**
   * Produce a normalised copy of this Actor's stored system data, suitable for
   * use as the `system` payload of a migration update.
   *
   * Reads from `_source` rather than `toObject()` so that derived values are
   * never written back into the stored document.
   *
   * @returns {object} The migrated system data.
   */
  migrateSystemData() {
    const source = foundry.utils.deepClone(this._source?.system ?? {});

    // Convert the legacy array collections *before* the template merge. If this
    // ran afterwards the stored array would take precedence over the keyed
    // template object and the conversion would be silently discarded.
    source.skills = normaliseSkills(source.skills);
    source.specialistSkills = normaliseSpecialistSkills(
      source.specialistSkills
    );

    const template = foundry.utils.deepClone(
      game.model?.Actor?.[this.type] ?? {}
    );

    // Stored values win; the template only restores fields that are absent.
    return foundry.utils.mergeObject(template, source, {
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      recursive: true,
      inplace: true
    });
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    const system = this.system;
    if (!system) return;

    // A PARTY IS NOT A CREATURE, and everything past this line is
    // creature preparation — skills, attributes, conditions, bonus
    // pools, encumbrance, proficiency, attack and defence.
    //
    // Without this guard the whole pipeline ran on one anyway, because
    // it never asked what type it was working on. Seen live on 12 Aug
    // 2026, the moment the first party actor was created: it came back
    // carrying all twenty-six skills and a null `progression`, neither
    // of which is in its schema, fabricated fresh on every preparation
    // cycle. Nothing threw — the steps below are individually defensive
    // enough ("if (combat.attack)", and so on) that a schema with none
    // of the fields skips most of the work quietly.
    //
    // That quiet is the problem. It made a party pay for a full creature
    // derivation on every render, and it left the next line added down
    // there that reaches a field without checking free to crash a sheet
    // that has no business running any of it.
    if (this.type === PARTY_TYPE) return;

    // Normalisation must precede prepareConditions, which reads skill
    // abilities to route Dazed and Weakened penalties. Accepting the legacy
    // array shape here keeps pre-3.2.0 worlds rendering until migration runs.
    system.skills = normaliseSkills(system.skills);
    system.specialistSkills = normaliseSpecialistSkills(
      system.specialistSkills
    );

    // Increase Size (Companion feat, repeatable). BEFORE everything
    // below, because size is an INPUT to most of it: the Strength and
    // Dexterity size modifiers in prepareAttributes, the size row of the
    // HP table in prepareResources, and reach.
    //
    // DERIVED, not written by a Use button. `system.identity.size` is
    // set by an ActiveEffect from the base creature, so a button's write
    // would be overwritten on the very next preparation; and the feat
    // cannot carry an effect of its own, because "one step larger" is an
    // answer that depends on which species this is and how many copies
    // of the feat it has. prepareDerivedData is the first moment after
    // effects have applied, which makes it the first moment a change
    // here sticks.
    if (isCompanion(this)) {
      const grown = companionCurrentSize({
        startingSize: system.companion?.startingSize,
        maximumSize: system.companion?.maximumSize,
        featNames: featNamesOf(this)
      });
      // Null when the starting size is unrecognised — a hand-built
      // companion with no species recorded. Leave whatever the sheet or
      // an effect set rather than coercing it to Medium (lesson 18).
      if (grown) system.identity.size = grown;
    }

    prepareIdentity(system, this);
    // Before everything below it: HP, defence, saves, power points,
    // spellcraft and caster level all read from this, and it is a pure
    // resolve with no dependency of its own beyond the character's level.
    prepareClassProgression(system, this);
    // A familiar has no class item, so the line above resolved nothing.
    // Its saves, BAB and BDB are its MASTER's, and they arrive through
    // the same `system.progression` seam a class would have filled —
    // which is why this has to happen here, before conditions read the
    // saves and before anything else reads the progression at all.
    if (isFamiliar(this)) {
      prepareFamiliarProgression(system);
      prepareFamiliarSkills(system);
    }
    prepareConditions(system, this);
    prepareAttributes(system, this);
    prepareSkillPointBudget(system, this);
    prepareResources(system, this);
    // "Hit points equal to half of your characters (round up)" — which
    // is not a size row plus a per-level rate, so it replaces what
    // prepareResources just computed rather than adjusting it.
    if (isFamiliar(this)) {
      prepareFamiliarHitPoints(system, abilityNamesOf(this));
    }
    // Locked PP (Chapter 9 extended durations): PP held aside from recovery by
    // "until daily preparations" / "unlimited" spells still running.
    if (system.resources?.pp) {
      system.resources.pp.locked = lockedPP(getActiveSpells(this));
      // Maximum PP is derived in prepareMagic, AFTER the casting ability
      // is resolved — Charismatic Caster switches it and its own card
      // promises "PP, Spellcraft and all casting mechanics now use Cha",
      // which is only true if the PP sum reads the resolved ability
      // rather than the class's declared one.
    }
    // ACP before combat: Instinctive Defence's dodge bonus is conditional
    // on a zero ACP, so the penalty must be derived before the Defence
    // Bonus assembles. ACP itself reads only equipped items and writes
    // skill pools consumed later in prepareSkills — safe to run early.
    prepareArmourCheckPenalty(system, this);
    prepareHelmPerception(system, this);
    // ADJUSTING LEVEL (3.633.0, F&F 3.0 R13): +1 per step to every d20 pool
    // and DB, into the pools before combat and skills resolve them.
    for (const { path, entry } of elAdjustRows(system, elAdjustOf(this))) this.addBonus(path, entry);
    prepareCombat(system, this);
    prepareArmourProtection(system, this);
    prepareSkills(system, this);
    prepareEncumbrance(system, this.items, this.type);
    prepareResourcePercentages(system, { apAllowance: Number(this.flags?.["trg-prime"]?.apOverflow) || 0 });
    prepareGrantedTraits(system, this);
    // Starting wealth (Chapter 6). AFTER prepareAttributes, because
    // Charisma's contribution is the resolved TOTAL — a race's or an
    // item's Charisma counts towards a character's starting coin, and
    // reading `base` here would have quietly ignored both.
    //
    // Derived, never written. The score is a statement about what the
    // character IS; the coin it buys is written once, deliberately, by
    // the button on the sheet.
    // ABOVE 1ST LEVEL, CHAPTER 12'S TABLE INSTEAD (3.619.0, R5).
    system.wealth = startingWealthFor(this);
    prepareTextLists(system);
  }
}

/**
 * The two trait fields an actor derives rather than owns.
 *
 * `details.creatureType` — THE TYPE, taken from the owned creature-type item,
 * which is where a creature's type genuinely lives (it is the thing carrying
 * death state, natural DR, crit immunity and granted abilities). Derived here
 * so that `creatureTypesOf` can ask a system object for it without being handed
 * an Actor, and so that exactly one place in the project decides what a
 * creature's type is.
 *
 * Graham, 15 Aug 2026, on the three objects and how they differ: a Creature
 * Type "determines a number of core abilities"; a Creature Trait is "used to
 * determine if certain effects and spells affect a character" and provides
 * "no mechanical modifiers". Before this, `aligned.mjs` decided creature type
 * by reading the TRAIT line — which agreed with the type for every shipped
 * statblock, because each one types its type into both places by hand, and
 * disagreed the moment 3.314.0 let a Form spell grant a type-named trait.
 *
 * `details.grantedTraits` — the traits active effects are currently conferring.
 *
 * DERIVED, NOT WRITTEN, and that is the whole point. Four races already add to
 * `system.details.traits` through an ordinary ADD change — Half-Orc's
 * ", orc, half-orc", Furini's ", fey" — and a Form spell could have used the
 * same mechanism in one line. It deliberately does not, for a reason that only
 * applies to a grant that ENDS: the sheet's Creature Traits box is bound to
 * `system.details.traits`, so a caster who opened their sheet halfway through
 * Shape Of The Beast and saved it would write "beast" into the field for good,
 * and the form's expiry would then have to subtract a word from a string it no
 * longer owns. A race's grant has no such hazard because it is never removed.
 *
 * So the grant rides on the granting effect as a flag and is rebuilt into a
 * separate derived field every preparation. `creatureTraits()` unions the two,
 * the sheet keeps showing only what a GM typed, and nothing has to remove
 * anything — exactly the argument `derivedImmunities` makes one file over.
 */
function prepareGrantedTraits(system, actor) {
  if (!system.details) return;
  system.details.creatureType = String(ownedCreatureType(actor)?.name ?? "").trim().toLowerCase();
  // A DIVINE ASPECT GRANTS ITS OWN ALIGNMENT (3.446.0). Graham's ruling of
  // 31 August 2026: "any PC that takes a Divine Aspect should gain the
  // aligned trait of that aspect." Every aspect already carries it in its
  // own trait line, so this is a wiring job and not a table of ten.
  //
  // THROUGH THE SAME DERIVED FIELD as a Form spell's grant, for the reason
  // this function's header sets out at length: an aspect can be removed,
  // and a trait written into `details.traits` is one a player can save
  // into their sheet for good. Unioned rather than appended so a character
  // whose aspect and whose Form both say "good" carries it once.
  const fromAspects = aspectAlignedTraits(aspectsOf(actor));
  // AN "INCORPOREAL" ABILITY IS THE TRAIT (3.618.1, F1 of the 3.618.0 drive).
  const fromAbilities = abilityGrantedTraits(Array.from(actor?.items ?? []));
  system.details.grantedTraits = [
    ...new Set([...effectGrantedTraits(actor), ...fromAspects, ...fromAbilities])
  ].join(", ");
}

/**
 * Tidy the comma-separated text fields that effects APPEND to.
 *
 * There is no other way to add to a string through an ActiveEffect: mode
 * ADD concatenates, so every authored value has to lead with ", " or it
 * fuses onto whatever is already there ("gnomefey"). That is right when
 * something wrote first and wrong when nothing did — a Dwarf with Azgar
 * showed a resistances field reading ", fire", and a Furini gnome's
 * traits read ", fey", because neither race writes those fields at all.
 *
 * Fixed here rather than in the authored values because which source
 * lands first isn't knowable at build time: it depends on which items a
 * character happens to carry. Cosmetic only — every consumer already
 * splits on commas and trims — but it is the first thing a player reads
 * on the sheet.
 */
function prepareTextLists(system) {
  const tidy = (value) =>
    String(value ?? "")
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");

  if (system.combat) {
    for (const key of ["resistances", "immunities", "weaknesses"]) {
      if (typeof system.combat[key] === "string") system.combat[key] = tidy(system.combat[key]);
    }
  }
  if (system.details && typeof system.details.traits === "string") {
    system.details.traits = tidy(system.details.traits);
  }
}
