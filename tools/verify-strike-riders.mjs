#!/usr/bin/env node
/**
 * verify-strike-riders — the spell riders that hang secondary damage on
 * a Strike, and the wiring that makes them REACHED.
 *
 * NEW at 3.437.0, for Arrow Of The Wild Hunt, Talon Strike and Spoil
 * The Profane.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE 3.435.0 LESSON IS THE ONE THIS FILE IS BUILT AROUND.
 *
 * Luminance shipped with 42 green checks and 14 mutations caught, and
 * healed nobody: `emanationIsLive` returned false, so no emanation was
 * ever recorded and the whole mechanism iterated an empty list. *"Every
 * check asked whether the wiring existed; none asked whether it was
 * reached."*
 *
 * A rider can fail in exactly that way. `normaliseStrikeRider` can be
 * perfect, `riderPacketsFor` can return the right packets, and the
 * spells still deal nothing if `resolveWeaponDamage`'s loop never asks
 * for them. So section E does not ask whether the functions exist — it
 * asks whether the CALL is inside the body of the function that rolls
 * damage, and in the right order relative to the spend.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `bodyOf` IS A BRACE WALK, NOT A SLICE TO END-OF-FILE.
 *
 * The import-position trap has now been met SEVEN times, twice inside
 * checks written knowing about it (F7 and H7 in the 3.436.0 report). The
 * shape is always the same: a claim about one function is really a claim
 * about the whole file, so the name in an import line, or a copy of the
 * same guard in a neighbouring function, answers for the thing that was
 * deleted.
 *
 * Two defences here, both load-bearing:
 *
 *   1. `bodyOf` counts braces and returns ONLY that function's body, so
 *      an import at the top of the file is never in scope for a claim
 *      about a function near the bottom. A1 proves it stops early.
 *   2. Every ordering claim is anchored on a CALL — `strikeRiderPackets(`
 *      with its open paren — never on the bare name, which appears in
 *      the import too. A2 proves the anchor is not satisfied by an
 *      import line.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  STRIKE_RIDER_FLAG, normaliseStrikeRider, riderPacketsFor, ridersSpentBy, riderCastLine,
  weaponRiderRequirement
} from "../module/magic/strike-riders.mjs";
import { runeDamageFor, runeDamageLine } from "../module/rune-damage.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const attack = read("module", "combat", "attack-workflow.mjs");
const applier = read("module", "magic", "spell-effects.mjs");
const flow = read("module", "magic", "strike-riders-workflow.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");

const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * ONE function's body, by counting braces from its signature.
 *
 * Returns "" when the signature is not found, which every claim below
 * treats as a failure rather than as a vacuous pass — a renamed
 * function must break this file loudly, not quietly stop checking.
 */
function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  // WALK THE PARAMETER LIST FIRST, and this is not a nicety. The first
  // version took the next `{` after the signature and got
  // `resolveWeaponDamage`'s DESTRUCTURED OPTIONS OBJECT — a body eight
  // lines long that contained none of the calls being asked about. All
  // eight reachability claims failed, which is the good direction to
  // fail in; had the calls happened to be inside, they would all have
  // passed while checking nothing. A `case "x": {` signature has no
  // parameter list, so the walk is skipped when the signature does not
  // end in an open paren.
  let cursor = start + signature.length - 1;
  if (src[cursor] === "(") {
    let parens = 0;
    for (; cursor < src.length; cursor += 1) {
      if (src[cursor] === "(") parens += 1;
      else if (src[cursor] === ")") {
        parens -= 1;
        if (parens === 0) break;
      }
    }
  }
  const open = src.indexOf("{", cursor);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return "";
}

/** Does `a` appear before `b` in this body, comments removed? */
function before(body, a, b) {
  const clean = strip(body);
  const i = clean.indexOf(a);
  const j = clean.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

const has = (body, needle) => strip(body).includes(needle);

const RESOLVE = "async function resolveWeaponDamage(";
const ROLL_ATTACK = "export async function rollWeaponAttack(";

/* ================================================================== *
 * A. THE READER ITSELF, BEFORE IT IS BELIEVED
 * ================================================================== */

const resolveBody = bodyOf(attack, RESOLVE);
const attackBody = bodyOf(attack, ROLL_ATTACK);

ok("A0 both function bodies were found",
  resolveBody.length > 0 && attackBody.length > 0,
  "a renamed function must fail here, not silently stop being checked");

// A BODY IS NOT THE REST OF THE FILE. `resolveWeaponDamage` is followed
// by `rollWeaponDamage`; if the walk ran past its closing brace, the two
// bodies would overlap and every claim about one would be answerable by
// the other.
ok("A1 the brace walk stops at the function's own closing brace",
  !resolveBody.includes("export async function rollWeaponDamage("),
  "bodyOf ran past the end and is really reading the rest of the file");

// BEFORE REPORTING ANYTHING AS MISSING, PROVE THE READER CAN SEE A
// THING KNOWN TO BE THERE. `runeDamageFor` has been called from inside
// this function since long before riders existed; a body that cannot
// see it is not this function's body.
ok("A1b the body reaches the function's real code",
  resolveBody.includes("runeDamageFor(weapon, { target") && attackBody.includes("resolveWeaponDamage(actor, weapon, {"),
  "the parameter-list walk: the first version stopped at the destructured options object");

// AND THE IMPORT IS OUT OF SCOPE. This is the trap itself: the name
// `strikeRiderPackets` appears in an import at the top of the file, so a
// whole-file search for it is satisfied by a call that has been deleted.
ok("A2 the import line is not inside either body",
  !resolveBody.includes('from "../magic/strike-riders-workflow.mjs"')
  && !attackBody.includes('from "../magic/strike-riders-workflow.mjs"'),
  "the import-position trap, met seven times before this file was written");

/* ================================================================== *
 * B. WHAT A WELL-FORMED RIDER IS, AND WHAT IS REFUSED
 * ================================================================== */

const arrow = normaliseStrikeRider({
  kind: "strikeRider", label: "Arrow Of The Wild Hunt",
  dice: "1d6", damageType: "force", scope: "ranged", once: true
});
ok("B1 a plain rider normalises", Boolean(arrow) && arrow.dice === "1d6" && arrow.damageType === "force");
ok("B2 rubbish is not an object", normaliseStrikeRider(null) === null && normaliseStrikeRider("1d6") === null);
ok("B3 a formula the roller was never given is refused",
  normaliseStrikeRider({ dice: "1d6+1", damageType: "force" }) === null,
  "'1d6+1' either throws at strike time or rolls something nobody checked");
ok("B4 a missing die is refused", normaliseStrikeRider({ damageType: "force" }) === null);
// THE RUNE TRAP: an empty type means "the weapon's own" over in
// rune-damage.mjs, so a spell must never acquire that meaning by
// forgetting to say anything.
ok("B5 an empty damage type is refused, not defaulted",
  normaliseStrikeRider({ dice: "1d6", damageType: "" }) === null
  && normaliseStrikeRider({ dice: "1d6" }) === null,
  "an empty rune type means the weapon's own damage — a spell must not inherit that silently");
ok("B6 an unknown scope is refused",
  normaliseStrikeRider({ dice: "1d6", damageType: "force", scope: "thrown" }) === null);
ok("B7 no scope means any", normaliseStrikeRider({ dice: "1d6", damageType: "force" })?.scope === "any");
// A CONDITIONAL RIDER PRINTS "extra damage against ___", and an empty
// blank names nothing the table can act on.
ok("B8 a conditional rider with nothing to be conditional on is refused",
  normaliseStrikeRider({ dice: "1d6", damageType: "aligned", conditional: true }) === null);
ok("B9 and is accepted once it says what against",
  Boolean(normaliseStrikeRider({ dice: "1d6", damageType: "aligned", conditional: true, against: "undead" })));
ok("B10 once defaults true and false is honoured",
  normaliseStrikeRider({ dice: "1d6", damageType: "force" })?.once === true
  && normaliseStrikeRider({ dice: "1d6", damageType: "force", once: false })?.once === false);
ok("B11 a condition value only exists where a condition is named",
  normaliseStrikeRider({ dice: "1d6", damageType: "force", conditionValue: 3 })?.conditionValue === 0
  && normaliseStrikeRider({ dice: "1d6", damageType: "force", condition: "weakened" })?.conditionValue === 1);

// THE ROUND TRIP — the defect live play found in held-bonus.mjs on 26
// August, where a spec survived being written to the flag and died being
// read back, and four spells applied cleanly then offered no button.
// This mechanism stores the normalised spec on the effect flag and
// normalises it again on every Strike, so it fails the same way.
const spoilRow = {
  kind: "strikeRider", label: "Spoil The Profane", dice: "1d6", damageType: "aligned",
  conditional: true, against: "a target with an opposing aura",
  condition: "weakened", conditionValue: 1
};
const once = normaliseStrikeRider(spoilRow);
const twice = normaliseStrikeRider(once);
ok("B12 normalising a normalised spec returns the same spec",
  JSON.stringify(once) === JSON.stringify(twice),
  "the flag round trip: held-bonus.mjs shipped this defect and lost four spells to it");

/* ================================================================== *
 * C. WHAT A RIDER REACHES
 * ================================================================== */

const melee = { attackMode: "melee", weaponId: "sword1" };
const missile = { attackMode: "missile", weaponId: "bow1" };
const anyRider = normaliseStrikeRider({ dice: "1d6", damageType: "aligned", scope: "any" });
const meleeRider = normaliseStrikeRider({ dice: "1d6", damageType: "force", scope: "melee" });

ok("C1 a ranged rider reaches a missile weapon", riderPacketsFor([arrow], missile).length === 1);
ok("C2 and not a melee one", riderPacketsFor([arrow], melee).length === 0,
  "Arrow Of The Wild Hunt says 'make a ranged weapon Strike'");
ok("C3 a melee rider reaches melee only",
  riderPacketsFor([meleeRider], melee).length === 1 && riderPacketsFor([meleeRider], missile).length === 0);
ok("C4 an unscoped rider reaches both",
  riderPacketsFor([anyRider], melee).length === 1 && riderPacketsFor([anyRider], missile).length === 1);

const talon = normaliseStrikeRider({
  label: "Talon Strike", dice: "1d6", damageType: "slashing",
  once: false, weaponScoped: true, weaponId: "sword1"
});
ok("C5 a weapon-scoped rider reaches its weapon", riderPacketsFor([talon], melee).length === 1);
ok("C6 and no other", riderPacketsFor([talon], { attackMode: "melee", weaponId: "axe2" }).length === 0,
  "Talon Strike says 'the target weapon'");
// THE FAILURE THAT MATTERS MOST HERE: a rider that WANTED a weapon and
// never got one must arm nothing. Armed by default it would add 1d6 to
// every Strike the character makes for a minute.
const unbound = normaliseStrikeRider({
  label: "Talon Strike", dice: "1d6", damageType: "slashing", once: false, weaponScoped: true
});
ok("C7 a weapon-scoped rider with no weapon reaches nothing",
  riderPacketsFor([unbound], melee).length === 0 && riderPacketsFor([unbound], missile).length === 0,
  "left armed it would enchant the whole armoury for a minute");
// AND NOT BY ACCIDENT OF STRING COMPARISON. The mutation runner found
// this hole: with the empty-id guard removed, C7 above still passed,
// because "" never equals "sword1". The case it did not cover is a
// weapon that itself has no id — `weaponIdentity` yields "" for one —
// where "" === "" and an unbound rider would match every such Strike.
// So the guard is asked for directly rather than inferred from a
// comparison that happens to fail.
ok("C7b and not even a weapon that has no id of its own",
  riderPacketsFor([unbound], { attackMode: "melee" }).length === 0,
  "empty matching empty is how an unbound rider arms everything");

/* ================================================================== *
 * D. THE PACKET IS THE RUNE LOOP'S OWN SHAPE
 * ================================================================== *
 *
 * The whole design rests on this: a rider is consumed by the loop that
 * already rolls rune damage. If the two shapes drift, the loop reads
 * `undefined` off a rider and prints "undefined damage" — or worse,
 * skips a branch silently. So the shape is compared against a REAL rune
 * entry produced by `runeDamageFor`, not against a list typed here.
 */

// SWITCHED ON (3.618.0, R9): an energy rune that is off produces no entry.
const runeEntry = runeDamageFor({ type: "weapon", system: { runes: "flaming" }, flags: { "trg-prime": { runeState: { flamingActive: true } } } })[0];
ok("D0 a real rune entry was produced to compare against", Boolean(runeEntry),
  "without one, every shape claim below would pass vacuously");

const packet = riderPacketsFor([arrow], missile)[0];
ok("D1 a rider packet carries every field a rune packet carries",
  Boolean(runeEntry) && Object.keys(runeEntry).every((k) => k in packet),
  Boolean(runeEntry) ? `missing: ${Object.keys(runeEntry).filter((k) => !(k in packet)).join(", ")}` : "");
ok("D2 the die and type are the spell's", packet.dice === "1d6" && packet.type === "force");
// THE CRITICAL BELONGS TO THE WEAPON. damage.mjs is explicit, and the
// rune chapter grants a secondary critical only where a tier prints a
// modifier. No spell in this batch prints one.
ok("D3 a rider grants no secondary critical", packet.secondaryCritical === null);
ok("D4 and no wielder feedback", packet.feedbackOf === null,
  "Vicious costs its wielder because Vicious says so");
ok("D5 an unconditional rider is not marked conditional", packet.conditional === false);

const spoilPacket = riderPacketsFor([once], melee)[0];
ok("D6 a conditional rider is marked conditional", spoilPacket.conditional === true);
// The line the card actually prints, rendered by the SAME function the
// rune loop calls — so a rider that renders as "undefined" fails here
// rather than in play.
const spoilLine = runeDamageLine(spoilPacket, 0);
ok("D7 a conditional rider's line names what it is against",
  spoilLine.includes("opposing aura") && !/undefined/.test(spoilLine));
ok("D8 and tells the table to apply it",
  /Apply if it applies/.test(spoilLine));
const arrowLine = runeDamageLine(packet, 4);
ok("D9 an applied rider's line reports what was rolled",
  arrowLine.includes("4") && arrowLine.includes("force") && !/undefined/.test(arrowLine));

/* ================================================================== *
 * E. SPENDING
 * ================================================================== */

ok("E1 a once rider that applied is spent", ridersSpentBy([arrow], missile).length === 1);
ok("E2 a once rider that did not apply is not spent", ridersSpentBy([arrow], melee).length === 0,
  "a rider not used by this Strike must survive it");
ok("E3 a duration rider is never spent by a Strike", ridersSpentBy([talon], melee).length === 0,
  "Talon Strike runs for a minute, not for one blow");

/* ================================================================== *
 * F. IS IT REACHED? — the 3.435.0 question
 * ================================================================== */

ok("F1 the damage loop asks for rider packets",
  has(resolveBody, "strikeRiderPackets(actor, weapon, riderCtx)"),
  "anchored on the CALL, not the name: the name is also in the import");
// THE LOOP GREW A THIRD SOURCE AT 3.465.0 — area riders, which hang on
// the ground the target stands on rather than on the attacker. What this
// check is FOR is that there is one loop, not which sources feed it, so
// it now asserts the two it owns are in the same `for` as the runes and
// leaves the list open. Pinning the exact spelling is what broke this
// check the moment a third legitimate source arrived.
ok("F2 and iterates them in the same loop as the runes",
  /for \(const rune of \[[^\]]*strikeRunes\.filter\(\(r\) => !r\.addsToStrike\)[^\]]*strikeRiderPackets\(actor, weapon, riderCtx\)[^\]]*\]\)/s
    .test(strip(resolveBody)),
  "a second loop would be a second place deciding how secondary damage meets a defence");
ok("F3 rider conditions are applied on a hit",
  has(resolveBody, "applyRiderConditions(actor, weapon, targetActor, riderCtx)"));
ok("F4 once-riders are spent in the damage path",
  has(resolveBody, "spendStrikeRiders(actor, weapon, { ctx: riderCtx })"));
// READ FIRST, SPEND SECOND. Reversed, the packets are gone before the
// loop asks for them and all three spells deal nothing — green checks,
// dead spells, which is exactly 3.435.0.
ok("F5 the packets are collected before the spend",
  before(resolveBody, "strikeRiderPackets(actor, weapon, riderCtx)", "spendStrikeRiders(actor, weapon, { ctx: riderCtx })"),
  "spending first deletes the effect the loop is about to read");
ok("F6 and the condition lands before the spend too",
  before(resolveBody, "applyRiderConditions(actor, weapon, targetActor, riderCtx)", "spendStrikeRiders(actor, weapon, { ctx: riderCtx })"));
// THE MISS PATH. The ruling is that a once-rider is spent when the
// Strike RESOLVES, so the attack function must spend too — and it must
// do so outside the `if (outcome.hits)` block, or a miss costs nothing.
ok("F7 the attack path spends riders as well",
  has(attackBody, "spendStrikeRiders(actor, weapon, { hit: false })"),
  "a once-rider is spent on a miss too; without this a player misses all day on one PP");
ok("F8 and it does so after the damage step",
  before(attackBody, "resolveWeaponDamage(actor, weapon, {", "spendStrikeRiders(actor, weapon, { hit: false })"),
  "spending before the damage step would delete the rider the damage is about to roll");

/* ================================================================== *
 * G. THE APPLIER
 * ================================================================== */

const riderCase = bodyOf(applier, 'case "strikeRider": {');
ok("G0 the applier has a strikeRider case", riderCase.length > 0);
ok("G1 a malformed rider is refused out loud, not applied",
  has(riderCase, "if (!spec) {") && has(riderCase, "malformed strike rider"),
  "the anti-silence rule: a spell that grants nothing must say so");
ok("G2 warping reaches the die through the shared adder",
  has(riderCase, "addDice(effect.dice, warpDice)"),
  "a second copy of that arithmetic is a second place deciding one question");
// SCOPED TO THIS CASE'S BODY. `promptRiderWeapon` is also named in the
// dynamic import two lines above the call, so the claim is anchored on
// the call with its argument list.
ok("G3 a weapon-scoped rider asks which weapon",
  has(riderCase, "await promptRiderWeapon(target, spell.name)"));
ok("G4 and refuses itself when no weapon was chosen",
  has(riderCase, "if (!spec.weaponId) {") && has(riderCase, "nothing applied"),
  "3.411.1's position: a refusal nobody reads is worse than a missing line");
// RELAYED SINCE 3.474.0. The effect is still created on the target; it
// is asked of the GM when the target is not ours, after a live session
// found a player casting on another player's character refused by
// Foundry. The check asserts the CREATION, not one route to it.
ok("G5 the effect is created on the target",
  has(riderCase, 'createEffectsOn(target, [riderData])'));
ok("G6 and the flag it carries is the one the strike path reads",
  has(riderCase, "[STRIKE_RIDER_FLAG]: spec") && STRIKE_RIDER_FLAG === "strikeRider");

/* ================================================================== *
 * H. THE WORKFLOW HALF
 * ================================================================== */

const spendBody = bodyOf(flow, "export async function spendStrikeRiders(");
ok("H0 the spend function was found", spendBody.length > 0);
ok("H1 a disabled effect carries nothing",
  has(bodyOf(flow, "function strikeRidersOn("), "if (effect.disabled) continue;"),
  "a GM who switched an effect off expects it to stop happening");
ok("H2 the spend deletes the effect", has(spendBody, "await effect.delete()"));
ok("H3 and a failure to delete is logged rather than swallowed",
  has(spendBody, "console.warn"));
// A DELETE THAT THREW STILL COUNTS AS SPENT — the held-bonus position,
// and for the same reason: the Strike has already had the benefit.
ok("H4 the line is printed outside the try, so a failed delete still reports",
  before(spendBody, "await effect.delete()", "lines.push("));

/* ================================================================== *
 * I. THE PACK AGREES WITH THE MECHANISM
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!items!") && value?.type === "spell") spells.push(value);
  }
} finally {
  await db.close();
}

ok("I0 the spells pack was read", spells.length > 600,
  `only ${spells.length} spells found — every claim below would pass vacuously`);

const riderRows = [];
for (const spell of spells) {
  for (const row of spell.system?.effects ?? []) {
    if (row?.kind === "strikeRider") riderRows.push({ spell: spell.name, row });
  }
}
/*
 * SEVEN NOW, NOT THREE. Four more were authored at 3.452.0 after
 * `tools/rulebook.mjs` compared every printed spell against the pack —
 * and every one of them needed NO new code, only the entry read. Each
 * uses the book's own word: "secondary".
 *
 *   Disrupting Weapon  "Attacks with this weapon inflict 1d6 essence
 *                       damage as a secondary damage type."
 *   Flaming Weapon     "all attacks made with the weapon inflict 1d6
 *                       secondary fire damage"
 *   Freezing Weapon    the same sentence, cold
 *   Forceful Strike    "you also inflict 2d6 secondary Force damage"
 *
 * Forceful Strike is the "natural fourth user" this file's own header
 * named at 3.437.0, held back because I had reported its stat block and
 * its text as contradicting each other. They never did: Base Damage 1d6
 * is what Empower Spell multiplies, 2d6 is what the strike adds.
 */
// EIGHT AT 3.465.0: Force Punch joined, the first `unarmed`-scoped rider
// — the spell infuses a hand rather than a weapon, so it rides every
// unarmed attack the caster has rather than one item.
/*
 * I0 IS HERE BECAUSE 3.465.0 SHIPPED A ROW WITHOUT ONE, and only driving
 * it found out.
 *
 * Force Punch's row omitted `target`. Nothing refused it — the rider
 * normalised, the scope worked, the pack carried the die, and
 * verify-area-rider's whole E section passed. Then the Wizard cast it in
 * Graham's world and the card read "ZZ Undead Foe: +1d6 force on every
 * unarmed Strike": the applier had hung a self-buff on whatever token
 * happened to be targeted at the time.
 *
 * EVERY OTHER ROW ALREADY SAID `self` — Flaming Weapon, Talon Strike and
 * Arrow Of The Wild Hunt all declare it, and mine was the only one that
 * did not. A convention three rows deep that nothing asserted is a
 * convention the fourth row gets to break, which is what happened.
 */
for (const row of riderRows) {
  ok(`I0 ${row.spell} names who the rider is hung on`,
    typeof row.row?.target === "string" && row.row.target.trim() !== "",
    "without it the applier hangs a self-buff on whatever token is targeted");
}
// NINE AT 3.613.0: Weapon Surge's extra die of the weapon's own (R12).
ok("I1 the nine declared spells carry a rider", riderRows.length === 9,
  `found ${riderRows.length}: ${riderRows.map((r) => r.spell).join(", ")}`);
// EVERY ROW IN THE PACK, not the three this release wrote — a fourth
// added later with a typo must fail here rather than at a table.
ok("I2 every rider row in every pack normalises",
  riderRows.every(({ row }) => normaliseStrikeRider(row) !== null),
  riderRows.filter(({ row }) => !normaliseStrikeRider(row)).map((r) => r.spell).join(", "));

const byName = Object.fromEntries(riderRows.map(({ spell, row }) => [spell, normaliseStrikeRider(row)]));
ok("I3 Arrow Of The Wild Hunt is a one-shot ranged force die",
  byName["Arrow Of The Wild Hunt"]?.scope === "ranged"
  && byName["Arrow Of The Wild Hunt"]?.once === true
  && byName["Arrow Of The Wild Hunt"]?.damageType === "force"
  && byName["Arrow Of The Wild Hunt"]?.dice === "1d6");
ok("I4 Talon Strike lasts, and is bound to one weapon",
  byName["Talon Strike"]?.once === false && byName["Talon Strike"]?.weaponScoped === true
  && byName["Talon Strike"]?.damageType === "slashing");
ok("I5 Spoil The Profane's die is conditional and says on what",
  byName["Spoil The Profane"]?.conditional === true
  && /opposing aura/.test(byName["Spoil The Profane"]?.against ?? ""),
  "nothing in this system knows what an opposing aura is; printing it is the honest answer");
ok("I6 and its weakened is a real condition the registry knows",
  Boolean(CONDITIONS[byName["Spoil The Profane"]?.condition])
  && CONDITIONS[byName["Spoil The Profane"]?.condition]?.valued === true
  && byName["Spoil The Profane"]?.conditionValue === 1);

// THE FOUR ADDED AT 3.452.0, each asserted individually — a count alone
// would pass if one were reverted and another added.
ok("I7 Disrupting Weapon lasts and is bound to the touched weapon",
  byName["Disrupting Weapon"]?.dice === "1d6"
  && byName["Disrupting Weapon"]?.damageType === "essence"
  && byName["Disrupting Weapon"]?.once === false
  && byName["Disrupting Weapon"]?.weaponScoped === true,
  "an unscoped 1-minute rider would arm every weapon the character owns");
for (const [spell, type] of [["Flaming Weapon", "fire"], ["Freezing Weapon", "cold"]]) {
  ok(`I8 ${spell} is a lasting melee ${type} die on one weapon`,
    byName[spell]?.dice === "1d6" && byName[spell]?.damageType === type
    && byName[spell]?.scope === "melee" && byName[spell]?.once === false
    && byName[spell]?.weaponScoped === true,
    "the spell targets \"One melee weapon\", so the scope is read rather than defaulted");
}
// THE NUMBER THAT WAS THE WHOLE MISREADING.
ok("I9 FORCEFUL STRIKE ADDS 2d6, ITS ONE-SHOT STRIKE DIE",
  byName["Forceful Strike"]?.dice === "2d6"
  && byName["Forceful Strike"]?.damageType === "force"
  && byName["Forceful Strike"]?.scope === "melee"
  && byName["Forceful Strike"]?.once === true,
  "1d6 is the per-die base Empower multiplies and must never become the rider");

// THE HALF THAT IS APPLIED AND THE HALF THAT IS PRINTED ARE DIFFERENT
// HALVES. Spoil's weakened is unconditional in the book; only the die
// waits on the aura. A rider that marked the whole spell conditional
// would silently stop applying the condition.
ok("I7 Spoil still applies its condition despite the conditional die",
  byName["Spoil The Profane"]?.condition === "weakened");

/* ================================================================== *
 * J. WHAT THE CAST CARD SAYS
 * ================================================================== */

ok("J1 a conditional rider is announced as printed, not applied",
  /printed on the strike card/.test(riderCastLine(byName["Spoil The Profane"])),
  "announcing it as damage would promise automation the spell does not have");
ok("J2 and the condition it does apply is named",
  /weakened/.test(riderCastLine(byName["Spoil The Profane"])));
ok("J3 a duration rider says it applies to every Strike",
  /every/.test(riderCastLine(byName["Talon Strike"])));
ok("J4 a one-shot says it applies to the next one",
  /next/.test(riderCastLine(byName["Arrow Of The Wild Hunt"]))
  && /ranged/.test(riderCastLine(byName["Arrow Of The Wild Hunt"])));
ok("J5 no cast line renders undefined",
  Object.values(byName).every((spec) => !/undefined/.test(riderCastLine(spec))));

/* ================================================================== *
 * K. THE PRE-CAST GATE — a blocked attempt must cost nothing (3.438.0)
 * ================================================================== *
 *
 * The 3.437.0 live pass drove Talon Strike with empty hands. The refusal
 * fired and the card ALSO read "1 PP spent", because the check lived in
 * the effect applier, downstream of the Spellcraft roll and the debit —
 * while this system's other three physical gates are all "checked before
 * anything is spent or rolled, so a blocked attempt costs nothing".
 *
 * Every claim here is scoped to `castSpell`'s own body and anchored on a
 * call, because `weaponRiderGate` is also named in an import at the top
 * of cast-workflow.mjs.
 */

ok("K1 Talon Strike's row is recognised as needing a weapon in hand",
  weaponRiderRequirement({ effects: riderRows.find((r) => r.spell === "Talon Strike")
    ? [riderRows.find((r) => r.spell === "Talon Strike").row] : [] })?.weaponScoped === true);
ok("K2 a rider that names no weapon does not gate the cast",
  weaponRiderRequirement({ effects: [{ kind: "strikeRider", target: "self", dice: "1d6", damageType: "force" }] }) === null,
  "Arrow Of The Wild Hunt needs no weapon in hand and must not be refused for lacking one");
// THE LINE THAT KEEPS THIS FROM BECOMING A SECOND COPY of the applier's
// refusal: a pre-cast gate cannot know who the recipients will be, so it
// speaks only for a row aimed at the caster.
ok("K3 a weapon rider aimed at somebody else is not gated here",
  weaponRiderRequirement({ effects: [{ kind: "strikeRider", target: "targets", dice: "1d6",
    damageType: "slashing", weaponScoped: true }] }) === null,
  "the applier still answers for that one, so the two guards make different claims");
ok("K4 a malformed row is left to the applier to name",
  weaponRiderRequirement({ effects: [{ kind: "strikeRider", target: "self", dice: "1d6+1",
    damageType: "slashing", weaponScoped: true }] }) === null,
  "'you are wielding no weapon' would name the wrong fault");
ok("K5 a spell with no rider rows at all is not gated",
  weaponRiderRequirement({ effects: [{ kind: "bonus", slot: "athletics", value: 2 }] }) === null
  && weaponRiderRequirement({}) === null && weaponRiderRequirement(null) === null);

const castBody = bodyOf(cast, "export async function castSpell(");
ok("K6 castSpell's body was found and reaches its real code",
  castBody.length > 0 && castBody.includes("componentGate(actor, spellData, spell.name)"),
  "a body that cannot see the component gate is not castSpell's body");
ok("K7 the cast asks the weapon gate",
  has(castBody, "weaponRiderGate(actor, spellData, spell.name)"),
  "anchored on the CALL — the name is also in the import at the top of the file");
// A GATE THAT DOES NOT ABORT IS A WARNING. This is the shape the live
// pass actually produced — the refusal fired and the cast carried on to
// spend the PP — so it is asked for directly rather than inferred from
// the call being present. The mutation runner found that K7 and K8
// together did not cover it: both pass while the return is deleted.
ok("K8 the gate's answer aborts the cast",
  has(castBody, "if (!weaponRiderGate(actor, spellData, spell.name)) return null;"),
  "without the return, the gate warns and the spell is cast and paid for anyway");
// AND IT MUST SIT ABOVE THE DEBIT. If it drifts below, the refusal still
// fires and the PP is still gone — the exact card the live pass produced,
// with every other check in this file green.
ok("K8b and asks it BEFORE the Power Points are debited",
  before(castBody, "weaponRiderGate(actor, spellData, spell.name)", "ppPool - casterPPSpent"),
  "a gate below the debit is the 3.437.0 defect wearing a gate's name");
ok("K9 and asks it beside the component gate",
  before(castBody, "componentGate(actor, spellData, spell.name)", "weaponRiderGate(actor, spellData, spell.name)")
  && !/ppPool - casterPPSpent/.test(strip(castBody).slice(
      strip(castBody).indexOf("componentGate(actor, spellData, spell.name)"),
      strip(castBody).indexOf("weaponRiderGate(actor, spellData, spell.name)"))),
  "the same question about the same hands, and nothing is spent between the two");
// TWO GUARDS, TWO CLAIMS. If the applier goes back to saying "is wielding
// none", the two are copies again and neither is under test.
ok("K10 the applier's refusal does not restate the gate's claim",
  !/wielding no weapon/.test(strip(riderCase)) && /No weapon was chosen/.test(strip(riderCase)),
  "cast-workflow.mjs records what two copies of one rule cost: neither ends up tested");

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-strike-riders: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-strike-riders: OK — ${checks} checks. Riders normalise, scope, spend, `
  + `carry the rune loop's own packet shape, and are REACHED from resolveWeaponDamage.\n`);
