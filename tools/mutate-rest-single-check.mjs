#!/usr/bin/env node
/**
 * mutate-rest-single-check — mutations against verify-rest-single-check.mjs
 * (3.710.2, one check of each kind for the whole rest; 3.710.3, the
 * Fatigue line says the change that landed).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const W = path.join(SYSTEM_ROOT, "module", "rest", "rest-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "combat", "exhaustion-workflow.mjs");
const MUTATIONS = [
  { name: "the trance multiplier is dropped", file: W, from: "hpHealed += naturalHealingHP(maxHP, 1) * multiplier * quickRecovery;", to: "hpHealed += naturalHealingHP(maxHP, 1) * 1 * quickRecovery;", breaks: "A2" },
  { name: "only the first hour heals", file: W, from: "      for (let hour = 0; hour < wholeHours; hour++) {\n        hpHealed", to: "      for (let hour = 0; hour < 1; hour++) {\n        hpHealed", breaks: "A2/D10" },
  { name: "the trance record loses its span", file: W, from: "healingTranceRolls.push({ hours: wholeHours, degree, multiplier });", to: "healingTranceRolls.push({ hour: 1, degree, multiplier });", breaks: "A3" },
  { name: "the Power Recovery bonus is paid every hour", file: W, from: "      ppRecovered += bonus;\n", to: "      ppRecovered += bonus * wholeHours;\n", breaks: "B2" },
  { name: "the Fatigue save is rolled every hour again", file: W, from: "    const fatigueResult = await rollFatigueRecovery(", to: "    for (let h = 1; h < wholeHours; h++) await rollFatigueRecovery(actor, { postCard: false });\n    const fatigueResult = await rollFatigueRecovery(", breaks: "C1/C2" },
  { name: "the Fatigue save forgets the span", file: E, from: "    subtitle,\n    type: \"save\",", to: "    subtitle: \"Level-based Fortitude save, after an hour of rest\",\n    type: \"save\",", breaks: "C4" },
  { name: "a one-hour rest is described as the whole rest", file: W, from: "wholeHours === 1 ? \"an hour of rest\"", to: "wholeHours === 1 ? \"the rest\"", breaks: "D4" },
  { name: "the trance is attempted in an unsafe place", file: W, from: "if (safeEnvironment && attemptHealingTrance) {", to: "if (attemptHealingTrance) {", breaks: "D5" },
  { name: "sustaining no longer blocks Power Recovery", file: W, from: "if (attemptPowerRecovery && !isSustaining) {", to: "if (attemptPowerRecovery) {", breaks: "D7" },
  { name: "the card no longer says one check", file: W, from: "`Healing Trance (one check for the rest): ", to: "`Healing Trance: ", breaks: "E1" },
  { name: "the card's Power Recovery line goes back", file: W, from: "`Power Recovery (one check for the rest): ", to: "`Power Recovery: ", breaks: "E2" },
  { name: "the rest card goes back to the rolled step", file: W, from: "const applied = Number(r.applied ?? r.delta ?? 0);", to: "const applied = Number(r.delta ?? 0);", breaks: "F1/F2" },
  { name: "the rest card drops the no-Fatigue wording", file: W, from: "else if (Number(r.delta) < 0) what = \"no Fatigue to recover\";", to: "", breaks: "F1" },
  { name: "the rest card loses the from value", file: W, from: "const from = Number(r.from ?? 0);", to: "const from = 0;", breaks: "F4/F6" },
  { name: "the save stops reporting what it applied", file: E, from: "  const applied = result - current;", to: "  const applied = delta;", breaks: "F3/F7" },
  { name: "the save stops reporting where it started", file: E, from: "delta: heldDown ? 0 : delta, from: current,", to: "delta: heldDown ? 0 : delta,", breaks: "F3/F4" },
  { name: "the standalone card drops the no-Fatigue wording", file: E, from: "    else if (delta < 0) lines.push('<p style=\"margin:2px 0\">No Fatigue to recover.</p>');\n", to: "", breaks: "F7" },
  { name: "the standalone card reports the rolled step on a reduction", file: E, from: "    else if (applied < 0) lines.push(`<p style=\"margin:2px 0\">Fatigue reduces by <strong>${-applied}</strong>", to: "    else if (delta < 0) lines.push(`<p style=\"margin:2px 0\">Fatigue reduces by <strong>${-delta}</strong>", breaks: "F7" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-rest-single-check.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([W, E]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-rest-single-check: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-rest-single-check: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-rest-single-check: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
