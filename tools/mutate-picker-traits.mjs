#!/usr/bin/env node
/**
 * mutate-picker-traits — can verify-picker-traits fail?
 *
 * NEW at 3.544.0, beside the verify.
 *
 * T1 AND T5 PULL AGAINST EACH OTHER on purpose. One says Enigma must be
 * refused to a Rogue, the other that seventeen untraited archetype feats
 * must still reach everyone. A gate that gave up satisfies the second and
 * breaks the first; a gate that refused everything does the reverse.
 *
 * THE FIRST TWO MUTATIONS ARE WHAT THE SYSTEM ACTUALLY SHIPPED — one
 * restores the missing tier gate, the other the missing Heritage gate.
 * Both were live for as long as `picker-filters.mjs` had no verify.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "picker-filters.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-picker-traits.mjs");

const MUTATIONS = [
  {
    file: P,
    name: "T1 THE TIER TRAIT IS IGNORED AGAIN — what 3.543.1 shipped",
    from: "        if (!traitClasses.length && !traitTiers.length) return true;",
    to: "        if (!traitClasses.length) return true;",
    breaks: "T1/T2/T3/T7 — Enigma, Assassin, Aegis, Armour Master and Cavalier go back to "
      + "being offered to every class, and three classes see one identical list"
  },
  {
    file: P,
    name: "T1b THE TIER IS COLLECTED BUT NEVER COMPARED",
    from: "        return traitClasses.some((t) => mineClasses.includes(t))\n          || traitTiers.some((t) => mineTiers.includes(t));",
    to: "        return traitClasses.some((t) => mineClasses.includes(t));",
    breaks: "T1b/T2/T3 — the subtler half: the gate is present, so tier-traited feats reach "
      + "NOBODY rather than everybody. A per-feat refusal check would call that a pass"
  },
  {
    file: P,
    name: "T4 THE BARD'S SLASH IS NOT SPLIT",
    from: "        const mineTiers = String(tier ?? \"\").toLowerCase()\n          .split(/[,/]\\s*/).map((t) => t.trim()).filter(Boolean);",
    to: "        const mineTiers = [String(tier ?? \"\").toLowerCase().trim()];",
    breaks: "T4 — \"adept/expert\" matches no trait at all, so the Bard silently loses every "
      + "tier-gated archetype feat instead of gaining both sets"
  },
  {
    file: P,
    name: "H1 THE HERITAGE GATE NEVER ENGAGES — what 3.543.1 shipped",
    from: "  if (level <= 1) return baseFilter;",
    to: "  if (level >= 0) return baseFilter;",
    breaks: "H2/H4 — the six Heritage feats are offered at every level again, which is the "
      + "defect Graham reported"
  },
  {
    file: P,
    name: "H2 THE GATE HIDES THEM AT 1st LEVEL TOO",
    from: "  if (level <= 1) return baseFilter;",
    to: "  if (level < 1) return baseFilter;",
    breaks: "H1 — \"1st level only\" becomes \"never\", and a character can no longer take "
      + "the Half-Elf feat at the one level they are allowed to"
  },
  {
    file: P,
    name: "H3 THE GATE EMPTIES THE WHOLE LIST ABOVE 1st",
    from: "    return !hasHeritageTrait(entry);",
    to: "    return false;",
    breaks: "H3/H4b — every racial and general feat vanishes for anyone past 1st level; "
      + "H2 alone would call that a pass"
  },
  {
    file: P,
    name: "H4 THE GATE IS WIRED TO THE RACIAL SLOT ONLY",
    from: "  if (!PREREQUISITE_GATED_SLOTS.has(slotKey)) return baseFilter;\n  const level = Number(actor?.system?.identity?.level ?? 0);",
    to: "  if (slotKey !== \"racialFeat\") return baseFilter;\n  const level = Number(actor?.system?.identity?.level ?? 0);",
    breaks: "H4 — Adoptive Race is a GENERAL feat and Enigma an ARCHETYPE one; a gate that "
      + "knows only about racial feats misses two thirds of the trait, including the feat "
      + "that was reported"
  },
  {
    file: P,
    name: "H5 THE TRAIT TEST MATCHES ON A SUBSTRING",
    from: "  return String(entry?.system?.traits ?? \"\")\n    .split(/,\\s*/)\n    .map((t) => t.trim().toLowerCase())\n    .includes(\"heritage\");",
    to: "  return /heritage/i.test(String(entry?.system?.traits ?? \"\"));",
    breaks: "P1 — a trait merely CONTAINING the word would count. It happens to agree on "
      + "today's pack, which is exactly why the population is pinned rather than trusted"
  },
  {
    file: P,
    name: "H6 THE REASON LINE STOPS EXPLAINING",
    from: "  return `Heritage feats may be selected at 1st level only — this character is level ${level}.`;",
    to: "  return null;",
    breaks: "H5 — the picker goes empty with no explanation, and a player cannot tell a "
      + "rule from a bug. That ambiguity is how this defect survived in the first place"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-picker-traits: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-picker-traits: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-picker-traits: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
