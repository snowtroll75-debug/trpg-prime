#!/usr/bin/env node
/**
 * mutate-ff30-block22 — the mutation half of verify-ff30-block22 (3.655.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CA = m("combat", "compound-action.mjs"), CAW = m("combat", "compound-action-workflow.mjs"), CR = m("codex-action-rules.mjs"), CW = m("codex-actions-workflow.mjs"),
  PW = m("peril-workflow.mjs"), DAW = m("combat", "declared-after-strikes-workflow.mjs"), BC = m("bow-casting.mjs"), BW = m("bow-casting-workflow.mjs"),
  AW = m("combat", "attack-workflow.mjs"), CAST = m("magic", "cast-workflow.mjs"), DECL = path.join(SYSTEM_ROOT, "tools", "ff30-codex-declarations.mjs");
const MUTATIONS = [
  { name: "no claw, no strikes (what 3.654.0 did)", file: CA, from: "    if (!matches.length && row?.fallbackNatural) {", to: "    if (false) {", breaks: "B1" },
  { name: "a manufactured weapon stands in", file: CA, from: "w?.type === \"weapon\" && w?.system?.natural === true\n", to: "w?.type === \"weapon\"\n", breaks: "B1" },
  { name: "the stand-ins may be mixed", file: CA, from: "    const pickOne = row?.pickOne || (fallback && matches.length > 1);", to: "    const pickOne = row?.pickOne;", breaks: "B1" },
  { name: "the Codex does not ask for it", file: DECL, from: "separateTargets: true, fallbackNatural: true }", to: "separateTargets: true }", breaks: "B4" },
  { name: "the card is silent about the stand-in", file: CAW, from: "    if (standIn) notes.push(", to: "    if (false) notes.push(", breaks: "S5" },
  { name: "a death area that only exposes is dropped", file: CR, from: "(area.save || area.expose?.affliction)", to: "area.save", breaks: "B5" },
  { name: "the rebirth's wait is lost", file: CR, from: "afterSeconds: Math.max(0, Math.trunc(Number(r.afterSeconds) || 0)) });", to: "afterSeconds: 0 });", breaks: "B6" },
  { name: "the area exposes nobody", file: PW, from: "  if (!spec.save && spec.expose?.affliction) {", to: "  if (false) {", breaks: "S1" },
  { name: "no rebirth card", file: CW, from: "  for (const r of deathRebirthsOf(actor?.items ?? [])) {", to: "  for (const r of []) {", breaks: "S2" },
  { name: "the rebirth can be pressed twice", file: CW, from: "  await message.setFlag(SYSTEM_ID, \"deathRebirth\", { ...spec, used: true });\n", to: "", breaks: "S2" },
  { name: "a sword carries a spell", file: BC, from: "    if (!groups.includes(group)) continue;\n", to: "", breaks: "B8" },
  { name: "an innate spell is carried", file: BC, from: "i?.type === \"spell\" && i.system?.innate !== true && Number(i.system?.ppCost ?? 0) > 0", to: "i?.type === \"spell\" && Number(i.system?.ppCost ?? 0) > 0", breaks: "B9" },
  { name: "every critical adds 1", file: BC, from: "  return (SEVERITY_STEPS[String(severity ?? \"\").toLowerCase()] ?? 0) * Math.max(0, Math.trunc(Number(perStep) || 0));", to: "  return severity ? 1 : 0;", breaks: "B10" },
  { name: "the arrow wounds as well", file: AW, from: "  const strikeLands = !grabOnly && !hitCondition && !spellCarried;", to: "  const strikeLands = !grabOnly && !hitCondition;", breaks: "S3" },
  { name: "the spell is never offered", file: AW, from: "    if (bowCast) {\n", to: "    if (false) {\n", breaks: "S3" },
  { name: "the carried spell is not Heightened", file: CAST, from: "mm.heightenSave || carried?.heighten === true", to: "mm.heightenSave", breaks: "S4" },
  { name: "the critical's severity is not on the DC", file: BW, from: "carried: { label: spec.source, heighten: spec.heighten, dcBonus, severity }", to: "carried: { label: spec.source, heighten: spec.heighten, dcBonus: 0, severity }", breaks: "S4" },
  { name: "the bow's hand is still asked for (what 3.655.0 did)", file: CAST, from: "components: { ...(spellData.components ?? {}), somatic: false } }, spell.name)", to: "components: { ...(spellData.components ?? {}) } }, spell.name)", breaks: "S6" },
  { name: "a refused cast still swallows the arrow", file: BW, from: "  if (!cast) return false;\n", to: "", breaks: "S6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block22.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block22: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block22: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block22: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
