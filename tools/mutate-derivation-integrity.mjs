#!/usr/bin/env node
/**
 * mutate-derivation-integrity — can verify-derivation-integrity fail?
 * NEW at 3.552.1.
 *
 * The first mutation is the shipped bug, put back exactly as it was for
 * five releases. If that one ever says SURVIVED, this whole file is
 * decoration.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const ACTOR = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-derivation-integrity.mjs");

const MUTATIONS = [
  {
    file: ACTOR,
    name: "A1 THE SHIPPED BUG: a module function reaches for `this`",
    from: '      system.progression?.casterStyle ?? "", Array.from(actor?.items ?? []));',
    to: '      system.progression?.casterStyle ?? "", Array.from(this.items ?? []));',
    breaks: "A2/B1 — every actor stopped deriving at this line, and every skill total was 0"
  },
  {
    file: ACTOR,
    name: "A2 the same slip somewhere else in the same function",
    from: "    const chosenAbility = actor.getFlag?.(\"trg-prime\", \"castingAbilityChoice\");",
    to: "    const chosenAbility = this.getFlag?.(\"trg-prime\", \"castingAbilityChoice\");",
    breaks: "A2 — the check must find the CLASS of bug, not the one line that caused it"
  },
  {
    file: ACTOR,
    name: "A3 skills stop deriving at all",
    from: "    prepareSkills(system, this);",
    to: "",
    breaks: "C2 — the step whose absence the incident was measured by"
  },
  {
    file: ACTOR,
    name: "A4 wealth is derived before attributes resolve",
    from: "    prepareAttributes(system, this);",
    to: "    system.wealth = startingWealthFor(this);\n    prepareAttributes(system, this);",
    breaks: "C3/C5 — Charisma would be read before a race or an item had contributed to it"
  },
  {
    file: ACTOR,
    name: "A5 combat derives after skills, so a throw there costs less and hides longer",
    from: "    prepareCombat(system, this);\n    prepareArmourProtection(system, this);\n    prepareSkills(system, this);",
    to: "    prepareSkills(system, this);\n    prepareCombat(system, this);\n    prepareArmourProtection(system, this);",
    breaks: "C3/C4 — the order is what the ACP and defence comments spend twenty lines justifying"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([ACTOR, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-derivation-integrity: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-derivation-integrity: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-derivation-integrity: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
