#!/usr/bin/env node
/**
 * verify-derivation-integrity — `this` in a module-level function, and
 * what it costs. NEW at 3.552.1.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE INCIDENT THIS EXISTS FOR.
 *
 * `module/documents/actor.mjs` line 1504, shipped in 3.547.0 and found
 * live on 10 September 2026:
 *
 *     system.magic.casterStyle = resolveCasterStyle(
 *       system.progression?.casterStyle ?? "", Array.from(this.items ?? []));
 *
 * `prepareCombat(system, actor)` is a MODULE-LEVEL FUNCTION. In an ES
 * module `this` is `undefined`, so `this.items` throws — and the `?? []`
 * beside it guards nothing at all, because reading `.items` off
 * `undefined` is what throws, before the `??` is ever evaluated. It read
 * as defensive and was inert.
 *
 * The cost was not one wrong number. It threw in the MIDDLE of
 * prepareDerivedData, so for every actor in the world:
 *
 *   - 39 "Failed data preparation for Actor.<id>" errors at world load;
 *   - caster style and memorisation style null on every caster;
 *   - EVERY SKILL TOTAL 0 — prepareSkills runs after prepareCombat and
 *     never ran at all;
 *   - no granted traits, no creature type, no tidied text lists;
 *   - and, at 3.552.0, no starting wealth — the new feature could not
 *     work, and looked broken, because the cycle died three steps before
 *     it.
 *
 * Nothing said so. Foundry's `_safePrepareData` catches the throw, logs
 * it, and carries on with a half-derived actor, so the sheets rendered
 * and the numbers were quietly wrong for five releases.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS PINS.
 *
 *   A. No module-level function in a document file uses `this` in code.
 *      That is the whole bug class, not the one instance.
 *   B. The derivation cycle's own order, and that nothing between its
 *      first step and its last is unreachable.
 *
 * It is a SOURCE check, and it says so. `actor.mjs` extends `Actor` at
 * module scope and cannot be imported outside Foundry, so the honest
 * options are reading it or not checking it at all.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");

/** Comments out, so prose about "this system" is not a finding. */
function stripComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

/**
 * Every top-level `function` in a file, with the lines it spans.
 *
 * Top level is decided by column: a declaration at column 0 is outside
 * every class body in this codebase's style, and its body ends at the
 * next line that is exactly `}`. Crude, and right for these files —
 * which is why the count of functions found is itself asserted below,
 * so a reformat that defeats the scan fails rather than passing empty.
 */
function topLevelFunctions(text) {
  const lines = text.split("\n");
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(lines[i]);
    if (!match) continue;
    let end = lines.length - 1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j] === "}") { end = j; break; }
    }
    found.push({ name: match[1], start: i, end, body: lines.slice(i, end + 1) });
  }
  return found;
}

/* ================================================================== *
 * A. THE BUG CLASS
 * ================================================================== */
const DOCUMENT_FILES = [
  ["module", "documents", "actor.mjs"],
  ["module", "documents", "item.mjs"],
  ["module", "documents", "combat.mjs"],
  ["module", "documents", "combatant.mjs"]
];

{
  let scanned = 0;
  const offenders = [];
  for (const parts of DOCUMENT_FILES) {
    const file = path.join(SYSTEM_ROOT, ...parts);
    if (!fs.existsSync(file)) continue;
    const source = stripComments(fs.readFileSync(file, "utf8"));
    const functions = topLevelFunctions(source);
    scanned += functions.length;
    for (const fn of functions) {
      fn.body.forEach((line, offset) => {
        // `this` inside a nested class expression or object method would
        // be a false positive; none exist in these files, and the count
        // assertion below is what notices if that changes.
        if (/(^|[^.\w$])this\s*[.[]/.test(line)) {
          offenders.push(`${parts.join("/")}:${fn.start + offset + 1} in ${fn.name}(): ${line.trim()}`);
        }
      });
    }
  }

  ok("A1 the scan actually found the module-level functions to scan", scanned >= 15,
    `found ${scanned}`);
  eq("A2 none of them uses `this` — it is undefined in a module, and reading off it throws",
    offenders, []);
}

/* ================================================================== *
 * B. `?? []` DOES NOT GUARD A `this`
 *
 * The specific shape that made the bug invisible in review: it LOOKS
 * defensive. Asked separately so a future `this.items ?? []` is named
 * for what it is rather than counted twice as an ordinary `this`.
 * ================================================================== */
{
  const actor = stripComments(read("module", "documents", "actor.mjs"));
  ok("B1 the caster-style read takes the actor it was handed",
    /Array\.from\(actor\?\.items \?\? \[\]\)\);/.test(actor),
    "prepareCombat is a module function; `this.items` threw for five releases");
  ok("B2 and nothing in the file pretends `this.x ?? y` is a guard",
    !/(^|[^.\w$])this\s*\.\s*\w+\s*\?\?/.test(actor.replace(/class TRGActor[\s\S]*/, "")),
    "reading a property off undefined throws before the ?? is reached");
}

/* ================================================================== *
 * C. THE CYCLE ITSELF
 *
 * The cost of the bug was not the wrong value, it was the STEPS AFTER
 * IT never running. So the order is pinned: each of these must appear,
 * once, in this sequence, inside prepareDerivedData.
 * ================================================================== */
{
  const actor = stripComments(read("module", "documents", "actor.mjs"));
  const start = actor.indexOf("prepareDerivedData() {");
  const cycle = actor.slice(start);
  ok("C1 prepareDerivedData exists to read", start > -1);

  const STEPS = [
    "prepareIdentity(system, this)",
    "prepareClassProgression(system, this)",
    "prepareConditions(system, this)",
    "prepareAttributes(system, this)",
    "prepareResources(system, this)",
    "prepareArmourCheckPenalty(system, this)",
    "prepareCombat(system, this)",
    "prepareArmourProtection(system, this)",
    "prepareSkills(system, this)",
    // 3.576.0: and the actor's type, so the Saddlebags know whether the
    // wearer is an animal.
    "prepareEncumbrance(system, this.items, this.type)",
    "prepareGrantedTraits(system, this)",
    // 3.619.0: through startingWealthFor, which keeps the Chapter 6 score
    // and adds Chapter 12's table above 1st level (block 38's R5).
    "system.wealth = startingWealthFor(this)",
    "prepareTextLists(system)"
  ];

  let previous = -1;
  let inOrder = true;
  const missing = [];
  for (const step of STEPS) {
    const at = cycle.indexOf(step);
    if (at === -1) { missing.push(step); continue; }
    if (at < previous) inOrder = false;
    previous = at;
  }
  eq("C2 every step of the derivation cycle is present", missing, []);
  ok("C3 and they run in the order each one's inputs require", inOrder);

  // The two that the incident proved are load-bearing, named on their
  // own: skills come after combat (so a throw in combat costs every
  // skill total), and wealth comes after attributes (so Charisma is the
  // resolved total).
  ok("C4 skills derive after combat",
    cycle.indexOf("prepareSkills(system, this)") > cycle.indexOf("prepareCombat(system, this)"),
    "a throw in prepareCombat left every skill total at 0");
  ok("C5 wealth derives after attributes",
    cycle.indexOf("system.wealth = startingWealthFor(this)") > cycle.indexOf("prepareAttributes(system, this)"),
    "Charisma's contribution is the resolved total");
}

console.log(`verify-derivation-integrity: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-derivation-integrity: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-derivation-integrity: all pass");
