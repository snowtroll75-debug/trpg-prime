#!/usr/bin/env node
/**
 * verify-locked-slots — a slot an effect writes cannot be typed into.
 *
 * NEW at 3.412.2.
 *
 * THE DEFECT THIS CHAPTER EXISTS TO KEEP DEAD. `effect-slots.mjs` locks
 * by EXACT PATH: a change's `key` is matched against an input's `name`.
 * 3.412.0 pooled the speeds and renamed those inputs from
 * `system.combat.movement.land` to `…land.base`, while every race,
 * companion, familiar and speed feat went on writing the node. The two
 * strings stopped being equal and the lock matched nothing — silently,
 * because a lock that finds no inputs simply locks none.
 *
 * Live proof (Borin Slatevein, 26 Aug 2026): stored base 30, Dwarf
 * override to 20, box showing 20. One sheet submit that changed nothing
 * wrote the stored base 30 → 20.
 *
 * SECTION E IS THE ONE THAT PAYS, and it is why this file reads the
 * packs. Every check that stays inside the module can only confirm the
 * module agrees with itself. The failure was a DISAGREEMENT BETWEEN
 * THREE PLACES — pack data, module, template — none of which was wrong
 * on its own. E holds the real change keys from the real packs against
 * the real input names in the real template and refuses to let them
 * drift apart again.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  lockedSlotsFromChanges, lockedInputPaths, storedSlotValue
} from "../module/effect-slots.mjs";
import { SPEED_KEYS } from "../module/combat/speed-pool.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const LAND = "system.combat.movement.land";
const LAND_BASE = `${LAND}.base`;

/* ================================================================== *
 * A. Which inputs a change key governs
 * ================================================================== */

ok("A1 a pooled node governs the .base box", lockedInputPaths(LAND).includes(LAND_BASE),
  "this is the whole defect: the race writes the node, the box is .base");
ok("A2 and still governs the node's own name", lockedInputPaths(LAND).includes(LAND),
  "an owned copy may name either until a Refresh Items");
ok("A3 a .base key governs the .base box", lockedInputPaths(LAND_BASE).includes(LAND_BASE));
ok("A4 a .base key also governs the node", lockedInputPaths(LAND_BASE).includes(LAND));
ok("A5 every speed is covered, not just land",
  SPEED_KEYS.every((k) => lockedInputPaths(`system.combat.movement.${k}`)
    .includes(`system.combat.movement.${k}.base`)));
// AN UNRELATED PATH MUST NOT GROW A `.base`. Locking a box that does not
// exist is harmless; locking the WRONG box disables a field a player owns.
ok("A6 an unrelated path is returned unchanged",
  JSON.stringify(lockedInputPaths("system.attributes.strength")) === JSON.stringify(["system.attributes.strength"]));
ok("A7 a non-speed .base is not treated as pooled",
  JSON.stringify(lockedInputPaths("system.attributes.strength.base"))
  === JSON.stringify(["system.attributes.strength.base"]));
ok("A8 an empty key governs nothing", lockedInputPaths("").length === 0);
ok("A9 a missing key governs nothing", lockedInputPaths(undefined).length === 0);

/* ================================================================== *
 * B. What gets locked at all
 * ================================================================== */

const lock = (changes) => lockedSlotsFromChanges(changes, 0);

ok("B1 an override locks its slot", Boolean(lock([{ key: LAND, mode: 5 }])[LAND]));
ok("B2 an add locks its slot", Boolean(lock([{ key: LAND, mode: 2 }])[LAND]));
// A CUSTOM CHANGE GOES TO THE POOL, never to the box, so the box is safe.
ok("B3 a custom change locks nothing",
  Object.keys(lock([{ key: LAND, mode: 0 }])).length === 0);
ok("B4 an override reports nothing hiding underneath",
  lock([{ key: LAND, mode: 5 }])[LAND].additive === false,
  "the stored value is inert under an override — warning would be untrue");
ok("B5 an add reports that a stored value is still counted",
  lock([{ key: LAND, mode: 2 }])[LAND].additive === true);
// THE DWARF + SWIFT STRIDE CASE, named in the module's own comment.
ok("B6 an override wins over an add on the same key",
  lock([{ key: LAND, mode: 5 }, { key: LAND, mode: 2 }])[LAND].additive === false,
  "a single ADD must not resurrect the false warning");
ok("B7 string fields stay editable",
  Object.keys(lock([{ key: "system.combat.resistances", mode: 2 }])).length === 0);
ok("B8 the owning effect is named",
  lock([{ key: LAND, mode: 5, sourceName: "Dwarf" }])[LAND].sources.includes("Dwarf"));

/* ================================================================== *
 * C. The stored value a tooltip shows
 * ================================================================== */

ok("C1 a pooled stored value reads its base", storedSlotValue(
  { system: { combat: { movement: { land: { base: 30, total: 30 } } } } }, LAND) === 30,
  "showing a player an object is worse than showing nothing");
ok("C2 a bare stored value is returned as is", storedSlotValue(
  { system: { combat: { movement: { land: 30 } } } }, LAND) === 30);
ok("C3 an absent value does not throw",
  storedSlotValue({}, LAND) === undefined);

/* ================================================================== *
 * D. The template's own input names
 * ================================================================== */

const hbs = fs.readFileSync(
  path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs"), "utf8");
// ANCHORED TO THE REAL SPEED KEYS. A looser `[a-z.]+` also matches the
// prose in this template's own comment — `A second name="system.combat.
// movement..."` — and a check that counts a comment as an input is
// exactly the kind that proves the wrong thing.
const speedAlternatives = SPEED_KEYS.join("|");
const templateMovementInputs = [...hbs.matchAll(
  new RegExp(`name="(system\\.combat\\.movement\\.(?:${speedAlternatives})(?:\\.[a-z]+)?)"`, "g")
)].map((m) => m[1]);

ok("D1 the template was read and names movement inputs",
  templateMovementInputs.length > 0,
  "if this fails the regex has drifted and every check below proves nothing");

const uniqueInputs = [...new Set(templateMovementInputs)];
ok("D2 every movement input the sheet renders is a .base box",
  uniqueInputs.every((n) => /\.base$/.test(n)),
  `found: ${uniqueInputs.join(", ")}`);

/* ================================================================== *
 * E. PACK DATA ↔ MODULE ↔ TEMPLATE
 *
 * The three-way check. Every movement change actually stored in the
 * packs must, once put through `lockedInputPaths`, name an input the
 * template actually renders. This is the check that would have caught
 * 3.412.0's rename the day it happened.
 * ================================================================== */

let packChangeKeys = [];
let packsRead = false;
try {
  const { ClassicLevel } = await import("classic-level");
  const packsDir = path.join(SYSTEM_ROOT, "packs");
  for (const name of fs.readdirSync(packsDir)) {
    const dir = path.join(packsDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    let db;
    try {
      db = new ClassicLevel(dir, { valueEncoding: "json" });
      await db.open();
    } catch { continue; }
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items.effects!")) continue;
      for (const change of value?.changes ?? []) {
        const k = String(change?.key ?? "");
        if (/^system\.combat\.movement\./.test(k)) {
          packChangeKeys.push({ pack: name, effect: value?.name, key: k, mode: change?.mode });
        }
      }
    }
    await db.close();
  }
  packsRead = true;
} catch (error) {
  packsRead = false;
}

// NOT SKIPPED SILENTLY. A check that quietly does nothing when it cannot
// read its input is the failure mode this whole file is about.
ok("E1 the packs were readable", packsRead,
  "cannot verify pack↔template agreement without them");

if (packsRead) {
  ok("E2 movement changes were found in the packs", packChangeKeys.length > 0,
    "if the packs carry none, this section proves nothing");

  const unmatched = packChangeKeys.filter((entry) => {
    if (Number(entry.mode) === 0) return false; // custom → pool, never a box
    return !lockedInputPaths(entry.key).some((p) => uniqueInputs.includes(p));
  });
  ok("E3 every pack movement change locks an input the template renders",
    unmatched.length === 0,
    unmatched.slice(0, 6).map((u) => `${u.pack}/${u.effect}: ${u.key}`).join("; "));

  const distinctKeys = [...new Set(packChangeKeys.map((e) => e.key))];
  ok("E4 the pack keys are the ones this module knows about",
    distinctKeys.every((k) => lockedInputPaths(k).length > 0),
    distinctKeys.join(", "));
}

/* ================================================================== */

const label = "verify-locked-slots";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed (${packChangeKeys.length} pack movement changes cross-checked)`);
