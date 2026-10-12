/**
 * ELIXIRS AND HERBS — what using one does (Chapter 6, pages 178-180).
 *
 * NEW at 3.577.0. Pure; no Foundry. The Foundry side is `useAlchemical` in
 * consumable-use-workflow.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BLOCK-17 AUDIT (D7, D8): EVERY ELIXIR AND HERB WAS TEXT. Using one
 * posted its description and removed it, for no AP at all, whatever its
 * printed activation. A Health elixir healed nobody; an Antitoxin gave no
 * bonus to anything; a Speed elixir left your Speed where it was. And the
 * "Higher Level" ladder each one prints was recorded and repriced the item
 * when it was crafted at a higher level — and read by nothing when it was
 * drunk.
 *
 * Graham's R7 (20 September 2026): build them, with the effects the spell
 * engine already applies, scaled by the item's own level; AP from the
 * printed activation; fed to a creature within reach if one is targeted.
 *
 * WHERE THE FACTS LIVE. On the items, as `flags.trg-prime.consumable.effect`
 * set in the pack by tools/data-fixes.json:
 *
 *   effects   rows in the spell engine's own shape (heal, conditional,
 *             conditionRelief, bonus, marker), applied by
 *             `applySpellEffects` — one resolver, not a second
 *   scale     the Higher Level ladder, as paths into that object
 *   plan      "speed": the one item whose extra levels buy a choice
 *   modes     a choice made when using it (Angelstep: raw or pigment)
 *   pending   a bonus that waits for a roll (pending-modifiers.mjs)
 *   resave    "disease" / "poison": offer a new save now
 *   wake      Smelling Salts
 *   note      what is left to the table, said on the card
 *
 * WHY NOT `castSpell`. Drinking an elixir is not casting a spell. The spell
 * path refuses a raging character outright, measures every targeted token
 * against a range of "self", and charges the synthetic spell's 2 AP. None
 * of that is true of a bottle. So an alchemical item is resolved through
 * `applySpellEffects` directly, and the checks that ARE true of it — the
 * AP, the time, who you can feed — are made here.
 */

import { scaleAmount } from "./alchemical.mjs";
import { hasCreatureTrait } from "./creature-traits.mjs";
import { castTimeAP, castTimeApCost, castTimeIsCombatLegal } from "./magic/cast-time.mjs";

const SYSTEM_ID = "trg-prime";

/* ───────────────────────────── activation ───────────────────────────── */

/**
 * The time an activation line costs, or null if it prints none.
 *
 * "Interact (1 AP)" → "1 AP"; "Interact, Manipulate (3 AP)" → "3 AP";
 * "Interact (1 minute)" → "1 minute"; "Command (Free)" → "Free".
 *
 * @param {string} activation the item's `system.activation`
 * @returns {string|null}
 */
export function activationCastTime(activation) {
  const match = /\(([^)]+)\)\s*$/.exec(String(activation ?? "").trim());
  return match ? match[1].trim() : null;
}

/**
 * What using this item costs, and whether it can be done in an encounter.
 *
 * @param {string} activation
 * @param {{inCombat?: boolean}} [context]
 * @returns {{time: string|null, ap: number, allowed: boolean, reason: string}}
 */
export function activationCost(activation, { inCombat = false } = {}) {
  const time = activationCastTime(activation);
  if (!time) return { time: null, ap: 0, allowed: true, reason: "" };
  if (/^free$/i.test(time)) return { time, ap: 0, allowed: true, reason: "" };
  const combatLegal = castTimeIsCombatLegal(time);
  if (inCombat && !combatLegal) {
    const ap = castTimeAP(time);
    return {
      time, ap: 0, allowed: false,
      reason: `takes ${time}${ap !== null ? ` (about ${ap} AP)` : ""} — too long to do during an encounter`
    };
  }
  return { time, ap: inCombat ? castTimeApCost(time) : 0, allowed: true, reason: "" };
}

/* ───────────────────────────── the effect ───────────────────────────── */

/** The authored effect block, or null. */
export function alchemicalEffectOf(item) {
  const effect = item?.flags?.[SYSTEM_ID]?.consumable?.effect;
  return effect && typeof effect === "object" ? effect : null;
}

/** An alchemical item (as opposed to a potion, scroll or wand). */
export function isAlchemicalConsumable(item) {
  return item?.type === "consumable" && Boolean(item?.flags?.[SYSTEM_ID]?.alchemical);
}

/**
 * How many steps up an item's own ladder it has been crafted.
 *
 * @param {object} item
 * @param {number} perLevels
 * @returns {number}
 */
function levelSteps(item, perLevels) {
  const per = Math.max(0, Math.floor(Number(perLevels) || 0));
  if (!per) return 0;
  const base = Number(item?.flags?.[SYSTEM_ID]?.alchemical?.baseLevel ?? item?.system?.itemLevel ?? 1);
  const level = Number(item?.system?.itemLevel ?? base);
  return Math.floor(Math.max(0, level - base) / per);
}

/**
 * Add `times` lots of `add` to a value that may be dice, a number or a
 * duration.
 *
 * "For every additional 2 levels of the elixir, the amount healed
 * increases by 1d6+2" — so 1d6+2, twice over, is 3d6+6: the dice and the
 * flat part both multiply. `scaleAmount` in alchemical.mjs already does
 * exactly that for a bomb, and is reused rather than restated.
 */
function addSteps(value, add, times) {
  if (!times) return value;
  if (typeof add === "number") return Number(value ?? 0) + add * times;
  const base = String(value ?? "").replace(/\s+/g, "");
  const extra = String(add ?? "").replace(/\s+/g, "");
  if (base === extra) return scaleAmount(base, times + 1);
  return `${base} + ${scaleAmount(extra, times)}`;
}

/** Read and write a dotted path ("effects.0.grants.0.value"). */
function getPath(obj, path) {
  return String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = String(path).split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => o?.[k], obj);
  if (target && typeof target === "object") target[last] = value;
}

/**
 * A duration, lengthened: "1 hour" and one more hour is "2 hours".
 *
 * @param {string} duration
 * @param {number} add
 * @param {string} unit
 * @param {number|null} max the most the ladder allows, in `unit`s
 */
function lengthen(duration, add, unit, max) {
  const match = /^(\d+)\s*(\w+)/.exec(String(duration ?? "").trim());
  const now = match ? Number(match[1]) : 0;
  let total = now + add;
  if (Number.isFinite(max) && max > 0) total = Math.min(total, max);
  const word = String(unit || match?.[2] || "hour").replace(/s$/i, "");
  return `${total} ${word}${total === 1 ? "" : "s"}`;
}

/* ─────────────────────── Speed: a choice of ladder ─────────────────────── */

/**
 * SPEED (page 179) is the one elixir whose extra levels buy a CHOICE:
 *
 *   "The level of the elixir may be increased by 4 levels which increases
 *    the bonus by +5 (max +20). It may also be increased by 1 level to
 *    increase the duration to 10 minutes or by 4 levels to increase the
 *    duration to 1 hour."
 *
 * So the crafter picks a bonus and a duration, and the level is what they
 * cost. Every legal pair, cheapest first.
 */
const SPEED_DURATIONS = Object.freeze([
  Object.freeze({ duration: "1 minute", levels: 0 }),
  Object.freeze({ duration: "10 minutes", levels: 1 }),
  Object.freeze({ duration: "1 hour", levels: 4 })
]);
const SPEED_BONUS = Object.freeze({ base: 5, step: 5, levels: 4, max: 20 });

/**
 * @param {number} baseLevel the elixir's base level (2)
 * @returns {Array<{bonus: number, duration: string, level: number}>}
 */
export function speedPlans(baseLevel = 2) {
  const out = [];
  const steps = Math.floor((SPEED_BONUS.max - SPEED_BONUS.base) / SPEED_BONUS.step);
  for (let b = 0; b <= steps; b++) {
    for (const d of SPEED_DURATIONS) {
      const level = Number(baseLevel) + b * SPEED_BONUS.levels + d.levels;
      if (level > 20) continue;
      out.push({ bonus: SPEED_BONUS.base + b * SPEED_BONUS.step, duration: d.duration, level });
    }
  }
  return out.sort((a, c) => a.level - c.level || a.bonus - c.bonus);
}

/**
 * The plan a Speed elixir was made to. The crafter's own choice when the
 * level still pays for it; otherwise (a level typed onto the sheet) the
 * biggest bonus the level buys, and the longest duration the rest buys.
 * That fallback is a READING, recorded in the release notes.
 */
export function speedPlanFor(item) {
  const base = Number(item?.flags?.[SYSTEM_ID]?.alchemical?.baseLevel ?? 2);
  const level = Number(item?.system?.itemLevel ?? base);
  const stored = item?.flags?.[SYSTEM_ID]?.alchemical?.plan;
  const plans = speedPlans(base);
  if (stored && plans.some((p) => p.level === level && p.bonus === stored.bonus && p.duration === stored.duration)) {
    return { bonus: stored.bonus, duration: stored.duration, level };
  }
  const affordable = plans.filter((p) => p.level <= level);
  const best = affordable.sort((a, c) => c.bonus - a.bonus
    || SPEED_DURATIONS.findIndex((d) => d.duration === c.duration)
      - SPEED_DURATIONS.findIndex((d) => d.duration === a.duration))[0];
  return best ?? { bonus: SPEED_BONUS.base, duration: "1 minute", level: base };
}

/* ─────────────────────────── the scaled effect ──────────────────────── */

/**
 * The item's effect at the level it was made, and for the use chosen.
 *
 * @param {object} item
 * @param {object} [options]
 * @param {string} [options.mode] the key of the chosen mode, if it has modes
 * @param {boolean} [options.fed] fed to another creature, not drunk
 * @returns {{label, duration, effects, pending, resave, wake, note, rollDuration}|null}
 */
export function scaledAlchemicalEffect(item, { mode = "", fed = false } = {}) {
  const authored = alchemicalEffectOf(item);
  if (!authored) return null;
  const effect = JSON.parse(JSON.stringify(authored));

  let body = effect;
  if (Array.isArray(effect.modes) && effect.modes.length) {
    body = effect.modes.find((m) => m.key === mode) ?? effect.modes[0];
  }

  const out = {
    label: String(effect.label ?? item?.name ?? ""),
    duration: String(body.duration ?? effect.duration ?? ""),
    effects: Array.isArray(body.effects) ? body.effects : [],
    pending: body.pending ?? effect.pending ?? null,
    resave: String(body.resave ?? effect.resave ?? ""),
    wake: Boolean(body.wake ?? effect.wake),
    note: String(body.note ?? effect.note ?? ""),
    rollDuration: body.durationRoll ? { formula: String(body.durationRoll), unit: String(body.durationUnit ?? "hours") } : null,
    // A SAVE AGAINST WHAT YOU TOOK (3.578.0; Reglen taken unprepared:
    // "you must make a Fortitude saving throw or gain the sickened 2
    // condition"). The effects land only on a failure.
    selfSave: body.selfSave ?? effect.selfSave ?? null,
    // THE CREATURES AROUND YOU (3.578.0; Nightsage: "each corporeal undead
    // creature within a 5-foot radius"). See `nearbyRecipient`.
    nearby: body.nearby ?? effect.nearby ?? null
  };

  for (const spec of Array.isArray(effect.scale) ? effect.scale : []) {
    const times = levelSteps(item, spec.perLevels);
    if (!times) continue;
    if (spec.path === "duration") {
      out.duration = lengthen(out.duration, Number(spec.add) * times, spec.unit, Number(spec.max));
      continue;
    }
    const holder = { effects: out.effects };
    const before = getPath(holder, spec.path);
    if (before === undefined) continue;
    let after = addSteps(before, spec.add, times);
    if (typeof after === "number" && Number.isFinite(Number(spec.max))) after = Math.min(after, Number(spec.max));
    setPath(holder, spec.path, after);
  }

  if (effect.plan === "speed") {
    const plan = speedPlanFor(item);
    out.duration = plan.duration;
    for (const row of out.effects) if (row.kind === "bonus") row.value = plan.bonus;
  }

  // WHO IT IS FOR. "You can feed an elixir only to a creature within reach"
  // — the targeted creature, when there is one; otherwise you.
  // AN ITEM THAT REACHES THE CREATURES AROUND YOU goes to them, not to you.
  for (const row of out.effects) row.target = fed || out.nearby ? "targets" : "self";
  return out;
}

/**
 * Is this creature one an item's `nearby` reaches? Nightsage (page 181):
 * "each corporeal undead creature within a 5-foot radius" — a creature
 * trait it must have, and one it must not ("corporeal" is the absence of
 * Incorporeal). The distance is the workflow's, measured on the canvas.
 *
 * @param {object} targetSystem
 * @param {{trait?: string, notTrait?: string}} nearby
 * @returns {boolean}
 */
export function nearbyRecipient(targetSystem, nearby) {
  if (!nearby || typeof nearby !== "object") return false;
  const want = String(nearby.trait ?? "").trim();
  const not = String(nearby.notTrait ?? "").trim();
  if (want && !hasCreatureTrait(targetSystem, want)) return false;
  if (not && hasCreatureTrait(targetSystem, not)) return false;
  return true;
}

/**
 * The Higher Level line a crafter is shown, at a level: what this item
 * does there, in the numbers it will actually use.
 *
 * @param {object} item
 * @param {number} level
 * @returns {string}
 */
export function alchemicalLevelSummary(item, level) {
  const at = { ...item, system: { ...(item?.system ?? {}), itemLevel: level } };
  const scaled = scaledAlchemicalEffect(at);
  if (!scaled) return "";
  const parts = [];
  for (const row of scaled.effects) {
    if (row.kind === "heal") parts.push(`heals ${row.formula}`);
    else if (row.kind === "conditionRelief") parts.push(`${row.condition} −${row.amount}`);
    else if (row.kind === "bonus") parts.push(`+${row.value} ${row.slot}`);
    else if (row.kind === "conditional") {
      for (const g of row.grants ?? []) parts.push(g.kind === "advantage" ? "advantage" : `+${g.value} ${g.bonusType ?? g.type ?? ""}`.trim());
    }
  }
  if (scaled.duration) parts.push(`for ${scaled.duration}`);
  return parts.join(", ");
}

/* ──────────────────────────── who drinks it ─────────────────────────── */

/** Reach for feeding: "a creature within reach". */
const FEED_REACH_FEET = 5;

/**
 * Drink it, or feed it to the targeted creature?
 *
 * @param {object} args
 * @param {number} args.targetCount targeted tokens
 * @param {boolean} [args.targetIsSelf] the one target is the user's own token
 * @param {number|null} [args.distance] feet to that target, if measurable
 * @param {number} [args.reach]
 * @returns {{mode: "self"|"fed"|"refuse", reason: string}}
 */
export function recipientMode({ targetCount = 0, targetIsSelf = false, distance = null, reach = FEED_REACH_FEET } = {}) {
  if (!targetCount || targetIsSelf && targetCount === 1) return { mode: "self", reason: "" };
  if (targetCount > 1) return { mode: "refuse", reason: "target one creature to feed it, or none to use it yourself" };
  if (Number.isFinite(distance) && distance > Math.max(FEED_REACH_FEET, Number(reach) || 0)) {
    return { mode: "refuse", reason: `that creature is ${distance} ft away — you can only feed a creature within reach` };
  }
  return { mode: "fed", reason: "" };
}

/* ─────────────────────────── Fist of Rock ───────────────────────────── */

/** What stone fists hit with. */
export const FIST_OF_ROCK = Object.freeze({ damage: "1d6", damageType: "bludgeoning" });

/**
 * FIST OF ROCK (page 179): "Your fists become hard as stone. For 1 hour,
 * your fists deal 1d6 base bludgeoning damage and lose the nonlethal
 * trait." The fists are the Unarmed Strike — the natural, unarmed-category
 * attack whose damage is subdual (the table's "N"; erratum E11 calls it
 * "nonlethal") — and not a Bite or a gauntlet.
 *
 * @param {object} weaponSystem
 * @param {boolean} active the actor carries the Fist of Rock marker
 * @returns {{damage: string, damageType: string}|null}
 */
export function stoneFistProfile(weaponSystem, active) {
  if (!active) return null;
  const s = weaponSystem ?? {};
  if (!s.natural) return null;
  if (String(s.category ?? "").trim().toLowerCase() !== "unarmed") return null;
  if (String(s.damageType ?? "").trim().toLowerCase() !== "subdual") return null;
  return { ...FIST_OF_ROCK };
}

/* ────────────────────────── Smelling Salts ──────────────────────────── */

/**
 * The actor flag that keeps a dying creature conscious (page 179): "If
 * exposed to smelling salts while dying, you immediately become conscious,
 * but must still make dying checks each round." Read by `prepareConditions`
 * — Dying still counts; the Unconscious it would include does not.
 *
 * IT NAMES THE DYING EFFECT IT WOKE, rather than being a plain true, so it
 * ends with that Dying without anything having to clear it: when the
 * creature stabilises the effect is deleted, and the next time it drops
 * the new Dying is a new effect the flag does not name.
 */
export const CONSCIOUS_WHILE_DYING_FLAG = "consciousWhileDying";

/**
 * The conditions Dying should NOT include for this actor right now.
 *
 * @param {object} actorFlags `actor.flags["trg-prime"]`
 * @param {string|null} dyingEffectId the id of the live Dying effect
 * @returns {string[]}
 */
export function withheldIncludes(actorFlags, dyingEffectId) {
  const woke = actorFlags?.[CONSCIOUS_WHILE_DYING_FLAG];
  return dyingEffectId && woke && woke === dyingEffectId ? ["unconscious"] : [];
}

/* ───────────────────────────── Angelstep ────────────────────────────── */

/**
 * ANGELSTEP PIGMENT (page 180): "+4-item bonus on its next check to
 * recover" — the Dying Check (documents/combat.mjs), which spends the
 * marker the pigment left.
 */
export const ANGELSTEP_DYING_BONUS = 4;
