#!/usr/bin/env node
/**
 * verify-skill-tumble — TRG Prime 3.715.1: the Tumble skill action (Acrobatics).
 *
 * Graham, 26 November 2026, after Wednesday's game: "the Tumble action on the
 * Acrobatics skill. This is not working." At the table: the move after it cost
 * extra AP, it still provoked Attacks of Opportunity, and the DC was wrong or
 * had no target.
 *
 * The book (Core 3.7/3.8, Acrobatics): "Action 1 AP. You take a Stride action
 * as part of this action. During this movement, you can try to either move
 * through an enemy's threatened area or move through the space of one enemy
 * without provoking a reaction. Attempt an Acrobatics check against the
 * enemy's Fortitude DC or Acrobatics DC (whichever is higher) … Failure: Your
 * movement ends, and you trigger reactions as if you had moved out of the
 * square you started in. … The DC is increased by 2 if you are trying to move
 * through the enemy's space."
 *
 *   T   the rules (tumble.mjs), driven: who may be chosen, the choice, the +2,
 *       what each degree does, the Stride's leg and its card line
 *   M   the Stride's reactions, driven against stub tokens: the Tumbled enemy
 *       is exempt, every other enemy still reacts
 *   F   a failure's reactions: from the starting square
 *   L   the "next action" lapse notice: a Step says Step, the Stride says move
 *   W   the wiring, structurally
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

globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: { wait: async () => null } }, ux: {} }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false, escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = { on() {}, once() {}, off() {}, callAll() {}, call() { return true; } };
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => d };
const infos = [];
globalThis.ui = { notifications: { warn() {}, info(m) { infos.push(m); }, error() {} } };

const t = await imp("combat/tumble.mjs");

/* ================================================================== */
/* T — the rules                                                       */
/* ================================================================== */

// Who may be chosen: within your Speed plus the enemy's reach (min 5 ft).
const rows = [
  { id: "far", feet: 40 },
  { id: "ogre", feet: 35, reach: 10 },
  { id: "near", feet: 5 },
  { id: "edge", feet: 30, reach: 0 },
  { id: "gone", feet: null },
  { id: "tie", feet: 5 }
];
equal("T1 candidates: Speed + reach, nearest first, stable, unmeasured dropped",
  t.tumbleCandidates(rows, 25).map((r) => r.id), ["near", "tie", "edge", "ogre"]);
equal("T2 a reach of 0 still threatens 5 ft", t.tumbleCandidates([{ id: "a", feet: 30, reach: 0 }], 25).length, 1);
equal("T3 beyond Speed + reach is not offered", t.tumbleCandidates([{ id: "a", feet: 31 }], 25).length, 0);
equal("T4 no rows, no candidates", t.tumbleCandidates(null, 25), []);

equal("T5 the choice round-trips (space)", t.parseTumbleChoice(t.tumbleChoiceValue("Ab|c", "space")), { tokenId: "Ab|c", through: "space" });
equal("T6 the choice round-trips (area)", t.parseTumbleChoice(t.tumbleChoiceValue("x", "area")), { tokenId: "x", through: "area" });
equal("T7 an unknown purpose reads as area", t.tumbleChoiceValue("x", "bogus"), "x|area");
equal("T8 junk is no choice", [t.parseTumbleChoice(""), t.parseTumbleChoice("x|fly"), t.parseTumbleChoice("|space")], [null, null, null]);

const cands = [{ id: "a" }, { id: "b" }];
equal("T9 opens on the target if a candidate, past it", t.tumbleDefaultChoice(cands, "b"), "b|area");
equal("T10 otherwise on the nearest", t.tumbleDefaultChoice(cands, "zz"), "a|area");
equal("T11 nothing to open on", t.tumbleDefaultChoice([], "a"), null);

equal("T12 through its space: +2 DC", t.tumbleDCAdjustment("space"), 2);
equal("T13 past it: no change", [t.tumbleDCAdjustment("area"), t.tumbleDCAdjustment(null)], [0, 0]);
equal("T14 nothing else exports the 2", "TUMBLE_SPACE_DC" in t, false);

const plan = (d, w) => t.tumbleOutcome(d, w);
equal("T15 critical through space: normal squares, Stride, exempt",
  plan("critical", "space"), { passed: true, passage: "normal", armStride: true, exemptEnemy: true, failureReactions: false });
equal("T16 success through space: difficult squares",
  plan("success", "space"), { passed: true, passage: "difficult", armStride: true, exemptEnemy: true, failureReactions: false });
equal("T17 heroic reads as critical", plan("heroic", "space").passage, "normal");
equal("T18 past it: a Stride but no passage through its space",
  plan("success", "area"), { passed: true, passage: null, armStride: true, exemptEnemy: true, failureReactions: false });
equal("T19 failure: no Stride, reactions",
  plan("failure", "space"), { passed: false, passage: null, armStride: false, exemptEnemy: false, failureReactions: true });
equal("T20 fumble: as failure (the prone is basic-action-conditions')", plan("fumble", "area").failureReactions && !plan("fumble", "area").armStride, true);
equal("T21 no enemy chosen keeps the old reading (through a space)", plan("success", null).passage, "difficult");
equal("T22 no degree does nothing", plan("", "space"), { passed: false, passage: null, armStride: false, exemptEnemy: false, failureReactions: false });

equal("T23 the Stride's leg: land Speed, provokes, the enemy exempt, the next action",
  t.tumbleLeg({ speedFeet: 25, exemptTokenId: "ogre" }),
  { speedKey: "land", maxFeet: 25, provokes: true, exemptReactorTokenIds: ["ogre"], note: "Tumble's Stride", nextAction: true });
equal("T24 no enemy, no exemption", t.tumbleLeg({ speedFeet: 30 }).exemptReactorTokenIds, []);
equal("T25 a bad Speed is 0, not NaN", t.tumbleLeg({ speedFeet: "x" }).maxFeet, 0);
ok("T26 the leg is not a Step (it is a Stride)", !("countsAs" in t.tumbleLeg({ speedFeet: 25 })));

const strideLine = t.tumbleStrideLine({ speedFeet: 25, enemyName: "Goblin", through: "space", passage: "difficult" });
ok("T27 the card: feet, no AP, the enemy, the others, the squares",
  /up to 25 ft, no further AP/.test(strideLine) && /Goblin gets no reaction/.test(strideLine)
  && /other enemies still may/.test(strideLine) && /Goblin's space: its squares count as difficult terrain/.test(strideLine), strideLine);
ok("T28 past it: no word of its space",
  !/space/.test(t.tumbleStrideLine({ speedFeet: 25, enemyName: "Goblin", through: "area", passage: null })));

/* ================================================================== */
/* M — the Stride's reactions, driven                                  */
/* ================================================================== */

// A 100px, 5-ft grid; distance is Chebyshev in squares.
globalThis.canvas = {
  grid: {
    size: 100, distance: 5,
    measurePath(points) {
      const [a, b] = points;
      return { distance: Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / 100 * 5 };
    }
  },
  tokens: { placeables: [] }
};
function stubToken(id, col, row, disposition) {
  const actor = {
    id: `A-${id}`, name: id, inCombat: true,
    system: { combat: { reach: 5 }, resources: { reactions: { value: 1 } } },
    items: [], effects: [], appliedEffects: [],
    hasCondition: () => false, getFlag: () => undefined, statuses: new Set()
  };
  return {
    id, actor, name: id, w: 100, h: 100,
    x: col * 100, y: row * 100,
    center: { x: col * 100 + 50, y: row * 100 + 50 },
    document: { id, x: col * 100, y: row * 100, width: 1, height: 1, disposition }
  };
}
globalThis.game = { ...globalThis.game, combat: { started: true }, user: { isGM: true } };
const mover = stubToken("pc", 0, 0, 1);
const goblin = stubToken("goblin", 1, 0, -1);
const kobold = stubToken("kobold", 0, 1, -1);
canvas.tokens.placeables = [mover, goblin, kobold];
// A move from (0,0) two squares right: it leaves both enemies' reach.
const movement = { origin: { x: 0, y: 0 }, passed: { waypoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }] } };
const opp = await imp("combat/opportunity.mjs");
const all = opp.movementReactors(mover, movement).reactors.map((r) => r.token.id).sort();
ok("M0 the stub provokes from both enemies with no exemption", JSON.stringify(all) === JSON.stringify(["goblin", "kobold"]), JSON.stringify(all));
const exempted = opp.movementReactors(mover, movement, { exemptTokenIds: ["goblin"] }).reactors.map((r) => r.token.id);
equal("M1 the Tumbled enemy is exempt; the other still reacts", exempted, ["kobold"]);
equal("M2 an empty exemption changes nothing", opp.movementReactors(mover, movement, { exemptTokenIds: [] }).reactors.length, 2);
equal("M3 the departure check: both enemies threaten the starting square",
  opp.stationaryReactors(mover).reactors.map((r) => r.token.id).sort(), ["goblin", "kobold"]);

/* ================================================================== */
/* L — the lapse notice                                                */
/* ================================================================== */

const mw = await imp("combat/movement-workflow.mjs");
function legActor(leg) {
  const flags = { armedMovement: "compoundLeg", compoundLeg: leg };
  return {
    name: "Gymnast",
    getFlag: (_s, k) => flags[k],
    setFlag: async (_s, k, v) => { flags[k] = v; },
    unsetFlag: async (_s, k) => { delete flags[k]; },
    flags
  };
}
infos.length = 0;
const strideActor = legActor({ ...t.tumbleLeg({ speedFeet: 25, exemptTokenId: "goblin" }), label: "Tumble", apAtArm: 2 });
const lapsed = await mw.lapseNextActionLeg(strideActor);
ok("L1 another action lapses the Tumble's Stride", lapsed === true && strideActor.flags.compoundLeg === undefined);
equal("L2 …and says the free move, not Step", infos, ["Tumble: the free move is removed — it had to be Gymnast's next action."]);
infos.length = 0;
await mw.lapseNextActionLeg(legActor({ speedKey: "land", maxFeet: 5, provokes: false, countsAs: "step", nextAction: true, label: "Agile Display" }));
equal("L3 a Step's notice is unchanged", infos, ["Agile Display: the free Step is removed — it had to be Gymnast's next action."]);

/* ================================================================== */
/* W — the wiring                                                      */
/* ================================================================== */

const aw = read("module", "combat", "action-workflow.mjs");
const tw = read("module", "combat", "tumble-workflow.mjs");
const mws = read("module", "combat", "movement-workflow.mjs");
const ops = read("module", "combat", "opportunity.mjs");

ok("W1 the enemy is asked before the target is read; a cancel spends nothing",
  /if \(action\.key === "tumble"\) \{\s*const \{ chooseTumbleEnemy \} = await import\("\.\/tumble-workflow\.mjs"\);\s*const chosen = await chooseTumbleEnemy\(actor, \{ skip: skipDialog\(event\) \}\);\s*if \(chosen\?\.cancelled\) return null;\s*tumbleSetup = chosen\?\.setup \?\? null;\s*\}\s*const targetActor = presetDispel \? null : firstTargetActor\(\);/.test(aw));
ok("W2 the DC is the higher of Fortitude and Acrobatics (data)",
  /key: "tumble",[\s\S]{0,200}against: \["skillDC:acrobatics", "fortitudeDC"\]/.test(read("module", "data", "skill-actions.mjs")));
ok("W3 through its space adds the 2 to the DC, with a line",
  /if \(action\.key === "tumble" && resolved\.dc !== null && tumbleDCAdjustment\(tumbleSetup\?\.through\) > 0\) \{\s*resolved\.dc \+= tumbleDCAdjustment\(tumbleSetup\.through\);\s*defenceDCLines\.push\(/.test(aw));
ok("W4 the setup reaches the outcome, a pending card and a resumed one",
  /    tumbleSetup,\n/.test(aw) && /tumbleSetup = null,\n    ignoreActionImmunity = false\n  \} = ctx \?\? \{\};/.test(aw)
  && /tumbleSetup: ctx\.tumbleSetup \?\? null,/.test(aw) && /tumbleSetup: stored\?\.tumbleSetup \?\? null,/.test(aw));
ok("W5 a pass arms the Stride and says so; a failure offers the reactions in combat",
  /if \(plan\.armStride && await armTumbleStride\(actor, tumbleSetup\)\) \{\s*lines\.push\(line\(tumbleStrideLine\(/.test(aw)
  && /if \(plan\.failureReactions && game\.combat\?\.started\) \{[\s\S]{0,200}void tumbleFailureReactions\(actor\)/.test(aw));
ok("W6 the leg is armed free of AP, as the next action, in combat only",
  /if \(!game\.combat\?\.started\) return false;\s*const \{ armCompoundLeg \} = await import\("\.\/compound-action-workflow\.mjs"\);\s*await armCompoundLeg\(actor, \{\s*\.\.\.tumbleLeg\(\{ speedFeet: tumbleLandSpeed\(actor\), exemptTokenId: setup\?\.tokenId \?\? null \}\),\s*apAtArm: Number\(actor\.system\?\.resources\?\.ap\?\.value \?\? 0\)\s*\}, "Tumble"\);/.test(tw));
ok("W7 the chosen enemy becomes the target", /token\.setTarget\?\.\(true, \{ user: game\.user, releaseOthers: true \}\);/.test(tw));
ok("W8 only enemies are offered", /keepByDisposition\(Number\(t\.document\?\.disposition \?\? 0\), myDisposition, "enemies"\)/.test(tw));
ok("W9 the movement hook reads the leg's exemption before awaiting, and passes it on",
  /const exemptTokenIds = armedKey === COMPOUND_LEG_KEY\s*\? \(tokenDocument\.actor\?\.getFlag\?\.\(SYSTEM_ID, COMPOUND_LEG_KEY\)\?\.exemptReactorTokenIds \?\? \[\]\)/.test(mws)
  && /m\.detectMovementAoO\(tokenDocument, movement, \{ exemptTokenIds \}\)/.test(mws));
ok("W9b detection hands the exemption to the reactor search",
  /export async function detectMovementAoO\(tokenDocument, movement, \{ exemptTokenIds = \[\] \} = \{\}\) \{[\s\S]{0,250}movementReactors\(moverToken, movement, \{ exemptTokenIds \}\)/.test(ops));
ok("W10 the departure check is a movement provoke from the stationary reactors",
  /export async function detectDepartureAoO\(actor\) \{[\s\S]{0,200}offerAttacksOfOpportunity\(moverToken, stationaryReactors\(moverToken\), "movement"\)/.test(ops));
ok("W11 the passage marker is still set for the movement hook (page 198)",
  /if \(plan\.passage\) await actor\.setFlag\(SYSTEM_ID, TUMBLE_FLAG, plan\.passage\);\s*else if \(actor\.getFlag\?\.\(SYSTEM_ID, TUMBLE_FLAG\)\) await actor\.unsetFlag\(SYSTEM_ID, TUMBLE_FLAG\);/.test(aw));
ok("W12 the fumble still knocks you prone",
  /tumble: \{\s*fumble: \[\{ target: "self", conditionKey: "prone", active: true \}\]/.test(read("module", "combat", "basic-action-conditions.mjs")));

if (failures.length) {
  for (const f of failures) process.stdout.write(`  FAIL ${f}\n`);
  process.stdout.write(`verify-skill-tumble: FAILED — ${failures.length} of ${checks}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`verify-skill-tumble: OK — ${checks} checks.\n`);
}
