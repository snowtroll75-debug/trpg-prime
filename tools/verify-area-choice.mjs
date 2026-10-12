#!/usr/bin/env node
/**
 * verify-area-choice — an area whose targets the caster chooses.
 *
 * NEW at 3.479.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 3 September 2026, after driving 3.478.0.
 *
 *   "The spell targets characters in the area of effect — 'You may
 *    target...'. So the caster would choose who was affected within the
 *    area and who was not."
 *
 * The live pass had shown the caster standing in his own 50-foot radius,
 * caught by his own storm, taking 47 force and dropping to 0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE CHECKS THAT CARRY THE DESIGN.
 *
 *   P4  IT IS THE ONLY AREA SPELL THAT DECLARES A CHOICE. Turn Undead
 *       says "ALL 1st level undead"; Bless catches every ally. A blanket
 *       picker would put a dialog in front of casts the book gives no
 *       choice about, and invite a player to untick something the spell
 *       says they cannot. Asserted against the PACK, not against a list
 *       kept by hand here.
 *
 *   D2  THE CASTER IS LISTED AND NOT TICKED. Both halves matter, and
 *       they are the two halves `promptTargetSelection` already settled
 *       for targeted spells: "appearing in the list is the fix, being
 *       chosen by default would be a different and worse bug." Here the
 *       cost of a Continue nobody read is fifty force damage.
 *
 *   C3  CANCEL IS NOT "SPARE EVERYBODY". A dismissed dialog returns null
 *       and the caught list is unchanged. A cancel that silently spared
 *       every target would be a spell that quietly did nothing, and the
 *       card would still read as a successful cast.
 *
 * W3 IS THE ORDERING ONE, and it is written the way this project has
 * had to learn to write them: both anchors must EXIST before their
 * positions are compared, because `indexOf` returns -1 for something
 * absent and -1 is less than every real position.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  AREA_CHOICE_FIELD, areaIsChosen, areaChoiceRows, applyAreaChoice,
  areaChoiceLine, areaChoseNobodyLine
} from "../module/magic/area-choice.mjs";

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

const CASTER = "c1";
const caught = [
  { id: "c1", name: "The Caster" },
  { id: "m1", name: "Medium Foe" },
  { id: "l1", name: "Large Foe" }
];

/* ── F. THE FLAG ─────────────────────────────────────────────────── */
ok("F1 a spell declaring the choice is read as choosing",
  areaIsChosen({ [AREA_CHOICE_FIELD]: true }) === true);
ok("F2 a spell that does not is swept as before",
  areaIsChosen({}) === false && areaIsChosen({ [AREA_CHOICE_FIELD]: false }) === false);
ok("F3 nothing at all is not a choice", areaIsChosen(null) === false);
/*
 * F4 — READ AS A FLAG, NOT AS PROSE. A truthy-but-not-true value would
 * let a transcription artefact ("yes", 1, "false") switch a dialog on,
 * and the description field is exactly where such artefacts live.
 */
ok("F4 ONLY A REAL true COUNTS",
  areaIsChosen({ [AREA_CHOICE_FIELD]: "true" }) === false
  && areaIsChosen({ [AREA_CHOICE_FIELD]: 1 }) === false,
  "a truthy string must not switch a dialog on");

/* ── D. THE DEFAULTS ─────────────────────────────────────────────── */
const rows = areaChoiceRows(caught, CASTER);
ok("D1 every caught creature gets a row", rows.length === 3);
/*
 * D2 IS GRAHAM'S RULING, and it is TWO assertions on purpose. Dropping
 * the caster from the list entirely would also stop them being hit, and
 * would pass any check that only asked "is the caster unticked".
 */
ok("D2 THE CASTER IS LISTED AND NOT TICKED",
  rows.some((r) => r.isCaster)
  && rows.find((r) => r.isCaster).ticked === false,
  "listed so they can opt in; unticked so Continue never hurts them");
ok("D3 and everybody else is ticked",
  rows.filter((r) => !r.isCaster).every((r) => r.ticked === true),
  "the printed default is \"each character in the area\"");
ok("D4 a caster who is not in the area changes nothing",
  areaChoiceRows(caught, "nobody").every((r) => r.ticked === true));
ok("D5 an empty catch yields no rows", areaChoiceRows([], CASTER).length === 0);

/* ── C. THE CHOICE ───────────────────────────────────────────────── */
ok("C1 only the ticked survive",
  applyAreaChoice(caught, ["m1"]).map((a) => a.id).join(",") === "m1");
ok("C2 the caster can opt in",
  applyAreaChoice(caught, ["c1", "m1"]).map((a) => a.id).join(",") === "c1,m1");
/*
 * C3 — CANCEL IS NOT AN EMPTY CHOICE. null means the dialog was
 * dismissed; the caught list stands. An empty ARRAY is a real answer and
 * spares everybody, which is the distinction `promptTargetSelection`
 * already draws.
 */
ok("C3 A CANCEL LEAVES THE CAUGHT LIST ALONE",
  applyAreaChoice(caught, null).length === 3
  && applyAreaChoice(caught, undefined).length === 3,
  "a dismissed dialog must not silently spare everybody");
ok("C4 but an explicit empty choice spares everybody",
  applyAreaChoice(caught, []).length === 0,
  "\"you MAY target\" permits targeting no-one");
/*
 * C5 — THE GEOMETRY HAS THE LAST WORD. An id that was never caught
 * cannot be added by a stale row or a hand-edited form; the caught list
 * is filtered rather than the ids resolved.
 */
ok("C5 AN ID THE AREA NEVER CAUGHT CANNOT BE ADDED",
  applyAreaChoice(caught, ["m1", "ghost"]).map((a) => a.id).join(",") === "m1",
  "the dialog cannot widen what the template caught");
ok("C6 order follows the caught list, not the ticks",
  applyAreaChoice(caught, ["l1", "c1"]).map((a) => a.id).join(",") === "c1,l1");

/* ── L. THE LINES ────────────────────────────────────────────────── */
ok("L1 the spared are named on the card",
  /spares Medium Foe, Large Foe/.test(areaChoiceLine("Missile Storm", ["Medium Foe", "Large Foe"])));
ok("L2 and the reason is given",
  /not chosen by the caster/.test(areaChoiceLine("Missile Storm", ["A"])));
/*
 * L3 — NOTHING SPARED SAYS NOTHING. A line reading "spares" with no
 * names is noise on every ordinary cast.
 */
ok("L3 sparing nobody prints nothing",
  areaChoiceLine("Missile Storm", []) === ""
  && areaChoiceLine("Missile Storm", null) === "");
ok("L4 choosing nobody is said plainly, not left silent",
  /targets no-one in the area/.test(areaChoseNobodyLine("Missile Storm")),
  "a cast that hit nobody otherwise reads as a broken spell");

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const cast = strip(read("module", "magic", "cast-workflow.mjs"));
const flow = strip(read("module", "magic", "area-choice-workflow.mjs"));
/*
 * W1 ASSERTS THE GUARD, NOT THE NAME. The first draft matched
 * `cast.includes("areaIsChosen(spellData)")`, and a mutation prefixing
 * `false &&` walked straight through it — the text was still there and
 * the branch was dead. Match the whole condition.
 */
ok("W1 the cast asks whether the spell offers a choice",
  cast.includes("if (areaIsChosen(spellData) && areaTargets.length) {")
  && cast.includes("await promptAreaChoice("),
  "a dead branch still contains the function's name");
ok("W2 and applies the answer to the caught list",
  cast.includes("areaTargets = applyAreaChoice(before, chosen);"));
/*
 * W3 — AFTER THE KIND GATE. A row for a creature the gate already
 * refused would invite the caster to choose somebody who was never going
 * to be hit, and then be told so twice. Both anchors are required to
 * exist before their order is compared.
 */
ok("W3 AFTER THE KIND GATE HAS PRUNED", (() => {
  const a = cast.indexOf("areaTargets = kindFiltered.kept;");
  const b = cast.indexOf("areaIsChosen(spellData)");
  return a > -1 && b > -1 && a < b;
})(), "offering a row the gate already refused would say no twice");
/*
 * W4 — BEFORE ANYTHING CONSUMES THE LIST. The storm, the effects pass
 * and the save loop all read `areaTargets`; a choice applied after any
 * of them would damage somebody the caster had spared.
 */
ok("W4 AND BEFORE THE STORM READS THE LIST", (() => {
  const a = cast.indexOf("areaTargets = applyAreaChoice(before, chosen);");
  const b = cast.indexOf("await applyMissileStorm(");
  return a > -1 && b > -1 && a < b;
})(), "a choice applied afterwards would spare nobody");
/*
 * W5 ASSERTS THE PUSH, NOT THE CALL. The first draft asserted that
 * `areaChoiceLine` was called — which stayed true when the line that
 * PUSHES its result was disabled, so the names vanished from the card
 * and the check passed. Asking a question and discarding the answer is
 * the shape this project keeps finding; the check has to name the line
 * that USES it.
 */
ok("W5 the spared are reported on the card",
  cast.includes("if (sparedText) lines.push(line(sparedText));")
  && cast.includes("lines.push(line(areaChoseNobodyLine(spell.name)));"),
  "a computed line nobody pushes is a name on no card");
/*
 * W6 — THE DIALOG'S CANCEL AND CLOSE BOTH RESOLVE null. A close handler
 * that never resolved would hang the whole cast on a dismissed dialog,
 * which is the failure mode a promise-wrapped dialog invites.
 */
ok("W6 A DISMISSED DIALOG RESOLVES RATHER THAN HANGING",
  /close:\s*\(\)\s*=>\s*resolve\(null\)/.test(flow)
  && /action:\s*"cancel"[\s\S]{0,80}resolve\(null\)/.test(flow),
  "an unresolved dialog would hang the cast for ever");
ok("W7 the caster is marked in the dialog itself",
  flow.includes("r.isCaster") && /you — the caster/.test(flow));

/* ── P. THE PACK ─────────────────────────────────────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const areaSpells = [];
let storm = null;
try {
  for await (const [k, v] of db.iterator()) {
    if (!k.startsWith("!items!") || v?.type !== "spell") continue;
    if (String(v.system?.area ?? "").trim()) areaSpells.push(v);
    if (/^missile storm$/i.test(v.name)) storm = v;
  }
} finally { await db.close(); }
ok("P0 the spell is in the pack", Boolean(storm));
ok("P1 and it declares the choice", areaIsChosen(storm?.system) === true);
ok("P2 the area is still an area", /radius/i.test(String(storm?.system?.area ?? "")));
/*
 * P3 — THE FIELD IS IN THE SCHEMA. A field the template does not declare
 * survives in the pack and vanishes from any actor-owned copy, so the
 * spell would offer its choice from the compendium and not from a
 * character's own sheet — which is where it is actually cast from.
 */
const tpl = JSON.parse(read("template.json"));
ok("P3 THE FIELD IS DECLARED IN THE SCHEMA",
  Object.prototype.hasOwnProperty.call(tpl?.Item?.spell ?? {}, AREA_CHOICE_FIELD),
  "an undeclared field is dropped from an owned copy of the spell");
/*
 * P4 IS THE MEASUREMENT THE DESIGN RESTS ON. If a second area spell ever
 * declares this, that is fine — but it should be a decision somebody
 * made, not a default that spread. This check makes the spread visible.
 */
const chosen = areaSpells.filter((s) => areaIsChosen(s.system)).map((s) => s.name);
// A SECOND, DECIDED (3.609.0, block 33's R10). Tangling Creepers' vine lashes
// ONE creature the creepers caught — Graham's "as recommended" — so the caster
// ticks it. Named here, as this check asks, rather than spreading by default.
ok("P4 EXACTLY THE AREA SPELLS THAT WERE DECIDED DECLARE A CHOICE",
  chosen.length === 2 && chosen.map((n) => n.toLowerCase()).sort().join("|") === "missile storm|tangling creepers",
  `declared by: ${chosen.join(", ") || "nothing"} — every other area is swept`);
/*
 * P5 — AND THE SWEPT ONES REALLY DO SAY "ALL". A spot check on the spell
 * whose wording is the opposite of Missile Storm's, so the distinction
 * this whole file rests on is asserted rather than asserted about.
 */
const turn = areaSpells.find((s) => /^turn undead$/i.test(s.name));
ok("P5 and a spell that says \"all\" declares no choice",
  turn ? areaIsChosen(turn.system) === false : true,
  "Turn Undead prints \"ALL 1st level undead within the spells emanation\"");

/* ── report ──────────────────────────────────────────────────────── */
if (failures.length) {
  console.error(`verify-area-choice: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-area-choice: ${checks} checks passed`);
