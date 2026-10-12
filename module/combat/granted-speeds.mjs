/**
 * A movement speed a creature does not have, granted by something.
 *
 * NEW at 3.589.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR, AND THE CLAIM I HAD TO WITHDRAW.
 *
 * Fly (page 279) grants "a fly Speed equal to its land Speed or 20 feet,
 * whichever is greater". Earth Glide grants "a burrow speed of 5 feet".
 *
 * THE FIRST VERSION OF THIS HEADER SAID A BONUS ROW COULD NOT DO IT, on
 * the strength of
 *
 *   pooledSpeedValue({ base: 0, status: 20 })   ->   null
 *
 * and that was the wrong function. `pooledSpeedValue` is the MIGRATION's
 * view — its own docs say the null means "no update needed" — not the
 * resolver's. Driven properly in Graham's world on 25 September 2026, on
 * a real actor, with the exact CUSTOM-mode change a `bonus` row produces:
 *
 *   fly.total   0  ->  20
 *
 * So a bonus DOES give a creature a working fly speed, and
 * `fly-workflow.mjs` gates flight on `speedValue(...fly)` — the total —
 * so that speed flies. I measured the wrong function and believed the
 * answer, which is the shape this project has recorded against movement
 * slots twice before.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SO WHY THIS EXISTS AT ALL — TWO REASONS, BOTH NARROW.
 *
 *   "EQUAL TO ITS LAND SPEED OR 20 FEET, WHICHEVER IS GREATER" is not a
 *   number, and a bonus row carries a number. A flat +20 would give a
 *   land-25 creature a fly speed of 20 where the page says 25, and would
 *   give a land-60 dragon 20 where the page says 60. That sentence is
 *   the whole reason for `orLand`.
 *
 *   A BONUS LEAVES `base` AT 0, so `speedsPresentOn` — which reads base
 *   deliberately, to stop "a speed granted BY the spell bootstrap[ping]
 *   itself into being a speed the spell then hastens" — still reports
 *   the creature as having no fly speed. Nothing but Quick Time's "all
 *   Speeds" asks that question today, and it is arguably right to say
 *   no. Recorded because it is the one behavioural difference, not
 *   because it drove the design.
 *
 * Earth Glide could honestly have been a `bonus` row. It uses this
 * instead because ONE way to grant a speed is worth more than two, and
 * its warp still works: `warpedBonusValue` folds "+5 feet (max 20)" into
 * the granted figure before it is validated.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SO A GRANT WRITES A BASE, AND IT FOLLOWS QUICK CLIMBER.
 *
 * `resolveMovement` already creates a pool for a speed a creature lacks,
 * in exactly one place: Quick Climber and Quick Swimmer, whose "climb
 * speed equal to half your land speed" is applied AFTER land resolves,
 * as a `Math.max` against whatever was stored. This takes that same slot
 * for the same reason — "its land Speed" means the speed it moves at,
 * after armour and encumbrance, which is not known until then — and
 * never lowers a better speed the creature already had.
 *
 * A DRAGON THAT CAN ALREADY FLY 60 IS NOT SLOWED TO 20 BY A Fly SPELL.
 * That is what the max is for, and it is the half a careless assignment
 * would get wrong.
 */

const text = (v) => String(v ?? "").trim();

/** The flag an ability item carries to grant a speed. */
export const GRANTED_SPEED_PATH = "movement";

/**
 * Read one grant.
 *
 * @returns {{key: string, feet: number, orLand: boolean}|null}
 */
export function normaliseGrantedSpeed(raw, speedKeys = []) {
  if (!raw || typeof raw !== "object") return null;
  const key = text(raw.key).toLowerCase();
  if (!speedKeys.includes(key)) return null;
  const feet = Math.max(0, Math.trunc(Number(raw.feet) || 0));
  const orLand = Boolean(raw.orLand);
  // A SHARE OF THE LAND SPEED (3.613.0, R5 — Shifting Form: "a climb or swim
  // Speed equal to HALF your Speed"). A fraction above 0 and at most 1; any
  // other number is not a share and is ignored rather than guessed at.
  const share = Number(raw.landFraction);
  const landFraction = orLand && share > 0 && share < 1 ? share : null;
  // A GRANT OF NOTHING IS NOT A GRANT — unless it defers to land, which
  // is Fly's shape: "equal to its land Speed or 20 feet, whichever is
  // greater" carries both a floor and the deferral, but a grant reading
  // "land speed, or zero" is still a real grant of the land speed.
  if (!feet && !orLand) return null;
  return landFraction ? { key, feet, orLand, landFraction } : { key, feet, orLand };
}

/**
 * Every speed grant an actor's items carry.
 *
 * READ FROM ITEMS, the way `bestLightStep` reads a light step and
 * `actorSenses` reads a sense — because a granted speed is the same kind
 * of thing, and a spell that grants one creates the same kind of item.
 *
 * @param {Array<{flags: object}>} items
 * @param {string[]} speedKeys the movement keys that exist
 */
export function grantedSpeeds(items = [], speedKeys = []) {
  const out = [];
  for (const item of items ?? []) {
    const raw = item?.flags?.["trg-prime"]?.creatureAbility?.derives?.[GRANTED_SPEED_PATH];
    const grant = normaliseGrantedSpeed(raw, speedKeys);
    if (grant) out.push(grant);
  }
  return out;
}

/**
 * The speed one grant is worth, given the creature's resolved land speed.
 *
 * ROUNDED TO THE GRID IS NOT DONE HERE. Land arrives already rounded, and
 * a flat printed figure — Earth Glide's 5 feet — is the page's own number
 * and is not the system's to round.
 */
export function grantedSpeedBase(grant, landSpeed = 0) {
  if (!grant) return 0;
  const land = Math.max(0, Math.trunc(Number(landSpeed) || 0));
  // HALF A 25-FOOT SPEED IS 10 FEET, not 12½: a share is rounded down to the
  // five-foot grid, the way the book rounds every other halved distance.
  const share = Number(grant.landFraction) > 0 ? Math.floor((land * Number(grant.landFraction)) / 5) * 5 : land;
  return grant.orLand ? Math.max(grant.feet, share) : grant.feet;
}

/** The sheet/card line for a granted speed. */
export function grantedSpeedLine(name, grant, feet) {
  if (!grant) return "";
  return `${name} gains a <strong>${grant.key} Speed of ${feet} feet</strong>`;
}

/** Where a REPLACED speed lives on an item, beside a granted one. */
export const SET_SPEED_PATH = "movementSet";

/**
 * Every speed an item REPLACES on this creature.
 *
 * THE OTHER HALF OF A FORM (3.595.1). A grant gives a creature a speed it
 * lacks and never lowers one it has; a Shape spell's form REPLACES the
 * figure — page 316: "These replace any existing physical abilities you
 * already have". A plant form whose Speed is 20 must slow a character
 * whose own is 30, which a grant cannot do by construction.
 *
 * READ FROM ITEMS, exactly as `grantedSpeeds` is, and for one reason
 * beyond symmetry: an ActiveEffect change writing into the movement pool
 * can be aborted by a stale bare-number change on the same node, and that
 * aborts the entire preparation. See magic/speed-set.mjs for what that
 * looked like in Graham's world.
 *
 * @param {Array<{flags: object}>} items
 * @param {string[]} speedKeys the movement keys that exist
 * @returns {Array<{key: string, feet: number}>}
 */
export function setSpeeds(items = [], speedKeys = []) {
  const out = [];
  for (const item of items ?? []) {
    const raw = item?.flags?.["trg-prime"]?.creatureAbility?.derives?.[SET_SPEED_PATH];
    if (!raw || typeof raw !== "object") continue;
    const key = String(raw.key ?? "").toLowerCase();
    if (!speedKeys.includes(key)) continue;
    out.push({ key, feet: Math.max(0, Math.trunc(Number(raw.feet) || 0)) });
  }
  return out;
}
