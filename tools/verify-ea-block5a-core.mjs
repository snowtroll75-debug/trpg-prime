#!/usr/bin/env node
/**
 * verify-ea-block5a-core — TRG Prime 3.683.0: group a of the seams Eldritch
 * Arts' Block 5 (racial and general feats) needs, from the Block 5 audit
 * (docs/ELDRITCH_ARTS_BLOCK5_AUDIT.md in the module), answered by Graham on
 * 3 November 2026 ("As proposed except" Q58 and Q59).
 *
 *   P   C1: "<Name> Heritage" and "Level N only" prerequisite clauses, gated
 *       in the core picker (Q57)
 *   R   C2: a check reaction's before() may answer modifiers and a declared
 *       Success; its ctx says what forced the check
 *   D   C3: a defence offer for spells only (Glyph Unleashed's DB)
 *   H   Q58/Q59: a High Magic cast is every tradition to its target's
 *       Forbidden Magic, and Unbound (`forbiddenSparesHighMagic`) is spared
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

const api = await imp("module-api.mjs");
const pq = await imp("prerequisites.mjs");
const pf = await imp("picker-filters.mjs");
const ap = await imp("archetype-progression.mjs");
const rw = await imp("reactions/reactions-workflow.mjs");
const sc = await imp("magic/save-convert.mjs");
const oa = await imp("combat/one-attack.mjs");
const dof = await imp("combat/defence-offer.mjs");
const hm = await imp("magic/high-magic.mjs");
const bs = await imp("magic/beneficial-save.mjs");
const cond = await imp("conditionals.mjs");
const src = {
  pq: read("module", "prerequisites.mjs"),
  check: read("module", "dice", "check.mjs"),
  attack: read("module", "combat", "attack-workflow.mjs"),
  apim: read("module", "module-api.mjs"),
  cast: read("module", "magic", "cast-workflow.mjs"),
  effects: read("module", "magic", "spell-effects.mjs"),
  sanct: read("module", "combat", "sanctuary-gate.mjs"),
  bs: read("module", "magic", "beneficial-save.mjs")
};

// ── P: C1, the heritage and "Level N only" clauses (Q57) ────────────────
equal("P1 \"Level N only\" is a maximum, its own type; \"Level N\" is still a minimum",
  [pq.parsePrerequisiteClause("Level 1 only"), pq.parsePrerequisiteClause("level 10 ONLY"), pq.parsePrerequisiteClause("Level 5")],
  [{ type: "levelMax", max: 1 }, { type: "levelMax", max: 10 }, { type: "level", min: 5 }]);
equal("P2 \"<Name> Heritage\", either case (the core's \"Azgar heritage\")",
  [pq.parsePrerequisiteClause("Wyrmdral Heritage"), pq.parsePrerequisiteClause("Azgar heritage"), pq.parsePrerequisiteClause("Heritage")],
  [{ type: "heritage", name: "Wyrmdral" }, { type: "heritage", name: "Azgar" }, null]);
equal("P3 Level 1 only: 1st passes, 2nd does not",
  [1, 2, 7].map((level) => pq.meetsParseablePrerequisites("Level 1 only", { level })), [true, false, false]);
equal("P3b a level-5 ceiling holds through 5th", [5, 6].map((level) => pq.meetsParseablePrerequisites("Level 5 only", { level })), [true, false]);
{
  const knownHeritages = new Set(["wyrmdral", "sparktail", "azgar"]);
  const st = (owned) => ({ level: 5, knownHeritages, heritageNames: new Set(owned) });
  equal("P4 a known heritage gates: its owner passes, another heritage does not, none does not",
    [pq.meetsParseablePrerequisites("Wyrmdral Heritage", st(["wyrmdral"])), pq.meetsParseablePrerequisites("Wyrmdral Heritage", st(["sparktail"])), pq.meetsParseablePrerequisites("Wyrmdral Heritage", st([]))],
    [true, false, false]);
  // THE SHIPPED TEXT (review): Fire-Like Blood is "Azgar heritage or Elarni heritage, Level 10".
  {
    const kh = new Set(["azgar", "elarni", "wyrmdral"]);
    const fl = (owned) => pq.meetsParseablePrerequisites("Azgar heritage or Elarni heritage, Level 10", { level: 10, knownHeritages: kh, heritageNames: new Set(owned) });
    equal("P4c alternatives: either heritage passes, a third does not (Fire-Like Blood's shipped text)", [fl(["azgar"]), fl(["elarni"]), fl(["thengar"]), fl([])], [true, true, false, false]);
    equal("P4d …and alternatives not all heritages pass open", pq.meetsParseablePrerequisites("Azgar heritage or Any heritage", { knownHeritages: kh, heritageNames: new Set() }), true);
  }
  equal("P4b the core's lower-case clause gates too (Fire-Like Blood's \"Azgar heritage\")",
    [pq.meetsParseablePrerequisites("Azgar heritage", st(["azgar"])), pq.meetsParseablePrerequisites("Azgar heritage", st(["wyrmdral"]))], [true, false]);
  equal("P5 a name that is no heritage passes open (\"Any Heritage\", a race)",
    [pq.meetsParseablePrerequisites("Any Heritage", st([])), pq.meetsParseablePrerequisites("Scaelyn Heritage", st([]))], [true, true]);
  equal("P6 with no heritages known, every heritage clause passes open",
    [pq.meetsParseablePrerequisites("Wyrmdral Heritage", { heritageNames: new Set() }), pq.meetsParseablePrerequisites("Wyrmdral Heritage", { knownHeritages: new Set(), heritageNames: new Set() })], [true, true]);
  equal("P6b with the other clauses: the heritage and the level and a feat all have to hold",
    [pq.meetsParseablePrerequisites("Wyrmdral Heritage, Level 5", st(["wyrmdral"])), pq.meetsParseablePrerequisites("Wyrmdral Heritage, Level 6", st(["wyrmdral"]))], [true, false]);
}
equal("P7 a heritage's key drops a trailing \"heritage\" and the case", ["Wyrmdral Heritage", "  wyrmdral ", "Sharuk-Dur"].map(pq.heritageNameKey), ["wyrmdral", "wyrmdral", "sharuk-dur"]);
equal("P8 a heritage-shaped segment is not a join boundary: splitting is as it was",
  pq.splitPrerequisiteClauses("Foo, Bar Heritage, BAB +2", new Set(["foo, bar heritage"])), ["Foo, Bar Heritage", "BAB +2"]);
equal("P8b a stat clause still is one", pq.splitPrerequisiteClauses("Foo, BAB +2", new Set(["foo, bab +2"])), ["Foo", "BAB +2"]);
ok("P8c a feat NAMED like a heritage clause is still a feat requirement (checked first)",
  pq.meetsParseablePrerequisites("Draconic Heritage", { knownNames: new Set(["draconic heritage"]), ownedNames: new Set(), knownHeritages: new Set(["draconic"]), heritageNames: new Set(["draconic"]) }) === false);
ok("P9 a Progression Requirements line that reads like one is not gated (unchanged)",
  ap.meetsProgressionRequirement("Wyrmdral Heritage", { level: 1 }) && ap.meetsProgressionRequirement("Level 1 only", { level: 9 }));
{
  api.resetModuleRegistry?.();
  const packs = [
    { metadata: { packageName: "trg-prime", name: "heritages", type: "Item" }, collection: "trg-prime.heritages", index: [{ name: "Thengar" }, { name: "Azgar" }] },
    { metadata: { packageName: "trg-eldritch-arts", name: "ea-heritages", type: "Item", flags: { "trg-prime": { extends: "heritages" } } }, collection: "trg-eldritch-arts.ea-heritages", index: [{ name: "Wyrmdral" }] },
    { metadata: { packageName: "other", name: "elsewhere", type: "Item" }, collection: "other.elsewhere", index: [{ name: "Sparktail" }] }
  ];
  equal("P10 the known heritages are the federated pack's: the system's and every extender's, nothing else",
    [...pf.knownHeritageNames(packs)].sort(), ["azgar", "thengar", "wyrmdral"]);
  equal("P10b no packs, no heritages known", pf.knownHeritageNames(null).size, 0);
  const savedPacks = globalThis.game.packs;
  globalThis.game.packs = packs;
  try {
    const actor = (level, heritage) => ({ type: "character", system: { identity: { level }, attributes: {}, skills: {}, combat: {}, magic: {} },
      items: heritage ? [{ type: "heritage", name: heritage, system: {} }] : [] });
    const entries = [{ name: "Elemental Breath", system: { prerequisites: "Wyrmdral Heritage" } }, { name: "Unbound", system: { prerequisites: "Level 1 only" } },
      { name: "Fire-Like Blood", system: { prerequisites: "Azgar heritage" } }, { name: "Plain", system: { prerequisites: "Level 1" } }];
    const offered = (a) => entries.filter(pf.withPrerequisitesGate(null, a, "racialFeat", null)).map((e) => e.name);
    equal("P11 the picker's gate: a Wyrmdral at 1st is offered its breath and Unbound, not Azgar's blood",
      await quiet(() => offered(actor(1, "Wyrmdral"))), ["Elemental Breath", "Unbound", "Plain"]);
    equal("P11b …an Azgar at 3rd its blood, and not Unbound",
      await quiet(() => offered(actor(3, "Azgar"))), ["Fire-Like Blood", "Plain"]);
    equal("P11c …a slot the gate does not cover is untouched", pf.withPrerequisitesGate(null, actor(3, "Azgar"), "heritage", null), null);
  } finally {
    globalThis.game.packs = savedPacks;
  }
}
ok("P12 the header no longer says heritage names are left unparsed (Q57)",
  /A HERITAGE AND A LEVEL CEILING \(3\.683\.0/.test(src.pq) && !/race\/heritage names, caster-category names/.test(src.pq) && !/"Level N only", "Caster Level N", proficiency/.test(src.pq));

// ── R: C2, what a check reaction's before() may answer ─────────────────
const BIAS = { NORMAL: "normal", ADVANTAGE: "advantage", DISADVANTAGE: "disadvantage" };
function fakeCheck({ type = "save", ...rest } = {}) {
  return {
    actor: { name: "Roller", uuid: "Actor.roller" }, type, subject: "will", label: "Will Save", dc: 14, bias: "normal", flat: false,
    modifiers: [{ label: "Will save", value: 5, type: "untyped" }], outcome: null, ...rest
  };
}
equal("R1 the modifiers kept: finite, non-zero, whole; typed, or untyped; labelled, or by the answer, or by the key",
  rw.reactionModifiersOf({ label: "Voidbound Resolve", modifiers: [{ value: 2, type: "Racial" }, { label: "Bad", value: 0 }, { label: "NaN", value: "x" }, { label: "Odd", value: 1.7 }] }, "voidbound"),
  [{ label: "Voidbound Resolve", value: 2, type: "racial" }, { label: "Odd", value: 1, type: "untyped" }]);
equal("R1b no answer, no modifiers; a key when nothing else names it", [rw.reactionModifiersOf(null), rw.reactionModifiersOf({ modifiers: [{ value: -1 }] }, "k")], [[], [{ label: "k", value: -1, type: "untyped" }]]);
equal("R2 only \"success\" declares", ["success", "Success ", "critical", "", undefined].map((d) => rw.reactionDeclaredDegree({ declare: d })), ["success", "success", "", "", ""]);
{
  api.resetModuleRegistry();
  const seen = [];
  api.registerCheckReaction("Voidbound Resolve", { before: async (ctx) => { seen.push({ k: "vr", isArea: ctx.isArea, saveSource: ctx.saveSource, sourceUuid: ctx.sourceUuid, attackMode: ctx.attackMode });
    return ctx.type === "save" && !ctx.isArea ? { label: "Voidbound Resolve", modifiers: [{ label: "Voidbound Resolve", value: 2, type: "racial" }], line: "Voidbound Resolve: +2." } : null; } });
  const c = fakeCheck({ isArea: false, saveSource: "Charm Person", sourceUuid: "Actor.caster", attackMode: "" });
  const said = await rw.checkReactionsBefore(c, BIAS);
  equal("R3 a modifier answered is pushed onto the check before the dice, and the line said",
    [c.modifiers.map((m) => `${m.label} ${m.value} ${m.type}`), said], [["Will save 5 untyped", "Voidbound Resolve 2 racial"], ["Voidbound Resolve: +2."]]);
  equal("R4 ctx carries isArea, saveSource, sourceUuid and attackMode off the check", seen[0], { k: "vr", isArea: false, saveSource: "Charm Person", sourceUuid: "Actor.caster", attackMode: "" });
  equal("R5 and it is recorded, for a reroll of the check", c.reactionModifiers, [{ label: "Voidbound Resolve", value: 2, type: "racial" }]);
  const area = fakeCheck({ isArea: true, saveSource: "Fireball" });
  await rw.checkReactionsBefore(area, BIAS);
  equal("R6 an area save is told so (Voidbound Resolve's \"targeted\")", [seen[1].isArea, area.modifiers.length], [true, 1]);
  const re = fakeCheck({ checkReactionsBeforeAsked: true, reactionModifiers: [{ label: "Voidbound Resolve", value: 2, type: "racial" }] });
  const reSaid = await rw.checkReactionsBefore(re, BIAS);
  equal("R7 a reroll of that check keeps the +2, unasked", [re.modifiers.map((m) => m.value), reSaid, seen.length], [[5, 2], [], 2]);
  const atk = fakeCheck({ type: "attack", attackMode: "melee" });
  await rw.checkReactionsBefore(atk, BIAS);
  equal("R8 an attack's mode reaches ctx (Veilstride's melee attack)", seen[2].attackMode, "melee");
}
{
  api.resetModuleRegistry();
  const asked = [];
  api.registerCheckReaction("Anchor in Nothing", { before: async () => { asked.push("anchor"); return { declare: "success", label: "Anchor in Nothing", line: "Anchor in Nothing: a success." }; } });
  api.registerCheckReaction("Voidbound Resolve", { before: async () => { asked.push("voidbound"); return { modifiers: [{ value: 2, type: "racial" }] }; } });
  const c = fakeCheck();
  const said = await rw.checkReactionsBefore(c, BIAS);
  equal("R9 a declared Success sets the check's declared degree, and no later reaction is asked",
    [c.declaredDegree, asked, said, c.modifiers.length], ["success", ["anchor"], ["Anchor in Nothing: a success."], 1]);
  equal("R10 …and locks it: no Conviction, Luck, reroll, conversion or Chance after it",
    [Boolean(c.locked), c.luckUsed, c.convictionDecided, c.saveReactionResolved, c.fumbleRerolled, Boolean(c.chanceUsed)], [true, true, true, true, true, true]);
  let forced = false;
  api.registerCheckReaction("Missed Chance", { after: async () => { forced = true; return { reroll: true }; } });
  const after = await rw.checkReactionsAfter({ ...c, outcome: { degree: { key: "success" } }, async reroll() { return this; } });
  equal("R10b the after-reactions leave a declared, locked check alone (Missed Chance is not asked)", [after.rerolled, forced], [false, false]);
  const out = sc.declaredAt({ degree: { key: "failure", label: "Failure" }, total: 3, margin: -11 }, c.declaredDegree);
  equal("R11 the existing declared path makes it exactly a Success that the dice do not count", [out.degree.key, out.declared, out.chaos], ["success", true, false]);
}
ok("R12 the declared-degree path still follows the reactions before the dice, and closes Conviction's Advantage",
  src.check.indexOf("const said = await checkReactionsBefore(check, BIAS);") > 0
  && src.check.indexOf("const said = await checkReactionsBefore(check, BIAS);") < src.check.indexOf("if (check.convictionAdvantage && check.actor && !check.declaredDegree)")
  && src.check.indexOf("if (check.convictionAdvantage && check.actor && !check.declaredDegree)") < src.check.indexOf("if (check.declaredDegree && !check.flat && check.outcome?.degree?.key) {"));
ok("R13 a check carries the bonuses a reaction answered", /this\.reactionModifiers = Array\.isArray\(config\.reactionModifiers\) \? config\.reactionModifiers\.map\(\(m\) => \(\{ \.\.\.m \}\)\) : \[\];/.test(src.check));
equal("R14 a weapon attack's two rerolls carry them, as they carry the advantage",
  (src.attack.match(/reactionAdvantages: check\.reactionAdvantages \?\? \[\], reactionModifiers: check\.reactionModifiers \?\? \[\] \}\);/g) ?? []).length, 2);
ok("R15 the contract says so", /ctx adds `\{ isArea,\s*\*\s*saveSource, sourceUuid, attackMode \}`/.test(src.apim) && /`declare: "success"`/.test(src.apim) && /modifiers: \[\{ label, value, type \}\]/.test(src.apim));
api.resetModuleRegistry();

// ── D: C3, a defence offer for spells only ─────────────────────────────
equal("D1 a one-attack effect may last for a spell attack only", oa.oneAttackSpec({ against: "spell" }), { against: "spell", actions: [] });
equal("D2 …spent by a spell attack, not a Strike, a bomb or a spiritual weapon",
  ["spell", "weapon", "bomb", "spiritualWeapon"].map((kind) => oa.oneAttackUsedBy(oa.oneAttackSpec({ against: "spell" }), { kind })), [true, false, false, false]);
equal("D2b and from one caster, when it names one", [oa.oneAttackUsedBy(oa.oneAttackSpec({ against: "spell", fromUuids: ["Actor.c"] }), { kind: "spell", attackerUuid: "Actor.c" }), oa.oneAttackUsedBy(oa.oneAttackSpec({ against: "spell", fromUuids: ["Actor.c"] }), { kind: "spell", attackerUuid: "Actor.d" })], [true, false]);
equal("D3 \"attack\" and \"weapon\" are as they were",
  [["weapon", "spell", "bomb"].map((kind) => oa.oneAttackUsedBy(oa.oneAttackSpec(true), { kind })), ["weapon", "spell"].map((kind) => oa.oneAttackUsedBy(oa.oneAttackSpec({ against: "weapon" }), { kind }))],
  [[true, true, true], [true, false]]);
ok("D4 registerDefenceOffer accepts against: \"spell\"", dof.registerDefenceOffer("Test Glyph Ward", { summary: "+2 racial to DB", against: "spell" }, "test")
  && dof.registeredDefenceOffers().find((s) => s.key === "test glyph ward")?.against === "spell");
equal("D4b an unknown against is any attack, as before", (dof.registerDefenceOffer("Test Other Ward", { against: "nonsense" }, "test"), dof.registeredDefenceOffers().find((s) => s.key === "test other ward")?.against), "attack");
equal("D5 it answers a spell attack only", ["spell", "weapon", "bomb", "spiritualWeapon"].map((kind) => dof.defenceAnswersAttack("spell", { kind })), [true, false, false, false]);
{
  const candidates = [{ key: "glyph", label: "Glyph Unleashed", summary: "+2", against: "spell", has: true }, { key: "nimble dodge", label: "Nimble Dodge", summary: "+2", against: "attack", has: true }];
  equal("D6 offered before a spell attack, beside Nimble Dodge; not before a Strike",
    [dof.defenceOffersFor({ candidates, event: { kind: "spell" } }).offered.map((o) => o.key), dof.defenceOffersFor({ candidates, event: { kind: "weapon" } }).offered.map((o) => o.key)],
    [["glyph", "nimble dodge"], ["nimble dodge"]]);
}
ok("D7 the spell attack offers its defenders with the spell event kind", /await offerDefences\(actor, defender, \{ kind: "spell", what: spell\.name \}\);/.test(src.cast)
  && /consumeOneAttackEffects\(targetActor, \{ kind: "spell", attackerUuid: actor\?\.uuid \?\? "" \}\)/.test(src.cast));

// ── H: Q58/Q59, Forbidden Magic against a High Magic cast ──────────────
// The Ascendan's Forbidden Magic as the abilities pack prints it.
const forbiddenMagic = { type: "ability", name: "Forbidden Magic", system: {}, flags: { "trg-prime": {
  forbiddenTraditions: "divinity, verdant", beneficialTraditionSave: "divinity, verdant",
  conditionals: [
    { kind: "modifier", value: -2, type: "race", label: "Forbidden Magic", auto: true, when: { checkTypes: ["save"], traditions: ["divinity", "verdant"] } },
    { kind: "modifier", value: -2, type: "race", label: "Forbidden Magic", auto: false, when: { checkTypes: ["save"], not: { traditions: ["arcane", "divinity", "ethereal", "verdant"] } } }
  ] } } };
const unbound = { type: "feat", name: "Unbound", system: {}, flags: { "trg-prime": { forbiddenSparesHighMagic: true } } };
const ascendan = { name: "Ascendan", items: [forbiddenMagic], effects: [] };
const unboundAscendan = { name: "Unbound Ascendan", items: [forbiddenMagic, unbound], effects: [] };
const arcane = { tradition: "arcane", traits: "Mental" };
equal("H1 an ordinary cast's save is told the spell's own tradition, exactly as before",
  [hm.spellSaveTraditions(ascendan, arcane, { highMagic: false }), hm.spellSaveTraditions(ascendan, arcane), hm.spellSaveTraditions(ascendan, {}, { highMagic: false })], ["arcane", "arcane", ""]);
equal("H2 THE RULING (Q58): a High Magic cast is every tradition", hm.spellSaveTraditions(ascendan, arcane, { highMagic: true }), hm.ALL_TRADITIONS);
equal("H3 (Q59) …but to a creature High Magic spares, every tradition its Forbidden Magic does not name",
  hm.spellSaveTraditions(unboundAscendan, arcane, { highMagic: true }), "arcane, ethereal");
equal("H3b …and against an ordinary cast Unbound changes nothing", hm.spellSaveTraditions(unboundAscendan, { tradition: "divinity" }, { highMagic: false }), "divinity");
{
  const entries = forbiddenMagic.flags["trg-prime"].conditionals.map((raw, i) => cond.normaliseConditional(raw, { name: "Forbidden Magic" }, i)).filter(Boolean);
  const firing = (traditions) => entries.filter((e) => cond.matchesCheck(e, { checkType: "save", subject: "will", traditions })).map((e) => e.auto);
  equal("H4 the -2 meets a High Magic cast of an arcane spell (Q58); before, it met nothing",
    [firing(hm.spellSaveTraditions(ascendan, arcane, { highMagic: true })), firing(hm.spellSaveTraditions(ascendan, arcane, { highMagic: false }))], [[true], []]);
  equal("H5 (Q59) at Unbound, neither the -2 nor its tick-box question meets a High Magic cast", firing(hm.spellSaveTraditions(unboundAscendan, { tradition: "divinity" }, { highMagic: true })), []);
  equal("H5b …and a divine spell cast ordinarily still takes it", firing(hm.spellSaveTraditions(unboundAscendan, { tradition: "divinity" }, { highMagic: false })), [true]);
}
equal("H6 what spares: an item or effect's flag; not a disabled effect, nor a switched-off ability, nor nothing",
  [hm.forbiddenSparesHighMagic(unboundAscendan), hm.forbiddenSparesHighMagic({ items: [], effects: [{ flags: { "trg-prime": { forbiddenSparesHighMagic: true } } }] }),
    hm.forbiddenSparesHighMagic({ items: [], effects: [{ disabled: true, flags: { "trg-prime": { forbiddenSparesHighMagic: true } } }] }),
    hm.forbiddenSparesHighMagic({ items: [{ type: "ability", system: { active: false }, flags: { "trg-prime": { forbiddenSparesHighMagic: true } } }] }),
    hm.forbiddenSparesHighMagic(ascendan), hm.forbiddenSparesHighMagic(null)],
  [true, true, false, false, false, false]);
{
  const arcaneHeal = { tradition: "arcane", effects: [{ kind: "heal", formula: "2d8" }] };
  const allHeal = { tradition: "arcane, divinity, ethereal, verdant", effects: [{ kind: "heal", formula: "2d8" }] };
  equal("H7 the beneficial Will save, ordinary casts: an arcane heal and a four-tradition one ask nothing (unchanged)",
    [bs.beneficialSaveRequired(ascendan, arcaneHeal, null, { highMagic: false }).required, bs.beneficialSaveRequired(ascendan, allHeal, null, { highMagic: false }).required], [false, false]);
  const hmNeed = bs.beneficialSaveRequired(ascendan, arcaneHeal, null, { highMagic: true });
  equal("H8 THE RULING (Q58): a High Magic heal asks it, naming every forbidden tradition", [hmNeed.required, hmNeed.traditions, hmNeed.source], [true, ["divinity", "verdant"], "Forbidden Magic"]);
  equal("H9 (Q59) Unbound is spared it; a creature with no Forbidden Magic was never asked",
    [bs.beneficialSaveRequired(unboundAscendan, arcaneHeal, null, { highMagic: true }).required, bs.beneficialSaveRequired({ items: [], effects: [] }, arcaneHeal, null, { highMagic: true }).required], [false, false]);
  const nullAura = { type: "ability", name: "Null Aura", system: {}, flags: { "trg-prime": { beneficialSpellSave: { label: "Null Aura", otherCastersOnly: true } } } };
  equal("H9b a declared save (Null Aura) is not Forbidden Magic, and Unbound does not lift it",
    bs.beneficialSaveRequired({ items: [forbiddenMagic, unbound, nullAura], effects: [] }, arcaneHeal, { uuid: "Actor.other" }, { highMagic: true }).kind, "declared");
  equal("H10 without the caller's word, High Magic is read as the cast reads it: a Highmagic spell, a High Magic caster",
    [bs.beneficialSaveRequired(ascendan, { ...arcaneHeal, traits: "Highmagic" }).required,
      bs.beneficialSaveRequired(ascendan, arcaneHeal, { items: [{ type: "class", system: {}, flags: { "trg-prime": { highMagicCaster: true } } }] }).required,
      bs.beneficialSaveRequired(ascendan, arcaneHeal, { items: [] }).required], [true, true, false]);
}
ok("H11 the spell save is told the cast's traditions through the rule, the cast read once",
  /const saveHighMagic = highMagicCast\(actor, spellData \?\? \{\}\);/.test(src.cast)
  && /traditions: spellSaveTraditions\(target, spell\.system \?\? \{\}, saveHighMagic\),/.test(src.cast)
  && !/^\s*traditions: spell\.system\?\.tradition \?\? "",\n\s*\/\/ AND WHO IS CASTING IT/m.test(src.cast));
ok("H12 …and a spell's follow-up save the same way",
  /traditions: spellSaveTraditions\(target, spell\.system \?\? \{\}, highMagicCast\(caster, spell\.system \?\? \{\}\)\),/.test(src.effects));
ok("H13 a ward cast with High Magic says so, and its opponents' saves read it (Sanctuary, Visage Of Horror)",
  /\{ sanctuaryHighMagic: true \}/.test(src.effects) && /\{ horrorHighMagic: true \}/.test(src.effects)
  && /\{ highMagic: ward\.getFlag\(SYSTEM_ID, "sanctuaryHighMagic"\) === true \}/.test(src.sanct) && /\{ highMagic: ward\.getFlag\(SYSTEM_ID, "horrorHighMagic"\) === true \}/.test(src.sanct));
ok("H14 the beneficial save reads High Magic off the caster and spell, so a latecomer to an emanation is asked as the cast asked",
  /const castIsHighMagic = typeof highMagic === "boolean" \? highMagic : highMagicCast\(caster, spellData\)\.highMagic;/.test(src.bs)
  && /const byTradition = traditionSaveRequired\(target, spellData, castIsHighMagic\);/.test(src.bs));
ok("H15 the Ascendan's own High Magic casting is unchanged: 3.680.0's bypass of the tradition gate stands",
  /if \(!highMagicCast\(actor, spellData\)\.highMagic && !traditionGate\(actor, spellData, spell\.name\)\) return null;/.test(src.cast));

if (failures.length) {
  process.stdout.write(`verify-ea-block5a-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block5a-core: OK — ${checks} checks.\n`);
