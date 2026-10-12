#!/usr/bin/env node
/**
 * mutate-chapter5-archetype-111-120 — can the block-11 checks fail?
 *
 * NEW at 3.568.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST FOUR PUT THE TREE BACK INTO THE STATE THE AUDIT FOUND IT IN:
 * three empty progression fields and a header comment saying they were
 * meant to be empty. That combination is why the gate was missing for
 * three releases, and if this file cannot reproduce it then section A
 * proves nothing.
 *
 * THE REST ARE THE READINGS A HURRIED EDITOR WOULD MAKE — an AND relaxed
 * to an OR, a condition "simplified" to whichever-is-higher, a margin
 * boundary moved by one.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const PROG = path.join(SYSTEM_ROOT, "module", "archetype-progression.mjs");
const TRACKS = path.join(SYSTEM_ROOT, "module", "assess-tracks.mjs");
const ACTIONS = path.join(SYSTEM_ROOT, "module", "data", "skill-actions.mjs");
const WORKFLOW = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter5-archetype-111-120.mjs");

/** Pack edits, through the same guard the source files get. */
const PACK_MUTATIONS = [
  {
    name: "THE SHIPPED DEFECT: Assassin's progression field is empty again",
    item: "Assassin",
    editItem: (doc) => { doc.system.progressionRequirements = ""; },
    breaks: "A1/A5/A10 — the archetype gate opens for an Assassin at any ranks"
  },
  {
    name: "Gymnast's field is empty again",
    item: "Gymnast",
    editItem: (doc) => { doc.system.progressionRequirements = ""; },
    breaks: "A2/A6/A14 — same defect, one archetype over"
  },
  {
    name: "Mastermind's field is empty again",
    item: "Mastermind",
    editItem: (doc) => { doc.system.progressionRequirements = ""; },
    breaks: "A3/A7/A17 — same defect again"
  },
  {
    // THE TEMPTING CONSISTENCY. Four archetypes, three now filled — so
    // fill the fourth. Enigma prints nothing, and inventing a requirement
    // for it would be writing a rule rather than recording one.
    name: "Enigma is given a requirement to match the other three",
    item: "Enigma",
    editItem: (doc) => { doc.system.progressionRequirements = "Arcana +10 ranks"; },
    breaks: "A4 — a rule invented to make a set look tidy"
  },
  {
    // MASTERMIND'S SEVEN ARE NOT LOREMASTER'S SEVEN — Crafting where the
    // other has Linguistics. A copy-paste between them is the likeliest
    // way this data goes wrong, and it would be invisible in play.
    name: "Mastermind's list is copy-pasted from Loremaster's",
    item: "Mastermind",
    editItem: (doc) => {
      doc.system.progressionRequirements =
        "Arcana, Culture, Linguistics, Nature, Occultism, Planes or Religion +10 ranks";
    },
    breaks: "A20 — Linguistics would satisfy an archetype that does not name it"
  },
  {
    name: "the Assess Tracks feat is removed from the pack",
    item: "Assess Tracks",
    editItem: (doc) => { doc.name = "Assess Tracks (removed)"; },
    breaks: "D7 — the action would be gated on a feat nobody can hold"
  },
  {
    // THE PACK CORRECTED TO MATCH THE BOOK'S TYPO. E1 is a book erratum;
    // "tidying" the pack to agree with it would break the prerequisite.
    name: "Beyond Reach's prerequisite is 'corrected' to the book's typo",
    item: "Beyond Reach",
    editItem: (doc) => { doc.system.prerequisites = "Acrobatics10 ranks"; },
    breaks: "E3 — the pack made wrong to match a misprint"
  }
];

const MUTATIONS = [
  {
    // THE COMMENT THAT HID THE DEFECT, restored. It is prose, and that is
    // the point: it is what stopped anyone looking.
    file: PROG,
    name: "the false claim about all four archetypes comes back",
    from: " * THIS PARAGRAPH USED TO SAY SOMETHING FALSE, and the block-11 audit of",
    to: " * Four archetypes (Assassin, Enigma, Gymnast, Mastermind) print no Progression Requirements sentence at all. Also:",
    breaks: "C1 — the cover story returns"
  },
  {
    file: PROG,
    name: "and the true part of it is dropped with the false part",
    from: " * Occultism, Planes or Religion +10 ranks\". Only ENIGMA genuinely prints",
    to: " * Occultism, Planes or Religion +10 ranks\". None of them prints",
    breaks: "C2 — deleting the wrong claim without keeping the right one invites the edit back"
  },
  {
    // R1 REVERSED. An AND read as an OR halves the requirement, and a gate
    // that opens too early looks exactly like a gate that is satisfied.
    file: PROG,
    name: "the AND shape is relaxed back to an OR",
    from: '  return { type: hasAnd ? "skillAll" : "skillAny", keys, min: Number(m[2]) };',
    to: '  return { type: "skillAny", keys, min: Number(m[2]) };',
    breaks: "A8/A11/A12/B1 — Perception alone would satisfy an Assassin"
  },
  {
    file: PROG,
    name: "the AND matcher accepts any one of the named skills",
    from: "      return parsed.keys.every((key) => Number(actorStats.skillRanks?.[key] ?? 0) >= parsed.min);",
    to: "      return parsed.keys.some((key) => Number(actorStats.skillRanks?.[key] ?? 0) >= parsed.min);",
    breaks: "A11/A12 — the shape is right and the arithmetic is not"
  },
  {
    file: PROG,
    name: "'both' is treated as a skill name",
    from: '    .replace(/\\s+both$/i, "")',
    to: "",
    breaks: "B2 — the whole clause goes unparsed, so the gate silently reopens"
  },
  {
    file: PROG,
    name: "a line using both joiners is guessed at instead of refused",
    from: "  if (hasOr && hasAnd) return null;",
    to: "",
    breaks: "B5 — an ambiguous requirement resolved by regex ordering"
  },
  {
    // R2 REVERSED. "or their Survival DC IF they are covering" is a
    // condition; the higher-of-two would gate an unwary quarry on a
    // Survival DC they were not using.
    file: TRACKS,
    name: "the covering condition becomes whichever DC is higher",
    from: "    return survival === null\n      ? { dc: level, label: \"their Level DC (no Survival DC on the sheet)\" }\n      : { dc: survival, label: \"their Survival DC (actively covering their tracks)\" };",
    to: "    return { dc: Math.max(Number(level ?? 0), Number(survival ?? 0)), label: \"the higher DC\" };",
    breaks: "D10/D12 — a lower Survival DC would stop being used"
  },
  {
    file: TRACKS,
    name: "a margin that merely meets the DC earns a detail",
    from: "  return over > 0 ? over : 0;",
    to: "  return over >= 0 ? over + 1 : 0;",
    breaks: "D13 — 'exceeds' read as 'meets', which is the boundary the sentence turns on"
  },
  {
    file: TRACKS,
    name: "the card picks the details instead of listing them",
    from: "    + `size, obvious supernatural traits — the GM chooses which, as printed.`;",
    to: "    + `- climb speed, swim speed and size.`;",
    breaks: "D19 — R2's line moves, and what the card prints becomes the rule"
  },
  {
    file: ACTIONS,
    name: "Assess Tracks stops being gated on its feat",
    from: '    requiresFeat: "Assess Tracks",',
    to: "",
    breaks: "D6 — every tracker gets a class feat's trick"
  },
  {
    file: ACTIONS,
    name: "the two DC sources are declared as an array after all",
    from: '    against: "levelDC",\n    // GATED ON THE FEAT',
    to: '    against: ["levelDC", "skillDC:survival"],\n    // GATED ON THE FEAT',
    breaks: "D4/D5 — the engine would take the higher of two, which is the wrong rule"
  },
  {
    file: WORKFLOW,
    name: "the payout is driven by the degree rather than the margin",
    from: "          ? assessTracksNote(Number(checkMargin ?? 0), targetActor?.name ?? \"\")",
    to: "          ? assessTracksNote(0, targetActor?.name ?? \"\")",
    breaks: "D23 — every success would learn the Speed and nothing else"
  },
  {
    // THE DEFECT LIVE TESTING FOUND. `DEGREES` is an array; indexing it
    // with the degree KEY is undefined, so every success took the failure
    // branch and the card read "You learn nothing" directly under a check
    // card that said Success.
    file: WORKFLOW,
    name: "the success test indexes DEGREES by key again",
    from: "      const succeeded = Boolean(DEGREE_BY_KEY[degree]?.success);",
    to: "      const succeeded = Boolean(DEGREES[degree]?.success);",
    breaks: "D25/D27 — every successful reading prints the failure line"
  },
  {
    file: WORKFLOW,
    name: "the DC override stops being an action.key test",
    from: '  if (action.key === "assessTracks" && assessTracksSetup && targetActor) {',
    to: "  if (assessTracksSetup && targetActor) {",
    breaks: "D22 — verify-action-default-dc reads this file for exactly that shape"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const { ClassicLevel } = await import("classic-level");
const PACK = path.join(SYSTEM_ROOT, "packs", "feats");
async function withPack(fn) {
  const db = new ClassicLevel(PACK, { valueEncoding: "json" });
  await db.open();
  try { return await fn(db); } finally { await db.close(); }
}

const guard = guardFiles([PROG, TRACKS, ACTIONS, WORKFLOW, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter5-archetype-111-120: verify already fails on an unmodified tree.\n");
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

  for (const m of PACK_MUTATIONS) {
    const state = await withPack(async (db) => {
      let key = null; let value = null;
      for await (const [k, v] of db.iterator()) {
        if (k.startsWith("!items!") && !k.slice(7).includes("!") && v?.name === m.item) { key = k; value = v; }
      }
      if (!key) return "ANCHOR MISSING";
      const restore = JSON.parse(JSON.stringify(value));
      const edited = JSON.parse(JSON.stringify(value));
      m.editItem(edited);
      await db.put(key, edited);
      return { key, restore };
    });
    if (typeof state === "string") { results.push({ name: m.name, state }); continue; }
    const survived = run();
    await withPack((db) => db.put(state.key, state.restore));
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
    ? `\nmutate-chapter5-archetype-111-120: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter5-archetype-111-120: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
