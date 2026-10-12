/**
 * THE WALL SPELLS — a line or a ring put down anywhere in range.
 *
 * NEW at 3.610.0, block 33's R9 (Graham, 1 October 2026: "As recommended").
 * Pure; no Foundry. The placing, the Foundry Walls, the crossing and the
 * turn saves are in magic/wall-spell-workflow.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG. Nine wall spells carried no area, so nothing was ever
 * placed: Wall Of Thorns' hazard row had no Region to live on; Blades, Fire
 * and Light rolled their Basic save once, against whoever the GM had
 * targeted, and never again for crossing or for a turn spent inside; Force,
 * Stone and Ice blocked nothing. The line-shaped area the system already
 * drew always started at the caster, and a wall is put down anywhere in
 * range and turned freely.
 *
 * ONE ROW DESCRIBES A WALL. `kind: "wall"` carries its size, the shapes it
 * may take, how it is snapped, what it blocks, its sections' HP, and the
 * riders the page prints — crossing, a turn spent inside, sight through
 * it, wind. The workflow reads this spec and nothing else.
 *
 * TWO WAYS TO LIE ON THE GRID:
 *   "centre"  a 5-foot strip through square centres — the wall's SPACE is
 *             the row of squares it runs through (Blades, Fire, Light,
 *             Thorns, Wind, Dispelling). A creature is "in the wall" when
 *             its square is.
 *   "border"  along square edges, as Wall Of Stone prints ("position each
 *             5-foot section along the borders between spaces") — the walls
 *             that BLOCK (Force, Stone, Ice). A Foundry Wall along a border
 *             stops movement between squares instead of through a token's
 *             own square.
 *
 * HP IS TRACKED BY HAND (R9). The card and the Region carry each section's
 * DB, Hardness and HP; nothing here attacks a wall.
 */

/** The flag a wall's Region carries, and the flag its Foundry Walls carry. */
export const WALL_FLAG = "wallSpell";

const text = (v) => String(v ?? "").trim();
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** The Foundry sense values, by name, so this file need not see `CONST`. */
const SENSE = Object.freeze({ none: 0, limited: 10, normal: 20 });
const MOVE = Object.freeze({ none: 0, normal: 20 });

/**
 * A `wall` row, warps applied, or null.
 *
 * @param {object} raw the row as authored
 * @param {object} [warpMods] the aggregated warp mods (wallLength, wallRadius, wallHp)
 */
export function normaliseWall(raw, warpMods = {}) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== "wall") return null;
  const lengthFeet = num(raw.length) + Math.max(0, num(warpMods?.wallLength));
  if (!(lengthFeet > 0)) return null;
  const forms = (Array.isArray(raw.forms) && raw.forms.length ? raw.forms : ["line"])
    .map((f) => text(f).toLowerCase()).filter((f) => f === "line" || f === "ring");
  if (!forms.length) return null;
  const ringRadiusFeet = forms.includes("ring")
    ? num(raw.ringRadius) + Math.max(0, num(warpMods?.wallRadius)) : 0;
  if (forms.includes("ring") && !(ringRadiusFeet > 0)) return null;
  const snap = text(raw.snap) === "border" ? "border" : "centre";
  const block = raw.block && typeof raw.block === "object" ? {
    move: MOVE[text(raw.block.move)] ?? MOVE.none,
    sight: SENSE[text(raw.block.sight)] ?? SENSE.none,
    light: SENSE[text(raw.block.light)] ?? SENSE.none,
    sound: SENSE[text(raw.block.sound)] ?? SENSE.none
  } : null;
  const blocks = Boolean(block && (block.move || block.sight || block.light || block.sound));
  const sections = raw.sections && typeof raw.sections === "object" ? {
    sizeFeet: Math.max(0, num(raw.sections.size)),
    db: num(raw.sections.db, 0),
    hardness: Math.max(0, num(raw.sections.hardness)),
    hp: Math.max(0, num(raw.sections.hp)) + Math.max(0, num(warpMods?.wallHp))
  } : null;
  const turn = ["startOfTurn", "endOfTurn"].includes(text(raw.turn)) ? text(raw.turn) : null;
  return {
    label: text(raw.label),
    lengthFeet,
    heightFeet: Math.max(0, num(raw.height)),
    thickness: text(raw.thickness),
    forms,
    ringRadiusFeet,
    snap,
    // A centre wall's space is a 5-foot strip of squares; a border wall's is
    // the line itself, so only what the line cuts through is "in" it.
    stripFeet: snap === "centre" ? 5 : 1,
    block: blocks ? block : null,
    sections,
    crossing: Boolean(raw.crossing),
    stopsOnFumble: Boolean(raw.stopsOnFumble),
    turn,
    screen: Boolean(raw.screen),
    wind: Boolean(raw.wind),
    unobstructed: Boolean(raw.unobstructed)
  };
}

/** The area config the cast workflow places a wall from. */
export function wallAreaConfig(spec, placed = null) {
  if (!spec) return null;
  // A RING IS NAMED AS A RING (3.610.1, G1 of the 3.610.0 drive). The card
  // said "Area: 20 ft wall template placed" for Wall Of Ice's 10-ft ring,
  // because the config is built before the caster has chosen the form.
  if (placed?.form === "ring") return { t: "wall", distance: spec.ringRadiusFeet, shape: "radius ring" };
  return { t: "wall", distance: spec.lengthFeet, shape: "wall" };
}

/* ---------------------------------------------------------------- *
 * Geometry.
 * ---------------------------------------------------------------- */

/** Snap a point to a square centre or a square corner. */
export function snapPoint(point, gridPx, snap = "centre") {
  const g = Number(gridPx) || 1;
  if (snap === "border") {
    return { x: Math.round(point.x / g) * g, y: Math.round(point.y / g) * g };
  }
  return { x: Math.floor(point.x / g) * g + g / 2, y: Math.floor(point.y / g) * g + g / 2 };
}

/**
 * Where the far end of a line wall falls: toward the cursor, no longer than
 * the wall may be and no shorter than one square. A wall "up to 20 feet
 * long" may be shorter; it may not be longer.
 */
export function wallEnd(start, cursor, maxPx, minPx) {
  const dx = Number(cursor.x) - Number(start.x);
  const dy = Number(cursor.y) - Number(start.y);
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: Number(start.x) + Number(minPx), y: Number(start.y) };
  const len = Math.max(Number(minPx), Math.min(Number(maxPx), d));
  return { x: Number(start.x) + (dx / d) * len, y: Number(start.y) + (dy / d) * len };
}

/** Distance from a point to a segment, in the same units as the inputs. */
function pointSegmentDistance(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/**
 * Is this point inside the wall's space?
 *
 * @param {object} tmpl the placed wall ({form, x0, y0, x1, y1} or {form, x, y, radius}, widthFeet)
 * @param {{x:number,y:number}} point
 * @param {{pxPerFt:number}} scale
 */
export function wallContains(tmpl, point, { pxPerFt }) {
  if (!tmpl || tmpl.t !== "wall") return false;
  const half = (num(tmpl.widthFeet, 5) * Number(pxPerFt)) / 2;
  const E = 1e-6;
  if (tmpl.form === "ring") {
    const d = Math.hypot(point.x - tmpl.x, point.y - tmpl.y);
    return Math.abs(d - num(tmpl.radius)) <= half + E;
  }
  return pointSegmentDistance(point, { x: tmpl.x0, y: tmpl.y0 }, { x: tmpl.x1, y: tmpl.y1 }) <= half + E;
}

/**
 * The Foundry Wall segments for a placed wall: one for a line, a closed
 * polygon of `sides` segments for a ring.
 *
 * @returns {Array<[number, number, number, number]>}
 */
export function wallSegments(tmpl, sides = 24) {
  if (!tmpl) return [];
  if (tmpl.form === "ring") {
    const r = num(tmpl.radius);
    const pts = Array.from({ length: sides }, (_, i) => {
      const a = (2 * Math.PI * i) / sides;
      return [Math.round(tmpl.x + r * Math.cos(a)), Math.round(tmpl.y + r * Math.sin(a))];
    });
    return pts.map((p, i) => [...p, ...pts[(i + 1) % sides]]);
  }
  return [[Math.round(tmpl.x0), Math.round(tmpl.y0), Math.round(tmpl.x1), Math.round(tmpl.y1)]];
}

/** The Region shapes for a placed wall (a ring is a circle with a hole). */
export function wallRegionShapes(tmpl, pxPerFt) {
  const half = (num(tmpl.widthFeet, 5) * Number(pxPerFt)) / 2;
  if (tmpl.form === "ring") {
    const r = num(tmpl.radius);
    return [
      { type: "circle", hole: false, x: tmpl.x, y: tmpl.y, radius: r + half, gridBased: false },
      { type: "circle", hole: true, x: tmpl.x, y: tmpl.y, radius: Math.max(1, r - half), gridBased: false }
    ];
  }
  const length = Math.hypot(tmpl.x1 - tmpl.x0, tmpl.y1 - tmpl.y0);
  const rotation = (Math.atan2(tmpl.y1 - tmpl.y0, tmpl.x1 - tmpl.x0) * 180) / Math.PI;
  return [{
    type: "line", hole: false, x: tmpl.x0, y: tmpl.y0, length,
    width: Math.max(2, half * 2), rotation, gridBased: false
  }];
}

/** Points every `step` pixels from a to b, a and b included. */
export function segmentSamples(a, b, step) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / Math.max(1, Number(step) || 1)));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

/**
 * Did a move PASS INTO the wall? It did if it started outside and any later
 * point along its path is inside. A creature that started inside and walks
 * out is leaving, which the turn save already charges for.
 *
 * @param {Array<{x:number,y:number}>} path the move's points, origin first
 * @param {(p:{x:number,y:number}) => boolean} inside
 * @param {number} step sampling step in pixels
 * @returns {{entered: boolean, lastOutside: {x:number,y:number}|null}}
 */
export function pathEntersWall(path, inside, step) {
  if (!Array.isArray(path) || path.length < 2) return { entered: false, lastOutside: null };
  if (inside(path[0])) return { entered: false, lastOutside: null };
  let lastOutside = path[0];
  for (let i = 1; i < path.length; i += 1) {
    const samples = segmentSamples(path[i - 1], path[i], step).slice(1);
    for (const p of samples) {
      if (inside(p)) return { entered: true, lastOutside };
      lastOutside = p;
    }
  }
  return { entered: false, lastOutside: null };
}

/* ---------------------------------------------------------------- *
 * The card.
 * ---------------------------------------------------------------- */

/** What the wall is, in one sentence. */
export function wallRaisedLine(spec, tmpl, spellName) {
  const shape = tmpl?.form === "ring"
    ? `a ring of radius <strong>${spec.ringRadiusFeet} ft</strong>`
    : `a wall <strong>${Math.round(num(tmpl?.lengthFeet, spec.lengthFeet))} ft</strong> long`;
  const tall = spec.heightFeet ? `, ${spec.heightFeet} ft high` : "";
  // "(no discernible thickness thick)" was Wall Of Force's card at 3.610.0
  // (G1 of the drive): a printed thickness that already says "thick" is
  // shown as printed.
  const thick = spec.thickness
    ? ` (${/thick/i.test(spec.thickness) ? spec.thickness : `${spec.thickness} thick`})`
    : "";
  return `<strong>${spellName}</strong> rises: ${shape}${tall}${thick}.`;
}

/** Each section's numbers, tracked by hand (Graham's R9). */
export function wallSectionLine(spec) {
  const s = spec?.sections;
  if (!s || !(s.hp > 0)) return "";
  const per = s.sizeFeet > 0 ? `Each ${s.sizeFeet}-foot section` : "The wall";
  return `${per}: DB ${s.db}, Hardness ${s.hardness}, <strong>${s.hp} HP</strong> — tracked by hand.`;
}

/** What it blocks, as Foundry now enforces it. */
export function wallBlocksLine(spec) {
  const b = spec?.block;
  if (!b) return "";
  const what = [];
  if (b.move) what.push("movement");
  if (b.sight === SENSE.normal) what.push("sight");
  else if (b.sight === SENSE.limited) what.push("sight (partly)");
  if (b.light) what.push("light");
  if (b.sound) what.push("sound");
  return what.length ? `It blocks <strong>${what.join(", ")}</strong> on the map.` : "";
}

/** What the riders do, said once at the cast. */
export function wallRiderLines(spec, dc, formula, type) {
  const out = [];
  const dmg = formula ? `<strong>${formula} ${type}</strong>` : "its damage";
  if (spec.crossing) {
    out.push(`A creature that moves into the wall takes ${dmg} (Basic Reflex, DC ${dc})`
      + `${spec.stopsOnFumble ? "; on a Fumble its movement ends beside the wall" : ""}.`);
  }
  if (spec.turn === "endOfTurn") out.push(`A creature that ends its turn in the wall takes ${dmg} (Basic Reflex, DC ${dc}).`);
  if (spec.turn === "startOfTurn") out.push(`A creature in the wall at the start of its turn takes ${dmg} (Basic Reflex, DC ${dc}).`);
  if (spec.screen) out.push("Creatures on either side are <strong>concealed</strong> from each other through it.");
  if (spec.wind) out.push("Arrows, bolts and sling bullets cannot pass it; a thrown weapon through it takes −2.");
  return out;
}

/** The spell fails: something was in the way. */
export function wallObstructedLine(spellName, names) {
  return `<strong>${spellName} dissipates</strong> — it must form in open space, and `
    + `${names.join(", ")} ${names.length === 1 ? "stands" : "stand"} in its path.`;
}
