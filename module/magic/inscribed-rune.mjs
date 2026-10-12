/**
 * A RUNE INSCRIBED ON A PLACE (3.604.0, Graham's R10 of block 31).
 *
 * Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS, BOTH `effects: []`, BOTH TEN-MINUTE RITUALS.
 *
 *   RUNE OF WARDING (PP 4, 10-radius, 8 hours)
 *     "You inscribe the Rune of Warding on the target object or surface.
 *      While the rune remains, it creates a subtle protective ward
 *      centred on the inscribed point. ALL CREATURES YOU DESIGNATE AT THE
 *      TIME OF CASTING gain a +1-status bonus to DB and saving throws
 *      WHILST IN THE SPELL'S RADIUS."
 *
 *   RUNE OF WARNING (PP 2, 30-radius centred on the object, 8 hours)
 *     "You inscribe the Rune of Warning on the target object SPECIFYING A
 *      PARTICULAR RACE TRAIT (elf, orc, etc). The Rune will glow of a
 *      soft silver light IF ANY CREATURE OF THAT TRAIT TYPE ENTERS the
 *      area of effect."
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE FILE, TWO KINDS, AND WHY IT IS NOT ONE KIND WITH A MODE.
 *
 * What they share is real and worth sharing: a Region inscribed at a
 * touched point that outlives its cast by eight hours, and a rule read
 * when something CROSSES ITS EDGE rather than when a turn begins.
 *
 * What they do on that crossing is not related at all. One hands out a
 * bonus and takes it back; the other tells the GM somebody walked in. A
 * single `rune` kind with a `mode` field would put two unrelated rules
 * behind one word, and this project has paid for that shape before — the
 * kind name should say which rule, and the shared machinery lives here.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A PLACE, NOT AN EMANATION — the distinction `elemental-nexus.mjs` drew
 * and for the same reason. An emanation is centred on the caster and
 * travels with them; both of these are centred on an inscribed point and
 * stay there while the caster walks away. `runningEmanations()` can never
 * see them.
 *
 * BUT THE WARD'S EFFECT IS AN EMANATION'S EFFECT, and that is deliberate
 * reuse rather than a coincidence: "+1 status to DB and saving throws
 * whilst inside" is exactly the shape `emanationEffectData` already
 * builds, so the ward hands it four `bonus` rows and lets
 * `applyEmanationEffectsTo` / `removeEmanationEffectsFrom` do the work.
 * A parallel apply-and-remove pair would be a second chance to disagree
 * about what a status bonus is.
 *
 * ─────────────────────────────────────────────────────────────────────
 * READ ON MOVEMENT, NOT AT THE START OF A TURN. GRAHAM'S RULING,
 * 29 September 2026.
 *
 * The nexus is swept from the turn clock because it asks "who BEGINS a
 * turn here", which movement cannot answer. These two ask the opposite
 * question — "who just crossed the edge" — and the turn clock cannot
 * answer that. For the ward it is the difference between a rule and a
 * frustration: a designated ally who steps behind the rune and is then
 * attacked should be warded for THAT attack, not from their next turn.
 *
 * So both ride the movement watcher built for the shadow tether at
 * 3.601.0, and both are edge-triggered off a record of who was inside
 * last time. A creature standing still inside a Rune of Warning does not
 * set it off again every time anything moves.
 */

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const int = (v) => Math.trunc(Number(v) || 0);

/** The flag a placed rune's Region carries. */
export const RUNE_FLAG = "inscribedRune";

/** Which rune this is. Two kinds, one file — see the header. */
export const RUNE_KINDS = Object.freeze(["runeWard", "runeWarning"]);

/**
 * The bonus rows the Rune of Warding hands to the emanation applier.
 *
 * FOUR ROWS, NOT TWO. "DB and saving throws" is one phrase in the book
 * and four slots on the sheet: there is no all-saves slot in
 * `bonusTargetFor`, and inventing one for this spell would put a path in
 * the effect system that nothing else writes to. Named individually, each
 * one lands somewhere a harness can read.
 *
 * STATUS, BECAUSE THE PAGE SAYS "+1-status". Not a choice.
 */
export const WARD_BONUS_ROWS = Object.freeze([
  Object.freeze({ kind: "bonus", slot: "defence", value: 1, bonusType: "status" }),
  Object.freeze({ kind: "bonus", slot: "fortitude", value: 1, bonusType: "status" }),
  Object.freeze({ kind: "bonus", slot: "reflex", value: 1, bonusType: "status" }),
  Object.freeze({ kind: "bonus", slot: "will", value: 1, bonusType: "status" })
]);

/**
 * The spec a rune row declares, or null when it declares nothing usable.
 *
 * THE RADIUS COMES FROM THE SPELL, NOT THE ROW, so it is not validated
 * here — `parseSpellArea` reads "10-radius" and "30-radius centred on the
 * object" off the spell's own Area field, which is where the two numbers
 * are printed and where a warp can already change them.
 */
export function normaliseRune(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = text(raw.kind);
  if (!RUNE_KINDS.includes(kind)) return null;
  const label = text(raw.label) || (kind === "runeWard" ? "Rune of Warding" : "Rune of Warning");
  return { kind, label };
}

/**
 * The record a placed rune keeps.
 *
 * `inside` IS THE WHOLE EDGE-TRIGGER. Without it the ward would re-apply
 * its effect on every token movement anywhere on the scene, and the
 * warning would announce the same motionless elf for ever.
 */
export function runeRecord({ kind, label, castId, centre, radiusFeet, designated = [], trait = "", until = null }) {
  if (!RUNE_KINDS.includes(text(kind))) return null;
  const c = centre ?? {};
  if (!Number.isFinite(Number(c.x)) || !Number.isFinite(Number(c.y))) return null;
  if (int(radiusFeet) <= 0) return null;
  return {
    kind: text(kind),
    label: text(label),
    castId: text(castId),
    centre: { x: Number(c.x), y: Number(c.y) },
    radiusFeet: int(radiusFeet),
    // DESIGNATION IS BY UUID AND FIXED AT CAST. Graham's ruling of
    // 29 September 2026: the picker lists who is inside when the ritual
    // finishes, and that list is the ward for the next eight hours. A
    // creature who walks out and back in is still designated — the
    // designation is a fact about the cast, the radius is a fact about
    // right now, and the bonus needs both.
    designated: [...new Set((Array.isArray(designated) ? designated : []).map(text).filter(Boolean))],
    trait: lower(trait),
    until: until == null ? null : Number(until),
    inside: []
  };
}

/** Is this rune still running at this world time? */
export function runeIsLive(record, now) {
  if (!record) return false;
  if (record.until == null) return true;
  return Number(now) < Number(record.until);
}

/** Is this creature one of the ones the caster named? */
export function runeDesignates(record, uuid) {
  return (record?.designated ?? []).includes(text(uuid));
}

/**
 * Does this creature's trait list match the trait the rune watches?
 *
 * MATCHED AS A WHOLE WORD, case-insensitively, against the creature's own
 * traits. A substring test would make a rune set for "elf" fire on a
 * "Half-Elf" — which is arguably right — and also on a "Selfsame
 * Horror", which is not. The book's examples are ancestry words, so the
 * word is the unit.
 */
export function runeWatchesTrait(record, traits) {
  // FOLDED ON BOTH SIDES. `runeRecord` already lowers the trait it stores, so
  // this is for a record built by hand — the harness does, and so would a
  // future caller that has a trait without a cast behind it.
  const want = lower(record?.trait);
  // THE `filter(Boolean)` IS THE GUARD, not a tidy-up.
  //
  // A rune with no trait has `want === ""`, and a creature whose traits carry
  // a trailing comma splits to an empty entry — so without this an unset rune
  // would fire on anybody whose trait string ended in punctuation. The first
  // draft guarded that with an `if (!want) return false;` above instead, which
  // never changed an answer because the filter had already made it impossible.
  // A dead guard is worse than none: it reads as the protection while the real
  // one is a line somebody might tidy away.
  const list = (Array.isArray(traits) ? traits : String(traits ?? "").split(/[,;]/))
    .map((t) => lower(t))
    .filter(Boolean);
  return list.includes(want);
}

/**
 * Who crossed in and who crossed out, against the record's own memory.
 *
 * THE SAME SHAPE `emanationDelta` TAKES, deliberately: two lists in, two
 * lists out, no Foundry. It is the third time this project has needed
 * "what changed since last time" and the first two both got it wrong by
 * comparing against the wrong side.
 */
export function runeCrossings(record, insideNow) {
  const before = new Set((record?.inside ?? []).map(text).filter(Boolean));
  const now = new Set((Array.isArray(insideNow) ? insideNow : []).map(text).filter(Boolean));
  return {
    entered: [...now].filter((id) => !before.has(id)),
    left: [...before].filter((id) => !now.has(id)),
    inside: [...now]
  };
}

/* ══════════════════════════════════════════════════════════════════ *
 * THE CARD
 * ══════════════════════════════════════════════════════════════════ */

/** What the card says when the Rune of Warding is inscribed. */
export function wardInscribedLine(label, radiusFeet, names) {
  const who = names.length
    ? `<strong>${names.join("</strong>, <strong>")}</strong>`
    : "<em>nobody</em>";
  return `<strong>${label}</strong> is inscribed — a ${radiusFeet}-foot ward. Designated: ${who}. `
    + "Each gains <strong>+1 status</strong> to Defence and all three saves whilst inside it.";
}

/** And when nobody was named, which is a cast that bought nothing. */
export function wardDesignatesNobodyLine(label) {
  return `<em>${label} is inscribed, but nobody was designated — the ward protects no one. `
    + "Designation is fixed at casting and cannot be added to later.</em>";
}

/** What the card says when a designated creature steps into the ward. */
export function wardEnteredLine(label, name) {
  return `<strong>${name}</strong> is inside <strong>${label}</strong> — <strong>+1 status</strong> `
    + "to Defence and saves.";
}

/** And when they step out of it. */
export function wardLeftLine(label, name) {
  return `<strong>${name}</strong> has left <strong>${label}</strong> — the ward no longer applies.`;
}

/** What the card says when the Rune of Warning is inscribed. */
export function warningInscribedLine(label, radiusFeet, trait) {
  return `<strong>${label}</strong> is inscribed, watching for <strong>${trait}</strong> within `
    + `${radiusFeet} feet for the next 8 hours.`;
}

/** And when it declares no trait, which is a rune that can never fire. */
export function warningNoTraitLine(label) {
  return `<em>${label} names no race trait to watch for — it can never glow. `
    + "The trait is specified as the rune is inscribed.</em>";
}

/**
 * What the card says when the rune glows.
 *
 * TOLD TO THE GM AND NOBODY ELSE. Graham's ruling of 29 September 2026:
 * the rune fires whether or not a character is standing there to see it,
 * so the GM is told and decides who noticed. A public card would hand the
 * players knowledge their characters may not have.
 */
export function warningGlowsLine(label, name, trait) {
  return `<strong>${label}</strong> glows with a soft silver light — <strong>${name}</strong> `
    + `(<strong>${trait}</strong>) has entered the area.`;
}

/** And the half the table settles. */
export function runeJudgedAtTheTableLine() {
  return "<em>Judged at the table: whether the inscribed surface survives, whether anyone is "
    + "present to see the rune light, and whether a creature examining it recognises what it is.</em>";
}
