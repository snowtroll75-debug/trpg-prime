/**
 * verify-chapter7-critical-201-210 — aerial and underwater combat,
 * drowning, and the critical-hit machinery (pages 201-210).
 *
 * NEW at 3.580.0, for the pages 201-210 audit. Fifteen defects and
 * Graham's rulings of 21 September 2026 (R1-R17):
 *
 *   A  ground actions in the air (D1; R1)
 *   B  underwater combat, all seven bullets (D2; R2)
 *   C  drowning and suffocation (D3; R3)
 *   D  the critical bonus dice as precision damage (D4; R4)
 *   E  armour-granted CR bypassed by a named location (D5; R5)
 *   F  the armour clauses: metal, rigid and unarmoured (D6-D8; R6-R8)
 *   G  an armour clause that rewrites Persistence (D9; R9)
 *   H  Chaos rolls the fumble, and a 1 rebounds (D10; R10)
 *   I  the mook Chaos Conviction goes to the attacker (D11; R11)
 *   J  Quick Damage (D12; R12)
 *   K  Modes of Lethality (D13; R13)
 *   L  Specific Location Injuries (D14; R14)
 *   M  the rows that ask for something (D15; R15)
 *   N  the five tables themselves, and Subdual's Fatal ending (R16)
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE or from one
 * of Graham's rulings, never from the module under test.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  armourCRBypass, attackOutcome, buildWeaponDamageFormula, criticalPrecisionDice,
  criticalSeverity, quickDamageStatic, CRITICAL_BONUS_DICE, QUICK_DAMAGE_TABLE
} from "../module/combat/attack.mjs";
import {
  underwaterElectricity, underwaterFireFails, underwaterFlatFooted, underwaterGroundActionNote,
  underwaterMeleePenalty, underwaterRangedOutcome, underwaterRegion,
  UNDERWATER_BLOCKED_RANGED, UNDERWATER_MELEE_PENALTY, UNDERWATER_PENALISED_MELEE,
  UNDERWATER_RESISTANCES
} from "../module/combat/underwater.mjs";
import {
  airLostToEvent, airRestored, airSpentThisTurn, breathCapacity, spendAir,
  suffocationOutcome, suffocationSave,
  SUFFOCATION_BASE_DAMAGE, SUFFOCATION_DAMAGE_STEP, SUFFOCATION_SAVE_DC, SUFFOCATION_SAVE_STEP
} from "../module/drowning.mjs";
import { airborneActionNote } from "../module/combat/fly.mjs";
import {
  criticalAmendmentApplies, effectivePersistence, resolveEffectiveConditions, selectArmourClause
} from "../module/effect-parser.mjs";
import {
  alternateResultWhenUnarmoured, apEscapeRider, criticalRowRiders, flatCheckRider,
  freeAttackRider, saveRider
} from "../module/combat/critical-riders.mjs";
import { armourAtLocation } from "../module/combat/hit-location.mjs";
import { CONDITIONS, INJURY_LOCATION_TARGETS, conditionModifiers } from "../module/conditions/registry.mjs";
import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
import { DEGREES, DEGREE_BY_KEY } from "../module/dice/resolution.mjs";

let failures = 0;
let checks = 0;
function ok(label, condition, why = "") {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL ${label}${why ? ` — ${why}` : ""}`);
}
function eq(label, actual, expected, why = "") {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `${why}${why ? " — " : ""}got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
// Comments are stripped before a source pattern is looked for, so a
// sentence ABOUT the code cannot pass for the code.
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

const rowOf = (table, min) => CRITICAL_TABLES[table].find((r) => r.min === min);

/** Graham's R-of-21-September: drowning's critical failure is the Fumble. */
const CRITICAL_FAILURE_DEGREE = "fumble";

/* ================================================================== */
/* A — GROUND ACTIONS IN THE AIR (page 201; D1, R1)                    */
/* ================================================================== */

// "The GM makes the final decision as to whether certain actions that
// are typically performed on the ground would be feasible or effective
// in the air." A NOTE, not a refusal — Graham's R1: "Yes".
{
  const note = airborneActionNote({ airborne: true, actionName: "High Jump" });
  ok("A1 an airborne ground action is remarked on", note.includes("while airborne"));
  ok("A2 and the page is named", note.includes("Page 201"));
  ok("A3 jumping gets the page's own reason",
    note.includes("solid ground for propulsion"),
    `got ${JSON.stringify(note)}`);
  ok("A4 a non-jump action gets the general note only",
    !airborneActionNote({ airborne: true, actionName: "Feint" }).includes("propulsion"));
  eq("A5 on the ground it says nothing", [
    airborneActionNote({ airborne: false, actionName: "High Jump" }),
    airborneActionNote({ airborne: true, actionName: "" })
  ], ["", ""]);
}

{
  const aw = code("module", "combat", "action-workflow.mjs");
  ok("A6 the action card asks both questions, and keeps both answers",
    /function placeNotes\(actor, action\) \{/.test(aw)
    && /if \(aloft\) out\.push\(line\(`<em>\$\{aloft\}<\/em>`\)\);/.test(aw)
    && /if \(water\) out\.push\(line\(`<em>\$\{water\}<\/em>`\)\);/.test(aw));
  // A NOTE, NOT A REFUSAL: nothing in the action path returns early on it.
  ok("A7 and neither refuses the action",
    !/if \(aloftNote\) return/.test(aw) && !/if \(waterNote\) return/.test(aw));
  // F3 (3.580.1): BOTH commitment points. The note sat on the no-roll
  // card alone, so High Jump — page 201's own example — carried nothing
  // at forty feet, because a check action builds its card elsewhere.
  ok("A8 F3 the no-roll path says it",
    /lines\.push\(\.\.\.placeNotes\(actor, action\)\);/.test(aw));
  ok("A9 F3 and so does the check path, before the roll",
    /const notes = placeNotes\(actor, action\);\s*\n\s*if \(notes\.length\) await postCard\(actor, action\.name, notes\);/.test(aw));
  const placeAt = aw.indexOf("const notes = placeNotes(actor, action);");
  const rollAt = aw.indexOf("const check = await TRGCheck.roll({");
  ok("A10 F3 and it is said before the check, not after", placeAt > 0 && placeAt < rollAt);
}

/* ================================================================== */
/* B — UNDERWATER COMBAT (page 201; D2, R2)                            */
/* ================================================================== */

// "You're flat-footed when fighting or moving in the water unless you
// have a swim Speed."
eq("B1 flat-footed without a swim Speed", [
  underwaterFlatFooted({ underwater: true, swimSpeed: 0 }),
  underwaterFlatFooted({ underwater: true, swimSpeed: 30 }),
  underwaterFlatFooted({ underwater: false, swimSpeed: 0 })
], [true, false, false]);

// "You gain acid and fire resistance."
eq("B2 the two resistances", Array.from(UNDERWATER_RESISTANCES), ["acid", "fire"]);

// "You take a -2 circumstance penalty to melee slashing or bludgeoning
// attacks that pass-through water."
eq("B3 the melee penalty is -2, and only those two types", [
  UNDERWATER_MELEE_PENALTY,
  Array.from(UNDERWATER_PENALISED_MELEE)
], [-2, ["slashing", "bludgeoning"]]);

eq("B4 either end of the blow counts", [
  underwaterMeleePenalty({ attackerUnderwater: true, damageType: "slashing" }),
  underwaterMeleePenalty({ targetUnderwater: true, damageType: "bludgeoning" }),
  underwaterMeleePenalty({ attackerUnderwater: true, damageType: "piercing" }),
  underwaterMeleePenalty({ damageType: "slashing" })
], [-2, -2, 0, 0]);

// "Ranged attacks that deal bludgeoning or slashing damage automatically
// miss if the attacker or target is underwater, and piercing ranged
// attacks… have their range increments halved."
eq("B5 the two blocked ranged types", Array.from(UNDERWATER_BLOCKED_RANGED),
  ["bludgeoning", "slashing"]);

eq("B6 bludgeoning and slashing miss automatically", [
  underwaterRangedOutcome({ attackerUnderwater: true, damageType: "bludgeoning" }).automaticMiss,
  underwaterRangedOutcome({ targetUnderwater: true, damageType: "slashing" }).automaticMiss,
  underwaterRangedOutcome({ attackerUnderwater: true, damageType: "piercing" }).automaticMiss,
  underwaterRangedOutcome({ damageType: "slashing" }).automaticMiss
], [true, true, false, false]);

eq("B7 piercing halves the increment and nothing else changes it", [
  underwaterRangedOutcome({ attackerUnderwater: true, damageType: "piercing" }).rangeIncrementFactor,
  underwaterRangedOutcome({ targetUnderwater: true, damageType: "piercing" }).rangeIncrementFactor,
  underwaterRangedOutcome({ attackerUnderwater: true, damageType: "bludgeoning" }).rangeIncrementFactor,
  underwaterRangedOutcome({ damageType: "piercing" }).rangeIncrementFactor
], [0.5, 0.5, 1, 1]);

// "Any attempt to use a fire spell underwater results in a failure.
// Furthermore, actions with the fire trait also fail automatically."
eq("B8 fire fails by damage type OR by trait", [
  underwaterFireFails({ underwater: true, damageType: "fire" }),
  underwaterFireFails({ underwater: true, traits: "Fire, Manipulate" }),
  underwaterFireFails({ underwater: true, traits: "Manipulate" }),
  underwaterFireFails({ underwater: true, damageType: "cold" }),
  underwaterFireFails({ underwater: false, damageType: "fire" })
], [true, true, false, false, false]);

// A trait that merely CONTAINS the word is not the trait.
eq("B9 firearm is not fire", [
  underwaterFireFails({ underwater: true, traits: "Firearm" })
], [false]);

// "Any spells or electricity abilities used underwater immediately have
// radius equal to the normal range of the spell emanating from their
// originator or caster. The creator of such an effect always takes
// double damage from the effect."
{
  // RE-READ AT 3.622.0 (block 39's R8): the Electricity trait's own entry —
  // "the range becomes Personal and the Area becomes an explosive sphere with
  // a 10' radius … including the caster" — replaces the range-as-radius;
  // page 201's doubling for the caster is kept.
  const shock = underwaterElectricity({ underwater: true, damageType: "electricity", rangeFeet: 60 });
  eq("B10 a 10-ft sphere on the caster, who takes double", [shock.applies, shock.radiusFeet, shock.includesCaster, shock.creatorTakesDouble],
    [true, 10, true, true]);
  eq("B11 and only for electricity, only underwater", [
    underwaterElectricity({ underwater: true, damageType: "fire", rangeFeet: 60 }).applies,
    underwaterElectricity({ underwater: false, damageType: "electricity", rangeFeet: 60 }).applies
  ], [false, false]);
}

// "Some ground-based actions might not work underwater or while floating
// (GM discretion)."
{
  const note = underwaterGroundActionNote({ underwater: true, actionName: "High Jump" });
  ok("B12 the ground-action note names the page and the GM",
    note.includes("Page 201") && /GM's call/.test(note));
  eq("B13 and says nothing on dry land",
    underwaterGroundActionNote({ underwater: false, actionName: "High Jump" }), "");
}

// HOW WATER IS DECLARED (R2): a Region flag, as difficult terrain and
// unusual surfaces already are — or a Region named for it.
eq("B14 a Region declares water by flag or by name", [
  Boolean(underwaterRegion({ flags: { "trg-prime": { underwater: true } }, name: "x" })),
  Boolean(underwaterRegion({ name: "The flooded vault (underwater)" })),
  Boolean(underwaterRegion({ name: "Submerged cavern" })),
  Boolean(underwaterRegion({ name: "A dry room" })),
  Boolean(underwaterRegion(null))
], [true, true, true, false, false]);

{
  const wf = code("module", "combat", "underwater-workflow.mjs");
  // F4's lesson (3.579.1) carried across: the Region's own token set
  // first, the PLACEABLE second, never the document's testPoint.
  ok("B15 the Region is asked the way surfaces.mjs learned to ask it",
    /const inside = region\.tokens\?\.has\?\.\(tokenDocument\)\s*\n?\s*\?\? \(centre \? regionContains\(region, centre\) : false\);/.test(wf));
  // F1 (3.580.1): three guessed paths, all undefined on a real actor, so
  // a creature WITH a swim Speed was flat-footed and told it was "for
  // want of a swim Speed". The path is measured now.
  // THE PATH IS CHECKED AGAINST template.json, which is what actually
  // decides an actor's shape — not against my memory of it. Three guessed
  // paths all read `undefined`, and a pattern check would have agreed
  // with every one of them.
  {
    const template = JSON.parse(read("template.json"));
    const char = template?.Actor?.templates?.creature ?? template?.Actor?.character ?? {};
    const merged = Object.assign({}, ...(char.templates ?? []).map((t) => template.Actor.templates[t] ?? {}), char);
    const swim = merged?.combat?.movement?.swim;
    ok("B15b F1 system.combat.movement.swim is a real field",
      swim && typeof swim === "object" && "total" in swim,
      `template says ${JSON.stringify(swim)}`);
    // THROUGH `speedValue`, which is the project's own answer to this
    // class of mistake — and `verify-speed-pool` caught the first draft
    // of the fix for reading the field raw.
    ok("B15c F1 and the workflow reads that one, through speedValue",
      /speedValue\(actor\?\.system\?\.combat\?\.movement\?\.swim\) \|\| 0/.test(wf)
      && !/attributes\?\.speeds\?\.swim/.test(wf));
  }
  ok("B16 the resistances are written as TEXT, not as a number",
    /key: "system\.combat\.resistances"/.test(wf) && /CHANGE_TYPE\.ADD/.test(wf));
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("B17 the attack path reads both ends of the water",
    /const attackerUnderwater = tokenIsUnderwater\(/.test(aw)
    && /const targetUnderwater = tokenIsUnderwater\(/.test(aw));
  ok("B18 a blocked ranged attack does not roll",
    /if \(waterRanged\.automaticMiss\) \{[\s\S]{0,400}return null;/.test(aw));
  ok("B19 a fire attack underwater does not roll",
    // 3.632.0: a Submersible weapon is exempt (Fiends & Fables 3.0, ruling 6).
    /if \(!waterExempt\.fireFails && underwaterFireFails\(\{[\s\S]{0,300}return null;/.test(aw));
  ok("B20 the increment is halved after everything that lengthens it",
    /rangeIncrement = \(effectiveRangeIncrement[\s\S]{0,400}waterRanged\.rangeIncrementFactor/.test(aw));
}

/* ================================================================== */
/* C — DROWNING AND SUFFOCATION (page 202; D3, R3)                     */
/* ================================================================== */

// "You can hold your breath for a number of rounds equal to 5 + Con or 1
// round whichever is greater."
eq("C1 breath is 5 + Con, with a floor of 1", [
  breathCapacity(0), breathCapacity(3), breathCapacity(-4), breathCapacity(-9), breathCapacity(-20)
], [5, 8, 1, 1, 1]);

// The feat that multiplies it — "hold your breath 10× as long as usual".
eq("C2 a feat multiplies the whole lungful", [breathCapacity(3, 10), breathCapacity(-9, 10)],
  [80, 10]);

// "Reduce your remaining air by 1 round at the end of each of your turns,
// or by 2 if you attacked or cast any spells that turn."
eq("C3 a turn costs 1, or 2 if you attacked or cast", [
  airSpentThisTurn({}), airSpentThisTurn({ actedViolently: true })
], [1, 2]);

// "You also lose 1 round worth of air each time you are critically hit
// or critically fail a save against a damaging effect. If you speak…
// you lose all remaining air."
eq("C4 the events, and speaking costs everything", [
  airLostToEvent({ criticallyHit: true }),
  airLostToEvent({ criticalSaveFailure: true }),
  airLostToEvent({ criticallyHit: true, criticalSaveFailure: true }),
  airLostToEvent({ spoke: true }),
  airLostToEvent({})
], [1, 1, 2, null, 0]);
// JSON turns Infinity into null; check it directly too.
ok("C4b speaking really is everything", airLostToEvent({ spoke: true }) === Infinity);

eq("C5 spending air, and noticing when it runs out", [
  spendAir(5, 2), spendAir(2, 2), spendAir(1, 2), spendAir(0, 1), spendAir(4, Infinity)
], [
  { remaining: 3, ranOut: false },
  { remaining: 0, ranOut: true },
  { remaining: 0, ranOut: true },
  { remaining: 0, ranOut: false },
  { remaining: 0, ranOut: true }
]);

// "must attempt a Fortitude save, needing to achieve 20 or greater… On
// each check after the first, you take a cumulative -2 penalty to the
// save and the damage increases by 5; these increases are cumulative."
eq("C6 the printed numbers", [
  SUFFOCATION_SAVE_DC, SUFFOCATION_BASE_DAMAGE, SUFFOCATION_DAMAGE_STEP, SUFFOCATION_SAVE_STEP
], [20, 10, 5, -2]);

eq("C7 the ladder is cumulative from the second check", [
  suffocationSave(0), suffocationSave(1), suffocationSave(2), suffocationSave(3)
], [
  { dc: 20, penalty: 0, damage: 10 },
  { dc: 20, penalty: -2, damage: 15 },
  { dc: 20, penalty: -4, damage: 20 },
  { dc: 20, penalty: -6, damage: 25 }
]);

// THE DC DOES NOT MOVE; THE SAVE DOES. The page gives a fixed number to
// achieve and a penalty to the roll.
ok("C8 the DC stays 20 at every step",
  [0, 1, 2, 5, 9].every((n) => suffocationSave(n).dc === 20));

// "On a failure, you take 10 damage (untyped), and on a critical failure,
// you die."
eq("C9 the outcomes", [
  suffocationOutcome({ total: 20, dc: 20, damage: 10 }),
  suffocationOutcome({ total: 19, dc: 20, damage: 10 }),
  suffocationOutcome({ total: 5, dc: 20, criticalFailure: true, damage: 10 })
], [
  { passed: true, dies: false, damage: 0 },
  { passed: false, dies: false, damage: 10 },
  { passed: false, dies: true, damage: 0 }
]);

// "Once your access to air is restored, you stop suffocating and are no
// longer unconscious… you only regain consciousness if there are no
// other factors causing the condition."
eq("C10 air restored, with the page's own caveat", [
  airRestored({}), airRestored({ otherReasonUnconscious: true })
], [
  { stopsSuffocating: true, wakes: true },
  { stopsSuffocating: true, wakes: false }
]);

// The condition the book had already asked for twice before it existed.
ok("C11 Suffocating is a condition", Boolean(CONDITIONS.suffocating));
eq("C12 and it carries Unconscious with it",
  Array.from(CONDITIONS.suffocating.includes ?? []), ["unconscious"]);
ok("C13 and it is not valued — the ladder is a count of checks, not a severity",
  CONDITIONS.suffocating.valued === false);

// The two critical rows that apply it by name.
{
  const rows = [];
  for (const [table, list] of Object.entries(CRITICAL_TABLES)) {
    for (const row of list) {
      if (/\bsuffocat/i.test(row.effect)) rows.push(`${table} ${row.min}`);
    }
  }
  ok("C14 the tables that apply Suffocating now have a condition to apply",
    rows.length >= 2, `rows: ${rows.join(", ")}`);
}

{
  const wf = code("module", "drowning-workflow.mjs");
  ok("C15 the save is Fortitude and carries the cumulative penalty",
    /type: "save"/.test(wf) && /label: "Suffocating", value: plan\.penalty/.test(wf));
  ok("C16 a critical failure kills", /if \(outcome\.dies\)[\s\S]{0,200}toggleStatusEffect\("dead"/.test(wf));
  /*
   * F2 (3.580.1) — AND THE CHECK THAT WOULD HAVE CAUGHT IT.
   *
   * `applyDamageAndCheckDying` was imported from `combat/damage-workflow`
   * on the strength of its name; it lives in `combat/dying-workflow`. The
   * first failed suffocation save threw, so nothing could drown. A
   * pattern asserting the right filename would only have agreed with
   * whichever name I had believed in, which is how 3.579.2 shipped a
   * no-op — so this asks the OTHER file whether it exports the name.
   *
   * Generic on purpose: every named dynamic import in the two new
   * workflows is resolved and checked, so the next wrong module is
   * caught whoever writes it.
   */
  for (const file of [
    ["module", "drowning-workflow.mjs"],
    ["module", "combat", "underwater-workflow.mjs"]
  ]) {
    const src = read(...file);
    const here = path.dirname(path.join(SYSTEM_ROOT, ...file));
    const pattern = /const \{([^}]+)\} = await import\("([^"]+)"\)/g;
    let match;
    while ((match = pattern.exec(src))) {
      const names = match[1].split(",").map((n) => n.split(":")[0].trim()).filter(Boolean);
      const targetPath = path.resolve(here, match[2]);
      const exists = fs.existsSync(targetPath);
      ok(`C16b ${match[2]} exists`, exists, `imported by ${file.join("/")}`);
      if (!exists) continue;
      const target = fs.readFileSync(targetPath, "utf8");
      for (const name of names) {
        ok(`C16b ${match[2]} exports ${name}`,
          new RegExp(`export\\s+(async\\s+)?(function|const|let|class)\\s+${name}\\b`).test(target)
          || new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(target),
          `${file.join("/")} imports it from there`);
      }
    }
  }
  /*
   * F4 (3.580.2) — "on a critical failure, you die", against the ladder
   * this system actually has.
   *
   * The first version read `degree.criticalFailure`. A degree carries
   * `key`, `label`, `min`, `rank` and `success` and NOTHING ELSE, so that
   * read was `undefined` on every save ever made and page 202's death
   * could not fire. Checked here against `DEGREES` itself rather than
   * against the two strings, so a ladder that grows a new bottom rung
   * fails this instead of silently outliving it.
   */
  {
    // GRAHAM'S RULING (21 September 2026): "the critical failure for
    // drowning should be fumble." The named degree, and everything worse
    // than it — a Blunder is a worse roll than a Fumble, so sparing it
    // would make the worse roll the safer one.
    eq("C17a F4 Fumble is the named degree, and it is real",
      DEGREE_BY_KEY[CRITICAL_FAILURE_DEGREE]?.label, "Fumble");
    const expected = DEGREES
      .filter((d) => d.rank <= DEGREE_BY_KEY[CRITICAL_FAILURE_DEGREE].rank)
      .map((d) => d.key);
    eq("C17b F4 the set is that degree or worse, read off the ladder",
      expected, ["fumble", "blunder"]);
    ok("C17c F4 nothing that SUCCEEDS is ever in it",
      expected.every((k) => DEGREE_BY_KEY[k].success === false));
    ok("C17d F4 and the workflow derives it rather than listing it",
      /const CRITICAL_FAILURE_DEGREE = "fumble";/.test(wf)
      && /DEGREES\.filter\(\(d\) => d\.rank <= \(DEGREE_BY_KEY\[CRITICAL_FAILURE_DEGREE\]\?\.rank \?\? -1\)\)/.test(wf)
      && /criticalFailure: CRITICAL_FAILURE_DEGREES\.includes\(/.test(wf)
      && !/degree\?\.criticalFailure/.test(wf));
    // A degree object really has no such field — the fact the first
    // version assumed.
    ok("C17e F4 no degree in the ladder carries a criticalFailure field",
      DEGREES.every((d) => !("criticalFailure" in d)),
      JSON.stringify(Object.keys(DEGREES[0])));
  }
  ok("C17 running out of air applies Suffocating",
    /toggleStatusEffect\("suffocating", \{ active: true \}\)/.test(wf));
  const cb = code("module", "documents", "combat.mjs");
  ok("C18 the clock runs at the end of each of your turns",
    /advanceDrowningAtTurnEnd\(actor, \{/.test(cb));
  ok("C19 and 'attacked or cast' is the MAP counter, not a second marker",
    /actedViolently: Number\(actor\.getFlag\?\.\(SYSTEM_ID, "attackCount"\) \?\? 0\) > 0/.test(cb));
  const uw = code("module", "combat", "underwater-workflow.mjs");
  ok("C20 going under takes a breath and coming up restores it",
    // 3.632.0: both sides of the waterline restore air for whichever kind
    // of creature breathes there (Aquatic inverts it) — so two sites.
    /await startHoldingBreath\(actor\);/.test(uw) && (uw.match(/await restoreAir\(actor\);/g) ?? []).length === 2);
  const cw = code("module", "magic", "cast-workflow.mjs");
  ok("C21 a verbal spell empties the lungs",
    /components\?\.verbal[\s\S]{0,200}loseAirToEvent\(actor, \{ spoke: true \}\)/.test(cw));
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("C22 a critical taken costs a round of air",
    /loseAirToEvent\(targetActor, \{ criticallyHit: true \}\)/.test(aw));
}

/* ================================================================== */
/* D — THE CRITICAL BONUS DICE ARE PRECISION (page 203; D4, R4)        */
/* ================================================================== */

// "Bonus Damage: A critical hit adds bonus damage of your primary damage
// type (after BAB modification). This damage is precision damage in type."
eq("D1 the printed bonus dice", [
  CRITICAL_BONUS_DICE.minor, CRITICAL_BONUS_DICE.serious, CRITICAL_BONUS_DICE.deadly
], [1, 2, 3]);

eq("D2 precision immunity takes them all, resistance takes half", [
  criticalPrecisionDice("minor"), criticalPrecisionDice("minor", { resisted: true }), criticalPrecisionDice("minor", { immune: true }),
  criticalPrecisionDice("serious"), criticalPrecisionDice("serious", { resisted: true }), criticalPrecisionDice("serious", { immune: true }),
  criticalPrecisionDice("deadly"), criticalPrecisionDice("deadly", { resisted: true }), criticalPrecisionDice("deadly", { immune: true })
], [1, 0, 0, 2, 1, 0, 3, 1, 0]);

eq("D3 a plain hit has none to take", [
  criticalPrecisionDice(null), criticalPrecisionDice(null, { immune: true })
], [0, 0]);

// THE DICE STAY IN THE WEAPON'S OWN EXPRESSION, because they are "of your
// primary damage type" — a fire-resistant creature resists them.
eq("D4 the formula carries the surviving dice", [
  buildWeaponDamageFormula("1d8", { bab: 6, critical: "deadly" }),
  buildWeaponDamageFormula("1d8", { bab: 6, critical: "deadly", criticalDice: 1 }),
  buildWeaponDamageFormula("1d8", { bab: 6, critical: "deadly", criticalDice: 0 })
], ["5d8", "3d8", "2d8"]);

// `Number(null)` is 0 and 0 is finite: the override must not be detected
// by asking whether it is a number, or "no override" reads as "no dice".
eq("D5 no override is not an override of zero", [
  buildWeaponDamageFormula("1d8", { bab: 6, critical: "deadly", criticalDice: null }),
  buildWeaponDamageFormula("1d8", { bab: 6, critical: "deadly", criticalDice: undefined })
], ["5d8", "5d8"]);

{
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("D6 the damage path gates the critical dice on the target's defences",
    // 3.617.0: the quality-damage comparison passes the same dice, so the
    // check names the formula build it gates.
    /buildWeaponDamageFormula\((?:handAndAHalfDamage \?\? )?damageOverride \?\? weaponData\.damage, \{[\s\S]{0,200}?\n\s*criticalDice: (?:drainDice \? 0 : )?critDiceKept,/.test(aw)
    && /criticalPrecisionDice\(critical, \{\s*immune: precisionImmune, resisted: precisionResisted\s*\}\)/.test(aw));
  // THE ORDERING IS NOT CHECKED HERE, deliberately. The gate must be
  // resolved above the first formula build or it reads a variable that
  // does not exist yet — and that is `verify-use-before-declaration`'s
  // job, which catches it as a real temporal-dead-zone throw rather than
  // as a pair of string offsets. A second check of the same fact here
  // would be one no mutation could falsify, which is the shape this
  // harness exists to avoid.
}

/* ================================================================== */
/* E — ARMOUR-GRANTED CR IS BYPASSED (page 203; D5, R5)                */
/* ================================================================== */

// "if an attack targets a specific part of the body (ambush, vital
// strike), then CR is bypassed if no armour is worn at that location."
// ONLY THE ARMOUR'S PORTION — a Construct's own 4 is not what the
// paragraph is qualifying.
eq("E1 an unarmoured named location drops the armour's share", [
  armourCRBypass({ criticalResistance: 6, armourCriticalResistance: 2, declaredLocation: "legs", locationArmoured: false }),
  armourCRBypass({ criticalResistance: 6, armourCriticalResistance: 2, declaredLocation: "legs", locationArmoured: true }),
  armourCRBypass({ criticalResistance: 6, armourCriticalResistance: 2, declaredLocation: null, locationArmoured: false }),
  armourCRBypass({ criticalResistance: 4, armourCriticalResistance: 0, declaredLocation: "legs", locationArmoured: false })
], [
  { criticalResistance: 4, bypassed: 2 },
  { criticalResistance: 6, bypassed: 0 },
  { criticalResistance: 6, bypassed: 0 },
  { criticalResistance: 4, bypassed: 0 }
]);

// It can never take away more than there is.
eq("E2 it cannot go below zero",
  armourCRBypass({ criticalResistance: 1, armourCriticalResistance: 2, declaredLocation: "arms", locationArmoured: false }),
  { criticalResistance: 0, bypassed: 1 });

{
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("E3 the attack path reads the declared location and the armour's share",
    /getFlag\?\.\(SYSTEM_ID, "vitalStrikeLocation"\)/.test(aw)
    && /armourCriticalResistance: Number\(targetActor\?\.system\?\.combat\?\.armourCriticalResistance \?\? 0\)/.test(aw));
  ok("E4 and the reduced CR is what the severity is read against",
    /criticalResistance: crBypass\.criticalResistance,/.test(aw));
  // The field existed and was read by nothing; it must now be read.
  const actor = code("module", "documents", "actor.mjs");
  ok("E5 the field is still recorded separately from the total",
    /system\.combat\.armourCriticalResistance = armourCR;/.test(actor));
}

/* ================================================================== */
/* F — THE ARMOUR CLAUSES (page 204; D6-D8, R6-R8)                     */
/* ================================================================== */

const ARMOURED = { armoured: true, rigid: false, metal: false };
const RIGID = { armoured: true, rigid: true, metal: false };
const METAL = { armoured: true, rigid: false, metal: true };
const BARE = { armoured: false, rigid: false, metal: false };

// Slashing 54-56, transcribed: "A vicious hack to targets lower leg must
// open a blood vessel or something. Bleeding 3 & falls prone. Armoured:
// Reduce bleeding by 1. Rigid Armoured: Reduce bleeding by 2."
{
  const row = rowOf("slashing", 54);
  eq("F1 the row carries both clauses, in order",
    row.armourClauses.map((c) => c.kind), ["armoured", "rigid"]);
  const bleedIn = (armour) =>
    resolveEffectiveConditions(row, armour).find((t) => t.key === "bleeding")?.value ?? null;
  eq("F2 plain armour takes the plain clause, rigid takes the rigid one",
    [bleedIn(BARE), bleedIn(ARMOURED), bleedIn(RIGID)], [3, 2, 1]);
}

// Bludgeoning 50, transcribed: "…Target is Bleeding 2, Dazed 1 & Stunned
// 1. Metal Armoured: Bleeding 1 & Stunned 1."
{
  const row = rowOf("bludgeoning", 50);
  eq("F3 the clause is a metal one", row.armourClauses.map((c) => c.kind), ["metal"]);
  const keys = (armour) => resolveEffectiveConditions(row, armour).map((t) => `${t.key}${t.value ?? ""}`);
  eq("F4 leather does NOT collect the metal result",
    keys(ARMOURED), ["bleeding2", "dazed1", "stunned1"]);
  eq("F5 metal does", keys(METAL), ["bleeding1", "stunned1"]);
}

// Bludgeoning 57-58, transcribed: "Side strike breaks ribs. Target is
// Stunned 2 and Injured 1. Rigid Armoured: Ignore the Stunned."
{
  const row = rowOf("bludgeoning", 57);
  eq("F6 a rigid-only clause keeps its kind", row.armourClauses.map((c) => c.kind), ["rigid"]);
  ok("F7 and the word Rigid is not stranded on the end of the effect",
    !/\bRigid\.?\s*$/.test(row.effect), `effect ends: ${JSON.stringify(row.effect.slice(-30))}`);
  const has = (armour, key) => resolveEffectiveConditions(row, armour).some((t) => t.key === key);
  eq("F8 only rigid armour ignores the Stun",
    [has(ARMOURED, "stunned"), has(RIGID, "stunned")], [true, false]);
}

// Slashing 87-88, transcribed: "Bloody slash across the chest, breaks the
// targets armour straps and leaves a bloody trail. Armoured: Bleeding 3
// and armour falls off. Unarmoured: Bleeding 4."
{
  const row = rowOf("slashing", 87);
  eq("F9 both halves of the row are present",
    row.armourClauses.map((c) => c.kind), ["armoured", "unarmoured"]);
  const bleed = (armour) =>
    resolveEffectiveConditions(row, armour).find((t) => t.key === "bleeding")?.value ?? null;
  eq("F10 armoured takes 3 and UNARMOURED takes 4", [bleed(ARMOURED), bleed(BARE)], [3, 4]);
}

// Most specific first, then the plain clause, then nothing at all.
eq("F11 selection order", [
  selectArmourClause({ armourClauses: [{ kind: "armoured", text: "a" }, { kind: "rigid", text: "b" }] }, RIGID)?.text,
  selectArmourClause({ armourClauses: [{ kind: "armoured", text: "a" }, { kind: "rigid", text: "b" }] }, ARMOURED)?.text,
  selectArmourClause({ armourClauses: [{ kind: "rigid", text: "b" }] }, ARMOURED),
  selectArmourClause({ armourClauses: [{ kind: "armoured", text: "a" }] }, BARE),
  selectArmourClause({ armourClauses: [{ kind: "unarmoured", text: "u" }] }, BARE)?.text,
  selectArmourClause({ armourClauses: [{ kind: "unarmoured", text: "u" }] }, ARMOURED)
], ["b", "a", null, null, "u", null]);

// A bare boolean means "armoured, kind unknown" — the plain clause only.
eq("F12 a boolean qualifies for the plain clause alone", [
  selectArmourClause({ armourClauses: [{ kind: "armoured", text: "a" }, { kind: "rigid", text: "b" }] }, true)?.text,
  selectArmourClause({ armourClauses: [{ kind: "rigid", text: "b" }] }, true)
], ["a", null]);

// Critical Amendment (Chapter 6) rides on the clause actually applying —
// and an Unarmoured clause damages no armour, because there is none.
eq("F13 the amendment follows the clause, except an unarmoured one", [
  criticalAmendmentApplies(rowOf("slashing", 54), ARMOURED),
  criticalAmendmentApplies(rowOf("slashing", 54), BARE),
  criticalAmendmentApplies(rowOf("slashing", 87), BARE),
  criticalAmendmentApplies(rowOf("bludgeoning", 57), ARMOURED)
], [true, false, false, false]);

// RIGID AND METAL ARE TRAITS on the armour item, read only from pieces
// covering the struck location.
{
  const plate = { type: "armour", system: { equipped: true, coversTorso: true, traits: "Rigid, Metal" } };
  const greaves = { type: "armour", system: { equipped: true, coversLegs: true, traits: "" } };
  eq("F14 the kind is read per location", [
    armourAtLocation([plate, greaves], "chest"),
    armourAtLocation([plate, greaves], "legs"),
    armourAtLocation([plate, greaves], "headNeck")
  ], [
    { armoured: true, rigid: true, metal: true },
    { armoured: true, rigid: false, metal: false },
    { armoured: false, rigid: false, metal: false }
  ]);
  eq("F15 unequipped armour covers nothing",
    armourAtLocation([{ ...plate, system: { ...plate.system, equipped: false } }], "chest"),
    { armoured: false, rigid: false, metal: false });
}

/* ================================================================== */
/* G — A CLAUSE THAT REWRITES PERSISTENCE (page 204; D9, R9)           */
/* ================================================================== */

// Bludgeoning 41-43, transcribed: "You break the targets fingers with a
// powerful blow. Target is Injured 1. Metal Armoured: Persistence
// becomes D."
{
  const row = rowOf("bludgeoning", 41);
  eq("G1 the printed column is UH", row.persistence, "UH");
  eq("G2 metal armour rewrites it, nothing else does", [
    effectivePersistence(row, METAL),
    effectivePersistence(row, ARMOURED),
    effectivePersistence(row, BARE)
  ], ["D", "UH", "UH"]);
}

// A row with no amendment keeps its printed column whatever is worn.
eq("G3 an ordinary row is untouched", [
  effectivePersistence(rowOf("slashing", 54), RIGID),
  effectivePersistence(rowOf("bludgeoning", 91), ARMOURED)
], ["-", "Fatal"]);

// ONLY A REAL CODE. "Persistence becomes D" is the one amendment the
// book writes; a parser that accepts any word after those two would turn
// a sentence into a Persistence column.
eq("G7 only a printed Persistence code is accepted", [
  effectivePersistence(
    { persistence: "UH", armourClauses: [{ kind: "armoured", text: "Persistence becomes D." }] }, ARMOURED),
  effectivePersistence(
    { persistence: "UH", armourClauses: [{ kind: "armoured", text: "Persistence becomes soggy." }] }, ARMOURED),
  effectivePersistence(
    { persistence: "M", armourClauses: [{ kind: "armoured", text: "Persistence becomes Fatal." }] }, ARMOURED)
], ["D", "UH", "Fatal"]);

{
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("G4 the workflow uses the effective persistence, not the printed one",
    /const persistence = effectivePersistence\(row, targetArmour\);/.test(aw)
    && /computePersistenceRounds\(persistence, severity\)/.test(aw)
    && /if \(persistence === "D"\)/.test(aw));
  ok("G5 and the Death/Fatal test reads it too",
    /deathOrFatalSave\(\{ \.\.\.row, persistence \}/.test(aw));
  ok("G6 and so does the UH/FR/P record",
    /const persistenceEntry = \{\s*code: persistence,[\s\S]{0,400}recordPersistence\(targetActor, persistenceEntry\)/.test(aw));
}

/* ================================================================== */
/* H — CHAOS ROLLS THE FUMBLE (page 204; D10, R10)                     */
/* ================================================================== */

{
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("H1 Chaos rolls on the fumble table rather than describing it",
    /async function rollChaosFumble\(actor, weapon\) \{[\s\S]{0,400}lookupTableRow\(FUMBLE_TABLES\[category\], roll\.total\)/.test(aw));
  ok("H2 the table is chosen by what was swung",
    /const category = fumbleTableFor\(weapon\?\.system \?\? null\);/.test(aw));
  ok("H3 a 1 is what rebounds", /backfires: roll\.total === 1/.test(aw));
  ok("H4 the main critical path rolls it",
    /chaosFumble = await rollChaosFumble\(actor, weapon\);/.test(aw));
  ok("H5 and the mook path rolls it too",
    /chaosFumble = await rollChaosFumble\(attacker \?\? targetActor, weapon\);/.test(aw));
  ok("H6 a 1 subjects the attacker to their own critical result",
    /if \(chaosFumble\?\.backfires && actor\) \{/.test(aw));
  // Resolved against the ATTACKER's own armour, not the target's — the
  // row's clauses are about who is wearing what.
  ok("H7 against the attacker's own armour at that location",
    // 3.617.4: with the attacker's own Mage Armour or Bracers laid over it.
    /const ownArmour = withWholeBodyArmour\(armourAtLocation\(Array\.from\(actor\.items \?\? \[\]\), hitLocation\), actor\.system\);/.test(aw));
  ok("H8 no card still tells the table to roll it themselves",
    !/roll on the fumble table as well/.test(aw));
}

/* ================================================================== */
/* I — THE MOOK CHAOS CONVICTION (page 204; D11, R11)                  */
/* ================================================================== */

// "regain 1 conviction" — "you" is the one making the roll, which is the
// attacker. The Quick Crit path gave it to the mook being hit.
{
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("I1 the quick crit takes an attacker at all", /^\s*attacker = null,/m.test(aw));
  ok("I2 and the Conviction goes to them",
    /awardConviction\(attacker \?\? targetActor, chaos\.conviction\)/.test(aw));
  ok("I3 the main path still gives it to the attacker",
    /awardConviction\(actor, chaos\.conviction\)/.test(aw));
  ok("I4 and the weapon path passes the attacker in",
    /rollQuickCrit\(targetActor, \{\s*attacker: actor,/.test(aw));
  const alch = code("module", "alchemical-workflow.mjs");
  ok("I5 so does the bomb path", /attacker: actor \}\);/.test(alch));
}

/* ================================================================== */
/* J — QUICK DAMAGE (page 204, optional; D12, R12)                     */
/* ================================================================== */

// The page's own table: 1d2 1, 1d3 2, 1d4 3, 1d6 4, 1d8 5, 1d10 6, 1d12 7.
eq("J1 the printed table", [
  QUICK_DAMAGE_TABLE[2], QUICK_DAMAGE_TABLE[3], QUICK_DAMAGE_TABLE[4],
  QUICK_DAMAGE_TABLE[6], QUICK_DAMAGE_TABLE[8], QUICK_DAMAGE_TABLE[10], QUICK_DAMAGE_TABLE[12]
], [1, 2, 3, 4, 5, 6, 7]);

eq("J2 read through the accessor", [2, 3, 4, 6, 8, 10, 12].map(quickDamageStatic),
  [1, 2, 3, 4, 5, 6, 7]);

// A die the table does not list follows the same shape the printed rows
// do — every one of them is (faces / 2) + 1.
eq("J3 an unlisted die follows the printed rows' own formula",
  [quickDamageStatic(20), quickDamageStatic(100)], [11, 51]);

// EXTRA DICE, NOT ALL DICE: the weapon's own base die is still rolled.
eq("J4 the BAB and critical dice become flat, the base die stays", [
  buildWeaponDamageFormula("1d8", { bab: 12, critical: "serious" }),
  buildWeaponDamageFormula("1d8", { bab: 12, critical: "serious", quickDamage: true }),
  buildWeaponDamageFormula("1d8", { bab: 0, quickDamage: true })
], ["5d8", "1d8+20", "1d8"]);

eq("J5 and a different die size uses its own row", [
  buildWeaponDamageFormula("1d12", { bab: 6, critical: "minor", quickDamage: true }),
  buildWeaponDamageFormula("1d4", { bab: 6, critical: "minor", quickDamage: true })
], ["1d12+14", "1d4+6"]);

{
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("J6 the setting reaches the formula", /quickDamage: setting\("quickDamage", false\)/.test(aw));
  const st = code("module", "settings.mjs");
  ok("J7 and the setting exists", /game\.settings\.register\(SYSTEM_ID, "quickDamage"/.test(st));
  ok("J8 defaulting to off, because it is optional",
    /"quickDamage"[\s\S]{0,400}default: false/.test(st));
}

/* ================================================================== */
/* K — MODES OF LETHALITY (page 204, optional; D13, R13)               */
/* ================================================================== */

// "simply increase the AV required to inflict criticals… you may decrease
// the AV required." The printed bands are 5 / 15 / 25.
eq("K1 the printed bands, unshifted", [
  criticalSeverity(4)?.severity ?? null, criticalSeverity(5)?.severity,
  criticalSeverity(14)?.severity, criticalSeverity(15)?.severity,
  criticalSeverity(24)?.severity, criticalSeverity(25)?.severity
], [null, "minor", "minor", "serious", "serious", "deadly"]);

eq("K2 a positive shift raises every band", [
  criticalSeverity(6, 0, 10, 2)?.severity ?? null,
  criticalSeverity(7, 0, 10, 2)?.severity,
  criticalSeverity(17, 0, 10, 2)?.severity,
  criticalSeverity(27, 0, 10, 2)?.severity
], [null, "minor", "serious", "deadly"]);

eq("K3 a negative shift lowers them", [
  criticalSeverity(2, 0, 10, -2)?.severity ?? null,
  criticalSeverity(3, 0, 10, -2)?.severity,
  criticalSeverity(13, 0, 10, -2)?.severity,
  criticalSeverity(23, 0, 10, -2)?.severity
], [null, "minor", "serious", "deadly"]);

// Critical Resistance still works on top of the shift, and the Deadly
// trait's increment is untouched by it.
eq("K4 CR and the Deadly increment still apply", [
  criticalSeverity(7, 1, 10, 0)?.severity,
  criticalSeverity(6, 1, 10, 0)?.severity,
  criticalSeverity(14, 0, 9, 0)?.severity,
  criticalSeverity(23, 0, 9, 0)?.severity
], ["minor", "minor", "serious", "deadly"]);

// The shift reaches the outcome the attack path actually reads.
eq("K5 attackOutcome carries it", [
  attackOutcome({ unmodified: 12, total: 20, db: 15, criticalThresholdShift: 0 }).critical?.severity ?? null,
  attackOutcome({ unmodified: 12, total: 20, db: 15, criticalThresholdShift: 2 }).critical?.severity ?? null
], ["minor", null]);

{
  const st = code("module", "settings.mjs");
  ok("K6 the setting exists and starts at the printed numbers",
    /game\.settings\.register\(SYSTEM_ID, "criticalThresholdShift"[\s\S]{0,500}default: 0/.test(st));
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("K7 and the attack path reads it",
    /criticalThresholdShift: Number\(setting\("criticalThresholdShift", 0\) \|\| 0\)/.test(aw));
}

/* ================================================================== */
/* L — SPECIFIC LOCATION INJURIES (page 204, optional; D14, R14)       */
/* ================================================================== */

// "speed for legs, attacks and climbing for arms etc" — the two the page
// commits to, and no more.
eq("L1 the page's own two", Object.keys(INJURY_LOCATION_TARGETS).sort(), ["arms", "legs"]);
eq("L2 legs are speed", Array.from(INJURY_LOCATION_TARGETS.legs),
  ["system.combat.movement.land", "system.skills.acrobatics"]);
eq("L3 arms are attacks and climbing", Array.from(INJURY_LOCATION_TARGETS.arms),
  ["system.combat.attack", "system.skills.athletics"]);

{
  const values = new Map([["injured", 2]]);
  const skillAbilities = { athletics: "strength", acrobatics: "dexterity", stealth: "dexterity" };
  const all = conditionModifiers({ values, skillAbilities });
  const legs = conditionModifiers({ values, skillAbilities, injuryLocation: "legs" });
  const head = conditionModifiers({ values, skillAbilities, injuryLocation: "headNeck" });

  ok("L4 without the rule, Injured hits everything",
    all.some((m) => m.target === "system.skills.stealth")
    && all.some((m) => m.target === "system.combat.defence"));
  ok("L5 with legs named, it does not touch Stealth or Defence",
    !legs.some((m) => m.target === "system.skills.stealth")
    && !legs.some((m) => m.target === "system.combat.defence"));
  eq("L6 and it does touch speed",
    legs.filter((m) => m.target === "system.combat.movement.land").map((m) => m.value), [-2]);
  ok("L7 a location the page does not narrow keeps the full penalty",
    head.some((m) => m.target === "system.skills.stealth"));
  ok("L8 the narrowed label says which location",
    legs.every((m) => /\(legs\)/.test(m.label)));
}

{
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("L9 the location is recorded on the Injured effect itself",
    /setFlag\(SYSTEM_ID, "injuryLocation", hitLocation\)/.test(aw));
  ok("L10 and only when the optional rule is on",
    /setting\("specificLocationInjuries", false\)/.test(aw));
  const actor = code("module", "documents", "actor.mjs");
  ok("L11 and read back when the penalties are derived",
    /getFlag\?\.\("trg-prime", "injuryLocation"\)/.test(actor)
    && /injuryLocation\s*\n?\s*\}\);/.test(actor));
}

/* ================================================================== */
/* M — THE ROWS THAT ASK FOR SOMETHING (206-219; D15, R15)             */
/* ================================================================== */

// Bludgeoning 67-68: "if target has no armour use '69' result instead".
eq("M1 the alternate result is read from the row's own words", [
  alternateResultWhenUnarmoured(rowOf("bludgeoning", 67).effect),
  alternateResultWhenUnarmoured(rowOf("bludgeoning", 69).effect)
], [69, null]);

// Acid 31-32: "Target must make a Reflex save to avoid dropping item".
// UPDATED AT 3.581.0: the rider grew an `ap` and an `achieves`, for the
// pages 211-220 audit's D8 — Cold 51's "Fortitude Save (1 AP) to break
// the ice" was printed as a save "to avoid (1 AP) to break the ice" and
// charged nothing. Acid 31's own answer is unchanged.
eq("M2 the target's own save", saveRider(rowOf("acid", 31).effect),
  { save: "reflex", scope: "target", ap: 0, avoids: "dropping item", achieves: "" });

// Acid 67-68: "All adjacent characters must make a Fortitude save or be
// Sickened 1."
eq("M3 the adjacent save", saveRider(rowOf("acid", 67).effect),
  { save: "fortitude", scope: "adjacent", ap: 0, avoids: "Sickened 1", achieves: "" });

// Acid 70: "Armoured: 2 AP to remove helm and avoid Injured."
eq("M4 the price of a way out",
  apEscapeRider(rowOf("acid", 70).armourClauses[0].text),
  { ap: 2, action: "remove helm", avoids: "injured" });

// Slashing 69: "You may make a free attack with your current MAP".
eq("M5 the free attack, at the CURRENT penalty", [
  freeAttackRider(rowOf("slashing", 69).effect),
  freeAttackRider(rowOf("slashing", 70).effect)
], [true, false]);

// Piercing 50 / Slashing 90: the flat checks.
eq("M6 the flat checks, with their own DCs", [
  flatCheckRider(rowOf("piercing", 50).effect),
  flatCheckRider(rowOf("slashing", 90).effect)
], [
  { dc: 5, what: "cast verbal spells", until: "the bleeding stops" },
  { dc: 25, what: "cast verbal spells", until: "" }
]);

// An ordinary row asks for nothing.
// UPDATED AT 3.581.0: five more riders joined the shape for the pages
// 211-220 audit's D4 to D9. A row with no rider still answers "nothing"
// to every one of them, which is what this check is for.
eq("M7 a row with no rider", criticalRowRiders(rowOf("bludgeoning", 11)),
  { alternateResult: null, save: null, flatCheck: null, freeAttack: false, apEscape: null,
    escape: null, apWatch: null, ppDrain: 0, lockout: null, concentration: null });

// READ FROM THE TEXT, so the later tables' own riders are answered by the
// same code — cold 51, cold 70, force 50, force 60, force 87.
{
  const carrying = [];
  for (const [table, rows] of Object.entries(CRITICAL_TABLES)) {
    for (const row of rows) {
      const r = criticalRowRiders(row, (row.armourClauses ?? []).map((c) => c.text).join(" "));
      if (r.alternateResult || r.save || r.flatCheck || r.freeAttack || r.apEscape) {
        carrying.push(`${table} ${row.min}`);
      }
    }
  }
  eq("M8 every row in the book that asks for something is found", carrying, [
    "bludgeoning 67", "piercing 50", "slashing 69", "slashing 90",
    "acid 31", "acid 67", "acid 70",
    "cold 51", "cold 70", "force 50", "force 60", "force 87"
  ]);
}

{
  const aw = code("module", "combat", "attack-workflow.mjs");
  ok("M9 the alternate result is APPLIED, not offered",
    /const alternate = criticalRowRiders\(row\)\.alternateResult;/.test(aw)
    && /if \(alternate !== null && !targetArmoured\) \{/.test(aw)
    && /row = replacement;/.test(aw));
  // Read before persistence, the armour clause and the Death/Fatal test,
  // so all of them follow from the row actually in force.
  const alternateAt = aw.indexOf("const alternate = criticalRowRiders(row).alternateResult");
  const persistenceAt = aw.indexOf("const persistence = effectivePersistence(row, targetArmour)");
  ok("M10 and before everything that reads the row", alternateAt > 0 && alternateAt < persistenceAt);
  ok("M11 the save and the AP escape are buttons",
    /data-action="criticalRowSave"/.test(aw) && /data-action="criticalRowEscape"/.test(aw));
  ok("M12 the save uses the Injury DC the page already gives",
    /dc: Number\(attackBonus \|\| 0\) \+ 10/.test(aw));
  const ci = code("module", "dice", "check-card-interactions.mjs");
  ok("M13 and both buttons are bound",
    /\[data-action="criticalRowSave"\]/.test(ci) && /\[data-action="criticalRowEscape"\]/.test(ci));
  ok("M14 the AP escape charges before it lifts the condition",
    /system\.resources\.ap\.value": current - raw\.ap/.test(ci));
}

/* ================================================================== */
/* N — THE TABLES THEMSELVES (206-210; R16, R17)                       */
/* ================================================================== */

// Every table is 46 rows running 1-100, as the printed pages do.
for (const [name, rows] of Object.entries(CRITICAL_TABLES)) {
  ok(`N1 ${name} has 46 rows from 1 to 100`,
    rows.length === 46 && rows[0].min === 1 && rows[rows.length - 1].max === 100,
    `${rows.length} rows, ${rows[0]?.min}-${rows[rows.length - 1]?.max}`);
}

// THE WORD RIGID IS NOT PART OF ANY INJURY. It was left stranded on the
// end of the effect text by the previous extraction, and printed on every
// card as though the blow itself were rigid.
{
  const stranded = [];
  for (const [name, rows] of Object.entries(CRITICAL_TABLES)) {
    for (const row of rows) {
      if (/\b(Rigid|Metal|Unarmoured)\.?\s*$/.test(row.effect)) stranded.push(`${name} ${row.min}`);
    }
  }
  eq("N2 no armour word is stranded on an effect", stranded, []);
}

// Every clause kind is one of the four the book writes.
{
  const kinds = new Set();
  for (const rows of Object.values(CRITICAL_TABLES)) {
    for (const row of rows) for (const c of row.armourClauses ?? []) kinds.add(c.kind);
  }
  eq("N3 the four clause kinds", Array.from(kinds).sort(),
    ["armoured", "metal", "rigid", "unarmoured"]);
}

// And no clause text still carries a marker that should have been split.
{
  const unsplit = [];
  for (const [name, rows] of Object.entries(CRITICAL_TABLES)) {
    for (const row of rows) {
      for (const c of row.armourClauses ?? []) {
        if (/(Rigid|Metal)\s+Armoured?\s*:|Unarmoured\s*:/i.test(c.text)) unsplit.push(`${name} ${row.min}`);
      }
    }
  }
  eq("N4 no clause still contains another clause", unsplit, []);
}

// SUBDUAL IS DELIBERATELY LESS DANGEROUS (Graham's R16, 21 September
// 2026: "Yes, subdual should not be as dangerous as other critical
// types"). Its last five rows are Fatal where every other table's last
// two are Death.
{
  const tail = (name) => CRITICAL_TABLES[name].slice(-5).map((r) => r.persistence);
  eq("N5 subdual's tail is Fatal throughout", tail("subdual"),
    ["Fatal", "Fatal", "Fatal", "Fatal", "Fatal"]);
  for (const name of ["bludgeoning", "piercing", "slashing", "acid"]) {
    eq(`N6 ${name} ends in Death`, tail(name).slice(-2), ["Death", "Death"]);
  }
}

// R17: the Bludgeoning table's "d20 roll" header is errata — the rows
// are d100 and the data has always been. Recorded here so the reading
// is pinned rather than remembered.
ok("N7 bludgeoning is a d100 table whatever its header says",
  CRITICAL_TABLES.bludgeoning.some((r) => r.min > 20));

{
  const data = read("module", "data", "critical-tables.mjs");
  ok("N8 the data file records the header errata and the ruling",
    /d20 roll/.test(data) && /R17/.test(data));
}

/* ================================================================== */

if (failures) {
  console.error(`\nverify-chapter7-critical-201-210: FAILED — ${failures} of ${checks} checks.\n`);
  process.exit(1);
}
console.log(
  `verify-chapter7-critical-201-210: OK — ${checks} checks. `
  + "Pages 201-210: aerial, underwater, drowning, criticals.");
