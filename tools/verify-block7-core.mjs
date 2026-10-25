#!/usr/bin/env node
/**
 * verify-block7-core — TRG Prime 3.671.0: the seams Inner Tempest's Block 7
 * (the archetypes) needs, from its audit's C1 to C14 and Graham's rulings
 * B7-1 to B7-8 of 25 October 2026.
 *
 *   C1  the progression parser reads the book's punctuation, "Level +N"
 *       (B7-2) and "Gained class skill +N ranks" (Inner Adept)
 *   C2  core archetypes opened to a module class (registerFeatAccess
 *       "archetype")
 *   C3  an archetype that counts as another for its class feats (Zen
 *       Archer as Archer); B7-3's class-trait access is 3.670.0's
 *       `classFeatAccess`, unchanged
 *   C4  a class skill a feat simply gives
 *   C5  several named proficiencies on one effect; an exotic weapon
 *       martial for its holder (Oathbound)
 *   C6  the holder's unarmed abilities with a declared weapon, never its
 *       unarmed damage (Soul-Bound Weapon, Zen Archer, B7-6)
 *   C7  one bonded weapon's scaling (Soul-Bound Weapon)
 *   C8  a sheathed sword, and the conditionals' axis for it (B7-5)
 *   C9  a Strike its target cannot react to; an effect that takes
 *       reactions; a module's reaction refused by both (Drawn Verdict)
 *   C10 temporary immunity for modules (Restorative Palm)
 *   C11 an affliction's save on demand (Restorative Palm)
 *   C12 a spell cast as innate once, kept nowhere (Harmony Warden)
 *   C13 what a Refocus restores, as a conditional axis (Veilborn)
 *   C14 one spell's own attack and DC bonus (Lotus Enchanter, Onmyoji)
 *   C15 of the bonuses sharing a stack group, the greatest only (Formbinder:
 *       "If both forms offer a bonus to the same thing, you may only benefit
 *       from the greater of the two")
 *   C16 "Learned Caster" as a prerequisite (Shugenja, ruling IT-C9)
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
const ck = read("module", "dice", "check.mjs");
const api = read("module", "module-api-workflow.mjs");
const pf = read("module", "picker-filters.mjs");

/* C1 — the progression lines */
{
  const ap = await imp("archetype-progression.mjs");
  const p = (t) => ap.parseProgressionClause(t);
  equal("C1 the book's punctuation: a full stop, \"&\" and \"skills\" (all named skills, as \"and\")",
    [p("BAB +12."), p("Deception & Diplomacy skills +10 ranks"), p("Arcana, Nature & Religion skills +10 ranks"), p("Medicine & Religion skills +10 ranks")],
    [{ type: "bab", min: 12 }, { type: "skillAll", keys: ["deception", "diplomacy"], min: 10 }, { type: "skillAll", keys: ["arcana", "nature", "religion"], min: 10 }, { type: "skillAll", keys: ["medicine", "religion"], min: 10 }]);
  equal("C1 \"Level +10\" is character level 10 (B7-2); Archer's \"+8 levels\" stays unread; \"Level 5\" as before",
    [p("Level +10"), p("Any 3 feats which effect missile weapons or attacks, +8 levels"), p("Level 5")],
    [{ type: "level", min: 10 }, null, { type: "level", min: 5 }]);
  equal("C1 the core's own lines read as before (Assassin's AND, Loremaster's OR, a single skill)",
    [p("Perception and Stealth both +10 ranks")?.type, p("Arcana, Culture, Linguistics, Nature, Occultism, Planes or Religion +10 ranks")?.type, p("Mental Focus skill +10 ranks")],
    ["skillAll", "skillAny", { type: "skillAny", keys: ["mentalFocus"], min: 10 }]);
  equal("C1 \"Gained class skill +10 ranks\" is its own shape", p("Gained class skill +10 ranks"), { type: "grantedClassSkill", min: 10 });
  const stats = (ranks) => ({ level: 5, bab: 3, skillRanks: ranks });
  const g = "Gained class skill +10 ranks";
  equal("C1 the chosen skill is measured; unchosen is unmet; no grant passes, as an unread line does",
    [ap.meetsProgressionRequirement(g, stats({ meditation: 10 }), { hasGrant: true, grantedSkill: "meditation" }),
      ap.meetsProgressionRequirement(g, stats({ meditation: 9, mentalFocus: 12 }), { hasGrant: true, grantedSkill: "meditation" }),
      ap.meetsProgressionRequirement(g, stats({ meditation: 10 }), { hasGrant: true, grantedSkill: "" }),
      ap.meetsProgressionRequirement(g, stats({}), {})],
    [true, false, false, true]);
  equal("C1 \"&\" needs both skills, and the level line its level",
    [ap.meetsProgressionRequirement("Deception & Diplomacy skills +10 ranks", stats({ deception: 10, diplomacy: 9 })),
      ap.meetsProgressionRequirement("Deception & Diplomacy skills +10 ranks", stats({ deception: 10, diplomacy: 10 })),
      ap.meetsProgressionRequirement("Level +10", { level: 9 }), ap.meetsProgressionRequirement("Level +10", { level: 10 })],
    [false, true, false, true]);
  const pfm = await imp("picker-filters.mjs");
  const cs = await imp("class-skills.mjs");
  cs.CLASS_SKILL_GRANTS.push({ name: "zz inner adept", flag: "zzInnerAdeptSkill", label: "ZZ", options: ["meditation", "mentalFocus"] });
  const actor = (record) => ({ flags: { "trg-prime": record ? { zzInnerAdeptSkill: record } : {} } });
  equal("C1 the picker reads the archetype's own grant, by the feat's name",
    [pfm.archetypeGrantContext(actor({ skill: "meditation" }), { name: "ZZ Inner Adept" }), pfm.archetypeGrantContext(actor(null), { name: "ZZ Inner Adept" }), pfm.archetypeGrantContext(actor({ skill: "x" }), { name: "Brawler" })],
    [{ hasGrant: true, grantedSkill: "meditation" }, { hasGrant: true, grantedSkill: "" }, { hasGrant: false, grantedSkill: "" }]);
  cs.CLASS_SKILL_GRANTS.pop();
  ok("C1 the one-at-a-time gate passes that context for each archetype",
    /\(feat\) => !meetsProgressionRequirement\(feat\.system\?\.progressionRequirements, stats, archetypeGrantContext\(actor, feat\)\)/.test(pf));
}

/* C2 and C3 — archetype access */
{
  const api2 = await imp("module-api.mjs");
  const pfm = await imp("picker-filters.mjs");
  const vanguard = { name: "Vanguard", system: { category: "Archetype", traits: "Fighter", prerequisites: "BAB +2" } };
  const champion = { name: "Champion", system: { category: "Archetype", traits: "", prerequisites: "Non-Crusader" } };
  const kensai = pfm.buildPickerFilter("archetypeFeat", { class: "ZZKensai", ownClass: "ZZKensai", tier: "Martial" });
  const mystic = pfm.buildPickerFilter("archetypeFeat", { class: "ZZMystic", ownClass: "ZZMystic", tier: "Adept" });
  const before = kensai(vanguard);
  ok("C2 \"archetype\" is a kind registerFeatAccess takes", api2.registerFeatAccess("archetype", "ZZKensai", ["Vanguard"]) === true);
  equal("C2 the archetype slot opens it to that class only; an untraited archetype is open to all as before",
    [before, kensai(vanguard), mystic(vanguard), mystic(champion)], [false, true, false, true]);
  ok("C2 …read in the archetype slot after its own class and tier gates, with \"Non-X\" still applied first",
    /if \(!traitClasses\.length && !traitTiers\.length\) return true;\n(?:\s*\/\/[^\n]*\n)*\s*if \(hasRegisteredFeatAccess\("archetype", className, entry\.name\)\) return true;/.test(pf)
    && pf.indexOf("if (!meetsClassPrerequisite(entry, ownClass)) return false;\n        const CLASS_NAMES = [\"bard\"") < pf.indexOf("hasRegisteredFeatAccess(\"archetype\""));
  const feats = await imp("feats.mjs");
  api2.registerArchetype("ZZ Zen Archer", { countsAs: ["Archer"] });
  equal("C3 an archetype counts as another for archetype-trait class feats, and the owned ones come first, once",
    [feats.effectiveArchetypes(["ZZ Zen Archer"]), feats.effectiveArchetypes(["ZZ Zen Archer", "Archer", "Thief"]), feats.effectiveArchetypes(["Thief"])],
    ["ZZ Zen Archer, Archer", "ZZ Zen Archer, Archer, Thief", "Thief"]);
  const doubleShot = { name: "Double Shot", system: { category: "Class", traits: "Archer, Flourish, ZZNotATier" } };
  const zen = pfm.buildPickerFilter("classFeat", { class: "ZZOathblade", ownClass: "ZZOathblade", tier: "", archetypes: feats.effectiveArchetypes(["ZZ Zen Archer"]) });
  const none = pfm.buildPickerFilter("classFeat", { class: "ZZOathblade", ownClass: "ZZOathblade", tier: "", archetypes: "" });
  equal("C3 …so an Archer-trait class feat is open to a Zen Archer", [zen(doubleShot), none(doubleShot)], [true, false]);
  ok("C3 the sheet's picker context reads it", /archetypes: effectiveArchetypes\(archetypeFeats\),/.test(read("module", "sheets", "actor-sheet.mjs")));
}

/* C4 — a class skill a feat gives */
{
  const cd = await imp("class-derive.mjs");
  const cs = await imp("class-skills.mjs");
  const items = [
    { type: "feat", id: "f1", name: "Jade Physician", flags: { "trg-prime": { classSkills: ["Medicine"] } } },
    { type: "ability", id: "a1", name: "Oathbound", flags: { "trg-prime": { classSkills: "mentalFocus" } } },
    { type: "weapon", id: "w1", name: "Not a source", flags: { "trg-prime": { classSkills: ["Stealth"] } } }
  ];
  const declared = cd.declaredClassSkills(items);
  equal("C4 feats and abilities declare class skills by name or key; nothing else does",
    declared, [{ id: "f1", label: "Jade Physician", skills: ["Medicine"] }, { id: "a1", label: "Oathbound", skills: ["mentalFocus"] }]);
  const skills = { medicine: { label: "Medicine" }, mentalFocus: { label: "Mental Focus" }, stealth: { label: "Stealth" } };
  const found = cs.classSkillSources({ skills, declared });
  equal("C4 …each a source of its own", [...found].map(([k, v]) => [k, v.map((x) => x.id)]), [["medicine", ["feat:f1"]], ["mentalFocus", ["feat:a1"]]]);
  ok("C4 the derive passes them", /declared: declaredClassSkills\(actor\?\.items \?\? \[\]\)/.test(read("module", "class-derive.mjs")));
}

/* C5 — proficiency */
{
  const pr = await imp("proficiency-rules.mjs");
  const eff = (f) => ({ name: "E", disabled: false, getFlag: (s, k) => f[k] });
  const profile = pr.proficiencyProfile({ items: [], effects: [eff({ weaponProficientName: ["Longbow", "Shortbow", "Composite Longbow"] }), eff({ weaponProficientName: "Katana" }), eff({ weaponCategoryAs: { names: ["Katana", "Wakizashi"], category: "martial" } })] });
  equal("C5 several names on one effect, and one as before", [...profile.weaponNames].sort(), ["compositelongbow", "katana", "longbow", "shortbow"]);
  equal("C5 an exotic weapon is martial for its holder; a weapon not named, or not exotic, is as printed",
    [pr.effectiveWeaponCategory(profile, { name: "Katana", system: { category: "Exotic" } }), pr.effectiveWeaponCategory(profile, { name: "Nunchaku", system: { category: "Exotic" } }), pr.effectiveWeaponCategory(profile, { name: "Wakizashi", system: { category: "Simple" } })],
    ["Martial", "Exotic", "Simple"]);
}

/* C6 — unarmed abilities with another weapon */
{
  const up = await imp("combat/unarmed-profile.mjs");
  const bond = { id: "w1", name: "Katana", system: { group: "sword", traits: "Deadly" } };
  const longbow = { id: "w2", name: "Longbow", system: { group: "bow" } };
  const crossbow = { id: "w3", name: "Light Crossbow", system: { group: "bow" } };
  const carriers = [flags({ unarmedAbilityWeapons: { itemIds: ["w1"] } }), flags({ unarmedAbilityWeapons: { groups: ["sword"] } }, { disabled: true }), flags({ unarmedAbilityWeapons: { names: ["Longbow", "Shortbow"] } })];
  equal("C6 by id, by name, never a disabled effect, and a crossbow is not a bow",
    [up.declaresUnarmedAbilities(carriers, bond), up.declaresUnarmedAbilities(carriers, longbow), up.declaresUnarmedAbilities(carriers, crossbow), up.declaresUnarmedAbilities(carriers, { id: "w9", name: "Greatsword", system: { group: "sword" } })],
    [true, true, false, false]);
  const view = up.abilityStrikeView(bond.system, true);
  equal("C6 the abilities' view is unarmed; the weapon's own data is untouched", [up.attackFormOf(view), bond.system.unarmed, up.abilityStrikeView(bond.system, false) === bond.system], ["unarmed", undefined, true]);
  ok("C6 the holder's abilities read it: unarmed trait grants, Death Mark, a stance's damage type, the attack form, Savage Strikes, magic from a type option",
    /unarmed: attackFormOf\(ammoData\) === "unarmed" \|\| abilityUnarmed\n/.test(aw)
    && /const abilityData = abilityStrikeView\(weaponData, abilityUnarmed\);/.test(aw)
    && /unarmed: isUnarmedAttack\(abilityData\),/.test(aw)
    && /const forcedTypes = forcedStrikeTypes\(abilityData, strikeTypeOptions\);/.test(aw)
    && /strikeTypeChoices\(abilityData, strikeTypeOptions, versatileAlternate\)/.test(aw)
    && /attackForm: attackFormOf\(abilityData\),/.test(aw)
    && /\|\| declaresUnarmedAbilities\(unarmedAbilityCarriers\(actor\), weapon\);/.test(aw)
    && /strikeTypeIsMagical\(abilityStrikeView\(weaponData, declaresUnarmedAbilities\(unarmedAbilityCarriers\(actor\), weapon\)\)/.test(aw)
    && /const standaloneForced = forcedStrikeTypes\(standaloneAbilityData, standaloneOptions\);/.test(aw));
  ok("C6 …and not the fists' damage profile or the thorns (B7-6)",
    /const unarmedHere = unarmedProfileFor\(actor, armouredFist\.data\);/.test(aw)
    && /const unarmed = unarmedProfileFor\(actor, weaponData\);/.test(aw)
    && /melee: isMelee,\n\s*unarmed: isUnarmedAttack\(weaponData\),/.test(aw));
  const srw = read("module", "magic", "strike-riders-workflow.mjs");
  ok("C6 an unarmed-scoped rider reaches it, on every rider path", /unarmed: weapon\?\.system\?\.unarmed === true \|\| abilityUnarmed,/.test(srw)
    && (srw.match(/weaponIdentity\(weapon, actor\)/g) ?? []).length === 4 && !/weaponIdentity\(weapon\)[^,]/.test(srw));
  ok("C6 a module asks the same question through the helpers", /unarmedAbilityWeapon: async \(actor, weapon\) => \{/.test(api));
}

/* C7 — one bonded weapon's scaling */
{
  const up = await imp("combat/unarmed-profile.mjs");
  const carriers = [flags({ weaponScaling: { itemId: "w1", perBAB: { every: 3, value: 1 }, countsAs: { magical: 3, "cold iron": 8, silver: 8, adamantine: 16 }, label: "Soul-Bound Weapon" } })];
  const at = (bab, id = "w1") => up.weaponScalingProfile(carriers, { id }, bab);
  equal("C7 nothing below BAB 3; +1 and magical at 3; cold iron and silver at 8; adamantine and +5 at 16",
    [at(2), at(3), at(8)?.materials, [at(16)?.flat, at(16)?.materials]],
    [null, { flat: 1, flatLabel: "Soul-Bound Weapon +1", magical: true, materials: [], labels: ["Soul-Bound Weapon"] }, ["cold iron", "silver"], [5, ["cold iron", "silver", "adamantine"]]]);
  equal("C7 only that weapon", at(16, "w2"), null);
  ok("C7 the damage path adds it as total damage, names it, and reads its magic and materials",
    /const bonded = weaponScalingProfile\(unarmedAbilityCarriers\(actor\), weapon, Number\(actor\?\.system\?\.combat\?\.bab\?\.total \?\? 0\)\);/.test(aw)
    && /if \(bondedFlat\) formula \+= ` \+ \$\{bondedFlat\}`;/.test(aw)
    && /if \(bondedFlat\) lines\.push\(line\(`<em>\$\{bonded\.flatLabel\}: total damage\.<\/em>`\)\);/.test(aw)
    && /\|\| Boolean\(bonded\?\.magical\);/.test(aw)
    && /\.\.\.\(bonded\?\.materials \?\? \[\]\)\]\.filter\(Boolean\)\.join\(", "\),/.test(aw));
}

/* C8 — sheathed */
{
  const sh = await imp("combat/sheathed.mjs");
  const cd = await imp("conditionals.mjs");
  const w = (system) => ({ type: "weapon", system: { quantity: 1, ...system } });
  const items = [w({ group: "sword" }), w({ group: "sword", equipped: true }), w({ group: "sword", stowed: true }), w({ group: "axe", quantity: 0 }), w({ group: "sword", natural: true }), { type: "gear", system: { group: "sword" } }];
  equal("C8 carried, not wielded, not packed away, not natural (B7-5)", [sh.sheathedWeapons(items, "sword").length, sh.sheathedWeapons(items, "axe").length, sh.sheathedGroups(items)], [1, 0, ["sword"]]);
  ok("C8 the axis is declared, a list", cd.SCOPE_AXES.includes("sheathedGroups") && cd.AXIS_CONTEXT_KEYS.sheathedGroups === "sheathedGroups");
  const e = cd.normaliseConditional({ kind: "modifier", value: 25, type: "class", label: "Iaijutsu Master", auto: true, when: { checkTypes: ["initiative"], sheathedGroups: ["Sword"] } }, { name: "Iaijutsu Master" }, 0);
  equal("C8 Initiative with a sword sheathed, not without, not on another roll",
    [cd.matchesCheck(e, { checkType: "initiative", sheathedGroups: ["sword"] }), cd.matchesCheck(e, { checkType: "initiative", sheathedGroups: [] }), cd.matchesCheck(e, { checkType: "skill", sheathedGroups: ["sword"] })], [true, false, false]);
  ok("C8 every check fills it from the roller's items", /sheathedGroups: check\.sheathedGroups \|\| sheathedGroups\(check\.actor\?\.items \?\? \[\]\),/.test(ck) && /this\.sheathedGroups = config\.sheathedGroups \?\? "";/.test(ck));
  ok("C8 a module can ask", /sheathedWeapons: async \(actor, group = ""\) =>/.test(api));
}

/* C9 — no reactions */
{
  const re = await imp("combat/reactions.mjs");
  const eff = (f, extra = {}) => ({ name: "Drawn Verdict", disabled: false, ...extra, getFlag: (s, k) => f[k] });
  const actor = (effects) => ({ effects, hasCondition: () => false });
  equal("C9 an effect declaring noReactions takes them; a disabled one does not; the reason names it",
    [re.declaredReactionBlock(actor([eff({ noReactions: true })])), re.declaredReactionBlock(actor([eff({ noReactions: true }, { disabled: true })])), re.declaredReactionBlock(actor([]))],
    ["Drawn Verdict: no Reactions", "", ""]);
  equal("C9 …and the actor's block says so (after the four the system names)", [re.actorReactionBlock(actor([eff({ noReactions: true })])), re.actorReactionBlock(actor([]))], ["Drawn Verdict: no Reactions", null]);
  ok("C9 a module's reaction is refused by the same blocks, before the count", /const blocked = actorReactionBlock\(actor\);\n\s*if \(blocked\) return `\$\{actor\.name\}: \$\{blocked\}\.`;\n\s*if \(Number\(actor\.system\?\.resources\?\.reactions\?\.value \?\? 0\) <= 0\)/.test(read("module", "combat", "action-points-workflow.mjs")));
  ok("C9 a Strike with noReactions offers its target no defence, no critical replacement, no reactive disarm or Savage Jaw, no miss reaction, and says so on the hook",
    /\s noReactions = false,\n\s*extraPrecisionDice = 0,/.test(aw)
    && /if \(targetActor && !noReactions\) \{\n\s*const \{ offerDefences \}/.test(aw)
    && /targetActor && !noReactions\) \{\n\s*const \{ offerCriticalReplacement \}/.test(aw)
    && /if \(!noReactions\) await offerReactiveDisarm\(targetActor, actor, weapon\);/.test(aw)
    && /const jaw = noReactions \? null : savageJawOffer\(/.test(aw)
    && /if \(outcome\.resolved && !outcome\.hits && targetActor && !noReactions\) \{/.test(aw)
    && /noReactions: Boolean\(noReactions\)\n\s*\}\);/.test(aw));
  ok("C9 …while the target's conviction reroll and an ally's intercept are still asked",
    /if \(targetActor && !presetDice\) \{\n\s*const \{ offerAttackReroll, postRerollCard \}/.test(aw)
    && /if \(targetToken && targetActor && !isReaction && !skipTargetPrompt\) \{\n\s*const \{ offerIntercepts \}/.test(aw));
}

/* C10, C11, C12 — helpers */
{
  const ti = await imp("temporary-immunity.mjs");
  ok("C10 temporary immunity: the record on the target, refused while running, the longer expiry winning",
    /temporaryImmunityRefusal: async \(target, key\) => \{/.test(api) && /if \(!t\.isTemporarilyImmune\(record, key, now\)\) return "";/.test(api)
    && /await target\?\.setFlag\?\.\(SYSTEM_ID, t\.IMMUNITY_FLAG, t\.withImmunity\(t\.prunedImmunities\(record, now\), key, seconds, now\)\);/.test(api)
    && /import \{ SYSTEM_ID, contentPack, contentPacksFor, isFederated \} from "\.\/content-packs\.mjs";/.test(api)
    && ti.IMMUNITY_FLAG === "temporaryImmunity");
  ok("C11 an affliction's save now, without the interval's damage", /rollAfflictionSave: async \(actor, affliction\) => \(await import\("\.\/combat\/affliction-workflow\.mjs"\)\)\.rollAfflictionStageSave\(actor, affliction, \{ withDamage: false \}\),/.test(api));
  ok("C12 a spell cast as innate once: a temporary copy, innate, with no daily count, its ability and tradition, through castSpell",
    /castInnateOnce: async \(actor, spellData, \{ ability = "", tradition = "", allowance = 0 \} = \{\}\) => \{/.test(api)
    && /data\.system = \{ \.\.\.\(data\.system \?\? \{\}\), innate: true \};/.test(api)
    && /delete data\.system\.usesPerDay;/.test(api)
    && /setProperty\(data, `flags\.\$\{SYSTEM_ID\}\.castingAbilityOverride`, ability\);/.test(api)
    && /const spell = new Item\.implementation\(data, \{ parent: actor \}\);\n\s*const \{ castSpell \} = await import\("\.\/magic\/cast-workflow\.mjs"\);\n\s*return castSpell\(actor, spell\);/.test(api));
}

/* C13 — what a Refocus restores */
{
  const cd = await imp("conditionals.mjs");
  ok("C13 the axis is declared, a list", cd.SCOPE_AXES.includes("restores") && cd.AXIS_CONTEXT_KEYS.restores === "restores");
  const e = cd.normaliseConditional({ kind: "modifier", value: 2, type: "class", label: "Veilborn", auto: true, when: { actions: ["refocus"], restores: ["Ghost Art"] } }, { name: "Veilborn" }, 0);
  equal("C13 +2 restoring a Ghost Art; not another item; not without one named",
    [cd.matchesCheck(e, { actionKey: "refocus", restores: ["Ghost Art", "Shadow Step"] }), cd.matchesCheck(e, { actionKey: "refocus", restores: ["Combat Form"] }), cd.matchesCheck(e, { actionKey: "refocus" })], [true, false, false]);
  ok("C13 the Refocus names its item's category and name to the check, which passes them on",
    /\.\.\.\(refocusTarget \? \{ restores: \[refocusTarget\.system\?\.category, refocusTarget\.name\]/.test(acw)
    && /this\.restores = config\.restores \?\? "";/.test(ck) && /restores: check\.restores\n\s*\};/.test(ck));
}

/* C14 — a spell's own bonus */
{
  const sb = await imp("magic/spell-own-bonus.mjs");
  equal("C14 read off the spell's copy; nothing when absent or zero",
    [sb.spellOwnBonus({ name: "Charm", flags: { "trg-prime": { spellBonus: { attack: 1, dc: 1, type: "Class", label: "Lotus Enchanter" } } } }), sb.spellOwnBonus({ name: "Charm" }), sb.spellOwnBonus({ flags: { "trg-prime": { spellBonus: { attack: 0, dc: 0 } } } })],
    [{ attack: 1, dc: 1, type: "class", label: "Lotus Enchanter" }, null, null]);
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("C14 the innate attack and the save DC add it, never on an item's cast",
    /const ownBonus = spellOwnBonus\(spell\);/.test(cw)
    && /\.\.\.\(ownBonus\?\.attack && !isItemCast \? \[\{ label: ownBonus\.label, value: ownBonus\.attack, type: ownBonus\.type \}\] : \[\]\)/.test(cw)
    && /\.\.\.\(spellOwnBonus\(spell\)\?\.dc && !isItemCast \? \[/.test(cw));
}

/* C15 — a stack group */
{
  const r = await imp("dice/resolution.mjs");
  const out = r.applyStacking([
    { label: "Echoing Crane", value: 3, type: "class", stackGroup: "formbinder:db" }, { label: "Iron Tortoise", value: 2, type: "class", stackGroup: "formbinder:db" },
    { label: "Twin Dragon", value: 1, type: "class", stackGroup: "formbinder:db" }, { label: "Shield of Faith", value: 2, type: "class" },
    { label: "Penalty", value: -1, type: "class", stackGroup: "formbinder:db" }, { label: "Other group", value: 1, type: "class", stackGroup: "x" }]);
  equal("C15 of a group only the greatest bonus applies, whatever else stacks; a penalty and another group are untouched",
    [out.total, out.modifiers.map((m) => m.applied)], [3 + 2 - 1 + 1, [true, false, false, true, true, true]]);
  equal("C15 with no group, class bonuses stack as before", r.applyStacking([{ label: "A", value: 3, type: "class" }, { label: "B", value: 2, type: "class" }]).total, 5);
  const cd = await imp("conditionals.mjs");
  const e = cd.normaliseConditional({ kind: "modifier", value: 2, type: "class", label: "A", auto: true, stackGroup: "g1", when: { checkTypes: ["attack"] } }, { name: "A" }, 0);
  equal("C15 a conditional carries its group onto the modifier it gives", cd.automaticSelections([e], { checkType: "attack" }).modifiers, [{ label: "A", value: 2, type: "class", stackGroup: "g1" }]);
  const sr = await imp("stat-rows.mjs");
  equal("C15 a stat row carries it too", sr.statRowEntries([{ target: "defence", value: 2, type: "class", label: "Iron Tortoise", stackGroup: "g1" }], {})[0].entry.stackGroup, "g1");
  ok("C15 the bonus pool hands it to the stacking", /\.\.\.\(entry\.stackGroup \? \{ stackGroup: String\(entry\.stackGroup\) \} : \{\}\)/.test(read("module", "bonuses", "registry.mjs")));
}

/* C16 — "Learned Caster" */
{
  const pq = await imp("prerequisites.mjs");
  const pre = "Learned Caster, Arcana 2 ranks, Nature 2 ranks, Religion 2 ranks";
  const st = (casterStyle) => ({ ...(casterStyle === undefined ? {} : { casterStyle }), skillRanks: { arcana: 2, nature: 2, religion: 2 } });
  equal("C16 the clause is read; a learned caster meets it, an instinctive one or a non-caster does not, and an unsaid style passes open",
    [pq.parsePrerequisiteClause("Learned Caster"), pq.meetsParseablePrerequisites(pre, st("learned")), pq.meetsParseablePrerequisites(pre, st("instinctive")), pq.meetsParseablePrerequisites(pre, st("")), pq.meetsParseablePrerequisites(pre, st(undefined))],
    [{ type: "casterStyle", style: "learned" }, true, false, false, true]);
  ok("C16 the picker says how the class casts, resolved as the actor derives it (an Enigma Wizard is instinctive; review)",
    /casterStyle: String\(resolveCasterStyle\(Array\.from\(actor\?\.items \?\? \[\]\)\.find\(\(i\) => i\?\.type === "class"\)\?\.system\?\.casterStyle \?\? "", Array\.from\(actor\?\.items \?\? \[\]\)\) \?\? ""\)\.trim\(\)\.toLowerCase\(\)/.test(pf)
    && /import \{ resolveCasterStyle \} from "\.\/magic\/caster-style\.mjs";/.test(pf));
  const cs = await imp("magic/caster-style.mjs");
  equal("C16 …which an owned override changes", [cs.resolveCasterStyle("learned", [{ type: "feat", name: "Enigma", system: { casterStyle: "instinctive" } }]), cs.resolveCasterStyle("learned", [])], ["instinctive", "learned"]);
}

/* R — found in review, before release */
{
  const mapi = await imp("module-api.mjs");
  const pk = await imp("picker-filters.mjs");
  mapi.resetModuleRegistry();
  mapi.registerClass("Kensai", { tier: "Martial" }, "verify-block7-core");
  const opened = pk.buildPickerFilter("classFeat", { class: "Fighter", ownClass: "Fighter", tier: "Martial", traitClasses: "Kensai", archetypes: "" });
  const plain = pk.buildPickerFilter("classFeat", { class: "Fighter", ownClass: "Fighter", tier: "Martial", traitClasses: "", archetypes: "" });
  const traited = { name: "A", system: { category: "Class", traits: "Kensai", sourceClass: "Kensai", prerequisites: "" } };
  const tagged = { name: "B", system: { category: "Class", traits: "Martial", sourceClass: "Kensai", prerequisites: "" } };
  equal("R a class's trait opened by a feat passes the source gate for a feat carrying that trait (Steel Disciple's Kensai feats); a feat only tagged for the class stays closed",
    [opened(traited), plain(traited), opened(tagged)], [true, false, false]);
  mapi.resetModuleRegistry();
  const dlg = read("module", "apps", "check-dialog.mjs");
  ok("R the check dialog carries what is sheathed and what a Refocus restores (BOTH PATHS OR NEITHER)",
    /restores = "",\n(?:\s*\/\/[^\n]*\n)*\s*sheathedGroups = "",\n\s*defaultDifficulty = "medium"/.test(dlg) && /sheathedGroups: sheathedGroups \|\| sheathedGroupsOf\(actor\?\.items \?\? \[\]\), restores\n/.test(dlg) && /import \{ sheathedGroups as sheathedGroupsOf \} from "\.\.\/combat\/sheathed\.mjs";/.test(dlg));
  ok("R Refocus names its ability before the dialog opens, and hands it to the dialog",
    acw.indexOf("const pick = await chooseRefocusTarget(actor, { event });") > 0 && acw.indexOf("const pick = await chooseRefocusTarget(actor, { event });") < acw.indexOf("situational = await promptCheckConfiguration({")
    && /restores: refocusTarget \? \[refocusTarget\.system\?\.category, refocusTarget\.name\]\.map\(\(v\) => String\(v \?\? ""\)\.trim\(\)\)\.filter\(Boolean\) : \[\],/.test(acw));
}

// 3.671.0 OR LATER: a later release keeps these seams.
{
  const [ma, mi, pa] = String(JSON.parse(read("system.json")).version).split(".").map(Number);
  ok("Z0 the system is 3.671.0 or later", ma > 3 || (ma === 3 && (mi > 671 || (mi === 671 && pa >= 0))));
}

const EXPECTED = 59;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block7-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block7-core: ${checks} checks — all green.`);
