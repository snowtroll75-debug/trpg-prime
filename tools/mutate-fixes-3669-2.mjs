#!/usr/bin/env node
/** mutate-fixes-3669-2 — the mutation half of verify-fixes-3669-2. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const SA = m("skill-aid.mjs"), OC = m("dice", "offered-conditionals.mjs"), SK = m("skills.mjs"), DF = m("daily-firsts.mjs"),
  ACW = m("combat", "action-workflow.mjs"), CK = m("dice", "check.mjs"), FR = m("fumble-reroll.mjs"), FRW = m("fumble-reroll-workflow.mjs"),
  DO = m("combat", "defence-offer.mjs"), DOW = m("combat", "defence-offer-workflow.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json"),
  SC = m("magic", "save-convert.mjs"), CCI = m("dice", "check-card-interactions.mjs");
const MUTATIONS = [
  // A — Aid Another's ticks
  { name: "an `auto` row is asked too", file: SA, from: "      if (!row || row.auto || !row.id) continue;", to: "      if (!row || !row.id) continue;", breaks: "A1" },
  { name: "a row keeps only the last skill it matched", file: SA, from: "      if (!kept.skills.includes(skill)) kept.skills.push(skill);", to: "      kept.skills = [skill];", breaks: "A1" },
  { name: "every row is shown whatever the skill", file: SA, from: "${row.skills.includes(skill) ? \"\" : ' style=\"display:none\"'}", to: "${\"\"}", breaks: "A2" },
  { name: "a row is hidden by the attribute the dialog's CSS outranks", file: SA, from: "${row.skills.includes(skill) ? \"\" : ' style=\"display:none\"'}", to: "${row.skills.includes(skill) ? \"\" : \" hidden\"}", breaks: "A2" },
  { name: "the box's value is not escaped", file: SA, from: "+ `<input type=\"checkbox\" name=\"aidTick\" value=\"${escAid(row.id)}\">`", to: "+ `<input type=\"checkbox\" name=\"aidTick\" value=\"${row.id}\">`", breaks: "A2" },
  { name: "the label is not escaped", file: SA, from: "+ ` <span><strong>${escAid(row.detail)}</strong> — ${escAid(row.summary)}</span></div>`", to: "+ ` <span><strong>${escAid(row.detail)}</strong> — ${row.summary}</span></div>`", breaks: "A2" },
  { name: "an empty block still prints", file: SA, from: "  if (!Array.isArray(rows) || !rows.length) return \"\";\n  const lines", to: "  if (!Array.isArray(rows)) return \"\";\n  const lines", breaks: "A2" },
  { name: "a tick for another skill reaches the roll", file: SA, from: ".filter((row) => row.skills?.includes(skill))", to: ".filter(() => true)", breaks: "A3" },
  { name: "an answer is applied over the dialog's own", file: OC, from: "  return !resolved && !flat && Number(count) > 0;", to: "  return !flat && Number(count) > 0;", breaks: "A5" },
  { name: "an answer is applied on a flat check", file: OC, from: "  return !resolved && !flat && Number(count) > 0;", to: "  return !resolved && Number(count) > 0;", breaks: "A5" },
  { name: "THE DEFECT: an answer is applied only where the prompt asks", file: OC, from: "  const answered = Array.isArray(check.conditionalChoices);", to: "  const answered = false;", breaks: "A5" },
  { name: "THE RULING WIDENED: a skill check is asked the small prompt", file: OC, from: "const OFFERED_CHECK_TYPES = Object.freeze([\"attack\", \"spellcraft\"]);", to: "const OFFERED_CHECK_TYPES = Object.freeze([\"attack\", \"spellcraft\", \"skill\"]);", breaks: "A4" },
  { name: "the dialog misses the effects' rows", file: SK, from: "    Array.from(actor.appliedEffects ?? actor.effects ?? []),\n    [...(actor.system?.combat?.runeConditionals ?? []), ...allyAuraConditionalsFor(actor)],", to: "    [],\n    [...(actor.system?.combat?.runeConditionals ?? []), ...allyAuraConditionalsFor(actor)],", breaks: "A6" },
  { name: "the dialog asks rows for another action", file: SK, from: "conditionalRows(aidEntries, { checkType: \"skill\", subject: key, actionKey: \"aidAnother\" })", to: "conditionalRows(aidEntries, { checkType: \"skill\", subject: key, actionKey: \"\" })", breaks: "A6" },
  { name: "THE DEFECT: the dialog asks nothing", file: SK, from: "        ${aidTickBlock(tickRows, firstSkill)}\n", to: "", breaks: "A7" },
  { name: "the ticked boxes are not returned", file: SK, from: "          return { ...new FDE(form).object, ticks };", to: "          return new FDE(form).object;", breaks: "A7" },
  { name: "a tick does not follow the skill picked", file: SK, from: "      select.addEventListener(\"change\", follow);\n", to: "", breaks: "A7" },
  { name: "a hidden tick stays ticked", file: SK, from: "          if (!shown) { const box = row.querySelector(\"input\"); if (box) box.checked = false; }\n", to: "", breaks: "A7" },
  { name: "the answer never reaches the roll", file: SK, from: "    conditionalChoices: aidTicksFor(tickRows, result.ticks, skillKey),\n", to: "", breaks: "A8" },
  // B — an exact first, declared
  { name: "a spent first still sets the degree", file: DF, from: "export function dailyFirstExactDegree(carriers, actionKey, spent = false) {\n  if (spent) return null;\n", to: "export function dailyFirstExactDegree(carriers, actionKey, spent = false) {\n", breaks: "B1" },
  { name: "an inexact first sets the degree too", file: DF, from: "    if (r.exact === true && DEGREE_ORDER.includes(norm(r.set))) return norm(r.set);", to: "    if (DEGREE_ORDER.includes(norm(r.set))) return norm(r.set);", breaks: "B1" },
  { name: "the action never hands the degree on", file: ACW, from: "{ allowConviction: false, declaredDegree: exactDegree }", to: "{ allowConviction: false }", breaks: "B2" },
  { name: "the check forgets the degree", file: CK, from: "    this.declaredDegree = config.declaredDegree ? String(config.declaredDegree) : \"\";", to: "    this.declaredDegree = \"\";", breaks: "B3" },
  { name: "THE DEFECT: the card still shows the unread dice's degree", file: SC, from: "  return { ...set, shiftedFrom: undefined, declared: true, chaos: false };", to: "  return { ...set, shiftedFrom: undefined, chaos: false };", breaks: "B6" },
  { name: "a Chaos banner rides with dice nobody reads", file: SC, from: "  return { ...set, shiftedFrom: undefined, declared: true, chaos: false };", to: "  return { ...set, shiftedFrom: undefined, declared: true };", breaks: "B6" },
  { name: "a declared degree says the dice shifted", file: SC, from: "  return { ...set, shiftedFrom: undefined, declared: true, chaos: false };", to: "  return { ...set, declared: true, chaos: false };", breaks: "B6" },
  { name: "an outcome with no degree yet is declared anyway", file: SC, from: "  if (set === outcome) return outcome;\n  return { ...set,", to: "  return { ...set,", breaks: "B6" },
  { name: "the roll declares nothing", file: CK, from: "        check.outcome = set;\n", to: "", breaks: "B3" },
  { name: "the card forgets the declared degree", file: CK, from: "              declaredDegree: this.declaredDegree || \"\",\n", to: "", breaks: "B7" },
  { name: "THE GAP: a late DC shows the dice's degree", file: CCI, from: "  const outcome = raw.declaredDegree ? declaredAt(shifted, raw.declaredDegree) : shifted;", to: "  const outcome = shifted;", breaks: "B7" },
  { name: "a late DC's held-over outcome reads the dice", file: CCI, from: "    const read = raw.declaredDegree ? declaredAt(outcome, raw.declaredDegree) : outcome;", to: "    const read = outcome;", breaks: "B7" },
  { name: "a declared card offers +1d6 after a late DC", file: CCI, from: "    !raw.declaredDegree &&\n", to: "", breaks: "B7" },
  { name: "a declared card's +1d6 can be pressed", file: CCI, from: "  if (raw.declaredDegree) return;\n", to: "", breaks: "B7" },
  { name: "the dialog's conviction Advantage is spent on an exact first", file: ACW, from: "    convictionAdvantage: !exactFirst && Boolean(situational?.convictionAdvantage),", to: "    convictionAdvantage: Boolean(situational?.convictionAdvantage),", breaks: "B8" },
  { name: "the dialog's Luck is spent on an exact first", file: ACW, from: "    useLuck: !exactFirst && Boolean(situational?.useLuck),", to: "    useLuck: Boolean(situational?.useLuck),", breaks: "B8" },
  { name: "the check spends Advantage on a declared degree", file: CK, from: "if (check.convictionAdvantage && check.actor && !check.declaredDegree) {", to: "if (check.convictionAdvantage && check.actor) {", breaks: "B8" },
  { name: "armed Luck is spent on a declared degree", file: CK, from: "check.type !== \"luck\" && !check.declaredDegree && !check.presetModifiers) {", to: "check.type !== \"luck\" && !check.presetModifiers) {", breaks: "B8" },
  { name: "the ticks sit in the two-column form-group again", file: SA, from: "  return `<p style=\"margin:6px 0 2px\"><strong>Racial, feature &amp; equipment bonuses</strong></p>`\n    + `<div class=\"trg-conditional-modifiers\">${lines}</div>`", to: "  return `<div class=\"form-group trg-conditional-modifiers\"><label>Racial, feature &amp; equipment bonuses</label>`\n    + `<div>${lines}</div>`", breaks: "A2" },
  { name: "a declared degree may still be rerolled", file: CK, from: "        check.luckUsed = true;\n        check.saveReactionResolved = true;\n      }\n    }\n\n    // SAID WHEN A SHIFT", to: "      }\n    }\n\n    // SAID WHEN A SHIFT", breaks: "B3" },
  { name: "Fate offers to declare over a declared degree", file: CK, from: "!check.chanceUsed && !check.outcome?.declared && check.outcome?.degree?.key", to: "!check.chanceUsed && check.outcome?.degree?.key", breaks: "B5" },
  // C — the word
  { name: "a Blunder is called a fumble", file: FR, from: "  return String(degree ?? \"\").trim().toLowerCase() === \"blunder\"", to: "  return String(degree ?? \"\").trim() === \"blunders\"", breaks: "C1" },
  { name: "the question says fumbled", file: FRW, from: "content: `<p>You ${fumbleWords(degree).verb} the ${what}.", to: "content: `<p>You fumbled the ${what}.", breaks: "C2" },
  { name: "the card says the fumble is rerolled", file: CK, from: "`${taken.label}: the ${fumbleWords(firstDegree).noun} is rerolled — ", to: "`${taken.label}: the fumble is rerolled — ", breaks: "C3" },
  { name: "the first degree is not passed", file: CK, from: "offerFumbleReroll(check.actor, check.type, { degree: firstDegree })", to: "offerFumbleReroll(check.actor, check.type)", breaks: "C3" },
  // D — a defence reaction
  { name: "THE DEFECT: a refused reaction is still asked", file: DO, from: "      : inCombat && c.reactionReason\n      ? String(c.reactionReason)\n", to: "", breaks: "D1" },
  { name: "the refusal is read out of combat", file: DO, from: "      : inCombat && c.reactionReason\n", to: "      : c.reactionReason\n", breaks: "D1" },
  { name: "the refusal outranks an empty pool", file: DO, from: "      : inCombat && !(Number(reactions) > 0)\n      ? \"no reaction left this round\"\n      // THE REACTION AS", to: "      // THE REACTION AS", breaks: "D1" },
  { name: "the refusal is read without the reaction's traits", file: DOW, from: "reactionRefusal(defender, String(item.system?.traits ?? \"\"))", to: "reactionRefusal(defender, \"\")", breaks: "D2" },
  { name: "the refusal is never handed on", file: DOW, from: "has: Boolean(item), requiresReason, reactionReason, alreadyUp:", to: "has: Boolean(item), requiresReason, alreadyUp:", breaks: "D2" },
  // E
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.674.2\"", to: "\"version\": \"3.669.1\"", breaks: "E" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3669-2.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3669-2: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-fixes-3669-2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3669-2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
