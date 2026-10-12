/**
 * Familiars — the pure rules.
 *
 * WHY A FAMILIAR IS A THIRD ACTOR TYPE AND NOT A COMPANION. An animal
 * companion and a familiar look alike from a distance — both are a
 * linked actor bound to a master, both take their level from it, both
 * carry the Minion trait — and they derive almost nothing the same way.
 *
 * A companion has its OWN progression: a class table with its own BAB,
 * BDB, saves, hit points per level and skill points, which it spends
 * like a character. A familiar has none of that. "A familiar gains the
 * same saving throw bonuses as you", "a base attack bonus and a base
 * defence bonus equal to your characters", "hit points equal to half of
 * your characters", "no skill ranks of its own, but instead an amount of
 * ranks equal to any you develop in each skill" — every number on a
 * familiar's sheet is a fact about its MASTER.
 *
 * Reusing the `companion` type would have meant an "unless it is a
 * familiar" branch in the class-progression path, the HP path, the skill
 * path and the Creature Codex's AB/DB rule — which applies to `npc` and
 * `companion` and must NOT apply here, since a familiar's attack and
 * defence are already the master's and adding half its level on top
 * would count the same scaling twice.
 *
 * WHERE THE MASTER'S NUMBERS ENTER. Through `system.progression`, which
 * is the seam this system already routes class-table saves, BAB and BDB
 * through. A familiar's progression is built from a SNAPSHOT of its
 * master's rather than from a class item, and everything downstream —
 * `save.classTable`, `combat.classTableBAB`, the tooltips — works
 * unchanged. Graham's ruling (2026-08-10) is exactly this shape: "it
 * uses the characters base values, modified by its own ability scores".
 *
 * WHY A SNAPSHOT RATHER THAN READING THE MASTER LIVE. The same reason a
 * companion's level is pushed (see companion.mjs): `prepareDerivedData`
 * runs against one document, and Foundry gives no re-render when a
 * DIFFERENT actor changes. A familiar reading its master's derived data
 * during its own derivation would show confident wrong numbers from the
 * moment the master gained a level, spent a skill point or bought a
 * Constitution increase, until something happened to re-derive it. So
 * the mirror is stored, pushed on the same triggers the companion level
 * sync uses, and `familiarSyncState` tells the sheet when it is stale.
 * A stale familiar says so.
 */

import { SIZE_STEPS } from "./companion.mjs";
import { SIZE_TABLE } from "./config.mjs";

const SYSTEM_ID = "trg-prime";

/** The feat that grants one. */
export const FAMILIAR_FEAT_NAME = "Familiar";

/** The compendium a familiar's abilities live in. */
export const FAMILIAR_PACK = "familiars";

/** The ability every familiar has from the start, free of the allowance. */
export const EMPATHIC_LINK = "Empathic Link";

/**
 * The printed stat block, as a fact rather than as a shape to build from.
 *
 * "When you first gain a familiar it has the following statistics" — one
 * block for every familiar, because the form you choose "has little
 * bearing upon your familiars abilities". That is the whole reason there
 * is no familiar equivalent of the eight base creatures: an owl familiar
 * and a toad familiar are the same numbers with different art.
 */
export const FAMILIAR_STAT_BLOCK = Object.freeze({
  size: "tiny",
  speed: 25,
  senses: "Nightvision",
  /**
   * The PRINTED scores, which are the totals a familiar ends up with —
   * not the values to author. See `familiarBaseAbilities`.
   */
  abilities: Object.freeze({
    strength: -2, dexterity: 3, constitution: 0,
    intelligence: -2, wisdom: 2, charisma: 0
  }),
  /** "DR 1 (base)" — base, so it scales with BDB (Graham, 3.232.3). */
  naturalArmourBase: 1,
  attack: Object.freeze({ name: "Bite (Tiny)", damage: "1d4", damageType: "piercing" }),
  /** Printed, and derived rather than authored — see familiarInitiative. */
  initiative: 25,
  /** Printed as 15; see the DB note in tools/source/familiars.txt. */
  printedDB: 15
});

/**
 * The ability scores to AUTHOR on the stat block's effect.
 *
 * The printed block is what a familiar ENDS UP with, and this system
 * applies a size modifier to Strength and Dexterity on top of whatever
 * is authored — Tiny is -2 and +2. So writing the printed -2 and +3
 * straight into `.base` produces -4 and +5, which is exactly what
 * shipped at 3.234.1 and what live testing caught: a familiar with Dex 5
 * rolled initiative 35 where the block prints 25.
 *
 * The animal companion species have the same arrangement and got it
 * right by being transcribed from blocks that were already pre-size; a
 * familiar has one block and no species to compare it against, so the
 * subtraction is done here rather than hand-typed. Deriving it means the
 * printed scores stay the single source of truth and the two can never
 * disagree — the harness asserts the round trip.
 *
 * Only Strength and Dexterity move; the size table touches nothing else.
 */
export function familiarBaseAbilities(size = FAMILIAR_STAT_BLOCK.size) {
  const entry = SIZE_TABLE[String(size ?? "").toLowerCase()] ?? SIZE_TABLE.medium;
  return Object.freeze({
    ...FAMILIAR_STAT_BLOCK.abilities,
    strength: FAMILIAR_STAT_BLOCK.abilities.strength - (Number(entry.strMod) || 0),
    dexterity: FAMILIAR_STAT_BLOCK.abilities.dexterity - (Number(entry.dexMod) || 0)
  });
}

/** "A familiar gains the Minion Trait." */
export const FAMILIAR_TRAITS = "Minion";

/** "Unless the Familiar Focus ability is selected." */
export const FAMILIAR_AP = 2;
export const FAMILIAR_FOCUS_AP = 3;

export function isFamiliar(actor) {
  return String(actor?.type ?? "") === "familiar";
}

/** The master's id, or "". */
export function familiarMasterId(familiarActor) {
  return String(familiarActor?.system?.familiar?.masterId ?? "").trim();
}

/** Is this familiar bound to that master? Matched on id, never on name. */
export function isFamiliarOf(familiarActor, masterActorId) {
  const id = String(masterActorId ?? "").trim();
  return Boolean(id) && familiarMasterId(familiarActor) === id;
}

/**
 * Initiative, which is not a familiar rule at all.
 *
 * The stat block prints +25 and this system already derives initiative
 * as (Dex + Wis) x 5 for every creature — a familiar's 3 and 2 give
 * exactly 25. So nothing is implemented for it; this function exists
 * only so the harness can assert the printed figure falls out of the
 * general rule, which is the sort of agreement that is worth pinning
 * because it would break silently.
 */
export function familiarInitiative({ dexterity, wisdom } = {}) {
  return ((Number(dexterity) || 0) + (Number(wisdom) || 0)) * 5;
}

/**
 * "A familiar has an Effective Level (EL) of half your level (round
 * down)." Zero at 1st, which is what an animal companion's own table
 * prints at 1st too.
 */
export function familiarEffectiveLevel(level) {
  return Math.floor(Math.max(0, Math.floor(Number(level) || 0)) / 2);
}

/**
 * "A familiar has an amount of hit points equal to half of your
 * characters (round up)."
 *
 * ROUNDS UP, and it is the only halving in this system that does. Every
 * other one floors (see creature-bonuses.mjs's note), so this is written
 * out rather than reached for: the book says "round up" here and says
 * "round down" for the Effective Level three lines earlier, which is a
 * deliberate distinction rather than loose drafting.
 *
 * Tough ("your familiar's maximum Hit Points increase by 2 per level")
 * is added AFTER the halving — it is the familiar's own hit points that
 * increase, not the master's before they are halved.
 */
export function familiarMaxHP({ masterMaxHP = 0, level = 1, hasTough = false } = {}) {
  const half = Math.ceil(Math.max(0, Math.floor(Number(masterMaxHP) || 0)) / 2);
  const tough = hasTough ? 2 * Math.max(1, Math.floor(Number(level) || 1)) : 0;
  return half + tough;
}

/**
 * A familiar's action points for the round.
 *
 * "Unlike an animal companion, a familiar only gains 2 AP a round
 * (unless the Familiar Focus ability is selected)."
 */
export function familiarActionPoints(abilityNames = []) {
  return hasFamiliarAbility(abilityNames, "Familiar Focus") ? FAMILIAR_FOCUS_AP : FAMILIAR_AP;
}

function normalise(name) {
  return String(name ?? "").trim().toLowerCase();
}

/** Does this familiar have that ability, by name? */
export function hasFamiliarAbility(abilityNames = [], name = "") {
  const wanted = normalise(name);
  return (abilityNames ?? []).some((owned) => normalise(owned) === wanted);
}

/**
 * How many abilities a familiar may choose at this level.
 *
 * "A familiar begins at 1st level with 2 abilities and the Empathic Link
 * ability... At 4th level and then every 4 levels thereafter, you may
 * select an additional ability."
 *
 * EMPATHIC LINK IS NOT ONE OF THEM. The book lists it as a selectable
 * ability AND gives it away at 1st level, which reads as a contradiction
 * until you notice the phrasing: two abilities *and* Empathic Link. So
 * the allowance is 2 + one per four levels, and Empathic Link is free on
 * top — counted out of `spent` the same way a class-granted feat is.
 *
 * Empower Familiar (Wizard feat): "You can select any two familiar
 * abilities for your familiar" — a flat +2, passed in rather than looked
 * up so this stays runnable without an actor.
 */
export function familiarAbilityAllowance({ level = 1, empowerPicks = 0 } = {}) {
  const resolved = Math.max(1, Math.floor(Number(level) || 1));
  return 2 + Math.floor(resolved / 4) + (2 * Math.max(0, Math.floor(Number(empowerPicks) || 0)));
}

/** Abilities that are free rather than chosen. */
export const FREE_FAMILIAR_ABILITIES = Object.freeze([EMPATHIC_LINK]);

/**
 * Spent and available, for the sheet's banner.
 *
 * @param {object} options
 * @param {string[]} options.abilityNames Every familiar ability owned.
 * @param {number} options.level
 * @param {number} options.empowerPicks Copies of the Empower Familiar feat.
 */
export function familiarAbilityBudget({ abilityNames = [], level = 1, empowerPicks = 0 } = {}) {
  const free = new Set(FREE_FAMILIAR_ABILITIES.map(normalise));
  const spent = (abilityNames ?? []).filter((name) => !free.has(normalise(name))).length;
  return { spent, available: familiarAbilityAllowance({ level, empowerPicks }) };
}

/**
 * The snapshot of a master that a familiar derives from.
 *
 * Takes the master's already-derived `system` rather than the document,
 * so the whole rule can be RUN in a harness against a plain object
 * (lesson 2). Everything here is a number the book names explicitly:
 * the class-table save bases, BAB and BDB, the master's maximum hit
 * points, and every skill rank with whether the master calls it a class
 * skill.
 *
 * `source` is carried for the tooltip alone — a familiar's Fortitude
 * line should read "Constitution and Theolan's Wizard base", not
 * "Constitution and Class base".
 */
export function familiarMirrorFrom(masterSystem, masterName = "") {
  const progression = masterSystem?.progression ?? null;
  const skills = {};
  for (const [key, skill] of Object.entries(masterSystem?.skills ?? {})) {
    skills[key] = {
      ranks: Math.max(0, Math.floor(Number(skill?.ranks) || 0)),
      classSkill: Boolean(skill?.classSkill)
    };
  }
  return {
    level: Math.max(1, Math.floor(Number(masterSystem?.identity?.level) || 1)),
    source: String(progression?.source ?? masterName ?? ""),
    fortitude: Math.floor(Number(progression?.fortitude) || 0),
    reflex: Math.floor(Number(progression?.reflex) || 0),
    will: Math.floor(Number(progression?.will) || 0),
    bab: Math.floor(Number(masterSystem?.combat?.bab?.total) || 0),
    bdb: Math.floor(Number(masterSystem?.combat?.bdb?.total) || 0),
    maxHP: Math.max(0, Math.floor(Number(masterSystem?.resources?.hp?.max) || 0)),
    skills
  };
}

/**
 * The synthetic progression a familiar derives from.
 *
 * Shaped like `resolveClassProgression`'s output so that every consumer
 * downstream — the save derivation's `classTable` extra, the BAB and BDB
 * class-table columns, the sheet's tooltips — works without knowing a
 * familiar exists (lesson 13).
 *
 * `hitPoints` and `skillPoints` are deliberately ZERO rather than
 * inherited. A familiar gains no hit points per level (its maximum is
 * half its master's, computed elsewhere) and develops no skill ranks of
 * its own, so a non-zero figure in either would put a budget on the
 * sheet that the rules do not give it.
 */
export function familiarProgression(mirror) {
  if (!mirror) return null;
  return {
    source: String(mirror.source || "your master"),
    classType: "",
    level: Math.max(1, Math.floor(Number(mirror.level) || 1)),
    rowLevel: Math.max(1, Math.floor(Number(mirror.level) || 1)),
    capped: false,
    hitPoints: 0,
    skillPoints: 0,
    skillPointAbility: "",
    tradition: "",
    magicalAbility: "",
    casterStyle: "",
    memorisationStyle: "",
    cantripsPerDay: 0,
    spellBookFirstPicks: 0,
    bab: Math.floor(Number(mirror.bab) || 0),
    bdb: Math.floor(Number(mirror.bdb) || 0),
    fortitude: Math.floor(Number(mirror.fortitude) || 0),
    reflex: Math.floor(Number(mirror.reflex) || 0),
    will: Math.floor(Number(mirror.will) || 0),
    bonusFeats: null,
    casterLevel: null,
    pp: null,
    bsb: 0
  };
}

/**
 * Is this familiar's stored mirror still its master's?
 *
 * Compares the WHOLE snapshot, not just the level — a master who spends
 * a skill point or gains hit points has drifted just as surely as one
 * who levelled, and the level is the one thing a player would notice on
 * their own.
 */
export function familiarSyncState({ stored, current, hasMaster } = {}) {
  if (!hasMaster) {
    return { bound: false, inSync: true, drifted: [] };
  }
  const drifted = [];
  for (const key of ["level", "fortitude", "reflex", "will", "bab", "bdb", "maxHP"]) {
    if (Number(stored?.[key] ?? 0) !== Number(current?.[key] ?? 0)) drifted.push(key);
  }
  if (JSON.stringify(stored?.skills ?? {}) !== JSON.stringify(current?.skills ?? {})) {
    drifted.push("skills");
  }
  return { bound: true, inSync: drifted.length === 0, drifted };
}

/**
 * "If a familiar dies or is dismissed, you must attempt a Fortitude Save
 * (level based)" — the printed outcomes, keyed by degree.
 */
export const FAMILIAR_LOSS_OUTCOMES = Object.freeze({
  critical: Object.freeze({
    summary: "You may obtain a new familiar immediately.",
    fatigue: 0, waitDays: 0
  }),
  success: Object.freeze({
    summary: "You feel a sense of loss but recover quickly. You may obtain a new familiar during your next daily preparation.",
    fatigue: 0, waitDays: 0
  }),
  failure: Object.freeze({
    summary: "You have a sense of weakness and suffer fatigue 2, which can only be recovered through a night's rest. You may obtain a new familiar during your next daily preparation.",
    fatigue: 2, waitDays: 0
  }),
  fumble: Object.freeze({
    summary: "As failure, and you may not obtain a new familiar for one whole week.",
    fatigue: 2, waitDays: 7
  })
});

/**
 * The printed outcome for a degree of success.
 *
 * `partial` is not in the table. The book prints four rows where this
 * system's checks produce five degrees, so a Partial is resolved as a
 * Failure — the worse of the two neighbours, because the alternative is
 * inventing a fifth row the book does not have and a Partial that
 * behaved like a Success would make the middle of the table strictly
 * better than its own name.
 */
export function familiarLossOutcome(degree) {
  const key = normalise(degree);
  if (key === "partial") return FAMILIAR_LOSS_OUTCOMES.failure;
  return FAMILIAR_LOSS_OUTCOMES[key] ?? null;
}

/**
 * "You must expend 100 gp per level in magical components."
 */
export function familiarComponentCost(level) {
  return 100 * Math.max(1, Math.floor(Number(level) || 1));
}

/** The name a newly created familiar is given. */
export function familiarActorName(masterName, form) {
  const master = String(masterName ?? "").trim();
  const shape = String(form ?? "").trim();
  if (master && shape) return `${master}'s ${shape}`;
  if (master) return `${master}'s Familiar`;
  return shape || "Familiar";
}

/**
 * The payload for a new familiar actor.
 *
 * Ownership is copied from the master for the same reason a companion's
 * is: a player who cannot select their own familiar has not been given
 * one. The prototype token is LINKED — a familiar is one creature.
 */
export function familiarActorData({
  masterId, masterName, form, level, ownership, img, mirror
} = {}) {
  const resolvedLevel = Math.max(1, Math.floor(Number(level) || 1));
  return {
    name: familiarActorName(masterName, form),
    type: "familiar",
    img: img ?? undefined,
    ownership: { ...(ownership ?? {}) },
    prototypeToken: { actorLink: true, disposition: 1 },
    system: {
      identity: { level: resolvedLevel, size: FAMILIAR_STAT_BLOCK.size },
      familiar: {
        masterId: String(masterId ?? ""),
        masterName: String(masterName ?? ""),
        form: String(form ?? ""),
        syncedAtLevel: resolvedLevel,
        mirror: mirror ?? null
      }
    }
  };
}

/** The size ladder, re-exported so callers need only this module. */
export { SIZE_STEPS };
export { SYSTEM_ID as FAMILIAR_SYSTEM_ID };
