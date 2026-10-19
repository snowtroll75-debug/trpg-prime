#!/usr/bin/env node
/**
 * mutate-ff30-block28 — the mutation half of verify-ff30-block28 (3.659.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const PE = m("peril-effect.mjs"), PW = m("peril-workflow.mjs"), DH = m("death-harvest.mjs"), HK = m("codex-hooks-workflow.mjs"), RR = m("regeneration-rules.mjs"),
  DW = m("combat", "damage-workflow.mjs"), CAST = m("magic", "cast-workflow.mjs"), RS = m("combat", "reaver-strikes.mjs"), AW = m("combat", "attack-workflow.mjs"),
  FP = m("fearful-power.mjs"), EFF = m("combat", "effect-application-workflow.mjs"), CAW = m("creature-aura-workflow.mjs");
const MUTATIONS = [
  { name: "the degrees are dropped: the essence lands on every save", file: PE, from: "      ...(Array.isArray(p?.on) && p.on.length ? { on: p.on.map((d) => String(d ?? \"\").trim().toLowerCase()).filter(Boolean) } : {}) }))", to: " }))", breaks: "B1" },
  { name: "every packet lands", file: PE, from: "  return !on || on.includes(String(degree ?? \"\").toLowerCase());", to: "  return true;", breaks: "B1" },
  { name: "the workflow ignores the degrees", file: PW, from: "        if (!extraPacketLands(extra, key)) continue;\n", to: "", breaks: "S1" },
  { name: "the warp's dice miscounted", file: DH, from: "  return 1 + Math.floor((pp - 2) / 2);", to: "  return 1 + Math.floor((pp - 2) / 3);", breaks: "B2" },
  { name: "the PP no longer defaults to the level", file: DH, from: "    const pp = Number(raw.ppCost) > 0 ? Number(raw.ppCost) : Number(level) || 0;", to: "    const pp = Number(raw.ppCost) || 0;", breaks: "B3" },
  { name: "no harvest on a death", file: HK, from: "  await harvestNearbyDeath(victim);\n", to: "", breaks: "S2" },
  { name: "the divine mark is never made", file: RR, from: "some((t) => [\"divinity\", \"divine\"].includes(lower(t))) ? [\"divine\"] : [];", to: "some(() => false) ? [\"divine\"] : [];", breaks: "B4" },
  { name: "the spells do not carry the mark", file: CAST, from: "          damageTypes: [String(secondary.type ?? \"\").toLowerCase(), ...divineDamageMark(spellDamageSource(spell).sourceTraits)].filter(Boolean), sourceLevel", to: "          damageTypes: [String(secondary.type ?? \"\").toLowerCase()].filter(Boolean), sourceLevel", breaks: "S3" },
  { name: "Unstoppable Force read from anything", file: RS, from: "i?.type === \"ability\" && i?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.meleeIgnoresResistance === true", to: "i?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.meleeIgnoresResistance === true", breaks: "B6" },
  { name: "every critical drains", file: RS, from: "  if (!critical || weapon?.flags?.[SYSTEM_ID]?.creatureAttack?.criticalDiceAsSoulDrain !== true) return 0;", to: "  if (!critical) return 0;", breaks: "B6" },
  { name: "the resistances still meet the blow", file: AW, from: "      resistances: unstoppable ? new Set() : targetDefences.resistances,", to: "      resistances: targetDefences.resistances,", breaks: "S4" },
  { name: "the drain dice stay on the blow too", file: AW, from: "    criticalDice: drainDice ? 0 : critDiceKept,", to: "    criticalDice: critDiceKept,", breaks: "S4" },
  { name: "frightened raised by every power in reach", file: FP, from: "  return { ...tag, value: value + 1,", to: "  return { ...tag, value: value + powerNames.length,", breaks: "B7" },
  { name: "status bonuses stack", file: FP, from: "  return Math.max(0, Math.trunc(Number(bonus) || 0) - Math.max(0, Math.trunc(Number(existingStatus) || 0)));", to: "  return Math.max(0, Math.trunc(Number(bonus) || 0));", breaks: "B8" },
  { name: "frightened is never raised", file: EFF, from: "    if (powers.length) tags = tags.map((t) => boostedFrightenedTag(t, powers));", to: "    if (false) tags = tags.map((t) => boostedFrightenedTag(t, powers));", breaks: "S5" },
  { name: "the DB ignores Fearful Power", file: AW, from: "shieldedStrideDB + typedDefence.total + fearfulDB", to: "shieldedStrideDB + typedDefence.total", breaks: "S5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block28.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block28: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block28: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block28: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
