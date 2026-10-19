#!/usr/bin/env node
/**
 * verify-ff30-block28 — 3.659.0, Fiends & Fables 3.0 block 28 (the Soulaess;
 * Graham, 18 October 2026: "Go with recommendations and Option A on 9").
 *
 *   R6   an area's further packet that lands only on named degrees (Necrotic Scream)
 *   R7   a heal from any death nearby (Soul Harvest)
 *   R8   divine damage recorded for regeneration; melee that bypasses
 *        resistance (Unstoppable Force); a critical's dice as Soul Drain (Reaver Blade)
 *   R9   Fearful Power
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (...p) => import(pathToFileURL(path.join(SYSTEM_ROOT, "module", ...p)).href);

const PE = await imp("peril-effect.mjs");
const DH = await imp("death-harvest.mjs");
const RR = await imp("regeneration-rules.mjs");
const RS = await imp("combat", "reaver-strikes.mjs");
const FP = await imp("fearful-power.mjs");

/* ---- R6 ---- */
{
  const s = PE.perilEffectSpec({ save: "fortitude", basic: true, damage: { formula: "6d8", type: "sonic" }, extraDamage: [{ formula: "2d6", type: "essence", on: ["Failure", "fumble", "blunder"] }, { formula: "1d6", type: "cold" }] }, "");
  equal("B1 a packet with `on` lands only on those degrees; one without lands on all",
    [s.extraDamage[0].on, ["critical", "success", "partial", "failure", "fumble", "blunder"].map((d) => PE.extraPacketLands(s.extraDamage[0], d)), PE.extraPacketLands(s.extraDamage[1], "success")],
    [["failure", "fumble", "blunder"], [false, false, false, true, true, true], true]);
}
/* ---- R7 ---- */
{ const at = (pp) => DH.deathHarvestOf([{ type: "ability", flags: { "trg-prime": { creatureAbility: { derives: { deathHarvest: { feet: 60, ppCost: pp } } } } } }], 1).dice;
  equal("B2 a Cure warped to N PP heals 1 + (N − 2) / 2 d8", [2, 4, 11, 12, 13].map(at), [1, 2, 5, 6, 6]); }
{
  const ab = (derives) => ({ type: "ability", name: "Soul Harvest", flags: { "trg-prime": { creatureAbility: { derives } } } });
  const a = DH.deathHarvestOf([ab({ deathHarvest: { feet: 60, ppCost: 12 } })], 3);
  const b = DH.deathHarvestOf([ab({ deathHarvest: { feet: 60 } })], 8);
  equal("B3 the harvest's reach and dice; its PP defaults to the creature's level; none without a reach",
    [a.feet, a.dice, b.dice, DH.deathHarvestOf([ab({ deathHarvest: { ppCost: 12 } })], 12), DH.deathHarvestOf([{ type: "feat", flags: {} }], 12)], [60, 6, 4, null, null]);
}
/* ---- R8 ---- */
equal("B4 a divinity source's damage is recorded as divine too; another tradition's is not",
  [RR.divineDamageMark(["divinity", "evocation"]), RR.divineDamageMark(["Divine"]), RR.divineDamageMark(["arcane"]), RR.divineDamageMark(null)], [["divine"], ["divine"], [], []]);
ok("B5 \"(Divine)\" regeneration is negated by that mark", RR.negatedByTypes(["divine"], ["fire", "divine"]) && !RR.negatedByTypes(["divine"], ["fire"]));
{
  const force = { type: "ability", flags: { "trg-prime": { creatureAbility: { derives: { meleeIgnoresResistance: true } } } } };
  const blade = { name: "Reaver Blade", flags: { "trg-prime": { creatureAttack: { criticalDiceAsSoulDrain: true } } } };
  equal("B6 Unstoppable Force read from its ability; a Reaver Blade critical's kept dice become drain, nothing without a critical or the flag",
    [RS.ignoresResistanceInMelee([force]), RS.ignoresResistanceInMelee([{ type: "feat", flags: force.flags }]), RS.criticalDiceAsDrain(blade, "deadly", 3), RS.criticalDiceAsDrain(blade, null, 3), RS.criticalDiceAsDrain({ flags: {} }, "deadly", 3), RS.damageDieOf("5d8+10"), RS.damageDieOf("")],
    [true, false, 3, 0, 0, 8, 6]);
}
/* ---- R9 ---- */
{
  const fp = FP.fearfulPowerOf([{ type: "ability", name: "Fearful Power", flags: { "trg-prime": { creatureAbility: { derives: { fearfulPower: { feet: 30 } } } } } }]);
  const t = { key: "frightened", value: 2, label: "Frightened" };
  equal("B7 Fearful Power's reach; a frightened tag in reach is one higher, once; no other tag, no reach, no value — unchanged",
    [fp.feet, FP.boostedFrightenedTag(t, ["Tenebrax", "Tenebrax 2"]).value, FP.boostedFrightenedTag(t, []).value, FP.boostedFrightenedTag({ key: "sickened", value: 2 }, ["T"]).value, FP.boostedFrightenedTag({ key: "frightened", value: 0 }, ["T"]).value],
    [30, 3, 2, 2, 0]);
  equal("B8 status bonuses do not stack: only what the bonus beats the existing status by", [FP.statusBonusOver(3, 1), FP.statusBonusOver(1, 1), FP.statusBonusOver(2, 0)], [2, 0, 2]);
}

/* ---- source ---- */
const src = { pw: read("module", "peril-workflow.mjs"), hooks: read("module", "codex-hooks-workflow.mjs"), dw: read("module", "combat", "damage-workflow.mjs"), cast: read("module", "magic", "cast-workflow.mjs"),
  aw: read("module", "combat", "attack-workflow.mjs"), eff: read("module", "combat", "effect-application-workflow.mjs"), caw: read("module", "creature-aura-workflow.mjs") };
ok("S1 a further packet is skipped on a degree it does not name", /for \(const extra of extraRolls\) \{\n\s+if \(!extraPacketLands\(extra, key\)\) continue;/.test(src.pw));
ok("S2 every death is offered to the harvesters within reach, who heal",
  /if \(!isActingGM\(\) \|\| !victim\) return;\n\s+await harvestNearbyDeath\(victim\);/.test(src.hooks)
  && /if \(!withinAura\(tokenCentreFeet\(token\.document\), tokenCentreFeet\(where\.document\), reach\)\) continue;\n\s+const roll = await new Roll\(`\$\{harvest\.dice\}d8`\)\.evaluate\(\);/.test(src.hooks));
ok("S3 the divine mark rides the typed-damage path and both spell paths",
  /damageTypes: \[String\(type \?\? ""\)\.trim\(\)\.toLowerCase\(\), \.\.\.divineDamageMark\(traits\)\]/.test(src.dw)
  && (src.cast.match(/\.\.\.divineDamageMark\(spellDamageSource\(spell\)\.sourceTraits\)/g) ?? []).length === 3);
ok("S4 Unstoppable Force empties the blow's resistances and bypasses its other packets'; a Reaver Blade critical's dice leave the blow and land as Soul Drain",
  /resistances: unstoppable \? new Set\(\) : targetDefences\.resistances,/.test(src.aw) && /resistanceCategories: unstoppable \? \[\] : targetDefences\.resistanceCategories,/.test(src.aw)
  && /if \(unstoppable\) bypassFor\(\[String\(rune\.type \?\? ""\)\.toLowerCase\(\)\], 5\);/.test(src.aw)
  && /criticalDice: drainDice \? 0 : critDiceKept,/.test(src.aw) && /const tags = \[\{ key: "soulDrain", value: drainRoll\.total, label: conditionLabel\("soulDrain"\) \}\];/.test(src.aw));
ok("S5 Fearful Power: frightened in reach raised as it is applied; the Tenebrax's attacks and DB read the highest frightened around it",
  /if \(powers\.length\) tags = tags\.map\(\(t\) => boostedFrightenedTag\(t, powers\)\);/.test(src.eff)
  && /const fearful = fearfulPowerBonus\(actor\);/.test(src.caw) && /when: \{ checkTypes: \["attack"\] \}, sourceName: "Fearful Power" \}\]/.test(src.caw)
  && /fearfulDB = statusBonusOver\(fearfulPowerBonus\(targetActor\),/.test(src.aw) && /shieldedStrideDB \+ typedDefence\.total \+ fearfulDB/.test(src.aw));

const EXPECTED = 14;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block28: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block28: ${checks} checks\n  all pass\n`);
