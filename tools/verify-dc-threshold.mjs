#!/usr/bin/env node
/**
 * verify-dc-threshold — a spell that sets the DC of somebody else's check.
 *
 * NEW at 3.491.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SILENT BINDING (PP 1) SHIPPED WITH `effects: []`.
 *
 * Its content is a DC — "a successful Perception check AGAINST YOUR
 * SPELL DC" — and a duration ladder that varies by the Fortitude save.
 * Neither existed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NEITHER A CONDITION NOR A MARKER, held here so the next reader
 * does not have to re-derive it.
 *
 * NOT A CONDITION: there is no Muffled condition. The word appears twice
 * in the whole rulebook and Appendix 2 does not list it; "auditory" and
 * "linguistic" are TRAITS. Section V asserts both of those facts against
 * the live registry, so the day somebody adds a Muffled condition this
 * check asks to be reconsidered rather than quietly staying wrong.
 *
 * NOT A MARKER: a marker exists to be READ by a named subsystem, and
 * `verify-markers` refuses one with no reader. There is no reader to
 * write — both Perception actions this system has, Awareness and Search,
 * are declared `against: "none"` because the GM sets their difficulty.
 * Section V asserts that too.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SO THE AUTOMATED HALF IS THE NUMBER, AND SECTION R IS THE HONESTY.
 *
 * A card printing a DC and nothing else would invite a table to believe
 * the adjudication was handled. R asserts the printed sentence is
 * carried and that the card says out loud which half is the GM's — the
 * "automation that is really a reminder" failure, inverted, and just as
 * misleading.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  normaliseDCThreshold, thresholdDC, thresholdLine, thresholdRemainderLine
} from "../module/magic/dc-threshold.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ================================================================== *
 * D. THE DECLARED ROW
 * ================================================================== */

ok("D1 a malformed row is refused",
  normaliseDCThreshold(null) === null && normaliseDCThreshold({ kind: "condition" }) === null);
ok("D2 A ROW THAT NAMES NO CHECK IS REFUSED",
  normaliseDCThreshold({ kind: "dcThreshold", check: "" }) === null,
  "a threshold that does not say what it is FOR is a number nobody can act on");

const binding = normaliseDCThreshold({
  kind: "dcThreshold", check: "Perception", withinFeet: 10, text: "muffled…"
});
ok("D3 Silent Binding's row reads back whole",
  binding.check === "Perception" && binding.withinFeet === 10
  && binding.offset === 0 && binding.atLeast === null);

// D4 THE DEFAULTS ARE THE GENERAL CASE. `withinFeet: null` means the
// spell puts no distance on its threshold — most of the eleven do not.
const plain = normaliseDCThreshold({ kind: "dcThreshold", check: "Escape" });
ok("D4 a row with no distance carries none", plain.withinFeet === null);
ok("D4b and no offset or floor", plain.offset === 0 && plain.atLeast === null);

/* ================================================================== *
 * N. THE NUMBER — measured against the printed spells that need each field
 * ================================================================== */

equal("N1 Silent Binding publishes the spell DC unchanged",
  thresholdDC(binding, 18), 18);

// N2 LOCK (PP 4): "the DC to unlock it or force it open is equal to your
// spell DC +5."
equal("N2 an offset is added",
  thresholdDC(normaliseDCThreshold({ kind: "dcThreshold", check: "Thievery", offset: 5 }), 18), 23);

// N3 PASS WITHOUT TRACE (PP 2): "+4 status bonus, or it becomes equal to
// your spell DC, WHICHEVER OPTION IS HIGHER."
const pwt = normaliseDCThreshold({ kind: "dcThreshold", check: "Survival", atLeast: 24 });
equal("N3 a floor wins when the spell DC is lower", thresholdDC(pwt, 18), 24);
equal("N3b and loses when the spell DC is higher", thresholdDC(pwt, 30), 30);
equal("N3c the two are compared, not added", thresholdDC(pwt, 24), 24);

equal("N4 a negative offset lowers it",
  thresholdDC(normaliseDCThreshold({ kind: "dcThreshold", check: "X", offset: -2 }), 18), 16);

/* ================================================================== *
 * V. THE VOCABULARY THIS SPELL COULD NOT USE
 *
 * Asserted against the live registry and the live action table, so that
 * the day either changes this check asks to be reconsidered instead of
 * silently continuing to be right for a reason that has expired.
 * ================================================================== */

ok("V1 there is still no Muffled condition",
  !Object.keys(CONDITIONS).some((k) => /muffle|silenc/i.test(k))
  && !Object.values(CONDITIONS).some((c) => /muffle|silenc/i.test(String(c.label))),
  "if one is ever added, reconsider whether this spell should apply it instead");

// V2 THE READER THAT DOES NOT EXIST. A marker needs a subsystem to read
// it; the GM setting a Perception DC is the rule here, not a gap.
const perception = SKILL_ACTIONS.filter((a) => (a.skills ?? []).includes("perception"));
ok("V2 the Perception actions exist", perception.length >= 2,
  `found ${perception.map((a) => a.name).join(", ")}`);
ok("V2b and every one of them leaves its DC to the GM",
  perception.every((a) => a.against === "none"),
  "if a Perception action ever gains a DC source, this threshold could feed it "
  + `— ${perception.map((a) => `${a.name}:${a.against}`).join(", ")}`);

/* ================================================================== *
 * W. IS IT REACHED
 * ================================================================== */

const se = read("module", "magic", "spell-effects.mjs");

ok("W1 the effect kind is handled", se.includes('case "dcThreshold": {'));
ok("W1b and it reads the cast's own spell DC",
  se.includes("const spellDC = Number(rollData?.saveDC ?? 0) || 0;"));

// W2 A CAST WITH NO DC PUBLISHES NOTHING, LOUDLY. A threshold of zero is
// one everybody beats without noticing it was there.
ok("W2 a cast with no spell DC is refused out loud",
  se.includes("no spell DC to publish — nothing was applied."),
  "publishing DC 0 would be a silent no-op wearing a card line");
ok("W2b and applies nothing in that case",
  /if \(!spellDC\) \{[\s\S]{0,400}?break;\s*\n\s*\}/.test(se));

// W3 STORED, NOT RECOMPUTED. Same reasoning as emanation's saveDC.
ok("W3 the DC is written onto the effect",
  se.includes("dcThreshold: {\n                check: spec.check, dc, withinFeet: spec.withinFeet, text: spec.text\n              }"),
  "a caster since weakened must not lower a standing DC");
/*
 * THE CASE ITSELF, SLICED — not matched with a character budget.
 *
 * The first version of W3b used `[\s\S]{0,2000}?` to stay inside the
 * case, and failed because the case is longer than the number I guessed.
 * A budget that is too SHORT fails loudly, which is how this was found;
 * one that is too LONG is the real hazard, because it silently reaches
 * into the next case and passes on somebody else's code.
 */
const caseStart = se.indexOf('case "dcThreshold": {');
const caseEnd = se.indexOf('case "condition": {', caseStart);
const dcCase = caseStart !== -1 && caseEnd > caseStart ? se.slice(caseStart, caseEnd) : "";

ok("W3a the case was found and is not empty", dcCase.length > 500,
  `sliced ${dcCase.length} chars — an empty slice makes W3b/W3c vacuously true`);
ok("W3b through the shared effect creation, so it expires like any other",
  dcCase.includes("await createEffectsOn(target, [data]);"),
  "a bespoke effect would not be dispelled, cleared or expired by anything else");
ok("W3c and through the shared duration timing",
  dcCase.includes("const timing = spellExpiryTiming(parsedDuration);"),
  "the duration ladder needed no new mechanism — per-effect durations already existed");

/* ================================================================== *
 * R. THE HONEST HALF
 * ================================================================== */

const dc = thresholdDC(binding, 18);
const cardLine = thresholdLine(binding, "Silent Binding", "Jonas", dc);
ok("R1 the card names the check, the number and the distance",
  cardLine.includes("Perception DC 18") && cardLine.includes("beyond 10 ft")
  && cardLine.includes("Jonas"));
ok("R1b a threshold with no distance names none",
  !thresholdLine(plain, "Rope Trick", "Jonas", 18).includes("beyond"));

ok("R2 THE PRINTED SENTENCE IS CARRIED",
  thresholdRemainderLine(binding).includes("muffled…"),
  "carried rather than paraphrased — a summary would put words in the book's mouth");
ok("R2b AND THE CARD SAYS WHICH HALF IS THE GM'S",
  /GM's call/.test(thresholdRemainderLine(binding)),
  "a card printing only the number invites a table to think the rest is handled");
ok("R2c a row with no printed text says nothing rather than something empty",
  thresholdRemainderLine(plain) === null);

ok("R3 the workflow prints both lines",
  se.includes("lines.push(line(thresholdLine(spec, spell.name, target.name, dc) + durationText));")
  && se.includes("const remainder = thresholdRemainderLine(spec);"));

/* ================================================================== *
 * S. THE SPELL AS SHIPPED, AND THE RATCHET
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let spell = null;
const declarers = [];
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.name === "Silent Binding") spell = value;
    if ((value?.system?.effects ?? []).some((e) => e?.kind === "dcThreshold")) {
      declarers.push({ name: value.name, pp: Number(value.system.ppCost) });
    }
  }
} finally {
  await db.close().catch(() => {});
}

const rows = (spell?.system?.effects ?? []).filter((e) => e.kind === "dcThreshold");
equal("S1 Silent Binding declares three rungs", rows.length, 3);

// S2 THE LADDER AS PRINTED. Critical is "unaffected" and correctly has
// no row at all.
//
// AND A PARTIAL READS AT SUCCESS, NOT AT FAILURE. This comment claimed
// the opposite until it was driven live on 4 September 2026: Toben
// rolled a Partial (14 vs 16), the card said "is affected", and the
// SUCCESS rung fired — one round rather than one minute.
//
// That is what `effectiveSaveDegree` does, and it is not a bug in it:
// the rule keeps only declared degrees whose rank is >= the rolled one
// and takes the lowest, so an unnamed degree reads at the nearest rung
// that is NO WORSE for the target. Whether that is the right direction
// is Graham's to rule on — see the report of 4 September — but the
// comment must describe the code rather than my memory of it.
const rung = (deg) => rows.find((r) => (r.onSave ?? []).includes(deg));
ok("S2 success is one round", rung("success")?.duration === "1 round");
ok("S2b failure is one minute", rung("failure")?.duration === "1 minute");
ok("S2c fumble is ten minutes", rung("fumble")?.duration === "10 minutes");
ok("S2d and the critical rung carries no row",
  !rows.some((r) => (r.onSave ?? []).includes("critical")),
  "\"The target is unaffected\" — a row would apply something");

ok("S3 every rung publishes the same check at the same reach",
  rows.every((r) => r.check === "Perception" && r.withinFeet === 10),
  "the save changes how LONG it lasts, never what it does");
ok("S3b and every rung carries the printed sentence",
  rows.every((r) => String(r.text ?? "").includes("inaudible to creatures more than 10 feet away")));

// S4 THE TIER RATCHET. The mechanism serves ten more spells from PP 2 to
// PP 16 and NONE of them is wired — Graham's ruling is to finish PP 1,
// then PP 2. A second declarer arriving before the tier reaches it is
// the drift this project has corrected twice.
ok("S4 exactly one spell declares a threshold, and it is PP 1",
  declarers.length === 1 && declarers[0].pp === 1,
  `declarers: ${JSON.stringify(declarers)} — Pass Without Trace and Rope Trick (PP 2) are `
  + "next, and not before the tier order reaches them");

if (failures.length) {
  process.stderr.write(`verify-dc-threshold: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-dc-threshold: OK — ${checks} checks. The DC is computed once, carried, printed, and `
  + "expires on its own; the adjudication is named as the GM's.\n");
