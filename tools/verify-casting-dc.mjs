#!/usr/bin/env node
/**
 * verify-casting-dc — the number a spell turns on, and whether it says so.
 *
 * NEW at 3.386.0.
 *
 * WHAT THIS COVERS HAD NO COVERAGE AT ALL. Measured 24 August 2026: no
 * file under `tools/` mentioned `castingDC` or `armourPenalty`. The
 * Casting DC was nine terms in one inline expression inside `castSpell`,
 * 1,751 lines of Foundry-only code, and Chapter 9 carried three audit
 * items against 12,606 lines. The rules were all individually pure and
 * checked; their assembly was reachable by nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS THE POINT OF THE WHOLE FILE
 *
 *     dc === base + sum(parts)
 *
 * Driven over all 256 combinations of the eight optional contributors.
 * That identity is what makes a silent modifier structurally impossible
 * rather than merely absent today: the only way to move the DC is to add
 * a part, and the card is built from the parts. A tenth contributor
 * added the old way — straight onto the sum — breaks 128 of these rows
 * on the first run.
 *
 * It exists because five of the nine WERE silent. Runemage, Favoured
 * Terrain, Metamagic, Eloquence and Wizard School each appeared exactly
 * twice in cast-workflow.mjs: where computed, where added. Never on the
 * card. A Wizard with Eloquence casting a school spell in favoured
 * terrain rolled against a DC four lower than anything explained, and it
 * would never have been reported, because a spell that works looks right.
 *
 * SECTION C IS THE RULE MOST LIKELY TO BE READ WRONG. Runemage is two
 * printed sentences that interact — "all casting DCs reduced by 1", "all
 * Defensive Casting DCs increased by 2" — and a Runemage casting
 * defensively is therefore at **+1**, not -1. That arithmetic used to
 * happen in cast-workflow before the value was passed anywhere, which is
 * why the booleans now travel instead of the numbers.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  assembledCastingDC,
  assembledSaveDC,
  assembledSpellAttackTotal,
  describeParts,
  heightenedSavePP
} from "../module/magic/casting-dc.mjs";
import { CANTRIP_PENALISED_DC, castingDC, overcastDCIncrease } from "../module/magic/casting.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const dcOf = (opts) => assembledCastingDC(opts).dc;
const partsOf = (opts) => assembledCastingDC(opts).parts;
const labels = (opts) => partsOf(opts).map((p) => p.label);

/* ================================================================== *
 * A. The base
 * ================================================================== */

// THE CASTER LEVEL IS NOT OPTIONAL IN PRACTICE, and the first run of
// this file got that wrong: `dcOf({totalPP: 2})` came back 15, not the
// printed 13. `maxPPPerCast(0)` is 1, so a 2 PP spell at caster level 0
// is OVERCAST by one and picks up the increase. The code was right and
// the expectation was not — the same "my test, not the system" shape
// this project keeps paying for. Recorded because a caller who omits the
// caster level gets a silently harder DC, not an error.
equal("A1 a plain 2 PP spell at a caster level that affords it",
  dcOf({ totalPP: 2, casterLevel: 10 }), castingDC(2));
equal("A1b but the SAME spell at caster level 0 is overcast",
  dcOf({ totalPP: 2 }), castingDC(2) + overcastDCIncrease(2, 0));
ok("A1c and says so", labels({ totalPP: 2 }).includes("Overcast"));
equal("A2 a cantrip uses the flat penalised DC",
  dcOf({ isCantrip: true }), CANTRIP_PENALISED_DC);
// A CANTRIP HAS NO PP TO SCALE WITH, so its DC must ignore any that is
// passed rather than quietly adding it.
equal("A3 and ignores PP entirely",
  dcOf({ isCantrip: true, totalPP: 8 }), CANTRIP_PENALISED_DC);
equal("A4 a cantrip is never overcast, whatever the caster level",
  dcOf({ isCantrip: true, totalPP: 8, casterLevel: 1 }), CANTRIP_PENALISED_DC);
ok("A5 and carries no Overcast part", !labels({ isCantrip: true, totalPP: 8, casterLevel: 1 }).includes("Overcast"));
equal("A6 rubbish input does not throw", dcOf(), castingDC(0));

/* ================================================================== *
 * B. Each contributor moves the number, by the printed amount
 * ================================================================== */

const plain = { totalPP: 2, casterLevel: 10 };
const basePlain = dcOf(plain);

equal("B1 prohibited armour adds its penalty",
  dcOf({ ...plain, armourPenalty: 16 }) - basePlain, 16);
equal("B2 Defensive Casting adds 5",
  dcOf({ ...plain, defensive: true }) - basePlain, 5);
equal("B3 Favoured Terrain subtracts 1",
  dcOf({ ...plain, favouredTerrain: true }) - basePlain, -1);
equal("B4 Eloquence subtracts 1",
  dcOf({ ...plain, eloquence: true }) - basePlain, -1);
equal("B5 the Wizard School delta passes through",
  dcOf({ ...plain, wizardSchoolDelta: -2 }) - basePlain, -2);
equal("B6 the metamagic delta passes through",
  dcOf({ ...plain, metamagicDelta: 3 }) - basePlain, 3);
equal("B7 overcasting adds the printed increase",
  dcOf({ totalPP: 8, casterLevel: 3 }) - castingDC(8), overcastDCIncrease(8, 3));

// THEY STACK, and nothing caps them. Four reductions at once is a real
// character: a Runemage Wizard with Eloquence, in their school, in
// favoured terrain.
equal("B8 four reductions stack to -5",
  dcOf({ ...plain, runemage: true, eloquence: true, favouredTerrain: true, wizardSchoolDelta: -2 }) - basePlain,
  -5);

// A NEGATIVE ARMOUR PENALTY IS NOT A BONUS. Armour can only ever make
// casting harder, and a caller passing rubbish must not hand out a
// discount — the "a waiver is a discount, never a rebate" shape.
equal("B9 a negative armour penalty is floored at zero",
  dcOf({ ...plain, armourPenalty: -10 }), basePlain);

/* ================================================================== *
 * C. Runemage — two sentences that interact
 * ================================================================== */

equal("C1 Runemage alone subtracts 1",
  dcOf({ ...plain, runemage: true }) - basePlain, -1);
// +5 for casting defensively, then +2 more because the caster is a
// Runemage, then -1 for being a Runemage at all: net +6 over plain.
equal("C2 Runemage casting DEFENSIVELY is +1, not -1",
  dcOf({ ...plain, runemage: true, defensive: true })
  - dcOf({ ...plain, defensive: true }), 1);
equal("C3 so the defensive total is +6 over a plain cast",
  dcOf({ ...plain, runemage: true, defensive: true }) - basePlain, 6);
// AND THE LABEL CHANGES WITH IT, because "Runemage -1" beside a number
// that went up is the §5.9 shape — a card describing what did not happen.
ok("C4 the part is labelled as the defensive variant",
  labels({ ...plain, runemage: true, defensive: true }).includes("Runemage, defensive"));
// NO BRACKETS INSIDE A LABEL. `describeParts` wraps each part in its own,
// so a label carrying its own rendered "(Runemage (defensive) +1)" on a
// live card at 3.386.0. A reader who distrusts the shape of a line stops
// reading the line, so this is checked for every part any assembly can
// produce, not just the one that was caught.
for (const label of [
  ...labels({ ...plain, runemage: true, defensive: true }),
  ...labels({ ...plain, runemage: true }),
  ...assembledSaveDC({ baseDC: 15, runemage: true, wizardSchoolDelta: 2, casterLevelWarp: 1, warpSaveDC: 2 })
    .parts.map((p) => p.label)
]) {
  ok(`C4b the label "${label}" carries no brackets of its own`, !/[()]/.test(label));
}
ok("C5 and plainly otherwise",
  labels({ ...plain, runemage: true }).includes("Runemage"));

/* ================================================================== *
 * D. Nothing may move the DC without saying so
 * ================================================================== */

// THE INVARIANT. Every one of the 256 combinations of the eight optional
// contributors must satisfy dc === base + sum(parts). This is what makes
// a silent modifier impossible rather than merely absent.
let combos = 0;
let mismatches = 0;
let everSilent = null;
const FLAGS = ["isCantrip", "defensive", "runemage", "favouredTerrain", "eloquence"];
const NUMS = [
  ["armourPenalty", 16],
  ["metamagicDelta", 3],
  ["wizardSchoolDelta", -2]
];
for (let mask = 0; mask < (1 << (FLAGS.length + NUMS.length)); mask += 1) {
  const opts = { totalPP: 8, casterLevel: 3 };
  FLAGS.forEach((f, i) => { if (mask & (1 << i)) opts[f] = true; });
  NUMS.forEach(([k, v], i) => { if (mask & (1 << (FLAGS.length + i))) opts[k] = v; });
  const r = assembledCastingDC(opts);
  const sum = r.parts.reduce((t, p) => t + p.value, 0);
  combos += 1;
  if (r.base + sum !== r.dc) {
    mismatches += 1;
    if (!everSilent) everSilent = { opts, ...r, sum };
  }
}
ok(`D1 dc === base + sum(parts) across all ${combos} combinations`,
  mismatches === 0,
  everSilent ? `${mismatches} silent: e.g. ${JSON.stringify(everSilent)}` : "");
equal("D2 and the matrix really did run", combos, 256);

// A ZERO CONTRIBUTOR IS NOT A PART. Printing "(Metamagic +0)" on a card
// is noise that trains a reader to skim the very list that matters.
ok("D3 a zero-valued contributor is not listed",
  !labels({ ...plain, metamagicDelta: 0, wizardSchoolDelta: 0 }).length);
ok("D4 a plain cast lists nothing at all", partsOf(plain).length === 0);
equal("D5 and describes as an empty string", describeParts(partsOf(plain)), "");

/* ================================================================== *
 * E. What the card actually reads
 * ================================================================== */

const described = describeParts(partsOf({
  ...plain, armourPenalty: 16, eloquence: true, wizardSchoolDelta: -2
}));
ok("E1 a positive contributor is signed", /\(Prohibited armour \+16\)/.test(described), described);
ok("E2 a negative one keeps its minus", /\(Eloquence -1\)/.test(described), described);
ok("E3 and the school reduction is named", /\(Wizard School -2\)/.test(described), described);
equal("E4 nothing to say reads as nothing", describeParts([]), "");
equal("E5 rubbish does not throw", describeParts(null), "");

/* ================================================================== *
 * F. The spell attack total
 * ================================================================== */

const atk = (o) => assembledSpellAttackTotal(o);
equal("F1 a plain attack is the check's own total", atk({ checkTotal: 17 }).total, 17);
equal("F2 caster level modifications move it", atk({ checkTotal: 17, attackWarp: 3 }).total, 20);
equal("F3 Aggressive Magic adds 2", atk({ checkTotal: 17, aggressiveMagic: 2 }).total, 19);
equal("F4 the specialist uplift adds its floor", atk({ checkTotal: 17, specialistUplift: 4 }).total, 21);
equal("F5 all three together", atk({ checkTotal: 17, attackWarp: 3, aggressiveMagic: 2, specialistUplift: 4 }).total, 26);
// SAME INVARIANT. attackWarp was the silent one here.
const atkFull = atk({ checkTotal: 17, attackWarp: 3, aggressiveMagic: 2, specialistUplift: 4 });
equal("F6 total === base + sum(parts)",
  atkFull.base + atkFull.parts.reduce((t, p) => t + p.value, 0), atkFull.total);
ok("F7 and the caster level modification is named",
  atkFull.parts.some((p) => /Caster level/i.test(p.label)));
equal("F8 rubbish does not throw", atk().total, 0);

/* ================================================================== *
 * H. The Saving Throw DC — the same gap, on the number that decides
 *    whether the spell works at all
 * ================================================================== */

const sv = (o) => assembledSaveDC(o);
const svLabels = (o) => sv(o).parts.map((p) => p.label);
const BASE = 15;

equal("H1 a plain save DC is its base", sv({ baseDC: BASE }).dc, BASE);
equal("H2 the caster level warp is added", sv({ baseDC: BASE, casterLevelWarp: 2 }).dc, BASE + 2);
equal("H3 a warp's own save bonus too", sv({ baseDC: BASE, warpSaveDC: 3 }).dc, BASE + 3);
equal("H4 Runemage adds 1 to ALL save DCs", sv({ baseDC: BASE, runemage: true }).dc, BASE + 1);
equal("H5 the Wizard School adds its 2", sv({ baseDC: BASE, wizardSchoolDelta: 2 }).dc, BASE + 2);
// THE CHARACTER FROM THE FINDING: a Runemage Wizard casting their own
// school's spell, three higher than the card used to account for.
equal("H6 Runemage + school stack to +3",
  sv({ baseDC: BASE, runemage: true, wizardSchoolDelta: 2 }).dc, BASE + 3);

// A FIXED DC OVERRIDES EVERY FORMULA, and nothing may be added to it —
// the Wyrm's breath weapon borrows a number that was never derived from
// the creature breathing it.
const fixedResult = sv({ fixedDC: 22, baseDC: BASE, runemage: true, wizardSchoolDelta: 2, casterLevelWarp: 4 });
equal("H7 a fixed DC wins outright", fixedResult.dc, 22);
equal("H8 and nothing is added on top", fixedResult.parts.length, 0);
ok("H9 and it declares itself fixed", fixedResult.fixed === true);
ok("H10 an ordinary DC does not", sv({ baseDC: BASE }).fixed === false);
equal("H11 a zero fixed DC is not an override", sv({ fixedDC: 0, baseDC: BASE }).dc, BASE);
equal("H12 nor is a negative one", sv({ fixedDC: -5, baseDC: BASE }).dc, BASE);

// THE SAME INVARIANT, and it must hold in the fixed branch too rather
// than the override being excused from it.
let svCombos = 0;
let svBad = 0;
const SV_FLAGS = ["runemage"];
const SV_NUMS = [["casterLevelWarp", 2], ["warpSaveDC", 3], ["wizardSchoolDelta", 2], ["fixedDC", 22],
  // SONG & DANCE joins the matrix at 3.444.0 rather than being tested
  // beside it: the invariant `dc === base + sum(parts)` is what stops a
  // contributor moving the number in silence, and a term exempted from
  // the sweep is a term that can.
  ["songAndDance", 2]];
for (let mask = 0; mask < (1 << (SV_FLAGS.length + SV_NUMS.length)); mask += 1) {
  const o = { baseDC: BASE };
  SV_FLAGS.forEach((f, i) => { if (mask & (1 << i)) o[f] = true; });
  SV_NUMS.forEach(([k, v], i) => { if (mask & (1 << (SV_FLAGS.length + i))) o[k] = v; });
  const r = sv(o);
  svCombos += 1;
  if (r.base + r.parts.reduce((t, p) => t + p.value, 0) !== r.dc) svBad += 1;
}
ok(`H13 dc === base + sum(parts) across all ${svCombos} save combinations`, svBad === 0,
  `${svBad} silent`);
equal("H14 and that matrix really ran", svCombos, 64);

ok("H15 nothing is silent: every contributor is named",
  ["Caster level warp", "Warping", "Runemage", "Wizard School", "Song & Dance"].every((l) =>
    svLabels({ baseDC: BASE, casterLevelWarp: 1, warpSaveDC: 1, runemage: true, wizardSchoolDelta: 2, songAndDance: 2 }).includes(l)));

/* ---- Song & Dance (3.444.0) ---------------------------------------
 * Graham, 31 Aug 2026: "with Song and Dance the bonus needs to be
 * applied to the attack bonus and Save DC." A NAMED TERM, so it is added
 * once and a player can see it — see magic/casting-dc.mjs on why it
 * cannot live inside the base.
 */
equal("H17 the Bard's class bonus reaches the save DC",
  sv({ baseDC: BASE, songAndDance: 2 }).dc, BASE + 2);
ok("H17b and is named on the card",
  svLabels({ baseDC: BASE, songAndDance: 2 }).includes("Song & Dance"));
equal("H18 a cast without it is unchanged",
  sv({ baseDC: BASE, songAndDance: 0 }).dc, BASE);
equal("H18b and prints no part",
  sv({ baseDC: BASE, songAndDance: 0 }).parts.length, 0);
// IT STACKS WITH EVERYTHING ELSE THAT MOVES A SAVE DC, rather than
// competing with one of them.
equal("H19 it adds alongside Runemage and a school",
  sv({ baseDC: BASE, songAndDance: 2, runemage: true, wizardSchoolDelta: 2 }).dc, BASE + 5);
// A FIXED DC IS THE ITEM'S OR THE GRANTING EFFECT'S, not the Bard's.
equal("H20 a fixed DC gains nothing from it",
  sv({ fixedDC: 22, baseDC: BASE, songAndDance: 2 }).dc, 22);
// NEVER NEGATIVE. The caller derives this by subtracting two resolver
// answers, and a sheet in an odd state must not turn a grant into a
// penalty on somebody's save DC.
equal("H21 a negative bonus is floored rather than subtracted",
  sv({ baseDC: BASE, songAndDance: -3 }).dc, BASE);
equal("H16 rubbish input does not throw", sv().dc, 0);

/* ---- Heighten Spell moves the BASE, not the total ---- */

equal("I1 without Heighten the save uses what was spent", heightenedSavePP(4, 10, false), 4);
equal("I2 with Heighten it uses the caster's maximum", heightenedSavePP(4, 10, true), 10);
// A MAXIMUM, NOT A REPLACEMENT. A spell overcast above the cap by
// Sacrifice or Magic Ritual must not be dragged back DOWN by taking the
// metamagic that exists to raise it.
equal("I3 an overcast spell is not dragged down to the cap",
  heightenedSavePP(14, 10, true), 14);
equal("I4 equal values are unremarkable", heightenedSavePP(10, 10, true), 10);
equal("I5 rubbish does not throw", heightenedSavePP(), 0);

/* ================================================================== *
 * G. The assembly happens in exactly one place
 * ================================================================== */

const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");

ok("G1 cast-workflow builds the DC through the assembly",
  /const castingDCResult = assembledCastingDC\(/.test(cast));
// THE OLD SHAPE MUST NOT COME BACK. This anchor is the inline sum that
// this release removed — nine terms added straight together.
ok("G2 and no longer adds the nine terms inline",
  !/\+ runemageDC \+ favouredTerrain \+ mm\.dcDelta/.test(cast),
  "the inline expression is back and nothing can check it");
// AND THE SUBTITLE MUST COME FROM THE PARTS, not from a second list of
// the same facts maintained by hand — which is precisely how five
// contributors went unmentioned.
ok("G3 the card's breakdown is built from the parts",
  /describeParts\(castingDCResult\.parts\)/.test(cast));
ok("G4 the hand-written armour clause is gone from the subtitle",
  !/\(prohibited armour \+\$\{armourPenalty\}\)/.test(cast),
  "two places describing one number is how they drifted apart");
ok("G5 the attack total goes through its assembly too",
  /assembledSpellAttackTotal\(/.test(cast));
// G5 ALONE PASSED A MUTATION THAT REBUILT THE TOTAL INLINE, because the
// assembly call was still sitting above it computing a value nobody
// read. That is §5.2 exactly — "named somewhere" mistaken for "actually
// used" — committed by the check written to enforce §5.2. What matters
// is that the number the attack resolves with COMES FROM the assembly,
// so that is what G5b asserts.
ok("G5b and its result is what the attack actually uses",
  /const total = attackTotal\.total;/.test(cast),
  "the assembly can be called and ignored; only consuming it counts");
ok("G5c with no inline rebuild left beside it",
  !/const total = Number\(check\.outcome\?\.total \?\? 0\) \+ attackWarp/.test(cast));

ok("G6 the save DC goes through its assembly",
  /const saveDCResult = assembledSaveDC\(/.test(cast));
ok("G6b and its result is what targets roll against",
  /nominalSaveDC = saveDCResult\.dc;/.test(cast),
  "the assembly can be called and ignored; only consuming it counts");
ok("G6c with the old inline five-term sum gone",
  !/baseSaveDC \+ clMods\.saveDC \+ \(warpMods\.saveDC \|\| 0\)/.test(cast));
ok("G7 the save line's breakdown comes from the parts",
  /describeParts\(saveDCResult\.parts\)/.test(cast));
ok("G7b and the hand-picked caster-level clause is gone",
  !/includes \+\$\{clMods\.saveDC\} caster-level warp/.test(cast),
  "one contributor chosen by hand is how the other four went silent");
ok("G8 Heighten Spell goes through its rule",
  /heightenedSavePP\(totalPP, cap, highMagicHeightens\(actor, mm\.heightenSave\)\)/.test(cast));
ok("G8b and the card says when it moved the base",
  /Heighten Spell — as \$\{savePP\} PP/.test(cast));

/* ================================================================== */

process.stdout.write(`verify-casting-dc: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
