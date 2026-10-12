/**
 * An emanation that GROWS when its caster sustains it, and one that ends
 * on a clock of its own.
 *
 * NEW at 3.430.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FOURTH SHAPE.
 *
 * magic/emanation.mjs records three ways a spell's area can matter while
 * it runs: Bless's bonus that is lifted by walking out, Bane's penalty
 * gated on a save each creature rolls once, and Song Of Despair's floor
 * on a condition's recovery. Protective Ward is a fourth, and it is
 * about the CIRCLE rather than about who is in it:
 *
 *   "Area 10-foot emanation. Duration 1 minute. You emit a radiant aura
 *    of protective magic that envelops you and your allies. Within the
 *    area, you all benefit from a +1 status bonus to your DB. You can
 *    Sustain the Spell each round to extend the radius of the aura by
 *    5 feet, up to a maximum of 30 feet."
 *
 * Membership is Bless's rule unchanged — the +1 applies while you stand
 * inside. What is new is that the inside gets BIGGER when the caster
 * spends an action on it, so the same creature can end up in the area
 * without having moved at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT A SUSTAIN BUYS HERE, AND WHAT IT DOES NOT.
 *
 * Graham's rulings, 28 August 2026:
 *
 *   - THE MINUTE RUNS REGARDLESS. The printed duration is a flat "1
 *     minute", not "Sustained (1 minute)" the way Bless writes it, so
 *     the ward stands for its ten rounds whether or not anybody
 *     sustains it. Sustaining is purely how you grow it.
 *   - THE GROWTH STAYS. Stop sustaining at twenty feet and the aura is
 *     twenty feet for the rest of the minute. The text sells an
 *     extension "up to a maximum of 30 feet" and says nothing anywhere
 *     about it shrinking back.
 *
 * The first of those is why `emanationExpiry` exists at all, and it is
 * not a nicety. A live emanation's effects deliberately carry NO
 * duration — magic/emanation-effects.mjs records why: they are lifted by
 * walking out, and torn down wholesale by `endActiveSpell`. Every live
 * emanation until now was a "Sustained"-word spell, so the lapse sweep
 * ended it within two unsustained rounds and the question never arose.
 * Protective Ward is the first with a fixed clock and no dependence on
 * being sustained: without a stamp of its own, its ward would follow its
 * caster, and hand out its bonus, until somebody dismissed it by hand.
 * Making the spell live would have introduced a permanent aura while
 * fixing a dead one.
 */

import { endsHaveElapsed } from "./spell-ends.mjs";

/**
 * The growth one Sustain buys, declared on the spell.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DECLARED, NOT PARSED. The step and the cap are printed in one English
 * sentence — "extend the radius of the aura by 5 feet, up to a maximum
 * of 30 feet" — and this project has met enough rules inferred from
 * wording. The sentence stays on the spell as a note for a person to
 * read; the two numbers are authored on the pack entry where a harness
 * can read them and an author can change them.
 *
 * A ZERO STEP IS NO GROWTH, which is what every other spell in the pack
 * carries by default — so this returns null for them rather than a
 * growth of nothing, and callers get one question to ask instead of two.
 *
 * @param {object} spellData `spell.system`
 * @returns {{stepFeet: number, maxFeet: number}|null}
 */
export function spellGrowth(spellData) {
  const step = Math.max(0, Number(spellData?.sustainGrowth?.stepFeet) || 0);
  const max = Math.max(0, Number(spellData?.sustainGrowth?.maxFeet) || 0);
  if (!step || !max) return null;
  return { stepFeet: step, maxFeet: max };
}

/**
 * What the radius becomes when this emanation is sustained once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * REPORTS THE CHANGE THAT HAPPENED, NOT THE ONE OFFERED.
 *
 * `grewBy` is the difference the caller can print, and it is deliberately
 * NOT the step. Driving Song Of Despair on 28 August 2026 found a card
 * reading "Held at 1" and then "Frightened reduces by 3, to 1" in the
 * same breath, because the line printed the raw delta rather than the
 * movement the clamp allowed. That defect had been latent for months and
 * was invisible only because clamping at zero happened to produce the
 * right final number. The same clamp lives here — a ward at 28 feet with
 * a 5-foot step and a 30-foot cap grows by TWO — so the shape is
 * answered once, at the source, rather than left for each card to get
 * right.
 *
 * @param {number} currentFeet the radius right now
 * @param {{stepFeet: number, maxFeet: number}|null} growth
 * @returns {{radiusFeet: number, grewBy: number, atMax: boolean}}
 */
export function grownRadius(currentFeet, growth) {
  const current = Math.max(0, Number(currentFeet) || 0);
  if (!growth) return { radiusFeet: current, grewBy: 0, atMax: false };
  const max = Math.max(0, Number(growth.maxFeet) || 0);
  const step = Math.max(0, Number(growth.stepFeet) || 0);
  // A SUSTAIN EXTENDS; IT NEVER CONTRACTS. `Math.min(current + step, max)`
  // alone would SHRINK a ward already wider than its printed cap — a
  // scene edited by hand today, a warp that sells extra reach tomorrow —
  // turning the action that grows the spell into the one that cuts it
  // back. The outer Math.max is the whole guard, and it is the same
  // shape as `flooredValue`'s "raises, never lowers" one release ago.
  const next = Math.max(current, Math.min(current + step, max));
  return {
    radiusFeet: next,
    grewBy: next - current,
    // AT ITS CAP, not "would not grow". A ward already larger than its
    // printed maximum — a hand-edited scene, a warp somebody writes
    // later — is at the cap too, and is not a special case.
    atMax: current >= max
  };
}

/**
 * The sustainType whose sustain buys something OTHER than more time.
 *
 * Bless writes `"duration"`: sustaining it is what keeps it alive, and
 * two unsustained rounds end it (`sustainedLapses`). Lightning Storm and
 * Spiritual Weapon write `"round"`: their duration is their own, and a
 * Sustain buys the thing their text names — another bolt, another
 * Strike. Protective Ward is that second shape, and what its Sustain
 * buys is five feet.
 */
export const GROWTH_SUSTAIN_TYPE = "round";

/**
 * Why sustaining this entry would buy nothing, or null.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BECAUSE THE ALTERNATIVE IS THE BUG GRAHAM KEEPS REPORTING.
 *
 * On 27 August 2026 he reported Sustain a Spell as "deducts an AP,
 * creates an entry on the chat card but does nothing else". A ward
 * already at thirty feet, sustained again, is exactly that shape: an
 * action point for a circle that cannot get any bigger and a clock that
 * was never going to stop. So it is refused BEFORE the spend, with the
 * sentence saying why — the same order Repair's kit check uses, and the
 * same reason `sustainRefusal` is a sentence rather than a boolean.
 *
 * NAMED POSITIVELY, and that is the safety in it. This fires only for
 * the `"round"` shape, whose sustain is known to buy only what its text
 * names. A `"duration"` sustain is what keeps its spell alive and must
 * never be refused for having nothing else to do, and an unrecognised
 * sustainType is not refused either — an unknown reason to sustain is
 * still a reason.
 *
 * @param {object} entry an active-spell entry
 * @param {string} [name] the caster's name, for the message
 * @returns {string|null}
 */
export function growthRefusal(entry, name = "This character") {
  if (entry?.sustainType !== GROWTH_SUSTAIN_TYPE) return null;
  const growth = entry?.emanation?.growth ?? null;
  if (!growth) return null;
  const { atMax } = grownRadius(entry.emanation.radiusFeet, growth);
  if (!atMax) return null;
  return `${entry.name} is already at its maximum radius of ${growth.maxFeet} feet`
    + ` — sustaining it would buy nothing, and ${name} keeps the action point.`;
}

/**
 * When an emanation cast now should end, on both clocks.
 *
 * MODELLED ON `rageExpiry`, and for the reason it records: Foundry's
 * world clock does not necessarily advance during combat, and combat
 * rounds do not exist outside an encounter — so a minute measured only
 * in seconds never ends in a fight, and one measured only in rounds
 * never ends in a corridor. Whichever clock is running measures it.
 *
 * A SUSTAINED SPELL IS STAMPED TOO, FROM 3.496.0 — and this paragraph
 * used to say the opposite, so it is worth saying why it turned round.
 *
 * IT READ: "a sustained spell is stamped with nothing ... its minute is
 * a maximum on something the lapse sweep already ends". The second half
 * of that sentence was not true. `sweepSustainedLapses` is called from
 * ONE place — `TRGCombat._onStartTurn` — so outside an encounter there
 * are no turns, nothing lapses, and a Bless cast in a corridor ran until
 * it was dismissed or the caster next prepared. Inside an encounter it
 * ended a spell only after TWO UNSUSTAINED rounds, so a bard who paid
 * for Inspire Courage every round kept it well past the minute it
 * prints. The guard was protecting a lifetime nothing else enforced.
 *
 * MEASURED BEFORE CHANGING IT, 5 September 2026: of 72 sustained spells,
 * 62 print a cap and only 10 of those are live emanations — the only
 * ones this decides, because an emanation's effects deliberately carry
 * no clock of their own. Two of the ten (Luminance, Protective Ward) are
 * stamped already. So this line moves exactly EIGHT spells: Bless, Bane,
 * Inspire Courage, Inspire Defence, Radiant Aegis, Ember Of Devotion,
 * Wellspring Of Valour and Song Of Despair.
 *
 * GRAHAM'S RULING, 5 September 2026: "Sustained (1 minute)" reads as
 * "you may sustain it, UP TO a minute" — the minute is a cap on how long
 * sustaining can extend it, not a maximum on something else. He was told
 * the cost and took it: a bard sustaining Inspire Courage now loses it at
 * round ten, where before it ran as long as they kept paying.
 *
 * AN UNCAPPED SUSTAINED SPELL IS STILL STAMPED WITH NOTHING — "Ghost
 * Sound, sustained", ten of them — and needs no guard of its own: there
 * are no seconds and no rounds to stamp, so the test below already
 * answers null. The distinction that matters is printed in the duration
 * text and is read from there rather than decided here.
 *
 * @param {object} options
 * @param {object|null} options.duration a `parseSpellDuration` result
 * @param {number|null} [options.worldTime] `game.time.worldTime` at the cast
 * @param {number|null} [options.round] the combat round, or null if none
 * @returns {{endsAtWorldTime: number|null, endsOnRound: number|null}|null}
 */
export function emanationExpiry({ duration, worldTime = null, round = null } = {}) {
  if (!duration) return null;
  const seconds = Number(duration.seconds);
  const rounds = Number(duration.rounds);
  const hasSeconds = Number.isFinite(seconds) && seconds > 0;
  const hasRounds = Number.isFinite(rounds) && rounds > 0;
  if (!hasSeconds && !hasRounds) return null;
  const startTime = worldTime === null || worldTime === undefined ? null : Number(worldTime) || 0;
  const startRound = round === null || round === undefined ? null : Number(round) || 0;
  return {
    endsAtWorldTime: hasSeconds && startTime !== null ? startTime + seconds : null,
    endsOnRound: hasRounds && startRound !== null ? startRound + rounds : null
  };
}

/**
 * Has this emanation's own clock run out?
 *
 * EITHER CLOCK ENDS IT. Whichever one is moving measures the minute; the
 * other never reaches its mark and costs nothing.
 *
 * AN UNSTAMPED EMANATION NEVER EXPIRES HERE, which is the correct
 * reading of the six that were live before this release: all of them are
 * "Sustained"-word spells, ended by the lapse sweep, and inventing a
 * clock for them would end somebody's Bless at a moment nobody chose.
 *
 * @param {object|null} emanation the stored descriptor
 * @param {object} now {worldTime, round}
 * @returns {boolean}
 */
export function emanationHasElapsed(emanation, { worldTime = null, round = null } = {}) {
  // THE ARITHMETIC MOVED OUT AT 3.494.0, to magic/spell-ends.mjs, when an
  // active-spell entry started wearing the same stamp for the same
  // reason. This is the emanation's own name for the question, and the
  // one answer both askers get.
  return endsHaveElapsed(emanation?.ends ?? null, { worldTime, round });
}
