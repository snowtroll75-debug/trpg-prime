#!/usr/bin/env node
/**
 * verify-block6-core — TRG Prime 3.670.0: the twelve seams Inner Tempest's
 * Block 6 (the class feats) needs, from its audit's C1 to C12 and Graham's
 * rulings B6-1 to B6-10 of 24 October 2026.
 *
 *   C1  a trait on every unarmed attack, or every attack (Mantis, Dragon)
 *   C2  a damage type an effect sets rather than offers (Tiger, Wolf)
 *   C3  bleed you inflict, raised by a declaration (Tiger)
 *   C4  a Step an effect lengthens, with a minimum Speed (Tiger)
 *   C5  the first square of difficult terrain on a Stride (Dragon)
 *   C6  Pack Attack from an effect (Wolf)
 *   C7  the first move of each turn provoking nothing (Mantis)
 *   C8  a Strike that counts as two attacks (Perfect Strike, Perfect Shot)
 *   C9  a trade-off's price waived by a declaration (Monkey)
 *   C10 another check's whole result met again (Drunken Strike's Feint)
 *   C11 a class's feats opened by any owned feat (Inner Magic)
 *   C12 metamagic on a flagged innate spell, from its free budget (Mystic)
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
const flags = (f, extra = {}) => ({ ...extra, flags: { "trg-prime": f } });

const aw = read("module", "combat", "attack-workflow.mjs");
const acw = read("module", "combat", "action-workflow.mjs");
const mw = read("module", "combat", "movement-workflow.mjs");
const ck = read("module", "dice", "check.mjs");

/* C1 — a trait by what the Strike is */
{
  const so = await imp("combat/strike-options.mjs");
  const mantis = [flags({ weaponTraitGrants: [{ scope: "unarmed", trait: "Deadly", label: "Mantis Stance" }] })];
  const any = [flags({ weaponTraitGrants: [{ scope: "any", trait: "Sweep", label: "Any" }] })];
  const discipline = [flags({ weaponTraitGrants: [{ groups: ["sword"], trait: "Finesse", oneHanded: true }] })];
  equal("C1 an unarmed-scoped grant reaches a Strike that counts as unarmed, whatever its group, and nothing else",
    [so.traitsWithGroupGrants("Agile", mantis, { group: "brawling", unarmed: true }), so.traitsWithGroupGrants("Agile", mantis, { group: "brawling", unarmed: false }), so.traitsWithGroupGrants("Monastic", mantis, { group: "club", unarmed: true })],
    ["Agile, Deadly", "Agile", "Monastic, Deadly"]);
  equal("C1 an any-scoped grant reaches every weapon, with no group needed; never added twice",
    [so.traitsWithGroupGrants("", any, { group: "sword" }), so.traitsWithGroupGrants("Reach", any, {}), so.traitsWithGroupGrants("Sweep", any, { group: "axe" })], ["Sweep", "Reach, Sweep", "Sweep"]);
  equal("C1 a group grant is as before: its group, one-handed when it says so",
    [so.traitsWithGroupGrants("", discipline, { group: "sword", oneHanded: true }), so.traitsWithGroupGrants("", discipline, { group: "sword", oneHanded: false }), so.traitsWithGroupGrants("", discipline, { group: "axe", oneHanded: true }), so.traitsWithGroupGrants("", discipline, { unarmed: true })],
    ["Finesse", "", "", ""]);
  ok("C1 the attack path tells it whether the Strike counts as unarmed (the conditionals' attack form)",
    /oneHanded: itemRequiredHands\(weapon, actor\.system\?\.identity\?\.size \?\? "medium"\) < 2 && !heldInTwoHandGrip\(weapon\),\n(?:\s*\/\/[^\n]*\n)*\s*unarmed: attackFormOf\(ammoData\) === "unarmed"(?: \|\| abilityUnarmed)?\n\s*\}\);/.test(aw));
}

/* C2 — a type set, not offered */
{
  const sto = await imp("combat/strike-type-options.mjs");
  const tiger = sto.declaredStrikeTypeOptions([flags({ strikeTypeOption: { type: "slashing", label: "Tiger Stance", scope: "unarmed-form", replace: true } })]);
  const wolf = sto.declaredStrikeTypeOptions([flags({ strikeTypeOption: { type: "piercing", label: "Wolf Stance", scope: "unarmed-form", replace: true } })]);
  const offered = sto.declaredStrikeTypeOptions([flags({ strikeTypeOption: { type: "essence", label: "Essence", scope: "unarmed" } })]);
  const gauntlet = { unarmed: true, damageType: "bludgeoning" }, monastic = { traits: "Monastic", damageType: "bludgeoning" }, claw = { natural: true, damageType: "slashing" }, sword = { damageType: "slashing" };
  equal("C2 B6-1: the set type reaches a gauntlet and a Monastic weapon (unarmed-form), not a claw or a sword",
    [gauntlet, monastic, claw, sword].map((w) => sto.forcedStrikeTypes(w, tiger).map((c) => c.type)), [["slashing"], ["slashing"], [], []]);
  equal("C2 an option not marked replace is only offered, as before; two stances at once set two types, asked between",
    [sto.forcedStrikeTypes(gauntlet, offered).length, offered[0].replace, sto.forcedStrikeTypes(gauntlet, [...tiger, ...wolf]).map((c) => c.type), sto.strikeTypeChoices(gauntlet, offered).map((c) => c.type)],
    [0, false, ["slashing", "piercing"], ["bludgeoning", "essence"]]);
  ok("C2 the attack path takes one set type without asking, and asks only between set types when there are two",
    /const forcedTypes = forcedStrikeTypes\((?:weaponData|abilityData), strikeTypeOptions\);\n\s*const damageTypeChoices = forcedTypes\.length \? forcedTypes : strikeTypeChoices\((?:weaponData|abilityData), strikeTypeOptions, versatileAlternate\);\n\s*if \(forcedTypes\.length === 1\) versatileDamageType = forcedTypes\[0\]\.type;\n\s*else if \(damageTypeChoices\.length > 1\) \{/.test(aw));
  ok("C2 …and the damage rolled on its own does the same",
    /const standaloneForced = forcedStrikeTypes\((?:weaponData|standaloneAbilityData), standaloneOptions\);/.test(aw)
    && /: standaloneForced\.length === 1 \? standaloneForced\[0\]\.type/.test(aw));
}

/* C3 — bleed you inflict */
{
  const bb = await imp("combat/bleed-bonus.mjs");
  const tiger = [flags({ bleedBonus: { value: 1, label: "Tiger Stance" } }, { name: "Tiger Stance" }), { disabled: true, ...flags({ bleedBonus: { value: 5 } }) }];
  const bonus = bb.declaredBleedBonus(tiger);
  const tags = [{ key: "bleeding", value: 2 }, { key: "flatFooted", value: null }];
  equal("C3 the declared bonus (a disabled carrier gives none); bleed inflicted is raised; none is created where none was",
    [bonus, bb.withBleedBonus(tags, bonus.value), bb.withBleedBonus([{ key: "stunned", value: 1 }], 1), bb.withBleedBonus(tags, 0) === tags],
    [{ value: 1, labels: ["Tiger Stance"] }, [{ key: "bleeding", value: 3 }, { key: "flatFooted", value: null }], [{ key: "stunned", value: 1 }], true]);
  ok("C3 a critical injury's bleed is raised, and the card says by whom",
    /const bleed = targetActor === actor \? \{ value: 0, labels: \[\] \}\n\s*: declaredBleedBonus\(\[\.\.\.Array\.from\(actor\?\.items \?\? \[\]\), \.\.\.Array\.from\(actor\?\.appliedEffects \?\? actor\?\.effects \?\? \[\]\)\]\);\n\s*const raised = withBleedBonus\(tags, bleed\.value\);\n\s*if \(raised !== tags\) \{\n\s*tags = raised;/.test(aw));
  ok("C3 …but not on an injury a creature deals itself (found in review)", /const bleed = targetActor === actor \? \{ value: 0, labels: \[\] \}/.test(aw));
  ok("C3 …and so is the bleed a Strike lays after it (a declared after-Strike condition)",
    /const raised = withBleedBonus\(tags, bleed\.value\);\n\s*if \(raised !== tags\) \{ tags\.splice\(0, tags\.length, \.\.\.raised\);/.test(read("module", "combat", "declared-after-strikes-workflow.mjs")));
}

/* C4 — a longer Step */
{
  const ft = await imp("feats.mjs");
  const tiger = [flags({ stepFeet: { feet: 10, minSpeed: 20, label: "Tiger Stance" } })];
  equal("C4 Step 10 feet while the Speed is at least 20; nothing below it, nothing from a disabled carrier",
    [ft.declaredStepBonus(tiger, 25), ft.declaredStepBonus(tiger, 20), ft.declaredStepBonus(tiger, 15), ft.declaredStepBonus([{ disabled: true, ...tiger[0] }], 30)], [5, 5, 0, 0]);
  ok("C4 the Step takes the longer of a named feat's (Graceful Step) and the declared, never both",
    /const named = movementLimitBonus\(actionKey, movementFeatNames\(actor\)\);\n\s*if \(actionKey !== "step"\) return named;[\s\S]{0,400}return Math\.max\(named, declaredStepBonus\(carriers, speed\)\);/.test(mw));
}

/* C5 — the first difficult square */
{
  const pf = await imp("combat/passive-feats.mjs");
  equal("C5 one square's surcharge comes off; never more than the path's surcharge; no terrain, nothing eased",
    [pf.firstDifficultSquareCost({ cost: 20, distance: 10, square: 5 }), pf.firstDifficultSquareCost({ cost: 12, distance: 10, square: 5 }), pf.firstDifficultSquareCost({ cost: 10, distance: 10, square: 5 })],
    [{ cost: 15, eased: true }, { cost: 10, eased: true }, { cost: 10, eased: false }]);
  equal("C5 carried by an item or an effect, not a disabled one",
    [pf.ignoresFirstDifficultSquare({ items: [], effects: [flags({ ignoresFirstDifficultSquare: true }, { name: "Dragon Stance" })] }), pf.ignoresFirstDifficultSquare({ items: [], effects: [flags({ ignoresFirstDifficultSquare: true }, { disabled: true })] })],
    ["Dragon Stance", null]);
  ok("C5 on a Stride only (no other armed action), and only when nothing eases the whole path",
    /if \(!eased\.eased && \(!armedKey \|\| armedKey === "stride"\)\) \{\n\s*const firstBy = ignoresFirstDifficultSquare\(actor\);/.test(mw));
}

/* C6 — Pack Attack from an effect */
{
  const pa = read("module", "combat", "pack-attack.mjs");
  ok("C6 an applied effect declaring Pack Attack grants it, and the Strike reads the effects",
    /return fromItem \|\| Array\.from\(effects \?\? \[\]\)\.some\(\(e\) => !e\?\.disabled && e\?\.flags\?\.\[SYSTEM_ID\]\?\.creatureAbility\?\.derives\?\.packAttack === true\);/.test(pa)
    && /if \(!hasPackAttack\(Array\.from\(actor\.items \?\? \[\]\), Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)\)\) return 0;/.test(pa));
}

/* C7 — the first move of each turn */
{
  const pf = await imp("combat/passive-feats.mjs");
  equal("C7 B6-4: the first move of the turn is free; a second is not; nothing without the declaration",
    [pf.firstMoveIsFree(true, null, "c:1:2"), pf.firstMoveIsFree(true, "c:1:1", "c:1:2"), pf.firstMoveIsFree(true, "c:1:2", "c:1:2"), pf.firstMoveIsFree(false, null, "c:1:2")],
    [true, true, false, false]);
  equal("C7 declared by an item or an effect, not a disabled one",
    [pf.declaresFirstMoveNoReactions({ items: [flags({ firstMoveNoReactions: true })] }), pf.declaresFirstMoveNoReactions({ items: [], effects: [flags({ firstMoveNoReactions: true }, { disabled: true })] })], [true, false]);
  ok("C7 every move of the mover's turn is recorded, and the first is exempt from reactions",
    /const turnKey = `\$\{game\.combat\.id\}:\$\{game\.combat\.round\}:\$\{game\.combat\.turn\}`;\n\s*const carriesFirstMove = declaresFirstMoveNoReactions\(actor\);\n\s*const firstFree = firstMoveIsFree\(carriesFirstMove, actor\?\.getFlag\?\.\(SYSTEM_ID, "firstMoveTurn"\) \?\? null, turnKey\);\n\s*if \(carriesFirstMove && actor\?\.getFlag\?\.\(SYSTEM_ID, "firstMoveTurn"\) !== turnKey\) actor\?\.setFlag\?\.\(SYSTEM_ID, "firstMoveTurn", turnKey\)/.test(mw)
    && /const moverImmune = jumpAvoided \|\| firstFree \|\| Boolean\(/.test(mw));
}

/* C8 — counts as two attacks */
ok("C8 rollWeaponAttack takes mapSteps, and the count advances by the larger of it and Power Attack's two",
  /mapSteps: mapStepsOption = 1,/.test(aw)
  && /const mapSteps = Math\.max\(powerSteps, Math\.max\(1, Math\.trunc\(Number\(mapStepsOption\) \|\| 1\)\)\);\n\s*await setSharedMapCount\(actor, attackIndex \+ mapSteps\);/.test(aw));

/* C9 — a trade-off waived */
{
  const dt = await imp("difficulty-tradeoffs.mjs");
  const monkey = [flags({ tradeoffWaivers: [{ actions: ["highJump", "longJump"], option: "forOneAp", label: "Monkey Stance" }] })];
  const waivers = dt.declaredTradeoffWaivers(monkey, "highJump");
  equal("C9 B6-5: the 1-AP High Jump and Long Jump carry no +2; another action nothing; a disabled carrier nothing",
    [waivers, dt.declaredTradeoffWaivers(monkey, "longJump"), dt.declaredTradeoffWaivers(monkey, "climb"), dt.declaredTradeoffWaivers([{ disabled: true, ...monkey[0] }], "highJump")],
    [{ forOneAp: { dc: 0 } }, { forOneAp: { dc: 0 } }, {}, {}]);
  equal("C9 …so the 1-AP jump is bought at +0 to the DC (and +2 without it)",
    [dt.resolveTradeoffs("highJump", { forOneAp: 1 }, { waivers }).dcIncrease, dt.resolveTradeoffs("highJump", { forOneAp: 1 }).dcIncrease], [0, 2]);
  ok("C9 the action merges the declared waivers with the named ones",
    /Object\.assign\(waivers, declaredTradeoffWaivers\(\[\.\.\.Array\.from\(actor\.items \?\? \[\]\), \.\.\.Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)\], action\.key\)\);\n\s*\}\n\s*tradedDifficulty = await promptDifficultyTradeoffs/.test(acw));
}

/* C10 — another check's result */
ok("C10 B6-3: with preset dice, another check's modifiers replace this one's; nothing more is added (no tick-box, no conviction, no Luck)",
  /this\.presetModifiers = Array\.isArray\(config\.presetModifiers\) && config\.presetDice;\n\s*if \(this\.presetModifiers\) \{\n\s*this\.modifiers = config\.presetModifiers\.map\(\(m\) => \(\{ \.\.\.m \}\)\);\n\s*this\.conditionalsResolved = true;\n\s*this\.allowConviction = false;/.test(ck)
  && /check\.type !== "luck" && !check\.declaredDegree && !check\.presetModifiers\) \{/.test(ck)
  && ck.indexOf("this.presetModifiers = Array.isArray") > ck.indexOf("this.conditionalsResolved = Boolean(config.conditionalsResolved);"));
ok("C10 …nothing waiting is spent on it: Cutting Words, Counter Perform, Inspire Competence, Seer's Vision, a rod (found in review)",
  ["takeCuttingWords", "takeCounterPerform", "takeInspireCompetence", "takeSeersVision"].every((m) => ck.includes(`  async #${m}() {\n    // Not on another check's result met again (3.670.0, found in review):\n    // its total is that check's, and nothing waiting is spent on it.\n    if (!this.actor || this.presetModifiers) return;`))
  && ck.includes('!check.flat && !check.rodAdvantageResolved && !check.presetModifiers) {'));
ok("C10 a Strike announces whether it missed, resolved and not a hit (found in review: Snake Stance answered a grab)",
  /resolved: Boolean\(outcome\?\.resolved\), missed: Boolean\(outcome\?\.resolved\) && !outcome\?\.hits(?:,\n(?:\s*\/\/[^\n]*\n)*\s*noReactions: Boolean\(noReactions\))?\n\s*\}\);/.test(read("module", "combat", "attack-workflow.mjs")));
ok("C10 resolveAction hands them on with the dice",
  /presetModifiers = null\n\} = \{\}\) \{/.test(acw) && /\.\.\.\(presetDice && Array\.isArray\(presetModifiers\) \? \{ presetModifiers \} : \{\}\),/.test(acw));

/* C11 — a class's feats opened by a feat */
{
  const ft = await imp("feats.mjs");
  const pf = await imp("picker-filters.mjs");
  const items = [{ type: "feat", name: "Inner Magic", flags: { "trg-prime": { classFeatAccess: ["Wizard"] } } }, { type: "ability", name: "Not a feat", flags: { "trg-prime": { classFeatAccess: ["Bard"] } } }];
  const opened = ft.declaredClassFeatAccess(items);
  const wizardFeat = { name: "A Wizard Feat", system: { category: "Class", traits: "Wizard", sourceClass: "" } };
  const filterWith = (cls) => pf.buildPickerFilter("classFeat", { class: cls, ownClass: "Fighter", tier: "Martial" })(wizardFeat);
  equal("C11 B6-7: a feat (only a feat) opens a class's TRAIT; the picker then offers the feats carrying it",
    [opened, pf.buildPickerFilter("classFeat", { class: "Fighter", traitClasses: opened.join(", "), ownClass: "Fighter", tier: "Martial" })(wizardFeat), filterWith("Fighter")], [["Wizard"], true, false]);
  {
    // FOUND IN REVIEW: Inner Magic opened the Mystic's registered list of
    // core feats too. A trait opened is not the class's access list.
    const api = await imp("module-api.mjs");
    api.resetModuleRegistry();
    api.registerFeatAccess("class", "Wizard", ["A Bard Feat"], "harness");
    const bardFeat = { name: "A Bard Feat", system: { category: "Class", traits: "Bard", sourceClass: "" } };
    const wizardSourced = { name: "A Wizard-Only Feat", system: { category: "Class", traits: "", sourceClass: "Wizard" } };
    const asTrait = (entry) => pf.buildPickerFilter("classFeat", { class: "Fighter", traitClasses: "Wizard", ownClass: "Fighter", tier: "Martial" })(entry);
    const asClass = (entry) => pf.buildPickerFilter("classFeat", { class: "Wizard", ownClass: "Wizard", tier: "Adept" })(entry);
    equal("C11 …and not the class's registered access list, nor its source-tagged feats (a Wizard is offered both)",
      [asTrait(bardFeat), asTrait(wizardSourced), asClass(bardFeat), asClass(wizardSourced)], [false, false, true, true]);
    api.resetModuleRegistry();
  }
  ok("C11 the sheet hands them to the picker apart from the classes it counts the character as",
    /class: effectiveClasses\(items\.find\(\(i\) => i\.type === "class"\)\?\.name \?\? "", archetypeFeats\),\n(?:\s*\/\/[^\n]*\n)*\s*traitClasses: declaredClassFeatAccess\(items\)\.join\(", "\),/.test(read("module", "sheets", "actor-sheet.mjs"))
    && /const myClasses = \[className, traitClasses\]\.join\(", "\)/.test(read("module", "picker-filters.mjs")));
}

/* C12 — metamagic on an innate spell */
{
  const sw = await imp("magic/spell-warp.mjs");
  const warp = { ppSpent: 5, rawPP: 3 };
  equal("C12 B6-8: the Metamagic box counts against the free budget when the spell takes metamagic, not otherwise",
    [sw.innateWarpFits(warp, 4).ok, sw.innateWarpFits(warp, 4, { countRaw: true }).ok, sw.innateWarpFits(warp, 5, { countRaw: true }).spent], [true, false, 5]);
  equal("C12 …and the Metamagic feats ticked are spent from it too (found in review: they were charged to the pool)",
    [sw.innateWarpFits({ ppSpent: 2, rawPP: 0 }, 4, { countRaw: true, metamagicPP: 2 }).ok, sw.innateWarpFits({ ppSpent: 2, rawPP: 0 }, 4, { countRaw: true, metamagicPP: 3 }).over, sw.innateWarpFits({ ppSpent: 2, rawPP: 0 }, 4, { metamagicPP: 9 }).ok], [true, 1, true]);
  equal("C12 an innate cantrip is read from the spell's data (PP 0 and the Cantrip trait)",
    [sw.innateCantripOf({ ppCost: 0, traits: "Cantrip, Evocation" }), sw.innateCantripOf({ ppCost: 0, traits: "Evocation" }), sw.innateCantripOf({ ppCost: 2, traits: "Cantrip" })], [true, false, false]);
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("C12 an innate spell flagged innateMetamagic (never a cantrip, never an item's) is offered Metamagic, priced on its printed cost, without Economic Spell",
    /const innateMetamagic = isInnate && !isItemCast && !isCantrip && !innateCantripOf\(spellData\) && spell\.getFlag\?\.\(SYSTEM_ID, "innateMetamagic"\) === true;\n\s*const mmOptions = \(isCantrip \|\| \(isInnate && !innateMetamagic\)\) \? \[\] : buildMetamagicOptions\(\{/.test(cw)
    && /basePP: innateMetamagic \? Math\.max\(0, Number\(spellData\.ppCost \?\? 0\)\) : basePP,/.test(cw)
    && /\}\)\.filter\(\(o\) => !\(innateMetamagic && o\.kind === "economic"\)\);/.test(cw));
  ok("C12 …its feats and its Metamagic box spent from the free budget, and nothing charged to the pool",
    /warpPP = warp\.ppSpent;\n(?:\s*\/\/[^\n]*\n)*\s*mm = aggregateMetamagicSelection\(mmOptions, form, \{/.test(cw)
    && /const fit = innateWarpFits\(warp, innateBudget, \{ countRaw: innateMetamagic, metamagicPP: mm\.ppSpent \}\);/.test(cw)
    && /warpPP = innateMetamagic \? 0 : warp\.rawPP;/.test(cw)
    && /\(innateMetamagic \? 0 : mm\.ppSpent\);/.test(cw)
    && (cw.match(/mm = aggregateMetamagicSelection\(/g) ?? []).length === 1);
}

// 3.670.0 OR LATER (re-anchored 3.670.1): a later release keeps these seams.
{
  const [ma, mi, pa] = String(JSON.parse(read("system.json")).version).split(".").map(Number);
  ok("Z0 the system is 3.670.0 or later", ma > 3 || (ma === 3 && (mi > 670 || (mi === 670 && pa >= 0))));
}

const EXPECTED = 39;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block6-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block6-core: ${checks} checks — all green.`);
