/**
 * A SUSTAIN THAT BUYS SOMETHING OTHER THAN TIME, for a spell that has no
 * area to hang it on.
 *
 * NEW at 3.586.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FIELD EXISTED AND NOTHING COULD REACH IT — including the spell it
 * was authored for last week.
 *
 * `sustainChoices` was added at 3.435.0 for Luminance, whose Sustain
 * buys "+1d8 healing (max 5d8) OR remove 1 more bleed". Two things about
 * how it was wired were invisible until a second spell wanted it:
 *
 *   1. IT IS RECORDED ONLY INSIDE THE EMANATION BRANCH of `castSpell`.
 *      A spell with no area never gets an emanation record, so its
 *      declared choices are never written down anywhere.
 *
 *   2. THE PICKER IGNORES THE DECLARED CHOICES ENTIRELY. It reads
 *      `entry.emanation.sustainChoices` to decide WHETHER to ask, and
 *      then builds its rows from `luminanceSustainOptions(state)` —
 *      Luminance's growing dice and its bleed counter. A second spell
 *      declaring two choices of its own would have been offered
 *      Luminance's two.
 *
 * ACID ARROW, AUTHORED LAST BLOCK, HIT BOTH. It has no area, so its
 * choice was never recorded; and had it been, the picker would have
 * offered a healing die. "At the beginning of each turn you may Sustain
 * the Spell to launch an additional arrow of acid" was decoration on the
 * pack entry and nothing else — the exact shape this project keeps
 * finding, a right thing quietly not appearing, and one I shipped myself
 * seven days ago while writing a check that never asked whether the
 * field could be read back.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SO THE DECLARED LIST BECOMES THE SOURCE OF TRUTH, and Luminance keeps
 * its own picker.
 *
 * Luminance's options are not a list of choices, they are a FUNCTION of
 * state — "+1d8 (max 5d8)" has to know how many dice this casting has
 * already grown, and must grey out the option once it is capped. Nothing
 * in a pack row can say that. So the two are left as two: an entry
 * carrying `luminance` state keeps the picker built for it, and every
 * other entry that declares choices gets the plain one below, which
 * offers exactly what the spell wrote down.
 *
 * READ FROM EITHER PLACE, for the same reason: Luminance's list lives on
 * the emanation record and Blink's lives on the entry, and a reader that
 * knew only one of them would be the next thing to go quietly missing.
 */

const text = (v) => String(v ?? "").trim();

/**
 * The choices this active-spell entry offers, normalised — an empty list
 * when it offers none.
 *
 * A ROW WITHOUT A KEY IS DROPPED. The key is what comes back from the
 * picker and what `sustainChoiceByKey` matches on; a row that cannot be
 * identified could be chosen and then not found, which is a Sustain that
 * spends an action and reports nothing.
 *
 * @param {object} entry an active-spell entry
 * @returns {Array<{key:string, label:string, note:string}>}
 */
export function declaredSustainChoices(entry) {
  const raw = Array.isArray(entry?.sustainChoices) && entry.sustainChoices.length
    ? entry.sustainChoices
    : (Array.isArray(entry?.emanation?.sustainChoices) ? entry.emanation.sustainChoices : []);
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const key = text(row?.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: text(row?.label) || key, note: text(row?.note) });
  }
  return out;
}

/**
 * Does this entry want the PLAIN picker?
 *
 * NAMED POSITIVELY AND ASKED IN ONE PLACE, so the two pickers cannot
 * both answer for the same entry. `luminance` is the state Luminance's
 * own picker needs and the only thing that writes it, so its presence is
 * the honest test for "this is the spell that has its own".
 */
export function offersPlainSustainChoice(entry) {
  if (entry?.luminance) return false;
  return declaredSustainChoices(entry).length > 0;
}

/**
 * The chosen row, or null when the key names nothing.
 *
 * NULL RATHER THAN THE FIRST ROW. A picker returning a key nobody
 * declared means the two have drifted apart, and quietly substituting a
 * different choice would hide that — the caster would pay an action and
 * get something they did not pick.
 */
export function sustainChoiceByKey(entry, key) {
  const wanted = text(key);
  if (!wanted) return null;
  return declaredSustainChoices(entry).find((c) => c.key === wanted) ?? null;
}

/**
 * What the card says this Sustain bought — the clause that follows
 * "<caster> sustains <spell> — ".
 *
 * THE SPELL'S OWN WORDS, from the row, which is why `note` is preferred
 * over `label`: the label is written to fit a radio button ("Vanish and
 * reappear 10 feet away") and the note is written to be read afterwards
 * ("vanishes and reappears 10 feet away in a random direction; the
 * movement triggers no reactions"). Paraphrasing either here is what
 * would introduce the error — the same reasoning `addPendingModifier`
 * records for showing an outcome's scope verbatim.
 *
 * NO TRAILING STOP. The caller punctuates, because it also punctuates
 * the two sentences this one stands in for.
 */
export function sustainChoiceLine(choice) {
  if (!choice) return "";
  return String(choice.note || choice.label || "").replace(/\.$/, "");
}
