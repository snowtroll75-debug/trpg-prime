/**
 * DEATH MARK — the Assassin's mark, and what an attack against it gains.
 *
 * NEW at 3.586.3. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * REPORTED FROM A LIVE TABLE, 24 September 2026: *"Death Mark is doing
 * nothing."* It was right, and so was the report about Agile Display
 * beside it.
 *
 * Death Mark has had a Use handler since 3.185.0, with an AP cost, a
 * target picker and a card. What it did was create an ActiveEffect
 * carrying a NAME and a DESCRIPTION and nothing else — no `changes`, no
 * flags, nothing any rule reads. The release notes for it said the
 * handler "records the mark as an effect with the +2/Deadly rules", and
 * that was true in the only sense that does not matter: the rules were
 * recorded as English, for a person to apply by hand.
 *
 * The pages 111-120 audit then measured automation coverage across 99
 * feats, put Death Mark in the "code" tier, and wrote that the three
 * archetype abilities "are all built as real Use handlers with AP costs,
 * targeting and checks". Every word of that is true and the conclusion
 * was wrong, because what was measured was whether a HANDLER EXISTED
 * with the right name — not whether anything happened when it ran. It is
 * the same shape as Acid Arrow's Sustain and last week's C25: presence
 * standing in for effect.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MARK IS A UUID, NOT A NAME.
 *
 * The old handler accepted a typed name when nothing was targeted, which
 * is fine for a sentence on a card and useless to a rule: every channel
 * that can scope to one creature — the conditional engine's
 * `targetUuids`, the defence-DC channel's `sourceUuids`, the damage
 * riders' `targetUuids` — matches on a uuid. So the automated half
 * requires a real target, and the handler says so plainly rather than
 * marking a string nothing can compare against.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO HALVES, TWO CHANNELS, AND NEITHER IS NEW.
 *
 * THE +2 rides `conditionals.mjs`, scoped `targetUuids: [the mark]`.
 * That axis has been carried into every attack since 3.415.0 and into
 * skill actions since 3.567.0, and it exists for exactly this sentence
 * shape — "against that creature". Nothing here needed building.
 *
 * THE DEADLY TRAIT rides the `deadly` boolean `resolveAttack` already
 * computes from the weapon's trait line, which is the single thing every
 * critical-severity rule in the game reads. Granting a trait by widening
 * the one test for it is how Keen's material grant was fixed at 3.573.0;
 * a parallel path would be a second answer to "is this blow deadly".
 */

/** The flag a Death Mark effect carries, under the system namespace. */
export const DEATH_MARK_FLAG = "deathMark";

const text = (v) => String(v ?? "").trim();

/**
 * Who this attacker has marked, or "" if nobody.
 *
 * A DISABLED EFFECT MARKS NOBODY, which is the same rule
 * `collectConditionals` and `declaredDamageRiders` already apply — and
 * it is what makes an Antimagic Field switch the mark off with
 * everything else rather than leaving one rule running inside it.
 *
 * @param {Iterable} effects the attacker's effects
 * @param {string} systemId
 * @returns {string} the marked creature's actor uuid, or ""
 */
export function markedUuidOf(effects, systemId = "trg-prime") {
  for (const effect of effects ?? []) {
    if (effect?.disabled) continue;
    const mark = effect?.flags?.[systemId]?.[DEATH_MARK_FLAG];
    const uuid = text(mark?.uuid);
    if (uuid) return uuid;
  }
  return "";
}

/**
 * Does this blow qualify for the mark's Deadly rider?
 *
 * "Agile, finesse, unarmed and first-increment ranged attacks against it
 * gain the Deadly trait."
 *
 * THE RANGED CLAUSE IS A DISTANCE, NOT A WEAPON. The other three are
 * facts about what is in your hand; "first increment" is a fact about
 * where the two of you are standing, and a shot beyond it does not
 * qualify however agile the bow is. Unknown distance — no token, no
 * measurement — is NOT treated as within: a rule that fires when nothing
 * can be measured is a rule that fires always.
 *
 * A MELEE ATTACK IS NOT ASKED ABOUT RANGE. `withinFirstIncrement` is
 * consulted only on the ranged branch, so a finesse dagger in melee
 * qualifies on its trait and is never measured against an increment it
 * does not have.
 *
 * @param {object} state
 * @param {string} state.markedUuid who this attacker has marked
 * @param {string} state.targetUuid who is being struck
 * @param {boolean} state.agile
 * @param {boolean} state.finesse
 * @param {boolean} state.unarmed
 * @param {boolean} state.isRanged
 * @param {boolean} state.withinFirstIncrement
 * @returns {boolean}
 */
export function deathMarkQualifies({
  markedUuid = "", targetUuid = "", agile = false, finesse = false,
  unarmed = false, isRanged = false, withinFirstIncrement = false
} = {}) {
  const marked = text(markedUuid);
  if (!marked || marked !== text(targetUuid)) return false;
  if (isRanged) return Boolean(withinFirstIncrement);
  return Boolean(agile || finesse || unarmed);
}

/**
 * What a qualifying blow gains.
 *
 * "…gain the Deadly trait (already-Deadly weapons: +1 damage)."
 *
 * TWO ANSWERS FROM ONE QUESTION, because the page gives the weapon that
 * already has the trait something else instead — and a rule that
 * returned only the boolean would silently give a Deadly weapon nothing
 * at all, which is the reading a hurried implementation reaches for.
 *
 * @param {boolean} qualifies from `deathMarkQualifies`
 * @param {boolean} alreadyDeadly whether the weapon prints the trait
 * @returns {{grantsDeadly: boolean, damageBonus: number}}
 */
export function deathMarkDeadly(qualifies, alreadyDeadly = false) {
  if (!qualifies) return { grantsDeadly: false, damageBonus: 0 };
  return alreadyDeadly
    ? { grantsDeadly: false, damageBonus: 1 }
    : { grantsDeadly: true, damageBonus: 0 };
}

/**
 * The conditional rows a mark places on its owner.
 *
 * AUTHORED RAW, not normalised: `collectConditionals` normalises every
 * row it harvests from an effect's flags, so writing pre-normalised
 * entries here would mean two shapes for one thing.
 *
 * NOT `auto`. The +2 is "to Attack, Perception and Feint actions against
 * it" — the attack half a check could settle by itself, but Perception
 * and Feint against a specific creature are judgements about what the
 * roll is FOR, and conditionals.mjs's rule is that a scope the dice
 * cannot see is offered rather than applied. Offered unticked, with the
 * mark's name in the scope line, is the honest form.
 *
 * @param {string} uuid the marked creature's actor uuid
 * @param {string} name its name, for the dialog row
 * @returns {object[]} raw conditional rows
 */
export function deathMarkConditionals(uuid, name = "your mark") {
  const marked = text(uuid);
  if (!marked) return [];
  const who = text(name) || "your mark";
  const row = (scope, when) => ({
    kind: "modifier", value: 2, type: "circumstance", label: "Death Mark",
    scope, when: { ...when, targetUuids: [marked] }
  });
  return [
    row(`Attack rolls against ${who}`, { checkTypes: ["attack"] }),
    row(`Perception checks against ${who}`, { checkTypes: ["skill"], subjects: ["perception"] }),
    row(`Feint against ${who}`, { actions: ["feint"] })
  ];
}
