/**
 * Animal companions — the pure half.
 *
 * WHAT AN ANIMAL COMPANION IS, IN THIS SYSTEM'S OWN VOCABULARY.
 *
 * The printed companion rules describe a creature with a level, a
 * twenty-row table of BAB/BDB/saves/feats, hit points per level, skill
 * points per level, a list of class skills, and levelled special
 * abilities. That is, line for line, the shape of a CLASS in this
 * system — `Item.class` already carries `progression[]`, `hitPoints`,
 * `skillPoints`, `classSkills`, `classAbilities` and `grantedFeats`,
 * and `resolveClassProgression` already resolves a row per level with
 * the above-table clamp the companion table needs at level 20.
 *
 * So a companion's progression is not new machinery: it is a real class
 * item, "Animal Companion", shipped in its own `companions` pack. That
 * choice is what makes BAB, BDB, all three saves, HP-per-level, the
 * skill-point budget and the class-skill bonuses work on a companion
 * with no new derivation code at all (lesson 13 — reuse the real
 * mechanism, don't invent a plausible-looking second one).
 *
 * The same reasoning applies one level down. A base creature — "the
 * species of animal you choose" — sets a size, six ability modifiers,
 * movement speeds, senses, natural attacks and two specials. That is
 * what a `race` item already does for a player character, down to
 * setting `system.identity.size` through an ActiveEffect. Base creatures
 * are therefore race items, shipped in the same `companions` pack so
 * they stay out of the player-facing race picker (which is scoped by
 * PACK, not by item type — see PICKER_SLOTS in picker-filters.mjs).
 *
 * WHAT IS ACTUALLY NEW. Only two things: the third Actor type, and the
 * link to its master. Everything else is existing mechanism pointed at
 * a new pack.
 *
 * WHY LEVEL IS PUSHED, NOT PULLED. "An animal companion has a level
 * equal to your level." A companion could read its master's level
 * during its own derivation, but `prepareDerivedData` runs against one
 * document and Foundry gives no ordering guarantee or re-render when a
 * DIFFERENT actor changes — a master levelling up would leave the
 * companion showing stale numbers until something happened to re-derive
 * it, which is exactly the kind of silent wrongness this project keeps
 * finding the hard way. So the level is STORED on the companion and
 * synced explicitly, with `companionSyncState` below telling the sheet
 * when the two have drifted apart. A stale companion says so.
 */

import { progressionRow } from "./class-progression.mjs";
import { CODEX_DAMAGE_LADDER, steppedCreatureDamage } from "./creature-attacks.mjs";

/** The class item every animal companion carries. */
export const COMPANION_CLASS_NAME = "Animal Companion";

/** The compendium the companion class and its base creatures live in. */
export const COMPANION_PACK = "companions";

/** The feat that grants one. */
export const COMPANION_FEAT_NAME = "Animal Companion";

/**
 * The seven class skills every animal companion has, in the printed
 * order. Held here as well as on the class item because the harness
 * checks the built item against this list, and a list checked against
 * itself checks nothing (lesson 1).
 */
export const COMPANION_CLASS_SKILLS = Object.freeze([
  "Acrobatics", "Athletics", "Climbing", "Intimidate", "Perception", "Stealth", "Survival"
]);

/** "An animal companion gains 10 + Con per level hit points." */
export const COMPANION_HP_PER_LEVEL = 10;

/**
 * "An animal companion gains 2 skill points plus wisdom ability score
 * per level which it may spend in the same way as that of a PC."
 *
 * TWO, NOT FOUR (3.570.0). This constant read 4, above a doc comment
 * quoting "An animal companion gains 4 skill points per level" — a
 * sentence that appears in NEITHER revision 3.8 nor 3.8.1 of the
 * rulebook. The Animal Companion class item carried the same 4, so
 * every companion in every world has been drawing two extra skill
 * points a level, forty over a full career, against a rule the book
 * states plainly.
 *
 * FOUND BY BUILDING THE HARNESS Graham asked for on 18 September 2026,
 * and only because the checks were written from the printed page rather
 * than from the module — a check that had taken this constant as its
 * expected value would have agreed with it for ever. The same shape as
 * the archetype-progression header: a comment asserting something that
 * is not so, load-bearing for the wrong answer.
 *
 * The wisdom half is authored on the class item as `skillPointAbility`,
 * which is the channel the sheet already reads for every other class.
 */
export const COMPANION_SKILL_POINTS = 2;

/**
 * Size steps, smallest first. The same eight keys as SIZE_TABLE in
 * config.mjs, in the same order — deliberately a separate list, because
 * SIZE_TABLE is an object whose key order is a fact about how it was
 * typed rather than a declared ordering, and "one step larger" is a rule
 * that should not depend on that.
 */
export const SIZE_STEPS = Object.freeze([
  "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"
]);

export function isCompanion(actor) {
  return actor?.type === "companion";
}

/** The stored id of this companion's master, or "" if unbound. */
export function masterIdOf(actor) {
  if (!isCompanion(actor)) return "";
  return String(actor?.system?.companion?.masterId ?? "").trim();
}

/**
 * One size step larger, or the same size at the top of the table.
 *
 * Clamped rather than returning null: Increase Size's own text caps at
 * the creature's maximum, and a colossal companion asked to grow has
 * nothing above it either way.
 */
export function sizeStepUp(size) {
  const index = SIZE_STEPS.indexOf(String(size ?? "").toLowerCase());
  if (index < 0) return null;
  return SIZE_STEPS[Math.min(index + 1, SIZE_STEPS.length - 1)];
}

/**
 * One size step SMALLER, or the same size at the bottom of the table.
 *
 * CALLED AGAIN SINCE 3.595.0, and by the thing it was kept for. The note
 * below said it was held as "the exact mirror of sizeStepUp, so the next
 * thing needing a step down finds a tested one rather than writing a third
 * size ladder". That thing is `magic/size-step.mjs`: nine Shape spells
 * print "increase or DECREASE the size of the form", and the decrease came
 * free. The keep is removed from tools/uncalled-exports.json; this is the
 * paragraph it earned.
 *
 * The mirror of sizeStepUp, and clamped for the same reason: Wild Shape
 * (Druid, 3rd) says "you may reduce your size by one step", and a
 * diminutive shape asked to shrink has nothing below it. Added at
 * 3.329.0 when Wild Shape's size clause stopped being a note.
 *
 * Unknown names return null rather than falling through to index -1 and
 * reading as "smaller than everything" (lesson 18) — the same refusal
 * sizeStepUp makes.
 */
// NO CALLER SINCE 3.332.0, and that is recorded rather than hidden. It
// was added for Wild Shape's bespoke size dialog, which has been removed
// in favour of the spell's own warping option. Kept as the exact mirror
// of `sizeStepUp` (which the companion growth ladder does use) and still
// harnessed, so that the next thing needing a step down finds a tested
// one rather than writing a third size ladder.
export function sizeStepDown(size) {
  const index = SIZE_STEPS.indexOf(String(size ?? "").toLowerCase());
  if (index < 0) return null;
  return SIZE_STEPS[Math.max(index - 1, 0)];
}

/**
 * Can this companion still grow?
 *
 * Increase Size's own text: "This feat cannot be used to increase your
 * companions size beyond the normal maximum for a creature of its type."
 *
 * There used to be a `defaultMaximumSize` here that returned one step
 * above the starting size, as a stand-in for the maximums the document
 * omits. Graham supplied the real ones (2026-08-09) and the guess was
 * wrong for seven of the eight — a Bear grows two steps to Huge, a Snake
 * three to Large, and a Horse starts at its maximum and cannot grow at
 * all. So the rule is gone rather than kept as a fallback nothing
 * reaches: the maximum is authored per creature (COMPANION_SIZES in
 * tools/companion-data.mjs), and a base creature that fails to declare
 * one is a data error worth failing on, not a case to paper over with a
 * plausible default (lesson 13).
 *
 * Refuses BEFORE coercion when either size is unknown, rather than
 * letting an unrecognised name fall through to index -1 and compare as
 * "smaller than everything" — the same trap `Number(null)` is 0 already
 * cost this project twice (lesson 18).
 */
export function canIncreaseSize(currentSize, maximumSize) {
  const current = SIZE_STEPS.indexOf(String(currentSize ?? "").toLowerCase());
  const maximum = SIZE_STEPS.indexOf(String(maximumSize ?? "").toLowerCase());
  if (current < 0 || maximum < 0) return false;
  return current < maximum;
}

/**
 * The damage die ladder a natural attack follows across creature sizes.
 *
 * A natural weapon in the weapons pack is authored at MEDIUM. The
 * printed companion attacks are those same weapons at the creature's own
 * size, stepped one place per size category: Bite 1d8 / 1d6 / 1d4 at
 * Medium / Small / Tiny, Claws 1d6 / 1d4 / 1d3.
 *
 * NOT `stepDownDieSize` from item-quality.mjs, and the difference is
 * deliberate rather than an oversight. That function's own
 * DIE_STEP_SEQUENCE is 4/6/8/10/12, and its comment says outright that
 * it refuses to guess at an extended progression the rulebook never
 * states — which is correct for the material rule it serves (Silver
 * reducing a weapon's die by one step).
 *
 * THIS LADDER IS NOW THE CREATURE CODEX'S OWN (Graham's ruling,
 * 2026-08-11). It was 3/4/6/8/10/12, inferred from the printed companion
 * attacks before the Codex's Table 6 was transcribed — and the two
 * disagreed: the Codex's ladder has rungs this one lacked (1, 1d2, 1d5,
 * and everything above 1d12), so a Small companion's Claws came out 1d4
 * here and 1d5 there, and a Colossal creature's bite clamped at 1d12
 * where the table gives 1d20.
 *
 * Graham ruled the Codex's table governs everywhere, so there is ONE
 * ladder and this name is an alias for it. Three printed companion
 * attacks are amended by that ruling and each is recorded in
 * tools/companion-creatures.mjs's AMENDMENTS list, printed figure and
 * all — the treatment the two equine hooves already had.
 */
export const NATURAL_DAMAGE_LADDER = CODEX_DAMAGE_LADDER;

/**
 * A natural weapon's damage moved from one creature size to another.
 *
 * The general form of `sizedNaturalDamage` above, which is now this with
 * "medium" fixed as the origin. Increase Size needs the general one: the
 * granted attack a Wolf carries is authored at SMALL ("Bite (Small)",
 * 1d6), and growing the Wolf to Large has to step that up two rungs from
 * where it actually is, not two rungs from Medium.
 *
 * Deriving the medium equivalent first and re-stepping would give the
 * same answer everywhere on the ladder and a different one at the ends,
 * where the clamp bites: a Bird's 1d3 Claws are already at the bottom
 * rung, and round-tripping through Medium would quietly promote them.
 * One step count, applied once.
 *
 * @param {string} damage The weapon's damage at `fromSize`, e.g. "1d6".
 * @param {string} fromSize The size that damage is written for.
 * @param {string} toSize The size to move it to.
 * @returns {string|null} e.g. "1d10", or null if any input is unknown.
 */
export function resizedNaturalDamage(damage, fromSize, toSize) {
  // ONE LADDER AND ONE STEPPER (Graham's ruling, 2026-08-11). This used
  // to walk its own copy of the ladder; now that the Codex's table
  // governs everywhere, the arithmetic lives in one place too — because
  // two functions walking one ladder is the same trap as two ladders,
  // and the flat "1" at the bottom rung is exactly the kind of detail
  // the second copy would have missed. It did: the first version of this
  // change returned "1d1".
  //
  // The size names are still resolved here, against SIZE_STEPS, so a
  // size this module does not know still returns null rather than being
  // silently treated as Medium.
  const from = SIZE_STEPS.indexOf(String(fromSize ?? "").toLowerCase());
  const to = SIZE_STEPS.indexOf(String(toSize ?? "").toLowerCase());
  if (from < 0 || to < 0) return null;
  return steppedCreatureDamage(damage, to - from);
}

/**
 * The companion table's own EL column, for a given level.
 *
 * Effective Level is a Chapter 12 concept and the companion table is the
 * ONLY progression table in this system that prints one — a player
 * character's effective level is simply their level. The first draft put
 * `effectiveLevel` into `PROGRESSION_COLUMNS` so it would resolve
 * through `resolveClassProgression` like every other column, and
 * `verify-classes.mjs`'s B3 immediately failed all eight classes: that
 * check asserts a column the book does not print for a class is authored
 * as `null`, deliberately, so that "absent" can never be confused with a
 * flat 0 progression. It was right to complain. Inflating a shared
 * constant — and hand-editing `effectiveLevel: null` into 160 rows of a
 * hand-typed data file — to serve one consumer is the tail wagging the
 * dog.
 *
 * So the column stays out of the shared list and is read here instead,
 * through `progressionRow` — the same lookup, with the same
 * above-the-table clamp, just asked a companion-specific question. The
 * key is still authored on the companion class's own rows, and this is
 * what reads it, so it is not a field nothing reads (lesson 13).
 *
 * @param {object|null} classItem The Animal Companion class item.
 * @param {number} level
 * @returns {number|null} null when there is no table or no such column.
 */
export function companionEffectiveLevel(classItem, level) {
  const found = progressionRow(classItem, level);
  if (!found) return null;
  const value = Number(found.row?.effectiveLevel);
  return Number.isFinite(value) ? value : null;
}

/**
 * Is this companion's stored level still its master's?
 *
 * Returns a small object rather than a boolean so the sheet can say what
 * is wrong ("your master is 7th, you are 5th") instead of only that
 * something is. A companion with no master is not "out of date" — it is
 * unbound, which is a different state and gets a different message.
 */
export function companionSyncState({ masterLevel, companionLevel, hasMaster }) {
  if (!hasMaster) {
    return { bound: false, inSync: true, masterLevel: null, companionLevel: Number(companionLevel) || 0 };
  }
  const master = Math.max(0, Math.floor(Number(masterLevel) || 0));
  const own = Math.max(0, Math.floor(Number(companionLevel) || 0));
  return { bound: true, inSync: master === own, masterLevel: master, companionLevel: own };
}

/**
 * The update paths that can move a master's level.
 *
 * `system.identity.level` for an NPC or a companion, which a GM types
 * directly, and `system.identity.xp` for a player character, whose level
 * is derived from it (`deriveLevelFromXP`, config.mjs) and therefore
 * never appears in an update diff at all. Missing the XP path is the
 * failure mode that matters: a Ranger levels up by gaining XP, so a
 * trigger watching only `level` would never once fire for the actor type
 * that owns almost every companion in a world.
 */
export const LEVEL_CHANGE_PATHS = Object.freeze([
  "system.identity.level",
  "system.identity.xp"
]);

/**
 * Does this update diff plausibly change the actor's level?
 *
 * The gate on the `updateActor` hook, kept pure so the harness can run
 * it against real diff shapes instead of grepping the hook (lesson 2).
 *
 * It answers "might this have moved the level", not "did it" — the hook
 * compares the actual numbers afterwards. That is the right way round:
 * a false positive costs one array scan of `game.actors`, and a false
 * negative leaves a companion silently stale, which is exactly the bug
 * this whole trigger exists to fix.
 *
 * Foundry hands the diff EXPANDED (`{system: {identity: {xp: {value: 1}}}}`)
 * but code elsewhere in this system updates with flattened keys, and
 * `updateActor` reports whichever form the caller used. Both are
 * recognised, because a trigger that works only when the caller happens
 * to pick one of the two spellings is not a trigger.
 *
 * The path walk is written out here rather than delegated to
 * `foundry.utils.flattenObject`, so this stays a pure function the
 * harness can RUN. Reaching for the Foundry global would have made it
 * untestable outside a world — and worse, the `typeof === "function"`
 * fallback that a first draft used would have quietly returned false for
 * every expanded diff under `node`, which is to say the harness would
 * have been testing a version of this rule that never fires.
 *
 * @param {object} changed The `changed` argument of the updateActor hook.
 */
export function changeTouchesLevel(changed) {
  if (!changed || typeof changed !== "object" || Array.isArray(changed)) return false;
  const matches = (path) =>
    LEVEL_CHANGE_PATHS.some((watched) => path === watched || path.startsWith(`${watched}.`));
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      // A dotted key is already a path; a plain one extends the prefix.
      // Joining them the same way handles a diff that mixes the two.
      const path = prefix ? `${prefix}.${key}` : key;
      if (matches(path)) return true;
      if (value && typeof value === "object" && !Array.isArray(value) && walk(value, path)) {
        return true;
      }
    }
    return false;
  };
  return walk(changed, "");
}

/**
 * The name a newly created companion is given.
 *
 * "Signus's Cat" rather than "Cat", because a world with three Rangers
 * ends up with three actors called Cat and no way to tell them apart in
 * the sidebar or the Combat Tracker.
 *
 * Always "'s", including after a name ending in s. The first version
 * dropped the second s for those ("Thomas' Wolf"), which is a defensible
 * style for classical names and reads as a typo for everything else —
 * and it was a branch whose only purpose was to be argued about.
 */
export function companionActorName(masterName, creatureName) {
  const master = String(masterName ?? "").trim();
  const creature = String(creatureName ?? "").trim() || "Companion";
  if (!master) return creature;
  return `${master}'s ${creature}`;
}

/**
 * The creation payload for a companion actor, minus its items.
 *
 * Pure and exported so the harness can check the whole shape without a
 * live Foundry — the actor type, the link back to the master, and the
 * two things that are easy to get wrong and invisible when you do:
 *
 *   - OWNERSHIP is copied from the master. A companion the player cannot
 *     select or roll is useless, and Foundry's default for a
 *     GM-created actor gives players nothing. Copied wholesale rather
 *     than reconstructed, so a master shared with a co-GM stays shared.
 *   - `prototypeToken.actorLink` is TRUE. A companion is a single named
 *     creature, not a mook stamped out repeatedly: its token must be the
 *     actor, so damage taken on the canvas is damage on the sheet.
 *
 * `syncedAtLevel` records the master's level at creation so
 * `companionSyncState` has something to compare against immediately,
 * rather than reading as drifted the moment it is made.
 */
export function companionActorData({
  masterId, masterName, creatureName, startingSize, maximumSize, level, ownership, img
} = {}) {
  const resolvedLevel = Math.max(1, Math.floor(Number(level) || 1));
  return {
    name: companionActorName(masterName, creatureName),
    type: "companion",
    img: img ?? undefined,
    ownership: { ...(ownership ?? {}) },
    prototypeToken: { actorLink: true, disposition: 1 },
    system: {
      identity: { level: resolvedLevel },
      companion: {
        masterId: String(masterId ?? ""),
        masterName: String(masterName ?? ""),
        baseCreature: String(creatureName ?? ""),
        startingSize: String(startingSize ?? ""),
        maximumSize: String(maximumSize ?? ""),
        syncedAtLevel: resolvedLevel
      }
    }
  };
}

/**
 * Is this companion bound to that master?
 *
 * Matched on the stored id, never on the name — two Rangers can both
 * call their wolf "Wolf", and a name match would bind the wrong pair.
 * The same reasoning that made `sourceEntryId` the rule for matching an
 * owned item back to its pack entry (lesson 33).
 */
export function isBoundTo(companionActor, masterActorId) {
  const id = String(masterActorId ?? "").trim();
  return Boolean(id) && masterIdOf(companionActor) === id;
}
