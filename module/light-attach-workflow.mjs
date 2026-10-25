/**
 * Drawing an attached light on a token, and taking it off again.
 *
 * NEW at 3.396.0. The Foundry half of Graham's 25 August ruling that a
 * light source rides its target rather than being authored as a Region.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS FILE IS PRESENTATION. The rules answer — what illumination level
 * a token is standing in — is decided by `lightLevelForToken`
 * (light-workflow.mjs) reading the same effect flag this file draws
 * from, and it works whether or not any of the drawing below succeeds.
 * That split is deliberate: a player without permission to update a
 * token document would otherwise lose the spell's mechanical effect
 * along with its glow.
 *
 * WHY THE ORIGINAL LIGHT IS STASHED. A token may already carry a light
 * of its own — a lantern the GM configured, a glowing creature. Turning
 * the spell off has to put that back rather than blanking it, so the
 * previous config is written onto the token under our own flag before
 * the spell's light replaces it. `restoreTokenLight` reads it back and
 * clears the stash, so a second cast on the same token cannot stash the
 * SPELL'S light as if it were the original.
 */

import { isActingGM } from "./acting-gm.mjs";
import {
  lightSourceKeysOn, brightestSourceKey, foundryLightConfig
} from "./light-sources.mjs";

const SYSTEM_ID = "trg-prime";
const STASH = "lightBefore";

/** Every token this actor is represented by on the current scene. */
function tokensFor(actor) {
  const tokens = actor?.getActiveTokens?.(true, true);
  if (Array.isArray(tokens) && tokens.length) return tokens;
  // AN UNLINKED TOKEN'S ACTOR IS ITS OWN. This is the handle confusion
  // that cost a whole false bug report on 24 August — "players cannot
  // apply effects to unowned targets" was an unlinked token all along.
  const own = actor?.token;
  return own ? [own] : [];
}

/**
 * Give every token of this actor the spell's light, stashing whatever
 * was there before.
 *
 * @param {Actor} actor
 * @param {string} key a LIGHT_SOURCES key
 */
export async function attachTokenLight(actor, key, { direct = false } = {}) {
  const config = foundryLightConfig(key);
  if (!config) return 0;

  // A PLAYER MAY NOT WRITE ANOTHER PLAYER'S TokenDocument, and Light's
  // printed target is "1 object ... possessed by you or a WILLING ALLY",
  // so lighting somebody else's lantern is the ordinary use. The rules
  // half already reached an unowned target through the relay
  // (`createEffectsOn`); at 3.396.0 the glow did not, and the live pass
  // caught the card apologising for it. Same route now.
  //
  // `direct` IS THE GM'S OWN CALL COMING BACK IN. Without it this would
  // ask the GM's client, which would call this, which would ask again.
  if (!direct) {
    const { relayTokenLight } = await import("./combat/target-relay-workflow.mjs");
    return relayTokenLight(actor, key, () => writeLight(actor, config));
  }
  return writeLight(actor, config);
}

/** The write itself, once permission is settled. */
async function writeLight(actor, config) {
  let updated = 0;
  for (const token of tokensFor(actor)) {
    const doc = token.document ?? token;
    if (!doc?.update) continue;

    // ONLY STASH ONCE. A second light cast on a token that already
    // carries one must not overwrite the stash with the first spell's
    // light — that is how the GM's original lantern gets lost.
    const already = doc.getFlag?.(SYSTEM_ID, STASH);
    const payload = { light: config };
    if (already === undefined) {
      payload[`flags.${SYSTEM_ID}.${STASH}`] = doc.light?.toObject?.() ?? { ...doc.light };
    }
    await doc.update(payload);
    updated += 1;
  }
  return updated;
}

/**
 * Put back whatever the token's light was before a spell replaced it.
 *
 * ASKS WHETHER ANY LIGHT SOURCE IS STILL ATTACHED FIRST. Two lights on
 * one token — a torch and a cast Light — must not have the first
 * removal restore the original and leave the second spell drawing
 * nothing. Only the last one out restores.
 */
export async function restoreTokenLight(actor, { direct = false } = {}) {
  if (lightSourceKeysOn(actor).length > 0) return 0;
  if (!direct) {
    const { relayTokenLight } = await import("./combat/target-relay-workflow.mjs");
    return relayTokenLight(actor, null, () => clearLight(actor));
  }
  return clearLight(actor);
}

/** Putting the stashed light back, once permission is settled. */
async function clearLight(actor) {
  let restored = 0;
  for (const token of tokensFor(actor)) {
    const doc = token.document ?? token;
    if (!doc?.update) continue;
    const before = doc.getFlag?.(SYSTEM_ID, STASH);
    if (before === undefined) continue;
    await doc.update({
      light: before,
      [`flags.${SYSTEM_ID}.-=${STASH}`]: null
    });
    restored += 1;
  }
  return restored;
}

/**
 * Make the token's glow match what the actor is actually shedding.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ONE ENTRY POINT for anything that changes an actor's lights, and
 * it exists because the live pass on 3.397.0 found the alternative
 * failing. The sheet used to call `attachTokenLight` directly the
 * moment a torch was lit — which drew a glow for an UNEQUIPPED torch
 * that `lightSourceKeysOn` correctly reported as shedding nothing. The
 * rule said dark, the picture said lit, and each was consulting its own
 * idea of the question.
 *
 * Now there is one idea of the question. This reads the same list the
 * illumination ladder reads and makes the glow agree with it: something
 * in the list, draw the brightest; nothing, put it out.
 *
 * IT ALSO CLOSES A GAP NOBODY HAD NOTICED. Equipping and unequipping a
 * lit torch never touched the glow at all, so a lit torch stowed in a
 * pack went on lighting the room. `toggleItemEquipped` calls this too,
 * which is why that now works without either function knowing about the
 * other.
 */
export async function refreshAttachedLight(actor, opts = {}) {
  const key = brightestSourceKey(lightSourceKeysOn(actor));
  if (!key) return restoreTokenLight(actor, opts);
  return attachTokenLight(actor, key, opts);
}

/**
 * Take the light off a token when its effect ends.
 *
 * HOOKED ON `deleteActiveEffect` RATHER THAN CALLED FROM THE SWEEPERS,
 * for the same reason `registerGrantedItemCleanup` is: that hook fires
 * for EVERY route an effect can leave an actor. A GM who deletes the
 * effect off the Effects tab, a duration that expires, a dispel, an
 * undo — all of them land here, and none of them has to know that
 * attached lights exist.
 */
export function registerAttachedLightCleanup() {
  Hooks.on("deleteActiveEffect", (effect) => {
    try {
      const key = effect?.getFlag?.(SYSTEM_ID, "lightSource");
      if (!key) return;
      const actor = effect.parent;
      if (!actor?.getActiveTokens && !actor?.token) return;
      // NOT AWAITED — a hook cannot be async and returning a promise
      // here would be a promise nobody holds. Errors are caught inside
      // rather than escaping into Foundry's hook dispatcher.
      //
      // REDRAWN, NOT ONLY RESTORED (3.669.0). With a second light still
      // running — Spirit Beacon ending over Living Lantern, a cast Light
      // ending over a lit torch — restoring did nothing and the token went
      // on drawing the light that had ended. The refresh draws the brightest
      // that is left, and restores the original only when nothing is.
      //
      // ON ONE CLIENT, AND DIRECTLY (found in review). The hook fires on
      // every connected client, and each non-owner used to relay its own
      // write to the GM — one token update per client per light. The acting
      // GM writes it; with no GM connected, the actor's owner does.
      const here = isActingGM() || (!globalThis.game?.users?.activeGM && actor.isOwner);
      if (!here) return;
      refreshAttachedLight(actor, { direct: true }).catch((err) => {
        console.warn(`${SYSTEM_ID} | could not restore token light`, err);
      });
    } catch (err) {
      console.warn(`${SYSTEM_ID} | attached-light cleanup failed`, err);
    }
  });
}
