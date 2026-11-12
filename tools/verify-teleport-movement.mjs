#!/usr/bin/env node
/**
 * verify-teleport-movement — a teleport lands; it does not walk.
 *
 * NEW at 3.680.1 (Graham, 2 November 2026: "Yes please fix the teleportation
 * movement", after the Eldritch Arts 0.5.0 live test).
 *
 * FOUND LIVE, ON A THROWAWAY SCENE. Page 198's space rules sampled every leg
 * of a proposed path square by square, as a walk. A teleport made in one hop
 * (Gale Step's update, the core's own displacements) has one waypoint, so it
 * was never sampled and went over a creature freely. A Blink drag with
 * waypoints had two or more, and each leg between them was sampled as if
 * walked:
 *
 *   "ZZ EA Probe would move through ZZ EA Blocker's space — an unwilling
 *    creature's space — Tumble (Acrobatics) first."
 *
 * for a hostile creature standing on the straight line between two hops.
 * A teleport does not pass through the squares between where it leaves and
 * where it lands. What still holds, of any move: "you cannot end your turn in
 * a space already occupied by another creature" (page 198), asked of the
 * square the whole move ends on.
 *
 *   T  which Foundry actions are teleports (Foundry's own table)
 *   P  the squares a path touches: walked legs sampled, teleported not
 *   C  the squares it moves through: a teleport's landings left out
 *   W  the wiring: page 198's hook reads both, the end square still first
 *   Z  the version
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { isTeleportAction, pathSquaresOf, crossedSquares } from "../module/combat/movement.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* Foundry V14's own table, as read live from CONFIG.Token.movement.actions. */
const ACTIONS = {
  walk: { teleport: false }, fly: { teleport: false }, swim: { teleport: false }, burrow: { teleport: false },
  crawl: { teleport: false }, climb: { teleport: false }, jump: { teleport: false },
  blink: { teleport: true, measure: true, walls: "move" }, displace: { teleport: true, measure: false, walls: null }
};
const sq = (col, row, landing = false) => (landing ? { col, row, landing: true } : { col, row });

/* T — which actions are teleports */
equal("T1 Foundry's table: blink and displace teleport; walk, fly, swim, burrow, crawl, climb and jump do not",
  Object.keys(ACTIONS).filter((a) => isTeleportAction(a, ACTIONS)), ["blink", "displace"]);
ok("T2 a module's own action Foundry marks as a teleport is one", isTeleportAction("phase", { ...ACTIONS, phase: { teleport: true } }));
ok("T3 …and one it marks as not is not, whatever its name", !isTeleportAction("blink", { blink: { teleport: false } }));
equal("T4 with no table (this harness, a bare client), blink and displace by name", ["walk", "blink", "displace", "jump", undefined].map((a) => isTeleportAction(a, null)), [false, true, true, false, false]);

/* P — the squares a path touches */
equal("P1 a walked leg is sampled square by square (page 198's creature in the middle)",
  pathSquaresOf([{ x: 200, y: 300 }, { x: 500, y: 300 }], 100, ACTIONS), [sq(2, 3), sq(3, 3), sq(4, 3), sq(5, 3)]);
equal("P2 a Blink with two hops is not: its first hop's square is a landing, its last the end",
  pathSquaresOf([{ x: 200, y: 300, action: "blink" }, { x: 500, y: 300, action: "blink" }], 100, ACTIONS), [sq(2, 3, true), sq(5, 3)]);
equal("P3 a one-hop teleport (Gale Step's update, the core's displacements) is its end square, not a landing",
  pathSquaresOf([{ x: 500, y: 200, action: "displace" }], 100, ACTIONS), [sq(5, 2)]);
equal("P4 a walk, then a Blink: the walk sampled, the Blink not",
  pathSquaresOf([{ x: 0, y: 0, action: "walk" }, { x: 200, y: 0, action: "walk" }, { x: 600, y: 0, action: "blink" }], 100, ACTIONS), [sq(0, 0), sq(1, 0), sq(2, 0), sq(6, 0)]);
equal("P5 a Blink, then a walk from where it landed: the landing marked, the walk sampled",
  pathSquaresOf([{ x: 300, y: 0, action: "blink" }, { x: 600, y: 0, action: "walk" }], 100, ACTIONS), [sq(3, 0, true), sq(4, 0), sq(5, 0), sq(6, 0)]);
equal("P6 the grid's own size is used", pathSquaresOf([{ x: 0, y: 0 }, { x: 150, y: 0 }], 50, ACTIONS), [sq(0, 0), sq(1, 0), sq(2, 0), sq(3, 0)]);
equal("P7 nothing measurable is nothing", [pathSquaresOf([], 100, ACTIONS), pathSquaresOf([{ x: "a", y: 1 }], 100, ACTIONS), pathSquaresOf(undefined, 100, ACTIONS)], [[], [], []]);
equal("P8 a square repeated is listed once", pathSquaresOf([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 100, y: 0 }], 100, ACTIONS), [sq(0, 0), sq(1, 0)]);

/* C — the squares it moves through */
equal("C1 a walk moves through its middle squares, not its end",
  crossedSquares(pathSquaresOf([{ x: 200, y: 300 }, { x: 500, y: 300 }], 100, ACTIONS)), [sq(2, 3), sq(3, 3), sq(4, 3)]);
equal("C2 a two-hop Blink moves through nothing", crossedSquares(pathSquaresOf([{ x: 200, y: 300, action: "blink" }, { x: 500, y: 300, action: "blink" }], 100, ACTIONS)), []);
equal("C3 a one-hop teleport moves through nothing", crossedSquares(pathSquaresOf([{ x: 500, y: 200, action: "displace" }], 100, ACTIONS)), []);
equal("C4 a walk after a Blink moves through the walk's squares, not the landing",
  crossedSquares(pathSquaresOf([{ x: 300, y: 0, action: "blink" }, { x: 600, y: 0, action: "walk" }], 100, ACTIONS)), [sq(4, 0), sq(5, 0)]);
equal("C5 a Blink after a walk: the walk's squares are crossed, where it blinked from too", crossedSquares(pathSquaresOf([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 600, y: 0, action: "blink" }], 100, ACTIONS)), [sq(0, 0), sq(1, 0), sq(2, 0)]);
equal("C6 nothing is nothing", [crossedSquares([]), crossedSquares(undefined)], [[], []]);

/* W — the wiring */
const w = read("module", "combat", "movement-workflow.mjs");
const bodyFrom = (sig) => { const i = w.indexOf(sig); return i === -1 ? "" : w.slice(i, w.indexOf("\n}\n", i)); };
const paths = bodyFrom("function pathSquares(movement) {");
ok("W1 page 198's path is pathSquaresOf, over the passed and pending waypoints, at the scene's grid",
  /pathSquaresOf\(\[\s*\.\.\.\(movement\?\.passed\?\.waypoints \?\? \[\]\),\s*\.\.\.\(movement\?\.pending\?\.waypoints \?\? \[\]\)\s*\], canvas\?\.grid\?\.size \?\? 100\)/.test(paths));
ok("W2 …and no second sampler is left in the workflow", !/SAMPLED ALONG EACH LEG/.test(w) && !/for \(let s = 1; s < steps; s\+\+\)/.test(w));
const space = bodyFrom("function spaceRules(tokenDocument, movement) {");
ok("W3 the squares it passes through are crossedSquares", /const crossed = crossedSquares\(squares\);/.test(space));
ok("W4 the square the move ends on is still asked first, of a teleport too",
  space.indexOf("const finalSquare = squares.at(-1);") > -1 && space.indexOf("mayEndInSquare(") > space.indexOf("const finalSquare = squares.at(-1);") && space.indexOf("mayEndInSquare(") < space.indexOf("crossedSquares(squares)"));
ok("W5 the surcharge counts only the squares crossed", /const crossedKeys = new Set\(crossed\.map/.test(space));
ok("W6 both are imported from movement.mjs", /pathSquaresOf,\s*crossedSquares\s*\} from "\.\/movement\.mjs";/.test(w));

/* Z — the version */
const manifest = JSON.parse(read("system.json"));
{
  // 3.680.1 OR LATER (3.681.0): the reading stands in the releases after it.
  const [za, zb, zc] = String(manifest.version).split(".").map(Number);
  ok("Z the system is 3.680.1 or later", za > 3 || (za === 3 && (zb > 680 || (zb === 680 && zc >= 1))), manifest.version);
}

if (failures.length) {
  process.stderr.write(`verify-teleport-movement: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-teleport-movement: OK — ${checks} checks. A teleport lands where it lands; it does not walk the squares between.\n`);
