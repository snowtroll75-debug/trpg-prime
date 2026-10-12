#!/usr/bin/env node
/**
 * verify-drive-36221 — the 3.622.1 drive's findings, 3.622.2.
 *
 * Graham's rulings of 5 October 2026 (R1–R4, "your recommendation") on
 * claude/live-testing-report-3.622.1.md.
 *
 *   A  R1: a light circle owns its anchor, its decoy and its clock, follows
 *      its creature, and ends with its spell (Fairy Fire, Umbral Veil)
 *   B  R2: a late-DC resume acts on the token that rolled
 *   C  R3: the end of a combat takes the opening Flat-Footed away
 *   D  R4: the migration's conviction flag is left alone (nothing to check
 *      but that no pass was added); the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const LS = await import("../module/magic/light-shift.mjs");
const LSW = await import("../module/magic/light-shift-workflow.mjs");
const TRec = await import("../module/combat/turn-records.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const WF = strip(read("module", "magic", "light-shift-workflow.mjs"));
const ACTIVE = strip(read("module", "magic", "active-spells.mjs"));
const SHEET = strip(read("module", "sheets", "actor-sheet.mjs"));
const MAIN = strip(read("scripts", "trg-prime.mjs"));
const ACTION = strip(read("module", "combat", "action-workflow.mjs"));
const MIGRATION = strip(read("module", "migration.mjs"));

const circle = (id, { castId = "c1", anchor = null, droppable = false, x = 0, y = 0, type = "circle", shift = true } = {}) => ({
  id, name: `Spell: ${id}`,
  flags: { "trg-prime": { ...(shift ? { lightShift: { steps: 1 } } : {}), castId, lightShiftAnchor: anchor, lightShiftDroppable: droppable } },
  shapes: [{ type, x, y, radius: 100 }]
});

/* A — R1, the circle owns its life */
{
  const regions = [
    circle("a", { anchor: "tokU", x: 10, y: 10 }),
    circle("b", { anchor: "tokE", x: 10, y: 10 }),
    circle("c", { anchor: "tokU", x: 650, y: 750 }),
    circle("d", { anchor: "tokU", type: "rectangle" }),
    circle("e", { anchor: "tokU", shift: false })
  ];
  const ups = LS.anchoredShiftUpdates(regions, "tokU", { x: 650, y: 750 });
  ok("A1 THE OLD DEFECT, cured: a circle moves with the creature it is anchored to, and only that one",
    ups.length === 1 && ups[0]._id === "a" && ups[0].shapes[0].x === 650 && ups[0].shapes[0].y === 750
    && ups[0].shapes[0].radius === 100, JSON.stringify(ups));
  ok("A2 a token's centre is read off its document",
    JSON.stringify(LS.tokenCentrePx({ x: 600, y: 700, width: 1, height: 1 }, 100)) === JSON.stringify({ x: 650, y: 750 })
    && LS.tokenCentrePx({ x: 0, y: 0, width: 2, height: 2 }, 100).x === 100);
  ok("A3 the circles a cast drew, and those that can still be put down",
    LS.circlesOfCast([circle("a", { castId: "x" }), circle("b", { castId: "y" }), circle("c", { castId: "x", shift: false })], "x").map((r) => r.id).join() === "a"
    && LS.droppableCircles([circle("a", { anchor: "t", droppable: true }), circle("b", { anchor: null, droppable: true }), circle("c", { anchor: "t", droppable: false })], "c1").map((r) => r.id).join() === "a");
  ok("A4 the circle carries its anchor, its decoy and its clock, and asks no registry",
    /\[LIGHT_SHIFT_ANCHOR_FLAG\]: spec\.follows \? \(token\?\.id \?\? null\) : null,/.test(WF)
    && /\[LIGHT_SHIFT_DROPPABLE_FLAG\]: spec\.droppable === true,/.test(WF)
    && /\.\.\.\(ends \? \{ \[REGION_EXPIRY_FLAG\]: regionExpiryRecord\(\{ castId, spellName: spell\.name, ends \}\) \} : \{\}\)/.test(WF)
    && /const ends = endsStamp\(\{\s*seconds: parsedDuration\?\.seconds \?\? null,\s*rounds: parsedDuration\?\.rounds \?\? null,/.test(WF)
    && !/recordEmanation\(/.test(WF));
  ok("A5 the end of the spell removes its circles, stamped or not",
    /const circles = new Set\(circlesOfCast\(regions, id\)\.map\(\(r\) => r\.id\)\);/.test(ACTIVE)
    && /\.filter\(\(r\) => r\.getFlag\?\.\("trg-prime", REGION_EXPIRY_FLAG\)\?\.castId === id \|\| circles\.has\(r\.id\)\)/.test(ACTIVE));

  // The follow hook, driven.
  const handlers = {};
  globalThis.Hooks = { on: (name, fn) => { handlers[name] = fn; } };
  LSW.registerLightShiftFollow();
  const docs = [circle("a", { anchor: "tokU", x: 10, y: 10 })].map((r) => ({ ...r, shapes: r.shapes.map((sh) => ({ toObject: () => ({ ...sh }) })) }));
  let updated = null;
  const scene = { regions: Object.assign(docs, { size: docs.length }), grid: { size: 100 }, updateEmbeddedDocuments: async (_t, u) => { updated = u; } };
  const tokenDoc = { id: "tokU", x: 600, y: 700, width: 1, height: 1, parent: scene };
  globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } };
  await handlers.updateToken?.(tokenDoc, { y: 700 });
  const moved = updated?.[0]?.shapes?.[0];
  updated = null;
  await handlers.updateToken?.(tokenDoc, { name: "Renamed" });
  const notMoved = updated === null;
  globalThis.game = { user: { id: "p1", isGM: false }, users: { activeGM: { id: "gm" } } };
  await handlers.updateToken?.(tokenDoc, { x: 600 });
  ok("A6 the active GM's client moves the circle when its creature moves, and nobody else's",
    moved?.x === 650 && moved?.y === 750 && notMoved && updated === null, JSON.stringify(moved));

  // The drop, driven.
  const setFlags = [];
  const held = { ...circle("v", { castId: "veil", anchor: "tokA", droppable: true }), getFlag: (_s, k) => (k === "lightShiftAnchor" ? "tokA" : null), setFlag: async (_s, k, v) => setFlags.push([k, v]) };
  globalThis.canvas = { scene: { regions: [held] }, tokens: { get: (id) => (id === "tokA" ? { name: "Borin" } : null) } };
  const caster = { name: "Merrick", getFlag: () => [{ id: "veil", name: "Umbral Veil" }] };
  const said = await LSW.dropLightShift(caster, "veil");
  const none = await LSW.dropLightShift(caster, "other");
  ok("A7 the drop clears the anchor on the circle, names the wearer, and ends nothing",
    /Borin<\/strong> lets the shadows fall\. Umbral Veil stays/.test(String(said)) && none === null
    && setFlags.length === 1 && setFlags[0][0] === "lightShiftAnchor" && setFlags[0][1] === null, String(said));
  ok("A8 the sheet's button reads the circles, and the hook is registered at start-up",
    /canDrop: lightShiftCanDrop\(entry\.id\),/.test(SHEET)
    && /import \{ registerLightShiftFollow \} from "\.\.\/module\/magic\/light-shift-workflow\.mjs";/.test(MAIN)
    && /registerLightShiftFollow\(\);/.test(MAIN));
}

/* B — R2, the resume acts on the token */
{
  ok("B1 the pending outcome carries handles, not only ids",
    /actorHandle: actor \? actorHandle\(actor, actor\.token \?\? null\) : null,/.test(ACTION)
    && /targetHandle: ctx\.targetActor \? actorHandle\(ctx\.targetActor, ctx\.targetActor\.token \?\? null\) : null,/.test(ACTION));
  ok("B2 THE OLD DEFECT, cured: the resume resolves the handle first, the id only for an older card",
    /const actor = \(stored\?\.actorHandle \? await resolveActorHandle\(stored\.actorHandle\) : null\)\s*\?\? \(stored\?\.actorId \? game\.actors\.get\(stored\.actorId\) : null\);/.test(ACTION)
    && /const restoredTarget = \(stored\?\.targetHandle \? await resolveActorHandle\(stored\.targetHandle\) : null\)/.test(ACTION)
    && /targetActor: restoredTarget,/.test(ACTION)
    && /const \{ actor, action, ctx \} = await restoreOutcomeContext\(stored\);/.test(ACTION)
    && !/targetActor: stored\?\.targetActorId \? game\.actors\.get/.test(ACTION));
}

/* C — R3, the opening Flat-Footed */
{
  const handlers = {};
  globalThis.Hooks = { on: (name, fn) => { handlers[name] = fn; } };
  TRec.registerTurnRecordHooks();
  let deleted = null;
  const flags = {};
  const actor = {
    uuid: "W", name: "W",
    effects: [{ id: "ff", flags: { "trg-prime": { initialFlatFooted: true } } }, { id: "spell", flags: { "trg-prime": {} } }, { id: "plainFF", flags: {} }],
    getFlag: (_s, k) => flags[k], unsetFlag: async (_s, k) => { delete flags[k]; }, setFlag: async (_s, k, v) => { flags[k] = v; },
    deleteEmbeddedDocuments: async (_t, ids) => { deleted = ids; }
  };
  globalThis.game = { user: { isGM: true } };
  await handlers.deleteCombat?.({ combatants: [{ actor }] });
  ok("C1 THE OLD DEFECT, cured: a combatant whose turn never came loses the combat's Flat-Footed, and nothing else",
    JSON.stringify(deleted) === JSON.stringify(["ff"]), JSON.stringify(deleted));
}

/* D — R4 and the version */
{
  // The schema moved on at 3.624.0 for its own pass (NPC luck); R4's point
  // is that nothing touches the conviction flag.
  ok("D1 R4 — no pass was added for the conviction flag",
    /export const TRG_SCHEMA_VERSION = "[\d.]+";/.test(MIGRATION) && !/convictionGranted/.test(MIGRATION));
  const sys = JSON.parse(read("system.json"));
  ok("D2 the version is 3.622.2 or later",
    String(sys.version).localeCompare("3.622.2", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-drive-36221: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-36221: OK — ${checks} checks. Light circles follow, drop and end on their own; a late-DC resume acts on the token; a combat's end takes the opening Flat-Footed away.`);
