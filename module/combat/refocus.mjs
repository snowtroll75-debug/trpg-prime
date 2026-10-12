/**
 * Refocus (Chapter 6, Skill Actions — Mental Focus): "Blunder As
 * fumble, but your mind also backlashes; you take 1d4 mental damage
 * per level (basic Will)."
 *
 * The damage roll and the save mitigating it are two separate steps
 * — the "basic Will" save doesn't come from the Refocus check itself
 * (that check already resolved to Blunder), it's a fresh save purely
 * to reduce this backlash damage, matching the same shape as Falling
 * From Height's own injury save: no attacking creature or effect
 * here either, just the actor's own mind, so it's their own Level DC
 * — see falling.mjs for the same reasoning applied there.
 */

/** The mental damage formula for a Refocus blunder: 1d4 per level. */
export function refocusBlunderFormula(level) {
  const clamped = Math.max(1, Math.floor(Number(level) || 1));
  return `${clamped}d4`;
}

/**
 * Refocus "restores an ability with the Focus trait" (Chapter 4). Whether an
 * item carries the Focus trait, tested against its traits string
 * (case-insensitive, whole word). Granted innate spells carry it by
 * default — see `grantedInnateTakesFocus` for the rule and for what the
 * comment here used to claim.
 */
export function hasFocusTrait(traits) {
  return /\bfocus\b/i.test(String(traits ?? ""));
}

/**
 * Does a GRANTED INNATE SPELL carry the Focus trait?
 *
 * Graham's rule, 14 Aug 2026: "a number of feats grant an innate spell
 * with the focus trait. So unless a granted innate spell states
 * specifically that it can be used at will, constant or so many times per
 * day it should have the focus trait."
 *
 * So Focus is the DEFAULT and the three statements are the exceptions:
 *
 *   at will      — `usesPerDay: "unlimited"`, or the words in its text
 *   constant     — an always-on effect, never spent
 *   N times/day  — any usesPerDay that resolves to a number or formula
 *
 * A blank `usesPerDay` states nothing, which is exactly the case the rule
 * is written for: one use, restored by Refocus rather than by the clock.
 *
 * THE COMMENT ABOVE USED TO CLAIM "most innate spells carry the Focus
 * trait" and not one entry in any pack did — three creature abilities,
 * five feats and three runes carry it, and zero spells. So Refocus had
 * been shipped, wired and correct for two versions with nothing in the
 * world it could ever restore. This is what puts the trait on.
 *
 * @param {{traits?: string, usesPerDay?: string|number, description?: string}} spellSystem
 * @returns {boolean}
 */
export function grantedInnateTakesFocus(spellSystem = {}) {
  if (hasFocusTrait(spellSystem.traits)) return false;

  const uses = String(spellSystem.usesPerDay ?? "").trim();
  // "so many times per day" — anything at all in that field is a statement
  // of how often, including "unlimited", which is how this pack spells
  // at-will.
  if (uses) return false;

  // …and the same three things said in prose instead of in the field.
  const text = `${spellSystem.description ?? ""} ${spellSystem.traits ?? ""}`;
  if (/\bat[- ]will\b|\bconstant(ly)?\b|\btimes per day\b|\bper day\b/i.test(text)) return false;

  return true;
}

/** That spell's traits with Focus added, or unchanged if it already has it. */
export function withFocusTrait(traits) {
  const current = String(traits ?? "").trim();
  if (hasFocusTrait(current)) return current;
  return current ? `${current}, Focus` : "Focus";
}

/**
 * A successful Refocus restores one use of the chosen Focus ability — +1,
 * never past its per-day maximum (Graham: one chosen item, +1 use, no daily
 * cap).
 */
export function restoredUses(current, max) {
  const cur = Math.max(0, Math.floor(Number(current) || 0));
  const cap = Math.floor(Number(max) || 0);
  return Math.min(cap, cur + 1);
}

/* ------------------------------------------------------------------ */
/* The outcome ladder                                                  */
/* ------------------------------------------------------------------ */

/**
 * REFOCUS, as rewritten by Graham on 21 August 2026:
 *
 *   Critical  You instantly regain the use of the ability and may use it
 *             again immediately (AP dependant).
 *   Success   You regain the use of the ability and may use it again at
 *             the beginning of your next turn.
 *   Partial   You fail to regain the ability and must wait 1 minute
 *             before it can be used again.
 *   Failure   You fail to regain the ability and cannot attempt to
 *             Refocus that ability again for 10 minutes.
 *   Fumble    You fail to regain the ability and cannot use it again
 *             until your next daily preparation.
 *   Blunder   As fumble, but your mind also backlashes; you take 1d4
 *             mental damage per level (basic Will).
 *
 * WHAT THE LADDER VARIES IS *WHEN THE USE COMES BACK*, and reading it
 * that way is what makes every rung strictly worse than the one above
 * it: now → the start of your next turn → one minute → not for ten
 * minutes, and only then with another attempt → not today at all. The
 * printed words differ in kind — two rungs talk about using the ability,
 * one talks about attempting the action — but they are descriptions of
 * one clock seen from either end. A character Refocuses an ability that
 * is SPENT, so "you cannot use it again until your next daily
 * preparation" and "you may not try again today" are the same sentence:
 * with the ability at zero uses, Refocus is the only thing that could
 * have handed it back before morning.
 *
 * THAT IS WHY NOTHING HERE SUPPRESSES A USE. An earlier draft gated the
 * ability itself, which would have meant a Fumble burning the uses a
 * partly-spent ability still had — a punishment the rewrite never
 * printed, imposed by an implementation detail. This blocks the ATTEMPT
 * and schedules the RESTORE, and leaves what the sheet already holds
 * alone. The one case the text genuinely leaves open — Refocusing an
 * ability that still has uses left — therefore resolves like any other:
 * a failed attempt costs you the attempt, not the uses. Named here
 * rather than decided in silence.
 *
 * WHY A PARTIAL BLOCKS RE-ATTEMPTS FOR ITS MINUTE. "Must wait 1 minute"
 * has to bite on something. Without the block a player would Refocus
 * again next turn and beat the wait, collapsing Partial back into the
 * retry-next-turn rung this rewrite replaced.
 */

/** One minute, in world-clock seconds — the Partial wait. */
export const REFOCUS_MINUTE = 60;
/** Ten minutes, in world-clock seconds — the Failure re-attempt block. */
export const REFOCUS_TEN_MINUTES = 600;

/**
 * Each degree's rung. `restore` is when the use returns; `block` is how
 * many seconds Refocus may not be attempted on that ability again;
 * `dailyPrep` blocks it for the rest of the day instead.
 */
export const REFOCUS_LADDER = Object.freeze({
  heroic:   Object.freeze({ restore: "now",      block: 0,                   dailyPrep: false, backlash: false }),
  critical: Object.freeze({ restore: "now",      block: 0,                   dailyPrep: false, backlash: false }),
  success:  Object.freeze({ restore: "nextTurn", block: 0,                   dailyPrep: false, backlash: false }),
  partial:  Object.freeze({ restore: "minute",   block: REFOCUS_MINUTE,      dailyPrep: false, backlash: false }),
  failure:  Object.freeze({ restore: "none",     block: REFOCUS_TEN_MINUTES, dailyPrep: false, backlash: false }),
  fumble:   Object.freeze({ restore: "none",     block: 0,                   dailyPrep: true,  backlash: false }),
  blunder:  Object.freeze({ restore: "none",     block: 0,                   dailyPrep: true,  backlash: true })
});

/**
 * What one Refocus check does, resolved against the world clock.
 *
 * An unknown degree falls to Failure, never to nothing: a check that did
 * not resolve must not quietly hand the use back.
 *
 * @param {string} degree
 * @param {{worldTime?: number}} [options]
 */
export function refocusPlan(degree, { worldTime = 0 } = {}) {
  const rung = REFOCUS_LADDER[String(degree)] ?? REFOCUS_LADDER.failure;
  const now = Number(worldTime) || 0;
  return {
    restore: rung.restore,
    restoreNow: rung.restore === "now",
    restoreNextTurn: rung.restore === "nextTurn",
    restoreAt: rung.restore === "minute" ? now + REFOCUS_MINUTE : null,
    blockedUntil: rung.block ? now + rung.block : null,
    blockedUntilDailyPrep: rung.dailyPrep,
    backlash: rung.backlash
  };
}

/**
 * OUT OF COMBAT THERE IS NO NEXT TURN. "May use it again at the beginning
 * of your next turn" is a six-second distinction that exists only inside
 * initiative; outside it, a restore waiting on a turn start waits for a
 * boundary that never arrives, and the ability never comes back at all.
 * Collapsed to an immediate restore instead.
 *
 * @param {object} plan  from `refocusPlan`
 * @param {{inCombat?: boolean}} [options]
 */
export function refocusTiming(plan, { inCombat = false } = {}) {
  if (!plan?.restoreNextTurn || inCombat) return plan;
  return { ...plan, restore: "now", restoreNextTurn: false, restoreNow: true };
}

/**
 * The state a plan leaves on the ability, or null when it leaves none —
 * an immediate restore is finished the moment it happens.
 */
export function refocusState(plan) {
  if (!plan) return null;
  const state = {
    restoreAt: plan.restoreAt ?? null,
    nextTurn: Boolean(plan.restoreNextTurn),
    blockedUntil: plan.blockedUntil ?? null,
    dailyPrep: Boolean(plan.blockedUntilDailyPrep)
  };
  if (state.restoreAt === null && !state.nextTurn && state.blockedUntil === null && !state.dailyPrep) {
    return null;
  }
  return state;
}

/**
 * May this ability be Refocused right now? Returns the reason as well as
 * the verdict, so the picker can SAY why an ability is missing from it
 * rather than quietly leaving it out.
 *
 * @param {object|null} state  the ability's stored Refocus state
 * @param {{worldTime?: number}} [options]
 * @returns {{barred: boolean, reason: string}}
 */
export function refocusBarred(state, { worldTime = 0 } = {}) {
  if (!state) return { barred: false, reason: "" };
  if (state.dailyPrep) {
    return { barred: true, reason: "not until your next daily preparation" };
  }
  const now = Number(worldTime) || 0;
  const until = Number(state.blockedUntil ?? 0);
  if (state.blockedUntil != null && until > now) {
    const minutes = Math.ceil((until - now) / REFOCUS_MINUTE);
    return { barred: true, reason: `not for another ${minutes} minute${minutes === 1 ? "" : "s"}` };
  }
  return { barred: false, reason: "" };
}

/**
 * Has a pending restore come due? A "next turn" restore waits for the
 * character's OWN turn to begin; a timed one waits for the world clock.
 *
 * @param {object|null} state
 * @param {{worldTime?: number, ownTurnStarted?: boolean}} [options]
 */
export function refocusRestoreDue(state, { worldTime = 0, ownTurnStarted = false } = {}) {
  if (!state) return false;
  if (state.nextTurn) return Boolean(ownTurnStarted);
  if (state.restoreAt == null) return false;
  return (Number(worldTime) || 0) >= Number(state.restoreAt);
}

/**
 * A COMPANION RESTORE ON A SUCCESSFUL REFOCUS (3.625.0). Pure.
 *
 * Pillars of Faith's Deepened Bond (Shaman, 7th): "Whenever you
 * successfully Refocus an expended Shaman Focus ability, you may choose
 * Manifest Spirit or Spirit Intercession and restore that ability in
 * addition to the ability you were attempting to restore. You cannot
 * restore the same ability twice." Declared on an effect:
 *
 *   flags["trg-prime"].refocusAlsoRestores = {
 *     label: "Deepened Bond",
 *     names: ["Manifest Spirit", "Spirit Intercession"]
 *   }
 *
 * "SUCCESSFULLY" is read as the ladder's restoring rungs — Success and
 * better — and the companion returns on the SAME timing as the ability
 * refocused, because the page grants it "in addition", not sooner.
 */
export function refocusCompanions(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.["trg-prime"]?.refocusAlsoRestores;
    if (!raw || typeof raw !== "object") continue;
    const names = (Array.isArray(raw.names) ? raw.names : []).map((n) => String(n ?? "").trim().toLowerCase()).filter(Boolean);
    if (!names.length) continue;
    out.push({ label: String(raw.label ?? effect.name ?? "Refocus"), names });
  }
  return out;
}

/** Did this Refocus succeed — a rung that restores? */
export function refocusSucceeded(degree) {
  return ["heroic", "critical", "success"].includes(String(degree ?? "").toLowerCase());
}

/**
 * The companion abilities a successful Refocus may also restore: named by a
 * declaration, spent, and not the ability just refocused.
 * @param {Array} companions refocusCompanions(...)
 * @param {Array<{id, name, spent: boolean}>} items the actor's Focus items with a spent use
 * @param {string} chosenId the ability the Refocus was aimed at
 */
export function refocusCompanionCandidates(companions = [], items = [], chosenId = "") {
  const wanted = new Set((companions ?? []).flatMap((c) => c.names));
  if (!wanted.size) return [];
  return (items ?? []).filter((i) => i && i.id !== chosenId && i.spent && wanted.has(String(i.name ?? "").trim().toLowerCase()));
}
