#!/usr/bin/env node
/**
 * verify-save-net — the spell whose save net is wider than its area.
 *
 * NEW at 3.488.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOOLS RICHES CAUGHT THE CREATURES IT SAYS ARE IMMUNE.
 *
 *   Area: 5-foot burst
 *   "Any creature within 20 feet OF THE AREA … must make a Will saving
 *    throw. A creature that ENTERS the area automatically recognizes the
 *    illusion and is not at risk of becoming fascinated."
 *
 * Every area spell before this one had a single radius doing both jobs,
 * so `tokensInTemplate` was the whole membership test. Applied to Fools
 * Riches it would have tested exactly the creatures standing in the one
 * five-foot square the spell exempts, and nobody else — a spell that
 * fires, draws its circle, prints a save DC and reaches the wrong set.
 *
 * Graham's ruling, 4 September 2026: **20 feet from the centre**, not 20
 * from the burst's edge.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION W IS THE ONE THAT MATTERS, and it is the lesson this project
 * has now learned four times: not "does the mechanism exist" but "is it
 * REACHED, and does everything downstream still run". A wider net that
 * skipped the disposition filter, line of effect or the kind gate would
 * be a spell that reaches through walls and charms the party — a bigger
 * defect than the one it fixes.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { declaredSaveNetFeet, saveNetLine } from "../module/magic/save-net.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ================================================================== *
 * N. THE RULE
 * ================================================================== */

ok("N1 no declaration means no net", declaredSaveNetFeet({ effects: [] }) === null);
ok("N1b and neither does a spell with no effects at all",
  declaredSaveNetFeet({}) === null && declaredSaveNetFeet(null) === null);
ok("N2 a declared net is read",
  declaredSaveNetFeet({ effects: [{ catchRadiusFeet: 20 }] }) === 20);
ok("N3 THE WIDEST WINS across rows",
  declaredSaveNetFeet({ effects: [{ catchRadiusFeet: 10 }, { catchRadiusFeet: 30 }, {}] }) === 30,
  "the net decides who is ASKED to save; taking the narrowest would drop a "
  + "creature from every effect at once");
ok("N4 zero and nonsense are not a net",
  declaredSaveNetFeet({ effects: [{ catchRadiusFeet: 0 }] }) === null
  && declaredSaveNetFeet({ effects: [{ catchRadiusFeet: "wide" }] }) === null,
  "a net of zero would catch nobody at all — worse than the template it replaces");

ok("N5 the card line names the distance and the drawn shape",
  saveNetLine("Fools Riches", 20, "5-foot burst").includes("within 20 ft")
  && saveNetLine("Fools Riches", 20, "5-foot burst").includes("5-foot burst"),
  "the template and the caught list openly disagree; the card must say why");

/* ================================================================== *
 * W. IS IT REACHED, AND DOES EVERYTHING ELSE STILL RUN
 * ================================================================== */

const cast = read("module", "magic", "cast-workflow.mjs");

ok("W1 the workflow asks for a declared net",
  cast.includes("const netFeet = declaredSaveNetFeet(spellData);"),
  "imported and never called is this project's most-repeated defect");

// W2 THE BRANCH, not the name. `flatDegree` was imported, exported and
// tested for weeks while its only caller was its own verifier.
ok("W2 and branches on it to choose the membership test",
  /const reached = netFeet === null\s*\n\s*\?\s*tokensInTemplate\(placed\)/.test(cast),
  "the template must still be the answer for every spell that declares nothing");
ok("W2b the wide branch measures from the template origin",
  cast.includes("feetFromPointToToken(origin, tok) <= netFeet"),
  "measured with the same function movement, reach and range clamps use");

// W3 THE THREE FILTERS THAT MUST STILL RUN. A wider net that skipped any
// of these would be a worse spell than the one that reached nobody.
ok("W3 disposition still filters what the net reached",
  // The caster-sparing filter (3.611.1, Graham's Q1 ruling) sits between.
  /const disp = reached\s*\n\s*\.filter\(\(tok\) => !\(sparesCaster && casterToken && tok === casterToken\)\)\s*\n\s*\.filter\(\(tok\) => keepByDisposition\(/.test(cast),
  "an allies-only spell must not become an everyone spell at 20 ft");
ok("W3b line of effect still runs on the same list",
  cast.includes("const blocked = breach ? [] : disp.filter((tok) => lineOfEffectBlocked(origin, tok.center));"),
  "20 feet through a wall is still through a wall");
ok("W3c the kind gate still runs on the same list",
  cast.includes("const kindFiltered = filterAreaByKind(actor, spellData, caught);"),
  "Turn Undead widened to 20 ft would stun the party");

// W4 ORDER. The net replaces the membership test and must sit BEFORE the
// filters, or it is filtering a list that was built the old way.
const at = (needle) => cast.indexOf(needle);
ok("W4 the net is chosen before disposition filters it",
  at("const netFeet = declaredSaveNetFeet(spellData);") < at("const disp = reached"),
  "a net computed after the filters would be a net applied to nothing");

ok("W5 the card line is pushed when there is a net",
  cast.includes("lines.push(line(saveNetLine(spell.name, netFeet, describeArea(areaConfig))));")
  && /if \(netFeet !== null\) \{/.test(cast),
  "and only when there is one — every other spell's card is unchanged");

/* ================================================================== *
 * S. THE SPELL, AS IT IS ACTUALLY SHIPPED
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let fools = null;
let netDeclarers = 0;
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.name === "Fools Riches") fools = value;
    if (declaredSaveNetFeet(value?.system) !== null) netDeclarers += 1;
  }
} finally {
  await db.close().catch(() => {});
}

ok("S0 Fools Riches is in the pack", Boolean(fools));
const sys = fools?.system ?? {};
const effects = Array.isArray(sys.effects) ? sys.effects : [];

ok("S1 it declares a 20 ft net", declaredSaveNetFeet(sys) === 20,
  "Graham's ruling: 20 ft from the centre, not 25 from the burst's edge");
ok("S1b while its printed area is untouched", sys.area === "5-foot burst",
  "the drawn shape is the illusion, and the book's stat line is the book's stat line");

ok("S2 the ladder has both rungs the book prints",
  effects.filter((e) => e.kind === "condition" && e.condition === "fixated").length === 2,
  "Success and Failure; Critical is 'unaffected' and correctly has no row");
ok("S2b the success rung expires and the failure rung does not",
  effects.some((e) => e.onSave?.includes("success") && e.duration === "2 rounds")
  && effects.some((e) => e.onSave?.includes("failure") && !e.duration),
  "the failure rung inherits the spell's own sustained duration");

// S3 THE CONDITION IS THE ONE GRAHAM NAMED. The book says "fascinated";
// there is no such condition, and the ruling of 4 September 2026 was
// that it means Fixated — the same ruling as critical row 87-88.
ok("S3 the condition is fixated, not the book's word",
  effects.every((e) => e.kind !== "condition" || e.condition === "fixated"));

// S4 THE PRINTED WORDING SURVIVES. "Until it completes its first action
// on its next turn" parses to null and occurs once in the whole book, so
// it is approximated as 2 rounds — and the approximation is DECLARED on
// the card rather than quietly substituted. 1 round would have expired
// before the creature acted, making the entire rung a silent no-op.
const note = effects.find((e) => e.kind === "note");
ok("S4 the printed wording is carried as a remainder",
  Boolean(note) && note.text.includes("until it completes its first action on its next turn"),
  "an approximation nobody is told about is indistinguishable from a bug");
ok("S4b and the note explains the substitution",
  Boolean(note) && /2 rounds/.test(note.text) && /expiring before the creature acts/.test(note.text));
ok("S4c and it carries the clause that is not automated",
  Boolean(note) && /enters the 5-foot area/.test(note.text),
  "a creature walking into the illusion recognises it — adjudicated, not built");

// S5 THE RATCHET. One spell needs this today. A second arriving without
// a ruling is the drift this project has corrected twice.
ok("S5 exactly one spell declares a save net", netDeclarers === 1,
  `${netDeclarers} declare one; each is a spell whose drawn area and reach disagree, `
  + "and each needs its own reading of the printed text");

if (failures.length) {
  process.stderr.write(`verify-save-net: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-save-net: OK — ${checks} checks. Fools Riches tests 20 ft around a 5-foot burst, `
  + "the three filters still run on what it reaches, and the card says so.\n");
