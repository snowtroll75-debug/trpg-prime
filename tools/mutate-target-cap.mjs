#!/usr/bin/env node
/**
 * mutate-target-cap — can verify-target-cap fail?
 *
 * NEW at 3.520.0.
 *
 * B1 IS THE ONE THIS FILE EXISTS FOR, and it is the mistake the whole
 * channel was built to avoid: treat a TOTAL as an INCREMENT. "You can
 * target up to 10 targets" becomes eleven on a "1 creature" spell and
 * twelve on a "2 creatures" one, so the printed number means something
 * different on every spell that buys it. Nothing errors. The card even
 * prints the right sentence.
 *
 * U1 IS THE QUIET ONE. Let a warp invent a cap on a spell whose printed
 * line gives no number and "any number of creatures" becomes ten — a
 * restriction the book never printed, arriving as a refusal the player
 * cannot argue with.
 *
 * L4 IS THE ONE THAT COSTS 8 PP FOR NOTHING. Read a missing caster level
 * as zero rather than as the printed cap and a per-level warp refuses
 * every target on the spell it was just bought to widen.
 *
 * WHAT THIS FILE DOES NOT COVER: the gate that calls `targetCapFor` lives
 * in `cast-workflow.mjs`, and passing it the caster level is one argument
 * on one line there. No check here runs it — covered by live testing.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const T = path.join(SYSTEM_ROOT, "module", "magic", "target-count.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-target-cap.mjs");

const MUTATIONS = [
  /* ── B: total vs increment ─────────────────────────────────────── */
  {
    file: T,
    name: "B1 A TOTAL IS ADDED LIKE AN INCREMENT",
    from: "  return Math.max(base, flat, scaled);",
    to: "  return base + flat + scaled;",
    breaks: "B3/B3b — \"up to 10\" would be 11 on one spell and 12 on another"
  },
  {
    file: T,
    name: "B2 A SMALLER TOTAL SHRINKS THE PRINTED CAP",
    from: "  return Math.max(base, flat, scaled);",
    to: "  return flat || scaled || base;",
    breaks: "B4 — a warp would become a penalty on a spell that prints more than it offers"
  },
  {
    file: T,
    name: "B3 THE INCREMENT STOPS RIDING ON TOP OF THE TOTAL",
    from: "  return baseCapAfterWarps(parsed.max, warpMods, casterLevel)\n    + Math.max(0, int(warpMods?.extraTargets));",
    to: "  return baseCapAfterWarps(parsed.max, warpMods, casterLevel);",
    breaks: "B2/B5 — the 46 warps of 3.498.0 would stop buying anything"
  },
  {
    file: T,
    name: "B4 THE PRINTED CAP IS IGNORED ONCE ANY WARP IS BOUGHT",
    from: "  const base = Math.max(0, int(printed));",
    to: "  const base = 0;",
    breaks: "B1/L3 — a level-3 caster would get fewer targets than the spell prints"
  },

  /* ── L: per caster level ───────────────────────────────────────── */
  {
    file: T,
    name: "L1 THE RATE IS READ AS A FLAT TOTAL",
    from: "  const scaled = perLevel ? perLevel * int(casterLevel) : 0;",
    to: "  const scaled = perLevel;",
    breaks: "L1 — \"1 creature per level\" would be one creature, for 8 PP"
  },
  {
    file: T,
    name: "L4 AN UNREADABLE LEVEL BUYS NOTHING AT ALL",
    from: "  const base = Math.max(0, int(printed));",
    to: "  const base = int(printed) && warpMods?.targetCapPerLevel ? 0 : Math.max(0, int(printed));",
    breaks: "L4/L4b — 8 PP spent and every target refused"
  },
  /*
   * L5 IS RETIRED — the TWELFTH dead guard. It removed a `Math.max(0, …)`
   * around the caster level, expecting a negative one to buy negative
   * targets, and SURVIVED: the `Math.max(base, flat, scaled)` on the
   * next line had already discarded it. A4 still pins the behaviour.
   */

  /* ── U: what must stay uncapped ────────────────────────────────── */
  {
    file: T,
    name: "U1 A WARP INVENTS A CAP ON AN UNCOUNTED LINE",
    from: "  if (parsed.max === null) return null;\n  return baseCapAfterWarps(",
    to: "  if (parsed.max === null && !warpMods?.targetCap) return null;\n  return baseCapAfterWarps(",
    breaks: "U2 — \"any number of creatures\" would become ten"
  },

  /* ── W: the vocabulary ─────────────────────────────────────────── */
  {
    file: W,
    name: "W1 targetCap LEAVES THE DECLARED VOCABULARY",
    from: "    targetCap: null,",
    to: "",
    breaks: "W1 — an undeclared key is offered, charged, and silently dropped"
  },
  {
    file: W,
    name: "W2 A TOTAL IS MULTIPLIED BY HOW OFTEN IT WAS BOUGHT",
    from: "    if (m.targetCap != null) mods.targetCap = Math.max(int0(mods.targetCap), Number(m.targetCap) || 0);",
    to: "    if (m.targetCap != null) mods.targetCap = int0(mods.targetCap) + (Number(m.targetCap) || 0) * times;",
    breaks: "W3 — clicking the box twice would buy twenty targets"
  },
  {
    file: W,
    name: "W3 A RATE IS MULTIPLIED TOO",
    from: "      mods.targetCapPerLevel = Math.max(int0(mods.targetCapPerLevel), Number(m.targetCapPerLevel) || 0);",
    to: "      mods.targetCapPerLevel = int0(mods.targetCapPerLevel) + (Number(m.targetCapPerLevel) || 0) * times;",
    breaks: "W5 — two per level, for the price of one per level twice"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([T, W, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-target-cap: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-target-cap: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-target-cap: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
