/**
 * Deciding which stale fields on an OWNED copy may be repaired.
 *
 * NEW at 3.431.0. Pure; no Foundry.
 *
 * See data/pack-repairs.mjs for the defect and for Graham's ruling. This
 * file is the rule that ruling implies, kept where a harness can execute
 * it — because the thing it governs is a migration, and a migration is
 * the one piece of code that runs once, unattended, against data nobody
 * can get back.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE STATES, AND ONLY ONE OF THEM IS REPAIRED.
 *
 *   - The owned value deep-equals `from`  → STALE. Repair it.
 *   - The owned value deep-equals `to`    → already current. Skip, and
 *     this is what makes the pass idempotent BY CONSTRUCTION rather than
 *     by an argument somebody has to re-check.
 *   - The owned value is neither          → SOMEBODY'S OWN ANSWER. Leave
 *     it completely alone, and say so in the report rather than
 *     silently. A GM who house-ruled a spell should hear that their
 *     version was noticed and kept.
 */

/**
 * Deep structural equality, for comparing an owned value against a
 * recorded one.
 *
 * WHY NOT `JSON.stringify(a) === JSON.stringify(b)`. That is what this
 * started as, and it answers FALSE for two objects that differ only in
 * key order — which is exactly what happens when Foundry round-trips an
 * effect row through its own document layer and hands the keys back in a
 * different order from the pack. A stale copy would then read as
 * house-ruled and be left broken, silently, which is the failure this
 * whole file exists to avoid.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
/*
 * NOT EXPORTED. `classifyRepairs` is the only question a caller has, and
 * the uncalled-export ratchet refused this the moment it existed —
 * correctly, for the reason magic/sustain.mjs records about
 * `sustainableEntries`: checking it THROUGH the door is also the better
 * test, because it exercises the decision rather than the hinge.
 */
function deepEquals(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEquals(v, b[i]));
  }
  // A KEY ONE SIDE LACKS IS EQUAL TO AN EMPTY DEFAULT ON THE OTHER (3.718.3).
  // Found in the 3.718.2 live migration: "ZZ SW Wizard — Shock Bolt: damage …
  // left alone", on a copy identical to the pack. The data model had since
  // given `damage` a `persistentOn: ""` default, which the copy carries and
  // the manifest's `from`/`to` (written before the field existed) do not — so
  // the copy matched neither, a copy that WAS stale would never be repaired,
  // and the report called the current pack somebody's house rule. An empty
  // string, null, an empty list or an empty object is a schema's default, not
  // anybody's edit; a 0 or a false is a value and still has to match.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const inA = Object.prototype.hasOwnProperty.call(a, k);
    const inB = Object.prototype.hasOwnProperty.call(b, k);
    if (inA && inB) { if (!deepEquals(a[k], b[k])) return false; continue; }
    if (!isEmptyDefault(inA ? a[k] : b[k])) return false;
  }
  return true;
}

function isEmptyDefault(value) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * The repairs declared for one item, matched on name — and, when the item's
 * type is given, on the spells pack's type (3.718.2). Found in the 3.718.1
 * migration's report: "Kharon — Nightvision: effects … left alone". Kharon
 * carries the Nightvision ABILITY, and the spell's repair was weighed against
 * it. Harmless (an ability has no `effects` to match, so it was only ever
 * "kept"), but a report naming somebody's sense as a house-ruled spell sends
 * the GM looking for an edit nobody made.
 */
export function repairsForName(manifest, name, itemType = null) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return [];
  const type = itemType === null || itemType === undefined ? null : String(itemType);
  return (Array.isArray(manifest) ? manifest : [])
    .filter((r) => String(r?.name ?? "").trim().toLowerCase() === wanted)
    .filter((r) => type === null || (r?.pack === "spells") === (type === "spell"));
}

/**
 * What one owned item's state is, field by field, against the manifest.
 *
 * RETURNS EVERY FIELD IT LOOKED AT, not only the repairable ones —
 * because the report is half the safety. "Two spells will change and one
 * of yours was left alone because you had edited it" is a sentence a GM
 * can act on; a silent write is not.
 *
 * @param {object} itemSystem the owned item's `system`
 * @param {Array} entries the manifest rows for this item's name
 * @returns {Array<{id, field, state: "stale"|"current"|"custom", from, to, own}>}
 */
export function classifyRepairs(itemSystem, entries) {
  return (Array.isArray(entries) ? entries : []).map((r) => {
    const own = itemSystem?.[r.field];
    let state = "custom";
    if (deepEquals(own, r.from)) state = "stale";
    // A FIELD REPAIRED TWICE (3.608.1). One entry per field, so a second
    // ruling rewrites the entry's `to` — and a copy already brought up to the
    // FIRST `to` would then match neither side and be kept as somebody's own
    // answer. `alsoFrom` lists the values earlier releases shipped, so those
    // copies are recognised as stale too. Speak With Dead is the first.
    else if ((Array.isArray(r.alsoFrom) ? r.alsoFrom : []).some((f) => deepEquals(own, f))) state = "stale";
    else if (deepEquals(own, r.to)) state = "current";
    return { id: r.id, field: r.field, state, from: r.from, to: r.to, own, since: r.since, reason: r.reason };
  });
}

/**
 * The Foundry update payload for the stale fields, and nothing else.
 *
 * DOTTED KEYS, DELIBERATELY. `migratePooledMovement` blanked every player
 * sheet in Graham's world on 26 August 2026 by writing a whole nested
 * object; `verify-migration-safety` refuses that pattern anywhere in
 * `module/` and this obeys it. One dotted key per repaired field means
 * an update can only ever touch the fields it names.
 *
 * RETURNS NULL FOR NOTHING TO DO, so a caller cannot accidentally issue
 * an empty update and count it as a change.
 *
 * @param {Array} classified the output of `classifyRepairs`
 * @returns {object|null}
 */
export function repairUpdate(classified) {
  const update = {};
  for (const row of Array.isArray(classified) ? classified : []) {
    if (row?.state !== "stale") continue;
    update[`system.${row.field}`] = row.to;
  }
  return Object.keys(update).length ? update : null;
}
