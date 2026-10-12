/**
 * Donning and removing armour (Chapter 6).
 *
 * "Getting in and out of armour is time consuming—so make sure you're
 * wearing it when you need it! Donning light armour takes 5 rounds,
 * medium armour takes 4 minutes, and heavy armour takes 10 minutes;
 * these times are doubled when donning a full suit of armour."
 *
 * WHY IT ARRIVES NOW. The system already had a dangling reference to
 * this rule: the Quick Donning feat prints improved times on a success
 * and, on a failure, says "the armour takes its usual time" — a usual
 * time nothing in the tree could state. Fleetguard needed the same
 * figure, from the other direction, and was blocked on it for three
 * releases.
 *
 * EVERYTHING IS AP. Rounds, minutes and action points are three ways of
 * saying the same thing, and Fleetguard prints all three in one rune —
 * "1 round (3 AP)", "1 minute", "a free action (0 AP)". Held as AP so
 * two times can be compared without a caller deciding which unit won,
 * and formatted back into whichever unit reads best.
 *
 * REMOVING ARMOUR HAS NO PRINTED TIME. The rule's own first sentence is
 * about getting "in and out" of armour and then gives donning times
 * only. Quick Donning prints removal times on its better degrees (2
 * rounds, 5 rounds), which implies a base — but implying is not
 * printing, and this returns null for it rather than halving the donning
 * time or borrowing Quick Donning's success line. `removalTime` carried
 * that null and its reason to a card until 3.369.0, when it was deleted
 * for want of a caller — see the note where it stood.
 *
 * Pure arithmetic, no Foundry API.
 */

/** The units, in the one unit everything is held in. */
export const AP_PER_ROUND = 3;
export const ROUNDS_PER_MINUTE = 10;
export const AP_PER_MINUTE = AP_PER_ROUND * ROUNDS_PER_MINUTE;

/** The printed times, by armour category. */
export const DONNING_TIMES = Object.freeze({
  light: { rounds: 5 },
  medium: { minutes: 4 },
  heavy: { minutes: 10 }
});

/** "these times are doubled when donning a full suit of armour." */
export const FULL_SUIT_MULTIPLIER = 2;

/**
 * Is this armour a FULL SUIT, for the doubling above?
 *
 * ANSWERED FROM COVERAGE (3.573.0), not from the name. Page 149: "at the
 * bottom of the armour table is a section called suits of armour. Each of
 * these suits includes greaves and bracers of an appropriate material and
 * may also include a helmet (if stated)." Greaves cover the legs and
 * bracers the arms, so a suit is precisely a piece that covers torso,
 * arms and legs at once — which is exactly what the five "Full …" items
 * in the pack are authored with, and what a helmet, a pair of bracers or
 * a plain breastplate is not.
 *
 * The doubling had been dead code since it was written: `donningTimeFor`
 * took a `fullSuit` option that no caller ever passed, so Full Platemail
 * displayed the same 10 minutes as a breastplate. Found in the pages
 * 141-150 audit. Deciding it from the name would have been the guess the
 * old comment rightly refused; coverage is a fact the item already holds.
 */
export function isFullSuit(item) {
  const system = item?.system ?? {};
  return Boolean(system.coversTorso && system.coversArms && system.coversLegs);
}

/** A printed time — `{rounds}`, `{minutes}` or `{ap}` — as action points. */
export function timeToAP(time) {
  if (!time || typeof time !== "object") return null;
  if (Number.isFinite(Number(time.ap))) return Math.max(0, Math.trunc(Number(time.ap)));
  if (Number.isFinite(Number(time.rounds))) return Math.max(0, Math.trunc(Number(time.rounds))) * AP_PER_ROUND;
  if (Number.isFinite(Number(time.minutes))) return Math.max(0, Math.trunc(Number(time.minutes))) * AP_PER_MINUTE;
  return null;
}

/**
 * Action points as the sentence a person would say.
 *
 * Whole minutes read as minutes, whole rounds as rounds, and anything
 * under a round as the AP it is — which is the only unit Fleetguard's
 * best tiers are printed in. A free action is "0 AP" rather than "no
 * time at all", because the rune says so and because zero AP is still an
 * action taken.
 */
export function describeAP(ap) {
  const value = Math.max(0, Math.trunc(Number(ap) || 0));
  if (value === 0) return "a free action (0 AP)";
  if (value % AP_PER_MINUTE === 0) {
    const minutes = value / AP_PER_MINUTE;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (value % AP_PER_ROUND === 0) {
    const rounds = value / AP_PER_ROUND;
    return `${rounds} round${rounds === 1 ? "" : "s"} (${value} AP)`;
  }
  return `${value} AP`;
}

/** The armour categories this rule knows, normalised. */
export function armourCategory(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(DONNING_TIMES, key) ? key : "";
}

/**
 * How long this armour takes to don, in AP.
 *
 * @param {string} category light | medium | heavy
 * @param {object} options
 * @param {boolean} options.fullSuit "a full suit of armour" — doubled.
 * @returns {{ap: number, label: string, category: string, fullSuit: boolean}|null}
 *   null for a category the rule does not print, which is a question
 *   rather than a default: an armour with no category is one this system
 *   already fails open on (see proficiency-rules.mjs), and guessing at
 *   ten minutes would be worse than saying nothing.
 */
export function donningTime(category, { fullSuit = false } = {}) {
  const key = armourCategory(category);
  if (!key) return null;
  const base = timeToAP(DONNING_TIMES[key]);
  const ap = base * (fullSuit ? FULL_SUIT_MULTIPLIER : 1);
  // `doubled` SAYS WHETHER `ap` INCLUDES THE FULL-SUIT DOUBLING, which is
  // not the same question as `fullSuit` once a rune replaces the time —
  // the sheet reads this to say which of the two the player is looking at.
  return { ap, label: describeAP(ap), category: key, fullSuit: Boolean(fullSuit), doubled: Boolean(fullSuit) };
}

/*
 * `removalTime` stood here and nothing ever called it. Deleted at
 * 3.369.0 with its one fact kept, because the fact is the part that
 * mattered: CHAPTER 6 PRINTS NO TIME FOR REMOVING ARMOUR. It gives
 * donning times only. Quick Donning prints removal times on its better
 * degrees (2 rounds, 5 rounds), which implies a base — but implying is
 * not printing. Anyone reaching for a removal figure by halving the
 * donning time or borrowing Quick Donning's success line is inventing
 * one, and an invented figure is indistinguishable from a printed one
 * once it is on a card.
 */
