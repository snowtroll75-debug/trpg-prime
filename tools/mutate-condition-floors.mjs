#!/usr/bin/env node
/** mutate-condition-floors — eight mutations against verify-condition-floors.mjs. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const EMAN = path.join(SYSTEM_ROOT, "module", "magic", "emanation-workflow.mjs");
const BAC = path.join(SYSTEM_ROOT, "module", "combat", "basic-action-conditions.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const CC = path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs");

const MUTATIONS = [
  { name: "a disabled effect's floor still counts", file: EMAN, from: "    if (effect.disabled) continue;\n    const value = Number(effect.flags", to: "    const value = Number(effect.flags", breaks: "A4" },
  { name: "the lowest floor wins instead of the highest", file: EMAN, from: "    if (value > floor) floor = value;", to: "    if (value > 0) floor = value;", breaks: "A3" },
  { name: "conditionFloorFor ignores effect floors when there is no token", file: EMAN, from: "  if (!tokens.length) return floor;", to: "  if (!tokens.length) return 0;", breaks: "A7" },
  { name: "inflictedFloorsFor matches any action", file: BAC, from: "String(f.action).toLowerCase() === a && String(f.condition).toLowerCase() === c", to: "String(f.condition).toLowerCase() === c", breaks: "B5" },
  { name: "a zero-value declaration is kept", file: BAC, from: "if (entry?.action && entry?.condition && Number(entry.value) > 0) out.push", to: "if (entry?.action && entry?.condition) out.push", breaks: "B7" },
  { name: "Rally stops asking the floor", file: AW, from: "          const newFrightened = Math.max(0, Math.max(currentFrightened - reduction, floor));", to: "          const newFrightened = Math.max(0, currentFrightened - reduction);", breaks: "C2 (regex requires the call and the max)" },
  { name: "the reduceCondition card stops asking the floor", file: CC, from: "    const floor = conditionFloorFor(target, raw.conditionKey);\n", to: "    const floor = 0;\n", breaks: "C3" },
  { name: "the rolled applier forgets the action key", file: AW, from: "{ expiresRound, actionKey: action.key }", to: "{ expiresRound }", breaks: "C5" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-condition-floors.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([EMAN, BAC, AW, CC]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-condition-floors: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-condition-floors: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-condition-floors: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
