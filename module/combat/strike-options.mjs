/**
 * PER-STRIKE OPTIONS (3.668.0), for Inner Tempest's Block 4.
 *
 *   Shadowy Step: "The target of your attack is considered to be flanked,
 *   regardless of your actual positioning."
 *   Formless Cut: "This attack … ignores the target's active stance or form
 *   bonuses … and treats the target as flat-footed."
 *
 * `rollWeaponAttack` takes `treatAsFlanked`, `treatAsFlatFooted` and
 * `ignoreTargetStance`; the rules for what each adds live here.
 *
 * Pure: no Foundry.
 */

import { stackDefenceRows } from "./defence-dc.mjs";

/**
 * What a target's stances give its DB against this attacker, to be paid
 * back as a bonus on the attack, as Surprise Attack pays "flat-footed to
 * you": the stance's own effect changes to DB, any stat row a stance's
 * effect carries, and the defence rows read only in a stance.
 *
 * STACKED BOTH WAYS (3.684.1, review). Since defence rows stack by type
 * with the DB's own entries, a stance's bonus may raise the DB by less than
 * its value (a +4 status stance row over a +1 status on the sheet adds +3),
 * and may hold another bonus down (a +2 status ward under it adds nothing
 * while the stance is up, and +2 once it is ignored). So what is paid back
 * is the stacked DB with the stance less the stacked DB without it — the
 * same `stackDefenceRows` both times — and never below 0.
 *
 * @param {object} args
 * @param {object[]} args.breakdown the DB entries the rows stack against
 *   (`defenceStackBase`: the breakdown, or what a restricted DB kept)
 * @param {string[]} args.stanceUuids the uuids of its active stance effects
 * @param {object[]} args.dcEntries every defence row that met this attack,
 *   and any other row stacked with them (Fearful Power's status row)
 * @returns {{total: number, labels: string[]}}
 */
export function stanceDefenceOf({ breakdown = [], stanceUuids = [], dcEntries = [] } = {}) {
  const uuids = new Set((stanceUuids ?? []).map(String));
  const base = Array.from(breakdown ?? []).filter(Boolean);
  const rows = Array.from(dcEntries ?? []).filter(Boolean);
  const stanceBase = (entry) => uuids.has(String(entry.carrierUuid ?? entry.source ?? "")) && (Number(entry.value) || 0) > 0;
  const stanceRow = (entry) => Boolean(entry.fromStance) && (Number(entry.value) || 0) > 0;
  const labels = [...base.filter(stanceBase), ...rows.filter(stanceRow)].map((e) => `${e.label} +${Number(e.value) || 0}`);
  if (!labels.length) return { total: 0, labels };
  const withStance = stackDefenceRows(rows, base).together;
  const without = stackDefenceRows(rows.filter((e) => !stanceRow(e)), base.filter((e) => !stanceBase(e))).together;
  return { total: Math.max(0, withStance - without), labels };
}

/**
 * The flanking row a Strike that is "considered flanked" adds, or null when
 * the target is already flanked or cannot be.
 *
 * @param {{alreadyFlanking: boolean, cannotBeFlanked: boolean, bonus: number, label: string}} args
 */
export function treatedFlankingRow({ alreadyFlanking = false, cannotBeFlanked = false, bonus = 2, label = "This Strike" } = {}) {
  if (alreadyFlanking || cannotBeFlanked) return null;
  return { label: `Flanking (${label}: the target is considered flanked)`, value: Number(bonus) || 0, type: "circumstance" };
}

/**
 * The "flat-footed to you" row a Strike that "treats the target as
 * flat-footed" adds: the Dexterity and dodge it would lose. Nothing when it
 * is flat-footed already, or flat-footed to you for another reason.
 *
 * @param {{alreadyFlatFooted: boolean, loses: number, targetName: string, label: string}} args
 */
export function treatedFlatFootedRow({ alreadyFlatFooted = false, loses = 0, targetName = "The target", label = "This Strike" } = {}) {
  if (alreadyFlatFooted || !(Number(loses) > 0)) return null;
  return { label: `${targetName} is treated as flat-footed (${label})`, value: Number(loses), type: "circumstance" };
}

/** The Dexterity and dodge a target would lose by being flat-footed. */
export function flatFootedLoss(defence = {}) {
  const dex = Math.max(0, Number(defence?.ability) || 0);
  const dodge = Math.max(0, Number(defence?.breakdown?.byType?.dodge) || 0);
  return dex + dodge;
}

/**
 * A PENALTY TO REACTION ATTACKS AGAINST THE BEARER (3.668.0; Inner Tempest's
 * Flickering Flame: "Enemies suffer a -5 penalty to hit you with reaction
 * attacks"). Declared on the defender's item or effect:
 *
 *   flags.trg-prime.reactionAttackPenalty = { value: -5, label: "Flickering Flame" }
 *
 * The rows to add to a reaction Strike against it; disabled effects skipped.
 *
 * @param {Iterable<object>} carriers the defender's items and applied effects
 * @returns {Array<{label: string, value: number, type: string}>}
 */
export function reactionAttackPenaltyRows(carriers = []) {
  const out = [];
  for (const carrier of carriers ?? []) {
    if (!carrier || carrier.disabled) continue;
    const raw = carrier.flags?.["trg-prime"]?.reactionAttackPenalty;
    for (const row of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const value = Math.trunc(Number(row?.value));
      if (!Number.isFinite(value) || value >= 0) continue;
      out.push({ label: `${row.label ?? carrier.name ?? "Defence"}: reaction attacks against this creature`, value, type: "untyped" });
    }
  }
  return out;
}

/**
 * A TRAIT A WEAPON GROUP GAINS (3.668.0; Inner Tempest's Weapon Discipline:
 * "The weapon gains the Finesse trait if wielded in one hand"). Declared on
 * an item or effect:
 *
 *   flags.trg-prime.weaponTraitGrants = [{ groups: ["sword"], trait: "Finesse", oneHanded: true, label }]
 *
 * OR BY WHAT THE STRIKE IS (3.670.0; Inner Tempest's Mantis Stance, "your
 * unarmed attacks gain the deadly trait", and Dragon Stance's Sweep, ruled
 * unarmed by B6-2): `scope: "unarmed"` reaches every Strike that counts as
 * unarmed (the fists, a gauntlet, a Monastic weapon: unarmed-profile.mjs
 * `countsAsUnarmed`), whatever its group; `scope: "any"` reaches every
 * weapon attack. The fists, the gauntlets and every natural attack share the
 * Brawling group, so a group could not say "unarmed".
 *
 *   flags.trg-prime.weaponTraitGrants = [{ scope: "unarmed", trait: "Deadly", label }]
 *
 * The weapon's traits with what it gains added (once), for this Strike.
 *
 * @param {string} traits the weapon's traits
 * @param {Iterable<object>} carriers the wielder's items and applied effects
 * @param {{group: string, oneHanded: boolean, unarmed: boolean}} weapon
 * @returns {string}
 */
export function traitsWithGroupGrants(traits = "", carriers = [], { group = "", oneHanded = false, unarmed = false } = {}) {
  const have = String(traits ?? "");
  const wanted = String(group ?? "").trim().toLowerCase();
  const added = [];
  for (const carrier of carriers ?? []) {
    if (!carrier || carrier.disabled) continue;
    const raw = carrier.flags?.["trg-prime"]?.weaponTraitGrants;
    for (const row of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const groups = (Array.isArray(row?.groups) ? row.groups : []).map((g) => String(g ?? "").trim().toLowerCase());
      const scope = String(row?.scope ?? "").trim().toLowerCase();
      const trait = String(row?.trait ?? "").trim();
      const reaches = scope === "any" || (scope === "unarmed" && unarmed === true) || (Boolean(wanted) && groups.includes(wanted));
      if (!trait || !reaches) continue;
      if (row.oneHanded && !oneHanded) continue;
      const already = new RegExp(`\\b${trait.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (already.test(have) || added.some((t) => t.toLowerCase() === trait.toLowerCase())) continue;
      added.push(trait);
    }
  }
  return added.length ? [have.trim(), ...added].filter(Boolean).join(", ") : have;
}

/**
 * THE TARGET'S STATE AGAINST THIS ATTACKER (3.668.0), for the conditionals'
 * `targetStates` axis.
 *
 * @param {object} args
 * @param {boolean} args.flatFooted flat-footed to the attacker, for any reason
 * @param {boolean|null} args.targetAlliesAdjacent any of the target's allies
 *   adjacent to it; null when the board cannot say
 * @param {boolean|null} args.attackerAlliesAdjacent any of the attacker's
 *   allies (not the attacker) adjacent to the target; null likewise
 * @returns {string[]}
 */
export function targetStatesOf({ flatFooted = false, targetAlliesAdjacent = null, attackerAlliesAdjacent = null } = {}) {
  const out = [];
  if (flatFooted) out.push("flatfooted");
  if (targetAlliesAdjacent === false) out.push("isolated");
  if (attackerAlliesAdjacent === false) out.push("duel");
  return out;
}
