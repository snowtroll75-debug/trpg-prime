#!/usr/bin/env node
/**
 * verify-ea-block1-core — TRG Prime 3.675.0: the seams Eldritch Arts' Block 1
 * (Chapter 2's races and heritages, the background feats, Chapter 4's simple
 * actions, Chapter 6's weapons) needs, from its audit's C1 to C8
 * (docs/ELDRITCH_ARTS_BLOCK1_AUDIT.md in the module).
 *
 *   C1  a flat bonus on the caster's own spell damage (Elemental Surge)
 *   C2  Spell Resilience under another name (Null Aura), and lowered by the
 *       caster (Spell Penetration)
 *   C3  a module's surcharge on a casting (Zhal-vryn)
 *   C4  a fumble reroll scoped to skills (Esoteric Insight)
 *   C5  a feat's own time ladder for a module action (Focused Ley Sense)
 *   C6  a module's way to read a scroll (Lingual Casting)
 *   C7  the racial-weapon clause reads the heritage (the Clamhscrios)
 *   C8  a weapon trait that changes the category for a class type (Adept)
 *   C9  a spell attack's secondary packet, and its caster-level step (Orb of
 *       Water; found while building)
 *   C10 a gate row on the casting DC only, left out of an attack spell's
 *       attack (Null Aura; found in review)
 *   C11 Invest Item's rules for another way to invest (Quickbind; found in
 *       review)
 *   C12 a reroll that answers a Failure (Esoteric Insight, book v1.6; 3.677.0)
 *   C13 a racial weapon one category easier for its race (Graham's m64; 3.677.0)
 *   C14 a declared Will save before a beneficial spell (Null Aura, Graham's
 *       C1; 3.677.0)
 *   C15 a beneficial emanation remembers who refused it, and asks a
 *       latecomer once (found live on 3.677.0; Graham, 1 November 2026;
 *       3.677.1)
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
const sdb = await imp("magic/spell-damage-bonus.mjs");
const car = await imp("creature-ability-rules.mjs");
const surch = await imp("magic/cast-surcharge.mjs");
const fr = await imp("fumble-reroll.mjs");
const gso = await imp("general-skill-options.mjs");
const prof = await imp("proficiency-rules.mjs");
const clm = await imp("magic/caster-level-mods.mjs");
const sec = await imp("magic/secondary-damage.mjs");

const cast = read("module", "magic", "cast-workflow.mjs");
const apiw = read("module", "module-api-workflow.mjs");
const ciw = read("module", "charged-items-workflow.mjs");
const cuw = read("module", "consumable-use-workflow.mjs");
const frw = read("module", "fumble-reroll-workflow.mjs");
const check = read("module", "dice", "check.mjs");
const aw = read("module", "combat", "action-workflow.mjs");
const sys = JSON.parse(read("system.json"));

const eff = (flags, extra = {}) => ({ name: "e", disabled: false, flags: { "trg-prime": flags }, ...extra });

/* C1 — a flat bonus on spell damage */
{
  const attributes = { charisma: { total: 3 }, wisdom: { total: 1 } };
  const surge = eff({ spellDamageBonus: { label: "Elemental Surge", valueFrom: "charisma", type: "race" } });
  equal("C1 Elemental Surge adds the Charisma total, racial",
    sdb.declaredSpellDamageBonuses([surge], { traits: "fire", attributes }), [{ label: "Elemental Surge", value: 3, type: "race" }]);
  equal("C1 a disabled effect adds nothing",
    sdb.declaredSpellDamageBonuses([{ ...surge, disabled: true }], { attributes }), []);
  equal("C1 a traits-scoped bonus needs one of its traits",
    [sdb.declaredSpellDamageBonuses([eff({ spellDamageBonus: { label: "Fire", value: 2, traits: ["fire"] } })], { traits: "cold, invocation" }).length,
      sdb.declaredSpellDamageBonuses([eff({ spellDamageBonus: { label: "Fire", value: 2, traits: ["fire"] } })], { traits: "fire, invocation" }).length], [0, 1]);
  equal("C1 two status bonuses keep the best; two racial bonuses stack",
    [sdb.declaredSpellDamageBonuses([eff({ spellDamageBonus: { label: "A", value: 2, type: "status" } }), eff({ spellDamageBonus: { label: "B", value: 3, type: "status" } })]).map((r) => r.value),
      sdb.declaredSpellDamageBonuses([eff({ spellDamageBonus: { label: "A", value: 2, type: "race" } }), eff({ spellDamageBonus: { label: "B", value: 3, type: "race" } })]).map((r) => r.value).sort()],
    [[3], [2, 3]]);
  equal("C1 an unknown type is untyped", sdb.declaredSpellDamageBonuses([eff({ spellDamageBonus: { label: "X", value: 1, type: "nonsense" } })])[0]?.type, "untyped");
  equal("C1 the formula gains the total, said once",
    sdb.withSpellDamageBonus("2d6", [{ label: "Elemental Surge", value: 3, type: "race" }]), { formula: "2d6 + 3", total: 3, text: "Elemental Surge +3 racial" });
  equal("C1 a negative total subtracts", sdb.withSpellDamageBonus("1d8", [{ label: "P", value: -2, type: "untyped" }]).formula, "1d8 - 2");
  equal("C1 nothing to add leaves the formula alone", sdb.withSpellDamageBonus("1d8", []), { formula: "1d8", total: 0, text: "" });
  equal("C1 no damage, no bonus", sdb.withSpellDamageBonus("", [{ label: "P", value: 3 }]).formula, "");
  ok("C1 the attack path adds it to the spell's damage formula",
    /const surged = withSpellDamageBonus\(abilityFormula, declaredSpellDamageBonuses\(/.test(cast) && /const damageFormula = surged\.formula;/.test(cast));
  ok("C1 the save path adds it to the primary pool, once",
    /const surged = withSpellDamageBonus\(damageFormula, declaredSpellDamageBonuses\(/.test(cast) && /damageFormula = surged\.formula;\n\s+lines\.push/.test(cast));
}

/* C2 — Spell Resilience under another name, lowered by the caster */
{
  const ability = (name, derives) => ({ type: "ability", name, flags: { "trg-prime": { creatureAbility: { derives } } } });
  const defender = (items) => ({ items, system: { identity: { classBonus: 3 } } });
  equal("C2 the old shape still reads as Spell Resilience, racial",
    car.spellResilienceModifiers(defender([ability("Spell Resilience", { spellResilience: true })])), [{ label: "Spell Resilience", value: 3, type: "race" }]);
  equal("C2 Null Aura reads under its own name and type",
    car.spellResilienceModifiers(defender([ability("Null Aura", { spellResilience: { label: "Null Aura", type: "untyped" } })])), [{ label: "Null Aura", value: 3, type: "untyped" }]);
  equal("C2 one row per name: two abilities of one name count once",
    car.spellResilienceModifiers(defender([ability("Spell Resilience", { spellResilience: true }), ability("Spell Resilience", { spellResilience: true })])).length, 1);
  const penetrating = { items: [{ type: "feat", name: "Spell Penetration", flags: { "trg-prime": { spellResilienceReduction: { value: 2, labels: ["Spell Resilience"] } } } }], effects: [] };
  equal("C2 Spell Penetration lowers Spell Resilience by 2 against its owner's spells",
    car.spellResilienceModifiers(defender([ability("Spell Resilience", { spellResilience: true })]), penetrating), [{ label: "Spell Resilience", value: 1, type: "race", reducedBy: 2 }]);
  equal("C2 …but not Null Aura, which it does not name",
    car.spellResilienceModifiers(defender([ability("Null Aura", { spellResilience: { label: "Null Aura" } })]), penetrating)[0]?.value, 3);
  equal("C2 never below 0: a row lowered to nothing is dropped",
    car.spellResilienceModifiers({ items: [ability("Spell Resilience", { spellResilience: true })], system: { identity: { classBonus: 2 } } }, penetrating), []);
  equal("C2 a reduction on an applied effect counts too",
    car.spellResilienceReductions({ items: [], appliedEffects: [eff({ spellResilienceReduction: { value: 2 } })] }).map((r) => [r.value, r.labels]), [[2, ["spell resilience"]]]);
  equal("C2 nothing for a defender without a class bonus", car.spellResilienceModifiers({ items: [ability("Null Aura", { spellResilience: { label: "Null Aura" } })], system: { identity: { classBonus: 0 } } }), []);
  ok("C2 the save path hands in the caster", /\.\.\.spellResilienceModifiers\(target, actor\)/.test(cast));
  ok("C2 the attack path hands in the caster and names the rows", /const resilienceRows = spellResilienceModifiers\(targetActor, actor\);/.test(cast) && /resilienceRows\.map\(\(r\) => r\.label\)/.test(cast));
}

/* C3 — a casting's surcharge */
{
  api.resetModuleRegistry();
  equal("C3 a surcharge needs a key and a function", [api.registerCastSurcharge("", () => 0), api.registerCastSurcharge("x", null)], [false, false]);
  ok("C3 a surcharge registers", api.registerCastSurcharge("zhalvryn", () => ({ pp: 1, label: "Zhal-vryn" }), "test") === true);
  equal("C3 one registered", api.registeredCastSurcharges().length, 1);
  equal("C3 an answer is cleaned: a whole number ≥ 0",
    [surch.normaliseSurcharge({ pp: 1.7, label: " Z " }), surch.normaliseSurcharge({ pp: -3 }), surch.normaliseSurcharge(null)],
    [{ pp: 1, label: "Z", lines: [] }, { pp: 0, label: "", lines: [] }, { pp: 0, label: "", lines: [] }]);
  equal("C3 answers add up and say so",
    surch.totalSurcharge([{ pp: 1, label: "Zhal-vryn" }, { pp: 1, label: "Zhal-vryn" }, { pp: 0, lines: ["note"] }]), { pp: 2, labels: ["Zhal-vryn +1 PP", "Zhal-vryn +1 PP"], lines: ["note"] });
  api.registerCastSurcharge("broken", () => { throw new Error("boom"); }, "test");
  const origError = console.error; console.error = () => {};
  const asked = await surch.runCastSurcharges({});
  console.error = origError;
  equal("C3 a failing surcharge costs its own answer, not the casting", [asked.pp, asked.lines.length], [1, 1]);
  api.resetModuleRegistry();
  ok("C3 the API offers registerCastSurcharge", /registerCastSurcharge: \(key, surcharge, moduleId\) => registerCastSurcharge\(key, surcharge, moduleId\)/.test(apiw));
  ok("C3 an item's spell is not asked", /const surcharge = isItemCast\n\s+\? \{ pp: 0, labels: \[\], lines: \[\] \}\n\s+: await runCastSurcharges\(/.test(cast));
  ok("C3 the casting is refused when the pool cannot pay both", /if \(\(ritualSubstitutes \? 0 : totalPP\) \+ surcharge\.pp > ppPool \+ rodDraw\) \{/.test(cast));
  ok("C3 the surcharge is paid after the casting's own PP, whatever the degree",
    /if \(surcharge\.pp > 0\) \{\n\s+const poolAfterCast = Number\(actor\.system\?\.resources\?\.pp\?\.value \?\? 0\);\n\s+await actor\.update\(\{ "system\.resources\.pp\.value": Math\.max\(0, poolAfterCast - surcharge\.pp\) \}\);/.test(cast));
  ok("C3 the card says the surcharge", /<strong>Surcharge:<\/strong>/.test(cast));
  ok("C3 the surcharge is not added to totalPP (no DC, no cap)", !/totalPP \+= surcharge|totalPP = totalPP \+ surcharge/.test(cast));
}

/* C4 — a fumble reroll scoped to skills */
{
  const esoteric = { type: "feat", name: "Esoteric Insight", system: {}, flags: { "trg-prime": { fumbleReroll: { checkTypes: ["skill"], reaction: false, label: "Esoteric Insight", subjects: ["arcana", "occultism"] } } } };
  const fortune = { type: "feat", name: "Fortune's Reversal", system: {}, flags: { "trg-prime": { fumbleReroll: { checkTypes: ["skill", "save"], label: "Fortune's Reversal" } } } };
  equal("C4 Esoteric Insight answers an Arcana fumble, not a Stealth one",
    [fr.fumbleRerollRows([esoteric], "skill", "arcana").length, fr.fumbleRerollRows([esoteric], "skill", "stealth").length], [1, 0]);
  equal("C4 …and is not a reaction", fr.fumbleRerollRows([esoteric], "skill", "occultism")[0]?.reaction, false);
  equal("C4 a reroll naming no subjects answers every skill, as before",
    fr.fumbleRerollRows([fortune], "skill", "stealth").length, 1);
  ok("C4 the workflow scopes by subject", /export function fumbleRerollAvailable\(actor, kind, subject = "", degree = "fumble"\)/.test(frw) && /fumbleRerollRows\(Array\.from\(actor\.items \?\? \[\]\), kind, subject, degree\)/.test(frw));
  ok("C4 the check hands in its subject", /offerFumbleReroll\(check\.actor, check\.type, \{ degree: firstDegree, subject: check\.subject \}\)/.test(check));
}

/* C5 — a feat's own time ladder */
{
  const options = [{ key: "ten", label: "10 minutes", modifier: 0, apCost: "10 minutes" }, { key: "ap", label: "1 AP", modifier: -10, apCost: "1" }];
  const focused = [{ key: "ten", label: "10 minutes", modifier: 2, apCost: "10 minutes" }, { key: "ap", label: "1 AP", modifier: -5, apCost: "1" }, { key: "free", label: "0 AP", modifier: -10, apCost: "0" }];
  const action = { key: "leySense", name: "Ley Sense", timeLadder: { options, defaultKey: "ten" }, timeLadderByFeat: { "Focused Ley Sense": { options: focused, defaultKey: "ten" } } };
  equal("C5 without the feat, no variant", gso.featTimeLadder(action, ["Something Else"]), null);
  equal("C5 with the feat, its rungs", gso.featTimeLadder(action, ["Focused Ley Sense"])?.options.map((o) => [o.key, o.modifier]), [["ten", 2], ["ap", -5], ["free", -10]]);
  equal("C5 the name is matched whatever its case", gso.featTimeLadder(action, ["focused ley sense"])?.options.length, 3);
  equal("C5 a malformed variant falls back (null), not to no ladder",
    gso.featTimeLadder({ ...action, timeLadderByFeat: { "Focused Ley Sense": { options: [{ key: "x" }] } } }, ["Focused Ley Sense"]), null);
  ok("C5 the action workflow asks for the feat's ladder first",
    /featTimeLadder\(action, actorFeatNames\) \?\? timeLadder\(action\.key, action\)/.test(aw));
}

/* C6 — a module's way to read a scroll */
{
  api.resetModuleRegistry();
  equal("C6 a path needs a key and a function", [api.registerReleasePath("", () => null), api.registerReleasePath("x", 3)], [false, false]);
  ok("C6 a path registers", api.registerReleasePath("lingualCasting", (ctx) => ({
    key: "linguistics", label: "Lingual Casting", skill: "linguistics", difficulty: "veryHard", dcAdjustment: 5,
    available: (ctx.skillRanks?.linguistics ?? 0) >= ctx.spellPPCost + 2, reason: "Linguistics ranks"
  }), "test") === true);
  const { moduleReleaseOptions } = await imp("charged-items-workflow.mjs").catch(() => ({}));
  if (typeof moduleReleaseOptions === "function") {
    const opts = await moduleReleaseOptions("scroll", { spellPPCost: 2, skillRanks: { linguistics: 4 } });
    equal("C6 a scroll is offered the module's path", opts.map((o) => [o.key, o.skill, o.difficulty, o.available]), [["linguistics", "linguistics", "veryHard", true]]);
    equal("C6 …a wand is not", (await moduleReleaseOptions("", { spellPPCost: 2 })).length, 0);
    api.registerReleasePath("odd", () => ({ key: "o", label: "Odd", difficulty: "whatever" }), "test");
    equal("C6 an unknown difficulty is medium", (await moduleReleaseOptions("scroll", { spellPPCost: 0 })).find((o) => o.key === "o")?.difficulty, "medium");
  } else {
    // The workflow imports Foundry-side modules; read it as source instead.
    ok("C6 the workflow builds module options for scrolls", /export async function moduleReleaseOptions\(kind, ctx = \{\}\) \{\n\s+if \(String\(kind \?\? ""\) !== "scroll"\) return \[\];/.test(ciw));
    ok("C6 an unknown difficulty is medium", /RELEASE_DIFFICULTIES\.includes\(String\(option\.difficulty \?\? ""\)\.trim\(\)\) \? String\(option\.difficulty\)\.trim\(\) : "medium"/.test(ciw));
  }
  api.resetModuleRegistry();
  ok("C6 the release ladder adds the module's options", /\.\.\.\(await moduleReleaseOptions\(kind, \{ spellPPCost: cost, spellTradition, spellName, \.\.\.context \}\)\)/.test(ciw));
  ok("C6 reading a scroll says it is one", /kind: "scroll",/.test(cuw));
  ok("C6 the API offers registerReleasePath", /registerReleasePath: \(key, path, moduleId\) => registerReleasePath\(key, path, moduleId\)/.test(apiw));
}

/* C7, C8 — racial weapons by heritage; a trait's category for a class type */
{
  const clamh = { system: { category: "Exotic", traits: "Deadly, Versatile P, Wyrmdral" } };
  equal("C7 a Wyrmdral's Clamhscrios is martial; a plain Scaelyn's is exotic",
    [prof.effectiveWeaponCategory({ race: "Scaelyn", heritage: "Wyrmdral" }, clamh), prof.effectiveWeaponCategory({ race: "Scaelyn", heritage: "Sparktail" }, clamh)], ["Martial", "Exotic"]);
  equal("C7 the race still works alone", prof.effectiveWeaponCategory({ race: "Emberkin", heritage: "" }, { system: { category: "Exotic", traits: "Adept, Reach, Emberkin" } }), "Martial");
  api.resetModuleRegistry();
  equal("C8 a rule needs Simple or Martial and a class type",
    [api.registerWeaponTraitRule("Adept", { categoryAs: "Exotic", classTypes: ["Adept"] }), api.registerWeaponTraitRule("Adept", { categoryAs: "Simple", classTypes: [] })], [false, false]);
  ok("C8 Adept registers", api.registerWeaponTraitRule("Adept", { categoryAs: "Simple", classTypes: ["Adept"] }, "test") === true);
  const bachall = { system: { category: "Exotic", traits: "Adept, Ritualist, Hand & a Half, Trip, Parry" } };
  equal("C8 an Adept's Bachall Fáistine is simple; a Fighter's is exotic",
    [prof.effectiveWeaponCategory({ race: "Elf", classTypes: new Set(["adept"]) }, bachall), prof.effectiveWeaponCategory({ race: "Elf", classTypes: new Set(["martial"]) }, bachall)], ["Simple", "Exotic"]);
  equal("C8 an Adept Emberkin's Brikail Naomhtha is simple, the better of martial (race) and simple (trait)",
    prof.effectiveWeaponCategory({ race: "Emberkin", classTypes: new Set(["adept"]) }, { system: { category: "Exotic", traits: "Adept, Two-Handed, Reach, Trip, Parry, Ritualist, Emberkin" } }), "Simple");
  equal("C8 a rule never makes a weapon harder", prof.effectiveWeaponCategory({ classTypes: new Set(["adept"]) }, { system: { category: "Simple", traits: "Adept" } }), "Simple");
  const profile = prof.proficiencyProfile({ items: [{ type: "class", name: "Bard", system: { classType: "Adept/Expert" } }, { type: "race", name: "Scaelyn" }, { type: "heritage", name: "Wyrmdral" }], system: {} });
  equal("C8 the profile reads every class type and the heritage", [[...profile.classTypes].sort(), profile.heritage], [["adept", "expert"], "Wyrmdral"]);
  api.resetModuleRegistry();
  ok("C8 the API offers registerWeaponTraitRule", /registerWeaponTraitRule: \(trait, spec, moduleId\) => registerWeaponTraitRule\(trait, spec, moduleId\)/.test(apiw));
}

/* C9 — a spell attack's secondary packet */
{
  const orbMods = [{ threshold: 4, recurring: true, damageDice: "1d6", secondary: 1, text: "The damage increases by 1d6 & the secondary by 1." }];
  equal("C9 the caster-level step adds the secondary per step",
    [clm.applyCasterLevelMods(orbMods, 3).secondary, clm.applyCasterLevelMods(orbMods, 4).secondary, clm.applyCasterLevelMods(orbMods, 12).secondary], [0, 1, 3]);
  equal("C9 …and is described", clm.describeCasterLevelMods(clm.applyCasterLevelMods(orbMods, 8)), "+2d6 damage, +2 secondary");
  equal("C9 a flat 1 is a valid secondary pool", sec.normaliseSecondaryDamage({ secondaryDamage: { formula: "1", type: "cold" } })?.formula, "1");
  ok("C9 the attack path rolls the secondary on a hit, against its own type",
    // RE-ANCHORED AT 3.684.0 (G15): a warp that changes the type is laid over the pool.
    /const second = warpedDamageRow\(normaliseSecondaryDamage\(spellData\), warpMods\);\n\s+if \(second && secondaryReaches\(second, creatureTypesOf\(targetActor\.system \?\? \{\}\)\)\) \{/.test(cast)
    && /const flat = Math\.max\(0, Math\.floor\(Number\(clMods\?\.secondary \?\? 0\)\)\);/.test(cast)
    && /type: second\.type,/.test(cast));
}

/* C10 — a gate row on the casting DC only (found in review: Null Aura) */
{
  const gates = await imp("magic/spell-check-gates.mjs");
  const n = gates.normaliseGateAnswer({ modifiers: [{ label: "Null Aura (X)", value: -3, type: "untyped", castingOnly: true }, { label: "Plain", value: -1 }] });
  equal("C10 the gate reader keeps castingOnly, and only where it is said", n.modifiers.map((r) => [r.label, r.castingOnly ?? false]), [["Null Aura (X)", true], ["Plain", false]]);
  // RE-ANCHORED AT 3.682.0: a Strike's roll as the casting check (Thunderous
  // Strike) carries the casting's gate rows, as a learned casting's check does.
  // That one site aside, the rule stands.
  ok("C10 an innate or item attack never takes a casting-DC row", (cast.match(/\.\.\.gateAttackRows/g) ?? []).length === 2
    && !/\.\.\.gated\.modifiers(\]|\s*\n\s*\])/.test(cast.replace("presetModifiers: [...Array.from(strikeCheck.modifiers ?? []), ...gated.modifiers],", "")));
  ok("C10 …a learned casting's check does, and carries its total", /const castingOnlyTotal = gated\.modifiers\.filter\(\(m\) => m\.castingOnly\)\.reduce\(\(sum, m\) => sum \+ m\.value, 0\);/.test(cast)
    && /if \(check && castingOnlyTotal && !isItemCast && !isInnate\) check\.castingOnlyTotal = castingOnlyTotal;/.test(cast));
  ok("C10 …and the attack against DB leaves it out", /checkTotal: Number\((?:check|c)\.outcome\?\.total \?\? 0\) - Number\((?:check|c)\.castingOnlyTotal \?\? 0\),/.test(cast));
  const ac = await imp("magic/casting-dc.mjs");
  equal("C10 a casting-only −3 rolled into a 20: the attack is 23, as if it were not there", ac.assembledSpellAttackTotal({ checkTotal: 20 - (-3) }).total, 23);
}

/* C11 — Invest Item's rules for another way to invest (found in review: Quickbind) */
{
  globalThis.game ??= {};
  const miw = await imp("magic-items-workflow.mjs");
  const actor = (items, slots = 3) => ({ name: "A", items, system: { magic: { investmentSlots: slots } } });
  const staff = (id, invested = false) => ({ id, name: `Staff ${id}`, system: { invested, traits: "Staff, Invested" } });
  const ring = (id, invested = false) => ({ id, name: `Ring ${id}`, system: { invested, traits: "Invested" } });
  const s2 = staff("s2");
  equal("C11 the refusal: a second Staff, a full set of slots, an item already invested; none for a free slot", [
    Boolean(await miw.investRefusal(actor([staff("s1", true), s2]), s2)),
    Boolean(await miw.investRefusal(actor([ring("a", true), ring("b", true), ring("c")], 2), ring("c"))),
    Boolean(await miw.investRefusal(actor([ring("a", true)]), ring("a", true))),
    await miw.investRefusal(actor([ring("a", true), ring("b")]), ring("b"))
  ], [true, true, true, ""]);
  ok("C11 the helpers offer it", /investRefusal: async \(actor, item\) => \(await import\("\.\/magic-items-workflow\.mjs"\)\)\.investRefusal\(actor, item\),/.test(read("module", "module-api-workflow.mjs")));
}

/* C12 — a reroll that answers a Failure (Esoteric Insight, book v1.6) */
{
  const esoteric = { type: "feat", name: "Esoteric Insight", flags: { "trg-prime": { fumbleReroll: { checkTypes: ["skill"], reaction: false, subjects: ["arcana", "occultism"], degrees: ["failure", "fumble", "blunder"], label: "Esoteric Insight" } } } };
  const fortune = { type: "feat", name: "Fortune's Reversal", flags: { "trg-prime": { fumbleReroll: { checkTypes: ["attack", "skill", "save"], reaction: true, label: "Fortune's Reversal" } } } };
  equal("C12 Esoteric Insight answers an Arcana Failure, Fumble and Blunder, not a Partial or a Success",
    ["success", "partial", "failure", "fumble", "blunder"].map((d) => fr.fumbleRerollRows([esoteric], "skill", "arcana", d).length), [0, 0, 1, 1, 1]);
  equal("C12 …only on its skills", fr.fumbleRerollRows([esoteric], "skill", "stealth", "failure").length, 0);
  equal("C12 a reroll naming no degrees answers a Fumble and a Blunder, never a Failure (as before)",
    ["failure", "fumble", "blunder"].map((d) => fr.fumbleRerollRows([fortune], "skill", "athletics", d).length), [0, 1, 1]);
  equal("C12 the default degree is a Fumble (the attack path passes none)", fr.fumbleRerollRows([fortune], "attack").length, 1);
  equal("C12 rerollAnswers says whether any item answers", [fr.rerollAnswers([esoteric], "skill", "arcana", "failure"), fr.rerollAnswers([fortune], "skill", "arcana", "failure")], [true, false]);
  equal("C12 the card names a failure as one", fr.fumbleWords("failure"), { verb: "failed", noun: "failure" });
  const ck = read("module", "dice", "check.mjs");
  ok("C12 the check offers a reroll on a Failure only when an item answers it",
    /\["partial", "failure"\]\.includes\(rerollDegree\) && check\.actor && \["skill", "save"\]\.includes\(check\.type\)\n\s*&& \(await import\("\.\.\/fumble-reroll\.mjs"\)\)\.rerollAnswers\(Array\.from\(check\.actor\.items \?\? \[\]\), check\.type, check\.subject, rerollDegree\)\);/.test(ck)
    && /&& rerollable\) \{/.test(ck));
  ok("C12 the offer is made for the degree rolled", /fumbleRerollRows\(Array\.from\(actor\.items \?\? \[\]\), kind, subject, degree\)/.test(read("module", "fumble-reroll-workflow.mjs"))
    && /const row = fumbleRerollAvailable\(actor, kind, subject, degree\);/.test(read("module", "fumble-reroll-workflow.mjs")));
}

/* C13 — a racial weapon one category easier for its race (Graham's m64) */
{
  const ofRace = (category, traits) => ({ system: { category, traits } });
  equal("C13 exotic → martial, martial → simple, simple stays, for the race (or heritage) its trait names",
    [prof.effectiveWeaponCategory({ race: "Dwarf" }, ofRace("Exotic", "Dwarf, Hand & a Half")), prof.effectiveWeaponCategory({ race: "Dwarf" }, ofRace("Martial", "Dwarf, Deadly")),
      prof.effectiveWeaponCategory({ race: "Dwarf" }, ofRace("Simple", "Dwarf")), prof.effectiveWeaponCategory({ race: "Scaelyn", heritage: "Wyrmdral" }, ofRace("Martial", "Wyrmdral"))],
    ["Martial", "Simple", "Simple", "Simple"]);
  equal("C13 …and for nobody else", prof.effectiveWeaponCategory({ race: "Elf" }, ofRace("Martial", "Dwarf, Deadly")), "Martial");
  const cleric = prof.proficiencyProfile({ items: [{ type: "class", name: "Cleric", system: { classType: "Adept" } }, { type: "race", name: "Dwarf" }], system: {} });
  const dwarfMartial = { type: "weapon", name: "Test Axe", system: { category: "Martial", traits: "Dwarf" } };
  const verdict = prof.proficiencyOf(cleric, dwarfMartial);
  const elfCleric = prof.proficiencyProfile({ items: [{ type: "class", name: "Cleric", system: { classType: "Adept" } }, { type: "race", name: "Elf" }], system: {} });
  ok("C13 a dwarf with only simple proficiency is proficient with a dwarven martial weapon, and is told why",
    verdict.proficient === true && /simple weapon proficiency \(a Dwarf weapon, simple for a Dwarf\)/.test(verdict.why), JSON.stringify(verdict));
  equal("C13 …an elf cleric is not", prof.proficiencyOf(elfCleric, dwarfMartial).proficient, false);
}

/* C14 — Null Aura's Will save before a beneficial spell takes hold (Graham's C1) */
{
  const bs = await imp("magic/beneficial-save.mjs");
  const nyrinn = { uuid: "Actor.n", items: [{ type: "ability", name: "Null Aura", system: {}, flags: { "trg-prime": { beneficialSpellSave: { label: "Null Aura", otherCastersOnly: true } } } }] };
  const other = { uuid: "Actor.c", items: [] };
  const heal = { tradition: "divinity", effects: [{ kind: "heal" }] };
  const harm = { tradition: "arcane", defence: "Will", effects: [{ kind: "condition" }] };
  equal("C14 a Nyrinn rolls before another caster's beneficial spell, named for its ability",
    [bs.beneficialSaveRequired(nyrinn, heal, other).required, bs.beneficialSaveRequired(nyrinn, heal, other).source, bs.beneficialSaveRequired(nyrinn, heal, other).kind], [true, "Null Aura", "declared"]);
  equal("C14 …not before its own (\"by other casters\")", bs.beneficialSaveRequired(nyrinn, heal, nyrinn).required, false);
  equal("C14 …nor before a harmful spell (its own save stands)", bs.beneficialSaveRequired(nyrinn, harm, other).required, false);
  equal("C14 …and nobody without the ability rolls", bs.beneficialSaveRequired(other, heal, nyrinn).required, false);
  equal("C14 a switched-off ability declares nothing", bs.declaredBeneficialSaves({ items: [{ ...nyrinn.items[0], system: { active: false } }] }).length, 0);
  ok("C14 the cast passes the caster to the rule", /const need = beneficialSaveRequired\(target, spellData, caster\);/.test(read("module", "magic", "beneficial-save.mjs")));
}

/* C15 — a beneficial emanation keeps the save's answer (found live on 3.677.0) */
{
  const bs = await imp("magic/beneficial-save.mjs");
  const nyrinn = { uuid: "Actor.n", items: [{ type: "ability", name: "Null Aura", system: {}, flags: { "trg-prime": { beneficialSpellSave: { label: "Null Aura", otherCastersOnly: true } } } }] };
  const ascendan = { uuid: "Actor.a", items: [{ type: "ability", name: "Forbidden Magic", system: {}, flags: { "trg-prime": { beneficialTraditionSave: "divinity, verdant" } } }] };
  const other = { uuid: "Actor.c", items: [] };
  const ward = { tradition: "arcane", areaTargeting: "allies", traits: "Abjuration", effects: [{ kind: "bonus", target: "targets", slot: "defence", value: 1 }, { kind: "note", text: "Sustain…" }] };
  const bless = { tradition: "divinity", areaTargeting: "allies", effects: [{ kind: "bonus", target: "targets", value: 1 }] };
  const bane = { tradition: "divinity", defence: "Will", areaTargeting: "enemies", effects: [{ kind: "penalty", value: 1 }] };
  const snap = bs.benefitSpellSnapshot(ward);
  equal("C15 a harmful circle carries no benefit record; a helping one does", [bs.benefitSpellSnapshot(bane), Boolean(snap)], [null, true]);
  equal("C15 the record is still beneficial, and still asks the Nyrinn (another's) and the Ascendan (forbidden tradition)",
    [bs.isBeneficialSpell(snap), bs.beneficialSaveRequired(nyrinn, snap, other).required, bs.beneficialSaveRequired(nyrinn, snap, nyrinn).required,
      bs.beneficialSaveRequired(ascendan, bs.benefitSpellSnapshot(bless), other).required, bs.beneficialSaveRequired(ascendan, snap, other).required, bs.beneficialSaveRequired(other, snap, nyrinn).required],
    [true, true, false, true, false, false]);
  const outcomes = new Map([[nyrinn, false], [ascendan, true], [{ uuid: "off-canvas" }, false]]);
  const ids = new Map([[nyrinn, "tN"], [ascendan, "tA"]]);
  const rec = bs.benefitRecord(ward, 17, outcomes, (t) => ids.get(t) ?? null);
  equal("C15 the cast's answers are kept by token, with the DC", [rec.accepted, rec.saveDC], [{ tN: false, tA: true }, 17]);
  equal("C15 …and a harmful spell records nothing", bs.benefitRecord(bane, 17, outcomes, (t) => ids.get(t) ?? null), null);
  equal("C15 the creature that refused is left out of the circle; everyone else stays",
    bs.benefitMembers(["tN", "tA", "tX"], rec.accepted), ["tA", "tX"]);
  equal("C15 only the creatures not yet asked are asked", bs.benefitUnasked(["tN", "tA", "tX"], rec.accepted), ["tX"]);
  const bsSrc = read("module", "magic", "beneficial-save.mjs");
  ok("C15 the save reports what each target rolled", /if \(outcomes instanceof Map\) outcomes\.set\(target, passed\);/.test(bsSrc));
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("C15 the cast collects the answers and records them on the emanation",
    /saveDC: nominalSaveDC,\n\s*lines,\n\s*outcomes: benefitOutcomes\n\s*\}\);/.test(cw)
    && /benefit: benefitRecord\(spellData, nominalSaveDC, benefitOutcomes,/.test(cw));
  const ew = read("module", "magic", "emanation-workflow.mjs");
  ok("C15 the sweep asks a latecomer who owes the save, once, and remembers it",
    /for \(const id of benefitUnasked\(caught, accepted\)\) \{\n\s*const t = byId\.get\(id\);\n\s*if \(!t\?\.actor \|\| !beneficialSaveRequired\(t\.actor, benefit\.spell, actor\)\.required\) continue;/.test(ew)
    && /accepted\[id\] = outcomes\.get\(t\.actor\) === true;/.test(ew)
    && /await recordEmanation\(actor, entry\.id, \{ \.\.\.emanation, benefit: \{ \.\.\.benefit, accepted \} \}, \{ reconcile: false \}\);/.test(ew));
  ok("C15 …and the circle's membership leaves out whoever refused", /inside = benefitMembers\(caught, accepted\);/.test(ew)
    && /const \{ add, remove \} = emanationDelta\(holdersOf\(entry\.id\), inside\);/.test(ew));
  ok("C15 a re-record keeps the answers", /entry\.emanation = \{ tested: entry\.emanation\?\.tested \?\? \{\}, benefit: entry\.emanation\?\.benefit \?\? null, \.\.\.descriptor \};/.test(ew));
}

/* Z — the release */
// 3.675.0 OR LATER (3.675.1): an exact pin failed the first patch on top
// of this release for no fault of its own. The mutation still lowers the
// version to 3.674.2, which this refuses.
{
  const [za, zb, zc] = String(sys.version).split(".").map(Number);
  ok("Z the system is 3.675.0 or later", za > 3 || (za === 3 && (zb > 675 || (zb === 675 && zc >= 0))));
}

if (failures.length) {
  console.log(`verify-ea-block1-core: ${checks} checks — ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log(`verify-ea-block1-core: ${checks} checks — all green.`);
}
