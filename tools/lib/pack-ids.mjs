/**
 * pack-ids — is every document id in a built pack one Foundry can load?
 *
 * NEW at 3.685.2. Foundry's ids are exactly sixteen alphanumeric characters
 * (`foundry.data.validators.isValidId`). A pack record whose `_id` is not one
 * is read back with a NULL id: it shows in the compendium's index and cannot
 * be opened, dragged or found by id. Two Creature Codex entries authored at
 * 3.631.0 ("ff30ScorchingBrth", "ff30WingBuffet001", seventeen characters
 * each) shipped that way for fifty-four releases, because nothing read the
 * built packs for it. verify-pack-ids.mjs does, through this file.
 *
 * THE RECORD SHAPE, as the packs hold it (LevelDB, written by Foundry's own
 * compendium layer and by the declare-* tools):
 *   !items!<id>                         a top-level document
 *   !items.effects!<parent>.<id>        an embedded document, keyed by the
 *   !actors.items!<parent>.<id>         chain of ids down to it
 *   …and the parent's own `items` / `effects` arrays list the embedded ids.
 *
 * Every id in all three places is asked: the record's `_id`, each id in its
 * key (the parent chain too), and each entry of a parent's embedded arrays
 * (an id string, or an inline document whose `_id` is asked in turn). The
 * key's last id must be the record's `_id`, or the record is unreachable by
 * the id it claims.
 */

/** Foundry's id shape: exactly sixteen ASCII letters and digits. */
export const FOUNDRY_ID = /^[A-Za-z0-9]{16}$/;

/** Is this a Foundry document id? */
export function isFoundryId(id) {
  return typeof id === "string" && FOUNDRY_ID.test(id);
}

/** The embedded collections a parent record lists by id. */
export const EMBEDDED_ARRAYS = ["items", "effects", "pages", "results", "categories"];

/**
 * Every problem with the ids of one pack record, as strings (empty when it
 * is sound).
 *
 * @param {string} key    the LevelDB key, e.g. "!items.effects!abc….def…"
 * @param {object} value  the stored document
 */
export function recordIdProblems(key, value) {
  const problems = [];
  const parts = String(key ?? "").split("!");
  // ["", collection, ids]; anything else is not a document record.
  if (parts.length !== 3 || parts[0] !== "" || !parts[1]) {
    problems.push(`${key}: not a document key`);
    return problems;
  }
  const collection = parts[1];
  const chain = parts[2].split(".");
  const depth = collection.split(".").length;
  if (chain.length !== depth) problems.push(`${key}: ${depth} collection(s) but ${chain.length} id(s) in the key`);
  for (const id of chain) if (!isFoundryId(id)) problems.push(`${key}: key id ${JSON.stringify(id)} is not 16 alphanumeric characters`);
  const own = value?._id;
  if (!isFoundryId(own)) problems.push(`${key}: _id ${JSON.stringify(own ?? null)} is not 16 alphanumeric characters`);
  else if (own !== chain[chain.length - 1]) problems.push(`${key}: _id ${JSON.stringify(own)} is not the key's id`);
  problems.push(...embeddedIdProblems(key, value));
  return problems;
}

/** The ids a record lists for its embedded documents (strings or inline documents). */
export function embeddedIdProblems(key, value) {
  const problems = [];
  for (const field of EMBEDDED_ARRAYS) {
    const list = value?.[field];
    if (!Array.isArray(list)) continue;
    list.forEach((entry, i) => {
      if (typeof entry === "string") {
        if (!isFoundryId(entry)) problems.push(`${key}: ${field}[${i}] ${JSON.stringify(entry)} is not 16 alphanumeric characters`);
      } else if (entry && typeof entry === "object") {
        if (!isFoundryId(entry._id)) problems.push(`${key}: ${field}[${i}]._id ${JSON.stringify(entry._id ?? null)} is not 16 alphanumeric characters`);
        problems.push(...embeddedIdProblems(`${key} ${field}[${i}]`, entry));
      } else {
        problems.push(`${key}: ${field}[${i}] is neither an id nor a document`);
      }
    });
  }
  return problems;
}
