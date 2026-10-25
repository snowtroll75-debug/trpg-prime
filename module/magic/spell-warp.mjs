/**
 * Spell warping (Chapter 9).
 *
 * A spell's Warping Options are structured on `spell.system.warps` as
 * `{ppCost, text, mods}`. The cast dialog offers them as a chooser; selecting an
 * option spends its PP (raising the total cost → Casting DC, Save DC, PP spent)
 * and folds its quantifiable modifiers into the resolution: extra damage dice, a
 * persistent rider, a larger bonus (up to its cap), a Save DC step, or a
 * duration override. Qualitative options (extra targets, special riders) carry
 * no `mods` — selecting them still spends the PP and prints the text for the GM
 * to apply by hand. A raw "Extra PP" box remains for Metamagic Feats.
 */

import { addDice } from "./caster-level-mods.mjs";
import { areaGrowthMaxTimes } from "./warp-area.mjs";
import { conjuredLevelMaxTimes } from "./conjured-creature.mjs";
import { potencyStepMaxTimes, SPELL_POTENCY_BASE } from "./spell-rune.mjs";
import { EXTRA_ATTACK_CAP } from "./polymorph-warps.mjs";
import { ARMOUR_STEPS } from "./attack-riders.mjs";
import { suppressBumpMaxTimes } from "../conditions/suppression.mjs";
import { heldDieStepMaxTimes } from "./held-bonus.mjs";

/** Multiply a single dice term for N applications: "1d8" ×3 → "3d8". */
export function scaleDice(dice, times) {
  const m = String(dice ?? "").match(/^(\d+)d(\d+)$/);
  if (!m || times <= 0) return "";
  return `${Number(m[1]) * times}d${m[2]}`;
}

/** No printed ceiling: take it as often as the PP holds out. */
export const WARP_UNLIMITED = Infinity;

/**
 * DOES TAKING THIS WARP TWICE DIFFER FROM TAKING IT ONCE?
 *
 * NEW at 3.515.0, and it is ASKED rather than guessed. The aggregator is
 * the one thing that knows whether a mod is multiplied by `times` — it
 * scales `damageDice`, `extraTargets`, `bonusValue`, `persistent`,
 * `traitPicks`, `areaGrowth`, `weaponDamageBonus`, `morphForms`,
 * `saveDC`, `extraConditionals` and `extraTraditions`, and deliberately
 * does NOT scale the flags and overrides beside them ("taken is taken",
 * "an override is not multiplied by `times`").
 *
 * So this runs it: once, then twice, and compares. A warp whose second
 * purchase changes nothing is a checkbox; one whose second purchase
 * changes something is a count. There is no list to keep in step with
 * the aggregator, because the aggregator IS the list — which is the
 * repair for how the old rule went wrong.
 *
 * @param {object} warp one authored warp option
 * @returns {boolean}
 */
export function warpScalesWithRepeats(warp) {
  if (!warp?.mods || !Object.keys(warp.mods).length) return false;
  const once = aggregateWarpSelection([warp], { "warp-0": 1 });
  const twice = aggregateWarpSelection([warp], { "warp-0": 2 });
  return JSON.stringify(once.mods) !== JSON.stringify(twice.mods);
}

/**
 * The most times a warp option can sensibly be taken.
 *
 * TWO KINDS OF CAP. A bonus cap is a TOTAL ("+1, max +4"), so the count
 * falls out of the option alone. An area cap is an absolute SIZE ("by
 * 10-foot, max 50 feet"), which means nothing without the spell's own
 * printed area — four purchases from a 10-foot emanation, three from a
 * 20-foot one. That arithmetic lives in warp-area.mjs, where the area
 * text is the subject rather than an extra argument.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND A THIRD ANSWER, WHICH WAS MISSING (3.515.0).
 *
 * Everything without a printed cap fell through to 1 and was drawn as a
 * CHECKBOX — so an option with no ceiling could be bought exactly once.
 * Reported by Graham on Cure: "the first and third option should be able
 * to be selected multiple times (with no limit)".
 *
 * Measured across the pack: 702 warps, of which 44 offered a count box
 * and **140 more would have scaled if the dialog had let them**. Every
 * "per additional target" in the game — Banishment, Teleport, Shadow
 * Walk, Resist Energy, Counter Perform, Qualm, Levitate — was capped at
 * one extra creature, by the chooser rather than by any rule.
 *
 * The old test was two hand-written mod keys. Those two were the only
 * ones anybody remembered; `damageDice` and `extraTargets` scale in the
 * aggregator and were never mentioned here. Asking the aggregator
 * instead is what stops this list drifting again.
 *
 * @param {object} warp
 * @param {string} areaText the spell's own printed area
 * @param {number|null} casterLevel the caster's level, where one is known
 * @returns {number} 1, a computed cap, or WARP_UNLIMITED
 */
export function warpMaxTimes(warp, areaText = "", casterLevel = null) {
  const m = warp?.mods ?? {};
  // BOUGHT ONCE, BECAUSE THE PAGE SAYS "TO" (3.613.0). Talon Strike's "+4
  // PP: increase the secondary damage TO 2d6" is a destination, not a step:
  // a second purchase would buy a 3d6 the page never sells.
  if (m.once) return 1;
  // A PRINTED CEILING ALWAYS WINS. "+1, max +4" is four purchases and not
  // one more, whatever else the option scales.
  if (m.bonusMax && m.bonusValue) return Math.max(1, Math.ceil(Number(m.bonusMax) / Number(m.bonusValue)));
  // A POTENCY LADDER'S CEILING IS A TIER, NOT A BONUS (3.523.0). The
  // spell already grants tier I, so "max IV" is THREE purchases and not
  // four — the arithmetic is `potencyStepMaxTimes`, kept in spell-rune.mjs
  // beside the clamp that has to agree with it.
  if (m.potencyStep && m.potencyMax) {
    return Math.max(1, potencyStepMaxTimes(m.potencyMax, SPELL_POTENCY_BASE));
  }
  // AND A SUPPRESSION CEILING IS A TOTAL TOO (3.529.0) — "ignore a
  // further -1 injury (max -5)" is four purchases on a row that already
  // ignores one. Same arithmetic, same reasoning, kept beside the rule it
  // has to agree with in conditions/suppression.mjs.
  if (m.suppressBump && m.suppressMax) {
    return Math.max(1, suppressBumpMaxTimes(m.suppressMax));
  }
  if (m.areaGrowth) return areaGrowthMaxTimes(m, areaText);
  // A CONDITION'S CEILING IS A TOTAL (3.611.0) — "increase the level of
  // fatigue by 1 (max 5)" grows a condition the spell already gives at 1,
  // so it is four purchases, the arithmetic `suppressBumpMaxTimes` does.
  // A HELD DIE'S LADDER STOPS AT d10 (3.611.0) — Inspiration's "increase
  // the die by one step (max d10)" from its printed d6 is two purchases.
  if (m.heldDieStep && m.heldDieFrom) return heldDieStepMaxTimes(m.heldDieFrom, m.heldDieStep);
  if (m.conditionBump && m.conditionMax) {
    return Math.max(1, Math.floor((Number(m.conditionMax) - 1) / Number(m.conditionBump)));
  }
  /*
   * AND AN EXTRA NATURAL ATTACK HAS A PRINTED CEILING TOO (3.595.0):
   * "max of two additional attacks", on all five Shape spells that offer
   * it. Without this the option would fall through to the unlimited answer
   * below — it does scale with repeats — and the chooser would sell a third
   * attack the page does not allow and `extraAttackCount` would then throw
   * away. Two purchases, and the cap lives in polymorph-warps.mjs beside
   * the rule that enforces it, for `potencyStepMaxTimes`'s reason.
   *
   * THE SIZE STEPS NEED NO ENTRY HERE. `sizeSteps` takes the DEARER of two
   * offers rather than adding, so one purchase and two aggregate to the
   * same mods and `warpScalesWithRepeats` answers false: the chooser draws
   * a checkbox on its own, which is what one-step-or-two-steps deserves.
   */
  if (m.extraFormAttacks) return EXTRA_ATTACK_CAP;
  /*
   * AN ARMOUR STEP HAS SOMEWHERE TO STOP (3.608.0). Sonic Bolt ignores
   * light armour and sells "the type of armour ignored increases by one
   * step" — medium, then heavy, then nothing heavier. Two purchases, with
   * the steps counted in attack-riders.mjs beside the rule that clamps them.
   */
  if (m.armourStep) return Math.max(1, ARMOUR_STEPS.length - 1);
  // A CONJURE'S CEILING IS THE CASTER'S OWN LEVEL (3.565.0) — an absolute
  // ceiling on the result, like an area cap, and equally meaningless
  // without the spell's printed starting point. It returns null when the
  // level is unknown (the workbench builds a chooser with no actor), and
  // null falls through to the unlimited answer below rather than to 1.
  if (m.conjuredLevel) {
    const conjured = conjuredLevelMaxTimes(m, casterLevel);
    if (conjured !== null) return conjured;
  }
  return warpScalesWithRepeats(warp) ? WARP_UNLIMITED : 1;
}

/**
 * HTML for the warp chooser: one control per structured option plus a raw
 * Metamagic PP box.
 * @param {Item} spell
 * @param {number} basePP
 * @returns {string}
 */
export function buildWarpChooser(spell, basePP, { afterTheCheck = false, casterLevel = null } = {}) {
  const warps = Array.isArray(spell.system?.warps) ? spell.system.warps : [];
  // THE SPELL'S OWN AREA, for an area-growth option's repeat count.
  const areaText = String(spell.system?.area ?? "");
  // Each option is a `.form-group.warp-option` for LAYOUT — the control
  // beside its text, rather than in the form-group grid's 150px label
  // column.
  //
  // This comment used to claim the wrapper also made the label "inherit
  // the dialog's readable theme colour". IT DID NOT. Neither
  // `.form-group` nor `.warp-option` ever set a colour, and Foundry's
  // own `.standard-form label` rule painted these labels in
  // `--color-form-label` — a pale tan in its dark theme, 1.4:1 against
  // this system's parchment dialogs. Reported by Graham twice, the
  // second time saying he had addressed it before; he had, and the fix
  // had never done anything. The colour is now owned where the
  // background is set (see "A RULE THAT PAINTS A BACKGROUND OWNS THE
  // FOREGROUND" in styles/trg-prime.css), so nothing here arranges it.
  let hasRepeatable = false;
  const rows = warps
    .map((w, i) => {
      const max = warpMaxTimes(w, areaText, casterLevel);
      // A capped/repeatable option is a "how many times" count (each application
      // costs its PP again); a one-shot option is a simple checkbox.
      if (max > 1) {
        hasRepeatable = true;
        // NO `max` ATTRIBUTE WHEN THERE IS NO PRINTED CEILING (3.515.0).
        // An uncapped option is limited by the caster's PP and by nothing
        // else, and a number typed into a box the browser silently clamps
        // is worse than one it accepts.
        const cap = Number.isFinite(max) ? ` max="${max}"` : "";
        return `<div class="form-group warp-option"><label><input type="number" name="warp-${i}" value="0" min="0"${cap} style="width:3.2em;flex:0 0 3.2em"><span>× <strong>+${w.ppCost} PP each</strong> — ${w.text}</span></label></div>`;
      }
      return `<div class="form-group warp-option"><label><input type="checkbox" name="warp-${i}" value="1"><span><strong>+${w.ppCost} PP</strong> — ${w.text}</span></label></div>`;
    })
    .join("");
  return `<div class="trg-prime trg-check-dialog">
    <p class="hint">Base cost ${basePP} PP. Selecting an option adds its PP to the cost${afterTheCheck ? "" : " (raising the Casting DC)"}.${hasRepeatable ? " A number box is how many <em>times</em> to take that option — each time costs its PP again." : ""}</p>
    ${rows || '<p class="hint">No unique warping options for this spell.</p>'}
    <div class="form-group warp-option warp-metamagic">
      <label><input id="trg-warp-raw" type="number" name="rawPP" value="0" min="0" style="width:3.2em;flex:0 0 3.2em"><span>Extra PP — raw total, for Metamagic Feats</span></label>
    </div>
  </div>`;
}

/**
 * THE MOD VOCABULARY, IN ONE PLACE.
 *
 * NEW at 3.493.0, and it is a consolidation rather than an addition. The
 * default mods object was written out twice — once inside
 * `aggregateWarpSelection` and once inside `emptyWarp` — and the two had
 * already drifted: the aggregator knew `areaGrowth`, `areaMax`,
 * `areaOverride` and `freezeMembership`, and the empty one did not.
 *
 * That was invisible until `verify-warp-area` stopped keeping its OWN
 * third copy and asked the code instead, at which point Bless and Bane's
 * freeze-membership warps were reported as keys the aggregator would
 * drop — by a check reading the smaller of two answers to one question.
 *
 * Every key this system understands is declared here, and both callers
 * take a fresh copy. A warp mod key that is not in this object is
 * offered, charged for, and silently dropped, which is what E5 exists to
 * refuse.
 *
 * NOT EXPORTED. `emptyWarp` is this module's public form of the same
 * object, and it is already called in production — so a check that wants
 * the vocabulary asks through that rather than through a door opened
 * only for it.
 */
function emptyWarpMods() {
  return {
    damageDice: "", persistent: 0, bonusValue: 0, bonusMax: null, saveDC: 0,
    durationText: null, traitPicks: 0,
    // AVOIDANCE SIGHT (3.597.0). See Invisible's +4 PP option — "invisible
    // creatures can be seen clearly and are not concealed" — REPLACES the
    // level the row declares rather than adding to it, so this is a
    // set-shaped key and the later choice wins it below. Its warp carried
    // `mods: {}` and was inert. See magic/avoidance-sight.mjs.
    sightLevel: null,
    // A HAUNT'S SUPPRESSION, LONGER (3.629.0; Pillars of Faith's Still the
    // Haunt: "doubled on a Critical or Success"). A set, like sightLevel:
    // the rungs the warp names replace the spell's own.
    perilSuppress: null,
    // AREA (3.445.0). A warp that changes the area used to be dropped
    // here like any unlisted key, so Dark Tendrils' "+1 PP: the area
    // becomes a 15-foot cone" printed on the card beside "30 ft line
    // template placed". `areaGrowth` is feet per purchase and `areaMax`
    // the absolute ceiling; `areaOverride` replaces the string outright.
    // See magic/warp-area.mjs.
    areaGrowth: 0, areaMax: null, areaOverride: null,
    // THE CONJURE SPELLS (3.565.0). `conjuredLevel` is the increment
    // bought — "+1 PP: increase the max level of the creature by 1" —
    // and `conjuredBase` the spell's own printed ceiling, which the
    // increment is added to. A base is NOT multiplied by `times` for the
    // reason `areaMax` is not: it is the spell's number, not a purchase.
    // See magic/conjured-creature.mjs.
    conjuredLevel: 0, conjuredBase: null,
    // WHO THE AREA CATCHES, when a warp says so (3.530.0). Aid's "+3 PP:
    // effect all allies in a 10-foot radius" is the only warp in the pack
    // that changes the side rather than the shape, and without this an
    // area override on it would have buffed every enemy in range. An
    // override, never multiplied — see `warpedAreaTargeting`.
    areaTargetingOverride: null,
    // A FLAG RATHER THAN A COUNT (3.426.2). Bless and Bane each sell
    // "the targets may move out of the area" once; taking it twice buys
    // nothing more, so what matters is whether it was taken at all.
    freezeMembership: false,
    // GRAVITY WEAPON (3.493.0). "+4 PP: increase the damage by an
    // additional +2 (max +4)" and "+1 PP: you can affect two weapons".
    // Both warps carried `mods: {}` and bought nothing until now — the
    // same inert shape the freeze-membership option above had.
    //
    // THE CAP IS NOT APPLIED HERE. This counts what was bought;
    // `normaliseWeaponDamageBonus` applies the printed "max +4" once, to
    // the warped total, where the sentence that prints it lives.
    weaponDamageBonus: 0,
    // A COUNT OF WEAPONS, NOT AN INCREMENT. "You can affect two weapons"
    // names the total, so taking it twice does not buy a third.
    weapons: 0,
    // WILD MORPH (3.493.0). "+2 PP: you gain an additional natural attack
    // form (max 3)" — an increment, unlike `weapons` above, because this
    // one says ADDITIONAL. The cap is applied in normaliseWildMorph,
    // where the sentence that prints it lives.
    morphForms: 0,
    sizeSteps: 0,
    extraFormAttacks: 0,
    // SONIC BOLT (3.608.0). A COUNT of armour steps a critical reads
    // through; see `armourBypassCategories` in attack-riders.mjs.
    armourStep: 0,
    // SIZE ALTERATION (3.608.0). `sizeReach` is one more step AND one size
    // larger still reached — "two steps, or a large creature by one step";
    // `sizeReverse` turns the growth into a reduction. See
    // `boundedSizeSteps` in size-step.mjs. NOT `sizeSteps`: that key belongs
    // to the Shape forms and opens their larger-or-smaller prompt.
    sizeReach: 0,
    sizeReverse: false,
    // STONESKIN (3.608.0). A resistance's replacement value — "the
    // resistance applies to adamantine damage as well". A state, not a
    // count; see the `defence` case in spell-effects.mjs.
    defenceValue: null,
    // SPELL STORING (3.495.0). Both are FLAGS rather than counts: they
    // name the action the release costs, and taking either twice does
    // not buy a cheaper one. `releaseActionCost` reads them and settles
    // the free-beats-reaction ordering in one place.
    storedReleaseReaction: false,
    storedReleaseFree: false,
    // SCOPED ADVANTAGE (3.497.0). Both are COUNTS, and both are generic
    // rather than named after the spell that wanted them first: a
    // `huntTrack: true` key in a shared aggregate is one no other spell
    // could ever reuse.
    extraConditionals: 0,
    extraTraditions: 0,
    // HOW MANY MORE CREATURES THIS CASTING MAY TOUCH (3.498.0). A COUNT
    // and an INCREMENT: "you can target an additional creature" taken
    // twice buys two, and 46 warps across the pack say some version of
    // it. See magic/target-count.mjs.
    extraTargets: 0,
    // TWO CLAUSES THAT WERE READ FROM A KEY THAT NEVER EXISTED (3.499.1).
    //
    // Both were written as `warpMods.applied.some(w => /…/.test(w.text))`
    // — matching the CHOSEN WARP'S TEXT rather than a declared mod. But
    // the aggregate returns `{ppSpent, rawPP, mods, notes}`, and what
    // reaches `applySpellEffects` is `warp.mods` ALONE, so `applied` was
    // undefined at both call sites and both tests were permanently false.
    // Sacrificing Shield's was caught live on 5 September 2026 with the
    // warp bought and its clause unprinted; Reaper's Resonance's had been
    // inert since the day it was written.
    //
    // THIS IS THE INERT-WARP DEFECT THE PACK SWEEP KEEPS FINDING, hiding
    // in the code rather than in the data — and the lesson is the one
    // this file already teaches in every comment above: A WARP BUYS
    // SOMETHING BY DECLARING A MOD. Matching its text was a shortcut
    // around a data fix, and it failed for a reason no better regular
    // expression would have fixed.
    //
    // TAKEN IS TAKEN, so both are flags: neither clause has a count.
    absorbConditions: false,
    reduceBleed: false,
    // WARPED TERRAIN'S +6 PP (3.501.0). A FLAG: "appear in the air rather
    // than on a surface" names no quantity, and taking it twice buys the
    // same illusion. It changes WHICH movements the Region charges, not
    // how much — see magic/difficult-terrain.mjs.
    terrainInAir: false,
    // RESISTANCE'S +2 PP (3.507.0). "Affect all saving throws" — a FLAG,
    // because taking it twice does not buy a fourth save. It changes
    // WHICH slots the bonus lands on, not how big it is; the +4 PP option
    // on the same spell is the ordinary `bonusValue` channel.
    //
    // Its warp shipped with `mods: {}` and was inert, which is the defect
    // every comment above this one is about.
    allSlots: false,
    // BLEED RELIEF (3.516.0). "+2 PP: stop an additional point of
    // bleeding" is a COUNT and an increment — it has no printed ceiling,
    // and until 3.515.0 taught the chooser to offer an uncapped box it
    // could be bought exactly once. "+2 PP: the spell heals both HP and
    // bleed" is a FLAG: buying it twice does not heal a third thing.
    //
    // Both shipped as `mods: {}` on Cure and again on Self Healing, which
    // print the identical pair. See magic/bleed-relief.mjs.
    bleedPoints: 0,
    bleedAndHeal: false,
    // CONDITION RELIEF (3.517.0). Restoration's four "instead reduce X"
    // warps REPLACE the condition rather than adding a second one, so
    // this is a LIST that the last purchase wins — and the pair that
    // arrives together stays together, because "+1 PP: instead reduce the
    // dazed OR weakened conditions" is one purchase offering two.
    //
    // `reliefBump` is the ordinary count beside it: "+2 PP: increase the
    // amount of a condition reduced by 1 (or 5 for soul drain)", where
    // the parenthesis is the condition's own step rather than a special
    // case. See magic/condition-relief.mjs.
    reliefConditions: null,
    reliefBump: 0,
    // THE MIRROR OF THE TWO ABOVE, for the verb the other half of the
    // chapter uses (3.529.0). Relief REDUCES a condition; suppression
    // IGNORES points of one while the spell lasts, and the warps come in
    // exactly the same two shapes — "instead ignore X" swaps which, and
    // "ignore an additional point" raises how many.
    //
    // NAMED TO MATCH ON PURPOSE. A reader who has met `reliefConditions`
    // should not have to learn a second vocabulary for the same idea, and
    // a check can hold the two side by side.
    //
    // `suppressMax` CARRIES THE PRINTED CEILING, as `potencyMax` does for
    // the rune ladder: Voice Of Healing prints "(max -5)" and Banish
    // Fatigue prints none, so a constant here would be wrong for one of
    // them. See conditions/suppression.mjs.
    suppressConditions: null,
    suppressBump: 0,
    suppressMax: 0,
    // CASTING TIME (3.518.0). Five warps across five spells change how
    // long a spell takes and not one was built. They speak two ways, so
    // there are two keys: `castApSet` REPLACES the printed time ("cast
    // time changes to 3 AP", "the casting time changes to 10 minutes")
    // and is not multiplied by `times`, for the reason `areaOverride` is
    // not — buying it twice names the same new time twice. `castApDelta`
    // ADJUSTS it ("lower the AP cost to cast the spell by 1 AP (min 1)")
    // and accumulates like any count.
    //
    // THE FLOOR IS NOT APPLIED HERE. This records what was bought;
    // `warpedCastTime` applies the printed "min 1" once, to the warped
    // total, where the sentence that prints it lives. See magic/cast-time.mjs.
    castApSet: null,
    castApDelta: 0,
    // RANGE (3.519.0). 25 warps across 25 spells change how far a spell
    // reaches and every one shipped inert. ONE KEY, because all 25 SET a
    // new range — "increase the range to 30 feet", "the range becomes
    // touch", "increase the link range to unlimited" — and not one of
    // them says "+10 feet per purchase". So it is an override in the
    // shape of `areaOverride` rather than a count in the shape of
    // `areaGrowth`, and buying it twice names the same range twice.
    //
    // It buys something only because 3.519.0 also made the printed range
    // mean something: until this release nothing compared a distance to
    // it. See magic/spell-range.mjs.
    rangeOverride: null,
    /*
     * WHICH TIER A MASTERWORK GRANTS (3.591.0). Masterwork Item's two
     * warps buy master and legendary, and they were authored with this
     * key before the aggregator had heard of it \u2014 offered on the card,
     * charged for, and dropped on the way to the applier.
     *
     * Caught by `verify-warp-area` E5 and `verify-emanation` E2b, both
     * of which survey every mod key the pack authors against the ones
     * this function reads. The block's own check tested
     * `normaliseItemQuality(row, { qualityTier })` directly and so
     * measured the reader while stepping over the gap: presence instead
     * of reachability, in the release that named that shape.
     */
    qualityTier: null,
    /*
     * WHAT A WARP ADDS TO A HEALING RATE (3.594.0). Rapid Repair's
     * "+1 PP: increase the fast healing by 1 (max 5)" raises a rate the
     * spell already grants; Regenerate's "+1 PP: the target gains fast
     * healing 5" supplies the whole of one. Same key, and the row says
     * which of the two it is — see the `healingRate` case in
     * spell-effects.mjs.
     */
    // What a warp adds to a conjured Power Crystal (3.594.0).
    crystalPP: 0,
    // FOUR COUNTS A PILLARS OF FAITH WARP RAISES (3.630.0): one more choice
    // at the cast (Analytical Glance's "one additional category", Exemplar's
    // Grace's "one additional eligible saving throw or skill"), Communal
    // Litany's "use the benefit twice", Unfold the Future's "one additional
    // Portent", and Writ of Restraint's "−2 status penalty to these
    // subsequent Will saves" (a re-save modifier, negative).
    choiceExtra: 0,
    declareUses: 0,
    heldUses: 0,
    resaveModifier: 0,
    healingRateBump: 0,
    healingRateMax: 0,
    // HOW MANY, NAMED AS A TOTAL (3.520.0). `extraTargets` above is an
    // INCREMENT — "an additional creature" — and twelve warps in the
    // pack name a TOTAL instead: "target up to 10 targets", "target up
    // to 1 creature per level". A total REPLACES the printed cap; an
    // increment adds to it, and folding one into the other would make
    // the printed number mean something different on every spell.
    //
    // Neither is multiplied by `times`: a total bought twice is the same
    // total. See magic/target-count.mjs, where the two are combined.
    targetCap: null,
    targetCapPerLevel: 0,
    // THE AP ROW'S OWN PRINTED EXTRA, AGAIN (3.522.0). Cure and Inflict
    // each sell "+2 PP: … increases by 1d8" with a second clause naming
    // the two-action row's flat bonus — "and the extra healing for the
    // 2-action version increases by 8", "or 1d8+8 for the 2 AP version".
    // The die half has been live since the bleed channel; this is the
    // other half.
    //
    // A COUNT, because both warps are uncapped and Graham's ruling of
    // 7 Sep 2026 made Cure's repeatable: three purchases are three more
    // dice and three more extras. `warpedRowExtra` multiplies the row's
    // OWN constant rather than a number authored here, so a row with no
    // flat term is untouched and a row printing something other than 8
    // gets its own. See magic/caster-level-mods.mjs.
    rowExtra: 0,
    // THE HEALING SIDE, NAMED SEPARATELY (3.531.0). `damageDice` has done
    // this job wherever a spell's healing was its only number; Wash Away
    // Sin heals d8 and burns d6, so "increase both by 1 die" needs two
    // dice and not one. `healDice` scales like `damageDice`; `healBonus`
    // is the flat sibling for a row printing a bare constant.
    healDice: "", healBonus: 0,
    // THREE CHANNELS BLOCK 33 FOUND WARPS PRINTING AND NOTHING READING
    // (3.609.0). `persistentDice` — Incandescence's "and the persistent by
    // 1d4", which `persistent` (a bare number) could not hold.
    // `secondaryDice` — the second pool's own die: Umbral Blast's "+1d4
    // essence", Sunburst's and Meteor Swarm's likewise, which never reached
    // `secondaryDamage`. `stopsBleeding` — Vital Beacon's +4 PP option, whose
    // row already knew how and was never told.
    persistentDice: "", secondaryDice: "", stopsBleeding: false,
    // TURN UNDEAD'S "+1 PP: increase the level of affected undead by 1"
    // (3.609.0) — the ceiling a `turnSave` row reaches.
    levelBump: 0,
    // DICE FOR ONE RUNG OF A PRINTED LADDER (3.609.0). Phantasmal Killer:
    // "+1 PP: the damage increases by 1d6 on a failure and by 2d6 on a
    // fumble" — a warp that `damageDice` could only have added to every
    // rung, or (as authored) to a spell damage roll its ladder never reads.
    rungDice: {},
    // A WALL'S SIZE AND STRENGTH (3.610.0, R9): "+2 PP: increase the length
    // of the wall by 10 feet", "+2 PP: increase the radius of the ring by
    // 5 feet", "+2 PP: the HP of each section increase by 5".
    wallLength: 0, wallRadius: 0, wallHp: 0,
    // WHAT A `self` ROW DOES ONCE THE SPELL HAS REACH (3.534.0). Two
    // flags rather than one because the pack says two things — "the
    // target CHANGES to" moves it, "affects ALL allies" shares it. See
    // selfRowRecipients in spell-degrees.mjs.
    retargetSelfRows: false, shareSelfRows: false,
    // "you gain half the PP drained" / "you gain all of the PP drained"
    // — Eldritch Disruption's two options. A SHARE, not a number: see
    // the aggregation below for why the larger wins rather than summing.
    casterGains: "",
    endsSustain: false,
    // THE DAILY LIMIT WAIVED (3.625.0): Pillars of Faith's Renewed
    // Restoration — "the target ignores the normal once-per-day limit on
    // benefiting from Restoration". Read by the conditionRelief case.
    ignoreDailyLimit: false,
    // A SAVE-REROLL SPELL'S WARPS (3.625.0): the degrees it may also answer,
    // and a status bonus to the second roll. See magic/save-reroll.mjs.
    rerollDegrees: [],
    rerollBonus: 0,
    weaponCategories: [],
    // SPELL-GRANTED RUNE POTENCY (3.523.0).
    //
    // A COUNT, because "increase the Potency of the rune by one step" is
    // bought once per step up the ladder — but unlike `rowExtra` the
    // ladder is short and every one of these warps prints its own
    // ceiling, so the cap travels beside the count.
    //
    // `potencyMax` RATHER THAN `bonusMax`. The generic pair already
    // understood by `warpMaxTimes` would have worked, but `bonusValue` is
    // read by four unrelated rules — sacrificing-shield, magic-stone,
    // spell-conditional and slot-choice — and giving these spells a
    // `bonusValue` would feed a number meant for this rule to all of
    // them. That is how a mod key starts meaning two things, which is
    // exactly what Slide's stray `bonusValue` already demonstrates.
    //
    // THE CEILING IS NOT MULTIPLIED BY `times`: two purchases of a
    // "max IV" warp are still capped at IV. `warpMaxTimes` stops a fourth
    // step being offered and `spellPotencyTier` clamps one that arrives
    // from a macro anyway. See magic/spell-rune.mjs.
    potencyStep: 0,
    potencyMax: 0,
    /*
     * BLOCK 34 (3.611.0) — four channels its warps print and nothing read.
     *
     * `conditionBump` / `conditionMax`: a condition's VALUE grown by a
     * warp — Waves Of Fatigue's "increase the level of fatigue by 1 (max
     * 5)", Cloud Mind's "Dazed by 1 (max 5)". A count and a ceiling, the
     * ceiling a state for `suppressMax`'s reason. See
     * magic/condition-warp.mjs.
     *
     * `unlocks`: a warp that ADDS a row rather than growing one —
     * Animal Healing's "+2 PP: reduce the dazed or weakened condition by
     * 1", Banish Fatigue's "+4 PP: the spell removes the fatigue
     * permanently". A union of names; a row declaring `unlockedBy` is
     * applied only when one of them was bought. Taken is taken.
     *
     * `defenceField`: a resistance that becomes an IMMUNITY — Element
     * Ward's "+8 PP: you instead gain immunity". A state.
     *
     * `heldChecks` / `heldDieStep` / `heldDice`: Inspiration's three —
     * "may modify an attack check or a saving throw", "increase the die
     * by one step (max d10)", "roll an additional die". A union and two
     * counts. See magic/held-bonus.mjs.
     */
    conditionBump: 0,
    conditionMax: 0,
    unlocks: [],
    defenceField: null,
    heldChecks: [],
    heldDieStep: 0,
    heldDieFrom: "",
    heldDice: 0,
    // A FLAT AMOUNT OF TEMPORARY HP (3.611.0). Zealous Conviction's "+2 PP:
    // increase temporary HP by 1", Battle's Call's "+5". `damageDice` only
    // scales a dice term, so a bare "1" bought twice scaled to nothing.
    tempHPBonus: 0,
    once: false,
    // ONE MORE POINT OF BLEEDING PER PURCHASE (3.614.0) — Renewal's Touch's
    // "+2 PP: target may reduce bleeding by an additional 1". A count, read
    // by magic/turn-options.mjs.
    bleedBump: 0,
    // WILD MORPH'S TWO "INSTEAD" WARPS (3.614.0, R15): states, read by the
    // wildMorph case — a movement type, or a special ability, in place of
    // the attack form.
    morphMovement: false,
    morphAbility: false
  };
}

/**
 * Read the warp form into a total PP spent, aggregated mods, and display notes.
 * A checkbox contributes 1; a number contributes its count.
 * @param {Array<object>} warps
 * @param {object} form  the submitted form data
 *
 * `rawPP` is returned separately as well as inside `ppSpent`: it is the
 * free-text "Extra PP" box, spent on Metamagic feats rather than on any
 * warping option, so a feature that discounts WARPING must not reach it.
 *
 * @returns {{ppSpent:number, rawPP:number, mods:object, notes:string[]}}
 */
/*
 * EVERY MOD KEY A WARP CAN CARRY IS LISTED BELOW, and one that is not
 * listed is SILENTLY DROPPED — the option is offered, the PP is charged,
 * the card says it was warped, and nothing happens.
 *
 * Found the hard way on 27 August 2026: `freezeMembership` was authored
 * onto Bless's and Bane's warps to make "the targets may move out of the
 * area" mean something, and the aggregator threw it away. The cast card
 * read "Warped — +2 PP: ..." over an emanation that was not frozen. That
 * is the same defect the emanation work was fixing — a warp that charges
 * for nothing — reproduced one layer down while fixing it.
 *
 * `verify-emanation` now cross-checks the pack against this function, so
 * a mod key nobody handles fails a check rather than a session.
 */
/** A mod that may be null, as a number — 0 when it is not set yet. */
const int0 = (v) => Math.max(0, Math.trunc(Number(v) || 0));

export function aggregateWarpSelection(warps, form) {
  const count = (name) => {
    const v = form?.[name];
    if (v === true) return 1;
    if (v === false || v == null) return 0;
    return Math.max(0, Math.floor(Number(v) || 0));
  };
  const mods = emptyWarpMods();

  const rawPP = count("rawPP");
  let ppSpent = rawPP;
  const notes = [];

  (Array.isArray(warps) ? warps : []).forEach((w, i) => {
    const times = count(`warp-${i}`);
    if (!times) return;
    ppSpent += w.ppCost * times;
    const m = w.mods ?? {};
    if (m.damageDice) mods.damageDice = addDice(mods.damageDice, scaleDice(m.damageDice, times));
    if (m.persistent) mods.persistent += Number(m.persistent) * times;
    if (m.bonusValue) {
      mods.bonusValue += Number(m.bonusValue) * times;
      if (m.bonusMax != null) mods.bonusMax = Math.max(mods.bonusMax ?? 0, Number(m.bonusMax));
    }
    if (m.saveDC) mods.saveDC += Number(m.saveDC) * times;
    // "add a [type] trait (see Appendix, max 3)" — one more Appendix pick per
    // time the option is taken. The cap is NOT applied here: this counts what
    // was bought, and traitPickCount applies "max 3" once, where the printed
    // free pick can be counted alongside it.
    if (m.traitPicks) mods.traitPicks += Number(m.traitPicks) * times;
    if (m.durationText) mods.durationText = m.durationText;
    /*
     * AVOIDANCE SIGHT (3.597.0). See Invisible's +4 PP option REPLACES the
     * row's level — "seen clearly and are not concealed" is not a stronger
     * kind of concealed — so this assigns rather than accumulating. The
     * option shipped with `mods: {}` and `verify-emanation` E2b caught the
     * first half of this fix: widening `emptyWarpMods` and the pairwise
     * merge is not enough, because THIS is the function that reads a
     * selected warp's keys, and a key it does not name is dropped in
     * silence with the PP already charged.
     */
    if (m.sightLevel) mods.sightLevel = m.sightLevel;
    if (m.perilSuppress && typeof m.perilSuppress === "object") mods.perilSuppress = { ...m.perilSuppress };
    if (m.freezeMembership) mods.freezeMembership = true;
    if (m.areaGrowth) {
      mods.areaGrowth += Number(m.areaGrowth) * times;
      if (m.areaMax != null) mods.areaMax = Math.max(mods.areaMax ?? 0, Number(m.areaMax));
    }
    if (m.conjuredLevel) {
      mods.conjuredLevel += Number(m.conjuredLevel) * times;
      if (m.conjuredBase != null) mods.conjuredBase = Math.max(mods.conjuredBase ?? 0, Number(m.conjuredBase));
    }
    // AN OVERRIDE IS NOT MULTIPLIED BY `times`. "The area becomes a
    // 15-foot cone" is true or it is not, and the chooser offers it as a
    // checkbox for exactly that reason.
    if (m.areaOverride) mods.areaOverride = String(m.areaOverride);
    if (m.areaTargetingOverride) mods.areaTargetingOverride = String(m.areaTargetingOverride);
    if (m.weaponDamageBonus) mods.weaponDamageBonus += Number(m.weaponDamageBonus) * times;
    if (m.morphForms) mods.morphForms += Number(m.morphForms) * times;
    /*
     * THE DEARER OFFER WINS for the size, and the purchases ADD for the
     * attacks (3.595.0). Nine Shape spells print the size step twice, as
     * one-step and two-step ALTERNATIVES — a caster who buys both has
     * bought two steps, not three, which is `targetCap`'s reasoning. The
     * extra natural attacks are a repeatable option and sum, capped at the
     * printed two inside `extraAttackCount`.
     */
    if (m.sizeSteps) mods.sizeSteps = Math.max(int0(mods.sizeSteps), Number(m.sizeSteps) || 0);
    if (m.extraFormAttacks) mods.extraFormAttacks += Number(m.extraFormAttacks) * times;
    if (m.armourStep) mods.armourStep += Number(m.armourStep) * times;
    // A TOTAL, like `sizeSteps`: "two steps" bought twice is two steps.
    if (m.sizeReach) mods.sizeReach = Math.max(int0(mods.sizeReach), Number(m.sizeReach) || 0);
    if (m.sizeReverse) mods.sizeReverse = true;
    if (m.defenceValue) mods.defenceValue = String(m.defenceValue);
    // TAKEN IS TAKEN. A flag has no count to multiply, and a warp bought
    // twice by a player clicking twice must not become a third state.
    if (m.storedReleaseReaction) mods.storedReleaseReaction = true;
    if (m.storedReleaseFree) mods.storedReleaseFree = true;
    if (m.absorbConditions) mods.absorbConditions = true;
    if (m.reduceBleed) mods.reduceBleed = true;
    if (m.terrainInAir) mods.terrainInAir = true;
    if (m.allSlots) mods.allSlots = true;
    // A COUNT, so a caster who buys it three times stops three more
    // points; and a FLAG beside it, because "both" is a state.
    if (m.bleedPoints) mods.bleedPoints += Number(m.bleedPoints) * times;
    if (m.bleedAndHeal) mods.bleedAndHeal = true;
    // NOT MULTIPLIED BY `times`, for the reason `areaOverride` is not: an
    // "instead" states which condition, and buying it twice states the
    // same one twice. The LAST purchase wins, which is a caster who
    // changed their mind rather than one who bought two spells.
    if (m.reliefConditions) mods.reliefConditions = [...m.reliefConditions];
    if (m.reliefBump) mods.reliefBump += Number(m.reliefBump) * times;
    // SWAPPED, NOT ACCUMULATED — "instead ignore the injured condition"
    // states which, and buying it twice states the same one twice.
    if (m.suppressConditions) mods.suppressConditions = [...m.suppressConditions];
    if (m.suppressBump) mods.suppressBump += Number(m.suppressBump) * times;
    // AND THE CEILING IS NOT MULTIPLIED, for the reason `potencyMax` is not.
    if (m.suppressMax) mods.suppressMax = Math.max(int0(mods.suppressMax), Number(m.suppressMax) || 0);
    // A NEW CAST TIME IS NOT MULTIPLIED BY `times` — "changes to 3 AP"
    // twice is still 3 AP — while a reduction accumulates. The two keys
    // may both be present: `warpedCastTime` sets first and adjusts
    // second, which is the order the two sentences are written in.
    //
    // `!= null` RATHER THAN TRUTHINESS, because a set of 0 AP is a real
    // new cast time and `if (m.castApSet)` would drop it.
    if (m.castApSet != null) mods.castApSet = m.castApSet;
    if (m.castApDelta) mods.castApDelta += Number(m.castApDelta) * times;
    // NOT MULTIPLIED BY `times`, for the reason `areaOverride` is not: a
    // new range is a state, and buying it twice states it twice.
    if (m.rangeOverride) mods.rangeOverride = String(m.rangeOverride);
    // THE HIGHEST TIER WINS rather than the last, for `targetCap`'s
    // reason: a caster who bought both master and legendary must not
    // have the cheaper offer overwrite the dearer one.
    if (m.crystalPP) mods.crystalPP += Number(m.crystalPP) * times;
    for (const k of ["choiceExtra", "declareUses", "heldUses", "resaveModifier"]) {
      if (m[k]) mods[k] += Number(m[k]) * times;
    }
    if (m.healingRateBump) mods.healingRateBump += Number(m.healingRateBump) * times;
    // THE CAP IS A STATE, not a purchase: buying the option twice does
    // not raise the printed ceiling, it only spends more against it.
    if (m.healingRateMax) mods.healingRateMax = Math.max(mods.healingRateMax, Number(m.healingRateMax) || 0);
    if (m.qualityTier) {
      const order = ["expert", "master", "legendary"];
      const asked = String(m.qualityTier).trim().toLowerCase();
      if (order.indexOf(asked) > order.indexOf(String(mods.qualityTier ?? ""))) {
        mods.qualityTier = asked;
      }
    }
    // THE LARGEST TOTAL WINS rather than the last, because these are
    // offers rather than states: a caster who somehow bought two must
    // not have the cheaper one overwrite the dearer.
    if (m.targetCap != null) mods.targetCap = Math.max(int0(mods.targetCap), Number(m.targetCap) || 0);
    if (m.rowExtra) mods.rowExtra += Number(m.rowExtra) * times;
    if (m.healDice) mods.healDice = addDice(mods.healDice, scaleDice(m.healDice, times));
    if (m.healBonus) mods.healBonus += Number(m.healBonus) * times;
    if (m.persistentDice) mods.persistentDice = addDice(mods.persistentDice, scaleDice(m.persistentDice, times));
    if (m.secondaryDice) mods.secondaryDice = addDice(mods.secondaryDice, scaleDice(m.secondaryDice, times));
    if (m.stopsBleeding) mods.stopsBleeding = true;
    if (m.levelBump) mods.levelBump += Number(m.levelBump) * times;
    if (m.wallLength) mods.wallLength += Number(m.wallLength) * times;
    if (m.wallRadius) mods.wallRadius += Number(m.wallRadius) * times;
    if (m.wallHp) mods.wallHp += Number(m.wallHp) * times;
    if (m.rungDice && typeof m.rungDice === "object") {
      for (const [rung, dice] of Object.entries(m.rungDice)) {
        mods.rungDice[rung] = addDice(mods.rungDice[rung] ?? "", scaleDice(dice, times));
      }
    }
    // TAKEN IS TAKEN — neither is multiplied by how often it was bought.
    // A fixed duration replaces sustaining (Graham, 9 Sep 2026). One warp
    // saying so is enough — see sustainAfterWarp in active-spells.mjs.
    if (m.endsSustain) mods.endsSustain = true;
    if (m.ignoreDailyLimit) mods.ignoreDailyLimit = true;
    if (Array.isArray(m.rerollDegrees)) mods.rerollDegrees = [...new Set([...mods.rerollDegrees, ...m.rerollDegrees.map((d) => String(d).toLowerCase())])];
    if (m.rerollBonus) mods.rerollBonus += Number(m.rerollBonus) * times;
    // A UNION, NOT A REPLACEMENT — "the weapon CAN BE a martial weapon"
    // leaves the simple ones on the table. See magic/conjured-weapon.mjs.
    if (Array.isArray(m.weaponCategories) && m.weaponCategories.length) {
      mods.weaponCategories = [...new Set([...mods.weaponCategories, ...m.weaponCategories])];
    }
    /*
     * THE BETTER SHARE WINS, AND NEITHER ACCUMULATES (3.589.0).
     *
     * Eldritch Disruption offers "+2 PP: you gain half the PP drained"
     * and "+4 PP: you gain all of the PP drained". A caster who buys
     * both has bought "all" — half of a pool plus all of it is not one
     * and a half pools, and taking the option twice does not drain the
     * target twice.
     *
     * CAUGHT BY A RATCHET, NOT BY ME. `verify-emanation` E2b asserts
     * that every warp mod key the pack authors is read here, and it
     * named `casterGains` the moment it was authored — "offered, charged
     * for, and silently dropped", which is this block's own subject
     * committed while fixing it.
     */
    if (m.casterGains === "all") mods.casterGains = "all";
    else if (m.casterGains === "half" && mods.casterGains !== "all") mods.casterGains = "half";
    if (m.retargetSelfRows) mods.retargetSelfRows = true;
    if (m.shareSelfRows) mods.shareSelfRows = true;
    // THE STEPS ACCUMULATE AND THE CEILING DOES NOT. Buying the step
    // twice is two steps up one ladder, not two ladders — so the cap
    // takes the largest declared rather than a sum, for the reason
    // `targetCap` does: these are offers, and the dearer must not be
    // overwritten by the cheaper.
    if (m.potencyStep) mods.potencyStep += Number(m.potencyStep) * times;
    if (m.potencyMax) mods.potencyMax = Math.max(int0(mods.potencyMax), Number(m.potencyMax) || 0);
    if (m.targetCapPerLevel) {
      mods.targetCapPerLevel = Math.max(int0(mods.targetCapPerLevel), Number(m.targetCapPerLevel) || 0);
    }
    if (m.extraConditionals) mods.extraConditionals += Number(m.extraConditionals) * times;
    if (m.extraTraditions) mods.extraTraditions += Number(m.extraTraditions) * times;
    if (m.extraTargets) mods.extraTargets += Number(m.extraTargets) * times;
    // NOT MULTIPLIED BY `times`, for the reason the override above is
    // not: "you can affect two weapons" states a total, and buying it
    // twice states the same total twice.
    if (m.weapons) mods.weapons = Math.max(mods.weapons, Number(m.weapons));
    // BLOCK 34 (3.611.0). See emptyWarpMods for each key's reasoning.
    if (m.conditionBump) mods.conditionBump += Number(m.conditionBump) * times;
    if (m.conditionMax) mods.conditionMax = Math.max(int0(mods.conditionMax), Number(m.conditionMax) || 0);
    if (Array.isArray(m.unlocks) && m.unlocks.length) {
      mods.unlocks = [...new Set([...mods.unlocks, ...m.unlocks.map((u) => String(u))])];
    }
    if (m.defenceField) mods.defenceField = String(m.defenceField);
    // A DESTINATION, NOT A STEP (3.613.0) — Talon Strike's "to 2d6". Carried
    // so the cast can see it was bought; `warpMaxTimes` is what stops a
    // second purchase.
    if (m.once) mods.once = true;
    if (m.bleedBump) mods.bleedBump += Number(m.bleedBump) * times;
    if (m.morphMovement) mods.morphMovement = true;
    if (m.morphAbility) mods.morphAbility = true;
    if (Array.isArray(m.heldChecks) && m.heldChecks.length) {
      mods.heldChecks = [...new Set([...mods.heldChecks, ...m.heldChecks.map((c) => String(c))])];
    }
    if (m.heldDieStep) mods.heldDieStep += Number(m.heldDieStep) * times;
    if (m.heldDieFrom) mods.heldDieFrom = String(m.heldDieFrom);
    if (m.heldDice) mods.heldDice += Number(m.heldDice) * times;
    if (m.tempHPBonus) mods.tempHPBonus += Number(m.tempHPBonus) * times;
    notes.push(`+${w.ppCost * times} PP: ${w.text}${times > 1 ? ` (×${times})` : ""}`);
  });

  return { ppSpent, rawPP, mods, notes };
}

/**
 * "…which costs one less PP to Warp" (Menora, Chapter 2; the Furini
 * gnome's chosen school words it "reduce all its warping PP costs by 1
 * (min 1)"). The floor is 1, not 0 — a discount makes warping cheaper but
 * never free — and a cast that warped nothing at all stays at 0 rather
 * than being pushed up to the floor.
 *
 * @param {number} ppSpent Warp PP before the discount.
 * @param {number} discount
 * @returns {number}
 */
export function applyWarpDiscount(ppSpent, discount = 0) {
  const spent = Math.max(0, Math.floor(Number(ppSpent) || 0));
  const off = Math.max(0, Math.floor(Number(discount) || 0));
  if (!spent || !off) return spent;
  return Math.max(1, spent - off);
}

/**
 * What an INNATE cast may warp for free (Graham's ruling, 18 Aug 2026):
 * "Innate spells should already allow a character to add warping options
 * up to the level (not caster level) of the character."
 *
 * LEVEL, NOT CASTER LEVEL, and the distinction is the whole point. A
 * creature or character with an innate spell-like often has no caster
 * level at all — `casterLevelValue` reads 0 for a Fighter, a monster, or
 * a Druid using Wild Shape's granted spell — so a budget drawn from the
 * caster level would be zero for exactly the characters this rule exists
 * to serve.
 *
 * THAT SENTENCE WAS FALSE WHEN IT WAS WRITTEN, and became true at
 * 3.385.0. Until then `casterLevelValue` fell back to CHARACTER level for
 * anyone with no class caster level, so a 10th-level Fighter read 10 and
 * not 0. The reasoning was sound; the fact it rested on was not.
 *
 * The rule below never depended on it — it takes the character's level as
 * an argument and always did — so the behaviour was right the whole time
 * for a reason its own comment got wrong. Recorded rather than quietly
 * corrected: a comment that describes the system better than the system
 * does is worth noticing twice, and this one turned out to be describing
 * the ruling that arrived six days later.
 *
 * THIS IS WHAT "AUTO-WARPED TO THE MAXIMUM" HAS ALWAYS MEANT. Before
 * 3.332.0 the phrase was on every innate card and applied only the
 * CASTER LEVEL MODIFICATIONS block; the spell's own Warping Options were
 * never offered and never applied. Found through Wild Shape, whose
 * printed text — "1 hour if you use the 10-minute warping option" and
 * "you may reduce your size by one step (which increases accordingly
 * with the default warping options)" — is describing Shape Of The
 * Animal's own warps, at 1 PP and 4 PP, and had been recorded in the
 * audit as two clauses that could not be automated.
 *
 * @param {number} level the CHARACTER's level
 * @returns {number}
 */
export function innateWarpBudget(level) {
  return Math.max(0, Math.floor(Number(level) || 0));
}

/**
 * Whether an innate selection fits its free budget, and by how much it
 * misses. Separated from the aggregate so the dialog can re-ask rather
 * than silently dropping options the player chose.
 *
 * THE RAW METAMAGIC BOX IS NOT PART OF THIS. An innate caster has no
 * metamagic feats to pay with (cast-workflow gives them no options), so
 * anything in that box on an innate cast is not a warp and is not
 * covered by the free budget.
 *
 * @param {{ppSpent:number, rawPP:number}} warp
 * @param {number} budget
 * @returns {{ok:boolean, spent:number, budget:number, over:number}}
 */
export function innateWarpFits(warp, budget, { countRaw = false, metamagicPP = 0 } = {}) {
  const cap = innateWarpBudget(budget);
  // METAMAGIC FROM THE SAME FREE BUDGET (3.670.0; Inner Tempest's Mystic,
  // B6-8: Metamagic feats on its innate spells, "paid from the spell's PP").
  // `countRaw` counts the Metamagic box against the budget too, and with it
  // the Metamagic feats ticked (`metamagicPP`, their aggregated cost; found
  // in review: they were charged to the pool).
  const feats = countRaw ? Math.max(0, Number(metamagicPP) || 0) : 0;
  const spent = Math.max(0, (Number(warp?.ppSpent) || 0) - (countRaw ? 0 : (Number(warp?.rawPP) || 0))) + feats;
  return { ok: spent <= cap, spent, budget: cap, over: Math.max(0, spent - cap) };
}

/**
 * AN INNATE CANTRIP (3.670.0, found in review). The cast workflow reads an
 * innate spell's cost as 0, so its own cantrip test is never true for one:
 * a cantrip is read from the spell's data, PP 0 and the Cantrip trait, as
 * the choosers read it (casting.mjs). Inner Tempest's Mystic: its Metamagic
 * feats reach its innate spells, "not cantrips" (B6-8).
 *
 * @param {object} spellData the spell's system data
 */
export function innateCantripOf(spellData) {
  return Math.max(0, Math.trunc(Number(spellData?.ppCost) || 0)) === 0 && /\bcantrip\b/i.test(String(spellData?.traits ?? ""));
}

/**
 * Powerful Illusion's free credit (Shadow, 3.332.0).
 *
 * A SEPARATE FUNCTION FROM `applyWarpDiscount`, and the difference is one
 * number: this floors at 0 and that one floors at 1. They are kept apart
 * rather than sharing a `floor` parameter precisely because they are one
 * typo from each other and mean opposite things — "cheaper but never
 * free" versus "free".
 *
 * THE RAW METAMAGIC BOX IS EXCLUDED, as it is for the discount: that PP
 * is spent on a Metamagic feat, not on a warping option, and waiving it
 * would make a cast that warped nothing at all cheaper.
 *
 * @param {number} ppSpent total warp PP including the raw box
 * @param {number} rawPP the raw Metamagic box alone
 * @param {number} credit PP of free warping available
 * @returns {{total:number, waived:number}}
 */
export function applyFreeWarp(ppSpent, rawPP = 0, credit = 0) {
  const total = Math.max(0, Math.floor(Number(ppSpent) || 0));
  const raw = Math.max(0, Math.floor(Number(rawPP) || 0));
  const free = Math.max(0, Math.floor(Number(credit) || 0));
  const warpOnly = Math.max(0, total - raw);
  const waived = Math.min(warpOnly, free);
  return { total: total - waived, waived };
}

/** The empty aggregate, for cantrips and no-warp casts. */
export function emptyWarp() {
  return { ppSpent: 0, rawPP: 0, mods: emptyWarpMods(), notes: [] };
}

/**
 * Fold a second warp selection into the first.
 *
 * WARP MANIPULATION IS A SECOND PASS over the same chooser, taken after
 * the check rather than before it, and everything downstream — the damage
 * roll, the Save DC, the duration, the Appendix picks — reads one
 * aggregate. Merging here means the second pass cannot behave differently
 * from the first, which is the whole reason it is not a parallel path.
 *
 * DICE ADD, NUMBERS ADD, DURATION IS REPLACED. Each field is folded the
 * same way `aggregateWarpSelection` folds repeats of one option, for the
 * same reason: two sources of +1 damage die are two dice, but two sources
 * of "the duration becomes 1 minute" are one minute.
 *
 * @param {object} first  the selection made before the check
 * @param {object} second the selection Warp Manipulation added after it
 * @returns {object} one selection, in the same shape as either
 */
export function mergeWarpSelections(first, second) {
  const a = first ?? emptyWarp();
  const b = second ?? emptyWarp();
  return {
    ppSpent: Number(a.ppSpent ?? 0) + Number(b.ppSpent ?? 0),
    rawPP: Number(a.rawPP ?? 0) + Number(b.rawPP ?? 0),
    mods: {
      damageDice: addDice(a.mods?.damageDice ?? "", b.mods?.damageDice ?? ""),
      persistent: Number(a.mods?.persistent ?? 0) + Number(b.mods?.persistent ?? 0),
      bonusValue: Number(a.mods?.bonusValue ?? 0) + Number(b.mods?.bonusValue ?? 0),
      bonusMax: b.mods?.bonusMax != null || a.mods?.bonusMax != null
        ? Math.max(Number(a.mods?.bonusMax ?? 0), Number(b.mods?.bonusMax ?? 0))
        : null,
      saveDC: Number(a.mods?.saveDC ?? 0) + Number(b.mods?.saveDC ?? 0),
      // THE LATER CHOICE WINS a duration, because two durations are not a
      // longer one — and the later choice is the one the caster made
      // knowing how the check went.
      durationText: b.mods?.durationText ?? a.mods?.durationText ?? null,
      qualityTier: b.mods?.qualityTier ?? a.mods?.qualityTier ?? null,
      // A SET, so the later choice wins — the same reason as durationText.
      sightLevel: b.mods?.sightLevel ?? a.mods?.sightLevel ?? null,
      perilSuppress: b.mods?.perilSuppress ?? a.mods?.perilSuppress ?? null,
      crystalPP: Number(a.mods?.crystalPP ?? 0) + Number(b.mods?.crystalPP ?? 0),
      choiceExtra: Number(a.mods?.choiceExtra ?? 0) + Number(b.mods?.choiceExtra ?? 0),
      declareUses: Number(a.mods?.declareUses ?? 0) + Number(b.mods?.declareUses ?? 0),
      heldUses: Number(a.mods?.heldUses ?? 0) + Number(b.mods?.heldUses ?? 0),
      resaveModifier: Number(a.mods?.resaveModifier ?? 0) + Number(b.mods?.resaveModifier ?? 0),
      healingRateBump: Number(a.mods?.healingRateBump ?? 0) + Number(b.mods?.healingRateBump ?? 0),
      healingRateMax: Math.max(Number(a.mods?.healingRateMax ?? 0), Number(b.mods?.healingRateMax ?? 0)),
      traitPicks: Number(a.mods?.traitPicks ?? 0) + Number(b.mods?.traitPicks ?? 0),
      // AN AFTER-THE-CHECK PURCHASE ADDS TO ONE MADE BEFORE (3.608.0) — two
      // steps bought in two halves are two steps.
      armourStep: Number(a.mods?.armourStep ?? 0) + Number(b.mods?.armourStep ?? 0),
      sizeReach: Math.max(Number(a.mods?.sizeReach ?? 0), Number(b.mods?.sizeReach ?? 0)),
      sizeReverse: Boolean(a.mods?.sizeReverse || b.mods?.sizeReverse),
      defenceValue: b.mods?.defenceValue ?? a.mods?.defenceValue ?? null,
      // DICE ADD (3.609.0), and a bleeding stopped either side stays stopped.
      persistentDice: addDice(a.mods?.persistentDice ?? "", b.mods?.persistentDice ?? ""),
      secondaryDice: addDice(a.mods?.secondaryDice ?? "", b.mods?.secondaryDice ?? ""),
      stopsBleeding: Boolean(a.mods?.stopsBleeding || b.mods?.stopsBleeding),
      levelBump: Number(a.mods?.levelBump ?? 0) + Number(b.mods?.levelBump ?? 0),
      wallLength: Number(a.mods?.wallLength ?? 0) + Number(b.mods?.wallLength ?? 0),
      wallRadius: Number(a.mods?.wallRadius ?? 0) + Number(b.mods?.wallRadius ?? 0),
      wallHp: Number(a.mods?.wallHp ?? 0) + Number(b.mods?.wallHp ?? 0),
      rungDice: Object.fromEntries([...new Set([
        ...Object.keys(a.mods?.rungDice ?? {}), ...Object.keys(b.mods?.rungDice ?? {})
      ])].map((rung) => [rung, addDice(a.mods?.rungDice?.[rung] ?? "", b.mods?.rungDice?.[rung] ?? "")]))
    },
    notes: [...(a.notes ?? []), ...(b.notes ?? [])]
  };
}

/**
 * A bonus's value after the warp that raises it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EXTRACTED AT 3.446.1, BECAUSE ONE OF ITS TWO CALLERS DID NOT EXIST.
 *
 * This arithmetic lived inline in `spell-effects.mjs`'s `bonus` case and
 * governed every ordinary buff. A LIVE EMANATION never reached it: the
 * emanation record is built from `liveEmanationEffects(spellData)` — the
 * raw pack rows — so `emanationEffectData` placed `value: 1` however much
 * the caster had paid.
 *
 * SEVEN LIVE EMANATIONS SELL THAT WARP, and all seven charged for
 * nothing: Bless (+2 PP, max +4), Bane (+2 PP, max -4), Inspire Courage
 * (+4 PP), Inspire Defence (+4 PP), Ember Of Devotion (+3 PP, max +5),
 * Protective Ward (+2 PP, max +5) and Wellspring Of Valour (+4 PP). Found
 * on 31 August 2026 while authoring Radiant Aegis, whose own "+3 PP:
 * increase the bonus by +1 (max +5)" would have been the eighth.
 *
 * This is the `freezeMembership` shape for a third time, and the reason
 * the fix is an EXTRACTION rather than a second copy: two places doing
 * this arithmetic would drift, and the sign rule below is exactly the
 * kind of thing that drifts.
 *
 * THE SIGN IS PRESERVED AND THE MAGNITUDE IS CAPPED. A penalty is stored
 * negative — Bane's -1 — so the warp pushes it AWAY from zero and the cap
 * clamps how far. Capping the raw value instead would turn Bane's "max
 * -4" into a floor of +4 and hand the target a bonus.
 *
 * @param {number} base the authored value, negative for a penalty
 * @param {number} warpBonus `warpMods.bonusValue`
 * @param {number|null} warpBonusMax `warpMods.bonusMax`, or null for no cap
 * @returns {number}
 */
export function warpedBonusValue(base, warpBonus = 0, warpBonusMax = null) {
  const from = Number(base) || 0;
  const added = Number(warpBonus) || 0;
  const sign = from < 0 ? -1 : 1;
  let value = from + sign * added;
  if (warpBonusMax !== null && warpBonusMax !== undefined) {
    value = sign * Math.min(Math.abs(value), Math.abs(Number(warpBonusMax) || 0));
  }
  return value;
}

/**
 * A live emanation's effect rows, with any bonus warp applied.
 *
 * A NAMED FUNCTION RATHER THAN A MAP INLINE IN THE CAST, and the reason
 * is a mutation that survived. The first fix for the seven-spell defect
 * above wrote the arithmetic straight into `recordEmanation`'s argument
 * list, and the check that guarded it could only match that source text —
 * so a mutation which disabled the branch while leaving the call visible
 * went unnoticed. The rule lives here so the harness can DRIVE it, and
 * the cast is left with one call to point a check at.
 *
 * ONLY `bonus` ROWS ARE TOUCHED. Luminance's `perTurn` heal is a live
 * emanation effect too, and its dice are grown by a different warp
 * entirely (`maxDice`); folding it in here would be one function
 * answering two questions.
 *
 * COPIED, NOT MUTATED. The rows come from the spell's own pack data, and
 * the emanation record outlives the cast — writing through to the
 * compendium-backed object is how a warp becomes permanent.
 *
 * @param {object[]} effects from `liveEmanationEffects(spellData)`
 * @param {object} warpMods the aggregated warp mods
 * @returns {object[]} fresh rows
 */
export function warpedEmanationEffects(effects, warpMods = null) {
  const added = Number(warpMods?.bonusValue ?? 0);
  const cap = warpMods?.bonusMax ?? null;
  return Array.from(effects ?? []).map((effect) => {
    // A HELD BONUS WIDENS INSTEAD (3.612.0, R8): Inspire Heroics' warps add
    // the check types it may be spent on — the same `heldChecks` key
    // `warpedHeldBonus` reads for a held bonus cast on one creature.
    if (effect?.kind === "heldBonus") {
      const extra = (Array.isArray(warpMods?.heldChecks) ? warpMods.heldChecks : []).map((c) => String(c).toLowerCase());
      const types = Array.isArray(effect.checkTypes) ? effect.checkTypes : [effect.checkTypes].filter(Boolean);
      return { ...effect, checkTypes: [...new Set([...types.map((c) => String(c).toLowerCase()), ...extra])] };
    }
    // A HEAL THAT ANSWERS DAMAGE GROWS BY A DIE (3.614.0, R9) — Wellspring's
    // "+4 PP: increase the bonus by +1 and the healing by 1d6", one purchase
    // counted by the same `bonusValue` the bonus grows by.
    if (effect?.kind === "damageHeal") return { ...effect, extraDice: Math.max(0, Math.trunc(added)) };
    // AND A RESISTANCE WIDENS (3.613.0, R3) — Protector's Sphere's "+6 PP:
    // also against adamantine" and "+10 PP: against all damage", the same
    // `defenceValue` / `defenceField` the cast's own defence row reads.
    if (effect?.kind === "defence") {
      if (effect.field !== "resistance") return { ...effect };
      const out = { ...effect };
      if (warpMods?.defenceValue) { out.value = String(warpMods.defenceValue); delete out.values; }
      if (warpMods?.defenceField) out.field = String(warpMods.defenceField);
      return out;
    }
    if (effect?.kind !== "bonus") return { ...effect };
    return { ...effect, value: warpedBonusValue(Number(effect.value) || 0, added, cap) };
  });
}
