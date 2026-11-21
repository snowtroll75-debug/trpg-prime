#!/usr/bin/env node
/** mutate-lunge-3704 — the mutation half of verify-lunge-3704 (Lunge and Lunging Stance, 3.704.0). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AT = M("combat", "attack.mjs");
const AF = M("combat", "action-feats.mjs");
const AFW = M("combat", "action-feats-workflow.mjs");
const AW = M("combat", "attack-workflow.mjs");
const FW = M("feats-workflow.mjs");
const PR = M("data", "pack-repairs.mjs");
const MIG = M("migration.mjs");
const MUTATIONS = [
  { name: "A the grant never adds anything", file: AT, from: "  if (!added.length) return traits;\n  return line.trim()", to: "  return traits;\n  return line.trim()" },
  { name: "A a present trait added twice", file: AT, from: "    if (pattern.test(line) || added.some(", to: "    if (added.some(" },
  { name: "C a natural attack refused again (3.704.0's reading)", file: AF, from: "    .filter((i) => i?.type === \"weapon\" && i.system?.equipped\n", to: "    .filter((i) => i?.type === \"weapon\" && i.system?.equipped && !i.system?.natural\n" },
  { name: "C a sheathed weapon can lunge", file: AF, from: "    .filter((i) => i?.type === \"weapon\" && i.system?.equipped\n", to: "    .filter((i) => i?.type === \"weapon\"\n" },
  { name: "C a Reach weapon is eligible", file: AF, from: "    eligible: wielded.filter((i) => !hasReach(i)),", to: "    eligible: wielded," },
  { name: "C a bow can lunge", file: AF, from: "      && (i.system?.attackMode ?? \"melee\") === \"melee\");\n  const hasReach", to: ");\n  const hasReach" },
  { name: "D the feat's note effect reads as the stance", file: AF, from: "    return Boolean(own.featStance) && normalise(e.name) === \"lunging stance\";", to: "    return normalise(e.name) === \"lunging stance\";" },
  { name: "D a disabled stance counts", file: AF, from: "    if (!e || e.disabled) return false;\n    const own", to: "    if (!e) return false;\n    const own" },
  { name: "E the -1 back (3.705.0's Lunge)", file: AF, from: "    extraModifiers: [],\n", to: "    extraModifiers: [{ label: \"Lunge (-1)\", value: -1, type: \"circumstance\" }],\n" },
  { name: "E the Reach -2 never applied (3.704.1's ruling)", file: AF, from: "    waiveReachPenalty: Boolean(lungingStance)", to: "    waiveReachPenalty: true" },
  { name: "E the stance no longer negates the -2", file: AF, from: "    waiveReachPenalty: Boolean(lungingStance)", to: "    waiveReachPenalty: false" },
  { name: "E no Reach granted", file: AF, from: "    grantTraits: [\"Reach\"],\n    // NO PENALTY", to: "    grantTraits: [],\n    // NO PENALTY" },
  { name: "F the feat charges its own AP again", file: AF, from: "    strikePays: true,\n    summary: \"Take an attack action", to: "    summary: \"Take an attack action" },
  { name: "F the requirement always met", file: AF, from: "    case REQUIREMENTS.meleeWeapon:\n      return Boolean(state.meleeWeapon);", to: "    case REQUIREMENTS.meleeWeapon:\n      return true;" },
  { name: "G the grant not passed to weaponData", file: AW, from: "  const grantedTraits = traitsWithGranted(grouped.traits, grantTraits);", to: "  const grantedTraits = grouped.traits;" },
  { name: "G the waiver ignored", file: AW, from: "if (measuresReach && reach.penalty && !waiveReachPenalty) {", to: "if (measuresReach && reach.penalty) {" },
  { name: "G strikePlan always pre-paid", file: AFW, from: "      apPaid: !entry?.strikePays,", to: "      apPaid: true," },
  { name: "G strikePlan drops the grant", file: AFW, from: "      grantTraits,                // Lunge: the Strike gains Reach\n", to: "" },
  { name: "G runActionFeat spends for Lunge too", file: AFW, from: "  if (entry.apCost !== \"0\" && !entry.strikePays) {", to: "  if (entry.apCost !== \"0\") {" },
  { name: "G the handler ignores the stance", file: AFW, from: "    const terms = lungeStrikeTerms({ lungingStance });", to: "    const terms = lungeStrikeTerms({});" },
  { name: "G Lunging Stance stamps no declaration", file: FW, from: "        flags: { lungePenaltiesNegated: true },\n", to: "" },
  { name: "H the owned Lunge note not repaired", file: PR, from: "    id: \"lunge-note\", itemType: \"feat\", name: \"Lunge\", effect: \"Lunge\",", to: "    id: \"lunge-note\", itemType: \"feat\", name: \"Lunge\", effect: \"Lunge note\"," },
  { name: "H the migration not re-run", file: MIG, from: "const effectRepairs = (await runIf(\"3.705.1\", ", to: "const effectRepairs = (await runIf(\"3.705.0\", " },
  { name: "H a 3.704.0 owned copy not repaired", file: PR, from: "    id: \"lunge-note-3704-1\", itemType: \"feat\", name: \"Lunge\", effect: \"Lunge\",", to: "    id: \"lunge-note-3704-1\", itemType: \"feat\", name: \"Lunge\", effect: \"Lunge note\"," }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-lunge-3704.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-lunge-3704: verify-lunge-3704 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-lunge-3704: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-lunge-3704: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
