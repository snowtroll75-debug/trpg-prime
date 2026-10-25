#!/usr/bin/env node
/**
 * verify-block4-core — TRG Prime 3.668.0: the core half of Inner Tempest
 * Block 4 (the Ghostwalker, the Kensai, the Oathblade). Graham's rulings
 * B4-1 to B4-4, 23 October 2026; the audit's C1 to C9.
 *
 *   A  scaled values (C2): "class bonus -1", "+1 per 2 Int (min +1)",
 *      "2 x Int", "Int x5", on conditionals and stat rows
 *   B  the weapon-group and range-band scopes (C1), on the attack and its damage
 *   C  a defence row against everyone but one creature (C3)
 *   D  Armour Rending by declaration (C4)
 *   E  ambush dice (C5, Unseen Assault) and who left a target flat-footed
 *   F  Strike options (C9): considered flanked, treated as flat-footed, a
 *      stance's bonuses ignored; a group's trait; reaction-attack penalty (C8)
 *   G  the module helper for Flow Strike's penalty
 *   H  a blow held (Black Lotus), and landed
 *   I  the target's state (flat-footed, isolated, in a duel); half damage
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));
const cd = await imp("conditionals.mjs");
const sr = await imp("stat-rows.mjs");
const dd = await imp("combat/defence-dc.mjs");
const rend = await imp("combat/declared-rending.mjs");
const amb = await imp("combat/ambush-dice.mjs");
const so = await imp("combat/strike-options.mjs");
const atk = await imp("combat/attack.mjs");
const aw = read("module", "combat", "attack-workflow.mjs");

/* A — scaled values */
const S = { classBonus: 3, level: 7, halfLevel: 3, intelligence: 3, wisdom: 1 };
equal("A1 the arithmetic forms", ["classBonus-1", "intelligence/2", "intelligence*2", "intelligence*5", "intelligence+2"].map((f) => cd.scaledFigure(f, S)), [2, 1, 6, 15, 5]);
equal("A2 the older forms stand", [cd.scaledFigure("classBonus", S), cd.scaledFigure("intelligence-wisdom", S)], [3, 2]);
equal("A3 an unknown figure, or division by zero, is nothing", [cd.scaledFigure("nope*2", S), cd.scaledFigure("intelligence/0", S)], [null, null]);
const half = (int) => cd.normaliseConditional({ kind: "modifier", valueFrom: "intelligence/2", valueMin: 1, type: "class", label: "Flickering Flame", auto: true, when: { checkTypes: ["save"], subjects: ["reflex"] } }, { name: "F" }, 0, { intelligence: int })?.value;
equal("A4 '+1 per 2 Int mod (min +1)': 1 at Int 0 and 1, 2 at Int 4", [half(0), half(1), half(4)], [1, 1, 2]);
equal("A5 a stat row reads the same grammar (Echoing Crane, Iron Tortoise)", [
  sr.statRowValue({ valueFrom: "classBonus-1" }, { classBonus: 4 }),
  sr.statRowValue({ valueFrom: "intelligence/2", valueMin: 1 }, { attributes: { intelligence: { total: 1 } } }),
  sr.statRowValue({ value: 2 }, {})], [3, 1, 2]);
ok("A6 the actor hands its class bonus to the stat rows", /classBonus: Number\(actor\.system\?\.identity\?\.classBonus \?\? 0\),/.test(read("module", "documents", "actor.mjs")));

/* B — the weapon-group and range-band scopes */
ok("B1 both scopes are declared, with their context keys",
  cd.SCOPE_AXES.includes("attackGroups") && cd.AXIS_CONTEXT_KEYS.attackGroups === "attackGroup"
  && cd.SCOPE_AXES.includes("rangeBands") && cd.AXIS_CONTEXT_KEYS.rangeBands === "rangeBand");
const wd = cd.normaliseConditional({ kind: "modifier", valueFrom: "classBonus-1", type: "untyped", label: "Weapon Discipline", auto: true, when: { checkTypes: ["attack"], attackGroups: ["sword"] } }, { name: "WD" }, 0, { classBonus: 3 });
equal("B2 Weapon Discipline (B4-2: untyped) matches its group only", [wd?.value, wd?.type, cd.matchesCheck(wd, { checkType: "attack", attackGroup: "Sword" }), cd.matchesCheck(wd, { checkType: "attack", attackGroup: "axe" }), cd.matchesCheck(wd, { checkType: "attack" })], [2, "untyped", true, false, false]);
equal("B3 the range band", [
  atk.rangeBandOf({ isRanged: false, distance: 5 }), atk.rangeBandOf({ isRanged: false, distance: 10 }),
  atk.rangeBandOf({ isRanged: true, distance: 60, rangeIncrement: 60 }), atk.rangeBandOf({ isRanged: true, distance: 70, rangeIncrement: 60 }),
  atk.rangeBandOf({ isRanged: true, distance: null, rangeIncrement: 60 })], ["adjacent", "reach", "first", "far", ""]);
const config = aw.slice(aw.indexOf("  const attackCheckConfig = {"), aw.indexOf("  let check = await TRGCheck.roll(attackCheckConfig);"));
ok("B4 the attack says its group and band", /\n    attackGroup: String\(weaponData\.group \?\? ""\)\.trim\(\)\.toLowerCase\(\),\n/.test(config) && /\n    rangeBand: rangeBandOf\(\{ isRanged, distance: distanceToTarget, rangeIncrement \}\),\n/.test(config));
const ck = read("module", "dice", "check.mjs");
ok("B5 the check stores both and hands them on", /this\.attackGroup = config\.attackGroup \?\? "";/.test(ck) && /this\.rangeBand = config\.rangeBand \?\? "";/.test(ck) && /attackGroup: check\.attackGroup,\n\s*rangeBand: check\.rangeBand,?\n/.test(ck));
ok("B6 the damage's bonuses see the same facts (Challenge's damage, Weapon Discipline's)",
  /const declaredDamage = await declaredDamageBonus\(actor, weapon, \{\s*skipPrompt: skipDialog\(event\),[\s\S]{0,120}context: \{\s*targetUuid: attackCheckConfig\.targetUuid,[\s\S]{0,300}attackGroup: attackCheckConfig\.attackGroup,\s*rangeBand: attackCheckConfig\.rangeBand,\s*targetStates: attackCheckConfig\.targetStates\s*\}/.test(aw)
  && /const rows = damageConditionalRows\(entries, \{ \.\.\.context, traits:/.test(read("module", "combat", "damage-conditionals-workflow.mjs")));

/* C — everyone but one */
const challenge = dd.normaliseDefenceDC({ dc: "defence", value: -2, label: "Challenge", not: { sourceUuids: ["Actor.T"] } }, { name: "Challenge" });
ok("C1 a row excluding one creature is scoped enough", Boolean(challenge) && challenge.notSourceUuids.join() === "Actor.T");
const dds = read("module", "combat", "defence-dc.mjs");
ok("C2 the excluded creature meets nothing; everyone else meets it", /if \(\(entry\.notSourceUuids \?\? \[\]\)\.length && entry\.notSourceUuids\.includes\(uuid\)\) return false;/.test(dds));
ok("C3 a row a stance gives says so", /fromStance: Boolean\(stanceGated \|\| fromStance\),/.test(dds) && /\{ fromStance: stanceEffects\.has\(document\) \}/.test(dds));

/* D — Armour Rending by declaration */
const carriers = [{ id: "e1", name: "Challenge", documentName: "ActiveEffect", flags: { "trg-prime": { strikeRending: [{ valueFrom: "classBonus", label: "Challenge", when: { targetUuids: ["Actor.T"], attackModes: ["melee"] } }, { value: 2, label: "Retribution", oneShot: true, when: { targetUuids: ["Actor.T"] } }] } } }, { id: "x", name: "Unscoped", flags: { "trg-prime": { strikeRending: { value: 5 } } } }];
const rows = rend.declaredRendingRows(carriers, { classBonus: 3 });
equal("D1 rows read with the actor's figures; an unscoped one is refused", rows.map((r) => [r.label, r.value]), [["Challenge", 3], ["Retribution", 2]]);
const atT = rend.declaredRending(rows, { targetUuid: "Actor.T", attackMode: "melee" });
equal("D2 against the challenged target: both, and the one-shot is spent", [atT.total, atT.spent.map((x) => x.sourceId)], [5, ["e1"]]);
equal("D3 against anyone else, or at range, less", [rend.declaredRending(rows, { targetUuid: "Actor.U", attackMode: "melee" }).total, rend.declaredRending(rows, { targetUuid: "Actor.T", attackMode: "ranged" }).total], [0, 2]);
ok("D4 the Strike adds it to the weapon's own AR, with a line", /\) \+ Math\.max\(0, Number\(declaredRending\) \|\| 0\);/.test(aw) && /declaredRending: rending\.total \+ ambushAR,/.test(aw) && /added to the weapon's Armour Rending/.test(aw));

/* E — ambush dice */
const UA = { flags: { "trg-prime": { ambushDice: { label: "Unseen Assault", die: "d6", oncePerRound: true, byLevel: [{ level: 1, count: 1 }, { level: 5, count: 2 }, { level: 9, count: 3 }, { level: 13, count: 4 }, { level: 17, count: 5 }] } } } };
const decl = amb.declaredAmbush([UA]);
equal("E1 1d6, +1d6 at 5th and every 4 levels after", [1, 4, 5, 9, 13, 17, 20].map((l) => amb.ambushDiceCount(decl, l)), [1, 1, 2, 3, 4, 5, 5]);
equal("E2 the weapon half", [
  amb.ambushWeaponEligible({ traits: "Agile" }), amb.ambushWeaponEligible({ traits: "Finesse" }), amb.ambushWeaponEligible({ traits: "Versatile (P)" }),
  amb.ambushWeaponEligible({ isThrown: true }), amb.ambushWeaponEligible({ isRanged: true, rangeBand: "first" }), amb.ambushWeaponEligible({ isRanged: true, rangeBand: "far" })],
  [true, true, false, true, true, false]);
equal("E3 B4-3: hidden or your own Feint automatic; another cause asked; flanking alone nothing", [
  amb.ambushCause({ flatFootedBy: "hidden" }), amb.ambushCause({ targetFlatFooted: true, fromOwnAbility: true }),
  amb.ambushCause({ targetFlatFooted: true }), amb.ambushCause({ otherwiseFlatFooted: true }), amb.ambushCause({})], ["auto", "auto", "ask", "ask", null]);
const extras = [{ label: "Ghost Blade", ar: [{ level: 6, value: 1 }, { level: 12, value: 2 }, { level: 18, value: 3 }] }, { label: "Ambusher's Patience", dice: 2, whenUndetected: true, oncePerCreature: true }];
const e12 = amb.ambushExtrasFor(extras, { level: 12, undetected: true });
equal("E4 the extras: AR by level, extra dice when undetected, once per creature", [e12.ar, e12.dice, e12.spendsCreature, amb.ambushExtrasFor(extras, { level: 12, undetected: true, alreadyAmbushed: true }).dice, amb.ambushExtrasFor(extras, { level: 5, undetected: false }).asks.length], [2, 2, true, 0, 1]);
ok("E5 once per round, by combat and round", amb.ambushRoundKey("c1", 3) === "c1:3" && amb.ambushRoundKey("", 0) === null && /const usedThisRound = ambushDeclared\.oncePerRound && roundKey && actor\.getFlag\?\.\(SYSTEM_ID, "ambushRound"\) === roundKey;/.test(aw));
ok("E6 the dice join the precision dice under their own name, and are announced after the damage",
  /precisionDice: precisionDice \+ compoundPrecision \+ ambushDice,/.test(aw) && /ambushDice \? \{ dice: ambushDice, label: ambush\.declared\.label,/.test(aw) && /Hooks\.callAll\("trgPrimeAmbushDealt", \{ actor, target: targetActor, weapon, dice: ambushDice, label: ambush\.declared\.label \}\);/.test(aw));
ok("E7 a cause that needs a person is asked on the hit, never with Shift", /let take = ambush\.cause === "auto";\s*if \(!take && !skipDialog\(event\) && DialogV2\) \{/.test(aw));
ok("E8 a Feint or a Diversion that lands records who left the target flat-footed", /if \(\["feint", "createADiversion"\]\.includes\(action\.key\) && targetActor\?\.hasCondition\?\.\("flatFooted"\) && targetActor\.setFlag\) \{\s*await targetActor\.setFlag\(SYSTEM_ID, "flatFootedFrom", \{ uuid: actor\.uuid,/.test(read("module", "combat", "action-workflow.mjs")));

/* F — Strike options, the group trait, the reaction penalty */
equal("F1 considered flanked: the flanking bonus unless flanked already or unflankable", [
  so.treatedFlankingRow({ bonus: 2, label: "Shadowy Step" })?.value, so.treatedFlankingRow({ alreadyFlanking: true }), so.treatedFlankingRow({ cannotBeFlanked: true })], [2, null, null]);
equal("F2 treated as flat-footed: the Dexterity and dodge it would lose", [
  so.flatFootedLoss({ ability: 3, breakdown: { byType: { dodge: 2 } } }), so.treatedFlatFootedRow({ loses: 5 })?.value, so.treatedFlatFootedRow({ alreadyFlatFooted: true, loses: 5 })], [5, 5, null]);
const ignored = so.stanceDefenceOf({
  breakdown: [{ label: "Iron Tortoise", value: 2, applied: true, source: "statRow", carrierUuid: "A.E1" }, { label: "Echoing Crane", value: 3, applied: true, source: "A.E2" }, { label: "Armour", value: 4, applied: true, source: "sheet" }, { label: "Old", value: 1, applied: false, source: "A.E1" }],
  stanceUuids: ["A.E1", "A.E2"], dcEntries: [{ label: "Stance row", value: 1, fromStance: true }, { label: "Ward", value: 2 }] });
equal("F3 a stance's DB, ignored: its own changes, its stat rows and its stance rows, and nothing else", ignored.total, 6);
equal("F4 a group's trait, one-handed only", [
  so.traitsWithGroupGrants("Versatile (P)", [{ flags: { "trg-prime": { weaponTraitGrants: [{ groups: ["sword"], trait: "Finesse", oneHanded: true }] } } }], { group: "Sword", oneHanded: true }),
  so.traitsWithGroupGrants("Versatile (P)", [{ flags: { "trg-prime": { weaponTraitGrants: [{ groups: ["sword"], trait: "Finesse", oneHanded: true }] } } }], { group: "Sword", oneHanded: false })], ["Versatile (P), Finesse", "Versatile (P)"]);
equal("F5 a reaction-attack penalty", so.reactionAttackPenaltyRows([{ name: "Flickering Flame", flags: { "trg-prime": { reactionAttackPenalty: { value: -5 } } } }, { name: "Off", disabled: true, flags: { "trg-prime": { reactionAttackPenalty: { value: -5 } } } }]).map((r) => r.value), [-5]);
ok("F6 the Strike takes the three options, the group trait and the reaction penalty",
  /  treatAsFlanked = false,\n  treatAsFlatFooted = false,\n  ignoreTargetStance = false,/.test(aw)
  && /if \(treatAsFlatFooted && targetActor\) \{/.test(aw) && /if \(treatAsFlanked && !isRanged\) \{/.test(aw) && /if \(ignoreTargetStance && targetActor\) \{/.test(aw)
  && /const groupTraits = traitsWithGroupGrants\(ammoData\.traits,/.test(aw) && /if \(isReaction && targetActor\) \{\s*const \{ reactionAttackPenaltyRows \}/.test(aw));
ok("F7 treated as flat-footed counts for Sneak Attack; considered flanked too", /\|\| Boolean\(conditionTerms\?\.flatFootedBy\) \|\| Boolean\(treatAsFlatFooted\),/.test(aw) && /let targetFlanked = Boolean\(flankingAlly\) \|\| \(treatAsFlanked && !isRanged && !targetCannotBeFlanked\);/.test(aw));

/* G — the helper */
ok("G1 modules get the multiple attack penalty at an attack number", /mapPenalty: async \(actor, weapon, index\) => \{/.test(read("module", "module-api-workflow.mjs")));
equal("G2 the third Strike: -10, -8 agile, -6 with Agile Strikes", [atk.mapPenalty(2, false), atk.mapPenalty(2, true), atk.mapPenalty(2, true, true)], [-10, -8, -6]);

/* H — a blow held (Black Lotus; Graham's ruling of 23 October 2026) */
const hs = await imp("combat/held-strike.mjs");
const rec = hs.heldStrikeRecord({ weaponId: "w", targetUuid: "Actor.T", critical: "minor", label: "Black Lotus", combatId: "c1", round: 2 });
equal("H1 the record", [rec.weaponId, rec.targetUuid, rec.critical, rec.label], ["w", "Actor.T", "minor", "Black Lotus"]);
equal("H2 due when its target's turn starts, in its own combat", [hs.heldStrikeDue(rec, { actorUuid: "Actor.T", combatId: "c1" }), hs.heldStrikeDue(rec, { actorUuid: "Actor.U", combatId: "c1" }), hs.heldStrikeDue(rec, { actorUuid: "Actor.T", combatId: "c2" })], [true, false, false]);
ok("H3 a held hit rolls no critical and no damage now, and records itself",
  /const held = Boolean\(holdDamage\) && strikeLands && outcome\.hits && Boolean\(targetActor\);/.test(aw)
  && /\n  if \(!held\) \{\n    if \(strikeLands && outcome\.critical && !outcome\.critical\.injuryImmune && targetActor(?: && !noReactions)?\) \{[\s\S]{0,800}\n    if \(strikeLands && outcome\.critical && !outcome\.critical\.injuryImmune && !injuryReplaced && !noCriticalInjury\) \{/.test(aw)
  && /if \(outcome\.hits && strikeLands && !held\) \{/.test(aw) && /await actor\.setFlag\(SYSTEM_ID, "heldStrike", record\);/.test(aw));
const hsSrc = read("module", "combat", "held-strike.mjs");
ok("H4 landing: the critical first, then the damage set to that hit, against that target, without a dialog",
  /if \(record\.critical\) \{\s*const injury = await rollCriticalInjury\(actor, \{/.test(hsSrc) && /await rollWeaponDamage\(actor, weapon, \{\s*preset: \{/.test(hsSrc)
  && /const result = preset \? \{/.test(aw) && /\.\.\.\(preset\?\.targetToken \? \{ targetTokenOverride: preset\.targetToken \} : \{\}\),/.test(aw));
ok("H5 the record is cleared when it lands, and modules can land it", /await actor\.unsetFlag\(SYSTEM_ID, "heldStrike"\);/.test(hsSrc) && /landHeldStrike: async \(actor\) =>/.test(read("module", "module-api-workflow.mjs")));

/* I — the target's state; half damage from the preset */
ok("I1 the target-state scope is declared, a list like the target's traits", cd.SCOPE_AXES.includes("targetStates") && cd.AXIS_CONTEXT_KEYS.targetStates === "targetStates");
equal("I2 the states", [so.targetStatesOf({ flatFooted: true, targetAlliesAdjacent: false, attackerAlliesAdjacent: false }), so.targetStatesOf({ targetAlliesAdjacent: true, attackerAlliesAdjacent: null })], [["flatfooted", "isolated", "duel"], []]);
const wolf = cd.normaliseConditional({ kind: "modifier", value: 1, type: "class", label: "Dread Wolf", auto: true, when: { checkTypes: ["attack"], targetStates: ["isolated"] } }, { name: "DW" });
equal("I3 a row scoped to a state matches it only", [cd.matchesCheck(wolf, { checkType: "attack", targetStates: ["isolated", "flatfooted"] }), cd.matchesCheck(wolf, { checkType: "attack", targetStates: ["duel"] }), cd.matchesCheck(wolf, { checkType: "attack" })], [true, false, false]);
ok("I4 the Strike reads the states off the board and hands them to the check and the damage",
  /const targetStates = targetActor \? targetStatesOf\(\{/.test(aw) && /\n    targetStates,\n/.test(config) && (aw.match(/targetStates: attackCheckConfig\.targetStates/g) ?? []).length === 2 && /targetStates: check\.targetStates,?\n/.test(ck));
ok("I5 a preset may halve the damage", /glancing: Boolean\(preset\.glancing\),/.test(aw));

/* J — a Strike resolved, announced */
ok("J1 the Strike announces itself resolved, after the damage, with the hit, the critical, melee or not, and whether it was held",
  /Hooks\.callAll\("trgPrimeStrikeResolved", \{\s*attacker: actor, target: targetActor, weapon,\s*hits: Boolean\(outcome\?\.hits\) && strikeLands, critical: outcome\?\.critical\?\.severity \?\? null,\s*melee: !isRanged,/.test(aw)
  && aw.indexOf('Hooks.callAll("trgPrimeStrikeResolved"') > aw.indexOf("await consumeOneAttackEffects(targetActor"));

/* K — what Inner Tempest 0.5.0's automations needed besides (found writing them) */
const apiSrc = read("module", "module-api-workflow.mjs");
ok("K1 modules can roll a Strike's damage without its attack (Steel Viper's half damage)", /rollWeaponDamage: async \(actor, weapon, options = \{\}\) => \(await import\("\.\/combat\/attack-workflow\.mjs"\)\)\.rollWeaponDamage\(actor, weapon, options\),/.test(apiSrc) && /export async function rollWeaponDamage\(actor, weapon, \{ preset = null \} = \{\}\)/.test(aw));
ok("K2 …and ask the trait rules quietly (Flow Strike, offered after every hit)", /traitCheck: async \(\.\.\.args\) => \(await import\("\.\/traits-workflow\.mjs"\)\)\.traitCheck\(\.\.\.args\),/.test(apiSrc));
const fw = read("module", "feats-workflow.mjs");
ok("K3 a stance may be entered at once when a rule says so (Form Reversal), the wait waived and nothing else",
  /async function enterFeatStance\(actor, item, \{ name, apCost = 1, description, changes = \[\], stanceActionMods = null, extraLines = \[\], flags = null, waiveWait = false \}\)/.test(fw)
  && /if \(!waiveWait && round !== null && lastStance !== null && round <= lastStance\) \{/.test(fw)
  && /if \(round !== null\) await actor\.setFlag\(SYSTEM_ID, "lastStanceRound", stanceStamp\(\)\);/.test(fw));
const rid = await imp("magic/strike-riders.mjs");
const ember = rid.normaliseStrikeRider({ dice: "3", flat: true, damageType: "fire", scope: "any", label: "Ember Reaver", once: true, spendOnHit: true });
equal("K4 a flat rider (Ember Reaver's +Int fire) is accepted when it says so, and survives the round trip", [ember?.dice, ember?.flat, rid.normaliseStrikeRider(ember)?.dice, rid.normaliseStrikeRider(ember)?.flat], ["3", true, "3", true]);
equal("K5 …a bare number is still refused, and so is a flat zero or a formula", [rid.normaliseStrikeRider({ dice: "3", damageType: "fire" }), rid.normaliseStrikeRider({ dice: "0", flat: true, damageType: "fire" }), rid.normaliseStrikeRider({ dice: "1d6+1", flat: true, damageType: "fire" })], [null, null, null]);
equal("K6 …and a die is still a die", rid.normaliseStrikeRider({ dice: "1d6", damageType: "fire" })?.flat, undefined);

const EXPECTED = 54;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block4-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block4-core: ${checks} checks — all green.`);
