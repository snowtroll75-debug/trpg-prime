#!/usr/bin/env node
/**
 * mutate-block38-environment — can verify-block38-environment fail?
 *
 * NEW at 3.620.0. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const ENV = at("module", "environment.mjs");
const ENV_WF = at("module", "environment-workflow.mjs");
const EXH = at("module", "combat", "exhaustion-workflow.mjs");
const DROWN = at("module", "drowning-workflow.mjs");
const LIGHT = at("module", "light-workflow.mjs");
const PERIL = at("module", "peril.mjs");
const PERIL_WF = at("module", "peril-workflow.mjs");
const ACTION = at("module", "combat", "action-workflow.mjs");
const DYING = at("module", "combat", "dying-workflow.mjs");
const RELAY = at("module", "combat", "target-relay.mjs");
const SKILLS = at("module", "data", "skill-actions.mjs");
const VERIFY = at("tools", "verify-block38-environment.mjs");

const MUTATIONS = [
  { file: ENV, name: "lava's fumble is printed wrong", from: "failure: \"10d6\", fumble: \"20d6\"", to: "failure: \"10d6\", fumble: \"10d6\"", breaks: "A1/A3" },
  { file: ENV, name: "a fumble deals only the failure column", from: "const column = d === \"fumble\" || d === \"blunder\" ? \"fumble\" : d === \"failure\" ? \"failure\" : null;", to: "const column = d === \"fumble\" || d === \"blunder\" || d === \"failure\" ? \"failure\" : null;", breaks: "A3" },
  { file: ENV, name: "a partial deals the failure column", from: ": d === \"failure\" ? \"failure\" : null;", to: ": d === \"failure\" || d === \"partial\" ? \"failure\" : null;", breaks: "A4" },
  { file: ENV, name: "quicksand never takes hold", from: "  return [\"failure\", \"fumble\", \"blunder\"].includes(String(degree ?? \"\"));", to: "  return false;", breaks: "A5" },
  { file: ENV, name: "two cold bonuses stack", from: "    if (!best || value > best.value) best =", to: "    if (true) best =", breaks: "B1" },
  { file: ENV, name: "the cold gear reaches a Will save", from: "    if (Array.isArray(subjects) && subjects.length && !subjects.includes(saveKey)) continue;", to: "", breaks: "B2" },
  { file: EXH, name: "A4 — THE OLD DEFECT: the gear never reaches the check", from: "    if (gear) modifiers.push({ label: gear.label, value: gear.value, type: gear.type });", to: "", breaks: "B3" },
  { file: EXH, name: "the GM's DC is ignored", from: "    dc: gmDC ?? levelDC(Number(actor.system?.identity?.level ?? 0)),", to: "    dc: levelDC(Number(actor.system?.identity?.level ?? 0)),", breaks: "B4" },
  { file: EXH, name: "R13 — the environment deals nothing", from: "    lines.push(...await applyEnvironment(actor, environment, degree));", to: "", breaks: "B5" },
  { file: ENV_WF, name: "environmental damage skips the defences", from: "  const dealt = await applyTypedDamage(actor, { amount: roll.total, type: damage.type });", to: "  const dealt = await applyTypedDamage(actor, { amount: roll.total, ignoreDefences: true });", breaks: "B7" },
  { file: DROWN, name: "quicksand's suffocation is lethal", from: "applyDamageAndCheckDying(actor, outcome.damage, { isCritical: false, nonlethal: Boolean(state.nonlethal) });", to: "applyDamageAndCheckDying(actor, outcome.damage, { isCritical: false });", breaks: "C2" },
  { file: DROWN, name: "the state forgets it is quicksand", from: "    ...(raw.nonlethal ? { nonlethal: true } : {}),\n", to: "", breaks: "C2" },
  { file: ENV, name: "weather takes six steps", from: "const WEATHER_MAX_STEPS = 4;", to: "const WEATHER_MAX_STEPS = 6;", breaks: "E1" },
  { file: ENV, name: "a region's weather is ignored", from: "    if (shift) return shift;", to: "", breaks: "E2" },
  { file: LIGHT, name: "the light level never sees the weather", from: "  if (weather) level = shiftLightLevel(level, weather.steps, weather.floor);", to: "", breaks: "E3" },
  { file: PERIL, name: "a trap-tagged NPC is no peril", from: "  return hasCreatureTrait(actor?.system ?? {}, \"trap\");", to: "  return false;", breaks: "F2" },
  { file: PERIL, name: "detection ignores the minimum rank", from: "  if (!searching) return", to: "  if (false) return", breaks: "F4" },
  { file: PERIL, name: "any skill disables any peril", from: "  const hit = bestEntryFor(entries, skill);", to: "  const hit = entries[0];", breaks: "F5" },
  { file: PERIL, name: "a fumble does not trigger it", from: "  if (key === \"fumble\" || key === \"blunder\") {", to: "  if (false) {", breaks: "F7" },
  { file: PERIL, name: "a disabled peril can still be triggered", from: "  if (PERIL_INACTIVE.includes(p.state)) {", to: "  if (false) {", breaks: "F8" },
  { file: DYING, name: "a peril struck dies like a creature", from: "  if (isPeril(actor) && actor.system?.gm?.peril?.enabled) {\n    const { perilTakesDamage }", to: "  if (false) {\n    const { perilTakesDamage }", breaks: "F10" },
  { file: ACTION, name: "the peril's DC is not used", from: "    resolved.dc = perilTarget.dc;", to: "", breaks: "F11" },
  { file: ACTION, name: "nothing is banked on the peril", from: "    lines.push(...await perilDisableAttempt(perilHit.peril, disableDegree, { mode: perilHit.mode }));", to: "", breaks: "F12" },
  { file: PERIL_WF, name: "Dispel cannot reach a peril", from: "const DISABLING_ACTIONS = Object.freeze([\"disableADevice\", \"disablePeril\", \"dispel\"]);", to: "const DISABLING_ACTIONS = Object.freeze([\"disableADevice\", \"disablePeril\"]);", breaks: "F12" },
  { file: PERIL_WF, name: "detection is rolled openly", from: "      rollMode: BLIND_ROLL_MODE,\n", to: "", breaks: "F14" },
  { file: SKILLS, name: "Disable a Peril loses Survival", from: "    skills: [\"nature\", \"survival\", \"occultism\", \"religion\", \"diplomacy\", \"linguistics\", \"perform\"],", to: "    skills: [\"nature\", \"occultism\", \"religion\", \"diplomacy\", \"linguistics\", \"perform\"],", breaks: "F13" },
  { file: ACTION, name: "F3 of the 3.619.0 drive — the card's degree, so a heroic banks two", from: "  const disableDegree = rawDegree ?? degree;", to: "  const disableDegree = degree;", breaks: "F12" },
  { file: RELAY, name: "the relay ignores the peril", from: "      const result = await deps.applyPerilAttempt(target, String(payload.degree ?? \"\"), how);", to: "      const result = null;", breaks: "F16" }
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
    process.stderr.write("mutate-block38-environment: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-block38-environment: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block38-environment: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
