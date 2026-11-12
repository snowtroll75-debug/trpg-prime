#!/usr/bin/env node
/**
 * mutate-pack-ids — can verify-pack-ids fail?
 *
 * NEW at 3.685.2. SURVIVED and an unmatched anchor are both failures.
 *
 * Two kinds. SOURCE mutations break the rule, the declarations or the
 * declare tool in place (guarded and restored, as every mutate file does).
 * DATA mutations never touch packs/: each copies the packs to a temporary
 * directory, seeds the copy with one bad record, and points the verify at it
 * through TRG_PACK_IDS_ROOT — the defect as it shipped, and its neighbours.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const LIB = path.join(SYSTEM_ROOT, "tools", "lib", "pack-ids.mjs");
const DECL = path.join(SYSTEM_ROOT, "tools", "ff30-codex-declarations.mjs");
const DECLARE = path.join(SYSTEM_ROOT, "tools", "declare-ff30-codex.mjs");
const VERIFY = path.join(SYSTEM_ROOT, "tools", "verify-pack-ids.mjs");

const MUTATIONS = [
  { name: "THE DEFECT: seventeen characters pass", file: LIB, from: "export const FOUNDRY_ID = /^[A-Za-z0-9]{16}$/;", to: "export const FOUNDRY_ID = /^[A-Za-z0-9]{16,17}$/;", breaks: "A2" },
  { name: "any characters pass", file: LIB, from: "export const FOUNDRY_ID = /^[A-Za-z0-9]{16}$/;", to: "export const FOUNDRY_ID = /^.{16}$/;", breaks: "A3" },
  { name: "the key's ids are not asked", file: LIB, from: "  for (const id of chain) if (!isFoundryId(id)) problems.push(", to: "  for (const id of []) if (!isFoundryId(id)) problems.push(", breaks: "A2/A4" },
  { name: "the record's own _id is not asked", file: LIB, from: "  if (!isFoundryId(own)) problems.push(", to: "  if (false) problems.push(", breaks: "A2/A6" },
  { name: "a key that names another id passes", file: LIB, from: "  else if (own !== chain[chain.length - 1]) problems.push(", to: "  else if (false) problems.push(", breaks: "A5" },
  { name: "a parent's embedded list is not asked", file: LIB, from: "  problems.push(...embeddedIdProblems(key, value));\n  return problems;", to: "  return problems;", breaks: "A7" },
  { name: "an inline embedded document's own list is not asked", file: LIB, from: "        problems.push(...embeddedIdProblems(`${key} ${field}[${i}]`, entry));\n", to: "", breaks: "A7" },
  { name: "the key's depth is not asked", file: LIB, from: "  if (chain.length !== depth) problems.push(", to: "  if (false) problems.push(", breaks: "A8" },
  { name: "Scorching Breath is authored under its old id again", file: DECL, from: "  entry(\"ff30ScorchBreath\", \"Scorching Breath\",", to: "  entry(\"ff30ScorchingBrth\", \"Scorching Breath\",", breaks: "C1" },
  { name: "Wing Buffet is authored under its old id again", file: DECL, from: "  entry(\"ff30WingBuffet01\", \"Wing Buffet\",", to: "  entry(\"ff30WingBuffet001\", \"Wing Buffet\",", breaks: "C1" },
  { name: "the declare tool keeps the retired keys", file: DECLARE, from: "        if (!dryRun) await db.del(key);\n        const named", to: "        const named", breaks: "C2" },
  { name: "the declare tool leaves the tombstones uncompacted", file: DECLARE, from: "      if (removed && !dryRun) await db.compactRange(\"!\", \"~\");\n", to: "", breaks: "C2" }
];

/* Each seeds a copy of packs/ through `seed(dir, ClassicLevel)`. */
const SEEDS = [
  { name: "THE DEFECT AS IT SHIPPED: Scorching Breath back under its seventeen-character id", breaks: "B3/B5", seed: (dir, CL) => put(CL, path.join(dir, "creature-abilities"), "!items!ff30ScorchingBrth", { _id: "ff30ScorchingBrth", name: "Scorching Breath (old)", type: "ability", effects: [] }) },
  { name: "the new Wing Buffet record is gone", breaks: "B6/B7", seed: (dir, CL) => del(CL, path.join(dir, "creature-abilities"), "!items!ff30WingBuffet01") },
  { name: "an embedded effect with a seventeen-character id", breaks: "B3", seed: async (dir, CL) => {
    const [key] = await first(CL, path.join(dir, "abilities"), (k) => k.startsWith("!items.effects!"));
    const parent = key.split("!")[2].split(".")[0];
    await put(CL, path.join(dir, "abilities"), `!items.effects!${parent}.ff30WingBuffet001`, { _id: "ff30WingBuffet001", name: "bad effect" });
  } },
  { name: "a parent lists a bad embedded id", breaks: "B3", seed: async (dir, CL) => {
    const [key, value] = await first(CL, path.join(dir, "feats"), (k, v) => k.startsWith("!items!") && Array.isArray(v?.effects));
    await put(CL, path.join(dir, "feats"), key, { ...value, effects: [...value.effects, "tooShort"] });
  } },
  { name: "a null id in a directory system.json does not declare", breaks: "B3", seed: async (dir, CL) => {
    // RE-SEEDED 3.686.2: 3.686.1's tree no longer carries the stale undeclared
    // directories (bestiary and its kin), so the seed makes its own.
    const db = new CL(path.join(dir, "bestiary"), { valueEncoding: "json", createIfMissing: true });
    await db.open();
    try { await db.put("!items!aaaaaaaaaaaaaaaa", { _id: null, name: "null id" }); } finally { await db.close(); }
  } },
  { name: "a declared pack is missing", breaks: "B2", seed: (dir) => fs.rmSync(path.join(dir, "weapons"), { recursive: true, force: true }) }
];

async function open(CL, dir) { fs.rmSync(path.join(dir, "LOCK"), { force: true }); const db = new CL(dir, { valueEncoding: "json", createIfMissing: false }); await db.open(); return db; }
async function put(CL, dir, key, value) { const db = await open(CL, dir); try { await db.put(key, value); } finally { await db.close(); } }
async function del(CL, dir, key) { const db = await open(CL, dir); try { await db.del(key); } finally { await db.close(); } }
async function first(CL, dir, test) {
  const db = await open(CL, dir);
  try { for await (const [k, v] of db.iterator()) if (test(k, v)) return [k, v]; } finally { await db.close(); }
  throw new Error(`mutate-pack-ids: no record to seed in ${dir}`);
}

function run(env = {}) {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }); return true; }
  catch { return false; }
}

const { ClassicLevel } = await import("classic-level");
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file)), VERIFY]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-pack-ids: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
  for (const s of SEEDS) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trg-pack-ids-seed-"));
    try {
      fs.cpSync(path.join(SYSTEM_ROOT, "packs"), dir, { recursive: true });
      await s.seed(dir, ClassicLevel);
      const survived = run({ TRG_PACK_IDS_ROOT: dir });
      results.push({ name: `data: ${s.name}`, state: survived ? "SURVIVED" : "caught", breaks: s.breaks });
    } catch (error) {
      results.push({ name: `data: ${s.name}`, state: `SEED FAILED (${error.message})` });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-pack-ids: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-pack-ids: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
