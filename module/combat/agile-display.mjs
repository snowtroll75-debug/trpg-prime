/**
 * AGILE DISPLAY (Gymnast core ability; Flourish, Movement) — the pure half,
 * NEW at 3.684.2. The Foundry half is the "agile display" use in
 * feats-workflow.mjs.
 *
 * The book: "Action 1 AP. You Step 5 feet and may attempt an Acrobatics
 * check against the Reflex DC of one adjacent creature with the following
 * results: Critical you may immediately Tumble through their space as part
 * of this action. Furthermore, the creature is Flat-Footed against your
 * next melee Strike which must be made before the end of your turn. Success
 * the creature is Flat-Footed against your next melee Strike which must be
 * made before the end of your turn. Failure no further effect. Blunder you
 * fall prone and your turn ends."
 *
 * Graham, 5 November 2026: "When activated, this should allow the character
 * to step as a free (0 AP) action but does not seem to work. Also, the
 * character should be able to select any target once the use ability is
 * clicked that is within step range to target."
 *
 * Both were so. The use charged its 1 AP and rolled, but granted no Step —
 * the drag that followed was charged again as a Stride or a Step — and it
 * read its creature only from a target chosen before Use.
 *
 *   agileDisplayReach       how far away a creature may be: the Step, plus
 *                           the 5 ft of adjacency at its end
 *   agileDisplayCandidates  the creatures within that reach, nearest first
 *   agileDisplayDefault     the choice the chooser opens on
 *   agileDisplayLeg         the free Step, as a compound leg
 *   agileDisplayStepLine    the card's Step line
 *   nextActionLegLapses     whether another action has taken the Step's place
 *                           (3.684.5; a reaction never does, 3.684.6)
 *   nextActionLegRestores   whether a cancelled action's refund gives the
 *                           Step back (3.684.6)
 *   strikeSpendsReaction    whether a Strike is made with the reaction (3.684.6)
 *
 * THE STEP MUST BE THE NEXT ACTION (3.684.5). Graham, 5 November 2026: "The
 * step must be the next action, if the character does something else, the
 * free step is removed." The leg carries `nextAction: true`; any other action
 * first (anything that spends AP, a basic action, a Strike) removes it — see
 * movement-workflow.mjs `lapseNextActionLeg`. Other compound legs carry no
 * such mark and are unchanged.
 *
 * A REACTION, A REFUSAL AND A CANCEL KEEP IT (3.684.6). Graham, 5 November
 * 2026: "A reaction should not affect it", and "Yes" to "Should an action
 * that is refused or cancelled keep the Step?". So the leg lapses where an
 * action is taken (its cost spent and kept), never at the click: a reaction
 * (a reaction Strike, a reaction-cost basic action, a reaction spell or
 * feat) passes `reaction: true`; a basic action that is refused never
 * reaches its commit point; and an action whose AP is refunded (a spell
 * whose targeting is cancelled) gives the Step back.
 */

/** The "no check" choice's value. */
export const AGILE_DISPLAY_NO_CHECK = "none";

/**
 * ADJACENT NOW OR ADJACENT AFTER THE STEP: the Step's feet, plus 5.
 * @param {number} stepFeet
 */
export function agileDisplayReach(stepFeet) {
  const step = Math.max(0, Math.trunc(Number(stepFeet) || 0)) || 5;
  return step + 5;
}

/**
 * The creatures the check may be made against.
 * @param {Array<{id: string, feet: number|null}>} rows one per other token,
 *   with its distance from the user's token (null when it could not be measured)
 * @param {number} reach from `agileDisplayReach`
 * @returns {Array} the rows within reach, nearest first (stable)
 */
export function agileDisplayCandidates(rows = [], reach = 10) {
  const limit = Number(reach);
  return (Array.isArray(rows) ? rows : [])
    .map((row, i) => ({ row, i, feet: row?.feet === null || row?.feet === undefined ? NaN : Number(row.feet) }))
    .filter(({ row, feet }) => row && Number.isFinite(feet) && feet <= limit)
    .sort((a, b) => a.feet - b.feet || a.i - b.i)
    .map(({ row }) => row);
}

/**
 * The choice the chooser opens on: the token already targeted, if it is a
 * candidate; otherwise "no check".
 */
export function agileDisplayDefault(candidates = [], targetedId = null) {
  const id = String(targetedId ?? "");
  return id && (candidates ?? []).some((c) => String(c?.id) === id) ? id : AGILE_DISPLAY_NO_CHECK;
}

/**
 * THE STEP, FREE OF AP: a land-Speed compound leg of the Step's distance
 * that provokes no reactions and counts as a Step (movement.mjs
 * `armedMovementKind`). The action's 1 AP has already paid for it.
 */
export function agileDisplayLeg(stepFeet) {
  const maxFeet = Math.max(0, Math.trunc(Number(stepFeet) || 0)) || 5;
  return { speedKey: "land", maxFeet, provokes: false, countsAs: "step", note: "Agile Display's Step", nextAction: true };
}

/**
 * WHETHER THE ARMED LEG LAPSES (3.684.5): only a leg marked `nextAction` that
 * is still the armed movement. With `apNow` (an AP write seen after the fact),
 * only when the pool has fallen below what it was when the leg was armed
 * (`apAtArm`); without it, the caller is taking another action, so it lapses.
 *
 * @param {string|null} armed the actor's armed movement key
 * @param {object|null} leg the actor's compound leg flag
 * @param {{apNow?: number|null, reaction?: boolean}} [opts] `reaction`: the
 *   action is made with the reaction, not AP (3.684.6)
 * @returns {boolean}
 */
export function nextActionLegLapses(armed, leg, { apNow = null, reaction = false } = {}) {
  // A REACTION NEVER TAKES ITS PLACE (3.684.6; Graham: "A reaction should
  // not affect it").
  if (reaction === true) return false;
  if (String(armed ?? "") !== "compoundLeg" || leg?.nextAction !== true) return false;
  if (apNow === null || apNow === undefined) return true;
  const at = Number(leg.apAtArm);
  return Number.isFinite(at) && Number(apNow) < at;
}

/**
 * WHETHER A REFUND GIVES THE STEP BACK (3.684.6; Graham: a cancelled action
 * keeps the Step). `saved` is `{ leg, apBefore }`, kept by the AP spend that
 * removed the leg: the leg as it was, and the pool just before that spend.
 * It is kept only until another action is taken, so a refund can only be
 * that spend's. The leg comes back only when nothing has been armed since
 * (no armed movement, no other leg) and the refund has returned the pool to
 * what it was before that spend — not merely to what it was at Agile
 * Display (found in review: a Step a Free action had removed came back with
 * a cancelled spell's AP).
 *
 * @param {{leg: object, apBefore: number}|null} saved
 * @param {{armed?: string|null, leg?: object|null, apNow?: number}} now
 */
export function nextActionLegRestores(saved, { armed = null, leg = null, apNow = NaN } = {}) {
  if (saved?.leg?.nextAction !== true || (armed !== null && armed !== undefined) || leg) return false;
  const before = Number(saved.apBefore);
  return Number.isFinite(before) && Number(apNow) >= before;
}

/**
 * WHETHER A STRIKE IS MADE WITH THE REACTION (3.684.6): an Attack of
 * Opportunity (`isReaction`), a readied Strike (Ready's reaction pays for
 * it), or a reaction feat's Strike whose MAP is frozen (`asReaction`).
 */
export function strikeSpendsReaction({ isReaction = false, readied = false, asReaction = false } = {}) {
  return Boolean(isReaction) || Boolean(readied) || Boolean(asReaction);
}

/** The card's Step line. */
export function agileDisplayStepLine(stepFeet) {
  const feet = Math.max(0, Math.trunc(Number(stepFeet) || 0)) || 5;
  return `<strong>Step:</strong> drag the token up to ${feet} ft — no AP, no reactions provoked.`;
}
