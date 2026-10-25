#!/usr/bin/env node
/**
 * verify-focus-declarations — 3.664.0: the Focus and innate declarations a
 * companion module puts on a carrier (Inner Tempest 1.2; Graham's rulings of
 * 20 Oct 2026). See module/focus-declarations.mjs.
 *
 *   A  extra Focus uses: which items a row reaches, and how many
 *   B  Refocus: one use, or every use where a declaration says so
 *   C  another ability for one action (Considered Mind, Unwavering Purpose)
 *   D  one innate spell's own ability
 *   E  the innate PP limit
 *   F  daily preparation clears rune and wondrous Focus
 *   G  the wiring
 *   H  declared conviction: the pool, the one-off point, and taking it back
 *   I  declared fall reduction and carrying strength
 *   J  a granted or chosen spell's own magical ability
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const fd = await import(new URL("../module/focus-declarations.mjs", import.meta.url));

const carrier = (name, flags) => ({ name, flags: { "trg-prime": flags } });
const tech = (name, traits = "Focus, Technique") => ({ name, system: { traits } });

/* A — extra Focus uses */
const deep = carrier("Deep Focus", { focusExtraUses: [{ value: 1, traits: ["Technique"] }] });
const mastery = carrier("Ghost Art Mastery", { focusExtraUses: { value: 1, names: ["Ghost Step"] } });
equal("A1 Deep Focus reaches every Focus technique, one use each",
  [fd.focusExtraUses(tech("Inner Strike"), [deep]), fd.focusExtraUses(tech("Ghost Step", "Focus, Movement, Technique"), [deep])], [1, 1]);
equal("A2 …but not a Focus ability that is not a technique, and nothing without Focus",
  [fd.focusExtraUses(tech("Predator's Pounce", "Attack, Flourish, Focus, Movement"), [deep]), fd.focusExtraUses(tech("False Face", "Technique"), [deep])], [0, 0]);
equal("A3 Ghost Art Mastery reaches only the art it names, and stacks with Deep Focus",
  [fd.focusExtraUses(tech("Ghost Step", "Focus, Movement, Technique"), [deep, mastery]), fd.focusExtraUses(tech("Smoke Veil", "Focus, Manipulate, Technique"), [mastery])], [2, 0]);
equal("A4 an unfiltered row reaches every Focus item; a zero or negative row reaches nothing",
  [fd.focusExtraUses(tech("Celestial Breath", "Arcane, Focus, Save"), [carrier("x", { focusExtraUses: { value: 2 } })]),
    fd.focusExtraUses(tech("Inner Strike"), [carrier("x", { focusExtraUses: [{ value: 0 }, { value: -1 }] })])], [2, 0]);
equal("A5 the Focus trait is a whole word, case-insensitive", [fd.focusExtraUses(tech("A", "ATTACK, FOCUS"), [deep]) >= 0 && fd.focusExtraUses(tech("A", "ATTACK, FOCUS, TECHNIQUE"), [deep]), fd.focusExtraUses(tech("B", "Focused, Technique"), [deep]), fd.focusExtraUses(tech("C", ""), [deep])], [1, 0, 0]);
equal("A6 a carrier with no flag, or a junk flag, adds nothing", fd.focusExtraUses(tech("Inner Strike"), [{}, carrier("y", { focusExtraUses: "1" }), null]), 0);

/* B — Refocus restores */
equal("B1 one use back by default, capped at the maximum", [fd.refocusRestoredUses(0, 2, false), fd.refocusRestoredUses(1, 2, false), fd.refocusRestoredUses(2, 2, false)], [1, 2, 2]);
equal("B2 every use back where a declaration restores all", [fd.refocusRestoredUses(0, 2, true), fd.refocusRestoredUses(1, 3, true)], [2, 3]);
equal("B3 an untracked item still gains one", fd.refocusRestoredUses(0, null, true), 1);
equal("B4 restores-all follows the row that reaches the item; a row may opt out",
  [fd.refocusRestoresAll(tech("Inner Strike"), [deep]), fd.refocusRestoresAll(tech("Inner Strike"), []),
    fd.refocusRestoresAll(tech("Inner Strike"), [carrier("z", { focusExtraUses: { value: 1, restoresAll: false } })])], [true, false, false]);

equal("B5 a zero-value row grants nothing, so it cannot switch restores-all on", fd.refocusRestoresAll(tech("Inner Strike"), [carrier("z", { focusExtraUses: { value: 0 } })]), false);

/* C — another ability for one action */
const attrs = { wisdom: { total: 1 }, intelligence: { total: 4 }, charisma: { total: 3 } };
const considered = carrier("Considered Mind", { actionAbilityOptions: [{ action: "refocus", ability: "intelligence" }] });
const rows = fd.actionAbilityRows([considered], "refocus", "wisdom", attrs);
equal("C1 Considered Mind adds Int over Wis to Refocus, untyped", rows.map((r) => [r.value, r.type]), [[3, "untyped"]]);
ok("C2 …and says so on the roll", /Intelligence instead of Wisdom/.test(rows[0]?.label ?? ""), rows[0]?.label);
equal("C3 only for its own action, and only when it helps", [fd.actionAbilityRows([considered], "spatialAwareness", "wisdom", attrs).length,
  fd.actionAbilityRows([considered], "refocus", "wisdom", { wisdom: { total: 5 }, intelligence: { total: 4 } }).length], [0, 0]);
const purpose = carrier("Unwavering Purpose", { actionAbilityOptions: { action: "refocus", ability: "charisma" } });
equal("C4 two options: the best is taken, once", fd.actionAbilityRows([purpose, considered], "refocus", "wisdom", attrs).map((r) => r.value), [3]);
equal("C5 an unknown ability is ignored", fd.actionAbilityRows([carrier("q", { actionAbilityOptions: { action: "refocus", ability: "luck" } })], "refocus", "wisdom", attrs).length, 0);

/* D — one spell's own ability */
const att = { wisdom: { total: 3 }, charisma: { total: 1 } };
equal("D1 an innate spell's declared ability wins over the actor's", fd.innateAbilityKey({ flags: { "trg-prime": { castingAbilityOverride: "Wisdom" } } }, "charisma", att), "wisdom");
equal("D2 none declared, or not a real attribute: the actor's", [fd.innateAbilityKey({}, "charisma", att), fd.innateAbilityKey({ flags: { "trg-prime": { castingAbilityOverride: "spirit" } } }, "charisma", att)], ["charisma", "charisma"]);

/* E — the innate PP limit */
equal("E1 a character cannot cast an innate spell above their level", fd.innateLevelRefusal({ actorType: "character", basePP: 16, castLevel: 3 }) !== null, true);
equal("E2 at or below level it may, and a cantrip always may", [fd.innateLevelRefusal({ actorType: "character", basePP: 4, castLevel: 4 }), fd.innateLevelRefusal({ actorType: "character", basePP: 0, castLevel: 1 })], [null, null]);
equal("E3 a companion is governed too", fd.innateLevelRefusal({ actorType: "companion", basePP: 8, castLevel: 5 }) !== null, true);
equal("E4 a stat block's creature is not, nor an item cast", [fd.innateLevelRefusal({ actorType: "npc", basePP: 14, castLevel: 8 }), fd.innateLevelRefusal({ actorType: "character", basePP: 14, castLevel: 1, isItemCast: true })], [null, null]);
ok("E5 the refusal names both numbers", /14.*8/.test(fd.innateLevelRefusal({ actorType: "character", basePP: 14, castLevel: 8 }) ?? ""));

/* F — daily preparation clears rune and wondrous Focus */
const clears = fd.dailyFocusFlagClears([
  { id: "a", flags: { "trg-prime": { runeState: { focusExpended: { harmony: true, mindful: true } } } } },
  { id: "b", flags: { "trg-prime": { wondrousFocusExpended: true } } },
  { id: "c", flags: { "trg-prime": { runeState: { focusExpended: {} } } } },
  { id: "d" }
]);
equal("F1 every expended rune key and the wondrous flag are deleted; untouched items are left alone", clears, [
  { _id: "a", "flags.trg-prime.runeState.focusExpended.-=harmony": null, "flags.trg-prime.runeState.focusExpended.-=mindful": null },
  { _id: "b", "flags.trg-prime.-=wondrousFocusExpended": null }
]);

/* G — the wiring */
const uw = read("module", "uses-workflow.mjs");
ok("G1 the daily maximum adds declared extra uses from the actor's carriers", /\+ focusExtraUses\(owner, owner\.actor \? declarationCarriers\(owner\.actor\) : \[\]\);/.test(uw));
ok("G2 daily preparation applies the Focus flag clears", /const focusFlagUpdates = dailyFocusFlagClears\(actor\.items\);\s*if \(focusFlagUpdates\.length\) await actor\.updateEmbeddedDocuments\("Item", focusFlagUpdates\);/.test(uw));
const rw = read("module", "combat", "refocus-workflow.mjs");
ok("G3 Refocus asks whether a declaration restores all", /const all = item\.actor \? refocusRestoresAll\(item, declarationCarriers\(item\.actor\)\) : false;\s*const next = all\s*\? refocusRestoredUses\(itemUsesRemaining\(item\), max, true\)\s*: restoredUses\(itemUsesRemaining\(item\), max\);/.test(rw));
const aw = read("module", "combat", "action-workflow.mjs");
ok("G4 the action roll carries the ability-option rows", /\.\.\.actionAbilityRows\(\s*declarationCarriers\(actor\),\s*action\.key,/.test(aw));
const cw = read("module", "magic", "cast-workflow.mjs");
ok("G5 castSpell refuses an innate spell above level before anything is committed",
  /const refusal = innateLevelRefusal\(\{\s*actorType: actor\.type, basePP: spellData\.ppCost, castLevel: gateLevel, isItemCast,\s*allowance: innatePPAllowanceOf\(spell\)\s*\}\);\s*if \(refusal\) \{\s*ui\.notifications\.warn\(`\$\{spell\.name\}: \$\{refusal\}\.`\);\s*return null;/.test(cw)
  && cw.indexOf("innateLevelRefusal({") < cw.indexOf("innateWarpBudget(innateLevel)"));
ok("G6 the innate attack reads the spell's own ability", /const innateAbilityAttr = isInnate\s*\? innateAbilityKey\(spell, system\.magic\?\.castingAbility, system\.attributes \?\? \{\}\)/.test(cw) && /system\.attributes\?\.\[innateAbilityAttr\]\?\.total/.test(cw));
ok("G7 the innate save DC reads it too", /system\.attributes\?\.\[isInnate\s*\? innateAbilityKey\(spell, system\.magic\?\.castingAbility, system\.attributes \?\? \{\}\)\s*: system\.magic\?\.castingAbility\]\?\.total/.test(cw));
ok("G8 the sheet shows each innate spell's own figures", /const ownAbilityKey = innateAbilityKey\(item, this\.actor\.system\?\.magic\?\.castingAbility/.test(read("module", "sheets", "actor-sheet.mjs")));

/* H — declared conviction */
const fl = (n, extra = {}) => ({ "trg-prime": { convictionPool: n, ...extra } });
equal("H1 each declaring item raises the pool; an inactive ability, a junk value and plain items do not",
  fd.declaredConvictionBonus([{ type: "ability", flags: fl(1) }, { type: "heritage", flags: fl(1) }, { type: "ability", system: { active: false }, flags: fl(1) }, { type: "feat", flags: fl("x") }, { type: "feat" }]), 2);
equal("H2 the one-off point arrives once", [fd.declaredConvictionTopUp({ flags: fl(1) }, 2), fd.declaredConvictionTopUp({ flags: fl(1, { convictionGiven: true }) }, 2), fd.declaredConvictionTopUp({ flags: {} }, 2)], [3, null, null]);
equal("H3 it leaves with the item, never below zero, and only if it was given", [fd.declaredConvictionTakeBack({ flags: fl(1, { convictionGiven: true }) }, 2), fd.declaredConvictionTakeBack({ flags: fl(1, { convictionGiven: true }) }, 0), fd.declaredConvictionTakeBack({ flags: fl(1) }, 2)], [1, 0, null]);
ok("H4 the actor's pool maximum adds the declarations", /heroesFortuneBonus\(this\) \+\s*\/\/ DECLARED \(3\.664\.0\): `convictionPool` on any owned item\.\s*declaredConvictionBonus\(this\.items \?\? \[\]\);/.test(read("module", "documents", "actor.mjs")));
ok("H5 a granted declaring item tops the pool up once and records it", /const topped = declaredConvictionTopUp\(sourceItem, stored\);\s*if \(topped !== null\) \{\s*anyRequested = true;\s*await actor\.update\(\{ "system\.resources\.conviction\.value": topped \}\);\s*await sourceItem\.setFlag\("trg-prime", "convictionGiven", true\);/.test(read("module", "grants-workflow.mjs")));
ok("H6 removing it takes the point back", /const back = declaredConvictionTakeBack\(item, current\);\s*if \(back !== null && back !== current\) \{\s*await actor\.update\(\{ "system\.resources\.conviction\.value": back \}\);/.test(read("module", "grant-cleanup.mjs")));

/* I — falls and carrying */
const ren = carrier("Ren", { fallReduction: { value: 20, label: "Ren" } });
const awaken = carrier("Awaken the Animism", { fallReduction: [{ value: 20, label: "Awaken the Animism" }] });
equal("I1 fall reductions add up and name themselves", fd.declaredFallReduction([ren, awaken, {}]), { feet: 40, labels: ["Ren −20 ft", "Awaken the Animism −20 ft"] });
equal("I2 nothing declared is nothing taken off", fd.declaredFallReduction([carrier("x", { fallReduction: { value: 0 } })]), { feet: 0, labels: [] });
equal("I3 carrying strength adds up; an inactive ability adds nothing", fd.declaredCarryStrength([{ type: "heritage", flags: { "trg-prime": { carryStrength: 5 } } }, { type: "ability", system: { active: false }, flags: { "trg-prime": { carryStrength: 3 } } }, { type: "feat" }]), 5);
const fw = read("module", "combat", "falling-workflow.mjs");
ok("I4 the fall takes the declared reduction off what was entered, never below zero", /const fallCut = declaredFallReduction\(declarationCarriers\(actor\)\);\s*const entered = Number\(result\.distance \|\| 0\);\s*const distance = Math\.max\(0, entered - fallCut\.feet\);/.test(fw));
ok("I5 and says so on the card", /if \(fallCut\.feet > 0 && entered > 0\) \{\s*lines\.push\(line\(`<em>\$\{entered\} feet entered, treated as \$\{distance\}/.test(fw));
ok("I6 carrying strength joins Hauler and the Backpack", /return hauler \+ fromItems \+ declaredCarryStrength\(items\);/.test(read("module", "stowage.mjs")));

/* J — a granted or chosen spell's own magical ability */
const kitsune = { flags: { "trg-prime": { grantedSpellAbility: "Charisma" } } };
const hotaru = { flags: { "trg-prime": { grantedSpellAbility: { "guidance": "wisdom" } } } };
equal("J1 a single word stamps every spell the item grants", [fd.grantedSpellAbilityFor(kitsune, "Ghost Sound"), fd.grantedSpellAbilityFor(kitsune, "Anything")], ["charisma", "charisma"]);
equal("J2 a table stamps only the spells it names, without case", [fd.grantedSpellAbilityFor(hotaru, "Guidance"), fd.grantedSpellAbilityFor(hotaru, "Light")], ["wisdom", null]);
equal("J3 a word that names no attribute, or nothing declared, stamps nothing", [fd.grantedSpellAbilityFor({ flags: { "trg-prime": { grantedSpellAbility: "luck" } } }, "x"), fd.grantedSpellAbilityFor({}, "x"), fd.grantedSpellAbilityFor(null, "x")], [null, null, null]);
equal("J4 a spell choice names its ability the same way", [fd.spellChoiceExtraFlags({ castingAbility: "Wisdom" }), fd.spellChoiceExtraFlags({ castingAbility: "luck" }), fd.spellChoiceExtraFlags({})], [{ castingAbilityOverride: "wisdom" }, null, null]);
equal("J5 and the stamped spell is cast with it", fd.innateAbilityKey({ flags: { "trg-prime": fd.spellChoiceExtraFlags({ castingAbility: "wisdom" }) } }, "intelligence", { wisdom: {}, intelligence: {} }), "wisdom");
ok("J6 the grant stamps castingAbilityOverride from the granting item", /const ownAbility = grantedSpellAbilityFor\(sourceItem, data\.name\);\s*if \(ownAbility\) foundry\.utils\.setProperty\(data, "flags\.trg-prime\.castingAbilityOverride", ownAbility\);/.test(read("module", "grants-workflow.mjs")));
ok("J7 the spell chooser passes the entry's ability as an extra flag", /extraFlags: spellChoiceExtraFlags\(spec\),\s*sourceItem: item/.test(read("module", "feats-workflow.mjs")));

const EXPECTED = 52;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-focus-declarations: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-focus-declarations: ${checks} checks — all green.`);
