#!/usr/bin/env node
/**
 * mutate-ff30-block6 — the mutation half of verify-ff30-block6 (3.636.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CS = m("change-shape.mjs"), CA = m("creature-auras.mjs"), AWF = m("creature-aura-workflow.mjs"), CX = m("codex-actions-workflow.mjs");

const MUTATIONS = [
  { name: "its own form is never offered", file: CS, from: "  if (!forms.some((f) => f.own)) forms.unshift(", to: "  if (false) forms.unshift(", breaks: "A1" },
  { name: "any size is accepted", file: CS, from: "    size: SIZES.includes(lower(raw.size)) ? lower(raw.size) : \"\",", to: "    size: lower(raw.size),", breaks: "A1" },
  { name: "the form's speed replaces nothing", file: CS, from: "    if (delta) changes.push({ key: \"system.combat.movement.land.other\"", to: "    if (false) changes.push({ key: \"system.combat.movement.land.other\"", breaks: "A2" },
  { name: "the speed is added, not adjusted", file: CS, from: "    const delta = form.speed - Math.trunc(Number(baseLand) || 0);", to: "    const delta = form.speed;", breaks: "A3" },
  { name: "the size is not changed", file: CS, from: "  if (form.size) changes.push(", to: "  if (false) changes.push(", breaks: "A2" },
  { name: "the lost weapons are not recorded", file: CS, from: "{ [CHANGE_SHAPE_FLAG]: { key: form.key, loses: form.loses, ", to: "{ [CHANGE_SHAPE_FLAG]: { key: form.key, loses: [], ", breaks: "A2" },
  { name: "the wolf gains no Knockdown", file: CS, from: "  if (form.conditionals.length) flags.conditionals =", to: "  if (false) flags.conditionals =", breaks: "A3" },
  { name: "its own form lays an effect", file: CS, from: "  if (!form || form.own) return null;", to: "  if (!form) return null;", breaks: "A4" },
  { name: "immuneIf is not read", file: CA, from: "    immuneIf: (Array.isArray(raw.immuneIf) ? raw.immuneIf : [])", to: "    immuneIf: ([])", breaks: "A5" },
  { name: "the blind meet the gaze", file: AWF, from: "  if (blindedBy) {\n    return { lines: [", to: "  if (false) {\n    return { lines: [", breaks: "B1" },
  { name: "the resave is dropped", file: AWF, from: "    ? { ...tag, conditionSave: { save, onSuccess: \"end\", label: aura.name, saveDC: dc } }\n", to: "    ? tag\n", breaks: "B2" },
  { name: "Change Shape is not a Codex action", file: CX, from: "draconicShifting, harmonize, changeShape, lunaFrenzy,", to: "draconicShifting, harmonize, lunaFrenzy,", breaks: "B3" },
  { name: "the old form's Strikes never return", file: CX, from: "}));\n  if (back.length) await actor.updateEmbeddedDocuments(\"Item\", back);\n", to: "}));\n", breaks: "B3" },
  { name: "a move within the aura enters it again", file: CA, from: "      if (trigger === \"enter\" && subject.fromCentreFeet && withinAura(emitter.centreFeet, subject.fromCentreFeet, reach)) continue;\n", to: "", breaks: "A6" },
  { name: "the turn start is treated as a crossing", file: CA, from: "      if (trigger === \"enter\" && subject.fromCentreFeet &&", to: "      if (subject.fromCentreFeet &&", breaks: "A6" },
  { name: "the start is remembered after the move", file: AWF, from: "    const from = lastPlace.get(tokenDocument.id) ?? null;\n    remember(tokenDocument);", to: "    remember(tokenDocument);\n    const from = lastPlace.get(tokenDocument.id) ?? null;", breaks: "B5" },
  { name: "the start never reaches the trigger", file: AWF, from: "    await resolveAuras(tokenDocument, \"enter\", { from });", to: "    await resolveAuras(tokenDocument, \"enter\");", breaks: "B5" },
  { name: "forms stack", file: CX, from: "  await current.delete();\n", to: "", breaks: "B4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block6.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block6: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block6: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block6: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
