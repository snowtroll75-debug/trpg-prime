#!/usr/bin/env node
/**
 * verify-ff30-block24 — 3.657.0, Fiends & Fables 3.0 block 24 (the Rats to
 * the Sequoia Allium; Graham, 17 October 2026: "Go with your recommendations").
 *
 *   R2   an area exposes those it damaged to an affliction (Rat Bites)
 *   R3   an area's condition by critical severity (Raven Beaks)
 *   R5   an area bypasses an immunity for named kinds (Garlic Breath)
 *   R6   the grab weapon trait
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
const imp = (...p) => import(pathToFileURL(path.join(SYSTEM_ROOT, "module", ...p)).href);
const PE = await imp("peril-effect.mjs");
const GO = await imp("combat", "grab-only.mjs");

/* ---- R3 ---- */
const beaks = { onCriticalSeverity: { min: "serious", conditions: [{ key: "blinded", rounds: 1 }, { key: " " }] } };
equal("B1 serious or worse lays the condition; minor, none, or no rule lays nothing",
  [PE.severityConditions(beaks, "serious").map((c) => c.key), PE.severityConditions(beaks, "Deadly").map((c) => c.key), PE.severityConditions(beaks, "minor"), PE.severityConditions(beaks, null), PE.severityConditions({}, "deadly")],
  [["blinded"], ["blinded"], [], [], []]);
/* ---- R5 ---- */
const garlic = { bypassImmunityFor: ["vampire"] };
equal("B2 a named kind is found among the traits or the creature's items; another kind, or no rule, is not",
  [PE.immunityBypassedFor(garlic, ["undead", "Vampire"]), PE.immunityBypassedFor(garlic, ["Vampire (Lesser)"]), PE.immunityBypassedFor(garlic, ["undead"]), PE.immunityBypassedFor({}, ["vampire"])],
  ["vampire", "vampire", "", ""]);
/* ---- R6 ---- */
const wp = (traits) => ({ system: { traits } });
equal("B3 the grab trait as a word; not a lookalike, not elsewhere",
  [GO.hasGrabTrait(wp("Grab, Reach 30")), GO.hasGrabTrait(wp("agile, grab")), GO.hasGrabTrait(wp("(grab)")), GO.hasGrabTrait(wp("Grabby, Reach")), GO.hasGrabTrait(wp("Agile")), GO.hasGrabTrait(null)],
  [true, true, true, false, false, false]);

/* ---- source ---- */
const src = { pw: read("module", "peril-workflow.mjs"), dw: read("module", "combat", "damage-workflow.mjs"), aw: read("module", "combat", "attack-workflow.mjs") };
ok("S1 an area exposes each creature it damaged, through the strike's own exposure",
  /if \(spec\.exposeOnDamage\?\.affliction && record\.damage > 0\) \{\n\s+const \{ exposeFromArea \}[^\n]*\n\s+for \(const l of await exposeFromArea\(peril, actor, \{ label: title \|\| peril\.name, expose: spec\.exposeOnDamage \}, level\)\) parts\.push\(l\);/.test(src.pw));
ok("S2 the basic save's own critical severity lays the declared condition",
  /const sev = bst\(key, check\?\.outcome\?\.margin \?\? null\)\?\.criticalSeverity \?\? null;\n\s+const rows = severityConditions\(spec, sev\)/.test(src.pw)
  && /await relayConditionTags\(actor, rows, \{\}, \(\) => applyConditionTags\(actor, rows, \{\}\)\);/.test(src.pw));
ok("S3 a named kind's immunity is bypassed for that type only, its resistances and DR still met",
  /ignoreImmunityTo: bypassKind \? takenType : "",/.test(src.pw)
  && /if \(packet\.immune && bypass && bypass === String\(type \?\? ""\)\.trim\(\)\.toLowerCase\(\)\) \{/.test(src.dw)
  && /\.filter\(\(t\) => t && t\.toLowerCase\(\) !== bypass\)/.test(src.dw));
ok("S4 a landed grab-trait hit Grabs and marks the holder; a grab-only or carried-spell hit does not reach it",
  /if \(strikeLands && outcome\.hits && targetActor && hasGrabTrait\(weapon\)\) \{\n\s+await applyConditionTags\(targetActor, \[\{ key: "grabbed", label: "Grabbed" \}\], \{\}\);\n\s+if \(targetActor\.setFlag\) await targetActor\.setFlag\(SYSTEM_ID, "grabbedBy", \{ uuid: actor\.uuid/.test(src.aw));

const EXPECTED = 8;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block24: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block24: ${checks} checks\n  all pass\n`);
