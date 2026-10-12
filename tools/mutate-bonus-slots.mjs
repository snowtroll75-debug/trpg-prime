#!/usr/bin/env node
/** mutate-bonus-slots — can verify-bonus-slots fail? NEW at 3.410.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-bonus-slots.mjs");
const TEMPLATE = path.join(SYSTEM_ROOT, "template.json");
const ACTION = path.join(SYSTEM_ROOT, "module", "combat", "action.mjs");
const MIGRATION = path.join(SYSTEM_ROOT, "module", "migration.mjs");
// The speed shape moved here at 3.412.1 — one definition for the
// migration, derivation and every reader. See its header for the four
// defects that paid for it.
const POOL = path.join(SYSTEM_ROOT, "module", "combat", "speed-pool.mjs");
const REGISTRY = path.join(SYSTEM_ROOT, "module", "bonuses", "registry.mjs");

const MUTATIONS = [
  {
    /*
     * THE DUPLICATE RESTORED (3.595.0). `TARGET_SLOTS` carried `movement`
     * twice until this release — the same five keys and the same comment, so
     * the later won silently and nothing on a sheet was wrong. The next
     * duplicate may differ, and then one pool would be a slot every author
     * believes in and nothing reads.
     */
    file: REGISTRY,
    name: "THE DUPLICATE KEY RETURNS: one slot declared twice",
    from: "  skill: {\n    ranks: null,",
    to: "  movement: {\n    base: null,\n    item: \"item\",\n    status: \"status\",\n    circumstance: \"circumstance\",\n    other: \"untyped\"\n  },\n  skill: {\n    ranks: null,",
    breaks: "D1 — a duplicate key wins silently"
  },
  {
    // THE DEFECT THE POOLING REMOVED, restored in the template: a speed
    // that is a bare number again. The path still exists; a bonus written
    // into it still vanishes.
    file: TEMPLATE,
    name: "THE DEFECT: a speed goes back to being a bare number",
    from: '"land": {\n              "base": 30,\n              "item": 0,\n              "status": 0,',
    to: '"land": {\n              "base": 30,\n              "item": 0,\n              "notStatus": 0,',
    breaks: "C1b — a bonus written to movement.land.status vanishes again"
  },
  {
    name: "movement slots stop resolving",
    from: "  if (MOVEMENT_SLOTS.has(slot)) return `system.combat.movement.${MOVEMENT_SLOTS.get(slot)}`;",
    to: "",
    breaks: "C1 — Speed bonuses have nowhere to go"
  },
  {
    name: "speed means fly rather than land",
    from: '  ["speed", "land"], ["land", "land"], ["fly", "fly"],',
    to: '  ["speed", "fly"], ["land", "land"], ["fly", "fly"],',
    breaks: 'C1 — "your Speed" is the land speed in every spell that says it'
  },
  {
    // RE-AIMED AT 3.590.0. This used to DELETE the early return, and
    // that stopped biting when `bonusTargetFor` gained an allowlist for
    // its `system.combat.*` fall-through: with the line gone,
    // "allSpeeds" is simply not on the list and the answer is still
    // null. The guard and the allowlist now agree, which is right for
    // the code and useless for a mutation, so the mutation makes the
    // slot RESOLVE instead of merely removing one of the two reasons it
    // does not.
    name: "the virtual slot resolves and bypasses its expansion",
    // RE-ANCHORED AT 3.594.0: `allSkills` joined the refusal beside
    // `allSpeeds`, so the line names two virtual slots now.
    from: "  if (slot === ALL_SPEEDS_SLOT || slot === ALL_SKILLS_SLOT) return null;",
    to: "  if (slot === ALL_SKILLS_SLOT) return null;\n"
      + "  if (slot === ALL_SPEEDS_SLOT) return `system.combat.${slot}`;",
    breaks: "C3 — one land row instead of however many speeds the creature has"
  },
  {
    name: "a creature gains a speed it never had",
    from: "    .filter((key) => speedBase(movement[key]) > 0);",
    to: "    .filter(() => true);",
    breaks: "C3d — a haste spell invents swim and burrow out of nothing"
  },
  {
    // RE-AIMED at 3.412.1: the reader moved into combat/speed-pool.mjs so
    // that the unmigrated and migrated shapes cannot answer differently.
    name: "the expansion reads the total, so a speed bootstraps itself",
    from: "    .filter((key) => speedBase(movement[key]) > 0);",
    to: "    .filter((key) => speedValue(movement[key]) > 0);",
    breaks: "C3e — the spell's own bonus makes the speed count as present"
  },
  {
    file: ACTION,
    name: "an action requirement stops reading a pool's total",
    from: "  const value = node !== null && typeof node === \"object\" ? node.total : node;",
    to: "  const value = node;",
    breaks: "E1 — Number({}) is NaN and every Fly and Burrow action silently vanishes"
  },
  {
    file: ACTION,
    name: "a requirement stops handling an unmigrated bare number",
    from: "  const value = node !== null && typeof node === \"object\" ? node.total : node;",
    to: "  const value = node?.total;",
    breaks: "E1c — a token actor mid-session loses its actions"
  },
  {
    name: "a skill resolves as a combat slot",
    from: "  if (SKILL_SLOTS.has(slot)) return `system.skills.${slot}`;",
    to: "",
    breaks: "B2/D1 — Athletics bonuses land on system.combat.athletics, which is nothing"
  },
  {
    name: "an attribute resolves as a combat slot",
    from: "  if (ATTRIBUTE_SLOTS.has(slot)) return `system.attributes.${slot}`;",
    to: "",
    breaks: "B1 — a polymorph spell's Strength line applies nothing, the original defect"
  },
  {
    file: FX,
    name: "the caller ignores a refusal and announces the bonus anyway",
    from: "          if (bonusResult && bonusResult.applied === false) {",
    to: "          if (false) {",
    breaks: "C4 — the card confidently reports a bonus that was never applied"
  },
  {
    file: POOL,
    // RE-AIMED at 3.412.1: `pooledSpeedValue` moved to combat/speed-pool.mjs,
    // which is now the single definition of the shape for the migration,
    // derivation and every reader alike.
    name: "the migration re-pools a speed that is already a pool",
    from: "  return isSpeedPool(raw) ? null : speedPool(raw);",
    to: "  return speedPool(raw);",
    breaks: "F4 — a second run wraps a pool inside another pool"
  },
  {
    file: POOL,
    name: "the migration loses the stored speed",
    from: "  const base = Array.isArray(raw) ? 0 : Math.max(0, Number(raw) || 0);",
    to: "  const base = 0;",
    breaks: "F1/F2 — every character in the world wakes up with Speed 0"
  },
  {
    file: CHECK,
    name: "the pool test accepts a bare number",
    from: "  return Boolean(node) && typeof node === \"object\" && !Array.isArray(node)\n    && Object.hasOwn(node, \"status\");",
    to: "  return nodeAt(dotted) !== undefined;",
    breaks: "C1b — the check stops asking the property that matters"
  },
  {
    file: CHECK,
    name: "the template reader accepts any path",
    from: "  return nodeAt(dotted) !== undefined;",
    to: "  return true;",
    breaks: "A2 — the check stops being able to fail"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([FX, CHECK, TEMPLATE, ACTION, MIGRATION, POOL]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-bonus-slots: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const file = m.file ?? FX;
    const original = fs.readFileSync(file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-bonus-slots: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-bonus-slots: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
