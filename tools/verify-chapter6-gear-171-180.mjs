/**
 * verify-chapter6-gear-171-180 — the Goods, Kits & Tools, Food, Clothing,
 * Services, Mounts & Vehicles, and the elixirs and herbs (pages 171-180).
 *
 * NEW at 3.577.0, for the pages 171-180 audit. The tables were right (399
 * of 400 fields); the rules around them were not. Nine defects, and
 * Graham's rulings of 20 September 2026:
 *
 *   - alchemy made without its feat or its tools, and a lab worth nothing;
 *   - a healer's kit carried and never spent, and one spent to nothing
 *     that still counted; a disguise kit that never ran out;
 *   - winter clothing that kept nobody warm;
 *   - fifteen elixirs and herbs that were text, used for no AP at all;
 *   - a rider who fell out of the saddle and stayed mounted;
 *   - and R2, R4, R6-R11: the table's Goods figures, the kits Create
 *     needs, skittish steeds, runed Travellers clothing, the Spyglass,
 *     the Grappling Hook, and a Vehicles compendium.
 *
 * 3.577.1 (section H): Graham's R5 on herbs, and the three things the
 * 3.577.0 live test found — an alchemist refused for want of a Crafting
 * specialty, an empty Set DC box read as DC 0, and "Tester is Fist of Rock".
 * 3.577.2 (section I): a vehicle's sheet hides the creature numbers
 * (Graham's ruling), and a ruined herb's card stops printing Chapter 4's
 * Fumble row above its own (F4 of the 3.577.1 live test).
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE or from one of
 * Graham's rulings, never from the module under test. The tables below are
 * the book's rows as extracted from rulebook 3.8.1, pages 171-180.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { goodsConditionals, goodsUseLabel, GRAPPLING_HOOK, grapplingHookOutcome } from "../module/goods.mjs";
import {
  CREATE_KITS, TOOL_USE_ACTIONS, createKitShortfall, isToolAvailable, isToolExhausted,
  toolPenaltyRow, toolShortfall, toolShortfallText, toolToSpend
} from "../module/tools-requirement.mjs";
import {
  FEATLESS_HERB_DC, craftingFeatGate, createTypeGateView, featGovernedCreateTypes, featlessHerbDC
} from "../module/crafting-feats.mjs";
import { ITEM_TYPES, alchemicalCheckTraits, createPerDay, fumbleRuinsAtOnce, ruinedOnTheDay } from "../module/create-crafting.mjs";
import { normaliseConditional, matchesCheck } from "../module/conditionals.mjs";
import { ALCHEMICAL_COST_TABLE, alchemicalPrice } from "../module/alchemical.mjs";
import {
  ANGELSTEP_DYING_BONUS, CONSCIOUS_WHILE_DYING_FLAG, FIST_OF_ROCK, activationCastTime, activationCost,
  alchemicalLevelSummary, isAlchemicalConsumable, recipientMode, scaledAlchemicalEffect, speedPlanFor,
  speedPlans, stoneFistProfile, withheldIncludes
} from "../module/elixirs.mjs";
import { MARKERS, markerAppliedLine } from "../module/magic/markers.mjs";
import { RELIEVABLE, normaliseConditionRelief } from "../module/magic/condition-relief.mjs";
import { resolveConditions } from "../module/conditions/registry.mjs";
import {
  STEED_PANIC, STEED_PANIC_FLAG, calmsSteed, fallsFromSaddle, mountedAfterSuccess, mountedState, steedPanics
} from "../module/combat/mounted.mjs";
import { isBodyArmour, runeKindOf, runesCountFor } from "../module/rune-bearing.mjs";
import { runeBonusesForActor } from "../module/rune-effects.mjs";
import { healingEarthItemData } from "../module/magic/healing-earth.mjs";
import { isVehicleActor, vehicleOf, vehiclePilotView } from "../module/vehicles.mjs";
import { vehicleDocument, vehiclePilotDC } from "./build-vehicles.mjs";
import { levelDC, parseEnteredDC } from "../module/dice/resolution.mjs";
import { SIZE_TABLE } from "../module/config.mjs";

let failures = 0;
let checks = 0;
function ok(label, condition, why = "") {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL ${label}${why ? ` — ${why}` : ""}`);
}
function eq(label, actual, expected, why = "") {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `${why}${why ? " — " : ""}got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
// Comments are stripped before a source pattern is looked for, so a
// sentence ABOUT the code cannot pass for the code.
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

async function packDocs(pack, prefix = "!items!") {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith(prefix) && !key.slice(prefix.length).includes("!")) out.push(value);
  }
  await db.close();
  return out;
}
const byName = (docs) => new Map(docs.map((d) => [d.name, d]));
const GEAR = byName(await packDocs("gear"));
const ALCH = byName(await packDocs("alchemical"));
const G = (name) => GEAR.get(name);
const A = (name) => ALCH.get(name);
const equip = (item, extra = {}) => ({ ...item, system: { ...item.system, equipped: true, ...extra } });
const atLevel = (item, level) => ({ ...item, system: { ...item.system, itemLevel: level } });

/* ================================================================== */
/* A — THE TABLES (pages 171-173, 177-178)                             */
/* ================================================================== */

// Name, cost, size, level, weight — as printed.
const PRINTED_171 = Object.freeze([
  // GOODS
  ["Astrolabe", "300 gp", "T", "3", "10 lbs"],
  ["Axe, woodsman", "1 gp", "S", "0", "2 lbs"],
  ["Backpack", "1 gp", "-", "0", "3 lbs"],
  ["Bedroll", "2 sp", "-", "0", "3 lbs"],
  ["Block & Tackle", "10 gp", "M", "0", "25 lbs"],
  ["Brand", "5 sp", "S/1h", "0", "3 lbs"],
  ["Brass Ear", "10 gp", "T", "0", "1/2 lb"],
  ["Buoyancy Vest", "50 gp", "M", "1", "2 lbs"],
  ["Caltrops", "3 gp", "S", "0", "2 lbs"],
  ["Candle", "1 sp", "T", "0", "-"],
  ["Chain", "40 gp", "S/2h", "0", "10 lbs"],
  ["Chest, Large", "20 gp", "M", "0", "20 lbs"],
  ["Chest, Small", "15 gp", "S", "0", "10 lbs"],
  ["Compass", "40 gp", "T", "0", "1 lbs"],
  ["Concealed Sheath", "250 gp", "S", "3", "1/2 lb"],
  ["Crafting Book", "1 gp", "T", "0", "-"],
  ["Crossbow Bolt case", "5 gp", "S", "0", "1 lb"],
  ["Earplugs", "1 gp", "T", "0", "-"],
  ["Flag/Standard", "40 gp", "M", "0", "12 lbs"],
  ["Flint & Steel/Tinderbox", "5 cp", "T", "0", "-"],
  ["Formula Book", "50 gp", "T", "1", "1 lb"],
  ["Game", "5 gp", "S", "0", "1 lb"],
  ["Glasses/Goggles", "20 gp", "T", "0", "-"],
  ["Grappling Hook", "1 gp", "S", "0", "4 lbs"],
  ["Grooming Case", "8 gp", "T", "0", "2 lbs"],
  ["Hammer, Tool", "1 gp", "T", "0", "2 lbs"],
  ["Holly & Mistletoe", "-", "T", "0", "-"],
  ["Holy Book", "25 gp", "T", "0", "3 lbs"],
  ["Holy Symbol - Silver", "75 gp", "T", "1", "1 lb"],
  ["Holy Symbol - Wood", "5 gp", "T", "0", "1 lb"],
  ["Hourglass", "30 gp", "T", "0", "3 lbs"],
  ["Jar/Jug", "3 sp", "T", "0", "1 lbs"],
  ["Lantern, Bullseye", "30 gp", "T", "0", "3 lbs"],
  ["Lantern, Candle", "8 gp", "T", "0", "1 lb"],
  ["Lantern, Hooded", "20 gp", "T", "0", "2 lbs"],
  ["Lanyard", "1 gp", "T", "0", "1/2 lb"],
  ["Magnet", "10 gp", "T", "1", "1 lbs"],
  ["Magnifying Glass", "400 gp", "T", "4", "1/2 lb"],
  ["Manacles", "30 gp", "T", "0", "2 lbs"],
  ["Map, Average", "5 gp", "T", "0", "-"],
  ["Map, Detailed", "30 gp", "T", "0", "-"],
  ["Mirror", "25 gp", "T", "0", "1/2 lb"],
  ["Mug", "1 cp", "T", "0", "-"],
  ["Music Box", "75 gp", "T", "1", "1 lbs"],
  ["Musical Instrument", "50 gp", "S", "1", "5 lbs"],
  ["Oil (pint)", "1 sp", "T", "0", "1 lb"],
  ["Pipe", "5 gp", "T", "0", "-"],
  ["Pole, 10 ft", "1 sp", "L", "0", "5 lbs"],
  ["Pouch, Ammo", "5 sp", "T", "0", "-"],
  ["Pouch, Coin", "2 sp", "T", "0", "-"],
  ["Quiver", "5 gp", "T", "0", "1 lb"],
  ["Ram, Portable", "250 gp", "L", "3", "20 lbs"],
  ["Ring, Poison", "80 gp", "T", "1", "-"],
  ["Rope, Hemp", "6 gp", "S", "0", "10 lbs"],
  ["Rope, Silk", "20 gp", "S", "0", "5 lbs"],
  ["Sack", "1 sp", "S", "0", "1/2 lb"],
  ["Saddlebags", "10 gp", "S", "0", "5 lbs"],
  ["Saw", "5 gp", "S", "0", "2 lbs"],
  ["Scale, Hand", "35 gp", "S", "0", "2 lbs"],
  ["Seal/Signet Ring", "40 gp", "T", "0", "-"],
  ["Shovel", "5 gp", "S", "0", "5 lbs"],
  ["Snowshoes", "10 gp", "S", "0", "3 lbs"],
  ["Spyglass", "230 gp", "T", "3", "3 lbs"],
  ["Tent", "10 gp", "L", "0", "15 lbs"],
  ["Torch", "1 sp", "S", "0", "1 lb"],
  ["Waterskin", "5 sp", "T", "0", "1/2 lb"],
  ["Whistle", "2 gp", "T", "0", "-"],
  ["Wrist Sheath", "10 gp", "T", "0", "1 lb"],
  ["Wrist Sheath (Spring)", "50 gp", "T", "1", "1 lb"],
  // KITS & TOOLS
  ["Alchemy Lab", "500 gp", "H", "4", "40 lbs"],
  ["Alchemy Tools", "50 gp", "T", "1", "5 lbs"],
  ["Artisan Tools", "40 gp", "S", "0", "5 lbs"],
  ["Component Pouch", "20 gp", "T", "0", "2 lbs"],
  ["Cookware", "10 gp", "M", "0", "10 lbs"],
  ["Crowbar", "5 sp", "S", "0", "5 lbs"],
  ["Disguise Kit", "20 gp", "T", "0", "2 lbs"],
  ["Healers Tools", "50 gp", "S", "1", "2 lbs"],
  ["Herbalism Kit", "20 gp", "S", "0", "4 lbs"],
  ["Repair Kit", "20 gp", "S", "0", "3 lbs"],
  ["Replacements", "10% cost", "-", "-", "-"],
  ["Scribes Kit", "10 gp", "T", "0", "2 lbs"],
  ["Snare Kit", "50 gp", "S", "1", "5 lbs"],
  ["Thieves Tools", "30 gp", "T", "0", "1 lb"],
  // FOOD, DRINK & LODGINGS
  ["Ale (mug)", "5 sp", "T", "0", "1/2 lb"],
  ["Animal Feed", "5 sp", "M", "0", "20 lbs"],
  ["Coffee/Tea", "1 gp", "T", "0", "-"],
  ["Lodging, Bed", "1 gp", "-", "-", "-"],
  ["Lodging, Floor", "3 sp", "-", "-", "-"],
  ["Lodging, Room", "8 gp", "-", "-", "-"],
  ["Meal", "1 gp", "T", "0", "2 lbs"],
  ["Rations", "5 gp", "T", "0", "1/2 lb"],
  ["Spices", "3 gp", "T", "0", "-"],
  ["Spirits (bottle)", "10 gp", "T", "0", "2 lbs"],
  ["Stabling", "2 sp", "-", "-", "-"],
  ["Wine (bottle)", "5 gp", "T", "0", "2 lbs"],
  // CLOTHING
  ["Common", "1 gp", "-", "0", "2 lbs"],
  ["Fine", "40 gp", "-", "0", "6 lbs"],
  ["Noble Fashion", "100 gp", "-", "1", "12 lbs"],
  ["Travellers", "5 gp", "-", "0", "8 lbs"],
  ["Winter", "5 gp", "-", "0", "7 lbs"],]);
const gp = (text) => {
  const t = String(text).replace(/,/g, "").trim();
  if (t === "-") return 0;
  const m = /^([\d.]+)\s*(gp|sp|cp)$/.exec(t);
  return m ? Number(m[1]) * { gp: 1, sp: 0.1, cp: 0.01 }[m[2]] : null;
};
const lbs = (text) => {
  const t = String(text).trim();
  if (t === "-") return 0;
  const m = /^([\d/.]+)\s*lbs?$/.exec(t);
  if (!m) return null;
  const [a, b] = m[1].split("/");
  return b ? Number(a) / Number(b) : Number(a);
};
// THE ONE PRINTED FIGURE A PRICE CANNOT HOLD, recorded rather than skipped.
const UNREPRESENTABLE = Object.freeze({ "Replacements|cost": "10% of the kit's cost — a percentage, not a price" });
{
  const diffs = [];
  let fields = 0;
  for (const [name, cost, size, level, weight] of PRINTED_171) {
    const item = GEAR.get(name) ?? Array.from(GEAR.values()).find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (!item) { diffs.push(`${name}: not in the gear pack`); continue; }
    const s = item.system;
    const rows = [
      ["cost", gp(cost), Number(s.price)],
      ["size", size, String(s.itemSize ?? "")],
      ["level", level === "-" ? 0 : Number(level), Number(s.itemLevel ?? 0)],
      ["weight", lbs(weight), Number(s.weight)]
    ];
    for (const [field, want, got] of rows) {
      fields++;
      if (UNREPRESENTABLE[`${name}|${field}`]) continue;
      const same = typeof want === "number" ? Math.abs(want - got) < 1e-9 : String(want) === String(got);
      if (!same) diffs.push(`${name} ${field}: printed ${want}, pack ${got}`);
    }
  }
  eq("A1 every printed row is 100 rows", PRINTED_171.length, 100);
  eq("A2 400 fields compared", fields, 400);
  ok("A3 the Goods, Kits & Tools, Food and Clothing tables match the pack (399 of 400; Replacements' 10% recorded)",
    diffs.length === 0, diffs.join("; "));
}

// The elixirs and herbs: name, level, price, activation — as printed.
const PRINTED_ALCHEMY = Object.freeze([
  ["Anti-Plague", 1, 25, "Interact (1 AP)"], ["Antitoxin", 1, 25, "Interact (1 AP)"],
  ["Blood-Block", 2, 50, "Interact (1 AP)"], ["Fist of Rock", 4, 130, "Interact (1 AP)"],
  ["Health", 1, 25, "Interact (1 AP)"], ["Leaping Juice", 1, 25, "Interact (1 AP)"],
  ["Smelling Salts", 2, 50, "Interact (1 AP)"], ["Soothe Syrup", 1, 25, "Interact (1 AP)"],
  ["Speed", 2, 50, "Interact (1 AP)"], ["Angelstep", 2, 50, "Interact (1 AP)"],
  ["Black Amaranth", 3, 85, "Interact, Manipulate (3 AP)"], ["Bloody Mandrake", 3, 85, "Interact, Manipulate (3 AP)"],
  ["Bone Reed", 2, 50, "Interact (1 minute)"], ["Dream Lichen", 12, 3060, "Interact (1 minute)"],
  ["Firqueline", 7, 550, "Interact (2 AP)"]
]);
{
  const diffs = [];
  for (const [name, level, price, activation] of PRINTED_ALCHEMY) {
    const item = A(name);
    if (!item) { diffs.push(`${name}: missing`); continue; }
    if (Number(item.system.itemLevel) !== level) diffs.push(`${name} level ${item.system.itemLevel}`);
    if (Number(item.system.price) !== price) diffs.push(`${name} price ${item.system.price}`);
    if (item.system.activation !== activation) diffs.push(`${name} activation ${item.system.activation}`);
  }
  ok("A4 the fifteen elixirs and herbs: level, price and activation as printed", diffs.length === 0, diffs.join("; "));
}
eq("A5 the Alchemical Item Cost table, levels 1-20 (page 178)", ALCHEMICAL_COST_TABLE,
  [25, 50, 85, 130, 215, 350, 525, 785, 1135, 1575, 2185, 3060, 4375, 6560, 9625, 14000, 21875, 35000, 56875, 96250]);
eq("A5b and the price is read off it", [1, 7, 12, 20].map(alchemicalPrice), [25, 525, 3060, 96250]);

/* ================================================================== */
/* B — THE GOODS (R2, D6, R10)                                         */
/* ================================================================== */

const offered = (name) => goodsConditionals([equip(G(name))]).map((c) => [c.value, c.type]);
eq("B1 R2 Bedroll: the table's +2", offered("Bedroll"), [[2, "item"]], "'+2 to resist cold environment'");
eq("B2 R2 Compass: the table's +2", offered("Compass"), [[2, "item"]], "'Sense Direction +2'");
eq("B3 R2 Earplugs: the table's +1, and the description's -2 to hearing kept", offered("Earplugs"), [[1, "item"], [-2, "item"]]);
eq("B4 D6 Winter clothing: +2 item against extreme cold", offered("Winter"), [[2, "item"]]);
ok("B4b as a Fortitude save, the way the Furs row reads", (() => {
  const row = goodsConditionals([equip(G("Winter"))])[0];
  return JSON.stringify(row?.when) === JSON.stringify({ checkTypes: ["save"], subjects: ["fortitude"] }) && row.auto === false;
})());
eq("B5 R10 Spyglass: +2 item Perception at a distance", offered("Spyglass"), [[2, "item"]]);
eq("B6 nothing offered from the pack", goodsConditionals([G("Winter"), G("Spyglass")]), []);

// The Grappling Hook: the description wins (R2).
ok("B7 the hook has a use", /secret attack roll/.test(goodsUseLabel(G("Grappling Hook"))));
eq("B8 the anchor's printed DC is 'typically DC 20'", GRAPPLING_HOOK.defaultDC, 20);
eq("B9 success holds", grapplingHookOutcome("success"), { secure: true, seemsToHold: true, dislodges: false });
eq("B9b a critical holds", grapplingHookOutcome("critical"), { secure: true, seemsToHold: true, dislodges: false });
eq("B9c a failure is seen to fail", grapplingHookOutcome("failure"), { secure: false, seemsToHold: false, dislodges: false });
eq("B9d a partial is a failure", grapplingHookOutcome("partial"), { secure: false, seemsToHold: false, dislodges: false });
eq("B9e a fumble LOOKS secure — 'a false sense of security'", grapplingHookOutcome("fumble"), { secure: false, seemsToHold: true, dislodges: true });
{
  const src = code("module", "goods-workflow.mjs");
  ok("B10 the throw is rolled blind — 'an attack roll with the secret trait'", /rollMode: BLIND_ROLL_MODE,/.test(src));
  ok("B10b the thrower sees only whether it seems to hold", /outcome\.seemsToHold\s*\?/.test(src));
  ok("B10c the GM is told the truth", /whisper: ChatMessage\.getWhisperRecipients\("GM"\)/.test(src) && /outcome\.dislodges/.test(src));
  ok("B10d the button reaches it", /if \(use === GRAPPLING_HOOK\.use\) return anchorGrapplingHook\(actor, item\);/.test(src));
}

/* ================================================================== */
/* C — KITS & TOOLS (D1-D5, R3, R4, R6)                                */
/* ================================================================== */

const kit = (value, extra = {}) => ({ name: "Healers Tools", type: "gear", system: { quantity: 1, traits: "Healer's Tools", uses: { value, max: 10 }, ...extra } });
ok("C1 D4 an exhausted kit is exhausted", isToolExhausted(kit(0)) && !isToolExhausted(kit(1)));
ok("C1b a kit that counts nothing is never exhausted", !isToolExhausted({ system: { uses: { value: 0, max: 0 } } }));
ok("C2 D4 'a healer's kit is exhausted after 10 uses' — and no longer counts", !isToolAvailable(kit(0)) && isToolAvailable(kit(3)));
eq("C3 and says so rather than 'not carrying'", toolShortfallText(toolShortfall({ actionKey: "treatWounds", items: [kit(0)] })),
  "your Healers Tools are exhausted");
ok("C3b the penalty row says it too", /exhausted/.test(toolPenaltyRow({ actionKey: "treatWounds", items: [kit(0)] })?.hint ?? ""));
ok("C4 D4 a CARRIED kit is spent — the same kit the requirement accepted",
  toolToSpend({ actionKey: "treatWounds", items: [kit(5, { equipped: false })] })?.system.uses.value === 5);
ok("C4b a stowed kit is neither", toolToSpend({ actionKey: "treatWounds", items: [kit(5, { stowed: true })] }) === null);
{
  const earth = healingEarthItemData({ casterLevel: 3 });
  ok("C5 Healing Earth satisfies the requirement — 'used instead of healer's tools'",
    toolShortfall({ actionKey: "treatWounds", items: [earth] }) === null);
  eq("C5b and is spent before the kit you paid for", toolToSpend({ actionKey: "treatWounds", items: [kit(5), earth] })?.name, "Healing Earth");
}
eq("C6 the actions that spend a use", [...TOOL_USE_ACTIONS].sort(),
  ["disguise", "treatDisease", "treatInjury", "treatToxin", "treatWounds"]);
eq("C7 D5 the Disguise Kit counts its 10 disguises", G("Disguise Kit").system.uses, { value: 10, max: 10 });
ok("C7b and a Disguise spends one", toolToSpend({ actionKey: "disguise", items: [{ ...G("Disguise Kit") }] })?.name === "Disguise Kit");
ok("C7c a Pick Lock does not spend a disguise", toolToSpend({ actionKey: "pickLock", items: [G("Disguise Kit")] }) === null);
{
  const src = code("module", "combat", "action-workflow.mjs");
  ok("C8 the Treat actions spend through the requirement's kit", /if \(TOOL_USE_ACTIONS\.includes\(action\.key\)\) \{\s*await spendToolUse\(actor, action\.key\);/.test(src));
  ok("C8b and the equipped-only spender is gone from there", !/consumeGearUse\(actor, HEALERS_TOOLS\)/.test(src));
  ok("C8c Disguise, which rolls nothing, spends on its own path", /const spent = await spendToolUse\(actor, action\.key\);/.test(src));
  ok("C8d and says when there is no kit, rather than offering a penalty on a roll that does not exist",
    /the GM decides whether it can be done without/.test(src));
}

// Create: the feat (D1), the kits (D2, R4), the lab (D3, R6).
const FEAT = ITEM_TYPES.elixirs.feat;
eq("C9 the five alchemical types name Alchemical Crafting", ["elixirs", "oils", "poisons", "vials", "herbs"].map((k) => ITEM_TYPES[k].feat),
  ["Alchemical Crafting", "Alchemical Crafting", "Alchemical Crafting", "Alchemical Crafting", "Alchemical Crafting"]);
eq("C10 D1 no feat, no elixir — 'you must have the Alchemical Crafting feat'",
  craftingFeatGate({ itemTypeKey: "elixirs", requiredFeat: FEAT, featNames: ["Toughness"] }).allowed, false);
eq("C10b with it, no tick to answer", craftingFeatGate({ itemTypeKey: "herbs", requiredFeat: FEAT, featNames: ["Alchemical Crafting"] }),
  { allowed: true, reason: "", selfDeclared: false });
eq("C10c an alternation is still asked, not refused", craftingFeatGate({ itemTypeKey: "magical", requiredFeat: ITEM_TYPES.magical.feat, featNames: [] }),
  { allowed: true, reason: "", selfDeclared: true });
eq("C10d Scribe Scroll is unchanged", craftingFeatGate({ itemTypeKey: "scrolls", requiredFeat: "Scribe Scroll", featNames: [] }).allowed, false);
const TOOLS = { name: "Alchemy Tools", type: "gear", system: { quantity: 1 } };
const LAB = { name: "Alchemy Lab", type: "gear", system: { quantity: 1 } };
const HERB = { name: "Herbalism Kit", type: "gear", system: { quantity: 1 } };
const SCRIBE = { name: "Scribes Kit", type: "gear", system: { quantity: 1 } };
const has = (type, items) => createKitShortfall({ itemTypeKey: type, items }) === null;
ok("C11 D2 'not possible to make alchemical items without these tools'", !has("elixirs", []) && has("elixirs", [TOOLS]));
ok("C11b an Alchemy Lab serves as well", has("oils", [LAB]) && has("vials", [LAB]));
ok("C11c R4 poisons take alchemist's tools, a lab or a herbalism kit", has("poisons", [HERB]) && has("poisons", [TOOLS]) && !has("poisons", [SCRIBE]));
ok("C11d R4 herbs take a herbalism kit, and only that", has("herbs", [HERB]) && !has("herbs", [TOOLS]));
ok("C11e R4 scrolls take a scribe's kit", has("scrolls", [SCRIBE]) && !has("scrolls", []));
ok("C11f R4 mundane and magical items keep the tick", has("mundane", []) && has("magical", []) && !CREATE_KITS.mundane && !CREATE_KITS.magical);
ok("C11g a stowed kit is not to hand", !has("elixirs", [{ ...TOOLS, system: { quantity: 1, stowed: true } }]));
eq("C12 a missing kit blocks Begin, and the tools tick is hidden",
  createTypeGateView({ allowed: true, selfDeclared: false }, { checked: true, shortfall: { reason: "needs a kit" } }),
  { blocked: true, showTick: false, showToolsTick: false, notice: "needs a kit" });
eq("C12b a type with no named kit keeps its tick",
  createTypeGateView({ allowed: true, selfDeclared: true }, { checked: false, shortfall: null }),
  { blocked: false, showTick: true, showToolsTick: true, notice: "" });
{
  const wf = code("module", "create-crafting-workflow.mjs");
  const act = code("module", "combat", "action-workflow.mjs");
  ok("C13 the dialog checks the character's own items", /createKitShortfall\(\{ itemTypeKey: t\.key, items \}\)/.test(wf)
    && /createTypeGateView\(gates\[typeSel\?\.value\], kits\[typeSel\?\.value\]\)/.test(wf));
  ok("C13b and is handed them", /items: Array\.from\(actor\.items \?\? \[\]\),\s*onlyTypes: createFeatOnlyTypes\s*\}\);/.test(act));
  ok("C13c a day's work needs the kit as much as the first", /const kitShort = createKitShortfall\(\{ itemTypeKey: active\.itemTypeKey/.test(act));
}
// The lab: +4 circumstance on Crafting (alchemy) — R6: crafting an alchemical item.
{
  const row = goodsConditionals([equip(G("Alchemy Lab"))])[0];
  const entry = normaliseConditional(row, { id: "lab", name: "Alchemy Lab" }, 0);
  const ctx = (actionKey, subject, itemType) => ({ checkType: "skill", subject, actionKey, traits: alchemicalCheckTraits(actionKey, itemType) });
  eq("C14 D3 the lab's +4 circumstance", [row?.value, row?.type], [4, "circumstance"]);
  ok("C14b offered on Crafting an elixir", matchesCheck(entry, ctx("create", "crafting", "elixirs")));
  ok("C14c and on Identify Alchemy", matchesCheck(entry, ctx("identifyAlchemy", "crafting")));
  ok("C14d not on a mundane Create", !matchesCheck(entry, ctx("create", "crafting", "mundane")));
  ok("C14e not on a herb made with Nature — it is Crafting (alchemy)", !matchesCheck(entry, ctx("create", "nature", "herbs")));
  ok("C14f nor from a lab in the pack", goodsConditionals([G("Alchemy Lab")]).length === 0);
  const act = code("module", "combat", "action-workflow.mjs");
  ok("C14g both the dialog and the roll are told what is being made",
    (act.match(/traits: alchemicalCheckTraits\(action\.key, createItemTypeKey\)/g) ?? []).length === 2);
}

/* ================================================================== */
/* D — ELIXIRS AND HERBS (D7, D8, R7)                                  */
/* ================================================================== */

const use = (name, level = null, opts = {}) => scaledAlchemicalEffect(level ? atLevel(A(name), level) : A(name), opts);
eq("D1 Health: 'you regain 1d6+2'", use("Health").effects[0].formula, "1d6+2");
eq("D1b '+1d6+2 for every additional 2 levels'", [2, 3, 5, 7].map((l) => use("Health", l).effects[0].formula),
  ["1d6+2", "2d6+4", "3d6+6", "4d6+8"]);
{
  const ap = use("Anti-Plague");
  const g = ap.effects[0].grants[0];
  eq("D2 Anti-Plague: +2 item to Fortitude against disease", [g.value, g.bonusType, g.when], [2, "item", { checkTypes: ["save"], subjects: ["fortitude"], traits: ["disease"] }]);
  ok("D2b applied without asking — the affliction save names its trait", g.auto === true
    && /traits: item\.system\?\.traits \?\? ""/.test(code("module", "combat", "affliction-workflow.mjs")));
  eq("D2c for 24 hours", ap.duration, "24 hours");
  eq("D2d '+1 for every additional 4 levels'", [1, 4, 5, 9, 13].map((l) => use("Anti-Plague", l).effects[0].grants[0].value), [2, 2, 3, 4, 5]);
  eq("D2e and a new save offered now", ap.resave, "disease");
  eq("D3 Antitoxin: the same, against poison", [use("Antitoxin").effects[0].grants[0].when.traits, use("Antitoxin").resave], [["poison"], "poison"]);
}
eq("D4 Blood-Block: bleed -1, +1 per 3 levels", [2, 4, 5, 8].map((l) => use("Blood-Block", l).effects[0].amount), [1, 1, 2, 3]);
ok("D4b bleeding is relievable, and the row normalises", Boolean(RELIEVABLE.bleeding)
  && normaliseConditionRelief(use("Blood-Block").effects[0])?.condition === "bleeding");
eq("D5 Leaping Juice: +2 status to jumps, +1 per level", [1, 2, 4].map((l) => use("Leaping Juice", l).effects[0].grants[0].value), [2, 3, 5]);
eq("D5b the jump actions, as the Jump spell names them", use("Leaping Juice").effects[0].grants[0].when, { actions: ["highJump", "longJump"] });
eq("D6 Soothe Syrup: advantage for an hour, +1 hour per 2 levels, max 5", [1, 3, 5, 9, 15].map((l) => use("Soothe Syrup", l).duration),
  ["1 hour", "2 hours", "3 hours", "5 hours", "5 hours"]);
eq("D7 Speed: +5 ft status for a minute", [use("Speed").effects[0].slot, use("Speed").effects[0].value, use("Speed").duration], ["speed", 5, "1 minute"]);
{
  const plans = speedPlans(2);
  ok("D7b the crafter's choices: +5 ft per 4 levels (max +20); 10 minutes for 1 level, an hour for 4",
    plans.some((p) => p.level === 3 && p.bonus === 5 && p.duration === "10 minutes")
    && plans.some((p) => p.level === 6 && p.bonus === 10 && p.duration === "1 minute")
    && plans.some((p) => p.level === 6 && p.bonus === 5 && p.duration === "1 hour")
    && plans.some((p) => p.level === 18 && p.bonus === 20 && p.duration === "1 hour")
    && !plans.some((p) => p.bonus > 20));
  const chosen = { ...atLevel(A("Speed"), 6), flags: { "trg-prime": { ...A("Speed").flags["trg-prime"], alchemical: { ...A("Speed").flags["trg-prime"].alchemical, plan: { bonus: 5, duration: "1 hour" } } } } };
  eq("D7c the crafter's own choice is kept", [scaledAlchemicalEffect(chosen).effects[0].value, scaledAlchemicalEffect(chosen).duration], [5, "1 hour"]);
  eq("D7d a level typed on the sheet buys the biggest bonus first", [speedPlanFor(atLevel(A("Speed"), 10)).bonus, speedPlanFor(atLevel(A("Speed"), 10)).duration], [15, "1 minute"]);
  eq("D7e and the elixir drunk at that level gives it", [use("Speed", 10).effects[0].value, use("Speed", 10).duration], [15, "1 minute"]);
}
eq("D8 Fist of Rock: a marker for an hour", [use("Fist of Rock").effects[0].marker, use("Fist of Rock").duration], ["fistOfRock", "1 hour"]);
eq("D8b 'your fists deal 1d6 base bludgeoning damage and lose the nonlethal trait'",
  stoneFistProfile({ natural: true, category: "Unarmed", damageType: "subdual" }, true), { damage: "1d6", damageType: "bludgeoning" });
ok("D8c a bite is not a fist; nor is anything without the marker",
  stoneFistProfile({ natural: true, category: "Unarmed", damageType: "piercing" }, true) === null
  && stoneFistProfile({ natural: true, category: "Unarmed", damageType: "subdual" }, false) === null);
{
  const src = code("module", "combat", "attack-workflow.mjs");
  ok("D8d the Strike reads the marker", /const stoneFist = stoneFistProfile\(weapon\?\.system, Boolean\(findMarker\(actor, "fistOfRock"\)\)\);/.test(src));
  ok("D8e and the damage roll uses the 1d6", /damageOverride: stoneFist\?\.damage \?\? extraBaseDiceOverride\(weaponData\.damage, extraBaseDice\),/.test(src)
    && /buildWeaponDamageFormula\(damageOverride \?\? weaponData\.damage,/.test(src));
  ok("D8f the standalone Damage button too", /damageOverride: standaloneFist\?\.damage \?\? null,/.test(src));
}
{
  const raw = use("Angelstep", null, { mode: "raw" });
  const pig = use("Angelstep", null, { mode: "pigment" });
  eq("D9 Angelstep raw: +4 item waits for the Resuscitation check", [raw.pending?.value, raw.pending?.type, raw.effects.length], [4, "item", 0]);
  eq("D9b pigment: 2d4 hours, a marker", [pig.rollDuration, pig.effects[0].marker], [{ formula: "2d4", unit: "hours" }, "angelstep"]);
  eq("D9c '+4-item bonus on its next check to recover'", ANGELSTEP_DYING_BONUS, 4);
  const combat = code("module", "documents", "combat.mjs");
  ok("D9d the Dying Check spends it", /const angelstep = await consumeAngelstep\(actor, "angelstep"\);/.test(combat)
    && /angelstep \? \[\{ label: "Angelstep", value: ANGELSTEP_DYING_BONUS, type: "item" \}\]/.test(combat));
}
{
  const f = use("Firqueline").effects;
  eq("D10 Firqueline: 3d6+6, bleed -5, an injury -1", f.map((r) => [r.kind, r.formula ?? r.condition, r.amount ?? null]),
    [["heal", "3d6+6", null], ["conditionRelief", "bleeding", 5], ["conditionRelief", "injured", 1]]);
}
eq("D11 Smelling Salts: 'dozens of uses' — 24", A("Smelling Salts").system.uses, { value: 24, max: 24 });
ok("D11b they wake", use("Smelling Salts").wake === true);
eq("D11c a woken dying creature is spared the Unconscious Dying includes",
  [...resolveConditions(["dying"], { withhold: withheldIncludes({ [CONSCIOUS_WHILE_DYING_FLAG]: "E1" }, "E1") }).effective].includes("unconscious"), false);
ok("D11d but still Dying", resolveConditions(["dying"], { withhold: ["unconscious"] }).effective.has("dying"));
ok("D11e the next Dying is a new effect the salts did not touch", withheldIncludes({ [CONSCIOUS_WHILE_DYING_FLAG]: "E1" }, "E2").length === 0);
ok("D11f an Unconscious applied directly is not withheld", resolveConditions(["dying", "unconscious"], { withhold: ["unconscious"] }).effective.has("unconscious"));
eq("D12 Bloody Mandrake: +1 item waits for the Spellcraft check", [use("Bloody Mandrake").pending?.value, use("Bloody Mandrake").pending?.type], [1, "item"]);
eq("D13 Dream Lichen: a marker the night spends", use("Dream Lichen").effects[0].marker, "dreamLichen");
ok("D13b the night doubles the Soul Drain healed", /soulDrainRecovery\(soulDrainRecovery\(soulDrainBefore\)\)/.test(code("module", "rest", "rest-workflow.mjs"))
  && /dreamLichen = await consumeMarker\(actor, "dreamLichen"\);/.test(code("module", "rest", "rest-workflow.mjs")));
ok("D14 Bone Reed and Black Amaranth stay text", !A("Bone Reed").flags["trg-prime"].consumable.effect && !A("Black Amaranth").flags["trg-prime"].consumable.effect);
eq("D15 three markers, all read", ["fistOfRock", "angelstep", "dreamLichen"].map((k) => [k, MARKERS[k]?.reader]),
  [["fistOfRock", "module/combat/attack-workflow.mjs"], ["angelstep", "module/documents/combat.mjs"], ["dreamLichen", "module/rest/rest-workflow.mjs"]]);
ok("D15b Fist of Rock lasts its hour — found, not spent", MARKERS.fistOfRock.consumed === false);

// D8 — the AP, and who drinks it.
eq("D16 the printed activation is the time", ["Interact (1 AP)", "Interact, Manipulate (3 AP)", "Interact (1 minute)", "Command (Free)", ""].map(activationCastTime),
  ["1 AP", "3 AP", "1 minute", "Free", null]);
eq("D16b in combat: its AP", activationCost("Interact (2 AP)", { inCombat: true }).ap, 2);
ok("D16c a minute cannot fit in an encounter", activationCost("Interact (1 minute)", { inCombat: true }).allowed === false
  && activationCost("Interact (1 minute)").allowed === true);
eq("D17 no target: you drink it", recipientMode({ targetCount: 0 }).mode, "self");
eq("D17b one creature within reach: you feed it", recipientMode({ targetCount: 1, distance: 5 }).mode, "fed");
eq("D17c beyond reach: refused", recipientMode({ targetCount: 1, distance: 15 }).mode, "refuse");
eq("D17d two targets: refused", recipientMode({ targetCount: 2 }).mode, "refuse");
eq("D17e fed rows aim at the target", use("Health", null, { fed: true }).effects[0].target, "targets");
ok("D18 every alchemical item but a bomb takes the alchemical path",
  /if \(isAlchemicalConsumable\(item\) && !isBomb\(item\)\) return useAlchemical\(actor, item\);/.test(code("module", "consumable-use-workflow.mjs"))
  && isAlchemicalConsumable(A("Health")));
{
  const src = code("module", "consumable-use-workflow.mjs");
  // 3.578.0: the targets are also the creatures around, for Nightsage.
  ok("D18b it resolves through the spell engine's own applier — not castSpell", /await applySpellEffects\(actor, spell, \{ targets: fed \? \[recipient\] : \(around \?\? \[\]\), lines \}\);/.test(src));
  // 3.617.0: the alchemical path's own spend — potions now pay theirs too.
  ok("D18c and charges the activation", /const \{ spendActionPoints \} = await import\("\.\/combat\/action-points-workflow\.mjs"\);\s*await spendActionPoints\(actor, cost\.ap, item\.name\);/.test(src));
  ok("D18d a bonus that waits is recorded", /await addPendingModifier\(actor, \{ \.\.\.scaled\.pending, oneShot: true \}\);/.test(src));
  // 3.578.0: a new save, not the end of an interval — no stage damage.
  ok("D18e the new save is rolled against the recipient's affliction", /await rollAfflictionStageSave\(recipient, affliction, \{ withDamage: false \}\);/.test(src));
}
eq("D19 the craft dialog says the effect in numbers", alchemicalLevelSummary(A("Health"), 5), "heals 3d6+6");

/* ================================================================== */
/* E — MOUNTS (D9, R8)                                                 */
/* ================================================================== */

ok("E1 D9 Stay in Saddle's Failure unseats you", fallsFromSaddle("stayInSaddle", "failure") && fallsFromSaddle("stayInSaddle", "fumble"));
ok("E1b a success does not", !fallsFromSaddle("stayInSaddle", "success"));
ok("E2 Guide with Knees' Fumble unseats you; its Failure does not", fallsFromSaddle("guideWithKnees", "fumble") && !fallsFromSaddle("guideWithKnees", "failure"));
ok("E2b and nothing else does", !fallsFromSaddle("climb", "fumble"));
ok("E3 the workflow clears Mounted when it happens", /if \(fallsFromSaddle\(action\.key, degree\) && mountedState\(actor\)\.mounted\) \{\s*await actor\.unsetFlag\(SYSTEM_ID, MOUNTED_FLAG\);/.test(code("module", "combat", "action-workflow.mjs")));
const horse = { actorType: "npc", creatureType: "animal", intelligence: -4, military: false };
ok("E4 R8 an animal-intelligence steed panics", steedPanics(horse));
ok("E4b a military mount does not", !steedPanics({ ...horse, military: true }));
ok("E4c nor an animal companion", !steedPanics({ ...horse, actorType: "companion" }));
ok("E4d nor a non-animal mount", !steedPanics({ ...horse, creatureType: "magical beast" }));
ok("E4e nor a clever animal", !steedPanics({ ...horse, intelligence: -3 }));
eq("E5 'fleeing and frightened 4'", STEED_PANIC, { frightened: 4, fleeing: true });
ok("E6 a successful Command an Animal calms it", calmsSteed("commandAnAnimal", "success", true) && calmsSteed("commandAnAnimal", "critical", true));
ok("E6b a failure does not; nor does a steed this rule did not frighten",
  !calmsSteed("commandAnAnimal", "failure", true) && !calmsSteed("commandAnAnimal", "success", false));
eq("E7 Mount / Dismount remembers the steed", mountedAfterSuccess({ mounted: false }, "Bess", { actorUuid: "Actor.x" }), { mount: "Bess", steed: { actorUuid: "Actor.x" } });
eq("E7b and reads it back", mountedState({ flags: { "trg-prime": { mounted: { mount: "Bess", steed: { actorUuid: "Actor.x" } } } } }).steed, { actorUuid: "Actor.x" });
{
  const combat = code("module", "documents", "combat.mjs");
  const i = combat.indexOf("await TRGCombat.#spookSteeds(combatants);");
  ok("E8 steeds are asked when a combat begins, before its first turn", i > 0 && i < combat.indexOf("const result = await super.startCombat();"));
  ok("E8b and marked so they can be calmed", /await steed\.setFlag\(SYSTEM_ID, STEED_PANIC_FLAG, true\);/.test(combat));
  ok("E9 an animal NPC's sheet can be ticked as a military mount", /name="flags\.trg-prime\.militaryMount"/.test(read("templates", "actor", "actor-sheet.hbs")));
}

/* ================================================================== */
/* F — TRAVELLERS CLOTHING (R9)                                        */
/* ================================================================== */

{
  const trav = equip(G("Travellers"), { runes: "Potency I, Saving I" });
  const chain = { name: "Chain", type: "armour", system: { equipped: true, category: "Medium" } };
  const helm = { name: "Metal Helmet", type: "armour", system: { equipped: true, category: "Other" } };
  eq("F1 'can be upgraded like armour'", runeKindOf(trav), "armour");
  ok("F1b ordinary clothing cannot", runeKindOf(G("Common")) === null);
  ok("F2 its runes count while it is worn", runesCountFor(trav, [trav]));
  ok("F2b but not under body armour", !runesCountFor(trav, [trav, chain]));
  ok("F2c a helmet is not body armour", runesCountFor(trav, [trav, helm]) && !isBodyArmour(helm) && isBodyArmour(chain));
  ok("F3 the Saving rune reaches the saves", runeBonusesForActor([trav]).bonuses.length === 3 && runeBonusesForActor([trav, chain]).bonuses.length === 0);
  ok("F4 the gear schema has a runes field", JSON.parse(read("template.json")).Item.gear.runes === "");
  ok("F5 the item sheet carries its Runes panel", /if \(context\.isGear && isRunedClothing\(this\.item\)\) this\._runeContext\(context\);/.test(code("module", "sheets", "item-sheet.mjs")));
  ok("F6 potency reaches DB through the same test", /if \(!runesCountFor\(item, Array\.from\(actor\.items \?\? \[\]\)\)\) continue;/.test(code("module", "documents", "actor.mjs")));
  ok("F7 every rune module asks runeKindOf", ["rune-effects.mjs", "rune-events.mjs", "rune-actions.mjs", "rune-transfer.mjs"]
    .every((f) => /runeKindOf\(item\)/.test(code("module", f))) && /const kind = runeKindOf\(this\);/.test(code("module", "documents", "item.mjs")));
}

/* ================================================================== */
/* G — VEHICLES (R11)                                                  */
/* ================================================================== */

// Name, level, DC modifier, DB, Fort, Hardness, HP, weakness, pilot skill — the stat blocks, pages 176-177.
const PRINTED_VEHICLES = Object.freeze([
  ["Canoe", 1, -2, 10, 6, 4, 10, "", ["athletics"]],
  ["Cart", 1, 0, 10, 6, 4, 10, "", ["handleAnimal"]],
  ["Carriage", 4, -2, 14, 8, 5, 30, "", ["handleAnimal"]],
  ["Chariot, Light", 2, 2, 10, 6, 5, 20, "", ["handleAnimal"]],
  ["Galley", 13, 0, 24, 20, 15, 120, "fire", []],
  ["Rowboat", 1, 0, 10, 6, 5, 12, "", ["athletics"]],
  ["Sailing Ship", 12, 0, 22, 18, 15, 100, "fire", []],
  ["Schooner", 9, 0, 20, 14, 10, 80, "fire", []],
  ["Sleigh", 2, 0, 12, 8, 5, 12, "", ["handleAnimal"]],
  ["Wagon", 2, 0, 10, 8, 5, 12, "", ["handleAnimal"]]
]);
const LIVE_DB_OTHER = Object.freeze({
  Canoe: 0, Cart: 1, Carriage: 3, "Chariot, Light": 0, Galley: 10,
  Rowboat: 0, "Sailing Ship": 7, Schooner: 7, Sleigh: 2, Wagon: 0
});
{
  const source = JSON.parse(read("tools", "vehicles.json")).vehicles;
  const pack = byName(await packDocs("vehicles", "!actors!"));
  const diffs = [];
  for (const [name, level, dcMod, db, fort, hardness, hp, weakness, checks] of PRINTED_VEHICLES) {
    const v = source.find((row) => row.name === name);
    if (!v) { diffs.push(`${name}: not in vehicles.json`); continue; }
    const got = [v.level, v.dcMod, v.db, v.fort, v.hardness, v.hp, v.weakness, v.check];
    const want = [level, dcMod, db, fort, hardness, hp, weakness, checks];
    if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${name}: ${JSON.stringify(got)} vs printed ${JSON.stringify(want)}`);
    const doc = pack.get(name);
    if (!doc) { diffs.push(`${name}: not in the pack`); continue; }
    if (JSON.stringify(doc) !== JSON.stringify(vehicleDocument(v))) diffs.push(`${name}: the pack is not what build-vehicles writes`);
    // THE DB SLOT, AS MEASURED LIVE. On 20 September 2026 each of these was
    // built as an NPC in the Foundry 14.367 world, before release, and its
    // derived DB read back: with these `other` values all ten came to the
    // printed figure (the Galley first came to 32 — the Codex's NPC
    // scaling, now subtracted by the builder). Pinned, so a change to the
    // derivation or the builder that moves a vehicle off its stat block
    // fails here rather than on somebody's table.
    const s = doc.system;
    const size = SIZE_TABLE[v.size];
    if (s.combat.defence.other !== LIVE_DB_OTHER[name]) diffs.push(`${name}: DB other ${s.combat.defence.other}, measured ${LIVE_DB_OTHER[name]}`);
    if (s.resources.hp.other + size.baseHP !== hp) diffs.push(`${name}: HP derives to ${s.resources.hp.other + size.baseHP}`);
    if (s.combat.saves.fortitude.other !== fort) diffs.push(`${name}: Fort other ${s.combat.saves.fortitude.other}`);
    if (s.combat.naturalArmourFlat.natural !== hardness) diffs.push(`${name}: hardness ${s.combat.naturalArmourFlat.natural}`);
    if (doc.flags["trg-prime"].vehicle.pilotDC !== levelDC(level) + dcMod) diffs.push(`${name}: pilot DC ${doc.flags["trg-prime"].vehicle.pilotDC}`);
  }
  eq("G1 ten vehicles", PRINTED_VEHICLES.length, 10);
  ok("G2 the source, the pack and the builder agree with the printed stat blocks", diffs.length === 0, diffs.join("; "));
  eq("G3 every vehicle is an NPC actor, immune to critical hits and precision damage", Array.from(pack.values()).map((d) => [d.type, d.system.combat.immunities])
    .filter(([t, i]) => t !== "npc" || i !== "critical hits, precision damage"), []);
  eq("G4 the pilot DC: level DC and the printed Easy / Hard", ["Canoe", "Chariot, Light", "Galley"].map((n) => vehiclePilotDC(source.find((v) => v.name === n))),
    [levelDC(1) - 2, levelDC(2) + 2, levelDC(13)]);
  const galley = pack.get("Galley");
  eq("G5 the ships' check 'varies': the pilot chooses", vehiclePilotView(vehicleOf(galley)).choose, true);
  eq("G5b the canoe's is Athletics", vehiclePilotView(vehicleOf(pack.get("Canoe")), { athletics: "Athletics" }).skillText, "Athletics");
  const sys = JSON.parse(read("system.json"));
  ok("G6 the pack is declared as Actors, in the Core Rulebook folder",
    sys.packs.some((p) => p.name === "vehicles" && p.type === "Actor" && p.path === "packs/vehicles")
    && sys.packFolders[0].packs.includes("vehicles"));
  ok("G7 a vehicle's sheet has a Pilot button", /data-action="pilotVehicle"/.test(read("templates", "actor", "actor-sheet.hbs"))
    && /pilotVehicle: TRGActorSheet\.pilotVehicle,/.test(code("module", "sheets", "actor-sheet.mjs")));
  ok("G8 the pilot rolls against the vehicle's DC", /dc: view\.dc,/.test(code("module", "vehicles-workflow.mjs")));
}

/* ================================================================== */
/* H — THE 3.577.1 PATCH: R5, and what the 3.577.0 live test found     */
/* ================================================================== */

// R5 (Graham, 20 September 2026): "If you have the Alchemical Crafting
// feat you may use either the Crafting or Nature skills to make Herbs. If
// you do not have this feat, you may still create Herbs as a Very Hard
// (DC +5) check. Yes failing by 10 or more should ruin the herb."
{
  const AC = ["Alchemical Crafting"];
  const gate = (skillKey, featNames) => craftingFeatGate({ itemTypeKey: "herbs", requiredFeat: FEAT, featNames, skillKey });
  eq("H1 R5 herbs are made with Crafting or Nature", ITEM_TYPES.herbs.skills, ["crafting", "nature"]);
  eq("H1b with the feat, either skill, at the normal DC", [gate("crafting", AC), gate("nature", AC)],
    [{ allowed: true, reason: "", selfDeclared: false }, { allowed: true, reason: "", selfDeclared: false }]);
  eq("H1c without it, Nature is allowed at DC +5", [gate("nature", []).allowed, gate("nature", []).dcModifier], [true, 5]);
  eq("H1d 'Very Hard' is +5", FEATLESS_HERB_DC, 5);
  ok("H1e without it, Crafting is not — the feat is what adds Crafting", gate("crafting", []).allowed === false
    && /Nature \(DC \+5\)/.test(gate("crafting", []).reason));
  eq("H1f the +5 is the herb's alone, and ends with the feat",
    [featlessHerbDC({ itemTypeKey: "herbs", featNames: [] }), featlessHerbDC({ itemTypeKey: "herbs", featNames: AC }),
      featlessHerbDC({ itemTypeKey: "elixirs", featNames: [] })], [5, 0, 0]);
  eq("H1g the dialog says so before Begin, and does not block",
    createTypeGateView(gate("nature", []), { checked: true, shortfall: null }),
    { blocked: false, showTick: false, showToolsTick: false, notice: "Without Alchemical Crafting this is a Very Hard check (DC +5)." });
  ok("H1h an elixir still needs the feat through Nature", craftingFeatGate({ itemTypeKey: "elixirs", requiredFeat: FEAT, featNames: [], skillKey: "nature" }).allowed === false);
  ok("H1i the label is not 'needs Alchemical Crafting' for a Nature herb", /Nature at DC \+5/.test(ITEM_TYPES.herbs.featLabel ?? ""));

  eq("H2 'failing by 10 or more should ruin the herb' — a Fumble ruins it", [fumbleRuinsAtOnce("herbs"), fumbleRuinsAtOnce("elixirs"), fumbleRuinsAtOnce("mundane")],
    [true, false, false]);
  eq("H2b a Blunder is a Fumble here too", createPerDay("blunder", 3, 1, -20).outcome, "fumble");
  const wf = code("module", "create-crafting-workflow.mjs");
  const act = code("module", "combat", "action-workflow.mjs");
  ok("H2c the herb fails on the day, with no doom clock", /if \(outcome === "fumble" && fumbleRuinsAtOnce\(project\.itemTypeKey\)\) \{[\s\S]{0,200}project\.status = "failed";\s*project\.ruined = true;/.test(wf));
  ok("H2d and the card says it is ruined", /project\.status === "failed" && project\.ruined/.test(act) && /p\.status === "failed" && p\.ruined/.test(wf));
  ok("H3 the gate is told the skill", /craftingFeatGate\(\{ itemTypeKey: t\.key, requiredFeat: t\.feat, featNames, skillKey \}\)/.test(wf));
  ok("H3b the +5 is added to the check's DC, on day one and every day after",
    /finalDC \+= createHerbDC;/.test(act)
    && (act.match(/createHerbDC = featlessHerbDC\(\{/g) ?? []).length === 2);
  ok("H3c the project card names it", /Very Hard without Alchemical Crafting \(DC \+\$\{p\.featlessHerbDC\}\)/.test(wf));
}

// F1: an alchemist with no Crafting specialty was refused Create through
// Crafting before the dialog opened.
{
  const crafting = Object.entries(ITEM_TYPES).filter(([, c]) => c.skills.includes("crafting")).map(([key, c]) => ({ key, ...c }));
  eq("H4 F1 Alchemical Crafting opens Crafting's five alchemical types", featGovernedCreateTypes(crafting, ["Alchemical Crafting"]),
    ["elixirs", "oils", "poisons", "vials", "herbs"]);
  eq("H4b and nothing without it — a mundane item keeps its specialty", featGovernedCreateTypes(crafting, ["Toughness"]), []);
  const magic = Object.entries(ITEM_TYPES).filter(([, c]) => c.skills.includes("arcana")).map(([key, c]) => ({ key, ...c }));
  eq("H4c an alternation is never read as a feat that opens a type", featGovernedCreateTypes(magic, ["Brew Potion"]), []);
  const act = code("module", "combat", "action-workflow.mjs");
  ok("H4d the specialty gate asks the feat before refusing Create",
    /const featTypes = action\.key === "create"\s*\? featGovernedCreateTypes\(itemTypesForSkill\(specialtySkill\)/.test(act)
    && /if \(!featTypes\.length\) \{\s*ui\.notifications\.warn\(/.test(act));
  ok("H4e and the dialog then offers only those types",
    /\.filter\(\(t\) => !Array\.isArray\(onlyTypes\) \|\| onlyTypes\.includes\(t\.key\)\)/.test(code("module", "create-crafting-workflow.mjs")));
}

// F2: Set DC with an empty box resolved the check against DC 0.
eq("H5 F2 an empty Set DC box is not DC 0", [parseEnteredDC(""), parseEnteredDC("   "), parseEnteredDC(null), parseEnteredDC("abc")],
  [null, null, null, null]);
eq("H5b a typed number is read, 0 included", [parseEnteredDC("15"), parseEnteredDC(" 20 "), parseEnteredDC("0")], [15, 20, 0]);
ok("H5c the card uses it", /const parsed = parseEnteredDC\(dcValue\);\s*if \(parsed === null\)/.test(code("module", "dice", "check-card-interactions.mjs")));

// F3: "Tester is Fist of Rock (1 hour)."
eq("H6 F3 a marker named for a thing says its own sentence",
  ["fistOfRock", "angelstep", "dreamLichen"].map((k) => markerAppliedLine("Mira", k, "")),
  ["Mira <strong>has fists of living rock</strong>.", "Mira <strong>is marked with Angelstep pigment</strong>.",
    "Mira <strong>has Dream Lichen in their system</strong>."]);
eq("H6b a state still reads as one", markerAppliedLine("Mira", "stabilised", " (1 minute)"), "Mira is <strong>Stabilised</strong> (1 minute).");
ok("H6c the card uses it", /line\(markerAppliedLine\(target\.name, effect\.marker, durationText\)\)/.test(code("module", "magic", "spell-effects.mjs")));

/* ================================================================== */
/* I — THE 3.577.2 PATCH: vehicle sheets, and F4                        */
/* ================================================================== */

// Graham, after 3.577.1: "Hide yes" — the creature numbers a vehicle's
// NPC derivation computes and its stat block does not print.
eq("I1 a vehicle is the pack's flag or the printed trait",
  [isVehicleActor({ flags: { "trg-prime": { vehicle: { pilotDC: 27 } } } }),
    isVehicleActor({ system: { details: { traits: "Object, Vehicle" } } }),
    isVehicleActor({ system: { details: { traits: "Vehicle" } } }),
    isVehicleActor({ system: { details: { traits: "Vehicles expert, Beast" } } }),
    isVehicleActor({ system: { details: { traits: "Animal" } } })],
  [true, true, true, false, false]);
ok("I1b the sheet is told", /context\.isVehicle = isVehicleActor\(this\.actor\);/.test(code("module", "sheets", "actor-sheet.mjs")));
{
  // WHERE EACH PIECE OF THE TEMPLATE SITS: inside an {{#unless isVehicle}}
  // or not. Walked as blocks, not matched as text, so a wrapper that
  // closes one line too early is caught.
  const hbs = read("templates", "actor", "actor-sheet.hbs").replace(/\{\{!--[\s\S]*?--\}\}/g, "");
  const insideHidden = (needle) => {
    const out = [];
    const stack = [];
    const re = /\{\{#(\w+)([^}]*)\}\}|\{\{\/(\w+)\}\}|\{\{else\b[^}]*\}\}/g;
    let last = 0;
    let m;
    const scan = (text) => {
      let i = text.indexOf(needle);
      while (i !== -1) {
        out.push(stack.some((b) => b.kind === "unless" && /^\s*isVehicle\s*$/.test(b.arg) && !b.inElse));
        i = text.indexOf(needle, i + needle.length);
      }
    };
    while ((m = re.exec(hbs))) {
      scan(hbs.slice(last, m.index));
      last = re.lastIndex;
      if (m[1]) stack.push({ kind: m[1], arg: m[2] });
      else if (m[3]) stack.pop();
      else if (stack.length) stack[stack.length - 1].inElse = true;
    }
    scan(hbs.slice(last));
    return out;
  };
  const hidden = {
    "Initiative (both)": 'data-action="rollInitiative"',
    "Melee Attack (both)": "{{system.combat.attack.total}}",
    "Ranged Attack": "{{system.combat.attack.ranged}}",
    "Critical Resistance": "{{system.combat.criticalResistance}}",
    "Reflex (both)": 'data-save="reflex"',
    "Will (both)": 'data-save="will"',
    "the attribute medallions": 'class="attribute-medallions"',
    "the point pool": 'class="ability-point-banner"',
    "the attribute table": 'class="attribute-table ornate-table"',
    "BAB": "{{system.combat.bab.total}}",
    "Reach": 'name="system.combat.reach"'
  };
  const wrong = [];
  for (const [label, needle] of Object.entries(hidden)) {
    const where = insideHidden(needle);
    if (!where.length || where.some((w) => !w)) wrong.push(`${label}: ${JSON.stringify(where)}`);
  }
  ok("I2 Initiative, the attack bonuses, Critical Resistance, Reflex, Will, the attributes, BAB and Reach are hidden on a vehicle",
    wrong.length === 0, wrong.join("; "));
  const kept = {
    "Defence Bonus": "{{system.combat.defence.total}}",
    "Damage Reduction": "{{totalDR}}",
    "Fortitude": 'data-save="fortitude"',
    "the Pilot button": 'data-action="pilotVehicle"',
    "HP Other": 'name="system.resources.hp.other"'
  };
  const lost = [];
  for (const [label, needle] of Object.entries(kept)) {
    const where = insideHidden(needle);
    if (!where.length || where.some(Boolean)) lost.push(`${label}: ${JSON.stringify(where)}`);
  }
  ok("I2b the printed block stays: DB, DR, Fortitude, the Pilot button and the HP formula", lost.length === 0, lost.join("; "));
  ok("I2c and the card that keeps the HP formula is titled for it", /\{\{#if isVehicle\}\}<i class="fa-solid fa-heart"><\/i> Hit Points\{\{else\}\}/.test(hbs));
}

// F4: "Fumble: ... After 1d6 days you realise the project has failed" printed
// above "Failed by 10 or more — the herb is ruined".
eq("I3 F4 a herb's Fumble or Blunder is ruined on the day; nothing else is",
  [ruinedOnTheDay("herbs", "fumble"), ruinedOnTheDay("herbs", "blunder"), ruinedOnTheDay("herbs", "failure"),
    ruinedOnTheDay("elixirs", "fumble"), ruinedOnTheDay("mundane", "blunder")],
  [true, true, false, false, false]);
{
  const act = code("module", "combat", "action-workflow.mjs");
  ok("I3b the card leaves out the table's Fumble row for it",
    /if \(!\(action\.key === "create" && ruinedOnTheDay\(createTypeKey, degree\)\)\) \{\s*lines\.push\(/.test(act)
    && /const createTypeKey = action\?\.key === "create"\s*\? String\(\(createReroll \? activeCreateProject\(actor\)\?\.itemTypeKey : createSetup\?\.itemTypeKey\) \?\? ""\)/.test(act));
  ok("I3c and its own line carries the degree", /project\.status === "failed" && project\.ruined\) \{\s*lines\.push\(line\(`<strong>\$\{degree\.charAt\(0\)/.test(act));
}

/* ================================================================== */

if (failures) {
  console.error(`verify-chapter6-gear-171-180: FAILED — ${failures} of ${checks}`);
  process.exit(1);
}
console.log(`verify-chapter6-gear-171-180: OK — ${checks} checks. Pages 171-180: the kits, the elixirs, the steeds, the vehicles.`);
