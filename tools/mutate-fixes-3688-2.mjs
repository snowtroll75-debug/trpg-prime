#!/usr/bin/env node
/** mutate-fixes-3688-2 — the mutation half of verify-fixes-3688-2 (3.688.2: the release's Spellcraft path and the library gate). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CIW = path.join(SYSTEM_ROOT, "module", "charged-items-workflow.mjs");
const CI = path.join(SYSTEM_ROOT, "module", "charged-items.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const MUTATIONS = [
  { name: "the Spellcraft path read as a skill again", file: CIW, from: "const bySkill = Boolean(option.skill) && option.skill !== \"spellcraft\";", to: "const bySkill = Boolean(option.skill);" },
  { name: "a skill path read as Spellcraft", file: CIW, from: "const bySkill = Boolean(option.skill) && option.skill !== \"spellcraft\";", to: "const bySkill = false;" },
  { name: "the check's type ignores the path", file: CIW, from: "    type: bySkill ? \"skill\" : \"spellcraft\",\n    dc: castingDC(cost) + partsTotal,", to: "    type: option.skill ? \"skill\" : \"spellcraft\",\n    dc: castingDC(cost) + partsTotal," }, // RE-ANCHORED AT 3.690.0 (H23)
  { name: "the fumble's check ignores the path", file: CIW, from: "check: { type: bySkill ? \"skill\" : \"spellcraft\", skill: bySkill ? option.skill : \"\" },", to: "check: { type: option.skill ? \"skill\" : \"spellcraft\", skill: option.skill ?? \"\" }," },
  { name: "an item's spell asked the library's question", file: CW, from: "  const castBlocked = (ritualNonCaster || releasedFromItem) ? \"\" : spellCastBlocked(spell);", to: "  const castBlocked = ritualNonCaster ? \"\" : spellCastBlocked(spell);" },
  { name: "every spell exempt", file: CW, from: "  const releasedFromItem = Boolean(spell.getFlag?.(SYSTEM_ID, \"itemCast\"));", to: "  const releasedFromItem = true;" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.711.0\"", to: "\"version\": \"3.688.1\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3688-2.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-fixes-3688-2: verify-fixes-3688-2 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-fixes-3688-2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3688-2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
