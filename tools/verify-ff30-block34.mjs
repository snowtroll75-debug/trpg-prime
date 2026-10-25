#!/usr/bin/env node
/**
 * verify-ff30-block34 — 3.663.3, Fiends & Fables 3.0 block 34 (the Wolf,
 * Wulve and Waarg). The audit found nothing to change; the live test found
 * one card label.
 *
 *   F1   Pack Attack's precision die is named as Pack Attack, not as
 *        Precision Hunter; each precision source has its own line
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
const aw = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs"), "utf8");
ok("F1 the strike hands its precision sources to the damage step, Pack Attack by name",
  /precisionParts: \[\s*precisionDice \? \{ dice: precisionDice, label: "Precision Hunter"[\s\S]{0,400}packDice \? \{ dice: packDice, label: "Pack Attack", why: "the target is within reach of at least two of its allies" \} : null,?\s*(\n\s*ambushDice \? [^\n]*: null\s*)?\]\.filter\(Boolean\),/.test(aw)); // re-anchored at 3.668.0: Unseen Assault's dice join the list
ok("F1b the damage step takes them", /sneakDice = 0, precisionDice = 0, precisionParts = null, damageRiders = \[\],/.test(aw));
ok("F1c the card prints one line per source, and Precision Hunter's only when there is no breakdown",
  /const parts = Array\.isArray\(precisionParts\) && precisionParts\.length \? precisionParts : \[\{ dice: precision, label: "Precision Hunter"[^\]]*\];\s*for \(const part of parts\) lines\.push\(line\(`<strong>\$\{part\.label\}<\/strong> — \+\$\{part\.dice\}d6 precision damage \(\$\{part\.why\}\)\.`\)\);/.test(aw));
ok("F1d Pack Attack's die is still added to the roll", /const compoundPrecision = Math\.max\(0, Math\.floor\(Number\(extraPrecisionDice\) \|\| 0\)\) \+ packDice;/.test(aw) && /precisionDice: precisionDice \+ compoundPrecision( \+ ambushDice)?,/.test(aw)); // re-anchored at 3.668.0
const EXPECTED = 5;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block34: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block34: ${checks} checks\n  all pass\n`);
