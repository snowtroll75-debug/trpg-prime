/**
 * Creature auras — the mechanism a dozen of the Codex's abilities need.
 *
 * The Codex gives the Aura trait a real definition, and Graham confirmed
 * it verbatim:
 *
 *   "An effect that has this trait emanates from the target (usually)
 *    its creator in a predefined radius. The radius moves with the
 *    target and any creature that either begins its turn, or moves into
 *    the radius is subjected to its effects."
 *
 * Three things follow from that sentence, and each is a decision this
 * file records rather than assumes:
 *
 * 1. THE RADIUS MOVES. So an aura is not a template placed once. It is a
 *    property of the emitting token, redrawn wherever that token goes.
 * 2. TWO TRIGGERS, NOT ONE. Beginning a turn inside, and moving in.
 *    A creature that is already inside and does not move is caught by
 *    the first and not the second, which is why both exist.
 * 3. "SUBJECTED TO ITS EFFECTS" IS NOT "SUFFERS THEM". Every aura in the
 *    chapter that does anything offers a saving throw, so the trigger
 *    opens the roll rather than applying the outcome.
 *
 * WHAT STOPS IT FIRING FOREVER. Nothing in the trait itself — the
 * ABILITY carries that. Stench prints "a creature is immune for one
 * minute after making a save", and that is the shape used here: an
 * immunity window in seconds, recorded per creature per aura when a save
 * is made. Inventing a per-round limit would have been the obvious
 * guess and the wrong one; the document already answers it.
 *
 * PURE LOGIC, NO FOUNDRY API. Geometry comes in as numbers so every rule
 * here can be run in a harness without a canvas (lesson 2); the module
 * that owns tokens, hooks and chat cards is creature-aura-workflow.mjs.
 */

import { runeAurasOf } from "./codex-runes.mjs";
import { declaredRuneAuras, afterStrikeOutcome } from "./rune-declarations.mjs";
import { declaredConditionTag } from "./combat/declared-after-strikes.mjs";
import { allyEffectOf } from "./ally-aura-effects.mjs";
import { normaliseMoveLimits } from "./combat/aura-move-limits.mjs";

const SYSTEM_ID = "trg-prime";

/** The two moments the trait names. */
export const AURA_TRIGGERS = Object.freeze(["turnStart", "enter"]);

/**
 * The three shapes an aura takes in this chapter.
 *
 *   save    — the Stench shape: a trigger, a save, outcomes.
 *   terrain — Whirlwind and Whirlpool: the radius is difficult ground
 *             and there is no save at all.
 *   ally    — Aura of Tranquility: it helps the creatures inside it
 *             rather than catching them.
 *
 * Building all seventeen on the save shape would have given two auras a
 * save the page never printed and one an enemy list its allies belong
 * to, which is why the shape is a field rather than an assumption.
 */
export const AURA_KINDS = Object.freeze(["save", "terrain", "ally"]);

/**
 * The radius in feet, flat or scaled by the creature's level.
 *
 * "5 feet emanation per level" on a 6th-level creature is 30 feet, and
 * it must be recomputed as the creature levels rather than frozen when
 * the circle was first drawn.
 */
export function auraRadiusFeet(raw, level = 0) {
  const perLevel = Number(raw?.radiusPerLevel);
  if (Number.isFinite(perLevel) && perLevel > 0) {
    const lvl = Number(level);
    if (!Number.isFinite(lvl) || lvl <= 0) return 0;
    return Math.floor(perLevel * lvl);
  }
  return Number(raw?.radius);
}

/** Stench's window, and the default for any aura that prints one. */
export const DEFAULT_IMMUNITY_SECONDS = 60;

/**
 * One aura, normalised from an item's own flags.
 *
 * Returns null rather than throwing for anything malformed: a typo in
 * one creature's ability should cost that ability, not every movement
 * the table makes. The harness is what makes a dropped aura loud.
 *
 * @param {object} raw The authored entry.
 * @param {object} source {id, name} of the item it came from.
 * @returns {object|null}
 */
/** The element an elemental ability's own name carries, or "". */
function elementFromName(name) {
  const n = String(name ?? "").toLowerCase();
  if (/\bcaustic\b/.test(n)) return "acid";
  if (/\bfiery\b/.test(n)) return "fire";
  if (/\bfreezing\b/.test(n)) return "cold";
  if (/\bshocking\b/.test(n)) return "electricity";
  if (/\btoxic\b/.test(n)) return "poison";
  return "";
}

/** A declared aura damage, or null: a formula the dice will roll and a type. */
function normaliseAuraDamage(raw, typeFromName = "") {
  if (!raw || typeof raw !== "object") return null;
  const formula = String(raw.formula ?? raw.dice ?? "").trim();
  if (!/^\d+d\d+(\s*[+-]\s*\d+)?$/i.test(formula)) return null;
  const type = String(raw.type ?? "").trim().toLowerCase() || typeFromName;
  if (!type) return null;
  const out = { formula, type, basic: raw.basic !== false };
  // The three options below are written only when declared, so every aura
  // that declares none keeps the shape it has always had.
  const extra = {
    // AURA OF FLAMES (3.640.0, F&F 3.0 block 10 R3): "a basic Fortitude save
    // to avoid critical and additional damage, but this saving throw does
    // not lessen the damage in any way" — the save never cuts below full.
    fullDamage: raw.fullDamage === true,
    // "This damage is doubled if a creature is currently grabbed by the Balor."
    doubleIfGrabbedBy: raw.doubleIfGrabbedBy === true,
    // REACTIVE EVIL (R5): "a creature … lessens the damage taken using
    // Resistance or Immunity; … Its Aura of Flames is evil and fire until the
    // beginning of its next turn" — the second type it may become.
    reactiveType: String(raw.reactiveType ?? "").trim().toLowerCase()
  };
  if (extra.fullDamage) out.fullDamage = true;
  if (extra.doubleIfGrabbedBy) out.doubleIfGrabbedBy = true;
  if (extra.reactiveType) out.reactiveType = extra.reactiveType;
  return out;
}

const DEGREE_KEYS = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);
/** The rung a degree reads: its own, else the one it stands in for. */
const DEGREE_FALLBACK = Object.freeze({ heroic: "critical", blunder: "fumble" });

/** A declared damage-by-degree table, or null: a type and a formula per rung. */
function normaliseDegreeDamage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type ?? "").trim().toLowerCase();
  if (!type) return null;
  const out = { type };
  for (const k of DEGREE_KEYS) {
    const f = String(raw[k] ?? "").trim();
    if (/^\d+d\d+(\s*[+-]\s*\d+)?$/i.test(f)) out[k] = f;
  }
  return Object.keys(out).length > 1 ? out : null;
}

/** A declared critical-injury-by-degree table, or null. */
function normaliseDegreeCriticals(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const k of DEGREE_KEYS) {
    const v = String(raw[k] ?? "").trim().toLowerCase();
    if (["minor", "serious", "deadly"].includes(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** What one degree of a by-degree aura deals: `{formula, type, severity}` (either may be null). */
export function auraDegreeEffect(aura, degree) {
  const key = String(degree ?? "failure");
  const pick = (table) => table?.[key] ?? table?.[DEGREE_FALLBACK[key] ?? ""] ?? null;
  return {
    formula: aura?.damageByDegree ? pick(aura.damageByDegree) : null,
    type: aura?.damageByDegree?.type ?? null,
    severity: pick(aura?.criticals) ?? null
  };
}

/**
 * The multiplier an aura's damage takes from the save and the hold
 * (3.640.0): a full-damage aura never goes below ×1; a held creature takes
 * it twice.
 */
export function auraDamageMultiplier(damage, saveMultiplier, { grabbedByEmitter = false } = {}) {
  let m = Number(saveMultiplier) || 0;
  if (damage?.fullDamage) m = Math.max(1, m);
  if (damage?.doubleIfGrabbedBy && grabbedByEmitter) m *= 2;
  return m;
}

/**
 * Which type a reactive aura deals this creature (3.640.0, Reactive Evil):
 * its own, unless that is lessened — by the creature's resistance or
 * immunity — below what the reactive type would deal, or the aura has
 * already turned; then the reactive type. `triggers` says this creature
 * lessened it, which turns the aura until the emitter's next turn.
 */
export function reactiveAuraType(damage, { ownTaken = 0, reactiveTaken = 0, active = false } = {}) {
  if (!damage?.reactiveType) return { type: damage?.type ?? "", triggers: false };
  const lessened = Number(ownTaken) < Number(reactiveTaken);
  if (lessened || active) return { type: Number(reactiveTaken) > Number(ownTaken) ? damage.reactiveType : damage.type, triggers: lessened };
  return { type: damage.type, triggers: false };
}

/** A declared trait-granting effect for failed degrees, or null. */
function normaliseTraitEffect(raw) {
  if (!raw || typeof raw !== "object") return null;
  const traits = String(raw.traits ?? "").trim();
  const seconds = Math.max(0, Math.floor(Number(raw.seconds) || 0));
  if (!traits || !seconds) return null;
  const on = (Array.isArray(raw.on) ? raw.on : ["failure", "fumble", "blunder"]).map((d) => String(d ?? "").trim().toLowerCase()).filter(Boolean);
  return { on, traits, seconds, name: String(raw.name ?? "").trim() || "Aura effect", text: String(raw.text ?? "") };
}

/** Do this degree's results include the aura's trait effect? */
export function auraTraitEffectLands(aura, degreeKey) {
  return Boolean(aura?.traitEffect && aura.traitEffect.on.includes(String(degreeKey ?? "").toLowerCase()));
}

export function normaliseAura(raw, source = {}, index = 0, level = 0) {
  if (!raw || typeof raw !== "object") return null;

  // A radius may be printed flat ("Area 30 feet emanation") or scaled
  // ("5 feet emanation per level", "5 feet x the creature's level").
  // Resolved here, once, so nothing downstream has to know which kind it
  // was — and so a Frightful Aura grows as its creature does instead of
  // being frozen at whatever level it was first drawn.
  const radius = auraRadiusFeet(raw, level);
  // A radius of zero is not an aura, it is a creature standing still.
  if (!Number.isFinite(radius) || radius <= 0) return null;

  const kind = AURA_KINDS.includes(raw.kind) ? raw.kind : "save";

  // A terrain aura has no trigger to speak of — its radius simply IS
  // difficult ground — so the trigger requirement applies to the shapes
  // that prompt somebody for something.
  const triggers = (Array.isArray(raw.triggers) ? raw.triggers : AURA_TRIGGERS)
    .map((trigger) => String(trigger ?? "").trim())
    .filter((trigger) => AURA_TRIGGERS.includes(trigger));
  if (!triggers.length && kind !== "terrain") return null;

  return {
    kind,
    id: String(raw.id ?? `${source.id ?? "aura"}-${index}`),
    name: String(raw.name ?? source.name ?? "Aura"),
    radius,
    triggers,
    save: String(raw.save ?? "").trim().toLowerCase(),
    // A PRINTED DC, for the auras that have one. Every creature aura in
    // the Codex says "a level based save" and leaves the DC to the
    // emitter's own level, so this was absent until an ITEM emitted an
    // aura: Dreadcarve prints 24, 29 and 34 by tier, and a card that
    // omitted them would send the GM to the book for a number the rune
    // states. Zero means "the emitter's level DC", which is what every
    // aura before this one meant by saying nothing.
    dc: Number.isFinite(Number(raw.dc)) ? Math.max(0, Math.floor(Number(raw.dc))) : 0,
    // "behaves as the Frightful Aura creature ability" — an aura may
    // name another ability rather than printing its own outcomes. Held
    // as the ability's NAME because resolving it needs the compendium,
    // and this module is pure.
    borrowsOutcomesFrom: String(raw.borrowsOutcomesFrom ?? "").trim(),
    // The scope sentence, as printed — "Living creatures", "Creatures
    // other than the emitter". Shown to the GM rather than parsed into a
    // predicate, because "living" is a judgement this system has no
    // field for and guessing at one would exclude the wrong creatures.
    appliesTo: String(raw.appliesTo ?? "").trim(),
    outcomes: raw.outcomes && typeof raw.outcomes === "object" ? { ...raw.outcomes } : {},
    rollOutcomes: raw.rollOutcomes === true,
    // A RUNG THAT LIMITS MOVEMENT (3.651.0, block 18 R8 — Shifting Aura).
    // See combat/aura-move-limits.mjs.
    moveLimits: normaliseMoveLimits(raw.moveLimits),
    immunitySeconds: Number.isFinite(Number(raw.immunitySeconds))
      ? Math.max(0, Number(raw.immunitySeconds))
      : 0,
    // Aura of Despair prints "immune to the paralysis for 24 hours after
    // making a save BUT NOT THE FEAR". So immunity is not always to the
    // whole aura: it may attach to one of its effects. Kept as a named
    // window beside the whole-aura one rather than replacing it, because
    // most auras do print the simple kind.
    partialImmunity: raw.partialImmunity && typeof raw.partialImmunity === "object"
      ? { to: String(raw.partialImmunity.to ?? ""), seconds: Math.max(0, Number(raw.partialImmunity.seconds) || 0) }
      : null,
    // Terrain auras: what moving through the radius costs, and who is
    // exempt ("any creature that does not have the Air trait").
    movementCostMultiplier: Number.isFinite(Number(raw.movementCostMultiplier))
      ? Math.max(1, Number(raw.movementCostMultiplier))
      : null,
    exemptTrait: String(raw.exemptTrait ?? "").trim(),
    // Ally auras: the conditional to offer creatures standing inside.
    grants: raw.grants && typeof raw.grants === "object" ? { ...raw.grants } : null,
    radiusPerLevel: Number.isFinite(Number(raw.radiusPerLevel)) ? Number(raw.radiusPerLevel) : null,
    /*
     * A ROLLED AURA (3.627.0, Graham's ruling of 7 Oct 2026 — "roll + apply,
     * opt-in"). An aura that declares the CONDITIONS each degree applies has
     * its save rolled and those conditions applied, rather than a card that
     * offers it; one that declares none behaves exactly as every Codex aura
     * always has. Pillars of Faith's Ghast Stench, Aura of Despair and the
     * Lich's Frightful Aura are the first.
     *
     *   conditions: { failure: [{ key: "sickened", value: 1 }],
     *                 fumble:  [{ key: "slowed", value: 1, endsWith: "sickened" }], … }
     *   immunityOn: "success" — "a creature that SAVES … is immune" (Ghast
     *               Stench); the default "always" is the Codex's "regardless of
     *               the result" and the window the core has always opened.
     *   livingOnly: true — "Living creatures …": undead, constructs and
     *               Unliving characters are passed over (kind-targeting.mjs).
     *   traits: the aura's own traits ("fear"), handed to the save so a bonus
     *               or a conversion that answers fear can see it.
     */
    conditions: raw.conditions && typeof raw.conditions === "object" ? { ...raw.conditions } : null,
    /*
     * AURA DAMAGE (3.631.0; Fiends & Fables 3.0 block 1, Graham: "all
     * automated"). Seven Codex auras are "basic save or Nd6" — Aura of
     * Death, Decay, Fire, Heat, Ashen Aura, Elemental Aura, Infestation —
     * and the rolled aura carried conditions only. A declared `damage` rolls
     * the save and applies the dice through the typed-damage path (so a fire
     * resistance meets Aura of Fire), basic by default: halved on a Success,
     * nothing on a Critical, an extra base die per failed severity.
     *
     *   damage: { formula: "4d6", type: "essence", basic: true }
     *   damageTypeFromName: true — Elemental Aura: "Fiery Aura" is fire,
     *                       "Caustic" acid, "Freezing" cold, "Shocking"
     *                       electricity, "Toxic" poison.
     */
    damage: normaliseAuraDamage(raw.damage, raw.damageTypeFromName ? elementFromName(source.name) : ""),
    /*
     * DAMAGE AND A CRITICAL BY DEGREE (3.658.0; F&F 3.0 block 25 R6 — Soul
     * Eclipse: "Critical 2d6 essence; Success 4d6; Partial 4d6 and a Minor
     * critical; Failure 6d6 and a Serious critical; Fumble 6d6 and a Deadly
     * critical"). The rung IS the amount — no basic halving — as Crush's
     * area has it (peril-effect's damageByRung and criticals).
     *
     *   damageByDegree: { type: "essence", critical: "2d6", success: "4d6", … },
     *   criticals: { partial: "minor", failure: "serious", fumble: "deadly" }
     */
    damageByDegree: normaliseDegreeDamage(raw.damageByDegree),
    criticals: normaliseDegreeCriticals(raw.criticals),
    immunityOn: String(raw.immunityOn ?? "").trim().toLowerCase() === "success" ? "success" : "always",
    livingOnly: raw.livingOnly === true,
    // A GAZE IS NOT MET BY THE BLIND (3.636.0, F&F 3.0 block 6 R8):
    // Petrifying Gaze — "any creature … that can see it". A subject with one
    // of these conditions is passed over without a save.
    immuneIf: (Array.isArray(raw.immuneIf) ? raw.immuneIf : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean),
    // AURA OF RUIN (3.631.0): "A creature that is either good or ordered
    // aligned" — only a subject carrying one of these aligned traits rolls.
    appliesToTraits: (Array.isArray(raw.appliesToTraits) ? raw.appliesToTraits : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean),
    traits: (Array.isArray(raw.traits) ? raw.traits : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean),
    /*
     * MUCUS CLOUD (3.633.0; Fiends & Fables 3.0 block 3, R7). "In its
     * aquatic environment … An air breathing creature that is adjacent to an
     * aboleth must make fortitude save or lose the ability to breath air but
     * gain the ability to breath water for 2 hours."
     *
     *   emitterState: "submerged" — live only while the emitter is under
     *                 water (the Submerged effect the underwater rail sets).
     *   exemptTraits: ["aquatic"] — a creature that breathes water is not
     *                 "air breathing"; it is passed over without a save.
     *   traitEffect:  { on: ["failure", …], name, seconds, traits } — the
     *                 failed degrees GRANT traits for a while: Mucus-Bound
     *                 grants Aquatic for 7200 seconds, and the waterline
     *                 rail then reads it (breath held in air, not in water).
     */
    emitterState: String(raw.emitterState ?? "").trim().toLowerCase(),
    exemptTraits: (Array.isArray(raw.exemptTraits) ? raw.exemptTraits : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean),
    traitEffect: normaliseTraitEffect(raw.traitEffect),
    // AN ALLY AURA'S STANDING EFFECT (3.634.0, F&F 3.0 block 4 R1): the
    // effect laid on each ally inside — see ally-aura-effects.mjs.
    allyEffect: kind === "ally" ? allyEffectOf(raw.allyEffect) : null,
    // AND ITS MIRROR ON ENEMIES (3.640.0, F&F 3.0 block 10 R3 — Aura of
    // Command: "All enemies take a -1 penalty").
    enemyEffect: kind === "ally" ? allyEffectOf(raw.enemyEffect) : null,
    // THE EMITTER STANDS IN ITS OWN AURA (3.646.0; Graham, 15 October 2026,
    // on Aura of Ashes: "All creatures within this 20-foot aura are
    // concealed" includes the Yulussil). Off unless declared, as every
    // other ally aura is about the creatures around its source.
    includeSelf: kind === "ally" && raw.includeSelf === true,
    text: String(raw.text ?? ""),
    sourceId: String(source.id ?? ""),
    sourceName: String(source.name ?? "")
  };
}

/**
 * Every aura an actor emits, from the items it carries.
 *
 * TWO SOURCES, ONE LIST. An aura is AUTHORED on a creature ability, in
 * that item's own flags — that is where all seventeen of the Codex's
 * came from. Since 3.277.0 an aura can also be INSCRIBED: a Dreadcarve
 * rune on worn armour emits one, and the item carrying it is an ordinary
 * breastplate with no aura flag on it anywhere.
 *
 * They meet here, in the shape everything downstream already reads, so
 * the Regions, the triggers, the immunity windows and the cards did not
 * have to learn that runes exist.
 */
export function aurasOf(items = [], level = 0) {
  const found = [];
  for (const item of items ?? []) {
    const declared = item?.flags?.[SYSTEM_ID]?.auras;
    if (!Array.isArray(declared)) continue;
    // AN ABILITY SWITCHED OFF EMITS NOTHING (3.631.0): Elemental Aura "may as
    // a Free Action turn the aura on or off" — untick the ability's Active.
    if (item?.type === "ability" && item?.system?.active === false) continue;
    declared.forEach((raw, index) => {
      // WHILE THE ITEM'S STATE RUNS (3.673.0, C9): Inner Tempest's Mystic
      // Incense Burner, "When the Mystic Incense Burner is lit … The incense
      // will burn for 1 hour". An aura declaring `whileState` is emitted only
      // while the item's `runeState` holds it — the state a timed item use
      // switches on and its timer's end switches off (rune-timers-workflow).
      if (raw?.whileState && !item?.flags?.[SYSTEM_ID]?.runeState?.[String(raw.whileState)]) return;
      // The level travels all the way in, because a scaled radius that
      // defaults to zero is an aura that silently catches nobody.
      const aura = normaliseAura(raw, { id: item.id, name: item.name }, index, level);
      if (aura) found.push(aura);
    });
  }
  for (const item of items ?? []) {
    for (const raw of runeAurasOf([item])) {
      const aura = normaliseAura(raw, { id: item.id, name: item.name }, 0, level);
      if (aura) found.push(aura);
    }
    // A REGISTERED RUNE'S ACTION, WHILE IT RUNS (3.626.0): Sanctuary.
    for (const raw of declaredRuneAuras(item)) {
      const aura = normaliseAura(raw, { id: item.id, name: item.name }, 0, level);
      if (aura) found.push(aura);
    }
  }
  return found;
}

/**
 * How far an aura reaches, centre to centre, in feet.
 *
 * AN EMANATION IS MEASURED FROM THE CREATURE'S SPACE, not from the point
 * at its middle — otherwise a Huge creature's 10-foot stench would not
 * reach past its own body. So the printed radius is added to half the
 * emitter's own width, which is the same reading the reach column of the
 * size table uses and the reason a Colossal creature threatens further
 * than a Medium one without any rule saying so twice.
 *
 * @param {number} radiusFeet The printed radius.
 * @param {number} emitterWidthFeet The emitting token's width in feet.
 */
export function auraReachFeet(radiusFeet, emitterWidthFeet = 5) {
  const radius = Math.max(0, Number(radiusFeet) || 0);
  const width = Math.max(0, Number(emitterWidthFeet) || 0);
  return radius + (width / 2);
}

/**
 * Is a point inside an aura?
 *
 * EVERYTHING IN THIS FILE IS FEET. Not pixels, not grid squares — feet,
 * because that is the unit the rulebook is written in and the only one
 * that survives a change of grid size.
 *
 * It used to take a conversion factor so a caller could hand it canvas
 * pixels. That parameter is gone, and its absence is the point: the
 * workflow converts at its own boundary, where it knows the scene's
 * scale, and the rules never see a pixel.
 *
 * Found live at 3.255.3: the workflow passed PIXEL centres and never
 * supplied the factor, so this compared 145 (pixels apart) against 15
 * (feet of reach) and caught nobody, ever. The function was right, its
 * tests were right — they used feet for both — and the one caller used
 * different units. A parameter that can be omitted is a unit mismatch
 * waiting for a caller.
 */
export function withinAura(emitterCentreFeet, subjectCentreFeet, reachFeet) {
  if (!emitterCentreFeet || !subjectCentreFeet) return false;
  const dx = Number(subjectCentreFeet.x) - Number(emitterCentreFeet.x);
  const dy = Number(subjectCentreFeet.y) - Number(emitterCentreFeet.y);
  return Math.hypot(dx, dy) <= Number(reachFeet) + 1e-6;
}

/**
 * Is this creature currently immune to this aura?
 *
 * The window is the ABILITY's, not the trait's — Stench prints one
 * minute, another aura may print none at all, and an aura with no window
 * fires every time its trigger comes round, which is what "no window"
 * means.
 *
 * @param {object} record The actor's own flag: {[auraId]: expiryTime}.
 * @param {string} auraId
 * @param {number} now The world time, in seconds.
 */
export function immuneToAura(record, auraId, now) {
  const until = Number(record?.[auraId]);
  return Number.isFinite(until) && until > Number(now ?? 0);
}

/**
 * Is this creature immune to ONE named effect of an aura?
 *
 * Aura of Despair's paralysis, and nothing else so far. Kept separate
 * from immuneToAura because the two answer different questions: whether
 * the aura fires at all, and whether one of its outcomes lands when it
 * does. Collapsing them would have suppressed the fear along with the
 * paralysis, which is precisely what the page says not to do.
 */
export function immuneToAuraEffect(record, auraId, effect, now) {
  if (!effect) return false;
  const until = Number(record?.[`${auraId}:${effect}`]);
  return Number.isFinite(until) && until > Number(now ?? 0);
}

/** The record after a save against an aura with a PARTIAL window. */
export function withAuraEffectImmunity(record, aura, now) {
  const next = { ...(record ?? {}) };
  const partial = aura?.partialImmunity;
  if (partial?.to && partial.seconds > 0) {
    next[`${aura.id}:${partial.to}`] = Number(now ?? 0) + partial.seconds;
  }
  return next;
}

/** The record after a save is made — the window opening. */
export function withAuraImmunity(record, aura, now) {
  const next = { ...(record ?? {}) };
  if (aura?.immunitySeconds > 0) {
    next[aura.id] = Number(now ?? 0) + aura.immunitySeconds;
  }
  return next;
}

/**
 * Which auras catch a creature at a given moment.
 *
 * The whole trigger rule in one pure function: the right trigger, inside
 * the reach, not the emitter itself, and not currently immune.
 *
 * @param {object} args
 * @param {"turnStart"|"enter"} args.trigger
 * @param {{id: string, centreFeet: object, immunities: object}} args.subject
 *   `centreFeet` is in FEET — see withinAura.
 * @param {Array<{id, centreFeet, widthFeet, auras}>} args.emitters
 * @param {number} args.now World time in seconds.
 * @returns {Array<{aura, emitterId}>}
 */
export function aurasCatching({ trigger, subject, emitters = [], now = 0 } = {}) {
  if (!AURA_TRIGGERS.includes(trigger) || !subject) return [];
  const caught = [];
  for (const emitter of emitters) {
    // A CREATURE IS NOT CAUGHT BY ITS OWN AURA. Nothing in the trait
    // says so, because nothing needed to: "emanates from the target" is
    // about what it reaches, and a thing does not emanate onto itself.
    // Left explicit because the geometry would happily include it.
    if (emitter.id === subject.id) continue;
    for (const aura of emitter.auras ?? []) {
      // Only a save aura prompts. A terrain aura is difficult ground —
      // Foundry's own movement-cost behaviour handles it — and an ally
      // aura grants something to the creatures inside rather than
      // catching them. Prompting for either would ask for a save the
      // page never printed.
      if ((aura.kind ?? "save") !== "save") continue;
      if (!aura.triggers.includes(trigger)) continue;
      // LIVE ONLY IN ITS STATE (3.633.0): Mucus Cloud "in its aquatic environment".
      if (aura.emitterState && !(emitter.states ?? []).includes(aura.emitterState)) continue;
      // NOT FOR THESE (3.633.0): an aquatic creature is not "air breathing".
      if ((aura.exemptTraits ?? []).some((t) => (subject.traits ?? []).includes(t))) continue;
      if (immuneToAura(subject.immunities, aura.id, now)) continue;
      // THE SUBJECT'S OWN SPACE COUNTS (3.633.1, found live: a Large Waarg
      // adjacent to the Aboleth was not "adjacent"). "Moves into the radius"
      // is its space entering it, so a creature wider than 5 ft is reached
      // by its near edge — a Medium one exactly as before.
      const reach = auraReachFeet(aura.radius, emitter.widthFeet) + Math.max(0, (Number(subject.widthFeet) || 5) - 5) / 2;
      if (!withinAura(emitter.centreFeet, subject.centreFeet, reach)) continue;
      // ENTERING MEANS CROSSING IN (3.637.0; Graham, 12 October 2026, from
      // the block 6 live test). A move that began inside the radius is not
      // "moving into" it: the Basilisk's sighted victim rolled its gaze again
      // on every step it took within 30 feet. Only known when the move's
      // start is — `subject.fromCentreFeet`; unknown, the old reading stands.
      if (trigger === "enter" && subject.fromCentreFeet && withinAura(emitter.centreFeet, subject.fromCentreFeet, reach)) continue;
      caught.push({ aura, emitterId: emitter.id });
    }
  }
  return caught;
}

/* ------------------------------------------------------------------ */
/* Rolled auras (3.627.0)                                               */
/* ------------------------------------------------------------------ */

/** Does this aura roll its save and apply what it lands? */
export function auraRolls(aura) {
  // AN OUTCOME-ONLY LADDER (3.640.0, F&F 3.0 block 10 R3 — Aura of Paranoia:
  // its rungs are attitudes, not conditions): rolled when it says so, so the
  // degree, its printed line and the immunity land.
  return Boolean(aura?.save && ((aura?.conditions && Object.keys(aura.conditions).length) || aura?.damage || aura?.damageByDegree || aura?.criticals || aura?.traitEffect
    || aura?.moveLimits
    || (aura?.rollOutcomes && Object.keys(aura?.outcomes ?? {}).length)));
}

/**
 * What one degree of a rolled aura applies, as condition tags with their
 * clocks — less any effect the creature is already immune to under the
 * aura's partial window (Aura of Despair's paralysis, "but not the fear").
 *
 * @param {object} aura normalised
 * @param {string} degree
 * @param {{immuneToPartial?: boolean, combatRound?: number|null, worldTime?: number}} ctx
 * @returns {{text: string, tags: object[]}}
 */
export function auraOutcomeTags(aura, degree, { immuneToPartial = false, combatRound = null, worldTime = 0 } = {}) {
  const outcome = afterStrikeOutcome({ outcomes: aura?.outcomes, conditions: aura?.conditions }, degree);
  const partial = immuneToPartial ? String(aura?.partialImmunity?.to ?? "").trim().toLowerCase() : "";
  const tags = outcome.conditions
    .filter((row) => !partial || String(row.key).trim().toLowerCase() !== partial)
    .map((row) => declaredConditionTag(row, { combatRound, worldTime }));
  return { text: outcome.text, tags };
}

/** Whether the whole-aura immunity window opens after this roll. */
export function auraImmunityOpens(aura, degreeSucceeded) {
  if (!(aura?.immunitySeconds > 0)) return false;
  return aura.immunityOn === "success" ? Boolean(degreeSucceeded) : true;
}
