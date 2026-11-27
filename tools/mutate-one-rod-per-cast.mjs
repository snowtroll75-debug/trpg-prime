#!/usr/bin/env node
/** mutate-one-rod-per-cast — the mutation half of verify-one-rod-per-cast (3.691.0: one Rod a cast). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TR = path.join(SYSTEM_ROOT, "module", "trait-rules.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const MMW = path.join(SYSTEM_ROOT, "module", "magic", "module-metamagic-workflow.mjs");
const CO = path.join(SYSTEM_ROOT, "module", "magic", "cast-options.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const PJ = path.join(SYSTEM_ROOT, "package.json");
const MUTATIONS = [
  { name: "A two rods allowed", file: TR, from: "  if (named.size <= 1) return \"\";", to: "  if (named.size <= 2) return \"\";" },
  { name: "A one rod's two powers counted twice", file: TR, from: "    if (id && !named.has(id)) named.set(id,", to: "    if (id) named.set(id + named.size," },
  { name: "A another rod is this rod", file: TR, from: "(r) => r?.itemId && String(r.itemId) !== id)", to: "(r) => r?.itemId)" },
  { name: "B two metamagic rods let through", file: CW, from: "  const castRods = (mm.rodSpends ?? []).map((s) => ({ itemId: s.itemId, name: s.name }));\n  {\n    const refusedRods = castRodsRefusal(castRods);\n    if (refusedRods) {", to: "  const castRods = (mm.rodSpends ?? []).map((s) => ({ itemId: s.itemId, name: s.name }));\n  {\n    const refusedRods = castRodsRefusal(castRods);\n    if (false) {" },
  { name: "B the Magi's draw offered after a rod this round", file: CW, from: "rodCandidate && !rodRefusedNow(actor, { fromItemCast: isItemCast }) && !otherCastRod", to: "rodCandidate && !otherCastRod" },
  { name: "B the Magi's draw offered beside a metamagic rod", file: CW, from: " && !otherCastRod(castRods, rodCandidate.itemId)\n", to: "\n" },
  { name: "B the draw not counted", file: CW, from: "    if (rodDraw > 0) castRods.push({ itemId: rodSource.itemId, name: rodSource.name });\n", to: "" },
  { name: "B the sources not told", file: CW, from: "metamagic: castMetamagic.keys,\n      // THE RODS THIS CAST HAS TAKEN (3.691.0), so a module's rod (Ley\n      // Resonance) is not offered beside another.\n      rodsThisCast: castRods.map((r) => ({ ...r }))", to: "metamagic: castMetamagic.keys" },
  { name: "B a source's rod not counted", file: CW, from: "  for (const d of ppSources.draws) if (d.rodItemId && d.drawn > 0) castRods.push(", to: "  for (const d of []) if (d.rodItemId && d.drawn > 0) castRods.push(" },
  { name: "B the options not told", file: CW, from: "    holding: holdingNow,\n    // THE RODS THIS CAST HAS TAKEN (3.691.0): a module's rod option is not\n    // offered or applied beside another.\n    rodsThisCast: castRods.map((r) => ({ ...r }))", to: "    holding: holdingNow" },
  { name: "B an option's rod not counted", file: CW, from: "  castRods.push(...castOptionsApplied.rods);", to: "" },
  { name: "B the accuracy rod offered beside another", file: CW, from: "const accuracyRod = accuracyCandidate && !otherCastRod(castRods, accuracyCandidate.itemId) ? accuracyCandidate : null;", to: "const accuracyRod = accuracyCandidate;" },
  { name: "C a source's rod not carried", file: MMW, from: ", rodItemId: text(offer.rodItemId), rodName: text(offer.rodName) });", to: " });" },
  { name: "C an option's rod not carried", file: CO, from: "    if (str(got?.rodItemId)) out.rods.push(", to: "    if (false) out.rods.push(" },
  { name: "D a metamagic rod offered after a Rod this round", file: CW, from: "    rods: mmRodsAllowed ? metamagicRodsOf(Array.from(actor.items ?? [])) : [],", to: "    rods: metamagicRodsOf(Array.from(actor.items ?? []))," },
  { name: "D a module's rod-paid metamagic offered after a Rod this round", file: MMW, from: "  const rods = rodUseRefusal(actor, { fromItemCast: Boolean(base.itemCast) }) ? [] : moduleMetamagicRodsOf(", to: "  const rods = moduleMetamagicRodsOf(" },
  { name: "D the Magi's draw offered while storing", file: CW, from: "stored || (storingNow && !holdingNow) || totalPP <= 0 || ritualSubstitutes)", to: "stored || totalPP <= 0 || ritualSubstitutes)" },
  { name: "D the Spell Adder use kept by a refused cast", file: CW, from: "      // cancel: it was spent a dialog ago, on a cast that is not happening.\n      if (spellAdderUsed) {", to: "      // cancel: it was spent a dialog ago, on a cast that is not happening.\n      if (false) {" },
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.717.1\"", to: "\"version\": \"3.690.1\"" },
  { name: "Z the download names the last release", file: SJ, from: "releases/download/v3.717.1/trg-prime.zip", to: "releases/download/v3.690.1/trg-prime.zip" },
  { name: "Z package.json is left behind", file: PJ, from: "\"version\": \"3.717.1\"", to: "\"version\": \"3.690.1\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-one-rod-per-cast.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-one-rod-per-cast: verify-one-rod-per-cast already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-one-rod-per-cast: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-one-rod-per-cast: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
