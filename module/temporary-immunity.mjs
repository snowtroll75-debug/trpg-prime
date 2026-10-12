/**
 * "Temporarily immune to X for N" — the record and the question.
 *
 * NEW at 3.400.0, built for Guidance (Chapter 10, PP 0): "The target is
 * then temporarily immune to the spell for 1 hour." Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE PATTERN IS PRINTED TWENTY-SIX TIMES AND IMPLEMENTED NOWHERE.
 *
 * Measured, not assumed: "temporarily immune" appears 26 times in the
 * rulebook — Encourage ("immune to your attempts to encourage for the
 * next hour"), Calm ("each of them is temporarily immune for 1 hour"),
 * Demoralize (10 minutes), Treat Wounds (1 hour), Recharge Item (until
 * your next daily preparation), and more. Every one of them currently
 * lives as prose in a description, tracked by whoever is running the
 * game.
 *
 * SO THIS IS GENERAL IN SHAPE AND WIRED TO ONE THING. Building the
 * mechanism for a cantrip and pretending the other twenty-five are done
 * would be the silence this project keeps refusing; building all
 * twenty-six on the back of a cantrip would be a decision nobody asked
 * for, and several of them are skill actions rather than spells.
 * `verify-temporary-immunity` names the gap so a green run cannot be
 * mistaken for "the book's immunities are handled".
 *
 * ─────────────────────────────────────────────────────────────────────
 * WORLD TIME, NOT ROUNDS. An hour is 600 rounds, and none of these
 * effects care whether a combat is running — Treat Wounds' hour passes
 * over a rest, Guidance's over a walk to the next village. Foundry's
 * `game.time.worldTime` advances in both, and is the only clock that
 * does. The caller passes it in; this module never reads a global.
 *
 * THE RECORD IS A PLAIN MAP of key → expiry timestamp, kept in a flag on
 * whatever is immune. A key is whatever the rule names: a spell, a skill
 * action, a source. Keeping them in one namespaced record rather than
 * one flag each means a sweep can expire the lot without knowing what
 * any of them mean.
 */

/** The flag this record lives under, on the immune document. */
export const IMMUNITY_FLAG = "temporaryImmunity";

/** An hour, in seconds — the interval most of the book's entries use. */
export const ONE_HOUR = 3600;

/** A day and a week, which Scrying's two better degrees need (3.597.0). */
export const ONE_DAY = ONE_HOUR * 24;
export const ONE_WEEK = ONE_DAY * 7;

/** Normalised, so "Guidance" and "guidance" are one key. */
export function immunityKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

/**
 * Is this document immune to `name` right now?
 *
 * A MISSING RECORD IS NOT IMMUNE, and neither is an expired one. The
 * comparison is `>` rather than `>=` deliberately: an immunity that
 * expires exactly now has expired, and the alternative leaves a rule
 * blocking itself for one extra tick at a boundary players will hit
 * every time they wait out a duration on purpose.
 *
 * @param {object} record  key → expiry timestamp
 * @param {string} name
 * @param {number} now     world time in seconds
 */
export function isTemporarilyImmune(record, name, now) {
  // NO `if (!key) return false` GUARD, and its absence is measured
  // rather than assumed. It was here, and mutate-temporary-immunity
  // could not kill it: an empty key can never have an entry, because
  // `withImmunity` refuses to write one — so `record[""]` is always
  // undefined and the lookup below already answers false.
  //
  // A guard nothing can reach is a guard no mutation can prove, and an
  // unprovable line is what this project's harness rules refuse. The
  // invariant is enforced where it is reachable: at the writer, which
  // C6 checks and a mutation can break.
  const until = Number(record?.[immunityKey(name)]);
  if (!Number.isFinite(until)) return false;
  return until > Number(now);
}

/** How much longer, in seconds, or 0 when not immune. */
export function immunityRemaining(record, name, now) {
  const until = Number(record?.[immunityKey(name)]);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - Number(now));
}

/**
 * The record with `name` made immune for `seconds` from `now`.
 *
 * RETURNS A NEW OBJECT rather than mutating, so a caller cannot half-write
 * a flag it then fails to save.
 *
 * THE LONGER EXPIRY WINS. Re-applying an immunity that is already running
 * must not SHORTEN it — a second Demoralize inside the ten minutes should
 * not reset the clock down to a fresh ten if the first had longer left.
 * In practice equal intervals make this invisible; it matters the moment
 * two different rules name the same key with different lengths.
 */
export function withImmunity(record, name, seconds, now) {
  const key = immunityKey(name);
  if (!key) return { ...(record ?? {}) };
  const span = Math.max(0, Math.floor(Number(seconds) || 0));
  const until = Number(now) + span;
  const existing = Number(record?.[key]);
  const kept = Number.isFinite(existing) ? Math.max(existing, until) : until;
  return { ...(record ?? {}), [key]: kept };
}

/**
 * The record with everything already expired dropped.
 *
 * NOT REQUIRED FOR CORRECTNESS — `isTemporarilyImmune` already ignores a
 * stale entry — but a flag that only ever grows is a flag that grows for
 * ever, and a character who has been Demoralized four hundred times
 * should not carry four hundred dead timestamps to the next session.
 */
export function prunedImmunities(record, now) {
  const out = {};
  for (const [key, until] of Object.entries(record ?? {})) {
    if (Number(until) > Number(now)) out[key] = Number(until);
  }
  return out;
}

/**
 * A human interval for a card: "1 week", "1 day", "1 hour", "10 minutes".
 *
 * ROUNDED DOWN TO THE UNIT, because a card saying "immune for 59
 * minutes" when the rule printed an hour reads as a bug rather than as
 * arithmetic.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DAYS AND WEEKS ADDED at 3.597.0, from the 3.596.0 live drive.
 *
 * Every caller until Scrying measured in hours or less — action cooldowns,
 * an alchemical item, `flatLadder`'s `immuneSeconds` — so hours were the
 * largest unit and the ceiling never showed. Scrying's critical is a WEEK,
 * and the card read "temporarily immune to Scrying for 168 hours", which is
 * correct arithmetic and a terrible way to tell somebody they are safe for
 * a week. The drive caught it; no check could have, because no check knew
 * what the card was supposed to feel like.
 */
export function describeRemaining(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s === 0) return "";
  if (s >= ONE_WEEK) {
    const weeks = Math.floor(s / ONE_WEEK);
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  if (s >= ONE_DAY) {
    const days = Math.floor(s / ONE_DAY);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (s >= ONE_HOUR) {
    const hours = Math.floor(s / ONE_HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (s >= 60) {
    const minutes = Math.floor(s / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${s} second${s === 1 ? "" : "s"}`;
}

/**
 * The printed "temporarily immune" rules that are SKILL ACTIONS.
 *
 * NEW at 3.559.0, auditing pages 81–90. The mechanism above has existed
 * since 3.400.0 and reached spells only; `verify-temporary-immunity`
 * declared the unwired rules by name so a green run could not be
 * mistaken for "the book's immunities are handled". That list was right
 * to exist and wrong in its contents: it named **Calm**, described as "a
 * Diplomacy action, applied to everyone in an emanation", and Calm is a
 * PP 4 SPELL that prints no immunity at all. The action it described is
 * **Rally** (page 82), which was not on the list.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "TO YOUR ATTEMPTS", WHICH IS WHY THE KEY CARRIES THE ACTOR.
 *
 * Every one of these is scoped to one performer: "immune to YOUR attempts
 * to encourage", "temporarily immune to YOUR attempts to Demoralize it".
 * A second bard may still encourage the same ally in the same hour. So
 * the record's key is the action AND the creature that performed it, and
 * a bare action key would have made one character's failure everybody's.
 *
 * Treat Wounds is the exception the book itself writes differently —
 * "temporarily immune to Treat Wounds ACTIONS for 1 hour", with no
 * performer named — so it is keyed by the action alone.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ONES STILL NOT HERE, and why:
 *
 *   Treat Wounds' fumble  "immune ... until your next daily preparation"
 *                         — an event, not a span. The record holds
 *                         expiry timestamps; a daily preparation has no
 *                         timestamp until it happens.
 *   Coerce's fumble       "immune to further attempts by you to
 *                         Intimidate them for at least 1 week" — a span,
 *                         but gated on one degree and scoped to the
 *                         SKILL rather than the action.
 *   Pain Tolerance's      "immune to this check for 1 hour" — also
 *   fumble                degree-gated, and on the performer not a target.
 *
 * All three are degree-gated or event-shaped, which is a different
 * mechanism from "this action always does this". Named rather than
 * silently omitted.
 */
export const ACTION_IMMUNITIES = Object.freeze({
  encourage: Object.freeze({
    seconds: ONE_HOUR,
    perActor: true,
    label: "your attempts to Encourage them"
  }),
  demoralise: Object.freeze({
    seconds: 600,
    perActor: true,
    label: "your attempts to Demoralise them"
  }),
  rally: Object.freeze({
    seconds: ONE_HOUR,
    perActor: true,
    label: "your attempts to Rally them"
  }),
  treatWounds: Object.freeze({
    seconds: ONE_HOUR,
    perActor: false,
    label: "Treat Wounds"
  })
});

/**
 * The record key for one action's immunity, scoped as the book scopes it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DOT-FREE, AND THAT IS NOT COSMETIC. Foundry's `setFlag` reads a dot in
 * a key as a PATH, so an actor uuid — `Actor.CLlkeanjOvPI6Q0J` — turns
 * `demoralise:actor.cllkeanjovpi6q0j` into a NESTED OBJECT on the way in:
 *
 *     { "demoralise:actor": { "cllkeanjovpi6q0j": 11896648293 } }
 *
 * while every read asks for the flat key and gets `undefined`. The write
 * appears to succeed, the card correctly announces the immunity from the
 * in-memory result, and the target is immune to nothing at all.
 *
 * Measured on 3.559.1 by driving a failed Demoralise and then demoralising
 * the same creature again: the flag was there, and `isTemporarilyImmune`
 * said false.
 *
 * `attitude.mjs` learned this at 3.408.0 and its `attitudeKey` has
 * replaced dots with underscores ever since — its own note calls it "the
 * one door no harness could see: the Foundry boundary". This is that door
 * again, one module along, and the check below is why it will not be a
 * third time.
 *
 * @param {string} actionKey
 * @param {string} actorUuid The performer, for the "to your attempts" ones.
 * @returns {string} "" when the action prints no immunity.
 */
export function actionImmunityKey(actionKey, actorUuid = "") {
  const spec = ACTION_IMMUNITIES[String(actionKey ?? "")];
  if (!spec) return "";
  const performer = String(actorUuid ?? "").trim().replaceAll(".", "_");
  return spec.perActor
    ? immunityKey(`${actionKey}:${performer}`)
    : immunityKey(actionKey);
}
