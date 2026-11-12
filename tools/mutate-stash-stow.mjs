#!/usr/bin/env node
/** mutate-stash-stow — the mutation half of verify-stash-stow. NEW at 3.684.9. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const SH = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const ST = path.join(SYSTEM_ROOT, "module", "stowage.mjs");
const CSS = path.join(SYSTEM_ROOT, "styles", "trg-prime.css");
const BTN = '                {{!-- STOW IN A STASH SACK (3.684.9): every carried row, not only gear. --}}\n                <button type="button" data-action="toggleItemStowed"';
const rowFor = (group) => ({ name: `THE DEFECT: the ${group} rows lose the stow control`, file: HBS, nth: group, breaks: "S1" });
const MUTATIONS = [
  ...["weapons", "armour", "shields", "consumables", "ammunition", "chargedItems", "wondrousItems"].map(rowFor),
  { name: "a Stash Sack may be stowed in itself", file: SH, from: "      if (itemStashCapacity(item) > 0) {", to: "      if (false) {", breaks: "S2" },
  { name: "the refusal comes after the update", file: SH, from: "      if (itemStashCapacity(item) > 0) {\n        ui.notifications.warn(`${item.name} is a Stash Sack — it holds things; it is not stowed.`);\n        return;\n      }", to: "", breaks: "S2" },
  { name: "equipped items count as stowed", file: ST, from: "  return Boolean(item?.system?.stowed) && !item?.system?.equipped;", to: "  return Boolean(item?.system?.stowed);", breaks: "S3" },
  { name: "THE DEFECT: the controls column is 78px again", file: CSS, from: "    grid-template-columns: minmax(110px, 1.6fr) 0.6fr 0.6fr 0.55fr 118px;", to: "    grid-template-columns: minmax(130px, 1.7fr) 0.7fr 0.7fr 0.6fr 78px;", breaks: "S4" },
  { name: "the controls spill out of their column", file: CSS, from: "    flex-wrap: wrap;\n    row-gap: 2px;\n    min-width: 0;\n    overflow: hidden;", to: "    row-gap: 2px;\n    min-width: 0;", breaks: "S4" },
  { name: "drawing a stowed item leaves it marked stowed", file: SH, from: "    if (willBeEquipped && item.system.stowed) changes[\"system.stowed\"] = false;\n", to: "", breaks: "S5" },
  { name: "an uninvested sack gives capacity", file: ST, from: "    item?.system?.invested ? total + itemStashCapacity(item) : total", to: "    total + itemStashCapacity(item)", breaks: "S3c" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-stash-stow.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
/** Remove the stow control from one group's block only. */
function dropFromGroup(text, group) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.includes(`{{#each itemGroups.${group} as |item|}}`));
  const end = lines.findIndex((l, k) => k > i && l.startsWith("          {{/each}}"));
  const j = lines.findIndex((l, k) => k > i && k < end && l.includes("STOW IN A STASH SACK (3.684.9)"));
  if (i < 0 || j < 0) return null;
  lines.splice(j, 4);
  return lines.join("\n");
}
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-stash-stow: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    let mutated;
    if (mu.nth) mutated = dropFromGroup(original, mu.nth);
    else { const n = original.split(mu.from).length - 1; mutated = n === 1 ? original.replace(mu.from, mu.to) : null; }
    if (mutated === null) { results.push({ name: mu.name, state: "ANCHOR MISSING" }); continue; }
    fs.writeFileSync(mu.file, mutated);
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-stash-stow: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-stash-stow: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
