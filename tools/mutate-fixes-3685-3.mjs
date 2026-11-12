#!/usr/bin/env node
/**
 * mutate-fixes-3685-3 — can verify-fixes-3685-3 fail? (3.685.3)
 *
 * SURVIVED and an unmatched anchor are both failures.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CONJ = M("magic", "conjured-item-workflow.mjs");
const PCW = M("magic", "power-crystal-workflow.mjs");
const PER = M("peril-workflow.mjs");
const PEND = M("magic", "pending-cast-workflow.mjs");
const RULE = M("magic", "pending-cast.mjs");
const AGM = M("acting-gm.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");

const MUTATIONS = [
  // C — the conjured item's clock
  { name: "THE DEFECT: every GM deletes a conjured item's clock", file: CONJ, from: "  Hooks.on(\"deleteItem\", (item) => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"deleteItem\", (item) => {\n    if (!game.user?.isGM) return;", breaks: "C1/C2/G1" },
  { name: "every client deletes the clock", file: CONJ, from: "  Hooks.on(\"deleteItem\", (item) => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"deleteItem\", (item) => {", breaks: "C2" },
  // K — Power Crystals
  { name: "THE DEFECT: a spend asks isGM, so a player's spend never draws a crystal down", file: PCW, from: "    if (!actor?.isOwner) return;", to: "    if (!game.user?.isGM) return;", breaks: "K1/K1b/K2" },
  { name: "a spend settles on a client that does not own the actor", file: PCW, from: "    if (!actor?.isOwner) return;", to: "", breaks: "K4" },
  { name: "THE DEFECT: every GM settles a crystal's arrival", file: PCW, from: "  Hooks.on(\"createItem\", (item) => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"createItem\", (item) => {\n    if (!game.user?.isGM) return;", breaks: "K5/K7" },
  { name: "every client settles an arrival", file: PCW, from: "  Hooks.on(\"createItem\", (item) => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"createItem\", (item) => {", breaks: "K5/K7" },
  { name: "THE DEFECT: every GM settles a crystal's departure", file: PCW, from: "  Hooks.on(\"deleteItem\", (item) => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"deleteItem\", (item) => {\n    if (!game.user?.isGM) return;", breaks: "K6/K7" },
  { name: "an emptied crystal dissolves with its points on it, and is charged twice", file: PCW, from: "      await actor.items.get(d.id)?.setFlag(SYSTEM_ID, CRYSTAL_FLAG, { pp: 0 }).catch(() => {});", to: "      ;", breaks: "K1/K9" },
  // P — a suppressed peril
  { name: "THE DEFECT: every GM re-arms a suppressed peril", file: PER, from: "  Hooks.on(\"updateWorldTime\", (worldTime) => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"updateWorldTime\", (worldTime) => {\n    if (!game.user?.isGM) return;", breaks: "P1/P2/G2" },
  { name: "every client re-arms", file: PER, from: "  Hooks.on(\"updateWorldTime\", (worldTime) => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"updateWorldTime\", (worldTime) => {", breaks: "P1/P2" },
  // Q — a pending cast
  { name: "THE DEFECT: every GM's load lapses every casting", file: PEND, from: "      if (!lapses || await hasLiveHolder(actor, record)) continue;", to: "      if (!game.user?.isGM) continue;" /* RE-ANCHORED 3.686.2 on Graham's 3.686.1 line */, breaks: "Q1/Q3/Q6/Q9" },
  { name: "every flag is lapsed, whatever the rule says", file: PEND, from: "      if (!lapses || await hasLiveHolder(actor, record)) continue;", to: "      ;" /* RE-ANCHORED 3.686.2 */, breaks: "Q1/Q3" },
  { name: "the sweep asks isGM, not the acting GM", file: PEND, from: "    const actingGM = isActingGM();", to: "    const actingGM = Boolean(game.user?.isGM);", breaks: "Q2/Q3/Q9" },
  { name: "a GM counts as the caster's owner, so a record naming nobody never lapses", file: PEND, from: "u?.active && !u.isGM\n", to: "u?.active\n", breaks: "Q6b" },
  { name: "the card always blames a reload", file: PEND, from: "{ reloaded: !startedBy || startedBy === thisUser }", to: "{ reloaded: true }", breaks: "Q2b" },
  { name: "a new record does not say whose browser holds it", file: PEND, from: "    userId: globalThis.game?.user?.id ?? null\n", to: "    userId: null\n", breaks: "Q8" },
  { name: "a client does not lapse its own casting on reload", file: RULE, from: "  if (startedBy && startedBy === thisUser) return true;\n", to: "", breaks: "Q4/Q5/Q7" },
  { name: "the rule does not ask for the acting GM", file: RULE, from: "  if (!actingGM) return false;\n", to: "", breaks: "Q3/Q5/Q7" },
  { name: "a connected caster's casting lapses", file: RULE, from: "  if (startedBy) return !starterConnected;", to: "  if (startedBy) return true;", breaks: "Q1/Q7" },
  { name: "a record naming nobody always lapses", file: RULE, from: "  return !ownerConnected;", to: "  return true;", breaks: "Q6/Q7" },
  { name: "a record naming nobody never lapses", file: RULE, from: "  return !ownerConnected;", to: "  return false;", breaks: "Q6b/Q7" },
  { name: "the card forgets page 237", file: RULE, from: "so the casting lapsed. <em>No PP was spent</em> — page 237.`;", to: "so the casting lapsed.`;", breaks: "Q7b" },
  // the acting GM itself
  { name: "isActingGM does not compare the active GM with this client", file: AGM, from: "  if (activeGM && activeGM.id !== game.user?.id) return false;\n", to: "" /* RE-ANCHORED 3.686.2 on Graham's 3.686.1 form */, breaks: "C1/K5/P1/Q2" },
  { name: "a lone GM with no active GM does nothing", file: AGM, from: "  return Boolean(game?.user?.isGM) && isGMConnectionWriter();", to: "  return false;" /* RE-ANCHORED 3.686.2 */, breaks: "C3/K8/P3" },
  // Z
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.685.2\"", breaks: "Z1/Z2" },
  { name: "the download names the last release", file: SJ, from: "releases/download/v3.686.2/trg-prime.zip", to: "releases/download/v3.685.2/trg-prime.zip", breaks: "Z2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3685-3.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3685-3: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3685-3: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3685-3: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
