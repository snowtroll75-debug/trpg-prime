#!/usr/bin/env node
/**
 * verify-attitude — the NPC attitude ladder.
 *
 * NEW at 3.408.0. The ladder was printed across seven spells and four
 * skill actions and modelled nowhere; every one of them printed a
 * sentence and changed nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  ATTITUDE_STEPS, DEFAULT_ATTITUDE, ATTITUDE_FLAG, isAttitude, attitudeIndex, shiftAttitude,
  attitudeToward, withAttitude, applyAttitudeShift, attitudeAtLeast, attitudeAtMost, ATTITUDE_GATES, attitudeGateFor, attitudeKey,
  TEMP_ATTITUDE_FLAG, temporaryAttitude, withTemporaryAttitude, prunedTemporaryAttitudes,
  effectiveAttitude, charmedTo } from "../module/attitude.mjs";
import { extractAttitudeShift } from "../module/effect-parser.mjs";

let checks = 0;
const failures = [];
const ok = (l, c, d = "") => { checks += 1; if (!c) failures.push(`${l}${d ? ` — ${d}` : ""}`); };

// REAL UUID SHAPES, dots and all. The first version of this file used
// "Actor.bard" and still missed the live defect, because the checks only
// ever round-tripped through the pure functions — which were correct.
// The break was at the Foundry boundary, where `setFlag` expands a dotted
// key into nested objects. These now assert the KEY is safe to store.
const BARD = "Actor.0gyM3hQqfaYeJaO6";
const PALADIN = "Scene.tJ5Uj7fe0m77LRrd.Token.AuV5NCzVqu7U1NTm.Actor.RqYycHpRX67NaWYX";

/* A. The ladder is the book's, in the book's words
 *
 * A2-A4 SAID THE OPPOSITE UNTIL 3.559.0, and were wrong in exactly the
 * way they warned against. The ladder was read off the Tame spell before
 * page 82 had been audited; page 82's CHANGING ATTITUDES section is the
 * only place that DEFINES all five, and it says "Indifferent ... the
 * default starting attitude for most NPC's". Graham's ruling R1 of
 * 16 September 2026: Indifferent is canonical, Tame's wording is errata,
 * and "neutral" stays readable so saved creature data still resolves.
 */
ok("A1 five rungs", ATTITUDE_STEPS.length === 5);
ok("A2 in order, worst to best",
  ATTITUDE_STEPS.join(",") === "hostile,unfriendly,indifferent,friendly,helpful",
  "page 82 names all five in order");
ok("A3 the middle rung is INDIFFERENT",
  ATTITUDE_STEPS[2] === "indifferent",
  "page 82 defines the ladder; the Tame spell's 'neutral' is errata");
ok("A3b and it is the default a pair with no record sits at",
  DEFAULT_ATTITUDE === "indifferent",
  "'the default starting attitude for most NPC's'");
// THE ALIAS IS READ-ONLY, and that is the whole of the compromise: a
// creature whose sheet was written before the rename still resolves,
// and nothing writes the old word back.
ok("A3c 'neutral' still reads as that rung", attitudeIndex("neutral") === 2,
  "it was this system's own word for it, so it sits in saved data and in Tame");
ok("A3d but nothing writes it back",
  shiftAttitude("neutral", 0) === "indifferent" && shiftAttitude("neutral", 1) === "friendly",
  "the data converges on the printed word as soon as anything touches it");
ok("A4 a word that is neither rung nor alias has no index",
  attitudeIndex("aloof") === null && !isAttitude("aloof"),
  "guessing would let a vocabulary the book does not use survive in the data");
ok("A5 case and padding are tolerated", attitudeIndex("  Friendly ") === 3);

/* B. Shifting */
ok("B1 a success improves one step", shiftAttitude("neutral", 1) === "friendly");
ok("B2 a critical improves two", shiftAttitude("neutral", 2) === "helpful");
ok("B3 a failure worsens one", shiftAttitude("neutral", -1) === "unfriendly");
ok("B4 a fumble worsens two", shiftAttitude("neutral", -2) === "hostile");
// B5/B6 ARE CLAMPS, NOT WRAPS. A fumbled Coerce on an unfriendly
// creature must land on hostile, never roll over to helpful.
ok("B5 it clamps at the top", shiftAttitude("helpful", 2) === "helpful");
ok("B6 and at the bottom", shiftAttitude("unfriendly", -2) === "hostile");
ok("B7 zero moves nothing", shiftAttitude("friendly", 0) === "friendly");
ok("B8 an unknown current value falls back to the default rather than freezing",
  shiftAttitude("indifferent", 1) === "friendly");

/* C. It is RELATIONAL — Graham's ruling */
{
  let record = {};
  record = applyAttitudeShift(record, BARD, 2).record;
  record = applyAttitudeShift(record, PALADIN, -1).record;
  ok("C1 one creature holds different attitudes to different observers",
    attitudeToward(record, BARD) === "helpful" && attitudeToward(record, PALADIN) === "unfriendly",
    "the ogre can be friendly to the bard and hostile to the paladin");
  ok("C2 a pair never recorded is neutral", attitudeToward(record, "Actor.stranger") === DEFAULT_ATTITUDE,
    "a creature the party has never met is not thereby an enemy");
  ok("C2b and so is a blank observer", attitudeToward(record, "") === DEFAULT_ATTITUDE);
}

/* D. Writing */
ok("D1 a known step is stored",
  withAttitude({}, BARD, "friendly")[attitudeKey(BARD)] === "friendly");
// "aloof" RATHER THAN "indifferent" SINCE 3.559.0. These five checks all
// used indifferent as their specimen unknown word, which stopped being
// one the moment page 82 was audited and it became the middle rung.
ok("D2 an unknown step is refused", Object.keys(withAttitude({}, BARD, "aloof")).length === 0,
  "storing it would read back as the default for ever — indistinguishable from no write at all");
ok("D2b but the alias is stored as the printed word",
  withAttitude({}, BARD, "neutral")[attitudeKey(BARD)] === "indifferent",
  "read-only means read-only: nothing keeps the old spelling alive in the data");
ok("D3 a blank observer is refused", Object.keys(withAttitude({}, "", "friendly")).length === 0);
{
  const original = { [attitudeKey(BARD)]: "hostile" };
  withAttitude(original, BARD, "helpful");
  ok("D4 the stored record is never mutated", original[attitudeKey(BARD)] === "hostile",
    "a mutated read-through appears to work and vanishes on reload");
}
ok("D5 other pairs survive a write",
  withAttitude({ [attitudeKey(PALADIN)]: "hostile" }, BARD, "friendly")[attitudeKey(PALADIN)] === "hostile");

/* E. One call reports AND writes */
{
  const r = applyAttitudeShift({}, BARD, 1);
  ok("E1 it reports where it came from and went",
    r.from === "indifferent" && r.to === "friendly");
  ok("E2 and hands back the record to store", r.record[attitudeKey(BARD)] === "friendly",
    "read-then-forget-to-write is how a card announces a move that did not happen");
  ok("E3 a clamped no-op says it did not move",
    applyAttitudeShift({ [attitudeKey(BARD)]: "helpful" }, BARD, 1).moved === false);
  ok("E3b and a real move says it did", r.moved === true);
}

/* F. The gates the skill actions need */
ok("F1 Request needs friendly or helpful",
  attitudeAtLeast("friendly", "friendly") && attitudeAtLeast("helpful", "friendly")
  && !attitudeAtLeast("neutral", "friendly"));
ok("F2 Command an Animal fails at hostile or unfriendly",
  attitudeAtMost("hostile", "unfriendly") && attitudeAtMost("unfriendly", "unfriendly")
  && !attitudeAtMost("indifferent", "unfriendly"));
ok("F3 an unknown threshold gates nothing rather than everything",
  !attitudeAtLeast("helpful", "aloof") && !attitudeAtMost("hostile", "aloof"));
ok("F3b while the printed middle rung is a real threshold",
  attitudeAtLeast("helpful", "indifferent") && attitudeAtMost("hostile", "indifferent"));

/* G. The rules that want it, counted from the packs */
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let wanting = 0;
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      const text = String(value.system?.description ?? "").replace(/<[^>]+>/g, " ");
      if (/\b(attitude|disposition)\b/i.test(text)) wanting += 1;
    }
  } finally { await db.close(); }
  // A RATCHET ON DEMAND, not on supply: if a spell mentioning attitude
  // appears later, this says so rather than letting it sit unnoticed.
  ok("G1 the spells wanting an attitude are the seven measured", wanting === 7,
    `${wanting} spells mention attitude or disposition — update this file if the book grows one`);

  const actions = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "data", "skill-actions.mjs"), "utf8");
  ok("G2 the skill actions still print the steps this models",
    /attitude toward you improves by two steps/.test(actions)
    && /attitude is friendly or helpful/.test(actions),
    "if this wording changes, the model should be checked against it");
}

/* ================================================================== *
 * H. The shift is READ OFF THE PLAYER'S OWN SENTENCE
 * ================================================================== *
 *
 * Same contract as every other extractor in effect-parser.mjs: the card
 * and the effect come from one sentence, so the engine cannot move an
 * attitude the text beside it does not describe.
 */

ok("H1 improves by two steps", extractAttitudeShift("The target's attitude toward you improves by two steps.") === 2);
ok("H2 improves by one step", extractAttitudeShift("The target's attitude toward you improves by one step.") === 1);
ok("H3 decreases by one step", extractAttitudeShift("The target's attitude toward you decreases by one step.") === -1);
ok("H4 drops by two steps", extractAttitudeShift("their attitude drops by two steps, and they're immune.") === -2);

// H5 IS THE ONE THAT MATTERS MOST. Request's requirement merely MENTIONS
// attitude; reading it as a shift would move one every time anybody made
// a request.
ok("H5 a requirement is not a shift",
  extractAttitudeShift("The NPC's attitude is friendly or helpful.") === null,
  "Request's requirement line would otherwise move an attitude on every use");
ok("H6 Pariah's initial-attitude clause is not a shift either",
  extractAttitudeShift("creatures they encounter have an initial attitude toward them of one step worse") === null,
  "that is a spell effect on future encounters, not this action's outcome");
ok("H7 an unrelated sentence yields nothing",
  extractAttitudeShift("You get the information you need.") === null);

// H8: RUN IT OVER THE REAL DATA, not over sentences I typed. §5.3 — a
// check written beside the code encodes the same mistake.
{
  const sa = await import("../module/data/skill-actions.mjs");
  const table = sa.SKILL_ACTIONS ?? sa.default ?? {};
  const actions = Array.isArray(table) ? table : Object.values(table);
  const found = [];
  for (const action of actions) {
    for (const [degree, text] of Object.entries(action.outcomes ?? {})) {
      const steps = extractAttitudeShift(text);
      if (steps !== null) found.push(`${action.key}:${degree}:${steps}`);
    }
  }
  ok("H8 it finds every printed shift in the real action table", found.length === 7,
    `${found.length} found: ${found.join(", ")}`);
  ok("H8b including Make an Impression's four degrees",
    ["makeAnImpression:critical:2", "makeAnImpression:success:1",
      "makeAnImpression:failure:-1", "makeAnImpression:fumble:-2"].every((f) => found.includes(f)));
  ok("H8c and Coerce's two, and Request's fumble",
    found.includes("coerce:failure:-1") && found.includes("coerce:fumble:-2")
    && found.includes("request:fumble:-1"));
}

/* ================================================================== *
 * I. The workflow actually applies it
 * ================================================================== */
{
  const wf = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs"), "utf8");
  ok("I1 the action workflow reads the shift off the outcome",
    /const steps = extractAttitudeShift\(outcome\.text\);/.test(wf));
  ok("I2 and applies it to the TARGET, toward the actor",
    /shiftAttitudeToward\(targetActor, actor\?\.uuid \?\? "", steps\)/.test(wf),
    'every printed instance says "toward YOU"');
  ok("I3 and says so on the card",
    /attitudeLine\(targetActor\.name, moved\)/.test(wf));
  ok("I4 a clamped no-op is reported rather than silent",
    /already <strong>\$\{moved\.to\}<\/strong> toward you/.test(wf),
    "silence would read as the rule not having run");

  const awf = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "attitude-workflow.mjs"), "utf8");
  ok("I5 the workflow writes only when something moved",
    /if \(result\.moved\) await subject\.setFlag/.test(awf));
  ok("I6 and decides no rules of its own",
    !/ATTITUDE_STEPS|hostile|helpful/.test(awf.replace(/\/\*[\s\S]*?\*\//g, "")),
    "the ladder belongs to attitude.mjs; this file is bookkeeping");
}

/* ================================================================== *
 * J. The gates two actions declare
 * ================================================================== */

ok("J1 Request is refused below friendly",
  attitudeGateFor("request", "neutral").allowed === false
  && attitudeGateFor("request", "friendly").allowed === true
  && attitudeGateFor("request", "helpful").allowed === true);
ok("J2 Command an Animal fails at hostile or unfriendly",
  attitudeGateFor("commandAnAnimal", "hostile").allowed === false
  && attitudeGateFor("commandAnAnimal", "unfriendly").allowed === false
  && attitudeGateFor("commandAnAnimal", "neutral").allowed === true);
ok("J3 an ungated action is never refused",
  attitudeGateFor("makeAnImpression", "hostile").allowed === true,
  "Make an Impression on a hostile creature is the whole point of it");
ok("J4 an unrecorded pair is judged at the default",
  attitudeGateFor("request", undefined).attitude === DEFAULT_ATTITUDE);
ok("J5 both gates carry a refusal phrase for the warning",
  Object.values(ATTITUDE_GATES).every((g) => String(g.refusal ?? "").trim().length > 0));

{
  const wf = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs"), "utf8");
  ok("K1 the gate is consulted", /attitudeGateFor\(action\.key, attitudeOf\(targetActor/.test(wf));
  // K2: BEFORE THE COST. Refusing after AP is spent is the worse half of
  // a refusal — the same position the Rage and Ambush requirements take.
  const gateAt = wf.indexOf("ATTITUDE_GATES[action.key]");
  const critAt = wf.indexOf("if (modifiesCriticalResult(action.key)) {");
  ok("K2 and enforced beside the other testable requirements",
    gateAt > 0 && critAt > 0 && gateAt < critAt);
  ok("K3 it stops rather than rolling a check that cannot succeed",
    /if \(!gate\.allowed\) \{[\s\S]{0,220}return null;/.test(wf));
  ok("K4 and only when there is a target to have an attitude",
    /if \(targetActor && ATTITUDE_GATES\[action\.key\]\)/.test(wf),
    "a targetless invocation stays the GM's call, as it always was");
}

/* ================================================================== *
 * L. The stored key survives Foundry
 * ================================================================== *
 *
 * FOUND LIVE AT 3.408.0. `setFlag` expands a dotted key into nested
 * objects, and every uuid is full of dots. The write appeared to work,
 * the card correctly announced the change from the in-memory result, and
 * the attitude was unreadable for ever afterwards.
 */

ok("L1 a key carries no dots for setFlag to expand",
  !attitudeKey(BARD).includes("."),
  'stored raw, "Actor.x" became { Actor: { x: … } } and no read ever found it');
ok("L2 a token uuid is safe too", !attitudeKey(PALADIN).includes("."),
  "a token actor's uuid has five dots in it");
ok("L3 distinct uuids keep distinct keys", attitudeKey(BARD) !== attitudeKey(PALADIN));
ok("L4 the key is stable", attitudeKey(BARD) === attitudeKey(BARD));
ok("L5 a blank uuid makes a blank key", attitudeKey("") === "" && attitudeKey(null) === "");

// L6 IS THE ROUND TRIP THROUGH THE STORED SHAPE — what the old checks
// never did, because they only ever asked the pure functions.
{
  const stored = withAttitude({}, BARD, "helpful");
  ok("L6 the record's own key is the dot-free one",
    Object.keys(stored)[0] === attitudeKey(BARD)
    && !Object.keys(stored)[0].includes("."),
    `stored as ${JSON.stringify(stored)}`);
  ok("L6b and reads back", attitudeToward(stored, BARD) === "helpful");
  ok("L6c while a different observer still reads the default",
    attitudeToward(stored, PALADIN) === DEFAULT_ATTITUDE);
}

/* ================================================================== *
 * M. Temporary attitude — a spell wears off, a conversation does not
 * ================================================================== *
 *
 * MEASURED, NOT ASSUMED: all six spells that change an attitude change
 * it for a while — 1 minute to 24 hours to unlimited. Make an Impression
 * is the odd one out and stays permanent.
 */

ok("M1 the two layers are separate flags", TEMP_ATTITUDE_FLAG !== ATTITUDE_FLAG);

{
  const temp = withTemporaryAttitude({}, BARD, "helpful", 600);
  ok("M2 it holds while in force", temporaryAttitude(temp, BARD, 599) === "helpful");
  ok("M3 and lapses on the tick", temporaryAttitude(temp, BARD, 600) === null);
  ok("M4 an unknown step is refused", Object.keys(withTemporaryAttitude({}, BARD, "aloof", 60)).length === 0);
  ok("M5 a dot-free key here too", !Object.keys(temp)[0].includes("."),
    "the same setFlag trap, one layer along");

  // M6 IS THE WHOLE DESIGN. A charm wearing off must not erase the
  // conversation underneath it.
  const base = withAttitude({}, BARD, "friendly");
  ok("M6 a live spell wins over the base",
    effectiveAttitude(base, temp, BARD, 100) === "helpful");
  ok("M6b and when it lapses the base is still there",
    effectiveAttitude(base, temp, BARD, 9999) === "friendly",
    "charming someone must not make them forget you impressed them");
  ok("M6c with no base and no spell, the default",
    effectiveAttitude({}, {}, BARD, 0) === DEFAULT_ATTITUDE);
}

// M7: THRALL'S FUMBLE — "the duration is unlimited".
{
  const forever = withTemporaryAttitude({}, BARD, "helpful", null);
  ok("M7 a null expiry never lapses", temporaryAttitude(forever, BARD, 1e9) === "helpful");
  ok("M7b and survives pruning", Object.keys(prunedTemporaryAttitudes(forever, 1e9)).length === 1);
}
ok("M8 pruning drops what has expired",
  Object.keys(prunedTemporaryAttitudes(withTemporaryAttitude({}, BARD, "helpful", 10), 99)).length === 0,
  "a flag that only grows grows for ever");

/* ================================================================== *
 * N. The charm sentence five spells share
 * ================================================================== *
 *
 * "becomes friendly toward you. If it was friendly, it becomes helpful."
 * Neither a set nor a shift.
 */

ok("N1 a hostile creature is raised to the named rung", charmedTo("hostile", "friendly") === "friendly",
  "a SHIFT would leave it merely unfriendly");
ok("N2 as is a neutral one", charmedTo("neutral", "friendly") === "friendly");
ok("N3 one already there goes one better", charmedTo("friendly", "friendly") === "helpful");
ok("N4 and a helpful one is not downgraded", charmedTo("helpful", "friendly") === "helpful",
  "a SET would knock it back to friendly, which the text plainly does not intend");
ok("N5 a helpful floor works too", charmedTo("indifferent", "helpful") === "helpful");
ok("N6 an unknown floor changes nothing", charmedTo("indifferent", "aloof") === "indifferent");

/* ================================================================== *
 * O. The spells
 * ================================================================== */
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  const spells = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && value?.type === "spell") {
        spells.set(String(value.name).trim().toLowerCase(), value);
      }
    }
  } finally { await db.close(); }

  let wired = 0;
  for (const spell of spells.values()) {
    for (const effect of spell.system?.effects ?? []) {
      if (effect.kind !== "attitude") continue;
      wired += 1;
      const floor = String(effect.to ?? "").trim().toLowerCase();
      ok(`O1 "${spell.name}" names a real attitude or a step`,
        (floor ? isAttitude(floor) : Number(effect.steps ?? 0) !== 0),
        JSON.stringify(effect));
      ok(`O2 "${spell.name}" does not declare both`,
        !(floor && Number(effect.steps ?? 0)),
        "a charm and a shift are different operations");
    }
  }
  // O3: NINE ROWS ACROSS SIX SPELLS. I first wrote 8 here and the check
  // corrected my arithmetic: Tame 1 + Charm Kind/Animal/Undead 3 +
  // Alluring Caress 2 + Thrall 3. A ratchet is only useful if the number
  // comes from counting rather than from the author's confidence.
  // 9 -> 11 at 3.586.0 (PAGES 251-260). Charm Animal and Charm Kind each
  // gained a SECOND row rather than a new spell: their pages print a
  // Failure that makes the target friendly and a Fumble that makes it
  // helpful, and one ungated row could only ever apply one of the two.
  // The count going up by exactly two is what says the ladders were
  // authored as ladders.
  // 11 -> 12 at 3.611.0 (PAGES 341-350). Charm Undead gained its second
  // row the same way: its Fumble is "helpful", which the one ungated
  // friendly row could not say.
  ok("O3 exactly the rows this release wired are present", wired === 12,
    `${wired} attitude rows across six spells`);

  // O4: PARIAH IS DELIBERATELY ABSENT. Its effect is on the attitude
  // creatures the target LATER MEETS start at — a third-party initial
  // attitude, not an attitude toward the caster — and nothing models it.
  ok("O4 Pariah is not wired",
    !(spells.get("pariah")?.system?.effects ?? []).some((e) => e.kind === "attitude"),
    "wiring it as a charm toward the caster would be the wrong rule entirely");

  // O5: THRALL'S THREE DURATIONS, the reason per-effect duration exists.
  const thrall = (spells.get("thrall")?.system?.effects ?? []).filter((e) => e.kind === "attitude");
  ok("O5 Thrall's degrees carry different spans",
    thrall.find((e) => (e.onSave ?? []).includes("success"))?.duration === "10 minutes"
    && thrall.find((e) => (e.onSave ?? []).includes("failure"))?.duration === "24 hours"
    && thrall.find((e) => (e.onSave ?? []).includes("fumble"))?.duration === undefined,
    JSON.stringify(thrall.map((e) => [e.onSave, e.duration])));

  // O6: CHARM UNDEAD'S SAVE GATE — a successful save takes nothing.
  const undead = (spells.get("charm undead")?.system?.effects ?? []).find((e) => e.kind === "attitude");
  ok("O6 Charm Undead does not charm on a success",
    !(undead?.onSave ?? []).includes("success") && (undead?.onSave ?? []).includes("failure"),
    "critical and success are both printed as unaffected");
}

/* ================================================================== *
 * P. The applier
 * ================================================================== */
{
  const fx = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
  ok("P1 the applier handles the attitude kind", /case "attitude": \{/.test(fx));
  // P2 IS THE BUG I NEARLY SHIPPED. Tame's step went through the
  // PERMANENT writer, so a 1-minute cantrip would have changed an
  // animal's mind for good.
  ok("P2 a spell's step is temporary, not permanent",
    /charmAttitudeByStep\(target/.test(fx) && !/shiftAttitudeToward\(target/.test(fx),
    "a spell wears off; only a conversation changes someone permanently");
  ok("P3 it refuses an attitude the ladder does not know",
    /if \(floor && !isAttitude\(floor\)\)/.test(fx));
  ok("P4 and a row that declares neither operation",
    /if \(!floor && !steps\)/.test(fx));

  const awf = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "attitude-workflow.mjs"), "utf8");
  ok("P5 both operations share one temporary writer",
    (awf.match(/setTemporaryAttitude\(/g) ?? []).length >= 3,
    "two callers writing one flag their own way is the markerFlagData shape");
  ok("P6 the reader asks both layers",
    /effectiveAttitude\(/.test(awf),
    "a gate reading only the base would ignore every live charm");
}

process.stdout.write(`verify-attitude: ${checks} checks\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
