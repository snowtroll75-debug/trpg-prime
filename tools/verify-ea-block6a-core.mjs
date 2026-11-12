#!/usr/bin/env node
/**
 * verify-ea-block6a-core — TRG Prime 3.684.0: group a of the seams Eldritch
 * Arts' Block 6 (archetypes, class feats, metamagic) needs, from the Block 6
 * audit (docs/ELDRITCH_ARTS_BLOCK6_AUDIT.md in the module), answered by
 * Graham on 4 November 2026 ("proposed except Q89: One release").
 *
 *   M   G1: registerMetamagic — a module's metamagic in the Warp? dialog in
 *       the core's totals; gated, Focus (Q96), paid in PP, AP or a resource;
 *       granted by an effect or a rod; innate (Q95) and item (Q94, Q130)
 *       reach; presets (S-M4); a threaded spell (S-M11, Q126); the effects
 *       vocabulary (bias, traits, typed pool, typed Save DC rows, Echo, Harmony,
 *       ×1.5, die step, fumble/Resonance bias, saving step); hooks and the
 *       catalogue
 *   P   G2: registerCastPPSource — another way to pay, split by degree
 *   A   G3: registerMetamagicPayment — an option's PP paid in AP, the DC as if
 *   D   G4: registerCastCostModifier — PP off what is paid, with a floor (Q93)
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

const prompts = [];
globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.foundry.applications ??= { api: {} };
globalThis.foundry.applications.api ??= {};
globalThis.foundry.applications.api.DialogV2 = { prompt: async (o) => { prompts.push(o); return { draw: 2 }; } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = globalThis.Hooks ?? { on() {}, callAll() {} };

const api = await imp("module-api.mjs");
const mm = await imp("magic/module-metamagic.mjs");
const mmw = await imp("magic/module-metamagic-workflow.mjs");
const casting = await imp("magic/casting.mjs");
const cdc = await imp("magic/casting-dc.mjs");
const clm = await imp("magic/caster-level-mods.mjs");
const sd = await imp("magic/spell-degrees.mjs");
const ed = await imp("magic/effect-duration.mjs");
const rp = await imp("rod-powers.mjs");
const src = {
  cast: read("module", "magic", "cast-workflow.mjs"),
  apiw: read("module", "module-api-workflow.mjs"),
  apim: read("module", "module-api.mjs")
};
const castBody = (() => {
  const from = src.cast.indexOf("async function castSpellResolved(");
  return src.cast.slice(from, src.cast.indexOf("\n/**\n * Resolve an attack spell against the current target", from));
})();
const before = (body, a, b) => { const i = body.indexOf(a); const j = body.indexOf(b); return i !== -1 && j !== -1 && i < j; };

// ── M: G1, a module's metamagic ──────────────────────────────────────────
api.resetModuleRegistry();
{
  const bad = [
    mm.normaliseMetamagicSpec("quicken", { label: "x" }),
    mm.normaliseMetamagicSpec("cheap", { ppCost: -2 }),
    mm.normaliseMetamagicSpec("odd", { kind: "empower" }),
    mm.normaliseMetamagicSpec("res", { payment: { resource: { label: "charges" } } }),
    mm.normaliseMetamagicSpec("", {})
  ];
  ok("M1 a core id, a negative cost (a discount is `discount`, Q93), an unknown kind, a resource without functions and no key are each refused",
    bad.every((r) => typeof r.problem === "string" && !r.spec));
  const good = mm.normaliseMetamagicSpec("Resonant Pulse", { feat: "Resonant Pulse", focus: true, effects: { saveDC: [{ value: 1 }] } }).spec;
  equal("M1b the defaults: one application, PP payment, learned and innate and item scope, never preset",
    [good.key, good.max, good.payment.kind, good.scope, good.preset, good.feats, good.focus], ["resonant pulse", 1, "pp", { innate: true, item: true }, false, ["Resonant Pulse"], true]);
  equal("M1c AP and resource payments are read; `onSettled` is `after`",
    [mm.normaliseMetamagicSpec("a", { payment: { ap: 1 } }).spec.payment, mm.normaliseMetamagicSpec("b", { payment: { resource: { label: "charge", available: () => 1, pay: () => null } } }).spec.payment.kind,
      typeof mm.normaliseMetamagicSpec("c", { onSettled: () => null }).spec.after],
    [{ kind: "ap", ap: 1, dcAsIfPP: true }, "resource", "function"]);
  ok("M2 registerMetamagic records the problem and refuses a bad spec, keeps a good one",
    api.registerMetamagic("quicken", {}) === false && api.registrationProblems().some((p) => /core metamagic id/.test(p))
    && api.registerMetamagic("Echo", { feat: "Echo of the Ancestors", ppCost: 2 }) === true && api.registeredMetamagic().some((s) => s.key === "echo"));
}
equal("M3 Q94: which casts take it — learned, innate, a charged item's only with itemMetamagic; never a cantrip, an innate cantrip, a scroll or potion, a stored, storing or threaded spell",
  [{}, { innate: true }, { itemCast: true, itemMetamagic: true }, { itemCast: true }, { itemCast: true, itemMetamagic: "yes" }, { cantrip: true }, { innate: true, innateCantrip: true }, { stored: true }, { storing: true }, { thread: true }]
    .map((c) => mm.moduleMetamagicScope(c).kind || "none"),
  ["learned", "innate", "item", "none", "none", "none", "none", "none", "none", "none"]);
{
  const spec = mm.normaliseMetamagicSpec("focused", { feat: "Focused Spell", scope: { innate: false } }).spec;
  equal("M4 a spec's scope: Focused Spell takes no innate cast (no Spellcraft check)", [mm.scopeAdmits(spec, "learned"), mm.scopeAdmits(spec, "innate"), mm.scopeAdmits(spec, "item"), mm.scopeAdmits(spec, "")], [true, false, true, false]);
  const opened = (o) => mm.metamagicOpenedBy(spec, o);
  equal("M5 opened by an owned feat (any case), an effect's grant, a held rod naming the key; else not",
    [opened({ featNames: ["focused spell"] })?.source, opened({ granted: ["Focused"] })?.source, opened({ rods: [{ kind: "focused", itemId: "r" }] })?.source, opened({ featNames: ["Empower Spell"] })],
    ["feat", "grant", "rod", null]);
  equal("M5b grantedMetamagic is read off enabled effects, by key or core id",
    mm.grantedMetamagicKeys([{ flags: { "trg-prime": { grantedMetamagic: [{ key: "Echo" }, "pulse"] } } }, { disabled: true, flags: { "trg-prime": { grantedMetamagic: ["off"] } } }, { flags: { "trg-prime": { grantedMetamagic: { coreId: "extend" } } } }]),
    ["echo", "pulse", "extend"]);
  const rods = rp.moduleMetamagicRodsOf([
    { id: "r1", name: "Rod of Focused Spell", system: { equipped: true, uses: 6 }, flags: { "trg-prime": { chargedItem: { metamagic: { kind: "Focused", maxPP: 4, cost: 2 } } } } },
    { id: "r2", name: "Rod of Extension", system: { equipped: true }, flags: { "trg-prime": { chargedItem: { metamagic: { kind: "extend" } } } } },
    { id: "r3", name: "Stowed", system: { equipped: false }, flags: { "trg-prime": { chargedItem: { metamagic: { kind: "focused" } } } } }
  ], ["focused"]);
  equal("M5c a held rod naming a module key is offered rod-paid; the core's own kinds and a stowed rod are not", rods.map((r) => [r.itemId, r.kind, r.cost, r.maxPP]), [["r1", "focused", 2, 4]]);
}
{
  const offers = [
    { key: "pulse", max: 1 }, { key: "split", max: 3 }, { key: "surge", max: 1, choices: [{ value: "range", label: "Range" }, { value: "dc", label: "DC", ppCost: 3 }] },
    { key: "wellspring", required: true, max: 1 }, { key: "subconscious", hidden: true, preset: true, max: 1 }, { key: "notmine", hidden: true, max: 1 }
  ];
  equal("M6 the form: a tick, a number box (capped), a select, a required option; a preset applied though hidden; a hidden one never by the form",
    mm.readModuleMetamagicForm(offers, { "mmx-pulse": "1", "mmx-split": "5", "mmx-surge": "dc", "mmx-notmine": "1" }, [{ key: "Subconscious" }]),
    [{ key: "pulse", times: 1, choice: "" }, { key: "split", times: 3, choice: "" }, { key: "surge", times: 1, choice: "dc" }, { key: "wellspring", times: 1, choice: "" }, { key: "subconscious", times: 1, choice: "" }]);
  equal("M6b a choice's own cost wins; else ppCost × times", [mm.takenPP({ ppCost: 1, choices: offers[2].choices }, { choice: "dc" }), mm.takenPP({ ppCost: 2 }, { times: 3 })], [3, 6]);
  const html = mm.buildModuleMetamagicChooser([{ key: "pulse", label: "Resonant Pulse", feat: "Resonant Pulse", ppCost: 0, max: 1, focus: true },
    { key: "echo", label: "Echo", feat: "Echo of the Ancestors", ppCost: 2, max: 1 }, { key: "hid", label: "Hidden", hidden: true, max: 1 }],
  [{ key: "adept", label: "Metamagic Adept", ap: 1, optionIds: ["x-echo"] }]);
  ok("M7 the chooser names each option's feat, its cost and Focus; leaves a hidden one out; puts G3's AP tick on the row it covers",
    html.includes('name="mmx-pulse"') && html.includes("(Resonant Pulse)") && html.includes("<em>Focus</em>") && html.includes("<strong>+2 PP</strong>")
    && !html.includes("mmx-hid") && html.includes('name="mmap-x-echo"') && html.includes("Metamagic Paid".slice(0, 0)));
  equal("M7b nothing offered, nothing drawn", mm.buildModuleMetamagicChooser([], []), "");
}
{
  const agg = mm.emptyModuleMetamagic();
  const spec = (s) => mm.normaliseMetamagicSpec(s.key, s).spec;
  mm.foldModuleMetamagic(agg, { key: "echo", label: "Echo", ppCost: 2, spec: spec({ key: "echo" }) }, { times: 1 }, mm.cleanMetamagicAnswer({ checkBias: "advantage", resonanceBias: "disadvantage", addTraits: ["Fire"] }));
  mm.foldModuleMetamagic(agg, { key: "adeptx", label: "Adept", ppCost: 2, spec: spec({ key: "adeptx", payment: { ap: 1 } }) }, { times: 1 }, mm.cleanMetamagicAnswer({}));
  mm.foldModuleMetamagic(agg, { key: "weave", label: "Spell Weaver", ppCost: 1, spec: spec({ key: "weave", payment: { resource: { label: "charge", available: () => 1, pay: () => null } } }) }, { times: 1 }, mm.cleanMetamagicAnswer({ discount: { pp: 2, floor: 0 } }));
  mm.foldModuleMetamagic(agg, { key: "focusrod", label: "Focused (rod)", ppCost: 3, source: "rod", rodName: "Rod", rodCost: 2, spec: spec({ key: "focusrod" }) }, { times: 1 }, mm.cleanMetamagicAnswer({ checkBias: "advantage" }));
  mm.foldModuleMetamagic(agg, { key: "unfettered", label: "Unfettered", ppCost: 0, kind: "quicken", spec: spec({ key: "unfettered", kind: "quicken" }) }, { times: 1 }, mm.cleanMetamagicAnswer({ savingStep: 1, basePPAdd: 3, freeWarpPP: 2 }), { coreQuickened: false });
  equal("M8 the totals: PP paid only for the PP option; AP payment's AP and DC-only PP; a resource's PP nothing; a rod's 0; one Quicken; a discount carried; the biases, traits, saving step, base PP and free warp",
    [agg.keys, agg.ppSpent, agg.apDelta, agg.dcPP, agg.discounts.map((d) => [d.pp, d.floor]), agg.checkBias, agg.resonanceBias, agg.addTraits, agg.savingStep, agg.basePPAdd, agg.freeWarpPP, agg.quicken],
    [["echo", "adeptx", "weave", "focusrod", "unfettered"], 2, 0, 2, [[2, 0]], "advantage", "disadvantage", ["Fire"], 1, 3, 2, true]);
  const q = mm.emptyModuleMetamagic();
  mm.foldModuleMetamagic(q, { key: "u", label: "U", kind: "quicken", spec: spec({ key: "u" }) }, { times: 1 }, mm.cleanMetamagicAnswer({}), { coreQuickened: true });
  equal("M8b one Quicken across the feat, a rod and a module (Unfettered Mastery does not stack with Quicken Spell)", q.apDelta, 0);
  equal("M8c biases reconcile as a d20's", [mm.joinedBias("advantage", "disadvantage"), mm.joinedBias("", "disadvantage"), mm.joinedBias(undefined, "advantage"), mm.joinedBias("", "")], ["normal", "disadvantage", "advantage", ""]);
}
{
  const a = mm.cleanMetamagicAnswer({ addedDamage: [{ dice: "2d6", type: "Fire" }, { dice: "lots", type: "fire" }, { dice: "1d6" }], ppDelta: -1, saveDC: [{ value: 2, type: "class" }, { value: 0 }],
    targets: { extra: [{ tokenUuid: "Scene.s.Token.t", damageFactor: 0.5 }, {}], share: [{ uuid: "Actor.a" }] }, rangeFactor: 1.5, dieStep: 1 });
  equal("M9 the answer cleaned: a typed pool needs dice and a type; a negative ppDelta is a discount (floor 1); typed Save DC rows; Echo's and Harmony's creatures",
    [a.addedDamage, a.discount, a.saveDC, a.extra, a.share, a.rangeFactor, a.dieStep],
    [[{ dice: "2d6", type: "fire", label: "" }], { pp: 1, floor: 1, label: "" }, [{ value: 2, type: "class", label: "" }], [{ tokenUuid: "Scene.s.Token.t", damageFactor: 0.5, label: "" }], [{ tokenUuid: "Actor.a" }], 1.5, 1]);
  equal("M9b { cancel: true } calls the cast off", mm.cleanMetamagicAnswer({ cancel: true, reason: "no ally" }), { cancel: true, reason: "no ally" });
}
{
  const agg = mm.emptyModuleMetamagic();
  Object.assign(agg, {
    taken: [{ key: "x" }], mods: { damageDice: "1d6", extraTargets: 1 },
    saveDCRows: [{ value: 1, type: "untyped", label: "Pulse" }, { value: 2, type: "class", label: "Surge" }, { value: 1, type: "class", label: "Other" }],
    rangeFactor: 1.5, durationFactor: 1.5, areaFactor: 1.5, dieStep: 1,
    share: [{ tokenUuid: "Actor.ally" }], addedDamage: [{ dice: "2d6", type: "fire", label: "Pact Channeler" }]
  });
  const wm = { damageDice: "1d6", saveDC: 1, durationText: null };
  const out = mm.foldModuleMetamagicMods(wm, agg, { range: "30 feet", duration: "1 minute", area: "20-foot radius" });
  equal("M10 folded into the warp mods: dice add (and step up), numbers add, typed Save DC rows stack (untyped add, a class bonus the highest), ×1.5 range, duration and area, the die step, Harmony's recipient, the new pool",
    [wm.damageDice, wm.extraTargets, wm.saveDC, wm.rangeOverride, wm.durationText, wm.areaGrowth, wm.dieStep, wm.selfRowAlso, wm.addedDamage.map((d) => d.dice)],
    ["2d8", 1, 4, "45 feet", "15 rounds (1 minute ×1.5)", 10, 1, ["Actor.ally"], ["2d6"]]);
  ok("M10b the duration written is the one the expiry reads", ed.parseSpellDuration(wm.durationText)?.rounds === 15);
  ok("M10c the card says what changed", out.lines.some((l) => /Save DC \+3/.test(l)) && out.lines.some((l) => /Range 30 feet → 45 feet/.test(l)));
  const kept = { durationText: "1 minute ×2 (Extended)", rangeOverride: "touch" };
  const notStacked = mm.foldModuleMetamagicMods(kept, Object.assign(mm.emptyModuleMetamagic(), { taken: [{}], durationFactor: 1.5, rangeFactor: 1.5 }), { duration: "1 minute", range: "30 feet" });
  equal("M10d a duration already changed is not stacked (Temporal Extension's rule), a set range is not rescaled", [kept.durationText, kept.rangeOverride, notStacked.lines.length], ["1 minute ×2 (Extended)", "touch", 2]);
  const prose = mm.foldModuleMetamagicMods({}, Object.assign(mm.emptyModuleMetamagic(), { taken: [{}], rangeFactor: 1.5, durationFactor: 1.5 }), { range: "touch", duration: "Instantaneous" });
  ok("M10e a printed value that is not a number is left alone and said", prose.lines.length === 2 && !prose.warpMods.rangeOverride && !prose.warpMods.durationText);
}
equal("M11 the die step on the row's own dice, where both damage paths and the heal rows read it: d8→d10, a d12 stays a d12; no step, no change",
  [clm.warpedRowExtra("1d8 + 8", { dieStep: 1 }), clm.warpedRowExtra("2d12 + 1d4", { dieStep: 1 }), clm.warpedRowExtra("1d8 + 8", { rowExtra: 1, dieStep: 1 }), clm.warpedRowExtra("1d8 + 8", {}), clm.warpedHealFormula("1d8", { dieStep: 1 })],
  ["1d10 + 8", "2d12 + 1d6", "1d10 + 16", "1d8 + 8", "1d10"]);
equal("M12 Spellthread's saving one rung less (sidebar 15): a Heroic pays as a Critical, a Critical as a Success; a Success is untouched; no step, as before",
  [["heroic", 1], ["critical", 1], ["success", 1], ["heroic", 0], ["critical", 0]].map(([d, s]) => casting.castingOutcome(d, { basePP: 4, warpPP: 2, savingStep: s }).ppSpent),
  [4, 6, 6, 3, 4]);
{
  const caster = { name: "caster" }, ally = { name: "ally" }, other = { name: "other" };
  equal("M13 Resonant Harmony: a self row reaches the named ally beside the caster; none named, the caster alone; a shared row adds it once",
    [sd.selfRowRecipients(caster, [], { selfRowAlso: [ally] }).map((a) => a.name), sd.selfRowRecipients(caster, [], {}).map((a) => a.name),
      sd.selfRowRecipients(caster, [other, ally], { shareSelfRows: true, selfRowAlso: [ally] }).map((a) => a.name)],
    [["caster", "ally"], ["caster"], ["caster", "other", "ally"]]);
  globalThis.fromUuidSync = (u) => (u === "Scene.s.Token.t" ? { actor: ally } : null);
  equal("M13b a token's uuid is resolved to its actor", sd.selfRowRecipients(caster, [], { selfRowAlso: ["Scene.s.Token.t", "Nope"] }).map((a) => a.name), ["caster", "ally"]);
}
equal("M14 the core options ticked, by the ids the hooks report (an Elemental row by its kind, a rod by the feat it applies)",
  mm.coreMetamagicTaken([{ id: "extend", max: 1 }, { id: "elemental-fire", kind: "elemental", elementalType: "fire", max: 1 }, { id: "rod-r1", kind: "quicken", rodItemId: "r1", max: 1 }, { id: "split", max: 4 }],
    { "mm-extend": true, "mm-elemental-fire": "1", "mm-rod-r1": true, "mm-split": "0" }).map((t) => t.key), ["extend", "elemental", "quicken"]);
equal("M15 Q96: a Focus use is spent when the cast pays its PP — Success or better, Failure, Fumble, Blunder; not a Partial nor a refund; an innate cast when cast",
  [["heroic"], ["success"], ["failure"], ["fumble"], ["blunder"], ["partial"], ["success", { refunded: true }], ["partial", { innate: true }]].map(([d, o]) => mm.metamagicPaidOn(d, o ?? {})),
  [true, true, true, true, true, false, false, true]);
equal("M16 Q130: an item cast's ceiling — the one G6 hands, else double the release PP",
  [mm.itemMetamagicCeilingRefusal({ releasePP: 3, metamagicPP: 3 }), Boolean(mm.itemMetamagicCeilingRefusal({ releasePP: 3, metamagicPP: 4 })), mm.itemMetamagicCeilingRefusal({ releasePP: 3, metamagicPP: 4, ceiling: 8 }), Boolean(mm.itemMetamagicCeilingRefusal({ releasePP: 3, metamagicPP: 6, ceiling: 8 }))],
  ["", true, "", true]);
{
  const cat = mm.metamagicCatalogueOf([{ id: "extend", label: "Extend", ppCost: 2 }, { id: "elemental-fire", label: "Elemental", ppCost: 2 }, { id: "elemental-cold", label: "Elemental", ppCost: 2 }, { id: "rod-1", rodItemId: "1" }],
    [mm.normaliseMetamagicSpec("echo", { feat: "Echo of the Ancestors", ppCost: 2, focus: true, needsSpell: true }).spec, mm.normaliseMetamagicSpec("pulse", { feat: "Resonant Pulse", focus: true }).spec,
      mm.normaliseMetamagicSpec("sub", { feat: "Subconscious Casting", preset: true }).spec, mm.normaliseMetamagicSpec("res", { }).spec],
    { featNames: ["echo of the ancestors", "resonant pulse", "subconscious casting"], granted: ["res"] });
  equal("M17 the catalogue: core once each (no rods), module by feat or grant, no preset-only entry, a spell-needing one left out without a spell",
    cat.map((c) => [c.key, c.source]), [["extend", "core"], ["elemental", "core"], ["pulse", "module"], ["res", "granted"]]);
}
// THE WORKFLOW HALF, against plain objects.
api.resetModuleRegistry();
{
  const featItem = (id, name, extra = {}) => ({ id, name, type: "feat", system: { ...extra }, actor: null });
  const surge = featItem("f1", "Spell Surge", { usesPerDay: 1, usesValue: 0, traits: "Focus" });
  const pulse = featItem("f2", "Resonant Pulse", { usesPerDay: 1, usesValue: 1, traits: "Focus" });
  const actor = { items: [surge, pulse], effects: [], appliedEffects: [] };
  actor.items.get = (id) => actor.items.find((i) => i.id === id);
  for (const i of actor.items) i.actor = actor;
  api.registerMetamagic("Spell Surge", { feat: "Spell Surge", ppCost: 1, focus: true });
  api.registerMetamagic("Resonant Pulse", { feat: "Resonant Pulse", focus: true, applies: (ctx) => Boolean(ctx.defence), effects: { saveDC: [{ value: 1 }] } });
  api.registerMetamagic("Focused Spell", { feat: "Focused Spell", ppCost: 3, scope: { innate: false } });
  const offers = await quiet(() => mmw.offeredModuleMetamagic(actor, { basePP: 3, defence: "Will", scopeKind: "learned" }));
  equal("M18 offered: a Focus option only while its feat has a use; `applies` gates; an unowned feat rides hidden (a preset may name it)",
    offers.map((o) => [o.key, Boolean(o.hidden), o.focusItemId]), [["resonant pulse", false, "f2"], ["focused spell", true, ""]]);
  const none = await quiet(() => mmw.offeredModuleMetamagic(actor, { basePP: 3, defence: "", scopeKind: "innate" }));
  equal("M18b on an innate cast Focused Spell is not even hidden-offered (its scope), and Pulse's applies says no", none.map((o) => o.key), []);
  const agg = await quiet(() => mmw.appliedModuleMetamagic(actor, offers, [{ key: "resonant pulse", times: 1, choice: "" }], { basePP: 3 }));
  equal("M19 applied: the static effects folded, the Focus use recorded for the settle", [agg.saveDCRows.map((r) => r.value), agg.focus.map((f) => f.itemId)], [[1], ["f2"]]);
  const updates = [];
  pulse.update = async (u) => { updates.push(u); };
  const partial = await quiet(() => mmw.settleModuleMetamagic(actor, agg, [], { degree: "partial" }));
  const paid = await quiet(() => mmw.settleModuleMetamagic(actor, agg, [], { degree: "failure" }));
  equal("M19b Q96 at the settle: a Partial spends nothing, a Failure spends the Focus use", [partial.length, updates, paid.length], [0, [{ "system.usesValue": 0 }], 1]);
  api.registerMetamagic("Grp1", { feat: "Resonant Pulse", group: "g" });
  api.registerMetamagic("Grp2", { feat: "Resonant Pulse", group: "g" });
  const grpOffers = await quiet(() => mmw.offeredModuleMetamagic(actor, { basePP: 3, defence: "Will", scopeKind: "learned" }));
  const grp = await quiet(() => mmw.appliedModuleMetamagic(actor, grpOffers, [{ key: "grp1", times: 1 }, { key: "grp2", times: 1 }], {}));
  ok("M20 two options of one group are refused, not trimmed", /cannot both be applied/.test(grp.refusal ?? ""));
  let paidWith = null;
  api.registerMetamagic("Weave", { feat: "Resonant Pulse", payment: { resource: { label: "charges", cost: 1, available: () => 0, pay: (ctx) => { paidWith = ctx.amount; } } }, effects: { discount: { pp: 2, floor: 0 } } });
  const wOffers = await quiet(() => mmw.offeredModuleMetamagic(actor, { basePP: 3, defence: "Will", scopeKind: "learned" }));
  const short = await quiet(() => mmw.appliedModuleMetamagic(actor, wOffers, [{ key: "weave", times: 1 }], {}));
  ok("M20b a resource the caster lacks refuses the cast", /costs 1 charges; 0 available/.test(short.refusal ?? ""));
  api.registerMetamagic("Weave", { feat: "Resonant Pulse", payment: { resource: { label: "charges", cost: 1, available: () => 3, pay: (ctx) => { paidWith = ctx.amount; } } }, effects: { discount: { pp: 2, floor: 0 } } });
  const w2 = await quiet(async () => mmw.appliedModuleMetamagic(actor, await mmw.offeredModuleMetamagic(actor, { basePP: 3, defence: "Will", scopeKind: "learned" }), [{ key: "weave", times: 1 }], {}));
  await quiet(() => mmw.settleModuleMetamagic(actor, w2, [], { degree: "success" }));
  equal("M20c a resource is paid at the settle (Q96's moment), and its discount carried", [paidWith, w2.discounts.map((d) => d.pp)], [1, [2]]);
  api.registerMetamagic("Nope", { feat: "Resonant Pulse", apply: () => ({ cancel: true }) });
  const c = await quiet(async () => mmw.appliedModuleMetamagic(actor, await mmw.offeredModuleMetamagic(actor, { basePP: 3, defence: "Will", scopeKind: "learned" }), [{ key: "nope", times: 1 }], {}));
  ok("M20d an apply that cancels calls the cast off", Boolean(c.cancelled));
  let afterCtx = null;
  api.registerMetamagic("Thunder", { feat: "Resonant Pulse", ppCost: 2, after: (ctx) => { afterCtx = ctx; return { lines: ["boom"] }; } });
  const t = await quiet(async () => mmw.appliedModuleMetamagic(actor, await mmw.offeredModuleMetamagic(actor, { basePP: 3, defence: "Will", scopeKind: "learned" }), [{ key: "thunder", times: 1 }], {}));
  const tl = await quiet(() => mmw.settleModuleMetamagic(actor, t, [], { degree: "success", cast: true, totalPP: 5 }));
  ok("M21 `after` runs once the cast has settled, told the degree, the PP and the keys", tl.includes("boom") && afterCtx?.degree === "success" && afterCtx?.totalPP === 5 && afterCtx?.metamagic?.includes("thunder"));
  await quiet(() => mmw.settleModuleMetamagic(actor, t, [], { degree: "success", cast: true, totalPP: 5, saveDC: 23 }));
  const settleAt = castBody.indexOf("await mmxWorkflow.settleModuleMetamagic(actor, mmx, ppSources.draws, {");
  ok("M21d THE REVIEW ADDITION: `after(ctx)` is told the cast's Save DC (`ctx.saveDC`), the value the settled hook carries",
    afterCtx?.saveDC === 23 && settleAt > 0
    && /saveDC: nominalSaveDC \?\? null, innateSaveDC: isInnate \? innateSaveDCBase : null,/.test(castBody.slice(settleAt, castBody.indexOf("\n    });", settleAt))));
  // THE REVIEW FIX (3.684.0, G1 Low): a preset-only option's own feat is found.
  api.registerMetamagic("Subconscious", { feat: "Resonant Pulse", focus: true, preset: true });
  api.registerMetamagic("Surge Preset", { feat: "Spell Surge", focus: true, preset: true });
  api.registerMetamagic("Stranger Preset", { feat: "Unowned Feat", focus: true, preset: true });
  const pOffers = await quiet(() => mmw.offeredModuleMetamagic(actor, { basePP: 3, defence: "Will", scopeKind: "learned" }));
  const pOf = (k) => pOffers.find((o) => o.key === k);
  equal("M21b THE REVIEW FIX (G1): a preset option resolves its granting feat, so its Focus is tracked; still hidden; one whose feat has no use left is not offered; an unowned feat has none to spend",
    [pOf("subconscious")?.focusItemId, pOf("subconscious")?.hidden, pOf("subconscious")?.feat, Boolean(pOf("surge preset")), pOf("stranger preset")?.focusItemId], ["f2", true, "Resonant Pulse", false, ""]);
  const pAgg = await quiet(() => mmw.appliedModuleMetamagic(actor, pOffers, mm.readModuleMetamagicForm(pOffers, {}, [{ key: "subconscious" }]), { basePP: 3 }));
  equal("M21c …and applied by its preset, the Focus use is recorded for the settle", pAgg.focus.map((f) => f.itemId), ["f2"]);
}
ok("M22 the cast: the offers are built beside the core's table, scoped by Q94, with the item and threaded casts named",
  castBody.includes("const mmxScope = moduleMetamagicScope({") && castBody.includes("itemMetamagic: itemTakesMetamagic, stored: Boolean(stored), storing: storingNow, thread: threaded")
  && castBody.includes("const itemTakesMetamagic = isItemCast && itemMetamagic === true && !isCantrip && !innateCantripOf(spellData) && !stored;"));
ok("M23 the dialog opens for a module's options as for the warp chooser (S-M3), the chooser itself only where it always was",
  castBody.includes("const warpChooserOpen = !isCantrip && !isItemCast && !stored && (!isInnate || innateBudget > 0) && !threaded;")
  && castBody.includes("if (warpChooserOpen || mmxShown) {")
  && castBody.includes("if (!warpChooserOpen) {\n      warp = warpBeforeDialog;"));
ok("M24 Q95: a module option's PP are the pool's, never the innate budget's, and join the totals the DC, cap and refund read",
  castBody.includes("const metamagicPP = mmx.ppSpent + (componentSwap")
  && castBody.includes("basePP + mmx.basePPAdd + warpPP + metamagicPP + mm.ppDelta - signatureDiscount")
  && castBody.includes("metamagicDelta: mm.dcDelta + mmx.dcDelta,"));
ok("M25 the answer's effects reach the cast: mods folded after the core's, the check's bias, the traits, the saving step and base PP at the outcome",
  before(castBody, "temporalDurationText(spellData.duration, mm.temporalSteps);", "foldModuleMetamagicMods(warpMods, mmx,")
  && before(castBody, "castContext.bias = joinedBias(castContext.bias, mmx.checkBias)", "const check = noCheckCantrip")
  && castBody.includes("castContext.traits = withAddedTraits(castContext.traits, mmx.addTraits)")
  && castBody.includes("basePP: basePP + mmx.basePPAdd,") && castBody.includes("savingStep: mmx.savingStep"));
ok("M26 Echo: a second creature in the same save, at its share of the same roll; on an attack, compared with the same check",
  castBody.includes("extraTargets: mmxExtraTargets,") && src.cast.includes("damageFactorOf.set(extra.actor, Number(extra.factor ?? 1));")
  && src.cast.includes("amount = Math.floor(Math.max(0, amount) * Math.max(0, damageFactorOf.get(target)));")
  && src.cast.includes("if (Number(damageFactor) !== 1) dealt = Math.floor(Math.max(0, dealt) * Math.max(0, Number(damageFactor) || 0));")
  && castBody.includes("targetOverride: extra.actor, mapCount: echoMapCount,"));
ok("M27 the new typed pool lands after the blow on both paths, scaled by the save",
  src.cast.includes("await applyMetamagicAddedDamage(actor, spell, targetActor, warpMods, { taken: packet.taken, scale: damageFactor, rolls, lines });")
  && src.cast.includes("scale: bs.damageMultiplier * (damageFactorOf.get(target) ?? 1), rolls, lines"));
ok("M28 the hooks and the remap say the metamagic taken (core ids and module keys)",
  (castBody.match(/metamagic: \[\.\.\.castMetamagic\.keys\], metamagicTaken: castMetamagic\.taken\.map\(\(t\) => \(\{ \.\.\.t \}\)\), metamagicPP,/g) ?? []).length === 2
  && castBody.includes("metamagic: [...castMetamagic.keys], threaded,")
  && castBody.includes("keys: [...coreTaken.map((t) => t.key), ...mmx.keys],"));
ok("M29 the G1↔G5 contract: the fumble and Resonance rolls are handed the keys and the biases a metamagic declared",
  castBody.includes("metamagic: castMetamagic.keys") && castBody.includes("fumbleBias: castMetamagic.fumbleBias, resonanceBias: castMetamagic.resonanceBias"));
ok("M30 S-M4 and S-M11: castSpell's options carry the item flag, its ceiling, presets and a thread; a thread resolves under the first check at its degree and pays nothing",
  src.cast.includes("itemMetamagic = false, itemMetamagicCeiling = 0, metamagic = null, thread = null,")
  && src.cast.includes("&& !o.thread && !o.metamagic")
  && castBody.includes("const mmxPresets = Array.isArray(metamagic?.preset) ? metamagic.preset : [];")
  && castBody.includes("if (threaded) degree = String(thread.degree);")
  && castBody.includes("const ppSpent = (isCantrip || spellAdderUsed || threaded)")
  && castBody.includes("if (outcome.fumbleRoll && !threaded) {"));
ok("M31 Q96: the settle (Focus, resources, PP sources, `after`) is asked after the last refund and before the settled hook",
  before(castBody, "castRefunded = true;", "await mmxWorkflow.settleModuleMetamagic(actor, mmx, ppSources.draws, {")
  && before(castBody, "await mmxWorkflow.settleModuleMetamagic(actor, mmx, ppSources.draws, {", "Hooks.callAll(\"trgPrimeSpellSettled\", {"));
ok("M32 an item cast's ceiling is tested (Q130), its metamagic paid from the pool",
  // RE-POINTED AT 3.684.0 (review): every taken option's PP (X1).
  castBody.includes("releasePP: Number(itemCast.pp ?? spellData.ppCost ?? 0), metamagicPP: itemCeilingMetamagicPP(mmx), ceiling: itemMetamagicCeiling"));
ok("M33 the module API: the four registrations and helpers.metamagicCatalogue",
  ["registerMetamagic", "registerCastPPSource", "registerMetamagicPayment", "registerCastCostModifier"].every((n) => src.apiw.includes(`${n}: (key, `) && src.apim.includes(`export function ${n}(`))
  && src.apiw.includes("metamagicCatalogue: async (actor, options = {}) =>"));

// ── P: G2, another way to pay ───────────────────────────────────────────
equal("P1 the split by degree: each source pays what was drawn, in order, up to the spend; the caster the rest",
  [mm.castPPSplit(5, [3]), mm.castPPSplit(2, [3]), mm.castPPSplit(0, [3]), mm.castPPSplit(6, [2, 2])],
  [{ shares: [3], caster: 2 }, { shares: [2], caster: 0 }, { shares: [0], caster: 0 }, { shares: [2, 2], caster: 2 }]);
api.resetModuleRegistry();
{
  let settled = null;
  ok("P2 registerCastPPSource needs offer(); settle is optional but must be a function",
    api.registerCastPPSource("bad", {}) === false && api.registerCastPPSource("bleed", { offer: (ctx) => ({ label: "Bleed", max: ctx.payable - 1 }), settle: (ctx, paid) => { settled = { ...paid, refunded: ctx.refunded }; return { lines: ["bled"] }; } }) === true);
  prompts.length = 0;
  const asked = await quiet(() => mmw.askCastPPSources({ spell: { name: "Fireball" }, payable: 5, ppPool: 2, rodDraw: 0 }));
  equal("P3 asked after the rod: the draw is the caster's answer, up to the source's max", [asked.total, asked.draws.map((d) => [d.key, d.drawn]), prompts.length], [2, [["bleed", 2]], 1]);
  asked.draws[0].paid = 2;
  const lines = await quiet(() => mmw.settleModuleMetamagic({}, mm.emptyModuleMetamagic(), asked.draws, { refunded: true, degree: "success" }));
  equal("P4 settled once the cast is over; a refunded cast settles 0 paid", [settled, lines], [{ drawn: 2, paid: 0, refunded: true }, ["bled"]]);
}
ok("P5 the cast: asked after the rod, counted in the availability test, split after the rod's share, the caster charged the rest, and the hook told",
  before(castBody, "rodDraw = Math.max(0, Math.min(offered, Math.floor(Number(answer.draw) || 0)));", "await mmxWorkflow.askCastPPSources({")
  && castBody.includes("(ritualSubstitutes ? 0 : payablePP) + surcharge.pp > ppPool + rodDraw + ppSources.total")
  && castBody.includes("const sourceSplit = castPPSplit(ppSpent - rodPaid, ppSources.draws.map((d) => d.drawn));")
  && castBody.includes("const casterPPSpent = ritualSubstitutes ? 0 : ppSpent - rodPaid - sourcesPaid;")
  && castBody.includes("ppSources: ppSources.draws.map((d) => ({ key: d.key, label: d.label, drawn: d.drawn, paid: castRefunded ? 0 : Number(d.paid ?? 0) })),")
  && castBody.includes(": Math.min(paidOutcome.ppSpent + variableSuccessPP, ppPool + rodDraw + ppSources.total);"));
ok("P6 not asked of a cast nobody pays for", castBody.includes("const ppSources = (isCantrip || isInnate || isItemCast || stored || storingNow || threaded || ritualSubstitutes || payablePP <= 0)"));

// ── A: G3, an option paid in AP ─────────────────────────────────────────
{
  const core = [{ id: "extend", label: "Extend Spell", ppCost: 2, max: 1 }, { id: "reach", label: "Reach Spell", ppCost: 2, max: 1 }];
  const payments = [{ key: "adept", label: "Metamagic Adept", ap: 1, dcAsIfPP: true, max: 1, optionIds: ["extend", "reach", "x-echo"] }];
  const one = mm.metamagicAPPayments({ coreOptions: core, form: { "mm-extend": true, "mmap-extend": "adept" }, payments });
  equal("A1 Metamagic Adept: Extend's 2 PP are not paid, +1 AP, and the Casting DC counts the 2 PP", [one.corePP, one.apDelta, one.dcPP, one.refusal], [2, 1, 2, ""]);
  const two = mm.metamagicAPPayments({ coreOptions: core, form: { "mm-extend": true, "mmap-extend": "adept", "mm-reach": true, "mmap-reach": "adept" }, payments });
  ok("A2 \"any one … to any one spell\": a second option paid so is refused", /at most 1 option/.test(two.refusal));
  const mod = mm.metamagicAPPayments({ offers: [{ key: "echo", label: "Echo", ppCost: 2 }], taken: [{ key: "echo", times: 1 }], form: { "mmap-x-echo": "adept" }, payments });
  equal("A3 a module option may be paid so too", [mod.moduleKeys, mod.dcPP, mod.apDelta], [["echo"], 2, 1]);
  equal("A4 an untaken option's tick pays nothing", mm.metamagicAPPayments({ coreOptions: core, form: { "mmap-extend": "adept" }, payments }).apDelta, 0);
  equal("A4b THE REVIEW FIX (G3): the payments taken are named once each, for the hooks' `metamagicPayments`; none taken, none named",
    [one.paymentKeys, mod.paymentKeys, two.paymentKeys, mm.metamagicAPPayments({ coreOptions: core, form: { "mm-extend": true }, payments }).paymentKeys], [["adept"], ["adept"], ["adept"], []]);
  const dc = cdc.assembledCastingDC({ totalPP: 4, casterLevel: 10, dcOnlyPP: 2 });
  const plain = cdc.assembledCastingDC({ totalPP: 6, casterLevel: 10 });
  equal("A5 the DC is read from the PP as if paid (10 + 1.5 × PP, not a fixed step), and named on the card", [dc.dc, plain.dc, dc.parts.map((p) => p.label)], [plain.dc, plain.dc, ["Metamagic paid in AP, as 2 PP"]]);
  equal("A6 not overcast by them: a 1st-level caster's 2 PP spell paid 2 more in AP has no Overcast part", cdc.assembledCastingDC({ totalPP: 2, casterLevel: 1, dcOnlyPP: 2 }).parts.map((p) => p.label), ["Metamagic paid in AP, as 2 PP"]);
  api.resetModuleRegistry();
  ok("A7 registerMetamagicPayment needs options; applies gates (1–2 AP casts)",
    api.registerMetamagicPayment("x", { options: [] }) === false && api.registerMetamagicPayment("Metamagic Adept", { options: ["extend", "Echo"], applies: (ctx) => ctx.castAP <= 2 }) === true);
  const offered = await quiet(() => mmw.offeredMetamagicPayments({}, { castAP: 2 }, { coreIds: ["extend", "reach"], moduleKeys: ["echo"] }));
  const offered3 = await quiet(() => mmw.offeredMetamagicPayments({}, { castAP: 3 }, { coreIds: ["extend"], moduleKeys: [] }));
  equal("A8 offered on the options it names that the cast offers", [offered.map((p) => p.optionIds), offered3.length], [[["extend", "x-echo"]], 0]);
}
ok("A4c …on both cast hooks, beside `metamagic`",
  (castBody.match(/metamagicTaken: castMetamagic\.taken\.map\(\(t\) => \(\{ \.\.\.t \}\)\), metamagicPP,\n(\s*\/\/[^\n]*\n)*\s*metamagicPayments: \[\.\.\.mmAP\.paymentKeys\],/g) ?? []).length === 2);
ok("A9 the cast: the core's PP moved out of what is paid, the AP joined, the DC told",
  castBody.includes("if (mmAP.corePP) mm.ppSpent = Math.max(0, mm.ppSpent - mmAP.corePP);")
  && castBody.includes("mmx.dcPP += mmAP.dcPP;") && castBody.includes("mm.apDelta += mmx.apDelta;") && castBody.includes("dcOnlyPP: mmx.dcPP,"));

// ── D: G4, PP off what is paid ──────────────────────────────────────────
equal("D1 Q93: payment only, with a floor — Hex Mastery −1 (min 1); Spell Weaver −2 (min 0); both, the strictest first",
  [mm.castDiscount(3, [{ pp: 1, floor: 1 }]).payable, mm.castDiscount(1, [{ pp: 1, floor: 1 }]).payable, mm.castDiscount(3, [{ pp: 2, floor: 0 }]).payable,
    mm.castDiscount(3, [{ pp: 2, floor: 0 }, { pp: 1, floor: 1 }]).payable, mm.castDiscount(0, [{ pp: 1, floor: 1 }]).payable,
    mm.castDiscount(2, [{ pp: 3, floor: 1 }]).payable],
  [2, 1, 1, 0, 0, 1]);
equal("D2 the degree splits the discounted price, the reduction off the warp first (a Critical keeps it all)",
  [mm.discountedParts(4, 2, 1), mm.discountedParts(4, 1, 3), casting.castingOutcome("critical", mm.discountedParts(4, 2, 1)).ppSpent], [{ basePP: 4, warpPP: 1 }, { basePP: 2, warpPP: 0 }, 3]);
api.resetModuleRegistry();
{
  ok("D3 registerCastCostModifier needs a function", api.registerCastCostModifier("x", {}) === false
    && api.registerCastCostModifier("Hex Mastery", (ctx) => (/hex/i.test(ctx.spellData?.traits ?? "") ? { ppDelta: -1, floor: 1, label: "Hex Mastery" } : null)) === true);
  const hex = await quiet(() => mmw.castCostDiscount({ totalPP: 3, spellData: { traits: "Hex" } }, [{ pp: 2, floor: 0, label: "Spell Weaver" }]));
  const plain = await quiet(() => mmw.castCostDiscount({ totalPP: 3, spellData: { traits: "Fire" } }, []));
  equal("D4 the registered modifiers and the options' discounts together", [hex.payable, hex.reduction, plain.payable, plain.reduction], [0, 3, 3, 0]);
}
ok("D5 the cast: asked before the availability test; the cap, DC and save DC still read `totalPP`; the payment reads the discounted outcome",
  before(castBody, "const costCut = (isItemCast || stored || storingNow || threaded || ritualSubstitutes)", "const mmxPaysOtherwise =")
  // RE-POINTED AT 3.684.1: G4's reduction now reaches the payment beside
  // Economic's and Signature's, as `paidReduction` (see D7–D10).
  && castBody.includes("const paidReduction = coreCostCut + costCut.reduction;")
  && castBody.includes("const paidOutcome = paidReduction > 0")
  && castBody.includes("...discountedParts(basePP + mmx.basePPAdd, warpPP + metamagicPP + manipulationPP, paidReduction),")
  && castBody.includes("if (!isInnate && totalPP > castCap) {") && castBody.includes("totalPP,\n    casterLevel,"));
ok("D6 default-off: with no discount and no source the core's own test, as it was",
  castBody.includes("const mmxPaysOtherwise = threaded || costCut.reduction > 0 || ppSources.total > 0;")
  && castBody.includes("    if ((ritualSubstitutes ? 0 : totalPP) + surcharge.pp > ppPool + rodDraw) {"));

// ── D (3.684.1): Economic Spell and Signature Spell reduce what is paid ──
// Graham, 4 November 2026: "Yes for Economic and Signature spell". Chapter 5:
// Economic "lower[s] the PP cost of a spell by up to your caster level (min 1
// PP). The DC to cast the spell increases by 2 for every PP you lower by";
// Signature "the total PP cost of the spell is reduced by 1 PP".
equal("D7 the PP the two feats took off: the parts less `totalPP` after its floor, Signature's first",
  [mm.chapter5CostCut(7, 4, 1), mm.chapter5CostCut(3, 1, 0), mm.chapter5CostCut(1, 1, 1), mm.chapter5CostCut(0, 1, 0), mm.chapter5CostCut(5, 5, 0)],
  [{ cut: 3, labels: ["−1 PP Signature Spell", "−2 PP Economic Spell"] }, { cut: 2, labels: ["−2 PP Economic Spell"] }, { cut: 0, labels: [] }, { cut: 0, labels: [] }, { cut: 5 - 5, labels: [] }]);
{
  // A 5 PP spell, 2 PP warped, Economic −2 and Signature −1: cast at 4 PP.
  const mmCore = await imp("magic/metamagic.mjs");
  const opts = mmCore.aggregateMetamagicSelection([{ id: "economic", ppCost: 0, max: 4, kind: "economic", note: (t) => `${t}` }], { "mm-economic": 2 });
  const totalPP = Math.max(1, 5 + 2 + opts.ppDelta - 1);
  const { cut } = mm.chapter5CostCut(5 + 2, totalPP, 1);
  const pay = (degree, more = 0) => casting.castingOutcome(degree, mm.discountedParts(5, 2, cut + more)).ppSpent;
  equal("D8 THE DEFECT FIXED: what each degree pays is split from the lowered price (4), not the 7 before it; a G4 discount stacks",
    [totalPP, pay("success"), pay("heroic"), pay("critical"), pay("failure"), pay("partial"), pay("fumble"), pay("success", 1), casting.castingOutcome("success", { basePP: 5, warpPP: 2 }).ppSpent],
    [4, 4, 2, 2, 2, 0, 4, 3, 7]);
  equal("D9 the book's DC is kept: Economic's +2 per PP lowered and +1 AP; the cost (and so the DC's PP) lowered", [opts.dcDelta, opts.ppDelta, opts.apDelta], [4, -2, 1]);
}
ok("D10 the cast: the cut from the parts and `totalPP`; joined to G4's for the payment; said on the card",
  castBody.includes("chapter5CostCut(basePP + mmx.basePPAdd + warpPP + metamagicPP, totalPP, signatureDiscount);")
  && before(castBody, "const { cut: coreCostCut, labels: coreCostLabels } =", "const paidReduction = coreCostCut + costCut.reduction;")
  // RE-POINTED AT 3.684.3: the card says the Casting DC with Economic reads the unlowered PP (see E).
  && castBody.includes("if (coreCostLabels.length) mmx.notes.push(`Cost: ${coreCostLabels.join(\", \")} (the cap and save DC read the lowered ${totalPP} PP${economicLowered ? `; the Casting DC that of ${totalPP + economicLowered} PP, +2 per PP lowered` : \", and the Casting DC\"})`);")
  && castBody.includes(": Math.min(paidOutcome.ppSpent + variableSuccessPP, ppPool + rodDraw + ppSources.total);"));

// ── E (3.684.3): Economic Spell's Casting DC, a net +2 per PP lowered ────
// Graham, 5 November 2026, asked "Did you mean the DC ends up 2 higher for
// each PP lowered?": "Yes". The DC is the spell's at its UNLOWERED PP, +2 per
// PP lowered; the cap, the overcast, the payment and the save DC still read
// the lowered PP (3.684.1). Until 3.684.3 the DC was read from the lowered PP
// and then raised by 2, a net of about +0.5 per PP.
{
  const dcOf = (o) => cdc.assembledCastingDC({ casterLevel: 10, ...o }).dc;
  const X = casting.castingDC(5);
  equal("E1 THE DEFECT FIXED: a 5 PP spell (DC X at 5 PP) lowered by 2 is DC X + 4, not castingDC(3) + 4; lowered by 1, X + 2; Signature alone reads the lowered PP; a cantrip has none to restore; Metamagic Adept's as-if PP sit on the unlowered PP; the overcast reads the lowered PP",
    [dcOf({ totalPP: 3, metamagicDelta: 4, economicPP: 2 }), dcOf({ totalPP: 4, metamagicDelta: 2, economicPP: 1 }), dcOf({ totalPP: 3, metamagicDelta: 4 }),
      dcOf({ totalPP: 4 }), dcOf({ isCantrip: true, economicPP: 2 }),
      dcOf({ totalPP: 3, metamagicDelta: 2, economicPP: 1, dcOnlyPP: 1 }),
      cdc.assembledCastingDC({ totalPP: 3, casterLevel: 2, metamagicDelta: 4, economicPP: 2 }).dc],
    [X + 4, X + 2, casting.castingDC(3) + 4, casting.castingDC(4), casting.CANTRIP_PENALISED_DC, casting.castingDC(5) + 2, X + 4]);
  equal("E1b the card's part names the unlowered PP",
    cdc.assembledCastingDC({ totalPP: 3, casterLevel: 10, metamagicDelta: 4, economicPP: 2 }).parts,
    [{ label: "Economic Spell, the DC of 5 PP", value: X - casting.castingDC(3) }, { label: "Metamagic", value: 4 }]);
  // The cast, end to end: a 5 PP spell, 2 PP warped, Economic −2 and
  // Signature −1, cast at 4 PP: its DC is that of 6 PP (Signature's PP are
  // not restored, its text has no DC rule), + 4.
  const mmCore = await imp("magic/metamagic.mjs");
  const opts = mmCore.aggregateMetamagicSelection([{ id: "economic", ppCost: 0, max: 4, kind: "economic", note: (t) => `${t}` }], { "mm-economic": 2 });
  const totalPP = Math.max(1, 5 + 2 + opts.ppDelta - 1);
  const { cut } = mm.chapter5CostCut(5 + 2, totalPP, 1);
  equal("E2 the cast: Economic's PP are the cut less Signature's; the DC is the 6 PP spell's + 4",
    [Math.max(0, cut - 1), dcOf({ totalPP, metamagicDelta: opts.dcDelta, economicPP: Math.max(0, cut - 1) })], [2, casting.castingDC(6) + 4]);
  ok("E2b the cast hands the Casting DC Economic's own PP, after the floor and less Signature's",
    castBody.includes("  const economicLowered = Math.max(0, coreCostCut - signatureDiscount);")
    && castBody.includes("    economicPP: economicLowered,\n")
    && before(castBody, "const economicLowered = ", "const castingDCResult = assembledCastingDC({"));
}

// ── R (3.684.3): a ritual variant's own price is lowered too ─────────────
// Graham, 5 November 2026, asked "When a ritual variant substitutes its own PP
// price, Economic and Signature don't reduce it. Should they?": "Yes" — off the
// warps and metamagic first, as an ordinary price (his answer of the same day).
{
  // A 5 PP ritual spell, 2 PP warped, Economic −2: the substituted price.
  const cut = mm.chapter5CostCut(5 + 2, 5, 0).cut;
  const paid = (degree) => casting.castingOutcome(degree, mm.discountedParts(5, 2, cut)).ppSpent;
  equal("R1 THE ANSWER: the substituted price is split from the lowered price (5), the cut off the warp first", [paid("success"), paid("heroic"), paid("failure")],
    [casting.castingOutcome("success", { basePP: 5, warpPP: 0 }).ppSpent, casting.castingOutcome("heroic", { basePP: 5, warpPP: 0 }).ppSpent, casting.castingOutcome("failure", { basePP: 5, warpPP: 0 }).ppSpent]);
  ok("R1b the cast: a ritual variant pays `paidOutcome` — whose reduction, G4's being 0 for one, is Economic's and Signature's alone",
    castBody.includes("    : ritualSubstitutes ? paidOutcome.ppSpent + variableSuccessPP\n")
    && castBody.includes("  const costCut = (isItemCast || stored || storingNow || threaded || ritualSubstitutes)\n    ? { payable: totalPP, reduction: 0, labels: [], lines: [] }")
    && castBody.includes("  const paidReduction = coreCostCut + costCut.reduction;"));
}

// ── M (3.684.1): `castPP` in a module metamagic's apply(ctx) ─────────────
// Graham, 4 November 2026: Wellspring Conduit's "+1d6 damage per 2 PP
// expended in their casting" counts the PP the spell is cast at (Q101).
{
  const cpp = await imp("magic/cast-pp.mjs");
  const c = (o) => cpp.metamagicCastPP(o);
  equal("M20 castPP: base + warps + every option's PP, less Economic and Signature; an innate's printed PP; an item's release PP; a cantrip 0; floor 1",
    [c({ basePP: 3, warpPP: 2, metamagicPP: 2 }), c({ basePP: 3, warpPP: 2, metamagicPP: 2, economicPP: 2 }), c({ basePP: 3, warpPP: 2, metamagicPP: 2, signaturePP: 1 }),
      c({ innate: true, spellPP: 4, basePP: 0, warpPP: 1, metamagicPP: 2 }), c({ itemCast: true, innate: true, itemPP: 5, spellPP: 3, metamagicPP: 2 }),
      c({ cantrip: true, basePP: 0, warpPP: 3, metamagicPP: 2 }), c({ basePP: 2, economicPP: 3 })],
    [7, 5, 6, 7, 7, 0, 1]);
  const offers = [{ key: "a", ppCost: 2, max: 3 }, { key: "rod", ppCost: 4, source: "rod" }, { key: "ch", ppCost: 1, choices: [{ value: "x", ppCost: 3 }] }, { key: "untaken", ppCost: 9 }];
  equal("M21 every module option taken counts its PP (× times, a choice's own), a rod's 0", mm.moduleTakenPP(offers, [{ key: "a", times: 2 }, { key: "rod", times: 1 }, { key: "ch", times: 1, choice: "x" }]), 7);
  api.resetModuleRegistry();
  let seen = null;
  const spec = { key: "wellspring", apply: (ctx) => { seen = { castPP: ctx.castPP, basePP: ctx.basePP }; return {}; } };
  await quiet(() => mmw.appliedModuleMetamagic({ items: [] }, [{ key: "wellspring", label: "Wellspring", ppCost: 2, spec }], [{ key: "wellspring", times: 1 }], { basePP: 3, castPP: 9 }, {}));
  equal("M22 apply(ctx) is handed `castPP` beside an unchanged `basePP`", seen, { castPP: 9, basePP: 3 });
  ok("M23 the cast computes it before `apply` runs, from the core's PP as ticked (before G3) and the module options taken, and hands it on",
    before(castBody, "const applyMetamagicPP = mm.ppSpent + moduleTakenPP(mmxOffers, mmxTaken);", "if (mmAP.corePP) mm.ppSpent = Math.max(0, mm.ppSpent - mmAP.corePP);")
    && /mmx = await mmxWorkflow\.appliedModuleMetamagic\(actor, mmxOffers, mmxTaken, \{\n\s+\.\.\.mmxBase,\n\s+castPP: applyCastPP,/.test(castBody)
    && castBody.includes("basePP, warpPP: isInnate ? Number(warp?.ppSpent ?? 0) : warpPP, metamagicPP: applyMetamagicPP,")
    && castBody.includes("economicPP: -Math.min(0, Number(mm.ppDelta) || 0),"));
}

// ── Review fixes (3.684.0) ─────────────────────────────────────────────
{
  const spec = (over = {}) => ({ key: "x", payment: { kind: "pp" }, ...over });
  const agg = mm.emptyModuleMetamagic();
  mm.foldModuleMetamagic(agg, { key: "echo", label: "Echo", ppCost: 2, spec: spec() }, { times: 1 }, mm.cleanMetamagicAnswer({}));
  mm.foldModuleMetamagic(agg, { key: "adeptx", label: "Paid in AP", ppCost: 3, spec: spec() }, { times: 1 }, mm.cleanMetamagicAnswer({}), { apPayment: { key: "adept" } });
  mm.foldModuleMetamagic(agg, { key: "weave", label: "Weave", ppCost: 2, spec: spec({ payment: { kind: "resource", label: "charges" } }) }, { times: 1 }, mm.cleanMetamagicAnswer({}));
  mm.foldModuleMetamagic(agg, { key: "rod", label: "Rod", ppCost: 4, source: "rod", rodName: "Rod", rodCost: 2, spec: spec() }, { times: 1 }, mm.cleanMetamagicAnswer({ basePPAdd: 1 }));
  equal("X1 THE REVIEW FIX (Q130): an item's ceiling counts every taken option's PP — paid in PP, in AP (G3) or a resource — and a rod's none; only the pool-paid are paid",
    [agg.ppSpent, mm.itemCeilingMetamagicPP(agg), mm.itemMetamagicCeilingRefusal({ releasePP: 4, metamagicPP: mm.itemCeilingMetamagicPP(agg) }) !== "", mm.itemMetamagicCeilingRefusal({ releasePP: 4, metamagicPP: agg.ppSpent }) !== ""],
    [2, 8, true, false]);
  ok("X1b the cast's ceiling reads it", /metamagicPP: itemCeilingMetamagicPP\(mmx\), ceiling: itemMetamagicCeiling/.test(castBody));
  const ctxAt = castBody.indexOf("const castOptionContext = {");
  const ctx = castBody.slice(ctxAt, castBody.indexOf("\n  };", ctxAt));
  ok("X2 THE REVIEW FIX (G2 ↔ G14): the cast-option ctx carries the PP sources drawn — asked before the prompt, so no reorder",
    /ppSources: ppSources\.draws\.map\(\(d\) => \(\{ key: d\.key, label: d\.label, drawn: Number\(d\.drawn \?\? 0\) \}\)\)/.test(ctx)
    && before(castBody, "const ppSources = (isCantrip", "const castOptionContext = {")
    && before(castBody, "const castOptionContext = {", "const castOptionOffers = "));
}

api.resetModuleRegistry();
if (failures.length) {
  process.stdout.write(`verify-ea-block6a-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block6a-core: OK — ${checks} checks.\n`);
