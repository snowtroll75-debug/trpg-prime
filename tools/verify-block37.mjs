#!/usr/bin/env node
/**
 * verify-block37 — block 37 (pages 371–383): 3.617.0, consumables and
 * wondrous items.
 *
 * NEW at 3.617.0. The audit is claude/audit-pages-371-383.md; Graham ruled
 * R1–R23 on 3 October 2026. This release builds R1–R6 and R16–R23 (the
 * weapons, R7–R15, are 3.618.0's):
 *
 *   A  potions reach their drinker (R1, B2, B7), and the builder (A1, A2, R2)
 *   B  the unguents (C1, R3, R4)
 *   C  the Pearl, the Bandage, the Gloves (C2, C4, R5), Tumbling and Water
 *      Breathing (C3, B5), the description path's activation (B3)
 *   D  wondrous: worn and invested (R16), the tradition (R19), no slot
 *      warnings (R21), the Amulet's DR (A13)
 *   E  the Bracers of Armour (A12, R17)
 *   F  the Gloves of Vitality's heal and the Agile Sash's removal (C8)
 *   G  Ring of Protection and Full Sight (A10, R20)
 *   H  an item's spell at the item's level (A11, R23)
 *   I  the Sash of Soaring's ten minutes (B16)
 *   J  the builder's wondrous rows (B17, R18)
 *   K  stowage (R22, B18), and the Spell Adder refunded (B18)
 *   L  the packs, the repairs and the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

// damage-workflow reaches dying-workflow, which reads DialogV2 at import.
globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const {
  buildConsumable, consumableLevelFor, CONSUMABLE_KINDS, wondrousAbilityTarget, wondrousDefaultBonusType, toWondrousAbilities
} = await import("../module/magic-item-builder.mjs");
const { drunkSpellTargeting, consumableUseRule } = await import("../module/consumable-use.mjs");
const { recipientMode } = await import("../module/elixirs.mjs");
const { oilOf, oilTarget, riderAttackRow, riderDamageBonus, riderPackets, riderAfterHit } = await import("../module/oils.mjs");
const { itemDamageExcess, weaponQualityDamageBonus } = await import("../module/combat/attack.mjs");
const { consumableSpecialOf, bandageChoice, burstLanding, BANDAGE_CHOICES } = await import("../module/consumable-specials.mjs");
const { burstDie } = await import("../module/burst-workflow.mjs");
const { MARKERS } = await import("../module/magic/markers.mjs");
const {
  wondrousActive, wondrousBonusesFor, wondrousBonusesForActor, bracersArmourHP, bracersState, bracersBaseDR,
  bracersAfterDrain, BRACERS_INERT_SECONDS, BRACERS_FLAG
} = await import("../module/wondrous-effects.mjs");
const { WONDROUS_ABILITIES } = await import("../module/wondrous-data.mjs");
const { bracersAreTheArmour } = await import("../module/bracers-workflow.mjs");
const { resolveDamagePacket } = await import("../module/combat/damage.mjs");
const { resolveAgainstDefences } = await import("../module/combat/damage-workflow.mjs");
const {
  wondrousUseOf, wondrousUseLabel, wondrousUseRefusal, removalPenaltyOf, removalPenaltyDue, wondrousAfterChange,
  WONDROUS_USED_FLAG, WORN_SINCE_FLAG, REMOVAL_AFTER_SECONDS
} = await import("../module/wondrous-use.mjs");
const { wondrousAbilityLevel, wondrousItemValue, wondrousSpellSurcharge } = await import("../module/wondrous.mjs");
const { innateCastLevel, grantingItemOf } = await import("../module/item-innate-level.mjs");
const { spellEffectGrants, grantSignature, warpsWithoutDuration } = await import("../module/rune-spell-workflow.mjs");
const { stowageSummary } = await import("../module/stowage.mjs");
const { TRG_SCHEMA_VERSION } = await import("../module/migration.mjs");
const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const body = (src, head) => {
  const at = src.indexOf(head);
  return at === -1 ? "" : src.slice(at, src.indexOf("\n}", at));
};
const USE = strip(read("module", "consumable-use-workflow.mjs"));
const CAST = strip(read("module", "magic", "cast-workflow.mjs"));
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));
const OILF = strip(read("module", "oil-workflow.mjs"));
const SPECIALF = strip(read("module", "consumable-specials-workflow.mjs"));
const DROWN = strip(read("module", "drowning-workflow.mjs"));
const ACTOR = strip(read("module", "documents", "actor.mjs"));
const SHEET = strip(read("module", "sheets", "actor-sheet.mjs"));
const SHEETHBS = read("templates", "actor", "actor-sheet.hbs");
const DAMAGEF = strip(read("module", "combat", "damage-workflow.mjs"));
const WUSEF = strip(read("module", "wondrous-use-workflow.mjs"));
const USESF = strip(read("module", "uses-workflow.mjs"));
const RUNESPELLF = strip(read("module", "rune-spell-workflow.mjs"));
const BUILDERF = strip(read("module", "magic-item-builder-workflow.mjs"));
const SPELLFX = strip(read("module", "magic", "spell-effects.mjs"));
const AREASAVE = strip(read("module", "magic", "area-save-workflow.mjs"));
const BOOT = read("scripts", "trg-prime.mjs");

async function packRows(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open({ readOnly: true });
  const rows = new Map();
  for await (const [key, value] of db.iterator()) if (key.startsWith("!items!")) rows.set(value.name, value);
  await db.close();
  return rows;
}

/* ================================================================== *
 * A. Potions reach their drinker; the builder
 * ================================================================== */
{
  // R1: a potion is drunk by the user, or fed to the one creature in reach.
  ok("A1 R1 — a potion is drunk", consumableUseRule("potion").drunk === true && !consumableUseRule("scroll").drunk);
  ok("A1b who: nothing targeted is the drinker; one in reach is fed; two is refused",
    recipientMode({ targetCount: 0 }).mode === "self"
    && recipientMode({ targetCount: 1, distance: 5 }).mode === "fed"
    && recipientMode({ targetCount: 2 }).mode === "refuse"
    && recipientMode({ targetCount: 1, distance: 30 }).mode === "refuse");
  // B2: an area or ranged spell in a bottle reaches one creature by touch.
  const area = drunkSpellTargeting({ range: "30 feet", area: "5-foot radius", targets: "" });
  ok("A2 B2 — Water Breathing's 5-ft area becomes the one drinker",
    area.range === "touch" && area.targets === "1 creature" && area.area === "");
  ok("A2b a self-only spell keeps its own targeting",
    JSON.stringify(drunkSpellTargeting({ range: "self", targets: "", area: "" })) === "{}");
  const potion = body(USE, "export async function useConsumable(");
  ok("A3 the potion path asks who, pays the AP, and casts as the recipient with preset targets",
    /if \(rule\.drunk && data\)/.test(potion) && /recipientMode\(/.test(potion)
    && /presetTargets/.test(USE) && /castSpell\([^)]*presetTargets/.test(USE));
  ok("A3b the AP comes back if nothing is cast", /await refundActionCost\(actor, drink\.ap\);/.test(USE));
  // B7: a potion is gated on its one hand, not on its spell's somatic component.
  ok("A4 B7 — a drunk potion skips the rage gate, the casting refusal and the component gate",
    /const drunkPotion = Boolean\(spell\?\.getFlag\?\.\(SYSTEM_ID, "itemCast"\)\?\.consumed\)/.test(CAST)
    && /isRaging\(actor\) && !drunkPotion/.test(CAST) && /refusal\.blocked && !drunkPotion/.test(CAST)
    && /const componentsOK = drunkPotion/.test(CAST));
  ok("A4b the target picker is skipped for preset targets",
    CAST.includes("if (spellNeedsTarget(spellData) && !storingNow && !reaction?.presetTargets && !presetTargets) {"));
  // A1, R2: the builder's level and price.
  ok("A5 R2 — a PP 0 consumable is level 1: 30 gp, a scroll 20 gp",
    consumableLevelFor(0) === 1 && buildConsumable("potion", { spell: { pp: 0 } }).price === 30
    && buildConsumable("scroll", { spell: { pp: 0 } }).price === 20);
  ok("A5b A1 — a PP 2 potion is level 2, 60 gp (it read one row too high)",
    buildConsumable("potion", { spell: { pp: 2 } }).level === 2 && buildConsumable("potion", { spell: { pp: 2 } }).price === 60);
  ok("A5c PP 20 is on the table", buildConsumable("potion", { spell: { pp: 20 } }).problems.length === 0);
  // A2: the printed activation and hands.
  ok("A6 A2 — a potion is Interact (2 AP) in one hand; an unguent Engage (1 minute) in two",
    CONSUMABLE_KINDS.potion.activation === "Interact (2 AP)" && CONSUMABLE_KINDS.potion.hands === 1
    && CONSUMABLE_KINDS.unguent.activation === "Engage (1 minute)" && CONSUMABLE_KINDS.unguent.hands === 2);
  ok("A6b the builder writes them", /CONSUMABLE_KINDS\[[^\]]+\]\??\.activation/.test(BUILDERF) && /heldHands/.test(BUILDERF));
}

/* ================================================================== *
 * B. The unguents
 * ================================================================== */
{
  const combustion = oilOf({ flags: { "trg-prime": { consumable: { oil: {
    kind: "rider", secondary: { dice: "1d6", type: "fire" }, strikes: 5, meleeOnly: true, weaponDuration: "1 hour" } } } } });
  const sharp = oilOf({ flags: { "trg-prime": { consumable: { oil: {
    kind: "rider", attack: 1, damage: 1, damageTypes: ["slashing", "piercing"], weaponDuration: "1 hour", ammoDuration: "1 hour", ammoCount: 5 } } } } });
  ok("B1 the riders normalise", combustion?.kind === "rider" && combustion.strikes === 5 && combustion.secondary?.dice === "1d6"
    && sharp?.attack === 1 && sharp.damage === 1 && sharp.ammoCount === 5);
  const sword = { type: "weapon", system: { attackMode: "melee", damageType: "slashing" } };
  const club = { type: "weapon", system: { attackMode: "melee", damageType: "bludgeoning" } };
  const bow = { type: "weapon", system: { attackMode: "missile", damageType: "piercing" } };
  ok("B2 Sharpness: slashing or piercing only; ammunition too",
    oilTarget(sharp, sword).ok && !oilTarget(sharp, club).ok && oilTarget(sharp, { type: "ammunition", system: {} }).ok);
  ok("B2b Combustion: any melee weapon, not a bow, not ammunition",
    oilTarget(combustion, club).ok && !oilTarget(combustion, bow).ok && !oilTarget(combustion, { type: "ammunition", system: {} }).ok);
  const coat = { kind: "rider", name: "Unguent of Sharpness", attack: 1, damage: 1, endsAt: 3600 };
  ok("B3 R3 — Sharpness is an ITEM row to attack, so the attack's stacking keeps the higher",
    riderAttackRow(coat, { worldTime: 0 })?.type === "item" && riderAttackRow(coat, { worldTime: 0 }).value === 1);
  ok("B3b and gone after its hour", riderAttackRow(coat, { worldTime: 3600 }) === null && riderDamageBonus(coat, { worldTime: 3600 }) === 0);
  ok("B4 R3 — two item bonuses to damage give the higher, never both",
    itemDamageExcess(1, 0) === 1 && itemDamageExcess(1, 2) === 0 && itemDamageExcess(3, 1) === 2);
  ok("B4b a masterwork weapon's quality damage is an item bonus to set it against",
    typeof weaponQualityDamageBonus("1d8", { quality: "standard" }) === "number");
  const fire = { kind: "rider", name: "Combustion Unguent", secondary: { dice: "1d6", type: "fire" }, strikesLeft: 5, endsAt: 3600 };
  ok("B5 R4 — Combustion is a secondary 1d6 fire packet while strikes remain",
    riderPackets(fire, { worldTime: 0 }).length === 1 && riderPackets(fire, { worldTime: 0 })[0].type === "fire"
    && riderPackets({ ...fire, strikesLeft: 0 }, { worldTime: 0 }).length === 0);
  ok("B5b a hit spends one; the fifth is the last", riderAfterHit(fire, {})?.strikesLeft === 4
    && riderAfterHit({ ...fire, strikesLeft: 1 }, {})?.gone === true);
  const dmg = body(ATTACK, "export async function resolveWeaponDamage(") || ATTACK;
  ok("B6 the attack reads the coats: attack rows, the damage excess, the packets, and spends a strike",
    /riderAttackRow\(/.test(ATTACK) && /riderDamageBonus\(/.test(dmg) && /riderPackets\(/.test(dmg) && /spendRiderStrike\(/.test(dmg));
  ok("B6b the ammunition's damage bonus is set against the quality item damage (R3)",
    /itemDamageExcess\(/.test(dmg) && /weaponQualityDamageBonus\(/.test(dmg));
  ok("B7 the oil workflow coats a rider and counts its strikes",
    /kind === "rider"/.test(OILF) && /strikesLeft/.test(OILF) && /export async function spendRiderStrike\(/.test(OILF));
}

/* ================================================================== *
 * C. Pearl, Bandage, Gloves; Tumbling and Water Breathing
 * ================================================================== */
{
  const pearl = consumableSpecialOf({ flags: { "trg-prime": { consumable: { special: {
    kind: "burst", formula: "3d8", damageType: "force", radiusFeet: 10, rangeFeet: 60, dc: 22, save: "reflex" } } } } });
  ok("C1 C2 — the Pearl's burst", pearl?.kind === "burst" && pearl.dc === 22 && pearl.radiusFeet === 10 && burstDie(pearl.formula) === 8);
  ok("C1b it is thrown at one creature within 60 ft",
    burstLanding({ targetCount: 1, distance: 60, rangeFeet: 60 }).ok
    && !burstLanding({ targetCount: 1, distance: 65, rangeFeet: 60 }).ok && !burstLanding({ targetCount: 0, rangeFeet: 60 }).ok);
  const bandage = consumableSpecialOf({ flags: { "trg-prime": { consumable: { special: {
    kind: "bandage", skill: "medicine", dc: 20, seconds: 86400, healingDCReduction: 1 } } } } });
  ok("C2 C4, R5 — the Bandage: DC 20 Medicine, kept for 24 hours", bandage?.dc === 20 && bandage.seconds === 86400 && bandage.healingDCReduction === 1);
  ok("C2b its reaction offers the page's four, in order",
    BANDAGE_CHOICES.map((c) => c.key).join() === "heal,bleeding,weakened,injured" && bandageChoice("heal")?.row?.formula === "2d8"
    && bandageChoice("injured")?.row?.amount === 1);
  const applyBandage = body(SPECIALF, "async function applyBandage(");
  ok("C2c a failed check keeps the bandage; the use is spent only once it is on",
    /TRGCheck\.roll\(/.test(applyBandage) && applyBandage.indexOf("the bandage is kept") < applyBandage.indexOf("spendOne(item)")
    && /spellEffectEnd: now \+ special\.seconds/.test(applyBandage));
  ok("C3 the Gloves aid at +2, and backing out keeps them",
    consumableSpecialOf({ flags: { "trg-prime": { consumable: { special: { kind: "aid", bonus: 2 } } } } })?.bonus === 2
    && /if \(!check\) return null;/.test(body(SPECIALF, "async function aidWithItem(")));
  ok("C4 every special is reached from the use path, and its buttons registered at boot",
    /consumableSpecialOf\(item\)/.test(USE) && /registerConsumableSpecialHooks\(\);/.test(BOOT));
  ok("C5 C3, B5 — Water Breathing is a marker the drowning clock reads",
    MARKERS.waterBreathing?.reader === "module/drowning-workflow.mjs"
    && /if \(findMarker\(actor, "waterBreathing"\)\) \{/.test(DROWN));
  // B3: the description path charges its activation.
  ok("C6 B3 — a description-only item takes its printed time",
    /if \(mode === "description" && !rule\.needsCheck\) \{\s*const cost = activationCost\(/.test(USE));
}

/* ================================================================== *
 * D. Wondrous: worn and invested; the tradition; no slot warning; the Amulet
 * ================================================================== */
{
  const belt = (sys) => ({ name: "Belt of Vital Stamina", flags: { "trg-prime": { wondrous: {} } }, system: sys });
  ok("D1 R16 — invested AND worn", wondrousActive(belt({ invested: true, equipped: true }))
    && !wondrousActive(belt({ invested: true, equipped: false })) && !wondrousActive(belt({ invested: false, equipped: true })));
  ok("D1b two invested Belts in a backpack give nothing (B14)",
    wondrousBonusesForActor([belt({ invested: true, equipped: false }), belt({ invested: true, equipped: false })]).hp === 0);
  const sack = { name: "Never-Ending Stash Sack I", flags: { "trg-prime": { wondrous: {} } }, system: { invested: true, equipped: false } };
  ok("D1c a sack is carried, not worn: investment alone", wondrousActive(sack));
  ok("D2 R19 — the wondrous context's tradition is the casting tradition",
    /const castingTradition = system\.progression\?\.tradition/.test(ACTOR) && /tradition: castingTradition/.test(ACTOR));
  ok("D3 R21 — no duplicate-slot warning on the sheet",
    !/duplicateSlotWarnings/.test(SHEET) && !/duplicateSlot/.test(SHEETHBS.replace(/duplicate-slot-warning/g, "")));
  // A13: the Amulet's status DR is POOLED, not added raw after the stacking ran.
  const amulet = wondrousBonusesFor({ name: "Amulet of Natural Resilience", flags: { "trg-prime": { wondrous: {} } } });
  ok("D4 A13 — the Amulet's DR is a status bonus to the pool",
    amulet.bonuses.some((b) => b.target === "system.combat.dr" && b.entry.type === "status" && b.entry.value === 1));
  const prep = body(ACTOR, "function prepareArmourProtection(");
  ok("D4b and nothing adds wondrous DR raw any more; prepareCombat pools it",
    !/wondrousDR/.test(prep) && !/wondrousBonus\.target === "system\.combat\.dr"\) continue/.test(ACTOR)
    && /actor\.addBonus\(wondrousBonus\.target, wondrousBonus\.entry\)/.test(ACTOR));
}

/* ================================================================== *
 * E. The Bracers of Armour (A12, R17)
 * ================================================================== */
{
  const item = (name, flag = null, sys = { invested: true, equipped: true }) => ({
    id: name.replace(/\W/g, ""), name, system: sys,
    flags: { "trg-prime": { wondrous: {}, ...(flag ? { [BRACERS_FLAG]: flag } : {}) } }
  });
  const b3 = wondrousBonusesFor(item("Bracers of Armour III"));
  ok("E1 the Bracers are Base DR, not a bonus to the DR pool",
    b3.baseDR.length === 1 && b3.baseDR[0].value === 3 && b3.baseDR[0].armourHP === 40
    && !b3.bonuses.some((b) => b.target === "system.combat.dr"));
  ok("E1b one ability, priced once", WONDROUS_ABILITIES["Bracers of Armour V"].length === 1
    && wondrousItemValue(WONDROUS_ABILITIES["Bracers of Armour I"]).level === 3);
  ok("E2 the pools are 20, 30, 40, 60, 80", [1, 2, 3, 4, 5].map(bracersArmourHP).join() === "20,30,40,60,80");
  const two = wondrousBonusesForActor([item("Bracers of Armour II"), item("Bracers of Armour IV")]);
  const best = bracersBaseDR(two.baseDR, 0);
  ok("E3 A12 — only the highest Base DR: two pairs give the better, not the sum", best.dr === 4 && best.itemId === "BracersofArmourIV");
  ok("E4 R17 — armour: the higher of the bracers and worn armour, never both",
    // 3.617.1: compared as the DR a blow meets (`effective`).
    bracersAreTheArmour(1, { effective: 3, itemId: "x" }) && !bracersAreTheArmour(3, { effective: 3, itemId: "x" }) && !bracersAreTheArmour(5, { effective: 3, itemId: "x" }));
  const drained = bracersAfterDrain({ hp: 10 }, 4, 100);
  const spent = bracersAfterDrain({ hp: 3 }, 4, 100);
  ok("E5 R17 — the pool absorbs what the DR stopped; at 0 inert for an hour",
    drained.hp === 6 && !drained.inert && spent.hp === 0 && spent.inert && spent.inertUntil === 100 + BRACERS_INERT_SECONDS
    && BRACERS_INERT_SECONDS === 3600);
  const inert = { value: 3, armourHP: 40, stored: { hp: 0, inertUntil: 5000 } };
  ok("E5b inert gives no DR within the hour, and returns at full HP after it",
    bracersState(inert, 4999).dr === 0 && bracersState(inert, 4999).inert
    && bracersState(inert, 5000).dr === 3 && bracersState(inert, 5000).hp === 40);
  ok("E5c a pair never struck is at full HP", bracersState({ value: 2, armourHP: 30, stored: null }, 0).hp === 30);
  // The packet says what the equipped share stopped.
  const p = resolveDamagePacket({ amount: 10, type: "slashing", dr: 3, naturalArmourDr: 2 });
  const q = resolveDamagePacket({ amount: 2, type: "slashing", dr: 3, naturalArmourDr: 0 });
  const r = resolveDamagePacket({ amount: 10, type: "fire", dr: 4, naturalArmourDr: 0 });
  const crit = resolveDamagePacket({ amount: 10, type: "slashing", dr: 3, drBypassed: true, naturalArmourDr: 0 });
  ok("E6 the packet's equipped share: what armour stopped, capped at the damage, halved vs energy, nothing when bypassed",
    p.equippedDrStopped === 3 && p.taken === 5 && q.equippedDrStopped === 2 && r.equippedDrStopped === 2 && crit.equippedDrStopped === 0);
  // Every other damage path: the derived DR is the higher of the two.
  const sys = (armour, bracers) => ({ combat: { armour: { dr: armour }, bracers: { dr: bracers, effective: bracers, itemId: bracers ? "b" : "" },
    bdb: { total: 0 }, naturalArmour: { dr: 0 }, dr: { total: 0 } } });
  const spell = resolveAgainstDefences(sys(1, 3), { amount: 10, type: "slashing" });
  const plate = resolveAgainstDefences(sys(5, 3), { amount: 10, type: "slashing" });
  const bypass = resolveAgainstDefences(sys(1, 3), { amount: 10, type: "slashing", drBypassed: true });
  ok("E7 resolveAgainstDefences takes the higher, marks the bracers as the source, and not when bypassed",
    spell.taken === 7 && spell.bracersSource === true && plate.taken === 5 && plate.bracersSource === false
    && bypass.bracersSource === false);
  const weapon = body(ATTACK, "export async function resolveWeaponDamage(") || ATTACK;
  ok("E8 the weapon path: the higher of worn armour and the bracers, drained after the packet unless bypassed",
    /const equippedEffectiveDR = Math\.max\(wornEffectiveDR, Number\(targetBracers\?\.effective \?\? 0\)\);/.test(weapon)
    && /await drainBracers\(targetActor, packet, bracersSource && !drBypassed\)/.test(weapon));
  ok("E9 the spell paths drain too: attack, save, auto-hit, area save, typed damage",
    (CAST.match(/await drainBracers\(/g) ?? []).length === 2 && /drainBracers\(target, packet\)/.test(SPELLFX)
    && /drainBracers\(target, packet\)/.test(AREASAVE) && /drainBracers\(targetActor, packet, packet\.bracersSource\)/.test(DAMAGEF));
  ok("E10 the actor records the best pair and prints its pool",
    /system\.combat\.bracers = bracersBaseDR\(/.test(ACTOR) && /magical armour \$\{b\.hp\}\/\$\{b\.max\} HP/.test(ACTOR));
}

/* ================================================================== *
 * F. The Gloves of Vitality's heal; the Agile Sash's removal (C8)
 * ================================================================== */
{
  const gloves = (sys = { invested: true, equipped: true }, flags = {}) => ({
    name: "Gloves of Vitality II", system: sys, flags: { "trg-prime": { wondrous: {}, ...flags } }
  });
  const use = wondrousUseOf(gloves());
  ok("F1 the heal: Engage (1 AP), 1/day, the tier's formula, essence",
    use?.formula === "3d4+12" && use.activation === "Engage (1 AP)" && use.frequency === "daily" && /essence/.test(use.note)
    && !/positive/.test(JSON.stringify(WONDROUS_ABILITIES)));
  ok("F1b A14 — Gloves III records no misprint any more",
    !JSON.stringify(WONDROUS_ABILITIES["Gloves of Vitality III"]).includes("printedValue"));
  ok("F2 refused when not worn, or used today; allowed otherwise",
    wondrousUseRefusal(gloves()).ok && !wondrousUseRefusal(gloves({ invested: true, equipped: false })).ok
    && !wondrousUseRefusal(gloves(undefined, { [WONDROUS_USED_FLAG]: true })).ok
    && /used/.test(wondrousUseLabel(gloves(undefined, { [WONDROUS_USED_FLAG]: true }))));
  const heal = body(WUSEF, "export async function useWondrousItem(");
  ok("F3 a living creature in reach; nothing spent on a refusal; the day's use marked",
    // 3.617.1 (F1 of the drive): the living gate is RUN in verify-drive-3617.
    /const refusal = wondrousUsePatientRefusal\(patient\.system \?\? \{\}, patient\.name\);/.test(heal)
    && heal.indexOf("wondrousUsePatientRefusal(") < heal.indexOf("spendActionPoints") && heal.indexOf("spendActionPoints") < heal.indexOf("WONDROUS_USED_FLAG, true"));
  ok("F3b the sheet's use button runs it, and daily preparation renews it",
    // 3.617.1 (F2 of the drive): the Wondrous section's Activate button.
    /row\.wondrousUse = wondrousUseLabel\(item\);/.test(SHEET) && /data-action="activateItem" data-tooltip="\{\{#if item\.wondrousUse\}\}/.test(SHEETHBS)
    && /unsetFlag\(SYSTEM_ID, WONDROUS_USED_FLAG\)/.test(USESF));
  // The Agile Sash.
  const sash = (sys, since) => ({ name: "Agile Sash III", system: sys,
    flags: { "trg-prime": { wondrous: {}, ...(since === undefined ? {} : { [WORN_SINCE_FLAG]: since }) } } });
  ok("F4 the Sash's penalty is its bonus", removalPenaltyOf(sash({}))?.value === 3 && removalPenaltyOf(gloves()) === null);
  ok("F5 due only after 24 hours worn",
    removalPenaltyDue(sash({}, 100), 100 + REMOVAL_AFTER_SECONDS) === 3 && removalPenaltyDue(sash({}, 100), 100 + REMOVAL_AFTER_SECONDS - 1) === 0
    && removalPenaltyDue(sash({}), 999999) === 0 && REMOVAL_AFTER_SECONDS === 86400);
  ok("F6 taking it off, un-investing it or deleting it ends the wearing",
    !wondrousActive(wondrousAfterChange(sash({ invested: true, equipped: true }), { equipped: false }))
    && !wondrousActive(wondrousAfterChange(sash({ invested: true, equipped: true }), { invested: false }))
    && wondrousActive(wondrousAfterChange(sash({ invested: true, equipped: false }), { equipped: true })));
  ok("F7 the hooks start the clock, lay a 24-hour −N status penalty, and are registered",
    /setProperty\(changes, `flags\.\$\{SYSTEM_ID\}\.\$\{api\.WORN_SINCE_FLAG\}`, now\)/.test(WUSEF)
    && /key: `\$\{penalty\.target\}\.status`, type: CHANGE_TYPE\.CUSTOM, value: String\(-value\)/.test(WUSEF)
    && /Hooks\.on\("preDeleteItem"/.test(WUSEF) && /registerWondrousHooks\(\);/.test(BOOT));
}

/* ================================================================== *
 * G. Ring of Protection and Full Sight (A10, R20)
 * ================================================================== */
{
  const ring = (n) => WONDROUS_ABILITIES[`Ring of Protection ${n}`];
  ok("G1 Ring of Protection I–III: +1/+2/+3 status to DB",
    ["I", "II", "III"].every((n, i) => ring(n)?.[0]?.kind === "dbBonus" && ring(n)[0].value === i + 1
      && ring(n)[0].bonusType === "status" && ring(n)[0].target === "system.combat.defence"));
  ok("G1b priced from the table at the printed levels",
    wondrousItemValue(ring("I")).level === 6 && wondrousItemValue(ring("II")).level === 12 && wondrousItemValue(ring("III")).level === 18);
  ok("G2 R20 — Full Sight: True Seeing at will", WONDROUS_ABILITIES["Full Sight"]?.[0]?.spell === "True Seeing"
    && WONDROUS_ABILITIES["Full Sight"][0].frequency === "atWill");
  const fs2 = wondrousBonusesFor({ name: "Full Sight", flags: { "trg-prime": { wondrous: {} } } });
  ok("G2b it grants the spell", fs2.spells.length === 1 && fs2.spells[0].spell === "True Seeing");
}

/* ================================================================== *
 * H. An item's spell at the item's level (A11, R23)
 * ================================================================== */
{
  const ring = { id: "ring1", name: "Ring of Animal Friendship", system: { itemLevel: 7 } };
  const granted = { flags: { "trg-prime": { spellEffectRune: { itemId: "ring1" } } } };
  ok("H1 the granted spell's level is its item's", innateCastLevel(granted, [ring], 2).level === 7
    && innateCastLevel(granted, [ring], 2).itemName === ring.name && grantingItemOf(granted, [ring]) === ring);
  ok("H1b a creature's own innate spell keeps the creature's level",
    innateCastLevel({ flags: {} }, [ring], 9).level === 9 && innateCastLevel(granted, [], 9).level === 9);
  ok("H2 the DC, the attack and the free budget all read it",
    /innateSaveFor\(spell, castingAbility, innateLevel\)/.test(CAST) && /innateAttackFor\(spell, innateAbility, innateLevel\)/.test(CAST)
    && /innateWarpBudget\(innateLevel\)/.test(CAST) && /\? innateLevel\s*: casterLevelOf\(system\)/.test(CAST)
    && !/innateSaveFor\(spell, castingAbility, characterLevel\)/.test(CAST));
}

/* ================================================================== *
 * I. The Sash of Soaring's ten minutes (B16)
 * ================================================================== */
{
  const sash = { id: "s1", name: "Sash of Soaring", system: { invested: true, equipped: true }, flags: { "trg-prime": { wondrous: {} } } };
  const fly = spellEffectGrants([sash]).find((g) => g.spell === "Fly");
  ok("I1 the Fly grant carries its ten minutes", fly?.duration === "10 minutes"
    && !spellEffectGrants([sash]).find((g) => g.spell === "Feather Fall")?.duration);
  ok("I2 a fixed duration is part of the grant's identity (an older Fly is replaced)",
    grantSignature(fly) !== grantSignature({ ...fly, duration: undefined })
    && grantSignature({ itemId: "a", spell: "X", frequency: "daily" }) === "a|x|daily");
  const warps = [
    { ppCost: 2, text: "affect an additional target", mods: { extraTargets: 1 } },
    { ppCost: 2, text: "duration increases to 10 minutes", mods: { durationText: "10 minutes" } },
    { ppCost: 4, text: "duration increases to 1 hour", mods: { durationText: "1 hour" } }
  ];
  ok("I3 the duration warps are dropped; the rest kept", warpsWithoutDuration(warps).length === 1
    && warpsWithoutDuration(warps)[0].mods.extraTargets === 1);
  ok("I4 the granted spell is written with them", /data\.system\.duration = grant\.duration;/.test(RUNESPELLF)
    && /data\.system\.warps = warpsWithoutDuration\(data\.system\.warps\);/.test(RUNESPELLF));
}

/* ================================================================== *
 * J. The builder's wondrous rows (B17, R18)
 * ================================================================== */
{
  ok("J1 B17 — a skill bonus is a status bonus by default, priced and applied alike",
    wondrousDefaultBonusType("skillBonus") === "status" && toWondrousAbilities([{ kind: "skillBonus", value: 1, subject: "stealth" }])[0].bonusType === "status");
  ok("J2 all saves: one row, three pools", wondrousAbilityTarget({ kind: "saveBonus", subject: "all" }).save === "all");
  const all = wondrousBonusesFor({ name: "Built", flags: { "trg-prime": { wondrous: {
    abilities: toWondrousAbilities([{ kind: "saveBonus", value: 1, subject: "all" }], "Built") } } } });
  ok("J2b and it reaches all three", ["fortitude", "reflex", "will"].every((s) => all.bonuses.some((b) => b.target === `system.combat.saves.${s}`)));
  const spell = toWondrousAbilities([{ kind: "spell", value: 3, subject: "Fly", frequency: "atWill" }], "Built")[0];
  ok("J3 a spell row is a granted spell, not a note", spell.spell === "Fly" && spell.frequency === "atWill" && !spell.reported);
  const builtGrant = wondrousBonusesFor({ name: "Built", flags: { "trg-prime": { wondrous: { abilities: [spell] } } } });
  ok("J3b and the derivation grants it", builtGrant.spells[0]?.spell === "Fly");
  ok("J4 R18 — the frequency surcharge: 1/day +0, 3/day +1, at will +2, constant +4",
    [wondrousSpellSurcharge("daily"), wondrousSpellSurcharge("thrice"), wondrousSpellSurcharge("atWill"), wondrousSpellSurcharge("constant")].join() === "0,1,2,4");
  ok("J4b priced on top of the PP row", wondrousAbilityLevel({ kind: "spell", value: 3, frequency: "atWill" }).level
    === wondrousAbilityLevel({ kind: "spell", value: 3 }).level + 2);
  ok("J5 the dialog offers a spell picker, a frequency, and all saves",
    /data-kind="spell" data-pp=/.test(BUILDERF) && /trg-ability-frequency/.test(BUILDERF) && /"fortitude", "reflex", "will", "all"/.test(BUILDERF));
}

/* ================================================================== *
 * K. Stowage (R22), and the Spell Adder refunded (B18)
 * ================================================================== */
{
  const sack = { system: { invested: true }, flags: { "trg-prime": { container: { capacityLbs: 50 } } } };
  const stowed = (w) => ({ system: { stowed: true, equipped: false, weight: w, quantity: 1 } });
  const over = stowageSummary([sack, stowed(40), stowed(30)]);
  const none = stowageSummary([stowed(30)]);
  ok("K1 R22 — what is over the capacity is over; with no invested sack, all of it", over.over === 20 && none.over === 30 && none.shown);
  ok("K2 the overflow is carried weight", /const stowedOverflow = stowageSummary\(Array\.from\(items \?\? \[\]\)\)\.over;/.test(ACTOR)
    && /return itemWeight \+ stowedOverflow \+ coinWeight\(currency\);/.test(ACTOR));
  ok("K3 the sheet says so", /The excess is carried/.test(SHEETHBS) && /stowage\.shown/.test(SHEETHBS));
  ok("K4 B18 — a Spell Adder spent on a cancelled cast comes back",
    /if \(spellAdderUsed\) \{\s*const spentNow = Number\(actor\.getFlag\?\.\(SYSTEM_ID, SPELL_ADDER_USED_FLAG\)\) \|\| 0;\s*await actor\.setFlag\(SYSTEM_ID, SPELL_ADDER_USED_FLAG, Math\.max\(0, spentNow - 1\)\);/.test(CAST));
}

/* ================================================================== *
 * L. The packs, the repairs, the version
 * ================================================================== */
{
  const cons = await packRows("consumables");
  const c = (n) => cons.get(n)?.flags?.["trg-prime"]?.consumable ?? {};
  ok("L1 the unguents carry their riders", c("Combustion Unguent").oil?.strikes === 5 && c("Unguent of Sharpness").oil?.ammoCount === 5);
  ok("L2 the Pearl, the Bandage and the Gloves carry their specials",
    c("Pearl of Force").special?.dc === 22 && c("Mystical Bandage").special?.dc === 20 && c("Assisting Gloves").special?.bonus === 2);
  ok("L3 Tumbling's +2 waits for a Tumble", c("Potion of Tumbling").effect?.effects?.[0]?.grants?.[0]?.when?.actions?.[0] === "tumble");
  ok("L4 R6 — Flying is Interact", cons.get("Potion of Flying")?.system?.activation === "Interact (2 AP)");
  const spells = await packRows("spells");
  ok("L5 Water Breathing's marker", spells.get("Water Breathing")?.system?.effects?.[0]?.marker === "waterBreathing");
  const wond = await packRows("wondrous");
  ok("L6 A10 — Ring of Protection I–III and Full Sight are in the pack, at their printed level and price",
    wond.get("Ring of Protection I")?.system?.itemLevel === 6 && wond.get("Ring of Protection III")?.system?.price === 180000
    && wond.get("Full Sight")?.system?.itemLevel === 15 && wond.get("Full Sight")?.system?.slot === "head" && wond.size === 31);
  ok("L7 A14 — the Gloves heal with essence; Faith's Eye is worn at the neck",
    ["I", "II", "III"].every((n) => /essence healing effect/.test(wond.get(`Gloves of Vitality ${n}`)?.system?.description ?? ""))
    && wond.get("Faith’s Eye")?.system?.slot === "neck"
    && wond.get("Gloves of Vitality III")?.flags?.["trg-prime"]?.wondrous?.printedValue === undefined);
  const ids = new Set(PACK_REPAIRS.map((r) => r.id));
  ok("L8 owned copies are repaired: Flying's activation, Water Breathing's marker, Faith's Eye's slot",
    ["potion-of-flying-activation-3617", "water-breathing-effects-3617", "faiths-eye-slot-3617"].every((id) => ids.has(id)));
  const sys = JSON.parse(read("system.json"));
  const gate = /runIf\("(\d+\.\d+\.\d+)", "stale owned copies/.exec(read("module", "migration.mjs"))?.[1];
  const atLeast = (v) => { const [a, b] = String(v).split(".").map(Number); return a > 3 || (a === 3 && b >= 617); };
  ok("L9 the version, the schema and the gate are 3.617 or later; the schema never leads",
    atLeast(sys.version) && atLeast(TRG_SCHEMA_VERSION) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0 && atLeast(gate));
}

if (failures.length) {
  console.log(`verify-block37: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block37: OK — ${checks} checks. Potions to their drinker, the unguents, the Pearl and the Bandage, worn wondrous items, the Bracers as armour, the Gloves' heal and the Sash's grip, the new rings, an item's own level, and stowage.`);
