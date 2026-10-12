/**
 * STARTING WEALTH — Chapter 6, ruled into place by Graham at block 2 (R3).
 *
 *   "Each character has a wealth score. This score determines your
 *    starting coin and is determined by a number of elements including
 *    charisma, background and class."
 *
 * Three contributions, added:
 *
 *   CHARISMA   — added as a bonus, and NEGATIVE MODIFIERS ARE IGNORED.
 *                A Charisma of -2 contributes 0, not -2. This is the
 *                one asymmetry in the rule and the easiest to lose, so
 *                it is a clamp of its own with its own check.
 *   BACKGROUND — the printed Background Wealth table, which runs from
 *                -2 (Barbarian, Hermit) to +2, and which for the
 *                Gambler alone is a FORMULA: 1d4-2.
 *   CLASS      — Bard 1, Cleric 2, Crusader 3, Druid 0, Fighter 3,
 *                Ranger 2, Rogue 2, Wizard 1.
 *
 * The score is then multiplied by 50 gp. It may be zero or negative:
 * "this will indicate a character who begins in debt or is indebted to
 * an employer, lord, master etc… you will have to determine the exact
 * details with your GM." So a score of 0 or less is NOT clamped and is
 * NOT paid out — it is surfaced as a table conversation, which is what
 * the book asks for.
 *
 * Why the values live on the ITEMS rather than in a table here: a world
 * can add a background, and a home-brew background with no wealth of
 * its own contributing 0 is the right failure. `system.wealth` is a
 * STRING on purpose — "1", "-2" and "1d4-2" are all valid printed
 * values and the Gambler is not a special case in the data.
 *
 * THE GAMBLER'S ROLL IS ROLLED ONCE. A formula that re-rolled every
 * time the sheet derived would make a character's starting wealth a
 * thing that changed while you looked at it. So the roll happens in the
 * item's own _preCreate — before the document exists, so there is no
 * write-from-a-hook to defer — and the result is recorded on the item
 * as `flags["trg-prime"].wealthRoll`. Everything downstream reads the
 * record, never the formula.
 *
 * Pure. No Foundry globals, so the harness can run every line of it.
 */
import { registeredClass } from "./module-api.mjs";

const SYSTEM_ID = "trg-prime";

/** Chapter 6: "this is multiplied by 50 gp". */
export const GP_PER_WEALTH_POINT = 50;

/**
 * The class table, as a fallback for a class item that carries no
 * wealth of its own — an older world's class, or one a module supplied.
 * The item's own `system.wealth` wins when it has one.
 */
export const CLASS_WEALTH = Object.freeze({
  bard: 1,
  cleric: 2,
  crusader: 3,
  druid: 0,
  fighter: 3,
  ranger: 2,
  rogue: 2,
  wizard: 1
});

/** The first item of a type, which is all a character may have. */
function firstOfType(actor, type) {
  for (const item of actor?.items ?? []) {
    if (item?.type === type) return item;
  }
  return null;
}

export function backgroundItemOf(actor) {
  return firstOfType(actor, "background");
}

export function classItemForWealth(actor) {
  return firstOfType(actor, "class");
}

/**
 * Charisma's contribution. The TOTAL is the modifier the character
 * actually has, and a negative one is ignored rather than subtracted.
 *
 * @param {object} system The actor's system data.
 * @returns {number} 0 or more.
 */
export function charismaWealth(system) {
  const cha = Math.trunc(Number(system?.attributes?.charisma?.total ?? 0) || 0);
  return Math.max(0, cha);
}

/**
 * Is this printed value a formula rather than a number?
 *
 * "-2" is a number. "1d4-2" is not. Deciding this by "does Number()
 * accept it" rather than by looking for a `d` keeps a stray "+1" or a
 * spaced " 2 " on the numeric path where it belongs.
 */
export function isWealthFormula(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return false;
  return !Number.isFinite(Number(text));
}

/**
 * What a background or class item contributes, and whether that answer
 * is settled.
 *
 * `pending: true` means the item prints a formula and no roll has been
 * recorded on it yet — the honest answer is "not yet known", not 0, and
 * the sheet says so rather than quietly showing a wrong score.
 *
 * @returns {{value: number, formula: string, pending: boolean}}
 */
export function declaredWealth(item) {
  const raw = String(item?.system?.wealth ?? "").trim();
  if (!raw) return { value: 0, formula: "", pending: false };

  if (!isWealthFormula(raw)) {
    return { value: Math.trunc(Number(raw)), formula: "", pending: false };
  }

  const recorded = item?.flags?.[SYSTEM_ID]?.wealthRoll;
  const rolled = Number(recorded);
  if (Number.isFinite(rolled) && recorded !== null && recorded !== "") {
    return { value: Math.trunc(rolled), formula: raw, pending: false };
  }
  return { value: 0, formula: raw, pending: true };
}

/**
 * Does this document need a wealth roll taken for it?
 *
 * The whole decision, in one pure place, so that the part of the rule
 * that lives inside a Foundry document hook is a call rather than a
 * paragraph of logic no harness can run. Three gates, each of which is
 * a real rule:
 *
 *   - only a background or a class carries printed wealth;
 *   - only a FORMULA is rolled, and a printed number never is;
 *   - and a document that already carries a recorded roll keeps it, so
 *     a character copied or restored keeps the wealth they were made
 *     with.
 *
 * @returns {string} The formula to roll, or "" for nothing to do.
 */
export function wealthRollNeeded(item) {
  if (!["background", "class"].includes(item?.type)) return "";
  const printed = String(item?.system?.wealth ?? "").trim();
  if (!printed || !isWealthFormula(printed)) return "";
  const recorded = item?.flags?.[SYSTEM_ID]?.wealthRoll;
  if (recorded !== undefined && recorded !== null && recorded !== "") return "";
  return printed;
}

/**
 * A class item's contribution, falling back to the printed table by
 * name when the item carries no value of its own.
 */
export function classWealth(item) {
  const declared = declaredWealth(item);
  if (String(item?.system?.wealth ?? "").trim()) return declared;

  const key = String(item?.name ?? "").trim().toLowerCase();
  if (Object.hasOwn(CLASS_WEALTH, key)) {
    return { value: CLASS_WEALTH[key], formula: "", pending: false };
  }
  const registered = registeredClass(key)?.wealth;
  if (registered !== null && registered !== undefined) {
    return { value: registered, formula: "", pending: false };
  }
  return declared;
}

/**
 * The whole rule, in one place.
 *
 * Returned as parts as well as a total, because the sheet shows the
 * working — a player who cannot see WHY their score is 4 cannot tell a
 * missing background from a Charisma the race never applied.
 *
 * @param {object} actor A character (or anything with .items and .system).
 * @returns {{score: number, gp: number, parts: object[], pending: boolean,
 *            indebted: boolean, background: object|null, klass: object|null}}
 */
export function wealthScore(actor) {
  const system = actor?.system ?? {};
  const background = backgroundItemOf(actor);
  const klass = classItemForWealth(actor);

  const cha = charismaWealth(system);
  const fromBackground = declaredWealth(background);
  const fromClass = classWealth(klass);

  const parts = [
    { label: "Charisma", value: cha, note: cha === 0 ? "negative modifiers are ignored" : "" },
    {
      label: background?.name ? `Background: ${background.name}` : "Background",
      value: fromBackground.value,
      note: fromBackground.pending ? `${fromBackground.formula} — not yet rolled`
        : fromBackground.formula ? `rolled ${fromBackground.value} on ${fromBackground.formula}` : ""
    },
    {
      label: klass?.name ? `Class: ${klass.name}` : "Class",
      value: fromClass.value,
      note: ""
    }
  ];

  const score = parts.reduce((total, part) => total + Math.trunc(Number(part.value) || 0), 0);
  const pending = fromBackground.pending || fromClass.pending;

  return {
    score,
    gp: score * GP_PER_WEALTH_POINT,
    parts,
    pending,
    // Chapter 6's own line: 0 or less is a conversation with the GM,
    // not a payout of nothing.
    indebted: score <= 0,
    background: background ?? null,
    klass: klass ?? null
  };
}

/**
 * Has this character already been paid their starting coin?
 *
 * Recorded on the ACTOR rather than inferred from their purse, because
 * a character who spent it all is not a character who was never paid.
 */
export function startingWealthGranted(actor) {
  return Boolean(actor?.flags?.[SYSTEM_ID]?.startingWealthGranted);
}

/**
 * What paying it out does to the purse: gold is added to whatever is
 * already there rather than replacing it.
 *
 * Pure, so the arithmetic is checkable without a document.
 */
export function purseAfterGrant(currency, gp) {
  const gold = Math.trunc(Number(currency?.gp ?? 0) || 0);
  return { ...currency, gp: gold + Math.max(0, Math.trunc(Number(gp) || 0)) };
}

/**
 * NEW CHARACTERS ABOVE 1ST LEVEL — Chapter 12, page 393 (3.619.0; block 38,
 * Graham's R5): "For new characters which are above 1st level, the
 * following table should be used to determine their starting wealth."
 * Level 1 is "as starting character, see chapter 6" — the wealth score
 * above. A character whose starting wealth is taken at 2nd level or higher
 * takes this figure INSTEAD of the score.
 */
const STARTING_WEALTH_BY_LEVEL = Object.freeze({
  2: 250, 3: 500, 4: 1000, 5: 2500, 6: 4000, 7: 6000, 8: 10000, 9: 15000,
  10: 22000, 11: 30000, 12: 42000, 13: 60000, 14: 85000, 15: 125000,
  16: 185000, 17: 275000, 18: 400000, 19: 600000, 20: 900000
});

/**
 * The starting wealth a character takes: the Chapter 6 score at 1st level,
 * the Chapter 12 table above it. The score's parts stay on the result, so
 * the sheet can still show them.
 *
 * @param {object} actor
 */
export function startingWealthFor(actor) {
  const score = wealthScore(actor);
  const level = Math.floor(Number(actor?.system?.identity?.level ?? 0) || 0);
  const gp = STARTING_WEALTH_BY_LEVEL[Math.min(20, level)];
  if (level < 2 || !gp) return { ...score, byLevel: false, level };
  return { ...score, byLevel: true, level, gp, pending: false, indebted: false };
}
