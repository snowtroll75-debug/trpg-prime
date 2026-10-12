#!/usr/bin/env node
/**
 * mutate-dc-threshold — can verify-dc-threshold fail?
 *
 * NEW at 3.491.0.
 *
 * W2 IS THE SILENT NO-OP. A cast with no spell DC publishing "DC 0" is a
 * threshold everybody beats without noticing it was ever there — the
 * exact failure this whole tier of work exists to remove, and the one
 * this spell is most exposed to because the DC IS the effect.
 *
 * R2 IS THE OTHER HALF OF HONESTY, and it is easy to argue away. A card
 * that prints a computed DC and says nothing else looks MORE automated
 * than one that admits the adjudication is the GM's. It is the same lie
 * as a note that pretends to be automation, told from the other side.
 *
 * N3 IS PASS WITHOUT TRACE'S "whichever option is higher" — a comparison
 * that reads naturally as an addition, and would silently inflate every
 * tracking DC in the game by four.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const T = path.join(SYSTEM_ROOT, "module", "magic", "dc-threshold.mjs");
const SE = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-dc-threshold.mjs");

const MUTATIONS = [
  /* ── D: the declared row ───────────────────────────────────────── */
  {
    file: T,
    name: "D1 a row naming no check is accepted",
    from: "  if (!check) return null;",
    to: "  if (check === null) return null;",
    breaks: "D2 — a threshold that does not say what it is for"
  },
  {
    file: T,
    name: "D2 a missing distance becomes zero feet rather than none",
    from: "    withinFeet: raw.withinFeet === undefined || raw.withinFeet === null\n      ? null : Math.max(0, int(raw.withinFeet)),",
    to: "    withinFeet: Math.max(0, int(raw.withinFeet)),",
    breaks: "D4/R1b — \"within 0 ft\" would print on every spell that names no distance"
  },

  /* ── N: the number ─────────────────────────────────────────────── */
  {
    file: T,
    name: "N1 the offset is ignored",
    from: "  const base = int(spellDC) + int(spec?.offset);",
    to: "  const base = int(spellDC);",
    breaks: "N2 — Lock prints \"equal to your spell DC +5\""
  },
  {
    file: T,
    name: "N2 THE COMPARISON BECOMES AN ADDITION",
    from: "    : Math.max(base, int(spec.atLeast));",
    to: "    : base + int(spec.atLeast);",
    breaks: "N3 — \"whichever option is higher\" is a choice, not a sum"
  },
  {
    file: T,
    name: "N3 the floor wins even when the spell DC is higher",
    from: "    : Math.max(base, int(spec.atLeast));",
    to: "    : int(spec.atLeast);",
    breaks: "N3b — Pass Without Trace takes the higher of the two"
  },

  /* ── W: is it reached ──────────────────────────────────────────── */
  {
    file: SE,
    name: "W1 the effect kind stops being handled",
    from: '        case "dcThreshold": {',
    to: '        case "dcThresholdDisabled": {',
    breaks: "W1 — the spell falls through to the unhandled-kind branch"
  },
  {
    file: SE,
    name: "W2 THE SILENT NO-OP: a cast with no spell DC publishes DC 0",
    from: "          if (!spellDC) {",
    to: "          if (false) {",
    breaks: "W2 — a threshold everybody beats without noticing it is there"
  },
  {
    file: SE,
    name: "W3 the DC is not written onto the effect",
    from: "              dcThreshold: {\n                check: spec.check, dc, withinFeet: spec.withinFeet, text: spec.text\n              }",
    to: "              dcThreshold: { check: spec.check }",
    breaks: "W3 — the number would have to be recomputed by whoever reads it"
  },
  {
    file: SE,
    name: "W4 the effect is built without the shared duration timing",
    from: "          const dc = thresholdDC(spec, spellDC);\n          const timing = spellExpiryTiming(parsedDuration);",
    to: "          const dc = thresholdDC(spec, spellDC);\n          const timing = { spellEffect: false, spellEffectEnd: null, expiresRound: null, foundryDuration: null };",
    breaks: "W3c — the whole ladder is durations; without the timing none of them expire"
  },

  /* ── R: the honest half ────────────────────────────────────────── */
  {
    file: T,
    name: "R1 THE ARGUED-AWAY LINE: the card stops admitting what is not automated",
    from: '  return `<em>${spec.text} The DC is computed and carried; whether a given creature is `\n    + "close enough, and what else the effect impedes, are the GM\'s call.</em>";',
    to: "  return `<em>${spec.text}</em>`;",
    breaks: "R2b — a card printing only the number invites a table to think the rest is handled"
  },
  {
    file: T,
    name: "R2 the printed sentence is dropped entirely",
    from: "  if (!spec.text) return null;",
    to: "  return null; // eslint-disable-line",
    breaks: "R2 — the sentence the GM adjudicates with"
  },
  {
    file: T,
    name: "R3 the card stops naming the distance",
    from: "    : ` beyond ${spec.withinFeet} ft`;",
    to: '    : "";',
    breaks: "R1 — ten feet is who the threshold applies to"
  },
  {
    file: SE,
    name: "R4 the remainder is computed and never printed",
    from: "          const remainder = thresholdRemainderLine(spec);\n          if (remainder) lines.push(line(remainder));",
    to: "          thresholdRemainderLine(spec);",
    breaks: "R3 — computed and thrown away is this project's most-repeated defect"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([T, SE, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-dc-threshold: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-dc-threshold: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-dc-threshold: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
