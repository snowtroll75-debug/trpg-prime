#!/usr/bin/env node
/**
 * verify-party-sheet-stage2 — TRG Prime 3.709.0, Party Sheet V2 Stage 2
 * (the Overview dashboard).
 *
 *   A  The member panel's figures: each is the member's own prepared total,
 *      a missing one is null (shown "—", never 0), resources absent stay
 *      absent, Conviction follows the world setting, condition chips know
 *      granted from applied, effects are listed.
 *   B  Tokens: a world actor is its LINKED tokens only; an unlinked copy is
 *      counted, never chosen; an unlinked member is its own token; a fixed
 *      order, and Find steps through them.
 *   C  Initiative: every state, and the party button rolls each eligible
 *      combatant once.
 *   D  The summary: members, missing, APL (Chapter 12), the slowest land
 *      Speed (the travel rule), coin; empty, one, six and twenty members;
 *      a gated NPC's Speed not shown to a player.
 *   E  Resource steppers: the sheet field's own update.
 *   F  The sheet's wiring: existing workflows only, GM checks in the
 *      handlers, the member resolved from the roster when pressed.
 *   G  The template: toolbar on every tab, GM-only controls, labels,
 *      nothing Foundry v14 does not provide.
 *   H  Live updates for combat, combatants, tokens and the scene.
 *   I  The styles.
 *   L  What the live test of 3.709.0 found (fixed in 3.709.1).
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

globalThis.foundry = { applications: { api: { DialogV2: class {} } }, utils: {} };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const P = await imp("party.mjs");
const D = await imp("party-dashboard.mjs");
const LS = await imp("party-live-sync.mjs");
const SHEET = strip(read("module", "sheets", "party-sheet.mjs"));
const HBS = read("templates", "actor", "party-sheet.hbs");
const CSS = read("styles", "trg-prime.css");

const actor = (id, type = "character", over = {}) => ({
  id, uuid: `Actor.${id}`, name: id, img: `${id}.webp`, type,
  system: {
    identity: { level: 3, race: "Elf", class: "Bard" },
    resources: { hp: { value: 12, max: 30, temp: 0 }, pp: { value: 4, max: 8 }, ap: { value: 3, max: 3 }, reactions: { value: 1, max: 1 }, conviction: { value: 0, max: 1 } },
    combat: { defence: { total: 4 }, initiative: { total: 25 }, saves: { fortitude: { total: 5 }, reflex: { total: 6 }, will: { total: 7 } }, movement: { land: { base: 30, total: 25 } } },
    ...over
  }
});
const speedOf = (a) => Number(a.system?.combat?.movement?.land?.total ?? 0);

/* ------------------------------------------------------------ A. the panel's figures */
{
  const m = P.memberSummary(actor("A"), "Actor.A", () => [], { status: "ok", readSpeed: speedOf, conviction: true });
  equal("A1 DB, Init and the saves are the prepared totals", [m.stats.defence, m.stats.initiative, m.stats.fortitude, m.stats.reflex, m.stats.will], [4, 25, 5, 6, 7]);
  equal("A2 land Speed comes from the injected reader (the resolved total, 25, not the base 30)", m.stats.speed, 25);
  equal("A3 AP, Reactions and Conviction, as value/max", [m.resources.ap.value, m.resources.ap.max, m.resources.reactions.value, m.resources.conviction.max], [3, 3, 1, 1]);
  equal("A4 the printed list carries labels, in order", m.resourceList.map((r) => r.short), ["AP", "React", "Conv"]);
  const off = P.memberSummary(actor("A"), "Actor.A", () => [], { status: "ok", conviction: false });
  ok("A5 Conviction is left out where the world does not use it", off.resources.conviction === null && !off.resourceList.some((r) => r.key === "conviction"));
  const bare = P.memberSummary({ id: "N", uuid: "Actor.N", name: "N", type: "npc", system: { identity: {}, resources: { hp: { value: 5, max: 5 } }, combat: {} } }, "Actor.N", () => [], { status: "ok" });
  equal("A6 a creature without a figure gets null, not 0", [bare.stats.defence, bare.stats.initiative, bare.stats.will, bare.stats.speed], [null, null, null, null]);
  ok("A7 a creature without AP or Reactions has none listed (not 0/0)", bare.resources.ap === null && bare.resources.reactions === null && bare.resourceList.length === 0);
  const zero = P.memberSummary(actor("Z", "character", { combat: { defence: { total: 0 }, initiative: { total: 0 }, saves: {} } }), "Actor.Z", () => [], { status: "ok" });
  equal("A8 a real 0 stays 0, a missing save stays null", [zero.stats.defence, zero.stats.fortitude], [0, null]);
  const chips = P.memberSummary(actor("C"), "Actor.C", () => [{ id: "blinded", label: "Blinded", granted: false }, { id: "flatFooted", label: "Flat-Footed", granted: true }], { status: "ok" });
  equal("A9 an applied condition is removable; one granted by another is not",
    chips.conditionChips.map((c) => [c.label, c.removable, c.granted]), [["Blinded", true, false], ["Flat-Footed", false, true]]);
  equal("A10 ...and the plain label list is kept (3.708.0's shape)", chips.conditions, ["Blinded", "Flat-Footed"]);
  const legacy = P.memberSummary(actor("L"), "Actor.L", () => ["Weakened 2"], { status: "ok" });
  ok("A11 a reader that returns bare labels still works, with no remove", legacy.conditionChips[0].label === "Weakened 2" && !legacy.conditionChips[0].removable);
  const fx = P.memberSummary(actor("E"), "Actor.E", () => [], { status: "ok", readEffects: () => [{ id: "e1", name: "Bless", img: "b.webp" }, { id: "e2", name: "" }] });
  equal("A12 active effects are listed by name (a nameless one dropped)", fx.effects.map((e) => e.name), ["Bless"]);
  const gated = P.memberSummary(actor("G", "npc"), "Actor.G", () => [{ id: "blinded", label: "Blinded" }], { status: "ok", restricted: true, readSpeed: speedOf });
  ok("A13 a gated NPC row carries none of the new figures", gated.stats === undefined && gated.resources === undefined && gated.effects === undefined && gated.conditionChips === undefined);
}

/* ------------------------------------------------------------ B. tokens */
{
  const tokens = [
    { id: "t3", actorId: "A", actorLink: true },
    { id: "t1", actorId: "A", actorLink: true },
    { id: "t2", actorId: "A", actorLink: false, actorUuid: "Scene.s.Token.t2.Actor.A" },
    { id: "t9", actorId: "B", actorLink: true }
  ];
  const world = D.memberTokens({ id: "A", uuid: "Actor.A" }, tokens);
  equal("B1 a world actor's tokens are its LINKED ones, in id order", world.tokens.map((t) => t.id), ["t1", "t3"]);
  equal("B2 ...an unlinked copy is counted, not chosen", world.unlinkedCopies, 1);
  const synth = D.memberTokens({ uuid: "Scene.s.Token.t2.Actor.A", isToken: true }, tokens);
  equal("B3 an unlinked token's actor on the roster is that token only", synth.tokens.map((t) => t.id), ["t2"]);
  equal("B4 no token: none offered", D.memberTokens({ id: "Q", uuid: "Actor.Q" }, tokens).tokens.length, 0);
  equal("B5 Find goes to the first, then the next, then wraps",
    [D.nextToken(world.tokens, null)?.id, D.nextToken(world.tokens, "t1")?.id, D.nextToken(world.tokens, "t3")?.id], ["t1", "t3", "t1"]);
  equal("B6 a remembered token that has gone starts again from the first", D.nextToken(world.tokens, "gone")?.id, "t1");
  equal("B7 nothing to find is null", D.nextToken([], null), null);
}

/* ------------------------------------------------------------ C. initiative */
{
  const m = { uuid: "Actor.A" };
  const c = (list) => ({ combatants: list });
  equal("C1 no combat", D.initiativeState(null, m).state, "none");
  equal("C2 a combat without the member", D.initiativeState(c([{ id: "x", actorUuid: "Actor.B", initiative: null, isOwner: true }]), m).state, "absent");
  equal("C3 one combatant to roll, owned: ready, with its id", D.initiativeState(c([{ id: "c1", actorUuid: "Actor.A", initiative: null, isOwner: true }]), m), { state: "ready", id: "c1" });
  equal("C4 rolled: the value shown", D.initiativeState(c([{ id: "c1", actorUuid: "Actor.A", initiative: 47, isOwner: true }]), m), { state: "rolled", value: 47 });
  equal("C5 a roll of 0 counts as rolled", D.initiativeState(c([{ id: "c1", actorUuid: "Actor.A", initiative: 0, isOwner: true }]), m).state, "rolled");
  equal("C6 two combatants waiting: left to the tracker", D.initiativeState(c([{ id: "c1", actorUuid: "Actor.A", initiative: null, isOwner: true }, { id: "c2", actorUuid: "Actor.A", initiative: null, isOwner: true }]), m), { state: "several", count: 2 });
  equal("C7 waiting but not this user's", D.initiativeState(c([{ id: "c1", actorUuid: "Actor.A", initiative: null, isOwner: false }]), m).state, "notYours");
  const combat = c([
    { id: "a", actorUuid: "Actor.A", initiative: null, isOwner: true },
    { id: "b", actorUuid: "Actor.B", initiative: 30, isOwner: true },
    { id: "c", actorUuid: "Actor.C", initiative: null, isOwner: false },
    { id: "d1", actorUuid: "Actor.D", initiative: null, isOwner: true }, { id: "d2", actorUuid: "Actor.D", initiative: null, isOwner: true }
  ]);
  equal("C8 the party button rolls only the members that are ready, each once",
    D.partyInitiativeIds(combat, [{ uuid: "Actor.A" }, { uuid: "Actor.A" }, { uuid: "Actor.B" }, { uuid: "Actor.C" }, { uuid: "Actor.D" }]), ["a"]);
}

/* ------------------------------------------------------------ D. summary */
{
  const row = (name, level, speed, extra = {}) => ({ name, level, missing: false, status: "ok", isNPC: false, stats: { speed }, ...extra });
  equal("D1 an empty party", D.partySummary({ rows: [], coinGP: 0 }), { members: 0, npcs: 0, missing: 0, ineligible: 0, hidden: 0, apl: { apl: 0, exact: 0, members: 0 }, speed: 0, pacedBy: null, coinGP: 0 });
  const one = D.partySummary({ rows: [row("Solo", 4, 30)], coinGP: 1.234 });
  equal("D2 one member: APL is their level, the pace their Speed, coin to the copper", [one.members, one.apl.apl, one.speed, one.pacedBy, one.coinGP], [1, 4, 30, "Solo", 1.23]);
  const six = D.partySummary({ rows: [row("A", 1, 30), row("B", 2, 25), row("C", 3, 30), row("D", 4, 20), row("E", 5, 35), row("F", 6, 20)], coinGP: 0 });
  equal("D3 six members: APL 3.5 rounds to 4; the FIRST of the slowest sets the pace", [six.members, six.apl.apl, six.apl.exact, six.speed, six.pacedBy], [6, 4, 3.5, 20, "D"]);
  const mixed = [];
  for (let i = 0; i < 20; i += 1) mixed.push(row(`M${i}`, (i % 10) + 1, 25 + (i % 3) * 5, { isNPC: i % 4 === 0 }));
  mixed.push({ name: "(missing actor)", missing: true, status: "missing" }, { name: "Rex", missing: true, status: "ineligible" });
  const big = D.partySummary({ rows: mixed, coinGP: 99 });
  equal("D4 a large mixed party: 20 members, 5 NPCs, 1 missing, 1 not allowed", [big.members, big.npcs, big.missing, big.ineligible], [20, 5, 1, 1]);
  const withGated = D.partySummary({ rows: [row("Pc", 4, 30), row("Npc", 10, 10, { isNPC: true, restricted: true })], coinGP: 0 });
  equal("D5 a gated NPC is not in a player's APL or pace (its Speed and name stay hidden)", [withGated.apl.apl, withGated.speed, withGated.pacedBy, withGated.hidden], [4, 30, "Pc", 1]);
  const noSpeed = D.partySummary({ rows: [row("A", 1, null), row("B", 1, 0)], coinGP: 0 });
  equal("D6 members without a land Speed give no pace (shown —), not 0 ft", [noSpeed.speed, noSpeed.pacedBy], [0, null]);
  ok("D7 the summary uses the existing rules, not its own", /import \{ averagePartyLevel \} from "\.\/rewards\.mjs";/.test(read("module", "party-dashboard.mjs"))
    && /import \{ partyTravelSpeed \} from "\.\/travel\.mjs";/.test(read("module", "party-dashboard.mjs"))
    && /readSpeed: landSpeed,/.test(SHEET) && /import \{ landSpeed, openTravelDialog \} from "\.\.\/travel-dialog\.mjs";/.test(SHEET) /* re-anchored 3.710.0 */
    && /partySummary\(\{ rows: members, coinGP: coinValueInGP\(currency\) \}\)/.test(SHEET));
}

/* ------------------------------------------------------------ E. steppers */
{
  equal("E1 HP may go below zero (dying is recorded that way)", D.stepResource({ key: "hp", value: 0, delta: -1 }), { path: "system.resources.hp.value", value: -1 });
  equal("E2 AP stops at zero", D.stepResource({ key: "ap", value: 0, delta: -1 }), null);
  equal("E3 Conviction up one", D.stepResource({ key: "conviction", value: 0, delta: 1 }), { path: "system.resources.conviction.value", value: 1 });
  equal("E4 the maximum is the actor's to clamp, as for the sheet's field", D.stepResource({ key: "reactions", value: 1, delta: 1 }), { path: "system.resources.reactions.value", value: 2 });
  ok("E5 an unknown resource, a zero step or a missing pool writes nothing",
    D.stepResource({ key: "luck", value: 1, delta: 1 }) === null && D.stepResource({ key: "hp", value: 5, delta: 0 }) === null && D.stepResource({ key: "pp", value: undefined, delta: 1 }) === null);
  equal("E6 the five stepped resources", [...D.STEPPED_RESOURCES], ["hp", "pp", "ap", "reactions", "conviction"]);
}

/* ------------------------------------------------------------ F. wiring */
{
  for (const action of ["findToken", "selectToken", "rollMemberInitiative", "rollPartyInitiative", "applyMemberDamage", "stepMemberResource", "removeMemberCondition", "addMemberCondition", "beginSession"]) {
    ok(`F1 ${action} is an action and is in the template`, SHEET.includes(`${action}: TRGPartySheet.${action}`) && HBS.includes(`data-action="${action}"`));
  }
  const handler = (name) => SHEET.slice(SHEET.indexOf(`static async ${name}(`), SHEET.indexOf("\n  }\n", SHEET.indexOf(`static async ${name}(`)));
  for (const name of ["applyMemberDamage", "stepMemberResource", "removeMemberCondition", "addMemberCondition"]) {
    ok(`F2 ${name} refuses a player in its own code`, /if \(!game\.user\.isGM\) return;/.test(handler(name)));
  }
  ok("F3 damage is the existing Apply Damage dialog", /await applyDamage\(member\)/.test(handler("applyMemberDamage")) && /import \{ applyDamage \} from "\.\.\/combat\/dying-workflow\.mjs";/.test(SHEET));
  ok("F4 a stepper writes the sheet field's path, worked out by stepResource", /const step = stepResource\(\{/.test(handler("stepMemberResource")) && /await member\.update\(\{ \[step\.path\]: step\.value \}\)/.test(handler("stepMemberResource")));
  ok("F5 conditions go through the actor's own toggle", /await member\.toggleStatusEffect\(id, \{ active: false \}\)/.test(handler("removeMemberCondition"))
    && /await member\.toggleStatusEffect\(id, \{ active: true \}\)/.test(handler("addMemberCondition")));
  ok("F6 a granted condition is refused by itself", /member\.conditions\?\.granted\?\.has\?\.\(id\)/.test(handler("removeMemberCondition")));
  ok("F7 initiative recomputes the member's state when pressed, then uses the system's roll",
    /const state = initiativeState\(combat, member\);\s*if \(state\.state !== "ready"\)/.test(handler("rollMemberInitiative")) && /await combat\.combat\.rollInitiative\(\[state\.id\]\)/.test(handler("rollMemberInitiative")));
  ok("F8 the party button rolls the eligible ids in one call", /const ids = partyInitiativeIds\(combat, activeMembers\(roster\)\);/.test(handler("rollPartyInitiative")) && /await combat\.combat\.rollInitiative\(ids\)/.test(handler("rollPartyInitiative")));
  ok("F9 a control acts only on an actor that is on this roster", /if \(!uuid \|\| !normaliseMembers\(this\.actor\.system\.members\)\.includes\(uuid\)\) return null;/.test(SHEET));
  ok("F10 Select only takes a token this user controls", /const owned = tokens\.filter\(\(t\) => game\.user\.isGM \|\| t\.isOwner\);/.test(handler("selectToken")) && /pick\.token\.control\(\{ releaseOthers: true \}\)/.test(handler("selectToken")));
  ok("F11 Find recomputes the tokens when pressed and steps through them", /const pick = nextToken\(tokens, this\.#lastToken\.get\(member\.uuid\)\);/.test(handler("findToken")) && /canvas\.animatePan\(\{ x, y \}\)/.test(handler("findToken")));
  ok("F12 a player only finds tokens Foundry shows them", /isGM \|\| \(token\.visible && !token\.document\?\.hidden\)/.test(read("module", "party-dashboard.mjs")));
  ok("F13 Open Sheet uses Foundry's own permission test", /actor\.testUserPermission\(user, "LIMITED"\)/.test(SHEET));
  ok("F14 the GM-only controls are off for a gated row", /gm: isGM && !summary\.restricted/.test(SHEET));
  ok("F15 Conviction follows the world's setting", /const conviction = convictionEnabled\(\);/.test(SHEET));
}

/* ------------------------------------------------------------ G. template */
{
  const toolbarAt = HBS.indexOf('class="party-toolbar"');
  ok("G1 the toolbar sits outside the tabs, so it is on every tab", toolbarAt > 0 && toolbarAt < HBS.indexOf("<main class=\"sheet-body\">"));
  // RE-ANCHORED 3.710.0: the toolbar's GM actions sit in one isGM block, each behind its toolbar flag.
  { const bar = HBS.slice(toolbarAt, HBS.indexOf("<nav", toolbarAt)); const gm = bar.indexOf("{{#if isGM}}");
    ok("G2 Begin Session on the toolbar is the GM's", gm > 0 && bar.indexOf('data-action="beginSession"') > gm); }
  ok("G3 the tabs are Overview, Inventory and Encounter (ids unchanged)",
    /\{ id: "roster", icon: "fa-solid fa-users", label: "Overview" \}/.test(SHEET) && /\{ id: "loot", icon: "fa-solid fa-sack-dollar", label: "Inventory" \}/.test(SHEET) && /label: "Encounter" \}/.test(SHEET));
  // Re-anchored 3.712.0 (Stage 5): Graham's rule was "add each tab when it is
  // built". Stage 5 builds them, so each declared tab now has its panel.
  ok("G4 each tab is added when it is built: Skills and Notes, each declared with its panel (Graham)", /id: "skills"/.test(SHEET) && /id: "notes"/.test(SHEET) && /data-tab="skills"/.test(HBS) && /data-tab="notes"/.test(HBS));
  ok("G5 only helpers Foundry v14 registers (no `array`)", !/\(array /.test(HBS));
  ok("G6 nested blocks read the member through its block parameter, not ../m", !/\.\.\/m\./.test(HBS));
  for (const r of ["hp", "pp"]) ok(`G7 the ${r} steppers are inside a GM block`, new RegExp(`\\{\\{#if m\\.controls\\.gm\\}\\}<span class="party-steppers">\\s*<button[^>]*data-resource="${r}"`).test(HBS));
  ok("G8 the AP/React/Conv steppers are GM-only too", (HBS.match(/\{\{#if m\.controls\.gm\}\}<button type="button" class="party-step" data-action="stepMemberResource" data-resource="\{\{r\.key\}\}"/g) ?? []).length === 2);
  ok("G9 condition remove and add are GM-only", /\{\{#if \(and m\.controls\.gm c\.removable\)\}\}/.test(HBS) && /\{\{#if m\.controls\.gm\}\}\s*<button type="button" class="party-condition-add"/.test(HBS));
  ok("G10 damage is GM-only", /\{\{#if m\.controls\.gm\}\}<button type="button" data-action="applyMemberDamage"/.test(HBS));
  ok("G11 a missing figure prints a dash", (HBS.match(/\{\{#if \(eq m\.stats\.[a-z]+ null\)\}\}&mdash;/g) ?? []).length === 5);
  ok("G12 the summary prints the four figures", ["summary.members", "summary.apl.apl", "summary.speed", "summary.coinGP"].every((k) => HBS.includes(`{{${k}}}`)));
  ok("G13 every control has an accessible name", (HBS.match(/data-action="(findToken|selectToken|rollMemberInitiative|applyMemberDamage|openMember)"[^>]*aria-label=/g) ?? []).length >= 4);
  ok("G14 a disabled control says why (its hint is its tooltip)", /data-tooltip="\{\{m\.controls\.find\.hint\}\}"/.test(HBS) && /\{\{#unless m\.controls\.find\.enabled\}\}disabled\{\{\/unless\}\}/.test(HBS));
}

/* ------------------------------------------------------------ H. live updates */
{
  const hooks = { on: () => 1, off: () => {} };
  const sync = new LS.PartyLiveSync(hooks);
  const sheet = () => ({ told: 0, onPartyDocumentChanged() { this.told += 1; } });
  const a = sheet(); const b = sheet();
  sync.watch(a, ["Actor.pc"]); sync.watch(b, ["Actor.other"]);
  sync.handle("updateCombatant", { actor: { uuid: "Actor.pc" } }, { initiative: 40 }, {}, "u");
  equal("H1 a member's initiative being rolled reaches its sheet only", [a.told, b.told], [1, 0]);
  sync.handle("updateCombatant", { actor: { uuid: "Actor.pc" } }, { "flags.x": 1 }, {}, "u");
  equal("H2 ...other combatant changes do not", a.told, 1);
  sync.handle("createCombatant", { actor: { uuid: "Actor.pc" } }, {}, "u");
  equal("H3 a member joining a combat reaches its sheet", a.told, 2);
  sync.handle("updateCombat", { id: "c" }, { turn: 3 }, {}, "u");
  equal("H4 a turn change reaches nobody", [a.told, b.told], [2, 0]);
  sync.handle("updateCombat", { id: "c" }, { active: true }, {}, "u");
  equal("H5 a combat becoming active reaches every sheet", [a.told, b.told], [3, 1]);
  sync.handle("createCombat", { id: "c2" }, {}, "u");
  sync.handle("canvasReady", { scene: {} });
  equal("H6 a new combat and a scene change reach every sheet", [a.told, b.told], [5, 3]);
  sync.handle("createToken", { uuid: "Scene.s.Token.t", actorLink: true, actorId: "pc" }, {}, "u");
  equal("H7 a member's linked token placed: its sheet", [a.told, b.told], [6, 3]);
  sync.handle("updateToken", { uuid: "Scene.s.Token.t", actorLink: true, actorId: "pc" }, { x: 100, y: 200 }, {}, "u");
  equal("H8 a token moving reaches nobody", a.told, 6);
  sync.handle("updateToken", { uuid: "Scene.s.Token.t", actorLink: true, actorId: "pc" }, { hidden: true }, {}, "u");
  equal("H9 a member's token hidden reaches its sheet (a player can no longer find it)", a.told, 7);
  sync.handle("createToken", { uuid: "Scene.s.Token.u", actorLink: false, actorId: "pc" }, {}, "u");
  equal("H10 an unlinked copy placed is not the member", a.told, 7);
  for (const event of ["updateToken", "createCombatant", "updateCombatant", "deleteCombatant", "createCombat", "updateCombat", "deleteCombat", "canvasReady"]) {
    ok(`H11 ${event} is listened to`, LS.PARTY_SYNC_EVENTS.includes(event));
  }
}

/* ------------------------------------------------------------ I. styles */
{
  for (const cls of ["party-toolbar", "party-summary", "party-summary-stat", "party-member-body", "party-stats", "party-stat", "party-resource", "party-step", "party-member-controls", "party-condition-granted", "party-condition-add", "party-effect", "party-init-value"]) {
    ok(`I1 .${cls} is styled`, new RegExp(`\\.trg-prime[^{]*\\.${cls}\\b[^{]*\\{`).test(CSS));
  }
  ok("I2 the panel wraps rather than scrolling sideways", /\.trg-prime \.party-member-body \{[^}]*flex-wrap: wrap;/.test(CSS) && /\.trg-prime \.party-summary \{[^}]*repeat\(auto-fit, minmax\(120px, 1fr\)\)/.test(CSS));
  ok("I3 only palette colours in the new block (no fresh hex)", !/#[0-9a-f]{3,6}\b/i.test(CSS.slice(CSS.indexOf("THE PARTY OVERVIEW (3.709.0"), CSS.indexOf(".trg-prime .party-effect img"))));
  ok("I4 the default window is wide enough for the panel", /position: \{ width: 820, height: 760/.test(SHEET));
}

/* ------------------------------------------------------------ L. found in the live test (3.709.1) */
{
  // L1: v14 disables every form control on a sheet the user cannot edit;
  // a player has Observer on a party, so tabs, Take and the dashboard's own
  // controls were dead for players. They are re-enabled after Foundry's pass.
  const toggle = SHEET.slice(SHEET.indexOf("_toggleDisabled(disabled) {"), SHEET.indexOf("\n  }\n", SHEET.indexOf("_toggleDisabled(disabled) {")));
  ok("L1 the sheet re-enables the player's controls after Foundry disables the form",
    /super\._toggleDisabled\(disabled\);/.test(toggle) && /if \(!offAlready\.has\(el\)\) el\.disabled = false;/.test(toggle));
  ok("L2 ...but a control the template itself disabled stays disabled",
    /const offAlready = new Set\(Array\.from\(this\.element\?\.querySelectorAll\("\[data-player-ok\]"\) \?\? \[\]\)\.filter\(\(el\) => el\.disabled\)\);/.test(toggle));
  for (const action of ["tab", "takeItem", "takeCoin", "openMember", "findToken", "selectToken", "rollMemberInitiative", "rollPartyInitiative"]) {
    ok(`L3 ${action} is marked for players`, new RegExp(`data-player-ok[^>]*data-action="${action}"|data-action="${action}" data-player-ok`).test(HBS));
  }
  for (const action of ["stepMemberResource", "applyMemberDamage", "removeMemberCondition", "addMemberCondition", "removeMember", "deleteLoot", "beginSession"]) {
    ok(`L4 the GM's ${action} is not marked for players`, !new RegExp(`data-player-ok[^>]*data-action="${action}"|data-action="${action}" data-player-ok`).test(HBS));
  }
  // Re-anchored 3.711.0 (Stage 4), same meaning: the inventory's search
  // and type filter are marked for players, and are UNNAMED, so they never
  // reach the form or the actor. A NAMED input or select is what writes.
  ok("L5 no input that writes the party is marked for players", !/<(?:input|select)(?=[^>]*\bname=)[^>]*data-player-ok/.test(HBS) && !/<(?:input|select)[^>]*data-player-ok[^>]*\bname=/.test(HBS));

  // L6: a raise stops at the maximum, so no stored value sits above it.
  equal("L6 Conviction at 1 of 1: + writes nothing", D.stepResource({ key: "conviction", value: 1, max: 1, delta: 1 }), null);
  equal("L7 PP with no pool (max 0): + writes nothing", D.stepResource({ key: "pp", value: 0, max: 0, delta: 1 }), null);
  equal("L8 HP at 29 of 30: + gives 30, not 31 on a second press", [D.stepResource({ key: "hp", value: 29, max: 30, delta: 1 })?.value, D.stepResource({ key: "hp", value: 30, max: 30, delta: 1 })], [30, null]);
  equal("L9 a value already above its maximum is not pushed further, and may still be lowered",
    [D.stepResource({ key: "hp", value: 35, max: 30, delta: 1 }), D.stepResource({ key: "hp", value: 35, max: 30, delta: -1 })?.value], [null, 34]);
  ok("L10 the sheet passes the maximum to the stepper", /max: member\.system\?\.resources\?\.\[key\]\?\.max,/.test(SHEET));
}

/* ------------------------------------------------------------ Z. version */
{
  const sys = JSON.parse(read("system.json"));
  equal("Z1 the version is 3.712.2 (3.709.1 or later), the download names it, and package.json agrees",
    [sys.version, sys.download.includes("/v3.712.2/"), JSON.parse(read("package.json")).version], ["3.712.2", true, "3.712.2"]);
}

if (failures.length) {
  console.log(`verify-party-sheet-stage2: ${failures.length} of ${checks} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-party-sheet-stage2: ${checks} checks — all green.`);
