/**
 * THE PARTY'S MEMBERS, RESOLVED ONCE (Party Sheet V2, Stage 1; 3.708.0).
 *
 * Before 3.708.0 the sheet looked every roster UUID up for the Roster tab,
 * and party-rewards-workflow.mjs looked the same UUIDs up again for the
 * Rewards tab, one `await fromUuid` at a time, on every render. This file
 * is the one place that turns a roster into actors. The sheet calls it once
 * per render and hands the result to every panel that needs it.
 *
 * WHAT IT RETURNS. One entry per roster UUID, in roster order:
 *
 *   { uuid, actor, status }   status is one of
 *     "ok"          resolved, and a type that may be on a roster
 *     "missing"     resolved to nothing (deleted, or its scene is gone)
 *     "ineligible"  resolved, but a type that may not join (a companion or
 *                   party left over from an older world or a macro)
 *     "error"       the lookup threw (a malformed UUID, an unloadable pack)
 *
 * NOTHING IS CACHED BETWEEN RENDERS, and nothing about a member is copied.
 * The entries hold live documents, so every number a panel prints is read
 * from the member at the moment it is printed.
 *
 * A UUID THAT FAILS TO RESOLVE IS NEVER REMOVED HERE. It is reported, and
 * only the GM's Remove button takes it off the roster. A failed lookup can
 * be temporary (a compendium still loading, a scene not yet viewed), and a
 * roster that quietly shrinks is one the GM cannot repair.
 *
 * Pure where it can be: the resolvers are injected, so the harness can
 * put every case past it without Foundry.
 */

import { canJoinRoster, normaliseMembers } from "./party.mjs";

/** The statuses a roster entry can have. */
export const MEMBER_STATUS = Object.freeze({
  OK: "ok",
  MISSING: "missing",
  INELIGIBLE: "ineligible",
  ERROR: "error"
});

/**
 * Is this a real document, rather than the index entry `fromUuidSync`
 * returns for an item in a compendium? An index entry has no `update`
 * method and must be fetched properly.
 */
function isDocument(value) {
  return Boolean(value) && typeof value === "object" && typeof value.update === "function";
}

/**
 * Turn a list of UUIDs into actors, in one batch.
 *
 * A synchronous pass first: world actors and the actors of placed tokens
 * are already in memory, and this resolves them without awaiting
 * anything. Whatever is left (compendium entries, anything the sync
 * lookup could not answer) is fetched in parallel, not one after another.
 *
 * Order is kept. Duplicates are looked up once and reported once, since
 * the input is normalised the same way the stored roster is.
 *
 * @param {unknown} uuids
 * @param {object} resolvers
 * @param {(uuid: string) => object|null} [resolvers.resolveSync]
 * @param {(uuid: string) => Promise<object|null>} resolvers.resolveAsync
 * @param {(actor: object) => boolean} [eligible] Defaults to the roster rule.
 * @returns {Promise<Array<{uuid: string, actor: object|null, status: string}>>}
 */
export async function resolveActorUuids(uuids, { resolveSync, resolveAsync }, eligible = canJoinRoster) {
  const list = normaliseMembers(uuids);
  const entries = list.map((uuid) => ({ uuid, actor: null, status: MEMBER_STATUS.MISSING, pending: true }));

  for (const entry of entries) {
    if (!resolveSync) break;
    try {
      const found = resolveSync(entry.uuid);
      if (isDocument(found)) {
        entry.actor = found;
        entry.pending = false;
      }
    } catch {
      // Left for the async pass, which reports the error if it fails too.
    }
  }

  const pending = entries.filter((entry) => entry.pending);
  const settled = await Promise.allSettled(pending.map((entry) => resolveAsync(entry.uuid)));
  settled.forEach((outcome, index) => {
    const entry = pending[index];
    if (outcome.status === "rejected") {
      entry.status = MEMBER_STATUS.ERROR;
      entry.error = String(outcome.reason?.message ?? outcome.reason ?? "lookup failed");
      return;
    }
    entry.actor = isDocument(outcome.value) ? outcome.value : null;
  });

  return entries.map(({ uuid, actor, status, error }) => {
    if (status === MEMBER_STATUS.ERROR) return { uuid, actor: null, status, error };
    if (!actor) return { uuid, actor: null, status: MEMBER_STATUS.MISSING };
    // An actor that is not an Actor at all (a UUID that names an Item, say)
    // is as ineligible as a companion.
    const isActor = actor.documentName === undefined || actor.documentName === "Actor";
    return { uuid, actor, status: isActor && eligible(actor) ? MEMBER_STATUS.OK : MEMBER_STATUS.INELIGIBLE };
  });
}

/**
 * The party's roster, resolved.
 *
 * @param {object} party
 * @param {object} resolvers see resolveActorUuids
 */
export async function resolvePartyRoster(party, resolvers = liveResolvers()) {
  return resolveActorUuids(party?.system?.members, resolvers);
}

/** The members whose actors count: the ones that resolved and may be on a roster. */
export function activeMembers(roster = []) {
  return roster.filter((entry) => entry.status === MEMBER_STATUS.OK).map((entry) => entry.actor);
}

/**
 * The document UUIDs a sheet showing these entries should be told about.
 *
 * Each entry's own UUID, and for the actor of an unlinked token its base
 * actor's too: a change to the base actor reaches the token's actor
 * without an `updateActor` for the token's actor itself.
 */
export function watchKeysFor(entries = []) {
  const keys = new Set();
  for (const entry of entries) {
    if (entry?.uuid) keys.add(entry.uuid);
    if (entry?.actor?.uuid) keys.add(entry.actor.uuid);
    // FIXED 3.708.1 (found live): in v14 the base actor hangs off the TOKEN
    // (`actor.token.baseActor`); a synthetic actor has no `baseActor` of its
    // own, so 3.708.0 never watched it and a renamed or levelled base actor
    // left its unlinked tokens' rows stale until the next render.
    const base = entry?.actor?.isToken
      ? (entry.actor.token?.baseActor?.uuid ?? entry.actor.baseActor?.uuid ?? null)
      : null;
    if (base) keys.add(base);
  }
  return keys;
}

/**
 * May this user see a member's statistics on the Party sheet?
 *
 * Graham's ruling (22 Nov 2026): player characters stay visible to the
 * whole table, as they always have been. An NPC member's statistics are
 * shown only to a GM and to a user with at least Observer on that NPC;
 * anyone else sees its name and portrait. That is how the NPC's own sheet
 * already behaves, so the party sheet no longer shows an NPC's hit points
 * to a player who could not open its sheet to read them.
 *
 * @param {object} actor
 * @param {{isGM?: boolean}} user
 * @param {(actor: object, user: object) => boolean} [isObserver]
 */
export function canSeeMemberDetails(actor, user, isObserver = liveIsObserver) {
  if (!actor) return false;
  if (user?.isGM) return true;
  if (String(actor.type ?? "") !== "npc") return true;
  try {
    return Boolean(isObserver(actor, user));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Foundry                                                            */
/* ------------------------------------------------------------------ */

function liveIsObserver(actor, user) {
  return actor.testUserPermission?.(user, "OBSERVER") === true;
}

/** The resolvers a live world uses. */
export function liveResolvers() {
  return {
    resolveSync: (uuid) => globalThis.fromUuidSync?.(uuid, { strict: false }) ?? null,
    resolveAsync: (uuid) => globalThis.fromUuid(uuid)
  };
}
