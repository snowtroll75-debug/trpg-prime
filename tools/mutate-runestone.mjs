#!/usr/bin/env node
/** mutate-runestone — the mutation half of verify-runestone. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RS = m("runestone.mjs"), IT = m("documents", "item.mjs"), SH = m("sheets", "item-sheet.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "item", "item-sheet.hbs");
const RT = m("rune-transfer.mjs");
const MUTATIONS = [
  { name: "GRAHAM'S RULING: a runestone is never a target", file: RT, from: "    if (isRunestone(item)) return item?.type === \"gear\" && !splitRuneEntries(item?.system?.runes ?? \"\").length;\n", to: "", breaks: "F4" },
  { name: "a stone already holding a rune is offered", file: RT, from: "    if (isRunestone(item)) return item?.type === \"gear\" && !splitRuneEntries(item?.system?.runes ?? \"\").length;", to: "    if (isRunestone(item)) return item?.type === \"gear\";", breaks: "F2" },
  { name: "a second rune is stored", file: RS, from: "  if (next.length > 1) return \"a runestone holds only one rune at a time\";\n", to: "", breaks: "B1" },
  { name: "a cracked stone takes a new rune", file: RS, from: "  if (cracked && next.length && next[0] !== prior[0]) return", to: "  if (false) return", breaks: "B3" },
  { name: "a cracked stone cannot give up its rune", file: RS, from: "  if (cracked && next.length && next[0] !== prior[0]) return", to: "  if (cracked) return", breaks: "B3" },
  { name: "every trait of the rune is lent, not only its school and tradition", file: RS, from: "    if (printed && !out.includes(printed)) out.push(printed);", to: "    if (!out.includes(trait)) out.push(trait);", breaks: "C1" },
  { name: "traditions are not lent", file: RS, from: "  ...SPELL_SCHOOLS,\n  ...Object.values(TRADITIONS).map((t) => t.label)", to: "  ...SPELL_SCHOOLS", breaks: "C2" },
  { name: "a module's runes are not known", file: RS, from: ", ...CODEX_ARMOUR_RUNES, ...registeredRunes()];", to: ", ...CODEX_ARMOUR_RUNES];", breaks: "C4" },
  { name: "THE RULE: the stone keeps the rune's traits when it is transferred off", file: RS, from: "  const kept = splitTraits(current).filter((t) => !gone.has(t.toLowerCase()));", to: "  const kept = splitTraits(current);", breaks: "D2" },
  { name: "a trait already there is doubled", file: RS, from: "    if (!kept.some((t) => t.toLowerCase() === String(trait).toLowerCase())) kept.push(trait);", to: "    kept.push(trait);", breaks: "D3" },
  { name: "what the last rune lent is forgotten", file: RS, from: "    ? item.flags[\"trg-prime\"][RUNESTONE_TRAITS_FLAG].map(String)\n    : [];", to: "    ? []\n    : [];", breaks: "D4" },
  { name: "a sword is treated as a runestone", file: RS, from: "  if (item?.type !== \"gear\" || !isRunestone(item)) return null;", to: "  if (!isRunestone(item) && item?.type !== \"weapon\") return null;", breaks: "D5" },
  { name: "traits typed in the same change are overwritten", file: RS, from: "  const current = traitsNow ?? item?.system?.traits ?? \"\";", to: "  const current = item?.system?.traits ?? \"\";", breaks: "D6" },
  { name: "THE GAP: an update to the stone's rune leaves its traits alone", file: IT, from: "        foundry.utils.setProperty(changed, \"system.traits\", stone.traits);\n", to: "", breaks: "E1" },
  { name: "the one-rune refusal is never asked on update", file: IT, from: "      if (this._refusedAsRunestone(changed.system.runes, this.system?.runes ?? \"\")) return false;\n", to: "", breaks: "E1" },
  { name: "a stone created with a rune has no traits from it", file: IT, from: "    const stone = runestoneTraitsUpdate(this, this.system?.runes ?? \"\");\n    if (stone) {\n      this.updateSource(", to: "    const stone = null;\n    if (stone) {\n      this.updateSource(", breaks: "E2" },
  { name: "the refusal ignores the crack", file: IT, from: "runestoneRefusal({ after, before, cracked: isCracked(this) })", to: "runestoneRefusal({ after, before, cracked: false })", breaks: "E3" },
  { name: "the sheet has no Runestone panel", file: SH, from: "    context.runestone = context.isGear && isRunestone(this.item)", to: "    context.runestone = false && isRunestone(this.item)", breaks: "E4" },
  { name: "a cracked stone's field can still be typed in", file: HBS, from: "            {{#if runestone.cracked}}disabled{{/if}}\n", to: "", breaks: "E4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-runestone.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-runestone: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-runestone: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-runestone: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
