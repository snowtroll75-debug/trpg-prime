#!/usr/bin/env node
/**
 * mutate-mutation-anchors — can verify-mutation-anchors fail?
 *
 * NEW at 3.502.0.
 *
 * R2 IS THE ONE THAT WOULD MAKE THIS CHECK A LIE. An anchor's first and
 * last lines can live in different string literals; a reader that took
 * only the first would see 1,516 anchors as 1,516 first halves and report
 * a clean tree it had never looked at.
 *
 * R6 IS THE CORRECTION THIS CHECK ALREADY NEEDED ONCE. The first draft
 * refused every anchor ending on a delimiter — 46 of them, 24 perfectly
 * good — and only the paired `to:` separates scenery from substance.
 *
 * A2 IS THE READER'S OWN FLOOR. A regex that quietly stops matching
 * reports a clean tree, which is the failure mode this project paid for
 * when one counted 30 of 335 tracker items.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const V = path.join(SYSTEM_ROOT, "tools", "verify-mutation-anchors.mjs");

const MUTATIONS = [
  /* ── A5: the frozen backlog of pointless context (3.526.0) ─────── */
  {
    name: "A5 THE CEILING BECOMES A FLOOR",
    // NOT `risen.length === 0` → `true`. On a clean tree that condition is
    // ALREADY true, so replacing it changes no answer and the mutation
    // survives — the check would look tested and be untested. The
    // comparison is the load-bearing part: turn `>` into `>=` and every
    // runner sitting exactly on its baseline is reported as a rise, which
    // proves both that the walk runs and that the number it compares
    // against is the one in the file.
    from: "  .filter(([f, n]) => n > (BRITTLE.counts?.[f] ?? 0))",
    to: "  .filter(([f, n]) => n >= (BRITTLE.counts?.[f] ?? 0))",
    breaks: "A5 — the 60 runners holding a baseline would all report as having grown"
  },
  {
    name: "A5y CONTEXT THAT IS NEEDED FOR UNIQUENESS IS COUNTED TOO",
    from: "    if (occurrences(core) === 1) n += 1;",
    to: "    if (occurrences(core) >= 1) n += 1;",
    breaks: "A5/A5b — the 78 anchors that carry a line PRECISELY to be unique would be reported as brittle, which is the false positive that made a blanket rule useless"
  },
  {
    name: "A5z THE WALK STOPS LOOKING AND THE BACKLOG READS ZERO",
    from: "    if (!lead && !trail) continue;",
    to: "    continue;",
    breaks: "A5c — neutering the count would look like a clean tree; A5c is what refuses a baseline that has been silently beaten"
  },

  /* ── R: the reader ─────────────────────────────────────────────── */
  {
    name: "R1 THE READER TAKES ONLY THE FIRST LITERAL of a continued anchor",
    from: "    const literals = [...m[2].matchAll(/\"(?:[^\"\\\\]|\\\\.)*\"/g)].map((l) => l[0]);",
    to: "    const literals = [m[2].match(/\"(?:[^\"\\\\]|\\\\.)*\"/)?.[0] ?? \"\"];",
    breaks: "R2 — 1,516 anchors read as 1,516 first halves, and a clean tree reported"
  },
  {
    name: "R2 the reader stops decoding escapes",
    from: "      try { joined += JSON.parse(lit); } catch { ok_ = false; break; }",
    to: "      joined += lit;",
    breaks: "R1/R2 — every anchor would carry its own quotes and match nothing"
  },
  {
    name: "R3 THE PAIR READER LOSES THE REPLACEMENT",
    from: "    if (from !== null && to !== null) out.push({ from, to });",
    to: "    if (from !== null) out.push({ from, to: from });",
    breaks: "R5a/R6 — every delimiter would look carried, and the 24 good anchors refused"
  },

  /* ── D: what makes a delimiter scenery ─────────────────────────── */
  {
    name: "D1 A REPLACED BLOCK IS REFUSED TOO — the rule's first, too-broad draft",
    // ANCHOR MOVED AT 3.520.0. The rule gained its `t === last` half —
    // an anchor whose replacement IS the delimiter, with no newline
    // before it — which is how `mutate-spell-range` W1 slipped through.
    from: "  return t === last || t.endsWith(\"\\n\" + last);",
    to: "  return true;",
    breaks: "R6 — 24 anchors that span and replace a block, refused for their brace"
  },
  {
    name: "D1b THE NARROWEST FORM OF THE SHAPE IS INVISIBLE AGAIN",
    from: "  return t === last || t.endsWith(\"\\n\" + last);",
    to: "  return t.endsWith(\"\\n\" + last);",
    breaks: "R6 — the exact hole `mutate-spell-range` W1 fell through at 3.519.0"
  },
  {
    name: "D2 nothing is a delimiter any more",
    from: "  if (!last.trim() || !/^[)\\]}]+;?$/.test(last.trim())) return false;",
    to: "  if (!last.trim()) return false;",
    breaks: "R7/R7b — an ordinary statement would count as a list's end"
  },
  {
    name: "D3 a brace mid-line counts as the end of a list",
    from: "  if (!last.trim() || !/^[)\\]}]+;?$/.test(last.trim())) return false;",
    to: "  if (!last.trim() || !/[)\\]}]/.test(last.trim())) return false;",
    breaks: "R7b — `if (y) { go(); }` is not a list stopping"
  },
  {
    name: "D4 a one-line anchor is trimmed to nothing",
    from: "  if (lines.length < 2) return false;",
    to: "",
    breaks: "R7c — there is nothing to trim it down to"
  },

  /* ── E: the export rule ────────────────────────────────────────── */
  {
    name: "E1 THE EXPORT RULE STOPS ASKING",
    from: "  return (String(anchor ?? \"\").split(\"\\n\")[0] ?? \"\").trimStart().startsWith(\"export \");",
    to: "  return false;",
    breaks: "R8 — the shape that killed two mutations at 3.501.0"
  },
  {
    name: "E2 it fires on the word anywhere in the line",
    from: "  return (String(anchor ?? \"\").split(\"\\n\")[0] ?? \"\").trimStart().startsWith(\"export \");",
    to: "  return String(anchor ?? \"\").includes(\"export \");",
    breaks: "R9 — a variable called `exported` is not an export keyword"
  },

  /* ── A: the sweep ──────────────────────────────────────────────── */
  /*
   * THREE MUTATIONS STOOD HERE AND ALL THREE SURVIVED, and they are
   * deleted rather than kept. Each replaced one of this check's own
   * assertion conditions with `true` — `braced.length === 0`,
   * `exported.length === 0`, `anchorCount > 1000`. NO CHECK CAN CATCH ITS
   * OWN ASSERTION BEING NEUTERED: a fixture proving the detector still
   * works is a DIFFERENT `ok(...)` call, which the mutation never touched,
   * so it passes and the mutation lives.
   *
   * That is not a gap here, it is the job of `verify-checks-can-fail`,
   * which asks of every check in this directory whether it can fail at
   * all. Keeping unkillable mutations to look thorough is the vacuous
   * shape this project has caught six times; the honest move is to name
   * where the question is actually answered and stop asking it twice.
   */
  /* ── K: the declared keeps ─────────────────────────────────────── */
  {
    name: "K1 THE KEEP LIST EXCUSES EVERY FILE, not one anchor in one file",
    from: "  if (!keep?.tail) return false;\n  return String(from ?? \"\").split(\"\\n\").slice(-1)[0] === keep.tail;",
    to: "  return Boolean(keep);",
    breaks: "A3 — a whole runner waved through on one anchor's excuse"
  },
  /*
   * K2 AND K3 STOOD HERE AND SURVIVED, for the same reason the three
   * deleted below did: both replaced one of this check's own assertion
   * conditions — `k.why.length > 40` and the `stale` list itself — and a
   * check cannot catch its own assertion being neutered. K1 was kept
   * because it mutates a DECISION rather than an assertion, and it is now
   * catchable: the excusing logic moved into `keepExcuses` and is tested
   * against a fixture, since with one declared keep the mutated and
   * unmutated branches behave identically on the real tree.
   */
  {
    name: "A4 the runners are never found",
    from: "  .filter((f) => f.startsWith(\"mutate-\") && f.endsWith(\".mjs\"))",
    to: "  .filter((f) => f.startsWith(\"mutate-zzz\"))",
    breaks: "A1/A2 — nothing to read is not nothing to report"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-mutation-anchors: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(V, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(V, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(V, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-mutation-anchors: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-mutation-anchors: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
