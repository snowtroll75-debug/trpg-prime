#!/usr/bin/env node
/** mutate-skirmish-3700 — the mutation half of verify-skirmish-3700 (Skirmish's Step and Strike, 3.700.0). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AF = M("combat", "action-feats.mjs");
const AFW = M("combat", "action-feats-workflow.mjs");
const AW = M("combat", "attack-workflow.mjs");
const ST = M("combat", "strike.mjs");
const MAIN = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const MUTATIONS = [
  { name: "A the Step provokes", file: AF, from: "speedKey: \"land\", maxFeet, provokes: false, countsAs: \"step\",\n    note: \"Skirmish's Step\"", to: "speedKey: \"land\", maxFeet, provokes: true, countsAs: \"step\",\n    note: \"Skirmish's Step\"" },
  { name: "A the Step counted as a Stride", file: AF, from: "provokes: false, countsAs: \"step\",\n    note: \"Skirmish's Step\"", to: "provokes: false, countsAs: \"stride\",\n    note: \"Skirmish's Step\"" },
  { name: "A the Step kept through other actions", file: AF, from: "note: \"Skirmish's Step\", nextAction: true,", to: "note: \"Skirmish's Step\", nextAction: false," },
  { name: "B a used Strike may be made again", file: AF, from: "  if (record.used) return { ok: false, reason: \"its Strike has already been made\" };", to: "" },
  { name: "B a later turn allowed", file: AF, from: "|| Number(now.round) !== Number(record.round) || Number(now.turn) !== Number(record.turn)) {", to: "|| Number(now.round) !== Number(record.round)) {" },
  { name: "B another action allowed between", file: AF, from: "    if (Number.isFinite(at) && Number(now.ap) < at) {", to: "    if (false) {" },
  { name: "C Skirmish melee-only again", file: AF, from: "    anyWeapon: true,\n    summary: \"Strike and Step together", to: "    summary: \"Strike and Step together" },
  { name: "C the chooser melee-only", file: ST, from: "  const ready = usableAttacks(Array.from(actor?.items ?? []));\n  if (ready.length < 2) return undefined;", to: "  const ready = usableAttacks(Array.from(actor?.items ?? [])).filter((w) => (w.system?.attackMode ?? \"melee\") === \"melee\");\n  if (ready.length < 2) return undefined;" },
  { name: "D the handler rolls the Strike at once again", file: AFW, from: "    const stepFeet = stepDistance(actor);\n    const combat", to: "    await strikePlan(actor, weapon, \"skirmish\");\n    const stepFeet = stepDistance(actor);\n    const combat" },
  { name: "D no Step armed", file: AFW, from: "      await armCompoundLeg(actor, skirmishLeg(stepFeet, apAtArm), entry.label);", to: "" },
  { name: "E the card's Strike removes the Step", file: AFW, from: "await strikePlan(actor, weapon, \"skirmish\", { keepsStep: true })", to: "await strikePlan(actor, weapon, \"skirmish\")" },
  { name: "E keepsStep not passed to the attack", file: AFW, from: "      keepsStep,                  // Skirmish", to: "      //                          Skirmish" },
  { name: "E the attack ignores keepsStep", file: AW, from: "  const strikeTaken = async () => {\n    if (keepsStep) return;\n", to: "  const strikeTaken = async () => {\n" },
  { name: "E the button marked used on a refused Strike", file: AFW, from: "  if (checks.resolved > 0) await message.setFlag(", to: "  if (true) await message.setFlag(" },
  { name: "E the hook never registered", file: MAIN, from: "\n  registerSkirmishHooks();\n", to: "\n" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-skirmish-3700.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-skirmish-3700: verify-skirmish-3700 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-skirmish-3700: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-skirmish-3700: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
