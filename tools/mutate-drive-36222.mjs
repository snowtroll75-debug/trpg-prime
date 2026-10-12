#!/usr/bin/env node
/**
 * mutate-drive-36222 — can verify-drive-36222 fail?
 *
 * NEW at 3.622.3. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const LSW = at("module", "magic", "light-shift-workflow.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const TARGETING = at("module", "combat", "targeting.mjs");
const AID = at("module", "combat", "aid-bonus.mjs");
const SKILLS = at("module", "skills.mjs");
const GEOMETRY = at("module", "combat", "geometry.mjs");
const VERIFY = at("tools", "verify-drive-36222.mjs");

const BY_ID = (who) => `canvas.tokens?.placeables?.find((t) => t.actor?.id === ${who}.id) ?? null`;

const MUTATIONS = [
  { file: LSW, name: "F1 — THE OLD DEFECT: the circle's token by actor id", from: "    const token = activeToken(target);", to: "    const token = (canvas.tokens?.placeables ?? []).find((t) => t.actor?.id === target?.id) ?? null;", breaks: "A1/A2/B1/B2" },
  { file: CAST, name: "the caster's area token by actor id", from: "        const casterToken = activeToken(actor);", to: `        const casterToken = ${BY_ID("actor")};`, breaks: "B1/B2" },
  { file: TARGETING, name: "\"yourself\" by actor id", from: "  const actorToken = activeToken(actor);", to: `  const actorToken = ${BY_ID("actor")};`, breaks: "B1/B2" },
  { file: AID, name: "the aider's token by actor id", from: "  const actorToken = activeToken(actor);", to: `  const actorToken = ${BY_ID("actor")};`, breaks: "B1/B2" },
  { file: SKILLS, name: "a skill's own token by actor id", from: "  const myToken = activeToken(actor);", to: `  const myToken = ${BY_ID("actor")};`, breaks: "B1/B2" },
  { file: GEOMETRY, name: "the helper takes the first placeable", from: "    return actor?.getActiveTokens?.()?.[0] ?? null;", to: "    return canvas?.tokens?.placeables?.find((t) => t.actor?.id === actor?.id) ?? null;", breaks: "A1/B3" }
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
    process.stderr.write("mutate-drive-36222: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-drive-36222: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-36222: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
