#!/usr/bin/env node
/**
 * verify-splash — splash lands on the target, and is named for the rest.
 *
 * NEW at 3.482.0. See magic/splash.mjs for Graham's ruling and for why
 * the alchemical header had been asserting the opposite of its own code
 * since the bombs were written.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  splashAmount, hasSplash, normaliseSplash, splashTotal,
  splashFormulaNote, splashNeighboursLine, splashImmuneLine
} from "../module/magic/splash.mjs";

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

const ORB = { kind: "splash", label: "Orb Of Acid", amount: 1, perStep: 1, damageType: "acid" };
const spec = normaliseSplash(ORB);

/* ── R. THE ROW ──────────────────────────────────────────────────── */
ok("R1 a well-formed row normalises", spec !== null && spec.amount === 1);
ok("R2 a row of another kind is not one", normaliseSplash({ ...ORB, kind: "damage" }) === null);
ok("R3 a splash of zero is not a splash", normaliseSplash({ ...ORB, amount: 0 }) === null,
  "a row promising splash and carrying none");
ok("R4 a damage type is required", normaliseSplash({ ...ORB, damageType: "" }) === null);
ok("R5 nonsense amounts are refused",
  splashAmount("x") === 0 && splashAmount(null) === 0 && splashAmount(-3) === 0);
ok("R6 hasSplash agrees with the amount",
  hasSplash(2) === true && hasSplash(0) === false && hasSplash("") === false);

/* ── C. THE CASTER-LEVEL LADDER ──────────────────────────────────── */
ok("C1 base splash at caster level 1", splashTotal(spec, 0) === 1);
/*
 * C2 — "CL 4+: the damage increases by 1d6 AND THE SPLASH DAMAGE BY 1".
 * A splash that never grew would be right at low level and increasingly
 * wrong above it, which is the quietest way to be wrong.
 */
ok("C2 AND IT CLIMBS WITH CASTER LEVEL", splashTotal(spec, 1) === 2 && splashTotal(spec, 3) === 4,
  "the ladder is printed beside the dice ladder");
ok("C3 a row with no ladder never climbs",
  splashTotal(normaliseSplash({ ...ORB, perStep: 0 }), 5) === 1);
ok("C4 nothing at all splashes for nothing", splashTotal(null, 3) === 0);

/* ── L. THE LINES ────────────────────────────────────────────────── */
/*
 * L1 — THE FORMULA PRODUCES THE NUMBER BESIDE IT. 3.482.0 printed the
 * splash as its own sentence and left the damage line reading
 * "(3d6, warped)" next to a 16 that included 3 splash. A formula that
 * does not add up is the fault 3.481.0 was written for, one release on.
 */
ok("L1 THE SPLASH APPEARS IN THE FORMULA IT IS PART OF",
  splashFormulaNote(spec, 3) === " + 3 splash",
  "\"(3d6, warped)\" beside a 16 that includes the splash");
ok("L1b and nothing is added when there is no splash",
  splashFormulaNote(spec, 0) === "" && splashFormulaNote(null, 3) === "");
ok("L2 immunity is said rather than folded into a formula",
  /immune/.test(splashImmuneLine(spec, "Foe")) && /splash does nothing/.test(splashImmuneLine(spec, "Foe")));
ok("L3 the neighbours are named and the radius is not invented",
  /adjacent to the target/.test(splashNeighboursLine(spec, 1))
  && /no radius/.test(splashNeighboursLine(spec, 1)),
  "the book prints no distance for splash anywhere");

/* ── W. AND IT IS REACHED, IN BOTH PLACES ────────────────────────── */
const cast = strip(read("module", "magic", "cast-workflow.mjs"));
const alch = strip(read("module", "alchemical-workflow.mjs"));
/*
 * W1 — ADDED BEFORE DEFENCES, NOT APPLIED SEPARATELY. Resistance halves,
 * and halving two instances is not halving their sum: 5 and 1 resolve to
 * 2 apart and 3 together. Both anchors must exist before their order is
 * compared.
 */
ok("W1 THE SPELL ADDS SPLASH BEFORE RESOLVING DEFENCES", (() => {
  const add = cast.indexOf("dealt += splashDealt;");
  const resolve = cast.indexOf("const packet = resolveAgainstDefences(targetSystem, {");
  return add > -1 && resolve > -1 && add < resolve;
})(), "halving two instances is not halving their sum");
ok("W2 and the ladder rides the cast's own caster-level steps",
  cast.includes("splashTotal(splashSpec, Number(clMods?.steps ?? 0))"));
/*
 * W3 ASSERTS THE GUARDED STATEMENT AND THE FORMULA'S USE, not the bare
 * names. Two mutations walked through the first draft: `false &&` on the
 * neighbours block left the call text intact, and deleting `${splashNote}`
 * from the damage line was invisible because L1 tests the pure function
 * in isolation and nothing asked whether the caller embeds it.
 *
 * THIS IS THE FIFTH TIME IN SIX RELEASES a wiring check of mine has
 * asserted that a name appears rather than that a branch runs. Writing
 * it down here because the instance is cheap to fix and the pattern is
 * not: when checking wiring, match the whole statement.
 */
ok("W3 the spell names the neighbours too, and does it under a live guard",
  cast.includes("if (splashSpec && splashDealt > 0) {")
  && cast.includes(": splashNeighboursLine(splashSpec, splashDealt)));"),
  "a dead branch still contains the call");
ok("W3c AND THE DAMAGE LINE EMBEDS THE SPLASH FRAGMENT",
  cast.includes("const splashNote = splashFormulaNote(splashSpec, splashDealt);")
  && /\$\{splashNote\}\)` : ""\}/.test(cast),
  "a fragment computed and never inserted leaves the formula short");
/*
 * W3b — AND AFTER THE BLOW, NOT BEFORE IT. 3.482.0 pushed both splash
 * lines above the hit report, so "…and 3 acid splash" arrived two rows
 * before the hit it continued. Both anchors must exist before their
 * order is compared.
 */
ok("W3b THE NEIGHBOURS' SHARE FOLLOWS THE DAMAGE LINE", (() => {
  const dmg = cast.indexOf("const splashNote = splashFormulaNote(splashSpec, splashDealt);");
  const nbr = cast.indexOf("? splashImmuneLine(splashSpec, targetActor.name)");
  return dmg > -1 && nbr > -1 && dmg < nbr;
})(), "the neighbours' share only makes sense once the blow has landed");
/*
 * W4 — THE BOMB NOW DOES WHAT ITS HEADER ALWAYS CLAIMED. Until 3.482.0
 * only `profile.damage` reached `applyTypedDamage`, so splash landed on
 * nobody at all while the file's own comment said otherwise.
 */
ok("W4 THE BOMB APPLIES SPLASH TO ITS TARGET",
  alch.includes("const total = rolled.total + splashOnTarget;")
  && alch.includes("amount: total,"),
  "the header claimed this years before the code did it");
ok("W5 and one rule serves both — the bomb imports the spell's module",
  alch.includes('from "./magic/splash.mjs"'),
  "two answers to one question is what this release removes");

if (failures.length) {
  console.error(`verify-splash: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-splash: ${checks} checks passed`);
