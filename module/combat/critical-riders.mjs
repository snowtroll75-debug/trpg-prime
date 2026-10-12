/**
 * The critical tables' own riders (Chapter 7, pages 206–219) — the
 * rules, pure.
 *
 * NEW at 3.580.0, for the block-20 audit's D15 and Graham's R15 of
 * 21 September 2026: "All".
 *
 * WHAT WAS WRONG. Six rows tell the table to do something, and the
 * system printed the sentence and did none of it. Nothing was lost — the
 * text is on the card — but every one of them is a button the system
 * knows how to make, and a GM reading a paragraph aloud in the middle of
 * a fight is exactly what the rest of this chapter is automated to
 * avoid.
 *
 * READ FROM THE ROW'S OWN TEXT, not from a hand-written list of row
 * numbers. The tables are generated data, regenerated whenever the book
 * changes; a list of numbers beside them would be a second copy of the
 * book, free to fall out of step with the first. These patterns are
 * written against the sentences the book actually uses, and a row the
 * book rewords stops matching rather than matching the wrong thing.
 *
 * THE SIX, as the audit found them:
 *
 *   Bludgeoning 67-68  "if target has no armour use '69' result instead"
 *   Acid 31-32         "must make a Reflex save to avoid dropping item"
 *   Acid 67-68         "All adjacent characters must make a Fortitude
 *                       save or be Sickened 1"
 *   Acid 70            "Armoured: 2 AP to remove helm and avoid Injured"
 *   Slashing 69        "You may make a free attack with your current MAP"
 *   Piercing 50 /      "must make a DC 5 flat check to cast verbal
 *   Slashing 90         spells until the bleeding stops" / "DC 25"
 */

/**
 * "if target has no armour use '69' result instead".
 *
 * NOT A CHOICE — the row is telling the reader which row to read, so it
 * is applied rather than offered. Answers the alternate result, or null.
 *
 * @param {string} text the row's effect
 * @returns {number|null}
 */
export function alternateResultWhenUnarmoured(text) {
  const match = String(text ?? "").match(
    /if\s+target\s+has\s+no\s+armou?r\s+use\s+'?(\d{1,3})'?\s+result\s+instead/i);
  if (!match) return null;
  const value = Math.trunc(Number(match[1]) || 0);
  return value >= 1 && value <= 100 ? value : null;
}

/**
 * A save the row asks for, and who makes it.
 *
 * "Target must make a Reflex save to avoid dropping item" is the target's
 * own; "All adjacent characters must make a Fortitude save or be
 * Sickened 1" is everyone else's. The two shapes are told apart by
 * whether the sentence names adjacency, which is the only thing that
 * distinguishes them in the book either.
 *
 * NO DC IS PRINTED ON EITHER, so both use the Injury DC — the DC page
 * 203 already gives for "some effects of a critical [that] may require
 * the target to make a Saving Throw to avoid a more serious effect",
 * which is what these are.
 *
 * @param {string} text
 * @returns {{save: string, scope: string, avoids: string}|null}
 */
export function saveRider(text) {
  const str = String(text ?? "");
  const match = str.match(
    /\b(?:must\s+(?:also\s+)?make|must\s+attempt)\s+an?\s+(Reflex|Fortitude|Will)\s+save\b([^.]*)/i);
  if (!match) return null;
  let tail = String(match[2] ?? "").trim();
  const adjacent = /\badjacent\b/i.test(str.slice(0, match.index + 1));

  /*
   * THE SAVE CAN COST ACTION POINTS (3.581.0; the pages 211-220 audit's
   * D8, Graham's R8 of 21 September 2026).
   *
   * Cold 51: "Recurring 3 & must make a Fortitude Save (1 AP) to break
   * the ice." The parenthesis is the PRICE of attempting the save, and
   * it was swept into the description of what the save avoids, so the
   * card read
   *
   *     "Fortitude save to avoid (1 AP) to break the ice"
   *
   * — which is not a sentence — and nothing charged the AP. Lifted out
   * first, before the clause is read, so what remains is the clause.
   */
  const cost = tail.match(/\((\d+)\s*AP\)/i);
  const ap = cost ? Math.max(0, Math.trunc(Number(cost[1]) || 0)) : 0;
  if (cost) tail = (tail.slice(0, cost.index) + tail.slice(cost.index + cost[0].length)).replace(/\s+/g, " ").trim();

  // THE ROW GOES ON AFTER THE SAVE. "must make a Reflex save to avoid
  // dropping item and is Injured 1" — the Injured is not avoided by the
  // save, it is the next thing the row does, so the clause is cut at the
  // "and" that starts it rather than quoted whole into a card line that
  // would promise the wrong escape.
  const clause = tail.replace(/\s+and\s+(is\s+|takes\s+)?[A-Z].*$/, "").trim();

  /*
   * "TO AVOID X" AND "TO X" ARE OPPOSITE SENTENCES. A save that avoids
   * dropping an item is a save against something; a save to break the
   * ice is a save FOR something. Both were printed as "to avoid …", so
   * Cold 51 told the player they were saving to avoid breaking free.
   */
  const avoiding = clause.match(/^(?:to\s+avoid\s+|or\s+be\s+)(.*)$/i);
  const achieving = avoiding ? null : clause.match(/^to\s+(.*)$/i);

  return {
    save: match[1].toLowerCase(),
    scope: adjacent ? "adjacent" : "target",
    ap,
    avoids: avoiding ? avoiding[1].trim() : "",
    achieves: achieving ? achieving[1].trim() : ""
  };
}

/**
 * A way out of the row, bought each round with AP and a flat check.
 *
 * Cold 90: "Target is suffocating and may spend 3 AP each round trying
 * to remove the Ice. This is a DC 15 flat check."
 *
 * TWO SENTENCES, which is why this is its own rider rather than a wider
 * `flatCheckRider`. That one matches "DC N flat check TO <do a thing>";
 * here the check is named in a sentence of its own and the thing it
 * achieves is in the previous one, so a pattern built for the first
 * shape finds nothing in the second.
 *
 * THE SUFFOCATION HALF ALREADY WORKED — the condition lands and starts
 * page 202's save ladder. It was the way out that was printed and never
 * offered, on a row that kills whoever cannot find it.
 *
 * @param {string} text
 * @returns {{ap: number, action: string, dc: number}|null}
 */
export function apFlatCheckEscape(text) {
  const str = String(text ?? "");
  const spend = str.match(/\b(?:may\s+)?spend\s+(\d+)\s*AP\s+each\s+round\s+(?:trying\s+)?to\s+([^.]+)/i);
  if (!spend) return null;
  const dc = str.slice(spend.index).match(/\bDC\s+(\d+)\s+flat\s+check\b/i);
  if (!dc) return null;
  return {
    ap: Math.max(1, Math.trunc(Number(spend[1]) || 1)),
    action: spend[2].trim().replace(/\s+$/, ""),
    dc: Math.max(1, Math.trunc(Number(dc[1]) || 1))
  };
}

/**
 * A check the row asks for whenever the target spends action points.
 *
 * Sonic 90: "Each time the target spends more than 1 AP in a round they
 * must make a DC 5 flat check or fall unconscious for 1 minute."
 *
 * PER SPEND, NOT PER ROUND TOTAL. "Each time the target spends more than
 * 1 AP" reads as each expenditure above the threshold — a reading, and
 * Graham has been told it is one. The alternative (a running total
 * crossing the threshold once) would ask for the check once per round at
 * most, which makes "each time" do no work.
 *
 * @param {string} text
 * @returns {{threshold: number, dc: number}|null}
 */
export function apSpendWatch(text) {
  const match = String(text ?? "").match(
    /\beach\s+time\s+the\s+target\s+spends\s+more\s+than\s+(\d+)\s*AP\s+in\s+a\s+round\b[^.]*?\bDC\s+(\d+)\s+flat\s+check\b/i);
  if (!match) return null;
  return {
    threshold: Math.max(0, Math.trunc(Number(match[1]) || 0)),
    dc: Math.max(1, Math.trunc(Number(match[2]) || 1))
  };
}

/**
 * Power Points the row takes away.
 *
 * Aligned 19: "Internal pain is harsh but subsides quickly. Drained of 2
 * PP." Printed on the card, deducted from nobody.
 *
 * NOT THE SOUL DRAIN CONDITION, which the word "Drained" is also this
 * book's loose name for (see LABEL_ALIASES in effect-parser.mjs). That
 * alias only matches "Drained" beside a bare number, and this row puts
 * "of" between them, so the two readings cannot collide — checked
 * against the extractor rather than assumed.
 *
 * @param {string} text
 * @returns {number} PP to deduct, 0 for none.
 */
export function powerPointDrain(text) {
  const match = String(text ?? "").match(/\bdrained\s+of\s+(\d+)\s*PP\b/i);
  return match ? Math.max(0, Math.trunc(Number(match[1]) || 0)) : 0;
}

/**
 * Something the target can no longer do.
 *
 * Force 96: "Target Injured 3, Fatigued 2, and cannot cast spells for
 * (D)." Aligned 57: "Target cannot use verbal components until the end
 * of their next turn." Slashing 70: "cannot speak until the bleeding
 * ends."
 *
 * TWO SCOPES, because the system has two gates to honour them with: a
 * total block on casting, and a block on the verbal component alone
 * (which the casting path already asks about, for the breath rules on
 * page 202). "Cannot use the hand" and the other bodily ones are left as
 * printed text — there is no somatic gate to hang them on, and inventing
 * one to hold a single row would be worse than saying so.
 *
 * THE PERSISTENCE CODE IN THE PARENTHESIS IS A DURATION. "for (D)" on a
 * row whose own column reads Fatal is the book scoping a duration to one
 * clause, which is the same thing the text durations do and is read the
 * same way.
 *
 * @param {string} text
 * @returns {{scope: string, index: number, persistence: string|null}|null}
 */
export function castingLockout(text) {
  const str = String(text ?? "");
  const spells = str.match(/\bcannot\s+cast\s+spells?\b/i);
  if (spells) {
    const scoped = str.slice(spells.index).match(/^\s*cannot\s+cast\s+spells?\s+for\s+\(?([A-Z]{1,2})\)?/i);
    return { scope: "spells", index: spells.index, persistence: scoped ? scoped[1].toUpperCase() : null };
  }
  const verbal = str.match(/\bcannot\s+(?:use\s+verbal\s+components|speak)\b/i);
  if (verbal) return { scope: "verbal", index: verbal.index, persistence: null };
  return null;
}

/**
 * A Spell Concentration success the row demands before the target's next
 * spell.
 *
 * Force 39: "Target is Stunned 1 and Spellcasting requires a Spell
 * Concentration success next round."
 *
 * @param {string} text
 * @returns {{rounds: number}|null}
 */
export function concentrationRequirement(text) {
  const match = String(text ?? "").match(
    /\bspell\s*casting\s+requires\s+a\s+Spell\s+Concentration\s+success\s+(?:(next|this)\s+round)?/i);
  if (!match) return null;
  return { rounds: 1 };
}

/**
 * A flat check the row imposes until something ends.
 *
 * "must make a DC 5 flat check to cast verbal spells until the bleeding
 * stops" (Piercing 50), "DC 25 flat check to cast verbal spells"
 * (Slashing 90).
 *
 * @param {string} text
 * @returns {{dc: number, what: string, until: string}|null}
 */
export function flatCheckRider(text) {
  const str = String(text ?? "");
  const match = str.match(/DC\s+(\d{1,2})\s+flat\s+check\s+to\s+([^.]+)/i);
  if (!match) return null;
  const rest = String(match[2] ?? "").trim();
  const untilMatch = rest.match(/\buntil\s+(.+)$/i);
  const what = (untilMatch ? rest.slice(0, untilMatch.index) : rest)
    // Slashing 90 ends mid-sentence in the book — "and Injured 2 until." —
    // so the same cut the save rider makes is made here.
    .replace(/\s+and\s+(is\s+|takes\s+)?[A-Z].*$/, "")
    .trim()
    .replace(/\s+(and|until)$/i, "");
  return {
    dc: Math.trunc(Number(match[1]) || 0),
    what,
    until: untilMatch ? untilMatch[1].trim() : ""
  };
}

/**
 * "You may make a free attack with your current MAP against an adjacent
 * target, or against the current one if none are available."
 *
 * WITH YOUR CURRENT MAP, which is the whole point of the sentence: it is
 * free of the action cost, not of the penalty. The counter is not
 * advanced by offering it — the attack the player then makes advances it
 * the way any attack does.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function freeAttackRider(text) {
  return /\bfree\s+attack\s+with\s+your\s+current\s+MAP\b/i.test(String(text ?? ""));
}

/**
 * "2 AP to remove helm and avoid Injured" — an armour clause offering a
 * way out at a price.
 *
 * @param {string} text an armour clause's text
 * @returns {{ap: number, avoids: string, action: string}|null}
 */
export function apEscapeRider(text) {
  const match = String(text ?? "").match(
    /(\d+)\s*AP\s+to\s+([^.]*?)\s+and\s+avoid\s+([A-Za-z]+)/i);
  if (!match) return null;
  return {
    ap: Math.max(1, Math.trunc(Number(match[1]) || 1)),
    action: match[2].trim(),
    avoids: match[3].trim().toLowerCase()
  };
}

/**
 * Everything a row asks for, in one call.
 *
 * @param {object} row a critical table row
 * @param {string} [clauseText] the armour clause this target qualified
 *   for, whose own text can carry a rider of its own
 * @returns {{alternateResult: number|null, save: object|null,
 *   flatCheck: object|null, freeAttack: boolean, apEscape: object|null}}
 */
export function criticalRowRiders(row, clauseText = "") {
  const effect = String(row?.effect ?? "");
  return {
    alternateResult: alternateResultWhenUnarmoured(effect),
    save: saveRider(effect),
    flatCheck: flatCheckRider(effect),
    freeAttack: freeAttackRider(effect),
    apEscape: apEscapeRider(clauseText),
    // NEW at 3.581.0 — the pages 211-220 audit's D4 to D9.
    escape: apFlatCheckEscape(effect),
    apWatch: apSpendWatch(effect),
    ppDrain: powerPointDrain(effect),
    lockout: castingLockout(effect),
    concentration: concentrationRequirement(effect)
  };
}

/**
 * RECURRING DAMAGE FROM A CRITICAL IS THE TABLE'S OWN TYPE (3.609.0).
 *
 * Graham, 1 October 2026, on the 3.608.3 live test: "please amend the
 * damage". An Electricity 50 against plate applied "Recurring Damage 3
 * (Fire)". The table row says "Recurring 2" and nothing else, the tag
 * carried no type, and the condition manager gives an untyped Recurring
 * Damage FIRE (its ruling for a source that names none). Measured: 65 rows
 * on nine non-fire tables — acid 16, cold 10, electricity 9, essence 9,
 * poison 7, sonic 5, aligned 4, mental 4, force 1 — so an acid critical's
 * burn was halved by fire resistance and ignored by fire immunity.
 *
 * THE TABLE THE ROW CAME FROM is the type, because that is what the row
 * is a consequence of: a burn from the Acid table is acid. A tag that
 * already names a type keeps it, so nothing a row states is overruled,
 * and a table that is not a damage type (none today) leaves the tag alone
 * rather than inventing one.
 *
 * @param {Array<object>} tags resolved condition tags
 * @param {string} tableType the key of the table that was read
 * @param {object} damageTypes the system's damage-type table (passed in;
 *   this file stays free of config)
 */
export function typeRecurringTags(tags, tableType, damageTypes = {}) {
  const type = String(tableType ?? "").trim().toLowerCase();
  if (!type || !Object.prototype.hasOwnProperty.call(damageTypes ?? {}, type)) return tags;
  return (Array.isArray(tags) ? tags : []).map((tag) =>
    tag?.key === "recurring" && !tag.damageType ? { ...tag, damageType: type } : tag);
}
