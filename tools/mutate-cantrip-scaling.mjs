#!/usr/bin/env node
/**
 * mutate-cantrip-scaling — can verify-cantrip-scaling fail?
 * NEW at 3.483.0.
 *
 * L2 RESTORES THE DAZE DEFECT exactly: a threshold with an empty
 * `damageDice` beside a working Save DC ladder. Nothing throws, the
 * ladder looks present, and the damage never moves.
 *
 * P1 IS THE DIRECTION NOBODY REPORTS — a ladder raising something the
 * printed text never promised. A spell being too good is not a bug
 * anybody at a table complains about.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = path.join(SYSTEM_ROOT, "module", "magic", "caster-level-mods.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-cantrip-scaling.mjs");

const MUTATIONS = [
  {
    file: M,
    name: "L3 the ladder stops recurring — right at CL 4, wrong above it",
    from: "      ? Math.floor(cl / threshold)",
    to: "      ? (cl >= threshold ? 1 : 0)",
    breaks: "L3 — CL 8 would gain the same as CL 4"
  },
  {
    file: M,
    name: "L2 dice stop being multiplied by the step count",
    from: "      out.damageDice = addDice(out.damageDice, `${Number(diceTerm[1]) * steps}d${diceTerm[2]}`);",
    to: "      out.damageDice = addDice(out.damageDice, `${Number(diceTerm[1])}d${diceTerm[2]}`);",
    breaks: "L3 — every level above 4 gains only one die"
  },
  {
    file: M,
    name: "P1 THE PERSISTENT LADDER IS DROPPED AGAIN",
    from: "    if (mod?.persistent) out.persistent += Number(mod.persistent) * steps;",
    to: "",
    breaks: "P1 — Orb Of Fire's \"and the persistent by 1\" unread once more"
  },
  {
    file: M,
    name: "P1 the persistent climbs without being multiplied",
    from: "    if (mod?.persistent) out.persistent += Number(mod.persistent) * steps;",
    to: "    if (mod?.persistent) out.persistent += Number(mod.persistent);",
    breaks: "P1 — a 12th-level Orb Of Fire would gain 1, not 3"
  },
  {
    file: C,
    name: "the cast stops adding the caster-level persistent",
    from: "  const persistExtra = warpPersistent + Number(clMods?.persistent ?? 0);",
    to: "  const persistExtra = warpPersistent;",
    breaks: "the ladder would resolve and never reach the card"
  }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
guardFiles(files);

const survivors = [];
let applied = 0;
const verifyPasses = () => {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!verifyPasses()) {
  console.error("mutate-cantrip-scaling: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    if (!source.includes(m.from)) {
      console.error(`mutate-cantrip-scaling: anchor missing for "${m.name}"`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-cantrip-scaling: "${m.name}" changes nothing`);
      process.exit(1);
    }
    applied += 1;
    fs.writeFileSync(m.file, source.replace(m.from, m.to));
    if (verifyPasses()) survivors.push(`${m.name} (should break ${m.breaks})`);
    fs.writeFileSync(m.file, source);
  }
} finally {
  for (const [f, s] of originals) fs.writeFileSync(f, s);
}

if (survivors.length) {
  console.error(`mutate-cantrip-scaling: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-cantrip-scaling: all ${applied} mutations were caught`);
