#!/usr/bin/env node
/** mutate-live-findings-3705-2 — the mutation half of verify-live-findings-3705-2 (the 3.705.1 player-perspective live test's findings, 3.705.2). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AFW = M("combat", "action-feats-workflow.mjs");
const AW = M("combat", "action-workflow.mjs");
const CDG = M("combat", "coup-de-grace.mjs");
const RD = M("combat", "reactive-disarm-workflow.mjs");
const RF = M("combat", "reaction-feats-workflow.mjs");
const MUTATIONS = [
  { name: "A a refused feat counts as struck", file: AFW, from: "  return Number(checks?.resolved ?? 0) > 0 ? checks : null;", to: "  return checks ?? null;" },
  { name: "A a feat that struck counts as nothing", file: AFW, from: "  return Number(checks?.resolved ?? 0) > 0 ? checks : null;", to: "  return null;" },
  { name: "A Vital Strike returns nothing again", file: AFW, from: "    if (critical) await actor.setFlag(SYSTEM_ID, \"vitalStrikeLocation\", location);\n    return struckOrNull(checks);", to: "    if (critical) await actor.setFlag(SYSTEM_ID, \"vitalStrikeLocation\", location);" },
  { name: "A Quick Draw returns nothing again", file: AFW, from: "the draw happened even though the Strike did not.</em>`) : \"\"\n    ]);\n    return struckOrNull(checks);", to: "the draw happened even though the Strike did not.</em>`) : \"\"\n    ]);" },
  { name: "B the object printed again", file: CDG, from: "  const severity = immune ? null : (result?.critical?.severity ?? null);", to: "  const severity = immune ? null : (result?.critical ?? null);" },
  { name: "B an immune target's critical printed", file: CDG, from: "  const severity = immune ? null : (result?.critical?.severity ?? null);", to: "  const severity = result?.critical?.severity ?? null;" },
  { name: "B the card's own template back", file: AW, from: "      lines.push(line(coupDeGraceHitLine(result, Boolean(coupImmune))));", to: "      lines.push(line(`<strong>Automatic hit</strong> (treated as an unmodified 20): AV ${result.av}${result.critical ? ` — <strong>${result.critical} critical</strong>` : \"\"}.`));" },
  { name: "C a refusal counts as taken", file: RD, from: "  return result !== null && result !== undefined;", to: "  return true;" },
  { name: "C the V13 targeting back", file: RD, from: "  if (token && game.user) token.setTarget(true, { user: game.user, releaseOthers: true });", to: "  if (token && game.user) await game.user.updateTokenTargets([token.id]);" },
  { name: "C marked used before it is tried", file: RD, from: "  if (!reactiveDisarmTaken(result)) return null;\n", to: "" },
  { name: "C the button stays dead after a refusal", file: RD, from: "      try { if (!(await pressReactiveDisarm(message))) button.disabled = false; }", to: "      try { await pressReactiveDisarm(message); }" },
  { name: "D Disarm Block's card before its Disarm", file: RF, from: "    if (result === null || result === undefined) return;\n    await report(reactor, \"Disarm Block\"", to: "    await report(reactor, \"Disarm Block\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-live-findings-3705-2.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-live-findings-3705-2: verify-live-findings-3705-2 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-live-findings-3705-2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-live-findings-3705-2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
