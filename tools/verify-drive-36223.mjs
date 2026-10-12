#!/usr/bin/env node
/**
 * verify-drive-36223 — the 3.622.3 drive's observation, 3.622.4.
 *
 * Graham's ruling of 6 October 2026 (R1, "your recommendation") on
 * claude/live-testing-report-3.622.3.md: one cast raises the light by one
 * step at a point, however many of its circles overlap there. Fairy Fire
 * on two creatures standing together read +2 for both.
 *
 *   A  circles of one cast count once; different spells still stack
 *   B  the reading is unchanged where nothing overlaps
 *   C  the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const { regionLightShifts } = await import("../module/light-workflow.mjs");
const { shiftLightLevel } = await import("../module/light.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const region = (castId, steps = 1, extra = {}) => {
  const flags = { lightShift: { steps, floor: 1, cap: 8, ...extra }, ...(castId ? { castId } : {}) };
  return { getFlag: (scope, key) => (scope === "trg-prime" ? flags[key] : undefined) };
};
const plain = () => ({ getFlag: () => undefined });
const level = (base, shifts) => shifts.reduce((l, s) => shiftLightLevel(l, s.steps, s.floor, s.cap), base);

/* A — one cast, one shift */
{
  const both = regionLightShifts([region("fairy"), region("fairy")]);
  ok("A1 THE OLD DEFECT, cured: two circles of one Fairy Fire count once",
    both.length === 1 && level(6, both) === 7, JSON.stringify(both));
  const two = regionLightShifts([region("fairy"), region("halo"), region("fairy")]);
  ok("A2 two different spells still stack", two.length === 2 && level(5, two) === 7, JSON.stringify(two));
  const dark = regionLightShifts([region("globe1", -2), region("globe2", -2)]);
  ok("A3 two globes of Darkness, two casts, both apply", dark.length === 2);
  const hand = regionLightShifts([region(null), region(null)]);
  ok("A4 a circle with no cast id is its own", hand.length === 2);
}

/* B — nothing else changes */
{
  ok("B1 a Region with no shift is passed over, and a zero shift drops out",
    regionLightShifts([plain(), region("x", 0)]).length === 0 && regionLightShifts([plain(), region("y")]).length === 1);
  ok("B2 the shift's floor and cap travel through",
    JSON.stringify(regionLightShifts([region("z", -3, { floor: 2, cap: 7 })])) === JSON.stringify([{ steps: -3, floor: 2, cap: 7 }]));
}

/* C — the version */
{
  const sys = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8"));
  ok("C1 the version is 3.622.4 or later", String(sys.version).localeCompare("3.622.4", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-drive-36223: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-36223: OK — ${checks} checks. One cast raises the light one step at a point; different spells still stack.`);
