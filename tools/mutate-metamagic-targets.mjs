#!/usr/bin/env node
/** mutate-metamagic-targets — the mutation half of verify-metamagic-targets. NEW at 3.717.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const MM = m("magic", "metamagic.mjs"), MT = m("magic", "metamagic-targets.mjs"), TI = m("magic", "spell-trait-immunity.mjs");
const CW = m("magic", "cast-workflow.mjs"), SW = m("magic", "spell-warp.mjs"), TG = m("magic", "tradition-gate.mjs");
const SS = m("magic", "selective-spell-workflow.mjs"), PR = m("data", "pack-repairs.mjs"), MG = m("migration.mjs");
const MUTATIONS = [
  // A — Aligned Spell
  { name: "Aligned is offered to every tradition", file: MM, from: `  if (has("aligned spell") && /divinity/i.test(casterTrad)) {`, to: `  if (has("aligned spell")) {`, breaks: "A2" },
  { name: "a pair costs what one does", file: MM, from: "pairs.push({ value: `${a}+${b}`, ppCost: 2,", to: "pairs.push({ value: `${a}+${b}`, ppCost: 1,", breaks: "A3" },
  { name: "balance is offered", file: MM, from: `const ALIGNED_SPELL_TRAITS = Object.freeze(["chaos", "evil", "good", "order"]);`, to: `const ALIGNED_SPELL_TRAITS = Object.freeze(["balance", "chaos", "evil", "good", "order"]);`, breaks: "A4" },
  { name: "the chosen traits never reach the cast", file: MM, from: `      if (o.select === "aligned") agg.alignedTraits = alignedChoiceTraits(value);\n`, to: "", breaks: "A5" },
  { name: "a second trait is dropped", file: MM, from: `.split("+").map((t) => t.trim())`, to: `.split("+").slice(0, 1).map((t) => t.trim())`, breaks: "A6" },
  { name: "Aligned prunes nobody", file: MT, from: "    if (wanted.some((t) => carried.has(t))) kept.push(actor);", to: "    if (true) kept.push(actor);", breaks: "A8" },
  { name: "both traits are needed", file: MT, from: "    if (wanted.some((t) => carried.has(t))) kept.push(actor);", to: "    if (wanted.every((t) => carried.has(t))) kept.push(actor);", breaks: "A10" },
  { name: "no trait chosen prunes everyone", file: MT, from: "  if (!wanted.length) return { kept: list, skipped: [] };\n", to: "", breaks: "A11" },
  // I — Imposing Will
  { name: "the type never reaches the cast", file: MM, from: `      if (o.select === "imposingWill") agg.imposingType = value;\n`, to: "", breaks: "I2" },
  { name: "any immunity is overcome", file: MT, from: "  return Boolean(ofType) && IMPOSING_WILL_TRAITS.includes(String(trait ?? \"\").toLowerCase());", to: "  return Boolean(ofType);", breaks: "I4" },
  { name: "any type is let through", file: MT, from: "  return Boolean(ofType) && IMPOSING_WILL_TRAITS", to: "  return true && IMPOSING_WILL_TRAITS", breaks: "I4" },
  { name: "the gate ignores the feat", file: TI, from: `    if (trait && typeof imposes === "function" && imposingWillOvercomes(trait, imposes(actor))) {`, to: "    if (false) {", breaks: "I6" },
  { name: "the let-through are not named", file: TI, from: "      imposed.push({ name: actor.name, trait });\n", to: "", breaks: "I6" },
  { name: "the early gate never waits", file: MT, from: `  return owns && /\\bmental\\b/i.test(String(spellData?.traits ?? ""));`, to: "  return false;", breaks: "I7" },
  // S — Selective
  { name: "Selective is a plain count again", file: MM, from: "ppCost: 1, max: Math.max(1, Math.floor(Number(casterLevel) || 0) + 1), kind: \"selective\",", to: "ppCost: 1, max: Math.max(1, Math.floor(Number(casterLevel) || 0) + 1),", breaks: "S1" },
  { name: "the count is not carried", file: MM, from: "        agg.selectiveCount = times;\n", to: "", breaks: "S2" },
  { name: "too many are trimmed", file: MT, from: "  if (excluded.length > Math.max(0, Math.trunc(Number(max) || 0))) return { kept: list, excluded: [], over: true };\n", to: "", breaks: "S4" },
  { name: "the dialog takes too many", file: SS, from: "    if (!result.over) return { kept: result.kept, excluded: result.excluded };", to: "    return { kept: result.kept, excluded: result.excluded };", breaks: "W15" },
  { name: "Cancel is a refusal", file: SS, from: `{ action: "cancel", label: "Exclude nobody", callback: () => resolve([]) }`, to: `{ action: "cancel", label: "Exclude nobody", callback: () => resolve(null) }`, breaks: "W16" },
  // X — Split
  { name: "the extra targets are not carried", file: MM, from: "        agg.splitExtra = times;\n", to: "", breaks: "X2" },
  { name: "the die is not stepped", file: MT, from: "(_m, count, faces) => `${count}d${stepDownDieSize(Number(faces), n)}`", to: "(_m, count, faces) => `${count}d${faces}`", breaks: "X3" },
  { name: "the type is lost", file: MT, from: "  return { ...row, formula: stepDownDamageFormula(row.formula, steps) };", to: "  return { formula: stepDownDamageFormula(row.formula, steps) };", breaks: "X6" },
  { name: "the cap is not raised", file: MT, from: "  return Number(cap) + add;", to: "  return Number(cap);", breaks: "X7" },
  { name: "an open cap is closed", file: MT, from: "  if (cap == null || !Number.isFinite(Number(cap))) return cap;\n", to: "", breaks: "X7" },
  // G, T — the warps
  { name: "a warp's save is dropped", file: SW, from: "    if (m.defence) mods.defence = String(m.defence);\n", to: "", breaks: "G1" },
  { name: "a warp's tradition is dropped", file: SW, from: "    if (m.onlyTradition) mods.onlyTradition = [...(mods.onlyTradition ?? []), String(m.onlyTradition).toLowerCase()];\n", to: "", breaks: "G1" },
  { name: "a second chooser drops the tradition", file: SW, from: "      onlyTradition: [...new Set([...(a.mods?.onlyTradition ?? []), ...(b.mods?.onlyTradition ?? [])])],", to: "      onlyTradition: [...(b.mods?.onlyTradition ?? [])],", breaks: "G3" },
  { name: "every caster may buy it", file: TG, from: "    if (!own.includes(stem)) {", to: "    if (false) {", breaks: "T2" },
  { name: "divinity is not divine", file: TG, from: `    const stem = t.replace(/ity$|e$/, "");`, to: "    const stem = t;", breaks: "T3" },
  // C — the caster's tradition
  { name: "Distant reads the spell's list again", file: MM, from: "  const isEthereal = /ethereal/i.test(casterTrad);", to: "  const isEthereal = /ethereal/i.test(String(tradition ?? \"\"));", breaks: "C1" },
  { name: "Aligned reads the spell's list again", file: MM, from: "  if (has(\"aligned spell\") && /divinity/i.test(casterTrad)) {", to: "  if (has(\"aligned spell\") && /divinity/i.test(String(tradition ?? \"\"))) {", breaks: "C3" },
  { name: "no fallback to the cast's tradition", file: MM, from: "  const casterTrad = String(casterTradition ?? tradition ?? \"\");", to: "  const casterTrad = String(casterTradition ?? \"\");", breaks: "C4" },
  { name: "the cast does not name the caster's tradition", file: CW, from: "    casterTradition: String(system.magic?.tradition ?? \"\"),\n", to: "", breaks: "C5" },
  // 3.717.1 — the live test's three
  { name: "the extra targets take the full die", file: CW, from: "damageOverride: splitDamage ?? damageForCast, dieSteps: splitBought,", to: "damageOverride: splitDamage ?? damageForCast,", breaks: "W17" },
  { name: "the critical's dice are not stepped", file: CW, from: "  const critFormula = dieSteps > 0 && critRaw ? (splitDamageRow({ formula: critRaw }, dieSteps)?.formula ?? critRaw) : critRaw;", to: "  const critFormula = critRaw;", breaks: "W18" },
  { name: "the note's full stop is back", file: MT, from: "immunity to the ${imposed[0]?.trait ?? \"mental\"} trait`;", to: "immunity to the ${imposed[0]?.trait ?? \"mental\"} trait.`;", breaks: "I9" },
  { name: "the stale note stays on owned copies", file: PR, from: `    to: [{"kind":"defence","target":"self","field":"immunity","value":"stunned"}],`, to: `    to: [{"kind":"defence","target":"self","field":"immunity","value":"stunned"},{"kind":"note","text":"x"}],`, breaks: "R4" },
  // R — the owned copies
  { name: "Geas's copies are left stale", file: PR, from: `    id: "geas-warps-3717", pack: "spells", name: "Geas",`, to: `    id: "geas-warps-3717x", pack: "spells", name: "Geas",`, breaks: "R1" },
  { name: "the pack-copy pass is not re-gated", file: MG, from: `  const packCopies = (await runIf("3.718.0",`, to: `  const packCopies = (await runIf("3.716.0",`, breaks: "R3" },
  // W — the wiring
  { name: "the early gate refuses before Imposing Will is bought", file: CW, from: "&& !storingNow && !imposingWillDeferred) {", to: "&& !storingNow) {", breaks: "W1" },
  { name: "the late gate ignores the type", file: CW, from: "          imposes: mm.imposingType ? (a) => isOfKind(a.system, mm.imposingType) : null\n", to: "", breaks: "W2" },
  { name: "a targeted cast with nobody left goes ahead", file: CW, from: "          for (const miss of passedBy) ui.notifications.warn(`${spell.name}: ${miss.reason}.`);\n          return null;", to: "          for (const miss of passedBy) ui.notifications.warn(`${spell.name}: ${miss.reason}.`);", breaks: "W4" },
  { name: "Split's cap is the spell's own", file: CW, from: "cap: splitTargetCap(targetCapFor(apMode?.targets ?? spellData?.targets, warp.mods, casterLevel), mm.splitExtra),", to: "cap: targetCapFor(apMode?.targets ?? spellData?.targets, warp.mods, casterLevel),", breaks: "W6" },
  { name: "an area ignores the type", file: CW, from: "          imposes: mm.imposingType ? (a) => isOfKindForWill(a.system, mm.imposingType) : null\n", to: "", breaks: "W7" },
  { name: "an area ignores the alignment", file: CW, from: "          areaTargets = areaAligned.kept;\n", to: "", breaks: "W8" },
  { name: "Selective is never asked", file: CW, from: "        if (mm.selectiveCount > 0 && areaTargets.length) {", to: "        if (false) {", breaks: "W9" },
  { name: "the first target takes the full die", file: CW, from: "      damageOverride: splitDamage ?? damageForCast,\n      dieSteps: splitBought,\n      splashSaveDC: nominalSaveDC,", to: "      damageOverride: damageForCast,\n      dieSteps: splitBought,\n      splashSaveDC: nominalSaveDC,", breaks: "W10" },
  { name: "each extra is a fresh attack for MAP", file: CW, from: "targetOverride: target, mapCount: splitMapCount, deferMapAdvance: true,", to: "targetOverride: target, mapCount: null, deferMapAdvance: false,", breaks: "W11" },
  { name: "every target is an extra", file: CW, from: ".slice(1, 1 + splitBought)", to: ".slice(1)", breaks: "W12" },
  { name: "the warp's save is never rolled", file: CW, from: "const castDefence = effDefence ?? warpDefenceOf(warpMods) ?? spellData.defence;", to: "const castDefence = effDefence ?? spellData.defence;", breaks: "W13" },
  { name: "the tradition is not asked", file: CW, from: `      ...warpTraditionRefusals(warpMods?.onlyTradition ?? [], system.magic?.tradition ?? "")\n`, to: "", breaks: "W14" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-metamagic-targets.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-metamagic-targets: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-metamagic-targets: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-metamagic-targets: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
