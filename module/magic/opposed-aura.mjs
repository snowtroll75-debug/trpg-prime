/**
 * "A CREATURE WITH AN OPPOSING AURA TYPE TO YOUR OWN."
 *
 * NEW at 3.446.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE QUESTION THREE SPELLS WERE WAITING ON.
 *
 * `strike-riders.mjs` recorded it when Spoil The Profane hit it, and
 * named the other two: *"Nothing in this system knows what an opposing
 * aura is — the phrase appears in no module — and Radiant Aegis and
 * Wellspring Of Valour are waiting on the same question."* Measured
 * again on 31 August 2026 before asking: the word "aura" appears in the
 * packs only in ten divine-aspect descriptions, as flavour, with no
 * structured field anywhere.
 *
 * GRAHAM'S RULING, 31 August 2026: **it is the Aligned trait.**
 *
 * So this file is thin on purpose. `creature-traits.mjs` has carried
 * `ALIGNMENT_OPPOSITES` since the Codex's Chapter 7 work, and
 * `alignedDamageAffects` already asks almost this question from the
 * damage side. Nothing new is invented here; the existing relation is
 * given the name three spells use for it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BALANCE OPPOSES NOBODY, AND THAT IS NOT AN OVERSIGHT.
 *
 * `ALIGNMENT_OPPOSITES` pairs good↔evil and chaos↔order and stops. The
 * appendix's own gloss for Balance is "neutrality, maintaining
 * equilibrium between opposing forces" — a trait defined by standing
 * between the pairs rather than at one end of one. So a Balance-aligned
 * caster's aura opposes nothing, and both spells grant a bonus that can
 * never apply.
 *
 * THAT IS WORTH SAYING OUT LOUD RATHER THAN SILENTLY RETURNING FALSE,
 * which is why `opposingTraitsOf` returns an empty list a caller can
 * notice and print. A Cleric of Balance who casts Radiant Aegis and sees
 * no bonus should be told why, not left to wonder whether it is broken —
 * the Stone Shield lesson, where "cover from one chosen enemy" sat in a
 * note beside an unconditional +4.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AN UNALIGNED CASTER IS THE SAME CASE. Most player characters carry no
 * aligned trait at all, so most casts of these spells grant nothing. That
 * is what the printed rule says, and it is the reason the cast card must
 * name the traits it is keyed to rather than quietly granting zero.
 */

import { ALIGNMENT_OPPOSITES, hasCreatureTrait } from "../creature-traits.mjs";
import { alignedTraitsOf } from "../aligned.mjs";

/**
 * The traits that OPPOSE this creature's own aligned traits.
 *
 * RESOLVED ONCE, AT THE CASTER, and stored — rather than re-derived at
 * every attack from a caster who may since have died, walked off the
 * scene, or changed form. The bonus these spells grant is "against
 * creatures with an opposing aura type to YOUR OWN", so whose aura it is
 * measured against is a fact about the cast.
 *
 * @param {object} actorSystem the caster's `system`
 * @returns {string[]} the opposing traits, lowercase; empty when the
 *   caster carries no aligned trait, or only Balance
 */
export function opposingTraitsOf(actorSystem) {
  const mine = alignedTraitsOf(actorSystem) ?? [];
  const out = [];
  for (const trait of mine) {
    const opposite = ALIGNMENT_OPPOSITES[String(trait ?? "").trim().toLowerCase()];
    // BALANCE FALLS OUT HERE, having no entry in the pairs table.
    if (opposite && !out.includes(opposite)) out.push(opposite);
  }
  return out;
}

/**
 * Does this creature carry one of those opposing traits?
 *
 * TAKES THE RESOLVED LIST rather than the caster, so the attack-time
 * question is answered against what the cast recorded — see above — and
 * so the defence-DC channel can carry the list as one more axis beside
 * the attacker types it already matches on.
 *
 * NOT EXPORTED. `opposedAuraAttackBonus` is the public way to ask, and
 * the defence side asks it through `defenceDCBonus`'s own axis filter —
 * so an exported copy would be a rule nobody outside this file calls,
 * which the uncalled-export ratchet correctly refuses. The same call
 * `thorns.mjs` made about its two constants, and for the same reason:
 * stopping exporting is the honest answer, not a "harness-only" keep.
 *
 * @param {string[]} opposingTraits from `opposingTraitsOf`
 * @param {object} otherSystem the creature being tested
 * @returns {boolean}
 */
function carriesOpposingAura(opposingTraits, otherSystem) {
  const list = Array.isArray(opposingTraits) ? opposingTraits : [];
  if (!list.length) return false;
  return list.some((trait) => hasCreatureTrait(otherSystem, trait));
}

/**
 * What the cast card should say about whose aura this is keyed to.
 *
 * SAID EVERY TIME, INCLUDING WHEN IT IS NOTHING. An unaligned or
 * Balance-aligned caster grants a bonus that can never apply, and a card
 * that printed the bonus without the condition would be the Stone Shield
 * defect again — automation's clothes on a reminder.
 *
 * @param {string[]} opposingTraits
 * @returns {string}
 */
export function opposedAuraLine(opposingTraits) {
  const list = Array.isArray(opposingTraits) ? opposingTraits.filter(Boolean) : [];
  if (!list.length) {
    return "you carry no opposing aura — this bonus has nothing to apply against";
  }
  const named = list.map((t) => String(t).charAt(0).toUpperCase() + String(t).slice(1));
  const joined = named.length === 1
    ? named[0]
    : `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}`;
  return `only against creatures with the ${joined} trait`;
}

/** Where a creature's opposed-aura attack bonuses are recorded. */
export const OPPOSED_AURA_FLAG = "opposedAuraAttack";

/**
 * The attack modifier an opposed-aura aura grants against THIS target.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MIRROR OF `defenceDCBonus`'s ALIGNMENT AXIS, AND DELIBERATELY NOT
 * THE SAME FUNCTION.
 *
 * Wellspring Of Valour grants "a +1 status bonus to attack rolls vs any
 * creatures of an opposed aura"; Radiant Aegis grants "+1 to DB against
 * attacks made by creatures with an opposing aura". Those are the two
 * sides of one roll, and `defence-dc.mjs`'s own header sets out why they
 * are kept apart rather than merged: one answers "what modifies the roll
 * I am about to make" and the other "what does the person I am rolling
 * against bring". Merging them would make every entry declare which side
 * of the roll it lives on.
 *
 * So the DEFENCE side rides the existing channel as one more axis, and
 * this is the ATTACK side — shaped like `huntPreyBonus`, which is the
 * nearest existing thing: a modifier pushed when a fact about THIS
 * target is true.
 *
 * HIGHEST WINS, not sum. These are status bonuses by the spells' own
 * words, and Appendix 1 governs: two auras over one fighter do not
 * stack. Resolved here rather than at the call site so the answer is the
 * same wherever it is asked.
 *
 * @param {object[]} records what the attacker is carrying
 * @param {object} targetSystem the creature being attacked
 * @returns {{label: string, value: number, type: string}|null}
 */
export function opposedAuraAttackBonus(records, targetSystem) {
  let best = null;
  for (const record of Array.from(records ?? [])) {
    const value = Math.trunc(Number(record?.value) || 0);
    if (value <= 0) continue;
    if (!carriesOpposingAura(record?.opposedTo, targetSystem)) continue;
    if (!best || value > best.value) {
      best = {
        label: String(record?.label ?? "Opposed aura"),
        value,
        type: String(record?.type ?? "status")
      };
    }
  }
  return best;
}

/**
 * The conditional records one `opposedAura` bonus row becomes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO END, found by casting Radiant Aegis in
 * Graham's world on 31 August 2026 — in the spell this whole design was
 * built to protect.
 *
 * There are TWO paths that place an emanation's effects, and 3.446.0
 * taught only one of them about conditional bonuses:
 *
 *   - `emanationEffectData` places them on a creature CROSSING the
 *     boundary later. That one was handled, driven and checked.
 *   - `applySpellEffects` places them on the creatures caught AT THE
 *     CAST. That one still ran the ordinary `bonus` case, so the cast
 *     wrote `system.combat.defence.status = 1` onto every ally in the
 *     circle. Ally's DB read **11**, up from 10, against everybody.
 *
 * So the spell shipped as an unconditional +1 to Defence — which is the
 * Stone Shield defect exactly, and the very thing `opposedAura` was
 * invented to prevent. The harness missed it because it drove the
 * boundary path and ASSUMED the cast used the same one: the "is it
 * REACHED?" question asked of one caller and not the other.
 *
 * THE ROUTING LIVES HERE, so the two callers cannot diverge again. Both
 * ask this function what a conditional row becomes, and neither decides
 * for itself.
 *
 * @param {object} effect the `bonus` row, already warped
 * @param {string[]} opposedTo the caster's opposites, resolved at the cast
 * @param {string} label what the card and the entry call it
 * @returns {{defenceDC: object[], attack: object[]}} records to file on
 *   the placed effect's flags — never a sheet change
 */
export function opposedAuraRecordsFor(effect, opposedTo, label) {
  const value = Number(effect?.value) || 0;
  const type = effect?.bonusType || "status";
  const list = Array.isArray(opposedTo) ? opposedTo : [];
  const name = String(label ?? "Opposed aura");
  // THE SLOT DECIDES WHICH SIDE OF THE ROLL IT LIVES ON, and only these
  // two are routed. A row naming any other slot is refused by the caller
  // rather than silently placed as an unconditional bonus — the failure
  // this function was written after.
  if (String(effect?.slot ?? "").trim().toLowerCase() === "attack") {
    return { defenceDC: [], attack: [{ label: name, value, type, opposedTo: list }] };
  }
  return {
    defenceDC: [{ dc: "defence", value, label: name, when: { sourceAlignments: list } }],
    attack: []
  };
}
