#!/usr/bin/env node
/**
 * mutate-stale-note-feats — can verify-stale-note-feats actually fail?
 *
 * NEW at 3.379.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE TWO WORTH READING restore the state both feats were ACTUALLY in
 * before this release: no automation entry at all, the engine sitting
 * one identifier away under another feat's name.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FEATS = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const WORK = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED STATE: Furry Friend has no automation at all",
    file: WORK,
    from: '  "furry friend": {',
    to: '  "furry friend NOT WIRED": {',
    breaks: "D1 — the state the feat was in, with the engine one name away"
  },
  {
    name: "THE SHIPPED STATE: Elevated Lineage has no automation at all",
    file: WORK,
    from: '  "elevated lineage": {',
    to: '  "elevated lineage NOT WIRED": {',
    breaks: "D3 — likewise, beside the compendium it needed"
  },
  {
    name: "Furry Friend grows its own familiar creator",
    file: WORK,
    from: '  "furry friend": {\n    hint: "Choose a form and summon your familiar as a linked actor. Gnomes traditionally choose a burrowing animal — the form is appearance only.",\n    async use(actor, item) {\n      const { createFamiliarFor } = await import("./familiar-workflow.mjs");\n      await createFamiliarFor(actor, item);\n    }\n  },',
    to: '  "furry friend": {\n    hint: "Choose a form and summon your familiar as a linked actor. Gnomes traditionally choose a burrowing animal — the form is appearance only.",\n    async use(actor, item) {\n      const { familiarActorData } = await import("./familiar.mjs");\n      void familiarActorData; void actor; void item;\n    }\n  },',
    breaks: "D2 — a second path would let one character hold two familiars"
  },
  {
    name: "another race's heritages are offered too",
    file: FEATS,
    from: "    .filter((h) => String(h?.system?.sourceRace ?? \"\").trim().toLowerCase()\n      === ELEVATED_LINEAGE_SOURCE_RACE.toLowerCase())",
    to: "    .filter((h) => Boolean(h?.system))",
    breaks: "A1/A2 — a half-elf could claim a dwarf's ancestry"
  },
  {
    name: "the offered list stops being sorted",
    file: FEATS,
    from: "    .sort((a, b) => String(a.name ?? \"\").localeCompare(String(b.name ?? \"\")));",
    to: "    .slice();",
    breaks: "A3 — the dialog's rows would reorder between openings"
  },
  {
    name: "a second heritage is allowed onto the actor",
    file: FEATS,
    from: "  if (hasHeritage) {\n    return \"this character already has a heritage — remove it first, since a character has only one\";\n  }",
    to: "  void hasHeritage;",
    breaks: "A7/A8 — a feat quietly adding a second heritage behind the sheet's warning"
  },
  {
    name: "an empty compendium is accepted silently",
    file: FEATS,
    from: "  if (!Number(choiceCount)) {\n    return \"no elf heritages were found in the compendium\";\n  }",
    to: "  void choiceCount;",
    breaks: "A9 — an empty dialog with nothing to pick and no explanation"
  },
  {
    name: "a refusal stops explaining itself",
    file: FEATS,
    from: "    return \"this character already has a heritage — remove it first, since a character has only one\";",
    to: "    return \"no\";",
    breaks: "A11 — the anti-silence rule at the one place a user reads"
  },
  {
    name: "a heritage with nothing in it is reported as mechanical",
    file: FEATS,
    from: "  return { conditionals, grants, mechanical: conditionals + grants > 0 };",
    to: "  return { conditionals, grants, mechanical: true };",
    breaks: "B3 — Drelvarni would claim benefits it does not have"
  },
  {
    name: "granted feats stop counting as mechanics",
    file: FEATS,
    from: "  const listed = [heritage?.system?.grantedFeats, heritage?.system?.racialAbilities]",
    to: "  const listed = [heritage?.system?.nothingAtAll]",
    breaks: "B4/B5 — a heritage that grants a feat would read as empty"
  },
  {
    name: "the chosen heritage skips the grant path",
    file: WORK,
    from: "      if (added) await applyAllGrants(actor, added);",
    to: "      void added;",
    breaks: "D5 — granted feats and abilities would never arrive"
  },
  {
    name: "an empty heritage is applied without saying so",
    file: WORK,
    from: "          + (m.mechanical",
    to: "          + (true",
    breaks: "D6 — the player could not tell success from a broken feat"
  },
  {
    name: "the dialog stops showing what each heritage does",
    file: WORK,
    from: "          : \"no mechanical effect recorded\";",
    to: "          : \"\";",
    breaks: "D7 — choosing blind between six names"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-stale-note-feats.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([FEATS, WORK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-stale-note-feats: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-stale-note-feats: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-stale-note-feats: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
