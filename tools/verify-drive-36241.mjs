#!/usr/bin/env node
/**
 * verify-drive-36241 — the 3.624.1 drive's observation, 3.624.2.
 *
 * Graham's ruling of 6 October 2026 (R1, "your recommendation") on
 * claude/live-testing-report-3.624.1.md: Resurrection clears the Bleeding
 * the creature died of. A ZZ Fighter killed by a severed leg came back at
 * 1 Hit Point still carrying Bleeding 4 — one bleed tick from Dying again.
 *
 *   A  Bleeding is in the order, first; Dead stays last
 *   B  the applier clears every Bleeding effect and says so
 *   C  the long-term debilitation stays; the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const { DEATH_CONDITIONS_CLEARED, bleedingStoppedLine } = await import("../module/magic/resurrection.mjs");
const { isDead, needsReaping } = await import("../module/combat/death-state.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const code = (...p) => read(...p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/* A — the order */
{
  ok("A1 Bleeding is cleared", DEATH_CONDITIONS_CLEARED.includes("bleeding"));
  ok("A2 ...first, and Dead is still last", DEATH_CONDITIONS_CLEARED[0] === "bleeding" && DEATH_CONDITIONS_CLEARED.at(-1) === "dead");
  // The drive's creature: Dead, Dying 6, Bleeding 4, Death State 5, cleared in
  // the shipped order with the death watch asked after each removal.
  const held = new Map([["dead", 1], ["dying", 6], ["bleeding", 4]]);
  const actor = { system: { combat: { deathState: 5 }, attributes: { constitution: { total: 2 } } }, getConditionValue: (k) => held.get(k) ?? null };
  let reaped = 0;
  for (const gone of DEATH_CONDITIONS_CLEARED) {
    if (!held.has(gone)) continue;
    held.delete(gone);
    if (needsReaping(isDead(actor), held.has("dead"))) { held.set("dead", 1); reaped += 1; }
  }
  ok("A3 THE OBSERVATION, cured: the drive's creature ends alive and not bleeding", held.size === 0 && reaped === 0, JSON.stringify([...held]));
}

/* B — the applier */
{
  const applier = code("module", "magic", "spell-effects.mjs");
  const at = applier.indexOf('case "resurrect": {');
  const body = at < 0 ? "" : applier.slice(at, at + 4500);
  ok("B1 whether it bled is read before anything is cleared",
    body.indexOf('const bled = Boolean(target.hasCondition?.("bleeding"));') > 0
      && body.indexOf('const bled = Boolean(target.hasCondition?.("bleeding"));') < body.indexOf("for (const gone of DEATH_CONDITIONS_CLEARED)"));
  ok("B2 each condition is cleared until none is left (Bleeding may sit on more than one effect)",
    /for \(let tries = 0; tries < 6 && target\.hasCondition\?\.\(gone\); tries \+= 1\) \{\s*await target\.toggleStatusEffect\?\.\(gone, \{ active: false \}\);/.test(body));
  ok("B3 the card says the bleeding stopped, only when it bled",
    /if \(bled\) lines\.push\(line\(bleedingStoppedLine\(target\.name\)\)\);/.test(body));
  ok("B4 the line names the creature and why", /Tebb/.test(bleedingStoppedLine("Tebb")) && /bleeding that killed/.test(bleedingStoppedLine("X")));
}

/* C — what stays */
{
  ok("C2 Injured is not among the conditions cleared", !DEATH_CONDITIONS_CLEARED.includes("injured"));
  const sys = JSON.parse(read("system.json"));
  ok("C3 the version is 3.624.2 or later", String(sys.version).localeCompare("3.624.2", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-drive-36241: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-36241: OK — ${checks} checks. A creature raised from its death stops bleeding from it.`);
