/**
 * Senses, their categories and their ranges.
 *
 * Chapter 8 ("Perceiving") defines four categories and gives each a
 * range formula in Wisdom. The Creature Codex then uses that vocabulary
 * without restating it — Blight Sense is "a tertiary sense", Echolocation
 * has "a range equal to half the normal for a primary sense" — which is
 * why the Codex alone was not enough to build this from, and why the
 * senses model waited for the chapter rather than being guessed at.
 *
 * The four categories, verbatim from the page:
 *
 *   PRIMARY    100 + Wis x 10 ft.  Detects any creature not hiding or
 *                                  obscured; the only way to target
 *                                  without drawbacks.
 *   SECONDARY   50 + Wis x 10 ft.  A creature sensed ENTIRELY by a
 *                                  secondary sense is HIDDEN to you.
 *   TERTIARY    30 + Wis x  5 ft.  Detects presence, not location; the
 *                                  creature is UNDETECTED.
 *   TACTILE     touch.
 *
 * And the multiplier that the Codex was quietly relying on:
 *
 *   "All special senses (except Nightvision) have half the range of a
 *    normal sense."
 *
 * Pure and Foundry-free.
 */

/** The four categories, and what each does to a creature you sense by it. */
import { runeSenses } from "./rune-declarations.mjs";

export const SENSE_CATEGORIES = Object.freeze({
  primary: Object.freeze({ label: "Primary", base: 100, perWis: 10, detects: "observed" }),
  secondary: Object.freeze({ label: "Secondary", base: 50, perWis: 10, detects: "hidden" }),
  tertiary: Object.freeze({ label: "Tertiary", base: 30, perWis: 5, detects: "undetected" }),
  tactile: Object.freeze({ label: "Tactile", base: 0, perWis: 0, detects: "touch" })
});

export const SENSE_CATEGORY_NAMES = Object.freeze(Object.keys(SENSE_CATEGORIES));

/**
 * The four MODALITIES — which organ a sense uses.
 *
 * A DIFFERENT AXIS FROM THE CATEGORY, and the Codex needs both: the
 * category says how far a sense reaches and how well it locates, and the
 * modality says what it is made of. Darkvision and Echolocation are both
 * primary senses; one is doubled by Enhanced Vision and the other by
 * Enhanced Hearing, and no category could tell them apart.
 *
 * Recorded per ability with a `modalityFrom` quoting the words it was
 * read from — Tremorsense's cites Graham's ruling of 11 Aug 2026 that
 * vibration through contact is touch and not sound.
 *
 * A SENSE MAY HAVE NONE. Blight Sense senses "any cursed, diseased or
 * poisoned creature" and Life Sense "the vital essence of living and
 * undead creatures"; neither names an organ, and neither is guessed at.
 * The consequence is real and intended: no Enhanced feat reaches them.
 */
export const SENSE_MODALITIES = Object.freeze(["visual", "auditory", "olfactory", "tactile"]);

/**
 * The three Codex feats that double a modality's range, and which one
 * each reaches.
 *
 * "Any special auditory senses that you possess have their range
 * doubled" — SPECIAL, which every sense in this system is, and by
 * MODALITY, which is why the modality had to exist first.
 *
 * There is no feat for the tactile modality. Three feats are printed and
 * four modalities exist; the fourth is absent from the chapter rather
 * than absent from here.
 */
export const ENHANCED_SENSE_FEATS = Object.freeze({
  "enhanced vision": "visual",
  "enhanced hearing": "auditory",
  "enhanced smell": "olfactory"
});

/** The modalities a character's feats double. */
export function enhancedModalities(featNames = []) {
  const owned = new Set((featNames ?? []).map((name) => String(name ?? "").trim().toLowerCase()));
  return Object.entries(ENHANCED_SENSE_FEATS)
    .filter(([feat]) => owned.has(feat))
    .map(([, modality]) => modality);
}

/**
 * The range of a sense, in feet.
 *
 * @param {string} category primary | secondary | tertiary | tactile
 * @param {number} wisdom The creature's Wisdom modifier.
 * @param {object} [opts]
 * @param {boolean} [opts.special] A special sense — halved, per Chapter 8.
 * @param {boolean} [opts.fullRange] The named exceptions to the halving.
 *   Nightvision is the chapter's own ("This sense has the same range as
 *   your normal vision"); Sonar Sense is the Codex's ("has the same
 *   range as vision"). Anything else claiming full range wants a reason
 *   written beside it.
 * @param {number|null} [opts.fixedFeet] A printed range that overrides
 *   the formula entirely — Blood Scent's "up to a mile".
 * @returns {number|null} Feet, or null for a tactile sense (touch).
 */
export function senseRangeFeet(category, wisdom, opts = {}) {
  const spec = SENSE_CATEGORIES[String(category ?? "").toLowerCase()];
  if (!spec) return null;
  if (spec.detects === "touch") return null;

  if (Number.isFinite(Number(opts.fixedFeet))) return Math.max(0, Math.floor(Number(opts.fixedFeet)));

  const wis = Number(wisdom);
  const w = Number.isFinite(wis) ? wis : 0;
  const full = spec.base + (w * spec.perWis);

  // A creature with a very low Wisdom must not end up with a negative
  // range, which would read as "senses nothing" in one place and as a
  // negative number on the stat block in another.
  const bounded = Math.max(0, full);
  const halved = opts.special && !opts.fullRange;
  return halved ? Math.floor(bounded / 2) : bounded;
}

/**
 * What sensing a creature ENTIRELY by this sense leaves it as.
 *
 * Usually the category's own answer — but Chapter 8's Blindsight breaks
 * the two apart: it "allow[s] you to sense detect creatures using what
 * would normally be a secondary sense … and gain the equivalent sensory
 * information as a PRIMARY sense", while "Blindsight will usually have
 * the range of a SECONDARY sense".
 *
 * So range and quality are not the same axis, and a sense may name a
 * `qualityAs` that differs from the category it takes its range from.
 * Collapsing the two would have made Blindsight either reach twice as
 * far as it should or leave its target hidden when the page says it does
 * not.
 */
export function detectionQuality(category, qualityAs = null) {
  const source = qualityAs ?? category;
  return SENSE_CATEGORIES[String(source ?? "").toLowerCase()]?.detects ?? null;
}

/** The sense block an ability declares, or null. */
export function senseOf(item) {
  const s = item?.flags?.["trg-prime"]?.creatureAbility?.derives?.sense;
  return s && typeof s === "object" && SENSE_CATEGORIES[s.category] ? s : null;
}

/**
 * Every sense a creature has, resolved to real ranges — the Senses line
 * of the Codex's stat block, which prints "each sense … along with its
 * range".
 *
 * Sorted by range, longest first, because that is the order the useful
 * information wants to be read in.
 */
export function sensesOf(items = [], wisdom = 0, { featNames = [] } = {}) {
  const doubled = new Set(enhancedModalities(featNames));
  // A SENSE A WORN RUNE GRANTS (3.626.0): Pillars of Faith's Veilwatch —
  // "You gain Spirit Sense as a tertiary sense" — declared on the
  // registered rune and read off the armour it is inscribed on, while
  // that armour counts. Carried in beside the items as a pseudo-item of
  // the rune's name, so the one mapping below serves both.
  const fromRunes = runeSenses(items).map((r) => ({
    name: r.source, flags: { "trg-prime": { creatureAbility: { derives: { sense: r.sense } } } }
  }));
  return [...(items ?? []), ...fromRunes]
    .map((item) => {
      const sense = senseOf(item);
      if (!sense) return null;
      const base = senseRangeFeet(sense.category, wisdom, sense);
      // "Any special auditory senses that you possess have their range
      // doubled." SPECIAL and of the feat's own MODALITY — a sense with
      // no modality recorded is doubled by nothing, which is the point
      // of not guessing one.
      const enhanced = Boolean(sense.special) && Boolean(sense.modality)
        && doubled.has(sense.modality) && base !== null;
      const rangeFeet = enhanced ? base * 2 : base;
      // A name like "Darkvision (55 ft.)" carries a range of its own.
      // Compared against the BASE rather than the doubled figure, since
      // whoever typed the label was describing the sense as printed, not
      // as an Enhanced feat leaves it.
      const { claimedFeet } = senseNameParts(sense.name ?? item.name);
      return {
        name: sense.name ?? item.name,
        category: sense.category,
        modality: sense.modality ?? "",
        special: Boolean(sense.special),
        // A tactile sense has no range to double, and null stays null:
        // twice touch is touch.
        rangeFeet,
        baseFeet: base,
        enhanced,
        detects: detectionQuality(sense.category, sense.qualityAs),
        note: sense.note ?? "",
        // What this item's NAME claimed, and whether it agrees with what
        // the rule computes. Surfaced rather than silently overridden —
        // see senseNameParts.
        claimedFeet,
        nameRangeDisagrees: claimedFeet !== null && base !== null && claimedFeet !== base
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.rangeFeet ?? 0) - (a.rangeFeet ?? 0));
}

/**
 * Every sense an ACTOR has, from its own items and attributes.
 *
 * One function rather than three lines of plumbing at the call site: the
 * Wisdom that sets the ranges and the feats that double them both come
 * off the same actor, and a caller that assembled them itself would be a
 * caller that could assemble them differently from the next one.
 *
 * @param {object} actorSystem
 * @param {object[]} items
 */
export function actorSenses(actorSystem, items = []) {
  return sensesOf(
    items,
    Number(actorSystem?.attributes?.wisdom?.total ?? 0),
    { featNames: (items ?? []).filter((item) => item?.type === "feat").map((item) => item.name) }
  );
}

/**
 * A sense name with any range its author typed into it split back off.
 *
 * SOME ABILITY ITEMS ARE NAMED "Darkvision (55 ft.)". The range is also
 * computed, so `senseLine` printed both and the sheet read
 * "Darkvision (55 ft.) 55 ft." — and worse "Scent (55 ft.) 30 ft.",
 * where the two disagree. Found live at 3.369.0 on five items: four on
 * creatures in the world and one in the abilities pack.
 *
 * The name is a label a person wrote; the range is derived from the
 * creature's Wisdom and its ability's own declaration. The derived
 * figure governs, so the label's copy comes off the front — but it is
 * RETURNED rather than discarded, because a label claiming 55 where the
 * rule computes 30 is worth surfacing rather than quietly overwriting.
 * Silently winning that argument is how the wrong number survives.
 *
 * NOT EXPORTED, on the same grounds as `normaliseSize` in items.mjs:
 * `senseLine` is this rule's public form and every caller wants the
 * finished line rather than the parts. The disagreement it detects does
 * leave the module — `sensesOf` puts `claimedFeet` and
 * `nameRangeDisagrees` on every sense — so a harness can drive the
 * behaviour through either of those without a second public entry point
 * that nothing would otherwise call.
 *
 * @param {string} name
 * @returns {{name: string, claimedFeet: number|null}}
 */
function senseNameParts(name) {
  const raw = String(name ?? "").trim();
  const match = raw.match(/^(.*?)\s*\(\s*(\d+)\s*ft\.?\s*\)$/i);
  if (!match) return { name: raw, claimedFeet: null };
  const stripped = match[1].trim();
  // "(60 ft.)" with nothing before it is the whole name, not a
  // decoration on one. Leave it alone rather than returning "".
  if (!stripped) return { name: raw, claimedFeet: null };
  return { name: stripped, claimedFeet: Number(match[2]) };
}

/** "Darkvision 60 ft." — the stat block's own format. */
export function senseLine(sense) {
  if (!sense) return "";
  const { name } = senseNameParts(sense.name);
  if (sense.rangeFeet === null) return `${name} (touch)`;
  return `${name} ${sense.rangeFeet} ft.`;
}

/**
 * The `derives.sense` block for a sense a SPELL grants temporarily.
 *
 * NEW at 3.398.0, for Detect Life and Detect Undead (Chapter 10, PP 0):
 * "you can detect the presence of living creatures. This acts as a
 * Tertiary Sense using your Power Manipulation skill in place of
 * Perception checks."
 *
 * ─────────────────────────────────────────────────────────────────────
 * BUILT HERE SO A HARNESS CAN CHECK IT. The alternative was to write the
 * block into the compendium by hand, where the only thing standing
 * between "tertiary" and "teritary" is my typing — and `senseOf` returns
 * null for an unknown category, so a misspelling would produce a spell
 * that grants nothing, for ever, in silence. Three bugs this week lived
 * in exactly that gap.
 *
 * NO MODALITY, DELIBERATELY. The book names no organ for either spell,
 * and the precedent above is explicit about not inventing one: Life
 * Sense and Blight Sense both go without, and the consequence — that no
 * Enhanced feat reaches them — is stated as intended rather than
 * tolerated. A granted sense follows them.
 *
 * `rollWith` IS RECORDED, NOT APPLIED, and that distinction is the
 * honest part. Nothing in this system rolls a check "for a sense":
 * `actorSenses` feeds `system.details.senses`, which is a display line,
 * and detection is adjudicated at the table. So "Power Manipulation in
 * place of Perception checks" has nothing to substitute INTO — the
 * existing `SKILL_SUBSTITUTION_FEATS` machinery is keyed on a feat and a
 * named skill ACTION, which is a different axis entirely. Carrying the
 * phrase onto the sense line tells the player what to roll; claiming it
 * were automated would be the "automation that is really a reminder"
 * this chapter has spent a fortnight removing.
 *
 * @param {object} spec
 * @param {string} spec.category  a SENSE_CATEGORIES key
 * @param {string} [spec.detects] what it finds, recorded as `finds`
 * @param {string} [spec.rollWith] the skill to roll instead of Perception
 * @returns {object|null} null if the category is not a real one
 */
export function grantedSenseBlock({ category, detects = "", rollWith = "" } = {}) {
  const key = String(category ?? "").trim().toLowerCase();
  if (!SENSE_CATEGORIES[key]) return null;

  const found = String(detects ?? "").trim();
  const roll = String(rollWith ?? "").trim();

  // NOT `special`, AND THAT IS A RULING RATHER THAN AN OMISSION.
  //
  // Chapter 8: "All special senses (except Nightvision) have half the
  // range of a normal sense", and `senseRangeFeet` implements it — so
  // `special: true` would silently halve these spells, 30 feet becoming
  // 15. The first version of this function carried the flag, copied from
  // Blindsight without asking what it did, and B2 caught it.
  //
  // Graham ruled on 25 August 2026: FULL RANGE. "This acts as a Tertiary
  // Sense" means it has a tertiary sense's range; the book's special
  // senses are a list of innate creature abilities — Darkvision,
  // Blindsight, Tremorsense — and a spell is not among them. Writing
  // "acts as a Tertiary Sense" to mean half of one would be a strange
  // way to say fifteen feet.
  //
  // `fullRange` would have been the other encoding, and is deliberately
  // not used: that flag is documented above as being for the book's
  // NAMED exceptions to the halving, and claiming a granted sense is a
  // special sense that happens to be exempt says something the ruling
  // did not. It is simply not one of them.
  const block = { category: key };
  // `finds`, NOT `detects`. A mutation that dropped this field survived
  // every check, and chasing why turned up a worse problem than the gap:
  // `sensesOf` already returns a field called `detects`, and it means
  // something else entirely — the detection QUALITY from
  // `detectionQuality`, i.e. whether sensing a creature this way leaves
  // it observed, hidden or undetected. Two layers, one word, two
  // meanings, and the collision was invisible because `sensesOf` builds
  // a fresh object and never reads this one.
  //
  // Renamed rather than explained. A field whose meaning depends on
  // which layer you are looking at is a trap for whoever reads it next.
  if (found) block.finds = found;
  if (roll) block.rollWith = roll;
  block.note = [
    found ? `Detects ${found}.` : "",
    roll ? `Roll ${roll} in place of Perception.` : ""
  ].filter(Boolean).join(" ");
  return block;
}
