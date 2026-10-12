#!/usr/bin/env node
/**
 * verify-resurrection — R6: four printed consequences, none of them automated.
 *
 * NEW at 3.602.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A PP 12 SPELL WHOSE WHOLE POINT IS THAT IT IS EXPENSIVE, and the pack entry
 * carried `effects: []`. Everything the page charges for — the empty pools, a
 * week of injury nothing can lift, a permanent cut to how many times you can
 * survive dying, and a failure that closes the door for ever — happened only
 * if a GM remembered all four.
 *
 * SECTION S IS THE ONE NEW MECHANISM: a condition nothing can remove. The
 * condition itself stays ORDINARY — the sheet must still show Injured 2 and
 * apply its penalties — and the seal sits beside it, read by the relief path.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SEALED_FLAG, isSealed, prunedSeals, sealAppliedLine, sealRefusedLine, sealRemaining, withSeal
} from "../module/conditions/sealed.mjs";
import {
  FAILED_FLAG, POOLS_LEFT_ALONE, alreadyFailedLine, deathStateAfterReturn, deathStateLine,
  debilitatedLine, failureClosesLine, judgedAtTheTableLine, restoredLine, restoredResourceUpdate,
  resurrectionRefused, soulDestroyedLine, soulIsDestroyed, spellFailureIsFinal
} from "../module/magic/resurrection.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { RELIEVABLE } from "../module/magic/condition-relief.mjs";
import { CONDITIONS, conditionModifiers } from "../module/conditions/registry.mjs";

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
const cast = strip(read("module", "magic", "cast-workflow.mjs"));

/* ================================================================== *
 * P. THE POOLS, AND THE TWO DELIBERATELY LEFT ALONE
 * ================================================================== */

const update = restoredResourceUpdate();
eq("P1 restored with ONE Hit Point", update["system.resources.hp.value"], 1);
eq("P2 and ZERO Power Points", update["system.resources.pp.value"], 0);
eq("P3 the daily pools are emptied",
  ["endeavour", "conviction"].map((k) => update[`system.resources.${k}.value`]).join(","),
  "0,0");
// 3.624.0, block 40's R17: luck is the player's, never refills daily, and 0
// sat below Appendix 5's floor of 2.
ok("P3b luck is left alone", !("system.resources.luck.value" in update));
/*
 * P4 IS A RULING, AND THE CARD SAYS SO. AP and reactions refill every TURN,
 * not every day, so emptying them would stop a creature raised mid-combat from
 * acting at all — a punishment the page does not name.
 */
ok("P4 AP AND REACTIONS ARE UNTOUCHED, because they are not daily",
  !("system.resources.ap.value" in update) && !("system.resources.reactions.value" in update),
  "a creature raised in combat would otherwise be unable to act until its next turn");
eq("P4b and the two are named, so the card can explain itself",
  JSON.stringify(POOLS_LEFT_ALONE), JSON.stringify(["ap", "reactions"]));
ok("P5 every key is a DOTTED path, never a nested object",
  Object.keys(update).every((k) => k.includes(".") && k.startsWith("system.")),
  "the pass that blanked every sheet in this world wrote a whole nested object");
eq("P6 and nothing else is written", Object.keys(update).length, 4);

/*
 * P7 IS THE 3.602.0 SHIPPED DEFECT, AND IT IS NOT A STYLE POINT.
 *
 * This used to hand out the frozen canonical object. `Actor#update` WRITES to
 * the update it is given — it adds `_id` — so Foundry threw "object is not
 * extensible", and it threw AFTER the applier had cleared dead, dying and
 * unconscious. The live test found the corpse standing up with 0 Hit Points and
 * none of the spell's four costs charged.
 *
 * So the check does what Foundry does: takes the update and writes to it.
 */
{
  const first = restoredResourceUpdate();
  const second = restoredResourceUpdate();
  ok("P7 THE UPDATE CAN BE WRITTEN TO, because Foundry adds `_id` to it",
    (() => { try { first._id = "abc123"; return first._id === "abc123"; } catch { return false; } })(),
    "a frozen update threw mid-apply and left a creature raised for free");
  ok("P7b and each call gets its OWN copy, so one caller cannot spoil the next",
    second._id === undefined && restoredResourceUpdate()["system.resources.hp.value"] === 1,
    "writing to what one caller received must not change the rule for everybody else");
}

/* ================================================================== *
 * D. DEATH STATE — THE PERMANENT ONE
 * ================================================================== */

eq("D1 it falls by one each time", deathStateAfterReturn(5), 4);
eq("D1b from wherever it stands", deathStateAfterReturn(2), 1);
eq("D2 AND IS FLOORED AT ZERO", deathStateAfterReturn(0), 0,
  "a negative Death State is not a worse fate — it is a number nothing reads correctly");
eq("D2b including from nonsense", deathStateAfterReturn("banana"), 0);
eq("D3 a soul is destroyed at zero", soulIsDestroyed(0), true);
eq("D3b and not at one", soulIsDestroyed(1), false);
eq("D3c nor below zero, which cannot happen but must not read as safe", soulIsDestroyed(-1), true);
ok("D4 the applier writes the reduced value and names both",
  /"system\.combat\.deathState": now/.test(applier) && /deathStateLine\(target\.name, was, now\)/.test(applier));
ok("D4b and reads the creature's own starting value rather than assuming five",
  /Number\(target\.system\?\.combat\?\.deathState \?\? 5\)/.test(applier));
ok("D5 the soul line only appears at zero",
  /if \(soulIsDestroyed\(now\)\) lines\.push\(line\(soulDestroyedLine/.test(applier));

/* ================================================================== *
 * S. A CONDITION NOTHING CAN LIFT
 * ================================================================== */

ok("S0 injured is a real, valued condition the sheet reads",
  Boolean(CONDITIONS.injured?.valued) && Boolean(RELIEVABLE.injured),
  "the seal must leave the condition ORDINARY — a creature whose injury is not an injury is worse");
{
  const sealed = withSeal({}, "injured", 604800, 1000);
  eq("S1 a seal lasts the week it was given", sealRemaining(sealed, "injured", 1000), 604800);
  eq("S1b and is spent when the week is up", isSealed(sealed, "injured", 1000 + 604800), false);
  eq("S1c a second earlier, it is not", isSealed(sealed, "injured", 1000 + 604799), true);
  eq("S2 it seals ONE condition, not all of them", isSealed(sealed, "dazed", 1000), false);
  eq("S3 THE LONGER SEAL WINS, so a second cannot shorten the first",
    sealRemaining(withSeal(sealed, "injured", 60, 1000), "injured", 1000), 604800);
  eq("S3b and a longer one does replace it",
    sealRemaining(withSeal(sealed, "injured", 999999, 1000), "injured", 1000), 999999);
  eq("S4 a seal of no length is not a seal", JSON.stringify(withSeal({}, "injured", 0, 1000)), "{}");
  eq("S4b and neither is one on nothing", JSON.stringify(withSeal({}, "", 600, 1000)), "{}");
  // MEASURED ON sealRemaining, NOT isSealed: `NaN > 0` is already false, so a check on
  // isSealed would pass with or without the guard and pin nothing. What the guard is
  // actually for is that the SECONDS are always a number a caller can do sums with.
  eq("S5 a nonsense record leaves a number of seconds, not NaN",
    sealRemaining({ injured: "soon" }, "injured", 1000), 0);
  eq("S5b and a missing record likewise", sealRemaining(null, "injured", 1000), 0);
  eq("S5c neither of them reads as sealed",
    isSealed({ injured: "soon" }, "injured", 1000) || isSealed(null, "injured", 1000), false);
  eq("S6 lapsed seals are pruned", JSON.stringify(prunedSeals(sealed, 1000 + 604800)), "{}");
  eq("S6b and live ones are kept",
    JSON.stringify(prunedSeals(sealed, 1000)), JSON.stringify({ injured: 605800 }));
  eq("S7 the condition is matched case-insensitively",
    isSealed(withSeal({}, "Injured", 600, 0), "injured", 0), true);

  // S10 RUNS THE READER. The header of sealed.mjs argues that the condition
  // must stay ORDINARY, and until the 3.602.0 live drive it named a reader
  // (`conditionalPenalties`) that does not exist. The claim is worth more than
  // the paragraph, so it is measured: a sealed Injured 2 still produces the
  // same untyped -2 rows as an unsealed one, because the seal is a separate
  // record and `conditionModifiers` never sees it.
  const injuredRows = (value) => conditionModifiers({
    values: new Map([["injured", value]]),
    skillAbilities: { athletics: "strength", stealth: "dexterity" }
  }).filter((r) => /^Injured /.test(String(r.label ?? "")));
  ok("S10 a SEALED Injured 2 still bites like any other Injured 2",
    injuredRows(2).length > 0 && injuredRows(2).every((r) => Number(r.value) === -2),
    "the seal must not be a different injured — the sheet has to read it normally");
  eq("S10c and it is the condition's VALUE that sets the penalty, not the seal",
    injuredRows(3).every((r) => Number(r.value) === -3), true);
}
/*
 * S8 IS THE POINT OF THE WHOLE MECHANISM. Restoration is exactly the spell
 * that would try to lift this, and a Restoration that silently did nothing
 * would read as a broken spell with the PP already spent.
 */
ok("S8 THE RELIEF PATH ASKS BEFORE IT WRITES",
  /if \(isSealed\(seals, relief\.condition, nowSeconds\)\) \{/.test(applier),
  "Restoration is the spell that would try");
ok("S8b and REFUSES OUT LOUD, naming how long is left",
  /sealRefusedLine\(target\.name, relief\.label,\s*describeRemaining\(sealRemaining/.test(applier));
ok("S8c before the reduction, not after it",
  applier.indexOf("isSealed(seals, relief.condition") < applier.indexOf("const left = Math.max(0, had - relief.amount)"));
ok("S9 the refusal line says what the page says",
  /cannot be removed or reduced by any means/.test(sealRefusedLine("X", "Injured", "6 days")));
ok("S9b and the applied line names the seal's length",
  /sealed for 1 week/.test(sealAppliedLine("X", "Injured", "1 week")));
eq("S10 the flag is its own", SEALED_FLAG, "sealedConditions");

/* ================================================================== *
 * F. A FAILURE THAT CLOSES THE DOOR
 * ================================================================== */

eq("F1 a resurrect row makes a failure final",
  spellFailureIsFinal([{ kind: "resurrect" }]), true);
eq("F1b an ordinary spell's failure is not",
  spellFailureIsFinal([{ kind: "heal" }]), false);
eq("F1c and neither is nothing", spellFailureIsFinal(null), false);
eq("F2 a stamped creature is refused", resurrectionRefused({ at: 1, by: "X" }), true);
eq("F2b an unstamped one is not", resurrectionRefused(undefined), false);
/*
 * F3 IS WHY THIS RULE CANNOT LIVE IN THE EFFECT APPLIER: the applier runs only
 * when the cast SUCCEEDS, and this rule is about the other branch.
 */
ok("F3 THE CAST WORKFLOW WRITES IT ON THE FAILURE BRANCH",
  /if \(!outcome\.cast\) \{[\s\S]{0,400}spellFailureIsFinal\(spellData\.effects\)/.test(cast),
  "the effect applier never runs on a failed cast");
ok("F3b onto every creature that was marked",
  /for \(const token of Array\.from\(game\.user\?\.targets \?\? \[\]\)\) \{/.test(cast));
ok("F3c and says so on the card", /failureClosesLine\(doomed\.name\)/.test(cast));
ok("F4 THE REFUSAL IS CHECKED BEFORE ANYTHING IS EMPTIED",
  applier.indexOf("resurrectionRefused(target.getFlag") < applier.indexOf("restoredResourceUpdate()"),
  "a spell that may not be attempted must not empty anybody's pools on the way to saying so");
ok("F4b and the refusal is said out loud", /alreadyFailedLine\(target\.name\)/.test(applier));
eq("F5 the flag is its own", FAILED_FLAG, "resurrectionFailed");

/* ================================================================== *
 * C. THE CARD
 * ================================================================== */

ok("C1 the restored line names the numbers the page gives",
  /1 Hit Point/.test(restoredLine("X")) && /0 Power Points/.test(restoredLine("X")));
ok("C1b and says which pools survived, and why",
  /Luck is the player's and is untouched/.test(restoredLine("X"))
  && /action points and reactions/.test(restoredLine("X"))
  && /each turn, not\s*each day/.test(restoredLine("X").replace(/\s+/g, " ")));
ok("C2 the debilitated line names the week and the seal",
  /Injured 2/.test(debilitatedLine("X", "1 week")) && /cannot be removed or reduced/.test(debilitatedLine("X", "1 week")));
ok("C2b AND ADMITS WHAT THE SEAL DOES NOT COVER",
  /A GM may still clear it by hand/.test(debilitatedLine("X", "1 week")),
  "\"by any means\" is a claim about the fiction, not about whether the table can overrule its own game");
ok("C3 the death-state line names both numbers",
  /from <strong>5<\/strong> to <strong>4<\/strong>/.test(deathStateLine("X", 5, 4))
  && /does not come back/.test(deathStateLine("X", 5, 4)));
ok("C4 the soul line hands the outcome to the GM",
  /destroyed or corrupted/.test(soulDestroyedLine("X")) && /GM's to decide/.test(soulDestroyedLine("X")));
ok("C5 a refused attempt says why", /cannot be attempted again/.test(alreadyFailedLine("X")));
ok("C5b and a failure says it is for ever", /can never be attempted/.test(failureClosesLine("X")));
ok("C6 and the table's half is listed",
  /gemstones worth 200 gp/.test(judgedAtTheTableLine())
  && /personality or appearance change/.test(judgedAtTheTableLine()));

/* ================================================================== *
 * K. THE PACK
 * ================================================================== */

ok("K0 the kind is handled and declared",
  HANDLED_EFFECT_KINDS.includes("resurrect") && /case "resurrect": \{/.test(applier));
ok("K0b the conditions of death are cleared before the body is restored",
  /for \(const gone of DEATH_CONDITIONS_CLEARED\)/.test(applier)
    && applier.indexOf("for (const gone of DEATH_CONDITIONS_CLEARED)") < applier.indexOf("await target.update?.(restoredResourceUpdate());"));
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let sys = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() === "resurrection") { sys = v.system; break; }
    }
  } finally { await db.close(); }
  ok("K1 Resurrection is in the pack", Boolean(sys));
  const rows = sys?.effects ?? [];
  ok("K2 IT DOES SOMETHING AT LAST", rows.some((r) => r.kind === "resurrect"),
    "a PP 12 spell with four printed consequences carried `effects: []`");
  eq("K2b on the creature it is cast at", rows.find((r) => r.kind === "resurrect")?.target, "targets");
  eq("K3 and its failure is final", spellFailureIsFinal(rows), true);
  const notes = rows.filter((r) => r.kind === "note").map((r) => String(r.text ?? "")).join(" ");
  ok("K4 the pools reading is printed, because it is a reading",
    /THE POOLS THIS EMPTIES, and the two it does not/.test(notes));
  ok("K5 the permanence of Death State is printed",
    /DEATH STATE IS PERMANENT/.test(notes));
  ok("K6 AND THE INERT WARP IS DECLARED INERT, with its reason",
    /THE \+2 PP WARP IS PRINTED, NOT AUTOMATED/.test(notes) && /nothing in this system records one/.test(notes),
    "wiring a live key to it would be the morphForms mistake");
  eq("K6b so the warp is left carrying nothing rather than something wrong",
    JSON.stringify(sys?.warps?.map((w) => w.mods)), JSON.stringify([{ bonusValue: 1 }, {}]));
}

if (failures.length) {
  process.stderr.write(`verify-resurrection: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-resurrection: OK — ${checks} checks. Empty pools, a week of injury `
  + `nothing can lift, a Death State that does not come back, and a door that closes for ever.\n`);
