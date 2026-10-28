#!/usr/bin/env node
/**
 * verify-block10-core — TRG Prime 3.674.0: the seams Inner Tempest's Block 10
 * (the Dragon Companions and Dragon Tamer) needs, from its audit's C1 to C9
 * and Graham's rulings B10-1 to B10-14 of 27 October 2026 ("Go with your
 * recommendations"), and C10 found while building.
 *
 *   C1  kinds of companion beside the Animal Companion; one per kind (B10-12)
 *   C2  a kind's own level rule: a dragon's base level plus the master's
 *       levels gained (B10-1)
 *   C3  a companion that grows with level: its size, its natural attacks and
 *       its tokens
 *   C4  a companion feat offered to its own kind only
 *   C5  area damage dice by level (the breath: IT-C5)
 *   C6  a kind whose size steps change no Str or Dex (B10-2)
 *   C7  a kind with no PC ability-point pool
 *   C8  Soul Drain held by a source, healed only when released (B10-13)
 *   C9  Animal Soul finds its master's companions (found in passing)
 *   C10 an owner's own repertoire schedule (B10-6: each base dragon's count)
 *   C11 a rung's fallback weapon: Wing Buffet before the Wings (B10-5)
 *   C12 the system's death question in the module helpers (the dragon bond)
 *   F   the flanking pair: the adjacent bound companion, of either kind
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

const api = await imp("module-api.mjs");
const comp = await imp("companion.mjs");
const compFeats = await imp("companion-feats.mjs");
const picker = await imp("picker-filters.mjs");
const area = await imp("creature-area.mjs");
const soul = await imp("conditions/soul-drain.mjs");
const rep = await imp("magic/repertoire.mjs");

const cw = read("module", "companion-workflow.mjs");
const actorSrc = read("module", "documents", "actor.mjs");
const itemSrc = read("module", "documents", "item.mjs");
const sheet = read("module", "sheets", "actor-sheet.mjs");
const hbs = read("templates", "actor", "actor-sheet.hbs");
const boot = read("scripts", "trg-prime.mjs");
const apiw = read("module", "module-api-workflow.mjs");
const dying = read("module", "combat", "dying-workflow.mjs");
const caw = read("module", "creature-activation-workflow.mjs");
const aw = read("module", "combat", "attack-workflow.mjs");

/* C1, C2 — kinds and their level */
{
  equal("C1 a kind needs a key that is not \"animal\", a class name and a pack",
    [api.normaliseCompanionKind({ key: "animal", className: "X", pack: "p" }), api.normaliseCompanionKind({ key: "dragon", pack: "p" }), api.normaliseCompanionKind({ key: "dragon", className: "Dragon Companion" })],
    [null, null, null]);
  const levelFrom = (master, companion) => Number(companion?.flags?.it?.base ?? 0) + Number(master?.system?.identity?.level ?? 0) - Number(companion?.flags?.it?.hatchedAt ?? 0);
  ok("C1 a module registers a kind; its spec is read back with its defaults",
    api.registerCompanionKind({ key: "Dragon", label: "Dragon Companion", className: "Dragon Companion", creatureType: "Wyrm", pack: "mod.it-dragons", levelFrom, sizeAbilityMods: false, abilityPoints: false, command: "Command it." }, "mod") === true);
  const spec = comp.companionKindSpec("dragon");
  equal("C1 …lower-cased key, its label, class, type, pack, the two switches and its command line",
    [spec?.key, spec?.label, spec?.className, spec?.creatureType, spec?.pack, typeof spec?.levelFrom, spec?.sizeAbilityMods, spec?.abilityPoints, spec?.command],
    ["dragon", "Dragon Companion", "Dragon Companion", "Wyrm", "mod.it-dragons", "function", false, false, "Command it."]);
  equal("C1 the Animal Companion is the built-in kind; a companion with no kind is one; an unknown kind is none",
    [comp.companionKindSpec("animal").className, comp.companionKindSpec("").creatureType, comp.companionKindOf({ system: { companion: { kind: "" } } }), comp.companionKindOf({ system: { companion: { kind: "Dragon" } } }), comp.companionKindSpec("griffon")],
    ["Animal Companion", "Animal", "animal", "dragon", null]);
  const master = { system: { identity: { level: 12 } } };
  const dragon = { system: { companion: { kind: "dragon" } }, flags: { it: { base: 4, hatchedAt: 8 } } };
  const wolf = { system: { companion: { kind: "" } } };
  equal("C2 a dragon's level is its kind's (base 4, hatched at 8, master 12: 8); a wolf's is its master's",
    [comp.expectedCompanionLevel(master, dragon), comp.expectedCompanionLevel(master, wolf)], [8, 12]);
  api.registerCompanionKind({ key: "broken", className: "B", pack: "p", levelFrom: () => { throw new Error("x"); } });
  api.registerCompanionKind({ key: "zero", className: "Z", pack: "p", levelFrom: () => 0 });
  equal("C2 a level rule that throws or answers below 1 falls back to the master's level",
    [comp.expectedCompanionLevel(master, { system: { companion: { kind: "broken" } } }), comp.expectedCompanionLevel(master, { system: { companion: { kind: "zero" } } })], [12, 12]);
  equal("C2 in step against the kind's level, not the master's; an animal companion's result is unchanged",
    [comp.companionSyncState({ masterLevel: 12, companionLevel: 8, hasMaster: true, expectedLevel: 8 }).inSync,
      comp.companionSyncState({ masterLevel: 12, companionLevel: 12, hasMaster: true, expectedLevel: 8 }).inSync,
      comp.companionSyncState({ masterLevel: 7, companionLevel: 7, hasMaster: true })],
    [true, false, { bound: true, inSync: true, masterLevel: 7, companionLevel: 7 }]);
  const made = comp.companionActorData({ masterId: "m", masterName: "Aiko", creatureName: "Cold Dragon", level: 4, kind: "dragon" });
  equal("C1 a new companion records its kind (blank for an animal) and an empty grown size",
    [made.system.companion.kind, made.system.companion.grownSize, comp.companionActorData({ level: 3 }).system.companion.kind], ["dragon", "", ""]);
  const tpl = JSON.parse(read("template.json"));
  const tplCompanion = JSON.stringify(tpl.Actor?.companion ?? {});
  ok("C1/C3 the companion template carries kind and grownSize", /"kind":""/.test(tplCompanion) && /"grownSize":""/.test(tplCompanion));
  ok("C1 one per kind: companionsOf filters by kind, and a second of the same kind is refused",
    /export function companionsOf\(masterActor, kind = null\)/.test(cw) && /isBoundTo\(a, id\) && \(want === null \|\| companionKindOf\(a\) === want\)/.test(cw)
    && /const existing = companionsOf\(masterActor, spec\.key\);/.test(cw));
  ok("C1 the kind's pack, class and creature type; its own base creatures only",
    /if \(!spec \|\| spec\.key === ANIMAL_KIND\) return contentPack\(COMPANION_PACK\);\n\s*return game\.packs\?\.get\(spec\.pack\) \?\? null;/.test(cw)
    && /normalise\(d\.name\) === normalise\(spec\.className\)/.test(cw) && /normalise\(d\.name\) === normalise\(spec\.creatureType\)/.test(cw)
    && /const creatures = await baseCreatureChoices\(only, spec\);/.test(cw));
  ok("C2 created at its kind's level, and kept there: the sync asks the kind",
    /const level = expectedCompanionLevel\(masterActor, preview\);/.test(cw) && /const level = expectedCompanionLevel\(masterActor, companion\);/.test(cw));
  ok("C1 the sheet and the cards say the kind", /kindLabel: kindSpec\?\.label \?\? "Companion"/.test(sheet) && /\{\{else if isCompanion\}\}\{\{companionSummary\.kindLabel\}\}/.test(hbs)
    && /<h3>\$\{spec\.label\}<\/h3>/.test(cw) && /expectedLevel: master \? expectedCompanionLevel\(master, actor\) : null/.test(sheet));
  ok("C1 the API hands a module the kind, the creation and the companions",
    /registerCompanionKind: \(kind, moduleId\) => registerCompanionKind\(kind, moduleId\)/.test(apiw) && /createCompanionFor: async \(master, featItem, options = \{\}\)/.test(apiw)
    && /companionsOf: async \(master, kind = null\)/.test(apiw));
}

/* C3 — growth */
{
  equal("C3 the larger of the grown size and the Increase Size picks governs; an unknown grown size is ignored",
    [compFeats.companionCurrentSize({ startingSize: "small", maximumSize: "small", grownSize: "large" }),
      compFeats.companionCurrentSize({ startingSize: "small", maximumSize: "huge", featNames: ["Increase Size", "Increase Size"], grownSize: "medium" }),
      compFeats.companionCurrentSize({ startingSize: "small", maximumSize: "small", grownSize: "enormous" }),
      compFeats.companionCurrentSize({ startingSize: "", maximumSize: "", grownSize: "huge" })],
    ["large", "large", "small", "huge"]);
  ok("C3 the actor's size and its natural attacks both read the grown size",
    /featNames: featNamesOf\(this\),\n\s*\/\/[^\n]*\n\s*grownSize: system\.companion\?\.grownSize/.test(actorSrc) && /grownSize: companion\?\.grownSize,/.test(itemSrc));
  ok("C3 its tokens, and the next one dragged out, follow its size",
    /if \(actor\?\.type === "companion" && foundry\.utils\.hasProperty\(changed \?\? \{\}, "system\.companion\.grownSize"\)\)/.test(boot)
    && /const side = Math\.max\(1, Math\.round\(space \/ 5\)\);/.test(cw) && /"prototypeToken\.width": side, "prototypeToken\.height": side/.test(cw));
}

/* C4 — feats by kind */
{
  const filter = (ctx) => picker.buildPickerFilter("generalFeat", ctx);
  const general = { name: "Alertness", system: { category: "General", traits: "" } };
  const animalFeat = { name: "Tough Hide", system: { category: "General", traits: "Companion" } };
  const dragonFeat = { name: "Tail Lash", system: { category: "General", traits: "Companion" }, flags: { "trg-prime": { companionKind: "dragon" } } };
  const row = (ctx) => [general, animalFeat, dragonFeat].map((e) => filter(ctx)(e));
  equal("C4 a character sees neither kind's feats; a wolf its own; a dragon its own; all see General feats",
    [row({}), row({ isCompanion: true, companionKind: "animal" }), row({ isCompanion: true, companionKind: "dragon" })],
    [[true, false, false], [true, true, false], [true, false, true]]);
  ok("C4 the picker asks the pack for the kind, and the sheet says whose sheet it is",
    /"flags\.trg-prime\.companionKind"\]/.test(read("module", "picker-filters.mjs")) && /companionKind: companionKindOf\(this\.actor\),/.test(sheet));
}

/* C5 — dice by level */
{
  const breath = { type: "ability", name: "Cold Dragon Breath", flags: { "trg-prime": { creatureAbility: { area: { save: "reflex", basic: true, damage: { perLevel: "d8", type: "cold" }, scope: "targets", breath: true } } } } };
  equal("C5 a breath of a d8 a level: 6d8 at 6th, none without a level; a fixed formula is untouched",
    [area.declaredAreaUse(breath, { level: 6 }).spec.damage, area.perLevelDamage({ perLevel: "d8", type: "cold" }, 0), area.perLevelDamage({ formula: "4d6", type: "fire" }, 9)],
    [{ type: "cold", formula: "6d8" }, { type: "cold" }, { formula: "4d6", type: "fire" }]);
  const roar = { damage: { fromItem: "breath" } };
  equal("C5 another ability borrowing the breath's dice reads them at the user's level",
    area.resolveAreaDamageSource(roar, [breath], { level: 7 }).damage, { formula: "7d8", type: "cold" });
  ok("C5 the Use passes the user's level to both", /declaredAreaUse\(item, \{ worldTime: Number\(game\.time\?\.worldTime \?\? 0\), level: Number\(actor\?\.system\?\.identity\?\.level \?\? 0\) \}\)/.test(caw)
    && /level: Number\(actor\.system\?\.identity\?\.level \?\? 0\),\n/.test(caw));
}

/* C6, C7 */
{
  ok("C6 a kind declaring sizeAbilityMods: false takes no Str/Dex from its size",
    /const sizeCountsForAbilities = !\(isCompanion\(actor\) && companionKindSpec\(companionKindOf\(actor\)\)\?\.sizeAbilityMods === false\);\n\s*if \(sizeEntry && sizeCountsForAbilities\) \{/.test(actorSrc));
  ok("C7 a kind declaring abilityPoints: false shows no ability-point banner",
    /context\.hideAbilityPoints = isCompanion\(actor\) && companionKindSpec\(companionKindOf\(actor\)\)\?\.abilityPoints === false;/.test(sheet)
    && /\{\{#unless isVehicle\}\}\{\{#unless hideAbilityPoints\}\}/.test(hbs));
}

/* C8 — held Soul Drain */
{
  const a = { flags: { "trg-prime": { soulDrainHeld: { dragonBond: 6, other: 2, junk: "x" } } } };
  equal("C8 what is held is summed over its sources; a request is raised to it; a source becomes a flag key",
    [soul.heldSoulDrain(a), soul.heldSoulDrain({}), soul.soulDrainWithHold(3, 8), soul.soulDrainWithHold(10, 8), soul.soulDrainWithHold(0, 0), soul.soulDrainSourceKey("it.dragon bond")],
    [8, 0, 8, 10, 0, "it_dragon_bond"]);
  ok("C8 every route that lowers it meets the hold, unless forced; a player cannot type it away",
    /if \(statusId === "soulDrain" && options\.force !== true\) \{\n\s*const held = heldSoulDrain\(this\);/.test(actorSrc)
    && /const requested = options\.active === false \? 0 : options\.value;\n\s*if \(requested !== undefined && Number\(requested\) < held\) \{/.test(actorSrc)
    && /const heldFloor = statusId === "soulDrain" && !game\.user\?\.isGM \? heldSoulDrain\(this\) : 0;/.test(actorSrc));
  ok("C8 the holder lays it (hold written first) and releases it (hold lowered first), healing it or not",
    /await actor\.update\(\{ \[`flags\.trg-prime\.\$\{SOUL_DRAIN_HOLD_FLAG\}\.\$\{key\}`\]: had \+ n \}\);\n\s*return setSoulDrain\(actor, current \+ n\);/.test(dying)
    && /const \{ n, left, target \} = soulDrainRelease\(\{ had, amount, current, heal \}\);/.test(dying)
    && /\[`flags\.trg-prime\.\$\{SOUL_DRAIN_HOLD_FLAG\}\.-=\$\{key\}`\]: null \}\);\n\s*if \(heal && target !== current\) await setSoulDrain\(actor, target\);/.test(dying)
    && /holdSoulDrain: async \(actor, source, amount\)/.test(apiw) && /releaseSoulDrain: async \(actor, source, options = \{\}\)/.test(apiw));
  equal("C8 a release worked out: a week's point back and healed; a reunion's all, unhealed; a hold cut to what the GM's hand already healed",
    [soul.soulDrainRelease({ had: 7, amount: 1, current: 9, heal: true }), soul.soulDrainRelease({ had: 4, current: 6 }), soul.soulDrainRelease({ had: 7, amount: 1, current: 0, heal: true }), soul.soulDrainRelease({ had: 3, amount: 5, current: 3, heal: true })],
    [{ n: 1, left: 6, target: 8 }, { n: 4, left: 0, target: null }, { n: 1, left: 0, target: 0 }, { n: 3, left: 0, target: 0 }]);
  ok("C8 the card and the rest say what the hold left: the value is raised to it before it is shown, and the rest counts what was healed",
    /const newDrain = soulDrainWithHold\(value, heldSoulDrain\(actor\)\);/.test(dying)
    && /soulDrainHealed = Math\.max\(0, soulDrainBefore - Number\(set\?\.soulDrain \?\? after\)\);/.test(read("module", "rest", "rest-workflow.mjs")));
}

/* C9, F */
{
  const soulSrc = read("module", "magic", "animal-soul.mjs");
  ok("C9 Animal Soul finds companions by the stored master id", /String\(a\?\.system\?\.companion\?\.masterId \?\? ""\)\.trim\(\) === actor\.id/.test(soulSrc) && !/companionMaster/.test(soulSrc.replace(/\/\/[^\n]*/g, "")));
  ok("F the flanking partner is the bound companion beside the target, of either kind",
    /return bound && Boolean\(sideFlags\(ally, squares\)\);/.test(aw));
}

/* C10 — the owner's repertoire schedule */
{
  const cls = { flags: { "trg-prime": { repertoire: { pickStep: 1, pickFrom: 2 } } } };
  const earth = { flags: { "trg-prime": { repertoire: { firstPicks: 4, pickFrom: 5, firstPickExact: false } } } };
  const sch = rep.repertoireSchedule(cls, earth);
  equal("C10 the owner's schedule over the class's: an Earth dragon opens with 4 at 4th and gains one a level (B10-6)",
    [[4, 5, 8].map((l) => rep.repertoirePickCount(l, sch)), rep.repertoireState({ level: 4, picked: 0, schedule: sch }).firstPicksOutstanding],
    [[4, 5, 8], false]);
  equal("C10 a schedule declaring neither field reads exactly as before",
    [rep.repertoireSchedule(cls), rep.repertoirePickCount(5, rep.repertoireSchedule({})), rep.repertoireState({ level: 1, picked: 0 }).firstPicksOutstanding],
    [{ pickStep: 1, pickFrom: 2, swapStep: 2, swapFrom: 5 }, 4, true]);
  ok("C10 the workflow, the swap and the class card read the owner's schedule",
    /schedule: repertoireSchedule\(classItem, actor\)/.test(read("module", "magic", "repertoire-workflow.mjs"))
    && /repertoireSchedule\(sourceItem, actor\)/.test(read("module", "grants-workflow.mjs")));
}

/* C11 — a rung's fallback weapon (B10-5) */
{
  const fb = { name: "Wings", damage: "1d6", size: "small", damageType: "bludgeoning" };
  const buffet = { damageByRung: { partial: { weapon: "wing", fallback: fb }, fumble: { weapon: "wing", times: 2, fallback: fb } } };
  const wings = { type: "weapon", name: "Wings", system: { damage: "1d10", damageType: "bludgeoning" } };
  equal("C11 Wing Buffet before the Wings: the core Wings at the dragon's size (Medium 1d8, Large 1d10), its Strength added; its own Wings once it has them; none declared, none rolled",
    [area.resolveAreaDamageSource(buffet, [], { strength: 2, size: "medium" }).damageByRung, area.resolveAreaDamageSource(buffet, [], { strength: 2, size: "large" }).damageByRung.partial,
      area.resolveAreaDamageSource(buffet, [wings], { strength: 2, size: "medium" }).damageByRung.partial, area.resolveAreaDamageSource({ damageByRung: { partial: { weapon: "wing" } } }, [], { size: "medium" }).damageByRung,
      area.resolveAreaDamageSource({ damageByRung: { partial: { weapon: "wing", fallback: { name: "Wings" } } } }, [], { size: "medium" }).damageByRung],
    [{ partial: "1d8+2", fumble: "2*(1d8+2)" }, "1d10+2", "1d10+2", {}, {}]);
  ok("C11 the Use passes the user's size", /size: String\(actor\.system\?\.identity\?\.size \?\? ""\)/.test(caw));
}

/* C12 — the one death question, for a module */
ok("C12 the module helpers ask the system's own isDead", /isDead: async \(actor\) => \(await import\("\.\/combat\/death-state\.mjs"\)\)\.isDead\(actor\),/.test(apiw));

/* 3.674.1 — found in the live test of 28 October 2026 (Graham: "Build fixes 1-5 and amend text on point 6") */
{
  const relay = await imp("combat/target-relay.mjs");
  const relayW = read("module", "combat", "target-relay-workflow.mjs");
  const master = { id: "m1" };
  const good = { type: "companion", system: { companion: { masterId: "m1" } } };
  equal("L1 A PLAYER'S COMPANION THROUGH THE GM: a companion bound to a character the asker owns is made; anything else is refused",
    [relay.companionRelayRefusal(good, master, true), relay.companionRelayRefusal({ ...good, type: "npc" }, master, true), relay.companionRelayRefusal({ type: "companion", system: { companion: { masterId: "x" } } }, master, true), relay.companionRelayRefusal(good, master, false)],
    ["", "not a companion", "not bound to that character", "the asker does not own that character"]);
  equal("L1 …asked only by a player who may not create actors",
    [relay.actorCreateNeedsRelay({ isGM: false, can: () => false }), relay.actorCreateNeedsRelay({ isGM: false, can: () => true }), relay.actorCreateNeedsRelay({ isGM: true, can: () => false })], [true, false, false]);
  const made = [];
  const deps = { fromUuid: async () => master, userOwns: (t, u) => u === "p1", createCompanion: async (d) => { made.push(d.type); return { id: "c9" }; } };
  equal("L1 the GM's client carries it out: the companion created for its owner, and only for its owner",
    [await relay.performRelay({ action: relay.RELAY_ACTIONS.COMPANION, uuid: "Actor.m1", userId: "p1", payload: { data: good } }, deps),
      await relay.performRelay({ action: relay.RELAY_ACTIONS.COMPANION, uuid: "Actor.m1", userId: "p2", payload: { data: good } }, deps), made],
    [{ ok: true, result: { id: "c9" } }, { ok: false, reason: "the asker does not own that character" }, ["companion"]]);
  ok("L1 creation asks through the relay, which the GM's client answers with its own Actor.create and the asker's ownership",
    /const companion = await relayCreateCompanion\(masterActor, data, \(\) => Actor\.create\(data\)\);/.test(cw)
    && /if \(!actorCreateNeedsRelay\(game\.user\)\) return applyDirect\(\);\n\s*const reply = await ask\(RELAY_ACTIONS\.COMPANION, master, \{ data \}\);/.test(relayW)
    && /createCompanion: \(data\) => Actor\.create\(data\),/.test(relayW) && /return Boolean\(user && target\?\.testUserPermission\?\.\(user, "OWNER"\)\);/.test(relayW));
  ok("L2 A NEW COMPANION ARRIVES WHOLE: its HP set to its maximum after the grant pass",
    /await queueGrantPass\(companion\);\n[\s\S]{0,260}const hpMax = Number\(companion\.system\?\.resources\?\.hp\?\.max \?\? 0\);\n\s*if \(hpMax > 0 && Number\(companion\.system\?\.resources\?\.hp\?\.value \?\? 0\) !== hpMax\) \{\n\s*await companion\.update\(\{ "system\.resources\.hp\.value": hpMax \}\);/.test(cw));
  ok("L4 A KIND'S OWN SETTING-UP IS AWAITED BEFORE THE HP AND THE CARD (the dragon's card said Will +12 before its Iron Will arrived)",
    /beforeCard = null\n\} = \{\}\) \{/.test(cw)
    && /if \(typeof beforeCard === "function"\) await beforeCard\(companion\);\n\n\s*\/\/ IT ARRIVES WHOLE[\s\S]{0,900}await postCreationCard\(/.test(cw));
  ok("L3 ITS CLASS, BASE CREATURE AND TYPE KEEP THEIR COMPENDIUM SOURCE, so a grant prefers the base creature's own book",
    /const items = \[classDoc, creature, typeDoc\]\.filter\(Boolean\)\.map\(companionItemData\);/.test(cw)
    && /if \(uuid\.startsWith\("Compendium\."\)\) data\._stats = \{ \.\.\.\(data\._stats \?\? \{\}\), compendiumSource: uuid \};/.test(cw));
  const sda = await imp("magic/spell-damage-ability.mjs");
  const note = { kind: "note", text: "Damage is 1d6 + your magical ability score modifier (the flat ability bonus is added by hand)." };
  equal("L6 HURLING'S OLD NOTE IS AMENDED, not dropped, when the damage adds the ability; left alone when it does not",
    [sda.withAmendedAddByHandNotes([note, { kind: "note", text: "Other." }], { formula: "1d6" }, "it inflicts 1d6 + magical ability score bludgeoning damage.").map((e) => e.text),
      sda.withAmendedAddByHandNotes([note], { formula: "1d6", addAbility: "" }, "it inflicts 1d6 + magical ability score bludgeoning damage.")[0].text],
    [["Damage is 1d6 + your magical ability score modifier (added to the damage roll for you).", "Other."], note.text]);
  ok("L6 …on every cast", /effEffects = withAmendedAddByHandNotes\(effEffects, spellData\.damage, String\(spellData\.description \?\? ""\)\);/.test(read("module", "magic", "cast-workflow.mjs")));
}

// 3.674.2 OR LATER.
{
  const [ma, mi, pa] = String(JSON.parse(read("system.json")).version).split(".").map(Number);
  ok("Z0 the system is 3.674.0 or later", ma > 3 || (ma === 3 && mi >= 674));
  ok("Z1 …and 3.674.1 or later", ma > 3 || (ma === 3 && (mi > 674 || (mi === 674 && pa >= 1))));
  // 3.674.2 republishes 3.674.1 with the creation-card fix (beforeCard), so an
  // installed 3.674.1 that lacks it is offered the update.
  ok("Z2 …and 3.674.2 or later", ma > 3 || (ma === 3 && (mi > 674 || (mi === 674 && pa >= 2))));
}

const EXPECTED = 50;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block10-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block10-core: ${checks} checks — all green.`);
