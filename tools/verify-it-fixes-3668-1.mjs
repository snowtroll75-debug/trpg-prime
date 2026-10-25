#!/usr/bin/env node
/**
 * verify-it-fixes-3668-1 — TRG Prime 3.668.1: what Inner Tempest 0.5.1 needs.
 *
 *   A  a module Use that keeps its own Focus use (Combat Form; the 0.5.0
 *      live test found its learning step spent the use)
 *   B  a penalty set by the caller is named for it (Flow Strike's card read
 *      "Multiple Attack Penalty (attack 2) −10")
 *   C  Backswing, Brace and Twin, the three new weapon traits of Inner
 *      Tempest's Chapter 6 (Graham, 23 October 2026: "Add the weapons from
 *      chapter 6")
 */
import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

/* A — a Use that keeps its own Focus use */
const api = await imp("module-api.mjs");
api.queueFeatAutomation("ZZ Owns Its Use", { hint: "h", use: async () => {}, ownsFocusUse: true });
api.queueFeatAutomation("ZZ Default Use", { hint: "h", use: async () => {} });
api.queueFeatAutomation("ZZ Truthy Use", { hint: "h", use: async () => {}, ownsFocusUse: "yes" });
const queued = api.queuedFeatAutomation();
equal("A1 the declaration is queued, and only a true one counts", [queued.get("zz owns its use")?.ownsFocusUse, queued.get("zz default use")?.ownsFocusUse, queued.get("zz truthy use")?.ownsFocusUse], [true, false, false]);
const apiw = read("module", "module-api-workflow.mjs");
ok("A2 the flush carries it into the live table", /FEAT_AUTOMATION\[key\] = \{ hint: entry\.hint, use: entry\.use, module: true, \.\.\.\(entry\.ownsFocusUse === true \? \{ ownsFocusUse: true \} : \{\}\) \};/.test(apiw));
const fw = read("module", "feats-workflow.mjs");
const wfd = fw.slice(fw.indexOf("async function withFocusDefault(actor, item, run) {"), fw.indexOf("export async function useFeat(actor, item) {"));
ok("A3 the Use button neither gates nor spends for it, after the uncounted-Focus test and before the gate",
  /if \(max === null\) return run\(\);\n[\s\S]*?if \(ownsFocusUse\(item\)\) return run\(\);\n  const \{ itemUsesRemaining \} = await import\("\.\/uses-workflow\.mjs"\);/.test(wfd));
ok("A4 only a module's automation can declare it, and a type table entry never does",
  /function ownsFocusUse\(item\) \{\n  if \(TYPE_AUTOMATION\[item\?\.type\]\) return false;\n  const automation = FEAT_AUTOMATION\[normalise\(item\?\.name\)\];\n  return automation\?\.module === true && automation\?\.ownsFocusUse === true;\n\}/.test(fw));
ok("A5 the core's own table declares none", !/ownsFocusUse:\s*true/.test(fw.slice(fw.indexOf("const FEAT_AUTOMATION"), fw.indexOf("const TYPE_AUTOMATION"))));

/* B — the penalty's label */
const aw = read("module", "combat", "attack-workflow.mjs");
const setBy = aw.slice(aw.indexOf("function mapSetBy("), aw.indexOf("function strikeIsOffTurn("));
const mapSetBy = new Function(`${setBy}; return mapSetBy;`)();
equal("B1 a set penalty names who set it; a nameless one, and the count's, name the attack", [
  mapSetBy({ mapOverride: -10, optionLabel: "Flow Strike", attackIndex: 1 }),
  mapSetBy({ mapOverride: -5, optionLabel: "", attackIndex: 1 }),
  mapSetBy({ mapOverride: null, optionLabel: "Flow Strike", attackIndex: 1 }),
  mapSetBy({ attackIndex: 2 })], ["Flow Strike", "attack 2", "attack 2", "attack 3"]);
ok("B2 the card's row reads it", /label: `Multiple Attack Penalty \(\$\{mapSetBy\(\{ mapOverride, optionLabel, attackIndex \}\)\}\$\{relentlessRelief \?/.test(aw));

/* C — Backswing, Brace, Twin */
const t6 = await imp("combat/weapon-chapter6-traits.mjs");
const NUN = { traits: "Backswing, Disarm, Finesse, Monastic, Uncommon" };
const TONFA = { traits: "Agile, Finesse, Monastic, Parry, Twin, Uncommon" };
const NODACHI = { traits: "Brace, Deadly, Keen, Versatile P" };
const SAI = { traits: "Agile, Disarm, Finesse, Monastic, Parry, Uncommon" };
equal("C1 a trait is a whole word", [t6.hasWeaponTrait(NUN, "backswing"), t6.hasWeaponTrait({ traits: "Twinned" }, "twin"), t6.hasWeaponTrait({ traits: "Embrace" }, "brace"), t6.hasWeaponTrait(TONFA, "TWIN")], [true, false, false, true]);
equal("C2 Brace: readied, at a mounted target, with the trait — +2 and a die", [
  t6.braceApplies({ weaponSystem: NODACHI, readied: true, targetMounted: true }),
  t6.braceApplies({ weaponSystem: NODACHI, readied: false, targetMounted: true }),
  t6.braceApplies({ weaponSystem: NODACHI, readied: true, targetMounted: false }),
  t6.braceApplies({ weaponSystem: SAI, readied: true, targetMounted: true })], [{ attackBonus: 2, extraDice: 1 }, null, null, null]);
const refund = (o) => t6.backswingRefund({ weaponSystem: NUN, resolved: true, ...o });
equal("C3 Backswing takes the count back for a miss, and for a hit that inflicted nothing", [
  refund({ hits: false }), refund({ hits: true, damageTaken: 0 }), refund({ hits: true, damageTaken: 4 })], [true, true, false]);
equal("C4 …and never when the Strike added nothing to the count, had no target, or held its blow", [
  refund({ isReaction: true }), refund({ offTurn: true }), refund({ mapFrozen: true }), refund({ resolved: false }), refund({ hits: true, held: true }),
  t6.backswingRefund({ weaponSystem: SAI, resolved: true, hits: false })], [false, false, false, false, false, false]);
equal("C5 Double Slice: a Backswing swing that inflicted nothing is not counted", [
  t6.backswingCounts([{ weaponSystem: NUN, hits: false }, { weaponSystem: SAI, hits: false }], 2),
  t6.backswingCounts([{ weaponSystem: NUN, hits: true, damageTaken: 3 }, { weaponSystem: NUN, hits: false }], 2),
  t6.backswingCounts([{ weaponSystem: NUN, hits: false }, { weaponSystem: NUN, hits: true, damageTaken: 0 }], 2),
  t6.backswingCounts([{ weaponSystem: SAI, hits: false }, { weaponSystem: SAI, hits: false }], 2)], [1, 1, 0, 2]);
const sw = (system, hits, taken) => ({ weaponSystem: system, hits, damageTaken: taken });
equal("C6 Twin: both Twin, both hit and inflicted damage, two weapons — +1 each", [
  t6.twinBonus({ first: sw(TONFA, true, 3), second: sw(TONFA, true, 1) }),
  t6.twinBonus({ first: sw(TONFA, true, 3), second: sw(TONFA, true, 0) }),
  t6.twinBonus({ first: sw(TONFA, true, 3), second: sw(TONFA, false, 0) }),
  t6.twinBonus({ first: sw(TONFA, true, 3), second: sw(SAI, true, 2) }),
  t6.twinBonus({ first: sw(TONFA, true, 3), second: sw(TONFA, true, 2), sameWeapon: true })], [1, 0, 0, 0, 0]);
ok("C7 the Strike takes a `readied` option", /\n  readied = false,\n  \/\/ THE REROLL OF A FUMBLED STRIKE[\s\S]{0,200}?fumbleRerolled = false\n\} = \{\}\) \{\n(?:  const callOptions = arguments\[2\] \?\? \{\};\n)?  const viaRefused = weaponStrikeRefused\(weapon, viaAbility\);/.test(aw));
ok("C8 Brace adds its bonus to the attack and its die to the damage",
  /const brace = braceApplies\(\{\n    weaponSystem: weaponData, readied: Boolean\(readied\),\n    targetMounted: Boolean\(targetActor && mountedState\(targetActor\)\.mounted\)\n  \}\);\n  if \(brace\) \{\n    modifiers\.push\(\{ label: "Brace \(readied, against a mounted target\)", value: brace\.attackBonus, type: "circumstance" \}\);/.test(aw)
  && /extraBaseDiceOverride\(weaponData\.damage, extraBaseDice \+ \(brace\?\.extraDice \?\? 0\)\)/.test(aw));
const acw = read("module", "combat", "action-workflow.mjs");
ok("C9 a readied Strike says it is readied, from Ready to the Strike",
  /readied: true\n        \}\);\n        if \(done\) \{\n          await consumeReadiedAction\(actor\);/.test(acw)
  && /export async function resolveAction\(actor, action, \{\n  invokedSkillKey: requestedSkillKey = null, event = null, readied = false,/.test(acw)
  && /rollWeaponAttack\(actor, chosen, \{ event, apPaid: String\(action\.apCost \?\? ""\)\.trim\(\) === "0", readied: Boolean\(readied\) \}\)/.test(acw));
ok("C10 the Strike says what its hit dealt the target",
  /const hitTaken = outcome\?\.hits && strikeLands && !held \? Math\.max\(Number\(damageOutcome\?\.taken \?\? 0\) \|\| 0, hitDealt\) : 0;\n  check\.damageTaken = hitTaken;/.test(aw));
ok("C11 Backswing takes the count back to where it stood",
  /if \(backswingRefund\(\{\n    weaponSystem: weaponData, isReaction, offTurn, mapFrozen,\n    resolved: Boolean\(outcome\?\.resolved\), hits: Boolean\(outcome\?\.hits\) && strikeLands, held, damageTaken: hitTaken\n  \}\)\) \{\n    await setSharedMapCount\(actor, attackIndex\);/.test(aw));
const ds = read("module", "combat", "double-slice-workflow.mjs");
ok("C12 Double Slice counts with Backswing", /const counted = backswingCounts\(swings, DOUBLE_SLICE_ATTACKS\);\n  await setAttackCount\(actor, mapBefore \+ counted\);/.test(ds)
  && /\{ weaponSystem: pair\.first\.system, hits: outcome\.firstHits, damageTaken: Number\(firstCheck\?\.damageTaken \?\? 0\) \|\| 0 \}/.test(ds)
  && /\{ weaponSystem: pair\.second\.system, hits: outcome\.secondHits, damageTaken: Number\(secondCheck\?\.damageTaken \?\? 0\) \|\| 0 \}/.test(ds));
ok("C13 Twin deals its +1 per weapon after the pair, DR already met",
  /const twin = twinBonus\(\{ first: swings\[0\], second: swings\[1\], sameWeapon: sameDoubleWeapon \}\);/.test(ds)
  && /await applyTypedDamage\(twinTarget, \{ amount, type, dr: 0, drBypassed: true \}\);/.test(ds));
const coreTraits = [];
for (const pack of ["weapons", "specific-weapons"]) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  for await (const [k, v] of db.iterator()) if (k.startsWith("!items!")) coreTraits.push(String(v?.system?.traits ?? ""));
  await db.close();
}
ok("C14 no core weapon carries any of the three, so nothing changes without Inner Tempest", coreTraits.length > 70
  && !coreTraits.some((t) => ["backswing", "brace", "twin"].some((n) => t6.hasWeaponTrait({ traits: t }, n))), `${coreTraits.length} read`);

// FOUND IN REVIEW, before the sweep (3.668.1).
ok("C15 'inflicts damage' counts every packet the hit dealt the target (a rune's fire through DR)",
  /const hitDealtHook = targetActor && outcome\.hits && strikeLands && !held\n    \? Hooks\.on\("trgPrimeDamageApplied", \(\{ actor: hurt, amount \} = \{\}\) => \{\n      if \(hurt && hurt\.uuid === targetActor\.uuid\) hitDealt \+= Math\.max\(0, Number\(amount\) \|\| 0\);/.test(aw)
  && /if \(hitDealtHook !== null\) Hooks\.off\("trgPrimeDamageApplied", hitDealtHook\);\n\n  \/\*\n   \* A BLOW THAT WEARS A SPELL DOWN/.test(aw)
  && /Math\.max\(Number\(damageOutcome\?\.taken \?\? 0\) \|\| 0, hitDealt\) : 0;/.test(aw));
ok("C16 Twin: one packet per type, and none to a creature already down (no second Dying step)",
  /byType\.set\(type, \{ amount: \(byType\.get\(type\)\?\.amount \?\? 0\) \+ twin,/.test(ds)
  && /if \(!\(Number\(twinTarget\.system\?\.resources\?\.hp\?\.value \?\? 0\) > 0\)\) \{[\s\S]{0,300}continue;\n      \}\n      const \{ applied \} = await applyTypedDamage\(twinTarget, \{ amount, type, dr: 0, drBypassed: true \}\);/.test(ds));
const af = read("module", "combat", "action-feats-workflow.mjs");
ok("C17 a feat's Strikes with a Backswing weapon: the action's cost is owed only when one inflicted damage",
  /const counted = weapon && hasWeaponTrait\(weapon\.system, "backswing"\)\n    \? checks\.filter\(\(c\) => c && Number\(c\.damageTaken\) > 0\)\.length\n    : resolved;\n  const owed = ladderOwed\(plan\.advanceBy, counted\);/.test(af));
const cw = read("module", "combat", "compound-action-workflow.mjs");
ok("C18 a compound action's 'after' count leaves out a Backswing Strike that inflicted nothing",
  /const uncounted = Boolean\(result\) && hasWeaponTrait\(weapon\?\.system, "backswing"\) && !\(Number\(result\?\.damageTaken\) > 0\);/.test(cw)
  && /\+ total - Object\.values\(used\)\.filter\(\(v\) => v === "uncounted"\)\.length\);/.test(cw));

const EXPECTED = 26;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-it-fixes-3668-1: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-it-fixes-3668-1: ${checks} checks — all green.`);
