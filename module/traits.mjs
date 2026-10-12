/**
 * Traits (Appendix 3). Pure logic; traits-workflow.mjs drives the
 * Foundry side.
 *
 * Traits were, until now, almost entirely decorative in this project:
 * an audit of all 81 entries in Appendix 3 found six read by code at
 * all, twenty with related machinery driven by some *other* field, and
 * the rest present as text nothing ever looked at. Every check that did
 * exist was an ad-hoc inline regex — around twenty-five of them — with
 * no shared parser, which is how "Concentration" came to be silently
 * missed everywhere "Concentrate" was matched.
 *
 * This module is the shared parser those checks should always have gone
 * through, plus the subset of Appendix 3 that is genuinely enforceable
 * against data this system already holds: the traits that govern what
 * you may do in a turn.
 */
import { immuneTrait, resolveImmunities } from "./defences.mjs";
import { derivedImmunitySets } from "./creature-traits.mjs";

/**
 * Spellings that mean the same trait. The rulebook uses "Concentrate",
 * but four action entries in this project's own data say
 * "Concentration"; rather than only correcting the data (done) and
 * leaving the next typo to fail silently, the matcher accepts both.
 */
const TRAIT_SYNONYMS = Object.freeze({
  concentrate: ["concentrate", "concentration"],
  defence: ["defence", "defense"]
});

/**
 * TRAITS A TRAIT BRINGS WITH IT (3.622.0; block 39's A18). Emotion: "Effects
 * with this trait will also have the mental trait." Fear: "will also have
 * the emotion and mental traits." So Encourage, Command and Rally (Emotion)
 * and the Dreadcarve rune (Fear) no longer reach a Mindless creature.
 */
const IMPLIED_TRAITS = Object.freeze({
  fear: ["emotion", "mental"],
  emotion: ["mental"]
});

/** A trait list with the traits its members imply added. */
function withImpliedTraits(list = []) {
  const out = [...list];
  for (const trait of list) {
    for (const implied of IMPLIED_TRAITS[trait] ?? []) if (!out.includes(implied)) out.push(implied);
  }
  return out;
}

/**
 * Split a trait string into normalised trait names.
 *
 * @param {string} traits A comma-separated trait string.
 * @returns {string[]} Lowercased, trimmed, empty entries dropped.
 */
export function traitList(traits) {
  return String(traits ?? "")
    .split(",")
    .map((trait) => trait.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether a trait string carries a given trait.
 *
 * @param {string|object} traits A trait string, or anything with a
 *   `traits` property (an action definition, an item's system data).
 * @param {string} name The trait to look for.
 * @returns {boolean}
 */
export function hasTrait(traits, name) {
  const source = typeof traits === "string" ? traits : traits?.traits;
  const list = withImpliedTraits(traitList(source));
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return false;
  const accepted = TRAIT_SYNONYMS[wanted] ?? [wanted];
  return accepted.some((entry) => list.includes(entry));
}

/** The shape of a fresh per-turn trait usage record. */
export function emptyTraitUsage() {
  return {
    actions: 0,
    attack: 0,
    open: 0,
    flourish: 0,
    defence: 0,
    teleportation: 0,
    word: 0,
    wordPenalty: false
  };
}

/** The -4 penalty every check after a Word spell suffers, that turn. */
export const WORD_AFTERMATH_PENALTY = -4;

/**
 * Which per-turn counters an action consumes when it is performed.
 *
 * @param {object} action Anything carrying a `traits` string.
 * @returns {string[]} Counter keys to increment.
 */
export function traitUsageKeys(action) {
  const keys = ["actions"];
  for (const trait of ["attack", "open", "flourish", "defence", "teleportation", "word"]) {
    if (hasTrait(action, trait)) keys.push(trait);
  }
  return keys;
}

/**
 * Whether Appendix 3's per-turn trait rules forbid an action, and why.
 *
 * Each rule below is quoted from the trait's own entry. Only traits
 * whose restriction can be tested against state this system actually
 * tracks are here; the rest are recorded in the development log as
 * blocked, with the reason, rather than half-enforced.
 *
 * @param {object} action Anything carrying a `traits` string.
 * @param {object} usage The actor's per-turn usage record.
 * @param {object} [options]
 * @param {number|null} [options.round] The current combat round.
 * @param {number|null} [options.lastStanceRound] The round in which this
 *   actor last used a Stance action, if any.
 * @param {boolean} [options.inEncounter] Whether a combat is under way.
 * @returns {{blocked: boolean, reason: string}}
 */
export function traitRestriction(action, usage = emptyTraitUsage(), {
  round = null,
  lastStanceRound = null,
  inEncounter = false,
  convictionSpentThisRound = false,
  // THE MULTIPLE ATTACK PENALTY'S OWN COUNTER (3.622.0; block 39's A13).
  // Bombs, Spiritual Weapon and attack spells advance it without passing
  // through the trait record, so Press and Open ask it as well.
  attacksThisTurn = 0,
  // WHETHER ANY AP WAS SPENT THIS TURN (3.622.0; Graham's R11): a dragged
  // Stride, a bomb or a potion is an action too, and none of them is in
  // the trait record.
  actedThisTurn = false
} = {}) {
  const used = { ...emptyTraitUsage(), ...usage };
  const attacks = Math.max(Number(used.attack) || 0, Number(attacksThisTurn) || 0);

  // EXPLORE: "An action with this trait can only be used when you are
  // not in an active encounter."
  if (hasTrait(action, "explore") && inEncounter) {
    return {
      blocked: true,
      reason: "an Explore action can only be used outside an active encounter"
    };
  }

  // DOWNTIME: "takes a day or more, and can be used only during
  // downtime" — the weaker half of that is testable (an encounter is
  // certainly not downtime); how much time has passed is not.
  if (hasTrait(action, "downtime") && inEncounter) {
    return {
      blocked: true,
      reason: "a Downtime activity can't be attempted during an encounter"
    };
  }

  // THE PER-TURN LIMITS ARE COMBAT'S (3.622.0; block 39's A11, Graham's
  // R13). "Turn" is an encounter word: out of combat the record was never
  // cleared, so one Flourish blocked every later one until a fight began.
  // Open, Press, Flourish, Defence, Teleportation and Word are asked only
  // in an encounter; Explore and Downtime above keep their encounter test.
  //
  // CONVICTION'S ONCE A ROUND IS ASKED FIRST, in or out of combat: its gate
  // (conviction.mjs) keys the round itself.
  if (hasTrait(action, "conviction") && convictionSpentThisRound) {
    return { blocked: true, reason: "a Conviction ability may only be used once per round" };
  }
  if (!inEncounter) return { blocked: false, reason: "" };

  // OPEN: "You can use an action with the open trait only if you
  // haven't used an action with the attack or open trait yet this turn."
  if (hasTrait(action, "open") && (attacks > 0 || used.open > 0)) {
    return {
      blocked: true,
      reason:
        "an Open action must be your first salvo — you have already used an Attack or Open action this turn"
    };
  }

  // PRESS: "Actions with the press trait can be used only if you are
  // currently affected by a multiple attack penalty."
  if (hasTrait(action, "press") && attacks === 0) {
    return {
      blocked: true,
      reason: "a Press action needs an earlier attack this turn — you aren't under a multiple attack penalty yet"
    };
  }

  // FLOURISH: "can only be attempted once per turn."
  if (hasTrait(action, "flourish") && used.flourish > 0) {
    return { blocked: true, reason: "you may only use one Flourish action per turn" };
  }

  // DEFENCE: "You may only use one action or ability with this trait
  // each turn."
  if (hasTrait(action, "defence") && used.defence > 0) {
    return { blocked: true, reason: "you may only use one Defence action per turn" };
  }

  // TELEPORTATION: "you may only use one action with this trait each
  // turn."
  if (hasTrait(action, "teleportation") && used.teleportation > 0) {
    return { blocked: true, reason: "you may only use one Teleportation action per turn" };
  }

  // WORD: "Only one word spell may be used every turn and it must be
  // used as your opening action."
  if (hasTrait(action, "word")) {
    if (used.word > 0) {
      return { blocked: true, reason: "you may only use one Word spell per turn" };
    }
    if (used.actions > 0 || actedThisTurn) {
      return {
        blocked: true,
        reason: "a Word spell must be your opening action — you have already acted this turn"
      };
    }
  }

  // CONVICTION: "may only be used once per round." ONE LIMIT, NOT TWO
  // (3.619.0; Chapter 12, Graham's R10): this used to count actions with
  // the trait per TURN, beside the per-ROUND spend gate in conviction.mjs
  // that every point actually goes through. It asks that gate — above,
  // before the encounter test (3.622.0).

  // STANCE: "After you use an action with the stance trait, you must
  // wait at least one round before using another."
  if (hasTrait(action, "stance") && lastStanceRound !== null && round !== null) {
    if (round <= lastStanceRound) {
      return {
        blocked: true,
        reason: "you must wait at least one round after entering a Stance before using another"
      };
    }
  }

  return { blocked: false, reason: "" };
}

/**
 * CONVICTION: "it may not be used in conjunction with either the chance
 * or advantage traits." Checked separately from the per-turn rules
 * because it is about one action's own trait combination, not history.
 *
 * CHANCE: "You can never have more than a single chance effect alter a
 * roll." ADVANTAGE: "You may only apply one instance of this trait to
 * any one action and if an action gains both advantage and disadvantage,
 * they simply cancel each other out." The cancelling half already lives
 * in the check engine, which resolves a bias of advantage plus
 * disadvantage to neither.
 *
 * @param {object} action
 * @returns {{blocked: boolean, reason: string}}
 */
export function traitCombinationRestriction(action) {
  if (hasTrait(action, "conviction") && hasTrait(action, "chance")) {
    return {
      blocked: true,
      reason: "a Conviction ability cannot be used in conjunction with the Chance trait"
    };
  }
  if (hasTrait(action, "conviction") && hasTrait(action, "advantage")) {
    return {
      blocked: true,
      reason: "a Conviction ability cannot be used in conjunction with the Advantage trait"
    };
  }
  return { blocked: false, reason: "" };
}

/**
 * RARE: "All checks in relation to the entity with this trait have their
 * DC increased by +5." UNCOMMON: the same at +2.
 *
 * Read from a trait string *or* from the `rarity` field this project
 * already carries on items, since the rulebook expresses rarity both
 * ways and content uses the field.
 *
 * @param {object|string} subject A trait string, an action, or an item's
 *   system data carrying `rarity`.
 * @returns {number} The DC increase, 0 when neither applies.
 */
export function rarityDCIncrease(subject) {
  const rarity = String(
    (typeof subject === "object" ? subject?.rarity : "") ?? ""
  ).trim().toLowerCase();

  if (rarity === "rare" || hasTrait(subject, "rare")) return 5;
  if (rarity === "uncommon" || hasTrait(subject, "uncommon")) return 2;
  return 0;
}

/**
 * Whether a target ignores an effect because it is immune to one of the
 * traits that effect carries.
 *
 * The general form of the rule above. Mindless-versus-Mental was the only
 * trait immunity this system had: hard-coded, and enforced in exactly one
 * workflow, so a Mental spell or affliction landed on a Mindless creature
 * quite happily. Any trait can be made immune now, either from the
 * actor's own immunities field or from what the creature is, and every
 * gate consults this one function.
 *
 * @param {object|string} action Anything carrying a `traits` string.
 * @param {object|null} targetSystem The target actor's system data.
 * @param {object|null} [creatureTypeSystem] The `system` data of the
 *   target's owned "creature-type" item, if the caller has a live Actor
 *   to pull one from (ownedCreatureTypeSystem in creature-type-rules.mjs).
 * @returns {{trait: string}|null} The trait responsible, for reporting.
 */
export function immuneToEffect(action, targetSystem, creatureTypeSystem = null) {
  if (!targetSystem) return null;
  const traits = withImpliedTraits(traitList(typeof action === "string" ? action : action?.traits));
  if (!traits.length) return null;

  const immune = resolveImmunities(
    targetSystem,
    derivedImmunitySets(targetSystem, creatureTypeSystem)
  );
  const trait = immuneTrait(immune.traits, traits);
  return trait ? { trait } : null;
}

/**
 * Weapon traits (Chapter 6) are a *separate namespace* from Appendix 3,
 * and this helper exists so that reading one can never accidentally read
 * the other.
 *
 * The two collided on Penetrating: on a weapon it means "treats all
 * armour as none within the first range increment", while Appendix 3's
 * entry of the same name meant "bypasses non-magical barriers and can
 * counteract magical ones". Per Graham the weapon trait keeps the name;
 * the Appendix 3 trait is now PENETRATE. Because the two names are now
 * distinct words, neither matcher can see the other's trait — but going
 * through named helpers makes which namespace is being read explicit at
 * every call site rather than implied by an inline regular expression.
 *
 * Unlike hasTrait, this tolerates a trailing value ("AR 1", "Range 80",
 * "Powerful +2"), since Chapter 6 traits carry their magnitude inline.
 *
 * @param {object|string} weaponSystem A weapon's system data, or its
 *   trait string.
 * @param {string} name The weapon trait to look for.
 * @returns {boolean}
 */
export function hasWeaponTrait(weaponSystem, name) {
  const source =
    typeof weaponSystem === "string" ? weaponSystem : weaponSystem?.traits;
  const wanted = String(name ?? "").trim();
  if (!wanted) return false;
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(String(source ?? ""));
}

/**
 * PENETRATE (Appendix 3): "it bypasses non-magical barriers and can
 * counteract magical ones in an attempt to pass through them."
 *
 * Reports what the trait entitles an effect to do rather than doing it:
 * this project has no barrier effects for it to act on yet — walls,
 * wards and the like are compendium content that doesn't exist — so
 * wiring it to anything would be inventing the thing it acts upon. The
 * counteract engine it will use when that content arrives is already
 * built (module/counteract.mjs).
 *
 * @param {object} effect Anything carrying a `traits` string.
 * @returns {{bypassesMundane: boolean, mayCounteractMagical: boolean}}
 */
export function penetrateBarrierBehaviour(effect) {
  const penetrates = hasTrait(effect, "penetrate");
  return {
    bypassesMundane: penetrates,
    mayCounteractMagical: penetrates
  };
}

/**
 * SECRET: "If an ability has this trait, the GM rolls the check in
 * secret."
 *
 * Returned as a roll mode rather than applied here, so the check engine
 * stays the only thing that talks to Foundry's message modes. Appendix 3
 * also notes that some tables prefer the player to roll privately
 * instead; that stays a table convention, since either way the result is
 * hidden from the rest of the party, which is the mechanical point.
 *
 * @param {object} action
 * @returns {string|null} A Foundry roll mode, or null if not Secret.
 */
/**
 * The message mode meaning "rolled, hidden, and the roller cannot read it
 * either" — what Appendix 3's Secret trait asks for.
 *
 * "blind", NOT "blindroll". Foundry v14 renamed its chat modes and keys
 * `CONFIG.ChatMessage.modes` by the short names; the legacy
 * `CONST.DICE_ROLL_MODES` values ("publicroll", "gmroll", "blindroll",
 * "selfroll") are still REPORTED by that constant but are no longer
 * accepted by `ChatMessage.applyMode`, which throws on them.
 *
 * FOUND LIVE, 16 Aug 2026, while verifying the Sindarni fix. Identify
 * Power opened its dialog, offered the right bonus pre-ticked, accepted a
 * Roll — and posted nothing at all. The console had
 * `TypeError: Cannot read properties of undefined (reading 'handler')`
 * thrown out of `ChatMessage.applyMode`, which killed the card after the
 * dice had already been rolled. Nine actions were affected, including
 * Hide and Sneak.
 *
 * The check dialog never had this problem because it builds its own
 * Visibility list from `CONFIG.ChatMessage.modes` directly, so it moved
 * with the rename. This was the one hard-coded mode string left.
 */
export const BLIND_ROLL_MODE = "blind";

export function secretRollMode(action) {
  return hasTrait(action, "secret") ? BLIND_ROLL_MODE : null;
}
