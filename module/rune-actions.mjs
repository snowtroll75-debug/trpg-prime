/**
 * The runes you DO something with (Chapter 11, group 2).
 *
 * Seven runes are neither a bonus nor a damage die — they are something
 * that happens when you use them. Four from Chapter 11, three from the
 * Creature Codex's Chapter 3:
 *
 *   Animated    the shield floats and fights for itself
 *   Called      the weapon teleports back to your hand
 *   Glamoured   the armour looks like ordinary clothing
 *   Shifting    the weapon becomes a different weapon
 *   Dreadcarve  the armour or shield raises an aura of fear   (Codex)
 *   Swarmed     the thrown weapon replicates across a cone   (Codex)
 *   Wildform    the armour turns its wearer into an animal    (Codex)
 *
 * ONE MECHANISM, NOT SEVEN. Each is a button on the item, a state on the
 * item, and a card saying what happened — so they share a registry here
 * rather than seven hand-written implementations that drift apart. The
 * item sheet renders whatever `runeActionsFor` returns.
 *
 * THE FIFTH ARRIVED AS AN ENTRY IN THE TABLE, which is what the sentence
 * above promised and what Dreadcarve was chosen to test. Its state is
 * the first that anyone else on the canvas can see: while it is up, an
 * aura is emitted and a Region is drawn.
 *
 * WHAT IS TRACKED AND WHAT IS NOT. Frequency is tracked (Animated is
 * 3/day at tier I and unlimited at II) because a per-day count is a
 * number the sheet can hold honestly. Range is REPORTED — Called reaches
 * 100 feet at tier I and a mile at II, and this system does not know
 * where a dropped weapon is.
 */

import { runeKindOf } from "./rune-bearing.mjs";
import { fieldToRunes } from "./rune-catalogue.mjs";
import { registeredRune } from "./module-api.mjs";
import { roman } from "./runes.mjs";
import { ENERGY_RUNES, energyRuneState } from "./rune-damage.mjs";
import { runeUsageAllows, weaponUsage } from "./weapon-rune-usage.mjs";
import { CODEX_ARMOUR_RUNES, CODEX_WEAPON_RUNES } from "./codex-rune-data.mjs";

const SYSTEM_ID = "trg-prime";

/** The seven, and what each one's tiers change. */
export const RUNE_ACTIONS = Object.freeze({
  animated: {
    label: "Animated",
    on: ["shield"],
    verb: "Animate",
    state: "animated",
    // "The rune may be used 3/day" at I; "any number of times per day"
    // at II. Infinity is the honest value for the second, and it reads
    // correctly everywhere a number is compared.
    usesPerDay: (tier) => (tier >= 2 ? Infinity : 3),
    describe: (tier) => tier >= 2
      ? "The shield floats free for 1 minute, granting its DB with both hands free, then drops to the ground; not again for 1 minute. Any number of times per day."
      : "The shield floats free for 1 minute, granting its DB with both hands free, then drops to the ground; not again for 1 minute. Three times per day.",
    // Both hands free, and no Shield Block while it is doing the work.
    effects: { freesHands: true, blocksShieldBlock: true },
    // "Activate Engage (1 AP)" … "its effects last for 1 minute, after
    // which the shield drops to the ground … and may not be activated again
    // for 1 minute" (3.615.0, Graham's R5 and R10 of block 36).
    apCost: 1,
    durationSeconds: 60,
    cooldownSeconds: 60
  },
  // ARROW CATCHING (page 366): "Activate Engage (1 AP) … When activated the
  // armour or shield increases its bonus to DB by +1 against missile
  // attacks." A minute, by Graham's R6 of block 36 — the page prints none.
  arrowCatching: {
    label: "Arrow Catching",
    on: ["armour", "shield"],
    verb: "Engage",
    state: "arrowCatching",
    usesPerDay: () => Infinity,
    describe: () => "For 1 minute: +1 DB against missile attacks, and missiles aimed at anyone within 5 feet are drawn to you.",
    effects: {},
    apCost: 1,
    durationSeconds: 60,
    cooldownSeconds: 0
  },
  called: {
    label: "Called",
    on: ["weapon"],
    verb: "Call",
    state: null,           // an event, not a state
    usesPerDay: () => Infinity,
    // "Activate Command, Contemplative (2 AP)" (3.618.0, A5 of block 37).
    apCost: 2,
    range: (tier) => (tier >= 2 ? "within a mile" : "within 100 feet and line of sight"),
    describe: (tier) => `The weapon teleports to your outstretched hand from ${
      tier >= 2 ? "within a mile" : "within 100 feet, in line of sight"
    }. A creature holding it may resist with a Will save against the weapon's Level DC; a critical on that save also breaks your investment.`
  },
  glamoured: {
    label: "Glamoured",
    on: ["armour"],
    verb: "Glamour",
    state: "glamoured",
    usesPerDay: () => Infinity,
    describe: () =>
      "The armour takes the appearance of ordinary clothing, keeping every property including its weight. Only a creature with true seeing may attempt to disbelieve, DC 26.",
    effects: {},
    // "Activate Contemplative (1 AP)" (3.615.0, R10).
    apCost: 1
  },
  // DREADCARVE (Creature Codex, Chapter 3): "Activate Command (1 AP);
  // Frequency at will." The fifth activated rune, and the first on this
  // table whose state is visible to everyone else on the canvas — while
  // it is up, `codex-runes.mjs` emits an aura and the workflow draws the
  // circle. Adding it was an entry in this table, which is what the
  // table was for.
  dreadcarve: {
    label: "Dreadcarve",
    // ONE COPY of which items it goes on, as with its radii — the
    // catalogue gates this already, so a list written again here is a
    // list nothing could contradict.
    on: CODEX_ARMOUR_RUNES.find((rune) => rune.key === "dreadcarve").on,
    verb: "Command",
    state: "dreadcarve",
    usesPerDay: () => Infinity,
    // ONE COPY of the radii and the DCs. They are the rune's own
    // printed figures, they live in `codex-rune-data.mjs` where they
    // are checked against the page, and a button label is not a reason
    // to write them again.
    describe: (tier) => {
      const tiers = CODEX_ARMOUR_RUNES.find((rune) => rune.key === "dreadcarve").tiers;
      const printed = tiers[Math.min(Math.max(1, tier), tiers.length) - 1];
      return `An aura of fear, ${printed.radiusFeet} ft, behaving as the Frightful Aura creature ability. A creature entering it makes a Will save at DC ${printed.dc}.`;
    },
    effects: {}
  },
  // SWARMED (Creature Codex, Chapter 3): "Activate Command (2 AP)".
  // The sixth activated rune, and the first that puts a TEMPLATE on the
  // map rather than a state on the item — which is why `state` is null:
  // the weapon is hurled and the cone resolves, and there is nothing
  // left switched on afterwards.
  swarmed: {
    label: "Swarmed",
    on: CODEX_WEAPON_RUNES.find((rune) => rune.key === "swarmed").on,
    verb: "Hurl",
    state: null,
    // "Frequency varies" — the page gives no number, at any tier, so
    // there is nothing to count and pretending otherwise would invent a
    // limit. Unlimited, and the release notes say so.
    usesPerDay: () => Infinity,
    describe: (tier) => {
      const rune = CODEX_WEAPON_RUNES.find((entry) => entry.key === "swarmed");
      const printed = rune.tiers[Math.min(Math.max(1, tier), rune.tiers.length) - 1];
      return `The weapon replicates in midair across a ${rune.coneFeet}-foot cone, dealing twice its damage dice. Basic Reflex DC ${printed.dc} to avoid.`;
    },
    effects: {}
  },
  // WILDFORM (Creature Codex, Chapter 3): "Frequency 1/day", and three
  // times a day at tier IV. The seventh activated rune, and the first
  // whose button a DRUID SHOULD NEVER PRESS — for a wearer with a
  // Wildshape-like ability the rune grants extra uses of that instead,
  // and the handler says so rather than shifting them.
  wildform: {
    label: "Wildform",
    on: CODEX_ARMOUR_RUNES.find((rune) => rune.key === "wildform").on,
    verb: "Shift",
    state: null,
    // The one activated rune whose allowance CHANGES with the tier and
    // is printed rather than inferred: 1/day, and 3/day at IV.
    usesPerDay: (tier) => {
      const tiers = CODEX_ARMOUR_RUNES.find((rune) => rune.key === "wildform").tiers;
      return tiers[Math.min(Math.max(1, tier), tiers.length) - 1].usesPerDay;
    },
    describe: (tier) => {
      const rune = CODEX_ARMOUR_RUNES.find((entry) => entry.key === "wildform");
      const printed = rune.tiers[Math.min(Math.max(1, tier), rune.tiers.length) - 1];
      return printed.warpingPP
        ? `${rune.spell}, with up to ${printed.warpingPP} PP of its ${rune.warpingOptionsCalled}.`
        : `${rune.spell}, the base casting — no ${rune.warpingOptionsCalled}.`;
    },
    effects: {}
  },
  shifting: {
    label: "Shifting",
    on: ["weapon"],
    verb: "Shift",
    state: "shifted",
    usesPerDay: () => Infinity,
    // "Activate Engage (1 AP)" (3.618.0, A5 of block 37).
    apCost: 1,
    // "any other of the same size" at I, "within one size of the
    // original" at II — the tier is a reach, not a count.
    sizeSteps: (tier) => (tier >= 2 ? 1 : 0),
    describe: (tier) => tier >= 2
      ? "The weapon becomes any other melee weapon within one size of the original, keeping its quality, material and runes."
      : "The weapon becomes any other melee weapon of the same size, keeping its quality, material and runes.",
    effects: {}
  },
  // THE FIVE ENERGY RUNES (3.618.0, A4 and C5 of block 37; Graham's R9):
  // "Activate Command (1 AP) … When active, the weapon inflicts secondary …
  // damage". Command switches one on; it stays on until switched off, which
  // costs nothing. Until now they were always on.
  ...Object.fromEntries(Object.entries(ENERGY_RUNES).map(([key, energy]) => [key, {
    label: key[0].toUpperCase() + key.slice(1),
    on: ["weapon"],
    verb: "Activate",
    state: energyRuneState(key),
    usesPerDay: () => Infinity,
    describe: (tier) => `While active, each hit deals the rune's secondary ${energy} damage${tier >= 2 ? `, and a critical strike also opens a secondary critical at ${tier >= 3 ? "-20" : "-40"}` : ""}. Command (1 AP) to activate; switching it off is free.`,
    effects: {},
    apCost: 1,
    energy
  }]))
});

/**
 * The activated runes on an item, with their tier and what they need.
 *
 * @returns {Array<{key, label, verb, tier, state, usesPerDay, description}>}
 */
export function runeActionsFor(item) {
  const kind = runeKindOf(item);
  if (!kind) return [];
  const catalogueKind = kind === "shield" ? "shield" : kind;
  const out = [];
  for (const chosen of fieldToRunes(catalogueKind, item?.system?.runes ?? "")) {
    // A REGISTERED RUNE'S OWN BUTTON (3.626.0): Pillars of Faith's Sanctuary,
    // "Activate Engage (1 AP) … For 1 minute, you emanate a 10-foot
    // spiritual sanctuary … The rune then becomes expended and may be
    // restored using Refocus." Declared as data; see runeDeclaredAction.
    // A REGISTERED RUNE ITS WEAPON CANNOT TAKE IS SUPPRESSED TOO (3.673.0;
    // Tranquil Quiver's "any ranged weapon"): no button.
    if (kind === "weapon" && registeredRune(chosen.key) && !runeUsageAllows(chosen.key, weaponUsage(item?.system)).ok) continue;
    const declared = declaredRuneAction(chosen, kind);
    if (declared) { out.push(declared); continue; }
    // A MODULE'S ENERGY RUNE'S COMMAND (3.673.0, C6): Soulful Strike's
    // "Activate Command (1 AP). When active …", the five's switch.
    const energy = declaredEnergyAction(chosen, kind, item);
    if (energy) { out.push(energy); continue; }
    const action = RUNE_ACTIONS[chosen.key];
    if (!action) continue;
    // An Animated rune on a breastplate is a data error worth ignoring
    // rather than rendering a button for. Dreadcarve is the one entry
    // here that legitimately goes on either — "inscribed into armour or
    // a shield" — which is why this asks the entry rather than assuming
    // one kind each.
    if (!action.on.includes(kind)) continue;
    // A RUNE THIS WEAPON CANNOT TAKE IS SUPPRESSED (3.618.0, B10): no button.
    if (kind === "weapon" && !runeUsageAllows(chosen.key, weaponUsage(item?.system)).ok) continue;
    // ALWAYS ON (R9): Flametooth's flames have nothing to switch.
    if (ENERGY_RUNES[chosen.key] && (item?.flags?.[SYSTEM_ID]?.specificItem?.alwaysActive ?? []).includes(chosen.key)) continue;
    const tier = Math.max(1, Math.floor(Number(chosen.tier) || 1));
    out.push({
      key: chosen.key,
      label: `${action.label}${tier > 1 ? ` ${roman(tier)}` : ""}`,
      verb: action.verb,
      tier,
      state: action.state,
      usesPerDay: action.usesPerDay(tier),
      sizeSteps: action.sizeSteps ? action.sizeSteps(tier) : null,
      range: action.range ? action.range(tier) : "",
      description: action.describe(tier),
      effects: action.effects ?? {},
      apCost: Number(action.apCost ?? 0) || 0,
      durationSeconds: Number(action.durationSeconds ?? 0) || 0,
      cooldownSeconds: Number(action.cooldownSeconds ?? 0) || 0,
      // An energy rune's energy, for its card (3.618.1, G1 of the 3.618.0
      // drive: "deals its secondary  damage", the word missing).
      energy: action.energy ?? ""
    });
  }
  return out;
}

/**
 * The Command switch of a registered energy rune (3.673.0, C6), in the shape
 * `runeActionsFor` returns, or null. The five's own handler presses it.
 */
function declaredEnergyAction(chosen, kind, item) {
  if (kind !== "weapon") return null;
  const rune = registeredRune(chosen?.key);
  const energy = rune?.declares?.energy;
  if (!rune || !energy || typeof energy !== "object" || !rune.on.includes("weapon")) return null;
  if (!runeUsageAllows(chosen.key, weaponUsage(item?.system)).ok) return null;
  if ((item?.flags?.[SYSTEM_ID]?.specificItem?.alwaysActive ?? []).includes(chosen.key)) return null;
  const tier = Math.max(1, Math.floor(Number(chosen.tier) || 1));
  const type = String(energy.type ?? "").trim().toLowerCase();
  return {
    key: rune.key,
    label: `${rune.name}${Array.isArray(rune.tiers) && rune.tiers.length > 1 ? ` ${roman(tier)}` : ""}`,
    verb: "Command",
    tier,
    state: energyRuneState(rune.key),
    usesPerDay: Infinity,
    sizeSteps: null,
    range: "",
    description: String(rune.effect ?? ""),
    effects: {},
    apCost: Math.max(0, Math.trunc(Number(energy.apCost ?? 1)) || 0),
    durationSeconds: 0,
    cooldownSeconds: 0,
    energy: type,
    declaredEnergy: true
  };
}

/**
 * The action a registered rune declares, in the shape `runeActionsFor`
 * returns, or null. `declares.action`:
 *
 *   { label?, verb: "Engage", apCost: 1, frequency: "focus"|"daily"|"atWill"|<n per day>,
 *     durationSeconds: 60, cooldownSeconds?: 0, describe: "…",
 *     effect: { auras?: [...], conditionals?: [...], changes?: [...] } }
 *
 * `frequency: "focus"` is the rune's own Focus use — spent by the press,
 * restored by Refocus (combat/refocus-workflow.mjs reads the item's
 * `runeState.focusExpended`).
 */
function declaredRuneAction(chosen, kind) {
  const rune = registeredRune(chosen?.key);
  const raw = rune?.declares?.action;
  if (!rune || !raw || typeof raw !== "object" || !rune.on.includes(kind)) return null;
  const tier = Math.max(1, Math.floor(Number(chosen.tier) || 1));
  const frequency = String(raw.frequency ?? "atWill");
  const perDay = /^\d+$/.test(frequency) ? Number(frequency) : frequency === "daily" ? 1 : Infinity;
  return {
    key: rune.key,
    label: `${rune.name}${Array.isArray(rune.tiers) && rune.tiers.length > 1 ? ` ${roman(tier)}` : ""}`,
    verb: String(raw.verb ?? "Engage"),
    tier,
    state: String(raw.state ?? rune.key),
    usesPerDay: perDay,
    sizeSteps: null,
    range: "",
    description: String(raw.describe ?? rune.effect ?? ""),
    effects: {},
    apCost: Number(raw.apCost ?? 0) || 0,
    durationSeconds: Number(raw.durationSeconds ?? 0) || 0,
    cooldownSeconds: Number(raw.cooldownSeconds ?? 0) || 0,
    energy: "",
    declared: true,
    focus: frequency === "focus",
    effect: raw.effect && typeof raw.effect === "object" ? raw.effect : {}
  };
}

/** Is a declared Focus rune spent until the next Refocus? */
export function runeFocusExpended(item, key) {
  return Boolean(item?.flags?.[SYSTEM_ID]?.runeState?.focusExpended?.[key]);
}

/** Is this item currently in a rune state — animated, glamoured, shifted? */
export function runeStateOf(item, state) {
  return Boolean(item?.flags?.[SYSTEM_ID]?.runeState?.[state]);
}

/**
 * How many uses of an activated rune remain today.
 *
 * Unlimited stays unlimited rather than becoming a very large number, so
 * a caller can say "unlimited" rather than "999 left".
 */
export function usesRemaining(item, action) {
  if (action.usesPerDay === Infinity) return Infinity;
  const spent = Number(item?.flags?.[SYSTEM_ID]?.runeState?.spent?.[action.key] ?? 0);
  return Math.max(0, action.usesPerDay - spent);
}

/**
 * A shield that is currently animated frees the hands it would occupy.
 *
 * "You can't use the shield for reactions such as Shield Block and you
 * still suffer any penalties for using the shield. You do however have
 * both hands free." So the penalty stays, the DB stays, and only the
 * hands and the reaction change — which is why this is a narrow question
 * rather than a general "is it equipped" one.
 */
export function animatedFreesHands(item) {
  if (item?.type !== "shield") return false;
  if (!runeStateOf(item, "animated")) return false;
  return runeActionsFor(item).some((action) => action.effects?.freesHands);
}

/** And it cannot be used to Shield Block while it is doing so. */
export function animatedBlocksShieldBlock(item) {
  if (item?.type !== "shield") return false;
  if (!runeStateOf(item, "animated")) return false;
  return runeActionsFor(item).some((action) => action.effects?.blocksShieldBlock);
}

/** Every equipped shield that is currently animated. */
export function animatedShields(items = []) {
  return (items ?? []).filter(
    (item) => item?.system?.equipped && animatedBlocksShieldBlock(item));
}

/**
 * The weapons a Shifting rune may become.
 *
 * "Any other of the same size" at tier I, "within one size of the
 * original" at II — so the filter is on SIZE, and the original's own
 * form is excluded because shifting into what you already are is not a
 * use of the rune.
 */
export const SIZE_ORDER = Object.freeze([
  "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"
]);

/**
 * A size word, from the word or the one letter the specific weapons print
 * ("Size L") — 3.618.0, B11: Shifting found nothing for an "M" or "L".
 */
export function sizeWord(value) {
  const word = String(value ?? "").trim().toLowerCase();
  if (word.length === 1) return SIZE_ORDER.find((size) => size[0] === word && size !== "diminutive") ?? word;
  return word;
}

export function shiftableForms(candidates = [], { fromSize = "medium", steps = 0, exclude = "" } = {}) {
  const origin = SIZE_ORDER.indexOf(sizeWord(fromSize));
  if (origin < 0) return [];
  return (candidates ?? []).filter((candidate) => {
    if (String(candidate?.name ?? "").toLowerCase() === String(exclude ?? "").toLowerCase()) return false;
    // "becomes another MELEE weapon" (3.618.0, B11): a bow is not a form.
    if (String(candidate?.attackMode ?? "melee").trim().toLowerCase() === "missile") return false;
    // NOR A BITE (3.618.1, G2 of the 3.618.0 drive): the natural attacks sit
    // in the weapons pack as medium melee entries, and a sword became a Claw.
    if (candidate?.natural) return false;
    const index = SIZE_ORDER.indexOf(sizeWord(candidate?.size));
    if (index < 0) return false;
    return Math.abs(index - origin) <= Math.max(0, Math.floor(Number(steps) || 0));
  });
}

/**
 * The effect a declared action with no duration lays (3.673.0, C7): its
 * conditionals, and its strike rider, spent by the next Strike its scope
 * reaches. Pure, so the harness can run it.
 *
 * "BEFORE THE BEGINNING OF YOUR NEXT TURN" (3.673.0, C7b; Inner Tempest's
 * Mindful: "Add your Wisdom ability score to your next attack roll with the
 * weapon, which must be made before the beginning of your next turn"). An
 * action whose effect declares `untilTurnStart: true` is handed the round it
 * ends in (`extra.expiresRound`, the current round + 1 in a running combat),
 * and the effect carries it as `conditionExpiresRound`: the start-of-turn
 * sweep (effect-application-workflow `expireTimedConditions`) lifts it at the
 * wielder's next turn. Out of combat no round is given, and the offer waits
 * for the next attack as the other next-Strike effects do.
 */
export function nextStrikeEffect(item, action, extra = {}) {
  const rider = action.effect?.strikeRider && typeof action.effect.strikeRider === "object"
    ? { ...action.effect.strikeRider, label: action.effect.strikeRider.label ?? action.label, once: true }
    : null;
  const ends = action.effect?.untilTurnStart === true && Number.isFinite(Number(extra.expiresRound)) && extra.expiresRound !== null
    ? Math.trunc(Number(extra.expiresRound)) : null;
  return {
    name: `${item.name} — ${action.label}`,
    img: item.img || "icons/svg/target.svg",
    origin: item.uuid,
    changes: [],
    flags: { [SYSTEM_ID]: {
      ...(extra.conditionals?.length ? { conditionals: extra.conditionals } : {}),
      ...(rider ? { strikeRider: rider } : {}),
      ...(ends !== null ? { conditionExpiresRound: ends } : {})
    } }
  };
}

