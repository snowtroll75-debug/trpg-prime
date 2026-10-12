#!/usr/bin/env node
/**
 * verify-drive-36240 — the 3.624.0 drive's finding, 3.624.1.
 *
 * Graham's rulings of 6 October 2026 on claude/live-testing-report-3.624.0.md:
 *
 *   R1 "your recommendation": Resurrection clears Dying and Unconscious
 *      before Dead, so the death watch finds a living creature when Dead is
 *      removed. A ZZ Fighter that died by Dying (7 against Death State 5)
 *      was raised to 1 HP and reaped again at once.
 *   R2 "your recommendation": the free Cleric specialist spells are worked
 *      out over every installed aspect. Nothing changes.
 *
 *   A  the real order, run through the real `isDead` the death watch asks
 *   B  the applier uses that order, before the body is restored
 *   C  R2 left as it is; the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const { DEATH_CONDITIONS_CLEARED } = await import("../module/magic/resurrection.mjs");
const { isDead, needsReaping } = await import("../module/combat/death-state.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const code = (...p) => read(...p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/**
 * The drive's creature: Dead, Dying 7, Unconscious, Death State 5. Each
 * condition is removed in the given order; after each removal the death
 * watch asks `isDead` exactly as death-watch-workflow does, and puts Dead
 * back if it answers yes. Returns whether the creature ends Dead.
 */
function raise(order) {
  const held = new Map([["dead", 1], ["dying", 7], ["unconscious", 1]]);
  const actor = {
    system: { combat: { deathState: 5 }, attributes: { constitution: { total: 2 } } },
    getConditionValue: (key) => held.get(key) ?? null
  };
  const reaped = [];
  for (const gone of order) {
    if (!held.has(gone)) continue;
    held.delete(gone);
    const alreadySkulled = held.has("dead");
    if (needsReaping(isDead(actor), alreadySkulled)) {
      held.set("dead", 1);
      reaped.push(gone);
    }
  }
  return { dead: held.has("dead"), reaped };
}

/* A — the order, through the real isDead */
{
  // A SUPERSET SINCE 3.624.2, which clears the death's Bleeding too (first).
  ok("A0 the order clears all three conditions of death", ["dead", "dying", "unconscious"].every((c) => DEATH_CONDITIONS_CLEARED.includes(c)));
  ok("A1 the stand-in creature is dead by Dying before it is raised",
    isDead({ system: { combat: { deathState: 5 }, attributes: { constitution: { total: 2 } } }, getConditionValue: (k) => (k === "dying" ? 7 : null) }));
  const old = raise(["dead", "dying", "unconscious"]);
  ok("A2 THE OLD DEFECT, reproduced: Dead first is reaped again while Dying stands", old.dead && old.reaped.includes("dead"),
    JSON.stringify(old));
  const fixed = raise(DEATH_CONDITIONS_CLEARED);
  ok("A3 THE DEFECT, cured: the shipped order leaves the creature alive", !fixed.dead && fixed.reaped.length === 0, JSON.stringify(fixed));
  ok("A4 Dead is last", DEATH_CONDITIONS_CLEARED.at(-1) === "dead");
}

/* B — the applier */
{
  const applier = code("module", "magic", "spell-effects.mjs");
  const at = applier.indexOf('case "resurrect": {');
  const body = at < 0 ? "" : applier.slice(at, at + 4000);
  ok("B1 the resurrect row clears DEATH_CONDITIONS_CLEARED, in that order",
    /for \(const gone of DEATH_CONDITIONS_CLEARED\) \{\s*for \(let tries = 0; tries < 6 && target\.hasCondition\?\.\(gone\); tries \+= 1\) \{\s*await target\.toggleStatusEffect\?\.\(gone, \{ active: false \}\);/.test(body));
  ok("B2 ...before the body is restored",
    body.indexOf("for (const gone of DEATH_CONDITIONS_CLEARED)") > 0
      && body.indexOf("for (const gone of DEATH_CONDITIONS_CLEARED)") < body.indexOf("await target.update?.(restoredResourceUpdate());"));
  ok("B3 no literal order is left behind", !/\["dead", "dying", "unconscious"\]/.test(applier));
}

/* C — R2, and the version */
{
  const flow = code("module", "aspect-workflow.mjs");
  ok("C1 R2 unchanged: the free list is still worked out over the federated divine-aspects pack",
    /const pack = contentPack\("divine-aspects"\);/.test(flow));
  const sys = JSON.parse(read("system.json"));
  ok("C2 the version is 3.624.1 or later", String(sys.version).localeCompare("3.624.1", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-drive-36240: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-36240: OK — ${checks} checks. A creature raised from Dying stays raised: Dying goes before Dead.`);
