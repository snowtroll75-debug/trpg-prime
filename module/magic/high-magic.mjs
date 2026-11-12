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
import { registeredHighMagicRules } from "../module-api.mjs";
import { highMagicDeclaredFor } from "./class-magic.mjs";
import { forbiddenTraditionsOf, beneficialSaveTraditionsOf, traditionList } from "./tradition-gate.mjs";

const SYSTEM_ID = "trg-prime";

const HIGH_MAGIC_SAVE_DC = 2;
const HIGH_MAGIC_FUMBLE = 50;

/** Does this actor cast with High Magic? (The Fiends & Fables creature flag.) */
function isHighMagic(actor) {
  return actor?.flags?.[SYSTEM_ID]?.highMagic === true;
}

/**
 * ELDRITCH ARTS' HIGH MAGIC SUPERSEDES THIS GUIDELINE (3.678.0; Graham's M4
 * of 1 November 2026): "The rules for High Magic in Eldritch Arts supersede
 * all previously written high magic rules. If the Eldritch Arts book is not
 * used then all previous references to High Magic should be. If the
 * sourcebook is used, Eldritch arts rules should be used instead." So while
 * a module has declared its rules (`registerHighMagicRules`), the creature
 * guideline's three numbers stop: no save DC step, no free Heighten, and the
 * fumble is the sourcebook's.
 */
function supersededGuideline() {
  return Boolean(registeredHighMagicRules());
}

/** The save DC step High Magic adds to this cast (0 on a printed DC). */
export function highMagicSaveStep(actor, { printed = false } = {}) {
  return isHighMagic(actor) && !printed && !supersededGuideline() ? HIGH_MAGIC_SAVE_DC : 0;
}

/** Heighten's save reading, free under High Magic. */
export function highMagicHeightens(actor, chosen = false) {
  return Boolean(chosen) || (isHighMagic(actor) && !supersededGuideline());
}

/**
 * The Spell Fumble modifier High Magic adds.
 *
 * @param {Actor} actor
 * @param {object|null} [cast] what `highMagicCast` said of this casting, when
 *   the caller knows; without it, the actor's own standing decides.
 */
export function highMagicFumble(actor, cast = null) {
  if (cast?.highMagic) return ELDRITCH_HIGH_MAGIC_FUMBLE;
  if (!isHighMagic(actor)) return 0;
  return supersededGuideline() ? ELDRITCH_HIGH_MAGIC_FUMBLE : HIGH_MAGIC_FUMBLE;
}

/* ─────────────────────────────────────────────────────────────────────
 * ELDRITCH ARTS' HIGH MAGIC CASTING (3.678.0; Block 2, D1). Chapter 7:
 *
 *   CASTING DC "When casting a high magic spell, the Spellcraft check is
 *     Hard (+2 DC)."
 *   CASTING FOCUS "It is impossible to use a casting focus when casting high
 *     magic spells unless you possess the Arcanum birthright or have the
 *     Archmage class."
 *   CASTING IN ARMOUR "the DC of any spellcraft check increases by the
 *     armours DR bonus x4."
 *   FUMBLES "the Spell automatically fails … roll a Top Open Ended percentile
 *     dice, adding … High Magic +60, Per PP of Spell +5, Spell result is a
 *     blunder +20" — and the High Magic modifier ADDS to the tradition's
 *     (Graham's M4).
 *   RESONANCE "make the roll with disadvantage … higher is the more
 *     detrimental result … Any subsequent rolls … are rolled only once."
 *
 * Graham's rulings of 1 November 2026 on the Block 2 audit:
 *   Q2 the focus is SET ASIDE, not missing: no +1, and no −2 or +10 for
 *      casting without it — except for an Archmage, or a Sorcerer with the
 *      Arcanum birthright, who may still use it;
 *   Q3 DR × 4 on all worn armour replaces the tradition's armour rule, "but
 *      only for High Magic classes and other casters using High Magic
 *      spells" — so a Fiends & Fables creature's flag alone does not bring it;
 *   Q4 an all-traditions spell's fumble takes the caster's own tradition.
 *
 * WHICH CASTS ARE HIGH MAGIC:
 *   - a spell with the HIGHMAGIC trait, whoever casts it (Appendix: "Casting
 *     such a spell also imposes a Hard DC (+2) … which applies to all High
 *     Magic");
 *   - any spell cast by a High Magic caster: "Specific classes in this
 *     sourcebook that grant access to Highmagic spells, also treat any spells
 *     they can cast (regardless of tradition) as Highmagic" (M27). The class,
 *     archetype or feat declares `flags.trg-prime.highMagicCaster: true`;
 *   - a Fiends & Fables High Magic creature's spell, while a sourcebook's
 *     rules supersede the guideline (M4).
 * ───────────────────────────────────────────────────────────────────── */

const ELDRITCH_HIGH_MAGIC_FUMBLE = 60;
const HIGH_MAGIC_DC_STEP = 2;
const HIGH_MAGIC_ARMOUR_MULTIPLIER = 4;
/** "Highmagic spells count as belonging to all traditions simultaneously" (M27). */
export const ALL_TRADITIONS = "arcane, divinity, ethereal, verdant";

function traitList(value) {
  return String(value ?? "").split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
}

/** Does this spell carry the Highmagic trait? */
export function spellIsHighmagic(spellData) {
  return traitList(spellData?.traits).some((t) => t === "highmagic" || t === "high magic");
}

/** Items on the actor that are not switched off. */
function liveItems(actor) {
  return Array.from(actor?.items ?? []).filter((item) => item && !(item.type === "ability" && item.system?.active === false));
}

/** Does a class, archetype, feat or ability make this actor a High Magic caster? */
export function declaresHighMagicCaster(actor) {
  return liveItems(actor).some((item) => item.flags?.[SYSTEM_ID]?.highMagicCaster === true);
}

/**
 * …OR FOR SOME TRADITIONS ONLY (3.680.0; Eldritch Arts Block 3a, D4a). The
 * Witch "treat[s] the Ethereal and Verdant traditions as high magic", so her
 * class declares `highMagicCaster: ["ethereal", "verdant"]`, and only a spell
 * of those traditions — or one that names none and takes hers, a hex — is High
 * Magic. "any" is every spell, as `true` is.
 */
export function declaresHighMagicFor(actor, spellData) {
  const casterTradition = actor?.system?.magic?.tradition ?? "";
  return liveItems(actor).some((item) => {
    const declared = item.flags?.[SYSTEM_ID]?.highMagicCaster;
    // `true` is the line above's (declaresHighMagicCaster); this is the list
    // and "any".
    return declared !== undefined && declared !== null && declared !== false && declared !== true &&
      highMagicDeclaredFor(declared, spellData?.tradition, casterTradition);
  });
}

/** May this caster still use a focus for High Magic (the Archmage; the Arcanum birthright)? */
export function highMagicFocusAllowed(actor) {
  return liveItems(actor).some((item) => item.flags?.[SYSTEM_ID]?.highMagicFocus === true);
}

/**
 * Is this casting High Magic, and why?
 *
 * @param {Actor} actor
 * @param {object} spellData the spell's `system`
 * @returns {{highMagic: boolean, source: ""|"trait"|"caster"|"creature", label: string}}
 */
export function highMagicCast(actor, spellData) {
  if (spellIsHighmagic(spellData)) return { highMagic: true, source: "trait", label: "Highmagic spell" };
  if (declaresHighMagicCaster(actor)) return { highMagic: true, source: "caster", label: "High Magic caster" };
  if (declaresHighMagicFor(actor, spellData)) return { highMagic: true, source: "caster", label: "High Magic caster" };
  if (isHighMagic(actor) && supersededGuideline()) return { highMagic: true, source: "creature", label: "High Magic creature" };
  return { highMagic: false, source: "", label: "" };
}

/** The casting DC step a High Magic cast adds: Hard, +2. */
export function highMagicCastingDCStep(cast) {
  return cast?.highMagic ? HIGH_MAGIC_DC_STEP : 0;
}

/** Does the High Magic armour rule replace the tradition's for this cast (Q3)? */
export function highMagicArmourApplies(cast) {
  return Boolean(cast?.highMagic) && cast.source !== "creature";
}

/** DR × 4 on every worn piece (Q3: all armour, Divinity included). */
export function highMagicArmourPenalty(equippedArmour = []) {
  return (equippedArmour ?? []).reduce(
    (total, armour) => total + Math.max(0, Math.floor(Number(armour?.dr) || 0)) * HIGH_MAGIC_ARMOUR_MULTIPLIER, 0);
}

/** Is the caster's focus set aside for this cast (Q2)? */
export function highMagicFocusSetAside(actor, cast) {
  return Boolean(cast?.highMagic) && !highMagicFocusAllowed(actor);
}

/**
 * The traditions this casting counts as (M27: every one, for a Highmagic
 * spell), and the one whose fumble modifier it takes (Q4: the caster's own).
 */
export function highMagicTraditions(spellData, tradition, casterTradition) {
  if (!spellIsHighmagic(spellData)) return { traditions: tradition, fumbleTradition: tradition };
  return { traditions: ALL_TRADITIONS, fumbleTradition: String(casterTradition ?? "").trim().toLowerCase() || tradition };
}

/* ─────────────────────────────────────────────────────────────────────
 * FORBIDDEN MAGIC AGAINST A HIGH MAGIC CAST (3.683.0; Eldritch Arts Block 5,
 * Graham's Q58 and Q59 of 3 November 2026).
 *
 * Q58, changed from the proposal: "Ascendan suffer penalties for High Magic
 * (as it combines all magic)". A High Magic cast — any cast `highMagicCast`
 * calls one, by the spell's trait, a High Magic caster or a superseded
 * creature — counts as EVERY tradition for its target's Forbidden Magic: the
 * Ascendan's "-2 penalty to all saving throws against these traditions" and
 * its Will save "against beneficial spells of these traditions" both meet it,
 * whatever tradition the spell was learned from. Until 3.683.0 the target's
 * save read only the spell's own tradition field, so a High Magic cast of an
 * arcane spell escaped both. A FIX, so a world with no High Magic cast is
 * unchanged. The Ascendan's OWN High Magic casting is untouched: 3.680.0's
 * bypass of the tradition gate stands.
 *
 * Q59, changed: Unbound "removes the penalties associated with High Magic".
 * A creature whose item or effect declares
 *
 *   flags.trg-prime.forbiddenSparesHighMagic: true
 *
 * is spared: against a High Magic cast its Forbidden Magic does not apply at
 * all — no -2 from that cast's traditions, and no beneficial-spell Will save.
 * Against an ordinary cast nothing changes.
 * ───────────────────────────────────────────────────────────────────── */

/** Does this creature declare that High Magic spares its Forbidden Magic (Unbound, Q59)? */
export function forbiddenSparesHighMagic(actor) {
  if (liveItems(actor).some((item) => item.flags?.[SYSTEM_ID]?.forbiddenSparesHighMagic === true)) return true;
  return Array.from(actor?.appliedEffects ?? actor?.effects ?? [])
    .some((effect) => effect && !effect.disabled && effect.flags?.[SYSTEM_ID]?.forbiddenSparesHighMagic === true);
}

/**
 * The traditions a target's save against this cast is told (the
 * conditionals' `traditions` axis).
 *
 *   an ordinary cast   the spell's own tradition field, exactly as before;
 *   a High Magic cast  every tradition (Q58), so Forbidden Magic's -2 meets it;
 *   …at a spared one   every tradition but the ones its Forbidden Magic names
 *                      (Q59), so neither the -2 nor its "tick if this roll is
 *                      against one" question meets it, and any other
 *                      tradition-scoped entry still does.
 *
 * @param {Actor} target who rolls the save
 * @param {object} spellData the spell's `system`
 * @param {{highMagic?: boolean}} [cast] `highMagicCast(caster, spellData)`
 * @returns {string}
 */
export function spellSaveTraditions(target, spellData, cast = {}) {
  if (!cast?.highMagic) return spellData?.tradition ?? "";
  if (!forbiddenSparesHighMagic(target)) return ALL_TRADITIONS;
  const forbidden = new Set([...forbiddenTraditionsOf(target), ...beneficialSaveTraditionsOf(target)].map((f) => f.tradition));
  return traditionList(ALL_TRADITIONS).filter((t) => !forbidden.has(t)).join(", ");
}
