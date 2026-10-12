/**
 * HIGH MAGIC (3.633.0; Fiends & Fables 3.0 block 3, ruling R12 — Graham,
 * 11 October 2026). The bestiary's stat-block rules, page 4:
 *
 *   "Some of the creatures with casting abilities in this game will use High
 *    Magic … use the following guidelines to apply High Magic to a creature:
 *      Can select spells from any tradition
 *      All casting DCs are increased by 2
 *      All spells gain the benefit of the Heighten feat for no extra PP cost
 *      All Spell Fumble checks gain a +50 modifier"
 *
 * Declared on the actor: `flags.trg-prime.highMagic = true`. The first line
 * is about which spells a creature was GIVEN, so it is the author's, not the
 * cast's. The other three are read by the cast:
 *
 *   - the spell's save DC +2 — but not on top of a PRINTED innate DC
 *     (innate-printed.mjs), which is already the creature's finished number;
 *   - Heighten's save-DC reading ("treats the PP of the spell for Saving
 *     Throw DC purposes as the maximum PP that you can cast"), free;
 *   - +50 on the Spell Fumble roll (higher is worse on that table).
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";

const HIGH_MAGIC_SAVE_DC = 2;
const HIGH_MAGIC_FUMBLE = 50;

/** Does this actor cast with High Magic? */
function isHighMagic(actor) {
  return actor?.flags?.[SYSTEM_ID]?.highMagic === true;
}

/** The save DC step High Magic adds to this cast (0 on a printed DC). */
export function highMagicSaveStep(actor, { printed = false } = {}) {
  return isHighMagic(actor) && !printed ? HIGH_MAGIC_SAVE_DC : 0;
}

/** Heighten's save reading, free under High Magic. */
export function highMagicHeightens(actor, chosen = false) {
  return Boolean(chosen) || isHighMagic(actor);
}

/** The Spell Fumble modifier High Magic adds. */
export function highMagicFumble(actor) {
  return isHighMagic(actor) ? HIGH_MAGIC_FUMBLE : 0;
}
