/**
 * The Foundry side of the inscribed runes (see inscribed-rune.mjs).
 *
 * NEW at 3.604.0, Graham's R10 of block 31.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE THINGS HAPPEN HERE AND NOWHERE ELSE.
 *
 *   THE DESIGNATION PICKER, at cast time, listing who is inside the ward's
 *   radius when the ritual finishes. Ten minutes of casting is precisely
 *   when a caster names people, and a creature outside the radius cannot
 *   be named — the page says "all creatures you designate", and the
 *   designation is of people present at an inscription.
 *
 *   THE REGION, carrying the rune's whole record on a flag. `recordNexus`
 *   does the same for the elemental nexus and for the same reason: the
 *   zone has to outlive the cast, and a Region is the only thing in
 *   Foundry that does.
 *
 *   THE MOVEMENT WATCHER, which is where both runes are actually read.
 *   Registered beside `registerDistanceTriggers`, off the same hook, and
 *   deliberately: "who just crossed the edge" is a question only movement
 *   can answer.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE WATCHER SWEEPS EVERY RUNE, NOT THE MOVED TOKEN'S OWN.
 *
 * The tether hangs off the creature it binds, so `checkTethers` starts
 * from the token that moved. A rune belongs to a PLACE and knows nothing
 * about who might walk into it, so the sweep has to run the other way:
 * every live rune on the scene, against every token in it.
 *
 * THAT IS WHY IT IS EDGE-TRIGGERED RATHER THAN IDEMPOTENT. Re-applying a
 * ward to everybody standing in it on every movement anywhere would stack
 * effects and spam the log; `runeCrossings` compares against the record's
 * own memory of who was inside and acts only on the difference.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A LAPSED RUNE TIDIES ITSELF UP.
 *
 * Eight hours is long enough that a world will cross it between sessions,
 * so the watcher removes an expired rune's Region and takes its ward back
 * off whoever still holds it. A Region left on the map granting a bonus
 * nobody can account for is worse than one that vanishes.
 */

import {
  RUNE_FLAG, WARD_BONUS_ROWS, runeCrossings, runeDesignates, runeIsLive, runeWatchesTrait,
  wardEnteredLine, wardLeftLine, warningGlowsLine
} from "./inscribed-rune.mjs";

// A LOCAL CONST, NOT AN IMPORT. There is no `constants` module in this tree
// and the first draft of this file imported one — the same mistake 3.599.0
// shipped and `verify-imports-resolve` was built to catch. Every other
// workflow file in magic/ declares it the same way.
const SYSTEM_ID = "trg-prime";

const card = (body) =>
  `<div class="trg-prime trg-check-card"><p style="margin:2px 0">${body}</p></div>`;

/** Every live rune Region on a scene, with its record. */
export function runesOn(scene, now) {
  const out = [];
  for (const region of scene?.regions ?? []) {
    const record = region.getFlag?.(SYSTEM_ID, RUNE_FLAG) ?? null;
    if (!record) continue;
    out.push({ region, record, live: runeIsLive(record, now) });
  }
  return out;
}

/**
 * Is this point inside the rune, in feet?
 *
 * MEASURED IN FEET FROM THE CENTRE, the same units the emanation uses and
 * for the same reason: pixels are a property of the scene's grid settings
 * and feet are a property of the rules.
 */
export function pointInRune(record, point, pxPerFoot) {
  if (!record || !point || !(Number(pxPerFoot) > 0)) return false;
  const dx = (Number(point.x) - Number(record.centre.x)) / Number(pxPerFoot);
  const dy = (Number(point.y) - Number(record.centre.y)) / Number(pxPerFoot);
  return Math.sqrt((dx * dx) + (dy * dy)) <= Number(record.radiusFeet);
}

/** The emanation-shaped descriptor the ward hands to the shared applier. */
export function wardAsEmanation(record) {
  return { name: record?.label || "Rune of Warding", effects: [...WARD_BONUS_ROWS] };
}

/**
 * Bring every rune on a scene up to date after something moved.
 *
 * RETURNS WHAT IT DID, so the harness can drive it without a world and so
 * a caller can tell "nothing crossed" from "nothing ran".
 */
export async function refreshRunes(scene, { now = null } = {}) {
  const worldTime = now ?? Number(game?.time?.worldTime ?? 0);
  const pxPerFoot = (scene?.grid?.size ?? 0) / (scene?.grid?.distance ?? 1);
  const result = { entered: [], left: [], glowed: [], expired: [] };
  if (!(pxPerFoot > 0)) return result;

  const { applyEmanationEffectsTo, removeEmanationEffectsFrom } =
    await import("./emanation-effects.mjs");
  const { traitList } = await import("../traits.mjs");

  for (const { region, record, live } of runesOn(scene, worldTime)) {
    if (!live) {
      // EXPIRED: take the ward back off everybody first, then remove the
      // Region. In that order — a Region deleted first leaves the record
      // unreadable and the bonus stranded on the sheet.
      for (const uuid of record.inside ?? []) {
        const doc = await fromUuid(uuid).catch(() => null);
        const actor = doc?.actor ?? doc ?? null;
        if (actor && record.kind === "runeWard") {
          await removeEmanationEffectsFrom(actor, record.castId);
        }
      }
      result.expired.push(record.label);
      await region.delete();
      continue;
    }

    const insideNow = [];
    for (const tokenDoc of scene.tokens ?? []) {
      const object = tokenDoc.object ?? tokenDoc;
      const centre = object?.center ?? { x: tokenDoc.x, y: tokenDoc.y };
      if (pointInRune(record, centre, pxPerFoot)) insideNow.push(tokenDoc.uuid);
    }
    const { entered, left, inside } = runeCrossings(record, insideNow);
    if (!entered.length && !left.length) continue;

    for (const uuid of left) {
      const doc = await fromUuid(uuid).catch(() => null);
      const actor = doc?.actor ?? null;
      if (!actor) continue;
      if (record.kind !== "runeWard" || !runeDesignates(record, uuid)) continue;
      await removeEmanationEffectsFrom(actor, record.castId);
      result.left.push(actor.name);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: card(wardLeftLine(record.label, actor.name))
      });
    }

    for (const uuid of entered) {
      const doc = await fromUuid(uuid).catch(() => null);
      const actor = doc?.actor ?? null;
      if (!actor) continue;
      if (record.kind === "runeWard") {
        if (!runeDesignates(record, uuid)) continue;
        await applyEmanationEffectsTo(actor, record.castId, wardAsEmanation(record), null, null);
        result.entered.push(actor.name);
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: card(wardEnteredLine(record.label, actor.name))
        });
      } else {
        const traits = traitList(actor.system?.traits ?? actor.system?.details?.traits ?? "");
        if (!runeWatchesTrait(record, traits)) continue;
        result.glowed.push(actor.name);
        // GM ONLY. Graham's ruling: the rune fires whether or not anybody
        // is standing there, so the GM is told and decides who noticed.
        await ChatMessage.create({
          content: card(warningGlowsLine(record.label, actor.name, record.trait)),
          whisper: ChatMessage.getWhisperRecipients("GM")
        });
      }
    }

    await region.setFlag(SYSTEM_ID, RUNE_FLAG, { ...record, inside });
  }
  return result;
}

/** Watch movement for both runes, beside the shadow tether's own watcher. */
export function registerInscribedRunes() {
  Hooks.on("updateToken", async (tokenDocument, changed) => {
    const { isActingGM } = await import("../acting-gm.mjs");
    if (!isActingGM()) return;
    // MOVED, and nothing else. A token renamed or re-imaged has not walked.
    if (!("x" in changed) && !("y" in changed)) return;
    const scene = tokenDocument?.parent ?? null;
    if (scene) await refreshRunes(scene);
  });
}
