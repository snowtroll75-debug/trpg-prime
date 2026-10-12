#!/usr/bin/env node
/**
 * mutate-block39-traits — can verify-block39-traits fail?
 *
 * NEW at 3.622.0. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const TRAITS = at("module", "traits.mjs");
const TW = at("module", "traits-workflow.mjs");
const TR = at("module", "trait-rules.mjs");
const TRW = at("module", "trait-rules-workflow.mjs");
const FEATS = at("module", "feats-workflow.mjs");
const APW = at("module", "combat", "action-points-workflow.mjs");
const ACTION = at("module", "combat", "action-workflow.mjs");
const BOMB = at("module", "alchemical-workflow.mjs");
const SPIRIT = at("module", "magic", "spiritual-weapon-workflow.mjs");
const CHECK = at("module", "dice", "check.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const EFFECTS = at("module", "magic", "spell-effects.mjs");
const LIGHT = at("module", "light.mjs");
const LS = at("module", "magic", "light-shift.mjs");
const LWF = at("module", "light-workflow.mjs");
const SKILLS = at("module", "data", "skill-actions.mjs");
const AFF = at("module", "afflictions.mjs");
const LEARN = at("module", "magic", "learn-spell-workflow.mjs");
const UW = at("module", "combat", "underwater.mjs");
const CHARGED = at("module", "charged-items-workflow.mjs");
const MAGIC = at("module", "magic-items-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const VERIFY = at("tools", "verify-block39-traits.mjs");

const MUTATIONS = [
  // A
  { file: TRAITS, name: "A11 — THE OLD DEFECT: the per-turn limits apply out of combat", from: "  if (!inEncounter) return { blocked: false, reason: \"\" };", to: "", breaks: "A1" },
  { file: TRAITS, name: "A13 — THE OLD DEFECT: Press reads only the trait record", from: "  if (hasTrait(action, \"press\") && attacks === 0) {", to: "  if (hasTrait(action, \"press\") && used.attack === 0) {", breaks: "A5" },
  { file: TRAITS, name: "Open ignores the counter", from: "  if (hasTrait(action, \"open\") && (attacks > 0 || used.open > 0)) {", to: "  if (hasTrait(action, \"open\") && (used.attack > 0 || used.open > 0)) {", breaks: "A5" },
  { file: TRAITS, name: "R11 — a Word may follow a Stride", from: "    if (used.actions > 0 || actedThisTurn) {", to: "    if (used.actions > 0) {", breaks: "A6" },
  { file: APW, name: "the AP stamp forgets the turn", from: "round: game.combat.round, turn: game.combat.turn }", to: "round: game.combat.round }", breaks: "A7" },
  { file: TW, name: "A11 — the record is written out of combat", from: "  if (!game.combat?.started) return;\n  const usage = traitUsage(actor);", to: "  const usage = traitUsage(actor);", breaks: "A8" },
  { file: TW, name: "A12 — THE OLD DEFECT: Word's −4 on an enemy's turn", from: "  if (!isOwnTurn(actor)) return null;\n", to: "", breaks: "A9" },
  { file: BOMB, name: "A12 — a bomb escapes the Word aftermath", from: "  if (wordPenalty) modifiers.push(wordPenalty);\n  const { attackTermsAgainst }", to: "  const { attackTermsAgainst }", breaks: "A10" },
  { file: TW, name: "A15 — THE OLD DEFECT: a stance from another combat blocks", from: "  return stamp.combatId === combat.id ? Number(stamp.round) : null;", to: "  return Number(stamp.round);", breaks: "A11" },
  { file: FEATS, name: "a feat stance writes a bare round", from: "await actor.setFlag(SYSTEM_ID, \"lastStanceRound\", stanceStamp());", to: "await actor.setFlag(SYSTEM_ID, \"lastStanceRound\", round);", breaks: "A12" },
  // B
  { file: CHECK, name: "A14 — THE OLD DEFECT: Conviction overwrites a disadvantage", from: "        check.bias = resolveBias(check.bias, [\"advantage\"], BIAS);\n        check.modifiers.push({\n          // Named apart", to: "        check.bias = BIAS.ADVANTAGE;\n        check.modifiers.push({\n          // Named apart", breaks: "B1" },
  { file: SKILLS, name: "A16 — THE OLD DEFECT: Survey Wildlife is \"Exploration\"", from: "    traits: \"Concentrate, Explore, Secret\",", to: "    traits: \"Concentrate, Exploration, Secret\",", breaks: "B2" },
  { file: TRAITS, name: "A18 — THE OLD DEFECT: Emotion brings nothing", from: "  emotion: [\"mental\"]\n", to: "  emotion: []\n", breaks: "B3/B4" },
  { file: TRAITS, name: "the immunity gate ignores implied traits", from: "  const traits = withImpliedTraits(traitList(typeof action === \"string\" ? action : action?.traits));", to: "  const traits = traitList(typeof action === \"string\" ? action : action?.traits);", breaks: "B4" },
  // C
  { file: TR, name: "R9 — the default step reaches 10", from: "const LIGHT_TRAIT_DEFAULT = Object.freeze({ steps: 1, cap: 8 });", to: "const LIGHT_TRAIT_DEFAULT = Object.freeze({ steps: 1, cap: 10 });", breaks: "C1" },
  { file: TR, name: "an instant flash leaves a circle", from: "  if (!lastingDuration(spellSystem?.duration)) return null;\n", to: "", breaks: "C2" },
  { file: TR, name: "a spell's own light gets the default too", from: "  if (rows.some((r) => STATES_ITS_LIGHT.includes(String(r?.kind ?? \"\")))) return null;\n", to: "", breaks: "C2" },
  { file: LIGHT, name: "A17 — THE OLD DEFECT: a raise ignores its cap", from: "    if (clamped >= top) return clamped;\n    return Math.min(top, clamped + Math.floor(n));", to: "    return Math.min(10, clamped + Math.floor(n));", breaks: "C3" },
  { file: LS, name: "the row drops its cap", from: "    cap: Math.min(10, Math.max(1, int(raw.cap) || 10)),\n", to: "", breaks: "C4" },
  { file: LWF, name: "the light reading drops the cap", from: "level = shiftLightLevel(level, shift.steps, shift.floor, shift.cap);", to: "level = shiftLightLevel(level, shift.steps, shift.floor);", breaks: "C4" },
  { file: CAST, name: "Fairy Fire's empty rows skip the effect engine", from: "(effEffects.length || lightTraitDefaultRow(spellData, spell.name))", to: "effEffects.length", breaks: "C5" },
  // D
  { file: TR, name: "A19 — THE OLD DEFECT: rarity raises nothing", from: "  return rarityDCIncrease(Array.from(creatureTraits ?? []).join(\", \"));", to: "  return 0;", breaks: "D1" },
  { file: TR, name: "the GM's modifier is ignored", from: "  if (typed) return typed;\n", to: "", breaks: "D2" },
  { file: AFF, name: "an affliction's rarity is ignored", from: "    ? afflictionRarityRaise(rarity)", to: "    ? 0", breaks: "D2" },
  { file: LEARN, name: "a Rare spell is learnt at the common DC", from: "    cost: { ...cost, dc: cost.dc + rarityRaise },", to: "    cost,", breaks: "D3" },
  { file: ACTION, name: "Recall Knowledge ignores a Rare creature", from: "    finalDC += rarityRaise;\n", to: "", breaks: "D3" },
  // E
  { file: TR, name: "A20 — THE OLD DEFECT: a critical's splash is not multiplied", from: "  return base * (SEVERITY_LEVEL[String(criticalSeverity).toLowerCase()] ?? 1);", to: "  return base;", breaks: "E1" },
  { file: TR, name: "a miss scatters the whole throw", from: "  const feet = Math.max(0, Math.floor((Number(throwFeet) || 0) / 2 / 5) * 5);", to: "  const feet = Math.max(0, Math.floor((Number(throwFeet) || 0) / 5) * 5);", breaks: "E2" },
  { file: CAST, name: "a spell's splash ignores the critical", from: "const splashDealt = splashOnHit(splashTotal(splashSpec, Number(clMods?.steps ?? 0)), outcome.critical?.severity ?? null);", to: "const splashDealt = splashTotal(splashSpec, Number(clMods?.steps ?? 0));", breaks: "E3" },
  // F
  { file: TR, name: "Water casts underwater", from: "    for (const t of [\"fire\", \"air\", \"water\"]) {", to: "    for (const t of [\"fire\", \"air\"]) {", breaks: "F1" },
  { file: TR, name: "Sonic sounds in a vacuum", from: "  if (vacuum && hasTrait(traits, \"sonic\")) return", to: "  if (false) return", breaks: "F2" },
  { file: TR, name: "Cold stays cold underwater", from: "  return underwater && String(type ?? \"\").trim().toLowerCase() === \"cold\" ? \"piercing\" : type;", to: "  return type;", breaks: "F3" },
  { file: UW, name: "R8 — THE OLD DEFECT: the range is the radius", from: "    radiusFeet: applies ? 10 : 0,", to: "    radiusFeet: applies ? 60 : 0,", breaks: "F4" },
  { file: UW, name: "the Electricity trait does not count", from: "/(^|,)\\s*electricity\\s*(,|$)/i.test(String(traits ?? \"\"))", to: "false", breaks: "F4" },
  { file: CAST, name: "the cast is never refused", from: "    if (!(await elementalCastGate(actor, spellData, spell.name))) return null;", to: "", breaks: "F5" },
  // G
  { file: TR, name: "a second teleport succeeds", from: "  if (stampIsThisTurn(stamp, combat)) return { fails: true, check: false };", to: "", breaks: "G1" },
  { file: TR, name: "two rods a round", from: "  if (stampIsThisRound(stamp, combat)) return \"only one Rod may be used each round\";", to: "", breaks: "G3" },
  { file: CHARGED, name: "a rod cast is never asked", from: "    const refused = rodUseRefusal(actor);", to: "    const refused = \"\";", breaks: "G4" },
  { file: TR, name: "two staves invested", from: "  return other ? `only one Staff may be invested at a time — ${other.name} already is` : \"\";", to: "  return \"\";", breaks: "G5" },
  { file: MAGIC, name: "R12 — THE OLD DEFECT: an un-invested item only warns", from: "    ui.notifications.warn(`${item.name}: ${notInvested} — use Invest Item first.`);\n    return null;", to: "    ui.notifications.warn(`${item.name}: ${notInvested} — use Invest Item first.`);", breaks: "G6" },
  { file: TR, name: "a Rage action without a rage", from: "  return raging ? \"\" : \"a Rage action needs you to be raging\";", to: "  return \"\";", breaks: "G7" },
  { file: TR, name: "Invoke Rage is refused", from: "  if (key === \"invokeRage\") return \"\";\n", to: "", breaks: "G7" },
  { file: TR, name: "two compositions at once", from: "    .filter((e) => e?.id && e.id !== newCastId && isComposition(e.name))", to: "    .filter((e) => e?.id && e.id !== newCastId && false)", breaks: "G8" },
  { file: TR, name: "a polymorph leaves a morph", from: "    else if (hasTrait(p.traits, \"morph\") && !out.end.includes(p.castId)) out.end.push(p.castId);", to: "", breaks: "G9" },
  { file: TRW, name: "a counter that falls short still lands", from: "      if (total + mod < dc) {", to: "      if (false) {", breaks: "G9" },
  { file: ATTACK, name: "a morph's strike is mundane", from: "\n      || weapon?.flags?.[SYSTEM_ID]?.magicalStrike === true\n", to: "\n", breaks: "G10" },
  { file: CHECK, name: "two chance effects on one roll", from: "      && check.outcome?.degree?.key && !check.chanceUsed) {", to: "      && check.outcome?.degree?.key) {", breaks: "G11" },
  { file: CAST, name: "a Secret spell is rolled openly", from: "    ...(secretRollMode(spellData) ? { rollMode: secretRollMode(spellData) } : {})\n", to: "", breaks: "G12" },
  { file: TR, name: "item traits read commas only", from: "  return source.split(/[,\\s]+/)", to: "  return source.split(/,/)", breaks: "G13" },
  { file: SPIRIT, name: "Spiritual Weapon escapes the Word aftermath", from: "      ...(wordPenalty ? [wordPenalty] : []),\n", to: "", breaks: "A10" }
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
    process.stderr.write("mutate-block39-traits: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-block39-traits: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block39-traits: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
