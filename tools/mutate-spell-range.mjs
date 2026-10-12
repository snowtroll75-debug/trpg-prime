#!/usr/bin/env node
/**
 * mutate-spell-range — can verify-spell-range fail?
 *
 * NEW at 3.519.0.
 *
 * U1 IS THE ONE THIS FILE EXISTS FOR, and it is the mutation that breaks
 * the game rather than the spell. Remove the "no limit" guard from
 * `outOfSpellRange` and `9999 > null` is TRUE — so every one of the 228
 * spells that name no range at all refuses every target on the board.
 * A gate that guesses is worse than no gate: it stops play.
 *
 * T2 IS THE QUIET ONE. Read touch off a constant instead of the caster's
 * reach and a Large creature with a ten-foot reach can punch a target it
 * cannot touch. Nothing errors; the two halves of the game just start
 * disagreeing about one distance.
 *
 * WHAT THIS FILE DOES NOT COVER, said plainly. The gate itself lives in
 * `cast-workflow.mjs`, beside the target-count gate and after the warp
 * chooser — wiring inside a 4,000-line Foundry workflow that no check
 * here runs. Its placement is the thing worth naming: above the chooser
 * it "would refuse a selection the caster was about to pay to make
 * legal", which is the comment the target-count gate already carries and
 * the reason this one sits where it does. Covered by live testing.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "spell-range.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-spell-range.mjs");

const MUTATIONS = [
  /* ── U: the ungated third ──────────────────────────────────────── */
  {
    file: R,
    name: "U1 A SPELL WITH NO PRINTED RANGE REFUSES EVERY TARGET",
    from: "  if (!Number.isFinite(maxFeet)) return false;",
    to: "  if (false) return false;",
    breaks: "U3/M2 — `9999 > null` is true, so 228 spells stop working entirely"
  },
  /*
   * U2 IS RETIRED, AND IT EARNED ITS KEEP. It removed a list of ungated
   * words — "self", "planetary", "varies" — expecting those spells to be
   * gated at a number nobody printed, and SURVIVED: `parseRangeFeet`
   * already refuses "self" and "personal" by name and every other word
   * has no digit in it, so the answer was null either way. The NINTH
   * dead guard, deleted rather than defended. Section U still pins every
   * one of those words, because the answer is what must stay true.
   */
  {
    file: R,
    name: "U3 AN UNREADABLE RANGE IS GUESSED AT THIRTY FEET",
    from: "  return parseRangeFeet(t.replace(/-/g, \" \"));",
    to: "  return parseRangeFeet(t.replace(/-/g, \" \")) ?? 30;",
    breaks: "U2/U4 — guessing refuses casts the book permits"
  },
  {
    file: R,
    name: "U4 A BLANK RANGE BECOMES A RANGE OF ZERO",
    from: "  if (!t) return null;",
    to: "  if (!t) return 0;",
    breaks: "U1/U4 — 217 spells would refuse anyone not standing on the caster"
  },

  /* ── T: touch ──────────────────────────────────────────────────── */
  {
    file: R,
    name: "T1 TOUCH IS A CONSTANT RATHER THAN THE CASTER'S REACH",
    from: "  if (/^touch$/i.test(t)) return Math.max(1, int(reach) || DEFAULT_REACH);",
    to: "  if (/^touch$/i.test(t)) return DEFAULT_REACH;",
    breaks: "T4 — a Large caster could punch a creature it could not touch"
  },
  {
    file: R,
    name: "T2 THE SHEET'S REACH IS IGNORED",
    from: "  return Math.max(1, Number(actorSystem?.combat?.reach ?? DEFAULT_REACH) || DEFAULT_REACH);",
    to: "  return DEFAULT_REACH;",
    breaks: "T2 — the same field `meleeReach` reads, so the two would disagree"
  },
  {
    file: R,
    name: "T3 A SHEET SAYING ZERO TOUCHES AT NOTHING",
    from: "  return Math.max(1, Number(actorSystem?.combat?.reach ?? DEFAULT_REACH) || DEFAULT_REACH);",
    to: "  return Number(actorSystem?.combat?.reach ?? DEFAULT_REACH);",
    breaks: "T3 — a reach of 0 would make every touch spell uncastable"
  },

  /* ── R: reading the number ─────────────────────────────────────── */
  {
    file: R,
    name: "R1 THE HYPHEN NORMALISING IS DROPPED",
    from: "  return parseRangeFeet(t.replace(/-/g, \" \"));",
    to: "  return parseRangeFeet(t);",
    breaks: "R4 — the one spell written \"30-feet\" goes silently ungated"
  },
  /*
   * R2 IS RETIRED — the TENTH dead guard. `spellRangeFeet` ended with
   * `feet && feet > 0 ? feet : null` over a function that already ends
   * with `d > 0 ? d : null`. Two tests, one answer.
   */

  /* ── G: the comparison ─────────────────────────────────────────── */
  {
    file: R,
    name: "G1 STANDING EXACTLY AT THE LIMIT IS OUT OF RANGE",
    from: "  return distanceFeet > maxFeet;",
    to: "  return distanceFeet >= maxFeet;",
    breaks: "G1/G3 — a 30-foot spell would not reach thirty feet"
  },
  {
    file: R,
    name: "G2 THE GATE IS INVERTED",
    from: "  return distanceFeet > maxFeet;",
    to: "  return distanceFeet < maxFeet;",
    breaks: "G2/G4 — only the targets you CAN reach would be refused"
  },

  /* ── M: who is named ───────────────────────────────────────────── */
  {
    file: R,
    name: "M1 ONLY THE FIRST TOO-FAR TARGET IS NAMED",
    from: "    .filter((t) => outOfSpellRange(Number(t?.distance), max))",
    to: "    .filter((t, i) => i === 0 && outOfSpellRange(Number(t?.distance), max))",
    breaks: "M1 — a caster told \"a target is too far\" has to measure four squares themselves"
  },
  /*
   * M2 IS RETIRED — the ELEVENTH. `targetsOutOfRange` opened with an
   * early exit for an ungated spell, and the filter beneath it already
   * empties the list for exactly that case. Three redundant guards in
   * one release, all found by mutations BEFORE it shipped rather than
   * after, which is the difference from the eighth.
   */

  /* ── L: the refusal ────────────────────────────────────────────── */
  {
    file: R,
    name: "L1 THE REFUSAL STOPS NAMING THE LIMIT",
    from: "    + `<strong>${spell}</strong>'s range of ${rangeLabel(rangeText, reach)}.`;",
    to: "    + `<strong>${spell}</strong>'s range.`;",
    breaks: "L3/L5 — \"beyond touch\" is an argument at the table; \"beyond touch (5 ft)\" is answerable"
  },
  {
    file: R,
    name: "L2 TOUCH STOPS SAYING HOW FAR IT REACHED",
    from: "  if (/^touch$/i.test(t)) return `touch (${Math.max(1, int(reach) || DEFAULT_REACH)} ft)`;",
    to: "  if (/^touch$/i.test(t)) return t;",
    breaks: "L5 — the reach the refusal turns on would be the one fact it withheld"
  },
  {
    file: R,
    name: "L3 A REFUSAL IS WRITTEN FOR A SPELL THAT CANNOT REFUSE",
    from: "  if (!spell || !who || max === null || !Number.isFinite(distanceFeet)) return null;",
    to: "  if (!spell || !who) return null;",
    breaks: "L6/L9 — a line about a limit that does not exist, printing \"max null ft\""
  },

  /* ── W: the warp key ───────────────────────────────────────────── */
  {
    file: W,
    name: "W1 rangeOverride LEAVES THE DECLARED VOCABULARY",
    // RE-ANCHORED AT 3.520.0, and it is the A3 shape this project has a
    // ratchet for: the anchor was `rangeOverride: null` PLUS the list's
    // closing `};`, so it broke the moment a key was added after it —
    // which is what a growing list does. It now names only the line it
    // deletes.
    from: "    rangeOverride: null,",
    to: "",
    breaks: "W1 — an undeclared key is offered, charged, and silently dropped"
  },
  {
    file: W,
    name: "W2 A NEW RANGE IS MULTIPLIED BY HOW OFTEN IT WAS BOUGHT",
    from: "    if (m.rangeOverride) mods.rangeOverride = String(m.rangeOverride);",
    to: "    if (m.rangeOverride) mods.rangeOverride = String(m.rangeOverride).repeat(times);",
    breaks: "W3 — buying \"30 feet\" twice would read \"30 feet30 feet\""
  },
  {
    file: R,
    name: "W3 THE WARP IS IGNORED AND THE PRINTED RANGE STANDS",
    from: "  const over = warpMods?.rangeOverride;",
    to: "  const over = null;",
    breaks: "W2/W7 — ten warps would go back to buying nothing, which is what this release fixed"
  },
  {
    file: R,
    name: "W4 AN EMPTY OVERRIDE ERASES THE PRINTED RANGE",
    from: "  return over === undefined || over === null || over === \"\"",
    to: "  return over === undefined || over === null",
    breaks: "W5 — a blank override would ungate the spell rather than leave it alone"
  },

  /* ── S: SILENCE IS A STATEMENT (3.532.0) ───────────────────────── */
  {
    file: R,
    name: "S1 SELF GOES BACK TO MEANING 'NO LIMIT' — the defect itself",
    from: '  if (/^(self|personal)$/i.test(t)) return 0;',
    to: '  if (/^(self|personal)$/i.test(t)) return null;',
    breaks: "S1/S2b — a spell that says it affects only the caster reaches anyone on "
      + "the board, which is what Shield Of Faith did live"
  },
  {
    file: R,
    name: "S2 THE CASTER IS OUT OF RANGE OF THEMSELVES",
    from: '  if (/^(self|personal)$/i.test(t)) return 0;',
    to: '  if (/^(self|personal)$/i.test(t)) return -1;',
    breaks: "S2 — a self spell would refuse its own caster, which is worse than the gap"
  },
  {
    file: R,
    name: "S3 AN AREA NO LONGER SPEAKS FOR A BLANK RANGE",
    from: '  return !r && !a ? "self" : String(rangeText ?? "");',
    to: '  return !r ? "self" : String(rangeText ?? "");',
    breaks: "S3b — 68 emanations centred on the caster would refuse every creature "
      + "their own template covers"
  },
  {
    file: R,
    name: "S3b A PRINTED RANGE IS OVERRIDDEN BY THE RULE",
    from: '  return !r && !a ? "self" : String(rangeText ?? "");',
    to: '  return !a ? "self" : String(rangeText ?? "");',
    breaks: "S3c/S3e — every spell without an area becomes self-only, warp or no warp"
  },
  {
    file: C,
    name: "S4 THE GATE STOPS ASKING ABOUT THE AREA",
    from: "    const castRange = effectiveRangeText(\n      warpedRange(effRange, warpMods),\n      warpedAreaText(effArea, warpMods)\n    );",
    to: "    const castRange = warpedRange(effRange, warpMods);",
    breaks: "the rule stays correct and unasked — Shield Of Faith goes back to reaching "
      + "an ally seven feet away, which is the behaviour live testing caught"
  },
  {
    file: V,
    name: "S5b A LIFT STOPS COUNTING — Ethereal Jaunt is flagged again",
    from: 'const LIFT_MODS = ["rangeOverride", "areaOverride", "areaGrowth"];',
    to: "const LIFT_MODS = [];",
    breaks: "S5b — with nothing able to lift the gate, the repaired Ethereal Jaunt reads "
      + "as unreachable again, which proves the ratchet can actually fire"
  },
  {
    file: V,
    name: "S5 THE RATCHET LOOKS FOR THE WRONG MODS AND SEES NOTHING",
    from: 'const REACH_MODS = ["extraTargets", "targetCap", "targetCapPerLevel"];',
    to: 'const REACH_MODS = ["noSuchMod"];',
    breaks: "S5 — a ratchet that names no real mod can never fire. The positive control "
      + "is what catches this, and it exists because this exact mutation survived first time"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([R, W, C, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-range: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-spell-range: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-spell-range: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
