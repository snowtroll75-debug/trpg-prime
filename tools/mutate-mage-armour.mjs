#!/usr/bin/env node
/**
 * mutate-mage-armour — can verify-mage-armour fail?
 *
 * NEW at 3.617.2. Each mutation puts back what Mage Armour did before
 * Graham's MA1–MA4, or breaks a step of the rebuild. SURVIVED and an
 * unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const ARMOUR = at("module", "magic", "spell-armour.mjs");
const WEFFECTS = at("module", "wondrous-effects.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const DRAIN = at("module", "bracers-workflow.mjs");
const EFFECTS = at("module", "magic", "spell-effects.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const HIT = at("module", "combat", "hit-location.mjs");
const DAMAGEF = at("module", "combat", "damage-workflow.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const AUTHOR = at("tools", "author-mage-armour.mjs");
const VERIFY = at("tools", "verify-mage-armour.mjs");

const MUTATIONS = [
  { file: WEFFECTS, name: "THE SHIPPED DEFECT: the BSB is ignored (the page's BSB-6 Wizard gets DR 1)",
    from: "    const multiplier = drMultiplier(ownBsb) + Math.max(0, Math.trunc(Number(entry.multiplierBonus) || 0));",
    to: "    const multiplier = 1 + Math.max(0, Math.trunc(Number(entry.multiplierBonus) || 0));", breaks: "A2" },
  { file: ARMOUR, name: "the warp raises the total, not the base",
    from: "    baseDR: spec.baseDR + bump,", to: "    baseDR: spec.baseDR,", breaks: "A3" },
  { file: ARMOUR, name: "CL 4's twenty HP never arrive",
    from: "  const max = spec.hp + steps(spec.hpStep, casterLevel);", to: "  const max = spec.hp;", breaks: "B1" },
  { file: ARMOUR, name: "CL 6's multiplier step never arrives",
    from: "    multiplierBonus: steps(spec.multiplierStep, casterLevel),", to: "    multiplierBonus: 0,", breaks: "B2" },
  { file: ARMOUR, name: "CL 10 rigid from the first level",
    from: "    rigid: spec.rigidAt > 0 && Number(casterLevel) >= spec.rigidAt,", to: "    rigid: spec.rigidAt > 0,", breaks: "B4" },
  { file: ARMOUR, name: "MA4 — a destroyed armour still grants CR and rigidity",
    from: "    if (hp <= 0) continue;\n", to: "", breaks: "D2" },
  { file: ACTOR, name: "MA2 — the spell's armour is not weighed beside the bracers",
    from: "[...wondrousBonusesForActor(Array.from(actor.items ?? [])).baseDR, ...spellArmour.entries]",
    to: "[...wondrousBonusesForActor(Array.from(actor.items ?? [])).baseDR]", breaks: "C6" },
  { file: DRAIN, name: "MA1 — the spell's armour is never the armour a blow meets",
    from: "  return Boolean(bracers?.itemId || bracers?.effectId) && Number(bracers?.effective ?? 0) > Math.max(0, Number(armourDr) || 0);",
    to: "  return Boolean(bracers?.itemId) && Number(bracers?.effective ?? 0) > Math.max(0, Number(armourDr) || 0);", breaks: "C3" },
  { file: DAMAGEF, name: "MA1 — spells meet worn armour and Mage Armour together",
    from: "    : Math.max(wornDr, bracersDr);", to: "    : wornDr + bracersDr;", breaks: "C4" },
  { file: DRAIN, name: "the destroyed armour leaves no lockout",
    from: "      withRecastLockout(lockouts, state.spellName || name, Number(game.time?.worldTime ?? 0), minutes));",
    to: "      lockouts);", breaks: "D3" },
  { file: EFFECTS, name: "the cast reads the target's BSB instead of the caster's",
    from: "            bsb: casterBSB(caster),", to: "            bsb: casterBSB(target),", breaks: "A5" },
  { file: ACTOR, name: "MA3 — the spell's CR cannot be bypassed by a named location",
    from: "    armourCR += spellArmourCR;\n", to: "", breaks: "E2" },
  { file: HIT, name: "CL 10's rigidity never reaches the injury table",
    from: "    rigid: live && Boolean(system?.combat?.spellArmour?.rigid),", to: "    rigid: false,", breaks: "E3" },
  { file: AUTHOR, name: "THE 3.617.2 DRIVE'S DEFECT: the row names no target, and reaches nobody",
    from: "    kind: \"spellArmour\", target: \"self\", label: \"Mage Armour\",", to: "    kind: \"spellArmour\", label: \"Mage Armour\",", breaks: "A1c" },
  { file: KINDS, name: "the applier stops knowing the kind",
    from: "\"spellShield\", \"spellArmour\",", to: "\"spellShield\",", breaks: "A1b" }
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
    process.stderr.write("mutate-mage-armour: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-mage-armour: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-mage-armour: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
