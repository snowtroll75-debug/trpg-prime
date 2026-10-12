#!/usr/bin/env node
/**
 * mutate-flat-damage — can verify-flat-damage and the splash rule fail?
 * NEW at 3.482.0.
 *
 * S2 IS GRAHAM'S REPORT: strip the splash row and Orb Of Acid is back to
 * what he saw at his table — a spell printing splash and applying none.
 *
 * B2 IS THE HALF THAT CAUGHT ITS OWN AUTHOR. Four spells were on the
 * backlog because my first scan asked whether a digit appeared anywhere
 * in the entry's JSON; putting one back must go red.
 *
 * W2 IS THE ARITHMETIC. Splash added AFTER `resolveAgainstDefences`
 * rather than before halves the two parts separately, and floor(5/2) +
 * floor(1/2) is 2 where floor(6/2) is 3. Nobody would ever report that.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const S = path.join(SYSTEM_ROOT, "module", "magic", "splash.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-flat-damage.mjs");
const VS = path.join(SYSTEM_ROOT, "tools", "verify-splash.mjs");

const MUTATIONS = [
  {
    file: V,
    name: "B2 a repaired spell is left sitting on the backlog",
    from: '  "Slay The Soul", "Elemental Fury",',
    to: '  "Slay The Soul", "Elemental Fury", "Orb Of Fire",',
    breaks: "B2 — the backlog would look permanent while shrinking"
  },
  {
    file: V,
    name: "B3 an excuse is offered with no reason",
    from: '["Web", "\\"an attack that deals at least 5 slashing damage or 1 fire damage\\" is the THRESHOLD for clearing a square of web, not damage the spell deals."]',
    to: '["Web", "n/a"]',
    breaks: "B3 — an exception with no reason is a suppression"
  },
  {
    file: V,
    name: "B1 the scan trusts the JSON blob again, as the first draft did",
    from: "      if (carried.has(Number(m[1]))) continue;        // the pack can apply this one",
    to: "      if (JSON.stringify(s).includes(m[1])) continue;",
    breaks: "B1 — the \"1\" in \"1d6\" satisfies a search for a splash of 1"
  },
  {
    file: S,
    name: "S4 THE CL LADDER IS DROPPED: splash never grows",
    from: "  const extra = spec.perStep * Math.max(0, Math.trunc(Number(steps) || 0));\n  return spec.amount + extra;",
    to: "  return spec.amount;",
    breaks: "S4 — right at caster level 1 and increasingly wrong above it"
  },
  {
    file: S,
    name: "S2 a splash of zero is accepted as a real row",
    from: "  if (!amount) return null;",
    to: "",
    breaks: "S2 — a row promising splash and carrying none"
  },
  {
    file: S,
    name: "the neighbours line stops naming them at all",
    from: "  return `<strong>Splash ${amount} ${spec.damageType}</strong> — to every creature adjacent to the target. `\n    + \"<em>Applied by hand: the book prints no radius for splash.</em>\";",
    to: '  return "";',
    breaks: "the silence Graham reported, restored"
  },
  {
    file: S,
    name: "a splash amount of nonsense is treated as real",
    from: "  const n = Math.trunc(Number(value));\n  return Number.isFinite(n) && n > 0 ? n : 0;",
    to: "  return Number(value);",
    breaks: "NaN splash would reach the damage arithmetic"
  }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
guardFiles(files);

const survivors = [];
let applied = 0;
const passes = (file) => {
  try { execFileSync(process.execPath, [file], { stdio: "pipe" }); return true; }
  catch { return false; }
};
const verifyPasses = () => passes(V) && (!fs.existsSync(VS) || passes(VS));

if (!verifyPasses()) {
  console.error("mutate-flat-damage: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    if (!source.includes(m.from)) {
      console.error(`mutate-flat-damage: anchor missing for "${m.name}"`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-flat-damage: "${m.name}" changes nothing`);
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
  console.error(`mutate-flat-damage: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-flat-damage: all ${applied} mutations were caught`);
