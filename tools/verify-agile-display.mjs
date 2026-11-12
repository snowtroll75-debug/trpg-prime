#!/usr/bin/env node
/**
 * verify-agile-display — TRG Prime 3.684.2: the Gymnast's Agile Display
 * grants its Step, free of AP, and asks for its creature after Use.
 *
 * The book (Agile Display; Flourish, Movement): "Action 1 AP. You Step 5
 * feet and may attempt an Acrobatics check against the Reflex DC of one
 * adjacent creature …"
 *
 * Graham, 5 November 2026: "When activated, this should allow the character
 * to step as a free (0 AP) action but does not seem to work. Also, the
 * character should be able to select any target once the use ability is
 * clicked that is within step range to target."
 *
 *   R   the reach: the Step plus 5 ft, and the creatures within it
 *   L   the leg: land Speed, the Step's feet, no reactions, a Step
 *   K   a leg that counts as a Step is read as one by the movement hook
 *   U   the use, run: cancel spends nothing; "no check" spends 1 AP and
 *       arms the Step; the chooser lists and pre-selects
 *   W   the wiring, structurally
 *   N   (3.684.5) the Step must be the next action. Graham, 5 November 2026:
 *       "The step must be the next action, if the character does something
 *       else, the free step is removed." Any other action first — AP spent,
 *       a basic action, a Strike, another Use — removes the leg; other
 *       compound legs are unchanged
 *   N11–N19 (3.684.6) a reaction, a refusal and a cancel keep the Step.
 *       Graham, 5 November 2026: "A reaction should not affect it", and "Yes"
 *       to "Should an action that is refused or cancelled keep the Step?".
 *       Behavioural: the real resolveAction, rollWeaponAttack, spend and
 *       refund, against an actor with the leg armed
 *   N20–N25 (3.684.6, Graham's three answers and the review's four findings)
 *       a refund restores only the Step its own spend removed; a Strike
 *       cancelled after its AP gets the AP back; a Strike wasted by Sanctuary
 *       keeps the Step; a Strike stopped by the miss-chance flat check, and
 *       ending Take Cover, are actions taken
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

const DialogV2 = { wait: async () => null };
globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2 }, ux: {} }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false, escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = { on() {}, once() {}, off() {}, callAll() {} };
const cards = [];
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (data) => { cards.push(data); return data; } };
const warnings = [];
const infos = [];
globalThis.ui = { notifications: { warn(m) { warnings.push(m); }, info(m) { infos.push(m); }, error() {} } };

const ad = await imp("combat/agile-display.mjs");
const mv = await imp("combat/movement.mjs");
const mw = await imp("combat/movement-workflow.mjs");
const fw = await imp("feats-workflow.mjs");
const apw = await imp("combat/action-points-workflow.mjs");
const src = {
  feats: read("module", "feats-workflow.mjs"),
  mw: read("module", "combat", "movement-workflow.mjs"),
  apw: read("module", "combat", "action-points-workflow.mjs"),
  aw: read("module", "combat", "action-workflow.mjs"),
  attack: read("module", "combat", "attack-workflow.mjs")
};
const agileSrc = src.feats.slice(src.feats.indexOf("\"agile display\": {"), src.feats.indexOf("\"sense weakness\": {"));

// ── R: the reach and the creatures within it ────────────────────────────
equal("R1 the reach is the Step plus 5 ft (5 → 10, Graceful Step's 10 → 15; nothing → a 5-ft Step's 10)",
  [ad.agileDisplayReach(5), ad.agileDisplayReach(10), ad.agileDisplayReach(0), ad.agileDisplayReach(NaN)], [10, 15, 10, 10]);
{
  const rows = [{ id: "far", feet: 15 }, { id: "edge", feet: 10 }, { id: "adj", feet: 5 }, { id: "lost", feet: null }, { id: "on", feet: 0 }, { id: "adj2", feet: 5 }];
  equal("R2 within reach, inclusive, nearest first and stable; an unmeasured token is left out",
    ad.agileDisplayCandidates(rows, 10).map((r) => r.id), ["on", "adj", "adj2", "edge"]);
  equal("R3 Graceful Step's reach takes the 15-ft creature too", ad.agileDisplayCandidates(rows, 15).map((r) => r.id), ["on", "adj", "adj2", "edge", "far"]);
  equal("R4 the chooser opens on the targeted token if it is within reach, else on \"no check\"",
    [ad.agileDisplayDefault([{ id: "adj" }], "adj"), ad.agileDisplayDefault([{ id: "adj" }], "far"), ad.agileDisplayDefault([{ id: "adj" }], null), ad.agileDisplayDefault([], "adj")],
    ["adj", "none", "none", "none"]);
}

// ── L: the leg ──────────────────────────────────────────────────────────
equal("L1 the leg: land Speed, the Step's feet, provokes nothing, counts as a Step",
  [ad.agileDisplayLeg(5), ad.agileDisplayLeg(10).maxFeet, ad.agileDisplayLeg(0).maxFeet],
  [{ speedKey: "land", maxFeet: 5, provokes: false, countsAs: "step", note: "Agile Display's Step", nextAction: true }, 10, 5]);
{
  const leg = { ...ad.agileDisplayLeg(5), label: "Agile Display" };
  const five = mv.validateCompoundLeg(leg, { moveCost: 5, speedKey: "land" });
  const ten = mv.validateCompoundLeg(leg, { moveCost: 10, speedKey: "land" });
  const fly = mv.validateCompoundLeg(leg, { moveCost: 5, speedKey: "fly" });
  equal("L2 the movement hook allows 5 ft for 0 AP, refuses 10 ft (difficult ground included) and any other Speed",
    [five.allowed, five.apCost, ten.allowed, fly.allowed], [true, 0, false, false]);
}
equal("L3 the card's Step line", ad.agileDisplayStepLine(10), "<strong>Step:</strong> drag the token up to 10 ft — no AP, no reactions provoked.");
{
  const actor = (feats = [], land = 25) => ({ system: { combat: { movement: { land: { base: land, total: land } } } }, items: feats.map((name) => ({ type: "feat", name })), effects: [] });
  equal("L4 the Step's distance is the core's: 5, Graceful Step 10", [mw.stepDistance(actor()), mw.stepDistance(actor(["Graceful Step"]))], [5, 10]);
}

// ── K: a leg that counts as a Step ─────────────────────────────────────
equal("K1 armedMovementKind: a Step leg is a Step; a plain leg, a leg naming nothing armable, and every other key are themselves",
  [mv.armedMovementKind("compoundLeg", { countsAs: "step" }), mv.armedMovementKind("compoundLeg", {}), mv.armedMovementKind("compoundLeg", { countsAs: "teleport" }),
    mv.armedMovementKind("compoundLeg", { countsAs: "compoundLeg" }), mv.armedMovementKind("step", null), mv.armedMovementKind("charge", { countsAs: "step" }), mv.armedMovementKind(null)],
  ["step", "compoundLeg", "compoundLeg", "compoundLeg", "step", "charge", null]);
ok("K2 the hook eases the path, and picks the AP kinds, by what the leg counts as (Feather Step)",
  /const armedAs = armedMovementKind\(armedNow, armedNow === COMPOUND_LEG_KEY \?/.test(src.mw) && /pathCost\(movement, actor, armedAs\)/.test(src.mw)
  && /\/\^step\$\/i\.test\(String\(armedAs \?\? state\.armed\)\)/.test(src.mw));
ok("K3 the leg's spend is a Step's", /\|\| armedAs === "step" \? "step" : "move"/.test(src.mw));

// ── U: the use, run ─────────────────────────────────────────────────────
function fakeActor(ap = 3) {
  return {
    name: "Gymnast", uuid: "Actor.g", id: "g", items: [], effects: [], appliedEffects: [],
    flags: { "trg-prime": {} },
    system: { resources: { ap: { value: ap, max: 3 } }, combat: { movement: { land: { base: 25, total: 25 } } }, skills: { acrobatics: { total: 7 } } },
    writes: [], tokens: [],
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async setFlag(scope, key, value) { this.flags[scope] = { ...(this.flags[scope] ?? {}), [key]: value }; },
    async unsetFlag(scope, key) { delete this.flags[scope]?.[key]; },
    async update(changes) { this.writes.push(changes); if ("system.resources.ap.value" in changes) this.system.resources.ap.value = changes["system.resources.ap.value"]; },
    getActiveTokens() { return this.tokens; }
  };
}
function fakeToken(id, name, col, row, actor = null) {
  return { id, name, actor: actor ?? { system: { combat: { saves: { reflex: { total: 4 } } } } }, document: { x: col * 100, y: row * 100, width: 1, hidden: false },
    targeted: false, setTarget(on) { this.targeted = on; } };
}
globalThis.canvas = { grid: { size: 100, measurePath: ([a, b]) => ({ distance: Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / 100 * 5 }) }, tokens: { placeables: [] } };
const use = fw.FEAT_AUTOMATION["agile display"].use;
{
  const actor = fakeActor();
  const mine = fakeToken("me", "Gymnast", 0, 0, actor);
  actor.tokens = [mine];
  const adj = fakeToken("adj", "Goblin", 1, 0), afterStep = fakeToken("two", "Orc", 2, 1), far = fakeToken("far", "Ogre", 4, 0);
  canvas.tokens.placeables = [mine, far, afterStep, adj];
  globalThis.game = { settings: { get: () => null }, combat: { started: true, round: 2, id: "c", turn: 0 }, user: { isGM: true, targets: { first: () => afterStep } } };

  let asked = null;
  DialogV2.wait = async (opts) => { asked = opts.content; return "cancel"; };
  cards.length = 0;
  await use(actor);
  equal("U1 a cancelled chooser spends no AP, arms no Step and posts nothing", [actor.writes.length, actor.flags["trg-prime"].compoundLeg ?? null, actor.flags["trg-prime"].armedMovement ?? null, cards.length], [0, null, null, 0]);
  const values = [...String(asked ?? "").matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  equal("U2 the chooser lists every creature within the Step plus 5 ft, nearest first, then \"no check\"", values, ["adj", "two", "none"]);
  ok("U3 and opens on the token already targeted", /<option value="two" selected>/.test(String(asked)), String(asked).slice(0, 200));

  DialogV2.wait = async () => ({ choice: "none" });
  await use(actor);
  const leg = actor.flags["trg-prime"].compoundLeg ?? null;
  equal("U4 \"no check\": 1 AP spent, the Step armed as a free leg that provokes nothing and counts as a Step",
    [actor.system.resources.ap.value, actor.flags["trg-prime"].armedMovement ?? null, leg && { speedKey: leg.speedKey, maxFeet: leg.maxFeet, provokes: leg.provokes, countsAs: leg.countsAs, label: leg.label }],
    [2, "compoundLeg", { speedKey: "land", maxFeet: 5, provokes: false, countsAs: "step", label: "Agile Display" }]);
  ok("U5 and the card says how to take the Step", cards.length === 1 && /drag the token up to 5 ft — no AP, no reactions provoked/.test(cards[0].content) && /No Acrobatics check/.test(cards[0].content));

  const poor = fakeActor(0); poor.tokens = [fakeToken("p", "Poor", 0, 0, poor)];
  let opened = false;
  DialogV2.wait = async () => { opened = true; return { choice: "none" }; };
  warnings.length = 0;
  await use(poor);
  equal("U6 without the AP, it says so before any chooser and arms nothing", [opened, poor.writes.length, poor.flags["trg-prime"].compoundLeg ?? null, warnings], [false, 0, null, ["Agile Display: 1 AP required."]]);

  const tokenless = fakeActor();
  let label = null;
  DialogV2.wait = async (opts) => { label = opts.content; return "cancel"; };
  await use(tokenless);
  ok("U7 with no token on the scene, the typed Reflex DC is asked instead; cancelling it spends nothing",
    /Adjacent creature's Reflex DC/.test(String(label)) && tokenless.writes.length === 0 && !tokenless.flags["trg-prime"].compoundLeg);
}

// ── W: the wiring ───────────────────────────────────────────────────────
{
  const at = (re) => { const m = agileSrc.match(re); return m ? m.index : -1; };
  const apCheck = at(/if \(game\.combat\?\.started && ap < 1\)/);
  const chooser = at(/await chooseFromList\("Agile Display"/);
  const cancel = at(/if \(picked === null \|\| picked === undefined\) return;/);
  const spend = at(/await actor\.update\(\{ "system\.resources\.ap\.value": Number\(actor\.system\.resources\?\.ap\?\.value \?\? 0\) - 1 \}\);/);
  const arm = at(/await armCompoundLeg\(actor, \{ \.\.\.agileDisplayLeg\(stepFeet\), apAtArm: Number\(actor\.system\.resources\?\.ap\?\.value \?\? 0\) \}, "Agile Display"\);/);
  const roll = at(/await TRGCheck\.roll\(/);
  ok("W1 the order: AP checked, the chooser, a cancel returns, then the spend, the leg, the roll",
    apCheck >= 0 && apCheck < chooser && chooser < cancel && cancel < spend && spend < arm && arm < roll, JSON.stringify({ apCheck, chooser, cancel, spend, arm, roll }));
  ok("W2 the leg is armed inside the combat branch, right after the spend", /- 1 \}\);\n(?:\s*\/\/[^\n]*\n)*\s*const \{ armCompoundLeg \} = await import\("\.\/combat\/compound-action-workflow\.mjs"\);\n\s*await armCompoundLeg\(/.test(agileSrc));
  ok("W3 the candidates are measured with the core's distanceBetween from the actor's token", /feet: distanceBetween\(mine, t\)/.test(agileSrc) && /agileDisplayReach\(stepFeet\)/.test(agileSrc) && /const stepFeet = stepDistance\(actor\);/.test(agileSrc));
  ok("W4 the chosen creature becomes the user's target", /target\.setTarget\?\.\(true, \{ user: game\.user, releaseOthers: true \}\)/.test(agileSrc));
  ok("W5 the DC is today's: 10 + Reflex", /dc = 10 \+ Number\(target\.actor\?\.system\?\.combat\?\.saves\?\.reflex\?\.total \?\? 0\)/.test(agileSrc));
  ok("W6 the leg provokes nothing (agile-display.mjs)", /provokes: false/.test(read("module", "combat", "agile-display.mjs")));
  ok("W7 the chooser offers \"no check\"", /\[AGILE_DISPLAY_NO_CHECK, "No check — just Step"\]/.test(agileSrc));
  ok("W8 the chooser can open on a choice", /async function chooseFromList\(title, label, options, selected = null\)/.test(src.feats) && /String\(v\) === String\(selected\) \? " selected" : ""/.test(src.feats));
}

// ── N: the Step must be the next action (3.684.5) ──────────────────────
{
  const leg = (o = {}) => ({ ...ad.agileDisplayLeg(5), label: "Agile Display", apAtArm: 2, ...o });
  equal("N1 nextActionLegLapses: an armed Agile Display leg lapses on another action; on an AP write only below the pool it was armed at; a plain compound leg, a used leg and an armed Step never",
    [ad.nextActionLegLapses("compoundLeg", leg()),
      ad.nextActionLegLapses("compoundLeg", leg(), { apNow: 1 }), ad.nextActionLegLapses("compoundLeg", leg(), { apNow: 2 }), ad.nextActionLegLapses("compoundLeg", leg(), { apNow: 3 }),
      ad.nextActionLegLapses("compoundLeg", { speedKey: "land", maxFeet: 10, label: "Squeeze" }),
      ad.nextActionLegLapses(null, leg()), ad.nextActionLegLapses("step", leg()),
      ad.nextActionLegLapses("compoundLeg", leg({ apAtArm: undefined }), { apNow: 0 })],
    [true, true, false, false, false, false, false, false]);

  const armedActor = (legFlag, ap = 2) => {
    const a = fakeActor(ap);
    a.inCombat = true;
    a.flags["trg-prime"] = { armedMovement: "compoundLeg", compoundLeg: legFlag };
    return a;
  };
  const state = (a) => [a.flags["trg-prime"].armedMovement ?? null, Boolean(a.flags["trg-prime"].compoundLeg)];
  globalThis.game = { settings: { get: () => null }, combat: { started: true, round: 2, id: "c", turn: 0 }, user: { id: "u1", isGM: true, targets: { first: () => null } }, actors: [] };

  infos.length = 0;
  const a1 = armedActor(leg());
  const lapsed = await mw.lapseNextActionLeg(a1);
  const plain = armedActor({ speedKey: "land", maxFeet: 10, label: "Squeeze", provokes: false });
  const kept = await mw.lapseNextActionLeg(plain);
  equal("N2 lapseNextActionLeg removes the Agile Display leg and says why; a plain compound leg stays armed",
    [lapsed, state(a1), kept, state(plain), infos], [true, [null, false], false, ["compoundLeg", true],
      ["Agile Display: the free Step is removed — it had to be Gymnast's next action."]]);

  const struck = armedActor(leg());
  await apw.spendActionPoints(struck, "1", "Longsword");
  const free = armedActor(leg());
  await apw.spendActionPoints(free, "0", "Agile Display's Step", { use: "step" });
  const plainSpend = armedActor({ speedKey: "land", maxFeet: 10, label: "Squeeze" });
  await apw.spendActionPoints(plainSpend, "1", "Longsword");
  equal("N3 spending AP on anything else (a Strike's 1 AP) removes it; the leg's own 0-AP drag does not; a plain compound leg survives a spend",
    [state(struck), struck.system.resources.ap.value, state(free), state(plainSpend)], [[null, false], 1, ["compoundLeg", true], ["compoundLeg", true]]);

  const hookActor = (ap) => { const a = armedActor(leg()); mw.onApWriteLapse(a, { system: { resources: { ap: { value: ap } } } }, {}, "u1"); return a; };
  const flat = armedActor(leg()); mw.onApWriteLapse(flat, { "system.resources.ap.value": 1 }, {}, "u1");
  const otherUser = armedActor(leg()); mw.onApWriteLapse(otherUser, { system: { resources: { ap: { value: 0 } } } }, {}, "u2");
  const noAp = armedActor(leg()); mw.onApWriteLapse(noAp, { name: "x" }, {}, "u1");
  const lowered = hookActor(1), same = hookActor(2), refunded = hookActor(3);
  await new Promise((r) => setTimeout(r, 0));
  equal("N4 an AP write that is an action (a feat that writes its own AP): below the pool the leg was armed at removes it, flat or nested; the same or more, another user's write, or no AP in the write leave it",
    [state(lowered), state(flat), state(same), state(refunded), state(otherUser), state(noAp)],
    [[null, false], [null, false], ["compoundLeg", true], ["compoundLeg", true], ["compoundLeg", true], ["compoundLeg", true]]);

  // The Use itself: armed at the pool it leaves; a second Use lapses the first.
  const g = fakeActor(3); g.inCombat = true;
  g.tokens = [fakeToken("me2", "Gymnast", 0, 0, g)];
  canvas.tokens.placeables = [g.tokens[0]];
  DialogV2.wait = async () => ({ choice: "none" });
  await use(g);
  const first = g.flags["trg-prime"].compoundLeg;
  infos.length = 0;
  await use(g);
  const second = g.flags["trg-prime"].compoundLeg;
  equal("N5 the Use arms the leg at the pool it leaves (3 → 2); a second Use is another action: the first Step is removed, with its notice, and the new one armed at 1",
    [first?.apAtArm, first?.nextAction, second?.apAtArm, g.flags["trg-prime"].armedMovement, infos.filter((m) => /free Step is removed/.test(m)).length],
    [2, true, 1, "compoundLeg", 1]);
}
{
  ok("N6 spendActionPoints lapses the leg after the 0-AP return, so the leg's own drag never does (unless the spender defers it, 3.684.6)",
    /const cost = parseApCost\(apCost\);\n\s*if \(!cost\) return;\n(?:\s*\/\/[^\n]*\n)*\s*if \(!continuesSpend\) \{\n\s*const \{ lapseNextActionLeg, forgetLapsedLeg \} = await import\("\.\/movement-workflow\.mjs"\);\n\s*if \(deferNextAction\) await forgetLapsedLeg\(actor\);\n\s*else await lapseNextActionLeg\(actor, \{ spendFrom: Number\(actor\.system\?\.resources\?\.ap\?\.value \?\? 0\) \}\);/.test(src.apw));
  ok("N7 a basic action no longer lapses it at the click (3.684.6); the entry clear leaves a next-action leg, and Aim is still cleared there",
    /await clearAimIfOtherAction\(actor, action\.key\);\n\n\s*\/\/ An armed movement action survives[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(!isArmableMovement\(action\.key\) && !nextActionLegArmed\(actor\)\) \{\n\s*await clearArmedMovement\(actor\);/.test(src.aw)
    && !/^\s*await lapseNextActionLeg\(actor\);$/m.test(src.aw));
  ok("N8 a Strike lapses it after Aim is cleared, a reaction's excepted", /await clearAimIfOtherAction\(actor, "strike"\);\n(?:\s*\/\/[^\n]*\n)*\s*await strikeTaken\(\);/.test(src.attack)
    && /const strikeTaken = async \(\) => \{\n\s*const \{ lapseNextActionLeg \} = await import\("\.\/movement-workflow\.mjs"\);\n\s*const \{ strikeSpendsReaction \} = await import\("\.\/agile-display\.mjs"\);\n\s*await lapseNextActionLeg\(actor, \{ reaction: strikeSpendsReaction\(\{ isReaction, readied, asReaction \}\) \}\);/.test(src.attack));
  ok("N9 the AP write hook is registered with the movement hooks", /Hooks\.on\("preMoveToken", onPreMoveToken\);\n(?:\s*\/\/[^\n]*\n)*\s*Hooks\.on\("updateActor", onApWriteLapse\);/.test(src.mw));
  ok("N10 the Use lapses an earlier leg before its own AP write", /await lapseNextActionLeg\(actor\);\n\s*await actor\.update\(\{ "system\.resources\.ap\.value"/.test(agileSrc));
}

// ── N11–N19: a reaction, a refusal and a cancel keep the Step (3.684.6) ─
// Graham, 5 November 2026: "A reaction should not affect it", and "Yes" to
// "Should an action that is refused or cancelled keep the Step?"
{
  const prep = await imp("combat/prepare.mjs");
  const leg = (o = {}) => ({ ...ad.agileDisplayLeg(5), label: "Agile Display", apAtArm: 2, ...o });
  equal("N11 the rule: a reaction never lapses the leg; a refund restores it only with nothing armed since and the pool back at the armed AP; the reaction cost and a reaction Strike are recognised",
    [ad.nextActionLegLapses("compoundLeg", leg(), { reaction: true }), ad.nextActionLegLapses("compoundLeg", leg(), { reaction: false }),
      ad.nextActionLegLapses("compoundLeg", leg(), { apNow: 0, reaction: true }),
      ad.nextActionLegRestores({ leg: leg(), apBefore: 2 }, { apNow: 2 }), ad.nextActionLegRestores({ leg: leg(), apBefore: 2 }, { apNow: 3 }), ad.nextActionLegRestores({ leg: leg(), apBefore: 2 }, { apNow: 1 }),
      ad.nextActionLegRestores({ leg: leg(), apBefore: 2 }, { armed: "step", apNow: 2 }), ad.nextActionLegRestores({ leg: leg(), apBefore: 2 }, { leg: { label: "Squeeze" }, apNow: 2 }),
      ad.nextActionLegRestores({ leg: { label: "Squeeze", apAtArm: 2 }, apBefore: 2 }, { apNow: 2 }), ad.nextActionLegRestores(null, { apNow: 2 }),
      prep.isReactionCost({ apCost: "Reaction" }), prep.isReactionCost({ apCost: " reaction " }), prep.isReactionCost({ apCost: "1" }), prep.isReactionCost({ apCost: "Free" }), prep.isReactionCost(null),
      ad.strikeSpendsReaction({ isReaction: true }), ad.strikeSpendsReaction({ readied: true }), ad.strikeSpendsReaction({ asReaction: true }), ad.strikeSpendsReaction({})],
    [false, true, false, true, true, false, false, false, false, false, true, true, false, false, false, true, true, true, false]);

  // A fresh, fuller world for the real workflows.
  // Every dialog is cancelled (the modules hold this file's DialogV2).
  DialogV2.wait = async () => null; DialogV2.confirm = async () => false;
  globalThis.foundry = { applications: { api: { DialogV2 }, ux: {} }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false,
    mergeObject: (a, b) => Object.assign(a ?? {}, b ?? {}), deepClone: (x) => structuredClone(x), escapeHTML: (x) => String(x), randomID: () => "r1" } };
  let rollTotal = 10;
  globalThis.Roll = class { constructor(f) { this.f = f; } async evaluate() { this.total = rollTotal; return this; } };
  globalThis.renderTemplate = async () => "<div></div>";
  globalThis.CONFIG = globalThis.CONFIG ?? {};
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => { cards.push(d); return d; }, getWhisperRecipients: () => [], applyMode: () => {} };
  globalThis.canvas = { tokens: { placeables: [] }, grid: { size: 100 } };
  globalThis.game = { settings: { get: () => null }, combat: { started: true, round: 2, id: "c", turn: 0, combatant: null, combatants: [] },
    user: { id: "u1", isGM: true, targets: new Set() }, actors: [], users: [] };
  const aw = await imp("combat/action-workflow.mjs");
  const atk = await imp("combat/attack-workflow.mjs");
  const rf = await imp("combat/reaction-feats.mjs");
  const armed = (conds = [], ap = 2) => {
    const a = {
      name: "Gymnast", id: "g", uuid: "Actor.g", inCombat: true, isOwner: true, items: [], effects: [], appliedEffects: [], statuses: new Set(conds), apWrites: [],
      flags: { "trg-prime": { armedMovement: "compoundLeg", compoundLeg: leg({ apAtArm: ap }) } },
      system: { resources: { ap: { value: ap, max: 3 }, reactions: { value: 1, max: 1 } }, skills: {}, combat: {}, abilities: { str: { mod: 2 }, dex: { mod: 2 } }, identity: { level: 1 } },
      hasCondition(k) { return conds.includes(k); },
      getFlag(sc, k) { return this.flags[sc]?.[k]; }, async setFlag(sc, k, v) { this.flags[sc] = { ...(this.flags[sc] ?? {}), [k]: v }; }, async unsetFlag(sc, k) { delete this.flags[sc]?.[k]; },
      async update(c, o = {}) {
        if ("system.resources.ap.value" in c) { this.system.resources.ap.value = c["system.resources.ap.value"]; this.apWrites.push({ c, o }); }
        if ("system.resources.reactions.value" in c) this.system.resources.reactions.value = c["system.resources.reactions.value"];
        // FLAG WRITES APPLY (3.684.6, re-review): `flags.trg-prime.a.b` lands at flags["trg-prime"].a.b,
        // so a spend's restricted points and a refund's are seen as written.
        for (const [k, v] of Object.entries(c)) {
          if (!k.startsWith("flags.trg-prime.")) continue;
          const path = k.slice("flags.trg-prime.".length).split(".");
          let at = this.flags["trg-prime"];
          for (const p of path.slice(0, -1)) at = (at[p] = (at[p] && typeof at[p] === "object") ? { ...at[p] } : {});
          at[path.at(-1)] = v;
          if (path.length > 1) this.flags["trg-prime"][path[0]] = { ...this.flags["trg-prime"][path[0]] };
        }
        // THE AP-WRITE HOOK, as Foundry would call it, when asked for.
        if (this.hooked && "system.resources.ap.value" in c) mw.onApWriteLapse(this, c, o, "u1");
      },
      getActiveTokens() { return []; }
    };
    game.combat.combatant = { actor: a, id: "cb" };
    return a;
  };
  const st = (a) => [a.flags["trg-prime"].armedMovement ?? null, Boolean(a.flags["trg-prime"].compoundLeg)];
  const KEPT = ["compoundLeg", true], GONE = [null, false];
  const removedNotices = () => infos.filter((m) => /the free Step is removed/.test(m)).length;

  // N12 — basic actions through the real resolveAction.
  const run = async (action, { conds = [], opts = {} } = {}) => {
    const a = armed(conds); infos.length = 0; warnings.length = 0;
    const result = await aw.resolveAction(a, action, opts);
    return { a, result, warned: warnings.slice(), notices: removedNotices() };
  };
  const reactionTaken = await run({ key: "agileTestReaction", name: "Test Reaction", apCost: "Reaction", traits: "", description: "d" });
  const reactionRefused = await run({ key: "arrestAFall", name: "Arrest a Fall", apCost: "Reaction", traits: "" }, { conds: ["flatFooted"] });
  const trainedRefused = await run({ key: "agileTestTrained", name: "Test Trained", apCost: "1", traits: "", proficiency: "trained", skills: ["arcana"], checkType: "skill" });
  const readiedTaken = await run({ key: "agileTestReadied", name: "Test Readied", apCost: "0", traits: "", description: "d" }, { opts: { readied: true } });
  const apTaken = await run({ key: "agileTestAp", name: "Test AP", apCost: "1", traits: "", description: "d" });
  const freeTaken = await run({ key: "agileTestFree", name: "Test Free", apCost: "Free", traits: "", description: "d" });
  equal("N12 a reaction-cost basic action, taken, keeps the Step (its reaction spent, no AP); a refused one (Flat-Footed) keeps it",
    [st(reactionTaken.a), reactionTaken.a.system.resources.reactions.value, reactionTaken.a.system.resources.ap.value, Boolean(reactionTaken.result), reactionTaken.notices,
      st(reactionRefused.a), reactionRefused.result, reactionRefused.warned.length, reactionRefused.notices],
    [KEPT, 0, 2, true, 0, KEPT, null, 1, 0]);
  equal("N13 a refused basic action (a Trained action, untrained) keeps the Step and spends nothing; a readied action (Ready's reaction) keeps it",
    [st(trainedRefused.a), trainedRefused.a.system.resources.ap.value, trainedRefused.result, trainedRefused.notices, st(readiedTaken.a), Boolean(readiedTaken.result), readiedTaken.notices],
    [KEPT, 2, null, 0, KEPT, true, 0]);
  equal("N14 a basic action taken still removes it, with its notice: a 1-AP one (AP spent) and a Free one",
    [st(apTaken.a), apTaken.a.system.resources.ap.value, apTaken.notices, st(freeTaken.a), freeTaken.a.system.resources.ap.value, freeTaken.notices],
    [GONE, 1, 1, GONE, 2, 1]);

  // N15–N16 — Strikes through the real rollWeaponAttack.
  const weapon = (traits = "Finesse") => ({ id: "w", name: "Rapier", type: "weapon", system: { traits, damage: "1d6", damageType: "slashing", group: "sword", equipped: true }, flags: {}, update: async () => {}, getFlag() {} });
  const strike = async (opts = {}, traits) => {
    const a = armed(); const w = weapon(traits); a.items = [w]; infos.length = 0;
    const result = await atk.rollWeaponAttack(a, w, { skipTargetPrompt: true, ...opts });
    return { a, result, notices: removedNotices() };
  };
  const aoo = await strike({ isReaction: true });
  const frozen = await strike(rf.strikeOptionsFor("frozen"));
  const exempt = await strike(rf.strikeOptionsFor("exempt"));
  const readiedStrike = await strike({ apPaid: true, readied: true });
  const taken = await strike();
  const freeStrike = await strike({ apPaid: true });
  equal("N15 a reaction Strike keeps the Step: an Attack of Opportunity, a reaction feat's frozen and exempt Strikes, a readied Strike — each rolled, no AP; a Strike taken (1 AP) and a free one remove it",
    [[st(aoo.a), Boolean(aoo.result), aoo.notices], [st(frozen.a), Boolean(frozen.result)], [st(exempt.a), Boolean(exempt.result)], [st(readiedStrike.a), Boolean(readiedStrike.result)],
      [st(taken.a), taken.a.system.resources.ap.value, Boolean(taken.result), taken.notices], [st(freeStrike.a), freeStrike.notices]],
    [[KEPT, true, 0], [KEPT, true], [KEPT, true], [KEPT, true], [GONE, 1, true, 1], [GONE, 1]]);

  const atTarget = armed(); atTarget.items = [weapon()]; infos.length = 0;
  const targetCancelled = await atk.rollWeaponAttack(atTarget, atTarget.items[0], {});
  const atPrompt = await strike({}, "Versatile P, Finesse");
  const taken1 = await strike();
  const write = taken1.a.apWrites[0];
  const hooked = armed(); hooked.system.resources.ap.value = 1;
  mw.onApWriteLapse(hooked, { system: { resources: { ap: { value: 1 } } } }, write?.o ?? {}, "u1");
  await new Promise((r) => setTimeout(r, 0));
  equal("N16 a cancelled Strike keeps the Step: at its target dialog, and at Versatile (asked before the AP, 3.684.7, so nothing is spent or written); a Strike's own spend is marked, so the AP-write hook leaves it",
    [st(atTarget), targetCancelled, atTarget.system.resources.ap.value, st(atPrompt.a), atPrompt.result, atPrompt.a.apWrites.length, write?.o?.trgPrimeNextActionDeferred ?? null, st(hooked), atPrompt.notices],
    [KEPT, null, 2, KEPT, null, 0, true, KEPT, 0]);

  // N17 — a cancelled cast: the spend and the refund it makes.
  const cast = armed(); infos.length = 0;
  await apw.spendActionCost(cast, 2, "Missile Storm");
  const afterSpend = st(cast);
  await apw.refundActionCost(cast, 2);
  const back = [st(cast), cast.flags["trg-prime"].compoundLeg?.apAtArm, cast.flags["trg-prime"].nextActionLapsed ?? null, cast.system.resources.ap.value, infos.filter((m) => /the free Step is back/.test(m)).length];
  const half = armed(); await apw.spendActionCost(half, 2, "Spell"); await apw.refundActionCost(half, 1);
  const stepped = armed(); await apw.spendActionCost(stepped, 1, "Spell"); stepped.flags["trg-prime"].armedMovement = "step"; await apw.refundActionCost(stepped, 1);
  const rspell = armed(); await apw.spendActionCost(rspell, "reaction", "Shield");
  equal("N17 a cast whose targeting is cancelled keeps the Step: its spend removes it, its refund gives it back, armed as before; a part refund, or a Step armed meanwhile, does not; a reaction spell keeps it throughout",
    [afterSpend, ...back, st(half), stepped.flags["trg-prime"].armedMovement, Boolean(stepped.flags["trg-prime"].compoundLeg), st(rspell), rspell.system.resources.reactions.value],
    [GONE, KEPT, 2, null, 2, 1, GONE, "step", false, KEPT, 0]);

  const turn = armed(); await apw.spendActionCost(turn, 1, "Spell");
  const recorded = Boolean(turn.flags["trg-prime"].nextActionLapsed);
  await mw.resetMovementForTurn(turn);
  equal("N18 the removed Step is kept for its refund only until the turn resets", [recorded, turn.flags["trg-prime"].nextActionLapsed ?? null], [true, null]);

  const commits = (src.aw.match(/await commitActionCost\(actor, action, readied, /g) ?? []).length;
  const bare = (src.aw.slice(src.aw.indexOf("export async function resolveAction("), src.aw.indexOf("\n}\n", src.aw.indexOf("export async function resolveAction("))).match(/await spendActionCost\(actor, (?!"reaction")/g) ?? []).length;
  ok("N19 the wiring: resolveAction pays at its commit points through commitActionCost (6) and none bare; arming a movement, Delay, a rage roll, ending Take Cover and the Codex delegates take it; Natural Leaper's actionless jump does not; the Strike defers its spend's lapse, refunds at its three post-spend prompts, takes it at the flat check, and a wasted Strike (Sanctuary) keeps it; a cast's option AP continues its spend; the refund restores",
    commits === 6 && bare === 0
    && /await basicActionTaken\(actor, action, \{ readied \}\);\n\s*await armMovementAction\(actor, action\.key\);/.test(src.aw)
    && /await basicActionTaken\(actor, action, \{ readied \}\);\n\s*await enterDelay\(/.test(src.aw) && /await basicActionTaken\(actor, action, \{ readied \}\);\n\s*await returnFromDelay\(/.test(src.aw)
    && /\} else \{\n\s*\/\/ A RAGE ACTION PAYS ON ITS RESULT[^\n]*\n\s*await basicActionTaken\(actor, action, \{ readied \}\);\n\s*\}/.test(src.aw)
    && /\{ use: "strike", deferNextAction: true \}\);/.test(src.attack)
    && /\n  if \(sanctuary\.blocked\) return null;/.test(src.attack)
    && !/cancelStrike/.test(src.attack)
    && /await strikeTaken\(\);\n\s*return null;\n\s*\}\n\s*\}/.test(src.attack)
    && /if \(activeTakeCover\(actor\)\) \{\n(?:\s*\/\/[^\n]*\n)*\s*await basicActionTaken\(actor, action, \{ readied \}\);\n\s*await endTakeCover\(actor\);/.test(src.aw)
    && /if \(jumpSetup\.automatic\) \{\n\s*if \(!jumpSetup\.freeAction\) \{\n(?:[^\n]*\n){2}\s*await commitActionCost\([^\n]*\n\s*\} else \{\n(?:\s*\/\/[^\n]*\n)*\s*await basicActionTaken\(actor, action, \{ readied \}\);\n\s*\}\n\s*await postCard/.test(src.aw)
    && /\{ continuesSpend: true \}\);/.test(read("module", "magic", "cast-workflow.mjs"))
    && /await actor\.update\(\{ "system\.resources\.ap\.value": restored, \.\.\.grantBack \}, \{ trgPrimeNextActionDeferred: true \}\);\n(?:\s*\/\/[^\n]*\n)*\s*const \{ restoreNextActionLeg \} = await import\("\.\/movement-workflow\.mjs"\);\n\s*await restoreNextActionLeg\(actor\);/.test(src.apw),
    JSON.stringify({ commits, bare }));

  // ── N20–N25 (3.684.6): Graham's answers and the review's findings ──────
  const backNotices = () => infos.filter((m) => /the free Step is back/.test(m)).length;
  // N20 — a refund restores only the Step its own spend removed (review 1).
  const fr = armed(); infos.length = 0;
  await aw.resolveAction(fr, { key: "agileTestFree", name: "Test Free", apCost: "Free", traits: "", description: "d" });
  const frGone = st(fr);
  await apw.spendActionCost(fr, 1, "Spell"); await apw.refundActionCost(fr, 1);
  const fs = armed(); fs.items = [weapon()];
  await atk.rollWeaponAttack(fs, fs.items[0], { skipTargetPrompt: true, apPaid: true });
  infos.length = 0;
  await apw.spendActionCost(fs, 1, "Spell"); await apw.refundActionCost(fs, 1);
  // A feat's own AP write (the hook) removes it; a refund after does not bring it back.
  const fw2 = armed(); fw2.system.resources.ap.value = 1;
  mw.onApWriteLapse(fw2, { "system.resources.ap.value": 1 }, {}, "u1");
  await new Promise((r) => setTimeout(r, 0));
  const fwGone = [st(fw2), fw2.flags["trg-prime"].nextActionLapsed ?? null];
  await apw.refundActionCost(fw2, 1);
  equal("N20 a Step a Free action, a free Strike or a feat's own AP write removed does not come back with a later refund",
    [frGone, st(fr), fr.system.resources.ap.value, fr.flags["trg-prime"].nextActionLapsed ?? null, st(fs), fs.system.resources.ap.value, ...fwGone, st(fw2), backNotices()],
    [GONE, GONE, 2, null, GONE, 2, GONE, null, GONE, 0]);

  // N21 — each spend keeps its own pool; a spend that stands clears it (review 2).
  const twice = armed(); infos.length = 0;
  await apw.spendActionCost(twice, 1, "Spell"); await apw.refundActionCost(twice, 1);
  const once = st(twice);
  await apw.spendActionCost(twice, 1, "Spell"); await apw.refundActionCost(twice, 1);
  const twiceNotices = backNotices();
  const vs = await strike({}, "Versatile P, Finesse");
  infos.length = 0;
  await apw.spendActionCost(vs.a, 1, "Spell"); await apw.refundActionCost(vs.a, 1);
  const vsBack = [st(vs.a), vs.a.system.resources.ap.value, backNotices()];
  const opt = armed();
  await apw.spendActionCost(opt, 1, "Spell"); await apw.spendActionCost(opt, 1, "Spell — Runic Stabiliser", { continuesSpend: true });
  await apw.refundActionCost(opt, 1); const optHalf = st(opt); await apw.refundActionCost(opt, 1);
  const stood = armed(); stood.system.resources.ap.max = 4;
  await apw.spendActionCost(stood, 1, "Spell");
  await stood.update({ "system.resources.ap.value": 2 });
  await apw.spendActionCost(stood, 1, "Spell"); await apw.refundActionCost(stood, 1);
  // A Step armed at 2, the pool raised to 3: a cast's part refund (3 → 1 → 2)
  // is not back to the pool before its spend, though it is the AP at Agile Display.
  const raised = armed(); raised.system.resources.ap.max = 4;
  await raised.update({ "system.resources.ap.value": 3 });
  await apw.spendActionCost(raised, 2, "Spell"); await apw.refundActionCost(raised, 1);
  const raisedPart = st(raised); await apw.refundActionCost(raised, 1);
  // The AP-write hook that follows a cast's spend keeps the saved Step.
  const hookedCast = armed();
  await apw.spendActionCost(hookedCast, 1, "Spell");
  mw.onApWriteLapse(hookedCast, { "system.resources.ap.value": 1 }, {}, "u1");
  await new Promise((r) => setTimeout(r, 0));
  await apw.refundActionCost(hookedCast, 1);
  // A cast that stood, AP granted, then a Strike's (deferred) spend cancelled at Versatile.
  const deferred = armed(); deferred.system.resources.ap.max = 4; deferred.items = [weapon("Versatile P, Finesse")];
  await apw.spendActionCost(deferred, 1, "Spell");
  await deferred.update({ "system.resources.ap.value": 2 });
  await atk.rollWeaponAttack(deferred, deferred.items[0], { skipTargetPrompt: true });
  equal("N21b the pool is the one before the spend, not the one at Agile Display; the AP-write hook after a cast's spend keeps its saved Step; a Strike's own spend clears a saved Step",
    [raisedPart, st(raised), st(hookedCast), st(deferred), deferred.system.resources.ap.value], [GONE, KEPT, KEPT, GONE, 2]);
  equal("N21 two cancelled casts in a row keep the Step each time; a Strike cancelled at Versatile and then a cancelled cast keep it, the AP whole; a cast and its option AP are one spend; a cast that stood, AP granted, then a cancelled cast, does not bring it back",
    [once, st(twice), twiceNotices, vsBack, optHalf, st(opt), opt.system.resources.ap.value, st(stood), stood.system.resources.ap.value, stood.flags["trg-prime"].nextActionLapsed ?? null],
    [KEPT, KEPT, 2, [KEPT, 2, 1], GONE, KEPT, 2, GONE, 2, null]);

  // N22 — a Strike cancelled after its AP gets it back (Graham: "Yes").
  const un = await strike({}, "Unsteady, Finesse");
  const { BASIC_ACTION_STANCE_EFFECTS, FIGHT_DEFENSIVELY_ATTACK_FLAG } = await imp("combat/basic-action-stances.mjs");
  const fd = armed(); fd.items = [weapon("Versatile P, Finesse")];
  fd.effects = [{ name: BASIC_ACTION_STANCE_EFFECTS.fightDefensively.name, disabled: false, getFlag: (sc, k) => k === "stanceExpiresAtTurnStart" }];
  await atk.rollWeaponAttack(fd, fd.items[0], { skipTargetPrompt: true });
  equal("N22 a Strike cancelled at Versatile (N16) or Unsteady keeps the Step and its AP — nothing was spent; a Fight Defensively Strike cancelled has not used its counted Strike",
    [st(un.a), un.result, un.a.system.resources.ap.value, un.notices, st(fd), fd.system.resources.ap.value, fd.flags["trg-prime"][FIGHT_DEFENSIVELY_ATTACK_FLAG] ?? 0],
    [KEPT, null, 2, 0, KEPT, 2, 0]);

  // N23–N24 — Strikes at a target.
  const targetOf = (conds = [], effects = []) => {
    const t = armed(conds); t.effects = effects; t.appliedEffects = effects; t.system.combat = { saves: { will: { total: 0 } } };
    const tok = { id: "t", name: "Orc", actor: t, document: { x: 100, y: 0, width: 1, id: "t" }, center: { x: 150, y: 50 } };
    const set = new Set([tok]); set.first = () => tok;
    return set;
  };
  const ward = { disabled: false, name: "Sanctuary", flags: {}, getFlag: (sc, k) => ({ sanctuaryWard: true, sanctuaryDC: 30 })[k], async setFlag() {} };
  const atTarget2 = async (targets, opts = {}) => {
    const a = armed(); const w = weapon(); a.items = [w]; game.user.targets = targets; infos.length = 0;
    const result = await atk.rollWeaponAttack(a, w, { skipTargetPrompt: true, ...opts });
    game.user.targets = new Set();
    return { a, result, notices: removedNotices() };
  };
  const sanct = await atTarget2(targetOf([], [ward]));
  equal("N23 a Strike wasted by Sanctuary keeps the Step (Graham: \"Yes\"); its AP is spent, as the book says",
    [st(sanct.a), sanct.result, sanct.a.system.resources.ap.value, sanct.notices], [KEPT, null, 1, 0]);
  rollTotal = 20;
  const hid = await atTarget2(targetOf(["hidden"]));
  const hidAoo = await atTarget2(targetOf(["hidden"]), { isReaction: true });
  rollTotal = 10;
  equal("N24 a Strike stopped by the target's miss-chance flat check was made: the Step goes, with its notice; an Attack of Opportunity stopped so keeps it",
    [st(hid.a), hid.result, hid.a.system.resources.ap.value, hid.notices, st(hidAoo.a), hidAoo.notices], [GONE, null, 1, 1, KEPT, 0]);

  // N25 — ending Take Cover is a free action taken (review 4).
  const tc = armed(); tc.effects = [{ id: "tc", name: "Take Cover (Lesser)", disabled: false, getFlag: () => undefined }];
  tc.deleteEmbeddedDocuments = async (_t, ids) => { tc.effects = tc.effects.filter((e) => !ids.includes(e.id)); };
  infos.length = 0;
  await aw.resolveAction(tc, { key: "takeCover", name: "Take Cover", apCost: "1", traits: "" });
  equal("N25 ending Take Cover (a free action) removes the Step, with its notice, and costs nothing",
    [st(tc), tc.effects.length, tc.system.resources.ap.value, removedNotices()], [GONE, 0, 2, 1]);

  // N26 — a refund is not an action (3.684.6 re-review 1): the hook, as Foundry calls it.
  const ward2 = () => { const w = { disabled: false, name: "Sanctuary", flags: {}, deleted: 0, getFlag: (sc, k) => ({ sanctuaryWard: true, sanctuaryDC: 30 })[k], async setFlag() {}, async delete() { w.deleted += 1; } }; return w; };
  {
    const a = armed(); a.hooked = true; const plain = weapon(); const vers = weapon("Versatile P, Finesse"); a.items = [plain, vers];
    game.user.targets = targetOf([], [ward2()]); infos.length = 0;
    await atk.rollWeaponAttack(a, plain, { skipTargetPrompt: true });
    await new Promise((r) => setTimeout(r, 0));
    const afterWasted = [st(a), a.system.resources.ap.value];
    game.user.targets = new Set();
    await atk.rollWeaponAttack(a, vers, { skipTargetPrompt: true });
    await new Promise((r) => setTimeout(r, 0));
    const afterCancel = [st(a), a.system.resources.ap.value];
    await apw.spendActionCost(a, 1, "Spell"); await apw.refundActionCost(a, 1);
    await new Promise((r) => setTimeout(r, 0));
    const c = armed(); c.hooked = true; c.system.resources.ap.value = 1;
    await apw.refundActionCost(c, 1);
    await new Promise((r) => setTimeout(r, 0));
    equal("N26 a refund is not an action: after a Strike Sanctuary wasted (1 AP left, the Step kept), a Strike cancelled at Versatile keeps both, and a cancelled cast's refund gives the Step back; the refund's write is marked",
      [afterWasted, afterCancel, st(a), a.system.resources.ap.value, st(c), c.apWrites.at(-1)?.o?.trgPrimeNextActionDeferred ?? null],
      [[KEPT, 1], [KEPT, 1], KEPT, 1, KEPT, true]);
  }

  // N27–N28 — a cancelled Strike sets nothing off (Graham, 6 November 2026: "Yes").
  {
    const hasted = () => {
      const a = armed([], 4); a.system.resources.ap.max = 3;
      a.flags["trg-prime"].apGrant = { combatId: "c", bonus: 1, entries: [{ value: 1, actions: ["strike"], label: "Haste" }] };
      return a;
    };
    const a = hasted(); const w = weapon("Versatile P, Finesse"); a.items = [w];
    await atk.rollWeaponAttack(a, w, { skipTargetPrompt: true });
    const b = hasted(); const wb = weapon(); b.items = [wb];
    await atk.rollWeaponAttack(b, wb, { skipTargetPrompt: true });
    equal("N27 a hasted Strike cancelled at Versatile keeps its 4 AP and Haste's Strike-only point; a Strike taken spends that point first",
      [a.system.resources.ap.value, a.flags["trg-prime"].apGrant.entries, a.apWrites.length, b.system.resources.ap.value, b.flags["trg-prime"].apGrant.entries],
      [4, [{ value: 1, actions: ["strike"], label: "Haste" }], 0, 3, []]);

    // What a Strike sets off: its trait counts, the attacker's Sanctuary, the
    // target's Fixation, a queued Power Attack, the Crimson Covenant.
    const setOff = async (traits) => {
      const att = armed(); const ww = weapon(traits); att.items = [ww];
      const myWard = ward2(); att.effects = [myWard]; att.appliedEffects = [myWard];
      att.flags["trg-prime"].powerAttackQueued = true;
      att.flags["trg-prime"].crimsonCovenant = { state: "armed" };
      let fixEnded = 0;
      const targets = targetOf();
      const tActor = targets.first().actor;
      tActor.effects = [{ disabled: false, statuses: new Set(["fixated"]), name: "Fixated" }];
      tActor.toggleStatusEffect = async (id) => { if (id === "fixated") fixEnded += 1; };
      game.user.targets = targets; infos.length = 0;
      const result = await atk.rollWeaponAttack(att, ww, { skipTargetPrompt: true });
      game.user.targets = new Set();
      const f = att.flags["trg-prime"];
      return [Boolean(result), att.system.resources.ap.value, f.traitUsage?.actions ?? 0, f.traitUsage?.attack ?? 0, myWard.deleted, fixEnded, f.powerAttackQueued ?? false, f.crimsonCovenant ?? null];
    };
    const cancelled = [await setOff("Versatile P, Finesse"), await setOff("Unsteady, Finesse")];
    const made = await setOff("Finesse");
    equal("N28 a Strike cancelled at Versatile or Unsteady sets off nothing: no AP, no trait count, the attacker's Sanctuary and the target's Fixation stand, Power Attack stays queued, the Crimson Covenant stays armed; a Strike that goes ahead does all of it, as before",
      [...cancelled, made],
      [[false, 2, 0, 0, 0, 0, true, { state: "armed" }], [false, 2, 0, 0, 0, 0, true, { state: "armed" }], [true, 1, 1, 1, 1, 1, false, { state: "live" }]]);
    // AND ORDER: every one of those, and Opportunist, comes after the last question.
    const fnSrc = src.attack.slice(src.attack.indexOf("export async function rollWeaponAttack("));
    const lastAsk = fnSrc.indexOf("versatileDamageType = await promptVersatileDamageType(");
    const after = ["await spendActionPoints(actor, \"1\"", "await recordTraitUsage(actor, strikeTraits);", "await endSanctuaryOnHostileAction(actor);", "await endFixationOnHostileAct([targetActor], actor);",
      "if (powerAttack) await actor.unsetFlag(SYSTEM_ID, \"powerAttackQueued\");", "await actor.setFlag(SYSTEM_ID, CRIMSON_COVENANT_FLAG, { state: \"live\" });",
      "await actor.setFlag(SYSTEM_ID, \"opportunistUsed\", true);", "await endHidingWards(actor, \"weapon\");"].map((x) => fnSrc.indexOf(x));
    ok("N28b the three questions are asked before the Strike spends or sets off anything (AP, traits, Sanctuary, Fixation, Power Attack, Crimson Covenant, Opportunist, Hide From Animals)",
      lastAsk > 0 && after.every((i) => i > lastAsk) && fnSrc.indexOf("unsteadyRested = await promptUnsteadyRested(") < lastAsk && fnSrc.indexOf("subdualShot = await promptSubdualShot(") < lastAsk
      && ["if (unsteadyRested === null) return null;", "if (subdualShot === null) return null;", "if (versatileDamageType === null) return null;"].every((x) => { const i = fnSrc.indexOf(x); return i > 0 && i < after[0]; }),
      JSON.stringify({ lastAsk, after }));
  }

  // N29 — Natural Leaper's jump that needs no action removes the Step (Graham, 6 November 2026: "Yes").
  {
    const leap = (feet) => {
      const a = armed(); a.items = [{ type: "feat", name: "Natural Leaper" }];
      a.system.combat = { movement: { land: { base: 25, total: 25 } } };
      return a;
    };
    DialogV2.wait = async () => ({ feet: 10, strode: true });
    const free = leap(); infos.length = 0;
    await aw.resolveAction(free, { key: "longJump", name: "Long Jump", apCost: "1", traits: "Move", skills: ["athletics"], checkType: "skill" });
    const freeNotices = removedNotices();
    const high = leap(); infos.length = 0;
    await aw.resolveAction(high, { key: "highJump", name: "High Jump", apCost: "1", traits: "Move", skills: ["athletics"], checkType: "skill" });
    DialogV2.wait = async () => null;
    equal("N29 Natural Leaper: a Long Jump within its Speed (no action, no AP) removes the Step, with its notice; a High Jump within reach (the action, no check) removes it and pays",
      [st(free), free.system.resources.ap.value, freeNotices, st(high), high.system.resources.ap.value],
      [GONE, 2, 1, GONE, 1]);
  }

  // N30 — a refund gives back the restricted points its own spend took, and only those (Graham: "Yes").
  {
    const R = await imp("combat/restricted-ap.mjs");
    const H = { value: 1, actions: ["strike"], label: "Haste" }, FA = { value: 1, actions: ["strike"], label: "Fast Attack" };
    equal("N30a restrictedTaken / restrictedGivenBack: what a spend took, entry by entry; given back to its own entry, capped by the pool",
      [R.restrictedTaken([H, FA], [FA]), R.restrictedTaken([H, FA], [H, FA]), R.restrictedTaken([{ ...H, value: 2 }], [H]),
        R.restrictedGivenBack([FA], [H], 4), R.restrictedGivenBack([{ ...H, value: 1 }], [H], 4), R.restrictedGivenBack([], [H, FA], 1)],
      [[H], [], [H], [FA, H], [{ ...H, value: 2 }], [FA]]);
    const hasted = (entries) => {
      const a = armed([], 4); a.system.resources.ap.max = 3;
      a.flags["trg-prime"].apGrant = { combatId: "c", bonus: 1, entries };
      return a;
    };
    // A spell cast beyond the general points ("Proceed anyway") takes Haste's point; its refund gives it back Strike-only.
    const over = hasted([H]);
    const receipt = await apw.spendActionCost(over, 4, "Spell");
    const overSpent = [over.system.resources.ap.value, over.flags["trg-prime"].apGrant.entries];
    await apw.refundActionCost(over, 4, { receipt });
    // Only what it took: a 1-AP spell (general points) cancelled after a Strike spent Haste's point does not bring Haste's point back.
    const only = hasted([H]); only.items = [weapon()];
    const r1 = await apw.spendActionCost(only, 1, "Spell");
    await atk.rollWeaponAttack(only, only.items[0], { skipTargetPrompt: true });
    await apw.refundActionCost(only, 1, { receipt: r1 });
    // No receipt: general AP, as before.
    const bare = hasted([H]); await apw.spendActionCost(bare, 4, "Spell"); await apw.refundActionCost(bare, 4);
    equal("N30b a cancelled spell gives back the Strike-only point it took, as Strike-only; only the points its own spend took (not a Strike's spent since); without a receipt, general AP",
      [overSpent, over.system.resources.ap.value, over.flags["trg-prime"].apGrant.entries, r1?.restricted, only.system.resources.ap.value, only.flags["trg-prime"].apGrant.entries, bare.system.resources.ap.value, bare.flags["trg-prime"].apGrant.entries],
      [[0, []], 4, [H], [], 3, [], 4, []]);
    const castSrc = read("module", "magic", "cast-workflow.mjs");
    ok("N30c the cast keeps its receipts and hands them to its refunds",
      /const castReceipt = apPaid \? null : await spendActionCost\(actor, totalCastAP, spell\.name\);/.test(castSrc)
      && /optionReceipt = await spendActionCost\(actor, castAPOwed\.option, /.test(castSrc)
      && /if \(totalCastAP > 0\) await refundActionCost\(actor, totalCastAP, \{ receipt: castReceipt \}\);/.test(castSrc)
      && /await refundActionCost\(actor, castAPOwed\.option, \{ receipt: optionReceipt \}\);/.test(castSrc));
  }
}

if (failures.length) {
  process.stdout.write(`verify-agile-display: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-agile-display: OK — ${checks} checks.\n`);
