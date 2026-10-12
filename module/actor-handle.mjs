/**
 * NAMING A CREATURE SO IT CAN BE FOUND AGAIN.
 *
 * NEW at 3.469.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AN ACTOR ID DOES NOT NAME A CREATURE.
 *
 * In Foundry an UNLINKED token has a SYNTHETIC actor whose `.id` is the
 * BASE actor's id. So `game.actors.get(someActorId)` returns the sheet in
 * the sidebar — the thing the creature was stamped from — and NOT the
 * creature standing on the map. Most NPCs are unlinked, so this is most
 * NPCs.
 *
 * IT IS INVISIBLE FROM THE CARD. Every one of these sites prints the
 * right name, because the sidebar sheet and the token share it. The only
 * symptom is an HP bar that does not move, or a reaction that never runs
 * out.
 *
 * FOUND BY DRIVING WAR CRY, 2 September 2026. The card read "ZZ Ally's
 * critical deals a further 6 sonic to ZZ Undead Foe (1d6 rolled 6)" and
 * was true in every word; the base actor fell to 24/30 and the token that
 * had actually been hit sat at 27/30. A survey of the tree afterwards
 * found ten more sites of the same shape.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS IS A GENERALISATION, NOT AN INVENTION.
 *
 * Two places already did it correctly and this file is their shape:
 *
 *   combat/opportunity.mjs  records `{actorId, tokenId, name}` and
 *                           resolves `reactorToken?.actor ?? game.actors.get(...)`
 *   modifier/app.mjs        branches on `actor.isToken || !game.actors?.get(actor.id)`
 *                           and pins the live document instead
 *
 * §"Search the module tree for a rule's own words before writing it" —
 * so the order below (token, then uuid, then id) is opportunity.mjs's
 * order with the uuid added, rather than an order of my own.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THREE KEYS AND NOT ONE.
 *
 *   tokenId    survives a token being moved, renamed or re-imaged, and is
 *              what opportunity.mjs already stores. Scene-scoped.
 *   uuid       names Scene AND Token for a synthetic actor, so it is
 *              exact across scenes. What 3.468.0 added for War Cry.
 *   actorId    the old field. KEPT, because records written before this
 *              file existed carry only that one, and a card sitting in
 *              the log from last session must still do something
 *              sensible rather than throw.
 *
 * The id is a FALLBACK and never the first question. That ordering is the
 * whole fix; a resolver that asked the id first would be the defect with
 * more fields.
 */

/** The keys a recorded handle may carry, in the order they are trusted. */
export const HANDLE_KEYS = Object.freeze(["tokenId", "actorUuid", "actorId"]);

const text = (v) => String(v ?? "").trim();

/**
 * What to WRITE when remembering a creature.
 *
 * BOTH ARGUMENTS, WHEREVER THERE ARE BOTH. Several of the sites this file
 * was written for already had the token in hand and threw it away —
 * `reaction-feats-workflow.mjs` built `{actor, token}` tuples and kept
 * only `actor.id`. Passing the token costs nothing and is the difference
 * between naming a creature and naming its species.
 *
 * @param {Actor|null} actor
 * @param {Token|TokenDocument|null} token its token, when there is one
 * @returns {{actorId: string|null, tokenId: string|null, actorUuid: string|null}}
 */
export function actorHandle(actor, token = null) {
  return {
    actorId: text(actor?.id) || null,
    tokenId: text(token?.id) || null,
    // A SYNTHETIC ACTOR'S UUID CARRIES ITS SCENE AND TOKEN
    // ("Scene.x.Token.y.Actor.z"); a world actor's is "Actor.z". Either
    // way it names the document rather than the sheet behind it.
    actorUuid: text(actor?.uuid) || null
  };
}

/**
 * Can this handle name the creature exactly, or only its species?
 *
 * A HANDLE WITH ONLY AN `actorId` CANNOT, and saying so is the point:
 * that is precisely the case that silently resolves to the sidebar. Code
 * that finds itself with an imprecise handle should say so on the card
 * rather than act as though it knew.
 */
export function handleIsPrecise(handle) {
  return Boolean(text(handle?.tokenId) || text(handle?.actorUuid));
}

/**
 * Does this handle carry anything at all?
 */
export function handleIsEmpty(handle) {
  return !text(handle?.tokenId) && !text(handle?.actorUuid) && !text(handle?.actorId);
}

/**
 * Which key should be tried first for this handle?
 *
 * PURE, SO THE HARNESS CAN DRIVE THE ORDERING. The resolver below needs
 * `game` and `canvas` and cannot run outside Foundry, so the decision it
 * makes is expressed here where it can be tested — the split
 * `hazard-terrain.mjs` and its workflow already use.
 *
 * @returns {"tokenId"|"actorUuid"|"actorId"|null}
 */
export function preferredHandleKey(handle) {
  for (const key of HANDLE_KEYS) {
    if (text(handle?.[key])) return key;
  }
  return null;
}

/**
 * Find the creature a handle names.
 *
 * ORDER IS THE FIX. Token first (the creature on the map), then uuid
 * (exact across scenes), then the bare id — which is the only one that
 * can resolve to the wrong document, and is tried last precisely because
 * of that.
 *
 * SWALLOWS ITS OWN FAILURE. A handle that names a creature which has
 * since been deleted is a normal thing for an old chat card to hold; the
 * caller gets null and says so.
 *
 * @param {object|null} handle from `actorHandle`
 * @returns {Promise<Actor|null>}
 */
export async function resolveActorHandle(handle) {
  if (handleIsEmpty(handle)) return null;
  try {
    const tokenId = text(handle?.tokenId);
    if (tokenId) {
      // THE CURRENT SCENE FIRST, then any other — a token id is
      // scene-scoped, and a card can outlive a scene change.
      const here = canvas?.scene?.tokens?.get?.(tokenId) ?? null;
      if (here?.actor) return here.actor;
      for (const scene of game?.scenes?.contents ?? []) {
        const found = scene.tokens?.get?.(tokenId) ?? null;
        if (found?.actor) return found.actor;
      }
    }
    const uuid = text(handle?.actorUuid);
    if (uuid) {
      const doc = await fromUuid(uuid).catch(() => null);
      if (doc) return doc;
    }
    const actorId = text(handle?.actorId);
    if (actorId) return game?.actors?.get?.(actorId) ?? null;
  } catch (error) {
    console.error("TRG Prime | could not resolve a recorded creature", error);
  }
  return null;
}

/** What a card says when it could only identify the creature by species. */
export const IMPRECISE_HANDLE_NOTE =
  "This card was recorded before creatures were named exactly; "
  + "if this is an unlinked token, apply the result by hand.";
