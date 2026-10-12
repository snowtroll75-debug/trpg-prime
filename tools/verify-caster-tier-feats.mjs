#!/usr/bin/env node
/**
 * verify-caster-tier-feats — the twelve Minor / Major / Master Caster feats.
 *
 * NEW at 3.569.0, on Graham's ruling of 18 September 2026 ("R2 Fix it").
 *
 * Twelve feats, an irregular level ladder, a per-tradition slot pool and a
 * Spellcraft-ability rule — and until now not one check named any of it.
 * It was the largest unguarded rule in Chapter 5, and it was found only
 * because feat-evidence misreported the whole family as printed notes and
 * the block-12 audit went looking at why.
 *
 * WHAT MAKES THIS FAMILY WORTH GUARDING is that two of its rules are the
 * kind that look right while being wrong:
 *
 *   THE LADDER IS IRREGULAR. Minor and Major grant one slot at a time
 *   (4/6/8 and 12/14/16); Master grants TWO at 18th and one more at 20th.
 *   The module's own header says that is why it is a table and not three
 *   `if (level >= x) count++` chains — a chain reads as though every rung
 *   were worth one, which is exactly the plausible-looking arithmetic
 *   this project keeps having to prove wrong.
 *
 *   "A DIFFERENT TRADITION" IS MEASURED AGAINST THE CLASS, NOT THE
 *   ARCHETYPE. All twelve are trait-gated to their own tradition's
 *   archetype, so measuring against the archetype excludes the only
 *   characters who can hold them. Driven live at 3.345.1: a 20th-level
 *   Fighter/Arcanist with Minor, Major AND Master Arcane Caster had nine
 *   slots raw, zero after the exclusion, and no card at all. Three feats,
 *   nothing. Section C is that defect, kept as a check.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  CASTER_TIER_FEATS,
  tierSlots, casterTierSlots, grantedTraditions, spellcraftAbilityFor, classTradition
} from "../module/magic/caster-tier-feats.mjs";
import { TRADITIONS } from "../module/config.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const src = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");

/* ================================================================== *
 * A. THE TABLE — twelve feats, built not written
 * ================================================================== */

/**
 * THE THREE PRINTED TIERS, WRITTEN OUT RATHER THAN IMPORTED.
 *
 * The book names exactly Minor, Major and Master, so the list IS the
 * rule; importing the module's own array would make every check below
 * agree with whatever that array happened to say, which is the shape of
 * a test that cannot fail. (It also keeps this harness from being the
 * only caller of an export nothing else uses — lesson 5.1.)
 */
const TIERS = ["minor", "major", "master"];

equal("A1 three tiers", TIERS.length, 3);
equal("A2 and one feat per tier per tradition",
  Object.keys(CASTER_TIER_FEATS).length, TIERS.length * Object.keys(TRADITIONS).length);
// BUILT FROM THE TRADITION TABLE, which is the point: a tradition added
// to config.mjs must appear here without anyone remembering to add it.
for (const tradition of Object.keys(TRADITIONS)) {
  const label = TRADITIONS[tradition].label.toLowerCase();
  for (const tier of TIERS) {
    const key = `${tier} ${label} caster`;
    ok(`A3 ${key} is in the table`, Boolean(CASTER_TIER_FEATS[key]));
    equal(`A4 ${key} carries its own tier`, CASTER_TIER_FEATS[key]?.tier, tier);
    equal(`A5 ${key} carries its own tradition`, CASTER_TIER_FEATS[key]?.tradition, tradition);
  }
}

/* ================================================================== *
 * B. THE LADDERS — irregular on purpose
 * ================================================================== */

// THE PRINTED RUNGS, run one level at a time across the boundary. An
// off-by-one at a rung is the whole risk, so each is checked at the level
// below it as well as at it.
const ladder = (tier, level) => tierSlots(tier, level);

equal("B1 Minor grants nothing at 3rd", ladder("minor", 3), 0);
equal("B2 one at 4th", ladder("minor", 4), 1);
equal("B3 still one at 5th", ladder("minor", 5), 1);
equal("B4 two at 6th", ladder("minor", 6), 2);
equal("B5 three at 8th", ladder("minor", 8), 3);
equal("B6 and no more at 20th", ladder("minor", 20), 3);

equal("B7 Major grants nothing at 11th", ladder("major", 11), 0);
equal("B8 one at 12th", ladder("major", 12), 1);
equal("B9 two at 14th", ladder("major", 14), 2);
equal("B10 three at 16th", ladder("major", 16), 3);
equal("B11 and no more at 20th", ladder("major", 20), 3);

// THE IRREGULAR ONE. Master grants TWO at its first rung where the other
// two tiers grant one — the reason the schedules are a table.
equal("B12 Master grants nothing at 17th", ladder("master", 17), 0);
equal("B13 TWO at 18th, not one", ladder("master", 18), 2,
  "this is the rung a level>=x chain would get wrong");
equal("B14 still two at 19th", ladder("master", 19), 2);
equal("B15 three at 20th", ladder("master", 20), 3);

// A RUNG THAT IS ADDED is covered by B6, B11 and B15 — each tier is
// pinned at 20th, so a fourth rung anywhere shows up as a larger total.
// An earlier draft also compared the schedules table to a literal copy
// of itself; that proved the harness could type, and B1-B15 already
// exercise every boundary through the function that reads it.
// A TIER THAT DOES NOT EXIST GRANTS NOTHING rather than throwing — a
// hand-built actor can hold anything.
equal("B17 an unknown tier grants nothing", tierSlots("grand", 20), 0);
equal("B18 and a blank one does too", tierSlots("", 20), 0);

/* ================================================================== *
 * C. SLOTS BY TRADITION — and the exclusion that killed the family
 * ================================================================== */

const arcane = (tier) => `${tier} arcane caster`;

equal("C1 one Minor Arcane Caster at 8th is three arcane slots",
  JSON.stringify(casterTierSlots([arcane("minor")], 8)), JSON.stringify({ arcane: 3 }));
// THE TIERS STACK — they are a ladder with prerequisites, not alternatives.
equal("C2 all three tiers at 20th is nine",
  JSON.stringify(casterTierSlots([arcane("minor"), arcane("major"), arcane("master")], 20)),
  JSON.stringify({ arcane: 9 }));
// AND A DUPLICATE COUNTS ONCE. An imported actor may hold two copies.
equal("C3 a duplicated feat counts once",
  JSON.stringify(casterTierSlots([arcane("minor"), arcane("minor")], 8)), JSON.stringify({ arcane: 3 }));
equal("C4 different traditions keep separate pools",
  JSON.stringify(casterTierSlots([arcane("minor"), "minor divinity caster"], 8)),
  JSON.stringify({ arcane: 3, divinity: 3 }));
equal("C5 a feat below its first rung grants nothing",
  JSON.stringify(casterTierSlots([arcane("master")], 12)), JSON.stringify({}));
equal("C6 a name that is not one of the twelve is ignored",
  JSON.stringify(casterTierSlots(["Weapon Focus"], 20)), JSON.stringify({}));

/**
 * THE DEFECT OF 3.345.1, KEPT AS A CHECK.
 *
 * The twelve are trait-gated to their own tradition's archetype, so the
 * only character offered Minor Arcane Caster is one holding Arcanist. If
 * "a different tradition" is measured against the ARCHETYPE's tradition,
 * that character is excluded by the very feat that qualified them, and
 * the whole family grants nothing — which is what it did, live, for a
 * 20th-level Fighter/Arcanist holding all three arcane tiers.
 *
 * Measured against the CLASS's tradition it coheres. These two cases are
 * the difference, and they must not both pass.
 */
{
  const all = [arcane("minor"), arcane("major"), arcane("master")];
  // A Fighter (no class tradition) who took the Arcanist archetype: the
  // archetype opened arcane, and these feats deepen it.
  const fighter = grantedTraditions(all, 20, classTradition({ tradition: "" }));
  equal("C7 a Fighter/Arcanist is granted arcane", fighter.length, 1);
  equal("C8 and it is all nine slots", fighter[0]?.slots, 9,
    "zero here is the 3.345.1 defect: three feats and nothing to show");
  equal("C9 named for the card", fighter[0]?.label, TRADITIONS.arcane.label);

  // A Wizard — arcane is already their CLASS's tradition, so the printed
  // note excludes it. This is the outcome the exclusion exists for.
  const wizard = grantedTraditions(all, 20, classTradition({ tradition: "arcane" }));
  equal("C10 a Wizard is granted nothing by arcane caster feats", wizard.length, 0,
    "the printed note says these grant a DIFFERENT tradition");
  // …and the same Wizard taking a divinity tier is granted divinity.
  const wizardDivinity = grantedTraditions(["minor divinity caster"], 8, "arcane");
  equal("C11 but a Wizard's divinity tier is granted", wizardDivinity[0]?.tradition, "divinity");
}

ok("C12 the class tradition is read from progression, not the resolved field",
  /return String\(progression\?\.tradition \?\? ""\)/.test(src("module", "magic", "caster-tier-feats.mjs")),
  "system.magic.tradition is written by an archetype — reading it is how the exclusion fired on itself");

/* ================================================================== *
 * D. THE SPELLCRAFT ABILITY
 * ================================================================== */

{
  const granted = grantedTraditions(["minor divinity caster"], 8, "arcane");
  equal("D1 a granted divinity spell rolls off divinity's ability",
    spellcraftAbilityFor("divinity", granted), TRADITIONS.divinity.ability);
  equal("D2 the caster's own tradition is left alone",
    spellcraftAbilityFor("arcane", granted), null,
    "null means 'no swap', which a caller must be able to tell from a matching ability");
  equal("D3 a tradition they were never granted is left alone",
    spellcraftAbilityFor("verdant", granted), null);
  equal("D4 an unknown tradition is left alone", spellcraftAbilityFor("nonsense", granted), null);
  equal("D5 and a blank one", spellcraftAbilityFor("", granted), null);
  // A SPELL'S TRADITION IS A LIST. Guidance ships as "divinity, ethereal,
  // verdant"; an equality test against the whole string matched none of
  // the three and a granted Guidance kept rolling off the wrong ability.
  equal("D6 a multi-tradition spell matches on any of its traditions",
    spellcraftAbilityFor("divinity, ethereal, verdant", granted), TRADITIONS.divinity.ability);
  equal("D7 and on none when it names none of them",
    spellcraftAbilityFor("arcane, verdant", granted), null);
}

/* ================================================================== *
 * E. WIRED — a rule with no call site is a well-tested opinion
 * ================================================================== */

{
  const casting = src("module", "magic", "feat-casting.mjs");
  // BOTH CONSUMERS, not "the file mentions it". Two different functions
  // read this table for two different jobs — the preparation lines a
  // player sees, and the warning that a feat naming their own tradition
  // grants nothing — and a first draft that searched the whole file
  // passed while one of them had been gutted.
  const consumers = (casting.match(/casterTierSlots\(featNames, level\)/g) ?? []).length;
  ok("E1 both of feat-casting's consumers read the slot table", consumers >= 2,
    `${consumers} call site(s): the preparation lines and the suppressed-feat warning both need it`);
  ok("E2 and the per-tier count", /tierSlots\(entry\.tier, level\)/.test(casting));
  ok("E3 and keys it on the same composed table",
    /CASTER_TIER_FEATS\[String\(raw \?\? ""\)\.trim\(\)\.toLowerCase\(\)\]/.test(casting));
  // AND feat-casting ITSELF must be reached, or the chain ends one link early.
  const reached = ["module/magic/cast-workflow.mjs", "module/uses-workflow.mjs", "module/documents/actor.mjs"]
    .filter((rel) => /feat-casting\.mjs/.test(src(...rel.split("/"))));
  equal("E4 and three live modules import feat-casting", reached.length, 3,
    "the family reaches the cast, the preparation card and the sheet");
}

if (failures.length) {
  process.stderr.write(`\nverify-caster-tier-feats: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-caster-tier-feats: OK — ${checks} checks. Twelve feats, three irregular ladders, `
  + `per-tradition pools, and the exclusion measured against the class.\n`
);
