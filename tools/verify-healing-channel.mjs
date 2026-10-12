#!/usr/bin/env node
/**
 * verify-healing-channel — what "increased to" means.
 *
 * NEW at 3.475.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND AT A LIVE TABLE, 2 September 2026.
 *
 *   THE FEAT   "when casting the Cure spell, the amount healed is
 *               INCREASED TO d10's (and +10 for ranged)."
 *   THE SPELL  Cure, 2 AP: "restores an ADDITIONAL 8 HP" — carried in
 *               the pack as `1d8 + 8`.
 *
 * The old code upgraded the dice and then APPENDED a term, so a ranged
 * Cure healed `1d10 + 8 + 10`. Graham reported 18 from the table.
 *
 * ─────────────────────────────────────────────────────────────────────
 * F1 IS THE FIX AND F2 IS WHY IT IS RIGHT.
 *
 * "Increased to" is a replacement in BOTH halves of the same clause: d8
 * becomes d10, and 8 becomes 10. Nobody reads "increased to d10's" as
 * "roll a d8 AND a d10", so the bracket cannot mean "+8 AND +10". One
 * sentence, one kind of change, applied twice — and the dice half is the
 * proof of the flat half.
 *
 * WHY NOTHING CAUGHT IT: the rule lived inline in a 600-line cast
 * function where no check could reach it, and the only description of it
 * was a comment asserting the opposite of the book — "the 2 AP Cure
 * mode's own +8 stays — the +10 is IN ADDITION". A misreading written
 * down as though it were the rule survives every reading after it.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  RANGED_BONUS, isRangedCure, healingChannelFormula, healingChannelApplies
} from "../module/magic/healing-channel.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ── F. THE ARITHMETIC ───────────────────────────────────────────── */
/*
 * F1 IS THE REPORTED BUG. `1d8 + 8` is Cure's own 2 AP formula, and the
 * answer must be `1d10 + 10` — never `1d10 + 8 + 10`.
 */
ok("F1 A RANGED CURE REPLACES THE +8 WITH +10",
  healingChannelFormula("1d8 + 8", true) === "1d10 + 10",
  "the old code appended, giving 1d10 + 8 + 10");
ok("F1b and never leaves the old bonus behind",
  !/\+\s*8/.test(healingChannelFormula("1d8 + 8", true)));
// F2 IS THE PROOF OF F1. The same clause upgrades the dice, and nobody
// reads that half as an addition.
ok("F2 the dice are replaced too, not added to",
  healingChannelFormula("1d8", false) === "1d10"
  && !/d8/.test(healingChannelFormula("1d8", false)),
  "\"increased to d10's\" is not \"roll a d8 and a d10\"");
ok("F3 a touch cast gains no flat bonus",
  healingChannelFormula("1d8", false) === "1d10");
ok("F4 every die in a formula is upgraded",
  healingChannelFormula("2d8 + 1d8", false) === "2d10 + 1d10");
// A RANGED MODE WITH NO FLAT TERM still gains the bonus. Cure has no
// such mode, and inventing a refusal for one would be a rule about a
// spell nobody has written.
ok("F5 a ranged mode with no flat term gains one",
  healingChannelFormula("2d8", true) === "2d10 + 10");
ok("F6 an empty formula stays empty", healingChannelFormula("", true) === "");
ok("F7 the bonus is the feat's own number", RANGED_BONUS === 10);

/* ── R. WHICH MODE IS RANGED ─────────────────────────────────────── */
ok("R1 the 30 ft mode is ranged", isRangedCure("30 feet") === true);
ok("R2 the touch mode is not", isRangedCure("Touch") === false);
// THE 3 AP MODE IS A RADIUS AND CARRIES NO RANGE, so it is correctly not
// "ranged" here — and it has no flat bonus to replace either.
ok("R3 and a mode with no range at all is not", isRangedCure("") === false);
ok("R4 nor is nonsense", isRangedCure("somewhere") === false);

/* ── A. WHEN IT APPLIES ──────────────────────────────────────────── */
ok("A1 it applies to Cure with the feat", healingChannelApplies("Cure", true) === true);
ok("A2 not without the feat", healingChannelApplies("Cure", false) === false);
// ONLY CURE. The feat's first half is a Medicine bonus and its second
// half names one spell; a Cure Wounds or Mass Cure would be a different
// entry and must not be caught by a loose match.
ok("A3 AND NOT TO ANOTHER SPELL", healingChannelApplies("Cure Wounds", true) === false,
  "the feat names Cure, not everything starting with it");
ok("A4 case and spacing do not matter", healingChannelApplies("  cure ", true) === true);

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const cast = strip(read("module", "magic", "cast-workflow.mjs"));
ok("W1 the cast asks whether it applies",
  cast.includes("healingChannelApplies(spell.name, hasHealingChannel)"));
ok("W2 and builds the formula from the rule",
  cast.includes("formula: healingChannelFormula(effect.formula, ranged)"));
ok("W3 asking the range which mode this is", cast.includes("const ranged = isRangedCure(effRange);"));
/*
 * W4 IS THE REGRESSION GUARD. The bug was one string concatenation, and
 * it would come back the same way — so the cast must not append a bonus
 * of its own anywhere near this.
 */
ok("W4 THE CAST APPENDS NO BONUS OF ITS OWN",
  !/formula \+= " \+ 10"/.test(cast),
  "the appended term is exactly what produced 1d10 + 8 + 10");
ok("W5 only heal rows are touched", cast.includes('if (effect?.kind !== "heal" || !effect.formula) return effect;'));

/* ── P. THE PACK STILL SAYS WHAT THE FIX ASSUMES ─────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let cure = null;
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell" && v.name === "Cure") cure = v;
  }
} finally { await db.close(); }
ok("P1 Cure is in the pack", Boolean(cure));
const modes = cure?.system?.apOptions ?? [];
const twoAP = modes.find((m) => Number(m.ap) === 2) ?? null;
/*
 * P2 IS THE ASSUMPTION THE FIX RESTS ON. If the 2 AP mode ever stops
 * carrying its flat +8, `healingChannelFormula` would append +10 instead
 * of replacing — correct for a mode with no bonus, but it would mean the
 * printed "+8" had gone missing and nobody had noticed.
 */
ok("P2 ITS 2 AP MODE STILL CARRIES THE PRINTED +8",
  String(twoAP?.effects?.[0]?.formula ?? "") === "1d8 + 8",
  "the fix replaces that term; if it vanished, the spell lost its printed bonus");
ok("P3 and that mode is the ranged one", isRangedCure(twoAP?.range) === true);
ok("P4 the touch mode carries no flat bonus",
  String((modes.find((m) => Number(m.ap) === 1))?.effects?.[0]?.formula ?? "") === "1d8");
// AND THE WHOLE POINT, END TO END: the mode a player actually casts.
ok("P5 SO A RANGED CURE WITH THE FEAT HEALS 1d10 + 10",
  healingChannelFormula(twoAP?.effects?.[0]?.formula, isRangedCure(twoAP?.range)) === "1d10 + 10",
  "reported from a live table as 1d10 + 18");

if (failures.length) {
  process.stderr.write(`verify-healing-channel: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-healing-channel: OK — ${checks} checks. "Increased to" replaces, in both halves of the sentence.\n`);
