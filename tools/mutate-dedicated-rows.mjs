#!/usr/bin/env node
/** mutate-dedicated-rows — the mutation half of verify-dedicated-rows. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DR = m("combat", "dedicated-rows.mjs"), AW = m("combat", "action-workflow.mjs"), PM = m("pending-modifiers.mjs");
const DLG = m("apps", "check-dialog.mjs"), CHK = m("dice", "check.mjs"), MG = m("migration.mjs");
const TP = m("combat", "target-prompt.mjs"), TG = m("combat", "targeting.mjs"), LV = m("combat", "level-view-workflow.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const MUTATIONS = [
  { name: "KELDRAN: Detect Deception's row is queued again", file: DR, from: "  // sense-motive.mjs: the -4 against that target, until a Critical.\n  \"detectDeception\",\n", to: "", breaks: "A1" },
  { name: "Aid's bonus is queued on the aider again", file: DR, from: "  \"aidDefensive\",\n  \"aidOffensive\"\n", to: "  \"aidDefensive\"\n", breaks: "A1" },
  { name: "a module's outcomesApplied action is read", file: DR, from: "  if (!action || action.outcomesApplied) return false;", to: "  if (!action) return false;", breaks: "A2" },
  { name: "the workflow ignores the rule", file: AW, from: "const modifier = readsGenericModifier(action) ? extractModifier(outcome.text) : null;", to: "const modifier = action.outcomesApplied ? null : extractModifier(outcome.text);", breaks: "A4" },
  { name: "a row naming its action is offered everywhere", file: AW, from: "            ...(modifier.subject !== \"target\" && scopeNamesAction(modifier.scope, action.name) ? { actions: [action.key] } : {})\n", to: "", breaks: "B2" },
  { name: "every scope names every action", file: DR, from: "  return String(scope ?? \"\").toLowerCase().includes(name);", to: "  return true;", breaks: "B1" },
  { name: "an entry naming an action is offered on any check", file: DR, from: "  return !actions.length || actions.includes(String(actionKey ?? \"\"));", to: "  return true;", breaks: "B3" },
  { name: "the dialog offers everything", file: DLG, from: "pendingModifierRows(actor).filter((row) => pendingFitsCheck(row, actionKey))", to: "pendingModifierRows(actor)", breaks: "B4" },
  { name: "the record forgets its actions", file: PM, from: "  if (Array.isArray(entry?.actions) && entry.actions.length) record.actions = entry.actions.map(String);\n", to: "", breaks: "B5" },
  { name: "the stale copies are never found", file: DR, from: "    .filter((e) => scopes.get(String(e?.label ?? \"\"))?.has(String(e?.scope ?? \"\")))", to: "    .filter(() => false)", breaks: "C1" },
  { name: "every copy, the first included, is a duplicate", file: DR, from: "    if (seen.has(id)) out.push(String(entry.id));\n    else seen.add(id);", to: "    out.push(String(entry.id));", breaks: "C2" },
  { name: "next-roll entries are merged too", file: DR, from: "    if (entry?.oneShot || Number.isFinite(Number(entry?.turnsRemaining))) continue;", to: "    if (Number.isFinite(Number(entry?.turnsRemaining))) continue;", breaks: "C2" },
  { name: "the same lasting modifier is queued again", file: PM, from: "  if (same) return same;\n", to: "", breaks: "C4" },
  { name: "the migration pass is never run", file: MG, from: "    () => migrateStalePendingCopies(actors, tokenActors))) ?? [];", to: "    () => [])) ?? [];", breaks: "C5" },
  { name: "the stamp stays where it was", file: MG, from: "export const TRG_SCHEMA_VERSION = \"3.666.4\";", to: "export const TRG_SCHEMA_VERSION = \"3.666.1\";", breaks: "C6" },
  { name: "THE ORB COMPLAINT: no tokens is skipped in silence again", file: TG, from: "    return goOn === \"continue\";\n  }\n", to: "    return true;\n  }\n", breaks: "D3" },
  { name: "the active scene is not named", file: TP, from: "    ? ` The GM's active scene is ${activeName}.` : \"\";", to: "    ? \"\" : \"\";", breaks: "D1" },
  { name: "the canvas being off is not named", file: TP, from: "  if (canvasOff) {", to: "  if (false) {", breaks: "D2" },
  { name: "LEWI: the caster's level is never viewed", file: TP, from: "  if (!own || own.level === viewedLevel) return null;\n  return own.level;", to: "  return null;", breaks: "E1" },
  { name: "a client already on the right level is moved anyway", file: TP, from: "  if (!own || own.level === viewedLevel) return null;", to: "  if (!own) return null;", breaks: "E1" },
  { name: "an unlinked creature's actor is used, not its token", file: TP, from: "(tokenId ? t?.id === tokenId : t?.actorId === actorId)", to: "(t?.actorId === actorId)", breaks: "E2" },
  { name: "the level being viewed is offered as another", file: TP, from: "    if (!t?.level || t.level === viewedLevel) continue;", to: "    if (!t?.level) continue;", breaks: "E3" },
  { name: "the other level is not named", file: TP, from: "  if (otherLevels?.length) {", to: "  if (false) {", breaks: "E4" },
  { name: "the picker never moves to the caster's level", file: TG, from: "  if (!candidates.length && await viewActorLevel(actor)) {", to: "  if (false) {", breaks: "E5" },
  { name: "a level button views nothing", file: TG, from: "      await scene.view({ level: goOn.slice(\"level:\".length) });\n", to: "", breaks: "E5" },
  { name: "the GM is moved too", file: LV, from: "    if (!globalThis.game?.user || game.user.isGM) return;", to: "    if (!globalThis.game?.user) return;", breaks: "E6" },
  { name: "a player looking at their own token is moved anyway", file: LV, from: "    if (tokens.some((t) => t.isOwner && t.level === cnv.level.id)) return;\n", to: "", breaks: "E6" },
  { name: "a refused view is retried for ever", file: LV, from: "    if (tried.has(key)) return;\n", to: "", breaks: "E6" },
  { name: "the level view is never installed", file: BOOT, from: "  registerOwnLevelView();\n", to: "", breaks: "E6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-dedicated-rows.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-dedicated-rows: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-dedicated-rows: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-dedicated-rows: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
