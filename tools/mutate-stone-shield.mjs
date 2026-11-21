#!/usr/bin/env node
/** mutate-stone-shield — the mutation half of verify-stone-shield (Stone Shield, 3.707.0). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const BAR = M("magic", "barrier.mjs");
const BW = M("magic", "barrier-workflow.mjs");
const SE = M("magic", "spell-effects.mjs");
const AWK = M("combat", "attack-workflow.mjs");
const CW = M("magic", "cast-workflow.mjs");
const AL = M("alchemical-workflow.mjs");
const SW = M("magic", "spiritual-weapon-workflow.mjs");
const TR = M("combat", "target-relay.mjs");
const DOW = M("combat", "defence-offer-workflow.mjs");
const PR = M("data", "pack-repairs.mjs");
const MUTATIONS = [
  { name: "A any foe's miss strikes the shield", file: BAR, from: "  if (!who || !uuids(barrier.sourceUuids).includes(who)) return false;\n  const by", to: "  if (!who) return false;\n  const by" },
  { name: "A a miss by 5 strikes it too", file: BAR, from: "return by >= 1 && by <= num(barrier.missWithin);", to: "return by >= 1 && by <= num(barrier.missWithin) + 1;" },
  { name: "A a hit strikes it", file: BAR, from: "  if (!barrier || hits) return false;", to: "  if (!barrier) return false;" },
  { name: "A Hardness ignored", file: BAR, from: "  const taken = Math.max(0, rolled - hardness);", to: "  const taken = rolled;" },
  { name: "A never destroyed", file: BAR, from: "    destroyed: before > 0 && after <= 0", to: "    destroyed: false" },
  { name: "A a disabled shield counts", file: BAR, from: "    if (!effect || effect.disabled) continue;\n    const barrier", to: "    if (!effect) continue;\n    const barrier" },
  { name: "A no cast questions read", file: BAR, from: "    const q = text(row?.castQuestion);", to: "    const q = \"\";" },
  { name: "C the shield scoped to nobody", file: SE, from: "label: effect.label || spell.name, sourceUuids: hostileUuids, spellName", to: "label: effect.label || spell.name, sourceUuids: [], spellName" },
  { name: "C the shield never written", file: SE, from: "          if (barrier) effectFlags[SYSTEM_ID][BARRIER_FLAG] = barrier;", to: "" },
  { name: "D the Strike never asks the shield", file: AWK, from: "    barrierStruck = barrierInTheWay(targetActor, actor, { missBy, hits: outcome.hits });", to: "    barrierStruck = null;" },
  { name: "D a shield's catch is a stray shot too", file: AWK, from: "  if (!barrierStruck && isRanged && strayCandidates.length", to: "  if (isRanged && strayCandidates.length" },
  { name: "D the struck shield's damage lands on the target", file: AWK, from: "  const targetTokenHere = struckObject ? null : (targetTokenOverride ?? firstTargetToken() ?? null);", to: "  const targetTokenHere = targetTokenOverride ?? firstTargetToken() ?? null;" },
  { name: "D the spell attack's miss strikes nothing", file: CW, from: "      const inTheWay = barrierInTheWay(targetActor, actor, { missBy, hits: false });", to: "      const inTheWay = null;" },
  { name: "D the bomb scatters past the shield", file: AL, from: "  } else if (shieldInTheWay) {", to: "  } else if (false) {" },
  { name: "D Spiritual Weapon ignores the DB rows again", file: SW, from: "  const db = Number.isFinite(sheetDB) ? sheetDB + Number(dbRows.total ?? 0) : NaN;", to: "  const db = sheetDB;" },
  { name: "E the relay lets the asker name the damage's Hardness", file: TR, from: "      const answer = await deps.damageBarrier(target, String(payload.effectId ?? \"\"),\n        Math.max(0, Math.floor(Number(payload.damage) || 0)));", to: "      const answer = await deps.damageBarrier(target, String(payload.effectId ?? \"\"),\n        Number(payload.damage) - Number(payload.hardness ?? 0));" },
  { name: "E the Hits never written", file: BW, from: "    if (result.taken > 0) await effect.setFlag(SYSTEM_ID, BARRIER_FLAG, { ...barrier, hits: result.after });", to: "" },
  { name: "E a destroyed shield stays", file: BW, from: "  if (defender.effects?.get?.(effect.id)) await effect.delete();", to: "" },
  { name: "F the question never asked", file: BW, from: "  if (!questions.length || answered) return true;", to: "  return true;" },
  { name: "F a No is not refused", file: BW, from: "    if (!yes) {\n      ui.notifications?.warn?.(castQuestionRefusal(spellName, question));\n      return false;", to: "    if (!yes) {\n      ui.notifications?.warn?.(castQuestionRefusal(spellName, question));\n      continue;" },
  { name: "G offered again against the warded foe", file: BW, from: "      alreadyAgainst: Boolean(event?.attackerUuid", to: "      alreadyAgainst: false && Boolean(event?.attackerUuid" },
  { name: "G the attacker never reaches the requirement", file: DOW, from: "  const event = { kind: String(attack.kind ?? \"weapon\"), attackerUuid: attacker?.uuid ?? \"\" };", to: "  const event = { kind: String(attack.kind ?? \"weapon\") };" },
  { name: "B an owned copy keeps the old row", file: PR, from: "    field: \"effects\", since: \"3.707.0\",", to: "    field: \"effectz\", since: \"3.707.0\"," }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-stone-shield.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-stone-shield: verify-stone-shield already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-stone-shield: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-stone-shield: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
