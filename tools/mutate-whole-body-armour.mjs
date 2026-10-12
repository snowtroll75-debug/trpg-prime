#!/usr/bin/env node
/**
 * mutate-whole-body-armour — can verify-whole-body-armour fail?
 *
 * NEW at 3.617.4. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const HIT = at("module", "combat", "hit-location.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const DRAIN = at("module", "bracers-workflow.mjs");
const VERIFY = at("tools", "verify-whole-body-armour.mjs");

const MUTATIONS = [
  { file: HIT, name: "THE 3.617.3 DRIVE'S QUESTION: the spell covers nothing",
    from: "  if (!whole.armoured) return { ...here, coveredBy: \"\" };", to: "  return { ...here, coveredBy: \"\" };", breaks: "A1" },
  { file: HIT, name: "spent armour still covers",
    from: "  const live = Boolean(base?.itemId || base?.effectId) && Number(base?.effective ?? 0) > 0;",
    to: "  const live = Boolean(base?.itemId || base?.effectId);", breaks: "A3" },
  { file: HIT, name: "the bracers don't cover (only a spell's effect)",
    from: "  const live = Boolean(base?.itemId || base?.effectId) && Number(base?.effective ?? 0) > 0;",
    to: "  const live = Boolean(base?.effectId) && Number(base?.effective ?? 0) > 0;", breaks: "A2" },
  { file: HIT, name: "the whole-body armour wipes a worn piece's metal",
    from: "    rigid: Boolean(here.rigid) || whole.rigid,", to: "    rigid: whole.rigid, metal: false,", breaks: "A5" },
  { file: HIT, name: "the card names the spell where worn armour covers too",
    from: "    coveredBy: here.armoured ? \"\" : whole.name", to: "    coveredBy: whole.name", breaks: "A5" },
  { file: ATTACK, name: "the injury table reads only the worn pieces again",
    from: "    ? withWholeBodyArmour(armourAtLocation(seenItems, hitLocation), targetActor.system)",
    to: "    ? withWholeBodyArmour(armourAtLocation(seenItems, hitLocation), {})", breaks: "C1" },
  { file: ATTACK, name: "Vital Strike's named location strips the spell's CR",
    from: "      || wholeBodyArmour(targetActor.system).armoured\n", to: "\n", breaks: "C3" },
  { file: ATTACK, name: "a backfire ignores the attacker's own Mage Armour",
    from: "      const ownArmour = withWholeBodyArmour(armourAtLocation(Array.from(actor.items ?? []), hitLocation), actor.system);",
    to: "      const ownArmour = armourAtLocation(Array.from(actor.items ?? []), hitLocation);", breaks: "C4" },
  { file: ATTACK, name: "the card stops saying what covers the spot",
    from: "(armoured${targetArmour.coveredBy ? ` by ${targetArmour.coveredBy}` : \"\"})", to: "(armoured)", breaks: "C5" },
  { file: ATTACK, name: "THE Q2 GAP: the amendment never reaches the pool",
    from: "      if (bracersSource && !drBypassed) {\n        const { absorbAmendment }", to: "      if (false) {\n        const { absorbAmendment }", breaks: "E5" },
  { file: DRAIN, name: "the pool takes only part of the amendment",
    from: "  const taken = Math.max(0, Math.floor(Number(amount) || 0));", to: "  const taken = Math.max(0, Math.floor((Number(amount) || 0) / 2));", breaks: "E1" },
  { file: DRAIN, name: "a spent pool still takes it",
    from: "  if (!(bracers?.itemId || bracers?.effectId) || !(Number(bracers?.hp) > 0)) return \"\";",
    to: "  if (!(bracers?.itemId || bracers?.effectId)) return \"\";", breaks: "E4" }
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
    process.stderr.write("mutate-whole-body-armour: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-whole-body-armour: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-whole-body-armour: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
