#!/usr/bin/env node
/**
 * mutate-condition-suppression — can verify-condition-suppression fail?
 *
 * NEW at 3.529.0.
 *
 * W2 IS THE GAP ITSELF PUT BACK. Stop reading the bump and Banish
 * Fatigue's "+2 PP: ignore an additional point" goes back to charging PP
 * and ignoring nothing more — which is what it did for the whole life of
 * the pack, with the spell's own note admitting it.
 *
 * W5 IS THE ONE THAT WOULD BE WORSE THAN THE GAP. Treat a missing ceiling
 * as a ceiling of zero and every uncapped suppression in the game
 * suppresses nothing at all — a spell that reads as working and silently
 * stops ignoring anything.
 *
 * B3 IS THE QUIET ONE. `warpMaxTimes` never sees the row it raises, so
 * the purchase count assumes the row grants one point. Break that
 * assumption and a caster is sold a purchase that buys nothing, on a
 * spell nobody has written yet.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const S = path.join(SYSTEM_ROOT, "module", "conditions", "suppression.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-condition-suppression.mjs");

const MUTATIONS = [
  /* ── W: the two shapes ─────────────────────────────────────────── */
  {
    file: S,
    name: "W2 THE GAP ITSELF — the bump is never read",
    from: "  const bump = Math.max(0, Math.trunc(Number(warpMods?.suppressBump) || 0));",
    to: "  const bump = 0;",
    breaks: "W2/W2b/W3c/W4/B4/S1 — the PP is charged and not one more point is ignored"
  },
  {
    file: S,
    name: "W3 THE SWAP IS IGNORED",
    from: "  const condition = swap && swap.length\n    ? String(swap[0]).trim().toLowerCase()\n    : spec.condition;",
    to: "  const condition = spec.condition;",
    breaks: "W3/W3c/S2 — \"instead ignore the injured condition\" would go on ignoring fatigue"
  },
  {
    file: S,
    name: "W4 THE PRINTED CEILING STOPS CLAMPING",
    from: "  return { ...spec, condition, amount: cap > 0 ? Math.min(wanted, cap) : wanted };",
    to: "  return { ...spec, condition, amount: wanted };",
    breaks: "W4/B4 — a caster could ignore nine points of a condition whose sentence stops at five"
  },
  {
    file: S,
    name: "W5 A MISSING CEILING IS TREATED AS ZERO",
    from: "  return { ...spec, condition, amount: cap > 0 ? Math.min(wanted, cap) : wanted };",
    to: "  return { ...spec, condition, amount: Math.min(wanted, cap) };",
    breaks: "W5/W1/W2/S1 — every uncapped suppression would ignore nothing at all"
  },
  {
    file: S,
    name: "W6 A NEGATIVE BUMP LOWERS WHAT IS IGNORED",
    from: "  const bump = Math.max(0, Math.trunc(Number(warpMods?.suppressBump) || 0));",
    to: "  const bump = Math.trunc(Number(warpMods?.suppressBump) || 0);",
    breaks: "W6 — a warp only ever buys more"
  },
  {
    file: S,
    name: "W7 AN EMPTY SWAP LIST COUNTS AS A SWAP",
    from: "  const condition = swap && swap.length",
    to: "  const condition = swap",
    breaks: "W7 — an empty list would blank the condition and suppress nothing"
  },

  /* ── B: the purchase count ─────────────────────────────────────── */
  {
    file: S,
    name: "B1 THE COUNT IS ONE PURCHASE TOO MANY",
    from: "  return Math.max(0, Math.trunc(Number(cap) || 0) - start);",
    to: "  return Math.max(0, Math.trunc(Number(cap) || 0));",
    breaks: "B1/B1b/B2/B4 — the row already ignores one, so a max of 5 is four buys"
  },

  /* ── V: the vocabulary and the chooser ─────────────────────────── */
  {
    file: W,
    name: "V1 suppressConditions LEAVES THE DECLARED VOCABULARY",
    from: "    suppressConditions: null,",
    to: "",
    breaks: "V1 — an undeclared mod key is offered, charged, and silently dropped"
  },
  {
    file: W,
    name: "V2 THE BUMP STOPS ACCUMULATING",
    from: "    if (m.suppressBump) mods.suppressBump += Number(m.suppressBump) * times;",
    to: "    if (m.suppressBump) mods.suppressBump = Number(m.suppressBump);",
    breaks: "V2 — three purchases would be charged and one point delivered"
  },
  {
    file: W,
    name: "V4 THE CEILING SCALES WITH THE PURCHASES",
    from: "    if (m.suppressMax) mods.suppressMax = Math.max(int0(mods.suppressMax), Number(m.suppressMax) || 0);",
    to: "    if (m.suppressMax) mods.suppressMax += Number(m.suppressMax) * times;",
    breaks: "V4/V6 — buying the point three times would raise the ceiling as well as climb to it"
  },
  {
    file: W,
    name: "V6 THE CHOOSER FALLS BACK TO UNLIMITED ON A CAPPED BUMP",
    from: "  if (m.suppressBump && m.suppressMax) {",
    to: "  if (false && m.suppressBump && m.suppressMax) {",
    breaks: "V6 — the number box would take any count at all on a warp printing (max -5)"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([S, W, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-condition-suppression: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-condition-suppression: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-condition-suppression: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
