#!/usr/bin/env node
/**
 * verify-party-sheet-stage5 — TRG Prime 3.712.0, Party Sheet V2 Stage 5
 * (Skills, the Group Check, the Encounter page, Notes, and the integration).
 *
 *   K  The Skills matrix: the core skills; prepared totals; +0 is not "—";
 *      hidden members give no numbers; the best marked, ties included;
 *      sort; filter; a click is the member's own roll.
 *   G  The Group Check: what it asks; each member through TRGCheck with no
 *      modifiers of its own; no group result invented; the visibility; no
 *      member changed.
 *   E  The Encounter: storage version 2, read from version 1 unchanged;
 *      the import list (party members out, defeated and friendly unticked,
 *      hidden in, missing named); one creature per token, once; a linked
 *      actor once; nothing lowered; Clear asks and clears the list only.
 *   N  Notes: the party's own field, edited by the GM only, secrets for the
 *      GM; one changed field written; live renders wait for the editor.
 *   T  The five tabs and the toolbar.
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
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };

const PK = await imp("party-skills.mjs");
const RW = await imp("party-rewards-workflow.mjs");
const { SKILLS } = await imp("config.mjs");
const SHEET = strip(read("module", "sheets", "party-sheet.mjs"));
const HBS = read("templates", "actor", "party-sheet.hbs");
const SKILLSRC = strip(read("module", "party-skills.mjs"));

/* ------------------------------------------------------------ K. skills */
{
  const cols = PK.skillColumns();
  equal("K1 the columns are TRG Prime's own skills, in their order", cols.map((c) => c.key), Object.keys(SKILLS));
  equal("K2 ...with readable headings", cols.slice(0, 3).map((c) => c.label), ["Acrobatics", "Arcana", "Artistry"]);
  const actor = (skills) => ({ system: { skills } });
  const m = PK.skillMatrix([
    { uuid: "Actor.Z", name: "Zed", actor: actor({ arcana: { total: 5 }, stealth: { total: 0 } }), canRoll: true },
    { uuid: "Actor.A", name: "Ana", actor: actor({ arcana: { total: 5 }, stealth: { total: -2 } }), canRoll: false },
    { uuid: "Actor.N", name: "Npc", actor: actor({ arcana: { total: 12 } }), restricted: true, canRoll: true },
    { uuid: "Actor.X", name: "Xen", actor: { system: {} }, canRoll: true }
  ]);
  const at = (name, key) => m.rows.find((r) => r.name === name).cells[cols.findIndex((c) => c.key === key)];
  equal("K3 a modifier is the prepared total, and 0 shows as +0", [at("Zed", "arcana").text, at("Zed", "stealth").text, at("Ana", "stealth").text], ["+5", "+0", "-2"]);
  equal("K4 a skill the member's data lacks is unavailable (—), not 0", [at("Xen", "arcana").state, at("Xen", "arcana").text, at("Zed", "thievery").state], ["unavailable", "—", "unavailable"]);
  equal("K5 a member whose statistics this user may not see gives no number", [at("Npc", "arcana").state, at("Npc", "arcana").value, at("Npc", "arcana").text], ["hidden", null, "?"]);
  ok("K6 ...and a hidden number is never the column's best", m.columns.find((c) => c.key === "arcana").best === 5);
  equal("K7 the best visible value is marked, ties included", [at("Zed", "arcana").best, at("Ana", "arcana").best, at("Zed", "stealth").best, at("Ana", "stealth").best], [true, true, true, false]);
  equal("K8 a modifier is a button only for whoever may roll it, and never for a hidden member", [at("Zed", "arcana").rollable, at("Ana", "arcana").rollable, at("Npc", "arcana").rollable, at("Xen", "arcana").rollable], [true, false, false, false]);
  equal("K9 members sort by name, A–Z and Z–A", [m.rows.map((r) => r.name), PK.skillMatrix(m.rows.map((r) => ({ ...r, actor: {} })), { sort: "desc" }).rows.map((r) => r.name)], [["Ana", "Npc", "Xen", "Zed"], ["Zed", "Xen", "Npc", "Ana"]]);
  equal("K10 the filter matches a heading or key, any case", [PK.matchesSkillFilter({ key: "senseMotive", label: "Sense Motive" }, "SENSEMOTIVE"), PK.matchesSkillFilter({ key: "stealth", label: "Stealth" }, "arc"), PK.matchesSkillFilter({ key: "x", label: "X" }, "")], [true, false, true]);
  ok("K11 no skill arithmetic: the module reads `total` and adds nothing to it", /const total = Number\(skill\?\.total\);/.test(SKILLSRC) && !/total \+|\+ total|ranks|checkModifiers\.reduce/.test(SKILLSRC.replace(/skill\?\.total/g, "")));
  ok("K12 a click is the member's own roll: the character sheet's rollSkill, called on that member's sheet", /const roll = sheet\?\.constructor\?\.rollSkill;/.test(SHEET) && /return roll\.call\(sheet, event, \{ dataset: \{ skill: key \} \}\);/.test(SHEET));
  ok("K13 ...refused to a user who does not control the member", /if \(!game\.user\.isGM && !member\.isOwner\) \{\s*ui\.notifications\?\.warn\(`You do not control/.test(SHEET));
  ok("K14 the sheet builds the matrix with Graham's visibility rule and the roll permission", /restricted: !canSeeMemberDetails\(e\.actor, game\.user\),\s*canRoll: isGM \|\| e\.actor\.isOwner/.test(SHEET));
  ok("K15 the table scrolls, its header and names stay in view, and the filter is unnamed", /class="party-skills-scroll"/.test(HBS) && /position: sticky/.test(read("styles", "trg-prime.css")) && /<input type="search" data-skill-filter data-player-ok/.test(HBS) && !/data-skill-filter[^>]*name=/.test(HBS));
  ok("K16 the sort and the filter survive a render, and the filter hides columns in place", /#skillSort = "asc";/.test(SHEET) && /#skillFilter = "";/.test(SHEET) && /for \(const el of root\.querySelectorAll\(`\[data-skill-col="\$\{column\.key\}"\]`\)\) el\.hidden = !visible;/.test(SHEET));
}

/* ------------------------------------------------------------ G. group check */
{
  const a = { uuid: "Actor.A", name: "Ana", system: { skills: { stealth: { total: 4 } } } };
  const b = { uuid: "Actor.B", name: "Bo", system: { skills: { stealth: { total: 1 } } } };
  const c = { uuid: "Actor.C", name: "Cy", system: {} };
  equal("G1 the plan needs a real skill and someone to roll", [PK.planGroupCheck({ skill: "bogus", members: [a] }).ok, PK.planGroupCheck({ skill: "stealth", members: [] }).ok], [false, false]);
  const plan = PK.planGroupCheck({ skill: "stealth", members: [a, b, a, c], dc: "15", difficulty: "hard", rollMode: "gmroll" });
  equal("G2 the plan: the skill, each member once, the DC, the difficulty and the visibility", [plan.ok, plan.label, plan.actors.length, plan.dc, plan.difficulty, plan.rollMode], [true, "Stealth", 3, 15, "hard", "gmroll"]);
  equal("G3 no DC is allowed (as on any check), and a nonsense DC is refused", [PK.planGroupCheck({ skill: "stealth", members: [a], dc: "" }).dc, PK.planGroupCheck({ skill: "stealth", members: [a], dc: "abc" }).ok], [null, false]);
  const calls = [];
  const posted = [];
  const before = JSON.stringify([a, b, c]);
  const out = await PK.rollGroupCheck(plan, {
    roll: async (config) => { calls.push(config); return { outcome: { total: config.actor === a ? 19 : 9, degree: config.actor === a ? { key: "success", label: "Success" } : { key: "failure", label: "Failure" } } }; },
    post: async (content, mode) => { posted.push({ content, mode }); },
    partyName: "The Company"
  });
  equal("G4 each member with the skill rolls once; one without it is named, not rolled", [calls.length, out.results.map((r) => r.skipped ?? r.degree?.key)], [2, ["success", "failure", "has no such skill"]]);
  ok("G5 each roll is the ordinary skill check: type skill, the subject, the DC, the difficulty, the visibility, and NO modifiers of its own",
    calls.every((cfg) => cfg.type === "skill" && cfg.subject === "stealth" && cfg.dc === 15 && cfg.difficulty === "hard" && cfg.rollMode === "gmroll" && !("modifiers" in cfg) && cfg.toMessage === true));
  equal("G6 the summary counts each degree; it gives no group result", out.summary.counts, [{ label: "Success", count: 1 }, { label: "Failure", count: 1 }]);
  ok("G7 the card lists everyone, says the rules set no group result, and never declares one", posted.length === 1 && /Ana<\/td><td>19<\/td><td>Success/.test(posted[0].content) && /has no such skill/.test(posted[0].content)
    && /the rules set no group result/.test(posted[0].content) && !/group (succeeds|fails|passes)|party (succeeds|fails)/i.test(posted[0].content));
  equal("G8 the card goes out in the check's visibility", posted[0].mode, "gmroll");
  equal("G9 no member is changed by the check", JSON.stringify([a, b, c]), before);
  const failing = await PK.rollGroupCheck(PK.planGroupCheck({ skill: "stealth", members: [a, b] }), { roll: async (cfg) => { if (cfg.actor === a) throw new Error("x"); return { outcome: { total: 3, degree: null } }; }, post: async () => {}, partyName: "P" });
  equal("G10 a roll that fails is named, and the others still roll", failing.results.map((r) => r.skipped ?? r.total), ["the roll failed", 3]);
  equal("G11 without a DC there are totals and no degrees", PK.groupCheckSummary([{ name: "A", total: 12, degree: null }], { dc: null }).dcText, "No DC set");
  equal("G15 the DC as set and what each roll was checked against (3.713.0, found live)", [PK.groupCheckSummary([], { dc: 15, difficulty: "hard" }).dcText, PK.groupCheckSummary([], { dc: 15 }).dcText, PK.groupCheckSummary([], { dc: 15, difficulty: "veryEasy" }).dcText], ["DC 15, Hard (DC +2): 17", "DC 15", "DC 15, Very easy (DC -5): 10"]);
  ok("G12 the sheet's Group Check: the GM only, one at a time, the participants, and TRGCheck.roll", /static async groupCheck\(event\) \{\s*event\.preventDefault\(\);\s*if \(!game\.user\.isGM\) return;\s*await runOnce\(TRGPartySheet\.#running, `\$\{this\.actor\.uuid\}:groupCheck`/.test(SHEET)
    && /roll: \(config\) => TRGCheck\.roll\(config\)/.test(SHEET) && /const members = \(await this\.#participants\(\)\)\.actors;/.test(SHEET));
  ok("G13 the dialog offers the existing difficulty ladder and the chat visibilities", /difficultyOptions\(\)/.test(SHEET) && /CONFIG\.ChatMessage\?\.modes/.test(SHEET) && PK.difficultyOptions().length === 9);
  const card = PK.groupCheckCard({ partyName: "<b>P</b>", label: "Stealth", summary: PK.groupCheckSummary([{ name: "<i>x</i>", total: 1, degree: null }]) });
  ok("G14 names are escaped on the card", !/<b>P<\/b>|<i>x<\/i>/.test(card));
}

/* ------------------------------------------------------------ E. encounter */
{
  const v1 = { threat: "hard", creatures: [{ uuid: "Actor.G", count: 3 }] };
  const n = RW.normaliseEncounter(v1);
  equal("E1 a version 1 encounter reads unchanged, as version 2 with no tokens", n, { version: 2, threat: "hard", creatures: [{ uuid: "Actor.G", count: 3, tokens: [] }] });
  equal("E2 duplicates merge their counts and their tokens", RW.normaliseEncounter({ creatures: [{ uuid: "U", count: 1, tokens: ["t1"] }, { uuid: "U", count: 1, tokens: ["t1", "t2"] }] }).creatures, [{ uuid: "U", count: 2, tokens: ["t1", "t2"] }]);

  const world = (id, type = "npc") => ({ uuid: `Actor.${id}`, name: id, type, img: `${id}.png`, token: null });
  const synth = (sceneToken, base) => ({ uuid: `Scene.S.Token.${sceneToken}.Actor.${base.uuid.split(".")[1]}`, name: base.name, type: base.type, token: {}, baseActor: base });
  const goblin = world("Goblin"), ogre = world("Ogre"), hero = world("Hero", "character"), ally = world("Ally"), wolf = world("Wolf"), boss = world("Boss");
  const tok = (id, actor, extra = {}) => ({ tokenUuid: `Scene.S.Token.${id}`, token: { actor, actorLink: !actor.token, disposition: -1, name: actor.name, ...extra }, name: actor.name, ...extra });
  const sources = [
    tok("h", hero),                                     // a party member (linked)
    tok("g1", synth("g1", goblin)), tok("g2", synth("g2", goblin)),   // two unlinked goblins
    tok("o1", ogre), tok("o2", ogre),                   // two linked tokens of one ogre
    tok("a", ally, { disposition: 1 }),                 // friendly
    tok("w", wolf, { defeated: true }),                 // defeated
    tok("b", boss, { hidden: true }),                   // hidden
    { tokenUuid: "Scene.S.Token.gone", token: null, name: "Ghost" }
  ];
  const cand = RW.encounterCandidates(sources, { members: ["Actor.Hero"], encounter: RW.normaliseEncounter({}), friendly: 1 });
  const row = (id) => cand.rows.find((r) => r.tokenUuid === `Scene.S.Token.${id}`);
  ok("E3 a party member is never offered", !row("h"));
  equal("E4 two unlinked goblins are two creatures, each ticked", [row("g1").uuid !== row("g2").uuid, row("g1").ticked, row("g2").ticked], [true, true, true]);
  equal("E5 two linked tokens of one ogre: one creature, the second unticked", [row("o1").uuid, row("o2").uuid, row("o1").ticked, row("o2").ticked, row("o2").reasons], ["Actor.Ogre", "Actor.Ogre", true, false, ["another token of the same creature"]]);
  equal("E6 Graham's defaults: friendly and defeated unticked, hidden ticked and marked", [row("a").ticked, row("w").ticked, row("b").ticked, row("b").hidden], [false, false, true, true]);
  equal("E7 a missing token is named, not imported", cand.missing, ["Ghost"]);
  const picks = cand.rows.filter((r) => r.ticked);
  const first = RW.mergeEncounterImport({}, picks);
  equal("E8 the import: goblin ×1 twice (separate), the ogre once, the boss once", [first.added, first.encounter.creatures.map((c) => [c.uuid.split(".").at(-1), c.count])], [4, [["Goblin", 1], ["Goblin", 1], ["Ogre", 1], ["Boss", 1]]]);
  const again = RW.mergeEncounterImport(first.encounter, picks);
  equal("E9 the same import twice adds nothing", [again.added, again.skipped, JSON.stringify(again.encounter.creatures) === JSON.stringify(first.encounter.creatures)], [0, 4, true]);
  const cand2 = RW.encounterCandidates(sources, { members: ["Actor.Hero"], encounter: first.encounter, friendly: 1 });
  equal("E10 re-opened, the imported tokens are shown as already imported and cannot be ticked", [cand2.rows.find((r) => r.tokenUuid.endsWith("g1")).blocked, cand2.rows.find((r) => r.tokenUuid.endsWith("g1")).reasons[0]], [true, "already imported"]);
  const linkedAgain = RW.mergeEncounterImport(first.encounter, [{ uuid: "Actor.Ogre", tokenUuid: "Scene.S.Token.o2", linked: true }]);
  equal("E11 another token of a linked actor already counted is recorded, not counted", [linkedAgain.added, linkedAgain.encounter.creatures.find((c) => c.uuid === "Actor.Ogre").count], [0, 1]);
  const handAdded = RW.normaliseEncounter({ creatures: [{ uuid: "Actor.Goblin", count: 3 }] });
  const cand3 = RW.encounterCandidates([tok("g9", synth("g9", goblin))], { members: [], encounter: handAdded, friendly: 1 });
  ok("E12 a token whose actor the GM added by hand is unticked and says why", cand3.rows[0].ticked === false && /added by hand/.test(cand3.rows[0].reasons.join()));
  const raised = RW.mergeEncounterImport({ creatures: [{ uuid: "Actor.Boss", count: 5, tokens: [] }] }, [{ uuid: "Actor.Boss", tokenUuid: "t", linked: true }]);
  equal("E13 an import never lowers or replaces an entry the GM set", raised.encounter.creatures[0].count, 5);
  const writes = [];
  const party = { system: { encounter: first.encounter }, update: async (u) => { writes.push(u); } };
  equal("E14 nothing new: nothing written", [await RW.importEncounterPicks(party, picks), writes.length], [{ added: 0, skipped: 4 }, 0]);
  ok("E15 the import list is built from the combat's own combatants and their tokens, nothing in the combat changed", /const sources = Array\.from\(combat\.combatants \?\? \[\]\)\.map\(\(c\) => \(\{/.test(SHEET) && /defeated: c\.isDefeated === true/.test(SHEET) && !/combat\.(update|delete)|combatant\.(update|delete)|token\.(update|delete)/.test(SHEET));
  ok("E16 Add Selected Tokens goes through the same import", /static async addSelectedTokens\(event\) \{[\s\S]*?this\.#importSources\(/.test(SHEET) && /static async importCombat\(event\) \{[\s\S]*?this\.#importSources\(sources, "Import Combat"\)/.test(SHEET));
  ok("E17 Clear asks first and empties the list only", /static async clearEncounter\(event\) \{[\s\S]*?const ok = await DialogV2\.confirm\([\s\S]*?No actor, token or combat is deleted[\s\S]*?await this\.actor\.update\(\{ "system\.encounter\.creatures": \[\] \}\);\s*\}/.test(SHEET));
  ok("E18 the Encounter tab stays the GM's (its panel and its context)", /\{\{#if isGM\}\}\s*<section class="tab sheet-tab-panel \{\{tabs\.rewards\.cssClass\}\}"/.test(HBS) && /const rewards = isGM \? await rewardsContext/.test(SHEET) && /tabs: config\.tabs\.filter\(\(tab\) => tab\.id !== "rewards"\)/.test(SHEET));
  ok("E19 the existing rewards are all still there: encounter XP, accomplishments, custom XP, treasure, Begin Session", ["awardEncounterXP", "awardAccomplishment", "awardCustomXP", "beginSession", "importCombat", "addSelectedTokens", "clearEncounter"].every((a) => HBS.includes(`data-action="${a}"`)) && /Treasure by Level/.test(HBS));
}

/* ------------------------------------------------------------ N. notes */
{
  ok("N1 the Notes tab edits the party's own field, system.details.notes, with v14's editor, for the GM", /\{\{#if notes\.editable\}\}[\s\S]*?<prose-mirror name="system\.details\.notes" value="\{\{notes\.raw\}\}" toggled>\{\{\{notes\.html\}\}\}<\/prose-mirror>/.test(HBS));
  ok("N2 players read it, enriched, with secret blocks shown to the GM only", /\{\{else\}\}[\s\S]*?<div class="party-notes-view">\{\{\{notes\.html\}\}\}<\/div>/.test(HBS) && /enrichHTML\(notesRaw, \{\s*secrets: isGM/.test(SHEET) && /editable: isGM && this\.isEditable/.test(SHEET));
  ok("N3 the field is the existing one (template.json), not a new or repurposed one", JSON.parse(read("template.json")).Actor.party.details.notes === "" && !/system\.gm\.|gmNotes/.test(HBS));
  ok("N4 a change writes only the field that changed, so saving notes never writes stale coin", /_processFormData\(event, form, formData\) \{\s*const data = super\._processFormData\(event, form, formData\);\s*const name = event\?\.type === "change" \? event\.target\?\.name : null;/.test(SHEET)
    && /return foundry\.utils\.expandObject\(\{ \[name\]: foundry\.utils\.getProperty\(data, name\) \}\);/.test(SHEET));
  ok("N5 live renders wait while the editor is open or a field is focused", /if \(root\.querySelector\("prose-mirror\[open\], prose-mirror\.active"\)\) return true;/.test(SHEET) && /active\.isContentEditable/.test(SHEET) && /this\.element\?\.addEventListener\("close", done, \{ once: true \}\);/.test(SHEET));
}

/* ------------------------------------------------------------ T. tabs and toolbar */
{
  const ids = [...SHEET.matchAll(/\{ id: "([a-z]+)", icon: "fa-solid [a-z-]+", label: "([A-Za-z]+)" \}/g)].map((m) => `${m[1]}:${m[2]}`);
  equal("T1 the five areas, in order", ids, ["roster:Overview", "skills:Skills", "loot:Inventory", "rewards:Encounter", "notes:Notes"]);
  equal("T2 each has its panel", ["roster", "skills", "loot", "rewards", "notes"].map((t) => HBS.includes(`data-tab="${t}"`)), [true, true, true, true, true]);
  ok("T3 every panel scrolls on its own and keeps its place", /scrollable: \['section\[data-tab="roster"\]', 'section\[data-tab="skills"\]', '\.party-skills-scroll', 'section\[data-tab="loot"\]', 'section\[data-tab="rewards"\]', 'section\[data-tab="notes"\]'\]/.test(SHEET));
  const bar = HBS.slice(HBS.indexOf('class="party-toolbar"'), HBS.indexOf("<nav"));
  ok("T4 Group Check on the toolbar, inside the GM block, in PARTY_TOOLBAR_ACTIONS's order", bar.indexOf('data-action="groupCheck"') > bar.indexOf('data-action="partyTravel"') && bar.indexOf('data-action="groupCheck"') < bar.indexOf('data-action="beginSession"') && !/data-player-ok[^>]*data-action="groupCheck"/.test(bar));
  ok("T5 every new action is registered on the sheet", ["sortSkills", "rollMemberSkill", "groupCheck", "importCombat"].every((a) => new RegExp(`${a}: TRGPartySheet\\.${a}`).test(SHEET)));
  ok("T6 no Font Awesome Pro-only icon", !/fa-swords/.test(HBS + SHEET));
}

/* ------------------------------------------------------------ Z. version */
{
  const sys = JSON.parse(read("system.json"));
  equal("Z1 the version is 3.713.0, the download names it, and package.json agrees",
    [sys.version, sys.download.includes("/v3.719.1/"), JSON.parse(read("package.json")).version], ["3.719.1", true, "3.719.1"]);
}

if (failures.length) {
  console.log(`verify-party-sheet-stage5: ${failures.length} of ${checks} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log(`verify-party-sheet-stage5: ${checks} checks — all green.`);
}
