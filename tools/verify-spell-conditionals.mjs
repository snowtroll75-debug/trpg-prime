#!/usr/bin/env node
/**
 * verify-spell-conditionals — advantage, scoped to something.
 *
 * NEW at 3.497.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUR SPELLS, ONE SHAPE, AND NOTHING NEW INVENTED.
 *
 *   SPIRIT OF THE HUNT  advantage on Search (Perception); +2 PP Track
 *   COURAGE             advantage on saves against Fear
 *   FLAWLESS LIES       advantage on Bluff (Deception)
 *   CANCEL MAGIC        advantage on saves against one chosen tradition
 *
 * Three shipped as a `note` — automation that is really a reminder — and
 * two of them (Flawless Lies, Cancel Magic) carried nothing at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION V IS THE ONE THAT MATTERS: ONE VALIDATOR, BOTH ENDS.
 *
 * `conditionals.mjs` returns null for anything malformed rather than
 * throwing, deliberately — "a typo in one race's JSON should cost that
 * one entry, not every roll the actor makes". That is right for a race
 * shipped in a pack and read at every roll, and it means a spell row
 * that is subtly wrong would apply an effect granting NOTHING, silently,
 * at cast time. So the authoring path runs the collector's own function
 * and refuses out loud. Two validators that agree until somebody edits
 * one is the defect this avoids.
 *
 * SECTION S IS THE SCOPES, held against the axes that carry them. Each
 * of the four is `auto` because the check's own identity settles it —
 * the action a Search was invoked from, the traits of the effect forcing
 * a save, the tradition of the spell that cast it. An `auto` entry that
 * needed a person's judgement would be advantage granted without asking.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  TRADITIONS, normaliseSpellConditional, grantsFor, traditionCount,
  traditionConditional, conditionalLine, traditionLine, traditionShortfallLine,
  conditionalRemainderLine
} from "../module/magic/spell-conditional.mjs";
import {
  normaliseConditional, collectConditionals, matchesCheck, automaticSelections
} from "../module/conditionals.mjs";
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
function caseBody(source, kind) {
  const at = source.indexOf(`        case "${kind}": {`);
  if (at < 0) return "";
  const end = source.indexOf("\n        case \"", at + 20);
  return source.slice(at, end > 0 ? end : source.length);
}

const HUNT = {
  kind: "conditional", label: "Spirit Of The Hunt", target: "targets",
  grants: [{
    kind: "advantage", label: "Spirit Of The Hunt",
    scope: "Search (Perception) checks", when: { actions: ["search"] }, auto: true
  }],
  warpGrants: [{
    kind: "advantage", label: "Spirit Of The Hunt",
    scope: "Track (Survival) checks", when: { actions: ["track"] }, auto: true
  }]
};

/* ================================================================== *
 * V. ONE VALIDATOR, BOTH ENDS
 * ================================================================== */

const spec = normaliseSpellConditional(HUNT, normaliseConditional);
ok("V1 a declared row reads back whole", Boolean(spec) && spec.grants.length === 1);
ok("V2 a malformed row is refused",
  normaliseSpellConditional(null, normaliseConditional) === null);
// V2b THE KIND IS CHECKED EVEN WHEN THE REST IS WELL-FORMED. The first
// version tested `{kind:"note"}` alone, which the grants-nothing refusal
// below would have caught anyway — so deleting the kind check survived
// its own mutation. A note row carrying valid grants is the case that
// tells them apart.
ok("V2b a note row is refused even carrying valid grants",
  normaliseSpellConditional({ ...HUNT, kind: "note" }, normaliseConditional) === null,
  "otherwise any row with a grants array becomes a conditional");

// V3 THE COLLECTOR'S OWN FUNCTION DECIDES. Without the validator there
// is nothing to authorise the row, and a spell that granted an unusable
// entry would apply an effect that does nothing at every roll.
ok("V3 THE VALIDATOR IS REQUIRED, not optional",
  normaliseSpellConditional(HUNT) === null,
  "one shape, one validator — the collector's");

// V4 AND IT REALLY IS THE COLLECTOR'S. A grant the collector would drop
// must be dropped here, where a check can see it, rather than applied as
// an effect that silently grants nothing.
ok("V4 a grant with no axes at all is dropped",
  normaliseSpellConditional({
    ...HUNT, grants: [{ kind: "advantage", scope: "everything", when: {} }], warpGrants: []
  }, normaliseConditional) === null,
  "conditionals.mjs refuses an unscoped entry, so this must too");
ok("V4b and so is one with an unknown kind",
  normaliseSpellConditional({
    ...HUNT, grants: [{ kind: "reroll", when: { actions: ["search"] } }], warpGrants: []
  }, normaliseConditional) === null);
ok("V5 A ROW THAT GRANTS NOTHING IS REFUSED",
  normaliseSpellConditional({ kind: "conditional", label: "X", grants: [], warpGrants: [] },
    normaliseConditional) === null,
  "an empty effect is what a note already was");

/* ================================================================== *
 * W. THE WARPS
 * ================================================================== */

equal("W1 an unwarped casting grants what it declares", grantsFor(spec, {}).length, 1);
equal("W1b and the Track warp unlocks the second",
  grantsFor(spec, { extraConditionals: 1 }).length, 2);
// W2 SLICED, NOT MULTIPLIED. The list is what is on offer; a caster
// cannot buy the same alternate twice.
equal("W2 buying more than is on offer grants no more",
  grantsFor(spec, { extraConditionals: 9 }).length, 2);
ok("W2b and the unlocked one is the Track entry",
  grantsFor(spec, { extraConditionals: 1 })[1].when.actions[0] === "track");

const WARD = { kind: "conditional", label: "Cancel Magic", traditions: 1, traditionGrant: {} };
const wardSpec = normaliseSpellConditional(WARD, normaliseConditional);
equal("W3 one tradition without the warp", traditionCount(wardSpec, {}), 1);
equal("W3b two with it", traditionCount(wardSpec, { extraTraditions: 1 }), 2);
equal("W4 a spell that names none is unaffected", traditionCount(spec, { extraTraditions: 4 }), 0);

// W5 THE KEYS SURVIVE AGGREGATION — the defect verify-warp-area exists
// for: a mod the aggregate does not declare is dropped in transit.
const blank = emptyWarp().mods;
ok("W5 both warp keys are declared in the aggregate",
  "extraConditionals" in blank && "extraTraditions" in blank);

/* ================================================================== *
 * S. THE SCOPES, held against the axes that carry them
 * ================================================================== */

const hunt = grantsFor(spec, { extraConditionals: 1 });
ok("S1 Search is scoped to the ACTION, not the whole skill",
  matchesCheck(hunt[0], { actionKey: "search" }) === true
  && matchesCheck(hunt[0], { checkType: "skill", subject: "perception" }) === false,
  "\"Search (Perception) checks\" is the printed scope, and `search` is a real action key");
ok("S1b and Track likewise",
  matchesCheck(hunt[1], { actionKey: "track" }) === true);
// S2 AUTO MEANS THE CHECK SETTLES IT. An auto entry that needed a
// person's judgement would be advantage granted without asking.
// `automaticSelections` answers {modifiers, kinds} — the shape the roll
// consumes — so what is asserted is that "advantage" comes back, not a
// row count. The first version counted rows on an object and got
// undefined, which is a check passing on nothing.
equal("S2 a Search check pre-ticks it",
  automaticSelections(hunt, { actionKey: "search" }).kinds.join(","), "advantage");
equal("S2b and an unrelated check offers nothing",
  automaticSelections(hunt, { actionKey: "balance" }).kinds.length, 0);

const courage = normaliseConditional({
  kind: "advantage", scope: "saving throws against Fear effects",
  when: { checkTypes: ["save"], traits: ["fear"] }, auto: true
}, { id: "c", name: "Courage" }, 0);
ok("S3 Courage covers a save forced by a Fear effect",
  matchesCheck(courage, { checkType: "save", traits: ["fear"] }) === true);
ok("S3b and NOT a save against something else",
  matchesCheck(courage, { checkType: "save", traits: ["poison"] }) === false,
  "the traits axis carries what PROVOKED the check");
ok("S3c nor a skill check that happens to be frightening",
  matchesCheck(courage, { checkType: "skill", traits: ["fear"] }) === false);

const lies = normaliseConditional({
  kind: "advantage", scope: "Bluff (Deception) checks",
  when: { checkTypes: ["skill"], subjects: ["deception"] }, auto: true
}, { id: "f", name: "Flawless Lies" }, 0);
ok("S4 Flawless Lies covers the whole Deception skill",
  matchesCheck(lies, { checkType: "skill", subject: "deception" }) === true,
  "\"all Bluff (Deception) checks\" is the printed scope");
ok("S4b and no other skill", matchesCheck(lies, { checkType: "skill", subject: "diplomacy" }) === false);

/* ================================================================== *
 * T. THE CHOSEN TRADITION
 * ================================================================== */

const arcane = traditionConditional(wardSpec, "arcane", 0, normaliseConditional);
ok("T1 a named tradition becomes a save conditional",
  matchesCheck(arcane, { checkType: "save", traditions: ["arcane"] }) === true);
ok("T1b scoped to that tradition alone",
  matchesCheck(arcane, { checkType: "save", traditions: ["verdant"] }) === false,
  "warding against one realm must not ward against another");
ok("T1c and to saves, not every roll",
  matchesCheck(arcane, { checkType: "skill", traditions: ["arcane"] }) === false);
ok("T2 an unknown tradition is refused",
  traditionConditional(wardSpec, "shadow", 0, normaliseConditional) === null);
equal("T2b the four are the printed four", TRADITIONS.join(","),
  "arcane,divinity,ethereal,verdant");
// T3 ONE ENTRY PER TRADITION, so a caster who warded against two sees
// two rows saying which rather than one row listing both.
const two = ["arcane", "divinity"].map((t, i) => traditionConditional(wardSpec, t, i, normaliseConditional));
ok("T3 two traditions make two entries",
  two.length === 2 && two[0].id !== two[1].id);
ok("T3b and each says which in its own wording",
  /arcane/.test(two[0].scope) && /divinity/.test(two[1].scope));

/* ================================================================== *
 * E. THE EFFECT REACHES THE COLLECTOR
 * ================================================================== */

// E1 THE END-TO-END FACT. `collectConditionals` reads items AND effects;
// this proves an effect written the way the cast writes one is picked up
// at a check, which is the whole reason no new plumbing was needed.
const asEffect = {
  id: "eff1", name: "Spirit Of The Hunt", disabled: false,
  flags: { "trg-prime": { conditionals: hunt } }
};
const collected = collectConditionals([], [asEffect]);
ok("E1 AN EFFECT'S CONDITIONALS ARE COLLECTED", collected.length === 2,
  `collected ${collected.length}`);
ok("E1b and still match after the round trip",
  automaticSelections(collected, { actionKey: "search" }).kinds.includes("advantage"));
// E2 A DISABLED EFFECT GRANTS NOTHING — a GM who switched it off has
// ended it, the same rule the Respite gate reads.
ok("E2 a disabled effect grants nothing",
  collectConditionals([], [{ ...asEffect, disabled: true }]).length === 0);

const se = caseBody(read("module", "magic", "spell-effects.mjs"), "conditional");
ok("E3 the effect kind is handled", se.length > 0);
ok("E3b it validates with the collector's own function",
  se.includes('const { normaliseConditional } = await import("../conditionals.mjs");')
  && se.includes("normaliseSpellConditional(effect, normaliseConditional)"));
ok("E3c and writes the entries onto the effect",
  se.includes("conditionals: granted"),
  "the flag collectConditionals reads");
// E4 AT 3.504.0 THE CALL SITE MOVED UP ONE LEVEL. It reads `warpedGrants`
// now, which calls `grantsFor` itself and then raises the NUMBER on a
// modifier grant — because `grantsFor` reads `extraConditionals` and
// nothing else, so five already-live "+1 to the bonus" warps would have
// gone inert the moment their spells became conditionals.
// `verify-pp2-bonuses` section W owns that rule; this asserts the wiring.
ok("E4 the warps are folded in",
  se.includes("warpedGrants(spec, warpMods, warpedBonusValue)")
  && se.includes("traditionCount(spec, warpMods)"));
ok("E5 a casting that warded nothing is refused out loud",
  se.includes("if (!granted.length) {")
  && se.includes("Nothing was warded for ${spell.name} — nothing applied."),
  "an effect granting nothing is what the note already was");

/* ================================================================== *
 * R. THE CARD
 * ================================================================== */

ok("R1 the card names what the advantage covers",
  conditionalLine("Keldran", hunt).includes("Search (Perception)"));
ok("R1b and both when the warp bought two",
  conditionalLine("Keldran", hunt).includes("Track (Survival)"));
ok("R2 the ward names its traditions",
  traditionLine("Merrick", ["arcane", "divinity"]).includes("arcane")
  && traditionLine("Merrick", ["arcane", "divinity"]).includes("divinity"));
ok("R3 a warp paid for and unused is said out loud",
  Boolean(traditionShortfallLine(wardSpec, 2, 1)));
ok("R3b and nothing is said when the count was met",
  traditionShortfallLine(wardSpec, 2, 2) === null);
ok("R4 the card explains where the advantage will be offered",
  /dialog|by hand/i.test(conditionalRemainderLine()));

/* ================================================================== *
 * P. THE FOUR SPELLS AS SHIPPED
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
const found = {};
const declarers = [];
let inertTargetWarps = 0;
try {
  await db.open();
  for await (const [, v] of db.iterator()) {
    if (v?.type !== "spell") continue;
    if (["Spirit Of The Hunt", "Courage", "Flawless Lies", "Cancel Magic"].includes(v.name)) {
      found[v.name] = v;
    }
    for (const e of v.system?.effects ?? []) {
      if (e?.kind === "conditional") declarers.push({ name: v.name, grants: e.grants ?? [] });
    }
    for (const w of v.system?.warps ?? []) {
      if (/additional (creature|target)|target an additional/i.test(String(w.text ?? ""))
        && !Object.keys(w.mods ?? {}).length) inertTargetWarps += 1;
    }
  }
} finally {
  await db.close().catch(() => {});
}

for (const [name, axis] of [
  ["Spirit Of The Hunt", "actions"], ["Courage", "traits"], ["Flawless Lies", "subjects"]
]) {
  const row = (found[name]?.system?.effects ?? []).find((e) => e.kind === "conditional");
  ok(`P1 ${name} declares a conditional`, Boolean(row));
  ok(`P1b ${name} is scoped on the right axis`,
    Boolean(row?.grants?.[0]?.when?.[axis]), JSON.stringify(row?.grants?.[0]?.when));
  ok(`P1c ${name} is no longer a note`,
    !(found[name]?.system?.effects ?? []).some((e) => e.kind === "note"));
  ok(`P1d ${name} pre-ticks where the check settles it`, row?.grants?.[0]?.auto === true);
}

const ward = (found["Cancel Magic"]?.system?.effects ?? []).find((e) => e.kind === "conditional");
ok("P2 Cancel Magic asks for a tradition rather than declaring one",
  Number(ward?.traditions) === 1 && !ward?.grants?.length,
  "\"when you cast this spell select one of the four\"");
ok("P2b and its warp buys a second pick",
  (found["Cancel Magic"]?.system?.warps ?? [])
    .some((w) => Number(w.ppCost) === 2 && Number(w.mods?.extraTraditions) === 1));
ok("P3 the Track warp is wired",
  (found["Spirit Of The Hunt"]?.system?.warps ?? [])
    .some((w) => Number(w.ppCost) === 2 && Number(w.mods?.extraConditionals) === 1));

/*
 * P4 THE WARP THIS RELEASE LEFT INERT, AND THE ONE THAT WIRED IT.
 *
 * 3.497.0 shipped Spirit Of The Hunt with its additional-target warp
 * still printed, because nothing in the system parsed or enforced a
 * spell's target count — 46 warps across the pack were in the same
 * state. This check counted them and said so.
 *
 * 3.498.0 built the cap and wired all 46, so the count is now zero and
 * this check asserts the other direction. `verify-target-count` owns the
 * rule; this one only records that the warp Spirit Of The Hunt sells is
 * no longer a sentence on a card.
 */
ok("P4 Spirit Of The Hunt's second warp now buys something",
  (found["Spirit Of The Hunt"]?.system?.warps ?? [])
    .some((w) => /additional creature/i.test(String(w.text ?? "")) && Number(w.mods?.extraTargets) === 1),
  "it was one of 46 inert additional-target warps until the cap was built");
equal("P4b and none of the 46 is inert any more", inertTargetWarps, 0,
  `${inertTargetWarps} unwired additional-target warps remain`);

/*
 * P5 IS A SET NOW, NOT A COUNT, AND 3.504.0 IS WHY.
 *
 * It read `declarers.length === 4` — every spell carrying a conditional
 * row. That was the same thing as "grants a scoped advantage" for exactly
 * as long as the only conditionals in the pack were advantages. The PP 2
 * bonus batch authored seven MODIFIER conditionals, and a bare count
 * could only say "eleven, expected four", which names neither what
 * changed nor whether it was allowed.
 *
 * So the rule is stated as what it always meant: THESE four spells grant
 * advantage, and no other declarer does. A fifth advantage spell arriving
 * quietly is a widening; a twelfth modifier spell is `verify-pp2-bonuses`
 * business, and this check stays out of its way.
 */
/*
 * AND CLARITY MADE IT FIVE AT 3.586.0, which is the widening this check
 * was reshaped to catch — arriving on purpose rather than quietly.
 *
 * "The target gains ADVANTAGE on the next mental saving throw made
 * within the spell's duration." It is the first advantage conditional
 * that is `auto`: its scope is a save against a Mental-trait effect, and
 * a trait is something the save context already carries, so there is
 * nothing left for a person to judge. The four before it all leave a
 * judgement in the dialog.
 *
 * WHAT IT DID NOT MODEL, and what changed at 3.587.0: "once the saving
 * throw is made, the spell ends". There was no consumed-on-first-use
 * channel for an advantage — `addPendingModifier` carried a VALUE — so
 * the spell ran its ten minutes and the card asked the player to dismiss
 * it. An instruction is not automation. A conditional grant now carries
 * `oneShot`, and the effect that supplied it is deleted when the
 * advantage is used; see verify-chapter10-261-270 section E, and section
 * F for what may and may not be spent.
 *
 * ADVANTAGE_FIVE, 4 → 5 AT 3.587.0: Deific Knowing (page 262) is a
 * reaction granting advantage on a Recall Knowledge (Religion) check,
 * and it was a spell with no effect rows at all until this release.
 */
// TRUE STRIKE AND TRUE TARGET JOIN AT 3.609.0 (block 33's R7) — both one-shot
// advantage on an attack, True Target's narrowed to one foe at the cast.
const ADVANTAGE_FOUR = ["Cancel Magic", "Clarity", "Courage", "Deific Knowing",
  "Flawless Lies", "Spirit Of The Hunt", "True Strike", "True Target"];
// AND THE FIRST TO GRANT DISADVANTAGE (3.609.0): Twisted Fate's Fumble,
// "disadvantage on all checks for the duration", on the target it curses.
const DISADVANTAGE_ONE = ["Twisted Fate"];
const advantageDeclarers = declarers
  .filter((d) => d.grants.some((g) => String(g?.kind) === "advantage"))
  .map((d) => d.name).sort();
ok("P5 the advantage spells are the ones declared",
  JSON.stringify(advantageDeclarers)
    === JSON.stringify(ADVANTAGE_FOUR.filter((n) => n !== "Cancel Magic")),
  `granting advantage: ${advantageDeclarers.join(", ")}`);
// P5b CANCEL MAGIC IS THE FOURTH AND CARRIES NO `grants` AT ALL — its
// ward is built from the chosen traditions at cast time, which is why it
// cannot be found by grant kind and is named here instead.
ok("P5b Cancel Magic declares its conditional through traditions",
  declarers.some((d) => d.name === "Cancel Magic" && d.grants.length === 0));
ok("P5c every other declarer grants a modifier and no advantage",
  declarers.filter((d) => !ADVANTAGE_FOUR.includes(d.name) && !DISADVANTAGE_ONE.includes(d.name))
    .every((d) => d.grants.length && d.grants.every((g) => String(g?.kind) === "modifier"))
  && DISADVANTAGE_ONE.every((n) => declarers.some((d) => d.name === n && d.grants.every((g) => String(g?.kind) === "disadvantage"))),
  `others: ${declarers.filter((d) => !ADVANTAGE_FOUR.includes(d.name) && !DISADVANTAGE_ONE.includes(d.name))
    .map((d) => `${d.name}[${d.grants.map((g) => g?.kind).join("/")}]`).join(", ")}`);

if (failures.length) {
  process.stderr.write(`verify-spell-conditionals: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-spell-conditionals: OK — ${checks} checks. Five spells grant advantage through the `
  + "machinery that already held the rule, validated by the collector's own function.\n");
