/**
 * The two numbers a spell actually turns on, assembled where they can be
 * checked and where they can explain themselves.
 *
 * NEW at 3.386.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * The Casting DC was built by ONE INLINE EXPRESSION inside `castSpell`,
 * a 1,751-line function that cannot run outside Foundry:
 *
 *     const dc = (isCantrip
 *       ? CANTRIP_PENALISED_DC + armourPenalty + (defensive ? 5 : 0)
 *       : castingDC(totalPP) + overcastDCIncrease(totalPP, casterLevel)
 *         + armourPenalty + (defensive ? 5 : 0)
 *     ) + runemageDC + favouredTerrain + mm.dcDelta + eloquence
 *       + wizardSchoolCasting;
 *
 * NINE CONTRIBUTORS, and every one of them individually pure and
 * checkable — `castingDC`, `overcastDCIncrease`, `armourCastingPenalty`,
 * `wizardSchoolCastingDCDelta` all have their own functions and their own
 * arithmetic. The SUM had nothing. Measured 24 August 2026: no file under
 * `tools/` so much as mentions `castingDC` or `armourPenalty`. The number
 * a player rolls against, on the most-used action in the game, was
 * reachable by no harness at all.
 *
 * This is the project's named recurring defect wearing its largest hat: a
 * decision made inside a Foundry-only function. The rules were never the
 * problem in Chapter 9 — the survey found no unwired rule worth the name.
 * Their ASSEMBLY was the gap.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND FIVE OF THE NINE WERE SILENT
 *
 * The check subtitle named overcast, armour, Defensive Casting, focus,
 * extra time, situational modifiers and Specialist. It did not name:
 *
 *     Runemage           -1, and +1 instead when casting defensively
 *     Favoured Terrain   -1
 *     Metamagic          varies
 *     Eloquence          -1
 *     Wizard School      -2
 *
 * Each appeared exactly twice in the whole file: computed, then added.
 * A Wizard with Eloquence casting a school spell in favoured terrain
 * rolled against a DC **four lower** than the card accounted for, and
 * nobody would ever report it, because a spell that works looks right.
 *
 * §5.9 — the card must say what the system did. So these functions return
 * the number AND its labelled parts, and the caller builds the card from
 * the parts rather than from a second, hand-maintained list of the same
 * facts. That is what stops a tenth contributor being added silently: to
 * change the DC you must go through `parts`, and anything in `parts` is
 * printed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FACTS IN, NOT PRE-COMPUTED NUMBERS
 *
 * `runemage`, `favouredTerrain` and `eloquence` arrive as BOOLEANS even
 * though the caller could pass -1. Their arithmetic is part of the rule,
 * and the Runemage clause proves it: *"All casting DCs are reduced by
 * 1... All Defensive Casting DCs are increased by 2"* — two sentences
 * that interact, netting **+1** for a Runemage casting defensively rather
 * than the -1 a reader expects. That interaction is exactly the kind of
 * thing a harness should be able to drive, and it cannot drive a number
 * that was worked out before the call.
 *
 * `armourPenalty`, `metamagicDelta` and `wizardSchoolDelta` arrive as
 * numbers because each is already the output of its own pure, tested
 * function. Recomputing them here would be two places deciding one
 * question.
 */

import { CANTRIP_PENALISED_DC, castingDC, overcastDCIncrease } from "./casting.mjs";

/** A part is only carried when it moves the number. */
function push(parts, label, value) {
  if (Number.isFinite(value) && value !== 0) parts.push({ label, value });
  return value || 0;
}

const int = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The Casting DC, and every contributor that moved it.
 *
 * @param {object} options
 * @param {boolean} [options.isCantrip] Cantrips use a flat DC 10 when
 *   penalties force a check at all; they never pay the PP-based DC.
 * @param {number} [options.totalPP] Base + warp + metamagic PP.
 * @param {number} [options.casterLevel] For the overcast increase only.
 * @param {number} [options.armourPenalty] From `armourCastingPenalty`.
 * @param {boolean} [options.defensive] Defensive Casting, +5.
 * @param {boolean} [options.runemage] Holds the Runemage feat.
 * @param {boolean} [options.favouredTerrain] Verdant caster, terrain on.
 * @param {number} [options.metamagicDelta] From the metamagic chooser.
 * @param {boolean} [options.eloquence] Holds the Eloquence feat.
 * @param {number} [options.wizardSchoolDelta] From `wizardSchoolCastingDCDelta`.
 * @returns {{dc: number, parts: Array<{label: string, value: number}>,
 *   base: number}} `parts` never includes the base, which is always
 *   present and is reported separately.
 */
export function assembledCastingDC({
  isCantrip = false,
  totalPP = 0,
  casterLevel = 0,
  armourPenalty = 0,
  // EAOG (Chapter 6): "All Spell Casting DCs are increased by 2." A
  // property of the armour's MATERIAL rather than of wearing prohibited
  // armour, so it is its own part with its own label — the two can apply
  // at once and a caster is entitled to see which is costing what. Added
  // at 3.573.0; the material layer had computed this figure since Eaog
  // existed and nothing read it.
  materialPenalty = 0,
  defensive = false,
  runemage = false,
  favouredTerrain = false,
  metamagicDelta = 0,
  eloquence = false,
  wizardSchoolDelta = 0,
  // A REAGENT (3.578.0, R10): the Sulphur Bomb's "This reduces the casting
  // DC by 1", spent as an additional material component.
  reagentDelta = 0,
  // A DECLARED DEFENSIVE CASTING (3.627.0): Pillars of Faith's Faultless
  // Casting — "All spells you cast are treated as though you were using
  // Defensive Casting. Defensive Casting checks for your spells are Medium
  // (+0) rather than Very Hard (DC +5)." `{label, dcAdd}`; the caller then
  // passes `defensive: false` so the core's +5 is not added as well.
  declaredDefensive = null
} = {}) {
  const parts = [];
  const pp = Math.max(0, int(totalPP));

  // THE BASE. A cantrip's DC does not scale with PP — it has none to
  // scale with — so the overcast increase is not merely zero for a
  // cantrip, it is not asked for.
  const base = isCantrip ? CANTRIP_PENALISED_DC : castingDC(pp);

  let dc = base;
  if (!isCantrip) dc += push(parts, "Overcast", overcastDCIncrease(pp, int(casterLevel)));
  dc += push(parts, "Prohibited armour", Math.max(0, int(armourPenalty)));
  dc += push(parts, "Eaog armour", Math.max(0, int(materialPenalty)));
  if (defensive) dc += push(parts, "Defensive Casting", 5);
  // Said even at +0, so the card shows the cast WAS defensive and why it cost nothing.
  if (declaredDefensive) {
    const add = int(declaredDefensive.dcAdd);
    dc += add;
    parts.push({ label: `${declaredDefensive.label || "Defensive Casting"}, defensive`, value: add });
  }

  // RUNEMAGE IS TWO SENTENCES, AND THEY INTERACT. -1 to all casting DCs,
  // +2 to defensive ones, so a Runemage who casts defensively is at +1
  // overall — worse than the +5 alone, not better. Kept as one part with
  // an honest label rather than two that would look like a bug on the
  // card.
  if (runemage) {
    // LABELLED "Runemage, defensive" AND NOT "Runemage (defensive)".
    // `describeParts` wraps every part in its own brackets, so a label
    // carrying brackets of its own rendered as "(Runemage (defensive)
    // +1)" on a live card. Legible, but nested brackets in a subtitle
    // read as a formatting fault, and a reader who distrusts the shape
    // of a line stops reading the line. Changed at 3.387.0 after seeing
    // it on a real cast.
    dc += push(parts, defensive ? "Runemage, defensive" : "Runemage", -1 + (defensive ? 2 : 0));
  }
  if (favouredTerrain) dc += push(parts, "Favoured Terrain", -1);
  dc += push(parts, "Metamagic", int(metamagicDelta));
  if (eloquence) dc += push(parts, "Eloquence", -1);
  dc += push(parts, "Wizard School", int(wizardSchoolDelta));
  dc += push(parts, "Reagent", int(reagentDelta));

  return { dc, parts, base };
}

/**
 * The total a spell attack is resolved with, and what moved it.
 *
 * SAME SHAPE, SMALLER GAP. Two of these four announced themselves on the
 * card already — Aggressive Magic and the Specialist uplift each push
 * their own line, the latter with a comment explaining that a number
 * which moves an attack the player watched land must be said out loud.
 * `attackWarp` did not, and it comes from the CASTER LEVEL MODIFICATIONS
 * block, which is the least visible source of all.
 *
 * @param {object} options
 * @param {number} [options.checkTotal] The Cast a Spell check's total —
 *   already contains the die, Spellcraft and every check modifier.
 * @param {number} [options.attackWarp] Caster-level modifications.
 * @param {number} [options.aggressiveMagic] +2 on an elemental attack.
 * @param {number} [options.specialistUplift] From `specialistAttackUplift`.
 * @param {number} [options.map] The multiple attack penalty, a negative
 *   number, or 0. NEW at 3.579.0 for page 191 and Graham's R1: "Any
 *   action which has the attack trait counts towards the multiple attack
 *   penalty including disarm, shove, spells etc." A spell attack had
 *   never taken it, so a caster who Struck and then cast a Fire Bolt
 *   rolled the bolt at full bonus.
 * @param {Array<{label: string, value: number}>} [options.poolRows] The
 *   status and circumstance bonuses already modifying this creature's
 *   attack rolls — Bless, Bane, Rage, Aim, Prone and their kin — after
 *   stacking. NEW at 3.425.0; see magic/spell-attack-bonus.mjs. Rows
 *   rather than a lump, so the card names what moved the number: a
 *   player who watched an attack land is owed the reason it did.
 * @returns {{total: number, parts: Array<{label: string, value: number}>,
 *   base: number}}
 */
export function assembledSpellAttackTotal({
  checkTotal = 0,
  attackWarp = 0,
  aggressiveMagic = 0,
  specialistUplift = 0,
  map = 0,
  poolRows = []
} = {}) {
  const parts = [];
  const base = int(checkTotal);
  let total = base;
  total += push(parts, "Multiple attack penalty", Math.min(0, int(map)));
  total += push(parts, "Caster level modifications", int(attackWarp));
  total += push(parts, "Aggressive Magic", int(aggressiveMagic));
  total += push(parts, "Specialist spell", int(specialistUplift));
  // EACH BY NAME. `push` drops a zero, so a suppressed row that stacking
  // reduced to nothing leaves no line — which is right: the card should
  // say what applied, not list what did not.
  for (const row of Array.isArray(poolRows) ? poolRows : []) {
    total += push(parts, String(row?.label ?? "Bonus"), int(row?.value));
  }
  return { total, parts, base };
}

/**
 * Heighten Spell (Chapter 5 metamagic): "treats the PP of the spell for
 * Saving Throw DC purposes as the maximum PP that you can cast."
 *
 * A RULE, NOT AN EXPRESSION, and it was the latter until 3.387.0 — one
 * ternary inside `castSpell` deciding which PP the save DC is built
 * from. It is a maximum rather than a replacement, so a spell already
 * cast above the cap (overcast by Sacrifice, or by Magic Ritual) is not
 * dragged back DOWN to it by taking the metamagic.
 *
 * @param {number} totalPP What the spell actually cost.
 * @param {number} cap The caster's maximum PP per cast.
 * @param {boolean} heighten Whether Heighten Spell was taken.
 * @returns {number}
 */
export function heightenedSavePP(totalPP, cap, heighten = false) {
  const spent = Math.max(0, int(totalPP));
  if (!heighten) return spent;
  return Math.max(spent, Math.max(0, int(cap)));
}

/**
 * The Saving Throw DC a spell's targets roll against, and what moved it.
 *
 * THE SAME GAP AS THE CASTING DC, on the number that decides whether the
 * spell works at all. Five contributors were added together inline at
 * `cast-workflow.mjs:1692`, and the card named exactly one of them:
 *
 *     caster-level warp   named, by a hand-written clause
 *     warp save DC        silent
 *     Runemage            silent, +1
 *     Wizard School       silent, +2
 *     Heighten Spell      silent, and it moves the BASE
 *
 * A Runemage Wizard casting a spell of their own school set a save DC
 * **three higher** than the card accounted for. Heighten Spell is worse
 * in kind: it does not add to the DC, it rebuilds the base from a larger
 * PP, so no amount of reading the printed cost explains the number.
 *
 * A FIXED DC OVERRIDES EVERYTHING, and that is a rule rather than a
 * short-circuit — a granted spell-like that borrows its DC (the Wyrm's
 * breath weapon) or a consumable that carries its own must not have a
 * Wizard's school bonus added on top of a number that was never derived
 * from a Wizard. It returns with the override named as its base, so the
 * card can say where it came from instead of printing a bare figure.
 *
 * @param {object} options
 * @param {number} [options.fixedDC] A DC set by the granting effect or item.
 * @param {number} [options.baseDC] From `spellSaveDC` / `innateSaveDC` /
 *   `specialistSaveDC` — whichever the caster's situation selected.
 * @param {number} [options.casterLevelWarp] `clMods.saveDC`.
 * @param {number} [options.warpSaveDC] `warpMods.saveDC`.
 * @param {boolean} [options.runemage] Holds Runemage: all save DCs +1.
 * @param {number} [options.wizardSchoolDelta] From `wizardSchoolSaveDCDelta`.
 * @param {number} [options.songAndDance] The Bard's class bonus — see below.
 * @returns {{dc: number, parts: Array<{label: string, value: number}>,
 *   base: number, fixed: boolean}}
 */
export function assembledSaveDC({
  fixedDC = 0,
  baseDC = 0,
  casterLevelWarp = 0,
  warpSaveDC = 0,
  runemage = false,
  wizardSchoolDelta = 0,
  // SONG & DANCE (3.444.0). Graham, 31 August 2026: "with Song and Dance
  // the bonus needs to be applied to the attack bonus and Save DC."
  //
  // A NAMED TERM RATHER THAN PART OF THE BASE, and that is the design.
  // The Bard's class bonus lives in the Spellcraft total, and exactly one
  // of the three base formulas reads that total — the Specialist DC's
  // `max(10 + ability + level, 10 + spellcraft)`. So the bonus was inside
  // the base when the Spellcraft branch won and absent when the
  // ability+level branch won, which is not a rule; it is an accident of
  // which number happened to be larger. The other two bases —
  // `10 + PP + ability` and the innate `10 + ability + level` — have no
  // Spellcraft term at all and never carried it.
  //
  // The caller now builds every base from the Spellcraft bonus WITHOUT
  // the class bonus and passes it here, so it is added exactly once, is
  // visible on the card, and cannot be double-counted.
  //
  // ZERO ON A BARDIC PERFORMANCE CAST — "if you are using Bardic
  // Performance the Class bonus does not apply" — decided by the caller,
  // which is the only place that knows how the spell was cast.
  songAndDance = 0,
  // BONUSES THE CASTER DECLARES FOR THIS SPELL'S TRAITS (3.627.0) — Soul-
  // Magic Dominion's +1 racial on a soul spell. `[{label, value}]`, already
  // stacked by magic/spell-dc-bonus.mjs; each is a named part.
  declaredBonuses = []
} = {}) {
  const fixed = Math.max(0, int(fixedDC));
  // NOTHING IS ADDED TO A FIXED DC. Returning early with empty parts is
  // what keeps `dc === base + sum(parts)` true in both branches, so the
  // one invariant covers the override too rather than excusing it.
  //
  // SONG & DANCE IS INSIDE THAT RULE, deliberately. A fixed DC belongs to
  // the effect or item that set it — the Wyrm's breath weapon, a potion —
  // and a Bard who drinks it has not cast anything with Spellcraft.
  if (fixed > 0) return { dc: fixed, parts: [], base: fixed, fixed: true };

  const parts = [];
  const base = int(baseDC);
  let dc = base;
  dc += push(parts, "Song & Dance", Math.max(0, int(songAndDance)));
  dc += push(parts, "Caster level warp", int(casterLevelWarp));
  dc += push(parts, "Warping", int(warpSaveDC));
  if (runemage) dc += push(parts, "Runemage", 1);
  dc += push(parts, "Wizard School", int(wizardSchoolDelta));
  for (const bonus of Array.isArray(declaredBonuses) ? declaredBonuses : []) dc += push(parts, bonus.label, int(bonus.value));
  return { dc, parts, base, fixed: false };
}

/**
 * The parts as one parenthesised string for a card subtitle.
 *
 * HERE RATHER THAN IN THE TEMPLATE so that the sentence a player reads is
 * checkable without Foundry — the Grapple lesson at §5.9, where the table
 * was corrected and the card went on describing the outcome it used to
 * have.
 *
 * @param {Array<{label: string, value: number}>} parts
 * @returns {string} "" when nothing moved the number.
 */
export function describeParts(parts) {
  const list = (Array.isArray(parts) ? parts : []).filter((p) => p && p.value);
  if (!list.length) return "";
  return list
    .map((p) => ` (${p.label} ${p.value > 0 ? "+" : ""}${p.value})`)
    .join("");
}
