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
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEquals(a[k], b[k]));
}

/** The repairs declared for one item, matched on name and pack. */
export function repairsForName(manifest, name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return [];
  return (Array.isArray(manifest) ? manifest : [])
    .filter((r) => String(r?.name ?? "").trim().toLowerCase() === wanted);
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
