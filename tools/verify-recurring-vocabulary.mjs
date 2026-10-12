#!/usr/bin/env node
/**
 * verify-recurring-vocabulary — the system says the word the book says.
 *
 * NEW at 3.441.1.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Graham, 29 August 2026, supplying Core 3.7: it *"corrects references to
 * persistent damage which should be recurring."*
 *
 * THE SYSTEM WAS ALREADY SPLIT ON IT, which is why this needed a check
 * rather than a find-and-replace. `conditions/registry.mjs` has said
 * `recurring` — label "Recurring Damage" — since the condition existed,
 * while 108 rows of the transcribed critical and fumble tables, the cast
 * card's own damage line, the alchemical bomb summary, the Life Stealing
 * rune, the Delay action's description and a Conviction option all said
 * *persistent*. A card read "Plus 1 persistent electricity damage" while
 * the token beside it read "Recurring Damage 1": one rule, two names,
 * and nothing in the system able to notice.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT IS A RATCHET OVER STRING LITERALS, NOT A LIST OF FILES.
 *
 * A list of the places that said the old word would be a list that stops
 * growing the day somebody writes a new card. So this reads every module
 * source, strips comments, and asks every STRING LITERAL whether it
 * contains the word — because a string literal is what reaches a player,
 * and a comment is not.
 *
 * Three kinds of thing are allowed to keep the old word, each named:
 *
 *   1. `persistence` — a different word entirely. It is the Persistence
 *      COLUMN of the critical tables (how long an injury lasts) and has
 *      644 uses that have nothing to do with this rename. Matched as a
 *      whole word so it can never be confused with the other.
 *   2. The parser's ALIAS, which must outlive the word: text written
 *      before the rename still exists in journals and homebrew, and an
 *      alias retired with the book only ever worked for text nobody had
 *      written yet.
 *   3. The stored FIELD NAME `system.damage.persistent`, which the book
 *      did not rename because the book cannot see it.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. THE WORD THE SYSTEM ALREADY AGREED ON
 * ================================================================== */

ok("A1 the condition is `recurring`", Boolean(CONDITIONS.recurring));
ok("A2 and its label is the book's words", CONDITIONS.recurring?.label === "Recurring Damage");
ok("A3 there is no `persistent` condition beside it",
  !CONDITIONS.persistent,
  "two names for one rule is what this release exists to end");

/* ================================================================== *
 * B. EVERY STRING LITERAL IN THE MODULE TREE
 * ================================================================== */

function sources(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (entry.name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

/**
 * Comments stripped, so a note ABOUT the old word is never mistaken for
 * a use of it. This file's own header would fail its own check otherwise.
 */
const stripComments = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * Every string literal — single, double and template — in one source.
 *
 * Deliberately simple: this is a vocabulary sweep, not a parser, and a
 * literal it misreads costs a false positive, which somebody then reads.
 * A false NEGATIVE would be the expensive direction and the crude
 * patterns here do not have one.
 */
function stringLiterals(source) {
  // INTERPOLATIONS COME OUT OF THE SOURCE FIRST, not out of each literal
  // afterwards. `${...}` is code, and code contains quotes: the second
  // draft of this reader stripped interpolations per-literal and the
  // double-quote pattern still matched a `"0"` sitting INSIDE one, so a
  // renamed sentence was reported as an offender because of the field
  // reference next to it. Repeated until nothing more comes out, so a
  // nested interpolation unwraps too.
  let code = stripComments(source);
  for (let pass = 0; pass < 5; pass += 1) {
    const next = code.replace(/\$\{[^{}]*\}/g, " ");
    if (next === code) break;
    code = next;
  }
  return [
    ...code.matchAll(/"((?:[^"\\\n]|\\.)*)"/g),
    ...code.matchAll(/'((?:[^'\\\n]|\\.)*)'/g),
    ...code.matchAll(/`((?:[^`\\]|\\.)*)`/g)
  ].map((m) => m[1]);
}

/**
 * The declared places the old word may still appear, each with its
 * reason. THIS LIST MAY ONLY SHRINK.
 */
const ALLOWED = Object.freeze({
  "module/effect-parser.mjs":
    "The LABEL ALIAS. Text written before Core 3.7 still exists in journals, homebrew items and "
    + "chat cards already posted; an alias retired with the book only ever worked for text nobody "
    + "had written yet. Its own header records this.",
  // 3.608.0. The manifest records each repaired field's OLD value verbatim,
  // because an owned copy is recognised as stale by matching it — and the
  // stored field is still named `persistent` (see cast-workflow's note that
  // the book renamed a rule, not a column).
  "module/data/pack-repairs.mjs":
    "The pack-repair manifest records every repaired field's OLD value verbatim — that is how an owned "
    + "copy is recognised as stale — and Shocking Grasp's old warp text said persistent. The damage "
    + "field itself is still named `persistent`, which is a column, not a word a player reads."
});

const offenders = [];
let literalsRead = 0;
for (const file of sources(path.join(SYSTEM_ROOT, "module"))) {
  const rel = path.relative(SYSTEM_ROOT, file).replace(/\\/g, "/");
  for (const literal of stringLiterals(fs.readFileSync(file, "utf8"))) {
    literalsRead += 1;
    // `persistence` is a DIFFERENT WORD — the Persistence column — and the
    // word boundary is what keeps the two apart.
    if (!/\bpersistent\b/i.test(literal)) continue;
    if (ALLOWED[rel]) continue;
    offenders.push(`${rel}: "${literal.slice(0, 70)}"`);
  }
}

ok("B0 the sweep actually read the module tree", literalsRead > 5000,
  `only ${literalsRead} string literals found — the reader is broken, not the tree`);
ok("B1 no player-facing string still says the old word",
  offenders.length === 0,
  `${offenders.length}: ${offenders.slice(0, 8).join(" | ")}`);

// AND THE ALLOWLIST MAY ONLY SHRINK: a file that has stopped needing its
// exemption must lose it, or the list becomes a place to hide.
const stale = Object.keys(ALLOWED).filter((rel) => {
  const full = path.join(SYSTEM_ROOT, rel);
  if (!fs.existsSync(full)) return true;
  return !stringLiterals(fs.readFileSync(full, "utf8")).some((l) => /\bpersistent\b/i.test(l));
});
ok("B2 no allowance outlives the thing it allows", stale.length === 0,
  `remove: ${stale.join(", ")}`);
ok("B3 every allowance carries a reason",
  Object.values(ALLOWED).every((why) => String(why).length > 40));

/* ================================================================== *
 * C. THE PLACES THAT SAID IT LOUDEST
 * ================================================================== *
 *
 * The sweep above would catch any of these coming back, but naming them
 * says what actually changed — and a table row is transcribed prose, so
 * the check is that it matches the book rather than that it avoids a
 * word.
 */

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const crit = read("module", "data", "critical-tables.mjs");
const fumble = read("module", "data", "fumble-tables.mjs");

ok("C1 the critical table rows say recurring",
  /Target is taking 1 recurring damage\./.test(crit),
  "Core 3.7, Acid table, rows 11–13");
ok("C2 and the severe ones keep the book's shape",
  /that hurts a lot\. Recurring 5\./.test(crit) && /"text": "Recurring 3\."/.test(crit),
  'Core 3.7 prints "Recurring 5. Armoured: Recurring 3." — the pack splits those two across '
  + 'the `effect` field and an `armourClauses` entry (3.580.0 made the clauses a list, so the '
  + 'armoured half is a clause `text` rather than a lone `armoured` string), which is why this '
  + 'asks for each in its own place');
// THE PERSISTENCE COLUMN IS UNTOUCHED, and this is the check that would
// have caught a careless find-and-replace: 644 rows carry it and none of
// them is about this rule.
ok("C3 the Persistence column survived the rename",
  (crit.match(/"persistence":/g) ?? []).length > 600,
  "a blanket replace would have eaten the column that says how long an injury lasts");
ok("C4 the fumble table says recurring bleed",
  /recurring bleed/.test(fumble));

ok("C5 the cast card's damage line says recurring",
  /recurring \$\{damageType\} damage/.test(read("module", "magic", "cast-workflow.mjs")));
ok("C6 the Life Stealing rune says recurring",
  /becomes recurring essence damage/.test(read("module", "rune-events.mjs")));
// 3.578.0 (block 18, D3): recurring damage is now the condition, and the
// card reports the value it put on, not the profile's formula.
ok("C7 the alchemical bomb summary says recurring",
  /<strong>Recurring \$\{next\.value\} \$\{damageType\}<\/strong>/.test(read("module", "alchemical-workflow.mjs")));
ok("C8 the Delay action says recurring",
  /Recurring damage\/effects due at the start/.test(read("module", "data", "basic-actions.mjs")));

// THE CONVICTION OPTION IS A PRINTED NAME. "Persistent Healing" appears
// nowhere in Core 3.7; "Recurring Healing" does.
const conviction = read("module", "conviction.mjs");
ok("C9 the conviction option is Recurring Healing",
  /label: "Recurring Healing"/.test(conviction) && !/label: "Persistent Healing"/.test(conviction));
// AND ITS KEY DID NOT MOVE. That string is the action a posted chat
// card's button carries and the case a dispatch switch answers; renaming
// it would break a card already sitting in a live log.
ok("C10 but its action key is unchanged",
  /persistentHealing: \{/.test(conviction) && /case "persistentHealing":/.test(conviction),
  "the book renamed a rule, not a wire format");

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-recurring-vocabulary: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-recurring-vocabulary: OK — ${checks} checks over ${literalsRead} string literals. `
  + `One rule, one name, and the Persistence column still intact.\n`);
