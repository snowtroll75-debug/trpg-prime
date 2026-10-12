/**
 * READING A MODIFIER OUT OF A SKILL ACTION'S OUTCOME TEXT.
 *
 * That is all this module does. It exports `extractModifier`, and
 * re-exports `extractDurationRounds` from magic/effect-duration.mjs so
 * its one caller is undisturbed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT USED TO BE HERE, AND WHY IT IS NOT (3.565.0).
 *
 * This file opened with twenty-five lines describing a CONDITION
 * extractor: stricter than the critical-table parser, applying a
 * condition only where a verb actually confers it, recording whether it
 * lands on self or target, and reporting GM-discretion cases instead of
 * resolving them. Nine constants and three functions implemented it —
 * APPLY_VERB, ADJECTIVAL_FOLLOWERS, GM_DISCRETION, CONDITIONAL,
 * ADJUSTS_EXISTING, NON_CREATURE_SUBJECT, LABEL_ALIASES, spellings(),
 * subjectFor(), clausesOf().
 *
 * Every one of them appeared EXACTLY ONCE in the entire tree: its own
 * declaration. Nothing was exported, nothing was called, and the
 * extractor the header was about had never run. Found in the Chapter 4
 * audit of pages 91–100 (D16), while working out why Hide applied no
 * condition when Sneak beside it did.
 *
 * IT WAS REMOVED RATHER THAN WIRED, and that is the decision worth
 * recording. Conditions conferred by a skill action are DECLARED, in
 * combat/basic-action-conditions.mjs — one entry per action, each with
 * the sentence it comes from and, in several cases, a note about a
 * reading that looked right and was not. Turning a parser loose
 * alongside that table would be two answers to one question, and the
 * first time they disagreed the declared one would be the one nobody
 * suspected. This project has named that failure often enough to
 * recognise it: "two modules answering one question, with the better
 * answer living in the one that did not claim the job."
 *
 * The dead code was also invisible to `verify-rules-have-callers`,
 * which ratchets uncalled EXPORTS. These were module-local, so nothing
 * in the harness could see them — which is the more useful half of this
 * note, because it is still true of every other module here.
 */

/**
 * A circumstance bonus or penalty an outcome grants, with the wording
 * that scopes it kept intact.
 *
 * The rulebook never states one of these unscoped: it is always to a
 * particular kind of check, against a particular creature, or for a
 * particular span. That scope is the part a person has to judge, so it is
 * carried through verbatim rather than interpreted.
 *
 * @param {string} text
 * @returns {{value: number, type: string, scope: string, subject: string,
 *   oneShot: boolean}|null}
 */
export function extractModifier(text) {
  const source = String(text ?? "");
  const match = /([+-]\s*\d+)\s+(circumstance|status|item)\s+(bonus|penalty)\b([^.]*)/i.exec(source);
  if (!match) return null;

  const magnitude = Math.abs(Math.trunc(Number(match[1].replace(/\s+/g, "")))) || 0;
  if (!magnitude) return null;

  // "a -2 circumstance penalty" is already signed in the text, but "take
  // a -2 penalty" and "suffers a 2 penalty" both occur, so the word wins
  // over the sign when they disagree.
  const penalty = /penalty/i.test(match[3]);
  const value = penalty ? -magnitude : magnitude;

  const tail = String(match[4] ?? "").trim().replace(/\s+/g, " ");

  // Who gets it is decided by what stands *before* the number, never
  // after: "you take a -4 penalty on future checks against the target"
  // is about you, and reading the whole sentence gave the target.
  const sentenceStart = Math.max(
    0,
    source.lastIndexOf(".", match.index) + 1,
    source.lastIndexOf(":", match.index) + 1
  );
  const before = source.slice(sentenceStart, match.index);

  // "all their attacks gain a +4", "its next saving throw" — a possessive
  // right before the modifier names the holder more precisely than the
  // sentence's grammatical subject does.
  const possessive = /\b(?:their|its)\b[^.]{0,40}$/i.test(before);

  let subject = "self";
  if (possessive) subject = "target";
  else {
    let last = -1;
    let isTarget = false;
    const rx = /\b(you|target|creature|they|them)\b/gi;
    let found;
    while ((found = rx.exec(before))) {
      last = found.index;
      isTarget = found[1].toLowerCase() !== "you";
    }
    subject = last === -1 ? "self" : isTarget ? "target" : "self";
  }

  return {
    value,
    type: match[2].toLowerCase(),
    scope: tail,
    subject,
    // "its next saving throw" is spent once; "future checks" and spans of
    // time are not.
    oneShot: /\bnext\b/i.test(tail) || /\bnext\b/i.test(before)
  };
}

/**
 * How long an outcome says its effect lasts, in rounds.
 *
 * MOVED TO magic/effect-duration.mjs AT 3.414.0, re-exported here so this
 * module's caller is undisturbed.
 *
 * WHY IT MOVED. `effect-duration.mjs` opens by declaring itself the one
 * pure place where "how long does this last" is answered — and it could
 * not read the two commonest duration phrases in the rulebook, "until
 * the end of your current turn" and "until the end of your next turn",
 * while this function two directories away had read them correctly the
 * whole time. Two modules answering one question, with the better answer
 * living in the one that did not claim the job.
 *
 * Surfaced wiring Touch Of Obedience, whose printed ladder uses both
 * phrases. `parseSpellDuration` returned null for them; null means "no
 * timing", which `unreadableEffectDurations` correctly refuses to ship.
 * The spell could not be written until the two agreed.
 */
export { extractDurationRounds } from "./magic/effect-duration.mjs";
