/**
 * What a character's class contributes, at the level they are.
 *
 * Chapter 3 gives every class a twenty-row table: BAB, BDB, the three
 * base saves, a cumulative bonus-feat count, caster level, power points
 * and base spellcraft bonus. Until now none of that reached the sheet.
 * The class items in the compendium were placeholders with every
 * mechanical field empty, and each of those numbers was a field the
 * player typed by hand — with the code carrying five separate admissions
 * of it ("stands in for your class's HP-per-level rate until compendium
 * classes exist", "Set until classes are compendium items", and so on).
 *
 * This module is the resolver. It is deliberately PURE — it takes an
 * item-shaped object and a level and returns numbers — so the harness can
 * run every row of every class without a Foundry actor in sight. All the
 * wiring lives in documents/actor.mjs.
 *
 * Two rules run through the whole thing:
 *
 *   A class contributes as an ADDITIVE EXTRA, never by overwriting a
 *   bonus slot. `system.combat.saves.fortitude.class` and friends are
 *   typed bonus slots that ActiveEffects write into, and effects are
 *   applied BEFORE prepareDerivedData — so a derived pass that assigned
 *   the class table into `.class` would silently eat every effect that
 *   had landed there. This is the same lesson the background skill
 *   bonuses had to learn the hard way, one chapter earlier.
 *
 *   A blank cell is not a zero. The book prints "-" for a Fighter's
 *   caster level and power points, meaning it has NONE — which is a
 *   different statement from "0", and has to stay different, or a
 *   Fighter would be a caster who can never afford a spell rather than
 *   not a caster at all. Those cells are null here, and a null means the
 *   actor's own manual field is left alone.
 */

import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from "./config.mjs";

/** Chapter 3 tops the printed tables out at 20. */
export const MAX_TABLE_LEVEL = 20;

/** The columns a progression row carries, and what each one governs. */
export const PROGRESSION_COLUMNS = Object.freeze([
  "bab", "bdb", "fortitude", "reflex", "will", "bonusFeats", "casterLevel", "pp", "bsb"
]);

/**
 * Columns the book may leave BLANK — an absence, not a zero.
 *
 * ONE COLUMN, since 3.558.0. The Cleric's and the Druid's tables have no
 * Bonus Feats column AT ALL, which is not the same as the Ranger printing
 * 0 in one for its first three levels. That distinction is real and the
 * null is how it is kept.
 *
 * `casterLevel` and `pp` USED TO BE HERE, because the Fighter's and
 * Rogue's tables printed "-" in both at every level. The 3.8 rulebook
 * revision changes all eighty of those cells to 0, and no dash is left in
 * any class table in the book. Graham's ruling R1, 16 September 2026,
 * asked whether that 0 was a real zero or a new way of writing "not
 * applicable": "Yes make it a real 0."
 *
 * So the cells are zeroes now, and the two places that read their null as
 * "this class does not cast" ask a better question instead — whether the
 * CLASS declares a magical ability. That is what both of them always
 * meant; the blank cell was only ever a proxy for it, and a proxy that
 * the book has now taken away.
 */
export const NULLABLE_COLUMNS = Object.freeze(["bonusFeats"]);

/**
 * Does this class cast at all?
 *
 * The Fighter's and the Rogue's entries both say "You have no spell
 * casting abilities but must select a magical tradition at 1st level" —
 * so a tradition is NOT the test, and neither is the caster-level cell
 * now that it reads 0. The six casting classes each carry a "Magical
 * Ability Score" paragraph ("You add your X to your Spellcraft bonus and
 * as a static bonus to your PP"); the two non-casters carry none, and
 * leave `magicalAbility` empty.
 *
 * That paragraph is the thing that grants the ability bonus, so it is
 * the thing asked about.
 *
 * @param {object|null} progression The class's `system` block.
 * @returns {boolean}
 */
export function classCasts(progression) {
  return Boolean(String(progression?.magicalAbility ?? "").trim());
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The class item a character is wearing.
 *
 * One class per character. The sheet warns when a second is added — the
 * same "one of" latitude race and heritage get, and `class` was added to
 * that list in 3.203.0 for exactly this reason — so the first is the
 * answer rather than an error.
 */
export function classItemOf(actor) {
  for (const item of actor?.items ?? []) {
    if (item?.type === "class") return item;
  }
  return null;
}

/**
 * The row for a given level, or null if the class carries no table.
 *
 * Levels above the printed table clamp to the last row rather than
 * falling off it — "1 to 20 (and possibly beyond)" is the book's own
 * phrasing, and a level-21 Fighter losing every point of BAB would be a
 * far worse answer than one whose table stopped advancing. The clamp is
 * reported so the sheet can say so rather than quietly pretending.
 *
 * @param {object} classItem An item document or a plain object.
 * @param {number} level The character's level.
 * @returns {{row: object, capped: boolean}|null}
 */
export function progressionRow(classItem, level) {
  const rows = classItem?.system?.progression;
  if (!Array.isArray(rows) || !rows.length) return null;

  // Below 1st there is no answer at all, rather than the 1st-level row.
  // `identity.classBonus` gives 0 below level 1, and a level-0 NPC
  // carrying a class item should not be handed a 1st-level Fighter's BAB,
  // saves and twelve hit points a level while its class bonus reads 0.
  const wanted = Math.floor(Number(level) || 0);
  if (wanted < 1) return null;

  // Matched on the row's OWN level rather than by array position. A table
  // authored from level 2, or with a row missing, would otherwise return
  // the wrong row and be impossible to spot: every number would be one
  // level out and all of them would look plausible.
  const exact = rows.find((row) => Number(row?.level) === wanted);
  if (exact) return { row: exact, capped: false };

  const highest = rows.reduce(
    (best, row) => (Number(row?.level) > Number(best?.level) ? row : best),
    rows[0]
  );
  if (wanted > Number(highest?.level ?? 0)) return { row: highest, capped: true };

  // Below the table's own floor, or a gap in the middle: no answer, and
  // saying so leaves the manual fields in charge.
  return null;
}

/**
 * Everything the class contributes at this level, resolved once.
 *
 * Returns null when there is no class or no table — which is the signal
 * every consumer uses to fall back to the manual fields, so a world that
 * has not installed class data behaves exactly as it did before.
 *
 * @param {object|null} classItem
 * @param {number} level
 * @returns {object|null}
 */
export function resolveClassProgression(classItem, level) {
  const found = progressionRow(classItem, level);
  if (!found) return null;
  const { row, capped } = found;

  const resolved = {
    source: String(classItem?.name ?? "Class"),
    classType: String(classItem?.system?.classType ?? ""),
    level: Math.max(1, Math.floor(Number(level) || 0)),
    rowLevel: toNumber(row.level),
    capped,
    // Per level, before Constitution / Intelligence respectively.
    hitPoints: toNumber(classItem?.system?.hitPoints),
    skillPoints: toNumber(classItem?.system?.skillPoints),
    // The ability added to the printed skill-point figure.
    //
    // Chapter 3 prints "N + Int per level" for all eight player classes,
    // so this was Intelligence everywhere and hard-coded as such. The
    // Creature Codex prints its creature classes in the same grammar but
    // does NOT always use Intelligence — a standard Animal is "2 + Wis
    // per level", which has to be a different ability rather than a
    // different number, because every animal has an Intelligence penalty
    // deep enough to zero the budget out. An animal companion is the
    // same rule with a higher base: 4 + Wis.
    //
    // Blank means Intelligence, so all eight class items are unchanged
    // and nothing needs migrating.
    skillPointAbility: String(classItem?.system?.skillPointAbility ?? ""),
    tradition: String(classItem?.system?.magicalTradition ?? ""),
    magicalAbility: String(classItem?.system?.magicalAbility ?? ""),
    // "Instinctive" or "learned" (Chapter 9's two caster styles), fixed
    // by the class the same way the tradition is; "" for a non-caster.
    // Read by the Magic tab's Repertoire card and Magical Discovery.
    casterStyle: String(classItem?.system?.casterStyle ?? ""),
    // The learned caster's own pool shape ("list" — blanket tradition
    // access; "book" — the Wizard's restricted, growing Spell Book) and
    // its two printed allowances (3.225.0). "" / 0 for anything that
    // isn't a learned caster.
    memorisationStyle: String(classItem?.system?.memorisationStyle ?? ""),
    cantripsPerDay: toNumber(classItem?.system?.cantripsPerDay),
    // The OTHER cantrip number, and not a synonym for the one above: how
    // many this class learns permanently, versus how many it prepares
    // each day. Zero for all three learned casters, 2 for the Bard.
    cantripsKnown: toNumber(classItem?.system?.cantripsKnown),
    spellBookFirstPicks: toNumber(classItem?.system?.spellBookFirstPicks)
  };

  for (const column of PROGRESSION_COLUMNS) {
    resolved[column] = NULLABLE_COLUMNS.includes(column)
      ? toNumberOrNull(row[column])
      : toNumber(row[column]);
  }

  return resolved;
}

/**
 * Maximum power points: your own base, plus your class's PP column, plus
 * your magical ability score.
 *
 * Every caster entry in Chapter 3 repeats that last clause in the same
 * words — "you add your Con to your Spellcraft bonus and as a static
 * bonus to your PP" — so it is one rule, not six.
 *
 * `base` is the STORED half and belongs to the character: the Magic tab
 * edits it, the eight stored-delta grants write into it (racial PP, Aura
 * of Power, the Knight feats, Lay Healer), and the Universal Modifier
 * engine treats it as a field. The maximum is derived from it, which is
 * why none of those may write the maximum directly.
 *
 * A class with no PP column contributes nothing AND adds no ability
 * bonus: that is every non-caster and every NPC, whose maximum is exactly
 * the base they always had. `abilityScore` is the score for the RESOLVED
 * casting ability, not the class's declared one — Charismatic Caster
 * switches it and promises the power points move with it.
 *
 * Exported so the actor and the harness share one formula rather than two
 * copies that agree until one of them is edited.
 */
export function powerPointMax(base, progression, abilityScore) {
  const table = progression?.pp ?? null;
  // IT ADDS WHAT IT IS GIVEN, and decides nothing (3.558.1). Whether
  // there is an ability bonus at all is a question about the character's
  // TRADITION, which this function cannot see — see
  // `powerPointAbilityBonus`, which is where that rule went and where a
  // check can drive it.
  //
  // This function held the gate twice and got it wrong both ways round.
  // Through 3.557.0 it asked whether the PP cell was blank; at 3.558.0 it
  // asked whether the class casts. Graham, 16 September 2026: "Magical
  // Tradition should always add the appropriate ability score to PP (even
  // if the character is not a caster)." Neither question was the right
  // one, and a gate in two places is how one of them stays wrong.
  return Math.max(0, (Number(base) || 0) + (table ?? 0) + (Number(abilityScore) || 0));
}

/**
 * The ability score a magical tradition adds to Power Points.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 16 September 2026: "Magical Tradition should always
 * add the appropriate ability score to PP (even if the character is not
 * a caster)."
 *
 * THE TRADITION GRANTS IT, NOT THE CLASS. That is why the Fighter's and
 * the Rogue's entries both say "You have no spell casting abilities BUT
 * MUST SELECT A MAGICAL TRADITION AT 1ST LEVEL" — the tradition is not
 * decoration on a non-caster, it is what they get from picking one.
 *
 * SPELLCRAFT HAS WORKED THIS WAY ALL ALONG, which is what makes the old
 * behaviour a plain inconsistency rather than a reading. `spellcraft
 * .ability` is assigned from the resolved casting ability with no gate at
 * all, so a Fighter who picked Arcane has always added its Intelligence
 * to Spellcraft — and had it refused on the PP line beside it.
 *
 * THE BOOK ONLY STATES IT IN THE SIX CASTING CLASSES' ENTRIES ("You add
 * your Con to your Spellcraft bonus and as a static bonus to your PP"),
 * and page 234's tradition table gives each tradition's ability without
 * saying what to do with it. So a future reader WILL find this gap again.
 * It is Graham's ruling that closes it; do not re-gate this on the class.
 *
 * @param {object} options
 * @param {string} options.tradition The character's chosen tradition.
 * @param {number} options.abilityTotal The RESOLVED casting ability's
 *   total — the tradition's own, unless the class or a feat replaced it.
 * @returns {number}
 */
export function powerPointAbilityBonus({ tradition = "", abilityTotal = 0 } = {}) {
  // NO TRADITION, NO BONUS. Every character who has picked one gets it;
  // a monster, an NPC or a half-built sheet that has not picked one adds
  // nothing, rather than silently adding the schema's default ability.
  if (!String(tradition ?? "").trim()) return 0;
  return Number(abilityTotal) || 0;
}

/**
 * Skill points for one level — the printed "N + Int per level".
 *
 * Floored at 0, not at 1. Chapter 3 states no minimum, and inventing one
 * here would be this module quietly writing a rule rather than reading
 * it; a negative count is meaningless arithmetic, so that much is
 * clamped and no more. If the book turns out to have a floor elsewhere,
 * this is the one line to change.
 */
export function skillPointsPerLevel(perLevel, intelligence, bonus = 0) {
  // `bonus` is the third term: what a racial ability or feat adds on top
  // of the class's printed figure and Intelligence. The Human's Skilled
  // is the only one in the book, and without this term it did nothing —
  // a Human read exactly the same points a level as anybody else.
  return Math.max(0, toNumber(perLevel) + toNumber(intelligence) + toNumber(bonus));
}

/* ==================================================================== *
 * THE CLASS'S MINIMUM ABILITY SCORE (page 43)
 *
 * "These are the most commonly helpful ability scores for this class and
 * also ONE ABILITY SCORE HAS A MINIMUM REQUIREMENT." Every class entry
 * prints that as its key-abilities line, requirement first:
 *
 *   Bard      Charisma (min +2), Dexterity, Intelligence
 *   Fighter   Strength or Dexterity (min +2), Constitution
 *
 * Until 3.554.0 the line was stored as free text and read by nobody. Its
 * own tooltip said so — "Guidance for the player — not enforced" — so a
 * Bard with Charisma +0 was built, played and levelled with nothing
 * anywhere mentioning it.
 *
 * GRAHAM'S RULING, 15 September 2026 (audit of pages 41–50, R1): option
 * B, WARN AND NEVER REFUSE. Refusing was on the table — it is what the
 * identity lock does to a second background — and was not taken, for a
 * reason the warning itself has to carry: ability scores MOVE. The Level
 * Table grants an increase at 3rd level and every third level after, so
 * a requirement missed at 1st can be met later, and a GM may allow a
 * character who never meets it at all. A refusal would make the system
 * the judge of something the book leaves to the table.
 * ==================================================================== */

/** "(min +2)", "(min 2)", "(min -1)" — the bracket the book prints. */
const MINIMUM_PATTERN = /\(\s*min\s*([+-]?\d+)\s*\)/i;

/** What the book puts between two abilities that each satisfy one requirement. */
const EITHER_PATTERN = /\s+or\s+|\s*\/\s*/i;

const signed = (value) => `${Number(value) >= 0 ? "+" : ""}${Number(value)}`;

/**
 * The requirement a printed key-abilities line states, or null.
 *
 * REFUSES RATHER THAN GUESSES, and that is the whole design. The subject
 * is whatever sits between the previous comma and the bracket, so the
 * Druid's printed line as it stood before Graham's errata of 15
 * September 2026 — "Constitution, (min +2), Dexterity, Wisdom", with the
 * comma INSIDE the requirement — leaves that subject empty. An empty or
 * unrecognised subject returns null, and a null means no warning at all.
 * Warning a Druid about an ability the line never named would be worse
 * than the silence this replaces, and a class whose line is malformed is
 * exactly where a guess would look most confident.
 *
 * @param {string} line `system.keyAbilityScores`, verbatim.
 * @returns {{abilities: string[], minimum: number, label: string}|null}
 */
export function classAbilityRequirement(line) {
  const text = String(line ?? "");
  const match = MINIMUM_PATTERN.exec(text);
  if (!match) return null;
  const minimum = Number(match[1]);
  if (!Number.isFinite(minimum)) return null;

  const before = text.slice(0, match.index);
  const subject = before.slice(before.lastIndexOf(",") + 1);
  const names = subject.split(EITHER_PATTERN).map((part) => part.trim()).filter(Boolean);
  if (!names.length) return null;

  const abilities = [];
  for (const name of names) {
    const key = ATTRIBUTE_KEYS.find((k) => k === name.toLowerCase());
    // One unreadable name refuses the WHOLE line rather than the system
    // warning about the half it happened to understand.
    if (!key) return null;
    abilities.push(key);
  }
  return {
    abilities,
    minimum,
    label: abilities.map((key) => ATTRIBUTE_LABELS[key] ?? key).join(" or ")
  };
}

/**
 * The six ability scores as the sheet shows them.
 *
 * TOTALS, not bases. A player can only act on the number in front of
 * them, so a warning computed from a different one would be a warning
 * they cannot clear — a Dwarf Druid whose racial Constitution meets the
 * requirement would be told it does not.
 */
export function abilityScoresOf(actor) {
  const scores = {};
  for (const key of ATTRIBUTE_KEYS) {
    scores[key] = Number(actor?.system?.attributes?.[key]?.total ?? 0);
  }
  return scores;
}

/**
 * How far below its class's printed minimum a character is, or null when
 * they meet it, when the class states none, or when the line cannot be
 * read.
 *
 * "Strength or Dexterity (min +2)" is satisfied by EITHER, so the better
 * of the two decides and is the one the message names.
 */
export function classMinimumShortfall(classItem, scores = {}) {
  const requirement = classAbilityRequirement(classItem?.system?.keyAbilityScores);
  if (!requirement) return null;
  const held = requirement.abilities.map((key) => ({
    key, value: Number(scores?.[key] ?? 0)
  }));
  const best = held.reduce((a, b) => (b.value > a.value ? b : a), held[0]);
  if (best.value >= requirement.minimum) return null;
  return {
    className: String(classItem?.name ?? "This class").trim() || "This class",
    abilities: requirement.abilities,
    label: requirement.label,
    minimum: requirement.minimum,
    held: best.value,
    heldKey: best.key,
    heldLabel: ATTRIBUTE_LABELS[best.key] ?? best.key
  };
}

/**
 * The sentence, in ONE place — the notification when the class is added
 * and the banner on the sheet are the same words, so a player who
 * dismissed the first still has the second to read.
 *
 * It says it is guidance and names the way out, because a warning a
 * player cannot act on is noise they learn to ignore.
 */
export function classMinimumWarning(shortfall) {
  if (!shortfall) return "";
  const yours = shortfall.abilities.length > 1
    ? `your best is ${shortfall.heldLabel} ${signed(shortfall.held)}`
    : `yours is ${signed(shortfall.held)}`;
  return `${shortfall.className} expects ${shortfall.label} ${signed(shortfall.minimum)}; ` +
    `${yours}. The class entry prints that as a minimum requirement, but it is guidance ` +
    `rather than a restriction — your GM decides, and an ability increase at 3rd level and ` +
    `every third level after can meet it later.`;
}
