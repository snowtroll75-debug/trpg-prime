#!/usr/bin/env node
/**
 * mutate-warp-repeats — can verify-warp-repeats fail?
 *
 * NEW at 3.515.0.
 *
 * R1 RESTORES THE SHIPPED DEFECT: the rule goes back to the two mod keys
 * somebody remembered, and 140 warps become checkboxes again — every
 * "per additional target" in the game capped at one extra creature by the
 * dialog rather than by any rule.
 *
 * C1 IS THE ONE THAT WOULD BE MISSED. Lift a printed ceiling and the
 * caster can buy "+1, max +4" nine times. Nothing errors, the PP is
 * charged, and the number on the sheet is simply wrong — the only way
 * this release could make the game worse than it was.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-warp-repeats.mjs");

const MUTATIONS = [
  /* ── R: the rule ───────────────────────────────────────────────── */
  {
    file: W,
    name: "R1 THE RULE GOES BACK TO A HAND-WRITTEN LIST — 140 warps are checkboxes again",
    from: "  return warpScalesWithRepeats(warp) ? WARP_UNLIMITED : 1;",
    to: "  return 1;",
    breaks: "P2/R1b/G2 — every \"additional target\" warp capped at one, by the dialog"
  },
  {
    file: W,
    name: "R2 EVERY WARP BECOMES REPEATABLE — flags included",
    from: "  if (!warp?.mods || !Object.keys(warp.mods).length) return false;\n  const once = aggregateWarpSelection([warp], { \"warp-0\": 1 });\n  const twice = aggregateWarpSelection([warp], { \"warp-0\": 2 });\n  return JSON.stringify(once.mods) !== JSON.stringify(twice.mods);",
    to: "  return true;",
    breaks: "R2/R3 — \"the targets may move out of the area\" offered as a quantity"
  },
  {
    file: W,
    name: "R3 the second purchase is never actually tried",
    from: "  const twice = aggregateWarpSelection([warp], { \"warp-0\": 2 });",
    to: "  const twice = aggregateWarpSelection([warp], { \"warp-0\": 1 });",
    breaks: "R1 — once compared with once is always equal, so nothing scales"
  },
  {
    file: W,
    name: "R4 AN INERT WARP IS OFFERED AS A QUANTITY",
    from: "  if (!warp?.mods || !Object.keys(warp.mods).length) return false;",
    to: "  if (false) return false;",
    breaks: "R3/G3b — Cure's bleed option would take a count and buy nothing, ×N"
  },

  /* ── C: the printed ceilings ───────────────────────────────────── */
  {
    file: W,
    name: "C1 A PRINTED CEILING IS LIFTED — \"+1, max +4\" can be bought nine times",
    // ONE BRANCH, NOT THE WHOLE LADDER (narrowed at 3.523.0). This anchor
    // used to name three consecutive statements — the bonusMax branch, the
    // areaGrowth branch and the fall-through — and 3.523.0 inserted a
    // fourth branch between the first two. The anchor stopped matching, and
    // a mutation that does not match is a mutation that stops running.
    //
    // THAT IS A3'S DISEASE ONE STEP REMOVED. `verify-mutation-anchors`
    // refuses an anchor carrying the closing delimiter of a growing list;
    // `warpMaxTimes` is a growing list of BRANCHES, and spanning all of
    // them is the same bet that nothing will ever be added. Deleting the
    // one branch is enough — a "+1, max +4" warp then falls through to the
    // unlimited answer, which is exactly what C1 claims to test.
    from: "  if (m.bonusMax && m.bonusValue) return Math.max(1, Math.ceil(Number(m.bonusMax) / Number(m.bonusValue)));",
    to: "",
    breaks: "C1/C3/P2b/P4 — the one way this release could make the game worse"
  },
  {
    file: W,
    name: "C2 the area cap stops reading the spell's own area",
    from: "  if (m.areaGrowth) return areaGrowthMaxTimes(m, areaText);",
    to: "",
    breaks: "C3/C3b — four purchases from a 10-foot emanation, three from a 20-foot one"
  },

  /* ── H: the chooser ────────────────────────────────────────────── */
  {
    file: W,
    name: "H1 AN UNLIMITED OPTION IS CLAMPED BY THE BROWSER AT Infinity",
    from: "        const cap = Number.isFinite(max) ? ` max=\"${max}\"` : \"\";",
    to: "        const cap = ` max=\"${max}\"`;",
    breaks: "H1b — max=\"Infinity\" is not a number and the box refuses every entry"
  },
  {
    file: W,
    name: "H2 a capped option loses its ceiling in the markup",
    from: "        const cap = Number.isFinite(max) ? ` max=\"${max}\"` : \"\";",
    to: "        const cap = \"\";",
    breaks: "H2 — the dialog would accept nine purchases of a four-purchase option"
  },
  {
    file: W,
    name: "H3 every option is drawn as a count box",
    from: "      if (max > 1) {",
    to: "      if (max >= 1) {",
    breaks: "H3 — a one-shot option offered as a quantity"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([W, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-warp-repeats: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-warp-repeats: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-warp-repeats: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
