#!/usr/bin/env node
/**
 * mutate-drive-3617 — can verify-drive-3617 fail?
 *
 * NEW at 3.617.1. Each mutation puts back a finding of the 3.617.0 live test,
 * or undoes one of Graham's answers to it. SURVIVED and an unmatched anchor
 * are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const WUSE = at("module", "wondrous-use.mjs");
const WUSEF = at("module", "wondrous-use-workflow.mjs");
const ITEMSF = at("module", "magic-items-workflow.mjs");
const SHEET = at("module", "sheets", "actor-sheet.mjs");
const WEFFECTS = at("module", "wondrous-effects.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const DAMAGEF = at("module", "combat", "damage-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const BURST = at("module", "burst-workflow.mjs");
const SKILLS = at("module", "skills.mjs");
const VERIFY = at("tools", "verify-drive-3617.mjs");

const MUTATIONS = [
  { file: WUSE, name: "F1 — every creature is refused as not living (the shipped defect)",
    from: "  return gate.allowed ? \"\" : gate.reason;", to: "  return gate.reason || \"is not a living creature.\";", breaks: "A1" },
  { file: WUSE, name: "F1 — the undead are healed",
    from: "  const gate = kindGateResult({}, patientSystem ?? {}, LIVING_KIND, patientName);",
    to: "  const gate = { allowed: true, reason: \"\" };", breaks: "A2" },
  { file: ITEMSF, name: "F2 — Activate Item posts the description again",
    from: "  if (wondrousUseOf(item)) {\n    const { useWondrousItem }", to: "  if (false) {\n    const { useWondrousItem }", breaks: "B1" },
  { file: SHEET, name: "G1 — an invested pair in a pack is marked applied",
    from: "          row.wondrousActive = wondrousActive(item) && wondrousEffects.summary.length > 0;",
    to: "          row.wondrousActive = Boolean(item.system?.invested) && wondrousEffects.summary.length > 0;", breaks: "B3" },
  // RE-ANCHORED AT 3.617.2: the multiplier is written out, for Mage Armour's
  // CL 6 step.
  { file: WEFFECTS, name: "Q1 — the bracers ignore BSB",
    from: "    const ownBsb = entry.bsb === undefined || entry.bsb === null ? bsb : entry.bsb;",
    to: "    const ownBsb = entry.bsb === undefined || entry.bsb === null ? 0 : entry.bsb;", breaks: "C1" },
  { file: WEFFECTS, name: "Q2 — the bracers stop more than their pool (the shipped behaviour)",
    from: "    state.effective = Math.min(Math.max(0, Math.floor(Number(state.dr) || 0)) * multiplier, state.hp);",
    to: "    state.effective = Math.max(0, Math.floor(Number(state.dr) || 0)) * multiplier;", breaks: "D1" },
  { file: DAMAGEF, name: "Q1 — the spell path scales the bracers by BDB again",
    from: "    : Math.max(wornDr, bracersDr);", to: "    : effectiveDR(Math.max(Number(targetSystem?.combat?.armour?.dr ?? 0), bracersDr), Number(targetSystem?.combat?.bdb?.total ?? 0));", breaks: "C3" },
  { file: ATTACK, name: "Q1 — the weapon path compares raw armour DR against the bracers",
    from: "    const bracersSource = bracersAreTheArmour(wornEffectiveDR, targetBracers);",
    to: "    const bracersSource = bracersAreTheArmour(wornArmourDR, targetBracers);", breaks: "C4" },
  { file: BURST, name: "G2 — the fumble's bonus dice go unnamed",
    from: "taken${bonusText}", to: "taken", breaks: "E1" },
  { file: SKILLS, name: "O1 — Aid reaches the world actor again",
    from: "    .map((t) => ({ id: t.actor.uuid, name: t.name }));", to: "    .map((t) => ({ id: t.actor.id, name: t.name }));", breaks: "F1" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-drive-3617: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-drive-3617: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-3617: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
