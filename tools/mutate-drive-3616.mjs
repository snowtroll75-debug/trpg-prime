#!/usr/bin/env node
/**
 * mutate-drive-3616 — can verify-drive-3616 fail?
 *
 * NEW at 3.616.1. Each mutation puts back a defect the 3.616.0 drive found
 * or a ruling it asked for. SURVIVED and an unmatched anchor are both
 * failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const DURATION = at("module", "magic", "effect-duration.mjs");
const DEPLETE = at("module", "magic-items-workflow.mjs");
const PROF = at("module", "proficiency-rules.mjs");
const FORMS = at("module", "charged-weapon-forms.mjs");
const FORMSF = at("module", "charged-weapon-forms-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const HEAD = at("module", "magic", "cast-result-line.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const VERIFY = at("tools", "verify-drive-3616.mjs");

const MUTATIONS = [
  { file: DURATION, name: "F1 — the ×2 is decoration again (the shipped defect)",
    from: "  if (factor > 1) {\n", to: "  if (false) {\n", breaks: "A1" },
  { file: DURATION, name: "F1 — any digit after the unit multiplies",
    from: "  const times = /×\\s*(\\d+)/.exec(t);", to: "  const times = /(\\d+)\\s*$/.exec(t);", breaks: "A1c" },
  { file: DEPLETE, name: "R1 — the exploded item stays (the shipped behaviour)",
    from: "  if (crumbles || explosion) await item.delete();", to: "  if (crumbles) await item.delete();", breaks: "B1" },
  { file: PROF, name: "R2 — the form is matched by its own name only (the shipped defect)",
    from: "    if (formBase && profile.weaponNames.has(nameKey(formBase))) {", to: "    if (false) {", breaks: "C1" },
  { file: FORMS, name: "R2 — a 3.616.0 form's signature is not read",
    from: '  return String(flag.signature ?? "").split("|")[1] ?? "";', to: '  return "";', breaks: "C1b" },
  { file: ATTACK, name: "R2 — the attack drops the flags",
    from: '{ type: "weapon", name: weapon.name, system: weaponData, flags: weapon.flags }', to: '{ type: "weapon", name: weapon.name, system: weaponData }', breaks: "C2" },
  { file: FORMSF, name: "R2 — new forms carry no base",
    from: "itemId: grant.itemId, base: grant.base, signature:", to: "itemId: grant.itemId, signature:", breaks: "C3" },
  { file: HEAD, name: "R3 — the rod's share goes unsaid",
    from: "${ppSpent} PP spent${fromRod}${note}.", to: "${ppSpent} PP spent${note}.", breaks: "D1" },
  { file: CAST, name: "R3 — the cast never tells the headline",
    from: ', rodPaid, rodName: rodSource?.name ?? "" };', to: " };", breaks: "D2" }
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
    process.stderr.write("mutate-drive-3616: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-drive-3616: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-3616: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
