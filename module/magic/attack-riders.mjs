/**
 * WHAT A DAMAGE SPELL DOES BESIDE ITS DICE — four riders from block 32.
 *
 * NEW at 3.608.0, for Graham's R3 of the pages 321–330 audit ("R1 - R8 go
 * with your recommendation", 29 September 2026). Pure; no Foundry. The
 * workflow half is in cast-workflow.mjs, at the one place each rider can
 * be asked: the attack path, the injury roll, and the basic save.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SHOCKING GRASP (PP 2, page 324)
 *   "If the target is wearing metal armour or is made of metal, you gain a
 *    +1-circumstance bonus to your attack roll with shocking grasp, and the
 *    target also takes 1 recurring electricity damage on a hit. On a
 *    critical hit, double the recurring damage."
 *   The pack stored the recurring 1 as unconditional — every hit on
 *   anybody burned — and the +1 not at all.                → `metal`
 *
 * SHOCK BOLT (PP 4, page 324)
 *   "If the attack inflicts a critical injury, all adjacent targets who are
 *    wearing metal armour take half damage (basic Reflex)."   → `critSplash`
 *
 * SONIC BOLT (PP 6, page 327)
 *   "If the attack inflicts a critical, it bypasses light armour when
 *    reading the critical result."  Warp: "+2 PP: the type of armour
 *    ignored increases by one step."                     → `critArmourBypass`
 *
 * SONIC RUPTURE (PP 20, page 327), Basic Fortitude, 30-foot cone
 *   "inflicting 4d6 Bleed damage to living beings in the area of effect.
 *    Creatures which are immune to bleed take 5d8 sonic damage instead due
 *    to the vibrations (even those usually immune to such damage)."
 *                                          → `asCondition` + `immuneAlternate`
 *
 * ─────────────────────────────────────────────────────────────────────
 * READINGS, each said on the release notes rather than settled in silence:
 *
 *   "MADE OF METAL" is a creature carrying the `metal` trait. No creature in
 *   the bestiary declares it yet, so today the rider is metal ARMOUR; a GM
 *   gives an iron golem the trait and the spell sees it.
 *
 *   "WEARING METAL ARMOUR" is any equipped armour piece with the Metal
 *   trait, wherever it sits — the spell asks what the creature wears, not
 *   where it was struck.
 *
 *   "BLEED DAMAGE" IS BLEEDING. Chapter 7's Bleed Damage section defines it
 *   as HP lost at the end of each turn until stopped, and the alchemical
 *   bombs' "1 bleed damage" has applied Bleeding since block 21's D3. The
 *   pack stored `bleed` as a damage TYPE, which no table in the system
 *   defines, so it landed once as untyped physical damage and armour
 *   reduced it. Now the save scales the roll and the result is the
 *   Bleeding value.
 *
 *   "IMMUNE TO BLEED" is immune to the Bleeding condition — which is what
 *   the undead, constructs and every creature typed as bloodless declare.
 */

/** The three steps of armour a bypass can climb, lightest first. */
export const ARMOUR_STEPS = Object.freeze(["light", "medium", "heavy"]);

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/* ── METAL ─────────────────────────────────────────────────────────── */

/**
 * Does this creature wear metal armour? Any EQUIPPED armour item carrying
 * the Metal trait.
 *
 * @param {Array<object>} items the creature's items
 */
export function wearsMetalArmour(items) {
  return Array.from(items ?? []).some((item) => item?.type === "armour"
    && item.system?.equipped
    && /\bmetal\b/i.test(String(item.system?.traits ?? "")));
}

/**
 * Wearing metal armour OR made of metal.
 *
 * @param {Array<object>} items
 * @param {boolean} madeOfMetal the caller's answer to `hasCreatureTrait(sys, "metal")`
 */
export function isMetalTarget(items, madeOfMetal = false) {
  return Boolean(madeOfMetal) || wearsMetalArmour(items);
}

/**
 * A spell's metal affinity, or null.
 *
 *   { attack: 1, recurringOnlyVsMetal: true, doubleOnCritical: true }
 *
 * `attack` is a CIRCUMSTANCE bonus — the page's own word — so it enters the
 * attack pool and stacks the way every other circumstance bonus does.
 */
export function normaliseMetalAffinity(raw) {
  if (!raw || typeof raw !== "object") return null;
  const attack = Math.trunc(Number(raw.attack ?? 0));
  if (!Number.isFinite(attack) || attack < 0) return null;
  const spec = {
    attack,
    recurringOnlyVsMetal: raw.recurringOnlyVsMetal === true,
    doubleOnCritical: raw.doubleOnCritical === true
  };
  if (!spec.attack && !spec.recurringOnlyVsMetal && !spec.doubleOnCritical) return null;
  return spec;
}

/** The attack-pool row a metal target earns, or null. */
export function metalAttackRow(spec, isMetal, spellName = "") {
  if (!spec || !isMetal || !spec.attack) return null;
  return {
    label: `${text(spellName) || "The spell"} vs metal`,
    value: spec.attack,
    type: "circumstance"
  };
}

/**
 * What the recurring rider does against this target.
 *
 * @param {object|null} spec from `normaliseMetalAffinity`
 * @param {{isMetal: boolean, critical: boolean, amount: number}} context
 * @returns {{applies: boolean, amount: number, doubled: boolean}}
 */
export function metalRecurring(spec, { isMetal = false, critical = false, amount = 0 } = {}) {
  const base = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!spec) return { applies: base > 0, amount: base, doubled: false };
  if (spec.recurringOnlyVsMetal && !isMetal) return { applies: false, amount: 0, doubled: false };
  const doubled = Boolean(spec.doubleOnCritical && critical);
  return { applies: base > 0, amount: doubled ? base * 2 : base, doubled };
}

/* ── A CRITICAL THAT ARCS TO THE NEIGHBOURS ────────────────────────── */

/**
 * `{ fraction: 0.5, save: "reflex", basic: true, requires: "metalArmour",
 *    reachFeet: 5, label }`, or null.
 *
 * "HALF DAMAGE (BASIC REFLEX)" IS TWO STEPS: half of what the bolt rolled
 * becomes the number each neighbour's basic save scales. A neighbour who
 * fails takes the half; one who succeeds takes half of that.
 */
export function normaliseCritSplash(raw) {
  if (!raw || typeof raw !== "object") return null;
  const fraction = Number(raw.fraction ?? 0.5);
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) return null;
  const save = lower(raw.save || "reflex");
  if (!SAVES.includes(save)) return null;
  const requires = lower(raw.requires);
  if (requires && requires !== "metalarmour") return null;
  const reach = Math.trunc(Number(raw.reachFeet ?? 5));
  if (!Number.isFinite(reach) || reach < 5) return null;
  return {
    fraction,
    save,
    basic: raw.basic !== false,
    requires: requires ? "metalArmour" : "",
    reachFeet: reach,
    label: text(raw.label)
  };
}

/** The number each neighbour's save scales. Rounded down, as damage is. */
export function critSplashAmount(spec, rolled) {
  if (!spec) return 0;
  return Math.max(0, Math.floor((Number(rolled) || 0) * spec.fraction));
}

/**
 * Is this creature one the arc reaches?
 *
 * THE STRUCK TARGET IS NOT ITS OWN NEIGHBOUR, and a creature further than
 * the reach is not adjacent. The CASTER IS NOT EXCLUDED: "all adjacent
 * targets" is everyone beside the struck creature, and a wizard who bolts a
 * knight from the next square is standing in the arc.
 */
export function critSplashCatches(spec, { isStruck = false, feet = null, wearsMetal = false } = {}) {
  if (!spec || isStruck) return false;
  const d = Number(feet);
  if (feet === null || !Number.isFinite(d) || d > spec.reachFeet) return false;
  if (spec.requires === "metalArmour" && !wearsMetal) return false;
  return true;
}

/** The card's opening line for the arc. */
export function critSplashLine(spellName, amount, caught, spec) {
  const req = spec?.requires === "metalArmour" ? " wearing metal armour" : "";
  // NOBODY TO ARC TO IS SAID IN ONE CLAUSE (3.608.2): the 3.608.1 drive
  // printed "…: nobody. 7 damage, basic Reflex." — a number for no one.
  if (!caught.length) {
    return `<em>${text(spellName) || "The spell"}'s critical finds no adjacent creature${req} to arc to.</em>`;
  }
  const who = caught.join(", ");
  return `<strong>${text(spellName) || "The spell"} arcs</strong> — the critical reaches every creature `
    + `adjacent${req}: ${who}. ${amount} damage, basic ${spec.save.charAt(0).toUpperCase()}${spec.save.slice(1)}.`;
}

/* ── A CRITICAL THAT IGNORES ARMOUR ────────────────────────────────── */

/**
 * The armour categories a critical ignores when its table is read.
 *
 * `raw` is the spell's `critArmourBypass` ("light"); `steps` the warp's
 * `armourStep` total. Light plus one step ignores light AND medium, plus
 * two ignores all three. Clamped at heavy: a third step has nowhere to go.
 *
 * "OTHER" ARMOUR IS NEVER IGNORED — helms, shields' straps and the pieces
 * with no weight class are not "light armour", and a rule that names a
 * step does not reach what has none.
 *
 * @returns {string[]} lower-case categories, lightest first; [] for none
 */
export function armourBypassCategories(raw, steps = 0) {
  const start = ARMOUR_STEPS.indexOf(lower(raw));
  if (start < 0) return [];
  const extra = Math.max(0, Math.trunc(Number(steps) || 0));
  const top = Math.min(ARMOUR_STEPS.length - 1, start + extra);
  return ARMOUR_STEPS.slice(0, top + 1);
}

/** Is this armour piece one the critical reads straight through? */
function armourPieceBypassed(item, categories) {
  if (!item || item.type !== "armour" || !categories?.length) return false;
  return categories.includes(lower(item.system?.category));
}

/** The items a critical's table should see — the bypassed armour removed. */
export function itemsSeenByCritical(items, categories) {
  const list = Array.from(items ?? []);
  if (!categories?.length) return list;
  return list.filter((item) => !armourPieceBypassed(item, categories));
}

/** The card line, said when the bypass changed what the table reads. */
export function armourBypassLine(spellName, categories, ignoredNames) {
  const cats = categories.join(" and ");
  return `<em>${text(spellName) || "The spell"}'s critical bypasses ${cats} armour — `
    + `${ignoredNames.join(", ")} ${ignoredNames.length === 1 ? "is" : "are"} not read.</em>`;
}

/* ── DAMAGE THAT IS A CONDITION, AND WHAT THE IMMUNE TAKE INSTEAD ─── */

/**
 * `damage.asCondition`: `{ condition: "bleeding", criticalType: "sonic" }`,
 * or null. The save scales the roll as it scales any basic damage, and the
 * result is the condition's value instead of hit points.
 *
 * `criticalType` is the table a fumbled save reads — "bleed" names no
 * critical table, and the fallback (slashing) would give a scream a sword's
 * wounds. Sonic Rupture is a sonic spell.
 */
export function normaliseConditionDamage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const condition = text(raw.condition);
  if (!condition) return null;
  return { condition, criticalType: lower(raw.criticalType) || "" };
}

/**
 * `damage.immuneAlternate`: what a creature immune to the spell's damage
 * takes instead, or null.
 *
 *   { immuneTo: "bleeding", formula: "5d8", type: "sonic", ignoresImmunity: true }
 *
 * `immuneTo` is a CONDITION key when the spell's damage is a condition (as
 * Sonic Rupture's is), which is the immunity the page names.
 */
export function normaliseImmuneAlternate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const formula = text(raw.formula);
  const type = lower(raw.type);
  const immuneTo = text(raw.immuneTo);
  if (!formula || !type || !immuneTo) return null;
  if (!/^\d*d\d+([+-]\d+)?$|^\d+$/i.test(formula.replace(/\s+/g, ""))) return null;
  return { immuneTo, formula, type, ignoresImmunity: raw.ignoresImmunity === true };
}

/** The card line for a creature taking the alternate. */
export function immuneAlternateLine(name, degreeLabel, spec, taken, newHP = null) {
  return `${name}: <strong>${degreeLabel}</strong> — immune to ${spec.immuneTo}, takes the vibration instead: `
    + `<strong>${taken}</strong> ${spec.type}${spec.ignoresImmunity ? " (its immunity to that does not apply)" : ""}`
    + `${newHP !== null && newHP !== undefined ? ` — now ${newHP} HP` : ""}.`;
}
