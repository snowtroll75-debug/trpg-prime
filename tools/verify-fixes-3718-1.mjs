#!/usr/bin/env node
/**
 * verify-fixes-3718-1 — the two spells Graham named after the 3.718.0 sweep
 * (27 November 2026).
 *
 * A. CURE's 3 AP mode, "a surge of restorative energy spreads outward in a
 *    30-foot radius, healing all creatures within its range", refused a
 *    second creature. The mode names an area, but the target picker, the
 *    count and every "is this an area spell" test read the ITEM's fields —
 *    the 1 AP form's "1 willing creature" and no area. Inflict's 3 AP mode
 *    shared it. Now one `castShape`, the mode laid over the item.
 * C. DARKVISION AND NIGHTVISION cast on yourself granted nothing: the spell on
 *    your own sheet has the ability's name, so you "already had" it. Found in
 *    the 3.718.0 live re-check.
 * B. SIZE ALTERATION: "Its equipment grows with it". Graham: the target's
 *    weapons "should increase by one die step". The row declares
 *    `equipmentGrows`, the effect carries the signed steps, and a weapon
 *    Strike's base dice move by them on the size ladder.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { spellNeedsTarget } from "../module/magic/casting.mjs";
import { isAreaSpell } from "../module/magic/kind-gate.mjs";
import { targetCapFor } from "../module/magic/target-count.mjs";
import { EQUIPMENT_SIZE_FLAG, equipmentSizeSteps } from "../module/magic/size-step.mjs";
import { steppedCreatureDamage } from "../module/creature-attacks.mjs";
import { alreadyHasAbility } from "../module/magic/granted-ability.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (p) => fs.readFileSync(path.join(SYSTEM_ROOT, p), "utf8");
const cast = read("module/magic/cast-workflow.mjs");

/* A. Cure's surge ---------------------------------------------------------- */
ok("A1 the cast builds one shape from the AP mode",
  /const castShape = apMode\s*\?\s*\{ \.\.\.spellData, range: effRange, area: effArea, targets: apMode\.targets \?\? \(String\(effArea \?\? ""\)\.trim\(\) \? "" : spellData\.targets\) \}\s*:\s*spellData;/.test(cast));
ok("A2 no target gate reads the item's own fields any more",
  !/spellNeedsTarget\(spellData, spell\)/.test(cast) && !/isAreaSpell\(spellData\)/.test(cast));
ok("A3 the picker's words and the count are the mode's",
  /targets: castShape\?\.targets\s*\}\),/.test(cast) && /targetCapNote\(castShape\?\.targets, \{\}\)/.test(cast)
  && /targetCapFor\(castShape\?\.targets, warp\.mods, casterLevel\)/.test(cast));
ok("A4 the shape is built before the first gate reads it",
  cast.indexOf("const castShape = apMode") > 0 && cast.indexOf("const castShape = apMode") < cast.indexOf("spellNeedsTarget(castShape, spell)"));
{
  // THE MODE LAID OVER THE ITEM, as the cast lays it.
  const item = { area: "", targets: "1 willing creature", category: "utility" };
  const shape = (mode) => ({ ...item, area: mode.area ?? "", targets: mode.targets ?? (String(mode.area ?? "").trim() ? "" : item.targets) });
  const surge = shape({ area: "30-foot radius" });
  ok("A5 Cure 3 AP is an area and asks for no target", isAreaSpell(surge) && !spellNeedsTarget(surge), JSON.stringify(surge));
  ok("A6 …and has no target cap", targetCapFor(surge.targets) === null);
  const touch = shape({ area: "" });
  ok("A7 Cure 1 AP still targets one willing creature", !isAreaSpell(touch) && spellNeedsTarget(touch) && targetCapFor(touch.targets) === 1);
  const dd = shape({ area: "", targets: "2 living creatures" });
  ok("A8 a mode's own count still wins (Death's Defiance)", targetCapFor(dd.targets) === 2);
}

/* B. Size Alteration's equipment ------------------------------------------- */
ok("B1 the flag", EQUIPMENT_SIZE_FLAG === "equipmentSizeSteps");
ok("B2 the steps are summed over live effects only",
  equipmentSizeSteps({ effects: [
    { flags: { "trg-prime": { equipmentSizeSteps: 1 } } },
    { flags: { "trg-prime": { equipmentSizeSteps: 1 } } },
    { disabled: true, flags: { "trg-prime": { equipmentSizeSteps: 3 } } },
    { flags: {} }
  ] }) === 2);
ok("B3 a reduction is signed", equipmentSizeSteps({ effects: [{ flags: { "trg-prime": { equipmentSizeSteps: -1 } } }] }) === -1);
ok("B4 no effects, no steps", equipmentSizeSteps({}) === 0);
ok("B5 one step on the size ladder: 1d8 → 1d10, and down to 1d6",
  steppedCreatureDamage("1d8", 1) === "1d10" && steppedCreatureDamage("1d8", -1) === "1d6");
const fx = read("module/magic/spell-effects.mjs");
const sizeCase = fx.slice(fx.indexOf('case "sizeStep": {'), fx.indexOf('case "sizeStep": {') + 4000);
ok("B6 a row that says its equipment grows stamps the signed steps on the effect",
  /if \(effect\.equipmentGrows\) \{[\s\S]{0,200}sizeData\.flags\[SYSTEM_ID\]\[EQUIPMENT_SIZE_FLAG\] = steps;/.test(sizeCase));
ok("B7 and the card says the die moves", /Its weapons' damage die/.test(sizeCase));
const aw = read("module/combat/attack-workflow.mjs");
ok("B8 a weapon Strike's base dice move by the steps",
  /const grown = weapon\?\.type === "weapon" && !unarmed\?\.damage && !isUnarmedAttack\(weaponData\) \? equipmentSizeSteps\(actor\) : 0;\s*if \(grown\) strikeBase = steppedCreatureDamage\(strikeBase, grown\) \?\? strikeBase;/.test(aw));
ok("B9 and the formula is built from them", /let formula = buildWeaponDamageFormula\(strikeBase, \{/.test(aw));
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf37181-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "spells"), tmp, { recursive: true });
  try { fs.rmSync(path.join(tmp, "LOCK")); } catch { /* none */ }
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  let sa = null, cure = null;
  for await (const [k, v] of db.iterator()) {
    if (!k.startsWith("!items!")) continue;
    if (v.name === "Size Alteration") sa = v.system;
    if (v.name === "Cure") cure = v.system;
  }
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  ok("B10 Size Alteration's row declares its equipment grows", sa?.effects?.[0]?.kind === "sizeStep" && sa?.effects?.[0]?.equipmentGrows === true, JSON.stringify(sa?.effects));
  const surge = (cure?.apOptions ?? []).find((o) => Number(o.ap) === 3);
  ok("A9 Cure's 3 AP mode is still a 30-foot radius with no count of its own", surge?.area === "30-foot radius" && surge?.targets === undefined);
}

/* C. A spell of the same name is not the ability ------------------------ */
ok("C1 the caster's own Darkvision spell is not the Darkvision ability",
  alreadyHasAbility([{ name: "Darkvision", type: "spell" }], "Darkvision") === false);
ok("C2 the ability itself still counts", alreadyHasAbility([{ name: "Darkvision", type: "ability" }], "Darkvision") === true);
ok("C3 a racial sense of that name counts, whatever its type but spell", alreadyHasAbility([{ name: "Nightvision", type: "feat" }], "nightvision") === true);

if (failures.length) {
  process.stderr.write(`verify-fixes-3718-1: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-fixes-3718-1: OK — ${checks} checks.\n`);
