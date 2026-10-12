#!/usr/bin/env node
/**
 * verify-power-crystal — power points you can hold in your hand.
 *
 * NEW at 3.594.0. Graham, 25 September 2026: "R8. Please build in full."
 *
 * Page 306: "The crystal 'contains' 1 PP, which any character holding it
 * can use as if it was part of their PP reserve. The crystal dissolves
 * into nothingness when the Duration expires or when all the PPs it
 * contains are used up."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DESIGN THIS FILE IS MOSTLY ABOUT.
 *
 * There are EIGHT writers of `system.resources.pp.value` in this system.
 * A crystal that intercepted spending would have had to know all eight
 * and the ninth nobody has written yet — and `pending-cast-workflow`
 * already settled that argument for hit points: hooking the pipeline
 * "would have meant finding every entrance and being wrong about one".
 *
 * So the crystal is DERIVED into the maximum, and every existing spender
 * draws on it without being told it exists. That is what section C pins:
 * not that the arithmetic is right, but that nothing was asked to change
 * to make it right.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  CRYSTAL_FLAG, crystalArrival, crystalDeparture, crystalDraw, crystalPoints, crystalSpentLine,
  crystalTotal, drawFromCrystals
} from "../module/magic/power-crystal.mjs";
import { aggregateWarpSelection } from "../module/magic/spell-warp.mjs";

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
const actor = strip(read("module", "documents", "actor.mjs"));
const wf = strip(read("module", "magic", "power-crystal-workflow.mjs"));
const applier = strip(read("module", "magic", "spell-effects.mjs"));
const conjurer = strip(read("module", "magic", "conjured-item-workflow.mjs"));
const boot = strip(read("scripts", "trg-prime.mjs"));

const crystal = (id, pp) => ({ id, flags: { "trg-prime": { [CRYSTAL_FLAG]: { pp } } } });

/* ================================================================== *
 * A. WHAT A CRYSTAL HOLDS
 * ================================================================== */

eq("A1 a crystal reports its points", crystalPoints(crystal("a", 3)), 3);
eq("A1b anything else holds none", crystalPoints({ name: "Sword" }), 0);
/*
 * A1c ASKS THE OPTIONAL CHAIN, not a guard. A flag holding a number, a
 * string or an array all answer `undefined` for `.pp` — so every shape
 * of malformed flag is already 0 and no separate guard can change that.
 * One was written, measured against a mutation that removed it, found to
 * change nothing, and deleted.
 */
eq("A1c a flag holding a number is not a crystal",
  crystalPoints({ flags: { "trg-prime": { powerCrystal: 5 } } }), 0);
eq("A1c2 nor one holding a string",
  crystalPoints({ flags: { "trg-prime": { powerCrystal: "lots" } } }), 0);
eq("A1c3 nor an object with no points in it",
  crystalPoints({ flags: { "trg-prime": { powerCrystal: {} } } }), 0);
eq("A1d negative points are not points", crystalPoints(crystal("a", -4)), 0);
eq("A2 several add up", crystalTotal([crystal("a", 1), crystal("b", 4), { name: "Rope" }]), 5);
eq("A2b nothing held is nothing", crystalTotal([]), 0);
eq("A2c and an absent list does not throw", crystalTotal(undefined), 0);

/* ================================================================== *
 * B. HOW MUCH OF A SPEND THEY PAY FOR
 *
 * THE MODEL CHANGED AT 3.594.1, and a live drive is what changed it.
 *
 * 3.594.0 inferred the crystal's remaining points from where the pool was
 * RESTING: "the crystal's share is the top of the pool, so what is left is
 * however far the value stands above the holder's own maximum". True for a
 * holder at full pool. False for everybody else — and a caster at 3 of 56
 * who gains a 3 PP crystal stands 53 below their own maximum, so the
 * arithmetic read the crystal as empty and the next pool update dissolved
 * it, with a card announcing that its points had been spent. Two PP for a
 * rock that was never usable, measured in Graham's world on 26 September.
 *
 * Raising the value on creation does not rescue an inference like that;
 * 6 is still below 56. The resting position cannot tell "below my own
 * maximum" from "crystal used up".
 *
 * So the SPEND is watched. A decrease draws on crystals; an increase does
 * not give their points back.
 * ================================================================== */

eq("B1 a spend of two takes two from the crystals", crystalDraw(6, 4, 3), 2);
eq("B1b A HOLDER NOWHERE NEAR FULL POOL STILL SPENDS THEM", crystalDraw(6, 4, 3), 2,
  "this is the case 3.594.0 got wrong: nothing here reads the holder's own maximum at all");
eq("B2 a spend larger than they hold takes only what they hold", crystalDraw(6, 1, 3), 3);
eq("B2b and no more, however deep the spend goes", crystalDraw(40, 0, 3), 3);
eq("B3 A REST DOES NOT REFILL AN EMPTIED CRYSTAL", crystalDraw(3, 40, 3), 0,
  "points already spent out of a crystal do not come back");
eq("B3b nor does a refund", crystalDraw(4, 6, 3), 0);
eq("B3c an unchanged pool draws nothing", crystalDraw(6, 6, 3), 0);
eq("B3d and a holder with no crystals never draws", crystalDraw(10, 4, 0), 0);

/*
 * B5-B7 ARE THE HALF 3.594.1 DID NOT HAVE, and the 3.594.1 live drive is
 * what found it missing. The points were put into the pool by a line in
 * the spell applier, so a crystal was worth its points to the caster who
 * conjured it and worth NOTHING to anybody they handed it to: measured in
 * Graham's world, a holder at 20 of 90 took a 2 PP crystal, went to 20 of
 * 92 — a ceiling with nothing under it — spent 3 PP, and watched the card
 * announce that the crystal's 2 points were spent while their own reserve
 * paid all three.
 *
 * "Any character HOLDING it" makes ARRIVING the moment that matters, and
 * these two rules are what the hooks apply.
 */
eq("B5 ARRIVING PUTS THE POINTS IN THE POOL", crystalArrival(20, 92, 2), 22,
  "the holder who was given it can spend them, which is the whole sentence on page 306");
eq("B5b a full pool grows with its ceiling", crystalArrival(65, 67, 2), 67);
eq("B5c and never past it", crystalArrival(66, 67, 3), 67,
  "the maximum already counts the crystal; two of them must not double-count one");
eq("B5d nothing arriving changes nothing", crystalArrival(20, 90, 0), 20);
eq("B6 LEAVING TAKES BACK ONLY WHAT IT STILL HELD", crystalDeparture(30, 2), 28,
  "3.594.1 clamped to the new maximum instead, so a holder below it kept the points AND "
  + "handed them on — two points minted by a hand-over");
eq("B6b a part-spent crystal takes only the rest", crystalDeparture(30, 1), 29);
eq("B6c an emptied one takes nothing", crystalDeparture(30, 0), 30);
eq("B7 and a pool is never taken below nothing", crystalDeparture(1, 3), 0);

eq("B4 SMALLEST FIRST, so a spend empties one crystal rather than chipping several",
  JSON.stringify(drawFromCrystals([{ id: "big", pp: 4 }, { id: "small", pp: 1 }], 3)),
  JSON.stringify([{ id: "small", from: 1, to: 0, gone: true },
    { id: "big", from: 4, to: 2, gone: false }]));
eq("B4b a spend of nothing draws nothing", JSON.stringify(drawFromCrystals([{ id: "a", pp: 2 }], 0)), "[]");
eq("B4c and an empty crystal is not drawn from",
  JSON.stringify(drawFromCrystals([{ id: "a", pp: 0 }], 2)), "[]");

/* ================================================================== *
 * C. DERIVED, NOT SPENT — the point of the whole design
 * ================================================================== */

ok("C1 THE HOLDER'S MAXIMUM CARRIES THE CRYSTALS",
  /pp\.crystals = crystalTotal\(actor\?\.items \?\? \[\]\);/.test(actor)
  && /pp\.max \+= pp\.crystals;/.test(actor),
  "this is what makes every existing spender draw on a crystal without knowing it exists");
ok("C1b READ OFF THE ITEMS, so the points travel with the crystal",
  /crystalTotal\(actor\?\.items/.test(actor),
  "a flag written onto one sheet could not satisfy \"any character holding it\"");
/*
 * C2 IS THE CHECK THAT WOULD CATCH A LATER "IMPROVEMENT". The whole
 * design is that nothing intercepts spending; a future reader who
 * decides the crystal ought to be deducted somewhere will find this.
 */
/*
 * STRIPPED, because the module's own header EXPLAINS that eight places
 * write `resources.pp.value` — so the unstripped file contains the very
 * string this check exists to prove absent. A check satisfied by a
 * comment about the defect is this project's defect shape (h), and this
 * one failed on correct code the first time it ran.
 */
ok("C2 AND NOTHING INTERCEPTS A SPEND",
  !/resources\.pp\.value/.test(strip(read("module", "magic", "power-crystal.mjs"))),
  "the rules module must not know how anybody spends power points");
/*
 * C2b COUNTS TWO WRITES AT 3.594.2, one per moment the points move: in
 * when a crystal arrives, out when one leaves with points still in it.
 * The applier wrote the third by hand at 3.594.1 and that is exactly the
 * bug — see E5.
 */
ok("C2b the workflow writes the pool in two places, arriving and leaving",
  (wf.match(/"system\.resources\.pp\.value"/g) ?? []).length === 2
  && /async function settleCrystalArrival[\s\S]*?"system\.resources\.pp\.value": raised/.test(wf)
  && /async function settleCrystalDeparture[\s\S]*?"system\.resources\.pp\.value": left/.test(wf),
  "a crystal's points are the pool's while it is held, and nobody else's before or after");

/* ================================================================== *
 * D. THE TWO MOMENTS THE ITEM AND THE ARITHMETIC COULD DRIFT
 * ================================================================== */

/*
 * D1 WAS THE OPPOSITE AT 3.594.0, and said so confidently: "preUpdateActor
 * is handed a change that has not landed, so the arithmetic would be one
 * spend behind for ever". That reasoning was right about the mechanics and
 * wrong about what the rule needs. Watching the resting position needs the
 * update to have landed; watching the SPEND needs both sides of it, and
 * only `preUpdateActor` has both — the document still holds the value
 * before, the change carries the value after.
 */
ok("D1 BOTH SIDES OF THE CHANGE, which only preUpdateActor has",
  /Hooks\.on\("preUpdateActor"/.test(wf)
  && /const before = Number\(actor\.system\?\.resources\?\.pp\?\.value \?\? 0\);/.test(wf)
  && /settleCrystals\(actor, before, Number\(after\)\)/.test(wf),
  "the resting position cannot say how much of a crystal a spend consumed");
ok("D1b and only when the pool actually moved",
  /const after = changed\?\.system\?\.resources\?\.pp\?\.value;/.test(wf)
  && /if \(after === undefined\) return;/.test(wf));
ok("D2 an emptied crystal is deleted", /deleteEmbeddedDocuments\("Item", emptied\.map/.test(wf));
ok("D2b a part-spent one keeps the rest", /setFlag\(SYSTEM_ID, CRYSTAL_FLAG, \{ pp: d\.to \}\)/.test(wf));
/*
 * READS THE FUNCTION, not a window of characters after its name. The
 * first draft looked 1400 characters past `settleCrystals` and found the
 * write in `clampAfterCrystalLoss`, which is supposed to be there — a
 * check that failed on correct code while claiming to prove the
 * opposite. Third time today; the window is never the answer.
 */
{
  const from = wf.indexOf("async function settleCrystals");
  const body = from < 0 ? "" : wf.slice(from, wf.indexOf("async function settleCrystalArrival"));
  ok("D2c AND THE VALUE IS NOT ADJUSTED when a crystal is emptied",
    body.includes("deleteEmbeddedDocuments") && !body.includes('"system.resources.pp.value"'),
    "those points were already spent — that is how we knew to delete it");
}
{
  /*
   * D3 READS THE FUNCTION, like D2c above and for the same reason: three
   * checks died of fixed windows the day this file was written.
   */
  const from = wf.indexOf("async function settleCrystalDeparture");
  const body = from < 0 ? "" : wf.slice(from, wf.indexOf("/** Both moments, watched."));
  ok("D3 A CRYSTAL LEAVING TAKES ITS OWN POINTS OUT, not a clamp to the maximum",
    /crystalDeparture\(value, points\)/.test(body)
    && /"system\.resources\.pp\.value": left/.test(body)
    && !/value <= max/.test(body),
    "clamping is right only for a holder at full pool; everybody else kept the crystal's "
    + "points and handed them on as well");
  ok("D3b and does nothing when the pool would not move", /if \(left === value\) return null;/.test(body));
}
{
  const from = wf.indexOf("async function settleCrystalArrival");
  const body = from < 0 ? "" : wf.slice(from, wf.indexOf("async function settleCrystalDeparture"));
  ok("D3c ARRIVING PUTS THEM IN, under the ceiling the derivation just raised",
    /crystalArrival\(value, Number\(pp\.max \?\? 0\), points\)/.test(body)
    && /"system\.resources\.pp\.value": raised/.test(body));
  ok("D3d and does nothing when the pool would not move", /if \(raised === value\) return null;/.test(body));
}
ok("D3e AN EMPTIED CRYSTAL IS ZEROED BEFORE IT DISSOLVES",
  /for \(const d of emptied\) \{[\s\S]{0,200}?CRYSTAL_FLAG, \{ pp: 0 \}/.test(wf),
  "the departure hook charges for what a leaving crystal holds; an emptied one holds nothing, "
  + "and deleting it with its old points on it would charge the holder twice");
ok("D3f the arrival hook fires for a crystal and nothing else",
  /Hooks\.on\("createItem"[\s\S]{0,300}?const points = crystalPoints\(item\);\s*if \(points <= 0\) return;/.test(wf),
  "every item a character picks up goes through here");
ok("D3g and the departure hook likewise",
  /Hooks\.on\("deleteItem"[\s\S]{0,300}?const points = crystalPoints\(item\);\s*if \(points <= 0\) return;/.test(wf));
ok("D4 ALL THREE HOOKS RUN ON ONE CLIENT",
  (wf.match(/if \(!game\.user\?\.isGM\) return;/g) ?? []).length === 3,
  "two clients racing to delete one crystal means one of them deletes a document already gone");
ok("D5 and they are registered at startup",
  /registerPowerCrystalHooks\(\);/.test(boot) && /power-crystal-workflow\.mjs/.test(boot),
  "a hook nobody registers is this project's most-repeated defect");

/* ================================================================== *
 * E. THE CASTING
 * ================================================================== */

ok("E1 the conjured crystal is stamped with what was paid for it",
  // A `let` SINCE 3.614.0: Nature's Bounty stamps its warped heal there too.
  /let crystalStamp = crystalBase > 0/.test(applier)
  && /powerCrystal: \{ pp: crystalBase \+ Math\.max\(0, Number\(warpMods\?\.crystalPP \?\? 0\)\) \}/.test(applier));
ok("E1b and the stamp reaches the item",
  /stamp: crystalStamp/.test(applier)
  && /if \(stamp && typeof stamp === "object"\) \{[\s\S]{0,120}?\.\.\.stamp/.test(conjurer));
ok("E1c merged, so the conjured and expiry stamps survive it",
  /data\.flags\[SYSTEM_ID\] = \{ \.\.\.data\.flags\[SYSTEM_ID\], \.\.\.stamp \}/.test(conjurer));
ok("E2 a spell that is not Power Crystal is stamped with nothing",
  /crystalBase > 0[\s\S]{0,140}?: null/.test(applier),
  "Bless Water and Goodberry go through this same line");
{
  const w = [{ mods: { crystalPP: 1 } }];
  eq("E3 the warp raises what the crystal holds",
    aggregateWarpSelection(w, { "warp-0": 3 }).mods.crystalPP, 3,
    "\"+1 PP: increase the PPs contained by 1\" — bought three times is three more points");
  eq("E3b unbought, it holds only its base", aggregateWarpSelection(w, {}).mods.crystalPP, 0);
}
{
  /*
   * E5 PINS THE REVERSAL. At 3.594.1 these checks REQUIRED the applier to
   * write the pool itself; the live drive showed that a line there can only
   * ever serve the moment of conjuring, so the rule moved to the arrival
   * hook (D3c) and the applier must now write nothing. A check that pinned
   * a mistake is worth more rewritten than deleted.
   *
   * A SLICE BOUNDED BY ITS OWN NEIGHBOURS, not a window of characters: the
   * crystal's paragraph in the applier runs from the stamp to the expiry
   * block, and both ends are named.
   */
  const from = applier.indexOf("let crystalStamp = crystalBase > 0");
  const to = applier.indexOf("if (conjureExpires) {", from + 1);
  ok("E5 the crystal's paragraph in the applier was found", from > 0 && to > from);
  const slice = applier.slice(from, to);
  ok("E5b THE APPLIER DOES NOT TOUCH THE POOL",
    !/resources\.pp\.value/.test(slice) && /crystalLine\(crystalStamp\.powerCrystal\.pp/.test(slice),
    "a crystal is worth its points to whoever HOLDS it, and the applier is present for exactly "
    + "one of those holders");
  ok("E5c and the arriving points are the hook's business",
    /createItem/.test(wf) && /settleCrystalArrival\(actor, points\)/.test(wf));
}
{
  /*
   * E6 IS THE CLOCK, and it is the other thing the 3.594.1 drive found:
   * three "Power Crystal" rows with no changes sitting on one sheet,
   * because the sweep only ever ran effect -> item. An item that goes
   * early now takes its companion effect with it.
   */
  const conj = read("module", "magic", "conjured-item-workflow.mjs");
  ok("E6 the companion clock names the item it times",
    /conjuredItemId: made\.id/.test(applier),
    "matched by id rather than by name, so a second casting's crystal is safe");
  ok("E6b and an item leaving early deletes its own clock",
    /Hooks\.on\("deleteItem"[\s\S]{0,400}?getFlag\?\.\(SYSTEM_ID, "conjuredItemId"\) === item\.id/.test(conj)
    && /deleteEmbeddedDocuments\("ActiveEffect", clocks\)/.test(conj));
  ok("E6c on the GM's client alone", /export function registerConjuredItemHooks\(\)[\s\S]{0,200}?if \(!game\.user\?\.isGM\) return;/.test(conj));
  ok("E6d and it is registered at startup",
    /registerConjuredItemHooks\(\);/.test(boot) && /conjured-item-workflow\.mjs/.test(boot),
    "a hook nobody registers is this project's most-repeated defect");
}
ok("E4 the card says what it holds and how it behaves",
  /usable as part of their own reserve, and spent first/.test(
    read("module", "magic", "power-crystal.mjs")));
ok("E4b and says so when it dissolves", /dissolves/.test(crystalSpentLine("X", 2)));
eq("E4c one point reads as one", /its point is spent/.test(crystalSpentLine("X", 1)), true);
eq("E4d and several read as several", /its 3 points are spent/.test(crystalSpentLine("X", 3)), true);

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-power-crystal: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-power-crystal: OK — ${checks} checks. `
  + "Points in the pocket are points in the pool, and nothing had to be told.\n");
