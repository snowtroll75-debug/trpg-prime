#!/usr/bin/env node
/**
 * verify-party-sheet-stage3 — TRG Prime 3.710.0, Party Sheet V2 Stage 3
 * (the Party Actions: Rest, Travel, Begin Session, Award XP).
 *
 * The world it drives: Party A with six members, Party B with four
 * different members, unassigned actors, and one actor on both rosters.
 *
 *   P  Participants: a party's actions reach its own members, each once;
 *      not Party B's, not the unassigned; missing and ineligible named.
 *   R  Rest: the existing dialog, given the party's members, lists them and
 *      nobody else; with no argument it is the old dialog exactly; an actor
 *      twice in the entries rests once.
 *   T  Travel: the existing dialog and card, the party's members only, the
 *      slowest of THEM setting the pace; the scene control's old call.
 *   X  Award XP: the preview the GM confirms is the split written; NPC
 *      shares counted and not written; a player refused.
 *   O  One at a time: a second press while running does nothing.
 *   B  Toolbar: the actions, Group Check reserved and not drawn.
 *   S  The sheet's wiring.
 *   Z  The version.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

/* ------------------------------------------------------------ the fake world */
const dialogs = [];
let answer = "cancel";
const chat = [];
globalThis.foundry = { applications: { api: { DialogV2: { wait: async (o) => { dialogs.push(o); return typeof answer === "function" ? answer(o) : answer; } } }, ux: {} }, utils: {} };
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
globalThis.ChatMessage = { create: async (d) => { chat.push(d); return d; }, getSpeaker: () => ({}) };
globalThis.Hooks = { on() {}, once() {}, callAll() {}, call() { return true; } };
globalThis.CONFIG = {};

const actor = (id, type = "character", speed = 30, extra = {}) => ({
  id, uuid: `Actor.${id}`, name: id, type, documentName: "Actor", hasPlayerOwner: true, isOwner: true,
  system: { identity: { level: 2, xp: { value: 1000 } }, combat: { movement: { land: { total: speed } } } },
  updates: [], async update(c) { this.updates.push(c); for (const [k, v] of Object.entries(c)) { const parts = k.split("."); let at = this; for (const p of parts.slice(0, -1)) at = at[p] ??= {}; at[parts.at(-1)] = v; } return this; },
  ...extra
});
const A = ["a1", "a2", "a3", "a4", "a5", "shared"].map((id, i) => actor(id, i === 2 ? "npc" : "character", id === "a4" ? 20 : 30));
const B = ["b1", "b2", "b3"].map((id) => actor(id, "character", 15)); // B is slower than anyone in A
const shared = A[5];
const unassigned = [actor("u1", "character", 5), actor("u2", "character", 30)];
const world = new Map([...A, ...B, ...unassigned].map((a) => [a.uuid, a]));
globalThis.game = { actors: [...world.values()], user: { id: "gm", isGM: true }, settings: { get: () => true } };
globalThis.canvas = { tokens: { controlled: [] } };
globalThis.fromUuidSync = (u) => world.get(u) ?? null;
globalThis.fromUuid = async (u) => world.get(u) ?? null;

const PA = await imp("party-actions.mjs");
const PM = await imp("party-members.mjs");
const RW = await imp("rest/rest-workflow.mjs");
const TD = await imp("travel-dialog.mjs");
const PRW = await imp("party-rewards-workflow.mjs");

const partyA = { uuid: "Actor.PA", name: "Party A", system: { members: [...A.map((a) => a.uuid), "Actor.a1", "Actor.GONE"] } };
const partyB = { uuid: "Actor.PB", name: "Party B", system: { members: [...B.map((a) => a.uuid), shared.uuid] } };
const rosterA = await PM.resolvePartyRoster(partyA);
const rosterB = await PM.resolvePartyRoster(partyB);
const partA = PA.partyParticipants(rosterA);
const partB = PA.partyParticipants(rosterB);

/* ------------------------------------------------------------ P. participants */
{
  equal("P1 Party A's participants are its six members, in roster order", partA.actors.map((a) => a.id), ["a1", "a2", "a3", "a4", "a5", "shared"]);
  equal("P2 Party B's are its four", partB.actors.map((a) => a.id), ["b1", "b2", "b3", "shared"]);
  ok("P3 nobody from Party B, and nobody unassigned, is in Party A", !partA.actors.some((a) => a.id.startsWith("b") || a.id.startsWith("u")));
  ok("P4 the shared actor is in both, once each", partA.actors.filter((a) => a === shared).length === 1 && partB.actors.filter((a) => a === shared).length === 1);
  equal("P5 a deleted roster entry is left out and named", partA.excluded.map((e) => e.reason), ["no longer exists"]);
  const comp = actor("pet", "companion");
  world.set(comp.uuid, comp);
  const withPet = PA.partyParticipants(await PM.resolvePartyRoster({ system: { members: ["Actor.a1", "Actor.pet"] } }));
  ok("P6 a companion on the roster cannot take part, and says why", withPet.actors.length === 1 && /companion cannot take part/.test(withPet.excluded[0]?.reason ?? ""));
  const twice = PA.partyParticipants([{ uuid: "Actor.a1", actor: A[0], status: "ok" }, { uuid: "x", actor: A[0], status: "ok" }]);
  equal("P7 the same actor twice (two entries, one actor) takes part once", twice.actors.length, 1);
  const note = PA.partyScopeNote("Party A", "Resting", partA);
  ok("P8 the dialog says whose party, how many, that no one else is included, and who is left out",
    /Resting the 6 members of Party A\. No one outside the party is included\. Not included: Actor\.GONE \(no longer exists\)\./.test(note), note);
}

/* ------------------------------------------------------------ R. rest */
{
  dialogs.length = 0; answer = "cancel";
  await RW.openRestDialog({ candidates: { actors: partA.actors, scopeNote: PA.partyScopeNote("Party A", "Resting", partA) } });
  const html = dialogs[0]?.content ?? "";
  const listed = [...html.matchAll(/name="include-\d+" checked> ([^<]+)</g)].map((m) => m[1].trim());
  equal("R1 Party A's Rest lists its six members, and only them", listed, ["a1", "a2", "a3", "a4", "a5", "shared"]);
  ok("R2 ...with the party's note above the list", html.includes("Resting the 6 members of Party A"));
  dialogs.length = 0;
  await RW.openRestDialog();
  const old = [...(dialogs[0]?.content ?? "").matchAll(/name="include-\d+" checked> ([^<]+)</g)].map((m) => m[1].trim());
  equal("R3 the macro's Rest, unchanged: every player-owned character in the world", old.length, [...A, ...B, ...unassigned].filter((a) => a.type === "character").length);
  ok("R4 ...with its own note", (dialogs[0]?.content ?? "").includes("Resting every player-owned character"));
  // Choosing in the dialog: rows keyed by position; the second row unticked.
  dialogs.length = 0;
  let captured = null;
  answer = () => ({ hours: 8, safeEnvironment: true, "include-0": true, "include-1": false, "include-2": true, "activity-0": "sleeping", "activity-2": "resting", "ate-0": true, "drank-0": true });
  const restSrc = strip(read("module", "rest", "rest-workflow.mjs"));
  ok("R5 the dialog's rows are keyed by position (an unlinked token's actor shares its base actor's id)",
    /name="include-\$\{i\}" checked/.test(restSrc) && /\.filter\(\(\{ i \}\) => result\[`include-\$\{i\}`\]\)/.test(restSrc));
  ok("R6 everything after the participant list is the existing workflow", /return performRest\(entries, \{\s*hours: Number\(result\.hours \?\? 1\),\s*safeEnvironment: Boolean\(result\.safeEnvironment\)\s*\}\);/.test(restSrc));
  ok("R7 an actor twice in the entries rests once", /const seen = new Set\(\);\s*for \(const entry of entries\) \{\s*const key = entry\?\.actor\?\.uuid \?\? entry\?\.actor\?\.id;\s*if \(!key \|\| seen\.has\(key\)\) continue;\s*seen\.add\(key\);/.test(restSrc));
  ok("R8 with no argument it is restCandidates(), as the macro and API expect", /const \{ actors, scopeNote \} = candidates \?\? restCandidates\(\);/.test(restSrc));
  void captured;
  answer = "cancel";
}

/* ------------------------------------------------------------ T. travel */
{
  dialogs.length = 0; chat.length = 0;
  answer = (o) => Object.fromEntries([["terrain", "normal"], ["miles", 24], ...partA.actors.map((_, i) => [`include-${i}`, true])]);
  await TD.openTravelDialog({ candidates: { actors: partA.actors, scopeNote: PA.partyScopeNote("Party A", "Travelling with", partA) } });
  const html = dialogs[0]?.content ?? "";
  const rows = [...html.matchAll(/name="include-\d+" checked> ([^<]+)<\/label><\/td>\s*<td style="text-align:right">(\d+)</g)].map((m) => [m[1].trim(), Number(m[2])]);
  equal("T1 Party A's Travel lists its members with their land Speeds (the pool reader)", rows, [["a1", 30], ["a2", 30], ["a3", 30], ["a4", 20], ["a5", 30], ["shared", 30]]);
  const card = chat[0]?.content ?? "";
  ok("T2 the card is the existing one, paced by the slowest of THIS party (a4, 20 ft), not Party B's 15 or an unassigned 5",
    /a4/.test(card) && /20/.test(card) && !/b1|u1/.test(card), card.slice(0, 300));
  dialogs.length = 0; chat.length = 0;
  answer = (o) => Object.fromEntries([["terrain", "normal"], ["miles", 0], ...partB.actors.map((_, i) => [`include-${i}`, true])]);
  await TD.openTravelDialog({ candidates: { actors: partB.actors, scopeNote: "B" } });
  ok("T3 Party B's Travel is paced by Party B (15 ft), and does not list Party A's own members", /b1/.test(chat[0]?.content ?? "") && /15/.test(chat[0]?.content ?? "") && !/a4/.test(dialogs[0]?.content ?? ""));
  dialogs.length = 0; answer = "cancel";
  await TD.openTravelDialog();
  const legacy = [...(dialogs[0]?.content ?? "").matchAll(/name="include-\d+" checked> ([^<]+)</g)].length;
  equal("T4 the scene control's Travel, unchanged: every player-owned character", legacy, [...A, ...B, ...unassigned].filter((a) => a.type === "character").length);
  ok("T5 the scene control still calls it with no argument", /onClick: \(\) => openTravelDialog\(\)/.test(read("scripts", "trg-prime.mjs")));
}

/* ------------------------------------------------------------ X. award XP */
{
  const preview = PA.xpAwardPreview(partA.actors, 700);
  equal("X1 700 across six: 116 each, 4 not awarded", [preview.each, preview.remainder, preview.count], [116, 4, 6]);
  equal("X2 the NPC's share is counted and not written; each character's XP shown before and after",
    preview.rows.map((r) => [r.name, r.written, r.after]), [["a1", true, 1116], ["a2", true, 1116], ["a3", false, null], ["a4", true, 1116], ["a5", true, 1116], ["shared", true, 1116]]);
  ok("X3 nothing to award, or nobody to award it to, is not ok", !PA.xpAwardPreview([], 100).ok && !PA.xpAwardPreview(partA.actors, 0).ok);
  equal("X4 the sources: the encounter and the five Chapter 12 accomplishments, then a custom amount",
    PA.xpSources({ encounterTotal: 450 }).map((s) => [s.key, s.xp]), [["encounter", 450], ["minor", 100], ["moderate", 200], ["major", 500], ["epic", 800], ["legendary", 1000], ["custom", null]]);
  // The award writes exactly the members the preview showed.
  for (const a of world.values()) a.updates.length = 0;
  chat.length = 0;
  const result = await PRW.awardPartyXP(partyA, 700, "a test", { members: partA.actors });
  equal("X5 the confirmed split is the one written", result, { each: 116, remainder: 4 });
  equal("X6 Party A's characters are written once each; its NPC is not; Party B and the unassigned untouched",
    [...world.values()].filter((a) => a.updates.length).map((a) => a.id).sort(), ["a1", "a2", "a4", "a5", "shared"]);
  ok("X7 the card is posted", /Experience Awarded/.test(chat[0]?.content ?? ""));
  // X9: the members confirmed are the members written, even when the roster
  // would resolve differently by the time Award is pressed.
  for (const a of world.values()) a.updates.length = 0;
  await PRW.awardPartyXP(partyA, 200, "a subset", { members: [A[0], A[1]] });
  equal("X9 only the members the GM confirmed are written (two of Party A's six)",
    [...world.values()].filter((a) => a.updates.length).map((a) => a.id).sort(), ["a1", "a2"]);
  globalThis.game.user = { id: "p", isGM: false };
  equal("X8 a player's award is refused in the workflow itself", await PRW.awardPartyXP(partyA, 100, "x", { members: partA.actors }), null);
  globalThis.game.user = { id: "gm", isGM: true };
}

/* ------------------------------------------------------------ O. one at a time */
{
  const running = new Set();
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const first = PA.runOnce(running, "A:rest", async () => { calls += 1; await gate; return "done"; });
  const second = await PA.runOnce(running, "A:rest", async () => { calls += 1; return "again"; });
  const otherParty = await PA.runOnce(running, "B:rest", async () => "B ran");
  release();
  equal("O1 a second press while running does nothing; another party's is not blocked", [second, otherParty, await first, calls], [null, "B ran", "done", 1]);
  equal("O2 once finished it can run again", await PA.runOnce(running, "A:rest", async () => "next"), "next");
  await PA.runOnce(running, "A:xp", async () => { throw new Error("boom"); }).catch(() => {});
  equal("O3 a failure releases the lock", await PA.runOnce(running, "A:xp", async () => "after"), "after");
}

/* ------------------------------------------------------------ B. toolbar */
{
  equal("B1 the toolbar's order", PA.PARTY_TOOLBAR_ACTIONS.map((a) => a.id), ["rollPartyInitiative", "partyRest", "partyTravel", "groupCheck", "beginSession", "partyAwardXP"]);
  const gc = PA.PARTY_TOOLBAR_ACTIONS.find((a) => a.id === "groupCheck");
  // Re-anchored 3.712.0 (Stage 5): Group Check is built, in the place Stage 3 held for it.
  ok("B2 Group Check has its place, built now, for the GM", gc && gc.implemented === true && gc.gmOnly === true);
  equal("B3 a GM is offered every implemented action", PA.toolbarFor({ isGM: true }).map((a) => a.id), ["rollPartyInitiative", "partyRest", "partyTravel", "groupCheck", "beginSession", "partyAwardXP"]);
  equal("B4 a player is offered Roll Initiative only", PA.toolbarFor({ isGM: false }).map((a) => a.id), ["rollPartyInitiative"]);
  const HBS = read("templates", "actor", "party-sheet.hbs");
  // Re-anchored 3.712.0 (Stage 5): drawn now, inside the GM block, behind its flag.
  ok("B5 the Group Check button is drawn for the GM, behind its flag", /\{\{#if toolbar\.show\.groupCheck\}\}\s*<button type="button" data-action="groupCheck"/.test(HBS));
  const bar = HBS.slice(HBS.indexOf('class="party-toolbar"'), HBS.indexOf("<nav"));
  const gm = bar.indexOf("{{#if isGM}}");
  for (const id of ["partyRest", "partyTravel", "beginSession", "partyAwardXP"]) {
    ok(`B6 ${id} is on the toolbar, inside the GM block, behind its flag`, gm > 0 && bar.indexOf(`data-action="${id}"`) > gm && bar.includes(`{{#if toolbar.show.${id}}}`));
    ok(`B7 ${id} is not marked for players`, !new RegExp(`data-player-ok[^>]*data-action="${id}"`).test(bar));
  }
}

/* ------------------------------------------------------------ S. the sheet */
{
  const SHEET = strip(read("module", "sheets", "party-sheet.mjs"));
  const handler = (name) => SHEET.slice(SHEET.indexOf(`static async ${name}(`), SHEET.indexOf("\n  }\n", SHEET.indexOf(`static async ${name}(`)));
  for (const name of ["partyRest", "partyTravel", "partyAwardXP", "beginSession"]) {
    ok(`S1 ${name} refuses a player in its own code`, /if \(!game\.user\.isGM\) return;/.test(handler(name)));
    ok(`S2 ${name} is a sheet action`, SHEET.includes(`${name}: TRGPartySheet.${name}`));
  }
  ok("S3 Rest hands the existing dialog THIS party's participants", /openRestDialog\(\{\s*candidates: \{ actors: participants\.actors, scopeNote: partyScopeNote\(this\.actor\.name, "Resting", participants\) \}/.test(handler("partyRest")));
  ok("S4 Travel likewise", /openTravelDialog\(\{\s*candidates: \{ actors: participants\.actors, scopeNote: partyScopeNote\(this\.actor\.name, "Travelling with", participants\) \}/.test(handler("partyTravel")));
  ok("S5 the participants come from this party's roster", /return partyParticipants\(await resolvePartyRoster\(this\.actor\)\);/.test(SHEET));
  ok("S6 Rest, Travel, XP and Begin Session each run one at a time, per party",
    ["rest", "travel", "xp", "session"].every((k) => SHEET.includes(`\`\${this.actor.uuid}:${k}\``)));
  const award = SHEET.slice(SHEET.indexOf("async #awardXP("), SHEET.indexOf("static async partyAwardXP("));
  ok("S7 every award is previewed and confirmed before the existing workflow writes it, with the same members",
    /const preview = xpAwardPreview\(actors, total\);/.test(award) && /if \(!\(await confirmXPAward\(this\.actor, preview, reason\)\)\) return null;/.test(award)
    && /return awardPartyXP\(this\.actor, preview\.xp, reason, \{ members: actors \}\);/.test(award));
  for (const name of ["awardEncounterXP", "awardAccomplishment", "awardCustomXP"]) {
    ok(`S8 the Encounter tab's ${name} goes through the same confirmation`, /await this\.#awardXP\(/.test(handler(name)) && !/awardPartyXP\(/.test(handler(name)));
  }
  ok("S9 Begin Session is the existing workflow", /\(\) => beginSession\(this\.actor\)/.test(handler("beginSession")));
  // S10 (3.710.1, found live): the toolbar's Award XP holds the party's XP
  // lock from the chooser onwards, so a second press while the chooser or the
  // confirmation is open opens nothing.
  const tool = SHEET.slice(SHEET.indexOf("static async partyAwardXP("), SHEET.indexOf("/** Rest for THIS party"));
  ok("S10 the whole toolbar Award XP, choosing included, runs inside the party's XP lock",
    /await runOnce\(TRGPartySheet\.#running, `\$\{this\.actor\.uuid\}:xp`, async \(\) => \{\s*const context = await rewardsContext\(this\.actor\);\s*const choice = await chooseXPAward\(/.test(tool)
    && /return choice \? this\.#awardXPNow\(choice\.xp, choice\.reason\) : null;/.test(tool));
  ok("S11 ...and calls the un-locked award inside it (a nested lock would refuse itself)", !/this\.#awardXP\(/.test(tool));
}

/* ------------------------------------------------------------ Z. version */
{
  const sys = JSON.parse(read("system.json"));
  equal("Z1 the version is 3.713.0, the download names it, and package.json agrees",
    [sys.version, sys.download.includes("/v3.714.0/"), JSON.parse(read("package.json")).version], ["3.714.0", true, "3.714.0"]);
}

if (failures.length) {
  console.log(`verify-party-sheet-stage3: ${failures.length} of ${checks} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-party-sheet-stage3: ${checks} checks — all green.`);
