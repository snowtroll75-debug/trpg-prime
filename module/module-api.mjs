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
    /** Automation key → { hint, use } for a wondrous item's `use` ability (3.626.0). */
    itemAutomation: new Map(),
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
 */
export function registerArchetype(name, spec = {}, moduleId = null) {
  const key = registryKey(name);
  if (!key) { problem("registerArchetype: a name is required"); return false; }
  registry.archetypes.set(key, {
    name: String(name).trim(),
    classGrants: Array.isArray(spec.classGrants) ? spec.classGrants.map((c) => String(c).trim()).filter(Boolean) : [],
    tierGrants: Array.isArray(spec.tierGrants) ? spec.tierGrants.map((t) => String(t).trim()).filter(Boolean) : []
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
 * @param {"race"|"class"} kind
 * @param {string} ownerName The race or class name.
 * @param {string[]} featNames
 */
export function registerFeatAccess(kind, ownerName, featNames, moduleId = null) {
  const k = String(kind ?? "").trim().toLowerCase();
  const owner = registryKey(ownerName);
  const names = (Array.isArray(featNames) ? featNames : [featNames]).map(registryKey).filter(Boolean);
  if (!["race", "class"].includes(k) || !owner || !names.length) {
    problem(`registerFeatAccess: needs kind "race" or "class", an owner and at least one feat name (got ${JSON.stringify({ kind, ownerName })})`);
    return false;
  }
  const id = `${k}:${owner}`;
  const set = registry.featAccess.get(id) ?? new Set();
  for (const n of names) set.add(n);
  registry.featAccess.set(id, set);
  noteContributor(moduleId);
  return true;
}

/**
 * Is this feat opened to any of these owners by a registration? Owners
 * are a comma-joined list the way the picker carries effective races and
 * classes ("Bard, Fighter").
 */
export function hasRegisteredFeatAccess(kind, owners, featName) {
  const k = String(kind ?? "").trim().toLowerCase();
  const feat = registryKey(featName);
  if (!feat) return false;
  return String(owners ?? "").split(",").map(registryKey).filter(Boolean)
    .some((owner) => registry.featAccess.get(`${k}:${owner}`)?.has(feat));
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
 * @param {Array<{match: {name?: string, traits?: string[], tradition?: string, innate?: boolean}, warp: {ppCost: number, text: string, mods: object, max?: number}}>} entries
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
      innate: e.match.innate === undefined ? null : Boolean(e.match.innate)
    },
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
      moduleId: moduleId ? String(moduleId) : ""
    });
    count += 1;
  }
  if (count) noteContributor(moduleId);
  return count;
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
  registry.featAutomation.set(key, { hint: String(entry.hint ?? ""), use: entry.use });
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
