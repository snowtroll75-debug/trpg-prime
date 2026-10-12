/**
 * A bonus that applies against ONE NAMED CREATURE and nobody else.
 *
 * NEW at 3.406.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THAT PAID FOR THIS, found while wiring PP 0's Forbidding
 * Ward and worth more than the spell was.
 *
 * STONE SHIELD shipped as this pack row:
 *
 *   { kind: "bonus", target: "self", slot: "defence",
 *     bonusType: "circumstance", value: 4,
 *     note: "(cover from one chosen enemy until the start of your next turn)" }
 *
 * An UNCONDITIONAL +4 to DB, with the scope that makes it correct sitting
 * in a parenthesis that nothing reads. The book gives cover "from that
 * enemy"; the system gave +4 against every attacker in the scene for a
 * round. That is not a rounding error on a niche spell — it is the
 * difference between a good 1-PP spell and the best defensive spell in
 * the game, and it has been live the whole time.
 *
 * It is also, exactly, the shape `markers.mjs` named: automation that is
 * really a reminder. The note told a GM what should happen. Nothing made
 * it happen, and nothing could, because there was no way to say "against
 * that one".
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE SCOPE IS A UUID.
 *
 * Two ogres in a room are both called "Ogre". A ward raised against one
 * must not protect against the other, and a name match cannot tell them
 * apart — the Improved Combat Reflexes lesson, where the code matched a
 * string, the pack held a different one, and the code and its test
 * happily agreed with each other.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY ONE WRITER FOR TWO FLAGS.
 *
 * "+1 status bonus to DB AND saving throws" is one sentence, but the two
 * halves live in different engines and neither can serve the other:
 *
 *   DB     is a STATIC number an attacker rolls against, so the bonus has
 *          to be added when the ATTACKER rolls — `combat/defence-dc.mjs`.
 *   SAVES  are rolls the defender makes, so the bonus is a conditional on
 *          that roll — `conditionals.mjs`.
 *
 * Two flags, two vocabularies, one rule. `mutate-markers` #10 already
 * proved what happens when a flag is written in one place and read in
 * another: it renamed `marker` to `markerKey` and fifty-nine checks
 * stayed green while the spell quietly did nothing. So this file is the
 * ONLY thing that writes either flag for a ward, and the harness checks
 * that the halves agree about value, type and scope. A mutation now has
 * nothing to change that does not change both.
 */

/**
 * The defences a ward can cover.
 *
 * `defence` is DB and goes down the defence-DC channel; the three saves
 * are conditionals. Named here rather than in either engine because the
 * split between them is this file's business and nobody else's.
 */
export const WARD_SLOTS = Object.freeze(["defence", "fortitude", "reflex", "will"]);

/** The save slots, in the vocabulary `conditionals.mjs` uses for `subjects`. */
const SAVE_SLOTS = Object.freeze(["fortitude", "reflex", "will"]);

/** Is this a defence a ward knows how to cover? */
export function isWardSlot(slot) {
  return WARD_SLOTS.includes(String(slot ?? "").trim().toLowerCase());
}

/**
 * The slots one ward effect covers.
 *
 * AN EFFECT THAT DECLARES NOTHING COVERS EVERYTHING, because the
 * sentence that needed this file says "DB and saving throws" — all four
 * — and making every author retype the full list would be four chances
 * to drop one. A ward that covers less says so.
 */
export function wardSlots(effect) {
  const raw = effect?.slots;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [...WARD_SLOTS];
}

/** Any slot on this effect that is not a defence a ward can cover. */
export function unknownWardSlots(effect) {
  return wardSlots(effect).filter((slot) => !isWardSlot(slot));
}

const cleanUuids = (uuids) => (Array.isArray(uuids) ? uuids : uuids ? [uuids] : [])
  .map((u) => String(u ?? "").trim())
  .filter(Boolean);

/**
 * The system-flag payload for one ward.
 *
 * @param {object} options
 * @param {number} options.value the bonus, signed
 * @param {string} options.bonusType Appendix-1 pool ("status", "circumstance"…)
 * @param {string} options.label what the card and the dialog call it
 * @param {string[]} options.sourceUuids the creature(s) warded against
 * @param {string[]} [options.slots]
 * @returns {{defenceDC: object[], conditionals: object[]}}
 */
export function wardFlagData({ value, bonusType, label, sourceUuids, slots } = {}) {
  const amount = Math.trunc(Number(value) || 0);
  const type = String(bonusType ?? "status").trim().toLowerCase() || "status";
  const name = String(label ?? "Ward");
  const against = cleanUuids(sourceUuids);
  const covered = wardSlots({ slots });

  // A WARD AGAINST NOBODY IS NOT A WARD. Returning empty arrays rather
  // than unscoped entries is the whole correction this file exists for:
  // an entry with no scope raises the number against everything, which
  // is precisely the Stone Shield defect. Silence here is safe because
  // `verify-ward` refuses to let an unscoped ward reach the pack, and
  // the applier reports a ward it could not aim.
  if (!amount || !against.length) return { defenceDC: [], conditionals: [] };

  const defenceDC = covered.includes("defence")
    ? [{
      dc: "defence",
      value: amount,
      label: name,
      scope: `against ${against.length === 1 ? "one named creature" : "the named creatures"}`,
      when: { sourceUuids: against }
    }]
    : [];

  const saves = covered.filter((slot) => SAVE_SLOTS.includes(slot));
  const conditionals = saves.length
    ? [{
      kind: "modifier",
      value: amount,
      type,
      label: name,
      scope: "against the warded creature's attacks, spells and other effects",
      // AUTO, AND ONLY BECAUSE THE SCOPE IS EXACT. `auto` means the
      // check's own identity settles the question with nothing left for
      // a player to judge — and "is this roll against THAT creature" is
      // either true or false, never a reading. Compare the axes that
      // cannot honestly be auto: a bare Athletics roll and a swim.
      auto: true,
      when: { checkTypes: ["save"], subjects: saves, sourceUuids: against }
    }]
    : [];

  return { defenceDC, conditionals };
}

/**
 * Do the two halves of a written ward still describe the same rule?
 *
 * THE HARNESS'S GRIP ON THE ONE-WRITER RULE. Both halves come from
 * `wardFlagData`, so today they cannot disagree — and that is exactly
 * the situation in which a check earns its keep, because the next
 * refactor is what splits them. Compares the facts a reader acts on:
 * the amount and who it is aimed at.
 *
 * @param {{defenceDC: object[], conditionals: object[]}} flags
 * @returns {string[]} the disagreements, empty when consistent
 */
export function wardHalvesDisagree(flags) {
  const problems = [];
  const db = flags?.defenceDC?.[0];
  const save = flags?.conditionals?.[0];
  if (!db || !save) return problems;

  if (db.value !== save.value) {
    problems.push(`value: DB ${db.value} vs saves ${save.value}`);
  }
  const a = cleanUuids(db.when?.sourceUuids).join("|");
  const b = cleanUuids(save.when?.sourceUuids).join("|");
  if (a !== b) problems.push(`scope: DB [${a}] vs saves [${b}]`);
  if (db.label !== save.label) problems.push(`label: "${db.label}" vs "${save.label}"`);
  return problems;
}
