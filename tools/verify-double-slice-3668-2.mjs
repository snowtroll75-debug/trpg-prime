#!/usr/bin/env node
/**
 * verify-double-slice-3668-2 — TRG Prime 3.668.2: Double Slice's pair rules,
 * acted on before the damage (Graham, 23 October 2026: "Yes please fix Double
 * Slice"; both problems found in the Inner Tempest 0.5.1 live test).
 *
 *   A  the Strike's two new options: `noCritical` (a critical read as an
 *      ordinary hit before the card is written) and `beforeDamage` (the pair
 *      decides, and may void the hit, before anything lands)
 *   B  Double Slice uses them: the second swing rolled while the first waits,
 *      one critical, DR met once, a fumble on either side
 *   C  the pair's card says what happened, and no longer asks for damage
 *      rolls that have been made
 *   D  the pure rules are unchanged
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const aw = read("module", "combat", "attack-workflow.mjs");
const ds = read("module", "combat", "double-slice-workflow.mjs");
const pos = (src, needle) => src.indexOf(needle);

/* A — the Strike's options */
ok("A1 the Strike takes both options", /\n  noCritical = false,\n  beforeDamage = null,\n/.test(aw));
ok("A2 a critical under noCritical is read as an ordinary hit, straight after the outcome is read",
  /missForgiveness\n  \}\);\n  \/\/ ONE CRITICAL FOR THE PAIR \(3\.668\.2\)[^\n]*\n[^\n]*\n  const criticalDowngraded = Boolean\(noCritical\) && Boolean\(outcome\.critical\);\n  if \(criticalDowngraded\) outcome\.critical = null;/.test(aw));
ok("A3 …before the card's summary and lines are written, and the card says so",
  pos(aw, "if (criticalDowngraded) outcome.critical = null;") < pos(aw, "  let compactSummary;\n  if (!outcome.resolved) {")
  && /if \(criticalDowngraded\) \{\n    lines\.push\(line\(`<em>\$\{optionLabel \|\| "Only one critical"\}: this critical counts as an ordinary hit — no bonus dice and no injury\.<\/em>`\)\);\n  \}\n  check\.compact = true;/.test(aw));
const gate = pos(aw, "  if (typeof beforeDamage === \"function\") {");
ok("A4 the pair is asked after the card and before the grab, the hit condition, the carried spell, the injury and the damage",
  gate > pos(aw, "  await check.toMessage();\n")
  && ["const grabOnly = isGrabOnly(weapon);", "const hitCondition = hitConditionOf(weapon);", "const strikeLands = !grabOnly && !hitCondition && !spellCarried;", "  if (!held) {", "  if (outcome.hits && strikeLands && !held) {"].every((n) => pos(aw, n) > gate));
ok("A5 a void turns the hit into a miss, critical and all",
  /const verdict = await beforeDamage\(\{ outcome, check \}\);\n    if \(verdict\?\.void && outcome\.hits\) \{\n      voidedByPair = true;\n      outcome\.hits = false;\n      outcome\.critical = null;\n    \}/.test(aw));
ok("A6 the check reports both to its caller", /check\.voidedByPair = voidedByPair;\n  check\.criticalDowngraded = criticalDowngraded;/.test(aw));

/* B — Double Slice uses them */
ok("B1 the second swing: same target, its penalty, one critical, DR met once",
  /const rollSecond = \(firstOutcome\) => rollWeaponAttack\(actor, pair\.second, \{\n    apPaid: true,\n    mapFrozen: true,[\s\S]{0,300}skipTargetPrompt: true,\n    extraModifiers: penalty \? \[penalty\] : \[\],\n    noCritical: Boolean\(firstOutcome\?\.hits && firstOutcome\?\.critical\),\n    drWaived: Boolean\(firstOutcome\?\.hits\),/.test(ds));
ok("B2 the second is rolled while the first waits, and its fumble voids the first",
  /beforeDamage: async \(\{ outcome: firstOutcome \}\) => \{\n      if \(firstOutcome\?\.fumbleRisk\) return null;\n      secondCheck = await rollSecond\(firstOutcome\);\n      secondRolled = true;\n      return \{ void: Boolean\(secondCheck\?\.attackFumbled\) \};\n    \}/.test(ds));
ok("B3 a first swing that may fumble finishes first; if it fumbled, the second is not made",
  /if \(!secondRolled && !firstCheck\.attackFumbled\) secondCheck = await rollSecond\(firstCheck\.attackOutcome\);/.test(ds));
ok("B4 the old order is gone: no unconditional second Strike after the first", !/const secondCheck = await rollWeaponAttack\(actor, pair\.second/.test(ds));
ok("B5 the count and Twin still read each swing after the pair's rules",
  /hits: outcome\.firstHits, damageTaken: Number\(firstCheck\?\.damageTaken \?\? 0\) \|\| 0/.test(ds) && /hits: outcome\.secondHits, damageTaken: Number\(secondCheck\?\.damageTaken \?\? 0\) \|\| 0/.test(ds));

/* C — the card */
ok("C1 no line asks for damage to be rolled", !/Roll damage from both cards|Roll no damage from either card|strike's card only/.test(ds));
ok("C2 it says the damage has been applied, or that neither deals any", /"<em>The damage above has been applied\.<\/em>"\n      : "<em>Neither swing deals damage\.<\/em>"/.test(ds));
ok("C3 it names the damage each swing dealt, and a hit voided by a fumble", /\$\{Number\(check\.damageTaken \?\? 0\) \|\| 0\} damage taken/.test(ds) && /\(its hit voided by the second swing's fumble\)/.test(ds));
ok("C4 a second critical counted as an ordinary hit is said; the old \"both scored a critical\" note is not printed",
  /secondCheck\?\.criticalDowngraded \? \["<em>Only one critical: the second swing's critical counted as an ordinary hit/.test(ds)
  && /\.\.\.outcome\.notes\.filter\(\(note\) => \/fumbled\/\.test\(note\)\)/.test(ds));
ok("C5 the second not made after a fumbled first says why", /the first fumbled, so it automatically misses/.test(ds));

/* D — the pure rules */
const pure = await import(new URL("../module/combat/double-slice.mjs", import.meta.url));
const r1 = pure.resolveDoubleSlice({ hits: true, critical: true }, { hits: true, critical: true });
const r2 = pure.resolveDoubleSlice({ hits: true }, { fumbled: true });
equal("D1 the pair's rules: one critical, a fumble spoils both", [r1.criticals, r1.secondHits, r2.firstHits, r2.secondHits, /fumbled/.test(r2.notes[0])], [1, true, false, false, true]);

const EXPECTED = 18;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-double-slice-3668-2: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-double-slice-3668-2: ${checks} checks — all green.`);
