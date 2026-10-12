/**
 * Spell area templates (Chapter 9).
 *
 * Turns a spell's Area text into a placed AoE shape, lets the caster click to
 * place it (aim with the cursor, left-click to drop, right-click to cancel),
 * and collects the tokens caught inside so the save loop can resolve every
 * affected creature at once.
 *
 * V14 migration (3.230.8+): `placeSpellTemplate` creates a real `Region`
 * document instead of a `MeasuredTemplate` — Foundry's own release notes
 * (14.352/14.359) say the MeasuredTemplate document type was absorbed into
 * Scene Regions mid-V14, and the old MeasuredTemplate API/embedded-collection
 * is kept working only as a deprecation-shimmed back-compat layer, hard
 * removed in V16. Confirmed LIVE against a real V14.365 world (not guessed —
 * see the exact field names and conventions below) that `canvas.scene.
 * createEmbeddedDocuments("Region", ...)` with a circle/cone/line shape
 * produces ZERO deprecation warnings, and that Foundry's own `Region#
 * testPoint` containment matches this file's own `templateContains`/
 * `tokensInTemplate` exactly for all three shapes — so neither of those two
 * pure, harness-tested functions needed to change at all. `placeSpellTemplate`
 * still returns the same plain `{t, x, y, distance, direction, angle, width}`
 * shape it always has; `tokensInTemplate`/`templateContains` only ever read
 * those flat fields, never a Foundry document's own methods, so the rest of
 * this file and every caller (cast-workflow.mjs) is untouched by this
 * migration.
 *
 * Ground truth gathered live (region shape schema has no public field-level
 * docs as of this writing — the object's own `CONFIG.Region.documentClass.
 * schema` was inspected directly in a running V14.365 client):
 *  - shape types relevant here: "circle" {x,y,radius}, "cone" {x,y,radius,
 *    angle,rotation,curvature}, "line" {x,y,length,width,rotation} — all in
 *    absolute canvas PIXEL coordinates when `gridBased:false` (confirmed by
 *    testPoint against known pixel offsets: radius 500 caught at 499, not at
 *    500 or beyond).
 *  - `rotation` (cone/line) uses the IDENTICAL convention the old
 *    MeasuredTemplate `direction` field did: degrees, 0° = east (+x),
 *    increasing CLOCKWISE (screen y-down) — confirmed live (rotation 0 caught
 *    a point due east, rotation 90 caught a point due south). So every
 *    existing aiming/rotation computation in this file (squareEdgePoint,
 *    the atan2 aim math) carries over unchanged.
 *  - cone's `curvature: "flat"` draws the same straight-edged pie wedge this
 *    file's own `templateContains` cone math already assumes (round/
 *    semicircle round the two straight edges instead — wrong shape for this
 *    system's rules).
 *  - `visibility: CONST.REGION_VISIBILITY.ALWAYS` keeps the placed shape
 *    visible on the canvas the way a MeasuredTemplate always was, regardless
 *    of which layer is active — the default (`LAYER_UNLOCKED`) only shows a
 *    region while a GM has the Region layer active and unlocked, which would
 *    have made a cast AoE invisible the instant combat moved on.
 *  - `REGION_CREATE` is a real per-role permission (`game.permissions.
 *    REGION_CREATE`); Foundry's own default world permissions grant it to
 *    every role including plain Player, same as this pack's default install
 *    would ship, so a non-GM caster can create one exactly as they always
 *    could a MeasuredTemplate.
 *
 * The live aiming preview no longer uses `CONFIG.MeasuredTemplate.
 * objectClass` (constructing one still instantiates a `MeasuredTemplateDocument`
 * internally, so it fires the exact same deprecation warnings a plain
 * document would) — it's a plain `PIXI.Graphics` shape drawn straight onto
 * `canvas.controls`, the same always-active overlay layer Foundry's own
 * Ruler and Ping previews use. Confirmed live that `canvas.controls` shares
 * the identical coordinate transform as `canvas.stage`/`canvas.tokens` (a
 * known world point maps to the same screen pixel through all three), so
 * every existing coordinate computation (center, edge points, grid snapping)
 * needed no adjustment to draw correctly there.
 */

// Distance is measured in ONE place for the whole system (3.311.0): a
// spell's range has to agree with a bow's about how far away a giant is,
// and about how the scene counts diagonals. See geometry.mjs.
import { feetFromPointToToken, tokenSquares } from "../combat/geometry.mjs";
import { wallContains } from "./wall-spell.mjs";

// TRG cones are treated as a 90° quarter-circle. Adjust here if the book uses a
// different spread — every cone template reads this one constant.
export const CONE_ANGLE = 90;
const DEFAULT_RAY_WIDTH = 5;

/**
 * Parse an Area string (falling back to Range, since a few spells stash their
 * area there) into an area-shape config. Handles radius / emanation /
 * burst / sphere / cylinder (circle), cone, and line / ray (ray). Distances
 * accept "20-foot", "20-ft.", "30’", "1 mile". Returns null for prose areas the
 * GM must place by hand.
 *
 * @param {string} areaText
 * @param {string} [rangeText]
 * @returns {{t:"circle"|"cone"|"ray", distance:number, angle?:number, width?:number, shape:string}|null}
 */
export function parseSpellArea(areaText, rangeText = "") {
  const UNIT = "(?:mile|miles|foot|feet|ft|’|')";
  const SHAPE = "(cone|radius|emanation|burst|sphere|cylinder|spread|line|ray|wall|long|wide)";
  const toShape = (word, distance) => {
    if (word === "cone") return { t: "cone", distance, angle: CONE_ANGLE, shape: "cone" };
    if (/radius|emanation|burst|sphere|cylinder|spread/.test(word)) {
      // A BURST IS ITS OWN SHAPE (3.609.1, Graham's ruling of 1 October
      // 2026 on the 3.609.0 live test's F7): "a burst with a range is aimed
      // at a point within range; one with no range centres on the caster".
      // Read as an emanation, Tangling Creepers' 300-foot burst was drawn
      // round the druid — and Sunburst, Lightning Storm, Entangle, Sound
      // Burst and Fools Riches with it.
      return { t: "circle", distance, shape: /emanation/.test(word) ? "emanation" : /burst/.test(word) ? "burst" : "radius" };
    }
    return { t: "ray", distance, width: DEFAULT_RAY_WIDTH, shape: "line" };
  };
  const scan = (raw) => {
    const t = String(raw || "").toLowerCase();
    if (!t) return null;
    const dist = (numStr, unit) => {
      let d = Number(numStr);
      if (/mile/.test(unit)) d *= 5280;
      return d;
    };
    // Prefer a distance bound directly to a shape word ("15-foot cone",
    // "30’ radius", "20-ft. radius") so a spell that stashes its area in the
    // Range field ("30 feet Area 15-foot cone") reads the cone's own size, not
    // the range distance.
    const bound = t.match(
      new RegExp(`(\\d+(?:\\.\\d+)?)\\s*[-\\s]?\\s*(${UNIT})\\.?[-\\s.,]*(?:tall\\s+|high\\s+)?${SHAPE}`)
    );
    if (bound) {
      const d = dist(bound[1], bound[2]);
      if (d > 0) return toShape(bound[3], d);
    }
    // Fallback: first distance anywhere + any shape word anywhere.
    const dm = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*[-\\s]?\\s*(${UNIT})`));
    const sm = t.match(new RegExp(SHAPE));
    if (!dm || !sm) return null;
    const d = dist(dm[1], dm[2]);
    return d > 0 ? toShape(sm[1], d) : null;
  };
  return scan(areaText) || scan(rangeText);
}

/** A short human label for a parsed area, e.g. "20 ft radius". */
export function describeArea(config) {
  if (!config) return "";
  const unit = canvas?.dimensions?.units || "ft";
  return `${config.distance} ${unit} ${config.shape}`;
}

/**
 * A spell's Range as a distance in feet, or null when there is no ranged
 * placement (blank, Self, Personal, or Touch — those centre on the caster).
 * @param {string} rangeText
 * @returns {number|null}
 */
export function parseRangeFeet(rangeText) {
  const t = String(rangeText || "").toLowerCase().trim();
  if (!t || /\b(self|personal|touch)\b/.test(t)) return null;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(miles?|foot|feet|ft|’|')/);
  if (!m) return null;
  let d = Number(m[1]);
  if (/mile/.test(m[2])) d *= 5280;
  return d > 0 ? d : null;
}

/** The point on a token's square perimeter in a given direction — where a cone
 *  or line emanates from, so it clears the caster's own square. */
function squareEdgePoint(token, center, angle) {
  const hx = (token?.w ?? canvas.dimensions.size) / 2;
  const hy = (token?.h ?? canvas.dimensions.size) / 2;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const t = 1 / Math.max(Math.abs(ca) / hx, Math.abs(sa) / hy || Number.EPSILON);
  return { x: center.x + ca * t, y: center.y + sa * t };
}

/** A CSS hex colour ("#rrggbb") as a PIXI-friendly 0xRRGGBB number, for the
 *  aiming preview's line/fill colours — PIXI.Graphics wants a number, the
 *  Region document's own `color` field wants the CSS string as-is. */
export function hexToPixiColor(css) {
  const n = Number(String(css ?? "#ff0000").replace("#", "0x"));
  return Number.isFinite(n) ? n : 0xff0000;
}

/**
 * The `shapes` entry for a `Region` document matching a parsed area config,
 * at a given placement — pure, so it's independently testable against the
 * exact field names/conventions confirmed live (see the module docstring):
 * absolute canvas pixel coordinates (`gridBased:false`), `rotation` in
 * degrees using the same 0°=east/clockwise convention the old
 * MeasuredTemplate `direction` field used, and `curvature:"flat"` for a
 * cone so its shape matches this file's own `templateContains` pie-wedge
 * math rather than Foundry's rounded-edge alternatives.
 *
 * @param {{t:"circle"|"cone"|"ray",distance:number,angle?:number,width?:number}} config
 * @param {number} x
 * @param {number} y
 * @param {number} direction  degrees, 0=east, clockwise
 * @param {(feet:number)=>number} feetToPx
 * @returns {object}
 */
export function regionShapeData(config, x, y, direction, feetToPx) {
  if (config.t === "circle") {
    return { type: "circle", hole: false, x, y, radius: feetToPx(config.distance), gridBased: false };
  }
  if (config.t === "cone") {
    return {
      type: "cone", hole: false, x, y, radius: feetToPx(config.distance),
      angle: config.angle ?? CONE_ANGLE, rotation: direction, curvature: "flat", gridBased: false
    };
  }
  return {
    type: "line", hole: false, x, y, length: feetToPx(config.distance),
    width: feetToPx(config.width ?? DEFAULT_RAY_WIDTH), rotation: direction, gridBased: false
  };
}

/** Draws (or redraws) the live aiming preview for a spell area shape onto a
 *  PIXI.Graphics the caller owns, in absolute canvas pixel coordinates. */
function drawAreaPreview(graphics, config, x, y, direction, feetToPx, color) {
  graphics.clear();
  graphics.lineStyle(2, color, 0.85).beginFill(color, 0.25);
  const rad = feetToPx(config.distance);
  if (config.t === "circle") {
    graphics.drawCircle(x, y, rad);
  } else if (config.t === "cone") {
    const half = (((config.angle ?? CONE_ANGLE) * Math.PI) / 180) / 2;
    const dir = (direction * Math.PI) / 180;
    const steps = 24;
    const points = [x, y];
    for (let i = 0; i <= steps; i++) {
      const a = dir - half + (2 * half * i) / steps;
      points.push(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    graphics.drawPolygon(points);
  } else {
    // ray: a rectangle `width` wide, centred on the direction line, running
    // from (x,y) out to `rad`.
    const halfW = feetToPx(config.width ?? DEFAULT_RAY_WIDTH) / 2;
    const dir = (direction * Math.PI) / 180;
    const dx = Math.cos(dir);
    const dy = Math.sin(dir);
    const px = -dy;
    const py = dx;
    graphics.drawPolygon([
      x + px * halfW, y + py * halfW,
      x + dx * rad + px * halfW, y + dy * rad + py * halfW,
      x + dx * rad - px * halfW, y + dy * rad - py * halfW,
      x - px * halfW, y - py * halfW
    ]);
  }
  graphics.endFill();
}

/**
 * Place a spell area for the given config following the spell's placement
 * rules (Chapter 9, per Graham):
 *  - a circle/radius area with NO range (or an emanation) centres on the caster
 *    automatically;
 *  - a circle area WITH a range is placed by the caster, clamped to within range;
 *  - a cone or line always emanates from the edge of the caster's square (aimed
 *    with the cursor) so it never catches the caster.
 * Creates a real `Region` document on the scene (see the module docstring for
 * why — V14 deprecated MeasuredTemplate in favour of this) and resolves to a
 * plain object describing it — `{t, x, y, distance, direction, angle, width}`,
 * the same flat shape this file's `templateContains`/`tokensInTemplate` have
 * always read — or null on cancel / no canvas.
 *
 * @param {object} config  from {@link parseSpellArea}
 * @param {Actor} actor
 * @param {number|null} rangeFeet  from {@link parseRangeFeet}
 * @param {string} [label]  shown as the Region's own name on the canvas
 * @returns {Promise<{t:string,x:number,y:number,distance:number,direction:number,angle?:number,width?:number,regionId:string}|null>}
 */

/* ══════════════════════════════════════════════════════════════════════
 * SAYING THAT IT IS WAITING (3.592.0 — Graham, 25 September 2026)
 *
 * Aiming an area used to be SILENT. `placeSpellTemplate` drew a PIXI
 * preview on the controls layer and then returned a promise that
 * resolved on a canvas mousedown — no dialog, no prompt, no text
 * anywhere. A player reading the cast card that had just posted, or
 * with the cursor off the map, saw a client that had stopped.
 *
 * It is not a hang, and I reported it as one during the 3.591.0 live
 * test before reading this function. That is the fourth time in this
 * project that a waiting interaction has been mistaken for a broken
 * one, and every one of those was a place where the system knew what it
 * was waiting for and did not say.
 *
 * So it says. A banner over the canvas names the spell, the shape being
 * placed, and BOTH ways out — and Escape is now one of them, because
 * right-click was the only exit and nothing announced it.
 * ════════════════════════════════════════════════════════════════════ */

const AIM_BANNER_ID = "trg-spell-aim-banner";

/**
 * Put the instruction on screen, and give back the function that takes
 * it down again.
 *
 * RETURNS ITS OWN REMOVER rather than exposing a hide function, so the
 * banner cannot outlive the aim that owns it: there is exactly one
 * caller and it holds the only handle.
 *
 * @param {string} label what is being placed, e.g. "Fireball Area"
 * @param {object} config the parsed area
 * @param {boolean} anchored whether the caster has a token to anchor to
 * @returns {() => void}
 */
function showAimBanner(label, config, anchored) {
  const doc = globalThis.document;
  if (!doc?.body) return () => {};
  doc.getElementById(AIM_BANNER_ID)?.remove();

  const el = doc.createElement("div");
  el.id = AIM_BANNER_ID;
  el.style.cssText = [
    "position:fixed", "top:12px", "left:50%", "transform:translateX(-50%)",
    "z-index:1000", "pointer-events:none", "max-width:min(560px,90vw)",
    "padding:8px 14px", "border-radius:6px", "text-align:center",
    "background:rgba(20,18,14,0.92)", "border:1px solid #9b8b5a",
    "color:#f0e6d2", "font-size:14px", "line-height:1.45",
    "box-shadow:0 2px 10px rgba(0,0,0,0.5)"
  ].join(";");

  // THE CAST IS NAMED, not "a spell". A GM running four casters wants to
  // know which one the map is waiting on.
  const what = describeArea(config);
  const verb = config?.t === "cone" || config?.t === "ray" ? "Aim" : "Position";
  el.innerHTML =
    `<strong>${verb} ${label}</strong>${what ? ` &mdash; ${what}` : ""}<br>`
    + `<span style="font-size:12px;opacity:0.85">`
    + `Click the map to place it &middot; right-click or <strong>Esc</strong> to cancel`
    + (anchored ? "" : "<br>The caster has no token on this scene, so it is anchored to the centre of the map")
    + "</span>";
  doc.body.appendChild(el);
  return () => { doc.getElementById(AIM_BANNER_ID)?.remove(); };
}

export async function placeSpellTemplate(config, actor, rangeFeet = null, label = "Spell Area") {
  if (!config || !canvas?.ready) return null;

  const token = actor?.getActiveTokens?.()[0] ?? null;
  const center = token
    ? token.center
    : { x: canvas.dimensions.width / 2, y: canvas.dimensions.height / 2 };
  const isDirectional = config.t === "cone" || config.t === "ray";
  const centredOnCaster = !isDirectional && (rangeFeet == null || config.shape === "emanation"
    || (config.shape === "burst" && !(Number(rangeFeet) > 0)));
  const feetToPx = (ft) => (ft / canvas.dimensions.distance) * canvas.dimensions.size;
  const colorCss = game.user.color?.css ?? game.user.color ?? "#ff0000";

  const commit = async (x, y, direction) => {
    const [created] = await canvas.scene.createEmbeddedDocuments("Region", [{
      name: label,
      color: colorCss,
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      shapes: [regionShapeData(config, x, y, direction, feetToPx)]
    }]);
    if (!created) return null;
    return {
      t: config.t, x, y, distance: config.distance, direction,
      angle: config.t === "cone" ? (config.angle ?? CONE_ANGLE) : undefined,
      width: config.t === "ray" ? (config.width ?? DEFAULT_RAY_WIDTH) : undefined,
      regionId: created.id
    };
  };

  // A cone/line starts anchored to the caster's edge (pointing right until aimed).
  let startX = center.x;
  let startY = center.y;
  if (isDirectional && token) {
    const edge = squareEdgePoint(token, center, 0);
    startX = edge.x;
    startY = edge.y;
  }

  // No-range circle / emanation: drop it on the caster, no aiming needed.
  if (centredOnCaster) {
    return commit(startX, startY, 0);
  }

  const preview = new PIXI.Graphics();
  canvas.controls.addChild(preview);
  const previewColor = hexToPixiColor(colorCss);
  drawAreaPreview(preview, config, startX, startY, 0, feetToPx, previewColor);
  const removeBanner = showAimBanner(label, config, Boolean(token));

  return new Promise((resolve) => {
    let committed = false;
    let lastX = startX;
    let lastY = startY;
    let lastDirection = 0;

    const finish = (result) => {
      if (committed) return;
      committed = true;
      canvas.stage.off("mousemove", onMove);
      canvas.stage.off("mousedown", onClick);
      canvas.app.view.oncontextmenu = null;
      // CAPTURE PHASE, MATCHING THE ADD. A listener removed with the
      // wrong phase is not removed at all, and this one swallows Escape.
      globalThis.removeEventListener?.("keydown", onKey, true);
      removeBanner();
      try {
        canvas.controls.removeChild(preview);
        preview.destroy();
      } catch (_e) {
        /* preview already gone */
      }
      resolve(result);
    };

    /*
     * ESCAPE CANCELS, and is taken before anything else sees it.
     *
     * Foundry binds Escape globally — it closes windows and opens the
     * main menu — so an aim that merely listened would be cancelled AND
     * pop the menu over the map. Capture phase plus stopping the event
     * means Escape does one thing while an area is being aimed, and goes
     * back to doing Foundry's thing the moment it is placed.
     */
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    };
    globalThis.addEventListener?.("keydown", onKey, true);

    let moveThrottle = 0;
    const onMove = (event) => {
      event.stopPropagation();
      const now = Date.now();
      if (now - moveThrottle < 20) return;
      moveThrottle = now;
      const point = event.data.getLocalPosition(canvas.stage);
      if (isDirectional) {
        // Aim: apex on the caster's edge, opening toward the cursor.
        const angle = Math.atan2(point.y - center.y, point.x - center.x);
        const edge = squareEdgePoint(token, center, angle);
        lastX = edge.x;
        lastY = edge.y;
        lastDirection = (angle * 180) / Math.PI;
      } else {
        // Ranged circle: snap to grid, then clamp within the spell's range.
        //
        // ONE METRIC FOR EVERY RANGE (3.311.0). This used to clamp on a
        // straight-line PIXEL distance from the caster's centre, while
        // every weapon range and reach in the system measures grid squares
        // from the caster's nearest square with the scene's alternating
        // 5-10-5 diagonal rule. So a 30-foot spell and a 30-foot bow
        // disagreed about the same diagonal — the spell reaching about
        // 42 ft of grid on the diagonal, or refusing a square the bow
        // would allow — and a Large caster's own body was counted against
        // their spell's reach.
        //
        // The distance TEST is now `feetFromPointToToken`, the same one
        // movement provokes use. The clamp itself still travels along the
        // line to the cursor, which is what a player expects a dragged
        // template to do; it is bisected back to the furthest point that
        // passes the test rather than scaled by a ratio from the other
        // metric. Twelve halvings resolve to well under a pixel.
        let p = canvas.grid.getSnappedPoint(point, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
        const inRange = (candidate) => {
          const feet = token ? feetFromPointToToken(candidate, token) : null;
          if (feet === null) {
            // No token to measure from (a caster off-canvas): fall back to
            // the straight line rather than refusing to place anything.
            const rangePx = feetToPx(rangeFeet);
            return rangePx <= 0 || Math.hypot(candidate.x - center.x, candidate.y - center.y) <= rangePx;
          }
          return feet <= rangeFeet;
        };
        if (rangeFeet > 0 && !inRange(p)) {
          let lo = 0;
          let hi = 1;
          const at = (t) => ({
            x: center.x + (p.x - center.x) * t,
            y: center.y + (p.y - center.y) * t
          });
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            if (inRange(at(mid))) lo = mid;
            else hi = mid;
          }
          p = canvas.grid.getSnappedPoint(at(lo), { mode: CONST.GRID_SNAPPING_MODES.CENTER });
          // Snapping can push the point back out by up to half a square.
          if (!inRange(p)) p = at(lo);
        }
        lastX = p.x;
        lastY = p.y;
      }
      drawAreaPreview(preview, config, lastX, lastY, lastDirection, feetToPx, previewColor);
    };

    const onClick = async (event) => {
      if (event.data.originalEvent.button === 2) {
        finish(null);
        return;
      }
      event.stopPropagation();
      const result = await commit(lastX, lastY, lastDirection);
      finish(result);
    };
    const onContext = (event) => {
      event.preventDefault();
      finish(null);
    };

    canvas.stage.on("mousemove", onMove);
    canvas.stage.on("mousedown", onClick);
    canvas.app.view.oncontextmenu = onContext;
  });
}

/**
 * Whether a point falls inside a template, computed straight from the template's
 * own geometry (origin, distance, direction, angle/width) rather than the
 * placeable's `.shape`. A freshly created template's placeable has not drawn yet
 * — its `.shape` is still null — so the shape-based test silently caught nobody;
 * this is timing-independent and works the instant the document exists.
 *
 * @param {{t:string,x:number,y:number,distance:number,direction?:number,angle?:number,width?:number}} tmpl
 * @param {{x:number,y:number}} point
 * @param {{pxPerFt:number}} opts  pixels per foot on the current grid
 * @returns {boolean}
 */
export function templateContains(tmpl, point, { pxPerFt }) {
  // A WALL (3.610.0) is a line or ring placed anywhere; its own rule says
  // what is in its space. See magic/wall-spell.mjs.
  if (tmpl?.t === "wall") return wallContains(tmpl, point, { pxPerFt });
  const reach = Number(tmpl.distance || 0) * pxPerFt;
  const dir = (Number(tmpl.direction || 0) * Math.PI) / 180;
  const dx = point.x - tmpl.x;
  const dy = point.y - tmpl.y;
  const dist = Math.hypot(dx, dy);
  const E = 1e-6;
  if (tmpl.t === "circle") return dist <= reach + E;
  if (tmpl.t === "cone") {
    if (dist <= E) return true;
    if (dist > reach + E) return false;
    const half = ((Number(tmpl.angle || 0) * Math.PI) / 180) / 2;
    let a = Math.atan2(dy, dx) - dir;
    a = Math.atan2(Math.sin(a), Math.cos(a)); // normalise to [-π, π]
    return Math.abs(a) <= half + E;
  }
  if (tmpl.t === "ray") {
    const halfW = (Number(tmpl.width || 0) * pxPerFt) / 2;
    const along = dx * Math.cos(dir) + dy * Math.sin(dir);
    const perp = -dx * Math.sin(dir) + dy * Math.cos(dir);
    return along >= -E && along <= reach + E && Math.abs(perp) <= halfW + E;
  }
  return false;
}

/**
 * Collect the tokens a placed template catches — the plain
 * `{t,x,y,distance,direction,angle,width}` object {@link placeSpellTemplate}
 * resolves to, not a Foundry document (this function never touches one).
 *
 * ANY PART OF A CREATURE'S SPACE IS ENOUGH (3.311.0, Graham's ruling).
 *
 * This used to test `token.center` and nothing else, which is the same
 * defect `distanceBetween` had in a different costume: a Colossal creature
 * standing with twenty of its twenty-five squares inside a Fireball took
 * nothing at all, because the one point at its middle happened to fall
 * outside. A Huge dragon could be half-swallowed by a burst and shrug.
 *
 * Every square the creature occupies is tested and one hit is enough,
 * matching how reach and range now measure from the nearest square. For a
 * Medium token — one square, its centre — this is exactly the old test, so
 * no ordinary spell changes.
 *
 * @param {{t:string,x:number,y:number,distance:number,direction?:number,angle?:number,width?:number}} templateDoc
 * @returns {Token[]}
 */
export function tokensInTemplate(templateDoc) {
  if (!templateDoc || !canvas?.dimensions) return [];
  const pxPerFt = canvas.dimensions.size / canvas.dimensions.distance;
  const grid = canvas.dimensions.size;
  const inside = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    const squares = tokenSquares(token);
    const points = squares.length
      ? squares.map((sq) => ({ x: sq.col * grid + grid / 2, y: sq.row * grid + grid / 2 }))
      : [token.center];
    if (points.some((point) => templateContains(templateDoc, point, { pxPerFt }))) {
      inside.push(token);
    }
  }
  return inside;
}

/**
 * Whether an area spell affects a token, from the spell's targeting mode and the
 * caster's own Foundry Token Disposition (Chapter 9 / Graham's ruling): by
 * default an area affects everyone; a spell that specifically targets "allies"
 * catches only tokens sharing the caster's disposition (the caster included),
 * and one targeting "foes/enemies" catches only tokens of the opposite
 * disposition. Neutral tokens are neither ally nor foe, so a targeted spell
 * skips them.
 *
 * @param {number} tokenDisposition  the token's disposition
 * @param {number} casterDisposition the caster token's disposition
 * @param {"all"|"allies"|"enemies"} mode
 * @returns {boolean}
 */
export function keepByDisposition(tokenDisposition, casterDisposition, mode = "all") {
  if (mode !== "allies" && mode !== "enemies") return true;
  const t = Number(tokenDisposition);
  const c = Number(casterDisposition);
  if (mode === "allies") return t === c;
  return c !== 0 && Math.sign(t) === -Math.sign(c);
}

/**
 * Does this spell BREACH — bypass barriers (page 247's "(B)")?
 *
 * ─────────────────────────────────────────────────────────────────────
 * A NAME BELIEVED INSTEAD OF MEASURED, for the eleventh time.
 *
 * `cast-workflow.mjs` has tested `/\bbreach\b/i` against the spell's
 * TRAITS since line of effect was written. MEASURED against the live
 * pack on 22 September 2026:
 *
 *   spells carrying a "Breach" trait ......... 0
 *   spells carrying "(B)" in range or area ... 7
 *
 * So the breach rule has never once been true. Page 247 says where the
 * mark actually lives, in as many words: "If the area or range has a (B)
 * next to it, the spell is considered to breach and bypasses barriers."
 * It is a NOTATION ON THE RANGE, not a trait — and the code looked for
 * it in the one place the book never puts it.
 *
 * Antipathy, Sympathy, Holy Shout, Apocalypse, Prayer, Consecrate and
 * Deific Presence are the seven, and every one of them has been stopped
 * by walls it should have passed through.
 *
 * THE TRAIT IS STILL ACCEPTED, because a homebrew spell may well be
 * authored that way and honouring both costs nothing.
 *
 * @param {object} spellData a spell's `system`
 * @returns {boolean}
 */
export function spellBreaches(spellData) {
  const marked = `${spellData?.range ?? ""} ${spellData?.area ?? ""} ${spellData?.targets ?? ""}`;
  if (/\(\s*B\s*\)/i.test(marked)) return true;
  return /\bbreach\b/i.test(String(spellData?.traits ?? ""));
}

/**
 * Whether a solid barrier breaks the line of effect between two points (Chapter
 * 9): line of effect is a straight, unblocked path, cancelled by a solid barrier
 * (a wall that blocks movement) but not by fog or darkness. Defensive — returns
 * false (clear) if no wall API is available, so it never over-blocks a cast.
 *
 * @param {{x:number,y:number}} origin
 * @param {{x:number,y:number}} target
 * @returns {boolean} true when a wall blocks the path
 */
export function lineOfEffectBlocked(origin, target) {
  if (!origin || !target) return false;
  try {
    const backend = globalThis.CONFIG?.Canvas?.polygonBackends?.move;
    if (backend?.testCollision) {
      return Boolean(backend.testCollision(origin, target, { mode: "any", type: "move" }));
    }
    const walls = globalThis.canvas?.walls;
    if (walls?.checkCollision) {
      const RayCls = globalThis.foundry?.canvas?.geometry?.Ray ?? globalThis.Ray;
      if (RayCls) return Boolean(walls.checkCollision(new RayCls(origin, target), { type: "move", mode: "any" }));
    }
  } catch (_e) {
    // Any API mismatch → treat as clear rather than silently blocking casts.
  }
  return false;
}
