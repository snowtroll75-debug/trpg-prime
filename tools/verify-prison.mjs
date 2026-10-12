#!/usr/bin/env node
/**
 * verify-prison — a cage you hurt yourself getting out of.
 *
 * NEW at 3.472.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LADDER RUNS THE WRONG WAY.
 *
 * Every other save in this system pays a better result with less harm by
 * halving or negating ONE number. Both prisons list FOUR, and the damage
 * RISES as the roll gets worse — 8d6 on a Critical to 24d6 on a Fumble.
 *
 * L1 IS WHY THEY ARE STORED AND NOT DERIVED. Flame Prison doubles from
 * Critical to Success (8 → 16); Force Prison does not (8 → 12); both
 * repeat their top number on Fumble. No single rule generates both, so a
 * ladder computed from one number would have been wrong for at least one
 * spell and probably for both.
 *
 * E1 IS THE SURPRISE. FAILURE costs 24d6 and a Minor critical and STILL
 * LETS YOU OUT. Only a Fumble keeps you in. An implementation that
 * assumed "success escapes, failure does not" would be wrong on the
 * degree a table hits most often.
 *
 * D1 IS THE GAP THE BOOK LEAVES. This system rolls seven degrees and the
 * spells print four, so heroic, partial and blunder have no printed
 * outcome and must still cost something definite.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  PRISON_FLAG, PRISON_DEGREES, normalisePrison, prisonOutcome, prisonDegree,
  prisonAttemptLine, prisonEscapeLine, prisonLadderLine, prisonRefusal
} from "../module/magic/prison.mjs";
import { DEGREES } from "../module/dice/resolution.mjs";

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

const ROW = {
  kind: "prison", label: "Flame Prison", damageType: "fire", save: "Reflex",
  ladder: { critical: "8d6", success: "16d6", failure: "24d6", fumble: "24d6" },
  escapesOn: ["critical", "success", "failure"],
  criticalOn: { failure: "minor", fumble: "serious" },
  notes: ["The bars inflict 1d6 per minute — apply by hand."]
};
const spec = normalisePrison(ROW);

/* ── R. THE ROW ──────────────────────────────────────────────────── */
ok("R1 a well-formed row normalises", spec?.damageType === "fire");
ok("R2 a row of another kind is not one", normalisePrison({ ...ROW, kind: "hazard" }) === null);
ok("R3 a row with no damage type is refused", normalisePrison({ ...ROW, damageType: "" }) === null);
/*
 * R4 — EVERY DEGREE MUST BE NAMED. A ladder missing one is not a prison
 * with a gap; it is a prison whose behaviour on that roll nobody
 * decided, and defaulting it would invent a number the book never
 * printed.
 */
for (const degree of PRISON_DEGREES) {
  const gapped = { ...ROW, ladder: { ...ROW.ladder } };
  delete gapped.ladder[degree];
  ok(`R4 a ladder missing "${degree}" is refused`, normalisePrison(gapped) === null,
    "defaulting it would invent a number the book never printed");
}
ok("R5 a malformed die is refused",
  normalisePrison({ ...ROW, ladder: { ...ROW.ladder, critical: "8d6+2" } }) === null);
ok("R6 a row that nothing escapes on is refused",
  normalisePrison({ ...ROW, escapesOn: [] }) === null,
  "a cage with no way out is not this mechanism");
ok("R7 an unknown severity is dropped rather than trusted",
  normalisePrison({ ...ROW, criticalOn: { failure: "catastrophic" } })?.criticalOn.failure === undefined);
ok("R8 the printed notes are carried", spec.notes.length === 1);

/* ── L. THE LADDER ───────────────────────────────────────────────── */
ok("L1 each degree costs what the book prints",
  prisonOutcome(spec, "critical").dice === "8d6"
  && prisonOutcome(spec, "success").dice === "16d6"
  && prisonOutcome(spec, "failure").dice === "24d6"
  && prisonOutcome(spec, "fumble").dice === "24d6");
// THE DAMAGE RISES AS THE ROLL WORSENS, which is the opposite of every
// other save in this system and the reason this file exists.
const amount = (d) => Number(/^(\d+)d/.exec(prisonOutcome(spec, d).dice)[1]);
ok("L2 AND A WORSE ROLL COSTS MORE, not less",
  amount("critical") < amount("success") && amount("success") < amount("failure")
  && amount("failure") <= amount("fumble"),
  "every other save in this system pays a better result with less harm");
ok("L3 an unknown degree yields nothing", prisonOutcome(spec, "nonsense") === null);
ok("L4 no spec yields nothing", prisonOutcome(null, "critical") === null);

/* ── E. WHO GETS OUT ─────────────────────────────────────────────── */
ok("E1 A FAILURE STILL OPENS THE CAGE",
  prisonOutcome(spec, "failure").escapes === true,
  "24d6 and a Minor critical, and you are out — the degree a table hits most");
ok("E2 and only a Fumble keeps you in",
  prisonOutcome(spec, "fumble").escapes === false
  && prisonOutcome(spec, "critical").escapes === true
  && prisonOutcome(spec, "success").escapes === true);
ok("E3 the criticals land where the book puts them",
  prisonOutcome(spec, "failure").severity === "minor"
  && prisonOutcome(spec, "fumble").severity === "serious"
  && prisonOutcome(spec, "critical").severity === null
  && prisonOutcome(spec, "success").severity === null);
// DECLARED, NOT INFERRED. A third prison holding you on a failure is a
// legal spell, and a rule read off these two would give it the wrong one.
ok("E4 a prison that only opens on a critical is expressible",
  prisonOutcome(normalisePrison({ ...ROW, escapesOn: ["critical"] }), "success").escapes === false);

/* ── D. SEVEN ROLLED DEGREES, FOUR PRINTED ───────────────────────── */
/*
 * THE RULE: an unnamed degree takes the nearest named one that is NO
 * BETTER than it. Heroic beats Critical and takes Critical's 8d6;
 * Partial is not a success and cannot take Success's line, so it takes
 * Failure's; Blunder is worse than Fumble and takes Fumble's.
 *
 * D2 IS THE HALF THAT MATTERS: rounding towards the printed WORSE
 * outcome. The other direction would hand a roll a better result than
 * the book names for a roll of that quality.
 */
ok("D1 every degree this system rolls maps to a printed one",
  DEGREES.every((d) => PRISON_DEGREES.includes(prisonDegree(d.key))),
  "a roll with no outcome would cost nothing at all");
ok("D2 AND AN UNNAMED DEGREE IS NEVER GIVEN A BETTER RESULT",
  prisonDegree("heroic") === "critical"
  && prisonDegree("partial") === "failure"
  && prisonDegree("blunder") === "fumble",
  "partial is not a success and must not take the success line");
ok("D3 a named degree maps to itself",
  ["critical", "success", "failure", "fumble"].every((d) => prisonDegree(d) === d));
ok("D4 nonsense maps to nothing", prisonDegree("banana") === null);

/* ── C. WHAT THE CARDS SAY ───────────────────────────────────────── */
const out = prisonOutcome(spec, "failure");
ok("C1 the attempt line names the degree and what landed",
  /failure/i.test(prisonAttemptLine(spec, "A", "failure", 40, 84, out))
  && /24d6 rolled 84/.test(prisonAttemptLine(spec, "A", "failure", 40, 84, out)));
ok("C2 and says so when defences ate some",
  /reduced by their defences/.test(prisonAttemptLine(spec, "A", "failure", 40, 84, out))
  && !/reduced by their defences/.test(prisonAttemptLine(spec, "A", "failure", 84, 84, out)));
// A FUMBLE COSTS THE MOST AND CHANGES NOTHING. A player who has just
// taken 24d6 needs telling they may try again.
ok("C3 a caged prisoner is told they may try again",
  /may try again/.test(prisonEscapeLine(spec, "A", false))
  && /is out/.test(prisonEscapeLine(spec, "A", true)));
ok("C4 the cast card prints the whole ladder",
  /8d6/.test(prisonLadderLine(spec)) && /24d6/.test(prisonLadderLine(spec))
  && /stays in/.test(prisonLadderLine(spec)),
  "the table can see what an attempt costs before making one");
ok("C5 there is a refusal line", /No escape attempt/.test(prisonRefusal("they are not caged")));

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const effects = strip(read("module", "magic", "spell-effects.mjs"));
const cards = strip(read("module", "dice", "check-card-interactions.mjs"));
ok("W1 the applier cages the target", effects.includes('case "prison": {')
  && effects.includes("await prisoner.setFlag(SYSTEM_ID, PRISON_FLAG, {"));
// THE LADDER AND DC ARE FROZEN AT CAST TIME, for the reason the
// emanation records its own save DC: a pack entry edited mid-campaign
// must not change a cage somebody is already sitting in.
ok("W2 CARRYING THE LADDER AND DC AS THEY WERE AT CAST",
  effects.includes("spec, saveDC, castId, casterUuid: caster.uuid, spellName: spell.name"));
ok("W3 and offers a button", /^\s*lines\.push\(line\(`<button type="button" data-action="attemptPrisonEscape" `/m.test(effects),
  "the attempt is pressed, not prompted");
ok("W4 the handler exists and is bound",
  cards.includes("async function onAttemptPrisonEscape(prisonerUuid) {")
  && cards.includes('html.querySelector?.(\'[data-action="attemptPrisonEscape"]\')'));
ok("W5 it rolls the save the spell names", cards.includes("save: spec.save.toLowerCase(),"));
ok("W6 and maps the rolled degree onto the printed ladder",
  cards.includes("const degree = prisonDegree(rolled);"));
ok("W7 the critical is rolled on the spell's own damage type",
  cards.includes("damageType: spec.damageType,") && cards.includes("severity: outcome.severity,"));
// THE MARKER IS WHAT ENDS THE CAGE. Damage is charged either way.
ok("W8 ONLY AN ESCAPE CLEARS THE MARKER",
  cards.includes("if (outcome.escapes) await prisoner.unsetFlag(SYSTEM_ID, PRISON_FLAG);"));
ok("W9 and the button stays live for another attempt",
  cards.includes("escapeButton.disabled = false;"),
  "a Fumble leaves them caged and the next attempt is another press");

/* ── P. THE PACK ─────────────────────────────────────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const pack = new Map();
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") pack.set(String(v.name), v);
  }
} finally { await db.close(); }
ok("P1 the pack was read", pack.size > 600, `${pack.size} spells`);
const rowOf = (n) => (pack.get(n)?.system?.effects ?? []).find((r) => r?.kind === "prison") ?? null;
const flame = normalisePrison(rowOf("Flame Prison"));
const force = normalisePrison(rowOf("Force Prison"));
ok("P2 Flame Prison carries its ladder",
  flame?.ladder.critical === "8d6" && flame?.ladder.fumble === "24d6" && flame?.damageType === "fire");
ok("P3 Force Prison carries its own",
  force?.ladder.critical === "8d6" && force?.ladder.fumble === "16d6" && force?.damageType === "force");
/*
 * P4 IS THE REASON THE LADDER IS DATA. The two spells are the same
 * sentence and NOT the same numbers — Flame doubles from Critical to
 * Success and Force does not. Anything derived from one number would
 * have got at least one of them wrong.
 */
ok("P4 AND THE TWO LADDERS ARE NOT THE SAME SHAPE",
  flame.ladder.success === "16d6" && force.ladder.success === "12d6",
  "a derived ladder would have been wrong for at least one of them");
ok("P5 both name their recipient",
  String(rowOf("Flame Prison")?.target ?? "") === "targets"
  && String(rowOf("Force Prison")?.target ?? "") === "targets");
ok("P6 and both print what the system does not roll",
  flame.notes.length >= 2 && force.notes.length >= 2,
  "the per-minute die, the bars, the immunities and the airless cell");
ok("P7 the flag is the one the handler looks for", PRISON_FLAG === "imprisoned");

if (failures.length) {
  process.stderr.write(`verify-prison: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-prison: OK — ${checks} checks. A worse roll costs more, and only a Fumble keeps you in.\n`);
