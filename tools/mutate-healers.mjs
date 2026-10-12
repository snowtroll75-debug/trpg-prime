#!/usr/bin/env node
/**
 * mutate-healers — can verify-healers fail?
 * NEW at 3.470.0.
 *
 * B4 IS THE OFF-BY-ONE THE BEACON INVITES: ending the spell on reaching
 * 4d4 instead of after it steals the last heal, and the card looks
 * identical either way.
 *
 * F2 IS THE SIPHON'S: rounding 7 PP up to four dice pays for a PP nobody
 * spent.
 *
 * R2 IS THE ONE THAT MADE THE RECORD NECESSARY. Moving the lastCast
 * write inside the lock/sustained guard puts it exactly where
 * `registerActiveSpell` already is — and an ordinary arcane soul spell,
 * which is all this reaction is about, never reaches there.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const B = path.join(SYSTEM_ROOT, "module", "magic", "vital-beacon.mjs");
const L = path.join(SYSTEM_ROOT, "module", "magic", "life-siphon.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-healers.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT OF 3.470.0: the beacon came back.
    file: C,
    name: "B14b THE INFINITE BEACON: the spent state is deleted again",
    from: "  if (beaconExhausted(after)) lines.push(beaconEndsLine());",
    to: "  if (beaconExhausted(after)) {\n    lines.push(beaconEndsLine());\n    await caster.unsetFlag(SYSTEM_ID, BEACON_FLAG);\n  }",
    breaks: "B14b — absence reads as a fresh beacon, so the sixth touch heals 4d12"
  },
  {
    // THE OTHER SHIPPED DEFECT: declared data nothing reads.
    file: E,
    name: "B15 THE DECORATIVE LADDER: the declared steps are dropped again",
    from: "            steps: Array.isArray(effect.steps) ? effect.steps : null,",
    to: "            steps: null,",
    breaks: "B15 — the pack row would be decoration and the module default would answer"
  },
  {
    file: B,
    name: "B16 a declared ladder is ignored in favour of the default",
    from: "  return sizes.length ? sizes : BEACON_STEPS.map((size) => ({ dice: BEACON_BASE_DICE, size }));",
    to: "  return BEACON_STEPS.map((size) => ({ dice: BEACON_BASE_DICE, size }));",
    breaks: "B16 — a spell declaring its own ladder would silently get the beacon's"
  },

  {
    // THE OFF-BY-ONE.
    file: B,
    name: "B4 THE STOLEN HEAL: the spell ends on reaching 4d4, not after it",
    // RE-ANCHORED when the ladder moved into the pack entry (3.470.0).
    from: "  if (s.used >= s.steps.length) return null;",
    to: "  if (s.used >= s.steps.length - 1) return null;",
    breaks: "B3/B4 — the fifth and weakest heal would never be rolled"
  },
  {
    file: B,
    name: "B3 the die count steps instead of the die type",
    from: "  return `${s.dice}d${step.size}`;",
    to: "  return `${Math.max(1, s.dice - s.used)}d${s.steps[0].size}`;",
    breaks: "B3/B9 — \"the die type is reduced by one step\", not the count"
  },
  {
    file: B,
    name: "B6 the once-per-round limit is dropped",
    from: "  if (round !== null && s.lastRound !== null && s.lastRound === round) {",
    to: "  if (false) {",
    breaks: "B6 — every ally could touch the beacon in the same round"
  },
  {
    file: B,
    name: "B8 the round limit bites outside an encounter",
    from: "  if (round !== null && s.lastRound !== null && s.lastRound === round) {",
    to: "  if (s.lastRound === (round ?? null)) {",
    breaks: "B8 — one use per session out of initiative would be a different spell"
  },
  {
    file: B,
    name: "B10 the bleed option stops a flat point",
    from: "  return warped ? normaliseBeacon(state).dice : 0;",
    to: "  return warped ? 1 : 0;",
    breaks: "B10 — \"1 point per die of healing used\""
  },
  {
    file: B,
    name: "B11 the line claims healing that did not land",
    from: "      ? `regains <strong>${healed}</strong> HP (${formula} rolled ${rolled}).`",
    to: "      ? `regains <strong>${rolled}</strong> HP (${formula} rolled ${rolled}).`",
    breaks: "B11 — a creature near full health would be told it gained the whole roll"
  },
  {
    // THE SIPHON'S ARITHMETIC.
    file: L,
    name: "F2 THE ROUNDING: 7 PP buys four dice",
    from: "  const sets = Math.floor(Math.max(0, Number(pp) || 0) / spec.ppPerDie)",
    to: "  const sets = Math.ceil(Math.max(0, Number(pp) || 0) / spec.ppPerDie)",
    breaks: "F2/F4 — it would pay for a PP nobody spent"
  },
  {
    file: L,
    name: "S7 a two-tradition spell stops counting",
    from: '  if (!traditions.split(/[,;/]/).map((t) => t.trim()).includes(spec.tradition)) {',
    to: "  if (traditions !== spec.tradition) {",
    breaks: "S7 — \"arcane, ethereal\" is an ordinary entry and would be refused"
  },
  {
    file: L,
    name: "S5 a cast from an earlier round still qualifies",
    from: "  if ((record.round ?? null) !== (round ?? null)) {",
    to: "  if (false) {",
    breaks: "S5 — the record is not cleared between rounds"
  },
  {
    file: L,
    name: "S9 a spell below the minimum still qualifies",
    from: "  if (pp < spec.minimumPP) {",
    to: "  if (false) {",
    breaks: "S9 — \"of at least 2 PP\" is in the printed trigger"
  },
  {
    file: L,
    name: "S8 the trait half of the trigger is dropped",
    from: '  if (!traits.split(/[,;/]/).map((t) => t.trim()).includes(spec.trait)) {',
    to: "  if (false) {",
    breaks: "S8 — any arcane spell would siphon, not only a soul one"
  },
  {
    // WHY THE RECORD EXISTS.
    file: W,
    name: "R2 THE RECORD GOES BACK INSIDE THE LOCK GUARD",
    from: "    await actor.setFlag(SYSTEM_ID, LAST_CAST_FLAG, {",
    to: "    if (registersCast) await actor.setFlag(SYSTEM_ID, LAST_CAST_FLAG, {",
    breaks: "R2 — an ordinary arcane soul spell would record nothing at all"
  },
  {
    file: W,
    name: "R3 the record keeps the printed cost instead of what was spent",
    from: "      name: spell.name,\n      pp: ppSpent,\n      tradition: String(spellData.tradition ?? \"\"),",
    to: "      name: spell.name,\n      pp: Number(spellData.ppCost) || 0,\n      tradition: String(spellData.tradition ?? \"\"),",
    breaks: "R3 — a Heroic cast halves the total, and the siphon would pay out on PP nobody spent"
  },
  {
    file: E,
    name: "E3 the siphon heals whoever is targeted instead of the caster",
    from: '            await caster.update({ "system.resources.hp.value": before + healed });',
    to: '            await (targets[0] ?? caster).update({ "system.resources.hp.value": before + healed });',
    breaks: "E3 — \"heal yourself\" is the printed effect"
  },
  {
    file: E,
    name: "E6 the beacon loses its button",
    from: '          lines.push(line(`<button type="button" data-action="touchVitalBeacon" `',
    to: '          if (false) lines.push(line(`<button type="button" data-action="touchVitalBeacon" `',
    breaks: "E6 — a beacon nobody can touch is a spell that does nothing"
  },
  {
    file: C,
    name: "E7 the button is spent after one use",
    from: "        beaconButton.disabled = false;",
    to: "        beaconButton.disabled = true;",
    breaks: "E7 — four of the beacon's five uses would be unreachable"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([B, L, E, W, C, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-healers: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-healers: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-healers: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
