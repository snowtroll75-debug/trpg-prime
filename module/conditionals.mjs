/**
 * Conditional modifiers and advantage sources.
 *
 * The system already had two of the three ways a rulebook grants a
 * bonus. A flat, always-on number goes into the typed bonus pools
 * (bonuses/registry.mjs). A one-off number handed out mid-play by a
 * Skill Action outcome goes into pending-modifiers.mjs and waits in the
 * roll dialog for the roll it was scoped to.
 *
 * The third kind had nowhere to live: a bonus that is PERMANENT but
 * SCOPED. "Dwarves receive a +2 racial bonus on saving throws against
 * poison and magic." "You suffer a -4 racial penalty to all swim
 * checks." "You gain advantage on all Subsist (Survival) checks."
 * "Advantage to all Stealth checks made whilst in forested terrain."
 * None of these can go in a pool — a pool entry would apply the Dwarf's
 * +2 to every save against everything, forever. And none of them can go
 * in pending-modifiers, because nothing hands them out; the character
 * simply has them, at every table, for the whole campaign.
 *
 * Chapter 2 is thick with them — roughly a third of all racial and
 * heritage abilities are scoped this way — which is why they finally got
 * a mechanism rather than another sentence of italic text saying "select
 * Advantage in the roll dialog".
 *
 * An item (or an effect, for the ones a player chooses at Use time)
 * declares them in `flags["trg-prime"].conditionals`. When a check is
 * rolled, every conditional whose scope could apply to THAT check is
 * offered in the dialog as a tickbox, next to the granted modifiers that
 * already appear there. Ones whose scope is fully settled by the check's
 * own identity — Lead Boots knows a Swim check when it sees one — arrive
 * pre-ticked. Ones that still need a person's judgement — is this forest
 * terrain, is that poison — arrive unticked with the rulebook's own
 * wording next to them.
 *
 * That split is the whole design. The system knows the number, the type,
 * the source and the wording; the only thing it genuinely cannot know is
 * whether the fiction of this particular roll falls inside the scope, so
 * that is the only thing it asks.
 *
 * Pure logic, no Foundry API: collectConditionals takes plain arrays of
 * items and effects so the matching can be asserted without a browser.
 */

import { wornAndStanding } from "./item-quality.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * What a conditional does when it applies.
 *
 * ADVANTAGE and DISADVANTAGE feed the roll's bias (and cancel each other
 * exactly as two manually-chosen biases do). MODIFIER carries a signed
 * number and a bonus type, and joins the check's modifier list where the
 * normal stacking rules apply to it.
 */
export const CONDITIONAL_KINDS = Object.freeze({
  ADVANTAGE: "advantage",
  DISADVANTAGE: "disadvantage",
  MODIFIER: "modifier"
});

const KIND_VALUES = Object.freeze(Object.values(CONDITIONAL_KINDS));

/**
 * The axes a conditional's scope can be narrowed along. Each is an
 * any-of list; a declared axis must match, an undeclared one is ignored.
 *
 * - checkTypes: "skill", "save", "specialist", "attribute", "attack",
 *   "cast", "spellcraft", "initiative", "flat", "damage".
 * - subjects: the key WITHIN that type — a skill key ("survival"), a
 *   save key ("will"), an attribute key ("strength"), a specialist slug.
 * - actions: the Skill/Basic Action key a check was invoked from
 *   ("subsist", "senseMagic"), for scopes that name an action rather
 *   than the whole skill. This is the difference between the Ascendan's
 *   "+1 to all attempts to sense magic" and a blanket Power
 *   Manipulation bonus.
 * - traits: the traits of whatever PROVOKED the check — an affliction's
 *   Poison, a spell's Sleep. This is the axis that turns the Dwarf's
 *   "+2 against poison" from a question into an answer, because the
 *   affliction carrying the save already knows it is a poison. Where
 *   this axis matches, an entry can honestly be `auto`.
 * - traditions: the MAGICAL TRADITION of whatever provoked the check —
 *   arcane, divinity, ethereal, verdant. A separate axis from `traits`
 *   for the reason 3.315.0 spent a release learning: a tradition and a
 *   trait are different objects, and folding one into the other is how
 *   the wrong field ends up holding the right answer until the day it
 *   doesn't. The Ascendan's "-2 to saving throws against these
 *   traditions" is the first user; the spell workflow knows the casting
 *   tradition at the moment it rolls a target's save, so where this axis
 *   matches, an entry can honestly be `auto`.
 * - sourceTypes: the CREATURE TYPE of whoever provoked the check — the
 *   undead swinging the sword, the dragon breathing on you. A third
 *   "what provoked this" axis beside traits and traditions, and separate
 *   from both for the same reason they are separate from each other: a
 *   creature type is not a trait of the effect, it is a fact about the
 *   attacker, and the three answer different questions.
 *
 *   THE RULE THAT NEEDED IT, Chapter 2's Thengar: "+1 racial bonus to
 *   your DB and Saving Throws against the attacks of creatures of the
 *   Undead Type." Authored without this axis it could only be a manual
 *   tick offered on every save a Dwarf ever made, with the wording left
 *   to the player to judge — which is where it sat from the Chapter 2
 *   audit on 3.318.1 until 3.321.0.
 *
 *   NOTE WHAT THIS AXIS IS NOT. It is the attacker's type, never the
 *   defender's own — a Dwarf does not get Thengar's bonus for being
 *   undead. The context is filled by whichever workflow holds BOTH
 *   actors, which is why the attack and creature-attack paths supply it
 *   and a sheet roll cannot.
 *
 * - targetTypes: THE MIRROR OF THAT ONE (3.567.0). Where `sourceTypes`
 *   asks "what kind of thing is doing this TO me", this asks "what kind
 *   of thing am I doing it TO". Chapter 5's Dracoris is the first user:
 *   "+1 racial bonus to all interactions with creatures of the Wyrm
 *   type" — a bonus carried by the Dracoris, applying to the SOCIAL
 *   SKILL CHECKS it makes against a Wyrm, which is a fact about the
 *   subject of the check and not about anything that provoked it.
 *
 *   IT IS NOT sourceTypes READ BACKWARDS AND IT IS NOT targetUuids
 *   WIDENED, and the pairing matrix is the clearest way to see why. The
 *   two questions ("who provokes" / "who is aimed at") cross the two
 *   granularities ("a whole category" / "that one creature") to give
 *   four axes, and three of them existed before this release. A rule
 *   about a CATEGORY the roll is AIMED AT had nowhere to go: authored on
 *   `sourceTypes` it would have fired when a Wyrm attacked the Dracoris,
 *   which is the opposite situation and the wrong answer, quietly.
 *
 *   FILLED FROM THE SAME PLACE AS ITS MIRROR — `creatureTypesOf` on the
 *   TARGET's system rather than the actor's — by whichever workflow
 *   holds both actors. A check aimed at nobody leaves it blank, and a
 *   target-typed entry then correctly matches nothing.
 *
 * - sourceUuids: ONE NAMED CREATURE, by uuid — not a type, not a trait,
 *   but that dragon over there and no other. Added at 3.406.0.
 *
 *   THE DIFFERENCE FROM sourceTypes IS THE WHOLE POINT, and it is the
 *   difference between a racial rule and a spell. Thengar's "+1 against
 *   the attacks of creatures of the Undead Type" is permanent, applies to
 *   a whole category, and is authored once into a heritage. Forbidding
 *   Ward's "+1 status bonus to DB and saving throws against the TARGET
 *   ENEMY'S attacks, spells, and other effects" is temporary, applies to
 *   exactly one creature chosen at cast time, and cannot be authored in
 *   advance at all — the uuid does not exist until somebody points at it.
 *
 *   WHY A UUID RATHER THAN A NAME. The Improved Combat Reflexes lesson:
 *   the code matched a string, the pack held a different one, and both
 *   the code and its test agreed with each other. Two ogres in a room are
 *   both called "Ogre"; warding against one must not ward against the
 *   other, and a name match cannot tell them apart. A uuid can.
 *
 *   MEASURED BEFORE IT WAS BUILT. A first search found ONE rule wanting
 *   this and it would not have been worth an axis. Widening the pattern —
 *   because a negative result deserves more suspicion than a positive one
 *   — found five: Forbidding Ward, Anticipations and Stone Shield scope a
 *   DEFENCE by its attacker; Guiding Bolt and Unwelcome Halo scope an
 *   ATTACK by its target, which is the mirror axis, built at 3.415.0.
 *
 * - targetUuids: THE MIRROR (3.415.0). Where `sourceUuids` asks "who is
 *   doing this TO me", this asks "who am I doing it TO". Enchanting
 *   Utterance's success rung is the first: "the target suffers a -1
 *   circumstance penalty to attack rolls and a -1 penalty to damage rolls
 *   AGAINST YOU" — a penalty carried by the enemy, applying only while
 *   they are swinging at the caster and at nobody else.
 *
 *   ─────────────────────────────────────────────────────────────────
 *   AND BUILDING IT FOUND `sourceUuids` DEAD.
 *
 *   That axis shipped at 3.406.0 and `matchesCheck` has read it ever
 *   since. NOTHING HAS EVER SUPPLIED IT. Neither context object — the
 *   automatic path in dice/check.mjs nor the dialog in
 *   apps/check-dialog.mjs — passed `sourceUuid` at all, so
 *   `wantedSourceUuids.some(...)` tested against an empty list, returned
 *   false, and every uuid-scoped conditional matched nothing, silently,
 *   for the whole of its life.
 *
 *   THE HALF THAT WORKED HID THE HALF THAT DID NOT. A ward writes two
 *   flags for one sentence: DB down the `defence-dc.mjs` channel, saves
 *   down this one. `attack-workflow.mjs` hands `defenceDCBonus` the
 *   attacker's uuid, so the DB half was correct and visible in play —
 *   which is exactly why nobody noticed that Forbidding Ward's "+1 to
 *   saving throws against that enemy" had never once applied.
 *
 *   `ward.mjs` exists to stop those two halves diverging, and its harness
 *   checks that they AGREE — same value, same scope, same label. It never
 *   checked that either half REACHES A ROLL. Agreement between two things
 *   is not delivery of either.
 *
 *   `verify-conditionals` now refuses an axis no call site fills — the
 *   check that would have caught this the day the axis landed.
 */
/**
 * EXPORTED so a harness can ask the question that was never asked: is
 * every axis on this list actually SUPPLIED by the call sites that build
 * a check's context? An axis nothing fills is read on every roll and
 * matches on none.
 */
export const SCOPE_AXES = Object.freeze([
  "checkTypes", "subjects", "actions", "traits", "traditions", "sourceTypes",
  "targetTypes", "sourceUuids", "targetUuids"
]);

/**
 * The key a CONTEXT uses for each scope axis.
 *
 * The two vocabularies are deliberately different and that is half the
 * reason the dead axis was invisible: an entry is authored with a PLURAL
 * (`when: { sourceUuids: [...] }`, a list of creatures it covers) while a
 * context carries the SINGULAR fact of one roll (`sourceUuid`, the one
 * creature that provoked it). Written down here so a check can hold the
 * two ends against each other instead of a reader having to notice.
 */
export const AXIS_CONTEXT_KEYS = Object.freeze({
  checkTypes: "checkType",
  subjects: "subject",
  actions: "actionKey",
  traits: "traits",
  traditions: "traditions",
  sourceTypes: "sourceTypes",
  targetTypes: "targetTypes",
  sourceUuids: "sourceUuid",
  targetUuids: "targetUuid"
});

/**
 * @param {*} value
 * @param {boolean} [lower] false for uuids, which are case-sensitive.
 */
function cleanList(value, lower = true) {
  if (value === undefined || value === null) return null;
  const list = (Array.isArray(value) ? value : [value])
    .map((entry) => {
      const text = String(entry ?? "").trim();
      return lower ? text.toLowerCase() : text;
    })
    .filter(Boolean);
  return list.length ? list : null;
}

/** Axes whose values are case-SENSITIVE. A Foundry uuid is one. */
const CASE_SENSITIVE_AXES = Object.freeze(["sourceUuids", "targetUuids"]);

/**
 * Validates and normalises one authored conditional.
 *
 * Returns null rather than throwing for anything malformed: a typo in
 * one race's JSON should cost that one entry, not every roll the actor
 * makes. The harness (tools/verify-races.mjs) is what makes a dropped
 * entry loud at build time, which is the right place for it to be loud.
 *
 * @param {object} raw The authored entry.
 * @param {object} source {id, name, kind} of the item or effect it came from.
 * @param {number} index Position within that source, for a stable id.
 * @returns {object|null}
 */
/**
 * The figures a SCALED modifier may read (3.564.0). A conditional may say
 * `valueFrom: "classBonus"` instead of `value: 2` — Pillars of Faith's
 * Inquisition adds "your class bonus" to investigation checks, and a
 * number baked in at Use time went stale at every level (Graham: "remove
 * that step, players will forget"). The two call sites that collect
 * conditionals hand over the actor's current figures; a `valueFrom` the
 * scaling does not know is dropped like any other malformed entry.
 */
const ABILITY_KEYS = Object.freeze(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);
const SCALING_KEYS = Object.freeze(["classBonus", "level", "halfLevel", ...ABILITY_KEYS]);

/**
 * The scaling figures for an actor, in the shape collectConditionals takes.
 *
 * THE SIX ABILITY MODIFIERS JOIN THEM (3.625.0), and `valueFrom` may name
 * a DIFFERENCE of two figures — `"intelligence-wisdom"` — for a rule that
 * swaps the ability a check is made with: Pillars of Faith's Scholarly
 * Exegesis, "you may use Intelligence in place of the ability score
 * normally associated with [an academic Religion] check". A swap is a
 * modifier of (new − usual), offered on the checks it names, which is
 * what the dialog already knows how to show. A difference of zero is a
 * no-op row and is dropped like any other zero.
 */
export function scalingFor(actor) {
  const level = Math.max(0, Math.floor(Number(actor?.system?.identity?.level ?? 0) || 0));
  const out = {
    classBonus: Math.max(0, Math.floor(Number(actor?.system?.identity?.classBonus ?? 0) || 0)),
    level,
    halfLevel: Math.floor(level / 2)
  };
  for (const key of ABILITY_KEYS) out[key] = Math.trunc(Number(actor?.system?.attributes?.[key]?.total ?? 0) || 0);
  return out;
}

/** The figure a `valueFrom` names — one key, or "a-b" for a difference; null when unknown. */
function scaledValue(from, scaling = {}) {
  const text = String(from ?? "").trim();
  const m = /^([a-zA-Z]+)-([a-zA-Z]+)$/.exec(text);
  if (m) {
    if (!SCALING_KEYS.includes(m[1]) || !SCALING_KEYS.includes(m[2])) return null;
    const a = Number(scaling?.[m[1]]), b = Number(scaling?.[m[2]]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.trunc(a) - Math.trunc(b);
  }
  if (!SCALING_KEYS.includes(text) || !Number.isFinite(Number(scaling?.[text]))) return null;
  return Math.trunc(Number(scaling[text]));
}

export function normaliseConditional(raw, source = {}, index = 0, scaling = {}) {
  if (!raw || typeof raw !== "object") return null;

  const kind = String(raw.kind ?? "").trim().toLowerCase();
  if (!KIND_VALUES.includes(kind)) return null;

  const when = raw.when && typeof raw.when === "object" ? raw.when : {};
  const scope = {};
  for (const axis of SCOPE_AXES) {
    const list = cleanList(when[axis], !CASE_SENSITIVE_AXES.includes(axis));
    if (list) scope[axis] = list;
  }

  // Exclusions, so a broad entry and a precise one can coexist without
  // both being offered for the same roll. Lead Boots is the shape:
  // "-4 to all swim checks" is exact when the Swim ACTION is used
  // (pre-ticked), and a judgement call on a bare Athletics roll
  // (offered, unticked) — but the bare-Athletics row must not also
  // appear alongside the exact one, or the penalty could be taken twice.
  const notWhen = when.not && typeof when.not === "object" ? when.not : {};
  const exclude = {};
  for (const axis of SCOPE_AXES) {
    const list = cleanList(notWhen[axis], !CASE_SENSITIVE_AXES.includes(axis));
    if (list) exclude[axis] = list;
  }

  // An entry with no axes at all would be offered on every roll the
  // character ever makes, which is noise rather than automation. `always`
  // is the deliberate opt-in for the rare genuinely-universal case, so
  // that breadth is always something someone chose to write.
  // READ BACK AS WELL AS AUTHORED (3.609.1, the 3.609.0 live test's F6).
  // A spell writes the entry it normalised onto its effect, where `always`
  // has moved out of `when` to the top; read again from the effect, the
  // flag was missed and the entry dropped as scopeless — Twisted Fate's
  // "disadvantage on all checks", the pack's only universal grant, applied
  // to nothing.
  const always = Boolean(when.always || raw.always === true);
  if (!always && !Object.keys(scope).length) return null;

  const entry = {
    id: String(raw.id ?? `${source.id ?? "src"}-${index}`),
    kind,
    label: String(raw.label ?? source.name ?? "Feature"),
    scope: String(raw.scope ?? ""),
    always,
    when: scope,
    not: exclude,
    // Pre-ticked when the check's own identity settles the whole scope.
    // Authors set this; it is not inferred, because "does the wording
    // add a condition the dice can't see" is a reading decision.
    auto: Boolean(raw.auto),
    // Spent when it is used (3.587.0). "Advantage on the NEXT mental
    // saving throw made within the duration" has two bounds, not one:
    // the duration, which the effect carrying it already tracks, and
    // the single use, which nothing tracked. Clarity shipped at
    // 3.586.0 with a card line asking the player to dismiss it by hand
    // — an instruction is not automation.
    oneShot: Boolean(raw.oneShot),
    source: String(source.name ?? ""),
    sourceId: String(source.id ?? ""),
    sourceKind: String(source.kind ?? "item")
  };

  if (kind === CONDITIONAL_KINDS.MODIFIER) {
    let value = Math.trunc(Number(raw.value));
    const from = String(raw.valueFrom ?? "").trim();
    if (from) {
      const scaled = scaledValue(from, scaling);
      if (scaled === null) return null;
      value = scaled * (Number(raw.sign) === -1 ? -1 : 1);
    }
    // A modifier of zero is a no-op that would still occupy a row in the
    // dialog, so it is treated as malformed rather than shown.
    if (!Number.isFinite(value) || value === 0) return null;
    entry.value = value;
    entry.type = String(raw.type ?? "circumstance").trim().toLowerCase() || "circumstance";
    // "RACIAL" IS THE BOOK'S WORD FOR "race" (3.627.1). BONUS_TYPES keys it
    // `race`; a conditional written `racial` was shown and stacked as
    // Untyped. Pillars of Faith typed 27 feats that way before 0.9.1, and a feat
    // already on a sheet is a copy that a module fix cannot reach — so the
    // word is read here, where every copy passes.
    if (entry.type === "racial") entry.type = "race";
  }

  return entry;
}

/**
 * Every conditional an actor carries, from both of the places one can be
 * declared.
 *
 * Items are the authored home: a race, heritage, feat or ability ships
 * its conditionals in pack JSON. Effects are the home for the ones a
 * player CHOOSES — the Tribal human picks Arcana, Nature, Occultism or
 * Religion, and the choice-effect created at Use time carries a
 * conditional naming the skill actually chosen. Both are read here so
 * neither needs a special case downstream.
 *
 * @param {Array<{id, name, flags}>} items
 * @param {Array<{id, name, flags, disabled}>} effects Transferred
 *   effects — always read via `actor.appliedEffects ?? actor.effects`,
 *   since V12+ keeps transferred effects on the item, not the actor.
 * @returns {object[]} Normalised entries.
 */
/** Item types whose conditionals need the item worn or held. */
const EQUIPMENT_TYPES = Object.freeze(["armour", "shield", "weapon", "gear"]);

/**
 * Is this item's conditional in force? Equipment must be worn or held
 * and standing (see item-quality.mjs `wornAndStanding`); anything else
 * — a feat, an ability, a race — simply is.
 * @param {object} item
 * @returns {boolean}
 */
function equipmentInUse(item) {
  if (!EQUIPMENT_TYPES.includes(String(item?.type ?? ""))) return true;
  return wornAndStanding(item);
}

export function collectConditionals(items = [], effects = [], declared = [], scaling = {}) {
  const found = [];

  // RUNES DECLARE THEIRS AT RUN TIME. Every other conditional is
  // authored into an item's flags, but a rune is chosen at the table —
  // it is derived data, not source — so the actor publishes its rune
  // conditionals and they are passed in here. Same normalisation, same
  // matching, same dialog; only the provenance differs.
  for (const [index, raw] of (declared ?? []).entries()) {
    const entry = normaliseConditional(
      raw, { id: `rune-${index}`, name: raw?.label ?? "Rune", kind: "rune" }, index, scaling);
    if (entry) found.push(entry);
  }

  const harvest = (documents, kind) => {
    for (const document of documents ?? []) {
      if (kind === "effect" && document?.disabled) continue;
      // EQUIPMENT COUNTS ONLY WHILE WORN OR HELD (3.607.0). Pillars of
      // Faith's Chapter 6 is the first to put a conditional on armour, a
      // shield, a weapon or a kit ("+1 item bonus to Fortitude saves
      // against airborne disease while all of its protective components
      // are worn"); a coat in the pack protects nobody, and a destroyed
      // one protects nobody either. Same gate the armour descriptions and
      // the Goods conditionals already use. No core equipment carries a
      // conditional (measured 29 Sep 2026), so nothing shipped changes.
      if (kind === "item" && !equipmentInUse(document)) continue;
      const declared = document?.flags?.[SYSTEM_ID]?.conditionals;
      if (!Array.isArray(declared)) continue;
      /*
       * AN EFFECT AN ITEM OWNS IS NOT AN EFFECT THE ACTOR HAS (3.587.0).
       *
       * `appliedEffects` mixes two things: effects placed directly on
       * the actor, and effects TRANSFERRED from its items. They look
       * identical here and behave differently everywhere that matters —
       * measured in Graham's world on 24 September 2026:
       * `actor.effects.get(id)` finds every direct one and NOT ONE of
       * the transferred ones (Borin's "Dwarf: ability modifiers",
       * Garran's "Bonus Feat", and so on, all missing).
       *
       * That matters for `oneShot`. Spending a direct effect deletes
       * something a spell placed. "Spending" a transferred one would
       * either do nothing at all — the lookup returns undefined and the
       * spell is never consumed — or, if it were made to work, delete a
       * racial feature's effect off the item for good. So the two are
       * labelled apart and `spentConditionalSources` spends only the
       * first, which is the same reason items are never spent.
       */
      const owned = kind === "effect" && document?.parent?.documentName === "Item";
      const source = { id: document.id, name: document.name, kind: owned ? "itemEffect" : kind };
      declared.forEach((raw, index) => {
        const entry = normaliseConditional(raw, source, index, scaling);
        if (entry) found.push(entry);
      });
    }
  };

  harvest(items, "item");
  harvest(effects, "effect");

  return found;
}

/**
 * Does this conditional's scope reach the check being rolled?
 *
 * Every declared axis must match; undeclared axes are ignored. So an
 * entry naming only `checkTypes: ["save"]` reaches every save, and one
 * naming `checkTypes: ["skill"], subjects: ["survival"]` reaches only
 * Survival — and one naming `actions: ["subsist"]` reaches only the
 * Subsist action however it was invoked.
 *
 * @param {object} entry A normalised conditional.
 * @param {object} context {checkType, subject, actionKey}
 * @returns {boolean}
 */
export function matchesCheck(entry, context = {}) {
  if (!entry) return false;

  const checkType = String(context.checkType ?? "").trim().toLowerCase();
  const subject = String(context.subject ?? "").trim().toLowerCase();
  const actionKey = String(context.actionKey ?? "").trim().toLowerCase();
  // Traits arrive as either a comma-separated string (straight off an
  // item's `system.traits`) or an array, so both are accepted.
  const traits = (Array.isArray(context.traits)
    ? context.traits
    : String(context.traits ?? "").split(/[,;]/)
  )
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter(Boolean);
  // Same two shapes as traits — a spell's `system.tradition` is the
  // comma-separated string "arcane, divinity", and a caller that has
  // already split it may hand over an array.
  const traditions = (Array.isArray(context.traditions)
    ? context.traditions
    : String(context.traditions ?? "").split(/[,;]/)
  )
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter(Boolean);
  // The attacker's creature type. Same two shapes again — a creature may
  // legitimately hold more than one type, and a caller that has already
  // resolved them hands over the array.
  const sourceTypes = (Array.isArray(context.sourceTypes)
    ? context.sourceTypes
    : String(context.sourceTypes ?? "").split(/[,;]/)
  )
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter(Boolean);
  // THE TYPE OF WHOEVER THIS ROLL IS AIMED AT (3.567.0) — read exactly
  // like sourceTypes above, and blank on any roll with no target, at
  // which point a target-typed entry matches nothing rather than
  // assuming the player meant the nearest Wyrm.
  const targetTypes = (Array.isArray(context.targetTypes)
    ? context.targetTypes
    : String(context.targetTypes ?? "").split(/[,;]/)
  )
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter(Boolean);
  // THE SPECIFIC ATTACKER, by uuid. NOT lower-cased with the rest of
  // them: a Foundry uuid is case-sensitive ("Scene.AbC..."), and folding
  // its case is how a ward would silently protect against nobody. The
  // authored side is normalised the same way — see cleanList's uuid
  // exemption — so both ends still agree.
  const sourceUuids = (Array.isArray(context.sourceUuid ?? context.sourceUuids)
    ? (context.sourceUuid ?? context.sourceUuids)
    : String(context.sourceUuid ?? context.sourceUuids ?? "").split(/[,;]/)
  )
    .map((t) => String(t ?? "").trim())
    .filter(Boolean);
  // THE SPECIFIC CREATURE THIS ROLL IS AIMED AT (3.415.0) — the mirror of
  // the line above, read the same way and case-sensitive for the same
  // reason. Blank on any roll that is not aimed at anybody, at which
  // point a target-scoped entry correctly matches nothing rather than
  // guessing which enemy the player meant.
  const targetUuids = (Array.isArray(context.targetUuid ?? context.targetUuids)
    ? (context.targetUuid ?? context.targetUuids)
    : String(context.targetUuid ?? context.targetUuids ?? "").split(/[,;]/)
  )
    .map((t) => String(t ?? "").trim())
    .filter(Boolean);

  // Exclusions are tested first and apply even to an `always` entry —
  // "everywhere except X" is a shape worth being able to write.
  //
  // "*" MEANS "WHENEVER THIS AXIS IS KNOWN AT ALL" (3.321.0). Several
  // rules want a manual catch-all that stands down the moment the roll
  // can answer for itself — Hardy's does it by listing all four
  // traditions, which works because there are four and the set is closed.
  // Thengar cannot: there are twelve creature types, and a Dwarf saving
  // against a DRAGON should not be offered a tick for undead. Knowing the
  // attacker is a dragon settles the question just as firmly as knowing
  // it is undead; only an UNATTRIBUTED save is genuinely a question.
  //
  // So a wildcard says that directly, for any axis, rather than making
  // every author enumerate a list that will grow without them.
  const excluded = entry.not ?? {};
  const excludes = (list, values) =>
    Boolean(list) && (list.includes("*") ? values.length > 0 : list.some((v) => values.includes(v)));
  if (excludes(excluded.checkTypes, checkType ? [checkType] : [])) return false;
  if (excludes(excluded.subjects, subject ? [subject] : [])) return false;
  if (excludes(excluded.actions, actionKey ? [actionKey] : [])) return false;
  if (excludes(excluded.traits, traits)) return false;
  // NOT-TRADITIONS IS ALSO THE "…AND WE KNOW WHICH" TEST. A spell-driven
  // save always declares its tradition; a bare sheet roll never does. So
  // an entry excluding every tradition is excluded exactly when the
  // source IS known — which is how the manual fallback below stops
  // being offered alongside the exact row. Same shape as Lead Boots'
  // bare-Athletics row standing down when the Swim action is used.
  if (excludes(excluded.traditions, traditions)) return false;
  // …and the same "we know which" test for the attacker's type, so a
  // manual catch-all can stand down the moment the roll can answer for
  // itself — which for this axis means using the wildcard above.
  if (excludes(excluded.sourceTypes, sourceTypes)) return false;
  if (excludes(excluded.targetTypes, targetTypes)) return false;
  if (excludes(excluded.sourceUuids, sourceUuids)) return false;
  if (excludes(excluded.targetUuids, targetUuids)) return false;

  if (entry.always) return true;

  const {
    checkTypes, subjects, actions,
    traits: wanted, traditions: wantedTraditions, sourceTypes: wantedSourceTypes,
    targetTypes: wantedTargetTypes,
    sourceUuids: wantedSourceUuids, targetUuids: wantedTargetUuids
  } = entry.when ?? {};

  if (checkTypes && !checkTypes.includes(checkType)) return false;
  if (subjects && !subjects.includes(subject)) return false;
  if (actions && !actions.includes(actionKey)) return false;
  if (wanted && !wanted.some((t) => traits.includes(t))) return false;
  if (wantedTraditions && !wantedTraditions.some((t) => traditions.includes(t))) return false;
  if (wantedSourceTypes && !wantedSourceTypes.some((t) => sourceTypes.includes(t))) return false;
  // AND THE SAME TEST AIMED THE OTHER WAY. "+1 to all interactions with
  // creatures of the Wyrm type" is a claim about rolls made AT a Wyrm; a
  // Diplomacy check with no target named is not one of them, and handing
  // the bonus over anyway would make it a flat +1 to every social check
  // the Dracoris ever rolls — which is the rule the book did not write.
  if (wantedTargetTypes && !wantedTargetTypes.some((t) => targetTypes.includes(t))) return false;
  // A WARD THAT DOES NOT KNOW WHO IS ATTACKING PROTECTS AGAINST NOBODY,
  // and that is the correct answer rather than a cautious one. An entry
  // scoped to one creature is a claim about that creature; applying it to
  // an unattributed roll would hand the player a bonus against the whole
  // world, which is precisely the Stone Shield defect this release fixes.
  if (wantedSourceUuids && !wantedSourceUuids.some((t) => sourceUuids.includes(t))) return false;
  // THE MIRROR, and the same reasoning read the other way round. "A -1
  // penalty to attacks AGAINST YOU" is a claim about rolls aimed at one
  // creature; a roll that names no target is not one of them, and
  // applying it anyway would penalise the enemy's every swing at
  // everybody — the Stone Shield defect with the sign flipped.
  if (wantedTargetUuids && !wantedTargetUuids.some((t) => targetUuids.includes(t))) return false;

  return true;
}

/**
 * The entries that should apply without being asked about: everything
 * matching this check whose author marked it `auto`, because the check's
 * own identity settles the whole scope.
 *
 * This is what makes the engine reach the rolls that never open a dialog
 * — a save forced by an affliction, a spell or a condition, and any roll
 * where the player held Shift to skip configuration. Without it, holding
 * Shift would quietly drop the Halfling's +2 to Sneak and, worse, let a
 * Dwarf skip Lead Boots' -4 by rolling the fast way.
 *
 * @param {object[]} entries From collectConditionals.
 * @param {object} context {checkType, subject, actionKey, traits}
 * @returns {{modifiers: object[], kinds: string[]}}
 */
export function automaticSelections(entries = [], context = {}) {
  const rows = conditionalRows(entries, context).filter((row) => row.auto);
  return applyConditionalSelections(rows, rows.map((row) => row.id));
}

/**
 * The dialog rows for a given check: every conditional that could apply,
 * pre-formatted.
 *
 * Returned as data rather than HTML for the same reason
 * pendingModifierRows is — so the same list can be rendered by the
 * dialog and asserted by the harness without a browser.
 *
 * @param {object[]} entries From collectConditionals.
 * @param {object} context {checkType, subject, actionKey}
 * @returns {object[]}
 */
export function conditionalRows(entries = [], context = {}) {
  return entries
    .filter((entry) => matchesCheck(entry, context))
    .map((entry) => {
      const signed =
        entry.kind === CONDITIONAL_KINDS.MODIFIER
          ? entry.value > 0
            ? `+${entry.value}`
            : String(entry.value)
          : entry.kind === CONDITIONAL_KINDS.ADVANTAGE
            ? "Advantage"
            : "Disadvantage";
      const detail =
        entry.kind === CONDITIONAL_KINDS.MODIFIER ? `${signed} ${entry.type}` : signed;
      return {
        ...entry,
        signed,
        detail,
        summary: entry.scope ? `${entry.label} — ${entry.scope}` : entry.label
      };
    });
}

/**
 * The final bias, given whatever the player chose in the dropdown plus
 * whichever advantage/disadvantage conditionals they ticked.
 *
 * Cancellation matches the rule the check engine already applies to a
 * manually chosen pair: one of each is a normal roll. Several of one
 * kind are not cumulative — advantage is advantage — so this counts
 * PRESENCE on each side, not sources.
 *
 * @param {string} chosen The dropdown value.
 * @param {string[]} kinds Kinds of the ticked conditionals.
 * @param {object} bias The BIAS enum, injected so this stays free of
 *   the dice module and can be unit-checked in isolation.
 * @returns {string}
 */
export function resolveBias(chosen, kinds = [], bias) {
  const hasAdvantage =
    chosen === bias.ADVANTAGE || kinds.includes(CONDITIONAL_KINDS.ADVANTAGE);
  const hasDisadvantage =
    chosen === bias.DISADVANTAGE || kinds.includes(CONDITIONAL_KINDS.DISADVANTAGE);

  if (hasAdvantage && hasDisadvantage) return bias.NORMAL;
  if (hasAdvantage) return bias.ADVANTAGE;
  if (hasDisadvantage) return bias.DISADVANTAGE;
  return bias.NORMAL;
}

/**
 * Splits a set of ticked rows into the two things a check needs: the
 * modifier entries to add, and the bias kinds to reconcile.
 *
 * @param {object[]} rows From conditionalRows.
 * @param {string[]} tickedIds
 * @returns {{modifiers: object[], kinds: string[]}}
 */
export function applyConditionalSelections(rows = [], tickedIds = []) {
  const ticked = rows.filter((row) => tickedIds.includes(row.id));
  const modifiers = [];
  const kinds = [];

  for (const row of ticked) {
    if (row.kind === CONDITIONAL_KINDS.MODIFIER) {
      modifiers.push({ label: row.label, value: row.value, type: row.type });
    } else {
      kinds.push(row.kind);
    }
  }

  return { modifiers, kinds, spent: spentConditionalSources(ticked) };
}

/**
 * Which of the ticked rows have now been used up.
 *
 * ONLY EFFECTS ARE EVER SPENT, and that is the whole point of the
 * filter rather than an oversight to tidy up later. A conditional
 * declared on an ITEM belongs to a race, a feat or a piece of gear; the
 * only way to "spend" it would be to delete the feat, which is a
 * catastrophe dressed as a feature. A conditional declared on an
 * EFFECT belongs to something a spell placed and a spell can take
 * away. So an `oneShot` authored onto an item is quietly inert, and
 * `verify-conditional-one-shot` asserts the pack contains none.
 *
 * @param {object[]} rows already filtered to the ticked ones
 * @returns {Array<{sourceId: string, label: string}>}
 */
export function spentConditionalSources(rows = []) {
  const seen = new Set();
  const spent = [];
  for (const row of rows) {
    if (!row?.oneShot) continue;
    // "effect" here means an effect the ACTOR carries, not one an item
    // transferred — see the harvest above for what was measured.
    if (row.sourceKind !== "effect") continue;
    const id = String(row.sourceId ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    spent.push({ sourceId: id, label: String(row.label ?? "") });
  }
  return spent;
}
