#!/usr/bin/env node
/**
 * verify-fixes-3670-1 — TRG Prime 3.670.1: what the live test of 3.670.0
 * with Inner Tempest 0.7.0 found (25 October 2026), fixed with Graham's
 * leave the same day.
 *
 *   A  a move's reach path starts where the move started: a Stride straight
 *      away from an adjacent enemy provokes (Foundry 14's passed waypoints
 *      leave out the origin)
 *   B  another check's result met again is not asked for the skill's
 *      training: Drunken Strike's Feint by an untrained Disciple
 *   C  a waived trade-off is named as waived on the card (Monkey Stance's
 *      1-AP jump read "(+2 DC)" under a +0 total)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

/* A — the reach path starts at the origin */
{
  const saved = globalThis.canvas;
  // A square grid of 5-foot squares: a diagonal counts as one square (as the
  // core's own reach does for adjacency).
  globalThis.canvas = { grid: { size: 100, measurePath: (pts) => ({ distance: Math.max(Math.abs(pts[1].x - pts[0].x), Math.abs(pts[1].y - pts[0].y)) / 100 * 5 }) } };
  try {
    const opp = await imp("combat/opportunity.mjs");
    const rules = await imp("combat/opportunity-rules.mjs");
    const mover = { w: 100, h: 100 };
    // The live case: from (10,5) beside an enemy at (11,6), two squares west.
    const live = { origin: { x: 1000, y: 500 }, passed: { waypoints: [{ x: 900, y: 500 }, { x: 800, y: 500 }] }, pending: { waypoints: [] } };
    const centres = opp.pathSquareCentres(mover, live);
    equal("A1 the path starts at the origin (Foundry 14 leaves it out of the passed waypoints)", centres.map((p) => [p.x, p.y]), [[1050, 550], [950, 550], [850, 550]]);
    const enemy = { x: 1100, y: 600, w: 100, h: 100, document: { x: 1100, y: 600, width: 1, height: 1 } };
    const departed = centres.slice(0, -1).map((p) => opp.feetFromPointToToken(p, enemy));
    equal("A2 …so the square left beside the enemy is among those departed (5 feet away), and the move provokes; without it, it did not", [departed, rules.movementProvokes(departed, 5), rules.movementProvokes(departed.slice(1), 5)], [[5, 10], true, false]);
    const without = { passed: live.passed, pending: live.pending };
    equal("A3 without an origin (an older Foundry), the path is the waypoints as before", opp.pathSquareCentres(mover, without).map((p) => [p.x, p.y]), [[950, 550], [850, 550]]);
    const repeated = { origin: { x: 1000, y: 500 }, passed: { waypoints: [{ x: 1000, y: 500 }, { x: 800, y: 500 }] } };
    equal("A4 an origin already first is not counted twice", opp.pathSquareCentres(mover, repeated).map((p) => [p.x, p.y]), [[1050, 550], [850, 550]]);
    const bad = { origin: { x: NaN, y: 500 }, passed: { waypoints: [{ x: 900, y: 500 }, { x: 800, y: 500 }] } };
    equal("A5 an origin that is not a point is left out", opp.pathSquareCentres(mover, bad).length, 2);
  } finally { globalThis.canvas = saved; }
  ok("A6 the same path serves Swift Pursuit (its distance before the move is measured from where it started)",
    /const centres = pathSquareCentres\(moverToken, movement\);[\s\S]{0,900}distanceBefore: feetFromPointToToken\(centres\[0\], token\)/.test(read("module", "combat", "swift-pursuit.mjs")));
}

/* B — a preset result is not asked for training */
{
  const acw = read("module", "combat", "action-workflow.mjs");
  ok("B1 the training gate is skipped when another check's dice and modifiers stand as this one's",
    /const presetResult = Boolean\(presetDice\) && Array\.isArray\(presetModifiers\);\n\s*const exempt = presetResult \|\| Array\.from\(actor\.items \?\? \[\]\)/.test(acw)
    && /if \(!exempt && \(!skillKey \|\| !isSkillTrained\(actor, skillKey\)\)\) \{/.test(acw));
  ok("B2 …and only then: presetDice alone (Spirit Roar's shared Demoralise) still asks", !/const presetResult = Boolean\(presetDice\);/.test(acw) && /Array\.isArray\(presetModifiers\)/.test(acw.slice(acw.indexOf("const presetResult"), acw.indexOf("const presetResult") + 120)));
}

/* C — a waived trade-off says so */
{
  const dt = await imp("difficulty-tradeoffs.mjs");
  const waived = dt.resolveTradeoffs("highJump", { forOneAp: 1 }, { waivers: { forOneAp: { dc: 0 } } });
  const paid = dt.resolveTradeoffs("highJump", { forOneAp: 1 });
  equal("C1 the waived 1-AP jump reads \"(waived)\" and adds nothing; unwaived it reads +2 DC", [waived.dcIncrease, waived.chosen[0]?.description, paid.dcIncrease, paid.chosen[0]?.description],
    [0, "Jump for 1 AP instead of 2 (waived)", 2, "Jump for 1 AP instead of 2 (+2 DC)"]);
  equal("C2 the printed price stands when nothing is waived, and a free unit is taken off what the card says was paid",
    [dt.describeTradeoff({ key: "x", label: "X", dc: 2, effect: {} }, 1), dt.describeTradeoff({ key: "x", label: "X", dc: 2, effect: {} }, 3, { paidDC: 4 }), dt.describeTradeoff({ key: "x", label: "X", dc: 0, effect: {} }, 1, { paidDC: 0 })],
    ["X (+2 DC)", "X (+4 DC)", "X (+0 DC)"]);
}

// 3.670.1 OR LATER (re-anchored 3.671.0): a later release keeps these fixes.
{
  const [ma, mi, pa] = String(JSON.parse(read("system.json")).version).split(".").map(Number);
  ok("Z0 the system is 3.670.1 or later", ma > 3 || (ma === 3 && (mi > 670 || (mi === 670 && pa >= 1))));
}

const EXPECTED = 12;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-fixes-3670-1: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-fixes-3670-1: ${checks} checks — all green.`);
