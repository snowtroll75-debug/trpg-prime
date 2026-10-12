#!/usr/bin/env node
/**
 * mutate-spell-narration — can verify-spell-narration fail?
 *
 * NEW at 3.392.0. SURVIVED and an unmatched anchor are both failures.
 *
 * EVERY MUTATION INTRODUCES A DEFECT rather than loosening a guard. The
 * lesson is one release old: mutate-spell-book-fields' first eight were
 * all loosenings, seven survived, and they should have — relaxing a
 * check cannot fail while the tree is clean, because there is nothing
 * unforgiven for the widened rule to wave through.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "magic", "spell-narration.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-spell-narration.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED STATE: the cast stops printing the text at all",
    file: CAST,
    from: "    for (const paragraph of narrationLines(spellData)) {",
    to: "    for (const paragraph of []) {",
    breaks: "C3 — 352 spells go back to a card that says nothing"
  },
  {
    // A FAILED CAST DID NOT DO THE THING. Printing the text anyway tells
    // the player the spell worked.
    name: "the text prints even when the cast failed",
    file: CAST,
    from: "  if (outcome.cast) {\n    for (const paragraph of narrationLines(spellData)) {",
    to: "  if (true) {\n    for (const paragraph of narrationLines(spellData)) {",
    breaks: "C4 — a fizzled spell describes what it would have done"
  },
  {
    // THE DUPLICATION THIS DESIGN AVOIDS. Sixty-nine spells carry a note
    // that already summarises their description.
    //
    // RETARGETED AT 3.503.0. This aimed at a branch reading
    // `if (effects.some(e => e.kind === "note")) return false;`, which is
    // gone: `note` is a handled kind like any other, so the derived rule
    // stands the description down without a special case. What is mutated
    // instead is `note`'s membership of the handled set.
    name: "a note stops suppressing the description",
    file: path.join(SYSTEM_ROOT, "module", "magic", "effect-kinds.mjs"),
    from: '"missileStorm", "note", "perTurn"',
    to: '"missileStorm", "perTurn"',
    breaks: "A3 — Barkskin says the same thing twice on one card"
  },
  {
    // RETARGETED AT 3.503.0 for the same reason: the nine-name
    // MECHANICAL_KINDS list this pointed at was replaced by the fifty the
    // applier actually handles, after 42 spells were found printing their
    // card lines AND their whole description.
    name: "a mechanical effect stops suppressing it",
    file: RULE,
    from: "  if (effects.some((e) => HANDLED_EFFECT_KINDS.includes(String(e?.kind ?? \"\")))) return false;",
    to: "  if (false) return false;",
    breaks: "A2 — an automated spell reports what it did AND recites its text"
  },
  {
    name: "a save spell starts narrating",
    file: RULE,
    from: "  if (filled(spellSystem?.defence)) return false;",
    to: "  if (false) return false;",
    breaks: "A7 — the save is resolved and reported, so the card was never silent"
  },
  {
    name: "an attack spell starts narrating",
    file: RULE,
    from: '  if (String(spellSystem?.category ?? "").trim().toLowerCase() === "attack") return false;',
    to: "  if (false) return false;",
    breaks: "A8 — same, for the attack half"
  },
  {
    name: "damage stops suppressing it",
    file: RULE,
    from: "  if (filled(spellSystem?.damage?.formula) || filled(spellSystem?.baseDamage)) return false;",
    to: "  if (false) return false;",
    breaks: "A4/A5 — a damage spell recites its text under its own damage line"
  },
  {
    // THE WARPING BLOCK IS NOISE HERE. The player chose from it two steps
    // earlier in the Warp dialog.
    name: "the warping options are printed again under the result",
    file: RULE,
    from: "    .split(/Warping Options:/i)[0]",
    to: "    .split(/NeverAppearsAnywhere/i)[0]",
    breaks: "B1 — the card repeats a list the player has just used"
  },
  {
    name: "paragraphs are run together",
    file: RULE,
    from: "  return text.split(/\\n{2,}|\\n/).map((p) => p.trim()).filter(Boolean);",
    to: "  return [text];",
    breaks: "B5/D6 — Scribers Chant's concentration requirement is buried"
  },
  {
    // A SPELL WITH NOTHING TO SAY MUST SAY NOTHING. An empty paragraph is
    // worse than the silence this replaces — and `filter(Boolean)` is the
    // only thing preventing it, which is why the redundant `if (!text)`
    // guard above it was removed rather than kept: no mutation could
    // prove that one mattered.
    name: "an empty paragraph is allowed through",
    file: RULE,
    from: '  return text.split(/\\n{2,}|\\n/).map((p) => p.trim()).filter(Boolean);',
    to: '  return text.split(/\\n{2,}|\\n/).map((p) => p.trim());',
    breaks: "B7/B8/D3 — a blank line where there was nothing to print"
  },
  {
    name: "THE DESIGN INVERTS: a flag decides instead of the spell's contents",
    file: RULE,
    from: "function spellHasNoMechanics(spellSystem = {}) {",
    to: "function spellHasNoMechanics(spellSystem = {}) {\n  if (spellSystem?.narrative !== undefined) return Boolean(spellSystem.narrative);",
    breaks: "C1a/C1b — a list that rots, which is what deriving it avoids"
  },
  {
    // THE DOUBLE-BRACKET BUG, PUT BACK. Three spells shipped with names
    // like "Aura ((foes attack you at -2))" because five sites each
    // wrapped an already-bracketed note.
    name: "THE SHIPPED BUG: the effect name wraps the note again",
    file: EFFECTS,
    from: "  return `${spellName}${scope ? ` ${scope}` : \"\"}${suffix}`;",
    to: "  return `${spellName}${scope ? ` (${scope})` : \"\"}${suffix}`;",
    breaks: "E3 — every scoped effect reads with two pairs of brackets"
  },
  {
    name: "a bare note slips into the pack",
    file: EFFECTS,
    from: "  const scope = String(note ?? \"\").trim();",
    to: "  const scope = String(note ?? \"\").trim().replace(/^\\(|\\)$/g, \"\");",
    breaks: "E2/E3 — the brackets vanish and the name runs on"
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

const guard = guardFiles([RULE, CAST, CHECK, EFFECTS]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-narration: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-spell-narration: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-spell-narration: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
