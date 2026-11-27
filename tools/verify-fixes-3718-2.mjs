#!/usr/bin/env node
/**
 * verify-fixes-3718-2 — Graham's Q2 answer, and the migration's report.
 *
 * A. FALSE HEALTH: "+2 PP: increase the ability score multiplier by x1 (max
 *    x5)". Graham, 27 Nov 2026: "Yes it should increase the multiplier by 1
 *    each time." The warp carried no mods and changed nothing.
 * B. THE MIGRATION weighed the Nightvision SPELL's repair against characters'
 *    Nightvision ABILITY and listed them as house-ruled copies.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { warpMaxTimes, aggregateWarpSelection, multipliedAbilityFormula, emptyWarp } from "../module/magic/spell-warp.mjs";
import { repairsForName } from "../module/pack-repair.mjs";
import { PACK_REPAIRS } from "../module/data/pack-repairs.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (p) => fs.readFileSync(path.join(SYSTEM_ROOT, p), "utf8");

/* A. False Health ------------------------------------------------------- */
const warp = { ppCost: 2, text: "increase the ability score multiplier by x1 (max x5)", mods: { abilityMultiplierBump: 1, abilityMultiplierMax: 5, abilityMultiplierFrom: 2 } };
ok("A1 x2 to x5 is three purchases", warpMaxTimes(warp) === 3, String(warpMaxTimes(warp)));
ok("A2 each purchase adds one", aggregateWarpSelection([warp], { "warp-0": 2 }).mods.abilityMultiplierBump === 2);
ok("A3 the empty mods carry the field at 0", emptyWarp().mods.abilityMultiplierBump === 0);
ok("A4 the formula's multiplier is raised", multipliedAbilityFormula("@castingAbility * 2", 3) === "@castingAbility * 5");
ok("A5 no purchase, no change", multipliedAbilityFormula("@castingAbility * 2", 0) === "@castingAbility * 2");
ok("A6 a formula with no such term is left alone", multipliedAbilityFormula("2d8", 2) === "2d8");
const fx = read("module/magic/spell-effects.mjs");
const tempCase = fx.slice(fx.indexOf('case "tempHP": {'), fx.indexOf('case "tempHP": {') + 1500);
ok("A7 the temporary HP row reads the raised multiplier",
  /const rowFormula = multipliedAbilityFormula\(effect\.formula, warpMods\?\.abilityMultiplierBump\);/.test(tempCase)
  && /addDice\(rowFormula, warpDice\)/.test(tempCase));
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf37182-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "spells"), tmp, { recursive: true });
  try { fs.rmSync(path.join(tmp, "LOCK")); } catch { /* none */ }
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  let fh = null;
  for await (const [k, v] of db.iterator()) if (k.startsWith("!items!") && v.name === "False Health") fh = v.system;
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  ok("A8 the pack's warp carries the multiplier", JSON.stringify(fh?.warps?.[0]?.mods) === JSON.stringify(warp.mods), JSON.stringify(fh?.warps));
  ok("A9 and its row is still x2 on the casting ability", fh?.effects?.[0]?.formula === "@castingAbility * 2");
  const agg = aggregateWarpSelection(fh?.warps ?? [], { "warp-0": 3 }).mods;
  ok("A10 three purchases make x5", multipliedAbilityFormula(fh?.effects?.[0]?.formula, agg.abilityMultiplierBump) === "@castingAbility * 5");
}
ok("A11 owned copies are repaired", PACK_REPAIRS.some((r) => r.id === "false-health-warps-3718-2" && r.since === "3.718.2"));

/* B. A spell's repair is weighed against spells only -------------------- */
ok("B1 the Nightvision spell's repairs reach a spell", repairsForName(PACK_REPAIRS, "Nightvision", "spell").length >= 2);
ok("B2 …and not the Nightvision ability", repairsForName(PACK_REPAIRS, "Nightvision", "ability").length === 0);
ok("B3 a non-spell pack's repair still reaches its item", (() => {
  const feat = PACK_REPAIRS.find((r) => r.pack === "feats");
  return !feat || repairsForName(PACK_REPAIRS, feat.name, "feat").some((r) => r.id === feat.id);
})());
ok("B4 with no type given, matching is by name as before", repairsForName(PACK_REPAIRS, "Nightvision").length >= 2);
ok("B5 the migration passes the item's type", /repairsForName\(PACK_REPAIRS, item\?\.name, item\?\.type \?\? null\)/.test(read("module/migration.mjs")));

if (failures.length) {
  process.stderr.write(`verify-fixes-3718-2: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-fixes-3718-2: OK — ${checks} checks.\n`);
