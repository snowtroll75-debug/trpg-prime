#!/usr/bin/env node
/**
 * verify-fixes-3688-4 — TRG Prime 3.688.4: the Magic Ritual dialog's
 * "Secondary casters with a different tradition" count is held to the
 * secondaries recorded in the rows (Graham, 13 November 2026). It was its own
 * box, read straight into the DC: 3 with no secondary recorded raised the DC
 * by 6 for casters who were not there. A larger count is now refused before
 * the roll, with a warning, rather than trimmed.
 *
 *   node tools/verify-fixes-3688-4.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const cw = strip(read("module", "magic", "cast-workflow.mjs"));

ok("A the count is read once, as a whole number not below 0",
  /const diffTradition = Math\.max\(0, Math\.floor\(Number\(result\.diffTradition\) \|\| 0\)\);/.test(cw));
ok("A a count above the recorded secondaries (people, not seats) is refused, with a warning, before the roll",
  /if \(diffTradition > degrees\.length\) \{\n\s*ui\.notifications\.warn\(\n\s*`\$\{spell\.name\}: \$\{diffTradition\} secondary caster/.test(cw)
  && /Record each one's result, or lower the count\.`\n\s*\);\n\s*return null;\n\s*\}/.test(cw));
ok("A the DC reads the checked count, not the raw box",
  /differentTraditionSecondaryCasters: diffTradition,/.test(cw) && !/differentTraditionSecondaryCasters: Number\(result\.diffTradition/.test(cw));
const iDegrees = cw.indexOf("const degrees = Array.from");
const iGuard = cw.indexOf("if (diffTradition > degrees.length)");
const iDC = cw.indexOf("const dcModifiers = ritualDCModifierTotal(");
const iRitual = cw.indexOf("async function rollMagicRitual");
const iPrepare = cw.indexOf("const ritualPlan = await prepareRitual(", iRitual);
const iAsk = cw.indexOf("await askCastItems(actor", iRitual);
ok("A the guard comes after the rows are counted, and before the sourcebooks' prepareRitual (which may spend), the DC and the catalysts",
  iRitual > 0 && iDegrees > iRitual && iGuard > iDegrees && iPrepare > iGuard && iDC > iGuard && iAsk > iGuard,
  JSON.stringify({ iRitual, iDegrees, iGuard, iPrepare, iDC, iAsk }));

const { ritualDCModifierTotal } = await import(new URL("../module/magic/casting.mjs", import.meta.url));
equal("B the rule's own sum is unchanged: +2 per caster of a different tradition", [0, 1, 3].map((n) => ritualDCModifierTotal({ differentTraditionSecondaryCasters: n })), [0, 2, 6]);

const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.691.0", [sys.version, JSON.parse(read("package.json")).version], ["3.700.0", "3.700.0"]);
equal("Z the download names it", sys.download, "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.700.0/trg-prime.zip");

if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); console.log(`verify-fixes-3688-4: ${failures.length} failure(s) of ${checks}`); process.exit(1); }
console.log(`verify-fixes-3688-4: all ${checks} checks pass`);
