#!/usr/bin/env node
/** mutate-turn-table — the mutation half of verify-turn-table. NEW at 3.686.0 (H18). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const TT = m("magic", "turn-table.mjs"), TW = m("magic", "turn-table-workflow.mjs"), SE = m("magic", "spell-effects.mjs"), CB = m("documents", "combat.mjs"),
  SW = m("magic", "spell-warp.mjs"), API = m("module-api-workflow.mjs"), EK = m("magic", "effect-kinds.mjs"), FIX = path.join(SYSTEM_ROOT, "tools", "ea-block8a-core-fixes.mjs"), EA = m("combat", "effect-application-workflow.mjs"), CT = m("combat", "condition-timing.mjs"), TP = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const MUTATIONS = [
  { name: "T1 stunned is 1d4", file: TT, from: "condition: \"stunned\", formula: \"1d3\"", to: "condition: \"stunned\", formula: \"1d4\"", breaks: "T1" },
  { name: "T1 per 1 failure by default", file: TT, from: "label: \"Insanity\", die: \"1d10\", per: 2,", to: "label: \"Insanity\", die: \"1d10\", per: 1,", breaks: "T1/T3/M1" },
  { name: "T2 the slowed band is 5–8", file: TT, from: "Object.freeze({ min: 5, max: 7, text: \"slowed 1d3\"", to: "Object.freeze({ min: 5, max: 8, text: \"slowed 1d3\"", breaks: "T1/T2" },
  { name: "T3 the warp's rate is ignored", file: TT, from: "  const per = Math.trunc(Number(warpPer) || 0) >= 1 ? Math.trunc(Number(warpPer)) : spec.per;", to: "  const per = spec.per;", breaks: "T3/M2" },
  { name: "T4 a range past the die is accepted", file: TT, from: " || max > faces) return null;", to: ") return null;", breaks: "T4" },
  { name: "T4 a 2d6 die is accepted", file: TT, from: "const DIE = /^1d(\\d+)$/i;", to: "const DIE = /^\\d*d(\\d+)$/i;", breaks: "T4" },
  { name: "M3 an unmeasured margin marks a round", file: TW, from: "  if (rounds === null) {\n    return { marked: false,", to: "  if (false) {\n    return { marked: false,", breaks: "M3" },
  { name: "M1 the marker forgets the DC", file: TW, from: "turnsLeft: rounds, dc: Number(dc) || 0, casterUuid, spellName }", to: "turnsLeft: rounds, casterUuid, spellName }", breaks: "M1" },
  { name: "A1 the last roll's effects stay", file: TW, from: "  if (old.length) await actor.deleteEmbeddedDocuments(\"ActiveEffect\", old).catch(() => {});\n", to: "", breaks: "A1" },
  { name: "A1 stranded roll effects stay", file: TW, from: "    if (stranded.length) await actor.deleteEmbeddedDocuments(\"ActiveEffect\", stranded).catch(() => {});\n", to: "", breaks: "A1" },
  { name: "A1 no turn is spent", file: TW, from: "{ ...record, turnsLeft: left - 1, raised }", to: "{ ...record, turnsLeft: left, raised }", breaks: "A1/A2" },
  { name: "A4 a row's effects are not tagged", file: TW, from: "saveDC: Number(record.dc) || 0, castId: turnTableRollTag(marker.id)", to: "saveDC: Number(record.dc) || 0, castId: null", breaks: "A4" },
  { name: "W1 the case ignores the warp's rate", file: SE, from: "margin: mine?.margin ?? null, per: Number(warpMods?.turnTablePer ?? 0) || 0,", to: "margin: mine?.margin ?? null, per: 0,", breaks: "W1" },
  { name: "W2 the turn start does not roll it", file: CB, from: "      for (const said of await applyTurnTables(actor)) lines.push(TRGCombat.#chatLine(said));\n", to: "", breaks: "W2" },
  { name: "W3 the aggregator drops the rate", file: SW, from: "    if (m.turnTablePer) mods.turnTablePer = ", to: "    if (false) mods.turnTablePer = ", breaks: "W3" },
  { name: "W3 the merge drops the rate", file: SW, from: "      turnTablePer: smallerRate(a.mods?.turnTablePer, b.mods?.turnTablePer),", to: "      turnTablePer: 0,", breaks: "W3" },
  { name: "W4 no helper for modules", file: API, from: "      markTurnTable: async (...args) => (await import(\"./magic/turn-table-workflow.mjs\")).markTurnTable(...args)\n", to: "      markTurnTable: null\n", breaks: "W4" },
  { name: "W5 the kind is not declared", file: EK, from: "  \"turnTable\",\n", to: "", breaks: "W5" },
  { name: "X1 the warp is not declared", file: FIX, from: "    to: { turnTablePer: 1 },", to: "    to: {},", breaks: "X1" },
  { name: "R3 the rise is not recorded", file: TW, from: "turnsLeft: left - 1, raised },", to: "turnsLeft: left - 1, raised: [] },", breaks: "R3?" },
  { name: "W3 a round is ten seconds", file: TT, from: "export const ROUND_SECONDS = 6;", to: "export const ROUND_SECONDS = 10;", breaks: "W1/W3" },
  { name: "B2 a roll in combat keeps the world-clock end", file: TW, from: ",\n        // A ROLL IS A TURN IN COMBAT: from here the counted turns govern, so any world-clock end goes.\n        [`flags.${SYSTEM_ID}.spellEffect`]: false", to: "", breaks: "W2" },
  { name: "B3 any client clocks the markers", file: TW, from: "  if (!isActingGM()) return 0;\n  const actors = new Set();", to: "  const actors = new Set();", breaks: "W2b" },
  { name: "B3 the scene's tokens are not swept", file: TW, from: "  for (const t of Array.from(combat?.scene?.tokens ?? [])) if (t?.actor) actors.add(t.actor);\n", to: "", breaks: "W2b" },
  { name: "B3 the clock is the turns, not their seconds", file: TW, from: "turnTableEndTime(now, record.turnsLeft)", to: "turnTableEndTime(now, 0)", breaks: "W2b" },
  { name: "B4 the hook is not registered", file: TP, from: "    clockTurnTablesAfterCombat(combat).catch(", to: "    (async () => 0)(combat).catch(", breaks: "W2c" },
  { name: "A3 the marker outlives its turns", file: TW, from: "        endingByPass.add(marker.id);\n        await marker.delete().catch(() => {});", to: "        endingByPass.add(marker.id);", breaks: "A3" },
  { name: "R3 the rise is never taken back", file: TW, from: "    if (to !== null) await actor.toggleStatusEffect?.(entry.key, { active: true, value: to })?.catch?.(() => {});", to: "", breaks: "I2b/I2c" },
  { name: "W1 the marker has no world-clock end outside combat", file: TW, from: "{ spellEffect: true, spellEffectEnd: turnTableEndTime(game.time?.worldTime, rounds) })", to: "{})", breaks: "W1/W1c" },
  { name: "W4 a roll's new conditions last no time of their own", file: TW, from: "system: { duration: \"1 round\", effects: fresh }", to: "system: { duration: \"\", effects: fresh }", breaks: "W4" },
  { name: "B1 a marker in combat takes a world-clock end", file: TW, from: "...(countsTurnsIn(target, allCombats()) ? {} : {", to: "...(false ? {} : {", breaks: "W1b" },
  { name: "H1 any running combat counts the turns", file: TT, from: "    if (!combat?.started) continue;\n    for (const c of Array.from(combat.combatants ?? [])) {", to: "    if (!combat?.started) continue;\n    return true;\n    for (const c of Array.from(combat.combatants ?? [])) {", breaks: "W1c/W1d" },
  { name: "H1 a combat not started counts the turns", file: TT, from: "    if (!combat?.started) continue;\n    for (const c", to: "    for (const c", breaks: "W1c/W1d" },
  { name: "H1 a combatant is matched by identity only", file: TT, from: " || (actor.uuid && c.actor.uuid === actor.uuid)", to: "", breaks: "W1d" },
  { name: "H2 a deleted combatant is not clocked", file: TW, from: "  if (!actor || countsTurnsIn(actor, allCombats(), { except: combatant })) return 0;\n  return clockMarkersOf([actor]);", to: "  return 0;", breaks: "W2d" },
  { name: "H2 a combatant in another combat is clocked", file: TW, from: "  if (!actor || countsTurnsIn(actor, allCombats(), { except: combatant })) return 0;", to: "  if (!actor) return 0;", breaks: "W2d" },
  { name: "H2 any client clocks a removed combatant", file: TW, from: "  if (!isActingGM()) return 0;\n  const actor = combatant?.actor;", to: "  const actor = combatant?.actor;", breaks: "W2d" },
  { name: "H3 the combatant hook is not registered", file: TP, from: "    clockTurnTablesOfCombatant(combatant).catch(", to: "    (async () => 0)(combatant).catch(", breaks: "W2e" },
  { name: "H4 the marker-deletion hook is not registered", file: TP, from: "    onTurnTableMarkerDeleted(effect).catch(", to: "    (async () => 0)(effect).catch(", breaks: "W2e" },
  { name: "I1 a standing condition goes down the general path", file: TW, from: "  if (standing.length) raised = await raiseStanding(actor, standing, label, lines);", to: "  fresh.push(...standing);", breaks: "I1/I2" },
  { name: "I1 every row is laid by the spell engine", file: TT, from: "    if (r?.kind === \"condition\" && r.condition && isPresent(String(r.condition))) standing.push(r);", to: "    if (false) standing.push(r);", breaks: "I1/I4" },
  { name: "I2 a standing valued condition is not raised", file: TW, from: "    await actor.toggleStatusEffect?.(key, { active: true, value: after });\n    // HOW IT STACKS", to: "    // HOW IT STACKS", breaks: "I2" },
  { name: "I2 the rise is not recorded", file: TW, from: "    raised.push({ key, before, after, adds: combinedConditionValue(key, 1, 1) > 1 });\n", to: "", breaks: "I2/I2b" },
  { name: "I2 an unvalued standing condition is recorded", file: TW, from: "    if (!CONDITIONS[key]?.valued) { lines.push(`<em>${actor.name} is already ${name}: ${label} leaves it as it is.</em>`); continue; }", to: "    if (!CONDITIONS[key]?.valued) { raised.push({ key, before: 1, after: 2 }); continue; }", breaks: "I1" },
  { name: "I4 the take-back may go below before", file: TT, from: "  const to = Math.max(before, now - (after - before));", to: "  const to = now - (after - before);", breaks: "I4" },
  { name: "I4 the take-back takes nothing off", file: TT, from: "  return to < now ? to : null;", to: "  return null;", breaks: "I2b/I4" },
  { name: "I5 a marker's end undoes nothing", file: TW, from: "  if (!isActingClientFor(actor)) return false;\n  await undoLastRoll(actor, effect.id, record);", to: "  if (!isActingClientFor(actor)) return false;", breaks: "I2c" },
  { name: "I5 any client undoes a marker's end", file: TW, from: "  if (!isActingClientFor(actor)) return false;\n  await undoLastRoll", to: "  await undoLastRoll", breaks: "I2c" },
  { name: "G2 the general path re-gains the standing cast-id guard", file: EA, from: "        expiresRound: allowed, duration, spellEffect, spellEffectEnd, castId,\n        ...(wasAlreadyPresent ? {} : {", to: "        expiresRound: allowed, duration, spellEffect, spellEffectEnd, castId: wasAlreadyPresent ? null : castId,\n        ...(wasAlreadyPresent ? {} : {", breaks: "G1/G2" },
  { name: "I6 a keep-the-higher rise is subtracted", file: TT, from: "  if (!entry.adds) return now === after ? before : null;\n", to: "", breaks: "I5/I5c" },
  { name: "I6 a keep-the-higher rise is taken back whatever stands", file: TT, from: "  if (!entry.adds) return now === after ? before : null;", to: "  if (!entry.adds) return before < now ? before : null;", breaks: "I5/I5c" },
  { name: "I6 an adding rise is restored only at the roll's value", file: TT, from: "  if (!entry.adds) return now === after ? before : null;", to: "  return now === after ? before : null;", breaks: "I5b/I5d" },
  { name: "I6 every rise is recorded as adding", file: TW, from: "adds: combinedConditionValue(key, 1, 1) > 1 });", to: "adds: true });", breaks: "I2/I5c" },
  { name: "I6 no rise is recorded as adding", file: TW, from: "adds: combinedConditionValue(key, 1, 1) > 1 });", to: "adds: false });", breaks: "I5d" },
  { name: "J1 the deleted combatant is not ignored", file: TT, from: "      if (except && c === except) continue;\n", to: "", breaks: "W2d" },
  { name: "J1 the deleted combatant's whole combat is ignored", file: TT, from: "      if (except && c === except) continue;", to: "      if (except && combat.combatants?.includes?.(except)) break;", breaks: "W2f" },
  { name: "J2 a creature joining a started combat keeps its clock", file: TW, from: "  return unclockMarkersOf([combatant.actor]);", to: "  return 0;", breaks: "W2g" },
  { name: "J2 joining a combat not started takes the clock", file: TW, from: "  if (!isActingGM() || !combatant?.parent?.started || !combatant.actor) return 0;", to: "  if (!isActingGM() || !combatant.actor) return 0;", breaks: "W2h" },
  { name: "J2 any client takes a joining creature's clock", file: TW, from: "  if (!isActingGM() || !combatant?.parent?.started || !combatant.actor) return 0;", to: "  if (!combatant?.parent?.started || !combatant.actor) return 0;", breaks: "W2g" },
  { name: "J3 a combat's start keeps the clocks", file: TW, from: "  return unclockMarkersOf(Array.from(combat.combatants ?? []).map((c) => c?.actor).filter(Boolean));", to: "  return 0;", breaks: "W2h" },
  { name: "J3 any combat update takes the clocks", file: TW, from: "  if (!isActingGM() || !combat?.started || !(\"round\" in (change ?? {}))) return 0;", to: "  if (!isActingGM() || !combat?.started) return 0;", breaks: "W2h" },
  { name: "J4 the clock is kept, only marked", file: TW, from: "[`flags.${SYSTEM_ID}.spellEffect`]: false, [`flags.${SYSTEM_ID}.-=spellEffectEnd`]: null })", to: "[`flags.${SYSTEM_ID}.spellEffect`]: false })", breaks: "W2g/W2h" },
  { name: "J5 the join hook is not registered", file: TP, from: "    unclockTurnTablesOfCombatant(combatant).catch(", to: "    (async () => 0)(combatant).catch(", breaks: "W2i" },
  { name: "J5 the start hook is not registered", file: TP, from: "    unclockTurnTablesOfCombat(combat, change).catch(", to: "    (async () => 0)(combat, change).catch(", breaks: "W2i" },
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-turn-table.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-turn-table: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-turn-table: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-turn-table: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
