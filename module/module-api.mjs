/**
 * The companion-module registry (3.560.0).
 *
 * Until this release the system could not see a module. Every chooser,
 * grant and prerequisite gate read `game.packs.get("trg-prime.<name>")`
 * by literal id, and every name-keyed table — racial Power Points, class
 * proficiency, archetype grants, the language list, the trait
 * vocabulary, the skill-action array — was a frozen constant in system
 * source. A sourcebook shipped as a Foundry module therefore had exactly
 * two options: patch system internals at runtime, or not exist. The
 * first Pillars of Faith build (16 Sep 2026) is what forced the question.
 *
 * This file is the PURE half of the answer: registry state and the
 * functions that read it. It imports nothing from the rest of the
 * system, so the consumers that need to consult it — racial-pp.mjs,
 * proficiency-rules.mjs, feats.mjs, defences.mjs, languages.mjs,
 * content-packs.mjs — can import it without a cycle. The Foundry-facing
 * half (module-api-workflow.mjs) wires it onto `game.trgPrime.modules`,
 * fires the registration hook, and pushes the entries that belong in
 * LIVE tables (SKILL_ACTIONS, FEAT_AUTOMATION, LANGUAGES) into them.
 *
 * HOW A MODULE USES IT. From its own esmodule, at load time:
 *
 *   Hooks.on("trgPrime.registerContent", (api) => {
 *     api.registerPack("my-module.my-feats", "feats");
 *     api.registerLanguage("Vesperic", { rarity: "uncommon", speakers: "Eshari" });
 *     api.registerTraits(["haunt", "spirit"]);
 *     api.registerRacialPP("Eshari", 0);
 *     ...
 *   });
 *
 * A pack can ALSO declare which logical pack it extends in module.json,
 * with no code at all — `"flags": {"trg-prime": {"extends": "feats"}}`
 * on the pack entry — and content-packs.mjs reads that directly. The
 * registerPack call exists for packs that cannot carry the flag.
 *
 * EVERY REGISTRATION IS ADDITIVE AND NAME-KEYED, lowercased and trimmed
 * the same way the tables it joins are. A module cannot remove or
 * override a core entry: a core name already present wins, and the
 * attempt is reported through `registrationProblems()` rather than
 * silently ignored, so a clash is visible in the console at startup.
 */

import { normaliseCreateRoute as createRouteNormaliser } from "./create-crafting.mjs";
// Pure, and imports only the pure dice helper (3.684.0, G1).
import { normaliseMetamagicSpec } from "./magic/module-metamagic.mjs";

/** Lowercase-and-trim, the key normalisation every table here shares. */
function registryKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

/**
 * The state. One object so a test (or a curious console) can read the
 * whole thing at once, and so `resetModuleRegistry()` is one line.
 */
function emptyRegistry() {
  return {
    /** "<package>.<pack>" collection id → logical system pack name. */
    packs: new Map(),
    /** Package id → the sourcebook title its content files under (3.628.0). */
    sourcebooks: new Map(),
    /** Language name → { rarity, speakers }. */
    languages: new Map(),
    /** Trait keys (lowercase) the defence vocabulary should recognise. */
    traits: new Set(),
    /** Race or heritage key → Power Points per level. */
    racialPP: new Map(),
    /**
     * Class key → { name, needsDivineAspect, needsWizardSchool,
     * proficiency, wealth }. `proficiency` is the same shape as a
     * CLASS_PROFICIENCY entry; `wealth` the same as CLASS_WEALTH.
     */
    classes: new Map(),
    /** Archetype key → { name, classGrants: [], tierGrants: [] }. */
    archetypes: new Map(),
    /** Heritage-feat key → [race names] (HERITAGE_RACE_GRANTS shape). */
    heritageRaceGrants: new Map(),
    /**
     * "race:<key>" / "class:<key>" → Set of feat keys the owner may take
     * beyond the source tag or class trait the feat itself carries
     * (3.571.0). Pillars of Faith's "Existing racial feats" and "Existing
     * class feats" lists: a Rhevani may take the Human's Self Aware.
     */
    featAccess: new Map(),
    /**
     * Trait key → Set of feat keys (3.627.0). A feat carrying the trait is
     * offered only to an actor owning one of the named feats. Pillars of
     * Faith Chapter 9: "Generic Unliving class feats are available to any
     * Unliving character. Type-specific class feats require the named
     * Unliving Archetype."
     */
    featGates: new Map(),
    /**
     * Group key → { name, feats: Set of feat keys } (3.627.0). At most one
     * feat of a group may be owned: "a character may only ever select one
     * Unliving Archetype Feat."
     */
    exclusiveFeats: new Map(),
    /** Feat key → [{ action, skill, modifier? }] (SKILL_SUBSTITUTION_FEATS shape). */
    skillSubstitutions: new Map(),
    /** Feat key → [{ actionKey, from, to }] (SHADOWBORN_AGILITY_UPGRADES shape). */
    degreeUpgrades: new Map(),
    /**
     * Feat key → [{ match, warp }] (3.625.0): a warping option a FEAT adds
     * to the spells it names, offered in the Warp? dialog beside the
     * spell's own. See magic/granted-warps.mjs.
     */
    spellWarps: new Map(),
    /**
     * Rune key → a rune a module declares (3.626.0): catalogue facts (name,
     * traits, on, tiers or level/price) and what it DOES as data under
     * `declares`. See rune-catalogue.mjs `runesFor` and module/rune-declarations.mjs.
     */
    runes: new Map(),
    /**
     * Light-source key → an entry in LIGHT_SOURCES shape (3.669.0), for a
     * module's own light: Inner Tempest's Spirit Beacon and Living Lantern.
     * See light-sources.mjs `lightSource`.
     */
    lightSources: new Map(),
    /** Automation key → { hint, use } for a wondrous item's `use` ability (3.626.0). */
    itemAutomation: new Map(),
    /** Route key → another skill's road to Create (3.673.0): Inner Tempest's Monastic Items. See create-crafting.mjs. */
    createRoutes: new Map(),
    /**
     * Kind key → a companion a module brings beside the Animal Companion
     * (3.674.0): Inner Tempest's Dragon Companion. See companion.mjs
     * `companionKindSpec`.
     */
    companionKinds: new Map(),
    /**
     * Automation key → { trigger?, use? } (3.629.0): a peril whose Effect, or
     * a routine action whose effect, is more than a save — Pillars of Faith's
     * Hungry Reliquary. See peril-workflow.mjs `triggerPeril`/`usePerilRoutine`.
     */
    perilAutomation: new Map(),
    /**
     * Key → (actor) => picks | null (3.630.0): extra feat picks a module's
     * campaign option grants — Pillars of Faith's Undead Lords bonus
     * Archetype feat. Read by feats.mjs `registeredFeatPicks` for the banner.
     */
    featPickBonus: new Map(),
    /** Key → async (actor, amount, ctx) => {taken} (3.630.0): Martyr's Aegis. See dying-workflow.mjs. */
    damageShare: new Map(),
    /**
     * Key → async (ctx) => {modifiers?, lines?} (3.672.0): asked before a
     * casting's check is rolled — Inner Tempest's Spiritual Distraction. See
     * magic/spell-check-gates.mjs.
     */
    spellCheckGates: new Map(),
    /**
     * Key → async (ctx) => {pp, label?, lines?} (3.675.0; Eldritch Arts
     * Block 1, C3): extra PP a casting must pay — Zhal-vryn's "All creatures
     * within your Null Aura must expend an additional PP to cast spells
     * (including cantrips)". See magic/cast-surcharge.mjs.
     */
    castSurcharges: new Map(),
    /**
     * Key → async (ctx) => option|null (3.675.0, C6): another way to read a scroll —
     * Eldritch Arts' Lingual Casting ("use magical scrolls, by making a
     * [Linguistics] check"). See charged-items.mjs `castFromItemOptions`.
     */
    releasePaths: new Map(),
    /**
     * Key → async (ctx) => reason|null (3.678.0; Eldritch Arts Block 2, D7):
     * a casting refused before anything is spent — an antimagic zone ("No
     * spell or magical ability functions inside"). See magic/cast-hooks.mjs.
     */
    castRefusals: new Map(),
    /**
     * Key → (ctx) => boolean (3.685.1; Eldritch Arts 0.10.0's live test): a
     * Teleportation spell whose teleport happens LATER than its cast — Panic
     * Transposition's "After resolving the triggering attack, you teleport",
     * Dimensional Assault's hop after the cast. See trait-rules-workflow.mjs
     * `teleportDeferred`.
     */
    deferredTeleports: new Map(),
    /**
     * Key → async (ctx) => {degree, lines?}|null (3.678.0, D7): the casting's
     * degree read differently — a Magic Suppression area ("results of
     * partial, failure and fumble are all classed as a failure whereas
     * blunder results are treated as fumbles"). See magic/cast-hooks.mjs.
     */
    castDegreeRemaps: new Map(),
    /**
     * Key → async (ctx) => reason|null (3.678.0, D6): no Resonance event here
     * — "Magical Resonance events simply do not exist in areas of
     * suppression". See magic/cast-hooks.mjs.
     */
    resonanceSuppressors: new Map(),
    /**
     * Key → (effect) => boolean (3.678.0, D14): an effect switched off while
     * the module says so — an antimagic zone's "Magic items lose all
     * properties". Synchronous: asked by TRGActiveEffect.isSuppressed.
     */
    effectSuppressors: new Map(),
    /**
     * The High Magic rules in force (3.678.0, D1b): "" for the Fiends &
     * Fables creature guideline, or the module id whose rules supersede it —
     * Eldritch Arts, Graham's M4: "If the sourcebook is used, Eldritch arts
     * rules should be used instead."
     */
    highMagicRules: "",
    /**
     * Key → ritual rules (3.679.0; Eldritch Arts Block 2b, D13): the ways a
     * ritual's PP may be paid, its extra fields, DC rows and seats, and
     * whether a spell's ritual lifts the Success cap. See ritual-rules.mjs.
     */
    ritualRules: new Map(),
    /**
     * Key → a casting option the caster may choose (3.679.0, Block 2b):
     * Spell Trickery's +2 casting DC, a true name's +4 Save DC. See
     * cast-options.mjs.
     */
    castOptions: new Map(),
    /**
     * Key → { offer, onResult } (3.683.0; Eldritch Arts Block 5, D10, C9):
     * what a feat changes about a Dispel — its PP (Resonant Ascendance's
     * half, Runebreaker's −2, Dispel Power's none), its difficulty, its own
     * ladder, a modifier, and a rider on the result (Threadbreaker's Daze,
     * Mirrored Rebuke's reflection). See combat/dispel-modifiers.mjs.
     */
    dispelModifiers: new Map(),
    /**
     * Key → a raise of the PP cap per cast (3.680.0; Eldritch Arts Block 3a,
     * D5's cap half): the Sorcerer's Raw Power, "When warping high magic
     * spells, you may increase the total PP cost of the spell to 1 higher than
     * that normally allowed". See magic/cast-cap.mjs.
     */
    castCapModifiers: new Map(),
    /**
     * Key → a test that opens a specialist spell to a character (3.680.0,
     * Block 3a): a birthright's "You may select additional specialist spells
     * from those available to the Wizard class", the Umbral's "specialist
     * spells that have the shadow trait". Asked by the Specialist Spell feat
     * beside the core's own access rule.
     */
    specialistAccess: new Map(),
    /**
     * Key → a familiar's modifier (3.680.0, Block 3a, D8): the Witch's
     * Soulbound Familiar, "gains additional HP equal to your level, and can
     * add your Charisma ability score as a class bonus to all saving throws".
     * See familiar-modifiers.mjs.
     */
    familiarModifiers: new Map(),
    /**
     * Feature name → a stored-delta Power Point grant (3.680.0, Block 3a): the
     * Wild birthright's "an additional +1 PP per level". Joined to the core's
     * PP_GRANTS by the reconcile, with the registered racial PP beside it.
     */
    ppGrants: new Map(),
    /**
     * THE REACTIONS (3.681.0; Eldritch Arts Block 3b). Key → a module's
     * answer at one of five moments, each asked by the core and none able to
     * stop the others being asked. See reactions/reactions-workflow.mjs.
     *   checkReactions     {before, after}: advantage before a d20 check, a
     *                      reroll once its result is final (Missed Chance,
     *                      Second Chance, Prophetic Warning)
     *   damageReactions    a resistance or immunity before damage meets the
     *                      defences (Phase Familiar, Resist Magic)
     *   castReactions      a cast stopped after its check and before it
     *                      lands (Disrupting Magic)
     *   criticalReactions  disadvantage on a critical's roll, from the
     *                      creature struck (Eternity Resilience)
     *   reactionSteps      name → the work a reactor's own client does when
     *                      asked across the table (reactions/reaction-ask-workflow.mjs)
     */
    checkReactions: new Map(),
    damageReactions: new Map(),
    castReactions: new Map(),
    criticalReactions: new Map(),
    reactionSteps: new Map(),
    /**
     * Key → ctx => n (3.682.0; Eldritch Arts Block 4, D9): levels added to an
     * innate cast of a spell, the Warlock's bonded souls' "You are treated as
     * one level higher when using spells with either the Fire or Healing
     * traits". See magic/innate-level-bonus.mjs.
     */
    innateLevelBonuses: new Map(),
    /**
     * Key → ctx => {handled, result} | null (3.682.0; Eldritch Arts Block 4):
     * a spell whose casting begins with something else. Thunderous Strike:
     * "You make a Strike … as part of the spell casting and use the result of
     * this check as your spellcasting check". See magic/cast-workflow.mjs
     * `castSpell`.
     */
    castPreludes: new Map(),
    /**
     * Key → ctx => {noFatigue, line} | null (3.683.0; Eldritch Arts Block 5,
     * C8): the fatigue for leaving Dying waived, Relentless Will's "you do
     * not gain a point of fatigued when leaving it". See combat/death-state.mjs
     * `applyDyingRecovery`.
     */
    dyingRecoveryModifiers: new Map(),
    /**
     * ELDRITCH ARTS BLOCK 6, GROUP B (3.684.0; G5, G6, G26).
     *   fumbleModifiers     key → ctx => {modifier, bias, label, line} | null:
     *                       the Spell Fumble Table roll (Mana Bound, Spell
     *                       Surge). See magic/fumble-resonance-modifiers.mjs.
     *   resonanceModifiers  key → {roll?, force?}: the Resonance roll's bias,
     *                       High Magic's single roll, a forced event (High
     *                       Magic Resonance, Resonance Surge).
     *   chargedItemRules    key → {wieldLimit?, cost?, payment?, metamagic?,
     *                       onRelease?}: one spend path for every charged
     *                       item (the Adept's Conduit feats, Weave Infusion).
     *                       See charged-item-rules.mjs.
     *   pendingCastSteps    key → ctx => {lines} | null: awaited before an
     *                       extra-casting-time interruption settles (Magical
     *                       Retribution). See magic/pending-cast-steps.mjs.
     */
    fumbleModifiers: new Map(),
    resonanceModifiers: new Map(),
    chargedItemRules: new Map(),
    pendingCastSteps: new Map(),
    /**
     * ELDRITCH ARTS BLOCK 6, GROUP A (3.684.0; G1–G4, the metamagic family).
     *   metamagic             key → normalised spec: a module's metamagic in
     *                         the Warp? dialog beside the core's table. See
     *                         magic/module-metamagic.mjs.
     *   castPPSources         key → {offer, settle}: another way to pay a
     *                         cast's PP, the rod draw generalised (Bleed).
     *   metamagicPayments     key → {options, ap, dcAsIfPP, max, applies}: an
     *                         option's PP paid in AP (Metamagic Adept).
     *   castCostModifiers     key → ctx => {ppDelta, floor, label} | null: PP
     *                         off what is paid (Hex Mastery, Storm Bolt).
     */
    metamagic: new Map(),
    castPPSources: new Map(),
    metamagicPayments: new Map(),
    castCostModifiers: new Map(),
    /**
     * Key → { applies?, offer } (3.684.0; Eldritch Arts Block 6, G7): asked
     * when damage would take a creature to 0 HP and so knock it unconscious —
     * Subconscious Casting, Eternal Vigil. See combat/zero-hp-moment.mjs.
     */
    unconsciousOffers: new Map(),
    /**
     * Feat key → [actor => reason | null] (3.684.0; Block 6, G9): what a
     * prerequisite line cannot say ("Arcanum Birthright", "a Sorcerer with the
     * Wild Birthright cannot take this feat").
     */
    featEligibility: new Map(),
    /**
     * Feat key → { ability, perCopy } (3.684.0; Block 6, G21): extra daily
     * uses beside extra-uses.mjs's own table (Extra Communion, Deep Weave,
     * Extra Reservoir).
     */
    extraUses: new Map(),
    /**
     * Trait key → {categoryAs, classTypes[]} (3.675.0, C8): a weapon trait
     * that changes the weapon's category for a class type — Eldritch Arts'
     * Adept: "treated as a Simple weapon for any character with this class
     * trait". See proficiency-rules.mjs `effectiveWeaponCategory`.
     */
    weaponTraitRules: new Map(),
    /** Skill-action entries, in SKILL_ACTIONS shape, appended by the workflow. */
    skillActions: [],
    /** Feat key → { hint, use } (FEAT_AUTOMATION shape). */
    featAutomation: new Map(),
    /** Feat key → hint string (PASSIVE_AUTOMATION shape). */
    passiveAutomation: new Map(),
    /** CLASS_SKILL_GRANTS entries. */
    classSkillGrants: [],
    /** Module ids that have registered anything, for the startup report. */
    contributors: new Set(),
    /** Human-readable problems found while registering. */
    problems: []
  };
}

let registry = emptyRegistry();

/** For the harness: start again. Never called in a running world. */
export function resetModuleRegistry() {
  registry = emptyRegistry();
}

/** Read-only view for tooling and tests. */
export function moduleRegistry() {
  return registry;
}

export function registrationProblems() {
  return registry.problems.slice();
}

function problem(text) {
  registry.problems.push(text);
}

function noteContributor(moduleId) {
  if (moduleId) registry.contributors.add(String(moduleId));
}

/* ------------------------------------------------------------------ */
/* Packs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Declare that a module's compendium extends one of the system's logical
 * packs, so every chooser and grant that reads "feats" also reads it.
 *
 * @param {string} collectionId "<package>.<pack>" as game.packs keys it.
 * @param {string} logicalName A core pack name: "feats", "spells", ...
 */
export function registerPack(collectionId, logicalName, moduleId = null) {
  const id = String(collectionId ?? "").trim();
  const logical = String(logicalName ?? "").trim();
  if (!id || !logical) { problem(`registerPack: both a collection id and a logical name are required (got "${id}", "${logical}")`); return false; }
  if (id.startsWith("trg-prime.")) { problem(`registerPack: "${id}" is a system pack and cannot be re-registered`); return false; }
  registry.packs.set(id, logical);
  noteContributor(moduleId ?? id.split(".")[0]);
  return true;
}

/**
 * Name the sourcebook a module's content belongs to (3.628.0), for the
 * pickers' Sourcebook menu. A manifest flag does the same without code:
 * `"flags": { "trg-prime": { "sourcebook": "My Book" } }`.
 *
 * @param {string} packageName the module id
 * @param {string} title "Pillars of Faith"
 */
export function registerSourcebook(packageName, title, moduleId = null) {
  const id = String(packageName ?? "").trim();
  const name = String(title ?? "").trim();
  if (!id || !name) { problem(`registerSourcebook: both a module id and a title are required (got "${id}", "${name}")`); return false; }
  if (id === "trg-prime") { problem("registerSourcebook: the system's own content is the Core Rulebook and cannot be renamed"); return false; }
  registry.sourcebooks.set(id, name);
  noteContributor(moduleId ?? id);
  return true;
}

/** The sourcebook title a module registered, or "". */
export function registeredSourcebook(packageName) {
  return registry.sourcebooks.get(String(packageName ?? "").trim()) ?? "";
}

/** The logical pack a collection id was registered against, or null. */
export function registeredLogicalName(collectionId) {
  return registry.packs.get(String(collectionId ?? "").trim()) ?? null;
}

/** Collection ids registered against a logical pack, in registration order. */
export function registeredPackIds(logicalName) {
  const wanted = String(logicalName ?? "").trim();
  const out = [];
  for (const [id, logical] of registry.packs) if (logical === wanted) out.push(id);
  return out;
}

/* ------------------------------------------------------------------ */
/* Languages                                                            */
/* ------------------------------------------------------------------ */

const RARITIES = new Set(["common", "uncommon", "rare", "regional"]);

export function registerLanguage(name, { rarity = "uncommon", speakers = "" } = {}, moduleId = null) {
  const clean = String(name ?? "").trim();
  if (!clean) { problem("registerLanguage: a name is required"); return false; }
  const group = String(rarity ?? "").trim().toLowerCase();
  if (!RARITIES.has(group)) { problem(`registerLanguage: "${clean}" has an unknown rarity "${rarity}"`); return false; }
  registry.languages.set(clean, { rarity: group, speakers: String(speakers ?? "") });
  noteContributor(moduleId);
  return true;
}

export function registeredLanguages() {
  return Object.fromEntries(registry.languages);
}

/* ------------------------------------------------------------------ */
/* Traits                                                               */
/* ------------------------------------------------------------------ */

export function registerTraits(names, moduleId = null) {
  const list = Array.isArray(names) ? names : [names];
  let added = 0;
  for (const name of list) {
    const key = registryKey(name);
    if (!key) continue;
    registry.traits.add(key);
    added += 1;
  }
  if (added) noteContributor(moduleId);
  return added;
}

export function registeredTraits() {
  return Array.from(registry.traits);
}

/* ------------------------------------------------------------------ */
/* Racial Power Points                                                  */
/* ------------------------------------------------------------------ */

export function registerRacialPP(name, perLevel, moduleId = null) {
  const key = registryKey(name);
  const per = Number(perLevel);
  if (!key || !Number.isFinite(per)) { problem(`registerRacialPP: "${name}" needs a finite per-level number (got ${perLevel})`); return false; }
  registry.racialPP.set(key, per);
  noteContributor(moduleId);
  return true;
}

/** Per-level PP for a registered race or heritage, or null if unregistered. */
export function registeredRacialPP(name) {
  const key = registryKey(name);
  return registry.racialPP.has(key) ? registry.racialPP.get(key) : null;
}

/* ------------------------------------------------------------------ */
/* Classes and archetypes                                               */
/* ------------------------------------------------------------------ */

/**
 * @param {string} name The class item's name, as printed.
 * @param {object} [spec]
 * @param {boolean} [spec.needsDivineAspect] Chooses a Divine Aspect at 1st.
 * @param {boolean} [spec.needsWizardSchool] Chooses a Wizard School at 1st.
 *   `needsDivineAspect: false` (explicit) declines the divinity-caster
 *   banner for a class whose book says it needs no aspect (3.625.0).
 * @param {object} [spec.proficiency] A CLASS_PROFICIENCY-shaped entry.
 * @param {object} [spec.wealth] A CLASS_WEALTH-shaped entry.
 */
export function registerClass(name, spec = {}, moduleId = null) {
  const key = registryKey(name);
  if (!key) { problem("registerClass: a name is required"); return false; }
  registry.classes.set(key, {
    name: String(name).trim(),
    needsDivineAspect: Boolean(spec.needsDivineAspect),
    // A DECLINED ASPECT (3.625.0). A divinity caster that the book says
    // needs no aspect — Pillars of Faith's Archivist ("does not
    // automatically select a deity or Divine Aspect") and Healer — says
    // `needsDivineAspect: false` OUT LOUD, and the 3.623.0 banner that
    // infers the need from the tradition stands down. Undeclared stays
    // undeclared: an absent key is not a refusal.
    declinesDivineAspect: spec.needsDivineAspect === false,
    needsWizardSchool: Boolean(spec.needsWizardSchool),
    proficiency: spec.proficiency ?? null,
    wealth: spec.wealth ?? null
  });
  noteContributor(moduleId);
  return true;
}

export function registeredClass(name) {
  return registry.classes.get(registryKey(name)) ?? null;
}

/** Lowercased names of every registered class. */
export function registeredClassNames() {
  return Array.from(registry.classes.keys());
}

/**
 * @param {string} name The archetype feat's name, as printed.
 * @param {object} [spec]
 * @param {string[]} [spec.classGrants] Classes whose feats it opens.
 * @param {string[]} [spec.tierGrants] Tiers it adds (Martial/Expert/Adept).
 * @param {string[]} [spec.countsAs] Archetypes it counts as owning for
 *   class feats that carry their name as a trait (3.671.0; Inner Tempest's
 *   Zen Archer: "may also select feats available to the archer
 *   archetype"). Only the trait gate: not the other archetype's own
 *   abilities, class lists or progression.
 */
export function registerArchetype(name, spec = {}, moduleId = null) {
  const key = registryKey(name);
  if (!key) { problem("registerArchetype: a name is required"); return false; }
  registry.archetypes.set(key, {
    name: String(name).trim(),
    classGrants: Array.isArray(spec.classGrants) ? spec.classGrants.map((c) => String(c).trim()).filter(Boolean) : [],
    tierGrants: Array.isArray(spec.tierGrants) ? spec.tierGrants.map((t) => String(t).trim()).filter(Boolean) : [],
    countsAs: Array.isArray(spec.countsAs) ? spec.countsAs.map((a) => String(a).trim()).filter(Boolean) : []
  });
  noteContributor(moduleId);
  return true;
}

export function registeredArchetype(name) {
  return registry.archetypes.get(registryKey(name)) ?? null;
}

export function registeredArchetypeNames() {
  return Array.from(registry.archetypes.keys());
}

export function registerHeritageRaceGrant(featName, races, moduleId = null) {
  const key = registryKey(featName);
  const list = (Array.isArray(races) ? races : [races]).map((r) => String(r ?? "").trim()).filter(Boolean);
  if (!key || !list.length) { problem(`registerHeritageRaceGrant: "${featName}" needs a name and at least one race`); return false; }
  registry.heritageRaceGrants.set(key, list);
  noteContributor(moduleId);
  return true;
}

export function registeredHeritageRaceGrant(featName) {
  return registry.heritageRaceGrants.get(registryKey(featName)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Feat access (3.571.0)                                                */
/* ------------------------------------------------------------------ */

/**
 * Open named feats to a race or a class that the feats' own tags do not
 * name. "The races introduced in this sourcebook also gain access to the
 * following racial feats from previously published rulebooks" — the
 * core feat still says `sourceRace: "Human"`, and a module cannot edit
 * the core pack, so the picker asks here as well.
 *
 * A HERITAGE LIMIT (3.669.0; Inner Tempest's "Bestial Resilience (Mujina)"):
 * a feat may be given as `{ name, heritages: ["Mujina"] }`, opened only to a
 * character of that race with one of those heritages. A plain name opens the
 * feat to the whole race, as before; registering it both ways opens it to all.
 *
 * @param {"race"|"class"} kind
 * @param {string} ownerName The race or class name.
 * @param {Array<string|{name: string, heritages?: string[]}>} featNames
 */
export function registerFeatAccess(kind, ownerName, featNames, moduleId = null) {
  const k = String(kind ?? "").trim().toLowerCase();
  const owner = registryKey(ownerName);
  const entries = (Array.isArray(featNames) ? featNames : [featNames])
    .map((f) => (f && typeof f === "object"
      ? { name: registryKey(f.name), heritages: (Array.isArray(f.heritages) ? f.heritages : []).map(registryKey).filter(Boolean) }
      : { name: registryKey(f), heritages: [] }))
    .filter((e) => e.name);
  // "archetype" (3.671.0): core archetype feats opened to a class, read by
  // the archetype slot (Inner Tempest: "The classes in this sourcebook also
  // gain access to the following archetype feats from the TRG Core
  // Rulebook"). Owned by a class name, as "class" is.
  if (!["race", "class", "archetype"].includes(k) || !owner || !entries.length) {
    problem(`registerFeatAccess: needs kind "race", "class" or "archetype", an owner and at least one feat name (got ${JSON.stringify({ kind, ownerName })})`);
    return false;
  }
  const id = `${k}:${owner}`;
  const map = registry.featAccess.get(id) ?? new Map();
  for (const { name, heritages } of entries) {
    const had = map.get(name);
    // ANY HERITAGE WINS: once opened to the whole race, a later limit does
    // not narrow it.
    if (had === ANY_HERITAGE) continue;
    if (!heritages.length || k !== "race") { map.set(name, ANY_HERITAGE); continue; }
    map.set(name, new Set([...(had ?? []), ...heritages]));
  }
  registry.featAccess.set(id, map);
  noteContributor(moduleId);
  return true;
}

/** The marker for a feat opened to every heritage of the race. */
const ANY_HERITAGE = "*";

/**
 * Is this feat opened to any of these owners by a registration? Owners
 * are a comma-joined list the way the picker carries effective races and
 * classes ("Bard, Fighter").
 */
export function hasRegisteredFeatAccess(kind, owners, featName, heritage = "") {
  const k = String(kind ?? "").trim().toLowerCase();
  const feat = registryKey(featName);
  if (!feat) return false;
  const mine = String(heritage ?? "").split(",").map(registryKey).filter(Boolean);
  return String(owners ?? "").split(",").map(registryKey).filter(Boolean)
    .some((owner) => {
      const open = registry.featAccess.get(`${k}:${owner}`)?.get(feat);
      if (!open) return false;
      return open === ANY_HERITAGE || mine.some((h) => open.has(h));
    });
}

/* ------------------------------------------------------------------ */
/* Feat gates and exclusive groups (3.627.0)                            */
/* ------------------------------------------------------------------ */

/** A feat's traits line as lowercased keys ("Movement, Unliving-Skeleton"). */
function featTraitKeys(traits) {
  const raw = Array.isArray(traits) ? traits : String(traits ?? "").split(/[,;]/);
  return raw.map(registryKey).filter(Boolean);
}

/**
 * A trait that only some characters may take feats from. The gate opens
 * when the actor owns ANY of the named feats; two registrations for one
 * trait add names rather than replace them.
 *
 * @param {string} trait The trait as printed ("Unliving-Skeleton").
 * @param {string[]} featNames The feats that open it.
 */
export function registerFeatGate(trait, featNames, moduleId = null) {
  const key = registryKey(trait);
  const names = (Array.isArray(featNames) ? featNames : [featNames]).map(registryKey).filter(Boolean);
  if (!key || !names.length) {
    problem(`registerFeatGate: needs a trait and at least one feat name (got ${JSON.stringify({ trait, featNames })})`);
    return false;
  }
  const set = registry.featGates.get(key) ?? new Set();
  for (const n of names) set.add(n);
  registry.featGates.set(key, set);
  noteContributor(moduleId);
  return true;
}

/**
 * The first gate that keeps this feat from an actor owning `ownedFeatNames`,
 * or null when every gated trait on it is open. A feat with two gated
 * traits needs both opened — each trait is its own requirement.
 *
 * @returns {null|{trait: string, needs: string[]}}
 */
export function featGateBlock(traits, ownedFeatNames = [], featName = "") {
  const owned = new Set(Array.from(ownedFeatNames ?? []).map(registryKey));
  const self = registryKey(featName);
  for (const trait of featTraitKeys(traits)) {
    const opens = registry.featGates.get(trait);
    if (!opens) continue;
    // A FEAT THAT OPENS THE GATE IS NOT KEPT BEHIND IT. The Unliving
    // archetypes print the Unliving trait themselves ("ARCHETYPE UNLIVING"),
    // and are the feats that open it.
    if (self && opens.has(self)) continue;
    if (![...opens].some((n) => owned.has(n))) return { trait, needs: [...opens] };
  }
  return null;
}

/**
 * Feats of which a character may own one. A second registration of the
 * same group adds members.
 *
 * @param {string} group A label for the refusal ("Unliving Archetype").
 * @param {string[]} featNames
 */
export function registerExclusiveFeats(group, featNames, moduleId = null) {
  const key = registryKey(group);
  const names = (Array.isArray(featNames) ? featNames : [featNames]).map(registryKey).filter(Boolean);
  if (!key || names.length < 2) {
    problem(`registerExclusiveFeats: needs a group and at least two feat names (got ${JSON.stringify({ group, featNames })})`);
    return false;
  }
  const entry = registry.exclusiveFeats.get(key) ?? { name: String(group).trim(), feats: new Set() };
  for (const n of names) entry.feats.add(n);
  registry.exclusiveFeats.set(key, entry);
  noteContributor(moduleId);
  return true;
}

/**
 * Which owned feat already fills this feat's exclusive group, or null.
 * Owning THIS feat is not a conflict with itself.
 *
 * @returns {null|{group: string, held: string}}
 */
export function exclusiveFeatConflict(featName, ownedFeatNames = []) {
  const feat = registryKey(featName);
  if (!feat) return null;
  for (const { name, feats } of registry.exclusiveFeats.values()) {
    if (!feats.has(feat)) continue;
    const held = Array.from(ownedFeatNames ?? []).find((n) => {
      const k = registryKey(n);
      return k !== feat && feats.has(k);
    });
    if (held) return { group: name, held: String(held).trim() };
  }
  return null;
}

/** The refusal text for a second member of an exclusive group. */
export function exclusiveFeatRefusal(featName, ownedFeatNames = [], actorName = "This character", options = {}) {
  if (options?.trgAllowExclusiveFeat) return null;
  const conflict = exclusiveFeatConflict(featName, ownedFeatNames);
  if (!conflict) return null;
  return `${actorName} already holds ${conflict.held}, and a character may hold only one ${conflict.group} feat. `
    + `Remove it first to take ${String(featName).trim()}.`;
}

/* ------------------------------------------------------------------ */
/* Skill substitutions                                                  */
/* ------------------------------------------------------------------ */

/**
 * "Use Perform instead of Religion for Perform Last Rites" — the same
 * shape SKILL_SUBSTITUTION_FEATS holds: one entry or a list of
 * `{ action, skill, modifier? }`, keyed by the feat's name.
 */
export function registerSkillSubstitution(featName, entries, moduleId = null) {
  const key = registryKey(featName);
  const list = (Array.isArray(entries) ? entries : [entries]).filter((e) => e?.action && e?.skill);
  if (!key || !list.length) { problem(`registerSkillSubstitution: "${featName}" needs a name and at least one { action, skill }`); return false; }
  registry.skillSubstitutions.set(key, list.map((e) => ({ ...e })));
  noteContributor(moduleId);
  return true;
}

export function registeredSkillSubstitution(featName) {
  return registry.skillSubstitutions.get(registryKey(featName)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Degree upgrades                                                      */
/* ------------------------------------------------------------------ */

const DEGREE_NAMES = new Set(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);

/**
 * "Treat a Partial as a Success" — the Shadowborn Agility shape
 * (`{ actionKey, from, to }`), keyed by the feat that grants it.
 */
export function registerDegreeUpgrades(featName, entries, moduleId = null) {
  const key = registryKey(featName);
  const list = (Array.isArray(entries) ? entries : [entries]).filter((e) =>
    e?.actionKey && DEGREE_NAMES.has(String(e.from).toLowerCase()) && DEGREE_NAMES.has(String(e.to).toLowerCase()));
  if (!key || !list.length) { problem(`registerDegreeUpgrades: "${featName}" needs a name and at least one { actionKey, from, to } with real degree names`); return false; }
  registry.degreeUpgrades.set(key, list.map((e) => ({ actionKey: String(e.actionKey), from: String(e.from).toLowerCase(), to: String(e.to).toLowerCase() })));
  noteContributor(moduleId);
  return true;
}

export function registeredDegreeUpgrades(featName) {
  return registry.degreeUpgrades.get(registryKey(featName)) ?? null;
}

/**
 * A warping option a feat grants (3.625.0). Pillars of Faith's Swift
 * Mender prints "PP Cost +4: reduce the AP cost of a Healing spell by 1";
 * Renewed Restoration "PP Cost +4: ignore Restoration's daily limit";
 * Guiding Luminescence lets the innate Guidance take a second target.
 * Each is a WARP in the book's own shape — a cost, a sentence, a mod —
 * that belongs to the caster rather than the spell, so it is registered
 * against the feat and joins the spell's own warps at cast time.
 *
 * @param {string} featName
 * @param {Array<{match: {name?: string, traits?: string[], anyTraits?: string[], damaging?: boolean, tradition?: string, innate?: boolean}, when?: (actor) => boolean, warp: {ppCost: number, text: string, mods: object, max?: number}}>} entries
 */
export function registerSpellWarps(featName, entries, moduleId = null) {
  const key = registryKey(featName);
  const list = (Array.isArray(entries) ? entries : [entries]).filter((e) =>
    e?.match && typeof e.match === "object" && e?.warp && typeof e.warp === "object"
    && typeof e.warp.text === "string" && e.warp.text.trim() && e.warp.mods && typeof e.warp.mods === "object");
  if (!key || !list.length) { problem(`registerSpellWarps: "${featName}" needs a name and at least one { match, warp: { text, mods } }`); return false; }
  registry.spellWarps.set(key, list.map((e) => ({
    match: {
      name: e.match.name ? String(e.match.name).trim().toLowerCase() : "",
      traits: (Array.isArray(e.match.traits) ? e.match.traits : []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
      tradition: e.match.tradition ? String(e.match.tradition).trim().toLowerCase() : "",
      innate: e.match.innate === undefined ? null : Boolean(e.match.innate),
      // 3.684.0 (Eldritch Arts Block 6, G15; Blood of the Wyrm, Graham's
      // Q106): any one of these traits, and a spell that deals damage.
      anyTraits: (Array.isArray(e.match.anyTraits) ? e.match.anyTraits : []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
      damaging: e.match.damaging === true
    },
    // `when(actor)` (3.684.0, G15): offered only to a caster it answers true
    // for — "of your dragon type", one entry per type. A warp mod
    // `damageType: "<type>"` turns all of the cast's damage to that type.
    ...(typeof e.when === "function" ? { when: e.when } : {}),
    warp: { ppCost: Math.max(0, Math.trunc(Number(e.warp.ppCost) || 0)), text: e.warp.text.trim(), mods: { ...e.warp.mods }, max: Math.max(1, Math.trunc(Number(e.warp.max) || 1)) }
  })));
  noteContributor(moduleId);
  return true;
}

export function registeredSpellWarps(featName) {
  return registry.spellWarps.get(registryKey(featName)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Runes and item automations (3.626.0)                                 */
/* ------------------------------------------------------------------ */

const RUNE_KINDS = Object.freeze(["armour", "shield", "weapon"]);

/**
 * A rune a module adds to the catalogue (3.626.0). Pillars of Faith's
 * Chapter 11 prints fifteen; each is a rune in the core's own shape — a
 * key, a name, what it goes on, a tier ladder or a single level and price
 * — plus `declares`, the mechanism it uses, as data the system reads
 * (module/rune-declarations.mjs lists the keys). A rune declaring nothing
 * is still inscribable and priced; its `note` is what the sheet says.
 *
 * @param {Array<{key: string, name: string, traits?: string, on: string[],
 *   tiers?: Array<{tier: string, level: number, price: number, dice?: string}>,
 *   level?: number, price?: number, armourPrice?: number, shieldPrice?: number,
 *   activate?: string, effect?: string, note?: string, declares?: object}>} runes
 */
/** A registered rune's usage rule, keeping only what the usage check reads. */
function registeredRuneUsage(raw) {
  const out = { text: String(raw.text ?? "").trim() || "a suitable weapon" };
  for (const k of ["melee", "ranged", "thrown", "keen"]) if (raw[k] === true) out[k] = true;
  if (Array.isArray(raw.damage)) out.damage = raw.damage.map((d) => String(d).trim().toLowerCase()).filter(Boolean);
  return Object.freeze(out);
}

export function registerRunes(runes, moduleId = null) {
  let count = 0;
  for (const raw of Array.isArray(runes) ? runes : [runes]) {
    const key = String(raw?.key ?? "").trim();
    const name = String(raw?.name ?? "").trim();
    const on = (Array.isArray(raw?.on) ? raw.on : []).map((k) => String(k).trim().toLowerCase()).filter((k) => RUNE_KINDS.includes(k));
    const tiers = Array.isArray(raw?.tiers) && raw.tiers.length
      ? raw.tiers.map((t, i) => ({ tier: String(t?.tier ?? ["I", "II", "III", "IV", "V", "VI"][i] ?? i + 1), level: Math.max(0, Math.trunc(Number(t?.level) || 0)), price: Math.max(0, Math.trunc(Number(t?.price) || 0)), ...(t?.dice ? { dice: String(t.dice) } : {}) }))
      : null;
    const priced = tiers || Number.isFinite(Number(raw?.price)) || Number.isFinite(Number(raw?.armourPrice)) || Number.isFinite(Number(raw?.shieldPrice));
    if (!key || !name || !on.length || !priced) {
      problem(`registerRunes: "${name || key || "?"}" needs a key, a name, what it goes on (armour, shield, weapon) and a price (tiers, price, or armourPrice/shieldPrice)`);
      continue;
    }
    registry.runes.set(key, {
      key, name, on,
      traits: String(raw.traits ?? "").trim(),
      // Absent, not null, when single-priced: the catalogue reads a null
      // `tiers` as the Spell Effect rune's "priced from its spell" shape.
      ...(tiers ? { tiers } : {}),
      level: Math.max(0, Math.trunc(Number(raw.level) || 0)),
      price: Number.isFinite(Number(raw.price)) ? Math.max(0, Math.trunc(Number(raw.price))) : null,
      armourPrice: Number.isFinite(Number(raw.armourPrice)) ? Math.max(0, Math.trunc(Number(raw.armourPrice))) : null,
      shieldPrice: Number.isFinite(Number(raw.shieldPrice)) ? Math.max(0, Math.trunc(Number(raw.shieldPrice))) : null,
      activate: String(raw.activate ?? "").trim(),
      effect: String(raw.effect ?? "").trim(),
      note: String(raw.note ?? "").trim(),
      declares: raw.declares && typeof raw.declares === "object" ? raw.declares : {},
      // WHAT IT MAY BE INSCRIBED ON (3.673.0; found in review): a weapon
      // rune's printed Usage line, in weapon-rune-usage.mjs's shape
      // ({ melee, ranged, thrown, damage, keen, text }). Inner Tempest's
      // Tranquil Quiver: "any ranged weapon".
      ...(raw.usage && typeof raw.usage === "object" ? { usage: registeredRuneUsage(raw.usage) } : {}),
      moduleId: moduleId ? String(moduleId) : ""
    });
    count += 1;
  }
  if (count) noteContributor(moduleId);
  return count;
}

/* ------------------------------------------------------------------ */
/* Light sources (3.669.0)                                              */
/* ------------------------------------------------------------------ */

/**
 * A light a module's content sheds, in the LIGHT_SOURCES shape, so the
 * illumination ladder, the token's glow and the GM relay all read it as they
 * read a torch. A core key cannot be replaced; the clash is reported.
 *
 *   { key, label, steps (signed, non-zero), cap (null for none) or floor,
 *     magical, radiusFeet (the reach the ladder counts),
 *     dimFeet?, brightFeet? (what is drawn, when it differs) }
 *
 * @param {object|object[]} entries
 * @param {string[]} coreKeys the core table's keys, which win
 */
export function registerLightSources(entries, moduleId = null, coreKeys = []) {
  let count = 0;
  const taken = new Set((coreKeys ?? []).map(String));
  for (const raw of Array.isArray(entries) ? entries : [entries]) {
    const key = String(raw?.key ?? "").trim();
    const steps = Math.trunc(Number(raw?.steps));
    const radiusFeet = Number(raw?.radiusFeet);
    if (!key || !Number.isFinite(steps) || steps === 0 || !(radiusFeet > 0)) {
      problem(`registerLightSources: "${key || "?"}" needs a key, non-zero steps and a radiusFeet`);
      continue;
    }
    if (taken.has(key)) {
      problem(`registerLightSources: "${key}" is a core light source and cannot be replaced`);
      continue;
    }
    if (steps < 0 && !Number.isFinite(Number(raw.floor))) {
      problem(`registerLightSources: "${key}" lowers the light and needs a numeric floor`);
      continue;
    }
    const feet = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined);
    const entry = {
      label: String(raw.label ?? key).trim() || key,
      item: String(raw.item ?? raw.label ?? key).trim(),
      pack: "module",
      module: true,
      steps,
      magical: raw.magical === true,
      radiusFeet
    };
    if (steps > 0) entry.cap = raw.cap === null || raw.cap === undefined || !Number.isFinite(Number(raw.cap)) ? null : Math.trunc(Number(raw.cap));
    else entry.floor = Math.trunc(Number(raw.floor));
    if (feet(raw.dimFeet) !== undefined) entry.dimFeet = feet(raw.dimFeet);
    if (feet(raw.brightFeet) !== undefined) entry.brightFeet = feet(raw.brightFeet);
    if (moduleId) entry.moduleId = String(moduleId);
    registry.lightSources.set(key, Object.freeze(entry));
    count += 1;
  }
  if (count) noteContributor(moduleId);
  return count;
}

/** A module's light source by key, or null. */
export function registeredLightSource(key) {
  return registry.lightSources.get(String(key ?? "")) ?? null;
}

/**
 * A ROAD TO CREATE THROUGH ANOTHER SKILL (3.673.0, C8). Inner Tempest's
 * Monastic Items: Meditation for a magic item, by a character with Inner
 * Discipline, at DC +2. The skill joins the Create action's list
 * (`addSkillToAction`); see create-crafting.mjs `normaliseCreateRoute`.
 * @returns {boolean}
 */
export function registerCreateRoute(raw, moduleId = null, { addSkill = null } = {}) {
  const route = createRouteNormaliser(raw);
  if (!route) { problem(`registerCreateRoute: "${raw?.key ?? "?"}" needs a key, a skill, item types Create knows and what it requires`); return false; }
  registry.createRoutes.set(route.key, { ...route, moduleId: moduleId ? String(moduleId) : "" });
  if (typeof addSkill === "function") addSkill("create", route.skill);
  noteContributor(moduleId);
  return true;
}

/**
 * A KIND OF COMPANION (3.674.0, C1; Inner Tempest's Dragon Companions,
 * Graham's B10-12). The Animal Companion is the system's own kind; a module
 * may add another, with its own class, creature type, base creatures (its
 * pack), level rule and labels. A master may keep one companion of each kind.
 *
 *   key             "dragon" — stored on the companion as `system.companion.kind`
 *   label           "Dragon Companion" — the sheet's eyebrow and the cards' title
 *   className       the class item in the pack every such companion carries
 *   creatureType    the creature-type item it carries ("Wyrm")
 *   pack            the compendium id its class and base creatures live in
 *   levelFrom       (master, companion) => level; absent, the master's level
 *   sizeAbilityMods false: growing a size step changes no Str or Dex (C6)
 *   abilityPoints   false: no PC ability-point pool on its sheet (C7)
 *   command         the card's line on commanding it
 */
export function normaliseCompanionKind(raw) {
  const key = String(raw?.key ?? "").trim().toLowerCase();
  const className = String(raw?.className ?? "").trim();
  const pack = String(raw?.pack ?? "").trim();
  if (!key || key === "animal" || !className || !pack) return null;
  return {
    key,
    label: String(raw?.label ?? "").trim() || className,
    className,
    creatureType: String(raw?.creatureType ?? "").trim(),
    pack,
    levelFrom: typeof raw?.levelFrom === "function" ? raw.levelFrom : null,
    sizeAbilityMods: raw?.sizeAbilityMods !== false,
    abilityPoints: raw?.abilityPoints !== false,
    command: String(raw?.command ?? "").trim()
  };
}

export function registerCompanionKind(raw, moduleId = null) {
  const kind = normaliseCompanionKind(raw);
  if (!kind) { problem(`registerCompanionKind: "${raw?.key ?? "?"}" needs a key (not "animal"), a class name and a pack`); return false; }
  registry.companionKinds.set(kind.key, { ...kind, moduleId: moduleId ? String(moduleId) : "" });
  noteContributor(moduleId);
  return true;
}

/** One registered companion kind, or null. */
export function registeredCompanionKind(key) {
  return registry.companionKinds.get(String(key ?? "").trim().toLowerCase()) ?? null;
}

/** Every registered Create route. */
export function registeredCreateRoutes() {
  return Array.from(registry.createRoutes.values());
}

/** Every registered rune, or those that go on one kind of item. */
export function registeredRunes(kind = "") {
  const want = String(kind ?? "").trim().toLowerCase();
  const all = Array.from(registry.runes.values());
  return want ? all.filter((r) => r.on.includes(want)) : all;
}

/** One registered rune by key, or null. */
export function registeredRune(key) {
  return registry.runes.get(String(key ?? "").trim()) ?? null;
}

/**
 * What a wondrous item's `{ kind: "use", automation }` ability runs
 * (3.626.0): the same `{ hint, use(actor, item) }` shape as a feat
 * automation, keyed by the name the item's data gives.
 */
export function registerItemAutomation(name, spec, moduleId = null) {
  const key = registryKey(name);
  if (!key || typeof spec?.use !== "function") { problem(`registerItemAutomation: "${name}" needs a name and a use(actor, item) function`); return false; }
  registry.itemAutomation.set(key, { hint: String(spec.hint ?? ""), use: spec.use });
  noteContributor(moduleId);
  return true;
}

export function registeredItemAutomation(name) {
  return registry.itemAutomation.get(registryKey(name)) ?? null;
}

/**
 * What a peril's Trigger, or a peril's routine action, runs in place of the
 * generic save-and-apply (3.629.0): `trigger(peril, {spec, helpers})` and/or
 * `use(peril, item, {spec, helpers})`, each returning card lines. Keyed by
 * the name the peril's `automation` field, or the ability's
 * `flags.trg-prime.perilAutomation`, gives.
 */
export function registerPerilAutomation(name, spec, moduleId = null) {
  const key = registryKey(name);
  const ok = key && (typeof spec?.trigger === "function" || typeof spec?.use === "function");
  if (!ok) { problem(`registerPerilAutomation: "${name}" needs a name and a trigger(peril, ctx) or use(peril, item, ctx) function`); return false; }
  registry.perilAutomation.set(key, { trigger: typeof spec.trigger === "function" ? spec.trigger : null, use: typeof spec.use === "function" ? spec.use : null });
  noteContributor(moduleId);
  return true;
}

export function registeredPerilAutomation(name) {
  return registry.perilAutomation.get(registryKey(name)) ?? null;
}

/**
 * Extra feat picks a module grants (3.630.0): `picks(actor)` returns
 * `{ label, racial?, class?, general?, archetype? }` or null, and is asked
 * every time the sheet draws its feat banner, so a world setting it reads
 * takes effect at once. `archetype` is a pool only Archetype feats spend.
 */
export function registerFeatPickBonus(key, picks, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof picks !== "function") { problem(`registerFeatPickBonus: "${key}" needs a key and a picks(actor) function`); return false; }
  registry.featPickBonus.set(k, picks);
  noteContributor(moduleId);
  return true;
}

export function registeredFeatPickBonuses() {
  return Array.from(registry.featPickBonus.values());
}

/**
 * A module's share of incoming HP damage (3.630.0): `share(actor, amount,
 * ctx)` is asked, after temporary HP and Sacrificing Shield and before the
 * dying machinery, and returns `{ taken }` — the part it moved elsewhere.
 */
export function registerDamageShare(key, share, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof share !== "function") { problem(`registerDamageShare: "${key}" needs a key and a share(actor, amount, ctx) function`); return false; }
  registry.damageShare.set(k, share);
  noteContributor(moduleId);
  return true;
}

export function registeredDamageShares() {
  return Array.from(registry.damageShare.values());
}

/**
 * A module's answer to a casting before its check is rolled (3.672.0; Block
 * 8's C5): `gate(ctx)` is awaited with `{ actor, spell, spellData, innate,
 * itemCast, attack, rollsCheck }` and may return `{ modifiers, lines }` — rows
 * for the casting check and lines for its card. It cannot stop the casting.
 * A row may say `castingOnly: true` (3.675.0: the casting DC, not an attack)
 * or `attackOnly: true` (3.684.0, Eldritch Arts Block 6, G14; Spellblade's
 * Mark): left off the casting check and stacked in the spell attack's pool
 * against DB. ctx also carries `highMagic` and `targetUuids` (the targeted
 * creatures, 3.684.0).
 * 3.685.0 (Eldritch Arts Block 7, H8; Zone Disruption, Q154): an answer may
 * also say `disadvantage: true` (the casting check is rolled at disadvantage,
 * joined with its other biases) and `innateCheck: true` (an innate cast rolls a
 * Spellcraft check, innate ability + level against 10 + ⌊1.5 × PP⌋, and that
 * degree is the casting's: a failure is a failed casting with its use spent, a
 * Fumble rolls the fumble table). For the zone's +2 to Spell Concentration
 * DCs, a Region carries `flags["trg-prime"].castingZone = { concentrationDC,
 * label, exempt }` (magic/casting-zone.mjs).
 */
export function registerSpellCheckGate(key, gate, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof gate !== "function") { problem(`registerSpellCheckGate: "${key}" needs a key and a gate(ctx) function`); return false; }
  registry.spellCheckGates.set(k, gate);
  noteContributor(moduleId);
  return true;
}

export function registeredSpellCheckGates() {
  return Array.from(registry.spellCheckGates.values());
}

/**
 * EXTRA PP A CASTING MUST PAY (3.675.0; Eldritch Arts Block 1, C3).
 * `surcharge(ctx)` is awaited with `{ actor, spell, spellData, innate,
 * cantrip, itemCast, basePP, totalPP }` before the PP is tested, and may
 * return `{ pp, label, lines }`. The PP is paid ON TOP of the casting's own:
 * it does not raise the casting DC or count against the per-cast cap, and it
 * is paid whatever the degree. A caster who cannot pay cannot cast.
 */
export function registerCastSurcharge(key, surcharge, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof surcharge !== "function") { problem(`registerCastSurcharge: "${key}" needs a key and a surcharge(ctx) function`); return false; }
  registry.castSurcharges.set(k, surcharge);
  noteContributor(moduleId);
  return true;
}

export function registeredCastSurcharges() {
  return Array.from(registry.castSurcharges.values());
}

/**
 * ANOTHER WAY TO READ A SCROLL (3.675.0, C6). `path(ctx)` is awaited with
 * `{ kind, spellPPCost, spellTradition, spellName, skillRanks, skillTotals,
 * casterLevel, casterTradition }` and returns `{ key, label, skill, difficulty, dcAdjustment, available,
 * reason }` or null. `kind` is "scroll" (the only kind asked today). The
 * option joins the release ladder and is rolled like the others.
 */
export function registerReleasePath(key, path, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof path !== "function") { problem(`registerReleasePath: "${key}" needs a key and a path(ctx) function`); return false; }
  registry.releasePaths.set(k, path);
  noteContributor(moduleId);
  return true;
}

export function registeredReleasePaths() {
  return Array.from(registry.releasePaths.values());
}

/**
 * A CASTING REFUSED (3.678.0; Eldritch Arts Block 2, D7). `refuse(ctx)` is
 * awaited with `{ actor, spell, spellData, innate, itemCast, ritual }` before
 * anything is spent or rolled, and returns a reason (a string) or null. The
 * first reason given stops the casting and is shown to the player.
 */
export function registerCastRefusal(key, refuse, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof refuse !== "function") { problem(`registerCastRefusal: "${key}" needs a key and a refuse(ctx) function`); return false; }
  registry.castRefusals.set(k, refuse);
  noteContributor(moduleId);
  return true;
}

export function registeredCastRefusals() {
  return Array.from(registry.castRefusals.values());
}

/**
 * A TELEPORT THAT HAPPENS LATER THAN THE CAST (3.685.1; Eldritch Arts 0.10.0's
 * live test, finding 1). `defers(ctx)` is asked with `{ actor, spell,
 * spellData }` once a Teleportation spell is cast, and returns true when the
 * spell moves nobody yet. The cast then posts no "Teleported — Spatial
 * Awareness" card and records no teleport; the module calls
 * `helpers.teleportationArrives(caster, spell, moved)` when the teleport
 * actually happens (and may ask `helpers.teleportationFails(actor)` first).
 * Default-off: with nothing registered, every Teleportation spell is carded at
 * its cast, as before.
 */
export function registerDeferredTeleport(key, defers, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof defers !== "function") { problem(`registerDeferredTeleport: "${key}" needs a key and a defers(ctx) function`); return false; }
  registry.deferredTeleports.set(k, defers);
  noteContributor(moduleId);
  return true;
}

export function registeredDeferredTeleports() {
  return Array.from(registry.deferredTeleports.values());
}

/**
 * THE CASTING'S DEGREE READ DIFFERENTLY (3.678.0, D7). `remap(ctx)` is
 * awaited with `{ actor, spell, spellData, degree, innate, itemCast, ritual }`
 * after the check and before the degree decides the PP and the fumble roll,
 * and returns `{ degree, lines }` or null. Remaps run in registration order,
 * each seeing the last one's degree.
 * 3.683.0 (Eldritch Arts Block 5, C14): ctx also carries `highMagic` (the
 * cast's) and `castOptions` (the keys of the casting options taken), for
 * Runic Stabiliser's "When attempting a High Magic check … If you do, you
 * treat a Partial result as a Success".
 */
export function registerCastDegreeRemap(key, remap, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof remap !== "function") { problem(`registerCastDegreeRemap: "${key}" needs a key and a remap(ctx) function`); return false; }
  registry.castDegreeRemaps.set(k, remap);
  noteContributor(moduleId);
  return true;
}

export function registeredCastDegreeRemaps() {
  return Array.from(registry.castDegreeRemaps.values());
}

/**
 * NO RESONANCE EVENT HERE (3.678.0, D6). `suppress(ctx)` is awaited with
 * `{ actor, reason }` before a Resonance event is rolled, and returns a
 * reason (a string) or null. Any reason means no event is rolled; the card
 * says why.
 */
export function registerResonanceSuppressor(key, suppress, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof suppress !== "function") { problem(`registerResonanceSuppressor: "${key}" needs a key and a suppress(ctx) function`); return false; }
  registry.resonanceSuppressors.set(k, suppress);
  noteContributor(moduleId);
  return true;
}

export function registeredResonanceSuppressors() {
  return Array.from(registry.resonanceSuppressors.values());
}

/**
 * AN EFFECT SWITCHED OFF WHILE A MODULE SAYS SO (3.678.0, D14).
 * `suppressed(effect)` is called synchronously, often, by
 * TRGActiveEffect.isSuppressed, and returns true to switch the effect off.
 * Nothing is written: the effect is back the moment the answer changes.
 */
export function registerEffectSuppressor(key, suppressed, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof suppressed !== "function") { problem(`registerEffectSuppressor: "${key}" needs a key and a suppressed(effect) function`); return false; }
  registry.effectSuppressors.set(k, suppressed);
  noteContributor(moduleId);
  return true;
}

export function registeredEffectSuppressors() {
  return Array.from(registry.effectSuppressors.values());
}

/**
 * WHOSE HIGH MAGIC RULES (3.678.0, D1b). A sourcebook whose High Magic
 * supersedes the Fiends & Fables creature guideline declares itself here.
 */
export function registerHighMagicRules(moduleId) {
  const id = String(moduleId ?? "").trim();
  if (!id) { problem("registerHighMagicRules: a module id is required"); return false; }
  registry.highMagicRules = id;
  noteContributor(id);
  return true;
}

export function registeredHighMagicRules() {
  return registry.highMagicRules;
}

/**
 * A RITUAL'S RULES FROM A SOURCEBOOK (3.679.0; Eldritch Arts Block 2b, D13).
 * Every function is optional and is awaited with the ritual's context
 * `{ actor, spell, spellData, highMagic }` (plus what each one says below):
 *
 *   variants(ctx)  → [{ key, label, hint }] — other ways to pay the PP,
 *                    offered beside "Spellcraft, paying PP";
 *   fields(ctx)    → an HTML string of extra fields for the ritual dialog;
 *   prepare(ctx)   → with `form`, `variant` (the chosen key or ""), `basePP`,
 *                    `ppOver`, `secondaryCount`: `{ dc: {value, label},
 *                    skill: {key, label}, dcRows: [{label, value}],
 *                    modifiers: [{label, value, type}], seats, lines,
 *                    refused }`. `dc` and `skill` are read from the rules
 *                    that offered the chosen variant only;
 *   liftsCap(ctx)  → true when this spell's ritual is not capped at Success;
 *   partialCasts(ctx) → true when this spell's ritual Partial takes effect
 *                    (3.687.0, H13): `castSpell` is called with the Partial,
 *                    which casts, spends no PP and applies no ritual
 *                    consequences, so `trgPrimeSpellSettled` carries
 *                    `degree: "partial"`, `ritual: true`, `cast: true`;
 *   minSecondaries(ctx) → 0 when this ritual may be performed by its primary
 *                    alone (3.687.0, H14); the overcasting room is still 2 PP
 *                    a secondary.
 */
export function registerRitualRules(key, spec, moduleId = null) {
  const k = registryKey(key);
  const fns = ["variants", "fields", "prepare", "liftsCap", "partialCasts", "minSecondaries"];
  const ok = spec && typeof spec === "object"
    && fns.some((f) => typeof spec[f] === "function")
    && fns.every((f) => spec[f] === undefined || typeof spec[f] === "function");
  if (!k || !ok) { problem(`registerRitualRules: "${key}" needs a key and at least one of ${fns.join(", ")} as functions`); return false; }
  registry.ritualRules.set(k, Object.freeze({ ...spec }));
  noteContributor(moduleId);
  return true;
}

export function registeredRitualRules() {
  return Array.from(registry.ritualRules.entries()).map(([key, spec]) => ({ key, spec }));
}

/**
 * A CASTING OPTION A MODULE OFFERS (3.679.0; Eldritch Arts Block 2b).
 * `offer(ctx)` is awaited with `{ actor, spell, spellData, innate, itemCast,
 * ritual, highMagic, stored, storedForeign, storedPP, ppSources }` (3.684.0:
 * `ppSources` is `[{ key, label, drawn }]`, the G2 sources drawn on this cast
 * — asked before this prompt; what each paid is on trgPrimeSpellSettled) and returns `{ label, hint, required }` to offer it on
 * the Casting Conditions prompt, or null. A `required` option is applied
 * without a tick and said on the prompt. `apply(ctx)` is awaited for each
 * option taken and returns `{ castingDC, saveDC, label, lines }`: `castingDC`
 * joins the casting DC as its own labelled part, `saveDC` the spell's Save
 * DC (as a warp's would), and `lines` the result card.
 * 3.683.0 (Eldritch Arts Block 5, C14): `apply` may also answer `ap`, whole
 * AP the option adds to the cast (Runic Stabiliser's "spend 1 AP inscribing
 * a stabilizing rune"), charged with the cast's AP, in an encounter only.
 * 3.684.0 (Eldritch Arts Block 6, G14; Sanguine Channel): `apply` may also
 * answer `attack: n` (with `attackType`, untyped by default) — added to the
 * spell attack's total against DB only, never to the casting check or its DC
 * — and `saveDCTarget: { uuid, value }`, one target's Save DC (every other
 * target keeps the cast's). See magic/cast-options.mjs.
 */
export function registerCastOption(key, spec, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof spec?.offer !== "function" || typeof spec?.apply !== "function") {
    problem(`registerCastOption: "${key}" needs a key and offer(ctx) and apply(ctx) functions`); return false;
  }
  registry.castOptions.set(k, Object.freeze({ offer: spec.offer, apply: spec.apply }));
  noteContributor(moduleId);
  return true;
}

export function registeredCastOptions() {
  return Array.from(registry.castOptions.entries()).map(([key, spec]) => ({ key, spec }));
}

/**
 * A DISPEL MODIFIER (3.683.0; Eldritch Arts Block 5, D10, seam C9; Graham's
 * Q63, Q67, Q84, Q85, Q88). Asked by the Dispel action (combat/action-workflow.mjs,
 * every route: the action, Counter Spell's free Dispel, and `resolveAction`'s
 * `presetDispel` counters such as Disrupting Magic).
 *
 * `offer(ctx)` is awaited before the Dispel prompt with `{ actor, target,
 * effect, declaredPP, counterSpell, presetDispel }` — `target` the creature
 * targeted (null on a counter), `effect` the counter's spell name or "",
 * `declaredPP` null (the PP is declared on the prompt that follows; what is
 * answered applies to it), `counterSpell` true on a counter. It answers null,
 * or data:
 *   { label, hint,
 *     optional,      true: a tick on the prompt; else applied, said there
 *     ppFactor,      (0, 1): PP paid = that share of the PP declared, rounded
 *                    up, whatever the degree; not compounded with Dispel's
 *                    own Critical/Partial half (Q63)
 *     ppReduction,   PP off what is declared, never below 1 (Runebreaker)
 *     ppReplace,     a number: no PP spent, and the counteract value is that
 *                    number in place of the PP declared (Dispel Power, Q84)
 *     difficulty,    a step key ("veryHard"), the check's default difficulty
 *     outcomes,      { degree: text } replacing Dispel's results; unprinted
 *                    rungs fall back as the core's do (m42)
 *     focus, itemId, true: spend a Focus use of that item when the Dispel
 *                    rolls; offered only while it has one
 *     modifiers,     [{ label, value, type }] on the check (Threadbreaker's +2)
 *     bias }         3.685.0 (Eaog Balls): `bias: "advantage" | "disadvantage"`
 *                    on the Dispel check, joined with its other biases
 * `onResult(ctx)` (optional) is awaited after the outcome card, for each
 * modifier that applied, with `{ actor, degree, rawDegree, countered,
 * counterSpell, target, targetCaster, spell, effect, check, total,
 * presetDispel, dispel: { declaredPP, paidPP, counteractValue, effectValue,
 * dc } }`; `countered` is a counter at Success or better, `targetCaster` and
 * `spell` the documents a counter's `presetDispel.casterUuid` and `spellUuid`
 * name (or null), and `check` the roll (null on a card resumed by the GM's
 * DC). It may answer `{ lines }`, posted as a card of their own.
 * Default-off: with nothing registered a Dispel is page 91's.
 */
export function registerDispelModifier(key, spec, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof spec?.offer !== "function" || (spec.onResult !== undefined && typeof spec.onResult !== "function")) {
    problem(`registerDispelModifier: "${key}" needs a key, an offer(ctx) function and, if given, an onResult(ctx) function`); return false;
  }
  registry.dispelModifiers.set(k, Object.freeze({ offer: spec.offer, onResult: spec.onResult ?? null }));
  noteContributor(moduleId);
  return true;
}

export function registeredDispelModifiers() {
  return Array.from(registry.dispelModifiers.entries()).map(([key, spec]) => ({ key, spec }));
}

/**
 * A RAISE OF THE PP CAP PER CAST (3.680.0; Eldritch Arts Block 3a, D5).
 * `raise(ctx)` is awaited with `{ actor, spell, spellData, highMagic, warped,
 * specialist, basePP, totalPP }` before the over-the-cap test, and returns a
 * whole number (or `{ value, label }`) added to the cap for this cast. What it
 * applies to is the module's: Raw Power answers only a warped High Magic cast.
 */
export function registerCastCapModifier(key, raise, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof raise !== "function") { problem(`registerCastCapModifier: "${key}" needs a key and a raise(ctx) function`); return false; }
  registry.castCapModifiers.set(k, raise);
  noteContributor(moduleId);
  return true;
}

export function registeredCastCapModifiers() {
  return Array.from(registry.castCapModifiers.entries()).map(([key, raise]) => ({ key, raise }));
}

/**
 * A SPECIALIST SPELL OPENED TO A CHARACTER (3.680.0, Block 3a).
 * `allows(actor, spell)` is asked with the spell's index entry (`name`,
 * `system.specialistClass`, `system.traits`, `system.ppCost`) and returns true
 * to open it, whatever its class tag says. It can only open: the core's own
 * rule still opens what it opens, and the feat's PP cap and "not already known"
 * still apply.
 */
export function registerSpecialistAccess(key, allows, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof allows !== "function") { problem(`registerSpecialistAccess: "${key}" needs a key and an allows(actor, spell) function`); return false; }
  registry.specialistAccess.set(k, allows);
  noteContributor(moduleId);
  return true;
}

export function registeredSpecialistAccess() {
  return Array.from(registry.specialistAccess.entries()).map(([key, allows]) => ({ key, allows }));
}

/**
 * A FAMILIAR'S MODIFIER (3.680.0, Block 3a, D8). `modify(familiar, mirror)` is
 * asked as the familiar is derived, with its master's snapshot (level, saves,
 * maximum HP, and from 3.680.0 the master's ability totals), and returns
 * `{ label, hp, saves: number | {fortitude, reflex, will}, type }` or null.
 * HP is added after the familiar's own half-the-master's; saves are pooled as
 * `type` (default "class").
 */
export function registerFamiliarModifier(key, modify, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof modify !== "function") { problem(`registerFamiliarModifier: "${key}" needs a key and a modify(familiar, mirror) function`); return false; }
  registry.familiarModifiers.set(k, modify);
  noteContributor(moduleId);
  return true;
}

export function registeredFamiliarModifiers() {
  return Array.from(registry.familiarModifiers.entries()).map(([key, modify]) => ({ key, modify }));
}

/**
 * A POWER POINT GRANT BY FEATURE NAME (3.680.0, Block 3a). `{ perLevel, label,
 * types }`: an owned item of one of `types` (default ability and feat) with
 * this name is owed `perLevel` × character level to the PP base, as a stored
 * delta the core's reconcile trues up and hands back when the item goes.
 * `stat: "hp"` (3.682.0; Eldritch Arts' Natural Resilience, "you gain an
 * additional HP per level") owes it to maximum HP instead, as the core's own
 * Stone-Like Endurance is.
 *
 * `stat: "bsb"` (3.684.0; Eldritch Arts Block 6, G11) is a BSB FLOOR of half
 * the character level, as the core's four caster archetypes are (Graham, 20
 * August 2026: applied only where the character's BSB is lower), rounded as
 * `halfLevel` says: "up" or "down" (the default, the core's own). Birthrager:
 * "a BSB equal to half your level (round up)". It takes no `perLevel`.
 */
export function registerPPGrant(name, spec = {}, moduleId = null) {
  const k = registryKey(name);
  if (String(spec?.stat ?? "").trim().toLowerCase() === "bsb") {
    if (!k) { problem(`registerPPGrant: a BSB floor needs a name (got ${JSON.stringify(name)})`); return false; }
    const types = Array.isArray(spec?.types) && spec.types.length ? spec.types.map((t) => String(t)) : ["ability", "feat"];
    const halfLevel = String(spec?.halfLevel ?? "down").trim().toLowerCase() === "up" ? "up" : "down";
    registry.ppGrants.set(k, Object.freeze({ name: k, perLevel: 0, label: String(spec?.label ?? name).trim() || String(name), types: Object.freeze(types), stat: "bsb", halfLevel }));
    noteContributor(moduleId);
    return true;
  }
  const per = Math.trunc(Number(spec?.perLevel));
  if (!k || !Number.isFinite(per) || per === 0) { problem(`registerPPGrant: "${name}" needs a name and a non-zero whole perLevel`); return false; }
  const types = Array.isArray(spec?.types) && spec.types.length ? spec.types.map((t) => String(t)) : ["ability", "feat"];
  const stat = String(spec?.stat ?? "pp").trim().toLowerCase() === "hp" ? "hp" : "pp";
  registry.ppGrants.set(k, Object.freeze({ name: k, perLevel: per, label: String(spec?.label ?? name).trim() || String(name), types: Object.freeze(types), stat }));
  noteContributor(moduleId);
  return true;
}

export function registeredPPGrants() {
  return Array.from(registry.ppGrants.values());
}

/**
 * A CHECK REACTION (3.681.0, Block 3b). `{ before, after }`, either or both:
 *   before(ctx)  awaited before the dice of an attack check, a save or a
 *                skill check: `{ check, actor, type, subject, label, dc,
 *                traits, token }`. Answers `{ advantage: true, line }` or null.
 *                3.683.0 (Eldritch Arts Block 5, C2): ctx adds `{ isArea,
 *                saveSource, sourceUuid, attackMode }` off the check, and an
 *                answer may also carry `modifiers: [{ label, value, type }]`
 *                (pushed onto the check before the dice, and carried on a
 *                reroll of it as the advantage is: Voidbound Resolve's +2
 *                racial) and `declare: "success"` (the check is declared a
 *                Success, "the dice do not count", and locked: no Conviction,
 *                reroll, conversion or after-reaction; Anchor in Nothing).
 *                Once one answer declares, no later reaction is asked.
 *                3.684.0 (Eldritch Arts Block 6, G25; Arcane Fencer): ctx
 *                adds `{ weaponUuid, twoHanded }` — a weapon attack's weapon
 *                and whether it is held in two hands; "" and false otherwise.
 *   after(ctx)   awaited once the result is final and before anything reads
 *                it: ctx adds `{ degree, succeeded, failed, exploded, total }`
 *                (an attack's `succeeded` is the hit). Answers
 *                `{ reroll: true, line }` or null. A reroll is fresh dice
 *                under the same modifiers less the first roll's Conviction
 *                die, and the second result is locked: nothing after it may
 *                modify or reroll it. One reroll a check.
 *                3.685.0 (Eldritch Arts Block 7, H6; Mirror Reprise): on an
 *                attack check that hit, an answer `{ miss: true, line }` (with
 *                `label`) makes the hit a miss against that creature — no
 *                damage, no critical. The first such answer ends the asking.
 */
export function registerCheckReaction(key, spec = {}, moduleId = null) {
  const k = registryKey(key);
  const before = typeof spec?.before === "function" ? spec.before : null;
  const after = typeof spec?.after === "function" ? spec.after : null;
  if (!k || (!before && !after)) { problem(`registerCheckReaction: "${key}" needs a key and a before(ctx) or after(ctx) function`); return false; }
  registry.checkReactions.set(k, Object.freeze({ key: k, before, after }));
  noteContributor(moduleId);
  return true;
}

export function registeredCheckReactions() {
  return Array.from(registry.checkReactions.values());
}

/**
 * A DAMAGE REACTION (3.681.0, Block 3b). `offer(ctx)` is awaited before damage
 * meets a creature's defences, with `{ target, kind: "weapon"|"spell"|"other",
 * types, magical, spellName, sourceName, sourceUuid, source }`. Answers
 * `{ resist, immune, scope, line }` or null: `resist` and `immune` are "all"
 * or a list of damage types (and "precision"); `scope` is "instance" (this
 * damage only) or "cast" (every instance from the cast running now, until it
 * settles).
 * 3.685.0 (Eldritch Arts Block 7; Invoke True Name): `weak` — a list of damage
 * types the creature is weak to for that scope, beside its own weaknesses.
 */
export function registerDamageReaction(key, offer, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof offer !== "function") { problem(`registerDamageReaction: "${key}" needs a key and an offer(ctx) function`); return false; }
  registry.damageReactions.set(k, offer);
  noteContributor(moduleId);
  return true;
}

export function registeredDamageReactions() {
  return Array.from(registry.damageReactions.values());
}

/**
 * A CAST REACTION (3.681.0, Block 3b). `offer(ctx)` is awaited after a cast's
 * check and before its PP is spent or anything lands, for every cast that
 * would land (innate and no-check casts included), with `{ actor, token,
 * spell, spellData, degree, pp, castPP, level, innate, itemCast, ritual, highMagic }`
 * (3.684.0, Q119: `castPP` is "the PP as cast (warps included)" — an innate
 * spell's printed PP + warps + metamagic — where `pp` is what is paid; no
 * Save DC exists yet when the reactions are asked).
 * Answers `{ stop: true, line }` or null. A stopped cast resolves as a
 * failure: whatever a failure costs is paid, and nothing lands.
 * 3.684.0 (Eldritch Arts Block 6, G17): an answer that does not stop may
 * SHAPE the cast instead — `scale: 0.5 | 2` halves or doubles its area
 * (rounded down to 5 ft), duration, number of targets (min 1) and number of
 * damage dice (min 1); `saveBias: "advantage" | "disadvantage"` is every
 * target's save, applied only when nothing could be scaled (Counter Channel,
 * Q118); `retargetCaster: true` makes the caster the sole target, at its own
 * DC (Reflective Warding; an area spell is left to the GM). The first answer
 * of each kind holds. See magic/cast-reaction-shape.mjs.
 * 3.685.0 (Eldritch Arts Block 7, H5): ctx adds `saveDC` — the Save DC this
 * cast will have if it lands at this degree (the same assembly the cast reads
 * after the reactions; nothing is spent to work it out). Two more answers:
 * `exclude: [uuid]` — the cast lands on everyone else (a targeted spell loses
 * that creature from its targets; an area spell leaves it out of what its
 * template catches; Spectral Aegis); and
 * `turnBack: { checkTotal, saveDC, target }` — the spell resolves against its source (`target: ""`) or the
 * token or actor uuid named, its attack reading `checkTotal` and its targets
 * saving against `saveDC` (Argent Reversal). Exclusions from every answer
 * join; the first turnBack holds.
 */
export function registerCastReaction(key, offer, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof offer !== "function") { problem(`registerCastReaction: "${key}" needs a key and an offer(ctx) function`); return false; }
  registry.castReactions.set(k, offer);
  noteContributor(moduleId);
  return true;
}

export function registeredCastReactions() {
  return Array.from(registry.castReactions.values());
}

/**
 * A CRITICAL REACTION (3.681.0, Block 3b). `offer(ctx)` is awaited before a
 * critical's injury roll, with `{ attacker, target, weapon, bias, severity }`.
 * Answers `{ disadvantage: true, line }` or null. Disadvantage and the
 * roll's own advantage cancel.
 *
 * 3.685.0 (Eldritch Arts Block 7, H7; Arcane Bastion, Q151): the second
 * argument may instead be `{ before, after }`, either or both. `before` is the
 * offer above. `after(ctx)` is awaited once the injury roll has been read, with
 * `{ attacker, target, weapon, severity, bias, result, row, hitLocation,
 * percentile: { value, tens, unit, drawn } }` (`row` the table row it reads:
 * `effect`, `persistence`, `conditions`). It answers `{ severitySteps: -n,
 * line }` or null: the same two dice are read |n| severities lower — Deadly
 * (advantage) → Serious (as rolled) → Minor (disadvantage) — and below Minor
 * there is no injury. The first answer that lowers holds; one lowering a roll.
 */
export function registerCriticalReaction(key, offer, moduleId = null) {
  const k = registryKey(key);
  const before = typeof offer === "function" ? offer : (typeof offer?.before === "function" ? offer.before : null);
  const after = typeof offer === "object" && typeof offer?.after === "function" ? offer.after : null;
  if (!k || (!before && !after)) { problem(`registerCriticalReaction: "${key}" needs a key and an offer(ctx) function (or { before, after })`); return false; }
  registry.criticalReactions.set(k, Object.freeze({ before, after }));
  noteContributor(moduleId);
  return true;
}

/** The `before` offers (the shape every caller before 3.685.0 read). */
export function registeredCriticalReactions() {
  return Array.from(registry.criticalReactions.values()).map((r) => r.before).filter(Boolean);
}

/** The `after` offers (3.685.0, H7). */
export function registeredCriticalAfterReactions() {
  return Array.from(registry.criticalReactions.values()).map((r) => r.after).filter(Boolean);
}

/**
 * AN INNATE LEVEL BONUS (3.682.0; Eldritch Arts Block 4, D9). `bonus(ctx)` is
 * asked when an innate spell is cast, with `{ actor, spell, traits, tradition }`
 * (traits lower-cased, the school's name among them), and answers a whole
 * number of levels (or 0). The innate level it raises is the one the cast's
 * attack, save DC, free warp budget and innate PP limit read. A spell granted
 * by an item is cast at the item's level, and is not raised.
 */
export function registerInnateLevelBonus(key, bonus, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof bonus !== "function") { problem(`registerInnateLevelBonus: "${key}" needs a key and a bonus(ctx) function`); return false; }
  registry.innateLevelBonuses.set(k, bonus);
  noteContributor(moduleId);
  return true;
}

export function registeredInnateLevelBonuses() {
  return Array.from(registry.innateLevelBonuses.entries()).map(([key, bonus]) => ({ key, bonus }));
}

/**
 * A CAST'S PRELUDE (3.682.0; Eldritch Arts Block 4). `prelude(ctx)` is awaited
 * when a spell is cast from the sheet, with `{ actor, spell, options }`, before
 * anything is asked, spent or rolled. It answers null to let the cast go on,
 * or `{ handled: true, result }` when it has done the casting itself (calling
 * `helpers.castSpell` with its own options, a `strikeCheck` say). It is not
 * asked for a cast made with any of the core's own options (an item's, a
 * stored spell's, a ritual, a reaction, a Strike's), so a prelude's own call
 * does not meet it again.
 */
export function registerCastPrelude(key, prelude, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof prelude !== "function") { problem(`registerCastPrelude: "${key}" needs a key and a prelude(ctx) function`); return false; }
  registry.castPreludes.set(k, prelude);
  noteContributor(moduleId);
  return true;
}

export function registeredCastPreludes() {
  return Array.from(registry.castPreludes.entries()).map(([key, prelude]) => ({ key, prelude }));
}

/**
 * A DYING RECOVERY MODIFIER (3.683.0; Eldritch Arts Block 5, C8). Relentless
 * Will (Human): "The first time each day that you gain the dying condition,
 * you do not gain a point of fatigued when leaving it." `modify(ctx)` is
 * awaited on every route out of Dying (a recovery check, magical healing, a
 * relief, Resuscitation, a "would die" guard), once a fatal injury has not
 * held the creature there and only when the caller has not already waived
 * the fatigue, with `{ actor, route, hp, fatigued, unconscious }`. It answers
 * `{ noFatigue: true, line }` to waive the point of Fatigued, `{ line }` to
 * say something, or null. The module decides "the first time each day"; the
 * first waiver stops the asking. See combat/death-state.mjs.
 */
export function registerDyingRecoveryModifier(key, modify, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof modify !== "function") { problem(`registerDyingRecoveryModifier: "${key}" needs a key and a modify(ctx) function`); return false; }
  registry.dyingRecoveryModifiers.set(k, modify);
  noteContributor(moduleId);
  return true;
}

export function registeredDyingRecoveryModifiers() {
  return Array.from(registry.dyingRecoveryModifiers?.entries?.() ?? []).map(([key, modify]) => ({ key, modify }));
}

/**
 * A FUMBLE MODIFIER (3.684.0; Eldritch Arts Block 6, G5, the audit's D6).
 * `modify(ctx)` is awaited before every Spell Fumble Table roll, with
 * `{ actor, blunder, pp, tradition, highMagic, check: { type, skill }, ritual,
 * release, metamagic, castOptions, cast }`: `check.type` is "spellcraft" (a
 * cast's or ritual's check, a release by Spellcraft), "skill" (a release by a
 * tradition skill, `skill` its key) or "concentration"; `metamagic` and
 * `castOptions` are the keys the cast took; `cast` its plain facts (see
 * magic/fumble-resonance-modifiers.mjs `castFacts`). Answers `{ modifier,
 * bias, label, line }` or null: `modifier` whole points added to the roll
 * (higher is worse: Mana Bound's −20 when `!blunder` on a Spellcraft check);
 * `bias` "advantage" (the lower first percentile kept) or "disadvantage" (the
 * higher), the open-ended continuation rolled once. Biases cancel as a d20's.
 * The flat `spellFumbleModifier` effect flag is unchanged.
 */
export function registerFumbleModifier(key, modify, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof modify !== "function") { problem(`registerFumbleModifier: "${key}" needs a key and a modify(ctx) function`); return false; }
  registry.fumbleModifiers.set(k, modify);
  noteContributor(moduleId);
  return true;
}

export function registeredFumbleModifiers() {
  return Array.from(registry.fumbleModifiers?.entries?.() ?? []).map(([key, modify]) => ({ key, modify }));
}

/**
 * A RESONANCE MODIFIER (3.684.0; Eldritch Arts Block 6, G5). A function (its
 * `roll`) or `{ roll, force }`, either or both:
 *   roll(ctx)   awaited before every Magical Resonance Event roll that a
 *               suppressor has not cancelled, with `{ actor, reason,
 *               highMagic, pp, metamagic, castOptions, cast, modifiers }`.
 *               Answers `{ modifier, bias, single, label, line }` or null:
 *               `single: true` lifts only the disadvantage High Magic brings
 *               (High Magic Resonance, Q147); `bias` as a fumble modifier's.
 *   force(ctx)  awaited once a cast has resolved, after its fumble, with
 *               `{ actor, spell, spellData, degree, cast, highMagic, pp,
 *               innate, itemCast, ritual, stored, storedForeign, metamagic,
 *               castOptions }` (`cast`: whether the spell went off; `stored`
 *               a stored spell's release, `storedForeign` an absorbed one's —
 *               3.684.0 review: Resonance Surge is not spent on one; the
 *               fumble ctx carries both too). Answers `true`, a reason, or
 *               `{ reason, line }` to force a Resonance event, rolled by the
 *               core as that cast's own (its modifiers, and a High Magic
 *               cast's disadvantage: Resonance Surge, Q148), else null.
 */
export function registerResonanceModifier(key, spec, moduleId = null) {
  const k = registryKey(key);
  const roll = typeof spec === "function" ? spec : (typeof spec?.roll === "function" ? spec.roll : null);
  const force = typeof spec === "object" && typeof spec?.force === "function" ? spec.force : null;
  if (!k || (!roll && !force)) { problem(`registerResonanceModifier: "${key}" needs a key and a roll(ctx) function or { roll, force }`); return false; }
  registry.resonanceModifiers.set(k, Object.freeze({ key: k, roll, force }));
  noteContributor(moduleId);
  return true;
}

export function registeredResonanceModifiers() {
  return Array.from(registry.resonanceModifiers?.values?.() ?? []);
}

/**
 * A CHARGED-ITEM RULE (3.684.0; Eldritch Arts Block 6, G6 — the audit's D12,
 * its feat half). Every charged item's PP now leave through one spend path,
 * `chargedItemSpend` (charged-items-workflow.mjs): Cast from Item's release
 * and a rod's spend (a metamagic rod's, a Rod of the Magi's draw). A rule is
 * `{ wieldLimit, cost, payment, metamagic, onRelease }`, any of them:
 *   wieldLimit(ctx {actor})  → n: how many charged items may be wielded; the
 *               highest answer (at least 1) is what the sheet's warning reads
 *               (Dual Channel 2, Conduit Mastery 3).
 *   cost(ctx {actor, item, pp, kind: "release"|"rod", reason, degree, wielded})
 *               → `{ reduction, minimum, free, label }`: PP off what the item
 *               pays, never below `minimum` (nor above what was due); `free`
 *               pays nothing (Conduit Mastery −1 min 1, Resonant Conduit).
 *   payment(ctx {actor, item, pp, remaining, wielded}) → `{ ownPP: true,
 *               allowEmpty, depletionBias, label }`: offered as a tick on Cast
 *               from Item. Ticked, the wielder's PP are charged by the degree
 *               and the item is untouched; `allowEmpty` lets an empty item be
 *               used so, and then Charge Depletion is rolled after the cast
 *               with `depletionBias` ("disadvantage" keeps the LOWER d100:
 *               low is worse on that table, Q131). Weave Infusion.
 *   metamagic(ctx {actor, item, spellName, pp, wielded}) → `{ allowed: true,
 *               ceiling, label }`: the released spell is cast with
 *               `itemMetamagic: true` and `itemMetamagicCeiling` (the most PP
 *               it may total: `ceiling`, else double the PP the item releases
 *               it at, Q130) in its castSpell options, so the cast's Warp?
 *               dialog offers metamagic; the item pays what it releases at, the
 *               wielder the metamagic's PP. Metamagic Conduit.
 *   onRelease(ctx {actor, item, kind, reason, degree, ppSpent, paidBy,
 *               wielded}) → `{ lines }`: awaited AFTER the spend is written,
 *               so a rule's own change to an item stands (Dual Channel's
 *               fumble, Resonant Conduit's daily stamp).
 */
export function registerChargedItemRule(key, spec, moduleId = null) {
  const k = registryKey(key);
  const fields = ["wieldLimit", "cost", "payment", "metamagic", "onRelease"];
  const rule = Object.fromEntries(fields.map((f) => [f, typeof spec?.[f] === "function" ? spec[f] : null]));
  if (!k || !fields.some((f) => rule[f])) { problem(`registerChargedItemRule: "${key}" needs a key and at least one of ${fields.join(", ")}`); return false; }
  registry.chargedItemRules.set(k, Object.freeze({ key: k, ...rule }));
  noteContributor(moduleId);
  return true;
}

export function registeredChargedItemRules() {
  return Array.from(registry.chargedItemRules?.values?.() ?? []);
}

/**
 * A STEP BEFORE A PENDING CAST'S INTERRUPTION SETTLES (3.684.0; Eldritch Arts
 * Block 6, G26, optional). Magical Retribution: "resolved before any
 * potential spell fumbles are rolled" — Graham's Q149: automated in the
 * extra-casting-time window. `step(ctx)` is awaited when damage interrupts a
 * casting held open by extra casting time, before the window settles as a
 * Failure or Fumble, with `{ actor, spellName, dc, criticalSeverity,
 * sourceUuid, sourceName, context }` (the source where the damage path said
 * it: a Strike's attacker, `context` its `{kind, melee, …}`). Answers
 * `{ lines }` or null; the lines go on the interruption's card.
 */
export function registerPendingCastStep(key, step, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof step !== "function") { problem(`registerPendingCastStep: "${key}" needs a key and a step(ctx) function`); return false; }
  registry.pendingCastSteps.set(k, step);
  noteContributor(moduleId);
  return true;
}

export function registeredPendingCastSteps() {
  return Array.from(registry.pendingCastSteps?.entries?.() ?? []).map(([key, step]) => ({ key, step }));
}

/**
 * "WHEN YOU WOULD FALL UNCONSCIOUS" (3.684.0; Eldritch Arts Block 6, G7).
 * Subconscious Casting: "When you would fall unconscious, you may immediately
 * attempt to cast a prepared spell or known spell with a casting time of 1 AP
 * as a 0 AP action". Graham's Q128: damage, lethal or subdual, taking you to
 * 0 HP — not sleep or another condition; a normal cast; "if the spell leaves
 * you above 0 HP you do not fall unconscious or gain Dying". Eternal Vigil
 * ("when reduced to 0 HP, you can cast Touch of Healing on yourself as a free
 * action"; Q109: once a day, not against an outright kill, no Dying, the
 * healing counted from 0) is the same moment.
 *
 * `spec` is `offer` itself, or `{ applies?, offer }`:
 *   - `applies(ctx)` (optional, may be async) → true when this creature could
 *     answer at all (owns the feat, has the Focus use). Only when one says so
 *     does the blow land first: HP is written to 0 before anyone is asked, so
 *     a heal is counted from 0, as the ruling reads.
 *   - `offer(ctx)` is awaited with `{ actor, damageTypes, subdual, hpBefore,
 *     amount, sourceName }` and answers `{ lines }` (HTML, for the card) or
 *     null. The module asks its player and casts (helpers.castSpell); the core
 *     reads HP AGAIN after each offer. Above 0, the creature neither falls nor
 *     gains Dying, no death guard is asked and no later offer is.
 * Not asked against a blow that kills outright (massive damage) or destroys a
 * creature with no Death State, nor while already Dying (already at 0). See
 * combat/zero-hp-moment.mjs and dying-workflow.mjs `applyDamageDirect`.
 *
 * WHERE IT RUNS (3.684.0, G7 — review: the contract did not say). The offer
 * is awaited on THE CLIENT THAT APPLIES THE DAMAGE — `applyDamageDirect`'s
 * caller, which is often the GM's (a monster's Strike, a save's damage
 * button), not the falling creature's player. A dialog opened in `offer`
 * opens on that client. A module that must ask the PLAYER routes the question
 * through the core's reactor-asking helper, `askReactor(actor, { title,
 * content, buttons, step, data })` (reactions/reaction-ask-workflow.mjs;
 * `helpers.askReactor`), with its cast in a step registered by
 * `registerReactionStep` so it runs on the answering client, and awaits it:
 * the core re-reads HP once the offer resolves. `askReactor` answers null
 * when nobody answers in time, which the offer treats as declined.
 */
export function registerUnconsciousOffer(key, spec, moduleId = null) {
  const k = registryKey(key);
  const offer = typeof spec === "function" ? spec : spec?.offer;
  const applies = typeof spec === "function" ? null : spec?.applies;
  if (!k || typeof offer !== "function" || (applies != null && typeof applies !== "function")) {
    problem(`registerUnconsciousOffer: "${key}" needs a key and an offer(ctx) function (and applies, when given, a function)`);
    return false;
  }
  registry.unconsciousOffers.set(k, Object.freeze({ key: k, applies: applies ?? null, offer }));
  noteContributor(moduleId);
  return true;
}

export function registeredUnconsciousOffers() {
  return Array.from(registry.unconsciousOffers?.values?.() ?? []);
}

/**
 * A FEAT'S ELIGIBILITY, WHERE THE PREREQUISITE LINE CANNOT SAY IT (3.684.0;
 * Eldritch Arts Block 6, G9). Arcane Study's "Arcanum Birthright" names no
 * item; High Magic Resonance prints "a Sorcerer with the Wild Birthright
 * cannot take this feat"; Graham's Q100 lets a High Mage's or Birthrager's
 * borrowed birthright count for both. `check(actor)` answers a reason (the
 * actor may not take the feat) or null; it is SYNCHRONOUS, because the
 * picker's filter is. A reason hides the feat in the four feat slots
 * (picker-filters.mjs `withFeatGates`) and refuses its creation on an actor
 * (TRGItem._preCreate, beside the exclusive groups; `options.trgAllowIneligibleFeat`
 * lets a deliberate script through). Two registrations for one feat are both
 * asked. A check that throws is read as no reason: an eligibility nobody can
 * work out never hides a feat.
 */
export function registerFeatEligibility(featName, check, moduleId = null) {
  const k = registryKey(featName);
  if (!k || typeof check !== "function") { problem(`registerFeatEligibility: "${featName}" needs a feat name and a check(actor) function`); return false; }
  const list = registry.featEligibility.get(k) ?? [];
  list.push(check);
  registry.featEligibility.set(k, list);
  noteContributor(moduleId);
  return true;
}

/** Why this actor may not take the feat (the first registered reason), or null. */
export function featEligibilityBlock(featName, actor) {
  const checks = registry.featEligibility?.get?.(registryKey(featName));
  if (!checks?.length) return null;
  for (const check of checks) {
    let reason = null;
    try {
      reason = check(actor);
    } catch (err) {
      console.warn(`TRG Prime | a module's eligibility check for ${featName} failed`, err);
      reason = null;
    }
    const text = typeof reason === "string" ? reason.trim() : "";
    if (text) return text;
  }
  return null;
}

/** The refusal text for an ineligible feat, or null (3.684.0, G9). */
export function featEligibilityRefusal(featName, actor, options = {}) {
  if (options?.trgAllowIneligibleFeat) return null;
  const reason = featEligibilityBlock(featName, actor);
  if (!reason) return null;
  return `${actor?.name ?? "This character"} cannot take ${String(featName).trim()}: ${reason}`;
}

/**
 * EXTRA DAILY USES, DECLARED (3.684.0; Eldritch Arts Block 6, G21). Extra
 * Communion: Verdant Communion "an additional time per day"; Deep Weave:
 * Magical Reservoir +1; Extra Reservoir: +2. `{ ability, perCopy }`, beside
 * extra-uses.mjs's own three (Extra Channels, Extra Mercy, Extra Wildshape),
 * read by the same `extraUsesBonus` the sheet's maximum and the daily top-up
 * both ask: `perCopy` uses for each owned copy of the feat, to the ability
 * item NAMED `ability` (exact, case and space aside). A core feat's name
 * keeps the core's row. A second registration for one feat replaces the first.
 */
export function registerExtraUses(featName, spec = {}, moduleId = null) {
  const k = registryKey(featName);
  const ability = String(spec?.ability ?? "").trim();
  const perCopy = Math.trunc(Number(spec?.perCopy ?? 1));
  if (!k || !ability || !Number.isFinite(perCopy) || perCopy <= 0) {
    problem(`registerExtraUses: "${featName}" needs a feat name, an ability name and a positive whole perCopy`);
    return false;
  }
  registry.extraUses.set(k, Object.freeze({ ability, perCopy }));
  noteContributor(moduleId);
  return true;
}

/** Every registered extra-uses row, as [feat key, { ability, perCopy }]. */
export function registeredExtraUses() {
  return Array.from(registry.extraUses?.entries?.() ?? []);
}

/**
 * A REACTION'S OWN WORK, ON THE REACTOR'S CLIENT (3.681.0, Block 3b). `run(actor,
 * answer, data)` is awaited on whichever client answers an `askReactor`
 * question, and its (plain, serialisable) result travels back to the asker.
 * Registered on every client, at init.
 */
export function registerReactionStep(name, run, moduleId = null) {
  const k = registryKey(name);
  if (!k || typeof run !== "function") { problem(`registerReactionStep: "${name}" needs a name and a run(actor, answer, data) function`); return false; }
  registry.reactionSteps.set(k, run);
  noteContributor(moduleId);
  return true;
}

export function registeredReactionStep(name) {
  return registry.reactionSteps.get(registryKey(name)) ?? null;
}

/** Every registered racial PP entry, as [name, perLevel] (3.680.0). */
export function registeredRacialPPEntries() {
  return Array.from(registry.racialPP?.entries?.() ?? []);
}

/**
 * A WEAPON TRAIT THAT CHANGES THE CATEGORY FOR A CLASS TYPE (3.675.0, C8).
 * `{ categoryAs: "Simple", classTypes: ["Adept"] }`: a weapon carrying the
 * trait is that category for a wielder whose class type is listed. The
 * best category wins when several apply (Simple over Martial over Exotic).
 */
export function registerWeaponTraitRule(trait, spec, moduleId = null) {
  const k = registryKey(trait);
  const categoryAs = String(spec?.categoryAs ?? "").trim();
  const classTypes = (Array.isArray(spec?.classTypes) ? spec.classTypes : []).map(registryKey).filter(Boolean);
  if (!k || !["simple", "martial"].includes(categoryAs.toLowerCase()) || !classTypes.length) {
    problem(`registerWeaponTraitRule: "${trait}" needs categoryAs "Simple" or "Martial" and at least one class type`);
    return false;
  }
  registry.weaponTraitRules.set(k, { trait: k, categoryAs: categoryAs.charAt(0).toUpperCase() + categoryAs.slice(1).toLowerCase(), classTypes });
  noteContributor(moduleId);
  return true;
}

export function registeredWeaponTraitRules() {
  return Array.from(registry.weaponTraitRules.values());
}

/* ------------------------------------------------------------------ */
/* Skill actions, feat automation, class-skill grants                   */
/*                                                                      */
/* These are QUEUED here and PUSHED into the live tables by the         */
/* workflow, because the tables live in files this one must not import. */
/* ------------------------------------------------------------------ */

const SKILL_ACTION_REQUIRED = ["key", "name", "skills", "checkType", "against"];

export function queueSkillActions(actions, moduleId = null) {
  const list = Array.isArray(actions) ? actions : [actions];
  let added = 0;
  for (const action of list) {
    const missing = SKILL_ACTION_REQUIRED.filter((field) => action?.[field] === undefined);
    if (missing.length) { problem(`registerSkillActions: "${action?.name ?? action?.key ?? "?"}" is missing ${missing.join(", ")}`); continue; }
    if (!Array.isArray(action.skills) || !action.skills.length) { problem(`registerSkillActions: "${action.name}" needs a non-empty skills array`); continue; }
    registry.skillActions.push({ ...action });
    added += 1;
  }
  if (added) noteContributor(moduleId);
  return added;
}

export function queuedSkillActions() {
  return registry.skillActions.slice();
}

export function queueFeatAutomation(name, entry, moduleId = null) {
  const key = registryKey(name);
  if (!key || typeof entry?.use !== "function") { problem(`registerFeatAutomation: "${name}" needs a name and a use() function`); return false; }
  registry.featAutomation.set(key, { hint: String(entry.hint ?? ""), use: entry.use, ownsFocusUse: entry.ownsFocusUse === true });
  noteContributor(moduleId);
  return true;
}

export function queuedFeatAutomation() {
  return new Map(registry.featAutomation);
}

export function queuePassiveAutomation(name, hint, moduleId = null) {
  const key = registryKey(name);
  if (!key) { problem("registerPassiveAutomation: a name is required"); return false; }
  registry.passiveAutomation.set(key, String(hint ?? ""));
  noteContributor(moduleId);
  return true;
}

export function queuedPassiveAutomation() {
  return new Map(registry.passiveAutomation);
}

export function queueClassSkillGrant(entry, moduleId = null) {
  if (!entry?.name || !entry?.flag) { problem(`registerClassSkillGrant: an entry needs name and flag (got ${JSON.stringify(entry)})`); return false; }
  registry.classSkillGrants.push({ ...entry });
  noteContributor(moduleId);
  return true;
}

export function queuedClassSkillGrants() {
  return registry.classSkillGrants.slice();
}

/** Module ids that contributed anything, for the startup line. */
export function registryContributors() {
  return Array.from(registry.contributors);
}

/* ------------------------------------------------------------------ */
/* The metamagic family (3.684.0; Eldritch Arts Block 6, G1–G4)         */
/* ------------------------------------------------------------------ */

/**
 * A MODULE'S METAMAGIC (3.684.0; Eldritch Arts Block 6, G1 — the audit's D2,
 * Appendix D's S-M1, S-M3, S-M4 and S-M11; Graham's Q93–Q96, Q126, as
 * proposed). Offered in the cast's Warp? dialog beside the core's table, in
 * the same totals: its PP raise the Casting DC, count against the per-cast
 * cap and are refunded by degree exactly as the core's are. The spec — every
 * key optional but a key:
 *   { feat, label, hint, ppCost, max, choices, focus, kind, scope, preset,
 *     payment, group, required, needsSpell, applies(ctx), effects,
 *     apply(ctx), after(ctx) }
 * `applies` and `apply` are awaited with `{ actor, item, spell, spellData,
 * basePP, casterLevel, tradition, traits, damageTypes, defence, range,
 * duration, area, castAP, attack, rollsCheck, innate, itemCast, cantrip,
 * ritual, reaction, highMagic, targets, times, choice, taken }` (`item` the
 * opening feat, `targets` the tokens targeted, `taken` the other keys chosen
 * — in `apply` only — and `damageTypes` after Elemental Spell in `apply`).
 * `apply` alone also has `castPP` (3.684.1; Graham, 4 November 2026,
 * Wellspring Conduit): the PP the spell is cast at — base (an innate's
 * printed PP), the warps chosen and every metamagic option's PP taken, this
 * one's included, less Economic and Signature Spell; before G4's payment-only
 * discounts (Q93). See magic/cast-pp.mjs `metamagicCastPP`.
 * IT IS NOT THE SETTLED CAST'S `castPP` (3.684.1, review), the one G12's
 * riders read (Q101; magic/cast-pp.mjs `castRiderPP`), and can differ from it:
 *   - `apply(ctx).castPP` COUNTS an option paid other than in PP — a core
 *     option G3 moves to AP, a module option paid in AP (G3, or its own
 *     `payment.kind: "ap"`) or in a resource — at its PP cost; the settled
 *     `castPP` drops them, as its `totalPP` does. Rod-paid options are 0 in
 *     both.
 *   - The settled `castPP` ADDS what is known only after `apply`: the
 *     Component Savant swap's PP and every option's `basePPAdd` (Spellthread).
 *   - Signature Spell's −1 follows from those: `apply` takes it when the warps
 *     or any taken option cost PP (an AP-paid one included); the settled cast
 *     only when the warps or the PP-paid options do.
 * With nothing paid in AP or a resource, no swap queued and no `basePPAdd`,
 * the two are the same number.
 * `apply` (or a static `effects`) answers data — `{ mods, dcDelta, apDelta,
 * discount: {pp, floor}, checkBias, addTraits, addedDamage: [{dice, type}],
 * saveDC: [{value, type, label}], targets: {extra: [{tokenUuid,
 * damageFactor}], share: [{tokenUuid}]}, rangeFactor, durationFactor,
 * areaFactor, dieStep, fumbleBias, resonanceBias, savingStep, basePPAdd,
 * freeWarpPP, lines, note }` — or `{ cancel: true }`. `after` is awaited
 * once the cast has settled, only if taken, with the settled facts (`degree`,
 * `cast`, `check`, `spellHits`, `saveResults`, `ppSpent`, `totalPP`,
 * `refunded`, `metamagic`) and may answer `{ lines }`, posted on a card of
 * their own. See magic/module-metamagic.mjs for every key's meaning.
 * Q94: learned and innate casts; an item cast only when its options carry
 * `itemMetamagic: true` (G6); never a cantrip, scroll, potion or stored
 * spell. Q95: on an innate cast its PP come from the PP pool, not the free
 * innate warp budget, and raise no Casting DC (none is rolled). Q96: a Focus
 * use is spent when the cast pays its PP. Granted by an applied effect's
 * `flags.trg-prime.grantedMetamagic: [key]`, or by a held rod whose
 * `chargedItem.metamagic.kind` is the key (rod-paid: 0 PP, no DC).
 * Preset by `castSpell(actor, spell, { metamagic: { preset: [{ key, choice,
 * times }] } })`. The cast hooks report `metamagic: [keys]`.
 */
export function registerMetamagic(key, spec, moduleId = null) {
  const normalised = normaliseMetamagicSpec(key, spec);
  if (normalised.problem) { problem(normalised.problem); return false; }
  registry.metamagic.set(normalised.spec.key, normalised.spec);
  noteContributor(moduleId);
  return true;
}

export function registeredMetamagic() {
  return Array.from(registry.metamagic?.values?.() ?? []);
}

/**
 * ANOTHER WAY TO PAY A CAST'S PP (3.684.0; Eldritch Arts Block 6, G2 — the
 * rod draw generalised, Appendix A's S-8; Bloodmage's "Bleed in place of
 * PP"). `offer(ctx)` is awaited before the PP-availability test with `{
 * actor, spell, spellData, basePP, totalPP, payable, ppPool, tradition,
 * highMagic, metamagic }` and answers `{ label, hint, max }` or null; the
 * caster is asked how much to draw (0 … max), and what is drawn counts in the
 * availability test. Once the degree is known the PP are split as the rod's
 * are — each source pays what was drawn from it, up to what the degree
 * spends, the rod first, then the sources in registration order, then the
 * caster — so a Partial's smaller spend substitutes less. `settle(ctx, {
 * drawn, paid })` is awaited once the cast is over (a refunded cast settles
 * paid 0) with `{ actor, spell, degree, cast, refunded, totalPP, ppSpent }`
 * and may answer `{ lines }`. The cap and the DC are unchanged (`totalPP`).
 * Not asked of an innate, item, stored, threaded or cantrip cast, nor a
 * ritual variant (no PP is paid). `trgPrimeSpellSettled.ppSources` says what
 * each paid.
 */
export function registerCastPPSource(key, spec, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof spec?.offer !== "function" || (spec.settle !== undefined && typeof spec.settle !== "function")) {
    problem(`registerCastPPSource: "${key}" needs a key, an offer(ctx) function and, if given, a settle(ctx, paid) function`); return false;
  }
  registry.castPPSources.set(k, Object.freeze({ key: k, offer: spec.offer, settle: spec.settle ?? null }));
  noteContributor(moduleId);
  return true;
}

export function registeredCastPPSources() {
  return Array.from(registry.castPPSources?.values?.() ?? []);
}

/**
 * A METAMAGIC OPTION PAID IN AP (3.684.0; Eldritch Arts Block 6, G3 —
 * Appendix D's S-M2, Appendix F's n7; Metamagic Adept: "by expending an
 * additional AP instead of increasing PP cost … the DC to cast the spell is
 * still increased … (as if the additional PP had been expended)"). The spec:
 *   { label, options: [core ids ("extend", "reach", "silent", "still") or
 *     module keys], ap: 1, dcAsIfPP: true, max: 1, applies(ctx) }
 * `applies(ctx)` is awaited when the Warp? dialog is built, with `{ actor,
 * spell, spellData, basePP, castAP, innate, itemCast, inCombat }`, and
 * answers true to put a "pay in AP instead" tick on each named option the
 * cast offers. A ticked option's PP are then not paid, not capped and not in
 * the save DC, while (with `dcAsIfPP`) the Casting DC counts them; its AP
 * join the cast's. `max` options a cast may pay that way.
 */
export function registerMetamagicPayment(key, spec, moduleId = null) {
  const k = registryKey(key);
  const options = Array.isArray(spec?.options) ? spec.options.map((o) => String(o ?? "").trim()).filter(Boolean) : [];
  if (!k || !options.length || (spec.applies !== undefined && typeof spec.applies !== "function")) {
    problem(`registerMetamagicPayment: "${key}" needs a key, a non-empty options list and, if given, an applies(ctx) function`); return false;
  }
  registry.metamagicPayments.set(k, Object.freeze({
    key: k, label: String(spec.label ?? key).trim() || k, options: Object.freeze(options),
    ap: Math.max(1, Math.trunc(Number(spec.ap ?? 1)) || 1), dcAsIfPP: spec.dcAsIfPP !== false,
    max: Math.max(1, Math.trunc(Number(spec.max ?? 1)) || 1), applies: spec.applies ?? null
  }));
  noteContributor(moduleId);
  return true;
}

export function registeredMetamagicPayments() {
  return Array.from(registry.metamagicPayments?.values?.() ?? []);
}

/**
 * PP OFF WHAT A CAST PAYS (3.684.0; Eldritch Arts Block 6, G4 — D5's
 * discount half; Graham's Q93: "Payment only. The DC, the cap and the save
 * DC read the PP as cast."). `modify(ctx)` is awaited after the Warp? dialog
 * and before the PP-availability test, with `{ actor, spell, spellData,
 * innate, cantrip, itemCast, basePP, totalPP, highMagic, metamagic }`, and
 * answers `{ ppDelta, floor, label, lines }` or null: a negative `ppDelta`
 * lowers the PP paid, never below `floor` (default 1) and never raising a
 * price already below it. Discounts are taken strictest floor first. The
 * degree then splits the discounted price (the reduction off the warp first).
 * Hex Mastery (−1, min 1), Stormcaller's Storm Bolt (−1). Not asked of an
 * item cast, a stored spell's storage or release, or a threaded cast.
 */
export function registerCastCostModifier(key, modify, moduleId = null) {
  const k = registryKey(key);
  if (!k || typeof modify !== "function") { problem(`registerCastCostModifier: "${key}" needs a key and a modify(ctx) function`); return false; }
  registry.castCostModifiers.set(k, modify);
  noteContributor(moduleId);
  return true;
}

export function registeredCastCostModifiers() {
  return Array.from(registry.castCostModifiers?.entries?.() ?? []).map(([key, modify]) => ({ key, modify }));
}
