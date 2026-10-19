#!/usr/bin/env node
/**
 * verify-ff30-block30 — 3.661.0, Fiends & Fables 3.0 block 30 (the spiders;
 * Graham, 18 October 2026: "Okay please continue").
 *
 *   R2   a strike that only lays a condition (the Web: Immobilised, no damage)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const GO = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "combat", "grab-only.mjs")).href);

const web = { name: "Web", flags: { "trg-prime": { creatureAttack: { hitCondition: { key: " immobilised " } } } } };
equal("B1 the Web lays Immobilised; a weapon without the declaration, or with a blank key, lays nothing",
  [GO.hitConditionOf(web), GO.hitConditionOf({ flags: {} }), GO.hitConditionOf({ flags: { "trg-prime": { creatureAttack: { hitCondition: { key: "" } } } } }), GO.hitConditionOf(null)], [{ key: "immobilised" }, null, null, null]);
ok("B2 the card says it deals no damage, a critical no injury, and that Escape frees it",
  /deals no damage and a critical inflicts no injury\. It may Escape/.test(GO.hitConditionLine("Spider", "Brave", "Web", "Immobilised", true))
  && !/critical/.test(GO.hitConditionLine("Spider", "Brave", "Web", "Immobilised", false)));
const aw = read("module", "combat", "attack-workflow.mjs");
ok("S1 a hit lays the condition; the strike then rolls neither injury nor damage, and carries no spell",
  /if \(hitCondition && outcome\.hits && targetActor\) \{[\s\S]{0,300}?await applyConditionTags\(targetActor, \[\{ key: hitCondition\.key, label \}\], \{\}\);/.test(aw)
  && /const strikeLands = !grabOnly && !hitCondition && !spellCarried;/.test(aw)
  && /if \(!grabOnly && !hitCondition && outcome\.hits && targetActor\) \{/.test(aw));
ok("S2 core's Escape ends Immobilised", /escape: \{\n\s+success: \[\n\s+\{ target: "self", conditionKey: "grabbed", active: false \},\n\s+\{ target: "self", conditionKey: "immobilised", active: false \}/.test(read("module", "combat", "basic-action-conditions.mjs")));

const EXPECTED = 5;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block30: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block30: ${checks} checks\n  all pass\n`);
