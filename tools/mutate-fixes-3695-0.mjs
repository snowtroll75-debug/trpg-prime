#!/usr/bin/env node
/** mutate-fixes-3695-0 — the mutation half of verify-fixes-3695-0 (3.695.0: the Pillars of Faith audit's core findings). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const COND = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const CURE = path.join(SYSTEM_ROOT, "module", "affliction-countered.mjs");
const SFX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const SDC = path.join(SYSTEM_ROOT, "module", "magic", "spell-dc-bonus.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "the invested gate removed", file: COND, from: "  if (hasInvestedTrait(item) && !item?.system?.invested) return false;\n", to: "" },
  { name: "the gate reads equipped for invested", file: COND, from: "  if (hasInvestedTrait(item) && !item?.system?.invested) return false;", to: "  if (hasInvestedTrait(item) && !item?.system?.equipped) return false;" },
  { name: "the trait read as a substring of nothing", file: COND, from: '.includes("invested");', to: '.includes("investedx");' },
  { name: "Mummy Rot not reached by Remove Curse", file: CURE, from: "  return (cureSequenceOf(item) ?? []).some((k) => want.includes(k));", to: "  return false;" },
  { name: "a failed first step recorded as a success", file: CURE, from: "    steps[step] = Boolean(succeeded);", to: "    steps[step] = true;" },
  { name: "the last step ignores the earlier ones", file: CURE, from: "  return { step, last, ends: Boolean(succeeded) && earlier, steps: {} };", to: "  return { step, last, ends: Boolean(succeeded), steps: {} };" },
  { name: "Fiends & Fables' copy not known by name", file: CURE, from: '  return /\\bmummy rot\\b/i.test(String(item?.name ?? "")) ? ["curse", "disease"] : null;', to: "  return null;" },
  { name: "the counteract ignores the sequence", file: SFX, from: "          const ordered = cureStepOutcome(chosen, kinds, succeeded);", to: "          const ordered = null;" },
  { name: "Remove Curse's effect row never stands down", file: SFX, from: "          if (effect.skipIfCured && curedThisCast.has(target.uuid)) break;\n", to: "" },
  { name: "the attack bonus reads the DC flag", file: SDC, from: '  return declaredSpellBonuses(effects, "spellAttackBonus", spellTraits, { innate, itemCast });', to: '  return declaredSpellBonuses(effects, "spellDCBonus", spellTraits, { innate, itemCast });' },
  { name: "an item's spell takes every row", file: SDC, from: "      if (itemCast === true && row?.itemCasts !== true) continue;\n", to: "" },
  { name: "innateOnly ignored", file: SDC, from: "      if (row?.innateOnly === true && innate !== true) continue;\n", to: "" },
  { name: "the attack pool drops the declared rows", file: CW, from: "      .concat(Array.isArray(declaredAttackRows) ? declaredAttackRows : []), {});", to: "      , {});" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.719.1\"", to: "\"version\": \"3.694.0\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3695-0.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-fixes-3695-0: verify-fixes-3695-0 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3695-0: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3695-0: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
