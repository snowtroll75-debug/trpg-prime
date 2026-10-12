/**
 * A SPELL WHOSE WHOLE JOB IS TO COUNTERACT SOMETHING (3.596.0).
 *
 * Graham, 26 September 2026, R7 of block 31: "Build both."
 *
 * PRINTED (Restore Senses, page 311): "You attempt to counteract an effect
 * that has inflicted the blinded or deafened conditions upon the target,
 * seeking to restore their sight or hearing. This counteract action can
 * address both temporary or permanent effects but cannot heal a physical
 * injury or natural loss."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CHECK EXISTS; NO SPELL COULD ASK FOR IT.
 *
 * `combat/counteract-workflow.mjs` has held `rollCounteractCheck` since the
 * action blocks — an opposed check against the DC of the effect being
 * removed, prompting for the check and the DC rather than assuming
 * Spellcraft, because Chapter 8 leaves both to the situation. Restore
 * Senses carried NO effect rows at all, so a PP 4 spell whose only content
 * is that check did nothing: its extra-target warp was wired to a spell
 * that had nothing to apply.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS ROW DECIDES, AND WHAT IT LEAVES TO THE TABLE.
 *
 * IT DECIDES: which conditions are in scope (the page names two), that the
 * check is rolled once per recipient, and that a success removes the
 * condition it was rolled against.
 *
 * IT LEAVES: the DC, because that is the DC of whatever inflicted the
 * condition and this system does not record what inflicted a condition.
 * `rollCounteractCheck` asks for it, which is the honest answer and the one
 * the existing action already gives.
 *
 * AND IT REFUSES QUIETLY WHEN THERE IS NOTHING TO COUNTERACT — a target who
 * is neither blinded nor deafened is said out loud rather than rolled for,
 * because a check against nothing reads as a failure that cost a spell.
 */

const text = (v) => String(v ?? "").trim();

/**
 * A counteract row, or null when it is malformed.
 *
 * A ROW NAMING NO CONDITION IS REFUSED. "Counteract something" is not a
 * rule; the page names blinded and deafened, and a row that named nothing
 * would roll a check and then have nothing to remove on a success.
 *
 * @param {object} raw
 * @returns {{conditions: string[], label: string}|null}
 */
export function normaliseCounteract(raw) {
  if (!raw || raw.kind !== "counteract") return null;
  // KEPT AS DECLARED (3.613.0): `flatFooted` is a key, and lower-casing it
  // made a key no creature can hold.
  const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [])
    .map((c) => text(c))
    .filter(Boolean);
  // AN EFFECT CARRYING A TRAIT (3.613.0, R14 of block 35). Soothing Words
  // "can attempt to counteract one EMOTION effect"; Soothing Ballad
  // "attempts to counteract FEAR effects". Graham: frightened and fleeing,
  // plus anything from a spell with the trait — which the condition now
  // carries (combat/effect-application-workflow.mjs, SOURCE_TRAITS_FLAG).
  const traits = traitList(raw.traits);
  if (!conditions.length && !traits.length) return null;
  // HOW MANY ONE CASTING MAY ADDRESS: "one emotion effect" is one. Zero is
  // every one the target has, which is what Restore Senses always did.
  const limit = Math.max(0, Math.trunc(Number(raw.limit) || 0));
  return { conditions, traits, limit, label: text(raw.label) };
}

/**
 * A trait line or list as lower-case words — "Composition, Emotion" →
 * ["composition", "emotion"].
 * @param {string|string[]} value
 * @returns {string[]}
 */
export function traitList(value) {
  return (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((t) => text(t).toLowerCase())
    .filter(Boolean);
}

/**
 * What one casting may counteract on this creature: the named conditions it
 * holds, then any other effect whose source carried one of the traits.
 *
 * TAKES PLAIN ROWS — `{id, name, statuses, sourceTraits}` — so the harness
 * can drive it without a world. A condition named outright is listed once
 * however many effects carry it, because one check removes it.
 *
 * @param {object} spec a normalised counteract
 * @param {(key: string) => boolean} has
 * @param {Array<{id: string, name: string, statuses?: string[], sourceTraits?: string[]}>} effects
 * @returns {Array<{kind: "condition"|"effect", key: string, label: string}>}
 */
export function counteractCandidates(spec, has, effects = []) {
  if (!spec) return [];
  const out = counteractableOn(spec, has).map((c) => ({ kind: "condition", key: c, label: c }));
  if (!spec.traits?.length) return out;
  const named = new Set(out.map((o) => o.key.toLowerCase()));
  for (const effect of Array.isArray(effects) ? effects : []) {
    const carried = traitList(effect?.sourceTraits);
    if (!carried.some((t) => spec.traits.includes(t))) continue;
    const statuses = Array.isArray(effect?.statuses) ? effect.statuses : [];
    if (statuses.some((s) => named.has(String(s).toLowerCase()))) continue;
    out.push({ kind: "effect", key: String(effect.id), label: text(effect.name) || "an effect" });
  }
  return out;
}

/**
 * Which of the named conditions this creature actually has.
 *
 * TAKES THE TEST, not the actor, so the harness can drive every
 * combination without a world.
 */
export function counteractableOn(spec, has) {
  if (!spec || typeof has !== "function") return [];
  return (spec.conditions ?? []).filter((c) => has(c));
}

/** What the card says when there is nothing to counteract. */
export function nothingToCounteractLine(targetName, spec) {
  const conditions = spec.conditions ?? [];
  const which = conditions.length > 1
    ? `${conditions.slice(0, -1).join(", ")} or ${conditions.at(-1)}`
    : conditions[0];
  const traited = (spec.traits ?? []).length ? `under no ${spec.traits.join(" or ")} effect` : "";
  const said = [which ? `not ${which}` : "", traited].filter(Boolean).join(", and ");
  return `<em>${targetName} is ${said} — nothing to counteract.</em>`;
}

/** And when the check succeeds. */
export function counteractedLine(targetName, condition) {
  return `<strong>${targetName}</strong> is no longer <strong>${condition}</strong> &mdash; `
    + "the effect was counteracted.";
}

/** And when it fails, which is a real outcome rather than an error. */
export function counteractFailedLine(targetName, condition) {
  return `<em>The counteract check does not reach it — ${targetName} is still ${condition}.</em>`;
}
