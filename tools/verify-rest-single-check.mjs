#!/usr/bin/env node
/**
 * verify-rest-single-check — 3.710.2, Graham's ruling of 22 Nov 2026:
 * "If the party are resting for a long period of time which provoke
 * multiple checks, just make one check for the whole duration per
 * character." And how far that one result reaches ("multiplier whole
 * rest, rest once"):
 *   A  Healing Trance — one check; its multiplier covers every hour.
 *   B  Power Recovery — one check; its bonus is paid once.
 *   C  Fatigue Recovery — one save; it moves one step, once.
 *   D  What did not change: Active rests roll nothing, a one-hour rest is
 *      one of each, an unsafe rest heals nothing, sustaining blocks Power
 *      Recovery, the per-hour rest PP and a full night's fatigue clear.
 *   E  The summary card says one check and what it did.
 *   F  The Fatigue line says the change that landed (3.710.3, found live on
 *      3.710.2: a Success with no Fatigue printed "-1" though nothing moved),
 *      on the rest card and on the standalone Fatigue Recovery card.
 * Driven through performRestForActor itself, with TRGCheck.roll counted.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry = {
  applications: {
    api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c },
    handlebars: { renderTemplate: async () => "<div></div>" }
  },
  utils: { mergeObject: (a, b) => ({ ...a, ...b }), setProperty: () => {}, deepClone: (x) => JSON.parse(JSON.stringify(x)), getProperty: () => undefined }
};
globalThis.Roll = class { constructor(f) { this.f = f; } async evaluate() { this.total = 10; return this; } };
let posted = [];
globalThis.ChatMessage = { create: async (d) => { posted.push(d); return d; }, getSpeaker: () => ({}), applyMode: () => {} };
globalThis.renderTemplate = async () => "<div></div>";
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
globalThis.game = { settings: { get: () => false }, combat: null, user: { id: "u", isGM: true }, users: [], messages: { contents: [] }, time: { worldTime: 0 }, actors: [], i18n: { localize: (k) => k, format: (k) => k } };
globalThis.CONFIG = { statusEffects: [] };
globalThis.Hooks = { on: () => 0, once: () => 0, off: () => {}, callAll: () => true, call: () => true };

const { TRGCheck } = await import("../module/dice/check.mjs");
const { performRestForActor } = await import("../module/rest/rest-workflow.mjs");
const { rollFatigueRecovery } = await import("../module/combat/exhaustion-workflow.mjs");
const { postRestSummaryCard } = await import("../module/rest/rest-workflow.mjs");
const { naturalHealingHP, powerRecoveryBonus, restingPPRecovery } = await import("../module/rest/recovery.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

/* Every check the rest makes is counted here, by label, with the degree we hand back. */
let rolls = [];
let degreeFor = {};
TRGCheck.roll = async (config) => {
  rolls.push({ label: config.label, subtitle: config.subtitle });
  return { outcome: { degree: { key: degreeFor[config.label] ?? "failure" } } };
};

function makeActor({ level = 5, hp = 1, maxHP = 40, pp = 0, maxPP = 100, fatigued = 0 } = {}) {
  const flags = {};
  const state = { fatigued, updates: [] };
  const actor = {
    id: "a", uuid: "Actor.a", name: "Tester", type: "character",
    items: [], effects: [], appliedEffects: [],
    system: {
      identity: { level },
      magic: { casterLevelValue: level },
      resources: { hp: { value: hp, max: maxHP }, pp: { value: pp, max: maxPP, locked: 0 } },
      combat: { saves: { fortitude: { total: 0 } } },
      skills: { meditation: { total: 0 } }
    },
    flags: {},
    getFlag: (s, k) => flags[k], setFlag: async (s, k, v) => { flags[k] = v; }, unsetFlag: async (s, k) => { delete flags[k]; },
    getConditionValue: (id) => (id === "fatigued" ? state.fatigued : 0),
    hasCondition: () => false,
    toggleStatusEffect: async (id, { value, active } = {}) => { if (id === "fatigued") state.fatigued = active === false ? 0 : Number(value ?? 0); },
    update: async (u) => { state.updates.push(u); }
  };
  return { actor, state };
}
const rest = (actor, opts) => performRestForActor(actor, {
  activity: "resting", safeEnvironment: true, attemptHealingTrance: true, attemptPowerRecovery: true, sustainingASpell: false, ...opts
});
const count = (label) => rolls.filter((r) => r.label === label).length;

/* A — Healing Trance: one check over 8 hours, its ×2 on every hour. */
rolls = []; degreeFor = { "Healing Trance": "success", "Power Recovery": "failure", "Fatigue Recovery": "success" };
{
  const { actor } = makeActor({ maxHP: 40, hp: 1, maxPP: 1000 });
  const s = await rest(actor, { hours: 8 });
  equal("A1 an 8-hour rest makes one Healing Trance check", count("Healing Trance"), 1);
  equal("A2 its multiplier (×2 on a Success) covers all eight hours", s.hpHealedActual, Math.min(39, naturalHealingHP(40, 1) * 2 * 8));
  equal("A3 the summary records one roll spanning the rest", s.healingTranceRolls, [{ hours: 8, degree: "success", multiplier: 2 }]);
  ok("A4 the check says it is for the whole rest", /whole 8-hour rest/.test(rolls.find((r) => r.label === "Healing Trance")?.subtitle ?? ""), rolls.find((r) => r.label === "Healing Trance")?.subtitle);
}

/* B — Power Recovery: one check, bonus once (+5 PP at level 5 on a Critical). */
rolls = []; degreeFor = { "Healing Trance": "failure", "Power Recovery": "critical", "Fatigue Recovery": "failure" };
{
  const { actor } = makeActor({ level: 5, pp: 0, maxPP: 1000 });
  const s = await rest(actor, { hours: 8 });
  equal("B1 an 8-hour rest makes one Power Recovery check", count("Power Recovery"), 1);
  equal("B2 its bonus is paid once, beside the hourly resting PP", s.ppRecoveredActual, powerRecoveryBonus("critical", 5) + restingPPRecovery(5, 8));
  equal("B3 the summary records one roll and its bonus", s.powerRecoveryRolls, [{ hours: 8, degree: "critical", bonus: powerRecoveryBonus("critical", 5) }]);
}

/* C — Fatigue Recovery: one save, one step. */
rolls = []; degreeFor = { "Healing Trance": "failure", "Power Recovery": "failure", "Fatigue Recovery": "fumble" };
{
  const { actor, state } = makeActor({ fatigued: 2 });
  const s = await rest(actor, { hours: 8 });
  equal("C1 an 8-hour rest makes one Fatigue Recovery save", count("Fatigue Recovery"), 1);
  equal("C2 a Fumble raises Fatigue one step, once (2 → 3)", state.fatigued, 3);
  equal("C3 the summary holds one result spanning the rest", [s.fatigueResults.length, s.fatigueResults[0]?.hours, s.fatigueResults[0]?.delta], [1, 8, 1]);
  ok("C4 the save says it is for the whole rest", /whole 8-hour rest/.test(rolls.find((r) => r.label === "Fatigue Recovery")?.subtitle ?? ""));
}
rolls = []; degreeFor = { "Fatigue Recovery": "success" };
{
  const { actor, state } = makeActor({ fatigued: 4 });
  await rest(actor, { hours: 6 });
  equal("C5 a Success lowers it one step, once (4 → 3)", state.fatigued, 3);
}

/* D — what did not change. */
rolls = []; degreeFor = {};
{
  const { actor } = makeActor();
  await rest(actor, { hours: 8, activity: "active" });
  equal("D1 an Active rest rolls nothing", rolls.length, 0);
}
rolls = []; degreeFor = { "Healing Trance": "critical" };
{
  const { actor } = makeActor({ maxHP: 40, hp: 1 });
  const s = await rest(actor, { hours: 1 });
  equal("D2 a one-hour rest is one check of each, as before", [count("Healing Trance"), count("Power Recovery"), count("Fatigue Recovery")], [1, 1, 1]);
  equal("D3 and its healing is the one hour's, ×3 on a Critical", s.hpHealedActual, naturalHealingHP(40, 1) * 3);
  ok("D4 a one-hour check says so", /an hour of rest/.test(rolls.find((r) => r.label === "Healing Trance")?.subtitle ?? ""));
}
rolls = []; degreeFor = { "Healing Trance": "critical" };
{
  const { actor } = makeActor({ hp: 1 });
  const s = await rest(actor, { hours: 8, safeEnvironment: false });
  equal("D5 an unsafe rest makes no Healing Trance check and heals nothing", [count("Healing Trance"), s.hpHealedActual], [0, 0]);
  equal("D6 an unsafe rest still makes its one Fatigue save", count("Fatigue Recovery"), 1);
}
rolls = []; degreeFor = {};
{
  const { actor } = makeActor();
  await rest(actor, { hours: 8, sustainingASpell: true });
  equal("D7 sustaining a spell blocks the Power Recovery check", count("Power Recovery"), 0);
}
rolls = []; degreeFor = {};
{
  const { actor } = makeActor();
  await rest(actor, { hours: 8, attemptHealingTrance: false, attemptPowerRecovery: false });
  equal("D8 checks not attempted are not rolled; the Fatigue save still is", [count("Healing Trance"), count("Power Recovery"), count("Fatigue Recovery")], [0, 0, 1]);
}
rolls = []; degreeFor = { "Fatigue Recovery": "fumble" };
{
  const { actor, state } = makeActor({ fatigued: 3 });
  await rest(actor, { hours: 8, activity: "sleeping" });
  equal("D9 a full night's sleep still clears Fatigue after the one save", state.fatigued, 0);
}
rolls = []; degreeFor = {};
{
  const { actor } = makeActor({ hp: 1, maxHP: 400 });
  const s = await rest(actor, { hours: 8, attemptHealingTrance: false });
  equal("D10 without a trance, every hour's Natural Healing is still paid", s.hpHealedActual, naturalHealingHP(400, 1) * 8);
}


/* F — the Fatigue line says what landed. */
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
async function fatigueCard({ fatigued, degree, hours = 8 }) {
  rolls = []; degreeFor = { "Fatigue Recovery": degree };
  const { actor, state } = makeActor({ fatigued });
  const s = await rest(actor, { hours, attemptHealingTrance: false, attemptPowerRecovery: false });
  posted = [];
  await postRestSummaryCard(s);
  const line = plain(posted.at(-1)?.content).match(/Fatigue Recovery[^.]*\./)?.[0] ?? "";
  return { line, after: state.fatigued, result: s.fatigueResults[0] };
}
{
  const r = await fatigueCard({ fatigued: 0, degree: "success" });
  ok("F1 a Success with no Fatigue says there was none to recover", /Success — no Fatigue to recover\./.test(r.line), r.line);
  ok("F2 and prints no -1", !/-1/.test(r.line), r.line);
  equal("F3 the save reports it applied nothing from 0", [r.result.from, r.result.applied, r.after], [0, 0, 0]);
}
{
  const r = await fatigueCard({ fatigued: 2, degree: "success" });
  ok("F4 a Success from Fatigued 2 reads 2 → 1", /Success — Fatigue 2 → 1\./.test(r.line), r.line);
}
{
  const r = await fatigueCard({ fatigued: 0, degree: "fumble" });
  ok("F5 a Fumble from none reads 0 → 1", /Fumble — Fatigue 0 → 1\./.test(r.line), r.line);
}
{
  const r = await fatigueCard({ fatigued: 3, degree: "failure" });
  ok("F6 a Failure holds steady at its value", /Failure — Fatigue holds steady at 3\./.test(r.line), r.line);
}
{
  rolls = []; degreeFor = { "Fatigue Recovery": "success" };
  const { actor } = makeActor({ fatigued: 0 });
  posted = [];
  await rollFatigueRecovery(actor, { postCard: true });
  const card = plain(posted.at(-1)?.content);
  ok("F7 the standalone card says no Fatigue to recover, not \"reduces by 1, to 0\"", /No Fatigue to recover\./.test(card) && !/reduces by/.test(card), card);
  const { actor: a2 } = makeActor({ fatigued: 2 });
  posted = [];
  await rollFatigueRecovery(a2, { postCard: true });
  ok("F8 and from Fatigued 2 still reads reduces by 1, to 1", /reduces by 1, to 1\./.test(plain(posted.at(-1)?.content)), plain(posted.at(-1)?.content));
}

/* E — the summary card. */
const code = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "rest", "rest-workflow.mjs"), "utf8");
ok("E1 STRUCTURAL: the card names Healing Trance as one check covering every hour", /Healing Trance \(one check for the rest\)/.test(code) && /for every hour/.test(code));
ok("E2 STRUCTURAL: the card names Power Recovery as one check", /Power Recovery \(one check for the rest\)/.test(code));
ok("E3 STRUCTURAL: no per-hour check loop is left in the rest", !/for \(let hour = 0; hour < wholeHours; hour\+\+\) \{\s*if \(safeEnvironment\)/.test(code) && !/hour \$\{hour \+ 1\} of rest/.test(code));

const EXPECTED = 34;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-rest-single-check: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-rest-single-check: ${checks} checks — all green.`);
