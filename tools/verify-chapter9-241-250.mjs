#!/usr/bin/env node
/**
 * verify-chapter9-241-250 — Chapter 9's tail and the Grimoire's opening.
 *
 * NEW at 3.585.0. Graham's R1-R18 of 22 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WRITTEN AFTER THE LIVE DRIVE, and the drive earned its place again.
 *
 * R13 (Abjurers Strike) was implemented TWICE against beliefs about
 * where armour lives, and both would have shipped doing nothing:
 *
 *   draft 1  `ignoresArmour` / `ignoresMagicalDB` on a `strikeRider`
 *            row — a kind whose normaliser requires dice, so the row
 *            would have returned null.
 *   draft 2  both halves as the `item` slot of `system.combat.defence`
 *            — and a live character in Full Leather has `defence.item`
 *            of ZERO. Armour in this system is damage reduction and
 *            touches Defence Bonus nowhere.
 *
 * No source pattern could have caught either. Section N holds what the
 * live world taught, so the belief cannot come back.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  controlBonusPerLevelFor, controlLevelCap, magicRitualOvercastLimit,
  magicRitualSecondaryModifier, capRitualDegree, sacrificeSoulDrain,
  overcastDCIncrease, ritualDCModifierTotal, spellFumbleModifierTotal,
  resonanceModifierTotal, innateAttackBonus, innateSaveDC,
  specialistMaxPP, specialistSaveDC
} from "../module/magic/casting.mjs";
import {
  duesLine, heldLabel, roundsHeld, sustainDues
} from "../module/magic/sustain-clock.mjs";
import {
  CONTROL_RELEASE_DC, addControlled, controlOverflow, controlledLevels,
  entryLevel, overflowLine, releasesItself, removeControlled
} from "../module/magic/control-register.mjs";
import {
  DEGREE_ORDER, normaliseSaveLadder, saveLadderLine, saveLadderOutcome
} from "../module/magic/save-ladder.mjs";
import {
  DEFENCE_PIERCE_FLAG, defencePierceFor, defencePierceLine, normaliseDefencePierce
} from "../module/magic/defence-pierce.mjs";
import { spellBreaches } from "../module/magic/spell-template.mjs";
import { criticalBonusDamage } from "../module/magic/spell-damage.mjs";
import { buildMetamagicOptions, aggregateMetamagicSelection } from "../module/magic/metamagic.mjs";
import {
  SPELL_FUMBLE_TABLE, SPELL_FUMBLE_MODIFIERS, SPELL_FUMBLE_SPECIALS,
  RESONANCE_EVENT_TABLE, RESONANCE_MODIFIERS, RESONANCE_SPECIALS
} from "../module/data/spell-tables.mjs";
import { SUSTAIN_AP_COST, SUSTAIN_TRAITS, sustainRefusal } from "../module/magic/sustain.mjs";
import { DISMISS_AP_COST, DISMISS_TRAITS } from "../module/magic/dismiss.mjs";
import { alignedControlEligibility } from "../module/aligned.mjs";

let checks = 0;
let failures = 0;
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

function ok(label, condition, detail = "") {
  checks += 1;
  if (condition) return;
  failures += 1;
  process.stdout.write(`  FAIL ${label}${detail ? ` — ${detail}` : ""}\n`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== */
/* A — SUSTAIN A SPELL, PAGE 241                                       */
/* ================================================================== */

eq("A1 the printed cost is 1 AP", SUSTAIN_AP_COST, "1");
eq("A2 and the printed trait", SUSTAIN_TRAITS, "Concentrate");

ok("A3 a fatigued caster is refused, and told why",
  /Fatigued/.test(sustainRefusal({ entries: [{ sustained: true }], fatigued: 1, name: "X" }) ?? ""));
ok("A4 fatigue is named BEFORE the missing spell",
  /Fatigued/.test(sustainRefusal({ entries: [], fatigued: 2, name: "X" }) ?? ""),
  "a fatigued caster with nothing running should hear about the fatigue");
eq("A5 and an eligible caster is refused nothing",
  sustainRefusal({ entries: [{ sustained: true }], fatigued: 0, name: "X" }), null);

/* ================================================================== */
/* B — THE SUSTAIN CLOCK (R1)                                          */
/* ================================================================== */

eq("B1 nine rounds owes nothing", sustainDues({ rounds: 9 }),
  { exhaustionCheck: false, ppCharges: 0, minutesHeld: 0 });
eq("B2 one minute calls the exhaustion check", sustainDues({ rounds: 10 }),
  { exhaustionCheck: true, ppCharges: 0, minutesHeld: 1 });
ok("B3 and it is called ONCE, not every round after",
  sustainDues({ rounds: 40, exhausted: true }).exhaustionCheck === false);

// "longer than 10 minutes (100 rounds) ... for every additional 10
// minutes (or part thereof)" — so 100 owes nothing and 101 owes one.
eq("B4 ten minutes exactly still owes no PP",
  sustainDues({ rounds: 100, exhausted: true }).ppCharges, 0);
eq("B5 and one round past it owes one period",
  sustainDues({ rounds: 101, exhausted: true }).ppCharges, 1);
eq("B6 twenty minutes and one round owes two",
  sustainDues({ rounds: 201, exhausted: true, charged: 0 }).ppCharges, 2);
eq("B7 minus whatever has already been collected",
  sustainDues({ rounds: 201, exhausted: true, charged: 1 }).ppCharges, 1);

/*
 * THE `Number(null)` TRAP — AND WHY IT IS NOT THE TRAP HERE.
 *
 * The block-22 water clock, the block-23 affliction deadline and R9's
 * hit-point watch were all defects because `Number(null)` is 0 and 0
 * MEANT SOMETHING THERE — the epoch, a due date, a hit point total. For
 * a sustain tally 0 means "none", which is the right answer for an
 * absent field, so the null case cannot distinguish a guarded reader
 * from an unguarded one. The mutation harness proved exactly that: a
 * mutation replacing the guard with a bare `Number.isFinite` SURVIVED.
 *
 * What the guard does earn is junk: without it `Math.floor(Number("abc"))`
 * is NaN, and a NaN round-count propagates silently into every
 * comparison below. So that is what these check.
 */
eq("B8 an absent tally reads as none", roundsHeld({}), 0);
eq("B9 and so does a cleared one", roundsHeld({ sustainedRounds: null }), 0);
eq("B10 JUNK IS NOT NaN — a NaN round-count poisons every comparison",
  roundsHeld({ sustainedRounds: "abc" }), 0);
eq("B10b nor in the dues",
  sustainDues({ rounds: "abc", charged: "abc" }),
  { exhaustionCheck: false, ppCharges: 0, minutesHeld: 0 });

ok("B11 the clock says how long in words", heldLabel(23) === "2 minutes, 3 rounds");
eq("B12 and stays in rounds below a minute", heldLabel(9), "9 rounds");
ok("B13 a sustain owing nothing prints nothing",
  duesLine(sustainDues({ rounds: 3 }), 8) === "");
ok("B14 and one owing PP names the total, not the period",
  /16 PP/.test(duesLine(sustainDues({ rounds: 201, exhausted: true }), 8)),
  "two periods at 8 PP is 16");

// THE TALLY AND THE TIMESTAMP ARE DIFFERENT FIELDS, and the whole rule
// depends on it: `sustainRound` answers "have they stopped?" and cannot
// answer "how long has this been going?".
ok("B15 the registry keeps a tally as well as a timestamp",
  /sustainedRounds/.test(code("module", "magic", "active-spells.mjs"))
  && /sustainRound/.test(code("module", "magic", "active-spells.mjs")));
ok("B16 and the sustain increments it",
  /entry\.sustainedRounds\s*=\s*roundsHeld\(entry\)\s*\+\s*1/.test(code("module", "magic", "active-spells.mjs")));
ok("B17 the workflow collects the dues rather than describing them",
  /rollExhaustionCheck/.test(code("module", "magic", "sustain-workflow.mjs")),
  "page 241 says an exhaustion check, not a note about one");
ok("B18 and charges the PP through the actor's real pool",
  /system\.resources\.pp\.value/.test(code("module", "magic", "sustain-workflow.mjs")),
  "measured live: PP is system.resources.pp.value");

/* ================================================================== */
/* C — AN INTERRUPTED SUSTAIN (R2)                                     */
/* ================================================================== */

{
  const src = code("module", "magic", "sustain-workflow.mjs");
  ok("C1 damage against a sustaining caster is watched",
    /Hooks\.on\("preUpdateActor",/.test(src),
    "a bare /preUpdateActor/ is satisfied by `preUpdateActorZZ` — the mutation proved it");
  ok("C2 on the hit-point path that was MEASURED, not the vestigial one",
    /system\??\.resources\??\.hp\??\.value/.test(src) && !/system\??\.hp\??\.value/.test(src),
    "`system.hp` is a {value:null} nothing writes — R9's first draft died on it");
  ok("C3 the guard is imported rather than written a second time",
    /import \{ hitPointsLost \}/.test(read("module", "magic", "sustain-workflow.mjs")),
    "the ratchet caught exactly this duplication in R9");
  ok("C4 and the spell ends when concentration is not held",
    /await endActiveSpell\(actor, entry\.id, \{ dismissed: false \}\);/.test(src)
    && /rollSpellConcentration\(actor, \{ dc:/.test(src),
    "the import line alone satisfied a bare name test");
  ok("C5 the DC travels with the spell so the check knows its number",
    /castingDC: Number\(castingDC\) \|\| 0,/.test(code("module", "magic", "active-spells.mjs")),
    "the function's own parameter satisfied a bare name test");
}

/* ================================================================== */
/* D — DISMISS, PAGE 241                                               */
/* ================================================================== */

eq("D1 Dismiss is 1 AP", DISMISS_AP_COST, "1");
eq("D2 Concentrate", DISMISS_TRAITS, "Concentrate");

/* ================================================================== */
/* E — INNATE AND SPECIALIST, PAGE 242                                 */
/* ================================================================== */

// The page's own worked examples: Saros, level 6, Intelligence 3.
eq("E1 Saros's innate attack bonus is +9", innateAttackBonus(3, 6), 9);
eq("E2 and his innate save DC is 19", innateSaveDC(3, 6), 19);
// Nyphari, 6th level bard, caster level 3.
eq("E3 Nyphari may spend 6 PP on a specialist spell, not 4", specialistMaxPP(6), 6);
eq("E4 a specialist save DC takes the higher of the two", specialistSaveDC(3, 6, 12), 22);
eq("E5 and the ability route when it wins", specialistSaveDC(3, 6, 7), 19);

/* ================================================================== */
/* F — CONTROL LEVELS, PAGE 242 (R3)                                   */
/* ================================================================== */

// Both of the page's worked examples.
eq("F1 Avrok — Cleric 7, ability 4 — has 18 control levels",
  controlLevelCap(7, 4, controlBonusPerLevelFor("Cleric", [])), 18);
eq("F2 Jamie — Crusader 14, ability 5 — has 19",
  controlLevelCap(14, 5, controlBonusPerLevelFor("Crusader", [])), 19);

eq("F3 Cleric, Druid and Wizard each gain +1 per level",
  ["Cleric", "Druid", "Wizard"].map((c) => controlBonusPerLevelFor(c, [])), [1, 1, 1]);
eq("F4 a Wizard Enchanter gains +2", controlBonusPerLevelFor("Wizard", ["Enchantment"]), 2);
// "Conjurer" is not one of this system's eight school names; every one of
// the nine Conjure spells carries Translocation.
eq("F5 and a Conjurer — which is Translocation here — also +2",
  controlBonusPerLevelFor("Wizard", ["Translocation"]), 2);
eq("F6 another school leaves the Wizard at +1",
  controlBonusPerLevelFor("Wizard", ["Invocation"]), 1);
eq("F7 only the WIZARD doubles — the page grants it to Wizard specialists",
  controlBonusPerLevelFor("Cleric", ["Enchantment"]), 1);
eq("F8 and a class the page does not name gains nothing",
  controlBonusPerLevelFor("Fighter", ["Enchantment"]), 0);
eq("F9 an unnamed class is not an error", controlBonusPerLevelFor("", []), 0);
eq("F10 nor is a null one", controlBonusPerLevelFor(null, null), 0);

// THE DEFECT THIS SECTION EXISTS FOR: the field was real and NOTHING
// wrote it, so the derivation asked a question nobody had answered.
ok("F11 the derivation reads the class rather than an unwritten field",
  /controlBonusPerLevelFor\(/.test(code("module", "documents", "actor.mjs")),
  "controlBonusPerLevel was a template field no pack entry ever set");

/* ================================================================== */
/* G — GOING OVER THE CAP (R4)                                         */
/* ================================================================== */

eq("G1 the release save is DC 20", CONTROL_RELEASE_DC, 20);

{
  const e = (id, level, name, handle = null) => ({ id, level, name, handle });
  eq("G2 levels held are summed", controlledLevels([e("a", 5, "A"), e("b", 8, "B")]), 13);
  eq("G3 an absent creature level reads as none", entryLevel({ level: null }), 0);
  eq("G3b and junk does not become NaN", entryLevel({ level: "abc" }), 0);
  eq("G4 under the cap nothing pulls", controlOverflow([e("a", 5, "A")], 18).over, 0);

  const over = controlOverflow([e("a", 5, "A"), e("b", 8, "B"), e("c", 9, "C")], 18);
  eq("G5 over the cap the excess is known", over.over, 4);
  eq("G6 and the HIGHEST-level creature is the one that pulls", over.highest.name, "C");
  eq("G7 a tie goes to the one held longest",
    controlOverflow([e("a", 9, "First"), e("b", 9, "Second")], 9).highest.name, "First");

  eq("G8 a critical save frees the creature", releasesItself("critical"), true);
  eq("G9 so does a heroic — not just a bare success",
    releasesItself("heroic"), true,
    "a `=== success` test would hold a creature that rolled better than success");
  eq("G10 a failure holds it", releasesItself("failure"), false);
  eq("G11 and so does a blunder", releasesItself("blunder"), false);

  const h = { tokenId: "t1" };
  eq("G12 re-taking a creature already held does not count it twice",
    controlledLevels(addControlled([e("a", 5, "A", h)], e("b", 5, "A", h))), 5);
  eq("G13 but two level-only entries are two creatures",
    controlledLevels(addControlled([e("a", 5, "A")], e("b", 5, "A"))), 10);
  eq("G14 releasing one drops its levels",
    controlledLevels(removeControlled([e("a", 5, "A"), e("b", 8, "B")], "a")), 8);
  ok("G15 the overflow line names the creature and the DC",
    /C/.test(overflowLine(over)) && /20/.test(overflowLine(over)));
  eq("G16 and says nothing when under the cap",
    overflowLine(controlOverflow([e("a", 1, "A")], 18)), "");
}

// THE CAP IS PRESSURE, NOT A REFUSAL. The page permits exceeding it.
{
  const base = { controllerLevel: 14, targetLevel: 6, shared: ["Evil"], controlLevelCap: 18 };
  const over = alignedControlEligibility({ ...base, controlledAlready: 15 });
  ok("G17 an attempt that would breach the cap is ALLOWED", over.able === true,
    "page 242 does not forbid going over — it makes what you hold fight you");
  ok("G18 and reported rather than silently permitted", over.overCap === true);
  eq("G19 with the excess named", over.overBy, 3);
  eq("G20 no control-level problem is raised", over.problems.filter((p) => /Control Level/.test(p)), []);
  const under = alignedControlEligibility({ ...base, controlledAlready: 5 });
  ok("G21 an attempt within the cap says so", under.overCap === false);
}

ok("G22 the tally is real rather than the zero it used to pass",
  /controlledLevelsOf\(actor\)/.test(code("module", "aligned-control-workflow.mjs")),
  "it passed `controlledAlready: 0` with a comment explaining that no register existed");
ok("G23 and the pull is run on the controller's turn",
  /await sweepControlOverflow\(actor\);/.test(code("module", "documents", "combat.mjs")),
  "the `await import` line satisfied a bare name test");

/* ================================================================== */
/* H — OVERCASTING, PAGE 243                                           */
/* ================================================================== */

eq("H1 the DC rises by 2 per PP over the limit", overcastDCIncrease(4, 0), 6);
eq("H2 Soul Drain on a Heroic is a flat 2d6", sacrificeSoulDrain("heroic", 3).formula, "2d6");
eq("H3 a Critical scales per PP over", sacrificeSoulDrain("critical", 3).formula, "1d10 + 3");
eq("H4 a Success doubles it", sacrificeSoulDrain("success", 3).formula, "2d10 + 6");
eq("H5 a Failure adds a Serious Essence critical",
  sacrificeSoulDrain("failure", 3), { formula: "4d10 + 12", critical: "serious" });
eq("H6 and a Fumble a Deadly one",
  sacrificeSoulDrain("fumble", 3), { formula: "5d10 + 15", critical: "deadly" });
eq("H7 a Blunder reads as the Fumble — the worst the page prints",
  sacrificeSoulDrain("blunder", 3), sacrificeSoulDrain("fumble", 3));

/* ================================================================== */
/* I — THE MAGIC RITUAL (R5, R6, R7)                                   */
/* ================================================================== */

eq("I1 each secondary caster buys 2 PP of headroom", magicRitualOvercastLimit(3), 6);
eq("I2 the secondary ladder is the printed one",
  ["critical", "success", "failure", "fumble"].map(magicRitualSecondaryModifier), [4, 2, -4, -10]);
eq("I3 the page's own example — four secondaries summing to +4",
  ["critical", "success", "success", "failure"]
    .reduce((s, k) => s + magicRitualSecondaryModifier(k), 0), 4);

eq("I4 a Heroic primary is capped at Success", capRitualDegree("heroic"), "success");
eq("I5 and so is a Critical", capRitualDegree("critical"), "success");
eq("I6 a Failure is not lifted", capRitualDegree("failure"), "failure");

// The Ritual Mods table, row by row.
eq("I7 +2 per PP above the primary's maximum",
  ritualDCModifierTotal({ ppOverPrimaryMax: 3 }), 6);
eq("I8 +2 per different-tradition secondary",
  ritualDCModifierTotal({ differentTraditionSecondaryCasters: 2 }), 4);
eq("I9 -2 for a casting time multiplied by 100",
  ritualDCModifierTotal({ castingTimeX100: true }), -2);
eq("I10 -10 for an unaltered duration",
  ritualDCModifierTotal({ durationUnaltered: true }), -10);

// R5 — THE LADDER HAD NO CALLER. The dialog printed the four numbers in
// a hint and asked the GM to type their total.
{
  const src = code("module", "magic", "cast-workflow.mjs");
  ok("I11 each row's own modifier comes from the ladder",
    /const mod = magicRitualSecondaryModifier\(key\);/.test(src),
    "the rule existed with no caller anywhere in the system");
  ok("I11b and the sum does too — two call sites, two checks",
    /\(sum, key\) => sum \+ magicRitualSecondaryModifier\(key\), 0\);/.test(src),
    "one check over both sites passed while either alone was gutted");
  ok("I12 and no longer asks for a hand-summed total",
    !/summed by hand, summed by hand/.test(src) && !/name="secondaryModifier"/.test(src));
  // R6 — a successful ritual casts the spell.
  ok("I13 a resolved ritual reaches the cast pipeline",
    /ritual: \{ degree, ppOver, secondaryCount, check \}/.test(src),
    "it used to post `The spell is cast at N PP` and stop");
  ok("I14 the cast takes the ritual's degree rather than re-rolling",
    /if \(ritual\) degree = String\(ritual\.degree \?\? degree\)/.test(src));
  ok("I15 and the ritual's headroom raises the cap",
    /const ritualHeadroom = Math\.max\(0, Math\.floor\(Number\(ritual\?\.ppOver\) \|\| 0\)\);/.test(src)
    && /\+ ritualHeadroom;/.test(src),
    "`ritualHeadroom = 0` left the name in place");
  // R7 — the +20 row nothing could reach.
  ok("I16 a ritual fumble reaches the Spell Fumble Table",
    /ritual: Boolean\(ritual\)/.test(src),
    "`ritual: true` was never passed by any caller");
}
eq("I17 and the table's Spell Ritual row is +20", SPELL_FUMBLE_MODIFIERS["Spell Ritual"], 20);
eq("I18 which the total honours",
  spellFumbleModifierTotal(0, { ritual: true }), 20);

/* ================================================================== */
/* J — THE FOUR TABLES, PAGES 244-245                                  */
/* ================================================================== */

eq("J1 the Spell Fumble Table has its fourteen ranged rows",
  SPELL_FUMBLE_TABLE.length, 14);
eq("J2 plus the two unmodified faces held apart",
  SPELL_FUMBLE_SPECIALS.map((s) => s.face), [66, 100]);
eq("J3 the first row starts at 1", SPELL_FUMBLE_TABLE[0].min, 1);
eq("J4 and the last is open-ended", SPELL_FUMBLE_TABLE.at(-1).min, 351);
ok("J5 the rows do not overlap or gap below 100",
  SPELL_FUMBLE_TABLE.slice(0, 6).every((r, i, all) =>
    i === 0 || r.min === all[i - 1].max + 1 || r.min === all[i - 1].max + 2),
  "66 and 100 are lifted out, so a single-step gap is expected there");

eq("J6 the Resonance Event Table has nineteen ranged rows",
  RESONANCE_EVENT_TABLE.length, 19);
eq("J7 and its own two faces", RESONANCE_SPECIALS.map((s) => s.face), [66, 100]);
ok("J8 Absolute Chaos rolls twice", /Roll twice/i.test(RESONANCE_SPECIALS[0].effect));

// Every printed modifier, both tables.
eq("J9 Arcane +10", SPELL_FUMBLE_MODIFIERS.Arcane, 10);
eq("J10 Ethereal -10", SPELL_FUMBLE_MODIFIERS.Ethereal, -10);
eq("J11 Invocation & Soul +20", SPELL_FUMBLE_MODIFIERS["Invocation & Soul"], 20);
eq("J12 +5 per PP", SPELL_FUMBLE_MODIFIERS["Per PP of the Spell"], 5);
eq("J13 a blunder is +20", SPELL_FUMBLE_MODIFIERS["Spell result is a blunder"], 20);
eq("J14 a cantrip resonates -20", RESONANCE_MODIFIERS.Cantrip, -20);
eq("J15 an attack spell +20", RESONANCE_MODIFIERS["Attack Spell"], 20);
eq("J16 Ethereal magic -20", RESONANCE_MODIFIERS["Ethereal Magic"], -20);
eq("J17 and the resonance total adds them",
  resonanceModifierTotal({ spellTrait: "attack", pp: 2 }), 30);

/* ================================================================== */
/* K — RESONANCE'S SECOND TRIGGER (R8)                                 */
/* ================================================================== */

{
  const src = code("module", "combat", "attack-workflow.mjs");
  ok("K1 a spell's critical injury can invoke a Resonance Event",
    /spellResonance/.test(src),
    "page 245 prints two triggers and only the fumble's existed");
  ok("K2 on the unmodified 66, like every other 66 rule here",
    /percentile\.value === CRITICAL_CHAOS_FACE && spellResonance/.test(src));
  {
    // THE CLAIM IS ABOUT ONE `if`, so the check reads that `if` rather
    // than the neighbourhood around it. The first draft used a
    // proximity lookahead and failed on the chaos branch five lines
    // below — a check that was measuring distance, not the condition.
    const branch = src.split("\n").find((l) => /CRITICAL_CHAOS_FACE && spellResonance/.test(l)) ?? "";
    ok("K3 and INDEPENDENTLY of the optional chaos setting",
      branch !== "" && !/chaosResults/.test(branch),
      "resonance is a Chapter 9 rule; chaos is an optional combat one");
  }
  const cast = code("module", "magic", "cast-workflow.mjs");
  ok("K4 the attack path hands the modifiers over",
    /spellResonance: resonanceContext/.test(cast));
  eq("K5 and so does the save path — an injury is an injury either way",
    // FOUR SINCE 3.608.0: Sonic Rupture's condition damage is a fourth site
    // that rolls a spell critical (a fumbled save against a Bleeding-dealing
    // screech), and it carries the modifiers like the other three.
    (cast.match(/spellResonance: resonanceContext/g) ?? []).length, 4);
  ok("K5b the printed ladder's injuries carry them too",
    /modifier: outcome\.modifier,\n\s*spellResonance: resonanceContext/.test(read("module", "magic", "cast-workflow.mjs")),
    "three sites roll a spell critical: attack, basic save, and a printed ladder");
}

/* ================================================================== */
/* L — (B) BREACH (R9)                                                 */
/* ================================================================== */

// A NAME BELIEVED INSTEAD OF MEASURED, for the eleventh time: the rule
// tested the TRAITS line, and no spell in the pack has ever carried a
// Breach trait. Page 247 puts the mark on the range or area.
eq("L1 a (B) on the area breaches", spellBreaches({ area: "20-foot-radius (B)" }), true);
eq("L2 a (B) on the range breaches", spellBreaches({ range: "30 feet (B)" }), true);
eq("L3 and on the targets", spellBreaches({ targets: "1 30' radius location (B)" }), true);
eq("L4 spacing inside the mark is tolerated", spellBreaches({ area: "burst ( B )" }), true);
eq("L5 an ordinary spell does not breach",
  spellBreaches({ range: "30 feet", area: "20-foot radius", traits: "Acid, Invocation" }), false);
eq("L6 a homebrew Breach trait is still honoured",
  spellBreaches({ traits: "Breach, Warding" }), true);
eq("L7 a null spell is not a breaching one", spellBreaches(null), false);
ok("L8 and the cast reads the notation rather than the trait",
  /spellBreaches\(spellData\)/.test(code("module", "magic", "cast-workflow.mjs")));

/* ================================================================== */
/* M — RECURRING DAMAGE (R10, R11)                                     */
/* ================================================================== */

{
  const src = code("module", "magic", "cast-workflow.mjs");
  // NARROWED TO THE ATTACK PATH (3.609.0). The save path now lays a ladder
  // rung's rider too (block 33's R2, Incandescence), through the same two
  // calls — so "the call appears somewhere" stopped proving this one ran.
  ok("M1 a spell's recurring rider is APPLIED, not announced",
    /await targetActor\.toggleStatusEffect\("recurring"/.test(src),
    "it printed `applies on the target's turns` and did nothing");
  ok("M2 through the one rule the bombs already use",
    /const next = recurringAfterHit\(existing, amount, damageType\);/.test(src),
    "two spellings of a stacking rule is how they come to disagree");
  ok("M3 a critical-only rider waits for its critical",
    /persistentOn/.test(src));
  ok("M4 and an immune target takes none of it",
    /No recurring \$\{damageType\} damage/.test(read("module", "magic", "cast-workflow.mjs")));
}

/* ================================================================== */
/* N — WHAT THE LIVE DRIVE TAUGHT (R13)                                */
/* ================================================================== */

/*
 * ARMOUR IS DAMAGE REDUCTION IN THIS SYSTEM AND TOUCHES DEFENCE BONUS
 * NOWHERE. Measured 22 September 2026 against Graham's world: thirteen
 * actors wearing armour, 23 points of armour DR between them, and
 * `defence.item` of ZERO on every actor in the world.
 */
eq("N1 Abjurers Strike's row normalises",
  normaliseDefencePierce({ kind: "defencePierce", label: "Abjurers Strike", unarmoured: true, slots: ["item"] }) !== null,
  true);
{
  const spec = normaliseDefencePierce({
    kind: "defencePierce", label: "Abjurers Strike", unarmoured: true, slots: ["item"], weaponIds: ["w1"]
  });
  const plain = { base: 10, ability: 2, class: 3, item: 0 };
  const magical = { ...plain, item: 3 };

  ok("N2 the unarmoured half does not depend on Defence Bonus at all",
    defencePierceFor([spec], "w1", plain).unarmoured === true,
    "every actor measured had defence.item 0 — a DB-only reading did nothing");
  eq("N3 and subtracts nothing from a target with no magical DB",
    defencePierceFor([spec], "w1", plain).amount, 0);
  eq("N4 while a magical +3 to DB IS ignored",
    defencePierceFor([spec], "w1", magical).amount, 3);
  eq("N5 a different weapon is untouched",
    defencePierceFor([spec], "w2", magical), { amount: 0, slots: [], labels: [], unarmoured: false });
  eq("N6 a negative component is not turned into a gift",
    defencePierceFor([spec], "w1", { ...plain, item: -2 }).amount, 0);
  ok("N7 the card says what was ignored",
    /unarmoured/.test(defencePierceLine(defencePierceFor([spec], "w1", plain), "Darric")));
}
eq("N8 a row that pierces nothing is refused outright",
  normaliseDefencePierce({ kind: "defencePierce", slots: [] }), null);
eq("N9 and the base 10 may never be pierced",
  normaliseDefencePierce({ kind: "defencePierce", slots: ["base"] }), null);
eq("N10 an empty weapon list means every weapon",
  defencePierceFor([{ kind: "defencePierce", label: "X", unarmoured: true }], "anything", {}).unarmoured, true);

ok("N11 the armour half rides Penetrating's rails rather than a second subtraction",
  /\|\| Boolean\(damagePierce\.unarmoured\)/.test(code("module", "combat", "attack-workflow.mjs")),
  "Penetrating's own words are `treats all armour as none`");
ok("N12 and it is derived where the damage is, not threaded through three call sites",
  /const damagePierce = defencePierceFor/.test(code("module", "combat", "attack-workflow.mjs")));
eq("N13 the flag has one name", DEFENCE_PIERCE_FLAG, "defencePierce");

/* ================================================================== */
/* O — A SPELL'S OWN FOUR OUTCOMES (R12)                               */
/* ================================================================== */

{
  const acidCloud = normaliseSaveLadder({
    kind: "saveLadder", damageType: "acid",
    ladder: { critical: "", success: "1d6", failure: "2d6", fumble: "3d6" },
    criticalOn: { failure: "minor", fumble: "minor" },
    criticalModifier: { failure: -20 }
  });
  ok("O1 Acid Cloud's printed ladder normalises", acidCloud !== null);
  eq("O2 a critical save is unaffected", saveLadderOutcome(acidCloud, "critical").harmless, true);
  eq("O3 a success takes the success rung", saveLadderOutcome(acidCloud, "success").dice, "1d6");
  eq("O4 a failure takes 2d6", saveLadderOutcome(acidCloud, "failure").dice, "2d6");
  eq("O5 and a -20 critical injury, as a MODIFIER not a weaker severity",
    saveLadderOutcome(acidCloud, "failure").modifier, -20);
  eq("O6 a fumble takes 3d6 and an unmodified injury",
    [saveLadderOutcome(acidCloud, "fumble").dice, saveLadderOutcome(acidCloud, "fumble").modifier],
    ["3d6", 0]);

  // THE UNPRINTED DEGREES, by the convention Graham confirmed on 2 Sep.
  eq("O7 a heroic save reads as the critical the spell prints",
    saveLadderOutcome(acidCloud, "heroic").rung, "critical");
  eq("O8 a partial reads as the nearest rung no better than it",
    saveLadderOutcome(acidCloud, "partial").rung, "failure");

  /*
   * O9 IS THE BUG THE FIRST DRAFT HAD, found by driving every degree
   * before this was wired to anything. The walk ran off the end of the
   * ordering for a Blunder, returned null, and `saveLadderOutcome` read
   * null as HARMLESS — the single worst save a target can roll left
   * them completely unaffected.
   */
  eq("O9 A BLUNDER IS NOT A REPRIEVE", saveLadderOutcome(acidCloud, "blunder").harmless, false);
  eq("O10 it takes the worst rung the spell prints",
    saveLadderOutcome(acidCloud, "blunder").dice, "3d6");

  // The ladder must never reward a worse roll.
  const dice = DEGREE_ORDER.map((d) => {
    const o = saveLadderOutcome(acidCloud, d);
    return o.harmless ? 0 : Number(String(o.dice).match(/^(\d+)/)?.[1] ?? 0);
  });
  ok("O11 and no degree is ever better off than a better one",
    dice.every((v, i) => i === 0 || v >= dice[i - 1]),
    `monotonic check failed: ${dice.join(",")}`);

  ok("O12 the card names the rung a degree was read as",
    /read as failure/.test(saveLadderLine("X", "Partial", saveLadderOutcome(acidCloud, "partial"), 7, "acid")));
}

eq("O13 a malformed ladder is refused rather than quietly harmless",
  normaliseSaveLadder({ kind: "saveLadder", ladder: { success: "not dice" } }), null);
eq("O14 and a row of another kind is not a ladder",
  normaliseSaveLadder({ kind: "note", ladder: { success: "1d6" } }), null);
ok("O15 the save path resolves a printed ladder before its own arithmetic",
  /if \(saveLadder\) \{/.test(code("module", "magic", "cast-workflow.mjs")),
  "a spell that prints its outcomes beats none/half/full");

/* ================================================================== */
/* P — BASE DAMAGE AS A GATE (R18)                                     */
/* ================================================================== */

/*
 * Page 247: "Each damage inflicting spell will have a Base Damage Value
 * which is used to determine additional damage when warping the spell
 * and inflicting criticals. Be aware that if a spell does not have a
 * base damage entry, it's damage is not increased by factors which
 * increase base damage."
 *
 * MEASURED: 99 spells carry both fields, all 99 share a die FACE, and
 * 81 OF THE 99 DIFFER IN DIE COUNT — so Empower adding `damage.formula`
 * was adding the whole damage where the page says to add the base.
 */
{
  const feats = ["empower spell", "intensified spell"];
  const acidArrow = { baseDamage: "1d8", damage: { formula: "3d8" } };
  const noBase = { baseDamage: "", damage: { formula: "1d6" } };

  const withBase = buildMetamagicOptions({ featNames: feats, spellData: acidArrow, basePP: 8, casterLevel: 6 });
  eq("P1 a spell with a base damage entry offers both options",
    withBase.map((o) => o.id).sort(), ["empower", "intensify"]);
  const without = buildMetamagicOptions({ featNames: feats, spellData: noBase, basePP: 8, casterLevel: 6 });
  eq("P2 a spell WITHOUT one offers neither", without.map((o) => o.id), []);

  const agg = aggregateMetamagicSelection(withBase, { "mm-empower": 1, "mm-intensify": 1 },
    { damageFormula: "3d8", baseDamage: "1d8" });
  eq("P3 Empower adds the BASE damage, not the whole damage", agg.extraDamageDice, "2d8",
    "1d8 empowered + 1d8 intensified; adding 3d8 was the defect");
}

/* ================================================================== */
/* R — WHAT THE 3.585.0 LIVE TEST FOUND, AND THE CRITICAL RULING       */
/* ================================================================== */

/*
 * THE TWO DEFECTS THE DRIVE CAUGHT, both of which only existed BECAUSE
 * R6 made the ritual work. A ritual that ended at a chat card could not
 * leak a modifier into a cast it never made, nor roll a second check.
 */
{
  const src = code("module", "magic", "cast-workflow.mjs");
  ok("R1 the ritual copies the caster's derived modifiers before adding to them",
    /const modifiers = \[\.\.\.\(system\.magic\?\.spellcraft\?\.checkModifiers/.test(src),
    "`modifiers.push` was writing the secondary-caster bonus into the actor's own array; "
    + "the cast that followed read it, and so did the attack roll that came off that cast");
  ok("R2 and a ritual's cast does not roll a second check",
    /: ritual\?\.check\n\s*\? ritual\.check/.test(read("module", "magic", "cast-workflow.mjs")),
    "the table saw two Spellcraft checks for one ritual, the second announcing a degree "
    + "the outcome did not use");
}

/*
 * SPELL CRITICALS SCALE FROM BASE DAMAGE — Graham's ruling of 23
 * September 2026 on the second half of page 247's sentence.
 */
eq("R3 a minor critical adds one base damage",
  criticalBonusDamage({ baseDamage: "1d8" }, "minor"), "1d8");
eq("R4 a serious two", criticalBonusDamage({ baseDamage: "1d8" }, "serious"), "2d8");
eq("R5 a deadly three", criticalBonusDamage({ baseDamage: "1d8" }, "deadly"), "3d8");
eq("R6 a multi-die base multiplies whole",
  criticalBonusDamage({ baseDamage: "2d6" }, "serious"), "4d6",
  "2d6 is one base damage of two dice, not a 2 to be discarded");
eq("R7 AND A SPELL WITH NO BASE DAMAGE ENTRY ADDS NOTHING",
  criticalBonusDamage({ baseDamage: "" }, "deadly"), "",
  "page 247's second sentence — 20 damaging spells print no entry");
/*
 * TWO SPELLS PRINT A PAIR. Found in the 3.585.2 live test by asking
 * every damaging spell what its critical would add: Sunburst and Umbral
 * Blast answered "nothing" while all 97 of their neighbours scaled.
 */
eq("R7b a dual base damage scales its PRIMARY half",
  criticalBonusDamage({ baseDamage: "1d10/1d4" }, "deadly"), "3d10",
  "Sunburst's 8d10 fire is the modelled damage; the 8d4 essence half is not modelled at all");
eq("R7c and a single entry is untouched by that",
  criticalBonusDamage({ baseDamage: "1d10" }, "deadly"), "3d10");
eq("R8 junk in the entry adds nothing either",
  criticalBonusDamage({ baseDamage: "lots" }, "deadly"), "");
eq("R9 no severity is no critical", criticalBonusDamage({ baseDamage: "1d8" }, null), "");
eq("R10 the save path may name its own die count",
  criticalBonusDamage({ baseDamage: "1d6" }, "serious", 3), "3d6");
ok("R11 the attack path adds it — a spell critical used to add no damage at all",
  /const critFormula = criticalBonusDamage\(spell\.system, outcome\.critical\?\.severity/.test(
    code("module", "magic", "cast-workflow.mjs")));
ok("R11b and the card NAMES the dice it added",
  /\$\{critFormula \? ` \+ \$\{critFormula\} critical` : ""\}/.test(read("module", "magic", "cast-workflow.mjs")),
  "a deadly critical read `44 acid damage (4d6 + 2 splash)` — a formula that cannot reach 44");
ok("R12 before defences, so one blow is resolved once",
  code("module", "magic", "cast-workflow.mjs").indexOf("critBonus = critRoll.total")
  < code("module", "magic", "cast-workflow.mjs").indexOf("const packet = resolveAgainstDefences(targetSystem"),
  "halving two instances is not halving their sum");

/* ================================================================== */
/* Q — THE BLOCK'S SPELL DATA                                          */
/* ================================================================== */

ok("Q1 the authoring script is replayable against a fresh pack",
  /author-block24-spells/.test(read("tools", "author-block24-spells.mjs").slice(0, 400))
  || /EDITS/.test(read("tools", "author-block24-spells.mjs")));
{
  const src = code("tools", "author-block24-spells.mjs");
  ok("Q2 Acid Arrow keeps a lapsing sustain type",
    /y\.sustainType = "duration"/.test(src),
    "an earlier draft set `attack`, and sustainedLapses only lapses `duration` — the spell would never have ended");
  ok("Q3 and its Sustain choice sits where the cast reads it",
    /y\.sustainChoices = \[/.test(src) && !/y\.emanation = \{/.test(src),
    "cast-workflow reads spellData.sustainChoices; `emanation` holds only the copy");
  ok("Q4 Align Weapon offers a pick rather than an unread key",
    /picks: 1/.test(src) && !/choose: "aligned"/.test(src));
  ok("Q5 Abjurers Strike declares both halves of its sentence",
    /unarmoured: true/.test(src) && /slots: \["item"\]/.test(src));
  ok("Q6 and Animal Growth carries no invented warp mod",
    !/sizeSteps: 2/.test(src),
    "`sizeSteps` is a distance helper in combat/space.mjs that no warp reader has looked at");
}

/* ================================================================== */

process.stdout.write(failures
  ? `\nverify-chapter9-241-250: FAILED — ${failures} of ${checks} checks.\n`
  : `\nverify-chapter9-241-250: OK — ${checks} checks. Pages 241-250: Chapter 9's tail and the Grimoire's opening.\n`);
process.exit(failures ? 1 : 0);
