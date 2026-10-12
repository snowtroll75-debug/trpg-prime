/**
 * Bracers of Armour's HP pool, drained (3.617.0, Graham's R17 of block 37).
 *
 * "The magical armour has N HP": the bracers' Base DR is armour, and what
 * that DR stops comes off the pool. At 0 they go inert for an hour, then
 * return at full HP (wondrous-effects.mjs reads the hour back, so nothing
 * has to wake up to restore them).
 *
 * Only when the bracers ARE the armour that stopped it: worn armour with an
 * equal or better DR is what the blow met, and the bracers gave nothing.
 */

import { BRACERS_FLAG, bracersAfterDrain } from "./wondrous-effects.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Were the bracers the Base DR in force against this blow?
 * @param {number} armourDr worn armour's effective DR (after BDB)
 * @param {{dr?: number, itemId?: string}} bracers system.combat.bracers
 */
export function bracersAreTheArmour(armourDr, bracers) {
  // Both as the DR a blow meets (3.617.1): worn armour's after BDB, the
  // bracers' after BSB and capped at their pool.
  // A pair of bracers OR a spell's armour (3.617.2, Mage Armour).
  return Boolean(bracers?.itemId || bracers?.effectId) && Number(bracers?.effective ?? 0) > Math.max(0, Number(armourDr) || 0);
}

/**
 * Drain the pool by what the equipped DR stopped. Returns a card line, or "".
 * @param {Actor} actor the one struck
 * @param {{equippedDrStopped?: number}} packet the resolved damage packet
 * @param {boolean} [bracersSource] from bracersAreTheArmour, decided before
 *   the blow (the state it was struck in); a packet from
 *   resolveAgainstDefences carries its own
 */
export async function drainBracers(actor, packet, bracersSource = packet?.bracersSource) {
  if (!bracersSource || !actor) return "";
  const stopped = Math.max(0, Math.floor(Number(packet?.equippedDrStopped) || 0));
  if (!stopped) return "";
  return drainPool(actor, stopped, { verb: `the magical armour stops ${stopped}` });
}

/**
 * THE ARMOUR'S SHARE OF AN AMENDED CRITICAL (3.617.5).
 *
 * Chapter 6's Critical Amendment: "whenever a critical injury result is
 * modified in your favour due to you wearing armour, your armour takes
 * [damage]". From 3.617.4 Mage Armour and Bracers of Armour cover every
 * location, so they amend criticals — and with no worn piece to take the
 * damage, the card said the armour took it and nothing did. Graham, 4
 * October 2026 (Q2): "Yes it should" come off their pool.
 *
 * Taken by the Base DR in force at the struck spot — the same one the blow's
 * DR drained (MA2: only the armour in force is drained). The pool is the
 * armour's own HP, not an object with a DR of its own, so the damage comes
 * off it whole. At 0 the bracers go inert and the spell is destroyed, as
 * for any drain.
 *
 * @param {Actor} actor the one struck
 * @param {number} amount the amendment's damage (base die × severity)
 * @param {string} working e.g. "base die x2"
 * @returns {Promise<string>} the card line, or "" when there is no pool
 */
export async function absorbAmendment(actor, amount, working = "") {
  const taken = Math.max(0, Math.floor(Number(amount) || 0));
  if (!actor || !taken) return "";
  const bracers = actor.system?.combat?.bracers;
  // Destroyed or spent by the blow's own DR: nothing is left to take it.
  if (!(bracers?.itemId || bracers?.effectId) || !(Number(bracers?.hp) > 0)) return "";
  return drainPool(actor, taken, {
    verb: `the magical armour absorbs the critical: ${taken} damage${working ? ` (${working})` : ""}`
  });
}

/** Take `amount` off whichever Base DR is in force: a pair of bracers or a spell's armour. */
async function drainPool(actor, amount, { verb }) {
  const bracers = actor.system?.combat?.bracers;
  // A SPELL'S ARMOUR (3.617.2, Mage Armour) drains the same way, and at 0
  // "is destroyed and the spell cannot be cast again for 1 hour".
  if (bracers?.source === "effect") return drainSpellArmour(actor, bracers, amount, verb);
  const item = bracers?.itemId ? actor.items?.get?.(bracers.itemId) : null;
  if (!item) return "";
  const now = Number(game.time?.worldTime ?? 0);
  const after = bracersAfterDrain(bracers, amount, now);
  await item.setFlag(SYSTEM_ID, BRACERS_FLAG, { hp: after.hp, inertUntil: after.inertUntil });
  const name = item.name;
  return after.inert
    ? `<p style="margin:2px 0"><em>${name}:</em> ${verb} and is spent — `
      + "the bracers are <strong>inert for 1 hour</strong>, then return at full HP.</p>"
    : `<p style="margin:2px 0"><em>${name}:</em> ${verb} `
      + `(${after.hp}/${bracers.max} HP left).</p>`;
}

/** Mage Armour's pool, on the spell's own effect. */
async function drainSpellArmour(actor, armour, amount, verb) {
  const { SPELL_ARMOUR_FLAG } = await import("./magic/spell-armour.mjs");
  const effect = armour?.effectId ? actor.effects?.get?.(armour.effectId) : null;
  if (!effect) return "";
  const state = effect.getFlag(SYSTEM_ID, SPELL_ARMOUR_FLAG) ?? {};
  const name = armour.itemName || effect.name;
  const left = Math.max(0, (Number(state.hp) || 0) - amount);
  if (left > 0) {
    await effect.setFlag(SYSTEM_ID, SPELL_ARMOUR_FLAG, { ...state, hp: left });
    return `<p style="margin:2px 0"><em>${name}:</em> ${verb} `
      + `(${left}/${Number(state.max) || armour.max} HP left).</p>`;
  }
  // DESTROYED: the spell ends, and may not be cast again for its lockout —
  // the same two steps a spell shield takes when it blocks.
  const castId = armour.castId ?? effect.getFlag(SYSTEM_ID, "castId") ?? null;
  if (castId) {
    const { endActiveSpell } = await import("./magic/active-spells.mjs");
    await endActiveSpell(actor, castId, { dismissed: false });
  }
  if (actor.effects?.get?.(effect.id)) await effect.delete();
  const minutes = Number(state.lockoutMinutes) || 0;
  if (minutes > 0) {
    const { SPELL_RECAST_LOCKOUT_FLAG, withRecastLockout } = await import("./magic/spell-shield.mjs");
    const lockouts = actor.getFlag(SYSTEM_ID, SPELL_RECAST_LOCKOUT_FLAG) ?? {};
    await actor.setFlag(SYSTEM_ID, SPELL_RECAST_LOCKOUT_FLAG,
      withRecastLockout(lockouts, state.spellName || name, Number(game.time?.worldTime ?? 0), minutes));
  }
  return `<p style="margin:2px 0"><em>${name}:</em> ${verb} and is <strong>destroyed</strong>`
    + `${minutes > 0 ? ` — it can't be cast again for ${minutes === 60 ? "1 hour" : `${minutes} minutes`}` : ""}.</p>`;
}
