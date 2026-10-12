#!/usr/bin/env node
/**
 * verify-casting-feats — the last two Chapter 5 feats, built at 3.382.0.
 *
 *   SPONTANEOUS SCHOLAR  cast from your library without preparing it,
 *                        Intelligence times a day, up to half caster level
 *   ALTERED CANTRIP      swap one cantrip for one of another tradition
 *
 * TWO SENTENCES IN THESE FEATS NEED NO CODE, and section D holds both
 * claims down against the source rather than trusting my memory of it:
 *
 *   - Altered Cantrip's "you wield it as if it were an inherent part of
 *     your own magical tradition" is ALREADY TRUE. Nothing refuses a
 *     spell for belonging to a tradition that is not yours; the only
 *     tradition gate is a NEGATIVE one for traditions a character has
 *     been explicitly cut off from.
 *
 *   - Spontaneous Scholar's "without studying your spell library" has
 *     only one restriction left to lift. `canCastSpell` was DELETED at
 *     3.348.0, and the single remaining gate refuses exactly one thing:
 *     a book-pool spell not prepared today. For a list-style caster the
 *     feat grants nothing, because nothing was being refused.
 *
 * If either of those facts ever changes, the checks in D go red and these
 * feats need real code. That is the point of asserting them.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { alteredCantripBlocked, isOffTradition, spontaneousScholarAllows } from "../module/magic/casting-feats.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== *
 * A. SPONTANEOUS SCHOLAR — the allowance
 * ================================================================== */

const SS = ["Spontaneous Scholar"];
const allow = (o = {}) => spontaneousScholarAllows({
  featNames: SS, casterLevel: 9, intelligenceScore: 4, ppCost: 1, ...o
});

ok("A1 a held feat with room and a cheap spell allows the cast", allow().allowed);
// THE REAL SCALE. TRG Prime has no 3-18 ability scores — the chapter
// gives "6 points to distribute... no ability score can exceed 4 points",
// rising to 6 with level increases. So the allowance is ONE TO SIX, and
// the score-versus-modifier question this file once agonised over was a
// false dilemma: in this system they are the same number.
for (const [score, expected] of [[1, 1], [2, 2], [4, 4], [6, 6]]) {
  equal(`A2 an Intelligence of ${score} gives ${expected} casts`,
    allow({ intelligenceScore: score }).remaining, expected);
}
ok("A4 the allowance is a plausible feat-sized number at the cap",
  allow({ intelligenceScore: 6 }).remaining === 6,
  "if this ever reads 18, a D&D-scale score has been imported into a game that has none");
equal("A5 spent casts come off the allowance", allow({ usedToday: 3 }).remaining, 1);
ok("A6 an exhausted allowance refuses", !allow({ usedToday: 4 }).allowed);
ok("A7 and says so", /used all 4/.test(allow({ usedToday: 4 }).reason));
ok("A8 an over-spent counter cannot go negative", allow({ usedToday: 99 }).remaining === 0);
ok("A9 an Intelligence of 0 refuses with a reason",
  !allow({ intelligenceScore: 0 }).allowed && /no spontaneous casts/.test(allow({ intelligenceScore: 0 }).reason));

/* ================================================================== *
 * B. SPONTANEOUS SCHOLAR — the PP ceiling
 * ================================================================== */

// "Half your caster level, rounded up." Driven across the boundary,
// because rounding is where this kind of rule goes wrong.
for (const [level, cap] of [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [9, 5], [10, 5], [11, 6]]) {
  equal(`B1 caster level ${level} reaches PP ${cap}`, allow({ casterLevel: level }).cap, cap);
}
ok("B2 a spell at the cap is allowed", allow({ casterLevel: 9, ppCost: 5 }).allowed);
ok("B3 a spell one over it is not", !allow({ casterLevel: 9, ppCost: 6 }).allowed);
ok("B4 and the refusal names both numbers", (() => {
  const r = allow({ casterLevel: 9, ppCost: 6 }).reason ?? "";
  return /PP 5/.test(r) && /costs 6/.test(r);
})(), "a cap the player cannot see is a cap they will keep hitting");
ok("B5 a cantrip is always within the cap", allow({ casterLevel: 1, ppCost: 0 }).allowed);
// THIS IS A SECOND, TIGHTER CAP than `maxPPPerCast` (casterLevel + 1),
// and folding them together would quietly raise one of them.
ok("B6 the cap is well below the ordinary per-cast ceiling",
  allow({ casterLevel: 9 }).cap < 9 + 1,
  "if these two ever coincide, one of them has been replaced by the other");

/* ================================================================== *
 * C. SPONTANEOUS SCHOLAR — the off switch
 * ================================================================== */

const noFeat = spontaneousScholarAllows({ ppCost: 1, casterLevel: 9, intelligenceScore: 4 });
ok("C1 without the feat, nothing is allowed", !noFeat.allowed);
// A REFUSAL WITH NO REASON IS THE RIGHT ANSWER HERE, and the only place
// in this project where that is true: a character who does not hold the
// feat must not be told why their spell was refused BY the feat. The
// generic "not prepared today" is the whole message they should see.
equal("C2 and no reason is offered — they do not have the feat", noFeat.reason, null);
ok("C3 a different feat is not this one",
  !spontaneousScholarAllows({ featNames: ["Spell Adder"], ppCost: 1, casterLevel: 9, intelligenceScore: 4 }).allowed);
ok("C4 case and spacing are tolerated",
  spontaneousScholarAllows({ featNames: [" spontaneous scholar "], ppCost: 1, casterLevel: 9, intelligenceScore: 4 }).allowed);
// Every refusal a HOLDER can see must carry a reason.
for (const state of [{ usedToday: 4 }, { intelligenceScore: 0 }, { ppCost: 99 }]) {
  const r = allow(state);
  ok("C5 a holder's refusal always explains itself",
    !r.allowed && typeof r.reason === "string" && r.reason.length > 10, JSON.stringify(state));
}

/* ================================================================== *
 * D. THE TWO SENTENCES THAT NEED NO CODE
 * ================================================================== */

const availSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/magic/spell-availability.mjs"), "utf8");
const tradSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/magic/tradition-gate.mjs"), "utf8");

// If a positive tradition gate is ever added, Altered Cantrip's "wield it
// as your own" stops being free and needs real code.
ok("D1 the tradition gate is still only about FORBIDDEN traditions",
  /forbiddenTraditions/.test(tradSrc),
  "a positive own-tradition gate would make Altered Cantrip's second sentence real work");
ok("D2 and nothing refuses a spell for merely being off-tradition",
  !/not your tradition|wrong tradition|off-tradition/i.test(tradSrc),
  "if this appears, an off-tradition cantrip would stop being castable");
// If the prepared-gate ever widens beyond book pools, Spontaneous
// Scholar starts mattering to list casters too — and this check is what
// would tell somebody that.
ok("D3 the prepared gate still refuses only book-pool spells",
  /isBookPoolSpell/.test(availSrc),
  "the single restriction Spontaneous Scholar exists to lift");
ok("D4 and canCastSpell is still gone",
  !/export function canCastSpell/.test(fs.readFileSync(path.join(SYSTEM_ROOT, "module/magic/memorisation.mjs"), "utf8")),
  "its return would change what this feat means");

/* ================================================================== *
 * E. ALTERED CANTRIP — the off-tradition filter
 * ================================================================== */

ok("E1 a divine cantrip is off-tradition to an arcane caster", isOffTradition("divinity", "arcane"));
ok("E2 an arcane one is not", !isOffTradition("arcane", "arcane"));
// A SPELL ON SEVERAL LISTS COUNTS AS YOURS IF ANY OF THEM IS. A cantrip
// on both the arcane and divine lists is not "from a tradition other than
// your own" to an arcane caster, whatever else it is also on.
ok("E3 a multi-tradition spell including yours is NOT off-tradition",
  !isOffTradition("arcane, divinity", "arcane"));
ok("E4 a multi-tradition spell excluding yours IS",
  isOffTradition("divinity, ethereal", "arcane"));
ok("E5 spacing and case are tolerated", isOffTradition(" DIVINITY ", " Arcane "));
// A spell with no tradition is not "another tradition" — it is unstated,
// and offering it under a feat about borrowing from elsewhere would be
// inventing a rule.
ok("E6 a spell with no tradition is not offered", !isOffTradition("", "arcane"));
ok("E7 nor is anything, to a caster with no tradition", !isOffTradition("divinity", ""));

/* ================================================================== *
 * F. ALTERED CANTRIP — it replaces, it does not add
 * ================================================================== */

const blocked = (o) => alteredCantripBlocked({ ownedCantrips: 4, candidates: 6, casterTradition: "arcane", ...o });
equal("F1 a caster with cantrips and candidates is not blocked", blocked(), null);
// THE FEAT'S LAST SENTENCE, enforced: "replaces one of your existing
// cantrips and does not add an additional one".
ok("F2 a caster with NO cantrips is refused", Boolean(blocked({ ownedCantrips: 0 })));
ok("F3 and told that it swaps rather than adds",
  /swaps one, it does not add one/.test(blocked({ ownedCantrips: 0 })));
ok("F4 a caster with no tradition is refused", Boolean(blocked({ casterTradition: "" })));
ok("F5 an empty candidate list is refused", /no cantrips from another tradition/.test(blocked({ candidates: 0 })));
for (const state of [{ ownedCantrips: 0 }, { casterTradition: "" }, { candidates: 0 }]) {
  ok("F6 every refusal carries a readable reason",
    typeof blocked(state) === "string" && blocked(state).length > 20, JSON.stringify(state));
}

/* ================================================================== *
 * G. The wiring
 * ================================================================== */

const castSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/magic/cast-workflow.mjs"), "utf8");
const usesSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/uses-workflow.mjs"), "utf8");
const featsWork = fs.readFileSync(path.join(SYSTEM_ROOT, "module/feats-workflow.mjs"), "utf8");

// ORDERING, WITH BOTH ANCHORS REQUIRED TO EXIST. A first version matched
// the two within 400 characters of each other and went red because the
// comment between them is longer than that — a check failing on the
// LENGTH OF A COMMENT is no check at all. And a bare index comparison
// would pass when one side is missing, since -1 is less than everything:
// that shape already got past me once, on the skill-Aid file.
const between = (first, middle, last) => {
  const a = castSrc.indexOf(first);
  const b = castSrc.indexOf(middle);
  const c = castSrc.indexOf(last);
  return a !== -1 && b !== -1 && c !== -1 && a < b && b < c;
};
ok("G1 the waiver sits inside the refusal it lifts",
  between("if (castBlocked) {", "spontaneousScholarAllows({", "spontaneousSpent = true;"),
  "outside it, the feat would be spent on spells that were castable anyway");
ok("G2 the allowance is spent at the point the cast happened",
  castSrc.indexOf('await actor.setFlag(SYSTEM_ID, "spontaneousScholarUsed"') > castSrc.indexOf("const ppSpent ="),
  "spending it at the gate would burn a day's allowance on a cancelled cast");
// THE FIELD, pinned. `.base` is the points allocated at creation;
// `.total` is the score the character has. Reading base would silently
// deny an elf's racial Intelligence to every holder of this feat.
ok("G2b the effective score is read, not the raw allocation",
  /intelligence\?\.total/.test(castSrc) && !/intelligence\?\.base/.test(castSrc),
  "found by building a caster and watching an 18 clamp to 4");
ok("G3 it costs the allowance, not the PP",
  !/spontaneousSpent[\s\S]{0,80}ppSpent = 0/.test(castSrc),
  "the feat lets a Wizard cast what they did not prepare; it does not make it free");
ok("G4 the counter resets at Daily Preparation",
  /unsetFlag\(SYSTEM_ID, "spontaneousScholarUsed"\)/.test(usesSrc),
  "a per-day counter that never clears is a feat that works once per campaign");
ok("G5 a holder's own refusal reaches the notification",
  /scholar\.reason \? `\$\{castBlocked\} \(\$\{scholar\.reason\}\.\)` : castBlocked/.test(castSrc));

ok("G6 Altered Cantrip has an automation entry", /"altered cantrip": \{/.test(featsWork));
// SCOPED TO THE FEAT'S OWN BLOCK. G8 below first searched the WHOLE of
// feats-workflow.mjs, which holds two other `const [created] = await
// actor.createEmbeddedDocuments` calls — `indexOf` found one of those,
// hundreds of lines earlier, and the ordering check passed no matter what
// this feat did. A mutation that swapped the two lines walked straight
// through. An index comparison is only meaningful inside the region it is
// about.
const alteredBlock = (() => {
  const start = featsWork.indexOf('"altered cantrip": {');
  const end = featsWork.indexOf('"improved reposition": {', start);
  return start !== -1 && end !== -1 ? featsWork.slice(start, end) : "";
})();
ok("G6b the block was located, so the checks below mean something",
  alteredBlock.length > 500, `found ${alteredBlock.length} characters`);
ok("G7 it refuses before it offers anything",
  featsWork.indexOf("alteredCantripBlocked({") < featsWork.indexOf("Altered Cantrip — swap a cantrip"),
  "asking a player to choose and then refusing wastes the choice");
// THE ORDER MATTERS. Delete-first would cost a cantrip and give nothing
// back if the creation failed — and the feat's whole promise is that the
// count does not move.
ok("G8 the incoming cantrip is created BEFORE the outgoing one is deleted", (() => {
  const create = alteredBlock.indexOf("const [created] = await actor.createEmbeddedDocuments");
  const remove = alteredBlock.indexOf("await outgoing.delete();");
  return create !== -1 && remove !== -1 && create < remove;
})(), "delete-first would lose a cantrip on any failure");
ok("G9 and a failed creation changes nothing",
  /if \(!created\) \{[\s\S]{0,180}return;/.test(featsWork));
ok("G10 only 0 PP spells are treated as cantrips",
  /Number\(i\.system\?\.ppCost \?\? 0\) === 0/.test(featsWork));
ok("G11 the candidate list is filtered off-tradition",
  /isOffTradition\(e\.system\?\.tradition, casterTradition\)/.test(featsWork));

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\nverify-casting-feats: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-casting-feats: OK — ${checks} checks.\n`);
