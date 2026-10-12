/**
 * Sourcebooks (3.628.0): which book an item comes from, and the picker
 * menu that filters by it.
 *
 * Graham, 7 October 2026: "Any item that is selectable by a character
 * (such as feats, spells etc) needs to have a filter by sourcebook option.
 * The default will be Core Rulebook and then we will need one for Fiends &
 * Fables and Pillars of Faith. This will also need to link to future
 * sourcebooks as they are released." And: the menu always opens on Core
 * Rulebook; a different choice applies to that picker only.
 *
 * WHERE A BOOK'S NAME COMES FROM, first answer wins:
 *   1. The system's own packs are the Core Rulebook.
 *   2. A module that registers one through the API:
 *        game.trgPrime.modules.registerSourcebook("my-module", "My Book")
 *   3. A module's manifest: `"flags": { "trg-prime": { "sourcebook": "My Book" } }`.
 *      This is the line a future sourcebook adds, beside its packs'
 *      `extends` flags.
 *   4. KNOWN_SOURCEBOOKS below, for books that shipped before this existed.
 *   5. The module's own title, without a "TRG Prime:" prefix.
 *
 * FIENDS & FABLES PREDATES THE MODULE API. Its packs declare no `extends`,
 * so its races, heritages, abilities and feats never reached a picker.
 * Graham chose (7 Oct) that the core recognise it as installed, so the
 * table below also says which of its packs join which logical pack. A
 * module that declares its own `extends` needs no entry here.
 *
 * Pure.
 */

const CORE_SOURCEBOOK = "Core Rulebook";
const SYSTEM_ID = "trg-prime";

export const KNOWN_SOURCEBOOKS = Object.freeze({
  "fiends-and-fables-prime": Object.freeze({
    title: "Fiends & Fables",
    packs: Object.freeze({ races: "races", heritages: "heritages", abilities: "abilities", feats: "feats" })
  }),
  "trg-pillars-of-faith": Object.freeze({ title: "Pillars of Faith", packs: Object.freeze({}) })
});

/**
 * The sourcebook a package's content belongs to.
 *
 * @param {string} packageName "trg-prime", a module id, or empty
 * @param {{registered?: string, manifestFlag?: string, moduleTitle?: string}} [about]
 * @returns {string}
 */
export function sourcebookTitle(packageName, { registered = "", manifestFlag = "", moduleTitle = "" } = {}) {
  const id = String(packageName ?? "").trim();
  if (!id || id === SYSTEM_ID) return CORE_SOURCEBOOK;
  for (const candidate of [registered, manifestFlag, KNOWN_SOURCEBOOKS[id]?.title]) {
    const text = String(candidate ?? "").trim();
    if (text) return text;
  }
  const title = String(moduleTitle ?? "").replace(/^\s*TRG\s*Prime\s*[:\-–—]\s*/i, "").trim();
  return title || id;
}

/**
 * The packs a known pre-API module contributes: `[{collectionId, logical}]`.
 *
 * @param {string} moduleId
 */
export function knownExtenderPacks(moduleId) {
  const packs = KNOWN_SOURCEBOOKS[String(moduleId ?? "").trim()]?.packs ?? {};
  return Object.entries(packs).map(([pack, logical]) => ({ collectionId: `${moduleId}.${pack}`, logical }));
}

/**
 * The Sourcebook menu for a picker. `resolve(packageName)` names the book;
 * an index entry carries `packageName` when it came through a federated
 * pack, and an entry without one is the system's own.
 *
 * @param {(packageName: string) => string} resolve
 */
function sourcebookFacet(resolve) {
  return {
    key: "sourcebook",
    label: "Sourcebook",
    fields: [],
    defaultValue: CORE_SOURCEBOOK,
    // Offered whenever the pack spans books, not only when the entries left
    // after the character's gates do (3.628.2; picker-workflow reads it).
    valuesFrom: "all",
    read: (entry) => resolve(entry?.packageName ?? SYSTEM_ID)
  };
}

/**
 * A picker's facets with the Sourcebook menu added — every picker that
 * offers a character something to take, without each call site having to
 * remember. A list that already has one keeps its own.
 */
export function withSourcebookFacet(facets = [], resolve) {
  const list = Array.isArray(facets) ? facets : [];
  if (list.some((f) => f?.key === "sourcebook")) return list;
  return [...list, sourcebookFacet(resolve)];
}

/**
 * Two books printing the same name (Pillars of Faith's Fast Healing and
 * Fiends & Fables' Fast Healing, the core's Constrict and F&F's): which one
 * a grant means. The granting item's own book first, then the core's. Null
 * when that still leaves a tie, so the caller can report it rather than
 * guess.
 *
 * @param {Array<{packageName?: string}>} candidates
 * @param {string} preferPackage the granting item's package, if known
 */
export function preferredBySourcebook(candidates = [], preferPackage = "") {
  const list = Array.isArray(candidates) ? candidates : [];
  const pkg = (c) => String(c?.packageName ?? SYSTEM_ID);
  const prefer = String(preferPackage ?? "").trim();
  if (prefer) {
    const own = list.filter((c) => pkg(c) === prefer);
    if (own.length === 1) return own[0];
  }
  const core = list.filter((c) => pkg(c) === SYSTEM_ID);
  return core.length === 1 ? core[0] : null;
}

/**
 * The package an owned item was copied from, read from its compendium
 * source ("Compendium.trg-pillars-of-faith.pof-feats.Item.<id>"). Empty
 * when it was not copied from a compendium.
 *
 * @param {object} item an Item, or its source data
 */
export function sourcePackageOf(item) {
  const source = String(item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? "");
  const m = /^Compendium\.([^.]+)\./.exec(source);
  return m ? m[1] : "";
}
