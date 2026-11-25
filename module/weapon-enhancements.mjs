/**
 * A WEAPON'S TEMPORARY ENHANCEMENTS FROM A SOURCEBOOK (3.713.0; Eldritch Arts
 * 0.18.0, seam C-EA11-1).
 *
 * Eldritch Arts' Artificer feats change ONE weapon, for one day:
 *
 *   Modular Design        "Weapon: +1 item bonus to attack rolls or +1 to
 *                         damage (choose one)." Advanced Design and Integrated
 *                         Modularity raise the figure to +2 or +3 on one item.
 *   Overclocked Weaponry  "Plasma Edge: +1d4 secondary elemental damage";
 *                         "Gyroscopic Repeater: Reduces reload AP by 1";
 *                         "Impact Amplifier: Increase the weapon's base damage
 *                         by 1".
 *
 * Nothing the core had could say "this weapon, not that one". A weapon's own
 * `system.attackBonus` is authored data (and is summed with its potency rune
 * in item.mjs); an actor effect reaches every attack; a conditional has no
 * weapon axis. Writing the field and restoring it later is how spell runes do
 * it, but a modular +1 is not a rune and must not be priced, counted against
 * a rune allowance or read as magical.
 *
 * SO A MODULE DECLARES, AND THE CORE ASKS. `registerWeaponEnhancement(key,
 * fn)`: `fn(weapon, actor)` answers null or one or more of
 *
 *   { label,
 *     attack:  number,            an attack bonus, typed `attackType`
 *     attackType: "item",         (default item: Appendix 1 stacking keeps the
 *                                 higher of it and the weapon's own item bonus)
 *     damage:  number,            a bonus to the Strike's damage roll
 *     damageType: "item"|"untyped" (item: it competes with the weapon's own
 *                                 item damage — quality and potency — and only
 *                                 its excess is added; untyped: always added)
 *     packets: [{ dice, type }],  secondary damage, resolved like a Flaming
 *                                 rune's packet against the target's defences
 *     reloadReduction: number }   AP off the weapon's Load cost (min 0)
 *
 * Read at four places: the attack's modifier rows, the damage formula, the
 * secondary-damage loop and the reload cost. A provider that throws costs its
 * own answer only. Pure but for the registry read.
 */
import { registeredWeaponEnhancements } from "./module-api.mjs";

const int = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};
const DICE = /^\d*d\d+([+-]\d+)?$/i;

/**
 * Every registered answer for this weapon, cleaned and summarised.
 *
 * @param {object} weapon the weapon item (any shape with `id`, `name`, `system`)
 * @param {object} actor the wielder
 * @param {Array<{key: string, fn: Function}>} [providers] defaults to the registry
 * @returns {{attackRows: Array<{label: string, value: number, type: string}>,
 *   itemDamage: number, flatDamage: number, damageLabels: string[],
 *   packets: Array<{label: string, dice: string, type: string, secondaryCritical: null}>,
 *   reloadReduction: number, labels: string[]}}
 */
export function weaponEnhancementsFor(weapon, actor, providers = null) {
  const out = { attackRows: [], itemDamage: 0, flatDamage: 0, damageLabels: [], packets: [], reloadReduction: 0, labels: [] };
  if (!weapon) return out;
  for (const { key, fn } of providers ?? registeredWeaponEnhancements()) {
    let got;
    try {
      got = fn(weapon, actor);
    } catch (err) {
      console.error(`TRG Prime | weapon enhancement "${key}" failed`, err);
      continue;
    }
    for (const e of Array.isArray(got) ? got : (got ? [got] : [])) {
      if (!e || typeof e !== "object") continue;
      const label = String(e.label ?? key).trim() || key;
      let used = false;
      const attack = int(e.attack);
      if (attack) {
        out.attackRows.push({ label, value: attack, type: String(e.attackType ?? "item").trim().toLowerCase() || "item" });
        used = true;
      }
      const damage = int(e.damage);
      if (damage) {
        if (String(e.damageType ?? "item").trim().toLowerCase() === "item") {
          // The best item bonus among the module's own answers; the caller
          // compares it with the weapon's own item damage.
          out.itemDamage = Math.max(out.itemDamage, damage);
        } else {
          out.flatDamage += damage;
        }
        out.damageLabels.push(`${label} ${damage > 0 ? "+" : ""}${damage}`);
        used = true;
      }
      for (const p of Array.isArray(e.packets) ? e.packets : []) {
        const dice = String(p?.dice ?? "").trim();
        const type = String(p?.type ?? "").trim().toLowerCase();
        if (!DICE.test(dice) || !type) continue;
        out.packets.push({ label: String(p.label ?? label), dice, type, secondaryCritical: null });
        used = true;
      }
      const reload = int(e.reloadReduction);
      if (reload > 0) {
        out.reloadReduction += reload;
        used = true;
      }
      if (used) out.labels.push(label);
    }
  }
  return out;
}

/**
 * A weapon's Load cost after its enhancements: never below 0.
 * @param {number} load the cost before (after Quick Reload)
 * @param {number} reduction from `weaponEnhancementsFor`
 */
export function enhancedLoad(load, reduction) {
  return Math.max(0, int(load) - Math.max(0, int(reduction)));
}
