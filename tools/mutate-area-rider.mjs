#!/usr/bin/env node
/**
 * mutate-area-rider — can verify-area-rider fail?
 * NEW at 3.465.0.
 *
 * D5/D6 ARE THE ONES THAT MATTER, and they are here because the first
 * draft of the workflow really did read `runningEmanations()`. Neither
 * Consecrate nor Desecrate is an emanation, so that draft could never
 * have rolled a die — and every rule in sections A–C was correct
 * throughout. The mutation below puts that draft back.
 *
 * B3 IS THE GEOMETRY HALF. A rider that asked only what the target IS
 * would follow an undead off the consecrated ground and bite it anywhere
 * on the map, which is the failure a reader cannot see from a card.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const A = path.join(SYSTEM_ROOT, "module", "magic", "area-rider.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "area-rider-workflow.mjs");
const S = path.join(SYSTEM_ROOT, "module", "magic", "strike-riders.mjs");
const K = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-area-rider.mjs");

const MUTATIONS = [
  {
    file: A,
    name: "A5 a malformed die is accepted",
    from: "const DICE = /^([1-9]\\d*)d([1-9]\\d*)$/i;",
    to: "const DICE = /d/i;",
    breaks: "A5 — \"1d4+1\" would throw at strike time or roll something nobody checked"
  },
  {
    file: A,
    name: "A6 a row with no damage type is accepted",
    from: "  if (!damageType) return null;",
    to: "  if (false) return null;",
    breaks: "A6 — an empty type means \"the weapon's own\" elsewhere in this system"
  },
  {
    file: A,
    name: "A7 THE WHOLE RULE: a row with no subject is accepted",
    from: "  if (!AREA_RIDER_SUBJECTS.includes(subject)) return null;",
    to: "  if (subject && !AREA_RIDER_SUBJECTS.includes(subject)) return null;",
    breaks: "A7 — subject is the only word Consecrate and Desecrate differ by"
  },
  {
    file: A,
    name: "B2 consecrated ground bites the living too",
    from: '  return spec.subject === "undead" ? Boolean(isUndead) : !isUndead;',
    to: "  return true;",
    breaks: "B2/B4 — it would bite everybody standing in it"
  },
  {
    file: A,
    name: "B3 THE GEOMETRY HALF: standing outside no longer matters",
    from: "  if (!inside) return false;",
    to: "  if (false) return false;",
    breaks: "B3 — the die would follow an undead anywhere on the map"
  },
  {
    file: A,
    name: "C2 the packet goes back to being conditional",
    from: "    conditional: false,",
    to: "    conditional: true,",
    breaks: "C2 — it would print \"apply if it applies\" instead of applying, against Graham's ruling"
  },
  {
    file: A,
    name: "C3 the attack bonus leaks into a rider that did not reach",
    from: "  return spec && reached ? spec.attackBonus : 0;",
    to: "  return spec ? spec.attackBonus : 0;",
    breaks: "C3 — an attack that got no die would still get the +2"
  },
  {
    // THE FIRST DRAFT, PUT BACK.
    file: W,
    name: "D6 THE FIRST DRAFT: the workflow reads the emanation list again",
    from: "    for (const region of canvas?.scene?.regions ?? []) {",
    to: "    for (const region of runningEmanations() ?? []) {",
    breaks: "D6 — neither spell is an emanation, so the die would never roll once"
  },
  {
    file: S,
    name: "E5 the unarmed scope stops asking whether the strike is unarmed",
    from: '  if (spec.scope === "unarmed" && !isUnarmedAttack(weapon)) return false;',
    to: "  if (false) return false;",
    breaks: "E5/E6 — Force Punch's 1d6 would ride every sword swing"
  },
  {
    file: S,
    name: "E7 the new scope is not a scope at all",
    from: 'const RIDER_SCOPES = Object.freeze(["any", "melee", "ranged", "unarmed"]);',
    to: 'const RIDER_SCOPES = Object.freeze(["any", "melee", "ranged"]);',
    breaks: "E2 — the pack row would be refused and Force Punch would carry nothing"
  },
  {
    file: K,
    name: "F1 the strike loop stops asking for area packets",
    from: "    const areaPackets = areaRiderPackets(targetActor, targetTokenHere);",
    to: "    const areaPackets = [];",
    breaks: "F1 — the mechanism would exist and never be reached"
  },
  {
    file: K,
    name: "F3 the packets get a loop of their own instead",
    from: "      ...strikeRunes.filter((r) => !r.addsToStrike), ...strikeRiderPackets(actor, weapon, riderCtx), ...areaPackets",
    to: "      ...strikeRunes.filter((r) => !r.addsToStrike), ...strikeRiderPackets(actor, weapon)",
    breaks: "F3 — a second place deciding how secondary damage meets a defence"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([A, W, S, K, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-area-rider: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-area-rider: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-area-rider: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
