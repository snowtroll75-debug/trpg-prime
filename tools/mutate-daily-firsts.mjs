#!/usr/bin/env node
/** mutate-daily-firsts — the mutation half of verify-daily-firsts. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DF = m("daily-firsts.mjs"), AW = m("combat", "action-workflow.mjs"), RW = m("rest", "rest-workflow.mjs"), UW = m("uses-workflow.mjs");
const MUTATIONS = [
  { name: "a spent first still applies", file: DF, from: "  if (spent) return null;\n  const rolled", to: "  const rolled", breaks: "A2" },
  { name: "the cap is ignored", file: DF, from: "  const improved = Math.max(Math.min(at, cap), at - steps);", to: "  const improved = at - steps;", breaks: "A1" },
  { name: "set can make a roll worse", file: DF, from: "    return { degree: DEGREE_ORDER[Math.min(at, target)], from: rolled, labels: [setRow.label] };", to: "    return { degree: DEGREE_ORDER[target], from: rolled, labels: [setRow.label] };", breaks: "A3" },
  { name: "improve rows win over set", file: DF, from: "  if (setRow) {", to: "  if (setRow && false) {", breaks: "A4" },
  { name: "only one improver counts", file: DF, from: "  const steps = improvers.reduce((sum, r) => sum + Math.floor(Number(r.improve)), 0);", to: "  const steps = 1;", breaks: "A5" },
  { name: "rows for any action count", file: DF, from: "      if (!row || norm(row.action) !== wanted) continue;", to: "      if (!row) continue;", breaks: "A6" },
  { name: "a spent multiplier still doubles", file: DF, from: "  if (spent) return 1;", to: "", breaks: "B1" },
  { name: "the kinds are not kept apart", file: DF, from: "  return rowsFor(carriers, actionKey).some((r) => kind === \"multiplier\"", to: "  return rowsFor(carriers, actionKey).some((r) => true || kind === \"multiplier\"", breaks: "B2" },
  { name: "the action ignores the day's first", file: AW, from: "dailyFirst?.degree ?? attitudeImproved, DEGREES)", to: "attitudeImproved, DEGREES)", breaks: "C1" },
  { name: "the first is never spent", file: AW, from: "    await actor.setFlag(SYSTEM_ID, DAILY_FIRSTS_FLAG, { ...(actor.getFlag(SYSTEM_ID, DAILY_FIRSTS_FLAG) ?? {}), [action.key]: true });\n", to: "", breaks: "C2" },
  { name: "the card keeps quiet", file: AW, from: "    if (dailyFirstNote) lines.push(line(dailyFirstNote));\n", to: "", breaks: "C3" },
  { name: "the rest never doubles", file: RW, from: "          bonus *= dailyFirstMultiplier(carriers, \"powerRecovery\", false);\n", to: "", breaks: "C4" },
  { name: "a new day keeps yesterday's firsts", file: UW, from: "  if (actor.getFlag?.(\"trg-prime\", DAILY_FIRSTS_FLAG)) await actor.unsetFlag(\"trg-prime\", DAILY_FIRSTS_FLAG);\n", to: "", breaks: "C5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-daily-firsts.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-daily-firsts: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-daily-firsts: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-daily-firsts: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
