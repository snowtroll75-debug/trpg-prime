#!/usr/bin/env node
/**
 * verify-recurring-stacking — TRG Prime 3.685.0: recurring damage stacks by
 * damage type, and bleeding stacks.
 *
 * Graham, 7 November 2026 (Eldritch Arts Block 7, Q150): "recurring damage
 * stacks with a flat check made for totals of the same damage type. Bleed is
 * different for the flat check (only up to 4) but still stacks (or at least
 * it should do)."
 *
 * The book (Chapter 7, Bleed Damage): "The number of HPs lost due to Bleed
 * from different wounds is cumulative." "If you are suffering from light
 * bleeding, you may attempt to remove it in the same way as other recurring
 * damage each round by making a flat check." Light is 1 to 4.
 *
 *   R1  the one rule, recurringAfterHit: same type adds; another type is its
 *       own total; nothing replaces; untyped is fire
 *   R2  recurringByType: one total, one packet and one flat check per type
 *   R3  the real TRGActor toggle: a value with a type sets THAT type's effect;
 *       a second type is a second effect; removal by type, or all of them
 *   R4  the real applyConditionTags: a recurring tag stacks onto its own
 *       type only; bleeding adds
 *   R5  layRecurring through the real toggle: a bomb's, a weapon's, a spell's
 *   R6  every source lays it through layRecurring (the wiring)
 *   R7  the end phase: a packet per type's total, one flat check per type,
 *       DR never reduces it; bleed's flat check only in the Light band
 *   R8  the sheet's step and remove keep to the row's own type
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

const DialogV2 = { wait: async () => null, confirm: async () => false, prompt: async () => null };
globalThis.foundry = { applications: { api: { DialogV2 }, ux: {} }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false,
  mergeObject: (a, b) => Object.assign(a ?? {}, b ?? {}), deepClone: (x) => structuredClone(x), escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.Hooks = { on() {}, once() {}, off() {}, callAll() {}, call() { return true; } };
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => d };
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
globalThis.CONFIG = { statusEffects: [], specialStatusEffects: {} };
globalThis.game = { settings: { get: () => null }, user: { id: "u", isGM: true, targets: new Set() }, users: [], combat: null, time: { worldTime: 0 } };
globalThis.Actor = class { constructor() {} async toggleStatusEffect() { return false; } };

const R = await imp("conditions/recurring.mjs");
const RW = await imp("conditions/recurring-workflow.mjs");
const { TRGActor } = await imp("documents/actor.mjs");
const EA = await imp("combat/effect-application-workflow.mjs");
const CR = await imp("conditions/condition-rules.mjs");
const REG = await imp("conditions/registry.mjs");

// ── R1 ────────────────────────────────────────────────────────────────────
equal("R1 same type adds (2 acid + 1 acid = 3 acid); another type stands alone (2 fire, then 1 acid is acid 1); untyped is fire; nothing is ever replaced",
  [R.recurringAfterHit({ value: 2, damageType: "acid" }, 1, "acid"), R.recurringAfterHit({ value: 2, damageType: "fire" }, 1, "acid"),
    R.recurringAfterHit(null, 3, ""), R.recurringAfterHit(4, 2, "Force"), R.recurringAfterHit(5, 0, "cold")].map((n) => [n.value, n.damageType, n.before, n.stacked, n.replaced]),
  [[3, "acid", 2, true, false], [1, "acid", 0, false, false], [3, "fire", 0, false, false], [6, "force", 4, true, false], [5, "cold", 5, false, false]]);
equal("R1b the card's words", [R.recurringStackLine(R.recurringAfterHit(2, 3, "acid")), R.recurringStackLine(R.recurringAfterHit(0, 3, "acid"))],
  ["Recurring 5 acid (2 + 3, stacked)", "Recurring 3 acid"]);

// ── R2 ────────────────────────────────────────────────────────────────────
const fx = (id, v, t) => ({ id, statuses: new Set(["recurring"]), flags: { "trg-prime": { condition: "recurring", value: v, damageType: t } } });
equal("R2 one total per type, first-seen order; two effects of one type (an older world) are one total; untyped reads as fire; disabled and non-recurring effects are not read",
  R.recurringByType(R.recurringEntries([fx("a", 2, "fire"), fx("b", 3, "acid"), fx("c", 1, null), { ...fx("d", 9, "acid"), disabled: true },
    { id: "e", statuses: new Set(["bleeding"]), flags: { "trg-prime": { value: 4 } } }])).map((g) => [g.damageType, g.value, g.effects.map((e) => e.id)]),
  [["fire", 3, ["a", "c"]], ["acid", 3, ["b"]]]);
equal("R2a the grouping reads the type as stored, an untyped entry and \"Fire\" are one fire total",
  R.recurringByType([{ value: 1, damageType: null }, { value: 2, damageType: "Fire" }, { value: 4, damageType: "acid" }]).map((g) => [g.damageType, g.value]), [["fire", 3], ["acid", 4]]);
equal("R2b the total of one type", [R.recurringOfType(R.recurringEntries([fx("a", 2, "fire"), fx("b", 3, "acid")]), "acid"), R.recurringOfType([], "acid")], [3, 0]);

// ── R3: the real toggle ─────────────────────────────────────────────────
function creature() {
  const a = new TRGActor();
  const list = [];
  const make = (data) => {
    const flags = structuredClone(data.flags ?? {});
    const e = { id: `e${list.length + 1}`, name: data.name, statuses: new Set(data.statuses ?? []), flags, disabled: false,
      getFlag(s, k) { return this.flags?.[s]?.[k]; },
      async update(u) { for (const [k, v] of Object.entries(u)) { if (k === "name") this.name = v; else { const parts = k.split("."); let o = this; while (parts.length > 1) { const p = parts.shift(); o[p] ??= {}; o = o[p]; } o[parts[0]] = v; } } return this; },
      async delete() { const i = list.indexOf(this); if (i >= 0) list.splice(i, 1); } };
    list.push(e); return e;
  };
  Object.defineProperty(a, "effects", { value: Object.assign(list, { get: (id) => list.find((e) => e.id === id) }) });
  Object.assign(a, {
    name: "Target", isOwner: true, uuid: "Actor.t", system: {}, items: [],
    isImmuneToCondition: () => false,
    async createEmbeddedDocuments(_t, docs) { return docs.map(make); },
    async deleteEmbeddedDocuments(_t, ids) { for (const id of ids) await list.find((e) => e.id === id)?.delete(); },
    getConditionValue(id) { return list.filter((e) => e.statuses.has(id)).reduce((s, e) => s + Number(e.flags["trg-prime"].value ?? 1), 0); }
  });
  return a;
}
const state = (a) => a.effects.filter((e) => e.statuses.has("recurring")).map((e) => [e.flags["trg-prime"].damageType, e.flags["trg-prime"].value]);
{
  const a = creature();
  await a.toggleStatusEffect("recurring", { value: 2, damageType: "fire" });
  await a.toggleStatusEffect("recurring", { value: 3, damageType: "acid" });
  const two = state(a);
  await a.toggleStatusEffect("recurring", { value: 5, damageType: "fire" });
  const fireSet = state(a);
  await a.toggleStatusEffect("recurring", { active: false, damageType: "acid" });
  const acidGone = state(a);
  await a.toggleStatusEffect("recurring", { value: 1, damageType: "cold" });
  await a.toggleStatusEffect("recurring", { active: false });
  equal("R3 the real TRGActor toggle: fire 2 then acid 3 is two effects; fire set to 5 moves only fire; removing acid leaves fire; a removal with no type ends every type",
    [two, fireSet, acidGone, state(a)], [[["fire", 2], ["acid", 3]], [["fire", 5], ["acid", 3]], [["fire", 5]], []]);
}

// ── R4: the real applyConditionTags ─────────────────────────────────────
{
  const a = creature();
  await EA.applyConditionTags(a, [{ key: "recurring", label: "Recurring", value: 2, damageType: "fire" }]);
  await EA.applyConditionTags(a, [{ key: "recurring", label: "Recurring", value: 3, damageType: "acid" }]);
  await EA.applyConditionTags(a, [{ key: "recurring", label: "Recurring", value: 1, damageType: "acid" }]);
  await EA.applyConditionTags(a, [{ key: "recurring", label: "Recurring", value: 2 }]);
  equal("R4 condition tags (a critical's, a spell row's): acid lands beside fire, a second acid adds to acid alone, an untyped tag adds to fire — before 3.685.0 the acid would have taken fire's total and its name",
    state(a), [["fire", 4], ["acid", 4]]);
  const c = creature();
  await EA.applyConditionTags(c, [{ key: "recurring", label: "Recurring", value: 3, damageType: "acid" }]);
  await EA.applyConditionTags(c, [{ key: "recurring", label: "Recurring", value: 2 }]);
  equal("R4a an untyped tag on a creature burning only acid is fire 2 beside acid 3, not a rewrite of the acid",
    state(c), [["acid", 3], ["fire", 2]]);
  const b = creature();
  await EA.applyConditionTags(b, [{ key: "bleeding", label: "Bleeding", value: 2 }]);
  await EA.applyConditionTags(b, [{ key: "bleeding", label: "Bleeding", value: 3 }]);
  equal("R4b bleeding stacks: 2 then 3 is Bleeding 5, one effect (the book: \"cumulative\")",
    b.effects.filter((e) => e.statuses.has("bleeding")).map((e) => e.flags["trg-prime"].value), [5]);
  equal("R4c the shared rule adds both: combinedConditionValue(bleeding 2, 3), (recurring 2, 3); slowed keeps the higher",
    [CR.combinedConditionValue("bleeding", 2, 3), CR.combinedConditionValue("recurring", 2, 3), CR.combinedConditionValue("slowed", 2, 1)], [5, 5, 2]);
}

// ── R5: layRecurring ─────────────────────────────────────────────────────
{
  const a = creature();
  const n1 = await RW.layRecurring(a, 2, "acid");
  const n2 = await RW.layRecurring(a, 1, "acid");
  const n3 = await RW.layRecurring(a, 4, "coldfire");
  const n4 = await RW.layRecurring(a, 0, "acid");
  const relayed = [];
  const n5 = await RW.layRecurring(a, 3, "acid", { apply: async (o) => { relayed.push(o); } });
  equal("R5 layRecurring through the real toggle: acid 2, +1 is acid 3, coldfire 4 beside it (Eaog Balls' two totals), 0 lays nothing; a relay is handed that type's new total",
    [[n1.value, n2.value, n2.stacked, n3.value, n4.added], state(a), relayed], [[2, 3, true, 4, 0], [["acid", 3], ["coldfire", 4]], [{ value: 6, damageType: "acid" }]]);
  ok("R5b its answer keeps the shape the module reads (`value`, `damageType`, `replaced: false`)", n5.value === 6 && n5.damageType === "acid" && n5.replaced === false);
}

// ── R6: the wiring ───────────────────────────────────────────────────────
{
  const src = {
    alch: read("module", "alchemical-workflow.mjs"), aw: read("module", "combat", "attack-workflow.mjs"), cw: read("module", "magic", "cast-workflow.mjs"),
    api: read("module", "module-api-workflow.mjs"), ea: read("module", "combat", "effect-application-workflow.mjs"), bombs: read("module", "bombs.mjs")
  };
  ok("R6 a bomb, a weapon's recurring +N, a spell attack's rider and a ladder's rung all lay it through layRecurring",
    /const next = await layRecurring\(targetActor, amount, damageType\);/.test(src.alch)
    && /const next = await layRecurring\(targetActor, amount, damageType\);\n\s+return `Plus <strong>\$\{recurringStackLine\(next\)\}<\/strong>/.test(src.aw)
    && /const next = await layRecurring\(targetActor, amount, damageType\);\n\s+lines\.push\(line\(\n\s+`Plus <strong>\$\{recurringStackLine\(next\)\}/.test(src.cw)
    && /const nextRecurring = await layRecurring\(target, rungPersistAmount, ladderType\);/.test(src.cw));
  ok("R6b helpers.addRecurringDamage lays it the same way, through the GM's relay",
    /return layRecurring\(target, Math\.max\(0, Math\.trunc\(Number\(amount\) \|\| 0\)\), String\(damageType \?\? ""\), \{\n\s+apply: \(options\) => relayStatus\(target, "recurring", options/.test(src.api));
  ok("R6c a condition tag reads its own type's total and stacks through recurringAfterHit; an untyped one is fire",
    /const wasAlreadyPresent = recurringTag \? recurringHere > 0 : directConditionEffect\(actor, tag\.key\) !== null;/.test(src.ea)
    && /\? \(await import\("\.\.\/conditions\/recurring\.mjs"\)\)\.recurringAfterHit\(existingValue, incomingValue, tag\.damageType\)\.value/.test(src.ea)
    && /\.\.\.\(recurringTag && !tag\.damageType \? \{ damageType: "fire" \} : \{\}\),/.test(src.ea));
  ok("R6e the bombs' old rule is gone from bombs.mjs, which says where it went",
    /THE RECURRING DAMAGE A HIT APPLIES moved to conditions\/recurring\.mjs at\n \* 3\.685\.0/.test(src.bombs) && !/export function recurringAfterHit/.test(src.bombs));
  const stray = ["alch", "aw", "cw", "api", "bombs"].filter((k) => /recurringAfterHit\(/.test(src[k]) || /find\(\(e\) => e\.statuses\?\.has\?\.\("recurring"\)\)/.test(src[k]));
  equal("R6d no source still finds \"the\" recurring effect or keeps a copy of the old rule", stray, []);
}

// ── R7: the end phase ───────────────────────────────────────────────────
{
  const src = read("module", "documents", "combat.mjs");
  ok("R7 the end phase deals a packet per type's total, DR never reducing it (2 Aug ruling), and one flat check per type that ends every effect of that type",
    /const recurringTotals = recurringByType\(recurrings\);\n\s+for \(const entry of recurringTotals\) \{/.test(src)
    && /amount: entry\.value,\n\s+type: entry\.damageType \|\| "fire",\n\s+applyDR: false,/.test(src)
    && /for \(const entry of recurringTotals\) \{\n(?:\s+const [^\n]+\n){1,4}\s+const check = await TRGCheck\.roll\(\{/.test(src)
    && /for \(const effect of entry\.effects\) await effect\.delete\(\);/.test(src)
    && !/await entry\.effect\.delete\(\);\n\s+lines\.push\(TRGCombat\.#chatLine\("The recurring damage/.test(src));
  ok("R7b bleeding: summed, its own flat check only in a self-removable band, and the whole bleed stops on a success (unchanged)",
    /const rawBleedTotal = bleeds\.reduce\(\(sum, b\) => sum \+ Math\.max\(0, b\.value\), 0\);/.test(src)
    && /if \(rawBleedTotal && bleedingSeverity\(rawBleedTotal\)\?\.selfRemovable\) \{/.test(src)
    && /for \(const entry of bleeds\) await entry\.effect\.delete\(\);/.test(src));
  equal("R7c the bands: only Light (1–4, \"only up to 4\") ends by a flat check",
    [1, 4, 5, 8, 9, 13].map((v) => [REG.bleedingSeverity(v)?.key, REG.bleedingSeverity(v)?.selfRemovable]),
    [["light", true], ["light", true], ["moderate", false], ["moderate", false], ["severe", false], ["dire", false]]);
}

{
  const fire = { id: "f", statuses: new Set(["recurring"]), flags: { "trg-prime": { condition: "recurring", value: 3, damageType: "fire", recurringFlatCheckReduction: 4 } } };
  const acid = { id: "a", statuses: new Set(["recurring"]), flags: { "trg-prime": { condition: "recurring", value: 2, damageType: "acid" } } };
  const feat = { id: "k", statuses: new Set(), flags: { "trg-prime": { recurringFlatCheckReduction: 1 } } };
  const groups = R.recurringByType(R.recurringEntries([fire, acid]));
  equal("R7d page 193's lever by type: smothering the flames (4 on the fire) eases the fire's check only; a feat's 1 eases both",
    groups.map((g) => [g.damageType, R.recurringFlatCheckEase([fire, acid, feat], g)]), [["fire", 5], ["acid", 1]]);
  ok("R7e the end phase reads it per type", /const recurringEasier = recurringFlatCheckEase\(actor\.appliedEffects \?\? actor\.effects \?\? \[\], entry, SYSTEM_ID\);/.test(read("module", "documents", "combat.mjs")));
}

// ── R9: "until healed" by type (review) ─────────────────────────────────
{
  const IW = await imp("injury-workflow.mjs");
  const flagged = () => { const a = creature(); const store = {}; a.getFlag = (_s, k) => store[k]; a.setFlag = async (_s, k, v) => { store[k] = v; }; a.unsetFlag = async (_s, k) => { delete store[k]; }; return a; };
  const heal = async (a, applied) => {
    await IW.recordPersistence(a, { code: "UH", conditions: IW.persistenceConditions(applied), effect: "acid critical" });
    await IW.settlePersistence(a, { fullHP: true, magicalHealing: true });
    return state(a);
  };
  const a = flagged();
  await RW.layRecurring(a, 3, "fire");
  const healedA = await heal(a, await EA.applyConditionTags(a, [{ key: "recurring", label: "Recurring", value: 2, damageType: "acid" }]));
  const b = flagged();
  const appliedB = await EA.applyConditionTags(b, [{ key: "recurring", label: "Recurring", value: 2, damageType: "acid" }]);
  await RW.layRecurring(b, 3, "fire");
  const healedB = await heal(b, appliedB);
  const c = flagged();
  await RW.layRecurring(c, 2, "acid");
  const healedC = await heal(c, await EA.applyConditionTags(c, [{ key: "recurring", label: "Recurring", value: 3, damageType: "acid" }]));
  equal("R9 the real settle path: a fire bomb then an acid \"until healed\" critical, healed, is fire 3 alone; the reverse order too; an acid critical stacked onto acid 2 takes off only its own 3",
    [healedA, healedB, healedC], [[["fire", 3]], [["fire", 3]], [["acid", 2]]]);
  const d = flagged();
  await RW.layRecurring(d, 3, "fire");
  await RW.layRecurring(d, 4, "acid");
  await d.setFlag("trg-prime", "injuryPersistence", [{ id: "old", code: "UH", conditions: [{ key: "recurring", value: 2 }], effect: "an older record" }]);
  await IW.settlePersistence(d, { fullHP: true, magicalHealing: true });
  equal("R9b a record from before 3.685.0 (no type) is read as fire, the type it was laid as, and leaves the acid alone", state(d), [["fire", 1], ["acid", 4]]);
  equal("R9c the record keeps the type and what the critical added",
    IW.persistenceConditions([{ key: "recurring", value: 5, added: 3, damageType: "acid" }, { key: "dazed", value: 2 }, { key: "stunned", value: 1, immune: true }]),
    [{ key: "recurring", value: 3, damageType: "acid" }, { key: "dazed", value: 2 }]);
}
// ── R10: the lever and the type survive an automated write (review) ──────
{
  const a = creature();
  await RW.layRecurring(a, 2, "fire");
  a.effects[0].flags["trg-prime"].recurringFlatCheckReduction = 4;
  await RW.layRecurring(a, 1, "fire");
  await EA.applyConditionTags(a, [{ key: "recurring", label: "Recurring", value: 1, damageType: "fire" }]);
  const b = creature();
  await RW.layRecurring(b, 3, "acid");
  await b.toggleStatusEffect("recurring", { value: 5 });
  equal("R10 a second flask and a critical keep the GM's lever on that type (4); a value written with no type keeps the effect's own type",
    [a.effects[0].flags["trg-prime"].recurringFlatCheckReduction, state(a), state(b)], [4, [["fire", 4]], [["acid", 5]]]);
}
// ── R11: a reducer that names no type lowers one type (review) ───────────
{
  const a = creature();
  await RW.layRecurring(a, 3, "fire");
  await RW.layRecurring(a, 5, "acid");
  const r1 = await RW.reduceRecurring(a, 1);
  const r2 = await RW.reduceRecurring(a, 3, "fire");
  equal("R11 reduceRecurring: no type lowers the largest (acid 5 → 4), never the sum written onto one; a named type is that type's (fire 3 → 0, removed)",
    [[r1.damageType, r1.from, r1.to], [r2.damageType, r2.to], state(a)], [["acid", 5, 4], ["fire", 0], [["acid", 4]]]);
  ok("R11b helpers.reduceCondition and a turn option's reduce:recurring use it",
    /if \(String\(key\) === "recurring"\) \{\n\s+const \{ reduceRecurring \} = await import\("\.\/conditions\/recurring-workflow\.mjs"\);/.test(read("module", "feats-workflow.mjs"))
    && /if \(condition === "recurring"\) \{\n\s+const \{ reduceRecurring \} = await import\("\.\.\/conditions\/recurring-workflow\.mjs"\);/.test(read("module", "magic", "turn-options-workflow.mjs")));
}
// ── R12: an unknown type's name (review) ─────────────────────────────────
equal("R12 a type's label is its own, never another's: \"Coldfire\", or the system's label",
  [R.recurringTypeLabel("coldfire", { fire: { label: "Fire" } }), R.recurringTypeLabel("fire", { fire: { label: "Fire" } }), R.recurringTypeLabel(null, {})], ["Coldfire", "Fire", "Fire"]);
ok("R12b the end phase's packet and flat check read it", (read("module", "documents", "combat.mjs").match(/const typeLabel = recurringTypeLabel\(entry\.damageType, DAMAGE_TYPES\);/g) ?? []).length === 2);

// ── R8: the sheet ───────────────────────────────────────────────────────
{
  const sheet = read("module", "sheets", "actor-sheet.mjs");
  ok("R8 the sheet's step and remove name the row's own type, so one row never ends another",
    /if \(next < 1\) return this\.actor\.toggleStatusEffect\(conditionId, \{ active: false, damageType: rowType \}\);/.test(sheet)
    && /return this\.actor\.toggleStatusEffect\(conditionId, \{ active: false, damageType: effect\.getFlag\(SYSTEM_ID, "damageType"\) \?\? \(conditionId === "recurring" \? "fire" : null\) \}\);/.test(sheet));
}

if (failures.length) {
  process.stdout.write(`verify-recurring-stacking: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-recurring-stacking: OK — ${checks} checks.\n`);
