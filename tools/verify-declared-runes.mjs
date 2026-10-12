#!/usr/bin/env node
/**
 * verify-declared-runes — runes a companion module registers (3.626.0):
 * they join the catalogue (parsed, priced, written back), and what they
 * DECLARE is read where the core applies the same mechanism — typed
 * bonuses and offers, a sense, a weapon's own strike riders, ghost touch,
 * an after-strike save ladder, a critical-hit line, Merciful, Soul Ward,
 * a save reroll from a shield, and an Activate button with a Focus use.
 * Driven through the pure modules; the hooks into the workflows structural.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const api = await import(new URL("../module/module-api.mjs", import.meta.url));
const cat = await import(new URL("../module/rune-catalogue.mjs", import.meta.url));
const decl = await import(new URL("../module/rune-declarations.mjs", import.meta.url));
const effects = await import(new URL("../module/rune-effects.mjs", import.meta.url));
const senses = await import(new URL("../module/senses.mjs", import.meta.url));
const actions = await import(new URL("../module/rune-actions.mjs", import.meta.url));
const riders = await import(new URL("../module/magic/strike-riders.mjs", import.meta.url));

api.resetModuleRegistry();

/* A. Registration and the catalogue */
const registered = api.registerRunes([
  { key: "anchoredSoul", name: "Anchored Soul", traits: "Invested, Soul, Warding", on: ["armour"], level: 7, price: 3000, effect: "+2 item to saves against possession",
    declares: { conditionals: [{ kind: "modifier", value: 2, type: "item", label: "against possession and soul displacement", scope: "Saves against possession and effects that forcibly remove, control or displace your soul", when: { checkTypes: ["save"], traits: ["soul", "possession"] } }] } },
  { key: "sanctuary", name: "Sanctuary", on: ["armour", "shield"], level: 11, armourPrice: 11000, shieldPrice: 7700,
    declares: { action: { verb: "Engage", apCost: 1, frequency: "focus", durationSeconds: 60, describe: "A 10-foot sanctuary for 1 minute.", effect: { auras: [{ id: "sanctuary", kind: "ally", radius: 10 }] } } } },
  { key: "veilwatch", name: "Veilwatch", on: ["armour"], level: 7, price: 3000, declares: { sense: { category: "tertiary", modality: "", fixedFeet: 30, name: "Spirit Sense (Veilwatch)", finds: "spirits" } } },
  { key: "soulWard", name: "Soul Ward", on: ["armour"], level: 11, price: 11000, declares: { soulDrainReduce: { amount: 5, potencyIII: 10, frequency: "1/minute" } } },
  { key: "intercession", name: "Intercession", on: ["shield"], level: 9, price: 4200, declares: { saveReroll: { degrees: ["partial", "failure", "fumble", "blunder"], traits: ["fear", "possession", "soul"], radius: 10, ally: true, frequency: "daily" } } },
  { key: "requiem", name: "Requiem", on: ["weapon"], tiers: [{ tier: "I", level: 6, price: 1400, dice: "1d6" }, { tier: "II", level: 11, price: 8000, dice: "2d6" }, { tier: "III", level: 16, price: 60000, dice: "3d6" }],
    declares: { strikeRider: { damageType: "essence", targetTraits: ["undead", "unliving"], oncePerRound: true } } },
  { key: "exorcist", name: "Exorcist", on: ["weapon"], level: 10, price: 8000, declares: { ghostTouch: true } },
  { key: "merciful", name: "Merciful", on: ["weapon"], level: 5, price: 1250, declares: { stabiliseAtZero: true } },
  { key: "soulchain", name: "Soulchain", on: ["weapon"], level: 12, price: 11000, declares: { afterStrike: { save: "will", oncePerRound: true, outcomes: { critical: "Unaffected.", success: "No possession until your next turn.", failure: "Chained.", fumble: "Chained; a new save." }, conditions: {} } } },
  { key: "banishing", name: "Banishing", on: ["weapon"], level: 12, price: 11000, declares: { strikeRider: { dice: "2d6", damageType: "essence", onCritical: true, targetTypes: ["undead"], oncePerRound: true }, afterStrike: { save: "will", onCritical: true, oncePerRound: true, targetTypes: ["undead"], outcomes: { success: "No possession until your next turn.", failure: "No possession for 1 minute." } } } },
  { key: "remembrance", name: "Remembrance", on: ["weapon"], level: 7, price: 3000, declares: { onCritical: { text: "Recall Knowledge against the creature struck as a Free action." } } },
  { key: "bad", name: "", on: ["weapon"] }
], "pof");
equal("A1 eleven well-formed runes registered; the nameless one is refused with a problem", [registered, api.registrationProblems().length], [11, 1]);
equal("A2 registeredRunes filters by kind", [api.registeredRunes("shield").map((r) => r.key), api.registeredRunes("weapon").length], [["sanctuary", "intercession"], 6]);
const armour = cat.runesFor("armour");
const shield = cat.runesFor("shield");
const weapon = cat.runesFor("weapon");
ok("A3 the catalogue lists them after the books' own, on the kinds they go on", armour.some((r) => r.key === "anchoredSoul") && armour.some((r) => r.key === "sanctuary") && shield.some((r) => r.key === "intercession") && !shield.some((r) => r.key === "anchoredSoul") && weapon.some((r) => r.key === "requiem") && armour[armour.length - 1].key !== "potency");
equal("A4 a single-priced rune is one tier at its price; a two-priced one takes the kind's price", [armour.find((r) => r.key === "anchoredSoul").tiers.map((t) => [t.level, t.price]), armour.find((r) => r.key === "sanctuary").tiers[0].price, shield.find((r) => r.key === "sanctuary").tiers[0].price], [[[7, 3000]], 11000, 7700]);
equal("A5 a laddered rune keeps its three tiers, and runePrice reads the tier", [weapon.find((r) => r.key === "requiem").tiers.map((t) => t.tier), cat.runePrice("weapon", "requiem", 3)], [["I", "II", "III"], 60000]);
equal("A6 the field round-trips — written with the numeral, parsed back to the key and tier", [cat.runesToField("weapon", [{ key: "potency", tier: 3 }, { key: "requiem", tier: 2 }, { key: "exorcist", tier: 1 }]), cat.fieldToRunes("weapon", "Potency III, Requiem II, Exorcist").map((r) => `${r.key}:${r.tier}`)], ["Potency III, Requiem II, Exorcist", ["potency:3", "requiem:2", "exorcist:1"]]);
ok("A7 a registered single rune is not read as the Spell Effect shape", !armour.find((r) => r.key === "anchoredSoul").spell);

/* B. Declarations off an item */
const item = (type, name, runes, extra = {}) => ({ id: `${name}-id`, type, name, system: { runes, equipped: true, quality: "expert", ...extra }, flags: {} });
const coat = item("armour", "Vigil Coat", "Potency II, Anchored Soul, Veilwatch");
const bonuses = decl.runeDeclaredBonuses(coat, [coat]);
equal("B1 a worn armour's declared conditional is offered, labelled by item and rune", [bonuses.conditionals.length, bonuses.conditionals[0].label, bonuses.conditionals[0].when.traits], [1, "Vigil Coat (Anchored Soul) — against possession and soul displacement", ["soul", "possession"]]);
equal("B2 …and nothing from an unequipped one", decl.runeDeclaredBonuses({ ...coat, system: { ...coat.system, equipped: false } }, []).conditionals.length, 0);
ok("B3 the actor-level gather includes the declared offer beside the core runes'", effects.runeBonusesForActor([coat]).conditionals.some((c) => /Anchored Soul/.test(c.label)));
const sensed = senses.sensesOf([coat], 0);
equal("B4 Veilwatch grants a 30-foot tertiary Spirit Sense while worn", [sensed.length, sensed[0]?.name, sensed[0]?.rangeFeet, sensed[0]?.category], [1, "Spirit Sense (Veilwatch)", 30, "tertiary"]);
equal("B5 …not while packed", senses.sensesOf([{ ...coat, system: { ...coat.system, equipped: false } }], 0).length, 0);
equal("B6 runeSenses names its source", decl.runeSenses([coat]).map((r) => r.source), ["Vigil Coat (Veilwatch)"]);

/* C. The weapon's own riders and gates */
const scythe = item("weapon", "Grove Scythe", "Potency III, Requiem II, Exorcist, Soulchain", { attackMode: "melee", category: "polearm" });
const specs = decl.runeStrikeRiderSpecs(scythe);
equal("C1 Requiem II declares 2d6 essence, bound to this weapon by name and keyed by rune and item", [specs.length, specs[0].dice, specs[0].damageType, specs[0].weaponNames, specs[0].id, specs[0].targetTraits, specs[0].oncePerRound], [1, "2d6", "essence", ["Grove Scythe"], "rune:requiem:Grove Scythe-id", ["undead", "unliving"], true]);
const normalised = riders.normaliseStrikeRider(specs[0]);
normalised.id = specs[0].id;
equal("C2 the spec normalises with the trait gate intact and never spent", [normalised.targetTraits, normalised.once, normalised.oncePerRound], [["undead", "unliving"], false, true]);
ok("C3 the trait gate holds on a creature carrying the trait (a creature TYPE is among its traits — creature-traits.mjs), not otherwise; a type-gated rider still answers the type", riders.riderGatesHold(normalised, { targetTraits: ["unliving"] }) && riders.riderGatesHold(normalised, { targetTypes: ["undead"], targetTraits: ["undead"] }) && !riders.riderGatesHold(normalised, { targetTypes: ["undead"], targetTraits: [] }) && !riders.riderGatesHold(normalised, { targetTypes: ["humanoid"], targetTraits: ["evil"] }) && riders.riderGatesHold(riders.normaliseStrikeRider({ dice: "1d6", damageType: "fire", targetTypes: ["undead"] }), { targetTypes: ["undead"], targetTraits: [] }));
ok("C4 the gate text names both axes", /undead or unliving/.test(riders.riderGateText(normalised)));
const packets = riders.riderPacketsFor([normalised], { name: "Grove Scythe", attackMode: "melee", category: "polearm", traits: "", weaponId: "Grove Scythe-id", damage: "1d8", damageType: "slashing" }, { targetTraits: ["undead"], used: {} });
equal("C5 the packet fires against an undead and is a 2d6 essence packet", [packets.length, packets[0]?.dice, packets[0]?.type ?? packets[0]?.damageType], [1, "2d6", "essence"]);
equal("C6 …and a burnt marker keeps it out", riders.riderPacketsFor([normalised], { name: "Grove Scythe", attackMode: "melee", category: "polearm", traits: "", weaponId: "Grove Scythe-id" }, { targetTraits: ["undead"], used: { "rune:requiem:Grove Scythe-id": true } }).filter((p) => p.applies !== false).length, 0);
ok("C7 Exorcist is ghost touch; a weapon without it is not", decl.runeGhostTouch(scythe) && !decl.runeGhostTouch(item("weapon", "Club", "Potency I")));
equal("C8 Soulchain's after-strike save reads with its key and label", decl.runeAfterStrikes(scythe).map((a) => [a.key, a.label, a.save, a.oncePerRound]), [["soulchain", "Soulchain", "will", true]]);
const spear = item("weapon", "Waykeeper", "Potency III, Banishing, Remembrance");
equal("C9 Banishing declares both a critical-gated rider and a critical-gated save; Remembrance a line", [decl.runeStrikeRiderSpecs(spear).map((s) => [s.dice, s.onCritical]), decl.runeAfterStrikes(spear).map((a) => a.key), decl.runeCriticalLines(spear)], [[["2d6", true]], ["banishing"], ["Remembrance: Recall Knowledge against the creature struck as a Free action."]]);

/* D. The after-strike ladder */
const chain = decl.runeAfterStrikes(scythe)[0];
equal("D1 the printed line for a degree, with the neighbour read for a blank step", [decl.afterStrikeOutcome(chain, "failure").text, decl.afterStrikeOutcome(chain, "partial").text, decl.afterStrikeOutcome(chain, "heroic").text, decl.afterStrikeOutcome(chain, "blunder").text], ["Chained.", "Chained.", "Unaffected.", "Chained; a new save."]);
equal("D2 conditions for a degree, or none", decl.afterStrikeOutcome({ outcomes: {}, conditions: { failure: [{ key: "frightened", value: 2 }] } }, "failure").conditions, [{ key: "frightened", value: 2 }]);
const banish = decl.runeAfterStrikes(spear)[0];
const marker = decl.afterStrikeMarkerKey(banish, spear);
ok("D3 Banishing fires only on a critical against an undead, once a round", decl.afterStrikeFires(banish, { critical: true, targetTypes: ["undead"], marker, used: {} }) && !decl.afterStrikeFires(banish, { critical: false, targetTypes: ["undead"], marker, used: {} }) && !decl.afterStrikeFires(banish, { critical: true, targetTypes: ["humanoid"], marker, used: {} }) && !decl.afterStrikeFires(banish, { critical: true, targetTypes: ["undead"], marker, used: { [marker]: true } }));
equal("D4 the marker is keyed by rune and weapon", marker, "after:banishing:Waykeeper-id");

/* E. Merciful */
ok("E1 Merciful on the weapon, not on one without", decl.runeStabilisesAtZero(item("weapon", "Chain", "Potency II, Merciful")) && !decl.runeStabilisesAtZero(scythe));
ok("E2 it applies to a felled or killed creature with a Death State, not to a knock-out, a mere wound, or a construct", decl.mercifulApplies("reached-zero") && decl.mercifulApplies("massive-damage-death") && !decl.mercifulApplies("knocked-out") && !decl.mercifulApplies("reduced") && !decl.mercifulApplies("reached-zero", { noDeathState: true }));

/* F. Soul Ward and the use markers */
const plate = item("armour", "Sepulchre Plate", "Potency III, Soul Ward");
const ward = decl.soulDrainWard([plate], 1000);
equal("F1 Soul Ward turns 10 aside under Potency III, 5 under less", [ward?.reduce, decl.soulDrainWard([item("armour", "Mail", "Potency II, Soul Ward")], 1000)?.reduce], [10, 5]);
const markers = { usedToday: {}, usedAt: {} };
const fired = decl.runeUseUpdates(markers, "soulWard", "1/minute", 1000);
equal("F2 a once-a-minute use stamps the clock, and refuses within the minute, allows after it", [Object.keys(fired), decl.runeFrequencyAllows({ usedToday: {}, usedAt: fired.runeUsedAt }, "soulWard", "1/minute", 1030), decl.runeFrequencyAllows({ usedToday: {}, usedAt: fired.runeUsedAt }, "soulWard", "1/minute", 1061)], [["runeUsedAt"], false, true]);
const daily = decl.runeUseUpdates(markers, "lastVigil", "daily", 1000);
equal("F3 a daily use marks the day map, which only daily preparation clears", [Object.keys(daily), decl.runeFrequencyAllows({ usedToday: daily.runeUsedToday, usedAt: {} }, "lastVigil", "daily", 99999), decl.runeFrequencyAllows({ usedToday: {}, usedAt: {} }, "lastVigil", "daily", 0)], [["runeUsedToday"], false, true]);
equal("F4 at will writes nothing and always allows", [decl.runeUseUpdates(markers, "x", "atWill", 5), decl.runeFrequencyAllows(markers, "x", "atWill", 5)], [{}, true]);
equal("F5 the markers read off an item's flags", decl.runeMarkersOf({ flags: { "trg-prime": { runeUsedToday: { a: true }, runeUsedAt: { b: 7 } } } }), { usedToday: { a: true }, usedAt: { b: 7 } });
ok("F6 the ward is silent once used this minute", decl.soulDrainWard([{ ...plate, flags: { "trg-prime": { runeUsedAt: { soulWard: 990 } } } }], 1000) === null);

/* G. Save rerolls from a shield, and from a talisman */
const aegis = item("shield", "Reliquary Shield", "Potency II, Intercession");
const rerolls = decl.itemSaveRerolls(aegis, [aegis]);
equal("G1 Intercession reads as an ally's daily reroll within 10 feet, against the three triggers", rerolls.map((r) => [r.source, r.key, r.ally, r.radius, r.frequency, r.traits]), [["rune", "intercession", true, 10, "daily", ["fear", "possession", "soul"]]]);
const talisman = { id: "t", type: "consumable", name: "Soulguard Talisman", system: { equipped: true }, flags: { "trg-prime": { consumable: { saveReroll: { degrees: ["partial", "failure", "fumble", "blunder"], traits: ["possession", "soul drain", "soul"] } } } } };
equal("G2 a worn talisman is the saver's own, destroyed by use", decl.itemSaveRerolls(talisman).map((r) => [r.source, r.ally, r.destroy]), [["consumable", false, true]]);
equal("G3 …and not while packed", decl.itemSaveRerolls({ ...talisman, system: { equipped: false } }).length, 0);

/* H. The Activate button with a Focus use */
const planted = actions.runeActionsFor(item("shield", "Aegis", "Potency II, Sanctuary"));
equal("H1 Sanctuary is a declared Engage (1 AP) Focus action with a minute and an aura", [planted.length, planted[0]?.key, planted[0]?.verb, planted[0]?.apCost, planted[0]?.focus, planted[0]?.durationSeconds, planted[0]?.effect?.auras?.length, planted[0]?.declared], [1, "sanctuary", "Engage", 1, true, 60, 1, true]);
const aegisOn = { ...item("shield", "Aegis", "Potency II, Sanctuary"), flags: { "trg-prime": { runeState: { sanctuary: true } } } };
equal("H3 the action's aura is emitted from the item while its state is on, keyed by rune and item, and not otherwise", [decl.declaredRuneAuras(aegisOn).map((a) => [a.id, a.kind, a.radius]), decl.declaredRuneAuras(item("shield", "Aegis", "Potency II, Sanctuary")).length, decl.declaredRuneAuras({ ...aegisOn, system: { ...aegisOn.system, equipped: false } }).length], [[["rune-sanctuary-Aegis-id", "ally", 10]], 0, 0]);
ok("H2 an expended Focus rune reads as expended", actions.runeFocusExpended({ flags: { "trg-prime": { runeState: { focusExpended: { sanctuary: true } } } } }, "sanctuary") && !actions.runeFocusExpended({}, "sanctuary"));

/* I. Structural: the hooks */
const sw = read("module", "magic", "strike-riders-workflow.mjs");
ok("I1 the weapon's rune riders join the packets AND the burn — twice, once each", sw.includes("[...strikeRidersOn(actor).map((entry) => entry.spec), ...weaponRuneRiders(weapon), ...elementalStrikeRiders(actor, weapon)],") && sw.includes("ridersBurntBy([...strikeRidersOn(actor).map((entry) => entry.spec), ...weaponRuneRiders(weapon)]"));
const aw = read("module", "combat", "attack-workflow.mjs");
ok("I2 the attack path reads the trait gate, ghost touch, the after-strike and Merciful", /targetTraits: creatureTraits\(targetActor\?\.system \?\? \{\}\),/.test(aw) && /\|\| runeGhostTouch\(weapon\)/.test(aw) && /await applyRuneAfterStrikes\(actor, weapon, targetActor, \{ critical: Boolean\(critical\) \}\)/.test(aw) && /await offerMerciful\(actor, weapon, targetActor, damageResult\)/.test(aw));
const ea = read("module", "combat", "effect-application-workflow.mjs");
ok("I3 Soul Drain gained passes the ward before it combines", /const ward = soulDrainWard\(Array\.from\(actor\.items \?\? \[\]\), now\);[\s\S]{0,300}const kept = Math\.max\(0, incomingValue - ward\.reduce\);/.test(ea) && /combinedConditionValue\(tag\.key, existingValue, incomingValue\)/.test(ea));
const rf = read("module", "combat", "refocus-workflow.mjs");
ok("I4 Refocus restores an item's own expended Focus use", /if \(itemFocusExpended\(item\)\) return true;/.test(rf) && /focusExpended\.-=\$\{key\}/.test(rf));
const uw = read("module", "uses-workflow.mjs");
ok("I5 daily preparation clears the runes' day map", /RUNE_USED_TODAY_FLAG/.test(uw) && /unsetFlag\(SYSTEM_ID, RUNE_USED_TODAY_FLAG\)/.test(uw));
const ck = read("module", "dice", "check.mjs");
ok("I6 the save path asks the items after the spells, and only then", /const fromItem = await offerSaveRerollItems\(check\);/.test(ck) && ck.indexOf("offerSaveRerollItems") > ck.indexOf("offerSaveRerollSpells(check)"));
const ra = read("module", "rune-actions-workflow.mjs");
ok("I7 a declared action pays, spends its Focus, and rides the timer with its auras", /if \(action\.declared\) return useDeclaredRune\(actor, item, action\);/.test(ra) && /runeState\.focusExpended\.\$\{action\.key\}`\]: true/.test(ra) && /extraFlags: extra/.test(ra));
const rt = read("module", "rune-timers-workflow.mjs");
ok("I8 the timer effect carries the extra flags", /flags: \{ \[SYSTEM_ID\]: \{ \.\.\.\(extraFlags \?\? \{\}\), \.\.\.runeTimerFlags/.test(rt));
const ca = read("module", "creature-auras.mjs");
ok("I9 the aura gather reads a declared action's auras beside the codex rune's", /for \(const raw of declaredRuneAuras\(item\)\) \{/.test(ca));

api.resetModuleRegistry();
const EXPECTED = 50;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-declared-runes: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-declared-runes: ${checks} checks — all green.`);
