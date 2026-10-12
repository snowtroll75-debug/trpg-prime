#!/usr/bin/env node
/**
 * verify-sacrificing-shield — Sacrificing Shield.
 *
 * NEW at 3.499.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT SHIPPED CARRYING NOTHING AT ALL — no effects, no duration, no
 * targets.
 *
 *   Cast R; Range 30 feet; PP 1; Warding
 *
 *   "You shield your ally by absorbing their wounds. The HP damage that
 *    would have been inflicted upon them is reduced by 5. However, you
 *    absorb this damage instead, and any immunities, weaknesses, or
 *    resistances you possess do not come into effect."
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION S IS THE ARITHMETIC AND THE ONE ABSURDITY IN IT: the redirect
 * is CAPPED BY THE BLOW. A flat five-point transfer would let a caster be
 * killed by a scratch their ally shrugged off.
 *
 * SECTION P IS WHERE THE GATE SITS, and it is three orderings rather than
 * one — below temporary HP, below the Plant check, above the dying
 * machinery. Each has a different absurdity behind it and each is tested
 * separately, because the ordering is the whole design.
 *
 * SECTION L IS THE LOOP GUARD. Two casters warding each other would hand
 * the same five points back and forth forever without it, and that is not
 * a rules bug — it is a hung client.
 *
 * SECTION C IS THE CLAUSE THE SYSTEM DOES NOT HONOUR. The +2 PP condition
 * warp is deferred, and the ONLY thing standing between a table and a
 * silent failure is the printed line. A card that stopped saying it would
 * be worse than a warp that did not exist.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SHIELD_FLAG, BASE_ABSORB, normaliseSacrificingShield, shieldAmount,
  shieldCatches, shieldSplit, shieldPlacedLine, shieldAbsorbedLine,
  shieldCasterGoneLine, shieldRemainderLine
} from "../module/magic/sacrificing-shield.mjs";
import { aggregateWarpSelection, emptyWarp } from "../module/magic/spell-warp.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const DYING = read("module", "combat", "dying-workflow.mjs");
const EFFECTS = read("module", "magic", "spell-effects.mjs");

/** The character offset of a marker, or -1. Used only for orderings. */
const at = (source, needle) => source.indexOf(needle);

/* ================================================================== *
 * N. THE DECLARED ROW
 * ================================================================== */

const row = normaliseSacrificingShield({ kind: "sacrificingShield", label: "Sacrificing Shield" });
ok("N1 the pack row reads back whole",
  row?.label === "Sacrificing Shield" && row.amount === BASE_ABSORB && row.casterUuid === "");
ok("N2 a malformed row is refused",
  normaliseSacrificingShield(null) === null
  && normaliseSacrificingShield({ kind: "note" }) === null);
// N3 ONE VALIDATOR FOR TWO SHAPES, the rule delayed-respite.mjs set: the
// pack row carries `kind`, the record read back off a live effect does
// not, and a second shape would be a second chance to disagree.
ok("N3 a stored record with no kind still normalises",
  normaliseSacrificingShield({ label: "Sacrificing Shield", amount: 6, casterUuid: "Actor.x" })
    ?.amount === 6);
equal("N4 a negative amount cannot be stored",
  normaliseSacrificingShield({ amount: -4, casterUuid: "Actor.x" })?.amount, 0,
  "a ward that healed the ally and healed the caster would be two bugs in one line");

/* ================================================================== *
 * A. WHAT THE WARP BUYS
 * ================================================================== */

equal("A1 the book's number with no warp", shieldAmount({}), 5);
equal("A2 the +1 PP warp raises it", shieldAmount({ bonusValue: 1 }), 6,
  "`bonusValue: 1` is the key the warp already declared");
equal("A3 taken three times, aggregated before it arrives",
  shieldAmount({ bonusValue: 3 }), 8,
  "aggregateWarpSelection multiplies by `times`; nothing here counts");
equal("A4 a nonsense mod cannot shrink it", shieldAmount({ bonusValue: -9 }), 5);
equal("A5 no mods at all is still the book's number", shieldAmount(), 5);

/* ================================================================== *
 * S. THE SPLIT
 * ================================================================== */

const live = { label: "Sacrificing Shield", amount: 5, casterUuid: "Actor.caster" };

ok("S1 a live ward catches a blow", shieldCatches(live, 7));
ok("S2 A ZERO BLOW IS NOT A BLOW",
  shieldCatches(live, 0) === false,
  "spending a one-round ward on damage that never lands is a resource lost to rounding");
ok("S3 a ward with nobody to send it to catches nothing",
  shieldCatches({ ...live, casterUuid: "" }, 7) === false,
  "an effect that cannot name its caster is a shield with nowhere to send the wound");
ok("S4 a ward that redirects nothing catches nothing",
  shieldCatches({ ...live, amount: 0 }, 7) === false);
ok("S5 no record at all catches nothing", shieldCatches(null, 7) === false);

const big = shieldSplit(live, 12);
equal("S6 a big blow: the caster takes five", big.absorbed, 5);
equal("S7 and seven still reaches the ally", big.remaining, 7);

// S8 IS THE ONE THAT WOULD BE FOUND AT A TABLE AS AN ABSURDITY.
const small = shieldSplit(live, 3);
equal("S8 A SMALL BLOW COSTS THE CASTER ONLY WHAT IT WAS",
  small.absorbed, 3,
  "\"you absorb THIS damage\" is the damage that was reduced, not a flat five");
equal("S9 and the ally takes nothing", small.remaining, 0);

const exact = shieldSplit(live, 5);
ok("S10 a blow exactly the size of the ward", exact.absorbed === 5 && exact.remaining === 0);

const uncaught = shieldSplit({ ...live, casterUuid: "" }, 9);
ok("S11 a ward that cannot fire passes the whole blow through",
  uncaught.absorbed === 0 && uncaught.remaining === 9,
  "the ally must not lose damage a ward failed to take");

const warped = shieldSplit({ ...live, amount: 8 }, 12);
ok("S12 the warped ward takes its larger share",
  warped.absorbed === 8 && warped.remaining === 4);

/* ================================================================== *
 * P. WHERE THE GATE SITS
 * ================================================================== */

ok("P1 THE GATE IS AT THE SHARED PRIMITIVE",
  DYING.includes("redirectWithShield(actor, amount)"),
  "every damage route crosses applyDamageDirect; a spell asking each caller to remember "
  + "would work for a weapon and not for a rune");
ok("P2 the gate reads the same flag the placer writes",
  DYING.includes("SHIELD_FLAG") && EFFECTS.includes("SHIELD_FLAG"));
equal("P3 the flag is the one both ends name", SHIELD_FLAG, "sacrificingShield");

// P4/P5/P6 THE THREE ORDERINGS, each with a different absurdity behind it.
const tempHP = at(DYING, "const absorbed = await spendTemporaryHP");
const gate = at(DYING, "const redirect = await redirectWithShield");
const plant = at(DYING, "if (isCritOnlyDamage(creatureTypeSystem)");
const dying = at(DYING, "const alreadyDying = Boolean(actor.hasCondition");
ok("P4 BELOW TEMPORARY HP",
  tempHP > 0 && gate > tempHP,
  "damage a temporary pool swallowed inflicted no HP damage, so a ward above the pool "
  + "would be spent on a blow the ally shrugged off");
ok("P5 BELOW THE PLANT CHECK",
  plant > 0 && gate > plant,
  "non-critical damage to a Plant never reaches HP, so there is nothing there to redirect");
ok("P6 ABOVE THE DYING MACHINERY",
  dying > 0 && gate < dying,
  "the caster's points are meant to be the ones the ally does not take — deciding Massive "
  + "Damage on an unreduced number is the whole point of the spell");

// P7 THE LESSON DELAYED RESPITE TAUGHT LIVE on 4 September: the spell
// ends first, or the thing it releases walks back into its own gate.
//
// BEFORE THE CASTER IS EVEN LOOKED UP, not merely before the damage. The
// weaker ordering was written first and `mutate-sacrificing-shield` walked
// straight past it: moving the delete below the lookup left it still above
// the apply, so the check passed on code that had been reordered. What the
// comment in dying-workflow.mjs actually claims is that the ward is spent
// before ANYTHING else happens in that function, and that is what is
// asserted here.
const deleteAt = at(DYING, "if (actor?.effects?.get?.(effect.id)) await effect.delete();");
const casterAt = at(DYING, "const caster = await resolveShieldCaster(record.casterUuid);");
const applyAt = at(DYING, "await applyDamageAndCheckDying(caster, split.absorbed");
ok("P7 THE WARD IS SPENT BEFORE ANYTHING ELSE HAPPENS",
  deleteAt > 0 && casterAt > deleteAt && applyAt > deleteAt,
  "a ward still in place while its own redirect resolves is a ward that can take two bites");

// P8 IS THE CHECK THE THREE ORDERINGS ABOVE NEEDED AND DID NOT HAVE.
// P4/P5/P6 use indexOf, which finds the FIRST call — so a mutation that
// ADDED a second gate above the temporary-HP pool left the original where
// it was and every ordering check still passed. An added call is not a
// moved one, and the invariant was never "the gate is somewhere below the
// pool" but "there is ONE gate".
const gateCalls = (DYING.match(/await redirectWithShield\(/g) ?? []).length;
equal("P8 THERE IS EXACTLY ONE GATE", gateCalls, 1,
  "a second call site would spend the ward twice on one blow");

// P9 THE REDUCED NUMBER IS THE ONE THAT LANDS. Deleting this assignment
// left P1's call intact and every source check passing, on a spell where
// the caster took their share and the ally took the blow whole.
ok("P9 the redirect's remainder replaces the damage",
  DYING.includes("amount = redirect.remaining;"),
  "a redirect that is computed and discarded costs the caster HP for nothing");

/* ================================================================== *
 * L. THE LOOP GUARD
 * ================================================================== */

ok("L1 THE REDIRECTED WOUND CROSSES NO WARD",
  DYING.includes("{ redirected: true }"),
  "two casters warding each other would hand the same five points back and forth forever");
ok("L2 the guard is what gates the whole block",
  DYING.includes("if (!redirected) {"),
  "a flag nothing reads is not a guard");
ok("L3 the option survives the permission relay",
  DYING.includes("relayDamage(actor, damage, { isCritical, nonlethal, redirected, damageTypes, sourceLevel, sourceName }"),
  "a redirect onto a target this user does not own goes through the socket, and an option "
  + "dropped there would loop on somebody else's client");

/* ================================================================== *
 * D. WHAT THE CARDS SAY
 * ================================================================== */

const placed = shieldPlacedLine("Merrick", 6, " for 1 round");
ok("D1 the placing card says the number it will take",
  placed.includes("6") && placed.includes("Merrick"));
const absorbed = shieldAbsorbedLine("Ivo", "Merrick", 5, 7);
ok("D2 the firing card names both creatures and both halves",
  absorbed.includes("Ivo") && absorbed.includes("Merrick")
  && absorbed.includes("5") && absorbed.includes("7"));
ok("D3 A BLOW FULLY ABSORBED DOES NOT CLAIM A REMAINDER",
  shieldAbsorbedLine("Ivo", "Merrick", 5, 0).includes("for nothing"),
  "\"0 still reaches them\" reads as a number the card failed to compute");
// D5 THE LINE MUST ACTUALLY BE POSTED. D1-D3 all test the sentence and
// none of them tested that anything says it: deleting the whole ChatMessage
// left five points moving between two sheets with no card anywhere, which
// is the single hardest defect for a table to diagnose.
ok("D5 the firing card is posted from the gate",
  DYING.includes("shieldAbsorbedLine(caster.name, actor.name"),
  "HP moving between two creatures with nothing said is not a rules dispute, it is a "
  + "mystery");
ok("D4 THE MISSING CASTER IS SAID OUT LOUD",
  shieldCasterGoneLine("Merrick").includes("in full"),
  "an ally who takes a whole blow they paid a spell to halve must be told why, or they "
  + "will report the spell as broken");

/* ================================================================== *
 * C. THE CLAUSE THE SYSTEM DOES NOT HONOUR
 * ================================================================== */

const plainRemainder = shieldRemainderLine(false);
ok("C1 every cast names what is NOT absorbed",
  /conditions/i.test(plainRemainder) && /critical/i.test(plainRemainder),
  "\"you suffer no effects from any other part of the attack\" cuts both ways");
ok("C2 and says the ward is spent by one blow",
  /spent by the first blow/i.test(plainRemainder));
// C3 IS THE ONE THAT STANDS BETWEEN A TABLE AND A SILENT FAILURE.
ok("C3 THE UNBUILT WARP IS DECLARED WHEN IT IS BOUGHT",
  /by hand/i.test(shieldRemainderLine(true)),
  "the +2 PP condition warp is deferred; a card that stopped saying so would sell a clause "
  + "the system quietly drops");
ok("C4 and NOT declared when it was not",
  /by hand/i.test(plainRemainder) === false,
  "a caster who did not buy the warp is owed no reminder about conditions");
/* ================================================================== *
 * W. THE PHANTOM KEY
 *
 * C5 USED TO LIVE HERE AND IT ASSERTED THE WRONG THING. It checked that
 * spell-effects.mjs CONTAINED the line `/condition/i.test(w?.text)` — the
 * sentence, not its branch, for the sixth time in this project — and the
 * branch was never reachable: `warpMods.applied` is not a key on what
 * arrives at applySpellEffects. `aggregateWarpSelection` returns
 * {ppSpent, rawPP, mods, notes} and only `mods` is passed on, so the test
 * was permanently false. Found live on 5 September 2026 with the warp
 * bought, named on the card, and its clause unprinted.
 *
 * THE SAME SHAPE WAS ALREADY LIVE ON REAPER'S RESONANCE and had been
 * since the day it was written, because a warp that buys nothing looks
 * exactly like a warp nobody took. Both are guarded here rather than in a
 * file of their own: this is one defect with two victims, and splitting
 * the guard would let the next copy of it land in whichever file has no
 * check.
 * ================================================================== */

// W1 IS THE ONE THAT WOULD HAVE CAUGHT IT: the pack row, the real
// aggregator and the mod key, end to end. Nothing about the source text.
const shieldWarps = [
  { ppCost: 1, text: "damage you redirect increases by 1", mods: { bonusValue: 1 } },
  { ppCost: 2, text: "you may also absorb any condition that the target suffers", mods: { absorbConditions: true } }
];
const boughtCondition = aggregateWarpSelection(shieldWarps, { "warp-1": true });
ok("W1 BUYING THE +2 PP WARP SETS THE MOD",
  boughtCondition.mods.absorbConditions === true,
  "the aggregate is what carries a warp from the chooser to the effect");
ok("W2 not buying it leaves the mod clear",
  aggregateWarpSelection(shieldWarps, {}).mods.absorbConditions === false);
ok("W3 the +1 PP warp does not set it",
  aggregateWarpSelection(shieldWarps, { "warp-0": true }).mods.absorbConditions === false,
  "a flag set by the wrong option is worse than one never set");
ok("W4 taken twice it is still just taken",
  aggregateWarpSelection(shieldWarps, { "warp-1": 2 }).mods.absorbConditions === true,
  "the clause names no quantity");

// W5 THE PHANTOM KEY IS GONE FROM THE WHOLE TREE, not just from this
// spell. Two readers tested it; a third would fail exactly as silently.
// COMMENTS ARE STRIPPED FIRST, and that is not a detail: the fix's own
// comments quote the broken line verbatim, so a check that searched the
// raw text would fail on the explanation of why it exists. What is being
// asserted is that no CODE reads the key.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const allModules = fs.readdirSync(path.join(SYSTEM_ROOT, "module", "magic"))
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => stripComments(read("module", "magic", f)))
  .join("\n");
ok("W5 NOTHING READS warpMods.applied ANY MORE",
  allModules.includes("warpMods?.applied") === false
  && allModules.includes("warpMods.applied") === false,
  "a key that does not exist on the object reads as \"the warp was not taken\", forever");
ok("W6 the shield's clause reads the declared mod",
  EFFECTS.includes("Boolean(warpMods?.absorbConditions)"));
// W7 THE OTHER VICTIM, fixed in the same release for the same reason.
ok("W7 Reaper's Resonance's bleed warp reads its declared mod",
  EFFECTS.includes("Boolean(warpMods?.reduceBleed)"),
  "inert since the day it was written, and found only because a copy of it failed here");
// W9 THE OTHER VICTIM GETS THE SAME END-TO-END CHECK. W7 tested only the
// reader, and `mutate-sacrificing-shield` walked past a mutation that
// dropped the bleed mod from the aggregate — a reader pointed at a key
// nothing ever sets is the same silent failure in a different place.
const bleedWarps = [{
  ppCost: 2,
  text: "for every 5 HP healed (round down), you may also reduce any bleeding damage by 1",
  mods: { reduceBleed: true }
}];
ok("W9 buying Reaper's Resonance's warp sets its mod",
  aggregateWarpSelection(bleedWarps, { "warp-0": true }).mods.reduceBleed === true
  && aggregateWarpSelection(bleedWarps, {}).mods.reduceBleed === false,
  "the aggregate is the only road from the chooser to applyDeathResonance");
ok("W8 both keys are declared in the aggregate's vocabulary",
  emptyWarp().mods.absorbConditions === false && emptyWarp().mods.reduceBleed === false,
  "an undeclared mod is silently dropped between the chooser and the cast");

/* ================================================================== *
 * G. THE PACK ROW
 * ================================================================== */

let shield = null;
const declarers = [];
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.type !== "spell") continue;
    if (value.name === "Sacrificing Shield") shield = value;
    if ((value?.system?.effects ?? []).some((e) => e?.kind === "sacrificingShield")) {
      declarers.push({ name: value.name, pp: Number(value.system.ppCost) });
    }
  }
} finally {
  await db.close().catch(() => {});
}

const gRow = (shield?.system?.effects ?? []).find((e) => e.kind === "sacrificingShield");
ok("G1 Sacrificing Shield declares it", Boolean(gRow));
equal("G2 on the ally, not the caster", gRow?.target, "targets",
  "you shield somebody else; a ward on yourself would redirect your wounds to yourself");
equal("G3 one round, dismissible", String(shield?.system?.duration ?? ""), "1 round (D)",
  "the spell printed no duration at all, and a ward nothing can expire is a ward carried all day");
equal("G4 it has a target line to prompt for", String(shield?.system?.targets ?? ""), "1 ally",
  "it printed none, so nothing prompted and the ward had nobody to sit on");
equal("G5 still a reaction", String(shield?.system?.castAP ?? ""), "Reaction");
ok("G6 the effect kind is handled at all",
  EFFECTS.includes('case "sacrificingShield": {'));
ok("G7 THE CASTER IS STAMPED ON THE WARD",
  EFFECTS.includes("casterUuid: caster?.uuid"),
  "the only effect in the system that must reach a SECOND creature when it fires");
// G10 THE WARP IS FOLDED IN AT PLACEMENT, NOT AT THE GATE. Section A
// proves `shieldAmount` does the arithmetic; nothing proved the placer
// ever handed it the mods, and passing `{}` there made every warped ward
// redirect the book's five while the card said six.
ok("G10 the placer hands the warp mods to the arithmetic",
  EFFECTS.includes("shieldAmount(warpMods)"),
  "warps are chosen at casting, so the number is stamped on the ward and never recomputed");
// G8 THE RATCHET.
ok("G8 exactly one spell redirects damage",
  declarers.length === 1 && declarers[0].pp === 1,
  `declarers: ${JSON.stringify(declarers)}`);
// G9 THE WARP THAT WAS ALREADY RIGHT, left alone deliberately.
const bonusWarp = (shield?.system?.warps ?? []).find((w) => w?.mods?.bonusValue === 1);
ok("G9 the +1 PP warp still declares bonusValue",
  bonusWarp?.ppCost === 1,
  "one of the few warps in the pack that was never inert");
// G11 THE PACK ROW THE W SECTION ASSUMES. W1 feeds the aggregator a
// literal; this is what proves the literal is what the spell carries.
const condWarp = (shield?.system?.warps ?? []).find((w) => w?.ppCost === 2);
ok("G11 the +2 PP warp declares absorbConditions",
  condWarp?.mods?.absorbConditions === true,
  "it carried `mods: {}` and bought nothing, which is why its clause was never printed");

if (failures.length) {
  process.stderr.write(`verify-sacrificing-shield: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-sacrificing-shield: OK — ${checks} checks. One gate at the shared primitive, a `
  + "redirect capped by the blow, a loop guard on the wound it moves, and the unbuilt "
  + "condition warp declared on every cast that buys it.\n");
