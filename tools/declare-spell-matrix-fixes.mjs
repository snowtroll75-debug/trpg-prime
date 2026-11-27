#!/usr/bin/env node
/**
 * declare-spell-matrix-fixes — the warp ceilings the spell matrix found
 * (26 Nov 2026, RC8 and Graham's U12), written into packs/spells.
 *
 *   node tools/declare-spell-matrix-fixes.mjs            # write
 *   node tools/declare-spell-matrix-fixes.mjs --print    # print from/to, write nothing
 *
 * Each is a warp that sold more purchases than its page allows:
 *   Shape Of The Wyrm   "gain an additional natural attack" — U12: once.
 *   Gravity Weapon      "+2 (max +4)" on a weapon already at +2 — once.
 *   Magic Stone         "increase the bonus TO +2" from +1 — once.
 *   Unliving Vitality   "increases by 1 (max 10)" from fast healing 5 — five.
 *   Rapid Repair        "increase … by 1 (max 5)" from fast healing 1 — four.
 *   True Seeing         "you may target another creature and the range becomes touch"
 *   Unshakable          "the spell gains a range of touch (arcane only)" — both
 *                       Invisibility's touch warp, charged and never applied.
 * The last two carry `healingRateFrom`, which `warpMaxTimes` reads. The
 * owned-copy repairs are in module/data/pack-repairs.mjs (since 3.716.0).
 * Idempotent: a warp already carrying its fix is left alone.
 */
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FIXES = {
  "Shape Of The Wyrm": [{ index: 2, add: { once: true } }],
  "Gravity Weapon": [{ index: 1, add: { once: true } }],
  "Magic Stone": [{ index: 0, add: { once: true } }],
  "Unliving Vitality": [{ index: 0, add: { healingRateFrom: 5 } }],
  "Rapid Repair": [{ index: 0, add: { healingRateFrom: 1 } }],
  // Invisibility's touch warp, which these two print and never carried: the
  // range becomes touch and the self rows move to the creature touched. Found
  // when Graham's U8 refusal could not see them as range warps.
  "True Seeing": [{ index: 0, add: { rangeOverride: "touch", retargetSelfRows: true } }],
  "Unshakable": [{ index: 1, add: { rangeOverride: "touch", retargetSelfRows: true, onlyTradition: "arcane" } }],
  // 3.717.0 (Graham, 27 Nov 2026). O5, "need building": Geas's three warps
  // ("as above" carries the unwilling creature's Will save up the tiers)
  // and Pass Without Trace's area. O6, "needs checking": Unshakable's
  // "(arcane only)", above.
  "Geas": [
    { index: 0, add: { defence: "Will Negates" } },
    { index: 1, add: { defence: "Will Negates", durationText: "1 year" } },
    { index: 2, add: { defence: "Will Negates", durationText: "unlimited" } }
  ],
  "Pass Without Trace": [{ index: 1, add: { rangeOverride: "20 feet", areaOverride: "20-foot emanation", targetCap: 10, shareSelfRows: true } }]
};
/* A SPELL FIELD BESIDE ITS WARPS (3.717.0): "up to 10 creatures OF YOUR
 * CHOICE within that area" is the area choice Missile Storm and Wits use. */
const SYSTEM_FIXES = {
  "Pass Without Trace": { areaChoice: true },
  // 3.717.1 (the 3.717.0 live test): the note "The +4 PP option … is cast by
  // hand on another creature" outlived the warp's automation (3.716.0).
  "Unshakable": { effects: [{ kind: "defence", target: "self", field: "immunity", value: "stunned" }] }
};
const PRINT = process.argv.includes("--print");
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const out = {};
for await (const [key, value] of db.iterator()) {
  if (!key.startsWith("!items!") || !FIXES[value?.name]) continue;
  const from = JSON.parse(JSON.stringify(value.system.warps));
  const to = JSON.parse(JSON.stringify(from));
  for (const f of FIXES[value.name]) to[f.index].mods = { ...(to[f.index].mods ?? {}), ...f.add };
  out[value.name] = { from, to };
  const sysFrom = {};
  for (const [field, v] of Object.entries(SYSTEM_FIXES[value.name] ?? {})) {
    sysFrom[field] = value.system[field] ?? null;
    out[value.name][field] = { from: sysFrom[field], to: v };
  }
  const changed = JSON.stringify(from) !== JSON.stringify(to)
    || Object.entries(SYSTEM_FIXES[value.name] ?? {}).some(([f, v]) => JSON.stringify(value.system[f]) !== JSON.stringify(v));
  if (!PRINT && changed) {
    value.system.warps = to;
    Object.assign(value.system, SYSTEM_FIXES[value.name] ?? {});
    await db.put(key, value);
  }
}
await db.close();
const missing = Object.keys(FIXES).filter((n) => !out[n]);
if (missing.length) { console.error(`not found: ${missing.join(", ")}`); process.exit(1); }
console.log(JSON.stringify(out, null, 1));
