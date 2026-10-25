/**
 * LIGHTS A PLAYER PLACES AND MOVES (3.669.0; Inner Tempest's Foxfire: "You
 * create up to three floating motes of spectral flame within range. Each
 * sheds dim light within 10 feet. When you use the technique, and once each
 * turn thereafter as a Free Action, you may move each flame up to 30 feet to
 * another location within range.").
 *
 * ─────────────────────────────────────────────────────────────────────
 * A CIRCLE, NOT A TOKEN. Graham's B5-4 asked for three small light tokens.
 * A token is the one thing on the map a player can drag, but this system
 * reads every token with an actor as a creature: flanking (aid-bonus.mjs),
 * reactive strikes (opportunity.mjs), area saves (cast-workflow.mjs,
 * burst-workflow.mjs), the reaction scans — some forty places. A mote drawn
 * as a token of its caster would flank, catch a Fireball and offer the
 * caster's own reactions; there is no safe way to make it not a creature
 * without touching every one of them.
 *
 * So each mote is what Inner Sanctum's placed circle already is: a Region
 * carrying `lightShift` (light-workflow.mjs `regionLightShifts` reads it for
 * every token on every check), placed and moved with the area aim
 * (spell-template.mjs `placeSpellTemplate`), which already clamps to the
 * range and says on screen what it is waiting for, and removed by the
 * Region-expiry sweep when its minute is spent. The circles of one Use share
 * a cast id, so two overlapping motes light a creature once, as Fairy Fire's
 * circles do.
 */

import { placeSpellTemplate } from "./spell-template.mjs";
import { endsStamp } from "./spell-ends.mjs";
import { REGION_EXPIRY_FLAG, regionExpiryRecord } from "./region-expiry.mjs";
import { isActingGM } from "../acting-gm.mjs";

const SYSTEM_ID = "trg-prime";
/** The channel a player's move or removal is handed to the acting GM on. */
const SOCKET = `system.${SYSTEM_ID}`;

/** The flag a placed light circle carries: whose, and which of how many. */
const LIGHT_CIRCLE_FLAG = "lightCircle";

/**
 * THE SCENE THE CIRCLES WERE PLACED ON (fixed in review, 3.669.0), not the
 * one this client happens to be viewing: a GM looking at another scene when
 * the light ends would otherwise leave them lighting the first.
 */
function sceneOf(sceneId) {
  return (sceneId ? globalThis.game?.scenes?.get?.(sceneId) : null) ?? globalThis.canvas?.scene ?? null;
}

/** The placed light circles of one Use, on the scene named (or the one in view). */
export function lightCirclesOf(castId, { sceneId = "" } = {}) {
  const id = String(castId ?? "");
  if (!id) return [];
  return Array.from(sceneOf(sceneId)?.regions ?? []).filter((r) => r?.getFlag?.(SYSTEM_ID, LIGHT_CIRCLE_FLAG) && r.getFlag(SYSTEM_ID, "castId") === id);
}

/** May this client write the Region itself, or must the acting GM? */
function writesHere(region) {
  return Boolean(globalThis.game?.user?.isGM) || Boolean(region?.canUserModify?.(globalThis.game?.user, "update"));
}

function askGM(action, payload) {
  if (!globalThis.game?.users?.activeGM) {
    globalThis.ui?.notifications?.warn("No GM is connected — the light cannot be moved or removed until one is.");
    return false;
  }
  globalThis.game.socket?.emit(SOCKET, { action, ...payload });
  return true;
}

function circleCentre(region) {
  const shape = region?.shapes?.[0];
  return shape ? { x: Number(shape.x) || 0, y: Number(shape.y) || 0 } : null;
}

/**
 * Place up to `count` light circles, one aim each. Escape stops early (the
 * feat's "up to three"). Resolves the Region ids placed.
 *
 * @param {Actor} actor
 * @param {{name: string, count?: number, radiusFeet: number, rangeFeet: number,
 *   steps?: number, cap?: number|null, castId: string,
 *   seconds?: number|null, rounds?: number|null}} spec
 */
export async function placeLightCircles(actor, spec = {}) {
  const scene = canvas?.scene;
  if (!scene || !canvas?.dimensions) return [];
  const count = Math.max(1, Math.min(10, Math.trunc(Number(spec.count) || 1)));
  const radiusFeet = Math.max(1, Number(spec.radiusFeet) || 5);
  const steps = Math.trunc(Number(spec.steps ?? 1)) || 1;
  const castId = String(spec.castId ?? "");
  const name = String(spec.name ?? "Light");
  const pxPerFt = canvas.dimensions.size / canvas.dimensions.distance;
  const ends = endsStamp({
    seconds: spec.seconds ?? null,
    rounds: spec.rounds ?? null,
    worldTime: Number(game.time?.worldTime ?? 0),
    round: game.combat?.started ? Number(game.combat.round ?? 0) : null
  });
  const config = { t: "circle", shape: "burst", distance: radiusFeet };
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const label = count > 1 ? `${name} (${i + 1} of ${count})` : name;
    const placed = await placeSpellTemplate(config, actor, Number(spec.rangeFeet) || null, label, {
      commit: async (x, y) => {
        const [region] = await scene.createEmbeddedDocuments("Region", [{
          name: `${name}: ${actor?.name ?? ""}`.trim(),
          color: game.user?.color?.css ?? game.user?.color ?? "#f5c877",
          visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2,
          shapes: [{ type: "circle", x, y, radius: radiusFeet * pxPerFt, hole: false, gridBased: false }],
          flags: {
            [SYSTEM_ID]: {
              lightShift: { steps, floor: 1, cap: spec.cap ?? 10 },
              castId,
              [LIGHT_CIRCLE_FLAG]: { ownerUuid: actor?.uuid ?? "", index: i, name },
              ...(ends ? { [REGION_EXPIRY_FLAG]: regionExpiryRecord({ castId, spellName: name, ends }) } : {})
            }
          }
        }]);
        return region?.id ?? null;
      }
    });
    if (!placed) break;
    ids.push(placed);
  }
  return ids;
}

/**
 * Move each of a Use's circles, one aim each, at most `maxFeet` from where it
 * is and within `rangeFeet` of the actor. Escape leaves that one where it is.
 * Resolves how many moved.
 */
export async function moveLightCircles(actor, { castId, sceneId = "", maxFeet = 30, rangeFeet = null, name = "Light" } = {}) {
  // ONLY ON THE SCENE IN VIEW: the aim is drawn on this canvas.
  if (sceneId && canvas?.scene?.id !== sceneId) return 0;
  const circles = lightCirclesOf(castId, { sceneId });
  let moved = 0;
  for (const [i, region] of circles.entries()) {
    const from = circleCentre(region);
    if (!from) continue;
    const radiusFeet = Number(region.shapes[0].radius) / (canvas.dimensions.size / canvas.dimensions.distance);
    const label = circles.length > 1 ? `Move ${name} (${i + 1} of ${circles.length})` : `Move ${name}`;
    const done = await placeSpellTemplate({ t: "circle", shape: "burst", distance: radiusFeet }, actor, Number(rangeFeet) || null, label, {
      fromPoint: from,
      maxFeetFrom: Math.max(0, Number(maxFeet) || 0),
      commit: async (x, y) => {
        // THROUGH THE ACTING GM when this client may not write the Region
        // (found in review): every other Region written after it is made
        // goes that way.
        if (!writesHere(region)) return askGM("lightCircle.move", { sceneId: region.parent?.id ?? "", regionId: region.id, x, y });
        await moveCircle(region, x, y);
        return true;
      }
    });
    if (done) moved += 1;
  }
  return moved;
}

async function moveCircle(region, x, y) {
  const shape = { ...(region.shapes[0].toObject?.() ?? region.shapes[0]), x, y };
  await region.update({ shapes: [shape] });
}

/** Take a Use's circles off the scene they were placed on. Resolves how many went (or were handed to the GM). */
export async function removeLightCircles(castId, { sceneId = "" } = {}) {
  const circles = lightCirclesOf(castId, { sceneId });
  if (!circles.length) return 0;
  if (!circles.every((r) => writesHere(r))) return askGM("lightCircle.remove", { sceneId: circles[0].parent?.id ?? sceneId, castId }) ? circles.length : 0;
  await circles[0].parent.deleteEmbeddedDocuments("Region", circles.map((r) => r.id));
  return circles.length;
}

/** The acting GM's side of a player's move or removal. Registered at boot. */
export function registerPlacedLights() {
  globalThis.game?.socket?.on(SOCKET, (data) => {
    const action = String(data?.action ?? "");
    if (!action.startsWith("lightCircle.") || !isActingGM()) return;
    (async () => {
      const scene = sceneOf(String(data.sceneId ?? ""));
      if (action === "lightCircle.move") {
        const region = scene?.regions?.get?.(String(data.regionId ?? ""));
        // A LIGHT CIRCLE AND NOTHING ELSE: a forged request cannot move
        // another Region.
        if (region?.getFlag?.(SYSTEM_ID, LIGHT_CIRCLE_FLAG)) await moveCircle(region, Number(data.x) || 0, Number(data.y) || 0);
      } else if (action === "lightCircle.remove") {
        const ids = lightCirclesOf(String(data.castId ?? ""), { sceneId: scene?.id ?? "" }).map((r) => r.id);
        if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
      }
    })().catch((error) => console.error("TRG Prime | placed light request failed", error));
  });
}
