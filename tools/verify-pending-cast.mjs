#!/usr/bin/env node
/**
 * verify-pending-cast — the window extra casting time opens.
 *
 * NEW at 3.584.0, for R9 of the pages 231-240 audit and Graham's three
 * design rulings of 22 September 2026: extra casting time only;
 * interruption automatic from damage; Spell Concentration offered on the
 * card with its DC filled in.
 *
 *   A  what an interruption does to the check (page 238)
 *   B  what counts as an interruption
 *   C  what the caster is told
 *   D  the seam — where the cast waits, and why there
 *   E  the window's own machinery
 *   F  the wiring, asked of the other side
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  PENDING_CAST_FLAG, apPaymentForTurn, armedLine, castingHeldLine, castingProgressLine, extraApOwed,
  hitPointsLost, interruptedDegree, interruptedLine, pendingCastReady, remainingLabel, stoppedLine
} from "../module/magic/pending-cast.mjs";

let checks = 0;
let failures = 0;
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

function ok(label, condition, detail = "") {
  checks += 1;
  if (condition) return;
  failures += 1;
  process.stdout.write(`  FAIL ${label}${detail ? ` — ${detail}` : ""}\n`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== */
/* A — WHAT AN INTERRUPTION DOES (page 238)                            */
/* ================================================================== */

/*
 * "Struck for hit point damage … automatically a failure. Struck for a
 * critical … automatically a fumble." The two words are not degrees of
 * the same thing: a failure costs half the PP, a fumble costs all of it
 * AND sends the caster to the Spell Failure Table.
 */
eq("A1 ordinary damage is a failure", interruptedDegree(null), "failure");
eq("A2 a critical injury is a fumble", interruptedDegree("minor"), "fumble");
eq("A2b whatever its severity", interruptedDegree("deadly"), "fumble");
// An empty string is not a critical — it is what an absent data
// attribute reads as, and treating it as one would fumble every cast
// interrupted by ordinary damage.
eq("A3 an empty severity is not a critical", interruptedDegree(""), "failure");

/* ================================================================== */
/* B — WHAT COUNTS AS AN INTERRUPTION                                  */
/* ================================================================== */

eq("B1 losing hit points does", hitPointsLost(20, 14), true);
/*
 * HEALING IS NOT BEING STRUCK. A caster drinking a potion mid-casting,
 * or an ally's heal landing, must not interrupt them — and an update
 * hook sees both as `system.hp.value` changing.
 */
eq("B2 being healed does not", hitPointsLost(14, 20), false);
eq("B3 nor does no change at all", hitPointsLost(14, 14), false);
eq("B4 nor does an unreadable value", hitPointsLost(undefined, 14), false);
eq("B4b in either position", hitPointsLost(14, null), false);

/* ================================================================== */
/* C — WHAT THE CASTER IS TOLD                                         */
/* ================================================================== */

eq("C1 three AP increments read as AP", remainingLabel({ increments: 2, unit: "AP", size: 3 }), "6 AP");
eq("C2 and minute increments as minutes",
  remainingLabel({ increments: 3, unit: "minute", size: 1 }), "3 minutes");
eq("C2b singular where it should be",
  remainingLabel({ increments: 1, unit: "minute", size: 1 }), "1 minute");
// "No PPs are spent until the Spell is cast" — the caster must be able
// to read that off the card before deciding whether to stand there.
ok("C3 the armed card says nothing is spent yet",
  /Nothing is spent until it is cast/.test(armedLine("X", { increments: 1, unit: "AP", size: 3 }, 1)));
ok("C4 stopping says the bonus is lost and nothing is spent",
  /accrued bonus is lost/.test(stoppedLine("X")) && /No PP is spent/.test(stoppedLine("X")));
ok("C5 an interruption names the degree it forces",
  /automatically a <strong>failure<\/strong>/.test(interruptedLine("X", null))
  && /automatically a <strong>fumble<\/strong>/.test(interruptedLine("X", "serious")));
ok("C6 and cites the page", /page 238/.test(interruptedLine("X", null)));

/* ================================================================== */
/* D — THE SEAM                                                        */
/* ================================================================== */

{
  const wf = code("module", "magic", "cast-workflow.mjs");
  /*
   * THE WAIT GOES AFTER THE DC AND AFTER EVERY PROMPT. `castSpell` asks
   * up to eight questions before it rolls; waiting any earlier would
   * mean storing and replaying the player's answers, which is a second
   * copy of the cast's state that has to agree with the first.
   *
   * Both orderings are checked because either one being wrong breaks it
   * differently: before the DC, the card cannot tell the caster what
   * they are rolling against and Spell Concentration has no DC to
   * offer; before the conditions prompt, the player is asked to stand
   * still before they have chosen to.
   */
  const dcAt = wf.indexOf("const dc = castingDCResult.dc;");
  const waitAt = wf.indexOf("await awaitPendingCast(actor, {");
  const rollAt = wf.indexOf("const check = noCheckCantrip");
  const promptAt = wf.indexOf("await promptCastingConditions(spell, {");
  ok("D1 the cast waits after its DC is known", dcAt >= 0 && waitAt > dcAt);
  ok("D2 and after every question has been asked", promptAt >= 0 && waitAt > promptAt);
  ok("D3 and before the check is rolled", rollAt >= 0 && waitAt < rollAt);

  // ONLY EXTRA CASTING TIME OPENS A WINDOW (Graham's ruling). An
  // ordinary one-action cast must not gain a second click.
  ok("D4 only a cast taking extra time waits",
    /Number\(conditions\.extraIncrements\) > 0 && extraInc/.test(wf),
    "page 237: 'interrupted whilst preparing a spell IN THIS WAY'");
  ok("D4b and never an item, innate or no-check cantrip cast",
    /if \(!isItemCast && !isInnate && !noCheckCantrip && Number\(conditions\.extraIncrements\) > 0/.test(wf),
    "none of those rolls a casting check for a degree to be forced on");

  // "No PPs are spent until the Spell is cast" — stopping returns before
  // anything is charged.
  ok("D5 stopping spends nothing",
    /if \(window_\.outcome === "stopped"\) return null;/.test(wf));
  /*
   * THE DICE ARE OVERRIDDEN, NOT SKIPPED. The roll still happens and is
   * still shown — the table should see what the caster would have made
   * of it — and page 238 then replaces the outcome.
   */
  ok("D6 an interruption forces the degree",
    /if \(forcedInterruption\) \{\n\s*degree = interruptedDegree\(forcedInterruption\.criticalSeverity\);/.test(wf));
  ok("D6b at the one place the degree is decided",
    (wf.match(/let degree = /g) ?? []).length === 1,
    "a second place to decide it is a second place to forget page 238");
}

/* ================================================================== */
/* E — THE WINDOW'S MACHINERY                                          */
/* ================================================================== */

{
  const wf = code("module", "magic", "pending-cast-workflow.mjs");
  ok("E1 the cast is suspended on a promise, not restarted",
    /return new Promise\(\(resolve\) => \{\n\s*waiting\.set\(actor\.id, resolve\);/.test(wf),
    "replaying eight prompts' answers is a second copy of the cast's state");
  ok("E2 every settlement clears the flag and the resolver",
    /waiting\.delete\(actor\.id\);\n\s*await actor\.unsetFlag\(SYSTEM_ID, PENDING_CAST_FLAG\)/.test(wf));
  /*
   * A SECOND CASTING WOULD ORPHAN THE FIRST'S RESOLVER — the Map is
   * keyed by actor, so the first promise would never settle and its
   * card's buttons would do nothing for ever.
   */
  ok("E3 a second casting stops the first rather than stranding it",
    /if \(waiting\.has\(actor\.id\)\) await stopPendingCast\(actor, \{ silent: true \}\);/.test(wf));
  ok("E4 an interruption only fires on a cast actually waiting",
    /if \(!record \|\| !waiting\.has\(actor\.id\)\) return false;/.test(wf),
    "a stale flag must not post an interruption nobody is waiting for");
  ok("E5 the hook asks the rule rather than comparing the numbers itself",
    /if \(!hitPointsLost\(actor\.system\?\.resources\?\.hp\?\.value, after\)\) return;/.test(wf));
  /*
   * AND IT WATCHES THE FIELD CREATURES ACTUALLY USE (F1 of the live
   * drive). `system.hp` exists on a character and is a vestigial
   * `{ value: null }` that nothing writes; every damage write in the
   * system — the attack workflow, the dying workflow, the rest — goes to
   * `system.resources.hp.value`. Watching the wrong one left the whole
   * automatic half of this feature dead while every check passed.
   */
  ok("E5b and watches resources.hp, the field damage is written to",
    /const after = changed\?\.system\?\.resources\?\.hp\?\.value;/.test(wf)
    && !/changed\?\.system\?\.hp\?\.value/.test(wf),
    "system.hp is a vestigial field nothing writes");
  /*
   * PINNED AGAINST THE DAMAGE CODE ITSELF, so the two cannot drift: if
   * the dying workflow ever moves hit points, this check fails rather
   * than the window quietly stopping working again.
   */
  ok("E5c the dying workflow writes the same field",
    /"system\.resources\.hp\.value"/.test(code("module", "combat", "dying-workflow.mjs")),
    "the watch and the write must name one field");
  /*
   * THE PROMISE LIVES IN ONE BROWSER. A flag found at startup belongs to
   * a cast nobody is waiting on, so it is cleared and said — not left as
   * a button that resolves nothing.
   */
  ok("E6 a casting does not survive a reload, and says so",
    /Hooks\.once\("ready"/.test(wf) && /Lapsed/.test(wf));
  ok("E7 the Spell Concentration offer carries the DC",
    /data-dc="\$\{record\.dc\}"/.test(wf));
  ok("E8 and the severity, so a critical steps it up",
    /data-severity="\$\{criticalSeverity \?\? ""\}"/.test(wf));
  /*
   * THE CARD NAMES ITS CASTER BY HANDLE, NOT BY ACTOR ID.
   * `game.actors.get(id)` answers the WORLD actor, so an unlinked token
   * — or a wildshaped druid — would have their casting completed on
   * somebody else's sheet. `verify-actor-handle` refused this file's
   * first draft for exactly that, which is the second time in this
   * release a check has caught something before a live world did.
   */
  /*
   * RE-ANCHORED AT 3.592.0. The buttons moved into `pendingCastButtons`,
   * which stringifies the handle once and interpolates it twice, so the
   * old regex — pinned to `data-handle='${JSON.stringify(handle)}'`,
   * one exact spelling — stopped matching a file that still does
   * precisely what the check is about. The property is "a handle, never
   * a bare actor id", and that is what this now asks.
   */
  ok("E9 the buttons carry a handle",
    /data-handle='\$\{handle\}'/.test(wf)
    && /const handle = JSON\.stringify\(record\.handle \?\? \{\}\)/.test(wf)
    && !/data-actor-id=/.test(wf));
  ok("E9b and resolve it rather than looking up a bare id",
    /await resolveActorHandle\(JSON\.parse\(button\.dataset\.handle \|\| "\{\}"\)\)/.test(wf)
    && !/game\.actors\.get\(button\.dataset/.test(wf));
  ok("E9c and the handle is taken from the caster's token where there is one",
    /actorHandle\(actor, actor\?\.token \?\? actor\?\.getActiveTokens\?\.\(\)\?\.\[0\] \?\? null\)/.test(wf));
}

/* ================================================================== */
/* F — THE WIRING                                                      */
/* ================================================================== */

{
  const script = code("scripts", "trg-prime.mjs");
  ok("F1 the damage watch is registered", /registerPendingCastHooks\(\);/.test(script));
  ok("F2 and the card's buttons", /registerPendingCastCardListeners\(\);/.test(script));
}
{
  const attack = code("module", "combat", "attack-workflow.mjs");
  /*
   * ONLY THIS FUNCTION KNOWS A HIT WAS A CRITICAL. The hit-point hook
   * catches every ordinary hit and calls it a failure; without this line
   * page 238's worse half would never fire, because inferring a critical
   * from an effect appearing beside a hit point change is a second
   * detector that can be wrong.
   */
  ok("F3 a critical injury interrupts the casting as a fumble",
    /await interruptPendingCast\(struck, \{ criticalSeverity: severity \?\? "minor" \}\);/.test(attack));
  ok("F3b on whoever actually took it",
    /const struck = targetActor \?\? actor;/.test(attack),
    "a critical rolled by a caster on someone else must not stop the caster");
}
{
  const cast = code("module", "magic", "cast-workflow.mjs");
  ok("F4 Spell Concentration accepts a DC it was given",
    /export async function rollSpellConcentration\(actor, \{ dc: knownDC = null, criticalSeverity: knownSeverity = "" \} = \{\}\)/
      .test(cast));
  ok("F4b and fills the field with it",
    /value="\$\{Number\(knownDC\) \|\| 0\}"/.test(cast));
  ok("F4c and preselects the severity",
    /k === String\(knownSeverity \?\? ""\) \? " selected" : ""/.test(cast));
  // CALLED WITH NOTHING IT BEHAVES AS IT ALWAYS DID — the reaction is
  // still openable by hand for a sustained spell, which has no pending cast.
  ok("F4d while still opening empty by hand",
    /dc: knownDC = null/.test(cast));
}
eq("F5 the flag has one name", PENDING_CAST_FLAG, "pendingCast");


/* ================================================================== *
 * P. PAYING FOR THE TIME (3.592.0)
 *
 * Graham, 25 September 2026: "When using the Extra Casting Time option
 * in combat it does not deduct any AP. Also, the complete the casting
 * button disappears up the chat log."
 *
 * Both halves of that were true, and the first was subtler than it
 * looked: the AP *was* in the arithmetic. `totalCastTime` added
 * `extraApSpent` and `spendActionCost` ran at the end — but as ONE LUMP
 * after the window closed, against a pool of three, so it clamped to
 * zero and warned while the pool refilled every turn the caster stood
 * there. A cost charged once, too late, against a replenished pool is
 * not a cost, and no check asked whether it ever left anybody's sheet.
 * ================================================================== */

{
  const wf = read("module", "magic", "pending-cast-workflow.mjs");
  const turn = read("module", "documents", "combat.mjs");
  const cast = read("module", "magic", "cast-workflow.mjs");

  /* ── the arithmetic ───────────────────────────────────────────── */
  eq("P1 two increments of three owe six", extraApOwed({ increments: 2, unit: "AP", size: 3 }, true), 6);
  eq("P1b a minute-unit window owes no AP",
    extraApOwed({ increments: 2, unit: "minute", size: 1 }, true), 0,
    "minutes are not action points, and a 1-minute spell is not cast inside a turn");
  eq("P1c and a caster outside combat owes none either",
    extraApOwed({ increments: 2, unit: "AP", size: 3 }, false), 0,
    "there are no turns to pay across, and spendActionPoints spends nothing out of combat");
  eq("P1d a window with no increments owes nothing",
    extraApOwed({ increments: 0, unit: "AP", size: 3 }, true), 0);

  eq("P2 a full turn pays three", apPaymentForTurn(3, 6, 0), 3);
  eq("P2b A CASTER WHO MOVED FIRST PAYS WHAT THEY HAVE", apPaymentForTurn(2, 6, 3), 2,
    "Graham's ruling: extra casting time is TIME, and one step should not cost the whole turn's casting");
  eq("P2c and nobody overpays the last instalment", apPaymentForTurn(4, 6, 5), 1,
    "a Quickened caster with four must not put four into a window that owes one");
  eq("P2d no AP is no payment, not a negative one", apPaymentForTurn(0, 6, 3), 0);
  eq("P2e and a paid-up window takes nothing more", apPaymentForTurn(3, 6, 6), 0);

  ok("P3 a part-paid window is not ready", !pendingCastReady({ apOwed: 6, apPaid: 3 }));
  ok("P3b a paid window is", pendingCastReady({ apOwed: 6, apPaid: 6 }));
  ok("P3c AND A WINDOW OWING NOTHING IS READY AT ONCE", pendingCastReady({}),
    "this is what keeps the minute-unit and out-of-combat paths exactly as 3.584.0 left them");

  /* ── the driver, asserted at its SOURCE ───────────────────────── */
  /*
   * P4 ASKS THE TURN, NOT THE RULE. This project's most-repeated defect
   * is a vocabulary entry with no driver — three of them in blocks 28
   * and 29, two hiding under comments that said the driver existed. A
   * payment rule that nothing calls would pass every check above.
   */
  ok("P4 THE TURN PAYS THE WINDOW DOWN",
    /const \{ payPendingCastTurn \} = await import\("\.\.\/magic\/pending-cast-workflow\.mjs"\);/.test(turn)
    && /const casting = await payPendingCastTurn\(actor\);/.test(turn),
    "the rules above are reachable only from here");
  ok("P4b and it pays AFTER the turn's AP has been granted",
    turn.indexOf('"system.resources.ap.value": finalAP') < turn.indexOf("payPendingCastTurn(actor)"),
    "paying first would spend the PREVIOUS turn's leftovers and then hand the caster a full pool");
  ok("P4c the progress line and the buttons both reach the card",
    /lines\.push\(TRGCombat\.#chatLine\(casting\.line\)\);/.test(turn)
    && /lines\.push\(casting\.buttons\);/.test(turn),
    "Graham's second complaint was the button scrolling away; Phase 1 posts a card every turn, "
    + "so the button that rides it is always the newest thing in the log");

  /* ── what the window does ─────────────────────────────────────── */
  ok("P5 THE BUTTON IS NOT OFFERED UNTIL THE TIME IS PAID",
    /const complete = pendingCastReady\(record\)\s*\?/.test(wf),
    "offering it from the opening card is what let a caster take the bonus without standing there");
  ok("P5b while Stop is always offered",
    /\$\{complete\}`\s*\+ `<button type="button" data-action="stopPendingCast"/.test(wf),
    "stopping costs nothing by page 237, so it is never gated");
  ok("P6 THE PAYMENT GOES THROUGH THE ONE SPENDER",
    /await spendActionPoints\(actor, payment,/.test(wf)
    && !/"system\.resources\.ap\.value":/.test(wf),
    "the mounted pair share a pool and spendActionPoints is the only thing that knows it");
  ok("P6b the turn the caster declares it is the first turn they pay for",
    /const firstPayment = await payTowards\(actor, record\);/.test(wf),
    "Graham's worked example counts the declaring turn as turn one");
  /*
   * P6c IS PINNED TO THE PAYMENT SITE. Its first draft grepped for the
   * setFlag call and there are TWO of them — the window's opening save
   * and this one — so a mutation deleting the payment's write was
   * answered by the opening one, and every turn would have paid the
   * first instalment for ever. A check satisfied by an unrelated
   * occurrence; the same shape caught `verify-basic-save` E5 this week.
   */
  ok("P6c and progress is written back to the flag",
    /const paid = await payTowards\(actor, record\);\s*await actor\.setFlag\(SYSTEM_ID, PENDING_CAST_FLAG, record\);/
      .test(wf),
    "the running total lives in the flag; losing it means every turn pays the first instalment again");
  /*
   * P11 IS A DEFECT THE LIVE DRIVE FOUND IN THIS RELEASE'S OWN FIX.
   *
   * `payPendingCastTurn` answered null the moment nothing was left to
   * pay, so the turn AFTER the last instalment printed no line and
   * carried no button — and "Complete the casting" then lived on exactly
   * one card and scrolled away as the rounds passed. That is Graham's
   * original complaint postponed, not fixed, and it is reachable only by
   * a caster who HOLDS the spell, which his ruling explicitly allows.
   *
   * Measured in his world on 25 September: with a paid-up window open,
   * `payPendingCastTurn` returned null.
   */
  ok("P11 A TURN WITH NOTHING LEFT TO PAY STILL CARRIES THE BUTTON",
    /if \(extraApRemaining\(record\.apOwed, record\.apPaid\) === 0\) \{\s*return \{\s*line: castingHeldLine\(record\.spellName, record\),\s*buttons: pendingCastButtons\(record\)/
      .test(wf),
    "returning null here is what let the affordance scroll away a second time");
  /*
   * P11b READS THE BRANCH, not a window of characters after a name. Its
   * first draft looked 200 characters past `castingHeldLine` for
   * `payTowards` — and found the one in the NEXT branch, which is
   * supposed to be there. A check that fails on correct code is as
   * useless as one that passes on broken code, and this one did the
   * first while claiming to do the second.
   */
  {
    const from = wf.indexOf("if (extraApRemaining(record.apOwed, record.apPaid) === 0) {");
    const branch = from < 0 ? "" : wf.slice(from, wf.indexOf("const paid = await payTowards", from));
    ok("P11b and it takes no AP and rewrites no flag, because nothing changed",
      branch.length > 0 && !branch.includes("payTowards") && !branch.includes("setFlag"),
      "a turn that owes nothing must not spend anything to say so");
  }
  ok("P11c the held line says the casting is still open",
    /Still holding X/.test(castingHeldLine("X", { apOwed: 6, castAP: 2 })));
  ok("P11d and names what completing it will still cost",
    /its own <strong>2 AP<\/strong> is spent when it is/.test(castingHeldLine("X", { apOwed: 6, castAP: 2 })));
  ok("P11e a window that owed nothing does not claim a paid-up total",
    !/paid in full/.test(castingHeldLine("X", { apOwed: 0, castAP: 2 })),
    "an out-of-combat or minute-unit window never owed AP, so saying it is paid would be a lie");

  ok("P7 A FLAG WITH NO PROMISE IS NOT CHARGED",
    /if \(!waiting\.has\(actor\.id\)\) return null;/.test(wf),
    "a reload leaves the flag behind; a turn arriving before the startup sweep must not take AP "
    + "toward a casting nobody is waiting on");

  /* ── and it is charged ONCE ───────────────────────────────────── */
  ok("P8 THE LUMP IS GONE FROM THE FINAL SPEND",
    /const totalCastAP = totalCastTime\(warpedCastAP, \{ apDelta: mm\.apDelta \}\);/.test(cast),
    "adding extraApSpent here as well would charge the extra time twice, now that turns pay it");
  ok("P8b and nothing computes that lump any more",
    !/const extraApSpent =/.test(cast),
    "two places computing one cost is how it came to be charged twice in the first place");
  ok("P9 the window is told what the spell itself will still cost",
    /castAP: castTimeApCost\(warpedCastAP\),/.test(cast),
    "a caster who put every point into the time should read that on the card, not discover it "
    + "in a clamp warning after pressing Complete");

  /* ── what the card says ───────────────────────────────────────── */
  ok("P10 a part-paid line names the fraction and what is left",
    /3 of 6 AP/.test(castingProgressLine("X", { apOwed: 6, apPaid: 3 }, 3))
    && /3<\/strong> still to go/.test(castingProgressLine("X", { apOwed: 6, apPaid: 3 }, 3)));
  ok("P10b a turn that paid nothing says so rather than staying silent",
    /no AP<\/strong> was available this turn/.test(castingProgressLine("X", { apOwed: 6, apPaid: 3 }, 0)),
    "silent nothing, the shape this project keeps finding");
  ok("P10c and the finished line names the spell's own remaining cost",
    /its own <strong>2 AP<\/strong> is spent when it is/
      .test(castingProgressLine("X", { apOwed: 6, apPaid: 6, castAP: 2 }, 3)));
  ok("P10d a spell whose own cost is free says nothing about it",
    !/its own/.test(castingProgressLine("X", { apOwed: 6, apPaid: 6, castAP: 0 }, 3)));
}

/* ================================================================== */

process.stdout.write(failures
  ? `\nverify-pending-cast: FAILED — ${failures} of ${checks} checks.\n`
  : `\nverify-pending-cast: OK — ${checks} checks. The window extra casting time opens.\n`);
process.exit(failures ? 1 : 0);
