/**
 * THE SIZE LINK, LIVE (3.720.0): a creature's tokens, and the prototype
 * the next one is dragged from, are kept at its Size by token-size.mjs's
 * table. Reported by Graham, 28 November 2026.
 *
 * ONE RULE, WHATEVER CHANGED THE SIZE. The Size a token follows is the
 * prepared `system.identity.size` — after the sheet's own value, after an
 * ActiveEffect has overridden it (Size Alteration, a form, a frenzy) and
 * after a companion's growth has been derived. So nothing here knows what
 * a spell is: any document change that can move the prepared Size queues
 * a look at the actor, and the look compares and writes.
 *
 * DEFERRED AND COALESCED (the 3.551.0 lesson): the write is itself a hook
 * event, and a cast changes an actor several times in a row. One look per
 * actor, a moment after the last change.
 *
 * ONE WRITER: the acting GM (acting-gm.mjs). A player may not own the
 * token their spell shrank.
 */
import { isActingGM } from "./acting-gm.mjs";
import { SYSTEM_ID } from "./content-packs.mjs";
import { isPeril } from "./peril.mjs";
import { regrownPosition, tokenFollowsSize, tokenSideForSize, tokenSizePatch } from "./token-size.mjs";
import { isVehicleActor } from "./vehicles.mjs";

const SETTLE_MS = 120;
const queued = new Map();

/** The Size this actor's tokens are drawn at, or null when they do not follow it. */
function linkedSize(actor) {
  if (!tokenFollowsSize(actor, { vehicle: isVehicleActor(actor), peril: isPeril(actor) })) return null;
  const size = actor.system?.identity?.size;
  return tokenSideForSize(size) === null ? null : size;
}

/** The stored dimensions: a size change animates, and the document reads the old ones until it ends (3.651.2). */
function stored(doc) {
  const source = doc?._source ?? doc ?? {};
  return { x: Number(source.x) || 0, y: Number(source.y) || 0, width: source.width, height: source.height, depth: source.depth };
}

/** One token on a scene, to its actor's Size. Not a move. */
async function syncTokenSize(tokenDocument) {
  const actor = tokenDocument?.actor;
  const size = linkedSize(actor);
  if (!size || !tokenDocument?.update) return false;
  const now = stored(tokenDocument);
  const patch = tokenSizePatch(now, size);
  if (!patch) return false;
  const side = tokenSideForSize(size);
  const scene = tokenDocument.parent;
  const square = Number(scene?.grid?.type) === 1;
  const place = square ? regrownPosition(now, side, Number(scene?.grid?.size)) : null;
  const at = { x: place?.x ?? now.x, y: place?.y ?? now.y };
  const { asTokenResize } = await import("./combat/movement-workflow.mjs");
  await asTokenResize(tokenDocument, () => tokenDocument.update({ ...patch, ...(place ?? {}) }, {
    movement: { [tokenDocument.id]: { method: "api", waypoints: [{ ...at, width: side, height: side, depth: side, action: "displace" }] } }
  }));
  return true;
}

/** The prototype token of a world actor, to its Size. */
async function syncPrototype(actor) {
  if (!actor || actor.isToken || actor.pack || !actor.update) return false;
  const size = linkedSize(actor);
  if (!size) return false;
  const proto = actor.prototypeToken?._source ?? actor.prototypeToken ?? {};
  const patch = tokenSizePatch(proto, size);
  if (!patch) return false;
  await actor.update(Object.fromEntries(Object.entries(patch).map(([k, v]) => [`prototypeToken.${k}`, v])));
  return true;
}

/** Every token of this actor, on every scene, and its prototype. */
async function syncActorTokenSize(actor) {
  if (!actor || !isActingGM()) return;
  try {
    const tokens = actor.isToken ? [actor.token] : (actor.getDependentTokens?.() ?? []);
    // ONLY A TOKEN THAT IS ON ITS SCENE (found live, 3.720.0): the list also
    // holds token documents that were built and never created, which have no
    // id. An unlinked token is kept — each is read through its own actor.
    for (const doc of tokens) if (doc?.id && doc.parent?.tokens?.get(doc.id) === doc) await syncTokenSize(doc);
    await syncPrototype(actor);
  } catch (error) {
    console.warn(`${SYSTEM_ID} | token size link: ${actor?.name ?? "actor"}`, error);
  }
}

/** Queue a look at this actor, a moment after the last change to it. */
function queueTokenSizeSync(actor) {
  if (!actor?.uuid || actor.documentName !== "Actor" || !isActingGM()) return;
  clearTimeout(queued.get(actor.uuid));
  queued.set(actor.uuid, setTimeout(() => {
    queued.delete(actor.uuid);
    void syncActorTokenSize(actor);
  }, SETTLE_MS));
}

/** The actor a changed effect or item belongs to: its own, or its item's. */
function actorOf(document) {
  const parent = document?.parent;
  if (parent?.documentName === "Actor") return parent;
  if (parent?.parent?.documentName === "Actor") return parent.parent;
  return null;
}

export function registerTokenSizeHooks() {
  // A NEW TOKEN IS BORN THE RIGHT SIZE, on whichever client drops it: the
  // source is set before the document exists, so there is nothing to write.
  Hooks.on("preCreateToken", (tokenDocument) => {
    try {
      const size = linkedSize(tokenDocument?.actor);
      const patch = size ? tokenSizePatch(tokenDocument._source ?? tokenDocument, size) : null;
      if (patch) tokenDocument.updateSource(patch);
    } catch (error) {
      console.warn(`${SYSTEM_ID} | token size link: new token`, error);
    }
  });

  Hooks.on("createActor", (actor) => queueTokenSizeSync(actor));
  Hooks.on("updateActor", (actor) => queueTokenSizeSync(actor));
  for (const kind of ["ActiveEffect", "Item"]) {
    for (const verb of ["create", "update", "delete"]) {
      Hooks.on(`${verb}${kind}`, (document) => queueTokenSizeSync(actorOf(document)));
    }
  }

  // WHAT WAS ALREADY THERE: the tokens of a scene as it is opened, and
  // every world actor's prototype once at start. Only a token or a
  // prototype that disagrees is written, so this settles and stays quiet.
  Hooks.on("canvasReady", async () => {
    if (!isActingGM()) return;
    for (const doc of Array.from(globalThis.canvas?.scene?.tokens ?? [])) {
      try { await syncTokenSize(doc); } catch (error) { console.warn(`${SYSTEM_ID} | token size link: ${doc?.name ?? "token"}`, error); }
    }
  });
  Hooks.once("ready", async () => {
    if (!isActingGM()) return;
    for (const actor of Array.from(globalThis.game?.actors ?? [])) {
      try { await syncPrototype(actor); } catch (error) { console.warn(`${SYSTEM_ID} | token size link: ${actor?.name ?? "actor"}`, error); }
    }
    // The scene on screen was drawn before this client was sure it was the
    // acting GM; look at it once more.
    for (const doc of Array.from(globalThis.canvas?.scene?.tokens ?? [])) {
      try { await syncTokenSize(doc); } catch (error) { console.warn(`${SYSTEM_ID} | token size link: ${doc?.name ?? "token"}`, error); }
    }
  });
}
