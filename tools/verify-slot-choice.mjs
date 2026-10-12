#!/usr/bin/env node
/**
 * verify-slot-choice — Resistance, and the slot chosen at cast time.
 *
 * NEW at 3.507.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ONE SENTENCE IN THE PP 2 BATCH NO EXISTING KIND COULD EXPRESS.
 *
 *   "granting it a +1 resistance bonus to any one of its saving throws
 *    (SELECTED WHEN CASTING)"
 *
 * Every other spell in that batch knew its slot when it was written.
 * This one does not know it until the caster says, which is why it was
 * deferred out of 3.504.0 rather than guessed at.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION W IS THE WARP THAT WAS INERT. "+2 PP: affect all saving
 * throws" shipped with `mods: {}` — offered, charged, printed as warped,
 * and doing nothing. The same shape as the 46 target warps and the two
 * phantom-key clauses, and the reason `allSlots` is declared in
 * `emptyWarpMods` rather than matched out of the warp's text.
 *
 * SECTION N IS WHAT IT MUST NOT DO. A choice that can return a slot the
 * spell never offered is a bonus on the wrong defence, and a prompt that
 * takes more than was paid for is a warp nobody bought.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SAVE_SLOTS, normaliseSlotChoice, slotChoiceCount, slotChoiceRows,
  slotChoiceEmptyLine, slotChoiceLine
} from "../module/magic/slot-choice.mjs";
import { warpedBonusValue, aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import { bonusTargetFor } from "../module/magic/spell-effects.mjs";
import { BONUS_TYPES } from "../module/dice/resolution.mjs";

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
 * P. THE PACK
 * ================================================================== */

let resistance = null;
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, v] of db.iterator()) if (v?.name === "Resistance") resistance = v;
  } finally { await db.close().catch(() => {}); }
}

const row = (resistance?.system?.effects ?? [])[0];
ok("P1 Resistance declares an effect at all", Boolean(row),
  "it carried `effects: []` and did nothing");
equal("P2 IT NAMES A LIST, NOT A SLOT", row?.chooseFrom, "saves",
  "the slot is not known until the caster picks it");
ok("P2b and names no slot", row?.slot === undefined,
  "a declared slot would settle at authoring time what the book settles at cast time");
equal("P3 the printed value", Number(row?.value), 1);
equal("P4 a RESISTANCE bonus, as printed", row?.bonusType, "resistance");
ok("P4b which is a real bonus type", Object.keys(BONUS_TYPES).includes(String(row?.bonusType)),
  "a type outside Appendix 1's table would stack by a rule that does not exist");
equal("P5 on the target, not the caster", row?.target, "targets",
  "\"1 willing creature\" — the caster is not automatically the subject");

/* ================================================================== *
 * S. THE SLOTS EXIST AND LAND SOMEWHERE
 * ================================================================== */

equal("S1 the three saves", JSON.stringify(SAVE_SLOTS),
  JSON.stringify(["fortitude", "reflex", "will"]));
// S2 EVERY OFFERED SLOT RESOLVES TO A REAL PATH. A slot with nowhere to
// land is refused by the applier at cast time — which is a dialog the
// caster fills in for nothing.
for (const slot of SAVE_SLOTS) {
  equal(`S2:${slot} resolves to a data path`, bonusTargetFor(slot), `system.combat.saves.${slot}`);
}

/* ================================================================== *
 * C. THE CHOICE
 * ================================================================== */

const spec = normaliseSlotChoice(row);
ok("C1 the row normalises", Boolean(spec), JSON.stringify(row));
equal("C1b and offers all three", JSON.stringify(spec?.options), JSON.stringify(SAVE_SLOTS));

const plain = slotChoiceCount(spec, {});
equal("C2 UNWARPED IT PICKS ONE", plain.count, 1);
ok("C2b and asks which", plain.prompt === true,
  "\"selected when casting\" is a prompt, not an authoring decision");

const warped = slotChoiceCount(spec, { allSlots: true });
equal("C3 WARPED IT TAKES EVERY SAVE", warped.count, 3);
ok("C3b and asks nothing", warped.prompt === false,
  "a caster who paid 2 PP for all three has nothing left to choose");

/* ================================================================== *
 * R. THE ROWS IT BUILDS
 * ================================================================== */

const one = slotChoiceRows(spec, ["reflex"], {}, warpedBonusValue);
equal("R1 one pick, one bonus row", one.length, 1);
equal("R1b on the slot chosen", one[0]?.slot, "reflex");
equal("R1c carrying the printed value", one[0]?.value, 1);
equal("R1d and the printed type", one[0]?.bonusType, "resistance");
equal("R1e as an ordinary bonus row", one[0]?.kind, "bonus",
  "it goes through applyBonusEffect like every other bonus — no second applier");

const all = slotChoiceRows(spec, SAVE_SLOTS, { allSlots: true }, warpedBonusValue);
equal("R2 THE WARP APPLIES TO EVERY SAVE", all.length, 3);
ok("R2b each on its own slot",
  JSON.stringify(all.map((r) => r.slot)) === JSON.stringify(SAVE_SLOTS));

// R3 THE +4 PP WARP IS THE ORDINARY NUMERIC CHANNEL, capped where the
// sentence that prints the cap lives.
equal("R3 the bonus warp raises the value",
  slotChoiceRows(spec, ["will"], { bonusValue: 1, bonusMax: 5 }, warpedBonusValue)[0]?.value, 2);
ok("R3b and the printed cap is honoured",
  slotChoiceRows(spec, ["will"], { bonusValue: 99, bonusMax: 5 }, warpedBonusValue)[0]?.value <= 5);
ok("R3c both warps compose",
  slotChoiceRows(spec, SAVE_SLOTS, { allSlots: true, bonusValue: 1, bonusMax: 5 }, warpedBonusValue)
    .every((r) => r.value === 2),
  "6 PP buys +2 to all three, which is what the two options say together");
// R3c2 THE FLOOR. `warpedBonusValue` adds whatever it is handed, sign and
// all, so a negative mod arriving here would sell the caster a SMALLER
// spell than the printed one. `bonusValue: 0` cannot catch it — zero
// takes the early return — which is exactly how the same gap survived
// the first run of `mutate-pp2-bonuses` two releases ago.
equal("R3c2 A NEGATIVE MOD NEVER SHRINKS THE PRINTED BONUS",
  slotChoiceRows(spec, ["will"], { bonusValue: -3 }, warpedBonusValue)[0]?.value, 1,
  "a warp only ever buys more");
ok("R3d without the arithmetic injected, nothing is warped",
  slotChoiceRows(spec, ["will"], { bonusValue: 1 }, null)[0]?.value === 1,
  "the validator-injection shape this project uses to keep the module pure");

/* ================================================================== *
 * W. THE WARP THAT WAS INERT
 * ================================================================== */

const warps = resistance?.system?.warps ?? [];
const allSavesWarp = warps.find((w) => /all saving throws/i.test(String(w.text ?? "")));
ok("W1 the +2 PP warp is still printed", Boolean(allSavesWarp));
equal("W1b AND NOW BUYS SOMETHING", allSavesWarp?.mods?.allSlots, true,
  "it shipped with `mods: {}` — offered, charged, and doing nothing");
equal("W1c at the printed price", Number(allSavesWarp?.ppCost), 2);
// W2 THE MOD SURVIVES THE AGGREGATE, which is the half the phantom-key
// defect broke: a key the aggregator does not list is dropped in silence.
const agg = aggregateWarpSelection(warps, { "warp-0": true });
equal("W2 THE AGGREGATE CARRIES IT", agg.mods.allSlots, true,
  "a mod key absent from emptyWarpMods is dropped without a word");
equal("W2b and charges for it", agg.ppSpent, 2);
equal("W2c an unbought warp carries nothing",
  aggregateWarpSelection(warps, {}).mods.allSlots, false);
// W3 THE OTHER WARP WAS ALREADY LIVE and must stay so.
const bonusWarp = warps.find((w) => /increase the bonus/i.test(String(w.text ?? "")));
equal("W3 the +4 PP warp still raises the bonus", Number(bonusWarp?.mods?.bonusValue), 1);
equal("W3b to its printed cap", Number(bonusWarp?.mods?.bonusMax), 5);

/* ================================================================== *
 * N. WHAT IT MUST NOT DO
 * ================================================================== */

ok("N1 A SLOT THE SPELL NEVER OFFERED IS DROPPED",
  slotChoiceRows(spec, ["defence", "will"], {}, warpedBonusValue)
    .every((r) => SAVE_SLOTS.includes(r.slot)),
  "a prompt returning something off the list would be a bonus to the wrong defence");
equal("N1b and only the offered one survives",
  slotChoiceRows(spec, ["defence", "will"], {}, warpedBonusValue).length, 1);
equal("N2 the same slot twice is one row",
  slotChoiceRows(spec, ["will", "will"], {}, warpedBonusValue).length, 1,
  "two rows on one save would stack a highest-wins bonus with itself");
equal("N3 picking nothing applies nothing",
  slotChoiceRows(spec, [], {}, warpedBonusValue).length, 0);
ok("N3b and the card says so",
  /nothing applied/i.test(slotChoiceEmptyLine("Resistance")),
  "a cancelled prompt must not look like a spell that worked");
// N4 A ROW THAT IS NOT A CHOICE IS NOT TREATED AS ONE — every other
// bonus in the pack goes down the ordinary path untouched.
ok("N4 an ordinary bonus row is not a slot choice",
  normaliseSlotChoice({ kind: "bonus", slot: "will", value: 2 }) === null);
ok("N4b nor is a row naming a list nobody implements",
  normaliseSlotChoice({ kind: "bonus", chooseFrom: "eyeColour", value: 2 }) === null,
  "a prompt with nothing in it asks the caster to choose from an empty dialog");
ok("N4c nor a choice granting nothing",
  normaliseSlotChoice({ kind: "bonus", chooseFrom: "saves", value: 0 }) === null);

/* ================================================================== *
 * L. THE CARD
 * ================================================================== */

ok("L1 the card names what was covered",
  /Reflex/.test(slotChoiceLine("Resistance", ["reflex"]) ?? ""));
ok("L2 AND SAYS WHEN THE WARP MADE THE CHOICE",
  /warped/i.test(slotChoiceLine("Resistance", SAVE_SLOTS, { warped: true }) ?? ""),
  "a caster who paid 2 PP and saw no prompt cannot otherwise tell the warp from a broken dialog");
ok("L2b and names all three", /Fortitude, Reflex, Will/
  .test(slotChoiceLine("Resistance", SAVE_SLOTS, { warped: true }) ?? ""));
equal("L3 nothing chosen, nothing said", slotChoiceLine("Resistance", []), null);

if (failures.length) {
  process.stderr.write(`verify-slot-choice: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-slot-choice: OK — ${checks} checks. Resistance picks a saving throw at cast time, `
  + "and its +2 PP warp buys the other two instead of nothing.\n");
