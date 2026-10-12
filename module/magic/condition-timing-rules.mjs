/**
 * How long a condition a spell applies actually lasts, when the page does
 * not give a plain number.
 *
 * NEW at 3.590.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SHAPES, BOTH FROM PAGES 281-290, BOTH PREVIOUSLY UNSAYABLE.
 *
 *   A ROLLED LENGTH.  Word Of Blinding blinds "for 1d4 minutes";
 *   Magnificent Dawn blinds "for 3d6 rounds". Written into a `duration`
 *   string these did not fail — they parsed as the WRONG NUMBER, because
 *   the parser's numeric match finds the digit sitting before the unit:
 *   "1d4 minutes" read as 4 minutes and "3d6 rounds" as 6 rounds. A
 *   confident wrong answer from a correctly written string.
 *
 *   A LENGTH FROM THE MARGIN.  Holy Shout stuns "1 round per 2 failure"
 *   and knocks unconscious "1 round per 4 failure" — the length depends
 *   on how badly the save was missed, which nothing in this system
 *   computed. It is the only spell in the Grimoire that does it, and the
 *   arithmetic is small enough that a bespoke handler would be more code
 *   than the rule.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BOTH PRODUCE A DURATION STRING, DELIBERATELY.
 *
 * The temptation was to return rounds and hand them to
 * `spellExpiryTiming` directly. These return "3 rounds" and "2 minutes"
 * instead, so the value rejoins `parseSpellDuration` — the one reader
 * that decides what a duration means — at the same door every authored
 * duration comes through. A second path to "how long is this" is a
 * second answer waiting to disagree with the first, and this file's
 * whole reason for existing is that the first answer was wrong.
 */

const DICE = /^(\d+)\s*d\s*(\d+)\s*(rounds?|minutes?|mins?|hours?|hrs?|days?)$/i;

/** Units this may produce, spelt as `parseSpellDuration` reads them. */
const UNIT = Object.freeze({
  round: "round", rounds: "round",
  minute: "minute", minutes: "minute", min: "minute", mins: "minute",
  hour: "hour", hours: "hour", hr: "hour", hrs: "hour",
  day: "day", days: "day"
});

/**
 * Read a rolled duration into its dice and unit, or null.
 *
 * @returns {{formula: string, unit: string}|null}
 */
export function parseRolledDuration(raw) {
  const m = String(raw ?? "").trim().match(DICE);
  if (!m) return null;
  const unit = UNIT[m[3].toLowerCase()];
  if (!unit) return null;
  const count = Number(m[1]);
  const faces = Number(m[2]);
  // A d0, or nothing to roll, is a typo rather than a duration.
  if (!Number.isFinite(count) || !Number.isFinite(faces) || count < 1 || faces < 1) return null;
  return { formula: `${count}d${faces}`, unit };
}

/**
 * The duration string a rolled length produced.
 *
 * @param {number} rolled what the dice came up
 * @param {string} unit from parseRolledDuration
 */
export function rolledDurationText(rolled, unit) {
  const n = Math.max(1, Math.trunc(Number(rolled) || 0));
  // AT LEAST ONE. A 3d6 that somehow came up 0 is not a condition that
  // never applied — it is a condition with no length, which is the
  // permanence this whole release is about.
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * "1 round per N failure" — the length Holy Shout computes.
 *
 * THE MARGIN IS HOW FAR UNDER THE DC THE ROLL LANDED, and arrives
 * negative from `buildOutcome`. Measured live on 24 September: a save
 * missed by seven reads -7.
 *
 * ROUNDED DOWN, AND AT LEAST ONE ROUND. A creature that failed by 1
 * against "1 round per 2 failure" gets zero rounds by arithmetic, and
 * zero rounds is a condition applied and instantly gone — which reads at
 * the table as the spell doing nothing on a save it actually failed. The
 * page gives it the condition; the floor is what stops the arithmetic
 * taking it away again.
 *
 * @param {number|null} margin negative on a failure
 * @param {number} per how many points of failure buy a round
 * @returns {number|null} rounds, or null when there is nothing to measure
 */
export function roundsFromMargin(margin, per) {
  const step = Math.trunc(Number(per) || 0);
  if (step < 1) return null;
  const m = Number(margin);
  // AN UNMEASURED MARGIN IS NOT A MARGIN OF ZERO. `Number(null)` is 0 and
  // 0 is finite, so the two would be one answer and every unmeasured
  // save would silently get the minimum.
  if (margin === null || margin === undefined || !Number.isFinite(m)) return null;
  const failedBy = Math.max(0, -Math.round(m));
  return Math.max(1, Math.floor(failedBy / step));
}

/** The duration string a margin-scaled length produced. */
export function marginDurationText(rounds) {
  const n = Math.max(1, Math.trunc(Number(rounds) || 0));
  return `${n} round${n === 1 ? "" : "s"}`;
}

/**
 * "FATIGUED 1 PER POINT OF FAILURE (MAX 5)" — a condition's VALUE scaled
 * by how badly the save was missed.
 *
 * NEW at 3.591.0. Nightmare is the only spell in the Grimoire that does
 * it, and it is `roundsFromMargin`'s sibling: the same margin, the same
 * floor at one, the same refusal of an unmeasured margin — a different
 * unit, and a printed ceiling this one has to honour.
 *
 * THE CAP IS THE ROW'S, NOT A CONSTANT. Nightmare prints "(max 5)"; a
 * later spell may print another number or none, and a constant here
 * would be wrong for one of them. A cap of zero means none was printed,
 * for the reason `warpedSuppression` gives: clamping to a falsy cap
 * suppresses everything.
 *
 * ONE POINT PER POINT, BY DEFAULT. Nightmare's rate is 1:1 and says so
 * with `per: 1`; the parameter exists because the sentence has a shape
 * ("1 per N") that another spell will fill differently, exactly as Holy
 * Shout fills it with 2 and 4.
 *
 * @param {number|null} margin negative on a failure
 * @param {number} per how many points of failure buy one point of value
 * @param {number} cap the printed ceiling, or 0 for none
 * @returns {number|null} the value, or null when there is nothing to measure
 */
export function valueFromMargin(margin, per = 1, cap = 0) {
  const step = Math.trunc(Number(per) || 0);
  if (step < 1) return null;
  // AN UNMEASURED MARGIN IS NOT A MARGIN OF ZERO — `Number(null)` is 0
  // and 0 is finite, so the two would be one answer and every unmeasured
  // save would silently get the minimum.
  if (margin === null || margin === undefined || !Number.isFinite(Number(margin))) return null;
  const failedBy = Math.max(0, -Math.round(Number(margin)));
  const wanted = Math.max(1, Math.floor(failedBy / step));
  const ceiling = Math.trunc(Number(cap) || 0);
  return ceiling > 0 ? Math.min(wanted, ceiling) : wanted;
}
