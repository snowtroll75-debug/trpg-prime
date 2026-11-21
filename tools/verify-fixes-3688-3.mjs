#!/usr/bin/env node
/**
 * verify-fixes-3688-3 — TRG Prime 3.688.3: the Magic Ritual dialog's six
 * secondary-caster rows start at "— not participating —" (Graham, 13 November
 * 2026). They used to open on "Success (+2)", so a ritual rolled without
 * touching them was credited six absent casters: +12 on the check and six
 * seats of overcast headroom.
 *
 *   node tools/verify-fixes-3688-3.mjs
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
const at = cw.indexOf("const secondaryRow = (index) =>");
const end = cw.indexOf("</select>", at);
const row = at >= 0 && end > at ? cw.slice(at, end) : "";

ok("A the secondary row is found", row.length > 0);
ok("A its blank option is the selected one", /<option value="" selected>— not participating —<\/option>/.test(row));
ok("A no degree option is selected", !/selected/.test(row.replace('<option value="" selected>', "")), row.slice(0, 400));
ok("A the five degrees are still offered, with the ladder's modifiers",
  /\["critical", "success", "failure", "fumble", "blunder"\]\.map\(\(key\) => \{\n\s*const mod = magicRitualSecondaryModifier\(key\);/.test(row));
ok("A one row per seat (MAX_SECONDARY_CASTERS)", /Array\.from\(\{ length: MAX_SECONDARY_CASTERS \}, \(_, i\) => secondaryRow\(i\)\)/.test(cw));

// B — what a blank form adds up to: no casters, no modifier.
ok("B a blank row is no seat (the count filters empty values)",
  /String\(result\[`secondary-\$\{i\}`\] \?\? ""\)\.trim\(\)\)\.filter\(Boolean\);/.test(cw));
const { magicRitualSecondaryModifier } = await import(new URL("../module/magic/casting.mjs", import.meta.url));
{
  equal("B the ladder is unchanged", ["critical", "success", "failure", "fumble"].map(magicRitualSecondaryModifier), [4, 2, -4, -10]);
}

const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.691.0", [sys.version, JSON.parse(read("package.json")).version], ["3.707.2", "3.707.2"]);
equal("Z the download names it", sys.download, "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.707.2/trg-prime.zip");

if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); console.log(`verify-fixes-3688-3: ${failures.length} failure(s) of ${checks}`); process.exit(1); }
console.log(`verify-fixes-3688-3: all ${checks} checks pass`);
