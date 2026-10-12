#!/usr/bin/env node
/**
 * mutate-damage-categories — can verify-damage-categories fail?
 *
 * NEW at 3.547.0, beside the verify.
 *
 * D1 AND D1b PULL AGAINST EACH OTHER: a plain blade must be halved by
 * mundane resistance and a runed one must not. A rule that halved
 * everything would satisfy the first; the shipped behaviour — halving
 * nothing, because the word never resolved — satisfied the second.
 *
 * D2 AND D2c DO THE SAME FOR MATERIALS. Cold iron must trigger the
 * weakness and silver must not, so "every material is a weakness" and
 * "no material is" both fail.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const F = path.join(SYSTEM_ROOT, "module", "defences.mjs");
const D = path.join(SYSTEM_ROOT, "module", "combat", "damage.mjs");
const T = path.join(SYSTEM_ROOT, "module", "creature-traits.mjs");
const Q = path.join(SYSTEM_ROOT, "module", "item-quality.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-damage-categories.mjs");

const MUTATIONS = [
  {
    file: F,
    name: "S1 THE PARENTHETICAL IS SPLIT AGAIN — what shipped",
    from: '    .replace(/\\s*\\([^)]*\\)/g, "")\n',
    to: "",
    breaks: "S1/S1b — \"all damage (force, essence)\" splits on the comma inside the "
      + "brackets into two entries that mean nothing, and \"physical (bludgeoning)\" "
      + "stops resolving where the bare word works"
  },
  {
    file: F,
    name: "S1c THE SPLIT STOPS ENTIRELY",
    from: "    .split(/[,;]/)",
    to: "    .split(/;/)",
    breaks: "S1c — a comma-separated field becomes one long entry; S1 alone would call "
      + "that a pass, since stripping brackets does leave a single clean string"
  },
  {
    file: F,
    name: "S2 stunning LOSES ITS ALIAS",
    from: '  stunning: "stunned",',
    to: '  stunningX: "stunned",',
    breaks: "S2 — seventeen creature entries go back to declaring an immunity that "
      + "resolves to nothing"
  },
  {
    file: F,
    name: "V1 A CATEGORY IS FILED AS A DAMAGE TYPE",
    from: "  if (DAMAGE_CATEGORIES.includes(lower)) categories.push(lower);",
    to: "  if (DAMAGE_CATEGORIES.includes(lower)) damageTypes.push(lower);",
    breaks: "V1/V1c — \"mundane\" would look like a fifteenth damage type to every "
      + "consumer, and the halving would key on a type nothing ever deals"
  },
  {
    file: F,
    name: "V4 EVERY UNKNOWN WORD BECOMES A CATEGORY",
    from: "  if (DAMAGE_CATEGORIES.includes(lower)) categories.push(lower);",
    to: "  if (lower) categories.push(lower);",
    breaks: "V4/U1 — \"bananas\" and \"death effects\" would resolve, so the nine words "
      + "still genuinely unresolved would stop being reported"
  },
  {
    file: T,
    name: "U1 THE LEFTOVERS ARE DISCARDED AGAIN — what shipped",
    from: "    unresolved: [...immune.unresolved, ...resistanceField.unresolved,\n      ...weaknessField.unresolved],",
    to: "    unresolved: [...immune.unresolved],",
    breaks: "U1/U1b — the resistance and weakness fields go back to dropping their "
      + "unknown words in silence, which is how a cold iron weakness that does nothing "
      + "looked exactly like one that works"
  },
  {
    file: D,
    name: "D1 MUNDANE RESISTANCE NEVER APPLIES — what shipped",
    from: '    (has(resistanceCategories, "mundane") && !magical)',
    to: "    (false)",
    breaks: "D1 — twenty creatures go back to declaring a resistance that halves nothing"
  },
  {
    file: D,
    name: "D1b MUNDANE RESISTANCE IGNORES THE SOURCE",
    from: '    (has(resistanceCategories, "mundane") && !magical)',
    to: '    has(resistanceCategories, "mundane")',
    breaks: "D1b — a runed blade would be halved too, and Graham's ruling is that a "
      + "Potency rune makes the source magical"
  },
  {
    file: D,
    name: "D2 THE MATERIAL STOPS TRIGGERING THE WEAKNESS",
    // THE LINE GAINED TWO MORE TERMS AT 3.548.0 (source and trait
    // weaknesses). The mutation is unchanged in spirit: drop the
    // material term and watch 50 creatures stop caring about cold iron.
    from: "|| materialWeak || sourceWeak",
    to: "|| sourceWeak",
    breaks: "D2 — 50 creatures go back to a cold iron, silver or adamantine weakness "
      + "that nothing applies"
  },
  {
    file: D,
    name: "D2c EVERY MATERIAL TRIGGERS THE WEAKNESS",
    from: "  const materialWeak = Boolean(materialKey) && has(weaknessMaterials, materialKey);",
    to: "  const materialWeak = Boolean(materialKey);",
    breaks: "D2c — a silver blade would get +50% against a creature that fears cold iron; "
      + "D2 alone would call that a pass"
  },
  {
    file: F,
    name: "B1 EVERY BRACKET IS READ AS A BYPASS MATERIAL",
    from: "      if (DEFENCE_MATERIALS.includes(part)) out.add(part);",
    to: "      if (part) out.add(part);",
    breaks: "B1b — \"physical (bludgeoning)\" would register \"bludgeoning\" as a material "
      + "that overcomes the resistance, which is a different rule wearing the same brackets"
  },
  {
    file: D,
    name: "B2 THE BYPASS NEVER APPLIES",
    from: "  const bypassed = Boolean(materialKey) && has(resistanceBypassMaterials, materialKey);",
    to: "  const bypassed = false;",
    breaks: "B2 — a silver weapon goes back to being halved by the very resistance it is "
      + "named as overcoming"
  },
  {
    file: D,
    name: "B2b THE BYPASS APPLIES TO EVERY MATERIAL",
    from: "  const bypassed = Boolean(materialKey) && has(resistanceBypassMaterials, materialKey);",
    to: "  const bypassed = Boolean(materialKey);",
    breaks: "B2c — any special material would ignore any category resistance; B2 alone "
      + "would call that a pass"
  },
  {
    file: D,
    name: "A2 all damage RESISTS NOTHING",
    from: "    || (has(resistanceCategories, ALL_DAMAGE) && !incorporealTouch));",
    to: "    || false);",
    breaks: "A2 — the one template that declares it goes back to resisting nothing at all"
  },
  {
    file: F,
    name: "T1 THE BESTIARY TRAIT WORDS STOP RESOLVING",
    from: "  if (DEFENCE_TRAITS.includes(lower)) traits.push(lower);",
    to: "  if (false) traits.push(lower);",
    breaks: "T1 — disease, charm and precision go back to being reported as unknown on "
      + "eight templates"
  },
  {
    file: Q,
    name: "M1 THE ITEM KEY STOPS BECOMING THE BESTIARY WORD",
    // RE-ANCHORED at 3.573.0: `materialDefenceWord` now consults the
    // material's own `overcomesResistance` before falling back to the
    // label, so Mithril and Alchemical Silver answer "silver". The
    // mutation still says the same thing — the key is handed over raw.
    from: '  if (material.overcomesResistance) {',
    to: "  if (true) return key;\n  if (material.overcomesResistance) {",
    breaks: "M1 — the weapon says `coldIron` and the creature says `cold iron`, so every "
      + "material weakness silently stops matching"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([F, D, T, Q, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-damage-categories: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-damage-categories: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-damage-categories: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
