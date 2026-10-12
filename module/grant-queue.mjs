/**
 * One grant pass at a time, per actor — for every caller, not just one.
 *
 * THE DEFECT, reported by Graham on 21 August 2026: building a new
 * character and selecting a race added every racial ability TWICE.
 * Reproduced on a blank character in one call: Ascendan delivered Arcane
 * Knowledge, Darkvision, Forbidden Magic and Ley Blood, two of each.
 *
 * TWO PATHS GRANT ON THE SAME CREATE, AND ONLY ONE OF THEM WAS QUEUED.
 *
 *   1. `picker-workflow.mjs` creates the item and then calls
 *      `applyAllGrants` itself.
 *   2. `grant-autorun.mjs` watches `createItem` and calls it too — that
 *      watcher exists because dragging a race onto a sheet used to leave
 *      its grants behind a button nobody knew to press (3.317.0).
 *
 * Both are wanted. Neither is wrong on its own. But `applyAllGrants`
 * decides "already granted?" by READING the actor and then WRITING, so
 * two passes that overlap both read "not yet" and both create.
 *
 * `grant-autorun` already knew this — its own comment says exactly that,
 * and it built `GRANT_PASS_QUEUES` to stop two of ITS passes overlapping.
 * The queue was in the caller rather than at the door, so it never
 * covered the picker calling in beside it.
 *
 * SO THE LOCK LIVES HERE, and `applyAllGrants` takes it on the way in.
 * Every caller is serialised whether it knows about the queue or not,
 * which is the only version of this that a future third caller cannot
 * quietly defeat.
 *
 * NO IMPORTS, DELIBERATELY. `grant-autorun` carries a warning about
 * reaching into `feats-workflow` for a queue and wedging 3.327.1 on an
 * import cycle. A module that imports nothing cannot be half of one.
 */

/** Actor id → the promise chain of grant passes for that actor. */
const CHAINS = new Map();

/**
 * Run `fn` with no other grant pass for this actor running.
 *
 * A failing pass does not wedge the ones behind it: the stored handle
 * swallows the rejection, while the caller still receives it.
 *
 * @param {string} actorId
 * @param {() => Promise<*>} fn
 * @returns {Promise<*>} whatever `fn` returns
 */
export function runExclusiveForActor(actorId, fn) {
  // No id means nothing to serialise against — a stub in a harness, or an
  // actor mid-construction. Running it plainly is better than inventing a
  // shared key that would serialise unrelated work.
  if (!actorId) return fn();

  const previous = CHAINS.get(actorId) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  const settled = run.catch(() => {});
  CHAINS.set(actorId, settled);
  settled.then(() => {
    if (CHAINS.get(actorId) === settled) CHAINS.delete(actorId);
  });
  return run;
}

/** Exposed for the harness: is anything queued for this actor right now? */
export function hasPendingGrantPass(actorId) {
  return CHAINS.has(actorId);
}
