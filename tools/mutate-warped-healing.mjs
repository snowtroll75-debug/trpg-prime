#!/usr/bin/env node
/**
 * mutate-warped-healing — can verify-warped-healing fail?
 *
 * NEW at 3.531.0.
 *
 * C1 IS THE ONE THIS RUNNER EXISTS FOR. `healDice` falls back to
 * `damageDice` so that Cure and every spell like it is byte-identical
 * after this release. Drop the fallback and nothing in the new channel
 * breaks — Make Whole and Soothing Ballad both still pass —
 * while Cure quietly stops gaining the die it has gained for releases.
 * A regression that only touches the spells you were NOT working on is
 * the kind that ships.
 *
 * H4 IS THE SAFETY ONE. Take the floor off `healBonus` and a negative
 * value subtracts: a heal that harms, from a one-character data fix.
 *
 * W1 IS THE WIRING. Put the old expression back at the call site and the
 * rule stays perfect and unasked: healBonus never reaches a row, and Make
 * Whole goes back to healing a flat twenty however much PP you spend.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const C = path.join(SYSTEM_ROOT, "module", "magic", "caster-level-mods.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-warped-healing.mjs");

const MUTATIONS = [
  /* ── H: the rule ───────────────────────────────────────────────── */
  {
    file: C,
    name: "C1 THE FALLBACK IS DROPPED — Cure silently stops gaining its die",
    from: '  const dice = String(warpMods?.healDice ?? "").trim() || String(warpMods?.damageDice ?? "").trim();',
    to: '  const dice = String(warpMods?.healDice ?? "").trim();',
    breaks: "C1 — every spell that healed by damageDice before this release stops, "
      + "while the three new ones keep passing"
  },
  {
    file: C,
    name: "C2 damageDice WINS OVER healDice — the two sides swap dice",
    from: '  const dice = String(warpMods?.healDice ?? "").trim() || String(warpMods?.damageDice ?? "").trim();',
    to: '  const dice = String(warpMods?.damageDice ?? "").trim() || String(warpMods?.healDice ?? "").trim();',
    breaks: "C2 — the healing would take the die meant for the damage side, which is "
      + "the whole reason healDice names its own"
  },
  {
    file: C,
    name: "H4 THE NEGATIVE FLOOR IS REMOVED — a heal that harms",
    from: "  if (flat <= 0) return withDice;",
    to: "  if (flat === 0) return withDice;",
    breaks: "H4 — a negative healBonus subtracts, turning healing into damage"
  },
  {
    file: C,
    name: "H3 THE FLAT BONUS IS NEVER ADDED",
    from: "  const flat = Math.trunc(Number(warpMods?.healBonus) || 0);",
    to: "  const flat = 0;",
    breaks: "H3/H3b/H3c/H5/D2c — Make Whole charges its PP and heals not one point more"
  },
  {
    file: C,
    name: "H5 THE ROW'S OWN EXTRA IS SKIPPED",
    from: "  const withDice = addDice(warpedRowExtra(formula, warpMods), dice);",
    to: "  const withDice = addDice(formula, dice);",
    breaks: "C1/H5 — Cure's \"+8 extra healing\" stops growing, a 3.522.0 repair undone"
  },

  /* ── A: the vocabulary ─────────────────────────────────────────── */
  {
    file: W,
    name: "A1 healDice IS NEVER AGGREGATED — offered, charged, dropped",
    from: "    if (m.healDice) mods.healDice = addDice(mods.healDice, scaleDice(m.healDice, times));",
    to: '    if (false) mods.healDice = "";',
    breaks: "C3/C3b — the selection carries no healing die at all"
  },
  {
    file: W,
    name: "A1b healDice IS NOT SCALED BY THE PURCHASES",
    from: "    if (m.healDice) mods.healDice = addDice(mods.healDice, scaleDice(m.healDice, times));",
    to: "    if (m.healDice) mods.healDice = addDice(mods.healDice, m.healDice);",
    breaks: "C3b — buying it twice buys one die, and the chooser still charges twice"
  },
  {
    file: W,
    name: "A2 healBonus IS NEVER AGGREGATED",
    from: "    if (m.healBonus) mods.healBonus += Number(m.healBonus) * times;",
    to: "    if (false) mods.healBonus += 0;",
    breaks: "C3e/C3f/D2c — Make Whole's five never reaches the row"
  },

  /* ── W: the wiring ─────────────────────────────────────────────── */
  {
    file: E,
    name: "W1 THE HEAL ROW GOES BACK TO BUILDING ITS OWN FORMULA",
    from: "            formula: warpedHealFormula(effect.formula, warpMods),",
    to: "            formula: addDice(warpedRowExtra(effect.formula, warpMods), warpDice),",
    breaks: "W1/W1b — the rule stays correct and nobody asks it, so healBonus never "
      + "reaches a row and Make Whole heals twenty"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([C, W, E, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-warped-healing: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-warped-healing: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-warped-healing: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
