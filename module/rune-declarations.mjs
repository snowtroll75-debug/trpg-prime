/**
 * WHAT A REGISTERED RUNE DECLARES (3.626.0). Pure; no Foundry.
 *
 * The core's runes are table-coded by key — NUMERIC_RUNES, EVENT_RUNES,
 * RUNE_ACTIONS, DAMAGE_RUNES — because fifteen hand-typed runes are a
 * table. A companion module's runes (Pillars of Faith, Chapter 11: eight
 * for armour and shields, seven for weapons) cannot be rows the system
 * knows by name, so a registered rune carries `declares`: the same
 * mechanisms, as data, read here and handed to the places that already
 * apply them. The keys, each the shape of something the system does:
 *
 *   bonuses:      [{ target, type, value }]           flat typed bonuses while worn
 *   conditionals: [{ kind, value, type, label, scope, when, valueFrom? }]
 *                                                      scoped offers (conditionals.mjs)
 *   sense:        { category, modality, fixedFeet, name, finds }
 *                                                      a sense while worn (senses.mjs)
 *   strikeRider:  { dice|tiers[].dice, damageType, targetTypes?, onCritical?,
 *                   oncePerRound?, spendOn? }          secondary damage (strike-riders.mjs)
 *   ghostTouch:   true                                  strikes incorporeal creatures
 *   afterStrike:  { save, dc: "levelDC", onCritical?, oncePerRound?, targetTypes?,
 *                   outcomes: { critical, success, failure, fumble },
 *                   conditions?: { success: [{key, value, duration}], ... } }
 *                                                      a save the struck creature makes
 *   onCritical:   { text }                              a card line on a critical hit
 *   saveReroll:   { degrees, traits?, radius?, frequency, ally: true }
 *                                                      a reaction reroll (Intercession)
 *   onHealed:     { frequency, steps: [{ minPP, conditions }] }
 *                                                      relief after a Healing spell (Last Vigil)
 *   soulDrainReduce: { amount, potencyIII?, frequency }   Soul Ward
 *   action:       { key, label, apCost, frequency, effect: { name, duration, auras?,
 *                   conditionals?, bonuses? } }       an Activate button (Sanctuary)
 *   stabiliseAtZero: true                               Merciful
 *   healingRider: { … }                                 see magic/healing-riders.mjs
 *
 * A declaration a rune makes is read ONLY while the item counts
 * (`runesCountFor`): equipped, and not runed clothing under body armour.
 */

import { fieldToRunes } from "./rune-catalogue.mjs";
import { registeredRune } from "./module-api.mjs";
import { runeKindOf, runesCountFor } from "./rune-bearing.mjs";
import { roman } from "./runes.mjs";
import { runeUsageAllows, weaponUsage } from "./weapon-rune-usage.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The registered runes inscribed on one item, with their tier and the
 * tier's own row (dice, level, price) where the rune has a ladder.
 * @returns {Array<{key, name, tier, label, rune, row, declares}>}
 */
function declaredRunesOn(item) {
  const kind = runeKindOf(item);
  if (!kind) return [];
  const out = [];
  for (const chosen of fieldToRunes(kind, item?.system?.runes ?? "")) {
    const rune = registeredRune(chosen.key);
    if (!rune) continue;
    // ON A WEAPON ITS USAGE LINE REFUSES, IT DECLARES NOTHING (3.673.0).
    if (kind === "weapon" && !runeUsageAllows(chosen.key, weaponUsage(item?.system)).ok) continue;
    const tier = Math.max(1, Math.floor(Number(chosen.tier) || 1));
    const row = Array.isArray(rune.tiers) ? (rune.tiers[tier - 1] ?? rune.tiers[rune.tiers.length - 1] ?? null) : null;
    out.push({
      key: rune.key, name: rune.name, tier,
      label: `${rune.name}${Array.isArray(rune.tiers) && rune.tiers.length > 1 ? ` ${roman(tier)}` : ""}`,
      rune, row, declares: rune.declares ?? {}
    });
  }
  return out;
}

/** The same, only for an item that counts right now. */
export function activeDeclaredRunesOn(item, items = []) {
  return runesCountFor(item, items) ? declaredRunesOn(item) : [];
}

/** Every active declared rune across an actor's items, each with its item. */
function activeDeclaredRunes(items = []) {
  const out = [];
  for (const item of items ?? []) {
    for (const entry of activeDeclaredRunesOn(item, items)) out.push({ ...entry, item });
  }
  return out;
}

/** The item's potency tier (the numeral written), for Soul Ward's "Potency III or greater". */
function potencyTierOf(item) {
  const kind = runeKindOf(item);
  if (!kind) return 0;
  return fieldToRunes(kind, item?.system?.runes ?? "").find((r) => r.key === "potency")?.tier ?? 0;
}

/**
 * The strike-rider spec a weapon's registered runes declare, in the
 * shape strike-riders.mjs normalises — the dice from the tier's row when
 * the rune has a ladder (Requiem I/II/III), bound to this weapon by name
 * and keyed by rune and item so the once-per-round marker is the
 * weapon's own.
 */
export function runeStrikeRiderSpecs(weapon) {
  const out = [];
  for (const entry of declaredRunesOn(weapon)) {
    const raw = entry.declares?.strikeRider;
    if (!raw || typeof raw !== "object") continue;
    const dice = String(entry.row?.dice ?? raw.dice ?? "").trim();
    if (!dice) continue;
    out.push({
      ...raw,
      dice,
      label: raw.label ?? entry.label,
      weaponNames: [String(weapon?.name ?? "")],
      id: `rune:${entry.key}:${weapon?.id ?? weapon?._id ?? ""}`
    });
  }
  return out;
}

/** Does a weapon's registered rune let it strike incorporeal creatures? */
export function runeGhostTouch(weapon) {
  return declaredRunesOn(weapon).some((e) => e.declares?.ghostTouch === true);
}

/** The after-strike saves a weapon's runes declare. */
export function runeAfterStrikes(weapon) {
  return declaredRunesOn(weapon)
    .filter((e) => e.declares?.afterStrike && typeof e.declares.afterStrike === "object")
    .map((e) => ({ key: e.key, label: e.label, ...e.declares.afterStrike }));
}

/** The critical-hit card lines a weapon's runes declare. */
export function runeCriticalLines(weapon) {
  return declaredRunesOn(weapon)
    .filter((e) => typeof e.declares?.onCritical?.text === "string" && e.declares.onCritical.text.trim())
    .map((e) => `${e.label}: ${e.declares.onCritical.text.trim()}`);
}

/**
 * A DECLARED ROW'S VALUE BY THE RUNE'S TIER (3.673.0, C12; Inner Tempest's
 * Centred I–III: "You gain an item bonus to Refocus (Mental Focus) checks
 * based upon the level of the rune … The bonus is +1 / +2 / +3"). A bonus or
 * conditional declaring `value: [1, 2, 3]` takes the inscribed tier's number,
 * the last one for a tier beyond the list. Any other row is returned as it
 * came. Pure.
 */
export function tierValued(row, tier = 1) {
  if (!row || typeof row !== "object" || !Array.isArray(row.value)) return row;
  if (!row.value.length) return { ...row, value: 0 };
  const at = Math.min(Math.max(1, Math.floor(Number(tier) || 1)), row.value.length) - 1;
  return { ...row, value: row.value[at] };
}

/** The typed bonuses and scoped conditionals an active rune-bearer's runes declare. */
export function runeDeclaredBonuses(item, items = []) {
  const bonuses = [];
  const conditionals = [];
  // THE WEARER'S CLASS (3.673.0, C3): "+2 … increases to +3 if you are a
  // Disciple or Mystic". See `classValued`.
  const classes = classNamesOf(items);
  for (const entry of activeDeclaredRunesOn(item, items)) {
    const source = `${item?.name ?? "item"} (${entry.label})`;
    for (const raw of Array.isArray(entry.declares?.bonuses) ? entry.declares.bonuses : []) {
      const b = classValued(tierValued(raw, entry.tier), classes);
      if (!b?.target) continue;
      bonuses.push({ target: String(b.target), entry: { type: String(b.type ?? "item"), value: Number(b.value) || 0, source, label: source } });
    }
    for (const raw of Array.isArray(entry.declares?.conditionals) ? entry.declares.conditionals : []) {
      const c = classValued(tierValued(raw, entry.tier), classes);
      if (!c || typeof c !== "object") continue;
      conditionals.push({ ...c, label: c.label ? `${source} — ${c.label}` : source });
    }
  }
  return { bonuses, conditionals };
}

/** The senses an actor's active runes grant: [{ sense, source }]. */
export function runeSenses(items = []) {
  return activeDeclaredRunes(items)
    .filter((e) => e.declares?.sense && typeof e.declares.sense === "object")
    .map((e) => ({ sense: { name: e.name, ...e.declares.sense }, source: `${e.item?.name ?? ""} (${e.label})` }));
}

/**
 * A rune's use markers, kept on the ITEM: `flags.trg-prime.runeUsedToday`
 * ({ key: true }, cleared by daily preparation beside the wondrous
 * items' marker) and `flags.trg-prime.runeUsedAt` ({ key: world seconds }
 * for "1/minute" and "once per round" clocks).
 */
export const RUNE_USED_TODAY_FLAG = "runeUsedToday";
const RUNE_USED_AT_FLAG = "runeUsedAt";

const FREQUENCY_SECONDS = Object.freeze({ minute: 60, "1/minute": 60, round: 6, "1/round": 6 });
const isDaily = (f) => ["daily", "1/day", "day"].includes(String(f ?? "daily").trim().toLowerCase());
const isAtWill = (f) => ["atwill", "at will", ""].includes(String(f ?? "").trim().toLowerCase());

/**
 * May a rune with this frequency fire now?
 * @param {{usedToday?: object, usedAt?: object}} markers the item's two maps
 */
export function runeFrequencyAllows(markers, key, frequency, now = 0) {
  if (isAtWill(frequency)) return true;
  if (isDaily(frequency)) return !markers?.usedToday?.[key];
  const span = FREQUENCY_SECONDS[String(frequency ?? "").trim().toLowerCase()];
  if (!span) return true;
  const stamp = markers?.usedAt?.[key];
  if (stamp === undefined || stamp === null) return true;
  return Number(now) - Number(stamp) >= span;
}

/** The flag updates that record a rune firing now, keyed by flag name. */
export function runeUseUpdates(markers, key, frequency, now = 0) {
  if (isAtWill(frequency)) return {};
  if (isDaily(frequency)) return { [RUNE_USED_TODAY_FLAG]: { ...(markers?.usedToday ?? {}), [key]: true } };
  if (!FREQUENCY_SECONDS[String(frequency ?? "").trim().toLowerCase()]) return {};
  return { [RUNE_USED_AT_FLAG]: { ...(markers?.usedAt ?? {}), [key]: Number(now) || 0 } };
}

/** The two maps off an item. */
export function runeMarkersOf(item) {
  return {
    usedToday: item?.flags?.["trg-prime"]?.[RUNE_USED_TODAY_FLAG] ?? {},
    usedAt: item?.flags?.["trg-prime"]?.[RUNE_USED_AT_FLAG] ?? {}
  };
}

/* ───────────── After-strike saves (Banishing, Soulchain) ───────────── */

const DEGREE_ORDER = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);
const LADDER_FALLBACK = Object.freeze({ heroic: "critical", partial: "failure", blunder: "fumble" });

/**
 * What an after-strike declaration says for a degree: the printed line and
 * the conditions to apply. A degree the ladder leaves blank reads its
 * neighbour (Heroic → Critical, Partial → Failure, Blunder → Fumble), the
 * reading every printed four-step ladder in the book takes.
 */
export function afterStrikeOutcome(spec, degree) {
  const key = String(degree ?? "").trim().toLowerCase();
  const pick = (table) => {
    if (!table || typeof table !== "object") return null;
    if (table[key] !== undefined) return table[key];
    const alt = LADDER_FALLBACK[key];
    return alt && table[alt] !== undefined ? table[alt] : null;
  };
  const text = pick(spec?.outcomes);
  const conditions = pick(spec?.conditions);
  return {
    degree: DEGREE_ORDER.includes(key) ? key : "failure",
    text: typeof text === "string" ? text : "",
    conditions: Array.isArray(conditions) ? conditions.filter((c) => c && typeof c === "object" && c.key) : []
  };
}

/** The marker key an after-strike uses in the actor's per-round map. */
export function afterStrikeMarkerKey(spec, weapon) {
  return `after:${spec?.key ?? ""}:${weapon?.id ?? weapon?._id ?? ""}`;
}

/** Does this after-strike fire on this hit? */
export function afterStrikeFires(spec, { critical = false, used = {}, marker = "", targetTypes = [], targetTraits = [] } = {}) {
  if (!spec) return false;
  if (spec.onCritical && !critical) return false;
  if (spec.oncePerRound && used?.[marker]) return false;
  const types = (spec.targetTypes ?? []).map((t) => String(t).toLowerCase());
  const traits = (spec.targetTraits ?? []).map((t) => String(t).toLowerCase());
  if (types.length || traits.length) {
    const have = new Set([...(targetTypes ?? []), ...(targetTraits ?? [])].map((t) => String(t).toLowerCase()));
    if (!types.some((t) => have.has(t)) && !traits.some((t) => have.has(t))) return false;
  }
  return true;
}

/* ───────────────────────── Merciful ───────────────────────── */

/** Does a weapon's rune offer to leave a felled creature Stable? */
export function runeStabilisesAtZero(weapon) {
  return declaredRunesOn(weapon).some((e) => e.declares?.stabiliseAtZero === true);
}

/**
 * Whether Merciful has anything to do with this damage result: the blow
 * took a creature that uses the Dying rules to 0 HP or killed it outright
 * through excess. A knock-out (Subdual) and a creature with no Death
 * State are the rune's own exclusions.
 */
export function mercifulApplies(resultCase, { noDeathState = false } = {}) {
  if (noDeathState) return false;
  return ["reached-zero", "dropped-below-zero", "massive-damage-death", "already-dying-escalated", "already-dying-dead"].includes(String(resultCase ?? ""));
}

/* ───────────────── Save rerolls from items (Intercession, a talisman) ───────────────── */

/**
 * The save-reroll an ITEM offers (3.626.0): a registered shield rune that
 * declares one (Pillars of Faith's Intercession — "An ally within 10 feet
 * fails a saving throw against Fear, possession or an effect with the
 * Soul trait … may reroll"), or a consumable carrying
 * `flags.trg-prime.consumable.saveReroll` (Soulguard Talisman — "You fail
 * a saving throw against possession, Soul Drain or an effect with the
 * Soul trait. Break the talisman. You reroll"). Normalised to one shape.
 *
 * @returns {Array<{source: "rune"|"consumable", key, label, degrees, traits, radius, ally, frequency, destroy}>}
 */
export function itemSaveRerolls(item, items = []) {
  const out = [];
  const norm = (raw, base) => {
    if (!raw || typeof raw !== "object") return null;
    const degrees = (Array.isArray(raw.degrees) ? raw.degrees : ["partial", "failure", "fumble", "blunder"]).map((d) => String(d).toLowerCase());
    return {
      ...base,
      degrees,
      traits: (Array.isArray(raw.traits) ? raw.traits : []).map((t) => String(t).toLowerCase()),
      radius: Math.max(0, Number(raw.radius) || 0),
      ally: raw.ally === true,
      frequency: String(raw.frequency ?? "daily"),
      destroy: raw.destroy === true,
      bonus: Math.max(0, Math.trunc(Number(raw.bonus) || 0))
    };
  };
  for (const entry of activeDeclaredRunesOn(item, items)) {
    const spec = norm(entry.declares?.saveReroll, { source: "rune", key: entry.key, label: `${item?.name ?? ""} (${entry.label})` });
    if (spec) out.push(spec);
  }
  const consumable = item?.flags?.["trg-prime"]?.consumable?.saveReroll;
  if (consumable && item?.system?.equipped) {
    const spec = norm(consumable, { source: "consumable", key: "consumable", label: String(item?.name ?? "") });
    if (spec) out.push({ ...spec, destroy: true });
  }
  return out;
}

/* ───────────────────────── Soul Ward ───────────────────────── */

/**
 * How much Soul Drain a creature's armour rune turns aside (3.626.0):
 * "Reduce the amount of Soul Drain gained by 5, to a minimum of 0. If the
 * armour possesses a Potency III or greater rune, reduce the Soul Drain
 * by 10 instead." Once a minute.
 * @returns {{reduce: number, key: string, label: string, item: object, frequency: string}|null}
 */
export function soulDrainWard(items = [], now = 0) {
  for (const entry of activeDeclaredRunes(items)) {
    const spec = entry.declares?.soulDrainReduce;
    if (!spec || typeof spec !== "object") continue;
    const frequency = String(spec.frequency ?? "1/minute");
    if (!runeFrequencyAllows(runeMarkersOf(entry.item), entry.key, frequency, now)) continue;
    const potency = potencyTierOf(entry.item);
    const reduce = potency >= 3 && Number(spec.potencyIII) > 0 ? Math.trunc(Number(spec.potencyIII)) : Math.trunc(Number(spec.amount) || 0);
    if (reduce > 0) return { reduce, key: entry.key, label: `${entry.item?.name ?? ""} (${entry.label})`, item: entry.item, frequency };
  }
  return null;
}

/* ───────────── Auras a declared action emits while it runs ───────────── */

/**
 * The auras a registered rune's action declares, emitted from the item
 * while the action's state is on (3.626.0) — Sanctuary's "For 1 minute,
 * you emanate a 10-foot spiritual sanctuary". Dreadcarve's shape
 * (codex-runes.mjs): the item's id joins the aura id so two runed pieces
 * are two auras. The wearer's own share of the aura is a `conditionals`
 * row on the same action's effect, carried by the timer.
 */
export function declaredRuneAuras(item) {
  if (!item?.system?.equipped) return [];
  const out = [];
  for (const entry of declaredRunesOn(item)) {
    const action = entry.declares?.action;
    if (!action || typeof action !== "object") continue;
    const state = String(action.state ?? entry.key);
    if (!item?.flags?.["trg-prime"]?.runeState?.[state]) continue;
    for (const raw of Array.isArray(action.effect?.auras) ? action.effect.auras : []) {
      if (!raw || typeof raw !== "object") continue;
      out.push({ ...raw, id: `rune-${entry.key}-${item.id ?? "item"}`, name: raw.name ?? entry.label });
    }
  }
  return out;
}

/* ─────────────── Inner Tempest's Chapter 9 runes (3.673.0) ─────────────── */

/** The classes a creature holds, lower-cased, read off its class items. */
export function classNamesOf(items = []) {
  return Array.from(items ?? [])
    .filter((i) => i?.type === "class")
    .map((i) => String(i?.name ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * A VALUE BY CLASS (3.673.0, C3). Inner Tempest's Harmony: "+2 dodge bonus to
 * DB and a +2 resistance bonus to saving throws … This bonus increases to +3
 * if you are a Disciple or Mystic"; Karmic Resilience's +2, +4 for the same
 * two. A declared bonus, conditional or change may carry
 * `classValue: { classes: ["disciple", "mystic"], value: 3 }`: the row's
 * `value` becomes that for a creature holding one of those classes. The key
 * is removed either way, so nothing downstream sees it. A change's value
 * stays a string, as Foundry stores it.
 *
 * @param {object} row
 * @param {string[]} classNames lower-cased, from `classNamesOf`
 */
export function classValued(row, classNames = []) {
  if (!row || typeof row !== "object" || !row.classValue || typeof row.classValue !== "object") return row;
  const { classValue, ...rest } = row;
  const want = (Array.isArray(classValue.classes) ? classValue.classes : []).map((c) => String(c ?? "").trim().toLowerCase());
  const held = (classNames ?? []).map((c) => String(c ?? "").trim().toLowerCase());
  if (!want.some((c) => held.includes(c)) || !Number.isFinite(Number(classValue.value))) return rest;
  return { ...rest, value: typeof row.value === "string" ? String(Number(classValue.value)) : Number(classValue.value) };
}

/**
 * A RUNE THAT KEEPS ITS WEARER FROM DYING (3.673.0, C1). Karmic Resilience:
 * "Reaction; Trigger the wielder gains the dying condition; Frequency 1/day.
 * You are immediately restored to 1 HP, do not gain the dying condition and
 * do not take a critical for being reduced to 0 HP. Furthermore, you gain a
 * +2 circumstance bonus to all dying checks for 1 minute."
 *
 * A rune declares `deathGuard` in the death guard's own shape
 * (combat/death-guard.mjs) — `offer`, `frequency`, `notOutright` and
 * `grants` — and it is handed to the guard as a carrier of its own, so the
 * 0-HP moment asks it beside every effect's guard. Its `grants` conditionals
 * are read by class here (C3).
 *
 * @returns {Array<{id, name, disabled: false, flags}>}
 */
export function runeDeathGuardCarriers(items = []) {
  const classes = classNamesOf(items);
  return activeDeclaredRunes(items)
    .filter((e) => e.declares?.deathGuard && typeof e.declares.deathGuard === "object")
    .map((e) => {
      const raw = e.declares.deathGuard;
      const grants = raw.grants && typeof raw.grants === "object"
        ? { ...raw.grants, conditionals: (Array.isArray(raw.grants.conditionals) ? raw.grants.conditionals : []).map((c) => classValued(c, classes)) }
        : null;
      return {
        id: `rune-${e.key}-${e.item?.id ?? ""}`,
        name: `${e.item?.name ?? ""} (${e.label})`,
        disabled: false,
        flags: { [SYSTEM_ID]: { deathGuard: { ...raw, label: String(raw.label ?? e.label), ...(grants ? { grants } : {}) } } }
      };
    });
}

/**
 * WHAT A WORN RUNE DOES TO BLEEDING (3.673.0, C2). Inner Tempest's
 * Staunching: "The flat check to remove Light Bleeding is reduced by 2 to 14"
 * (I; 3 at II, 4 at III); "Furthermore, you may also attempt a DC 16 flat
 * check to reduce Moderate Bleeding by 1" (II), "any Bleeding" (III).
 *
 * A rune declares `bleedFlatCheckReduction` (a number, or an array, one per
 * tier) and `bleedReduceCheck: { dc, bands }` (`bands` "moderate" or "any";
 * an array per tier the same way, `null` for a tier without one). The greatest
 * reduction counts, as two suits cannot both be worn; the widest check does.
 *
 * @returns {{reduction: number, reduceCheck: {dc: number, bands: string}|null, labels: string[]}}
 */
export function runeBleedEasing(items = []) {
  let reduction = 0;
  let reduceCheck = null;
  const labels = [];
  const widen = (a, b) => (!a ? b : (a.bands === "any" ? a : b));
  for (const e of activeDeclaredRunes(items)) {
    // ONE VALUE, OR ONE PER TIER (an array; the registered tier rows keep only
    // level, price and dice).
    const fromTier = (key) => {
      const v = e.declares?.[key];
      return Array.isArray(v) ? v[Math.min(e.tier, v.length) - 1] : v;
    };
    const r = Math.max(0, Math.trunc(Number(fromTier("bleedFlatCheckReduction")) || 0));
    const check = fromTier("bleedReduceCheck");
    const usable = check && typeof check === "object" && ["moderate", "any"].includes(String(check.bands ?? "").toLowerCase())
      ? { dc: Math.max(1, Math.trunc(Number(check.dc) || 16)), bands: String(check.bands).toLowerCase() }
      : null;
    if (!r && !usable) continue;
    labels.push(`${e.item?.name ?? ""} (${e.label})`);
    reduction = Math.max(reduction, r);
    if (usable) reduceCheck = widen(reduceCheck, usable);
  }
  return { reduction, reduceCheck, labels };
}

/** May a reduce check touch bleeding of this band? Light is the ordinary check's. */
export function bleedReduceReaches(reduceCheck, bandKey) {
  if (!reduceCheck) return false;
  const band = String(bandKey ?? "").toLowerCase();
  if (band === "light" || !band) return false;
  return reduceCheck.bands === "any" || (reduceCheck.bands === "moderate" && band === "moderate");
}

/**
 * A RUNE THAT ANSWERS A CRITICAL HIT ON ITS WEARER (3.673.0, C4). Inner
 * Tempest's Guarded: "Reaction; Trigger the wielder takes a critical hit;
 * Frequency 1/day. You negate the additional HP damage inflicted by the
 * critical hit and are immediately healed an amount of HP equal to half of
 * this amount (round up)." Declared `criticalGuard: { frequency }`; the
 * first such rune that may fire now, with its item.
 */
export function runeCriticalGuard(items = [], now = 0) {
  for (const e of activeDeclaredRunes(items)) {
    const spec = e.declares?.criticalGuard;
    if (!spec || typeof spec !== "object") continue;
    const frequency = String(spec.frequency ?? "daily");
    if (!runeFrequencyAllows(runeMarkersOf(e.item), e.key, frequency, now)) continue;
    return { key: e.key, label: `${e.item?.name ?? ""} (${e.label})`, runeLabel: e.label, item: e.item, frequency };
  }
  return null;
}

/** Half the negated damage, rounded up: Guarded's heal. */
export function criticalGuardHeal(negated) {
  return Math.ceil(Math.max(0, Number(negated) || 0) / 2);
}

/**
 * A WEAPON RUNE THAT RAISES THE CRITICAL INJURY ROLL (3.673.0, C5). Inner
 * Tempest's Harmony Edge: "Reaction; Trigger you inflict a critical hit;
 * Frequency 1/day … You gain advantage on the attack critical roll."
 * Declared `criticalAdvantage: { frequency }` on a weapon rune. Equipped or
 * not, the weapon that scored the critical is the one asked.
 */
export function runeCriticalAdvantage(weapon, now = 0) {
  for (const e of declaredRunesOn(weapon)) {
    const spec = e.declares?.criticalAdvantage;
    if (!spec || typeof spec !== "object") continue;
    const frequency = String(spec.frequency ?? "daily");
    if (!runeFrequencyAllows(runeMarkersOf(weapon), e.key, frequency, now)) continue;
    return { key: e.key, label: `${weapon?.name ?? ""} (${e.label})`, frequency };
  }
  return null;
}

/**
 * The injury roll's bias with an advantage added (B9-3): a minor critical's
 * disadvantage and the advantage cancel; serious becomes advantage; deadly
 * already has it.
 */
export function biasWithAdvantage(bias) {
  return bias === "disadvantage" ? "normal" : "advantage";
}

/**
 * A REGISTERED RUNE COMMANDED ON AND OFF LIKE AN ENERGY RUNE (3.673.0, C6).
 * Inner Tempest's Soulful Strike: "Activate Command (1 AP). When active, the
 * weapon inflicts secondary force damage based upon its level": 1d6, then 2d6
 * with a secondary critical, then 3d6 with a better one. Declared
 * `energy: { type, tiers: [{ dice, secondaryCritical }] }`; read in the five
 * energy runes' shape so the same button, state, damage and secondary
 * critical serve it.
 *
 * @returns {{label: string, type: string, tiers: Array<{dice: string, secondaryCritical: number|null}>}|null}
 */
export function registeredEnergyRune(key) {
  const rune = registeredRune(key);
  const energy = rune?.declares?.energy;
  if (!rune || !energy || typeof energy !== "object" || !rune.on.includes("weapon")) return null;
  const type = String(energy.type ?? "").trim().toLowerCase();
  const tiers = (Array.isArray(energy.tiers) ? energy.tiers : [])
    .map((t) => ({
      dice: String(t?.dice ?? "").trim(),
      secondaryCritical: t?.secondaryCritical === null || t?.secondaryCritical === undefined || !Number.isFinite(Number(t.secondaryCritical))
        ? null : Math.trunc(Number(t.secondaryCritical))
    }))
    .filter((t) => /^\d+d\d+$/i.test(t.dice));
  if (!type || !tiers.length) return null;
  return { label: rune.name, type, tiers: Object.freeze(tiers) };
}
