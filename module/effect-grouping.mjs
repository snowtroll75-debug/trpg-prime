/**
 * Which table an effect belongs in on the Effects tab.
 *
 * NEW at 3.383.0.
 *
 * WHY THIS EXISTS, and it is not the reason it was asked for. Graham's
 * brief was that *"any effects, regardless of where they come from, all
 * appear on the effects tab"*, and that the permanent ones from race,
 * class and heritage should move to a second, hidden table.
 *
 * Measured on his own world, the premise is inverted. The tab is built
 * from `actor.effects` — effects embedded on the ACTOR — and renders
 * THREE rows for Borin Slatevein while SEVENTEEN effects act on him. The
 * permanent ones live on their parent items and reach him by
 * `transfer: true`; they were never on the tab to move. Building the
 * second table and hiding it would have hidden an empty table.
 *
 *   character            rows shown   applied   on items
 *   Veyra                     4          21        18
 *   Borin Slatevein           3          17        15
 *   Throngar Redtusk          2          18        16
 *   Keldran Greytrail         1          14        13
 *
 * So the defect is the opposite one: the tab UNDER-REPORTS, and a player
 * cannot see most of what is modifying their character. It gets worse
 * with level, because feats carry effects too.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE GROUPING MAY NOT KEY ON
 *
 * NOT WHERE THE DOCUMENT LIVES. Six effects in the world sit on the
 * ACTOR and come from a feat — grant workflows create them directly
 * rather than relying on transfer. Grouping by location alone files
 * those as transient and offers them a delete button.
 *
 * NOT DURATION. Probed across all 140 effects in the world, every single
 * one reported as timed — including *Dwarf: ability modifiers*. Either
 * Foundry populates the duration object by default or the probe was
 * wrong. Recorded rather than worked around, because duration is the
 * signal anybody would reach for first.
 *
 * NOT `featNote` / `featPassive`. Both appear only in pack data and in
 * comments: NO CODE ANYWHERE READS EITHER. They are metadata nothing
 * maintains, and they already disagree with reality on 3 of 132 —
 * Dengar and two Dragon Advancements are flagged as passive mechanics
 * while carrying no changes at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND "HAS NO CHANGES" DOES NOT MEAN "DOES NOTHING"
 *
 * Chasing those three disagreements turned up a FOURTH delivery route.
 * Dengar's effect carries no changes and is not inert: it holds
 * `specialtyGrant: {skill: "crafting", count: 1}`, which
 * `specialtyGrantCount` reads to raise a cap — a specialty slot waiting
 * to be spent. Keldran having no crafting specialty is correct, not a
 * bug.
 *
 * This is the feat-evidence lesson landing on the sheet: a tool that can
 * only see one mechanism reports every other mechanism as nothing. So
 * `isMechanical` counts flag-borne routes as well as `changes`, and
 * MECHANICAL_FLAGS below is the list it knows about. **Any route found
 * missing later is added there and recorded in this comment**, the way
 * feat-evidence.mjs records its three misses.
 */

/** Item types whose effects define the character rather than happen to it. */
const PERMANENT_ITEM_TYPES = Object.freeze([
  "race", "heritage", "background", "class", "creature-type", "ability", "feat"
]);

/**
 * Effect flags that deliver a mechanic WITHOUT a `changes` entry.
 *
 * Routes known so far. `specialtyGrant` was found by chasing three
 * effects that claimed to be passive and appeared to change nothing.
 */
const MECHANICAL_FLAGS = Object.freeze([
  "specialtyGrant",
  "condition",
  "conditionals"
]);

/**
 * Flags that mark an effect as transient — it belongs to something that
 * happened rather than to who the character is.
 */
const TRANSIENT_FLAGS = Object.freeze([
  "spellBuff", "castId", "expiresOnDailyPrep", "conditionExpiresRound"
]);

const SYSTEM_ID = "trg-prime";

/** The system's flags on an effect, whatever shape it arrives in. */
function flagsOf(effect) {
  return effect?.flags?.[SYSTEM_ID] ?? {};
}

/**
 * Does this effect actually DO anything?
 *
 * @param {object} effect
 * @returns {boolean} False only when it changes nothing and carries no
 *   known flag-borne mechanic — i.e. it is a printed note.
 */
export function isMechanical(effect) {
  if ((effect?.changes ?? []).length > 0) return true;
  const flags = flagsOf(effect);
  return MECHANICAL_FLAGS.some((key) => {
    const value = flags[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== false;
  });
}

/**
 * Which group an effect belongs to.
 *
 * FIRST MATCH WINS, and the order is the rule. A condition is a
 * condition wherever it came from; an effect on a character-defining
 * item is permanent whatever else is true of it; and the FALLBACK IS
 * "temporary", deliberately — that group is visible and deletable, so an
 * effect nobody anticipated lands where a player can see and undo it
 * rather than being hidden away.
 *
 * @param {object} effect
 * @param {object|null} parentItem The item the effect lives on, or null
 *   when it is embedded on the actor.
 * @returns {"condition"|"permanent"|"temporary"}
 */
export function effectGroup(effect, parentItem = null) {
  const flags = flagsOf(effect);
  if (flags.condition) return "condition";
  if (parentItem) {
    return PERMANENT_ITEM_TYPES.includes(String(parentItem.type ?? "").trim())
      ? "permanent"
      : "temporary";
  }
  if (TRANSIENT_FLAGS.some((key) => flags[key] !== undefined && flags[key] !== null)) {
    return "temporary";
  }
  // THE SIX THAT WOULD OTHERWISE MISFILE.
  if (flags.featSource) return "permanent";
  return "temporary";
}

/**
 * Can a player delete this effect from the actor at all?
 *
 * AN EFFECT THAT TRANSFERS FROM AN ITEM CANNOT BE. It belongs to the
 * item, and a bin icon on that row promises something the row cannot
 * do — every one of the 132 item-borne effects in Graham's world is
 * `transfer: true`. The row should send the player to the item instead,
 * which makes the safe action the only action and removes the
 * accidental-deletion risk rather than hiding it.
 *
 * NAMING THE SOURCE MATTERS, and 3.383.2 added it after watching a real
 * row. Borin's *Enhancement: Dexterity +1* sits on the ACTOR, carries
 * `featSource`, and is a permanent +1 from his Alteration wizard school.
 * It warned — correctly — with "granted by something you hold", while
 * the something was on the same sheet and could simply be named. A
 * warning a player cannot act on is only half a warning.
 *
 * `featSource` IS A MISLEADING NAME, recorded rather than renamed. On
 * Borin it points at a **wizard-school** item, not a feat. What it
 * actually means is "granted by a character-defining item", and the
 * grouping reads it that way. Renaming it would touch live data for a
 * cosmetic gain; knowing it is enough.
 *
 * @param {object} effect
 * @param {object|null} parentItem
 * @param {string|null} [sourceName] The item this was granted BY, when
 *   the caller could resolve it. Only used to make the warning specific.
 * @returns {{deletable: boolean, warn: boolean, reason: string|null}}
 */
export function effectDeletion(effect, parentItem = null, sourceName = null) {
  if (parentItem) {
    return {
      deletable: false,
      warn: false,
      reason: `This comes from ${parentItem.name ?? "an item"} — open that to change it.`
    };
  }
  const flags = flagsOf(effect);
  if (flags.grantedBy || flags.featSource) {
    const named = String(sourceName ?? "").trim();
    return {
      deletable: true,
      warn: true,
      reason: named
        ? `This was granted by ${named}. Deleting it here may not come back.`
        : "This was granted by something you hold. Deleting it here may not come back."
    };
  }
  return { deletable: true, warn: false, reason: null };
}
