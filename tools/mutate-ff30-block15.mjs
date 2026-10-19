#!/usr/bin/env node
/**
 * mutate-ff30-block15 — the mutation half of verify-ff30-block15 (3.647.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DM = m("dual-minds.mjs"), STI = m("magic", "spell-trait-immunity.mjs"), ACT = m("documents", "actor.mjs"), CMB = m("documents", "combat.mjs"),
  CK = m("dice", "check.mjs"), AW = m("combat", "action-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"), CR = m("codex-action-rules.mjs"), CAW = m("codex-actions-workflow.mjs");
const MUTATIONS = [
  { name: "one target counts as many", file: DM, from: "  return Number(targetCount) <= 1 ? \"immune\" : \"twoSaves\";", to: "  return \"twoSaves\";", breaks: "D1" },
  { name: "Fear is not mental", file: DM, from: "  return traitsWithImplied(traits).includes(\"mental\");", to: "  return String(traits).toLowerCase().includes(\"mental\");", breaks: "D1" },
  { name: "three AP", file: DM, from: "export const DUAL_MINDS_AP = 4;", to: "export const DUAL_MINDS_AP = 3;", breaks: "D2" },
  { name: "the spell gate forgets Dual Minds", file: STI, from: "    if (dualMindsVerdict(actor.items, spellTraits, count) === \"immune\") {", to: "    if (false) {", breaks: "D3" },
  { name: "the sheet keeps one reaction", file: ACT, from: "      if (reactions) reactions.max = Math.max(reactions.max, DUAL_MINDS_REACTIONS);\n", to: "", breaks: "D4" },
  { name: "the turn grants 3 AP", file: CMB, from: "fastAttack ? 1 : 0, ...dualBase, ...(acting", to: "fastAttack ? 1 : 0, ...(acting", breaks: "D5" },
  { name: "the worse save stands", file: CK, from: "const keptFirst = rank(first.outcome) > rank(check.outcome)", to: "const keptFirst = rank(first.outcome) < rank(check.outcome)", breaks: "D6" },
  { name: "a mental action reaches it", file: AW, from: "dualMindsVerdict(targetActor.items, action.traits ?? \"\", 1) === \"immune\"", to: "false", breaks: "D7" },
  { name: "an area counts its targets", file: CW, from: "ownedCreatureTypeSystem, { targetCount: Infinity });", to: "ownedCreatureTypeSystem);", breaks: "D7" },
  { name: "a body feeds the same ghoul twice", file: CR, from: "  return Boolean(feederUuid) && !(Array.isArray(fedBy) ? fedBy : []).includes(feederUuid);", to: "  return Boolean(feederUuid);", breaks: "C1" },
  { name: "the body is not marked", file: CAW, from: "  if (body.actor.isOwner) await body.actor.setFlag(SYSTEM_ID, CARRION_FED_FLAG, fedBy);\n", to: "", breaks: "C2" },
  { name: "chaos does not reverse", file: CR, from: "  const dir = Math.sign(Number(direction) || 1) * (chaos ? -1 : 1);", to: "  const dir = Math.sign(Number(direction) || 1);", breaks: "S1" },
  { name: "a fumble lasts an hour", file: CR, from: "  fumble: { seconds: 86400, label: \"for 1 day\" },", to: "  fumble: { seconds: 3600, label: \"for 1 day\" },", breaks: "S1" },
  { name: "the daily use is never spent", file: CAW, from: "  if (counted) await item.update({ \"system.usesValue\": left - 1 });\n  const { levelDC }", to: "  const { levelDC }", breaks: "S2" },
  { name: "Size Shift is not registered", file: CAW, from: "weaponStrike, carrionFeast, sizeShift, strikeBurst, sweepingStrike, toggleEffect });", to: "weaponStrike, carrionFeast, strikeBurst, sweepingStrike, toggleEffect });", breaks: "S3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block15.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block15: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block15: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block15: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
