#!/usr/bin/env node
/**
 * mutate-refresh-ownership — can verify-refresh-ownership fail?
 *
 * NEW at 3.406.1. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT, restored as one edit: removing "prepared"
 * from the preserved list is exactly the state the system was in until
 * this release, and it destroys a caster's whole prepared list the next
 * time a GM runs Refresh Items.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const OWN = path.join(SYSTEM_ROOT, "module", "refresh-ownership.mjs");
const REFRESH = path.join(SYSTEM_ROOT, "module", "compendium-refresh.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-refresh-ownership.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED DEFECT: prepared stops being the player's",
    file: OWN,
    from: '  "prepared",\n',
    to: "",
    breaks: "A1 — a refresh un-prepares every prepared spell in the world"
  },
  {
    name: "innate stops being the player's",
    file: OWN,
    from: '  "innate"\n',
    to: '  "attackedThisTurn"\n',
    breaks: "A2 — a monster's spell-likes become spells it must prepare"
  },
  {
    // THE OTHER HALF. Preserving effects would mean no correction ever
    // reaches an owned item — 3.406.0's Stone Shield fix included.
    name: "effects become the player's too",
    file: OWN,
    from: '  "usesValue",',
    to: '  "effects",\n  "usesValue",',
    breaks: "B1 — a data fix can never reach a character who already owns the item"
  },
  {
    name: 'the bare leaf "value" is preserved',
    file: OWN,
    from: '  "bonusUses",',
    to: '  "bonusUses",\n  "value",',
    breaks: "B3 — the most common leaf in the schema freezes half the rulebook"
  },
  {
    name: "leaf matching takes the FIRST segment rather than the last",
    file: OWN,
    from: "  return cut === -1 ? text : text.slice(cut + 1);",
    to: '  return text.split(".")[0];',
    breaks: "C1/C4 — every nested preserved field stops being recognised"
  },
  {
    name: "a preserved name written as a path is accepted",
    file: OWN,
    from: "  return PRESERVED_FIELDS.includes(String(leaf ?? \"\"));",
    to: "  return PRESERVED_FIELDS.some((f) => String(leaf ?? \"\").endsWith(f));",
    breaks: 'C5 — "effects" ends with nothing preserved, but loose matching invites it'
  },
  {
    // THE REFILL. What survives is the amount SPENT, not the amount left.
    name: "a raised maximum refills what was spent",
    file: OWN,
    from: "  const spent = Math.max(0, previousMax - (Number(oldValue) || 0));\n  return Math.min(max, Math.max(0, max - spent));",
    to: "  return Math.min(max, Math.max(0, Number(oldValue) || 0));",
    breaks: "D1/D2 — a half-used set of healer's tools silently refills"
  },
  {
    name: "an uninitialised maximum comes back empty",
    file: OWN,
    from: "  if (previousMax <= 0) return max;",
    to: "  if (previousMax <= 0) return 0;",
    breaks: "D4 — an item that never had a maximum arrives with no charges"
  },
  {
    // THE RULE MUST BE CONSULTED. A list nothing reads is a list that
    // protects nothing.
    name: "the differ stops consulting the preserved list",
    file: REFRESH,
    from: "    if (PRESERVED_FIELDS.includes(leaf)) continue;",
    to: "    if (false) continue;",
    breaks: "E2 — every player-owned field is overwritten by the compendium"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([OWN, REFRESH, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-refresh-ownership: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-refresh-ownership: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-refresh-ownership: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
