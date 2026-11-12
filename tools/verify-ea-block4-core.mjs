#!/usr/bin/env node
/**
 * verify-ea-block4-core — TRG Prime 3.682.0: the seams Eldritch Arts' Block 4
 * (the Spellblade and the Warlock) needs, from the Block 4 audit
 * (docs/ELDRITCH_ARTS_BLOCK4_AUDIT.md in the module), answered by Graham on
 * 3 November 2026 (Q36, Q37, Q43, Q45, Q46 and Q48), with his ruling on the
 * touch attack the same day ("should always miss on a 1 and hit on a 20").
 *
 *   M   the daily memorisation budget a class declares ("2+2L" or "L+1")
 *   B   a spell attack on BAB in place of BSB (Battle Mage)
 *   I   levels a module adds to an innate cast (the bonded souls)
 *   R   runes infused into a weapon (Infuse Weapon): the union, the readers
 *   S   a Strike inside a spell: castSpell on the API, the Strike's roll as
 *       the casting check, a melee Strike at a spell's reach
 *   C   cover stepped down a degree (Shooting Star)
 *   A   the damage an affliction deals carries its kind (Q43)
 *   T   the touch attack's natural 1 and 20
 *   P   a cast's prelude (Thunderous Strike: the Strike first, then the cast)
 *   H   the spell attack's hits, on trgPrimeSpellSettled (Xithra's riders)
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
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = globalThis.Hooks ?? { on() {}, callAll() {} };

const mem = await imp("magic/memorisation.mjs");
const cm = await imp("magic/class-magic.mjs");
const ab = await imp("combat/attack-base.mjs");
const api = await imp("module-api.mjs");
const ilb = await imp("magic/innate-level-bonus.mjs");
const inf = await imp("infused-runes.mjs");
const atk = await imp("combat/attack.mjs");
const se = await imp("magic/strike-edge.mjs");
const sr = await imp("magic/spell-range.mjs");
const sys = JSON.parse(read("system.json"));
const src = {
  memw: read("module", "magic", "memorisation-workflow.mjs"),
  cast: read("module", "magic", "cast-workflow.mjs"),
  effects: read("module", "magic", "spell-effects.mjs"),
  attack: read("module", "combat", "attack-workflow.mjs"),
  item: read("module", "documents", "item.mjs"),
  apiw: read("module", "module-api-workflow.mjs"),
  affl: read("module", "combat", "affliction-workflow.mjs"),
  check: read("module", "dice", "check.mjs")
};

// ── M: the daily budget ─────────────────────────────────────────────────
equal("M1 the default is 2 + 2 × level", [0, 1, 5, 20].map((l) => mem.memorisedSpellCount(l)), [2, 4, 12, 42]);
equal("M2 the Spellblade's level + 1", [1, 5, 20].map((l) => mem.memorisedSpellCount(l, "L+1")), [2, 6, 21]);
equal("M3 the rule is read loosely and an unknown one is the default", ["l + 1", " 2+2l ", "3L", "", null].map(mem.memorisedPerDayRule), ["L+1", "2+2L", "2+2L", "2+2L", "2+2L"]);
equal("M4 the state's allowance follows the rule", mem.memorisationState({ level: 4, memorisedPerDay: "L+1" }).leveledAllowed ?? mem.memorisationState({ level: 4, memorisedPerDay: "L+1" }).leveled?.allowed, 5);
equal("M5 and, with none, is the default's", mem.memorisationState({ level: 4 }).leveledAllowed ?? mem.memorisationState({ level: 4 }).leveled?.allowed, 10);
equal("M6 a class declares it", cm.classMagicOf({ flags: { "trg-prime": { classMagic: { memorisedPerDay: "L+1" } } } }).memorisedPerDay, "L+1");
equal("M7 a class that doesn't has the default", cm.classMagicOf({ flags: { "trg-prime": { classMagic: {} } } }).memorisedPerDay, "2+2L");
ok("M8 the memorisation dialog reads the class's rule", /memorisedPerDay: actor\.system\?\.progression\?\.classMagic\?\.memorisedPerDay \?\? "2\+2L"/.test(src.memw));

// ── B: Battle Mage ──────────────────────────────────────────────────────
const fighterish = { combat: { bab: { total: 6 } }, magic: { bsb: 2 }, progression: { bsb: 1 } };
const bm = { flags: { "trg-prime": { spellAttackBase: "bab" } } };
equal("B1 BAB in place of BSB: the difference, untyped", ab.spellAttackBaseRow([bm], fighterish), { label: "BAB 6 in place of BSB 3", value: 3, type: "untyped" });
equal("B2 nothing when BSB is already as high", ab.spellAttackBaseRow([bm], { combat: { bab: { total: 3 } }, magic: { bsb: 3 } }), null);
equal("B3 nothing without the declaration", ab.spellAttackBaseRow([{ flags: {} }], fighterish), null);
equal("B4 nothing from a disabled source", ab.spellAttackBaseRow([{ ...bm, disabled: true }], fighterish), null);
ok("B5 the spell attack takes the row, never for an innate spell nor on a Strike's roll (review)", /if \(!spell\?\.system\?\.innate && !check\?\.fromStrike\)[\s\S]{0,300}spellAttackBaseRow\([\s\S]{0,160}actor\.system, spellData\);/.test(src.cast)
  && /if \(check && strikeCheck\?\.dice\) check\.fromStrike = true;/.test(src.cast));
equal("B6 only a spell with the Attack trait (review)", [ab.spellAttackBaseRow([bm], fighterish, { traits: "Attack, Fire" })?.value, ab.spellAttackBaseRow([bm], fighterish, { traits: "Fire" })], [3, null]);
// 3.682.1 (live test): the core's attack spells carry the trait as their category.
equal("B6b an attack spell (category attack) has the Attack trait: Orb Of Force, Hurling", [ab.spellAttackBaseRow([bm], fighterish, { category: "attack", traits: "Cantrip, Force, Invocation" })?.value, ab.spellAttackBaseRow([bm], fighterish, { category: "save", traits: "Fire" })], [3, null]);
equal("B7 nor from a switched-off ability (review)", ab.spellAttackBaseRow([{ ...bm, system: { active: false } }], fighterish), null);
// 3.682.2 (Graham, Q53: "Yes it should"): a maneuver spell's Spellcraft check is its attack.
{
  const man = src.effects.slice(src.effects.indexOf('case "maneuver": {'), src.effects.indexOf('case "trait": {'));
  const rowAt = man.indexOf("spellAttackBaseRow([...Array.from(caster.items ?? []), ...Array.from(caster.appliedEffects ?? [])], caster.system)");
  ok("B8 a maneuver spell's Spellcraft check takes Battle Mage's row, asking no trait, before it is rolled (Q53)",
    rowAt > 0 && /if \(baseRow\) modifiers\.push\(baseRow\);/.test(man.slice(rowAt, rowAt + 200))
    && rowAt < man.indexOf("TRGCheck.roll(") && rowAt > man.indexOf("const modifiers = ["));
}
// 3.682.3 (Graham: "It should not ignore MAP"): the maneuver check is an attack action.
{
  const man = src.effects.slice(src.effects.indexOf('case "maneuver": {'), src.effects.indexOf('case "trait": {'));
  const roll = man.indexOf("TRGCheck.roll(");
  const row = man.indexOf('modifiers.push({ label: "Multiple attack penalty", value: map, type: "untyped" })');
  ok("B9 a maneuver spell's check rolls at the multiple attack penalty, when its action has the Attack trait, before the roll",
    row > 0 && row < roll && /const maneuverCounts = countsTowardMAP\(actionData\?\.traits\);/.test(man)
    && /const map = exempt \? 0 : mapPenalty\(maneuverMapBefore\);/.test(man));
  ok("B10 …with Monstrous Grab's exemption read as the action reads it",
    /const exempt = abilityMapExemptActions\(Array\.from\(caster\.items \?\? \[\]\)\)\.has\(String\(actionKey\)\.toLowerCase\(\)\);/.test(man));
  const climb = man.indexOf("await setAttackCount(caster, maneuverMapBefore + maneuverChecks);");
  ok("B11 …and counts toward the next attack after the roll, hit or miss",
    climb > roll && /if \(check && maneuverCounts\) \{\s*maneuverChecks \+= 1;/.test(man));
  const head = src.effects.slice(src.effects.indexOf("export async function applySpellEffects("), src.effects.indexOf('case "maneuver": {'));
  ok("B12 …one cast's checks share the count as it stood before the first (a volley's rule)",
    /let maneuverMapBefore = null;\s*let maneuverChecks = 0;/.test(head)
    // declared once a cast, outside the loop over the recipients (review)
    && head.split("let maneuverMapBefore = null;").length === 2
    && head.indexOf("let maneuverMapBefore = null;") < head.indexOf("for (const target of recipients) {")
    && /if \(maneuverMapBefore === null\) maneuverMapBefore = attackCountOf\(caster\);/.test(man));
}

// ── I: the bonded souls' levels ─────────────────────────────────────────
api.resetModuleRegistry?.();
const ctx = ilb.innateLevelBonusContext(null, { system: { traits: "Fire, Attack", school: "Invocation", tradition: "Arcane" } });
equal("I1 the context: traits and school, lower-cased; the tradition", [ctx.traits, ctx.tradition], [["fire", "attack", "invocation"], "arcane"]);
ok("I2 a bonus needs a function", (await quiet(async () => api.registerInnateLevelBonus("x", 3))) === false);
api.registerInnateLevelBonus("emberlord", (c) => (c.traits.includes("fire") || c.traits.includes("healing") ? 1 : 0), "test");
api.registerInnateLevelBonus("voidseer", (c) => (c.traits.includes("insight") ? 1 : 0), "test");
api.registerInnateLevelBonus("broken", () => { throw new Error("boom"); }, "test");
api.registerInnateLevelBonus("negative", () => -4, "test");
equal("I3 the answers add; a throw or a negative adds nothing", await quiet(() => ilb.innateLevelBonusFor(null, { system: { traits: "Fire" } })), 1);
equal("I4 a spell no soul speaks to gains none", await quiet(() => ilb.innateLevelBonusFor(null, { system: { traits: "Cold", school: "Abjuration" } })), 0);
equal("I5 the school counts", await quiet(() => ilb.innateLevelBonusFor(null, { system: { school: "Insight" } })), 1);
api.resetModuleRegistry?.();
ok("I6 the innate PP limit's level takes it, unless an item grants the spell", /gateAt\.level \+ \(gateAt\.itemName \? 0 : await innateLevelBonusFor\(actor, spell\)\)/.test(src.cast));
ok("I7 so do the innate attack, DC and warp budget", /const innateLevel = innateAt\.level \+ innateBonusLevels;/.test(src.cast) && /isInnate && !innateAt\.itemName && !isItemCast \? await innateLevelBonusFor\(actor, spell\) : 0;/.test(src.cast));
ok("I8 the API exposes the registration", /registerInnateLevelBonus: \(key, bonus, moduleId\) => registerInnateLevelBonus\(key, bonus, moduleId\)/.test(src.apiw));

// ── R: infused runes ────────────────────────────────────────────────────
const actor = { flags: { "trg-prime": { [inf.INFUSED_RUNES_FLAG]: { weaponId: "w1", runes: "Flaming I", magical: true } } } };
equal("R1 the infusion is the named weapon's", inf.infusionFor(actor, { id: "w1" }), { runes: "Flaming I", magical: true });
equal("R2 and no other's", inf.infusionFor(actor, { id: "w2" }), null);
equal("R3 magical unless it says not", inf.infusionFor({ flags: { "trg-prime": { infusedRunes: { weaponId: "w1", runes: "", magical: false } } } }, { id: "w1" }).magical, false);
equal("R4 the union of the two fields", [inf.mergedRuneField("Keen", "Flaming I"), inf.mergedRuneField("", "Flaming I"), inf.mergedRuneField("Keen", "")], ["Keen, Flaming I", "Flaming I", "Keen"]);
equal("R5 a reader takes the prepared union, else the weapon's own", [inf.runeFieldOf({ system: { runes: "Keen", effectiveRunes: "Keen, Flaming I" } }), inf.runeFieldOf({ system: { runes: "Keen" } })], ["Keen, Flaming I", "Keen"]);
ok("R6 the weapon prepares the union and counts it, the infused runes exempt (Q45)",
  /infusion \? this\.system\.effectiveRunes : this\.system\.runes/.test(src.item) && /exempt: \[\.\.\.\(onLoan \? \[onLoan\] : \[\]\), \.\.\.infusedLabels\]/.test(src.item));
ok("R6b a cleared infusion clears the prepared fields (an embedded item is prepared again without a reset)",
  /if \(this\.type === "weapon"\) \{\s*this\.system\.infused = Boolean\(infusion\?\.magical\);\s*this\.system\.infusedRunes = infusion \? infusion\.runes : "";\s*this\.system\.effectiveRunes = infusion \? mergedRuneField\(this\.system\.runes, infusion\.runes\) : undefined;/.test(src.item));
ok("R7 an infused weapon strikes as magical (Q44)", /\|\| Boolean\(unarmed\?\.magical\)\s*(\/\/[^\n]*\n\s*)*\|\| Boolean\(weapon\?\.system\?\.infused\)\s*(\/\/[^\n]*\n\s*)*\|\| Boolean\(bonded\?\.magical\);/.test(src.attack));
// Every rune READER goes through runeFieldOf: none reads the weapon's own field.
const readers = ["rune-damage.mjs", "rune-declarations.mjs", "rune-effects.mjs", "rune-actions.mjs", "rune-events.mjs", "rune-spell-effect.mjs", "codex-runes.mjs", "combat/thrown-weapons.mjs"];
for (const rel of readers) {
  const file = fs.existsSync(path.join(SYSTEM_ROOT, "module", rel)) ? read("module", rel)
    : fs.existsSync(path.join(SYSTEM_ROOT, "module", "combat", rel)) ? read("module", "combat", rel) : null;
  if (file === null) { ok(`R8 ${rel} exists`, false); continue; }
  ok(`R8 ${rel} reads runeFieldOf`, /runeFieldOf\(/.test(file));
  ok(`R9 ${rel} reads no weapon's own rune field`, !/(parseRunes|fieldToRunes)\([^)]*system\??\.runes/.test(file), "a parseRunes/fieldToRunes(… system.runes) read");
}

// ── S: a Strike inside a spell ──────────────────────────────────────────
ok("S1 castSpell on the API, with the core's options", /castSpell: async \(actor, spell, options = \{\}\) => \(await import\("\.\/magic\/cast-workflow\.mjs"\)\)\.castSpell\(actor, spell, options \?\? \{\}\)/.test(src.apiw));
ok("S2 castSpellResolved takes strikeCheck", /async function castSpellResolved\([^)]*strikeCheck = null[^)]*\)/.test(src.cast));
ok("S3 the Strike's dice and modifiers are the casting check, against the casting DC, without a second Conviction",
  /: strikeCheck\?\.dice\s*\? await TRGCheck\.roll\(\{[\s\S]{0,700}dc,[\s\S]{0,200}presetDice: strikeCheck\.dice,\s*presetModifiers: \[\.\.\.Array\.from\(strikeCheck\.modifiers \?\? \[\]\), \.\.\.gated\.modifiers\],\s*allowConviction: false/.test(src.cast));
ok("S4 TRGCheck honours preset dice and modifiers", /this\.presetDice = config\.presetDice \?\? null;/.test(src.check) && /this\.modifiers = config\.presetModifiers\.map/.test(src.check));
equal("S5 within the spell's reach", [atk.withinReachOverride(25, 30), atk.withinReachOverride(30, 30), atk.withinReachOverride(35, 30)], [true, true, false]);
equal("S6 no override, or no distance, decides nothing", [atk.withinReachOverride(10, null), atk.withinReachOverride(null, 30), atk.withinReachOverride(10, undefined), atk.withinReachOverride(10, 0), atk.withinReachOverride(0, 0)], [false, false, false, false, false]);
ok("S7 rollWeaponAttack takes the override and lets the target be in reach",
  /reachOverrideFeet = null,/.test(src.attack) && /\(reachAlreadyEstablished \|\| withinReachOverride\(distanceToTarget, reachOverrideFeet\)\) \? null : distanceToTarget/.test(src.attack));
equal("S8 an out-of-reach target is still out of reach without it", atk.reachPenalty(false, 5, 30, {}).outOfReach, true);

ok("S9 the API gives Learn a Spell's terms for a PP (the Book of Infusions, Q46)",
  /learnSpellTerms: async \(pp\) => \{\s*const \{ learnSpellCost, learnSpellHours \} = await import\("\.\/magic\/learn-spell\.mjs"\);\s*const cost = learnSpellCost\(pp\);\s*return \{ gp: Number\(cost\.gp \?\? 0\), dc: Number\(cost\.dc \?\? 0\), hours: Number\(learnSpellHours\(pp\) \?\? 0\) \};/.test(src.apiw)
  && /learnSpellOutcome: async \(degreeKey\) => \(await import\("\.\/magic\/learn-spell\.mjs"\)\)\.learnSpellOutcome\(String\(degreeKey \?\? ""\)\),/.test(src.apiw));
ok("S10 and recurring damage by the core's own rule (the Emberlord's rider)",
  /addRecurringDamage: async \(target, amount, damageType\) => \{[\s\S]{0,200}const \{ layRecurring \} = await import\("\.\/conditions\/recurring-workflow\.mjs"\);[\s\S]{0,400}return layRecurring\(target, [^\n]+\n\s*apply: \(options\) => relayStatus\(target, "recurring", options, \(\) => target\.toggleStatusEffect\("recurring", options\)\)/.test(src.apiw));

ok("S11 and the runes a kind of item takes, and a selection as a field (Infuse Weapon)",
  /runesFor: async \(kind\) => \(await import\("\.\/rune-catalogue\.mjs"\)\)\.runesFor\(kind\),\s*runesToField: async \(kind, selection = \[\]\) => \(await import\("\.\/rune-catalogue\.mjs"\)\)\.runesToField\(kind, selection\),/.test(src.apiw));

// ── C: cover stepped down ───────────────────────────────────────────────
equal("C1 the degrees, from page 198's table", se.COVER_DEGREES, [["", 0], ["lesser", 2], ["standard", 4], ["greater", 8]]);
equal("C2 greater → standard, standard → lesser, lesser → none",
  ["greater", "standard", "lesser"].map((l) => se.coverSteppedDown(l, 1)),
  [{ from: "greater", to: "standard", lost: 4 }, { from: "standard", to: "lesser", lost: 2 }, { from: "lesser", to: "", lost: 2 }]);
equal("C3 no cover, or no step, loses nothing", [se.coverSteppedDown("", 1).lost, se.coverSteppedDown("greater", 0).lost, se.coverSteppedDown("nonsense", 1).lost], [0, 0, 0]);
const uuid = "Actor.t1";
equal("C4 an edge carries its step; the largest wins",
  se.strikeEdgeFrom([{ flags: { "trg-prime": { strikeEdge: { reduceCover: 2, targetUuid: uuid } } } }, { flags: { "trg-prime": { strikeEdge: { ignoreConcealment: true, reduceCover: 1, label: "Shooting Star" } } } }], uuid),
  { ignoreCircumstance: false, ignoreConcealment: true, reduceCover: 2, label: "Shooting Star" });
equal("C5 an edge for another target is not this one's", se.strikeEdgeFrom([{ flags: { "trg-prime": { strikeEdge: { reduceCover: 1, targetUuid: "Actor.other" } } } }], uuid), null);
ok("C6 the DB loses what the step takes: the target's live Take Cover, else firing into melee's standard",
  /const taken = coverEffect && !coverEffect\.disabled \? takeCoverLevelOf\(targetActor\) : "";/.test(src.attack)
  // RE-POINTED AT 3.684.3: a taken cover is marked so; firing into melee's is the stepped row (6d D19).
  // RE-POINTED AT 3.684.5: the entries and the effect are read before the
  // higher cover is picked (6d D19j).
  && /const sheetEntries = taken \? \(await import\(\"\.\/defence-dc\.mjs\"\)\)\.defenceStackBase\(targetActor\) : \[\];\n(\s*\/\/[^\n]*\n)*\s*const coverSource = taken \? \{ uuid: coverEffect\.uuid, id: coverEffect\.id, name: coverEffect\.name \} : null;/.test(src.attack)
  && /const sheetLoss = coverLossInDefence\(sheetEntries, step\.lost, coverSource\);/.test(src.attack)
  && /coverStep = \{ \.\.\.step, taken: true, lost: sheetLoss, sheetLoss, tableLost: step\.lost, coverSource, steppedCoverEntries \};/.test(src.attack)
  && /\} else if \(coverBonus\) \{\s*coverStep = coverSteppedDown\("standard", strikeEdge\.reduceCover\);/.test(src.attack)
  && /- pierce\.amount - takenCoverLoss/.test(src.attack));
const slot = (v) => ({ type: "circumstance", value: v, source: "sheet" }), other = (v) => ({ type: "circumstance", value: v, source: "effect" });
equal("C6b circumstance bonuses do not stack: another holds part of it up (review)",
  [se.coverLossInDefence([slot(4)], 2), se.coverLossInDefence([slot(4), other(3)], 2), se.coverLossInDefence([slot(4), other(5)], 2), se.coverLossInDefence([], 2), se.coverLossInDefence([slot(8)], 4), se.coverLossInDefence([slot(4)], 0)],
  [2, 1, 0, 0, 4, 0]);
ok("C6c a melee weapon that can be thrown stays a melee Strike within the spell's reach (review)", /distanceToTarget > meleeReach &&\s*(\/\/[^\n]*\n\s*)*!withinReachOverride\(distanceToTarget, reachOverrideFeet\);/.test(src.attack));
// RE-POINTED AT 3.684.5: the line says which cover when there are two (6d D19j).
ok("C7 the roll says so", /cover\$\{whichCover\} is \$\{coverStep\.to \|\| "no"\} cover \(−\$\{coverStep\.lost\} DB\)/.test(src.attack));

// ── A: the affliction's kind on its damage (Q43) ────────────────────────
const aw = await quiet(() => imp("combat/affliction-workflow.mjs"));
const disease = { system: { afflictionType: "disease" } }, poison = { system: { afflictionType: "poison" } }, curse = { system: { afflictionType: "curse" } };
equal("A1 a disease's damage, whatever its type, carries the disease trait", [aw.stageDamageTraits(disease, "essence"), aw.stageDamageTraits(disease, "poison")], [["disease"], ["poison", "disease"]]);
equal("A2 a poison's carries poison, as it always has", [aw.stageDamageTraits(poison, "poison"), aw.stageDamageTraits(poison, "essence")], [["poison"], ["poison"]]);
equal("A3 a curse's is unchanged", [aw.stageDamageTraits(curse, "essence"), aw.stageDamageTraits(curse, "poison")], [[], ["poison"]]);
ok("A4 the stage damage passes them", /applyTypedDamage\(actor, \{ amount: roll\.total, type, traits: stageDamageTraits\(item, type\) \}\)/.test(src.affl));
const df = await imp("defences.mjs");
const field = df.resolveDamageTypeField(", poison, disease");
ok("A5 a resistance to disease is read as a trait resistance", [...(field.traits ?? [])].includes("disease") && [...field.damageTypes].includes("poison"));
const dmg = await imp("combat/damage.mjs");
const halved = dmg.resolveDamagePacket({ amount: 9, type: "essence", sourceTraits: ["disease"], resistanceTraits: new Set(["disease"]) });
equal("A6 and halves a disease's essence damage", [halved.taken, halved.resisted], [4, true]);
const whole = dmg.resolveDamagePacket({ amount: 9, type: "essence", sourceTraits: [], resistanceTraits: new Set(["disease"]) });
equal("A7 but not damage that is not from one", whole.taken, 9);

// ── T: the touch attack ─────────────────────────────────────────────────
equal("T1 a natural 1 never lands, however high", sr.touchAttackOutcome(40, 10, { natural: 1 }).landed, false);
equal("T2 a natural 20 always lands, however low", sr.touchAttackOutcome(3, 30, { natural: 20 }).landed, true);
equal("T3 otherwise the total against Defence", [sr.touchAttackOutcome(15, 15, { natural: 10 }).landed, sr.touchAttackOutcome(14, 15, { natural: 10 }).landed, sr.touchAttackOutcome(15, 15).landed], [true, false, true]);
equal("T4 the face is reported", [sr.touchAttackOutcome(1, 1, { natural: 1 }).natural, sr.touchAttackOutcome(1, 1, { natural: 20 }).natural, sr.touchAttackOutcome(1, 1, { natural: 7 }).natural], ["1", "20", ""]);
ok("T5 the unwilling touch passes its unmodified face", /touchAttackOutcome\(Number\(touch\?\.outcome\?\.total \?\? 0\), defence, \{ natural: Number\(touch\?\.dice\?\.unmodified \?\? 0\) \}\)/.test(src.cast));

// ── P: a cast's prelude ─────────────────────────────────────────────────
const cw = await quiet(() => imp("magic/cast-workflow.mjs"));
const hooks = await imp("magic/cast-hooks.mjs");
equal("P1 a prelude is asked for a plain cast only",
  [{}, { strikeCheck: {} }, { itemCheck: {} }, { stored: {} }, { ritual: {} }, { reaction: {} }, { presetTargets: true }, { apPaid: true }, { carried: {} }, null].map((o) => cw.castPreludeOwed(o)),
  [true, false, false, false, false, false, false, false, false, true]);
api.resetModuleRegistry?.();
ok("P2 a prelude needs a function", (await quiet(async () => api.registerCastPrelude("x", 3))) === false);
api.registerCastPrelude("declines", () => null, "test");
api.registerCastPrelude("throws", () => { throw new Error("boom"); }, "test");
equal("P3 none takes it: the cast goes on", await quiet(() => hooks.castPreludeFrom({ actor: null, spell: { name: "Fireball" }, options: {} })), null);
api.registerCastPrelude("thunder", (ctx) => (ctx.spell?.name === "Thunderous Strike" ? { handled: true, result: "struck" } : null), "test");
equal("P4 the first that takes it answers", await quiet(() => hooks.castPreludeFrom({ actor: null, spell: { name: "Thunderous Strike" }, options: {} })), { handled: true, result: "struck" });
equal("P5 a half answer is not taken", await quiet(async () => { api.resetModuleRegistry?.(); api.registerCastPrelude("half", () => ({ handled: "yes" }), "test"); return hooks.castPreludeFrom({ spell: {}, options: {} }); }), null);
api.resetModuleRegistry?.();
ok("P6 castSpell asks before its scope, once for a spell at a time, and a taken cast returns its result",
  /if \(castPreludeOwed\(options\) && !PRELUDES_RUNNING\.has\(preludeKey\)\) \{[\s\S]{0,120}PRELUDES_RUNNING\.add\(preludeKey\);[\s\S]{0,80}taken = await castPreludeFrom\(\{ actor, spell, options: \{ \.\.\.\(options \?\? \{\}\) \} \}\);\s*\} finally \{\s*PRELUDES_RUNNING\.delete\(preludeKey\);\s*\}\s*if \(taken\?\.handled\) return taken\.result \?\? null;\s*\}\s*const \{ beginCastScope, endCastScope \}/.test(src.cast));
ok("P7 the API exposes the registration", /registerCastPrelude: \(key, prelude, moduleId\) => registerCastPrelude\(key, prelude, moduleId\)/.test(src.apiw));

// ── H: the spell attack's hits ──────────────────────────────────────────
const a = { name: "A" }, b = { name: "B" };
equal("H1 a miss has none", cw.spellHitsOf(null), []);
equal("H2 one hit", cw.spellHitsOf({ targetActor: a, critical: { severity: "minor" } }), [{ target: a, critical: true }]);
equal("H3 a volley's rays that hit", cw.spellHitsOf({ targetActor: a, rays: [{ targetActor: a, critical: null }, { targetActor: b, critical: null }] }), [{ target: a, critical: false }, { target: b, critical: false }]);
// RE-PINNED AT 3.684.0: G1's settle (`settleModuleMetamagic`) is handed
// `spellHits` too, so the bare pattern passed with the HOOK's removed
// (mutate-ea-block4-core, SURVIVED — the hook was intact). Pinned inside the
// trgPrimeSpellSettled payload.
ok("H4 the settled hook carries them", (() => {
  const at = src.cast.indexOf('Hooks.callAll("trgPrimeSpellSettled", {');
  return at > 0 && /\n    spellHits: spellHitsOf\(spellAttack\),\n/.test(src.cast.slice(at, src.cast.indexOf("\n  });", at)));
})());

// ── G: a grant to maximum HP (Natural Resilience) ──────────────────────
const fw = await quiet(() => imp("feats-workflow.mjs"));
api.resetModuleRegistry?.();
api.registerPPGrant("Natural Resilience", { perLevel: 1, label: "Natural Resilience (+1 HP per level)", types: ["ability"], stat: "hp" }, "test");
api.registerPPGrant("Wild Power", { perLevel: 1, label: "Wild Power", types: ["ability"] }, "test");
const grows = fw.modulePPGrants().filter((r) => ["natural resilience", "wild power"].includes(r.name));
const nr = grows.find((r) => r.name === "natural resilience"), wp = grows.find((r) => r.name === "wild power");
equal("G1 a grant may owe maximum HP", [nr?.path, nr?.statLabel, /^moduleHPGrant_/.test(nr?.flag ?? ""), nr?.due({ system: { identity: { level: 7 } } })], ["system.resources.hp.other", "Max HP (misc)", true, 7]);
equal("G2 and a PP grant is as it was", [wp?.path, /^modulePPGrant_/.test(wp?.flag ?? "")], ["system.resources.pp.base", true]);
api.resetModuleRegistry?.();

// ── Z ───────────────────────────────────────────────────────────────────
const [maj, min] = String(sys.version).split(".").map(Number);
ok("Z1 the version is 3.682.0 or later", maj > 3 || (maj === 3 && min >= 682), sys.version);

if (failures.length) {
  process.stdout.write(`verify-ea-block4-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block4-core: OK — ${checks} checks.\n`);
