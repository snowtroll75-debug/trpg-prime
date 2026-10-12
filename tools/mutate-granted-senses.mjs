#!/usr/bin/env node
/**
 * mutate-granted-senses — can verify-granted-senses fail?
 *
 * NEW at 3.398.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE MISTAKE THIS FILE ALREADY CAUGHT ONCE. `grantedSenseBlock`
 * shipped its first draft with `special: true`, copied from Blindsight
 * without asking what the flag did — and Chapter 8's "All special senses
 * (except Nightvision) have half the range of a normal sense" is
 * implemented, so every Detect Life would have reached 15 feet where the
 * ruling says 30. Nothing would have errored. The sheet would simply
 * have shown half, and no card would have said why.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SRC = path.join(SYSTEM_ROOT, "module", "senses.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-granted-senses.mjs");

const MUTATIONS = [
  {
    name: "THE HALVING: a granted sense claims to be a special sense",
    file: SRC,
    from: "  const block = { category: key };",
    to: "  const block = { category: key, special: true };",
    breaks: "B2/B2b — every Detect Life reaches 15 feet instead of 30, silently"
  },
  {
    name: "an unknown category is built anyway",
    file: SRC,
    from: "  if (!SENSE_CATEGORIES[key]) return null;",
    to: "  if (false) return null;",
    breaks: "A3/C1 — a misspelled category makes senseOf return null and the spell grants nothing"
  },
  {
    name: "the category stops being normalised",
    file: SRC,
    from: '  const key = String(category ?? "").trim().toLowerCase();',
    to: "  const key = String(category ?? \"\");",
    breaks: "A6 — a category typed with a capital silently grants nothing"
  },
  {
    name: "a range is baked into the block",
    file: SRC,
    from: "  const block = { category: key };",
    to: "  const block = { category: key, fixedFeet: 30 };",
    breaks: "B1/B3/B4 — the sense stops growing with Wisdom and freezes at the authored number"
  },
  {
    name: "the substitution is dropped instead of carried",
    file: SRC,
    from: "  if (roll) block.rollWith = roll;",
    to: "  void roll;",
    breaks: "D2/D3 — nothing rolls it for the player, so losing the text loses the rule"
  },
  {
    name: "what the sense detects is dropped",
    file: SRC,
    from: "  if (found) block.finds = found;",
    to: "  void found;",
    breaks: "D1b — the field is lost while the prose survives, which is how this one hid"
  },
  {
    // THE COLLISION, restored. `detects` on a resolved sense means the
    // detection QUALITY; using it for the quarry puts two meanings on
    // one word in two layers.
    name: "the quarry is recorded under the name the output uses for quality",
    file: SRC,
    from: "  if (found) block.finds = found;",
    to: "  if (found) block.detects = found;",
    breaks: "D1b/D1c — one word, two meanings, and no error either way"
  },
  {
    // A MODALITY WOULD BE INVENTED DATA. The book names no organ for
    // either spell, and guessing one would let an Enhanced feat double a
    // sense the chapter never said it reaches.
    name: "a modality is invented for a granted sense",
    file: SRC,
    from: "  const block = { category: key };",
    to: '  const block = { category: key, modality: "visual" };',
    breaks: "D8 — Enhanced Vision starts doubling a sense the book gives no organ"
  },
  {
    name: "the note stops naming the skill to roll",
    file: SRC,
    from: '    roll ? `Roll ${roll} in place of Perception.` : ""',
    to: '    ""',
    breaks: "D2 — the one place the player is told what to roll"
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

const guard = guardFiles([SRC, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-granted-senses: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-granted-senses: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-granted-senses: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
