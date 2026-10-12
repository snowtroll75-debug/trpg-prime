#!/usr/bin/env node
/**
 * verify-emanation-growth — a ward that widens when it is sustained, and
 * ends when its own minute runs out.
 *
 * NEW at 3.430.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SPELL.
 *
 * Graham, 28 August 2026:
 *
 *   "Area 10-foot-emanation. Duration 1 minute. You emit a radiant aura
 *    of protective magic that envelops you and your allies. Within the
 *    area, you all benefit from a +1-status bonus to your DB. You can
 *    Sustain the Spell each round to extend the radius of the aura by 5
 *    feet, up to a maximum of 30 feet. +2 PP: status bonus increases by
 *    1 (max +5)."
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUR THINGS ON THE PACK ENTRY DISAGREED WITH IT, and the interesting
 * part is that each disabled a DIFFERENT part of the spell, so no single
 * symptom would have led to all four:
 *
 *   - `area: "10-foot-radius centred on you"` — the circle was placed
 *     correctly and was invisible to `emanationIsLive`, so it never
 *     followed anybody;
 *   - `sustained: false` — no active-spell entry was registered at all,
 *     which removed the Magic-tab row, the Sustain target AND the
 *     emanation record in one flag;
 *   - the growth was a NOTE, wired to nothing;
 *   - the warp read "+5 (max +25)" against a printed "+1 (max +5)", and
 *     unlike the other three this one was LIVE: eight PP bought +25 DB.
 *
 * Section D is the one that would have caught the last of those from the
 * pack alone.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  GROWTH_SUSTAIN_TYPE, emanationExpiry, emanationHasElapsed, grownRadius,
  growthRefusal, spellGrowth
} from "../module/magic/emanation-growth.mjs";
import { emanationIsLive } from "../module/magic/emanation.mjs";
import { parseSpellArea } from "../module/magic/spell-template.mjs";
import { parseSpellDuration } from "../module/magic/spell-effects.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * "`a` appears before `b`" — AND BOTH APPEAR AT ALL.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE `-1 <` TRAP, MET FOR THE FOURTH AND FIFTH TIME.
 *
 * `String.indexOf` answers -1 for a string that is not there, and -1 is
 * less than every real index. So `body.indexOf(a) < body.indexOf(b)` is
 * satisfied by DELETING `a` — which is exactly the defect an ordering
 * check exists to catch. Two mutations survived this file's first run
 * for precisely that reason, both of them deletions, in a file whose
 * previous paragraph is a warning about ordering claims.
 *
 * Written as a helper rather than as `indexOf(a) !== -1 &&` at each of
 * the three call sites, because the trap has now been rediscovered five
 * times by writing the comparison out by hand.
 */
function before(body, a, b) {
  const i = body.indexOf(a);
  const j = body.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const growthSrc = read("module", "magic", "emanation-growth.mjs");
const flow = read("module", "magic", "emanation-workflow.mjs");
const sustain = read("module", "magic", "sustain-workflow.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");
const registry = read("module", "magic", "active-spells.mjs");
const combat = read("module", "documents", "combat.mjs");
const boot = read("scripts", "trg-prime.mjs");

const WARD = { stepFeet: 5, maxFeet: 30 };

/* ================================================================== *
 * A. THE GROWTH ITSELF
 * ================================================================== */

ok("A1 a declared growth is read", JSON.stringify(spellGrowth({ sustainGrowth: WARD })) === JSON.stringify(WARD));
ok("A2 a spell declaring none has none", spellGrowth({}) === null);
// A ZERO STEP IS NOT A GROWTH OF NOTHING, it is the template default
// every other spell in the pack carries. Reading it as a growth would
// give six hundred spells a Sustain that "widens" them by nought feet.
ok("A3 the template default is not a growth",
  spellGrowth({ sustainGrowth: { stepFeet: 0, maxFeet: 0 } }) === null);
ok("A3b nor is a step with no cap", spellGrowth({ sustainGrowth: { stepFeet: 5, maxFeet: 0 } }) === null);

ok("A4 the first sustain widens by the step", grownRadius(10, WARD).radiusFeet === 15);
ok("A5 and the growth accumulates", grownRadius(25, WARD).radiusFeet === 30);
ok("A6 the cap holds", grownRadius(30, WARD).radiusFeet === 30);
ok("A7 and a ward past its cap is not shrunk", grownRadius(35, WARD).radiusFeet === 35,
  "a hand-edited scene is not a reason to take feet away from somebody");

// REPORTS THE CHANGE THAT HAPPENED, NOT THE ONE OFFERED. This is the
// lesson Song Of Despair taught on 28 August 2026, one release earlier:
// its recovery card read "Held at 1" and then "Frightened reduces by 3,
// to 1" because the line printed the raw delta. The same clamp lives
// here, so the same answer is given once at the source.
ok("A8 a partial growth reports the feet it actually gained",
  grownRadius(28, WARD).grewBy === 2,
  "printing the step would announce five feet it did not get");
ok("A9 a growth at the cap reports nothing gained", grownRadius(30, WARD).grewBy === 0);
ok("A10 and says so", grownRadius(30, WARD).atMax === true && grownRadius(25, WARD).atMax === false);
ok("A11 no growth declared leaves the radius alone",
  grownRadius(10, null).radiusFeet === 10 && grownRadius(10, null).grewBy === 0);

/* ================================================================== *
 * B. THE REFUSAL — and what it must never refuse
 * ================================================================== */

const atCap = { name: "Protective Ward", sustainType: "round", emanation: { radiusFeet: 30, growth: WARD } };
const growing = { name: "Protective Ward", sustainType: "round", emanation: { radiusFeet: 15, growth: WARD } };
const bless = { name: "Bless", sustainType: "duration", emanation: { radiusFeet: 30 } };

ok("B1 a ward at its cap refuses the sustain", typeof growthRefusal(atCap, "Vex") === "string");
ok("B2 and says why, and that the AP is kept",
  /maximum radius of 30 feet/.test(growthRefusal(atCap, "Vex"))
  && /keeps the action point/.test(growthRefusal(atCap, "Vex")),
  '"you cannot do that" with no reason is retried three times before anybody asks the GM');
ok("B3 a ward with room left is not refused", growthRefusal(growing, "Vex") === null);

// THE ONE THAT MATTERS. A "duration" sustain is what keeps its spell
// ALIVE — refusing it because there is nothing else to buy would end
// somebody's Bless for them. The predicate is written positively for
// exactly this reason, so an unrecognised shape is never refused either.
ok("B4 a duration sustain is never refused", growthRefusal(bless, "Vex") === null,
  "sustaining Bless is what keeps it running; refusing it would end the spell");
ok("B5 nor is an unknown sustain shape",
  growthRefusal({ ...atCap, sustainType: "somethingNew" }, "Vex") === null,
  "an unknown reason to sustain is still a reason");
ok("B6 nor a spell with no emanation at all",
  growthRefusal({ name: "X", sustainType: "round" }, "Vex") === null);
// NAMED POSITIVELY IN THE SOURCE, not by excluding "duration". Written
// the other way round, a sustainType added next year would be refused by
// default — silently, and only when a ward happened to be at its cap.
ok("B7 the shape is matched positively",
  /entry\?\.sustainType !== GROWTH_SUSTAIN_TYPE/.test(growthSrc)
  && GROWTH_SUSTAIN_TYPE === "round",
  "excluding 'duration' would refuse every shape invented later");

/* ================================================================== *
 * C. THE CLOCK
 * ================================================================== */

const MINUTE = parseSpellDuration("1 minute");
const SUSTAINED = parseSpellDuration("Sustained (1 minute)");

ok("C1 a flat minute is stamped on both clocks", (() => {
  const e = emanationExpiry({ duration: MINUTE, worldTime: 1000, round: 3 });
  return e.endsAtWorldTime === 1060 && e.endsOnRound === 13;
})(), "a round is six seconds; ten of them are the minute");

/*
 * C2 TURNED ROUND AT 3.496.0, and a check that reverses without saying
 * why is indistinguishable from one somebody gave up on.
 *
 * IT ASSERTED THE OPPOSITE: "a sustained spell is stamped with nothing
 * ... its minute is a maximum on something the lapse sweep already
 * ends". The second half was false. `sweepSustainedLapses` is called
 * from `TRGCombat._onStartTurn` alone, so outside an encounter nothing
 * lapses — a Bless cast in a corridor ran until dismissed — and inside
 * one it ended a spell only after two UNSUSTAINED rounds, so a bard
 * paying for Inspire Courage every round kept it past its minute.
 *
 * Graham ruled on 5 September 2026 that "Sustained (1 minute)" means
 * "you may sustain it, UP TO a minute". Measured first: of 72 sustained
 * spells, 62 print a cap, 10 of those are live emanations and 2 of those
 * are stamped already — so this moves exactly eight, named in
 * emanation-growth.mjs.
 */
ok("C2 A SUSTAINED SPELL WITH A PRINTED CAP IS STAMPED", (() => {
  const e = emanationExpiry({ duration: SUSTAINED, worldTime: 1000, round: 3 });
  return e?.endsAtWorldTime === 1060 && e?.endsOnRound === 13;
})(), "the minute is a cap on how long sustaining can extend it");
// C2b AND AN UNCAPPED ONE IS STILL STAMPED WITH NOTHING. Ten spells read
// a bare "sustained" with no minute at all; there is nothing to stamp,
// and the lapse sweep is genuinely all they have.
ok("C2b an uncapped sustained spell is stamped with nothing",
  emanationExpiry({ duration: parseSpellDuration("Sustained"), worldTime: 1000, round: 3 }) === null,
  "no seconds and no rounds to count");
ok("C3 and an unmeasurable duration too",
  emanationExpiry({ duration: parseSpellDuration("until dismissed"), worldTime: 1000, round: 3 }) === null);

// OUT OF COMBAT THERE ARE NO ROUNDS, and in a fight the world clock may
// not move. Rage records the reasoning; this is the same shape.
ok("C4 out of combat only the world clock is stamped", (() => {
  const e = emanationExpiry({ duration: MINUTE, worldTime: 1000, round: null });
  return e.endsAtWorldTime === 1060 && e.endsOnRound === null;
})());

const stamped = { ends: { endsAtWorldTime: 1060, endsOnRound: 13 } };
ok("C5 the world clock ends it", emanationHasElapsed(stamped, { worldTime: 1060, round: 4 }) === true);
ok("C6 the round clock ends it", emanationHasElapsed(stamped, { worldTime: 0, round: 13 }) === true);
ok("C7 neither having arrived leaves it running",
  emanationHasElapsed(stamped, { worldTime: 900, round: 4 }) === false);
ok("C8 an unstamped emanation never expires here",
  emanationHasElapsed({ radiusFeet: 30 }, { worldTime: 9e9, round: 9999 }) === false,
  "the six live before this release are ended by the lapse sweep, not by an invented clock");
ok("C9 and neither does a missing one", emanationHasElapsed(null, { worldTime: 9e9, round: 9999 }) === false);

/* ================================================================== *
 * D. THE PACK — Protective Ward against its own printed text
 * ================================================================== */

const spellDir = path.join(SYSTEM_ROOT, "packs", "spells");
if (fs.existsSync(spellDir)) {
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(spellDir, { valueEncoding: "json" });
  await db.open();
  let ward = null;
  const growers = [];
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith("!items!")) continue;
    if (value?.name === "Protective Ward") ward = value;
    if (spellGrowth(value?.system)) growers.push(value.name);
  }
  await db.close();

  ok("D1 Protective Ward is in the pack", Boolean(ward));
  if (ward) {
    const s = ward.system;
    // THE WORD THAT DECIDES EVERYTHING. "10-foot-radius centred on you"
    // places the same circle and is invisible to `emanationIsLive`.
    ok("D2 its area is an emanation", /emanation/i.test(s.area), s.area);
    ok("D3 so the live-emanation machinery sees it", emanationIsLive(s) === true);
    // AND STILL PARSES TO THE SAME TEN FEET. Changing the area string to
    // satisfy a regex would be a poor trade if it moved the circle.
    ok("D4 and it is still a ten-foot circle on the canvas",
      parseSpellArea(s.area)?.distance === 10 && parseSpellArea(s.area)?.t === "circle",
      JSON.stringify(parseSpellArea(s.area)));

    ok("D5 it is sustainable", s.sustained === true,
      "false left no active-spell entry: no Magic-tab row, no Sustain target, no emanation");
    ok("D6 by the shape whose sustain buys something other than time",
      s.sustainType === GROWTH_SUSTAIN_TYPE,
      '"duration" would lapse a ward whose printed duration is a flat minute');
    ok("D7 and its minute is flat, not sustained",
      parseSpellDuration(s.duration)?.sustained === false,
      "which is what makes the expiry stamp both necessary and correct");

    ok("D8 the growth is declared, not prose",
      JSON.stringify(spellGrowth(s)) === JSON.stringify(WARD), JSON.stringify(s.sustainGrowth));
    // THE SENTENCE STAYS TOO. The note is what a player reads; the
    // numbers are what the engine reads. Deleting the note would fix the
    // engine and leave the spell unreadable.
    ok("D9 and the printed sentence is still on the spell",
      (s.effects ?? []).some((e) => e.kind === "note" && /5 ft.*30 ft/.test(e.text ?? "")));
    // THE NUMBERS AGREE WITH THE SENTENCE. Two copies of a value agree
    // right up until somebody edits one of them.
    ok("D10 the declared numbers match the sentence a player reads",
      (s.effects ?? []).some((e) => e.kind === "note"
        && new RegExp(`by ${WARD.stepFeet} ft`).test(e.text ?? "")
        && new RegExp(`max ${WARD.maxFeet} ft`).test(e.text ?? "")));

    // THE ONE THAT WAS LIVE. bonusValue and bonusMax are read by
    // `aggregateWarpSelection`, so the pack's "+5 (max +25)" was not a
    // dormant typo — it was a +25 status bonus to DB for eight PP.
    const warp = (s.warps ?? [])[0] ?? {};
    ok("D11 the warp buys +1 per 2 PP",
      warp.ppCost === 2 && warp.mods?.bonusValue === 1,
      JSON.stringify(warp.mods));
    ok("D12 capped at +5", warp.mods?.bonusMax === 5,
      "the pack read 25 — the strongest defensive effect in the game, behind a typo");
    ok("D13 and the warp's own words say the same",
      /increases by 1 \(max \+5\)/.test(warp.text ?? ""), warp.text);
    ok("D14 as does the description a player reads",
      /increases by 1 \(max \+5\)/.test(s.description ?? "")
      && !/max \+25/.test(s.description ?? ""),
      "the card and the tooltip agreed with each other and both disagreed with the book");

    ok("D15 the bonus lands on DB as a status bonus",
      (s.effects ?? []).some((e) => e.kind === "bonus" && e.slot === "defence"
        && e.bonusType === "status" && e.value === 1));
    ok("D16 and envelops the caster and their allies", s.areaTargeting === "allies");
  }

  // THE BOUNDARY, held the way verify-emanation holds its own: a second
  // growing spell should be a deliberate edit.
  ok("D17 exactly one spell in the pack grows when sustained",
    growers.sort().join(" | ") === "Protective Ward", growers.join(" | "));
}

/*
 * D18 THE EIGHT SPELLS THE 3.496.0 RULING MOVED, asked of the live pack
 * rather than of my memory of it.
 *
 * A live emanation's effects deliberately carry no clock of their own,
 * so the entry's stamp is the only thing that can end one. These are the
 * emanations that print a cap and are sustained — the exact set whose
 * lifetime changed when `emanationExpiry` stopped refusing them. If that
 * set ever changes, the ruling deserves re-reading rather than silently
 * outliving the measurement it was made from.
 */
{
  const capped = [];
  const uncapped = [];
  const { ClassicLevel } = await import("classic-level");
  const db2 = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  try {
    await db2.open();
    for await (const [key, v] of db2.iterator()) {
      if (!key.startsWith("!items!")) continue;
      if (v?.type !== "spell" || !v.system?.sustained) continue;
      if (!emanationIsLive(v.system)) continue;
      const parsed = parseSpellDuration(v.system.duration);
      const stamped = emanationExpiry({ duration: parsed, worldTime: 1000, round: 3 });
      (stamped ? capped : uncapped).push(v.name);
    }
  } finally {
    await db2.close().catch(() => {});
  }
  // INSPIRE HEROICS JOINED AT 3.612.0 (block 34's R8): "sustained (1 minute)",
  // a capped live emanation like Inspire Courage, so its circle ends on the
  // same stamp. Re-read the ruling: it is the case it was made for.
  // PROTECTOR'S SPHERE JOINED AT 3.613.0 (block 35's R3): "sustained up to 1
  // minute", a capped live emanation, so its circle ends on the same stamp.
  const EXPECTED = [
    "Bane", "Bless", "Ember Of Devotion", "Inspire Courage", "Inspire Defence",
    "Inspire Heroics", "Luminance", "Protective Ward", "Protector’s Sphere", "Radiant Aegis", "Song Of Despair",
    "Wellspring Of Valour"
  ];
  ok("D18 every capped live emanation now carries a clock",
    capped.sort().join(" | ") === EXPECTED.join(" | "),
    `capped: ${capped.join(" | ")}`);
  // D19 AND THE UNCAPPED ONES STILL CARRY NONE. A sustained emanation
  // with no printed minute has nothing to stamp, and the lapse sweep is
  // genuinely all it has.
  ok("D19 and an uncapped one still carries none",
    uncapped.every((n) => !capped.includes(n)),
    `uncapped: ${uncapped.join(" | ") || "(none)"}`);
}

/* ================================================================== *
 * E. THE WIRING — that each decision is reached by something
 * ================================================================== */

// REACHABILITY, NOT PRESENCE. Five times in three days a check here has
// asserted that a name or a string exists somewhere in a file while the
// code holding it was unreachable — behind an `if (false)`, in a dead
// branch, or in a comment. Each of these names the CALL SITE.
ok("E1 the cast stamps the growth onto the record",
  /growth: spellGrowth\(spellData\)/.test(cast));
ok("E2 and the clock, from the spell's own duration text",
  /ends: emanationExpiry\(\{[\s\S]{0,200}duration: parseSpellDuration\(durationText\)/.test(cast),
  "reading the printed duration is what keeps Bless unstamped");

// ORDER IS ASKED OF THE FUNCTION BODY, NEVER OF THE FILE — and this
// check failed first time round for exactly the reason it now guards
// against. `ensureActionPoints` appears at the top of the file in an
// import, so "is the refusal before the spend" compared a call site
// against an import line and answered no. That is the third time an
// ordering claim in this project has been decided by import positions,
// and the second time in a week; the fix is always to slice the function
// out first.
const sustainBody = sustain.slice(sustain.indexOf("export async function sustainSpellAction"));
ok("E3 the sustain grows the emanation",
  /const grown = await growEmanation\(actor, entry\.id\)/.test(sustainBody));
ok("E4 before it writes the card that reports the growth",
  before(sustainBody, "await growEmanation", "ChatMessage.create"),
  "a card written first would announce a widening that had not happened");
ok("E5 and the card prints the feet gained, not the step",
  /widens by <strong>\$\{grown\.grewBy\} ft<\/strong>/.test(sustainBody),
  "Song Of Despair's card printed the offered change one release ago");
ok("E6 the refusal is asked before the AP is spent",
  before(sustainBody, "growthRefusal(entry", "ensureActionPoints"),
  '"deducts an AP but does nothing else" is the report this file exists to answer');
ok("E6b and the ordering above is asked of the function, not the file",
  sustainBody.indexOf("import ") === -1,
  "an import line at the top of a file precedes every call site in it");

ok("E7 growing the ward reconciles who is inside it",
  /await refreshEmanation\(record\)/.test(
    flow.slice(flow.indexOf("export async function growEmanation"))),
  "a wider circle catches creatures who have not moved at all");
ok("E8 and writes the new radius before reconciling",
  before(flow.slice(flow.indexOf("export async function growEmanation")),
    "emanation.radiusFeet = grown.radiusFeet", "refreshEmanation(record)"),
  "refreshing first would redraw the old circle");

// THE RESULT IS BOUND, not merely the call present. `const faded = []
// || await sweepActiveSpellExpiry(...)` leaves the call text intact and
// short-circuits past it — presence-versus-reachability for the sixth
// time in three days, and the reason this anchors on the assignment.
ok("E9 the turn sweep ends an expired emanation",
  /const faded = await sweepActiveSpellExpiry\(actor, \{/.test(combat));
ok("E10 and the world clock does too, for a ward cast in a corridor",
  /sweepActiveSpellExpiry\(actor, \{ worldTime, round:/.test(boot),
  "outside an encounter there are no rounds to count");

// THE LATECOMERS. `endActiveSpell` tore effects off the caster and the
// cast's target list only — a creature that walked in afterwards was
// never on that list, so ending the spell left it holding the bonus for
// good. Latent since 3.426.0 and invisible to live testing, because the
// natural way to test an emanation is to walk somebody OUT of it.
ok("E11 ending a spell sweeps its emanation off everyone carrying it",
  /if \(entry\.emanation\) \{[\s\S]{0,300}endEmanationEverywhere\(id, entry\.emanation\)/.test(registry),
  "targets is the list drawn up at the cast, which is exactly what was wrong");
ok("E12 swept over the canvas rather than over that list",
  /for \(const token of canvas\?\.tokens\?\.placeables \?\? \[\]\)/.test(
    flow.slice(flow.indexOf("export async function endEmanationEverywhere"))));
ok("E13 and the circle goes with them",
  /deleteEmbeddedDocuments\("Region", \[regionId\]\)/.test(flow),
  "a ring still following its caster is a picture of a spell that has ended");

/* ================================================================== */

const label = "verify-emanation-growth";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
