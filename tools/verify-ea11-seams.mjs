#!/usr/bin/env node
/**
 * verify-ea11-seams — TRG Prime 3.713.0: the two seams Eldritch Arts 0.18.0's
 * Artificer feats need (C-EA11-1, C-EA11-2).
 *
 *   A  registerWeaponEnhancement: the registry, the pure summary, its four
 *      call sites (attack rows ×2, damage, packets, reload) and the API wiring.
 *   B  registerCraftingWorkModifier: the registry, `craftingTimeModifiers`,
 *      `timeValueFor`, and the Create workflow pricing time at them while the
 *      check's ranks and the item's value are left alone.
 *   C  With nothing registered, nothing changes (no module, no difference).
 *
 *   node tools/verify-ea11-seams.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, b) => ok(label, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const api = await import("../module/module-api.mjs");
const { weaponEnhancementsFor, enhancedLoad } = await import("../module/weapon-enhancements.mjs");
const { craftingTimeModifiers, timeValueFor } = await import("../module/crafting-feats.mjs");

/* A */
equal("A1 nothing registered: no rows, no damage, no packets, no reload change", weaponEnhancementsFor({ id: "w" }, {}), { attackRows: [], itemDamage: 0, flatDamage: 0, damageLabels: [], packets: [], reloadReduction: 0, labels: [] });
ok("A2 registerWeaponEnhancement refuses a non-function", api.registerWeaponEnhancement("x", 3) === false);
ok("A3 ...and takes a function", api.registerWeaponEnhancement("test", (w) => (w.id === "w" ? [{ label: "Up", attack: 1 }, { label: "Oc", damage: 1, damageType: "untyped", packets: [{ dice: "1d4", type: "fire" }, { dice: "bad", type: "fire" }], reloadReduction: 1 }] : null), "test") === true);
const got = weaponEnhancementsFor({ id: "w" }, {});
equal("A4 an attack row typed item by default", got.attackRows, [{ label: "Up", value: 1, type: "item" }]);
equal("A5 untyped damage is flat; item damage is the best item answer", [got.flatDamage, got.itemDamage], [1, 0]);
equal("A6 a malformed packet is dropped; a good one kept", got.packets, [{ label: "Oc", dice: "1d4", type: "fire", secondaryCritical: null }]);
equal("A7 the reload reduction, and Load never below 0", [got.reloadReduction, enhancedLoad(1, 1), enhancedLoad(1, 3), enhancedLoad(3, 1)], [1, 0, 0, 2]);
equal("A8 another weapon gains nothing", weaponEnhancementsFor({ id: "v" }, {}).labels, []);
equal("A9 two item damage answers: the best, not the sum", weaponEnhancementsFor({}, {}, [{ key: "a", fn: () => ({ damage: 1 }) }, { key: "b", fn: () => ({ damage: 2 }) }]).itemDamage, 2);
const quiet = console.error; console.error = () => {};
equal("A10 a provider that throws costs its own answer only", weaponEnhancementsFor({}, {}, [{ key: "bad", fn: () => { throw new Error("x"); } }, { key: "b", fn: () => ({ attack: 1 }) }]).attackRows.length, 1);
console.error = quiet;
const attack = src("module", "combat", "attack-workflow.mjs");
equal("A11 the attack reads it at both row builders", (attack.match(/for \(const row of weaponEnhancementsFor\(weapon, actor\)\.attackRows\)/g) ?? []).length, 2);
ok("A12 the damage adds only an item bonus's excess, and an untyped one in full", /itemDamageExcess\(enhancement\.itemDamage,[\s\S]{0,260}if \(enhancementItemDamage\) formula \+= [\s\S]{0,80}if \(enhancement\.flatDamage\) formula \+=/.test(attack));
ok("A13 the packets join the secondary-damage loop", /\.\.\.unguentPackets, \.\.\.enhancementPackets/.test(attack));
ok("A14 the reload subtracts it after Quick Reload", /enhancedLoad\(Math\.max\(0, loadValue - quickReloadFeat\), enhancement\.reloadReduction\)/.test(src("module", "combat", "reload-workflow.mjs")));
ok("A15 the API hands both registrations to modules", /registerWeaponEnhancement: \(key, fn, moduleId\) => registerWeaponEnhancement\(key, fn, moduleId\)/.test(src("module", "module-api-workflow.mjs")) && /registerCraftingWorkModifier: \(key, fn, moduleId\) => registerCraftingWorkModifier\(key, fn, moduleId\)/.test(src("module", "module-api-workflow.mjs")));

/* B */
equal("B1 no provider: nothing", craftingTimeModifiers({}, []), { ranks: 0, valueFactor: 1, labels: [] });
const tp = [{ key: "tp", fn: () => ({ label: "TP", ranks: 2, valueFactor: 0.75 }) }];
equal("B2 a provider's ranks and factor", craftingTimeModifiers({}, tp), { ranks: 2, valueFactor: 0.75, labels: ["TP"] });
equal("B3 the lowest factor, applied once; every rank added", craftingTimeModifiers({}, [...tp, { key: "x", fn: () => ({ ranks: 1, valueFactor: 0.9 }) }]), { ranks: 3, valueFactor: 0.75, labels: ["TP", "x"] });
equal("B4 a factor outside (0, 1] is ignored", craftingTimeModifiers({}, [{ key: "x", fn: () => ({ valueFactor: 2 }) }, { key: "y", fn: () => ({ valueFactor: 0 }) }]), { ranks: 0, valueFactor: 1, labels: [] });
equal("B5 the time value rounds up", [timeValueFor(400, 0.75), timeValueFor(401, 0.75), timeValueFor(400, 1)], [300, 301, 400]);
ok("B6 registerCraftingWorkModifier takes a function and refuses anything else", api.registerCraftingWorkModifier("t", () => null, "test") === true && api.registerCraftingWorkModifier("u", null) === false);
const create = src("module", "create-crafting-workflow.mjs");
ok("B7 a day is priced at the time ranks", /createPerDay\(\s*degreeKey, mods\.ranks \+ timeMods\.ranks/.test(create));
ok("B8 the check's own ranks are recorded unchanged", /project\.ranks = Math\.max\(0, Math\.trunc\(Number\(ranks\) \|\| 0\)\);/.test(create));
equal("B9 both completion tests read the time value", (create.match(/completionOf\(project\.progress, project\.timeValue \?\? project\.itemValue\)/g) ?? []).length, 2);
ok("B10 the project's value — what the materials cost — is never rewritten", !/project\.itemValue\s*=/.test(create));

/* C */
equal("C1 the system is 3.714.0", JSON.parse(src("system.json")).version, "3.714.0");

/* D — 3.713.1: a spell of several traditions is cast in its caster's (Graham's ruling, Eldritch Arts A11-16) */
{
  const HM = await import("../module/magic/high-magic.mjs");
  const caster = (t) => ({ system: { magic: { tradition: t } } });
  const told = (spell, c) => HM.spellSaveTraditions({ items: [], effects: [] }, { tradition: spell }, { highMagic: false }, c);
  equal("D1 a multi-tradition spell narrows to the caster's tradition", [
    told("arcane, divinity, ethereal, verdant", caster("ethereal")),
    told("arcane, divinity, ethereal, verdant", caster("verdant")),
    told("Arcane, Divinity", caster("divine"))
  ], ["ethereal", "verdant", "divinity"]);
  equal("D2 unchanged: one tradition, no caster, or a caster outside the list", [
    told("divinity", caster("arcane")),
    told("arcane, divinity", null),
    told("divinity, verdant", caster("arcane")),
    told("arcane, divinity", caster(""))
  ], ["divinity", "arcane, divinity", "divinity, verdant", "arcane, divinity"]);
  equal("D3 the save is told it on an ordinary cast; High Magic still tells every tradition", [
    HM.spellSaveTraditions({ items: [], effects: [] }, { tradition: "arcane, divinity, ethereal, verdant" }, { highMagic: false }, caster("ethereal")),
    HM.spellSaveTraditions({ items: [], effects: [] }, { tradition: "arcane, divinity, ethereal, verdant" }, { highMagic: false })
  ], ["ethereal", "arcane, divinity, ethereal, verdant"]);
  ok("D4 both spell saves pass the caster", /spellSaveTraditions\(target, spell\.system \?\? \{\}, saveHighMagic, actor\)/.test(src("module", "magic", "cast-workflow.mjs"))
    && /spellSaveTraditions\(target, spell\.system \?\? \{\}, highMagicCast\(caster, spell\.system \?\? \{\}\), caster\)/.test(src("module", "magic", "spell-effects.mjs")));
}

if (failures.length) {
  console.error(`verify-ea11-seams: ${failures.length} of ${checks} failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-ea11-seams: OK — ${checks} checks.`);
