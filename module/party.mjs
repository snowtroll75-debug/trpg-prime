/**
 * The Party sheet's rules, as plain data.
 *
 * A party actor is a container the GM curates: a roster of characters
 * (PC or NPC) chosen by hand, and a shared loot pile that players can
 * take from. It has no HP, no attributes and rolls nothing — everything
 * it shows about a member is READ FROM THAT MEMBER, never copied onto
 * the party. A summary that stores its own copy of someone's hit points
 * is a summary that will one day disagree with them.
 *
 * WHY THE ROSTER IS UUIDS AND NOT EMBEDDED ACTORS
 *
 * Foundry actors cannot contain actors. The roster is therefore a list
 * of references, resolved when the sheet renders. That also makes the
 * failure mode benign: a member deleted from the world resolves to
 * nothing and is reported as a missing row the GM can clear, rather
 * than corrupting the party.
 *
 * Pure. No Foundry, no documents — every function here takes plain data
 * and returns plain data, so the harness can drive every branch,
 * including the ones that only happen when a player asks for something
 * they should not have.
 */

import { carriedWeightOf } from "./items.mjs";

/** The actor type this module is about. */
export const PARTY_TYPE = "party";

/**
 * What may sit in the party loot.
 *
 * `affliction` is deliberately absent even though it carries the
 * `physical` item template (it has a quantity and a weight, so it looks
 * like gear to the schema). A disease is not treasure, and a "Take"
 * button beside one is an invitation to a bug report.
 */
export const LOOT_ITEM_TYPES = Object.freeze([
  "weapon", "armour", "shield", "gear", "consumable", "ammunition"
]);

/**
 * The coin denominations, largest first — the order the character
 * sheet's own purse prints them in, so the two read alike.
 */
export const COIN_DENOMINATIONS = Object.freeze(["mp", "pp", "gp", "sp", "cp"]);

const str = (value) => String(value ?? "").trim();
const int = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
};
const nonNegative = (value) => Math.max(0, int(value));

/* ------------------------------------------------------------------ */
/* The roster                                                          */
/* ------------------------------------------------------------------ */

/**
 * The stored member list, cleaned up.
 *
 * Deduplicated and stripped of blanks, because the GM adds members by
 * dropping actors on the sheet and dropping the same actor twice is an
 * ordinary thing to do by accident. Order is preserved — the GM's
 * chosen order is information.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normaliseMembers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const uuid = str(entry);
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push(uuid);
  }
  return out;
}

/** @returns {string[]} the roster with `uuid` added, or unchanged if present. */
export function addMember(members, uuid) {
  const list = normaliseMembers(members);
  const id = str(uuid);
  if (!id || list.includes(id)) return list;
  return [...list, id];
}

/** @returns {string[]} the roster without `uuid`. */
export function removeMember(members, uuid) {
  const id = str(uuid);
  return normaliseMembers(members).filter((entry) => entry !== id);
}

/**
 * May this actor be put on a roster?
 *
 * PCs and NPCs, per Graham's brief. Companions and familiars are
 * excluded: they already appear through their master, and a party list
 * that silently doubles in size the moment someone takes an animal
 * companion is not the summary the GM asked for. A party cannot contain
 * a party for the obvious reason.
 *
 * @param {{type?: string}} actor
 */
export function canJoinRoster(actor) {
  return ["character", "npc"].includes(str(actor?.type));
}

/**
 * A bar's percentage, clamped to 0–100.
 *
 * Guards the two cases that turn up in real worlds: a max of zero (a
 * freshly made NPC, or a character with no PP at all), which must read
 * 0 rather than NaN or Infinity; and a value above max, which happens
 * with temporary hit points and must not overflow the bar.
 */
export function barPercent(value, max) {
  const top = Number(max) || 0;
  if (top <= 0) return 0;
  const pct = (Number(value) || 0) / top * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * One roster row, read from a member actor.
 *
 * Takes an actor-shaped object rather than a document so the harness can
 * put shapes past it that a live world would take an hour to arrange —
 * a character at 0 HP, one with temporary HP above max, one with no
 * class, one that is missing entirely.
 *
 * @param {object|null} actor
 * @param {string} uuid The roster entry this came from, kept so a
 *   missing member still has something to remove.
 * @param {(a: object) => string[]} [readConditions] Injected, because
 *   conditions live on the live document and this module does not touch
 *   documents.
 */
export function memberSummary(actor, uuid, readConditions = () => []) {
  const id = str(uuid);
  if (!actor) {
    // A member the world no longer has. Reported rather than hidden —
    // a roster that quietly shrinks is one the GM cannot fix.
    return { uuid: id, missing: true, name: "(missing actor)", conditions: [] };
  }

  const system = actor.system ?? {};
  const hp = system.resources?.hp ?? {};
  const pp = system.resources?.pp ?? {};
  const identity = system.identity ?? {};

  return {
    uuid: id,
    missing: false,
    id: actor.id ?? null,
    name: str(actor.name) || "(unnamed)",
    img: actor.img ?? null,
    type: str(actor.type),
    isNPC: str(actor.type) === "npc",
    // Race and class are free-text identity fields on this system, so a
    // blank one prints an em dash rather than an empty cell.
    race: str(identity.race) || "—",
    class: str(identity.class) || "—",
    level: nonNegative(identity.level),
    hp: {
      value: int(hp.value),
      max: nonNegative(hp.max),
      temp: nonNegative(hp.temp),
      pct: barPercent(hp.value, hp.max)
    },
    pp: {
      value: int(pp.value),
      max: nonNegative(pp.max),
      pct: barPercent(pp.value, pp.max)
    },
    conditions: (readConditions(actor) ?? []).map((c) => str(c)).filter(Boolean)
  };
}

/* ------------------------------------------------------------------ */
/* The loot                                                           */
/* ------------------------------------------------------------------ */

/** Is this the kind of thing that can sit in party loot? */
export function isLootItem(item) {
  return LOOT_ITEM_TYPES.includes(str(item?.type));
}

/** An item's quantity, floored at zero. */
export function quantityOf(item) {
  return nonNegative(item?.system?.quantity ?? 1);
}

/**
 * The loot list, with the totals the sheet prints.
 *
 * Weight is quantity-aware — five suits of plate weigh five times one
 * suit, and a party pile is exactly where that stops being a rounding
 * error.
 */
export function lootSummary(items = []) {
  const rows = [];
  let weight = 0;
  for (const item of items) {
    if (!isLootItem(item)) continue;
    const quantity = quantityOf(item);
    const each = Math.max(0, Number(item?.system?.weight) || 0);
    // Bundled goods weigh by the bundle — a quiver of twenty arrows is
    // 3 lb, not 60. carriedWeightOf owns that rule for the whole system.
    weight += carriedWeightOf(item);
    rows.push({
      id: item.id ?? null,
      name: str(item.name) || "(unnamed)",
      img: item.img ?? null,
      type: str(item.type),
      quantity,
      weight: each,
      totalWeight: Math.round(carriedWeightOf(item) * 100) / 100
    });
  }
  return {
    rows,
    count: rows.length,
    totalWeight: Math.round(weight * 100) / 100,
    empty: rows.length === 0
  };
}

/* ------------------------------------------------------------------ */
/* Taking things                                                      */
/* ------------------------------------------------------------------ */

/**
 * Whether a take may proceed, and what it does to the source stack.
 *
 * THIS IS THE SECURITY BOUNDARY, so it is a pure function the harness
 * can exhaust rather than a check scattered through a socket handler.
 * The request arrives from a player's client and every field in it is
 * that player's assertion — the item id, the quantity, the destination.
 * Nothing here trusts any of it; `userOwnsDestination` in particular is
 * resolved by the GM's client from its own documents, never taken from
 * the message.
 *
 * @param {object} options
 * @param {object|null} options.item The item as the PARTY holds it.
 * @param {number} options.requested
 * @param {boolean} options.userOwnsDestination
 * @returns {{ok: true, take: number, remaining: number, deleteSource: boolean}
 *   | {ok: false, reason: string}}
 */
export function planTake({ item, requested, userOwnsDestination }) {
  if (!userOwnsDestination) {
    return { ok: false, reason: "you do not own that character" };
  }
  if (!item) {
    // The ordinary race: two players click Take on the last potion at
    // the same time. The loser is told plainly rather than shown an error.
    return { ok: false, reason: "that item is no longer in the party loot" };
  }
  if (!isLootItem(item)) {
    return { ok: false, reason: `${str(item.name) || "that"} cannot be taken` };
  }
  const have = quantityOf(item);
  const want = int(requested);
  if (want < 1) return { ok: false, reason: "ask for at least one" };
  if (have < 1) return { ok: false, reason: "there are none left" };
  if (want > have) {
    return { ok: false, reason: `only ${have} left of ${str(item.name)}` };
  }
  return { ok: true, take: want, remaining: have - want, deleteSource: want === have };
}

/**
 * An existing stack on the destination that a taken item should join,
 * or null if it should arrive as its own row.
 *
 * WHY THIS EXISTS. Without it, taking six rope from a pile you already
 * took four from leaves TWO "Rope, Hemp" rows of 4 and 6 rather than one
 * of 10. Seen live, 12 Aug 2026, first time a stack was taken twice — a
 * player restocking arrows across a session would end up with a column
 * of identical entries.
 *
 * DELIBERATELY CONSERVATIVE. Two items merge only when everything about
 * them matches except how many there are: same name, same type, same
 * flags, and the same `system` payload once quantity and the
 * carry-state fields are set aside. That last part is the point — this
 * system puts runes, quality and material on the item, so a lazier rule
 * matching on name alone would quietly merge a +1 Broadsword into a
 * plain one and destroy the difference. When in doubt it does not merge,
 * which is only ever untidy; merging wrongly loses data.
 *
 * @param {object[]} existing the destination's items
 * @param {object} payload the item about to be created
 * @returns {object|null}
 */
export function findMergeTarget(existing = [], payload = null) {
  if (!payload || !isLootItem(payload)) return null;
  const fingerprint = (item) => {
    const system = { ...(item?.system ?? {}) };
    delete system.quantity;
    delete system.stowed;
    delete system.equipped;
    return JSON.stringify({
      name: str(item?.name),
      type: str(item?.type),
      system,
      flags: item?.flags ?? {}
    });
  };
  const want = fingerprint(payload);
  return existing.find((item) => fingerprint(item) === want) ?? null;
}

/** A coin request, cleaned to whole non-negative amounts. */
export function normaliseCoin(raw) {
  const out = {};
  for (const key of COIN_DENOMINATIONS) out[key] = nonNegative(raw?.[key]);
  return out;
}

/** True when every denomination is zero. */
export function coinIsEmpty(coin) {
  const c = normaliseCoin(coin);
  return COIN_DENOMINATIONS.every((key) => c[key] === 0);
}

/**
 * Whether a coin withdrawal may proceed, and what each purse becomes.
 *
 * DENOMINATION BY DENOMINATION, deliberately — NOT by converting both
 * purses to a gp value and comparing. `deductCurrency` in items.mjs does
 * convert, because a shopkeeper making change is exactly that; but a
 * player taking coin from a pile is picking up specific coins. If the
 * party has 5 gp and a player asks for 50 sp, the honest answer is "the
 * party has no silver", not a silent conversion that empties the gold.
 *
 * @returns {{ok: true, taken: object, remaining: object}
 *   | {ok: false, reason: string}}
 */
export function planCoinTake({ pot, request, userOwnsDestination }) {
  if (!userOwnsDestination) {
    return { ok: false, reason: "you do not own that character" };
  }
  const have = normaliseCoin(pot);
  const want = normaliseCoin(request);
  if (coinIsEmpty(want)) return { ok: false, reason: "no coin was requested" };

  const short = COIN_DENOMINATIONS.filter((key) => want[key] > have[key]);
  if (short.length) {
    return {
      ok: false,
      reason: `the party does not have that much ${short.map((k) => k.toUpperCase()).join(", ")}`
    };
  }

  const remaining = {};
  for (const key of COIN_DENOMINATIONS) remaining[key] = have[key] - want[key];
  return { ok: true, taken: want, remaining };
}

/** Add a taken purse to a destination purse. */
export function addCoin(purse, taken) {
  const a = normaliseCoin(purse);
  const b = normaliseCoin(taken);
  const out = {};
  for (const key of COIN_DENOMINATIONS) out[key] = a[key] + b[key];
  return out;
}

/**
 * A short line for the chat card a transfer posts.
 *
 * The party pile is shared, so a take is other people's business —
 * announcing it is what stops the pile becoming an argument.
 */
export function coinLine(coin) {
  const c = normaliseCoin(coin);
  const parts = COIN_DENOMINATIONS
    .filter((key) => c[key] > 0)
    .map((key) => `${c[key]} ${key.toUpperCase()}`);
  return parts.join(", ");
}
