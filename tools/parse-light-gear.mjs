#!/usr/bin/env node
/**
 * parse-light-gear — the printed Goods entries for the light-emitting
 * gear, extracted from the rulebook into tools/light-gear-book.json.
 *
 * NEW at 3.396.0, and it exists for one reason: THE GEAR PACK IS TERSE
 * BY DESIGN. 83 of 101 gear descriptions are under forty characters —
 * "+2 illumination levels; may be covered; uses oil" is the whole of the
 * Hooded Lantern. That is the house format and not lost data, so the
 * fixes that restored Neutralise Poison's fields do not apply here.
 *
 * But it means the pack cannot answer the question verify-light-sources
 * needs to ask. The terse form carries the STEP COUNT and drops the CAP,
 * and the cap is the half that varies: candle 5, bullseye 6, torch and
 * hooded lantern 7. Checking the table against the pack would prove the
 * easy half and quietly skip the half most likely to be wrong.
 *
 * So the printed text is parsed out of the book once, committed, and
 * compared against. Exactly the arrangement tools/spell-book-fields.json
 * already uses for the 692 spell entries, for the same reason.
 *
 * USAGE:  node tools/parse-light-gear.mjs <path-to-rulebook.html>
 *
 * The book is not in the repository — it is Graham's, and it is 30 MB —
 * so this is run by hand when the book changes and the JSON is what
 * ships. `verify-light-sources` reads the JSON and fails if it is
 * missing rather than skipping, so a deleted file cannot become a
 * silent pass.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  process.stderr.write("usage: node tools/parse-light-gear.mjs <rulebook.html>\n");
  process.exit(2);
}

/** The Goods entries that move the illumination ladder, by printed heading. */
const HEADINGS = ["CANDLE", "LANTERN, BULLSEYE", "LANTERN, CANDLE", "LANTERN, HOODED", "TORCH"];

const raw = fs.readFileSync(source, "utf8");
const text = raw
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&#39;|&rsquo;|&apos;/g, "'")
  .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
  .replace(/\s+/g, " ");

const out = {};
const problems = [];

for (const heading of HEADINGS) {
  // THE HEADING MUST BE FOLLOWED BY PROSE, not by another heading. The
  // Goods table prints entries as `NAME description NAME description`,
  // so the entry ends where the next all-caps heading begins. Anchoring
  // on the next heading rather than on a sentence stop is what stopped
  // the spell parser absorbing Nexus's merged trait line into the entry
  // before it — the same failure, avoided the same way.
  const at = text.indexOf(` ${heading} `);
  if (at === -1) { problems.push(`heading not found: ${heading}`); continue; }
  const after = text.slice(at + heading.length + 2);

  // The next heading is the next run of two-or-more capitals that starts
  // a word, allowing a comma (LANTERN, HOODED) and stopping before it.
  const next = /\s[A-Z][A-Z]{2,}(?:,\s[A-Z]{2,})?\s/.exec(after);
  const body = (next ? after.slice(0, next.index) : after.slice(0, 600)).trim();

  const m = /(increas\w*|lower\w*|reduc\w*)[^.]{0,60}?illumination(?:\s+level)?\s+by\s+(\w+)\s+steps?/i.exec(body);
  if (!m) { problems.push(`no illumination phrase in ${heading}: "${body.slice(0, 90)}…"`); continue; }

  const rest = body.slice(m.index);
  const maxWords = /to a maximum of Step\s+(\d+)/i.exec(rest);
  const maxParen = /\(\s*max\s+(\d+)\s*\)/i.exec(rest);

  out[heading] = {
    heading,
    text: body,
    stepsWord: m[2].toLowerCase(),
    cap: maxWords ? Number(maxWords[1]) : maxParen ? Number(maxParen[1]) : null
  };
}

if (problems.length) {
  process.stderr.write(`parse-light-gear: ${problems.length} problem(s)\n`);
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.exit(1);
}

const dest = path.join(SYSTEM_ROOT, "tools", "light-gear-book.json");
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
process.stdout.write(`parse-light-gear: ${Object.keys(out).length} entries → tools/light-gear-book.json\n`);
for (const [k, v] of Object.entries(out)) {
  process.stdout.write(`  ${k.padEnd(20)} +${v.stepsWord} steps, cap ${v.cap ?? "none"}\n`);
}
