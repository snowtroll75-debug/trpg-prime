#!/usr/bin/env node
/**
 * mutate-restricted-ap — the mutation half of verify-restricted-ap (3.648.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RA = m("combat", "restricted-ap.mjs"), TE = m("combat", "turn-economy.mjs"), APW = m("combat", "action-points-workflow.mjs"),
  ACT = m("documents", "actor.mjs"), CMB = m("documents", "combat.mjs"), ATK = m("combat", "attack-workflow.mjs"),
  MOV = m("combat", "movement-workflow.mjs"), SPE = m("magic", "spell-effects.mjs"), EFF = m("combat", "effect-application-workflow.mjs"),
  FW = m("feats-workflow.mjs"), PC = m("magic", "pending-cast-workflow.mjs");
const MUTATIONS = [
  { name: "an unrestricted source no longer frees the point", file: RA, from: "    if (!sources.some((s) => cleanActions(s) === null)) {", to: "    if (true) { sources.splice(0, sources.length, ...sources.filter(Boolean));", breaks: "P2" },
  { name: "Fast Attack grants nothing", file: RA, from: "  if (fastAttack) {\n    bonus += 1;", to: "  if (false) {\n    bonus += 1;", breaks: "P4" },
  { name: "losses come out of the widest point first", file: RA, from: "    .sort((a, b) => (a.e.actions?.length ?? 0) - (b.e.actions?.length ?? 0) || a.i - b.i);", to: "    .sort((a, b) => (b.e.actions?.length ?? 0) - (a.e.actions?.length ?? 0) || a.i - b.i);", breaks: "P5" },
  { name: "a spell may spend Haste's point", file: RA, from: "  const barred = held.filter((e) => !entryServes(e, kinds)).reduce((t, e) => t + e.value, 0);", to: "  const barred = 0;", breaks: "P6" },
  { name: "a Strike spends the widest point first", file: RA, from: "    .sort((a, b) => a.e.actions.length - b.e.actions.length || a.i - b.i);", to: "    .sort((a, b) => b.e.actions.length - a.e.actions.length || a.i - b.i);", breaks: "P7" },
  { name: "a Stride is not a Move", file: RA, from: "    if (k === \"stride\" || k === \"step\") kinds.add(\"move\");", to: "", breaks: "P11" },
  { name: "Swift Sonata forgets the Step", file: RA, from: "  \"swift sonata\": [\"strike\", \"stride\", \"step\"],", to: "  \"swift sonata\": [\"strike\", \"stride\"],", breaks: "P12" },
  { name: "the regain ignores the extra point", file: TE, from: "  const pool = Math.max(0, Math.floor(Number(base) || 0)) + quickenedBonus + extraBonus;", to: "  const pool = Math.max(0, Math.floor(Number(base) || 0)) + quickenedBonus;", breaks: "P13" },
  { name: "the gate counts the whole pool", file: APW, from: "  const currentAP = apAvailable(actor, kinds);", to: "  const currentAP = Number(actor.system?.resources?.ap?.value ?? 0);", breaks: "S1" },
  { name: "the spender never touches the restricted points", file: APW, from: "    ...grantUpdate\n  });", to: "  });", breaks: "S2" },
  { name: "the sheet clamps the bonus away again", file: ACT, from: "        + (Number(this.flags?.[\"trg-prime\"]?.apGrant?.bonus) || 0),\n", to: ",\n", breaks: "S3" },
  { name: "Phase 1 grants no Fast Attack point", file: CMB, from: "extra: fastAttack ? 1 : 0", to: "extra: 0", breaks: "S4" },
  { name: "a Strike is not marked as one", file: ATK, from: "`${weapon.name} — Strike`, { use: \"strike\" });", to: "`${weapon.name} — Strike`);", breaks: "S5" },
  { name: "movement measures the whole pool", file: MOV, from: "apAvailable(actor, moveKinds) - tally.pendingSpend", to: "Number(actor.system.resources.ap.value ?? 0) - tally.pendingSpend", breaks: "S5" },
  { name: "Haste's Quickened carries no limit", file: SPE, from: "(quickenedActionsFor(spell?.name) ?? \"any\")", to: "\"any\"", breaks: "S6" },
  { name: "a second source replaces the first's limit", file: EFF, from: "        else next = [...new Set([...existing, ...incoming])];", to: "        else next = incoming;", breaks: "S6" },
  { name: "Phase 1 ignores each Quickened's limit", file: CMB, from: "const f = e.getFlag?.(SYSTEM_ID, \"quickenedFor\"); return Array.isArray(f) ? f : null;", to: "return null;", breaks: "S7" },
  { name: "extra casting time eats Haste's point", file: PC, from: "  const available = generalAP(actor);", to: "  const available = Number(actor?.system?.resources?.ap?.value ?? 0);", breaks: "S9" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-restricted-ap.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-restricted-ap: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-restricted-ap: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-restricted-ap: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
