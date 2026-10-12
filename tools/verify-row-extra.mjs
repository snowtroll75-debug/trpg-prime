#!/usr/bin/env node
/**
 * verify-row-extra — the half of Graham's Cure report that was still open.
 *
 * NEW at 3.522.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS SAY IT AND ONLY ONE HALF WAS EVER BUILT.
 *
 *   Cure     "+2 PP: the amount of healing increases by 1d8 AND THE
 *             EXTRA HEALING FOR THE 2-ACTION VERSION INCREASES BY 8"
 *   Inflict  "+2 PP: the amount of damage increases by 1d8 OR 1d8+8 FOR
 *             THE 2 AP VERSION"
 *
 * `damageDice: "1d8"` has added the die since the bleed channel. The
 * flat term on the two-action row reached nothing, so a caster who paid
 * 2 PP got the extra die and not the extra eight. Graham reported this
 * on Cure on 7 September 2026; its other two clauses shipped at 3.515.0
 * and 3.516.0 and this one stood open through six releases.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION R IS THE RULE, AND WHY IT IS THE ROW'S OWN NUMBER.
 *
 * Both spells print exactly 8 on their 2 AP row, so "add 8" and "add the
 * row's own extra again" cannot be told apart in this data. The second
 * is chosen because it keeps the number in ONE place: a row with no flat
 * term is untouched — which is what makes Cure's 1 AP and 3 AP rows
 * behave — and a row printing something other than 8 gets its own.
 *
 * SECTION S IS THE POPULATION THAT MUST NOT MOVE: every other formula in
 * the pack, warped or not, goes through `warpedRowExtra` now.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { addDice, warpedRowExtra } from "../module/magic/caster-level-mods.mjs";
import { healingChannelFormula, isRangedCure } from "../module/magic/healing-channel.mjs";
import { aggregateWarpSelection, emptyWarp, warpMaxTimes, WARP_UNLIMITED } from "../module/magic/spell-warp.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

/* ================================================================== *
 * R. THE ROW'S OWN EXTRA, AGAIN
 * ================================================================== */

equal("R1 ONE PURCHASE DOUBLES THE ROW'S EXTRA",
  warpedRowExtra("1d8 + 8", { rowExtra: 1 }), "1d8 + 16",
  "Cure's 2 AP row: \"the extra healing for the 2-action version increases by 8\"");
equal("R2 TWO PURCHASES TREBLE IT", warpedRowExtra("1d8 + 8", { rowExtra: 2 }), "1d8 + 24",
  "Graham's ruling made this warp repeatable with no limit, so both halves scale together");
equal("R3 A ROW WITH NO FLAT TERM IS UNTOUCHED",
  warpedRowExtra("1d8", { rowExtra: 3 }), "1d8",
  "Cure's 1 AP and 3 AP rows — this is what makes the rule safe rather than clever");
equal("R4 AND IT IS THE ROW'S OWN NUMBER, NOT AN EIGHT",
  warpedRowExtra("2d6 + 3", { rowExtra: 1 }), "2d6 + 6",
  "the reason the 8 is not authored as a warp mod");
equal("R5 buying none changes nothing", warpedRowExtra("1d8 + 8", {}), "1d8 + 8");
equal("R5b and neither does a zero", warpedRowExtra("1d8 + 8", { rowExtra: 0 }), "1d8 + 8");
equal("R6 spacing is normalised", warpedRowExtra("1d8+8", { rowExtra: 1 }), "1d8 + 16");
equal("R7 an empty formula stays empty", warpedRowExtra("", { rowExtra: 1 }), "");
equal("R7b and a missing one", warpedRowExtra(null, { rowExtra: 1 }), "");
equal("R8 A LEADING CONSTANT IS LEFT ALONE",
  warpedRowExtra("8 + 1d8", { rowExtra: 1 }), "8 + 1d8",
  "neither spell writes it that way, and guessing which number is 'the extra' would be inventing a rule");
equal("R9 a negative purchase count buys nothing",
  warpedRowExtra("1d8 + 8", { rowExtra: -2 }), "1d8 + 8");

/* ================================================================== *
 * C. WITH THE DICE HALF, IN THE ORDER THE WORKFLOW APPLIES THEM
 * ================================================================== */

const both = (formula, mods) => addDice(warpedRowExtra(formula, mods), mods.damageDice || "");

equal("C1 THE 2 AP ROW GETS BOTH HALVES",
  both("1d8 + 8", { damageDice: "1d8", rowExtra: 1 }), "1d8 + 16 + 1d8",
  "2d8 + 16 — one more die and one more eight");
equal("C2 AND THE 1 AP ROW GETS ONLY THE DIE",
  both("1d8", { damageDice: "1d8", rowExtra: 1 }), "2d8",
  "which is exactly what the spell's text says");
equal("C3 TWO PURCHASES SCALE BOTH",
  both("1d8 + 8", { damageDice: "2d8", rowExtra: 2 }), "1d8 + 24 + 2d8",
  "the aggregator scales the dice; this scales the extra; they must agree on the count");
equal("C4 an unwarped cast is untouched",
  both("1d8 + 8", {}), "1d8 + 8");

/* ================================================================== *
 * W. THE VOCABULARY AND THE CHOOSER
 * ================================================================== */

equal("W1 rowExtra IS DECLARED VOCABULARY", emptyWarp().mods.rowExtra, 0,
  "an undeclared mod key is offered, charged, and silently dropped");
const RW = [{ ppCost: 2, text: "increases by 1d8 and the extra by 8", mods: { damageDice: "1d8", rowExtra: 1 } }];
equal("W2 IT ACCUMULATES",
  aggregateWarpSelection(RW, { "warp-0": 3 }).mods.rowExtra, 3,
  "a count, not a flag — three purchases are three more extras");
equal("W2b in step with the dice",
  aggregateWarpSelection(RW, { "warp-0": 3 }).mods.damageDice, "3d8");
equal("W3 AND THE OPTION STAYS UNCAPPED", warpMaxTimes(RW[0]), WARP_UNLIMITED,
  "Graham's ruling: \"selected multiple times (with no limit)\"");

/* ================================================================== *
 * THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) spells.push(v);
await db.close();

const spell = (n) => spells.find((s) => s.name === n);

/* ── P. THE TWO ───────────────────────────────────────────────────── */

equal("P1 Cure's third option carries it", spell("Cure").system.warps[2]?.mods?.rowExtra, 1);
equal("P1b beside the die it always had",
  spell("Cure").system.warps[2]?.mods?.damageDice, "1d8");
equal("P2 and Inflict's first", spell("Inflict").system.warps[0]?.mods?.rowExtra, 1);
equal("P2b beside its die", spell("Inflict").system.warps[0]?.mods?.damageDice, "1d8");
ok("P3 EACH SITS UNDER THE SENTENCE THAT NAMES THE 2-ACTION ROW",
  /2-action version|2 AP version/i.test(String(spell("Cure").system.warps[2]?.text ?? ""))
  && /2 AP version/i.test(String(spell("Inflict").system.warps[0]?.text ?? "")),
  "a mod on the wrong index buys the right thing for the wrong option");

/* ── A. THE AP ROWS THEMSELVES ────────────────────────────────────── */

const cureRows = spell("Cure").system.apOptions.map((o) => o.effects[0].formula);
equal("A1 CURE PRINTS ITS EXTRA ON THE 2 AP ROW ALONE",
  JSON.stringify(cureRows), JSON.stringify(["1d8", "1d8 + 8", "1d8"]),
  "if this ever changes, the warp starts meaning something else — which is why it is pinned here");
const inflictRows = spell("Inflict").system.apOptions.map((o) => o.damage.formula);
equal("A2 AND SO DOES INFLICT",
  JSON.stringify(inflictRows), JSON.stringify(["1d8", "1d8 + 8", "1d8"]));

const mods = { damageDice: "1d8", rowExtra: 1 };
equal("A3 SO A WARPED CURE HEALS 2d8+16 ON ITS 2 AP ROW",
  both(cureRows[1], mods), "1d8 + 16 + 1d8");
equal("A3b and 2d8 on its 1 AP row", both(cureRows[0], mods), "2d8");
equal("A4 AND A WARPED INFLICT DEALS THE SAME ON ITS 2 AP ROW",
  both(inflictRows[1], mods), "1d8 + 16 + 1d8");

/* ── H. WITH HEALING CHANNEL, AND WHICH NUMBER GETS DOUBLED ───────── */

/*
 * GRAHAM RULED THIS ON 8 SEPTEMBER 2026, after live testing 3.522.0 read
 * back `1d10 + 20 + 1d8` where I had predicted `1d8 + 16 + 1d8`.
 *
 * The prediction was wrong about this caster, not about the rule. A
 * Healing Channel cleric's 2 AP row has ALREADY been rewritten from
 * "1d8 + 8" to "1d10 + 10" by the time the warp runs, so the warp doubles
 * a 10. The alternative reading — the warp carries a literal 8 and pays
 * out "1d10 + 18" — was put to him and declined:
 *
 *   "Add 10 — the row's own extra."
 *
 * WHICH IS THE SAME ANSWER HE GAVE AT 3.475.0 about the feat itself:
 * "increased to" replaces both halves of the clause, d8 → d10 and 8 → 10.
 * If the row's extra IS 10, then "the extra increases by 8" increases the
 * thing that is there. This section exists so the ordering cannot be
 * quietly reversed later and read as a refactor.
 *
 * THE ORDER IS THE RULE. `cast-workflow.mjs` applies Healing Channel to
 * `effEffects` before the heal branch calls `warpedRowExtra`; H3 pins what
 * the other order would produce, so a swap changes an expected value here
 * rather than passing silently.
 */

const CURE_2AP = "1d8 + 8";
const hcRow = healingChannelFormula(CURE_2AP, isRangedCure("30 feet"));

equal("H1 HEALING CHANNEL REWRITES THE ROW FIRST", hcRow, "1d10 + 10",
  "Graham's 3.475.0 ruling — d8 becomes d10 and 8 becomes 10");
equal("H2 AND THE WARP THEN DOUBLES THE ROW'S CURRENT EXTRA",
  both(hcRow, { damageDice: "1d8", rowExtra: 1 }), "1d10 + 20 + 1d8",
  "Graham 8 Sep 2026: \"add 10 — the row's own extra\", read off a live card");
equal("H2b and trebles it on a second purchase",
  both(hcRow, { damageDice: "2d8", rowExtra: 2 }), "1d10 + 30 + 2d8",
  "confirmed live at 3.522.0");
equal("H3 THE OTHER ORDER WOULD PAY 18, WHICH IS THE READING HE DECLINED",
  healingChannelFormula(warpedRowExtra(CURE_2AP, { rowExtra: 1 }), true), "1d10 + 10",
  "warping first is not merely different, it LOSES the purchase — the feat's "
  + "replacement overwrites the doubled extra entirely");
equal("H4 THE 1 AP ROW GAINS THE DIE AND NO FLAT TERM",
  both(healingChannelFormula("1d8", isRangedCure("Touch")), { damageDice: "1d8", rowExtra: 1 }),
  "1d10 + 1d8",
  "read off the live card at 3.522.0. The feat upgrades the row's die to d10 and "
  + "the warp's own die stays a d8, so they do not merge — and there is still no "
  + "flat term for the warp to double, which is the point");
equal("H5 AND A CLERIC WITHOUT THE FEAT IS UNAFFECTED",
  both(CURE_2AP, { damageDice: "1d8", rowExtra: 1 }), "1d8 + 16 + 1d8",
  "which is what Inflict does, and what Cure does for everyone else");

/* ── S. EVERYTHING ELSE MUST NOT MOVE ─────────────────────────────── */

const formulas = [];
for (const s of spells) {
  for (const e of (s.system?.effects ?? [])) if (e?.formula) formulas.push(e.formula);
  for (const o of (s.system?.apOptions ?? [])) {
    for (const e of (o.effects ?? [])) if (e?.formula) formulas.push(e.formula);
    if (o?.damage?.formula) formulas.push(o.damage.formula);
  }
  if (s.system?.damage?.formula) formulas.push(s.system.damage.formula);
}
ok("S1 EVERY FORMULA IN THE PACK IS UNCHANGED WHEN NOTHING IS BOUGHT",
  formulas.every((f) => warpedRowExtra(f, {}) === f),
  `${formulas.length} formulas pass through the new call on every cast`);
ok("S2 AND EVERY ONE WITHOUT A FLAT TERM IS UNCHANGED EVEN WHEN IT IS",
  formulas.filter((f) => !/\+\s*\d+\s*$/.test(f)).every((f) => warpedRowExtra(f, { rowExtra: 5 }) === f),
  "only a trailing constant is the row's extra");

const withExtra = formulas.filter((f) => /\+\s*\d+\s*$/.test(f));
ok("S3 AND THE ONES THAT DO HAVE ONE ONLY MOVE WHEN THE WARP IS BOUGHT",
  withExtra.length > 0 && withExtra.every((f) => warpedRowExtra(f, { rowExtra: 1 }) !== f),
  `${withExtra.length} formulas in the pack carry a trailing constant`);

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-row-extra: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-row-extra: OK — ${checks} checks. `
  + "Cure and Inflict now buy the extra eight as well as the extra die.\n");
