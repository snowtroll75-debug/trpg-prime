#!/usr/bin/env node
/**
 * verify-ea-block3a-core — TRG Prime 3.680.0: the seams Eldritch Arts' Block
 * 3a (the Archmage, the Sorcerer and its birthrights, the Witch and her
 * Soulbound Familiar) needs, from the Block 3 audit
 * (docs/ELDRITCH_ARTS_BLOCK3_AUDIT.md in the module), answered by Graham on
 * 2 November 2026 ("your proposals all work").
 *
 *   C   a class's own magic, declared: its traditions, a subclass's ability
 *       and home tradition, its book ladder, its cantrip book, its further
 *       repertoire tracks, its cantrip slots
 *   HM  High Magic for some traditions only (the Witch), and the
 *       forbidden-tradition gate set aside for a High Magic cast
 *   PK  the pickers, run: the book, the repertoire and its tracks, the
 *       cantrips and their slots, Learn a Spell, memorisation
 *   CAP a module's raise of the PP cap per cast (Raw Power)
 *   SP  a specialist spell opened to a character
 *   FAM a familiar's modifiers (the Soulbound Familiar)
 *   PP  a PP grant by feature name, and the registered racial PP that
 *       reached no character (found by the audit)
 *   AB  an attack rolled with BSB in place of BAB (Dragon Claws)
 *   N   the cast's unmodified die on the settled hook
 *   Z   the version
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

globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), escapeHTML: (s) => String(s) } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = globalThis.Hooks ?? { on() {}, callAll() {} };

const api = await imp("module-api.mjs");
const cm = await imp("magic/class-magic.mjs");
const hm = await imp("magic/high-magic.mjs");
const cp = await imp("class-progression.mjs");
const cd = await imp("class-derive.mjs");
const sb = await imp("magic/spellbook.mjs");
const sa = await imp("magic/spell-availability.mjs");
const rw = await imp("magic/repertoire-workflow.mjs");
const sbw = await imp("magic/spellbook-workflow.mjs");
const mw = await imp("magic/memorisation-workflow.mjs");
const cap = await imp("magic/cast-cap.mjs");
const fam = await imp("familiar.mjs");
const fm = await imp("familiar-modifiers.mjs");
const fw = await imp("feats-workflow.mjs");
const ab = await imp("combat/attack-base.mjs");
const sys = JSON.parse(read("system.json"));
const cw = read("module", "magic", "cast-workflow.mjs");
const apw = read("module", "module-api-workflow.mjs");
const actorSrc = read("module", "documents", "actor.mjs");
const featsSrc = read("module", "feats-workflow.mjs");
const attackSrc = read("module", "combat", "attack-workflow.mjs");
const sheet = read("templates", "actor", "actor-sheet.hbs");
const quiet = (fn) => async (...a) => { const e = console.error; console.error = () => {}; try { return await fn(...a); } finally { console.error = e; } };

/* ----------------------------------------------------------------- */
/* Test material                                                       */
/* ----------------------------------------------------------------- */
const row = (level) => ({ level, bab: 0, bdb: 0, fortitude: 0, reflex: 0, will: 6, bonusFeats: 0, casterLevel: level, pp: 5 * level, bsb: level });
const table = Array.from({ length: 20 }, (_, i) => row(i + 1));
const flags = (f) => ({ "trg-prime": f });
const classItem = (name, system, f = {}) => ({ type: "class", name, id: name, system: { classType: "Adept", progression: table, ...system }, flags: flags(f) });
const ability = (name, f = {}, active = true) => ({ type: "ability", name, id: name, system: { active }, flags: flags(f) });
const spellEntry = (name, tradition, pp, extra = {}) => ({ _id: name, name, system: { tradition, ppCost: pp, specialist: false, category: "", ...extra } });
const spellItem = (name, tradition, pp, f = {}, system = {}) => ({ type: "spell", name, id: name, system: { tradition, ppCost: pp, prepared: false, ...system }, flags: flags(f), _stats: {} });
function actorOf({ level = 1, items = [], tradition = "" } = {}) {
  const actor = { items, flags: { "trg-prime": {} }, getFlag: () => undefined, system: { identity: { level }, magic: { tradition }, attributes: {} } };
  cd.prepareClassProgression(actor.system, actor);
  // What actor.mjs does with the class's tradition and ability.
  if (actor.system.progression?.tradition) actor.system.magic.tradition = actor.system.progression.tradition;
  actor.system.magic.casterLevelValue = cp.classCasts(actor.system.progression) ? Number(actor.system.progression.casterLevel) : 0;
  return actor;
}

const ARCHMAGE = classItem("ZZ Archmage", { magicalTradition: "arcane", magicalAbility: "intelligence", casterStyle: "learned", memorisationStyle: "book", spellBookFirstPicks: 6, cantripsPerDay: 3, cantripsKnown: 6 },
  { highMagicCaster: true, highMagicFocus: true, classMagic: { traditions: "any", bookPerLevel: 1, cantripBook: true } });
const SORCERER = classItem("ZZ Sorcerer", { magicalTradition: "", magicalAbility: "", casterStyle: "instinctive", cantripsKnown: 2 },
  { highMagicCaster: true, repertoire: { firstPicks: 1, firstPickExact: false, pickFrom: 3, pickStep: 2, swapFrom: 99 },
    classMagic: { traditions: "any", tracks: [{ key: "birthright", label: "Birthright", firstPicks: 0, pickFrom: 2, pickStep: 2, traditions: "track" }],
      cantrips: [{ label: "birthright cantrip", track: "birthright" }, { label: "cantrip of any tradition", traditions: "any" }] } });
const STORM = ability("ZZ Storm", { classMagic: { ability: "constitution", tradition: "verdant", tracks: { birthright: "verdant" } } });
const WILD = ability("ZZ Wild", { classMagic: { ability: "charisma", tradition: "", tracks: { birthright: "any" } } });
const WITCH = classItem("ZZ Witch", { magicalTradition: "ethereal", magicalAbility: "charisma", casterStyle: "instinctive", cantripsKnown: 2 },
  { highMagicCaster: ["ethereal", "verdant"], repertoire: { firstPicks: 2, firstPickExact: false, pickFrom: 2, pickStep: 1, swapFrom: 99 },
    classMagic: { traditions: ["ethereal", "verdant"] } });
const WIZARD = classItem("ZZ Wizard", { magicalTradition: "arcane", magicalAbility: "intelligence", casterStyle: "learned", memorisationStyle: "book", spellBookFirstPicks: 6, cantripsPerDay: 4 });

/* ----------------------------------------------------------------- */
/* C — a class's own magic                                             */
/* ----------------------------------------------------------------- */
{
  equal("C traditionRule: true and \"any\" are any; a list is cleaned; unknowns drop; nothing left is null",
    [cm.traditionRule(true), cm.traditionRule("ANY"), cm.traditionRule(["Ethereal", "divine", "verdant", "nonsense"]), cm.traditionRule("arcane, verdant"), cm.traditionRule(["nonsense"]), cm.traditionRule(undefined)],
    ["any", "any", ["ethereal", "divinity", "verdant"], ["arcane", "verdant"], null, null]);
  equal("C traditionAllowed: any; a list against every printed tradition, not the first; a universal spell; no rule admits nothing",
    [cm.traditionAllowed("any", "arcane"), cm.traditionAllowed(["verdant"], "arcane, verdant"), cm.traditionAllowed(["ethereal"], "arcane, verdant"), cm.traditionAllowed(["ethereal"], ""), cm.traditionAllowed(null, "arcane")],
    [true, true, false, true, false]);

  const plain = cm.classMagicOf(WIZARD, []);
  equal("C a class that declares nothing declares nothing", [plain.declared, plain.traditions, plain.tradition, plain.ability, plain.tracks, plain.cantrips], [false, null, null, "", [], []]);
  const arch = cm.classMagicOf(ARCHMAGE, []);
  equal("C the Archmage: every tradition, one a level, a cantrip book", [arch.declared, arch.traditions, arch.bookPerLevel, arch.cantripBook], [true, "any", 1, true]);

  const noBirthright = cm.classMagicOf(SORCERER, []);
  equal("C the Sorcerer before a birthright: no ability, no home, the birthright track and cantrip waiting (null)",
    [noBirthright.ability, noBirthright.tradition, noBirthright.tracks[0].traditions, noBirthright.cantrips.map((c) => c.traditions)], ["", null, null, [null, "any"]]);
  const storm = cm.classMagicOf(SORCERER, [STORM]);
  equal("C the Storm birthright: Constitution, verdant home, the verdant track and cantrip",
    [storm.ability, storm.tradition, storm.tracks[0].traditions, storm.cantrips.map((c) => c.traditions), storm.subclass], ["constitution", "verdant", ["verdant"], [["verdant"], "any"], "ZZ Storm"]);
  const wild = cm.classMagicOf(SORCERER, [WILD]);
  equal("C the Wild birthright: Charisma, no home tradition (\"\" is an answer), any tradition for its track",
    [wild.ability, wild.tradition, wild.tracks[0].traditions], ["charisma", "", "any"]);
  equal("C a switched-off subclass answers nothing", cm.classMagicOf(SORCERER, [{ ...STORM, system: { active: false } }]).ability, "");
  equal("C an unknown ability is refused", cm.classMagicOf(SORCERER, [ability("x", { classMagic: { ability: "luck" } })]).ability, "");

  const prog = cp.resolveClassProgression(SORCERER, 3);
  cm.applyClassMagic(prog, storm);
  equal("C applied: the birthright's ability and tradition replace the class's, so the class casts",
    [prog.magicalAbility, prog.tradition, prog.learnTraditions, cp.classCasts(prog)], ["constitution", "verdant", "any", true]);
  const before = cp.resolveClassProgression(SORCERER, 3);
  equal("C …and before the birthright the Sorcerer does not cast (caster level 0, as a blank ability always meant)", cp.classCasts(cm.applyClassMagic(before, noBirthright)), false);
  const wizProg = cp.resolveClassProgression(WIZARD, 3);
  equal("C a class that declares nothing is untouched", [cm.applyClassMagic(wizProg, plain).learnTraditions, wizProg.classMagic], [undefined, undefined]);

  const a = actorOf({ level: 3, items: [SORCERER, STORM] });
  equal("C prepareClassProgression folds the declarations in", [a.system.progression.magicalAbility, a.system.progression.tradition, a.system.magic.tradition], ["constitution", "verdant", "verdant"]);

  equal("C the pick rule: own + widened, any wins, none is null",
    [cm.pickTraditionRule("ethereal", ["ethereal", "verdant"]), cm.pickTraditionRule("arcane", "any"), cm.pickTraditionRule("arcane", null), cm.pickTraditionRule("", null)],
    [["ethereal", "verdant"], "any", ["arcane"], null]);
  equal("C learnTraditionsRule joins a class's and a creature's", [cm.learnTraditionsRule(["ethereal"], ["arcane"]), cm.learnTraditionsRule(null, "any"), cm.learnTraditionsRule(null, null)], [["ethereal", "arcane"], "any", null]);
  equal("C the book ladder: two by default, the class's own when declared", [cm.bookSlotsPerLevel(null), cm.bookSlotsPerLevel(arch), cm.bookSlotsPerLevel({ bookPerLevel: 0 })], [2, 1, 0]);
  const track = storm.tracks[0];
  equal("C the birthright track: 2nd, 4th, 6th …; nothing at 1st",
    [1, 2, 3, 4, 5, 6, 20].map((l) => cm.trackPickCount(track, l)), [0, 1, 1, 2, 2, 3, 10]);
  equal("C …its next pick", [cm.trackNextPickLevel(track, 1), cm.trackNextPickLevel(track, 2), cm.trackNextPickLevel(track, 19), cm.trackNextPickLevel(track, 20)], [2, 4, 20, null]);
  equal("C the cantrip slots fill most restrictive first, whatever order they were known in",
    [cm.nextCantripSlot(storm.cantrips, []), cm.nextCantripSlot(storm.cantrips, ["verdant"]), cm.nextCantripSlot(storm.cantrips, ["arcane"]), cm.nextCantripSlot(storm.cantrips, ["arcane", "verdant"]), cm.nextCantripSlot(storm.cantrips, ["arcane", "divinity"])],
    [0, 1, 0, -1, 0]);
  equal("C …so an \"any\" slot printed first does not swallow the one only a verdant cantrip fills",
    cm.nextCantripSlot([{ traditions: "any" }, { traditions: ["verdant"] }], ["verdant"]), 0);
}

/* ----------------------------------------------------------------- */
/* HM — High Magic for some traditions only                            */
/* ----------------------------------------------------------------- */
{
  equal("HM highMagicDeclaredFor: true/any every spell; a list by the spell's traditions, or the caster's for one that names none",
    [cm.highMagicDeclaredFor(true, "arcane", ""), cm.highMagicDeclaredFor("any", "divinity", ""), cm.highMagicDeclaredFor(["ethereal", "verdant"], "arcane, verdant", "ethereal"),
      cm.highMagicDeclaredFor(["ethereal", "verdant"], "arcane", "ethereal"), cm.highMagicDeclaredFor(["ethereal", "verdant"], "", "ethereal"), cm.highMagicDeclaredFor(["ethereal"], "", "arcane")],
    [true, true, true, false, true, false]);
  const witch = { items: [WITCH], system: { magic: { tradition: "ethereal" } } };
  const arcane = { tradition: "arcane", traits: "" };
  const verdant = { tradition: "arcane, verdant", traits: "" };
  const hex = { tradition: "", traits: "Hex, Utility", specialist: true };
  equal("HM the Witch: her Ethereal and Verdant spells and her hexes are High Magic; an arcane spell from elsewhere is not",
    [hm.highMagicCast(witch, verdant).highMagic, hm.highMagicCast(witch, hex).highMagic, hm.highMagicCast(witch, arcane).highMagic, hm.highMagicCast(witch, verdant).source],
    [true, true, false, "caster"]);
  equal("HM …and declaresHighMagicCaster still answers only `true` (Block 2's test)", hm.declaresHighMagicCaster(witch), false);
  const off = { items: [{ ...ability("x", { highMagicCaster: ["arcane"] }, false) }], system: { magic: { tradition: "arcane" } } };
  equal("HM a switched-off ability's list declares nothing", hm.declaresHighMagicFor(off, arcane), false);
  ok("HM the forbidden-tradition gate is set aside for a High Magic cast (L837–839)",
    cw.includes("if (!highMagicCast(actor, spellData).highMagic && !traditionGate(actor, spellData, spell.name)) return null;"));
}

/* ----------------------------------------------------------------- */
/* PP — the ability bonus for a class of every tradition                */
/* ----------------------------------------------------------------- */
{
  equal("PP the PP ability bonus: a tradition, or a High Magic class without one; neither is nothing",
    [cp.powerPointAbilityBonus({ tradition: "arcane", abilityTotal: 3 }), cp.powerPointAbilityBonus({ tradition: "", abilityTotal: 3, highMagicClass: true }), cp.powerPointAbilityBonus({ tradition: "", abilityTotal: 3 })],
    [3, 3, 0]);
  ok("PP actor.mjs tells it the class learns from more than one tradition",
    actorSrc.includes("highMagicClass: Boolean(system.progression?.learnTraditions)"));
}

/* ----------------------------------------------------------------- */
/* PK — the pickers, run                                                */
/* ----------------------------------------------------------------- */
{
  // The spell book (D4b) and the cantrip book (D4c).
  equal("PK spellBookSlots: the Wizard's two a level unchanged, the Archmage's one", [sb.spellBookSlots(5, 6), sb.spellBookSlots(5, 6, 1), sb.spellBookSlots(1, 6, 1), sb.spellBookSlots(0, 6, 1)], [14, 10, 6, 0]);
  const bookSpell = spellItem("Fire Bolt", "arcane", 2, { spellBookPick: true });
  const bookCantrip = spellItem("Light", "arcane", 0, { spellBookPick: true, cantripBook: true, cantripPick: true });
  const archActor = actorOf({ level: 5, items: [ARCHMAGE, bookSpell, bookCantrip] });
  archActor.system.magic.memorisationStyle = "book";
  equal("PK the book's spells are not its cantrips; its cantrips are apart", [sb.spellBookSpells(archActor).map((s) => s.name), sb.spellBookCantrips(archActor).map((s) => s.name)], [["Fire Bolt"], ["Light"]]);
  equal("PK an unprepared book cantrip cannot be cast; prepared, it can", [sa.spellAvailability(bookCantrip).castable, sa.spellAvailability({ ...bookCantrip, system: { ...bookCantrip.system, prepared: true } }).castable], [false, true]);
  equal("PK the Archmage's Spell Book card counts one a level (6 + 4 at 5th)", sbw.spellBookContext(archActor).allowed, 10);
  const bookFilter = sbw.eligibilityFor(archActor, { firstPick: false });
  equal("PK the Archmage's book takes every tradition",
    ["arcane", "divinity", "ethereal", "verdant"].map((t) => bookFilter(spellEntry(`x-${t}`, t, 3))), [true, true, true, true]);
  const wizActor = actorOf({ level: 5, items: [WIZARD] });
  const wizFilter = sbw.eligibilityFor(wizActor, { firstPick: false });
  equal("PK the Wizard's book is still arcane only, and still takes a universal spell",
    [wizFilter(spellEntry("a", "arcane", 3)), wizFilter(spellEntry("d", "divinity", 3)), wizFilter(spellEntry("u", "", 3))], [true, false, true]);
  ok("PK Learn a Spell widens with the class (the Archmage's \"rules for learning spells\")",
    read("module", "magic", "learn-spell-workflow.mjs").includes("pickAllowed(pickRule, entry.system?.tradition) &&"));
  // The Witch's repertoire.
  const witchActor = actorOf({ level: 1, items: [WITCH] });
  const witchFilter = rw.eligibilityFor(witchActor, WITCH, { firstPick: false });
  equal("PK the Witch picks Ethereal and Verdant — an \"arcane, verdant\" spell too — and not Arcane or Divinity",
    [witchFilter(spellEntry("e", "ethereal", 2)), witchFilter(spellEntry("av", "arcane, verdant", 2)), witchFilter(spellEntry("a", "arcane", 2)), witchFilter(spellEntry("d", "divinity", 2))], [true, true, false, false]);
  const witchCtx = rw.repertoireContext(witchActor);
  equal("PK the Witch's schedule: two at 1st, not fixed at PP 2, no swaps", [witchCtx.allowed, witchCtx.firstPicksOutstanding, witchCtx.swapsAllowed], [2, false, 0]);
  equal("PK …and one more a level from 2nd", rw.repertoireContext(actorOf({ level: 5, items: [WITCH] })).allowed, 6);
  // The Sorcerer's two tracks.
  const sorc = actorOf({ level: 4, items: [SORCERER, STORM] });
  const sctx = rw.repertoireContext(sorc);
  equal("PK the Sorcerer at 4th: 2 own (1st, 3rd) + 2 birthright (2nd, 4th)", [sctx.ownAllowed, sctx.tracks[0].allowed, sctx.allowed, sctx.remaining], [2, 2, 4, 4]);
  ok("PK …the card's restriction names both", sctx.tradition.includes("any tradition") && sctx.tradition.includes("Birthright: verdant"), sctx.tradition);
  const tf = rw.trackEligibilityFor(sorc, SORCERER, sctx.tracks[0], { firstPick: false });
  equal("PK the birthright track takes the birthright's tradition only", [tf(spellEntry("v", "verdant", 2)), tf(spellEntry("a", "arcane", 2))], [true, false]);
  const sf = rw.eligibilityFor(sorc, SORCERER, { firstPick: false });
  equal("PK the class pick takes any tradition", [sf(spellEntry("v", "verdant", 2)), sf(spellEntry("a", "arcane", 2)), sf(spellEntry("d", "divinity", 2))], [true, true, true]);
  const picked = spellItem("Breeze", "verdant", 2, { repertoirePick: true, repertoireTrack: "birthright" });
  const own = spellItem("Fire", "arcane", 2, { repertoirePick: true });
  const sorc2 = actorOf({ level: 4, items: [SORCERER, STORM, picked, own] });
  const s2 = rw.repertoireContext(sorc2);
  equal("PK a pick counts against its own track", [s2.ownPicked, s2.tracks[0].picked, s2.picked, s2.remaining], [1, 1, 2, 2]);
  const sorcNone = actorOf({ level: 2, items: [SORCERER] });
  equal("PK with no birthright the track's restriction says to choose it", rw.repertoireTracks(sorcNone)[0].restriction, "choose your subclass first");
  // Cantrips.
  equal("PK the Sorcerer's first cantrip is the birthright's", [rw.cantripRuleFor(sorc).rule, rw.cantripRuleFor(sorc).label], [["verdant"], "birthright cantrip"]);
  const knownV = spellItem("Gust", "verdant", 0, { cantripPick: true });
  equal("PK …then any tradition", rw.cantripRuleFor(actorOf({ level: 4, items: [SORCERER, STORM, knownV] })).rule, "any");
  equal("PK …and before a birthright, the slot waits (null)", rw.cantripRuleFor(sorcNone).rule, null);
  equal("PK the Witch's cantrips: Ethereal or Verdant", rw.cantripRuleFor(witchActor).rule, ["ethereal", "verdant"]);
  equal("PK the Wizard's: the core's own test (null rule)", rw.cantripRuleFor(wizActor), null);
  equal("PK the Archmage's cantrips go in the book", [rw.cantripContext(archActor).fromBook, rw.cantripContext(archActor).allowed, rw.cantripContext(archActor).restriction], [true, 6, "any tradition"]);
  // Memorisation from the cantrip book.
  const mctx = mw.memorisationContext({ ...archActor, items: [ARCHMAGE, bookSpell, { ...bookCantrip, system: { ...bookCantrip.system, prepared: true } }] });
  equal("PK the Archmage memorises three cantrips from the book; a prepared one counts", [mctx.cantripsAllowed, mctx.cantripsPicked], [3, 1]);
  ok("PK the sheet's Cantrips card says a book's cantrips are memorised", sheet.includes("{{#if knownCantrips.fromBook}}Kept in your spell book") && sheet.includes("{{knownCantrips.restriction}} · PP 0"));
}

/* ----------------------------------------------------------------- */
/* CAP — a raise of the PP cap per cast                                 */
/* ----------------------------------------------------------------- */
{
  api.resetModuleRegistry();
  ok("CAP a raise needs a function", api.registerCastCapModifier("x", 1) === false);
  equal("CAP nothing registered raises nothing", await cap.castCapRaise({}), { value: 0, labels: [] });
  api.registerCastCapModifier("raw power", ({ highMagic, warped }) => (highMagic && warped ? { value: 1, label: "Raw Power" } : 0), "trg-eldritch-arts");
  api.registerCastCapModifier("lower", () => -3);
  api.registerCastCapModifier("throws", () => { throw new Error("x"); });
  equal("CAP Raw Power raises a warped High Magic cast by 1; a negative is not a raise; a throw costs its own",
    [await quiet(cap.castCapRaise)({ highMagic: true, warped: true }), await quiet(cap.castCapRaise)({ highMagic: true, warped: false }), await quiet(cap.castCapRaise)({ highMagic: false, warped: true })],
    [{ value: 1, labels: ["Raw Power +1"] }, { value: 0, labels: [] }, { value: 0, labels: [] }]);
  ok("CAP castSpell asks before the over-the-cap test and tests the raised cap",
    cw.includes("capRaise = await castCapRaise({") && cw.includes("const castCap = cap + capRaise.value;") && cw.includes("if (!isInnate && totalPP > castCap) {") && cw.includes("warped: totalPP > basePP"));
  const cdc = await imp("magic/casting-dc.mjs");
  const dcOf = (opts) => cdc.assembledCastingDC(opts).parts.find((p) => p.label === "Overcast")?.value ?? 0;
  equal("CAP THE REVIEW'S FIND: PP within the raised cap are not overcast — a CL 3 caster's 5 PP is +2 DC, with Raw Power's raise +0; 6 PP is +2 with it",
    [dcOf({ totalPP: 5, casterLevel: 3 }), dcOf({ totalPP: 5, casterLevel: 3, capRaise: 1 }), dcOf({ totalPP: 6, casterLevel: 3, capRaise: 1 }), dcOf({ totalPP: 4, casterLevel: 3, capRaise: 1 })], [2, 0, 2, 0]);
  ok("CAP …and castSpell hands the raise to the DC and to the Sacrifice prompt's words",
    cw.includes("    capRaise: capRaise.value\n  });") && cw.includes("The casting DC rises by ${Math.max(0, overcastDCIncrease(totalPP, casterLevel) - 2 * capRaise.value)}"));
  ok("CAP …asked only of a cast over the cap", /if \(!isInnate && totalPP > cap\) \{\n\s+const \{ castCapRaise \}/.test(cw));
}

/* ----------------------------------------------------------------- */
/* SP — a specialist spell opened                                       */
/* ----------------------------------------------------------------- */
{
  api.resetModuleRegistry();
  ok("SP access needs a function", api.registerSpecialistAccess("x", true) === false);
  ok("SP registered", api.registerSpecialistAccess("birthright", (actor, s) => /wizard/i.test(s.system?.specialistClass ?? ""), "trg-eldritch-arts"));
  equal("SP listed", api.registeredSpecialistAccess().map((r) => r.key), ["birthright"]);
  ok("SP the Specialist Spell feat asks it beside the core's own rule, and indexes traits and PP",
    featsSrc.includes("}) && !(s.system?.specialist && opened(s))) return false;") && featsSrc.includes('indexFields: ["system.specialistClass", "system.traits", "system.ppCost", "system.specialist", "flags.trg-prime"]'));
  ok("SP …a throwing test opens nothing", featsSrc.includes("try { return allows(actor, s) === true; } catch (err)"));
}

/* ----------------------------------------------------------------- */
/* FAM — a familiar's modifiers                                         */
/* ----------------------------------------------------------------- */
{
  api.resetModuleRegistry();
  const master = { identity: { level: 4 }, progression: { fortitude: 3, reflex: 0, will: 6, source: "Witch" }, combat: { bab: { total: 2 }, bdb: { total: 2 } }, resources: { hp: { max: 30 } }, skills: {}, attributes: { charisma: { total: 4 } } };
  const mirror = fam.familiarMirrorFrom(master, "ZZ Witch");
  equal("FAM the mirror carries the master's ability totals", [mirror.abilities.charisma, mirror.abilities.strength], [4, 0]);
  equal("FAM a mirror's abilities drift; a pre-3.680.0 mirror without them does not by itself",
    [fam.familiarSyncState({ stored: { ...mirror, abilities: { ...mirror.abilities, charisma: 3 } }, current: mirror, hasMaster: true }).drifted,
      fam.familiarSyncState({ stored: { ...mirror, abilities: undefined }, current: mirror, hasMaster: true }).inSync], [["abilities"], true]);
  ok("FAM a modifier needs a function", api.registerFamiliarModifier("x", {}) === false);
  api.registerFamiliarModifier("soulbound", (familiar, m) => (familiar.soulbound ? { label: "Soulbound Familiar", hp: m.level, saves: m.abilities.charisma } : null), "trg-eldritch-arts");
  api.registerFamiliarModifier("throws", () => { throw new Error("x"); });
  const results = (() => { const e = console.error; console.error = () => {}; try { return fm.familiarModifierResults({ soulbound: true }, mirror); } finally { console.error = e; } })();
  equal("FAM the Soulbound Familiar: +level HP, Charisma to every save as a class bonus; a throw costs its own",
    results, [{ key: "soulbound", label: "Soulbound Familiar", hp: 4, saves: { fortitude: 4, reflex: 4, will: 4 }, type: "class" }]);
  equal("FAM …an ordinary familiar gets nothing", (() => { const e = console.error; console.error = () => {}; try { return fm.familiarModifierResults({ soulbound: false }, mirror); } finally { console.error = e; } })(), []);
  equal("FAM the save entries and the HP", [Object.keys(fm.familiarModifierSaveEntries(results)), fm.familiarModifierSaveEntries(results)["system.combat.saves.will"][0].value, fm.familiarModifierHP(results)],
    [["system.combat.saves.fortitude", "system.combat.saves.reflex", "system.combat.saves.will"], 4, 4]);
  equal("FAM no mirror, nothing", fm.familiarModifierResults({}, null), []);
  ok("FAM derivation pools the saves and adds the HP after the familiar's own maximum",
    actorSrc.includes("familiarModifierSaveEntries(modified)") && /prepareFamiliarHitPoints\(system, abilityNamesOf\(this\)\);\n[\s\S]{0,200}familiarModifierHP\(familiarModifierResults\(this, system\.familiar\?\.mirror\)\)/.test(actorSrc));
  ok("FAM createFamiliarFor and familiarsOf are in the module API", apw.includes("createFamiliarFor: async (master, sourceItem)") && apw.includes("familiarsOf: async (master)"));
}

/* ----------------------------------------------------------------- */
/* PP — grants by feature name, and the registered racial PP             */
/* ----------------------------------------------------------------- */
{
  api.resetModuleRegistry();
  ok("PP a grant needs a non-zero whole perLevel", api.registerPPGrant("Wild Power", { perLevel: 0 }) === false);
  ok("PP registered", api.registerPPGrant("Wild Power", { perLevel: 1, label: "Wild Power (+1 PP per level)" }, "trg-eldritch-arts"));
  api.registerRacialPP("Scaelyn", 1, "trg-eldritch-arts");
  api.registerRacialPP("Nyrinn", -1, "trg-eldritch-arts");
  api.registerRacialPP("Elf", 9, "x");
  const rows = fw.modulePPGrants();
  equal("PP the module rows: two races (a core race left to its own row) and the grant",
    rows.map((r) => [r.name, r.flag, r.types]), [["scaelyn", "moduleRacialPP_scaelyn", ["race", "heritage"]], ["nyrinn", "moduleRacialPP_nyrinn", ["race", "heritage"]], ["wild power", "modulePPGrant_wildpower", ["ability", "feat"]]]);
  const lvl5 = { system: { identity: { level: 5 } } };
  equal("PP …owed per level: Scaelyn +5, Nyrinn −5, Wild Power +5 at 5th", rows.map((r) => r.due(lvl5)), [5, -5, 5]);
  ok("PP the reconcile runs the core's rows and the modules'", featsSrc.includes("for (const grant of allPPGrants()) {") && fw.allPPGrants().length === fw.PP_GRANTS.length + 3);
  api.resetModuleRegistry();
  equal("PP nothing registered, no rows", fw.modulePPGrants(), []);
}

/* ----------------------------------------------------------------- */
/* AB — BSB in place of BAB                                             */
/* ----------------------------------------------------------------- */
{
  const claws = { flags: flags({ attackBase: "bsb" }) };
  const sysOf = (bab, bsb) => ({ combat: { bab: { total: bab } }, magic: { bsb: 0 }, progression: { bsb } });
  equal("AB a BSB weapon: the difference as one named row, only when the BSB is higher",
    [ab.attackBaseRow(claws, sysOf(2, 5)), ab.attackBaseRow(claws, sysOf(5, 5)), ab.attackBaseRow({ flags: {} }, sysOf(2, 5)), ab.attackBaseOf({ flags: flags({ attackBase: "BSB" }) })],
    [{ label: "BSB 5 in place of BAB 2", value: 3, type: "untyped" }, null, null, "bsb"]);
  ok("AB the weapon attack adds the row", attackSrc.includes("const row = attackBaseRow(weapon, actor.system);\n    if (row) modifiers.push(row);"));
}

/* ----------------------------------------------------------------- */
/* N — the natural die on the settled hook                              */
/* ----------------------------------------------------------------- */
{
  // THE REVIEW'S FIND: the die is read where the check puts it. The d20
  // result is `{kind, chains, chosen, total, chaos, unmodified}` — no `faces`.
  const checkSrc = read("module", "dice", "check.mjs");
  const at = checkSrc.indexOf('kind: "d20",');
  const shape = at > 0 && checkSrc.slice(at, at + 200).includes("unmodified: chosen.faces[0]") && !/\n\s*faces[,:]/.test(checkSrc.slice(at, at + 200));
  ok("N the check's d20 result names its die `unmodified`, and has no `faces`", shape);
  ok("N trgPrimeSpellSettled carries that die", cw.includes("natural: Math.trunc(Number(check?.dice?.unmodified ?? 0)) || 0,"));
  ok("N …and nothing in the casting reads a `faces` the check does not have", !/check\?\.dice\?\.faces/.test(cw));
}

/* ----------------------------------------------------------------- */
/* API and Z                                                            */
/* ----------------------------------------------------------------- */
ok("API the four registrations are exposed", ["registerCastCapModifier", "registerSpecialistAccess", "registerFamiliarModifier", "registerPPGrant"].every((n) => apw.includes(`${n}: (`)));
{
  // 3.680.0 OR LATER (3.680.1): the seams stand in the patch releases after it.
  const [za, zb] = String(sys.version).split(".").map(Number);
  ok("Z the system is 3.680.0 or later", za > 3 || (za === 3 && zb >= 680), sys.version);
}

if (failures.length) {
  console.error(`verify-ea-block3a-core: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-ea-block3a-core: all ${checks} checks pass`);
