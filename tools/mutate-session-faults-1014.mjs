#!/usr/bin/env node
/**
 * mutate-session-faults-1014 — the mutation half of verify-session-faults-1014 (3.645.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CCI = m("dice", "check-card-interactions.mjs"), CK = m("dice", "check.mjs"), EM = m("magic", "emanation-workflow.mjs"),
  AT = m("combat", "attack-workflow.mjs"), OPP = m("combat", "opportunity.mjs"), AF = m("combat", "action-feats-workflow.mjs"),
  ST = m("combat", "strike.mjs"), AW = m("combat", "action-workflow.mjs"), CW = m("magic", "cast-workflow.mjs");
const MUTATIONS = [
  { name: "the d6 is always shown by hand", file: CCI, from: "if (extraRoll && game.dice3d && !diceSoNiceAnimatesUpdates()) {", to: "if (extraRoll && game.dice3d) {", breaks: "F1a" },
  { name: "the bonus is never offered before the read", file: CK, from: "    if (check.actor && !check.flat) await offerConvictionBonusNow(check);\n", to: "", breaks: "F2a" },
  { name: "a save without a DC is asked", file: CK, from: "  if (!readsNow && (dc === null || dc === undefined)) return;\n", to: "", breaks: "F2b" },
  { name: "the die is not added to the total", file: CK, from: "  check.applyExtraModifier({ label: \"Conviction (+1d6)\", value: roll.total, type: \"untyped\" });\n", to: "", breaks: "F2d" },
  { name: "a decided card still offers the button", file: CK, from: "!this.flat && !this.convictionDecided &&", to: "!this.flat &&", breaks: "F2e" },
  { name: "a player's refresh writes locally", file: EM, from: "  if (!isActingGM()) return askGMClient(\"emanation.refresh\", { castId: record?.entry?.id ?? \"\" });\n", to: "", breaks: "F3a" },
  { name: "a player's end clears locally", file: EM, from: "  if (!isActingGM()) {\n    await askGMClient(\"emanation.end\"", to: "  if (false) {\n    await askGMClient(\"emanation.end\"", breaks: "F3c" },
  { name: "an off-turn strike takes the penalty", file: AT, from: "const baseMap = (isReaction || offTurn) ? 0", to: "const baseMap = isReaction ? 0", breaks: "F4a" },
  { name: "an off-turn strike advances the count", file: AT, from: "if (!isReaction && !mapFrozen && !offTurn) {", to: "if (!isReaction && !mapFrozen) {", breaks: "F4b" },
  { name: "players never see the AoO button", file: OPP, from: "if (!game.user.isGM && !reactorActor?.isOwner) {", to: "if (!game.user.isGM) {", breaks: "F4d" },
  { name: "the Hand & a Half die is not stepped", file: AT, from: "buildWeaponDamageFormula(handAndAHalfDamage ?? damageOverride ?? weaponData.damage,", to: "buildWeaponDamageFormula(damageOverride ?? weaponData.damage,", breaks: "F5b" },
  { name: "the chooser puts the fist first", file: ST, from: "[...melee.filter((w) => !w.system?.natural), ...melee.filter((w) => w.system?.natural)]", to: "[...melee]", breaks: "F6a" },
  { name: "a cancelled choice still charges AP", file: AF, from: "  if (chosen === null) return null;\n  if (entry.apCost", to: "  if (entry.apCost", breaks: "F6b" },
  { name: "a readied action is charged again", file: AW, from: "resolveAction(actor, { ...storedAction, apCost: \"0\" }", to: "resolveAction(actor, { ...storedAction }", breaks: "F7a" },
  { name: "a readied cast is charged again", file: CW, from: "  if (!apPaid) await spendActionCost(actor, totalCastAP, spell.name);", to: "  await spendActionCost(actor, totalCastAP, spell.name);", breaks: "F7c" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-session-faults-1014.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-session-faults-1014: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-session-faults-1014: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-session-faults-1014: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
