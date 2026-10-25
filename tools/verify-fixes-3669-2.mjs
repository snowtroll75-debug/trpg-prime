#!/usr/bin/env node
/**
 * verify-fixes-3669-2 — TRG Prime 3.669.2: what the live test of 3.669.1
 * with Inner Tempest 0.6.1 found (24 October 2026), and Graham's ruling
 * of the same day on Aid Another's ticks (option (a)).
 *
 *   A  Aid Another's own dialog asks the ticks that match it, and the roll
 *      applies the answer (Hive Coordination's +2 was never asked: the small
 *      prompt asks on a weapon attack or Spellcraft only)
 *   B  a day's first declared `exact` is declared at its degree before the
 *      dice are read: its card no longer shows the dice's own degree
 *   C  a Blunder offered the fumble reroll is called a Blunder
 *   D  a defence reaction is offered only when spending it would be allowed
 *      (Battle Readiness's extra reaction: Attack or Martial only)
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

/* A — Aid Another's ticks */
const cond = await imp("conditionals.mjs");
const aid = await imp("skill-aid.mjs");
const oc = await imp("dice/offered-conditionals.mjs");
const hive = { id: "hive", name: "Hive Coordination", type: "feat", flags: { "trg-prime": { conditionals: [{ auto: false, kind: "modifier", label: "Hive Coordination", scope: "Aid for a creature that understands Scree Cant — tick if so", type: "racial", value: 2, when: { actions: ["aidOffensive", "aidDefensive", "aidAnother", "aid"] } }] } } };
const eyes = { id: "eyes", name: "Compound <Eyes>", type: "ability", flags: { "trg-prime": { conditionals: [{ auto: false, kind: "modifier", label: "Compound <Eyes>", scope: "Visual Perception", type: "racial", value: 1, when: { checkTypes: ["skill"], subjects: ["perception"] } }] } } };
const always = { id: "always", name: "Steady", type: "feat", flags: { "trg-prime": { conditionals: [{ auto: true, kind: "modifier", label: "Steady", type: "untyped", value: 1, when: { actions: ["aidAnother"] } }] } } };
const entries = cond.collectConditionals([hive, eyes, always], [], [], {});
const skills = ["athletics", "perception", "stealth"];
const rowsBySkill = Object.fromEntries(skills.map((k) => [k, cond.conditionalRows(entries, { checkType: "skill", subject: k, actionKey: "aidAnother" })]));
const tickRows = aid.aidTickRows(rowsBySkill);
equal("A1 the ticks asked: each unticked row once, with every skill it matches; an `auto` row is applied unasked, not asked",
  tickRows.map((r) => [r.id, r.skills]), [["hive-0", ["athletics", "perception", "stealth"]], ["eyes-0", ["perception"]]]);
const block = aid.aidTickBlock(tickRows, "athletics");
ok("A2 the dialog's block: one unticked box per row, those for another skill hidden inline (the dialog's rows are display:flex), names escaped",
  (block.match(/<input type="checkbox" name="aidTick" value="/g) ?? []).length === 2
  && !/ checked/.test(block)
  && /data-skills="perception" style="display:none"><input type="checkbox" name="aidTick" value="eyes-0">/.test(block)
  && /data-skills="athletics,perception,stealth"><input type="checkbox" name="aidTick" value="hive-0">/.test(block)
  && block.includes("Compound &lt;Eyes&gt;") && !block.includes("<Eyes>")
  && aid.aidTickBlock([{ id: 'a"b', detail: "", summary: "", skills: ["x"] }], "x").includes('value="a&quot;b"')
  // A plain block, not the dialog's two-column form-group (found in review).
  && /^<p [^>]*><strong>Racial, feature &amp; equipment bonuses<\/strong><\/p><div class="trg-conditional-modifiers">/.test(block) && !/form-group/.test(block));
equal("A2 …and nothing at all when no row matches", aid.aidTickBlock([], "athletics"), "");
equal("A3 the ticks that reach the roll: those for the skill picked, nothing invented",
  [aid.aidTicksFor(tickRows, ["hive-0", "eyes-0", "made-up"], "athletics"), aid.aidTicksFor(tickRows, ["hive-0", "eyes-0"], "perception"), aid.aidTicksFor(tickRows, undefined, "perception")],
  [["hive-0"], ["hive-0", "eyes-0"], []]);
equal("A4 the small prompt still asks on a weapon attack and a Spellcraft check only (23 October)",
  [oc.shouldOffer({ checkType: "skill", count: 1 }), oc.shouldOffer({ checkType: "attack", count: 1 }), oc.shouldOffer({ checkType: "spellcraft", count: 1 })],
  [false, true, true]);
{
  // Driven: the roll engine meets an Aid Another check carrying its answer.
  const BIAS = { NORMAL: "normal", ADVANTAGE: "advantage", DISADVANTAGE: "disadvantage" };
  const context = { checkType: "skill", subject: "athletics", actionKey: "aidAnother" };
  const make = (choices) => ({ type: "skill", conditionalChoices: choices, conditionalsResolved: false, flat: false, offerConditionals: true, modifiers: [], bias: "normal", actor: { isOwner: true, effects: { get: () => null } } });
  const answered = make(["hive-0", "eyes-0"]);
  await oc.offerConditionalsOnRoll(answered, entries, context, BIAS);
  const unanswered = make(null);
  await oc.offerConditionalsOnRoll(unanswered, entries, context, BIAS);
  const resolved = { ...make(["hive-0"]), conditionalsResolved: true };
  await oc.offerConditionalsOnRoll(resolved, entries, context, BIAS);
  const flat = { ...make(["hive-0"]), flat: true };
  await oc.offerConditionalsOnRoll(flat, entries, context, BIAS);
  const noRow = make(["hive-0"]);
  await oc.offerConditionalsOnRoll(noRow, entries, { checkType: "skill", subject: "athletics", actionKey: "demoralise" }, BIAS);
  equal("A5 Aid Another's answer is applied by the roll (+2 race, Hive Coordination); a tick for another skill is not; unanswered, a skill check is not asked; not over a dialog's own answer, on a flat check, or where no row matches",
    [answered.modifiers, unanswered.modifiers, unanswered.conditionalChoices, resolved.modifiers, flat.modifiers, noRow.modifiers], [[{ label: "Hive Coordination", value: 2, type: "race" }], [], null, [], [], []]);
}
const sk = read("module", "skills.mjs");
ok("A6 the dialog collects the entries as the roll does, and asks each skill's rows for Aid Another",
  /const aidEntries = collectConditionals\(\n\s*Array\.from\(actor\.items \?\? \[\]\),\n\s*Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\),\n\s*\[\.\.\.\(actor\.system\?\.combat\?\.runeConditionals \?\? \[\]\), \.\.\.allyAuraConditionalsFor\(actor\)\],\n\s*scalingFor\(actor\)\n\s*\);/.test(sk)
  && /\[key, conditionalRows\(aidEntries, \{ checkType: "skill", subject: key, actionKey: "aidAnother" \}\)\]/.test(sk));
ok("A7 the block is in the dialog, the ticked boxes are returned, and a tick follows the skill picked",
  /\$\{aidTickBlock\(tickRows, firstSkill\)\}/.test(sk)
  && /const ticks = Array\.from\(form\?\.querySelectorAll\?\.\('input\[name="aidTick"\]:checked'\) \?\? \[\]\)\.map\(\(input\) => input\.value\);\n\s*return \{ \.\.\.new FDE\(form\)\.object, ticks \};/.test(sk)
  && /row\.style\.display = shown \? "" : "none";\n\s*if \(!shown\) \{ const box = row\.querySelector\("input"\); if \(box\) box\.checked = false; \}/.test(sk)
  && /select\.addEventListener\("change", follow\);/.test(sk));
ok("A8 …and the answer reaches the roll", /conditionalChoices: aidTicksFor\(tickRows, result\.ticks, skillKey\),/.test(sk));

/* B — an exact first, declared */
const df = await imp("daily-firsts.mjs");
const tianzhi = [{ name: "Tianzhi Discipline", flags: { "trg-prime": { dailyFirst: [{ action: "refocus", set: "critical", exact: true, label: "Tianzhi Discipline" }] } } }];
const centred = [{ name: "Centred", flags: { "trg-prime": { dailyFirst: [{ action: "refocus", set: "success", label: "Centred" }] } } }];
equal("B1 the degree an unspent exact first sets; none when spent, inexact, or for another action",
  [df.dailyFirstExactDegree(tianzhi, "refocus"), df.dailyFirstExactDegree(tianzhi, "refocus", true), df.dailyFirstExactDegree(centred, "refocus"), df.dailyFirstExactDegree(tianzhi, "demoralise")],
  ["critical", null, null, null]);
const acw = read("module", "combat", "action-workflow.mjs");
ok("B2 the action hands the degree to the check with the dice it does not read",
  /const exactDegree = exactFirst \? dailyFirstExactDegree\(declarationCarriers\(actor\), action\.key\) : null;/.test(acw)
  && /\.\.\.\(exactFirst \? \{ allowConviction: false, declaredDegree: exactDegree \} : \{\}\),/.test(acw));
const ck = read("module", "dice", "check.mjs");
const declareAt = ck.indexOf("if (check.declaredDegree && !check.flat && check.outcome?.degree?.key) {");
ok("B3 the check declares it before anybody reads the dice: degree set, marked declared, every fortune closed",
  /this\.declaredDegree = config\.declaredDegree \? String\(config\.declaredDegree\) : "";/.test(ck)
  && /if \(check\.declaredDegree && !check\.flat && check\.outcome\?\.degree\?\.key\) \{\n\s*const \{ declaredAt \} = await import\("\.\.\/magic\/save-convert\.mjs"\);\n\s*const set = declaredAt\(check\.outcome, check\.declaredDegree\);\n\s*if \(set !== check\.outcome\) \{\n\s*check\.outcome = set;\n\s*check\.luckUsed = true;\n\s*check\.saveReactionResolved = true;/.test(ck));
ok("B4 …ahead of the conviction offer, Fate's declared Success and the fumble reroll",
  declareAt > 0
  && declareAt < ck.indexOf("if (check.actor && !check.flat) await offerConvictionBonusNow(check);")
  && declareAt < ck.indexOf("const { offerFateDeclare } = await import")
  && declareAt < ck.indexOf("const { offerFumbleReroll } = await import"));
ok("B5 Fate's declared Success is not offered over a degree already declared",
  /if \(check\.actor && !check\.flat && !check\.chanceUsed && !check\.outcome\?\.declared && check\.outcome\?\.degree\?\.key\) \{\n\s*const \{ offerFateDeclare \}/.test(ck));
{
  const sc = await imp("magic/save-convert.mjs");
  const fumble = { degree: { key: "fumble", label: "Fumble" }, total: 6, margin: -18, bonusCheck: -2 };
  const set = sc.convertedOutcome(fumble, "critical");
  equal("B6 a Fumble declared a Critical reads as a Critical (and an unknown degree changes nothing)", [set.degree.key, sc.convertedOutcome(fumble, "nonsense") === fumble], ["critical", true]);
  const chaotic = { ...fumble, chaos: true };
  const declared = sc.declaredAt(chaotic, "critical");
  const noDC = { degree: null, total: 6, margin: null, chaos: false };
  equal("B6 declared: the degree set, marked declared, no shift said, no Chaos banner on dice nobody reads; nothing yet without a degree or with an unknown key",
    [declared.degree.key, declared.declared, declared.shiftedFrom, declared.chaos, sc.declaredAt(noDC, "critical") === noDC, sc.declaredAt(fumble, "nonsense") === fumble],
    ["critical", true, undefined, false, true, true]);
}
const cci = read("module", "dice", "check-card-interactions.mjs");
ok("B7 a DC the GM sets after the roll declares it too (found in review): the card carries the degree, its rebuilt outcome is declared, and the held-over outcome reads it",
  /declaredDegree: this\.declaredDegree \|\| "",/.test(ck)
  && /const outcome = raw\.declaredDegree \? declaredAt\(shifted, raw\.declaredDegree\) : shifted;/.test(cci)
  && /const read = raw\.declaredDegree \? declaredAt\(outcome, raw\.declaredDegree\) : outcome;\n\s*await resumeActionOutcome\(\n\s*pending, read\.degree\?\.key \?\? null, read\.margin \?\? null\n\s*\);/.test(cci));
ok("B7 …and its card offers no +1d6", /!raw\.luckUsed &&\n(?:\s*\/\/[^\n]*\n)*\s*!raw\.declaredDegree &&/.test(cci) && /if \(raw\.bonusUsed\) return;\n(?:\s*\/\/[^\n]*\n)*\s*if \(raw\.declaredDegree\) return;/.test(cci));
ok("B8 nothing spent before the dice on an exact first (found in review): no conviction Advantage, no Luck from the dialog or armed on the sheet",
  /convictionAdvantage: !exactFirst && Boolean\(situational\?\.convictionAdvantage\),\n\s*useLuck: !exactFirst && Boolean\(situational\?\.useLuck\),/.test(acw)
  && /if \(check\.convictionAdvantage && check\.actor && !check\.declaredDegree\) \{/.test(ck)
  && /if \(check\.actor && !check\.flat && check\.type !== "luck" && !check\.declaredDegree(?: && !check\.presetModifiers)?\) \{\n\s*const \{ applyLuckToCheck \}/.test(ck));

/* C — a Blunder called one */
const fr = await imp("fumble-reroll.mjs");
equal("C1 the words follow the degree", [fr.fumbleWords("blunder"), fr.fumbleWords("Blunder"), fr.fumbleWords("fumble"), fr.fumbleWords()],
  [{ verb: "blundered", noun: "blunder" }, { verb: "blundered", noun: "blunder" }, { verb: "fumbled", noun: "fumble" }, { verb: "fumbled", noun: "fumble" }]);
const frw = read("module", "fumble-reroll-workflow.mjs");
ok("C2 the question says what happened", /export async function offerFumbleReroll\(actor, kind, \{ degree = "fumble" \} = \{\}\) \{/.test(frw) && /content: `<p>You \$\{fumbleWords\(degree\)\.verb\} the \$\{what\}\./.test(frw));
ok("C3 the check passes the first result's degree, and its card names it",
  /const firstDegree = check\.outcome\.degree\.key;\n\s*const taken = await offerFumbleReroll\(check\.actor, check\.type, \{ degree: firstDegree \}\);/.test(ck)
  && /`\$\{taken\.label\}: the \$\{fumbleWords\(firstDegree\)\.noun\} is rerolled — /.test(ck));

/* D — a defence reaction offered only when it could be spent */
const dof = await imp("combat/defence-offer.mjs");
globalThis.ui = { notifications: { warn: () => {} } };
globalThis.game = { combat: { started: true } };
const apw = await imp("combat/action-points-workflow.mjs");
const fuku = (spentNonMartial, reactions = 1) => ({
  name: "Mujina", inCombat: true, items: [{ type: "ability", name: "Battle Readiness" }],
  system: { resources: { reactions: { value: reactions } } },
  getFlag: (_s, k) => (k === "nonMartialReactionSpent" ? spentNonMartial : undefined)
});
const guardianTraits = "Defence, Focus, Miraku, Movement, Technique";
const candidate = (reactionReason) => ({ key: "guardian", label: "Guardian's Intercession", summary: "", against: "weapon", has: true, reactionReason });
const weaponAttack = { kind: "weapon" };
const held = dof.defenceOffersFor({ candidates: [candidate(apw.reactionRefusal(fuku(true), guardianTraits))], event: weaponAttack, inCombat: true, reactions: 1 });
const fresh = dof.defenceOffersFor({ candidates: [candidate(apw.reactionRefusal(fuku(false), guardianTraits))], event: weaponAttack, inCombat: true, reactions: 1 });
const outside = dof.defenceOffersFor({ candidates: [candidate("refused")], event: weaponAttack, inCombat: false, reactions: 0 });
const none = dof.defenceOffersFor({ candidates: [candidate("refused")], event: weaponAttack, inCombat: true, reactions: 0 });
equal("D1 THE DEFECT: Guardian's Intercession on Battle Readiness's reaction is held, not asked; a fresh Fighter is asked; out of combat nothing is read; no reaction says so first",
  [held.offered.length, /Battle Readiness/.test(held.held[0]?.reason ?? ""), fresh.offered.length, outside.offered.length, none.held[0]?.reason],
  [0, true, 1, 1, "no reaction left this round"]);
const dow = read("module", "combat", "defence-offer-workflow.mjs");
ok("D2 the workflow reads the refusal with the reaction's own traits, and hands it on",
  /import \{ reactionRefusal \} from "\.\/action-points-workflow\.mjs";/.test(dow)
  && /const reactionReason = item \? reactionRefusal\(defender, String\(item\.system\?\.traits \?\? ""\)\) : "";/.test(dow)
  && /has: Boolean\(item\), requiresReason, reactionReason, alreadyUp:/.test(dow));

/* E */
{
  // 3.669.2 OR LATER (re-anchored 3.670.0): a later release keeps these fixes.
  const [a, b, c] = String(JSON.parse(read("system.json")).version).split(".").map(Number);
  ok("E the system is 3.669.2 or later", a > 3 || (a === 3 && (b > 669 || (b === 669 && c >= 2))));
}

const EXPECTED = 26;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-fixes-3669-2: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-fixes-3669-2: ${checks} checks — all green.`);
