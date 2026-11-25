#!/usr/bin/env node
/**
 * mutate-spellbook-picker — every mutation must turn verify-spellbook-picker red.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const FILTERS = at("module", "picker-filters.mjs");
const PICKER = at("module", "picker-workflow.mjs");
const WF = at("module", "magic", "spellbook-workflow.mjs");
const FREE = at("module", "magic", "spellbook-free-workflow.mjs");
const CHECK = at("tools", "verify-spellbook-picker.mjs");

const MUTATIONS = [
  { file: FILTERS, name: "M1 the school is matched case-sensitively", from: "traits.includes(school.toLowerCase())", to: "traits.includes(school)" },
  { file: FILTERS, name: "M2 PP sorts as text", from: "return facet?.numeric\n    ? list", to: "return false\n    ? list" },
  { file: FILTERS, name: "M3 the Spellbook's School menu is dropped", from: "  spellbook: [\n    { key: \"school\", label: \"School\", fields: [\"system.traits\"],\n      read: (entry) => spellSchoolOf(entry) },\n", to: "  spellbook: [\n" },
  { file: PICKER, name: "M4 multiple rows are still radios", from: "<input type=\"${multiple ? \"checkbox\" : \"radio\"}\"", to: "<input type=\"radio\"" },
  { file: PICKER, name: "M5 the cap is not enforced", from: "            box.checked = false;\n", to: "" },
  { file: PICKER, name: "M6 double-click adds in multi mode too", from: "if (!multiple) rowEls.forEach((row) => {", to: "rowEls.forEach((row) => {" },
  { file: PICKER, name: "M7 menu values bypass the numeric sort", from: "const values = sortFacetValues(facet, Array.from(new Set(", to: "const values = ((f, v) => v.sort())(facet, Array.from(new Set(" },
  { file: WF, name: "M8 the opening batch is not held back", from: "  if (!firstPicksOutstanding) return owed;\n", to: "  return owed;\n" },
  { file: WF, name: "M9 Add to Book creates past the cap", from: "of picked.picks.slice(0, maxPicks))", to: "of picked.picks)" },
  { file: WF, name: "M10 Add to Book is single-pick again", from: "    multiple: true,\n    maxPicks,\n", to: "    maxPicks,\n" },
  { file: FREE, name: "M11 Free Spell has no School/PP menus", from: "    facets: PICKER_FACETS.spellbook,\n    multiple: true,\n    emptyMessage", to: "    multiple: true,\n    emptyMessage" },
  { file: FREE, name: "M12 the GM is told only the first spell", from: "question: freeSpellQuestion(documents)", to: "question: freeSpellQuestion(documents[0])" },
  { file: FREE, name: "M13 several spells lose their count", from: "`${list.length} spells — ${named} —`", to: "named" }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }); return true; }
  catch { return false; }
}
const guard = guardFiles([FILTERS, PICKER, WF, FREE, CHECK]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-spellbook-picker: verify fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length
  ? `\nmutate-spellbook-picker: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-spellbook-picker: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
