#!/usr/bin/env node
/**
 * verify-seers-vision — a die replaced rather than a roll modified.
 *
 * NEW at 3.449.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FOURTH SPELL ON THIS ROAD, AND THE FIRST OF ITS KIND.
 *
 * Cutting Words, Counter Perform and Inspire Competence all leave a
 * MODIFIER for a later roll. This one leaves a DIE FACE: "use the
 * recorded number instead of rolling."
 *
 * GRAHAM'S RULING, 31 August 2026: a recorded 20 IS a natural 20, and
 * behaves exactly as though rolled — criticals, open-ended chains and
 * all. Section B is that ruling driven through the system's own chain
 * rather than restated: the check does not assert "a 20 crits", it
 * asserts that the forced face reaches `rollChain` and lets the chain
 * answer.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION E IS THE ONE THAT MATTERS, as it is for all four. The first
 * spell of this shape failed by going nowhere.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  seersVisionRecord, seersVisionConsumes, visionDraw,
  seersVisionCastLine, seersVisionSpentLine, visionName, SEERS_VISION_NAME,
  SEERS_VISION_FLAG, VISION_DIE_FACES,
  applicableRecordedRoll, recordedRolls, withRecordedRoll
} from "../module/magic/seers-vision.mjs";
import { rollChain, CHAIN_PROFILES, OPEN_ENDED } from "../module/dice/open-ended.mjs";
import { BLIND_ROLL_MODE } from "../module/traits.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const checkSrc = read("module", "dice", "check.mjs");
const applier = read("module", "magic", "spell-effects.mjs");
const flow = read("module", "magic", "seers-vision-workflow.mjs");
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
 * A. WHAT IS RECORDED
 * ================================================================== */

ok("A1 a face is recorded", seersVisionRecord({ value: 14 })?.value === 14);
ok("A1b with its caster", seersVisionRecord({ value: 14, casterName: "Seer" })?.casterName === "Seer");
ok("A2 both ends of the die are legal",
  seersVisionRecord({ value: 1 })?.value === 1
  && seersVisionRecord({ value: VISION_DIE_FACES })?.value === VISION_DIE_FACES);
// REFUSED, NOT CLAMPED. A number outside the die can only come from a bug
// or a hand-edited flag, and clamping would hand somebody a silent 20.
ok("A3 a number this die cannot show is refused",
  seersVisionRecord({ value: 0 }) === null && seersVisionRecord({ value: 21 }) === null
  && seersVisionRecord({ value: -3 }) === null);
ok("A3b as is rubbish",
  seersVisionRecord({ value: "x" }) === null && seersVisionRecord({}) === null
  && seersVisionRecord() === null);
ok("A4 the flag is the one the roll reads", SEERS_VISION_FLAG === "seersVision");

/* ================================================================== *
 * B. THE RULING, DRIVEN THROUGH THE SYSTEM'S OWN CHAIN
 *
 * "A recorded 20 IS a natural 20 — criticals, open-ended chains and
 * all." So the test is not that this file knows what a 20 does; it is
 * that the forced face reaches `rollChain` as the die's own result.
 * ================================================================== */

const realDraw = async () => 7;

{
  const draw = visionDraw(14, realDraw);
  const chain = await rollChain({ draw, profile: CHAIN_PROFILES.d20, openEnded: OPEN_ENDED.BOTH });
  ok("B1 an ordinary face becomes the roll", chain.total === 14 && chain.faces[0] === 14);
  ok("B1b and does not explode", chain.exploded === false && chain.faces.length === 1);
}
{
  // THE RULING ITSELF. Nothing here says "20 explodes"; the chain does.
  const draw = visionDraw(20, realDraw);
  const chain = await rollChain({ draw, profile: CHAIN_PROFILES.d20, openEnded: OPEN_ENDED.BOTH });
  ok("B2 A RECORDED 20 EXPLODES, exactly as a rolled one does",
    chain.faces[0] === 20 && chain.faces.length > 1 && chain.total > 20,
    "the recorded number is the die's own face, so the chain answers this rather than the spell");
}
{
  const draw = visionDraw(1, realDraw);
  const chain = await rollChain({ draw, profile: CHAIN_PROFILES.d20, openEnded: OPEN_ENDED.BOTH });
  ok("B3 and a recorded 1 explodes downward",
    chain.faces[0] === 1 && chain.faces.length > 1 && chain.total < 1);
}
{
  // THE CONTINUATION IS THE REAL DIE. Only the FIRST face is foreseen.
  let drawn = 0;
  const counting = async () => { drawn += 1; return 7; };
  const draw = visionDraw(20, counting);
  await rollChain({ draw, profile: CHAIN_PROFILES.d20, openEnded: OPEN_ENDED.BOTH });
  ok("B4 only the first face is forced; the chain rolls on",
    drawn > 0, "an exploded chain must continue with real dice");
}
{
  const draw = visionDraw(20, realDraw);
  await draw();
  ok("B5 and the forced face is spent once",
    (await draw()) === 7 && (await draw()) === 7);
}

/* ================================================================== *
 * C. WHICH CHECK MAY SPEND IT
 * ================================================================== */

const held = { value: 14 };
const OPEN = "publicroll";
ok("C1 a saving throw may", seersVisionConsumes("save", OPEN, held) === true);
ok("C2 a skill check may", seersVisionConsumes("skill", OPEN, held) === true);
ok("C3 an attack may not", seersVisionConsumes("attack", OPEN, held) === false,
  "neither a save nor a skill check — the sentence names two things");
ok("C4 nor a generic check", seersVisionConsumes("generic", OPEN, held) === false);
// "NON-SECRET" IS A REAL DISTINCTION. Appendix 3's Secret trait becomes a
// blind roll, and a player cannot spend a number on a roll they may not
// see.
ok("C5 A SECRET CHECK MAY NOT", seersVisionConsumes("skill", BLIND_ROLL_MODE, held) === false,
  "the printed word \"non-secret\", and the roll mode Appendix 3 produces");
ok("C5b nor a secret save", seersVisionConsumes("save", BLIND_ROLL_MODE, held) === false);
ok("C6 nothing foreseen spends nothing",
  seersVisionConsumes("skill", OPEN, null) === false);

/* ================================================================== *
 * D. THE CARD SAYS WHAT HAPPENED
 * ================================================================== */

ok("D1 the cast names the number", /14/.test(seersVisionCastLine(14, "Nella")));
ok("D1b and what it may replace",
  /non-secret saving throw or skill check/.test(seersVisionCastLine(14, "Nella")));
ok("D2 the spend says the die was replaced",
  /replaces the die/.test(seersVisionSpentLine(14, "Seer")) && /14/.test(seersVisionSpentLine(14, "Seer")));
// THE GRAPPLE LESSON, at its sharpest: a check whose DIE was replaced and
// did not say so would be the clearest case of a card describing an
// outcome it does not have.
const checkClean = strip(checkSrc);
ok("D3 the check's own subtitle carries it",
  checkClean.includes("#subtitleWithVision()")
  && checkClean.includes("subtitle: this.#subtitleWithVision(),"),
  "a replaced die that the card does not mention is the Grapple defect");

/* ================================================================== *
 * N. ONE SPELL, ONE NAME
 *
 * FOUND BY DRIVING 3.449.0, not by this harness. The cast card said
 * "Seer’s Vision" (from the pack, with U+2019) and the prompt beside it
 * said "Seer's Vision" (from five hard-coded strings). One spell, two
 * names, on one screen.
 *
 * THE PACK IS THE AUTHORITY. The record carries the spell's own name and
 * every player-facing string asks `visionName` for it, so renaming the
 * spell renames the prompt.
 * ================================================================== */

ok("N1 the record carries the spell's own name",
  seersVisionRecord({ value: 9, label: "Seer’s Vision" })?.label === "Seer’s Vision");
ok("N2 and that name is what is shown",
  visionName({ label: "Farsight" }) === "Farsight",
  "a renamed spell must rename its own prompt");
ok("N3 a record with no name falls back to the pack's spelling",
  visionName({}) === SEERS_VISION_NAME && visionName(null) === SEERS_VISION_NAME);
// THE APOSTROPHE IS THE WHOLE POINT of the fallback: a typewriter one
// here would reintroduce the two spellings it exists to end.
ok("N4 AND THE FALLBACK IS SPELT AS THE PACK SPELLS IT",
  SEERS_VISION_NAME === "Seer\u2019s Vision",
  "U+2019, not a typewriter apostrophe — the pack row is the authority");
ok("N5 the spent line uses the carried name",
  seersVisionSpentLine(9, "Nella", "Farsight").startsWith("Farsight"));
ok("N6 and falls back with none",
  seersVisionSpentLine(9, "Nella").startsWith(SEERS_VISION_NAME));

// PLAYER-FACING ONLY. `console.error` may name the spell however it
// likes — nobody at the table reads the console — so those lines are
// removed before the count, and the claim stays exactly what it says.
const nameFlow = strip(flow).replace(/console\.error\([^)]*\)/g, " ");
ok("N7 the prompt titles itself from the record, not a constant",
  nameFlow.includes("visionName(pending)") && nameFlow.includes("window: { title: name,"),
  "the hard-coded title is exactly what put two names on one screen");
ok("N8 and no player-facing string retypes the name",
  (nameFlow.match(/Seer's Vision/g) ?? []).length === 0,
  "the only survivor may be the console.error a player never sees");
ok("N9 the effect hands the spell's name over",
  strip(applier).includes("label: spell?.name ?? \"\","),
  "the pack row names the spell; nothing else should");

/* ================================================================== *
 * E. IS IT REACHED?
 * ================================================================== */

const evaluateBody = bodyOf(checkSrc, "  async evaluate() {");
ok("E1 evaluate's body was found", evaluateBody.length > 0);
ok("E1b and reaches its real code",
  evaluateBody.includes("this.#rollD20()") && evaluateBody.includes("#takeInspireCompetence()"));
ok("E2 the roll asks for a vision", evaluateBody.includes("await this.#takeSeersVision();"));
// BEFORE THE ROLL — and for this spell that is not a nicety but the
// whole mechanism: after the roll there is no die left to replace.
ok("E3 and asks BEFORE the roll",
  evaluateBody.indexOf("#takeSeersVision()") < evaluateBody.indexOf("this.#rollD20()"),
  "after the roll there is no die left to replace");
ok("E4 the import is out of evaluate's scope",
  !evaluateBody.includes('from "../magic/seers-vision.mjs"'));

const rollBody = bodyOf(checkSrc, "  async #rollD20() {");
ok("E5 the roll uses the forced draw when there is one",
  rollBody.includes("this._visionDraw ?? (() => this.#drawDie(20))"),
  "the draw is where the ruling is expressed — a total substituted elsewhere would re-decide three rules");

const hookBody = bodyOf(checkSrc, "  async #takeSeersVision() {");
ok("E6 the hook was found", hookBody.length > 0);
ok("E6b it asks the check type and roll mode",
  hookBody.includes("seersVisionConsumes(this.type, this.rollMode, pending)"));
ok("E6c and the spent record keeps the spell's name for the card",
  hookBody.includes("name: visionName(pending)"),
  "the subtitle is player-facing and must not retype it");
ok("E6c it PROMPTS rather than applying itself",
  hookBody.includes("await promptSeersVision(pending, this.label)"),
  "\"they MAY use\" — a recorded 4 is worse than most rolls");
ok("E6d a refusal leaves the vision intact",
  /if \(!\(await promptSeersVision\([^)]*\)\)\) return;/.test(hookBody),
  "only USING it ends the spell");
ok("E6e and it builds the draw before consuming",
  hookBody.indexOf("this._visionDraw =") < hookBody.indexOf("await consumeSeersVision"));
ok("E6f a failure in the hook does not lose the roll",
  hookBody.includes("catch (error)") && hookBody.includes("console.error")
  && !/\bthrow\b/.test(strip(hookBody)));

/* ================================================================== *
 * F. THE WORKFLOW AND THE APPLIER
 * ================================================================== */

const flowClean = strip(flow);
// THE OPPOSITE OF EVERY OTHER SPELL ON THIS ROAD. "Casting this spell
// again immediately cancels any active instance" — so the new vision
// wins even when it is worse.
/*
 * F1 IS DRIVEN NOW, AND ITS CLAIM IS UNCHANGED.
 *
 * It matched the literal line `setFlag(SYSTEM_ID, SEERS_VISION_FLAG,
 * record)`, which was the whole implementation until 3.589.0 — when a
 * SECOND spell started recording numbers (Embrace Destiny, page 277) and
 * the single slot became a list. The claim it was protecting is still
 * exactly right and is now asserted of the rule instead of the line, so
 * the next refactor cannot break the check without breaking the rule.
 *
 * THE OPPOSITE OF EVERY OTHER SPELL ON THIS ROAD: "casting this spell
 * again immediately cancels any active instance" — the new vision wins
 * even when it is worse.
 */
{
  const first = seersVisionRecord({ value: 19, label: SEERS_VISION_NAME });
  const second = seersVisionRecord({ value: 3, label: SEERS_VISION_NAME });
  const after = withRecordedRoll(withRecordedRoll(null, first), second);
  ok("F1 a second cast REPLACES rather than keeping the better",
    after.length === 1 && after[0].value === 3,
    "\"casting this spell again immediately cancels any active instance\"");
  // AND IT CANCELS ONLY ITS OWN. Neither spell's sentence mentions the
  // other; a shared slot would have invented a rule.
  const destiny = seersVisionRecord({
    value: 11, source: "Embrace Destiny", types: ["attack", "save", "skill"] });
  const both = withRecordedRoll(after, destiny);
  ok("F1b a different spell's recorded number is not cancelled",
    both.length === 2 && both.some((r) => r.source === SEERS_VISION_NAME)
    && both.some((r) => r.source === "Embrace Destiny"));
  ok("F1c and each check is offered the record that may be spent on it",
    applicableRecordedRoll(both, "attack", "publicroll")?.source === "Embrace Destiny"
    && applicableRecordedRoll(both, "skill", "publicroll")?.source === SEERS_VISION_NAME,
    "Seer's Vision cannot be spent on an attack roll; Embrace Destiny can");
  ok("F1d a record written before this release still reads, and keeps its own list",
    recordedRolls({ value: 9 }).length === 1
    && seersVisionConsumes("skill", "publicroll", { value: 9 }) === true
    && seersVisionConsumes("attack", "publicroll", { value: 9 }) === false,
    "a bare object is one record; an absent type list is Seer's Vision's own");
}
ok("F2 the prompt refuses by default",
  flowClean.includes("rejectClose: false") && flowClean.includes('return answer === "use";'),
  "a spell the player forgot to decline must not spend itself");
ok("F3 clearing swallows its own failure",
  flowClean.includes("catch (error)") && flowClean.includes("console.error")
  && !/\bthrow\b/.test(flowClean));

const applierClean = strip(applier);
const caseBody = (() => {
  const from = applierClean.indexOf('case "seersVision":');
  const to = applierClean.indexOf('case "inspireCompetence":', from);
  return from === -1 ? "" : applierClean.slice(from, to === -1 ? undefined : to);
})();
ok("F4 the applier case was found", caseBody.length > 0);
ok("F5 it ROLLS a real d20 rather than choosing a number",
  caseBody.includes('new Roll("1d20").evaluate()'),
  "the whole spell is the gamble that it is a good one");
ok("F5b and shows the roll", caseBody.includes("rolls.push(visionRoll)"));
ok("F6 it records what was rolled",
  caseBody.includes("value: visionRoll.total"));
// THE GUARD, not just its message. A mutation that replaced `if
// (!recorded)` with `if (false)` left the sentence sitting in dead code
// and survived a check that only looked for the words — the same trap
// that has hidden four mutations in this session, and the same answer:
// assert the statement, not the string it prints.
ok("F7 and a refused record is reported rather than swallowed",
  caseBody.includes("if (!recorded) {") && caseBody.includes("foresaw nothing usable"),
  "the guard must be live, not a sentence in a branch nothing reaches");

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
const spell = spells.find((s) => /^seer.s vision$/i.test(s.name));
ok("G1 Seer's Vision declares the effect",
  (spell?.system?.effects ?? []).some((e) => e.kind === "seersVision" && e.target === "targets"));
ok("G2 it is aimed at one willing creature",
  /willing/i.test(String(spell?.system?.targets ?? "")));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-seers-vision: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-seers-vision: OK — ${checks} checks. The recorded face is the die's own, `
  + `so the chain decides what a 20 does.\n`);
