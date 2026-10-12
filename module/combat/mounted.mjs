/**
 * MOUNTED — a state the rules name and the system never held (3.576.0).
 *
 * Pure; no Foundry. The Mount / Dismount action sets and clears it
 * (combat/action-workflow.mjs), and the attack path asks it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO WEAPONS DEPEND ON IT, and the pages 161-170 audit found neither
 * enforceable because nothing recorded whether anybody was riding:
 *
 *   LANCE              "the lance can only be effectively wielded while
 *                       the user is mounted on a horse"
 *   COMPOSITE LONGBOW  "this weapon cannot be used whilst mounted"
 *
 * Graham, 19 September 2026 (R4): a Mounted state, set and cleared by
 * Mount / Dismount, that gates both.
 *
 * WHERE THE FACT LIVES. The weapon declares it — `system.mountedUse`,
 * "required" or "forbidden", set in the pack for those two by
 * tools/data-fixes.json — rather than being recognised by name. The
 * rider carries the state as a flag naming the mount, so the sheet can
 * say what they are sitting on.
 */

/** The actor flag that holds it. */
export const MOUNTED_FLAG = "mounted";

const SYSTEM_ID = "trg-prime";

/**
 * Is this actor mounted, and on what?
 *
 * @param {object} actor anything with `flags`
 * @returns {{mounted: boolean, mount: string}}
 */
export function mountedState(actor) {
  const raw = actor?.flags?.[SYSTEM_ID]?.[MOUNTED_FLAG];
  if (!raw) return { mounted: false, mount: "", steed: null };
  return {
    mounted: true,
    mount: String(raw?.mount ?? "").trim(),
    // WHICH CREATURE (3.577.0), as an actor handle, so the steed can be
    // found again when a combat begins (R8). Null for a state set before
    // this release, or with nothing targeted.
    steed: raw?.steed ?? null
  };
}

/**
 * What a successful Mount / Dismount leaves behind.
 *
 * ONE ACTION, TWO DIRECTIONS, as the book prints it: "Mount the creature
 * and ride it, or dismount if already mounted." So the current state
 * decides — a rider dismounts, anyone else mounts.
 *
 * @param {{mounted: boolean}} current from `mountedState`
 * @param {string} [mountName] the creature being mounted, if targeted
 * @param {object|null} [steedHandle] its actor handle (actor-handle.mjs)
 * @returns {{mount: string, steed?: object}|null} the new flag value; null to clear it
 */
export function mountedAfterSuccess(current, mountName = "", steedHandle = null) {
  if (current?.mounted) return null;
  return {
    mount: String(mountName ?? "").trim(),
    ...(steedHandle ? { steed: steedHandle } : {})
  };
}

/**
 * Why this weapon cannot be used right now, or null.
 *
 * @param {object} weaponSystem
 * @param {boolean} mounted
 * @param {string} [weaponName]
 * @returns {string|null}
 */
export function mountedWeaponRefusal(weaponSystem, mounted, weaponName = "This weapon") {
  const use = String(weaponSystem?.mountedUse ?? "").trim().toLowerCase();
  if (use === "required" && !mounted) {
    return `${weaponName} can only be wielded while mounted — use Mount / Dismount first.`;
  }
  if (use === "forbidden" && mounted) {
    return `${weaponName} cannot be used whilst mounted.`;
  }
  return null;
}

/* ────────────────────── falling out of the saddle ────────────────────── */

/**
 * Does this result put the rider on the ground? (3.577.0; block 17, D9.)
 *
 *   Stay in Saddle     Failure: "You fall out of the saddle."
 *   Guide with Knees   Fumble: "You fall out of the saddle and land prone."
 *
 * Until 3.577.0 neither touched the Mounted state R4 created, so a rider
 * lying prone in the mud could still couch a Lance and was still refused
 * the Composite Longbow.
 *
 * @param {string} actionKey
 * @param {string} degree
 * @returns {boolean}
 */
export function fallsFromSaddle(actionKey, degree) {
  const d = String(degree ?? "").trim().toLowerCase();
  if (actionKey === "stayInSaddle") return ["failure", "fumble", "blunder"].includes(d);
  if (actionKey === "guideWithKnees") return ["fumble", "blunder"].includes(d);
  return false;
}

/* ─────────────────────────── skittish steeds ─────────────────────────── */

/**
 * MOUNTS & ANIMALS (page 176; 3.577.0, Graham's R8 of the block-17 audit):
 *
 *   "Any animal intelligence steed immediately gains the fleeing and
 *    frightened 4 conditions when a combat begins. You may use Command an
 *    Animal and Ride actions (Handle Animal) to calm the creature.
 *    Non-animal mounts and military mounts do not suffer from this issue."
 *
 * READINGS, as agreed: "animal intelligence" is Intelligence −4 or lower;
 * an animal companion is a trained mount and is exempt; a military mount
 * is one whose sheet is ticked as such; a successful Command an Animal
 * calms it.
 */
export const MILITARY_MOUNT_FLAG = "militaryMount";
/** Set on a steed this rule frightened, so calming it removes only that. */
export const STEED_PANIC_FLAG = "steedPanicked";
export const STEED_PANIC = Object.freeze({ frightened: 4, fleeing: true });
const ANIMAL_INTELLIGENCE_MAX = -4;

/**
 * Does this steed panic when combat begins?
 *
 * @param {object} steed
 * @param {string} steed.actorType "npc", "companion", ...
 * @param {string} steed.creatureType its details.creatureType
 * @param {number} steed.intelligence its Intelligence total
 * @param {boolean} steed.military ticked as a military mount
 * @returns {boolean}
 */
export function steedPanics({ actorType = "", creatureType = "", intelligence = 0, military = false } = {}) {
  if (military) return false;
  if (String(actorType).trim().toLowerCase() === "companion") return false;
  if (String(creatureType).trim().toLowerCase() !== "animal") return false;
  return Number(intelligence) <= ANIMAL_INTELLIGENCE_MAX;
}

/**
 * Does this Command an Animal calm a steed that panicked?
 *
 * @param {string} actionKey
 * @param {string} degree
 * @param {boolean} panicked the target carries STEED_PANIC_FLAG
 * @returns {boolean}
 */
export function calmsSteed(actionKey, degree, panicked) {
  if (!panicked || actionKey !== "commandAnAnimal") return false;
  return ["success", "critical", "heroic"].includes(String(degree ?? "").trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Mounted combat (page 200) — new at 3.579.0                          */
/* ------------------------------------------------------------------ */

/*
 * THE REST OF PAGE 200, for the block-19 audit's D13 and Graham's R13 of
 * 21 September 2026: "All of it."
 *
 * Until now Mounted was a flag that gated two weapons and nothing else.
 * The page makes a rider and a mount "a single entity" for four things —
 * one AP pool, one multiple attack penalty, one space, one initiative —
 * and adds a bonus and a cover clause on top. Each is a function here and
 * a wiring in the workflow beside it.
 */

/**
 * Shared AP: "a combined pool of action points, which is determined by
 * the character with the lowest amount of action points between you."
 *
 * @param {number} riderAP
 * @param {number} mountAP
 * @returns {number}
 */
export function sharedActionPoints(riderAP, mountAP) {
  const a = Math.max(0, Math.floor(Number(riderAP) || 0));
  const b = Math.max(0, Math.floor(Number(mountAP) || 0));
  return Math.min(a, b);
}

/**
 * Shared space and reach: "you occupy all the squares within your mount's
 * space when making your attacks… you can attack a creature with a reach
 * of 10 feet rather than 5 feet (assuming of course that your mount does
 * not have reduced reach)."
 *
 * THE LONGER OF THE TWO, which is what that parenthesis asks for: a rider
 * on a mount with a shorter reach than their own keeps their own.
 *
 * @param {number} riderReach
 * @param {number} mountReach
 * @returns {number}
 */
export function mountedReach(riderReach, mountReach) {
  const rider = Math.max(0, Number(riderReach) || 0);
  const mount = Math.max(0, Number(mountReach) || 0);
  return Math.max(rider, mount);
}

/** "You gain a +2-circumstance bonus to all attack checks against unmounted targets whilst mounted." */
const MOUNTED_ATTACK_BONUS = 2;

/**
 * The bonus, if it applies.
 *
 * @param {boolean} attackerMounted
 * @param {boolean} targetMounted
 * @returns {number}
 */
export function mountedAttackBonus(attackerMounted, targetMounted) {
  return attackerMounted && !targetMounted ? MOUNTED_ATTACK_BONUS : 0;
}

/**
 * Mounted defence: "potential attackers have the option to target either
 * you or your mount… you have lesser cover against attacks targeting you
 * when you're mounted if the mount would be in the way."
 *
 * OFFERED, NOT APPLIED. Whether the mount is in the way is a look at the
 * board, which is the GM's; the attack card says both halves and lets
 * them choose. Graham's R13 asked for exactly this shape.
 *
 * @param {object} state
 * @param {string} state.riderName
 * @param {string} state.mountName
 * @returns {string} the card's sentence, or ""
 */
export function mountedDefenceOffer({ riderName = "", mountName = "" } = {}) {
  if (!riderName || !mountName) return "";
  return `<strong>${riderName} is mounted on ${mountName}.</strong> You may target the mount instead; `
    + `and if ${mountName} is in the way, ${riderName} has lesser cover (+2 circumstance DB) against this attack.`;
}

/**
 * "It is necessary for your mount to be at least one size larger than
 * you and willing to be ridden."
 *
 * @param {number} sizeStepsLargerThanRider from combat/space.mjs's `sizeSteps`
 * @returns {boolean}
 */
export function mountSizeAllowed(sizeStepsLargerThanRider) {
  return Number(sizeStepsLargerThanRider) >= 1;
}
