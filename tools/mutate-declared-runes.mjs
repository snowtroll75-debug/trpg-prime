#!/usr/bin/env node
/**
 * mutate-declared-runes — the mutation half of verify-declared-runes: each entry breaks one
 * rule the suite exists to hold, and the suite must go red for every one.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const A = path.join(SYSTEM_ROOT, "module", "module-api.mjs");
const C = path.join(SYSTEM_ROOT, "module", "rune-catalogue.mjs");
const D = path.join(SYSTEM_ROOT, "module", "rune-declarations.mjs");
const R = path.join(SYSTEM_ROOT, "module", "magic", "strike-riders.mjs");
const S = path.join(SYSTEM_ROOT, "module", "senses.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "strike-riders-workflow.mjs");
const MUTATIONS = [
  { name: "a shield rune is offered on armour too", file: A, from: "  return want ? all.filter((r) => r.on.includes(want)) : all;", to: "  return all;", breaks: "A2/A3" },
  { name: "the catalogue forgets the registered runes", file: C, from: "    : [...ARMOUR_RUNES, ...CODEX_ARMOUR_RUNES, ...registeredRunes()];", to: "    : [...ARMOUR_RUNES, ...CODEX_ARMOUR_RUNES];", breaks: "A3/A4" },
  { name: "a shield pays the armour's price", file: A, from: "      shieldPrice: Number.isFinite(Number(raw.shieldPrice)) ? Math.max(0, Math.trunc(Number(raw.shieldPrice))) : null,", to: "      shieldPrice: null,", breaks: "A4" },
  { name: "a declared offer is read off a packed item", file: D, from: "  return runesCountFor(item, items) ? declaredRunesOn(item) : [];", to: "  return declaredRunesOn(item);", breaks: "B2/B5" },
  { name: "the rune's sense is lost", file: S, from: "  return [...(items ?? []), ...fromRunes]", to: "  return [...(items ?? [])]", breaks: "B4" },
  { name: "Requiem's tier dice are ignored", file: D, from: "    const dice = String(entry.row?.dice ?? raw.dice ?? \"\").trim();", to: "    const dice = String(raw.dice ?? \"\").trim();", breaks: "C1" },
  { name: "the rider is not bound to its weapon", file: D, from: "      weaponNames: [String(weapon?.name ?? \"\")],", to: "      weaponNames: [],", breaks: "C1" },
  { name: "the trait gate is dropped", file: R, from: "    const byTrait = (spec.targetTraits ?? []).some((t) => traits.includes(t));", to: "    const byTrait = true;", breaks: "C3" },
  { name: "the weapon's riders never join the packets", file: W, from: "    [...strikeRidersOn(actor).map((entry) => entry.spec), ...weaponRuneRiders(weapon), ...elementalStrikeRiders(actor, weapon)],", to: "    [...strikeRidersOn(actor).map((entry) => entry.spec), ...elementalStrikeRiders(actor, weapon)],", breaks: "I1" },
  { name: "a blank ladder step reads nothing", file: D, from: "    const alt = LADDER_FALLBACK[key];\n    return alt && table[alt] !== undefined ? table[alt] : null;", to: "    return null;", breaks: "D1" },
  { name: "Banishing fires on an ordinary hit", file: D, from: "  if (spec.onCritical && !critical) return false;\n  if (spec.oncePerRound && used?.[marker]) return false;", to: "  if (spec.oncePerRound && used?.[marker]) return false;", breaks: "D3" },
  { name: "Merciful stabilises a knock-out", file: D, from: "  return [\"reached-zero\", \"dropped-below-zero\", \"massive-damage-death\", \"already-dying-escalated\", \"already-dying-dead\"].includes(String(resultCase ?? \"\"));", to: "  return true;", breaks: "E2" },
  { name: "Soul Ward ignores Potency III", file: D, from: "    const reduce = potency >= 3 && Number(spec.potencyIII) > 0 ? Math.trunc(Number(spec.potencyIII)) : Math.trunc(Number(spec.amount) || 0);", to: "    const reduce = Math.trunc(Number(spec.amount) || 0);", breaks: "F1" },
  { name: "a once-a-minute use allows again at once", file: D, from: "  return Number(now) - Number(stamp) >= span;", to: "  return true;", breaks: "F2" },
  { name: "the aura is emitted with the rune switched off", file: D, from: "    if (!item?.flags?.[\"trg-prime\"]?.runeState?.[state]) continue;\n", to: "", breaks: "H3" },
  { name: "a talisman in the pack still rerolls", file: D, from: "  if (consumable && item?.system?.equipped) {", to: "  if (consumable) {", breaks: "G3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-declared-runes.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([A, C, D, R, S, W]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-declared-runes: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-declared-runes: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-declared-runes: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
