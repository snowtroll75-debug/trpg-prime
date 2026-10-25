/**
 * The Foundry side of a ward zone (see ward-zone.mjs): placing the circle,
 * and keeping its occupants' effects in step as tokens and wards come and go.
 *
 * NEW at 3.666.0.
 *
 * ONE CLIENT DOES THE BOOKKEEPING. Effects are written on actors the placer
 * may not own, so the acting GM keeps every occupant in step, answering the
 * same hooks every client sees: a token moving, a token arriving or
 * leaving the scene, a ward placed, reshaped or gone (dispelled by hand, or
 * expired by core's region-expiry sweep, which the ward is stamped for).
 *
 * SERIALISED PER SCENE through the aura workflow's own lock, because a sync
 * is a read-modify-write and two moves in quick succession must not both
 * add the same effect.
 */

import { WARD_FLAG, WARD_EFFECT_FLAG, normaliseWardZone, wardEffectData, wardDelta } from "./ward-zone.mjs";
import { isActingGM } from "../acting-gm.mjs";
import { serialiseByKey, tokenCentre } from "../creature-aura-workflow.mjs";

const SYSTEM_ID = "trg-prime";

/** Every ward on a scene, with its declaration. */
function wardRegions(scene) {
  const out = [];
  for (const region of Array.from(scene?.regions ?? [])) {
    const spec = normaliseWardZone(region.getFlag?.(SYSTEM_ID, WARD_FLAG));
    if (spec) out.push({ region, spec });
  }
  return out;
}

/** Is this token's committed centre inside the Region? */
function tokenInside(region, tokenDocument) {
  try {
    const c = tokenCentre(tokenDocument);
    return Boolean(region.testPoint({ x: c.x, y: c.y, elevation: Number(tokenDocument?.elevation ?? 0) }));
  } catch {
    return false;
  }
}

/**
 * Bring every token on the scene into step with the wards on it.
 * The acting GM only; anybody else returns at once.
 */
function syncWardZones(scene = canvas?.scene) {
  if (!scene || !isActingGM()) return Promise.resolve();
  return serialiseByKey(`ward-zones:${scene.id}`, () => syncWardZonesNow(scene));
}

async function syncWardZonesNow(scene) {
  const { CHANGE_TYPE } = await import("../effect-change-types.mjs");
  const wards = wardRegions(scene);
  for (const tokenDocument of Array.from(scene.tokens ?? [])) {
    const actor = tokenDocument.actor;
    if (!actor) continue;
    const held = Array.from(actor.effects ?? []).filter((e) => e.getFlag?.(SYSTEM_ID, WARD_EFFECT_FLAG));
    const holding = held.map((e) => String(e.getFlag(SYSTEM_ID, WARD_EFFECT_FLAG)));
    const inside = wards.filter(({ region }) => tokenInside(region, tokenDocument)).map(({ region }) => region.uuid);
    const { add, remove } = wardDelta(holding, inside);
    if (remove.length) {
      const ids = held.filter((e) => remove.includes(String(e.getFlag(SYSTEM_ID, WARD_EFFECT_FLAG)))).map((e) => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
    if (add.length) {
      const data = add.map((uuid) => wardEffectData(wards.find(({ region }) => region.uuid === uuid).spec, uuid, CHANGE_TYPE, SYSTEM_ID));
      await actor.createEmbeddedDocuments("ActiveEffect", data);
    }
  }
}

/**
 * Draw a ward around the actor's token: a circle of `radiusFeet`, lasting
 * `seconds` of world time (core's region-expiry sweep removes it).
 *
 * @returns {Promise<object|null>} the Region, or null when there is no
 *   token on the viewed scene to centre it on
 */
export async function placeWardZone(actor, { label = "Ward", damageType, weakness = false, seconds = 0, radiusFeet = 10 } = {}) {
  const spec = normaliseWardZone({ label, damageType, weakness });
  if (!spec || !canvas?.scene) return null;
  const token = actor?.getActiveTokens?.(true, true)?.find?.((t) => t.parent === canvas.scene)
    ?? actor?.getActiveTokens?.()[0]?.document ?? null;
  if (!token) return null;
  const centre = tokenCentre(token);
  const radius = (Number(radiusFeet) / Number(canvas.dimensions.distance || 5)) * Number(canvas.dimensions.size || 100);
  const [region] = await canvas.scene.createEmbeddedDocuments("Region", [{
    name: `${spec.label} (${spec.weakness ? "weakness" : "resistance"} to ${spec.damageType})`,
    color: spec.weakness ? "#8a1c1c" : "#2f6f8f",
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    // The shape core's own spell areas use (spell-template.mjs regionShapeData).
    shapes: [{ type: "circle", hole: false, x: centre.x, y: centre.y, radius, gridBased: false }],
    flags: { [SYSTEM_ID]: { [WARD_FLAG]: { label: spec.label, damageType: spec.damageType, weakness: spec.weakness } } }
  }]);
  if (!region) return null;
  if (Number(seconds) > 0) {
    const { stampRegionExpiry } = await import("../magic/region-expiry-workflow.mjs");
    await stampRegionExpiry(region.id, {
      castId: "", spellName: spec.label,
      ends: { endsAtWorldTime: Math.trunc(Number(game.time?.worldTime ?? 0) + Number(seconds)), endsOnRound: null }
    });
  }
  return region;
}

/** Wire the hooks. Called once at ready. */
export function registerWardZones() {
  const isWard = (region) => Boolean(normaliseWardZone(region?.getFlag?.(SYSTEM_ID, WARD_FLAG)));
  const sync = (scene) => { syncWardZones(scene).catch((e) => console.error("TRG Prime | ward zones", e)); };
  Hooks.on("updateToken", (token, change) => {
    if ("x" in change || "y" in change || "elevation" in change) sync(token.parent);
  });
  Hooks.on("createToken", (token) => sync(token.parent));
  // A TOKEN LEAVING THE SCENE takes its wards with it: a linked actor would
  // otherwise carry the resistance off the map for good.
  Hooks.on("deleteToken", (token) => {
    if (!isActingGM()) return;
    const actor = token.actor;
    const sceneWards = new Set(wardRegions(token.parent).map(({ region }) => region.uuid));
    const ids = Array.from(actor?.effects ?? [])
      .filter((e) => sceneWards.has(String(e.getFlag?.(SYSTEM_ID, WARD_EFFECT_FLAG) ?? "")))
      .map((e) => e.id);
    if (ids.length) actor.deleteEmbeddedDocuments("ActiveEffect", ids).catch((e) => console.error("TRG Prime | ward zones", e));
  });
  Hooks.on("createRegion", (region) => { if (isWard(region)) sync(region.parent); });
  Hooks.on("updateRegion", (region) => { if (isWard(region)) sync(region.parent); });
  Hooks.on("deleteRegion", (region) => { if (isWard(region)) sync(region.parent); });
  Hooks.on("canvasReady", () => sync(canvas.scene));
}
