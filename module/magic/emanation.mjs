/**
 * A spell emanation follows its caster, and its bonus applies while you
 * are standing in it.
 *
 * NEW at 3.426.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD.
 *
 * Graham, 27 August 2026, on Bless: "I have an issue with the way the
 * emanation works. This should move with the caster."
 *
 * It did not. `placeSpellTemplate` drops a Region on the caster's square
 * at the moment of the cast and never moves it again, and the spell's
 * effects are stamped onto whoever was caught at that instant. Walk the
 * cleric across the room and the circle stays behind; walk a blessed
 * fighter out of it and he keeps the bonus for the rest of the minute.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE RULES HAD ALREADY SAID SO — TWICE, IN THE PRICE LIST.
 *
 * Bless reads: "You and your allies gain a +1 status bonus to attack
 * rolls WHILE WITHIN THE EMANATION", and then sells this:
 *
 *   +2 PP: "the spell affects all targets in range at the beginning of
 *           the spell after which the targets may move out of the area"
 *
 * Bane sells the same thing in its own words: "+2 PP: a target that
 * fails their save is still affected for the duration if they leave the
 * area of effect."
 *
 * Two spells independently charge Power Points for membership to stop
 * mattering. That only makes sense if membership normally DOES matter —
 * and the system had the default and the upgrade the wrong way round:
 * everybody got the upgrade for free, and paying for it changed nothing.
 * Both warps carry `mods: {}` — empty — so they were inert by
 * construction rather than by oversight.
 *
 * GRAHAM'S RULING, 27 August 2026: the region follows the caster, the
 * bonus applies while you are inside it, and stepping back in restores
 * it. Membership is a fact about where you are standing, not a list
 * drawn up once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHICH EMANATIONS THIS GOVERNS.
 *
 * Nine sustained emanations apply effects; EIGHT are live (Radiant Aegis
 * joined at 3.446.1 on the same reading as Wellspring — see below).
 *
 *   - WELLSPRING OF VALOUR joined at 3.446.0, and `verify-emanation`'s
 *     E3 is what made that a decision rather than an accident: authoring
 *     its bonus made it live automatically, the check refused, and the
 *     spell was read against this boundary before being added. "Grants
 *     allies a +1 status bonus to attack rolls" over a Sustained
 *     emanation is Bless's own shape — "while within the emanation" is
 *     the whole rule. What is new is only that the bonus is CONDITIONAL
 *     on the TARGET's aura, and that is a question for the attack roll
 *     rather than for membership, so nothing here had to change.
 *
 *   - Bless, Inspire Courage, Inspire Defence and Ember Of Devotion are
 *     continuous buffs with no saving throw. For those, "while within
 *     the emanation" is the whole rule.
 *   - BANE joined at 3.428.0. It gates on a Will save, which is why it
 *     was excluded at 3.426.0 — and its own outcome text ("as long as
 *     they remain within 30 feet of you") settled that live membership
 *     was printed rather than inferred. What it needed was a record of
 *     what each creature rolled; see `untestedMembers` below.
 *
 *   - SONG OF DESPAIR joined at 3.429.0, and is a THIRD shape again.
 *     Its text is not "the effect applies while you are inside" but
 *     "they become frightened 1 and CANNOT REDUCE their frightened
 *     condition below 1 as long as they remain within the area" — a
 *     floor on recovery, not a membership of an effect. Two consequences
 *     follow, and both differ from Bless and Bane:
 *       · entering RAISES the condition to the floor; it never lowers it,
 *         so a creature already frightened 3 is untouched;
 *       · LEAVING CURES NOTHING. The text forbids reducing below 1 while
 *         inside and says nothing about the fear ending, so walking out
 *         only restores the ability to recover.
 *     `emanationFloors` and `flooredValue` below are the whole rule.
 *
 * One remains out:
 *
 *   - TURN UNDEAD's only effect is a note. There is nothing to follow.
 *
 * THIS PARAGRAPH WAS STALE FOR ONE RELEASE, and said Bane was excluded
 * while the code below included it. That is the defect this project
 * keeps finding — a comment describing an intention the code does not
 * carry — written by the person who had spent the day naming it. Left
 * recorded rather than quietly corrected.
 *
 * `verify-emanation` holds the boundary as a list, so a seventh spell
 * joining is a deliberate edit rather than a side effect.
 */

/**
 * The effect kinds that follow the area.
 *
 * A `bonus` is a continuous state — you have it while you stand there.
 * A `condition` is something that HAPPENED to you, and a `note` is text
 * for a person to read; neither is a fact about your current position.
 */
/*
 * `perTurn` JOINED THE LIST AT 3.435.1, and it is the first member that
 * is NOT a continuous state.
 *
 * This list is asked one question — "must the AREA stay live?" — and it
 * had been answered with a second one, "is this a fact about where you
 * are standing?". For Bless and Bane those are the same question. For
 * Luminance they are not: nothing is true of you while you stand in the
 * light, but the area must still exist, follow its caster and know who
 * is inside it, because a per-turn event asks exactly that at the start
 * of every turn.
 *
 * WITH `perTurn` MISSING, LUMINANCE HAD NO EMANATION RECORD AT ALL. The
 * whole mechanism built for it — the turn-start pass, the membership
 * test, the Sustain that grows the dice — iterated an empty list for
 * ever, and the only visible symptom was a card that healed nobody.
 * Found by driving the spell live on 29 August 2026; `verify-luminance`
 * had 42 checks and not one of them asked this gate a question.
 */
/*
 * `antimagic` JOINED AT 3.586.0, and it is the second member that is not
 * a continuous state — though it is closer to one than `perTurn` is.
 *
 * Nothing is TRUE of you while you stand in an Antimagic Field; what
 * happens is that the spells already on you stop working, and start
 * again when you step out. That is a fact about crossing the boundary in
 * both directions, which is the one question this list exists to ask:
 * the area must stay live, follow its caster, and know who is inside it.
 * See magic/antimagic.mjs.
 */
// "turnSave" (3.609.0): Turn Undead's save at the start of a turn needs the
// circle to be recorded and followed, and is read by the turn clock alone.
// "heldBonus" (3.612.0, R8): Inspire Heroics' once-a-round advantage travels
// with the composition — carried on the membership effect, spent from a card.
// "defence" JOINS AT 3.613.0 (R3 of block 35) — Protector's Sphere: "You gain
// Physical Resistance (adamantine). Furthermore, any ally within the area
// of effect also gains this resistance." Held while inside, lost on leaving.
// "damageHeal" JOINS AT 3.614.0 (R9 of block 35) — Wellspring Of Valour's heal
// for "an ally in the aura", which only membership can answer.
export const LIVE_EMANATION_EFFECT_KINDS = Object.freeze(["bonus", "perTurn", "antimagic", "zone", "turnSave", "heldBonus", "defence", "damageHeal"]);

/**
 * Effect kinds that DRAW THEIR OWN CIRCLE, wherever the stat line says.
 *
 * NEW at 3.492.0, and the list is separate from the one above because it
 * answers a different question. `LIVE_EMANATION_EFFECT_KINDS` asks "does
 * this effect TRAVEL with an area the spell already has"; this asks
 * "does this effect BRING an area of its own".
 *
 * Umbral Veil's stat line has no Area field at all — its circle is in
 * the description — so nothing keyed on the printed area could ever have
 * seen it.
 *
 * NOT EXPORTED. `emanationIsLive` is this module's public form of the
 * question, and `verify-rules-have-callers` was right to flag the
 * exported version: the only thing outside this file that wanted it was
 * a mutation.
 */
const SELF_DRAWN_EMANATION_KINDS = Object.freeze(["lightShift"]);

/**
 * Effect kinds whose ROW makes the placed area live (3.608.0).
 *
 * Solid Fog's stat line says "20-foot radius", not emanation — the cloud is
 * put down where it is cast — but who is inside it changes every time
 * somebody moves, which is the question only the live sweep answers. So
 * the row is the declaration, as it is for the self-drawn kinds above; the
 * difference is that this circle is the TEMPLATE's, and it stays where the
 * template was placed (see magic/obscuring-zone.mjs).
 */
const PLACED_LIVE_KINDS = Object.freeze(["zone"]);

/**
 * Whether this spell's area is one whose membership stays live.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A SAVE USED TO DISQUALIFY A SPELL HERE, and at 3.426.0 that was the
 * honest line to draw: re-deciding membership for a save-gated spell
 * would either re-roll a save the book rolls once, or grant the result
 * of a save a creature never made. Bane and Turn Undead sat outside.
 *
 * BANE'S OWN TEXT SETTLED IT (3.428.0). "Target has a -1 status penalty
 * to attack rolls AS LONG AS THEY REMAIN WITHIN 30 FEET OF YOU" — live
 * membership is not an inference from the price list, it is printed in
 * the outcome. What the earlier line lacked was not permission but
 * machinery: somewhere to record what each creature rolled.
 *
 * GRAHAM'S TWO RULINGS, 28 August 2026, are what that machinery
 * implements:
 *
 *   - a creature that walks IN after the cast makes the save then, the
 *     way it would walking into a creature's aura;
 *   - a creature that already failed and walks back in is penalised
 *     again WITHOUT a new save. It failed once; being inside is the
 *     condition, not the rolling.
 *
 * So the save is rolled at most once per creature per casting, and the
 * degree it rolled is remembered for as long as the spell runs.
 *
 * @param {object} spellData `spell.system`
 * @returns {boolean}
 */
export function emanationIsLive(spellData) {
  const effects = Array.isArray(spellData?.effects) ? spellData.effects : [];
  /*
   * AN EFFECT THAT DRAWS ITS OWN CIRCLE DOES NOT NEED THE PRINTED AREA
   * TO SAY "EMANATION" (3.492.0).
   *
   * FOUND BY DRIVING IT. Umbral Veil's stat line carries no Area at all —
   * its circle is in the description, *"within a 20-foot emanation centred
   * on the target"* — so the area test below returned false, the
   * registration gate in cast-workflow skipped the spell, and
   * `recordEmanation` had no active-spell entry to write onto. The Region
   * was still created, so the light really did drop three steps and the
   * card said everything it should. What did not happen was the
   * FOLLOWING: Borin walked sixty feet and his own shadow stayed behind,
   * dimming the light around Keldran and Grokash instead.
   *
   * THIS IS THE AURA OF VITALITY DEFECT AGAIN, ONE ROUTE OVER. The
   * comment above that gate describes it happening to a spell "neither
   * sustained nor PP-locked", and the fix then was to add
   * `emanationIsLive` to the gate — but `emanationIsLive` asks about the
   * printed AREA, so a spell whose circle is declared on an effect row
   * was outside the only question the predicate knew how to ask.
   *
   * The rows are therefore consulted FIRST and independently of the area
   * text, because for these kinds the row IS the declaration.
   */
  if (effects.some((e) => SELF_DRAWN_EMANATION_KINDS.includes(String(e?.kind ?? "")))) return true;
  if (effects.some((e) => PLACED_LIVE_KINDS.includes(String(e?.kind ?? "")))) return true;
  if (!/emanation/i.test(String(spellData?.area ?? ""))) return false;
  // A BONUS THAT TRAVELS, OR A FLOOR THAT HOLDS. Song Of Despair carries
  // no bonus at all — its whole rule is a minimum on a condition — so
  // qualifying on the bonus alone would have left it out for the wrong
  // reason a second time.
  if (Object.keys(emanationFloors(effects)).length) return true;
  return effects.some((e) => LIVE_EMANATION_EFFECT_KINDS.includes(String(e?.kind ?? "")));
}

/** The save a live emanation demands on entry, or null if it demands none. */
export function emanationSave(spellData) {
  const defence = String(spellData?.defence ?? "").trim().toLowerCase();
  return defence || null;
}

/**
 * Who inside the area still owes this emanation a save.
 *
 * ONCE PER CREATURE PER CASTING. `tested` is the record of what each has
 * already rolled, and a creature in it is never asked again — which is
 * Graham's re-entry ruling expressed as the presence of a memory, the
 * exact mirror of Bless where the ruling was expressed by its absence.
 *
 * @param {object} tested {tokenId: degree}
 * @param {string[]} inside
 * @returns {string[]}
 */
export function untestedMembers(tested, inside = []) {
  const seen = tested ?? {};
  return (Array.isArray(inside) ? inside : []).filter((id) => !(id in seen));
}

/**
 * The effect rows that apply to a creature which rolled this degree.
 *
 * A SAVE-GATED EMANATION IS NOT ONE EFFECT FOR EVERYONE. Bane prints -1
 * on a Failure and -2 on a Fumble, so what a creature carries depends on
 * what it rolled — and `effectiveSaveDegree` decides which printed rung
 * an unprinted degree reads at, so a Blunder finds the Fumble row and a
 * Partial finds nothing.
 *
 * An UNGATED effect list (Bless) ignores the degree entirely and applies
 * to everyone inside, which is what makes one function serve both.
 *
 * @param {object[]} effects the spell's live effect rows
 * @param {string|null} degree what this creature rolled, if anything
 * @param {(effects: object[], rolled: string) => string} readAt
 *   `effectiveSaveDegree`, injected so this file stays free of Foundry
 *   and of its own copy of the degree ladder.
 */
export function effectsForDegree(effects, degree, readAt) {
  const rows = Array.isArray(effects) ? effects : [];
  const gated = rows.filter((e) => Array.isArray(e?.onSave) && e.onSave.length);
  if (!gated.length) return rows;
  if (!degree) return [];
  const at = typeof readAt === "function" ? readAt(gated, degree) : degree;
  return gated.filter((e) => e.onSave.map(String).includes(String(at)));
}

/**
 * The effect rows of a spell that travel with the area.
 *
 * A spell may carry a bonus AND a note — Inspire Courage does. Only the
 * bonus moves; the note was printed on the card at the cast and does not
 * follow anybody around.
 */
export function liveEmanationEffects(spellData) {
  return (Array.isArray(spellData?.effects) ? spellData.effects : [])
    .filter((e) => LIVE_EMANATION_EFFECT_KINDS.includes(String(e?.kind ?? "")));
}

/**
 * Whether the caster paid to freeze the membership list.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE WARP THAT BOUGHT NOTHING. Bless and Bane both sell this for 2 PP
 * and both carried `mods: {}`, so the option was inert — and inert in
 * the direction that made the whole rule inert, because the behaviour it
 * was supposed to buy was already the only behaviour there was.
 *
 * The mod key is authored on the pack entry now. Read defensively: a
 * warp list from an older world has no such key and simply is not
 * frozen, which is the correct reading of a caster who did not pay.
 *
 * @param {object|null} warpMods The accumulated `mods` of chosen warps.
 * @returns {boolean}
 */
export function membershipFrozen(warpMods) {
  return Boolean(warpMods?.freezeMembership);
}

/**
 * Who is inside an emanation right now.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MEASURED IN FEET, from centre to centre, against the emanation's own
 * radius — the same units `creature-auras.mjs` uses, and for the same
 * reason: pixels are a property of the scene's grid settings and feet
 * are a property of the rules.
 *
 * THE CASTER IS INCLUDED. Bless says "You and your allies", and the
 * caster is standing at the centre of their own emanation. This is the
 * opposite of the ruling creature ally-auras took ("a thing does not
 * emanate onto itself") and deliberately so — that one was decided on an
 * aura page that says "Allies"; this one is decided by a spell that says
 * "You and".
 *
 * @param {object} options
 * @param {{x:number,y:number}} options.centreFeet Where the caster is.
 * @param {number} options.radiusFeet The emanation's radius.
 * @param {Array<{id, centreFeet, disposition}>} options.subjects
 * @param {number} options.casterDisposition
 * @param {string} options.mode "all" | "allies" | "enemies"
 * @returns {string[]} The ids of the subjects inside.
 */
export function emanationMembers({
  centreFeet, radiusFeet, subjects = [], casterDisposition = 0, mode = "all"
} = {}) {
  if (!centreFeet || !Number.isFinite(Number(radiusFeet))) return [];
  const reach = Number(radiusFeet);
  return (Array.isArray(subjects) ? subjects : [])
    .filter((s) => s?.centreFeet && withinFeet(centreFeet, s.centreFeet, reach))
    .filter((s) => keepByMode(s.disposition, casterDisposition, mode))
    .map((s) => s.id);
}

/**
 * Distance in feet, centre to centre, against a radius.
 *
 * INCLUSIVE at the boundary: a creature standing exactly thirty feet
 * from the centre of a thirty-foot emanation is in it. "Within 30 feet"
 * includes thirty.
 */
export function withinFeet(a, b, reachFeet) {
  const dx = Number(a?.x ?? 0) - Number(b?.x ?? 0);
  const dy = Number(a?.y ?? 0) - Number(b?.y ?? 0);
  return Math.hypot(dx, dy) <= Number(reachFeet) + 1e-6;
}

/**
 * The disposition filter, matching `keepByDisposition` in
 * spell-template.mjs exactly.
 *
 * NOT IMPORTED FROM THERE, because that module reaches for `canvas` at
 * the top level and this one is checked without a world. Duplicated
 * logic is a hazard, so `verify-emanation` asserts the two agree across
 * every combination rather than trusting that they do.
 */
export function keepByMode(tokenDisposition, casterDisposition, mode = "all") {
  if (mode !== "allies" && mode !== "enemies") return true;
  const t = Number(tokenDisposition);
  const c = Number(casterDisposition);
  if (mode === "allies") return t === c;
  return c !== 0 && Math.sign(t) === -Math.sign(c);
}

/**
 * What changed between the creatures that hold this emanation's effects
 * and the creatures now standing in it.
 *
 * RETURNED AS TWO LISTS rather than applied here, so the decision can be
 * checked without a canvas and the workflow is left with nothing to
 * decide. A creature that walks out and back in appears in `remove` on
 * one move and `add` on another — which is exactly Graham's ruling that
 * the bonus resumes, expressed as the absence of any memory.
 *
 * @param {string[]} holding ids currently carrying the effects
 * @param {string[]} inside ids now within the area
 * @returns {{add: string[], remove: string[]}}
 */
export function emanationDelta(holding = [], inside = []) {
  const has = new Set(holding);
  const now = new Set(inside);
  return {
    add: [...now].filter((id) => !has.has(id)),
    remove: [...has].filter((id) => !now.has(id))
  };
}

/**
 * The condition floors an emanation imposes on whoever stands in it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A FLOOR IS NOT A BONUS, AND NOT A CONDITION EITHER.
 *
 * Song Of Despair reads: "They become frightened 1 and cannot reduce
 * their frightened condition below 1 AS LONG AS THEY REMAIN WITHIN THE
 * AREA." Neither of the two shapes already here fits it:
 *
 *   - it is not Bless's bonus, which is lifted by walking out;
 *   - it is not Bane's save-gated penalty, because there is no save —
 *     the spell's `defence` is empty.
 *
 * It is a MINIMUM. Standing inside raises the condition to the floor and
 * stops it falling below; stepping outside releases the floor and cures
 * nothing at all. A creature that walks out frightened 1 stays
 * frightened 1 and may now recover from it.
 *
 * DECLARED ON THE EFFECT ROW rather than parsed from the prose. The
 * sentence is unambiguous to a reader and would be a guess to a regex,
 * and this project has met enough rules inferred from wording.
 *
 * @param {object[]} effects the spell's effect rows
 * @returns {Record<string, number>} condition key -> minimum value
 */
export function emanationFloors(effects) {
  const out = {};
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (String(effect?.kind ?? "") !== "condition") continue;
    if (!effect.floor) continue;
    const key = String(effect.condition ?? "").trim();
    const value = Math.max(0, Math.trunc(Number(effect.value) || 0));
    if (!key || !value) continue;
    out[key] = Math.max(out[key] ?? 0, value);
  }
  return out;
}

/** Whether this spell imposes any floor at all. */
export function hasEmanationFloor(spellData) {
  return Object.keys(emanationFloors(spellData?.effects)).length > 0;
}

/**
 * What a condition's value becomes, given a proposed value and a floor.
 *
 * RAISES, NEVER LOWERS. A creature frightened 3 that walks into a
 * frightened-1 floor stays frightened 3: the spell sets a minimum, and
 * reading it as "becomes 1" would CURE two points of fear by walking
 * into the thing causing it.
 *
 * @param {number} proposed what the recovery (or the entry) would set
 * @param {number} floor the minimum in force, 0 for none
 */
export function flooredValue(proposed, floor = 0) {
  return Math.max(Math.trunc(Number(proposed) || 0), Math.max(0, Math.trunc(Number(floor) || 0)));
}
