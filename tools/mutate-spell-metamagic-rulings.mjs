#!/usr/bin/env node
/** mutate-spell-metamagic-rulings — the mutation half of verify-spell-metamagic-rulings. NEW at 3.716.0; E and N at 3.716.1. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const MM = m("magic", "metamagic.mjs"), CW = m("magic", "cast-workflow.mjs"), CP = m("magic", "cast-power.mjs");
const AS = m("magic", "active-spells.mjs"), SW = m("magic", "spell-warp.mjs"), WA = m("magic", "warp-area.mjs");
const TR = m("combat", "target-relay.mjs"), TW = m("combat", "target-relay-workflow.mjs"), TRW = m("trait-rules-workflow.mjs");
const CG = m("magic", "component-gate.mjs"), CB = m("documents", "combat.mjs");
const MUTATIONS = [
  // R1 — Temporal Extension's ladder (U1)
  { name: "the ladder stops at Hours", file: MM, from: "  { unit: \"12-hour\", seconds: 43200 }\n", to: "", breaks: "R1a/R1c" },
  { name: "10 minutes is ten minutes, not one interval", file: MM, from: "n % 10 === 0 ? { rung: 2, count: n / 10 } : { rung: 1, count: n }", to: "{ rung: 1, count: n }", breaks: "R1b" },
  { name: "a sustained duration is stepped", file: MM, from: "if (!t || sustained || /sustain|", to: "if (!t || /sustain|", breaks: "R1f" },
  { name: "the card's text first again, so the clock reads the old duration", file: MM, from: "  return `${words[rung](at.count)} (${String(duration).trim()}, stepped up", to: "  return `${String(duration).trim()} (${words[rung](at.count)}, stepped up", breaks: "R1h/R1i" },
  { name: "four steps from anywhere", file: MM, from: "ppCost: Math.ceil(basePP / 2), max: temporalLeft,", to: "ppCost: Math.ceil(basePP / 2), max: 4,", breaks: "R1j" },
  { name: "past the top is clamped", file: MM, from: "  if (!at || at.rung + n > TEMPORAL_LADDER.length - 1) return null;\n  const rung = at.rung + n;", to: "  if (!at) return null;\n  const rung = Math.min(TEMPORAL_LADDER.length - 1, at.rung + n);", breaks: "R1g" },
  // R2 — eligibility
  { name: "Extend on unlimited", file: MM, from: "duration && !/unlimited|permanent/i.test(duration) && !isSustainedDuration(spellData)", to: "duration && !isSustainedDuration(spellData)", breaks: "R2a/R2b" },
  { name: "Extend on sustained", file: MM, from: "duration && !/unlimited|permanent/i.test(duration) && !isSustainedDuration(spellData)", to: "duration && !/unlimited|permanent/i.test(duration)", breaks: "R2c" },
  { name: "Heighten needs a save again", file: MM, from: "  if (has(\"heighten spell\")) {", to: "  if (has(\"heighten spell\") && spellData.defence) {", breaks: "R2e" },
  { name: "Distant asks for a range of self again", file: MM, from: "if (has(\"distant spell\") && castOnSelfOnly(spellData)) {", to: "if (has(\"distant spell\") && /^self$/i.test(range)) {", breaks: "R2f" },
  { name: "Reach on any range", file: MM, from: "if (has(\"reach spell\") && /\\d/.test(range) && ", to: "if (has(\"reach spell\") && range && ", breaks: "R2j" },
  { name: "Split on damage with no save", file: MM, from: "damageFormula && String(spellData.category ?? \"\") === \"attack\")", to: "damageFormula && !spellData.defence)", breaks: "R2m" },
  { name: "Selective held to 6", file: MM, from: "ppCost: 1, max: Math.max(1, Math.floor(Number(casterLevel) || 0) + 1),", to: "ppCost: 1, max: 6,", breaks: "R2n" },
  { name: "Split held to 4", file: MM, from: "ppCost: 4, max: Math.max(1, Math.floor((Math.floor(Number(casterLevel) || 0) + 1) / 4)),", to: "ppCost: 4, max: 4,", breaks: "R2o" },
  { name: "Component Mastery offers a change to a component the spell has", file: MM, from: "      if (t === f || components[t]) continue;", to: "      if (t === f) continue;", breaks: "R2q/R2r" },
  // R3 — the aggregate
  { name: "Reach doubles nothing", file: MM, from: "        agg.rangeFactor = 2;", to: "        agg.rangeFactor = 1;", breaks: "R3a" },
  { name: "Widen widens nothing", file: MM, from: "        agg.areaFactor = 2;", to: "        agg.areaFactor = 1;", breaks: "R3a" },
  { name: "Component Mastery's change is dropped", file: MM, from: "        agg.componentSwap = { from, to };", to: "", breaks: "R3a" },
  { name: "Distant is dropped", file: MM, from: "        agg.distant = true;", to: "", breaks: "R3c" },
  // R4 — U8
  { name: "Extend beside Temporal is allowed", file: MM, from: "  if (agg.extend && Number(agg.temporalSteps) > 0)\n", to: "  if (false)\n", breaks: "R4b" },
  { name: "a duration metamagic beside a duration warp is allowed", file: MM, from: "  if (duration && String(spellWarpMods?.durationText ?? \"\").trim())", to: "  if (false)", breaks: "R4c/R4d" },
  { name: "Reach beside a range warp is allowed", file: MM, from: "  if (Number(agg.rangeFactor) > 1 && String(spellWarpMods?.rangeOverride ?? \"\").trim())", to: "  if (false)", breaks: "R4e" },
  { name: "Distant beside a range warp is allowed", file: MM, from: "  if (agg.distant && String(spellWarpMods?.rangeOverride ?? \"\").trim())", to: "  if (false)", breaks: "R4f" },
  { name: "Widen beside an area growth is allowed", file: MM, from: "Number(spellWarpMods?.areaGrowth) > 0 || String(spellWarpMods?.areaOverride ?? \"\").trim()", to: "String(spellWarpMods?.areaOverride ?? \"\").trim()", breaks: "R4g" },
  // C — the counteract PP
  { name: "a cantrip counteracts at 0", file: CP, from: "return heightened || cantrip ? Math.max(spent, max) : spent;", to: "return heightened ? Math.max(spent, max) : spent;", breaks: "C2" },
  { name: "heighten does nothing to a counteract", file: CP, from: "return heightened || cantrip ? Math.max(spent, max) : spent;", to: "return cantrip ? Math.max(spent, max) : spent;", breaks: "C1" },
  { name: "a symbol's own stamp is replaced", file: CP, from: "if (!castId || flags?.counteractAs) return null;", to: "if (!castId) return null;", breaks: "C5" },
  { name: "any cast's effect is stamped", file: CP, from: "  const pp = NOTED.get(castId) ?? 0;", to: "  const pp = NOTED.get(castId) ?? 1;", breaks: "C6" },
  // L — Lingering Performance
  { name: "a lingering performance is still owed its Sustain", file: AS, from: "    sustained: false,\n    lingering: true,", to: "    sustained: true,\n    lingering: true,", breaks: "L1" },
  { name: "a lingering performance never ends by round", file: AS, from: "    endsOnRound: round === null ? null : Number(round) + rounds", to: "    endsOnRound: null", breaks: "L1" },
  { name: "the emanation keeps its old end", file: AS, from: "    ...(entry.emanation ? { emanation: { ...entry.emanation, ends } } : {})\n", to: "", breaks: "L2" },
  { name: "a performance lingers twice", file: AS, from: "if (!(rounds > 0) || entry?.lingering) return null;", to: "if (!(rounds > 0)) return null;", breaks: "L4" },
  { name: "no limit on lingering performances", file: AS, from: "  const room = Math.max(0, Math.trunc(Number(concurrent) || 1) - 1);", to: "  const room = Infinity;", breaks: "L5" },
  { name: "a lapsing composition ends", file: AS, from: "    if (await lingerOnEnd(actor, entry.id, { worldTime: globalThis.game?.time?.worldTime ?? null, round: currentRound ?? null })) continue;\n", to: "", breaks: "W18" },
  // P — the ceilings
  { name: "an uncapped area growth is once again", file: WA, from: "  if (!Number.isFinite(cap) || cap <= 0) return Infinity;", to: "  if (!Number.isFinite(cap) || cap <= 0) return 1;", breaks: "P1/P7" },
  { name: "the fast-healing count ignores the start", file: SW, from: "(Number(m.healingRateMax) - Number(m.healingRateFrom)) / Number(m.healingRateBump)", to: "Number(m.healingRateMax) / Number(m.healingRateBump)", breaks: "P3/P4/P5" },
  // S — the save relay
  { name: "the asker's actor reaches the GM's roll", file: TR, from: "      delete params.actor;\n", to: "", breaks: "S1" },
  { name: "the asker may choose the kind of roll", file: TR, from: "const outcome = await deps.rollSave(target, { ...params, type: \"save\" });", to: "const outcome = await deps.rollSave(target, { type: \"save\", ...params });", breaks: "S1" },
  // W — the wiring
  { name: "the U8 refusal goes on to cast", file: CW, from: "          + conflicts.map((c) => `<p>${c}.</p>`).join(\"\") + `<p><em>Nothing was spent.</em></p></div>`\n      });\n      return null;", to: "          + conflicts.map((c) => `<p>${c}.</p>`).join(\"\") + `<p><em>Nothing was spent.</em></p></div>`\n      });", breaks: "W2" },
  { name: "Reach's range is not written", file: CW, from: "      if (to) warpMods.rangeOverride = to;\n", to: "", breaks: "W3" },
  { name: "Widen's area is not written", file: CW, from: "      if (grow) warpMods.areaGrowth = (Number(warpMods.areaGrowth) || 0) + grow;\n", to: "", breaks: "W5" },
  { name: "Distant's self rows stay on the caster", file: CW, from: "      warpMods.retargetSelfRows = true;\n    }\n  }", to: "    }\n  }", breaks: "W6" },
  { name: "Temporal's stepped duration is not recorded", file: CW, from: "    if (stepped) warpMods.durationText = stepped;\n", to: "", breaks: "W7" },
  { name: "the early gate refuses what a metamagic could fix", file: CW, from: "  if (!componentsOK && !componentGateDeferred) return null;", to: "  if (!componentsOK) return null;", breaks: "W8" },
  { name: "the held gate is never judged again", file: CW, from: "    if (!componentGate(actor, { ...spellData, components: castComponents }, spell.name, { symbolPrepared: Boolean(sigil) })) return null;\n", to: "", breaks: "W9" },
  { name: "the pouch ignores Component Mastery", file: CW, from: "  if (mm.componentSwap?.from && effectiveComponents[mm.componentSwap.from]) {", to: "  if (false) {", breaks: "W10" },
  { name: "Lingering never reaches the entry", file: CW, from: "        linger: mm.linger ?? null,\n", to: "", breaks: "W12" },
  { name: "the save is rolled on the caster's client again", file: CW, from: "    const check = await rollSaveFor(target, {\n      label: altBetter ?", to: "    const check = await TRGCheck.roll({\n      actor: target,\n      label: altBetter ?", breaks: "W13" },
  { name: "the save is never relayed", file: TW, from: "  if (!target || !needsRelay(target) || game.user?.isGM) return rollSaveHere(target, params);", to: "  return rollSaveHere(target, params);", breaks: "W14" },
  { name: "with no GM, the save waits for one", file: TW, from: "  if (!game.users?.activeGM) return rollSaveHere(target, params);\n", to: "", breaks: "W14" },
  { name: "a relayed effect is not stamped", file: TW, from: "  stampCastPower(data);\n  if (!needsRelay(target)) {", to: "  if (!needsRelay(target)) {", breaks: "W16" },
  { name: "a new composition ends a lingering one", file: TRW, from: " && !e.lingering), isComposition, newCastId);", to: "), isComposition, newCastId);", breaks: "W19" },
  { name: "the old composition never lingers", file: TRW, from: "    if (await lingerOnEnd(caster, id, ", to: "    if (false && await lingerOnEnd(caster, id, ", breaks: "W19" },
  // E — one ending at a time (3.716.1)
  { name: "two clocks may end one entry together", file: AS, from: "  if (ENDING.has(key)) return null;\n", to: "", breaks: "E1" },
  { name: "the claim is never let go", file: AS, from: "  } finally {\n    ENDING.delete(key);\n  }", to: "  } finally {\n  }", breaks: "E2" },
  { name: "one claim holds up every entry", file: AS, from: "  return `${actor?.uuid ?? actor?.id ?? \"\"}|${id}`;", to: "  return `${actor?.uuid ?? actor?.id ?? \"\"}`;", breaks: "E3" },
  { name: "the sweep reports what the other clock ended", file: AS, from: "    if (gone) ended.push(entry.name);", to: "    ended.push(entry.name);", breaks: "E4" },
  // N — lingering is not lapsing
  { name: "a lingering performance is called a lapse", file: AS, from: "  const ended = lapsed.filter((e) => !nowLingering.has(e.id)).map((e) => e.name);", to: "  const ended = lapsed.map((e) => e.name);", breaks: "N1" },
  { name: "its rounds are lost", file: AS, from: "rounds: Math.max(0, Math.trunc(Number(e.linger?.rounds) || 0)) }));", to: "rounds: 0 }));", breaks: "N2" },
  { name: "the turn card says nothing of it", file: CB, from: "    for (const { name, rounds } of lapsed.lingered ?? []) {", to: "    for (const { name, rounds } of []) {", breaks: "N3" },
  { name: "the quiet gate still warns", file: CG, from: "const warn = (message) => { if (!quiet) ui.notifications.warn(message); };", to: "const warn = (message) => { ui.notifications.warn(message); };", breaks: "W20" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-spell-metamagic-rulings.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-spell-metamagic-rulings: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-spell-metamagic-rulings: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-spell-metamagic-rulings: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
