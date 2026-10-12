#!/usr/bin/env node
/**
 * mutate-runemage — can verify-runemage fail?
 *
 * NEW at 3.546.0, beside the verify.
 *
 * G2 AND F1 PULL AGAINST EACH OTHER, and that is the point of both. One
 * says the material component must stop needing a pouch; the other that
 * a held focus must NOT excuse the rune. A gate that waved everything
 * through would satisfy the first and break the second.
 *
 * THE FIRST MUTATION IS WHAT THE SYSTEM ACTUALLY SHIPPED — the
 * replacement never happening — and it was live for every release that
 * carried the feat's arithmetic.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "runemage.mjs");
const G = path.join(SYSTEM_ROOT, "module", "magic", "component-gate.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-runemage.mjs");

const MUTATIONS = [
  {
    file: G,
    name: "G1 THE GATE NEVER APPLIES THE REPLACEMENT — what shipped for months",
    from: "  components = symbolComponents(components, runemage);",
    to: "  components = symbolComponents(components, false);",
    breaks: "G1/G2/G3 — a Runemage answers exactly like a caster with no feats, which is "
      + "the measurement that started this: identical on all six component combinations"
  },
  {
    file: R,
    name: "G2 SYMBOL IS REMOVED RATHER THAN SUBSTITUTED",
    from: "  if (replaced) base[SYMBOL_COMPONENT] = true;",
    to: "  if (false) base[SYMBOL_COMPONENT] = true;",
    breaks: "G3/C1 — the components simply vanish, so the spell becomes EASIER than the "
      + "book allows: no pouch, no rune, no hand, and nothing on the card"
  },
  {
    file: R,
    name: "G3 SOMATIC IS REPLACED TOO",
    from: 'export const REPLACED_COMPONENTS = Object.freeze(["verbal", "material", "focus"]);',
    to: 'export const REPLACED_COMPONENTS = Object.freeze(["verbal", "material", "focus", "somatic"]);',
    breaks: "R2/R5 — the feat's own word is NON-somatic; folding the gestures in as well "
      + "reads the sentence backwards"
  },
  {
    file: R,
    name: "G4 A COMPONENTLESS SPELL IS GIVEN A SYMBOL ANYWAY",
    from: "  let replaced = false;",
    to: "  let replaced = true;",
    breaks: "R4/G3e — an innate or componentless effect would suddenly need a free hand it "
      + "never needed, because a Runemage happened to cast it"
  },
  {
    file: R,
    name: "H1 THE SYMBOL STOPS NEEDING A HAND",
    from: "  return Boolean(components?.somatic || components?.[SYMBOL_COMPONENT]);",
    to: "  return Boolean(components?.somatic);",
    breaks: "G3 — Graham's ruling reversed: a Runemage with both hands full casts freely, "
      + "with no way to draw the rune"
  },
  {
    file: R,
    name: "H2 A CASTING FOCUS DRAWS THE RUNE AFTER ALL",
    from: "  return !components?.[SYMBOL_COMPONENT];",
    to: "  return true;",
    breaks: "F1 — the reading Graham chose AGAINST. A held focus stands in for gestures, "
      + "not for a rune, and this is the one place Symbol is stricter"
  },
  {
    file: R,
    name: "H2b THE FOCUS STOPS SATISFYING ANYTHING",
    from: "  return !components?.[SYMBOL_COMPONENT];",
    to: "  return false;",
    breaks: "F1b — the other direction, and a silent nerf to every focus caster in the "
      + "game; F1 alone would call it a pass"
  },
  {
    file: R,
    name: "D1 THE DETECTOR MATCHES ON A SUBSTRING",
    from: '    .some((n) => String(n ?? "").trim().toLowerCase() === "runemage");',
    to: '    .some((n) => /runemage/i.test(String(n ?? "")));',
    breaks: "D2 — \"Greater Runemage\" or \"Anti-Runemage\" would switch the archetype on. "
      + "The fixture first used \"Runemaster\", which does not contain the word, and this "
      + "mutation SURVIVED — the same miss the Heritage trait test made two releases ago"
  },
  {
    file: R,
    name: "C1 THE CARD STOPS NAMING THE SYMBOL",
    from: '  const order = ["verbal", "somatic", "material", "focus", SYMBOL_COMPONENT];',
    to: '  const order = ["verbal", "somatic", "material", "focus"];',
    breaks: "C1 — the card lists only what is left, so a Runemage's card says \"Somatic\" "
      + "and nothing about the rune, which is what a broken feat looks like"
  },
  {
    file: R,
    name: "C2 THE ROOM-TO-DRAW LINE GOES QUIET",
    from: '  if (!components?.[SYMBOL_COMPONENT]) return null;',
    to: '  if (true) return null;',
    breaks: "C2 — the one requirement of this feat nothing can enforce stops being said "
      + "out loud, and an unimplemented rule starts looking like a working one"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([R, G, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-runemage: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-runemage: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-runemage: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
