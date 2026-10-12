#!/usr/bin/env node
/**
 * verify-spell-storing — Spell Storing.
 *
 * NEW at 3.495.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT SHIPPED CARRYING NOTHING, and both warps carried `mods: {}`.
 *
 *   "The next spell that you cast within one round is stored in your Mage
 *    Staff ... you can then release the spell at any time for 1 AP. You
 *    may only have one spell stored at any one time and if you cast the
 *    spell again the last spell you stored is dismissed."
 *      +4 PP: released as a reaction.   +8 PP: released as a free action.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION S IS THE ARITHMETIC THE RULING COULD NOT HAVE ANTICIPATED.
 *
 * Graham ruled on 4 September: PP at storage, everything else at release.
 * Measuring `castingOutcome` before building showed the price depends on
 * the DEGREE — partial costs nothing, heroic half, fumble the lot — so
 * "pay at storage" cannot know what to charge. Ruled 5 September: charge
 * the full Success price and SETTLE at release. Section S holds that
 * settlement against every degree the check can roll, because a spell
 * that quietly cost more when stored is a tax the book never mentions.
 *
 * SECTION G IS THE INTERCEPT: one gate at the top of the one function
 * every cast crosses, and the two things it must NOT do — pick targets
 * for a spell that has none yet, and re-offer a warp chooser that was
 * paid for a round ago.
 *
 * SECTION B IS THE STAFF. "Your Mage Staff" appears nowhere else in 692
 * spells; the Arcane Bond's designated item is what carries the store,
 * and a wizard without one is refused BEFORE anything is spent.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  ARM_WINDOW_ROUNDS, normaliseSpellStoring, releaseActionCost, armWindowOpen,
  storedSpellRecord, storedSettlement, settlementLine, storedLine, displacedLine,
  noBondLine, noBondCastLine, armedLine, spellStoringRemainderLine
} from "../module/magic/spell-storing.mjs";
import { castingOutcome } from "../module/magic/casting.mjs";
import { emptyWarp } from "../module/magic/spell-warp.mjs";

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
function bodyOf(source, signature) {
  const at = source.indexOf(signature);
  if (at < 0) return "";
  const rest = source.slice(at + signature.length);
  const stops = [rest.indexOf("\nexport "), rest.indexOf("\nasync function"), rest.indexOf("\nfunction ")]
    .filter((n) => n > 0);
  return rest.slice(0, stops.length ? Math.min(...stops) : rest.length);
}

/* ================================================================== *
 * N. THE DECLARED ROW
 * ================================================================== */

const row = normaliseSpellStoring({ kind: "spellStoring", label: "Spell Storing" });
ok("N1 the row reads back whole", row.label === "Spell Storing" && row.releaseCost === "1");
ok("N2 a malformed row is refused",
  normaliseSpellStoring(null) === null && normaliseSpellStoring({ kind: "note" }) === null);

/* ================================================================== *
 * A. THE ACTION THE RELEASE COSTS — the two inert warps
 * ================================================================== */

equal("A1 an unwarped store releases for 1 AP", releaseActionCost({}), "1");
equal("A2 the +4 PP warp buys a reaction",
  releaseActionCost({ storedReleaseReaction: true }), "reaction");
equal("A3 the +8 PP warp buys a free action",
  releaseActionCost({ storedReleaseFree: true }), "free");
// A4 FREE BEATS REACTION. It is the dearer warp and the strictly better
// one, so a caster who paid for both gets what they paid more for.
equal("A4 FREE BEATS REACTION when both were taken",
  releaseActionCost({ storedReleaseReaction: true, storedReleaseFree: true }), "free");
equal("A5 and it reads a warp aggregate as well as a bare mods object",
  releaseActionCost({ mods: { storedReleaseFree: true } }), "free");

// A6 THE KEYS SURVIVE AGGREGATION. A mod the aggregate does not declare
// is a mod silently dropped — the defect verify-warp-area exists for.
const blank = emptyWarp().mods;
ok("A6 both keys are declared in the warp aggregate",
  "storedReleaseReaction" in blank && "storedReleaseFree" in blank,
  "an undeclared mod key is dropped between the chooser and the cast");

/* ================================================================== *
 * W. THE ONE-ROUND WINDOW
 * ================================================================== */

equal("W1 the window is the printed one", ARM_WINDOW_ROUNDS, 1);
ok("W2 the round it was armed is inside it",
  armWindowOpen({ round: 4 }, { round: 4 }));
ok("W2b and the round after", armWindowOpen({ round: 4 }, { round: 5 }));
ok("W3 THE ROUND AFTER THAT IS NOT",
  armWindowOpen({ round: 4 }, { round: 6 }) === false,
  "\"within one round\" is the spell's own sentence");
// W4 OUT OF COMBAT THE WORLD CLOCK MEASURES IT, the reason rage and the
// emanation stamp both record: rounds do not exist outside an encounter.
ok("W4 the world clock measures it out of combat",
  armWindowOpen({ round: null, worldTime: 100 }, { round: null, worldTime: 105 }));
ok("W4b and closes it after a round of seconds",
  armWindowOpen({ round: null, worldTime: 100 }, { round: null, worldTime: 107 }) === false);
ok("W5 no window at all is not an open one", armWindowOpen(null, { round: 1 }) === false);

/* ================================================================== *
 * R. THE RECORD IN THE STAFF
 * ================================================================== */

const rec = storedSpellRecord({
  spellId: "abc", spellName: "Fireball", ppPaid: 6,
  mods: { extraDice: 2 }, notes: ["+2 PP: two extra dice"], releaseCost: "reaction"
});
equal("R1 the spell is named", rec.spellName, "Fireball");
equal("R1b and identified", rec.spellId, "abc");
equal("R2 what storage took is kept", rec.ppPaid, 6);
// R3 THE WARP TRAVELS WITH IT. It was chosen and paid for at storage;
// re-offering the chooser would let a 1 PP spell be released as a 20 PP
// one, which is the defect the item-cast path's own comment describes.
equal("R3 THE WARP MODS TRAVEL WITH IT", rec.mods.extraDice, 2);
ok("R3b and the notes that explain them", rec.notes.length === 1);
equal("R4 the release cost is fixed at storage", rec.releaseCost, "reaction",
  "\"the specifics of which you must determine when casting\"");
equal("R4b a nonsense cost falls back to 1 AP",
  storedSpellRecord({ releaseCost: "whenever" }).releaseCost, "1");
equal("R5 a negative payment is floored", storedSpellRecord({ ppPaid: -3 }).ppPaid, 0);

/* ================================================================== *
 * S. THE SETTLEMENT — every degree costs what the book says
 * ================================================================== */

// The spell as stored: 4 PP base, 2 PP of warp. Storage takes 6 — what a
// Success costs — and each degree then settles against its own price.
const PAID = 6;
const priceOf = (degree) => castingOutcome(degree, { basePP: 4, warpPP: 2 }).ppSpent;

equal("S1 a Success settles to nothing", storedSettlement(PAID, priceOf("success")).owed, 0);
ok("S2 A HEROIC HANDS HALF BACK",
  storedSettlement(PAID, priceOf("heroic")).refund === 3,
  `heroic costs ${priceOf("heroic")} of ${PAID}`);
ok("S3 A PARTIAL HANDS IT ALL BACK",
  storedSettlement(PAID, priceOf("partial")).refund === PAID,
  "a partial casts nothing and costs nothing — the caster must not be out of pocket");
ok("S4 a failure hands half back",
  storedSettlement(PAID, priceOf("failure")).refund === 3);
ok("S5 A FUMBLE KEEPS WHAT IT TOOK",
  storedSettlement(PAID, priceOf("fumble")).owed === 0 && priceOf("fumble") === PAID);
ok("S5b and so does a blunder", storedSettlement(PAID, priceOf("blunder")).owed === 0);
// S6 A CRITICAL COSTS HALF THE BASE PLUS THE WHOLE WARP, which is less
// than paid but not half of it — the one degree where the two halves of
// the price part company.
equal("S6 a critical settles to its own number",
  storedSettlement(PAID, priceOf("critical")).refund, PAID - priceOf("critical"));
// S7 THE OTHER DIRECTION EXISTS. Nothing in the current ladder charges
// more than a Success, but Variable Success adds PP after the degree, so
// the settlement must be able to take as well as give.
equal("S7 a dearer release takes the difference", storedSettlement(4, 7).extra, 3);
ok("S7b and never both at once",
  storedSettlement(4, 7).refund === 0 && storedSettlement(7, 4).extra === 0);

/* ================================================================== *
 * G. THE INTERCEPT
 * ================================================================== */

const cast = read("module", "magic", "cast-workflow.mjs");

ok("G1 ONE GATE, at the top of the one function every cast crosses",
  cast.includes("const storingNow = !stored && !isStoringSpell && Boolean(readArmed(actor));"),
  "a spell that asked each caller to remember would work for one route and not another");
// G2 CASTING SPELL STORING NEVER STORES ITSELF — the second casting
// dismisses what is held, which is the book's own sentence and is
// handled where the spell applies rather than in the intercept.
ok("G2 Spell Storing itself is never stored",
  cast.includes('const isStoringSpell = (spellData?.effects ?? []).some((e) => e?.kind === "spellStoring");'));

// G3 NO TARGETS ARE PICKED AT STORAGE. The whole ruling is that they are
// chosen at the release; a target picked now has had a round to move.
ok("G3 NO TARGET PROMPT WHILE STORING",
  // RE-ANCHORED 3.612.0: the line also skips a reaction cast's preset target.
  cast.includes("if (spellNeedsTarget(spellData) && !storingNow && !reaction?.presetTargets && !presetTargets) {"),
  "the ruling puts the targets at the release");
// G4 NO SECOND WARP CHOOSER AT RELEASE.
ok("G4 the chooser is skipped for a released spell",
  cast.includes("if (!isCantrip && !isItemCast && !stored && (!isInnate || innateBudget > 0)) {"),
  "re-offering it would let a 1 PP spell be released as a 20 PP one");
ok("G4b and the stored warp is used instead",
  cast.includes("if (stored?.mods) {")
  && cast.includes("mods: { ...emptyWarp().mods, ...(stored.mods ?? {}) },"));

// G5 THE EXIT IS AFTER THE PRICE AND BEFORE THE CHECK. Everything above
// it is casting that happens; everything below is resolution.
const exitAt = cast.indexOf("  if (storingNow) {");
ok("G5 the exit exists", exitAt > 0);
ok("G5b AFTER the affordability guard, so a caster who cannot pay is refused first",
  // 3.616.0: the pool test counts a rod's draw (R13 of block 36).
  cast.indexOf("if (totalPP > ppPool + rodDraw) {") > 0 && cast.indexOf("if (totalPP > ppPool + rodDraw) {") < exitAt);
ok("G5c and BEFORE the check is rolled",
  exitAt < cast.indexOf("const check = noCheckCantrip"),
  "a degree rolled at storage would be fixed before any target existed");
ok("G5d it charges the Success price",
  cast.includes('await actor.update({ "system.resources.pp.value": Math.max(0, ppPool - totalPP) });'));
// G5e THE ANCHOR MOVED AT 3.518.0 and the claim got stronger with it.
// Storing a spell spends the cast, and a cast whose TIME was warped is
// stored at the warped time — so this now names `warpedCastAP` rather
// than the printed `effCastAP`, and priced through `castTimeApCost` so a
// ten-minute ritual is not stored for ten Action Points.
ok("G5e and spends the casting action, because the spell really was cast",
  cast.includes("await spendActionCost(actor, castTimeApCost(warpedCastAP), spell.name);"));

// G6 THE SETTLEMENT AT RELEASE, and it reads the pool FRESH — the
// storage debit happened a round ago and a stale figure invents points.
const settleAt = cast.indexOf("  if (stored) {\n    const settle = storedSettlement(stored.ppPaid, ppSpent);");
ok("G6 the release settles rather than pays", settleAt > 0);
ok("G6b reading the pool as it is now",
  cast.includes("const poolNow = Number(actor.system?.resources?.pp?.value ?? 0);"),
  "reusing the pool from the top of the cast is how a refund invents points");
ok("G6c and it is capped at the caster's maximum",
  cast.includes('"system.resources.pp.value": Math.max(0, Math.min(ppMax, poolNow - settle.owed))'));
ok("G6d an ordinary cast still pays outright",
  cast.includes("} else if (casterPPSpent) {"),
  "the settle must not become the only path");

/* ================================================================== *
 * B. THE STAFF
 * ================================================================== */

const flow = read("module", "magic", "spell-storing-workflow.mjs");
const bonded = bodyOf(flow, "export function bondedItemFor(");
ok("B1 the store follows the daily designation",
  bonded.includes('item?.flags?.[SYSTEM_ID]?.arcaneBond'),
  "the ability is not the staff — the item designated today is");
ok("B2 NOTHING IS SPENT WHEN THERE IS NO STAFF",
  cast.indexOf("if (!bond) {") > 0
  && cast.indexOf("if (!bond) {") < cast.indexOf('await actor.update({ "system.resources.pp.value": Math.max(0, ppPool - totalPP) });'),
  "refusing after the PP left the pool would take payment for nothing");

const release = bodyOf(flow, "export async function releaseStoredSpell(");
ok("B3 the release reuses castSpell",
  release.includes("const { castSpell } = await import(\"./cast-workflow.mjs\");")
  && release.includes("stored: { ppPaid: record.ppPaid, mods: record.mods, notes: record.notes }"),
  "a replay engine would be a second implementation of the largest function here");
// B4 CLEARED BEFORE THE CAST. The release runs dialogs, and a record
// still in the staff while its spell resolves can be released twice.
const cleared = release.indexOf("await item.unsetFlag(SYSTEM_ID, STORED_SPELL_FLAG);\n  const { castSpell }");
ok("B4 THE STAFF IS EMPTIED BEFORE THE SPELL RESOLVES", cleared > 0,
  "the same shape Delayed Respite's packet clear took");
ok("B5 a free release is asked for no action",
  release.includes('if (record.releaseCost !== "free") {'));
ok("B6 a record pointing at a deleted spell clears itself",
  release.includes("if (!spell) {"),
  "it would otherwise refuse forever and block the next storage");

/* ================================================================== *
 * E. THE EFFECT CASE AND THE CARD
 * ================================================================== */

/**
 * The body of one `case` in the effect switch.
 *
 * SLICED, so a check cannot be satisfied by a neighbour's copy of the
 * same line — the reason `verify-wild-morph` slices too.
 */
function caseBody(source, kind) {
  const at = source.indexOf(`        case "${kind}": {`);
  if (at < 0) return "";
  const end = source.indexOf("\n        case \"", at + 20);
  return source.slice(at, end > 0 ? end : source.length);
}
const seFile = read("module", "magic", "spell-effects.mjs");
const se = caseBody(seFile, "spellStoring");
ok("E1 the effect kind is handled", se.length > 0);
ok("E2 it opens the window with the warped release cost",
  se.includes("releaseCost: releaseActionCost(warpMods)"));
// E3 "IF YOU CAST THE SPELL AGAIN THE LAST SPELL YOU STORED IS
// DISMISSED" — the book's own sentence, said out loud because the PP for
// the displaced spell is already gone.
ok("E3 casting it again dismisses what was held",
  se.includes("if (already?.record?.spellName) {") && se.includes("await clearStored(target);"));
ok("E3b and says so", se.includes("displacedLine(already.record.spellName)"));
// E4 ANCHORED ON THE BRANCH, NOT THE SENTENCE IT PRINTS. The first
// version asserted the line appeared — which it still does when the `if`
// guarding it can no longer be true, and `mutate-spell-storing` walked
// straight through it. The condition is the rule; the sentence is only
// what the rule says. This is the fifth time this exact class of check
// has been written the weak way and caught by its own mutation.
ok("E4 no staff is refused out loud",
  se.includes("if (!bond) {") && se.includes("lines.push(line(noBondCastLine(spell.name)));"),
  "a spell that stored nothing in silence");
/*
 * E5 TWO REFUSALS, TWO SENTENCES — and FOUND LIVE on 5 September 2026,
 * on the first cast of this spell.
 *
 * One sentence served both, and it ended "no PP was spent". At the
 * INTERCEPT that is true: the exit refuses before it charges. On the
 * CAST it printed directly above the spell's own "1 PP locked until your
 * next daily preparations" line — the card contradicting itself two
 * lines apart.
 */
ok("E5 THE INTERCEPT'S REFUSAL PROMISES NOTHING WAS SPENT",
  /no PP was spent/i.test(noBondLine("Fireball")),
  "true only where nothing has left the pool yet");
ok("E5b AND THE CAST'S DOES NOT",
  !/no PP was spent/i.test(noBondCastLine("Spell Storing")),
  "Spell Storing is paid for by the time its effects apply");
ok("E5c saying instead what did not happen",
  /no window opened/i.test(noBondCastLine("Spell Storing"))
  && /is spent/i.test(noBondCastLine("Spell Storing")));
ok("E5d and the intercept still uses its own",
  read("module", "magic", "cast-workflow.mjs").includes("noBondLine(spell.name)"),
  "the two must not collapse back into one");

ok("R6 the cards name what matters",
  storedLine("Fireball", "Oaken Staff", 6).includes("Fireball")
  && storedLine("Fireball", "Oaken Staff", 6).includes("Oaken Staff")
  && storedLine("Fireball", "Oaken Staff", 6).includes("6"));
ok("R6b the armed line names the staff", armedLine("Oaken Staff").includes("Oaken Staff"));
ok("R6c a displaced spell is named and its PP not promised back",
  displacedLine("Fireball").includes("Fireball") && /not returned/i.test(displacedLine("Fireball")));
ok("R6d the refusal says how to fix it", /Arcane Bond/i.test(noBondLine("Spell Storing")));
ok("R7 the settlement line says both numbers",
  settlementLine("Fireball", 6, 3).includes("6") && settlementLine("Fireball", 6, 3).includes("3"));
ok("R7b and reads differently in each direction",
  /returned/i.test(settlementLine("Fireball", 6, 3))
  && /more taken/i.test(settlementLine("Fireball", 3, 6))
  && /in full/i.test(settlementLine("Fireball", 6, 6)));
// R8 THE WINDOW IS THE HALF A PLAYER LOSES SILENTLY.
ok("R8 the one-round window is printed on every cast",
  /one round/i.test(spellStoringRemainderLine()));

// R9 THE PANEL. One door, and it has to exist.
const hbs = read("templates", "actor", "actor-sheet.hbs");
ok("R9 the staff's contents are shown", hbs.includes('data-action="releaseStoredSpell"'));
ok("R9b and the sheet computes them",
  read("module", "sheets", "actor-sheet.mjs").includes("const heldSpell = readStored(actor);"));

/* ================================================================== *
 * P. THE SPELL AS SHIPPED
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let storing = null;
const declarers = [];
let mageStaffMentions = 0;
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.type !== "spell") continue;
    if (value?.name === "Spell Storing") storing = value;
    if ((value?.system?.effects ?? []).some((e) => e?.kind === "spellStoring")) {
      declarers.push({ name: value.name, pp: Number(value.system.ppCost) });
    }
    if (/mage staff/i.test(JSON.stringify(value))) mageStaffMentions += 1;
  }
} finally {
  await db.close().catch(() => {});
}

const pRow = (storing?.system?.effects ?? []).find((e) => e.kind === "spellStoring");
ok("P1 Spell Storing declares the window", Boolean(pRow));
equal("P2 on the caster", pRow?.target, "self");
const warps = storing?.system?.warps ?? [];
ok("P3 the reaction warp is wired",
  warps.some((w) => Number(w.ppCost) === 4 && w.mods?.storedReleaseReaction === true),
  "it carried mods: {} and bought nothing");
ok("P3b and the free-action warp",
  warps.some((w) => Number(w.ppCost) === 8 && w.mods?.storedReleaseFree === true));
// P4 THE FACT THAT DECIDED THE STAFF. If a Mage Staff item ever appears,
// this ruling deserves re-reading rather than silently outliving it.
equal("P4 nothing but this spell mentions a Mage Staff", mageStaffMentions, 1,
  "the Arcane Bond's designated item is what carries the store");
ok("P5 exactly one spell stores", declarers.length === 1 && declarers[0].pp === 1,
  `declarers: ${JSON.stringify(declarers)}`);

if (failures.length) {
  process.stderr.write(`verify-spell-storing: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-spell-storing: OK — ${checks} checks. One gate at the top of the cast, the price paid `
  + "at storage and settled at release, and the staff emptied before its spell resolves.\n");
