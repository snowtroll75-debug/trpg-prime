/**
 * The eight Chapter 5 feats that are a standing number or a standing
 * exemption — no new action, nothing to press, and (until now) nothing
 * automated either. All eight shipped as a note effect telling the player
 * to apply the feat themselves: "add it in the roll dialog", "apply when
 * judging the first band". That is the same honour system Juggernaut and
 * Resolve were on, and it fails the same way — quietly, in the player's
 * favour or against them, with no card ever saying so.
 *
 *   BRAVERY          +2 circumstance against emotion and fear saves, and
 *                    Frightened lands one step milder.
 *   FAR THROW        a thrown weapon's FIRST range increment is +10 ft.
 *   SHIELDED STRIDE  +4 shield DB against attacks provoked by your
 *                    movement. Not with a buckler.
 *   CONSTANT GUARD   your shield bonus survives the surprise round and
 *                    being flat-footed.
 *   TWIN PARRY       your offhand weapon counts as Parry; +1 if it is.
 *   WILD STRIDE      non-magical difficult terrain costs you nothing
 *                    extra, and formidable terrain costs as difficult.
 *   TRACKLESS STEP   attempts to track you are at disadvantage.
 *   ACCURATE SPELL   a spell attack into melee ignores the standard +4.
 *
 * WHY THEY ARE ONE MODULE. Each is a single decision that belongs beside
 * an existing owner — `parryBonus` already answers Parry, `ranged.mjs`
 * already answers range bands, the shield pool already answers shield DB.
 * What they share is not a mechanism but a shape: a fact about the
 * character that changes a number somebody else computes. Keeping the
 * eight answers together means the next reader can see all eight at once;
 * keeping them PURE means every one is driven rather than read.
 *
 * TWO OF THEM NEEDED THE RULE THEY EXEMPT YOU FROM. Constant Guard is
 * written against a baseline — losing your shield bonus when flat-footed
 * — that this system had never implemented, so the feat granted exactly
 * nothing. Graham's ruling, 21 August 2026: implement the baseline, then
 * the exemption. Wild Stride was the same shape and needed no ruling,
 * because Foundry's own Region cost was already there to be read.
 */

/** Matched case-insensitively, the way every feat lookup here does. */
const has = (featNames, name) => Array.from(featNames ?? [])
  .some((n) => String(n).trim().toLowerCase() === name);

/* ------------------------------------------------------------------ */
/* Bravery                                                             */
/* ------------------------------------------------------------------ */

/**
 * "You reduce the severity of the frightened condition by 1 each time you
 * succumb to it."
 *
 * ONE DECIDER, because three call sites apply Frightened independently —
 * Demoralise's outcome table, a spell's effect and the condition workflow
 * — and a feat that only reached one of them would work on the card the
 * player happened to be looking at.
 *
 * "EACH TIME YOU SUCCUMB" is when it ARRIVES, not a standing -1: a value
 * already on the sheet is not being succumbed to again. So this is asked
 * of the incoming value and nothing re-reads it afterwards.
 *
 * Reducing 1 to 0 means the condition does not land at all, which is the
 * printed result and not a special case worth writing twice.
 *
 * @param {number} value    the Frightened value about to be applied
 * @param {string[]} featNames the defender's feats
 * @returns {number} the value that actually lands, never below 0
 */
export function frightenedApplied(value, featNames = []) {
  const incoming = Math.max(0, Math.floor(Number(value) || 0));
  if (!incoming) return 0;
  return has(featNames, "bravery") ? Math.max(0, incoming - 1) : incoming;
}

/* ------------------------------------------------------------------ */
/* Far Throw                                                           */
/* ------------------------------------------------------------------ */

/** The feet Far Throw adds to a thrown weapon's first range increment. */
export const FAR_THROW_FEET = 10;

/**
 * "When you make an attack with a thrown weapon, you increase your first
 * range increment by 10 feet."
 *
 * THE FIRST BAND ONLY, which is what makes this different from every
 * other range bonus in the system. Archer's Range and Far Shot lengthen
 * EVERY increment, so they can be folded into the increment itself before
 * the bands are counted; this one cannot, and folding it in anyway would
 * quietly hand a thrown weapon 60 extra feet of maximum range instead of
 * 10 extra feet of no-penalty range.
 *
 * @param {string[]} featNames
 * @param {string} traits  the weapon's traits
 * @returns {number} feet to add to the first band, 0 if it does not apply
 */
export function farThrowBonus(featNames = [], traits = "") {
  if (!has(featNames, "far throw")) return 0;
  return /\bthrown\b/i.test(String(traits ?? "")) ? FAR_THROW_FEET : 0;
}

/* ------------------------------------------------------------------ */
/* Shielded Stride and Constant Guard                                  */
/* ------------------------------------------------------------------ */

/** The shield DB Shielded Stride adds against a movement-provoked attack. */
export const SHIELDED_STRIDE_BONUS = 4;

/**
 * "Your shield bonus to DB is increased by +4 against actions which are
 * provoked via movement. You cannot use Shielded Stride with a buckler."
 *
 * PER-ATTACK, so it is answered where the attack is, not on an effect:
 * the same split Ferocious Shape needed, for the same reason. A standing
 * +4 would apply to every blow in the round.
 *
 * @param {object} state
 * @param {string[]} state.featNames
 * @param {boolean} state.provokedByMovement  the attack was provoked by
 *   the defender's own movement
 * @param {boolean} state.buckler  the shield in hand is a buckler
 * @param {boolean} state.hasShield  a shield is being wielded at all
 */
export function shieldedStrideBonus({
  featNames = [], provokedByMovement = false, buckler = false, hasShield = true
} = {}) {
  if (!has(featNames, "shielded stride")) return 0;
  if (!provokedByMovement || !hasShield || buckler) return 0;
  return SHIELDED_STRIDE_BONUS;
}

/**
 * Does this character keep their shield bonus right now?
 *
 * THE BASELINE THIS ANSWERS DID NOT EXIST until 21 August 2026. Constant
 * Guard — "you may apply your Shield bonus to DB in combat even in the
 * surprise round or if you are flat-footed" — is written against a rule
 * the system had never implemented, so the feat had been granting
 * precisely nothing since the day it shipped. Graham's ruling: implement
 * the baseline, then the exemption.
 *
 * IT IS A REAL COST TO EVERYONE ELSE, and that is the point of the feat.
 * A shield user is now genuinely worse off in the surprise round and
 * against anything that catches them flat-footed, which is what makes
 * Constant Guard worth a feat slot at BAB +12.
 *
 * @param {object} state
 * @param {string[]} state.featNames
 * @param {boolean} state.flatFooted
 * @param {boolean} state.surpriseRound
 * @returns {{kept: boolean, reason: string}} `reason` names what took it,
 *   so the sheet can say so rather than the number simply being smaller.
 */
export function shieldBonusKept({ featNames = [], flatFooted = false, surpriseRound = false } = {}) {
  if (!flatFooted && !surpriseRound) return { kept: true, reason: "" };
  if (has(featNames, "constant guard")) return { kept: true, reason: "Constant Guard" };
  return {
    kept: false,
    reason: flatFooted ? "Flat-Footed" : "surprise round"
  };
}

/* ------------------------------------------------------------------ */
/* Twin Parry                                                          */
/* ------------------------------------------------------------------ */

/**
 * "Any weapon in your offhand is considered to have the Parry trait. If
 * your off-hand weapon already has the parry trait its bonus is increased
 * by +1. You must have a weapon in your offhand to gain this bonus."
 *
 * THERE IS NO OFFHAND FIELD in this system — hands are counted, not
 * slotted (see held-items.mjs). What "a weapon in your offhand" means
 * here is therefore what `parryBonus` already requires for Parry to work
 * at all: a SECOND equipped weapon. That is not a liberty; it is the same
 * reading the base rule is already built on, and inventing a slot to hang
 * this one feat off would put a second answer beside it.
 *
 * @param {object} state
 * @param {string[]} state.featNames
 * @param {boolean} state.hasSecondWeapon   two or more weapons equipped
 * @param {boolean} state.alreadyParry      a qualifying Parry weapon is in hand
 * @returns {number} the Parry bonus this feat produces, 0 if it does not apply
 */
export function twinParryBonus({ featNames = [], hasSecondWeapon = false, alreadyParry = false } = {}) {
  if (!has(featNames, "twin parry") || !hasSecondWeapon) return 0;
  return alreadyParry ? 2 : 1;
}

/* ------------------------------------------------------------------ */
/* Wild Stride                                                         */
/* ------------------------------------------------------------------ */

/**
 * "You can ignore the effects of non-magical difficult terrain. As normal
 * for ignoring difficult terrain, this also lets you treat the hindrances
 * of formidable terrain as those of difficult terrain."
 *
 * READ OFF THE COST, not off a terrain type. Foundry prices difficult
 * ground with a Region behaviour that multiplies the movement cost, so
 * what reaches this system is a bigger number rather than a label — and
 * the multiplier IS the terrain type: doubled is difficult, tripled is
 * formidable. One step off it says both halves of the rule at once.
 *
 * NON-MAGICAL IS NOT SOMETHING THIS CAN SEE, and it is named rather than
 * assumed: a Region placed by a spell prices movement exactly as a bog
 * does. `magical` is passed by whatever knows — today nothing does, so
 * the caller leaves it false and the GM adjudicates a magical Region, the
 * same way `terrainBehaviours` already leaves an exempt trait to them.
 *
 * ASKED OF A DECLARED FLAG, NOT OF A FEAT NAME (3.552.0). This was
 * gated on `has(featNames, "wild stride")`, and `featNames` is built from
 * FEAT items only — so the Silvarni elf heritage, which prints this exact
 * rule ("ignore all natural difficult terrain. Furthermore, natural
 * formidable terrain is classed as difficult terrain for you"), could
 * never reach it under any name. The mechanism shipped, correct and
 * complete, and the heritage that needed it carried a note saying terrain
 * costs were not modelled. Found by the pages 18-30 audit.
 *
 * `eases` is therefore whatever the caller resolved from
 * `flags.trg-prime.ignoresDifficultTerrain`, across items AND effects,
 * which is a route a heritage, a feat, a spell or an item can all take.
 *
 * @param {object} state
 * @param {number} state.cost      the terrain-adjusted cost Foundry measured
 * @param {number} state.distance  the raw distance, before terrain
 * @param {boolean} state.eases    the creature ignores difficult terrain
 * @param {boolean} state.magical  the terrain is magical, so unaffected
 * @returns {{cost: number, eased: boolean}}
 */
/**
 * The flag a SCOPED carrier uses: an array of armed movement action keys
 * the carrier eases, rather than the blanket `ignoresDifficultTerrain`.
 *
 * FEATHER STEP (Chapter 5, page 133) is why this exists: "You can Step
 * into difficult terrain as if it was normal terrain." Wild Stride, the
 * Silvarni heritage and Terrain Mastery all ease EVERY move; Feather Step
 * eases one action and leaves a Stride through the same mud at full cost.
 * Handing it the blanket flag would have been one data row and would have
 * quietly granted three-quarters of a rule the book does not print.
 */
export const TERRAIN_RELIEF_SCOPE_FLAG = "ignoresDifficultTerrainOn";

/** The action keys one document's flags ease: `true` for all of them,
 *  an array for a scoped carrier, or null when it carries nothing. */
function terrainReliefScope(document, systemId = "trg-prime") {
  const flags = document?.flags?.[systemId];
  if (!flags) return null;
  if (flags.ignoresDifficultTerrain) return true;
  const scoped = flags[TERRAIN_RELIEF_SCOPE_FLAG];
  if (Array.isArray(scoped) && scoped.length) {
    return scoped.map((key) => String(key ?? "").trim().toLowerCase()).filter(Boolean);
  }
  return null;
}

/**
 * Does anything this creature carries ignore difficult terrain FOR THIS
 * MOVE?
 *
 * Items and effects both, so a heritage's transferred effect and a feat's
 * own flag are equally valid carriers.
 *
 * `movementKey` is the armed movement action the move is being made as —
 * "step", "crawl", "charge", "reposition" — or null for an ordinary
 * unarmed Stride. A blanket carrier eases whatever is passed, including
 * null. A SCOPED carrier eases only the keys it names, and therefore
 * never eases a move whose action was not identified: defaulting the
 * other way would let one omitted argument turn Feather Step into Wild
 * Stride at the first call site that forgot it.
 *
 * @param {Actor} actor
 * @param {string|null} [movementKey]
 * @returns {boolean}
 */
export function ignoresDifficultTerrain(actor, movementKey = null) {
  return Boolean(terrainReliefName(actor, movementKey));
}

/**
 * WHICH of the things this creature carries eased the terrain.
 *
 * ADDED AT 3.570.1 BECAUSE THE CARD NAMED THE WRONG FEAT. The movement
 * notice read "Wild Stride eased the terrain." — hard-coded, written
 * when Wild Stride was the only carrier there was. By 3.570.0 there were
 * four (Wild Stride, the Silvarni heritage, Terrain Mastery and Feather
 * Step), and the sentence was wrong for three of them. Live testing
 * found it: a character with Feather Step and no Wild Stride at all was
 * told Wild Stride had eased the ground.
 *
 * A message naming the wrong rule is worse than no message, because a
 * player checking their sheet for the feat it names will not find it.
 *
 * Returns the carrier's NAME so the caller has something to print, and
 * an empty string is impossible — a nameless carrier answers with the
 * generic label rather than an empty sentence.
 *
 * @param {Actor} actor
 * @param {string|null} [movementKey]
 * @returns {string|null} null when nothing eases this move.
 */
export function terrainReliefName(actor, movementKey = null) {
  const SYSTEM_ID = "trg-prime";
  const wanted = String(movementKey ?? "").trim().toLowerCase();
  const carries = (document) => {
    const scope = terrainReliefScope(document, SYSTEM_ID);
    if (scope === true) return true;
    return Array.isArray(scope) && Boolean(wanted) && scope.includes(wanted);
  };
  const named = (document) => String(document?.name ?? "").trim() || "Your terrain training";
  for (const item of Array.from(actor?.items ?? [])) if (carries(item)) return named(item);
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect?.disabled) continue;
    if (carries(effect)) return named(effect);
  }
  return null;
}

export function wildStrideCost({ cost = 0, distance = 0, eases = false, magical = false } = {}) {
  const charged = Math.max(0, Number(cost) || 0);
  const measured = Math.max(0, Number(distance) || 0);
  if (magical || !eases) return { cost: charged, eased: false };
  // No terrain, nothing measured, or terrain that somehow costs LESS than
  // the distance: none of those is difficult ground, and easing them would
  // be inventing a discount rather than removing a hindrance.
  if (!measured || charged <= measured) return { cost: charged, eased: false };
  const multiplier = charged / measured;
  const eased = Math.max(1, multiplier - 1);
  return { cost: Math.round(measured * eased), eased: true };
}

/* ------------------------------------------------------------------ */
/* Trackless Step                                                      */
/* ------------------------------------------------------------------ */

/**
 * "Attempts to track you are made at disadvantage."
 *
 * THE PENALTY LANDS ON SOMEBODY ELSE'S ROLL, which is what makes this the
 * only one of the eight that needed a ruling. The Track action has no
 * target field, so nothing tells the system whose trail is being
 * followed. Graham's ruling, 21 August 2026: ask. The Track action names
 * its quarry before the roll, and anyone named who has the feat applies
 * disadvantage — information the GM has to settle anyway before setting
 * the difficulty.
 *
 * @param {string[][]} quarryFeatLists  each named quarry's feats
 * @returns {{disadvantage: boolean, count: number}}
 */
export function tracklessStepApplies(quarryFeatLists = []) {
  const count = Array.from(quarryFeatLists)
    .filter((feats) => has(feats, "trackless step")).length;
  return { disadvantage: count > 0, count };
}

/* ------------------------------------------------------------------ */
/* Accurate Spell                                                      */
/* ------------------------------------------------------------------ */

/**
 * "When attacking a target in melee with a spell, you ignore the +4
 * standard cover bonus that each target gains. Be aware that this feat
 * only ignores the static penalty for firing into melee, it does not
 * ignore any additional bonuses that the target creature may gain from
 * cover and concealment."
 *
 * NARROW BY ITS OWN INSTRUCTION. The feat's second sentence exists to
 * stop exactly the widening that would be easiest to write, so this
 * answers only the flat melee penalty the casting dialog already applies
 * and says nothing about cover or concealment.
 *
 * @param {string[]} featNames
 * @returns {boolean} whether the flat melee penalty is waived
 */
export function accurateSpellWaivesMelee(featNames = []) {
  return has(featNames, "accurate spell");
}
