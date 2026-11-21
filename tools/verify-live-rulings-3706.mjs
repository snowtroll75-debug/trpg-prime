#!/usr/bin/env node
/**
 * verify-live-rulings-3706 — core 3.706.0: Graham's answers of 21 November
 * 2026 to the questions the player-perspective live test of 3.705.1 raised,
 * and the defect found reproducing the second of them.
 *
 *   A  1. "Free hand": a Trip against an adjacent foe is not made with the
 *      Whip ("Can't be used against adjacent creatures").
 *   B  2. "Yes": Combat Grapple applies Grabbed, with its clock and who holds
 *      it, not only says so.
 *   C  Found reproducing B live: a player's Grapple on the GM's creature laid
 *      Grabbed, then threw "lacks permission to update ActiveEffect" stamping
 *      its clock, and lost its outcome card. The clock, the conditionals and
 *      who laid it now go through the GM's client.
 *   D  3. "Yes": a Strike feat whose Strike is refused costs no AP: it pays
 *      at the Strike (`commitCost`), and Quick Draw puts its weapon back.
 *   E  5. "Please automate": Lunging Stance's Attacks of Opportunity
 *      threaten as far as a Lunge reaches.
 *   F  5. "players should not be able to read this card": reaction offers
 *      are read only by the GM and the reactors' players, and created by the
 *      GM's client when the author would not be one of them.
 *
 *   R  each reproduced against the 3.705.2 shape
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

// The workflow modules read these at load; nothing here calls Foundry.
globalThis.foundry ??= { applications: { api: { DialogV2: class {} } }, utils: {} };
globalThis.game ??= { settings: { get: () => null } };
globalThis.CONFIG ??= {};
globalThis.Hooks ??= { on() {}, once() {} };

function block(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? "" : src.slice(i, j);
}

const at = await mod("combat", "attack.mjs");
const af = await mod("combat", "action-feats.mjs");
const afw = await mod("combat", "action-feats-workflow.mjs");
const bac = await mod("combat", "basic-action-conditions.mjs");
const rel = await mod("combat", "target-relay.mjs");
const opp = await mod("combat", "opportunity.mjs");
const oc = await mod("combat", "offer-card.mjs");
// Named, so the uncalled-export check sees the harness reach them.
const { paysAtStrike } = afw;
const { relayConditionsNeeded } = bac;
const { offerCreatedHere, offerRecipients } = oc;
const { opportunityReachOf } = opp;
const { INFLICTED_BY_KINDS, OFFER_CARD_FLAGS, relayableConditionEffects, relayableOfferCard } = rel;

const AW = read("module", "combat", "action-workflow.mjs");
const AWK = read("module", "combat", "attack-workflow.mjs");
const AFW = read("module", "combat", "action-feats-workflow.mjs");
const OPP = read("module", "combat", "opportunity.mjs");
const BAC = read("module", "combat", "basic-action-conditions.mjs");
const TRW = read("module", "combat", "target-relay-workflow.mjs");

const weapon = (name, system = {}) => ({ type: "weapon", name, system: { equipped: true, attackMode: "melee", ...system } });
const whip = weapon("Whip", { traits: "Clumsy, Disarm, Exotic, Finesse, Reach, Trip, Versatile S", reachFeet: 15, noAdjacent: true });
const sword = weapon("Broadsword", { traits: "Versatile P" });
const flail = weapon("Flail", { traits: "Disarm, Sweep, Trip" });
const player = { id: "P", isGM: false };
const gm = { id: "G", isGM: true };
const npc = { isOwner: false, name: "ZZ Foe" };
const pc = { isOwner: true, name: "ZZ PC" };

/* R — as it was ----------------------------------------------------------- */
{
  ok("R1 the trip weapon's own choice, asked without the distance, is still the Whip", at.maneuverWeapon([sword, whip], "trip")?.name === "Whip");
  ok("R2 a player's grab on the GM's creature has a clock to stamp that the player may not write",
    relayConditionsNeeded([{ target: "target", conditionKey: "grabbed", active: true }], npc, player) === true);
  ok("R3 Vital Strike is a Strike feat, and used to pay before its Strike", paysAtStrike("vital strike") === true);
  ok("R4 an offer raised by a player's attack, for the GM only, was the player's to read", offerCreatedHere(player, ["G"]) === false);
  equal("R5 the Lunging Stance threatened no further than its reach", af.lungingStanceThreatExtension(0, { stance: false, wieldingMelee: true }), 0);
}

/* A — the Whip, adjacent --------------------------------------------------- */
{
  ok("A1 adjacent: the Whip is passed over; with nothing else, the Trip is unarmed", at.maneuverWeapon([sword, whip], "trip", { adjacent: true }) === null);
  equal("A2 adjacent: another Trip weapon held is used", at.maneuverWeapon([whip, flail], "trip", { adjacent: true })?.name, "Flail");
  equal("A3 not adjacent: the Whip", at.maneuverWeapon([sword, whip], "trip", { adjacent: false })?.name, "Whip");
  equal("A4 a weapon that may strike adjacent is used adjacent", at.maneuverWeapon([flail], "trip", { adjacent: true })?.name, "Flail");
  ok("A5 the check is built with the target's adjacency", /const weapon = maneuverWeapon\(Array\.from\(actor\.items \?\? \[\]\), maneuverTrait, \{ adjacent \}\);/.test(AW)
    && /const config = checkConfiguration\(actor, action, invokedSkillKey, targetActor, \{ targetAdjacent: targetAdjacent\(actor\) \}\);/.test(AW));
  const adj = block(AW, "function targetAdjacent(actor) {", "\n}\n");
  ok("A6 adjacent is 5 ft or less between the tokens, with positional automation on", /return feet !== null && feet !== undefined && Number\(feet\) <= 5;/.test(adj)
    && /if \(!positional\) return false;/.test(adj) && /const target = firstTargetToken\(\);/.test(adj));
}

/* B — Combat Grapple grabs ------------------------------------------------- */
{
  // 3.706.1: two rounds on, as a Grapple Attack's (verify-live-fixes-3706-1).
  equal("B1 a hit in an encounter: grabbed to the end of the grappler's next turn", af.combatGrappleGrab({ hits: true, inCombat: true, round: 3 }), { grab: true, expiresRound: 5 });
  equal("B2 a hit out of one: grabbed, no clock", af.combatGrappleGrab({ hits: true, inCombat: false, round: 3 }), { grab: true, expiresRound: null });
  equal("B3 a miss: nothing", af.combatGrappleGrab({ hits: false, inCombat: true, round: 3 }), { grab: false, expiresRound: null });
  const cg = block(AFW, '  async "combat grapple"(', '\n  },\n');
  ok("B4 the hit lays Grabbed on the creature struck, with the clock", /const target = check\?\.strikeTarget \?\? null;/.test(cg)
    && /await applyBasicActionConditionEffects\(\[\{ target: "target", conditionKey: "grabbed", active: true \}\], actor, target,\s*\{ expiresRound: grab\.expiresRound \}\);/.test(cg));
  ok("B5 and records who holds it, and the card says what happened", /if \(grabbed\) await recordInflictedBy\(target, actor, "grabbedBy"\);/.test(cg)
    && /could not be Grabbed/.test(cg) && /grabbed = Boolean\(target\.hasCondition\?\.\("grabbed"\)\);/.test(cg));
  ok("B6 the Strike's result names the creature it was against", /if \(check && typeof check === "object"\) check\.strikeTarget = targetActor \?\? null;\n  return check;\n\}/.test(AWK));
}

/* C — a condition's clock and who laid it, through the GM ------------------- */
{
  const grab = [{ target: "target", conditionKey: "grabbed", active: true }];
  ok("C1 a player, the GM's creature: relayed", relayConditionsNeeded(grab, npc, player) === true);
  ok("C2 the GM's own client, the player's own creature, no user: direct",
    relayConditionsNeeded(grab, npc, gm) === false && relayConditionsNeeded(grab, pc, player) === false && relayConditionsNeeded(grab, npc, null) === false);
  ok("C3 only the actor's own conditions: direct", relayConditionsNeeded([{ target: "self", conditionKey: "prone", active: true }], npc, player) === false);
  equal("C4 the relayed list: the target's only, plain data, conditionals kept",
    relayableConditionEffects([
      { target: "self", conditionKey: "prone", active: true },
      { target: "target", conditionKey: "grabbed", active: true, conditionals: [{ kind: "modifier", value: -4 }] },
      { target: "target", conditionKey: "frightened", active: true, value: "2" },
      { target: "target", conditionKey: "", active: true }
    ]),
    [{ target: "target", conditionKey: "grabbed", active: true, conditionals: [{ kind: "modifier", value: -4 }] },
      { target: "target", conditionKey: "frightened", active: true, value: 2 }]);
  equal("C5 the records: grabbed-by and flat-footed-from, as the action writes them",
    [rel.inflictedByRecord("grabbedBy", { uuid: "Actor.A", name: "A" }, { round: 2 }),
      rel.inflictedByRecord("flatFootedFrom", { uuid: "Actor.A", name: "A" }, { action: "feint", round: 2 }),
      rel.inflictedByRecord("hp", { uuid: "Actor.A", name: "A" })],
    [{ uuid: "Actor.A", name: "A", round: 2 }, { uuid: "Actor.A", name: "A", action: "feint", round: 2 }, null]);

  // The GM's side, driven.
  const laid = [];
  const flagged = [];
  const creature = { uuid: "Scene.s.Token.t.Actor.f", name: "ZZ Foe", hasCondition: (k) => k === "grabbed" };
  const grappler = { uuid: "Actor.A", name: "ZZ PC" };
  const deps = {
    fromUuid: async (u) => (u === creature.uuid ? creature : u === grappler.uuid ? grappler : null),
    userOwns: (doc, userId) => doc === grappler && userId === "P",
    applyConditionEffects: async (actor, target, effects, opts) => { laid.push({ actor: actor.name, target: target.name, effects, opts }); },
    setInflictedBy: async (target, kind, record) => { flagged.push({ kind, record }); },
    currentRound: () => 5
  };
  const req = (action, payload, userId = "P") => ({ action, uuid: creature.uuid, userId, requestId: "r", payload });
  const r1 = await rel.performRelay(req(rel.RELAY_ACTIONS.CONDITION_EFFECTS, { actorUuid: "Actor.A", effects: grab, expiresRound: 6, actionKey: "grappleAttack" }), deps);
  ok("C6 the GM's client lays them, with their clock", r1.ok === true && laid[0]?.target === "ZZ Foe" && laid[0]?.opts?.expiresRound === 6 && laid[0]?.opts?.actionKey === "grappleAttack");
  const r2 = await rel.performRelay(req(rel.RELAY_ACTIONS.CONDITION_EFFECTS, { actorUuid: "Actor.A", effects: grab }, "X"), deps);
  ok("C7 …only for the asker's own creature", r2.ok === false && laid.length === 1);
  const r3 = await rel.performRelay(req(rel.RELAY_ACTIONS.INFLICTED_BY, { kind: "grabbedBy", actorUuid: "Actor.A" }), deps);
  equal("C8 who holds it, built by the GM's client from the asker's creature", [r3.ok, flagged[0]], [true, { kind: "grabbedBy", record: { uuid: "Actor.A", name: "ZZ PC", round: 5 } }]);
  const r4 = await rel.performRelay(req(rel.RELAY_ACTIONS.INFLICTED_BY, { kind: "flatFootedFrom", actorUuid: "Actor.A" }), deps);
  const r5 = await rel.performRelay(req(rel.RELAY_ACTIONS.INFLICTED_BY, { kind: "hp", actorUuid: "Actor.A" }), deps);
  ok("C9 …only while the condition stands, and only the two records", r4.ok === false && r5.ok === false && flagged.length === 1
    && JSON.stringify(INFLICTED_BY_KINDS) === JSON.stringify({ grabbedBy: "grabbed", flatFootedFrom: "flatFooted" }));

  // Direct, on the GM's client or the owner's.
  const written = [];
  const own = { isOwner: true, hasCondition: (k) => k === "grabbed", setFlag: async (s, k, v) => { written.push([s, k, v]); } };
  const savedGame = globalThis.game;
  globalThis.game = { ...savedGame, user: player, combat: { round: 7 } };
  try {
    const wrote = await bac.recordInflictedBy(own, grappler, "grabbedBy");
    equal("C10 written directly where this client may", [wrote, written[0]], [true, ["trg-prime", "grabbedBy", { uuid: "Actor.A", name: "ZZ PC", round: 7 }]]);
    const none = await bac.recordInflictedBy({ ...own, hasCondition: () => false }, grappler, "grabbedBy");
    ok("C11 not while the condition is absent", none === false && written.length === 1);
  } finally { globalThis.game = savedGame; }

  const apply = block(BAC, "export async function applyBasicActionConditionEffects(", "\n}\n");
  ok("C12 the target's share is relayed, and not laid again here", /const relayed = !direct && targetActor && relayConditionsNeeded\(effects, targetActor, globalThis\.game\?\.user\);/.test(apply)
    && /if \(relayed && effect\.target === "target"\) continue;/.test(apply) && /\{ expiresRound, actionKey \}, \(\) => false\);/.test(apply));
  ok("C13 the GM's client lays them directly", /return applyBasicActionConditionEffects\(effects, actor, target, \{ \.\.\.opts, direct: true \}\);/.test(TRW));
  ok("C14 the Grapple, the Feint and both Grab strikes record through it",
    /await recordInflictedBy\(targetActor, actor, "grabbedBy"\);/.test(AW) && /await recordInflictedBy\(targetActor, actor, "flatFootedFrom", \{ action: action\.key \}\);/.test(AW)
    && (AWK.match(/await recordInflictedBy\(targetActor, actor, "grabbedBy"\);/g) ?? []).length === 2
    && !/setFlag\(SYSTEM_ID, "grabbedBy"/.test(AW) && !/setFlag\(SYSTEM_ID, "grabbedBy"/.test(AWK));
}

/* D — a Strike feat pays at its Strike -------------------------------------- */
{
  // Every handler that is a Strike (it calls strikePlan) pays there; Lunge
  // already did, through its Strike's own AP.
  const run = AFW.slice(AFW.indexOf("const RUN = {"), AFW.indexOf("\n};\n", AFW.indexOf("const RUN = {")));
  const parts = run.split(/\n  async ("?[a-z ]+"?)\(/);
  const striking = [];
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].replace(/"/g, "");
    if (/strikePlan\(/.test(parts[i + 1]) && key !== "lunge") striking.push(key);
  }
  equal("D1 the Strike feats are the handlers that strike", striking.sort(), Object.keys(af.ACTION_FEATS).filter((k) => paysAtStrike(k)).sort());
  ok("D2 not Skirmish, Striding Charge, Void Step or Lunge", ["skirmish", "striding charge", "void step", "lunge", "knife flurry"].every((k) => paysAtStrike(k) === false));
  const rf = block(AFW, "export async function runActionFeat(actor, item) {", "\n}\n");
  ok("D3 nothing spent up front for them, drawn or chosen",
    (rf.match(/if \(!paysAtStrike\(state\.key\)\) await spendActionCost\(actor, entry\.apCost, entry\.label, \{ traits: entry\.traits \}\);/g) ?? []).length === 2
    && !/\n\s+await spendActionCost\(/.test(rf));
  const sp = block(AFW, "export async function strikePlan(", "\n}\n");
  ok("D4 the Strike pays once, at the first made", /const deferred = paysAtStrike\(featKey\);/.test(sp) && /if \(paid\) return;\n\s+paid = true;\n\s+await spendActionCost\(actor, entry\.apCost, entry\.label, \{ traits: entry\.traits \}\);/.test(sp)
    && /\n\s+commitCost,\s+\/\/ a Strike feat's AP/.test(sp) && /unpaid: deferred && !paid/.test(sp));
  const rwa = AWK.slice(AWK.indexOf("export async function rollWeaponAttack("));
  const commitAt = rwa.indexOf("if (typeof commitCost === \"function\") await commitCost();");
  ok("D5 the attack workflow pays it after every refusal, where a Strike's own AP is spent",
    commitAt > rwa.indexOf("if (reach.outOfReach) {") && commitAt > rwa.indexOf("if (sanctuary.blocked && !sanctuary.wastesAction) return null;")
    && commitAt > rwa.indexOf("await spendActionPoints(actor, \"1\", `${weapon.name} — Strike`") && commitAt < rwa.indexOf("await recordTraitUsage(actor, strikeTraits);"));
  const unpaid = afw.refusedLine(Object.assign([null], { resolved: 0, refused: 1, unpaid: true }));
  const paid = afw.refusedLine(Object.assign([null], { resolved: 0, refused: 1, unpaid: false }));
  ok("D6 the card says no AP was spent, only when none was", /No AP was spent\./.test(unpaid) && !/No AP was spent/.test(paid) && /No Strike was made/.test(paid));
  equal("D7 Quick Draw's weapon goes back as it was", af.quickDrawRestore({ equipped: false, stowed: true, twoHandedGrip: true }),
    { "system.equipped": false, "system.stowed": true, "system.twoHandedGrip": true });
}

/* E — Lunging Stance's Attacks of Opportunity ------------------------------ */
{
  const T = (stance, wieldingMelee, ext = 0) => af.lungingStanceThreatExtension(ext, { stance, wieldingMelee });
  equal("E1 in the stance with a melee weapon: 5 ft further; a glaive's reach is the Lunge's; a whip's is longer",
    [T(true, true, 0), T(true, true, 5), T(true, true, 10)], [5, 5, 10]);
  equal("E2 out of the stance, or with no melee weapon: as before", [T(false, true, 0), T(true, false, 0), T(false, true, 10)], [0, 0, 10]);
  const tok = (items, effects) => ({ actor: { system: { combat: { reach: 5 } }, items, effects } });
  const stance = [{ name: "Lunging Stance", disabled: false, flags: { "trg-prime": { featStance: true, lungePenaltiesNegated: true } } }];
  equal("E3 a token threatens 10 ft in the stance, 5 out of it; a whip still 15",
    [opportunityReachOf(tok([sword], stance)), opportunityReachOf(tok([sword], [])), opportunityReachOf(tok([whip], stance)),
      opportunityReachOf(tok([sword], [{ ...stance[0], disabled: true }]))], [10, 5, 15, 5]);
  ok("E4 a Strike's and a Charge's reach do not take it", opp.reachOf(tok([sword], stance)) === 5);
  ok("E5 both provoking measurements read it", /const reach = opportunityReachOf\(enemy\);/.test(OPP) && /if \(feet === null \|\| feet > opportunityReachOf\(enemy\)\) continue;/.test(OPP)
    && !/reachOf\(enemy\)/.test(OPP.replace(/opportunityReachOf\(enemy\)/g, "")));
  ok("E6 the stance's card says so", /Attacks of Opportunity: you threaten 5 ft further \(as far as a Lunge reaches\) — automatic\./.test(read("module", "feats-workflow.mjs")));
}

/* F — offers, read only by those who may take them -------------------------- */
{
  const owner = { id: "O", isGM: false };
  const other = { id: "X", isGM: false };
  const reactor = { testUserPermission: (u, level) => level === "OWNER" && u.id === "O" };
  equal("F1 the readers: every GM, and the reactors' own players", offerRecipients([gm, owner, other, { id: "G2", isGM: true }], [reactor]), ["G", "O", "G2"]);
  equal("F2 no reactor given: the GMs alone", offerRecipients([gm, owner, other], []), ["G"]);
  equal("F3 created here by a GM or a reader; by the GM's client otherwise; here with no user",
    [offerCreatedHere(gm, ["G"]), offerCreatedHere(owner, ["G", "O"]), offerCreatedHere(other, ["G", "O"]), offerCreatedHere(null, ["G"])], [true, true, false, true]);
  const data = relayableOfferCard({ content: "<div>x</div>", speaker: { actor: "a1", alias: "Foe", scene: null, junk: { a: 1 } }, whisper: ["G", "Z", "G"],
    flags: { "trg-prime": { reactionFeatCard: { used: [] }, somethingElse: 1 }, core: { x: 1 } } }, ["G", "O"]);
  equal("F4 the GM's client creates plain data: known readers, our offer flags only", data,
    { content: "<div>x</div>", speaker: { actor: "a1", alias: "Foe" }, whisper: ["G"], flags: { "trg-prime": { reactionFeatCard: { used: [] } } } });
  ok("F5 an offer to nobody, or with no content, is not created", relayableOfferCard({ content: "x", whisper: ["Z"] }, ["G"]) === null && relayableOfferCard({ whisper: ["G"] }, ["G"]) === null);
  const made = [];
  const r = await rel.performRelay({ action: rel.RELAY_ACTIONS.OFFER_CARD, uuid: "Actor.F", userId: "P", requestId: "r",
    payload: { content: "<div>x</div>", speaker: {}, whisper: ["G"], flags: {} } },
  { fromUuid: async () => ({ uuid: "Actor.F" }), knownUserIds: () => ["G"], createOfferCard: async (d) => { made.push(d); return { id: "m1" }; } });
  equal("F6 the GM's client creates it", [r.ok, r.result, made[0]?.whisper], [true, "m1", ["G"]]);
  // Each offer's own flag is one the GM's client keeps.
  const flagOf = (file, name) => (read(...file).match(new RegExp(`const ${name} = "([A-Za-z]+)";`)) ?? [])[1];
  const ownFlags = [flagOf(["module", "combat", "reaction-feats-workflow.mjs"], "CARD_FLAG"), flagOf(["module", "combat", "opportunity.mjs"], "AOO_FLAG"),
    "reactiveDisarm", flagOf(["module", "creature-reactions-workflow.mjs"], "FLAG"), flagOf(["module", "combat", "action-feat-detection.mjs"], "CARD_FLAG"),
    flagOf(["module", "combat", "swift-pursuit.mjs"], "PURSUIT_FLAG")];
  equal("F7 every offer's flag is kept", ownFlags.filter((f) => !OFFER_CARD_FLAGS.includes(f)), []);
  ok("F8 …and they are all found", ownFlags.every(Boolean) && ownFlags.length === OFFER_CARD_FLAGS.length);
  // Every offer posts through it, to the right readers.
  const sites = [
    ["reaction feats (GM only)", read("module", "combat", "reaction-feats-workflow.mjs"), "export async function offerReactionFeats(", "\n}\n", /\}, \{ anchor: candidates\.find\(/],
    ["Attacks of Opportunity", OPP, "async function offerAttacksOfOpportunity(", "\n}\n", /\}, \{ reactors: reactors\.map\(\(\{ actor \}\) => actor\)\.filter\(Boolean\), anchor: provokerToken\?\.actor \?\? null \}\);/],
    ["a creature's reaction move", read("module", "creature-reactions-workflow.mjs"), "async function offerCard(", "\n}\n", /\}, \{ reactors: \[actor\] \}\);/],
    ["Knife Flurry (the GM and the wielder's players)", read("module", "combat", "action-feat-detection.mjs"), "export async function offerKnifeFlurry(", "\n}\n", /\}, \{ reactors: \[actor\] \}\);/],
    ["Reactive Disarm", read("module", "combat", "reactive-disarm-workflow.mjs"), "export async function offerReactiveDisarm(", "\n}\n", /\}, \{ reactors: \[defender\] \}\);/],
    ["Swift Pursuit", read("module", "combat", "swift-pursuit.mjs"), "async function offerSwiftPursuit(", "\n}\n", /\}, \{ reactors: reactors\.map\(\(\{ ranger \}\) => ranger\)\.filter\(Boolean\), anchor: moverToken\?\.actor \?\? null \}\);/],
    ["Savage Jaw", AWK, "const jaw = noReactions ? null :", "\n    }\n  }\n", /\}, \{ reactors: \[targetActor\] \}\);/]
  ];
  for (const [name, src, start, end, readers] of sites) {
    const body = block(src, start, end);
    ok(`F9 ${name}: posted through postOfferCard, to its readers`, body.length > 0 && /postOfferCard\(\{/.test(body) && !/ChatMessage\.create\(/.test(body) && readers.test(body), body.slice(0, 80));
  }
  const post = block(read("module", "combat", "offer-card.mjs"), "export async function postOfferCard(", "\n}\n");
  ok("F10 created here only for a reader; otherwise by the GM's client, not waited on",
    /if \(offerCreatedHere\(globalThis\.game\?\.user, whisper\)\) return ChatMessage\.create\(\{ \.\.\.data, whisper \}\);/.test(post)
    && /void relayOfferCard\(doc, \{ content: data\.content, speaker: data\.speaker \?\? \{\}, whisper, flags: data\.flags \?\? \{\} \}\);/.test(post));
  ok("F11 the GM's client creates the card it is sent", /createOfferCard: \(data\) => ChatMessage\.create\(data\),/.test(TRW) && /knownUserIds: \(\) => Array\.from\(game\.users \?\? \[\]\)\.map\(\(u\) => u\.id\),/.test(TRW));
}

const EXPECTED = 62;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-live-rulings-3706: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-live-rulings-3706: OK — ${checks} checks`);
