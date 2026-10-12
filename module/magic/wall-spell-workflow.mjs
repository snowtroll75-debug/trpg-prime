/**
 * The wall spells on the board: placing them, raising the Foundry Walls,
 * and the riders that bite after the cast.
 *
 * NEW at 3.610.0, block 33's R9. The rules are in magic/wall-spell.mjs.
 *
 *   placeWall          the aim: one click for a ring, two for a line —
 *                      anywhere in range, turned freely.
 *   raiseWall          what the cast does once the Region exists: refuse a
 *                      wall that would form through a creature, put down
 *                      real Foundry Walls for the walls that block, and
 *                      write the riders onto the Region.
 *   registerWallSpells the two hooks — a creature moving into a wall, and a
 *                      wall's Region being deleted (its Foundry Walls go
 *                      with it).
 *   applyWallTurnSaves the save owed for a turn spent in the wall, called
 *                      from the combat tracker at the boundary the page names.
 *   screenedBetween, windBetween, galesBetween
 *                      what an attack crosses, read by the attack and the
 *                      concealment check.
 */

import {
  WALL_FLAG, pathEntersWall, segmentSamples, snapPoint, wallContains, wallEnd,
  wallObstructedLine, wallRaisedLine, wallBlocksLine, wallRegionShapes, wallRiderLines,
  wallSectionLine, wallSegments
} from "./wall-spell.mjs";
import { STORM_FLAG } from "./storm.mjs";
import { feetFromPointToToken, tokenSquares } from "../combat/geometry.mjs";
import { isActingGM } from "../acting-gm.mjs";

const SYSTEM_ID = "trg-prime";
const BANNER_ID = "trg-wall-aim-banner";

/* ---------------------------------------------------------------- *
 * Placing.
 * ---------------------------------------------------------------- */

function banner(label, form) {
  const doc = globalThis.document;
  if (!doc?.body) return () => {};
  doc.getElementById(BANNER_ID)?.remove();
  const el = doc.createElement("div");
  el.id = BANNER_ID;
  el.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:1000;"
    + "pointer-events:none;padding:8px 14px;border-radius:6px;text-align:center;"
    + "background:rgba(20,18,14,0.92);border:1px solid #9b8b5a;color:#f0e6d2;font-size:14px";
  el.innerHTML = `<strong>Place ${label}</strong><br><span style="font-size:12px;opacity:.85">`
    + (form === "ring" ? "Click the ring's centre" : "Click one end, then the other")
    + " · right-click or <strong>Esc</strong> to cancel</span>";
  doc.body.appendChild(el);
  return () => doc.getElementById(BANNER_ID)?.remove();
}

/**
 * Aim a wall and create its Region.
 *
 * @returns {Promise<object|null>} the placed wall ({t:"wall", form, …, regionId}) or null
 */
export async function placeWall(spec, actor, rangeFeet, label) {
  if (!spec || !canvas?.ready) return null;
  const token = actor?.getActiveTokens?.()[0] ?? null;
  const grid = canvas.dimensions.size;
  const pxPerFt = grid / canvas.dimensions.distance;

  let form = spec.forms[0];
  if (spec.forms.length > 1) {
    const picked = await foundry.applications.api.DialogV2.wait({
      window: { title: `${label} — shape` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">A straight line up to `
        + `${spec.lengthFeet} ft long, or a ring of radius ${spec.ringRadiusFeet} ft.</p></div>`,
      buttons: [
        { action: "line", label: "Line", default: true },
        { action: "ring", label: "Ring" }
      ],
      rejectClose: false
    });
    if (picked !== "line" && picked !== "ring") return null;
    form = picked;
  }

  // IN RANGE, MEASURED AS EVERY SPELL RANGE IS (the caster's nearest square,
  // the grid's own diagonals) and pulled back along the line to the caster
  // when the cursor is beyond it.
  const centre = token?.center ?? { x: canvas.dimensions.width / 2, y: canvas.dimensions.height / 2 };
  const inRange = (p) => !token || !(Number(rangeFeet) > 0) || feetFromPointToToken(p, token) <= Number(rangeFeet);
  const clamp = (p) => {
    if (inRange(p)) return p;
    let lo = 0;
    let hi = 1;
    const at = (t) => ({ x: centre.x + (p.x - centre.x) * t, y: centre.y + (p.y - centre.y) * t });
    for (let i = 0; i < 12; i += 1) {
      const mid = (lo + hi) / 2;
      if (inRange(at(mid))) lo = mid; else hi = mid;
    }
    return at(lo);
  };
  const placeAt = (p) => {
    const snapped = snapPoint(clamp(p), grid, spec.snap);
    return inRange(snapped) ? snapped : clamp(p);
  };
  const maxPx = spec.lengthFeet * pxPerFt;
  const ringPx = spec.ringRadiusFeet * pxPerFt;
  const endFrom = (start, cursor) => {
    const raw = wallEnd(start, cursor, maxPx, grid);
    const snapped = snapPoint(raw, grid, spec.snap);
    return Math.hypot(snapped.x - start.x, snapped.y - start.y) <= maxPx + 1 && Math.hypot(snapped.x - start.x, snapped.y - start.y) >= 1
      ? snapped : raw;
  };

  const colour = game.user.color?.css ?? game.user.color ?? "#ff0000";
  const pixi = Number(String(colour).replace("#", "0x")) || 0xff0000;
  const preview = new PIXI.Graphics();
  canvas.controls.addChild(preview);
  const removeBanner = banner(label, form);
  const draw = (a, b) => {
    preview.clear();
    preview.lineStyle(Math.max(3, spec.stripFeet * pxPerFt * 0.6), pixi, 0.6);
    if (form === "ring") preview.drawCircle(a.x, a.y, ringPx);
    else if (b) { preview.moveTo(a.x, a.y); preview.lineTo(b.x, b.y); }
    else preview.drawCircle(a.x, a.y, 4);
  };

  return new Promise((resolve) => {
    let start = null;
    let last = null;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      canvas.stage.off("mousemove", onMove);
      canvas.stage.off("mousedown", onClick);
      globalThis.removeEventListener?.("keydown", onKey, true);
      removeBanner();
      try { canvas.controls.removeChild(preview); preview.destroy(); } catch { /* gone */ }
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    };
    const onMove = (event) => {
      const p = event.data.getLocalPosition(canvas.stage);
      if (form === "ring" || !start) { last = placeAt(p); draw(last, null); }
      else { last = endFrom(start, p); draw(start, last); }
    };
    const commit = async (a, b) => {
      const tmpl = form === "ring"
        ? { t: "wall", form, x: a.x, y: a.y, radius: ringPx, widthFeet: spec.stripFeet,
          distance: spec.ringRadiusFeet, lengthFeet: Math.round(2 * Math.PI * spec.ringRadiusFeet) }
        : { t: "wall", form, x0: a.x, y0: a.y, x1: b.x, y1: b.y, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
          widthFeet: spec.stripFeet, distance: spec.lengthFeet,
          lengthFeet: Math.hypot(b.x - a.x, b.y - a.y) / pxPerFt };
      const [created] = await canvas.scene.createEmbeddedDocuments("Region", [{
        name: label, color: colour, visibility: CONST.REGION_VISIBILITY.ALWAYS,
        shapes: wallRegionShapes(tmpl, pxPerFt)
      }]);
      return created ? { ...tmpl, regionId: created.id } : null;
    };
    const onClick = async (event) => {
      if (event.data?.originalEvent?.button === 2) { finish(null); return; }
      event.stopPropagation?.();
      const p = event.data.getLocalPosition(canvas.stage);
      if (form === "ring") { finish(await commit(placeAt(p), null)); return; }
      if (!start) { start = placeAt(p); draw(start, null); return; }
      finish(await commit(start, endFrom(start, p)));
    };
    canvas.stage.on("mousemove", onMove);
    canvas.stage.on("mousedown", onClick);
    globalThis.addEventListener?.("keydown", onKey, true);
  });
}

/* ---------------------------------------------------------------- *
 * Raising.
 * ---------------------------------------------------------------- */

/** Creatures standing in the wall's space, by any square they occupy. */
function creaturesInWall(placed) {
  const grid = canvas.dimensions.size;
  const pxPerFt = grid / canvas.dimensions.distance;
  return (canvas.tokens?.placeables ?? []).filter((t) => {
    const squares = tokenSquares(t);
    const points = squares.length
      ? squares.map((sq) => ({ x: sq.col * grid + grid / 2, y: sq.row * grid + grid / 2 }))
      : [t.center];
    return points.some((p) => wallContains(placed, p, { pxPerFt }));
  });
}

/**
 * What the cast does once the wall's Region exists.
 *
 * @returns {Promise<string[]>} card lines
 */
export async function raiseWall(region, spec, placed, { caster, spellName, castId, dc, formula, type, baseDamage, damageScope }) {
  const lines = [];
  // "IT MUST FORM IN OPEN SPACE … otherwise the spell fails." Asked of the
  // wall's own footprint, before anything is put down.
  if (spec.unobstructed) {
    const inTheWay = creaturesInWall(placed);
    if (inTheWay.length) {
      await canvas.scene.deleteEmbeddedDocuments("Region", [region.id]).catch(() => {});
      return [wallObstructedLine(spellName, inTheWay.map((t) => t.name))];
    }
  }
  lines.push(wallRaisedLine(spec, placed, spellName));
  if (spec.block) {
    const docs = wallSegments(placed).map((c) => ({
      c, move: spec.block.move, sight: spec.block.sight, light: spec.block.light, sound: spec.block.sound,
      flags: { [SYSTEM_ID]: { [WALL_FLAG]: { regionId: region.id, castId } } }
    }));
    const made = await canvas.scene.createEmbeddedDocuments("Wall", docs).catch((error) => {
      console.warn("TRG Prime | the wall could not be put on the map", error);
      return [];
    });
    if (made.length) {
      const blocks = wallBlocksLine(spec);
      if (blocks) lines.push(blocks);
    } else {
      lines.push(`<em>${spellName}: the wall could not be drawn on the map — block movement and sight by hand.</em>`);
    }
  }
  const sections = wallSectionLine(spec);
  if (sections) lines.push(sections);
  await region.setFlag(SYSTEM_ID, WALL_FLAG, {
    castId, casterUuid: caster?.uuid ?? "", label: spellName,
    crossing: spec.crossing, stopsOnFumble: spec.stopsOnFumble, turn: spec.turn,
    screen: spec.screen, wind: spec.wind,
    dc: Number(dc) || 0, formula: String(formula ?? ""), type: String(type ?? ""),
    baseDamage: String(baseDamage ?? ""), damageScope: String(damageScope ?? ""),
    placed
  });
  for (const l of wallRiderLines(spec, dc, formula, type)) lines.push(l);
  return lines;
}

/* ---------------------------------------------------------------- *
 * After the cast.
 * ---------------------------------------------------------------- */

function wallRegions(predicate = () => true) {
  return Array.from(canvas?.scene?.regions ?? [])
    .map((region) => ({ region, rec: region.getFlag?.(SYSTEM_ID, WALL_FLAG) ?? null }))
    .filter(({ rec }) => rec && predicate(rec));
}

/** Is the creature one the wall's damage reaches (Wall Of Light: undead and oozes)? */
async function inScope(rec, actor, caster) {
  if (!rec.damageScope) return true;
  const { damageScope, inDamageScope } = await import("./damage-scope.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
  return inDamageScope(damageScope({ damageScope: rec.damageScope }), actor.system ?? {},
    ownedCreatureTypeSystem(actor), caster?.system ?? null);
}

const recentMoves = new Set();

/** A creature moving into a wall that bites on crossing. */
async function applyWallCrossing(tokenDocument, movement, operation) {
  try {
    if (operation?.trgWallStop) return;
    const mover = tokenDocument?.actor;
    if (!mover || !movement) return;
    const id = String(movement.id ?? "");
    if (id) {
      if (recentMoves.has(id)) return;
      recentMoves.add(id);
      if (recentMoves.size > 200) recentMoves.delete(recentMoves.values().next().value);
    }
    const walls = wallRegions((rec) => rec.crossing && rec.formula);
    if (!walls.length) return;
    const grid = canvas.scene.grid.size;
    const halfW = (Number(tokenDocument.width ?? 1) * grid) / 2;
    const halfH = (Number(tokenDocument.height ?? 1) * grid) / 2;
    const path = [movement.origin, ...(movement.passed?.waypoints ?? []), movement.destination]
      .filter((p) => p && Number.isFinite(Number(p.x)))
      .map((p) => ({ x: Number(p.x) + halfW, y: Number(p.y) + halfH }));
    const { basicSaveHit, recordedCaster } = await import("./area-save-workflow.mjs");
    for (const { region, rec } of walls) {
      const inside = (p) => {
        try { return region.testPoint({ x: p.x, y: p.y, elevation: tokenDocument.elevation ?? 0 }); } catch { return false; }
      };
      const { entered, lastOutside } = pathEntersWall(path, inside, grid / 4);
      if (!entered) continue;
      const caster = await recordedCaster(rec.casterUuid);
      if (!(await inScope(rec, mover, caster))) continue;
      const hit = await basicSaveHit({
        caster, target: mover, save: "reflex", dc: rec.dc, label: rec.label,
        formula: rec.formula, type: rec.type, baseDamage: rec.baseDamage
      });
      const lines = [`<strong>${rec.label}</strong> — ${mover.name} moves into the wall.`, hit.line];
      if (rec.stopsOnFumble && ["fumble", "blunder"].includes(hit.degree) && lastOutside) {
        const back = snapPoint(lastOutside, grid, "centre");
        await tokenDocument.update({ x: back.x - halfW, y: back.y - halfH }, { trgWallStop: true, animate: false });
        lines.push(`It fails to pass: its movement ends beside the wall.`);
      }
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: mover }),
        content: `<div class="trg-prime">${lines.map((l) => `<p style="margin:2px 0">${l}</p>`).join("")}</div>`
      });
    }
  } catch (error) {
    console.error("TRG Prime | a wall could not be crossed", error);
  }
}

/**
 * The save a wall asks of a creature at a turn boundary (Blades: "ends its
 * turn inside the wall"; Fire: "occupying the wall's area at the start of
 * its turn").
 *
 * @returns {Promise<string[]>} card lines
 */
export async function applyWallTurnSaves(actor, token, moment) {
  const lines = [];
  try {
    if (!actor || !token) return lines;
    const { basicSaveHit, recordedCaster, tokenInRegion } = await import("./area-save-workflow.mjs");
    for (const { region, rec } of wallRegions((r) => r.turn === moment && r.formula)) {
      if (!tokenInRegion(region, token)) continue;
      const caster = await recordedCaster(rec.casterUuid);
      if (!(await inScope(rec, actor, caster))) continue;
      const hit = await basicSaveHit({
        caster, target: actor, save: "reflex", dc: rec.dc, label: rec.label,
        formula: rec.formula, type: rec.type, baseDamage: rec.baseDamage
      });
      lines.push(`<strong>${rec.label}</strong> — ${moment === "endOfTurn" ? "ends its turn" : "begins its turn"} in the wall. ${hit.line}`);
    }
  } catch (error) {
    console.error("TRG Prime | a wall's turn save could not be rolled", error);
  }
  return lines;
}

/* ---------------------------------------------------------------- *
 * What an attack crosses.
 * ---------------------------------------------------------------- */

function tokenOf(actorOrToken) {
  if (!actorOrToken) return null;
  if (actorOrToken.center) return actorOrToken;
  if (actorOrToken.object?.center) return actorOrToken.object;
  return actorOrToken.getActiveTokens?.()?.[0] ?? null;
}

function crosses(region, a, b) {
  const step = (canvas?.scene?.grid?.size ?? 100) / 4;
  return segmentSamples(a, b, step).some((p) => {
    try { return region.testPoint({ x: p.x, y: p.y, elevation: 0 }); } catch { return false; }
  });
}

function between(from, to, test) {
  const a = tokenOf(from)?.center;
  const b = tokenOf(to)?.center;
  if (!a || !b) return null;
  for (const region of canvas?.scene?.regions ?? []) {
    const wall = region.getFlag?.(SYSTEM_ID, WALL_FLAG) ?? null;
    const storm = region.getFlag?.(SYSTEM_ID, STORM_FLAG) ?? null;
    const label = test(wall, storm);
    if (label && crosses(region, a, b)) return label;
  }
  return null;
}

/** A wall or storm that conceals what is seen through it (Wall Of Fire; the storm's Rain and Wind). */
export function screenedBetween(from, to) {
  return between(from, to, (wall, storm) => (wall?.screen ? wall.label : storm?.screen ? storm.label : null));
}

/** A wall of wind between a shooter and its target. */
export function windBetween(from, to) {
  return between(from, to, (wall) => (wall?.wind ? wall.label : null));
}

/** A storm's gales on a ranged attack in or through it. */
export function galesBetween(from, to) {
  return between(from, to, (wall, storm) => (storm ? storm.label : null));
}

/* ---------------------------------------------------------------- *
 * Hooks.
 * ---------------------------------------------------------------- */

/** Called from the system's ready hook beside the hazard's. */
export function registerWallSpells() {
  Hooks.on("moveToken", async (tokenDocument, movement, operation) => {
    if (!isActingGM()) return;
    await applyWallCrossing(tokenDocument, movement, operation);
  });
  // A WALL'S FOUNDRY WALLS GO WITH ITS REGION, whoever deletes it — the
  // duration running out, the spell dismissed, or a GM's hand.
  Hooks.on("deleteRegion", async (region) => {
    if (!isActingGM()) return;
    if (!region.getFlag?.(SYSTEM_ID, WALL_FLAG)) return;
    const scene = region.parent;
    const ids = Array.from(scene?.walls ?? [])
      .filter((w) => w.getFlag?.(SYSTEM_ID, WALL_FLAG)?.regionId === region.id)
      .map((w) => w.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Wall", ids).catch(() => {});
  });
}

