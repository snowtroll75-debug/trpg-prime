#!/usr/bin/env node
/**
 * mutate-companions-familiars-137-140 — can the companion and familiar
 * checks fail?
 *
 * NEW at 3.570.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE DEFECT THIS SUBSYSTEM SHIPPED WITH: skill points back to 4.
 * It went unnoticed because the module, the class item and a doc comment
 * quoting a sentence the rulebook does not contain all agreed with each
 * other. If the new checks cannot catch it being put back, they are not
 * guarding the rule, they are restating the data.
 *
 * #2 AND #3 ARE THE TWO ROUNDINGS, flattened. A familiar's hit points
 * round UP and its Effective Level rounds DOWN, three printed lines
 * apart. Making either match the other is a one-word edit that throws
 * nothing, looks tidier, and silently changes every familiar in every
 * world.
 *
 * THE REST ARE THE QUIET ONES: a single cell of a 140-cell table, a
 * clamp turned into a fall-off, Tough applied on the wrong side of a
 * halving, and the conditional +2 against magic being pooled — which
 * would hand every familiar +2 against a pit trap.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const COMPANION = path.join(SYSTEM_ROOT, "module", "companion.mjs");
const FAMILIAR = path.join(SYSTEM_ROOT, "module", "familiar.mjs");
const DERIVE = path.join(SYSTEM_ROOT, "module", "familiar-derive.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-companions-familiars-137-140.mjs");

/* A DATA MUTATION, not a source one: the table lives in a LevelDB pack,
 * so the cell is edited in the check's own transcription instead. That
 * proves the comparison is live — if the printed table were quietly
 * being compared against itself, editing it would change nothing. */
const MUTATIONS = [
  {
    // THE SHIPPED DEFECT.
    file: COMPANION,
    name: "THE SHIPPED DEFECT: companion skill points go back to 4",
    from: "COMPANION_SKILL_POINTS = 2;",
    to: "COMPANION_SKILL_POINTS = 4;",
    breaks: "B3 — two extra skill points a level, forty over a career"
  },
  {
    // ROUNDING 1 FLATTENED. The tidying edit: make it floor like every
    // other halving in the system.
    file: FAMILIAR,
    name: "THE ROUNDING FLATTENED: familiar hit points round down",
    from: "  const half = Math.ceil(Math.max(0, Math.floor(Number(masterMaxHP) || 0)) / 2);",
    to: "  const half = Math.floor(Math.max(0, Math.floor(Number(masterMaxHP) || 0)) / 2);",
    breaks: "F1/F3/F9 — the book says round UP, and this is the only halving that does"
  },
  {
    // ROUNDING 2 FLATTENED, the other way.
    file: FAMILIAR,
    name: "THE OTHER ROUNDING FLATTENED: Effective Level rounds up",
    from: "  return Math.floor(Math.max(0, Math.floor(Number(level) || 0)) / 2);",
    to: "  return Math.ceil(Math.max(0, Math.floor(Number(level) || 0)) / 2);",
    breaks: "F7/F8/F9 — EL rounds DOWN, and is 0 at 1st level"
  },
  {
    // TOUGH ON THE WRONG SIDE OF THE HALVING. Plausible, arithmetically
    // reasonable, and wrong: it is the familiar's hit points that
    // increase, not the master's before they are halved.
    file: FAMILIAR,
    name: "Tough is applied before the halving instead of after",
    from: "  return half + tough;",
    to: "  return Math.ceil((Math.max(0, Math.floor(Number(masterMaxHP) || 0)) + tough) / 2);",
    breaks: "F5 — a Tough familiar gets roughly half the hit points it should"
  },
  {
    // ONE CELL OF THE TABLE. Edited in the CHECK's transcription, which
    // is what proves the comparison reaches the pack at all.
    file: CHECK,
    name: "one cell of the 140-cell table disagrees with the pack",
    from: "  [13, 9, 7, 9, 13, 18, 18, 12],",
    to: "  [13, 9, 7, 9, 13, 18, 18, 11],",
    breaks: "A3.13 — if this survives, the table is being compared against itself"
  },
  {
    // THE SIZE CLAMP TURNED INTO A FALL-OFF. A colossal companion asked
    // to grow would return undefined, and undefined resizes to nothing.
    file: COMPANION,
    name: "the top of the size ladder falls off instead of clamping",
    from: "  return SIZE_STEPS[Math.min(index + 1, SIZE_STEPS.length - 1)];",
    to: "  return SIZE_STEPS[index + 1];",
    breaks: "C5 — growing a colossal companion yields undefined"
  },
  {
    // THE -1 TRAP, put back. An unknown size falls through to index -1,
    // which compares as smaller than everything and always permits
    // growth — the trap the module's own comment names as lesson 18.
    file: COMPANION,
    name: "an unknown size is no longer refused before comparing",
    from: "  if (current < 0 || maximum < 0) return false;",
    to: "  if (current < 0 && maximum < 0) return false;",
    breaks: "C12 — an unrecognised size reads as 'smaller than everything'"
  },
  {
    // THE XP PATH DROPPED. Watching only `level` means the trigger never
    // fires for player characters, whose level is derived from XP — that
    // is, for almost every companion owner in a world.
    file: COMPANION,
    name: "the companion level watch stops watching XP",
    from: '  "system.identity.level",\n  "system.identity.xp"',
    to: '  "system.identity.level"',
    breaks: "D4/D6 — a Ranger levels by XP and the companion never follows"
  },
  {
    // A PARTIAL PROMOTED. The book prints four rows; making the middle
    // degree resolve as a success would make it strictly better than its
    // own name.
    file: FAMILIAR,
    name: "a Partial on the familiar loss save resolves as a success",
    from: '  if (key === "partial") return FAMILIAR_LOSS_OUTCOMES.failure;',
    to: '  if (key === "partial") return FAMILIAR_LOSS_OUTCOMES.success;',
    breaks: "G16 — the middle of the table beats its own name"
  },
  {
    // EMPATHIC LINK MADE TO COST A PICK. The book gives it away on top of
    // the two; charging for it costs every familiar an ability.
    file: FAMILIAR,
    name: "Empathic Link starts spending one of the two picks",
    from: "  const free = new Set(FREE_FAMILIAR_ABILITIES.map(normalise));",
    to: "  const free = new Set();",
    breaks: "G9/G10 — every familiar loses an ability it was given free"
  },
  {
    // THE SIZE ROUND TRIP BROKEN. Authoring the printed scores directly
    // is exactly what shipped at 3.234.1: Dex 5 and initiative 35
    // against a printed 25.
    file: FAMILIAR,
    name: "the printed ability scores are authored without removing the size modifier",
    from: "    strength: FAMILIAR_STAT_BLOCK.abilities.strength - (Number(entry.strMod) || 0),\n    dexterity: FAMILIAR_STAT_BLOCK.abilities.dexterity - (Number(entry.dexMod) || 0)",
    to: "    strength: FAMILIAR_STAT_BLOCK.abilities.strength,\n    dexterity: FAMILIAR_STAT_BLOCK.abilities.dexterity",
    breaks: "E10/E11 — the 3.234.1 bug, where a familiar rolled initiative 35"
  },
  {
    // THE CONDITIONAL POOLED. A familiar would gain +2 against a pit
    // trap, a poison and a falling rock.
    file: DERIVE,
    name: "the +2 against magic is pooled into every save",
    from: '  if (!hasFamiliarAbility(abilityNames, "Resilience")) return {};',
    to: "  if (!abilityNames) return {};",
    breaks: "I8 — an unconditional bonus for a conditional rule"
  },
  {
    // A FAMILIAR GIVEN SKILL POINTS OF ITS OWN. An absence quietly
    // filled in: the book says it develops no ranks of its own.
    file: FAMILIAR,
    name: "a familiar is given skill points of its own",
    from: "    skillPoints: 0,",
    to: "    skillPoints: 2,",
    breaks: "H2 — a budget on the sheet the rules do not grant"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([COMPANION, FAMILIAR, DERIVE, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-companions-familiars-137-140: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-companions-familiars-137-140: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-companions-familiars-137-140: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
