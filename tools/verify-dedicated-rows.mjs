#!/usr/bin/env node
/**
 * verify-dedicated-rows — 3.666.3: Graham's two reports of 22 October 2026.
 *
 *   A  "lots of duplicates and this is not a Detect Deception check so should
 *      not even apply here": the generic outcome reader no longer queues a
 *      copy of a row a dedicated rule applies (Detect Deception, Aid)
 *   B  a queued row that names its own action is offered only on it
 *   C  a lasting modifier is queued once; the copies on sheets are cleared by
 *      a migration pass, gated where the stamp reaches it
 *   D  "Some attack spells are not asking for a target": the target picker no
 *      longer returns in silence when the player's screen holds no tokens
 *   E  …and the cause, found logged in as Lewi: a V14 scene's LEVELS. Every
 *      token on Oldwatch Main stands on "Upper Signal Room", and a client opens
 *      on the default level, which draws none of them. The picker moves to the
 *      caster's level, offers the others by name, and a player's screen opens
 *      on their own token's level
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

const dr = await mod("combat", "dedicated-rows.mjs");
const { extractModifier } = await mod("outcome-effects.mjs");
const { SKILL_ACTIONS } = await mod("data", "skill-actions.mjs");
const { BASIC_ACTIONS } = await mod("data", "basic-actions.mjs");
const tables = [...SKILL_ACTIONS, ...BASIC_ACTIONS];
const act = (key) => tables.find((a) => a.key === key);

/* A */
equal("A1 THE COMPLAINT: Detect Deception's rows are left to its own rule; so are Aid's",
  ["detectDeception", "aidDefensive", "aidOffensive"].map((k) => dr.readsGenericModifier(act(k))), [false, false, false]);
equal("A2 every other action's rows are still read; a module's outcomesApplied action is not",
  [dr.readsGenericModifier(act("subsist")), dr.readsGenericModifier(act("treatDisease")), dr.readsGenericModifier(act("grappleAttack")), dr.readsGenericModifier({ key: "evade", outcomesApplied: true })],
  [true, true, true, false]);
ok("A3 every dedicated action really is one the tables carry (no dead name)",
  dr.DEDICATED_MODIFIER_ACTIONS.every((k) => Boolean(act(k))));
const aw = read("module", "combat", "action-workflow.mjs");
ok("A4 the action workflow asks it before queueing anything",
  /const modifier = readsGenericModifier\(action\) \? extractModifier\(outcome\.text\) : null;/.test(aw) && !/const modifier = action\.outcomesApplied \? null : extractModifier/.test(aw));
ok("A5 the dedicated Detect Deception rule is still there: the -4 against that target, cleared by a Critical",
  /if \(action\.key === "detectDeception" && targetActor && degree\) \{[\s\S]{0,200}withMisread\(held, targetActor\.uuid, degree\)/.test(aw));

/* B */
equal("B1 a row naming its own action is scoped to it (Subsist); one naming a save is not (Treat Disease)",
  [dr.scopeNamesAction(extractModifier(act("subsist").outcomes.fumble).scope, "Subsist"), dr.scopeNamesAction(extractModifier(act("treatDisease").outcomes.success).scope, "Treat Disease")],
  [true, false]);
ok("B2 the reader queues it with that action, and never for a modifier the TARGET holds",
  /\.\.\.\(modifier\.subject !== "target" && scopeNamesAction\(modifier\.scope, action\.name\) \? \{ actions: \[action\.key\] \} : \{\}\)/.test(aw));
equal("B3 an entry naming an action is offered only on that action's checks; one naming none, everywhere",
  [dr.pendingFitsCheck({ actions: ["subsist"] }, "subsist"), dr.pendingFitsCheck({ actions: ["subsist"] }, ""), dr.pendingFitsCheck({ actions: ["subsist"] }, "balance"), dr.pendingFitsCheck({}, "balance")],
  [true, false, false, true]);
const dlg = read("module", "apps", "check-dialog.mjs");
const chk = read("module", "dice", "check.mjs");
ok("B4 the roll dialog offers only the entries that fit, and the automatic path takes only those",
  /pendingModifierRows\(actor\)\.filter\(\(row\) => pendingFitsCheck\(row, actionKey\)\)/.test(dlg)
  && /&& pendingFitsCheck\(row, check\.actionKey \?\? ""\)\);/.test(chk));
const pm = read("module", "pending-modifiers.mjs");
ok("B5 the record keeps the actions it was given", /if \(Array\.isArray\(entry\?\.actions\) && entry\.actions\.length\) record\.actions = entry\.actions\.map\(String\);/.test(pm));

/* C */
const ddEntry = (id) => ({ id, value: -4, type: "circumstance", label: "Detect Deception", scope: extractModifier(act("detectDeception").outcomes.fumble).scope, oneShot: false });
const keldran = [ddEntry("a"), ddEntry("b"), ddEntry("c"), { id: "s1", value: -2, type: "circumstance", label: "Subsist", scope: "to Subsist checks for 1 week, and you find no food at all", oneShot: false }, { id: "s2", value: -2, type: "circumstance", label: "Subsist", scope: "to Subsist checks for 1 week, and you find no food at all", oneShot: false }, { id: "t1", value: 2, type: "circumstance", label: "Treat Disease", scope: "to its next saving throw against the disease", oneShot: true }, { id: "t2", value: 2, type: "circumstance", label: "Treat Disease", scope: "to its next saving throw against the disease", oneShot: true }];
equal("C1 KELDRAN: every queued copy of Detect Deception's row is stale; nothing else is",
  dr.staleDedicatedCopies(keldran, tables, extractModifier), ["a", "b", "c"]);
equal("C2 a lasting modifier queued twice is one too many; a next-roll one may be owed twice",
  dr.lastingDuplicateIds(keldran.filter((e) => !["a", "b", "c"].includes(e.id))), ["s2"]);
equal("C3 queueing the same lasting modifier again finds the first; a next-roll one, or one on a clock, does not",
  [dr.duplicateLasting({ value: -2, type: "circumstance", label: "Subsist", scope: keldran[3].scope }, keldran)?.id, dr.duplicateLasting({ ...keldran[5], id: undefined }, keldran), dr.duplicateLasting({ ...keldran[3], turns: 2 }, keldran)],
  ["s1", null, null]);
ok("C4 addPendingModifier asks it before writing", /const same = duplicateLasting\(\{ \.\.\.entry, kind \}, existing\);\s*if \(same\) return same;/.test(pm));
const mig = read("module", "migration.mjs");
ok("C5 a migration pass clears both kinds from characters and placed creatures, and reports what it removed",
  /runIf\("3\.666\.3", "queued copies of Detect Deception and Aid rows, and repeated lasting modifiers",\s*\(\) => migrateStalePendingCopies\(actors, tokenActors\)\)\)/.test(mig)
  && /const stale = new Set\(staleDedicatedCopies\(entries, tables, extractModifier\)\);[\s\S]{0,200}for \(const id of lastingDuplicateIds\(left\)\) stale\.add\(id\);/.test(mig)
  && /result\.stalePending\?\.length/.test(mig));
// THE STAMP MAY MOVE ON PAST THE PASS (3.666.4 raised it for the baked
// defence lists); what matters is that it reaches 3.666.3.
ok("C6 the schema stamp reaches the pass", (() => {
  const m = /export const TRG_SCHEMA_VERSION = "(\d+)\.(\d+)\.(\d+)";/.exec(mig);
  if (!m) return false;
  const [a, b, c] = m.slice(1).map(Number);
  return a > 3 || (a === 3 && (b > 666 || (b === 666 && c >= 3)));
})());

/* D */
const tp = await mod("combat", "target-prompt.mjs");
ok("D1 THE COMPLAINT: no tokens on the player's scene is said, naming the scene and the GM's active one",
  /no tokens on the scene you are viewing \(Map\)/.test(tp.noCandidatesText({ sceneName: "Map", activeName: "Oldwatch Main" })) && /The GM's active scene is Oldwatch Main\./.test(tp.noCandidatesText({ sceneName: "Map", activeName: "Oldwatch Main" })));
ok("D2 …and a canvas switched off is named as the reason", /Disable Game Canvas/.test(tp.noCandidatesText({ canvasOff: true })));
const tg = read("module", "combat", "targeting.mjs");
ok("D3 the picker asks rather than returning in silence, and only \"continue\" goes on",
  /for \(let pass = 0; !candidates\.length && pass < 3; pass \+= 1\) \{[\s\S]{0,1500}const goOn = await DialogV2\.wait\(\{[\s\S]{0,900}noCandidatesText\(\{[\s\S]{0,1200}return goOn === "continue";\s*\}\s*if \(!candidates\.length\) return false;/.test(tg)
  && !/if \(!candidates\.length\) \{\s*\/\/ Nothing to target on this scene — nothing to prompt for either\.\s*return true;/.test(tg));

/* E */
const sceneTokens = [
  { id: "t1", actorId: "borin", level: "upper" }, { id: "t2", actorId: "joe", level: "upper" },
  { id: "t3", actorId: "elf", level: "upper" }, { id: "t4", actorId: "rat", level: "cellar" }
];
equal("E1 LEWI: viewing the default level, Borin's own level is the one to view; already there, or no levels, nothing",
  [tp.levelForActor({ tokens: sceneTokens, actorId: "borin", viewedLevel: "default" }), tp.levelForActor({ tokens: sceneTokens, actorId: "borin", viewedLevel: "upper" }), tp.levelForActor({ tokens: sceneTokens, actorId: "borin", viewedLevel: null })],
  ["upper", null, null]);
equal("E2 an unlinked creature is found by its own token, not by its actor", tp.levelForActor({ tokens: [...sceneTokens, { id: "t5", actorId: "rat", level: "upper" }], actorId: "rat", tokenId: "t5", viewedLevel: "cellar" }), "upper");
equal("E3 the other levels holding tokens, most first, never the one being viewed",
  [tp.levelsWithTokens(sceneTokens, "default"), tp.levelsWithTokens(sceneTokens, "upper")],
  [[{ level: "upper", count: 3 }, { level: "cellar", count: 1 }], [{ level: "cellar", count: 1 }]]);
ok("E4 the explanation names the other level first", /tokens are on another level: Upper Signal Room \(7\)/.test(tp.noCandidatesText({ sceneName: "Oldwatch Main, Level", otherLevels: ["Upper Signal Room (7)"] })));
ok("E5 the picker moves to the caster's level before it says anything, then offers each other level as a button that views it and asks again",
  /if \(!candidates\.length && await viewActorLevel\(actor\)\) \{\s*actorToken = activeToken\(actor\);\s*candidates = candidateTokens\(\);/.test(tg)
  && /action: `level:\$\{level\}`/.test(tg)
  && /if \(typeof goOn === "string" && goOn\.startsWith\("level:"\)\) \{\s*await scene\.view\(\{ level: goOn\.slice\("level:"\.length\) \}\);[\s\S]{0,120}continue;/.test(tg));
const lv = read("module", "combat", "level-view-workflow.mjs");
const bootSrc = read("scripts", "trg-prime.mjs");
ok("E6 a player's screen opens on their own token's level; the GM is never moved, a player looking at their own token is left alone, and a refused view is not retried",
  /if \(!globalThis\.game\?\.user \|\| game\.user\.isGM\) return;/.test(lv)
  && /if \(tokens\.some\(\(t\) => t\.isOwner && t\.level === cnv\.level\.id\)\) return;/.test(lv)
  && /if \(available && !available\.includes\(level\)\) return;/.test(lv)
  && /if \(tried\.has\(key\)\) return;\s*tried\.add\(key\);\s*await scene\.view\(\{ level \}\);/.test(lv)
  && /Hooks\.on\("canvasReady", \(cnv\) => \{ viewOwnLevel\(cnv\); \}\);/.test(lv)
  && /\n  registerOwnLevelView\(\);\n/.test(bootSrc));

const EXPECTED = 26;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-dedicated-rows: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-dedicated-rows: ${checks} checks — all green.`);
