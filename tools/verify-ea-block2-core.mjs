#!/usr/bin/env node
/**
 * verify-ea-block2-core — TRG Prime 3.678.0: the seams Eldritch Arts' Block 2
 * (Chapter 7: High Magic, ley lines, wild magic and suppression areas) needs,
 * from its audit (docs/ELDRITCH_ARTS_BLOCK2_AUDIT.md in the module) and
 * Graham's rulings of 1 November 2026 (M4, M27; Q1–Q4, Q6, Q7).
 *
 *   D1  a High Magic cast: which casts are, Hard (+2), armour DR × 4 in
 *       place of the tradition rule, the focus set aside, fumble +60 on top
 *       of the tradition modifier, every tradition for a Highmagic spell
 *   D1b Eldritch Arts' rules supersede the Fiends & Fables creature guideline
 *   D6  Resonance with disadvantage, and Resonance suppressed
 *   D7  a casting refused, and its degree read differently
 *   D14 an effect a module switches off, honoured by the conditionals
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
const hm = await imp("magic/high-magic.mjs");
const hooks = await imp("magic/cast-hooks.mjs");
const cdc = await imp("magic/casting-dc.mjs");
const cond = await imp("conditionals.mjs");
const sys = JSON.parse(read("system.json"));
const cw = read("module", "magic", "cast-workflow.mjs");

const item = (name, flags = {}, extra = {}) => ({ type: "class", name, system: {}, flags: { "trg-prime": flags }, ...extra });
const creature = { flags: { "trg-prime": { highMagic: true } }, items: [] };
const sorcerer = { flags: {}, items: [item("Sorcerer", { highMagicCaster: true })] };
const archmage = { flags: {}, items: [item("Archmage", { highMagicCaster: true, highMagicFocus: true })] };
const wizard = { flags: {}, items: [item("Wizard")] };
const fireball = { traits: "Evocation, Fire", tradition: "arcane" };
const chronoweave = { traits: "Highmagic, Uncommon", tradition: "" };

/* D1b — whose rules (Graham's M4) */
{
  api.resetModuleRegistry();
  equal("D1b without Eldritch Arts a creature keeps the guideline: save +2, free Heighten, fumble +50, and its casts are not D1 casts",
    [hm.highMagicSaveStep(creature), hm.highMagicHeightens(creature), hm.highMagicFumble(creature), hm.highMagicCast(creature, fireball).highMagic], [2, true, 50, false]);
  equal("D1b …a printed innate DC still takes no step", hm.highMagicSaveStep(creature, { printed: true }), 0);
  api.registerHighMagicRules("trg-eldritch-arts");
  equal("D1b with Eldritch Arts' rules declared: no save step, no free Heighten, fumble +60, and its casts are High Magic (Q1)",
    [hm.highMagicSaveStep(creature), hm.highMagicHeightens(creature), hm.highMagicHeightens(creature, true), hm.highMagicFumble(creature), hm.highMagicCast(creature, fireball)],
    [0, false, true, 60, { highMagic: true, source: "creature", label: "High Magic creature" }]);
  equal("D1b the rules are registered by name", api.registeredHighMagicRules(), "trg-eldritch-arts");
  ok("D1b a blank id is refused", api.registerHighMagicRules("") === false);
  api.resetModuleRegistry();
}

/* D1 — which casts, and what each changes */
{
  equal("D1 a Highmagic spell is High Magic whoever casts it; a High Magic caster's every spell is; a wizard's Fireball is not",
    [hm.highMagicCast(wizard, chronoweave).source, hm.highMagicCast(sorcerer, fireball).source, hm.highMagicCast(wizard, fireball).highMagic],
    ["trait", "caster", false]);
  equal("D1 the trait reads either spelling", [hm.spellIsHighmagic({ traits: "High Magic" }), hm.spellIsHighmagic({ traits: "Highmagical" })], [true, false]);
  equal("D1 a switched-off ability declares nothing",
    hm.declaresHighMagicCaster({ items: [{ type: "ability", name: "x", system: { active: false }, flags: { "trg-prime": { highMagicCaster: true } } }] }), false);
  equal("D1 Hard: +2 to the casting DC for a High Magic cast only", [hm.highMagicCastingDCStep(hm.highMagicCast(sorcerer, fireball)), hm.highMagicCastingDCStep(hm.highMagicCast(wizard, fireball))], [2, 0]);
  const armour = [{ dr: 3, category: "medium" }, { dr: 1, isHelmet: true }];
  equal("D1 armour: every worn piece's DR × 4", hm.highMagicArmourPenalty(armour), 16);
  api.registerHighMagicRules("trg-eldritch-arts");
  equal("D1 Q3: the armour rule is for a High Magic class or a Highmagic spell, not a creature's flag alone",
    [hm.highMagicArmourApplies(hm.highMagicCast(sorcerer, fireball)), hm.highMagicArmourApplies(hm.highMagicCast(wizard, chronoweave)), hm.highMagicArmourApplies(hm.highMagicCast(creature, fireball)), hm.highMagicArmourApplies(hm.highMagicCast(wizard, fireball))],
    [true, true, false, false]);
  api.resetModuleRegistry();
  equal("D1 Q2: the focus is set aside for a High Magic cast — not for an Archmage (or the Arcanum birthright), not for a low magic cast",
    [hm.highMagicFocusSetAside(sorcerer, hm.highMagicCast(sorcerer, fireball)), hm.highMagicFocusSetAside(archmage, hm.highMagicCast(archmage, fireball)), hm.highMagicFocusSetAside(wizard, hm.highMagicCast(wizard, fireball))],
    [true, false, false]);
  equal("D1 fumble +60 for a High Magic cast, whoever casts it", [hm.highMagicFumble(sorcerer, hm.highMagicCast(sorcerer, fireball)), hm.highMagicFumble(wizard, hm.highMagicCast(wizard, fireball))], [60, 0]);
  equal("D1 M27/Q4: a Highmagic spell counts as every tradition and fumbles by the caster's own; another spell keeps its own",
    [hm.highMagicTraditions(chronoweave, "", "Verdant"), hm.highMagicTraditions(fireball, "arcane", "verdant")],
    [{ traditions: "arcane, divinity, ethereal, verdant", fumbleTradition: "verdant" }, { traditions: "arcane", fumbleTradition: "arcane" }]);
  const dcHM = cdc.assembledCastingDC({ totalPP: 4, casterLevel: 4, armourPenalty: 16, highMagicDelta: 2, armourLabel: "Armour, High Magic ×4" });
  const dcLow = cdc.assembledCastingDC({ totalPP: 4, casterLevel: 4, armourPenalty: 6 });
  equal("D1 the casting DC names both parts, and a low magic cast is as before",
    [dcHM.dc - dcHM.base, dcHM.parts.map((p) => p.label), dcLow.dc - dcLow.base, dcLow.parts.map((p) => p.label)],
    [18, ["Armour, High Magic ×4", "High Magic, Hard"], 6, ["Prohibited armour"]]);
  // The wiring in castSpell.
  ok("D1 the cast asks which kind it is, and its traditions",
    /const hmCast = highMagicCast\(actor, spellData\);\n\s*const hmTraditions = highMagicTraditions\(spellData, tradition, system\.magic\?\.tradition\);/.test(cw)
    && /traditions: hmTraditions\.traditions,/.test(cw));
  ok("D1 the armour rule replaces the tradition's for such a cast",
    /const highMagicArmour = highMagicArmourApplies\(hmCast\);\n\s*const armourPenalty = highMagicArmour\n\s*\? highMagicArmourPenalty\(equippedArmour\)\n\s*: armourCastingPenalty\(tradition, penalisingArmour\);/.test(cw));
  ok("D1 the DC takes Hard and names the armour",
    /highMagicDelta: highMagicCastingDCStep\(hmCast\),\n\s*armourLabel: highMagicArmour \? "Armour, High Magic ×4" : ""/.test(cw));
  ok("D1 the focus is set aside on the check and on the fumble",
    /const focusSetAside = highMagicFocusSetAside\(actor, hmCast\);\n\s*const focusMod = focusSetAside \? null : focusCheckModifier\(system\.magic\);/.test(cw)
    && /focusPenalty: focusSetAside \? 0 : focusFumblePenalty\(system\.magic\),\n\s*highMagic: hmCast,/.test(cw));
  ok("D1 the fumble takes the caster's tradition for an all-traditions spell, and +60", /tradition: hmTraditions\.fumbleTradition,/.test(cw)
    && /const highMagicMod = highMagicFumble\(actor, highMagic\);/.test(cw));
  ok("D1 the spell-check gates are told whether the cast is High Magic", /attack: isAttack,\n(?:\s*\/\/[^\n]*\n)*\s*highMagic: hmCast\.highMagic,/.test(cw));
  ok("D1 the Resonance context carries High Magic", /\.\.\.\(hmCast\.highMagic \? \{ highMagic: true \} : \{\}\)/.test(cw));
}

/* D6 — Resonance with disadvantage, and none at all */
{
  ok("D6 the first percentile is rolled twice and the higher kept; the open-ended rest once",
    // RE-POINTED AT 3.684.0 (Block 6, G5): the bias is resolved by
    // resonanceRollBias — High Magic's disadvantage, lifted by a module's
    // `single` — and kept by keptPercentile (the higher, on disadvantage);
    // verify-ea-block6b-core drives both.
    /const rollBias = resonanceRollBias\(\{\n\s*disadvantage, highMagic: modifiers\?\.highMagic === true, single: moduleResonance\.single, biases: moduleResonance\.biases\n\s*\}\);\n\s*const worse = rollBias !== "normal";/.test(cw)
    && /if \(!worse \|\| drawn\+\+ > 0\) return first;\n\s*const second = percentileValue\(await draw\(10\), await draw\(10\)\);\n\s*firstPair\.push\(first, second\);\n\s*return keptPercentile\(first, second, rollBias\);/.test(cw));
  ok("D6 Absolute Chaos's two rolls keep the disadvantage", /reason: "Absolute Chaos — first roll", modifiers, disadvantage \}/.test(cw));
  ok("D6 a suppressed event is said and not rolled",
    /const suppressed = await resonanceSuppressedBy\(\{ actor, reason \}\);\n\s*if \(suppressed\) \{/.test(cw));
  api.resetModuleRegistry();
  equal("D6 nobody suppresses: no reason", await hooks.resonanceSuppressedBy({ actor: {} }), "");
  api.registerResonanceSuppressor("boom", () => { throw new Error("x"); });
  api.registerResonanceSuppressor("zone", ({ actor }) => (actor.inZone ? "a Magic Suppression area (level 6)" : null));
  const quiet = console.error; console.error = () => {};
  equal("D6 the first reason is given, a failing module costs only its own answer",
    [await hooks.resonanceSuppressedBy({ actor: { inZone: true } }), await hooks.resonanceSuppressedBy({ actor: {} })], ["a Magic Suppression area (level 6)", ""]);
  console.error = quiet;
  api.resetModuleRegistry();
}

/* D7 — refused, and read differently */
{
  api.resetModuleRegistry();
  equal("D7 nobody refuses", await hooks.castRefusalFrom({ actor: {} }), "");
  api.registerCastRefusal("antimagic", ({ actor }) => (actor.inField ? "No spell functions inside an antimagic zone" : null));
  equal("D7 a refusal gives its reason", [await hooks.castRefusalFrom({ actor: { inField: true } }), await hooks.castRefusalFrom({ actor: {} })], ["No spell functions inside an antimagic zone", ""]);
  api.resetModuleRegistry();
  api.registerCastRefusal("blank", () => "  ");
  api.registerCastRefusal("antimagic", () => "No spell functions inside an antimagic zone");
  equal("D7 a blank answer is no answer: the next module is still asked", await hooks.castRefusalFrom({ actor: {} }), "No spell functions inside an antimagic zone");
  const SUPPRESS = { partial: "failure", failure: "failure", fumble: "failure", blunder: "fumble" };
  api.registerCastDegreeRemap("suppression", ({ degree }) => (SUPPRESS[degree] ? { degree: SUPPRESS[degree], lines: [`Suppression: ${degree} read as ${SUPPRESS[degree]}.`] } : null));
  api.registerCastDegreeRemap("nonsense", () => ({ degree: "splendid" }));
  equal("D7 each degree read through the remap; an unknown answer is ignored",
    await Promise.all(hooks.CAST_DEGREES.map(async (d) => (await hooks.remapCastDegree({ degree: d })).degree)),
    ["heroic", "critical", "success", "failure", "failure", "failure", "fumble"]);
  equal("D7 …and the remap's lines come back for the card", (await hooks.remapCastDegree({ degree: "blunder" })).lines, ["Suppression: blunder read as fumble."]);
  api.registerCastDegreeRemap("then", ({ degree }) => (degree === "failure" ? { degree: "partial" } : null));
  equal("D7 remaps run in order, each seeing the last", (await hooks.remapCastDegree({ degree: "fumble" })).degree, "partial");
  api.resetModuleRegistry();
  ok("D7 the cast asks for a refusal before anything is spent, and stops on one",
    /const refused = await castRefusalFrom\(\{\n\s*actor, spell, spellData: spell\?\.system \?\? \{\}, innate: Boolean\(spell\?\.system\?\.innate\),/.test(cw)
    && /if \(refused\) \{\n\s*ui\.notifications\.warn\(refused\);\n\s*return null;/.test(cw)
    && cw.indexOf("castRefusalFrom({") < cw.indexOf("castingRefusal(actor, spell?.system"));
  ok("D7 the degree is read after the page's overrides and before the outcome, never for an innate or no-check cast",
    /if \(!isInnate && !noCheckCantrip\) \{\n\s*const \{ remapCastDegree \} = await import\("\.\/cast-hooks\.mjs"\);/.test(cw)
    && /degree = remapped\.degree;\n\s*degreeRemapLines\.push\(\.\.\.remapped\.lines\);/.test(cw)
    && cw.indexOf("remapCastDegree({") > cw.indexOf("passActionFlatChecks(actor, {") && cw.indexOf("remapCastDegree({") < cw.indexOf("const outcome = castingOutcome("));
  ok("D7 the remap's lines reach the card", /const lines = \[\.\.\.reagentLines, \.\.\.gateLines, \.\.\.degreeRemapLines\.map\(\(text\) => line\(text\)\),/.test(cw));
  ok("D7 the cast hook says chaos, whether a check was rolled, and how it was cast",
    /chaos, innate: isInnate, rollsCheck: !isInnate && !noCheckCantrip,\n\s*itemCast: Boolean\(itemCheck\), ritual: Boolean\(ritual\), highMagic: hmCast\.highMagic,/.test(cw));
}

/* D7b — the settled cast and an item's release, said to modules (found in review) */
{
  ok("D7b the settled hook says chaos and whether a check was rolled (a wild surge waits for the PP to be paid)",
    /Hooks\.callAll\("trgPrimeSpellSettled", \{\n\s*actor, spell, spellData, degree,\n(?:\s*\/\/[^\n]*\n)*\s*chaos, rollsCheck: !isInnate && !noCheckCantrip, ritual: Boolean\(ritual\), highMagic: hmCast\.highMagic,/.test(cw));
  const ciw = read("module", "charged-items-workflow.mjs");
  ok("D7b a release check says its degree and chaos (Q7: scrolls and wands surge)",
    // RE-POINTED AT 3.684.0 (Block 6, G6): the payload adds `itemUuid`.
    /Hooks\?\.callAll\?\.\("trgPrimeReleaseRolled", \{\n\s*actor, itemName, itemUuid: String\(itemUuid \?\? ""\), spellName, kind, pp: cost, degree,\n\s*chaos: Boolean\(check\?\.dice\?\.chaos\)\n\s*\}\);\n\n\s*return \{ check, degree, outcome, option, options \};/.test(ciw));
  ok("D1 a High Magic cast says how it is identified", /\.\.\.\(hmCast\.highMagic \? \[line\(`<em>High Magic \(\$\{hmCast\.label\}\): it registers simply as magic, and identifying it is Very Hard \(DC \+5\)\.<\/em>`\)\] : \[\]\),/.test(cw));
}

/* D14 — an effect switched off */
{
  api.resetModuleRegistry();
  const fx = { name: "Rune", parent: { documentName: "Item" }, inField: true };
  equal("D14 nobody suppresses", hooks.effectSuppressedByModule(fx), false);
  api.registerEffectSuppressor("antimagic", (effect) => effect.inField === true);
  equal("D14 the module's answer", [hooks.effectSuppressedByModule(fx), hooks.effectSuppressedByModule({ inField: false })], [true, false]);
  api.resetModuleRegistry();
  ok("D14 TRGActiveEffect.isSuppressed asks it", /if \(effectSuppressedByModule\(this\)\) return true;/.test(read("module", "documents", "active-effect.mjs")));
  const row = { kind: "modifier", value: 2, type: "status", label: "Test", auto: true, when: { checkTypes: ["save"] } };
  const live = { id: "a", name: "Live", disabled: false, isSuppressed: false, flags: { "trg-prime": { conditionals: [row] } } };
  const off = { id: "b", name: "Off", disabled: false, isSuppressed: true, flags: { "trg-prime": { conditionals: [row] } } };
  equal("D14 a suppressed effect's conditionals do not apply; a live one's do", [cond.collectConditionals([], [live]).length, cond.collectConditionals([], [off]).length], [1, 0]);
  equal("D14 …one effect's row, not two", cond.collectConditionals([], [live, off]).length, 1);
}

/* A1 — a module action's own DC (Tap Ley Line: the line's level) */
{
  const aw = read("module", "combat", "action-workflow.mjs");
  ok("A1 the action's resolveDC sets the DC and its label, after the target's and before the defender's rows",
    /if \(typeof action\.resolveDC === "function"\) \{/.test(aw)
    && /own = await action\.resolveDC\(\{ actor, targetActor \}\);/.test(aw)
    && /if \(Number\.isFinite\(Number\(own\?\.dc\)\)\) \{\n\s*resolved\.dc = Number\(own\.dc\);\n\s*resolved\.label = String\(own\.label \?\? resolved\.label\);/.test(aw)
    && aw.indexOf("action.resolveDC({ actor, targetActor })") > aw.indexOf("const resolved = actionTargetDC(")
    && aw.indexOf("action.resolveDC({ actor, targetActor })") < aw.indexOf("const defenceDCLines = [];"));
  ok("A1 …or refuses before anything is rolled", /if \(own\?\.refused\) \{\n\s*ui\.notifications\.warn\(`\$\{action\.name\}: \$\{own\.refused\}`\);\n\s*return null;/.test(aw));
  api.resetModuleRegistry();
  const resolver = () => ({ dc: 21 });
  api.queueSkillActions([{ key: "tapLeyLine", name: "Tap Ley Line", skills: ["powerManipulation"], traits: "Concentrate", apCost: "1", proficiency: "untrained", checkType: "skill", against: "none", outcomes: {}, description: "x", resolveDC: resolver }], "test");
  equal("A1 a registered action keeps its resolveDC", api.queuedSkillActions().find((a) => a.key === "tapLeyLine")?.resolveDC === resolver, true);
  api.resetModuleRegistry();
}

/* H — the helpers Chapter 7's tables call */
{
  const apw = read("module", "module-api-workflow.mjs");
  for (const [name, re] of [
    ["rollResonanceEvent", /rollResonanceEvent: async \(\.\.\.args\) => \(await import\("\.\/magic\/cast-workflow\.mjs"\)\)\.rollResonanceEvent\(\.\.\.args\),/],
    ["chargedItemLevelOf", /chargedItemLevelOf: async \(\.\.\.args\) => \(await import\("\.\/charged-items\.mjs"\)\)\.chargedItemLevelOf\(\.\.\.args\),/],
    ["rollItemDepletion", /rollItemDepletion: async \(\.\.\.args\) => \(await import\("\.\/magic-items-workflow\.mjs"\)\)\.rollItemDepletion\(\.\.\.args\),/],
    ["regionContains", /regionContains: async \(\.\.\.args\) => \(await import\("\.\/combat\/surfaces\.mjs"\)\)\.regionContains\(\.\.\.args\),/]
  ]) ok(`H the module helpers offer ${name}`, re.test(apw));
}

/* Z — the release */
{
  const [za, zb] = String(sys.version).split(".").map(Number);
  ok("Z the system is 3.678.0 or later", za > 3 || (za === 3 && zb >= 678));
}

if (failures.length) {
  console.log(`verify-ea-block2-core: ${checks} checks — ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log(`verify-ea-block2-core: ${checks} checks — all green.`);
}
