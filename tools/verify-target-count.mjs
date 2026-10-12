#!/usr/bin/env node
/**
 * verify-target-count — how many creatures a spell may touch.
 *
 * NEW at 3.498.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE GAP: NOTHING PARSED OR ENFORCED A SPELL'S PRINTED TARGET COUNT.
 *
 * Found on 5 September 2026 while wiring Spirit Of The Hunt's second
 * warp. The picker offered every creature on the scene and the player
 * ticked whom they liked, so "1 creature" was not a limit — and 46 warps
 * selling "an additional target" could buy nothing, because there was no
 * limit for them to raise.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION T IS THE TRAP, and it is the reason a one-line regex would
 * have been wrong. THREE OF THE NUMBERS IN THESE LINES ARE NOT COUNTS:
 *
 *   Shape Wood  "up to 20 CUBIC FEET in volume"
 *   Open/close  "weighing up to 30 LBS."
 *   Rope Trick  "up to 50 FEET of rope"
 *
 * A naive `/up to (\d+)/` would let one Open/close reach thirty
 * creatures. Section T holds every one of them against the parser.
 *
 * SECTION Y IS GRAHAM'S RULING of 5 September: "you and up to 5 willing
 * creatures" counts two things, so the cap is SIX. Reading the five as
 * the whole allowance would make a caster spend one of their own
 * companions' places.
 *
 * SECTION N IS THE HONEST NULL. Sixteen lines decline to give a number —
 * "any number of creatures", "all creatures in range", "1 or more" — and
 * for those the cap is null and the system behaves exactly as it did
 * before this release. Inventing a number would be this file deciding a
 * rule the book left open.
 *
 * SECTION G IS WHERE THE GATE SITS, which is the part that took thought:
 * after the warp that may raise the cap, and before the check that costs
 * something.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  parseTargetCount, targetCapFor, targetCapNote, overTargetRefusal
} from "../module/magic/target-count.mjs";
import { emptyWarp } from "../module/magic/spell-warp.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const capOf = (t) => parseTargetCount(t).max;

/* ================================================================== *
 * C. THE ORDINARY SHAPES
 * ================================================================== */

equal("C1 a leading number", capOf("1 creature"), 1);
equal("C1b and a larger one", capOf("3 creatures"), 3);
equal("C2 up to N", capOf("up to 6 creatures"), 6);
equal("C3 A NUMBER WRITTEN AS A WORD", capOf("two creatures"), 2,
  "Trade Essence prints it that way, and Wind Walk prints \"up to five\"");
equal("C3b in the up-to shape too", capOf("up to five creatures touched"), 5);
// C4 A BARE SINGULAR. The article is what says one.
equal("C4 an article means one", capOf("a weapon you are currently wielding"), 1);
equal("C4b as does \"the\"", capOf("the triggering creature or object"), 1);
equal("C4c and \"your\"", capOf("your arcane bond"), 1);
equal("C4d and \"one\"", capOf("one willing creature"), 1);
equal("C5 an empty line is no cap", capOf(""), null);

/* ================================================================== *
 * T. THE TRAP — a measurement is not a count
 * ================================================================== */

equal("T1 CUBIC FEET IS NOT A TARGET COUNT",
  capOf("an unworked piece of wood up to 20 cubic feet in volume"), 1,
  "Shape Wood targets one piece of wood, not twenty");
equal("T2 POUNDS ARE NOT A TARGET COUNT",
  capOf("object weighing up to 30 lbs. or portal that can be opened or closed"), null,
  "Open/close would otherwise reach thirty creatures");
equal("T3 FEET ARE NOT A TARGET COUNT",
  capOf("up to 50 feet of rope or a non-living rope-like object"), null);
equal("T3b nor when they lead the line",
  capOf("1 cubic foot of contaminated food or water"), null,
  "Purify measures a volume, not a creature");
// T4 THE UNIT IS ONLY A UNIT WHERE IT FOLLOWS THE NUMBER. "5 creatures
// within 30 feet" is five creatures, and the trap must not eat it.
equal("T4 a distance later in the line is harmless",
  capOf("3 creatures within 30 feet"), 3);

/* ================================================================== *
 * Y. "YOU AND …" — Graham's ruling, 5 September 2026
 * ================================================================== */

equal("Y1 YOU AND UP TO 5 IS SIX",
  capOf("you and up to 5 willing creatures touched"), 6,
  "the printed grammar counts two things");
equal("Y1b and up to five, written as a word", capOf("you and up to five creatures touched"), 6);
equal("Y2 you and up to 9 allies is ten", capOf("you and up to 9 allies"), 10);
equal("Y3 you and ONE named companion is two",
  capOf("you and the triggering ally"), 2);
// Y4 AND "ANY NUMBER" STAYS UNCAPPED even in this shape.
equal("Y4 you and any number is no cap", capOf("you and any number of willing allies"), null);
ok("Y5 the shape is reported, not only the number",
  parseTargetCount("you and up to 5 willing creatures").self === true,
  "so a caller can say WHY the number is what it is");

/* ================================================================== *
 * N. THE HONEST NULL
 * ================================================================== */

equal("N1 \"1 or more\" declares no limit", capOf("1 or more creatures"), null,
  "Magic Missile scales with the actions spent");
// N2/N3 ANSWER NULL WITHOUT A GUARD OF THEIR OWN. Both begin with a
// word that is not a number, so they fall through every branch — which
// is why the two guards written for them were deleted as unreachable.
// The answers still matter; the branches did not.
equal("N2 \"any number\"", capOf("any number of creatures"), null);
equal("N3 \"all creatures in range\"", capOf("all creatures in range"), null);
equal("N3b and neither pretends to have been read",
  parseTargetCount("all creatures in range").shape, "unparsed");
equal("N4 and a line nothing can read", capOf("handful of fresh berries"), null);
// N5 A NULL CAP IS UNCAPPED EVEN WARPED. "One more than no limit" is not
// a number, and refusing on it would turn an unparsed line into a
// restriction the book never printed.
equal("N5 A WARP CANNOT CAP AN UNCAPPED SPELL",
  targetCapFor("any number of creatures", { extraTargets: 3 }), null);

/* ================================================================== *
 * W. THE WARP
 * ================================================================== */

equal("W1 an unwarped cast gets the printed number", targetCapFor("1 creature", {}), 1);
equal("W2 THE WARP RAISES IT", targetCapFor("1 creature", { extraTargets: 1 }), 2);
equal("W2b and taken twice raises it twice", targetCapFor("1 creature", { extraTargets: 2 }), 3);
equal("W3 it stacks on the you-and shape too",
  targetCapFor("you and up to 5 willing creatures", { extraTargets: 1 }), 7);
const blank = emptyWarp().mods;
ok("W4 the key is declared in the warp aggregate", "extraTargets" in blank,
  "an undeclared mod is dropped between the chooser and the cast");
ok("W5 and it is an increment, not a flag",
  read("module", "magic", "spell-warp.mjs")
    .includes("if (m.extraTargets) mods.extraTargets += Number(m.extraTargets) * times;"),
  "\"an additional creature\" taken twice buys two");

/* ================================================================== *
 * R. THE REFUSAL
 * ================================================================== */

ok("R1 within the cap is not refused",
  overTargetRefusal({ spellName: "Bless", cap: 3, chosen: 3 }) === null);
ok("R2 OVER THE CAP IS REFUSED", Boolean(overTargetRefusal({ cap: 1, chosen: 2 })));
ok("R2b and the sentence says how many to untick",
  /untick 1/i.test(overTargetRefusal({ spellName: "Bless", cap: 1, chosen: 2 })),
  "a refusal with no reason is one a player retries three times");
ok("R2c and names the warp as the other way out",
  /warp/i.test(overTargetRefusal({ cap: 1, chosen: 2 })));
// R3 NO CAP MEANS NO REFUSAL, whatever is ticked — the system as it was.
ok("R3 an uncapped spell refuses nothing",
  overTargetRefusal({ cap: null, chosen: 99 }) === null);

// R4 THE PICKER'S NOTE IS SAID ONLY WHERE THE NUMBER SURPRISES. The
// prompt already prints the book's line, so restating "up to 1" is noise.
ok("R4 nothing is added to an obvious cap", targetCapNote("1 creature", {}) === null);
ok("R4b nor to a plain up-to", targetCapNote("up to 6 creatures", {}) === null);
ok("R5 THE YOU-AND SHAPE IS EXPLAINED",
  /6/.test(targetCapNote("you and up to 5 willing creatures", {}) ?? "")
  && /including yourself/i.test(targetCapNote("you and up to 5 willing creatures", {}) ?? ""));
ok("R5b and so is a warped number",
  /3/.test(targetCapNote("1 creature", { extraTargets: 2 }) ?? "")
  && /warped/i.test(targetCapNote("1 creature", { extraTargets: 2 }) ?? ""));
ok("R6 an uncapped spell says nothing", targetCapNote("any number of creatures", {}) === null);

/* ================================================================== *
 * G. WHERE THE GATE SITS
 * ================================================================== */

const cast = read("module", "magic", "cast-workflow.mjs");

// G1 GAINED AN ARGUMENT AT 3.520.0. The gate now hands `targetCapFor`
// the caster level the cast is already using, so "target up to 1
// creature per level" scales off the same number as max PP per cast —
// and an ITEM cast off the consumable's level rather than the reader's.
ok("G1 the gate exists, and knows the caster's level",
  cast.includes("if (!storingNow && spellNeedsTarget(spellData)) {")
  // An AP mode may name its own count since 3.611.0 (Death's Defiance).
  && cast.includes("cap: targetCapFor(apMode?.targets ?? spellData?.targets, warp.mods, casterLevel),"));
ok("G1b and refuses out loud", cast.includes("const refusal = overTargetRefusal({")
  && cast.includes("ui.notifications.warn(refusal);"));

const gateAt = cast.indexOf("if (!storingNow && spellNeedsTarget(spellData)) {");
const warpChooser = cast.indexOf("warp = aggregateWarpSelection(warpSpell.system?.warps, form);");
const checkAt = cast.indexOf("const check = noCheckCantrip");
const ppAt = cast.indexOf("const outcome = castingOutcome(degree, {");

// G2 AFTER THE WARP. The chooser runs after the picker, and "you can
// target an additional creature" is bought there — a gate above it would
// refuse a selection the caster was about to pay to make legal.
// G2 ONE GATE, AND IT IS AFTER THE WARP. The count matters as much as
// the position: `mutate-target-count` added a SECOND cap gate above the
// chooser and the position check still passed, because the real one was
// still where it belonged. Two doors onto one rule is the defect
// dismiss.mjs records three times over.
equal("G2 THERE IS EXACTLY ONE CAP GATE",
  cast.split("overTargetRefusal({").length - 1, 1,
  "a second one above the warp chooser refuses what the warp would legalise");
ok("G2b AND IT IS AFTER THE WARP THAT RAISES IT",
  warpChooser > 0 && gateAt > warpChooser,
  "otherwise it refuses a selection the warp was about to legalise");
// G3 AND BEFORE ANYTHING IS SPENT, the rule the side gate and the kind
// gate both state in their own comments.
ok("G3 and before the check", gateAt > 0 && checkAt > 0 && gateAt < checkAt);
ok("G3b and before the PP is taken", gateAt < ppAt, "a refusal must cost nothing");

// G4 THE PICKER SAYS THE NUMBER WHERE IT SURPRISES — Graham's ruling
// that a picker annotates rather than removes.
ok("G4 the picker carries the note",
  cast.includes("targetCapNote(spellData?.targets, {})"));
/*
 * G5 THE BOXES ARE STILL NOT DISABLED and no row is hidden: this release
 * must not quietly overturn the 27 August ruling one file over.
 *
 * PAIRED WITH A POSITIVE ANCHOR, and that pairing is not decoration.
 * The first version was the negative half alone — "no `disabled: true`
 * appears in targeting.mjs" — which is MORE true of an empty file, not
 * less. `verify-checks-read-source` blanked the file and the check
 * carried on passing; it named the pair as vacuous, which is exactly the
 * job it exists for. The positive half is what makes the negative one
 * mean something: the row must still be there to not be disabled.
 */
const targeting = read("module", "combat", "targeting.mjs");
ok("G5 the picker still renders a row per candidate",
  targeting.includes("const ordered = [...candidates].sort("),
  "the anchor that makes the refusal below a claim about a real list");
ok("G5b THE PICKER STILL REMOVES NOTHING",
  targeting.includes("const ordered = [...candidates].sort(")
  && !/disabled\s*[:=]\s*true/.test(targeting),
  "\"a picker that silently removes a legal choice is worse than one that allows a strange one\"");

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let declaring = 0;
let capped = 0;
const uncapped = [];
let wiredWarps = 0;
let inertWarps = 0;
try {
  await db.open();
  for await (const [, v] of db.iterator()) {
    if (v?.type !== "spell") continue;
    const line = String(v.system?.targets ?? "").trim();
    if (line) {
      declaring += 1;
      if (parseTargetCount(line).max === null) uncapped.push(v.name);
      else capped += 1;
    }
    for (const w of v.system?.warps ?? []) {
      if (!/additional (creature|target)|target an additional|an additional target/i
        .test(String(w.text ?? ""))) continue;
      if (Number(w.mods?.extraTargets) > 0) wiredWarps += 1;
      else inertWarps += 1;
    }
  }
} finally {
  await db.close().catch(() => {});
}

ok("P1 the pack is the one this was measured against", declaring > 340, `${declaring} declare targets`);
// P2 THE RATCHET. 338 of 354 parsed when this was built; it may rise as
// lines are tidied, and a FALL means the parser lost a shape it had.
ok("P2 nearly every declared line parses to a number", capped >= 338,
  `${capped} of ${declaring} capped; uncapped: ${uncapped.join(", ")}`);
// P3 AND THE ONES THAT DO NOT ARE THE ONES THAT SHOULD NOT. Named, so a
// new unparsed line shows up as a change rather than as a silent null.
ok("P3 the uncapped are the genuinely uncountable", uncapped.length <= 16,
  `${uncapped.length}: ${uncapped.join(", ")}`);

// P4 THE 46. This is the number the whole release is about, and
// verify-spell-conditionals counted it the other way round while they
// were inert.
equal("P4 EVERY ADDITIONAL-TARGET WARP IS WIRED", inertWarps, 0,
  `${wiredWarps} wired, ${inertWarps} still inert`);
ok("P4b and there are as many as were measured", wiredWarps >= 46, `${wiredWarps} wired`);

if (failures.length) {
  process.stderr.write(`verify-target-count: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-target-count: OK — ${checks} checks. ${capped} of ${declaring} printed target lines now `
  + `carry an enforced cap, and all ${wiredWarps} additional-target warps buy one.\n`);
