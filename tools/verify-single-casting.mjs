#!/usr/bin/env node
/**
 * verify-single-casting — one casting at a time.
 *
 * NEW at 3.512.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION X IS THE POINT OF THE WHOLE FILE, and it is a section about two
 * spells this release must NOT touch.
 *
 *   Fatigue           "Multiple uses of this spell stack, with a second
 *                      casting and a failed save resulting in multiple
 *                      fatigued levels."
 *   Waves Of Fatigue  the same sentence.
 *
 * The pack contains an explicit counter-example to the rule being built,
 * which is why `singleCasting` is a DECLARED FIELD and not a heuristic. Any
 * rule wide enough to catch the six — "a buff", "a spell with a long flat
 * duration", "a spell naming itself in its own text" — catches Fatigue too,
 * and the failure mode is a second Fatigue silently cancelling the first
 * instead of stacking with it. Nobody would report that as a bug; they
 * would report that Fatigue felt weak.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION M IS THE MEASUREMENT THAT MADE THE RELEASE NECESSARY. Four of
 * the six spells registered NOTHING before this: no PP lock, not sustained,
 * no (D) on the duration line. The rule reads "the previous casting is
 * dispelled" and there was no previous casting on record to dispel. That is
 * asserted from the pack rather than stated in a comment, because it is the
 * fact that decides whether `singleCasting` needs to be a registration
 * reason or could have been a line in the applier.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE CANNOT REACH, said plainly. The registration reason
 * itself — `|| singleCasting` in `cast-workflow.mjs` — is Foundry-coupled
 * glue, and the mutation harness cannot run it. Two workflow mutations
 * survived earlier this session for exactly that reason. The repair taken
 * both times was to move the DECISION into a pure module rather than to
 * write a check that greps the source for its own text, and that is what
 * `supersededEntries` is: it takes the spell data and answers the whole
 * question, so the glue has no condition of its own to get wrong. What is
 * left in the glue is one `||` and one `for` loop.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  declaresSingleCasting, singleCastingLine, supersededEntries
} from "../module/magic/single-casting.mjs";
import {
  activeSpellState, isDismissibleDuration, ppLockCondition, registerActiveSpell
} from "../module/magic/active-spells.mjs";

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

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

const spells = [];
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, v] of db.iterator()) spells.push(v);
  } finally { await db.close().catch(() => {}); }
}

const plain = (s) => String(s?.system?.description ?? "")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const byName = (n) => spells.find((s) => s?.name === n);

const DECLARED = [
  "Vital Beacon", "Light", "Contingency", "Veiled Secret", "Breeze", "Pass Without Trace"
];

const declaring = spells.filter((s) => s?.system?.singleCasting === true);
equal("P1 SIX SPELLS DECLARE THE RULE", declaring.length, 6,
  "measured across the pack before it was built; a seventh means somebody widened it");
for (const name of DECLARED) {
  ok(`P2:${name} declares it`, byName(name)?.system?.singleCasting === true,
    "the spell prints the rule in its own text");
}

// P3 EVERY DECLARATION IS BACKED BY A PRINTED SENTENCE. A field that can
// be set on a spell whose book text says nothing about it is a field that
// spreads by copy-paste.
const PRINTS_RULE = [
  /only one casting/i, /one .{0,25}active at (any one time|a time)/i,
  /previous casting is dispelled/i, /benefit from .{0,40}only one/i,
  /if you cast .{0,30}again/i, /supersedes the older/i
];
for (const s of declaring) {
  ok(`P3:${s.name} prints the rule it declares`, PRINTS_RULE.some((re) => re.test(plain(s))),
    `"${plain(s).slice(0, 90)}…"`);
}

/* ================================================================== *
 * X. THE TWO SPELLS THAT SAY THE OPPOSITE
 * ================================================================== */

for (const name of ["Fatigue", "Waves Of Fatigue"]) {
  const s = byName(name);
  ok(`X1:${name} is in the pack`, Boolean(s));
  ok(`X2:${name} SAYS MULTIPLE USES STACK`, /multiple uses of this spell stack/i.test(plain(s)),
    "the counter-example this field exists to respect");
  ok(`X3:${name} DOES NOT DECLARE THE RULE`, s?.system?.singleCasting !== true,
    "a second casting must add a fatigued level, not cancel the first");
}

// X4 THE GENERAL FORM. Not just those two by name — nothing in the pack
// may both say it stacks and declare that it does not.
const contradictory = spells.filter((s) =>
  s?.system?.singleCasting === true && /multiple uses of this spell stack/i.test(plain(s)));
equal("X4 NOTHING BOTH STACKS AND DOES NOT", contradictory.length, 0,
  contradictory.map((s) => s.name).join(", "));

/* ================================================================== *
 * M. WHY IT HAD TO BE A REGISTRATION REASON
 * ================================================================== */

// FOUR OF THE SIX WERE NEVER ENTRIES. No lock, not sustained, no (D) —
// so nothing recorded which casting was live and a recast had nothing to
// end. This is the measurement the release was built on.
const unregistered = DECLARED.filter((name) => {
  const s = byName(name);
  const d = s?.system?.duration;
  return !ppLockCondition(d) && !s?.system?.sustained && !isDismissibleDuration(d);
});
equal("M1 FOUR OF THE SIX REGISTERED NOTHING BEFORE THIS RELEASE", unregistered.length, 4,
  `got: ${unregistered.join(", ")}`);
ok("M1b and they are the four expected",
  JSON.stringify([...unregistered].sort())
    === JSON.stringify(["Breeze", "Contingency", "Pass Without Trace", "Veiled Secret"]),
  unregistered.join(", "));
// M2 THE OTHER TWO WERE ENTRIES ALREADY, and that is where the gap cost
// PP: a second Vital Beacon locked a second block and left the first held.
for (const name of ["Vital Beacon", "Light"]) {
  ok(`M2:${name} locks PP, so it was already on the panel`,
    Boolean(ppLockCondition(byName(name)?.system?.duration)),
    "\"until your next daily preparations\"");
}

/* ================================================================== *
 * D. THE DECLARATION
 * ================================================================== */

ok("D1 a declaring spell declares", declaresSingleCasting({ singleCasting: true }));
ok("D2 an ordinary spell does not", !declaresSingleCasting({}));
ok("D3 THE STRING \"true\" IS NOT TRUE", !declaresSingleCasting({ singleCasting: "true" }),
  "an authored typo must not silently cancel somebody's running spell");
ok("D4 nothing declares nothing", !declaresSingleCasting(null) && !declaresSingleCasting(undefined));

/* ================================================================== *
 * S. WHICH ENTRIES A RECAST ENDS
 * ================================================================== */

const YES = { singleCasting: true };
const entries = [
  { id: "a", name: "Breeze" },
  { id: "b", name: "Bless" },
  { id: "c", name: "Breeze" }
];

const hit = supersededEntries(entries, YES, "Breeze");
equal("S1 BOTH EARLIER CASTINGS GO", hit.length, 2);
ok("S1b and they are the right ones",
  JSON.stringify(hit.map((e) => e.id)) === JSON.stringify(["a", "c"]));
ok("S1c carrying the id the workflow ends by", hit.every((e) => typeof e.id === "string" && e.id));

equal("S2 A DIFFERENT SPELL IS UNTOUCHED",
  supersededEntries(entries, YES, "Bless").map((e) => e.id).join(), "b",
  "two spells must never end each other");

// S3 IS THE FATIGUE CASE, RUN RATHER THAN ASSUMED. The entry matches by
// name and the spell still ends nothing, because it does not declare it.
equal("S3 A SPELL THAT DOES NOT DECLARE IT ENDS NOTHING",
  supersededEntries(entries, {}, "Breeze").length, 0,
  "a second Fatigue stacks; it does not cancel the first");
equal("S3b nor does one declaring it falsely",
  supersededEntries(entries, { singleCasting: false }, "Breeze").length, 0);

equal("S4 case and padding do not matter",
  supersededEntries([{ id: "x", name: " BREEZE " }], YES, "breeze").length, 1,
  "the panel prints the name; two rows a caster reads as one spell are one spell");

equal("S5 A NAMELESS SPELL ENDS NOTHING", supersededEntries(entries, YES, "").length, 0,
  "it would otherwise match every nameless entry a future bug leaves behind");
equal("S5b and a nameless entry is not matched by a named spell",
  supersededEntries([{ id: "y" }, { id: "z", name: "" }], YES, "Breeze").length, 0);
// S5c IS THE ONE THAT CAN CATCH THE GUARD BEING REMOVED. S5 and S5b both
// pass with `if (!name)` deleted — their entries are all named, so an
// empty spell name matches none of them and the count is zero either way.
// A check that cannot catch its own assertion being neutered is the defect
// class this project has now recorded four times.
equal("S5c A NAMELESS SPELL MEETING NAMELESS ENTRIES STILL ENDS NOTHING",
  supersededEntries([{ id: "y" }, { id: "z", name: "" }], YES, "").length, 0,
  "\"\" === \"\" is what the guard is there to stop");

equal("S6 a missing registry is empty, not a throw",
  supersededEntries(null, YES, "Breeze").length, 0);
equal("S6b and so is a malformed one", supersededEntries("nope", YES, "Breeze").length, 0);

/* ================================================================== *
 * L. WHAT THE CARD SAYS
 * ================================================================== */

equal("L1 NOTHING SUPERSEDED SAYS NOTHING", singleCastingLine("Breeze", 0), null,
  "a line on every first casting would train the caster to ignore it");
equal("L1b and a negative count is not a line", singleCastingLine("Breeze", -1), null);
ok("L2 ONE EARLIER CASTING IS SAID OUT LOUD", /Your earlier casting of Breeze ends/
  .test(String(singleCastingLine("Breeze", 1))),
  String(singleCastingLine("Breeze", 1)));
ok("L2b naming the spell", String(singleCastingLine("Veiled Secret", 1)).includes("Veiled Secret"));
ok("L3 TWO ARE PLURAL", /Your earlier castings of Breeze end\b/
  .test(String(singleCastingLine("Breeze", 2))),
  String(singleCastingLine("Breeze", 2)));
ok("L4 and it says why", String(singleCastingLine("Breeze", 1)).includes("only one can be active"));

/* ================================================================== *
 * A. THE PANEL
 * ================================================================== */

equal("A1 A ONE-AT-A-TIME ENTRY HAS ITS OWN WORD",
  activeSpellState({ singleCasting: true }), "One at a time",
  "\"Dismissible\" is what the fallback would have called all four new rows");
equal("A2 a locked one still reports the lock",
  activeSpellState({ singleCasting: true, lock: "dailyPrep" }), "PP locked (dailyPrep)",
  "Vital Beacon and Light are both, and the PP is the fact that matters");
equal("A3 a sustained one still reports sustained",
  activeSpellState({ singleCasting: true, sustained: true }), "Sustained");
equal("A4 an emanation still reports emanation",
  activeSpellState({ singleCasting: true, emanation: { radiusFeet: 10 } }), "Emanation");
equal("A5 AN ORDINARY (D) SPELL IS UNCHANGED",
  activeSpellState({ dismissible: true }), "Dismissible",
  "56 spells reach this line and none of them may move");

/* ================================================================== *
 * E. THE ENTRY ACTUALLY CARRIES IT
 * ================================================================== */

// THE DEFECT CLASS THIS SECTION EXISTS FOR: the rule was right, the
// plumbing was right, and the field the display reads came from somewhere
// I had not changed. Found live on the banner at 3.508.0, where every
// check ran the rule and none ran the thing that displays it. So the
// registry write is RUN here against a stand-in actor, which needs only
// getFlag and setFlag.
{
  let stored = null;
  const actor = {
    getFlag: () => stored ?? [],
    setFlag: async (_s, _k, value) => { stored = value; }
  };
  await registerActiveSpell(actor, { id: "one", name: "Breeze", singleCasting: true });
  equal("E1 THE ENTRY REMEMBERS WHY IT IS ON THE LIST",
    stored?.[0]?.singleCasting, true,
    "without this the panel reads the field as undefined and prints \"Dismissible\"");
  equal("E1b and the panel word follows from it",
    activeSpellState(stored?.[0]), "One at a time");
  equal("E2 an ordinary registration is not marked",
    (await (async () => {
      stored = null;
      await registerActiveSpell(actor, { id: "two", name: "Shield", dismissible: true });
      return stored?.[0]?.singleCasting;
    })()), false,
    "the flag must come from the spell, not from having been registered");

  // E3 AND THE NEW ENTRY IS FINDABLE BY THE RULE THAT WILL END IT. The
  // round trip: register, then ask what a recast would supersede.
  stored = null;
  await registerActiveSpell(actor, { id: "three", name: "Breeze", singleCasting: true });
  equal("E3 a registered casting is what the next cast supersedes",
    supersededEntries(stored, { singleCasting: true }, "Breeze").map((e) => e.id).join(), "three");
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-single-casting: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-single-casting: OK — ${checks} checks.\n`);
