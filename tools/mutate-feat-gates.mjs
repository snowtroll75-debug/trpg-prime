#!/usr/bin/env node
/**
 * mutate-feat-gates — the mutation half of verify-feat-gates: each entry breaks one
 * rule the suite exists to hold, and the suite must go red for every one.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = path.join(SYSTEM_ROOT, "module", "module-api.mjs");
const P = path.join(SYSTEM_ROOT, "module", "picker-filters.mjs");
const S = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const I = path.join(SYSTEM_ROOT, "module", "documents", "item.mjs");
const W = path.join(SYSTEM_ROOT, "module", "module-api-workflow.mjs");
const MUTATIONS = [
  { name: "owning an opener does not open the gate", file: M, from: "    if (![...opens].some((n) => owned.has(n))) return { trait, needs: [...opens] };", to: "    return { trait, needs: [...opens] };", breaks: "B2 B4 D2" },
  { name: "the first ungated trait ends the search", file: M, from: "    if (!opens) continue;\n    // A FEAT THAT OPENS", to: "    if (!opens) return null;\n    // A FEAT THAT OPENS", breaks: "B3" },
  { name: "an opener is kept behind its own trait", file: M, from: "    if (self && opens.has(self)) continue;\n", to: "", breaks: "B8 D3b" },
  { name: "a feat conflicts with itself", file: M, from: "      return k !== feat && feats.has(k);", to: "      return feats.has(k);", breaks: "C4" },
  { name: "the override is ignored", file: M, from: "  if (options?.trgAllowExclusiveFeat) return null;\n", to: "", breaks: "C7" },
  { name: "a group of one is accepted", file: M, from: "  if (!key || names.length < 2) {", to: "  if (!key || names.length < 1) {", breaks: "C2" },
  { name: "the picker skips the gate", file: P, from: "    if (featGateBlock(entry?.system?.traits, owned, entry?.name)) return false;\n", to: "", breaks: "D1" },
  { name: "the picker skips the exclusive group", file: P, from: "    if (exclusiveFeatConflict(entry?.name, owned)) return false;\n", to: "", breaks: "D3" },
  { name: "the base filter is ignored", file: P, from: "    if (baseFilter && !baseFilter(entry)) return false;\n    if (featGateBlock", to: "    if (featGateBlock", breaks: "D4" },
  { name: "module packs are not counted as owned", file: P, from: "    if (id && !prefixes.includes(`Compendium.${id}.`)) prefixes.push(`Compendium.${id}.`);", to: "", breaks: "E2 E3" },
  { name: "the sheet chain loses the gates", file: S, from: "withFeatGates(withOwnedExclusion(buildPickerFilter(slotKey, context), this.actor, slotKey), this.actor, slotKey)", to: "withOwnedExclusion(buildPickerFilter(slotKey, context), this.actor, slotKey)", breaks: "F1" },
  { name: "the module helper skips the relay", file: W, from: "        return relayConditionTags(target, tags, options, () => applyConditionTags(target, tags, options));", to: "        return applyConditionTags(target, tags, options);", breaks: "F4" },
  { name: "creation does not refuse", file: I, from: "    if (this._refusedAsExclusiveFeat(options)) return false;\n", to: "", breaks: "F2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-feat-gates.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([M, P, S, I, W]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-feat-gates: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-feat-gates: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-feat-gates: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
