#!/usr/bin/env node
/**
 * mutate-elemental-shield — can verify-elemental-shield fail?
 * NEW at 3.473.0.
 *
 * O1 IS THE ONE THAT MATTERS. "A fire shield resists fire" is the
 * reading anybody reaches for and it is exactly backwards — the book
 * puts a parenthesis in specifically to stop it. That mutation is below.
 *
 * W4 IS THE RULING. Graham: resistance halves and has no value. A
 * mutation that writes a NUMBER into the resistance is the shape of the
 * mistake his answer was given to prevent.
 *
 * P7/S5 PROTECT VIBRANT THORNS, which shares this mechanism and must not
 * grow a save it never had.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const C = path.join(SYSTEM_ROOT, "module", "magic", "damage-type-choice.mjs");
const T = path.join(SYSTEM_ROOT, "module", "magic", "thorns.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "thorns-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-elemental-shield.mjs");

const MUTATIONS = [
  {
    // THE READING ANYBODY REACHES FOR.
    file: C,
    name: "O1 THE OBVIOUS WRONG WAY ROUND: a fire shield resists fire",
    from: 'const OPPOSITES = Object.freeze({ fire: "cold", cold: "fire" });',
    to: 'const OPPOSITES = Object.freeze({ fire: "fire", cold: "cold" });',
    breaks: "O1/O2 — the book's own parenthesis exists to stop exactly this"
  },
  {
    file: C,
    name: "O3 acid and electricity are given an invented opposite",
    from: 'const OPPOSITES = Object.freeze({ fire: "cold", cold: "fire" });',
    to: 'const OPPOSITES = Object.freeze({ fire: "cold", cold: "fire", acid: "electricity", electricity: "acid" });',
    breaks: "O3 — the book pairs no such thing"
  },
  {
    file: C,
    name: "C2 a choice that was never offered is honoured",
    from: "  if (offered.includes(pick)) return pick;",
    to: "  if (pick) return pick;",
    breaks: "C2 — a stale pick could change which element a cast used"
  },
  {
    file: C,
    name: "C4 a single offer still demands a choice",
    from: "  return offered.length === 1 ? offered[0] : null;",
    to: "  return null;",
    breaks: "C4 — a one-element spell would refuse itself"
  },
  {
    file: C,
    name: "E2 an unknown element is offered",
    // RE-ANCHORED at 3.603.0, where the chooser widened from the four
    // elements to every damage type the system has (Graham's R9). The guard
    // moved from `ELEMENTS.includes` to `isDamageType`; the mutation's
    // intent is untouched, because what it measures is that the row's
    // declared list is VALIDATED at all — a typo becoming a castable answer
    // is the same defect whether the vocabulary is four names or fourteen.
    from: "    if (isDamageType(k) && !seen.includes(k)) seen.push(k);",
    to: "    if (k && !seen.includes(k)) seen.push(k);",
    breaks: "E2 — a typo in a pack row would become a castable element"
  },
  {
    file: C,
    name: "V1 the element saves are swapped",
    from: '  acid: "Fortitude",\n  cold: "Fortitude",\n  electricity: "Reflex",\n  fire: "Reflex"',
    to: '  acid: "Reflex",\n  cold: "Reflex",\n  electricity: "Fortitude",\n  fire: "Fortitude"',
    breaks: "V1/V2 — \"Fortitude for Acid and Cold, Reflex for Electricity and Fire\""
  },
  {
    // VIBRANT THORNS MUST NOT GROW A SAVE.
    file: T,
    name: "S5 a thorns row with no save prints one anyway",
    from: "  return spec?.save\n    ? `A <strong>${spec.save}</strong> save applies to this damage — apply by hand.`\n    : \"\";",
    to: "  return `A <strong>${spec?.save || \"Basic Reflex\"}</strong> save applies to this damage — apply by hand.`;",
    breaks: "S5 — Vibrant Thorns would gain a save it never had"
  },
  {
    file: T,
    name: "S3 the save stops being carried",
    from: "    save: text(raw.save)",
    to: '    save: ""',
    breaks: "S3/S4 — the printed save would vanish from the card"
  },
  {
    file: F,
    name: "W8 the printed save is swallowed",
    from: "    if (saveNote) lines.push(`<em>${saveNote}</em>`);",
    to: "    void saveNote;",
    breaks: "W8 — the save would be named nowhere the table can see"
  },
  {
    // THE RULING, INVERTED.
    file: E,
    name: "W4 THE RULING BROKEN: the resistance is written as a number",
    from: '              ? [{ key: "system.combat.resistances", mode: 2, value: resists, priority: 20 }]',
    to: '              ? [{ key: "system.combat.resistances", mode: 2, value: 5, priority: 20 }]',
    breaks: "W4 — resistance halves and has no value; damage.mjs already does the halving"
  },
  {
    file: E,
    name: "W5 the shield resists its own element",
    from: "          const resists = opposingElement(element);",
    to: "          const resists = element;",
    breaks: "W5 — a fire shield would resist fire"
  },
  {
    file: E,
    name: "W6 the rider burns with the element it resists",
    from: "          const spec = normaliseThorns({ ...effect, damageType: element });",
    to: "          const spec = normaliseThorns({ ...effect, damageType: opposingElement(element) });",
    breaks: "W6 — a fire shield would deal cold"
  },
  {
    file: E,
    name: "W2 the caster is never asked",
    from: "          const picked = await promptTypeChoice(effect.label || spell.name, offered);",
    to: "          const picked = offered[0];",
    breaks: "W2 — the choice the spell is built around would be made for them"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([C, T, F, E, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-elemental-shield: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-elemental-shield: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-elemental-shield: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
