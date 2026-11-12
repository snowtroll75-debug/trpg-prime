/**
 * THE REACTIONS, THE PURE HALF (3.681.0; Eldritch Arts Block 3b, built from
 * the Block 3b audit and Graham's answer of 2 November 2026, "Go with your
 * proposals"). What a check's degree means to a reaction, which checks a
 * reaction may meet, a critical's disadvantage, and the reroll's dice. The
 * Foundry side is reactions-workflow.mjs.
 */

/**
 * Q26: "succeeds" is Success or better; "fails" is Failure or worse; a
 * Partial is neither. An attack's verdict is its hit, read by the caller.
 * @param {string} degree a DEGREES key
 * @returns {{succeeded: boolean, failed: boolean}}
 */
export function degreeVerdict(degree) {
  const key = String(degree ?? "").trim().toLowerCase();
  return {
    succeeded: ["heroic", "critical", "success"].includes(key),
    failed: ["failure", "fumble", "blunder"].includes(key)
  };
}

/**
 * Which of the three checks the printed reactions name ("an attack check,
 * saving throw or skill check") this roll is, or "". A spell attack's casting
 * check is its attack check, and says so with `reactionAs: "attack"`.
 * @param {{type?: string, reactionAs?: string}} check
 */
export function reactionCheckType(check) {
  const as = String(check?.reactionAs ?? "").trim().toLowerCase();
  if (as === "attack") return "attack";
  const type = String(check?.type ?? "").trim().toLowerCase();
  return ["attack", "save", "skill"].includes(type) ? type : "";
}

/**
 * A critical's injury roll with a disadvantage added (Eternity Resilience):
 * a deadly critical's advantage and the disadvantage cancel; serious becomes
 * disadvantage; minor already has it. The mirror of `biasWithAdvantage`.
 */
export function biasWithDisadvantage(bias) {
  return bias === "advantage" ? "normal" : "disadvantage";
}

/**
 * Q27: the reroll's modifiers are the first roll's, less the first roll's
 * Conviction die, which was spent on dice that are no longer read.
 * @param {Array<{label?: string}>} modifiers
 */
export function withoutConvictionDie(modifiers) {
  return Array.from(modifiers ?? []).filter((m) => !/^Conviction \(\+1d6/.test(String(m?.label ?? "")));
}

/**
 * Whether the d20 exploded (an open-ended 20 or 1): Missed Chance "cannot be
 * used to force a reroll if the d20 exploded".
 * @param {{chosen?: {exploded?: boolean}}|null} dice a check's `dice`
 */
export function diceExploded(dice) {
  return Boolean(dice?.chosen?.exploded);
}

/**
 * A HIT MADE A MISS (3.685.0, H6; Eldritch Arts' Mirror Reprise: "roll a d100
 * to determine whether the attack instead targets one of your duplicates … If
 * an attack hits a duplicate, the duplicate is destroyed"). An attack check's
 * `after` reaction may answer `{ miss: true, line }`: the hit is a miss
 * against this creature — no damage, no critical, nothing on a hit. Only a
 * hit can be made a miss. Pure.
 *
 * @param {object} outcome an attack outcome ({ resolved, hits, critical, … })
 * @returns {object} the same outcome, missed
 */
export function missedByReaction(outcome) {
  if (!outcome?.hits) return outcome;
  // AND NOTHING THAT ONLY A HIT CARRIES (3.685.0, review): a forgiven miss
  // (Weapon Supremacy), a glancing blow, an automatic hit — the card reads
  // them, and a reaction-made miss is none of them.
  return { ...outcome, hits: false, critical: null, forgiven: false, glancing: false, autoHit: false, missedByReaction: true };
}
