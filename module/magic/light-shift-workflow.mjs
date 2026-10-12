/**
 * The Foundry side of a light-shifting circle (see light-shift.mjs).
 *
 * NEW at 3.490.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ALMOST NOTHING HERE IS NEW. (3.622.2: the following is now the Region's
 * own — see the note in light-shift.mjs. The paragraph below is the 3.490.0
 * design, kept for its history.)
 *
 *   the Region     `scene.createEmbeddedDocuments("Region", …)` with a
 *                  circle shape, exactly as `creature-aura-workflow.mjs`
 *                  has drawn a circle round a creature since 3.331.0.
 *   the following  `recordEmanation` and the refresh loop, which have
 *                  moved Bless around behind its caster since 3.426.2.
 *                  The one thing added for this spell is the ANCHOR, so
 *                  the circle can be centred on the target instead of
 *                  the caster — and let go.
 *   the arithmetic `shiftLightLevel` in light.mjs, pure, which is the
 *                  only place that decides what a step is worth.
 *   the reading    `regionLightShifts` in light-workflow.mjs, which the
 *                  existing light resolution already consults for every
 *                  token on every check.
 *
 * What this file does is put the flag on the Region and hand the record
 * to the emanation loop. If that sounds thin, it is meant to: the reason
 * the spell works is that four subsystems already existed and agreed.
 */

import {
  LIGHT_SHIFT_ANCHOR_FLAG, LIGHT_SHIFT_DROPPABLE_FLAG, anchoredShiftUpdates, droppableCircles,
  lightShiftDroppedLine, tokenCentrePx
} from "./light-shift.mjs";
import { getActiveSpells } from "./active-spells.mjs";
import { activeToken } from "../combat/geometry.mjs";
import { endsStamp } from "./spell-ends.mjs";
import { REGION_EXPIRY_FLAG, regionExpiryRecord } from "./region-expiry.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Draw the circle, flag it, and hand it to the emanation loop.
 *
 * @returns {Promise<string|null>} the Region's id, or null if it could
 *   not be drawn — which the caller must report rather than swallow.
 */
export async function createLightShiftRegion(actor, target, spell, spec, { castId, parsedDuration }) {
  try {
    const scene = canvas?.scene;
    if (!scene || !canvas?.dimensions) return null;

    // ITS OWN TOKEN (3.622.3; the 3.622.2 drive's F1, Graham's R1). Found
    // by actor id, U's circle was drawn on F — two unlinked copies of one
    // actor share the id — and, now that circles follow, followed F.
    const token = activeToken(target);
    // A CREATURE-CENTRED CIRCLE NEEDS A CREATURE ON THE MAP. Refused
    // rather than dropped at the origin, where it would dim a corner of
    // the scene nobody is standing in and look like it worked.
    if (spec.follows && !token) return null;

    const pxPerFt = canvas.dimensions.size / canvas.dimensions.distance;
    const ends = endsStamp({
      seconds: parsedDuration?.seconds ?? null,
      rounds: parsedDuration?.rounds ?? null,
      worldTime: Number(game.time?.worldTime ?? 0),
      round: game.combat?.started ? Number(game.combat.round ?? 0) : null
    });
    const centre = token
      ? { x: token.center.x, y: token.center.y }
      : { x: canvas.dimensions.width / 2, y: canvas.dimensions.height / 2 };

    const [region] = await scene.createEmbeddedDocuments("Region", [{
      name: `${spell.name}: ${target?.name ?? "area"}`,
      shapes: [{
        type: "circle",
        x: centre.x,
        y: centre.y,
        radius: spec.radiusFeet * pxPerFt,
        hole: false
      }],
      visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2,
      // THE FLAG THE LIGHT RESOLUTION READS. `lightShift`, not
      // `lightLevel` — a shift, not an absolute. See regionLightShifts.
      //
      // AND EVERYTHING THE CIRCLE NEEDS TO LIVE AND END ON ITS OWN (3.622.2;
      // the 3.622.1 drive's F1, Graham's R1). The emanation record this
      // used to hand over could not be written — the cast registers after
      // its effects — so the circle now carries its anchor, its decoy and
      // its clock itself. See light-shift.mjs.
      flags: {
        [SYSTEM_ID]: {
          lightShift: { steps: spec.steps, floor: spec.floor, cap: spec.cap ?? 10 },
          castId: castId ?? null,
          // ANCHORED TO THE TARGET, not the caster: Umbral Veil is cast at
          // touch on somebody else and the circle is theirs. A placed
          // circle (Inner Sanctum) follows nobody.
          [LIGHT_SHIFT_ANCHOR_FLAG]: spec.follows ? (token?.id ?? null) : null,
          [LIGHT_SHIFT_DROPPABLE_FLAG]: spec.droppable === true,
          // ITS OWN CLOCK, the stamp every placed area wears, so the
          // Region-expiry sweep removes it when the duration is spent even
          // for a cast nothing registered. A duration nothing can count
          // gets no stamp, and ends with the spell (`endActiveSpell`).
          ...(ends ? { [REGION_EXPIRY_FLAG]: regionExpiryRecord({ castId, spellName: spell.name, ends }) } : {})
        }
      }
    }]);
    if (!region) return null;
    return region.id;
  } catch (error) {
    console.error("TRG Prime | could not draw a light-shift circle", error);
    return null;
  }
}

/**
 * Let the shadows go: the circle stops following and stays put.
 *
 * Graham's ruling, 4 September 2026 — build the drop, print the
 * retrieval.
 *
 * IT DOES NOT END THE SPELL. The book is explicit that the cloak "continues
 * to diminish the light for the remaining duration"; only somebody
 * RETRIEVING it ends things, and that is the half left to the table.
 * So this writes one field and changes nothing else — the duration, the
 * Region and the record all carry on exactly as they were.
 *
 * @returns {Promise<string|null>} a line for the card, or null if there
 *   was nothing droppable to drop.
 */
export async function dropLightShift(actor, castId) {
  const scene = canvas?.scene ?? null;
  // READ OFF THE REGIONS (3.622.2, R1): each circle carries whether it can
  // be put down and whom it follows. A spell that prints no decoy, or a
  // circle already on the floor, finds nothing — and says nothing.
  const held = droppableCircles(Array.from(scene?.regions ?? []), castId, SYSTEM_ID);
  if (!held.length) return null;

  /*
   * THE TARGET LETS IT GO, NOT THE CASTER (fixed 3.492.0).
   *
   * The book is specific about whose action this is: *"the TARGET can
   * remove the cloak of shadows and leave it behind as a decoy"*. READ OFF
   * THE ANCHOR, before it is cleared, because the anchor is the creature
   * actually wearing the cloak.
   */
  const anchor = held[0].getFlag?.(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG) ?? null;
  const wearer = anchor ? (canvas?.tokens?.get(anchor)?.name ?? null) : null;

  // IT DOES NOT END THE SPELL: one field changes, and the Region, its clock
  // and the registry entry all carry on.
  for (const region of held) await region.setFlag(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG, null);
  const name = getActiveSpells(actor).find((e) => e.id === castId)?.name
    ?? String(held[0].name ?? "").split(":")[0] ?? "The shadows";
  return lightShiftDroppedLine(name || "The shadows", wearer ?? actor.name);
}

/** Whether one of a cast's circles can still be put down — the sheet's button. */
export function lightShiftCanDrop(castId) {
  return droppableCircles(Array.from(canvas?.scene?.regions ?? []), castId, SYSTEM_ID).length > 0;
}

/**
 * THE CIRCLE FOLLOWS ITS CREATURE (3.622.2, R1). When a token moves, every
 * circle anchored to it is moved onto its new centre — on one GM's client,
 * the one that may write Regions.
 */
export function registerLightShiftFollow() {
  Hooks.on("updateToken", async (tokenDoc, changes) => {
    if (!("x" in (changes ?? {})) && !("y" in (changes ?? {})) && !("width" in (changes ?? {}))) return;
    const gm = game.users?.activeGM ?? null;
    if (gm ? gm.id !== game.user?.id : !game.user?.isGM) return;
    const scene = tokenDoc?.parent ?? null;
    if (!scene?.regions?.size) return;
    const regions = Array.from(scene.regions).map((r) => ({ id: r.id, flags: r.flags, shapes: r.shapes.map((sh) => sh.toObject?.() ?? sh) }));
    const updates = anchoredShiftUpdates(regions, tokenDoc.id, tokenCentrePx(tokenDoc, scene.grid?.size ?? 100), SYSTEM_ID);
    if (!updates.length) return;
    try {
      await scene.updateEmbeddedDocuments("Region", updates);
    } catch (error) {
      console.warn("TRG Prime | a light-shift circle could not follow its creature", error);
    }
  });
}
