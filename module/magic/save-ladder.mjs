/**
 * A SAVE SPELL THAT PRINTS ITS OWN FOUR OUTCOMES.
 *
 * NEW at 3.585.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE GAP, MEASURED.
 *
 * `resolveSpellSave` handles a BASIC save by arithmetic — none / half /
 * full / full-plus-critical — and everything else by reporting pass or
 * fail and deferring to the effect engine. That works when the spell has
 * effects. Acid Cloud (page 248) prints this:
 *
 *   Critical  The target is unaffected.
 *   Success   The target takes 1d6 acid damage.
 *   Failure   The target takes 2d6 acid damage and a -20 critical injury.
 *   Fumble    The target takes 3d6 acid damage and critical injury.
 *
 * — and carries `effects: []`, so the whole ladder was prose. Its stored
 * damage is 1d6, the SUCCESS rung, applied flat to everybody.
 *
 * MEASURED ACROSS THE PACK: 210 save spells, 95 printing a four-degree
 * ladder, and 33 of those 95 carrying no effects at all. Graham's R12
 * scopes this release to the ones this block reaches — Acid Cloud — and
 * leaves the other 32 to their own pages, so this is deliberately a
 * general mechanism used once rather than a one-spell special case.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SEVEN ROLLED DEGREES, FOUR PRINTED RUNGS.
 *
 * The convention is the one Graham confirmed on 2 September 2026 for the
 * prison ladder and that `elemental-nexus.mjs` already follows: an
 * unnamed degree takes the nearest named one that is NO BETTER than it.
 *
 * This generalises it. The nexus maps only Heroic and Blunder because
 * its spell prints the other five; a ladder missing Partial has to walk
 * further. So `ladderDegree` walks DOWN the ordering from the rolled
 * degree until it finds a rung the spell actually printed — which
 * reproduces the nexus's mapping exactly when all five middles are
 * present, and keeps working when they are not.
 *
 * A rolled Partial against Acid Cloud therefore reads as Failure: the
 * nearest printed rung no better than a partial save. That is harsher
 * than a basic save's Partial (full damage, no critical) and it is what
 * the stated convention gives, so it is what this does rather than a
 * softer number nobody wrote down.
 */

/** Best to worst. The order every walk below follows. */
export const DEGREE_ORDER = Object.freeze([
  "heroic", "critical", "success", "partial", "failure", "fumble", "blunder"
]);

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/**
 * Which printed rung a rolled degree resolves to.
 *
 * @param {object} ladder rung key → dice (an empty string is a PRINTED
 *   rung meaning "no damage", not a missing one — Acid Cloud's Critical)
 * @param {string} rolled the degree actually rolled
 * @returns {string|null} the rung's key, or null when the ladder prints
 *   nothing at or below this degree
 */
function ladderDegree(ladder, rolled) {
  const from = DEGREE_ORDER.indexOf(lower(rolled));
  if (from < 0 || !ladder || typeof ladder !== "object") return null;
  const has = (key) => Object.prototype.hasOwnProperty.call(ladder, key);

  // DOWNWARD FIRST. Walking up would hand a fumbling target the result
  // printed for a success, which is the inversion this whole convention
  // exists to prevent.
  for (let i = from; i < DEGREE_ORDER.length; i += 1) {
    if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];
  }

  /*
   * ─────────────────────────────────────────────────────────────────
   * AND IF NOTHING IS PRINTED BELOW, THE WORST PRINTED RUNG.
   *
   * FOUND BY DRIVING EVERY DEGREE through Acid Cloud before this was
   * wired to anything. A Blunder — the worst save a target can roll —
   * walked down past Fumble, found no "blunder" rung, ran off the end
   * of the ordering and returned null, which `saveLadderOutcome` reads
   * as HARMLESS. The single worst result on the die made the target
   * completely unaffected.
   *
   * The same hole swallowed a Blunder against the elemental nexus's
   * shape too, so it was never about Acid Cloud's missing Partial.
   *
   * "The nearest named degree NO BETTER than it" has no answer when
   * nothing named is that bad — and the honest completion of the rule
   * is the worst thing the spell prints, not nothing at all.
   */
  for (let i = DEGREE_ORDER.length - 1; i >= 0; i -= 1) {
    if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];
  }
  return null;
}

/*
 * ONE PARSER FOR A SET OF RUNGS, AND ONE FOR THEIR CRITICALS.
 *
 * `normaliseRecurringLadder` was written at 3.587.0 by copying
 * `normaliseSaveLadder`'s two loops, and the copy was exact — right down
 * to the dice pattern. The full sweep found it the way this project
 * always finds a duplicate: `mutate-chapter9-241-250` reported ANCHOR
 * AMBIGUOUS on the rung guard, because the line it mutates to prove the
 * guard works now existed twice and mutating one proved nothing.
 *
 * That is the better half of the finding. The worse half is that two
 * copies of "what counts as a rung" would have drifted the first time
 * one of them learned about a new dice shape, on exactly the spells
 * where a mismatch is invisible — a ladder that parses at the cast and
 * refuses at the end of the turn, or the reverse.
 */

/*
 * THREE WORDS A RUNG MAY SAY INSTEAD OF DICE (3.606.0, block 32's R1).
 *
 *   "half" / "full"  A FRACTION OF THE SPELL'S OWN DAMAGE ROLL.
 *
 *     SOUND BURST (page 327) prints "Saving Throw Fortitude" — not Basic
 *     — and then a ladder that reads like one: Success half damage,
 *     Failure full damage and deafened, Fumble full damage and a Minor
 *     critical. It was authored with the deafened rows and nothing else,
 *     and a non-basic save never rolls a spell's damage at all, so the
 *     2d10 the spell stores has never been dealt to anybody. The block 32
 *     audit listed its damage as "already right". It was not; it was
 *     measured by reading the field rather than by asking what reads it.
 *
 *     Marking it Basic would be wrong in the other direction: a basic
 *     Failure adds bonus dice and a critical by margin, and this ladder
 *     prints neither. So the rung says what the page says — half, full —
 *     of ONE roll made for the whole cast, which is what "half damage"
 *     means when a burst catches six creatures.
 *
 *   "margin"  ONE POINT PER POINT OF FAILURE.
 *
 *     SLAY THE SOUL (page 325), Partial: "1 essence damage per point of
 *     failure and a Serious Critical." `valueFromMargin` is that rule
 *     already, written for Nightmare's fatigue; the rung borrows it rather
 *     than restating it.
 *
 * `allowWords` IS FALSE FOR A RECURRING LADDER, which is rolled at the
 * end of a turn long after the cast's damage roll is gone. "Half" of a
 * number that no longer exists is a data error, and so is "margin" there:
 * the recurring sweep rolls a rung's dice and has no margin arm, so the
 * word would reach `new Roll("margin")` and throw mid-turn. Refusing it
 * here is cheaper than discovering it at a turn boundary.
 */
/*
 * AND "DOUBLE" (3.609.0, block 33's R1). WAIL OF THE BANSHEE's Fumble is
 * "The creature takes double damage and a deadly critical"; Incandescence
 * and Touch Of Undeath print the same word on their own Fumbles. Twice the
 * cast's one roll, exactly as "half" is half of it.
 */
const RUNG_WORDS = Object.freeze(["half", "full", "double", "margin"]);
const SHARED_WORDS = Object.freeze(["half", "full", "double"]);

/** Every declared rung, or null if any of them is unparseable. */
function parseLadderRungs(ladderRaw, { allowWords = true } = {}) {
  if (!ladderRaw || typeof ladderRaw !== "object") return null;
  const ladder = {};
  for (const key of DEGREE_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(ladderRaw, key)) continue;
    const dice = text(ladderRaw[key]);
    // An empty rung is legal and means "unaffected" — Acid Cloud's
    // Critical. A rung with unparseable content is not.
    const word = lower(dice);
    if (RUNG_WORDS.includes(word)) {
      if (!allowWords) return null;
      ladder[key] = word;
      continue;
    }
    if (dice && !/^\d+(d\d+)?(\s*\+\s*\d+)?$/i.test(dice)) return null;
    ladder[key] = dice;
  }
  return Object.keys(ladder).length ? ladder : null;
}

/** Does this ladder need the cast's own damage roll? */
export function ladderUsesSharedRoll(spec) {
  return Object.values(spec?.ladder ?? {}).some((v) => SHARED_WORDS.includes(lower(v)));
}

/** A degree list, lower-cased and filtered to real degrees. */
function degreeList(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((d) => lower(d))
    .filter((d) => DEGREE_ORDER.includes(d));
}

/** The severity each rung's critical is rolled at, ignoring anything unknown. */
function parseCriticalOn(raw) {
  const criticalOn = {};
  for (const [key, severity] of Object.entries(raw ?? {})) {
    if (!DEGREE_ORDER.includes(lower(key))) continue;
    if (!["minor", "serious", "deadly"].includes(lower(severity))) continue;
    criticalOn[lower(key)] = lower(severity);
  }
  return criticalOn;
}

/**
 * A save-ladder effect row, or null when it is malformed.
 *
 * MALFORMED IS NULL, NOT A GUESS. A ladder whose dice do not parse is a
 * data error, and resolving it to "no damage" would hide the error
 * behind a spell that quietly does nothing — the exact failure mode this
 * project keeps finding.
 *
 * @param {object} raw the authored effect row
 * @returns {object|null}
 */
export function normaliseSaveLadder(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (lower(raw.kind) !== "saveladder") return null;

  const ladderRaw = raw.ladder;
  if (!ladderRaw || typeof ladderRaw !== "object") return null;

  const ladder = parseLadderRungs(ladderRaw);
  if (!ladder) return null;

  const criticalOn = parseCriticalOn(raw.criticalOn);

  /*
   * A RUNG THAT KILLS OUTRIGHT (3.591.0).
   *
   * MASSACRE'S FUMBLE IS FOUR WORDS: "The creature dies." Not damage, not
   * a condition with a clock \u2014 an outcome, and the only rung in the
   * Grimoire that is one.
   *
   * DECLARED PER DEGREE rather than as a boolean on the row, because the
   * page names WHICH degree kills and a boolean would have to be read
   * alongside the ladder to mean anything. `slaysOn: ["fumble"]` says
   * the same thing the page does, in the same place as `criticalOn`.
   *
   * UNKNOWN DEGREES ARE DROPPED, not refused: a ladder is a real thing
   * with real dice on its other rungs, and voiding all of it over a
   * misspelled degree would lose four working outcomes to fix one.
   * `verify-spell-degrees` is what catches the misspelling.
   */
  const slaysOn = degreeList(raw.slaysOn);

  /*
   * A RUNG THAT PUTS A CREATURE AT A HIT-POINT TOTAL (3.606.0).
   *
   * SLAY THE SOUL, Failure: "The target is reduced to 0 HP and gains the
   * Dying condition." A destination, not an amount — the same sentence
   * Word Of Death's Failure prints, and `enterDyingAt` is already the one
   * place that turns a destination into the Dying rule. Declared per
   * degree beside `slaysOn`, and for the same reason: the page names
   * which degree does it.
   */
  const dropsToOn = {};
  for (const [key, hp] of Object.entries(raw.dropsToOn ?? {})) {
    if (!DEGREE_ORDER.includes(lower(key))) continue;
    if (hp === null || hp === "" || !Number.isFinite(Number(hp))) continue;
    dropsToOn[lower(key)] = Math.trunc(Number(hp));
  }

  /*
   * A RUNG THAT DESTROYS THE SOUL (3.606.0).
   *
   * SOUL DESTRUCTION, Fumble: "The target dies and their soul is destroyed,
   * making resurrection impossible (GM discretion)." The death is
   * `slaysOn`; this is the second half, which only matters later — at the
   * moment somebody casts Resurrection on the body.
   */
  const soulDestroyedOn = degreeList(raw.soulDestroyedOn);

  const criticalModifier = {};
  for (const [key, mod] of Object.entries(raw.criticalModifier ?? {})) {
    if (!DEGREE_ORDER.includes(lower(key))) continue;
    if (!Number.isFinite(Number(mod))) continue;
    criticalModifier[lower(key)] = Math.trunc(Number(mod));
  }

  /*
   * THE CRITICAL "AS IF THE SAVING THROW WAS BASIC" (3.609.0, R2).
   * PORTAL MAELSTROM prints its own damage per rung and then: "each
   * target takes a force critical as if the saving throw was Basic". So
   * the severity is the basic save's, read from the degree AND the margin
   * by `basicSavingThrow`, rather than one fixed severity per rung, which
   * `criticalOn` would have had to guess at.
   */
  const basicCriticals = raw.basicCriticals === true;

  /*
   * A RECURRING RIDER THAT FOLLOWS THE RUNG (3.609.0, R2).
   * INCANDESCENCE: "Success … the object deals no recurring fire damage.
   * Failure … full recurring damage. Fumble … double recurring damage."
   * A multiplier of the spell's own `damage.persistent` (warps included)
   * per rung; a rung not named deals none. The save path never applied a
   * spell's recurring rider at all before this; only the attack path did.
   */
  const persistentOn = {};
  for (const [key, mult] of Object.entries(raw.persistentOn ?? {})) {
    if (!DEGREE_ORDER.includes(lower(key))) continue;
    const m = Number(mult);
    if (!Number.isFinite(m) || m <= 0) continue;
    persistentOn[lower(key)] = m;
  }

  /*
   * DAMAGE NO SAVE TOUCHES (3.609.0, R1). VOLCANIC INFERNO: "creatures in
   * the area and those within 5 feet of the cylinder automatically take
   * 3d6 fire damage from the intense heat, regardless of the results of
   * their saving throws." Rolled once for the cast, dealt to everyone the
   * area caught and everyone within `reachFeet` of it.
   */
  const regardless = normaliseRegardless(raw.regardless);

  return {
    damageType: lower(raw.damageType) || "",
    target: text(raw.target) || "targets",
    basicCriticals,
    persistentOn,
    regardless,
    ladder,
    criticalOn,
    slaysOn,
    dropsToOn,
    soulDestroyedOn,
    criticalModifier,
    note: text(raw.note),
    /*
     * A SECOND LADDER, ON A SECOND SAVE (3.587.0; Graham's R2 of 24
     * September 2026).
     *
     * DISTURBING TENTACLES IS THE FIRST SPELL TO PRINT TWO. Its stat
     * line says "Saving Throw Reflex & Will" and its body means it:
     *
     *   "All creatures are affected based upon their reflex saving
     *    throw" — at the cast, four rungs, damage and a grab.
     *   "Whenever a creature ends its turn in the area … forces a Will
     *    save" — three rungs, mental damage.
     *
     * Graham's ruling settles the shape exactly: the first save is made
     * at the casting for everyone in the area; the second at the END of
     * each turn, for a creature still standing in it.
     *
     * SO IT IS NOT TWO LADDERS ON ONE ROLL. It is one ladder at the
     * cast and a different ladder on a recurring save with its own
     * defence — which is why this is a field on the row rather than a
     * second `saveLadder` row. `resolveSpellSave` finds ONE row per
     * spell (`.find`), so two rows would have silently used the first
     * and dropped the second; and a reader who found two would have no
     * way to know which was the cast's.
     */
    recurring: normaliseRecurringLadder(raw.recurring)
  };
}

/** The `regardless` block of a ladder row, or null. */
function normaliseRegardless(raw) {
  if (!raw || typeof raw !== "object") return null;
  const formula = text(raw.formula);
  if (!/^\d+(d\d+)?(\s*\+\s*\d+)?$/i.test(formula)) return null;
  const type = lower(raw.type);
  if (!type) return null;
  return { formula, type, reachFeet: Math.max(0, Math.trunc(Number(raw.reachFeet) || 0)) };
}

/** The flag a Region carries when it owes a recurring ladder. */
export const RECURRING_LADDER_FLAG = "recurringLadder";

/** The save a recurring ladder is rolled against. */
const RECURRING_SAVES = Object.freeze(["fortitude", "reflex", "will"]);
/** When it is rolled. Only one moment so far; named rather than assumed. */
const RECURRING_WHEN = Object.freeze(["endOfTurn", "startOfTurn"]);

/**
 * The second ladder, or null when the spell prints only one.
 *
 * NULL FOR EVERY SPELL THAT CAME BEFORE, which is what keeps the six
 * existing `saveLadder` spells untouched — they declare no `recurring`
 * and this returns null without reading anything else.
 *
 * REFUSED RATHER THAN GUESSED when the save or the moment is unknown,
 * for the reason `normaliseSaveLadder` refuses unparseable dice: a
 * recurring ladder nobody can roll is worse than one that fails to load,
 * because the spell goes on working and the second half is silent.
 *
 * @param {object} raw the `recurring` block as authored
 * @returns {object|null}
 */
export function normaliseRecurringLadder(raw) {
  if (!raw || typeof raw !== "object") return null;

  const save = lower(raw.save);
  if (!RECURRING_SAVES.includes(save)) return null;
  const when = text(raw.on) || "endOfTurn";
  if (!RECURRING_WHEN.includes(when)) return null;

  const ladder = parseLadderRungs(raw.ladder, { allowWords: false });
  if (!ladder) return null;

  const criticalOn = parseCriticalOn(raw.criticalOn);

  // A DAMAGE LADDER MUST NAME ITS TYPE, the same rule `normalisePerTurn`
  // applies: an empty type means "the weapon's own" elsewhere, and a
  // ladder that forgot one must not inherit that meaning.
  const damageType = lower(raw.damageType);
  if (!damageType) return null;

  // "AS IF THE SAVING THROW WAS BASIC" ON A TURN'S SAVE TOO (3.609.0) —
  // Portal Maelstrom's force critical, owed every time a creature begins
  // its turn in the maelstrom. See `basicCriticals` above.
  return { save, on: when, damageType, ladder, criticalOn, basicCriticals: raw.basicCriticals === true };
}

/**
 * What one target's rolled degree produces.
 *
 * @param {object} spec a normalised ladder
 * @param {string} rolled the degree rolled
 * @returns {{rung: string|null, dice: string, harmless: boolean,
 *   severity: string|null, modifier: number}}
 */
export function saveLadderOutcome(spec, rolled, { basicSeverity = null } = {}) {
  const rung = ladderDegree(spec?.ladder ?? {}, rolled);
  if (!rung) {
    return { rung: null, dice: "", harmless: true, severity: null, modifier: 0, persistent: 0 };
  }
  const dice = text(spec.ladder[rung]);
  const slays = (spec.slaysOn ?? []).includes(rung);
  // A BASIC-SAVE CRITICAL COMES FROM THE ROLL, NOT THE RUNG (3.609.0).
  // `basicSeverity` is `basicSavingThrow(degree, margin).criticalSeverity`,
  // worked out by the caller that holds the margin.
  const severity = spec.basicCriticals
    ? (basicSeverity || null)
    : (spec.criticalOn?.[rung] ?? null);
  const persistent = Number(spec.persistentOn?.[rung] ?? 0) || 0;
  const dropsTo = Object.prototype.hasOwnProperty.call(spec.dropsToOn ?? {}, rung)
    ? spec.dropsToOn[rung] : null;
  const soulDestroyed = (spec.soulDestroyedOn ?? []).includes(rung);
  return {
    rung,
    dice,
    // A KILLING RUNG IS NEVER HARMLESS, whatever its dice say. Massacre's
    // fumble prints no damage at all and is the worst outcome on the
    // ladder; reading "no dice" as "unaffected" would have made it the
    // best one.
    //
    // AND NEITHER IS A RUNG WITH NO DICE THAT STILL DOES SOMETHING
    // (3.606.0). Soul Destruction's Success is "4d10 Soul Drain and a
    // minor critical" — no damage for this row to roll, a critical it
    // must still land, and the Soul Drain on its own gated `resource`
    // row. Slay The Soul's Failure is a destination. Reading either as
    // "unaffected" would have printed the second-worst outcome on each
    // ladder as the best one — the Massacre defect a third time.
    harmless: !dice && !slays && !severity && dropsTo === null && !soulDestroyed && !persistent,
    persistent,
    slays,
    dropsTo,
    soulDestroyed,
    severity,
    // THE -20 IS A MODIFIER ON THE INJURY ROLL, not a weaker severity.
    // Acid Cloud distinguishes its Failure from its Fumble by exactly
    // that — "a -20 critical injury" against plain "critical injury" —
    // so the difference is carried where the page puts it.
    modifier: Number(spec.criticalModifier?.[rung] ?? 0) || 0
  };
}

/**
 * The card line for one target.
 *
 * @param {string} name the target's name
 * @param {string} rolled the degree rolled
 * @param {object} outcome the result of `saveLadderOutcome`
 * @param {number} taken damage actually taken after defences
 * @param {string} damageType
 * @returns {string}
 */
export function saveLadderLine(name, rolled, outcome, taken, damageType) {
  const degree = String(rolled ?? "").trim();
  const label = degree ? degree.charAt(0).toUpperCase() + degree.slice(1) : "—";
  const via = outcome?.rung && outcome.rung !== lower(degree)
    ? ` (read as ${outcome.rung})`
    : "";
  if (outcome?.harmless) return `<strong>${name}</strong> — ${label}${via}: unaffected.`;
  const injury = outcome?.severity
    ? `a ${outcome.severity} critical injury${outcome.modifier ? ` at ${outcome.modifier}` : ""}`
    : "";
  /*
   * A RUNG WITH NO DAMAGE DOES NOT PRINT "0 DAMAGE" (3.606.0). Soul
   * Destruction's Partial rolls nothing on this row — its Soul Drain is a
   * `resource` row with its own line — and "0 essence damage, and a
   * serious critical injury" would read like a resisted blow rather than
   * the page's outcome. Slay The Soul's Failure and Fumble say what they
   * do on lines of their own, pushed by the workflow after this one.
   */
  if (!outcome?.dice) {
    const parts = [];
    if (injury) parts.push(injury);
    if (outcome?.dropsTo !== null && outcome?.dropsTo !== undefined) {
      parts.push(`reduced to ${outcome.dropsTo} HP`);
    }
    if (outcome?.slays) parts.push("slain");
    return `<strong>${name}</strong> — ${label}${via}: ${parts.join(", ") || "affected"}.`;
  }
  return `<strong>${name}</strong> — ${label}${via}: <strong>${taken}</strong> ${damageType} damage`
    + `${injury ? `, and ${injury}` : ""}.`;
}

/**
 * The amount one rung deals, before defences.
 *
 * ONE DOOR FOR ALL THREE KINDS OF RUNG, so the workflow cannot handle
 * dice and forget the words — which is the shape of the Sound Burst
 * defect this release exists for: a damage figure stored where nothing
 * that deals damage would ever look.
 *
 * @param {object} outcome from `saveLadderOutcome`
 * @param {object} context
 * @param {number|null} context.shared the cast's own damage roll, or null
 * @param {number|null} context.margin this target's save margin, or null
 * @param {function} context.fromMargin `valueFromMargin`, passed in so this
 *   file stays free of the condition-timing module's imports
 * @returns {{formula: string|null, fixed: number|null, why: string}}
 *   `formula` to roll, or `fixed` already decided, or neither with `why`
 */
export function ladderRungAmount(outcome, { shared = null, margin = null, fromMargin = null } = {}) {
  const dice = lower(outcome?.dice);
  if (!dice) return { formula: null, fixed: null, why: "" };
  if (SHARED_WORDS.includes(dice)) {
    if (shared === null || shared === undefined || !Number.isFinite(Number(shared))) {
      return { formula: null, fixed: null, why: "no damage roll to take a share of" };
    }
    const total = Math.max(0, Math.trunc(Number(shared)));
    const fixed = dice === "half" ? Math.floor(total / 2) : dice === "double" ? total * 2 : total;
    return { formula: null, fixed, why: "" };
  }
  if (dice === "margin") {
    const value = typeof fromMargin === "function" ? fromMargin(margin, 1, 0) : null;
    if (value === null) return { formula: null, fixed: null, why: "no save margin to measure" };
    return { formula: null, fixed: value, why: "" };
  }
  return { formula: outcome.dice, fixed: null, why: "" };
}
