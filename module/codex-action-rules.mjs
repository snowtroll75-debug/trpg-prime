/**
 * Pure rules for Codex actions that grew options in 3.639.0 (Fiends &
 * Fables 3.0 block 9, Graham's rulings of 13 October 2026: "all
 * recommendations"). The Foundry half is codex-actions-workflow.mjs.
 *
 *   R4  the Chuul's Mandibles, on the Constrict action:
 *       "Any creature that is grabbed and paralyzed takes 3d6 piercing
 *        damage with a basic Fort save to avoid a critical only (full
 *        damage is still inflicted)."
 *         requireCondition: "paralyzed"   only the held creatures that are
 *         saveAvoidsCriticalOnly: true    the save never cuts the damage —
 *                                          a failure's extra die still lands
 *   R7  Foresight Gaze — "the cyclops gains advantage on the check": the
 *       held advantage it lays (magic/held-bonus.mjs), offered on any d20
 *       check the creature's next card is.
 *   R8  Trample — "damage from the creature's slam attack": the Slam, else
 *       the named fallback (a Hoof), else none rather than any weapon.
 */

/** The held creatures a Constrict-kind action reaches. */
/**
 * CONSTRICT'S FURTHER PACKETS (3.654.0; F&F 3.0 block 21 R9 — the Ochre
 * Jelly: "2d8+6 bludgeoning plus 1d6 acid"). `extraDamage: [{ dice, type }]`.
 */
export function constrictExtraPackets(spec = {}) {
  return (Array.isArray(spec?.extraDamage) ? spec.extraDamage : [])
    .map((x) => ({ dice: String(x?.dice ?? "").replace(/\s+/g, ""), type: String(x?.type ?? "").trim().toLowerCase() }))
    .filter((x) => /^\d+d\d+([+-]\d+)?$/i.test(x.dice) && /^[a-z]+$/.test(x.type));
}

export function constrictTargets(held = [], spec = {}, hasCondition = () => false) {
  const want = String(spec?.requireCondition ?? "").trim();
  if (!want) return Array.from(held ?? []);
  return Array.from(held ?? []).filter((t) => hasCondition(t, want));
}

/** A basic save's result with the damage never below full, when the save only avoids a critical. */
export function constrictSaveResult(basic, spec = {}) {
  if (!spec?.saveAvoidsCriticalOnly) return basic;
  return { ...basic, damageMultiplier: Math.max(1, Number(basic?.damageMultiplier) || 0) };
}

/** Every d20 check type a held advantage from Foresight Gaze is offered on. */
const FORESIGHT_CHECK_TYPES = Object.freeze(["attack", "save", "skill", "specialist", "attribute", "cast", "spellcraft", "initiative", "flat"]);

/** The held-bonus row Foresight Gaze lays. */
export function heldAdvantageRow(item, spec = {}) {
  const types = Array.isArray(spec?.checkTypes) && spec.checkTypes.length ? spec.checkTypes : FORESIGHT_CHECK_TYPES;
  return { heldKind: "advantage", label: String(spec?.label ?? item?.name ?? "Advantage"), checkTypes: [...types], spentNote: String(spec?.spentNote ?? "") };
}

/** Trample's weapon: the first of the declared names, in order, that the creature carries. */
export function trampleWeapon(weapons = [], spec = {}) {
  const names = [spec?.weapon ?? "slam", ...(Array.isArray(spec?.fallbackWeapons) ? spec.fallbackWeapons : [])].map((n) => String(n ?? "").trim()).filter(Boolean);
  const list = Array.from(weapons ?? []).filter((w) => w?.type === "weapon");
  for (const n of names) {
    const re = new RegExp(n, "i");
    const hit = list.find((w) => re.test(String(w?.name ?? "")));
    if (hit) return hit;
  }
  return null;
}

/**
 * DRAINING KISS (3.640.0, F&F 3.0 block 10 R7): "Soul Drain 5 (maximum 20)"
 * — how much of the declared value lands, given what the target holds.
 */
export function cappedConditionValue(existing, value, max = 0) {
  const add = Math.max(0, Math.trunc(Number(value) || 0));
  const cap = Math.max(0, Math.trunc(Number(max) || 0));
  if (!cap) return add;
  return Math.max(0, Math.min(add, cap - Math.max(0, Number(existing) || 0)));
}

/** EMBRACE (3.640.0): the basic action, its check replaced by a skill. */
export function basicActionWithSkill(base, spec = {}, itemName = "") {
  const skill = String(spec?.skill ?? "").trim();
  if (!skill) return { ...base, name: itemName ? `${itemName} (${base.name})` : base.name };
  return { ...base, checkType: "skill", skills: [skill], name: `${itemName || base.name} (${base.name}, ${skill.charAt(0).toUpperCase()}${skill.slice(1)})` };
}

/** DEATH THROES (3.640.0): the declared death areas on a creature's items. */
export function deathAreasOf(items = []) {
  const out = [];
  for (const i of Array.from(items ?? [])) {
    const area = i?.flags?.["trg-prime"]?.creatureAbility?.deathArea;
    // …or one that only exposes (3.655.0, block 22 R1: Emit Spores on death).
    if (area && typeof area === "object" && (area.save || area.expose?.affliction)) out.push({ itemId: String(i.id ?? i._id ?? ""), name: String(i.name ?? "Death"), area });
  }
  return out;
}

/**
 * REBORN ON DEATH (3.655.0; F&F 3.0 block 22 R4 — the Phoenix's Reborn from
 * the Ashes: "After 1 minute, the ashes reform into a new Phoenix as if it
 * had been restored with a Resurrection spell"). Declared as
 * `creatureAbility.deathRebirth = { afterSeconds: 60 }`.
 */
export function deathRebirthsOf(items = []) {
  const out = [];
  for (const i of Array.from(items ?? [])) {
    const r = i?.flags?.["trg-prime"]?.creatureAbility?.deathRebirth;
    if (r && typeof r === "object") out.push({ itemId: String(i.id ?? i._id ?? ""), name: String(i.name ?? "Rebirth"), afterSeconds: Math.max(0, Math.trunc(Number(r.afterSeconds) || 0)) });
  }
  return out;
}

/** The wait the card names: "after 1 minute", "after 2 hours". */
export function rebirthWaitText(seconds = 0) {
  const s = Math.max(0, Math.trunc(Number(seconds) || 0));
  if (!s) return "at once";
  if (s % 3600 === 0) return `after ${s / 3600} hour${s === 3600 ? "" : "s"}`;
  if (s % 60 === 0) return `after ${s / 60} minute${s === 60 ? "" : "s"}`;
  return `after ${s} seconds`;
}

/*
 * A STRIKE MADE THROUGH AN ABILITY (3.643.0; F&F 3.0 block 13 R6). The
 * Halya's Xithra, "+36 (focus, magical, range 120) 8d6 mental or force",
 * and the Aelin's Screech, "2 AP (attack … focus) … targets one creature
 * within 30 feet … 4d10 sonic", are ranged strikes that spend a Focus use.
 * Each is a natural missile weapon (no ammunition) marked
 * `flags.trg-prime.viaAbility: "<ability name>"`, struck only through that
 * ability's `kind: "weaponStrike"` action, which counts the use and the AP.
 */
/** The ability a weapon may only be struck through, or "" — refused when struck directly. */
export function weaponStrikeRefused(weapon, viaAbility = false) {
  const via = String(weapon?.flags?.["trg-prime"]?.viaAbility ?? "").trim();
  return via && !viaAbility ? via : "";
}

/** The weapon a weaponStrike action names, by name, case-insensitive. */
/**
 * A STRIKE WITH AN INNATE SPELL (3.656.0; F&F 3.0 block 23 R6 — Air Blast
 * Magic): the innate spells it may combine with, by name order. An optional
 * `tradition` narrows them to those the spell lists.
 */
export function strikeInnateSpells(items = [], spec = {}) {
  const want = String(spec?.tradition ?? "").trim().toLowerCase();
  return Array.from(items ?? [])
    .filter((i) => i?.type === "spell" && i.system?.innate === true
      && (!want || !String(i.system?.tradition ?? i.system?.traditions ?? "").trim() || String(i.system?.tradition ?? i.system?.traditions ?? "").toLowerCase().includes(want)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * THE STRIKE'S ATTACK BONUS, FOR THE SPELL IT CARRIES (3.656.1; found live
 * testing 3.656.0): the Strike's own modifiers, without what belonged to that
 * one roll — its multiple attack penalty, its range increment and the
 * situation's circumstance modifiers (a prone target, cover).
 */
export function strikeAttackBonus(modifiers = []) {
  return Array.from(modifiers ?? []).reduce((sum, m) => {
    const label = String(m?.label ?? "");
    if (/multiple attack penalty|range increment/i.test(label) || String(m?.type ?? "").toLowerCase() === "circumstance") return sum;
    return sum + (Number(m?.value) || 0);
  }, 0);
}

/** "Recurring +2" in a weapon's traits: the recurring damage a hit lays (3.656.0, block 23 R5). */
export function weaponRecurringValue(traits = "") {
  const m = /\brecurring\s*\+\s*(\d+)/i.exec(String(traits ?? ""));
  return m ? Math.max(0, Math.trunc(Number(m[1]))) : 0;
}

export function weaponStrikeWeapon(items = [], spec = {}) {
  const want = String(spec?.weapon ?? "").trim().toLowerCase();
  if (!want) return null;
  return Array.from(items ?? []).find((i) => i?.type === "weapon" && String(i.name ?? "").trim().toLowerCase() === want) ?? null;
}

/*
 * CARRION FEAST (3.647.0, F&F 3.0 block 15 R7): "consumes the flesh of an
 * adjacent creature that has died within the last hour regaining 1d6 HP. The
 * ghoul may only gain this benefit once from each body." A body records who
 * has fed on it; this says whether one more may.
 */
export const CARRION_FED_FLAG = "carrionFedBy";
export function carrionFeastAllowed(fedBy = [], feederUuid = "") {
  return Boolean(feederUuid) && !(Array.isArray(fedBy) ? fedBy : []).includes(feederUuid);
}

/*
 * SIZE SHIFT (3.647.0, F&F 3.0 block 15 R8) — Efreet Shifting on an unwilling
 * target, by the degree of its Fortitude save:
 *   Critical unaffected; Success until the end of its next turn; Partial
 *   1 minute; Failure 1 hour; Fumble 1 day; Blunder permanently. Chaos: "if
 *   the target changes size, the size direction is reversed."
 */
const SIZE_SHIFT_TIMES = Object.freeze({
  heroic: null, critical: null,
  success: { rounds: 1, label: "until the end of its next turn" },
  partial: { seconds: 60, label: "for 1 minute" },
  failure: { seconds: 3600, label: "for 1 hour" },
  fumble: { seconds: 86400, label: "for 1 day" },
  blunder: { permanent: true, label: "permanently" }
});
export function sizeShiftOutcome(degreeKey, direction = 1, chaos = false) {
  const time = SIZE_SHIFT_TIMES[String(degreeKey ?? "")] ?? null;
  if (!time) return null;
  const dir = Math.sign(Number(direction) || 1) * (chaos ? -1 : 1);
  return { steps: dir, ...time };
}

/*
 * THUNDERING STRIKE (3.649.0; F&F 3.0 block 16 R4). "Makes an attack that
 * inflicts an additional 2d12 bludgeoning damage. After the strike, all
 * creatures within a 20-foot radius without the air trait must make a basic
 * Fort save to avoid taking 4d8 sonic damage." The strike's extra packet is
 * `extraDamage`; the burst after it is the area rail's own shape, centred on
 * the striker, every creature of the excluded kinds passed over.
 */
export function strikeBurstArea(spec = {}) {
  const b = spec?.burst;
  if (!b || typeof b !== "object") return null;
  const formula = String(b.damage?.formula ?? "").trim();
  const type = String(b.damage?.type ?? "").trim().toLowerCase();
  const radiusFeet = Math.max(0, Math.trunc(Number(b.radiusFeet) || 0));
  if (!radiusFeet) return null;
  return {
    save: String(b.save ?? "").trim().toLowerCase() || null,
    basic: b.basic !== false,
    ...(formula && type ? { damage: { formula, type } } : {}),
    radiusFeet,
    scope: "area",
    excludeKinds: (Array.isArray(b.excludeKinds) ? b.excludeKinds : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean),
    ...(Number(b.dc) > 0 ? { dc: Math.trunc(Number(b.dc)) } : {})
  };
}

/** An action's declared extra damage rows, cleaned: [{dice, type}]. */
export function actionExtraDamage(spec = {}) {
  const rows = Array.isArray(spec?.extraDamage) ? spec.extraDamage : (spec?.extraDamage ? [spec.extraDamage] : []);
  return rows.map((r) => ({ dice: String(r?.dice ?? "").replace(/\s+/g, ""), type: String(r?.type ?? "").trim().toLowerCase() }))
    .filter((r) => /^\d+d\d+([+-]\d+)?$/i.test(r.dice) && r.type);
}

/*
 * LIGHTNING STRIKE (3.649.0; F&F 3.0 block 16 R5). "A single melee strike,
 * comparing the result to the DB of all creatures within range +5 feet." The
 * range is the striker's reach, the weapon's Reach extension when it has the
 * trait, and the action's own `plusFeet`.
 */
export function sweepingStrikeRangeFeet({ reach = 5, weaponHasReach = false, extension = 5, plusFeet = 0 } = {}) {
  const base = Number.isFinite(Number(reach)) ? Math.max(0, Number(reach)) : 5;
  return base + (weaponHasReach ? Math.max(0, Number(extension) || 0) : 0) + Math.max(0, Number(plusFeet) || 0);
}

/** The multiple attack penalty a check was rolled at (0 when none), for the creatures after the first. */
export function mapOfCheck(modifiers = []) {
  const m = (modifiers ?? []).find((x) => /^Multiple Attack Penalty/.test(String(x?.label ?? "")));
  return m ? Number(m.value) || 0 : 0;
}
