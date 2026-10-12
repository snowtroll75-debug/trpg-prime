#!/usr/bin/env node
/**
 * mutate-healing-earth — can verify-healing-earth fail?
 *
 * NEW at 3.407.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SILENT FAILURE THIS SPELL IS MOST EXPOSED TO: change one
 * field of the item and it still appears in the inventory, still reads
 * correctly on the sheet, and substitutes for nothing at all.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const EARTH = path.join(SYSTEM_ROOT, "module", "magic", "healing-earth.mjs");
const CLMODS = path.join(SYSTEM_ROOT, "module", "magic", "caster-level-mods.mjs");
const GEAR = path.join(SYSTEM_ROOT, "module", "gear-uses.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-healing-earth.mjs");

const MUTATIONS = [
  {
    name: "THE SILENT ONE: the earth stops carrying the tools trait",
    file: EARTH,
    from: 'const HEALING_EARTH_TRAITS = "Healer\'s Tools, Alteration, Earth";',
    to: 'const HEALING_EARTH_TRAITS = "Alteration, Earth";',
    breaks: "A1 — the earth exists, looks right, and substitutes for nothing"
  },
  {
    name: "the earth is created unequipped",
    file: EARTH,
    from: "      equipped: true,",
    to: "      equipped: false,",
    breaks: "A1/A2 — the finder only looks at equipped gear"
  },
  {
    name: "the earth is not gear",
    file: EARTH,
    from: '    type: "gear",',
    to: '    type: "loot",',
    breaks: "A1 — the finder only looks at gear"
  },
  {
    name: "the earth carries more than one use",
    file: EARTH,
    from: "      uses: { value: 1, max: 1 },",
    to: "      uses: { value: 3, max: 3 },",
    breaks: 'A3 — the text says it reverts "if it remains UNUSED"'
  },
  {
    // THE RULING. Without the preference, document order decides.
    name: "a real kit is spent before the conjured earth",
    file: GEAR,
    from: "  return matches.find(isTemporaryGear) ?? matches[0] ?? null;",
    to: "  return matches[0] ?? null;",
    breaks: "B1 — the player burns a charge of the tools they paid for"
  },
  {
    name: "the preference eats the ordinary case",
    file: GEAR,
    from: "  return matches.find(isTemporaryGear) ?? matches[0] ?? null;",
    to: "  return matches.find(isTemporaryGear) ?? null;",
    breaks: "B2 — a character with only a real kit finds nothing"
  },
  {
    name: "the earth stops being marked temporary",
    file: EARTH,
    from: "        [TEMPORARY_GEAR_FLAG]: true,",
    to: "",
    breaks: "B1/B4 — the preference has nothing to recognise"
  },
  {
    // THE CL THRESHOLD, off by one in the direction that gives it away free.
    name: "the CL 5 bonus arrives a level early",
    file: EARTH,
    from: "  return Number(casterLevel) >= HEALING_EARTH_CL ? HEALING_EARTH_BONUS : 0;",
    to: "  return Number(casterLevel) >= HEALING_EARTH_CL - 1 ? HEALING_EARTH_BONUS : 0;",
    breaks: "C1 — a CL 4 caster gets a bonus the book does not grant"
  },
  {
    name: "the bonus stops being an item bonus",
    file: EARTH,
    from: '    type: "item",',
    to: '    type: "circumstance",',
    breaks: "C6 — it starts stacking with the real kit's +2"
  },
  {
    name: "the bonus becomes a blanket Medicine bonus",
    file: EARTH,
    from: '    when: { checkTypes: ["skill"], subjects: ["medicine"], actions: ["firstAid", "treatWounds"] }',
    to: '    when: { checkTypes: ["skill"], subjects: ["medicine"] }',
    breaks: "C9 — it reaches three actions the spell never mentions"
  },
  {
    name: "the earth reverts a tick early",
    file: EARTH,
    from: "  return Number(worldTime) >= Number(end);",
    to: "  return Number(worldTime) > Number(end);",
    breaks: "D2 — off by one on the boundary the sweep fires on"
  },
  {
    // AN ITEM WITH NO EXPIRY MUST NOT BE DELETED.
    name: "an earth with no expiry is swept away",
    file: EARTH,
    from: "  if (end === null || end === undefined) return false;",
    to: "  if (end === null || end === undefined) return true;",
    breaks: "D4 — a player's item deleted on a clock nobody set"
  },
  {
    name: "the sweep takes ordinary gear with it",
    file: EARTH,
    from: "  if (!data) return false;",
    to: "  if (!data) return true;",
    breaks: "D5 — a real healer's kit vanishes on the world clock"
  },
  {
    name: "a recast stops reverting the earlier earth",
    file: EFFECTS,
    from: "          const stale = existingHealingEarth(target.items ?? []);",
    to: "          const stale = [];",
    breaks: 'F5 — "or if you cast the spell again before using it" stops happening'
  },
  {
    // THE BUG 3.407.0 SHIPPED WITH, restored exactly: a plausible path
    // that reads `undefined`, and a `?? 0` that turns it into a number.
    name: "THE SHIPPED BUG: caster level read from fields that do not exist",
    file: CLMODS,
    from: "  const raw = system?.magic?.casterLevelValue\n    ?? system?.magic?.casterLevel\n    ?? system?.identity?.level\n    ?? 0;",
    to: "  const raw = system?.level?.value ?? system?.details?.level ?? 0;",
    breaks: "G1/G6 — every caster resolves to 0 and the CL 5 bonus never applies"
  },
  {
    name: "a stored caster level of zero falls through to character level",
    file: CLMODS,
    from: "    ?? system?.magic?.casterLevel\n    ?? system?.identity?.level\n    ?? 0;",
    to: "    || system?.magic?.casterLevel\n    || system?.identity?.level\n    || 0;",
    breaks: "G5 — a non-caster is handed a caster level they do not have"
  },
  {
    name: "the applier stops asking the shared reader",
    file: EFFECTS,
    from: "          const casterLevel = casterLevelOf(caster?.system);",
    to: "          const casterLevel = 0;",
    breaks: "G8 — the CL 5 bonus silently never applies again"
  },
  {
    name: "the world clock stops sweeping reverted earth",
    file: BOOT,
    from: "        const gone = expiredHealingEarth(actor.items, worldTime);",
    to: "        const gone = [];",
    breaks: "F6 — the earth stays in the inventory for ever"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([EARTH, GEAR, EFFECTS, BOOT, CLMODS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-healing-earth: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-healing-earth: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-healing-earth: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
