/**
 * ANTIMAGIC — magic that is switched off rather than taken away.
 *
 * NEW at 3.586.0 (R6, page 252). Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE WHOLE SPELL IS ITS SECOND SENTENCE.
 *
 *   "An invisible field surrounds you, suppressing all magic within,
 *    including yours. AT THE END OF THE SPELL'S DURATION, ALL MAGIC
 *    CONTINUES TO FUNCTION AS BEFORE."
 *
 * The audit asked which reading was meant — does it end spells already
 * running, block new casting, or both? — and the closing sentence
 * answers it outright: NOTHING IS ENDED. What is inside stops working
 * and starts working again, unchanged, when the field drops. A Bless
 * that had four rounds left has four rounds left.
 *
 * SO THE PRIMITIVE IS `disabled`, NOT DELETION. Foundry already has
 * exactly this idea — an ActiveEffect that is present, visible on the
 * sheet, and contributing nothing — and it is reversible by setting one
 * boolean back. Every other candidate was worse in the same way:
 * deleting and re-creating loses the effect's remaining duration, its
 * origin and anything a workflow had written onto it, which is precisely
 * the "as before" the page promises.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT RIDES THE EMANATION RAILS, because it is an emanation: a 5-foot
 * circle that moves with the caster and whose membership changes as
 * people walk. `emanation-workflow.mjs` already answers "who is inside
 * this circle right now" on every movement, and already calls one
 * function when somebody enters and another when they leave. Those two
 * moments are the only ones antimagic needs, so it needs no clock, no
 * hook and no sweep of its own.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS SUPPRESSED, AND WHY THAT LIST AND NOT ANOTHER.
 *
 * Every effect flagged `spellBuff` — the marker this system puts on
 * anything a spell placed. That is a narrower claim than "all magic",
 * and the boundary was MEASURED in Graham's world rather than assumed:
 *
 *   A CONDITION IS NOT SUPPRESSED. `applyConditionTags` does not set
 *     `spellBuff`; conditions are status effects with their own expiry
 *     machinery, and `disabled` is not how one is lifted. That is also
 *     the right reading: a blindness a spell already inflicted is a
 *     state the creature is IN, not magic being sustained on it, and
 *     Blindness's own Fumble rung is permanent whatever happens next.
 *   A CREATURE'S INNATE MAGIC IS NOT AN ActiveEffect AT ALL, so there
 *     is nothing here to switch off.
 *   AN ITEM'S ENCHANTMENT is a field on the item.
 *
 * All three stay the GM's, and the card names all three rather than
 * leaving a table to discover the boundary mid-fight.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `disabled` WAS DRIVEN BEFORE THIS WAS BUILT ON IT, in Graham's world
 * on 23 September 2026, because the whole design rests on it: a +5 to
 * attack read 0 -> 5 on creation, 0 with `disabled: true` WITH THE
 * EFFECT STILL PRESENT on the sheet, 5 again on `disabled: false`, and
 * 0 after deletion. Suppressed, not ended, and reversible — measured,
 * not believed.
 *
 * THREE EXCLUSIONS, EACH FOR ITS OWN REASON:
 *
 *   THE FIELD'S OWN MARKER. It is a `spellBuff` like any other, and a
 *     field that suppressed itself would be off in the instant it came
 *     on. Excluded by castId rather than by name, because two casters
 *     may both be standing in fields.
 *
 *   ANOTHER ANTIMAGIC FIELD'S MARKER, for the same reason one step out:
 *     two overlapping fields that switched each other off would leave
 *     both running and neither suppressing.
 *
 *   ANYTHING ALREADY DISABLED. Not because it would break — setting
 *     `disabled` twice is harmless — but because the RESTORE is driven
 *     by this list. An effect a GM had turned off by hand, swept up
 *     here, would be switched back ON when the field dropped. The field
 *     restores what it suppressed, and nothing else.
 */

/** The flag an antimagic marker carries, under the system's namespace. */
export const ANTIMAGIC_FLAG = "antimagic";

const text = (v) => String(v ?? "").trim();

/**
 * An antimagic row, or null when it is not one.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {{label: string}|null}
 */
export function normaliseAntimagic(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind).toLowerCase() !== "antimagic") return null;
  return { label: text(raw.label) || "Antimagic Field" };
}

/**
 * The ids of the effects this field should switch off on one creature.
 *
 * TAKES PLAIN OBJECTS, not Foundry documents, so the rule can be driven
 * without a world — `{id, disabled, flags}` is the whole shape it reads.
 *
 * @param {Array} effects the creature's effects
 * @param {string} castId this field's casting id
 * @param {string} systemId the flag namespace
 * @returns {string[]}
 */
export function suppressibleEffectIds(effects, castId, systemId = "trg-prime") {
  const out = [];
  for (const effect of Array.isArray(effects) ? effects : []) {
    const flags = effect?.flags?.[systemId] ?? {};
    if (!flags.spellBuff) continue;
    // ALREADY OFF STAYS OFF — and, more to the point, stays OFF when the
    // field drops. See the header: this list is also the restore list.
    if (effect?.disabled) continue;
    // Its own field, or another one.
    if (flags[ANTIMAGIC_FLAG]) continue;
    if (castId && flags.castId === castId) continue;
    const id = text(effect?.id ?? effect?._id);
    if (id) out.push(id);
  }
  return out;
}

/**
 * The ids a marker recorded, so they can be switched back on.
 *
 * READ BACK FROM THE MARKER RATHER THAN RECOMPUTED. Recomputing at
 * removal time would ask "what is suppressible now", and the answer has
 * changed: everything this field switched off is now `disabled`, so the
 * exclusion above would return an empty list and nothing would ever come
 * back. The list has to be the one that was written down.
 */
export function suppressedEffectIds(marker, systemId = "trg-prime") {
  const recorded = marker?.flags?.[systemId]?.[ANTIMAGIC_FLAG]?.suppressed;
  return Array.isArray(recorded) ? recorded.map(text).filter(Boolean) : [];
}

/** What the card says when the field closes over somebody. */
export function antimagicLine(name, count) {
  return count > 0
    ? `<strong>${name}</strong>: ${count} magical effect${count === 1 ? " is" : "s are"} `
      + `<strong>suppressed</strong> while inside the field — not ended.`
    : `<strong>${name}</strong>: inside the field. No magical effects to suppress.`;
}

/** And when it opens again. */
export function antimagicLiftedLine(name, count) {
  return count > 0
    ? `<strong>${name}</strong>: ${count} magical effect${count === 1 ? "" : "s"} `
      + `function${count === 1 ? "s" : ""} as before.`
    : `<strong>${name}</strong>: out of the field.`;
}
