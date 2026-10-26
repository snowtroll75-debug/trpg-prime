#!/usr/bin/env node
/** mutate-offered-conditionals — the mutation half of verify-offered-conditionals. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const OC = m("dice", "offered-conditionals.mjs"), CK = m("dice", "check.mjs"), AW = m("combat", "attack-workflow.mjs"),
  SH = m("sheets", "actor-sheet.mjs"), AC = m("combat", "action-workflow.mjs");
const MUTATIONS = [
  { name: "the automatic rows are asked about too", file: OC, from: "  return (Array.isArray(rows) ? rows : []).filter((row) => row && !row.auto);", to: "  return (Array.isArray(rows) ? rows : []).filter((row) => row);", breaks: "A1" },
  { name: "Shift no longer skips the question", file: OC, from: "includes(String(checkType)) && Boolean(offer) && !resolved", to: "includes(String(checkType)) && !resolved", breaks: "A2" },
  { name: "THE OLD GAP: the prompt is never asked", file: OC, from: "  return OFFERED_CHECK_TYPES.includes(String(checkType)) && Boolean(offer) && !resolved && !flat && Number(count) > 0;", to: "  return false;", breaks: "B1" },
  { name: "a forced save asks too", file: OC, from: "const OFFERED_CHECK_TYPES = Object.freeze([\"attack\", \"spellcraft\"]);", to: "const OFFERED_CHECK_TYPES = Object.freeze([\"attack\", \"spellcraft\", \"save\"]);", breaks: "A2b" },
  { name: "Spellcraft does not ask", file: OC, from: "const OFFERED_CHECK_TYPES = Object.freeze([\"attack\", \"spellcraft\"]);", to: "const OFFERED_CHECK_TYPES = Object.freeze([\"attack\"]);", breaks: "A2b" },
  { name: "the roll's type is not passed", file: OC, from: "    : !shouldOffer({ checkType: check.type, offer:", to: "    : !shouldOffer({ checkType: \"attack\", offer:", breaks: "B13" },
  { name: "anyone is asked", file: OC, from: "  return Boolean(isGM || isOwner);", to: "  return true;", breaks: "A3" },
  { name: "the prompt arrives ticked", file: OC, from: "    + `<input type=\"checkbox\" name=\"offered\" value=\"${esc(row.id)}\">`", to: "    + `<input type=\"checkbox\" name=\"offered\" value=\"${esc(row.id)}\" checked>`", breaks: "A4" },
  { name: "THE LIVE SLIP: the rows go back into the form-group grid", file: OC, from: "    + `<div class=\"trg-conditional-modifiers\">${lines}</div>`", to: "    + `<div class=\"form-group trg-conditional-modifiers\">${lines}</div>`", breaks: "A4b" },
  { name: "names are not escaped", file: OC, from: "    + `<p><strong>${esc(actorName)}</strong>", to: "    + `<p><strong>${actorName}</strong>", breaks: "A6" },
  { name: "an answer is not kept to the rows offered", file: OC, from: "  return (Array.isArray(ids) ? ids : []).filter((id) => offered.has(id));", to: "  return Array.isArray(ids) ? ids : [];", breaks: "A7" },
  { name: "a ticked row is not applied", file: OC, from: "  check.modifiers.push(...taken.modifiers);\n", to: "", breaks: "B1" },
  { name: "the answer is not kept", file: OC, from: "  check.conditionalChoices = ids;\n", to: "", breaks: "B3" },
  { name: "a ticked advantage gives nothing", file: OC, from: "  if (taken.kinds.length) check.bias = resolveBias(check.bias, taken.kinds, bias);\n", to: "", breaks: "B5" },
  { name: "a one-shot is never spent", file: OC, from: "  for (const { sourceId, label } of taken.spent ?? []) {", to: "  for (const { sourceId, label } of []) {", breaks: "B5" },
  { name: "a roll made again is asked again", file: OC, from: "  if (Array.isArray(check.conditionalChoices)) ids = chosenIds(check.conditionalChoices, rows);\n  else if", to: "  if", breaks: "B12" },
  { name: "another player's screen applies the rows unasked", file: OC, from: "ids = chosenIds(await askOfferedConditionals(check, rows), rows);\n  else return;", to: "ids = chosenIds(await askOfferedConditionals(check, rows), rows);\n  else ids = rows.map((row) => row.id);", breaks: "B10" },
  { name: "the check never asks", file: CK, from: "        if (!check.previewOnly) await offerConditionalsOnRoll(check, entries, conditionalContext, BIAS);\n", to: "", breaks: "C1" },
  { name: "the check forgets Shift", file: CK, from: "    this.offerConditionals = config.offerConditionals !== false;", to: "    this.offerConditionals = true;", breaks: "C2" },
  { name: "the check drops an earlier answer", file: CK, from: "    this.conditionalChoices = Array.isArray(config.conditionalChoices) ? [...config.conditionalChoices] : null;", to: "    this.conditionalChoices = null;", breaks: "C2" },
  { name: "a Shift attack still asks", file: AW, from: "    offerConditionals: !skipDialog(event),\n", to: "", breaks: "C3" },
  { name: "Alter the Thread's reroll asks again", file: AW, from: "allowConviction: false, conditionalChoices: check.conditionalChoices ?? [] });", to: "allowConviction: false });", breaks: "C4" },
  { name: "a Shift sheet roll asks", file: SH, from: "      offerConditionals: !skipDialog(event),\n", to: "", breaks: "C5" },
  { name: "a Shift skill action asks", file: AC, from: "    offerConditionals: !skipDialog(event),\n", to: "", breaks: "C6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-offered-conditionals.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-offered-conditionals: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-offered-conditionals: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-offered-conditionals: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
