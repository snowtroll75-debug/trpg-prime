#!/usr/bin/env node
/**
 * mutate-cast-time — can verify-cast-time fail?
 *
 * NEW at 3.518.0.
 *
 * U1 IS THE ONE THIS FILE EXISTS FOR, and it is the defect itself put
 * back. Delete the unit conversion and every cast time falls through to
 * its leading digit again: "10 minutes" is 10 AP, "7 days" is 7, and a
 * ritual cast mid-encounter is refused for being a few actions short
 * instead of for taking a week.
 *
 * L2 IS THE QUIET ONE. Turn the legality test from `<=` into `<` and
 * three-action spells — the commonest cast in the pack after two —
 * become uncastable in combat. Nothing errors. Everyone just quietly
 * loses their 3 AP spells.
 *
 * WHAT THIS FILE DOES NOT COVER, said plainly because the first draft of
 * this header claimed a "G1" that was never written. The two gates in
 * `cast-workflow.mjs` — the one that refuses a long cast, and the clause
 * letting a spell that SELLS a shorter cast reach its own warp chooser
 * first — are wiring inside a 4,000-line Foundry workflow, and no check
 * here runs them. Mutating them would survive, and a mutation that
 * always survives teaches nothing.
 *
 * That clause is the one worth naming anyway: remove it and Regenerate,
 * Restoration and Crackling Tempest are refused BEFORE the option that
 * makes them castable can be bought — a warp you cannot reach is the
 * inert warp this release was fixing, one layer up. It is covered by
 * live testing in Graham's world, not by this file.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-time.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-cast-time.mjs");

const MUTATIONS = [
  /* ── U: the unit ───────────────────────────────────────────────── */
  {
    file: C,
    name: "U1 THE DEFECT ITSELF — a cast time is its leading digit again",
    from: "    return Math.ceil(seconds / SECONDS_PER_AP);",
    to: "    return Number(time[1]);",
    breaks: "C3/C4/C7 — \"10 minutes\" back to 10 AP, which is what this release fixed"
  },
  {
    file: C,
    name: "U2 AN AP IS A WHOLE ROUND INSTEAD OF A THIRD OF ONE",
    from: "SECONDS_PER_AP = 2;",
    to: "SECONDS_PER_AP = 6;",
    breaks: "C1/C3 — a minute would be 10 AP, and Graham's worked example says 30"
  },
  {
    file: C,
    name: "U3 PART OF AN ACTION IS ROUNDED AWAY",
    from: "    return Math.ceil(seconds / SECONDS_PER_AP);",
    to: "    return Math.floor(seconds / SECONDS_PER_AP);",
    breaks: "C11b — a three-second cast would cost the same as a two-second one"
  },
  {
    file: C,
    name: "U4 MINUTES ARE READ AS SECONDS",
    from: "  minute: 60,",
    to: "  minute: 1,",
    breaks: "C3 — the unit table is the conversion"
  },
  {
    file: C,
    name: "U5 THE TIME UNIT IS TESTED AFTER THE LEADING NUMBER, not before",
    from: "  const time = /(\\d+(?:\\.\\d+)?)\\s*(second|minute|hour|day|week)s?\\b/.exec(t);",
    to: "  const time = /^$/.exec(t);",
    breaks: "C3/C4 — ordering is the whole of this function"
  },

  /* ── A: what must NOT be repriced ──────────────────────────────── */
  {
    file: C,
    name: "A1 \"1-3 AP\" IS PRICED AT ITS UPPER END",
    from: "  const ap = /^\\s*(\\d+)/.exec(t);",
    to: "  const ap = /(\\d+)(?!.*\\d)/.exec(t);",
    breaks: "A1/A3 — five spells would charge three actions for a cast the player made with one"
  },

  /* ── N: null is not zero ───────────────────────────────────────── */
  {
    file: C,
    name: "N1 A REACTION IS PRICED AS A FREE ACTION",
    from: "  if (t === \"free\" || t === \"reaction\") return null;",
    to: "  if (t === \"free\" || t === \"reaction\") return 0;",
    breaks: "N1 — null and 0 differ where it matters: one is a separate economy, the other is this one"
  },
  {
    file: C,
    name: "N5 AN UNREADABLE CAST TIME IS GUESSED AT A MINUTE",
    from: "  return ap ? int(ap[1]) : null;",
    to: "  return ap ? int(ap[1]) : 30;",
    breaks: "N5/N7 — guessing upward invents a refusal for a spell nobody can diagnose"
  },
  {
    file: C,
    name: "N6 A COST NOTHING CAN READ COSTS AN ACTION",
    from: "  return castTimeAP(castAP) ?? 0;",
    to: "  return castTimeAP(castAP) ?? 1;",
    breaks: "N6 — a reaction would start drawing on the AP pool"
  },

  /* ── L: Graham's line ──────────────────────────────────────────── */
  {
    file: C,
    name: "L1 THREE AP BECOMES TOO LONG FOR COMBAT",
    from: "  return castTimeApCost(castAP) <= MAX_COMBAT_AP;",
    to: "  return castTimeApCost(castAP) < MAX_COMBAT_AP;",
    breaks: "L1 — \"more than 3 AP\" means 3 is allowed; 57 spells would silently become uncastable"
  },
  {
    file: C,
    name: "L2 THE CEILING IS LIFTED ABOVE EVERY RITUAL IN THE PACK",
    from: "MAX_COMBAT_AP = 3;",
    to: "MAX_COMBAT_AP = 3000;",
    breaks: "C2/L2 — the ruling would apply to nothing"
  },
  /*
   * L3 IS RETIRED, AND IT EARNED ITS KEEP BEFORE IT WENT. It removed the
   * `ap === null ||` clause from `castTimeIsCombatLegal` expecting every
   * reaction spell to stop working, and SURVIVED — because `null <= 3`
   * is true in JavaScript, so the clause was never deciding anything.
   * The eighth dead guard this project has found. `castTimeIsCombatLegal`
   * now asks `castTimeApCost`, which has one honest answer for a cast
   * outside the AP economy, and N6 below covers that answer.
   */

  /* ── R: the refusal ────────────────────────────────────────────── */
  {
    file: C,
    name: "R3 THE REFUSAL STOPS SHOWING ITS WORKING",
    from: "    + `${/^\\d+$/.test(String(castAP).trim()) || typeof castAP === \"number\" ? \"\" : ` — about ${ap} AP at ${SECONDS_PER_AP} seconds an action`}`",
    to: "    + \"\"",
    breaks: "R3 — \"you cannot cast this\" reads like a bug rather than a rule"
  },
  {
    file: C,
    name: "R5 AN AP COST GETS THE CONVERSION EXPLAINED AT IT ANYWAY",
    from: "    + `${/^\\d+$/.test(String(castAP).trim()) || typeof castAP === \"number\" ? \"\" : ` — about ${ap} AP at ${SECONDS_PER_AP} seconds an action`}`",
    to: "    + ` — about ${ap} AP at ${SECONDS_PER_AP} seconds an action`",
    breaks: "R5 — \"9 AP to cast — about 9 AP at 2 seconds an action\""
  },

  /* ── B: the label ──────────────────────────────────────────────── */
  {
    file: C,
    name: "B3 EVERY CAST TIME GETS \" AP\" APPENDED",
    from: "  return /^\\d+$/.test(t) ? `${t} AP` : t;",
    to: "  return `${t} AP`;",
    breaks: "B3 — the card would read \"10 minutes AP\""
  },

  /* ── W: the warp channel ───────────────────────────────────────── */
  {
    file: W,
    name: "W1 castApSet LEAVES THE DECLARED VOCABULARY",
    from: "    castApSet: null,",
    to: "",
    breaks: "W1 — an undeclared key is offered, charged, and silently dropped"
  },
  {
    file: W,
    name: "W2 A SET OF ZERO AP IS DROPPED AS FALSY",
    from: "    if (m.castApSet != null) mods.castApSet = m.castApSet;",
    to: "    if (m.castApSet) mods.castApSet = m.castApSet;",
    breaks: "W12 — the exact shape `bleedPoints` and `areaOverride` are written to avoid"
  },
  {
    file: W,
    name: "W3 A NEW CAST TIME IS MULTIPLIED BY HOW OFTEN IT WAS BOUGHT",
    from: "    if (m.castApSet != null) mods.castApSet = m.castApSet;",
    to: "    if (m.castApSet != null) mods.castApSet = Number(m.castApSet) * times;",
    breaks: "W3 — buying \"changes to 3 AP\" twice would make it 6"
  },
  {
    file: W,
    name: "W4 A REDUCTION IS ASSIGNED RATHER THAN ACCUMULATED",
    from: "    if (m.castApDelta) mods.castApDelta += Number(m.castApDelta) * times;",
    to: "    if (m.castApDelta) mods.castApDelta = Number(m.castApDelta);",
    breaks: "W5/X2 — \"(min 1)\" could never be reached, which is the clue it is bought more than once"
  },
  {
    file: C,
    name: "W6 THE PRINTED FLOOR IS REMOVED",
    from: "  return Math.max(1, ap + delta);",
    to: "  return ap + delta;",
    breaks: "W6 — \"(min 1)\" is the only bound on an unlimited option; without it a cast reaches 0 and then negative"
  },
  {
    file: C,
    name: "W9 THE DELTA IS APPLIED TO THE PRINTED TIME RATHER THAN THE NEW ONE",
    from: "  const base = set === undefined || set === null ? castAP : set;",
    to: "  const base = castAP;",
    breaks: "W2/W9 — a set warp would buy nothing at all whenever a delta was also bought"
  },
  {
    file: C,
    name: "W11 A REACTION IS REDUCED INTO A 1 AP CAST",
    from: "  if (ap === null) return base;",
    to: "  if (false) return base;",
    breaks: "W11 — Math.max(1, null + -1) is 1, so a reaction spell would start costing an action"
  },
  {
    file: C,
    name: "W12 A SET OF ZERO IS IGNORED BY THE WARPED TIME TOO",
    from: "  const base = set === undefined || set === null ? castAP : set;",
    to: "  const base = set || castAP;",
    breaks: "W12 — falsy-testing a value whose valid range includes 0"
  },

  /* ── O: which spells offer one ─────────────────────────────────── */
  {
    file: C,
    name: "O5 THE OFFER IS DETECTED BY MATCHING THE PRINTED SENTENCE",
    from: "    .some((w) => w?.mods?.castApSet !== undefined && w?.mods?.castApSet !== null\n      || Number(w?.mods?.castApDelta ?? 0) !== 0);",
    to: "    .some((w) => /cast(ing)? time/i.test(String(w?.text ?? \"\")));",
    breaks: "O5 — matching text rather than mods is how absorbConditions and reduceBleed spent two releases inert"
  },
  {
    file: C,
    name: "O3 EVERY SPELL IS TREATED AS OFFERING A SHORTER CAST",
    from: "  return (Array.isArray(spellData?.warps) ? spellData.warps : [])",
    to: "  return true || (Array.isArray(spellData?.warps) ? spellData.warps : [])",
    breaks: "O3/O4 — the gate before the chooser would never refuse anything"
  },

  /* ── T: extra actions bought on top ────────────────────────────── */
  {
    file: C,
    name: "T1 BUYING NO EXTRA ACTIONS COLLAPSES THE PRINTED TIME TO A NUMBER",
    from: "  if (!extra) return castAP;",
    to: "  if (false) return castAP;",
    breaks: "T1 — \"1 minute\" would become 30 before the legality gate could read a unit off it"
  },
  {
    file: C,
    name: "T2 THE EXTRA ACTIONS ARE DROPPED",
    from: "  return (castTimeAP(castAP) ?? 0) + extra;",
    to: "  return castTimeAP(castAP) ?? 0;",
    breaks: "T2 — Warped Terrain would buy its bigger radius for free"
  },

  /* ── D: the spend ──────────────────────────────────────────────── */
  {
    file: C,
    name: "D2 A REACTION IS PUSHED INTO THE AP ECONOMY BY THE FLOOR",
    from: "  if (ap === null) return castAP;\n  return Math.max(1, ap + int(extraApSpent) + int(apDelta));",
    to: "  return Math.max(1, (ap ?? 0) + int(extraApSpent) + int(apDelta));",
    breaks: "D2 — every reaction spell would cost 1 AP"
  },
  {
    file: C,
    name: "D4 QUICKEN TAKES A CAST BELOW ONE ACTION",
    from: "  return Math.max(1, ap + int(extraApSpent) + int(apDelta));",
    to: "  return ap + int(extraApSpent) + int(apDelta);",
    breaks: "D4 — a 1 AP spell quickened would cost 0, and then -1 with two sources"
  },
  {
    file: C,
    name: "D5 EXTRA CASTING TIME STOPS BEING CHARGED FOR",
    from: "  return Math.max(1, ap + int(extraApSpent) + int(apDelta));",
    to: "  return Math.max(1, ap + int(apDelta));",
    breaks: "D5 — the bonus would be kept and the actions never spent"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([C, W, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-cast-time: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-cast-time: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-cast-time: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
