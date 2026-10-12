#!/usr/bin/env node
/**
 * verify-spell-rune — a potency rune lent to an item, and taken back.
 *
 * NEW at 3.523.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FIVE SPELLS PROMISED A RUNE AND NONE OF THEM DELIVERED ONE.
 *
 * Magic Weapon, Shillelagh, Magic Vestment, Magic Jaws and Eldritch
 * Weapon all print "gains the benefits of a Potency I rune" or its
 * wording, and all five shipped with `effects: []`. Each also carries a
 * step warp with `mods: {}` — inert twice over, since it stepped a rune
 * that was never applied.
 *
 * FOUR ARE BUILT AT THIS RELEASE. Eldritch Weapon is deliberately not:
 * its base rule CREATES a weapon out of nothing ("you create a
 * one-handed simple melee weapon of pure magic"), and a rune warp on an
 * item that does not exist yet is the conjuring mechanism's problem
 * rather than this one's. Section X pins that it stayed inert on purpose,
 * so a later release finds a statement rather than an oversight.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION F IS THE ONE THAT MATTERS, and it is three rules that all come
 * from `bladeAllyRuneField` rather than from anything invented here:
 * a better rune is never made worse, a worse one is raised, and the
 * restore is a WRITE-BACK rather than a subtraction.
 *
 * SECTION P COMPARES TWO AUTHORED SOURCES. Every step warp prints its own
 * ceiling — "(max IV)" — and the fix authored that ceiling into a mod.
 * A mod saying 4 under a sentence saying III is a mis-authoring that
 * neither one can reveal alone, so the printed cap is parsed HERE (an
 * authoring cross-check, not a game rule, which is why it lives in the
 * check and not in the module) and compared.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SPELL_POTENCY_BASE, spellPotencyTier, potencyStepMaxTimes, spellRuneField,
  spellRuneOutcome, spellRuneLine, eligibleRuneItems, runeLoanChangesItem,
  restoredRuneField, loanBelongsTo, itemPotencyCeiling, runeKindOf,
  landedTier, stepsLost, ceilingLine
} from "../module/magic/spell-rune.mjs";
import { emptyWarp, aggregateWarpSelection, warpMaxTimes } from "../module/magic/spell-warp.mjs";
import { parseRunes, isPotency } from "../module/runes.mjs";
import { RELAY_ACTIONS, shouldHandleAsGM, needsRelay, buildRelayRequest, handleRelayMessage }
  from "../module/combat/target-relay.mjs";

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

/* THE PRINTED CEILING, parsed for section P only. See the header. */
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
function printedCap(text) {
  const m = /\(\s*max\s+([ivx]+|\d+)\s*\)/i.exec(String(text ?? ""));
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const value = ROMAN[raw] ?? Math.trunc(Number(raw) || 0);
  return value > 0 ? value : null;
}

/* ================================================================== *
 * T. THE TIER THIS CAST GRANTS
 * ================================================================== */

equal("T1 UNWARPED IS TIER I", spellPotencyTier({}, 4), 1,
  "every one of the four grants Potency I on its own");
equal("T2 EACH STEP IS ONE TIER", spellPotencyTier({ potencyStep: 2 }, 4), 3);
equal("T3 THE CEILING IS A CEILING",
  spellPotencyTier({ potencyStep: 9 }, 4), 4,
  "a mod arriving from a macro must be clamped, not trusted");
equal("T4 AND A max III SPELL STOPS AT III",
  spellPotencyTier({ potencyStep: 9 }, 3), 3);
equal("T5 a negative step buys nothing", spellPotencyTier({ potencyStep: -3 }, 4), 1);
equal("T6 SPELL_POTENCY_BASE IS WHAT THE SPELLS PRINT", SPELL_POTENCY_BASE, 1);

/* ── how many purchases are offered ───────────────────────────────── */

equal("T7 A max IV WARP IS BOUGHT THREE TIMES", potencyStepMaxTimes(4), 3,
  "the spell already grants I, so IV is three steps up and not four");
equal("T8 AND A max III WARP TWICE", potencyStepMaxTimes(3), 2);
equal("T9 a ceiling the spell already grants is bought never",
  potencyStepMaxTimes(1), 0);
equal("T9b and neither is a missing one", potencyStepMaxTimes(null), 0);

ok("T10 THE OFFER AND THE CLAMP AGREE",
  [3, 4, 5, 6].every((cap) =>
    spellPotencyTier({ potencyStep: potencyStepMaxTimes(cap) }, cap) === cap),
  "buying every purchase offered must land exactly on the ceiling — if these "
  + "two ever disagree a player pays for a step that does nothing");

/* ================================================================== *
 * Q. THE ITEM HAS THE LAST WORD
 * ================================================================== */

/*
 * GRAHAM'S RULING, 8 September 2026, after live testing 3.523.0.
 *
 * A warped Magic Weapon wrote `Potency III` onto a standard Battle Axe.
 * `parseRunes` read tier 3 correctly and `computeRuneModifiers` then gave
 * the player Potency I, reporting "standard-quality weapon takes a Potency
 * I at most" and marking the weapon's configuration invalid. Eight PP on
 * top of the base four bought nothing, silently.
 *
 * PUT TO HIM AS A RULES QUESTION, because his 18 Aug 2026 Blade Ally
 * ruling had said the OTHER two restrictions are about etching and do not
 * bind a loaned rune. The answer was that this one is different:
 *
 *   "Yes — the item can't hold it."
 *
 * A ceiling is a fact about the weapon rather than about how the rune got
 * there. So the tier is clamped at cast time, and — because the item is
 * chosen AFTER the warp is bought, so the chooser cannot refuse the
 * purchase — the shortfall is named on the card.
 */

equal("Q1 A STANDARD WEAPON TAKES POTENCY I", itemPotencyCeiling("weapon", "standard"), 1);
equal("Q2 AN EXPERT ONE TAKES II", itemPotencyCeiling("weapon", "expert"), 2);
equal("Q3 A MASTER ONE TAKES IV", itemPotencyCeiling("weapon", "master"), 4,
  "which is the only quality that can hold Magic Weapon's full printed warp");
equal("Q4 ARMOUR STARTS HIGHER", itemPotencyCeiling("armour", "standard"), 2);
equal("Q4b AND SO DOES A SHIELD", itemPotencyCeiling("shield", "standard"), 2);
equal("Q5 an unknown quality still has a ceiling",
  itemPotencyCeiling("weapon", "nonsense") >= 1, true,
  "runeRestrictions falls back to its normal row; never zero, which would grant nothing");

equal("Q6 THE CEILING CLAMPS THE BOUGHT TIER", landedTier(3, 1), 1);
equal("Q6b AND LEAVES A TIER IT CAN HOLD ALONE", landedTier(3, 4), 3);
equal("Q7 WHAT WAS LOST IS COUNTED", stepsLost(3, 1), 2);
equal("Q7b and nothing is lost when it fits", stepsLost(3, 4), 0);
equal("Q8 the unwarped cast lands everywhere", landedTier(1, 1), 1,
  "tier I is at or under every ceiling in the table, so the BASE spell is "
  + "unaffected by this ruling on every item in the game");

equal("Q9 a ceiling of zero is not a ceiling", landedTier(3, 0), 3,
  "a falsy cap means none is known; clamping to it would silently grant nothing");

ok("Q10 THE SHORTFALL IS NAMED, WITH THE QUALITY AND THE NUMBER",
  /standard quality/.test(ceilingLine("Battle Axe", "standard", 3, 1))
  && /Potency I at most/.test(ceilingLine("Battle Axe", "standard", 3, 1))
  && /2 steps/.test(ceilingLine("Battle Axe", "standard", 3, 1)),
  "the player spent PP on those steps — \"nothing happened\" is what 3.523.0 said");
equal("Q10b ONE LOST STEP READS AS ONE",
  /one step/.test(ceilingLine("Battle Axe", "expert", 3, 2)), true);
equal("Q11 AND NOTHING IS SAID WHEN NOTHING WAS LOST",
  ceilingLine("Greatsword", "master", 3, 4), null,
  "a line only when there is one to add");

equal("Q12 THE KIND IS READ OFF THE ITEM TYPE",
  [runeKindOf({ type: "weapon" }), runeKindOf({ type: "armour" }), runeKindOf({ type: "shield" })].join(),
  "weapon,armour,shield");

ok("Q13 A CLAMPED CAST STILL WRITES A FIELD THE RUNE CHAPTER AGREES WITH",
  ["standard", "expert", "master"].every((q) => {
    const cap = itemPotencyCeiling("weapon", q);
    const landed = landedTier(4, cap);
    const field = spellRuneField("", landed);
    const held = parseRunes(field).find((r) => isPotency(r.key))?.tier ?? 0;
    return held === landed && held <= cap;
  }),
  "the whole point of the ruling: what is written is what is received, so the "
  + "item is never left reporting an invalid configuration");

/* ================================================================== *
 * N. WHO IS ALLOWED TO WRITE IT
 * ================================================================== */

/*
 * FOUND LIVE, 8 September 2026, testing as PC Tester rather than as the
 * GM — the first player-side pass this channel had.
 *
 * Magic Weapon says the weapon may be "wielded by you or a willing ally".
 * A player casting it on an ally's Broadsword got, in the console alone:
 *
 *   "User PC Tester lacks permission to update Item […] in parent Actor"
 *
 * The throw aborted the effects loop. The Cast card posted, 8 PP left the
 * sheet, and NO result card appeared — the player was charged and told
 * nothing. A GM cannot see this defect, because a GM can write anywhere;
 * every pass before this one was a GM pass.
 *
 * SO THE WRITE GOES THROUGH THE RELAY the system already owns, and the
 * restore is guarded so exactly one client performs it.
 */

equal("N1 THE RUNE WRITE HAS A RELAY ACTION OF ITS OWN",
  RELAY_ACTIONS.SPELL_RUNE, "target.spellRune",
  "reusing ITEM_HP would have meant one action writing two different fields");
ok("N2 AND IT IS DISTINCT FROM EVERY OTHER",
  new Set(Object.values(RELAY_ACTIONS)).size === Object.values(RELAY_ACTIONS).length);

ok("N3 A CLIENT THAT DOES NOT OWN THE TARGET RELAYS",
  needsRelay({ isOwner: false }) === true);
ok("N4 AND ONE THAT DOES WRITES DIRECTLY",
  needsRelay({ isOwner: true }) === false,
  "bouncing a message off yourself makes a GM's own casts depend on a healthy socket");

/* ── the handler writes what it was asked to, and only there ─────── */

const relayCalls = [];
const fakeDeps = {
  fromUuid: async () => ({ id: "ally", name: "Toben",
    items: { get: (id) => (id === "sword" ? { id: "sword", name: "Broadsword" } : null) } }),
  itemOf: (target, id) => target.items.get(id),
  // RECORDS A NULL ITEM RATHER THAN THROWING ON ONE, so that "the
  // handler refused" can be told apart from "the handler blew up".
  // The first draft read `item.id` here, and `mutate-spell-rune` N8
  // survived: deleting the guard made the write throw, the relay
  // reported not-ok for a different reason, and the check could not
  // see the difference.
  updateItem: async (item, data) => { relayCalls.push({ item: item?.id ?? null, data }); },
  reply: () => {}
};
const request = buildRelayRequest({
  action: RELAY_ACTIONS.SPELL_RUNE, uuid: "Actor.ally", userId: "u1", requestId: "r1",
  payload: { itemId: "sword", update: { "system.runes": "Potency I" } }
});
const reply = await handleRelayMessage(request,
  { user: { isGM: true, id: "gm" }, activeGM: { id: "gm" }, deps: fakeDeps });

ok("N5 THE GM CARRIES THE WRITE OUT", reply?.handled === true && reply.outcome?.ok === true,
  `got ${JSON.stringify(reply)}`);
equal("N6 ON THE ITEM THAT WAS NAMED", relayCalls[0]?.item, "sword");
equal("N7 WITH THE FIELDS THAT WERE SENT",
  JSON.stringify(relayCalls[0]?.data), JSON.stringify({ "system.runes": "Potency I" }));

const missing = await handleRelayMessage(buildRelayRequest({
  action: RELAY_ACTIONS.SPELL_RUNE, uuid: "Actor.ally", userId: "u1", requestId: "r2",
  payload: { itemId: "not-there", update: { "system.runes": "Potency I" } }
}), { user: { isGM: true, id: "gm" }, activeGM: { id: "gm" }, deps: fakeDeps });
ok("N8 AND AN ITEM THAT IS NOT ON THAT TARGET IS REFUSED",
  missing?.outcome?.ok === false && /not found on that target/.test(String(missing.outcome.reason)),
  `refused for the right reason, not by crashing — got ${JSON.stringify(missing?.outcome)}`);
equal("N8b AND NOTHING WAS WRITTEN", relayCalls.length, 1,
  "still just the one write from N5 — a refusal that reaches updateItem has "
  + "already touched an item the request had no business naming");

/* ── exactly one client restores ─────────────────────────────────── */

ok("N9 THE DESIGNATED GM RESTORES",
  shouldHandleAsGM({ isGM: true, id: "gm1" }, { id: "gm1" }) === true);
ok("N10 AND A SECOND GM DOES NOT",
  shouldHandleAsGM({ isGM: true, id: "gm2" }, { id: "gm1" }) === false,
  "two GMs connected would otherwise both write the field back");
ok("N11 NOR DOES A PLAYER WHILE A GM IS DESIGNATED",
  shouldHandleAsGM({ isGM: false, id: "p1" }, { id: "gm1" }) === false);
ok("N12 BUT SOMEBODY ACTS WHEN NO GM IS DESIGNATED",
  shouldHandleAsGM({ isGM: true, id: "gm1" }, null) === true,
  "a rune that silently never comes back is worse than one written back twice");

/* ================================================================== *
 * F. THE FIELD — bladeAllyRuneField's three rules
 * ================================================================== */

equal("F1 A BARE ITEM GAINS THE RUNE", spellRuneField("", 1), "Potency I");
equal("F2 AND KEEPS THE RUNES IT HAD",
  spellRuneField("Flaming I, Keen", 2), "Flaming I, Keen, Potency II",
  "the existing field is preserved verbatim — Blade Ally's rule, and the "
  + "reason is Courageous reading its value off the weapon's own potency");
equal("F3 A BETTER RUNE IS NOT MADE WORSE",
  spellRuneField("Potency III", 1), "Potency III",
  "parseRunes would take the higher anyway, so appending changes no answer "
  + "while making the stored field a lie");
equal("F4 A WORSE RUNE IS RAISED",
  spellRuneField("Potency I", 3), "Potency I, Potency III",
  "this is where a spell differs from Blade Ally: potency is a ladder");
equal("F5 AN EQUAL RUNE IS LEFT ALONE", spellRuneField("Potency II", 2), "Potency II");
equal("F6 tier zero writes nothing", spellRuneField("Keen", 0), "Keen");

ok("F7 AND THE RAISED FIELD READS AS THE HIGHER TIER",
  (parseRunes("Potency I, Potency III").find((r) => isPotency(r.key))?.tier) === 3,
  "F4 appends rather than replacing, which is only correct because "
  + "parseRunes takes the highest of two entries naming one rune");

/* ── what happened, named ─────────────────────────────────────────── */

equal("F8 a bare item is 'granted'", spellRuneOutcome("", 1).outcome, "granted");
equal("F9 a worse one is 'raised'", spellRuneOutcome("Potency I", 3).outcome, "raised");
equal("F10 a better one is 'redundant'", spellRuneOutcome("Potency III", 1).outcome, "redundant");
equal("F10b and an equal one too", spellRuneOutcome("Potency II", 2).outcome, "redundant");

ok("F11 THE OUTCOME AND THE FIELD CANNOT DISAGREE",
  ["", "Keen", "Potency I", "Potency II", "Potency IV", "Flaming I, Potency I"]
    .every((field) => [1, 2, 3, 4].every((tier) => {
      const changed = spellRuneField(field, tier) !== String(field ?? "").trim();
      return changed === (spellRuneOutcome(field, tier).outcome !== "redundant");
    })),
  "the card says one thing and the item does another the moment these part");

ok("F12 AND runeLoanChangesItem IS THE SAME ANSWER AGAIN",
  ["", "Keen", "Potency III"].every((field) => [1, 3].every((tier) =>
    runeLoanChangesItem(field, tier) === (spellRuneOutcome(field, tier).outcome !== "redundant"))),
  "the workflow records a loan only when this is true, so a disagreement "
  + "here writes a previousRunes that a later expiry will hand back");

/* ================================================================== *
 * R. THE RESTORE
 * ================================================================== */

equal("R1 THE FIELD COMES BACK VERBATIM",
  restoredRuneField("Flaming I, Keen"), "Flaming I, Keen",
  "a write-back, never a subtraction — subtracting would strip a rune the "
  + "player etched WHILE the spell was running");
equal("R1b including an empty one", restoredRuneField(""), "");
equal("R1c and a missing one", restoredRuneField(null), "");

ok("R2 A ROUND TRIP LEAVES THE ITEM EXACTLY AS IT WAS",
  ["", "Keen", "Potency I", "Flaming I, Potency II"].every((before) =>
    restoredRuneField(before) === before),
  "the whole promise of a temporary rune");

/* ── whose loan is it ─────────────────────────────────────────────── */

ok("R3 A LOAN IS RESTORED BY ITS OWN CAST",
  loanBelongsTo({ castId: "abc", previousRunes: "" }, "abc"));
ok("R4 AND NOT BY A LATER ONE",
  !loanBelongsTo({ castId: "def", previousRunes: "Potency I" }, "abc"),
  "cast Magic Weapon twice on one sword and the second store captured a "
  + "field holding the first spell's rune; the first expiring must not write "
  + "that back, or the rune stays for good");
ok("R5 a missing loan belongs to nobody", !loanBelongsTo(null, "abc"));
ok("R5b and neither does a missing cast", !loanBelongsTo({ castId: "abc" }, null));

/* ================================================================== *
 * E. WHICH ITEMS ARE OFFERED
 * ================================================================== */

// TUSKS ARE NATURAL, as the Tusks feat creates them (`natural: true`);
// the fixture said only "brawling, unarmed" until 3.576.0, when "is it a
// natural attack" became a question the picker asks.
const ITEMS = [
  { id: "w1", name: "Longsword", type: "weapon", system: { category: "martial", traits: "", equipped: true } },
  { id: "w2", name: "Fist", type: "weapon", system: { category: "unarmed", traits: "" } },
  { id: "w3", name: "Tusks", type: "weapon", system: { category: "brawling", traits: "finesse, unarmed", natural: true } },
  { id: "a1", name: "Chain Shirt", type: "armour", system: {} },
  { id: "s1", name: "Buckler", type: "shield", system: {} },
  { id: "g1", name: "Rope", type: "gear", system: {} }
];
const names = (list) => list.map((i) => i.name).join(", ");

// 3.576.0: AND ONLY WEAPONS. Page 166: "natural attacks are not weapons
// and abilities and effects that work with weapons do not work with
// natural attacks." Until then this check asserted the defect — the Fist
// and the Tusks were offered to Magic Weapon.
equal("E1 A WEAPON SPELL OFFERS WEAPONS, AND NOT NATURAL ATTACKS",
  names(eligibleRuneItems(ITEMS, ["weapon"])), "Longsword");
equal("E2 MAGIC VESTMENT OFFERS ARMOUR AND SHIELDS",
  names(eligibleRuneItems(ITEMS, ["armour", "shield"])), "Chain Shirt, Buckler",
  "\"a suit of armour or a shield\"");
equal("E3 MAGIC JAWS OFFERS ONLY UNARMED ATTACKS",
  names(eligibleRuneItems(ITEMS, ["weapon"], true)), "Fist, Tusks",
  "by the two marks attack-workflow already reads: the category, and the trait");
equal("E4 AND NEVER ORDINARY GEAR",
  names(eligibleRuneItems(ITEMS, ["weapon", "armour", "shield"])),
  "Longsword, Chain Shirt, Buckler");
equal("E5 nothing eligible is an empty list, not an error",
  eligibleRuneItems([{ type: "gear", system: {} }], ["weapon"]).length, 0);
equal("E6 and neither is a missing list", eligibleRuneItems(null, ["weapon"]).length, 0);

// A GAUNTLET IS BOTH (3.576.0; Graham's R6): an unarmed attack AND a weapon.
const GAUNTLET = { id: "w4", name: "Gauntlet", type: "weapon", system: { category: "Simple", traits: "Agile, Free-Hand", unarmed: true, equipped: true } };
equal("E7 a gauntlet is offered to Magic Weapon", names(eligibleRuneItems([GAUNTLET], ["weapon"])), "Gauntlet");
equal("E7b and to Magic Jaws", names(eligibleRuneItems([GAUNTLET], ["weapon"], true)), "Gauntlet",
  "\"a strike with a gauntlet is otherwise considered an unarmed attack\"");

// SHILLELAGH: "1 club or staff you hold" (found in passing, block 16).
const CLUBS = [
  { id: "c1", name: "Club", type: "weapon", system: { category: "Simple", equipped: true } },
  { id: "c2", name: "Staff", type: "weapon", system: { category: "Simple", equipped: true } },
  { id: "c3", name: "Greatclub", type: "weapon", system: { category: "Martial", equipped: true } },
  { id: "c4", name: "Longsword", type: "weapon", system: { category: "Martial", equipped: true } },
  { id: "c5", name: "Club", type: "weapon", system: { category: "Simple", equipped: false } }
];
const SHILLELAGH_LIMITS = { names: ["Club", "Staff", "Quarterstaff"], heldOnly: true };
equal("E8 Shillelagh offers a club or staff you hold, and nothing else",
  eligibleRuneItems(CLUBS, ["weapon"], false, SHILLELAGH_LIMITS).map((i) => i.id).join(","), "c1,c2",
  "a greatclub is not a club, and the club in the pack is not held");
equal("E9 no names means any weapon",
  eligibleRuneItems(CLUBS, ["weapon"]).map((i) => i.id).join(","), "c1,c2,c3,c4,c5");

/* ================================================================== *
 * W. THE VOCABULARY AND THE CHOOSER
 * ================================================================== */

equal("W1 potencyStep IS DECLARED VOCABULARY", emptyWarp().mods.potencyStep, 0,
  "an undeclared mod key is offered, charged, and silently dropped");
equal("W1b AND SO IS potencyMax", emptyWarp().mods.potencyMax, 0);

const STEP_IV = [{ ppCost: 4, text: "increase the Potency of the rune by one step (max IV)",
  mods: { potencyStep: 1, potencyMax: 4 } }];
const STEP_III = [{ ppCost: 6, text: "increase the potency of the rune by one step (max III)",
  mods: { potencyStep: 1, potencyMax: 3 } }];

equal("W2 THE STEPS ACCUMULATE",
  aggregateWarpSelection(STEP_IV, { "warp-0": 3 }).mods.potencyStep, 3);
equal("W3 AND THE CEILING DOES NOT",
  aggregateWarpSelection(STEP_IV, { "warp-0": 3 }).mods.potencyMax, 4,
  "buying the step three times is three steps up ONE ladder");
equal("W4 THE CHOOSER OFFERS EXACTLY THE PURCHASES THAT EXIST",
  warpMaxTimes(STEP_IV[0]), 3);
equal("W4b and two on a max III warp", warpMaxTimes(STEP_III[0]), 2);
equal("W5 THREE PURCHASES REACH IV AND NOT V",
  spellPotencyTier(aggregateWarpSelection(STEP_IV, { "warp-0": 3 }).mods, 4), 4);
equal("W5b and the PP is charged for all three",
  aggregateWarpSelection(STEP_IV, { "warp-0": 3 }).ppSpent, 12);

/* ================================================================== *
 * L. THE CARD
 * ================================================================== */

ok("L1 A GRANT NAMES THE ITEM AND THE TIER",
  /Longsword/.test(spellRuneLine("Longsword", spellRuneOutcome("", 1)))
  && /Potency I</.test(spellRuneLine("Longsword", spellRuneOutcome("", 1))));
ok("L2 A RAISE SAYS WHERE FROM",
  /Potency I to/.test(spellRuneLine("Longsword", spellRuneOutcome("Potency I", 3))));
ok("L3 AND A REDUNDANT CAST SAYS WHY NOTHING HAPPENED",
  /already carries/.test(spellRuneLine("Longsword", spellRuneOutcome("Potency IV", 1))),
  "a player who paid 6 PP and saw no change to their sword is owed the reason");
ok("L4 an unnamed item still reads",
  spellRuneLine("", spellRuneOutcome("", 1)).includes("The item"));

/* ================================================================== *
 * THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) spells.push(v);
await db.close();
const spell = (n) => spells.find((s) => s.name === n);

{
  const row = (spell("Shillelagh")?.system?.effects ?? []).find((e) => e?.kind === "runeGrant");
  equal("E10 the pack's Shillelagh row declares the club or staff",
    JSON.stringify([row?.itemNames, row?.heldOnly]), JSON.stringify([["Club", "Staff", "Quarterstaff"], true]),
    "'1 club or staff you hold'");
}

/* ── P. THE FOUR THAT WERE BUILT ──────────────────────────────────── */

const BUILT = [
  ["Magic Weapon", 0, 4, ["weapon"], false],
  ["Shillelagh", 0, 3, ["weapon"], false],
  ["Magic Vestment", 0, 3, ["armour", "shield"], false],
  ["Magic Jaws", 2, 4, ["weapon"], true]
];

for (const [name, warpIndex, cap, kinds, unarmedOnly] of BUILT) {
  const s = spell(name);
  const row = (s?.system?.effects ?? [])[0];
  ok(`P1 ${name} GRANTS A RUNE AT ALL`, row?.kind === "runeGrant",
    `the base rule that was missing entirely; got ${JSON.stringify(row?.kind)}`);
  equal(`P2 ${name} grants tier I`, row?.tier, 1);
  equal(`P3 ${name} offers the right items`,
    JSON.stringify(row?.itemKinds), JSON.stringify(kinds));
  equal(`P4 ${name} unarmed restriction`, Boolean(row?.unarmedOnly), unarmedOnly,
    "Magic Jaws names \"one of the target's unarmed attacks\" and the other three do not");

  const warp = (s?.system?.warps ?? [])[warpIndex];
  equal(`P5 ${name} step warp is live`, warp?.mods?.potencyStep, 1);
  equal(`P6 ${name} carries its authored ceiling`, warp?.mods?.potencyMax, cap);
  equal(`P7 ${name} THE AUTHORED CEILING IS THE PRINTED ONE`,
    warp?.mods?.potencyMax, printedCap(warp?.text),
    "a mod saying IV under a sentence saying III is a mis-authoring neither "
    + "the mod nor the sentence can reveal alone");
  equal(`P8 ${name} offers ${cap - 1} purchases`, warpMaxTimes(warp), cap - 1);
}

/* ── X. THE ONE LEFT INERT, ON PURPOSE ────────────────────────────── */

const eldritch = spell("Eldritch Weapon");
/* HALF OF THIS PIN CAME TRUE AT 3.543.0, which is what it was for.
 *
 * It used to assert two things: the potency warp is inert AND the spell
 * has no effect rows. The second stopped being true when Eldritch Weapon
 * got its `conjuredWeapon` row — "its base rule CREATES a weapon out of
 * nothing" is now a rule rather than a sentence, and the weapon exists
 * for a rune to sit on.
 *
 * THE POTENCY WARPS ARE STILL INERT, and still deliberately. They chain:
 * "+2 PP: infused with a potency I rune" then "+3 PP: the potency
 * increases by one step". Building the second alone would sell a step on
 * a rune nothing granted, and whether the third option presupposes the
 * second is a ruling nobody has given. */
ok("X1 ELDRITCH WEAPON HAS ITS WEAPON NOW, AND ITS RUNE WARPS ARE STILL INERT",
  Object.keys(eldritch?.system?.warps?.[1]?.mods ?? {}).length === 0
  && Object.keys(eldritch?.system?.warps?.[2]?.mods ?? {}).length === 0
  && (eldritch?.system?.effects ?? []).some((e) => e?.kind === "conjuredWeapon"),
  "the base is built and the rune pair is not — pinned so a later release reads a "
  + "decision rather than an oversight");

/* ── S. NOTHING ELSE GAINED A RUNE ────────────────────────────────── */

const granting = spells.filter((s) =>
  (s.system?.effects ?? []).some((e) => e?.kind === "runeGrant"));
equal("S1 EXACTLY FOUR SPELLS GRANT A RUNE", granting.length, 4,
  `got ${granting.map((s) => s.name).join(", ")}`);

const stepping = [];
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) if (w?.mods?.potencyStep) stepping.push(s.name);
}
equal("S2 AND EXACTLY FOUR CARRY THE STEP WARP", stepping.length, 4);
ok("S3 THEY ARE THE SAME FOUR",
  JSON.stringify(granting.map((s) => s.name).sort()) === JSON.stringify(stepping.sort()),
  "a spell that grants a rune with no way to step it, or steps one it never "
  + "grants, is half-wired either way");

ok("S4 EVERY STEP WARP DECLARES A CEILING",
  spells.every((s) => (s.system?.warps ?? []).every((w) =>
    !w?.mods?.potencyStep || Number(w.mods.potencyMax) > SPELL_POTENCY_BASE)),
  "without one, warpMaxTimes offers zero purchases and the warp is inert again");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-spell-rune: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-spell-rune: OK — ${checks} checks. `
  + "Four spells lend a Potency rune and take it back.\n");
