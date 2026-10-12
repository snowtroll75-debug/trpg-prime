/**
 * The eleven Chapter 5 feats that buy a new way to spend your actions.
 *
 * Combat Grapple · Distracting Strike · Double Shot · Knife Flurry ·
 * Quick Draw · Reverse Strike · Skirmish · Striding Charge · Swipe ·
 * Vital Strike · Void Step
 *
 * WHAT THEY HAVE IN COMMON is an AP cost and a rule about the multiple
 * attack penalty — and between them they use four different rules about
 * it, which is the whole reason this file exists as a table rather than
 * as eleven handlers.
 *
 * THE PENALTY IS WHERE THIS BATCH WILL GO WRONG IF IT GOES WRONG. The
 * previous batch shipped Cleave rolled MAP-exempt when its text says
 * "uses your current penalty", because the distinction lived in a table
 * and the call site quietly ignored it. So here the penalty rule is not
 * only declared, it is turned into the actual attack options by
 * `mapPlanFor` — one function, driven by the harness, that every caller
 * goes through.
 */

const normalise = (name) => String(name ?? "").trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* The four penalty rules                                              */
/* ------------------------------------------------------------------ */

/**
 * How a feat's Strikes relate to the multiple attack penalty.
 *
 *   single      One Strike, ordinary treatment: it takes the current
 *               penalty and advances the counter by one. Most of them.
 *
 *   countsAsTwo One Strike that "counts as two attacks for your multiple
 *               attack penalty" — Swipe. The Strike itself is rolled at
 *               the current penalty; the counter then moves by TWO.
 *
 *   pairThenOne Two Strikes at the SAME penalty which together "count as
 *               one attack for increasing the penalty further" — Reverse
 *               Strike. Both frozen, counter then moves by one.
 *
 *   pairThenTwo Two Strikes at the same penalty where "both attacks
 *               count toward your multiple attack penalty, but the
 *               penalty doesn't increase until after both Strikes have
 *               been completed" — Double Shot. Both frozen, counter then
 *               moves by two.
 *
 * The two pair rules differ ONLY in the final number, and that is
 * exactly the kind of difference that gets collapsed by accident. They
 * are separate values so a mutation can tell them apart.
 */
export const MAP_RULES = Object.freeze({
  single: "single",
  countsAsTwo: "countsAsTwo",
  pairThenOne: "pairThenOne",
  pairThenTwo: "pairThenTwo"
});

/**
 * The plan for rolling a feat's Strikes: how many, whether each is
 * frozen, and how far the counter moves afterwards.
 *
 * DERIVED, NOT DECLARED TWICE. Double Slice already established the
 * shape this returns — roll each Strike with `mapFrozen`, then advance
 * the counter once, by hand, when they are all done
 * (double-slice-workflow.mjs). Returning that plan from one pure
 * function is what stops a feat's table entry and its call site drifting
 * apart, which is the defect the previous batch shipped.
 *
 * @param {string} rule one of MAP_RULES
 * @returns {{strikes: number, frozen: boolean, advanceBy: number}}
 */
export function mapPlanFor(rule) {
  switch (rule) {
    case MAP_RULES.countsAsTwo:
      // One Strike, at the current penalty, worth two on the ladder.
      return { strikes: 1, frozen: true, advanceBy: 2 };
    case MAP_RULES.pairThenOne:
      return { strikes: 2, frozen: true, advanceBy: 1 };
    case MAP_RULES.pairThenTwo:
      return { strikes: 2, frozen: true, advanceBy: 2 };
    case MAP_RULES.single:
    default:
      // NOT FROZEN, and `advanceBy: 0` because the attack workflow
      // advances the counter itself for an ordinary Strike. Advancing it
      // here as well would move it twice — the exact double-count this
      // table exists to keep straight.
      return { strikes: 1, frozen: false, advanceBy: 0 };
  }
}

/**
 * How far the ladder really moves, given how many Strikes resolved.
 *
 * FOUND LIVE, 21 August 2026. A Double Shot with no compatible
 * ammunition had both its Strikes refused deep inside the attack
 * workflow — and still advanced the multiple attack penalty by two. The
 * archer paid a full round's worth of penalty for two arrows that were
 * never loosed, and nothing on the card said so.
 *
 * NOTHING RESOLVED, NOTHING OWED. If at least one Strike happened the
 * feat happened, and its declared cost stands — the printed rules price
 * the ACTION, not each swing. But an action that produced no Strike at
 * all has not been taken.
 *
 * @param {number} declared  the plan's advanceBy
 * @param {number} resolved  how many Strikes actually rolled
 */
export function ladderOwed(declared, resolved) {
  return Number(resolved) > 0 ? Math.max(0, Number(declared) || 0) : 0;
}

/* ------------------------------------------------------------------ */
/* Requirements                                                        */
/* ------------------------------------------------------------------ */

/** The "Requirements" line each feat prints, as a testable key. */
export const REQUIREMENTS = Object.freeze({
  freeHand: "freeHand",
  rangedWithFreeReload: "rangedWithFreeReload",
  knifeWeapon: "knifeWeapon",
  flankedByTwo: "flankedByTwo"
});

export const REQUIREMENT_TEXT = Object.freeze({
  freeHand: "you need a free hand that can reach the target",
  rangedWithFreeReload: "you need a ranged weapon you can reload for 0 actions",
  knifeWeapon: "you need to be wielding a knife",
  flankedByTwo: "you must be flanked by at least two enemies"
});

/**
 * Is this requirement met?
 *
 * @param {string} key
 * @param {object} state
 * @param {boolean} [state.freeHand]
 * @param {boolean} [state.rangedWeapon]
 * @param {boolean} [state.freeReload]
 * @param {boolean} [state.knife]
 * @param {number}  [state.flankers]
 */
export function meetsRequirement(key, state = {}) {
  switch (key) {
    case REQUIREMENTS.freeHand:
      return Boolean(state.freeHand);
    case REQUIREMENTS.rangedWithFreeReload:
      // BOTH HALVES. "You are wielding a ranged weapon AND can reload it
      // for 0 actions" — a longbow you must spend an action to reload is
      // not a Double Shot weapon, and neither is a sword.
      return Boolean(state.rangedWeapon) && Boolean(state.freeReload);
    case REQUIREMENTS.knifeWeapon:
      return Boolean(state.knife);
    case REQUIREMENTS.flankedByTwo:
      return Number(state.flankers) >= 2;
    default:
      // An unknown requirement is NOT met — a typo must remove power,
      // never hand it out.
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

export const ACTION_FEATS = Object.freeze({
  "combat grapple": {
    label: "Combat Grapple",
    apCost: "1",
    traits: "Attack, Fighter, Press",
    map: MAP_RULES.single,
    requires: [REQUIREMENTS.freeHand],
    summary: "Strike, and on a hit Grab your target with your free hand."
  },
  "distracting strike": {
    label: "Distracting Strike",
    apCost: "1",
    traits: "Attack, Fighter",
    map: MAP_RULES.single,
    requires: [REQUIREMENTS.freeHand],
    summary: "Strike for no damage, leaving the target flat-footed."
  },
  "double shot": {
    label: "Double Shot",
    apCost: "2",
    traits: "Archer, Flourish, Martial",
    map: MAP_RULES.pairThenTwo,
    requires: [REQUIREMENTS.rangedWithFreeReload],
    strikePenalty: -2,
    differentTargets: true,
    summary: "Two shots at different targets, each at -2."
  },
  "knife flurry": {
    label: "Knife Flurry",
    apCost: "0",
    traits: "Attack, Flourish, Martial",
    // "Be aware that this action has the attack trait and is therefore
    // subject to your multiple attack penalty" — the Feint takes the
    // penalty like a Strike would, and advances it like one.
    map: MAP_RULES.single,
    requires: [REQUIREMENTS.knifeWeapon],
    triggered: true,
    summary: "Feint as a free action after a knife hits."
  },
  "quick draw": {
    label: "Quick Draw",
    apCost: "1",
    traits: "Expert, Martial",
    map: MAP_RULES.single,
    requires: [],
    summary: "Interact to draw and Strike, together, for 1 AP."
  },
  "reverse strike": {
    label: "Reverse Strike",
    apCost: "1",
    traits: "Flourish, Martial, Press",
    map: MAP_RULES.pairThenOne,
    requires: [REQUIREMENTS.flankedByTwo],
    differentTargets: true,
    summary: "Strike two of the enemies flanking you, for the price of one attack."
  },
  "skirmish": {
    label: "Skirmish",
    apCost: "1",
    traits: "Flourish, Ranger, Rogue",
    map: MAP_RULES.single,
    requires: [],
    summary: "Strike and Step together for 1 AP, in either order."
  },
  "striding charge": {
    label: "Striding Charge",
    apCost: "2",
    traits: "Flourish, Martial",
    map: MAP_RULES.single,
    requires: [],
    summary: "Barge through the enemies in your way, then attack."
  },
  "swipe": {
    label: "Swipe",
    apCost: "2",
    traits: "Flourish, Martial",
    map: MAP_RULES.countsAsTwo,
    requires: [],
    summary: "One arc against two adjacent foes."
  },
  "vital strike": {
    label: "Vital Strike",
    apCost: "2",
    traits: "Attack, Martial",
    map: MAP_RULES.single,
    requires: [],
    summary: "One aimed attack; a critical may be stepped to your chosen location."
  },
  "void step": {
    label: "Void Step",
    apCost: "1",
    traits: "Expert, Focus",
    map: MAP_RULES.single,
    requires: [],
    summary: "Stride without provoking, then try to vanish from one watcher."
  }
});

export const ACTION_FEAT_NAMES = Object.freeze(Object.keys(ACTION_FEATS));

/* ------------------------------------------------------------------ */
/* Swipe                                                               */
/* ------------------------------------------------------------------ */

/**
 * "Compare the attack result to the DB of up to two adjacent foes."
 *
 * ONE ROLL, TWO DEFENCES — and per Graham's ruling of 21 August 2026,
 * ONE DAMAGE ROLL applied to each it reaches. A single arc of the weapon
 * is one event that happens to touch two people, so it is resolved
 * against each victim's own DR and armour but rolled once.
 *
 * @param {number} total the attack result
 * @param {Array<{name: string, db: number}>} foes
 */
export function swipeOutcome(total, foes = []) {
  const list = (Array.isArray(foes) ? foes : []).slice(0, SWIPE_MAX_TARGETS);
  return list.map((foe) => ({
    name: foe?.name ?? "the target",
    db: Number(foe?.db ?? 0),
    hit: Number(total) >= Number(foe?.db ?? 0)
  }));
}

/** "up to two adjacent foes" — the cap is the rule, not a convenience. */
export const SWIPE_MAX_TARGETS = 2;

/**
 * "If your weapon has the sweep trait, its modifier applies to all Swipe
 * attacks."
 *
 * Sweep's own bonus is per additional adjacent foe elsewhere in the
 * system; what this clause says is that on a Swipe it applies to BOTH
 * comparisons rather than only the second. Reported so the card can say
 * so, rather than silently folded in.
 */
export function sweepAppliesToAll(traits) {
  return /\bsweep\b/i.test(String(traits ?? ""));
}

/* ------------------------------------------------------------------ */
/* Vital Strike                                                        */
/* ------------------------------------------------------------------ */

/**
 * "You may specify a hit location from the following: Arms, Legs, Torso,
 * Abdomen or Head. If the attack is a critical hit, when you roll the
 * critical, you may increase your critical result to the next one that
 * affects this location."
 *
 * THE TABLES CAN ANSWER THIS ON THEIR OWN. Hit location is a pure
 * function of the critical roll's units die (hit-location.mjs: 1-3 arms,
 * 4-6 legs, 7-8 chest, 9 abdomen, 0 head), so "the next result that
 * affects this location" is found by stepping the roll up until the
 * location matches. That is the same structural trick Vorpal uses for
 * heads (head-criticals.mjs), generalised to all five.
 *
 * NOTE THE NAME. The feat prints "Torso"; the system calls that location
 * "chest". Mapped here rather than renamed anywhere, because the
 * rulebook's word is the one a player will look for and the system's is
 * the one the tables use.
 */
export const VITAL_STRIKE_LOCATIONS = Object.freeze({
  arms: "Arms",
  legs: "Legs",
  chest: "Torso",
  abdomen: "Abdomen",
  headNeck: "Head"
});

/**
 * The next critical result at or above `roll` that strikes `location`.
 *
 * Returns the roll unchanged when it already lands there — "increase to
 * the NEXT one" is an improvement, and a result already in the right
 * place needs none.
 *
 * @param {number} roll        the critical injury roll (1-100)
 * @param {string} location    a key of VITAL_STRIKE_LOCATIONS
 * @param {function} locationOf  hitLocationFromUnitDie, injected so this
 *   stays pure and the harness drives the real mapping
 * @returns {number|null} the stepped roll, or null if none exists above
 */
export function nextResultAtLocation(roll, location, locationOf) {
  const start = Math.trunc(Number(roll) || 0);
  // NO `if (!VITAL_STRIKE_LOCATIONS[location]) return null` GUARD. It was
  // here and it was dead: `locationOf` only ever returns one of the five
  // real locations, so an unknown one already matches nothing and falls
  // out of the loop as null. A guard no input can exercise is one no
  // mutation can prove.
  if (locationOf(start % 10) === location) return start;
  for (let next = start + 1; next <= 100; next += 1) {
    if (locationOf(next % 10) === location) return next;
  }
  // ABOVE 100 THERE IS NOTHING. A result already past the last entry for
  // that location cannot be improved, and saying so is better than
  // wrapping around to a milder injury.
  return null;
}

/* ------------------------------------------------------------------ */
/* Distracting Strike                                                  */
/* ------------------------------------------------------------------ */

/**
 * "If it hits, the target takes no damage (normal damage on a critical
 * hit) but is flat-footed until the beginning of their next turn."
 *
 * THE CRITICAL IS THE EXCEPTION, and it is easy to read past: an
 * ordinary hit deals nothing at all, and only a critical deals its
 * normal damage. Both still leave the target flat-footed.
 */
export function distractingStrike({ hits = false, critical = false } = {}) {
  if (!hits) return { damage: false, flatFooted: false };
  return { damage: Boolean(critical), flatFooted: true };
}

/* ------------------------------------------------------------------ */
/* Striding Charge                                                     */
/* ------------------------------------------------------------------ */

/**
 * "Make an Athletics check comparing the result to the Fortitude DC of
 * each creature you attempt to pass through during your Stride action,
 * continuing to move on a success but ending your movement before
 * entering its space on a failure."
 *
 * ONE CHECK PER CREATURE, IN ORDER, AND IT STOPS AT THE FIRST FAILURE.
 * Rolling them all and counting successes would let a charge finish
 * through a creature it had already been stopped by.
 *
 * @param {Array<{name: string, dc: number, roll: number}>} blockers in path order
 * @returns {{passed: Array, stoppedBy: object|null, reached: boolean}}
 */
export function stridingCharge(blockers = []) {
  const passed = [];
  for (const blocker of Array.isArray(blockers) ? blockers : []) {
    if (Number(blocker?.roll) >= Number(blocker?.dc)) {
      passed.push({ name: blocker?.name ?? "a creature", dc: Number(blocker?.dc ?? 0) });
      continue;
    }
    return { passed, stoppedBy: { name: blocker?.name ?? "a creature", dc: Number(blocker?.dc ?? 0) }, reached: false };
  }
  return { passed, stoppedBy: null, reached: true };
}

/* ------------------------------------------------------------------ */
/* Which feats a character has, and whether they can use them          */
/* ------------------------------------------------------------------ */

/**
 * The action feats on this sheet, with any unmet requirement named.
 *
 * SAME SHAPE AS THE REACTION FEATS, and for the same reason: a feat that
 * is silently unavailable reads as broken. Here the player is pressing a
 * button rather than being offered one, so the reason goes into the
 * refusal instead of onto a card — but it is still a reason, never a
 * bare no.
 */
export function actionFeatState(featName, state = {}) {
  const key = normalise(featName);
  const entry = ACTION_FEATS[key];
  if (!entry) return { known: false };
  const unmet = (entry.requires ?? []).filter((req) => !meetsRequirement(req, state));
  return {
    known: true,
    key,
    label: entry.label,
    apCost: entry.apCost,
    traits: entry.traits,
    map: entry.map,
    usable: unmet.length === 0,
    reason: unmet.length ? (REQUIREMENT_TEXT[unmet[0]] ?? "its requirements are not met") : null
  };
}
