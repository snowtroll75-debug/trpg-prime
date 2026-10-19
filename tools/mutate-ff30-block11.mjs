#!/usr/bin/env node
/**
 * mutate-ff30-block11 — the mutation half of verify-ff30-block11 (3.641.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DR = m("druid.mjs"), AT = m("combat", "attack-workflow.mjs"), CI = m("codex-inheritance.mjs");
const CA = m("combat", "compound-action.mjs"), CW = m("combat", "compound-action-workflow.mjs");
const CR = m("creature-ability-rules.mjs"), CH = m("codex-hooks-workflow.mjs");
const DECL = path.join(SYSTEM_ROOT, "tools", "ff30-codex-declarations.mjs");

const MUTATIONS = [
  { name: "a dragon's own bite takes the +1 again", file: DR, from: '  if (String(actor?.type ?? "") === "npc" && !shapeWeapon) return 0;', to: "", breaks: "W1" },
  { name: "a shape's weapon on a creature loses the +1", file: DR, from: '  if (String(actor?.type ?? "") === "npc" && !shapeWeapon) return 0;', to: '  if (String(actor?.type ?? "") === "npc") return 0;', breaks: "W1" },
  { name: "the Strike never reads the mark", file: AT, from: 'shapeWeapon: Boolean(weapon.flags?.["trg-prime"]?.shapeWeapon)', to: "shapeWeapon: false", breaks: "W2" },
  { name: "Freezing is not an element word", file: CI, from: "(caustic|fiery|freezing|shocking|toxic)", to: "(caustic|fiery|shocking|toxic)", breaks: "E1" },
  { name: "the called name never looks up its entry", file: CI, from: "index.get(base) ?? index.get(elementalCodexName(base))", to: "index.get(base)", breaks: "E2" },
  { name: "the alias beats the exact entry", file: CI, from: "index.get(base) ?? index.get(elementalCodexName(base))", to: "index.get(elementalCodexName(base)) ?? index.get(base)", breaks: "E2" },
  { name: "pickOne offers only the first", file: CA, from: "for (const weapon of pickOne ? matches : matches.slice(0, 1)) strikes.push({", to: "for (const weapon of matches.slice(0, 1)) strikes.push({", breaks: "P1" },
  { name: "the punch is offered as a natural attack", file: CA, from: '(String(w.name ?? "").trim().toLowerCase() === "unarmed strike" || w?.system?.natural === false)', to: "(w?.system?.natural === false)", breaks: "P1" },
  { name: "the group is not marked", file: CA, from: "      pickGroup: pickOne ? rowIndex : null,", to: "      pickGroup: null,", breaks: "P1" },
  { name: "the group never refuses", file: CA, from: "    return i !== Number(strikeIndex) && strikes?.[i]?.pickGroup === group;", to: "    return false;", breaks: "P2" },
  { name: "the group counts every offer", file: CA, from: "if (groups.has(g)) continue; groups.add(g);", to: "groups.add(g);", breaks: "P3" },
  { name: "the press ignores the group", file: CW, from: "  if (!compoundPickAllowed(raw.strikes, strikeIndex, raw.used)) {", to: "  if (false) {", breaks: "P4" },
  { name: "the MAP counts every button", file: CW, from: "  const total = compoundStrikeTotal(raw.strikes ?? []);", to: "  const total = (raw.strikes ?? []).length;", breaks: "P4" },
  { name: "the called aura keeps the Elemental name", file: CI, from: "  if (called && Array.isArray(merged.auras)) {", to: "  if (false) {", breaks: "L3" },
  { name: "a corner is not adjacent", file: CR, from: "  return gapX <= 0.001 && gapY <= 0.001;", to: "  return (gapX <= 0.001 && gapY < 0) || (gapY <= 0.001 && gapX < 0);", breaks: "L1" },
  { name: "the gap is ignored", file: CR, from: "  return gapX <= 0.001 && gapY <= 0.001;", to: "  return gapX <= 5;", breaks: "L1" },
  { name: "the blood measures centres again", file: CH, from: "    if (footprintsAdjacent(box(token), box(other))) out.push(other.actor);", to: "    if (false) out.push(other.actor);", breaks: "L2" },
  { name: "Draconic Assault takes the first non-claw", file: DECL, from: 'notWeapon: "claw", count: 1, pickOne: true }', to: 'notWeapon: "claw", count: 1 }', breaks: "P5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block11.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block11: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block11: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block11: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
