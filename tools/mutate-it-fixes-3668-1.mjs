#!/usr/bin/env node
/** mutate-it-fixes-3668-1 — the mutation half of verify-it-fixes-3668-1. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), FW = m("feats-workflow.mjs"),
  AW = m("combat", "attack-workflow.mjs"), ACW = m("combat", "action-workflow.mjs"), DS = m("combat", "double-slice-workflow.mjs"),
  T6 = m("combat", "weapon-chapter6-traits.mjs");
const MUTATIONS = [
  // A
  { name: "the declaration is dropped when queued", file: API, from: "use: entry.use, ownsFocusUse: entry.ownsFocusUse === true });", to: "use: entry.use });", breaks: "A1" },
  { name: "any truthy declaration counts", file: API, from: "use: entry.use, ownsFocusUse: entry.ownsFocusUse === true });", to: "use: entry.use, ownsFocusUse: Boolean(entry.ownsFocusUse) });", breaks: "A1" },
  { name: "the flush forgets it", file: APIW, from: "module: true, ...(entry.ownsFocusUse === true ? { ownsFocusUse: true } : {}) };", to: "module: true };", breaks: "A2" },
  { name: "the Use button still gates and spends", file: FW, from: "  if (ownsFocusUse(item)) return run();\n", to: "", breaks: "A3" },
  { name: "a core entry may declare it", file: FW, from: "  return automation?.module === true && automation?.ownsFocusUse === true;", to: "  return automation?.ownsFocusUse === true;", breaks: "A4" },
  { name: "a type table entry may declare it", file: FW, from: "  if (TYPE_AUTOMATION[item?.type]) return false;\n  const automation", to: "  const automation", breaks: "A4" },
  // B
  { name: "a set penalty still names the attack number", file: AW, from: "  return set && name ? name : `attack ${attackIndex + 1}`;", to: "  return `attack ${attackIndex + 1}`;", breaks: "B1" },
  { name: "a nameless set penalty is blank (Sweeping Strike's row loses its attack number)", file: AW, from: "  return set && name ? name : `attack ${attackIndex + 1}`;", to: "  return set ? name : `attack ${attackIndex + 1}`;", breaks: "B1" },
  { name: "the row ignores the helper", file: AW, from: "label: `Multiple Attack Penalty (${mapSetBy({ mapOverride, optionLabel, attackIndex })}", to: "label: `Multiple Attack Penalty (attack ${attackIndex + 1}", breaks: "B2" },
  // C
  { name: "a trait is matched inside a word", file: T6, from: "  return new RegExp(`(^|[\\\\s,])${name}(?=$|[\\\\s,(])`, \"i\").test(String(weaponSystem?.traits ?? \"\"));", to: "  return new RegExp(name, \"i\").test(String(weaponSystem?.traits ?? \"\"));", breaks: "C1" },
  { name: "Brace without Ready", file: T6, from: "  if (!readied || !targetMounted || !hasWeaponTrait(weaponSystem, \"brace\")) return null;", to: "  if (!targetMounted || !hasWeaponTrait(weaponSystem, \"brace\")) return null;", breaks: "C2" },
  { name: "Brace against anyone", file: T6, from: "  if (!readied || !targetMounted || !hasWeaponTrait(weaponSystem, \"brace\")) return null;", to: "  if (!readied || !hasWeaponTrait(weaponSystem, \"brace\")) return null;", breaks: "C2" },
  { name: "Brace's bonus is +1", file: T6, from: "const BRACE_ATTACK_BONUS = 2;", to: "const BRACE_ATTACK_BONUS = 1;", breaks: "C2" },
  { name: "a hit that inflicted nothing still counts", file: T6, from: "  return !(hits && Number(damageTaken) > 0);\n}", to: "  return !hits;\n}", breaks: "C3" },
  { name: "a held blow is taken back", file: T6, from: "  if (isReaction || offTurn || mapFrozen || !resolved || held) return false;", to: "  if (isReaction || offTurn || mapFrozen || !resolved) return false;", breaks: "C4" },
  { name: "a frozen count is taken back", file: T6, from: "  if (isReaction || offTurn || mapFrozen || !resolved || held) return false;", to: "  if (isReaction || offTurn || !resolved || held) return false;", breaks: "C4" },
  { name: "Double Slice ignores Backswing", file: T6, from: "  return Math.max(0, Number(attacks) - uncounted);", to: "  return Math.max(0, Number(attacks));", breaks: "C5" },
  { name: "Twin needs only one Twin weapon", file: T6, from: "  return twin(first) && twin(second) ? TWIN_BASE_DAMAGE : 0;", to: "  return twin(first) || twin(second) ? TWIN_BASE_DAMAGE : 0;", breaks: "C6" },
  { name: "Twin from a hit that inflicted nothing", file: T6, from: "s.hits && Number(s.damageTaken) > 0;", to: "s.hits;", breaks: "C6" },
  { name: "Twin from one double weapon", file: T6, from: "  if (sameWeapon || !first || !second) return 0;", to: "  if (!first || !second) return 0;", breaks: "C6" },
  { name: "the Strike takes no readied option", file: AW, from: "  readied = false,\n  // THE REROLL OF A FUMBLED STRIKE", to: "  readiedStrike = false,\n  // THE REROLL OF A FUMBLED STRIKE", breaks: "C7" },
  { name: "Brace's bonus never reaches the attack", file: AW, from: "    modifiers.push({ label: \"Brace (readied, against a mounted target)\", value: brace.attackBonus, type: \"circumstance\" });", to: "", breaks: "C8" },
  { name: "Brace's die never reaches the damage", file: AW, from: "extraBaseDiceOverride(weaponData.damage, extraBaseDice + (brace?.extraDice ?? 0))", to: "extraBaseDiceOverride(weaponData.damage, extraBaseDice)", breaks: "C8" },
  { name: "Ready forgets to say so", file: ACW, from: "          event,\n          readied: true\n        });", to: "          event\n        });", breaks: "C9" },
  { name: "the Strike action drops it", file: ACW, from: ", readied: Boolean(readied) });", to: " });", breaks: "C9" },
  { name: "a held blow reports its damage", file: AW, from: "  const hitTaken = outcome?.hits && strikeLands && !held ? Math.max(Number(damageOutcome?.taken ?? 0) || 0, hitDealt) : 0;", to: "  const hitTaken = Math.max(Number(damageOutcome?.taken ?? 0) || 0, hitDealt);", breaks: "C10" },
  { name: "Backswing takes the count back by one too many", file: AW, from: "  })) {\n    await setSharedMapCount(actor, attackIndex);", to: "  })) {\n    await setSharedMapCount(actor, Math.max(0, attackIndex - 1));", breaks: "C11" },
  { name: "Double Slice still adds two", file: DS, from: "  await setAttackCount(actor, mapBefore + counted);", to: "  await setAttackCount(actor, mapBefore + DOUBLE_SLICE_ATTACKS);", breaks: "C12" },
  { name: "Double Slice judges by the roll, not the pair's rules", file: DS, from: "{ weaponSystem: pair.first.system, hits: outcome.firstHits,", to: "{ weaponSystem: pair.first.system, hits: Boolean(firstCheck?.attackOutcome?.hits),", breaks: "C12" },
  { name: "a rune's damage does not count as inflicted", file: AW, from: "      if (hurt && hurt.uuid === targetActor.uuid) hitDealt += Math.max(0, Number(amount) || 0);", to: "", breaks: "C15" },
  { name: "the listener outlives the Strike", file: AW, from: "  if (hitDealtHook !== null) Hooks.off(\"trgPrimeDamageApplied\", hitDealtHook);\n", to: "", breaks: "C15" },
  { name: "Twin worsens Dying on a creature already down", file: DS, from: "      if (!(Number(twinTarget.system?.resources?.hp?.value ?? 0) > 0)) {", to: "      if (false) {", breaks: "C16" },
  { name: "Twin deals one packet per weapon", file: DS, from: "      byType.set(type, { amount: (byType.get(type)?.amount ?? 0) + twin,", to: "      byType.set(`${type}${byType.size}`, { amount: twin,", breaks: "C16" },
  { name: "a feat with a Backswing weapon owes its cost after a miss", file: m("combat", "action-feats-workflow.mjs"), from: "  const owed = ladderOwed(plan.advanceBy, counted);", to: "  const owed = ladderOwed(plan.advanceBy, resolved);", breaks: "C17" },
  { name: "a compound action counts every Backswing Strike", file: m("combat", "compound-action-workflow.mjs"), from: "+ total - Object.values(used).filter((v) => v === \"uncounted\").length);", to: "+ total);", breaks: "C18" },
  { name: "Twin's damage meets DR again", file: DS, from: "{ amount, type, dr: 0, drBypassed: true }", to: "{ amount, type }", breaks: "C13" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-it-fixes-3668-1.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-it-fixes-3668-1: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-it-fixes-3668-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-it-fixes-3668-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
