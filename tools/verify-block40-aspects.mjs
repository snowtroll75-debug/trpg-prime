#!/usr/bin/env node
/**
 * verify-block40-aspects — Appendix 4 (Divine Aspects), 3.623.0.
 *
 * Graham's rulings of 6 October 2026 on claude/audit-pages-410-end.md,
 * R1–R10, all "your recommendation":
 *
 *   A  R2  the Specialist Spell feat: your aspect's spells, the Cleric
 *          specialist spells no aspect lists, your class's own — run over
 *          the shipped divine-aspects and spells packs
 *   B  R3  Cloistered Priest: the Cleric half of the same list
 *   C  R8  the Add Spell picker hides what the character cannot learn
 *   D  R4  who must hold an aspect, and the banner
 *   E  R5  one aspect at a time
 *   F  R6  the aspect's ethics
 *   G  R7  bonus spells above the level are taken back
 *   H  R10 the Champion's favoured-weapon proficiency; the family rule
 *   I  R1  no change: the aspect still serves a Crusader in full
 *   J  the wiring, and the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const R = await import("../module/aspect-rules.mjs");
const { buildPickerFilter } = await import("../module/picker-filters.mjs");
const { deityWeaponsApply, proficiencyProfile, isProficientWith } = await import("../module/proficiency-rules.mjs");
const { proficiencySummary } = await import("../module/proficiencies.mjs");
const { favouredWeaponMatches } = await import("../module/divine-aspect.mjs");
const { pruneAspectBonusSpells } = await import("../module/aspect-workflow.mjs");
const { ETHICS } = await import("../module/config.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const code = (...p) => read(...p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

async function packDocs(pack, prefix = "!items!") {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith(prefix) && !key.slice(prefix.length).includes("!")) out.push(value);
  }
  await db.close();
  return out;
}

const ASPECTS = await packDocs("divine-aspects");
const SPELLS = await packDocs("spells");
const aspect = (name) => ASPECTS.find((a) => a.name === name);
const ALL = R.aspectSpellKeys(ASPECTS);
const SPECIALISTS = SPELLS.filter((s) => s.system?.specialist);
const key = (v) => String(v ?? "").replace(/[\u2019\u2018']/g, "").trim().toLowerCase();

/** The specialist spells the R2 rule offers this character, as keys. */
function featOffer(myClasses, aspects) {
  const access = {
    myClasses, myAspectKeys: R.aspectSpellKeys(aspects), allAspectKeys: ALL, holdsAspect: aspects.length > 0
  };
  return new Set(SPECIALISTS
    .filter((s) => R.specialistSpellAccess({ ...access, spellName: s.name, specialistClass: s.system?.specialistClass }))
    .map((s) => key(s.name)));
}
const listOf = (a) => String(a.system.specialistSpells).split(",").map((n) => key(n)).filter(Boolean);
const clericFree = SPECIALISTS
  .filter((s) => /\bcleric\b/i.test(String(s.system?.specialistClass ?? "")) && !ALL.has(key(s.name)))
  .map((s) => key(s.name)).sort();
const crusaderList = SPECIALISTS.filter((s) => /^crusader$/i.test(String(s.system?.specialistClass ?? "").trim())).map((s) => key(s.name));

/* A — R2, the Specialist Spell feat, on the shipped packs */
{
  ok("A0 the packs: ten aspects, 43 or more distinct aspect spells, four Cleric specialist spells no aspect lists",
    ASPECTS.length >= 10 && ALL.size >= 43 && clericFree.length === 4,
    `${ASPECTS.length} aspects, ${ALL.size} spells, free ${clericFree.join(", ")}`);
  ok("A0b ...and they are Bless Water, Dissipate Into Mist, Moment Of Fortune and Reincarnated Embrace",
    JSON.stringify(clericFree) === JSON.stringify(["bless water", "dissipate into mist", "moment of fortune", "reincarnated embrace"]),
    clericFree.join(", "));
  const dawn = aspect("Dawn");
  const tyranny = aspect("Tyranny");
  const murder = aspect("Murder");
  const nature = aspect("Nature");

  const clericDawn = featOffer(["cleric"], [dawn]);
  const wantClericDawn = new Set([...listOf(dawn), ...clericFree]);
  ok("A1 a Cleric of Dawn: exactly Dawn's eight and the four free Cleric spells",
    clericDawn.size === wantClericDawn.size && [...wantClericDawn].every((k) => clericDawn.has(k)),
    `${[...clericDawn].sort().join(", ")}`);
  ok("A2 THE OLD DEFECT, cured: a Cleric of Dawn no longer reaches Tyranny's Touch of Obedience",
    !clericDawn.has("touch of obedience") && listOf(tyranny).includes("touch of obedience"));

  const crusaderDawn = featOffer(["crusader"], [dawn]);
  ok("A3 THE OLD DEFECT, cured: a Crusader of Dawn can buy Dawn's spells",
    listOf(dawn).every((k) => crusaderDawn.has(k)));
  ok("A4 ...and the free Cleric spells (\"additional Cleric Specialist Spells\"), and its own six",
    clericFree.every((k) => crusaderDawn.has(k)) && crusaderList.length === 6 && crusaderList.every((k) => crusaderDawn.has(k)));
  ok("A5 ...and nothing else", crusaderDawn.size === listOf(dawn).length + clericFree.length + crusaderList.length,
    String(crusaderDawn.size));

  ok("A6 a Cleric of Murder can buy Veiled Secret, tagged Wizard", featOffer(["cleric"], [murder]).has("veiled secret"));
  ok("A7 ...and a Wizard still can, by its tag", featOffer(["wizard"], []).has("veiled secret"));

  const druid = featOffer(["druid"], []);
  ok("A8 a Druid keeps Nature's three \"Cleric, Druid\" spells through its own tag",
    ["natures bounty", "soothing words", "vibrant thorns"].every((k) => druid.has(k)));
  ok("A9 a Cleric of Dawn does not reach them through the word \"Cleric\"",
    !clericDawn.has("natures bounty") && listOf(nature).includes("natures bounty"));

  const priest = featOffer(["fighter", "cleric"], []);
  ok("A10 a Fighter-Priest with no aspect: no aspect spell at all",
    ![...ALL].some((k) => priest.has(k)), [...priest].filter((k) => ALL.has(k)).join(", "));
  ok("A11 ...but the free Cleric spells, by the class the archetype opens", clericFree.every((k) => priest.has(k)));
  ok("A12 an aspect-less Crusader: its own six only", featOffer(["crusader"], []).size === 6);
  const bard = featOffer(["bard"], []);
  ok("A13 a Bard's list is untouched (13)", bard.size === 13, String(bard.size));
  ok("A14 a homebrew aspect's own list counts as an aspect list",
    R.specialistSpellAccess({ spellName: "Moonlit Psalm", specialistClass: "Cleric", myClasses: ["cleric"],
      myAspectKeys: new Set(["moonlit psalm"]), allAspectKeys: new Set(["moonlit psalm"]), holdsAspect: true }) &&
    !R.specialistSpellAccess({ spellName: "Moonlit Psalm", specialistClass: "Cleric", myClasses: ["cleric"],
      myAspectKeys: new Set(), allAspectKeys: new Set(["moonlit psalm"]), holdsAspect: true }));
  ok("A15 apostrophes and case do not matter (\"Renewals Touch\" vs \"Renewal’s Touch\")",
    R.aspectSpellKeys([{ system: { specialistSpells: "Renewal’s Touch" } }]).has("renewals touch"));
}

/* B — R3, Cloistered Priest */
{
  const dawn = aspect("Dawn");
  const offer = (aspects) => new Set(SPECIALISTS
    .filter((s) => R.clericSpecialistAccess({ spellName: s.name, specialistClass: s.system?.specialistClass,
      myAspectKeys: R.aspectSpellKeys(aspects), allAspectKeys: ALL }))
    .map((s) => key(s.name)));
  const withDawn = offer([dawn]);
  ok("B1 a Cloistered Priest of Dawn: Dawn's eight and the four free Cleric spells",
    withDawn.size === listOf(dawn).length + 4 && listOf(dawn).every((k) => withDawn.has(k)), String(withDawn.size));
  ok("B2 ...not another aspect's, and not the Crusader's six",
    !withDawn.has("touch of obedience") && !crusaderList.some((k) => withDawn.has(k)));
  ok("B3 with no aspect: the four free Cleric spells", offer([]).size === 4);
  const cw = code("module", "feats-workflow.mjs");
  const cp = cw.slice(cw.indexOf('"cloistered priest": {'), cw.indexOf('"enigma": {'));
  ok("B4 THE OLD DEFECT, cured: the chooser allows specialist spells and filters by the Cleric rule",
    /allowSpecialist: true/.test(cp) && /clericSpecialistAccess\(\{ \.\.\.access, spellName: s\.name, specialistClass: s\.system\?\.specialistClass \}\)/.test(cp)
      && !/divinity\/i\.test/.test(cp));
  ok("B5 ...at the Specialist Spell feat's PP ceiling, with the class tag in the index",
    /Number\(s\.system\?\.ppCost \?\? Infinity\) <= maxPP/.test(cp) && /indexFields: \["system\.specialistClass"\]/.test(cp));
}

/* C — R8, the Add Spell picker */
{
  ok("C1 the spell slot indexes the specialist fields",
    /spell: \{\s*pack: "spells",\s*title: "Add Spell",\s*fields: \["system\.tradition", "system\.specialist", "system\.specialistClass"\]/.test(code("module", "picker-filters.mjs")));
  const wizardAccess = { myClasses: ["wizard"], myAspectKeys: new Set(), allAspectKeys: ALL, holdsAspect: false };
  const wiz = buildPickerFilter("spell", { tradition: "arcane", specialistAccess: wizardAccess });
  const byName = (n) => SPELLS.find((s) => key(s.name) === key(n));
  ok("C2 THE OLD DEFECT, cured: a Wizard is not offered Healer's Grace", !wiz(byName("Healer's Grace")));
  const wizSpecial = SPECIALISTS.find((s) => /^wizard$/i.test(s.system?.specialistClass) && key(s.name) !== "veiled secret");
  ok("C3 ...a Wizard specialist spell still is", Boolean(wizSpecial) && wiz(wizSpecial), wizSpecial?.name);
  ok("C4 ...an ordinary arcane spell still is", wiz(SPELLS.find((s) => !s.system?.specialist && /arcane/i.test(s.system?.tradition))));
  ok("C5 a specialist spell nobody's tag or aspect claims is left alone",
    wiz({ name: "Orphan Hymn", system: { specialist: true, specialistClass: "", tradition: "" } }));
  const clericAccess = { myClasses: ["cleric"], myAspectKeys: R.aspectSpellKeys([aspect("Dawn")]), allAspectKeys: ALL, holdsAspect: true };
  const cl = buildPickerFilter("spell", { tradition: "divinity", specialistAccess: clericAccess });
  ok("C6 a Cleric of Dawn is offered Healer's Grace and not Touch of Obedience",
    cl(byName("Healer's Grace")) && !cl(byName("Touch of Obedience")));
  const none = buildPickerFilter("spell", { tradition: "", specialistAccess: wizardAccess });
  ok("C7 with no tradition yet, the specialist gate still runs (and nothing else)",
    typeof none === "function" && !none(byName("Healer's Grace")) && none(SPELLS.find((s) => !s.system?.specialist)));
  ok("C8 without access data the picker behaves as before", buildPickerFilter("spell", { tradition: "" }) === null
    && buildPickerFilter("spell", { tradition: "arcane" })(byName("Healer's Grace")));
  const sheet = code("module", "sheets", "actor-sheet.mjs");
  ok("C9 the sheet hands the picker the character's access, for the spell slot",
    /specialistAccess: slotKey === "spell"\s*\?\s*await \(await import\("\.\.\/aspect-workflow\.mjs"\)\)\.specialistAccessFor\(this\.actor\)/.test(sheet));
}

/* D — R4, who must hold an aspect */
{
  const src = R.divinityCasterSources;
  ok("D1 a Cleric (needs one)", src({ className: "Cleric", classNeedsAspect: true }).join() === "Cleric");
  ok("D2 any divinity caster class, needed or not",
    src({ className: "Oracle", classTradition: "divinity", classCasterStyle: "instinctive" }).join() === "Oracle");
  ok("D3 a Fighter who picked the divinity tradition is not a caster",
    src({ className: "Fighter", classTradition: "divinity", classCasterStyle: "" }).length === 0);
  ok("D4 Divine Knight, Priest, Champion and Cloistered Priest each count",
    src({ className: "Fighter", featNames: ["Divine Knight"], archetypeNames: ["Priest"] }).join() === "Divine Knight,Priest" &&
    src({ archetypeNames: ["Champion", "Cloistered Priest", "Warrior"] }).join() === "Champion,Cloistered Priest");
  ok("D5 a Wizard: none", src({ className: "Wizard", classTradition: "arcane", classCasterStyle: "learned" }).length === 0);
  const warn = R.aspectMissingWarning(["Divine Knight"], 0);
  ok("D6 the banner names the source while no aspect is held", /Divine Knight/.test(warn ?? "") && /Divine Aspect/.test(warn));
  ok("D7 ...and is gone with an aspect, or with no source", R.aspectMissingWarning(["Cleric"], 1) === null && R.aspectMissingWarning([], 0) === null);
  const sheet = code("module", "sheets", "actor-sheet.mjs");
  ok("D8 the sheet's button and banner come from divinityCasterSources",
    /const sources = divinityCasterSources\(\{/.test(sheet) && /context\.needsDivineAspect = sources\.length > 0/.test(sheet)
      && /context\.aspectMissingWarning = aspectMissingWarning\(/.test(sheet));
  ok("D9 the template shows the banner", /\{\{#if aspectMissingWarning\}\}[\s\S]{0,200}\{\{aspectMissingWarning\}\}/.test(read("templates", "actor", "actor-sheet.hbs")));
}

/* E — R5, one aspect */
{
  ok("E1 a second aspect is refused, naming the first",
    /already holds a Divine Aspect: Dawn/.test(R.secondAspectRefusal([{ name: "Dawn" }], "Tebb") ?? ""));
  ok("E2 the first is not", R.secondAspectRefusal([], "Tebb") === null);
  ok("E3 a repair tool may declare itself", R.secondAspectRefusal([{ name: "Dawn" }], "Tebb", { trgAllowSecondAspect: true }) === null);
  const item = code("module", "documents", "item.mjs");
  ok("E4 TRGItem._preCreate refuses it on every route",
    /if \(this\._refusedAsDuplicateIdentity\(options\)\) return false;\s*if \(this\._refusedAsSecondAspect\(options\)\) return false;/.test(item)
      && /_refusedAsSecondAspect\(options\) \{\s*if \(this\.type !== "divine-aspect"\) return false;/.test(item));
  ok("E5 the picker says so before it opens",
    /if \(slotKey === "divineAspect"\) \{\s*const refusal = secondAspectRefusal\(/.test(code("module", "sheets", "actor-sheet.mjs")));
}

/* F — R6, ethics */
{
  const dawn = aspect("Dawn");
  const view = R.aspectEthicsChoices(ETHICS, [dawn], "");
  ok("F1 a Cleric of Dawn is offered Altruism, Benevolence and Harmony only",
    view.restricted && JSON.stringify(Object.values(view.choices)) === JSON.stringify(["—", "Altruism", "Benevolence", "Harmony"]),
    JSON.stringify(view.choices));
  const off = R.aspectEthicsChoices(ETHICS, [dawn], "malevolence");
  ok("F2 an ethic chosen outside them stays, labelled, with the warning",
    off.offList === "Malevolence" && /not your aspect's/.test(off.choices.malevolence ?? ""));
  ok("F3 with no aspect, all fifteen", Object.keys(R.aspectEthicsChoices(ETHICS, [], "").choices).length === Object.keys(ETHICS).length + 1);
  ok("F4 every shipped aspect restricts to exactly three",
    ASPECTS.every((a) => Object.keys(R.aspectEthicsChoices(ETHICS, [a], "").choices).length === 4));
  ok("F5 an aspect whose ethics name nothing known restricts nothing",
    !R.aspectEthicsChoices(ETHICS, [{ system: { suggestedEthics: "Whimsy" } }], "").restricted);
  const sheet = code("module", "sheets", "actor-sheet.mjs");
  ok("F6 the sheet's dropdown and warning come from aspectEthicsChoices",
    /const ethicsView = aspectEthicsChoices\(/.test(sheet) && /context\.ethicsChoices = ethicsView\.choices;/.test(sheet)
      && /context\.ethicsOffList = ethicsView\.offList;/.test(sheet) && /\{\{#if ethicsOffList\}\}/.test(read("templates", "actor", "actor-sheet.hbs")));
}

/* G — R7, bonus spells on a level drop */
{
  const entries = [{ level: 1, name: "Orb of Fire" }, { level: 2, name: "Burning Hands" }, { level: 6, name: "Fireball" }, { level: 8, name: "Wall of Fire" }];
  const by = (id, requested, extra = {}) => ({ id, grantedBy: { sourceId: "dawn", requested }, ...extra });
  const spells = [by("a", "Orb of Fire"), by("b", "Burning Hands"), by("c", "Fireball"), by("d", "Wall of Fire"),
    { id: "e", grantedBy: { sourceId: "war", requested: "Fireball" } }, by("f", "Wall of Fire", { specialistPick: true }),
    { id: "g", grantedBy: null }];
  const ids = R.bonusSpellsAboveLevel({ aspect: { id: "dawn", entries }, spells, level: 5 });
  ok("G1 THE OLD DEFECT, cured: 8th → 5th takes back Fireball and Wall of Fire", JSON.stringify(ids) === JSON.stringify(["c", "d"]), JSON.stringify(ids));
  ok("G2 at 8th nothing goes", R.bonusSpellsAboveLevel({ aspect: { id: "dawn", entries }, spells, level: 8 }).length === 0);
  ok("G3 another aspect's spell, the specialist pick and a hand-added copy are never touched",
    !R.bonusSpellsAboveLevel({ aspect: { id: "dawn", entries }, spells, level: 1 }).some((id) => ["e", "f", "g"].includes(id)));

  // Driven through the workflow on a fake actor.
  const made = [
    { id: "asp", type: "divine-aspect", name: "Dawn", system: { bonusSpells: "1: Orb of Fire, 2: Burning Hands, 6: Fireball, 8: Wall of Fire" } },
    { id: "s1", type: "spell", name: "Fireball", flags: { "trg-prime": { grantedBy: { sourceId: "asp", requested: "Fireball" } } } },
    { id: "s2", type: "spell", name: "Orb of Fire", flags: { "trg-prime": { grantedBy: { sourceId: "asp", requested: "Orb of Fire" } } } }
  ];
  const deleted = [];
  const items = Object.assign([...made], { get: (id) => made.find((i) => i.id === id) });
  const actor = { items, system: { identity: { level: 4 } }, deleteEmbeddedDocuments: async (t, ids) => { deleted.push(...ids); } };
  const lines = await pruneAspectBonusSpells(actor);
  ok("G4 pruneAspectBonusSpells deletes Fireball at 4th and says so",
    JSON.stringify(deleted) === JSON.stringify(["s1"]) && /Fireball/.test(lines.join(" ")), `${deleted} ${lines}`);
  ok("G5 the level hook runs it after the grant pass",
    /await queueGrantPass\(actor\);[\s\S]{0,700}const pruned = await pruneAspectBonusSpells\(actor\);/.test(code("module", "grant-autorun.mjs")));
}

/* H — R10, the Champion; the family rule */
{
  ok("H1 the class table still decides for Cleric and Crusader", deityWeaponsApply({ deityWeapons: true }, []));
  ok("H2 the Deific Aspect ability decides for anyone else", deityWeaponsApply(null, [{ type: "ability", name: "Deific Aspect" }]));
  ok("H3 neither: no", !deityWeaponsApply({ deityWeapons: false }, [{ type: "feat", name: "Deific Aspect" }]));
  const actorOf = (items) => ({ items, effects: [], appliedEffects: [], system: {} });
  const khopesh = { type: "weapon", name: "Khopesh", system: { category: "Exotic", group: "Sword" } };
  const champ = actorOf([
    { type: "class", name: "Bard", system: {} },
    { type: "feat", name: "Champion", system: { category: "Archetype" } },
    { type: "ability", name: "Deific Aspect", system: {} },
    { type: "divine-aspect", name: "Pandemonium", system: { favouredWeapon: "Khopesh" } }
  ]);
  ok("H4 THE OLD DEFECT, cured: a Champion Bard is proficient with Pandemonium's Khopesh",
    isProficientWith(proficiencyProfile(champ), khopesh));
  const bare = actorOf([{ type: "class", name: "Bard", system: {} }, { type: "divine-aspect", name: "Pandemonium", system: { favouredWeapon: "Khopesh" } }]);
  ok("H5 a Bard merely carrying an aspect item is not", !isProficientWith(proficiencyProfile(bare), khopesh));
  ok("H6 the sheet's summary follows the engine", JSON.stringify(proficiencySummary(champ)).includes("Khopesh")
    && !JSON.stringify(proficiencySummary(bare)).includes("Khopesh"));
  ok("H7 the family rule (R9 kept): Heavy Mace joins Mace; Staff Sling, Mace of Disruption and Dagger-Axe do not",
    favouredWeaponMatches("Mace", "Heavy Mace") && favouredWeaponMatches("Battleaxe", "Battle Axe")
      && !favouredWeaponMatches("Staff", "Staff Sling") && !favouredWeaponMatches("Mace", "Mace of Disruption")
      && !favouredWeaponMatches("Dagger", "Dagger-Axe"));
}

/* I — R1, no change */
{
  const cs = code("module", "class-skills.mjs");
  ok("I1 the aspect's class skill is still a generic source (Crusader included)", /for \(const aspect of aspects\)/.test(cs));
  ok("I2 bonus spells are still a levelled grant on the aspect, whoever holds it",
    /"divine-aspect": \[\s*\{ field: "bonusSpells", pack: "spells", levelled: true \}/.test(code("module", "grants-workflow.mjs")));
}

/* J — the wiring, and the version */
{
  const fw = code("module", "feats-workflow.mjs");
  const at = fw.indexOf('"specialist spell": {');
  const ss = at < 0 ? "" : fw.slice(at, at + 4000);
  ok("J1 the Specialist Spell feat filters through specialistSpellAccess with the actor's aspect data",
    /const access = await specialistAccessFor\(actor\);/.test(ss) &&
    /if \(!specialistSpellAccess\(\{\s*\.\.\.access,\s*myClasses: mine,\s*spellName: s\.name,\s*specialistClass: s\.system\?\.specialistClass\s*\}\)\) return false;/.test(ss));
  ok("J2 the old class-tag-only test is gone", !/if \(!lists\.length \|\| !lists\.some\(\(n\) => mine\.has\(n\)\)\) return false;/.test(fw));
  ok("J3 the aspect universe reads the federated divine-aspects pack",
    /contentPack\("divine-aspects"\)/.test(code("module", "aspect-workflow.mjs")));
  const sys = JSON.parse(read("system.json"));
  ok("J4 the version is 3.623.0 or later", String(sys.version).localeCompare("3.623.0", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-block40-aspects: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block40-aspects: OK — ${checks} checks. Appendix 4: who learns an aspect's spells, who must hold one, one at a time, its ethics, its level, its weapon.`);
