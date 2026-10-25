#!/usr/bin/env node
/** mutate-natural-ready — the mutation half of verify-natural-ready. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const NR = m("combat", "natural-ready.mjs"), IT = m("documents", "item.mjs"), SH = m("sheets", "actor-sheet.mjs"), FR = m("combat", "fumble-riders-workflow.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const DS = m("combat", "double-slice.mjs"), AT = m("combat", "attack.mjs");
const MUTATIONS = [
  { name: "a natural attack is not the other weapon for Double Slice", file: DS, from: "      && item?.system?.equipped\n      && item?.system?.attackMode !== \"missile\"", to: "      && item?.system?.equipped\n      && !item?.system?.natural\n      && item?.system?.attackMode !== \"missile\"", breaks: "E1" },
  { name: "a natural attack is not the other weapon for Parry", file: AT, from: "  const equippedWeapons = weapons.filter((item) => item.type === \"weapon\" && item.system?.equipped);", to: "  const equippedWeapons = weapons.filter((item) => item.type === \"weapon\" && item.system?.equipped && !item.system?.natural);", breaks: "E2" },
  { name: "THE COMPLAINT: a character's claw has to be equipped again", file: IT, from: "    this._readyNaturalAttack();\n", to: "", breaks: "C1" },
  { name: "a companion's bite is left unready", file: NR, from: "export const ALWAYS_READY_ACTOR_TYPES = Object.freeze([\"character\", \"companion\", \"familiar\"]);", to: "export const ALWAYS_READY_ACTOR_TYPES = Object.freeze([\"character\"]);", breaks: "A1" },
  { name: "a creature's forms stop switching its strikes", file: NR, from: "  if (!ALWAYS_READY_ACTOR_TYPES.includes(String(actorType ?? \"\"))) return false;\n", to: "", breaks: "A2" },
  { name: "a sword is made ready", file: NR, from: "  if (item?.type !== \"weapon\" || !item?.natural) return false;", to: "  if (item?.type !== \"weapon\") return false;", breaks: "A3" },
  { name: "a form's lost strike stays ready", file: NR, from: "  return !Array.from(formLoses ?? []).includes(String(item?.name ?? \"\"));", to: "  return true;", breaks: "B2" },
  { name: "a disabled form still sets strikes aside", file: NR, from: "    if (form && !effect?.disabled) return", to: "    if (form) return", breaks: "B1" },
  { name: "the item ignores the form", file: IT, from: "    const loses = formLosesOf(actor.effects, \"trg-prime\", \"changeShapeForm\");", to: "    const loses = [];", breaks: "C2" },
  { name: "the sheet keeps its toggle", file: SH, from: "        row.alwaysReady = true;", to: "        row.alwaysReady = false;", breaks: "C4" },
  { name: "the template ignores the flag", file: HBS, from: "                {{#if item.alwaysReady}}\n                <span class=\"always-ready\"", to: "                {{#if false}}\n                <span class=\"always-ready\"", breaks: "C4" },
  { name: "the toggle writes anyway", file: SH, from: "      ui.notifications.info(`${item.name} is a natural attack: always ready, and it takes no hand.`);\n      return;\n", to: "      ui.notifications.info(`${item.name} is a natural attack: always ready, and it takes no hand.`);\n", breaks: "C5" },
  { name: "a fumble drops a fist", file: FR, from: "  if (dropped && weapon && !weapon.system?.natural) {", to: "  if (dropped && weapon) {", breaks: "D2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-natural-ready.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-natural-ready: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-natural-ready: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-natural-ready: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
