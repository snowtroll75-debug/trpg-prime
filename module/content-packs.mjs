/**
 * Federated content packs (3.560.0).
 *
 * Every chooser, grant and lookup in this system used to read one
 * compendium by literal id — `game.packs.get("trg-prime.spells")` — in
 * some sixty places. That is fine while the system is the only package
 * with content, and wrong the day a sourcebook ships as a module: a
 * module's feats live in "<module>.<pack>", and nothing here would ever
 * look there.
 *
 * `contentPack("spells")` is what those sixty places call now. It
 * returns a FEDERATED PACK: an object with the same four members those
 * call sites actually use — `getIndex`, `getDocument`, `getDocuments`,
 * `index` — that reads the system pack FIRST and then every module pack
 * that extends it. A module pack extends a logical pack in one of two
 * ways:
 *
 *   1. In module.json, on the pack entry:
 *        "flags": { "trg-prime": { "extends": "spells" } }
 *      No code needed. This is the way to do it.
 *   2. At runtime, `game.trgPrime.modules.registerPack(id, "spells")`.
 *
 * Only Item packs federate. Actor packs (bestiary, actors, monsters) are
 * browsed through Foundry's own compendium UI and nothing here reads
 * them by id.
 *
 * SYSTEM FIRST, ALWAYS. Where a module pack contains an entry with the
 * same name as a core one, the core entry is the one a name match finds,
 * because every consumer takes the first match and the system pack is
 * first. A module cannot shadow core content by accident — or on purpose.
 *
 * IDS ARE ASSUMED UNIQUE ACROSS THE FEDERATION. Foundry ids are sixteen
 * random characters; two packs colliding is not a case worth code. If
 * it ever happens, `getDocument` returns the system one.
 *
 * WHY A FACADE AND NOT A REWRITE OF EVERY CALL SITE. The call sites are
 * the accumulated shape of two hundred releases; each does its own
 * `index.find(...)`, `Array.from(index.values())`, `for (const e of
 * index)`. A facade that returns something iterable in exactly the ways
 * a Foundry Collection is — values on iteration, `.find`, `.filter`,
 * `.map`, `.values()`, `.get` — lets each site change ONE token and keep
 * the rest, which is a refactor that can be verified by grep.
 */
import { registeredPackIds, registeredLogicalName } from "./module-api.mjs";

export const SYSTEM_ID = "trg-prime";

/**
 * A Map that iterates its VALUES, the way foundry.utils.Collection does,
 * with the handful of array helpers call sites lean on. Built here rather
 * than by subclassing Collection so the pure harness can construct one
 * without a Foundry global.
 */
class FederatedIndex extends Map {
  [Symbol.iterator]() { return this.values(); }
  get contents() { return Array.from(this.values()); }
  find(fn) { for (const v of this.values()) if (fn(v)) return v; return undefined; }
  filter(fn) { return this.contents.filter(fn); }
  map(fn) { return this.contents.map(fn); }
  some(fn) { return this.contents.some(fn); }
  every(fn) { return this.contents.every(fn); }
  toArray() { return this.contents; }
}

/**
 * Which module packs extend a logical pack. Read fresh each call: the
 * answer depends on which modules are active, and that is decided before
 * any of this runs, so there is nothing worth caching and one thing
 * (a runtime registerPack) worth not caching.
 *
 * @param {string} logicalName "spells", "feats", ...
 * @param {Iterable} [packs] game.packs by default; injectable for tests.
 * @returns {object[]} Compendium collections, system pack first.
 */
export function contentPacksFor(logicalName, packs = globalThis.game?.packs) {
  const wanted = String(logicalName ?? "").trim();
  if (!wanted || !packs) return [];
  const all = Array.from(packs.values?.() ?? packs);
  const system = all.find((p) => p.metadata?.packageName === SYSTEM_ID && p.metadata?.name === wanted) ?? null;
  const registered = new Set(registeredPackIds(wanted));
  const eligible = (p) => p !== system && p.metadata?.packageName !== SYSTEM_ID
    && !(p.metadata?.type && p.metadata.type !== "Item");
  const declares = (p) => {
    const declared = p.metadata?.flags?.[SYSTEM_ID]?.extends;
    return Boolean(declared) && String(declared).trim() === wanted;
  };
  const idOf = (p) => p.collection ?? p.metadata?.id ?? `${p.metadata?.packageName}.${p.metadata?.name}`;
  // A pack that DECLARES it extends this one comes before a pack merely
  // registered against it (3.628.0) — Fiends & Fables' packs are joined on
  // the system's say-so, after the books that declared themselves, so a
  // name both print resolves to the declaring book wherever the first match
  // is taken. The system pack is first either way.
  const declaredPacks = all.filter((p) => eligible(p) && declares(p));
  const registeredPacks = all.filter((p) => eligible(p) && !declares(p) && registered.has(idOf(p)));
  const extenders = [...declaredPacks, ...registeredPacks];
  return system ? [system, ...extenders] : extenders;
}

/**
 * Does this (non-system) pack extend any logical system pack? Used by the
 * compendium refresh to decide what to index.
 */
export function packExtendsSystem(pack) {
  if (!pack || pack.metadata?.packageName === SYSTEM_ID) return false;
  if (pack.metadata?.flags?.[SYSTEM_ID]?.extends) return true;
  const id = pack.collection ?? `${pack.metadata?.packageName}.${pack.metadata?.name}`;
  return Boolean(registeredLogicalName(id));
}

/**
 * The federated pack for a logical name, or null when NOTHING answers to
 * it — the same null a missing `game.packs.get` returned, so every
 * `if (!pack)` guard at a call site keeps its meaning.
 */
export function contentPack(logicalName, packs = globalThis.game?.packs) {
  const members = contentPacksFor(logicalName, packs);
  if (!members.length) return null;
  return new FederatedPack(logicalName, members);
}

/** True when a logical pack has at least one module extending it. */
export function isFederated(logicalName, packs = globalThis.game?.packs) {
  return contentPacksFor(logicalName, packs).length > 1;
}

class FederatedPack {
  constructor(logicalName, members) {
    this.logicalName = String(logicalName);
    this.members = members;
    /** The system pack, or the first extender when the system has none. */
    this.primary = members[0] ?? null;
  }

  /** Mirrors CompendiumCollection.metadata for the callers that read it. */
  get metadata() {
    return this.primary?.metadata ?? { packageName: SYSTEM_ID, name: this.logicalName, type: "Item" };
  }

  get collection() {
    return `${SYSTEM_ID}.${this.logicalName}`;
  }

  /** The already-loaded indexes merged, for the sites that read `.index`. */
  get index() {
    const merged = new FederatedIndex();
    for (const pack of this.members) {
      for (const entry of pack.index ?? []) {
        if (!merged.has(entry._id)) merged.set(entry._id, decorate(entry, pack));
      }
    }
    return merged;
  }

  /**
   * @param {object} [options] Passed straight to each member's getIndex,
   *   so `{ fields: [...] }` reaches every pack.
   */
  async getIndex(options) {
    const merged = new FederatedIndex();
    for (const pack of this.members) {
      const index = await pack.getIndex(options);
      for (const entry of index) {
        if (!merged.has(entry._id)) merged.set(entry._id, decorate(entry, pack));
      }
    }
    return merged;
  }

  /** The document with this id from whichever member holds it. */
  async getDocument(id) {
    if (!id) return null;
    for (const pack of this.members) {
      // A pack's index is the cheap test; only the holder is asked to load.
      if (pack.index?.size && !pack.index.has(id)) continue;
      const document = await pack.getDocument(id);
      if (document) return document;
    }
    return null;
  }

  /**
   * Every document across the members, optionally filtered by a query
   * ({ name } is the one shape a call site uses).
   */
  async getDocuments(query) {
    const out = [];
    for (const pack of this.members) {
      const docs = await pack.getDocuments(query);
      out.push(...docs);
    }
    return out;
  }
}

/**
 * Stamp the index entry with where it came from, so a consumer that
 * records a pack name for a later fetch (the picker does) can still find
 * the document, and a report can say which book an entry belongs to.
 */
function decorate(entry, pack) {
  if (entry.packId) return entry;
  return Object.assign(Object.create(Object.getPrototypeOf(entry) ?? Object.prototype), entry, {
    packId: pack.collection ?? `${pack.metadata?.packageName}.${pack.metadata?.name}`,
    packageName: pack.metadata?.packageName ?? SYSTEM_ID
  });
}
