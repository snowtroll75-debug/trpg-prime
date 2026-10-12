#!/usr/bin/env node
/**
 * mutate-live-fixes-3-627-1 — the mutation half of verify-live-fixes-3-627-1.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CM = m("dice", "check-modifiers.mjs"), DG = m("combat", "death-guard-workflow.mjs"), DW = m("combat", "declared-after-strikes-workflow.mjs");
const AU = m("creature-aura-workflow.mjs"), DB = m("drink-blood-workflow.mjs"), API = m("module-api-workflow.mjs");
const DA = m("combat", "declared-after-strikes.mjs"), JU = m("jumping.mjs"), AC = m("combat", "action-workflow.mjs");
const TR = m("combat", "target-relay.mjs"), TW = m("combat", "target-relay-workflow.mjs"), AT = m("combat", "attack-workflow.mjs");
const PR = m("data", "pack-repairs.mjs"), MI = m("migration.mjs");
const MUTATIONS = [
  { name: "a save named by `save` gets no subject", file: CM, from: "      out.subject = save;\n", to: "", breaks: "C1" },
  { name: "the sheet's rows are handed over by reference", file: CM, from: "  if (Array.isArray(stat?.checkModifiers)) return stat.checkModifiers.map((m) => ({ ...m }));", to: "  if (Array.isArray(stat?.checkModifiers)) return stat.checkModifiers;", breaks: "C2" },
  { name: "a save with no rows rolls nothing", file: CM, from: "  return [{ label: fallbackLabel, value: Number(stat?.total ?? 0) || 0, type: \"untyped\" }];", to: "  return [];", breaks: "C3" },
  { name: "a skill check is not made whole", file: CM, from: "    out.modifiers = skillCheckModifiers(system, out.subject);", to: "    out.modifiers = undefined;", breaks: "C4" },
  { name: "a caller's own modifiers are overwritten", file: CM, from: "      if (!Array.isArray(out.modifiers)) out.modifiers = saveCheckModifiers(system, save);", to: "      out.modifiers = saveCheckModifiers(system, save);", breaks: "C5" },
  { name: "the death guard rolls bare again", file: DG, from: "      const check = await TRGCheck.roll(withCheckModifiers({", to: "      const check = await TRGCheck.roll(({", breaks: "C7" },
  { name: "an after-strike save rolls bare again", file: DW, from: "  const check = await TRGCheck.roll(withCheckModifiers({\n    actor: targetActor,", to: "  const check = await TRGCheck.roll({\n    actor: targetActor,", breaks: "C8" },
  { name: "an aura save rolls bare again", file: AU, from: "  const check = await TRGCheck.roll(withCheckModifiers({", to: "  const check = await TRGCheck.roll(({", breaks: "C9" },
  { name: "Drink Blood's Athletics rolls bare again", file: DB, from: "    const check = await TRGCheck.roll(withCheckModifiers({", to: "    const check = await TRGCheck.roll(({", breaks: "C10" },
  { name: "a module's rollCheck rolls bare again", file: API, from: "        return (await import(\"./dice/check.mjs\")).TRGCheck.roll(withCheckModifiers(config));", to: "        return (await import(\"./dice/check.mjs\")).TRGCheck.roll(config);", breaks: "C11" },
  { name: "the exposure key keeps its dots", file: DA, from: "`${String(sourceUuid ?? \"\")}:${lower(affliction)}`.replace(/\\./g, \"_\");", to: "`${String(sourceUuid ?? \"\")}:${lower(affliction)}`;", breaks: "E1" },
  { name: "a leap pays the whole printed string", file: JU, from: "  return lead ? lead[1] : apCost;", to: "  return apCost;", breaks: "L1" },
  { name: "the leap spends the raw cost", file: AC, from: "          const leapCost = leapApCost(action.apCost);", to: "          const leapCost = action.apCost;", breaks: "L2" },
  { name: "the relay writes any kind it is sent", file: TR, from: "      if (!INJURY_RECORD_KINDS.includes(kind)) return { ok: false, reason: `not an injury record: ${kind}` };\n", to: "", breaks: "R3" },
  { name: "the Persistence record is written directly", file: AT, from: "      if (await relayInjuryRecord(targetActor, \"persistence\", persistenceEntry,\n        () => recordPersistence(targetActor, persistenceEntry))) {", to: "      if (await recordPersistence(targetActor, persistenceEntry)) {", breaks: "R4" },
  { name: "the Fatal mark is written directly", file: AT, from: "        await relayInjuryRecord(targetActor, \"fatal\", fatalEntry, () => markFatalInjury(targetActor, fatalEntry));", to: "        await markFatalInjury(targetActor, fatalEntry);", breaks: "R5" },
  { name: "a relay failure throws instead of saying so", file: TW, from: "  await announceRelayFailure(target, null, reply.reason, \"Injury record not written\");\n  return false;", to: "  throw new Error(reply.reason);", breaks: "R10" },
  { name: "a player's Death critical writes the dying directly", file: AT, from: "        await relayStatus(targetActor, \"dying\", { value: deadAt }, () =>\n          targetActor.toggleStatusEffect(\"dying\", { value: deadAt }));", to: "        await targetActor.toggleStatusEffect(\"dying\", { value: deadAt });", breaks: "R11" },
  { name: "the AP watch is armed directly", file: AT, from: "      await relayInjuryRecord(targetActor, \"apWatch\", watch, () => armApSpendWatch(targetActor, watch));", to: "      await armApSpendWatch(targetActor, watch);", breaks: "R12" },
  { name: "the GM drains whatever it is told", file: TW, from: "        const spent = Math.min(pool, Math.max(0, Math.floor(Number(entry.amount) || 0)));", to: "        const spent = Number(entry.amount);", breaks: "R14" },
  { name: "the owned-copy repair overwrites a house rule", file: PR, from: "    if (norm(current) === norm(from)) update[field] = foundry_clone(repair.to[field]);", to: "    update[field] = foundry_clone(repair.to[field]);", breaks: "U3" },
  { name: "\"racial\" stays an unknown type", file: m("conditionals.mjs"), from: "    if (entry.type === \"racial\") entry.type = \"race\";", to: "", breaks: "T1" },
  { name: "the migration never runs the pass", file: MI, from: "  const effectRepairs = (await runIf(\"3.627.1\",", to: "  const effectRepairs = (await runIf(\"3.400.0\",", breaks: "U6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-live-fixes-3-627-1.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-live-fixes-3-627-1: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-live-fixes-3-627-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-live-fixes-3-627-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
