/**
 * SPELL-GRANTED RUNES (3.523.0) — a potency rune lent to an item for the
 * duration of a spell, and taken back when the spell ends.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FIVE SPELLS SAY IT AND NONE OF THEM DID ANYTHING.
 *
 *   Magic Weapon     "The item gains the benefits of a Potency I weapon
 *                     rune for the duration of the spell."
 *   Shillelagh       "...gaining the benefit of a temporary Potency I rune."
 *   Magic Vestment   "...granting it the effects of a Potency I rune."
 *   Magic Jaws       "The chosen unarmed attack becomes imbued with a
 *                     Potency I Rune."
 *   Eldritch Weapon  "+2 PP: the weapon is infused with a potency I rune."
 *
 * All five carry `effects: []`. The spells cast, spent PP and posted a
 * card that described a rune nobody received — and each carries a warp
 * ("increase the Potency of the rune by one step, max III/IV") that was
 * therefore inert twice over: it stepped a rune that was never applied.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOT ONE LINE OF RUNE MACHINERY HAD TO BE WRITTEN, which is the same
 * sentence `feats-workflow` wrote about Blade Ally at 3.330.0 and it is
 * true again for the same reason. `runes.mjs` already parses the field,
 * takes the highest tier when a rune is named twice, and computes the
 * attack and damage bonuses; `rune-effects.mjs` already turns them into
 * numbers the attack workflow reads. Writing `system.runes` is the whole
 * mechanism.
 *
 * SO THIS FILE IS THE ARITHMETIC AROUND THAT FIELD AND NOTHING ELSE. It
 * is pure and takes FIELDS AND PLAIN OBJECTS rather than documents, the
 * same arrangement `runes.mjs` and `crusader.mjs` use, so the harness can
 * drive every rule in it without a world.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE DECISIONS, AND WHERE EACH COMES FROM.
 *
 * 1. A BETTER RUNE IS NOT MADE WORSE. A sword carrying a bought Potency
 *    III does not drop to I because Magic Weapon landed on it. This is
 *    `bladeAllyRuneField`'s rule verbatim — "writing a worse duplicate
 *    into stored data is not" harmless — and the reason is the same:
 *    `parseRunes` would take the higher anyway, so the append changes no
 *    answer while making the stored field a lie.
 *
 * 2. A WORSE RUNE IS RAISED, and this is where a spell differs from the
 *    ally. Blade Ally grants property runes, of which an item has at most
 *    one of each; potency is a LADDER, and a warped Magic Weapon granting
 *    Potency III to a Potency I sword is exactly what the player paid
 *    8 PP for. `parseRunes` takes the highest of two entries naming one
 *    rune, so appending ours beside theirs is both correct and reversible.
 *
 * 3. THE FIELD IS RESTORED BY WRITE-BACK, NEVER BY SUBTRACTION. The
 *    previous field is stored verbatim when the spell lands and written
 *    back when it ends. Subtracting our entry instead would strip a rune
 *    the PLAYER added while the spell was running, and would silently do
 *    the wrong thing if they added a potency rune of their own. Again
 *    Blade Ally's, and it was learned there rather than here.
 */

import { parseRunes, roman, isPotency } from "../runes.mjs";
import { runeRestrictions } from "../magic-item-tables.mjs";
import { isNaturalAttack, isUnarmedAttack } from "../combat/unarmed.mjs";

/** The tier every one of these spells grants before any warp. */
export const SPELL_POTENCY_BASE = 1;

/** The label the rune is written under. `parseRunes` knows this name. */
const POTENCY_LABEL = "Potency";

const int = (v) => Math.trunc(Number(v) || 0);

/**
 * The tier this cast actually grants, after warps and after the ceiling.
 *
 * THE CAP IS A CAP AND NOT A COUNT. A player who buys four steps on a
 * "max IV" warp has bought one too many, and the ceiling is what the
 * sentence says — so the extra step buys nothing rather than erroring.
 * `potencyStepMaxTimes` is what stops it being offered in the first
 * place; this is the second of the two, because a mod can also arrive
 * from a macro or a fix.
 *
 * @param {object} warpMods aggregated warp mods
 * @param {number} cap the printed ceiling
 * @param {number} base the tier the spell grants unwarped
 * @returns {number}
 */
export function spellPotencyTier(warpMods = {}, cap = null, base = SPELL_POTENCY_BASE) {
  const start = Math.max(1, int(base) || SPELL_POTENCY_BASE);
  const steps = Math.max(0, int(warpMods?.potencyStep));
  const ceiling = int(cap) > 0 ? int(cap) : start + steps;
  return Math.min(start + steps, ceiling);
}

/**
 * How many times the step warp may be bought.
 *
 * @param {number} cap the printed ceiling
 * @param {number} base the tier the spell grants unwarped
 * @returns {number} zero when the spell already grants the ceiling
 */
export function potencyStepMaxTimes(cap, base = SPELL_POTENCY_BASE) {
  const start = Math.max(1, int(base) || SPELL_POTENCY_BASE);
  const ceiling = int(cap);
  // NO GUARD FOR A MISSING CAP returning something large and arbitrary.
  // `Math.max(0, ...)` already answers it: a null cap is 0, which is
  // "cannot be bought", and a warp with no printed ceiling is not one of
  // these warps. Every one of the five prints one.
  return Math.max(0, ceiling - start);
}

/** The potency tier an item's field already carries, or 0. */
function currentPotency(field) {
  const held = parseRunes(field).find((r) => isPotency(r.key));
  return held ? Math.max(0, int(held.tier)) : 0;
}

/**
 * The highest potency tier this item can hold, whatever the source.
 *
 * GRAHAM'S RULING, 8 September 2026, after live testing 3.523.0 read back
 * a warped Magic Weapon that had written `Potency III` onto a standard
 * Battle Axe and been given Potency I by the rune chapter:
 *
 *   "Yes — the item can't hold it."
 *
 * SO THIS IS NOT AN ETCHING RULE. The two restrictions Blade Ally bypasses
 * — needing a potency rune beneath, and the item's additional-rune
 * allowance — are about buying a rune and having it inscribed at an anvil,
 * and a spirit inhabiting a blade for a day does neither. The QUALITY
 * CEILING is a third rule and a different kind: it is a fact about the
 * weapon, not about how the rune got there. A crude axe cannot hold that
 * much magic whether it was etched, loaned by a deity, or conjured for ten
 * minutes by a cantrip.
 *
 * READ OFF `runeRestrictions`, the same table the item sheet and the
 * magic-item builder read, so the spell and the anvil can never disagree
 * about what a weapon will take.
 *
 * @param {string} kind weapon | armour | shield
 * @param {string} quality the item's own quality
 * @returns {number} the ceiling, always at least 1
 */
export function itemPotencyCeiling(kind, quality) {
  // NO `Math.max(1, …)` FLOOR ON THE WAY OUT. The first draft had one, and
  // `mutate-spell-rune` Q5 showed it decided nothing: `runeRestrictions`
  // ends with `table[key] ?? table.normal`, so it always returns a row, and
  // every row in both tables prints a positive `maxPotency`. An unknown
  // quality already lands on the normal row and comes back as 1.
  //
  // THE THIRTEENTH DEAD GUARD, deleted rather than defended. Section Q of
  // the check still pins the ANSWER for an unreadable quality, because what
  // must stay true is the number and not the branch that used to floor it.
  return int(runeRestrictions(kind, quality)?.maxPotency);
}

/** weapon | armour | shield, from an item's type. */
export function runeKindOf(item) {
  const t = String(item?.type ?? "").toLowerCase();
  return t === "armour" || t === "shield" ? t : "weapon";
}

/**
 * The tier that actually lands, once the item has had its say.
 *
 * THE PURCHASE IS NOT REFUNDED AND THE CARD MUST SAY SO. The item is
 * chosen AFTER the warp is bought — the chooser cannot know which weapon
 * is coming — so a player can buy three steps and hand them to a standard
 * axe that takes one. Silently writing `Potency III` is what 3.523.0 did,
 * and the rune chapter then read it as I while flagging the weapon as
 * carrying an invalid configuration. Naming the ceiling on the card is the
 * least a player is owed for the PP.
 *
 * @param {number} tier the tier bought
 * @param {number} ceiling the item's ceiling
 * @returns {number}
 */
export function landedTier(tier, ceiling) {
  const want = Math.max(0, int(tier));
  const cap = int(ceiling);
  // NO GUARD FOR A MISSING CEILING. `itemPotencyCeiling` never returns
  // less than 1, and a zero here means "no ceiling known", for which the
  // bought tier is the right answer — `Math.min` with a falsy cap would
  // silently grant nothing instead.
  return cap > 0 ? Math.min(want, cap) : want;
}

/** How many bought steps the item could not hold. */
export function stepsLost(tier, ceiling) {
  return Math.max(0, Math.max(0, int(tier)) - landedTier(tier, ceiling));
}

/**
 * The `runes` field to store when the spell lands.
 *
 * Returns the field UNCHANGED when the item already carries a potency
 * rune of this tier or better — see decision 1 in the header. The caller
 * can tell that case from a change by comparing, and `spellRuneOutcome`
 * gives it a name so two callers cannot describe it differently.
 *
 * @param {string} field the item's current `system.runes`
 * @param {number} tier the tier this cast grants
 * @returns {string}
 */
export function spellRuneField(field, tier) {
  const current = String(field ?? "").trim();
  const want = Math.max(0, int(tier));
  if (!want) return current;
  if (currentPotency(current) >= want) return current;
  const addition = `${POTENCY_LABEL} ${roman(want)}`;
  return current ? `${current}, ${addition}` : addition;
}

/**
 * What happened, named — so the card and the check agree.
 *
 * @param {string} field the item's field before the spell
 * @param {number} tier the tier this cast grants
 * @returns {{outcome: "granted"|"raised"|"redundant", from: number, to: number}}
 */
export function spellRuneOutcome(field, tier) {
  const from = currentPotency(field);
  const to = Math.max(0, int(tier));
  if (from >= to) return { outcome: "redundant", from, to };
  return { outcome: from ? "raised" : "granted", from, to };
}

/**
 * Is this item one the spell may land on?
 *
 * TAKES A PLAIN OBJECT, not an Item document, so the harness can drive it
 * — `{type, name, system: {category, traits, natural, unarmed, equipped}}`
 * is all it reads.
 *
 * `kinds` NAMES THE ITEM TYPES the spell's own sentence allows: Magic
 * Weapon and Shillelagh touch a weapon, Magic Vestment "a suit of armour
 * or a shield", Magic Jaws "one of the target's unarmed attacks".
 *
 * NATURAL ATTACKS ARE NOT WEAPONS (3.576.0). Page 166: "natural attacks
 * are not weapons and abilities and effects that work with weapons do not
 * work with natural attacks." Magic Weapon and Shillelagh offered the
 * Bite, the Claw and the Unarmed Strike, because all three are `weapon`
 * items. A gauntlet is still offered: it is an unarmed attack AND a
 * weapon. Magic Jaws, the one spell FOR unarmed attacks, is unchanged —
 * and now reaches a gauntlet too, through the shared rule.
 *
 * `limits` CARRIES WHAT THE SPELL'S TARGET LINE NAMES beyond a kind.
 * Shillelagh: "1 club or staff you hold" — `names` and `heldOnly`.
 *
 * @param {object} item
 * @param {string[]} kinds item types the spell accepts
 * @param {boolean} unarmedOnly restrict to unarmed attacks (Magic Jaws)
 * @param {{names?: string[], heldOnly?: boolean}} [limits]
 * @returns {boolean}
 */
function runeItemEligible(item, kinds = [], unarmedOnly = false, limits = {}) {
  const type = String(item?.type ?? "").toLowerCase();
  if (!kinds.map((k) => String(k).toLowerCase()).includes(type)) return false;
  if (unarmedOnly) return isUnarmedAttack(item?.system);
  if (type === "weapon" && isNaturalAttack(item?.system)) return false;
  if (limits?.heldOnly === true && !item?.system?.equipped) return false;
  return itemNameAllowed(item, limits?.names);
}

/**
 * Does the item's name match one the spell names? No list means any.
 *
 * WHOLE WORDS, so "Staff" finds a Staff and a "Masterwork Club" and not a
 * Greatclub — a greatclub is not a club, and Shillelagh names the two.
 */
function itemNameAllowed(item, names) {
  const wanted = (Array.isArray(names) ? names : [])
    .map((n) => String(n ?? "").trim())
    .filter(Boolean);
  if (!wanted.length) return true;
  const name = String(item?.name ?? "");
  return wanted.some((word) =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(name));
}

/** Every item the spell may be offered, in the order given. */
export function eligibleRuneItems(items, kinds = [], unarmedOnly = false, limits = {}) {
  return (Array.isArray(items) ? items : [])
    .filter((i) => runeItemEligible(i, kinds, unarmedOnly, limits));
}

/**
 * The card line. Names the item, the tier, and — when there was one — the
 * rune that was already better, because a player who paid 6 PP and saw no
 * change to their sword is owed the reason.
 *
 * @param {string} itemName
 * @param {{outcome: string, from: number, to: number}} outcome
 * @returns {string}
 */
export function spellRuneLine(itemName, outcome) {
  const who = String(itemName ?? "The item").trim() || "The item";
  const to = `${POTENCY_LABEL} ${roman(Math.max(1, int(outcome?.to)))}`;
  if (outcome?.outcome === "redundant") {
    return `<strong>${who}</strong> already carries ${POTENCY_LABEL} `
      + `${roman(int(outcome.from))}, which is better than the ${to} this spell `
      + `grants — the spell has no further effect on it.`;
  }
  if (outcome?.outcome === "raised") {
    return `<strong>${who}</strong> is raised from ${POTENCY_LABEL} `
      + `${roman(int(outcome.from))} to <strong>${to}</strong> for the duration.`;
  }
  return `<strong>${who}</strong> bears a <strong>${to}</strong> rune for the duration.`;
}

/**
 * The sentence that says the item could not hold what was bought.
 *
 * NAMED, NUMBERED, AND NOT AN APOLOGY. It says the quality, the ceiling
 * and how many steps were lost, because the player spent PP on those steps
 * and "nothing happened" is what 3.523.0 said. Returns null when nothing
 * was lost, so the caller adds a line only when there is one to add.
 *
 * @param {string} itemName
 * @param {string} quality the item's own quality
 * @param {number} bought the tier the warps paid for
 * @param {number} ceiling the item's ceiling
 * @returns {string|null}
 */
export function ceilingLine(itemName, quality, bought, ceiling) {
  const lost = stepsLost(bought, ceiling);
  if (!lost) return null;
  const who = String(itemName ?? "The item").trim() || "The item";
  const q = String(quality ?? "").trim().toLowerCase() || "standard";
  return `<em><strong>${who}</strong> is ${q} quality and takes ${POTENCY_LABEL} `
    + `${roman(int(ceiling))} at most, so ${lost === 1 ? "one step" : `${lost} steps`} `
    + `of the ${roman(Math.max(1, int(bought)))} you paid for could not land. `
    + `A better item would hold them.</em>`;
}

/**
 * Does this cast change the item at all?
 *
 * The flag, the stored previous field and the restore are all skipped
 * when it does not — a spell that changed nothing must not leave a record
 * claiming it did, because that record is what a later expiry writes
 * back.
 */
export function runeLoanChangesItem(field, tier) {
  return spellRuneField(field, tier) !== String(field ?? "").trim();
}

/**
 * The field to write back when the spell ends.
 *
 * IT IS THE STORED ONE, VERBATIM — see decision 3. This function exists
 * so that the rule has a name and a check, not because the arithmetic is
 * hard: a restore that ever becomes cleverer than this is a bug, and a
 * named rule is what a mutation can be pointed at.
 *
 * @param {string} previous the field as it stood before the spell
 * @returns {string}
 */
export function restoredRuneField(previous) {
  return String(previous ?? "");
}

/**
 * Was this loan recorded by a cast that is still the one ending?
 *
 * A SECOND CAST ONTO THE SAME ITEM MUST NOT ORPHAN THE FIRST'S RECORD.
 * Magic Weapon cast twice on one sword stores `previousRunes` twice, and
 * if the second store captured the field WITH the first spell's rune in
 * it, the first spell expiring would write that back and leave the rune
 * behind for good. The loan record is therefore keyed by cast, and a
 * fresh loan onto an item that already carries one restores first.
 *
 * @param {object} loan the stored `{castId, previousRunes}` record
 * @param {string} castId the cast that is ending
 * @returns {boolean}
 */
export function loanBelongsTo(loan, castId) {
  return Boolean(loan) && Boolean(castId) && loan.castId === castId;
}
