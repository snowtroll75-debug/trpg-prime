#!/usr/bin/env node
/**
 * mutate-spell-book-fields — can verify-spell-book-fields fail?
 *
 * NEW at 3.389.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST TWO ARE THE SHIPPED STATE. M1 blanks a Targets line the way
 * the import did on sixteen spells — thirteen of which then could not be
 * aimed at anything, silently. M2 restores a run-on Range, the shape four
 * entries arrived in because the book's own markup separated the fields
 * with a space instead of "; ".
 *
 * MUTATING THE REFERENCE, NOT THE PACK. The pack is binary LevelDB and
 * every edit to it is a declared row in data-fixes.json; a mutation
 * harness must not write to it. `tools/spell-book-fields.json` is the
 * other half of the comparison and mutating it exercises the same
 * assertions from the opposite side — a book value the pack no longer
 * matches is exactly what a lost field looks like.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const REF = path.join(SYSTEM_ROOT, "tools", "spell-book-fields.json");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-spell-book-fields.mjs");

const MUTATIONS = [
  {
    // ANCHORED ON THE WHOLE ENTRY. `"targets": "1 animal"` alone matches
    // five spells, and an ambiguous anchor is a failure here rather than a
    // silent mutation of whichever came first.
    name: "THE SHIPPED BUG: a spell's Targets line goes missing",
    file: REF,
    from: '"name": "HOLD ANIMAL",\n  "pp": 4,\n  "traits": "E NCHANTMENT M ENTAL S AVE",\n  "tradition": "verdant",\n  "cast": "2 AP (material, somatic)",\n  "range": "30 feet",\n  "area": "",\n  "targets": "1 animal",',
    to: '"name": "HOLD ANIMAL",\n  "pp": 4,\n  "traits": "E NCHANTMENT M ENTAL S AVE",\n  "tradition": "verdant",\n  "cast": "2 AP (material, somatic)",\n  "range": "30 feet",\n  "area": "",\n  "targets": "",',
    breaks: "C2 — exactly how sixteen spells lost the field that lets them be aimed"
  },
  {
    name: "a PP cost disagrees with the printed entry",
    file: REF,
    from: '"name": "GHOST SOUND",\n  "pp": 0,',
    to: '"name": "GHOST SOUND",\n  "pp": 99,',
    breaks: "C1 — the field-by-field comparison stops noticing"
  },
  {
    // THE SAVE RULE MUST STAY NARROW. It forgives a save the pack holds
    // and the book's header lacks ONLY when the trait line says SAVE.
    // Scrying has a Will save and NO save trait, so blanking its printed
    // save must NOT be forgiven — if it is, the rule has become a blanket.
    name: "THE RULE'S EDGE: a save vanishes from a spell with no SAVE trait",
    file: REF,
    from: '"duration": "sustained up to 10 minutes",\n  "save": "Will",',
    to: '"duration": "sustained up to 10 minutes",\n  "save": "",',
    breaks: "C1 — an unexplained save on a non-SAVE spell would be forgiven"
  },
  {
    name: "a tradition genuinely disagrees, not the 'all' expansion",
    file: REF,
    from: '"name": "HOLD ANIMAL",\n  "pp": 4,\n  "traits": "E NCHANTMENT M ENTAL S AVE",\n  "tradition": "verdant",',
    to: '"name": "HOLD ANIMAL",\n  "pp": 4,\n  "traits": "E NCHANTMENT M ENTAL S AVE",\n  "tradition": "divinity",',
    breaks: "C1 — a real tradition difference must not pass as the 'all' shorthand"
  },
  {
    name: "a printed spell is renamed, so the pack appears to be missing it",
    file: REF,
    from: '"name": "GLITTERDUST",',
    to: '"name": "GLITTERDUSTX",',
    breaks: "B1 — a spell in the book with no entry in the pack"
  },
  {
    name: "a duration disagrees with the printed entry",
    file: REF,
    from: '"name": "SCRYING",\n  "pp": 12,\n  "traits": "I NSIGHT S CRYING U TILITY",\n  "tradition": "arcane, ethereal",\n  "cast": "10 minutes (material, somatic, verbal)",\n  "range": "planetary",\n  "area": "",\n  "targets": "1 creature",\n  "duration": "sustained up to 10 minutes",',
    to: '"name": "SCRYING",\n  "pp": 12,\n  "traits": "I NSIGHT S CRYING U TILITY",\n  "tradition": "arcane, ethereal",\n  "cast": "10 minutes (material, somatic, verbal)",\n  "range": "planetary",\n  "area": "",\n  "targets": "1 creature",\n  "duration": "10 years",',
    breaks: "C1 — a duration that disagrees with the book stops being reported"
  },
  {
    // A DECLARATION THAT NO LONGER DESCRIBES REALITY is a comment
    // pretending to be a guard.
    name: "a declared exception goes stale and nothing notices",
    file: CHECK,
    // RE-ANCHORED TWICE. At 3.441.0 it moved off DEIFICPRESENCE, whose
    // declaration Core 3.7 retired, onto Surge Of The Tempest — and at
    // 3.442.0 Flaming Sphere was declared with the SAME pack/book pair,
    // so that anchor started matching twice and the mutation stopped
    // running at all. Now on Magnificent Dawn, whose pair is unique and
    // whose declaration is a refusal nothing is likely to duplicate.
    from: '    pack: "", book: "see below",',
    to: '    pack: "Reflex", book: "see below",',
    breaks: "D1 — the exception no longer matches what the pack holds"
  },
  {
    name: "a declared exception loses its reason",
    file: CHECK,
    // RE-ANCHORED at 3.441.0: this pointed at FATIGUE|duration, retired
    // by Core 3.7. `why:` on the Magnificent Dawn entry now carries it.
    from: "    why: \"RULED 25 August 2026: leave manual and do not state a save. The save genuinely differs by creature type \u2014 every creature rolls Reflex against blinding, and for Ooze and Undead the same roll is ALSO a Basic save against 100 Essence damage. The pack named it Reflex, right for most and wrong for the two that matter, and data fix magnificent-dawn-defence cleared it. A blank here is a DECLARED REFUSAL: the engine rolls nothing rather than rolling the wrong thing for an Undead.\"",
    to: '    why: "no.',
    breaks: "D2 — 'declared' degrades into 'listed', which is a shrug with a name"
  },
  {
    // THE CHECK ADDED AT 3.441.0, and it caught four dead declarations
    // the hour it was written. Healing the difference here proves D1b
    // goes red rather than quietly accepting an exception that has
    // stopped being one.
    file: CHECK,
    name: "a declaration whose difference has healed is accepted",
    // MAKES A DECLARATION HEAL rather than disabling the guard: with the
    // book side read from the pack, every live exception's difference has
    // gone and D1b must say so. Disabling the comparison outright proved
    // nothing, because with no declaration currently healed there was
    // nothing for it to stop reporting — caught by the mutation runner on
    // the first attempt.
    from: "  const bookNow = b ? (field === \"save\" ? b.save : b[field]) : null;",
    to: "  const bookNow = p ? (field === \"save\" ? p.defence : p[field]) : null;",
    breaks: "D1b — a comment pretending to be a guard, which is what section D exists to catch"
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

const guard = guardFiles([REF, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-book-fields: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-spell-book-fields: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-spell-book-fields: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
