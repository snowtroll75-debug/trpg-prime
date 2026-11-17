#!/usr/bin/env node
/** mutate-fixes-3688-1 — the mutation half of verify-fixes-3688-1 (3.688.1: a specialist spell released from an item inherits its caster's tradition). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CIW = path.join(SYSTEM_ROOT, "module", "charged-items-workflow.mjs");
const CI = path.join(SYSTEM_ROOT, "module", "charged-items.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "the owned copy is read as recorded", file: CIW, from: "  if (owned) return inherit(owned.system?.tradition ?? \"\");", to: "  if (owned) return owned.system?.tradition ?? \"\";" },
  { name: "the compendium's is read as recorded", file: CIW, from: "  return hit ? inherit(hit.system?.tradition ?? \"\") : \"\";", to: "  return hit?.system?.tradition ?? \"\";" },
  { name: "a spell not found takes the caster's", file: CIW, from: "  return hit ? inherit(hit.system?.tradition ?? \"\") : \"\";", to: "  return inherit(hit?.system?.tradition ?? \"\");" },
  { name: "the caster's tradition always wins", file: CIW, from: "  const inherit = (own) => effectiveSpellTradition(own, actor?.system?.magic?.tradition);", to: "  const inherit = (own) => String(actor?.system?.magic?.tradition ?? \"\");" },
  { name: "a High Magic caster is not read", file: CI, from: "    || (Boolean(highMagicCaster) && spellTraditions.length > 0);", to: ";" },
  { name: "a High Magic caster takes a spell with no tradition", file: CI, from: "    || (Boolean(highMagicCaster) && spellTraditions.length > 0);", to: "    || Boolean(highMagicCaster);" },
  { name: "the release never asks", file: CIW, from: "...castFromItemOptions({ spellPPCost: cost, spellTradition, highMagicCaster, ...context }),", to: "...castFromItemOptions({ spellPPCost: cost, spellTradition, ...context }),"},
  { name: "any High Magic cast counts (a Highmagic spell, a creature)", file: CIW, from: "traits: \"\" }).source === \"caster\";", to: "traits: \"\" }).highMagic;" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.696.3\"", to: "\"version\": \"3.688.0\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3688-1.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-fixes-3688-1: verify-fixes-3688-1 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3688-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3688-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
