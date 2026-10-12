#!/usr/bin/env node
/**
 * mutate-missile-storm — can verify-missile-storm fail?
 * NEW at 3.478.0.
 *
 * Z5 IS THE ONE THAT MATTERS. "per Size category above Medium" adds; a
 * signed step count would SUBTRACT missiles from a Small creature, and
 * nothing on a card full of Medium foes would ever show it.
 *
 * B1 IS THE SECOND. N × (1d4+1) is Nd4 + N. Dropping the flat term
 * prints a perfectly plausible number that is short by one point per
 * missile.
 *
 * W4 IS THE THIRD. Re-deriving who is inside would undo the pruning the
 * area block already did — and the card would still read correctly,
 * because it prints the list it damaged.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = path.join(SYSTEM_ROOT, "module", "magic", "missile-storm.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "missile-storm-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-missile-storm.mjs");

const MUTATIONS = [
  {
    file: M,
    name: "Z5 THE CLAMP REMOVED: a Small creature loses missiles",
    from: "  return Math.max(0, index - SIZE_LADDER.indexOf(BASE_SIZE));",
    to: "  return index - SIZE_LADDER.indexOf(BASE_SIZE);",
    breaks: "Z5 — \"above Medium\" would start subtracting"
  },
  {
    file: M,
    name: "Z6 an unknown size throws instead of reading as Medium",
    from: "  if (index < 0) return 0;",
    to: "  if (index < 0) return -1;",
    breaks: "Z6 — a blank size field is a Medium creature"
  },
  {
    file: M,
    name: "C2 one extra set for anything large, rather than one per category",
    from: "  if (steps > 0 && m) parts.push(`${Number(m[1]) * steps}d${m[2]}`);",
    to: "  if (steps > 0 && m) parts.push(`${Number(m[1])}d${m[2]}`);",
    breaks: "C2 — right for Large, wrong for everything above it"
  },
  {
    file: M,
    name: "B1 THE FLAT TERM DROPPED: the +1 on each missile vanishes",
    from: "  const flat = n * spec.missileBonus;",
    to: "  const flat = 0;",
    breaks: "B1 — one point short per missile, on a plausible-looking roll"
  },
  {
    file: M,
    name: "B4 a count of zero rolls \"0d4\"",
    from: "  if (n < 1) return null;",
    to: "  if (n < 0) return null;",
    breaks: "B4 — a card claiming a roll that never happened"
  },
  {
    file: M,
    name: "R6 a missile may roll two dice, and be read as rolling one",
    from: "  if (Number(m[1]) !== 1) return null; // one die per missile; see stormFormula",
    to: "  // one die per missile; see stormFormula",
    breaks: "R6 — the count multiplies the die and would halve the spell"
  },
  {
    file: M,
    name: "R4 the per-size dice become optional",
    from: "  if (!DICE.test(perSizeDice)) return null;",
    to: "  if (perSizeDice && !DICE.test(perSizeDice)) return null;",
    breaks: "R4 — the size clause would vanish in silence"
  },
  {
    file: M,
    name: "L3 the size is printed even when it changed nothing",
    from: '  const sizeNote = steps > 0 ? ` <em>(${lower(size)} — ${steps} extra ${steps === 1 ? "set" : "sets"})</em>` : "";',
    to: '  const sizeNote = ` <em>(${lower(size)} — ${steps} extra sets)</em>`;',
    breaks: "L3 — \"(medium — 0 extra sets)\" beside every ordinary target"
  },
  {
    file: M,
    name: "A1 the card stops saying there is nothing to roll against",
    from: "  return `<em>${spec.label} requires no attack roll and allows no save — the missiles simply land.</em>`;",
    to: "  return `<em>${spec.label} lands.</em>`;",
    breaks: "A1 — silence reads as a broken save prompt"
  },
  {
    file: F,
    name: "W6 THE COUNT HOISTED OUT OF THE LOOP: one count for everyone",
    from: "    const countRoll = await new Roll(countFormula).evaluate();",
    to: "    const countRoll = window.__storm ??= await new Roll(countFormula).evaluate();",
    breaks: "W6 — every creature would take the first one's count"
  },
  {
    file: F,
    name: "W7 the CASTER's size is read instead of the target's",
    from: '    const size = String(target.system?.identity?.size ?? "");',
    to: '    const size = String(caught[0]?.system?.identity?.size ?? "");',
    breaks: "W7 — Graham ruled the target's size adds the missiles"
  },
  {
    file: F,
    name: "W4 THE GEOMETRY ASKED AGAIN, undoing the area block's pruning",
    from: "  const caught = (targets ?? []).filter(Boolean);",
    to: "  const caught = (targets ?? []).filter(Boolean).filter((t) => !t.testPoint);",
    breaks: "W4 — a creature the walls spared would be re-included"
  },
  {
    file: F,
    name: "W8 defences are skipped and the raw roll lands",
    from: "    if (packet.taken > 0) {",
    to: "    if (damageRoll.total > 0) {",
    breaks: "W8 — resistance and immunity would stop biting"
  },
  {
    file: C,
    name: "W2 the storm fires at every target, not the pruned list",
    from: "          areaTargets ?? []",
    to: "          areaTargets ?? targets ?? []",
    breaks: "W2 — line of effect and the kind gate would be undone"
  },
  {
    file: C,
    name: "W1 the cast stops firing the storm at all",
    from: '        if (row?.kind !== "missileStorm") continue;',
    to: '        if (row?.kind !== "missileStormXX") continue;',
    breaks: "W1 — a 20 PP spell that does nothing"
  }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
guardFiles(files);

const survivors = [];
let applied = 0;

function verifyPasses() {
  try {
    execFileSync(process.execPath, [V], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

if (!verifyPasses()) {
  console.error("mutate-missile-storm: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    if (!source.includes(m.from)) {
      console.error(`mutate-missile-storm: anchor missing for "${m.name}"`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-missile-storm: "${m.name}" changes nothing`);
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
  console.error(`mutate-missile-storm: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-missile-storm: all ${applied} mutations were caught`);
