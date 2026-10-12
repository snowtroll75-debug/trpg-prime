#!/usr/bin/env node
/**
 * verify-sanctuary — R1: the spell with no rows, and the first Grimoire
 * entry that reaches into the attack workflow.
 *
 * NEW at 3.598.0. Graham's R1 of block 31: "Build in Full."
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS THE DEFECT I WALKED INTO AND ALMOST SHIPPED.
 *
 * Sanctuary's pack entry carries `defence: "Will"`, because the page prints
 * "Saving Throw Will". The cast workflow's save branch fires on that field
 * alone — so the spell would have asked the PROTECTED ALLY to roll Will to
 * resist their own ward, and `beneficial-save.mjs`, which reads the same
 * field, would have called a 2 PP protection an attack. A cleric warding a
 * friend, and the friend rolling to shrug it off.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SANCTUARY, SANCTUARY_FLAG, normaliseSanctuary, sanctuaryBlockedTurnLine,
  sanctuaryEndedLine, sanctuaryFumbledLine, sanctuaryLine, sanctuaryOutcome,
  sanctuaryPassedLine, sanctuaryRecordAfter, sanctuaryStillBlockedLine,
  sanctuaryVerdict, spellDefersItsSave
} from "../module/magic/sanctuary.mjs";
import { WARD_FLAG, sanctuaryWardsOn } from "../module/combat/sanctuary-gate.mjs";
import { isBeneficialSpell } from "../module/magic/beneficial-save.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { SAVE_DEGREE_KEYS } from "../module/magic/spell-degrees.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const eq = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const applier = strip(read("module", "magic", "spell-effects.mjs"));
const attackWf = strip(read("module", "combat", "attack-workflow.mjs"));
const castWf = strip(read("module", "magic", "cast-workflow.mjs"));
const actionWf = strip(read("module", "combat", "action-workflow.mjs"));
const gate = strip(read("module", "combat", "sanctuary-gate.mjs"));

/* ================================================================== *
 * L. THE PRINTED LADDER, AND THE FOUR DEGREES IT DOES NOT NAME
 * ================================================================== */

eq("L1 a success lets the attack through", sanctuaryOutcome("success"), SANCTUARY.PASSED);
/*
 * L1b AND L4c ARE THE SAME LINE OF CODE. The ladder names `success` and
 * nothing better; critical and heroic are success-side degrees the rule
 * returns unchanged, so both reach the `?? PASSED` fallback. That fallback is
 * therefore load-bearing for every save better than the best rung printed,
 * and a mutation making it block is caught here twice over.
 */
eq("L1b and so does a critical, through the fallback", sanctuaryOutcome("critical"), SANCTUARY.PASSED);
eq("L2 A FAILURE BLOCKS THIS TURN", sanctuaryOutcome("failure"), SANCTUARY.BLOCKED_TURN);
eq("L3 A FUMBLE BLOCKS FOR THE DURATION", sanctuaryOutcome("fumble"), SANCTUARY.BLOCKED_DURATION);
/*
 * L4 IS THE FEAR BUG'S CURE APPLIED BEFORE IT CAN HAPPEN. The page names
 * three rungs; this system rolls seven degrees. Read naively, `heroic`,
 * `partial` and `blunder` match nothing — and a BLUNDER matching nothing
 * would mean the single worst save in the game lets the attack through while
 * a mere fumble locks the attacker out for a minute. Rolling worse making you
 * better off is the exact defect `effectiveSaveDegree` was written for, and
 * this ladder goes through it rather than round it.
 */
eq("L4 A BLUNDER IS A WORSE FUMBLE, not an escape",
  sanctuaryOutcome("blunder"), SANCTUARY.BLOCKED_DURATION,
  "the worst save in the game must not be the one that gets through");
eq("L4b a partial is clamped to the harsher side it does not name",
  sanctuaryOutcome("partial"), SANCTUARY.BLOCKED_TURN);
eq("L4c and a heroic save is better than the best rung printed, so it passes",
  sanctuaryOutcome("heroic"), SANCTUARY.PASSED);
ok("L4d EVERY DEGREE THIS SYSTEM ROLLS LANDS SOMEWHERE",
  SAVE_DEGREE_KEYS.every((k) => Object.values(SANCTUARY).includes(sanctuaryOutcome(k))),
  `${SAVE_DEGREE_KEYS.filter((k) => !Object.values(SANCTUARY).includes(sanctuaryOutcome(k))).join(", ")} land nowhere`);
eq("L5 an unreadable degree does not block", sanctuaryOutcome("banana"), SANCTUARY.PASSED,
  "a hand-edited degree must not make a creature unattackable");

/* ================================================================== *
 * V. THE PER-OPPONENT RECORD
 * ================================================================== */

eq("V1 an opponent that has not faced the ward must save",
  JSON.stringify(sanctuaryVerdict({}, "a", 1)),
  JSON.stringify({ mustSave: true, blocked: false, reason: null }));
{
  const passed = sanctuaryRecordAfter({}, "a", "success", 1);
  eq("V2 ONE THAT PASSED NEVER SAVES AGAIN — \"any other attacks … normally\"",
    JSON.stringify(sanctuaryVerdict(passed, "a", 9)),
    JSON.stringify({ mustSave: false, blocked: false, reason: null }));
  const failed = sanctuaryRecordAfter({}, "a", "failure", 3);
  eq("V3 one that failed is blocked in the round it failed",
    JSON.stringify(sanctuaryVerdict(failed, "a", 3)),
    JSON.stringify({ mustSave: false, blocked: true, reason: SANCTUARY.BLOCKED_TURN }));
  eq("V3b AND SAVES AFRESH ON A LATER ROUND rather than attacking freely",
    JSON.stringify(sanctuaryVerdict(failed, "a", 4)),
    JSON.stringify({ mustSave: true, blocked: false, reason: null }),
    "the page says a fresh saving throw, not a free attack");
  const fumbled = sanctuaryRecordAfter({}, "a", "fumble", 3);
  eq("V4 one that fumbled is blocked for ever after, in any round",
    JSON.stringify(sanctuaryVerdict(fumbled, "a", 99)),
    JSON.stringify({ mustSave: false, blocked: true, reason: SANCTUARY.BLOCKED_DURATION }));
  eq("V4b and a fumble stores no round, because it does not need one",
    fumbled.a.round, null);
  /*
   * V5 IS THE SHAPE I REACHED FOR FIRST AND IT WAS WRONG. "The first time
   * each opponent" is not one boolean on the ward: a success is permanent and
   * a failure is not, so two attackers can be in different states at once.
   */
  const mixed = sanctuaryRecordAfter(sanctuaryRecordAfter({}, "a", "fumble", 1), "b", "success", 1);
  eq("V5 TWO OPPONENTS HOLD DIFFERENT VERDICTS AT ONCE",
    `${sanctuaryVerdict(mixed, "a", 5).blocked}/${sanctuaryVerdict(mixed, "b", 5).blocked}`,
    "true/false");
  eq("V5b and a third who has met neither still saves",
    sanctuaryVerdict(mixed, "c", 5).mustSave, true);
}
/*
 * V6: OUT OF COMBAT THERE IS NO ROUND. A stored null can never differ from a
 * later null, so a turn-lockout out of combat would last for ever — the
 * silent-forever shape this project refuses. Each attempt saves afresh.
 */
eq("V6 a turn lockout recorded outside combat does not last for ever",
  sanctuaryVerdict(sanctuaryRecordAfter({}, "a", "failure", null), "a", null).mustSave, true);
eq("V6b and a lockout from a round does not bind once combat has ended",
  sanctuaryVerdict(sanctuaryRecordAfter({}, "a", "failure", 2), "a", null).mustSave, true);
eq("V7 A HAND-EDITED VERDICT IS NOT A LOCKOUT",
  sanctuaryVerdict({ a: { state: "whatever" } }, "a", 1).blocked, false,
  "a bad flag must not make a creature unattackable for ever");
eq("V7b and neither is a missing state", sanctuaryVerdict({ a: {} }, "a", 1).mustSave, true);
eq("V8 the record is rebuilt rather than mutated",
  (() => { const before = {}; sanctuaryRecordAfter(before, "a", "fumble", 1); return Object.keys(before).length; })(), 0);

/* ================================================================== *
 * D. THE SAVE BELONGS TO SOMEBODY ELSE
 * ================================================================== */

ok("D1 THE CAST-TIME SAVE BRANCH ASKS THE EFFECT LIST, not the spell's name",
  // RE-READ 3.609.0: Turn Undead's own deferral follows on the next line.
  /&& !spellDefersItsSave\(spellData\.effects\)\n/.test(castWf),
  "without this the protected ALLY rolls Will to resist their own ward");
ok("D1b and the rule lives with the spell rather than at the call site",
  spellDefersItsSave([{ kind: "sanctuary" }]) === true
  && spellDefersItsSave([{ kind: "condition" }]) === false
  && spellDefersItsSave(null) === false);
ok("D2 A WARD IS NOT AN ATTACK, even though it prints a save",
  isBeneficialSpell({ defence: "Will", effects: [{ kind: "sanctuary" }] }) === true,
  "the field that means \"aimed at them\" is misleading here");
ok("D2b and an ordinary save spell still is not beneficial",
  isBeneficialSpell({ defence: "Will", effects: [{ kind: "condition" }] }) === false);
ok("D2c nor is a ward that also deals damage",
  isBeneficialSpell({ defence: "Will", effects: [{ kind: "sanctuary" }, { kind: "damage" }] }) === false);
ok("D2d and the conservative default is untouched: a save spell with a heal is still not",
  isBeneficialSpell({ defence: "Will", effects: [{ kind: "heal" }] }) === false);

/* ================================================================== *
 * G. THE GATE, AND WHERE IT IS WIRED
 * ================================================================== */

ok("G1 the kind is handled and declared",
  HANDLED_EFFECT_KINDS.includes("sanctuary") && /case "sanctuary": \{/.test(applier));
ok("G1b the ward carries the flag the gate looks for, and no changes",
  /\[WARD_FLAG\]: true/.test(applier) && /changes: \[\],\s+flags: wardFlags/.test(applier),
  "an effect with changes would alter the sheet; this one only carries facts");
ok("G1c AND EVERYTHING THE LATER SAVE NEEDS IS STORED NOW",
  /sanctuaryDC: Number\(saveDC \?\? 0\) \|\| null/.test(applier)
  && /sanctuaryCaster: caster\?\.uuid/.test(applier)
  && /sanctuaryTraits: spell\.system\?\.traits/.test(applier)
  && /sanctuaryTradition: spell\.system\?\.tradition/.test(applier),
  "that roll opens no dialog, so a fact it is not told here can never be asked about");
eq("G1d and the record starts empty", /sanctuary: \{\}/.test(applier), true);

/*
 * G2 IS THE TWO-SIDED COST. "Wastes the action" and "can't ATTEMPT" are
 * different prices, so the gate is asked before the AP spend and honoured
 * after it.
 */
/*
 * G2 MEASURES THAT THE CALL EXISTS BEFORE IT COMPARES POSITIONS. The first
 * draft compared `indexOf` values alone, and a mutation that deleted the call
 * outright gave −1, which is less than any real position — so the check
 * passed on a tree where the gate was never asked. `indexOf` returning −1 is
 * the fourth defect shape in this project's register and it caught me in my
 * own check.
 */
ok("G2 THE GATE IS ASKED AT ALL", attackWf.includes("sanctuaryCheck(actor, targetActor"),
  "deleting the call gave indexOf −1, which sorted before the spend and passed");
ok("G2a AND BEFORE THE AP IS SPENT",
  attackWf.indexOf("sanctuaryCheck(actor, targetActor") >= 0
  && attackWf.indexOf("sanctuaryCheck(actor, targetActor") < attackWf.indexOf("spendActionPoints(actor, \"1\""),
  "an opponent already locked out cannot attempt the attack and pays nothing");
ok("G2b an attempt that is merely refused costs nothing",
  /if \(sanctuary\.blocked && !sanctuary\.wastesAction\) return null;/.test(attackWf));
ok("G2c AND A FAILED SAVE WASTES THE ACTION, after the spend",
  attackWf.indexOf("if (sanctuary.blocked) return null;") > attackWf.indexOf("spendActionPoints(actor, \"1\""));
/*
 * G2d COUNTS THE BRANCHES. Testing that `wastesAction = true` appears
 * somewhere was satisfied by whichever branch the mutation left alone — the
 * fifth defect shape, a check satisfied by an unrelated occurrence. BOTH
 * printed failures say the action is wasted, so both branches must set it.
 */
ok("G2d the gate answers both questions in one call",
  /return \{ blocked, wastesAction \};/.test(gate));
eq("G2e AND BOTH PRINTED FAILURES WASTE THE ACTION, each in its own branch",
  (gate.match(/wastesAction = true;/g) ?? []).length, 2,
  "the fumble rung and the failure rung each say so in as many words");
ok("G3 A SPELL ATTACK IS AN ATTACK TOO",
  /const ward = await sanctuaryCheck\(actor, targetActor, spell\.name\);/.test(castWf),
  "a ward that stops swords and not Magic Missile is a gap a player finds in one session");
/*
 * G4 DRIVES THE READER instead of reading its source. The uncalled-export
 * ratchet caught the first version: `sanctuaryWardsOn` was exported and this
 * file asserted a regex about it, which is not a caller — "an exported rule
 * nobody calls is not automation, it is a well-tested opinion". Running it is
 * both a caller and a better test.
 */
{
  const ward = (flags, extra = {}) => ({
    disabled: false, flags,
    getFlag: (_s, k) => flags?.["trg-prime"]?.[k],
    ...extra
  });
  const real = ward({ "trg-prime": { [WARD_FLAG]: true } });
  const other = ward({ "trg-prime": { spellBuff: true } });
  const off = ward({ "trg-prime": { [WARD_FLAG]: true } }, { disabled: true });
  eq("G4 a ward is found", sanctuaryWardsOn({ effects: [real] }).length, 1);
  eq("G4a another spell's effect is not", sanctuaryWardsOn({ effects: [other] }).length, 0);
  eq("G4b A SUPPRESSED WARD DOES NOT PROTECT", sanctuaryWardsOn({ effects: [off] }).length, 0,
    "the same read missChanceAvoidance uses for See Invisible");
  eq("G4c appliedEffects is preferred over effects",
    sanctuaryWardsOn({ appliedEffects: [real], effects: [real, real] }).length, 1);
  eq("G4d and an actor with nothing on it is safe to ask", sanctuaryWardsOn(null).length, 0);
}
ok("G4e the reader is what the gate uses", /sanctuaryWardsOn\(targetActor\)/.test(gate));
ok("G4f a roll with no degree is not recorded as a pass",
  /if \(!degree\) \{/.test(gate) && /produced no degree/.test(gate),
  "a cancelled or DC-less save must leave the ward exactly as it was");
eq("G5 the ward flag and the record flag are different things",
  `${WARD_FLAG}/${SANCTUARY_FLAG}`, "sanctuaryWard/sanctuary");

/* ================================================================== *
 * H. THE HOSTILE ACTION THAT ENDS IT
 * ================================================================== */

/*
 * H1 IS THE GAP A WARD WIRED ONLY TO THE ACTION PATHS WOULD HAVE HAD. A
 * Strike does not pass through `resolveAction`, so the three commit points
 * that already end things on an offensive action never see the most obvious
 * hostile act in the game.
 */
ok("H1 THE ATTACK WORKFLOW ENDS THE ATTACKER'S OWN WARD",
  /await endSanctuaryOnHostileAction\(actor\);/.test(attackWf),
  "a Strike does not pass through resolveAction");
eq("H1b and all three action commit points do too",
  (actionWf.match(/await endSanctuaryOnHostileAction\(actor, action\);/g) ?? []).length, 3,
  "the same three places that bite an offensive curse");
ok("H2 an action is TESTED for hostility and a Strike is not asked about",
  /if \(action\) \{/.test(gate) && /isOffensiveAction/.test(gate),
  "the attack path is hostile by construction; null means the caller already decided");
ok("H3 the end is swallowed rather than thrown",
  /catch \(error\) \{/.test(gate) && /could not be ended/.test(gate),
  "this runs on the commit path; a throw would lose the action after the AP was spent");
ok("H3b AND THE CATCH DOES NOT RETHROW",
  !/catch \(error\) \{[\s\S]{0,400}throw /.test(gate),
  "swallowing it is the whole point: losing a player's action to a ward's bookkeeping is worse than the ward failing");

/* ================================================================== *
 * C. THE CARD
 * ================================================================== */

ok("C1 the cast card says whose save it is", /each \\n?opponent|first time each/.test(sanctuaryLine("X", " (1 minute)")));
ok("C1b and that a hostile action ends it",
  /hostile action by X ends it/.test(sanctuaryLine("X", "")));
ok("C2 a pass says it is permanent", /from now on/.test(sanctuaryPassedLine("A", "B")));
ok("C3 A FAILURE SAYS THE ACTION IS WASTED", /the action is wasted/.test(sanctuaryBlockedTurnLine("A", "B", true)));
ok("C3b and names the turn when a round is running", /this turn/.test(sanctuaryBlockedTurnLine("A", "B", true)));
ok("C3c and says why it does not, when none is",
  /no round is running/.test(sanctuaryBlockedTurnLine("A", "B", false)),
  "the out-of-combat reading is a decision and the table should see it");
ok("C4 a fumble names the duration", /rest of Sanctuary's duration/.test(sanctuaryFumbledLine("A", "B")));
ok("C5 a refused attempt is said out loud rather than doing nothing",
  /cannot attempt to attack/.test(sanctuaryStillBlockedLine("A", "B", SANCTUARY.BLOCKED_TURN)));
ok("C5b and names which lockout it is",
  /rest of this turn/.test(sanctuaryStillBlockedLine("A", "B", SANCTUARY.BLOCKED_TURN))
  && /rest of Sanctuary's duration/.test(sanctuaryStillBlockedLine("A", "B", SANCTUARY.BLOCKED_DURATION)));
ok("C6 and the end names why", /took a hostile action/.test(sanctuaryEndedLine("X")));

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let sys = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() === "sanctuary") { sys = v.system; break; }
    }
  } finally { await db.close(); }
  ok("P0 Sanctuary is in the pack", Boolean(sys));
  const rows = sys?.effects ?? [];
  ok("P1 SANCTUARY DOES SOMETHING AT LAST",
    Boolean(normaliseSanctuary(rows.find((r) => r.kind === "sanctuary"))),
    "the whole page is one mechanism and the entry carried `effects: []`");
  eq("P1b on the creature it is cast on",
    rows.find((r) => r.kind === "sanctuary")?.target, "targets");
  eq("P2 and its printed save is still declared, because the opponents roll it",
    sys?.defence, "Will");
  eq("P2b so the pack entry is one the deferral rule recognises",
    spellDefersItsSave(rows), true);
  const notes = rows.filter((r) => r.kind === "note").map((r) => String(r.text ?? "")).join(" ");
  ok("P3 the card says whose save it is",
    /THE SAVE IS THE OPPONENT'S, NOT THE PROTECTED CREATURE'S/.test(notes));
  ok("P3b the four unprinted degrees are accounted for in writing",
    /Heroic save lets the attack through/.test(notes) && /Blunder blocks for the whole/.test(notes));
  ok("P3c the out-of-combat reading is stated",
    /OUT OF COMBAT EACH ATTEMPT SAVES AFRESH/.test(notes));
  ok("P3d and what counts as a hostile action is listed",
    /A HOSTILE ACTION BY THE PROTECTED CREATURE ENDS THE SPELL/.test(notes)
    && /Moving, drinking a potion and healing an ally do not/.test(notes));
  eq("P4 malformed rows are refused", normaliseSanctuary({ kind: "note" }), null);
}

if (failures.length) {
  process.stderr.write(`verify-sanctuary: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-sanctuary: OK — ${checks} checks. A ward the attack path reads, `
  + `one verdict per opponent, and a save that belongs to whoever swings.\n`);
