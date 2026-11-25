#!/usr/bin/env node
/**
 * mutate-spellbook-free — every mutation must turn verify-spellbook-free red.
 * Applied and reverted under the shared file guard.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const BOOK = at("module", "magic", "spellbook.mjs");
const FREE = at("module", "magic", "spellbook-free-workflow.mjs");
const AUTH = at("module", "combat", "gm-authorisation.mjs");
const WF = at("module", "magic", "spellbook-workflow.mjs");
const SHEET = at("module", "sheets", "item-sheet.mjs");
const TPL = at("templates", "item", "item-sheet.hbs");
const CHECK = at("tools", "verify-spellbook-free.mjs");

const MUTATIONS = [
  { file: BOOK, name: "M1 a free spell eats a ladder slot", from: " && !isFreeBookSpell(item)\n", to: "\n" },
  { file: BOOK, name: "M2 Free spells counts every book spell", from: "return spellBookSpells(actor).filter(isFreeBookSpell);", to: "return spellBookSpells(actor);" },
  { file: FREE, name: "M3 the free flag is not set", from: "    freeBookSpell: true,\n", to: "" },
  { file: FREE, name: "M4 the GM's no is ignored", from: "  if (!approved) return null;\n", to: "" },
  { file: FREE, name: "M5 the browser drops the castable cap", from: "filter: eligibilityFor(actor, { firstPick: false }),", to: "filter: () => true," },
  { file: FREE, name: "M6 the GM is not told it is free", from: "    + \"for free. It takes no slot, time, gold or check, and is counted under Free spells.\";", to: "    + \".\";" },
  { file: AUTH, name: "M7 the ask's own title is dropped", from: "window: { title: title ? String(title) : \"Off-Turn Strike — GM Authorisation\" },", to: "window: { title: \"Off-Turn Strike — GM Authorisation\" }," },
  { file: AUTH, name: "M8 the question does not cross the socket", from: "userName: game.user.name, who, what, title, question });", to: "userName: game.user.name, who, what });" },
  { file: AUTH, name: "M9 the strike's dialog loses its AP line", from: "      + \"<p>It costs no AP. Allow it?</p>\";", to: "      + \"<p>Allow it?</p>\";" },
  { file: AUTH, name: "M10 the no-GM notice forgets what was asked", from: "const thing = label ?? \"off-turn strike\";", to: "const thing = \"off-turn strike\";" },
  { file: WF, name: "M11 the context carries no free count", from: "    free: spellBookFreeSpells(actor).length,\n", to: "" },
  { file: SHEET, name: "M12 the action is not registered", from: "      addFreeSpellToBook: TRGItemSheet.addFreeSpellToBook,\n", to: "" },
  { file: SHEET, name: "M13 the row is never marked free", from: "free: isFreeBookSpell(spell)", to: "free: false" },
  { file: TPL, name: "M14 the Free spells box is blank", from: "{{spellBook.free}}", to: "" },
  { file: TPL, name: "M15 the button is gone", from: "data-action=\"addFreeSpellToBook\"", to: "data-action=\"addFreeSpellToBookX\"" }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }); return true; }
  catch { return false; }
}
const guard = guardFiles([BOOK, FREE, AUTH, WF, SHEET, TPL, CHECK]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-spellbook-free: verify fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
  ? `\nmutate-spellbook-free: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-spellbook-free: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
