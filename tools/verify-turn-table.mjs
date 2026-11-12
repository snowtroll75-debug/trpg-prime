#!/usr/bin/env node
/**
 * verify-turn-table — TRG Prime 3.686.0, H18: core Insanity's d10 rolled at
 * the start of each of the target's turns (Eldritch Arts' Block 8 audit §6;
 * Graham, 8 November 2026, 17:22: "As recommended", H18 approved knowing it
 * automates the core spell in every world).
 *
 *   T  the pure rule: the row read, the roll's row, the rounds from the margin
 *      ("1 round per 2 failure", at least one; the warp's "per 1"), refusals
 *   M  driven: the marker a failed save leaves, and an unmeasured margin said
 *   A  driven: the turn-start pass — the last roll's effects go, the die is
 *      rolled, a turn is spent, the marker goes with its turns; a roll's
 *      effects left by a marker deleted by hand are swept
 *   W  the wiring: the spell engine's case, the turn start (before AP), the
 *      warp key through the real aggregator and merge, the helper, the kind
 *   X  core Insanity: the declared rows, in the pack
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

let rollNext = 1;
globalThis.Roll = class { constructor(f) { this.formula = f; } async evaluate() { this.total = rollNext; return this; } };
globalThis.foundry = { applications: { api: { DialogV2: { confirm: async () => false, wait: async () => null } }, ux: {} }, utils: { randomID: () => "r1", deepClone: (x) => structuredClone(x), getProperty: () => undefined, mergeObject: (a, b) => Object.assign(a ?? {}, b ?? {}), escapeHTML: (s) => String(s) } };
globalThis.Hooks = { on() {}, once() {}, off() {}, call() { return true; }, callAll() {} };
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => d };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONFIG = { statusEffects: [], specialStatusEffects: {} };
globalThis.game = { user: { id: "gm", isGM: true }, users: Object.assign([], { activeGM: null }), settings: { get: () => null }, time: { worldTime: 0 }, combat: null };
globalThis.canvas = { tokens: { placeables: [] }, scene: null };
globalThis.fromUuid = async () => null;

let nextId = 0;
function makeActor(name) {
  const a = { name, documentName: "Actor", uuid: `Actor.${name}`, isOwner: true, flags: {}, effects: [] };
  a.effects.get = (id) => a.effects.find((e) => e.id === id);
  a.createEmbeddedDocuments = async (type, list) => list.map((d) => {
    const e = { ...structuredClone(d), id: `e${++nextId}`, parent: a };
    e.setFlag = async (s, k, v) => { (e.flags[s] ??= {})[k] = structuredClone(v); };
    e.delete = async () => { a.effects.splice(a.effects.indexOf(e), 1); };
    e.getFlag = (sc, k) => e.flags?.[sc]?.[k];
    // Dotted keys, as Foundry's update takes them (the marker's refresh, applyConditionTags' stamps).
    e.update = async (u) => { for (const [k, v] of Object.entries(u)) { const parts = k.split("."); let o = e; for (const p of parts.slice(0, -1)) o = (o[p] ??= {}); const last = parts.at(-1); if (last.startsWith("-=")) delete o[last.slice(2)]; else o[last] = structuredClone(v); } };
    a.effects.push(e);
    return e;
  });
  a.conditionOf = (key) => a.effects.find((e) => !e.disabled && (e.statuses instanceof Set ? e.statuses.has(key) : (e.statuses ?? []).includes?.(key)));
  a.hasCondition = (key) => Boolean(a.conditionOf(key));
  a.getConditionValue = (key) => { const e = a.conditionOf(key); return e ? Number(e.flags?.["trg-prime"]?.value ?? 1) : null; };
  a.toggled = [];
  a.toggleStatusEffect = async (key, { active = true, value } = {}) => {
    a.toggled.push([key, active, value ?? null]);
    let e = a.conditionOf(key);
    if (!active) { if (e) await e.delete(); return false; }
    if (!e) [e] = await a.createEmbeddedDocuments("ActiveEffect", [{ name: key, statuses: new Set([key]), flags: { "trg-prime": {} } }]);
    if (value !== undefined && value !== null) e.flags["trg-prime"].value = value;
    return e;
  };
  a.deleteEmbeddedDocuments = async (type, ids) => { for (const id of ids) { const i = a.effects.findIndex((e) => e.id === id); if (i >= 0) a.effects.splice(i, 1); } };
  return a;
}

const T = await imp("magic/turn-table.mjs");
const W = await imp("magic/turn-table-workflow.mjs");

/* T — the rule */
const ins = T.normaliseTurnTable(T.INSANITY_TURN_TABLE);
equal("T1 core Insanity's table, as printed: 1d10, per 2; 1 unaffected, 2–4 stunned 1d3, 5–7 slowed 1d3, 8–10 confused",
  [ins?.die, ins?.per, ins?.rows.map((r) => [r.min, r.max, r.unaffected, r.rows.map((x) => `${x.condition}${x.formula ? ` ${x.formula}` : ""}`)])],
  ["1d10", 2, [[1, 1, true, []], [2, 4, false, ["stunned 1d3"]], [5, 7, false, ["slowed 1d3"]], [8, 10, false, ["confused"]]]]);
equal("T2 each roll's row", [1, 2, 4, 5, 7, 8, 10].map((n) => T.turnTableRow(ins, n)?.text), ["unaffected this round", "stunned 1d3", "stunned 1d3", "slowed 1d3", "slowed 1d3", "confused", "confused"]);
equal("T3 1 round per 2 failure, rounded down, at least one; the warp's per 1; an unmeasured margin is null", [T.turnTableRounds(ins, -1), T.turnTableRounds(ins, -2), T.turnTableRounds(ins, -7), T.turnTableRounds(ins, -7, 1), T.turnTableRounds(ins, null)], [1, 1, 3, 7, null]);
equal("T4 a malformed row is refused: not 1dN (2d10), per 0, a range past the die, no rows, another kind",
  [T.normaliseTurnTable({ ...T.INSANITY_TURN_TABLE, die: "2d10" }), T.normaliseTurnTable({ ...T.INSANITY_TURN_TABLE, per: 0 }), T.normaliseTurnTable({ ...T.INSANITY_TURN_TABLE, rows: [{ min: 9, max: 12 }] }), T.normaliseTurnTable({ ...T.INSANITY_TURN_TABLE, rows: [] }), T.normaliseTurnTable({ ...T.INSANITY_TURN_TABLE, kind: "turnLadder" })],
  [null, null, null, null, null]);
ok("T5 the card's line says the roll, the row and the turns left", /Insanity<\/strong> — Orc rolls 3: stunned 1d3\. \(2 more turns\)/.test(T.turnTableLine("Insanity", "Orc", 3, T.turnTableRow(ins, 3), 2)) && /its last turn/.test(T.turnTableLine("Insanity", "Orc", 3, T.turnTableRow(ins, 3), 0)));

/* M — the marker */
{
  const orc = makeActor("Orc");
  const out = await W.markTurnTable(orc, "insanity", { margin: -7, dc: 22, castId: "c1", casterUuid: "Actor.Mage", spellName: "Symbol of Insanity" });
  const rec = orc.effects[0]?.flags?.["trg-prime"]?.turnTable;
  equal("M1 a failure by 7: insane for 3 rounds; the marker holds the table, the turns, the DC and the cast", [out?.marked, out?.rounds, rec?.turnsLeft, rec?.die, rec?.dc, orc.effects[0]?.flags?.["trg-prime"]?.castId], [true, 3, 3, "1d10", 22, "c1"]);
  const per1 = await W.markTurnTable(makeActor("Elf"), T.INSANITY_TURN_TABLE, { margin: -7, per: 1 });
  equal("M2 with the +4 PP warp (per 1): 7 rounds", per1?.rounds, 7);
  const none = makeActor("Unmeasured");
  const said = await W.markTurnTable(none, "insanity", { margin: null });
  equal("M3 an unmeasured margin marks nothing and says so", [said?.marked, none.effects.length, /by hand/.test(said?.line ?? "")], [false, 0, true]);
  equal("M4 a malformed row is null", await W.markTurnTable(makeActor("X"), { kind: "turnTable" }, { margin: -3 }), null);
}

/* A — the turn-start pass */
{
  const orc = makeActor("Orc2");
  await W.markTurnTable(orc, { ...T.INSANITY_TURN_TABLE, rows: [{ min: 1, max: 10, unaffected: true, text: "unaffected this round", rows: [] }] }, { margin: -4 });
  const marker = orc.effects[0];
  // A stale roll effect from this marker's last turn, and one from a marker deleted by hand.
  orc.effects.push({ id: "old", flags: { "trg-prime": { castId: T.turnTableRollTag(marker.id) } } });
  orc.effects.push({ id: "stray", flags: { "trg-prime": { castId: T.turnTableRollTag("gone") } } });
  rollNext = 1;
  const l1 = await W.applyTurnTables(orc);
  equal("A1 the turn's start: the last roll's effect and a stranded one go, the d10 is rolled, a turn is spent", [orc.effects.map((e) => e.id).sort(), marker.flags["trg-prime"].turnTable.turnsLeft, l1.length], [[marker.id], 1, 1]);
  await W.applyTurnTables(orc);
  equal("A2 its last turn is rolled", [marker.flags["trg-prime"].turnTable.turnsLeft, orc.effects.length], [0, 1]);
  const l3 = await W.applyTurnTables(orc);
  equal("A3 with no turns left the marker goes, and it is itself again", [orc.effects.length, /itself again/.test(l3.join(" "))], [0, true]);
}
/* W — the world clock, and only the roll's own (3.686.0; the Block 8a review) */
{
  game.time.worldTime = 1000;
  const orc = makeActor("Orc3");
  await W.markTurnTable(orc, "insanity", { margin: -6, castId: "c9" });
  const m = orc.effects[0];
  equal("W1 outside combat the marker is a spell effect with a world-clock end: its rounds × 6 seconds (Insanity ends outside combat)", [m.flags["trg-prime"].spellEffect, m.flags["trg-prime"].spellEffectEnd], [true, 1018]);
  // IN A STARTED COMBAT: no world-clock end, so a 1-round insanity is not swept at the round change before its first roll.
  const one = makeActor("Orc3b");
  game.combats = [{ started: true, round: 3, combatants: [{ actor: one }] }];
  game.combat = game.combats[0];
  await W.markTurnTable(one, "insanity", { margin: -1 });
  const m1 = one.effects[0];
  // H: ONLY A CREATURE THAT IS ITSELF A COMBATANT IN A STARTED COMBAT goes unclocked.
  const outside = makeActor("Orc3c");
  await W.markTurnTable(outside, "insanity", { margin: -1 });
  game.combats.push({ started: false, combatants: [{ actor: outside }] });
  const waiting = makeActor("Orc3d");
  game.combats[1].combatants.push({ actor: waiting });
  await W.markTurnTable(waiting, "insanity", { margin: -1 });
  equal("W1c H: a creature not in the tracker (marked from another scene) is clocked though a combat is running; so is a combatant of a combat not started", [outside.effects[0].flags["trg-prime"].spellEffectEnd, waiting.effects[0].flags["trg-prime"].spellEffectEnd], [1006, 1006]);
  equal("W1d the rule: a combatant of a started combat counts its turns; not one of a combat not started, nor a stranger", [T.countsTurnsIn(one, game.combats), T.countsTurnsIn(waiting, game.combats), T.countsTurnsIn(outside, game.combats), T.countsTurnsIn(makeActor("X2"), []), T.countsTurnsIn({ uuid: one.uuid }, game.combats)], [true, false, false, false, true]);
  equal("W1b a combatant in a started combat: a 1-round insanity takes no world-clock end, the counted turns govern (re-review B)", [m1.flags["trg-prime"].turnTable.turnsLeft, m1.flags["trg-prime"].spellEffect ?? null, m1.flags["trg-prime"].spellEffectEnd ?? null], [1, null, null]);
  game.time.worldTime = 1006;
  m.flags["trg-prime"].turnTable.rows = [{ min: 1, max: 10, unaffected: true, text: "unaffected this round", rows: [] }];
  rollNext = 1;
  await W.applyTurnTables(orc);
  equal("W2 a roll is a turn in combat: a marker laid before combat loses its world-clock end, so the clock never cuts a counted turn short", [m.flags["trg-prime"].turnTable.turnsLeft, m.flags["trg-prime"].spellEffect], [2, false]);
  // COMBAT OVER: the acting GM gives each marker left behind its remaining turns on the clock.
  game.time.worldTime = 2000;
  game.users.activeGM = { id: "other-gm" };
  const notActing = await W.clockTurnTablesAfterCombat({ combatants: [{ actor: orc }, { actor: one }], scene: null });
  game.users.activeGM = game.user;
  const clocked = await W.clockTurnTablesAfterCombat({ combatants: [{ actor: orc }], scene: { tokens: [{ actor: one }] } });
  equal("W2b combat's end: the acting GM clocks each marker left (its turns × 6 from now), combatants and the scene's tokens; another GM's client does nothing", [notActing, clocked, m.flags["trg-prime"].spellEffect, m.flags["trg-prime"].spellEffectEnd, m1.flags["trg-prime"].spellEffectEnd], [0, 2, true, 2012, 2006]);
  ok("W2c …registered on deleteCombat at init", /Hooks\.on\("deleteCombat", \(combat\) => \{\n\s+clockTurnTablesAfterCombat\(combat\)/.test(read("scripts", "trg-prime.mjs")));
  // H: A COMBATANT DELETED takes the clock, unless still a combatant in another started combat.
  const gone = makeActor("Orc3e"); const twice = makeActor("Orc3f");
  game.combats = [{ started: true, combatants: [{ actor: gone }, { actor: twice }] }, { started: true, combatants: [{ actor: twice }] }];
  await W.markTurnTable(gone, "insanity", { margin: -4 }); await W.markTurnTable(twice, "insanity", { margin: -4 });
  game.users.activeGM = { id: "other-gm" };
  const notActing2 = await W.clockTurnTablesOfCombatant(game.combats[0].combatants[0]);
  game.users.activeGM = game.user;
  const c1 = await W.clockTurnTablesOfCombatant(game.combats[0].combatants[0]);
  const c2 = await W.clockTurnTablesOfCombatant(game.combats[0].combatants[1]);
  equal("W2d H: a combatant removed from the tracker is clocked (its turns × 6), on the acting GM only; one still in another started combat is not", [notActing2, c1, gone.effects[0].flags["trg-prime"].spellEffectEnd, c2, twice.effects[0].flags["trg-prime"].spellEffectEnd ?? null], [0, 1, 2012, 0, null]);
  // J: ONLY THE DELETED COMBATANT IS IGNORED — a second combatant of the same linked actor, in the same combat, still counts.
  const pair = makeActor("Orc3g");
  game.combats = [{ started: true, combatants: [{ actor: pair }, { actor: pair }] }];
  await W.markTurnTable(pair, "insanity", { margin: -4 });
  equal("W2f J: a linked actor with two combatants in one started combat: deleting one leaves its turns counted (no clock)", [await W.clockTurnTablesOfCombatant(game.combats[0].combatants[0]), pair.effects[0].flags["trg-prime"].spellEffectEnd ?? null, T.countsTurnsIn(pair, game.combats, { except: game.combats[0].combatants[0] }), T.countsTurnsIn(gone, [{ started: true, combatants: [game.combats[0].combatants[0]] }], { except: game.combats[0].combatants[0] })], [0, null, true, false]);
  // J: A CLOCKED MARKER JOINS A STARTED COMBAT, or its combat starts: the clock goes, so it cannot expire before its first roll.
  const late = makeActor("Orc3h");
  delete game.combats; game.combat = null;
  await W.markTurnTable(late, "insanity", { margin: -1 });
  const clockedBefore = late.effects[0].flags["trg-prime"].spellEffectEnd;
  const running = { started: true, combatants: [] };
  const joined = { actor: late, parent: running };
  running.combatants.push(joined);
  game.users.activeGM = { id: "other-gm" }; const notActing3 = await W.unclockTurnTablesOfCombatant(joined); game.users.activeGM = game.user;
  const unclocked = await W.unclockTurnTablesOfCombatant(joined);
  equal("W2g J: a creature with a clocked marker joining a started combat loses the clock (on the acting GM only)", [clockedBefore > 0, notActing3, unclocked, late.effects[0].flags["trg-prime"].spellEffect, late.effects[0].flags["trg-prime"].spellEffectEnd ?? null], [true, 0, 1, false, null]);
  const early = makeActor("Orc3i");
  await W.markTurnTable(early, "insanity", { margin: -1 });
  const waitingCombat = { started: false, combatants: [{ actor: early }] };
  const notYet = await W.unclockTurnTablesOfCombatant({ actor: early, parent: waitingCombat });
  const noRound = await W.unclockTurnTablesOfCombat({ ...waitingCombat, started: true }, { turn: 1 });
  waitingCombat.started = true;
  const atStart = await W.unclockTurnTablesOfCombat(waitingCombat, { round: 1 });
  equal("W2h J: joining a combat not yet started keeps the clock; the combat's start (its round change) takes it off; an update with no round change does nothing", [notYet, noRound, atStart, early.effects[0].flags["trg-prime"].spellEffectEnd ?? null], [0, 0, 1, null]);
  ok("W2i …registered on createCombatant and updateCombat at init", /Hooks\.on\("createCombatant", \(combatant\) => \{\n\s+unclockTurnTablesOfCombatant\(combatant\)/.test(read("scripts", "trg-prime.mjs")) && /Hooks\.on\("updateCombat", \(combat, change\) => \{\n\s+unclockTurnTablesOfCombat\(combat, change\)/.test(read("scripts", "trg-prime.mjs")));
  ok("W2e …registered on deleteCombatant and deleteActiveEffect at init", /Hooks\.on\("deleteCombatant", \(combatant\) => \{\n\s+clockTurnTablesOfCombatant\(combatant\)/.test(read("scripts", "trg-prime.mjs")) && /Hooks\.on\("deleteActiveEffect", \(effect\) => \{\n\s+onTurnTableMarkerDeleted\(effect\)/.test(read("scripts", "trg-prime.mjs")));
  game.combat = null; delete game.combats;
  equal("W3 the rule: now + turns × 6; none left is now", [T.turnTableEndTime(100, 3), T.turnTableEndTime(100, 0), T.ROUND_SECONDS], [118, 100, 6]);
  ok("W4 each roll's new conditions are a 1-round spell effect (so they end on the world clock too)", /system: \{ duration: "1 round", effects: fresh \}/.test(read("module", "magic", "turn-table-workflow.mjs")));
  game.time.worldTime = 0;
}
/* I — Insanity's own bookkeeping (3.686.0; the Block 8a re-review, G) */
const tableOf = (rows) => ({ ...T.INSANITY_TURN_TABLE, rows: [{ min: 1, max: 10, text: "rolled", rows }] });
const UNAFFECTED = [{ min: 1, max: 10, unaffected: true, text: "unaffected this round", rows: [] }];
{
  game.time.worldTime = 1000;
  // I1 a standing Confusion: its cast id, its end and its duration are untouched, and it is never removed by Insanity.
  const orc = makeActor("Orc4");
  await orc.createEmbeddedDocuments("ActiveEffect", [{ name: "Confused", statuses: new Set(["confused"]), flags: { "trg-prime": { castId: "otherSpell", spellEffect: true, spellEffectEnd: 1060 } } }]);
  const confusion = orc.effects[0];
  const before = JSON.stringify(confusion.flags);
  await W.markTurnTable(orc, tableOf([{ kind: "condition", target: "targets", condition: "confused" }]), { margin: -4 });
  const marker = orc.effects.find((e) => e.flags["trg-prime"].turnTable);
  rollNext = 5;
  const l1 = await W.applyTurnTables(orc);
  equal("I1 a standing Confusion (another spell's, ending at T+60) rolled \"confused\": its cast id, its end and its duration untouched; nothing recorded; said", [JSON.stringify(confusion.flags), confusion.duration ?? null, orc.effects.filter((e) => e.statuses?.has?.("confused")).length, marker.flags["trg-prime"].turnTable.raised, /already Confused/i.test(l1.join(" "))], [before, null, 1, [], true]);
  marker.flags["trg-prime"].turnTable.rows = UNAFFECTED;
  game.time.worldTime = 1006;
  await W.applyTurnTables(orc);
  await W.onTurnTableMarkerDeleted({ ...marker, parent: orc });
  equal("I1b …its end survives the round change and the next roll, and the marker's end leaves it", [orc.effects.includes(confusion), confusion.flags["trg-prime"].spellEffectEnd, confusion.flags["trg-prime"].castId], [true, 1060, "otherSpell"]);
}
{
  // I2 a clockless standing slowed: raised for the turn only, its flags untouched, the rise taken back, never removed.
  const elf = makeActor("Elf2");
  await elf.createEmbeddedDocuments("ActiveEffect", [{ name: "Slowed", statuses: new Set(["slowed"]), flags: { "trg-prime": { value: 1 } } }]);
  const slowed = elf.effects[0];
  await W.markTurnTable(elf, tableOf([{ kind: "condition", target: "targets", condition: "slowed", value: 2 }]), { margin: -6 });
  const mk = elf.effects.find((e) => e.flags["trg-prime"].turnTable);
  rollNext = 5;
  await W.applyTurnTables(elf);
  const raised = mk.flags["trg-prime"].turnTable.raised;
  const f = slowed.flags["trg-prime"];
  equal("I2 a clockless standing slowed 1 rolled slowed 2: its value rises, the rise is recorded on the marker; no cast id, no clock, no duration is written", [elf.getConditionValue("slowed"), raised, f.castId ?? null, f.spellEffect ?? null, f.spellEffectEnd ?? null, slowed.duration ?? null], [2, [{ key: "slowed", before: 1, after: 2, adds: false }], null, null, null, null]);
  mk.flags["trg-prime"].turnTable.rows = UNAFFECTED;
  await W.applyTurnTables(elf);
  equal("I2b the next roll takes the rise back (2 → 1); the slowed stands, still clockless", [elf.getConditionValue("slowed"), elf.effects.includes(slowed), slowed.flags["trg-prime"].spellEffect ?? null], [1, true, null]);
  // the marker's end (its clock, its spell, the GM) takes the last rise back too
  mk.flags["trg-prime"].turnTable.rows = tableOf([{ kind: "condition", target: "targets", condition: "slowed", value: 3 }]).rows;
  await W.applyTurnTables(elf);
  const at = elf.getConditionValue("slowed");
  elf.effects.splice(elf.effects.indexOf(mk), 1);
  game.users.activeGM = { id: "other-gm" }; const notActing = await W.onTurnTableMarkerDeleted({ ...mk, parent: elf }); game.users.activeGM = game.user;
  const undone = await W.onTurnTableMarkerDeleted({ ...mk, parent: elf });
  equal("I2c the marker deleted otherwise than by its last turn: its last rise comes off (3 → 1) on the acting client only; the slowed is never removed", [at, notActing, undone, elf.getConditionValue("slowed"), elf.effects.includes(slowed)], [3, false, true, 1, true]);
}
{
  // I3 a condition the creature does not have: laid with the roll's own tag, removed at the next roll.
  const imp2 = makeActor("Imp");
  await W.markTurnTable(imp2, tableOf([{ kind: "condition", target: "targets", condition: "confused" }]), { margin: -6 });
  const mk = imp2.effects.find((e) => e.flags["trg-prime"].turnTable);
  rollNext = 9;
  await W.applyTurnTables(imp2);
  const laid = imp2.effects.find((e) => e.statuses?.has?.("confused"));
  equal("I3 a new condition is laid as before, stamped with the roll's tag", laid?.flags?.["trg-prime"]?.castId, T.turnTableRollTag(mk.id));
  mk.flags["trg-prime"].turnTable.rows = UNAFFECTED;
  await W.applyTurnTables(imp2);
  equal("I3b …and goes at the next roll", imp2.effects.some((e) => e.statuses?.has?.("confused")), false);
}
equal("I4 the rules: rows split by whether their condition stands",
  T.splitTurnTableRows([{ kind: "condition", condition: "slowed" }, { kind: "condition", condition: "stunned" }, { kind: "note" }], (k) => k === "slowed"),
  { fresh: [{ kind: "condition", condition: "stunned" }, { kind: "note" }], standing: [{ kind: "condition", condition: "slowed" }] });
{
  // I5 (the re-review, I): two take-back rules, as the condition stacks.
  const higher = { key: "slowed", before: 1, after: 3, adds: false };
  const adding = { key: "injured", before: 1, after: 3, adds: true };
  equal("I5 a keep-the-higher condition (slowed 1 → 3 by the roll) goes back to 1 only while it stands at 3; at 4 from a Slow spell it is left (not cut to 2); lower, left", [T.riseTakenBackTo(higher, 3), T.riseTakenBackTo(higher, 4), T.riseTakenBackTo(higher, 2), T.riseTakenBackTo(higher, null)], [1, null, null, null]);
  equal("I5b an adding condition (injured 1 → 3 by the roll) loses the rise from what stands (5 → 3), never below before (2 → 1); none raised, nothing", [T.riseTakenBackTo(adding, 3), T.riseTakenBackTo(adding, 5), T.riseTakenBackTo(adding, 2), T.riseTakenBackTo({ ...adding, after: 1 }, 1)], [1, 3, 1, null]);
  // driven: slowed 1 → 3 by the roll, then 4 from Slow: the next roll leaves 4.
  const elf = makeActor("Elf3");
  await elf.createEmbeddedDocuments("ActiveEffect", [{ name: "Slowed", statuses: new Set(["slowed"]), flags: { "trg-prime": { value: 1 } } }]);
  await W.markTurnTable(elf, tableOf([{ kind: "condition", target: "targets", condition: "slowed", value: 3 }]), { margin: -6 });
  const mk = elf.effects.find((e) => e.flags["trg-prime"].turnTable);
  rollNext = 5;
  await W.applyTurnTables(elf);
  await elf.toggleStatusEffect("slowed", { value: 4 });
  mk.flags["trg-prime"].turnTable.rows = UNAFFECTED;
  await W.applyTurnTables(elf);
  equal("I5c driven: slowed 1 → 3 by the roll, 4 from a Slow spell since: the take-back leaves 4; the rise was recorded as keep-the-higher", [elf.getConditionValue("slowed"), mk.flags["trg-prime"].turnTable.raised?.length ?? 0], [4, 0]);
  // driven: an adding condition the table lays on a standing one (injured 1, rolled injured 2 → 3), then +1 from elsewhere: the take-back leaves 2.
  const ogre = makeActor("Ogre8");
  await ogre.createEmbeddedDocuments("ActiveEffect", [{ name: "Injured", statuses: new Set(["injured"]), flags: { "trg-prime": { value: 1 } } }]);
  await W.markTurnTable(ogre, tableOf([{ kind: "condition", target: "targets", condition: "injured", value: 2 }]), { margin: -6 });
  const mk2 = ogre.effects.find((e) => e.flags["trg-prime"].turnTable);
  await W.applyTurnTables(ogre);
  const raisedTo = ogre.getConditionValue("injured");
  const rec2 = mk2.flags["trg-prime"].turnTable.raised?.[0];
  await ogre.toggleStatusEffect("injured", { value: raisedTo + 1 });
  mk2.flags["trg-prime"].turnTable.rows = UNAFFECTED;
  await W.applyTurnTables(ogre);
  equal("I5d driven: injured adds (1 + 2 = 3, recorded as adding), +1 from elsewhere (4): the take-back subtracts the roll's 2 (→ 2)", [raisedTo, rec2?.adds, ogre.getConditionValue("injured")], [3, true, 2]);
}
{
  // G1 THE GENERAL PATH IS 3.685.3's (unchanged in 3.686.0; "For Graham"): a later cast on a standing condition still writes its cast id and clock.
  const EA = await imp("combat/effect-application-workflow.mjs");
  const ogre = makeActor("Ogre9");
  await ogre.createEmbeddedDocuments("ActiveEffect", [{ name: "Confused", statuses: new Set(["confused"]), flags: { "trg-prime": { castId: "first", spellEffect: true, spellEffectEnd: 1060 } } }]);
  await EA.applyConditionTags(ogre, [{ key: "confused" }], { castId: "second", spellEffect: true, spellEffectEnd: 1006 });
  equal("G1 the general condition path behaves as in 3.685.3 on a standing condition: the later cast's id and clock are written (a pre-existing issue, left for Graham)", [ogre.effects[0].flags["trg-prime"].castId, ogre.effects[0].flags["trg-prime"].spellEffectEnd], ["second", 1006]);
  const src = read("module", "combat", "effect-application-workflow.mjs");
  ok("G2 …and its source carries none of the reverted general changes (standingClock, castRaises, the standing cast-id guard)", !/standingClock|castRaises|CAST_RAISES_FLAG|castId: wasAlreadyPresent \? null : castId/.test(src) && (src.match(/expiresRound: allowed, duration, spellEffect, spellEffectEnd, castId,/g) ?? []).length === 2);
  game.time.worldTime = 0;
}
ok("A4 a row's new conditions (not those already standing) are laid through the spell engine, stamped with the marker's own tag", /await applySpellEffects\(caster \?\? actor, spell, \{\n\s+targets: \[actor\], effects: fresh\.map\(\(r\) => \(\{ \.\.\.r, target: "targets" \}\)\), lines: applied,\n\s+saveDC: Number\(record\.dc\) \|\| 0, castId: turnTableRollTag\(marker\.id\)/.test(read("module", "magic", "turn-table-workflow.mjs")));

/* W — the wiring */
const SE = read("module", "magic", "spell-effects.mjs");
ok("W1 the spell engine's turnTable case marks each failure from its margin and the warp's rate", /case "turnTable": \{\n\s+const \{ markTurnTable \} = await import\("\.\/turn-table-workflow\.mjs"\);\n\s+const mine = [^\n]+\n\s+const marked = await markTurnTable\(target, effect, \{\n\s+margin: mine\?\.margin \?\? null, per: Number\(warpMods\?\.turnTablePer \?\? 0\) \|\| 0,/.test(SE));
const CB = read("module", "documents", "combat.mjs");
ok("W2 the turn start rolls it beside the turn ladders, before AP are regained", /const \{ applyTurnTables \} = await import\("\.\.\/magic\/turn-table-workflow\.mjs"\);\n\s+for \(const said of await applyTurnTables\(actor\)\) lines\.push/.test(CB) && CB.indexOf("applyTurnTables(actor)") < CB.indexOf("const regain = computeAPRegain("));
{
  const SW = await imp("magic/spell-warp.mjs");
  const warps = [{ ppCost: 2, text: "another target", mods: { extraTargets: 1 } }, { ppCost: 4, text: "per 1 failure", mods: { turnTablePer: 1 } }];
  equal("W3 the warp's rate through the real aggregator, and the merge keeps the smaller", [SW.aggregateWarpSelection(warps, { "warp-1": 1 }).mods.turnTablePer, SW.aggregateWarpSelection(warps, {}).mods.turnTablePer, SW.mergeWarpSelections(SW.aggregateWarpSelection(warps, {}), SW.aggregateWarpSelection(warps, { "warp-1": 1 })).mods.turnTablePer], [1, 0, 1]);
}
ok("W4 the helper for modules", /markTurnTable: async \(\.\.\.args\) => \(await import\("\.\/magic\/turn-table-workflow\.mjs"\)\)\.markTurnTable\(\.\.\.args\)/.test(read("module", "module-api-workflow.mjs")));
ok("W5 the kind is declared", /"turnTable",/.test(read("module", "magic", "effect-kinds.mjs")));

/* X — core Insanity */
{
  const { BLOCK8A_CORE_FIXES, INSANITY_NOTE } = await import(new URL("./ea-block8a-core-fixes.mjs", import.meta.url));
  const fx = BLOCK8A_CORE_FIXES.find((f) => f.id === "ea8a-insanity-turn-table"), wx = BLOCK8A_CORE_FIXES.find((f) => f.id === "ea8a-insanity-warp-per");
  equal("X1 the declared rows: the note → the turn table; the +4 PP warp {} → turnTablePer 1", [fx?.from, fx?.to, wx?.path, wx?.from, wx?.to], [INSANITY_NOTE, [JSON.parse(JSON.stringify(T.INSANITY_TURN_TABLE))], "system.warps.1.mods", {}, { turnTablePer: 1 }]);
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
  ok("X2 …declared in tools/data-fixes.json", ["ea8a-insanity-turn-table", "ea8a-insanity-warp-per"].every((id) => fixes.some((f) => f.id === id)));
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  let spell = null;
  try {
    await db.open();
    for await (const [key, value] of db.iterator()) if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.name === "Insanity") spell = value;
  } catch (err) { ok("X3 the spells pack opens", false, String(err?.message ?? err)); } finally { await db.close().catch(() => {}); }
  equal("X3 the shipped pack carries both (tools/declare-ea-block8a-core.mjs)", [spell?.system?.effects, spell?.system?.warps?.[1]?.mods], [fx.to, { turnTablePer: 1 }]);
}

if (failures.length) { console.log(`verify-turn-table: ${checks} checks — ${failures.length} FAILED`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-turn-table: ${checks} checks — all green.`);
