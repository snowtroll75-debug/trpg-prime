#!/usr/bin/env node
/**
 * verify-block37-weapons — block 37's weapons (pages 377–380), 3.618.0.
 *
 * Graham's rulings of 3 October 2026 (R7–R15) on
 * claude/audit-pages-371-383.md, and the audit's A3–A9, B1, B8–B13, C5, C6.
 *
 *   A  potency: +1 damage a tier (R7), +5 HP a tier on a tracked weapon (R8)
 *   B  the energy runes are switched on (R9, A4, C5)
 *   C  a secondary critical only on a critical strike (R10, B8)
 *   D  Disrupting deals essence (A3); Aligned and Bane are rolled (R12, B9)
 *   E  usage lines enforced (B10, B12)
 *   F  Called and Shifting (A5, R11, B11)
 *   G  Returning (A7)
 *   H  Life Stealing, Ghost Touch, Vicious (C6, R13, B13)
 *   I  runed ammunition (B1)
 *   J  the specific weapons and Da Big Itter's Fear (A8, R14, R15)
 *   K  the rune data and the rune pack (A9)
 *   L  the version
 *   M  the 3.618.0 drive's faults (3.618.1)
 *   N  an "Incorporeal" ability item is the trait (3.618.1, Q1)
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const { computeRuneModifiers, WEAPON_POTENCY_HP_PER_TIER } = await import("../module/runes.mjs");
const { computeFullCustomisation } = await import("../module/item-quality.mjs");
const { runeDamageFor, runeDamageLine, secondaryCriticalFor, energyRuneActive, DAMAGE_RUNES, ENERGY_RUNES } = await import("../module/rune-damage.mjs");
const { runeActionsFor, shiftableForms, sizeWord } = await import("../module/rune-actions.mjs");
const { RUNE_USAGE, runeUsageAllows, weaponUsage, baneMatches } = await import("../module/weapon-rune-usage.mjs");
const { runeBonusesFor } = await import("../module/rune-effects.mjs");
const { returnsToHand } = await import("../module/combat/thrown-weapons.mjs");
const { resolveDamagePacket } = await import("../module/combat/damage.mjs");
const { ammoPotencyTier, ammunitionAttackModifier } = await import("../module/combat/ammunition.mjs");
const { baseRoundProperties, builtItemData, BASE_ROUND_FIELDS } = await import("../module/magic-item-builder.mjs");
const { weaponLevelDC } = await import("../module/weapon-rune-workflow.mjs");
const { WEAPON_RUNES } = await import("../module/weapon-rune-data.mjs");
const { SPECIFIC, RUNE_NOTES, RUNE_TEXT } = await import("./block37w-plan.mjs");
const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
const { TRG_SCHEMA_VERSION } = await import("../module/migration.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));
const ACTIONS_WF = strip(read("module", "rune-actions-workflow.mjs"));
const THROWN = strip(read("module", "combat", "thrown-weapons.mjs"));
const BUILDER_WF = strip(read("module", "magic-item-builder-workflow.mjs"));
const CUSTOMISE = strip(read("module", "item-customize-workflow.mjs"));
const ITEM = strip(read("module", "documents", "item.mjs"));
const CONSUMABLE_WF = strip(read("module", "consumable-use-workflow.mjs"));
const RUNE_WF = strip(read("module", "weapon-rune-workflow.mjs"));

const sword = (runes, extra = {}) => ({ type: "weapon", name: "Sword", system: { runes, attackMode: "melee", damageType: "slashing", traits: "", quality: "master", ...extra.system }, flags: extra.flags ?? {} });
const on = (key) => ({ "trg-prime": { runeState: { [`${key}Active`]: true } } });

/* A — potency */
{
  const ii = computeRuneModifiers({ kind: "weapon", runes: "Potency II", quality: "master" });
  ok("A1 R7 — Potency II adds +2 damage", ii.damage === 2 && ii.attack === 2);
  ok("A2 R8 — and +5 HP a tier", ii.hp === 10 && WEAPON_POTENCY_HP_PER_TIER === 5);
  const capped = computeRuneModifiers({ kind: "weapon", runes: "Potency III", quality: "standard" });
  ok("A3 the damage follows the tier the quality allows (Normal: I)", capped.damage === 1);
  ok("A4 armour's potency is untouched by it", computeRuneModifiers({ kind: "armour", runes: "Potency II", quality: "expert" }).damage === 0
    && computeRuneModifiers({ kind: "armour", runes: "Potency II", quality: "expert" }).hp === 10);
  const tracked = computeFullCustomisation("weapon", { level: 1, price: 10, hp: 20 }, { quality: "expert", runes: "Potency II" });
  const untracked = computeFullCustomisation("weapon", { level: 1, price: 10, hp: 0 }, { quality: "expert", runes: "Potency II" });
  ok("A5 a weapon that tracks HP gains +10 at II; one that tracks none stays untracked", tracked.hpMax === 30 && untracked.hpMax === 0, `${tracked.hpMax} / ${untracked.hpMax}`);
  ok("A6 the item publishes the damage for the roll", /this\.system\.runeDamageBonus = modifiers\.damage;/.test(ITEM));
  ok("A7 the damage roll adds it, on top of quality",
    /const weaponPotencyDamage = Math\.max\(0, Number\(weaponData\.runeDamageBonus \?\? 0\) \|\| 0\);\s*if \(weaponPotencyDamage\) formula \+= ` \+ \$\{weaponPotencyDamage\}`;/.test(ATTACK)
    && /const weaponItemDamage = qualityItemDamage \+ weaponPotencyDamage;/.test(ATTACK));
}

/* B — the energy runes are switched on */
{
  const off = sword("Potency II, Flaming II");
  ok("B1 R9 — an energy rune that is off deals nothing", runeDamageFor(off).length === 0);
  ok("B2 switched on, it deals its tier", runeDamageFor(sword("Potency II, Flaming II", { flags: on("flaming") }))[0]?.dice === "2d4");
  const eternal = sword("Potency II, Flaming I", { flags: { "trg-prime": { specificItem: { alwaysActive: ["flaming"] } } } });
  ok("B3 Flametooth's flames are always on", runeDamageFor(eternal).length === 1 && energyRuneActive(eternal, "flaming"));
  ok("B4 a batch of ammunition has nothing to switch", runeDamageFor({ type: "ammunition", system: { runes: "Potency I, Frost I" } }).length === 1);
  const buttons = runeActionsFor(sword("Potency II, Flaming I, Shock II"));
  ok("B5 each energy rune has an Activate button at Command (1 AP)",
    buttons.length === 2 && buttons.every((b) => b.verb === "Activate" && b.apCost === 1 && b.state === `${b.key}Active`));
  ok("B6 an always-on rune has no switch", runeActionsFor(eternal).length === 0);
  ok("B7 switching on pays the AP, switching off is free",
    /const on = runeStateOf\(item, action\.state\);\s*if \(!on\) \{\s*const \{ payRuneActivation \} = await import\("\.\/rune-timers-workflow\.mjs"\);\s*if \(!await payRuneActivation\(actor, action\.apCost \?\? 1/.test(ACTIONS_WF)
    && /await setState\(item, action\.state, !on\);/.test(ACTIONS_WF));
  ok("B8 the five are dispatched", ["acidic", "flaming", "frost", "shock", "thundering"].every((k) => new RegExp(`\\b${k}: useEnergyRune,`).test(ACTIONS_WF)));
}

/* C — the secondary critical */
{
  ok("C1 R10 — none on an ordinary hit", secondaryCriticalFor({ secondaryCritical: -40 }, null) === null);
  const crit = secondaryCriticalFor({ secondaryCritical: -40 }, "serious");
  ok("C2 on a critical, at the strike's own severity with the rune's modifier", crit?.severity === "serious" && crit?.modifier === -40);
  ok("C3 Disrupting II's unmodified one is rolled at 0", secondaryCriticalFor({ secondaryCritical: 0 }, "minor")?.modifier === 0);
  ok("C4 a rune with none rolls none", secondaryCriticalFor({ secondaryCritical: null }, "deadly") === null);
  ok("C5 the loop rolls it through that rule",
    /const secondary = secondaryCriticalFor\(rune, critical\);\s*if \(secondary\) \{\s*await rollCriticalInjury\(actor, \{[^}]*severity: secondary\.severity,[^}]*modifier: secondary\.modifier/.test(ATTACK)
    && !/severity: "minor",\s*attackBonus: Number\(system\.combat\?\.attack\?\.total \?\? 0\),\s*modifier: rune\.secondaryCritical/.test(ATTACK));
}

/* D — Disrupting, Aligned and Bane */
{
  ok("D1 A3 — Disrupting deals essence", DAMAGE_RUNES.disrupting.type === "essence"
    && runeDamageFor(sword("Potency I, Disrupting I"))[0]?.type === "essence");
  ok("D2 no rune deals 'positive'", Object.values(DAMAGE_RUNES).every((r) => r.type !== "positive"));
  const evil = { details: { traits: "Evil, Undead" } };
  const aligned = runeDamageFor(sword("Potency I, Aligned (good)"), { target: evil })[0];
  ok("D3 R12 — Aligned (good) is aligned damage that reaches an Evil creature", aligned?.type === "aligned" && aligned.applies && aligned.resolved);
  const neutral = runeDamageFor(sword("Potency I, Aligned (good)"), { target: { details: { traits: "Beast" } } })[0];
  ok("D4 and nothing else, saying why", neutral && !neutral.applies && /opposing good/.test(runeDamageLine(neutral, 0)));
  ok("D5 Bane matches the kind as a creature trait, plural or not",
    baneMatches("dragons", { details: { traits: "Dragon, Huge" } }) && baneMatches("elves", { details: { traits: "Elf" } })
    && baneMatches("spiders", { details: { creatureType: "Spider" } }) && !baneMatches("dragons", { details: { traits: "Beast" } }));
  const bane = runeDamageFor(sword("Potency I, Bane (dragons)"), { target: { details: { traits: "Dragon" } } })[0];
  ok("D6 Bane adds to the strike itself", bane?.addsToStrike && bane.applies && bane.dice === "2d4");
  ok("D7 the damage roll adds Bane's dice when it applies, and the loop leaves it out",
    /if \(bane\.resolved && bane\.applies\) \{\s*formula \+= ` \+ \$\{bane\.dice\}`;/.test(ATTACK)
    && /\.\.\.strikeRunes\.filter\(\(r\) => !r\.addsToStrike\)/.test(ATTACK));
  ok("D8 a conditional rune that does not apply is said and not rolled",
    /if \(rune\.conditional && \(!rune\.resolved \|\| !rune\.applies\)\) \{\s*lines\.push\(line\(`<em>\$\{runeDamageLine\(rune, 0\)\}<\/em>`\)\);\s*continue;/.test(ATTACK));
}

/* E — usage lines */
{
  const bow = { attackMode: "missile", damageType: "piercing", traits: "" };
  const club = { attackMode: "melee", damageType: "bludgeoning", traits: "" };
  const rapier = { attackMode: "melee", damageType: "piercing", traits: "Keen, Finesse" };
  const javelin = { attackMode: "thrown", damageType: "piercing", traits: "Thrown 30" };
  ok("E1 the seven printed usage lines", Object.keys(RUNE_USAGE).sort().join() === "disrupting,ghostTouch,lifeStealing,razor,returning,shifting,vicious");
  ok("E2 melee only: not on a bow", ["disrupting", "ghostTouch", "shifting", "vicious"].every((k) => !runeUsageAllows(k, weaponUsage(bow)).ok && runeUsageAllows(k, weaponUsage(club)).ok));
  ok("E3 Life Stealing needs slashing — a Versatile S counts", !runeUsageAllows("lifeStealing", weaponUsage(club)).ok
    && runeUsageAllows("lifeStealing", weaponUsage({ ...club, traits: "Versatile S" })).ok);
  ok("E4 B12 — Razor needs Keen", runeUsageAllows("razor", weaponUsage(rapier)).ok && !runeUsageAllows("razor", weaponUsage({ ...rapier, traits: "" })).ok);
  ok("E5 Returning needs a thrown weapon", runeUsageAllows("returning", weaponUsage(javelin)).ok && !runeUsageAllows("returning", weaponUsage(club)).ok);
  ok("E6 ammunition takes none of the seven", Object.keys(RUNE_USAGE).every((k) => !runeUsageAllows(k, weaponUsage({}, { ammunition: true })).ok)
    && runeUsageAllows("flaming", weaponUsage({}, { ammunition: true })).ok);
  ok("E7 a suppressed rune is listed on the item", computeRuneModifiers({ kind: "weapon", runes: "Potency I, Disrupting I", quality: "expert", usage: weaponUsage(bow) })
    .problems.some((p) => /Disrupting needs any melee weapon .* suppressed/.test(p)));
  ok("E8 and deals nothing", runeDamageFor({ type: "weapon", system: { runes: "Potency I, Disrupting I", ...bow } }).length === 0);
  ok("E9 Razor on a club gives no critical AV", runeBonusesFor({ type: "weapon", name: "Club", system: { runes: "Potency I, Razor", quality: "expert", ...club } }).criticalAV === 0
    && runeBonusesFor({ type: "weapon", name: "Rapier", system: { runes: "Potency I, Razor", quality: "expert", ...rapier } }).criticalAV === 1);
  const fear = runeBonusesFor({ type: "weapon", name: "Sword", system: { runes: "Potency III, Courageous", quality: "standard", ...club } }).conditionals[0];
  ok("E10 B12 — Courageous reads the potency the quality allows", fear?.value === 1);
  ok("E11 the chooser marks what will not take, and the ammunition builder offers only a missile weapon's",
    /const allowed = usage && itemType === "weapon" \? runeUsageAllows\(rune\.key, usage\)/.test(CUSTOMISE)
    && /\$\{refused \? " disabled" : ""\}/.test(CUSTOMISE)
    && /usage: \{ ammunition: true \}/.test(BUILDER_WF));
}

/* F — Called and Shifting */
{
  const actions = runeActionsFor(sword("Potency I, Called I, Shifting I"));
  ok("F1 A5 — Called costs 2 AP, Shifting 1", actions.find((a) => a.key === "called")?.apCost === 2 && actions.find((a) => a.key === "shifting")?.apCost === 1);
  ok("F2 R11 — the Level DC is the weapon's: level + 14", weaponLevelDC({ system: { itemLevel: 7 } }) === 21);
  ok("F3 Called pays and reads it", /if \(!await payRuneActivation\(actor, action\.apCost \?\? 2/.test(ACTIONS_WF)
    && /const dc = weaponLevelDC\(item\);/.test(ACTIONS_WF) && !/10 \+ level/.test(ACTIONS_WF));
  ok("F4 B11 — the printed sizes read", sizeWord("L") === "large" && sizeWord("M") === "medium" && sizeWord("medium") === "medium");
  const forms = shiftableForms([
    { name: "Longsword", size: "medium", attackMode: "melee" }, { name: "Shortbow", size: "medium", attackMode: "missile" }, { name: "Greatsword", size: "large" }
  ], { fromSize: "M", steps: 0 });
  ok("F5 only melee forms, and an 'M' finds them", forms.map((f) => f.name).join() === "Longsword");
  ok("F6 the new form's handling is taken and given back",
    /\.\.\.Object\.fromEntries\(SHIFT_FIELDS\.map\(\(field\) => \[`system\.\$\{field\}`, form\.system\[field\]\]\)\)/.test(ACTIONS_WF)
    && /\.\.\.Object\.fromEntries\(SHIFT_FIELDS\.map\(\(field\) => \[field, item\.system\[field\]\]\)\)/.test(ACTIONS_WF)
    && /SHIFT_FIELDS = Object\.freeze\(\["attackMode", "hands", "fumbleDC", "armourRending", "category"\]\)/.test(ACTIONS_WF));
  ok("F7 Shifting pays its AP", /if \(!await payRuneActivation\(actor, action\.apCost \?\? 1, `\$\{item\.name\} — \$\{action\.label\}`\)\) return null;\s*await item\.update\(\{\s*name: `\$\{form\.name\}/.test(ACTIONS_WF));
  ok("F8 a Shifting rune on a bow has no button", runeActionsFor({ type: "weapon", system: { runes: "Potency I, Shifting I", attackMode: "missile", damageType: "piercing" } }).length === 0);
}

/* G — Returning */
{
  const jav = { system: { equipped: true, runes: "Potency I, Returning", attackMode: "thrown", damageType: "piercing", traits: "Thrown 30" } };
  ok("G1 A7 — a Returning thrown weapon comes back", returnsToHand(jav) && !returnsToHand({ system: { ...jav.system, runes: "Potency I" } }));
  ok("G2 not on a weapon it cannot take", !returnsToHand({ system: { ...jav.system, attackMode: "melee", traits: "" } }));
  ok("G3 the throw keeps it", /if \(returnsToHand\(weapon\)\) \{\s*return \{ thrown: true, returned: true,/.test(THROWN));
  ok("G4 B13 — the card says so on the throw, not on every hit",
    /thrownSpend\.returned\s*\?/.test(ATTACK) && !/for \(const key of \["ghostTouch", "returning", "submersible"\]\)/.test(ATTACK));
}

/* H — Life Stealing, Ghost Touch, Vicious */
{
  ok("H1 C6 — Life Stealing is rolled on a critical, on a weapon that can take it",
    /if \(lifeStealing && critical && runeUsageAllows\("lifeStealing", weaponUsage\(weaponData\)\)\.ok\) \{\s*for \(const stolen of await lifeStealingStrike\(actor, weapon, targetActor\)\)/.test(ATTACK));
  ok("H2 the save is the target's Fortitude at the weapon's Level DC; a failure drains and heals",
    /const dc = weaponLevelDC\(weapon\);/.test(RUNE_WF) && /subject: "fortitude"/.test(RUNE_WF)
    && /applyConditionTags\(target, \[\{ key: "soulDrain", label: "Soul Drain", value: drain\.total \}\]\)/.test(RUNE_WF)
    && /const healed = await healActor\(actor, drain\.total\);/.test(RUNE_WF));
  const ghost = { immunities: ["non-magical"], resistanceCategories: ["all damage"] };
  const plain = resolveDamagePacket({ amount: 10, type: "slashing", ...ghost, magical: false });
  const touched = resolveDamagePacket({ amount: 10, type: "slashing", ...ghost, magical: false, incorporealTouch: true });
  ok("H3 Ghost Touch strikes the incorporeal normally", plain.taken === 0 && touched.taken === 10, `${plain.taken} / ${touched.taken}`);
  ok("H4 only against an incorporeal target, from a weapon whose rune is in force",
    /const ghostTouchHere = \(\s*\(Boolean\(equippedEventRune\(\[weapon\], "ghostTouch"\)\) && runeUsageAllows\("ghostTouch", weaponUsage\(weaponData\)\)\.ok\)\s*\|\| runeGhostTouch\(weapon\)\s*(?:\|\| actorGhostTouch\(actor(?:, \{ magical: strikeIsMagical \})?\)\s*)?\) && isIncorporeal\(targetActor\.system\);/.test(ATTACK)
    && /incorporealTouch: ghostTouchHere,/.test(ATTACK));
  ok("H5 R13 — Vicious feeds back through the wielder's own defences",
    /const fed = resolveAgainstDefences\(actor\.system, \{\s*amount: back, type: rune\.type,/.test(ATTACK)
    && /if \(fed\.taken > 0\) await applyDamageAndCheckDying\(actor, fed\.taken/.test(ATTACK));
  ok("H6 C6 — and fumbles automatically for a wielder who resists essence",
    /const starved = viciousStarves\(actor, weapon\);\s*const check = starved \? null : await TRGCheck\.roll/.test(ATTACK)
    && /defences\?\.resistances\?\.has\?\.\("essence"\) \|\| defences\?\.immunities\?\.has\?\.\("essence"\)/.test(ATTACK));
}

/* I — runed ammunition */
{
  ok("I1 B1 — a batch's potency is its tier", ammoPotencyTier({ runes: "Potency II, Flaming I" }) === 2 && ammoPotencyTier({}) === 0);
  ok("I2 it is the round's item bonus to attack, not stacking with its own", ammunitionAttackModifier({ runes: "Potency II" }, "Arrows")?.value === 2
    && ammunitionAttackModifier({ runes: "Potency I", attackModifier: 2 }, "Stones")?.value === 2 && ammunitionAttackModifier({ runes: "Potency I" })?.type === "item");
  ok("I3 its damage takes the higher of the round's and the bow's item bonuses",
    /const ammoItemDamage = itemDamageExcess\(Math\.max\(0, ammoDamageMod\) \+ ammoPotencyDamage, weaponItemDamage\);/.test(ATTACK));
  ok("I4 a runed round is magical, and its runes deal their damage",
    // 3.622.0: and a morph's grown strike after it (block 39's R11).
    // 3.625.0: and the actor's own declaration after that (magical-attacks.mjs).
    // 3.626.1: decided once as `strikeIsMagical`, read by the blow and by every secondary packet.
    // 3.627.0: and a strike type an option makes magical (Essence Attacks) after that.
    /const strikeIsMagical = Boolean\(weapon\?\.system\?\.runeModifiers\?\.potency\) \|\| ammoPotencyTier\(ammo\) > 0[\s\S]{0,700}?\|\| weapon\?\.flags\?\.\[SYSTEM_ID\]\?\.magicalStrike === true[\s\S]{0,500}?\}\)\)[\s\S]{0,300}?\|\| strikeTypeIsMagical\([^;]*\);/.test(ATTACK)
    && /magical: strikeIsMagical,/.test(ATTACK)
    && /\.\.\.\(ammoRuneItem \? runeDamageFor\(ammoRuneItem, \{ target: targetActor\?\.system \?\? null \}\) : \[\]\)/.test(ATTACK));
  const penetrating = { armourRending: 1, damageTypeOverride: "", attackModifier: 0, damage: "" };
  ok("I5 the builder keeps the base round's own properties", baseRoundProperties(penetrating).armourRending === 1
    && builtItemData("ammunition", "Arrows, Potency I", { price: 1, level: 2 }, { runes: "Potency I", base: penetrating }).system.armourRending === 1
    && BASE_ROUND_FIELDS.includes("removesTraits"));
  ok("I6 from the whole base document", /const source = await pack\.getDocument\(chosenBase\.id\)/.test(BUILDER_WF) && /base: baseRoundProperties\(source\?\.system\),/.test(BUILDER_WF));
  const template = JSON.parse(read("template.json"));
  ok("I7 ammunition has a runes field to keep them in", Object.hasOwn(template.Item.ammunition, "runes"));
}

/* J — the specific weapons */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "specific-items"), { valueEncoding: "json" });
await db.open({ readOnly: true });
const specific = new Map();
for await (const [key, value] of db.iterator()) if (key.startsWith("!items!")) specific.set(value.name, value);
await db.close();
{
  for (const [name, plan] of Object.entries(SPECIFIC)) {
    const item = specific.get(name);
    ok(`J1 ${name}: bare dice, a real damage type and size, and the base weapon's fumble DC (R14)`,
      Object.entries(plan.system).every(([field, to]) => JSON.stringify(item?.system?.[field]) === JSON.stringify(to)),
      JSON.stringify(Object.fromEntries(Object.keys(plan.system).map((f) => [f, item?.system?.[f]]))));
  }
  ok("J2 the base weapons' fumble DCs (Mattock 18, Scimitar 8, Morning Star 16)",
    specific.get("Da Big Itter")?.system.fumbleDC === 18 && specific.get("Flametooth")?.system.fumbleDC === 8 && specific.get("Scourge of the Unlife")?.system.fumbleDC === 16);
  ok("J3 Flametooth is cold iron, and its flames always on", specific.get("Flametooth")?.system.material === "coldIron"
    && specific.get("Flametooth")?.flags?.["trg-prime"]?.specificItem?.alwaysActive?.includes("flaming"));
  ok("J4 Scourge keeps AR 2", specific.get("Scourge of the Unlife")?.system.armourRending === 2);
  ok("J5 R15 — Da Big Itter's critical casts Fear (DC 20) for 1 AP",
    JSON.stringify(specific.get("Da Big Itter")?.flags?.["trg-prime"]?.specificItem?.onCritical) === JSON.stringify({ spell: "Fear", dc: 20, ap: 1 }));
  ok("J6 offered on its critical, cast at the printed DC",
    /if \(critical\) \{\s*const castLine = await offerCriticalSpell\(actor, weapon, targetActor\);/.test(ATTACK)
    && /fixedDC: Number\(spec\.dc\) \|\| null/.test(RUNE_WF)
    && /const saveDC = Number\(fixedDC\) > 0 \? \{ dc: Number\(fixedDC\), source: "printed on the item" \} : consumableSaveDC\(/.test(CONSUMABLE_WF));
  const repairs = PACK_REPAIRS.filter((r) => r.since === "3.618.0");
  ok("J7 owned copies are repaired field by field, to what the pack holds",
    repairs.length === 16 && repairs.every((r) => JSON.stringify(specific.get(r.name)?.system?.[r.field]) === JSON.stringify(r.to)));
}

/* K — the rune data and pack */
{
  ok("K1 A9 — no weapon rune is still tagged a note", WEAPON_RUNES.every((r) => r.automation !== "note"));
  ok("K2 Life Stealing says Soul Drain, not negative levels", /Soul Drain/.test(WEAPON_RUNES.find((r) => r.key === "lifeStealing").effect)
    && !/negative level/.test(WEAPON_RUNES.find((r) => r.key === "lifeStealing").effect));
  ok("K3 Potency names its damage", /\+1 damage per tier/.test(WEAPON_RUNES.find((r) => r.key === "potency").effect));
  const runes = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "runes"), { valueEncoding: "json" });
  await runes.open({ readOnly: true });
  const pack = [];
  for await (const [key, value] of runes.iterator()) if (key.startsWith("!items!")) pack.push(value);
  await runes.close();
  const weaponRunes = pack.filter((i) => (i.flags?.["trg-prime"]?.rune?.on ?? []).includes("weapon") && i.flags["trg-prime"].rune.key !== "potency");
  ok("K4 the pack's notes are the data's", Object.entries(RUNE_NOTES).every(([key, [, to]]) =>
    pack.filter((i) => i.flags?.["trg-prime"]?.rune?.key === key).every((i) => String(i.system.description).includes(to))));
  ok("K5 Disrupting says essence and Life Stealing recurring", Object.entries(RUNE_TEXT).every(([name, fixes]) =>
    fixes.every(([, to]) => String(pack.find((i) => i.name === name)?.system?.description ?? "").includes(to))));
  ok("K6 and no weapon rune in the pack is tagged a note", weaponRunes.length > 20
    && weaponRunes.filter((i) => ["acidic", "aligned", "bane", "called", "courageous", "disrupting", "flaming", "frost", "ghostTouch", "lifeStealing", "razor", "returning", "shifting", "shock", "thundering", "vicious"].includes(i.flags["trg-prime"].rune.key))
      .every((i) => i.flags["trg-prime"].rune.automation !== "note"));
}

/* M — the 3.618.0 drive (3.618.1) */
{
  ok("M1 G1 — the Activate card knows its energy", runeActionsFor(sword("Potency I, Shock I"))[0]?.energy === "electricity");
  ok("M2 G2 — a natural attack is no Shifting form",
    shiftableForms([{ name: "Claw", size: "medium", natural: true }, { name: "Mace", size: "medium" }], { fromSize: "medium" }).map((f) => f.name).join() === "Mace"
    && /natural: Boolean\(entry\.system\?\.natural\)/.test(ACTIONS_WF));
  ok("M3 F2 — the weapon casts its spell with no components, and the AP is spent only on a casting",
    /source\.system\.components = \{ somatic: false, verbal: false, material: false, focus: false \};/.test(RUNE_WF)
    && /if \(released\?\.cast\) await spendActionPoints\(actor, ap, label\);/.test(RUNE_WF)
    && !/payRuneActivation/.test(RUNE_WF));
}

/* N — an "Incorporeal" ability is the trait (3.618.1; F1, Graham's Q1) */
{
  const { abilityGrantedTraits, isIncorporeal } = await import("../module/codex-trait-rules.mjs");
  const ACTOR = strip(read("module", "documents", "actor.mjs"));
  ok("N1 an Incorporeal ability item grants the trait; another ability, or a feat of that name, does not",
    abilityGrantedTraits([{ type: "ability", name: "Incorporeal" }]).join() === "incorporeal"
    && abilityGrantedTraits([{ type: "ability", name: "Essence Touch" }, { type: "feat", name: "Incorporeal" }]).length === 0);
  ok("N2 through the derived field every Incorporeal rule reads",
    /const fromAbilities = abilityGrantedTraits\(Array\.from\(actor\?\.items \?\? \[\]\)\);/.test(ACTOR)
    && /\.\.\.fromAspects, \.\.\.fromAbilities\]/.test(ACTOR)
    && isIncorporeal({ details: { traits: "", grantedTraits: "incorporeal" } }));
}

/* L — the version */
{
  const sys = JSON.parse(read("system.json"));
  const gate = /runIf\("(\d+\.\d+\.\d+)", "stale owned copies/.exec(read("module", "migration.mjs"))?.[1];
  const atLeast = (v) => /^\d+\.\d+\.\d+$/.test(String(v ?? "")) && String(v).localeCompare("3.618.0", undefined, { numeric: true }) >= 0;
  ok("L1 the version, schema and gate are 3.618.0 or later; the schema never leads",
    atLeast(sys.version) && atLeast(TRG_SCHEMA_VERSION) && atLeast(gate) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0);
}

if (failures.length) {
  console.log(`verify-block37-weapons: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block37-weapons: OK — ${checks} checks. Potency's damage and HP, energy runes switched on, secondary criticals on criticals, essence, Aligned and Bane rolled, usage enforced, Called, Shifting, Returning, Life Stealing, Ghost Touch, Vicious, runed ammunition and the specific weapons.`);
