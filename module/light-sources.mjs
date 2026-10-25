/**
 * Light sources — the eleven things in this book that move the
 * illumination ladder, and the two rules that govern all of them.
 *
 * NEW at 3.396.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `raiseLightLevel`
 *
 * `light.mjs` already raises a level by a number of steps, and reusing
 * it here would have been the obvious tidy. It would also have been
 * wrong, silently, in two directions at once.
 *
 * `raiseLightLevel` encodes the rules for SPECIAL SENSES:
 *
 *   "special senses such as Darkvision cannot increase the illumination
 *    level above 8"                                   → a universal cap
 *   Abyssal Darkness "render[s] even Darkvision ineffective"
 *                                                     → level 1 defeats it
 *
 * Neither is the rule for light SOURCES:
 *
 *   THE CAP IS PER SOURCE, not universal. A candle stops at 5, a torch
 *   at 7, the Light spell at 8. Reusing the sense cap would have handed
 *   every candle in the game two extra steps of brightness, and nothing
 *   would have errored.
 *
 *   THE DARKNESS RULE IS THE OTHER WAY ROUND. For senses, level 1 is the
 *   special case. For sources it is level 2 — "Supernatural Darkness ...
 *   defies normal light sources, negating most forms of illumination and
 *   requiring specific abilities or magic to penetrate" — so a MUNDANE
 *   torch fails at 2 where a magical light still works. `raiseLightLevel`
 *   has no concept of a magical source and would have let the torch
 *   through.
 *
 * So this module is a second answer to a similar-looking question, and
 * that is the justified case rather than the "two places deciding one
 * question" defect: the two are not the same question. `light.mjs` keeps
 * the ladder, the names, the penalties and the sense rules; this keeps
 * the sources.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULINGS, 25 August 2026, all three recorded here
 *
 *  1. Sources printed as "equal to that of a torch" — Dancing Lights and
 *     Continual Light — inherit the TORCH'S CAP of 7, not the 8 that
 *     Light and Ghostly Lanterns print. The comparison carries the whole
 *     entry, not just the step count.
 *
 *  2. Magic penetrates Supernatural Darkness (2); nothing penetrates
 *     Abyssal Darkness (1). Mundane sources are negated at both.
 *
 *  3. A light source ATTACHES TO ITS TARGET and moves with it, rather
 *     than being authored as a Region. That ruling shapes the workflow
 *     (see the `light` effect kind in magic/spell-effects.mjs); this
 *     module is only the arithmetic.
 */

import { LIGHT_LEVELS } from "./light.mjs";
import { registeredLightSource } from "./module-api.mjs";

/**
 * The level at which magical darkness stops a MUNDANE source.
 *
 * "Supernatural Darkness ... defies normal light sources, negating most
 * forms of illumination and requiring specific abilities or magic to
 * penetrate."
 */
export const MUNDANE_NEGATED_AT_OR_BELOW = 2;

/**
 * The level at which nothing works at all.
 *
 * "Abyssal Darkness ... seems to devour all light."
 */
export const ALL_NEGATED_AT_OR_BELOW = 1;

/**
 * Every source in the book that moves the ladder.
 *
 * `steps` is signed: positive raises, negative lowers. `cap` is the
 * highest level a raise may reach, `floor` the lowest a lowering may
 * reach; each source has exactly one of the two, because no source in
 * the book does both.
 *
 * `magical` decides the Supernatural Darkness rule and nothing else.
 *
 * `radiusFeet` and `coneFeet` are recorded ONLY where the book prints
 * them. Three sources do; the other eight print no shape at all, and
 * inventing one here would put a number in the rules that the rules do
 * not contain. What Foundry needs in order to draw the light is a
 * presentation concern and lives with the workflow, declared as a
 * default rather than smuggled in as data — see DEFAULT_LIGHT_RADIUS_FT.
 */
export const LIGHT_SOURCES = Object.freeze({
  /* ---- gear (Chapter 6, Goods) ---- */
  candle: Object.freeze({
    label: "Candle", item: "Candle", pack: "gear",
    steps: 1, cap: 5, magical: false
  }),
  "lantern-candle": Object.freeze({
    label: "Candle Lantern", item: "Lantern, Candle", pack: "gear",
    steps: 2, cap: 5, magical: false
  }),
  "lantern-bullseye": Object.freeze({
    label: "Bullseye Lantern", item: "Lantern, Bullseye", pack: "gear",
    steps: 2, cap: 6, magical: false, coneFeet: 75
  }),
  // THE HOOD (3.576.0): "can be lowered to conceal its light without
  // extinguishing it". See HOODED_FLAG.
  "lantern-hooded": Object.freeze({
    label: "Hooded Lantern", item: "Lantern, Hooded", pack: "gear",
    steps: 2, cap: 7, magical: false, hood: true
  }),
  torch: Object.freeze({
    label: "Torch", item: "Torch", pack: "gear",
    steps: 2, cap: 7, magical: false
  }),

  /* ---- spells (Chapter 10) ---- */
  // "equal to that of a torch" — cap 7 by Graham's ruling, not the 8
  // that the spells printing their own cap use.
  // THE PACK CALLS THIS "Continual Light". I wrote "Continual Flame"
  // from memory of a different game and `verify-light-sources` A1 caught
  // it on the first run — the same shape as Improved Combat Reflexes,
  // where the code matched a name the pack did not hold. The `item`
  // field is a lookup key, so it is the pack's spelling that governs.
  "continual-light": Object.freeze({
    label: "Continual Light", item: "Continual Light", pack: "spells",
    steps: 2, cap: 7, magical: true, asTorch: true
  }),
  "dancing-lights": Object.freeze({
    label: "Dancing Lights", item: "Dancing Lights", pack: "spells",
    steps: 2, cap: 7, magical: true, asTorch: true
  }),
  light: Object.freeze({
    label: "Light", item: "Light", pack: "spells",
    steps: 2, cap: 8, magical: true
  }),
  "ghostly-lanterns": Object.freeze({
    label: "Ghostly Lanterns", item: "Ghostly Lanterns", pack: "spells",
    steps: 3, cap: 8, magical: true
  }),
  // UNWELCOME HALO PRINTS NO CAP. `cap: null` is a declared absence, not
  // a forgotten field: the spell says "increases the illumination level
  // by two steps in a 20-foot radius from the creature" and stops. A
  // null cap is honoured as "no ceiling below 10" by `applyLightSource`,
  // and verify-light-sources asserts the null so that a later editor
  // filling it in with a guess has to say so out loud.
  "unwelcome-halo": Object.freeze({
    label: "Unwelcome Halo", item: "Unwelcome Halo", pack: "spells",
    steps: 2, cap: null, magical: true, radiusFeet: 20
  }),
  darkness: Object.freeze({
    label: "Darkness", item: "Darkness", pack: "spells",
    steps: -4, floor: 3, magical: true, radiusFeet: 20
  }),
  // BLOCK 34 (3.611.0). Two auras whose light was a note.
  // EMBER OF DEVOTION: "You emit a 10-ft aura … The aura sheds dim light
  // (+1 light level) in the area." Its +2 PP warp widens the aura, not
  // the light, so the light's radius stays the printed ten feet.
  "ember-of-devotion": Object.freeze({
    label: "Ember Of Devotion", item: "Ember Of Devotion", pack: "spells",
    steps: 1, cap: null, magical: true, radiusFeet: 10
  }),
  // LUMINANCE: "A bright light emanates from you in a 10-foot radius
  // (increasing the light level by three steps)."
  luminance: Object.freeze({
    label: "Luminance", item: "Luminance", pack: "spells",
    steps: 3, cap: null, magical: true, radiusFeet: 10
  }),

  /* ---- creatures (Fiends & Fables 3.0) ---- */
  // BLOCK 17 (3.650.0), the Glimmerwick's LUMINOUS AURA: "increases the
  // light level within a 10 feet radius by one step, though this never
  // counts as sunlight." No cap printed, so a declared null as Unwelcome
  // Halo's. The item is the module's creature ability, which core's packs
  // do not hold: `creature: true` sends verify-light-sources to its own
  // check, and the toggle (codex `toggleEffect`) wires it.
  "luminous-aura": Object.freeze({
    label: "Luminous Aura", item: "Luminous Aura", pack: "creature", creature: true,
    steps: 1, cap: null, magical: true, radiusFeet: 10
  })
});

/**
 * How far a light source reaches, in feet, when the book does not say.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOT A PRINTED RULE — A RULING. Graham settled it on 25 August 2026
 * after seeing the reasoning below: 20 feet it is. It stays here, alone,
 * so changing it is one edit rather than a hunt.
 *
 * Eight of the eleven sources print no shape at all. The Torch entry
 * says how bright and for how long and says nothing about how far; so do
 * Light, Dancing Lights, Continual Light, Ghostly Lanterns, the candle
 * and two of the three lanterns. Only three print a distance — the
 * bullseye lantern's 75-foot cone, Unwelcome Halo's 20-foot radius and
 * Darkness's 20-foot radius.
 *
 * But a light source has to reach SOMEWHERE or attaching it to a token
 * means nothing, so a number was unavoidable. 20 feet is taken from the
 * two radii the book does print for personal-scale light effects —
 * Unwelcome Halo and Darkness — which made it the least invented number
 * available, and is the one Graham confirmed.
 *
 * A SOURCE THAT PRINTS ITS OWN SHAPE USES IT. This is only the fallback.
 */
export const DEFAULT_LIGHT_RADIUS_FT = 20;

/** How far this source reaches: its printed shape, or the default. */
export function lightRadiusFeet(source) {
  const entry = typeof source === "string" ? lightSource(source) : source;
  if (!entry) return 0;
  const printed = Number(entry.radiusFeet ?? entry.coneFeet);
  return Number.isFinite(printed) && printed > 0 ? printed : DEFAULT_LIGHT_RADIUS_FT;
}

/**
 * The system-flag payload marking an effect as carrying a light source.
 *
 * ONE AUTHOR FOR THE SHAPE, and the reason is three days old rather than
 * theoretical: the `marker` effect kind added at 3.395.0 shipped with the
 * applier writing its flag as an object literal and the reader looking
 * the key up by hand. A mutation renamed one end, all 59 checks stayed
 * green, and the spell would have done nothing for ever. See
 * `markerFlagData` in magic/markers.mjs for the full account. The same
 * mistake is not being made twice in the same week.
 */
export function lightSourceFlagData(key) {
  return { lightSource: String(key) };
}

/**
 * The flag a lit piece of gear carries.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LIT IS NOT THE SAME AS EQUIPPED, and the gear pack has only the
 * second. A torch in your hand that nobody has set fire to sheds no
 * light, and a system that treated `equipped` as "burning" would light
 * every torch the moment it was drawn.
 *
 * GRAHAM'S RULING, 25 August 2026: lit state only, no fuel. The book
 * gives burn times — a torch lasts an hour, the hooded and bullseye
 * lanterns take a pint of oil per four hours, the candle lantern a
 * candle an hour — and those stay printed on the item for the table to
 * judge rather than counted down here.
 *
 * THE HOODED LANTERN'S COVER, BUILT AT 3.576.0 (Graham, 19 Sep 2026).
 * The book gives it a hood "which can be lowered to conceal its light
 * WITHOUT EXTINGUISHING IT", which is a third state between lit and
 * out — a lantern that is burning, will not need relighting, and is
 * currently shedding nothing. Modelling it as "not lit" would lose the
 * distinction the sentence exists to draw, so it is its own flag
 * (HOODED_FLAG) beside this one, and a lit lantern with its hood down
 * is still lit.
 */
export const LIT_FLAG = "lit";

/** The flag a hooded lantern carries while its hood is lowered. */
export const HOODED_FLAG = "hooded";

/** Does this item's light source have a hood to lower? */
export function lightSourceHasHood(item) {
  return lightSource(lightSourceKeyForItem(item))?.hood === true;
}

/**
 * Is this item's hood lowered? Only a light that HAS a hood can be, so a
 * stray flag on a torch conceals nothing.
 */
export function itemIsHooded(item) {
  return lightSourceHasHood(item) && item?.flags?.["trg-prime"]?.[HOODED_FLAG] === true;
}

/** Gear item name (normalised) → source key. Built from the table itself. */
const GEAR_BY_ITEM_NAME = new Map(
  Object.entries(LIGHT_SOURCES)
    .filter(([, entry]) => entry.pack === "gear")
    .map(([key, entry]) => [String(entry.item).trim().toLowerCase(), key])
);

/**
 * The light source this item is, or null.
 *
 * MATCHED BY THE ITEM'S NAME, which is the lookup this project has been
 * bitten by before — Improved Combat Reflexes matched a name the pack
 * did not hold, and its test agreed with the code because neither had
 * opened the compendium. What makes it safe here is that
 * `verify-light-sources` A1 opens the gear pack and fails if any `item`
 * in LIGHT_SOURCES is not a real item. The name is still a lookup key;
 * it is just a checked one.
 *
 * NORMALISED, so a world copy renamed in case or spacing still resolves.
 */
export function lightSourceKeyForItem(item) {
  if (!item || item.type !== "gear") return null;
  return GEAR_BY_ITEM_NAME.get(String(item.name ?? "").trim().toLowerCase()) ?? null;
}

/**
 * Is this item a light that is actually burning?
 *
 * BOTH CONDITIONS, and the second is a judgement worth stating. A lit
 * torch must also be EQUIPPED to shed light, because the alternative is
 * a burning torch in a closed backpack lighting the room. The cost is
 * that unequipping a lit torch silently puts the light out rather than
 * asking; that is the right way round, since the reverse would have a
 * character light the dungeon from inside their pack.
 */
function isLitLightSource(item) {
  if (!lightSourceKeyForItem(item)) return false;
  if (!item?.system?.equipped) return false;
  // BURNING BEHIND ITS HOOD sheds nothing (3.576.0).
  if (itemIsHooded(item)) return false;
  return itemIsLit(item);
}

/**
 * Has somebody set fire to this item?
 *
 * A DIFFERENT QUESTION FROM `isLitLightSource`, and the difference is
 * the point: this asks only whether the flag is set, not whether the
 * thing is currently shedding light. The inventory row wants this one —
 * a lit torch that has been unequipped is still burning, and showing its
 * flame greyed out would tell the player they had put it out when they
 * have merely stowed it.
 *
 * IT ALSO GIVES THE FLAG ONE READER. The sheet used to reach into
 * `item.flags["trg-prime"].lit` by hand, which is a second author for a
 * string the rules already own — the same shape as the marker flag that
 * survived 59 checks three days ago by being spelled two ways.
 */
export function itemIsLit(item) {
  return item?.flags?.["trg-prime"]?.[LIT_FLAG] === true;
}

/**
 * The item that starts a fire.
 *
 * "Flint & Steel/Tinderbox — Starts fire in 1 round or more", from the
 * Goods table. A lookup key like the five light items, and protected the
 * same way: verify-light-sources A14 opens the gear pack and fails if
 * this name is not a real item.
 */
export const FIRE_STARTER = "Flint & Steel/Tinderbox";

/**
 * What to say when somebody lights something, or null if all is well.
 *
 * WARNS, NEVER REFUSES — Graham's ruling of 25 August, and it matches
 * how this system already treats proficiency: a penalty or a notice, and
 * the player gets on with it. The alternative was live in this project
 * a fortnight ago and cost a whole confusing session, when a Hold Animal
 * that "did nothing" turned out to be the component gate refusing
 * correctly and silently. A refusal nobody sees is worse than a rule
 * nobody enforces.
 *
 * RETURNS A MESSAGE RATHER THAN LOGGING ONE, so the caller decides
 * whether it belongs on a card, in a notification, or both — and so a
 * harness can read the decision instead of watching for a side effect.
 *
 * @param {string[]} itemNames every item name the actor carries
 * @returns {string|null}
 */
export function fireStarterWarning(itemNames) {
  const wanted = FIRE_STARTER.trim().toLowerCase();
  const has = (Array.isArray(itemNames) ? itemNames : [])
    .some((n) => String(n ?? "").trim().toLowerCase() === wanted);
  return has ? null : `No ${FIRE_STARTER} carried — lit anyway; a GM may rule otherwise.`;
}

/** The keys of every lit, equipped light this actor is carrying. */
export function litGearKeysOn(actor) {
  const keys = [];
  for (const item of actor?.items ?? []) {
    if (!isLitLightSource(item)) continue;
    const key = lightSourceKeyForItem(item);
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * The light-source keys carried by an actor's active effects.
 *
 * Takes anything with `.effects`, so a harness can hand it plain data.
 * Unknown keys are dropped rather than passed through — `isLightSourceKey`
 * is the same gate `markerKeyOf` uses, and it is safe to be quiet here
 * only because verify-light-sources refuses to let an unknown key exist
 * in the pack in the first place.
 */
export function lightSourceKeysOn(actor) {
  const keys = [];
  for (const effect of actor?.effects ?? []) {
    if (effect?.disabled) continue;
    const key = String(effect.flags?.["trg-prime"]?.lightSource ?? "").trim();
    if (isLightSourceKey(key)) keys.push(key);
  }
  // AND THE GEAR, THROUGH THE SAME DOOR. One function answers "what does
  // this actor shed", so everything that asks — the ladder, the token
  // glow, and `restoreTokenLight`'s "is anything still lit?" — gets the
  // same answer without any of them learning that a torch is different
  // from a spell. It also means dousing a torch while a cast Light is
  // still running correctly leaves the glow alone.
  keys.push(...litGearKeysOn(actor));
  return keys;
}

/**
 * @returns {object|null} the source entry, or null.
 *
 * AND A MODULE'S OWN (3.669.0): a key the core table does not hold is looked
 * up among the registered ones (module-api.mjs `registerLightSources`), so
 * Inner Tempest's Spirit Beacon moves the ladder, draws its glow and crosses
 * the GM relay exactly as a torch does. A core key always wins.
 */
export function lightSource(key) {
  const k = String(key ?? "");
  return Object.hasOwn(LIGHT_SOURCES, k) ? LIGHT_SOURCES[k] : registeredLightSource(k);
}

/** @returns {boolean} whether `key` names a source this system implements. */
export function isLightSourceKey(key) {
  return lightSource(key) !== null;
}

/**
 * The ladder's own bounds, read from the ladder.
 *
 * WRITTEN AS `Math.min(10, Math.max(1, …))` FIRST, which was two magic
 * numbers restating what LIGHT_LEVELS already says. `light.mjs` does the
 * same thing internally and is entitled to — it owns the ladder — but a
 * second module hardcoding its endpoints is a second place that has to
 * be edited if an eleventh level is ever added, and the failure would be
 * silent truncation rather than an error.
 *
 * This also gives `LIGHT_LEVELS` its first caller in shipped code. It
 * had none: `verify-rules-have-callers` had it in the uncalled backlog,
 * and importing it into the harness alone would only have moved it to
 * the "named in tools/ only" category — which the ratchet deliberately
 * keeps separate from a real caller, and rightly, because a rule whose
 * only user is its own test is still §5.1's dead rule.
 */
const LADDER_MIN = Math.min(...LIGHT_LEVELS.map((l) => l.level));
const LADDER_MAX = Math.max(...LIGHT_LEVELS.map((l) => l.level));

const clampLevel = (n) => Math.min(LADDER_MAX, Math.max(LADDER_MIN, Math.floor(n)));

/**
 * The level an area reaches once one source acts on it.
 *
 * RAISES:
 *   negated entirely at or below the source's darkness threshold;
 *   otherwise ambient + steps, capped — AND THE CAP APPLIES TO THE
 *   RAISE, NOT TO THE AREA. A torch carried into a Radiant Light
 *   cathedral (9) does not dim it to 7. This is the same principle
 *   `raiseLightLevel` states for senses, restated because the two
 *   functions must be able to disagree about everything else.
 *
 * LOWERINGS (Darkness):
 *   ambient + steps, floored. No penetration check — the rules describe
 *   darkness defeating LIGHT, and nothing in the book says a globe of
 *   darkness fails inside another one. Since Darkness floors at 3 it can
 *   never create a level that would trigger the rule anyway, so this is
 *   a reading with no reachable consequence today; it is written down
 *   because a future source that lowered further would inherit it.
 *
 * @param {number} ambient the level before this source, 1-10
 * @param {object|string} source a LIGHT_SOURCES entry or its key
 * @returns {number} the resulting level, 1-10
 */
export function applyLightSource(ambient, source) {
  const entry = typeof source === "string" ? lightSource(source) : source;
  const base = Number(ambient);
  if (!Number.isFinite(base) || !entry) return clampLevel(Number.isFinite(base) ? base : 8);
  const level = clampLevel(base);
  const steps = Math.floor(Number(entry.steps) || 0);
  if (steps === 0) return level;

  if (steps < 0) {
    // NO `?? 1` FALLBACK, and its absence is the point. It was here, and
    // mutate-light-sources could not kill it: Darkness is the only
    // lowering source in the book and it declares `floor: 3`, so the
    // default branch was unreachable. A guard nothing can reach is a
    // guard no mutation can prove — the same finding that removed the
    // dead lines from extra-uses.mjs and spell-narration.mjs.
    //
    // WHAT REPLACES IT IS A TABLE INVARIANT, not a runtime default:
    // verify-light-sources A10 fails if any lowering source omits a
    // numeric floor. That makes the missing-floor case impossible to
    // ship rather than quietly survivable at runtime, which is the
    // trade this project keeps choosing.
    return Math.max(clampLevel(Number(entry.floor)), level + steps);
  }

  // THE TWO DARKNESS RULES, and the order matters: Abyssal first,
  // because it stops magical sources too and a magical source would
  // otherwise sail past the mundane check.
  if (level <= ALL_NEGATED_AT_OR_BELOW) return level;
  if (!entry.magical && level <= MUNDANE_NEGATED_AT_OR_BELOW) return level;

  // A DECLARED NULL IS NO CAP (3.650.0). `Number(null)` is 0, which is
  // finite, so the declared absence read as a cap of level 1 and every
  // uncapped source — Unwelcome Halo, Ember Of Devotion, Luminance — raised
  // nothing at all. Found by block 17's Luminous Aura, the fourth of them.
  const cap = entry.cap !== null && entry.cap !== undefined && Number.isFinite(Number(entry.cap)) ? clampLevel(Number(entry.cap)) : 10;
  if (level >= cap) return level;
  return Math.min(cap, level + steps);
}

/**
 * The Foundry light configuration a source should be drawn with.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PURE, AND HERE RATHER THAN IN THE WORKFLOW, because the live pass on
 * 3.397.1 found a bug in it that no harness could reach while it lived
 * beside the code that writes to Foundry.
 *
 * THE BUG: `doc.update({light: config})` MERGES. A key the new config
 * omits keeps whatever the old one had. `angle` was set only for the
 * bullseye lantern — the one source the book gives a cone — so putting
 * out a bullseye and lighting a torch left the torch shining through the
 * lantern's 53° wedge. Nothing errored; the card's numbers were right;
 * only the picture was wrong, and only after a particular order of
 * events.
 *
 * So the rule this function follows is: ANYTHING IT CAN EVER SET, IT
 * ALWAYS SETS. A partial config against a merging update is a config
 * that inherits.
 *
 * WHAT IS PRINTED AND WHAT IS NOT. The radius comes from the source —
 * the bullseye's 75-foot cone and the two 20-foot radii are the book's;
 * everything else falls back to the 20 feet Graham settled on 25 August.
 * `bright` at half of `dim`, the colour and the alpha are presentation
 * conventions with no rule behind them: Foundry draws two rings and
 * something has to go in the inner one. If per-source colours are ever
 * wanted they belong in LIGHT_SOURCES beside the steps, not invented
 * here.
 *
 * @param {string} key
 * @returns {object|null} null for a source that shed no light
 */
export function foundryLightConfig(key) {
  const entry = lightSource(key);
  if (!entry || Number(entry.steps) <= 0) return null;
  // WHAT IS DRAWN MAY DIFFER FROM WHAT IS COUNTED (3.669.0), and only a
  // module's source says so: Spirit Beacon's "bright light within 20 feet
  // and dim light for a further 20 feet" draws 40 and 20; Living Lantern's
  // dim light draws no bright ring at all.
  const dim = Number.isFinite(Number(entry.dimFeet)) ? Number(entry.dimFeet) : lightRadiusFeet(entry);
  const bright = Number.isFinite(Number(entry.brightFeet)) ? Math.min(dim, Number(entry.brightFeet)) : Math.floor(dim / 2);
  return {
    dim,
    bright,
    alpha: 0.35,
    color: "#f5c877",
    // 53° is a 75-foot cone at Foundry's default aspect. 360 is said
    // out loud rather than omitted — see above.
    angle: Number(entry.coneFeet) > 0 ? 53 : 360,
    animation: { type: "torch", speed: 2, intensity: 2 }
  };
}

/**
 * Which of several carried sources should the token's glow be drawn from?
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND BY THE LIVE PASS ON 3.397.0. The sheet used to call
 * `attachTokenLight` the moment a torch was lit, without asking whether
 * that torch was SHEDDING anything — so lighting an unequipped torch
 * drew a 20-foot glow on the token while `lightSourceKeysOn` correctly
 * reported the actor as shedding nothing. The rule and the picture
 * disagreed, which is the "two places deciding one question" shape this
 * chapter keeps paying for.
 *
 * The fix is that the glow is now derived from the same list the ladder
 * reads, and this function is the one new decision that required: with
 * a torch and a candle both lit, only one light can be drawn.
 *
 * BRIGHTEST WINS, matching `combinedLightLevel`'s own reading — steps
 * first, then the cap, then reach. Ordered rather than summed, because
 * the sources do not stack; the glow should show whichever one is
 * actually setting the level.
 *
 * @param {string[]} keys
 * @returns {string|null}
 */
export function brightestSourceKey(keys) {
  let best = null;
  let bestEntry = null;
  for (const key of Array.isArray(keys) ? keys : []) {
    const entry = lightSource(key);
    if (!entry || Number(entry.steps) <= 0) continue;
    if (!bestEntry) { best = key; bestEntry = entry; continue; }
    const better =
      entry.steps !== bestEntry.steps ? entry.steps > bestEntry.steps
      : (entry.cap ?? 10) !== (bestEntry.cap ?? 10) ? (entry.cap ?? 10) > (bestEntry.cap ?? 10)
      : lightRadiusFeet(entry) > lightRadiusFeet(bestEntry);
    if (better) { best = key; bestEntry = entry; }
  }
  return best;
}

/**
 * Fold a set of source keys into a RESOLUTION, keeping its shape.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS FUNCTION EXISTS BECAUSE OF A BUG THE LIVE PASS FOUND, and it is
 * the pure half of what went wrong.
 *
 * `lightLevelForToken` (light-workflow.mjs) returns `{level, source}`,
 * and its three callers all destructure `.level` — concealment in
 * combat/targeting.mjs, the perception penalty in apps/check-dialog.mjs
 * and sheets/actor-sheet.mjs. The first version of the 3.396.0 wiring
 * handed the whole resolution OBJECT to `combinedLightLevel`, which
 * coerced it to NaN and answered with its own fallback of 8 — right by
 * coincidence on a bright scene — and then returned a bare NUMBER. So
 * every caller read `undefined` exactly when a light was lit.
 *
 * The fix is not the interesting part. THE INTERESTING PART IS THAT NO
 * HARNESS COULD SEE IT: the shape decision sat inside a function that
 * needs a scene, a token document and a canvas, so nothing pure could
 * call it. That is the defect shape this project names, demonstrating
 * itself in the same release that named it.
 *
 * So the shape decision moved here, where a harness can run it, and the
 * workflow is left with the one job Foundry alone can do — deciding
 * which tokens are near enough.
 *
 * @param {{level:number, source:string}} ambient a resolution
 * @param {string[]} keys source keys in reach
 * @returns {{level:number, source:string}} always a resolution, never a number
 */
export function resolvedLevelWithSources(ambient, keys = []) {
  const base = Number(ambient?.level);
  const list = Array.isArray(keys) ? keys.filter((k) => isLightSourceKey(k)) : [];
  // NOTHING IN REACH LEAVES THE ORIGINAL UNTOUCHED, identity included —
  // the caller may be relying on `source` naming the region or scene.
  if (!list.length || !Number.isFinite(base)) return ambient;

  const level = combinedLightLevel(base, list);
  if (level === base) return ambient;
  return { level, source: "sources", ambient: base, keys: list };
}

/**
 * The level an area reaches with any number of sources acting on it.
 *
 * TWO DECLARED READINGS, neither printed, both needed the moment a
 * second source exists:
 *
 *   SOURCES DO NOT STACK. Two torches in one square give a torch's
 *   light, not four steps of it. The brightest wins. Nothing in the book
 *   describes adding sources together, and the per-source caps only make
 *   sense if each source is measured against the area on its own.
 *
 *   DARKNESS RESOLVES FIRST, and the deepest darkness wins. A Darkness
 *   globe is an area effect that changes what the area IS; a carried
 *   light then raises from that. Doing it the other way round would let
 *   a torch lit before the globe went up shine through it, which is the
 *   opposite of what the spell is for. This ordering is also what makes
 *   the mundane-versus-magical rule reachable at all: Darkness floors at
 *   3, so only an authored Supernatural Darkness ever negates a torch.
 *
 * @param {number} ambient
 * @param {Array<object|string>} sources
 * @returns {number}
 */
export function combinedLightLevel(ambient, sources = []) {
  const list = (Array.isArray(sources) ? sources : [])
    .map((s) => (typeof s === "string" ? lightSource(s) : s))
    .filter(Boolean);

  const base = Number.isFinite(Number(ambient)) ? clampLevel(Number(ambient)) : 8;

  let level = base;
  for (const entry of list) {
    if (Math.floor(Number(entry.steps) || 0) >= 0) continue;
    level = Math.min(level, applyLightSource(base, entry));
  }

  let best = level;
  for (const entry of list) {
    if (Math.floor(Number(entry.steps) || 0) <= 0) continue;
    best = Math.max(best, applyLightSource(level, entry));
  }
  return best;
}
