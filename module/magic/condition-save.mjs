/**
 * A condition you can save your way out of, turn by turn.
 *
 * NEW at 3.590.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUR SPELLS PRINT IT, AND ALL FOUR WERE NOTES.
 *
 *   HOLD ANIMAL / HOLD KIND  "paralyzed for 4 rounds. At the end of each
 *     of its turns, it can attempt a new Will save to REDUCE THE
 *     REMAINING DURATION BY 1 ROUND, or end it entirely on a critical
 *     success."
 *   DOMINATE  "the target can attempt a Will save at the end of each of
 *     its turns to break free of your influence. If successful, THE
 *     SPELL ENDS."
 *   PETRIFICATION  "must attempt a Fortitude save at the end of each of
 *     its turns... On a FAILED save, the slowed condition INCREASES
 *     by 1."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT THE RECURRING LADDER.
 *
 * The clock built at 3.587.0 hangs a spec on a REGION and asks who is
 * standing in it — Disturbing Tentacles is a place. None of these is a
 * place. The creature carries the condition and rolls to shed it, so the
 * spec rides the creature, and a target who walks out of the room is
 * still paralyzed.
 *
 * AND PETRIFICATION RUNS THE OTHER WAY. Its save does not shorten
 * anything; failing it makes the condition WORSE. A mechanism built for
 * "escape" alone would have needed a second one a page later, so both
 * directions are declared rather than assumed — the same position
 * `normaliseRecurringLadder` takes about which boundary it fires on.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "REDUCE THE REMAINING DURATION" IS NOT "REDUCE THE VALUE".
 *
 * Paralyzed is unvalued: there is no number on it to lower. What Hold
 * Animal shortens is the four ROUNDS it has left. Dominate ends outright.
 * Petrification raises a VALUE. Three different verbs, and collapsing
 * any two of them would make one of the three spells wrong — which is
 * how the flat rows this release is fixing came to exist.
 */

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
/** The canonical spelling from a vocabulary, matched without case. */
const pick = (vocab, raw) => vocab.find((v) => v.toLowerCase() === lower(raw)) ?? null;

/** The flag a target carries while it may save out of something. */
export const CONDITION_SAVE_FLAG = "conditionSave";

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
/** What a successful save does. */
export const ON_SUCCESS = Object.freeze(["end", "shorten", "reduceValue"]);
/** What a failed one does. Most spells: nothing. */
export const ON_FAILURE = Object.freeze(["none", "increaseValue"]);

/**
 * Read a `conditionSave` row, or a stored spec.
 *
 * @returns {{save: string, condition: string, onSuccess: string,
 *   onFailure: string, amount: number, label: string}|null}
 */
export function normaliseConditionSave(raw) {
  if (!raw || typeof raw !== "object") return null;

  const save = lower(raw.save);
  if (!SAVES.includes(save)) return null;

  const condition = lower(raw.condition);
  // A save out of nothing in particular cannot be resolved, and would
  // sit on a creature rolling every turn for ever.
  if (!condition) return null;

  /*
   * MATCHED CASE-INSENSITIVELY, CANONICAL FORM STORED.
   *
   * The first version tested `ON_SUCCESS.includes(lower(raw.onSuccess))`
   * against a camelCase vocabulary — so `lower("reduceValue")` is
   * "reducevalue", which is in no list, and `lower("increaseValue")`
   * likewise. `end` and `shorten` passed only because they happen to be
   * one word. Petrification's whole mechanism — "on a failed save the
   * slowed condition increases by 1" — silently became "no change", and
   * its own first test run said so.
   */
  const onSuccess = pick(ON_SUCCESS, raw.onSuccess);
  if (!onSuccess) return null;

  const onFailure = pick(ON_FAILURE, raw.onFailure) ?? "none";

  const amount = Math.max(1, Math.trunc(Number(raw.amount) || 0) || 1);
  /*
   * A CRITICAL FAILURE MAY COST MORE (3.590.0). Petrification: "On a
   * failed save, the slowed condition increases by 1 (OR 2 ON A
   * CRITICAL FAILURE)."
   *
   * Defaults to `amount`, so a spell that does not print a worse fumble
   * behaves exactly as it did — which is every other spell using this.
   */
  const rawFumble = Math.trunc(Number(raw.fumbleAmount) || 0);
  const fumbleAmount = rawFumble > 0 ? rawFumble : amount;

  const out = { save, condition, onSuccess, onFailure, amount, fumbleAmount,
    label: text(raw.label) || "This spell" };
  // A MODIFIER ON THE RE-SAVE (3.630.0) — Writ of Restraint's "+3 PP: the
  // target suffers a −2 status penalty to these subsequent Will saves".
  // Present only when set, so every older stamp reads as it did.
  const modifier = Math.trunc(Number(raw.modifier) || 0);
  if (modifier) out.modifier = modifier;
  /*
   * THE GORGON'S LADDER (3.650.0; F&F 3.0 block 17 R4). Petrifying Breath's
   * Partial: "petrified for 1 minute. It can attempt a new save at the end of
   * each of its turns, applying the new results immediately (even if they
   * are worse)." A Partial is no escape there — it is the rung the creature
   * is already on — and a Fumble is "petrified permanently".
   *   partialHolds    a Partial keeps the condition, as a failure does
   *   fumblePermanent a Fumble or Blunder takes the clock away and ends the
   *                   saves: the condition stays for good
   */
  if (raw.partialHolds === true) out.partialHolds = true;
  if (raw.fumblePermanent === true) out.fumblePermanent = true;
  return out;
}

/**
 * What one turn's save does.
 *
 * A CRITICAL SUCCESS ALWAYS ENDS IT, whatever `onSuccess` says. Hold
 * Animal prints that exception in as many words ("or end it entirely on
 * a critical success"), and no spell here prints the opposite — a
 * critical that merely shortened would be a worse result than the page
 * gives for a plain success on Dominate.
 *
 * A HEROIC IS TREATED AS A CRITICAL, for the reason block 25 settled:
 * a degree better than the best one printed cannot be worse than it.
 *
 * @param {object} spec normalised
 * @param {string} degree the degree rolled
 * @returns {{ends: boolean, shortenRounds: number, valueDelta: number}}
 */
export function conditionSaveOutcome(spec, degree) {
  const nothing = { ends: false, shortenRounds: 0, valueDelta: 0 };
  if (!spec) return nothing;
  const key = lower(degree);

  if (key === "critical" || key === "heroic") return { ...nothing, ends: true };

  // PERMANENT ON A FUMBLE (3.650.0): the clock goes, and so do the saves.
  if (spec.fumblePermanent && (key === "fumble" || key === "blunder")) return { ...nothing, permanent: true };

  const succeeded = key === "success" || (key === "partial" && !spec.partialHolds);
  if (succeeded) {
    if (spec.onSuccess === "end") return { ...nothing, ends: true };
    if (spec.onSuccess === "shorten") return { ...nothing, shortenRounds: spec.amount };
    return { ...nothing, valueDelta: -spec.amount };
  }

  // FAILED. Most spells do nothing; Petrification gets worse, and gets
  // worse FASTER on a fumble — the page prints both numbers.
  if (spec.onFailure === "increaseValue") {
    const worse = key === "fumble" || key === "blunder" ? spec.fumbleAmount : spec.amount;
    return { ...nothing, valueDelta: worse };
  }
  return nothing;
}

/** The card line for one turn's save. */
export function conditionSaveLine(spec, targetName, degree, outcome, remaining = null) {
  if (!spec || !outcome) return "";
  const head = `<strong>${spec.label}</strong> — ${targetName} rolls ${spec.save} (${degree})`;
  if (outcome.ends) return `${head}: <strong>${spec.condition} ends</strong>.`;
  if (outcome.shortenRounds > 0) {
    const left = remaining === null ? "" : ` — ${remaining} round${remaining === 1 ? "" : "s"} left`;
    return `${head}: ${spec.condition} shortened by ${outcome.shortenRounds}${left}.`;
  }
  if (outcome.valueDelta < 0) return `${head}: ${spec.condition} reduced by ${-outcome.valueDelta}.`;
  if (outcome.valueDelta > 0) return `${head}: <strong>${spec.condition} worsens by ${outcome.valueDelta}</strong>.`;
  return `${head}: no change.`;
}
