#!/usr/bin/env node
/**
 * verify-flat-ladder — four printed outcomes with no dice in them.
 *
 * NEW at 3.485.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS OFF THE FLAT-DAMAGE BACKLOG — AND A HYPOTHESIS THAT WAS
 * WRONG.
 *
 * I proposed these two together on the guess that they shared a
 * mechanism. Reading them settled it: Serenity is a standing curse that
 * repeats a fixed penalty; Word Of Death is instant death gated on a
 * hit-point threshold. What they share is the SHAPE the prisons already
 * established — four printed outcomes, worse rolls costing more — and
 * that is all that is factored out. Recorded because the guess was
 * cheap and reading was what corrected it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE CHECKS THAT CARRY THE DESIGN.
 *
 *   T3  THE THRESHOLD IS ASKED BEFORE THE DROP, and the boundary is
 *       inclusive. "If the target has 100 HP or fewer, it dies
 *       instantly; OTHERWISE it drops to -10" — a creature on exactly
 *       100 dies. Off by one here is the difference between a dead PC
 *       and a living one.
 *
 *   S2  A CRITICAL RUNG OF ZERO IS A REAL ANSWER. Serenity's Critical is
 *       "unaffected", which is a decided outcome; a MISSING rung is one
 *       nobody decided, and the parser refuses that.
 *
 *   O2  AID DEFENSIVE AND ESCAPE ARE NOT OFFENSIVE. Both carry the
 *       attack trait — measured, 14 of 31 basic actions do — and
 *       neither is an offensive action. Graham's ruling of 4 September
 *       2026 is the attack trait MINUS these.
 */
import path from "node:path";
import { ClassicLevel } from "classic-level";
import fs from "node:fs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  FLAT_DEGREES, flatDegree, normaliseFlatLadder, flatOutcome, flatResolution,
  isOffensiveAction, NOT_OFFENSIVE, flatLadderLine, flatOutcomeLine, flatCurseLine
} from "../module/magic/flat-ladder.mjs";
import { DEGREES } from "../module/dice/resolution.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const strip = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const WOD = {
  kind: "flatLadder", label: "Word Of Death", damageType: "untyped", save: "Will", immuneSeconds: 600,
  ladder: { critical: { damage: 20 }, success: { damage: 50, diesIfReducedToZero: true },
    failure: { diesAtOrBelow: 100, dropsTo: -10 }, fumble: { dies: true } }
};
const SER = {
  kind: "flatLadder", label: "Serenity", damageType: "mental", save: "Will",
  repeatsOnOffensiveAction: true,
  ladder: { critical: { damage: 0 }, success: { damage: 5 },
    failure: { damage: 10, criticalInjury: true, criticalModifier: -20 },
    fumble: { damage: 10, criticalInjury: true } }
};
const wod = normaliseFlatLadder(WOD);
const ser = normaliseFlatLadder(SER);

/* ── R. THE ROW ──────────────────────────────────────────────────── */
ok("R1 both well-formed rows normalise", wod !== null && ser !== null);
ok("R2 a row of another kind is not one", normaliseFlatLadder({ ...WOD, kind: "prison" }) === null);
/*
 * S2 — ZERO IS A DECISION, ABSENT IS A GAP.
 */
ok("S2 A CRITICAL RUNG OF ZERO IS ACCEPTED", flatOutcome(ser, "critical").damage === 0,
  "Serenity's Critical is \"unaffected\" — a decided outcome");
for (const degree of FLAT_DEGREES) {
  const gapped = { ...SER, ladder: { ...SER.ladder } };
  delete gapped.ladder[degree];
  ok(`R3 but a MISSING "${degree}" rung is refused`, normaliseFlatLadder(gapped) === null,
    "a rung nobody decided is not a rung of zero");
}
ok("R4 a damage type is required", normaliseFlatLadder({ ...WOD, damageType: "" }) === null);
ok("R5 the repeat is declared, not inferred from a duration",
  ser.repeatsOnOffensiveAction === true && wod.repeatsOnOffensiveAction === false);
ok("R6 the immunity is carried in seconds", wod.immuneSeconds === 600 && ser.immuneSeconds === 0);

/* ── D. SEVEN ROLLED DEGREES, FOUR PRINTED ───────────────────────── */
ok("D1 every rolled degree maps to a printed one",
  DEGREES.every((d) => FLAT_DEGREES.includes(flatDegree(d.key))));
ok("D2 and it is the prisons' ruling, not a second copy",
  flatDegree("heroic") === "critical" && flatDegree("partial") === "failure"
  && flatDegree("blunder") === "fumble",
  "imported from prison.mjs so one ruling cannot drift into two");

/*
 * ─────────────────────────────────────────────────────────────────────
 * D3-D5 EXIST BECAUSE D1 AND D2 PASSED WHILE THE MAPPING WAS DEAD CODE.
 *
 * At 3.485.0 `flatDegree` was correct, imported from the one place the
 * ruling lives, and asserted twice — by these two checks, which were its
 * ONLY callers. Production fetched rungs with the RAW rolled degree, so
 * heroic, partial and blunder matched nothing and `applyFlatLadder`
 * returned an empty array in silence. A live blunder on Word Of Death
 * did nothing at all while a fumble killed outright.
 *
 * D1 and D2 test the RULE. These test that the rule is REACHED, through
 * the door every caller uses. It is the same lesson this project keeps
 * relearning — a check that a name exists is not a check that a branch
 * runs — and `verify-rules-have-callers` cannot catch this shape,
 * because a verifier is itself a caller. A test is not a use.
 */
ok("D3 A ROLLED DEGREE FETCHES A RUNG — the mapping is inside the door",
  flatOutcome(wod, "blunder") === wod.ladder.fumble
  && flatOutcome(wod, "heroic") === wod.ladder.critical
  && flatOutcome(ser, "partial") === ser.ladder.failure,
  "3.485.0 shipped with heroic, partial and blunder matching no rung at all");
ok("D4 EVERY rolled degree fetches one, for both spells",
  DEGREES.every((d) => flatOutcome(wod, d.key) && flatOutcome(ser, d.key)),
  "seven degrees are rolled; four are printed; none may fall through");
ok("D5 and a printed degree still fetches itself — the mapping is idempotent",
  FLAT_DEGREES.every((d) => flatOutcome(wod, d) === wod.ladder[d]));
ok("D6 something that is not a degree still fetches nothing",
  flatOutcome(wod, "banana") === null && flatOutcome(wod, "") === null);

/*
 * ─────────────────────────────────────────────────────────────────────
 * D7 — THE NORMALISER MUST SURVIVE ITS OWN OUTPUT.
 *
 * A repeating curse stores its NORMALISED ladder on the target and
 * re-normalises it on every bite. At 3.485.0 the absent-field test read
 * `undefined` only, so the `null`s the first pass wrote came back as
 * present values and `int(null)` is 0: "no death threshold" became "a
 * threshold of 0". Serenity — worst rung 10 Mental — bit a creature on
 * 50 HP and printed "drops to 0 HP".
 *
 * Asserted as a ROUND TRIP rather than as a property of one field,
 * because the next field added to a rung has the same trap waiting.
 */
{
  const round = normaliseFlatLadder({ ...SER, ladder: ser.ladder });
  ok("D7 NORMALISING A NORMALISED LADDER CHANGES NOTHING",
    JSON.stringify(round?.ladder) === JSON.stringify(ser.ladder),
    "a curse re-reads its own stored ladder on every bite");
  const bitten = flatResolution(flatOutcome(round, "fumble"), 50);
  ok("D8 so a stored Serenity still deals its damage, not a drop to zero",
    bitten.damage === 10 && bitten.finalHP === null && bitten.dies === false,
    "the round trip once turned 10 Mental into fifty hit points");
  const wodRound = normaliseFlatLadder({ ...WOD, ladder: wod.ladder });
  ok("D9 and Word Of Death's real threshold survives the same trip",
    flatOutcome(wodRound, "failure").diesAtOrBelow === 100
    && flatOutcome(wodRound, "failure").dropsTo === -10);
}

/* ── T. WORD OF DEATH'S THRESHOLD ────────────────────────────────── */
/*
 * T3 IS THE ONE THAT KILLS A PC BY ACCIDENT. "100 HP or fewer" includes
 * 100, and the threshold is asked BEFORE the drop.
 */
ok("T1 a fumble kills whatever the hit points",
  flatResolution(flatOutcome(wod, "fumble"), 999).dies === true);
ok("T2 a critical is 20 damage and nothing else",
  flatResolution(flatOutcome(wod, "critical"), 60).damage === 20
  && flatResolution(flatOutcome(wod, "critical"), 60).dies === false);
ok("T3 THE THRESHOLD INCLUDES ITS OWN BOUNDARY",
  flatResolution(flatOutcome(wod, "failure"), 100).dies === true
  && flatResolution(flatOutcome(wod, "failure"), 101).dies === false,
  "\"100 HP or fewer\" — exactly 100 dies");
ok("T4 and above it they drop to the stated total, not to zero",
  flatResolution(flatOutcome(wod, "failure"), 101).finalHP === -10);
/*
 * T5 — SUCCESS APPLIES THE DAMAGE FIRST. "50 damage; IF THIS BRINGS the
 * target to 0 HP" — the death follows from the result, not from the
 * starting total, so a creature on 60 survives and one on 50 does not.
 */
ok("T5 SUCCESS KILLS ONLY IF ITS OWN DAMAGE GETS THERE",
  flatResolution(flatOutcome(wod, "success"), 60).dies === false
  && flatResolution(flatOutcome(wod, "success"), 50).dies === true
  && flatResolution(flatOutcome(wod, "success"), 40).dies === true,
  "the death is a consequence of the damage, not of the starting HP");
/*
 * T5b USES A DIFFERENT DAMAGE VALUE ON PURPOSE. With Word Of Death's own
 * 50, "after <= 0" and "starting HP <= 50" are the SAME RULE, so a
 * mutation swapping one for the other changed nothing and survived. The
 * two only diverge when the rung's damage is not 50 — measured here at
 * 30, where a creature on 40 must live.
 */
{
  const other = normaliseFlatLadder({
    ...WOD, ladder: { ...WOD.ladder, success: { damage: 30, diesIfReducedToZero: true } }
  });
  ok("T5b AND THE THRESHOLD IS THE DAMAGE, NOT A FIXED NUMBER",
    flatResolution(flatOutcome(other, "success"), 40).dies === false
    && flatResolution(flatOutcome(other, "success"), 30).dies === true,
    "at 30 damage a creature on 40 survives; a fixed 50 would kill them");
}

/* ── S. SERENITY ─────────────────────────────────────────────────── */
ok("S1 the ladder is the printed one",
  flatOutcome(ser, "success").damage === 5 && flatOutcome(ser, "failure").damage === 10
  && flatOutcome(ser, "fumble").damage === 10);
ok("S3 a failure carries a critical injury at -20",
  flatOutcome(ser, "failure").criticalInjury === true
  && flatOutcome(ser, "failure").criticalModifier === -20);
ok("S4 and a fumble's carries no modifier",
  flatOutcome(ser, "fumble").criticalInjury === true
  && flatOutcome(ser, "fumble").criticalModifier === 0,
  "\"and a critical injury\" — the Failure line names -20, the Fumble line does not");
ok("S5 a critical carries none at all", flatOutcome(ser, "critical").criticalInjury === false);

/* ── O. WHAT IS OFFENSIVE ────────────────────────────────────────── */
ok("O1 an action with the attack trait is offensive",
  isOffensiveAction({ key: "strike", traits: "Attack" }) === true);
/*
 * O2 IS GRAHAM'S RULING. Both of these carry the attack trait and
 * neither is offensive; a cursed creature squirming out of a grapple
 * must not be punished for it.
 */
ok("O2 BUT AID DEFENSIVE AND ESCAPE ARE NOT",
  isOffensiveAction({ key: "aidDefensive", traits: "Attack" }) === false
  && isOffensiveAction({ key: "escape", traits: "Attack" }) === false,
  "the attack trait MINUS the ones that plainly are not offensive");
ok("O3 and an ordinary move is not",
  isOffensiveAction({ key: "stride", traits: "Move" }) === false);
ok("O4 a spell at an unwilling target counts however it is tagged",
  isOffensiveAction({ key: "cast", traits: "" }, true) === true);
ok("O5 the exception list is exactly the two measured",
  NOT_OFFENSIVE.length === 2);

/* ── L. THE LINES ────────────────────────────────────────────────── */
ok("L1 the cast card prints the whole ladder",
  /dies at 100 HP or fewer/.test(flatLadderLine(wod)) && /dies instantly/.test(flatLadderLine(wod)));
ok("L2 and says when a rung does nothing",
  /unaffected/.test(flatLadderLine(ser)) && /critical injury at -20/.test(flatLadderLine(ser)));
ok("L3 a death is reported as a death, not as damage",
  /dies/.test(flatOutcomeLine(wod, "Foe", "fumble", flatResolution(flatOutcome(wod, "fumble"), 40), 0)));
ok("L4 a drop names the total it dropped to",
  /-10 HP/.test(flatOutcomeLine(wod, "Foe", "failure", flatResolution(flatOutcome(wod, "failure"), 200), 0)));
ok("L5 the curse says it will bite again",
  /every offensive action/.test(flatCurseLine(ser, "Foe", "failure")));

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const effects = strip(read("module", "magic", "spell-effects.mjs"));
const flow = strip(read("module", "magic", "flat-ladder-workflow.mjs"));
// RE-POINTED AT 3.606.0. This check used to REQUIRE the line that was the
// defect: `for (const r of ladderResults)` inside a case that already runs
// once per recipient, which handed every target the ladder once per target
// caught. It was measuring presence ("the applier reads the degrees") and
// could not see multiplicity. It now requires the one-target form and
// refuses the loop.
ok("W1 the applier resolves the ladder per target's own degree",
  effects.includes('case "flatLadder": {')
  && effects.includes("const mine = ladderResults.find((r) => r?.target === target);")
  && effects.includes("await applyFlatLadder(caster, spec, target, mine.degree, castId)")
  && !effects.includes("for (const r of ladderResults) {"),
  "one degree for everybody would ignore who saved");
/*
 * ─────────────────────────────────────────────────────────────────────
 * W2 — DEATH GOES THROUGH THE RULE, AND THIS CHECK USED TO PASS ANYWAY.
 *
 * The 3.485.0 version of W2 asked whether `reapDead(...)` and the string
 * `deathState + 1` APPEARED. Both did. What the code actually wrote was
 *
 *     target.update({ "system.conditions.dying.value": deathState + 1 })
 *
 * and `getConditionValue("dying")` does not read that field, so `isDead`
 * stayed false and the reaper walked away from a corpse it had been
 * handed. Driven live: Word Of Death killed a creature at exactly 100
 * HP, the card said "dies", and the body stayed in the initiative order.
 *
 * ASSERTING THAT A NAME APPEARS IS NOT ASSERTING THAT A BRANCH RUNS.
 * This project has now met that pattern seven times. So W2 names the
 * mechanism it requires AND forbids the one that failed — because the
 * bug was not a missing call, it was the wrong write standing beside a
 * correct-looking one.
 */
ok("W2 DEATH GOES THROUGH DYING AND THE REAPER",
  flow.includes('await target.toggleStatusEffect("dying", { value: deathState + 1 });')
  && flow.includes("await reapDead(target, game.combat ?? null);"),
  "fourteen critical rows once printed \"dies instantly\" and killed nobody");
ok("W2b AND NOTHING HERE WRITES THE DYING FIELD DIRECTLY",
  !/conditions\.dying\.value/.test(flow),
  "the reaper reads getConditionValue, which does not see that field");
/*
 * W9 — AND THE -10 DROP IS A DROP INTO DYING (Graham, 4 September 2026).
 * 3.485.0 wrote the hit points and told the dying machinery nothing,
 * leaving a creature at -10 with no condition at all.
 */
ok("W9 the stated destination goes through the dying rule",
  flow.includes("const { enterDyingAt } = await import(\"../combat/dying-workflow.mjs\");")
  && flow.includes("await enterDyingAt(target, resolution.finalHP);"),
  "every other route to zero-or-below goes through it");
ok("W9b and no longer writes the hit points beside it",
  !/system\.resources\.hp\.value["']\s*:\s*resolution\.finalHP/.test(flow));
/*
 * W10 — THE TWO BRANCHES OF THE SAME RULE AGREE. `enterDyingAt` mirrors
 * `applyDamageDirect`'s `reached-zero`, and two copies of a rule agree
 * right up until somebody edits one of them.
 */
{
  const dw = strip(read("module", "combat", "dying-workflow.mjs"));
  const uses = (dw.match(/zeroHPDyingValue\(isCritical\)/g) || []).length;
  ok("W10 the drop uses the same Dying value a plain drop to zero does",
    uses >= 2 && /export async function enterDyingAt/.test(dw),
    `${uses} uses of zeroHPDyingValue(isCritical) — the two branches must not drift`);
  /*
   * ANCHORED TO THE WHOLE STATEMENT, and this check needed correcting
   * once before it shipped. Written first as "does `hasNoDeathState`
   * appear anywhere after `enterDyingAt`", it survived a mutation that
   * left the call standing behind `false &&` — a check that a NAME
   * appears rather than that a BRANCH runs, written in the same session
   * as the comment on W2 about exactly that mistake. The mutation runner
   * caught it; nothing else would have.
   */
  ok("W10b and destroys a creature that has no Death State, as zero does",
    /enterDyingAt[\s\S]{0,900}\n  if \(hasNoDeathState\(ownedCreatureTypeSystem\(actor\)\)\) \{/.test(dw),
    "a construct dropped to -10 is destroyed exactly as one dropped to 0 is");
}
/*
 * W11 — A LADDER'S RECIPIENTS ARE EVERYONE WHO ROLLED.
 *
 * A `flatLadder` row carries no `onSave`, so it fell to the ungated
 * branch and took `targets` — the FAILURES. Nobody failing meant the
 * switch never ran and the card said "finds nobody to affect"; somebody
 * failing meant everyone got their rung. One creature's outcome
 * depended on another creature's roll.
 */
ok("W11 A LADDER APPLIES TO EVERYONE WHO SAVED, not to the failures",
  effects.includes("LADDER_KINDS.includes(effect.kind)")
  && effects.includes("? ladderResults.map((r) => r?.target).filter(Boolean)"),
  "Serenity's Success is 5 Mental and Word Of Death's is 50 — both are outcomes");
ok("W11b and the kind list is derived in the ladder module, not spelled here",
  effects.includes("normaliseFlatLadder, LADDER_KINDS"),
  "an onSave on the pack row would be undone by the first ladder authored without one");
/*
 * W12 — A RUNG THAT CANNOT BE FOUND IS REPORTED. The whole seven-degrees
 * defect hid for a release inside an empty return.
 */
ok("W12 a missing rung says so instead of returning nothing",
  /if \(!rung\) \{[\s\S]{0,160}flatNoRungLine\(spec, target\.name, degree\)/.test(flow),
  "the silence is what cost the release, not the gap");
ok("W3 the critical injury is rolled at the rung's own modifier",
  flow.includes("modifier: rung.criticalModifier"),
  "rollCriticalInjury already took a modifier — nothing new was needed");
ok("W4 the curse records the DEGREE, so it is not re-rolled later",
  flow.includes("label: spec.label, degree, castId: castId ?? null"),
  "Graham's ruling: one save, its result suffered again");
/*
 * W6 IS THE HALF THE RATCHET CAUGHT. The first draft recorded the curse
 * and nothing read it: `CURSE_FLAG` was exported, a degree was written
 * onto the target, and no code anywhere consumed it. Serenity would have
 * shipped saying "it bites again on every offensive action" and never
 * bitten. `verify-rules-have-callers` found it before a single cast.
 */
{
  const aw = strip(read("module", "combat", "action-workflow.mjs"));
  const commits = (aw.match(/await recordTraitUsage\(actor, action\);/g) || []).length;
  const bites = (aw.match(/await biteOffensiveCurses\(actor, action\);/g) || []).length;
  ok("W6 THE CURSE BITES WHERE AN ACTION COMMITS", commits > 0 && bites === commits,
    `${commits} commit points, ${bites} curse checks — a recorded curse nobody reads is not automation`);
  /*
   * W6b — AND EVERY ONE OF THEM IS A DECLARED BINDING.
   *
   * 3.485.0 shipped one destructured site and two written as
   * `(await import(...)).biteOffensiveCurses(...)` — the exact form the
   * comment beside the first says the ratchet refuses to count, because
   * it walks the AST and `a.b` is a property access, not a reference.
   * They ran; the tool was guarding one commit point of three and blind
   * to the others. W6 counted them all because it matched the call text,
   * so nothing complained.
   */
  const bindings = (aw.match(/const \{ biteOffensiveCurses \} = await import\(/g) || []).length;
  ok("W6b AND EVERY BITE IS A DECLARED BINDING, not member access on an import",
    bindings === bites && !/\)\)\.biteOffensiveCurses/.test(aw),
    `${bites} calls, ${bindings} bindings — the dead-export ratchet only sees declared names`);
}
/*
 * W7 — AND IT RE-APPLIES THE RECORDED DEGREE rather than rolling again.
 * Graham's ruling: one save, its result suffered repeatedly.
 */
ok("W7 the bite re-applies the stored degree, it does not re-roll",
  flow.includes("await applyFlatLadder(actor, spec, actor, record.degree, record.castId)")
  && !/biteOffensiveCurses[\s\S]{0,900}TRGCheck/.test(flow),
  "a fresh save each time is the reading Graham did NOT choose");
ok("W8 and a failure to bite never costs the player their action",
  /catch \(error\)[\s\S]{0,200}return false;/.test(flow),
  "this runs after the AP is spent");
ok("W5 the immunity uses the existing mechanism",
  flow.includes('await import("../temporary-immunity.mjs")')
  && flow.includes("withImmunity(record, spec.label, spec.immuneSeconds, now)"));

/* ── P. THE PACK ─────────────────────────────────────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let sPack = null, wPack = null;
try {
  for await (const [k, v] of db.iterator()) {
    if (!k.startsWith("!items!") || v?.type !== "spell") continue;
    if (/^serenity$/i.test(v.name)) sPack = v;
    if (/^word of death$/i.test(v.name)) wPack = v;
  }
} finally { await db.close(); }
const rowOf = (v) => (v?.system?.effects ?? []).find((e) => e?.kind === "flatLadder") ?? null;
ok("P1 both spells are in the pack", Boolean(sPack) && Boolean(wPack));
ok("P2 and both carry a well-formed ladder",
  normaliseFlatLadder(rowOf(sPack)) !== null && normaliseFlatLadder(rowOf(wPack)) !== null);
ok("P3 Serenity repeats and Word Of Death does not",
  normaliseFlatLadder(rowOf(sPack)).repeatsOnOffensiveAction === true
  && normaliseFlatLadder(rowOf(wPack)).repeatsOnOffensiveAction === false);
ok("P4 Word Of Death carries its ten-minute immunity",
  normaliseFlatLadder(rowOf(wPack)).immuneSeconds === 600);
ok("P5 both roll the Will save their entries name",
  String(sPack?.system?.defence ?? "").toLowerCase() === "will"
  && String(wPack?.system?.defence ?? "").toLowerCase() === "will");

if (failures.length) {
  console.error(`verify-flat-ladder: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-flat-ladder: ${checks} checks passed`);
