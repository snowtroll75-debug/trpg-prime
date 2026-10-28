/**
 * A CODEX ABILITY'S AREA EFFECT (3.631.0; Fiends & Fables 3.0 block 1).
 *
 * Declared on the entry, beside its activation:
 *
 *   flags.trg-prime.creatureAbility.area = {
 *     save: "will", basic: true,            // or no save: a note
 *     damage: { formula: "3d6", type: "sonic" }
 *           | { fromItem: /breath/i }       // Draconic Roar: the breath's dice
 *     radiusFeet: 30, scope: "area",        // round the user's token
 *       — or scope: "targets" for a cone, a line, or "those that can see it"
 *     livingOnly: true, immuneIf: ["deafened"],
 *     outcomes: { partial: "…", failure: "…" },
 *     conditions: { partial: [{ key: "frightened", value: 1 }], … },
 *     immunitySeconds: 600,                 // Howl: immune 10 min after a save
 *     cooldownSeconds: 3600,                // Draconic Roar: once an hour
 *     breath: true                          // a breath weapon: remembered a turn
 *   }
 *
 * It is the peril Effect of 3.629.0 (peril-effect.mjs) with a creature
 * behind it — the same spec, the same roll (peril-workflow.mjs). This file
 * holds what is the creature's own: the cooldown and the damage borrowed
 * from another of its abilities. Pure.
 */
import { bonusDamageDice } from "./combat/attack.mjs";
import { resizedNaturalDamage } from "./companion.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * DICE BY LEVEL (3.674.0, C5; Inner Tempest's dragon breath, IT-C5: "1 die
 * per level, the die from the base block"). `damage: { perLevel: "d8", type }`
 * is that many of that die as the user's level: "6d8" at level 6. A fixed
 * `formula` is returned unchanged; an unusable level or die gives no formula.
 */
export function perLevelDamage(damage, level) {
  if (!damage || typeof damage !== "object" || damage.formula || !damage.perLevel) return damage;
  const die = /^d(\d+)$/i.exec(String(damage.perLevel).trim());
  const n = Math.floor(Number(level));
  const { perLevel: _p, ...rest } = damage;
  if (!die || !(n >= 1)) return rest;
  return { ...rest, formula: `${n}d${die[1]}` };
}

/** The area declaration on an item, or null — its own, else a module breath read as one (3.632.0). */
function areaOf(item) {
  const a = item?.flags?.[SYSTEM_ID]?.creatureAbility?.area;
  if (a && typeof a === "object") return a;
  return moduleBreathArea(item) ?? moduleSwarmArea(item);
}

/*
 * A SWARM'S ATTACK IS AN AREA OF ITS OWN SPACE (3.632.0; Fiends & Fables 3.0
 * block 2, ruling 9). Chapter 3's Swarm trait: "When a swarm moves into or
 * occupies an area occupied by another creature, that creature must attempt
 * the saving throw listed in the swarm's attack entry. On a failed save, the
 * creature takes the swarm's listed damage." The module's five swarms print
 * it as "Each enemy in the rat swarm's space takes 1d6+1 piercing damage with
 * a basic Reflex save" — read as scope "sharedSpace": every enemy whose
 * space overlaps the swarm's. What follows the damage sentence ("subjected to
 * Filth Fever", "a critical also inflicts 1 bleed") rides on the card.
 */
export function moduleSwarmArea(item) {
  if (!item || item.type !== "ability") return null;
  const text = String(item?.system?.description?.value ?? item?.system?.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = /each (enemy|creature) in the [^.]*?swarm[’']s space takes (\d+d\d+(?:[+-]\d+)?) ([a-z]+) damage(?: with a basic (Reflex|Fortitude|Will) save)?/i.exec(text);
  if (!m) return null;
  const save = m[4] ? SAVE_NAMES[m[4].toLowerCase()] : "reflex";
  const apMatch = /Action\s+(\d+)\s*AP/i.exec(text);
  const rest = text.slice(m.index + m[0].length).replace(/^[.;\s]+/, "").trim();
  const area = {
    save, basic: true,
    damage: { formula: m[2], type: m[3].toLowerCase() },
    scope: "sharedSpace",
    enemiesOnly: m[1].toLowerCase() === "enemy",
    intro: "Every creature in the swarm's space.",
    swarmAttack: true
  };
  if (rest) area.notes = [rest];
  if (apMatch) area.ap = Number(apMatch[1]);
  return area;
}

/** The area an item rolls from its Use button, or null. */
export function declaredArea(item) { return areaOf(item); }

/*
 * A MODULE'S BREATH WEAPON IS A DECLARED BREATH (3.632.0; Fiends & Fables
 * 3.0 block 2, ruling 16). Fiends & Fables Prime's dragons carry
 * `flags["fiends-and-fables-prime"].breath = { shape, distance, damage,
 * damageType, save }`; its other breathers print the same facts in a
 * sentence — "breathes a 20-foot cone of flame that deals 10d6 fire damage;
 * targets make a basic Reflex save". Either is read as
 * `{ save, basic, damage, scope: "targets", breath: true }`, so the breath
 * rolls and applies from its Use button and 3.631.0's breath riders and
 * Draconic Roar have a breath to read. No module rebuild.
 *
 * Read only when it is unambiguous: one damage type, a basic save named, no
 * repair placeholder. Two damage types ("1d6 slashing plus 1d6 cold"), a
 * save ladder (the Gorgon's), a lingering cloud or an unprinted save stay
 * the card they were.
 */
const MODULE_ID = "fiends-and-fables-prime";
const BREATH_DAMAGE_TYPES = Object.freeze(["acid", "cold", "electricity", "fire", "sonic", "force", "poison",
  "mental", "bludgeoning", "piercing", "slashing", "essence", "coldfire", "negative", "positive"]);
const SAVE_NAMES = Object.freeze({ reflex: "reflex", fortitude: "fortitude", fort: "fortitude", will: "will" });

export function moduleBreathArea(item) {
  if (!item || item.type !== "ability" || !/breath/i.test(String(item.name ?? ""))) return null;
  const activation = item?.flags?.[SYSTEM_ID]?.creatureAbility?.activation ?? {};
  const text = String(item?.system?.description?.value ?? item?.system?.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (/PLACEHOLDER/i.test(text)) return null;
  const apMatch = /Action\s+(\d+)\s*AP/i.exec(text);
  const ap = Number(activation.ap ?? activation.actionPoints ?? (apMatch ? apMatch[1] : NaN));
  const flag = item?.flags?.[MODULE_ID]?.breath;
  let save = "", formula = "", type = "", distance = 0, shape = "", dc = 0;
  const extraDamage = [];
  if (flag && typeof flag === "object" && flag.damage) {
    formula = String(flag.damage).trim();
    type = String(flag.damageType ?? "").trim().toLowerCase();
    save = SAVE_NAMES[String(flag.save || activation.save || "").trim().toLowerCase()] ?? "";
    distance = Number(flag.distance) || 0;
    shape = String(flag.shape ?? "").trim();
  } else {
    if (/saving throw at the beginning of each|lingers/i.test(text)) return null;
    const dmg = new RegExp(`(\\d+d\\d+)\\s+(?:points of\\s+)?(${BREATH_DAMAGE_TYPES.join("|")})\\b`, "i").exec(text);
    if (!dmg) return null;
    formula = dmg[1];
    type = dmg[2].toLowerCase();
    // SEVERAL PACKETS (3.633.0, F&F 3.0 R10): the Ice Aetherling's "1d6
    // slashing plus 1d6 cold" — each its own type, each met by the target's
    // own defences, all halved by the one basic save.
    const plus = new RegExp(`^\\s+plus\\s+(\\d+d\\d+)\\s+(?:points of\\s+)?(${BREATH_DAMAGE_TYPES.join("|")})\\b`, "i");
    let rest = text.slice(dmg.index + dmg[0].length);
    for (let m = plus.exec(rest); m; m = plus.exec(rest)) {
      extraDamage.push({ formula: m[1], type: m[2].toLowerCase() });
      rest = rest.slice(m[0].length);
    }
    const sv = /\bbasic\s+(Reflex|Fortitude|Fort|Will)\b/i.exec(text);
    save = sv ? SAVE_NAMES[sv[1].toLowerCase()] : "";
    const ar = /(\d+)[-\s]?(?:foot|feet|ft\.?|')\s*(cone|line|jet|radius|emanation|burst)/i.exec(text);
    if (ar) { distance = Number(ar[1]); shape = ar[2].toLowerCase(); }
    const dcm = /\bDC\s+(\d+)/.exec(text);
    if (dcm) dc = Number(dcm[1]);
  }
  if (!formula || !/^\d+d\d+([+-]\d+)?$/i.test(formula) || !save) return null;
  const area = {
    save, basic: true,
    damage: { formula, type },
    scope: "targets",
    intro: `${distance ? `A ${distance}-foot ${shape || "area"}` : "The breath"} — target the creatures in it.`,
    breath: true,
    moduleBreath: true
  };
  if (extraDamage.length) area.extraDamage = extraDamage;
  if (dc > 0) area.dc = dc;
  if (Number.isFinite(ap) && ap > 0) area.ap = ap;
  return area;
}

/**
 * Whether the ability can be used now, and what to roll.
 *
 * @param {object} item
 * @param {{worldTime?: number}} ctx
 * @returns {{spec: object|null, refusal: string, cooldownSeconds: number, breath: boolean}}
 */
export function declaredAreaUse(item, { worldTime = 0, level = null } = {}) {
  const declared = areaOf(item);
  // DICE BY LEVEL (3.674.0, C5), resolved here so everything after the Use
  // — the roll, the breath riders' "half the breath weapon's dice" — reads a
  // plain formula.
  const area = declared?.damage?.perLevel ? { ...declared, damage: perLevelDamage(declared.damage, level) } : declared;
  if (!area) return { spec: null, refusal: "declares no area effect", cooldownSeconds: 0, breath: false };
  const cooldownSeconds = Math.max(0, Number(area.cooldownSeconds) || 0);
  const last = Number(item?.flags?.[SYSTEM_ID]?.lastUsedAt);
  if (cooldownSeconds > 0 && Number.isFinite(last) && worldTime - last < cooldownSeconds) {
    const left = cooldownSeconds - (worldTime - last);
    return { spec: null, refusal: `used ${Math.round(worldTime - last)} seconds ago — ${left >= 3600 ? `${Math.ceil(left / 3600)} hour(s)` : left >= 60 ? `${Math.ceil(left / 60)} minute(s)` : `${left} seconds`} to go`, cooldownSeconds, breath: false };
  }
  const { cooldownSeconds: _c, breath, ap, moduleBreath: _m, swarmAttack: _s, ...spec } = area;
  return { spec: { ...spec }, refusal: "", cooldownSeconds, breath: breath === true, ap: Number(ap) || 0 };
}

/**
 * "takes breath weapon damage" — the dice of another of the creature's
 * declared area abilities whose name matches. Resolved at use time, so the
 * entry need not know which breath its dragon has.
 */
export function resolveAreaDamageSource(spec, items = [], { bab = 0, strength = 0, level = null, size = "" } = {}) {
  const out = { ...spec };
  // "DAMAGE EQUAL TO THE DRAGON'S WING ATTACK DAMAGE" (Wing Buffet, Trample's
  // slam): a rung's damage borrowed from one of the creature's own weapons,
  // its BAB dice and Strength included — `{ weapon: /wing/i, times: 2 }`.
  if (out.damageByRung && typeof out.damageByRung === "object") {
    const resolved = {};
    for (const [rung, row] of Object.entries(out.damageByRung)) {
      if (typeof row === "string") { resolved[rung] = row; continue; }
      if (!row || typeof row !== "object") continue;
      const re = row.weapon instanceof RegExp ? row.weapon : new RegExp(String(row.weapon ?? "$^"), "i");
      // A FALLBACK WEAPON (3.674.0, C11; Inner Tempest's B10-5): "damage
      // equal to the dragon's wing attack damage", for a dragon whose Wings
      // attack has not arrived yet. `fallback: { damage: "1d6", size: "small" }`
      // — the core Wings as authored — is resized to the creature and used.
      const weapon = Array.from(items ?? []).find((i) => i?.type === "weapon" && re.test(String(i.name ?? "")))
        ?? fallbackWeapon(row.fallback, size);
      if (!weapon) continue;
      const formula = weaponDamageFormula(weapon, { bab, strength, extraDice: Number(row.extraDice) || 0 });
      resolved[rung] = Number(row.times) > 1 ? `${Number(row.times)}*(${formula})` : formula;
      if (!out.damageType) out.damageType = String(weapon.system?.damageType ?? "bludgeoning");
    }
    out.damageByRung = resolved;
  }
  const from = out?.damage?.fromItem;
  if (!from) return out;
  const re = from instanceof RegExp ? from : new RegExp(String(from), "i");
  // A breath whose dice follow the level (C5) is read at the user's level.
  const dmgOf = (i) => perLevelDamage(areaOf(i)?.damage, level);
  const source = Array.from(items ?? []).find((i) => re.test(String(i?.name ?? "")) && dmgOf(i)?.formula);
  if (source) out.damage = { formula: dmgOf(source).formula, type: dmgOf(source).type ?? "" };
  else delete out.damage;
  return out;
}

/** A stand-in weapon from a rung's `fallback`, at the creature's size, or null. */
function fallbackWeapon(fallback, size) {
  if (!fallback || typeof fallback !== "object" || !fallback.damage) return null;
  const at = String(size ?? "").trim().toLowerCase();
  const resized = at && fallback.size ? resizedNaturalDamage(String(fallback.damage), String(fallback.size), at) : null;
  return { type: "weapon", name: String(fallback.name ?? "Fallback"), system: { damage: resized ?? String(fallback.damage), damageType: String(fallback.damageType ?? "bludgeoning") } };
}

/** A weapon's damage as the creature rolls it: base dice (+ BAB dice) + Strength. */
export function weaponDamageFormula(weapon, { bab = 0, strength = 0, extraDice = 0 } = {}) {
  const base = String(weapon?.system?.damage ?? "1d6").trim();
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(base);
  if (!m) return base;
  const dice = Number(m[1] || 1) + bonusDamageDice(bab) + Math.max(0, extraDice);
  const flat = (m[3] ? Number(m[3]) : 0) + (Number(strength) || 0);
  return `${dice}d${m[2]}${flat ? (flat > 0 ? `+${flat}` : `${flat}`) : ""}`;
}

/**
 * A DAMAGE TYPE CHOSEN ON USE (3.634.0; F&F 3.0 block 4, R7). The Cherubim's
 * Radiant Eyes: "a beam of energy, either cold or fire". Declared on the
 * area as `damageChoice: ["cold", "fire"]`; the user picks one when it is
 * used, and the area's damage takes that type.
 * @returns {string[]} the choices, [] when the type is fixed
 */
export function areaDamageChoices(spec) {
  const list = (Array.isArray(spec?.damageChoice) ? spec.damageChoice : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean);
  return list.length > 1 && spec?.damage?.formula ? [...new Set(list)] : [];
}

/** The spec with the chosen type set; the choice must be one offered. */
export function withChosenDamageType(spec, choice) {
  const choices = areaDamageChoices(spec);
  const pick = String(choice ?? "").trim().toLowerCase();
  if (!choices.includes(pick)) return spec;
  return { ...spec, damage: { ...spec.damage, type: pick } };
}
