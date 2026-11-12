#!/usr/bin/env node
/**
 * mutate-teleport-movement — can verify-teleport-movement fail?
 * NEW at 3.680.1.
 *
 * A1 IS THE DEFECT: a teleported leg sampled as a walk, which is how a Blink
 * drag with waypoints was refused as "would move through" a creature on the
 * straight line between its hops. A3 and C1 are the other half of the
 * reading: the square a teleport lands on between hops is not passed
 * through, and the square the whole move ends on is never a landing, so
 * page 198's "cannot end your turn in an occupied space" still holds.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = path.join(SYSTEM_ROOT, "module", "combat", "movement.mjs");
const W = path.join(SYSTEM_ROOT, "module", "combat", "movement-workflow.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const V = path.join(SYSTEM_ROOT, "tools", "verify-teleport-movement.mjs");

const MUTATIONS = [
  { file: M, name: "A1 THE DEFECT: a teleported leg is sampled as a walk", from: "    if (i > 0 && !teleported) {", to: "    if (i > 0) {", breaks: "P2/P4/C2" },
  { file: M, name: "A2 a walked leg is not sampled", from: "    if (i > 0 && !teleported) {", to: "    if (i > 0 && false) {", breaks: "P1/C1" },
  { file: M, name: "A3 the move's end square is a landing too", from: "    push(points[i].x, points[i].y, teleported && i < points.length - 1);", to: "    push(points[i].x, points[i].y, teleported);", breaks: "P3" },
  { file: M, name: "A4 a teleport's hop is not marked a landing", from: "    push(points[i].x, points[i].y, teleported && i < points.length - 1);", to: "    push(points[i].x, points[i].y, false);", breaks: "P2/C2/C4" },
  { file: M, name: "A5 Foundry's table is not read", from: "  if (def && typeof def.teleport === \"boolean\") return def.teleport;\n", to: "", breaks: "T2/T3" },
  { file: M, name: "A6 no fallback without the table", from: "  return [\"blink\", \"displace\"].includes(String(action ?? \"\"));", to: "  return false;", breaks: "T4" },
  { file: M, name: "A7 every action is a teleport", from: "  const def = actions?.[String(action ?? \"\")];", to: "  return true;\n  const def = actions?.[String(action ?? \"\")];", breaks: "T1" },
  { file: M, name: "A8 the grid's size is ignored", from: "  const size = Number(grid) || 100;", to: "  const size = 100;", breaks: "P6" },
  { file: M, name: "A9 a repeated square is listed twice", from: "    if (last && last.col === square.col && last.row === square.row) return;\n", to: "", breaks: "P8" },
  { file: M, name: "C1 a landing is crossed", from: "  return (squares ?? []).slice(0, -1).filter((s) => !s.landing);", to: "  return (squares ?? []).slice(0, -1);", breaks: "C2/C4" },
  { file: M, name: "C2 the end square is crossed", from: "  return (squares ?? []).slice(0, -1).filter((s) => !s.landing);", to: "  return (squares ?? []).filter((s) => !s.landing);", breaks: "C1" },
  { file: W, name: "W1 the workflow keeps its own sampler", from: "    return pathSquaresOf([\n      ...(movement?.passed?.waypoints ?? []),\n      ...(movement?.pending?.waypoints ?? [])\n    ], canvas?.grid?.size ?? 100);", to: "    return [];", breaks: "W1" },
  { file: W, name: "W3 page 198 crosses every square but the last again", from: "  const crossed = crossedSquares(squares);", to: "  const crossed = squares.slice(0, -1);", breaks: "W3" },
  { file: SJ, name: "Z the version is not raised", from: "\"version\": \"3.687.1\"", to: "\"version\": \"3.680.0\"", breaks: "Z" }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([M, W, SJ, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-teleport-movement: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-teleport-movement: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-teleport-movement: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
