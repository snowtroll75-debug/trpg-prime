#!/usr/bin/env node
/**
 * mutate-spell-degrees — can verify-spell-degrees fail?
 *
 * NEW at 3.404.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE BUG THIS RELEASE EXISTS TO FIX, restored as one edit:
 * drawing a gated effect's recipients from the FAILURES rather than from
 * every target that rolled. It looks harmless — the fallback is right
 * there and it is the list the caller already had — and it reintroduces
 * exactly the defect, because a target who SUCCEEDED is not in it.
 * Fear's success is "frightened 1", and for a hundred-odd spells that
 * outcome has never once been applied.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SRC = path.join(SYSTEM_ROOT, "module", "magic", "spell-degrees.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const DURATION = path.join(SYSTEM_ROOT, "module", "magic", "effect-duration.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-spell-degrees.mjs");
// Duration reasoning was united into effect-duration.mjs at 3.414.0;
// outcome-effects.mjs now re-exports rather than keeping a second copy.
const OUTCOME = path.join(SYSTEM_ROOT, "module", "outcome-effects.mjs");

const MUTATIONS = [
  /* ── P: the Partial ruling (4 September 2026) ──────────────────── */
  {
    file: SRC,
    name: "P1 THE REVERSAL UNDONE: a failure reads upward to the milder rung again",
    from: "  if (self.success) return key;",
    to: "  if (true) return key;",
    breaks: "P1/P3c — a Partial goes back to matching nothing, or to the Success rung"
  },
  {
    file: SRC,
    name: "P2 a SAVED degree is dragged onto a failing rung",
    from: "  if (self.success) return key;",
    to: "  if (false) return key;",
    breaks: "P2/P2b — an unnamed Critical is how \"the target is unaffected\" is written"
  },
  {
    file: SRC,
    name: "P3 the nearest rung is picked from the wrong end",
    from: "    if (entry.rank <= self.rank && (nearest === null || entry.rank > nearest.rank)) nearest = entry;",
    to: "    if (entry.rank <= self.rank && (nearest === null || entry.rank < nearest.rank)) nearest = entry;",
    breaks: "P1 — a Partial would take the FUMBLE rung, skipping failure entirely"
  },
  {
    file: SRC,
    name: "P4 the bottom clamp is lost, so a blunder falls off the ladder",
    from: "  return (nearest ?? worst)?.key ?? key;",
    to: "  return nearest?.key ?? key;",
    breaks: "P3/P3b — the worst roll in the game becomes safer than the second worst"
  },

  /* ── R: rider versus ladder ────────────────────────────────────── */
  {
    file: SRC,
    name: "R1 a rider is filled from above like a ladder",
    from: "  if (basicSave) return worst && self.rank < worst.rank ? worst.key : key;",
    to: "",
    breaks: "R2 — a plain Failure would dazzle, and the book dazzles only on a fumble"
  },
  {
    file: SRC,
    name: "R2 a rider stops being clamped from below",
    from: "  if (basicSave) return worst && self.rank < worst.rank ? worst.key : key;",
    to: "  if (basicSave) return key;",
    breaks: "R3 — a Blunder would escape a rider a Fumble catches"
  },
  {
    file: SRC,
    name: "R3 every save is treated as basic",
    from: "  return /\\bbasic\\b/i.test(String(defence ?? \"\"));",
    to: "  return true;",
    breaks: "R1b/R4 — every ladder would stop filling its own gaps"
  },
  {
    file: EFFECTS,
    name: "R4 the cast stops asking whether the save is basic",
    from: "  const basicSave = isBasicSave(spell?.system?.defence);",
    to: "  const basicSave = false;",
    breaks: "G2 — Surge Of The Tempest's rider becomes a ladder again"
  },

  /* ── G: a note belongs to its rung ─────────────────────────────── */
  {
    file: EFFECTS,
    name: "G1 a gated note prints on every degree again",
    from: "      if (isDegreeGated(effect)) {\n        const rungHit = ladderResults.some((r) => effectAppliesOnDegree(effect, r?.degree));\n        if (!rungHit) continue;\n      }",
    to: "",
    breaks: "G1 — Enchanting Utterance would print its Failure and Fumble clauses on a Success"
  },
  {
    file: EFFECTS,
    name: "G2 an UNGATED note is silenced too",
    from: "      if (isDegreeGated(effect)) {",
    to: "      if (true) {",
    breaks: "G1b — a hundred-odd notes describe the whole spell and must still print"
  },


  // ── 3.414.0: turn-relative durations ──────────────────────────────
  {
    // THE STATE BEFORE THIS RELEASE. Both phrases parse to null, null
    // means no timing, and a condition with no timing never comes off.
    file: DURATION,
    name: "THE BLOCKER: turn-relative wording stops being readable",
    from: "    const turns = extractDurationRounds(text);",
    to: "    const turns = null;",
    breaks: "H8/H8f — Touch Of Obedience's ladder becomes unshippable again"
  },
  {
    // OFF BY ONE ROUND, in the direction that matters: "your next turn"
    // is two boundaries away, not one.
    file: DURATION,
    name: "the end of the NEXT turn is read as the current one",
    from: '  if (/until the end of (?:your|their|its) next turn/i.test(source)) return 2;',
    to: '  if (/until the end of (?:your|their|its) next turn/i.test(source)) return 1;',
    breaks: "H8b — every such effect ends a full round early"
  },
  {
    // ORDER. Running the turn-relative reader FIRST re-routes entries
    // that the numeric branch already answered.
    file: DURATION,
    name: "the turn-relative branch is tried before the numeric one",
    from: "  const m = t.match(/(\\d+)\\s*(rounds?|minutes?|mins?|hours?|hrs?|days?)/);",
    to: "  const m = null;",
    breaks: "H9 — 1 minute, 10 minutes and 1 hour stop parsing as themselves"
  },
  {
    // ONE OWNER. A second copy is exactly how the two answers diverged.
    file: OUTCOME,
    name: "outcome-effects keeps its own copy of the duration reader",
    from: 'export { extractDurationRounds } from "./magic/effect-duration.mjs";',
    to: "function extractDurationRounds() { return null; }",
    breaks: "H10 — two modules answering one question again"
  },
  {
    name: "wording nobody can count is given a number anyway",
    file: DURATION,
    from: "  if (/\\bfor 1 round\\b/i.test(source)) return 1;\n  return null;",
    to: "  if (/\\bfor 1 round\\b/i.test(source)) return 1;\n  return 1;",
    breaks: "H9b — 'varies' silently becomes one round"
  },
  {
    name: "THE BUG: a gated effect draws only from the failures",
    file: SRC,
    from: "  return (Array.isArray(saveResults) ? saveResults : [])",
    to: "  return (Array.isArray(saveResults) ? saveResults.filter((r) => !r?.saved) : [])",
    breaks: "B1/B7/D2 — a target who succeeded is affected by nothing, as before"
  },
  {
    name: "an ungated effect starts obeying the gate",
    file: SRC,
    from: "  if (declared === null) return true;",
    to: "  if (declared === null) return false;",
    breaks: "A1 — every one of the hundred-odd ungated spells stops working"
  },
  {
    name: "a gated effect applies on every degree",
    file: SRC,
    from: "  return declared.includes(String(degree ?? \"\").trim().toLowerCase());",
    to: "  return true;",
    breaks: "A2c/D3 — a critical save takes the failure's outcome"
  },
  {
    // THE CRITICAL SAVE. "The target is unaffected" is the printed rule.
    name: "a critical save stops being unaffected",
    file: SRC,
    from: "  if (declared === null) return true;",
    to: "  if (declared === null || degree === \"critical\") return true;",
    breaks: "D3 — the one degree the book says takes nothing"
  },
  {
    name: "degree names stop being normalised",
    file: SRC,
    from: "  return list.map((d) => String(d ?? \"\").trim().toLowerCase()).filter(Boolean);",
    to: "  return list;",
    breaks: "A4 — a degree typed with a capital silently applies to nobody"
  },
  {
    name: "an empty onSave reads as ungated",
    file: SRC,
    from: "  if (raw === undefined || raw === null) return null;",
    to: "  if (raw === undefined || raw === null || raw.length === 0) return null;",
    breaks: "A6b/A6c — an effect gated on nothing quietly applies to everyone"
  },
  {
    name: "a single string is not accepted",
    file: SRC,
    from: "  const list = Array.isArray(raw) ? raw : [raw];",
    to: "  const list = Array.isArray(raw) ? raw : [];",
    breaks: "A3 — `onSave: \"fumble\"` silently gates on nothing"
  },
  {
    name: "an unknown degree passes validation",
    file: SRC,
    from: "  return (declaredDegrees(effect) ?? []).filter((d) => !isDegreeKey(d));",
    to: "  return [];",
    breaks: "C4/E1 — a misspelled degree ships and never applies"
  },
  {
    name: "the degree list is a second copy rather than the table",
    file: SRC,
    from: "const SAVE_DEGREE_KEYS = Object.freeze(DEGREES.map((d) => d.key));",
    to: 'export const SAVE_DEGREE_KEYS = Object.freeze(["critical", "success", "failure", "fumble"]);',
    breaks: "C2 — the copy is missing heroic, partial and blunder"
  },
  {
    // THE ENGINE MUST ASK. A gate nothing consults is not automation.
    name: "the effect engine stops consulting the gate",
    file: EFFECTS,
    from: "      : recipientsForEffect(effect, ladderResults, targets);",
    to: "      : targets;",
    breaks: "F1b — the gate is imported and ignored"
  },
  {
    // THE CARD NOISE FOUND LIVE. Four "no target" lines on a correct cast.
    name: "a gated effect matching nobody reports it as a fault",
    file: EFFECTS,
    // RE-ANCHORED AT 3.484.0: the gate gained a second clause so a missed
    // attack stops printing "finds nobody" under its own "Miss vs …".
    // The mutation still removes the DEGREE half, which is what G1 is about.
    // RE-ANCHORED 3.614.0: an attack-gated row is excused too (F1 of the 3.613.0 drive).
    from: "      if (!isDegreeGated(effect) && !isAttackGated(effect) && !reportsItsOwnAbsence(effect)) {",
    to: "      if (!isAttackGated(effect) && !reportsItsOwnAbsence(effect)) {",
    breaks: "G1 — every correct Fear prints four lines that read as errors"
  },
  {
    name: "the cast workflow stops passing the degrees",
    file: CAST,
    from: "      saveResults: spellSave?.results ?? [],",
    to: "      saveResults: [],",
    breaks: "F2 — every gated effect finds nobody and applies nothing"
  },
  // ─────────────────────────────────────────────────────────────────
  // 3.405.0: PER-EFFECT DURATION
  {
    // THE FLATTENING, ONE LAYER DOWN. Reverting to the spell's duration
    // gives Colour Spray's failure the right three conditions and the
    // same length for all of them.
    name: "an effect's own duration stops winning",
    file: DURATION,
    from: "  if (declaresOwnDuration(effect)) return String(effect.duration).trim();",
    to: "  if (false) return String(effect.duration).trim();",
    breaks: "H2/H6 — three printed lengths collapse back to one"
  },
  {
    // A BLANK MUST NOT OVERRIDE. It would mean no duration at all, and
    // no duration means the condition never comes off.
    name: "a blank duration counts as a declaration",
    file: DURATION,
    from: '  return String(effect?.duration ?? "").trim().length > 0;',
    to: '  return effect?.duration !== undefined;',
    breaks: "H3/H3b — a half-finished pack row makes a condition permanent"
  },
  {
    name: "an unreadable duration is no longer reported",
    file: DURATION,
    from: "    if (parseSpellDuration(text) === null) out.push({ index, duration: text });",
    to: "    if (false) out.push({ index, duration: text });",
    breaks: 'H4/H5 — "1 rnd" ships and the condition never expires'
  },
  {
    // THE APPLIER MUST ASK PER EFFECT. Hoisting the read back out of the
    // loop is the exact edit that reintroduces the defect, and it looks
    // like a tidy-up.
    name: "the applier reads the duration once per cast again",
    file: EFFECTS,
    from: "    const durationSource = effectDurationText(effect, spellDurationSource);",
    to: "    const durationSource = spellDurationSource;",
    breaks: "F4 — the per-effect duration is computed and thrown away"
  },
  // ─────────────────────────────────────────────────────────────────
  // 3.405.0: DEGREES THE BOOK NEVER PRINTS
  {
    // THE BLUNDER HOLE. Rolling the worst result in the game made you
    // safer than rolling the second worst. RE-ANCHORED at 3.493.0 — the
    // clamp moved from `best` to `worst` when the failing side was
    // reversed, but it is the same hole.
    name: "a blunder stops falling to the bottom rung",
    file: SRC,
    from: "  return (nearest ?? worst)?.key ?? key;",
    to: "  return nearest ? nearest.key : key;",
    breaks: "I1/I7/P3 — a blunder matches nothing and takes no effect at all"
  },
  {
    // THE DIRECTION. A heroic save dragged onto a printed rung instead
    // of shrugging the spell off. RE-ANCHORED at 3.493.0: the guard that
    // protects a saving degree is now the `self.success` early return,
    // and this is the same defect through it.
    name: "the cascade runs upward as well as downward",
    file: SRC,
    from: "  if (self.success) return key;\n",
    to: "",
    breaks: "I2/P2 — beating the best printed outcome stops meaning anything"
  },
  {
    // THE NEIGHBOUR. REVERSED IN MEANING at 3.493.0: taking the MILDER
    // one is now the defect, because a Partial is not a save and must not
    // read at a save's rung. The mutation is kept rather than deleted —
    // it is the behaviour that shipped, and the one a future reader is
    // most likely to reinstate on the old reasoning.
    name: "a middle gap inherits the milder neighbour again",
    file: SRC,
    from: "    if (entry.rank <= self.rank && (nearest === null || entry.rank > nearest.rank)) nearest = entry;",
    to: "    if (entry.rank >= self.rank && (nearest === null || entry.rank < nearest.rank)) nearest = entry;",
    breaks: "I3/P1 — Word Of Fatigue's partial takes success rather than failure"
  },
  // NO MUTATION FOR "an ungated spell is dragged through the cascade".
  // There was one, it SURVIVED, and it was right to: the early return it
  // deleted was dead code — an empty `declared` already falls through to
  // the same answer. The guard has been removed rather than the mutation
  // weakened. See effectiveSaveDegree.
  {
    name: "the engine stops mapping degrees onto the ladder",
    file: EFFECTS,
    from: "      : recipientsForEffect(effect, ladderResults, targets);",
    to: "      : recipientsForEffect(effect, saveResults, targets);",
    breaks: "F3 — the cascade is computed and ignored"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([SRC, EFFECTS, CAST, DURATION, OUTCOME, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-degrees: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-spell-degrees: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-spell-degrees: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
