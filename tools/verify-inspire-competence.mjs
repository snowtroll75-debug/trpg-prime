#!/usr/bin/env node
/**
 * verify-inspire-competence — the Bard's Aid, and whether it is REACHED.
 *
 * NEW at 3.448.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE THE SPELL WAS BLOCKED ON, as Graham gave it on 31 August 2026:
 *
 *   "One character must be appointed as the lead character. All other
 *    characters make an EASY Skill check using the BONUS CHECK TABLE.
 *    The resulting bonus is added as a CIRCUMSTANCE BONUS to the lead
 *    character's check."
 *
 * The system's own two Aid actions are COMBAT ones — an attack roll
 * against the target's Defence — so the general rule could not be read
 * off them, and the spell sat silent until it was asked for.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION E IS THE ONE THAT MATTERS. This is the third spell to leave a
 * number waiting for a later check, and the first one failed by going
 * nowhere: Cutting Words' card said "is affected" over a penalty that
 * was never applied. So the hook is asserted inside `evaluate`'s own
 * body, before the roll.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  aidDC, inspireCompetenceBonus, inspireCompetenceRecord,
  pendingInspireCompetenceModifier, inspireCompetenceConsumes,
  inspireCompetenceCastLine, INSPIRE_COMPETENCE_FLAG
} from "../module/magic/inspire-competence.mjs";
import { BONUS_CHECK_TABLE, DEGREES, levelDC, DIFFICULTY_BY_KEY } from "../module/dice/resolution.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const checkSrc = read("module", "dice", "check.mjs");
const applier = read("module", "magic", "spell-effects.mjs");
const flow = read("module", "magic", "inspire-competence-workflow.mjs");
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

/* ================================================================== *
 * A. THE DC IS THE AID RULE'S OWN
 * ================================================================== */

ok("A0 the Easy rung is the ladder's, not a copy",
  DIFFICULTY_BY_KEY.easy?.modifier === -2,
  "without this every comparison below would be a comparison with itself");
ok("A1 the Aid DC is the level DC at Easy",
  aidDC(3) === levelDC(3) - 2 && aidDC(12) === levelDC(12) - 2);
// THE LEAD'S LEVEL, NOT THE CASTER'S. A task's difficulty belongs to
// whoever is attempting it; otherwise the same encouragement would be
// worth more from a higher-level Bard, which the rule does not say.
ok("A1b and it rises with the ALLY's level",
  aidDC(12) > aidDC(3));
ok("A2 rubbish does not throw", Number.isFinite(aidDC()) && Number.isFinite(aidDC(null)));

/* ================================================================== *
 * B. THE TABLE, AND THE FLOOR THAT IS THIS SPELL'S OWN
 * ================================================================== */

const DC = aidDC(3);
ok("B0 the shared table is the one the Aid rule names",
  BONUS_CHECK_TABLE.heroic === 4 && BONUS_CHECK_TABLE.success === 2);
ok("B1 a heroic cast earns 4", inspireCompetenceBonus(DC + 20, 3) === 4);
ok("B2 a critical earns 3", inspireCompetenceBonus(DC + 10, 3) === 3);
ok("B3 meeting the DC is a success, and earns 2", inspireCompetenceBonus(DC, 3) === 2);
ok("B4 one short is a partial, and earns 1", inspireCompetenceBonus(DC - 1, 3) === 1);
// "THE MINIMUM BONUS GRANTED IS +1" — the spell's whole difference from
// an ordinary Aid, which grants nothing on a failure.
ok("B5 A FAILURE STILL EARNS THE MINIMUM", inspireCompetenceBonus(DC - 9, 3) === 1,
  "an ordinary Aid grants nothing here; this spell's sentence says +1");
ok("B5b as does a fumble", inspireCompetenceBonus(DC - 19, 3) === 1);
ok("B5c and a blunder", inspireCompetenceBonus(-100, 3) === 1);
ok("B6 a cast with no check still grants the minimum",
  inspireCompetenceBonus(null, 3) === 1 && inspireCompetenceBonus(undefined, 3) === 1);
// THE FLOOR IS A FLOOR, NOT A REPLACEMENT.
ok("B7 a good cast still earns the table's own value",
  inspireCompetenceBonus(DC + 20, 3) > 1);

// EVERY DEGREE AGREES WITH THE SHARED TABLE, floored at one — the check
// that would catch a ladder copied in beside it.
let agree = true;
const mismatches = [];
for (const degree of DEGREES) {
  const table = BONUS_CHECK_TABLE[degree.key];
  if (table === undefined) continue;
  const margin = Number.isFinite(degree.min) ? degree.min : -100;
  const got = inspireCompetenceBonus(DC + margin, 3);
  const want = Math.max(1, table);
  if (got !== want) { agree = false; mismatches.push(`${degree.key}: got ${got}, want ${want}`); }
}
ok("B8 every degree returns the shared table's value, floored at one",
  agree, mismatches.join("; "));

/* ================================================================== *
 * C. WHAT IS RECORDED, AND WHAT IT BECOMES
 * ================================================================== */

ok("C1 a record is always made", inspireCompetenceRecord({ bonus: 1 }).bonus === 1,
  "unlike Counter Perform there is no zero to withhold — the floor is one");
ok("C1b and never below the minimum", inspireCompetenceRecord({ bonus: 0 }).bonus === 1
  && inspireCompetenceRecord({ bonus: -5 }).bonus === 1);
ok("C2 it names its caster", inspireCompetenceRecord({ bonus: 2, casterName: "Nella" }).casterName === "Nella");
ok("C3 the modifier is CIRCUMSTANCE, as the Aid rule says",
  pendingInspireCompetenceModifier({ bonus: 2 }).type === "circumstance",
  "the type is what stops two Bards stacking — Appendix 1, highest wins");
ok("C3b and carries the caster's name",
  /Nella/.test(pendingInspireCompetenceModifier({ bonus: 2, casterName: "Nella" }).label));
ok("C4 nothing held is no modifier", pendingInspireCompetenceModifier(null) === null);
ok("C5 the flag is the one the roll reads", INSPIRE_COMPETENCE_FLAG === "inspireCompetence");

/* ================================================================== *
 * D. WHICH CHECK SPENDS IT
 * ================================================================== */

const held = { bonus: 2 };
ok("D1 a SKILL check spends it", inspireCompetenceConsumes("skill", held) === true);
// THE PAIR WOULD BE MEANINGLESS IF EITHER REACHED BOTH. Counter Perform
// is the spell that reaches saves.
ok("D2 a saving throw does not", inspireCompetenceConsumes("save", held) === false,
  "Counter Perform is the spell that reaches saves");
ok("D3 nor an attack", inspireCompetenceConsumes("attack", held) === false);
ok("D4 nor a generic check", inspireCompetenceConsumes("generic", held) === false);
ok("D5 and nothing held spends nothing", inspireCompetenceConsumes("skill", null) === false);

/* ================================================================== *
 * E. IS IT REACHED?
 *
 * The first spell of this shape failed by going nowhere: Cutting Words'
 * card said "is affected" over a penalty that never reached a roll.
 * ================================================================== */

const evaluateBody = bodyOf(checkSrc, "  async evaluate() {");
ok("E1 evaluate's body was found", evaluateBody.length > 0);
ok("E1b and reaches its real code",
  evaluateBody.includes("this.#rollD20()") && evaluateBody.includes("#takeCounterPerform()"),
  "a body that cannot see the roll and its sibling hooks is not evaluate's body");
ok("E2 the roll asks for a waiting bonus",
  evaluateBody.includes("await this.#takeInspireCompetence();"));
// BEFORE THE OUTCOME IS BUILT, which is the half a card cannot show and
// the half Cutting Words got wrong.
const beforeRoll = evaluateBody.indexOf("#takeInspireCompetence()") < evaluateBody.indexOf("this.#rollD20()");
ok("E3 and asks BEFORE the roll", beforeRoll,
  "a modifier pushed after the outcome prints on the card and changes nothing");
ok("E4 the import is out of evaluate's scope",
  !evaluateBody.includes('from "../magic/inspire-competence.mjs"'),
  "the import-position trap — the names are all in the dynamic import too");

const hookBody = bodyOf(checkSrc, "  async #takeInspireCompetence() {");
ok("E5 the hook was found", hookBody.length > 0);
ok("E5b it pushes the modifier rather than computing and dropping it",
  hookBody.includes("this.modifiers.push(modifier)"));
ok("E5c and spends it", hookBody.includes("await consumeInspireCompetence(this.actor)"));
// AND SPENDS IT AFTER THE ROLL HAS THE MODIFIER. Consuming first would
// clear the flag before the push that uses it — a bonus paid for and
// never seen. Nothing asserted the ORDER until a mutation that moved the
// consume above the push survived.
ok("E5c2 spending it after pushing it, never before",
  hookBody.indexOf("await consumeInspireCompetence(this.actor)") > hookBody.indexOf("this.modifiers.push"),
  "consuming first spends a bonus the roll never saw");
// THE GUARD ITSELF, not merely the name. The first draft compared the
// POSITION of the string "inspireCompetenceConsumes" against the push —
// and the destructured import above names it too, so a mutation that
// replaced the guard with `if (false) return;` still satisfied it. A
// claim about a statement has to match the statement.
ok("E5d asking the check type first",
  hookBody.includes("if (!inspireCompetenceConsumes(this.type, pending)) return;")
  && hookBody.indexOf("if (!inspireCompetenceConsumes(this.type, pending)) return;")
     < hookBody.indexOf("this.modifiers.push"),
  "the guard must be a live statement, not just a name in an import");
// SWALLOWS, which is more than CATCHES: a guard that re-throws is a
// rethrow with extra steps, and this runs inside a roll.
ok("E6 a failure in the hook does not lose the roll",
  hookBody.includes("catch (error)") && hookBody.includes("console.error")
  && !/\bthrow\b/.test(strip(hookBody)));

/* ================================================================== *
 * F. THE APPLIER AND THE WORKFLOW
 * ================================================================== */

const applierClean = strip(applier);
const caseBody = (() => {
  const from = applierClean.indexOf('case "inspireCompetence":');
  const to = applierClean.indexOf('case "counterPerform":', from);
  return from === -1 ? "" : applierClean.slice(from, to === -1 ? undefined : to);
})();
ok("F0 the applier case was found", caseBody.length > 0);
ok("F1 it compares the cast's own total",
  caseBody.includes("Number(rollData?.castTotal)"));
ok("F2 against the ALLY's Aid DC",
  caseBody.includes("inspireCompetenceBonus(castTotal, target.system?.identity?.level ?? 0)"),
  "the lead's level decides the task's difficulty, not the caster's");
ok("F3 and records it on the ally", caseBody.includes("recordInspireCompetence(target"));
// SAID OUT LOUD. The GM-adjudicated half is printed rather than guessed.
ok("F4 the un-automated half is printed for the GM",
  caseBody.includes("The GM may rule this has no effect where encouragement would interfere"),
  "guessing which skills are quiet would be a rule wearing this spell's name");

const flowClean = strip(flow);
ok("F5 a second cast keeps the larger rather than stacking",
  flowClean.includes("if (held && Number(held.bonus) >= record.bonus) return held;"));
ok("F6 clearing swallows its own failure",
  flowClean.includes("catch (error)") && flowClean.includes("console.error")
  && !/\bthrow\b/.test(flowClean));

/* ================================================================== *
 * G. THE PACK
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") spells.push(v);
  }
} finally { await db.close(); }

ok("G0 the spells pack was read", spells.length > 600, `only ${spells.length} found`);
const spell = spells.find((s) => /^inspire competence$/i.test(s.name));
ok("G1 Inspire Competence declares the effect",
  (spell?.system?.effects ?? []).some((e) => e.kind === "inspireCompetence" && e.target === "targets"));
ok("G2 it is aimed at one ally", /1 ally/i.test(String(spell?.system?.targets ?? "")));
ok("G3 the cast line says what is held",
  /\+2 circumstance/.test(inspireCompetenceCastLine(2, "Nella"))
  && /skill check/.test(inspireCompetenceCastLine(2, "Nella")));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-inspire-competence: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-inspire-competence: OK — ${checks} checks. The Aid rule's Easy DC, `
  + `the shared table floored at one, and a skill check that spends it.\n`);
