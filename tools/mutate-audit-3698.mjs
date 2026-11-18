#!/usr/bin/env node
/** mutate-audit-3698 — the mutation half of verify-audit-3698 (Graham's rulings on the 3.697.0 audit). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const G = M("grants.mjs");
const GW = M("grants-workflow.mjs");
const GA = M("grant-autorun.mjs");
const FA = M("familiar.mjs");
const FW = M("feats-workflow.mjs");
const PR = M("data", "pack-repairs.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "A an entry AT the level counts as above it", file: G, from: "    if ((Number(e.level) || 1) <= lvl) due.set(k, due.get(k) + 1);", to: "    if ((Number(e.level) || 1) < lvl) due.set(k, due.get(k) + 1);" },
  { name: "A a name the list does not hold is removed too", file: G, from: "    if (!due.has(k)) continue;\n    if (!held.has(k)) held.set(k, []);", to: "    if (!due.has(k)) due.set(k, 0);\n    if (!held.has(k)) held.set(k, []);" },
  { name: "A every copy of a twice-listed name goes", file: G, from: "  for (const [k, ids] of held) out.push(...ids.slice(due.get(k)));", to: "  for (const [k, ids] of held) out.push(...(due.get(k) ? [] : ids));" },
  { name: "A names compared with their case", file: G, from: "  const key = (n) => String(n ?? \"\").trim().toLowerCase();\n  const due = new Map();", to: "  const key = (n) => String(n ?? \"\");\n  const due = new Map();" },
  { name: "B the divine aspect pruned twice, its specialist pick at risk", file: GW, from: "    if (source.type === \"divine-aspect\") continue;\n    const fields = (GRANT_FIELDS[source.type] ?? []).filter((f) => f.levelled);", to: "    const fields = (GRANT_FIELDS[source.type] ?? []).filter((f) => f.levelled);" },
  { name: "B another source's grants counted as this one's", file: GW, from: "    const mine = items.filter((i) => i.flags?.[\"trg-prime\"]?.grantedBy?.sourceId === source.id);", to: "    const mine = items.filter((i) => i.flags?.[\"trg-prime\"]?.grantedBy);" },
  { name: "B nothing is deleted", file: GW, from: "  await actor.deleteEmbeddedDocuments(\"Item\", unique);\n  return [`Granted above level", to: "  return [`Granted above level" },
  { name: "B the level hook never prunes", file: GA, from: "    const taken = await pruneLevelledGrantsAboveLevel(actor);", to: "    const taken = [];" },
  { name: "B it prunes silently", file: GA, from: "    if (taken.length) ui.notifications.info(`${actor.name} — ${taken.join(\" \")}`);", to: "" },
  { name: "C one per three levels", file: FA, from: "  return Math.max(1, Math.ceil((Math.floor(Number(level)) || 1) / 4));", to: "  return Math.max(1, Math.ceil((Math.floor(Number(level)) || 1) / 3));" },
  { name: "C counted from 0 (two at 4th)", file: FA, from: "  return Math.max(1, Math.ceil((Math.floor(Number(level)) || 1) / 4));", to: "  return Math.max(1, Math.floor((Math.floor(Number(level)) || 1) / 4) + 1);" },
  { name: "C the allowance never enforced", file: FW, from: "      if (!item.getFlag?.(SYSTEM_ID, \"abilityEnhancementChoice\") && chosenElsewhere >= allowance) {", to: "      if (false) {" },
  { name: "C the familiar's own level, not its master's", file: FW, from: "Number(actor.system?.progression?.level ?? actor.system?.identity?.level ?? 1)", to: "Number(actor.system?.identity?.level ?? 1)" },
  { name: "D Flame Blade's owned copies keep the 30 feet", file: PR, from: "    id: \"audit3698-flame-blade-range\", pack: \"spells\", name: \"Flame Blade\",\n    field: \"range\"", to: "    id: \"audit3698-flame-blade-rangeX\", pack: \"spells\", name: \"Flame Blade\",\n    field: \"range\"" },
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.698.0\"", to: "\"version\": \"3.697.0\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-audit-3698.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-audit-3698: verify-audit-3698 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-audit-3698: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-audit-3698: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
