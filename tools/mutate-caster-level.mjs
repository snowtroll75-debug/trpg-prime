#!/usr/bin/env node
/**
 * mutate-caster-level — can verify-caster-level fail?
 *
 * NEW at 3.385.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION RESTORES THE SHIPPED BUG: the character-level
 * fallback, which made a 10th-level Arcanist cast cantrips at caster
 * level 10 and handed a Fighter with Mystical Conduit +5 HP on every
 * heal. It shipped for months and a live-testing pass reported it as
 * correct behaviour, so this is the one that must never be quiet again.
 *
 * THE SECOND IS THE ONE THE OLD HARNESS COULD NOT HAVE CAUGHT. It makes
 * a Knight feat resolve to character level too, so a Knight and a
 * Fighter agree — every individual expectation still looks plausible,
 * and only section D's "these must differ" notices.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FEATC = path.join(SYSTEM_ROOT, "module", "magic", "feat-casting.mjs");
const ARCH = path.join(SYSTEM_ROOT, "module", "magic", "archetype-casting.mjs");
const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-caster-level.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED BUG: the character-level fallback comes back",
    file: FEATC,
    from: '  if (hasKnightFeat) return { value: floor, source: "feat" };\n  return { value: 0, source: "none" };',
    to: '  if (hasKnightFeat) return { value: floor, source: "feat" };\n  return { value: characterLevel, source: "level" };',
    breaks: "B1/D3 — an Arcanist casts cantrips at caster level 10 again"
  },
  {
    name: "TWO CHARACTERS COLLAPSE: a Knight feat resolves to character level",
    file: FEATC,
    from: "  const floor = hasKnightFeat ? knightCasterLevel(characterLevel) : 0;",
    to: "  const floor = hasKnightFeat ? characterLevel : 0;",
    breaks: "A3/D1 — a Knight and a Fighter agree, and each looks reasonable alone"
  },
  {
    name: "the Knight floor becomes a replacement, costing a Cleric levels",
    file: FEATC,
    from: "    return floor > fromClass",
    to: "    return hasKnightFeat",
    breaks: "A5/A6 — taking the feat makes a 10th-level Cleric worse"
  },
  {
    name: "half your level stops rounding up",
    file: FEATC,
    from: "  return Math.ceil(Math.max(0, Number(level) || 0) / 2);",
    to: "  return Math.floor(Math.max(0, Number(level) || 0) / 2);",
    breaks: "A3/B8 — a 9th-level Knight loses a caster level"
  },
  {
    // "none" AND A CLASS TABLE OF 0 ARE DIFFERENT FACTS. Collapsing them
    // makes the sheet unable to tell "you have not earned one" from "your
    // class casts at 0 here", and silences the archetype note.
    name: "'none' becomes indistinguishable from a class table printing 0",
    file: FEATC,
    from: '  return { value: 0, source: "none" };',
    to: '  return { value: 0, source: "class" };',
    breaks: "B2/C1 — the archetype note never appears and the field reads as fixed"
  },
  {
    name: "THE NOTE GOES SILENT: it fires for nobody",
    file: ARCH,
    from: '  if (String(casterLevelSource ?? "").trim().toLowerCase() !== "none") return "";',
    to: '  if (true) return "";',
    breaks: "C1 — a player sees Caster Level 0 with no way to tell rule from bug"
  },
  {
    // A NOTE THAT NAMES THE WRONG FEAT IS WORSE THAN NO NOTE — it sends a
    // Priest off to buy Arcane Knight.
    name: "the note names whichever knight feat comes first",
    file: ARCH,
    from: '  const linked = Object.values(knightTable ?? {})\n    .find((entry) => String(entry?.tradition ?? "").trim().toLowerCase() === tradition);',
    to: "  const linked = Object.values(knightTable ?? {})[0];",
    breaks: "C3 — every archetype is told to take the same feat"
  },
  {
    name: "the note also fires for a Cleric who happens to hold Arcanist",
    file: ARCH,
    from: '  if (String(casterLevelSource ?? "").trim().toLowerCase() !== "none") return "";',
    to: '  if (String(casterLevelSource ?? "").trim().toLowerCase() === "override") return "";',
    breaks: "C4 — a caster is told they have no caster level"
  },
  {
    name: "the record of spell-warp's false claim is dropped",
    file: WARP,
    from: " * THAT SENTENCE WAS FALSE WHEN IT WAS WRITTEN, and became true at",
    to: " * That sentence has always been true, and became truer at",
    breaks: "E1 — the comment that predicted this ruling stops saying so"
  },
  {
    name: "Mystical Conduit's record is dropped too",
    file: EFFECTS,
    from: '          // "A NON-CASTER GAINS NOTHING" ONLY BECAME TRUE AT 3.385.0.',
    to: "          // A non-caster gains nothing, as always.",
    breaks: "E2 — a live bug that ran for months loses its only record"
  },
  {
    // THE BRANCH THE WHOLE FIX RESTS ON. The fallback was removed because
    // innate casting takes character level by name; if this ever goes, a
    // Fighter's spell-like silently drops to caster level 0.
    name: "THE LOAD-BEARING BRANCH: an innate cast stops using character level",
    file: CAST,
    // RE-ANCHORED AT 3.617.0: the innate level is the granting item's, or
    // the character's (item-innate-level.mjs).
    from: "      ? innateLevel",
    to: "      ? Number(system.magic?.casterLevelValue ?? 0)",
    breaks: "E3 — every innate spell-like on a non-caster drops to 0"
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

const guard = guardFiles([FEATC, ARCH, WARP, EFFECTS, CAST, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-caster-level: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-caster-level: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-caster-level: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
