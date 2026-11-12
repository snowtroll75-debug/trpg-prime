#!/usr/bin/env node
/**
 * verify-ea-block6b-core — TRG Prime 3.684.0: group b of the seams Eldritch
 * Arts' Block 6 (archetypes, class feats, metamagic) needs, from the Block 6
 * audit (docs/ELDRITCH_ARTS_BLOCK6_AUDIT.md in the module), answered by
 * Graham on 4 November 2026 ("proposed except Q89: One release").
 *
 *   F   G5: registerFumbleModifier / registerResonanceModifier — bias, a
 *       single High Magic roll (Q147), a forced Resonance (Q148); the cast
 *       context with the metamagic keys taken (the G1 ↔ G5 contract)
 *   C   G6: registerChargedItemRule — one spend path for every charged item:
 *       wield limit, cost cut, own-PP payment (Q131), metamagic on an item
 *       cast (Q130; `itemMetamagic: true`), an after-release step
 *   S   G16: a spell store held by a rune (the FIX for Storing Rune), a
 *       foreign stored spell (Q115), a stored release's marker (Q116)
 *   R   G17: a cast reaction that scales the spell or turns it on its caster
 *       (Q118)
 *   P   G26: a step before a pending cast's interruption settles (Q149)
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

const setProperty = (o, p, v) => { const ks = p.split("."); let c = o; for (const k of ks.slice(0, -1)) { c[k] ??= {}; c = c[k]; } c[ks.at(-1)] = v; };
globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: {
  getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), setProperty, deepClone: (x) => JSON.parse(JSON.stringify(x)),
  escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = globalThis.Hooks ?? { on() {}, callAll() {} };

const api = await imp("module-api.mjs");
const frm = await imp("magic/fumble-resonance-modifiers.mjs");
const cir = await imp("charged-item-rules.mjs");
const ci = await imp("charged-items.mjs");
const ciw = await imp("charged-items-workflow.mjs");
const ss = await imp("magic/spell-storing.mjs");
const ssw = await imp("magic/spell-storing-workflow.mjs");
const crs = await imp("magic/cast-reaction-shape.mjs");
const crsw = await imp("magic/cast-reaction-shape-workflow.mjs");
const rw = await imp("reactions/reactions-workflow.mjs");
const pcs = await imp("magic/pending-cast-steps.mjs");
const src = {
  cast: read("module", "magic", "cast-workflow.mjs"),
  ciw: read("module", "charged-items-workflow.mjs"),
  cuw: read("module", "consumable-use-workflow.mjs"),
  miw: read("module", "magic-items-workflow.mjs"),
  sef: read("module", "magic", "spell-effects.mjs"),
  ssw: read("module", "magic", "spell-storing-workflow.mjs"),
  pcw: read("module", "magic", "pending-cast-workflow.mjs"),
  dyw: read("module", "combat", "dying-workflow.mjs"),
  apiw: read("module", "module-api-workflow.mjs"),
  apim: read("module", "module-api.mjs")
};
const between = (text, start, end) => { const a = text.indexOf(start); if (a < 0) return ""; const b = text.indexOf(end, a + start.length); return text.slice(a, b < 0 ? text.length : b); };

// ── F: G5, the fumble and the Resonance rolls ──────────────────────────
equal("F1 biases: none is normal; two disadvantages are one; advantage against disadvantage cancels; junk is ignored",
  [frm.combineBias([]), frm.combineBias(["disadvantage", "disadvantage"]), frm.combineBias(["advantage", "disadvantage"]), frm.combineBias(["Advantage"]), frm.combineBias(["worse", ""])],
  ["normal", "disadvantage", "normal", "advantage", "normal"]);
equal("F2 higher is worse on both tables: disadvantage keeps the higher, advantage the lower, none the first",
  [frm.keptPercentile(30, 80, "disadvantage"), frm.keptPercentile(30, 80, "advantage"), frm.keptPercentile(30, 80, "normal")], [80, 30, 30]);
equal("F3 THE RULING (Q147): High Magic alone rolls with disadvantage; `single` lifts only that; Spell Surge's stands beside it; a caller's carried disadvantage stays",
  [frm.resonanceRollBias({ highMagic: true }), frm.resonanceRollBias({ highMagic: true, single: true }),
    frm.resonanceRollBias({ highMagic: true, single: true, biases: ["disadvantage"] }), frm.resonanceRollBias({ disadvantage: true, highMagic: true, single: true }),
    frm.resonanceRollBias({}), frm.resonanceRollBias({ highMagic: true, biases: ["advantage"] })],
  ["disadvantage", "normal", "disadvantage", "disadvantage", "normal", "normal"]);
{
  api.resetModuleRegistry();
  const seen = [];
  api.registerFumbleModifier("Mana Bound", (ctx) => { seen.push(ctx); return !ctx.blunder && ctx.check?.type === "spellcraft" ? { modifier: -20, label: "Mana Bound" } : null; });
  api.registerFumbleModifier("Broken", () => { throw new Error("boom"); });
  api.registerFumbleModifier("Surge", (ctx) => (ctx.metamagic.includes("spellSurge") ? { bias: "disadvantage", line: "Spell Surge: at disadvantage." } : null));
  const cast = frm.castFacts({ spell: { name: "Fireball", uuid: "Item.f" }, metamagic: ["empower", { key: "spellSurge" }], castOptions: new Set(["runicStabiliser"]) });
  const a = await quiet(() => frm.fumbleModifiersFrom({ blunder: false, check: { type: "spellcraft" }, metamagic: cast.metamagic, castOptions: cast.castOptions, cast }));
  equal("F4 Mana Bound's −20 on a Spellcraft fumble; a throwing modifier costs only its own answer; a metamagic's bias joins",
    [a.modifier, a.bias, a.parts, a.lines], [-20, "disadvantage", [{ label: "Mana Bound", value: -20 }], ["Spell Surge: at disadvantage."]]);
  const b = await quiet(() => frm.fumbleModifiersFrom({ blunder: true, check: { type: "spellcraft" }, metamagic: [], cast: null }));
  const c = await quiet(() => frm.fumbleModifiersFrom({ blunder: false, check: { type: "skill", skill: "nature" }, metamagic: [] }));
  equal("F4b …not on a Blunder, nor on a tradition-skill release", [b.modifier, c.modifier, b.bias], [0, 0, "normal"]);
  equal("F4c the modifier is told the metamagic and casting options taken (the G1 ↔ G5 contract)", [seen[0].metamagic, seen[0].castOptions], [["empower", "spellSurge"], ["runicStabiliser"]]);
  const d = await quiet(() => frm.fumbleModifiersFrom({ cast: frm.castFacts({ fumbleBias: "disadvantage", spell: { name: "Bolt" } }) }));
  equal("F4d a cast's own `fumbleBias` (a metamagic's declaration) rides the cast's facts", d.bias, "disadvantage");
}
{
  api.resetModuleRegistry();
  api.registerResonanceModifier("High Magic Resonance", (ctx) => (ctx.highMagic ? { single: true, line: "High Magic Resonance: rolled once." } : null));
  api.registerResonanceModifier("Plus", { roll: () => ({ modifier: 5, label: "Plus", bias: "advantage" }) });
  api.registerResonanceModifier("Surge", { force: (ctx) => (ctx.cast ? { reason: "Resonance Surge", line: "after the spell" } : null) });
  api.registerResonanceModifier("Always", { force: () => true });
  api.registerResonanceModifier("Thrower", { roll: () => { throw new Error("x"); }, force: () => { throw new Error("y"); } });
  const r = await quiet(() => frm.resonanceModifiersFrom({ highMagic: true, cast: frm.castFacts({ resonanceBias: "disadvantage", spell: { name: "Bolt" } }) }));
  equal("F5 the roll's answers: single, modifiers summed, biases gathered (the cast's own first)",
    [r.single, r.modifier, r.biases, r.lines.length], [true, 5, ["disadvantage", "advantage"], 2]);
  equal("F5b a function is a roll; an object may be roll and force, either", api.registeredResonanceModifiers().map((m) => [m.key, Boolean(m.roll), Boolean(m.force)]),
    [["high magic resonance", true, false], ["plus", true, false], ["surge", false, true], ["always", false, true], ["thrower", true, true]]);
  const forced = await quiet(() => frm.forcedResonancesFrom({ cast: true }));
  const none = await quiet(() => frm.forcedResonancesFrom({ cast: false }));
  equal("F6 a forced Resonance: an object's reason, `true` the key; a throw is skipped; asked with the cast's degree",
    [forced, none.map((f) => f.key)], [[{ key: "surge", reason: "Resonance Surge", line: "after the spell" }, { key: "always", reason: "always", line: "" }], ["always"]]);
  api.resetModuleRegistry();
  equal("F7 malformed registrations are refused, and said",
    [api.registerFumbleModifier("", () => null), api.registerFumbleModifier("x", null), api.registerResonanceModifier("y", {}), api.registrationProblems().length], [false, false, false, 3]);
}
equal("F8 a cast's facts are plain and clean", frm.castFacts({ spell: { name: " Fireball ", uuid: "u" }, metamagic: [" quicken ", "", { key: "x" }], fumbleBias: "worse", resonanceBias: "Disadvantage", innate: 1 }),
  // RE-POINTED AT 3.684.0 (review): the facts now say `storedForeign` too.
  { spellName: "Fireball", spellUuid: "u", metamagic: ["quicken", "x"], castOptions: [], fumbleBias: "", resonanceBias: "disadvantage", innate: true, itemCast: false, ritual: false, stored: false, storedForeign: false });
{
  const fumble = between(src.cast, "export async function rollSpellFumble(actor, {", "/** A Magical Resonance Event roll. */");
  ok("F9 the fumble roll asks the modifiers before the dice and rolls its first percentile with their bias",
    /const moduleFumble = await fumbleModifiersFrom\(\{/.test(fumble) && fumble.indexOf("fumbleModifiersFrom({") < fumble.indexOf("const chain = await rollChain({")
    && /if \(moduleFumble\.bias === "normal" \|\| fumbleDrawn\+\+ > 0\) return first;/.test(fumble) && /return keptPercentile\(first, second, moduleFumble\.bias\);/.test(fumble));
  ok("F9b and adds their modifier to the total", /\+ featureFumbleMod \+ highMagicMod \+ moduleFumble\.modifier;/.test(fumble));
  ok("F9c the cast's facts reach it off the Resonance context", /const castOf = cast \?\? resonanceContext\?\.cast \?\? null;/.test(fumble));
  const res = between(src.cast, "export async function rollResonanceEvent(", "\n/**\n * Spell Concentration");
  ok("F10 the Resonance roll asks the modifiers after the suppressors, and adds theirs",
    res.indexOf("resonanceSuppressedBy({ actor, reason })") < res.indexOf("resonanceModifiersFrom({")
    && /const modifier = resonanceModifierTotal\(modifiers\) \+ moduleResonance\.modifier;/.test(res));
  ok("F11 the cast's Resonance context carries G1's metamagic keys and biases and the casting options",
    /cast: castFactsOf\(\{\n\s*spell, metamagic: castMetamagic\.keys, castOptions: castOptionsApplied\.keys,\n\s*fumbleBias: castMetamagic\.fumbleBias, resonanceBias: castMetamagic\.resonanceBias,/.test(src.cast));
  const forcedAt = src.cast.indexOf("const forced = await forcedResonancesFrom({");
  ok("F12 a forced Resonance is asked after the cast's fumble, and rolled with the cast's own context (Q148)",
    forcedAt > src.cast.indexOf("  if (outcome.fumbleRoll) {\n    await rollSpellFumble(actor, {")
    && /for \(const event of forced\) \{\n\s*await rollResonanceEvent\(actor, \{ reason: [^\n]*, modifiers: resonanceContext \}\);/.test(src.cast)
    && /if \(!threaded\) \{\n\s*const \{ forcedResonancesFrom \}/.test(src.cast));
  ok("F13 a release's fumble says which check, and Spell Concentration's says so",
    /check: \{ type: option\.skill \? "skill" : "spellcraft", skill: option\.skill \?\? "" \},\n\s*release: true/.test(src.ciw)
    && /pp, check: \{ type: "concentration" \} \}\);/.test(src.cast));
  ok("F14 High Magic Resonance's daily Fumble→Failure needs no new seam: the existing degree remap runs before the fumble is owed, told High Magic",
    src.cast.indexOf("const remapped = await remapCastDegree({") > 0 && src.cast.indexOf("const remapped = await remapCastDegree({") < src.cast.indexOf("const outcome = castingOutcome(degree, {")
    && /highMagic: Boolean\(hmCast\.highMagic\),/.test(src.cast));
}

// ── C: G6, the charged items ───────────────────────────────────────────
equal("C1 the wield limit: the highest answer, never below one", [cir.chargedWieldLimit([]), cir.chargedWieldLimit([2, 3, null]), cir.chargedWieldLimit([0])], [1, 3, 1]);
equal("C2 the cost: Conduit Mastery's −1 minimum 1 on 3, 1 and a Partial's 0; Resonant Conduit's free; two cuts add; a floor is never a surcharge",
  [cir.chargedItemCost(3, [{ reduction: 1, minimum: 1 }]).pp, cir.chargedItemCost(1, [{ reduction: 1, minimum: 1 }]).pp, cir.chargedItemCost(0, [{ reduction: 1, minimum: 1 }]).pp,
    cir.chargedItemCost(5, [{ free: true, label: "Resonant Conduit" }]), cir.chargedItemCost(5, [{ reduction: 1 }, { reduction: 1, minimum: 1 }]).pp,
    cir.chargedItemCost(2, [{ reduction: 1, minimum: 4 }]).pp, cir.chargedItemCost(4, []).pp],
  [2, 1, 0, { pp: 0, due: 5, free: true, cut: 5, labels: ["Resonant Conduit"] }, 3, 2, 4]);
equal("C3 the own-PP payment: the first rule offering it, its depletion bias cleaned",
  [cir.chargedItemPayment([null, { ownPP: false }, { ownPP: true, allowEmpty: true, depletionBias: "Disadvantage", label: "Weave Infusion", key: "weave" }]), cir.chargedItemPayment([{ ownPP: true, depletionBias: "worse" }])?.depletionBias, cir.chargedItemPayment([])],
  [{ ownPP: true, allowEmpty: true, depletionBias: "disadvantage", label: "Weave Infusion", key: "weave" }, "", null]);
equal("C4 THE RULING (Q130): metamagic on an item cast only when a rule allows it, to double the PP the item releases the spell at, or the highest ceiling given",
  [cir.chargedItemMetamagic(4, []), cir.chargedItemMetamagic(4, [{ allowed: true, label: "Metamagic Conduit" }]), cir.chargedItemMetamagic(4, [{ allowed: true, ceiling: 6 }, { allowed: true, ceiling: 10 }]).ceiling],
  [{ allowed: false, ceiling: 0, labels: [] }, { allowed: true, ceiling: 8, labels: ["Metamagic Conduit"] }, 10]);
equal("C5 THE RULING (Q131): on Charge Depletion low is worse, so disadvantage keeps the LOWER d100",
  [cir.depletionKept(12, 70, "disadvantage"), cir.depletionKept(12, 70, "advantage"), cir.depletionKept(12, 70, "")], [12, 70, 12]);
{
  api.resetModuleRegistry();
  const order = [];
  api.registerChargedItemRule("Dual Channel", { wieldLimit: () => 2, onRelease: (ctx) => { order.push(["dual", ctx.degree, ctx.ppSpent, ctx.paidBy]); return { lines: ["Dual Channel: both items lose 1 more PP."] }; } });
  api.registerChargedItemRule("Conduit Mastery", { wieldLimit: () => 3, cost: (ctx) => { order.push(["cost", ctx.kind, ctx.pp]); return { reduction: 1, minimum: 1, label: "Conduit Mastery" }; } });
  api.registerChargedItemRule("Async", { wieldLimit: async () => 9 });
  api.registerChargedItemRule("Thrower", { cost: () => { throw new Error("x"); } });
  const answers = await quiet(() => cir.chargedRuleAnswers("cost", { pp: 3 }));
  equal("C6 every rule with that method is asked, in order, its key carried; a throw costs its own answer", answers, [{ reduction: 1, minimum: 1, label: "Conduit Mastery", key: "conduit mastery" }]);
  equal("C7 the sheet's limit: the highest plain answer (an async one is not waited on)", cir.chargedWieldLimitFor({}), 3);
  equal("C8 the warning reads the limit", [ci.chargedItemWarnings(["Wand", "Staff"], 3), ci.chargedItemWarnings(["Wand", "Staff"]).length, ci.chargedItemWarnings(["A", "B", "C", "D"], 3)[0].includes("at most 3")], [[], 1, true]);
  // DRIVEN: the one spend path, against a fake item.
  const wand = { name: "Wand of Sparks", uuid: "Item.w", system: { uses: 5 }, flags: { "trg-prime": { chargedItem: { maximumPP: 10 } } },
    async update(data) { this.system.uses = data["system.uses"]; } };
  const actor = { name: "Adept", items: [wand] };
  order.length = 0;
  const spent = await quiet(() => ciw.chargedItemSpend(actor, wand, 3, { kind: "release", reason: "castFromItem", degree: "fumble" }));
  equal("C9 the spend path: the rule's cut, the pool written, then onRelease (after the write) with what was paid",
    [spent.pp, spent.due, wand.system.uses, spent.after, order.map((o) => o[0]), order.at(-1), spent.lines.length], [2, 3, 3, 3, ["cost", "dual"], ["dual", "fumble", 2, "item"], 2]);
  const over = await quiet(() => ciw.chargedItemSpend(actor, wand, 7, { kind: "rod", reason: "metamagic" }));
  equal("C9b overspending still empties the pool and reports the overspend for depletion", [wand.system.uses, over.after, over.overspent], [0, -3, 3]);
  api.resetModuleRegistry();
  wand.system.uses = 5;
  const plain = await ciw.chargedItemSpend(actor, wand, 3, {});
  equal("C9c with no rule, exactly what was due is paid and nothing is said", [plain.pp, wand.system.uses, plain.lines], [3, 2, []]);
}
{
  const cast = between(src.ciw, "export async function castFromChargedItem(", "\n/**\n * Daily preparation");
  ok("C10 Cast from Item spends through the one path, unless paid from the wielder's own PP",
    /spend = await chargedItemSpend\(actor, item, due, \{ kind: "release"/.test(cast) && /if \(payOwn\) \{\n\s*ownPaid = Math\.min\(due, poolBefore\);/.test(cast)
    && !/await item\.update\(\{ "system\.uses": stored \}\);/.test(cast));
  ok("C11 the own-PP tick is offered only where a rule offers it, refunded to its payer, and an empty item rolls depletion after the cast with the rule's bias",
    /chargedItemPayment\(await chargedRuleAnswers\("payment"/.test(cast) && /if \(payOwn\) \{\n\s*const poolNow = /.test(cast)
    && /if \(payOwn && remaining <= 0\) await rollItemDepletion\(actor, item, \{ bias: ownPayment\.depletionBias \}\);/.test(cast));
  ok("C12 THE CONTRACT (G6 → G1): an allowed metamagic rides the item's cast as `itemMetamagic: true` with its ceiling",
    /\.\.\.\(itemMetamagic\.allowed \? \{ itemMetamagic: true, itemMetamagicCeiling: itemMetamagic\.ceiling \} : \{\}\)/.test(cast)
    && /\.\.\.\(itemMetamagic === true \? \{ itemMetamagic: true, itemMetamagicCeiling:/.test(src.cuw));
  ok("C13 a rod's spend goes the same way, and still rolls depletion below 0",
    /const \{ pp: cost, after, lines \} = await chargedItemSpend\(actor, item, pp, \{ kind: "rod", reason: String\(reason \?\? ""\) \}\);\n\s*if \(after < 0\) await rollItemDepletion\(actor, item\);/.test(src.ciw));
  ok("C14 the release hook carries the item's uuid", /actor, itemName, itemUuid: String\(itemUuid \?\? ""\), spellName, kind, pp: cost, degree,/.test(src.ciw));
  ok("C15 Charge Depletion takes a bias and keeps by depletionKept", /export async function rollItemDepletion\(actor, item, \{ bias = "" \} = \{\}\) \{/.test(src.miw)
    && /const kept = second \? depletionKept\(roll\.total, second\.total, bias\) : roll\.total;\n\s*const row = itemDepletionResult\(kept\);/.test(src.miw));
  ok("C16 the sheet's warning reads the rules' limit", /chargedWieldLimitFor\(actor\)\n\s*\);/.test(src.ciw));
}

// ── S: G16, the spell store ────────────────────────────────────────────
equal("S1 a row's host: the Arcane Bond by default (Spell Storing unchanged), the spell itself, or a flagged item",
  [ss.normaliseSpellStoring({ kind: "spellStoring" }).host, ss.normaliseSpellStoring({ host: "spell" }).host, ss.normaliseSpellStoring({ host: "spellStore" }).host, ss.normaliseSpellStoring({ host: "rune" }).host],
  ["arcaneBond", "spell", "spellStore", "arcaneBond"]);
{
  const bondItem = { id: "staff", flags: { "trg-prime": { arcaneBond: true } } };
  const rune = { id: "rune", flags: { "trg-prime": { spellStore: true } } };
  const spellItem = { id: "sr", flags: {} };
  equal("S2 the host found: the bond, the spell by id, the flagged item; a named host id wins; none is null",
    [ss.spellStoreHostOf([bondItem, rune, spellItem])?.id, ss.spellStoreHostOf([bondItem, spellItem], { host: "spell", spellId: "sr" })?.id,
      ss.spellStoreHostOf([bondItem, rune], { host: "spellStore" })?.id, ss.spellStoreHostOf([bondItem, rune], { hostId: "rune" })?.id,
      ss.spellStoreHostOf([spellItem], {}), ss.spellStoreHostOf([bondItem], { host: "spell", spellId: "missing" })],
    ["staff", "sr", "rune", "rune", null, null]);
  equal("S3 THE FIX: a Rune Sorcerer with no Arcane Bond has a store when the row names the rune it is cast from",
    [Boolean(ss.spellStoreHostOf([spellItem], { host: "arcaneBond" })), Boolean(ss.spellStoreHostOf([spellItem], { host: "spell", spellId: "sr" }))], [false, true]);
}
equal("S4 a foreign record says who cast it; an ordinary one is as before",
  [ss.storedSpellRecord({ spellId: "a", spellName: "Bolt", ppPaid: 4, foreign: true, foreignFrom: "Orc Shaman", foreignFromUuid: "Actor.o" }).foreign,
    ss.storedSpellRecord({ spellId: "a", spellName: "Bolt", ppPaid: 4, foreign: true, foreignFrom: "Orc Shaman" }).foreignFrom, "foreign" in ss.storedSpellRecord({ spellId: "a" })],
  [true, "Orc Shaman", false]);
ok("S5 the cards: no rune on the sheet is said; the bond's line is the old one; an absorbed release says its PP were its caster's",
  ss.noStoreCastLine("Storing Rune", "arcaneBond") === ss.noBondCastLine("Storing Rune") && /not on this sheet/.test(ss.noStoreCastLine("Storing Rune", "spell"))
  && /its caster's/.test(ss.foreignReleaseLine("Bolt", "Orc")) && /from Orc/.test(ss.foreignReleaseLine("Bolt", "Orc")));
{
  // DRIVEN: a fake sheet.
  const flagged = (id, name, flags = {}) => ({
    id, name, flags: { "trg-prime": { ...flags } }, deleted: false,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async setFlag(scope, key, value) { this.flags[scope] ??= {}; this.flags[scope][key] = value; },
    async unsetFlag(scope, key) { delete this.flags?.[scope]?.[key]; },
    async delete() { this.deleted = true; items.splice(items.indexOf(this), 1); }
  });
  const items = [];
  const spellItem = flagged("sr", "Storing Rune");
  items.push(spellItem);
  items.get = (id) => items.find((i) => i.id === id);
  const actor = {
    name: "Runebreaker", items,
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async createEmbeddedDocuments(type, data) { const doc = flagged(`c${items.length}`, data[0].name, data[0].flags?.["trg-prime"] ?? {}); items.push(doc); return [doc]; }
  };
  globalThis.game.time = { worldTime: 100 };
  actor.flags = { "trg-prime": { spellStoringArmed: { releaseCost: "1", hostId: "sr", round: null, worldTime: 100 } } };
  equal("S6 an open window names its host: the store lands in the rune, not a bond", ssw.storeHostFor(actor, ssw.readArmed(actor))?.id, "sr");
  equal("S6b a window opened before this release names none, and reads the bond (none here)", ssw.storeHostFor(actor, { releaseCost: "1" }), null);
  const kept = await ssw.storeForeignSpell(actor, { name: "Scorching Ray", system: { ppCost: 3 } }, { ppPaid: 5, mods: { damageDice: "1d6" }, host: spellItem, from: { name: "Orc Shaman", uuid: "Actor.o" } });
  const held = ssw.readStored(actor);
  equal("S7 Runebreaker's absorb: the spell copied onto the storer, flagged foreign, stored in the rune at its caster's PP",
    [kept?.spell?.name, kept?.spell?.getFlag("trg-prime", "storedForeign")?.fromName, held?.item?.id, held?.record?.foreign, held?.record?.ppPaid, held?.record?.spellId === kept?.spell?.id],
    ["Scorching Ray", "Orc Shaman", "sr", true, 5, true]);
  const copy = kept.spell;
  await ssw.clearStoredIn(actor, spellItem);
  equal("S8 cleared or dismissed, the absorbed copy goes with it", [copy.deleted, ssw.readStored(actor)], [true, null]);
  const again = await ssw.storeForeignSpell(actor, { name: "Frost Bolt" }, { ppPaid: 2, host: spellItem });
  await ssw.storeSpell(actor, { spellId: "sr", spellName: "Own Spell", ppPaid: 1 }, spellItem);
  ok("S8b a new store over an absorbed one deletes the old copy", again.spell.deleted === true && ssw.readStored(actor)?.record?.spellName === "Own Spell");
}
{
  const se = between(src.sef, '        case "spellStoring": {', '        case "delayedRespite": {');
  ok("S9 THE FIX, at the effect: the row's host is asked; a bond row still says the bond's line; the window records the host",
    /const bond = byBond \? bondedItemFor\(target\) : spellStoreHostFor\(target, \{ host: spec\.host, spellId: spell\.id \}\);/.test(se)
    && se.includes("if (byBond) lines.push(line(noBondCastLine(spell.name)));") && /\.\.\.\(byBond \? \{\} : \{ hostId: bond\.id \}\)/.test(se));
  ok("S10 the cast's intercept stores where the window opened", /const bond = storeHostFor\(actor, armed\);/.test(src.cast) && /releaseCost: armed\?\.releaseCost \?\? "1"\n\s*\}, bond\);/.test(src.cast));
  ok("S11 an absorbed spell settles no PP at release, says so, and cannot be cast but by its release",
    /if \(settle\.owed !== 0 && !stored\.foreign\) \{/.test(src.cast) && /stored\.foreign \? foreignReleaseLine\(/.test(src.cast)
    && /if \(!stored && spell\?\.getFlag\?\.\(SYSTEM_ID, "storedForeign"\)\) \{/.test(src.cast));
  ok("S12 a stored release is marked on the cast-option ctx and on trgPrimeSpellSettled (Rune Rend, Runic Overload)",
    /stored: Boolean\(stored\), storedForeign: Boolean\(stored\?\.foreign\), storedPP:/.test(src.cast) && /\/\/ Overload's riders read it; `storedForeign` an absorbed one\.\n\s*stored: Boolean\(stored\), storedForeign: Boolean\(stored\?\.foreign\),/.test(src.cast));
  ok("S13 the release casts an absorbed spell as the storer's, foreign, and deletes the copy after",
    /stored: \{ ppPaid: record\.ppPaid, mods: record\.mods, notes: record\.notes, foreign: true,/.test(src.ssw) && /\} finally \{\n\s*await dropForeignCopy\(actor, record\);/.test(src.ssw));
  ok("S14 the helpers reach it", /storeForeignSpell: async \(\.\.\.args\) =>/.test(src.apiw) && /spellStoreHost: async \(actor, opts = \{\}\) =>/.test(src.apiw));
}

// ── S (review, 3.684.0): the two stores kept apart; an absorbed copy cleaned ──
{
  const sa = await imp("magic/spell-availability.mjs");
  const flagged = (id, name, flags = {}) => ({
    id, name, flags: { "trg-prime": { ...flags } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async setFlag(scope, key, value) { this.flags[scope] ??= {}; this.flags[scope][key] = value; },
    async unsetFlag(scope, key) { delete this.flags?.[scope]?.[key]; }
  });
  const staff = flagged("staff", "Oaken Staff", { arcaneBond: true });
  const rune = flagged("sr", "Storing Rune", { storedSpell: { spellId: "gone", spellName: "Fire Bolt", ppPaid: 3, releaseCost: "1" } });
  const items = [staff, rune];
  items.get = (id) => items.find((i) => i.id === id);
  const actor = { name: "Rune Sorcerer", items, getFlag() { return null; } };
  // THE HAZARD the effect case had: `clearStored` falls back to any store.
  equal("S15 THE REVIEW FIX (G16, Medium): an empty bond's store is its own — emptying the staff leaves the rune's Fire Bolt, and the effect case asks only its host",
    [ssw.readStoredIn(staff), (await ssw.clearStoredIn(actor, staff), ssw.readStoredIn(rune)?.record?.spellName)], [null, "Fire Bolt"]);
  const se = between(src.sef, '        case "spellStoring": {', '        case "delayedRespite": {');
  ok("S15b the effect case reads and empties `readStoredIn(bond)` / `clearStoredIn(target, bond)` on both branches, never the fallback",
    se.includes("const already = readStoredIn(bond);") && se.includes("await clearStoredIn(target, bond);") && !/readStored\(target\)|clearStored\(target\)/.test(se));
  await staff.setFlag("trg-prime", "storedSpell", { spellId: "gone2", spellName: "Frost Ray", ppPaid: 2, releaseCost: "1" });
  equal("S16 every store is listed, the staff's first, each with its host",
    ssw.readAllStored(actor).map((h) => [h.item.id, h.record.spellName]), [["staff", "Frost Ray"], ["sr", "Fire Bolt"]]);
  globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
  await ssw.releaseStoredSpell(actor, { hostId: "sr" });
  equal("S16b Release names its host: the rune's (spell gone) is the one cleared, the staff's stays",
    [ssw.readStoredIn(rune), ssw.readStoredIn(staff)?.record?.spellName], [null, "Frost Ray"]);
  const sheet = read("module", "sheets", "actor-sheet.mjs");
  const hbs = read("templates", "actor", "actor-sheet.hbs");
  ok("S16c the sheet lists every store and each row's Release carries its host id",
    sheet.includes("context.storedSpells = readAllStored(actor).map(storedRow);") && /releaseStoredSpell\(this\.actor, \{ hostId: target\?\.dataset\?\.hostId \?\? "" \}\)/.test(sheet)
    && hbs.includes("{{#each storedSpells as |storedSpell|}}") && hbs.includes('data-host-id="{{storedSpell.hostId}}"'));
  const copy = ss.foreignSpellCopyData({
    _id: "x", name: "Scorching Ray", system: { ppCost: 3, innate: true, prepared: true, specialist: true, effects: [{ kind: "damage" }] },
    flags: { "trg-prime": { itemCast: { pp: 5 }, signatureSpell: true, innateMetamagic: true, spellBookPick: true, archetypeBook: { source: "a", via: "slot" }, grantedBy: { sourceId: "f" }, ownBonus: 1 }, other: { kept: 1 } }
  }, { fromName: "Orc Shaman", fromUuid: "Actor.o" });
  equal("S17 THE REVIEW FIX (G16, Medium-low): an absorbed copy is the storer's — innate, item-cast, signature, innate metamagic, book and grant marks gone; the rest kept; flagged foreign",
    [copy._id, copy.system.innate, copy.system.prepared, copy.system.specialist, copy.system.effects.length, Object.keys(copy.flags["trg-prime"]).sort(), copy.flags.other.kept],
    [undefined, false, false, false, 1, ["ownBonus", "storedForeign"], 1]);
  globalThis.game.time = { worldTime: 100 };
  const studyless = { getFlag: (scope, key) => (key === "dailyStudy" ? { at: 100, minutes: 30, studied: false } : null) };
  const mine = { name: "Fire Bolt", system: { ppCost: 3 }, flags: { "trg-prime": {} }, parent: studyless };
  const absorbed = { name: "Scorching Ray", system: copy.system, flags: copy.flags, parent: studyless };
  ok("S17b …castable for its release: a cantrips-only day refuses the storer's own Fire Bolt, never the absorbed copy (its record is already cleared)",
    Boolean(sa.spellCastBlocked(mine)) && sa.spellCastBlocked(absorbed) === null && sa.spellAvailability(absorbed).castable === true);
  ok("S17c storeForeignSpell copies through the cleaner", /const raw = foreignSpellCopyData\(/.test(src.ssw));
}
equal("F15 THE REVIEW FIX (G5): a cast's facts say an absorbed release, and only for a stored one",
  [frm.castFacts({ stored: true, storedForeign: true }).storedForeign, frm.castFacts({ stored: false, storedForeign: true }).storedForeign, frm.castFacts({ stored: true }).storedForeign], [true, false, false]);
{
  const fumble = between(src.cast, "export async function rollSpellFumble(actor, {", "/** A Magical Resonance Event roll. */");
  ok("F15b …the force ctx and the fumble ctx are told a stored release (Resonance Surge is not spent on one), and the cast's facts carry it",
    /stored: Boolean\(stored\), storedForeign: Boolean\(stored\?\.foreign\),\n\s*metamagic: resonanceContext\.cast\?\.metamagic/.test(src.cast)
    && /stored: Boolean\(castOf\?\.stored\), storedForeign: Boolean\(castOf\?\.storedForeign\),/.test(fumble)
    && /ritual: Boolean\(ritual\), stored: Boolean\(stored\),\n(\s*\/\/[^\n]*\n)*\s*storedForeign: Boolean\(stored\?\.foreign\)\n\s*\}\)/.test(src.cast));
}

// ── R: G17, a cast reaction that shapes the cast ───────────────────────
equal("R1 the answers folded: the first scale and the first bias hold; any retarget",
  crs.castReactionShape([null, { scale: 0.5 }, { scale: 2, saveBias: "advantage" }, { saveBias: "disadvantage", retargetCaster: true }, { scale: 3 }]),
  // 3.685.0 (H5): the fold also carries `exclude` and `turnBack`, empty here.
  { scale: 0.5, saveBias: "advantage", retargetCaster: true, exclude: [], turnBack: null, ignored: 2 });
equal("R2 THE RULING (Q118): the dice COUNT, rounded down, min 1; flat terms untouched",
  [crs.scaleDiceCount("3d6 + 2", 0.5), crs.scaleDiceCount("4d6 + 1d8", 0.5), crs.scaleDiceCount("d6", 2), crs.scaleDiceCount("1d6", 0.5), crs.scaleDiceCount("3d6", 1), crs.scaleDiceCount("5", 2)],
  ["1d6 + 2", "2d6 + 1d8", "2d6", "1d6", "3d6", "5"]);
equal("R3 the area, rounded down to 5 ft, never below 5; prose is no variable",
  [crs.scaleAreaText("20-ft radius", 0.5), crs.scaleAreaText("15-ft cone", 0.5), crs.scaleAreaText("5-ft burst", 0.5), crs.scaleAreaText("20-ft radius", 2), crs.scaleAreaText("a wall of stone", 0.5)],
  ["10-ft radius", "5-ft cone", "5-ft burst", "40-ft radius", null]);
equal("R4 the duration: a half not whole counts in the next unit down; a round is the floor; no number is no variable",
  [crs.scaleDurationText("1 minute", 0.5), crs.scaleDurationText("10 minutes", 0.5), crs.scaleDurationText("1 hour", 0.5), crs.scaleDurationText("1 round", 0.5),
    crs.scaleDurationText("3 rounds", 0.5), crs.scaleDurationText("1 minute (S)", 2), crs.scaleDurationText("Instantaneous", 0.5)],
  ["5 rounds", "5 minutes", "30 minutes", "1 round", "1 round", "2 minutes (S)", null]);
equal("R5 the targets, min 1; an area spell has none to scale; nothing to scale is said",
  [crs.scaleTargetCount(3, 0.5), crs.scaleTargetCount(1, 0.5), crs.scaleTargetCount(2, 2),
    crs.scaledVariables({ scale: 0.5, areaText: "20-ft radius", targetCount: 4, isArea: true }).targets, crs.scaledVariables({ scale: 0.5, durationText: "Instantaneous", targetCount: 0 }).any],
  [1, 1, 4, null, false]);
{
  api.resetModuleRegistry();
  api.registerCastReaction("Counter Channel", async () => ({ scale: 0.5, saveBias: "advantage", line: "Counter Channel: success." }));
  const out = await rw.castReactionsFor({ actor: { name: "Caster" }, token: { id: "t" }, spell: { name: "Fireball" }, pp: 6, degree: "success" });
  equal("R6 a reaction that does not stop may shape: the cast is told its scale and bias", [out.stop, out.scale, out.saveBias, out.retargetCaster, out.lines], [false, 0.5, "advantage", false, ["Counter Channel: success."]]);
  api.resetModuleRegistry();
  api.registerCastReaction("Stop", async () => ({ stop: true }));
  api.registerCastReaction("Shape", async () => ({ scale: 2 }));
  const stopped = await rw.castReactionsFor({ actor: { name: "Caster" }, token: { id: "t" }, spell: { name: "Fireball" } });
  equal("R6b a stop still holds alone", [stopped.stop, stopped.scale], [true, undefined]);
  api.resetModuleRegistry();
}
{
  // DRIVEN: the shape applied to a fake cast.
  const tokens = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
  let set = null;
  globalThis.game.user = { targets: new Set(tokens), updateTokenTargets(ids) { set = ids; } };
  const warpMods = {};
  const lines = await crsw.applyCastReactionShape({
    actor: { name: "Orc", getActiveTokens: () => [{ id: "orc" }] }, spell: { name: "Hold Person" },
    spellData: { duration: "1 minute", damage: { formula: "4d6" } }, warpMods, effArea: "", isArea: false, reacted: { scale: 0.5, saveBias: "advantage" }
  });
  equal("R7 halved: duration and dice written where the cast reads them, the targets cut to the first, the bias not applied (variables existed)",
    [warpMods.durationText, warpMods.diceScale, set, warpMods.saveBias, lines.length], ["5 rounds", 0.5, ["a"], undefined, 2]);
  const area = {};
  await crsw.applyCastReactionShape({ actor: { name: "Orc" }, spell: { name: "Fireball" }, spellData: { duration: "" }, warpMods: area, effArea: "20-ft radius", isArea: true, reacted: { scale: 2 } });
  equal("R7b doubled: an area's radius", area.areaOverride, "40-ft radius");
  const plain = {};
  await crsw.applyCastReactionShape({ actor: { name: "Orc" }, spell: { name: "Bless" }, spellData: { duration: "Instantaneous" }, warpMods: plain, isArea: true, reacted: { scale: 0.5, saveBias: "advantage" } });
  equal("R8 no variable to scale: every target saves with the bias instead", plain.saveBias, "advantage");
  set = null;
  const back = await crsw.applyCastReactionShape({ actor: { name: "Orc", getActiveTokens: () => [{ id: "orc" }] }, spell: { name: "Hold Person" }, spellData: {}, warpMods: {}, isArea: false, reacted: { retargetCaster: true } });
  equal("R9 Reflective Warding: the caster becomes the sole target; an area spell is the GM's", [set, back.length,
    (await crsw.applyCastReactionShape({ actor: { name: "Orc" }, spell: { name: "Fireball" }, spellData: {}, warpMods: {}, isArea: true, reacted: { retargetCaster: true } }))[0].includes("GM")], [["orc"], 1, true]);
  ok("R10 the cast applies a shape after the reactions, before it lands, only when not stopped",
    /if \(reacted\.stop\) \{ degree = "failure"; castDisrupted = true; \}\n(?:\s*\/\/[^\n]*\n)*\s*else if \(\(reacted\.scale \?\? 1\) !== 1 \|\| reacted\.saveBias \|\| reacted\.retargetCaster(?: \|\| reacted\.turnBack \|\| reacted\.exclude\?\.length)?\) \{\n\s*const \{ applyCastReactionShape \}/.test(src.cast));
  ok("R11 the attack's and the save's damage dice pass through the scale, and the save reads the bias",
    /scaleDiceCount\(addDice\(addDice\(warpedRowExtra\(dmg\.formula, warpMods\), clMods\?\.damageDice\), warpMods\?\.damageDice\), warpMods\?\.diceScale\)/.test(src.cast)
    && /scaleSaveDice\(addDice\(addDice\(warpedRowExtra\(effectiveDamage\?\.formula, warpMods\), clMods\?\.damageDice\), warpMods\?\.damageDice\), warpMods\?\.diceScale\)/.test(src.cast)
    && /\.\.\.\(\["advantage", "disadvantage"\]\.includes\(warpMods\?\.saveBias\) \? \{ bias: warpMods\.saveBias \} : \{\}\),\n\s*saveSource: spell\.name,/.test(src.cast));
}

// ── P: G26, a step before a pending cast's interruption settles ────────
{
  pcs.clearDamageSourceNotes();
  const target = { uuid: "Actor.sb" };
  pcs.noteDamageSource(target, { sourceUuid: "Actor.orc", sourceName: "Orc", context: { kind: "strike", melee: true } }, 1000);
  equal("P1 the blow's source is noted, and believed only for that blow",
    [pcs.lastDamageSourceOf(target, 1500).sourceUuid, pcs.lastDamageSourceOf(target, 1000 + pcs.SOURCE_NOTE_MS + 1).sourceUuid, pcs.lastDamageSourceOf({ uuid: "Actor.other" }, 1500).sourceUuid],
    ["Actor.orc", "", ""]);
  pcs.noteDamageSource(target, {}, 1600);
  equal("P1b a blow with no source clears the note", pcs.lastDamageSourceOf(target, 1700).sourceUuid, "");
  api.resetModuleRegistry();
  const seen = [];
  api.registerPendingCastStep("Magical Retribution", async (ctx) => { seen.push([ctx.spellName, ctx.sourceUuid, ctx.context?.melee]); return { lines: ["Magical Retribution: an attack of opportunity."] }; });
  api.registerPendingCastStep("Thrower", async () => { throw new Error("x"); });
  const lines = await quiet(() => pcs.pendingCastStepsBefore({ spellName: "Cone of Cold", sourceUuid: "Actor.orc", context: { melee: true } }));
  equal("P2 each step is asked with the window and the source; its lines kept; a throw costs its own", [seen, lines], [[["Cone of Cold", "Actor.orc", true]], ["Magical Retribution: an attack of opportunity."]]);
  equal("P3 a malformed step is refused", [api.registerPendingCastStep("x", null), api.registrationProblems().length], [false, 1]);
  const interrupt = between(src.pcw, "export async function interruptPendingCast(", "\n/**\n * Watch for");
  ok("P4 the interruption awaits the steps BEFORE it settles, and puts their lines on its card",
    interrupt.indexOf("await pendingCastStepsBefore({") > 0 && interrupt.indexOf("await pendingCastStepsBefore({") < interrupt.indexOf('const settled = await settle(actor, "interrupted"')
    && interrupt.includes("...stepLines.map((text) => line(text)),"));
  ok("P5 the damage primitive notes the source before the hit points move",
    src.dyw.indexOf("noteDamageSource(actor, { sourceUuid, sourceName, context });") > 0
    && src.dyw.indexOf("noteDamageSource(actor, { sourceUuid, sourceName, context });") < src.dyw.indexOf("const result = await applyDamageAndCheckDyingInner(actor, damage"));
}

// ── The API ─────────────────────────────────────────────────────────────
ok("A1 the four registrations are exposed, and their contracts documented",
  ["registerFumbleModifier", "registerResonanceModifier", "registerChargedItemRule", "registerPendingCastStep"].every((n) => new RegExp(`${n}: \\(key, \\w+, moduleId\\) => ${n}\\(key, \\w+, moduleId\\)`).test(src.apiw))
  && /A FUMBLE MODIFIER \(3\.684\.0/.test(src.apim) && /A CHARGED-ITEM RULE \(3\.684\.0/.test(src.apim) && /SHAPE the cast instead/.test(src.apim));

if (failures.length) {
  process.stdout.write(`verify-ea-block6b-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block6b-core: OK — ${checks} checks.\n`);
