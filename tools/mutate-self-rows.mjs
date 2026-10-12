#!/usr/bin/env node
/**
 * mutate-self-rows — can verify-self-rows fail?
 *
 * NEW at 3.617.3. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "self-rows.mjs");
const AUTHOR = at("tools", "author-self-rows.mjs");
const REPAIRS = at("module", "data", "pack-repairs.mjs");
const VERIFY = at("tools", "verify-self-rows.mjs");

const MUTATIONS = [
  { file: RULE, name: "the rule stops looking (nothing ever reaches nobody)",
    from: "  if (!castOnSelfOnly(system)) return [];", to: "  return [];", breaks: "A2" },
  { file: RULE, name: "a self range is not self",
    from: "  return blank(system?.targets) && blank(system?.area) && (!range || /^self$/i.test(range));",
    to: "  return blank(system?.targets) && blank(system?.area) && !range;", breaks: "A1" },
  { file: RULE, name: "a gated row is counted as reaching nobody",
    from: " && String(row.target ?? \"\") !== \"self\" && !row.onSave);", to: " && String(row.target ?? \"\") !== \"self\");", breaks: "A2" },
  { file: AUTHOR, name: "THE OLD DEFECT: Invisibility's row back on its targets",
    from: "      { kind: \"condition\", target: \"self\", condition: \"invisible\" },", to: "      { kind: \"condition\", target: \"targets\", condition: \"invisible\" },", breaks: "C1" },
  { file: REPAIRS, name: "Shield Of Faith's owned copies keep their warp",
    from: "    id: \"shield-of-faith-warps-3617\", pack: \"spells\", name: \"Shield Of Faith\",\n    field: \"warps\", since: \"3.617.3\",",
    to: "    id: \"shield-of-faith-warps-3617\", pack: \"spells\", name: \"Shield Of Faith\",\n    field: \"warps\", since: \"3.617.2\",", breaks: "C3" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-self-rows: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-self-rows: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-self-rows: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
