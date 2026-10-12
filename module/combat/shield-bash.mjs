/**
 * Shield Bash (Chapter 4): "This attack inflicts base damage based
 * upon your shield type with the attacks fumble DC in parentheses...
 * If you use a shield bash action you lose any shield bonus gained
 * to DB until the beginning of your next turn."
 *
 * Deliberately doesn't reuse the weapon attack/damage/fumble
 * pipeline directly — that machinery is tightly coupled to fields
 * (fumbleDC, attackMode, and weapon-specific traits like Propulsive
 * or Spin) that a shield item doesn't carry, and forcing a shield
 * through it would be fragile. What genuinely is reused:
 * buildWeaponDamageFormula (for the BAB and critical dice only — since
 * 3.575.0 a shield's quality and material no longer reach it; see
 * `shieldBashProfile`) and the existing melee fumble table lookup.
 */

import { buildWeaponDamageFormula, lookupTableRow } from "./attack.mjs";
import { FUMBLE_TABLES } from "../data/fumble-tables.mjs";
import { computeShieldModifiers, stepUpDieSize } from "../item-quality.mjs";
import { parseGrantList } from "../grants.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The actor's equipped shield capable of a Shield Bash, if any.
 * Buckler and Parrying Scabbard have an empty shieldBashDamage (the
 * rulebook explicitly excludes Buckler; Parrying Scabbard is never
 * mentioned for Shield Bash at all and isn't a bashing shape) — both
 * correctly return null here.
 *
 * @param {Array} items
 * @returns {object|null}
 */
export function equippedBashableShield(items) {
  return (
    items.find(
      (item) =>
        item.type === "shield" &&
        item.system?.equipped &&
        String(item.system?.shieldBashDamage ?? "").trim()
    ) ?? null
  );
}

/**
 * WHAT A SHIELD BASH HITS WITH (3.575.0).
 *
 * The shield's own die, stepped up once for BOSS ("The attack dice is
 * increased by one step"), in the shield's own damage type — and PIERCING
 * as a second choice for SPIKES ("gains the versatile (piercing) weapon
 * trait when used to make the shield bash action"). Both traits were
 * computed by `computeShieldModifiers` from the day they were written and
 * read by nothing.
 *
 * NO WEAPON QUALITY OR MATERIAL (Graham, 19 Sep 2026). The bash went
 * through the WEAPON modifier table, so a master shield added +2 per die
 * and an adamantine one an extra die — neither printed anywhere for a
 * shield. The superior shield table gives hit points and DR and nothing
 * else.
 *
 * @param {object} shieldSystem
 * @returns {{damage: string, types: string[], boss: number, spikes: boolean}}
 */
export function shieldBashProfile(shieldSystem = {}) {
  const mods = computeShieldModifiers(
    shieldSystem.quality || "standard",
    shieldSystem.material || "",
    parseGrantList(shieldSystem.superiorTraits || ""),
    { category: shieldSystem.category || "light" }
  );
  const base = String(shieldSystem.shieldBashDamage ?? "").trim();
  const match = base.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  const boss = Math.max(0, Number(mods.bashDieStepUp) || 0);
  const damage = match && boss
    ? `${match[1] || 1}d${stepUpDieSize(Number(match[2]), boss)}${match[3] ?? ""}`
    : base;
  const own = String(shieldSystem.shieldBashDamageType ?? "bludgeoning");
  const spikes = (mods.bashGrantedTraits ?? []).some((t) => /piercing/i.test(String(t)));
  const types = spikes && own !== "piercing" ? [own, "piercing"] : [own];
  return { damage, types, boss, spikes };
}

/**
 * Rolls Shield Bash's damage — the shield's own die (Boss included; see
 * `shieldBashProfile`) and the attacker's BAB and critical dice, which
 * are part of every attack's base damage. No Strength modifier is
 * added, since Strength scales with a weapon's grip and leverage in a
 * way a shield's flat face doesn't share, and the rulebook gives no
 * formula suggesting otherwise.
 *
 * @param {Actor} actor
 * @param {Item} shield
 * @param {string|null} critical "minor"|"serious"|"deadly"|null
 * @returns {Promise<{total: number, formula: string, roll: Roll, types: string[]}>}
 */
export async function rollShieldBashDamage(actor, shield, critical = null) {
  const profile = shieldBashProfile(shield.system);
  const bab = Number(actor.system?.combat?.bab?.total ?? 0);
  const formula = buildWeaponDamageFormula(profile.damage, { bab, critical });
  const roll = await new Roll(formula).evaluate();
  return { total: roll.total, formula, roll, types: profile.types };
}

/**
 * Shield Bash's own fumble check — a flat DC roll against the
 * shield's own fumbleDC, falling through to the standard melee
 * fumble table on failure (Shield Bash is explicitly a melee attack).
 * Deliberately simpler than rollFumbleCheck (no Clumsy/Serrated
 * handling — neither applies to a shield).
 *
 * @param {Actor} actor
 * @param {Item} shield
 * @returns {Promise<{averted: boolean, row: object|null, rollTotal: number}>}
 */
export async function rollShieldBashFumble(actor, shield) {
  const { TRGCheck } = await import("../dice/check.mjs");
  const fumbleDC = Number(shield.system?.shieldBashFumbleDC ?? 6);

  const check = await TRGCheck.roll({
    actor,
    label: `${shield.name} — Fumble Check`,
    subtitle: `DC ${fumbleDC} to avoid a fumble`,
    type: "flat",
    flat: true,
    dc: fumbleDC
  });

  if (check.outcome.degree?.success) {
    return { averted: true, row: null, rollTotal: 0 };
  }

  const roll = await new Roll("1d100").evaluate();
  const row = lookupTableRow(FUMBLE_TABLES.melee, roll.total);
  return { averted: false, row, rollTotal: roll.total };
}

/**
 * The shield bonus actually in force, and what the suppression cost.
 *
 * "You lose any SHIELD bonus gained to DB" — and a parry bonus is not
 * one. Both feed the same highest-wins slot on the sheet, so losing the
 * shield does not always cost anything: a Main-Gauche parrying for 2
 * behind a shield worth 2 leaves the total exactly where it was, and a
 * sheet announcing "shield bonus of 2 lost" would be describing a change
 * that did not happen.
 *
 * WHICH IS WHY THIS RETURNS THE DIFFERENCE rather than the shield's own
 * number. Live testing of 3.284.0 found the DB dropping from 14 to 10
 * with a +4 shield still on the arm and the tooltip still reading "Base
 * and Dexterity" — the right total with no account of itself.
 *
 * @param {object} options
 * @param {number[]} [options.shieldBonuses] each equipped piece's own DB
 *   bonus, already raised by Shield Focus and Shield Ally.
 * @param {number} [options.parry] the parry bonus, which survives.
 * @param {boolean} [options.suppressed] the flag Shield Bash and Shield
 *   Block both set.
 * @returns {{bonus: number, lost: number}}
 */
export function shieldBonusInForce({ shieldBonuses = [], parry = 0, suppressed = false } = {}) {
  const parried = Math.max(0, Number(parry) || 0);
  const pieces = (shieldBonuses ?? []).map((n) => Number(n) || 0);
  const held = Math.max(0, ...pieces, parried);
  const bonus = suppressed ? parried : held;
  return { bonus, lost: Math.max(0, held - bonus) };
}

/**
 * "You lose any shield bonus gained to DB until the beginning of
 * your next turn" — set unconditionally on use, regardless of
 * whether the bash actually hit, matching "if you use a shield bash
 * action" rather than "if you hit."
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function loseShieldBonusUntilNextTurn(actor) {
  await actor.setFlag(SYSTEM_ID, "shieldBashLostBonus", true);
}

/**
 * Called from _onStartTurn, matching this project's existing pattern
 * for other turn-start resets.
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function clearShieldBashLostBonus(actor) {
  await actor.unsetFlag(SYSTEM_ID, "shieldBashLostBonus");
}
