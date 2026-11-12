#!/usr/bin/env node
/**
 * verify-ea-block6c-core — TRG Prime 3.684.0: group c of the seams Eldritch
 * Arts' Block 6 (archetypes, class feats, metamagic) needs, from the Block 6
 * audit (docs/ELDRITCH_ARTS_BLOCK6_AUDIT.md in the module), answered by Graham
 * on 4 November 2026 ("proposed except Q89: One release").
 *
 *   Z   G7: the 0 HP moment — "would fall unconscious" offers (Q128, Q109), a
 *       zero-HP guard that leaves half and announces it held (Q141), a waived
 *       Dying Check (Last Horizon)
 *   A   G8: archetype progression — "+N levels" since taking, opt-in (Q90);
 *       "cannot progress" and "Tradition skill +N ranks" (Q91)
 *   Q   G9: "A or B N ranks", opt-in per feat; registerFeatEligibility
 *   W   G10: casting while raging (Q104)
 *   B   G11: a BSB floor of half the level, rounded up
 *   S   G13: a sense range bonus (Void Pact)
 *   C   G18: a conviction refund on saves and skills, once a day (Q110)
 *   E   G21: declared extra daily uses
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
const quiet = async (fn) => { const e = console.error; const w = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };

const hooksCalled = [];
globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false, escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = { on() {}, once() {}, callAll(name, payload) { hooksCalled.push({ name, payload }); } };
const cards = [];
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (data) => { cards.push(data); return data; } };
globalThis.ui = globalThis.ui ?? { notifications: { warn() {}, info() {}, error() {} } };

const api = await imp("module-api.mjs");
const zh = await imp("combat/zero-hp-moment.mjs");
const zhw = await imp("combat/zero-hp-moment-workflow.mjs");
const dg = await imp("combat/death-guard.mjs");
const dgw = await imp("combat/death-guard-workflow.mjs");
const ap = await imp("archetype-progression.mjs");
const pf = await imp("picker-filters.mjs");
const pq = await imp("prerequisites.mjs");
const rage = await imp("combat/rage.mjs");
const rw = await imp("combat/rage-workflow.mjs");
const ac = await imp("magic/archetype-casting.mjs");
const fw = await imp("feats-workflow.mjs");
const sn = await imp("senses.mjs");
const cr = await imp("conviction-refund.mjs");
const xu = await imp("extra-uses.mjs");
const src = {
  dying: read("module", "combat", "dying-workflow.mjs"),
  dgw: read("module", "combat", "death-guard-workflow.mjs"),
  combat: read("module", "documents", "combat.mjs"),
  item: read("module", "documents", "item.mjs"),
  cast: read("module", "magic", "cast-workflow.mjs"),
  action: read("module", "combat", "action-workflow.mjs"),
  check: read("module", "dice", "check.mjs"),
  card: read("module", "dice", "check-card-interactions.mjs"),
  apiw: read("module", "module-api-workflow.mjs")
};

/** A creature the workflows can write to. */
function fakeActor({ hp = 10, max = 30, level = 5, items = [], effects = [], flags = {} } = {}) {
  const actor = {
    name: "Tester", uuid: "Actor.t", items, effects, appliedEffects: effects,
    flags: { "trg-prime": { ...flags } },
    system: { resources: { hp: { value: hp, max } }, identity: { level }, attributes: {}, combat: {}, skills: {}, magic: {} },
    writes: [],
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async setFlag(scope, key, value) { this.flags[scope] = { ...(this.flags[scope] ?? {}), [key]: value }; },
    async unsetFlag(scope, key) { delete this.flags[scope]?.[key]; },
    async update(changes) { this.writes.push(changes); if ("system.resources.hp.value" in changes) this.system.resources.hp.value = changes["system.resources.hp.value"]; }
  };
  return actor;
}

// ── Z: G7, the 0 HP moment ─────────────────────────────────────────────
equal("Z1 asked for a subdual knock-out and an ordinary drop; not against an outright kill or a destruction (Q128, Q109)",
  [zh.unconsciousOffersAsked({ subdual: true }), zh.unconsciousOffersAsked({}), zh.unconsciousOffersAsked({ massive: true }), zh.unconsciousOffersAsked({ noDeathState: true }), zh.unconsciousOffersAsked({ subdual: true, massive: true })],
  [true, true, false, false, true]);
equal("Z2 held only above 0 HP", [5, 1, 0, -3].map(zh.unconsciousOfferHeld), [true, true, false, false]);
equal("Z3 an offer's lines: strings only", [zh.unconsciousOfferLines({ lines: ["<p>a</p>", 3, " "] }), zh.unconsciousOfferLines({ lines: "<p>b</p>" }), zh.unconsciousOfferLines(null)], [["<p>a</p>"], ["<p>b</p>"], []]);
equal("Z4 a waiver names the live Dying effect; another Dying, none, or no flag waive nothing",
  [zh.dyingCheckWaiver({ dyingCheckWaived: { effect: "d1", label: "Last Horizon", actNormally: true } }, "d1"),
    zh.dyingCheckWaiver({ dyingCheckWaived: "d1" }, "d1"),
    zh.dyingCheckWaiver({ dyingCheckWaived: { effect: "d1" } }, "d2"),
    zh.dyingCheckWaiver({ dyingCheckWaived: { effect: "d1" } }, null),
    zh.dyingCheckWaiver({}, "d1")],
  [{ label: "Last Horizon", actNormally: true }, { label: "A waiver", actNormally: false }, null, null, null]);
{
  api.resetModuleRegistry();
  equal("Z5 registerUnconsciousOffer: a function, or { applies, offer }; nothing else",
    [api.registerUnconsciousOffer("Subconscious Casting", async () => null), api.registerUnconsciousOffer("Eternal Vigil", { applies: () => true, offer: async () => null }),
      await quiet(() => api.registerUnconsciousOffer("", async () => null)), await quiet(() => api.registerUnconsciousOffer("Bad", { applies: 3, offer: async () => null })), await quiet(() => api.registerUnconsciousOffer("Bad2", {}))],
    [true, true, false, false, false]);
  equal("Z5b …kept by key, in order", api.registeredUnconsciousOffers().map((o) => [o.key, typeof o.offer, o.applies === null]), [["subconscious casting", "function", true], ["eternal vigil", "function", false]]);
  ok("Z5c and exposed on the module API", /registerUnconsciousOffer: \(key, spec, moduleId\) => registerUnconsciousOffer\(key, spec, moduleId\),/.test(src.apiw));
}
{
  api.resetModuleRegistry();
  const none = fakeActor({ hp: 8 });
  equal("Z6 nothing registered: nothing asked, no HP written", [await zhw.tryUnconsciousOffers(none, { amount: 10, hpBefore: 8 }), none.writes.length], [null, 0]);
  api.registerUnconsciousOffer("Nobody", { applies: () => false, offer: async () => { throw new Error("asked"); } });
  const quietOne = fakeActor({ hp: 8 });
  equal("Z7 no offer applies: nothing asked, no HP written", [await zhw.tryUnconsciousOffers(quietOne, { amount: 10, hpBefore: 8 }), quietOne.writes.length], [null, 0]);
  api.resetModuleRegistry();
  const seen = [];
  api.registerUnconsciousOffer("Subconscious Casting", {
    applies: (ctx) => ctx.actor.name === "Tester",
    offer: async (ctx) => { seen.push({ hp: ctx.actor.system.resources.hp.value, subdual: ctx.subdual, amount: ctx.amount, hpBefore: ctx.hpBefore });
      await ctx.actor.update({ "system.resources.hp.value": 6 }); return { lines: ["<p>Cure Wounds is cast.</p>"] }; }
  });
  const a = fakeActor({ hp: 8 });
  cards.length = 0;
  const held = await zhw.tryUnconsciousOffers(a, { amount: 12, hpBefore: 8, subdual: true, damageTypes: ["subdual"] });
  equal("Z8 THE RULING (Q128): asked with the blow landed (HP 0), and a cast that leaves them above 0 holds",
    [seen[0], held, a.system.resources.hp.value], [{ hp: 0, subdual: true, amount: 12, hpBefore: 8 }, { case: "unconscious-offer", offer: "subconscious casting", newHP: 6 }, 6]);
  ok("Z8b the card carries the offer's lines and says why they stand", cards.length === 1 && /Cure Wounds is cast/.test(cards[0].content) && /do not fall unconscious/.test(cards[0].content));
  const massive = fakeActor({ hp: 8 });
  equal("Z9 against an outright kill nobody is asked", [await zhw.tryUnconsciousOffers(massive, { amount: 80, hpBefore: 8, massive: true }), massive.writes.length, seen.length], [null, 0, 1]);
  api.resetModuleRegistry();
  api.registerUnconsciousOffer("Fizzle", async () => ({ lines: ["<p>The spell fails.</p>"] }));
  api.registerUnconsciousOffer("Second", async (ctx) => { await ctx.actor.update({ "system.resources.hp.value": 2 }); return null; });
  const b = fakeActor({ hp: 4 });
  equal("Z10 an offer that leaves 0 lets the next be asked; the first above 0 stops the asking",
    [await zhw.tryUnconsciousOffers(b, { amount: 5, hpBefore: 4 }), b.system.resources.hp.value], [{ case: "unconscious-offer", offer: "second", newHP: 2 }, 2]);
  api.resetModuleRegistry();
  api.registerUnconsciousOffer("Fizzle", async () => ({ lines: ["<p>The spell fails.</p>"] }));
  const c = fakeActor({ hp: 4 });
  equal("Z11 none holds: the blow goes on (null) with HP at 0", [await zhw.tryUnconsciousOffers(c, { amount: 5, hpBefore: 4 }), c.system.resources.hp.value], [null, 0]);
  api.registerUnconsciousOffer("Throws", async () => { throw new Error("boom"); });
  const d = fakeActor({ hp: 4 });
  equal("Z11b an offer that throws is passed over", await quiet(() => zhw.tryUnconsciousOffers(d, { amount: 5, hpBefore: 4 })), null);
  api.resetModuleRegistry();
}
{
  const at = (needle) => src.dying.indexOf(needle);
  const offers = at("await tryUnconsciousOffers(actor, {");
  ok("Z12 asked in applyDamageDirect once the blow reaches 0: after the reduced case, before the subdual knock-out and the death guards",
    offers > at("if (amount < hpBefore) {") && offers < at("if (nonlethal) {\n    await actor.update({ \"system.resources.hp.value\": 0 });") && offers < at("const guarded = await tryDeathGuards(actor, {")
    && /damageTypes, sourceName, subdual: nonlethal, hpBefore, amount,\n\s*massive: massiveDamageInstantDeath\(amount, hpBefore, maxHP\),\n\s*noDeathState: hasNoDeathState\(creatureTypeSystem\)\n\s*\}\);\n\s*if \(standing\) return standing;/.test(src.dying));
}
{
  const half = dg.declaredDeathGuards([{ flags: { "trg-prime": { deathGuard: { label: "Pact Ascendant (Demonic)", auto: true, heal: "half", frequency: "daily", notOutright: true } } } }])[0];
  const plain = dg.declaredDeathGuards([{ flags: { "trg-prime": { deathGuard: { label: "Second Heart", auto: true } } } }])[0];
  equal("Z13 a zero-HP guard may leave half the maximum (Q141); one that says nothing is as it was", [half.heal, dg.deathGuardHealTo(half, 31), "heal" in plain, dg.deathGuardHealTo(plain, 31)], ["half", 15, false, 1]);
  equal("Z13b a death guard's own heal is unchanged", dg.declaredDeathGuards([{ flags: { "trg-prime": { deathGuard: { label: "Prism", auto: true, trigger: "death" } } } }], { trigger: "death" })[0].heal, "1");
  hooksCalled.length = 0;
  const actor = fakeActor({ hp: 3, max: 40, effects: [{ flags: { "trg-prime": { deathGuard: { label: "Pact Ascendant (Demonic)", auto: true, heal: "half", frequency: "daily" } } } }] });
  const out = await quiet(() => dgw.tryDeathGuards(actor, { damageTypes: ["fire"] }));
  equal("Z14 it holds at half, is spent for the day, and SAYS SO on trgPrimeDeathGuardHeld",
    [out, actor.system.resources.hp.value, actor.flags["trg-prime"].declaredUsedToday, hooksCalled.filter((h) => h.name === "trgPrimeDeathGuardHeld").map((h) => [h.payload.label, h.payload.hp, h.payload.trigger, h.payload.actor === actor])],
    [{ case: "death-guard", guard: "Pact Ascendant (Demonic)", newHP: 20 }, 20, { "Pact Ascendant (Demonic)": true }, [["Pact Ascendant (Demonic)", 20, "zeroHp", true]]]);
  ok("Z14b the would-die guards announce too", /Hooks\.callAll\("trgPrimeDeathGuardHeld", \{ actor, label: spec\.label, hp, trigger: "death" \}\);/.test(src.dgw));
}
{
  const c = src.combat;
  const waive = c.indexOf("const waiver = dyingCheckWaiver(actor.flags?.[SYSTEM_ID], dyingEffect?.id ?? null);");
  ok("Z15 the turn's Dying Check is not rolled while a waiver names this Dying; it is spent; actNormally goes on with the turn",
    waive > 0 && waive < c.indexOf("await this.#processDyingCheck(actor, dying, lines);")
    && /if \(!waiver\) \{\n\s*await this\.#processDyingCheck\(actor, dying, lines\);/.test(c)
    && /await actor\.unsetFlag\(SYSTEM_ID, DYING_CHECK_WAIVED_FLAG\);/.test(c)
    && /if \(!waiver\.actNormally\) \{\n\s*await TRGCombat\.#postTurnCard\(actor, "Phase 1 — Assessment", lines\);\n\s*return;/.test(c));
}

// ── A: G8, archetype progression ───────────────────────────────────────
equal("A1 the three shapes parse; Archer's two-clause line still does not",
  ["+10 levels", "+10 levels.", "cannot progress", "Cannot progress.", "Tradition skill +10 ranks", "Any 3 feats which effect missile weapons or attacks, +8 levels"].map(ap.parseProgressionClause),
  [{ type: "levelsSince", min: 10 }, { type: "levelsSince", min: 10 }, { type: "never" }, { type: "never" }, { type: "skillAny", keys: ["arcana", "religion", "occultism", "nature"], min: 10 }, null]);
{
  const m = (lv, ctx) => ap.meetsProgressionRequirement("+10 levels", { level: lv }, ctx);
  equal("A2 THE RULING (Q90): ten levels since taking, for an archetype that opts in and was stamped",
    [m(10, { sinceTaken: true, takenAt: 1 }), m(11, { sinceTaken: true, takenAt: 1 }), m(12, { sinceTaken: true, takenAt: 2 }), m(11, { sinceTaken: true, takenAt: 2 })], [false, true, true, false]);
  equal("A3 …unstamped (taken before this release) or not opted in (the core's Archer), it passes open as before",
    [m(1, { sinceTaken: true, takenAt: null }), m(1, { sinceTaken: true }), m(1, {}), m(1, { takenAt: 1 })], [true, true, true, true]);
  equal("A4 (Q91) \"cannot progress\" never passes; any one tradition skill at +10 does",
    [ap.meetsProgressionRequirement("cannot progress", { level: 20 }), ap.meetsProgressionRequirement("Tradition skill +10 ranks", { skillRanks: { occultism: 10 } }), ap.meetsProgressionRequirement("Tradition skill +10 ranks", { skillRanks: { arcana: 9, athletics: 12 } })],
    [false, true, false]);
}
{
  const arch = (flags) => ({ type: "feat", system: { category: "Archetype" }, flags: { "trg-prime": flags } });
  equal("A5 the stamp: an opted-in archetype gets the level; a stamped one keeps its own; others get none",
    [ap.archetypeTakenAtStamp(arch({ progressionSinceTaken: true }), 3), ap.archetypeTakenAtStamp(arch({ progressionSinceTaken: true, archetypeTakenAt: 1 }), 3),
      ap.archetypeTakenAtStamp(arch({}), 3), ap.archetypeTakenAtStamp({ type: "feat", system: { category: "Class" }, flags: { "trg-prime": { progressionSinceTaken: true } } }, 3), ap.archetypeTakenAtStamp(arch({ progressionSinceTaken: true, archetypeTakenAt: 0 }), 7)],
    [{ "flags.trg-prime.archetypeTakenAt": 3 }, null, null, null, null]);
  ok("A6 stamped as the feat arrives, after the refusals", /if \(this\._refusedAsIneligibleFeat\(options\)\) return false;\n\s*this\._stampArchetypeTakenAt\(\);/.test(src.item)
    // RE-POINTED AT 3.684.0 (review): the owner's uuid is passed too (A5b).
    && /const stamp = archetypeTakenAtStamp\(this\.toObject\?\.\(\) \?\? this, actor\.system\?\.identity\?\.level, actor\.id \? String\(actor\.uuid \?\? ""\) : ""\);/.test(src.item));
  const mine = arch({ progressionSinceTaken: true, archetypeTakenAt: 2, archetypeTakenBy: "Actor.a" });
  equal("A5b THE REVIEW FIX (G8): the owner is stamped beside the level; a copy arriving on another actor is stamped afresh; on its own actor, or an owner not yet known, it keeps its stamp",
    [ap.archetypeTakenAtStamp(arch({ progressionSinceTaken: true }), 3, "Actor.a"), ap.archetypeTakenAtStamp(mine, 9, "Actor.b"), ap.archetypeTakenAtStamp(mine, 9, "Actor.a"),
      ap.archetypeTakenAtStamp(mine, 9, ""), ap.archetypeTakenAtStamp(arch({ progressionSinceTaken: true, archetypeTakenAt: 4 }), 6, "Actor.c")],
    [{ "flags.trg-prime.archetypeTakenAt": 3, "flags.trg-prime.archetypeTakenBy": "Actor.a" }, { "flags.trg-prime.archetypeTakenAt": 9, "flags.trg-prime.archetypeTakenBy": "Actor.b" }, null, null,
      { "flags.trg-prime.archetypeTakenAt": 6, "flags.trg-prime.archetypeTakenBy": "Actor.c" }]);
}
{
  const actor = (level, feats) => ({ type: "character", flags: {}, system: { identity: { level }, attributes: {}, skills: {}, combat: {}, magic: {} }, items: feats });
  const feat = (name, line, flags = {}) => ({ type: "feat", name, system: { category: "Archetype", progressionRequirements: line }, flags: { "trg-prime": flags } });
  const pact = feat("Angelic Pact", "+10 levels", { progressionSinceTaken: true, archetypeTakenAt: 1 });
  const gate = (a) => pf.withArchetypeProgressionGate(null, a, "archetypeFeat");
  const blocked = (a) => { const g = gate(a); return typeof g === "function" && g({}) === false; };
  equal("A7 the picker: a 1st-level Pact blocks at 10th and opens at 11th; an unopted \"+10 levels\" never blocks",
    await quiet(() => [blocked(actor(10, [pact])), blocked(actor(11, [pact])), blocked(actor(2, [feat("ZZ Old", "+10 levels")]))]), [true, false, false]);
  equal("A8 \"cannot progress\" blocks at any level, and the picker says why",
    await quiet(() => [blocked(actor(20, [feat("Eternal Vigil", "cannot progress")])), pf.archetypeProgressionBlockReason(actor(20, [feat("Eternal Vigil", "cannot progress")]))]),
    [true, "Eternal Vigil cannot progress — no other archetype feat may be taken alongside it."]);
  ok("A8b and a \"+10 levels\" wait names the level it opens at", /taken at level 1, .*met at level 11/.test(await quiet(() => pf.archetypeProgressionBlockReason(actor(4, [pact])))));
  equal("A9 an archetype that does not opt in has the context it always had",
    [pf.archetypeGrantContext({ flags: {} }, { name: "Brawler" }), pf.archetypeGrantContext({ flags: {} }, pact)],
    [{ hasGrant: false, grantedSkill: "" }, { hasGrant: false, grantedSkill: "", sinceTaken: true, takenAt: 1 }]);
}

// ── Q: G9, prerequisites ───────────────────────────────────────────────
equal("Q1 \"A or B N ranks\" and \"A & B N ranks\"; one skill, a non-skill, or both joiners: unparsed",
  ["Arcana or Nature 8 ranks", "Arcana or Nature 12 ranks", "Handle Animal & Nature 1 rank", "Arcana 8 ranks", "Foo or Nature 2 ranks", "Arcana or Nature and Crafting 2 ranks"].map(pq.parseCompoundSkillClause),
  [{ type: "skillAny", keys: ["arcana", "nature"], min: 8 }, { type: "skillAny", keys: ["arcana", "nature"], min: 12 }, { type: "skillAll", keys: ["handleAnimal", "nature"], min: 1 }, null, null, null]);
equal("Q2 parsePrerequisiteClause is untouched by it (splitting reads as it did)", pq.parsePrerequisiteClause("Arcana or Nature 8 ranks"), null);
{
  const st = (ranks, compoundSkills) => ({ skillRanks: ranks, ...(compoundSkills ? { compoundSkills } : {}) });
  const m = (text, ranks, c) => pq.meetsParseablePrerequisites(text, st(ranks, c));
  equal("Q3 opted in: either skill passes, neither does not; \"&\" needs both",
    [m("Arcana or Nature 8 ranks", { nature: 8 }, true), m("Arcana or Nature 8 ranks", { arcana: 9 }, true), m("Arcana or Nature 8 ranks", { arcana: 7, nature: 7 }, true),
      m("Handle Animal & Nature 1 rank", { nature: 1 }, true), m("Handle Animal & Nature 1 rank", { nature: 1, handleAnimal: 1 }, true)],
    [true, true, false, false, true]);
  // RE-POINTED AT 3.684.1 (Graham, 4 November 2026: every feat): only an
  // explicit `compoundSkills: false` now keeps 3.684.0's pass-open.
  equal("Q4 `compoundSkills: false` (no longer the default): passes open, as 3.684.0 did",
    [pq.meetsParseablePrerequisites("Arcana or Nature 8 ranks", { skillRanks: {}, compoundSkills: false }), pq.meetsParseablePrerequisites("Occultism or Religion 1 rank", { skillRanks: {}, compoundSkills: false })], [true, true]);
  const actor = { type: "character", flags: {}, system: { identity: { level: 9 }, attributes: {}, skills: { arcana: { ranks: 7 } }, combat: {}, magic: {} }, items: [] };
  // RE-POINTED AT 3.684.1: Spell Recognition's whole line, as the book prints
  // it — offered because Arcana is one of its four skills, not because it
  // passes open.
  const entries = [{ name: "Elemental Exhalation", system: { prerequisites: "Arcana or Nature 8 ranks" }, flags: { "trg-prime": { compoundSkillPrerequisites: true } } },
    { name: "Spell Recognition", system: { prerequisites: "Arcana, Nature, Occultism or Religion 1 rank" } }];
  equal("Q5 the picker: Exhalation hidden at 7 ranks, the core's Spell Recognition offered for its Arcana",
    await quiet(() => entries.filter(pf.withPrerequisitesGate(null, actor, "classFeat", null)).map((e) => e.name)), ["Spell Recognition"]);
  ok("Q5b each feat slot requests the opt-in as an index field", ["racialFeat", "archetypeFeat", "classFeat", "generalFeat"].every((k) => pf.PICKER_SLOTS[k].fields.includes("flags.trg-prime.compoundSkillPrerequisites")));
}
// ── Q (3.684.1): every feat's two-skill prerequisites (Graham, 4 Nov 2026) ──
{
  const m = (text, stats = {}) => pq.meetsParseablePrerequisites(text, stats);
  const r = (skillRanks, more = {}) => ({ skillRanks, ...more });
  equal("Q12 THE RULING: unflagged, \"A or B N ranks\" and \"A & B N rank\" gate",
    [m("Occultism or Religion 1 rank", r({})), m("Occultism or Religion 1 rank", r({ religion: 1 })), m("Crafting or Nature 1 rank", r({ nature: 1 })),
      m("Handle Animal & Nature 1 rank", r({ nature: 1 })), m("Handle Animal & Nature 1 rank", r({ nature: 1, handleAnimal: 1 }))],
    [false, true, true, false, true]);
  const SCRIBE = "Arcana, Nature, Occultism or Religion 1 rank, BSB +1";
  const MASTERMIND = "Either Arcana, Crafting, Culture, Nature, Occultism, Planes or Religion 2 ranks";
  const CIRCLE = "Arcana, Nature, Occultism, or Religion 1 rank";
  equal("Q13 the book's lists, rejoined: Scribe Scroll by Arcana (and its BSB), Mastermind's \"Either\" by Crafting, Circle Adept's Oxford comma by Nature",
    [m(SCRIBE, r({ arcana: 1 }, { bsb: 1 })), m(SCRIBE, r({}, { bsb: 1 })), m(SCRIBE, r({ arcana: 1 }, { bsb: 0 })),
      m(MASTERMIND, r({ crafting: 2 })), m(MASTERMIND, r({ crafting: 1 })), m(CIRCLE, r({ nature: 1 })), m(CIRCLE, r({})),
      m("Arcana, Nature, Occultism or Religion 2 ranks, BSB +2", r({ religion: 2 }, { bsb: 2 }))],
    [true, false, false, true, false, true, false, true]);
  const fold = (t) => pq.foldCompoundSkillLists(pq.splitPrerequisiteClauses(t));
  equal("Q14 the fold: a run of bare skills only, and only when it parses; what it cannot read is left as split",
    [fold(SCRIBE), fold(MASTERMIND), fold("A total of 10 ranks in Arcana, Culture, Planes or Religion"), fold("Arcana, or Foo 1 rank"), fold("Weapon Focus, Arcana, Nature or Religion 2 ranks")],
    [["Arcana, Nature, Occultism or Religion 1 rank", "BSB +1"], [MASTERMIND], ["A total of 10 ranks in Arcana", "Culture", "Planes or Religion"], ["Arcana", "or Foo 1 rank"], ["Weapon Focus", "Arcana, Nature or Religion 2 ranks"]]);
  equal("Q15 what the parser cannot read still passes open (Inventive Crafter, Loremaster, Armoured Counter's armour)",
    [m("5 or more ranks in any skill that has both the create and research actions.", r({})), m("A total of 10 ranks in Arcana, Culture, Linguistics, Nature, Occultism, Planes or Religion", r({})),
      m("Survival 8 ranks, you are wearing medium or heavy armour.", r({ survival: 8 })), m("Divinity tradition or Devoted Path, Religion 5 ranks", r({ religion: 5 }))],
    [true, true, true, true]);
  const actor = (skills) => ({ type: "character", flags: {}, system: { identity: { level: 5 }, attributes: {}, skills, combat: {}, magic: { bsb: 1 } }, items: [] });
  const feats = [{ name: "Scribe Scroll", system: { prerequisites: SCRIBE } }, { name: "Animal Affinity", system: { prerequisites: "Handle Animal & Nature 1 rank" } },
    { name: "Power Attack", system: { prerequisites: "" } }];
  const shown = (skills) => feats.filter(pf.withPrerequisitesGate(null, actor(skills), "generalFeat", null)).map((e) => e.name);
  equal("Q16 the picker, unflagged: Scribe Scroll and Animal Affinity hidden without the ranks, offered with them",
    await quiet(() => [shown({}), shown({ arcana: { ranks: 1 }, nature: { ranks: 1 }, handleAnimal: { ranks: 1 } })]),
    [["Power Attack"], ["Scribe Scroll", "Animal Affinity", "Power Attack"]]);
  ok("Q17 the gate only hides: _preCreate reads no parseable prerequisite, so an owned, imported or copied feat is never refused for one",
    !/meetsParseablePrerequisites|withPrerequisitesGate|parseCompoundSkillClause/.test(src.item));
}
{
  api.resetModuleRegistry();
  const wild = { name: "Wild One", items: [{ type: "ability", name: "Wild" }] };
  const arcanum = { name: "Arcanist", items: [{ type: "ability", name: "Arcanum" }] };
  const has = (a, n) => a.items.some((i) => i.name === n);
  equal("Q6 registerFeatEligibility: a name and a function; nothing else",
    [api.registerFeatEligibility("High Magic Resonance", (a) => (has(a, "Wild") ? "a Sorcerer with the Wild Birthright cannot take this feat" : null)),
      api.registerFeatEligibility("Arcane Study", (a) => (has(a, "Arcanum") ? null : "needs the Arcanum Birthright")),
      await quiet(() => api.registerFeatEligibility("", () => null)), await quiet(() => api.registerFeatEligibility("X", "nope"))], [true, true, false, false]);
  equal("Q7 the reason, or null",
    [api.featEligibilityBlock("High Magic Resonance", wild), api.featEligibilityBlock("high magic resonance ", arcanum), api.featEligibilityBlock("Arcane Study", wild), api.featEligibilityBlock("Arcane Study", arcanum), api.featEligibilityBlock("Unregistered", wild)],
    ["a Sorcerer with the Wild Birthright cannot take this feat", null, "needs the Arcanum Birthright", null, null]);
  api.registerFeatEligibility("Arcane Study", () => { throw new Error("boom"); });
  api.registerFeatEligibility("Arcane Study", () => "second reason");
  equal("Q8 every registration is asked; one that throws is no reason", await quiet(() => [api.featEligibilityBlock("Arcane Study", arcanum)]), ["second reason"]);
  equal("Q9 the refusal names the feat and the reason; a deliberate script passes",
    [api.featEligibilityRefusal("High Magic Resonance", wild), api.featEligibilityRefusal("High Magic Resonance", wild, { trgAllowIneligibleFeat: true }), api.featEligibilityRefusal("High Magic Resonance", arcanum)],
    ["Wild One cannot take High Magic Resonance: a Sorcerer with the Wild Birthright cannot take this feat", null, null]);
  const pick = (a) => [{ name: "High Magic Resonance", system: {} }, { name: "Power Attack", system: {} }].filter(pf.withFeatGates(null, a, "classFeat")).map((e) => e.name);
  equal("Q10 the picker hides it from that character only", [pick({ ...wild, items: [...wild.items] }), pick(arcanum)], [["Power Attack"], ["High Magic Resonance", "Power Attack"]]);
  ok("Q11 refused at creation too, beside the exclusive groups", /if \(this\._refusedAsExclusiveFeat\(options\)\) return false;\n\s*if \(this\._refusedAsIneligibleFeat\(options\)\) return false;/.test(src.item)
    && /const refusal = featEligibilityRefusal\(this\.name, actor, options\);/.test(src.item));
  ok("Q11b exposed on the module API", /registerFeatEligibility: \(name, check, moduleId\) => registerFeatEligibility\(name, check, moduleId\),/.test(src.apiw));
  api.resetModuleRegistry();
}

// ── W: G10, casting while raging ───────────────────────────────────────
{
  const birthrager = { type: "feat", name: "Birthrager", flags: { "trg-prime": { castsWhileRaging: true } } };
  equal("W1 what lets you cast while raging: a flagged feat or effect; not a disabled effect or a switched-off ability",
    [rage.castsWhileRagingFrom([birthrager]), rage.castsWhileRagingFrom([{ name: "E", disabled: true, flags: { "trg-prime": { castsWhileRaging: true } } }]),
      rage.castsWhileRagingFrom([{ type: "ability", name: "A", system: { active: false }, flags: { "trg-prime": { castsWhileRaging: true } } }]), rage.castsWhileRagingFrom([{ name: "Power Attack", flags: {} }])],
    ["Birthrager", "", "", ""]);
  const sustain = { key: "sustainASpell", traits: "Concentrate" };
  const aim = { key: "aim", traits: "Concentrate" };
  equal("W2 THE RULING (Q104): Sustain a Spell passes rage's Concentrate bar for a Birthrager; Aim does not; nobody else's passes",
    [rage.rageCastingActionAllowed(sustain, rage.rageBlocksAction(sustain), true), rage.rageCastingActionAllowed(aim, rage.rageBlocksAction(aim), true),
      rage.rageCastingActionAllowed(sustain, rage.rageBlocksAction(sustain), false), rage.rageCastingActionAllowed({ key: "sustainASpell", traits: "Concentrate, Defence" }, rage.rageBlocksAction({ traits: "Concentrate, Defence" }), true)],
    [true, false, false, false]);
  const rageEffect = { name: rage.RAGE_EFFECT_NAME, disabled: false, getFlag: () => null };
  const actor = (items, effects) => ({ items, effects, appliedEffects: effects });
  equal("W3 rage bars casting, unless something lets its owner cast; not raging, nothing to bar",
    [rw.rageBarsCasting(actor([], [rageEffect])), rw.rageBarsCasting(actor([birthrager], [rageEffect])), rw.rageBarsCasting(actor([], [])), rw.castsWhileRaging(actor([birthrager], []))],
    [true, false, false, "Birthrager"]);
  ok("W4 both of the cast's rage refusals read it, and nothing there reads isRaging any more",
    /if \(rageBarsCasting\(actor\)\) return `\$\{actor\.name\} cannot cast spells while raging\.`;/.test(src.cast) && /if \(rageBarsCasting\(actor\) && !drunkPotion\) \{/.test(src.cast) && !/isRaging\(/.test(src.cast));
  ok("W5 the action workflow lets the casting actions through for an owner", /const castingAction = rageCastingActionAllowed\(action, blocked, Boolean\(castsWhileRaging\(actor\)\)\);\n\s*if \(!\(clarityActive && concentrateRule\) && !castingAction\) \{/.test(src.action));
}

// ── B: G11, a BSB floor of half the level, rounded up ──────────────────
equal("B1 half the level, up or (the core's) down; the floor rule either way",
  [ac.archetypeBSBDue({ level: 5, round: "up" }), ac.archetypeBSBDue({ level: 5 }), ac.archetypeBSBDue({ level: 5, round: "up", classBSB: 2 }), ac.archetypeBSBDue({ level: 5, round: "up", classBSB: 4 }), ac.archetypeBSBDue({ level: 6, round: "up" })],
  [3, 2, 1, 0, 3]);
{
  api.resetModuleRegistry();
  equal("B2 registerPPGrant takes a BSB floor without a perLevel; a PP grant still needs one",
    [api.registerPPGrant("Birthrager", { stat: "bsb", halfLevel: "up", label: "Birthrager (BSB)" }), await quiet(() => api.registerPPGrant("Wild Power", { label: "x" }))], [true, false]);
  const g = api.registeredPPGrants()[0];
  equal("B2b …kept with its rounding", [g.stat, g.halfLevel, g.types], ["bsb", "up", ["ability", "feat"]]);
  api.registerPPGrant("Halfling", { stat: "bsb" });
  equal("B2c rounding defaults to down", api.registeredPPGrants().find((x) => x.name === "halfling").halfLevel, "down");
  const rows = fw.modulePPGrants();
  const row = rows.find((r) => r.name === "birthrager");
  const actor = (level, bsb = 0, granted = 0) => ({ system: { identity: { level }, progression: { bsb } }, _source: { system: { magic: { bsb: granted } } }, getFlag: (_s, k) => (k === row.flag ? granted : undefined) });
  equal("B3 the grant row writes the sheet's BSB as a floor: 7th → 4, 7th with class BSB 3 → 1, 7th already granted 4 → 4",
    [row.path, row.statLabel, row.due(actor(7)), row.due(actor(7, 3)), row.due(actor(7, 0, 4))], ["system.magic.bsb", "BSB", 4, 1, 4]);
  api.resetModuleRegistry();
}

// ── S: G13, a sense range bonus ────────────────────────────────────────
{
  const darkvision = (name = "Darkvision", extra = {}) => ({ type: "ability", name, system: {}, flags: { "trg-prime": { creatureAbility: { derives: { sense: { category: "secondary", special: true, modality: "visual", ...extra } } } } } });
  const voidPact = { type: "feat", name: "Void Pact", system: {}, flags: { "trg-prime": { senseRangeBonus: { sense: "Darkvision", feet: 30 } } } };
  const range = (items, opts) => sn.sensesOf(items, 2, opts).map((s) => [s.name, s.rangeFeet, s.bonusFeet ?? 0]);
  const plain = sn.sensesOf([darkvision()], 2)[0];
  equal("S1 Void Pact: Darkvision +30 ft, after the halving; without it, unchanged and no bonus field",
    [range([darkvision(), voidPact]), "bonusFeet" in plain, plain.rangeFeet], [[["Darkvision", 65, 30]], false, 35]);
  equal("S2 the bonus is counted before an Enhanced feat's doubling", range([darkvision(), voidPact], { featNames: ["Enhanced Vision"] }).map((r) => r[1]), [(35 + 30) * 2]);
  equal("S3 a name with its own range typed in still matches; another sense does not",
    [range([darkvision("Darkvision (60 ft.)"), voidPact])[0][1], range([darkvision("Nightvision"), voidPact])[0][2]], [65, 0]);
  equal("S4 one item counts once, however many copies; an unequipped item counts nothing",
    [range([darkvision(), voidPact, { ...voidPact }])[0][1], range([darkvision(), { ...voidPact, system: { equipped: false } }])[0][1]], [65, 35]);
  equal("S5 the declared rows, by sense", [...sn.senseRangeBonuses([voidPact, { name: "Other", flags: { "trg-prime": { senseRangeBonus: [{ sense: "darkvision", feet: 10 }, { sense: "Scent", feet: 0 }] } } }])], [["darkvision", 40]]);
}

// ── C: G18, conviction refund on saves and skills, once a day ──────────
{
  const adaptive = { type: "feat", name: "Adaptive Mind", flags: { "trg-prime": { convictionRefund: { skills: ["mentalFocus"], degrees: ["success", "critical", "heroic"], label: "Adaptive Mind" } } } };
  const fates = { type: "feat", name: "Fate's Favour", flags: { "trg-prime": { convictionRefund: { degrees: ["partial", "failure", "fumble", "blunder"], checkTypes: ["save", "skill"], frequency: "daily", label: "Fate's Favour" } } } };
  const row = (items, ask) => cr.convictionRefundRow(items, ask)?.label ?? null;
  equal("C1 Inner Tempest's B5-3 row is unchanged: a Mental Focus success refunds; a save, or a failure, does not",
    [row([adaptive], { checkType: "skill", subject: "mentalFocus", degree: "success" }), row([adaptive], { checkType: "save", subject: "will", degree: "success" }), row([adaptive], { checkType: "skill", subject: "mentalFocus", degree: "failure" })],
    ["Adaptive Mind", null, null]);
  const anySkill = { type: "feat", name: "Any Skill", flags: { "trg-prime": { convictionRefund: { degrees: ["success"], label: "Any Skill" } } } };
  equal("C1b a row naming no check types is still skills only", [row([anySkill], { checkType: "skill", subject: "stealth", degree: "success" }), row([anySkill], { checkType: "save", subject: "will", degree: "success" })], ["Any Skill", null]);
  equal("C2 THE RULING (Q110, literal): Fate's Favour refunds on a Partial or worse, on a save or a skill; not on a success; not twice a day",
    [row([fates], { checkType: "save", subject: "will", degree: "partial" }), row([fates], { checkType: "skill", subject: "stealth", degree: "blunder" }),
      row([fates], { checkType: "save", subject: "will", degree: "success" }), row([fates], { checkType: "attack", degree: "failure" }),
      row([fates], { checkType: "save", subject: "will", degree: "failure", usedToday: { [cr.convictionRefundDailyKey("Fate's Favour")]: true } })],
    ["Fate's Favour", "Fate's Favour", null, null, null]);
  equal("C3 \"the first time each day\": a Success uses the day's chance as a refund does; nothing before the degree is known; a used row, a non-daily row, nothing",
    [cr.convictionRefundDailyUsed([fates], { checkType: "save", degree: "success" }), cr.convictionRefundDailyUsed([fates], { checkType: "save", degree: "failure" }),
      cr.convictionRefundDailyUsed([fates], { checkType: "save", degree: "" }), cr.convictionRefundDailyUsed([fates], { checkType: "save", degree: "failure", usedToday: { "convictionRefund:Fate's Favour": true } }),
      cr.convictionRefundDailyUsed([adaptive], { checkType: "skill", subject: "mentalFocus", degree: "success" })],
    [["convictionRefund:Fate's Favour"], ["convictionRefund:Fate's Favour"], [], [], []]);
  ok("C4 the roll and the card both mark the day's use, and ask with it",
    /const dailyUsed = convictionRefundDailyUsed\(check\.actor\.items, refundAsk\);\n\s*if \(dailyUsed\.length\) \{\n\s*await check\.actor\.setFlag\(SYSTEM_ID, "declaredUsedToday"/.test(src.check)
    && /const refundAsk = \{ checkType: check\.type, subject: check\.subject, degree: check\.outcome\?\.degree\?\.key \?\? "", usedToday \};/.test(src.check)
    // RE-POINTED AT 3.684.0 (review): the card's mark is a block now (C5).
    && /if \(dailyUsed\.length\) \{\n\s*await owner\.setFlag\(SYSTEM_ID, "declaredUsedToday"/.test(src.card) && /const refund = owner \? convictionRefundRow\(owner\.items, refundAsk\) : null;/.test(src.card));
  const key = cr.convictionRefundDailyKey("Fate's Favour");
  const flagged = { [key]: true, "other:row": true };
  const reAsked = cr.usedTodayForCard(flagged, [key]);
  equal("C5 THE REVIEW FIX (G18): a card's re-ask treats the day's use its OWN roll took as still its own — a newly qualifying degree is refunded; another card's use still blocks; the flag is not changed",
    [row([fates], { checkType: "save", subject: "will", degree: "failure", usedToday: reAsked }), row([fates], { checkType: "save", subject: "will", degree: "failure", usedToday: cr.usedTodayForCard(flagged, []) }),
      Object.keys(reAsked), Object.keys(flagged).length],
    ["Fate's Favour", null, ["other:row"], 2]);
  ok("C5b the roll remembers on the card what it took; the card's re-ask honours it and adds what it takes",
    /check\.convictionRefundDaily = \[\.\.\.dailyUsed\];/.test(src.check)
    && /convictionRefundDaily: Array\.isArray\(this\.convictionRefundDaily\) \? \[\.\.\.this\.convictionRefundDaily\] : \[\],/.test(src.check)
    && /usedToday: usedTodayForCard\(usedToday, takenHere\) \};/.test(src.card)
    && /raw\.convictionRefundDaily = \[\.\.\.new Set\(\[\.\.\.takenHere, \.\.\.dailyUsed\]\)\];/.test(src.card));
}

// ── Z (review, 3.684.0): where the 0 HP offer runs ─────────────────────
{
  const apim = read("module", "module-api.mjs");
  const doc = apim.slice(apim.indexOf("\"WHEN YOU WOULD FALL UNCONSCIOUS\""), apim.indexOf("export function registerUnconsciousOffer("));
  ok("Z20 THE CONTRACT (G7): the offer runs on the client that applies the damage, and a module asking the player goes through `askReactor` (a registered step), which exists",
    /THE CLIENT THAT APPLIES THE DAMAGE/.test(doc) && /often the GM's/.test(doc) && /`askReactor\(actor, \{ title,/.test(doc) && /registerReactionStep/.test(doc)
    && /export async function askReactor\(actor, \{/.test(read("module", "reactions", "reaction-ask-workflow.mjs")) && /askReactor: async \(\.\.\.args\) =>/.test(src.apiw));
}

// ── E: G21, declared extra daily uses ──────────────────────────────────
{
  api.resetModuleRegistry();
  equal("E0 nothing registered: the core's table exactly", [xu.extraUsesBonus(["Extra Channels"], "Channels"), xu.extraUsesBonus(["Deep Weave"], "Magical Reservoir"), Object.keys(xu.extraUsesTable())], [2, 0, Object.keys(xu.EXTRA_USES_FEATS)]);
  equal("E1 registerExtraUses: a feat, an ability, a positive whole perCopy (default 1)",
    [api.registerExtraUses("Deep Weave", { ability: "Magical Reservoir", perCopy: 1 }), api.registerExtraUses("Extra Reservoir", { ability: "Magical Reservoir", perCopy: 2 }), api.registerExtraUses("Extra Communion", { ability: "Verdant Communion" }),
      await quiet(() => api.registerExtraUses("Bad", { perCopy: 1 })), await quiet(() => api.registerExtraUses("Bad", { ability: "X", perCopy: 0 })), await quiet(() => api.registerExtraUses("", { ability: "X" }))],
    [true, true, true, false, false, false]);
  equal("E2 the uses add, per copy, to the ability named exactly",
    [xu.extraUsesBonus(["Deep Weave", "Extra Reservoir"], "Magical Reservoir"), xu.extraUsesBonus(["Extra Communion", "Extra Communion"], "verdant communion "), xu.extraUsesBonus(["Deep Weave"], "Greater Magical Reservoir")],
    [3, 2, 0]);
  api.registerExtraUses("Extra Channels", { ability: "Channels", perCopy: 9 });
  equal("E3 a core feat's name keeps the core's row", xu.extraUsesBonus(["Extra Channels"], "Channels"), 2);
  ok("E4 exposed on the module API", /registerExtraUses: \(name, spec, moduleId\) => registerExtraUses\(name, spec, moduleId\),/.test(src.apiw));
  api.resetModuleRegistry();
}

if (failures.length) {
  process.stdout.write(`verify-ea-block6c-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block6c-core: OK — ${checks} checks.\n`);
