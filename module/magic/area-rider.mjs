/**
 * A RIDER THAT COMES FROM THE GROUND, NOT FROM THE ATTACKER.
 *
 * NEW at 3.465.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONSECRATE AND DESECRATE ARE ONE SENTENCE TWICE.
 *
 *   CONSECRATE  "All undead creatures within the consecrated area suffer
 *                a -2-circumstance penalty to all actions and DCs.
 *                Furthermore, all attacks made against undead creatures
 *                within the consecrated area gain a +2-circumstance bonus
 *                and inflict 1d4 essence secondary damage."
 *
 *   DESECRATE   the same, with "living" for "undead".
 *
 * "SECONDARY" IS THE BOOK'S OWN WORD AGAIN — the word the rune chapter
 * uses and the word `strike-riders.mjs` was built around. So this
 * produces packets in exactly the shape `riderPacket` returns and they
 * join the SAME loop in `resolveWeaponDamage`, for the reason recorded
 * there: a second loop would be a second place deciding how secondary
 * damage meets a defence.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS A NEW MECHANISM RATHER THAN A NEW ROW.
 *
 * Every rider until now hangs on the ATTACKER — an effect on the actor
 * swinging, gathered by `strikeRidersOn(actor)`. These two hang on the
 * TARGET'S LOCATION and on what the target IS. The archer may be a
 * hundred feet outside the consecrated ground and still get the die,
 * because the sentence is about where the undead is standing, not where
 * the bow is. So the source is the scene's live emanations, and the test
 * is the target's own square.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 2 September 2026: THE SYSTEM APPLIES IT.
 *
 * Asked whether this should be automated or printed for the table the way
 * Spoil The Profane's opposing-aura clause is, he chose automatic. The
 * two questions the sentence asks are both ones this system can already
 * answer without inventing anything: the area is a live emanation with a
 * Region that knows its own extent, and `isUndead` has been in
 * aligned.mjs since the creature-type work. Spoil prints because NOTHING
 * in the system knows what an opposing aura is; that is not true here,
 * and a clause that prints when it could act is the anti-silence rule
 * pointed the wrong way.
 *
 * THE CIRCUMSTANCE BONUS IS NOT THIS FILE'S. The same sentence grants
 * attacks a +2 circumstance bonus, which belongs to the attack roll and
 * not to a damage packet. It is declared on the same row so one reader
 * carries the whole sentence, and `areaRiderAttackBonus` hands it to the
 * attack path — but nothing here rolls it.
 */

/** Which creatures an area rider is about. Only two exist so far. */
export const AREA_RIDER_SUBJECTS = Object.freeze(["undead", "living"]);

/** Where an area rider's spec lives on the emanation descriptor. */
export const AREA_RIDER_KEY = "areaRider";

const text = (v) => String(v ?? "").trim();
const DICE = /^([1-9]\d*)d([1-9]\d*)$/i;

/**
 * An area-rider row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normaliseAreaRider(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "areaRider") return null;

  const dice = text(raw.dice);
  if (!DICE.test(dice)) return null;

  // A MISSING DAMAGE TYPE IS REFUSED, the same refusal `normaliseHazard`
  // and `normaliseStrikeRider` make: an empty type means "the weapon's
  // own" elsewhere in this system, and a row that forgot one must not
  // inherit that meaning by omission.
  const damageType = text(raw.damageType).toLowerCase();
  if (!damageType) return null;

  // WHO IT IS ABOUT IS THE WHOLE RULE. Consecrate and Desecrate differ in
  // exactly this word, so a row without it is not a rider that reaches
  // everybody — it is a row nobody can act on.
  const subject = text(raw.subject).toLowerCase();
  if (!AREA_RIDER_SUBJECTS.includes(subject)) return null;

  return {
    label: text(raw.label) || "Consecrated ground",
    dice,
    damageType,
    subject,
    attackBonus: Math.trunc(Number(raw.attackBonus) || 0)
  };
}

/**
 * Does this rider reach the creature being struck?
 *
 * BOTH HALVES, AND THE CALLER OWNS THE SECOND. "Undead creatures WITHIN
 * the consecrated area" is a question about the target's kind and about
 * its position, and only the first is answerable without a canvas — so
 * `inside` is passed in rather than guessed at here, and this file stays
 * drivable by the harness.
 *
 * @param {object|null} spec a normalised row
 * @param {object} target
 * @param {boolean} target.isUndead is the struck creature undead?
 * @param {boolean} target.inside is it standing in the area?
 * @returns {boolean}
 */
export function areaRiderReaches(spec, { isUndead = false, inside = false } = {}) {
  if (!spec) return false;
  if (!inside) return false;
  // "LIVING" IS NOT MERELY "NOT UNDEAD" IN EVERY SYSTEM, but it is in
  // this one: Desecrate's own contrast is with Consecrate, and the pair
  // divides the world between them. Recorded rather than assumed silently
  // so the next reader knows it was a decision.
  return spec.subject === "undead" ? Boolean(isUndead) : !isUndead;
}

/**
 * The circumstance bonus the same sentence grants the attack roll.
 *
 * SEPARATE FROM THE DAMAGE, because it lands somewhere else. Returning it
 * from the same row keeps one reader for one sentence.
 */
export function areaRiderAttackBonus(spec, reached) {
  return spec && reached ? spec.attackBonus : 0;
}

/**
 * A damage packet in the shape `resolveWeaponDamage` already consumes.
 *
 * NOT `conditional`. A conditional packet prints "apply if it applies"
 * and hands the table a judgement call; both halves of this one have been
 * answered by the time a packet exists, so saying otherwise would be the
 * card describing a decision nobody made.
 */
export function areaRiderPacket(spec) {
  if (!spec) return null;
  return {
    key: `area:${spec.label}`,
    label: spec.label,
    dice: spec.dice,
    type: spec.damageType,
    secondaryCritical: null,
    conditional: false,
    against: "",
    parameter: "",
    feedbackOf: null,
    // The rune packet's shape since 3.618.0: a rider is never resolved
    // against its target here, so a conditional one stays "apply if it
    // applies", and it is never added to the strike itself.
    resolved: false,
    applies: !spec.conditional,
    why: "",
    addsToStrike: false
  };
}
