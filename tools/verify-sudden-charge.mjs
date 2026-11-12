#!/usr/bin/env node
/**
 * verify-sudden-charge — TRG Prime 3.684.7: Sudden Charge makes a Charge
 * cost 2 AP.
 *
 * The book (Sudden Charge; Class, Chapter 5): "It only costs you 2 Action
 * Points to Charge instead of 3."
 *
 * Graham, 6 November 2026: "The charge action works fine but Sudden Charge
 * does not reduce the AP cost of a charge." Charge is an armed movement
 * action: resolveAction arms it and returns before its AP_COST_REDUCTION_FEATS
 * step, and the move paid ARMED_MOVEMENT_ACTIONS.charge.apCost (3).
 *
 *   C1  armedApCost: the table's cost less the actor's reductions
 *   C2  the move itself, through the real preMoveToken hook: 3 AP without
 *       the feat, 2 with it, and a 2-AP character with it may Charge
 *   C3  the arming card says what the move will cost
 *   C4  the Charge's Strike still costs nothing (the real resolveChargeStrike)
 *   C5  the wiring
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

const DialogV2 = { wait: async () => null, confirm: async () => false };
globalThis.foundry = { applications: { api: { DialogV2 }, ux: {} }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false,
  mergeObject: (a, b) => Object.assign(a ?? {}, b ?? {}), deepClone: (x) => structuredClone(x), escapeHTML: (s) => String(s), randomID: () => "r1" } };
const hooks = {};
globalThis.Hooks = { on(n, f) { hooks[n] = f; }, once() {}, off() {}, callAll() {}, call() { return true; } };
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => d, getWhisperRecipients: () => [], applyMode: () => {} };
const warnings = [], infos = [];
globalThis.ui = { notifications: { warn(m) { warnings.push(m); }, info(m) { infos.push(m); }, error(m) { warnings.push(m); } } };
globalThis.Roll = class { constructor(f) { this.f = f; } async evaluate() { this.total = 10; return this; } };
globalThis.renderTemplate = async () => "";
globalThis.CONFIG = {};
const sceneTokens = new Map();
globalThis.canvas = { tokens: { placeables: [] }, grid: { size: 100, distance: 5 }, scene: { id: "s", tokens: { get: (id) => sceneTokens.get(id) ?? null }, regions: [], getFlag() {} } };

const mw = await imp("combat/movement-workflow.mjs");
const cw = await imp("combat/charge-workflow.mjs");
mw.registerMovementHooks();

let n = 0;
function actor(ap, { feats = [], abilities = [] } = {}) {
  n += 1;
  return {
    name: "Charger", id: `c${n}`, uuid: `Actor.c${n}`, inCombat: true, isOwner: true,
    items: [...feats.map((name) => ({ type: "feat", name })), ...abilities.map((name) => ({ type: "ability", name }))],
    effects: [], appliedEffects: [], statuses: new Set(),
    flags: { "trg-prime": { armedMovement: "charge" } },
    system: { resources: { ap: { value: ap, max: 3 }, reactions: { value: 1, max: 1 } }, combat: { movement: { land: { base: 25, total: 25 } }, reach: 5 }, skills: {}, abilities: {}, identity: { level: 1 } },
    hasCondition() { return false; },
    getFlag(s, k) { return this.flags[s]?.[k]; }, async setFlag(s, k, v) { this.flags[s][k] = v; }, async unsetFlag(s, k) { delete this.flags[s][k]; },
    async update(c) { if ("system.resources.ap.value" in c) this.system.resources.ap.value = c["system.resources.ap.value"]; },
    getActiveTokens() { return []; }
  };
}
const setCombat = (a) => {
  globalThis.game = { settings: { get: () => null }, combat: { started: true, round: 1, id: "c", turn: 0, combatant: { actor: a, id: "cb" }, combatants: [] },
    user: { id: "u1", isGM: true, targets: new Set() }, users: [], scenes: { get: () => canvas.scene }, actors: [] };
};

// ── C1: the cost ─────────────────────────────────────────────────────────
setCombat(actor(3));
equal("C1 armedApCost: Charge is 3, 2 with Sudden Charge (a feat or a class ability), never below 0; a Stride or Step is untouched by it",
  [mw.armedApCost(actor(3), "charge", 3), mw.armedApCost(actor(3, { feats: ["Sudden Charge"] }), "charge", 3), mw.armedApCost(actor(3, { abilities: ["Sudden Charge"] }), "charge", 3),
    mw.armedApCost(actor(3, { feats: ["Sudden Charge"] }), "charge", 0), mw.armedApCost(actor(3, { feats: ["Sudden Charge"] }), "step", 1), mw.armedApCost(actor(3, { feats: [" sudden charge "] }), "charge", "3")],
  [3, 2, 2, 0, 1, 2]);

// ── C2: the move, through the real hook ─────────────────────────────────
async function charge(a) {
  setCombat(a);
  const td = { id: `t${a.id}`, actor: a, x: 0, y: 0, width: 1, height: 1, parent: canvas.scene, elevation: 0 };
  const movement = { method: "dragging", passed: { cost: 0, distance: 0, waypoints: [] }, pending: { cost: 20, distance: 20, waypoints: [{ x: 400, y: 0, action: "walk" }] }, destination: { x: 400, y: 0 } };
  warnings.length = 0; infos.length = 0;
  const allowed = hooks.preMoveToken(td, movement);
  await new Promise((r) => setTimeout(r, 20));
  return { allowed, ap: a.system.resources.ap.value, warned: warnings.slice(), said: infos.filter((m) => /^Charge:/.test(m)) };
}
const plain = await charge(actor(3));
const sudden = await charge(actor(3, { feats: ["Sudden Charge"] }));
const tight = await charge(actor(2, { feats: ["Sudden Charge"] }));
const short = await charge(actor(2));
equal("C2 a Charge costs 3 AP; with Sudden Charge, 2; a 2-AP character with Sudden Charge may Charge; without it, refused at 2 AP",
  [[plain.allowed, plain.ap, plain.said], [sudden.allowed, sudden.ap, sudden.said], [tight.allowed, tight.ap, tight.warned], [short.allowed, short.ap, short.warned]],
  [[true, 0, ["Charge: 20 ft for 3 AP."]], [true, 1, ["Charge: 20 ft for 2 AP."]], [true, 0, []], [false, 2, ["Charger needs 3 AP for Charge but has 2."]]]);

// ── C3: the arming card ─────────────────────────────────────────────────
equal("C3 the arming summary (\"costing N AP\" on the card) is 2 with Sudden Charge, 3 without",
  [mw.armedMovementSummary(actor(3, { feats: ["Sudden Charge"] }))?.apCost, mw.armedMovementSummary(actor(3))?.apCost], [2, 3]);

// ── C4: the Charge's Strike ─────────────────────────────────────────────
{
  const a = actor(1, { feats: ["Sudden Charge"] });
  const weapon = { id: "w", name: "Longsword", type: "weapon", system: { traits: "", damage: "1d8", damageType: "slashing", group: "sword", equipped: true }, flags: {}, update: async () => {}, getFlag() {} };
  a.items.push(weapon);
  const target = { id: "tgt", name: "Orc", actor: { ...actor(3), name: "Orc" }, x: 100, y: 0, width: 1, height: 1, parent: canvas.scene, center: { x: 150, y: 50 } };
  sceneTokens.set("tgt", target);
  await cw.armCharge(a, { x: 0, y: 0, width: 1, height: 1, parent: canvas.scene }, target);
  setCombat(a);
  const charger = { id: "me", actor: a, x: 0, y: 0, width: 1, height: 1, parent: canvas.scene };
  const result = await cw.resolveChargeStrike(a, charger, { endDistance: 5, destination: { x: 0, y: 0 } });
  equal("C4 the Charge's Strike is rolled and costs nothing: the Sudden Charger's last AP is still there",
    [Boolean(result), a.system.resources.ap.value], [true, 1]);
}

// ── C5: the wiring ──────────────────────────────────────────────────────
{
  const src = read("module", "combat", "movement-workflow.mjs");
  const awSrc = read("module", "combat", "action-workflow.mjs");
  const chSrc = read("module", "combat", "charge-workflow.mjs");
  const feats = read("module", "feats.mjs");
  ok("C5 the move's armed cost is reduced after validation and before the AP check, never for a compound leg; the summary is reduced; the card prints the summary; the feat is in the table; the Charge Strike is paid for",
    /if \(!leg && check && Number\.isFinite\(Number\(check\.apCost\)\)\) \{\n\s*check\.apCost = armedApCost\(actor, state\.armed, check\.apCost\);\n\s*\}\n\n\s*if \(!check\.allowed\)/.test(src)
    && /if \(check\.apCost > available\) \{/.test(src)
    && /apCost: armedApCost\(actor, armed, config\.apCost\),/.test(src)
    && /`, costing <strong>\$\{armed\.apCost\} AP<\/strong>\.`/.test(awSrc)
    && /"sudden charge": Object\.freeze\(\{ action: "charge", reduction: 1 \}\)/.test(feats)
    && /return rollWeaponAttack\(actor, weapon, \{\n(?:\s*\/\/[^\n]*\n)*\s*apPaid: true,/.test(chSrc));
}

// ── C6: the arming card's header (3.684.8; found in the 3.684.7 live test) ─
{
  const mv = await imp("combat/movement.mjs");
  const { BASIC_ACTIONS } = await imp("data/basic-actions.mjs");
  equal("C6 armedHeaderCost: a reduced cost replaces the printed one; the same cost, or a word, leaves the header as printed",
    [mv.armedHeaderCost("3", 2), mv.armedHeaderCost(3, "2"), mv.armedHeaderCost("3", 3), mv.armedHeaderCost("1", 1), mv.armedHeaderCost("Varies", 2), mv.armedHeaderCost("3", undefined)],
    ["2", "2", undefined, undefined, undefined, undefined]);
  // Every armable action, for a character with no reduction: its header is unchanged.
  const armable = BASIC_ACTIONS.filter((a) => mv.isArmableMovement(a.key));
  const changed = armable.filter((a) => mv.armedHeaderCost(a.apCost, mw.armedApCost(actor(3), a.key, mv.ARMED_MOVEMENT_ACTIONS[a.key]?.apCost)) !== undefined).map((a) => a.key);
  equal("C6b no armable action's header changes without a reduction", [armable.length > 0, changed], [true, []]);

  // The real arming card, through resolveAction.
  const aw = await imp("combat/action-workflow.mjs");
  const cards = [];
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => { cards.push(d); return d; }, getWhisperRecipients: () => [], applyMode: () => {} };
  const chargeAction = BASIC_ACTIONS.find((a) => a.key === "charge");
  const card = async (a) => {
    const mine = { id: `m${a.id}`, name: a.name, actor: a, x: 0, y: 0, width: 1, height: 1, parent: canvas.scene, document: null };
    mine.document = mine;
    a.getActiveTokens = () => [mine];
    const foe = { id: "foe", name: "Orc", actor: actor(3), x: 400, y: 0, width: 1, height: 1, parent: canvas.scene, center: { x: 450, y: 50 } };
    foe.document = foe;
    setCombat(a);
    const targets = new Set([foe]); targets.first = () => foe; game.user.targets = targets;
    a.flags["trg-prime"] = {};
    cards.length = 0;
    await aw.resolveAction(a, chargeAction);
    const html = String(cards.at(-1)?.content ?? "");
    return [/<strong>(\d+) AP<\/strong> — /.exec(html)?.[1] ?? null, /costing <strong>(\d+) AP<\/strong>/.exec(html)?.[1] ?? null, a.flags["trg-prime"].armedMovement ?? null];
  };
  equal("C6c the Charge arming card's header says what the character pays: 2 with Sudden Charge (matching its Armed line), 3 without",
    [await card(actor(3, { feats: ["Sudden Charge"] })), await card(actor(3))], [["2", "2", "charge"], ["3", "3", "charge"]]);
  ok("C6d the arming branch passes the reduced cost to its header",
    /\.\.\.headerLines\(action, armedHeaderCost\(action\.apCost, armed\?\.apCost\)\),/.test(read("module", "combat", "action-workflow.mjs")));
}

if (failures.length) {
  process.stdout.write(`verify-sudden-charge: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-sudden-charge: OK — ${checks} checks.\n`);
