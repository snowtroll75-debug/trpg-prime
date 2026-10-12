/**
 * Learn a Spell (Trained) — General Skill Action, Chapter 4 x Chapter 8/9.
 * Rules text supplied by Graham directly (8 August 2026):
 *
 *   "If you're a spellcaster, you can use the skill corresponding to your
 *   magical tradition to learn a new spell of that tradition... Spend 1
 *   hour per PP of the spell... Have materials with the Price indicated...
 *   Attempt a skill check for the skill corresponding to your tradition...
 *   Have the minimum casting level required for the casting of the spell.
 *   Once you learn the spell you may add it to your Spell Library."
 *
 * This was the one General Skill Action left unbuilt since 3.15.0 — the
 * release notes for that version and 3.107.0/3.110.0/3.112.0 all say the
 * same thing: it waits on a "Spell Library" concept that didn't exist yet.
 * 3.230.3 built that concept, as the Wizard's Spellbook gear item (the
 * only book-style caster today, and the class whose own printed text says
 * "you may add additional spells to your spell book by following the
 * rules for learning spells" — Chapter 3's own cross-reference to this
 * action). So "Spell Library" here means the Spell Book: this action is
 * the SECOND way to grow it, alongside the free per-level ladder
 * (spellbook.mjs) — paid in time and gp instead of arriving free at
 * level-up. See spellbook.mjs's `learnedExtra` flag for how a spell
 * learned this way is kept out of that free ladder's own tally.
 *
 * Pure functions only — the Foundry side lives in
 * learn-spell-workflow.mjs.
 */

/**
 * The printed table: materials Price (gp) and Difficulty (DC) by the
 * spell's own PP cost band. "+1 PP: +40,000 gp, +2 DC" beyond the last
 * printed row (19-20) is applied per point over, not per band.
 */
const PP_BANDS = Object.freeze([
  { max: 2, gp: 10, dc: 20 },
  { max: 4, gp: 40, dc: 22 },
  { max: 6, gp: 100, dc: 24 },
  { max: 8, gp: 250, dc: 26 },
  { max: 10, gp: 500, dc: 28 },
  { max: 12, gp: 1000, dc: 30 },
  { max: 14, gp: 2000, dc: 32 },
  { max: 16, gp: 4500, dc: 34 },
  { max: 18, gp: 10000, dc: 36 },
  { max: 20, gp: 25000, dc: 38 }
]);

/**
 * Materials Price and Difficulty for a spell of the given PP cost.
 * @param {number} ppCost
 * @returns {{gp: number, dc: number}}
 */
export function learnSpellCost(ppCost) {
  const pp = Math.max(0, Math.floor(Number(ppCost) || 0));
  const band = PP_BANDS.find((entry) => pp <= entry.max);
  if (band) return { gp: band.gp, dc: band.dc };
  const over = pp - 20;
  const top = PP_BANDS[PP_BANDS.length - 1];
  return { gp: top.gp + 40000 * over, dc: top.dc + 2 * over };
}

/** "Spend 1 hour per PP of the spell" — a cantrip (PP 0) costs no time
 * to learn under a literal reading of the printed rule. */
export function learnSpellHours(ppCost) {
  return Math.max(0, Math.floor(Number(ppCost) || 0));
}

/**
 * Where the spell is being learned from — each source changes the check
 * or the materials, per the rule's own closing paragraphs:
 *
 *   "If you are learning the spell from a scroll it is not expended
 *   during the learning process [on a Critical]."
 *   "If you are learning the spell from a spellbook you gain a +2-item
 *   bonus to the check and the lowest result available on the table is
 *   a failure."
 */
export const LEARN_SPELL_SOURCES = Object.freeze({
  spellbook: {
    key: "spellbook",
    label: "A spellbook",
    itemBonus: 2,
    floorAtFailure: true,
    scrollCriticalWaiver: false
  },
  scroll: {
    key: "scroll",
    label: "A scroll",
    itemBonus: 0,
    floorAtFailure: false,
    scrollCriticalWaiver: true
  },
  teacher: {
    key: "teacher",
    label: "Someone who knows it",
    itemBonus: 0,
    floorAtFailure: false,
    scrollCriticalWaiver: false
  }
});

/** The situational check modifier a source contributes, or null. */
export function learnSpellSourceModifier(sourceKey) {
  const source = LEARN_SPELL_SOURCES[sourceKey];
  if (!source?.itemBonus) return null;
  return { label: `Learning from ${source.label.toLowerCase()}`, value: source.itemBonus, type: "item" };
}

/**
 * Resolve the degree of a Learn a Spell check into the table's own five
 * rows. The engine's seven degrees collapse the same way every sparse
 * table in this project does — Heroic reads as Critical (nothing better
 * is printed) and Blunder as Fumble — with one extra wrinkle: learning
 * from a spellbook floors the worst possible row at Failure ("the lowest
 * result available on the table is a failure"), so what would have been
 * a Fumble reads as a Failure instead — no materials lost.
 *
 * @param {string} degreeKey One of the engine's DEGREES keys.
 * @param {object} [options]
 * @param {string} [options.sourceKey] One of LEARN_SPELL_SOURCES' keys.
 * @returns {{bucket: string, learned: boolean,
 *   materialsConsumed: "none"|"half"|"full", canRetry: boolean,
 *   retryModifier: number}}
 */
export function learnSpellOutcome(degreeKey, { sourceKey = "teacher" } = {}) {
  const source = LEARN_SPELL_SOURCES[sourceKey] ?? LEARN_SPELL_SOURCES.teacher;

  let bucket;
  switch (degreeKey) {
    case "heroic":
    case "critical":
      bucket = "critical";
      break;
    case "success":
      bucket = "success";
      break;
    case "partial":
      bucket = "partial";
      break;
    case "failure":
      bucket = "failure";
      break;
    case "fumble":
    case "blunder":
      bucket = source.floorAtFailure ? "failure" : "fumble";
      break;
    default:
      bucket = "failure";
  }

  switch (bucket) {
    case "critical":
      return {
        bucket,
        learned: true,
        materialsConsumed: source.scrollCriticalWaiver ? "none" : "half",
        canRetry: false,
        retryModifier: 0
      };
    case "success":
      return { bucket, learned: true, materialsConsumed: "full", canRetry: false, retryModifier: 0 };
    case "partial":
      return { bucket, learned: false, materialsConsumed: "none", canRetry: true, retryModifier: 2 };
    case "failure":
      return { bucket, learned: false, materialsConsumed: "none", canRetry: true, retryModifier: 0 };
    case "fumble":
      return { bucket, learned: false, materialsConsumed: "full", canRetry: true, retryModifier: 0 };
    default:
      return { bucket, learned: false, materialsConsumed: "none", canRetry: true, retryModifier: 0 };
  }
}
