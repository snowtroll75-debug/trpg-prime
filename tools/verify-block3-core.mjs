#!/usr/bin/env node
/**
 * verify-block3-core — 3.667.0: the core changes Inner Tempest's Block 3
 * (the Disciple and the Mystic) needs, as ruled by Graham on 22 October
 * 2026 (B3-1 to B3-5; the module's docs/INNER_TEMPEST_BLOCK3_AUDIT.md).
 *
 *   A  a Defence or Speed row that holds only unarmoured or unencumbered
 *      (Disciple's Dodge, Incredible Movement, Serene Defence)
 *   B  trained fists: the die, Versatile B, total damage, what the blow
 *      counts as (Powerful Fists), and a Monastic weapon counting as unarmed
 *   C  a series of Strikes that meets DR once and rolls one critical injury
 *      (Flurry of Blows, Disciplined Flurry)
 *   D  a defender's conviction reroll of an attack (Alter the Thread)
 *   E  an innate spell's own PP allowance (the Mystic's grants, B3-2)
 *   F  applied damage announced (Flame Within, Dragon's Pulse)
 *   G  what a declared spell effect may carry; the helpers a module uses
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* A — stat rows ------------------------------------------------------ */
const sr = await mod("stat-rows.mjs");
const dodge = { name: "Disciple's Dodge", flags: { "trg-prime": { statBonuses: [{ target: "defence", type: "dodge", ability: "wisdom", when: { unarmoured: true, unencumbered: true } }] } } };
const movement = { name: "Incredible Movement", flags: { "trg-prime": { statBonuses: [{ target: "Speed", type: "status", byLevel: [{ level: 4, value: 10 }, { level: 10, value: 15 }, { level: 16, value: 20 }], when: { unarmoured: true } }] } } };
const rows = sr.declaredStatRows([dodge, movement, { name: "Off", disabled: true, flags: dodge.flags }, { name: "Elsewhere", flags: { "trg-prime": { statBonuses: [{ target: "initiative", value: 2 }] } } }]);
equal("A1 rows are read off items and enabled effects, by target, labelled by their carrier; an unknown target is ignored", rows.map((r) => [r.target, r.label]), [["defence", "Disciple's Dodge"], ["speed", "Incredible Movement"]]);
const state = { attributes: { wisdom: { total: 3 } }, level: 10 };
equal("A2 unarmoured and unencumbered: Wisdom as dodge to Defence, +15 status to land Speed at 10th", sr.statRowEntries(rows, state).map((e) => [e.path, e.entry.value, e.entry.type]), [["system.combat.defence", 3, "dodge"], ["system.combat.movement.land", 15, "status"]]);
equal("A3 in armour: neither", sr.statRowEntries(rows, { ...state, wearingArmour: true }), []);
equal("A4 encumbered: the dodge goes, the Speed stays", sr.statRowEntries(rows, { ...state, encumbered: true }).map((e) => e.path), ["system.combat.movement.land"]);
equal("A5 an ability below 0 gives 0, never a penalty; a level below the first step gives 0", [sr.statRowValue(rows[0], { attributes: { wisdom: { total: -2 } } }), sr.statRowValue(rows[1], { level: 3 }), sr.statRowValue({ value: 4 }, {})], [0, 0, 4]);
const actor = read("module", "documents", "actor.mjs");
ok("A6 the actor adds the Defence rows after armour and encumbrance are settled, into the dodge-filtered pool",
  /for \(const \{ path, entry \} of actorStatRowEntries\(actor\)\) \{\s*if \(path === "system\.combat\.defence"\) actor\.addBonus\(path, entry\);/.test(actor)
  && actor.indexOf("actorStatRowEntries(actor)") > actor.indexOf("actor._trgEncumbranceSteps = steps;"));
ok("A7 …and the Speed rows into the land pool", /if \(path === "system\.combat\.movement\.land"\) actor\.addBonus\(path, entry\);/.test(actor));
ok("A8 armour is an equipped armour item (a shield is its own type, carried, not worn); encumbered is any step",
  /wearingArmour: items\.some\(\(i\) => i\.type === "armour" && i\.system\?\.equipped\),/.test(actor)
  && /encumbered: Number\(actor\._trgEncumbranceSteps \?\? 0\) > 0 \|\| Boolean\(actor\._trgEncumbered\)/.test(actor));

/* B — trained fists -------------------------------------------------- */
const up = await mod("combat", "unarmed-profile.mjs");
const atk = await mod("combat", "attack.mjs");
const fistsRow = up.declaredUnarmedRows([{ name: "Powerful Fists", flags: { "trg-prime": { unarmedDamage: { die: "1d6", versatile: "B", perBAB: { every: 3, value: 1 }, countsAs: { magical: 3, "cold iron": 8, silver: 8, adamantine: 16 } } } } }]);
const FISTS = { natural: true, category: "unarmed", damageType: "subdual", damage: "1d4", traits: "" };
equal("B1 the fists: 1d6 and Versatile B at once", [up.unarmedProfile(FISTS, fistsRow, 0).damage, up.unarmedProfile(FISTS, fistsRow, 0).versatile], ["1d6", "B"]);
equal("B2 +1 total damage per 3 BAB; magical at 3; cold iron and silver at 8; adamantine at 16", [3, 8, 16].map((b) => { const p = up.unarmedProfile(FISTS, fistsRow, b); return [p.flat, p.magical, [...p.materials].sort()]; }), [[1, true, []], [2, true, ["cold iron", "silver"]], [5, true, ["adamantine", "cold iron", "silver"]]]);
equal("B3 a larger die is never shrunk (a 1d8 fist stays)", up.unarmedProfile({ ...FISTS, damage: "1d8" }, fistsRow, 0).damage, null);
equal("B4 a Monastic weapon counts as unarmed: its own die, the flat and the counts-as", (() => { const p = up.unarmedProfile({ category: "Simple", damageType: "piercing", damage: "1d4", traits: "Monastic" }, fistsRow, 3); return [p.damage, p.versatile, p.flat, p.magical]; })(), [null, null, 1, true]);
equal("B5 claws, bites and swords do not count", [up.countsAsUnarmed({ natural: true, category: "unarmed", damageType: "piercing" }), up.countsAsUnarmed({ category: "Martial", traits: "Versatile P" }), up.countsAsUnarmed({ unarmed: true }), up.countsAsUnarmed({ traits: "Agile, Monastic" })], [false, false, true, true]);
equal("B6 nothing declared, nothing changes", up.unarmedProfile(FISTS, [], 20), null);
equal("B7 the Strike reads the trained die and Versatile B", (() => { const w = up.withUnarmedProfile(FISTS, up.unarmedProfile(FISTS, fistsRow, 0)); return [w.damage, w.traits]; })(), ["1d6", "Versatile B"]);
equal("B7b a fist that already has a Versatile trait keeps its own", up.withUnarmedProfile({ ...FISTS, traits: "Versatile P" }, up.unarmedProfile(FISTS, fistsRow, 0)).traits, "Versatile P");
equal("B8 Versatile B is bludgeoning (the first B in the game)", [atk.extractVersatileType("Versatile B"), atk.extractVersatileType("Versatile P"), atk.extractVersatileType("Versatile S")], ["bludgeoning", "piercing", "slashing"]);
const aw = read("module", "combat", "attack-workflow.mjs");
ok("B9 the Strike's fists are the trained ones (Fist of Rock still wins)", /const trainedFist = withUnarmedProfile\(armouredFist\.data, unarmedHere\);\s*const fistData = stoneFist \? \{ \.\.\.trainedFist, \.\.\.stoneFist \} : trainedFist;/.test(aw));
ok("B10 at damage: the die when nothing else set one", /const unarmed = unarmedProfileFor\(actor, weaponData\);\s*if \(!damageOverride && unarmed\?\.damage\) damageOverride = unarmed\.damage;/.test(aw));
ok("B11 the flat is total damage, added after the dice, and named on the card", /const unarmedFlat = Math\.max\(0, Math\.trunc\(Number\(unarmed\?\.flat\) \|\| 0\)\);\s*if \(unarmedFlat\) formula \+= ` \+ \$\{unarmedFlat\}`;/.test(aw) && /if \(unarmedFlat\) lines\.push\(line\(`<em>\$\{unarmed\.flatLabel\}: total unarmed damage\.<\/em>`\)\);/.test(aw));
// Re-anchored at 3.671.0: a bonded weapon's magic (Soul-Bound Weapon) follows it.
ok("B12 a trained blow that classes as magical is a magical source", /\|\| Boolean\(unarmed\?\.magical\)\n/.test(aw));
// Re-anchored at 3.671.0: a bonded weapon's materials join them.
ok("B13 the materials it counts as reach the defence layer", /material: \[materialDefenceWord\(struck\.material\), \.\.\.\(unarmed\?\.materials \?\? \[\]\)(?:, \.\.\.\(bonded\?\.materials \?\? \[\]\))?\]\.filter\(Boolean\)\.join\(", "\),/.test(aw));
ok("B14 the profile is read from the attacker's items and applied effects at its BAB", /return unarmedProfile\(weaponSystem, declaredUnarmedRows\(carriers\), Number\(actor\?\.system\?\.combat\?\.bab\?\.total \?\? 0\)\);/.test(aw));
const dmg = read("module", "combat", "damage.mjs");
ok("B15 a blow of several materials meets each: weakness and bypass read every one",
  /const materialKeys = materialKey\.split\(","\)\.map\(\(m\) => m\.trim\(\)\)\.filter\(Boolean\);/.test(dmg)
  && /const materialWeak = materialKeys\.some\(\(key\) => has\(weaknessMaterials, key\)\);/.test(dmg)
  && /const bypassed = materialKeys\.some\(\(key\) => has\(resistanceBypassMaterials, key\)\);/.test(dmg));

/* C — strike series -------------------------------------------------- */
const ss = await mod("combat", "strike-series.mjs");
const s1 = ss.newSeriesState();
equal("C1 the first Strike meets DR and may roll an injury", ss.seriesStrikeOptions(s1, "Actor.a"), { drWaived: false, noCriticalInjury: false });
ss.recordSeriesStrike(s1, "Actor.a", { hits: true, critical: { severity: 1 } }, ss.seriesStrikeOptions(s1, "Actor.a"));
equal("C2 after a critical hit on A: a second hit on A meets no DR and rolls no injury", ss.seriesStrikeOptions(s1, "Actor.a"), { drWaived: true, noCriticalInjury: true });
equal("C3 …a Strike at B meets B's DR, and still no second injury", ss.seriesStrikeOptions(s1, "Actor.b"), { drWaived: false, noCriticalInjury: true });
const s2 = ss.newSeriesState();
ss.recordSeriesStrike(s2, "Actor.a", { hits: false, critical: null });
equal("C4 a miss waives nothing", ss.seriesStrikeOptions(s2, "Actor.a"), { drWaived: false, noCriticalInjury: false });
ss.recordSeriesStrike(s2, "Actor.a", { hits: true, critical: { severity: 1 }, injuryImmune: true });
equal("C5 a critical on a creature immune to injuries has rolled none", ss.seriesStrikeOptions(s2, "Actor.b").noCriticalInjury, false);
equal("C6 no target, no waiver", ss.seriesStrikeOptions(s1, ""), { drWaived: false, noCriticalInjury: true });
const ssSrc = read("module", "combat", "strike-series.mjs");
ok("C7 each Strike of the series is the Strike workflow, carrying the series' options and any MAP override (Disciplined Flurry's 0, B3-4)",
  /drWaived: options\.drWaived,\s*noCriticalInjury: options\.noCriticalInjury,\s*seriesLabel: label/.test(ssSrc)
  && /\.\.\.\(strike\.mapOverride !== undefined && strike\.mapOverride !== null \? \{ mapOverride: strike\.mapOverride \} : \{\}\)/.test(ssSrc));
ok("C8 a MAP override still advances the count (the penalty counts the Strike afterwards)", /if \(!isReaction && !mapFrozen && !offTurn\) \{\s*const (?:mapSteps|powerSteps) = /.test(aw) && !/mapOverride[^\n]*setSharedMapCount/.test(aw));
ok("C9 a waived DR is 0 for armour and natural armour, and the card says so",
  /const effectiveDrForHit = drWaived \? 0/.test(aw) && /const effectiveNaturalArmourDr = drWaived \? 0/.test(aw) && /DR was applied once, to the first hit/.test(aw));
// RE-ANCHORED 3.668.0: the damage step's options grew the declared AR after the series' own.
ok("C10 a critical with no injury keeps its dice and says so; the injury roll is skipped",
  /if \(strikeLands && outcome\.critical && noCriticalInjury\) \{/.test(aw) && /&& !injuryReplaced && !noCriticalInjury\) \{/.test(aw));
ok("C11 the waiver reaches the damage step", /drWaived,\s*seriesLabel,/.test(aw) && /sharedDamage = null, drWaived = false, seriesLabel = ""(, [^}]*)? \} = \{\}/.test(aw));

/* D — attack reroll -------------------------------------------------- */
const ar = await mod("combat", "attack-reroll.mjs");
equal("D1 the declaration is found on any owned item", ar.attackRerollSource([{ name: "Sword" }, { name: "Alter the Thread", flags: { "trg-prime": { attackRerollConviction: { label: "Alter the Thread" } } } }])?.label, "Alter the Thread");
equal("D2 offered with conviction; refused on Chaos, against yourself, without conviction, undeclared", [
  ar.attackRerollOffer({ declared: true, conviction: { ok: true } }),
  ar.attackRerollOffer({ declared: true, conviction: { ok: true }, chaos: true }).offer,
  ar.attackRerollOffer({ declared: true, conviction: { ok: true }, attackerIsDefender: true }).offer,
  ar.attackRerollOffer({ declared: true, conviction: { ok: false } }).offer,
  ar.attackRerollOffer({ declared: false, conviction: { ok: true } }).offer
], [{ offer: true, reason: null }, false, false, false, false]);
equal("D3 a spell attack's new total keeps its modifiers", ar.rerolledTotal(23, 15, 4), 12);
ok("D4 a Strike is offered once rolled, before it resolves, and rolled again whole (no second conviction)",
  /let check = await TRGCheck\.roll\(attackCheckConfig\);/.test(aw)
  && /if \(targetActor && !presetDice\) \{\s*const \{ offerAttackReroll, postRerollCard \} = await import\("\.\/attack-reroll-workflow\.mjs"\);/.test(aw)
  && /const asked = await offerAttackReroll\(\{ attacker: actor, defender: targetActor, check, what: weapon\.name, db \}\);/.test(aw)
  && /check = await TRGCheck\.roll\(\{ \.\.\.attackCheckConfig, allowConviction: false(, conditionalChoices: check\.conditionalChoices \?\? \[\])? \}\);/.test(aw)
  && aw.indexOf("offerAttackReroll({ attacker: actor") > 0
  && aw.indexOf("offerAttackReroll({ attacker: actor") < aw.indexOf("const outcome = attackOutcome({"));
const cw = read("module", "magic", "cast-workflow.mjs");
ok("D5 a spell attack is offered on every ray, of that ray's creature (B3-5: any attack roll)",
  /if \(!check\?\.rerolledFrom\) \{\s*const \{ offerAttackReroll, rerolledSpellCheck, postRerollCard \} = await import\("\.\.\/combat\/attack-reroll-workflow\.mjs"\);\s*const asked = await offerAttackReroll\(\{ attacker: actor, defender: targetActor, check, what: spell\.name, db: baseDB \}\);/.test(cw)
  && cw.indexOf("offerAttackReroll({ attacker: actor") < cw.indexOf("const attackTotal = assembledSpellAttackTotal({"));
const arw = read("module", "combat", "attack-reroll-workflow.mjs");
ok("D6 the defender's player is asked; the point is spent on the defender's client, re-checked there; a timeout is a no",
  /return defenceAnswerer\(\{ actorId: defender\?\.id/.test(arw)
  && /if \(!getConvictionState\(defender\)\.ok\) return false;\s*await markConvictionSpent\(defender\);/.test(arw)
  && /did not answer in time — the roll stands/.test(arw));
ok("D7 the listener is registered at start-up", /registerAttackRerollOffers\(\);/.test(read("scripts", "trg-prime.mjs")));

/* E — innate allowance ----------------------------------------------- */
const fd = await mod("focus-declarations.mjs");
equal("E1 an innate spell castable to base PP = level + its own allowance, and no further", [
  fd.innateLevelRefusal({ actorType: "character", basePP: 2, castLevel: 1, allowance: 1 }),
  fd.innateLevelRefusal({ actorType: "character", basePP: 3, castLevel: 1, allowance: 1 }) !== null,
  fd.innateLevelRefusal({ actorType: "character", basePP: 2, castLevel: 1 }) !== null,
  fd.innateLevelRefusal({ actorType: "character", basePP: 16, castLevel: 15, allowance: 1 })
], [null, true, true, null]);
equal("E2 the allowance is read off the spell copy, never negative", [fd.innatePPAllowanceOf({ flags: { "trg-prime": { innatePPAllowance: 1 } } }), fd.innatePPAllowanceOf({}), fd.innatePPAllowanceOf({ flags: { "trg-prime": { innatePPAllowance: -3 } } })], [1, 0, 0]);
ok("E3 casting passes the spell's own allowance to the gate", /actorType: actor\.type, basePP: spellData\.ppCost, castLevel: gateLevel, isItemCast,\s*allowance: innatePPAllowanceOf\(spell\)/.test(cw));

/* F — damage announced ----------------------------------------------- */
const dw = read("module", "combat", "dying-workflow.mjs");
ok("F1 applied damage is announced after it lands, only when some was taken, with its source and context",
  /const result = await applyDamageAndCheckDyingInner\(actor, damage, \{/.test(dw)
  && /if \(actor && taken > 0\) \{[\s\S]{0,300}Hooks\.callAll\("trgPrimeDamageApplied", \{ actor, amount: taken, isCritical, nonlethal, damageTypes, sourceUuid: String\(sourceUuid \?\? ""\), sourceName, context: context \?\? null \}\);/.test(dw)
  && dw.indexOf("applyDamageAndCheckDyingInner(actor, damage") < dw.indexOf("Hooks.callAll(\"trgPrimeDamageApplied\""));
ok("F2 a Strike says what it was: its attacker, melee or not, its type", /sourceUuid: actor\.uuid \?\? "",\s*context: \{ kind: "strike", melee: isMelee, damageType: String\(effectiveDamageType \?\? ""\), weaponName: weapon\?\.name \?\? "" \}/.test(aw));
equal("F3 a spell's damage says so, at every call that applies it", (cw.match(/context: \{ kind: "spell", spellName: spell\?\.name \?\? "" \}/g) ?? []).length, 5);

/* G — declared effects, helpers -------------------------------------- */
const de = await mod("magic", "declared-effect.mjs");
const serene = de.normaliseDeclaredEffect({ kind: "declare", target: "self", label: "Serene Defence", flags: { statBonuses: [{ target: "defence", type: "dodge", ability: "wisdom" }] } }, { spellName: "Serene Defence" });
equal("G1 a declared effect may carry a stat row (Serene Defence)", serene && sr.declaredStatRows([de.declaredEffectData(serene)]).map((r) => [r.target, r.type, r.ability]), [["defence", "dodge", "wisdom"]]);
const reflective = de.normaliseDeclaredEffect({ kind: "declare", target: "self", label: "Reflective Mind", rounds: 1, flags: { conditionals: [{ kind: "advantage", label: "Reflective Mind", auto: true, oneShot: true, when: { checkTypes: ["save"], traits: ["mental"] } }] } }, { spellName: "Reflective Mind" });
equal("G2 …or check-dialog rows (Reflective Mind)", reflective && de.declaredEffectData(reflective).flags["trg-prime"].conditionals.map((c) => [c.kind, c.oneShot]), [["advantage", true]]);
const api = read("module", "module-api-workflow.mjs");
ok("G3 a module reaches the series, the unarmed test and one basic save through the helpers",
  /runStrikeSeries: async \(\.\.\.args\) => \(await import\("\.\/combat\/strike-series\.mjs"\)\)\.runStrikeSeries\(\.\.\.args\),/.test(api)
  && /countsAsUnarmed: async \(weapon\) => \(await import\("\.\/combat\/unarmed-profile\.mjs"\)\)\.countsAsUnarmed\(weapon\?\.system \?\? weapon\),/.test(api)
  && /basicSaveHit: async \(\.\.\.args\) => \(await import\("\.\/magic\/area-save-workflow\.mjs"\)\)\.basicSaveHit\(\.\.\.args\),/.test(api));
ok("G4 basicSaveHit is the area save's own", /export async function basicSaveHit\(/.test(read("module", "magic", "area-save-workflow.mjs")));

/* H — found in the live test of 3.667.0, fixed in 3.667.1 ------------ */
const resolve = { name: "Mystical Resolve", flags: { "trg-prime": { convictionPool: 1 } } };
equal("H1 a class ability that raises the pool owes its point until it is given",
  [fd.owesConvictionPoint(resolve), fd.owesConvictionPoint({ flags: { "trg-prime": { convictionPool: 1, convictionGiven: true } } }), fd.owesConvictionPoint({ name: "Sword" })], [true, false, false]);
const ga = read("module", "grant-autorun.mjs");
ok("H2 the grant pass and the create watcher both visit a granted item that owes one",
  /&& !declaresSpecialistSkills\(item\)\s*\/\/[^\n]*\n\s*&& !owesConvictionPoint\(item\)\) continue;/.test(ga)
  && /if \(!declaresGrants\(item\.system, GRANT_FIELDS\[item\.type\]\) && !declaresSpecialistSkills\(item\)\s*(\/\/[^\n]*\n\s*)*&& !owesConvictionPoint\(item\)\) return;/.test(ga));
const deep = { id: "deep", name: "Deep Focus", flags: { "trg-prime": { focusExtraUses: [{ value: 1, traits: ["technique"], restoresAll: true }] } } };
const technique = { id: "t1", name: "Burst Step", type: "ability", system: { traits: "Focus, Technique", usesValue: 1, usesPerDay: "" } };
const spentTechnique = { id: "t2", name: "Guarded Centre", type: "ability", system: { traits: "Focus, Technique", usesValue: 0, usesPerDay: "" } };
const focusOnly = { id: "f1", name: "Impact Absorption", type: "ability", system: { traits: "Defence, Focus", usesValue: 1, usesPerDay: "1" } };
equal("H3 Deep Focus arriving tops up the techniques already there, a spent use staying spent",
  fd.focusExtraTopUps(deep, [technique, spentTechnique, focusOnly, deep]), [{ _id: "t1", "system.usesValue": 2 }, { _id: "t2", "system.usesValue": 1 }]);
equal("H4 an item that declares nothing tops up nothing", fd.focusExtraTopUps({ name: "Sword" }, [technique]), []);
const itm = read("module", "documents", "item.mjs");
ok("H5 a Focus item arrives with its declared extra uses too",
  /const extra = owner\s*\? focusExtraUses\(\{ name: this\.name, system: \{ \.\.\.this\.system, traits: traits \?\? this\.system\?\.traits \} \}, declarationCarriers\(owner\)\)\s*: 0;\s*const full = focusUses \+ extra;\s*if \(Number\(this\.system\?\.usesValue \?\? 0\) < full\) this\.updateSource\(\{ "system\.usesValue": full \}\);/.test(itm));
const few = read("module", "focus-extra-workflow.mjs");
ok("H6 the top-up runs on the creating client, not for an import, and writes the updates",
  /if \(userId !== game\.user\?\.id\) return;/.test(few) && /if \(options\?\.keepId\) return;/.test(few)
  && /const updates = focusExtraTopUps\(item, Array\.from\(actor\.items \?\? \[\]\)\.filter\(\(i\) => i\.id !== item\.id\)\);\s*if \(updates\.length\) await actor\.updateEmbeddedDocuments\("Item", updates\);/.test(few)
  && /registerFocusExtraTopUps\(\);/.test(read("scripts", "trg-prime.mjs")));

const EXPECTED = 59;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block3-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block3-core: ${checks} checks — all green.`);
