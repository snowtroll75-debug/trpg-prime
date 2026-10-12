#!/usr/bin/env node
/**
 * verify-natural-defence — the spell's rules, and the pack it reads from.
 *
 * NEW at 3.399.0, for Natural Defence (Chapter 10, PP 0).
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE INTERESTING CHECK IS C3, and it is the one this spell needed.
 *
 * The caster-level step is recorded in the compendium as PROSE — the
 * spell's `casterLevelMods` carries `{threshold: 10, text: "The bonus
 * increases to +2"}` and there is no numeric field for "the bonus
 * becomes 2". So the threshold is read from the pack (one place, not
 * two) but the 2 lives in `naturalDefenceSaveBonus`, and nothing connects
 * them.
 *
 * C3 connects them: it reads the sentence back out of the pack, pulls
 * the number the prose names, and fails if the function disagrees. If
 * the book ever says "+3", the pack text changes and this check catches
 * a function still handing out 2.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS ABOUT A TYPED BONUS NOT LANDING, which is the half of
 * this spell most likely to look like a bug at the table. Appendix 1
 * takes the BEST of a bonus type rather than summing them, so a
 * character already carrying a larger resistance bonus gains nothing
 * from a +1 — and the card has to say so rather than reporting the
 * printed number as though it had applied. Cutting Words learned the
 * same lesson for circumstance penalties; this is that lesson reused.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  NATURAL_DEFENCE_NAME, NATURAL_DEFENCE_PP,
  naturalDefenceSaveBonus, naturalDefenceTriggers,
  naturalDefenceEligibility, naturalDefenceModifier, naturalDefenceResult
} from "../module/magic/natural-defence.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. The bonus and its caster-level step
 * ================================================================== */

ok("A1 below the threshold the bonus is +1", naturalDefenceSaveBonus(9, 10) === 1);
ok("A2 at the threshold it steps up", naturalDefenceSaveBonus(10, 10) === 2);
ok("A3 above the threshold it stays stepped", naturalDefenceSaveBonus(20, 10) === 2);
ok("A4 a level of zero is the base bonus", naturalDefenceSaveBonus(0, 10) === 1);

// A5. THE FAILURE MODE THAT MATTERS. A spell whose casterLevelMods went
// missing yields a threshold of 0, and `level >= 0` is true for
// everybody — so the naive comparison would silently hand every caster
// in the game the upgraded bonus.
ok("A5 an absent threshold does not upgrade everyone", naturalDefenceSaveBonus(20, 0) === 1,
  "a missing threshold must fail to the BASE bonus, not the improved one");
ok("A6 a negative threshold is treated the same way", naturalDefenceSaveBonus(20, -5) === 1);
ok("A7 a non-numeric level is the base bonus", naturalDefenceSaveBonus("x", 10) === 1);

/* ================================================================== *
 * B. What it answers, and who may answer it
 * ================================================================== */

ok("B1 a save triggers it", naturalDefenceTriggers("save") === true);
for (const other of ["attack", "skill", "initiative", "flat", ""]) {
  ok(`B2 a ${other || "blank"} check does not`, naturalDefenceTriggers(other) === false);
}
ok("B3 the type is matched case-insensitively", naturalDefenceTriggers(" SAVE ") === true);

const state = (over = {}) => ({
  hasSpell: true, reactions: 1, inCombat: true, isSelf: true, ...over
});

ok("B4 a caster with the spell, a reaction and their own save may answer",
  naturalDefenceEligibility(state()).eligible === true);
ok("B5 without the spell, no", naturalDefenceEligibility(state({ hasSpell: false })).eligible === false);
ok("B6 and it says why",
  /does not know/.test(naturalDefenceEligibility(state({ hasSpell: false })).reason));

// B7. SELF ONLY, which is the difference from Cutting Words. "You make
// saving throw" — offering this on somebody else's save would be a
// different spell.
ok("B7 somebody else's save is not the trigger",
  naturalDefenceEligibility(state({ isSelf: false })).eligible === false);
ok("B7b and it says why",
  /your own saving throw/.test(naturalDefenceEligibility(state({ isSelf: false })).reason));

ok("B8 no reaction left in combat means no",
  naturalDefenceEligibility(state({ reactions: 0 })).eligible === false);
// B9. OUTSIDE COMBAT THERE IS NO REACTION ECONOMY — the same reading
// cuttingWordsEligibility already uses.
ok("B9 out of combat a spent reaction does not block it",
  naturalDefenceEligibility(state({ reactions: 0, inCombat: false })).eligible === true);
ok("B10 every refusal carries a reason",
  [{ hasSpell: false }, { isSelf: false }, { reactions: 0 }]
    .every((o) => (naturalDefenceEligibility(state(o)).reason ?? "").length > 5),
  "a button that silently fails to appear is the shape the anti-silence rule refuses");

/* ================================================================== *
 * C. The pack agrees with the rules
 * ================================================================== */

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.set(String(value.name).trim().toLowerCase(), value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const spells = await spellsPack();
ok("C0a the spells pack could be read", spells !== null);

const spell = spells?.get(NATURAL_DEFENCE_NAME) ?? null;
ok(`C0b "${NATURAL_DEFENCE_NAME}" is a real spell in the pack`, spell !== null,
  "the name is a lookup key — this is the Improved Combat Reflexes shape");

if (spell) {
  ok("C1 it costs no Power Points", Number(spell.system?.ppCost) === NATURAL_DEFENCE_PP,
    `pack says ${spell.system?.ppCost}`);
  ok("C2 it is cast as a Reaction",
    String(spell.system?.castAP ?? "").trim().toLowerCase() === "reaction",
    `pack says "${spell.system?.castAP}" — the whole design assumes a reaction`);

  const mods = Array.isArray(spell.system?.casterLevelMods) ? spell.system.casterLevelMods : [];
  ok("C3a it declares a caster-level modification", mods.length > 0,
    "without one the threshold is 0 and the bonus never steps up");

  // C3 — THE CHECK THIS SPELL NEEDED. The step is recorded as prose, so
  // the number the function hands out and the number the book prints
  // have nothing connecting them. This reads the sentence back.
  const printed = mods.map((m) => String(m?.text ?? "")).join(" ");
  const named = /\+\s*(\d+)/.exec(printed);
  ok("C3b the modification names a number", named !== null, `text: "${printed}"`);
  if (named) {
    const threshold = Math.min(...mods.map((m) => Number(m.threshold) || 0).filter((n) => n > 0));
    ok(`C3c the function's stepped bonus matches the printed text (+${named[1]})`,
      naturalDefenceSaveBonus(threshold, threshold) === Number(named[1]),
      `function gives +${naturalDefenceSaveBonus(threshold, threshold)}, pack text says +${named[1]}`);
    ok(`C3d and it does not step below the printed threshold (${threshold})`,
      naturalDefenceSaveBonus(threshold - 1, threshold) === 1);
  }

  // C4. THE SOMATIC COMPONENT IS WHY THE CAST MUST BE A REAL CAST. If
  // the spell needs a free hand, only `castSpell` knows whether there is
  // one — which is the argument against applying the bonus by hand.
  ok("C4 it declares its components", typeof spell.system?.components === "object"
    && spell.system.components !== null);

  // C5. NO `effects` ENTRY, and that is correct rather than missing.
  // The whole mechanic is the card offer; Cutting Words is the same.
  ok("C5 it carries no effects array entry",
    (spell.system?.effects ?? []).length === 0,
    "the mechanic lives in the card offer, as Cutting Words does");
}

/* ================================================================== *
 * D. A typed bonus that may not land
 * ================================================================== */

{
  const mod = naturalDefenceModifier(1);
  ok("D1 the modifier is a resistance bonus", mod.type === "resistance",
    `got "${mod.type}" — Appendix 1 takes the best of a TYPE, and the type decides which pool`);
  ok("D2 it carries the value", mod.value === 1);
  ok("D3 it is labelled for the card", /Natural Defence/.test(mod.label));
  ok("D4 a negative bonus is floored at zero", naturalDefenceModifier(-3).value === 0);
}

// D5. THE HONEST REPORT. `gain` is what the recompute ACTUALLY added,
// measured either side, not the printed bonus — because a larger
// resistance bonus already in the pool means this one moves nothing.
{
  const landed = naturalDefenceResult({ total: 14, dc: 16, gain: 2 });
  ok("D5 a bonus that lands moves the total", landed.after === 16 && landed.applied === true);
  ok("D5b and reports turning the save aside", landed.turnedAside === true,
    "14 against DC 16 becomes 16, which now succeeds");

  const swallowed = naturalDefenceResult({ total: 14, dc: 16, gain: 0 });
  ok("D6 a bonus swallowed by a larger one does not move the total",
    swallowed.after === 14 && swallowed.applied === false);
  ok("D6b and does not claim to have turned it aside", swallowed.turnedAside === false,
    "reporting the printed +1 as though it landed would be a card that lies");

  const alreadyPassing = naturalDefenceResult({ total: 18, dc: 16, gain: 1 });
  ok("D7 a save that already succeeded is not 'turned aside'",
    alreadyPassing.turnedAside === false);

  const stillFailing = naturalDefenceResult({ total: 10, dc: 16, gain: 1 });
  ok("D8 a bonus too small to matter says so", stillFailing.turnedAside === false
    && stillFailing.after === 11);

  const noDC = naturalDefenceResult({ total: 12, dc: null, gain: 1 });
  ok("D9 a save with no DC still reports its new total",
    noDC.after === 13 && noDC.dc === null && noDC.turnedAside === false,
    "a GM-held DC is a real case and must not throw");
}

/* ================================================================== */

process.stdout.write(`verify-natural-defence: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
