/**
 * HEAL THE WOUND, OR STOP IT BLEEDING.
 *
 * NEW at 3.516.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CURE (PP 2) — "Cure heals 1d8 HP OR stops 1 point of ongoing bleed."
 *      +2 PP: stop an additional point of bleeding
 *      +2 PP: the spell heals both HP and bleed
 *
 * SELF HEALING (PP 2) prints the identical pair —
 *      +2 PP: the amount of bleeding is reduced by an additional point
 *      +2 PP: heal both HP and bleeding
 *
 * VOICE OF HEALING (PP 2) — "+2 PP: reduce a bleeding wound by 1"
 *
 * ─────────────────────────────────────────────────────────────────────
 * NARRATED IN SIX SPELLS, AUTOMATED IN NONE.
 *
 * Measured across the pack before building: THIRTEEN warps mention
 * bleeding and EIGHT of them ship `mods: {}`. The alternative itself
 * lived in `note` rows —
 *
 *   Self Healing    "Alternatively reduce your bleeding by 1 instead of
 *                    healing HP (warpable to heal both, or reduce bleed
 *                    further)."
 *   Animal Healing  "Also reduces the animal's bleed by 1…"
 *
 * — sentences describing a rule the system could not run. Two spells DID
 * automate it, each in its own bespoke field: Vital Beacon's
 * `stopsBleeding` and Aura Of Vitality's `bleedRemoved`. Two private
 * implementations and six notes is the shape this project keeps finding,
 * and it is why this is a channel rather than a fix to Cure.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 7 September 2026, on the 3 AP radius version:
 * "each target gets whichever applies".
 *
 * So THERE IS NO PROMPT. A bleeding creature has its bleeding stopped; a
 * creature that is merely hurt is healed; and the spell does the right
 * thing across a mixed group in one casting without asking. The "+2 PP:
 * heals both" warp is what a caster buys to stop choosing.
 *
 * WHAT THAT COSTS, said plainly rather than hidden: on a SINGLE target
 * who is bleeding, an unwarped Cure now stops the bleed rather than
 * healing HP, and the caster cannot ask for HP instead. That follows from
 * the ruling — "whichever applies" — and the 2 PP warp is the way to have
 * both. The card names which one each creature got, so nobody has to
 * infer it.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/** The condition this channel takes down. */
export const BLEEDING = "bleeding";

/**
 * The bleed alternative declared on a heal row, or null when there is
 * none.
 *
 * DECLARED ON THE HEAL, NOT BESIDE IT. "Heals 1d8 HP **or** stops 1 point
 * of bleed" is one effect with two faces; two sibling rows would be a
 * spell that does both, always, which is precisely what the 2 PP warp is
 * for sale.
 *
 * @param {object} raw the authored effect row
 * @returns {{points: number}|null}
 */
export function normaliseBleedAlternative(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (String(raw.kind ?? "").trim() !== "heal") return null;
  const points = int(raw.bleedAlternative);
  // A ZERO ALTERNATIVE IS NO ALTERNATIVE. Every other heal in the pack
  // reaches here and must be left exactly as it was.
  if (points < 1) return null;
  // AND A HEAL THAT PRINTS "AND", NOT "OR" (3.611.0, block 34). Animal
  // Healing: "restoring 2d6 HP AND reducing its bleed condition by 1" —
  // the both-at-once Cure and Self Healing sell as a warp, printed as the
  // spell's own. Declared on the row, read where the warp is.
  return { points, both: raw.bleedAndHeal === true };
}

/**
 * How many points of bleeding this casting stops, warps included.
 *
 * THE EXTRA POINTS ARE REPEATABLE, and only became so at 3.515.0: "stop
 * an additional point of bleeding" has no printed ceiling, and until the
 * chooser learned to offer an uncapped count it could be bought exactly
 * once. This is the first spell built on top of that.
 *
 * @param {{points: number}} spec a normaliseBleedAlternative result
 * @param {object} warpMods the aggregated warp mods
 * @returns {number}
 */
export function bleedPoints(spec, warpMods = {}) {
  // A WARP ONLY EVER BUYS MORE — the floor every numeric channel in this
  // system carries, and the gap that survived two mutation runs before
  // anybody wrote it down.
  const extra = Math.max(0, int(warpMods?.bleedPoints));
  // NO DECLARED ALTERNATIVE IS NOT NO BLEED RELIEF. Voice Of Healing
  // prints no "or" — it heals, and "+2 PP: reduce a bleeding wound by 1"
  // BUYS the relief outright. So the base may be zero and the warp alone
  // may carry it.
  return (spec ? spec.points : 0) + extra;
}

/**
 * What this casting does to ONE creature.
 *
 * PER TARGET, WHICH IS THE RULING. The 3 AP version reaches everyone in a
 * 30-foot radius and a mixed group is the ordinary case: this is asked
 * once per creature, so the bleeding are stopped and the hurt are healed
 * by the same casting.
 *
 * @param {{points: number}} spec a normaliseBleedAlternative result
 * @param {object} warpMods the aggregated warp mods
 * @param {boolean} isBleeding whether this creature is bleeding
 * @returns {{heal: boolean, bleed: number}}
 */
export function bleedReliefFor(spec, warpMods = {}, isBleeding = false) {
  const points = bleedPoints(spec, warpMods);

  /*
   * NOT BLEEDING IS ALWAYS A HEAL, warped or not. "Stops 1 point of
   * ongoing bleed" has nothing to act on, and a casting that did nothing
   * because the caster guessed wrong is the reading the ruling refuses.
   *
   * THIS LINE READ `!isBleeding || points < 1` AND THE SECOND HALF WAS
   * DEAD. The mutation runner said so: removing it changed no answer
   * anywhere, because `normaliseBleedAlternative` already refuses a row
   * with fewer than one point, so a `spec` that exists always carries at
   * least one — and a casting with NO relief at all falls through to the
   * `!spec` branch below and returns `bleed: 0` regardless.
   *
   * The sixth dead guard this project has deleted rather than written a
   * check around. A guard that can be removed without moving a single
   * result is not protecting anything, and leaving it would have implied
   * a case that cannot happen.
   */
  if (!isBleeding) return { heal: true, bleed: 0 };

  // BOUGHT BOTH: both, and the choice never arises.
  if (warpMods?.bleedAndHeal || spec?.both) return { heal: true, bleed: points };

  // AND A SPELL THAT PRINTS NO "OR" DOES BOTH ANYWAY. Voice Of Healing's
  // "+2 PP: reduce a bleeding wound by 1" is an ADDITION to its healing,
  // not an alternative to it — the word "instead" is what makes Cure and
  // Self Healing a choice, and Voice Of Healing does not use it. So the
  // exclusive branch below belongs only to spells that declared one.
  if (!spec) return { heal: true, bleed: points };

  return { heal: false, bleed: points };
}

/**
 * What the card says when bleeding was stopped.
 *
 * THE NUMBERS ON BOTH SIDES. "Stops 1 point of bleeding" is invisible on
 * a sheet that already showed a number — a reader cannot tell a spell
 * that worked from one that found less bleeding than it could clear.
 */
export function bleedStoppedLine(targetName, from, to) {
  const before = Math.max(0, int(from));
  const after = Math.max(0, int(to));
  if (after <= 0) {
    return `${targetName}: <strong>bleeding stops</strong> (was ${before}).`;
  }
  return `${targetName}: bleeding <strong>${before}</strong> &rarr; <strong>${after}</strong>.`;
}

/**
 * The sentence explaining why a creature was healed rather than bled.
 *
 * SAID ONLY WHERE IT COULD SURPRISE, which is a casting that had a bleed
 * alternative and did not use it on somebody. On a spell with no
 * alternative there is nothing to explain and this returns null.
 */
export function healedInsteadLine(spec, targetName) {
  if (!spec) return null;
  return `<em>${targetName} was not bleeding, so the healing applied instead.</em>`;
}
