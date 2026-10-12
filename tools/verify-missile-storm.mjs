#!/usr/bin/env node
/**
 * verify-missile-storm — a salvo whose size is itself rolled.
 *
 * NEW at 3.478.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MISSILE STORM.
 *
 *   "You may target each character in the spell's area of effect with a
 *    massive salvo of Magic Missiles. Each target is hit by 2d6 +6 magic
 *    missiles (each inflicting 1d4+1 force damage) + 1d6 additional
 *    missiles per Size category above Medium."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE CHECKS THAT CARRY THE DESIGN.
 *
 *   Z2  A SMALL CREATURE DOES NOT LOSE MISSILES. The clause is "per Size
 *       category ABOVE Medium", so a signed step count would hand a Tiny
 *       target 2d6 FEWER missiles — a rule the book does not contain,
 *       and one that could drive the count negative. This is the defect
 *       the whole `sizeStepsAboveMedium` clamp exists to prevent, and it
 *       is invisible from a card that only ever shows Medium foes.
 *
 *   B1  N × (1d4+1) IS Nd4 + N, and the flat term is what proves the
 *       bundling. A version that dropped it — rolling plain `Nd4` — is
 *       twenty missiles' worth of missing damage on a big salvo and
 *       still prints a plausible number.
 *
 *   W3  THE STORM FIRES AT WHAT THE TEMPLATE CAUGHT and does not ask the
 *       geometry again. `areaTargets` has already been pruned by
 *       disposition, line of effect and the kind gate; a second pass
 *       would silently re-include a creature the walls spared, and the
 *       card would look right because it prints its own list.
 *
 * S1 IS GRAHAM'S RULING of 3 September 2026: the size clause counts the
 * TARGET's size, so one cast produces a different count per creature.
 * A1 is his other: the salvo lands automatically, with no save and no
 * attack roll — which is unique in this pack and therefore said out loud
 * on the card rather than left as a missing prompt.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SIZE_LADDER, BASE_SIZE, sizeStepsAboveMedium, normaliseMissileStorm,
  stormCountFormula, stormFormula, stormLine, stormEmptyLine, stormAutomaticLine
} from "../module/magic/missile-storm.mjs";
import { SIZE_STEPS } from "../module/companion.mjs";

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

const ROW = {
  kind: "missileStorm", label: "Missile Storm",
  countDice: "2d6", flatMissiles: 6, perSizeDice: "1d6",
  missileDice: "1d4", missileBonus: 1, damageType: "force"
};
const spec = normaliseMissileStorm(ROW);

/* ── R. THE ROW ──────────────────────────────────────────────────── */
ok("R1 a well-formed row normalises", spec !== null);
ok("R2 a row of another kind is not one",
  normaliseMissileStorm({ ...ROW, kind: "elementalNexus" }) === null);
ok("R3 the count dice are required",
  normaliseMissileStorm({ ...ROW, countDice: "" }) === null);
/*
 * R4 — THE PER-SIZE DICE ARE REQUIRED AS A FIELD even though a Medium
 * target never uses them. A row that omitted them would drop the size
 * clause in total silence: every Medium target takes the right number,
 * and the Huge one takes the right number too, minus the part the book
 * added for being Huge.
 */
ok("R4 AND SO ARE THE PER-SIZE DICE, though a Medium target never uses them",
  normaliseMissileStorm({ ...ROW, perSizeDice: "" }) === null,
  "omitting them drops the size clause silently");
ok("R5 the missile itself is required",
  normaliseMissileStorm({ ...ROW, missileDice: "" }) === null);
/*
 * R6 — ONE DIE PER MISSILE. `stormFormula` multiplies the missile COUNT
 * by the die, so a row declaring "2d4" per missile would be read as one
 * d4 each and quietly halve the spell. Refused rather than mis-read.
 */
ok("R6 A MISSILE ROLLS EXACTLY ONE DIE",
  normaliseMissileStorm({ ...ROW, missileDice: "2d4" }) === null,
  "the count multiplies the die; two dice per missile would be halved");
ok("R7 a damage type is required",
  normaliseMissileStorm({ ...ROW, damageType: "" }) === null);
ok("R8 the row's numbers are carried, not assumed",
  spec.flatMissiles === 6 && spec.missileDieSize === 4 && spec.missileBonus === 1
  && spec.damageType === "force");
ok("R9 a missing flat count is zero, not a refusal",
  normaliseMissileStorm({ ...ROW, flatMissiles: undefined })?.flatMissiles === 0);

/* ── Z. THE SIZE LADDER ──────────────────────────────────────────── */
/*
 * Z1 — THE SAME LADDER THE REST OF THE SYSTEM USES. Two ladders that
 * drifted apart would put Huge at a different step in two files, and
 * nothing would report it.
 */
ok("Z1 the ladder matches the one companions climb",
  SIZE_LADDER.join(",") === SIZE_STEPS.join(","),
  "two size ladders that drift apart is a bug nobody would see");
ok("Z2 medium is the base and adds nothing", sizeStepsAboveMedium(BASE_SIZE) === 0);
ok("Z3 large is one category above", sizeStepsAboveMedium("large") === 1);
ok("Z4 huge is two, gargantuan three, colossal four",
  sizeStepsAboveMedium("huge") === 2 && sizeStepsAboveMedium("gargantuan") === 3
  && sizeStepsAboveMedium("colossal") === 4);
/*
 * Z5 IS THE ONE THAT MATTERS. "per Size category ABOVE Medium" — a
 * signed count would SUBTRACT missiles from a small creature, which is
 * a rule nobody printed.
 */
ok("Z5 A SMALL CREATURE LOSES NO MISSILES",
  sizeStepsAboveMedium("small") === 0 && sizeStepsAboveMedium("tiny") === 0
  && sizeStepsAboveMedium("diminutive") === 0,
  "\"above Medium\" adds; it does not subtract");
ok("Z6 an unsized creature is treated as Medium",
  sizeStepsAboveMedium("") === 0 && sizeStepsAboveMedium("enormous") === 0,
  "template.json defaults every creature to medium");
ok("Z7 the case of the stored value does not matter",
  sizeStepsAboveMedium("HUGE") === 2);

/* ── C. THE COUNT ────────────────────────────────────────────────── */
ok("C1 a medium target rolls the printed base salvo",
  stormCountFormula(spec, "medium") === "2d6 + 6");
/*
 * C2 — PER CATEGORY, NOT PER BEING BIG. Huge is two categories above
 * Medium, so it is 2d6 extra and not 1d6. A version that added one set
 * for anything larger than Medium would be right for Large and wrong for
 * everything above it.
 */
ok("C2 EVERY CATEGORY ADDS ITS OWN SET",
  stormCountFormula(spec, "large") === "2d6 + 6 + 1d6"
  && stormCountFormula(spec, "huge") === "2d6 + 6 + 2d6"
  && stormCountFormula(spec, "colossal") === "2d6 + 6 + 4d6",
  "\"per Size category\" counts each one");
ok("C3 a small target rolls the base salvo and no less",
  stormCountFormula(spec, "tiny") === "2d6 + 6");
ok("C4 the floor of the printed salvo is 8 missiles",
  2 * 1 + spec.flatMissiles === 8,
  "2d6 cannot roll below 2, so no live row can produce a count of zero");
ok("C5 nothing at all yields nothing", stormCountFormula(null, "huge") === null);

/* ── B. THE BUNDLE ───────────────────────────────────────────────── */
/*
 * B1 — N × (1d4 + 1) === Nd4 + N. The flat term IS the "+1" on every
 * missile, multiplied. Dropping it looks like a plausible formula and
 * silently removes one point per missile — twenty on a big salvo.
 */
ok("B1 TWENTY MISSILES ARE 20d4 + 20",
  stormFormula(spec, 20) === "20d4 + 20",
  "the +1 on each missile is the flat term, multiplied");
ok("B2 one missile is 1d4 + 1", stormFormula(spec, 1) === "1d4 + 1");
ok("B3 a row with no per-missile bonus carries no flat term",
  stormFormula(normaliseMissileStorm({ ...ROW, missileBonus: 0 }), 5) === "5d4");
/*
 * B4 — NO MISSILES IS NOT "0d4". A zero count is unreachable for the
 * printed row (see C4) but reachable through an edited one, and `0d4`
 * is a formula Foundry would evaluate to nothing while the card claimed
 * a roll happened.
 */
ok("B4 NO MISSILES ROLLS NOTHING AT ALL",
  stormFormula(spec, 0) === null && stormFormula(spec, -3) === null,
  "\"0d4\" would print as a roll that never happened");
ok("B5 a fractional count is truncated, not rounded up",
  stormFormula(spec, 7.9) === "7d4 + 7");

/* ── A. IT LANDS AUTOMATICALLY ───────────────────────────────────── */
/*
 * A1 IS GRAHAM'S RULING of 3 September 2026, and the reason it is SAID
 * rather than merely done: every other area spell in this pack asks for
 * a save, so a player watching this one resolve in silence will assume
 * the prompt is broken.
 */
ok("A1 THE CARD SAYS THERE IS NOTHING TO ROLL AGAINST",
  /no attack roll/i.test(stormAutomaticLine(spec))
  && /allows no save/i.test(stormAutomaticLine(spec)),
  "silence would read as a broken save prompt");

/* ── L. THE LINES ────────────────────────────────────────────────── */
ok("L1 the line names the missile count and where it came from",
  /<strong>14<\/strong> missiles/.test(stormLine(spec, "A", "medium", 14, "2d6 + 6", 40, 40, "14d4 + 14"))
  && /2d6 \+ 6/.test(stormLine(spec, "A", "medium", 14, "2d6 + 6", 40, 40, "14d4 + 14")),
  "a total with no missile count behind it is unauditable");
ok("L2 and the damage with its formula",
  /<strong>40<\/strong> force/.test(stormLine(spec, "A", "medium", 14, "2d6 + 6", 40, 40, "14d4 + 14"))
  && /14d4 \+ 14 rolled 40/.test(stormLine(spec, "A", "medium", 14, "2d6 + 6", 40, 40, "14d4 + 14")));
/*
 * L3 — THE SIZE IS NAMED ONLY WHEN IT CHANGED SOMETHING. "(medium)"
 * beside every ordinary target is noise; "(huge — 2 extra sets)" beside
 * the one creature whose size mattered is why its number is bigger.
 */
ok("L3 THE SIZE IS EXPLAINED ONLY WHEN IT ADDED MISSILES",
  /huge — 2 extra sets/.test(stormLine(spec, "A", "huge", 20, "2d6 + 6 + 2d6", 50, 50, "20d4 + 20"))
  && !/medium/.test(stormLine(spec, "A", "medium", 14, "2d6 + 6", 40, 40, "14d4 + 14")));
ok("L4 one extra set is singular",
  /1 extra set\b/.test(stormLine(spec, "A", "large", 16, "2d6 + 6 + 1d6", 44, 44, "16d4 + 16")));
ok("L5 immunity is said instead of a number",
  /<strong>immune<\/strong> to force/.test(
    stormLine(spec, "A", "medium", 14, "2d6 + 6", 0, 40, "14d4 + 14", true)));
ok("L6 an empty area says so", /finds nothing in the area/.test(stormEmptyLine(spec)));

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const cast = strip(read("module", "magic", "cast-workflow.mjs"));
const flow = strip(read("module", "magic", "missile-storm-workflow.mjs"));
ok("W1 the cast fires the storm", cast.includes('if (row?.kind !== "missileStorm") continue;')
  && cast.includes("await applyMissileStorm("));
/*
 * W2 — AT WHAT THE TEMPLATE CAUGHT. `areaTargets` is the list the area
 * block has already pruned; passing anything else would re-include the
 * creatures walls spared.
 */
ok("W2 AT THE LIST THE AREA BLOCK ALREADY PRUNED",
  cast.includes("areaTargets ?? []"),
  "line of effect and the kind gate have already been applied to it");
/*
 * W3 REQUIRES BOTH POSITIONS TO EXIST before comparing. `indexOf`
 * returns -1 for something absent and -1 is less than every real
 * position, so a naive `a < b` passes when the area block is gone —
 * this project has hit that trap twice.
 */
ok("W3 AFTER THE AREA HAS DECIDED WHO IS INSIDE", (() => {
  const a = cast.indexOf("areaTargets = kindFiltered.kept;");
  const b = cast.indexOf("await applyMissileStorm(");
  return a > -1 && b > -1 && a < b;
})(), "firing before the template is placed would find nobody");
/*
 * W4 — THE STORM MUST NOT ASK THE GEOMETRY AGAIN. A second pass would
 * quietly re-include a creature behind a wall, and the card would still
 * read correctly because it prints the list it damaged.
 */
ok("W4 AND ASKS THE GEOMETRY NOTHING OF ITS OWN",
  !/tokensInTemplate|canvas\.tokens|lineOfEffectBlocked|testPoint/.test(flow),
  "re-deriving who is inside would undo the pruning");
ok("W5 the count is rolled before the damage", (() => {
  const a = flow.indexOf("const countRoll = await new Roll(countFormula).evaluate();");
  const b = flow.indexOf("const damageRoll = await new Roll(formula).evaluate();");
  return a > -1 && b > -1 && a < b;
})());
/*
 * W6 — THE COUNT IS ROLLED PER TARGET, INSIDE THE LOOP. Graham ruled the
 * TARGET's size adds the missiles, so hoisting the roll would give every
 * creature the Huge one's count — or the Medium one's.
 */
ok("W6 PER TARGET, INSIDE THE LOOP", (() => {
  const loop = flow.indexOf("for (const target of caught) {");
  const roll = flow.indexOf("const countRoll = await new Roll(countFormula).evaluate();");
  return loop > -1 && roll > -1 && loop < roll;
})(), "each creature's own size decides its own count");
ok("W7 the size read is the target's own",
  flow.includes("target.system?.identity?.size"),
  "Graham's ruling: the target's size, not the caster's");
ok("W8 defences are applied before the damage lands",
  flow.includes("resolveAgainstDefences(target.system ?? {}, {")
  && flow.includes("if (packet.taken > 0) {"),
  "resistance halves and immunity negates — core rules, not this spell's");

/* ── P. THE PACK ─────────────────────────────────────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let storm = null;
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell" && /^missile storm$/i.test(v.name)) storm = v;
  }
} finally { await db.close(); }
ok("P0 the spell is in the pack", Boolean(storm));
const row = (storm?.system?.effects ?? []).find((r) => r?.kind === "missileStorm") ?? null;
const packSpec = normaliseMissileStorm(row);
ok("P1 it carries a well-formed storm", packSpec !== null);
/*
 * P2 — EVERY PRINTED NUMBER IS IN THE PACK, not in code. The
 * printed-damage ratchet reads pack rows; numbers that lived only in
 * this module would look, correctly, like a spell the pack cannot roll.
 */
ok("P2 EVERY PRINTED NUMBER IS ON THE PACK ROW",
  packSpec?.countDice === "2d6" && packSpec?.flatMissiles === 6
  && packSpec?.perSizeDice === "1d6" && packSpec?.missileDice === "1d4"
  && packSpec?.missileBonus === 1,
  "\"2d6 +6 magic missiles ... 1d4+1 ... 1d6 per Size category\"");
ok("P3 the missiles are force", packSpec?.damageType === "force");
/*
 * P4 — IT IS AN AREA, AND THE AREA IS WHAT IT TARGETS. "each character
 * in the spells area of effect" — a storm with no area would find the
 * caster's single target and nothing else.
 */
ok("P4 AND IT IS AN AREA SPELL",
  /radius/i.test(String(storm?.system?.area ?? "")),
  `area is "${storm?.system?.area}"`);
ok("P5 it asks for no save", String(storm?.system?.defence ?? "").trim() === "",
  "Graham's ruling: the missiles simply land");

/* ── report ──────────────────────────────────────────────────────── */
if (failures.length) {
  console.error(`verify-missile-storm: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-missile-storm: ${checks} checks passed`);
