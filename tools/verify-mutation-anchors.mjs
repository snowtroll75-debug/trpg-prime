#!/usr/bin/env node
/**
 * verify-mutation-anchors — a mutation that cannot find its line is not
 * a mutation.
 *
 * NEW at 3.502.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS. Three times in one session, an edit to production code
 * silently disarmed a mutation somewhere else in the tree:
 *
 *   3.499.1  `mutate-target-count` W2 was anchored on the closing brace of
 *            `emptyWarpMods`. Two keys were appended, the brace moved, and
 *            the mutation reported ANCHOR MISSING.
 *   3.499.1  `mutate-delayed-respite` P4 was anchored on
 *            `if (e.disabled) return false;`. Sacrificing Shield's finder
 *            repeated the line verbatim and the anchor became ANCHOR x2.
 *   3.501.0  `mutate-difficult-terrain` A2/A3 were anchored on
 *            `export const GROUND_MOVEMENTS = …`. The uncalled-export
 *            ratchet said to un-export both, and both anchors died.
 *
 * NONE OF THESE WERE SILENT IN THE END — the runners report an unmatched
 * anchor as a failure and the sweep catches it. But each cost a debugging
 * round, and each was found only because something else was being run.
 * WHAT IS EXPENSIVE IS NOT THE BREAK, IT IS THAT THE MUTATION STOPPED
 * ASKING ITS QUESTION and nothing said so until the next full sweep.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SHAPES ARE REFUSED, AND BOTH ARE ABOUT ANCHORING ON SOMETHING
 * INCIDENTAL TO THE RULE BEING MUTATED.
 *
 *   A CLOSING DELIMITER THAT IS CONTEXT RATHER THAN CONTENT. `};` at the
 *   end of an anchor is the end of a list, and a list is a thing that
 *   grows — `emptyWarpMods` has gained a key in four of the last ten
 *   releases, so anything anchored on where it stops is anchored on the
 *   one part of it guaranteed to move.
 *
 *   THE FIRST DRAFT OF THIS RULE WAS TOO BROAD AND THE DATA SAID SO. It
 *   refused every anchor ending on a delimiter: 46 of them, of which 24
 *   were perfectly good. Those 24 SPAN AND REPLACE a whole block, so the
 *   brace is part of the rule being mutated and trimming it would leave a
 *   dangling one — a syntax error, not a mutation. What separates the two
 *   is whether the REPLACEMENT ends with the same line: if it does, the
 *   delimiter is scenery the mutation carries through untouched, and the
 *   anchor is longer than the rule it names for no reason.
 *
 *   THE WORD `export` is a fact about who may call a function, not about
 *   what it does. The uncalled-export ratchet exists precisely to make
 *   things stop being exported, so an anchor that depends on the keyword
 *   is one two checks in this same directory disagree about.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS NOT REFUSED, AND WHY NOT.
 *
 * THE THIRD BREAK — a line that stopped being unique — HAS NO SHAPE.
 * `if (e.disabled) return false;` was a perfectly good anchor until a
 * second file copied it. No rule about the text of an anchor could have
 * predicted that, and inventing one (minimum length? must contain an
 * identifier?) would refuse good anchors to feel thorough. The runners
 * already report ANCHOR xN, which is the honest place for it: a
 * collision is discovered, not prevented.
 *
 * A CHECK THAT REFUSES WHAT IT CANNOT JUSTIFY is worth more than one that
 * covers every case badly, and this file would rather be narrow.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const TOOLS = path.join(SYSTEM_ROOT, "tools");

/**
 * Every `from:` anchor in a mutation runner, as decoded strings.
 *
 * READS THE STRING LITERAL, NOT THE FILE'S MEANING. A runner is a data
 * table; this wants the table's cells. Concatenated continuations
 * (`"a"\n + "b"`) are joined, because an anchor's shape is decided by its
 * whole text and its first and last lines can live in different literals.
 */
export function anchorsIn(source) {
  const out = [];
  const re = /(^|\n)\s*from:\s*((?:"(?:[^"\\]|\\.)*"\s*(?:\+\s*)?)+)/g;
  for (const m of source.matchAll(re)) {
    const literals = [...m[2].matchAll(/"(?:[^"\\]|\\.)*"/g)].map((l) => l[0]);
    let joined = "";
    let ok_ = true;
    for (const lit of literals) {
      try { joined += JSON.parse(lit); } catch { ok_ = false; break; }
    }
    if (ok_ && joined) out.push(joined);
  }
  return out;
}

/**
 * Every `from:`/`to:` pair in a runner, as decoded strings.
 *
 * PAIRED, BECAUSE THE RULE NEEDS BOTH HALVES. Whether a trailing brace is
 * scenery or substance is decided by what replaces it, not by the anchor
 * alone — see the header.
 */
export function pairsIn(source) {
  const out = [];
  const re = /\n\s*from:\s*((?:"(?:[^"\\]|\\.)*"|\s|\+)+?),\s*\n\s*to:\s*((?:"(?:[^"\\]|\\.)*"|\s|\+)+?),\s*\n/g;
  const decode = (chunk) => {
    let joined = "";
    for (const l of chunk.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
      try { joined += JSON.parse(l[0]); } catch { return null; }
    }
    return joined;
  };
  for (const m of source.matchAll(re)) {
    const from = decode(m[1]);
    const to = decode(m[2]);
    if (from !== null && to !== null) out.push({ from, to });
  }
  return out;
}

/** Is this anchor's trailing closing delimiter mere scenery? */
export function endsOnCarriedDelimiter(from, to) {
  const lines = String(from ?? "").split("\n");
  if (lines.length < 2) return false;
  const last = lines[lines.length - 1];
  if (!last.trim() || !/^[)\]}]+;?$/.test(last.trim())) return false;
  // CARRIED THROUGH UNTOUCHED is what makes it scenery. An anchor that
  // REPLACES the block it ends is naming that block, which is a rule.
  //
  // THE `to` MAY BE THE DELIMITER AND NOTHING ELSE (widened 3.520.0).
  // This tested only `to.endsWith("\n" + last)`, so it missed the
  // narrowest form of exactly the shape it exists to refuse: an anchor
  // of `key: null\n  };` replaced by `  };`, deleting the last entry of
  // a growing list and carrying its closing brace along. `mutate-spell-
  // range` W1 was written that way at 3.519.0 and died one release later
  // when a key was added after it — the very failure recorded at the top
  // of this file, arriving through the hole in its own test.
  const t = String(to ?? "");
  return t === last || t.endsWith("\n" + last);
}

/**
 * Does a declared keep excuse THIS anchor?
 *
 * ONE ANCHOR, NOT A WHOLE FILE. A keep names the exact trailing line it
 * is bending the rule for; excusing the runner wholesale would wave
 * through every future anchor in it on the strength of one old reason.
 * `mutate-mutation-anchors` caught this as an inert branch — with a
 * single declared keep the two behave identically, so it is tested here
 * against a fixture rather than against the tree.
 */
export function keepExcuses(keep, from) {
  if (!keep?.tail) return false;
  return String(from ?? "").split("\n").slice(-1)[0] === keep.tail;
}

/**
 * How many whole lines does this anchor carry WITHOUT changing them?
 *
 * A3'S DISEASE, GENERALISED (3.526.0). A3 refuses an anchor that ends on
 * a closing delimiter it does not touch, because that delimiter marks
 * where a growing list stops and the anchor dies the day the list grows.
 *
 * `mutate-warp-repeats` C1 died the same death at 3.523.0 without ending
 * on a delimiter at all: it named THREE consecutive branches of
 * `warpMaxTimes` and replaced only the first two, so the release that
 * inserted a fourth branch between them left it matching nothing. The
 * runner reported ANCHOR MISSING, which is the harness working — but a
 * mutation that does not match is a mutation that has STOPPED RUNNING,
 * and nothing was counting how many others were one edit from the same
 * fate.
 *
 * CARRIED CONTEXT IS NOT ITSELF WRONG, which is why this returns a count
 * rather than a verdict. The project's own advice is to widen an anchor
 * with surrounding text until it is unique, and most of the anchors that
 * carry a line need exactly that — `mutate-spell-rune` N8 carries one
 * because the guard above it is written identically in a second case.
 * What is wrong is carrying context that buys NOTHING, so the caller
 * pairs this with a uniqueness test.
 *
 * @param {string} from
 * @param {string} to
 * @returns {{lead: number, trail: number}}
 */
export function carriedContext(from, to) {
  const a = String(from ?? "").split("\n");
  const b = String(to ?? "").split("\n");
  // NO EARLY EXIT FOR A ONE-LINE ANCHOR. The first draft had one, and
  // `mutate-mutation-anchors` A5x showed it decided nothing: with a
  // single line, both loops compare `a[0]` against `b[0]`, and any real
  // mutation changes that line — so both counts are already zero. The
  // only input it could ever have caught is `from === to`, which is not
  // a mutation at all.
  //
  // THE FOURTEENTH DEAD GUARD, deleted rather than defended. C4 below
  // pins the ANSWER for a one-line anchor, which is what must stay true.
  let lead = 0;
  while (lead < a.length && lead < b.length && a[lead] === b[lead]) lead += 1;
  let trail = 0;
  while (trail < a.length - lead && trail < b.length - lead
    && a[a.length - 1 - trail] === b[b.length - 1 - trail]) trail += 1;
  return { lead, trail };
}

/** The part of an anchor that actually changes. */
export function anchorCore(from, to) {
  const lines = String(from ?? "").split("\n");
  const { lead, trail } = carriedContext(from, to);
  return lines.slice(lead, lines.length - trail).join("\n");
}

/** Does this anchor lead with the `export` keyword? */
export function leadsWithExport(anchor) {
  return (String(anchor ?? "").split("\n")[0] ?? "").trimStart().startsWith("export ");
}

/* ================================================================== *
 * R. THE READER
 *
 * BEFORE REPORTING ANYTHING AS CLEAN, PROVE THE READER CAN SEE A THING
 * KNOWN TO BE THERE. The rule this project wrote after a regex counted
 * 30 of 335 tracker items and sent Graham looking for a backup.
 * ================================================================== */

const SAMPLE = [
  '  {',
  '    file: P,',
  '    name: "X1 something",',
  '    from: "  const a = 1;",',
  '    to: "  const a = 2;",',
  '  },',
  '  {',
  '    from: "  const b = 1;\\n"',
  '      + "  };",',
  '    to: "",',
  '  }'
].join("\n");

const sampleAnchors = anchorsIn(SAMPLE);
ok("R1 the reader finds a plain anchor", sampleAnchors.includes("  const a = 1;"));
ok("R2 THE READER JOINS A CONTINUED ANCHOR",
  sampleAnchors.includes("  const b = 1;\n  };"),
  "an anchor's first and last lines can live in different string literals, and its "
  + "shape is decided by the whole text");
ok("R3 the reader finds both", sampleAnchors.length === 2);
ok("R4 a file with no anchors yields none", anchorsIn("const x = 1;").length === 0);

const samplePairs = pairsIn(SAMPLE);
ok("R5a the pair reader finds both halves",
  samplePairs.length === 2 && samplePairs[0].from === "  const a = 1;"
  && samplePairs[0].to === "  const a = 2;");

ok("R5 A CARRIED DELIMITER IS SEEN",
  endsOnCarriedDelimiter("  a: 0\n  };", "  b: 0\n  };"),
  "the brace is untouched scenery on both sides");

/*
 * R6b IS THE NARROWEST FORM, and the rule was blind to it until 3.520.0.
 * An anchor that DELETES a list's last entry replaces `key: null\n  };`
 * with `  };` alone — the delimiter and nothing else, with no newline in
 * front of it — so a test of `to.endsWith("\n" + last)` said no.
 * `mutate-spell-range` W1 was written that way, survived this check, and
 * died one release later when a key was appended after it: exactly the
 * failure recorded at the top of this file, arriving through a hole in
 * its own test.
 */
ok("R6b AND THE FORM THAT DELETES THE LAST ENTRY OUTRIGHT",
  endsOnCarriedDelimiter("  a: 0\n  };", "  };"),
  "the replacement IS the delimiter — no newline precedes it");
ok("R6c while replacing the delimiter itself is still a rule, not scenery",
  endsOnCarriedDelimiter("  a: 0\n  };", "  ];") === false,
  "an anchor that changes the closing token is naming the block");
// R6 IS THE ONE THAT KEEPS 24 GOOD ANCHORS. A mutation that replaces the
// block it ends is naming that block.
ok("R6 A REPLACED BLOCK IS NOT REFUSED",
  endsOnCarriedDelimiter("  if (x) {\n    go();\n  }", "  void x;") === false,
  "trimming the brace off this would leave a dangling one — a syntax error, not a mutation");
ok("R7 an ordinary statement is not a delimiter",
  endsOnCarriedDelimiter("  const a = 1;", "  const a = 2;") === false);
ok("R7b nor a brace inside a statement",
  endsOnCarriedDelimiter("  x\n  if (y) { go(); }", "  x\n  if (y) { go(); }") === false,
  "a brace mid-line is not the end of a list");
// R7c'S FIXTURE WAS WRONG AND `mutate-mutation-anchors` PROVED IT. The
// first version passed `to: "  };"`, which fails the carried-delimiter
// test on its own — so the length guard it was aiming at could be deleted
// without breaking anything. The `to` must END with the same line for the
// guard to be the thing deciding.
ok("R7c A ONE-LINE ANCHOR IS LEFT ALONE",
  endsOnCarriedDelimiter("  };", "  x\n  };") === false,
  "there is nothing to trim it down to, so reporting it would be advice nobody can take");
ok("R8 the export test sees one", leadsWithExport("export const A = 1;"));
ok("R9 and is not fooled by the word elsewhere",
  leadsWithExport("  const a = exported;") === false);

/* ================================================================== *
 * K. THE DECLARED KEEPS
 *
 * A CARRIED DELIMITER IS USUALLY SCENERY AND SOMETIMES NOT, and the
 * difference was found the hard way at 3.502.0. Trimming the closing
 * `});` off one anchor in `mutate-riding-reflexes-batch` turned it into
 * ANCHOR x2: `opportunity.mjs` holds two identical
 * `reactorEligibility({...})` blocks, and the FIRST ends its
 * `hasMeleeStrike: true` with a trailing comment — so without the closing
 * line the anchor matched both.
 *
 * THE DELIMITER WAS DOING DISAMBIGUATION, NOT DECORATION. That is a
 * different job from the one this rule refuses, and no shape distinguishes
 * them: whether a shorter anchor is still unique is a fact about the file
 * it points into, not about the anchor.
 *
 * SO IT IS DECLARED, WITH THE REASON, and K2 refuses a declaration that
 * has stopped applying — a stale exception is a check that has quietly
 * stopped asking.
 * ================================================================== */

const KEEP = {
  "mutate-riding-reflexes-batch.mjs": {
    tail: "  });",
    why: "opportunity.mjs holds two identical reactorEligibility({...}) blocks and the "
      + "first ends `hasMeleeStrike: true` with a trailing comment, so the shorter anchor "
      + "matches both. The closing line is what makes it unique, not what makes it long."
  }
};

/* ================================================================== *
 * A. EVERY RUNNER ON DISK
 * ================================================================== */

const runners = fs.readdirSync(TOOLS)
  .filter((f) => f.startsWith("mutate-") && f.endsWith(".mjs"))
  .sort();

ok("A1 there are runners to read", runners.length > 0);

const braced = [];
const kept = new Set();
const exported = [];
let anchorCount = 0;
for (const file of runners) {
  const src = fs.readFileSync(path.join(TOOLS, file), "utf8");
  for (const anchor of anchorsIn(src)) {
    anchorCount += 1;
    if (leadsWithExport(anchor)) {
      exported.push(`${file}: ${anchor.split("\n")[0].trim().slice(0, 60)}`);
    }
  }
  for (const { from, to } of pairsIn(src)) {
    if (!endsOnCarriedDelimiter(from, to)) continue;
    if (keepExcuses(KEEP[file], from)) { kept.add(file); continue; }
    braced.push(`${file}: …${from.split("\n").slice(-1)[0].trim()}`);
  }
}

// A2 IS A FLOOR, NOT A COUNT. The number of anchors grows with every
// release and pinning it would make this check a chore; what it must
// refuse is a reader that has silently stopped seeing most of them.
ok("A2 the reader sees the bulk of the anchors",
  anchorCount > 1000,
  `only ${anchorCount} anchors found across ${runners.length} runners — the reader has "
  + "probably stopped matching, which is the failure it exists to avoid`);

ok("A3 NO ANCHOR CARRIES A CLOSING DELIMITER IT DOES NOT CHANGE",
  braced.length === 0,
  `${braced.length}: ${braced.slice(0, 8).join(" | ")}`);
ok("A4 NO ANCHOR LEADS WITH `export`",
  exported.length === 0,
  `${exported.length}: ${exported.slice(0, 8).join(" | ")}`);

/* ================================================================== *
 * K. THE DECLARATIONS ARE LIVE, NOT STALE
 * ================================================================== */

/* ================================================================== *
 * C. carriedContext, DRIVEN ON FIXTURES
 * ================================================================== */

const cc = (from, to) => JSON.stringify(carriedContext(from, to));

ok("C1 AN ANCHOR THAT REPLACES EVERY LINE CARRIES NOTHING",
  cc("a\nb", "x\ny") === JSON.stringify({ lead: 0, trail: 0 }));
ok("C2 A TRAILING LINE HELD UNCHANGED IS CARRIED",
  cc("a\nb", "x\nb") === JSON.stringify({ lead: 0, trail: 1 }));
ok("C3 AND SO IS A LEADING ONE",
  cc("a\nb", "a\ny") === JSON.stringify({ lead: 1, trail: 0 }));
ok("C4 A ONE-LINE ANCHOR CARRIES NOTHING",
  cc("a", "b") === JSON.stringify({ lead: 0, trail: 0 }),
  "the answer the fourteenth dead guard used to produce by branching");
ok("C4b AND AN UNCHANGED ONE IS ALL CONTEXT, WHICH IS HARMLESS",
  cc("a", "a") === JSON.stringify({ lead: 1, trail: 0 }),
  "written expecting {0,0} and corrected to what the function actually says: "
  + "if no line changed then every line is context, which is the honest answer. "
  + "It never reaches the backlog count because C7's empty core is filtered out "
  + "first — and that filter, not a branch here, is what makes it not matter.");
ok("C5 THE THREE-BRANCH SHAPE THAT STARTED THIS IS SEEN",
  cc("one;\ntwo;\nthree;", "three;") === JSON.stringify({ lead: 0, trail: 1 }),
  "mutate-warp-repeats C1 — two branches replaced, the third carried, and a "
  + "fourth branch inserted between them killed it at 3.523.0");
ok("C6 THE CORE IS WHAT IS LEFT",
  anchorCore("one;\ntwo;\nthree;", "three;") === "one;\ntwo;");
ok("C7 an all-context anchor leaves an empty core",
  anchorCore("a\nb", "a\nb") === "",
  "counted as nothing rather than as brittleness — a pair that changes no "
  + "line is a different fault and not this one's to report");

/* ================================================================== *
 * A5. CONTEXT THAT BUYS NOTHING — a frozen backlog
 *
 * See `carriedContext` for why this exists: `mutate-warp-repeats` C1
 * spanned three branches of a growing dispatch, a fourth was inserted
 * between two of them at 3.523.0, and the mutation silently stopped
 * running. A3 catches that shape only when it ends on a delimiter.
 *
 * MEASURED BEFORE IT WAS RATCHETED: 113 of the 1739 from/to pairs on
 * disk carry a whole line they do not change AND would still match
 * exactly once without it. That is a backlog, not a bug to fix in one
 * release, so it is FROZEN the way `uncalled-exports.json` is frozen —
 * new brittleness fails, the existing list is worked down a runner at a
 * time, and no number may rise.
 * ================================================================== */

const BRITTLE = JSON.parse(fs.readFileSync(path.join(TOOLS, "brittle-anchors.json"), "utf8"));

/* Every file a mutation might point at: system source, plus the verify
 * runners that the checks-about-checks mutate. NOT the mutate runners
 * themselves — an anchor appears in one as a string literal, and counting
 * that would make every anchor look non-unique. */
function targetSources() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".mjs")) out.push(fs.readFileSync(p, "utf8"));
    }
  };
  walk(path.join(SYSTEM_ROOT, "module"));
  walk(path.join(SYSTEM_ROOT, "scripts"));
  for (const f of fs.readdirSync(TOOLS)) {
    if (/^verify-.*\.mjs$/.test(f)) out.push(fs.readFileSync(path.join(TOOLS, f), "utf8"));
  }
  return out;
}
const TARGETS = targetSources();
const occurrences = (needle) =>
  TARGETS.reduce((n, src) => n + (src.split(needle).length - 1), 0);

const brittleNow = {};
for (const file of runners) {
  const src = fs.readFileSync(path.join(TOOLS, file), "utf8");
  let n = 0;
  for (const { from, to } of pairsIn(src)) {
    const { lead, trail } = carriedContext(from, to);
    if (!lead && !trail) continue;
    const core = anchorCore(from, to);
    if (!core.trim()) continue;
    // THE CORE ALONE WOULD STILL MATCH ONCE, so the carried lines are
    // not buying uniqueness — they are only widening the blast radius.
    if (occurrences(core) === 1) n += 1;
  }
  if (n) brittleNow[file] = n;
}

const risen = Object.entries(brittleNow)
  .filter(([f, n]) => n > (BRITTLE.counts?.[f] ?? 0))
  .map(([f, n]) => `${f}: ${n} (baseline ${BRITTLE.counts?.[f] ?? 0})`);
ok("A5 NO RUNNER CARRIES MORE POINTLESS CONTEXT THAN ITS BASELINE",
  risen.length === 0,
  `${JSON.stringify(risen)} — an anchor that carries a line it does not change, `
  + "and would match without it, dies the day something is inserted beside it. "
  + "Narrow it to the lines it actually replaces.");

const totalNow = Object.values(brittleNow).reduce((a, b) => a + b, 0);
ok("A5b AND THE BACKLOG HAS NOT GROWN OVERALL",
  totalNow <= BRITTLE.total,
  `${totalNow} now against a frozen ${BRITTLE.total}`);

// A5c IS WHAT STOPS THE BASELINE ROTTING, and it is K2's rule applied to
// this list: an entry for a runner that is now clean is a number nobody
// is holding, and leaving it there quietly raises the ceiling for the
// next anchor written in that file.
const overstated = Object.entries(BRITTLE.counts ?? {})
  .filter(([f, n]) => (brittleNow[f] ?? 0) < n)
  .map(([f, n]) => `${f}: baseline ${n}, actually ${brittleNow[f] ?? 0}`);
ok("A5c A BASELINE THAT HAS BEEN BEATEN IS LOWERED, NOT LEFT",
  overstated.length === 0,
  `${JSON.stringify(overstated)} — lower the number in brittle-anchors.json `
  + "(or delete the entry at zero); a stale ceiling waves through the next one");

ok("K1a A KEEP EXCUSES ONLY THE TAIL IT NAMES",
  keepExcuses({ tail: "  });" }, "x\n  });") === true
  && keepExcuses({ tail: "  });" }, "x\n  };") === false,
  "excusing the whole runner would wave through every future anchor in it");
ok("K1b a keep with no tail excuses nothing",
  keepExcuses({ why: "..." }, "x\n  });") === false
  && keepExcuses(null, "x\n  });") === false);
ok("K1 every declared keep has a reason",
  Object.values(KEEP).every((k) => k.why && k.why.length > 40),
  "a keep with no reason is a shrug with a comment marker");
// K2 IS THE ONE THAT STOPS THIS LIST ROTTING. A declaration whose anchor
// has since been rewritten is a check that has quietly stopped asking.
const stale = Object.keys(KEEP).filter((f) => !kept.has(f));
ok("K2 NO DECLARED KEEP HAS STOPPED APPLYING",
  stale.length === 0,
  `${JSON.stringify(stale)} — the anchor no longer carries the delimiter it was excused for; `
  + "delete the entry rather than leaving a rule nobody is bending");

if (failures.length) {
  process.stderr.write(`verify-mutation-anchors: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.stderr.write(
    "\nAn anchor should name the RULE it mutates, not the punctuation around it.\n"
    + "  ending on an UNCHANGED `};` or `]);` anchors on where a growing list stops\n"
    + "  leading with `export` anchors on who may call a function\n");
  process.exit(1);
}
process.stdout.write(
  `verify-mutation-anchors: OK — ${checks} checks over ${anchorCount} anchors in `
  + `${runners.length} runners. None anchored on a growing list's closing brace or on `
  + "the export keyword.\n");
