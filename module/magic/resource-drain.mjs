/**
 * A spell rung that takes something other than hit points.
 *
 * NEW at 3.589.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS ON PAGES 271-280, AND NEITHER FITS `saveLadder`.
 *
 *   ELDRITCH DISRUPTION  "A target that has Power Points is subjected to
 *                         an additional effect based upon their saving
 *                         throw.  Success: drained of 1d6 PP.  Failure:
 *                         2d6 PP.  Fumble: 4d6 PP.  If the target is
 *                         reduced to below 0 PP by this spell, they take
 *                         any excess PP drain as Soul Drain."
 *
 *   ENERVATION            "Failure: 2d8 recurring essence damage and 2d8
 *                         soul drain.  Fumble: 4d8 ... and is doomed 1."
 *
 * `saveLadder` rolls dice and applies them AS DAMAGE, through the
 * defence vocabulary. Neither of these is damage: one empties a
 * spellcaster's pool and the other lowers a maximum. Sending them down
 * the damage path would have let resistance halve them, which is the
 * kind of wrong that looks right on a card.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS IS A ROW, NOT A LADDER, AND THAT IS THE WHOLE DESIGN.
 *
 * The obvious build was `resourceLadder` — four rungs in one row, the
 * shape `saveLadder` has. It would have been a third way to say "this
 * happens on a Fumble", beside `onSave` and `saveLadder`, and block 25
 * recorded what happens then: I got as far as extending save-ladder.mjs
 * with a parallel `conditions` map before finding `onSave` already
 * existed, and reverted it rather than ship two mechanisms to keep in
 * step.
 *
 * `declaredDegrees` reads `effect.onSave` for ANY kind — Fear is five
 * gated `condition` rows and has been since it was authored. So a
 * three-rung resource ladder is three gated rows, and this file needs to
 * know nothing about degrees at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BELOW-ZERO RULE IS NOT RESTATED HERE.
 *
 * Chapter 4 page 91: "If your PP value would drop below 0 you instead
 * take 5 Soul Drain for every PP that you would fall below 0."
 * `spendPowerPoints` in power-points.mjs is that rule, and
 * `applyPowerPointCost` is the one place that writes it to a sheet —
 * written that way, in its own words, "so that 'spend PP' cannot be done
 * anywhere without the half of the sentence that charges for going below
 * zero."
 *
 * Eldritch Disruption's own sentence about the overflow is therefore
 * already implemented. A drain that went through `update()` directly
 * would have been the forty-first caller to forget it.
 */

const text = (v) => String(v ?? "").trim();
const DICE = /^\d+(d\d+)?(\s*\+\s*\d+)?$/i;

/** What a row may take. */
export const DRAINABLE = Object.freeze(["pp", "souldrain"]);

/** What the caster may recover of what was taken. */
const SHARES = Object.freeze({ half: 0.5, all: 1 });

/**
 * Read a `resource` effect row.
 *
 * @returns {{resource: "pp"|"soulDrain", formula: string,
 *   casterGains: string, label: string}|null}
 */
export function normaliseResourceDrain(raw) {
  if (!raw || typeof raw !== "object") return null;

  const asked = text(raw.resource).toLowerCase();
  if (!DRAINABLE.includes(asked)) return null;
  const resource = asked === "pp" ? "pp" : "soulDrain";

  const formula = text(raw.formula);
  // A drain with no dice is not a drain. Refused here rather than
  // reaching `new Roll("")`, which throws mid-cast.
  if (!formula || !DICE.test(formula)) return null;

  // WHAT THE CASTER GETS BACK, and only from PP. Eldritch Disruption's
  // two warps say "you gain half the PP drained" and "you gain all of
  // the PP drained"; nothing in the book hands a caster somebody else's
  // Soul Drain, and a row that asked would be a typo rather than a rule.
  const share = text(raw.casterGains).toLowerCase();
  const casterGains = resource === "pp" && Object.hasOwn(SHARES, share) ? share : "";

  return { resource, formula, casterGains, label: text(raw.label) || "Drain" };
}

/**
 * How much the caster recovers of what was taken.
 *
 * ROUNDED DOWN, and the floor matters: "half the PP drained" of 3 PP is
 * 1, not 1.5, and a fractional Power Point would land in a pool the
 * sheet renders as a whole number.
 *
 * READ FROM WHAT WAS ACTUALLY TAKEN, never from what was rolled. A
 * target holding 2 PP against a 4d6 drain loses 2; the warp says "the PP
 * drained", so the caster gains from 2. Rolling 14 and handing the
 * caster 7 would be minting power points out of a pool that never had
 * them.
 */
export function casterGainFrom(taken, share) {
  const rate = SHARES[String(share ?? "").toLowerCase()];
  if (!rate) return 0;
  const had = Math.max(0, Math.trunc(Number(taken) || 0));
  return Math.floor(had * rate);
}

/** The card line for a drain. */
export function resourceDrainLine(label, targetName, { resource, rolled, taken, note = "" } = {}) {
  if (resource === "soulDrain") {
    return `${targetName}: <strong>${rolled} Soul Drain</strong> from ${label}.`;
  }
  // THE ROLL AND THE TAKE ARE BOTH PRINTED WHEN THEY DIFFER, because "4
  // PP drained" on a 14 roll looks like a bug to a player who watched
  // the dice, and the difference is the rule — you cannot drain a pool
  // past empty, you charge Soul Drain for the rest.
  const head = taken === rolled
    ? `<strong>${taken} PP</strong> drained`
    : `<strong>${taken} PP</strong> drained of ${rolled} rolled`;
  return `${targetName}: ${head} by ${label}.${note ? ` ${note}` : ""}`;
}

/** The card line for what the caster took back. */
export function casterGainLine(casterName, gained, share) {
  if (gained <= 0) return "";
  const how = String(share).toLowerCase() === "all" ? "all" : "half";
  return `${casterName} recovers <strong>${gained} PP</strong> (${how} of what was drained).`;
}
