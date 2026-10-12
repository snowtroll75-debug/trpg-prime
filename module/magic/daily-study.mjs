/**
 * WHAT EACH TRADITION PAYS FOR ITS DAILY SPELLS (page 235) — the rules,
 * pure.
 *
 * NEW at 3.583.0, for the pages 231-240 audit's D11 and Graham's R11 of
 * 22 September 2026, whose answer was "this should already be
 * implemented".
 *
 * ─────────────────────────────────────────────────────────────────────
 * HE IS MOSTLY RIGHT, AND THE PART HE IS RIGHT ABOUT IS THE HARD PART.
 * Said plainly, because my own audit line — "none of the four is
 * modelled" — was too broad and I would rather correct it than quietly
 * build around it:
 *
 *   ALREADY THERE, and correct: the Learned/Instinctive distinction;
 *   Spell Libraries, including "only a caster with a Spell Library can
 *   grow it this way"; the daily memorisation pool, filtered by
 *   tradition and held to the castable PP cap; and the cast gate that
 *   refuses a learned caster's unmemorised spell. That is the machinery
 *   page 235 is about, and it works.
 *
 *   NOT THERE: the TIME each tradition pays, and the consequence of not
 *   paying it. The page prices them differently on purpose — thirty
 *   minutes with a book, an hour of prayer, an hour of communion — and
 *   nothing asked for any of it. The consequence was a printed line
 *   reading "Reminder (GM judgement, not tracked)".
 *
 * So this file is the missing half, not a second copy of the working
 * one. It decides what a tradition owes and whether it has been paid;
 * memorisation keeps deciding everything else.
 *
 * WHY THE HOUR IS NOT THE SAME HOUR. Divinity "may select any available
 * to them each day by spending an hour in prayer"; Verdant "must spend
 * an hour in quiet communion with nature as appropriate to their
 * beliefs". Identical durations, different fictions, and a card that
 * said "an hour of preparation" to both would be the kind of flattening
 * this ruleset keeps its flavour out of.
 *
 * Pure; no Foundry.
 */

/** Minutes each tradition's daily preparation costs (page 235). */
export const DAILY_STUDY_MINUTES = Object.freeze({
  arcane: 30,
  ethereal: 30,
  divinity: 60,
  verdant: 60
});

/*
 * THE STYLES THAT OWE — the memorisation module's own vocabulary.
 *
 * CORRECTED AT 3.583.1 (F2 of the 3.583.0 live drive). This tested
 * `style !== "instinctive"`, and "instinctive" is a word THIS FILE
 * invented: `memorisationContext` answers only "book", "list", or NULL
 * for a caster who keeps no library. So a Bard handed the context's own
 * value fell through to "learned", was charged thirty minutes, and would
 * then have been refused everything but cantrips for not spending them.
 *
 * It looked right in every test because the one call site wrote
 * `memorisationContext(actor)?.style ?? "instinctive"` — a rule that is
 * wrong and a caller quietly patching it, which is the arrangement that
 * breaks the moment a second caller appears.
 *
 * Naming what DOES owe, rather than what does not, also fails safe: a
 * style nobody has thought of yet owes nothing, instead of owing an hour
 * and locking a character out of their spells.
 */
const LEARNED_STYLES = Object.freeze(["book", "list"]);

/** What the character is actually doing for those minutes. */
export const DAILY_STUDY_LABEL = Object.freeze({
  arcane: "studying your Spell Book",
  ethereal: "reading the Spell Library tattooed on your body",
  divinity: "in prayer",
  verdant: "in quiet communion with nature"
});

/**
 * What this caster owes today.
 *
 * AN INSTINCTIVE CASTER OWES NOTHING, and the page says why: "you have
 * access to a much smaller collection of spells but have no need to
 * study or maintain a Spell Library." Charging them thirty minutes for a
 * library they do not have would be a rule the book never wrote.
 *
 * @param {object} state
 * @param {string} state.tradition
 * @param {string} state.style "book" | "list" | "instinctive" | ""
 * @returns {{owed: boolean, minutes: number, doing: string, tradition: string}}
 */
export function dailyStudyRequired({ tradition = "", style = "" } = {}) {
  const key = String(tradition ?? "").trim().toLowerCase();
  const learned = LEARNED_STYLES.includes(String(style ?? "").trim().toLowerCase());
  const minutes = DAILY_STUDY_MINUTES[key] ?? 0;
  if (!learned || !minutes) return { owed: false, minutes: 0, doing: "", tradition: key };
  return { owed: true, minutes, doing: DAILY_STUDY_LABEL[key] ?? "preparing", tradition: key };
}

/**
 * What a learned caster who did not study may cast today.
 *
 * > "If a learned caster is unable to study their Spell Library, they can
 * >  only cast cantrips that day."
 *
 * @param {object} state
 * @param {boolean} state.owed did this caster owe a study today?
 * @param {boolean} state.studied did they pay it?
 * @returns {{cantripsOnly: boolean, reason: string}}
 */
export function castingLimitToday({ owed = false, studied = false } = {}) {
  if (!owed || studied) return { cantripsOnly: false, reason: "" };
  return {
    cantripsOnly: true,
    reason: "you have not studied your Spell Library today — page 235: cantrips only"
  };
}

/** The line the daily-preparation card prints about the time paid. */
export function dailyStudyLine(required, studied) {
  if (!required.owed) {
    return "<em>No daily study — an Instinctive caster keeps no Spell Library.</em>";
  }
  return studied
    ? `<strong>${required.minutes} minutes ${required.doing}</strong> — your spells are available today.`
    : `<strong>${required.minutes} minutes ${required.doing}</strong> was not spent — `
      + "<strong>cantrips only today</strong> (page 235).";
}
