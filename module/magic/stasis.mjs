/**
 * STASIS — NEW at 3.614.0, Graham's R2 of 2 October 2026 (block 35).
 *
 * Page 357:
 *   "Failure  Time comes to a complete halt for the target for 1 round.
 *             During this period, the target becomes impervious to all
 *             forms of damage and cannot be targeted by anything. No rounds
 *             pass for any timed effects, conditions, afflictions, or other
 *             ongoing effects that may affect the target. While in this
 *             state of stasis, the target becomes immovable, defying even
 *             the forces of gravity.
 *    Fumble   As failure, but the target is held in stasis for 3 rounds. At
 *             the end of each of its turns, it can attempt a new save to
 *             reduce the remaining duration by 1 round or end it entirely
 *             on a critical."
 *
 * WHAT EACH CLAUSE BECOMES.
 *   impervious      `applyDamageDirect` refuses the blow (combat/dying-workflow.mjs)
 *   not targetable  a WARNING when someone targets it — Graham's R2, "Warn"
 *   no time passes  its other effects are skipped by every expiry sweep while
 *                   it stands, and their clocks move on by the time it lasted
 *                   when it ends; its own turns do nothing — no actions, no
 *                   bleeding, no recurring damage
 *   immovable       a move of its token is refused
 *   the Fumble      a Will save at the end of each of its turns: a success
 *                   takes a round off, a critical (or better) ends it
 *
 * Pure; no Foundry. The documents half is stasis-workflow.mjs.
 */

export const STASIS_FLAG = "stasis";

/** Seconds in a round, for the world clock's share of the freeze. */
const ROUND_SECONDS = 6;

const int = (v) => Math.trunc(Number(v) || 0);

/**
 * One authored stasis row, or null when it is malformed.
 * @param {object} raw
 * @returns {{rounds: number, saveEachTurn: boolean, save: string, label: string}|null}
 */
export function normaliseStasis(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rounds = int(raw.rounds);
  if (rounds < 1) return null;
  return {
    rounds,
    saveEachTurn: raw.saveEachTurn === true,
    save: String(raw.save ?? "will").trim().toLowerCase() || "will",
    label: String(raw.label ?? "Stasis").trim() || "Stasis"
  };
}

/**
 * The stasis effect among a creature's effects, or null.
 * TAKES PLAIN ROWS — `{id, disabled, flags}` — so the sweeps and the harness
 * ask the same question.
 */
export function stasisEffectOf(effects) {
  return (Array.isArray(effects) ? effects : Array.from(effects ?? []))
    .find((e) => !e?.disabled && e?.flags?.["trg-prime"]?.[STASIS_FLAG]) ?? null;
}

/**
 * Is this effect held still by a stasis on the same creature?
 * The stasis itself is not — it is the one clock that must keep running.
 * @param {object} effect
 * @param {object|null} stasis the creature's stasis effect, if any
 */
export function frozenByStasis(effect, stasis) {
  return Boolean(stasis) && effect?.id !== stasis.id;
}

/**
 * What the Fumble's end-of-turn save does.
 * @param {{success?: boolean, key?: string}|null} degree the save's degree
 * @returns {"end"|"shorten"|"none"}
 */
export function stasisSaveOutcome(degree) {
  const key = String(degree?.key ?? "").toLowerCase();
  if (key === "critical" || key === "heroic") return "end";
  if (degree?.success) return "shorten";
  return "none";
}

/**
 * How far the frozen clocks move when the stasis ends: by the rounds and
 * seconds it lasted, never backwards.
 * @param {{startRound?: number|null, startTime?: number}} record
 * @param {{round?: number|null, worldTime?: number}} now
 */
export function stasisElapsed(record, now) {
  const rounds = record?.startRound !== null && record?.startRound !== undefined
    && now?.round !== null && now?.round !== undefined
    ? Math.max(0, int(now.round) - int(record.startRound)) : 0;
  const seconds = Math.max(0, Number(now?.worldTime ?? 0) - Number(record?.startTime ?? 0));
  return { rounds, seconds: Math.max(seconds, rounds * ROUND_SECONDS) };
}

/**
 * The flag updates that move one frozen effect's clocks on.
 * @param {object} flags the effect's `trg-prime` flags
 * @param {{rounds: number, seconds: number}} elapsed
 * @returns {object} an update object, empty when nothing moves
 */
export function resumedClockUpdates(flags, elapsed) {
  const out = {};
  const f = flags ?? {};
  const bump = (key, by) => {
    if (f[key] === undefined || f[key] === null || !by) return;
    out[`flags.trg-prime.${key}`] = Number(f[key]) + by;
  };
  bump("conditionExpiresRound", elapsed?.rounds ?? 0);
  bump("spellEffectEnd", elapsed?.seconds ?? 0);
  bump("conditionExpiresTime", elapsed?.seconds ?? 0);
  return out;
}

/**
 * The clock updates that take one round off a stasis (the Fumble's save).
 * @param {object} flags the stasis effect's `trg-prime` flags
 */
export function shortenedStasisUpdates(flags) {
  const out = {};
  const f = flags ?? {};
  if (f.conditionExpiresRound !== undefined && f.conditionExpiresRound !== null) {
    out["flags.trg-prime.conditionExpiresRound"] = Number(f.conditionExpiresRound) - 1;
  }
  if (f.spellEffectEnd !== undefined && f.spellEffectEnd !== null) {
    out["flags.trg-prime.spellEffectEnd"] = Number(f.spellEffectEnd) - ROUND_SECONDS;
  }
  return out;
}

/** The card line when a creature is put in stasis. */
export function stasisLine(targetName, spec) {
  const n = spec?.rounds ?? 1;
  return `<strong>${targetName}</strong> is held in <strong>stasis</strong> for ${n} round${n === 1 ? "" : "s"}`
    + " — impervious to all damage, immovable, and no time passes for its effects"
    + (spec?.saveEachTurn ? "; at the end of each of its turns it saves again (a success takes a round off, a critical ends it)" : "")
    + ".";
}

/** The card line on each of its turns. */
export function stasisTurnLine(name) {
  return `<em>${name} is held in stasis — it cannot act, and no time passes for it.</em>`;
}
