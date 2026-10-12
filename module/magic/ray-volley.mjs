/**
 * MORE THAN ONE RAY FROM ONE CAST (3.600.0).
 *
 * Graham's R13, 28 September 2026: the recommendation, which was one Cast a
 * Spell check compared against each target's Defence Bonus separately.
 *
 * PRINTED (Scorching Ray, page 317), PP 4, ATTACK FIRE INVOCATION, Cast 1-3 AP,
 * range 30 feet, "Targets 1 or more creatures":
 *
 *   "If your spell attack is successful, the target takes 2d6 fire damage.
 *   FOR EACH ADDITIONAL ACTION you use when Casting the Spell, you can fire an
 *   additional ray AT A DIFFERENT TARGET, to a maximum of three rays targeting
 *   three different targets for 3 actions. These attacks each increase your
 *   multiple attack penalty, but YOU DON'T INCREASE YOUR MULTIPLE ATTACK
 *   PENALTY UNTIL AFTER YOUR SPELL ATTACKS HAVE BEEN RESOLVED."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS THERE: ONE RAY, AND THREE ACTIONS' WORTH OF PENALTY.
 *
 * `castAP` read "1-3 AP" and the spell had NO `apOptions`, so the extra
 * actions bought nothing at all. `resolveSpellAttack` took
 * `Array.from(game.user.targets)[0]` — the first target and no other — and
 * advanced the penalty counter immediately, so a second Strike in the same
 * turn was penalised as though three rays had already flown.
 *
 * Measured during the audit: Scorching Ray is the ONLY attack-category spell in
 * 692 that names more than one target, and the only "1-3 AP" spell without
 * `apOptions` except Death's Defiance. Cure, Inflict and Magic Missile all
 * carry three.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE CHECK, THREE COMPARISONS — AND WHY.
 *
 * In this system the Cast a Spell check IS the attack roll; there is no second
 * d20. So "three rays" could mean three separate checks, and it does not: a
 * volley rolls once and compares that total against each target's Defence
 * Bonus separately, so one ray can hit while another misses.
 *
 * THE DEFERRAL CLAUSE IS WHAT MAKES THAT COHERENT. Because the penalty does not
 * move until every ray has resolved, all three rays would share one penalty
 * even if they were rolled separately — so the only thing three rolls would add
 * is three chances at the dice, which the page does not offer. Graham chose this
 * reading over three checks on 28 September 2026.
 *
 * AND THE PENALTY STILL CLIMBS BY THREE afterwards, which is the half that was
 * wrong in the other direction: a three-ray volley leaves the caster at -3 rungs
 * for anything else they do this turn.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/** The most rays any cast may fire. "To a maximum of three rays" (page 317). */
export const MAX_RAYS = 3;

/**
 * How many rays this cast buys.
 *
 * ONE PER ACTION, capped. A cast of 0 or fewer AP is one ray rather than none:
 * the spell always fires at least the ray its base cost pays for, and a volley
 * of nothing would be a spell that does nothing — the shape this project
 * refuses. Above the cap the extra actions buy nothing, which is the page's own
 * "to a maximum of three".
 */
export function raysForAP(ap) {
  const actions = int(ap);
  if (actions <= 1) return 1;
  return Math.min(MAX_RAYS, actions);
}

/**
 * Which creatures the volley fires at, in the order they were targeted.
 *
 * AT A DIFFERENT TARGET EACH — so the list is DEDUPLICATED by actor, not merely
 * truncated. Two tokens of one creature are one target, which is what "three
 * different targets" means and what a truncating slice would get wrong the
 * moment somebody targeted the same creature twice.
 *
 * TAKES THE ACTORS, not the user's target set, so the harness can drive every
 * combination without a canvas.
 *
 * @param {Array<Actor|null>} actors the targeted creatures, in order
 * @param {number} rays how many the cast bought
 * @returns {Array<Actor>} at most `rays` distinct creatures
 */
export function volleyTargets(actors, rays) {
  const out = [];
  const seen = new Set();
  for (const actor of Array.isArray(actors) ? actors : []) {
    if (!actor) continue;
    const key = actor.uuid ?? actor.id ?? actor;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(actor);
    /*
     * THE BREAK IS AFTER THE PUSH, and that is what guarantees at least one
     * target whatever `rays` says — a `Math.max(1, …)` sat here until
     * `mutate-scorching-ray` removed it and nothing changed, because the first
     * creature is already in `out` by the time the test runs. A floor that
     * cannot alter an answer is untested code pretending to be a guarantee;
     * the loop's shape is the guarantee, and T6 measures it.
     */
    if (out.length >= int(rays)) break;
  }
  return out;
}

/**
 * How much the penalty counter moves after the volley.
 *
 * BY THE NUMBER OF RAYS ACTUALLY FIRED, not by the number bought. A caster who
 * paid three actions and could only find two targets has made two attacks, and
 * the page counts attacks.
 */
export function volleyMapAdvance(firedCount) {
  return Math.max(0, int(firedCount));
}

/** What the card says before the rays. */
export function volleyOpeningLine(spellName, rays, fired) {
  if (rays <= 1) return "";
  const shortfall = fired < rays
    ? ` &mdash; only ${fired} ${fired === 1 ? "target was" : "targets were"} marked, so ${fired === 1 ? "one ray" : `${fired} rays`} ${fired === 1 ? "flies" : "fly"}`
    : "";
  return `<strong>${spellName}</strong>: ${rays} rays, one per action, each at a different target${shortfall}. `
    + "All of them roll at the multiple attack penalty as it stood before the volley.";
}

/** And after them. */
export function volleyClosingLine(fired, mapBefore) {
  if (fired <= 1) return "";
  return `<em>Multiple attack penalty now advances by ${fired} &mdash; from ${mapBefore} to `
    + `${mapBefore + fired} attacks this turn, counted only now that every ray has resolved.</em>`;
}

/** What the card says when a volley found nobody to shoot at. */
export function volleyNoTargetsLine(spellName) {
  return `<em>${spellName} found no target — mark one or more creatures and cast again.</em>`;
}
