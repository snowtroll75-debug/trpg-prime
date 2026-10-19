/**
 * CODEX INHERITANCE BY NAME (3.631.0; Fiends & Fables 3.0 audit, block 1,
 * Graham's ruling of 9 October 2026: "all automated, your recommendation").
 *
 * THE PROBLEM. A creature's abilities are COPIES of the Creature Codex
 * entries — every one of the 1,660 ability items on the Fiends & Fables
 * compendium's 294 creatures was copied from this system's packs at some
 * release, and a copy keeps whatever its entry declared on the day it was
 * copied. When a Codex entry learns a mechanism (Stench rolls its save,
 * Undead Fortitude guards the fall to 0 HP), the copies learn nothing until
 * the module is rebuilt and the world's imported creatures refreshed —
 * which is how 376 copies sat behind core's automation in the September
 * audit, and how they would again after this release.
 *
 * THE RULE. The Codex entry is the source of truth for what a Codex ability
 * DECLARES. An ability item whose base name matches exactly one entry in
 * the `creature-abilities` or `abilities` pack takes that entry's
 * `flags.trg-prime` on top of its own, the entry winning where they
 * disagree — at prepare time, in memory, never written to the copy. An
 * ability a module authored itself (a dragon's Fire Breath, a Pillars of
 * Faith stance) matches no entry and is untouched.
 *
 * WHAT THE COPY KEEPS, and why it is one field: a printed sense range.
 * "Darkvision (55 ft.)" sets `derives.sense.fixedFeet` on its copy because
 * the creature's block prints 55 and the engine would otherwise compute the
 * range from Wisdom; the entry has no range of its own. Everything else a
 * copy might carry that differs from its entry is staleness, and staleness
 * is what this exists to end. A module that genuinely wants a copy to
 * differ sets `flags.trg-prime.codexInherit: false` on it.
 *
 * THE OTHER NAMESPACE IS NOT TOUCHED. `flags.fiends-and-fables-prime` and
 * every other module's flags are the module's own.
 *
 * Pure. The Foundry half (codex-inheritance-workflow.mjs) builds the index
 * from the packs at ready and resets every actor so prepared data sees it.
 */

const SYSTEM_ID = "trg-prime";

/** The packs whose entries are Codex abilities, in lookup order. */
export const CODEX_PACKS = Object.freeze(["creature-abilities", "abilities"]);

/**
 * A Codex ability's base name: lower-cased, a trailing parenthesis and a
 * trailing "N ft" dropped — "Darkvision (55 ft.)", "Darkvision 60 ft" and
 * "Acute Sense (Smell)" all look up their entry.
 */
function codexBaseName(name) {
  let n = String(name ?? "").trim().toLowerCase();
  n = n.replace(/\s*\(.*?\)\s*$/, "");
  n = n.replace(/\s+\d+\s*ft\.?\s*$/, "");
  return n.trim();
}

/**
 * Build the index: base name → the entry's `flags.trg-prime`. A name that
 * appears in both packs takes the first pack's (the Codex's) entry; a name
 * that appears twice within a pack is ambiguous and left out, so no copy
 * inherits a guess.
 *
 * @param {Array<{pack: string, name: string, flags: object}>} entries
 * @returns {Map<string, object>}
 */
export function buildCodexIndex(entries = []) {
  const index = new Map();
  const ambiguous = new Set();
  // A name twice in ONE pack (one member of a federated pack) is ambiguous
  // and inherits nothing; the same name in the system's pack and a module's
  // resolves to the first member listed — the system's — as every other
  // federated lookup does.
  for (const pack of CODEX_PACKS) {
    const seen = new Map();
    const memberOf = (entry) => `${pack}::${entry?.member ?? ""}`;
    for (const entry of entries) {
      if (entry?.pack !== pack) continue;
      const key = codexBaseName(entry.name);
      if (!key || index.has(key) || ambiguous.has(key)) continue;
      const slot = `${memberOf(entry)}::${key}`;
      seen.set(slot, (seen.get(slot) ?? 0) + 1);
    }
    for (const entry of entries) {
      if (entry?.pack !== pack) continue;
      const key = codexBaseName(entry.name);
      if (!key || index.has(key) || ambiguous.has(key)) continue;
      if (seen.get(`${memberOf(entry)}::${key}`) > 1) { ambiguous.add(key); continue; }
      const flags = entry.flags?.[SYSTEM_ID];
      if (flags && typeof flags === "object" && Object.keys(flags).length) index.set(key, flags);
    }
  }
  return index;
}

/**
 * ELEMENT-NAMED ABILITIES (3.641.0; F&F 3.0 block 11, ruling 3). The Codex
 * prints Elemental Aura, Blood, Strikes and Grasp once, and says the feat
 * "is called either Caustic (acid), Fiery (fire), Freezing (cold), Shocking
 * (electricity) or Toxic (poison)" by its element. A creature's block prints
 * the called name — "Freezing Aura" — which matched no entry, so the Cold
 * Sovereign's aura and the Cave Sovereign's blood did nothing. A called name
 * that has no entry of its own looks up its Elemental entry; the element
 * still comes from the item's own name, as the entries already read it.
 *
 * @param {string} base a base name from codexBaseName
 * @returns {string} "elemental <kind>", or "" when the name is not one
 */
function elementalCodexName(base) {
  const m = /^(caustic|fiery|freezing|shocking|toxic) (aura|blood|strikes|grasp)$/.exec(String(base ?? "").trim().toLowerCase());
  return m ? `elemental ${m[2]}` : "";
}

function isObject(v) { return v && typeof v === "object" && !Array.isArray(v); }

/** Deep merge: `over` wins; arrays replace rather than merge. */
function deepMergeFlags(base, over) {
  if (!isObject(base)) return isObject(over) ? structuredClone(over) : over;
  if (!isObject(over)) return structuredClone(base);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObject(v) && isObject(out[k]) ? deepMergeFlags(out[k], v) : structuredClone(v);
  }
  return out;
}

/**
 * The copy's `flags.trg-prime` after inheritance, or null when nothing
 * changes (no entry, opted out, not an ability).
 *
 * @param {{type: string, name: string, flags: object}} item
 * @param {Map<string, object>} index from buildCodexIndex
 */
export function inheritedCodexFlags(item, index) {
  if (!item || item.type !== "ability" || !index?.size) return null;
  const own = item.flags?.[SYSTEM_ID] ?? {};
  if (own.codexInherit === false) return null;
  const base = codexBaseName(item.name);
  const called = !index.get(base) && elementalCodexName(base);
  const entry = index.get(base) ?? index.get(elementalCodexName(base));
  if (!entry) return null;
  const merged = deepMergeFlags(own, entry);
  // A called aura goes by its called name (3.641.1, found live): the Cold
  // Sovereign's card said "Elemental Aura" where the block prints "Freezing".
  if (called && Array.isArray(merged.auras)) {
    const name = String(item.name ?? "").trim();
    merged.auras = merged.auras.map((a) => (a && typeof a === "object" ? { ...a, name, id: `aura-${base.replace(/[^a-z0-9]+/g, "-")}` } : a));
  }
  // The one thing the copy knows and the entry cannot: its printed range.
  const fixed = own?.creatureAbility?.derives?.sense?.fixedFeet;
  if (Number.isFinite(Number(fixed)) && merged?.creatureAbility?.derives?.sense) {
    merged.creatureAbility.derives.sense.fixedFeet = Number(fixed);
  }
  return merged;
}
