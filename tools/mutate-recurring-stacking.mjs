#!/usr/bin/env node
/** mutate-recurring-stacking — the mutation half of verify-recurring-stacking. NEW at 3.685.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RC = m("conditions", "recurring.mjs"), RW = m("conditions", "recurring-workflow.mjs"), AC = m("documents", "actor.mjs"),
  EA = m("combat", "effect-application-workflow.mjs"), CB = m("documents", "combat.mjs"), AL = m("alchemical-workflow.mjs"),
  API = m("module-api-workflow.mjs"), SH = m("sheets", "actor-sheet.mjs"), CRU = m("conditions", "condition-rules.mjs"),
  AW = m("combat", "attack-workflow.mjs"), CW = m("magic", "cast-workflow.mjs");
const MUTATIONS = [
  { name: "THE OLD RULE: the same type keeps the higher", file: RC, from: "  const value = combinedConditionValue(\"recurring\", before, added);", to: "  const value = Math.max(before, added);", breaks: "R1/R4/R5" },
  { name: "THE OLD RULE: another type replaces", file: RC, from: "    before = recurringType(existing.damageType) === type ? Number(existing.value) || 0 : 0;", to: "    before = Number(existing.value) || 0;", breaks: "R1" },
  { name: "untyped is not fire", file: RC, from: "  return t || DEFAULT_RECURRING_TYPE;", to: "  return t;", breaks: "R1/R2" },
  { name: "the totals are not grouped by a normalised type", file: RC, from: "    const type = recurringType(entry?.damageType);\n    const group", to: "    const type = String(entry?.damageType);\n    const group", breaks: "R2" },
  { name: "a disabled recurring effect is read", file: RC, from: "    if (!effect || effect.disabled) continue;\n    const statuses", to: "    if (!effect) continue;\n    const statuses", breaks: "R2" },
  { name: "the toggle finds any recurring effect, whatever its type", file: AC, from: "        && recurringType(effect.getFlag?.(\"trg-prime\", \"damageType\")) === want\n", to: "\n", breaks: "R3/R4/R5" },
  { name: "the toggle never looks by type", file: AC, from: "    const existing = statusId === \"recurring\" && options.damageType !== undefined && options.damageType !== null\n      ? this.#findRecurringEffect(options.damageType)\n      : this.#findConditionEffect(statusId);", to: "    const existing = this.#findConditionEffect(statusId);", breaks: "R3" },
  { name: "a removal with no type ends only the first", file: AC, from: "        const all = this.effects.filter((e) => !e.disabled && e.statuses?.has?.(\"recurring\"));", to: "        const all = this.effects.filter((e) => !e.disabled && e.statuses?.has?.(\"recurring\")).slice(0, 1);", breaks: "R3" },
  { name: "a tag reads every type's total as its own", file: EA, from: "      const existingValue = recurringTag\n        ? recurringHere\n", to: "      const existingValue = recurringTag\n        ? Number(actor.getConditionValue?.(tag.key) ?? 0)\n", breaks: "R4" },
  { name: "an untyped tag edits whichever recurring effect comes first", file: EA, from: "        ...(recurringTag && !tag.damageType ? { damageType: \"fire\" } : {}),\n", to: "", breaks: "R4a/R6c" },
  { name: "bleeding keeps the higher", file: CRU, from: "const ADDING_CONDITION_IDS = Object.freeze([\"bleeding\", ", to: "const ADDING_CONDITION_IDS = Object.freeze([", breaks: "R4b/R4c" },
  { name: "layRecurring hands the relay nothing", file: RW, from: "  if (typeof apply === \"function\") await apply(options);", to: "  if (typeof apply === \"function\") await apply({});", breaks: "R5" },
  { name: "a bomb lays it by the old toggle", file: AL, from: "      const next = await layRecurring(targetActor, amount, damageType);", to: "      const next = { value: amount, damageType, before: 0, added: amount, stacked: false };", breaks: "R6" },
  { name: "a weapon's recurring +N skips the rule", file: AW, from: "  const next = await layRecurring(targetActor, amount, damageType);\n  return `Plus", to: "  const next = { value: amount, damageType };\n  return `Plus", breaks: "R6" },
  { name: "a ladder rung skips the rule", file: CW, from: "          const nextRecurring = await layRecurring(target, rungPersistAmount, ladderType);", to: "          const nextRecurring = { value: rungPersistAmount, damageType: ladderType };", breaks: "R6" },
  { name: "the helper skips the GM's relay", file: API, from: "          apply: (options) => relayStatus(target, \"recurring\", options, () => target.toggleStatusEffect(\"recurring\", options))", to: "          apply: (options) => target.toggleStatusEffect(\"recurring\", options)", breaks: "R6b" },
  { name: "the end phase deals each effect, not each type", file: CB, from: "    const recurringTotals = recurringByType(recurrings);", to: "    const recurringTotals = recurrings.map((r) => ({ ...r, effects: [r.effect] }));", breaks: "R7" },
  { name: "armour reduces recurring damage", file: CB, from: "        amount: entry.value,\n        type: entry.damageType || \"fire\",\n        applyDR: false,", to: "        amount: entry.value,\n        type: entry.damageType || \"fire\",\n        applyDR: true,", breaks: "R7" },
  { name: "a success ends one effect of the type", file: CB, from: "        for (const effect of entry.effects) await effect.delete();", to: "        await entry.effects[0]?.delete();", breaks: "R7" },
  { name: "a type's lever eases every type", file: RC, from: "  const general = Array.from(effects ?? []).filter((e) => e && !e.disabled && !isRecurring(e)).reduce((n, e) => n + lever(e), 0);", to: "  const general = Array.from(effects ?? []).filter((e) => e && !e.disabled).reduce((n, e) => n + lever(e), 0);", breaks: "R7d" },
  { name: "a type's own lever is not read", file: RC, from: "  const own = (group?.effects ?? []).filter((e) => e && !e.disabled).reduce((n, e) => n + lever(e), 0);", to: "  const own = 0;", breaks: "R7d" },
  // REVIEW (3.685.0)
  { name: "R9 THE REVIEW'S DEFECT: healing settles the recurring sum, whatever its type", file: m("injury-workflow.mjs"), from: "      if (condition.key === \"recurring\") {\n        const { recurringEntries", to: "      if (false) {\n        const { recurringEntries", breaks: "R9/R9b" },
  { name: "R9 the record drops the type", file: m("injury-workflow.mjs"), from: "    ? { key: a.key, value: a.added ?? a.value ?? 0, damageType: a.damageType ?? \"\" }", to: "    ? { key: a.key, value: a.added ?? a.value ?? 0 }", breaks: "R9/R9c" },
  { name: "R9 the record takes the total, not what was added", file: m("injury-workflow.mjs"), from: "    ? { key: a.key, value: a.added ?? a.value ?? 0, damageType: a.damageType ?? \"\" }", to: "    ? { key: a.key, value: a.value ?? 0, damageType: a.damageType ?? \"\" }", breaks: "R9/R9c" },
  { name: "R9 the relayed record loses its type", file: m("injury-workflow.mjs"), from: "      conditions: conditions.map((c) => ({ key: String(c.key), value: Number(c.value) || 0, ...(c.damageType ? { damageType: String(c.damageType) } : {}) })),", to: "      conditions: conditions.map((c) => ({ key: String(c.key), value: Number(c.value) || 0 })),", breaks: "R9" },
  { name: "R9 the tag reports no increment", file: EA, from: "        ...(recurringTag ? { added: Math.max(0, newValue - existingValue),", to: "        ...(recurringTag ? { added: newValue,", breaks: "R9" },
  { name: "R10 THE OLD DEFECT: every automated write puts the lever back to 0", file: AC, from: "        ...(leverKey && leverGiven\n", to: "        ...(leverKey\n", breaks: "R10" },
  { name: "R10 a typeless write re-types the effect as fire", file: AC, from: "    if (id === \"recurring\" && !damageType) damageType = recurringType(existing?.getFlag?.(\"trg-prime\", \"damageType\"));", to: "    if (id === \"recurring\" && !damageType) damageType = \"fire\";", breaks: "R10" },
  { name: "R11 a typeless reduce takes the first type, not the largest", file: RW, from: "    : [...groups].sort((a, b) => b.value - a.value)[0];", to: "    : groups[0];", breaks: "R11" },
  { name: "R11 the helper writes the sum onto one effect again", file: m("feats-workflow.mjs"), from: "    if (String(key) === \"recurring\") {\n      const { reduceRecurring }", to: "    if (false) {\n      const { reduceRecurring }", breaks: "R11b" },
  { name: "R12 an unknown type is called Fire", file: RC, from: "  return damageTypes?.[t]?.label ?? `${t.charAt(0).toUpperCase()}${t.slice(1)}`;", to: "  return damageTypes?.[t]?.label ?? \"Fire\";", breaks: "R12" },
  { name: "the sheet's step-down ends every type", file: SH, from: "    if (next < 1) return this.actor.toggleStatusEffect(conditionId, { active: false, damageType: rowType });", to: "    if (next < 1) return this.actor.toggleStatusEffect(conditionId, { active: false });", breaks: "R8" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-recurring-stacking.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-recurring-stacking: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-recurring-stacking: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-recurring-stacking: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
