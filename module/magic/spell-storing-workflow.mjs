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
  STORING_ARMED_FLAG, STORED_SPELL_FLAG, STORED_FOREIGN_FLAG,
  armWindowOpen, storedSpellRecord, spellStoreHostOf, foreignSpellCopyData
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

/**
 * THE ITEM A STORE OPENS IN (3.684.0; Eldritch Arts Block 6, G16 — the fix
 * for Storing Rune). The row's `host` (spell-storing.mjs `spellStoreHostOf`):
 * the Arcane Bond, the spell that opened the window, or an item flagged
 * `spellStore`. `spellId` is that spell's id on this sheet.
 */
export function spellStoreHostFor(actor, { host = "arcaneBond", spellId = "" } = {}) {
  return spellStoreHostOf(actor?.items ?? [], { host, spellId });
}

/**
 * The host an open window names, or the Arcane Bond for a window opened
 * before 3.684.0 (which named none).
 */
export function storeHostFor(actor, armed) {
  const hostId = String(armed?.hostId ?? "").trim();
  return hostId ? spellStoreHostOf(actor?.items ?? [], { hostId }) : bondedItemFor(actor);
}

/** Open the one-round window. */
export async function armStoring(actor, { releaseCost = "1", hostId = "" } = {}) {
  await actor.setFlag(SYSTEM_ID, STORING_ARMED_FLAG, {
    releaseCost,
    // WHERE THE STORE WILL LIVE (3.684.0, G16): blank for the Arcane Bond.
    ...(String(hostId ?? "").trim() ? { hostId: String(hostId).trim() } : {}),
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

/**
 * The spell waiting in this actor's store, or null: the bonded item's first,
 * as always, and otherwise whichever item holds one (3.684.0, G16: a rune's).
 */
export function readStored(actor) {
  const item = bondedItemFor(actor);
  const record = item?.getFlag?.(SYSTEM_ID, STORED_SPELL_FLAG) ?? null;
  if (record) return { item, record };
  for (const other of actor?.items ?? []) {
    const held = other?.getFlag?.(SYSTEM_ID, STORED_SPELL_FLAG) ?? null;
    if (held) return { item: other, record: held };
  }
  return null;
}

/**
 * EVERY STORE THIS ACTOR HOLDS (3.684.0; Eldritch Arts Block 6, G16 — review,
 * Medium): the bonded item's first, then each other item holding one (a
 * Storing Rune's). `readStored` answers only the first, so a sheet with a
 * staff AND a rune each holding a spell could release only the staff's: the
 * sheet lists every store, and each Release names its host.
 *
 * @returns {Array<{item: Item, record: object}>}
 */
export function readAllStored(actor) {
  const out = [];
  const bond = bondedItemFor(actor);
  const first = readStoredIn(bond);
  if (first) out.push(first);
  for (const other of actor?.items ?? []) {
    if (other === bond) continue;
    const held = readStoredIn(other);
    if (held) out.push(held);
  }
  return out;
}

/** An absorbed spell's copy is deleted with its record (3.684.0, G16). */
async function dropForeignCopy(actor, record) {
  if (!record?.foreign || !record.spellId) return;
  const copy = actor?.items?.get?.(record.spellId) ?? null;
  if (copy?.getFlag?.(SYSTEM_ID, STORED_FOREIGN_FLAG)) await copy.delete().catch(() => {});
}

/**
 * Put a spell in the staff, returning whatever it displaced.
 *
 * ONE AT A TIME, which is the spell's own sentence. The displaced record
 * is returned rather than dropped so the card can name it — the PP for
 * it is already spent, and a resource that vanishes without a line is a
 * resource a player still thinks they have.
 */
export async function storeSpell(actor, fields, host = null) {
  // THE HOST THE WINDOW OPENED ON (3.684.0, G16), else the bond as before.
  const item = host ?? bondedItemFor(actor);
  if (!item) return null;
  const displaced = item.getFlag?.(SYSTEM_ID, STORED_SPELL_FLAG) ?? null;
  await item.setFlag(SYSTEM_ID, STORED_SPELL_FLAG, storedSpellRecord({
    ...fields,
    storedAt: Number(game.time?.worldTime ?? 0)
  }));
  if (displaced && displaced.spellId !== fields?.spellId) await dropForeignCopy(actor, displaced);
  return { item, displaced };
}

/** The spell waiting in one host item, or null (3.684.0, G16). */
export function readStoredIn(item) {
  const record = item?.getFlag?.(SYSTEM_ID, STORED_SPELL_FLAG) ?? null;
  return record ? { item, record } : null;
}

/** Empty one host item's store (3.684.0, G16): a rune's, not the staff's. */
export async function clearStoredIn(actor, item) {
  const held = readStoredIn(item);
  if (!held) return;
  await item.unsetFlag(SYSTEM_ID, STORED_SPELL_FLAG);
  await dropForeignCopy(actor, held.record);
}

// `clearStored(actor)` — "empty whichever item holds the store" — was
// DELETED at 3.684.0 (G16 review): its one caller, Spell Storing's effect,
// emptied a Storing Rune's store when the bond's was empty. Every store is
// now emptied by its host: `clearStoredIn(actor, item)`.

/**
 * STORE A SPELL ANOTHER CREATURE CAST (3.684.0; Eldritch Arts Block 6, G16):
 * Runebreaker's absorb. `source` is the incoming spell (an Item or its data);
 * it is copied onto the storer, flagged `storedForeign` (so it is cast only
 * by its release), and stored in `host` (an item; else the store host the
 * storer's Storing Rune names, else the bond) "at the PP its caster paid"
 * (Q115) with that cast's warp `mods`. On release the storer is its caster.
 *
 * @param {Actor} actor the storer
 * @param {Item|object} source the spell absorbed
 * @param {{ppPaid?: number, mods?: object, notes?: string[], releaseCost?: string, host?: Item|null, from?: {name?: string, uuid?: string}}} opts
 * @returns {Promise<{item: Item, displaced: object|null, spell: Item}|null>} null when there is nowhere to store it
 */
export async function storeForeignSpell(actor, source, { ppPaid = 0, mods = {}, notes = [], releaseCost = "1", host = null, from = {} } = {}) {
  const item = host ?? bondedItemFor(actor);
  if (!actor || !item || !source) return null;
  // STRIPPED OF ITS CASTER'S STATE (3.684.0, G16 — review): innate, item-cast,
  // signature, innate metamagic and the book/preparation marks went across
  // as they were. See spell-storing.mjs `foreignSpellCopyData`.
  const raw = foreignSpellCopyData(
    typeof source?.toObject === "function" ? source.toObject() : foundry.utils.deepClone(source),
    { fromName: from?.name ?? "", fromUuid: from?.uuid ?? "" });
  const [copy] = await actor.createEmbeddedDocuments("Item", [raw]);
  if (!copy) return null;
  const kept = await storeSpell(actor, {
    spellId: copy.id, spellName: copy.name, ppPaid, mods, notes, releaseCost,
    foreign: true, foreignFrom: String(from?.name ?? ""), foreignFromUuid: String(from?.uuid ?? "")
  }, item);
  return kept ? { ...kept, spell: copy } : null;
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
export async function releaseStoredSpell(actor, { hostId = "" } = {}) {
  // WHICH STORE (3.684.0, G16 — review): the sheet's Release names its host,
  // so a rune's spell can be released while the staff holds one too. With no
  // host named, the first store, as before.
  const named = String(hostId ?? "").trim();
  const held = named ? readStoredIn(actor?.items?.get?.(named) ?? null) : readStored(actor);
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
  // AN ABSORBED SPELL (3.684.0; Eldritch Arts Block 6, G16): cast as the
  // storer's own (Q115, "On release you are its caster"), settling nothing,
  // and its copy deleted once the release is over, whatever came of it.
  if (record.foreign) {
    try {
      return await castSpell(actor, spell, {
        stored: { ppPaid: record.ppPaid, mods: record.mods, notes: record.notes, foreign: true, foreignFrom: record.foreignFrom ?? "" }
      });
    } finally {
      await dropForeignCopy(actor, record);
    }
  }
  return castSpell(actor, spell, {
    stored: { ppPaid: record.ppPaid, mods: record.mods, notes: record.notes }
  });
}
