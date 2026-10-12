/**
 * The TRG Prime conditions registry (Core 3.1, Appendix 2).
 *
 * Pure data and pure functions; no Foundry dependency. The Foundry layer in
 * module/conditions/manager.mjs consumes this to build CONFIG.statusEffects,
 * and TRGActor consumes it to derive automatic penalties through the bonus
 * pool system, so a Frightened 2 status penalty obeys the same Appendix 1
 * stacking rules as any other status bonus.
 *
 * Bleeding severity follows Appendix 2 as ruled: Light 1-4, Moderate 5-8,
 * Severe 9-12, Dire 13+, with a DC 16 flat check to self-remove Light
 * bleeding. Chapter 7's conflicting band names are not used.
 */

/**
 * Every condition. Fields:
 *   label     Display name.
 *   valued    Whether the condition carries a numeric value.
 *   hud       Whether it appears on the token status HUD. Broken affects
 *             objects, and Encumbered is derived from carried weight, so
 *             neither belongs on a creature's HUD toggle list.
 *   includes  Conditions automatically granted while this one is active.
 *   overrides Conditions suppressed while this one is active.
 *   icon      Path to the status icon.
 */
export const CONDITIONS = Object.freeze({
  bleeding: { label: "Bleeding", valued: true, hud: true, icon: "icons/svg/blood.svg" },
  blinded: {
    label: "Blinded", valued: false, hud: true, icon: "icons/svg/blind.svg",
    includes: ["flatFooted"], overrides: ["dazzled"]
  },
  broken: { label: "Broken", valued: false, hud: false, icon: "icons/svg/hazard.svg" },
  // DEAD is a marker, not a rules condition — it carries no penalties,
  // because a corpse has no checks left to penalise. It exists so that death
  // is a STATE the system can read rather than a sentence in a chat card:
  // before it, `combat.mjs` had nothing to test and went on rolling Dying
  // Checks for a character it had already declared dead, twice over, in the
  // 13 Aug 2026 playtest. Applied as a token overlay (the skull Graham asked
  // for) by combat/death-state.mjs, and left on the HUD so a GM can clear it
  // by hand after a Raise Dead.
  dead: { label: "Dead", valued: false, hud: true, icon: "icons/svg/skull.svg" },
  concealed: { label: "Concealed", valued: false, hud: true, icon: "icons/svg/ice-aura.svg" },
  confused: { label: "Confused", valued: false, hud: true, icon: "icons/svg/daze.svg" },
  controlled: { label: "Controlled", valued: false, hud: true, icon: "icons/svg/aura.svg" },
  dazed: { label: "Dazed", valued: true, hud: true, icon: "icons/svg/stoned.svg" },
  dazzled: { label: "Dazzled", valued: false, hud: true, icon: "icons/svg/sun.svg" },
  deafened: { label: "Deafened", valued: false, hud: true, icon: "icons/svg/deaf.svg" },
  doomed: { label: "Doomed", valued: true, hud: true, icon: "icons/svg/skull.svg" },
  dying: {
    label: "Dying", valued: true, hud: true, icon: "icons/svg/degen.svg",
    includes: ["unconscious"]
  },
  encumbered: { label: "Encumbered", valued: false, hud: false, icon: "icons/svg/anchor.svg" },
  fatigued: { label: "Fatigued", valued: true, hud: true, icon: "icons/svg/sleep.svg" },
  fixated: { label: "Fixated", valued: false, hud: true, icon: "icons/svg/target.svg" },
  flatFooted: { label: "Flat-Footed", valued: false, hud: true, icon: "icons/svg/falling.svg" },
  fleeing: { label: "Fleeing", valued: false, hud: true, icon: "icons/svg/wingfoot.svg" },
  frightened: { label: "Frightened", valued: true, hud: true, icon: "icons/svg/terror.svg" },
  grabbed: {
    label: "Grabbed", valued: false, hud: true, icon: "icons/svg/net.svg",
    includes: ["flatFooted", "immobilised"]
  },
  hidden: { label: "Hidden", valued: false, hud: true, icon: "icons/svg/cowled.svg" },
  immobilised: {
    label: "Immobilised", valued: false, hud: true, icon: "icons/svg/padlock.svg",
    includes: ["flatFooted"]
  },
  injured: { label: "Injured", valued: true, hud: true, icon: "icons/svg/bones.svg" },
  invisible: { label: "Invisible", valued: false, hud: true, icon: "icons/svg/invisible.svg" },
  paralyzed: {
    label: "Paralyzed", valued: false, hud: true, icon: "icons/svg/paralysis.svg",
    includes: ["flatFooted"]
  },
  petrified: { label: "Petrified", valued: false, hud: true, icon: "icons/svg/statue.svg" },
  prone: {
    label: "Prone", valued: false, hud: true, icon: "icons/svg/down.svg",
    includes: ["flatFooted"]
  },
  quickened: { label: "Quickened", valued: false, hud: true, icon: "icons/svg/upgrade.svg" },
  recurring: { label: "Recurring Damage", valued: true, hud: true, icon: "icons/svg/biohazard.svg" },
  sickened: { label: "Sickened", valued: true, hud: true, icon: "icons/svg/poison.svg" },
  slowed: { label: "Slowed", valued: true, hud: true, icon: "icons/svg/clockwork.svg" },
  soulDrain: { label: "Soul Drain", valued: true, hud: true, icon: "icons/svg/cave.svg" },
  /*
   * SUFFOCATING (Chapter 7, page 202; Graham's R3 of 21 September 2026).
   *
   * "When you run out of air, you fall unconscious and start
   * suffocating. You can't recover from being unconscious and must
   * attempt a Fortitude save… Once your access to air is restored, you
   * stop suffocating and are no longer unconscious."
   *
   * NOT VALUED. The ladder it climbs — a cumulative -2 to the save and
   * +5 to the damage each check after the first — is a count of checks
   * made, not a severity, and it is kept on the actor's own drowning
   * flag beside the air that ran out. A number on the HUD here would be
   * a second copy of it, free to disagree.
   *
   * INCLUDES UNCONSCIOUS, because the page gives no gap between the two:
   * running out of air IS falling unconscious, and air being restored
   * lifts both together.
   *
   * THE BOOK ALREADY ASKED FOR THIS CONDITION TWICE before it existed.
   * Two critical rows apply it by name — "Target is suffocating and may
   * spend 3 AP each round trying to remove the Ice" (cold 91-93) and
   * "Target drops and is Suffocating (no holding breath, straight to
   * unconscious)" (poison 96-98) — and a feat multiplies a breath
   * nothing was counting.
   */
  suffocating: {
    label: "Suffocating", valued: false, hud: true, icon: "icons/svg/silenced.svg",
    includes: ["unconscious"]
  },
  stunned: {
    label: "Stunned", valued: true, hud: true, icon: "icons/svg/lightning.svg",
    overrides: ["slowed"]
  },
  // PRONE IS NOT INCLUDED (3.621.0; block 39's A10). "Upon gaining this
  // condition, you fall prone" is a moment, not a state: the fall writes
  // Prone as its own condition (conditions/condition-events-workflow.mjs),
  // and Standing ends it. Included, it vanished the moment the creature
  // woke, with no Stand.
  unconscious: {
    label: "Unconscious", valued: false, hud: true, icon: "icons/svg/unconscious.svg",
    includes: ["blinded", "flatFooted", "immobilised"]
  },
  undetected: { label: "Undetected", valued: false, hud: true, icon: "icons/svg/mystery-man.svg" },
  unnoticed: {
    label: "Unnoticed", valued: false, hud: true, icon: "icons/svg/circle.svg",
    includes: ["undetected"]
  },
  weakened: { label: "Weakened", valued: true, hud: true, icon: "icons/svg/downgrade.svg" }
});

export const CONDITION_IDS = Object.freeze(Object.keys(CONDITIONS));

export const VALUED_CONDITION_IDS = Object.freeze(
  CONDITION_IDS.filter((id) => CONDITIONS[id].valued)
);

/* ------------------------------------------------------------------ */
/* Bleeding severity (Appendix 2, as ruled canonical)                  */
/* ------------------------------------------------------------------ */

export const BLEEDING_FLAT_CHECK_DC = 16;

/**
 * Recurring Damage (Core 3.1, Chapter 7) is distinct from Bleeding, although
 * the rulebook lists it outside Appendix 2:
 *
 *   - Damage is applied in Phase 3, then a DC 16 flat check is made to see if
 *     it ends. Every severity gets this check; Bleeding permits self-removal
 *     only in its Light band.
 *   - The GM may rule that an action taken against it (smothering flames,
 *     washing off acid) ends it automatically or lowers the flat check DC.
 *   - Sources are typed (acid vials, burn criticals), so the value dialog
 *     also records a damage type.
 */
export const RECURRING_FLAT_CHECK_DC = 16;

/**
 * Conditions whose values sum across multiple applications rather than
 * keeping the most severe instance. Bleeding and Injured say so explicitly;
 * Recurring Damage joins them because simultaneous typed sources (burning
 * while standing in acid) are cumulative wounds, not competing severities.
 */
export const CUMULATIVE_CONDITION_IDS = Object.freeze([
  "bleeding",
  "injured",
  "recurring"
]);

export const BLEEDING_BANDS = Object.freeze([
  { key: "light", label: "Light", min: 1, max: 4, selfRemovable: true },
  { key: "moderate", label: "Moderate", min: 5, max: 8, selfRemovable: false },
  { key: "severe", label: "Severe", min: 9, max: 12, selfRemovable: false },
  { key: "dire", label: "Dire", min: 13, max: Infinity, selfRemovable: false }
]);

/**
 * Classify a bleeding value into its Appendix 2 severity band.
 * @param {number} value HP lost per round.
 * @returns {object|null}
 */
export function bleedingSeverity(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 1) return null;
  return BLEEDING_BANDS.find((band) => amount >= band.min && amount <= band.max);
}

/* ------------------------------------------------------------------ */
/* Effective condition resolution                                      */
/* ------------------------------------------------------------------ */

/**
 * Expand a set of directly applied conditions into the effective set,
 * following `includes` transitively (Dying grants Unconscious, which grants
 * Blinded, which grants Flat-Footed), then removing anything suppressed by an
 * `overrides` entry (Blinded overrides Dazzled).
 *
 * @param {Iterable<string>} activeIds Directly applied condition ids.
 * @returns {{effective: Set<string>, granted: Map<string, string>}}
 *   `granted` maps each derived condition to the condition that granted it.
 */
export function resolveConditions(activeIds, { withhold = [], grants = [] } = {}) {
  const effective = new Set();
  const granted = new Map();
  // WITHHELD INCLUDES (3.577.0): a condition another would GRANT that this
  // creature is spared — Smelling Salts' "conscious, but still dying". Only
  // the grant is withheld; a condition applied directly still stands.
  const withheld = new Set(withhold ?? []);

  const visit = (id, source) => {
    if (!CONDITIONS[id] || effective.has(id)) return;
    if (source && withheld.has(id)) return;
    effective.add(id);
    if (source) granted.set(id, source);
    for (const included of CONDITIONS[id].includes ?? []) {
      visit(included, id);
    }
  };

  for (const id of activeIds) visit(id, null);
  // CONDITIONS A VALUE GRANTS (3.621.0; Graham's R6 of block 39): "If your
  // Fatigue level reaches 10 or higher, you fall unconscious until your
  // fatigued condition is reduced". Each pair is [granted, source], granted
  // exactly as an include is, and gone the moment the value falls.
  for (const [id, source] of grants ?? []) visit(id, source);

  for (const id of [...effective]) {
    for (const overridden of CONDITIONS[id]?.overrides ?? []) {
      effective.delete(overridden);
      granted.delete(overridden);
    }
  }

  return { effective, granted };
}

/* ------------------------------------------------------------------ */
/* Automatic modifiers                                                 */
/* ------------------------------------------------------------------ */

const MENTAL_ABILITIES = new Set(["intelligence", "wisdom", "charisma"]);
const PHYSICAL_ABILITIES = new Set(["strength", "dexterity"]);

/**
 * Derive the bonus-pool entries implied by a set of conditions.
 *
 * Only penalties that map cleanly onto existing derived targets are emitted
 * here. AP economy (Stunned, Slowed, Quickened), senses, movement and the
 * Immobilised auto-fail on Reflex are turn-economy or adjudication concerns
 * and are deliberately left to later steps.
 *
 * @param {object} options
 * @param {Map<string, number>} options.values Effective id -> value (1 for
 *   unvalued conditions).
 * @param {Object<string, string>} options.skillAbilities skill key -> ability.
 * @param {Object<string, string>} [options.specialistAbilities]
 * @param {string} [options.attackAbility] combat.attack.abilityKey.
 * @param {string} [options.castingAbility]
 * @returns {Array<{target: string, label: string, value: number, type: string}>}
 */
/**
 * SPECIFIC LOCATION INJURIES (Chapter 7, page 204, optional; Graham's
 * R14 of 21 September 2026).
 *
 *   "You may feel that the injured condition and the penalties which you
 *    take from this condition are a little too generic and severe. If
 *    this is the case then feel free to apply the penalty received from
 *    the injured condition to specific actions carried out that are
 *    appropriate to the injury only (speed for legs, attacks and
 *    climbing for arms etc)."
 *
 * THE BOOK COMMITS TO TWO AND WAVES AT THE REST. Legs are speed; arms
 * are attacks and climbing. It gives no list for a blow to the chest,
 * the abdomen or the head, so neither does this: a location the page
 * does not narrow keeps the ordinary all-checks penalty, which is the
 * conservative reading and the one that cannot silently hand a player
 * back a penalty the GM never meant to lift.
 *
 * The system already knew which location was struck — it computed it to
 * decide whether armour's DR applied — and threw the answer away the
 * moment the condition went on.
 */
export const INJURY_LOCATION_TARGETS = Object.freeze({
  legs: ["system.combat.movement.land", "system.skills.acrobatics"],
  arms: ["system.combat.attack", "system.skills.athletics"]
});

export function conditionModifiers({
  values,
  skillAbilities = {},
  specialistAbilities = {},
  attackAbility = "strength",
  castingAbility = "intelligence",
  // The location an Injured condition came from, when the optional rule
  // above is switched on and the critical recorded one. Null otherwise,
  // which is every game that has not turned it on.
  injuryLocation = null
} = {}) {
  const out = [];
  const value = (id) => Number(values.get(id) ?? 0);
  const active = (id) => values.has(id);

  const allSkillTargets = () => [
    ...Object.keys(skillAbilities).map((key) => `system.skills.${key}`),
    ...Object.keys(specialistAbilities).map(
      (key) => `system.specialistSkills.${key}`
    )
  ];

  const push = (target, label, amount, type = "status") => {
    if (!amount) return;
    out.push({ target, label, value: amount, type });
  };

  /**
   * "All checks and DCs" penalties: every skill, every save, attack,
   * initiative and Spellcraft. Skill DCs follow automatically because
   * dc = 10 + total.
   */
  const allChecks = (label, amount, { includeDefence = false, type = "status" } = {}) => {
    for (const target of allSkillTargets()) push(target, label, amount, type);
    for (const save of ["fortitude", "reflex", "will"]) {
      push(`system.combat.saves.${save}`, label, amount, type);
    }
    push("system.combat.attack", label, amount, type);
    push("system.combat.initiative", label, amount, type);
    push("system.magic.spellcraft", label, amount, type);
    if (includeDefence) push("system.combat.defence", label, amount, type);
  };

  // Frightened X: status penalty to all checks and DCs.
  if (active("frightened")) {
    allChecks(`Frightened ${value("frightened")}`, -value("frightened"));
  }

  // Sickened X: status penalty to all checks and DCs.
  if (active("sickened")) {
    allChecks(`Sickened ${value("sickened")}`, -value("sickened"));
  }

  // Fatigued X: status penalty to all actions.
  if (active("fatigued")) {
    allChecks(`Fatigued ${value("fatigued")}`, -value("fatigued"));
  }

  // Injured X: penalty to all checks and DB. The text does not name a bonus
  // type and states the condition is cumulative, so it is untyped: it must
  // never cancel against a Frightened or Sickened status penalty.
  if (active("injured")) {
    const narrowed = INJURY_LOCATION_TARGETS[String(injuryLocation ?? "").toLowerCase()] ?? null;
    const label = narrowed
      ? `Injured ${value("injured")} (${String(injuryLocation).toLowerCase()})`
      : `Injured ${value("injured")}`;
    if (narrowed) {
      for (const target of narrowed) push(target, label, -value("injured"), "untyped");
    } else {
      allChecks(label, -value("injured"), { includeDefence: true, type: "untyped" });
    }
  }

  // Dazed X: status penalty to Intelligence-, Wisdom- and Charisma-based
  // rolls and DCs.
  if (active("dazed")) {
    const amount = -value("dazed");
    const label = `Dazed ${value("dazed")}`;
    for (const [key, ability] of Object.entries(skillAbilities)) {
      if (MENTAL_ABILITIES.has(ability)) push(`system.skills.${key}`, label, amount);
    }
    for (const [key, ability] of Object.entries(specialistAbilities)) {
      if (MENTAL_ABILITIES.has(ability)) {
        push(`system.specialistSkills.${key}`, label, amount);
      }
    }
    push("system.combat.saves.will", label, amount);
    if (MENTAL_ABILITIES.has(castingAbility)) {
      push("system.magic.spellcraft", label, amount);
    }
  }

  // Weakened X: status penalty to Strength- and Dexterity-based rolls and DCs.
  if (active("weakened")) {
    const amount = -value("weakened");
    const label = `Weakened ${value("weakened")}`;
    for (const [key, ability] of Object.entries(skillAbilities)) {
      if (PHYSICAL_ABILITIES.has(ability)) push(`system.skills.${key}`, label, amount);
    }
    for (const [key, ability] of Object.entries(specialistAbilities)) {
      if (PHYSICAL_ABILITIES.has(ability)) {
        push(`system.specialistSkills.${key}`, label, amount);
      }
    }
    push("system.combat.saves.reflex", label, amount);
    if (PHYSICAL_ABILITIES.has(attackAbility)) {
      push("system.combat.attack", label, amount);
    }
  }

  // Fixated: -2 status penalty to attack and skill checks.
  if (active("fixated")) {
    for (const target of allSkillTargets()) push(target, "Fixated", -2);
    push("system.combat.attack", "Fixated", -2);
  }

  // Prone: -2 circumstance penalty to attack checks.
  if (active("prone")) {
    push("system.combat.attack", "Prone", -2, "circumstance");
  }

  return out;
}

/**
 * The mechanical consequences of Flat-Footed that cannot be expressed as
 * pool entries: losing the Dexterity bonus to DB and to Reflex saves, and
 * losing all dodge bonuses to DB. Exposed as a descriptor for the actor's
 * derived-data step.
 */
export const FLAT_FOOTED_EFFECTS = Object.freeze({
  suppressDefenceAbility: true,
  suppressReflexAbility: true,
  suppressDodgeOnDefence: true
});

/**
 * Frightened's recovery check (Appendix 2): "At the end of each of
 * your turns, you may make a Will Saving Throw against the original DC
 * of the fear effect. Heroic: reduce by 3. Critical: reduce by 2.
 * Success: reduce by 1. Fumble: increase by 1." Partial, Failure, and
 * Blunder aren't named separately — Partial/Failure hold at 0 (no
 * change, matching how this project treats an unlisted "didn't quite
 * succeed" result elsewhere), and Blunder is treated the same as
 * Fumble since no distinct, worse value is given.
 */
export function frightenedRecoveryDelta(degreeKey) {
  switch (degreeKey) {
    case "heroic":
      return -3;
    case "critical":
      return -2;
    case "success":
      return -1;
    case "fumble":
    case "blunder":
      return 1;
    default:
      return 0;
  }
}

/**
 * Sickened's recovery check (Appendix 2): "You have the option to
 * spend a 1 AP manipulate action to try and alleviate your discomfort
 * by retching. This action allows you to make a Fortitude save against
 * the DC of the effect that induced your sickness. A success will
 * reduce your sickened value by 1, while a critical will decrease it
 * by 2." No other outcomes are named — everything else holds at 0.
 */
export function sickenedRetchDelta(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
      return -2;
    case "success":
      return -1;
    default:
      return 0;
  }
}

