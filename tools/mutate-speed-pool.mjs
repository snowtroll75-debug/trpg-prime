#!/usr/bin/env node
/**
 * mutate-speed-pool — can verify-speed-pool fail?
 *
 * NEW at 3.412.1. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS DEFECT A RESTORED AS ONE EDIT, and it is the mutation this file
 * was written for. Putting TRG_SCHEMA_VERSION back to "3.312.0" is a
 * three-character change that breaks nothing, raises nothing, passes every
 * other check in the project, and makes the entire pooled-movement
 * migration unreachable for every world in existence. It shipped exactly
 * that way. If F3 cannot catch this edit then F3 is decoration.
 *
 * #2 AND #3 ARE DEFECT B — the crash — approached from both sides: the
 * coercion removed, and the coercion made a copy instead of writing
 * through. The second is the more interesting failure because nothing
 * throws: every value is right, on an object nobody reads.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const POOL = path.join(SYSTEM_ROOT, "module", "combat", "speed-pool.mjs");
const MIGRATION = path.join(SYSTEM_ROOT, "module", "migration.mjs");

/**
 * The schema constant's value RIGHT NOW — see the note on the mutation that
 * uses it. An anchor that repeats a version has an expiry date; one that
 * reads it does not, and the regex still pins the line's shape.
 */
const currentSchema = (() => {
  const found = /export const TRG_SCHEMA_VERSION = "([^"]+)";/
    .exec(fs.readFileSync(MIGRATION, "utf8"));
  if (!found) {
    console.error("mutate-speed-pool: cannot find TRG_SCHEMA_VERSION in migration.mjs — "
      + "the anchor below would run against nothing, so this run is stopping instead.");
    process.exit(1);
  }
  return found[1];
})();
const ACTOR = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-speed-pool.mjs");

const MUTATIONS = [
  {
    file: MIGRATION,
    name: "L1 THE PASS'S WRITES GO BACK TO BEING INVISIBLE in the report",
    from: "    if (result.movementEffectKeys?.length) {",
    to: "    if (false) {",
    breaks: "L1 \u2014 21 keys moved and 0 keys moved read identically"
  },
  {
    file: MIGRATION,
    name: "L1b a migration that changed nothing goes back to reporting success",
    from: "    if (!result.actors && !result.items && !alsoDid.length) {",
    to: "    if (false) {",
    breaks: "L1b \u2014 a pass that did not run looks like one that did"
  },
  {
    file: MIGRATION,
    name: "K1 THE PASS LEAVES THE BARE KEY WHERE IT IS",
    from: "        return { ...c, key: `${key}.base` };",
    to: "        return c;",
    breaks: "K1 \u2014 every typed Speed bonus on those actors stays discarded"
  },
  {
    file: MIGRATION,
    name: "K1b the pass rewrites the mode as well as the key",
    from: "        return { ...c, key: `${key}.base` };",
    to: "        return { ...c, key: `${key}.base`, mode: 2 };",
    breaks: "K1b \u2014 an override of a species Speed becomes an addition to it"
  },
  {
    file: MIGRATION,
    name: "K2 an already-pooled key is rewritten again, so the pass is not idempotent",
    from: "      if (!changes.some((c) => BARE.test(String(c?.key ?? \"\")))) continue;",
    to: "      ;",
    breaks: "K2 \u2014 a second run writes every document again"
  },
  {
    file: MIGRATION,
    name: "K5 only land is migrated, so a dragon keeps its bare fly speed",
    from: "  const BARE = new RegExp(`^system\\\\.combat\\\\.movement\\\\.(${SPEED_KEYS.join(\"|\")})$`);",
    to: "  const BARE = /^system\\.combat\\.movement\\.land$/;",
    breaks: "K5"
  },
  {
    name: "THE SHIPPED DEFECT A: the schema version stops admitting the migration",
    file: MIGRATION,
    // RE-ANCHORED at 3.552.1 (from 3.435.0), where the constant was raised
    // so the starting-wealth backfill could be offered at all. The mutation
    // is unchanged in intent: lowering the constant below a pass's own
    // version makes that pass unreachable for every world, silently.
    //
    // THE RE-ANCHOR IS THE POINT OF THE CHECK, not paperwork around it. On
    // 10 Sep 2026 the constant was left at 3.435.0 while a pass was
    // registered at 3.552.1, and F7/C8 caught it — but this file's anchor
    // went stale in the same edit and reported ANCHOR MISSING, which is a
    // mutation that ran against nothing. Both halves move together.
    // RE-ANCHORED AGAIN at 3.595.2, where the constant was raised for the
    // movement-effect-key pass. Both halves move together, every time.
    //
    // AND AT 3.602.0 THEY STOPPED HAVING TO. Five hand re-anchors was five
    // chances to leave this mutation running against nothing, so it now READS
    // the constant instead of repeating it. The paragraph above stays because
    // it records why the mutation exists; what has gone is its expiry date.
    from: `export const TRG_SCHEMA_VERSION = "${currentSchema}";`,
    to: 'export const TRG_SCHEMA_VERSION = "3.312.0";',
    breaks: "F3 — the pooled-movement pass becomes unreachable for every world, silently"
  },
  {
    // DEFECT B, THE CRASH. Without the coercion the pool is a number and
    // the assignment throws for every actor in the world.
    name: "THE SHIPPED DEFECT B: coercion stops producing a pool",
    file: POOL,
    from: "  const base = Array.isArray(raw) ? 0 : Math.max(0, Number(raw) || 0);\n  return { base, item: 0, status: 0, circumstance: 0, other: 0, total: base };",
    to: "  return raw;",
    breaks: "B1/E7/E8 — `.total = …` throws again: Cannot create property 'total' on number"
  },
  {
    // THE QUIET ONE. Every value correct, on a copy nobody holds.
    name: "coercion rebuilds an existing pool instead of writing through it",
    file: POOL,
    from: "  if (isSpeedPool(raw)) return raw;",
    to: "  if (isSpeedPool(raw)) return { ...raw };",
    breaks: "B7 — derivation's bonuses land on a discarded copy and the sheet never moves"
  },
  {
    name: "normaliseMovement returns a new block rather than the caller's",
    file: POOL,
    from: "    movement[key] = speedPool(movement[key]);\n  }\n  return movement;",
    to: "    movement[key] = speedPool(movement[key]);\n  }\n  return { ...movement };",
    breaks: "E6 — same failure one level up: every later write is thrown away"
  },
  {
    // DEFECT C. This is the silent one — it appears only once the
    // migration SUCCEEDS, which is the worst possible moment.
    name: "THE SHIPPED DEFECT C: reading a speed with Number() again",
    file: POOL,
    from: "  if (isSpeedPool(raw)) return Number(raw.total ?? raw.base ?? 0) || 0;\n  return Array.isArray(raw) ? 0 : Number(raw) || 0;",
    to: "  return Number(raw) || 0;",
    breaks: "D2/D3 — Number(pool) is NaN, so the climb/swim +4 dies on migration success"
  },
  {
    // DEFECT D.
    name: "THE SHIPPED DEFECT D: the base reader stops taking a bare number",
    file: POOL,
    from: "  if (isSpeedPool(raw)) return Number(raw.base ?? 0) || 0;\n  return Array.isArray(raw) ? 0 : Number(raw) || 0;",
    to: "  return Number(raw?.base ?? 0) || 0;",
    breaks: "D5/E1 — Quick Time sees no speeds at all on an unmigrated character"
  },
  {
    // GRAHAM'S RULING. A speed granted by the spell must not become a
    // speed the spell then hastens.
    name: "the base reader reads the resolved total",
    file: POOL,
    from: "  if (isSpeedPool(raw)) return Number(raw.base ?? 0) || 0;",
    to: "  if (isSpeedPool(raw)) return Number(raw.total ?? 0) || 0;",
    breaks: "D7 — a speed granted BY the spell bootstraps itself into being hastened"
  },
  {
    name: "the migration stops being idempotent",
    file: POOL,
    from: "  return isSpeedPool(raw) ? null : speedPool(raw);",
    to: "  return speedPool(raw);",
    breaks: "C2/C4 — a second run wraps a pool inside another pool"
  },
  {
    // THE 3.223.3 CORRUPTION. An array must not be waved through.
    name: "an array counts as a pool",
    file: POOL,
    from: "  return raw !== null && typeof raw === \"object\" && !Array.isArray(raw);",
    to: "  return raw !== null && typeof raw === \"object\";",
    breaks: "A5/B6 — `[30]` becomes a pool whose base is an array, NaN everywhere after"
  },
  {
    name: "a speed the creature lacks is invented as zero",
    file: POOL,
    from: "    if (!(key in movement)) continue;",
    to: "    if (false) continue;",
    breaks: "E9 — every creature acquires a burrow speed and the sheet grows a row"
  },
  {
    // THE MUTATION THAT RESHAPED THE RELEASE. In the first version of this
    // file it deleted a `normaliseMovement` call from `prepareDerivedData`
    // and SURVIVED — a true report, because a line in a Foundry-only
    // method is a line no check can reach. Rather than delete the
    // mutation, the sequence moved into `resolveMovement`. This is the
    // same edit aimed at where the rule lives now, and it is catchable.
    name: "THE SHIPPED DEFECT B, at the sequence: coercion is skipped",
    file: POOL,
    from: "  normaliseMovement(movement);",
    to: "",
    breaks: "G1/G17 — the crash returns for every unmigrated actor in the world"
  },
  {
    // THE 3.410.0 DEFECT: a typed bonus handed a bare number vanishes.
    name: "the bonus applier is handed the raw speed instead of the pool",
    file: POOL,
    from: "      if (!isSpeedPool(movement[key])) continue;",
    to: "",
    breaks: "G23 — a bonus written to the number 30 sets a property on a primitive"
  },
  {
    // ORDER IS THE WHOLE DESIGN: pooling before the penalties.
    name: "typed bonuses pool AFTER armour and encumbrance",
    file: POOL,
    from: "  const result = landSpeed({",
    to: "  if (applyBonuses) for (const k of SPEED_KEYS) if (isSpeedPool(movement[k])) applyBonuses(movement[k], k);\n  const result = landSpeed({",
    breaks: "G8/G22 — the applier runs twice and a penalty competes in the pool"
  },
  {
    name: "the derived land total is never written back",
    file: POOL,
    from: "  movement.land.total = result.speed;",
    to: "  ;",
    breaks: "G3/G5 — armour and encumbrance stop reaching the sheet"
  },
  {
    // NEVER LOWERS A BETTER STORED SPEED.
    name: "a half-land feat speed overwrites a better one",
    file: POOL,
    from: "    movement[key].total = Math.max(Number(movement[key].total ?? 0), halfLand);",
    to: "    movement[key].total = halfLand;",
    breaks: "G15 — a natural 40 ft climb speed is cut to half the land speed"
  },
  {
    name: "the immobilised flag ignores whether there is a load at all",
    file: POOL,
    from: "  movement.immobilisedByLoad = result.immobilised && encumbered;",
    to: "  movement.immobilisedByLoad = result.immobilised;",
    breaks: "G10 — a creature with no land speed is reported immobilised by its load"
  },
  {
    // THE LIVE-COMBAT DEFECT, restored. This is the exact line that made
    // every token immovable for four releases.
    file: path.join(SYSTEM_ROOT, "module", "combat", "movement.mjs"),
    name: "THE IMMOVABLE-TOKEN DEFECT: movement reads a pool with Number()",
    from: "  return { key, speed: Math.max(0, speedValue(actorSystem?.combat?.movement?.[key])) };",
    to: "  return { key, speed: Math.max(0, Number(actorSystem?.combat?.movement?.[key] ?? 0)) };",
    breaks: "J2 — Speed NaN, Infinity AP, nothing moves in combat"
  },
  {
    name: "Quick Time reads .base directly again",
    file: EFFECTS,
    from: "    .filter((key) => speedBase(movement[key]) > 0);",
    to: "    .filter((key) => Number(movement[key]?.base ?? 0) > 0);",
    breaks: "E1 — the unmigrated and migrated answers diverge"
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

const guard = guardFiles([POOL, MIGRATION, ACTOR, EFFECTS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-speed-pool: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-speed-pool: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-speed-pool: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
