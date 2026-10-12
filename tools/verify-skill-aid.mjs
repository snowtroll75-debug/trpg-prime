#!/usr/bin/env node
/**
 * verify-skill-aid — Aid Another delivers its bonus to somebody.
 *
 * NEW at 3.380.0.
 *
 * WHAT THIS IS FOR. Chapter 4 says an Aid result "becomes a circumstance
 * bonus to the lead's roll". It became nothing. `rollAidAnother` asked
 * which skill and what the lead's DC was, rolled, posted a card, and
 * never named an ally or applied anything to anyone — a calculator that
 * told you the number and left somebody to type it in.
 *
 * The COMBAT form has done this properly for some time, which is what
 * made the gap invisible: "Aid works" was true of the half most people
 * used in a fight.
 *
 * INNATE TEAMWORK (Racial, Chapter 5) extends a successful Aid to further
 * allies, and could not be built until now for the plainest possible
 * reason — the thing it extends delivered nothing.
 *
 * THE SHARP EDGE, and most of what section B guards: the Bonus Check
 * Table runs from +4 down to **-2**, so a fumbled Aid hands the lead a
 * PENALTY. A calculator lets everyone quietly forget that half. Now that
 * it is delivered automatically, Innate Teamwork must not spread it
 * around the party.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { aidGrant, aidRecipientPool, innateTeamworkExtends } from "../module/skill-aid.mjs";
import { bonusCheckModifier } from "../module/dice/resolution.mjs";

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
 * A. Who can receive it
 * ================================================================== */

const scene = [{ id: "a", name: "Alba" }, { id: "b", name: "Bran" }];
const party = [{ id: "a", name: "Alba" }, { id: "c", name: "Cass" }];

const onScene = aidRecipientPool({ sceneAllies: scene, partyCharacters: party, selfId: "a" });
equal("A1 the scene is preferred when it offers anybody", onScene.source, "scene");
equal("A2 and the aider is not on their own list", onScene.candidates.length, 1);
ok("A3 the one offered is the other ally", onScene.candidates[0].id === "b");

// THE FALLBACK IS THE POINT. Skill Aid is not a combat action, and the
// combat form's canvas-only picker comes up empty for two characters
// helping each other in a library — which would silently grant nothing,
// the exact defect this release removes.
const offScene = aidRecipientPool({ sceneAllies: [], partyCharacters: party, selfId: "a" });
equal("A4 with nobody on the scene, the party is offered", offScene.source, "party");
equal("A5 still excluding the aider", offScene.candidates.map((c) => c.id).join(","), "c");

const nobody = aidRecipientPool({ selfId: "a" });
equal("A6 with nobody at all, there are no candidates", nobody.candidates.length, 0);
ok("A7 and a reason is given", typeof nobody.reason === "string" && nobody.reason.length > 20,
  "rolling into the void with no explanation is what this replaces");
ok("A8 a populated pool carries no reason", onScene.reason === null);

// The same actor can be both a token on the scene and a party character.
const dupes = aidRecipientPool({
  sceneAllies: [{ id: "b", name: "Bran" }, { id: "b", name: "Bran" }],
  partyCharacters: [], selfId: "a"
});
equal("A9 a duplicated ally is offered once", dupes.candidates.length, 1);
// Rubbish in the lists must not become a nameless row in the dialog.
const junk = aidRecipientPool({ sceneAllies: [null, {}, { id: "b", name: "Bran" }], selfId: "a" });
equal("A10 entries with no id are dropped", junk.candidates.length, 1);

/* ================================================================== *
 * B. What the grant is — including when it hurts
 * ================================================================== */

const grantAt = (degree) => aidGrant({ degree, skillLabel: "Athletics", purpose: "force the door", aiderName: "Bran" });

// DRIVEN THROUGH THE ACCESSOR, not by importing the table. `bonusCheckModifier`
// reads BONUS_CHECK_TABLE itself, so the values still come from the real
// table and cannot drift from it — but importing the table HERE made the
// uncalled-exports ratchet report that a genuine orphan had found a
// caller. That is the third time a harness import has flattered those
// numbers this week (TIME_LADDERS, reactionBlockReason, and now this),
// and the rule is the same each time: reach a rule through whatever the
// SYSTEM calls, never through something only the harness would.
const DEGREE_KEYS = ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"];
for (const degree of DEGREE_KEYS) {
  const expected = bonusCheckModifier(degree);
  const grant = grantAt(degree);
  if (expected === 0) {
    equal(`B1 ${degree} grants nothing at all`, grant, null);
    continue;
  }
  equal(`B1 ${degree} grants ${expected}`, grant?.value, expected);
  equal(`B2 ${degree} is a circumstance modifier`, grant?.type, "circumstance");
  ok(`B3 ${degree} is consumed by the roll it belongs to`, grant?.oneShot === true,
    "a bonus that outlives its check would apply to everything afterwards");
}

// A FAILURE GRANTS NOTHING, and must return null rather than a zero — a
// zero-valued row would fill the lead's dialog with something they have
// to read and cannot use.
equal("B4 a plain failure returns null, not a zero", grantAt("failure"), null);
equal("B5 an unknown degree grants nothing", grantAt("wibble"), null);
equal("B6 no degree at all grants nothing", aidGrant({}), null);

// THE PENALTIES ARE REAL AND MUST SURVIVE.
ok("B7 a fumble hands the lead a PENALTY", grantAt("fumble").value === -1);
ok("B8 a blunder hands them a worse one", grantAt("blunder").value === -2);
ok("B9 and both are marked unhelpful", !grantAt("fumble").helpful && !grantAt("blunder").helpful);
ok("B10 while every bonus is marked helpful",
  ["heroic", "critical", "success", "partial"].every((d) => grantAt(d).helpful));

// THE SCOPE IS THE ONLY THING telling the lead which check this belongs
// to — pending-modifiers shows it verbatim in their roll dialog.
const scoped = grantAt("success");
ok("B11 the scope names the skill", /Athletics/.test(scoped.scope));
ok("B12 and the purpose, in the player's own words", /force the door/.test(scoped.scope));
ok("B13 and who gave it", /Bran/.test(scoped.scope));
ok("B14 the label names the action and the aider", /Aid Another \(Bran\)/.test(scoped.label));
// A missing purpose must still produce a usable sentence, not a dangling
// "to " with nothing after it.
const noPurpose = aidGrant({ degree: "success", skillLabel: "Athletics", aiderName: "Bran" });
ok("B15 a blank purpose still reads as a sentence",
  /^The Athletics check Bran aided$/.test(noPurpose.scope), noPurpose.scope);

/* ================================================================== *
 * C. INNATE TEAMWORK
 * ================================================================== */

const TEAM = ["Innate Teamwork"];
const extends_ = (featNames, degree) => innateTeamworkExtends({ featNames, grant: grantAt(degree) });

ok("C1 a successful aid extends", extends_(TEAM, "success"));
ok("C2 as does a critical", extends_(TEAM, "critical"));
ok("C3 and a partial, which still helps", extends_(TEAM, "partial"));
// "AFTER SUCCESSFULLY AIDING" IS A GATE, and the sharp edge of the feat:
// a fumbled Aid is a penalty, and extending it would let one bad roll
// hand the whole party a -1.
ok("C4 a FUMBLED aid does not extend", !extends_(TEAM, "fumble"),
  "extending a penalty would punish the party for one bad roll");
ok("C5 nor does a blunder", !extends_(TEAM, "blunder"));
ok("C6 nor a plain failure, which grants nothing to extend", !extends_(TEAM, "failure"));
ok("C7 without the feat, nothing extends", !extends_([], "critical"));
ok("C8 a different feat is not this one", !extends_(["Group Coercion"], "critical"));
ok("C9 case and spacing are tolerated", extends_([" innate teamwork "], "success"));
ok("C10 a missing grant does not extend", !innateTeamworkExtends({ featNames: TEAM }));

/* ================================================================== *
 * D. The wiring — it must actually reach an ally
 * ================================================================== */

const skillsSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/skills.mjs"), "utf8");

// THE WHOLE POINT OF THE RELEASE.
ok("D1 the aided ally actually receives the modifier",
  /await addPendingModifier\(first, grant\);/.test(skillsSrc),
  "this single line is the difference between the action and a calculator");
// AN ORDERING CHECK MUST FAIL WHEN EITHER SIDE IS ABSENT. The first
// version compared two indexOf results directly, and a mutation that
// deleted the pool call entirely made the left side -1 — which is less
// than everything, so the check passed on code that no longer chose a
// recipient at all. Ordering is only meaningful once both things exist.
const orderedBefore = (first, second) => {
  const a = skillsSrc.indexOf(first);
  const b = skillsSrc.indexOf(second);
  return a !== -1 && b !== -1 && a < b;
};
ok("D2 the recipient is chosen before the roll",
  orderedBefore("aidRecipientPool({", "TRGCheck.roll({"),
  "rolling first and finding nobody to give it to is how this failed before");
ok("D3 an empty pool refuses instead of rolling",
  /if \(!pool\.candidates\.length\) \{[\s\S]{0,120}return null;/.test(skillsSrc));
ok("D4 the purpose is asked for, not invented",
  /name="purpose"/.test(skillsSrc),
  "the scope is shown verbatim to the lead — it has to come from a person");
ok("D5 a failure says it granted nothing",
  /comes to nothing/.test(skillsSrc),
  "silence would leave the lead expecting a bonus that never arrives");
ok("D6 Innate Teamwork is gated on the grant, not merely on the feat",
  /if \(innateTeamworkExtends\(\{ featNames, grant \}\)\)/.test(skillsSrc));
ok("D7 and extends to allies OTHER than the first",
  /pool\.candidates\.filter\(\(a\) => a\.id !== result\.allyId\)/.test(skillsSrc),
  "offering the first ally again would double their bonus");
ok("D8 every extra recipient gets the same grant",
  /await addPendingModifier\(ally, grant\);/.test(skillsSrc));
ok("D9 the card names who it went to",
  /delivered\.join\(/.test(skillsSrc));
// The skill is passed as the check's subject so any conditional keyed to
// that skill reaches the aider's own roll.
ok("D10 the Aid roll is tagged with the skill it uses",
  /subject: skillKey,/.test(skillsSrc));

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\nverify-skill-aid: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-skill-aid: OK — ${checks} checks.\n`);
