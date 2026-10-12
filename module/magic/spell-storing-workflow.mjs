/**
 * The Foundry side of Spell Storing (see spell-storing.mjs).
 *
 * NEW at 3.495.0.
 *
 * THE INTERCEPT IS ONE GATE, at the top of `castSpell`, for the reason
 * Delayed Respite's damage gate gives in its own comment: every route
 * that casts a spell crosses that one function, so a spell that asked
 * each caller to remember would work for the Magic tab and not for a
 * granted spell, a deific aspect or an archetype slot.
 */

import {
  STORING_ARMED_FLAG, STORED_SPELL_FLAG,
  armWindowOpen, storedSpellRecord
} from "./spell-storing.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The item a stored spell lives in, or null.
 *
 * THE BONDED ITEM, NOT THE ABILITY. `arcaneBondItem` finds the Arcane
 * Bond ability; the daily designation is a flag written onto whichever
 * item was chosen, which is what `spellAdderSources` reads. So the store
 * follows the designation rather than the ability — a wizard who
 * re-designates tomorrow has a different staff, exactly as the ability
 * says.
 */
export function bondedItemFor(actor) {
  for (const item of actor?.items ?? []) {
    if (item?.flags?.[SYSTEM_ID]?.arcaneBond) return item;
  }
  return null;
}

/** Open the one-round window. */
export async function armStoring(actor, { releaseCost = "1" } = {}) {
  await actor.setFlag(SYSTEM_ID, STORING_ARMED_FLAG, {
    releaseCost,
    round: game.combat?.started ? Number(game.combat.round ?? 0) : null,
    worldTime: Number(game.time?.worldTime ?? 0)
  });
}

/** The open window, or null when there is none or it has closed. */
export function readArmed(actor) {
  const armed = actor?.getFlag?.(SYSTEM_ID, STORING_ARMED_FLAG) ?? null;
  if (!armed) return null;
  const open = armWindowOpen(armed, {
    round: game.combat?.started ? Number(game.combat.round ?? 0) : null,
    worldTime: Number(game.time?.worldTime ?? 0)
  });
  return open ? armed : null;
}

/** Close the window, whether it was used or not. */
export async function disarmStoring(actor) {
  if (actor?.getFlag?.(SYSTEM_ID, STORING_ARMED_FLAG)) {
    await actor.unsetFlag(SYSTEM_ID, STORING_ARMED_FLAG);
  }
}

/** The spell waiting in this actor's bonded item, or null. */
export function readStored(actor) {
  const item = bondedItemFor(actor);
  const record = item?.getFlag?.(SYSTEM_ID, STORED_SPELL_FLAG) ?? null;
  return record ? { item, record } : null;
}

/**
 * Put a spell in the staff, returning whatever it displaced.
 *
 * ONE AT A TIME, which is the spell's own sentence. The displaced record
 * is returned rather than dropped so the card can name it — the PP for
 * it is already spent, and a resource that vanishes without a line is a
 * resource a player still thinks they have.
 */
export async function storeSpell(actor, fields) {
  const item = bondedItemFor(actor);
  if (!item) return null;
  const displaced = item.getFlag?.(SYSTEM_ID, STORED_SPELL_FLAG) ?? null;
  await item.setFlag(SYSTEM_ID, STORED_SPELL_FLAG, storedSpellRecord({
    ...fields,
    storedAt: Number(game.time?.worldTime ?? 0)
  }));
  return { item, displaced };
}

/** Empty the staff. */
export async function clearStored(actor) {
  const item = bondedItemFor(actor);
  if (item?.getFlag?.(SYSTEM_ID, STORED_SPELL_FLAG)) {
    await item.unsetFlag(SYSTEM_ID, STORED_SPELL_FLAG);
  }
}

/**
 * Release the spell waiting in the staff.
 *
 * REUSES `castSpell` RATHER THAN REPLAYING IT, which is the ruling's own
 * word: "the normal resolution — targets, Cast a Spell check, saves". A
 * replay engine would be a second implementation of the largest function
 * in the system, free to disagree with it about every rule added after
 * the day it was written.
 *
 * THE RECORD IS CLEARED BEFORE THE CAST, not after. The release runs
 * dialogs — targets, a check, saves — and anything that awaits a person
 * can be interrupted; a record still in the staff while its spell is
 * resolving is a spell that can be released twice. This is the shape
 * Delayed Respite's packet clear took, for the same reason.
 *
 * @returns {Promise<object|null>} the cast's result, or null
 */
export async function releaseStoredSpell(actor) {
  const held = readStored(actor);
  if (!held) {
    ui.notifications.warn(`${actor.name} has no spell stored.`);
    return null;
  }
  const { item, record } = held;
  const spell = actor.items.get(record.spellId) ?? null;
  if (!spell) {
    // THE SPELL ITSELF IS GONE — deleted, or the sheet rebuilt. Said out
    // loud and the staff emptied, because a record pointing at nothing
    // would refuse forever and block the next storage.
    ui.notifications.warn(
      `${record.spellName} is no longer on ${actor.name}'s sheet — the store is cleared.`);
    await item.unsetFlag(SYSTEM_ID, STORED_SPELL_FLAG);
    return null;
  }

  const { ensureActionPoints, spendActionCost } =
    await import("../combat/action-points-workflow.mjs");
  // FREE COSTS NOTHING AND IS ASKED NOTHING. The +8 PP warp's whole
  // purchase is that there is no action to find.
  if (record.releaseCost !== "free") {
    const cost = record.releaseCost === "reaction" ? "reaction" : "1";
    if (!(await ensureActionPoints(actor, cost, `Release ${record.spellName}`))) return null;
    await spendActionCost(actor, cost, `Release ${record.spellName}`, { traits: "Concentrate" });
  }

  await item.unsetFlag(SYSTEM_ID, STORED_SPELL_FLAG);
  const { castSpell } = await import("./cast-workflow.mjs");
  return castSpell(actor, spell, {
    stored: { ppPaid: record.ppPaid, mods: record.mods, notes: record.notes }
  });
}
