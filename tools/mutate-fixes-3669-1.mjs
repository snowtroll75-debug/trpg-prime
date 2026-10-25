#!/usr/bin/env node
/** mutate-fixes-3669-1 — the mutation half of verify-fixes-3669-1. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CK = m("dice", "check.mjs"), APW = m("combat", "action-points-workflow.mjs"), FRW = m("fumble-reroll-workflow.mjs"),
  APIW = m("module-api-workflow.mjs"), ACW = m("combat", "action-workflow.mjs"), DF = m("daily-firsts.mjs"),
  MW = m("combat", "movement-workflow.mjs"), SK = m("skills.mjs");
const MUTATIONS = [
  // A
  { name: "THE RULING UNDONE: a Blunder is not offered the reroll", file: CK, from: "&& [\"fumble\", \"blunder\"].includes(check.outcome?.degree?.key)) {", to: "&& check.outcome?.degree?.key === \"fumble\") {", breaks: "A1" },
  // B
  { name: "Battle Readiness's reaction is ignored when asked", file: APW, from: "  if (battleReadinessBonus(actor) > 0) {\n    return battleReadinessSpendBlock({", to: "  if (false) {\n    return battleReadinessSpendBlock({", breaks: "B1" },
  { name: "an empty pool is not a refusal", file: APW, from: "  if (Number(actor.system?.resources?.reactions?.value ?? 0) <= 0) return `${actor.name} has no reaction left this round.`;\n", to: "", breaks: "B1" },
  { name: "a refused spend reports success", file: APW, from: "      ui.notifications.warn(`${actionName}: ${blocked}`);\n      return false;", to: "      ui.notifications.warn(`${actionName}: ${blocked}`);\n      return true;", breaks: "B2" },
  { name: "an empty pool's spend reports success", file: APW, from: "has none left this turn.`);\n    return false;", to: "has none left this turn.`);\n    return true;", breaks: "B2" },
  { name: "the offer counts reactions only", file: FRW, from: "    return !(reaction && reactionRefusal(actor, String(item.system?.traits ?? \"\")));", to: "    return true;", breaks: "B3" },
  { name: "THE DEFECT: the reroll is made though the reaction was refused", file: FRW, from: "  if (row.reaction && inCombat && !(await spendReaction(actor, row.label, { traits: String(row.item.system?.traits ?? \"\") }))) return null;", to: "  if (row.reaction && inCombat) await spendReaction(actor, row.label);", breaks: "B4" },
  { name: "modules cannot reach the spend", file: APIW, from: "      spendReaction: async (...args) => { const { spendReaction } = await import(\"./combat/action-points-workflow.mjs\"); return spendReaction(...args); },\n", to: "", breaks: "B5" },
  // C
  { name: "THE DEFECT: each creature of a shared roll is asked", file: CK, from: "  if (check.presetDice) {\n    check.convictionDecided = true;", to: "  if (false) {\n    check.convictionDecided = true;", breaks: "C1" },
  { name: "the shared die is dropped", file: CK, from: "      check.applyExtraModifier({ label: \"Conviction (+1d6, the shared roll's)\", value: check.presetConvictionDie, type: \"untyped\" });\n", to: "", breaks: "C2" },
  { name: "the first die is not recorded", file: CK, from: "  check.convictionDie = roll.total;\n", to: "", breaks: "C3" },
  { name: "resolveAction keeps the die", file: ACW, from: "    ...(presetDice ? { presetDice, presetConvictionDie } : {}),", to: "    ...(presetDice ? { presetDice } : {}),", breaks: "C4" },
  // D
  { name: "an exact first is never known", file: DF, from: "  const row = rowsFor(carriers, actionKey).find((r) => r.exact === true && DEGREE_ORDER.includes(norm(r.set)));", to: "  const row = null;", breaks: "D1" },
  { name: "a spent first still counts", file: DF, from: "export function dailyFirstExact(carriers, actionKey, spent = false) {\n  if (spent) return null;\n", to: "export function dailyFirstExact(carriers, actionKey, spent = false) {\n", breaks: "D1" },
  { name: "THE DEFECT: conviction is asked on dice not read", file: ACW, from: "    ...(exactFirst ? { allowConviction: false, declaredDegree: exactDegree } : {}),\n", to: "", breaks: "D2" },
  // E
  { name: "THE DEFECT: a paused move is charged", file: MW, from: "  if (movePausedForUser(globalThis.game)) return true;\n", to: "", breaks: "E1" },
  { name: "the GM's paused move is let through uncharged", file: MW, from: "  return Boolean(gameLike?.paused) && !gameLike?.user?.isGM;", to: "  return Boolean(gameLike?.paused);", breaks: "E1" },
  // F
  { name: "THE DEFECT: Aid Another is nameless", file: SK, from: "    actionKey: \"aidAnother\",\n", to: "", breaks: "F1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3669-1.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3669-1: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3669-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3669-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
