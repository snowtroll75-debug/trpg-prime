#!/usr/bin/env node
/**
 * verify-warp-area — a warp that changes the area, and whether the
 * TEMPLATE changes with it.
 *
 * NEW at 3.445.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS PAIR EXISTS FOR, found by casting the spell.
 *
 * Dark Tendrils' card, on one line:
 *
 *   "Warped — +1 PP: the area becomes a 15-foot cone instead of a line.
 *    … Area: 30 ft line template placed — caught 2: Ally, Enemy."
 *
 * `aggregateWarpSelection` lists every mod key it handles and SILENTLY
 * DROPS the rest — the lesson its own header records about
 * `freezeMembership`. There was no area key at all, so eight spells
 * charged PP for an area change that never happened.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION E IS THE ONE THAT WOULD HAVE CAUGHT IT, and it is deliberately
 * a CROSS-CHECK rather than a list: every warp in the pack that carries
 * an area key must be a key the aggregator actually reads. A key nobody
 * handles fails a check rather than a session.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { warpedAreaText, areaGrowthMaxTimes, noteRestatesArea } from "../module/magic/warp-area.mjs";
import { aggregateWarpSelection, buildWarpChooser, emptyWarp } from "../module/magic/spell-warp.mjs";
import { parseSpellArea } from "../module/magic/spell-template.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const cast = read("module", "magic", "cast-workflow.mjs");
const warpSrc = read("module", "magic", "spell-warp.mjs");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ================================================================== *
 * A. THE OVERRIDE — Dark Tendrils' own case
 * ================================================================== */

ok("A1 an override replaces the printed area",
  warpedAreaText("30-foot line", { areaOverride: "15-foot cone" }) === "15-foot cone");
// AND THE TEMPLATE FOLLOWS, which is the whole point — a new string that
// parsed to the same shape would have fixed nothing.
{
  const before = parseSpellArea("30-foot line");
  const after = parseSpellArea(warpedAreaText("30-foot line", { areaOverride: "15-foot cone" }));
  ok("A1b and the shape the canvas draws changes with it",
    before.t === "ray" && after.t === "cone" && after.distance === 15,
    `${before.t}/${before.distance} → ${after.t}/${after.distance}`);
}
ok("A2 no override leaves the area exactly as printed",
  warpedAreaText("30-foot line", {}) === "30-foot line");
ok("A2b as does an empty or blank one",
  warpedAreaText("30-foot line", { areaOverride: "" }) === "30-foot line"
  && warpedAreaText("30-foot line", { areaOverride: "   " }) === "30-foot line",
  "a blank override must not erase a spell's area");
ok("A3 an override beats a growth on the same cast",
  warpedAreaText("10-foot radius", { areaOverride: "30-foot cone", areaGrowth: 10 }) === "30-foot cone");

/* ================================================================== *
 * B. THE GROWTH
 * ================================================================== */

ok("B1 a growth adds its feet to the printed distance",
  warpedAreaText("10-foot emanation", { areaGrowth: 10 }) === "20-foot emanation");
// THE REST OF THE STRING SURVIVES. The shape word is what the canvas
// reads, so rebuilding the text rather than editing it would be a second
// place deciding what shape this spell is.
ok("B1b and keeps the shape word and the spelling around it",
  warpedAreaText("10-ft radius", { areaGrowth: 10 }) === "20-ft radius"
  && warpedAreaText("20-foot emanation", { areaGrowth: 10 }) === "30-foot emanation");
ok("B2 the cap stops it",
  warpedAreaText("10-foot emanation", { areaGrowth: 40, areaMax: 50 }) === "50-foot emanation");
ok("B2b and stops it exactly, not one step past",
  warpedAreaText("10-foot emanation", { areaGrowth: 100, areaMax: 50 }) === "50-foot emanation");
ok("B3 no cap means no ceiling",
  warpedAreaText("20-foot radius", { areaGrowth: 10 }) === "30-foot radius",
  "Forbiddance prints no maximum, and one must not be invented for it");
// A WARP IS SOMETHING BOUGHT. A cap authored below a spell's own area
// would otherwise turn a purchase into a penalty.
ok("B4 a cap below the printed area never shrinks it",
  warpedAreaText("60-foot radius", { areaGrowth: 10, areaMax: 50 }) === "60-foot radius");
ok("B5 a growth of zero changes nothing",
  warpedAreaText("10-foot radius", { areaGrowth: 0 }) === "10-foot radius");
ok("B5b nor does a negative one",
  warpedAreaText("10-foot radius", { areaGrowth: -20 }) === "10-foot radius",
  "a warp must never make a spell smaller");
// A PROSE AREA IS LEFT ALONE rather than having a number invented in it.
ok("B6 an area with no distance is untouched",
  warpedAreaText("the room you are standing in", { areaGrowth: 10 }) === "the room you are standing in");
ok("B6b and an empty area stays empty",
  warpedAreaText("", { areaGrowth: 10 }) === "" && warpedAreaText(null, { areaGrowth: 10 }) === "");
ok("B7 rubbish mods do not throw",
  warpedAreaText("10-foot radius") === "10-foot radius"
  && warpedAreaText("10-foot radius", null) === "10-foot radius");

// The two authored shapes, used by sections C and D alike.
const WARPS = [
  { ppCost: 2, text: "increase the radius by 10-foot (max 50 feet)", mods: { areaGrowth: 10, areaMax: 50 } },
  { ppCost: 1, text: "the area becomes a 15-foot cone instead of a line", mods: { areaOverride: "15-foot cone" } }
];

/* ================================================================== *
 * C. HOW MANY TIMES IT MAY BE BOUGHT
 *
 * FROM THE SPELL'S OWN AREA, because an area cap is an absolute SIZE and
 * not a bonus total — the same option is four purchases on a 10-foot
 * emanation and three on a 20-foot one.
 * ================================================================== */

ok("C1 four purchases from ten feet to fifty",
  areaGrowthMaxTimes({ areaGrowth: 10, areaMax: 50 }, "10-foot emanation") === 4);
ok("C2 three from twenty",
  areaGrowthMaxTimes({ areaGrowth: 10, areaMax: 50 }, "20-foot emanation") === 3,
  "Wellspring Of Valour and Ember Of Devotion sell the same option at different counts");
ok("C3 an uncapped growth is offered once",
  areaGrowthMaxTimes({ areaGrowth: 10 }, "20-foot radius") === 1);
ok("C4 an area already at the cap is offered once",
  areaGrowthMaxTimes({ areaGrowth: 10, areaMax: 50 }, "50-foot radius") === 1);
ok("C5 a non-growth option is offered once",
  areaGrowthMaxTimes({ areaOverride: "15-foot cone" }, "30-foot line") === 1);
ok("C6 and a prose area cannot be counted, so once",
  areaGrowthMaxTimes({ areaGrowth: 10, areaMax: 50 }, "the room") === 1);
ok("C6b an area already past its cap is offered once, not a negative number",
  areaGrowthMaxTimes({ areaGrowth: 10, areaMax: 30 }, "50-foot radius") === 1,
  "the floor carries this; there is deliberately no second guard above it");

// IS IT REACHED? The count above is a rule, and a rule the chooser never
// asks is the defect this project keeps paying for. `buildWarpChooser`
// takes only a spell-shaped object and returns HTML, so this DRIVES it
// rather than reading its source — two mutations survived the first draft
// of this section precisely because it did not.
{
  const spell = { system: { area: "10-foot emanation", warps: [WARPS[0]] } };
  const html = buildWarpChooser(spell, 2);
  ok("C8 the chooser offers a growth as a repeatable count",
    /type="number"[^>]*name="warp-0"/.test(html),
    "a checkbox can only ever buy one step");
  ok("C8b sized from THIS spell's own area", /name="warp-0"[^>]*max="4"/.test(html),
    html.match(/name="warp-0"[^>]*/)?.[0] ?? "no warp-0 control");
}
{
  // The same option on a bigger spell must offer fewer purchases — which
  // is the whole reason the count needs the spell and not just the option.
  const spell = { system: { area: "20-foot emanation", warps: [WARPS[0]] } };
  ok("C9 and a larger area is offered fewer",
    /name="warp-0"[^>]*max="3"/.test(buildWarpChooser(spell, 2)));
}
{
  // An override is a yes/no, so it stays a checkbox.
  const spell = { system: { area: "30-foot line", warps: [WARPS[1]] } };
  const html = buildWarpChooser(spell, 2);
  ok("C10 an override is still offered as a checkbox",
    /type="checkbox"[^>]*name="warp-0"/.test(html));
}
// THE COUNT AND THE CAP AGREE. Buying the maximum number of times must
// land exactly on the ceiling rather than short of it or past it.
{
  const mods = { areaGrowth: 10, areaMax: 50 };
  const times = areaGrowthMaxTimes(mods, "10-foot emanation");
  const bought = warpedAreaText("10-foot emanation", { areaGrowth: mods.areaGrowth * times, areaMax: mods.areaMax });
  ok("C7 buying the maximum lands exactly on the cap", bought === "50-foot emanation", bought);
}

/* ================================================================== *
 * D. THE AGGREGATOR CARRIES THEM
 * ================================================================== */

{
  const agg = aggregateWarpSelection(WARPS, { "warp-0": 3 });
  ok("D1 a repeated growth is multiplied by the count", agg.mods.areaGrowth === 30);
  ok("D1b and its cap comes along", agg.mods.areaMax === 50);
  ok("D1c and the PP with it", agg.ppSpent === 6);
  ok("D1d and the area really grows by all of it",
    warpedAreaText("10-foot emanation", agg.mods) === "40-foot emanation");
}
{
  const agg = aggregateWarpSelection(WARPS, { "warp-1": 1 });
  ok("D2 an override is carried", agg.mods.areaOverride === "15-foot cone");
  ok("D2b and costs its PP", agg.ppSpent === 1);
}
{
  // AN OVERRIDE IS NOT MULTIPLIED. "The area becomes a cone" is true or
  // it is not, so a count of three buys one cone and three lots of PP.
  const agg = aggregateWarpSelection(WARPS, { "warp-1": 3 });
  ok("D3 taking an override repeatedly still yields one area",
    agg.mods.areaOverride === "15-foot cone");
}
{
  const agg = aggregateWarpSelection(WARPS, {});
  ok("D4 an unwarped cast carries no area change",
    agg.mods.areaGrowth === 0 && agg.mods.areaOverride === null
    && warpedAreaText("30-foot line", agg.mods) === "30-foot line");
}

/* ================================================================== *
 * E. THE CROSS-CHECK — no area key the aggregator cannot read
 *
 * The `freezeMembership` lesson, applied to this batch before it can
 * repeat: a key authored on the pack and dropped by the aggregator is a
 * warp that charges for nothing.
 * ================================================================== */

const AREA_KEYS = ["areaGrowth", "areaMax", "areaOverride"];
const aggBody = strip(warpSrc);
for (const key of AREA_KEYS) {
  ok(`E1 the aggregator reads ${key}`, aggBody.includes(`m.${key}`),
    "a mod key nobody reads is silently dropped");
  ok(`E1b and publishes ${key}`, new RegExp(`\\b${key}\\s*:`).test(aggBody));
}

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") spells.push(v);
  }
} finally { await db.close(); }

ok("E2 the spells pack was read", spells.length > 600, `only ${spells.length} found`);

const authored = [];
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    const keys = Object.keys(w.mods ?? {});
    if (keys.some((k) => AREA_KEYS.includes(k))) authored.push({ spell: s, warp: w });
  }
}
// E3 MOVED 8 → 12 AT 3.519.0, 12 → 18 AT 3.520.0, AND 18 → 25 AT
// 3.530.0. The range channel gave four spells an `areaOverride` alongside
// a new range; the target-count channel gave six more one alongside a new
// cap — Clarity, Neutralise Poison, Rage, Cloak Of Greying, Brawn and
// Wits. Both times for the same reason: the printed sentence changes two
// things at once, and `areaOverride` has existed since 3.445.0 to carry
// the second.
//
// THE SEVEN ADDED AT 3.530.0 ARE A DIFFERENT CASE and worth naming,
// because they are the plainest one there has been: six Word Of ___
// spells whose warps read, byte for byte, "the spell effects all
// creatures in a 20 feet radius", plus Aid. Nothing in the sentence was
// ambiguous and nothing needed building — the mod had simply never been
// authored, so the option was offered, charged, and dropped. Aid is the
// exception that earned new code: its warp says "all ALLIES", and the
// side an area lands on had never been warpable. See
// verify-warp-area-targeting.
// AND 25 → 26 AT 3.531.0: Luminous Flare's "increase the area by
// 15-feet (max 60 feet)" — a plain areaGrowth/areaMax pair on a printed
// 15-foot cone. No code; the mod had never been authored, exactly like
// the seven before it.
// AND 26 → 30 AT 3.534.0: the four "affects all allies" warps whose rows
// target `self`. These are the ones 3.530.0 EXCLUDED — an area over a
// self row grants nothing to anyone inside it — and `shareSelfRows` is
// what fixed the reason rather than working around it.
// 30 → 31 at 3.539.0: Word Of Stunning. Its warp carried the SAME
// SENTENCE as Word Of Blinding's, character for character, at the same
// 4 PP on a spell with the same range and target line — and had simply
// never been filled in. This count is meant to grow when a warp is
// built; it exists so one appearing that nobody declared gets noticed.
ok("E3 the thirty-one area warps are authored", authored.length === 31,
  `${authored.length} found: ${authored.map((a) => a.spell.name).join(", ")}`);

// EVERY AUTHORED WARP MUST ACTUALLY MOVE ITS SPELL'S AREA. This is the
// check that would have caught the original defect, and it is driven
// against the real pack rather than a fixture.
const inert = [];
for (const { spell, warp } of authored) {
  const area = String(spell.system?.area ?? "");
  const agg = aggregateWarpSelection([warp], { "warp-0": 1 });
  const after = warpedAreaText(area, agg.mods);
  const before = parseSpellArea(area);
  const now = parseSpellArea(after);
  if (after === area) { inert.push(`${spell.name}: text unchanged (${area})`); continue; }
  /*
   * AN OVERRIDE MAY CREATE AN AREA, NOT ONLY MOVE ONE (3.519.0).
   *
   * This used to demand that the BASE area parse, and four spells broke
   * it: Blindness, Flame Prison, Force Prison and Dance Macabre each
   * print NO area at all and sell a warp that gives them one ("the
   * spell affects all creatures in a 20-foot radius"). Their base
   * rightly does not parse, and the check was reading that as the warp
   * being inert when it is the opposite — the largest change an area
   * warp can make.
   *
   * VERIFIED BEFORE WIDENING IT, by running the workflow's own two
   * calls: `warpedAreaText("", {areaOverride: "20-foot radius"})` gives
   * "20-foot radius" and `parseSpellArea` turns it into a 20-foot
   * circle. `cast-workflow.mjs` gates template placement on that config
   * alone and never on the printed area, so the template really is
   * drawn.
   *
   * WHAT STILL HAS TO BE TRUE either way: the WARPED area must parse. A
   * warp that leaves the template unbuildable has bought nothing
   * whether the spell had an area before or not.
   */
  if (!now) { inert.push(`${spell.name}: warped area does not parse (${after})`); continue; }
  if (!before) continue;   // an area created where there was none — a real change
  if (before.t === now.t && before.distance === now.distance) {
    inert.push(`${spell.name}: template identical (${now.t} ${now.distance})`);
  }
}
ok("E4 every authored area warp really moves the template", inert.length === 0, inert.join("; "));

// AND NO OTHER MOD KEY HAS CREPT IN unhandled — the same cross-check the
// emanation work introduced, widened to the whole vocabulary.
//
// THE VOCABULARY IS ASKED OF THE AGGREGATOR, NOT TYPED HERE AGAIN.
// This was a hand-written list, and at 3.493.0 it did exactly what a
// second copy always does: Gravity Weapon's two new warp keys were added
// to `aggregateWarpSelection` and this check still called them unknown,
// because it was reading a list that had not been told. `emptyWarp()`
// returns the aggregator's own default mods object, so its keys ARE the
// vocabulary and the two cannot disagree again.
const HANDLED = new Set([...Object.keys(emptyWarp().mods), ...AREA_KEYS]);
ok("E5a the vocabulary was read from the aggregator", HANDLED.size >= 8,
  `${HANDLED.size} keys — an empty set would make E5 vacuously true`);
const unknown = new Set();
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    for (const k of Object.keys(w.mods ?? {})) if (!HANDLED.has(k)) unknown.add(`${s.name}.${k}`);
  }
}
ok("E5 no warp carries a mod key the aggregator would drop", unknown.size === 0,
  [...unknown].join(", "));

// AND NO SECOND PLACE STATES THE AREA (3.445.1). Ember Of Devotion's own
// printed note read "10-ft aura (allies only)…", which matched its area
// exactly until a warp could grow it — and then the card said "Area: 20 ft
// emanation … template placed" four lines above "10-ft aura". Driven in
// Graham's world the day the growth shipped: the same card contradicting
// itself about the same circle, which is the defect 3.445.0 exists to end.
// The card already prints the radius from the template it placed, so a
// note that restates it is redundant before a warp and wrong after.
const restated = [];
for (const { spell } of authored) {
  for (const effect of (spell.system?.effects ?? [])) {
    if (effect?.kind !== "note") continue;
    if (noteRestatesArea(spell.system?.area, effect.text)) {
      restated.push(`${spell.name}: "${effect.text}"`);
    }
  }
}
ok("E6 no area-warped spell has a note that restates its own area",
  restated.length === 0, restated.join("; "));

/* ---- the ratchet's own rule, driven (3.445.1) ---- */

ok("E6b it recognises the case it was written for",
  noteRestatesArea("10-foot emanation", "10-ft aura (allies only) that also sheds dim light."),
  "Ember Of Devotion's note, and the card that printed it under a 20 ft template");
ok("E6c and the note as it now reads is clean",
  !noteRestatesArea("10-foot emanation", "An aura (allies only) that also sheds dim light."));
// A DIFFERENT DISTANCE IS A DIFFERENT FACT. Wash Away Sin's note talks
// about healing dice, not about its cone, and must not be swept up.
ok("E6d a note with an unrelated distance is left alone",
  !noteRestatesArea("15-foot cone", "allies heal 1d8 within 60 feet"));
ok("E6e a note with no distance at all is fine",
  !noteRestatesArea("10-foot emanation", "allies heal 1d8"));
ok("E6f and a prose area cannot restate anything",
  !noteRestatesArea("the room you are standing in", "a 10-ft aura"));
ok("E6g rubbish does not throw",
  noteRestatesArea() === false && noteRestatesArea(null, null) === false);

/* ================================================================== *
 * F. AND THE CAST USES IT
 * ================================================================== */

const castClean = strip(cast);
ok("F1 the cast computes the warped area",
  castClean.includes("const warpedArea = warpedAreaText(effArea, warpMods);"));
ok("F2 and the TEMPLATE is built from it, not from the printed area",
  castClean.includes("parseSpellArea(warpedArea, effRange)")
  && !castClean.includes("parseSpellArea(effArea, effRange)"),
  "this is the line that drew a 30-foot line under a card saying \"cone\"");
// THE CARD'S OWN SENTENCE COMES FROM THE SAME CONFIG the template did, so
// the two cannot disagree again.
ok("F3 the card names the area it actually placed",
  castClean.includes("describeArea(areaConfig)"),
  "one value behind both, which is what stopped them contradicting each other");
ok("F4 the range gate reads the warped area too",
  castClean.includes("warpedArea ? parseRangeFeet(effRange) : null"),
  "a warp that gives an area to a spell that had none must be placed like an area");

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-warp-area: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-warp-area: OK — ${checks} checks. Thirty spells' area warps reach the template, `
  + `and no mod key is silently dropped.\n`);
