/**
 * WHEN AN ACTION IS A CHECK, AND HOW MANY DEGREES IT HAS.
 *
 * NEW at 3.506.0. Pure; no Foundry. Both rules are Graham's, 6 Sep 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ACTION THIS WAS BUILT FOR: MOUNT / DISMOUNT.
 *
 * It shipped as `checkType: "none"` — one of only two of the 97 declared
 * skill actions that is not a check at all — so `checkConfiguration`
 * returned null for it and no check object was ever built. That is
 * correct out of combat, where climbing onto a willing mount is not
 * interesting, and wrong in an encounter, where it plainly is.
 *
 * It also made the `mountDismount` quarter of the PLAINS HERITAGE's
 * advantage grant inert from the day it was written: three of its four
 * actions (Express Rider, Guide With Knees, Stay In Saddle) are real
 * checks and worked; the fourth had no roll to attach to and nothing in
 * the system would ever have said so. It starts working at 3.506.0
 * without the heritage being touched.
 *
 * THE RULING: "Mount/Dismount should be a rollable action only if a
 * combat is running (success or failure only). Outside of combat it
 * should be an automatic success."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY BOTH RULES LIVE IN ONE SMALL PURE FILE.
 *
 * `checkConfiguration` decides whether a check happens, and a single
 * variable two thousand lines away decides the degree — the comment
 * beside it says so: "there is exactly one place that knows the degree".
 * Neither is testable without Foundry. These two functions are the rules
 * themselves, so a check can run them; the workflow keeps the plumbing.
 *
 * DECLARED ON THE ACTION, NOT LISTED HERE. A hand-maintained list of
 * which actions have which degrees is the shape `MECHANICAL_KINDS` had
 * when it was wrong by forty-one: the action's own printed outcomes are
 * the authority, and this file only reads them.
 */

/**
 * Does this action roll a check right now?
 *
 * An action may declare `checkInEncounterOnly: true`, which means what it
 * says: a check while an encounter is running, and no check otherwise.
 * Every other action is unaffected, so this reads as a plain pass-through
 * for 96 of the 97.
 *
 * @param {object} action the static definition
 * @param {{inEncounter?: boolean}} state
 * @returns {boolean} false when the no-check path should run instead
 */
export function rollsAsCheck(action, state = {}) {
  /*
   * A MOVEMENT SPEED REPLACES THE CHECK (3.582.0; the pages 221-230
   * audit's D4, Graham's R8 of 22 September 2026: "Yes").
   *
   * Page 226 is explicit, twice: "INSTEAD of making Climb (Climbing)
   * checks, you automatically succeed and cover a distance up to your
   * climb speed", and the same sentence for Swim. The system granted the
   * +4 circumstance bonus and went on rolling — so a creature the book
   * says does not roll was rolling, and could fail.
   *
   * ASKED FIRST, because it is the stronger statement: an action that
   * needs no check in an encounter still needs none out of one.
   */
  if (speedReplacesCheck(action, state)) return false;
  if (!action?.checkInEncounterOnly) return true;
  // ABSENT MEANS NO ENCOUNTER, never "assume one". Written as an explicit
  // comparison in the body rather than a destructured default, because a
  // default on the signature line cannot be mutation-tested: `A4 NO ANCHOR
  // LEADS WITH export` refuses an anchor there, and rightly — an anchor on
  // a signature is disarmed by any rename.
  const inEncounter = state?.inEncounter === true;
  return inEncounter;
}

/**
 * The movement actions a matching speed answers outright, and the speed
 * that answers each.
 *
 * NOT FLY. A fly speed grants the Fly, Hover and Arrest a Fall ACTIONS —
 * it is what lets you attempt them at all — and page 226 never says they
 * succeed on their own. Climb and Swim are the two the book excuses from
 * the check, and they are the two here.
 */
export const SPEED_REPLACES_CHECK = Object.freeze({ climb: "climb", swim: "swim" });

/**
 * Does this actor's own movement replace the check for this action?
 *
 * THE HAZARD CLAUSE STAYS THE GM'S. The page keeps checks for "hazardous
 * conditions, extremely challenging surfaces, or when crossing
 * horizontal planes like ceilings" and "turbulent waters" — so the
 * caller passes `hazardous` when the GM says the conditions are one of
 * those, and the check comes back.
 *
 * @param {object} action
 * @param {object} state { speeds, hazardous }
 * @returns {boolean}
 */
export function speedReplacesCheck(action, state = {}) {
  const key = SPEED_REPLACES_CHECK[String(action?.key ?? "")];
  if (!key) return false;
  if (state?.hazardous === true) return false;
  return Number(state?.speeds?.[key] ?? 0) > 0;
}

/*
 * `collapsedDegree` AND `degrees: "binary"` WERE DELETED AT 3.510.0,
 * because the rulebook rule below already did their whole job.
 *
 * Mount/Dismount declares Success and Failure, so `declaredDegree`
 * answers `success` for heroic, critical and success, and `failure` for
 * partial, failure, fumble and blunder — the identical mapping across
 * all seven, verified before the deletion. A spell-out of "this action
 * has two degrees" is not needed when the action's own outcome list says
 * so, and a second rule that agrees with the first is a rule that can
 * one day disagree.
 *
 * Graham, 6 September 2026, on Kip Up: "Please follow the rulebook." The
 * book gives Kip Up three results and Mount two; neither needs a field
 * saying how many.
 */

/**
 * What the card says when an action skipped its check.
 *
 * SAID OUT LOUD rather than left to inference. A player who clicks Mount
 * outside an encounter and sees a card with no roll on it should be told
 * that it worked and why there was nothing to roll, not left to wonder
 * whether the button is broken — the same position every "nothing was
 * warded" and "apply this by hand" line in this system takes.
 *
 * @param {object} action the static definition
 * @returns {string|null} null when the action has no such rule
 */
export function automaticSuccessLine(action, state = {}) {
  // The speed's own sentence, which is a different reason from the
  // encounter one and deserves its own words.
  if (speedReplacesCheck(action, state)) {
    const key = SPEED_REPLACES_CHECK[String(action?.key ?? "")];
    return `<em>A ${key} speed of ${Number(state?.speeds?.[key] ?? 0)} feet means `
      + `${action.name ?? "this action"} succeeds automatically (page 226) — the distance `
      + "covered is up to that speed.</em>";
  }
  if (!action?.checkInEncounterOnly) return null;
  return `<em>No encounter is running, so ${action.name ?? "this action"} `
    + "succeeds automatically — there is nothing to roll.</em>";
}

/**
 * WHERE EACH RESULT FALLS BACK TO WHEN AN ACTION DOES NOT DECLARE IT.
 *
 * Graham's ruling of 9 September 2026, written out rather than computed.
 * Each chain starts with the degree itself, so a declared degree is its
 * own answer, and ENDS at the result that stands whether declared or not:
 * Success on the success side, Failure on the failure side.
 *
 * NOT DERIVED FROM `rank`, deliberately. Blunder falls to Fumble and then
 * to Failure, skipping Partial entirely, while Partial falls straight to
 * Failure without passing through Fumble one step away — no distance
 * function over the rank order produces both. This is a table because the
 * rule is a table.
 */
const DEGREE_FALLBACK = Object.freeze({
  heroic: Object.freeze(["heroic", "critical", "success"]),
  critical: Object.freeze(["critical", "success"]),
  success: Object.freeze(["success"]),
  partial: Object.freeze(["partial", "failure"]),
  failure: Object.freeze(["failure"]),
  fumble: Object.freeze(["fumble", "failure"]),
  blunder: Object.freeze(["blunder", "fumble", "failure"])
});

/**
 * THE DEGREE THIS ACTION ACTUALLY HAS.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 6 September 2026: "The card banner should only show
 * available results." Measured before building: of the 105 actions that
 * roll a check, exactly TWO declare all seven degrees. The other 103
 * declare a subset, and every one of them could already print a banner
 * naming a result its own text does not have — Mount/Dismount's "Heroic"
 * over an outcome card reading "Success" was one of 103, not a one-off.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND AT 3.510.0 IT BECAME THE DEGREE ITSELF, not only the banner.
 *
 * Graham, on the Kip Up card: "Please follow the rulebook", and quoted
 * it — Success, Failure, Fumble, and nothing else. A Heroic Kip Up is
 * not a fourth state for the table to adjudicate; the book gives three
 * results and the dice land on one of them. So the ACTION'S degree is
 * resolved here too, and the check card, the outcome card and every
 * per-action handler read the same word.
 *
 * WHAT DOES NOT MOVE IS THE CHECK'S OWN RESULT. `outcome.degree` on the
 * roll still carries what the dice produced, so the Chaos gate — which
 * Graham kept for Mount in the same breath — still sees a fumble, and so
 * do the Bonus Check Table and the open-ended machinery. The rulebook
 * decides what the ACTION did; the dice still decide what was rolled.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND AT 3.545.0 IT BECAME A DECLARED LADDER, because "nearest on the
 * same side" was wrong in BOTH directions.
 *
 * Graham, 9 Sep 2026: "Not all actions display information for a failure
 * (such as Treat Wounds), but a Failure is always a Failure regardless."
 *
 * The old rule picked the nearest declared degree on the achieved side,
 * ties to the milder. It never crossed the success/failure line, which
 * was the thing it was written to guarantee — and inside a side it
 * wandered freely. Measured across the 101 actions before the repair,
 * 77 banner answers were wrong:
 *
 *   TREAT WOURDS declares critical, success, partial, fumble. A FAILURE
 *   displayed as "Partial" — announced as better than it was.
 *
 *   NINETEEN ACTIONS declare critical, success, fumble. A PARTIAL — the
 *   mildest failure there is — displayed as "Fumble", two steps worse
 *   than it was rolled, and a Failure did the same.
 *
 *   SIX declare critical and success only. A BLUNDER displayed as
 *   "Partial", the worst result in the game announced as the mildest.
 *
 *   ONE declares critical alone. A plain SUCCESS displayed as
 *   "Critical" — an upgrade, on the success side, from a rule whose
 *   whole premise was that it never flattered a result.
 *
 * SO THE FALLBACK IS DECLARED, NOT DERIVED. Graham's ladder, verbatim:
 *
 *   Heroic   → Critical → Success
 *   Critical → Success
 *   Success  → every action has this result
 *   Partial  → Failure
 *   Failure  → the action fails and nothing happens
 *   Fumble   → Failure
 *   Blunder  → Fumble → Failure
 *
 * A distance function cannot express this: Blunder skips Partial
 * entirely, and Partial does not fall back to Fumble even though Fumble
 * is one step away. The ladder walks DOWN toward Failure and UP toward
 * Success, and stops at the terminal of its own chain whether or not the
 * action declares it — because a Failure with no text is still a Failure,
 * it simply means the action fails and nothing happens.
 *
 * TAKES THE DECLARED KEYS, NOT THE ACTION. The check card is rebuilt
 * from a persisted flag long after the action object is gone — a held
 * bonus spent on an old card re-renders it — so the list travels with the
 * card rather than being looked up again from data the card cannot reach.
 *
 * @param {string[]} declaredKeys the degrees this action declares text for
 * @param {string|null} degree the degree the check achieved
 * @param {object[]} degrees the DEGREES table, injected to stay pure
 * @returns {string|null} the degree key to display
 */
export function declaredDegree(declaredKeys, degree, degrees = []) {
  const key = String(degree ?? "");
  if (!key) return degree ?? null;
  const table = Array.isArray(degrees) ? degrees : [];
  if (!table.some((d) => d.key === key)) return key;

  // AN ACTION THAT DECLARES NOTHING IS LEFT ALONE. Five actions carry no
  // outcome text at all, and every check rolled outside the action
  // workflow carries no list either; cutting those banners down to
  // nothing would say less than the card says today. An empty list means
  // "not asked", not "declares none of them".
  const listed = new Set((Array.isArray(declaredKeys) ? declaredKeys : []).map(String));
  if (!listed.size) return key;

  const chain = DEGREE_FALLBACK[key];
  if (!chain) return key;

  const found = chain.find((step) => listed.has(step));
  // THE TERMINAL STANDS EVEN UNDECLARED, which is the whole ruling. An
  // action with no Failure text still fails on a Failure — it simply says
  // nothing about it — and it must not borrow the Partial text sitting
  // next door to have something to print.
  return found ?? chain[chain.length - 1];
}

/**
 * The key AND THE WORD a card's banner should carry.
 *
 * THE FIRST VERSION RETURNED ONLY THE KEY, AND THE BANNER DID NOT MOVE.
 * Found live at 3.508.0: the card still read "Heroic" over an outcome
 * card reading "Success", because `check-card.hbs` renders the banner
 * from `outcome.degree.label` and uses `degreeKey` only for the CSS
 * class. The rule was right, the plumbing was right, the card was
 * coloured by the collapsed degree — and the WORD came from somewhere I
 * had not changed.
 *
 * Every check I wrote ran `bannerDegree` and passed. A check that runs
 * the rule but never the thing that displays it cannot catch this, which
 * is why the label is derived here, where a check can assert it, rather
 * than in the template where it cannot.
 *
 * @param {string[]} declaredKeys the degrees this action declares text for
 * @param {string|null} degree the degree the check achieved
 * @param {object[]} degrees the DEGREES table, injected to stay pure
 * @returns {{key: string|null, label: string}}
 */
export function bannerDisplay(declaredKeys, degree, degrees = []) {
  const key = declaredDegree(declaredKeys, degree, degrees);
  const table = Array.isArray(degrees) ? degrees : [];
  const found = table.find((d) => d.key === key);
  return { key: key ?? null, label: found?.label ?? "" };
}

/**
 * What the card says when the resolved degree has no text of its own.
 *
 * NEW at 3.545.1, and PURE FOR THE REASON `bannerDisplay` IS: the first
 * version of this lived inline in `resolveAction`, where no check could
 * reach it, and it spent a release contradicting the very ladder the
 * release was written to build. A rule a check cannot run is a rule that
 * drifts.
 *
 * ONLY `success` AND `failure` REACH THIS, structurally — every fallback
 * chain terminates at one of the two, so a resolved degree with no text
 * is one of them. The list fallback is kept for a terminal a later
 * ruling might add, not as live behaviour.
 *
 * @param {string|null} degree the RESOLVED degree (post-ladder)
 * @param {Array<{key: string, text: string}>} listed pickOutcome's `listed`
 * @returns {{line: string|null, showList: boolean}}
 */
export function unmatchedOutcomeLine(degree, listed = []) {
  if (!Array.isArray(listed) || !listed.length) return { line: null, showList: false };
  if (degree === "failure") {
    return { line: "The action fails and nothing happens.", showList: false };
  }
  if (degree === "success") {
    return { line: "The action succeeds.", showList: false };
  }
  return {
    line: `The action lists no ${degree} outcome — the table adjudicates from the listed results:`,
    showList: true
  };
}

/**
 * Which declared outcomes a no-check card should print.
 *
 * THE CARD SAID IT SUCCEEDED AND THEN OFFERED THE FAILURE LINE. Found
 * live at 3.506.0, on Mount/Dismount's first card out of combat:
 *
 *     No encounter is running, so Mount / Dismount succeeds
 *     automatically — there is nothing to roll.
 *     Success: You mount, or dismount and end adjacent to the mount.
 *     Failure: You do not get on or off. The AP is spent.
 *
 * The no-check path prints EVERY declared outcome, which is right for the
 * actions it was written for — Avert Gaze and its neighbours list their
 * degrees for the table to adjudicate, because nothing decided one. It is
 * wrong for an action that has definitely succeeded, and it is the same
 * mistake as the remainder line two releases ago: a sentence added above
 * a block that was not re-read.
 *
 * @param {object} action the static definition
 * @param {Array<{key: string, text: string}>} listed pickOutcome's `listed`
 * @returns {Array<{key: string, text: string}>}
 */
export function listedOutcomesFor(action, listed = []) {
  const rows = Array.isArray(listed) ? listed : [];
  if (!action?.checkInEncounterOnly) return rows;
  return rows.filter((entry) => entry?.key === "success");
}
