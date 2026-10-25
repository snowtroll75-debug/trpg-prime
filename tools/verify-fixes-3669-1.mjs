#!/usr/bin/env node
/**
 * verify-fixes-3669-1 — TRG Prime 3.669.1: what the Inner Tempest 0.6.0
 * live tests of 24 October 2026 found in 3.669.0, and Graham's B5-5.
 *
 *   A  a Blunder is offered the fumble reroll too (B5-5)
 *   B  a reroll that needs the reaction is neither offered nor made when the
 *      reaction cannot be spent (Battle Readiness); spendReaction says
 *      whether it spent, and modules spend through it
 *   C  a shared roll asks for conviction once, and carries its die
 *   D  a day's first that sets the degree without reading the dice asks for
 *      no conviction
 *   E  a player's move while the game is paused charges nothing
 *   F  Aid Another names its action, so a declaration's tick is asked
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

/* A — B5-5 */
const ck = read("module", "dice", "check.mjs");
ok("A1 a skill check or save that comes out a Fumble or a Blunder is offered the reroll",
  /!check\.fumbleRerolled && !check\.presetDice && \["skill", "save"\]\.includes\(check\.type\)\n\s*&& \["fumble", "blunder"\]\.includes\(check\.outcome\?\.degree\?\.key\)\) \{/.test(ck));

/* B — the reaction, as spending it would see it */
const warned = [];
globalThis.ui = { notifications: { warn: (m) => warned.push(m) } };
let inCombat = true;
globalThis.game = { get combat() { return inCombat ? { started: true } : null; } };
const apw = await imp("combat/action-points-workflow.mjs");
const fighter = (spentNonMartial, reactions = 2) => {
  const flags = { nonMartialReactionSpent: spentNonMartial };
  const actor = {
    name: "Fuku", inCombat: true,
    items: [{ type: "ability", name: "Battle Readiness" }],
    system: { resources: { reactions: { value: reactions } } },
    getFlag: (_s, k) => flags[k],
    setFlag: async (_s, k, v) => { flags[k] = v; },
    update: async (d) => { actor.system.resources.reactions.value = d["system.resources.reactions.value"]; }
  };
  return actor;
};
equal("B1 the refusal: none for a fresh Fighter; Battle Readiness's left and a reaction without Attack or Martial; none left; none out of combat",
  [apw.reactionRefusal(fighter(false), "Chance, Focus"), Boolean(apw.reactionRefusal(fighter(true), "Chance, Focus")), apw.reactionRefusal(fighter(true), "Attack, Focus"), Boolean(apw.reactionRefusal(fighter(false, 0), "")), (() => { inCombat = false; const r = apw.reactionRefusal(fighter(false, 0), ""); inCombat = true; return r; })()],
  ["", true, "", true, ""]);
{
  const blocked = fighter(true);
  const spentBlocked = await apw.spendReaction(blocked, "Fortune's Reversal", { traits: "Chance, Focus" });
  const free = fighter(false);
  const spentFree = await apw.spendReaction(free, "Fortune's Reversal", { traits: "Chance, Focus" });
  const none = fighter(false, 0);
  const spentNone = await apw.spendReaction(none, "X", { traits: "Attack" });
  inCombat = false; const out = await apw.spendReaction(fighter(false, 0), "X"); inCombat = true;
  equal("B2 spendReaction resolves whether it spent: refused by Battle Readiness (pool untouched), spent, none left, out of combat",
    [spentBlocked, blocked.system.resources.reactions.value, spentFree, free.system.resources.reactions.value, spentNone, out], [false, 2, true, 1, false, true]);
}
const frw = read("module", "fumble-reroll-workflow.mjs");
ok("B3 the reroll is offered only when its reaction could be spent, read with the item's traits",
  /return !\(reaction && reactionRefusal\(actor, String\(item\.system\?\.traits \?\? ""\)\)\);/.test(frw));
ok("B4 and nothing is rerolled, nor the use spent, when the reaction is refused (found live)",
  /if \(row\.reaction && inCombat && !\(await spendReaction\(actor, row\.label, \{ traits: String\(row\.item\.system\?\.traits \?\? ""\) \}\)\)\) return null;\n  const max = itemUsesMax\(row\.item\);/.test(frw));
const apiw = read("module", "module-api-workflow.mjs");
ok("B5 a module spends the reaction through the system, and may ask first",
  /spendReaction: async \(\.\.\.args\) => \{ const \{ spendReaction \} = await import\("\.\/combat\/action-points-workflow\.mjs"\); return spendReaction\(\.\.\.args\); \},/.test(apiw)
  && /reactionRefusal: async \(\.\.\.args\) => \{ const \{ reactionRefusal \} = await import\("\.\/combat\/action-points-workflow\.mjs"\); return reactionRefusal\(\.\.\.args\); \},/.test(apiw));

/* C — a shared roll */
const offer = ck.slice(ck.indexOf("async function offerConvictionBonusNow(check) {"), ck.indexOf("async function askPerceptionSense"));
ok("C1 a check meeting another's die is never asked, before anything else is read",
  /async function offerConvictionBonusNow\(check\) \{\n(?:\s*\/\/[^\n]*\n)+\s*if \(check\.presetDice\) \{\n\s*check\.convictionDecided = true;/.test(offer));
ok("C2 …and meets the first one's +1d6 when it was spent",
  /if \(check\.presetConvictionDie > 0 && check\.outcome\) \{\n\s*check\.applyExtraModifier\(\{ label: "Conviction \(\+1d6, the shared roll's\)", value: check\.presetConvictionDie, type: "untyped" \}\);/.test(offer));
ok("C3 the first check records its die",
  /check\.convictionBonusSpent = true;\n\s*check\.convictionDie = roll\.total;/.test(offer)
  && /this\.presetConvictionDie = Math\.max\(0, Math\.trunc\(Number\(config\.presetConvictionDie\) \|\| 0\)\);/.test(ck));
const acw = read("module", "combat", "action-workflow.mjs");
ok("C4 resolveAction hands the die on with the dice", /presetConvictionDie = 0,?\n(?:\s*\/\/[^\n]*\n)*(?:\s*presetModifiers = null\n)?\} = \{\}\) \{/.test(acw) && /\.\.\.\(presetDice \? \{ presetDice, presetConvictionDie \} : \{\}\),/.test(acw));

/* D — an exact first */
const df = await imp("daily-firsts.mjs");
const carriers = [{ name: "Tianzhi Discipline", flags: { "trg-prime": { dailyFirst: [{ action: "refocus", set: "critical", exact: true, label: "Tianzhi Discipline" }] } } }];
const notExact = [{ name: "Centred", flags: { "trg-prime": { dailyFirst: [{ action: "refocus", set: "success", label: "Centred" }] } } }];
equal("D1 an unspent exact first is known before the roll; spent, inexact or another action is not",
  [df.dailyFirstExact(carriers, "refocus"), df.dailyFirstExact(carriers, "refocus", true), df.dailyFirstExact(notExact, "refocus"), df.dailyFirstExact(carriers, "demoralise")],
  ["Tianzhi Discipline", null, null, null]);
ok("D2 its roll allows no conviction (found live: the +1d6 was offered on dice not read)",
  /const exactFirst = dailyFirstExact\(declarationCarriers\(actor\), action\.key, dailyFirstSpent\(actor\.flags\?\.\[SYSTEM_ID\], action\.key\)\);/.test(acw)
  && /\.\.\.\(exactFirst \? \{ allowConviction: false(?:, declaredDegree: exactDegree)? \} : \{\}\),/.test(acw));

/* E — paused */
const mw = read("module", "combat", "movement-workflow.mjs");
ok("E1 a player's move while paused is let through to Foundry's refusal before anything is charged, the GM's is not",
  /function movePausedForUser\(gameLike\) \{\n  return Boolean\(gameLike\?\.paused\) && !gameLike\?\.user\?\.isGM;\n\}/.test(mw)
  && /function onPreMoveToken\(tokenDocument, movement\) \{\n  if \(RESIZING\.has\(tokenDocument\?\.id\)\) return true;\n(?:\s*\/\/[^\n]*\n)+\s*if \(movePausedForUser\(globalThis\.game\)\) return true;\n/.test(mw));

/* F — Aid Another */
const sk = read("module", "skills.mjs");
ok("F1 Aid Another's check carries its action key", /label: `Aid Another — \$\{label\}`,\n(?:\s*\/\/[^\n]*\n)+\s*actionKey: "aidAnother",/.test(sk));
ok("F2 …and a roll that opens no dialog asks the ticks that match it", /const \{ offerConditionalsOnRoll \} = await import\("\.\/offered-conditionals\.mjs"\);/.test(ck) && /actionKey: check\.actionKey,/.test(ck));

const EXPECTED = 16;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-fixes-3669-1: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-fixes-3669-1: ${checks} checks — all green.`);
