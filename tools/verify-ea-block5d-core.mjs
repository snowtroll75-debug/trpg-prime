#!/usr/bin/env node
/**
 * verify-ea-block5d-core — TRG Prime 3.683.0, group d of the seams Eldritch
 * Arts' Block 5 (racial and general feats) needs, from the Block 5 audit
 * (docs/ELDRITCH_ARTS_BLOCK5_AUDIT.md in the module), answered by Graham on
 * 3 November 2026 ("As proposed except" Q58 and Q59; Q63, Q67, Q84–Q86, Q88
 * as proposed).
 *
 *   D   C9, D10: registerDispelModifier — PP factor, reduction and
 *       replacement, difficulty, an own ladder, a Focus use, modifiers, and a
 *       rider on the result (Resonant Ascendance, Dispel Power, Threadbreaker's
 *       Precision, Mirrored Rebuke; Block 6's Runebreaker and Glyph Shatter)
 *   R   C10: trgPrimeActionResolved carries the resolved degree (Channel Siphoner)
 *   S   C11, a fix: Spell Recognition names its action and skill (Esoteric Insight)
 *   L   C12: a declared control-level bonus (Master Binder)
 *   M   C13: a prepared spell outside the memorisation count (Spell Thief)
 *   O   C14: the remap is told High Magic and the options; an option may cost AP
 *       (Runic Stabiliser)
 *   N   C15, D14's Sniping half: a spell attack's critical can open Sniping
 *       (Silent Spellstrike, Q86)
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
const dm = await imp("combat/dispel-modifiers.mjs");
const gso = await imp("general-skill-options-workflow.mjs");
const casting = await imp("magic/casting.mjs");
const mem = await imp("magic/memorisation.mjs");
const mw = await imp("magic/memorisation-workflow.mjs");
const co = await imp("magic/cast-options.mjs");
const hooks = await imp("magic/cast-hooks.mjs");
const sn = await imp("magic/spell-sniping.mjs");
const ca = await imp("combat/critical-adjust.mjs");
const cond = await imp("conditionals.mjs");
const fr = await imp("fumble-reroll.mjs");
const src = {
  action: read("module", "combat", "action-workflow.mjs"),
  apiw: read("module", "module-api-workflow.mjs"),
  feats: read("module", "feats-workflow.mjs"),
  actor: read("module", "documents", "actor.mjs"),
  memw: read("module", "magic", "memorisation-workflow.mjs"),
  cast: read("module", "magic", "cast-workflow.mjs")
};
// The body of one function, from its declaration to the next top-level one.
const bodyOf = (text, head) => { const at = text.indexOf(head); if (at < 0) return ""; const next = text.indexOf("\nasync function ", at + head.length); const next2 = text.indexOf("\nexport async function ", at + head.length); const ends = [next, next2].filter((n) => n > 0); return text.slice(at, ends.length ? Math.min(...ends) : undefined); };

// ── D: Dispel modifiers (C9, D10) ───────────────────────────────────────
api.resetModuleRegistry?.();
ok("D1 a modifier needs an offer function", (await quiet(async () => api.registerDispelModifier("x", {}))) === false);
ok("D2 …and an onResult, if given, must be one", (await quiet(async () => api.registerDispelModifier("x", { offer: () => null, onResult: 3 }))) === false);
equal("D3 with none registered nothing is offered (default-off)", await dm.offeredDispelModifiers({}), []);
const seen = [];
api.registerDispelModifier("Resonant Ascendance", { offer: (c) => { seen.push(c); return c.counterSpell ? { label: "Resonant Ascendance", ppFactor: 0.5 } : null; } }, "test");
api.registerDispelModifier("dispel power", { offer: () => ({ label: "Dispel Power", optional: true, ppReplace: 9, difficulty: "veryHard", focus: true, itemId: "dp1", outcomes: { critical: "You dispel the effect.", success: "You suppress the effect for 1 minute.", failure: "You fail to dispel the effect.", fumble: "You fail and trigger a resonance event." } }) }, "test");
api.registerDispelModifier("threadbreaker", { offer: () => ({ label: "Threadbreaker's Precision", modifiers: [{ value: 2, type: "racial" }] }), onResult: (c) => (c.countered ? { lines: [`Dazed: ${c.targetCaster?.name ?? "?"}`] } : null) }, "test");
api.registerDispelModifier("broken", { offer: () => { throw new Error("boom"); }, onResult: () => { throw new Error("boom"); } }, "test");
api.registerDispelModifier("unlabelled", { offer: () => ({ ppFactor: 0.25 }) }, "test");
api.registerDispelModifier("nonsense", { offer: () => ({ label: "Odd", ppFactor: 2, ppReduction: -3, ppReplace: "lots", difficulty: "impossible", focus: true }) }, "test");
const ctx = { actor: null, target: null, effect: "Fireball", declaredPP: null, counterSpell: true, presetDispel: { effectValue: 6 } };
const offers = await quiet(() => dm.offeredDispelModifiers(ctx));
equal("D4 every offer in order; a throwing or unlabelled one is not offered", offers.map((o) => o.key), ["resonant ascendance", "dispel power", "threadbreaker", "nonsense"]);
ok("D5 the offer is asked with the contract's ctx", ["actor", "target", "effect", "declaredPP", "counterSpell", "presetDispel"].every((k) => k in seen[0]) && seen[0].counterSpell === true);
const odd = offers.find((o) => o.key === "nonsense");
equal("D6 a factor of 1 or more, a negative reduction, an unreadable replacement, an auto step and a Focus with no item mean nothing",
  [odd.ppFactor, odd.ppReduction, odd.ppReplace, odd.difficulty, odd.focusItemId], [null, 0, null, "", ""]);
const tb = offers.find((o) => o.key === "threadbreaker");
equal("D7 a modifier row is labelled by its offer when it names no label", tb.modifiers, [{ label: "Threadbreaker's Precision", value: 2, type: "racial" }]);
equal("D8 an optional offer applies only when ticked; the rest always", [dm.appliedDispelOffers(offers, []).map((o) => o.key), dm.appliedDispelOffers(offers, ["Dispel Power"]).map((o) => o.key)],
  [["resonant ascendance", "threadbreaker", "nonsense"], ["resonant ascendance", "dispel power", "threadbreaker", "nonsense"]]);
equal("D9 an unavailable offer (a spent Focus use) never applies", dm.appliedDispelOffers([{ ...offers[1], unavailable: "spent" }], ["dispel power"]), []);
const dp = dm.combinedDispelModifiers(dm.appliedDispelOffers(offers.filter((o) => o.key === "dispel power"), ["dispel power"]));
equal("D10 Dispel Power combined: replacement, Very Hard, its ladder, its Focus item", [dp.ppReplace, dp.difficulty, dp.outcomes?.success, dp.focusItemIds, dp.modifierKeys], [9, "veryHard", "You suppress the effect for 1 minute.", ["dp1"], ["dispel power"]]);
const many = dm.combinedDispelModifiers([{ key: "a", label: "A", ppFactor: 0.5, ppReduction: 2, difficulty: "hard", modifiers: [] }, { key: "b", label: "B", ppFactor: 0.75, ppReduction: 1, difficulty: "veryHard", modifiers: [{ label: "B", value: 1, type: "circumstance" }] }]);
equal("D11 factors take the smallest, reductions sum, the hardest step wins, rows join", [many.ppFactor, many.ppReduction, many.difficulty, many.modifiers.length], [0.5, 3, "veryHard", 1]);
// The PP actually paid.
const pay = (degree, setup) => dm.dispelPPPaid(degree, { pp: 6, ...setup }).pp;
equal("D12 page 91 untouched: full on Success, half (up) on Critical and Partial", [pay("success", {}), pay("critical", {}), pay("partial", {}), dm.dispelPPPaid("critical", { pp: 5 }).pp, dm.dispelPPPaid("partial", { pp: 1 }).pp], [6, 3, 3, 3, 1]);
equal("D13 Q63: a half factor is half whatever the degree, and does not compound with the Critical's", [pay("success", { ppFactor: 0.5 }), pay("failure", { ppFactor: 0.5 }), pay("critical", { ppFactor: 0.5 }), dm.dispelPPPaid("fumble", { pp: 5, ppFactor: 0.5 }).pp], [3, 3, 3, 3]);
equal("D14 a factor dearer than the degree's own half: the cheaper is paid", pay("critical", { ppFactor: 0.75 }), 3);
equal("D15 Runebreaker: 2 PP less, never below 1", [pay("success", { ppReduction: 2 }), dm.dispelPPPaid("success", { pp: 2, ppReduction: 2 }).pp, dm.dispelPPPaid("success", { pp: 1, ppReduction: 2 }).pp, pay("critical", { ppReduction: 2 })], [4, 1, 1, 2]);
equal("D16 Dispel Power: no PP on any degree", ["critical", "success", "failure", "fumble"].map((d) => pay(d, { ppReplace: 9 })), [0, 0, 0, 0]);
equal("D17 an own ladder halves nothing on its Critical", pay("critical", { outcomes: { critical: "x" } }), 6);
equal("D18 the card's label says what was paid and why", [dm.dispelPPPaid("success", { pp: 6 }).label, dm.dispelPPPaid("critical", { pp: 6 }).label, dm.dispelPPPaid("success", { pp: 6, ppFactor: 0.5, modifierLabels: ["Resonant Ascendance"] }).label, dm.dispelPPPaid("success", { pp: 6, ppReplace: 9, modifierLabels: ["Dispel Power"] }).label],
  ["Dispel", "Dispel — half of 6", "Dispel (Resonant Ascendance) — half of 6", "Dispel (Dispel Power) — no PP"]);
equal("D19 the counteract value: the PP declared, or the replacement (Q84)", [dm.dispelCounteractValue({ pp: 6 }), dm.dispelCounteractValue({ pp: 6, ppReplace: 9 }), dm.dispelCounteractValue({ pp: 6, ppReplace: 0 })], [6, 9, 0]);
equal("D20 countered: a counter at Success or better", [dm.dispelCountered(true, "success"), dm.dispelCountered(true, "heroic"), dm.dispelCountered(true, "partial"), dm.dispelCountered(false, "critical")], [true, true, false, false]);
const ladder = dm.dispelActionWithLadder({ key: "dispel", outcomes: { success: "page 91" } }, { outcomes: { success: "suppress" } });
equal("D21 an own ladder replaces Dispel's rows; another action, or none, is left alone", [ladder.outcomes.success, dm.dispelActionWithLadder({ key: "dispel", outcomes: { success: "page 91" } }, {}).outcomes.success, dm.dispelActionWithLadder({ key: "rechargeItem", outcomes: { success: "r" } }, { outcomes: { success: "x" } }).outcomes.success], ["suppress", "page 91", "r"]);
equal("D22 the riders of the applied modifiers only; a throw is said, not raised", await quiet(() => dm.dispelResultRiders({ countered: true, targetCaster: { name: "Vesk" } }, ["threadbreaker", "broken"])), ["Dazed: Vesk", "<em>A module's Dispel rider failed — see the console.</em>"]);
equal("D23 a modifier that did not apply rides nothing", await dm.dispelResultRiders({ countered: true }, ["resonant ascendance"]), []);
equal("D24 the stored request is plain data", [dm.plainCopy({ what: "Fireball", fn: () => 1, n: 3 }), dm.plainCopy(null)], [{ what: "Fireball", n: 3 }, null]);
api.resetModuleRegistry?.();
// The prompt: a tick for an optional offer, a line for the rest, a struck line for a spent use.
{
  let content = "";
  const ticked = new Set(["dispelMod-dispel_power"]);
  const values = { dispelPP: 4, effectValue: 6, effectDC: 20 };
  const root = { querySelector: (sel) => { const name = /name="([^"]+)"/.exec(sel)?.[1]; return name in values ? { value: values[name] } : { checked: ticked.has(name) }; } };
  const saved = foundry.applications.api.DialogV2.wait;
  foundry.applications.api.DialogV2.wait = async (cfg) => { content = cfg.content; return cfg.buttons[0].callback(null, null, { element: root }); };
  const got = await gso.promptDispel(6, 10, { offers: [
    { key: "dispel power", label: "Dispel Power", optional: true },
    { key: "resonant ascendance", label: "Resonant Ascendance", optional: false, hint: "half PP" },
    { key: "spent", label: "Spent Thing", optional: true, unavailable: "its Focus use is spent" }
  ] });
  foundry.applications.api.DialogV2.wait = saved;
  equal("D25 the prompt returns the ticked optional keys beside the numbers", got, { pp: 4, effectValue: 6, dc: 20, taken: ["dispel power"] });
  ok("D26 …showing a tick, an applies line and a struck spent one", /type="checkbox" name="dispelMod-dispel_power"/.test(content) && /<strong>Resonant Ascendance<\/strong> applies/.test(content) && /<s>Spent Thing<\/s>/.test(content) && !/name="dispelMod-spent"/.test(content));
  foundry.applications.api.DialogV2.wait = async (cfg) => { content = cfg.content; return cfg.buttons[0].callback(null, null, { element: root }); };
  const plain = await gso.promptDispel(6, 10, {});
  foundry.applications.api.DialogV2.wait = saved;
  ok("D27 with no offers the prompt is page 91's", !/dispelMod-|<hr>/.test(content) && JSON.stringify(plain.taken) === "[]");
}
// The wiring, which needs Foundry.
{
  const prompt = src.action.slice(src.action.indexOf('if (action.key === "dispel" && !skipDialog(event)) {'), src.action.indexOf("// RECHARGE ITEM (Chapter 4, page 91). \"A skill check"));
  ok("D28 the Dispel prompt asks the modifiers first, a counter told so, and offers them",
    /const counterSpell = presetDispel \? presetDispel\.counterSpell !== false : Boolean\(action\.counterSpell\);/.test(prompt)
    && prompt.indexOf("await offeredDispelModifiers({") < prompt.indexOf("await promptDispel(")
    && /offers: dispelOffers/.test(prompt));
  ok("D29 a Focus offer whose use is spent is shown unavailable", /else if \(left !== null && !\(left > 0\)\) offer\.unavailable = /.test(prompt));
  ok("D30 what applied joins the setup as plain data, and the ladder the action",
    /const applied = appliedDispelOffers\(dispelOffers, declared\.taken \?\? \[\]\);/.test(prompt) && /\.\.\.combinedDispelModifiers\(applied\),/.test(prompt)
    && /preset: plainCopy\(presetDispel\)/.test(prompt) && /action = dispelActionWithLadder\(action, dispelSetup\);/.test(prompt));
  ok("D31 Counter Spell's free Dispel is a counter", /name: "Counter Spell \(free Dispel\)",\s*apCost: "0",[\s\S]{0,300}counterSpell: true,/.test(src.feats));
  ok("D32 the modifier's step is the check's default difficulty", /if \(action\.key === "dispel" && dispelSetup\?\.difficulty\) actionDifficulty = dispelSetup\.difficulty;/.test(src.action)
    && src.action.indexOf("actionDifficulty = dispelSetup.difficulty") < src.action.indexOf("defaultDifficulty: actionDifficulty"));
  ok("D33 a replacement is compared in place of the PP; page 91's row stands otherwise",
    /if \(dispelSetup && dispelSetup\.effectValue > 0 && dispelReplaced\) \{[\s\S]{0,200}const acting = dispelCounteractValue\(dispelSetup\);\s*const value = counteractModifier\(acting, dispelSetup\.effectValue\);/.test(src.action)
    && /if \(dispelSetup && dispelSetup\.effectValue > 0 && !dispelReplaced\) \{\s*const value = counteractModifier\(dispelSetup\.pp, dispelSetup\.effectValue\);/.test(src.action));
  ok("D34 a modifier's rows reach the check", /for \(const row of dispelSetup\.modifiers\) \{\s*if \(Number\(row\?\.value\)\) dispelRows\.push\(/.test(src.action) && /\.\.\.dispelRows,/.test(src.action));
  const outcome = bodyOf(src.action, "async function applyActionOutcome(");
  ok("D35 the outcome reads the stored ladder before the degree is declared", outcome.indexOf("if (isDispel) action = dispelActionWithLadder(action, dispelSetup);") > 0
    && outcome.indexOf("if (isDispel) action = dispelActionWithLadder(action, dispelSetup);") < outcome.indexOf("declaredDegree(declaredOutcomeKeys(action)"));
  ok("D36 the PP paid is the rule's, on the declared degree", /const paidFor = dispelPPPaid\(degree, dispelSetup\);\s*ppCost = paidFor\.pp;\s*ppLabel = paidFor\.label;/.test(outcome));
  ok("D37 a Focus use is spent with the PP, from the pool's owner", /await \(usesPoolItem\(item\) \?\? item\)\.update\(\{ "system\.usesValue": Math\.max\(0, left - 1\) \}\);/.test(outcome));
  ok("D38 the riders run after the hook, with the contract's ctx, for what applied",
    outcome.indexOf('Hooks.callAll("trgPrimeActionResolved"') < outcome.indexOf("await dispelResultRiders({")
    && /countered: dispelCountered\(dispelSetup\.counterSpell, degree\),/.test(outcome)
    && /targetCaster: await byUuid\(dispelSetup\.casterUuid\),\s*spell: await byUuid\(dispelSetup\.spellUuid\),/.test(outcome)
    && /\}, dispelSetup\.modifierKeys\);/.test(outcome));
  ok("D39 the roll itself reaches the riders; a resumed card has none", /ctx: outcomeContext,\s*check\s*\}\);/.test(src.action) && /\/\/ card resumed by the GM's DC, which has no live check to hand on\.\s*check = null/.test(src.action));
  ok("D40 the API exposes the registration", /registerDispelModifier: \(key, spec, moduleId\) => registerDispelModifier\(key, spec, moduleId\),/.test(src.apiw));
}

// ── R: the resolved degree on the hook (C10) ───────────────────────────
ok("R1 trgPrimeActionResolved carries the card's degree beside the raw one",
  /Hooks\.callAll\("trgPrimeActionResolved", \{ actor, action, degree: rawDegree \?\? degree, resolvedDegree: degree, targetActor, invokedSkillKey, total: checkTotal \}\);/.test(src.action));
{
  const outcome = bodyOf(src.action, "async function applyActionOutcome(");
  ok("R2 …and `degree` there is the one after the upgrades and the declared rungs",
    /const shadowborn = shadowbornAgilityDegree\(action\.key, rawDegree, actorFeatNames\);/.test(outcome)
    && /const degree = rawDegree\s*\? declaredDegree\(declaredOutcomeKeys\(action\), dailyFirst\?\.degree \?\? attitudeImproved, DEGREES\)/.test(outcome));
}
const sf = await imp("skill-feats.mjs");
api.resetModuleRegistry?.();
api.registerDegreeUpgrades("Channel Siphoner", [{ actionKey: "tapMagicalEnergy", from: "partial", to: "success" }], "test");
equal("R3 a module's upgrade moves the degree the hook now carries", sf.shadowbornAgilityDegree("tapMagicalEnergy", "partial", ["Channel Siphoner"]).degree, "success");
api.resetModuleRegistry?.();

// ── S: Spell Recognition names itself (C11, a fix) ─────────────────────
{
  const sr = src.feats.slice(src.feats.indexOf('"spell recognition": {'), src.feats.indexOf('"weapon exemplar": {'));
  ok("S1 the roll passes the skill as its subject and its action key",
    /label: "Spell Recognition",[\s\S]{0,900}subject: skillKey,\s*actionKey: "spellRecognition",/.test(sr) && sr.indexOf("subject: skillKey") < sr.indexOf("modifiers: [...modifiers]"));
}
const ei = cond.normaliseConditional({ kind: "advantage", label: "Esoteric Insight", when: { actions: ["identifyPower", "spellRecognition"] } }, { name: "Esoteric Insight", id: "ei" });
equal("S2 a conditional scoped to the action now meets the roll; without the key it did not",
  [cond.matchesCheck(ei, { checkType: "skill", subject: "arcana", actionKey: "spellRecognition" }), cond.matchesCheck(ei, { checkType: "skill", subject: "arcana", actionKey: "" })], [true, false]);
const eiItem = { type: "feat", name: "Esoteric Insight", system: {}, flags: { "trg-prime": { fumbleReroll: { subjects: ["arcana", "occultism"], degrees: ["failure", "fumble"] } } } };
equal("S3 the Arcana/Occultism reroll meets the roll's subject; an empty one it did not",
  [fr.fumbleRerollRows([eiItem], "skill", "arcana", "failure").length, fr.fumbleRerollRows([eiItem], "skill", "", "failure").length], [1, 0]);

// ── L: control levels (C12) ────────────────────────────────────────────
const cl = (flag, extra = {}) => ({ flags: { "trg-prime": { controlLevelBonus: flag } }, ...extra });
equal("L1 Master Binder's +2 from a feat", casting.declaredControlLevelBonus([cl(2, { type: "feat" })]), 2);
equal("L2 an ability counts unless switched off; an item only while equipped",
  [casting.declaredControlLevelBonus([cl(2, { type: "ability", system: {} })]), casting.declaredControlLevelBonus([cl(2, { type: "ability", system: { active: false } })]),
    casting.declaredControlLevelBonus([cl(2, { type: "weapon", system: { equipped: true } })]), casting.declaredControlLevelBonus([cl(2, { type: "weapon", system: { equipped: false } })])], [2, 0, 2, 0]);
equal("L3 a live effect counts, a disabled one not; sources sum; nonsense adds nothing",
  [casting.declaredControlLevelBonus([], [cl(1)]), casting.declaredControlLevelBonus([], [cl(1, { disabled: true })]), casting.declaredControlLevelBonus([cl(2, { type: "feat" }), cl(2, { type: "weapon", system: { equipped: true } })], [cl(1)]), casting.declaredControlLevelBonus([cl("x", { type: "feat" }), { type: "feat" }])], [1, 0, 5, 0]);
equal("L4 nothing declared: nothing changes (default-off)", casting.declaredControlLevelBonus([{ type: "feat", flags: {} }], []), 0);
ok("L5 the actor adds it after the cap, from its items and applied effects",
  /system\.magic\.controlLevels = controlLevelCap\([\s\S]{0,200}\);[\s\S]{0,600}system\.magic\.controlLevelBonus = declaredControlLevelBonus\(\s*Array\.from\(actor\.items \?\? \[\]\),\s*Array\.from\(actor\.appliedEffects \?\? \[\]\)\s*\);\s*system\.magic\.controlLevels \+= system\.magic\.controlLevelBonus;/.test(src.actor));

// ── M: a free prep (C13) ───────────────────────────────────────────────
equal("M1 a spell counts unless marked free", [mem.countsTowardMemorisation({ flags: {} }), mem.countsTowardMemorisation({ flags: { "trg-prime": { memorisationFree: true } } }), mem.countsTowardMemorisation({ flags: { "trg-prime": { memorisationFree: "yes" } } })], [true, false, true]);
{
  const sp = (name, extra = {}) => ({ type: "spell", name, system: { ppCost: 2, prepared: true }, flags: { "trg-prime": { spellBookPick: true, ...extra } } });
  const book = { items: [{ type: "class", name: "Wizard", system: {} }, sp("A"), sp("B"), sp("Borrowed", { memorisationFree: true })], system: { identity: { level: 1 }, magic: { memorisationStyle: "book", tradition: "Arcane" }, progression: {} } };
  equal("M2 a book caster's free prep fills no slot", [mw.memorisationContext(book).leveledPicked, mw.memorisationContext(book).leveledRemaining], [2, 2]);
  const daily = (name, extra = {}) => ({ type: "spell", name, system: { ppCost: 2 }, flags: { "trg-prime": { dailyMemorised: true, ...extra } } });
  const list = { items: [{ type: "class", name: "Cleric", system: {} }, daily("D"), daily("Borrowed", { memorisationFree: true })], system: { identity: { level: 1 }, magic: { memorisationStyle: "list", tradition: "Divinity" }, progression: {} } };
  equal("M3 nor a list caster's", mw.memorisationContext(list).leveledPicked, 1);
  const plain = { ...book, items: book.items.map((i) => (i.name === "Borrowed" ? sp("Borrowed") : i)) };
  equal("M4 unmarked, it counts as it always did", mw.memorisationContext(plain).leveledPicked, 3);
}
ok("M5 nor is it offered in the Prepare Spells checklist, either style",
  /const pool = spellBookSpells\(actor\)\.filter\(\(s\) => Number\(s\.system\?\.ppCost \?\? 0\) <= cap && countsTowardMemorisation\(s\)\);/.test(src.memw)
  && /existingItems: dailyMemorisedLeveled\(actor\)\.filter\(countsTowardMemorisation\),/.test(src.memw));

// ── O: Runic Stabiliser (C14) ──────────────────────────────────────────
api.resetModuleRegistry?.();
api.registerCastOption("runic stabiliser", { offer: (c) => (c.highMagic ? { label: "Runic Stabiliser" } : null), apply: () => ({ label: "Runic Stabiliser", ap: 1 }) }, "test");
api.registerCastOption("trickery", { offer: () => ({ label: "Trickery" }), apply: () => ({ castingDC: 2, ap: -2 }) }, "test");
const applied = await co.appliedCastOptions({}, ["runic stabiliser", "trickery"]);
equal("O1 an option's AP is summed and named; a negative one adds nothing", [applied.ap, applied.apParts], [1, [{ label: "Runic Stabiliser", value: 1 }]]);
equal("O2 the cast's own cost stands, a reaction stays one; the pool must hold both",
  [co.castAPWithOptions(2, 1), co.castAPWithOptions("reaction", 1), co.castAPWithOptions(2, 0), co.castAPWithOptions(2, -1)],
  [{ cast: 2, option: 1, total: 3 }, { cast: "reaction", option: 1, total: 1 }, { cast: 2, option: 0, total: 2 }, { cast: 2, option: 0, total: 2 }]);
api.registerCastDegreeRemap("runic stabiliser", (c) => (c.highMagic && c.castOptions.includes("runic stabiliser") && c.degree === "partial" ? { degree: "success", lines: ["Rune: Partial is a Success."] } : null), "test");
equal("O3 a remap reads High Magic and the options taken",
  [(await hooks.remapCastDegree({ degree: "partial", highMagic: true, castOptions: ["runic stabiliser"] })).degree, (await hooks.remapCastDegree({ degree: "partial", highMagic: false, castOptions: ["runic stabiliser"] })).degree, (await hooks.remapCastDegree({ degree: "partial", highMagic: true, castOptions: [] })).degree],
  ["success", "partial", "partial"]);
api.resetModuleRegistry?.();
ok("O4 the cast hands the remap its High Magic and the options' keys",
  /const remapped = await remapCastDegree\(\{[\s\S]{0,700}highMagic: Boolean\(hmCast\.highMagic\),\s*castOptions: \[\.\.\.castOptionsApplied\.keys\]\s*\}\);/.test(src.cast));
ok("O5 the pool is asked for the option's AP before anything is spent",
  // RE-ANCHORED AT 3.684.0 (G25): with a Prepared Sigil's −1 AP.
  /const owed = castAPWithOptions\(totalCastTime\(warpedCastAP, \{ apDelta: mm\.apDelta(?: \+ sigilAP)? \}\), castOptionsApplied\.ap\);[\s\S]{0,700}?const alreadyShort = Number\(actor\.system\?\.resources\?\.ap\?\.value \?\? 0\) < castAlone;\s*if \(!apPaid && !alreadyShort && !\(await ensureActionPoints\(actor, owed\.total, /.test(src.cast)
  && src.cast.indexOf("ensureActionPoints(actor, owed.total") < src.cast.indexOf("const reagentsUsed = reagentChoices.filter("));
ok("O6 the option's AP is spent beside the cast's, as the cast's is, and refunded with it",
  // 3.684.7: each spend keeps its receipt for the refund.
  /const castReceipt = apPaid \? null : await spendActionCost\(actor, totalCastAP, spell\.name\);[\s\S]{0,500}const castAPOwed = castAPWithOptions\(totalCastAP, castOptionsApplied\.ap\);\s*let optionReceipt = null;\s*if \(!apPaid && castAPOwed\.option > 0\) \{\s*optionReceipt = await spendActionCost\(actor, castAPOwed\.option, /.test(src.cast)
  && /if \(!apPaid && castAPOwed\.option > 0\) await refundActionCost\(actor, castAPOwed\.option, \{ receipt: optionReceipt \}\);/.test(src.cast));

// ── N: Sniping with a spell (C15, D14) ─────────────────────────────────
const feat = { type: "feat", system: {}, flags: { "trg-prime": { spellSniping: true } } };
equal("N1 the declaration: owned and live; switched off, disabled or absent is none",
  [sn.declaresSpellSniping([feat]), sn.declaresSpellSniping([{ ...feat, system: { active: false } }]), sn.declaresSpellSniping([{ ...feat, disabled: true }]), sn.declaresSpellSniping([{ type: "feat", flags: {} }])], [true, false, false, false]);
const facts = (rangeText, distanceFeet) => sn.spellCriticalSnipingFacts({ declared: true, rangeText, distanceFeet, reach: 5 });
equal("N2 Q86: a ranged spell's critical within its range", facts("60 feet", 40), { weaponIsRanged: true, withinFirstIncrement: true });
equal("N3 beyond it, or with nothing measured, it is not within", [facts("60 feet", 65).withinFirstIncrement, facts("60 feet", null).withinFirstIncrement], [false, false]);
equal("N4 a touch or self spell is not ranged", [facts("touch", 5), facts("self", 0)], [{ weaponIsRanged: false, withinFirstIncrement: false }, { weaponIsRanged: false, withinFirstIncrement: false }]);
equal("N5 a range with no limit the core reads is always within, once measured", facts("unlimited", 900), { weaponIsRanged: true, withinFirstIncrement: true });
equal("N6 undeclared: the core's melee default stands (default-off)", sn.spellCriticalSnipingFacts({ declared: false, rangeText: "60 feet", distanceFeet: 10 }), null);
const record = (f) => ({ targetActorId: "t1", weaponIsRanged: f.weaponIsRanged, withinFirstRangeIncrement: f.withinFirstIncrement });
equal("N7 and Sniping's own gate then opens on it, and not on a touch spell's",
  [ca.criticalReactionTrigger("sniping", record(facts("60 feet", 40)), "t1").allowed, ca.criticalReactionTrigger("sniping", record(facts("touch", 5)), "t1").allowed, ca.criticalReactionTrigger("sniping", record(facts("60 feet", 65)), "t1").allowed], [true, false, false]);
ok("N8 the spell attack's critical records the facts when declared, read on the cast's own range",
  /const snipingDeclared = injuryRays\.some\(\(r\) => r\?\.critical\)\s*&& declaresSpellSniping\(\[\.\.\.Array\.from\(actor\.items \?\? \[\]\), \.\.\.Array\.from\(actor\.appliedEffects \?\? \[\]\)\]\);/.test(src.cast)
  && /rangeText: effectiveRangeText\(warpedRange\(effRange, warpMods\), warpedAreaText\(effArea, warpMods\)\),\s*distanceFeet: await distanceBetweenActors\(actor, ray\.targetActor\),/.test(src.cast)
  && /spellResonance: resonanceContext,[\s\S]{0,120}\.\.\.\(sniping \?\? \{\}\)\s*\}\);/.test(src.cast));
ok("N9 and rollCriticalInjury remembers them for the reaction", /weaponIsRanged,\s*weaponHasAgile,\s*withinFirstRangeIncrement: withinFirstIncrement/.test(read("module", "combat", "attack-workflow.mjs")));

if (failures.length) {
  process.stdout.write(`verify-ea-block5d-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block5d-core: OK — ${checks} checks.\n`);
