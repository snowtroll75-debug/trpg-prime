#!/usr/bin/env node
/**
 * mutate-stone-wise — can verify-stone-wise fail?
 *
 * NEW at 3.546.0, beside the verify.
 *
 * D1 AND D2 PULL AGAINST EACH OTHER: one says a Dwarf who already has
 * Stone Lore must get no second copy, the other that a character without
 * it must still get one. A planner that created nothing would satisfy
 * the first; the old handler, which created one every time, satisfied
 * the second. Only both together describe the rule.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const S = path.join(SYSTEM_ROOT, "module", "specialist-grants.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-stone-wise.mjs");

const MUTATIONS = [
  {
    file: S,
    name: "M1 THE MATCHER NEVER FINDS ANYTHING — what Stone Wise effectively did",
    from: "    if (String(skill?.label ?? \"\").trim().toLowerCase() === wanted) return key;",
    to: "    if (false) return key;",
    breaks: "M1/H1 — every press falls through to creation, which is precisely the reported "
      + "defect: a second Stone Lore called stoneLore2"
  },
  {
    file: S,
    name: "M2 THE MATCHER RETURNS THE FIRST KEY IT SEES",
    from: "  for (const [key, skill] of Object.entries(existing ?? {})) {",
    to: "  for (const [key, skill] of Object.entries(existing ?? {})) { if (true) return key;",
    breaks: "M2 — asking for a skill nobody has would hand back Dwarven Lore, and the +2 "
      + "would land on the wrong skill entirely"
  },
  {
    file: S,
    name: "M2b THE MATCHER READS THE KEY INSTEAD OF THE LABEL",
    from: "    if (String(skill?.label ?? \"\").trim().toLowerCase() === wanted) return key;",
    to: "    if (String(key).toLowerCase() === wanted.replace(/\\s+/g, \"\")) return key;",
    breaks: "M2b — the key is a slug this system chose; two sources agree on the LABEL the "
      + "player reads, which is why planSpecialistSkills matched on it in the first place"
  },
  {
    file: S,
    name: "M3 A BLANK LABEL MATCHES THE FIRST BLANK ENTRY",
    from: "  if (!wanted) return null;",
    to: "  if (false) return null;",
    breaks: "M3b — an empty request would find any skill with an empty label and quietly "
      + "raise a bonus on it"
  },
  {
    file: S,
    name: "D1 THE DEDUPE IN planSpecialistSkills STOPS SKIPPING",
    from: "    if (byLabel.has(label.toLowerCase())) {",
    to: "    if (false) {",
    breaks: "D1/D3 — the rule that was ALREADY RIGHT before this release. Losing it puts "
      + "two skills of the same name on the sheet by the other route as well"
  },
  {
    file: S,
    name: "D2 THE PLANNER CREATES NOTHING AT ALL",
    from: "    create.push({ key, label });",
    to: "    skipped.push(label);",
    breaks: "D2/D2b — a character who genuinely lacks Stone Lore never gets it; D1 alone "
      + "would call that a pass"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([S, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-stone-wise: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-stone-wise: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-stone-wise: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
