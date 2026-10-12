/**
 * Attack resolution and critical injuries (Core 3.1, Chapter 7).
 * Pure logic; the Foundry workflow layers on top.
 */
import { computeWeaponModifiers, stepDownDieSize } from "../item-quality.mjs";
import { parseGrantList } from "../grants.mjs";
import { twinParryBonus } from "./passive-feats.mjs";

/**
 * Does this action count toward the multiple attack penalty?
 *
 * Page 191: "Any action which has the attack trait counts towards the
 * multiple attack penalty including disarm, shove, spells etc."
 *
 * GRAHAM'S R1 OF THE BLOCK-19 AUDIT (21 September 2026): "Only things
 * with the attack trait." So the TRAIT is the test, not the fact that
 * something was rolled — an action whose traits line carries Attack
 * takes the penalty and advances the counter, and one that does not,
 * does not. A spell is an attack action when it makes an attack roll
 * (no spell in the pack writes the trait out; rolling against a DB is
 * what having it means), and a save-only spell is not.
 *
 * @param {string|object} traits a traits line, or anything carrying one
 * @returns {boolean}
 */
export function countsTowardMAP(traits) {
  const source = typeof traits === "string" ? traits : traits?.traits;
  return /(^|[,\s])attack([,\s]|$)/i.test(String(source ?? ""));
}

/**
 * The same question for a spell (R1): an attack spell rolls against a
 * DB, which is what carrying the Attack trait means for a spell.
 *
 * @param {object} spellData a spell's `system`
 * @returns {boolean}
 */
export function spellCountsTowardMAP(spellData) {
  if (countsTowardMAP(spellData?.traits)) return true;
  return String(spellData?.category ?? "").trim().toLowerCase() === "attack";
}

/**
 * Page 192: "If DR reduces the damage from a critical hit to zero or
 * less, the target takes a subdual critical instead of the normal type."
 *
 * NEW at 3.579.0 (the block-19 audit's D5; Graham's R5: "Yes"). Nothing
 * converted the type before, and the subdual table — which subdual
 * weapons already use — was unreachable by this route.
 *
 * THE TEST IS DR, NOT ZERO. A critical stopped by an immunity, or by a
 * resistance that happened to round to nothing, is not this rule: the
 * sentence names DR, so `drApplied` must be what did it. A blow that
 * dealt nothing before DR was ever consulted is not it either.
 *
 * @param {object} state
 * @param {string|null} state.critical the severity, or null for a plain hit
 * @param {string} state.damageType the type the blow dealt
 * @param {number} state.total the damage rolled, before defences
 * @param {number} state.taken what was left after them
 * @param {number} state.drApplied how much DR took off
 * @returns {boolean}
 */
export function criticalBecomesSubdual({ critical = null, damageType = "", total = 0, taken = 0, drApplied = 0 } = {}) {
  if (!critical) return false;
  if (String(damageType).trim().toLowerCase() === "subdual") return false;
  if (!(Number(drApplied) > 0)) return false;
  if (!(Number(total) > 0)) return false;
  return Number(taken) <= 0;
}

/** Multiple Attack Penalty: -5/-10, or -4/-8 with the agile trait. */
export function mapPenalty(attackIndex, agile = false, agileStrikes = false) {
  const index = Math.max(0, Math.floor(Number(attackIndex) || 0));
  if (index === 0) return 0;
  // Agile Strikes (Class, Chapter 5): "-3 for your second attack and -6
  // for subsequent attacks (rather than -4 and -8) for attacks that have
  // the agile trait" — only ever tightens the AGILE ladder.
  const step = agile ? (agileStrikes ? 3 : 4) : 5;
  return -(index === 1 ? step : step * 2);
}

/**
 * Extracts a valued weapon trait's number from the free-text traits
 * field — "Powerful +4", "AR 2" — confirmed against the rulebook's own
 * weapon table entries as the actual format used (Powerful has no
 * fixed value in its own trait definition; the number is only ever
 * listed per-weapon, same as AR and Mighty).
 *
 * @param {string} traits
 * @param {string} traitName
 * @returns {number|null} null if the trait isn't present at all.
 */
export function extractTraitValue(traits, traitName) {
  // No trailing word boundary: weapon data isn't consistently spaced — a Thrown
  // increment appears as both "Thrown 10 ft" and "Thrown 10ft.", and the latter
  // has no boundary between the digits and "ft". The AR/Powerful/Mighty callers
  // are unaffected (their numbers are always followed by space, comma, or end).
  const pattern = new RegExp(`\\b${traitName}\\s*\\+?(\\d+)`, "i");
  const match = String(traits ?? "").match(pattern);
  return match ? Math.trunc(Number(match[1])) : null;
}

/**
 * Finesse (Chapter 6): "You can use your Dexterity instead of
 * Strength when making attack rolls using this melee weapon." A
 * choice, and the sensible automatic choice is whichever is higher —
 * that's clearly the intent of a trait that exists to let a
 * Dexterity-built character use a weapon without being penalised for
 * it, not a trait that would ever be chosen to use the lower modifier
 * on purpose.
 *
 * Returns a delta to apply to the already-computed attack total
 * (which currently reflects whatever ability is configured in
 * system.combat.attack.abilityKey) rather than recomputing the whole
 * attack bonus from scratch — the base, proficiency, and other
 * bonuses stay exactly as already computed; only the ability
 * component is swapped.
 *
 * @param {boolean} hasFinesse
 * @param {number} currentAbilityMod Whatever's already baked into
 *   the actor's configured attack ability.
 * @param {number} dexMod
 * @returns {number} 0 if Finesse doesn't apply or Dex isn't higher.
 */
export function finesseAdjustment(hasFinesse, currentAbilityMod, dexMod) {
  if (!hasFinesse) return 0;
  const delta = Number(dexMod) - Number(currentAbilityMod);
  return delta > 0 ? delta : 0;
}

/**
 * DEXTERITY IS THE ABILITY FOR A RANGED ATTACK ROLL (Chapter 1).
 *
 * NEW at 3.489.0. Graham, 4 September 2026: make the rulebook exact.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BOOK SAYS IT TWICE, AND SCOPES STRENGTH AWAY FROM IT.
 *
 *   STRENGTH  "influences carrying capacity, MELEE attack rolls, and
 *              damage dealt with MELEE weapons."
 *   DEXTERITY "affects RANGED attack rolls, DB, initiative… vital for
 *              characters seeking to excel with ranged weapons, such as
 *              the bow or sling."
 *
 * Strength's own entry never claims ranged. So applying Strength to a
 * missile Strike was not a missing Dexterity rule, it was a Strength rule
 * that does not exist. The glossary agrees, naming two bonuses: *"a d20
 * roll + your attack bonus"* for melee against *"a d20 roll + your RANGED
 * attack bonus"*.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ALWAYS, NOT "WHEN HIGHER" — AND THAT IS THE DIFFERENCE FROM FINESSE
 * DIRECTLY ABOVE.
 *
 * Finesse takes the better of the two because Finesse is an OPTION a
 * weapon grants: *"you CAN use your Dexterity instead"*. This is not an
 * option, it is what the ability *is*. Taking the better of the two would
 * make a high-Strength character the better archer, which is the exact
 * opposite of "vital for characters seeking to excel with ranged
 * weapons" — so the delta here is returned even when it is NEGATIVE.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DAMAGE SIDE WAS ALREADY RIGHT, AND IS NOT TOUCHED.
 *
 * `propulsiveStrengthBonus` returns 0 unless the weapon has Propulsive,
 * so ranged damage has always excluded Strength — exactly as *"damage
 * dealt with MELEE weapons"* requires. The system was asymmetric with
 * itself: one half built to the book, the other never revisited. That
 * asymmetry was the strongest evidence there was, because nobody chose
 * it.
 *
 * A THROWN WEAPON THEREFORE ATTACKS WITH DEX AND DAMAGES WITH STR, and
 * that is now deliberate rather than accidental. Chapter 7 puts thrown
 * weapons under ranged ATTACKS — *"attacks made with missile or thrown
 * weapons… are all considered to be ranged attacks"* — while a hurled
 * dagger is still a melee weapon for the sentence about damage. The two
 * clauses are about different rolls, and disagree only if either is read
 * as being about both.
 *
 * Same delta shape as `finesseAdjustment`: the base, proficiency and
 * every other bonus stay as computed; only the ability component moves.
 *
 * @param {boolean} isRanged missile, or thrown at beyond melee reach
 * @param {number} currentAbilityMod whatever combat.attack.abilityKey baked in
 * @param {number} dexMod
 * @returns {number} 0 when the attack is not ranged, or when the
 *   configured ability already IS Dexterity; otherwise the delta,
 *   negative included.
 */
export function rangedAbilityAdjustment(isRanged, currentAbilityMod, dexMod) {
  if (!isRanged) return 0;
  return Number(dexMod) - Number(currentAbilityMod);
}

/**
 * Sweep (Chapter 6): "+1-circumstance bonus to your attack roll if
 * you already attempted to attack a different target this turn using
 * this weapon." Pure decision given the set of target IDs already
 * attacked with this specific weapon so far this turn — the actual
 * tracking (which IDs, reset at start of turn) lives in the Foundry
 * workflow layer, same separation as everything else in this module.
 *
 * @param {boolean} hasSweep
 * @param {string[]} targetsAlreadyAttacked IDs attacked with this
 *   weapon so far this turn.
 * @param {string|null} currentTargetId
 * @returns {boolean}
 */
export function sweepApplies(hasSweep, targetsAlreadyAttacked, currentTargetId) {
  if (!hasSweep || !currentTargetId) return false;
  return targetsAlreadyAttacked.some((id) => id !== currentTargetId);
}

/**
 * Reach (Chapter 6): "increase the reach at which you can make melee
 * attacks (usually 5 to 10 feet). Such attacks are subject to a -2
 * penalty to AB." Per Graham directly: the -2 applies only when
 * actually attacking at the extended distance, not at normal range —
 * a reach weapon used against an adjacent target takes no penalty.
 *
 * The rulebook doesn't give a precise increase amount ("usually 5 to
 * 10 feet" describes the common outcome, not a formula), so this
 * reads it as +5 feet added to the attacker's own size-based reach —
 * consistent across sizes rather than a fixed 10 feet regardless of
 * starting reach. Worth flagging as an interpretation, same as
 * Deadly's severity-increment reading.
 *
 * @param {boolean} hasReach
 * @param {number} normalReach The attacker's own reach (feet).
 * @param {number|null} distance Feet to the target; null if unknown
 *   (e.g. no token placed) — never applies without a real distance.
 * @returns {{penalty: number, outOfReach: boolean}}
 */
export function reachPenalty(hasReach, normalReach, distance, options = {}) {
  // Reach is always enforced for a placed target: a melee weapon can only
  // strike within the attacker's reach. The Reach trait *extends* that reach by
  // +5 ft (and attacking at the extended band takes -2); it is not what turns
  // the check on. Previously the check short-circuited whenever the weapon had
  // no Reach trait — which let a plain weapon hit a target at any distance.
  if (distance === null || distance === undefined) {
    return { penalty: 0, outOfReach: false };
  }
  // THE WHIP (3.576.0): "Can't be used against adjacent creatures." Asked
  // first, because an adjacent target is inside every reach there is.
  if (options?.noAdjacent === true && distance <= ADJACENT_FEET) {
    return { penalty: 0, outOfReach: false, tooClose: true };
  }
  // A REACH OF ZERO IS A REACH (3.579.0). This read `Number(normalReach)
  // || 5`, so the Diminutive and Tiny reach of 0' that page 197 prints
  // became 5 the moment it was asked for — the other half of the block-19
  // audit's D12. Zero means the attacker must be IN the target's square,
  // which is exactly what the page says: they "must do so to make attacks
  // against them".
  const declared = Number(normalReach);
  const base = Number.isFinite(declared) ? Math.max(0, declared) : 5;
  if (distance <= base) return { penalty: 0, outOfReach: false };
  // HOW FAR THE WEAPON EXTENDS IT — the trait's +5, or what the weapon
  // prints (`weaponReachExtension`). The whip's 15 ft is +10.
  const extension = Number.isFinite(Number(options?.extension)) ? Number(options.extension) : 5;
  if (hasReach && distance <= base + extension) return { penalty: -2, outOfReach: false };
  return { penalty: 0, outOfReach: true };
}

/** Two creatures this close are adjacent. */
const ADJACENT_FEET = 5;

/**
 * How far past the wielder's own reach this weapon strikes, in feet.
 *
 * NOT ALWAYS FIVE (3.576.0). The Reach trait reads "usually 5 to 10
 * feet", and this system reads that as +5 for the trait on its own. The
 * Whip prints its own: "has a 15-foot reach" — so a weapon may declare
 * `reachFeet`, its printed reach for a Medium wielder, and extends reach
 * by that less the 5 ft a Medium creature has anyway. A larger wielder
 * keeps the same extension on top of its own longer reach.
 *
 * A weapon without the Reach trait extends nothing, whatever it declares.
 *
 * @param {object} weaponSystem
 * @returns {number} 0, 5, or the printed extension
 */
export function weaponReachExtension(weaponSystem) {
  if (!/\breach\b/i.test(String(weaponSystem?.traits ?? ""))) return 0;
  const printed = Number(weaponSystem?.reachFeet ?? 0);
  return printed > ADJACENT_FEET ? printed - ADJACENT_FEET : 5;
}

/**
 * Shove and Trip (Chapter 6, weapon traits): "uses your attack bonus
 * with the weapon instead of your unarmed attack bonus" — unlike
 * Disarm's own trait text, which doesn't make this same claim, so
 * this deliberately only covers Shove and Trip.
 *
 * "Free hand" isn't a restriction this system enforces anywhere
 * today, so that part of the trait text is already moot — nothing to
 * automate there. The fumble-to-failure downgrade these traits also
 * grant needs a fumble-outcome-choice mechanism Basic Actions don't
 * have yet, so that part isn't covered here either.
 *
 * The equipped weapon a Shove or Trip is made WITH — the first equipped
 * weapon carrying the trait — or null. The attack workflow's
 * `weaponManeuverModifiers` turns it into "your attack bonus with the
 * weapon" (3.575.0). It replaced `maneuverWeaponBonus`, which returned
 * only the item's own `attackBonus` field — 0 on every pack weapon.
 *
 * @param {Array} weapons The actor's items.
 * @param {"shove"|"trip"} traitName
 * @returns {object|null}
 */
export function maneuverWeapon(weapons, traitName) {
  const pattern = new RegExp(`\\b${traitName}\\b`, "i");
  return (weapons ?? []).find(
    (item) =>
      item.type === "weapon" &&
      item.system?.equipped &&
      pattern.test(String(item.system?.traits ?? ""))
  ) ?? null;
}

const SIZE_ORDER = [
  "diminutive",
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
  "colossal"
];

/**
 * THE BIGGER THEY ARE (Racial, Chapter 5): "Your base damage increases
 * by +2 when you hit on an attack with a sling against a Large or larger
 * creature."
 *
 * NEW at 3.377.0.
 *
 * HERE RATHER THAN IN feats.mjs, because `SIZE_ORDER` is here and a
 * second size ladder somewhere else is exactly the "two places deciding
 * one question" this project keeps paying for. It is a damage rule that
 * happens to be racial, not a racial rule that happens to touch damage.
 *
 * ABSOLUTE, NOT RELATIVE. It says "a Large or larger creature", not
 * "larger than you" — so `sizeCategoryDifference` below is the wrong tool
 * and is deliberately not used. A Huge slinger shooting a Large target
 * still gets the +2, even though that target is a category SMALLER than
 * the shooter. Reading it as relative would have looked reasonable and
 * been wrong in the case the feat is named for.
 *
 * @param {object} options
 * @param {string[]} options.featNames The actor's feat names.
 * @param {string} options.weaponGroup The weapon's `system.group`.
 * @param {string} options.targetSize The target's `system.identity.size`.
 * @returns {number} 2 or 0.
 */
export function biggerTheyAreDamageBonus({ featNames = [], weaponGroup = "", targetSize = "" } = {}) {
  const owns = (Array.isArray(featNames) ? featNames : [])
    .some((n) => String(n ?? "").trim().toLowerCase() === "the bigger they are");
  if (!owns) return 0;
  if (String(weaponGroup ?? "").trim().toLowerCase() !== "sling") return 0;
  // An unrecognised size must NOT quietly count as Large. Unknown data is
  // not evidence of a big creature, and defaulting here would hand out a
  // silent +2 against every target whose size field is blank — which, on
  // this world's NPCs, is most of them. `sizeCategoryDifference` defaults
  // the other way on purpose; that is right for a penalty and wrong for a
  // bonus, which is the second reason not to reuse it.
  const index = SIZE_ORDER.indexOf(String(targetSize ?? "").trim().toLowerCase());
  if (index === -1) return 0;
  return index >= SIZE_ORDER.indexOf("large") ? 2 : 0;
}

/**
 * How many size categories larger the target is than the actor
 * (negative if the target is smaller, 0 if the same size).
 * Unrecognised size keys default to "medium" — a conservative choice
 * that avoids guessing a penalty from bad data, matching how this
 * system already treats unrecognised sizes elsewhere (held-items.mjs).
 *
 * @param {string} actorSize
 * @param {string} targetSize
 * @returns {number}
 */
export function sizeCategoryDifference(actorSize, targetSize) {
  const actorIndex = SIZE_ORDER.indexOf(String(actorSize ?? "medium").toLowerCase());
  const targetIndex = SIZE_ORDER.indexOf(String(targetSize ?? "medium").toLowerCase());
  const safeActor = actorIndex === -1 ? SIZE_ORDER.indexOf("medium") : actorIndex;
  const safeTarget = targetIndex === -1 ? SIZE_ORDER.indexOf("medium") : targetIndex;
  return safeTarget - safeActor;
}

/**
 * Disarm/Grapple/Shove/Trip Attack (Chapter 4): each carries its own
 * "-N penalty at [threshold] size categories larger, an additional
 * cumulative -N per category beyond that" clause. Disarm's threshold
 * is 1 category larger at -2 per category; Grapple/Shove/Trip's is 2
 * categories larger at -4 per category — confirmed directly against
 * each action's own exact wording rather than assumed uniform.
 *
 * @param {number} sizeDiff From sizeCategoryDifference — positive
 *   means the target is larger.
 * @param {number} threshold Size categories larger before any
 *   penalty applies at all (1 for Disarm, 2 for the other three).
 * @param {number} perCategory The penalty per category at and beyond
 *   the threshold (negative, e.g. -2 or -4).
 * @returns {number} Always 0 or negative.
 */
export function maneuverSizePenalty(sizeDiff, threshold, perCategory) {
  const diff = Math.floor(Number(sizeDiff) || 0);
  if (diff < threshold) return 0;
  return (diff - threshold + 1) * perCategory;
}

/**
 * Each maneuver's own threshold and step, keyed by action.
 *
 * MOVED HERE AT 3.401.0, from a module-private constant inside
 * combat/action-workflow.mjs. It lived there because the action workflow
 * was the only thing that performed a maneuver — and then Tanglefoot
 * arrived, a cantrip whose whole text is "use your Spellcraft result at
 * -4 to PERFORM A GRAPPLE ACTION", and needed the same table.
 *
 * A second copy beside the spell would have been two places holding one
 * rule, with nothing to notice when they drifted. It sits beside
 * `maneuverSizePenalty` because that is the function that consumes it,
 * and because this file is pure — a harness can read the table and the
 * rule together.
 *
 * DISARM IS THE ODD ONE OUT and always was: 1 category at -2, where the
 * other three are 2 categories at -4. Confirmed against each action's
 * own wording rather than assumed uniform.
 */
export const MANEUVER_SIZE_PENALTY = Object.freeze({
  disarmAttack: Object.freeze({ threshold: 1, perCategory: -2 }),
  grappleAttack: Object.freeze({ threshold: 2, perCategory: -4 }),
  shoveAttack: Object.freeze({ threshold: 2, perCategory: -4 }),
  tripAttack: Object.freeze({ threshold: 2, perCategory: -4 })
});

/**
 * Silent (Chapter 6): per Graham directly, correcting the rulebook's
 * own wording — this lowers the DC of the Sniping (Stealth) check by
 * 2 (making it easier for the wielder), not raises it. Checked
 * against any equipped ranged weapon carrying the trait, since
 * Sniping's own trigger requires "a ranged weapon within its first
 * range increment" and this system doesn't otherwise know which
 * specific weapon triggered a given Sniping attempt.
 *
 * @param {Array<{type: string, system: {equipped: boolean, traits: string, attackMode: string}}>} weapons
 * @returns {boolean}
 */
export function hasSilentWeaponEquipped(weapons) {
  return weapons.some(
    (item) =>
      item.type === "weapon" &&
      item.system?.equipped &&
      ["missile", "thrown"].includes(item.system?.attackMode) &&
      /\bsilent\b/i.test(String(item.system?.traits ?? ""))
  );
}

/**
 * Parry (Chapter 6): "you can use it in your off-hand, gaining a
 * +1-shield bonus to DB." Per Graham directly, three conditions:
 * (1) only applies while another weapon is equipped at the same
 * time — not a Parry weapon used alone; (2) lost specifically for a
 * Parry weapon that was just used to attack; (3) it's a shield bonus,
 * so takes the higher value rather than stacking with other Parry
 * weapons or actual shields — matching this system's existing
 * "multiple Shield bonuses do not stack" handling.
 *
 * @param {Array<{id: string, type: string, system: {equipped: boolean, traits: string}}>} weapons
 * TWIN PARRY (Chapter 5, 3.357.0): "Any weapon in your offhand is
 * considered to have the Parry trait. If your off-hand weapon already has
 * the parry trait its bonus is increased by +1." Both halves are answered
 * here rather than beside the shield pool, because this is already the one
 * function that decides what Parry is worth — and the feat changes exactly
 * that, not what the number is added to. `twinParryBonus` holds the rule;
 * this supplies it the two facts it asks about.
 *
 * @param {Set<string>} attackedThisTurnIds Weapon IDs used to attack
 *   since the actor's last turn began.
 * @param {{featNames?: string[]}} [options]
 * @returns {number} 0 if no equipped weapon currently qualifies.
 */
export function parryBonus(weapons, attackedThisTurnIds, { featNames = [] } = {}) {
  const equippedWeapons = weapons.filter((item) => item.type === "weapon" && item.system?.equipped);
  if (equippedWeapons.length < 2) return 0;

  const qualifying = equippedWeapons.filter(
    (item) => /\bparry\b/i.test(String(item.system?.traits ?? "")) && !attackedThisTurnIds.has(item.id)
  );
  const twin = twinParryBonus({
    featNames,
    hasSecondWeapon: true,
    alreadyParry: qualifying.length > 0
  });
  // HIGHEST WINS, not a sum: Twin Parry REPLACES what the base rule pays
  // rather than stacking on top of it, which is what "its bonus is
  // increased by +1" means for a weapon that already qualifies.
  return Math.max(qualifying.length ? 1 : 0, twin);
}

/**
 * Armour Rending (AR) (Chapter 6): "The weapon's attacks ignore the
 * listed Armour DR... The AR of a quality weapon increases for each
 * quality step it has. Expert is x2, Master is x3 and Legendary x4."
 * Confirmed against the actual weapon table entries ("AR 1", "AR 2")
 * as always a flat number, no "+" prefix unlike Powerful.
 *
 * @param {string} traits
 * @param {string} quality One of the item-quality tier keys.
 * @returns {number} 0 if the weapon doesn't have AR at all.
 */
export function armourRendingValue(traits, quality) {
  const base = extractTraitValue(traits, "AR");
  if (!base) return 0;
  const multiplier = { expert: 2, master: 3, legendary: 4 }[quality] ?? 1;
  return base * multiplier;
}

/**
 * Penetrating (Chapter 6): "This weapon treats all armour as none
 * when used to make attacks within its first range increment." A
 * ranged-only trait per its own wording (melee weapons have no range
 * increment at all).
 *
 * @param {boolean} hasPenetrating
 * @param {number|null} distance Feet to the target; null if unknown.
 * @param {number} rangeIncrement The weapon's first range increment.
 * @returns {boolean}
 */
export function penetratingApplies(hasPenetrating, distance, rangeIncrement) {
  if (!hasPenetrating || distance === null || distance === undefined) return false;
  if (!rangeIncrement) return false;
  return distance <= Number(rangeIncrement);
}

/**
 * A DR pool after Armour Rending and/or Penetrating apply to it.
 * Confirmed by Graham directly: both traits affect Natural Armour DR
 * the same way they already affected equipped armour DR, so this one
 * shared formula now serves both call sites rather than duplicating
 * the same shape twice.
 *
 * @param {number} pool The DR pool before either trait applies —
 *   equipped armour DR, or Natural Armour DR.
 * @param {number} arValue From armourRendingValue — 0 if the weapon
 *   doesn't have the trait.
 * @param {boolean} penetrating From penetratingApplies — Penetrating
 *   overrides Armour Rending entirely (treats the pool as 0 outright)
 *   rather than the two combining.
 * @returns {number}
 */
export function drAfterRendingAndPenetrating(pool, arValue, penetrating) {
  if (penetrating) return 0;
  return Math.max(0, Math.floor(Number(pool) || 0) - Math.max(0, Math.floor(Number(arValue) || 0)));
}

/**
 * Propulsive (Chapter 6): "You add half your Strength damage
 * modifier (if positive) to damage rolls with a propulsive ranged
 * weapon. If you have a negative Strength damage modifier, you add
 * your full Strength modifier instead." Missile weapons don't add
 * Strength to damage at all by default (see resolveWeaponDamage's own
 * isMelee check) — this is what lets a propulsive one do so.
 *
 * "Half" rounding direction isn't specified in the rulebook — rounds
 * down here, the same default used for Clumsy's half-DC elsewhere in
 * this batch, flagged as an interpretation rather than confirmed.
 *
 * @param {boolean} hasPropulsive
 * @param {number} strengthMod
 * @returns {number}
 */
export function propulsiveStrengthBonus(hasPropulsive, strengthMod) {
  if (!hasPropulsive) return 0;
  const mod = Number(strengthMod) || 0;
  return mod < 0 ? mod : Math.floor(mod / 2);
}

/**
 * Versatile (Chapter 6): "can be used to deal a different type of
 * damage... You must choose the damage type before you make the
 * attack." Confirmed against the actual weapon table entries that
 * only "Versatile S" (slashing) and "Versatile P" (piercing) appear
 * anywhere in this rulebook — deliberately not guessing at other
 * letters that were never actually observed.
 *
 * @param {string} traits
 * @returns {string|null} A damage type key, or null if the weapon
 *   doesn't have Versatile, or has it with an unrecognised letter.
 */
export function extractVersatileType(traits) {
  const match = String(traits ?? "").match(/\bversatile\s*\(?\s*([A-Z])\s*\)?/i);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  return { S: "slashing", P: "piercing" }[letter] ?? null;
}

/**
 * Hand & a Half (Chapter 6): "may also be use two-handed. This
 * increases weapons damage as if it were a size larger." Confirmed
 * against the actual size-category rule this cross-references
 * (Chapter 6, Weapon Sizes): "if such a weapon is used two-handed,
 * your melee damage bonus is multiplied by 1.5" — this is a
 * multiplier on the Strength damage bonus specifically, not a step
 * on the weapon's own base damage die.
 *
 * Rounding direction for the x1.5 isn't specified in the rulebook —
 * rounds down here, the same default used elsewhere in this batch
 * (Clumsy, Propulsive), flagged as an interpretation.
 *
 * @param {boolean} usedTwoHanded
 * @param {number} strengthMod
 * @returns {number}
 */
export function handAndAHalfStrengthBonus(usedTwoHanded, strengthMod) {
  if (!usedTwoHanded) return Number(strengthMod) || 0;
  return Math.floor((Number(strengthMod) || 0) * 1.5);
}

/**
 * A weapon's Fumble DC after everything that lowers it (3.575.0).
 *
 * Two kinds of reduction, because the chapter prints two:
 *   flat     — the Archer's "decreased by 1", with no floor of its own;
 *   floored  — Weapon Mastery and the Balanced superior trait, both
 *              "minimum of 4" (Balanced as many times as it was taken).
 * The floor never RAISES a DC that was already under 4 — it stops a
 * reduction going below it, which is all "minimum" says.
 *
 * @param {number} printed The weapon's own Fumble DC.
 * @param {{flat?: number, floored?: number}} [reductions]
 * @returns {number}
 */
export function effectiveFumbleDC(printed, { flat = 0, floored = 0 } = {}) {
  const raw = Math.floor(Number(printed ?? 5)) - Math.max(0, Math.floor(Number(flat) || 0));
  const cut = Math.max(0, Math.floor(Number(floored) || 0));
  if (!cut) return Math.max(0, raw);
  return Math.max(0, Math.max(Math.min(4, raw), raw - cut));
}

/** Bonus base damage dice from BAB (Combat Damage Table). */
export function bonusDamageDice(bab) {
  const value = Math.floor(Number(bab) || 0);
  if (value >= 24) return 4;
  if (value >= 18) return 3;
  if (value >= 12) return 2;
  if (value >= 6) return 1;
  return 0;
}

/**
 * The bonus damage dice a critical adds, by severity (page 203's own
 * table: Minor +1, Serious +2, Deadly +3).
 */
export const CRITICAL_BONUS_DICE = Object.freeze({ minor: 1, serious: 2, deadly: 3 });

/**
 * THE CRITICAL BONUS DICE ARE PRECISION DAMAGE (page 203; Graham's R4
 * of 21 September 2026).
 *
 *   "Bonus Damage: A critical hit adds bonus damage of your primary
 *    damage type (after BAB modification). This damage is precision
 *    damage in type."
 *
 * Both halves of that sentence matter. The dice are of the WEAPON's
 * type, so a fire-resistant creature resists a flaming sword's critical
 * the way it resists the rest of it — which is why they stay in the
 * weapon's own damage expression rather than becoming a packet of their
 * own. But they COUNT AS precision, so a creature immune to precision
 * takes none of them, and one resisting it takes half.
 *
 * Until 3.580.0 they were indistinguishable from base and BAB dice, so
 * a Rat Swarm and a ghost — the two creatures in the book the precision
 * immunity exists for — took every critical in full while shrugging off
 * a Rogue's Sneak Attack beside it.
 *
 * HALVED AS DICE, not as damage, for the same reason Sneak Attack's are:
 * they are folded into one rolled expression and cannot be told apart
 * afterwards. Half the dice is half the damage on average, which is what
 * a resistance is.
 *
 * @param {string|null} critical the severity, or null for a plain hit
 * @param {object} [state]
 * @param {boolean} [state.immune]
 * @param {boolean} [state.resisted]
 * @returns {number}
 */
export function criticalPrecisionDice(critical, { immune = false, resisted = false } = {}) {
  const dice = CRITICAL_BONUS_DICE[String(critical ?? "").toLowerCase()] ?? 0;
  if (!dice || immune) return 0;
  return resisted ? Math.floor(dice / 2) : dice;
}

/**
 * Builds the final damage roll formula for a weapon attack, folding
 * in quality's per-die damage bonus and material's extra-die/die-step
 * effects (Chapter 6's Item Quality and Special Materials).
 *
 * The quality per-die bonus multiplies against base + BAB + critical
 * dice specifically — confirmed directly, including that critical
 * bonus dice count toward it. Material-granted extra dice (Adamantine,
 * Eaog) are a separate addition to the dice count, not folded into
 * that same multiplication.
 *
 * @param {string} baseDamage e.g. "1d8".
 * @param {object} [options]
 * @param {number} [options.bab]
 * @param {"minor"|"serious"|"deadly"|null} [options.critical]
 * @param {string} [options.quality] One of QUALITY_TIERS' keys.
 * @param {string} [options.material] One of MATERIALS' keys, or "".
 * @param {string} [options.superiorTraits] Comma-separated trait keys.
 * @param {number} [options.mightyBonus] Mighty (Chapter 6): "On a
 *   critical hit, the weapon's base damage increases by this
 *   amount" — flat, and only applied when critical is actually set.
 * @param {number|null} [options.criticalDice] How many critical bonus
 *   dice to fold in, overriding the severity's own count. The critical
 *   dice are PRECISION damage (page 203), so a target immune to
 *   precision takes none of them and one resisting it takes half —
 *   decided by the caller, which is where the target's defences are
 *   known. See `criticalPrecisionDice`.
 * @returns {string} A Roll-ready formula, e.g. "2d8+2".
 */
/**
 * THE ITEM BONUS A WEAPON'S QUALITY ALREADY ADDS TO A DAMAGE ROLL — its
 * per-die bonus times the dice it rolls (3.617.0, Graham's R3 of block 37).
 * An ammunition's or an unguent's item bonus to damage does not stack with
 * it: the higher stands. Read through the same arithmetic the formula below
 * uses, so the two cannot disagree.
 *
 * @returns {number}
 */
export function weaponQualityDamageBonus(baseDamage, {
  bab = 0, critical = null, quality = "standard", material = "", superiorTraits = "", criticalDice = null
} = {}) {
  const match = String(baseDamage || "1d6").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) return 0;
  const count = Number(match[1] || 1);
  const dice = bonusDamageDice(bab);
  // The same override rule as buildWeaponDamageFormula's (null is "none given").
  const critDice = criticalDice == null ? (CRITICAL_BONUS_DICE[critical] ?? 0) : Math.max(0, Math.floor(Number(criticalDice) || 0));
  const mods = computeWeaponModifiers(quality, material, parseGrantList(superiorTraits));
  return Math.max(0, mods.damageBonusPerDie * (count + dice + critDice));
}

/**
 * Two item bonuses to one damage roll take the higher (R3): what the second
 * adds over the first, never less than nothing.
 */
export function itemDamageExcess(bonus, existing) {
  return Math.max(0, Math.floor(Number(bonus) || 0) - Math.max(0, Math.floor(Number(existing) || 0)));
}

export function buildWeaponDamageFormula(
  baseDamage,
  {
    bab = 0, critical = null, quality = "standard", material = "", superiorTraits = "",
    mightyBonus = 0, criticalDice = null, quickDamage = false
  } = {}
) {
  const base = String(baseDamage || "1d6");
  const match = base.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) return base;

  const count = Number(match[1] || 1);
  let faces = Number(match[2]);
  const existingFlat = match[3] ? Number(match[3]) : 0;

  const dice = bonusDamageDice(bab);
  // `Number(null)` IS 0 AND 0 IS FINITE, so the override cannot be
  // detected by asking whether it is a number — that reads "no override"
  // as "no critical dice" and silently deletes the critical from every
  // damage roll in the game.
  const critDice = criticalDice === null || criticalDice === undefined
    ? (CRITICAL_BONUS_DICE[critical] ?? 0)
    : Math.max(0, Math.floor(Number(criticalDice) || 0));

  const mods = computeWeaponModifiers(quality, material, parseGrantList(superiorTraits));

  const qualityDiceCount = count + dice + critDice;
  const qualityBonus = mods.damageBonusPerDie * qualityDiceCount;
  // QUICK DAMAGE (page 204, optional; R12): the BAB and critical dice
  // become a flat number from the page's own table, and the weapon's own
  // base dice go on being rolled. The quality per-die bonus is computed
  // from the count ABOVE, before the swap, so a Masterwork weapon is
  // worth the same either way — the option is meant to save time, not
  // damage.
  const rolledExtra = quickDamage ? 0 : dice + critDice;
  const totalDice = count + rolledExtra + mods.extraDice;

  if (mods.damageDieStepDown) {
    faces = stepDownDieSize(faces, mods.damageDieStepDown);
  }

  // AFTER THE STEP-DOWN, because the flat number stands in for a die that
  // would have been rolled and a stepped-down weapon rolls the smaller one.
  const staticExtra = quickDamage ? (dice + critDice) * quickDamageStatic(faces) : 0;

  const mightyFlat = critical ? Number(mightyBonus || 0) : 0;
  const totalFlat = existingFlat + qualityBonus + mightyFlat + staticExtra;
  const flat = totalFlat !== 0 ? (totalFlat > 0 ? `+${totalFlat}` : `${totalFlat}`) : "";
  return `${totalDice}d${faces}${flat}`;
}

/**
 * Critical severity bands. Critical Resistance raises the AV each band
 * requires: with CR 1, a minor critical needs AV 6+, serious 16+, and so on.
 *
 * The Deadly weapon trait (Chapter 6: "The increment between the
 * severity of a critical is reduced by 1 when attacking with this
 * weapon") is genuinely ambiguous as written — no worked example
 * exists to check against. Read here as: the gap between tiers
 * (normally a constant 10 AV: 5/15/25) becomes 9, applied
 * cumulatively from the Minor threshold — Minor stays at 5 (there's
 * no prior tier for an "increment between" to apply to), Serious
 * becomes 14, Deadly becomes 23. This is an interpretation, not a
 * confirmed reading — worth flagging directly rather than presenting
 * as settled.
 *
 * @param {number} av Attack Value (result - DB).
 * @param {number} [criticalResistance]
 * @param {number} [severityIncrement] Gap between tiers; 10 normally,
 *   9 with the Deadly weapon trait.
 * @returns {{severity: string, diceBias: string, bonusDice: number}|null}
 */
export function criticalSeverity(av, criticalResistance = 0, severityIncrement = 10, thresholdShift = 0) {
  const value = Math.floor(Number(av) || 0);
  const cr = Math.max(0, Math.floor(Number(criticalResistance) || 0));
  const increment = Math.floor(Number(severityIncrement) || 10);
  // MODES OF LETHALITY (page 204, optional; R14's neighbour R13): "simply
  // increase the AV required to inflict criticals… you may decrease the
  // AV required." It moves the ENTRY POINT, and the bands ride on it —
  // which is why it is added to the base and not to each comparison
  // separately. A shift of +2 gives 7/17/27; -2 gives 3/13/23.
  const base = 5 + Math.trunc(Number(thresholdShift) || 0);
  const effective = value - cr;

  if (effective >= base + increment * 2) {
    return { severity: "deadly", diceBias: "advantage", bonusDice: 3 };
  }
  if (effective >= base + increment) {
    return { severity: "serious", diceBias: "normal", bonusDice: 2 };
  }
  if (effective >= base) {
    return { severity: "minor", diceBias: "disadvantage", bonusDice: 1 };
  }
  return null;
}

/**
 * QUICK DAMAGE (page 204, optional; Graham's R12 of 21 September 2026).
 *
 *   "To speed up the game, you may wish to add extra dice of damage as
 *    static damage as well. If this is the case, please use the below
 *    table to apply extra damage in place of dice."
 *
 * The page's own table, transcribed: 1d2 is 1, 1d3 is 2, 1d4 is 3, 1d6
 * is 4, 1d8 is 5, 1d10 is 6, 1d12 is 7.
 *
 * EXTRA DICE, NOT ALL DICE. "in place of dice" follows "add extra dice
 * of damage as static damage" — the weapon's own base damage is still
 * rolled, and it is the BAB and critical dice piled on top of it that
 * become a flat number. That is where the table time goes, and taking
 * the weapon's own die away would leave a Strike with no roll at all.
 */
export const QUICK_DAMAGE_TABLE = Object.freeze({
  2: 1, 3: 2, 4: 3, 6: 4, 8: 5, 10: 6, 12: 7
});

/**
 * One extra die of this size, as a flat number.
 *
 * A die the table does not list (a d20 natural attack, say) answers its
 * own average rounded down, which is the rule the printed rows follow
 * exactly — 1d6 averages 3.5 and the table says 4, one better than the
 * floor, so the printed value is (faces / 2) + 1 for every row. The
 * fallback uses that same formula rather than inventing a second one.
 *
 * @param {number} faces
 * @returns {number}
 */
export function quickDamageStatic(faces) {
  const size = Math.max(1, Math.trunc(Number(faces) || 0));
  return QUICK_DAMAGE_TABLE[size] ?? Math.max(1, Math.floor(size / 2) + 1);
}

/**
 * ARMOUR-GRANTED CRITICAL RESISTANCE IS BYPASSED BY A NAMED LOCATION
 * (page 203; Graham's R5 of 21 September 2026).
 *
 *   "To make armoured characters a little sturdier, you may grant them
 *    CR… It also important to note that when using this rule, if an
 *    attack targets a specific part of the body (ambush, vital strike),
 *    then CR is bypassed if no armour is worn at that location."
 *
 * Only the ARMOUR's portion. A Construct's 4 and a Critical Resilience
 * feat's 1 are the creature's own and are not what the paragraph is
 * about — it is the optional rule qualifying itself, which is why
 * `documents/actor.mjs` records `armourCriticalResistance` separately
 * from the total in the first place. It recorded it, said in a comment
 * that this was what the field was for, and then nothing read it until
 * 3.580.0.
 *
 * @param {object} state
 * @param {number} [state.criticalResistance] the target's total
 * @param {number} [state.armourCriticalResistance] the armour's share
 * @param {string|null} [state.declaredLocation] the location the attack
 *   named, or null when it named none
 * @param {boolean} [state.locationArmoured] whether armour covers it
 * @returns {{criticalResistance: number, bypassed: number}}
 */
export function armourCRBypass({
  criticalResistance = 0, armourCriticalResistance = 0,
  declaredLocation = null, locationArmoured = true
} = {}) {
  const total = Math.max(0, Math.floor(Number(criticalResistance) || 0));
  const fromArmour = Math.max(0, Math.floor(Number(armourCriticalResistance) || 0));
  if (!declaredLocation || locationArmoured || !fromArmour) {
    return { criticalResistance: total, bypassed: 0 };
  }
  const bypassed = Math.min(total, fromArmour);
  return { criticalResistance: total - bypassed, bypassed };
}

/**
 * Injury Duration (Chapter 7, Healing & Criticals): when a critical
 * result's Persistence is "Duration (D)" — "the injury persists for an
 * amount of time which will be determined by the severity of the
 * critical" — this is the dice formula to roll for how many rounds.
 * Minor 1d4, Serious 1d6+2, Deadly 1d10+5.
 */
export const INJURY_DURATION_FORMULA = Object.freeze({
  minor: "1d4",
  serious: "1d6+2",
  deadly: "1d10+5"
});

export function injuryDurationFormula(severity) {
  return INJURY_DURATION_FORMULA[severity] ?? null;
}

/**
 * Persistence (Chapter 7, Healing & Criticals) resolved to something
 * that can actually be auto-expired by round-counting, where that's
 * safe to do:
 *
 * - "M" (Minimal Effect): lasts until the end of the target's next
 *   turn — a fixed, short duration.
 * - "D" (Duration): rolls dice keyed to critical severity (see
 *   injuryDurationFormula) to determine the number of rounds.
 * - "UH" (Until Healed), "FR" (Full Rest), "P" (Permanent): none of
 *   these are round-counted at all — they're tied to HP restoration,
 *   a full night's rest, or GM-judged specific healing. Auto-expiring
 *   these by turn count would be simply wrong, so they're left to
 *   persist until removed by hand, exactly as this system already
 *   handles every other condition without a built-in timer.
 * - "-" or a Death/Fatal descriptor: no persistence to track here —
 *   either no lasting effect, or (per the rulebook's own note) a
 *   condition with its own separate duration rules (Bleeding,
 *   Recurring Damage, Sickened) that doesn't use this column's rules
 *   at all.
 *
 * @param {string} persistenceCode
 * @param {"minor"|"serious"|"deadly"} [severity]
 * @returns {{autoExpires: boolean, rounds: number|null, rollFormula: string|null}}
 */
export function computePersistenceRounds(persistenceCode, severity) {
  const code = String(persistenceCode ?? "").trim().toUpperCase();
  if (code === "M") {
    return { autoExpires: true, rounds: 1, rollFormula: null };
  }
  if (code === "D") {
    const formula = injuryDurationFormula(severity);
    return { autoExpires: Boolean(formula), rounds: null, rollFormula: formula };
  }
  return { autoExpires: false, rounds: null, rollFormula: null };
}

/**
 * Wade Through the Mooks (Chapter 7, optional rule): a simplified
 * critical-hit table for Minor Creatures (MNPCs), replacing the full
 * critical injury table with a flat HP-multiplier result to keep mass
 * combat moving. "Kill" means the mook drops immediately, no save.
 *
 * The row printed as "11-15" in the extracted source is a transcription
 * defect — confirmed against the source as "11-25", making the table
 * contiguous through 65. 66 isn't a gap either: the rulebook's own
 * table lists it as "Chaos | See Chaos Result above", the same
 * unmodified-66 trigger used on every other critical table, handled by
 * the workflow rather than this lookup.
 */
export const QUICK_CRIT_TABLE = Object.freeze([
  { min: 1, max: 10, minor: null, serious: 1, deadly: 3 },
  { min: 11, max: 25, minor: 1, serious: 2, deadly: 4 },
  { min: 26, max: 50, minor: 1, serious: 3, deadly: 5 },
  { min: 51, max: 65, minor: 2, serious: 4, deadly: "kill" },
  { min: 67, max: 80, minor: 3, serious: 5, deadly: "kill" },
  { min: 81, max: 90, minor: 4, serious: "kill", deadly: "kill" },
  { min: 91, max: 95, minor: 5, serious: "kill", deadly: "kill" },
  { min: 96, max: 100, minor: "kill", serious: "kill", deadly: "kill" }
]);

/**
 * @param {number} roll d100 result.
 * @param {string} severity "minor" | "serious" | "deadly"
 * @returns {number|"kill"|null} The base-damage multiplier, "kill" for
 *   an instant drop, or null if this roll has no effect at this severity
 *   (Minor's own 01-10 row).
 */
export function quickCritResult(roll, severity) {
  const row = lookupTableRow(QUICK_CRIT_TABLE, roll);
  if (!row) return null;
  return row[severity] ?? null;
}


/**
 * Wound Threshold penalties (Chapter 7): a Minor Creature's remaining
 * HP percentage determines a status penalty to attack rolls, defence
 * checks, and other relevant actions. Healthy (76-100%) 0, Grazed
 * (51-75%) -1, Wounded (26-50%) -2, Critical (1-25%) -3.
 */
export function woundThresholdPenalty(hpPercent) {
  const pct = Math.max(0, Number(hpPercent) || 0);
  if (pct <= 0) return -3;
  if (pct <= 25) return -3;
  if (pct <= 50) return -2;
  if (pct <= 75) return -1;
  return 0;
}

/**
 * Resolve an attack roll against a DB.
 *
 * @param {object} options
 * @param {number} options.unmodified The first d20 face.
 * @param {number} options.total Final check total including all modifiers.
 * @param {number|null} [options.db] Target's Defensive Bonus, if known.
 * @param {boolean} [options.proficient] Proficiency with the weapon.
 * @param {number} [options.criticalResistance] Target's CR.
 * @param {boolean} [options.criticalImmune] Target ignores criticals.
 * @param {boolean} [options.glancingRule] Optional glancing blow rule active.
 * @returns {object}
 */
export function attackOutcome({
  unmodified,
  total,
  db = null,
  proficient = true,
  criticalResistance = 0,
  criticalImmune = false,
  glancingRule = false,
  keen = false,
  // RAZOR (Chapter 11) raises the AV a critical is read at, exactly as
  // Keen does — "a critical if the AV is 3+ instead of the usual 4+ for
  // a Keen weapon" — so it arrives as a further step on the same scale
  // rather than as a second, parallel rule.
  razorAV = 0,
  deadly = false,
  clumsy = false,
  missForgiveness = 0,
  // MODES OF LETHALITY (page 204, optional; R13). 0 in every game that
  // has not turned the setting on, which is the printed 5/15/25.
  criticalThresholdShift = 0
} = {}) {
  const face = Math.floor(Number(unmodified) || 0);
  const hasDB = db !== null && db !== undefined && Number.isFinite(Number(db));

  // Non-proficiency: -4 to the attack is applied by the caller as a modifier;
  // here it widens the fumble window to UM 1-2.
  const fumbleWindow = proficient ? 1 : 2;
  const fumbleRisk = face <= fumbleWindow;

  // Clumsy (Chapter 6): "if an UM 2 is rolled, this may also be a
  // fumble check with the DC being half of the listed value" —
  // untrained use pushes this same extra face to UM 3. Confirmed the
  // rulebook's own wording keeps the base window's fumble check at
  // full DC; only this one extra face beyond it uses half.
  const clumsyExtraFace = fumbleWindow + 1;
  const clumsyFumbleRisk = clumsy && face === clumsyExtraFace;
  const fumbleDcHalved = clumsyFumbleRisk;

  // "an unmodified 1 on an attack check ... always misses (regardless of the
  // AV). Furthermore, an unmodified 20 ... always hits."
  const autoMiss = face === 1;
  const autoHit = face === 20;

  if (!hasDB) {
    return {
      resolved: false,
      autoMiss,
      autoHit,
      fumbleRisk: fumbleRisk || clumsyFumbleRisk,
      fumbleWindow,
      fumbleDcHalved,
      av: null,
      hits: autoHit ? true : autoMiss ? false : null,
      critical: null,
      glancing: false,
      forgiven: false
    };
  }

  const av = Number(total) - Number(db);
  // Weapon Supremacy (Fighter, 13th): "you treat a miss by 1 as a hit"
  // (2 at 19th) — the caller reports how much forgiveness applies, since
  // the group match and the no-disadvantage clause live with the weapon
  // and the roll. An unmodified 1 still always misses: autoMiss below
  // overrides the widened test exactly as it overrides an ordinary hit.
  const forgiveness = Math.max(0, Math.floor(Number(missForgiveness) || 0));
  let hits = av >= -forgiveness;
  const forgiven = hits && av < 0;
  if (autoMiss) hits = false;
  if (autoHit) hits = true;

  // Keen (Chapter 6): "increase the weapon's AV by 1 (after all other
  // modifiers)" — for critical determination only, not the base
  // hit/miss check above, which already used the unmodified av.
  const criticalAV = (keen ? av + 1 : av) + Math.max(0, Math.floor(Number(razorAV) || 0));

  /*
   * CRITICAL IMMUNITY NO LONGER ERASES THE CRITICAL (3.548.0).
   *
   * Graham's ruling, 10 Sep 2026: a creature immune to critical hits
   * "takes HP damage from a critical injury but otherwise ignores any
   * other effects resulting from the critical injury roll (so against
   * such a creature the critical injury roll would be bypassed)."
   *
   * Until this release `criticalImmune` returned null, which discarded
   * the bonus damage dice along with the injury — a Deadly critical
   * against a Swarm or an Ooze landed as an ordinary hit and lost 3
   * dice. The immunity is to the INJURY, not to the blow having been
   * well struck.
   *
   * So the severity is still read, and carries `injuryImmune` for the
   * one consumer that must change behaviour: whoever rolls on the injury
   * table. Every other consumer — the bonus dice, the card's severity
   * label, Press the Advantage — is right to go on working.
   */
  const criticalRolled =
    hits && !autoMissOnly(autoMiss)
      ? criticalSeverity(criticalAV, criticalResistance, deadly ? 9 : 10, criticalThresholdShift)
      : null;
  const critical = criticalRolled
    ? { ...criticalRolled, injuryImmune: Boolean(criticalImmune) }
    : null;

  // Optional rule: AV 0-1 is a glancing blow for half damage (round up).
  const glancing = Boolean(glancingRule && hits && !autoHit && av >= 0 && av <= 1);

  return {
    resolved: true,
    autoMiss,
    autoHit,
    fumbleRisk: fumbleRisk || clumsyFumbleRisk,
    fumbleWindow,
    fumbleDcHalved,
    av,
    hits,
    critical,
    glancing,
    // True only when Weapon Supremacy is the reason this hit at all —
    // the card names it, so the table can see the ability working.
    forgiven: forgiven && hits
  };
}

function autoMissOnly(autoMiss) {
  return autoMiss;
}

/**
 * Find the row of a d100 table matching a roll. Rolls above the table's top
 * clamp to the final row; a roll landing in a source gap (the missing 33 in
 * eleven tables) falls back to the nearest lower row.
 *
 * @param {Array<{min: number, max: number}>} table
 * @param {number} roll
 * @returns {object|null}
 */
export function lookupTableRow(table, roll) {
  if (!Array.isArray(table) || !table.length) return null;
  const value = Math.floor(Number(roll) || 0);
  const sorted = [...table].sort((a, b) => a.min - b.min);

  if (value >= sorted[sorted.length - 1].min) return sorted[sorted.length - 1];
  if (value < sorted[0].min) return sorted[0];

  let candidate = sorted[0];
  for (const row of sorted) {
    if (row.min > value) break;
    candidate = row;
    if (value <= row.max) return row;
  }
  // Source gap: nearest lower row.
  return candidate;
}

/**
 * Death and Fatal critical descriptors (Chapter 7): the target may make a
 * saving throw against the Injury DC — Hard (+2) for Fatal, Very Hard (+5)
 * for Death — to lower the critical result by 10. Injury DC = attack bonus
 * + 10. Mental criticals save with Will; everything else Fortitude.
 *
 * @param {object} row A critical table row.
 * @param {string} damageType
 * @param {number} attackBonus
 * @returns {{descriptor: string, save: string, dc: number,
 *   reduction: number}|null}
 */
export function deathOrFatalSave(row, damageType, attackBonus) {
  const persistence = String(row?.persistence ?? "");
  const isDeath = /death/i.test(persistence);
  const isFatal = /fatal/i.test(persistence);
  if (!isDeath && !isFatal) return null;

  const injuryDC = Number(attackBonus || 0) + 10;
  return {
    descriptor: isDeath ? "Death" : "Fatal",
    save: damageType === "mental" ? "will" : "fortitude",
    dc: injuryDC + (isDeath ? 5 : 2),
    reduction: 10
  };
}

/** Chaos on a critical injury roll: an unmodified 66. */
export const CRITICAL_CHAOS_FACE = 66;

/** The chaos replacement: 1d30+70 as the result, plus a fumble roll and 1 conviction regained. */
export function criticalChaosReplacement(d30) {
  return {
    result: 70 + Math.max(1, Math.min(30, Math.floor(Number(d30) || 1))),
    rollFumble: true,
    conviction: 1
  };
}

/**
 * Hidden/Concealed miss chance (Appendix 2): "If you are struck by a
 * creature that you are hidden from with a targeted spell or effect,
 * you may make a DC 10 Flat Check. If the check succeeds, the attack,
 * spell, or effect doesn't affect you." Concealed uses DC 17. Neither
 * applies to area effects, per both conditions' own wording.
 */
export const MISS_CHANCE_DC = Object.freeze({
  hidden: 10,
  concealed: 17,
  /*
   * INVISIBLE IS THE HIDDEN TREATMENT, AND THAT IS PRINTED (3.597.0,
   * Graham's R12).
   *
   * The Appendix says an invisible creature is undetected; a creature who
   * Searches it out has it hidden; and one who has not "can take a chance
   * and guess your location… This works like targeting a hidden creature
   * (requiring a DC 10 flat check)." Both branches are 10, so there was
   * never a third number to choose. See combat/invisibility.mjs.
   */
  invisible: 10
});

/**
 * The flat check DC for a targeted attack on this creature, or null.
 *
 * ROLL ONCE, AT THE HIGHEST DC — page 64: "If more than one flat check
 * would ever cause or prevent the same thing, just roll once using the
 * highest DC." So a creature with two of these conditions does not roll
 * twice and does not get to pick; `verify-chapter4` E4 has pinned that
 * since the chapter blocks, and 3.597.0 widened this function WITHOUT
 * touching it. My first draft of R12 took the LOWEST DC, on the reasoning
 * that more concealment should never protect you less — the check refused
 * it, and the check was right: page 64 says what it says.
 *
 * SEE INVISIBLE CHANGES WHAT `invisible` CONTRIBUTES rather than whether
 * the check happens, which is why the level is a parameter here instead of
 * a guard at the call site. A rule hand-rolled at its call site is the
 * defect shape this project has found most often.
 */
export function missChanceDC({
  hidden = false, concealed = false, invisible = false, seeInvisible = null
} = {}) {
  /*
   * COLLECTED THEN COMPARED, rather than folded one at a time. The fold I
   * wrote first carried a `value == null` guard that COULD NOT CHANGE AN
   * ANSWER — `null > 17` and `dc === null ? null : …` both leave the result
   * alone — so the mutation that removed it survived, and a guard no
   * mutation can break is a guard nobody has tested. Here the filter is
   * load-bearing: without it a lone `null` contribution reaches `Math.max`
   * and comes back as 0, which is a flat check on a 1.
   */
  const contributions = [];
  if (concealed) contributions.push(MISS_CHANCE_DC.concealed);
  if (hidden) contributions.push(MISS_CHANCE_DC.hidden);
  if (invisible) contributions.push(invisibleAvoidanceDC(seeInvisible));
  const real = contributions.filter((value) => value != null);
  return real.length ? Math.max(...real) : null;
}

/**
 * What the `invisible` condition is worth against an attacker with this
 * level of See Invisible — DC 10 normally, the concealed DC once the spell
 * reads it as concealed, and NOTHING once the +4 PP option sees it clearly.
 */
export function invisibleAvoidanceDC(seeInvisible = null) {
  if (seeInvisible === "clear") return null;
  if (seeInvisible === "concealed") return MISS_CHANCE_DC.concealed;
  return MISS_CHANCE_DC.invisible;
}
