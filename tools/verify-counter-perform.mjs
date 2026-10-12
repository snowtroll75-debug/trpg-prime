#!/usr/bin/env node
/**
 * verify-counter-perform — the Bard's shield, and whether it is REACHED.
 *
 * NEW at 3.443.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SPELL IS A NUMBER THAT ARRIVES ON A LATER ROLL, which is the same
 * kind of quiet as the suppression release: the cast card can be perfect,
 * the flag can hold the right value, and if `evaluate` never asks for it
 * the ally simply rolls their save without it and nobody notices.
 *
 * Cutting Words is the spell this one is built from, and its own header
 * records what that failure looked like the first time — a penalty that
 * "went nowhere" while the card said "is affected". Section E is written
 * against that, and asks for the CALL inside `evaluate`'s own body,
 * anchored on the argument list, before `buildOutcome` reads the
 * modifiers.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION C IS THE ONE THAT WOULD CATCH A COPIED LADDER. The book names
 * the Bonus Check Table, and this spell must read the system's own rather
 * than retype it — so the check drives `BONUS_CHECK_TABLE` and
 * `counterPerformBonus` side by side at every degree and compares them.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  COUNTER_PERFORM_FLAG, counterPerformBonus, counterPerformRecord,
  pendingCounterPerformModifier, counterPerformConsumes, counterPerformCastLine
} from "../module/magic/counter-perform.mjs";
import { BONUS_CHECK_TABLE, DEGREES } from "../module/dice/resolution.mjs";
import { cuttingWordsTargetEligibility as eligible } from "../module/magic/cutting-words.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const checkSrc = read("module", "dice", "check.mjs");
const applier = read("module", "magic", "spell-effects.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");
const flow = read("module", "magic", "counter-perform-workflow.mjs");

const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

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
const has = (body, needle) => strip(body).includes(needle);
function before(body, a, b) {
  const clean = strip(body);
  const i = clean.indexOf(a); const j = clean.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

/* ================================================================== *
 * A. THE READER
 * ================================================================== */

const evaluateBody = bodyOf(checkSrc, "  async evaluate() {");
ok("A1 evaluate's body was found", evaluateBody.length > 0);
ok("A2 and reaches its real code",
  evaluateBody.includes("this.#rollD20()") && evaluateBody.includes("#takeCuttingWords()"),
  "a body that cannot see the roll and the sibling hook is not evaluate's body");
ok("A3 the import is out of scope",
  !evaluateBody.includes('from "../magic/counter-perform.mjs"'),
  "the import-position trap — the names are all in the dynamic import too");

/* ================================================================== *
 * B. WHAT THE PERFORMANCE EARNS
 * ================================================================== */

// THE BANDS ARE THE SYSTEM'S, AND THEY ARE NOT WHAT I ASSUMED. `DEGREES`
// puts heroic at margin +20, critical at +10, success at 0, partial at
// -4, failure at -9, fumble at -19 — so MEETING the DC is a success, not
// a partial. The first draft of this section guessed +21/+11/+1/0 and
// failed on its own spell, correctly. Driven at a fixed DC of 20 so every
// margin below is plain to read.
ok("B1 a heroic performance earns 4", counterPerformBonus(40, 20) === 4);
ok("B2 a critical earns 3", counterPerformBonus(30, 20) === 3);
ok("B3 a success earns 2", counterPerformBonus(25, 20) === 2);
ok("B4 meeting the DC exactly is a success, and earns 2",
  counterPerformBonus(20, 20) === 2,
  "margin 0 is the success band's floor, not the partial band's ceiling");
ok("B4b one short of the DC is a partial, and earns 1",
  counterPerformBonus(19, 20) === 1);
// "ANY NEGATIVE MODIFIER IS DISREGARDED" — the floor, not an absence.
ok("B5 a failure earns nothing rather than nothing-and-a-penalty",
  counterPerformBonus(15, 20) === 0);
ok("B6 a fumble is floored at zero, not passed through as -1",
  counterPerformBonus(-5, 20) === 0,
  "a bad performance must not make the ally WORSE at resisting");
ok("B7 a blunder likewise", counterPerformBonus(-40, 20) === 0);
// A DC NOBODY SUPPLIED EARNS NOTHING, rather than comparing against zero
// and handing out a heroic bonus for free.
// `Number(null)` IS ZERO AND ZERO IS FINITE, so a null DC that reached
// the comparison would be DC 0 and a good Perform would come back heroic.
// This caught exactly that on its first run.
ok("B8 a missing or unusable DC earns nothing",
  counterPerformBonus(30, null) === 0 && counterPerformBonus(30, undefined) === 0
  && counterPerformBonus(30, "") === 0 && counterPerformBonus(30, "x") === 0);
ok("B9 and a missing Perform total earns nothing either",
  counterPerformBonus(null, 20) === 0 && counterPerformBonus(undefined, 20) === 0
  && counterPerformBonus("", 20) === 0);

/* ================================================================== *
 * C. IT IS THE SYSTEM'S TABLE, NOT A COPY OF IT
 * ================================================================== */

ok("C0 the shared table is the one the book names",
  BONUS_CHECK_TABLE.heroic === 4 && BONUS_CHECK_TABLE.success === 2
  && BONUS_CHECK_TABLE.fumble === -1,
  "without this every comparison below would be a comparison with itself");

// For every degree the system defines, find a margin inside its band and
// check the spell returns that degree's own table value, floored at zero.
let agree = true;
const mismatches = [];
for (const degree of DEGREES) {
  const table = BONUS_CHECK_TABLE[degree.key];
  if (table === undefined) continue;
  // A margin comfortably inside this degree's band.
  // Taken from the degree's OWN `min` rather than typed out again — a
  // margin list beside the bands is the second place deciding one
  // question, and this section exists to prove there is only one.
  const margin = Number.isFinite(degree.min) ? degree.min : -100;
  const got = counterPerformBonus(20 + margin, 20);
  const want = Math.max(0, table);
  if (got !== want) { agree = false; mismatches.push(`${degree.key}: got ${got}, table ${want}`); }
}
ok("C1 every degree returns the shared table's own value, floored at zero",
  agree, mismatches.join("; "));

/* ================================================================== *
 * D. WHAT IS RECORDED, AND WHAT IS NOT
 * ================================================================== */

ok("D1 a bonus is recorded with its caster", counterPerformRecord({ bonus: 3, casterName: "Nella" })?.bonus === 3);
// A ZERO RECORDS NOTHING — cutting-words.mjs's reasoning, from the other
// side: a stored zero looks like an effect, is eaten by the next save,
// and prints a line saying nothing happened.
ok("D2 a bonus of zero records nothing at all", counterPerformRecord({ bonus: 0 }) === null);
ok("D3 and a negative one cannot sneak in", counterPerformRecord({ bonus: -2 }) === null);
ok("D4 the round is kept when there is one, null when there is not",
  counterPerformRecord({ bonus: 1, round: 4 })?.round === 4
  && counterPerformRecord({ bonus: 1 })?.round === null);

const mod = pendingCounterPerformModifier({ bonus: 2, casterName: "Nella" });
ok("D5 the waiting record becomes a STATUS modifier", mod?.type === "status",
  'the book says "granted as a status bonus", and the type is what makes two Bards not stack');
ok("D6 with the value it was given", mod?.value === 2);
ok("D7 named with its caster", /Nella/.test(mod?.label ?? ""));
ok("D8 and named plainly when nobody was recorded",
  pendingCounterPerformModifier({ bonus: 2 })?.label === "Counter Perform");
ok("D9 nothing waiting is no modifier",
  pendingCounterPerformModifier(null) === null && pendingCounterPerformModifier({ bonus: 0 }) === null);

/* ================================================================== *
 * E. WHICH ROLL SPENDS IT
 * ================================================================== */

const waiting = { bonus: 2, casterName: "Nella" };
ok("E1 a save spends it", counterPerformConsumes("save", waiting));
// "MAKE A SAVING THROW" — and nothing else. The mirror of this in
// cutting-words.mjs excludes saves for the same reason.
ok("E2 an attack does not", counterPerformConsumes("attack", waiting) === false);
ok("E3 a skill check does not", counterPerformConsumes("skill", waiting) === false);
ok("E4 nor a cast, a flat check or a damage roll",
  ["cast", "spellcraft", "flat", "damage", "initiative"]
    .every((t) => counterPerformConsumes(t, waiting) === false));
ok("E5 nothing waiting is never consumed", counterPerformConsumes("save", null) === false);

/* ================================================================== *
 * F. IS IT REACHED?
 * ================================================================== */

ok("F1 evaluate asks for a waiting bonus",
  has(evaluateBody, "this.#takeCounterPerform()"),
  "anchored on the CALL inside evaluate's own body");
// BEFORE THE OUTCOME IS BUILT. `buildOutcome` reads `this.modifiers`, so a
// modifier pushed afterwards prints on the card and changes no degree —
// the shape check.mjs's own comment says this project has met twice.
ok("F2 and does so before the dice are rolled and the outcome built",
  before(evaluateBody, "this.#takeCounterPerform()", "this.#rollD20()"),
  "a bonus that lands after buildOutcome prints on the card and turns no save");
ok("F3 beside its sibling rather than instead of it",
  has(evaluateBody, "this.#takeCuttingWords();") && has(evaluateBody, "this.#takeCounterPerform();"),
  "the two spells are one mechanism pointed at different people");

const takeBody = bodyOf(checkSrc, "  async #takeCounterPerform() {");
ok("F4 the taker's body was found", takeBody.length > 0);
ok("F5 it reads what the actor is carrying",
  has(takeBody, "pendingCounterPerform(this.actor)"));
ok("F6 refuses a check the spell does not name",
  has(takeBody, "if (!counterPerformConsumes(this.type, pending)) return;"));
ok("F7 pushes the modifier onto the check",
  has(takeBody, "this.modifiers.push(modifier);"));
// SPENT EVEN IF A LARGER STATUS BONUS WINS THE POOL — the save happened.
ok("F8 and spends it afterwards",
  before(takeBody, "this.modifiers.push(modifier)", "consumeCounterPerform(this.actor)"),
  "consuming first would spend a bonus the roll never saw");
ok("F9 a roll is never lost to it",
  has(takeBody, "catch (error)") && has(takeBody, "console.error"),
  "this runs inside a roll; throwing would cost the player their card");

/* ================================================================== *
 * G. THE APPLIER AND THE NUMBER IT COMPARES
 * ================================================================== */

const caseBody = bodyOf(applier, 'case "counterPerform": {');
ok("G1 the applier has a counterPerform case", caseBody.length > 0);
// THE CAST'S TOTAL, NOT ITS DEGREE. The degree on this card was resolved
// against the CASTING DC; the book compares against the incoming spell's
// Save DC, so the degree is the wrong answer and only the total is usable.
ok("G2 it reads the cast's own total",
  has(caseBody, "Number(rollData?.castTotal)"),
  "the degree on this card was resolved against a different DC entirely");
ok("G3 and refuses a cast that rolled no check",
  has(caseBody, "if (!Number.isFinite(performTotal)) {"),
  "a cantrip that rolls nothing has no Perform check to compare");
ok("G4 the incoming DC is asked for, not guessed",
  has(caseBody, "await promptIncomingSaveDC(spell.name)"));
ok("G5 and a cancelled prompt applies nothing, out loud",
  has(caseBody, "if (incomingDC === null) {") && has(caseBody, "nothing applied"));
ok("G6 the bonus comes from the shared comparison",
  has(caseBody, "counterPerformBonus(performTotal, incomingDC)"));
ok("G7 a zero bonus records nothing but still reports",
  has(caseBody, "if (bonus > 0) {") && has(caseBody, "counterPerformCastLine(bonus, target.name)"),
  "the anti-silence rule: a spell that bought nothing must say so");

// THE TOTAL HAS TO GET THERE. Threaded through `rollData` beside `pp` and
// `saveDC`; without it every Counter Perform refuses itself.
const castBody = bodyOf(cast, "export async function castSpell(");
ok("G8 the cast threads its total into the effect engine",
  has(castBody, "castTotal: check?.outcome?.total ?? null"),
  "without this the applier can never find a Perform check to compare");

/* ================================================================== *
 * H. THE WORKFLOW HALF, AND THE PACK
 * ================================================================== */

const recordBody = bodyOf(flow, "export async function recordCounterPerform(");
ok("H1 the record function was found", recordBody.length > 0);
// HIGHEST WINS, matching the status type the modifier carries. Two Bards
// shielding one save do not add up.
ok("H2 a second cast keeps the larger bonus rather than stacking",
  has(recordBody, "if (held && Number(held.bonus) >= record.bonus) return held;"));
ok("H3 the flag written is the flag the roll reads",
  has(recordBody, "setFlag(SYSTEM_ID, COUNTER_PERFORM_FLAG, record)")
  && COUNTER_PERFORM_FLAG === "counterPerform");
// SWALLOWS, which is more than CATCHES. The first draft asked only that a
// `catch (error)` was present — and a mutation that turned its body into
// `throw error` survived, because the catch was still there. A guard that
// re-throws is not a guard; it is a rethrow with extra steps.
const consumeBody = bodyOf(flow, "export async function consumeCounterPerform(");
ok("H4 clearing swallows its own failure",
  has(consumeBody, "catch (error)") && has(consumeBody, "console.error")
  && !/\bthrow\b/.test(strip(consumeBody)),
  "this runs inside a roll that has already happened; throwing costs the player their card");

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!items!") && value?.type === "spell") spells.push(value);
  }
} finally { await db.close(); }

ok("H5 the spells pack was read", spells.length > 600, `only ${spells.length} found`);
const cp = spells.find((s) => s.name === "Counter Perform");
ok("H6 Counter Perform declares the effect", Boolean(cp)
  && (cp.system.effects ?? []).some((e) => e.kind === "counterPerform" && e.target === "targets"));
// "YOU OR A STUDIED ALLY". THE FIELD ALONE DID NOTHING, and this comment
// is the correction: the first version of this check asserted the pack
// carried the word and described that as the picker refusing enemies.
// Driven on 29 August 2026, the picker offered an enemy — `keepByDisposition`
// filters AREA membership, not a targeted spell's picker, and the only
// thing that has ever refused by side is `dispositionRefusal`, which was
// keyed to "enemies" alone. A Bard could hand a foe a bonus to its save.
// The word is now half the claim, and the gate that reads it is the
// other half.
ok("H7 and is aimed at allies", cp?.system.areaTargeting === "allies",
  "the pack said \"all\", which named no side at all");
const flowSrc = read("module", "magic", "cutting-words-workflow.mjs");
ok("H7b and the side gate answers to that word",
  /side !== "enemies" && side !== "allies"/.test(flowSrc),
  "a declaration nothing reads is a comment in a data file");
ok("H7c and passes it to the eligibility test",
  /rangeFeet,\n\s*side\n/.test(flowSrc),
  "reading the word and not passing it on is how this gate was inert for Counter Perform");
// DRIVEN, NOT READ. The first version of H7d matched the source for
// `reason: "is not an ally"` — and a mutation that disabled the `if`
// while leaving the return line intact SURVIVED it. A rule this file can
// call is a rule this file must call.
ok("H7d an enemy is refused for an allies spell",
  eligible({ isEnemy: true, distance: 10, side: "allies" }).eligible === false,
  "the defect driving found: a Bard handing a foe a bonus to its save");
ok("H7e an ally in range is accepted",
  eligible({ isEnemy: false, distance: 10, side: "allies" }).eligible === true);
// THE CASTER IS A LEGAL TARGET, because the trigger is "YOU or a studied
// ally" — the opposite of Cutting Words, where self is the first thing
// refused.
ok("H7f and the Bard may shield themselves",
  eligible({ isEnemy: false, distance: 0, isSelf: true, side: "allies" }).eligible === true,
  '"you or a studied ally" — the caster is the first person the spell names');
ok("H7g while an enemies spell still refuses the caster",
  eligible({ isEnemy: true, distance: 0, isSelf: true, side: "enemies" }).eligible === false,
  "widening the gate must not have loosened Cutting Words");
ok("H7h and range is still enforced for an ally",
  eligible({ isEnemy: false, distance: 60, side: "allies" }).eligible === false);
ok("H8 its unautomated halves are still printed",
  (cp?.system.effects ?? []).some((e) => e.kind === "note" && /studied/i.test(e.text)),
  "the studied-ally trigger and both warps are the GM's, and must be visible");
// A REACTION, and the pack has to say so or the spell costs an action it
// should not.
ok("H9 it is still a Reaction", String(cp?.system.castAP) === "Reaction");

ok("H10 the cast line says what was held, and what was compared",
  /\+2 status/.test(counterPerformCastLine(2, "Nella"))
  && /no bonus/.test(counterPerformCastLine(0, "Nella")));

/* ================================================================== *
 * J. THE CARD NAMES THE CHECK THAT WAS ACTUALLY ROLLED (3.443.2)
 *
 * FOUND BY CASTING IT, 31 August 2026. The applier printed the word
 * "Perform" unconditionally beside a number that is simply the casting
 * total, so a cast made WITHOUT Bardic Performance — an ordinary
 * Spellcraft roll — produced "(Perform 10 vs DC 15)" over a Spellcraft
 * 10. The comparison was right; the card named a check nobody made.
 *
 * THIS DOES NOT DECIDE THE RULE. Whether a Spellcraft cast should earn
 * the bonus at all is Graham's call and is open. Printing the truth is
 * what makes the question visible instead of answering it silently.
 * ================================================================== */

ok("J1 the applier prints the skill it was told, not a typed-in word",
  has(caseBody, 'const castSkill = String(rollData?.castSkill ?? "").trim()')
  && has(caseBody, "(${castSkill} ${performTotal} vs DC ${incomingDC})"),
  '"Perform" beside a Spellcraft total is the card asserting something that did not happen');
ok("J1b and no longer hardcodes the word on that line",
  !/\(Perform \$\{performTotal\}/.test(caseBody),
  "the string that was wrong");
ok("J2 an unnamed check is called a casting check rather than a Perform one",
  has(caseBody, '|| "Casting check"'),
  "a fallback that guessed Perform would reintroduce the defect quietly");
ok("J2b and a cast that rolled nothing says the same",
  has(caseBody, "needs a casting check to compare"));
ok("J3 the cast says which check it rolled",
  has(castBody, 'castSkill: usePerform ? "Perform" : "Spellcraft"'),
  "the applier can only be as honest as what rides in rollData");
// THE SAME ANSWER THAT SWAPPED THE MODIFIER LIST. A second place deciding
// "was this a Perform cast" could disagree with the roll itself.
ok("J3b decided by the flag that actually swapped the roll",
  /const usePerform = Boolean\(conditions\.bardicPerform\);/.test(cast)
  && before(castBody, "const usePerform = Boolean(conditions.bardicPerform);",
    'castSkill: usePerform ? "Perform" : "Spellcraft"'),
  "the label must come from the same answer that chose the modifiers");

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-counter-perform: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-counter-perform: OK — ${checks} checks. The book's own table, floored at zero, `
  + `waiting on a save, and spent before the outcome is built.\n`);
