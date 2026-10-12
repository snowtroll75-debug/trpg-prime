/**
 * The ten Chapter 5 feats that hand you something — a spell, an ally, a
 * rune, an extra round, a second chance at your own casting.
 *
 *   INJURY RELIEF        cast Self Healing as an innate spell with Focus.
 *   INSPIRED             gain the Inspiration Specialist Spell.
 *   MERCY OF RELIEF      Crusader's Mercy may duplicate Restoration.
 *   SECOND ALLY          select an additional Divine Ally.
 *   RADIANT BLADE        Blade Ally may also take Aligned and Flaming.
 *   SACRED WEAPON        a favoured weapon becomes a divine focus and a
 *                        +1 Divine Spell Adder for a year.
 *   ANIMAL SOUL          refuse a spell that could not affect both your
 *                        creature type and your companion's.
 *   ECHOING PERFORMANCE  a lingering performance lasts a round longer,
 *                        and two may run at once.
 *   WARP MANIPULATION    after a cast that beat its DC by 2, add warping.
 *   REACTIVE STANCE      enter a known Stance free when you roll
 *                        initiative.
 *
 * WHAT THEY SHARE IS A SHAPE, not a mechanism: each widens something the
 * system already decides — a list, a count, a budget, a gate. So none of
 * them owns its own machinery, and every one of these functions is a
 * modifier to somebody else's answer rather than an answer of its own.
 * That is exactly why they are worth keeping together and worth keeping
 * pure: the widening is the whole rule, and it is one line each.
 */

const has = (featNames, name) => Array.from(featNames ?? [])
  .some((n) => String(n).trim().toLowerCase() === name);

/* ------------------------------------------------------------------ */
/* Second Ally                                                         */
/* ------------------------------------------------------------------ */

/**
 * How many Divine Allies this Crusader may hold.
 *
 * "You may select an ADDITIONAL Divine Ally from those available to you."
 * One more, not a free hand: the choice is still made from `DIVINE_ALLIES`
 * and still cannot be changed once made, which is why the count is what
 * this answers and the picking stays where it already was.
 */
export function divineAllyLimit(featNames = []) {
  return has(featNames, "second ally") ? 2 : 1;
}

/**
 * Which allies are still open to a Crusader who has already chosen some.
 *
 * DISTINCT, because "an additional Divine Ally from those available" is a
 * second ally rather than a second helping of the first — and because the
 * three do not stack with themselves in any way the chapter describes: a
 * second Shield Ally would be +1 to the same shield bonus twice, which is
 * the "multiple Shield bonuses do not stack" rule the sheet already keeps.
 *
 * @param {string[]} allAllies  every ally the class offers
 * @param {string[]} chosen     the ones already taken
 * @param {string[]} featNames
 * @returns {{open: string[], remaining: number}}
 */
export function divineAlliesOpen(allAllies = [], chosen = [], featNames = []) {
  const taken = new Set(Array.from(chosen).map((c) => String(c).trim().toLowerCase()));
  const remaining = Math.max(0, divineAllyLimit(featNames) - taken.size);
  return {
    open: remaining ? Array.from(allAllies).filter((a) => !taken.has(String(a).trim().toLowerCase())) : [],
    remaining
  };
}

/* ------------------------------------------------------------------ */
/* Radiant Blade                                                       */
/* ------------------------------------------------------------------ */

/** The two runes Radiant Blade adds to the Blade Ally list. */
export const RADIANT_BLADE_RUNES = Object.freeze(["Aligned", "Flaming"]);

/**
 * The runes a Blade Ally may take today.
 *
 * "You may add the aligned and flaming weapon property runes to the list
 * that you may select during daily preparation. Any aligned trait that you
 * select must match that of your deific aspect or deity."
 *
 * THE ALIGNMENT CLAUSE IS NOT A SECOND RUNE. Aligned is one rune whose
 * trait is fixed by your faith, so it is offered with that alignment
 * already written into it rather than as a free choice the player could
 * get wrong — and a Crusader whose deity has no alignment to match is not
 * offered it at all, which is the honest answer to a requirement that
 * cannot be met.
 *
 * @param {string[]} baseRunes  BLADE_ALLY_RUNES
 * @param {string[]} featNames
 * @param {string} alignment    the deity or aspect's alignment, or ""
 * @returns {string[]} the list to offer, base runes first
 */
export function bladeAllyRuneChoices(baseRunes = [], featNames = [], alignment = "") {
  const base = Array.from(baseRunes);
  if (!has(featNames, "radiant blade")) return base;
  const aligned = String(alignment ?? "").trim();
  return [
    ...base,
    ...(aligned ? [`Aligned (${aligned})`] : []),
    "Flaming"
  ];
}

/* ------------------------------------------------------------------ */
/* Echoing Performance                                                 */
/* ------------------------------------------------------------------ */

/**
 * "Your lingering performance now lasts an additional round, and you may
 * have two lingering performances running at any one time."
 *
 * BOTH HALVES FROM ONE ANSWER, because both are read at the same moment —
 * when a composition spell ends and its lingering effect is created — and
 * splitting them would let one be applied without the other.
 *
 * @param {string[]} featNames
 * @returns {{extraRounds: number, concurrent: number}}
 */
export function lingeringPerformanceLimits(featNames = []) {
  return has(featNames, "echoing performance")
    ? { extraRounds: 1, concurrent: 2 }
    : { extraRounds: 0, concurrent: 1 };
}

/**
 * How long a lingering performance lasts: Charisma rounds, plus Echoing
 * Performance's extra round.
 */
export function lingeringRounds(charisma, featNames = []) {
  const cha = Math.max(0, Math.floor(Number(charisma) || 0));
  return cha + lingeringPerformanceLimits(featNames).extraRounds;
}

/* ------------------------------------------------------------------ */
/* Warp Manipulation                                                   */
/* ------------------------------------------------------------------ */

/** The margin a cast must beat its DC by before the feat offers anything. */
export const WARP_MANIPULATION_MARGIN = 2;

/**
 * "After successfully casting a spell, you may add a warping option of up
 * to 2 PP… If the result of the spell is a Critical, you may add a warping
 * option of up to 4. This replaces the usual benefit of achieving a
 * Critical on your spell check."
 *
 * WHEN, NOT JUST WHETHER. Graham's ruling, 21 August 2026: the offer comes
 * after the check and BEFORE the effects land. A warp changes duration,
 * damage and Save DC, all of which are spent by the time a cast has
 * finished resolving — so offering it "afterwards" in the literal sense
 * would mean undoing a resolved spell and doing it again, which is two
 * passes over one question. After the check the margin is known and
 * nothing has been applied yet, which is both the printed intent and the
 * only point where every warp still works.
 *
 * THE CRITICAL IS A TRADE, and the caller must be told so: taking the
 * larger allowance costs you the halved base PP a Critical would otherwise
 * have paid for. `waivesCritical` says which.
 *
 * @param {object} state
 * @param {string} state.degree  the casting check's degree
 * @param {number} state.margin  how far the check beat its DC
 * @param {string[]} state.featNames
 * @returns {{allowance: number, waivesCritical: boolean}}
 */
export function warpManipulationOffer({ degree = "", margin = 0, featNames = [] } = {}) {
  const none = { allowance: 0, waivesCritical: false };
  if (!has(featNames, "warp manipulation")) return none;
  // "SUCCESSFULLY casting" — a Partial does not cast at all, and a Heroic
  // is a success by any reading. Failure and worse never reach this.
  if (!["heroic", "critical", "success"].includes(String(degree))) return none;
  if (Number(margin) < WARP_MANIPULATION_MARGIN) return none;
  return String(degree) === "critical"
    ? { allowance: 4, waivesCritical: true }
    : { allowance: 2, waivesCritical: false };
}

/**
 * Does a chosen warp fit the allowance the feat granted?
 *
 * REFUSED RATHER THAN TRIMMED, the same discipline the innate warp budget
 * already follows: silently dropping the options that did not fit would
 * cast a different spell from the one the player chose, and they cannot
 * see which ones survived.
 */
export function warpManipulationFits(rawPP, allowance) {
  const spent = Math.max(0, Math.floor(Number(rawPP) || 0));
  const budget = Math.max(0, Math.floor(Number(allowance) || 0));
  return { ok: spent <= budget, spent, budget, over: Math.max(0, spent - budget) };
}

/**
 * What a warp selection made under Warp Manipulation costs, and whether it
 * fits the allowance.
 *
 * WHICH FIELD IS READ IS THE WHOLE FUNCTION, and it lives here rather than
 * at the dialog for exactly that reason. `aggregateWarpSelection` returns
 * two numbers: `rawPP` is only the manual "Extra PP" box, and `ppSpent` is
 * that plus every ticked option's cost. Budgeting against `rawPP` — which
 * is what the code did until 3.359.1, found live — measured a warp chosen
 * by TICKING A BOX as 0 PP: it fit trivially, then failed the `spent > 0`
 * test and the entire selection was discarded without a word. Magic
 * Missile's +4 PP option, 21 Aug 2026, went off at its base cost of 2 with
 * the feat inert.
 *
 * It sat inside the cast workflow, where no harness could call it, so the
 * regression it guards against was pinned only by a regex over the source.
 * Extracted at 3.361.0 so the choice of field can be driven.
 *
 * @param {{ppSpent?: number, rawPP?: number}} selection an aggregate warp
 * @param {number} allowance from `warpManipulationOffer`
 * @returns {{ok: boolean, spent: number, budget: number, over: number, applies: boolean}}
 */
export function warpManipulationSpend(selection, allowance) {
  const fit = warpManipulationFits(selection?.ppSpent, allowance);
  return { ...fit, applies: fit.ok && fit.spent > 0 };
}

/* ------------------------------------------------------------------ */
/* Animal Soul                                                         */
/* ------------------------------------------------------------------ */

/**
 * "You can choose not to allow spells and effects to affect you if they
 * would not be capable of affecting both your creature type and that of
 * your animal companion."
 *
 * THE GATE IS ALREADY THERE. `kindGate` on a spell says which creature
 * kind it can touch (kind-gate.mjs); this asks whether that gate would
 * shut the companion out while letting the Druid through. If it would,
 * the Druid may step out with it.
 *
 * A SPELL THAT GATES NOBODY REACHES BOTH, so there is nothing to refuse —
 * which is most spells, and the reason this costs a comparison rather
 * than a prompt in the ordinary case.
 *
 * ASKED EVEN WHEN THE SPELL IS KIND, per Graham's ruling of 21 August
 * 2026: the printed rule is "you can choose", and guessing which spells a
 * player would want to refuse means occasionally guessing wrong about a
 * heal. The prompt is the rule.
 *
 * @param {object} state
 * @param {string[]} state.featNames
 * @param {string} state.kindGate         the spell's kind gate, "" if none
 * @param {string[]} state.ownTypes       the caster-target's creature types
 * @param {string[]} state.companionTypes the companion's creature types
 * @param {boolean} state.hasCompanion
 * @returns {{refusable: boolean, reason: string}}
 */
export function animalSoulRefusable({
  featNames = [], kindGate = "", ownTypes = [], companionTypes = [], hasCompanion = true
} = {}) {
  if (!has(featNames, "animal soul")) return { refusable: false, reason: "" };
  // "THAT OF YOUR ANIMAL COMPANION" — no companion, no second type to
  // fail the test, so nothing to step out of. The feat's own prerequisite
  // is Animal Companion, but a companion can die.
  if (!hasCompanion) return { refusable: false, reason: "no animal companion" };
  const gate = String(kindGate ?? "").trim().toLowerCase();
  if (!gate) return { refusable: false, reason: "affects every kind" };

  const matches = (types) => Array.from(types)
    .some((t) => String(t).trim().toLowerCase() === gate);
  const reachesMe = matches(ownTypes);
  const reachesCompanion = matches(companionTypes);
  if (reachesMe && !reachesCompanion) {
    return { refusable: true, reason: `it cannot touch your companion's kind (${gate})` };
  }
  return { refusable: false, reason: "it reaches both of you" };
}

/* ------------------------------------------------------------------ */
/* Sacred Weapon                                                       */
/* ------------------------------------------------------------------ */

/** The Divine Spell Adder rating a Sacred Weapon carries. */
export const SACRED_WEAPON_ADDER = 1;
/** How long the etching lasts, in days. */
export const SACRED_WEAPON_DAYS = 365;

/**
 * "This symbol remains for a full year, however if you etch a symbol onto
 * a different weapon, the original one instantly vanishes."
 *
 * THE SECOND CLAUSE IS THE ONE THAT MATTERS, and it is the whole reason
 * this is a function rather than a flag: a year is long enough that no
 * table will ever see it expire, but etching a new symbol happens the
 * moment a Crusader finds a better sword. Answered as "which items should
 * stop being sacred", so the caller cannot forget one.
 *
 * @param {Array<{id: string}>} etched  every item currently carrying one
 * @param {string} keepId               the weapon being etched now
 * @returns {string[]} the ids whose symbol vanishes
 */
export function sacredWeaponSuperseded(etched = [], keepId = "") {
  return Array.from(etched)
    .filter((item) => item?.id && item.id !== keepId)
    .map((item) => item.id);
}

/* ------------------------------------------------------------------ */
/* Mercy of Relief, Injury Relief, Inspired, Reactive Stance           */
/* ------------------------------------------------------------------ */

/**
 * "When using your Crusaders Mercy ability, instead of healing hit points
 * you may INSTEAD CHOOSE to duplicate the effects of a restoration spell."
 *
 * An either/or at the moment the ability is used, so what this answers is
 * whether the choice exists — the ability's own workflow already knows how
 * to heal, and the spell engine already knows how to cast Restoration.
 */
export function mercyOfReliefOffered(featNames = []) {
  return has(featNames, "mercy of relief");
}

/**
 * "Action Free; Trigger You roll initiative. Enter any one known Stance."
 *
 * The stances a character knows are their own Stance-trait feats, and
 * entering one is what those feats already do — so this answers only
 * which of them may be entered free at initiative, and leaves the entering
 * to the feat that owns it.
 *
 * @param {string[]} featNames        every feat the character has
 * @param {Array<{name: string, traits: string}>} items
 * @returns {{offered: boolean, stances: string[]}}
 */
export function reactiveStanceOptions(featNames = [], items = []) {
  if (!has(featNames, "reactive stance")) return { offered: false, stances: [] };
  const stances = Array.from(items)
    .filter((i) => i?.type === "feat" && /\bstance\b/i.test(String(i.system?.traits ?? "")))
    .map((i) => i.name);
  return { offered: stances.length > 0, stances };
}
