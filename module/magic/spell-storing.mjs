/**
 * A SPELL CAST NOW AND RESOLVED LATER.
 *
 * NEW at 3.495.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SPELL STORING (PP 1, Wizard, touch, until next daily preparation)
 *
 *   "The next spell that you cast within one round is stored in your Mage
 *    Staff. The stored Spell has no immediate effect (other than of being
 *    stored), but you can then release the spell at any time for 1 AP.
 *    You may only have one spell stored in your staff at any one time and
 *    if you cast the spell again the last spell you stored is dismissed."
 *      +4 PP: the stored spell is released as a reaction, the specifics
 *             of which you must determine when casting.
 *      +8 PP: the stored spell is released as a free action.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 4 SEPTEMBER: PP AT STORAGE, EVERYTHING ELSE AT
 * RELEASE — targets, the Cast a Spell check, and the saves.
 *
 * "The next spell that you CAST" pays at storage; what is suspended is
 * the effect, not the payment. "Has no immediate effect" means nothing
 * was resolved then — a degree rolled at storage would be fixed before
 * any target existed, and saves cannot be rolled until release anyway.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE COLLISION THAT RULING COULD NOT HAVE ANTICIPATED, found by
 * measuring `castingOutcome` before building: THE PRICE DEPENDS ON THE
 * DEGREE.
 *
 *   heroic   ceil(total / 2)        partial  0
 *   critical ceil(base / 2) + warp  failure  floor(total / 2)
 *   success  total                  fumble / blunder  total
 *
 * So "pay at storage" cannot know what to charge while the check waits
 * for the release. Graham ruled on 5 September: CHARGE THE FULL PRICE AT
 * STORAGE AND SETTLE AT RELEASE. Storage takes base + warp — what a
 * Success costs — and the release applies the degree's real price as a
 * refund or a further charge. Every degree then costs exactly what the
 * book says it costs: a Heroic hands half back, a Partial hands all of
 * it back, a Fumble keeps what it already took.
 *
 * THE ALTERNATIVE WAS TO CHARGE FULL AND KEEP IT, which would have made
 * storing a spell quietly more expensive than casting it — a tax the
 * book never mentions, on the one spell whose whole point is timing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "YOUR MAGE STAFF" IS THE ARCANE BOND, Graham's ruling of 5 September.
 *
 * Nothing else in the pack mentions a Mage Staff — Spell Storing is the
 * only entry in 692 spells, 0 items and 0 abilities that says the words.
 * What this system does have is Arcane Bond: "designate a single item you
 * own", chosen afresh each day and recorded as a flag on that item
 * (`wizard.mjs`, `spell-adder.mjs`). That is a wizard's staff in
 * everything but name, and it means the store has somewhere real to live
 * — an object that can be dropped, sundered or left behind.
 *
 * A WIZARD WHO HAS NOT DESIGNATED ONE TODAY CANNOT STORE, and the card
 * says which of the two things is missing rather than failing quietly.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();
const SYSTEM_ID = "trg-prime";

/** Armed on the caster by casting Spell Storing; consumed by the next cast. */
export const STORING_ARMED_FLAG = "spellStoringArmed";

/** The stored spell itself, written on the bonded item. */
export const STORED_SPELL_FLAG = "storedSpell";

/** How long the window to store something stays open, in rounds. */
export const ARM_WINDOW_ROUNDS = 1;

/** Seconds in a round, for the window measured on the world clock. */
const ROUND_SECONDS = 6;

/**
 * A Spell Storing row, or null when it is malformed.
 *
 * `releaseCost` IS DECIDED AT STORAGE, not at release — "the specifics of
 * which you must determine when casting" is the +4 PP warp's own
 * sentence, and it is true of the +8 PP one for the same reason.
 */
export function normaliseSpellStoring(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "spellStoring") return null;
  return {
    label: text(raw.label) || "Spell Storing",
    releaseCost: releaseActionCost(raw),
    host: spellStoreHostKind(raw.host)
  };
}

/*
 * ─────────────────────────────────────────────────────────────────────
 * A STORE HELD BY A RUNE, NOT ONLY A STAFF (3.684.0; Eldritch Arts Block 6,
 * G16 — a FIX).
 *
 * Eldritch Arts' Storing Rune (the Rune birthright's specialist spell, built
 * in its Block 3a on this effect): "The next spell that you cast within one
 * round of casting this spell is stored in ONE OF YOUR RUNES and may be
 * released at a later date … for a 1 AP concentrate action." Until this
 * release the store lived only in an Arcane Bond, so a Rune Sorcerer — who
 * has none — cast Storing Rune and was told "stores into a bonded item and
 * none is designated today": the spell did nothing. Measured in code: the
 * effect case asked `bondedItemFor`, which reads only `flags.arcaneBond`.
 *
 * So the row may name its HOST:
 *   "arcaneBond"  the item designated today (the default, and Spell
 *                 Storing's, unchanged: "your Mage Staff" is the bond);
 *   "spell"       the spell that opened the window holds the stored spell
 *                 itself — "one of your runes" is the rune you cast;
 *   "spellStore"  an owned item flagged `flags.trg-prime.spellStore: true`
 *                 (a module's rune, tattoo or birthright ability).
 * Eldritch Arts' Storing Rune row needs `host: "spell"` (or a flagged item)
 * for the fix to reach it; a row naming no host is read as before.
 */
export const SPELL_STORE_HOSTS = Object.freeze(["arcaneBond", "spell", "spellStore"]);

/** The host a row names, or the Arcane Bond. Pure. */
export function spellStoreHostKind(value) {
  const v = text(value);
  return SPELL_STORE_HOSTS.includes(v) ? v : "arcaneBond";
}

/**
 * The item a store of this kind lives in, among an actor's items, or null.
 * Pure: `items` is any iterable of item-like objects (`{ id, flags }`).
 * @param {Iterable<object>} items
 * @param {{host?: string, spellId?: string, hostId?: string}} opts
 */
export function spellStoreHostOf(items, { host = "arcaneBond", spellId = "", hostId = "" } = {}) {
  const list = Array.from(items ?? []);
  // A WINDOW ALREADY OPEN NAMES ITS HOST, so the store lands where it opened.
  if (text(hostId)) return list.find((i) => i?.id === text(hostId)) ?? null;
  const kind = spellStoreHostKind(host);
  if (kind === "spell") return text(spellId) ? (list.find((i) => i?.id === text(spellId)) ?? null) : null;
  if (kind === "spellStore") return list.find((i) => i?.flags?.["trg-prime"]?.spellStore === true) ?? null;
  return list.find((i) => i?.flags?.["trg-prime"]?.arcaneBond) ?? null;
}

/** What the card says when a non-staff store has nowhere to open. Pure. */
export function noStoreCastLine(spellName, host = "arcaneBond") {
  const kind = spellStoreHostKind(host);
  if (kind === "arcaneBond") return noBondCastLine(spellName);
  return `<em>${spellName} stores into ${kind === "spell" ? "the rune it is cast from, which is not on this sheet"
    : "an item that holds a store, and none is owned"}, so no window opened — the PP for this casting is spent.</em>`;
}

/**
 * A FOREIGN STORED SPELL (3.684.0, G16): one cast BY ANOTHER CREATURE and
 * absorbed — Runebreaker: "You may cast your Storing Rune spell as a reaction
 * triggered by you being targeted by an incoming spell … you absorb the
 * incoming spell and may then release it as if it had been cast into your
 * Storing Rune as normal." Graham's Q115: only a spell whose sole target is
 * you; you pay Storing Rune's PP and your reaction; "On release you are its
 * caster." So the spell is COPIED onto the storer, flagged `storedForeign`,
 * and released through `castSpell` like any stored spell — your check, your
 * DC — with no settlement (its PP were its caster's). The copy is deleted
 * when it is released, displaced or cleared, and cannot be cast directly.
 */
export const STORED_FOREIGN_FLAG = "storedForeign";

/**
 * WHAT AN ABSORBED SPELL'S COPY MUST NOT CARRY (3.684.0; Eldritch Arts Block
 * 6, G16 — review, Medium-low). The copy was `toObject()`'d as-is, so its
 * caster's state rode along: `system.innate` (cast at the caster's innate
 * DC, with no check), `itemCast` (a potion's or wand's fixed PP),
 * `signatureSpell` and `innateMetamagic` (the caster's feats, not the
 * storer's), and the book and preparation marks that make
 * `spellCastBlocked` refuse it. Q115: "On release you are its caster" — the
 * storer's check, the storer's DC — so all of it goes.
 */
const FOREIGN_COPY_STRIPPED_FLAGS = Object.freeze([
  "itemCast", "signatureSpell", "innateMetamagic", "warpDiscount",
  "spellBookPick", "archetypeBook", "archetypeCantrip", "dailyMemorised", "featSpellSlot",
  "repertoirePick", "cantripPick", "grantedBy", STORED_SPELL_FLAG
]);

/**
 * The item data for an absorbed spell's copy, from the incoming spell's
 * plain data. Pure; returns a new object.
 *
 * Stripped as FOREIGN_COPY_STRIPPED_FLAGS says, and `system.innate`,
 * `system.specialist` and `system.prepared` cleared; flagged
 * `storedForeign` (so it is cast only by its release, and
 * `spellAvailability` reads it castable for that release).
 */
export function foreignSpellCopyData(raw, { fromName = "", fromUuid = "" } = {}) {
  const data = raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : {};
  delete data._id;
  data.system = data.system && typeof data.system === "object" ? data.system : {};
  for (const key of ["innate", "specialist", "prepared"]) {
    if (key in data.system) data.system[key] = false;
  }
  data.flags = data.flags && typeof data.flags === "object" ? data.flags : {};
  const ours = data.flags[SYSTEM_ID] && typeof data.flags[SYSTEM_ID] === "object" ? data.flags[SYSTEM_ID] : {};
  for (const key of FOREIGN_COPY_STRIPPED_FLAGS) delete ours[key];
  ours[STORED_FOREIGN_FLAG] = { fromName: text(fromName), fromUuid: text(fromUuid) };
  data.flags[SYSTEM_ID] = ours;
  return data;
}

/** The release card's line for an absorbed spell. Pure. */
export function foreignReleaseLine(spellName, fromName = "") {
  return `<em>${spellName} was absorbed${text(fromName) ? ` from ${text(fromName)}` : ""} and is released as your own casting: `
    + "its PP were its caster's, so nothing in your pool moves.</em>";
}

/**
 * What releasing the stored spell costs, given the warps taken.
 *
 * THE TWO WARPS BOTH CARRIED `mods: {}` and bought nothing — the inert
 * shape Gravity Weapon's and Wild Morph's warps were in before their own
 * releases. What they buy is the ACTION, so that is what they set.
 *
 * @param {object} mods the aggregated warp mods (or a row carrying them)
 * @returns {"1"|"reaction"|"free"}
 */
export function releaseActionCost(mods) {
  const m = mods?.mods ?? mods ?? {};
  // FREE BEATS REACTION when a caster somehow has both. It is the more
  // expensive warp (8 PP against 4) and the strictly better one, so the
  // caster who paid for it gets it — the ordering rule Bless and Bane's
  // stacked options settled.
  if (m.storedReleaseFree) return "free";
  if (m.storedReleaseReaction) return "reaction";
  return "1";
}

/** Is the one-round window to store a spell still open? */
export function armWindowOpen(armed, { round = null, worldTime = null } = {}) {
  if (!armed) return false;
  // EITHER CLOCK, the reason rage and the emanation stamp both record:
  // rounds do not exist outside an encounter and the world clock need not
  // move inside one. A window with neither mark is open — it was armed
  // this instant and nothing has passed at all.
  if (armed.round != null && round != null) {
    return int(round) - int(armed.round) <= ARM_WINDOW_ROUNDS;
  }
  if (armed.worldTime != null && worldTime != null) {
    return int(worldTime) - int(armed.worldTime) <= ARM_WINDOW_ROUNDS * ROUND_SECONDS;
  }
  return true;
}

/**
 * The record written on the bonded item.
 *
 * THE WARP TRAVELS WITH IT, because it was chosen and paid for at
 * storage. Re-offering the chooser at release would let a 1 PP spell be
 * released as a 20 PP one, which is the defect the item-cast path's own
 * comment describes about potions.
 */
export function storedSpellRecord({
  spellId, spellName, ppPaid = 0, mods = {}, notes = [], releaseCost = "1", storedAt = null,
  // ABSORBED FROM ANOTHER CASTER (3.684.0, G16): `foreign` with who cast it.
  foreign = false, foreignFrom = "", foreignFromUuid = ""
} = {}) {
  return {
    spellId: text(spellId),
    spellName: text(spellName) || "a spell",
    ppPaid: Math.max(0, int(ppPaid)),
    mods: mods && typeof mods === "object" ? { ...mods } : {},
    notes: Array.isArray(notes) ? notes.map(text).filter(Boolean) : [],
    releaseCost: ["1", "reaction", "free"].includes(text(releaseCost)) ? text(releaseCost) : "1",
    storedAt: storedAt == null ? null : int(storedAt),
    ...(foreign ? { foreign: true, foreignFrom: text(foreignFrom), foreignFromUuid: text(foreignFromUuid) } : {})
  };
}

/**
 * The settling at release: what the caster owes, or is owed.
 *
 * POSITIVE MEANS PAY MORE, negative means hand it back. One function
 * rather than a comparison at the call site, because the call site is
 * inside a 2,500-line cast and this is the arithmetic somebody will want
 * to read on its own.
 *
 * @param {number} paid what storage took
 * @param {number} due what the release's degree actually costs
 */
export function storedSettlement(paid, due) {
  const owed = Math.max(0, int(due)) - Math.max(0, int(paid));
  return { owed, refund: owed < 0 ? -owed : 0, extra: owed > 0 ? owed : 0 };
}

/** What the card says when the window opens. */
export function armedLine(itemName) {
  return `The next spell cast this round is stored in <strong>${itemName}</strong> `
    + "rather than taking effect.";
}

/** What the card says when a spell goes into the staff. */
export function storedLine(spellName, itemName, ppPaid) {
  return `<strong>${spellName}</strong> is stored in <strong>${itemName}</strong> — `
    + `<strong>${ppPaid}</strong> PP spent now. It has no effect until released.`;
}

/**
 * What the card says when storing displaced something.
 *
 * SAID OUT LOUD. "You may only have one spell stored at any one time and
 * if you cast the spell again the last spell you stored is dismissed" —
 * a stored spell silently overwritten is a resource a player thought
 * they still had, and the PP for it is already gone.
 */
export function displacedLine(oldName) {
  return `<em>${oldName} was already stored and is dismissed — its PP is not returned.</em>`;
}

/**
 * What the card says when a SPELL BEING STORED has nowhere to go.
 *
 * TRUE AT THE INTERCEPT AND ONLY THERE. Nothing has left the pool at
 * that point — the exit in castSpell refuses before it charges — so this
 * is the one place the sentence "no PP was spent" can be said.
 */
export function noBondLine(spellName) {
  return `<em>${spellName} needs a bonded item to be stored in, and none is designated `
    + "today. Use Arcane Bond first — nothing was stored and no PP was spent.</em>";
}

/**
 * What the card says when SPELL STORING ITSELF has no staff to open.
 *
 * A SECOND SENTENCE, BECAUSE THE FIRST ONE WAS A LIE HERE. Found live on
 * 5 September 2026: the cast printed "no PP was spent" directly above
 * its own "1 PP locked until your next daily preparations" line. Spell
 * Storing has already been paid for by the time its effects apply — the
 * refusal is at the effect stage, exactly as Wild Morph's missing
 * Studied Target is — so what is true is that the window did not open,
 * not that nothing was spent.
 */
export function noBondCastLine(spellName) {
  return `<em>${spellName} stores into a bonded item and none is designated today, so no `
    + "window opened. Use Arcane Bond first — the PP for this casting is spent.</em>";
}

/** What the release card says about the settling. */
export function settlementLine(spellName, paid, due) {
  const s = storedSettlement(paid, due);
  if (s.refund) {
    return `<em>${spellName} was paid for at ${paid} PP and cost ${due} — `
      + `<strong>${s.refund}</strong> PP returned.</em>`;
  }
  if (s.extra) {
    return `<em>${spellName} was paid for at ${paid} PP and cost ${due} — `
      + `<strong>${s.extra}</strong> PP more taken.</em>`;
  }
  return `<em>${spellName} was paid for in full at storage (${paid} PP).</em>`;
}

/**
 * The clauses this spell hands to the table, named on every cast.
 *
 * THE ONE-ROUND WINDOW IS THE HALF A PLAYER LOSES SILENTLY: cast Spell
 * Storing, get interrupted, and the window closes with nothing in it.
 */
export function spellStoringRemainderLine() {
  return "<em>The window lasts one round: the next spell you cast in it is stored instead of "
    + "resolving, and if you cast nothing the window simply closes. A stored spell waits until "
    + "you release it, and storing another dismisses the first.</em>";
}
