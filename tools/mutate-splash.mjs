#!/usr/bin/env node
/**
 * mutate-splash — can verify-splash fail?
 * NEW at 3.482.0.
 *
 * W1 IS THE ARITHMETIC ONE and the least likely to be reported: splash
 * applied as a SECOND instance halves separately under resistance, so
 * 5 + 1 resolves to 2 where it should be 3. A card showing a plausible
 * number, one point light, for ever.
 *
 * W4 RESTORES THE SHIPPED BOMB BUG exactly — main damage only, splash on
 * nobody, while the file's header claims the opposite.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const S = path.join(SYSTEM_ROOT, "module", "magic", "splash.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const A = path.join(SYSTEM_ROOT, "module", "alchemical-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-splash.mjs");

const MUTATIONS = [
  {
    file: C,
    name: "W1 THE ARITHMETIC: splash resolved as a second instance",
    from: "  dealt += splashDealt;",
    to: "  const _splashLater = splashDealt;",
    breaks: "W1 — resistance halves each part, losing a point"
  },
  {
    file: C,
    name: "W2 the ladder stops riding caster level",
    from: "splashTotal(splashSpec, Number(clMods?.steps ?? 0))",
    to: "splashTotal(splashSpec, 0)",
    breaks: "W2 — \"CL 4+ … and the splash damage by 1\" ignored"
  },
  {
    file: C,
    name: "W3 the spell stops naming the neighbours",
    from: "      : splashNeighboursLine(splashSpec, splashDealt)));",
    to: "      : \"\"));",
    breaks: "W3 — the silence Graham reported"
  },
  {
    file: A,
    name: "W4 THE SHIPPED BOMB BUG: splash lands on nobody",
    from: "    const total = rolled.total + splashOnTarget;",
    to: "    const total = rolled.total;",
    breaks: "W4 — what the header claimed and the code never did"
  },
  {
    file: S,
    name: "C2 the caster-level ladder is dropped",
    from: "  const extra = spec.perStep * Math.max(0, Math.trunc(Number(steps) || 0));",
    to: "  const extra = 0;",
    breaks: "C2 — splash frozen at its level-1 value"
  },
  {
    file: S,
    name: "L3 the radius is invented rather than left to the GM",
    from: "    + \"<em>Applied by hand: the book prints no radius for splash.</em>\";",
    to: "    + \"<em>Everyone within 5 feet.</em>\";",
    breaks: "L3 — a distance the book prints nowhere"
  },
  {
    file: S,
    name: "L1 THE FORMULA STOPS ADMITTING THE SPLASH IS IN IT",
    from: "  return ` + ${n} splash`;",
    to: '  return "";',
    breaks: "L1 — \"(3d6, warped)\" beside a total that includes 3 splash"
  },
  {
    file: C,
    name: "W3b THE SHIPPED ORDERING BUG: neighbours reported before the blow",
    from: "  if (splashSpec && splashDealt > 0) {",
    to: "  if (false && splashSpec && splashDealt > 0) {",
    breaks: "W3 — the neighbours' share would vanish entirely"
  },
  {
    file: C,
    name: "L1 the damage line drops the splash fragment",
    from: "${splashNote})` : \"\"}",
    to: "})` : \"\"}",
    breaks: "L1 — the formula stops producing its own number again"
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
  console.error("mutate-splash: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    if (!source.includes(m.from)) {
      console.error(`mutate-splash: anchor missing for "${m.name}"`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-splash: "${m.name}" changes nothing`);
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
  console.error(`mutate-splash: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-splash: all ${applied} mutations were caught`);
