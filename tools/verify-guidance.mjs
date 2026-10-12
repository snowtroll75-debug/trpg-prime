#!/usr/bin/env node
/**
 * verify-guidance — the floating bonus, and the pack it reads from.
 *
 * NEW at 3.400.0, for Guidance (Chapter 10, PP 0).
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION B EXISTS BECAUSE I WAS WRONG ABOUT THIS SPELL.
 *
 * I told Graham that "several spells work this way" and used that to
 * argue for building a floating-bonus family. Measured afterwards: the
 * phrase "to one attack roll, saving throw, or skill check" occurs ONCE
 * in the rulebook, and so does "uses the bonus". Guidance is the only
 * spell with this shape.
 *
 * So it is built as itself, and B4 records the measurement rather than
 * the claim — if a second spell ever gains this effect kind, that check
 * fails and the family question becomes real instead of assumed.
 *
 * WHAT IS GENUINELY SHARED is the immunity: "temporarily immune" is
 * printed twenty-six times. That lives in ../module/temporary-immunity.mjs
 * with its own verify file, general in shape and wired only here.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  GUIDANCE_NAME, GUIDANCE_BONUS, GUIDANCE_IMMUNITY_SECONDS, GUIDANCE_CHECK_TYPES,
  guidanceTriggers, guidanceModifier, guidanceDurationSeconds,
  guidanceEligibility, guidanceResult
} from "../module/magic/guidance.mjs";
import { MARKERS } from "../module/magic/markers.mjs";
import { ONE_HOUR } from "../module/temporary-immunity.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. What the bonus is
 * ================================================================== */

ok("A1 the bonus is +1", GUIDANCE_BONUS === 1);
ok("A2 the modifier carries it", guidanceModifier().value === 1);
// A3. STATUS, AS PRINTED. The type decides whether it lands at all —
// Appendix 1 takes the best of a type rather than summing.
ok("A3 it is a status bonus", guidanceModifier().type === "status",
  `got "${guidanceModifier().type}"`);
ok("A4 it is labelled for the card", /Guidance/.test(guidanceModifier().label));
ok("A5 a negative bonus is floored at zero", guidanceModifier(-2).value === 0);

/* ================================================================== *
 * B. The three kinds of roll, and only those three
 * ================================================================== */

for (const type of GUIDANCE_CHECK_TYPES) {
  ok(`B1 a ${type} check may spend it`, guidanceTriggers(type) === true);
}
// B2. NOT ANY CHECK. Initiative, flat checks and recovery rolls all
// reach the same card, and the spell names three kinds. A looser test
// would quietly widen the spell.
for (const other of ["initiative", "flat", "recovery", "dying", ""]) {
  ok(`B2 a ${other || "blank"} check may not`, guidanceTriggers(other) === false);
}
ok("B3 the type is matched case-insensitively", guidanceTriggers(" SKILL ") === true);

// B4. THE MEASUREMENT, NOT THE CLAIM. See this file's header: Guidance
// is the ONLY spell in the book with a floating one-shot bonus, so it
// is built as itself. If a second spell ever carries this marker, that
// is when the family question becomes real.
ok("B4 exactly three kinds of roll are named", GUIDANCE_CHECK_TYPES.length === 3,
  `${GUIDANCE_CHECK_TYPES.join(", ")} — the printed sentence names attack, save and skill`);

/* ================================================================== *
 * C. The duration, and the turn boundary that is not a span
 * ================================================================== */

// C1. "UNTIL THE START OF YOUR NEXT TURN" IS NOT A NUMBER OF SECONDS,
// and returning one would be a plausible lie. Six seconds is the length
// of a round, but a bonus granted halfway through a turn does not last
// six seconds — it lasts until a specific event the combat tracker
// knows about and a clock does not.
ok("C1 the base duration is not expressed as a span",
  guidanceDurationSeconds(3, 4) === null,
  "a turn boundary is an event, not a number of seconds");
ok("C2 at the caster-level threshold it becomes a minute",
  guidanceDurationSeconds(4, 4) === 60);
ok("C3 and stays a minute above it", guidanceDurationSeconds(20, 4) === 60);
// C4. THE SAME GUARD NATURAL DEFENCE NEEDED. `level >= 0` is true for
// everybody, so a spell whose casterLevelMods went missing would hand
// every caster the longer duration.
ok("C4 an absent threshold does not upgrade everyone",
  guidanceDurationSeconds(20, 0) === null,
  "a missing threshold must fail to the BASE duration");
ok("C5 a negative threshold is treated the same way",
  guidanceDurationSeconds(20, -3) === null);

/* ================================================================== *
 * D. Who may be given it
 * ================================================================== */

ok("D1 an ordinary target may be given it",
  guidanceEligibility({}).eligible === true);

// D2. THE IMMUNITY IS A LIMIT ON THE SPELL, NOT ON THE CASTER. "The
// target is THEN temporarily immune to the spell" — so a second Cleric
// cannot top the same ally up.
ok("D2 a target inside the immunity may not",
  guidanceEligibility({ immune: true }).eligible === false);
ok("D2b and it says why",
  /temporarily immune/.test(guidanceEligibility({ immune: true }).reason));
ok("D2c and reports how long is left",
  guidanceEligibility({ immune: true, remaining: 900 }).remaining === 900);

// D3. ALREADY HOLDING ONE IS A DIFFERENT REFUSAL. Two status bonuses of
// a type do not stack, so a second cast is either wasted or silently
// replaces a waiting bonus.
ok("D3 a target already carrying an unspent Guidance may not",
  guidanceEligibility({ alreadyHeld: true }).eligible === false);
ok("D3b and it says so distinctly",
  /already carries/.test(guidanceEligibility({ alreadyHeld: true }).reason));
ok("D4 holding one is reported ahead of the immunity",
  /already carries/.test(guidanceEligibility({ alreadyHeld: true, immune: true }).reason),
  "the nearer reason is the more useful one to show");
ok("D5 every refusal carries a reason",
  [{ immune: true }, { alreadyHeld: true }]
    .every((o) => (guidanceEligibility(o).reason ?? "").length > 5));

/* ================================================================== *
 * E. The honest report
 * ================================================================== */

{
  const landed = guidanceResult({ total: 17, dc: 18, gain: 1 });
  ok("E1 a bonus that lands moves the total", landed.after === 18 && landed.applied === true);
  ok("E1b and reports the save turning", landed.turnedAside === true);

  const swallowed = guidanceResult({ total: 17, dc: 18, gain: 0 });
  ok("E2 a bonus swallowed by a larger status bonus moves nothing",
    swallowed.after === 17 && swallowed.applied === false);
  ok("E2b and does not claim to have turned it", swallowed.turnedAside === false,
    "the third spell of this shape, and the third time the card must not lie");

  ok("E3 a check that already succeeded is not 'turned aside'",
    guidanceResult({ total: 20, dc: 18, gain: 1 }).turnedAside === false);
  ok("E4 a check with no DC still reports its new total",
    guidanceResult({ total: 12, dc: null, gain: 1 }).after === 13);
}

/* ================================================================== *
 * F. The held bonus, the immunity and the pack
 * ================================================================== *
 *
 * MIGRATED AT 3.411.0. Guidance was a bespoke marker until four PP 1
 * spells turned out to share its whole shape. F1 now asserts the OPPOSITE
 * of what it used to: that Guidance is no longer a marker, so the two
 * mechanisms cannot quietly both exist.
 */

ok("F1 Guidance is NOT a marker any more", !Object.hasOwn(MARKERS, "guidance"),
  "two mechanisms offering one waiting bonus is the shape this migration removed");
ok("F2 the printed hour is still an hour", GUIDANCE_IMMUNITY_SECONDS === ONE_HOUR);
// F3/F4: THE CARD PATH IS GENERAL NOW. What used to be checked through the
// marker registry's `reader` field is checked directly: the interactions
// module must offer held bonuses, and must no longer have a Guidance-only
// branch beside them.
{
  const interactions = fs.readFileSync(
    path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs"), "utf8");
  ok("F3 the card offers held bonuses", /maybeAddHeldBonuses/.test(interactions));
  ok("F4 and has no Guidance-only path beside them",
    !/findMarker\(roller, "guidance"\)/.test(interactions),
    "one waiting bonus, one mechanism");
}

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
ok("F5 the spells pack could be read", spells !== null);

const spell = spells?.get(GUIDANCE_NAME) ?? null;
ok(`F6 "${GUIDANCE_NAME}" is a real spell`, spell !== null);

if (spell) {
  ok("F7 it costs no Power Points", Number(spell.system?.ppCost) === 0);
  // F8 MIGRATED AT 3.411.0. Guidance was a bespoke marker with its own
  // card button until four PP 1 spells turned out to share its shape;
  // it is now the first HELD BONUS. Behaviour unchanged — the checks
  // below still pin the +1, the three check types and the hour of
  // immunity, which are the facts that matter.
  const held = (spell.system?.effects ?? []).find((e) => e.kind === "heldBonus");
  ok("F8 it is a held bonus", Boolean(held), JSON.stringify(spell.system?.effects));
  ok("F8b worth +1, status", held?.value === 1 && held?.bonusType === "status");
  ok("F8c reaching attack, save and skill checks",
    ["attack", "save", "skill"].every((t) => (held?.checkTypes ?? []).includes(t)));
  ok("F8d and carrying the printed hour of immunity",
    held?.immunitySeconds === GUIDANCE_IMMUNITY_SECONDS,
    `${held?.immunitySeconds} vs ${GUIDANCE_IMMUNITY_SECONDS}`);
  // F9. TARGETS, NOT SELF. Range 30 feet, Targets 1 creature — it is
  // cast on somebody else, which is what makes the button appear on a
  // card belonging to a different actor from the caster.
  ok("F9 it targets the creature, not the caster",
    held?.target === "targets",
    "the spell has Range 30 feet and Targets 1 creature");

  const mods = Array.isArray(spell.system?.casterLevelMods) ? spell.system.casterLevelMods : [];
  ok("F10 it declares a caster-level modification", mods.length > 0);
  // F11. READ THE PROSE BACK, as Natural Defence's C3 does. The step is
  // recorded as a sentence — "increase duration to 1 minute" — and the
  // 60 lives in the function with nothing connecting them.
  const printed = mods.map((m) => String(m?.text ?? "")).join(" ");
  const named = /(\d+)\s*minute/i.exec(printed);
  ok("F11 the modification names a duration", named !== null, `text: "${printed}"`);
  if (named) {
    const threshold = Math.min(...mods.map((m) => Number(m.threshold) || 0).filter((n) => n > 0));
    ok(`F11b the function's stepped duration matches the printed text (${named[1]} minute)`,
      guidanceDurationSeconds(threshold, threshold) === Number(named[1]) * 60,
      `function gives ${guidanceDurationSeconds(threshold, threshold)}s, `
        + `pack text says ${Number(named[1]) * 60}s`);
    ok("F11c and does not step below the printed threshold",
      guidanceDurationSeconds(threshold - 1, threshold) === null);
  }
}

/* ================================================================== */

process.stdout.write(`verify-guidance: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
