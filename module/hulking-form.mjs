/**
 * Hulking Form (Chapter 5, Beastman racial feat, prerequisite Level 10).
 *
 * NEW at 3.567.0.
 *
 * PRINTED (3.8.2, Graham's corrected wording of 17 September 2026):
 * "In your hybrid shape, you transform into a formidable and imposing
 * beast. While in your hybrid form, you gain the effects of the Size
 * Alteration spell (at base PP cost for 10 minutes), enhancing your
 * physical attributes and granting you additional reach and power."
 *
 * It read "the Enlarge spell" until that day — erratum E4, and the
 * paragraph below records why the question arose at all, because the
 * next person to find "Enlarge" in an old note deserves the answer
 * rather than the search.
 *
 * ───────────────────────────────────────────────────────────────────
 * TWO THINGS THE CORRECTED WORDING SETTLED, AND ONE IT DID NOT.
 *
 * TEN MINUTES, NOT "WHILE THE FORM LASTS". 3.567.0 built the size step
 * to last as long as the hybrid form did, because the old wording gave
 * no duration and the form is what the sentence hangs off. The corrected
 * text gives one, and it is shorter than the form's: hybrid form has no
 * duration at all and ends when you shift back, so a Beastman who stays
 * in form past ten minutes is still a beast and is no longer large. That
 * is a real difference and it is why the size change has its OWN effect
 * with its own clock, rather than riding the Hybrid Form effect as it
 * did for one release.
 *
 * NO PP IS SPENT (Graham, 17 September 2026). "At base PP cost" names
 * WHICH version of the spell you get — the un-warped one, one step, one
 * target — rather than charging you for it. The feat grants the effect
 * outright. This is also the only reading under which a Beastman with no
 * PP pool can use their own racial feat, which is most of them.
 *
 * WHAT THE WORDING STILL SITS AWKWARDLY ON, recorded rather than
 * smoothed over: Size Alteration's base duration is "1 minute (D)", and
 * ten minutes is its +3 PP WARP. So "at base PP cost for 10 minutes" is
 * two different versions of the spell in one parenthesis. The sentence's
 * intent is not in doubt — base effect, ten minutes — and that is what is
 * built; but if the book is tightened again, this is the line to revisit.
 *
 * ───────────────────────────────────────────────────────────────────
 * THERE IS NO ENLARGE SPELL.
 *
 * Not in the pack, and not in the book: "Enlarge" appears exactly twice
 * in TRG Prime 3.8.1 and both are this feat — its description and the
 * note effect that shipped with it. The block-10 audit reported the
 * clause as unimplemented and asked whether it meant the whole spell;
 * Graham ruled on 17 September 2026 that it did. Building that ruling
 * meant first finding out that the spell it names does not exist.
 *
 * THE SPELL IT MEANS IS SIZE ALTERATION (arcane/verdant, PP 6):
 *
 *   "Bolstered by magical power, the target increases in size by one
 *   step. Its equipment grows with it but returns to natural size if
 *   removed. The creature gains all modifiers to size (see Chapter 12).
 *   This spell has no effect on a Large or larger creature."
 *
 * Every element of Hulking Form's own sentence is in that paragraph —
 * "physical attributes" is the Str/Dex size row, "additional reach" is
 * the reach column — which is why it was read as a stale name from an
 * earlier draft rather than a missing spell. That reading was put to
 * Graham rather than assumed, and CONFIRMED on 17 September 2026. The
 * distinction is worth keeping: for one release this module implemented
 * a reading, and it says so above rather than pretending it always had a
 * ruling behind it.
 *
 * AND IT STACKS (Graham, 17 September 2026). The second half of R2 —
 * whether the enlargement stacks with Beastman's own hybrid-form changes
 * or replaces them — went unanswered when the ruling was first given and
 * was built as stacking, on the grounds that nothing printed says
 * otherwise and the hybrid form's own contribution is a bite and natural
 * DR 1, neither of which a size step touches. Confirmed: "R2 Stacking."
 * So the bite, the natural DR and the size step are all live at once, and
 * the harness holds them to that — a later tidy-up that made one replace
 * another would be reversing a ruling, not simplifying a file.
 *
 * NOTE THAT STACKING AND SHARING AN EFFECT ARE DIFFERENT QUESTIONS, and
 * conflating them is what the ten-minute clause exposed. Two changes on
 * one effect always stack, but they also always END TOGETHER. Here they
 * must stack and end separately, so they are two effects — and the one
 * guarantee that mattered about sharing is kept another way: both carry
 * the same feat-source flag, so returning to humanoid form sweeps both.
 *
 * WHAT IS BUILT, AND WHAT IS NOT. The BASE spell: one size step, with
 * every modifier the size table carries, and the Large clause honoured.
 * NOT the warping options — those are purchased with PP at cast time and
 * a feat spends none, so "two steps for +6 PP" is not something Hulking
 * Form has bought. The equipment clause needs no code: nothing in the
 * system scales carried items by their bearer's size.
 *
 * ───────────────────────────────────────────────────────────────────
 * WHY THE SIZE FIELD AND NOTHING ELSE.
 *
 * `system.identity.size` is the one input, and the derivation already
 * fans it out: `prepareAttributes` adds the size row's Str and Dex,
 * `hitPointMax` reads its base HP, and `combat.reach` is assigned from
 * its reach column. Writing those four consequences separately would be
 * four places deciding a question the size table already answers — the
 * defect this project has paid for more than once.
 *
 * THE HP CONSEQUENCE IS REAL AND IS NOT A BUG. Medium's base HP is 30
 * and Large's is 50, so assuming the form raises maximum HP by 20 and
 * dropping it lowers it again. That is what "all modifiers to size"
 * says, and it is the same arithmetic a companion's Increase Size feat
 * has always produced. A character who reverts while above the humanoid
 * maximum is clamped to it, which is a consequence of the rule rather
 * than of this module.
 */

import { SIZE_STEPS, sizeStepUp } from "./companion.mjs";
import { CHANGE_TYPE } from "./effect-change-types.mjs";

/**
 * The feat's name, normalised the way feats-workflow normalises names.
 *
 * MODULE-LOCAL. `hasHulkingForm` below is the only thing that needs it,
 * and an exported constant with no caller outside its own file is a
 * well-tested opinion rather than automation — lesson 5.1, and the
 * ratchet in verify-rules-have-callers said so the moment it shipped.
 */
const HULKING_FORM_FEAT = "hulking form";

/**
 * The size the spell's own clause refuses to act on, and everything
 * above it. Held as an index rather than a list so that adding a size to
 * the table cannot leave this reading a stale set.
 */
const LARGE_INDEX = SIZE_STEPS.indexOf("large");

/**
 * The size a creature of `currentSize` becomes, or null for no change.
 *
 * NULL IS A REAL ANSWER HERE, three times over, and each is a different
 * "no": a size the table does not know (lesson 18 — never coerce an
 * unrecognised name to Medium and grow it), a creature already Large or
 * bigger (the spell's own exception), and nothing at the top of the
 * table. A caller that treats null as "apply nothing" handles all three
 * correctly without having to tell them apart.
 */
export function hulkingFormSize(currentSize) {
  const index = SIZE_STEPS.indexOf(String(currentSize ?? "").trim().toLowerCase());
  if (index < 0) return null;
  if (index >= LARGE_INDEX) return null;
  const grown = sizeStepUp(SIZE_STEPS[index]);
  return grown === SIZE_STEPS[index] ? null : grown;
}

/**
 * The ActiveEffect change that grows the character, or null.
 *
 * OVERRIDE AT PRIORITY 30 because a race sets the same field by override
 * at priority 10 — the Beastman's own "medium" would otherwise win or
 * lose by the order Foundry happened to apply them in, which is the kind
 * of coin-toss that works in testing and fails at somebody's table.
 */
export function hulkingFormChange(currentSize) {
  const grown = hulkingFormSize(currentSize);
  if (!grown) return null;
  return {
    key: "system.identity.size",
    type: CHANGE_TYPE.OVERRIDE,
    value: grown,
    priority: 30
  };
}

/** "for 10 minutes", in the seconds the world clock counts. */
export const HULKING_FORM_SECONDS = 600;

/**
 * The whole ActiveEffect, clock and all, or null when nothing grows.
 *
 * ITS OWN EFFECT, NOT A CHANGE ON THE HYBRID FORM ONE. The two end at
 * different times — ten minutes here, "until you shift back" there — and
 * an effect is the unit Foundry expires, so one effect cannot hold two
 * deadlines. 3.567.0 put the change on the shared effect and was right
 * for the wording it had; the corrected wording made that impossible.
 *
 * THE GUARANTEE THAT MATTERED IS KEPT SEPARATELY. The reason for sharing
 * was that a size step outliving the form is a permanently Large
 * character and nobody reports a bonus they still have. So the CALLER
 * stamps this with the same feat-source flag the Hybrid Form effect
 * carries, and the revert branch — which deletes by that flag, not by
 * name — sweeps both. Whichever comes first, ten minutes or shifting
 * back, ends it.
 *
 * `spellEffect` + `spellEffectEnd` are what the world-clock sweep in
 * combat/effect-application-workflow.mjs reads; `duration` is what
 * Foundry's own UI shows. Both are set, because a clock the player can
 * see and a clock the system acts on disagreeing is worse than either
 * alone. Wings of the Wyrm is the precedent, ten minutes and all.
 *
 * @param {string} currentSize
 * @param {{img?: string, worldTime?: number, systemId: string}} options
 */
export function hulkingFormEffectData(currentSize, { img = null, worldTime = 0, systemId } = {}) {
  const change = hulkingFormChange(currentSize);
  if (!change) return null;
  const start = Math.max(0, Math.trunc(Number(worldTime) || 0));
  return {
    name: "Hulking Form",
    ...(img ? { img } : {}),
    description: `Size ${change.value} for 10 minutes — every size modifier applies `
      + "(Strength, Dexterity, base HP and reach). Ends with the ten minutes or when you "
      + "return to humanoid form, whichever comes first. No Power Points are spent.",
    changes: [change],
    duration: { seconds: HULKING_FORM_SECONDS, startTime: start },
    flags: {
      [systemId]: {
        spellEffect: true,
        spellEffectEnd: start + HULKING_FORM_SECONDS
      }
    }
  };
}

/**
 * The line the Hybrid Transformation card adds when the feat is held.
 *
 * SAYS WHAT CHANGED RATHER THAN THAT SOMETHING DID. "Hulking Form
 * active" tells a player nothing they can check; naming the size and the
 * reach lets them see on the sheet whether it actually happened, which
 * is the difference between a card and a reassurance.
 *
 * AND IT NAMES THE TEN MINUTES, because that is the clause a player will
 * otherwise get wrong: the form has no duration and this does, so "while
 * you're a beast" is the natural assumption and the wrong one.
 *
 * AND IT SAYS NO PP IS SPENT. The printed text mentions a PP cost; a
 * player who reads that and sees their pool untouched will wonder which
 * of the two is broken, and answering on the card costs one clause.
 */
export function hulkingFormNote(currentSize) {
  const grown = hulkingFormSize(currentSize);
  if (!grown) {
    return "Hulking Form has no effect at Large or larger — the size step is already spent.";
  }
  return `<strong>Hulking Form</strong> — you grow to ${grown} for 10 minutes: all size `
    + "modifiers apply (Strength, Dexterity, base HP and reach). It ends with the ten "
    + "minutes or when you return to humanoid form, whichever comes first. No PP is spent.";
}

/** Does this actor hold Hulking Form? Names are compared already-normalised. */
export function hasHulkingForm(featNames) {
  return (featNames ?? []).some((name) => String(name ?? "").trim().toLowerCase() === HULKING_FORM_FEAT);
}
