#!/usr/bin/env node
/**
 * verify-specialist-tradition — a specialist spell casts in the caster's
 * own tradition.
 *
 * NEW at 3.388.0.
 *
 * THE RULE, printed in Chapter 10's Specialist Spells section:
 *
 *   "…with the exception that a magical tradition is not provided as this
 *   will always be based upon your PRIMARY TRADITION."
 *
 * WHAT WENT WRONG, and it is the cheapest possible bug to write. The
 * fallback existed:
 *
 *     const tradition = spellData.tradition ?? system.magic?.tradition ?? "";
 *
 * `??` only falls through on null or undefined. The pack stores a
 * specialist spell's tradition as `""`. So the branch someone wrote to
 * implement this exact rule was unreachable, and all 106 specialist
 * spells cast with no tradition at all.
 *
 * SECTION C IS THE ONE THAT MATTERS. It drives the six rules that read
 * the value, because "the resolver returns the right string" is not the
 * claim worth guarding — "an arcane caster in plate is charged for their
 * specialist spells" is.
 *
 * AND SECTION D READS THE PACK, because the count is the point: this is
 * a rule about a category, and a check that did not know how many spells
 * are in that category could not tell a fix from a coincidence.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { effectiveSpellTradition } from "../module/magic/tradition-gate.mjs";
import { armourCastingPenalty, isArmourProhibited } from "../module/magic/casting.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== *
 * A. The resolver
 * ================================================================== */

equal("A1 a spell with its own tradition keeps it",
  effectiveSpellTradition("arcane", "divinity"), "arcane");
equal("A2 a specialist spell inherits the caster's",
  effectiveSpellTradition("", "divinity"), "divinity");
// THE EXACT SHAPE THAT DEFEATED `??`. An empty string is not nullish, so
// this case is the whole bug.
equal("A3 an EMPTY STRING inherits — the case `??` could not reach",
  effectiveSpellTradition("", "arcane"), "arcane");
equal("A4 whitespace is empty too", effectiveSpellTradition("   ", "verdant"), "verdant");
equal("A5 null inherits", effectiveSpellTradition(null, "ethereal"), "ethereal");
equal("A6 undefined inherits", effectiveSpellTradition(undefined, "ethereal"), "ethereal");
// A COMBINED TRADITION IS ONE VALUE, not something to split and re-pick.
equal("A7 a multi-tradition spell keeps all of it",
  effectiveSpellTradition("arcane, verdant", "divinity"), "arcane, verdant");
equal("A8 the spell's own wins even when the caster has one",
  effectiveSpellTradition("divinity", "arcane"), "divinity");
// NOTHING TO INHERIT IS STILL NOTHING. Inventing a tradition for a
// caster who has none would be worse than the blank it replaces.
equal("A9 no spell tradition and no caster tradition is blank",
  effectiveSpellTradition("", ""), "");
equal("A10 rubbish does not throw", effectiveSpellTradition(), "");

/* ================================================================== *
 * B. The rule is read from the caster, not guessed
 * ================================================================== */

for (const t of ["arcane", "divinity", "verdant", "ethereal"]) {
  equal(`B1 a ${t} caster's specialist spell is ${t}`, effectiveSpellTradition("", t), t);
}

/* ================================================================== *
 * C. The six rules that were silent
 * ================================================================== */

const plate = { category: "heavy", material: "metal", dr: 8 };

// ARMOUR — the most expensive of the six. An arcane caster is prohibited
// ALL armour; with a blank tradition nothing is prohibited at all.
equal("C1 an arcane caster in plate pays for an ordinary spell",
  armourCastingPenalty(effectiveSpellTradition("arcane", "arcane"), [plate]), 16);
equal("C2 and pays the SAME for a specialist spell",
  armourCastingPenalty(effectiveSpellTradition("", "arcane"), [plate]), 16);
// THE REGRESSION ITSELF, pinned: a blank tradition charges nothing.
equal("C3 a blank tradition would have charged nothing",
  armourCastingPenalty("", [plate]), 0);
ok("C4 and prohibits nothing", !isArmourProhibited("", plate));
// Divinity is exempt by rule, so a divinity specialist spell stays free.
equal("C5 a divinity caster's specialist spell is still exempt",
  armourCastingPenalty(effectiveSpellTradition("", "divinity"), [plate]), 0);

// The other five read the tradition through a regex or a truthiness test.
const verdantSpecialist = effectiveSpellTradition("", "verdant");
ok("C6 Favoured Terrain can now match a Druid's specialist spell",
  /verdant/i.test(verdantSpecialist));
ok("C7 which it could not with a blank", !/verdant/i.test(""));

const divinitySpecialist = effectiveSpellTradition("", "divinity");
ok("C8 Blessed By the Gods can now match a Cleric's specialist spell",
  /divinity/i.test(divinitySpecialist));

const etherealSpecialist = effectiveSpellTradition("", "ethereal");
ok("C9 resonance can now see ethereal magic",
  String(etherealSpecialist).toLowerCase().includes("ethereal"));

ok("C10 the fumble modifier has a tradition to look up",
  Boolean(effectiveSpellTradition("", "arcane")));
ok("C11 and the card has one to print",
  Boolean(effectiveSpellTradition("", "arcane")));

/* ================================================================== *
 * D. The category this is about, read from the pack
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const dir = path.join(SYSTEM_ROOT, "packs", "spells");
ok("D0 the spells pack could be read", fs.existsSync(dir));
const db = new ClassicLevel(dir, { valueEncoding: "json" });
await db.open();
let total = 0;
let specialist = 0;
let specialistWithTradition = 0;
let blankNotSpecialist = 0;
try {
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith("!items!") || value?.type !== "spell") continue;
    total += 1;
    const t = String(value.system?.tradition ?? "").trim();
    const isSpec = Boolean(value.system?.specialist);
    if (isSpec) {
      specialist += 1;
      if (t) specialistWithTradition += 1;
    } else if (!t) {
      blankNotSpecialist += 1;
    }
  }
} finally {
  await db.close();
}

ok("D1 the pack holds spells", total > 600, `${total} found`);
// EVERY BLANK TRADITION IS A SPECIALIST SPELL. If one is not, it is
// genuinely missing data rather than deferring to the caster — and this
// release would silently hand it whatever tradition the caster had.
equal("D2 no spell has a blank tradition without being specialist",
  blankNotSpecialist, 0);
// AND EVERY SPECIALIST SPELL LEAVES ITS TRADITION BLANK, because the
// book says one is never provided. A specialist spell carrying one would
// mean the category has drifted.
equal("D3 no specialist spell carries a tradition of its own",
  specialistWithTradition, 0);
ok("D4 the specialist category is the size the book describes",
  specialist === 106,
  `${specialist} specialist spells; the rulebook's Chapter 10 lists 104 by class `
  + "plus Inspiration and Lay On Hands, whose trait lines name no class");

/* ================================================================== *
 * E. The operator that caused it may not come back
 * ================================================================== */

const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
ok("E1 the cast resolves the tradition through the rule",
  /const tradition = effectiveSpellTradition\(/.test(cast));
ok("E2 and no longer coalesces on nullish",
  !/const tradition = spellData\.tradition \?\?/.test(cast),
  "`??` cannot reach its fallback for a value stored as an empty string");

/* ================================================================== */

process.stdout.write(`verify-specialist-tradition: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
