/**
 * A DEGREE THAT BUYS IMMUNITY FROM BEING TARGETED AGAIN (3.596.0).
 *
 * Graham, 26 September 2026, R7 of block 31: "Build both."
 *
 * PRINTED (Scrying, page 313), where the spell's whole outcome is the
 * saving throw:
 *
 *   Critical  "The spell fails and the target is temporarily immune for
 *             1 week. The target also gains a glimpse of you and learns
 *             its rough distance and direction from you."
 *   Success   "The spell fails, and the target is temporarily immune for
 *             1 day."
 *   Failure   "The spell succeeds."
 *   Fumble    "The spell succeeds, and the eye follows the target."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MECHANISM EXISTED AND NO SPELL COULD REACH IT.
 *
 * `temporary-immunity.mjs` has held `withImmunity`, `isTemporarilyImmune`
 * and `describeRemaining` since the action blocks, keyed by name and
 * pruned as the clock moves. Three things use it: an action's own
 * cooldown, an alchemical item's, and `flatLadder`'s `immuneSeconds`.
 *
 * A SAVE SPELL COULD NOT. Scrying is not a ladder — it has no damage per
 * degree — so its two immunities had nowhere to be authored, and the page's
 * "temporarily immune for 1 week" was prose.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A ROW PER DEGREE, GATED THE WAY EVERY OTHER ROW IS.
 *
 * `onSave: ["critical"]` with a week, `onSave: ["success"]` with a day.
 * Nothing new decides when they apply: `effectAppliesOnDegree` already
 * does, and a degree the page calls unaffected is simply not listed —
 * which is the Nightmare defect's cure, applied before it can happen here.
 *
 * KEYED BY THE SPELL'S OWN NAME by default, because that is what the page
 * means by "immune": immune to THIS spell, not to scrying in general. A row
 * may name its own key when two spells should share one immunity.
 */

const text = (v) => String(v ?? "").trim();
const int = (v) => Math.trunc(Number(v) || 0);

/*
 * ONE SOURCE OF TRUTH FOR THE UNITS (3.597.0). These were literals here
 * until the 3.596.0 drive made `describeRemaining` learn days and weeks;
 * two files each defining a week is how a card comes to disagree with the
 * clock it is describing. Re-exported because `verify-chapter10-311-320b`
 * reads them from this module.
 */
export { ONE_DAY, ONE_WEEK } from "../temporary-immunity.mjs";
import { ONE_DAY, ONE_WEEK } from "../temporary-immunity.mjs";

const UNITS = Object.freeze({
  round: 6, rounds: 6,
  minute: 60, minutes: 60,
  hour: 3600, hours: 3600,
  day: ONE_DAY, days: ONE_DAY,
  week: ONE_WEEK, weeks: ONE_WEEK,
  // TELEPATHIC DEMAND'S "the immunity lasts for 1 month" (3.609.0). Thirty
  // days: the length the world clock counts a month as wherever a rule
  // here needs one, and a reading rather than the calendar's own months.
  month: 30 * ONE_DAY, months: 30 * ONE_DAY
});

/**
 * A temporary-immunity row, or null when it is malformed.
 *
 * TAKES EITHER SECONDS OR A PRINTED LENGTH, because the page says "1 week"
 * and nobody should have to write 604800 to author it. A length nothing can
 * read is refused rather than silently treated as zero: an immunity of no
 * duration is an immunity that does nothing, which is the exact shape of
 * every silent-nothing defect this project has found.
 *
 * @param {object} raw the effect row
 * @returns {{seconds: number, key: string, label: string}|null}
 */
export function normaliseTempImmunity(raw) {
  if (!raw || raw.kind !== "tempImmunity") return null;
  let seconds = Math.max(0, int(raw.seconds));
  if (!seconds && raw.length) {
    const m = /^\s*(\d+)\s*([a-z]+)\s*$/i.exec(text(raw.length));
    const unit = m ? UNITS[m[2].toLowerCase()] : null;
    if (!unit) return null;
    seconds = Math.max(0, int(m[1])) * unit;
  }
  if (seconds <= 0) return null;
  return {
    seconds,
    key: text(raw.immunityKey),
    label: text(raw.label)
  };
}

/** What the card says when a target becomes immune. */
export function tempImmunityLine(targetName, spellName, describeRemaining, seconds) {
  return `<strong>${targetName}</strong> is temporarily immune to <strong>${spellName}</strong> `
    + `for ${describeRemaining(seconds)}.`;
}

/** And when the target was already immune, so the cast found nothing to do. */
export function alreadyImmuneLine(targetName, spellName, remaining) {
  return `<em>${targetName} is already immune to ${spellName} — ${remaining} left.</em>`;
}

/*
 * ─────────────────────────────────────────────────────────────────────
 * AND THE IMMUNITY KEEPS THE SPELL OFF (3.612.0, F1 of the 3.611.1 drive).
 *
 * Until now the row only RECORDED. Recasting Word Of Blinding at a creature
 * still immune for ten minutes rolled its save, printed "is already immune —
 * 10 minutes left", and blinded it permanently anyway: the line came from
 * the immunity row, and every other row on the spell went on regardless.
 * True of every spell carrying the row since 3.596.0 — Scrying, Tame,
 * Telepathic Demand, Word Of Stunning, Word Of Blinding.
 *
 * "Temporarily immune to this spell" means the spell does not affect it. So
 * the creature is taken out of the cast once the targets are settled and
 * before anything is rolled for it — no save, no row — and the card says
 * who and for how long. The same shape an action's cooldown refuses with.
 * ─────────────────────────────────────────────────────────────────────
 */

/**
 * Every key a spell's immunity rows record under. Empty for a spell with
 * none, which is nearly every spell, so the gate costs them nothing.
 *
 * @param {object[]} effects the spell's effect rows
 * @param {string} spellName
 * @returns {string[]}
 */
export function spellImmunityKeys(effects, spellName) {
  const keys = new Set();
  for (const raw of Array.isArray(effects) ? effects : []) {
    const spec = normaliseTempImmunity(raw);
    if (spec) keys.add(spec.key || text(spellName));
  }
  return [...keys].filter(Boolean);
}

/**
 * The longest time any of the spell's keys still has to run on a creature,
 * in seconds; 0 when it is not immune.
 *
 * @param {object} record the creature's immunity flag
 * @param {string[]} keys from spellImmunityKeys
 * @param {number} now world time
 * @param {(record: object, key: string, now: number) => number} remainingOf
 */
export function immunityStillRunning(record, keys, now, remainingOf) {
  let longest = 0;
  for (const key of keys) longest = Math.max(longest, Number(remainingOf(record ?? {}, key, now)) || 0);
  return longest;
}

/** What the card says for a creature the immunity keeps the spell off. */
export function immuneRefusedLine(targetName, spellName, remaining) {
  return `<strong>${spellName} doesn't affect ${targetName}</strong> — it is temporarily immune `
    + `(${remaining} left).`;
}
