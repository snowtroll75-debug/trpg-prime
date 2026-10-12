#!/usr/bin/env node
/**
 * verify-elemental-nexus — a zone that bites whoever begins a turn in it.
 *
 * NEW at 3.477.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NEXUS OF ELEMENTAL ENERGY.
 *
 *   "Any creature that begins their turn within the spells radius must
 *    make a saving throw.
 *      Critical  unaffected.   Success  2d6.   Partial  4d6.
 *      Failure   4d6 and a Minor Critical.
 *      Fumble    4d6 and a Light Critical."
 *
 * ─────────────────────────────────────────────────────────────────────
 * P1 IS THE ONE THAT DECIDES THE WHOLE DESIGN: IT IS A PLACE.
 *
 * "Area 10-foot radius, Range 60 feet" — cast sixty feet away and it
 * stays there. So the zone is a REGION, and `runningEmanations()` can
 * never see it. That exact mistake killed the first draft of area riders
 * before it ran once, so it is asserted here against the pack rather
 * than assumed.
 *
 * S1 IS THE UNUSUAL PART: THE ELEMENT DECIDES THE SAVE. Every other save
 * in this system is fixed by the spell; this one is chosen at cast.
 *
 * L2 IS GRAHAM'S RULING. "A Light Critical" is not a severity the book's
 * own table defines — it gives Minor, Serious and Deadly — and a Fumble
 * must be worse than the Failure line's Minor. He ruled on 2 September
 * 2026 that it reads as SERIOUS.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  NEXUS_FLAG, NEXUS_DEGREES, normaliseNexus, nexusDegree, nexusOutcome,
  nexusSave, nexusLine, nexusLadderLine
} from "../module/magic/elemental-nexus.mjs";
import { emanationIsLive } from "../module/magic/emanation.mjs";
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
  kind: "elementalNexus", label: "Nexus Of Elemental Energy",
  elements: ["acid", "cold", "electricity", "fire"],
  ladder: { critical: "", success: "2d6", partial: "4d6", failure: "4d6", fumble: "4d6" },
  criticalOn: { failure: "minor", fumble: "serious" },
  notes: ["Spells of the chosen element gain a die — apply by hand."]
};
const spec = normaliseNexus(ROW);

/* ── R. THE ROW ──────────────────────────────────────────────────── */
ok("R1 a well-formed row normalises", spec !== null);
ok("R2 a row of another kind is not one", normaliseNexus({ ...ROW, kind: "hazard" }) === null);
/*
 * R3 — CRITICAL DEALS NOTHING, and an empty entry is how the book says
 * so: "resists the elemental energies and is unaffected". Every OTHER
 * degree must name dice or it is a roll nobody decided.
 */
ok("R3 CRITICAL MAY NAME NO DICE", normaliseNexus(ROW)?.ladder.critical === "",
  "\"resists the elemental energies and is unaffected\"");
for (const degree of ["success", "partial", "failure", "fumble"]) {
  const gapped = { ...ROW, ladder: { ...ROW.ladder } };
  gapped.ladder[degree] = "";
  ok(`R4 but "${degree}" may not`, normaliseNexus(gapped) === null,
    "an unnamed degree would cost undefined");
}
ok("R5 a malformed die is refused",
  normaliseNexus({ ...ROW, ladder: { ...ROW.ladder, success: "2d6+1" } }) === null);
ok("R6 an unknown severity is dropped",
  normaliseNexus({ ...ROW, criticalOn: { failure: "catastrophic" } })?.criticalOn.failure === undefined);
ok("R7 the printed notes are carried", spec.notes.length === 1);

/* ── L. THE LADDER ───────────────────────────────────────────────── */
ok("L1 each degree costs what the book prints",
  nexusOutcome(spec, "critical").harmless === true
  && nexusOutcome(spec, "success").dice === "2d6"
  && nexusOutcome(spec, "partial").dice === "4d6"
  && nexusOutcome(spec, "failure").dice === "4d6"
  && nexusOutcome(spec, "fumble").dice === "4d6");
/*
 * L2 IS GRAHAM'S RULING IN CODE. The book prints "a Light Critical" on
 * Fumble, and no such severity exists in its own table. Fumble must be
 * worse than Failure's Minor, so it reads as Serious.
 */
ok("L2 A LIGHT CRITICAL READS AS SERIOUS",
  nexusOutcome(spec, "fumble").severity === "serious"
  && nexusOutcome(spec, "failure").severity === "minor",
  "the book defines Minor, Serious and Deadly; a Fumble must beat a Minor");
ok("L3 and the gentler degrees carry no critical",
  nexusOutcome(spec, "critical").severity === null
  && nexusOutcome(spec, "success").severity === null
  && nexusOutcome(spec, "partial").severity === null);
ok("L4 an unknown degree yields nothing", nexusOutcome(spec, "nonsense") === null);

/* ── D. SEVEN ROLLED DEGREES, FIVE PRINTED ───────────────────────── */
/*
 * THIS SPELL NAMES PARTIAL ITSELF, unlike the prisons — so only Heroic
 * and Blunder need mapping, by the rule Graham confirmed on 2 September
 * 2026: an unnamed degree takes the nearest named one that is no better.
 */
ok("D1 every degree this system rolls maps to a printed one",
  DEGREES.every((d) => NEXUS_DEGREES.includes(nexusDegree(d.key))));
ok("D2 Heroic takes the best the spell offers", nexusDegree("heroic") === "critical");
ok("D3 Blunder takes the worst", nexusDegree("blunder") === "fumble");
// PARTIAL IS THE SPELL'S OWN and must not be mapped away — the prisons
// map it to failure because they never name it; this one does.
ok("D4 AND PARTIAL IS ITS OWN DEGREE HERE", nexusDegree("partial") === "partial",
  "this spell prints a Partial line where the prisons do not");
ok("D5 nonsense maps to nothing", nexusDegree("banana") === null);

/* ── S. THE ELEMENT DECIDES THE SAVE ─────────────────────────────── */
ok("S1 Fortitude for acid and cold",
  nexusSave("acid") === "Fortitude" && nexusSave("cold") === "Fortitude");
ok("S2 Reflex for electricity and fire",
  nexusSave("electricity") === "Reflex" && nexusSave("fire") === "Reflex");
ok("S3 and nothing for an element it does not know", nexusSave("custard") === null);

/* ── C. THE CARDS ────────────────────────────────────────────────── */
const out = nexusOutcome(spec, "failure");
ok("C1 the line names the degree and what landed",
  /failure/i.test(nexusLine(spec, "A", "fire", "failure", 9, 14, out))
  && /4d6 rolled 14/.test(nexusLine(spec, "A", "fire", "failure", 9, 14, out)));
ok("C2 and admits when defences ate some",
  /reduced by their defences/.test(nexusLine(spec, "A", "fire", "failure", 9, 14, out))
  && !/reduced by their defences/.test(nexusLine(spec, "A", "fire", "failure", 14, 14, out)));
// A CRITICAL SAVE IS NOT "0 DAMAGE" — the book says the creature RESISTS.
ok("C3 A CRITICAL SAVE SAYS IT RESISTED, not that it took nothing",
  /resists the fire entirely/.test(
    nexusLine(spec, "A", "fire", "critical", 0, 0, nexusOutcome(spec, "critical"))));
ok("C4 the cast card prints the whole ladder",
  /unaffected/.test(nexusLadderLine(spec, "fire"))
  && /2d6/.test(nexusLadderLine(spec, "fire"))
  && /serious fire critical/.test(nexusLadderLine(spec, "fire")));

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const cast = strip(read("module", "magic", "cast-workflow.mjs"));
const flow = strip(read("module", "magic", "elemental-nexus-workflow.mjs"));
const combat = strip(read("module", "documents", "combat.mjs"));
ok("W1 the cast records the nexus on its region",
  cast.includes('if (row?.kind !== "elementalNexus" || !placedArea?.regionId) continue;')
  && cast.includes("await recordNexus(region, {"));
/*
 * W2 — THE ELEMENT IS CHOSEN AT THE REGION, not in the applier, because
 * it decides the SAVE the region will ask of everyone who begins a turn
 * in it. The Region must carry it from the moment it exists.
 */
/*
 * W2 REQUIRES BOTH TO BE PRESENT before comparing them. `indexOf`
 * returns -1 for something absent, and -1 is less than every real
 * position — so the first draft passed when the prompt had been removed
 * entirely, which is the failure it was written to catch. This project
 * has hit that exact trap before, with `before()`.
 */
ok("W2 CHOOSING THE ELEMENT BEFORE THE REGION IS RECORDED", (() => {
  const a = cast.indexOf("await promptTypeChoice(row.label || spell.name, offered)");
  const b = cast.indexOf("await recordNexus(region, {");
  return a > -1 && b > -1 && a < b;
})(), "the element decides the save the region will ask for");
// FROZEN AT CAST, for the reason the emanation and the prisons freeze
// theirs: a caster who leaves must not change the zone left behind.
/*
 * PINNED TO THE NEXUS'S OWN CALL (3.587.0).
 *
 * This check matched `saveDC: Number(saveDC ?? 0) || 0` ANYWHERE in
 * cast-workflow. That was one line until the recurring ladder started
 * freezing its DC with the same expression for the same reason; with
 * two, the W3 mutation could be applied and this went on passing.
 *
 * Exactly the F4 / B1f shape from 3.586.3, three weeks later, found by
 * the mutation surviving on the full sweep rather than by anyone
 * re-reading the file.
 */
ok("W3 and the save DC is frozen with it",
  /recordNexus\(region, \{\s*\.\.\.row, element, saveDC: Number\(saveDC \?\? 0\) \|\| 0/.test(cast),
  "matched anywhere in the file, the recurring ladder's identical freeze satisfies it");
ok("W4 the zone is swept from the turn clock",
  combat.includes("await applyElementalNexus(actor, combatant.token?.object ?? null)"),
  "\"begins their turn\" is a question movement cannot answer");
// BESIDE LUMINANCE, WHICH ASKS THE SAME QUESTION of an emanation.
ok("W5 beside the emanation sweep that asks the same question",
  combat.indexOf("applyPerTurnEmanations") < combat.indexOf("applyElementalNexus"));
ok("W6 the sweep reads regions, not emanations",
  flow.includes("canvas?.scene?.regions") && !flow.includes("runningEmanations("),
  "a zone that stays where it was cast is not an emanation");
/*
 * W7 ASSERTS THE GATE, NOT THE CALL. The first draft asked only that
 * `region.testPoint` appeared — which stayed true when the line acting
 * on its answer was disabled, so the mutation that charged the whole
 * encounter SURVIVED. Asking a question and ignoring the answer is the
 * shape of defect this project keeps finding; the check has to name the
 * line that USES it.
 */
ok("W7 it asks the region whether the creature is inside",
  flow.includes("region.testPoint({") && flow.includes("if (!inside) continue;"),
  "asking and not acting on the answer charges everyone on the map");
ok("W8 rolls the save the element names", flow.includes("save: save.toLowerCase(),"));
ok("W9 and maps the rolled degree onto the printed ladder",
  flow.includes("nexusOutcome(spec, nexusDegree(rolled))"));
ok("W10 the critical is rolled on the zone's own element",
  flow.includes("damageType: element,") && flow.includes("severity: outcome.severity,"));

/* ── P. THE PACK ─────────────────────────────────────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let nexus = null;
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell" && /^nexus of elemental energy$/i.test(v.name)) nexus = v;
  }
} finally { await db.close(); }
ok("P0 the spell is in the pack", Boolean(nexus));
const row = (nexus?.system?.effects ?? []).find((r) => r?.kind === "elementalNexus") ?? null;
ok("P1 it carries its ladder", normaliseNexus(row)?.ladder.success === "2d6");
ok("P2 offering all four elements", (row?.elements ?? []).length === 4);
/*
 * P3 IS THE CHECK THAT WOULD HAVE CAUGHT A WHOLE WRONG DESIGN. The zone
 * is a PLACE — if it were read as an emanation, the sweep would look in
 * a list that can never contain it and the spell would do nothing, with
 * every rule above still passing.
 */
ok("P3 AND THE AREA IS A PLACE, NOT AN EMANATION",
  !emanationIsLive(nexus?.system) && !/emanation/i.test(String(nexus?.system?.area ?? "")),
  `area is "${nexus?.system?.area}" — an emanation sweep would never see it`);
ok("P4 its save is the one that varies",
  String(nexus?.system?.defence ?? "").toLowerCase() === "varies",
  "the element decides it, not the spell");
ok("P5 and it prints what the system does not apply",
  (normaliseNexus(row)?.notes ?? []).length >= 1,
  "the clause boosting other elemental spells is the table's to apply");
ok("P6 the flag is the one the sweep looks for", NEXUS_FLAG === "elementalNexus");

if (failures.length) {
  process.stderr.write(`verify-elemental-nexus: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-elemental-nexus: OK — ${checks} checks. A place, not an emanation, and the element picks the save.\n`);
