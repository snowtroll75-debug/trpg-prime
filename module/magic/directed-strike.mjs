/**
 * A strike the caster aims again at the start of every one of their
 * turns — Ball Lightning (page 246).
 *
 * NEW at 3.588.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE PAGE SAYS, AND THE THREE THINGS IT DOES NOT.
 *
 *   "You bring forth an orb of electrical energy. Immediately after
 *    casting the spell, one target within range suffers 6d8 electricity
 *    damage. At the start of each of your turns, you may as a free
 *    action direct the ball to a new target or have it hit the current
 *    target again."
 *
 * The cast itself was always automated: it is an ordinary basic-Reflex
 * damage spell. Everything after the cast was a note on the card telling
 * the player to fire the spell again by hand each turn — which is an
 * instruction, not automation, and this project's name for that is a
 * silence.
 *
 * Three readings had to be settled before any of it could be built, and
 * Graham ruled on all three (24 September 2026):
 *
 *   1. ON A TURN WHERE NO FREE ACTION IS SPENT, THE BALL STRIKES ITS
 *      CURRENT TARGET. So the default is action, not inaction — a
 *      forgotten free action costs you the choice of target, never the
 *      strike. `strikeTargetFor` is that rule and nothing else.
 *
 *   2. EACH STRIKE ALLOWS ITS OWN BASIC REFLEX SAVE. A save at the cast
 *      that held for the minute would be a very different spell; this is
 *      a fresh attack every round.
 *
 *   3. "WITHIN RANGE" IS MEASURED FROM THE CASTER. Not from the ball. So
 *      a ball sent 40 feet away cannot be walked a further 40 feet out;
 *      the caster's 40-foot bubble is the whole of its reach.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ONE THING STILL INFERRED, SAID OUT LOUD SO IT IS CHEAP TO CORRECT.
 *
 * Ruling 3 governs where the ball may be SENT. The page attaches "within
 * range" to directing it at a NEW target and says nothing about the
 * current one, so a target who runs is still struck. That is the reading
 * that invents the least — the alternative would be a leash the entry
 * never prints — but it is a reading, and the card says so on any turn
 * where it matters rather than leaving the table to notice.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT FLAMING SPHERE.
 *
 * Flaming Sphere is the other spell in the pack that moves something
 * each round, and it is a different mechanism throughout: it is moved
 * with a SUSTAIN action rather than a free one, to a SQUARE rather than
 * a creature, and it damages whoever is in that square rather than a
 * target it remembers. Nothing here would fit it, which is why this
 * models a directed strike rather than "a spell with a moving part".
 */

const text = (v) => String(v ?? "").trim();
const DICE = /^\d+(d\d+)?(\s*\+\s*\d+)?$/i;
const SAVES = Object.freeze(["fortitude", "reflex", "will"]);

/** The flag a ball's own ActiveEffect carries. */
export const DIRECTED_STRIKE_FLAG = "directedStrike";

/**
 * Read a `directedStrike` effect row, or a stored ball's flag.
 *
 * @returns {{label: string, formula: string, damageType: string,
 *   save: string, rangeFeet: number|null, count: number}|null}
 */
export function normaliseDirectedStrike(raw) {
  if (!raw || typeof raw !== "object") return null;

  const formula = text(raw.formula);
  // A strike with no dice is not a strike. Refused here rather than
  // reaching `new Roll("")`, which throws inside the turn-advance path.
  if (!formula || !DICE.test(formula)) return null;

  const damageType = text(raw.damageType).toLowerCase();
  // A DAMAGE TYPE IS NOT OPTIONAL, the same rule the ladders apply: an
  // empty type means "the weapon's own" elsewhere in this system, and a
  // spell that forgot one must not inherit that meaning.
  if (!damageType) return null;

  const save = text(raw.save).toLowerCase();
  if (!SAVES.includes(save)) return null;

  // NO RANGE IS NOT ZERO RANGE. `Number(null)` is 0 and 0 is finite, so
  // the two would be one answer downstream and every redirect would be
  // refused by a limit nobody wrote. Absent means unmeasured, which
  // `withinDirectRange` reads as no limit to enforce.
  const rawRange = Number(raw.rangeFeet);
  const rangeFeet = Number.isFinite(rawRange) && rawRange > 0 ? Math.trunc(rawRange) : null;

  const rawCount = Number(raw.count);
  const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.trunc(rawCount) : 1;

  return {
    label: text(raw.label) || "Directed strike",
    formula, damageType, save, rangeFeet, count
  };
}

/**
 * WHICH CREATURE THIS TURN'S STRIKE LANDS ON — Graham's ruling 1.
 *
 * A turn where the caster spends no free action is not a turn the ball
 * skips. `chosen` is what the free action bought; absent it, the ball
 * hits what it hit last time.
 *
 * @param {object} options
 * @param {string} options.current the uuid the ball is already on
 * @param {string} [options.chosen] the uuid the free action redirected to
 * @returns {{uuid: string, redirected: boolean}|null} null when the ball
 *   has nothing to hit at all
 */
export function strikeTargetFor({ current = "", chosen = "" } = {}) {
  const pick = text(chosen);
  if (pick) return { uuid: pick, redirected: true };
  const held = text(current);
  // A BALL WHOSE TARGET IS GONE HAS NOTHING TO STRIKE, and that is a
  // thing the card must say rather than a turn that quietly passes. The
  // caller offers a redirect and reports the miss; it does not pick
  // somebody for the player.
  if (!held) return null;
  return { uuid: held, redirected: false };
}

/**
 * IS THIS CREATURE SOMEWHERE THE BALL MAY BE SENT — Graham's ruling 3.
 *
 * Measured from the CASTER, never from the ball. A distance that could
 * not be measured is not "too far": on a scene with no grid, or a token
 * the canvas cannot resolve, refusing every redirect would switch the
 * spell off rather than degrade it.
 *
 * @param {number|null} distanceFromCasterFeet
 * @param {number|null} rangeFeet
 */
export function withinDirectRange(distanceFromCasterFeet, rangeFeet) {
  /*
   * NULL IS CHECKED BEFORE THE NUMBER, AND THAT IS NOT PEDANTRY.
   *
   * The first draft of this guarded with `!Number.isFinite(Number(x))`
   * alone — and `Number(null)` is 0, which is finite. So a spell with no
   * printed range came through as a range of ZERO FEET and refused every
   * redirect on the board, in the one function in this file whose
   * comment warns about that exact confusion. Caught by its own first
   * test run, which is the only reason it is not in the shipped build.
   *
   * `normaliseDirectedStrike` writes `null` for "no limit printed", so
   * null and undefined are the common case here rather than an edge.
   */
  const limit = rangeFeet === null || rangeFeet === undefined ? NaN : Number(rangeFeet);
  if (!Number.isFinite(limit) || limit <= 0) return true;
  const far = distanceFromCasterFeet === null || distanceFromCasterFeet === undefined
    ? NaN : Number(distanceFromCasterFeet);
  // AN UNMEASURED DISTANCE IS NOT TOO FAR. On a gridless scene, or with
  // a token the canvas cannot resolve, refusing every redirect switches
  // the spell off rather than degrading it.
  if (!Number.isFinite(far)) return true;
  return far <= limit;
}

/**
 * The creatures this ball may be directed at.
 *
 * @param {Array<{uuid: string, name: string, distance: number|null}>} candidates
 *   every creature on the scene, with its distance FROM THE CASTER
 * @param {number|null} rangeFeet
 * @param {string[]} [taken] uuids other balls have already claimed this
 *   turn — the warp's "must have a different target"
 * @param {string} [casterUuid] never offered; the ball is not aimed at you
 */
export function directableTargets(candidates = [], rangeFeet = null, taken = [], casterUuid = "") {
  const spoken = new Set((taken ?? []).filter(Boolean).map(String));
  const self = text(casterUuid);
  return (candidates ?? [])
    .filter((c) => c && text(c.uuid))
    .filter((c) => text(c.uuid) !== self)
    .filter((c) => !spoken.has(text(c.uuid)))
    .filter((c) => withinDirectRange(c.distance, rangeFeet));
}

/**
 * THE WARP'S CONSTRAINT, AS A QUESTION RATHER THAN A HOPE.
 *
 * "+4 PP: create an additional ball which must have a different target."
 * Two balls on one creature is the thing the option forbids, and it is
 * the easiest mistake to make in a dialog — so it is asked of the whole
 * assignment rather than trusted to the picker that built it.
 *
 * @param {string[]} uuids this turn's target per ball, in ball order
 */
export function targetsAreDistinct(uuids = []) {
  const real = (uuids ?? []).map((u) => text(u)).filter(Boolean);
  return new Set(real).size === real.length;
}

/** The card line for one strike. */
export function directedStrikeLine(label, targetName, { redirected = false, outOfRange = false } = {}) {
  if (!targetName) {
    return `<strong>${label}</strong> has nothing to strike — its target is gone. Direct it at someone to bring it back.`;
  }
  const how = redirected ? "directed at" : "strikes";
  // A REDIRECT CAN NEVER BE OUT OF RANGE, so the caveat is refused here
  // as well as not being passed. The caller computes
  // `!aim.redirected && !stillNear` and could stop doing so; this
  // function is the one that decides what the sentence may say.
  const note = outOfRange && !redirected
    ? ` <em>(${targetName} is beyond the spell's range; the entry limits only where the ball may be SENT, so it still strikes — say otherwise at the table and it will be changed.)</em>`
    : "";
  return `<strong>${label}</strong> ${how} ${targetName}.${note}`;
}
