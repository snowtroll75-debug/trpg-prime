#!/usr/bin/env node
/**
 * verify-block9a-core — TRG Prime 3.688.0: the seams Eldritch Arts' Block 9a
 * (the catalysts, the four catalyst feats and the special materials) needs,
 * from its audit (ELDRITCH_ARTS_BLOCK9_AUDIT.md §6) as Graham answered it on
 * 13 November 2026 ("Go with your recommendation for all questions and
 * proceed": Q185–Q210; H19–H25 approved).
 *
 *   H19 an item a module offers at the cast (`registerCastItemOption`): one
 *       choice per kind on a prompt of its own before the cost test, folded
 *       into the channels a module metamagic's answer uses, a check modifier,
 *       the spell attack, an ignored resistance; spent once the cast has
 *       settled unless kept; reported on `trgPrimeSpellSettled`
 *   H20 a special material a module adds (`registerMaterial`): read wherever
 *       the core's are (`materialOf`), the core's winning a clash; its
 *       `declares` read as a rune's; its `weaponDamageVs` added to a strike
 *       as Bane's dice are
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
const quiet = (fn) => async (...a) => { const e = console.error; console.error = () => {}; try { return await fn(...a); } finally { console.error = e; } };

// The prompt is answered by the test: `nextForm` is what the caster chose
// (null for a closed prompt); `prompts` counts the prompts shown.
let nextForm = {};
let prompts = 0;
let lastPrompt = null;
globalThis.foundry = { applications: { api: { DialogV2: { prompt: async (cfg) => { prompts += 1; lastPrompt = cfg; return nextForm; } } }, ux: {} } };
const warnings = [];
globalThis.ui = { notifications: { warn: (m) => warnings.push(m) } };

const api = await imp("module-api.mjs");
const ci = await imp("magic/cast-items.mjs");
const ciw = await imp("magic/cast-items-workflow.mjs");
const iq = await imp("item-quality.mjs");
const rd = await imp("rune-damage.mjs");
const rdecl = await imp("rune-declarations.mjs");
const cw = read("module", "magic", "cast-workflow.mjs");
const apw = read("module", "module-api-workflow.mjs");
const apiSrc = read("module", "module-api.mjs");
const sys = JSON.parse(read("system.json"));

/** A caster with items by id; `updates` and `deleted` record the spends. */
function caster(items) {
  const updates = [];
  const deleted = [];
  const docs = items.map((i) => ({
    ...i, system: { ...(i.system ?? {}) },
    update: async (u) => { updates.push([i.id, u]); },
    delete: async () => { deleted.push(i.id); }
  }));
  return { actor: { name: "Caster", items: { get: (id) => docs.find((d) => d.id === id) ?? null, [Symbol.iterator]: () => docs[Symbol.iterator]() } }, updates, deleted };
}

/* ================================================================== H19 */
{
  api.resetModuleRegistry();
  ok("H19 a kind needs a key, a label, offers and apply",
    api.registerCastItemOption("", { label: "C", offers: () => [], apply: () => ({}) }) === false
    && api.registerCastItemOption("c", { offers: () => [], apply: () => ({}) }) === false
    && api.registerCastItemOption("c", { label: "C", apply: () => ({}) }) === false
    && api.registerCastItemOption("c", { label: "C", offers: () => [] }) === false);
  ok("H19 …and settle, if given, must be a function",
    api.registerCastItemOption("c", { label: "C", offers: () => [], apply: () => ({}), settle: true }) === false
    && api.registerCastItemOption("c", { label: "C", offers: () => [], apply: () => ({}) }) === true
    && api.registerCastItemOption("d", { label: "D", offers: () => [], apply: () => ({}), settle: () => ({}) }) === true);
  equal("H19 the kinds are listed in registration order, keys lower-cased",
    (api.registerCastItemOption("Catalyst", { label: "Catalyst", offers: () => [], apply: () => ({}) }), api.registeredCastItemOptions().map((r) => [r.key, r.spec.label, typeof r.spec.settle])),
    [["c", "C", "object"], ["d", "D", "function"], ["catalyst", "Catalyst", "object"]]);
  ok("H19 the module API exposes it", /registerCastItemOption: \(key, spec, moduleId\) => registerCastItemOption\(key, spec, moduleId\),/.test(apw)
    && /registerCastOption, registerCastItemOption, registerMaterial, registerDispelModifier,/.test(apw));
  ok("H19 and documents its contract", /AN ITEM A MODULE OFFERS AT THE CAST \(3\.688\.0; Eldritch Arts Block 9a, H19/.test(apiSrc)
    && /`settle\(ctx\)` \(with `item`, `offer`, `degree`, `cast`, `check`, `natural`,/.test(apiSrc));

  // Offers, cleaned against the caster's items.
  const items = { a: { id: "a", name: "Leydust", system: { quantity: 2 } }, z: { id: "z", name: "Empty", system: { quantity: 0 } }, s: { id: "s", name: "Shield", system: {} } };
  const itemOf = (id) => items[id] ?? null;
  equal("H19 an offer must name a held item; a spent one needs one left; duplicates keep the first; the item's name by default",
    ci.cleanCastItemOffers([{ itemId: "a" }, { itemId: "a", label: "again" }, { itemId: "nope" }, { itemId: "z" }, { itemId: "z", consume: false, label: "Embedded", hint: "1/day" }, { itemId: "" }, null], itemOf),
    [{ itemId: "a", label: "Leydust", hint: "", consume: true }, { itemId: "z", label: "Embedded", hint: "1/day", consume: false }]);
  equal("H19 no offers, or not a list: none", [ci.cleanCastItemOffers(null, itemOf), ci.cleanCastItemOffers({}, itemOf)], [[], []]);

  // The answer, cut to what an item may do.
  const a = ci.cleanCastItemAnswer({
    mods: { damageDice: "1d8" }, checkBias: "advantage", discount: { pp: 1, floor: 1 }, addTraits: ["Electricity"],
    addedDamage: [{ dice: "2d6", type: "Essence" }, { dice: "x", type: "fire" }], saveDC: [{ value: 2, label: "Moonveil" }],
    rangeFactor: 1.5, dieStep: 1, lines: ["one"],
    dcDelta: 5, apDelta: 2, savingStep: 2, basePPAdd: 4, freeWarpPP: 3, fumbleBias: "advantage",
    targets: { extra: [{ tokenUuid: "T" }] },
    checkModifiers: [{ label: "Leydust", value: 2 }, { value: 0 }], attack: 2, ignoreResistance: "Fire"
  });
  equal("H19 the metamagic answer's own keys come through",
    [a.mods, a.checkBias, a.discount, a.addTraits, a.addedDamage, a.saveDC, a.rangeFactor, a.dieStep, a.lines],
    [{ damageDice: "1d8" }, "advantage", { pp: 1, floor: 1, label: "" }, ["Electricity"], [{ dice: "2d6", type: "essence", label: "" }], [{ value: 2, type: "untyped", label: "Moonveil" }], 1.5, 1, ["one"]]);
  equal("H19 …but no Casting DC, AP, saving step, base PP, free warp, fumble bias or targets",
    [a.dcDelta, a.apDelta, a.savingStep, a.basePPAdd, a.freeWarpPP, a.fumbleBias, a.extra], [0, 0, 0, 0, 0, "", []]);
  equal("H19 and its own three: a check modifier (an item bonus by default), the attack, the ignored resistance",
    [a.checkModifiers, a.attack, a.attackType, a.ignoreResistance], [[{ label: "Leydust", value: 2, type: "item" }], 2, "item", ["fire"]]);
  equal("H19 a metamagic's ppDelta is not an item's discount (nor its PP)", [ci.cleanCastItemAnswer({ ppDelta: -3 }).discount, ci.cleanCastItemAnswer({ basePPAdd: 2, freeWarpPP: 2 }).basePPAdd], [null, 0]);
  equal("H19 an answer may cancel the cast", ci.cleanCastItemAnswer({ cancel: true, reason: "not here" }), { cancel: true, reason: "not here" });

  // The form and the prompt.
  const kinds = [{ key: "catalyst", label: "Catalyst", offers: [{ itemId: "a", label: "Leydust", hint: "+2", consume: true }] }];
  equal("H19 the form names one item per kind; none, or one not offered, is no choice",
    [ci.readCastItemForm(kinds, { "castItem-catalyst": "a" }).map((p) => p.offer.itemId), ci.readCastItemForm(kinds, { "castItem-catalyst": "" }), ci.readCastItemForm(kinds, { "castItem-catalyst": "zz" })],
    [["a"], [], []]);
  const html = ci.castItemPromptHTML(kinds);
  ok("H19 the prompt offers None first, selected, then each item with its hint",
    /<select name="castItem-catalyst"><option value="" selected>None<\/option><option value="a">Leydust — \+2<\/option><\/select>/.test(html));
  equal("H19 kept: a consume:false offer always, otherwise only when settle says keep",
    [ci.castItemKept({ consume: false }, {}), ci.castItemKept({ consume: true }, { keep: true }), ci.castItemKept({ consume: true }, { keep: "yes" }), ci.castItemKept({ consume: true }, null)],
    [true, true, false, false]);
  equal("H19 spending one: the quantity less one, or delete the last",
    [ci.spentQuantity({ system: { quantity: 3 } }), ci.spentQuantity({ system: { quantity: 1 } }), ci.spentQuantity({ system: {} })], [2, null, null]);

  // The live half: ask, fold, settle.
  api.resetModuleRegistry();
  const seen = [];
  api.registerCastItemOption("catalyst", {
    label: "Catalyst",
    offers: (ctx) => { seen.push(["offers", ctx.spell.name, Boolean(ctx.actor)]); return [{ itemId: "a" }, { itemId: "b", label: "Dragonbone Dust" }]; },
    apply: (ctx) => {
      seen.push(["apply", ctx.item?.id, ctx.offer?.itemId]);
      return ctx.item.id === "a"
        ? { checkModifiers: [{ value: 2 }], lines: ["+2 to the Spellcraft check"] }
        : { mods: { damageDice: "1d6" }, saveDC: [{ value: 2 }], discount: { pp: 1, floor: 1 }, checkBias: "advantage", addTraits: ["Fire"], attack: 2, ignoreResistance: ["fire"], dieStep: 1 };
    },
    settle: (ctx) => { seen.push(["settle", ctx.degree, ctx.item?.id]); return ctx.degree === "critical" ? { keep: true, lines: ["Kept."] } : { lines: [`Backlash: ${ctx.degree}.`] }; }
  });
  api.registerCastItemOption("silent", { label: "Silent", offers: () => [], apply: () => ({}) });
  const c = caster([{ id: "a", name: "Leydust", system: { quantity: 2 } }, { id: "b", name: "Dragonbone Dust", system: { quantity: 1 } }]);

  prompts = 0; nextForm = { "castItem-catalyst": "b" };
  const got = await ciw.askCastItems(c.actor, { spell: { name: "Fire Bolt" } });
  equal("H19 one prompt, for the kind with offers only", [prompts, /Catalyst/.test(lastPrompt.window.title), /castItem-silent/.test(lastPrompt.content)], [1, true, false]);
  equal("H19 the chosen one is applied with its item and offer", seen.filter((s) => s[0] === "apply"), [["apply", "b", "b"]]);
  equal("H19 its answer folds as a metamagic's: dice, Save DC rows, discount, bias, traits, die step",
    [got.agg.mods, got.agg.saveDCRows.map((r) => [r.value, r.label]), got.agg.discounts.map((d) => [d.pp, d.floor, d.label]), got.agg.checkBias, got.agg.addTraits, got.agg.dieStep],
    [{ damageDice: "1d6" }, [[2, "Dragonbone Dust"]], [[1, 1, "Dragonbone Dust"]], "advantage", ["Fire"], 1]);
  equal("H19 …the attack row and ignored resistance beside it",
    [got.attackRows, got.ignoreResistance], [[{ label: "Dragonbone Dust", value: 2, type: "item" }], ["fire"]]);
  equal("H19 the aggregate reports no metamagic: no keys, no taken, no PP",
    [got.agg.keys, got.agg.taken, got.agg.ppSpent, got.agg.notes], [[], [], 0, []]);
  equal("H19 the card says which was used", got.lines, ["<strong>Catalyst:</strong> Dragonbone Dust."]);

  nextForm = { "castItem-catalyst": "a" };
  const lead = await ciw.askCastItems(c.actor, { spell: { name: "Fire Bolt" } });
  equal("H19 a check modifier takes the item's label", lead.checkModifiers, [{ label: "Leydust", value: 2, type: "item" }]);
  equal("H19 a module's lines reach the card as written", lead.lines, ["<strong>Catalyst:</strong> Leydust.", "+2 to the Spellcraft check"]);

  nextForm = {};
  const none = await ciw.askCastItems(c.actor, { spell: { name: "Fire Bolt" } });
  equal("H19 None chosen: nothing", [none.chosen.length, none.lines], [0, []]);
  nextForm = null;
  equal("H19 a closed prompt cancels the cast", await ciw.askCastItems(c.actor, { spell: { name: "Fire Bolt" } }), null);

  api.resetModuleRegistry();
  api.registerCastItemOption("catalyst", { label: "Catalyst", offers: () => [], apply: () => ({}) });
  prompts = 0;
  const bare = await ciw.askCastItems(c.actor, { spell: { name: "Fire Bolt" } });
  equal("H19 no offers: no prompt, nothing chosen", [prompts, bare.chosen.length], [0, 0]);

  api.resetModuleRegistry();
  api.registerCastItemOption("catalyst", { label: "Catalyst", offers: () => [{ itemId: "a" }], apply: () => ({ cancel: true, reason: "the spell has no damage" }) });
  nextForm = { "castItem-catalyst": "a" }; warnings.length = 0;
  equal("H19 an answer that cancels stops the cast, and says why", [await ciw.askCastItems(c.actor, { spell: { name: "Shield" } }), warnings], [null, ["Shield: the spell has no damage."]]);

  api.resetModuleRegistry();
  api.registerCastItemOption("catalyst", { label: "Catalyst", offers: () => [{ itemId: "a" }], apply: () => { throw new Error("x"); } });
  const thrown = await quiet(ciw.askCastItems)(c.actor, { spell: { name: "Shield" } });
  equal("H19 an apply that throws costs its own item, which is not used (or spent)", [thrown.chosen.length, /failed — see the console\. It is not spent\./.test(thrown.lines[0])], [0, true]);
  api.registerCastItemOption("offersboom", { label: "Boom", offers: () => { throw new Error("y"); }, apply: () => ({}) });
  equal("H19 an offers that throws costs its own kind", (await quiet(ciw.askCastItems)(c.actor, { spell: { name: "Shield" } })).chosen.length, 0);

  // Settle and spend.
  api.resetModuleRegistry();
  const settles = [];
  const spec = {
    label: "Catalyst", offers: () => [], apply: () => ({}),
    settle: (ctx) => { settles.push([ctx.degree, ctx.item?.id, ctx.offer?.consume]); return ctx.degree === "critical" ? { keep: true, lines: ["Kept by Catalyst Conservation."] } : { lines: ["Backlash."] }; }
  };
  const s1 = caster([{ id: "a", name: "Leydust", system: { quantity: 2 } }, { id: "b", name: "Dust", system: { quantity: 1 } }, { id: "e", name: "Embedded", system: { quantity: 0 } }]);
  const chosen = (id, consume = true) => ({ key: "catalyst", kindLabel: "Catalyst", spec, offer: { itemId: id, consume }, itemId: id, itemName: id });
  const r1 = await ciw.settleCastItems(s1.actor, { chosen: [chosen("a"), chosen("b"), chosen("e", false)] }, { degree: "failure" });
  equal("H19 settle is asked of each, with the degree, item and offer", settles, [["failure", "a", true], ["failure", "b", true], ["failure", "e", false]]);
  equal("H19 one of each spent is spent (the last deleted); an embedded use is not",
    [s1.updates, s1.deleted, r1.report.map((r) => [r.itemId, r.kept])], [[["a", { "system.quantity": 1 }]], ["b"], [["a", false], ["b", false], ["e", true]]]);
  equal("H19 the card has the module's lines and says what was spent", r1.lines, ["Backlash.", "a is spent.", "Backlash.", "b is spent.", "Backlash."]);
  const s2 = caster([{ id: "a", name: "Leydust", system: { quantity: 2 } }]);
  const r2 = await ciw.settleCastItems(s2.actor, { chosen: [chosen("a")] }, { degree: "critical" });
  equal("H19 kept by settle: not spent", [s2.updates, s2.deleted, r2.report[0].kept, r2.lines], [[], [], true, ["Kept by Catalyst Conservation."]]);
  const boom = { ...spec, settle: () => { throw new Error("z"); } };
  const s3 = caster([{ id: "a", name: "Leydust", system: { quantity: 2 } }]);
  const r3 = await quiet(ciw.settleCastItems)(s3.actor, { chosen: [{ ...chosen("a"), spec: boom }] }, { degree: "success" });
  equal("H19 a settle that throws still spends it (it was used), and says so", [s3.updates.length, /settle step failed/.test(r3.lines[0]), r3.lines[1]], [1, true, "a is spent."]);
  const s4 = caster([{ id: "a", name: "Leydust", system: { quantity: 2 } }]);
  const r4 = await ciw.settleCastItems(s4.actor, { chosen: [{ ...chosen("a"), spec: { ...spec, settle: null } }] }, { degree: "success" });
  equal("H19 no settle: spent", [s4.updates.length, r4.lines], [1, ["a is spent."]]);
  const once = { chosen: [chosen("a")] };
  const s6 = caster([{ id: "a", name: "Leydust", system: { quantity: 3 } }]);
  await ciw.settleCastItems(s6.actor, once, { degree: "success" });
  const again = await ciw.settleCastItems(s6.actor, once, { degree: "success" });
  equal("R5 settled once: the second call (the ritual after its cast) does nothing", [s6.updates.length, again.lines, once.settled], [1, [], true]);
  settles.length = 0;
  const s5 = caster([{ id: "a", name: "Leydust", system: { quantity: 2 } }]);
  const r5 = await ciw.settleCastItems(s5.actor, { chosen: [chosen("a")] }, { degree: "failure", refunded: true });
  equal("H19 a refunded cast (called off) settles nothing and spends nothing, and says so (review)", [settles.length, s5.updates.length, s5.deleted.length, r5.lines, r5.report[0].kept], [0, 0, 0, ["a is not spent: the cast was called off."], true]);
  ok("H19 the cast's refund reaches the settle", /spell, spellData, degree, cast: Boolean\(outcome\.cast\), refunded: Boolean\(castRefunded\), check,/.test(cw));

  // The wiring in castSpell.
  ok("H19 offered only to a cast that rolls its own check: not an item, innate, ritual, stored, storing or threaded cast, nor one whose check is a Strike's (review), nor a non-attack cantrip",
    /const castItemsOffered = !\(isItemCast \|\| isInnate \|\| ritual \|\| stored \|\| storingNow \|\| threaded \|\| strikeCheck \|\| \(isCantrip && !isAttack\)\);/.test(cw));
  const askAt = cw.indexOf("const castItems = ritual?.castItems");
  ok("H19 asked after the PP as cast are known, before the rod, the cost test and the payment discount",
    askAt > cw.indexOf("const castPP = castRiderPP({") && askAt < cw.indexOf("const rodCandidate = (isCantrip") /* RE-ANCHORED AT 3.691.0 */
    && askAt < cw.indexOf("const costCut = (isItemCast") && askAt < cw.indexOf("const ppSources = (isCantrip"));
  ok("H19 the ask is told the cast's facts", /\? await askCastItems\(actor, \{\n\s*spell, spellData, basePP, totalPP, castPP, tradition, traditions: hmTraditions\.traditions, traits: castContext\.traits,/.test(cw));
  ok("H19 a closed prompt returns the cast", /if \(castItems === null\) return null;/.test(cw));
  // A RITUAL'S CAST ITEMS (3.688.1; Graham's ruling on Q186: "Catalysts should be offered for rituals").
  const rit = cw.slice(cw.indexOf("export async function rollMagicRitual"));
  ok("R1 a ritual's cast uses the items its ritual asked", /const castItems = ritual\?\.castItems\n\s*\? ritual\.castItems\n\s*: castItemsOffered/.test(cw));
  ok("R2 a ritual asks its primary before the roll, at the PP as cast, told it is a ritual; a closed prompt stops it",
    rit.indexOf("const ritualCastItems = await askCastItems(actor, {") > 0 && rit.indexOf("const ritualCastItems = await askCastItems(actor, {") < rit.indexOf("const check = await TRGCheck.roll({")
    && /spell, spellData, basePP, totalPP: basePP \+ ppOver, castPP: basePP \+ ppOver, tradition: ritualTradition,/.test(rit)
    && /targets: Array\.from\(game\.user\?\.targets \?\? \[\]\), ritual: true,\n[\s\S]{0,400}?variant: String\(ritualPlan\.variant \?\? ""\), durationUnaltered: Boolean\(result\.durationUnaltered\)(?:,\n(?:\s*\/\/[^\n]*\n)*\s*checkSkill: String\(ritualPlan\.skill\?\.key \?\? ""\))?\n\s*\}\);\n\s*if \(ritualCastItems === null\) return null;/.test(rit)); // RE-ANCHORED AT 3.692.0: the check skill may follow
  ok("R3b their lines go on the ritual's card, once (cleared before the cast's card)", /const lines = \[\.\.\.ritualCastItems\.lines\.map\(\(text\) => line\(text\)\), /.test(rit) && /\n  ritualCastItems\.lines = \[\];\n/.test(rit));
  ok("R3 their rows and bias reach the ritual check, once", /modifiers\.push\(\.\.\.ritualCastItems\.checkModifiers\);/.test(rit)
    && /\.\.\.\(ritualCastItems\.agg\.checkBias \? \{ bias: ritualCastItems\.agg\.checkBias \} : \{\}\),/.test(rit)
    && rit.indexOf("ritualCastItems.checkModifiers = [];") > rit.indexOf("const check = await TRGCheck.roll({") && /ritualCastItems\.agg\.checkBias = "";/.test(rit));
  ok("R4 handed to the cast; settled here when the cast did not", /gated: \{ modifiers: ritualGated\.modifiers, lines: \[\] \}, castItems: ritualCastItems \}/.test(rit)
    && /if \(ritualCastItems\.chosen\.length && !ritualCastItems\.settled\) \{\n\s*const settledHere = await settleCastItems\(actor, ritualCastItems, \{ degree, cast: false, castPP: basePP \+ ppOver,/.test(rit)
    && rit.indexOf("!ritualCastItems.settled") > rit.indexOf("castResult = await castSpell(actor, spell, {"));
  ok("H19 folded as a module metamagic's: the warp channel, the check's bias, the discounts, the traits",
    /castItems\.lines\.push\(\.\.\.foldModuleMetamagicMods\(warpMods, castItems\.agg, \{ duration: spellData\.duration, range: effRange, area: effArea \}\)\.lines\);/.test(cw)
    && /if \(castItems\.agg\.checkBias\) mmx\.checkBias = joinItemBias\(mmx\.checkBias, castItems\.agg\.checkBias\) \|\| mmx\.checkBias;/.test(cw)
    && /if \(castItems\.agg\.discounts\.length\) mmx\.discounts = \[\.\.\.\(mmx\.discounts \?\? \[\]\), \.\.\.castItems\.agg\.discounts\];/.test(cw)
    && /if \(castItems\.agg\.addTraits\.length\) castContext\.traits = withItemTraits\(castContext\.traits, castItems\.agg\.addTraits\);/.test(cw));
  ok("H19 …before the bias is read and the discount is taken",
    askAt < cw.indexOf("if (mmx.checkBias && !noCheckCantrip) {") && askAt < cw.indexOf("}, mmx.discounts);"));
  ok("H19 its check modifiers join the situational ones", /for \(const mod of castItems\.checkModifiers\) situational\.push\(\{ label: mod\.label, value: mod\.value, type: mod\.type \}\);/.test(cw));
  ok("H19 its ignored resistance is set after the boost clears the bypass, joined with the boost's",
    cw.indexOf("setResistanceBypass([...new Set([...(boost?.ignoreResistance ? boost.types : []), ...castItems.ignoreResistance])]);") > cw.indexOf("    clearResistanceBypass();"));
  equal("H19 its attack rows join both spell-attack resolutions",
    cw.split("...(castOptionsApplied.attackRows ?? []), ...castItems.attackRows, ...gateAttackOnlyRows],").length - 1, 2);
  ok("H19 its lines lead the cast's card", /const lines = \[\.\.\.castItems\.lines\.map\(\(text\) => line\(text\)\), \.\.\.reagentLines, \.\.\.gateLines,/.test(cw));
  const settleAt = cw.indexOf("const castItemsSettled = castItems.chosen.length");
  ok("H19 settled after the module metamagic's, before trgPrimeSpellSettled, with the degree and the cast's facts",
    settleAt > cw.indexOf("const settledLines = await mmxWorkflow.settleModuleMetamagic(") && settleAt < cw.indexOf("Hooks.callAll(\"trgPrimeSpellSettled\", {")
    && /\? await settleCastItems\(actor, castItems, \{\n\s*spell, spellData, degree, cast: Boolean\(outcome\.cast\), refunded: Boolean\(castRefunded\), check,/.test(cw));
  ok("H19 trgPrimeSpellSettled reports them", /castItems: castItemsSettled\.report,/.test(cw));
}

/* ================================================================ RITUAL */
{
  // A RITUAL'S ROLL, SETTLED (3.688.0): Blood-etched Vellum is answered for on any ritual it helped roll.
  api.resetModuleRegistry();
  const rr = await imp("magic/ritual-rules.mjs");
  const got = [];
  ok("RITUAL settled(ctx) is a ritual-rules function", api.registerRitualRules("vellum", { settled: (ctx) => { got.push([ctx.degree, ctx.cast, ctx.pp]); return { lines: ["Vellum spent."] }; } }) === true);
  api.registerRitualRules("boom", { settled: () => { throw new Error("x"); } });
  const lines = await quiet(rr.settleRitual)({ degree: "partial", cast: false, pp: 7 });
  equal("RITUAL every module's settled, joined; one that throws says so", [got, lines[0], /failed after the roll/.test(lines[1])], [[["partial", false, 7]], "Vellum spent.", true]);
  ok("RITUAL asked after the roll and the cast, whatever came of it, with the PP as cast and whether the cast settled",
    cw.indexOf("const ritualSettledLines = await settleRitual({") > cw.indexOf("castResult = await castSpell(actor, spell, {")
    && /\.\.\.ritualContext, degree, rawDegree, cast, partialCasts, settled: \(cast \|\| consequences\) \? castResult !== null : true,\n\s*pp: basePP \+ ppOver,/.test(cw)
    && /if \(ritualSettledLines\.length\) await postCard\(actor, `\$\{spell\.name\} — Magic Ritual`, ritualSettledLines\.map\(\(text\) => line\(text\)\)\);/.test(cw));
  ok("RITUAL the API documents it", /settled\(ctx\)   → once the ritual's roll is resolved, whatever its degree/.test(apiSrc));
}

/* ================================================================== H20 */
{
  api.resetModuleRegistry();
  ok("H20 a material needs a key of letters and digits and a label",
    api.registerMaterial("", { label: "X" }) === false && api.registerMaterial("ash bone", { label: "X" }) === false
    && api.registerMaterial("1x", { label: "X" }) === false && api.registerMaterial("ashbone", {}) === false);
  ok("H20 the module API exposes it", /registerMaterial: \(key, spec, moduleId\) => registerMaterial\(key, spec, moduleId\),/.test(apw));
  api.registerMaterial("ashbone", {
    label: "Ashbone", rarity: "Uncommon", levelDelta: 2, appliesTo: ["weapon", "armour", "shield"],
    weightPercent: -50, overcomesResistance: "silver", armourAcpReduction: 1, armourMaxDexBonus: 1, armourSpeedPenaltyReduction: 5
  });
  api.registerMaterial("graveiron", {
    label: "Graveiron", levelDelta: 2, appliesTo: ["weapon", "armour", "shield"], overcomesResistance: "silver",
    weaponDamageVs: [{ dice: "1", against: ["undead"], label: "Graveiron" }],
    declares: { conditionals: [{ kind: "modifier", value: 1, type: "item", label: "vs disease, paralysis, soul drain", scope: { checkTypes: ["save"], subjects: ["fortitude"] } }] }
  });
  api.registerMaterial("starion", { label: "Starion", levelDelta: 4, appliesTo: ["weapon"], weaponDamageVs: [{ dice: "die", against: ["eternal"] }], weaponGrantsTrait: "Keen" });
  api.registerMaterial("mithril", { label: "Not Mithril", levelDelta: 99, appliesTo: ["weapon"] });
  api.registerMaterial("bare", { label: "Bare", appliesTo: ["armour"], declares: {} });
  api.registerMaterial("bloodglass", { label: "Bloodglass", appliesTo: ["armour"],
    declaresByType: { armour: { conditionals: [{ kind: "modifier", value: 1, type: "item", label: "vs essence", scope: { checkTypes: ["save"], traits: ["essence"] } }] } } });

  equal("H20 materialOf: the core's, a module's, nothing", [iq.materialOf("coldIron")?.label, iq.materialOf("ashbone")?.label, iq.materialOf("nope"), iq.materialOf("")], ["Cold Iron", "Ashbone", null, null]);
  equal("H20 a module cannot redefine a core material: refused, and the core's is read", [iq.materialOf("mithril").label, iq.computeEffectiveLevel(3, "standard", "mithril"), api.registeredMaterial("mithril")], ["Mithril", 7, null]);
  equal("H20 the sheet shows a module material's note under the Material line (review)",
    [/context\.materialNote = material \? String\(materialOf\(material\)\?\.note \?\? ""\)\.trim\(\) : "";/.test(read("module", "sheets", "item-sheet.mjs")), read("templates", "item", "item-sheet.hbs").split("{{#if materialNote}}<span class=\"hint trg-material-note\">{{materialNote}}</span>{{/if}}").length - 1], [true, 3]);
  ok("H20 the pickers offer a module's material where it applies, after the core's",
    iq.applicableMaterials("weapon").map((m) => m.key).join(",").endsWith("ashbone,graveiron,starion")
    && !iq.applicableMaterials("armour").some((m) => m.key === "starion")
    && iq.applicableMaterials("armour").some((m) => m.key === "ashbone"));
  equal("H20 its level delta raises the item's level", iq.computeEffectiveLevel(3, "standard", "ashbone"), 5);
  const arm = iq.computeArmourModifiers("standard", "ashbone", []);
  equal("H20 its armour properties: ACP, Max Dex, weight, Speed (Q193: −1, +1, −5)", [arm.acpDelta, arm.maxDexBonus, arm.weightPercent, arm.speedPenaltyDelta], [1, 1, -50, 5]);
  const wpn = iq.computeWeaponModifiers("standard", "starion", []);
  equal("H20 its weapon properties: a granted trait", wpn.grantedTraits, ["Keen"]);
  equal("H20 what it overcomes: silver (Ashbone and Graveiron: \"treated as silvered\")",
    [iq.materialDefenceWord("ashbone"), iq.materialDefenceWord("graveiron"), iq.materialDefenceWord("starion")], ["silver", "silver", "starion"]);
  equal("H20 the sheet and the oil read its label", [/materialOf\(material\)\?\.label \?\? material/.test(read("module", "sheets", "item-sheet.mjs")), /return materialOf\(key\)\?\.label \?\? String\(key \?\? ""\);/.test(read("module", "oil-workflow.mjs"))], [true, true]);
  equal("H20 no reader of the core's table is left that would miss a module's: only materialOf and allMaterials index it",
    read("module", "item-quality.mjs").match(/MATERIALS\[[^\]]+\]/g), ["MATERIALS[k]", "MATERIALS[key]"]);

  // weaponDamageVs, as Bane's dice.
  const undead = { details: { creatureType: "undead" } };
  const sword = (material, damage = "1d8") => ({ type: "weapon", name: "Sword", system: { material, damage, runes: "" } });
  const gi = rd.runeDamageFor(sword("graveiron"), { target: undead });
  ok("H20 against a matching creature it is added to the strike, flat or a die of its own",
    gi.length === 1 && gi[0].addsToStrike && gi[0].resolved && gi[0].dice === "1" && gi[0].type === "" && gi[0].label === "Graveiron", JSON.stringify(gi));
  const wolf = { details: { creatureType: "animal" } };
  const giWolf = rd.runeDamageFor(sword("graveiron"), { target: wolf });
  equal("H20 …but not against another, and the card says why", [giWolf[0].applies, giWolf[0].why, rd.runeDamageLine(giWolf[0], 0)], [false, "it is not undead", "<strong>Graveiron (undead)</strong> — no extra damage: it is not undead."]);
  const noTarget = rd.runeDamageFor(sword("graveiron"));
  equal("H20 with no target it is said, not rolled", [noTarget[0].resolved, rd.runeDamageLine(noTarget[0], 0)], [false, "<strong>Graveiron</strong> — 1 extra damage against undead. Apply if it applies."]);
  const st = rd.runeDamageFor(sword("starion", "1d10"), { target: { details: { traits: "Eternal, Medium" } } });
  equal("H20 \"an additional die of base damage\": the weapon's own die", [st[0].dice, st[0].applies], ["1d10", true]);
  equal("H20 nothing for a material without the rows, nor for ammunition", [rd.runeDamageFor(sword("ashbone")).length, rd.runeDamageFor({ type: "ammunition", system: { material: "graveiron" } }, { target: undead }).length], [0, 0]);

  // declares, as a rune's.
  const plate = (equipped) => ({ type: "armour", name: "Graveiron Mail", system: { material: "graveiron", equipped, runes: "", category: "medium" } });
  const on = rdecl.runeDeclaredBonuses(plate(true), [plate(true)]);
  equal("H20 a material's declares are read as a rune's while the item counts", on.conditionals.map((c) => [c.label, c.value, c.scope.subjects]), [["Graveiron Mail (Graveiron) — vs disease, paralysis, soul drain", 1, ["fortitude"]]]);
  equal("H20 …and not while it does not (unequipped)", rdecl.runeDeclaredBonuses(plate(false), [plate(false)]).conditionals, []);
  equal("H20 a material that declares nothing adds no entry (none, or an empty one)",
    [rdecl.activeDeclaredRunesOn({ type: "armour", system: { material: "ashbone", equipped: true, runes: "" } }, []), rdecl.activeDeclaredRunesOn({ type: "armour", system: { material: "bare", equipped: true, runes: "" } }, [])], [[], []]);
  const bgArmour = { type: "armour", name: "Bloodglass Mail", system: { material: "bloodglass", equipped: true, runes: "" } };
  const bgSword = { type: "weapon", name: "Bloodglass Sword", system: { material: "bloodglass", equipped: true, runes: "" } };
  equal("H20 declaresByType: read for the item's own type, and nothing for a type it does not name",
    [rdecl.runeDeclaredBonuses(bgArmour, [bgArmour]).conditionals.map((c) => c.label), rdecl.activeDeclaredRunesOn(bgSword, [])],
    [["Bloodglass Mail (Bloodglass) — vs essence"], []]);
  equal("H20 the API documents declaresByType", /declaresByType \{ weapon\?, armour\?, shield\? \}/.test(apiSrc), true);
  equal("H20 a core material is unchanged by it (declares nothing)", rdecl.activeDeclaredRunesOn({ type: "armour", system: { material: "mithril", equipped: true, runes: "" } }, []), []);
  ok("H20 the module API documents its contract", /A SPECIAL MATERIAL A MODULE ADDS \(3\.688\.0; Eldritch Arts Block 9a, H20/.test(apiSrc)
    && /weaponDamageVs \[\{ dice: "die" \| "<n>" \| "<NdM>", against: \[words\], label \}\]/.test(apiSrc));
}

/* ================================================================== Z */
equal("Z1 the version is 3.690.0, and the download names it", [sys.version, sys.download],
  ["3.715.1", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.715.1/trg-prime.zip"]);
equal("Z2 package.json agrees", JSON.parse(read("package.json")).version, "3.715.1");

api.resetModuleRegistry();
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`verify-block9a-core: ${failures.length} failure(s) of ${checks}`);
  process.exit(1);
}
console.log(`verify-block9a-core: all ${checks} checks pass`);
