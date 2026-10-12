#!/usr/bin/env node
/**
 * mutate-condition-names-resolve — can verify-condition-names-resolve fail?
 *
 * NEW at 3.488.0.
 *
 * D1 IS THE SHIPPED DEFECT, restored literally: put "Fascinated" back in
 * critical row 87–88 and the check must catch it. That row lived in the
 * data for months applying half of what it printed, and no check in this
 * repo noticed.
 *
 * M1–M4 ARE THE ONES THAT MATTER MOST, and they attack the CHECK rather
 * than the data. Every check here is built on two discovery matchers, and
 * a matcher that stops matching turns twenty-two assertions into
 * twenty-two vacuous truths without failing anything. That is not a
 * hypothetical: `verify-checks-read-source` had exactly this done to it
 * twice in two days, and `lib/blank-read.mjs` exists because a check once
 * read an empty file and passed. So the matchers are attacked directly.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const C = path.join(SYSTEM_ROOT, "module", "data", "critical-tables.mjs");
const S = path.join(SYSTEM_ROOT, "module", "data", "skill-actions.mjs");
const P = path.join(SYSTEM_ROOT, "module", "effect-parser.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-condition-names-resolve.mjs");

const MUTATIONS = [
  /* ── D: the data ───────────────────────────────────────────────── */
  {
    file: C,
    name: "D1 THE SHIPPED DEFECT: row 87–88 names Fascinated again",
    from: "The target gains the Fixated condition towards you and is Injured 1.",
    to: "The target gains the Fascinated condition towards you and is Injured 1.",
    breaks: "D1/F1/F2 — the row applies Injured 1 and silently drops the fixation"
  },
  {
    file: C,
    name: "D2 a different row invents an unknown condition",
    from: '"effect": "Target suddenly kicks out at you.',
    to: '"effect": "The target gains the Bedazzled condition. Target suddenly kicks out at you.',
    breaks: "D1 — the rule is general, not a check for one known word"
  },
  {
    file: C,
    name: "D3 an applying row names a VALUED condition with no number",
    from: "and gains the Fleeing condition",
    to: "and gains the Injured condition",
    breaks: "D1 — \"the Injured condition\" applies no amount of anything"
  },
  {
    file: C,
    name: "D4 the duration clause is rewritten as a second application",
    from: "until the Stunned condition ends",
    to: "and gains the Stunned condition",
    breaks: "D1/E1 — a bare Stunned applies nothing, and the exclusion no longer covers it"
  },

  /* ── M: the matchers, which is where a check goes quietly blind ─── */
  {
    file: V,
    name: "M1 the applying matcher loses its verbs",
    from: "const APPLYING = /\\b(?:gains?|gaining|have|has)\\s+the\\s+([A-Za-z][A-Za-z-]*)\\s+condition\\b/gi;",
    to: "const APPLYING = /\\b(?:zzz)\\s+the\\s+([A-Za-z][A-Za-z-]*)\\s+condition\\b/gi;",
    breaks: "D0 — a matcher that finds nothing makes D1 vacuously true"
  },
  {
    file: V,
    name: "M2 the wider matcher loses its verbs too",
    from: "const ANY_MENTION = /\\bthe\\s+([A-Za-z][A-Za-z-]*)\\s+condition\\b/gi;",
    to: "const ANY_MENTION = /\\bthe\\s+(zzz)\\s+condition\\b/gi;",
    breaks: "D0b/R0b — the ratchet would report a clean sweep of nothing"
  },
  {
    file: V,
    name: "M3 the table list is emptied",
    from: '  "critical-tables.mjs", "fumble-tables.mjs", "spell-tables.mjs",',
    to: "",
    breaks: "D0 — reading no tables passes every assertion about the tables"
  },
  {
    file: V,
    name: "M4 the pack loop stops opening packs",
    from: "    await db.open();",
    to: "    if (pack) { await db.close().catch(() => {}); continue; }",
    breaks: "R0/R0b — an empty sweep declares the vocabulary clean"
  },

  /* ── T: the two tests that are deliberately different ──────────── */
  {
    file: V,
    name: "T1 the ratchet asks the parse question instead of the vocabulary one",
    from: "        if (isKnownName(word)) continue;",
    to: "        if (appliesCleanly(word)) continue;",
    breaks: "R1 — eight real valued conditions would be reported as unknown words"
  },
  {
    file: V,
    name: "T2 the applying check asks the vocabulary question instead of the parse one",
    from: "const unresolvedIn = (rows) => rows.filter((a) => !appliesCleanly(a.name));",
    to: "const unresolvedIn = (rows) => rows.filter((a) => !isKnownName(a.name));",
    breaks: "D1b — the weakened filter would accept \"gains the Injured condition\", which applies nothing"
  },
  {
    // WHAT THIS ONE ACTUALLY ESTABLISHES, having first been written to
    // claim something it could not: the R section now reads the TABLES,
    // not only the packs. An unknown condition name in a non-applying
    // role — the grammatical role section D deliberately ignores — used
    // to pass both sections. Fascinated itself was caught only because
    // it happened to sit behind an applying verb.
    //
    // The capitalisation discriminator is NOT what this proves. Dropping
    // it sends every unknown to the prose bucket, and R4 ratchets that
    // bucket too, so the word is still reported — just under a different
    // heading. The split decides which question the reader is asked, not
    // whether they are asked one; T3b, which INVERTS it, is the mutation
    // that breaks a rule rather than a message.
    file: C,
    name: "T3 an unknown condition in a NON-applying role, which section D ignores",
    from: '"effect": "The target looks surprised to see you vanish',
    to: '"effect": "This lasts while the Bedazzled condition holds. '
      + 'The target looks surprised to see you vanish',
    breaks: "R1 — the vocabulary sweep must read the tables, not only the packs"
  },
  {
    file: V,
    name: "T3b or inverted, so prose is treated as vocabulary",
    from: "        const bucket = /^[A-Z]/.test(word) ? unknownNames : proseWords;",
    to: "        const bucket = /^[A-Z]/.test(word) ? proseWords : unknownNames;",
    breaks: "R1/R4b — \"the pack condition\" would be reported as a missing condition"
  },

  /* ── E: the exclusions, held against real text ─────────────────── */
  {
    file: S,
    name: "E1 the prerequisite row is rewritten as an application",
    from: "adjacent creature with the Dying condition",
    to: "adjacent creature and gains the Dying condition",
    breaks: "E2/E2b — Treat Wounds would be read as inflicting the condition it treats"
  },
  {
    file: C,
    name: "E2 the row that justifies the duration exclusion stops applying its Stun",
    from: "Target is Stunned 2 and is Injured 2 until the Stunned condition ends",
    to: "Target is Injured 2 until the Stunned condition ends",
    breaks: "E1c — the exclusion is only safe while the row applies the condition first"
  },

  /* ── P: the parser the whole check depends on ──────────────────── */
  {
    file: P,
    name: "P3 THE SECOND RULING: Drained stops meaning Soul Drain",
    from: '  soulDrain: ["drained"]',
    to: "  soulDrain: []",
    breaks: "R3b — Graham ruled Drained is the book's loose word for Soul Drain"
  },
  {
    file: P,
    name: "P4 the alias points at the wrong condition",
    from: '  soulDrain: ["drained"]',
    to: '  soulDrain: ["drained"],\n  injured: ["drained"]',
    breaks: "R3b — \"Drained 3\" must read as 3 Soul Drain and nothing else"
  },
  {
    file: V,
    name: "T4 the vocabulary test goes back to a hand-built list",
    // THE MUTATION THAT WOULD HAVE SHIPPED. The first version of this
    // check walked the registry and built its own set of keys and
    // labels, which could not see LABEL_ALIASES at all — so on the day
    // the Drained ruling landed it would have gone on calling Drained
    // unknown. Restored here so the check cannot drift back to holding
    // its own copy of a vocabulary it does not own.
    from: "const isKnownName = (name) => extractConditionTags(`gains the ${name} condition`).length > 0\n"
      + "  || extractConditionTags(`gains ${name} 1`).length > 0;",
    to: "const isKnownName = (name) => Object.entries(CONDITIONS)\n"
      + "  .some(([k, d]) => [k, d.label].some((w) => String(w).toLowerCase().replace(/[\\s-]/g, \"\")\n"
      + "    === String(name).toLowerCase().replace(/[\\s-]/g, \"\")));",
    breaks: "R1/R3b — a list built here cannot see the parser's aliases"
  },
  {
    file: P,
    name: "P1 boolean conditions stop being matched by their label",
    // RETARGETED AT 3.581.0. The boolean branch used to be a loop of its
    // own with a `found.has` guard; `conditionMentions` merged the two
    // loops and the guard moved into `tagsFrom`. The line below is the
    // one that decides a boolean mention counts at all.
    from: "          if (!def.valued && !mentionIsLiteral(str, key, match.index, match[0].length)) continue;",
    to: "          if (!def.valued) continue;",
    breaks: "D1/F2/E3b — Fixated, Prone and Fleeing would all apply nothing"
  },
  {
    file: P,
    name: "P2 valued conditions start matching without a number",
    // REWRITTEN AT 3.581.0. The old anchor held three lines — a comment
    // and a loop header it did not change — because `if (!def.valued)
    // continue;` was byte-identical in two places. `conditionMentions`
    // replaced that pair of loops with one, so the line below is unique
    // on its own and the anchor is the line that actually decides.
    from: "    const patterns = def.valued",
    to: "    const patterns = false",
    breaks: "E3 — the stated reason the duration and prerequisite rows are excluded"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([C, S, P, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-condition-names-resolve: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-condition-names-resolve: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-condition-names-resolve: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
