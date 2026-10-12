/**
 * THE SHAPE OF A SPEED — and the only place that knows it.
 *
 * NEW at 3.412.1. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: 3.412.0 CHANGED A STORED SHAPE AND NOBODY OWNED IT.
 *
 * At 3.412.0 each speed stopped being a bare number and became a bonus
 * pool, `{base, item, status, circumstance, other, total}`, so that a
 * typed bonus aimed at Speed could actually land. The mechanism worked.
 * The migration was written. The harness passed.
 *
 * It shipped with FOUR defects, and they are one defect wearing four
 * coats: nine call sites each read the shape for themselves, so changing
 * the shape meant changing nine minds, and I changed four.
 *
 *   A  THE MIGRATION WAS NEVER OFFERED. `TRG_SCHEMA_VERSION` still said
 *      3.312.0, so `checkWorldMigration` compared 3.312.0 against a world
 *      already at 3.312.0, found nothing newer, and returned. The
 *      constant's own doc comment says to raise it when the stored layout
 *      changes. template.json changed. I did not raise it.
 *
 *   B  DERIVATION CRASHED ON UNMIGRATED DATA. `combat.movement.land.total
 *      = result.speed` throws `Cannot create property 'total' on number
 *      '30'` in strict mode, and every module is strict. Live console,
 *      world trg-v14: TWELVE actors, every one of them —
 *
 *        Error: Failed data preparation for Actor.x3GOMQgv1RoDjwfW.
 *        Cannot create property 'total' on number '20'
 *
 *      This is the deep one, and fixing A would not have fixed it.
 *      Migrations run at `ready`; data preparation runs at `setupGame`,
 *      BEFORE it. The first load after ANY pooling migration therefore
 *      prepares every actor from unmigrated data, always, even when the
 *      migration is working perfectly. Derivation that requires its
 *      migration to have run has a window it cannot survive.
 *
 *   C  THE CLIMB AND SWIM SKILL BONUSES DIED ON SUCCESS. `prepareSkills`
 *      asked `Number(movement.climb) > 0`, and `Number({base:20,…})` is
 *      NaN, and `NaN > 0` is false. So Chapter 8's automatic +4 for having
 *      a climb or swim speed stops being granted the moment the migration
 *      SUCCEEDS. The comment at the pooling site cites this very rule as
 *      something pooling enables. The pooling broke the reader the comment
 *      points at.
 *
 *   D  QUICK TIME SAW NO SPEEDS. `speedsPresentOn` reads `movement[key]
 *      ?.base`, which is undefined on a bare number, so during the
 *      unmigrated window "any speeds that the character has" is none of
 *      them.
 *
 * C IS THE ONE WORTH THE FILE. A and B are loud — a missing prompt and a
 * console full of red. C is silent, it appears only AFTER everything looks
 * fixed, and the first person to notice is a GM wondering why the climbing
 * rogue rolls four lower than the sheet used to say.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE THIS FILE ENFORCES: EVERY READER TAKES BOTH SHAPES.
 *
 * Not "readers take the new shape once the migration has run". The
 * migration is a TIDY-UP, never a prerequisite — because of the ordering
 * in B, and because a compendium actor, a token in an old scene or a
 * character imported from a backup can arrive unmigrated at any time. A
 * reader that goes through this file cannot tell the difference, which
 * means the shape can change again without a fifth coat.
 *
 * And because the decision is pure it can be checked without Foundry —
 * unlike `prepareDerivedData`, where B lived. That is the EIGHTH instance
 * on this project of "a decision made inside a Foundry-only function that
 * no harness can call", and the fix is the same one it always is: extract
 * the decision, then check it.
 */

/** The five speeds, in sheet order. */
export const SPEED_KEYS = Object.freeze(["land", "fly", "swim", "climb", "burrow"]);

/** The pool slots a speed carries, beside `total`. */
export const SPEED_SLOTS = Object.freeze(["base", "item", "status", "circumstance", "other"]);

/**
 * Is this already a pool?
 *
 * AN ARRAY IS NOT, deliberately. `[30]` is the 3.223.3 corruption, and
 * `typeof [] === "object"` would wave it through into a pool whose `base`
 * is an array — a number everywhere downstream, quietly NaN.
 */
import { grantedSpeedBase } from "./granted-speeds.mjs";

export function isSpeedPool(raw) {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw);
}

/**
 * This speed as a pool, whatever shape it arrived in.
 *
 * ALWAYS RETURNS A POOL. This is derivation's view, and the reason
 * derivation can no longer crash: the bare-number branch is handled here,
 * once, instead of at every site that assigns to `.total`.
 *
 * An already-pooled value is returned AS IS rather than rebuilt, because
 * derivation mutates the node it is handed — rebuilding would hand back a
 * copy and silently discard every bonus written to it.
 */
export function speedPool(raw) {
  if (isSpeedPool(raw)) return raw;
  const base = Array.isArray(raw) ? 0 : Math.max(0, Number(raw) || 0);
  return { base, item: 0, status: 0, circumstance: 0, other: 0, total: base };
}

/**
 * This speed as a pool, or null when it is already one.
 *
 * MIGRATION'S VIEW, and the null is the whole point: it means "no update
 * needed", which is what makes the migration idempotent. A second run must
 * not wrap a pool inside another pool.
 *
 * Same shape decision as `speedPool`, expressed once and shared, so the
 * migration and derivation cannot disagree about what a pool is.
 */
export function pooledSpeedValue(raw) {
  return isSpeedPool(raw) ? null : speedPool(raw);
}

/**
 * The speed a creature MOVES at — the resolved figure, from either shape.
 *
 * Use this wherever the old code said `Number(movement.climb)`.
 */
export function speedValue(raw) {
  if (isSpeedPool(raw)) return Number(raw.total ?? raw.base ?? 0) || 0;
  return Array.isArray(raw) ? 0 : Number(raw) || 0;
}

/**
 * The speed a creature HAS OF ITS OWN, before anything granted it one.
 *
 * Distinct from `speedValue` and the distinction matters: Quick Time asks
 * which speeds a creature has so it can hasten them, and reading the
 * resolved total would let a speed granted BY the spell bootstrap itself
 * into being a speed the spell then hastens.
 */
export function speedBase(raw) {
  if (isSpeedPool(raw)) return Number(raw.base ?? 0) || 0;
  return Array.isArray(raw) ? 0 : Number(raw) || 0;
}

/**
 * Coerce every speed on a movement block to a pool, in place.
 *
 * IN PLACE, AND RETURNING THE SAME OBJECT, because derivation's caller
 * holds a reference to `system.combat.movement` and every later step
 * writes through it. Returning a new object would leave those writes on a
 * discarded copy — the "two places deciding one question" failure in its
 * quietest form.
 *
 * Keys absent from the block are left absent rather than invented: a
 * creature with no burrow speed should not acquire a burrow pool of zero,
 * because `speedsPresentOn` distinguishes absent from zero and the sheet
 * shows a row for what exists.
 */
export function normaliseMovement(movement) {
  if (!movement || typeof movement !== "object") return movement;
  for (const key of SPEED_KEYS) {
    if (!(key in movement)) continue;
    movement[key] = speedPool(movement[key]);
  }
  return movement;
}

/**
 * Everything derivation does to the movement block AFTER the typed bonuses
 * have pooled: armour, encumbrance, grid rounding, the half-land speeds
 * two feats grant, and the immobilised flag.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS OUT HERE, AND IT IS THE POINT OF THE RELEASE.
 *
 * `mutate-speed-pool` #11 deletes the coercion call from
 * `prepareDerivedData` — the precise edit that produced defect B — and
 * the first version of this file could not catch it, because that call
 * sat inside a Foundry-only method and no check in this project can run
 * one. The mutation report said SURVIVED, which was the truth: the rule
 * had a harness and its ONLY CALLER did not.
 *
 * Deleting that mutation would have made the report green and the system
 * no safer. So the work moved instead. Everything here is pure, the actor
 * method is now the four lines that fetch `actor`-shaped inputs and hand
 * them over, and a check can drive the whole sequence — from unmigrated
 * bare numbers through to the final rounded Speed — without Foundry.
 *
 * IT NORMALISES ITS OWN INPUT rather than trusting the caller to have
 * done it. That is not belt-and-braces: a caller that must remember a
 * setup call is exactly the arrangement that crashed twelve actors, and
 * "the function cannot be called wrongly" beats "the caller is careful"
 * every time it has come up on this project.
 *
 * MUTATES AND RETURNS THE CALLER'S BLOCK, for the reason `normaliseMovement`
 * gives: derivation holds the reference and everything downstream reads
 * through it.
 *
 * @param {object} options
 * @param {object} options.movement `system.combat.movement`, either shape
 * @param {number} [options.armourPenalty]
 * @param {number} [options.encumbrancePenalty]
 * @param {boolean} [options.roundToGrid]
 * @param {boolean} [options.encumbered] true when the load is over allowance
 * @param {string[]} [options.halfLandSpeeds] speeds set to half land by feat
 * @param {Array<{key:string,feet:number,orLand:boolean}>} [options.grantedSpeeds]
 *   speeds something GAVE the creature, each read against the resolved
 *   land speed; see combat/granted-speeds.mjs
 * @param {(node:object, key:string)=>void} [options.applyBonuses] pools the
 *   typed bonuses aimed at one speed; injected because it needs the actor
 * @param {(opts:object)=>{speed:number, immobilised:boolean}} options.landSpeed
 * @returns {object} the same movement block
 */
export function resolveMovement({
  movement,
  armourPenalty = 0,
  encumbrancePenalty = 0,
  roundToGrid = true,
  encumbered = false,
  halfLandSpeeds = [],
  grantedSpeeds = [],
  setSpeeds = [],
  applyBonuses,
  landSpeed
} = {}) {
  if (!movement || typeof movement !== "object") return movement;
  normaliseMovement(movement);
  // A block with no land speed at all still gets one, because every later
  // step reads it and the sheet prints it.
  if (!isSpeedPool(movement.land)) movement.land = speedPool(0);

  // TYPED BONUSES POOL FIRST, and the ORDER IS THE WHOLE DESIGN: typed
  // bonuses resolve highest-wins per Appendix 1, and armour, encumbrance
  // and rounding are then applied to the figure that comes out. They are
  // not typed bonuses and must not compete in the pool — a +10 status
  // Speed and a -5 encumbrance penalty are different kinds of thing, and
  // pooling them together would let one suppress the other.
  //
  // THE CALLBACK IS WHY THIS STEP IS IN HERE rather than left in the
  // actor method where it started. It needs the actor, which is Foundry's;
  // everything around it is a rule. Injecting the one Foundry-shaped piece
  // leaves the sequence checkable and — more to the point — leaves the
  // caller with ONE call and nothing to remember. The version of this
  // release that kept a separate `normaliseMovement` call in the actor
  // could have it deleted with no check noticing, which is how the outage
  // happened in the first place.
  if (applyBonuses) {
    for (const key of SPEED_KEYS) {
      if (!isSpeedPool(movement[key])) continue;
      applyBonuses(movement[key], key);
    }
  }

  /*
   * A FORM'S OWN LAND SPEED REPLACES THE CHARACTER'S (3.595.1), and it is
   * applied HERE — after the typed bonuses have pooled and BEFORE land
   * resolves — for the same reason armour and encumbrance come after the
   * pool: the form's figure is the Speed the creature now has, so armour,
   * encumbrance and grid rounding apply to IT rather than to the Speed the
   * character left behind.
   *
   * AN ASSIGNMENT, NOT A MAXIMUM. That is the whole difference between a
   * replaced speed and a granted one: page 316's Form Spells sidebar says
   * a form's abilities replace what you had, so a 20-foot plant form slows
   * a 30-foot character. `grantedSpeeds` below is still a `Math.max`, and
   * the two must not be confused — see combat/granted-speeds.mjs.
   *
   * THE LAST ONE WINS if two sets name the same speed, which cannot happen
   * from one form and is the only answer available if it ever does.
   */
  for (const set of setSpeeds) {
    if (!SPEED_KEYS.includes(set?.key)) continue;
    if (set.key !== "land") continue;
    movement.land = speedPool(movement.land);
    movement.land.base = set.feet;
    movement.land.total = set.feet;
  }

  const result = landSpeed({
    base: Number(movement.land.total ?? 0),
    armourPenalty,
    encumbrancePenalty,
    roundToGrid
  });
  movement.land.total = result.speed;

  // Quick Climber / Quick Swimmer (Chapter 5): "a climb/swim speed equal
  // to half your land speed" — from the FINAL land speed, rounded to the
  // grid, and NEVER LOWERING a better stored speed, which is why this is
  // a max rather than an assignment.
  const halfLand = Math.floor(result.speed / 2 / 5) * 5;
  for (const key of halfLandSpeeds) {
    if (!SPEED_KEYS.includes(key)) continue;
    movement[key] = speedPool(movement[key]);
    movement[key].total = Math.max(Number(movement[key].total ?? 0), halfLand);
  }

  /*
   * A SPEED SOMETHING GRANTED (3.589.0). See combat/granted-speeds.mjs.
   *
   * HERE, BESIDE QUICK CLIMBER, and for the two reasons that block gives:
   * "its land Speed" is the speed the creature MOVES at, which is not
   * known until land resolves a few lines above; and a grant must NEVER
   * LOWER a better speed the creature already had, which is why this is a
   * `Math.max` and not an assignment. A dragon that already flies 60 is
   * not slowed to 20 by a Fly spell.
   *
   * WHAT THIS DOES THAT A BONUS CANNOT: read `feet` against the resolved
   * land speed, which is what "equal to its land Speed or 20 feet,
   * whichever is greater" asks for and what a flat number cannot say. A
   * bonus row DOES give a creature a working fly total — measured live,
   * 25 September 2026 — so this is not the only route to a speed; it is
   * the only route to that sentence. See combat/granted-speeds.mjs.
   */
  for (const grant of grantedSpeeds) {
    if (!SPEED_KEYS.includes(grant?.key)) continue;
    movement[grant.key] = speedPool(movement[grant.key]);
    const feet = grantedSpeedBase(grant, result.speed);
    movement[grant.key].total = Math.max(Number(movement[grant.key].total ?? 0), feet);
    // THE BASE MOVES TOO, because `speedsPresentOn` reads `base` to
    // decide whether a creature HAS a speed — and a granted fly speed
    // that left base at 0 would be invisible to Quick Time, to the Fly
    // action's own gate, and to anything else that asks the honest
    // question "can this creature fly?".
    movement[grant.key].base = Math.max(Number(movement[grant.key].base ?? 0), feet);
  }

  /*
   * AND THE FORM'S OTHER SPEEDS, after the grants and for the reason the
   * land half gives: a replaced speed is an assignment. A form that flies
   * at 40 flies at 40 even for a caster who was already flying at 60 by
   * another spell — the form replaced the body that was doing it.
   */
  for (const set of setSpeeds) {
    if (!SPEED_KEYS.includes(set?.key) || set.key === "land") continue;
    movement[set.key] = speedPool(movement[set.key]);
    movement[set.key].base = set.feet;
    movement[set.key].total = set.feet;
  }

  // Recorded rather than applied: derivation does not mutate documents.
  // The encumbrance workflow reads this and toggles the condition. The
  // `encumbered` half matters — a creature whose Speed is 0 because it has
  // no land speed is not immobilised BY ITS LOAD.
  movement.immobilisedByLoad = result.immobilised && encumbered;
  return movement;
}
