#!/usr/bin/env node
/**
 * mutate-caster-tier-feats — can the block's checks fail?
 *
 * NEW at 3.569.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE DEFECT OF 3.345.1, restored: measure "a different tradition"
 * against the archetype instead of the class and the whole family grants
 * nothing, for exactly the characters who can hold it. It was found by
 * driving the system, not by reading it, and it is the reason section C
 * exists.
 *
 * THE LADDER MUTATIONS ARE THE ARITHMETIC THAT LOOKS RIGHT. Master's
 * first rung is worth TWO slots where every other rung in the family is
 * worth one; a level>=x chain, or a table with that 2 quietly turned into
 * a 1, reads perfectly and short-changes a 20th-level caster by one spell
 * for the rest of the campaign.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TIERS = path.join(SYSTEM_ROOT, "module", "magic", "caster-tier-feats.mjs");
const CASTING = path.join(SYSTEM_ROOT, "module", "magic", "feat-casting.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-caster-tier-feats.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT (3.345.1). Every one of the twelve is trait-gated
    // to its own tradition's archetype, so excluding the ARCHETYPE's
    // tradition excludes the only characters who qualify.
    file: TIERS,
    name: "THE 3.345.1 DEFECT: the exclusion is measured against the resolved tradition",
    from: '  return String(progression?.tradition ?? "").trim().toLowerCase();',
    to: '  return String(progression?.resolvedTradition ?? progression?.tradition ?? "").trim().toLowerCase();',
    breaks: "C12 — reading the field an archetype writes is how the family died"
  },
  {
    file: TIERS,
    name: "the exclusion stops applying at all",
    from: "    .filter(([tradition]) => tradition !== own)",
    to: "",
    breaks: "C10 — a Wizard's own arcane pool is silently widened"
  },
  {
    // MASTER'S FIRST RUNG IS TWO. Everything else in the family is one.
    file: TIERS,
    name: "Master's first rung is worth one slot like every other rung",
    from: "  master: Object.freeze([[18, 2], [20, 1]])",
    to: "  master: Object.freeze([[18, 1], [20, 1]])",
    breaks: "B13/B15/C2 — a 20th-level caster is short one spell, for ever"
  },
  {
    file: TIERS,
    name: "a rung fires one level early",
    from: "  minor: Object.freeze([[4, 1], [6, 1], [8, 1]]),",
    to: "  minor: Object.freeze([[3, 1], [6, 1], [8, 1]]),",
    breaks: "B1 — the printed prerequisite and the ladder disagree"
  },
  {
    file: TIERS,
    name: "the ladder counts rungs instead of their values",
    from: "  return ladder.reduce((sum, [rung, slots]) => (at >= rung ? sum + slots : sum), 0);",
    to: "  return ladder.reduce((sum, [rung]) => (at >= rung ? sum + 1 : sum), 0);",
    breaks: "B13 — precisely the level>=x chain the table exists to avoid"
  },
  {
    // A DUPLICATE MUST COUNT ONCE — the tiers are a ladder with
    // prerequisites, not a stack. An imported actor may hold two copies.
    file: TIERS,
    name: "a duplicated feat is counted twice",
    from: "    if (!entry || seen.has(key)) continue;",
    to: "    if (!entry) continue;",
    breaks: "C3 — two copies of one feat double its slots"
  },
  {
    file: TIERS,
    name: "the traditions share one pool",
    from: "    if (slots > 0) out[entry.tradition] = (out[entry.tradition] ?? 0) + slots;",
    to: "    if (slots > 0) out.arcane = (out.arcane ?? 0) + slots;",
    breaks: "C4 — a divinity tier hands a wizard more arcane spells"
  },
  {
    // THE TABLE IS BUILT FROM TRADITIONS so a new tradition cannot be
    // missing. Pinning it to a literal list is how it would be.
    file: TIERS,
    name: "the feat table is written out instead of built",
    from: "      Object.keys(TRADITIONS).map((tradition) => [",
    to: '      ["arcane", "divinity"].map((tradition) => [',
    breaks: "A2/A3 — two traditions lose their six feats"
  },
  {
    // A SPELL'S TRADITION IS A LIST. Guidance ships as three of them.
    file: TIERS,
    name: "a spell's tradition is compared as one whole string",
    from: "  const hit = (granted ?? []).find((g) => wanted.includes(g.tradition));",
    to: "  const hit = (granted ?? []).find((g) => g.tradition === String(spellTradition ?? '').trim().toLowerCase());",
    breaks: "D6 — a granted Guidance keeps rolling off the wrong ability"
  },
  {
    // NULL MEANS "NO SWAP", and a caller must be able to tell it from a
    // swap that happens to land on the same ability.
    file: TIERS,
    name: "an ungranted tradition returns an ability instead of null",
    from: "  if (!hit) return null;",
    to: "  if (!hit) return TRADITIONS[wanted[0]]?.ability ?? null;",
    breaks: "D3 — 'not granted' becomes indistinguishable from 'granted'"
  },
  {
    // TWO CALL SITES, so the anchor carries the line above it to pick the
    // one that builds the preparation lines. `suppressedTierFeats` calls
    // it identically a few dozen lines down.
    file: CASTING,
    name: "feat-casting stops reading the slot table",
    from: "  const own = String(ownTradition ?? \"\").trim().toLowerCase();\n  const byTradition = casterTierSlots(featNames, level);\n  for (const tradition of Object.keys(byTradition).sort()) {",
    to: "  const own = String(ownTradition ?? \"\").trim().toLowerCase();\n  const byTradition = {};\n  for (const tradition of Object.keys(byTradition).sort()) {",
    breaks: "E1 — the twelve feats reach nothing, which is where they started"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([TIERS, CASTING, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-caster-tier-feats: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-caster-tier-feats: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-caster-tier-feats: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
