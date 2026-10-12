#!/usr/bin/env node
/**
 * mutate-caster-style — can verify-caster-style fail?
 *
 * NEW at 3.547.0, beside the verify.
 *
 * R1 AND R1b PULL AGAINST EACH OTHER: one says a Wizard holding Enigma
 * must cast instinctively, the other that a Wizard without it must not.
 * An override that always fired would satisfy the first and break the
 * second; the shipped behaviour — never firing — did the reverse.
 *
 * THE FIRST MUTATION IS WHAT SHIPPED, and it shipped under a comment
 * asserting no rule could ever need it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const S = path.join(SYSTEM_ROOT, "module", "magic", "caster-style.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-caster-style.mjs");

const MUTATIONS = [
  {
    file: S,
    name: "R1 THE OVERRIDE NEVER FIRES — what shipped, under a confident comment",
    from: "  return declaredCasterStyle(items) ?? clean(classStyle);",
    to: "  return clean(classStyle);",
    breaks: "R1/R3 — the class decides and nothing else can, so Enigma goes back to being "
      + "three-quarters inert with its repertoire unreachable"
  },
  {
    file: S,
    name: "R1b THE OVERRIDE ALWAYS FIRES",
    from: "  return declaredCasterStyle(items) ?? clean(classStyle);",
    to: "  return declaredCasterStyle(items) ?? \"instinctive\";",
    breaks: "R1b — every caster in the game stops memorising; R1 alone would call that a "
      + "pass, which is why both directions are asserted"
  },
  {
    file: S,
    name: "D1c A CLASS COUNTS AS AN OVERRIDE",
    from: "    if (item?.type === \"class\") continue;",
    to: "    if (false) continue;",
    breaks: "D1c — the baseline would race itself: a Bard's own instinctive style would be "
      + "read twice, once as progression and once as an override, and item order would "
      + "decide which"
  },
  {
    file: S,
    name: "D1d ANY STRING BECOMES A CASTER STYLE",
    from: "    if (CASTER_STYLES.includes(style)) return style;",
    to: "    if (style) return style;",
    breaks: "D1d — a typo in a feat's data would silently become the character's casting "
      + "style, and \"boook\" would be as valid as \"book\""
  },
  {
    file: S,
    name: "M1 AN INSTINCTIVE CASTER STILL MEMORISES",
    from: "  if (clean(casterStyle) === \"instinctive\") return \"\";",
    to: "  if (false) return \"\";",
    breaks: "R2 — Enigma's \"do not have to memorise your spells during daily preparation\" "
      + "stops meaning anything and the spellbook comes back"
  },
  {
    file: S,
    name: "M1b NOBODY MEMORISES ANYTHING",
    from: "  return String(classMemorisation ?? \"\");",
    to: "  return \"\";",
    breaks: "R2b/R2c — the Wizard's spellbook and the Cleric's list both vanish; M1 alone "
      + "would call that a pass"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([S, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-caster-style: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-caster-style: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-caster-style: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
