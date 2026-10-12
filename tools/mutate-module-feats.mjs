#!/usr/bin/env node
/**
 * mutate-module-feats — ten mutations against verify-module-feats.mjs:
 * an access list that opens every feat, or opens nothing, or ignores the
 * kind; a picker that stops asking; an aura modifier that drops its
 * value, its exclusion or its actions; a feat that cannot grant a
 * weapon. Each must turn the verify red.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const API = path.join(SYSTEM_ROOT, "module", "module-api.mjs");
const PF = path.join(SYSTEM_ROOT, "module", "picker-filters.mjs");
const AURA = path.join(SYSTEM_ROOT, "module", "aura-conditionals.mjs");
const GW = path.join(SYSTEM_ROOT, "module", "grants-workflow.mjs");

const MUTATIONS = [
  { name: "an access list opens every feat to its owner", file: API,
    from: "    .some((owner) => registry.featAccess.get(`${k}:${owner}`)?.has(feat));", to: "    .some((owner) => registry.featAccess.has(`${k}:${owner}`));", breaks: "A3 / B4 — Stone-Like Endurance opens with Self Aware" },
  { name: "the kind is ignored", file: API,
    from: "  const id = `${k}:${owner}`;\n  const set = registry.featAccess.get(id) ?? new Set();", to: "  const id = `${owner}`;\n  const set = registry.featAccess.get(id) ?? new Set();", breaks: "A3 — a race list is looked up under the kind" },
  { name: "a second registration replaces the first", file: API,
    from: "  const set = registry.featAccess.get(id) ?? new Set();", to: "  const set = new Set();", breaks: "A8 — Bardic Lore vanishes when Familiar is added" },
  { name: "a bad kind registers anyway", file: API,
    from: "  if (![\"race\", \"class\"].includes(k) || !owner || !names.length) {", to: "  if (!owner || !names.length) {", breaks: "A9" },
  { name: "the racial-feat picker stops asking", file: PF,
    from: "        (matchesSource(entry.system?.sourceRace, race) || hasRegisteredFeatAccess(\"race\", race, entry.name));", to: "        matchesSource(entry.system?.sourceRace, race);", breaks: "B3 — Self Aware stays hidden from the Rhevani" },
  { name: "the class-feat picker stops asking", file: PF,
    from: "        if (hasRegisteredFeatAccess(\"class\", className, entry.name)) return true;\n", to: "", breaks: "B8 — Bardic Lore stays hidden from the Archivist" },
  { name: "a modifier aura drops its value", file: AURA,
    from: "    ? { value: Math.trunc(Number(grant.value)), type: String(grant.type ?? \"circumstance\").trim().toLowerCase() || \"circumstance\" }", to: "    ? { type: String(grant.type ?? \"circumstance\").trim().toLowerCase() || \"circumstance\" }", breaks: "C2 — the +1 never reaches the row" },
  { name: "a valueless modifier still yields rows", file: AURA,
    from: "  if (kind === \"modifier\" && (!Number.isFinite(figure.value) || figure.value === 0)) return [];", to: "", breaks: "C7 / C8" },
  { name: "an aura's actions are dropped", file: AURA,
    from: "  const reach = actions.length ? { checkTypes, actions } : { checkTypes };", to: "  const reach = { checkTypes };", breaks: "C6 — Lantern of the Bloom reaches every skill check" },
  { name: "a feat cannot grant a weapon", file: GW,
    from: "    { field: \"grantedWeapons\", pack: \"companions\" }\n  ],", to: "  ],", breaks: "D1 — Hunter's Fangs hands over nothing" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-module-feats.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([API, PF, AURA, GW]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-module-feats: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-module-feats: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-module-feats: OK — all ${results.length} mutations caught, tree restored.\n`);
