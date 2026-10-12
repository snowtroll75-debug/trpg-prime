#!/usr/bin/env node
/**
 * mutate-row-extra — can verify-row-extra fail?
 *
 * NEW at 3.522.0.
 *
 * R1 IS THE ONE THIS FILE EXISTS FOR, and it is the gap itself put back.
 * Stop scaling the row's extra and Cure's warp goes back to buying the
 * die and not the eight — which is what it did for six releases after
 * Graham reported it, without anything erring or looking wrong on the
 * card.
 *
 * R3 IS THE ONE THAT WOULD BE WORSE THAN THE GAP. Make the rule fire on
 * a row with no flat term and Cure's 1 AP and 3 AP rows start growing a
 * constant the book never printed — a warp paying out on rows its own
 * sentence excludes.
 *
 * S1 IS THE QUIET ONE. Every damage and heal formula in the pack passes
 * through this function on every cast now. Make it rewrite a formula
 * when nothing was bought and the whole pack shifts at once.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const C = path.join(SYSTEM_ROOT, "module", "magic", "caster-level-mods.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const H = path.join(SYSTEM_ROOT, "module", "magic", "healing-channel.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-row-extra.mjs");

const MUTATIONS = [
  /* ── R: the rule ───────────────────────────────────────────────── */
  {
    file: C,
    name: "R1 THE GAP ITSELF — the extra stops scaling",
    from: "  const grown = Number(m[2]) * (1 + repeats);",
    to: "  const grown = Number(m[2]);",
    breaks: "R1/R2/C1 — the die grows and the eight does not, which is where this started"
  },
  {
    file: C,
    name: "R2 IT SCALES BY THE COUNT INSTEAD OF ONE MORE THAN IT",
    from: "  const grown = Number(m[2]) * (1 + repeats);",
    to: "  const grown = Number(m[2]) * repeats;",
    breaks: "R1 — one purchase would leave the extra unchanged, two would only double it"
  },
  {
    file: C,
    name: "R3 A ROW WITH NO FLAT TERM GROWS ONE ANYWAY",
    from: "  const m = /^(.*?)\\+\\s*(\\d+)\\s*$/.exec(text);",
    to: "  const m = /^(.*?)\\+?\\s*(\\d*)\\s*$/.exec(text);",
    breaks: "R3/C2/S2 — Cure's 1 AP and 3 AP rows would grow a constant the book never printed"
  },
  {
    file: C,
    name: "R8 A LEADING CONSTANT IS TREATED AS THE ROW'S EXTRA",
    from: "  const m = /^(.*?)\\+\\s*(\\d+)\\s*$/.exec(text);",
    to: "  const m = /^()(\\d+)\\s*\\+.*$/.exec(text);",
    breaks: "R8/R1 — \"8 + 1d8\" is a formula, not a row extra, and guessing invents a rule"
  },
  {
    file: C,
    name: "R5 THE WARP APPLIES WHETHER OR NOT IT WAS BOUGHT",
    from: "  if (!repeats || !text) return text;",
    to: "  if (!text) return text;",
    breaks: "R5/S1 — every formula in the pack with a trailing constant would grow on every cast"
  },
  {
    file: C,
    name: "R9 A NEGATIVE PURCHASE COUNT SHRINKS THE EXTRA",
    from: "  const repeats = Math.max(0, Math.trunc(Number(warpMods?.rowExtra) || 0));",
    to: "  const repeats = Math.trunc(Number(warpMods?.rowExtra) || 0);",
    breaks: "R9 — a warp only ever buys more"
  },

  /* ── H: the ruling of 8 September 2026 ─────────────────────────── */
  {
    file: H,
    name: "H1 THE FEAT STOPS REPLACING THE ROW'S EXTRA",
    // NOT ANCHORED ON THE `export` KEYWORD (A4) — the substring starting
    // at `const` is unique in the file and names the same line.
    from: "const RANGED_BONUS = 10;",
    to: "const RANGED_BONUS = 8;",
    breaks: "H1/H2/H2b — Graham ruled the warp doubles the row's own extra, so the feat's number IS what gets doubled"
  },

  /* ── W: the vocabulary ─────────────────────────────────────────── */
  {
    file: W,
    name: "W1 rowExtra LEAVES THE DECLARED VOCABULARY",
    // NOT ANCHORED ON THE LIST'S CLOSING BRACE. `rowExtra` is currently
    // the last key in `emptyWarpMods`, and naming the `};` after it would
    // be the A3 shape `verify-mutation-anchors` refuses — it dies the day
    // a key is appended, which is what a growing list does. A trailing
    // comma on the line above is valid JS, so deleting this line alone is
    // enough.
    from: "    rowExtra: 0",
    to: "",
    breaks: "W1 — an undeclared key is offered, charged, and silently dropped"
  },
  {
    file: W,
    name: "W2 THE COUNT STOPS ACCUMULATING",
    from: "    if (m.rowExtra) mods.rowExtra += Number(m.rowExtra) * times;",
    to: "    if (m.rowExtra) mods.rowExtra = Number(m.rowExtra);",
    breaks: "W2 — three purchases would buy one extra while buying three dice, and the two halves would disagree"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([C, W, H, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-row-extra: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-row-extra: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-row-extra: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
