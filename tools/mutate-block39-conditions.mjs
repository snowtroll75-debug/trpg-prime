#!/usr/bin/env node
/**
 * mutate-block39-conditions — can verify-block39-conditions fail?
 *
 * NEW at 3.621.0. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULES = at("module", "conditions", "condition-rules.mjs");
const EVENTS = at("module", "conditions", "condition-events-workflow.mjs");
const REG = at("module", "conditions", "registry.mjs");
const ARM = at("module", "armour-stacking.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const COMBAT = at("module", "documents", "combat.mjs");
const APPLY = at("module", "combat", "effect-application-workflow.mjs");
const DEATH = at("module", "combat", "death-state.mjs");
const WATCH = at("module", "combat", "death-watch-workflow.mjs");
const MOVE = at("module", "combat", "movement-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const TARGETING = at("module", "combat", "targeting.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const EFFECTS = at("module", "magic", "spell-effects.mjs");
const ACTION = at("module", "combat", "action-workflow.mjs");
const CHECK = at("module", "dice", "check.mjs");
const REST = at("module", "rest", "rest-workflow.mjs");
const CONDWF = at("module", "combat", "conditions-workflow.mjs");
const CONSUME = at("module", "consumable-use-workflow.mjs");
const ENVWF = at("module", "environment-workflow.mjs");
const VERIFY = at("tools", "verify-block39-conditions.mjs");

const MUTATIONS = [
  // A — bonus types
  { file: ACTOR, name: "A1 — THE OLD DEFECT: the Shield spell stays apart from the carried shield", from: "shieldBonuses: pooledShield > 0 ? [...shieldPieces, pooledShield] : shieldPieces,", to: "shieldBonuses: shieldPieces,", breaks: "A1" },
  { file: ACTOR, name: "A1 — a pooled shield bonus still sits in the typed pool", from: "        : (entry) => !(entry.type === \"shield\" && Number(entry.value) > 0)\n", to: "        : undefined\n", breaks: "A2" },
  { file: ARM, name: "A2 — THE OLD DEFECT: two suits both count", from: "    if (best < 0 || suit.dr > suits[best].dr) best = index;", to: "    if (best < 0 || suit.dr > suits[best].dr) best = index;\n    fittings += suit.dr;", breaks: "A3" },
  { file: ARM, name: "the fittings add nothing", from: "    else fittings += dr;", to: "    else fittings += 0;", breaks: "A3" },
  { file: ARM, name: "an Other piece is a suit", from: "  if (String(system.category ?? \"\").trim().toLowerCase() === \"other\") return false;", to: "", breaks: "A4" },
  { file: ATTACK, name: "the damage pipeline treats every piece as a fitting", from: "        suit: isBodyArmour(item),", to: "        suit: false,", breaks: "A6" },
  { file: ACTOR, name: "R2 — THE OLD DEFECT: an increase competes with the natural DR", from: ") + naturalIncrease);", to: ") + 0);", breaks: "A7" },
  // B — values
  { file: RULES, name: "A4 — THE OLD DEFECT: every valued condition adds", from: "  return ADDING_CONDITION_IDS.includes(id) ? had + add : Math.max(had, add);", to: "  return had + add;", breaks: "B2" },
  { file: RULES, name: "Injured stops adding", from: "const ADDING_CONDITION_IDS = Object.freeze([\"bleeding\", \"injured\",", to: "const ADDING_CONDITION_IDS = Object.freeze([\"bleeding\",", breaks: "B1" },
  { file: APPLY, name: "the tags add again", from: "const newValue = combinedConditionValue(tag.key, existingValue, incomingValue);", to: "const newValue = existingValue + Math.max(0, incomingValue);", breaks: "B3" },
  { file: COMBAT, name: "A3 — THE OLD DEFECT: Slowed read under Stunned's override", from: "const slowed = Number(actor.conditions?.direct?.get?.(\"slowed\") ?? actor.getConditionValue?.(\"slowed\") ?? 0) || 0;", to: "const slowed = actor.getConditionValue?.(\"slowed\") ?? 0;", breaks: "B4" },
  // C — thresholds and deaths
  { file: REG, name: "R6 — a grant is never visited", from: "  for (const [id, source] of grants ?? []) visit(id, source);", to: "", breaks: "C1" },
  { file: ACTOR, name: "R6 — Fatigue 10 grants nothing", from: "const grants = fatigueStatus(direct.get(\"fatigued\") ?? 0) ? [[\"unconscious\", \"fatigued\"]] : [];", to: "const grants = [];", breaks: "C2" },
  { file: RULES, name: "A8 — Doomed must go below 0", from: "  if (d > 0 && base - d <= 0) return", to: "  if (d > 0 && base - d < 0) return", breaks: "C3" },
  { file: RULES, name: "R6 — Fatigue 20 is survivable", from: "  if (fatigueStatus(fatigued) === \"dead\") return", to: "  if (false) return", breaks: "C3" },
  { file: DEATH, name: "A8 — THE OLD DEFECT: only the sheet button kills", from: "  if (instantDeathOf(actor)) return true;\n", to: "", breaks: "C4" },
  { file: ACTOR, name: "the maximum before the drain is lost", from: "  hp.maxBeforeSoulDrain = hp.max;\n", to: "", breaks: "C4" },
  { file: DEATH, name: "A8 — the dead stay doomed", from: "      await actor.toggleStatusEffect(\"doomed\", { active: false });\n", to: "", breaks: "C5" },
  { file: WATCH, name: "an instant death out of combat goes unannounced", from: "if (result.removed || result.cause) {", to: "if (result.removed) {", breaks: "C6" },
  { file: RULES, name: "A7 — THE OLD DEFECT: Soul Drain deals no damage", from: "  return Math.max(0, (Number(after) || 0) - (Number(before) || 0));", to: "  return 0;", breaks: "C7" },
  { file: ACTOR, name: "a created condition reports nothing", from: "    const [effect] = await this.createEmbeddedDocuments(\"ActiveEffect\", [data]);\n    await settle();", to: "    const [effect] = await this.createEmbeddedDocuments(\"ActiveEffect\", [data]);", breaks: "C8" },
  { file: REST, name: "A5 — THE OLD DEFECT: a full night leaves the Fatigue", from: "  if (activity === \"sleeping\" && wholeHours >= FULL_NIGHT_HOURS && ate && drank) {", to: "  if (false) {", breaks: "C9" },
  { file: ATTACK, name: "A6 — THE OLD DEFECT: Weakened never reaches the damage", from: "    if (weakened > 0 && isStrengthBasedAttack(weaponData)) formula += ` - ${weakened}`;", to: "", breaks: "C10" },
  // D — movement
  { file: RULES, name: "Petrified can walk", from: "const CANNOT_MOVE_CONDITIONS = Object.freeze([\"immobilised\", \"paralyzed\", \"petrified\"]);", to: "const CANNOT_MOVE_CONDITIONS = Object.freeze([\"immobilised\", \"paralyzed\"]);", breaks: "D1" },
  { file: RULES, name: "Prone may Stride", from: "  if (hasCondition(conds, \"prone\") && armed !== \"crawl\") {", to: "  if (false) {", breaks: "D3" },
  { file: RULES, name: "teleportation is refused too", from: "  if (!governed) return \"\";\n", to: "", breaks: "D4" },
  { file: MOVE, name: "the refusal is never acted on", from: "  if (refusal) {\n", to: "  if (false) {\n", breaks: "D5" },
  { file: MOVE, name: "a GM's reposition is refused", from: "    if (!active || active.id !== actor.id) return \"\";", to: "", breaks: "D5" },
  { file: MOVE, name: "the blind walk freely", from: "  const allDifficult = bound.difficult || blindDifficult;", to: "  const allDifficult = bound.difficult;", breaks: "D6" },
  // E — attacks
  { file: RULES, name: "Prone's +4 reaches 10 ft", from: "  const close = Number.isFinite(feet) ? feet <= 5 : Boolean(melee);", to: "  const close = Number.isFinite(feet) ? feet <= 10 : Boolean(melee);", breaks: "E2" },
  { file: RULES, name: "Undetected does not flat-foot", from: "const FLAT_FOOTING_ATTACKER_CONDITIONS = Object.freeze([\"unnoticed\", \"undetected\", \"invisible\", \"hidden\"]);", to: "const FLAT_FOOTING_ATTACKER_CONDITIONS = Object.freeze([\"unnoticed\", \"invisible\", \"hidden\"]);", breaks: "E3" },
  { file: RULES, name: "A9 — THE OLD DEFECT: Undetected gives no miss chance", from: "  for (const id of [\"unnoticed\", \"undetected\"]) {", to: "  for (const id of []) {", breaks: "E4" },
  { file: RULES, name: "a Dazzled attacker sees clearly", from: "    concealed = true;\n", to: "", breaks: "E5" },
  { file: TARGETING, name: "the avoidance check ignores the senses", from: "const hidden = Boolean(targetActor.hasCondition(\"hidden\")) || senses.hidden;", to: "const hidden = Boolean(targetActor.hasCondition(\"hidden\"));", breaks: "E6" },
  { file: ATTACK, name: "a Strike gets no advantage", from: "    ...(conditionTerms?.advantage ? { bias: \"advantage\" } : {}),\n", to: "", breaks: "E7" },
  { file: CAST, name: "a spell attack gets no advantage", from: "if (firstTarget && attackTermsAgainst(firstTarget, actor).advantage) castContext.bias = \"advantage\";", to: "", breaks: "E8" },
  { file: CAST, name: "a spell attack ignores Prone", from: "      .concat(conditionRows)\n", to: "", breaks: "E8" },
  { file: ACTION, name: "an attack action ignores the target's conditions", from: "      ...(actionAttackTerms?.rows ?? []),\n", to: "", breaks: "E9" },
  { file: EVENTS, name: "flat-footed to you forgets the dodge", from: "  return dex + dodge;", to: "  return dex;", breaks: "E10" },
  // F — checks
  { file: RULES, name: "Paralyzed fails by 20", from: "const REFLEX_AUTO_FAIL_BY = Object.freeze({ paralyzed: 25, immobilised: 20 });", to: "const REFLEX_AUTO_FAIL_BY = Object.freeze({ paralyzed: 20, immobilised: 20 });", breaks: "F1" },
  { file: RULES, name: "the forced margin is zero", from: "  const margin = -Math.abs(Number(by) || 0);", to: "  const margin = 0;", breaks: "F1" },
  { file: CHECK, name: "a reroll escapes the forced failure", from: "    this.outcome = this.#conditionForced(applyDegreeShift(buildOutcome({\n      dieTotal: this.dice.total,\n      modifiers: this.modifiers,\n      dc: this.dc,\n      ...this._outcomeArgs\n    }), this.degreeShift));\n    return this;", to: "    this.outcome = applyDegreeShift(buildOutcome({\n      dieTotal: this.dice.total,\n      modifiers: this.modifiers,\n      dc: this.dc,\n      ...this._outcomeArgs\n    }), this.degreeShift);\n    return this;", breaks: "F2" },
  { file: RULES, name: "the blind see", from: "    if (sense === \"sight\") out.fumble = true;", to: "", breaks: "F3" },
  { file: CHECK, name: "the sense fumble is never set", from: "        if (result.fumble) check.senseFumble = result.condition;", to: "", breaks: "F4" },
  // G — actions
  { file: RULES, name: "Grabbed needs no flat check", from: "  if (hasCondition(conds, \"grabbed\") && set.has(\"manipulate\")) {", to: "  if (false) {", breaks: "G1" },
  { file: ACTION, name: "the main commit point skips the gate", from: "  // DEAFENED AND GRABBED (3.621.0) — see `conditionCommitGate`.\n  if (!(await conditionCommitGate(actor, action))) return null;", to: "", breaks: "G2" },
  { file: CAST, name: "a lost auditory cast still succeeds", from: "traits: spellData.traits ?? \"\" }))) degree = \"failure\";", to: "traits: spellData.traits ?? \"\" }))) degree = degree;", breaks: "G2" },
  { file: RULES, name: "the blind see illusions", from: "  if (set.has(\"visual\") && hasCondition(conds, \"blinded\")) return \"blinded\";", to: "", breaks: "G3" },
  { file: EFFECTS, name: "the spell ignores sense immunity", from: "        const by = senseImmunityBy(recipient?.conditions?.effective, traits);", to: "        const by = null;", breaks: "G3" },
  { file: RULES, name: "the Fleeing may Delay", from: "  if (hasCondition(conds, \"fleeing\")) return \"Fleeing creatures cannot Ready or Delay\";", to: "", breaks: "G4" },
  { file: RULES, name: "the Fixated concentrate", from: "  if (!hasCondition(conds, \"fixated\")) return \"\";", to: "  return \"\";", breaks: "G5" },
  { file: CONSUME, name: "the Sickened drink", from: "const refused = ingested && !toAnother ? ingestRefusal(actor.conditions?.effective) : \"\";", to: "const refused = \"\";", breaks: "G6" },
  { file: CONDWF, name: "Retch is free", from: "  await payRetch(actor);\n  const degree", to: "  const degree", breaks: "G6" },
  // H — moments
  { file: REG, name: "A10 — THE OLD DEFECT: Unconscious includes Prone", from: "    includes: [\"blinded\", \"flatFooted\", \"immobilised\"]\n  },\n  undetected", to: "    includes: [\"blinded\", \"flatFooted\", \"immobilised\", \"prone\"]\n  },\n  undetected", breaks: "H1" },
  { file: EVENTS, name: "A10 — nobody falls", from: "    await actor.toggleStatusEffect(\"prone\", { active: true });\n", to: "", breaks: "H2" },
  { file: EVENTS, name: "the fall repeats on every write", from: "  if (down === marked) return;\n", to: "", breaks: "H2" },
  { file: RULES, name: "a dying creature wakes", from: "  if (!directlyUnconscious || dying || rest) return false;", to: "  if (!directlyUnconscious) return false;", breaks: "H3" },
  { file: REST, name: "a night's healing wakes the sleeper", from: "await actor.update(updates, { trgRest: true });", to: "await actor.update(updates);", breaks: "H3" },
  { file: ACTION, name: "nobody can be shaken awake", from: "        if (token?.actor && token.actor !== actor) await shakeAwake(actor, token.actor);", to: "", breaks: "H4" },
  { file: ATTACK, name: "a Strike leaves the Fixated fixated", from: "    if (targetActor) await endFixationOnHostileAct([targetActor], actor);", to: "", breaks: "H5" },
  { file: RULES, name: "Stunned spends nothing of itself", from: "  return { lost, ap: ap - lost, stunned: value - lost };", to: "  return { lost, ap: ap - lost, stunned: value };", breaks: "H6" },
  { file: COMBAT, name: "the regain stamps no turn", from: "      [`flags.${SYSTEM_ID}.apGrantedTurn`]: { combatId: this.id, round: this.round, turn: this.turn },\n", to: "", breaks: "H6" },
  { file: EVENTS, name: "a Stunned in Phase 1 is deducted twice", from: "  if (!stamp || stamp.combatId !== combat.id || stamp.round !== combat.round || stamp.turn !== combat.turn) return;", to: "", breaks: "H6" },
  { file: COMBAT, name: "the Frightened save is never offered", from: "        await offerFrightenedRecovery(actor);\n", to: "", breaks: "H7" },
  // I — Defence
  { file: RULES, name: "a statue keeps its DB", from: "  if (hasCondition(conds, \"petrified\")) return \"zero\";", to: "", breaks: "I1" },
  { file: RULES, name: "item bonuses are lost too", from: "  if (type === \"armour\" || type === \"item\") return true;", to: "  if (type === \"armour\") return true;", breaks: "I2" },
  { file: ACTOR, name: "the statue's DB is untouched", from: "      combat.defence.total = 0;\n", to: "", breaks: "I3" },
  { file: ACTOR, name: "the statue has no Hardness", from: "      system.combat.dr.total = (Number(system.combat.dr.total) || 0) + PETRIFIED_HARDNESS;\n", to: "", breaks: "I4" },
  // J
  { file: ENVWF, name: "G1 — the region fields miss the Appearance tab", from: "inject(app, html, [\"appearance\", \"identity\", \"basics\"])", to: "inject(app, html, [\"identity\", \"basics\"])", breaks: "J1" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-block39-conditions: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-block39-conditions: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block39-conditions: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
