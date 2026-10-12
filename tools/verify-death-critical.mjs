#!/usr/bin/env node
/**
 * verify-death-critical — the rows that say the target dies.
 *
 * NEW at 3.457.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOURTEEN ROWS SAID "TARGET DIES INSTANTLY" AND NOBODY DIED.
 *
 * Graham, 1 September 2026, reporting a previous ruling that had not
 * taken: an NPC should leave the initiative tracker the moment it dies,
 * "so Dying exceeds death state OR death is gained through critical".
 *
 * THE FIRST HALF ALREADY WORKED and was confirmed live in the same
 * session: pushing Dying to 6 against Death State 5 removed the
 * combatant, applied the skull and posted a Death card. The second half
 * had never been built — the critical tables carry a structured
 * `persistence` of "Death" or "Fatal", `deathOrFatalSave` computed the
 * save and DC, and the workflow then PRINTED the sentence and reduced
 * the target to 0 HP. "Skull obliterated. Target dies instantly." left a
 * creature at Dying 1, upright, still taking turns.
 *
 * GRAHAM'S THREE RULINGS: roll the save and kill on failure; automate
 * the printed −10 re-look-up on a success; and apply it to player
 * characters too, because the rule is the rule.
 *
 * SECTION R IS THE ONE THAT MATTERS, and it is the lesson this session
 * learned twice already: not "does the code exist" but "is it REACHED".
 * The Shatter formula and the hazard recording both existed and both did
 * nothing.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { deathCriticalOutcome, isDead, needsReaping } from "../module/combat/death-state.mjs";
import { deathOrFatalSave, lookupTableRow } from "../module/combat/attack.mjs";
import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";

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
function before(hay, a, b) {
  const i = hay.indexOf(a); const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}
function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  let cursor = start + signature.length - 1;
  if (src[cursor] === "(") {
    let parens = 0;
    for (; cursor < src.length; cursor += 1) {
      if (src[cursor] === "(") parens += 1;
      else if (src[cursor] === ")") { parens -= 1; if (parens === 0) break; }
    }
  }
  const open = src.indexOf("{", cursor);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  return "";
}

/* ================================================================== *
 * D. THE DATA — the rows that say somebody dies
 * ================================================================== */

const deadly = [];
for (const [type, table] of Object.entries(CRITICAL_TABLES)) {
  for (const row of table ?? []) {
    if (/death|fatal/i.test(String(row?.persistence ?? ""))) deadly.push({ type, row });
  }
}
ok("D1 the tables carry Death and Fatal rows", deadly.length >= 14,
  `${deadly.length} found`);
// THE PROSE AND THE FIELD MUST AGREE. A row that says the target dies and
// carries no Death/Fatal persistence would be invisible to this whole
// mechanism — and one that carries the persistence without saying so
// would kill for no printed reason.
const saysDies = [];
for (const [type, table] of Object.entries(CRITICAL_TABLES)) {
  for (const row of table ?? []) {
    if (/\b(dies|is dead|instant death|brain-dead)\b/i.test(String(row?.effect ?? ""))) {
      saysDies.push({ type, row });
    }
  }
}
ok("D2 EVERY ROW WHOSE PROSE KILLS CARRIES THE FIELD THAT KILLS",
  saysDies.every(({ row }) => /death|fatal/i.test(String(row.persistence ?? ""))),
  saysDies.filter(({ row }) => !/death|fatal/i.test(String(row.persistence ?? "")))
    .map(({ row }) => String(row.effect).slice(0, 40)).join(" | "));
// THE FIRST DRAFT ASSERTED `min >= 99` AND FAILED, because electricity
// and sonic both carry a Death row at 96-98. The data was right and my
// assumption was wrong, so the claim is now structural rather than a
// threshold I picked: a Death row is always ABOVE every non-Death row in
// its own table. That is true whatever numbers a future table uses.
for (const [type, table] of Object.entries(CRITICAL_TABLES)) {
  const deathMins = (table ?? []).filter((r) => /death/i.test(String(r.persistence ?? "")))
    .map((r) => Number(r.min));
  if (!deathMins.length) continue;
  const otherMax = Math.max(...(table ?? [])
    .filter((r) => !/death/i.test(String(r.persistence ?? "")))
    .map((r) => Number(r.min)));
  ok(`D3 ${type}: every Death row sits above every other row`,
    Math.min(...deathMins) > otherMax,
    "instant death is the top of a table, not a mid-table result");
}

/* ================================================================== *
 * S. THE SAVE
 * ================================================================== */

const deathRow = deadly.find(({ row }) => /death/i.test(row.persistence));
const fatalRow = deadly.find(({ row }) => /fatal/i.test(row.persistence));
ok("S1 a Death row offers a save", Boolean(deathOrFatalSave(deathRow.row, "slashing", 20)));
ok("S2 Death is harder to resist than Fatal",
  deathOrFatalSave(deathRow.row, "slashing", 20).dc
    > deathOrFatalSave(fatalRow.row, "slashing", 20).dc,
  "Very Hard (+5) against Hard (+2), on the same Injury DC");
ok("S3 a mental critical is resisted with Will",
  deathOrFatalSave(deathRow.row, "mental", 20).save === "will"
  && deathOrFatalSave(deathRow.row, "fire", 20).save === "fortitude");
ok("S4 an ordinary row offers none",
  deathOrFatalSave({ persistence: "M", effect: "A scratch." }, "slashing", 20) === null);

/* ================================================================== *
 * O. THE OUTCOME — Graham's rulings
 * ================================================================== */

const save = deathOrFatalSave(deathRow.row, "slashing", 20);
ok("O1 A FAILED SAVE KILLS",
  deathCriticalOutcome(save, save.dc - 1, 100).died === true,
  "Graham, 1 Sep 2026: roll the save, kill on failure");
ok("O2 a made save does not",
  deathCriticalOutcome(save, save.dc, 100).died === false);
ok("O3 and lowers the result by ten",
  deathCriticalOutcome(save, save.dc, 100).newResult === 100 - save.reduction);
// A LOWERED RESULT MUST STILL BE A RESULT. Floor at 1 so the re-look-up
// cannot ask the table for a row below its own range.
ok("O4 the lowered result never falls off the table",
  deathCriticalOutcome(save, save.dc, 5).newResult === 1);
ok("O5 no save row is left alone entirely",
  deathCriticalOutcome(null, 99, 100).applies === false);
// A ROLL THAT COULD NOT HAPPEN IS NOT A RESCUE. Treating a missing total
// as a pass would make the deadliest row in the game safer when
// something goes wrong.
ok("O6 A SAVE THAT COULD NOT BE ROLLED IS A FAILED SAVE",
  deathCriticalOutcome(save, NaN, 100).died === true
  && deathCriticalOutcome(save, undefined, 100).died === true);
// THE RE-LOOK-UP LANDS SOMEWHERE REAL.
const lowered = deathCriticalOutcome(save, save.dc, 100).newResult;
const row = lookupTableRow(CRITICAL_TABLES.slashing, lowered);
ok("O7 and the lowered result names a real row",
  Boolean(row?.effect) && !/death/i.test(String(row.persistence ?? "")),
  "the point of the save is to land on something survivable");

/* ================================================================== *
 * R. IS IT REACHED?
 * ================================================================== */

const flow = strip(read("module", "combat", "attack-workflow.mjs"));
const critBody = bodyOf(flow, "export async function rollCriticalInjury(");
ok("R0 the critical routine's body was found", critBody.length > 0);
// `{ ...row, persistence }` since 3.580.0: an armour clause may rewrite
// the Persistence column (page 204, Graham's R9 of 21 September 2026),
// and the Death/Fatal test has to read what this target actually got.
ok("R0b and reaches its real code",
  critBody.includes("deathOrFatalSave({ ...row, persistence }, damageType, attackBonus)"));

ok("R1 THE SAVE IS ROLLED, NOT JUST PRINTED",
  critBody.includes("const saveRoll = await TRGCheck.roll({"),
  "printing the DC and applying nothing is exactly what shipped for months");
ok("R2 and the outcome decides what happens",
  critBody.includes("const verdict = deathCriticalOutcome(save, saveRoll?.total, result);"));
ok("R3 A FAILURE PUSHES DYING PAST THE DEATH STATE",
  critBody.includes("const deadAt = actorDeathState(targetActor) + 1;") && critBody.includes("targetActor.toggleStatusEffect(\"dying\", { value: deadAt }));"),
  "the system has no separate dead condition; this is how the Dying Check kills too");
ok("R4 AND REAPS, which is what Graham asked for",
  critBody.includes("const reaped = targetActor.isOwner ? await reapDead(targetActor, game.combat ?? null) : { removed: false };"),
  "\"immediately removed from the initiative tracker\"");
ok("R4b the removal is announced",
  critBody.includes("Removed from the initiative order."),
  "a token vanishing with no card is indistinguishable from a bug");
ok("R5 the kill happens after the save, not before it",
  before(critBody, "deathCriticalOutcome(save, saveRoll?.total, result)", "reapDead(targetActor"),
  "a result applied before the roll that prevents it");
ok("R6 a made save re-looks-up the lowered result",
  critBody.includes("const lowered = lookupTableRow(table, verdict.newResult);"),
  "the printed rule, which the card used to hand to a GM");
// THE OLD CARD PROMISED NOTHING AND DELIVERED NOTHING.
ok("R7 AND THE CARD NO LONGER SAYS IT IS UNAUTOMATED",
  !critBody.includes("isn't automated yet"),
  "that sentence was true for months and is now false");

/* ================================================================== *
 * K. THE REAPER ITSELF, which the first half already relied on
 * ================================================================== */

// THE STUB ANSWERS PER CONDITION. The first draft returned one number
// for every key, so `actorDeathState` read the Dying value as DOOMED,
// dropped the effective Death State to 0, and a creature at Dying 5
// reported dead. A stub that cannot tell two questions apart tests
// neither.
const creature = (dying, doomed = 0, deathState = 5) => ({
  getConditionValue: (k) => (k === "dying" ? dying : k === "doomed" ? doomed : 0),
  system: { combat: { deathState } }
});
ok("K1 a creature past its Death State is dead", isDead(creature(6)) === true);
ok("K2 one AT it is not", isDead(creature(5)) === false,
  "the rule is \"exceeds\", not \"reaches\"");
// DOOMED LOWERS THE BAR, which is the whole reason `actorDeathState`
// exists rather than reading the field directly.
ok("K2b and Doomed brings death closer", isDead(creature(4, 2)) === true);
/*
 * K4 IS THE RACE, found by driving the very first Death critical.
 *
 * The critical path pushes Dying past the Death State and then reaps;
 * that condition write also wakes the death watch, which reaps too. Both
 * read the combatant list before either delete landed, and the loser got
 * `Combatant "..." does not exist!` — thrown out of `rollCriticalInjury`
 * and abandoning everything the critical had left to do. The creature
 * died correctly and the attack fell over on its way out.
 *
 * The death watch's own `inFlight` set cannot cover it: that is private
 * to its module and guards only its own re-entry, so a direct caller
 * walks past it. The defence has to sit where the delete happens.
 */
const reaper = strip(read("module", "combat", "death-state.mjs"));
// TWO BODIES SINCE 3.459.0. `reapDead` is now a per-actor lock around
// `reapDeadInner`, which does the writing — so a claim about the delete
// must read the inner one and a claim about the lock must read the outer.
// Pointing both at the wrapper is how this file first broke.
const reapOuter = bodyOf(reaper, "export async function reapDead(");
const reapBody = bodyOf(reaper, "async function reapDeadInner(");
ok("K4 the reaper's bodies were found", reapOuter.length > 0 && reapBody.length > 0);
ok("K4b IT RE-READS THE COLLECTION BEFORE DELETING",
  reapBody.includes("const live = combatants.filter((c) => encounter.combatants?.get?.(c.id));"),
  "the list was gathered before the other reaper's delete landed");
ok("K4c and a lost race cannot throw into the caller",
  reapBody.includes("await encounter.deleteEmbeddedDocuments(\"Combatant\", live.map((c) => c.id));")
  && /catch \(error\) \{[\s\S]{0,220}console\.debug/.test(reapBody),
  "a thrown delete abandoned the rest of the attack card");
ok("K4d and `removed` still reports only what this call did",
  reapBody.includes("out.removed = true;")
  && before(reapBody, "await encounter.deleteEmbeddedDocuments", "out.removed = true;"),
  "so the death announcement is made exactly once");

/*
 * K5 IS THE OTHER HALF OF THE RACE, and I got it wrong twice before
 * getting it right.
 *
 * 3.457.1 stopped the two reapers throwing over one combatant. The SAME
 * race was still doubling the SKULL: from a clean actor, one Death
 * critical produced ["Dying 6", "Dead", "Dead"], three times out of
 * three. `statuses.has("dead")` is a check followed by a write and the
 * two reapers interleave between them.
 *
 * I HAD REPORTED IT AS NOT REPRODUCIBLE. That was measured on the plain
 * Dying route, which has only ONE reaper — the guard does hold there.
 * The critical path is the one with two, and it was the path Graham's
 * report was about. Testing the easy route and generalising from it is
 * the error worth remembering.
 */
ok("K5 THE REAP IS SERIALISED PER ACTOR",
  // SHARED SINCE 3.630.1: the second reaper awaits the first and reports its spare.
  reapOuter.includes("if (key && reaping.has(key)) {") && reapOuter.includes("const shared = await reaping.get(key)") && reaper.includes("const reaping = new Map();"),
  "one Death critical drew two skulls, three times out of three");
ok("K5b keyed on the token where there is one",
  reapOuter.includes("const key = actor.token?.id ?? actor.id ?? null;"),
  "four goblins from one statblock share an actor id");
ok("K5c and the key is always released",
  /finally \{[\s\S]{0,120}reaping\.delete\(key\)/.test(reapOuter),
  "a key left behind would silence every later death for that actor");

ok("K3 and reaping is owed once",
  needsReaping(true, false) === true && needsReaping(true, true) === false);

if (failures.length) {
  process.stderr.write(`verify-death-critical: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-death-critical: OK — ${checks} checks. The save is rolled, a failure kills, `
  + `and the corpse leaves the tracker.\n`);
