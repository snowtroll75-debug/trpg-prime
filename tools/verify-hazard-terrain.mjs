#!/usr/bin/env node
/**
 * verify-hazard-terrain — damage for entering a square.
 *
 * NEW at 3.454.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE SPELLS, ONE SENTENCE, AND IT TOOK READING THE BOOK TO SEE IT.
 *
 * Spike Stones, Verdant Retribution and Wall Of Thorns all charge a
 * creature PER SQUARE ENTERED. Each had been read only as a stat block
 * until `tools/rulebook.mjs` compared the printed entries against the
 * pack, and all three were sitting silent.
 *
 * GRAHAM'S TWO RULINGS, 1 September 2026:
 *   - only the creature's OWN MOVE ACTION triggers it (so a teleport in
 *     is free), reading Wall Of Thorns' "uses a move action to enter" as
 *     the family's rule;
 *   - Verdant Retribution's unknowable "squares that contain plants"
 *     is treated as the whole radius.
 *
 * SECTION E IS THE ONE THAT MATTERS, as it is for every mechanism here:
 * not "is the rule right" but "is it REACHED", and from a hook that only
 * fires on moves that actually happened.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  normaliseHazard, hazardTriggers, hazardAffects, squaresEntered,
  hazardLine, HAZARD_FLAG
} from "../module/magic/hazard-terrain.mjs";
import { MOVEMENT_ACTION_SPEEDS } from "../module/combat/movement.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
/**
 * A named function's body, so an ordering claim is about the CALL and
 * not about a definition that happens to sit higher in the file.
 *
 * E3 and E9 both failed on their first run for exactly that: `indexOf`
 * found `hazardRegions()` at its definition on line 41 and `isActingGM`
 * at its import, so both orderings read backwards. The same trap as
 * matching a string that occurs twice — arithmetic instead of text.
 */
function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  let cursor = start + signature.length - 1;
  if (src[cursor] === "(") {
    let parens = 0;
    for (; cursor < src.length; cursor += 1) {
      if (src[cursor] === "(") parens += 1;
      else if (src[cursor] === ")") { parens -= 1; if (parens === 0) break; }
    }
  }
  const open = src.indexOf("{", cursor);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  return "";
}

function before(hay, a, b) {
  const i = hay.indexOf(a); const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

/* ================================================================== *
 * A. WHAT A HAZARD IS
 * ================================================================== */

ok("A1 a hazard normalises", normaliseHazard({ damage: "1d8", damageType: "piercing" })?.damage === "1d8");
ok("A1b a flat number is legal too", normaliseHazard({ damage: "3", damageType: "fire" })?.damage === "3");
// AN EMPTY TYPE MEANS SOMETHING ELSE IN THIS SYSTEM — see the rune loop
// and `normaliseStrikeRider`. A row that forgot its type must not
// inherit that meaning.
ok("A2 A MISSING DAMAGE TYPE IS REFUSED",
  normaliseHazard({ damage: "1d8" }) === null,
  "an empty type is a rune's way of saying \"the weapon's own\"");
ok("A2b as is a missing or malformed formula",
  normaliseHazard({ damageType: "fire" }) === null
  && normaliseHazard({ damage: "lots", damageType: "fire" }) === null
  && normaliseHazard(null) === null);
ok("A3 enemies-only is declared, never assumed",
  normaliseHazard({ damage: "2d8", damageType: "poison", side: "enemies" })?.enemiesOnly === true
  && normaliseHazard({ damage: "1d8", damageType: "piercing" })?.enemiesOnly === false);
// PRINTED, SO KEPT AS WRITTEN. `damageType` is lowercased because it is
// COMPARED; this one is shown to a player, and lowercasing it produced a
// live card reading "A basic fortitude save applies" — the interface
// mis-naming one of the system's own defined terms.
ok("A4 a save is carried when the spell prints one",
  normaliseHazard({ damage: "2d8", damageType: "poison", save: "Basic Fortitude" })?.save === "Basic Fortitude"
  && normaliseHazard({ damage: "1d8", damageType: "piercing" })?.save === "");
ok("A4b AND IT IS NOT FLATTENED, because the card prints it",
  normaliseHazard({ damage: "2d8", damageType: "poison", save: "Basic Reflex" })?.save === "Basic Reflex",
  "\"A basic reflex save applies\" is the interface mis-naming a defined term");
ok("A5 the flag is the one the mover reads", HAZARD_FLAG === "hazardTerrain");

/* ================================================================== *
 * B. GRAHAM'S RULING — ONLY THE CREATURE'S OWN MOVE
 * ================================================================== */

ok("B1 a walk triggers", hazardTriggers("walk") === true);
ok("B1b so does any other Speed-governed action",
  ["crawl", "jump", "fly", "swim", "climb", "burrow"].every((a) => hazardTriggers(a) === true));
// THE RULING. A teleport is not a move action, so the spikes never see it.
ok("B2 A TELEPORT DOES NOT",
  hazardTriggers("displace") === false && hazardTriggers("blink") === false,
  "Graham, 1 Sep 2026: only the creature's own move action");
// EXPRESSED AGAINST THE SYSTEM'S OWN TABLE, not a list retyped here — a
// movement action added later is covered without touching that file.
ok("B3 and the test is the shared Speed table",
  Object.keys(MOVEMENT_ACTION_SPEEDS).every((a) => hazardTriggers(a) === true),
  "every Speed-governed action must trigger, by construction");
ok("B4 an unknown action defaults to walking",
  hazardTriggers(undefined) === true,
  "Foundry omits the action for an ordinary walk");

/* ================================================================== *
 * C. WHO IT BITES
 * ================================================================== */

const anyone = normaliseHazard({ damage: "1d8", damageType: "piercing" });
const enemies = normaliseHazard({ damage: "2d8", damageType: "poison", side: "enemies" });
ok("C1 an unrestricted hazard bites everyone",
  hazardAffects(anyone, true) === true && hazardAffects(anyone, false) === true);
ok("C2 an enemies-only hazard spares an ally",
  hazardAffects(enemies, true) === true && hazardAffects(enemies, false) === false);

/* ================================================================== *
 * D. WHICH SQUARES WERE ENTERED
 * ================================================================== */

const line3 = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 }];
ok("D1 a three-square walk enters three", squaresEntered(line3, 100).length === 3);
// THE SQUARE YOU START IN IS NOT ONE YOU ENTERED. Counting it would
// double every crossing and read exactly like a bad die.
ok("D2 THE ORIGIN IS NOT ENTERED",
  squaresEntered(line3, 100).every((p) => p.key !== "0,0"),
  "\"every square of that area it moves into\" counts destinations");
ok("D3 a repeated point is not a second square",
  squaresEntered([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }], 100).length === 1);
// "EACH TIME IT ENTERS" — stepping out and back in is two entries.
ok("D4 RE-ENTERING COUNTS AGAIN",
  squaresEntered([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }], 100).length === 3,
  "the printed wording is \"each time it enters\"");
ok("D5 standing still enters nothing",
  squaresEntered([{ x: 0, y: 0 }], 100).length === 0
  && squaresEntered([{ x: 0, y: 0 }, { x: 10, y: 10 }], 100).length === 0);
ok("D6 and rubbish is not a path",
  squaresEntered(null, 100).length === 0 && squaresEntered(line3, 0).length === 0);

/* ================================================================== *
 * E. IS IT REACHED?
 * ================================================================== */

const flow = strip(read("module", "magic", "hazard-terrain-workflow.mjs"));
const boot = strip(read("scripts", "trg-prime.mjs"));

ok("E1 the system registers the hook",
  /registerHazardTerrain\(\)/.test(boot) && /hazard-terrain-workflow\.mjs/.test(boot),
  "a mechanism nobody registers is the Cutting Words failure");
// THE HOOK CHOICE IS THE MECHANISM. `updateToken` reports only the final
// square and this family is paid per square; `preMoveToken` fires before
// the move and the movement gate refuses moves from there.
ok("E2 IT LISTENS TO moveToken, AFTER THE MOVE, WITH THE PATH",
  flow.includes('Hooks.on("moveToken"'),
  "updateToken cannot see a path; preMoveToken fires on moves that may not happen");
ok("E2b and not to the hooks that cannot answer this",
  !flow.includes('Hooks.on("updateToken"') && !flow.includes('Hooks.on("preMoveToken"'));
const applyBody = bodyOf(flow, "export async function applyHazardTerrain(");
ok("E2c the applier's body was found", applyBody.length > 0);
ok("E3 the ruling is asked before any work",
  before(applyBody, "hazardTriggers(actionOf(movement))", "hazardRegions()"),
  "a teleport must not even look for hazards");
/*
 * E3b GUARDS A RULE, NOT THE BUG IT WAS WRITTEN FOR.
 *
 * A walk into Spike Stones printed two cards with different totals. This
 * guard was the first response and it fixed nothing: the cause was a
 * SECOND BROWSER logged in as the same Gamemaster, each client rolling
 * its own dice. Removing every `moveToken` listener from one client and
 * still getting a card is what proved it.
 *
 * The guard is kept because it is true on its own terms — a movement is
 * charged once — and it is asked AFTER the ruling (a teleport must not
 * even consume an id) and BEFORE any dice. It is NOT a defence against
 * multiple clients, and nothing here should be read as claiming it is.
 */
ok("E3b ONE MOVEMENT IS CHARGED ONCE",
  applyBody.includes("if (alreadyApplied(movement?.id)) return;"),
  "one walk printed two cards, 19 and 31, five milliseconds apart");
ok("E3c and the guard sits after the ruling but before the dice",
  before(applyBody, "hazardTriggers(actionOf(movement))", "alreadyApplied(movement?.id)")
  && before(applyBody, "alreadyApplied(movement?.id)", "new Roll(spec.damage)"),
  "a teleport must not consume an id, and no die may be rolled twice");
// A MOVEMENT WITH NO ID IS CHARGED, NOT SKIPPED. Refusing to act is a
// worse failure than acting twice.
const guardBody = bodyOf(flow, "function alreadyApplied(");
ok("E3d a movement with no id is still charged",
  guardBody.includes("if (!id) return false;"),
  "silently skipping every hazard would be the worse bug");
ok("E3e and the cache is bounded",
  guardBody.includes("APPLIED_CAP") && flow.includes("appliedMovements.delete("),
  "a long session makes a lot of moves");

ok("E4 the squares come from the path, not the destination",
  flow.includes("squaresEntered(pathPoints(movement), gridSize)"));
ok("E5 each square is tested against the region itself",
  flow.includes("region.testPoint("),
  "a GM who reshaped the region must not be answered from stale geometry");
// ONE ROLL PER SQUARE. A single roll multiplied gives four identical
// numbers and hides the variance the dice exist for.
ok("E6 A DIE IS ROLLED FOR EVERY SQUARE",
  before(flow, "for (let i = 0; i < hits.length; i += 1)", "new Roll(spec.damage)"),
  "one roll multiplied would print the same number four times");
// THE LIVE STATEMENT, GUARD AND ALL. Both of these first passed against
// a mutation that disabled them, because the names survived in dead code
// — `if (false) await applyDamageAndCheckDying(...)` still contains the
// call, and `void resolveAgainstDefences;` still contains the name in
// the right order. A claim about a statement has to match the statement.
ok("E7 the damage is applied, not just printed",
  applyBody.includes("if (taken > 0) await applyDamageAndCheckDying(mover, taken"),
  "the thorns lesson: a card that reports damage nobody takes");
ok("E8 and it meets the mover's own defences first",
  applyBody.includes("const packet = resolveAgainstDefences(mover.system ?? {}, {")
  // BOTH NEEDLES ARE FULL STATEMENTS. A bare "applyDamageAndCheckDying"
  // matches its dynamic import first, which sits above the packet — so
  // the ordering read backwards and the check failed on correct code.
  // Third time today that an import or a definition has stood in for the
  // call an ordering claim was about.
  && before(applyBody, "const packet = resolveAgainstDefences",
    "if (taken > 0) await applyDamageAndCheckDying"),
  "a creature immune to piercing walks through spikes unharmed");
const registerBody = bodyOf(flow, "export function registerHazardTerrain(");
ok("E8b the registration body was found", registerBody.length > 0);
ok("E9 only one client applies it",
  before(registerBody, "isActingGM()", "applyHazardTerrain(tokenDocument, movement)"),
  "damage applied per-client multiplies by the number of people at the table");
ok("E10 a failure cannot lose the move",
  flow.includes("console.error(\"TRG Prime | Hazardous terrain could not be applied to this move\""));

const cast = strip(read("module", "magic", "cast-workflow.mjs"));
ok("E11 a cast records its hazard on the placed region",
  cast.includes('row?.kind !== "hazard"') && cast.includes("recordHazard(region, {"),
  "the region is where the mover will look");
/*
 * E11b IS THE CHECK THAT WOULD HAVE CAUGHT 3.454.0's REAL DEFECT.
 *
 * E11 asked whether the code EXISTS. It did — and it never ran. The
 * recording had been written beside the emanation recording, inside
 * `if (lock || spellData.sustained)`, because that is where the
 * neighbouring code lived. An emanation is always locked or sustained; a
 * hazard is neither. So Spike Stones placed its template, printed its
 * note, and left the region with `hazard: null`.
 *
 * Casting it at the table found that in one click. The harness could not,
 * because "the code is present" and "the code is reached" are different
 * questions and only the first was being asked — the same error as a
 * damage formula on a spell with no route to roll it.
 *
 * SO THIS ASKS ABOUT THE SCOPE. The recording must sit inside the block
 * that placed the template, which is the only place a hazard's region is
 * known to exist, and NOT inside the lock/sustained block.
 */
const placedBlock = (() => {
  const at = cast.indexOf("if (placed) {");
  if (at === -1) return "";
  let depth = 0;
  for (let i = cast.indexOf("{", at); i < cast.length; i += 1) {
    if (cast[i] === "{") depth += 1;
    else if (cast[i] === "}") { depth -= 1; if (depth === 0) return cast.slice(at, i + 1); }
  }
  return "";
})();
ok("E11b THE RECORDING IS INSIDE THE BLOCK THAT PLACED THE TEMPLATE",
  placedBlock.includes('row?.kind !== "hazard"') && placedBlock.includes("recordHazard(region, {"),
  "3.454.0 put it inside `if (lock || spellData.sustained)`, which no hazard spell satisfies");
const lockBlock = (() => {
  /*
   * MATCHED AS CODE, AND MATCHED WHATEVER THE GUARD SAYS (3.463.0).
   *
   * This read `indexOf("if (lock || spellData.sustained) {")`, one exact
   * spelling — so when the guard grew `|| emanationIsLive(spellData)` the
   * locator found nothing and E11c FAILED. That is the right way round,
   * and it is worth naming: E11c asks `lockBlock.length > 0` first, so a
   * block it could not find is a failure rather than a silent pass. The
   * sibling check in verify-emanation.mjs had no such term, and its
   * mutation survived instead.
   *
   * The pattern is anchored to a line start and a `) {` end so it matches
   * the STATEMENT and not this file's — or that file's — prose about it.
   */
  // AND THE GUARD'S FIVE LIMBS MOVED BEHIND A NAMED RULE at 3.528.0, so
  // the block now opens `if (registersCast) {`. The locator moves with
  // it; what E11c asserts is unchanged — Spike Stones is neither locked
  // nor sustained, so its recording must sit OUTSIDE this block.
  const guard = /^\s*if \(registersCast\) \{$/m.exec(cast);
  const at = guard ? guard.index : -1;
  if (at === -1) return "";
  let depth = 0;
  for (let i = cast.indexOf("{", at); i < cast.length; i += 1) {
    if (cast[i] === "{") depth += 1;
    else if (cast[i] === "}") { depth -= 1; if (depth === 0) return cast.slice(at, i + 1); }
  }
  return "";
})();
// AND NOT GATED ON THEM EITHER. Moving the code into the right block is
// only half the repair — a `lock || sustained` term added back to the
// guard would reproduce the same silence from inside the right scope.
// The guard is asserted exactly, so anything added to it fails here.
ok("E11d and the guard asks only about the row and the region",
  placedBlock.includes('if (row?.kind !== "hazard" || !placedArea?.regionId) continue;'),
  "any extra condition would re-create the defect from inside the correct block");
ok("E11c and NOT inside the lock/sustained block",
  lockBlock.length > 0 && !lockBlock.includes("recordHazard("),
  "Spike Stones is neither locked nor sustained");
ok("E12 and the caster's side travels with it",
  cast.includes("casterDisposition: casterToken?.document?.disposition ?? null"),
  "a caster who leaves the scene must not change who their plants attack");

/* ================================================================== *
 * F. THE THREE SPELLS
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") spells.push(v);
  }
} finally { await db.close(); }
ok("F0 the pack was read", spells.length > 600, `${spells.length}`);

const hazardRows = [];
for (const s of spells) {
  for (const r of s.system?.effects ?? []) if (r?.kind === "hazard") hazardRows.push({ spell: s.name, row: r });
}
ok("F1 exactly the three declared spells carry a hazard",
  hazardRows.length === 3,
  `found ${hazardRows.length}: ${hazardRows.map((r) => r.spell).join(", ")}`);
ok("F2 and every hazard row in the pack normalises",
  hazardRows.every(({ row }) => normaliseHazard(row) !== null),
  hazardRows.filter(({ row }) => !normaliseHazard(row)).map((r) => r.spell).join(", "));

const byName = Object.fromEntries(hazardRows.map(({ spell, row }) => [spell, normaliseHazard(row)]));
ok("F3 Spike Stones is 1d8 piercing to anyone, with no save",
  byName["Spike Stones"]?.damage === "1d8" && byName["Spike Stones"]?.damageType === "piercing"
  && byName["Spike Stones"]?.enemiesOnly === false && byName["Spike Stones"]?.save === "",
  "the spell names neither a side nor a save; inventing one would halve printed damage");
ok("F4 VERDANT RETRIBUTION IS ENEMIES ONLY, and carries its printed save",
  byName["Verdant Retribution"]?.damage === "2d8"
  && byName["Verdant Retribution"]?.enemiesOnly === true
  && byName["Verdant Retribution"]?.save === "Basic Fortitude",
  "it is the one of the three that names a side");
ok("F5 Wall Of Thorns is 2d8 piercing to anyone",
  byName["Wall Of Thorns"]?.damage === "2d8" && byName["Wall Of Thorns"]?.enemiesOnly === false);
// WHAT IS NOT BUILT MUST BE SAID. Each of the three carries printed
// material this mechanism does not touch.
for (const n of ["Spike Stones", "Verdant Retribution", "Wall Of Thorns"]) {
  const s = spells.find((x) => x.name === n);
  ok(`F6 ${n} still prints what the hazard does not cover`,
    (s?.system?.effects ?? []).some((r) => r?.kind === "note" && String(r.text ?? "").length > 40),
    "difficult terrain, concealment and wall HP are not this mechanism");
}

/* ================================================================== *
 * G. THE CARD
 * ================================================================== */

const spec = normaliseHazard({ damage: "1d8", damageType: "piercing", label: "Spike Stones" });
ok("G1 the line names what was taken and what was rolled",
  /takes <strong>7<\/strong> piercing/.test(hazardLine(spec, "Borin", 7, 7, 1)));
ok("G2 and says when defences reduced it",
  /reduced by their defences/.test(hazardLine(spec, "Borin", 4, 9, 1)),
  "Luminance's lesson: without the roll beside the result an immunity looks like a bad die");
ok("G3 and how many squares it was paid for",
  /across <strong>3<\/strong> squares/.test(hazardLine(spec, "Borin", 12, 12, 3)));
ok("G3b but not for a single square", !/squares/.test(hazardLine(spec, "Borin", 4, 4, 1)));

if (failures.length) {
  process.stderr.write(`verify-hazard-terrain: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-hazard-terrain: OK — ${checks} checks. Per square entered, on your own move, `
  + `and only where the region actually is.\n`);
