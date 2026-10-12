#!/usr/bin/env node
/**
 * verify-bleed-relief — heal the wound, or stop it bleeding.
 *
 * NEW at 3.516.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NARRATED IN SIX SPELLS, AUTOMATED IN NONE.
 *
 * Cure prints "heals 1d8 HP OR stops 1 point of ongoing bleed damage".
 * Self Healing prints the same sentence in different words and carried it
 * as a `note`. Measured across the pack: THIRTEEN warps mention bleeding
 * and EIGHT shipped `mods: {}`.
 *
 * Two spells DID automate it, each in a private field of its own — Vital
 * Beacon's `stopsBleeding`, Aura Of Vitality's `bleedRemoved`. Two
 * bespoke implementations and six notes is the shape this project keeps
 * finding, and it is why this is a channel rather than a fix to Cure.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION O IS THE DISTINCTION THE BOOK MAKES WITH ONE WORD.
 *
 * Cure and Self Healing say "or" — the relief REPLACES the healing until
 * a warp buys both. Voice Of Healing says no such thing: it heals, and
 * "+2 PP: reduce a bleeding wound by 1" is bought ON TOP. Getting that
 * backwards would silently stop Voice Of Healing healing anyone who
 * happened to be bleeding.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION E IS EVERY OTHER HEALING SPELL IN THE PACK, which must be
 * exactly where it was. This release put a branch inside `case "heal"`,
 * the single most-used effect kind in the system.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  BLEEDING, bleedPoints, bleedReliefFor, bleedStoppedLine,
  healedInsteadLine, normaliseBleedAlternative
} from "../module/magic/bleed-relief.mjs";
import { WARP_UNLIMITED, aggregateWarpSelection, warpMaxTimes } from "../module/magic/spell-warp.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";

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
const plan = (s, m, b) => JSON.stringify(bleedReliefFor(s, m, b));

/* ================================================================== *
 * D. THE DECLARATION
 * ================================================================== */

const CHOICE = normaliseBleedAlternative({ kind: "heal", target: "targets", formula: "1d8", bleedAlternative: 1 });
ok("D1 a heal row may declare a bleed alternative", Boolean(CHOICE));
equal("D1b carrying its printed points", CHOICE?.points, 1);
equal("D2 AN ORDINARY HEAL DECLARES NONE",
  normaliseBleedAlternative({ kind: "heal", formula: "2d8" }), null,
  "every other healing spell in the pack reaches this line");
equal("D2b a zero alternative is no alternative",
  normaliseBleedAlternative({ kind: "heal", formula: "2d8", bleedAlternative: 0 }), null);
equal("D3 and it is only ever read off a heal",
  normaliseBleedAlternative({ kind: "damage", bleedAlternative: 1 }), null);
ok("D4 bleeding is a real, valued condition", CONDITIONS[BLEEDING]?.valued === true,
  "the relief takes it down a step at a time, so it has to have steps");

/* ================================================================== *
 * O. "OR", AND THE SPELLS THAT DO NOT SAY IT
 * ================================================================== */

equal("O1 A DECLARED CHOICE REPLACES THE HEALING",
  plan(CHOICE, {}, true), JSON.stringify({ heal: false, bleed: 1 }),
  "Cure: \"heals 1d8 HP OR stops 1 point of ongoing bleed\"");
equal("O2 THE 2 PP WARP BUYS BOTH",
  plan(CHOICE, { bleedAndHeal: true }, true), JSON.stringify({ heal: true, bleed: 1 }));
equal("O3 A SPELL THAT PRINTS NO CHOICE DOES BOTH ANYWAY",
  plan(null, { bleedPoints: 1 }, true), JSON.stringify({ heal: true, bleed: 1 }),
  "Voice Of Healing's warp is an ADDITION — getting this backwards would stop it healing the bleeding");
equal("O3b and stops nothing when the warp was not bought",
  plan(null, {}, true), JSON.stringify({ heal: true, bleed: 0 }));

/* ================================================================== *
 * B. WHO IS BLEEDING
 * ================================================================== */

equal("B1 NOT BLEEDING IS ALWAYS A HEAL",
  plan(CHOICE, {}, false), JSON.stringify({ heal: true, bleed: 0 }),
  "Graham's ruling: each target gets whichever applies");
equal("B1b even with both bought", plan(CHOICE, { bleedAndHeal: true }, false),
  JSON.stringify({ heal: true, bleed: 0 }));
equal("B1c and even with extra points bought",
  plan(CHOICE, { bleedPoints: 4 }, false), JSON.stringify({ heal: true, bleed: 0 }));
// B2 IS THE ONE THAT KEEPS THE REST OF THE GAME WORKING.
equal("B2 A HEAL WITH NO ALTERNATIVE IS UNTOUCHED, BLEEDING OR NOT",
  plan(null, {}, true), JSON.stringify({ heal: true, bleed: 0 }),
  "the branch sits inside the most-used effect kind in the system");

/* ================================================================== *
 * P. THE POINTS
 * ================================================================== */

equal("P1 one point by default", bleedPoints(CHOICE, {}), 1);
equal("P2 THE WARP ADDS A POINT EACH TIME", bleedPoints(CHOICE, { bleedPoints: 2 }), 3);
equal("P2b and it reaches the plan",
  plan(CHOICE, { bleedPoints: 2 }, true), JSON.stringify({ heal: false, bleed: 3 }));
// P3 THE FLOOR. Every numeric channel in this system carries one, and the
// gap survived two mutation runs before anybody wrote it down.
equal("P3 A NEGATIVE MOD NEVER BUYS LESS", bleedPoints(CHOICE, { bleedPoints: -5 }), 1,
  "a warp only ever buys more");
equal("P4 no declaration and no warp is nothing", bleedPoints(null, {}), 0);
equal("P4b no declaration but a warp is the warp", bleedPoints(null, { bleedPoints: 2 }), 2);

/* ================================================================== *
 * W. THE WARP CHANNEL
 * ================================================================== */

const bleedWarp = { ppCost: 2, text: "stop an additional point of bleeding", mods: { bleedPoints: 1 } };
const bothWarp = { ppCost: 2, text: "the spell heals both HP and bleed", mods: { bleedAndHeal: true } };

equal("W1 THE POINTS MOD SURVIVES THE AGGREGATOR",
  aggregateWarpSelection([bleedWarp], { "warp-0": 1 }).mods.bleedPoints, 1,
  "a mod key not declared in emptyWarpMods is charged for and dropped in silence");
equal("W1b and three purchases buy three",
  aggregateWarpSelection([bleedWarp], { "warp-0": 3 }).mods.bleedPoints, 3);
equal("W2 THE BOTH FLAG SURVIVES IT TOO",
  aggregateWarpSelection([bothWarp], { "warp-0": 1 }).mods.bleedAndHeal, true);
equal("W2b and taken twice is still just taken",
  aggregateWarpSelection([bothWarp], { "warp-0": 2 }).mods.bleedAndHeal, true,
  "buying it twice must not heal a third thing");

// W3 IS THE DEPENDENCY ON THE RELEASE BEFORE THIS ONE, asserted rather
// than assumed: Graham asked for this option to be selectable without
// limit, and it is only uncapped because 3.515.0 taught the chooser to
// ask the aggregator.
equal("W3 AND THE POINTS OPTION HAS NO CEILING", warpMaxTimes(bleedWarp), WARP_UNLIMITED,
  "reported by Graham: \"should be able to be selected multiple times (with no limit)\"");
equal("W3b while \"both\" is a one-shot checkbox", warpMaxTimes(bothWarp), 1);

/* ================================================================== *
 * L. WHAT THE CARD SAYS
 * ================================================================== */

ok("L1 THE NUMBERS ON BOTH SIDES", /3/.test(bleedStoppedLine("Toben", 3, 1))
  && /1/.test(bleedStoppedLine("Toben", 3, 1)),
  bleedStoppedLine("Toben", 3, 1));
ok("L2 AND WHEN IT STOPS, IT SAYS SO",
  /bleeding stops/i.test(bleedStoppedLine("Toben", 1, 0)), bleedStoppedLine("Toben", 1, 0));
ok("L2b naming what it was", /was 1/.test(bleedStoppedLine("Toben", 1, 0)));
ok("L3 A HEAL INSTEAD IS EXPLAINED",
  /was not bleeding/i.test(String(healedInsteadLine(CHOICE, "Toben"))),
  "otherwise a caster who chose Cure for its bleed relief cannot tell why it healed");
equal("L3b and nothing is explained on a spell with no alternative",
  healedInsteadLine(null, "Toben"), null,
  "every ordinary heal would otherwise print an apology");

/* ================================================================== *
 * K. THE PACK
 * ================================================================== */

const spells = [];
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, v] of db.iterator()) spells.push(v);
  } finally { await db.close().catch(() => {}); }
}
const byName = (n) => spells.find((s) => s?.name === n);

const cure = byName("Cure");
ok("K1 Cure's heal declares the alternative",
  Boolean(normaliseBleedAlternative((cure?.system?.effects ?? [])[0])));
// K1b EVERY AP ROW, not just the top-level one. Cure resolves through
// `apOptions`, so an alternative declared only on `system.effects` would
// never be reached by an actual casting.
const cureRows = (cure?.system?.apOptions ?? []).map((o) => (o.effects ?? [])[0]);
equal("K1b Cure prints three AP versions", cureRows.length, 3);
ok("K1c AND ALL THREE CARRY IT",
  cureRows.every((r) => Boolean(normaliseBleedAlternative(r))),
  "a casting resolves through apOptions — the top-level row alone would never be reached");
equal("K2 Cure's bleed warp buys points", cure?.system?.warps?.[0]?.mods?.bleedPoints, 1);
equal("K2b and its both warp buys the flag", cure?.system?.warps?.[1]?.mods?.bleedAndHeal, true);

const self = byName("Self Healing");
ok("K3 Self Healing declares it too",
  Boolean(normaliseBleedAlternative((self?.system?.effects ?? [])[0])));
equal("K3b buying points", self?.system?.warps?.[0]?.mods?.bleedPoints, 1);
equal("K3c and both", self?.system?.warps?.[1]?.mods?.bleedAndHeal, true);
// K3d THE NOTE WENT WITH IT. A note telling a player to apply by hand
// something the system now applies is how a bleed gets reduced twice.
ok("K3d AND ITS NOTE NO LONGER DESCRIBES THE RULE",
  !(self?.system?.effects ?? []).some((e) => /alternatively reduce your bleeding/i.test(String(e.text ?? ""))),
  "prose over working machinery is an instruction to do it again by hand");

const voice = byName("Voice Of Healing");
equal("K4 Voice Of Healing's warp buys points",
  voice?.system?.warps?.[3]?.mods?.bleedPoints, 1);
equal("K4b BUT ITS HEAL DECLARES NO CHOICE",
  normaliseBleedAlternative((voice?.system?.effects ?? [])[0]), null,
  "it prints no \"or\" — the warp is an addition, and a declared choice would stop it healing the bleeding");

/* ================================================================== *
 * E. EVERY OTHER HEAL IN THE PACK
 * ================================================================== */

const healRows = [];
for (const s of spells) {
  for (const e of (s.system?.effects ?? [])) if (String(e.kind) === "heal") healRows.push({ s, e });
  for (const o of (s.system?.apOptions ?? [])) {
    for (const e of (o.effects ?? [])) if (String(e.kind) === "heal") healRows.push({ s, e });
  }
}
const withAlt = healRows.filter(({ e }) => Boolean(normaliseBleedAlternative(e)));
// E1 IS A MEASUREMENT, AND IT CORRECTED ME. I wrote `>= 20` from
// impression and the check failed: the pack holds FOURTEEN heal rows in
// total, counting all three of Cure's AP versions. Healing is much rarer
// in this system than the number of spells that mention it suggests, and
// a loose "plenty" would have hidden that. Asserted exactly, so a
// fifteenth is a check to read rather than a silent drift.
equal("E1 THE PACK'S HEAL ROWS", healRows.length, 14,
  "counting every apOptions row as well as the top-level ones");
equal("E2 EXACTLY THE SPELLS THIS RELEASE NAMED CARRY AN ALTERNATIVE",
  JSON.stringify([...new Set(withAlt.map(({ s }) => s.name))].sort()),
  // + Animal Healing at 3.611.0 (block 34): it prints "AND reducing its
  // bleed", so it declares the point and `bleedAndHeal` on the row.
  JSON.stringify(["Animal Healing", "Cure", "Self Healing"]),
  "Voice Of Healing buys its relief and declares none; everything else is untouched");
equal("E3 AND EVERY OTHER HEAL ROW PLANS A PLAIN HEAL",
  healRows.filter(({ e }) => !normaliseBleedAlternative(e))
    .every(({ e }) => plan(normaliseBleedAlternative(e), {}, true)
      === JSON.stringify({ heal: true, bleed: 0 })), true,
  "the branch sits inside the most-used effect kind in the system");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-bleed-relief: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-bleed-relief: OK — ${checks} checks. `
  + `${healRows.length} heal rows in the pack, ${withAlt.length} carrying a bleed alternative.\n`);
