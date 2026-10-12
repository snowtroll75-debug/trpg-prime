#!/usr/bin/env node
/**
 * mutate-locked-slots — can verify-locked-slots fail?
 *
 * NEW at 3.412.2. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT, restored as one edit: drop the `.base`
 * spelling from `lockedInputPaths` and the lock goes back to matching a
 * change that names the node against a box that names `.base` — which
 * is to say, matching nothing. It disables no field, raises no error,
 * and lets the next sheet submit write the derived value over the
 * stored one.
 *
 * #2 IS THE SAME DEFECT SEEN FROM THE TEMPLATE. Renaming the box back
 * to the node is what 3.412.0 did in reverse, and section E catches it
 * from the other side — proving the three-way check works whichever of
 * the three places moves.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SLOTS = path.join(SYSTEM_ROOT, "module", "effect-slots.mjs");
const POOL = path.join(SYSTEM_ROOT, "module", "combat", "speed-pool.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-locked-slots.mjs");

const MUTATIONS = [
  {
    name: "THE SHIPPED DEFECT: a pooled node stops governing its .base box",
    file: SLOTS,
    from: "  if (POOLED_NODE_PATHS.includes(path)) return [`${path}.base`, path];",
    to: "  if (POOLED_NODE_PATHS.includes(path)) return [path];",
    breaks: "A1/E3 — the lock matches nothing and a sheet submit eats the stored speed"
  },
  {
    name: "THE SAME DEFECT FROM THE TEMPLATE: the box is renamed back to the node",
    file: HBS,
    from: 'name="system.combat.movement.land.base"',
    to: 'name="system.combat.movement.land"',
    breaks: "D2 — the sheet renders a box the pooling migration replaced"
  },
  {
    // AN OWNED COPY CAN NAME EITHER until a Refresh Items.
    name: "a .base key stops governing the node it belongs to",
    file: SLOTS,
    from: "  if (path !== node && POOLED_NODE_PATHS.includes(node)) return [path, node];",
    to: "  if (path !== node && POOLED_NODE_PATHS.includes(node)) return [path];",
    breaks: "A4 — a refreshed item and an unrefreshed one stop locking the same field"
  },
  {
    // LOCKING THE WRONG BOX IS WORSE THAN LOCKING NONE: it disables a
    // field the player owns.
    name: "every path grows a .base, not just the pooled ones",
    file: SLOTS,
    from: "  if (POOLED_NODE_PATHS.includes(path)) return [`${path}.base`, path];",
    to: "  return [`${path}.base`, path];",
    breaks: "A6/A7 — an attribute box a player owns is disabled for no reason"
  },
  {
    name: "the pooled path table forgets four of the five speeds",
    file: SLOTS,
    from: "  SPEED_KEYS.map((key) => `system.combat.movement.${key}`)",
    to: "  [\"system.combat.movement.land\"]",
    breaks: "A5/E3 — fly, swim, climb and burrow lose their locks"
  },
  {
    name: "a custom change starts locking a box",
    file: SLOTS,
    from: "    if (Number(change?.mode) === customMode) continue;",
    to: "    if (false) continue;",
    breaks: "B3 — a pool-only change disables a field it never writes"
  },
  {
    name: "an override claims a stored value is still being counted",
    file: SLOTS,
    from: "    if (Number(change?.mode) === 5) locked[key].overridden = true;",
    to: "    if (false) locked[key].overridden = true;",
    breaks: "B4/B6 — the false warning the module's own comment describes"
  },
  {
    name: "the tooltip prints the pool object instead of its base",
    file: SLOTS,
    from: "  if (direct !== null && typeof direct === \"object\") return Number(direct.base ?? 0) || 0;",
    to: "  ;",
    breaks: "C1 — a player is shown [object Object] where a number belongs"
  },
  {
    // THE SHAPE MUST STAY OWNED IN ONE PLACE.
    name: "effect-slots respells the speed keys instead of importing them",
    file: POOL,
    from: 'export const SPEED_KEYS = Object.freeze(["land", "fly", "swim", "climb", "burrow"]);',
    to: 'export const SPEED_KEYS = Object.freeze(["land", "fly", "swim", "climb"]);',
    breaks: "A5/E3 — burrow drifts out of one file's idea of what a speed is"
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

const guard = guardFiles([SLOTS, POOL, HBS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-locked-slots: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-locked-slots: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-locked-slots: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
