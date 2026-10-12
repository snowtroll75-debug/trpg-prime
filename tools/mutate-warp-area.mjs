#!/usr/bin/env node
/**
 * mutate-warp-area — can verify-warp-area fail? NEW at 3.445.0.
 *
 * T1 IS THE DEFECT ITSELF. It points the template back at the PRINTED
 * area, which is exactly what shipped until 3.445.0: Dark Tendrils'
 * card read "the area becomes a 15-foot cone" over a 30-foot line it had
 * just drawn.
 *
 * A1 IS THE DEFECT ONE LAYER DOWN — the aggregator dropping a key it was
 * handed, the shape `spell-warp.mjs`'s own header records about
 * `freezeMembership`. A whole-file check would not notice: the key is
 * still named in the initialiser above.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const A = path.join(SYSTEM_ROOT, "module", "magic", "warp-area.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-warp-area.mjs");

const MUTATIONS = [
  /* ── T: is the template reached? ───────────────────────────────── */
  {
    file: C,
    name: "T1 THE DEFECT: the template is drawn from the printed area again",
    // Re-anchored 3.610.0: a wall's own config is chosen first (R9).
    from: "    const areaConfig = wallSpec ? wallAreaConfig(wallSpec) : parseSpellArea(warpedArea, effRange);",
    to: "    const areaConfig = wallSpec ? wallAreaConfig(wallSpec) : parseSpellArea(effArea, effRange);",
    breaks: "F2 — the card says cone and the canvas draws a line"
  },
  {
    file: C,
    name: "T2 the warped area is computed and thrown away",
    from: "    const warpedArea = warpedAreaText(effArea, warpMods);",
    to: "    const warpedArea = effArea;",
    breaks: "F1 — the value exists and carries nothing"
  },
  {
    file: C,
    name: "T3 the range gate reads the unwarped area",
    // Re-anchored 3.610.0: a wall is always placed in range, ahead of the area.
    from: "      const rangeFeet = wallSpec ? parseRangeFeet(effRange) : warpedArea ? parseRangeFeet(effRange) : null;",
    to: "      const rangeFeet = wallSpec ? parseRangeFeet(effRange) : effArea ? parseRangeFeet(effRange) : null;",
    breaks: "F4"
  },

  /* ── A: the aggregator ─────────────────────────────────────────── */
  {
    file: W,
    name: "A1 THE OLD SHAPE: the growth key is dropped on the floor",
    from: "    if (m.areaGrowth) {",
    to: "    if (false) {",
    breaks: "D1 — freezeMembership again: authored, charged, and silently discarded"
  },
  {
    file: W,
    name: "A2 the override key is dropped",
    from: "    if (m.areaOverride) mods.areaOverride = String(m.areaOverride);",
    to: "    ;",
    breaks: "D2/E1 — Dark Tendrils goes back to charging for nothing"
  },
  {
    file: W,
    name: "A3 a repeated growth counts once",
    from: "      mods.areaGrowth += Number(m.areaGrowth) * times;",
    to: "      mods.areaGrowth += Number(m.areaGrowth);",
    breaks: "D1/D1d — three purchases buy ten feet"
  },
  {
    file: W,
    name: "A4 the cap is lost on the way through",
    from: "      if (m.areaMax != null) mods.areaMax = Math.max(mods.areaMax ?? 0, Number(m.areaMax));",
    to: "      ;",
    breaks: "D1b — an uncapped growth where the book printed a ceiling"
  },
  {
    file: W,
    name: "A5 an override is multiplied like a growth",
    from: "    if (m.areaOverride) mods.areaOverride = String(m.areaOverride);",
    to: "    if (m.areaOverride) mods.areaOverride = String(m.areaOverride).repeat(Math.max(1, times));",
    breaks: "D3 — \"15-foot cone15-foot cone\" parses to something nobody wrote"
  },
  {
    file: W,
    name: "A6 the repeat count stops asking the spell's own area",
    from: "  if (m.areaGrowth) return areaGrowthMaxTimes(m, areaText);",
    to: "  ;",
    breaks: "C1/C2 — every growth option becomes a one-shot checkbox"
  },
  {
    file: W,
    name: "A7 the chooser hands over the wrong spell's area",
    from: '  const areaText = String(spell.system?.area ?? "");',
    to: '  const areaText = "";',
    breaks: "C1/C2 — the count cannot be computed and silently falls to one"
  },

  /* ── R: the rule ───────────────────────────────────────────────── */
  {
    file: A,
    name: "R1 an override no longer wins over a growth",
    from: "  if (override) return override;",
    to: "  ;",
    breaks: "A1/A3 — the area becomes a bigger line rather than a cone"
  },
  {
    file: A,
    name: "R2 a blank override erases the area",
    from: '  const override = String(mods?.areaOverride ?? "").trim();',
    to: '  const override = String(mods?.areaOverride ?? "");',
    breaks: "A2/A2b — whitespace counts as an area and the spell loses its own"
  },
  {
    file: A,
    name: "R3 the cap may shrink a spell",
    from: "  if (Number.isFinite(cap) && cap > 0) to = Math.min(to, Math.max(from, cap));",
    to: "  if (Number.isFinite(cap) && cap > 0) to = Math.min(to, cap);",
    breaks: "B4 — a purchase that makes the area smaller than it was printed"
  },
  {
    file: A,
    name: "R4 a negative growth shrinks the area",
    from: "  const growth = Math.max(0, Math.trunc(Number(mods?.areaGrowth) || 0));\n  if (!growth || !base.trim()) return base;",
    to: "  const growth = Math.trunc(Number(mods?.areaGrowth) || 0);\n  if (!growth || !base.trim()) return base;",
    breaks: "B5b — a warp that makes the spell smaller than it was printed"
  },
  {
    file: A,
    name: "R5 a prose area gets a number invented in it",
    from: "  if (!match) return base;",
    to: "  if (!match) return `${growth}-foot radius`;",
    breaks: "B6 — a spell whose area is a sentence acquires a template"
  },
  {
    file: A,
    name: "R6 the shape word is rebuilt rather than kept",
    from: "  return base.slice(0, match.index) + String(to) + match[2]\n    + base.slice(match.index + match[0].length);",
    to: "  return `${to}-foot radius`;",
    breaks: "B1b/E4 — an emanation quietly becomes a radius, and a line a circle"
  },
  {
    file: A,
    name: "R7 the repeat count is off by one",
    from: "  return Math.max(1, Math.ceil((cap - from) / growth));",
    to: "  return Math.max(1, Math.ceil((cap - from) / growth) + 1);",
    breaks: "C1/C2/C7 — the chooser sells a purchase the cap will refuse"
  },
  {
    // THE GUARD THIS REPLACED WAS DEAD CODE. The first draft had an
    // explicit `if (!(cap > from)) return 1;` above the return, and a
    // mutation deleting it SURVIVED — `Math.max(1, …)` already answers
    // an area at or past its ceiling. The duplicate went; this proves
    // the floor that carries it is real.
    file: A,
    name: "R8 the floor that stops a zero or negative count",
    from: "  return Math.max(1, Math.ceil((cap - from) / growth));",
    to: "  return Math.ceil((cap - from) / growth);",
    breaks: "C4/C6b — a spell at its cap offers a number box with max 0"
  },
  /* -- N: the note ratchet (3.445.1) ------------------------------ */
  {
    file: A,
    name: "N1 the ratchet stops recognising a restated area",
    from: "  return Number(note[1]) === Number(area[1]);",
    to: "  return false;",
    breaks: "E6b — the next note authored with its spell's own radius goes unnoticed"
  },
  {
    file: A,
    name: "N2 the ratchet flags any note with a distance in it",
    from: "  return Number(note[1]) === Number(area[1]);",
    to: "  return true;",
    breaks: "E6d/E6e — Wash Away Sin's healing dice read as a restated cone"
  },
  {
    // THE FIRST DRAFT OF THIS MUTATION SURVIVED, and was wrong rather than
    // the check being weak: it substituted a zero distance for a missing
    // one, which changes no outcome — "10" never equals "0" either way.
    // Deleting the guard is the mutation that actually matters, because
    // the line below then reads `area[1]` off null.
    file: A,
    name: "N3 a prose area is read as though it had a distance",
    from: "  if (!area) return false;",
    to: "  ;",
    breaks: "E6f/E6g — a spell whose area is a sentence throws instead of answering"
  },
  {
    file: W,
    name: "R9 the chooser stops offering repeatable options at all",
    from: "      if (max > 1) {",
    to: "      if (false) {",
    breaks: "C8 — every growth becomes a single checkbox worth one step"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([A, W, C, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-warp-area: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-warp-area: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-warp-area: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
