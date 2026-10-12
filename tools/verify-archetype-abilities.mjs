#!/usr/bin/env node
/**
 * verify-archetype-abilities — the three the archetypes grant, and the
 * reason none of them could be reached.
 *
 * NEW at 3.586.3, from two live reports on 24 September 2026:
 * *"Agile Display and Death Mark are doing nothing"*, and then the one
 * that actually diagnosed it — *"there is nowhere on the sheet to make
 * the Agile Display check or apply Death Mark."*
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO FAULTS, AND THE SECOND ONE HID THE FIRST.
 *
 * THE ROUTING. `#groupItems` sorts an `ability` by its category, with
 * branches for Racial, Creature, Class and Proficiency. All three
 * archetype-granted abilities carry `category: "Archetype"`, which no
 * branch tested — so they fell to `otherFeatures`, a table headed
 * "Uncategorised" that carried no Use control at all. Their rows had
 * `hasFeatAction: true` the whole time. The row knew it had an action;
 * the table it landed in had no way to say so.
 *
 * THE HANDLERS. Underneath that, all three handlers rolled, named a
 * degree and applied nothing. Death Mark wrote an ActiveEffect carrying
 * a name and an English description; Agile Display and Sense Weakness
 * printed "is Flat-Footed" and touched the target not at all. The only
 * thing any of them applied was Prone, to the caster, on a blunder.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE AUDIT SAID ALL THREE WERE AUTOMATED.
 *
 * The pages 111-120 audit measured automation across 99 feats, put all
 * three in the "code" tier, and wrote that they "are all built as real
 * Use handlers with AP costs, targeting and checks". Every word true;
 * the conclusion wrong. What it measured was whether a HANDLER EXISTED
 * WITH THE RIGHT NAME — not whether anything happened when it ran, and
 * not whether anything could run it.
 *
 * That is the third time this project has recorded the shape in a month:
 * Acid Arrow's Sustain choice, last release's C25, and this. So sections
 * A and B ask the two questions the audit did not: can it be reached,
 * and does it change anything.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  DEATH_MARK_FLAG, deathMarkConditionals, deathMarkDeadly, deathMarkQualifies, markedUuidOf
} from "../module/combat/death-mark.mjs";
import { normaliseConditional, matchesCheck } from "../module/conditionals.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const code = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

async function abilitiesPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "abilities");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [, v] of db.iterator()) {
      if (v?.type !== "ability") continue;
      out.set(String(v.name).trim().toLowerCase(), v);
    }
  } finally {
    await db.close();
  }
  return out;
}
const abilities = await abilitiesPack();
ok("A0 the abilities pack could be read", abilities !== null);

const TRIO = ["death mark", "agile display", "sense weakness"];

/* ================================================================== *
 * A. CAN IT BE REACHED? — the question the audit never asked
 * ================================================================== */

for (const name of TRIO) {
  ok(`A1:${name} is present and an ability`, abilities?.get(name)?.type === "ability");
  ok(`A1b:${name} is categorised Archetype`,
    String(abilities?.get(name)?.system?.category ?? "") === "Archetype",
    JSON.stringify(abilities?.get(name)?.system?.category));
}

{
  const sheet = code("module", "sheets", "actor-sheet.mjs");
  // THE MISSING BRANCH, pinned by the category it tests rather than by
  // the table it chooses — a future move to a table of their own should
  // still pass, and falling back through to `otherFeatures` must not.
  ok("A2 an Archetype ability has a grouping branch of its own",
    /item\.type === "ability" && category === "Archetype"/.test(sheet),
    "without one they fall to otherFeatures, which is headed Uncategorised");
  ok("A2b and it is tested BEFORE the catch-all",
    sheet.indexOf('category === "Archetype"') < sheet.indexOf("else groups.otherFeatures.push(row)"),
    "order, or the catch-all takes them first");
  ok("A2c the row it builds still computes hasFeatAction for an ability",
    /\["feat", "ability"\]\.includes\(item\.type\)/.test(sheet),
    "this was always true — it is why the rows knew and the table did not");
}

{
  const hbs = code("templates", "actor", "actor-sheet.hbs");
  // THE TABLE THEY NOW LAND IN.
  const archetypeTable = hbs.slice(
    hbs.indexOf("{{#each itemGroups.archetypeFeats"),
    hbs.indexOf("{{#each itemGroups.classFeats")
  );
  ok("A3 the archetype table renders a Use control",
    /data-action="useFeat"/.test(archetypeTable));

  /*
   * A4 IS THE GENERAL REPAIR, and it matters more than A3.
   *
   * Fixing the routing puts these three where they belong. It does
   * nothing for the next item whose category nobody thought of — and
   * eleven abilities in the pack carry a BLANK category today, all of
   * them landing in the same table. So the Uncategorised table now
   * renders a Use control too: a misfiled item should be misfiled, not
   * unusable.
   */
  const otherTable = hbs.slice(
    hbs.indexOf("{{#each itemGroups.otherFeatures"),
    hbs.indexOf("{{#each itemGroups.otherFeatures") + 2400
  );
  ok("A4 the Uncategorised table renders a Use control as well",
    /data-action="useFeat"/.test(otherTable),
    "anything with a handler must be reachable wherever it lands");
  ok("A4b and a wired passive gets its info control there too",
    /class="passive-info"/.test(otherTable));
}

/* ================================================================== *
 * B. DOES IT CHANGE ANYTHING? — the other question
 * ================================================================== */

{
  const feats = code("module", "feats-workflow.mjs");
  const deathMark = feats.slice(feats.indexOf('"death mark": {'), feats.indexOf('"agile display": {'));
  ok("B1 Death Mark records the mark as a uuid, not only a name",
    new RegExp(`\\[DEATH_MARK_FLAG\\]: \\{ uuid: markedUuid`).test(deathMark),
    "every channel that scopes to one creature matches on a uuid");
  ok("B2 and it places conditionals rather than a description",
    /conditionals \? \{ conditionals \} : \{\}/.test(deathMark)
    || /conditionals\.length \? \{ conditionals \} : \{\}/.test(deathMark));
  ok("B3 a name-only mark says it automated nothing",
    /Marked by name only/.test(deathMark),
    "silently marking a string nothing can compare against is the fault this file exists for");

  const agile = feats.slice(feats.indexOf('"agile display": {'), feats.indexOf('"sense weakness": {'));
  // ANCHORED ON THE STATEMENT, NOT THE CALL. The first version matched
  // the call text anywhere, and `mutate-archetype-abilities` walked
  // through it by writing `if (false) await applyConditionTags(...)`:
  // text present, call never runs. Third time this project has recorded
  // that shape — verify-effect-kinds-handled, last release's C25, here.
  ok("B4 Agile Display applies Flat-Footed on a success",
    /\n\s*await applyConditionTags\(ffTarget, \[\{ key: "flatFooted"/.test(agile),
    "and it must be the whole statement, not a call hidden behind a guard");
  ok("B5 and on a critical too",
    (agile.match(/await applyFlatFooted\(\)/g) ?? []).length === 2,
    "the critical rung is 'as success, plus tumble' — it must not lose the success half");
  ok("B6 its blunder still puts the caster Prone",
    /toggleStatusEffect\?\.\("prone"/.test(agile),
    "the one thing that always worked; a fix must not remove it");

  const sense = feats.slice(feats.indexOf('"sense weakness": {'), feats.indexOf('"skill focus": {'));
  ok("B7 Sense Weakness applies it too, though nobody reported it",
    /\n\s*await applyConditionTags\(swTarget, \[\{ key: "flatFooted"/.test(sense),
    "all three were built in one release and share one shape");
  ok("B8 with the page's two clocks — 1 minute and one round",
    /markFlatFooted\(10\)/.test(sense) && /markFlatFooted\(1\)/.test(sense));
}

/* ================================================================== *
 * C. THE MARK'S RULES, pure
 * ================================================================== */

const M = "Actor.abc123";
const base = { markedUuid: M, targetUuid: M, agile: true };

ok("C1 an agile melee blow against the mark qualifies",
  deathMarkQualifies(base) === true);
ok("C2 a finesse one does",
  deathMarkQualifies({ markedUuid: M, targetUuid: M, finesse: true }) === true);
ok("C3 an unarmed one does",
  deathMarkQualifies({ markedUuid: M, targetUuid: M, unarmed: true }) === true);
ok("C4 a plain greatsword does not",
  deathMarkQualifies({ markedUuid: M, targetUuid: M }) === false);
ok("C5 the same blow against somebody else does not",
  deathMarkQualifies({ ...base, targetUuid: "Actor.other" }) === false,
  "the whole point of the mark is that it is one creature");
ok("C6 and nothing qualifies when nobody is marked",
  deathMarkQualifies({ ...base, markedUuid: "" }) === false);

// THE RANGED CLAUSE IS A DISTANCE, NOT A WEAPON.
ok("C7 a shot inside the first increment qualifies",
  deathMarkQualifies({ markedUuid: M, targetUuid: M, isRanged: true, withinFirstIncrement: true }) === true);
ok("C8 a shot beyond it does not, however agile the bow",
  deathMarkQualifies({ markedUuid: M, targetUuid: M, isRanged: true, agile: true, finesse: true, withinFirstIncrement: false }) === false,
  "the ranged branch is decided by where they stand, not by the trait line");

ok("C9 a qualifying blow grants Deadly",
  deathMarkDeadly(true, false).grantsDeadly === true);
ok("C10 and adds nothing flat, because the trait IS the gain",
  deathMarkDeadly(true, false).damageBonus === 0);
// THE BRANCH A HURRIED IMPLEMENTATION LOSES: a weapon that already
// prints Deadly gains nothing from being granted it again.
ok("C11 an already-Deadly weapon gets +1 damage instead",
  deathMarkDeadly(true, true).damageBonus === 1 && deathMarkDeadly(true, true).grantsDeadly === false,
  "or the page's parenthesis silently gives a Deadly weapon nothing at all");
ok("C12 a non-qualifying blow gets neither",
  deathMarkDeadly(false, true).damageBonus === 0 && deathMarkDeadly(false, false).grantsDeadly === false);

ok("C13 the mark is read off the attacker's effects",
  markedUuidOf([{ flags: { "trg-prime": { [DEATH_MARK_FLAG]: { uuid: M } } } }]) === M);
// A DISABLED EFFECT MARKS NOBODY — which is what makes an Antimagic
// Field switch the mark off with everything else.
ok("C14 a disabled mark marks nobody",
  markedUuidOf([{ disabled: true, flags: { "trg-prime": { [DEATH_MARK_FLAG]: { uuid: M } } } }]) === "");
ok("C15 and no mark reads as an empty string, not undefined",
  markedUuidOf([]) === "" && markedUuidOf(null) === "");

/* ================================================================== *
 * D. THE +2, THROUGH THE ENGINE THAT WILL ACTUALLY OFFER IT
 * ================================================================== */

{
  const rows = deathMarkConditionals(M, "Varrok");
  ok("D1 three rows — attack, perception, feint", rows.length === 3);
  ok("D2 every one is scoped to the mark",
    rows.every((r) => r.when.targetUuids.join() === M),
    "an unscoped +2 would apply to every creature in the room");
  ok("D3 each is +2 circumstance",
    rows.every((r) => r.value === 2 && r.type === "circumstance"));
  ok("D4 and names the mark, so the dialog row is readable",
    rows.every((r) => r.scope.includes("Varrok")));
  ok("D5 no mark authors no rows", deathMarkConditionals("").length === 0,
    "rather than three rows scoped to nothing, which would offer on every roll");

  // NORMALISED AND MATCHED BY THE REAL ENGINE, not by this file's idea
  // of it. `collectConditionals` normalises whatever it harvests, so a
  // row that cannot survive that round trip is a row nobody sees.
  const entries = rows.map((r, i) => normaliseConditional(r, { id: "dm", name: "Death Mark" }, i));
  ok("D6 all three survive normalisation", entries.every(Boolean),
    JSON.stringify(entries.map((e) => Boolean(e))));
  ok("D7 the attack row reaches an attack against the mark",
    matchesCheck(entries[0], { checkType: "attack", targetUuid: M }) === true);
  ok("D8 and not an attack against anybody else",
    matchesCheck(entries[0], { checkType: "attack", targetUuid: "Actor.other" }) === false);
  ok("D9 nor a save that happens to be rolled against the mark",
    matchesCheck(entries[0], { checkType: "save", targetUuid: M }) === false);
}

/* ================================================================== *
 * E. THE WIRING IN THE ATTACK PIPELINE
 * ================================================================== */

{
  const atk = code("module", "combat", "attack-workflow.mjs");
  ok("E1 the mark widens the one `deadly` test rather than adding a channel",
    /const deadly = weaponIsDeadly \|\| mark\.grantsDeadly;/.test(atk),
    "a second answer to 'is this blow deadly' is a second thing to keep in step");
  ok("E2 the weapon's own trait is still read",
    /const weaponIsDeadly = \/\\bdeadly\\b\/i\.test/.test(atk));
  // NOT NEGATED. `/Number\.isFinite\(...\)/` matches `!Number.isFinite(...)`
  // just as happily, so the first version passed on a file that had the
  // test inverted — which would have fired the rider on every shot whose
  // distance could not be measured.
  ok("E3 the first-increment test refuses an unmeasured distance",
    /withinFirstIncrement: Number\.isFinite\(Number\(distanceToTarget\)\)/.test(atk)
    && !/withinFirstIncrement: !Number\.isFinite/.test(atk),
    "a rider that fires when nothing can be measured fires always");
  ok("E4 the +1 reaches the damage formula",
    /if \(Number\(deathMarkBonus\) > 0\) \{/.test(atk));
  ok("E5 and only on the path where the blow landed",
    /deathMarkBonus: mark\.damageBonus,/.test(atk)
    && (atk.match(/deathMarkBonus: mark\.damageBonus,/g) ?? []).length === 1,
    "the miss branch has nothing for it to add to");
  ok("E6 the mark is read from appliedEffects, not just actor.effects",
    /markedUuidOf\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)/.test(atk),
    "3.185.1's lesson: a transferred compendium effect lives on the item");
}

/* ================================================================== */

process.stdout.write(failures.length
  ? `\nverify-archetype-abilities: FAILED — ${failures.length} of ${checks}:\n  ${failures.join("\n  ")}\n`
  : `\nverify-archetype-abilities: OK — ${checks} checks. The three archetype abilities can be reached, and each one changes something.\n`);
process.exit(failures.length ? 1 : 0);
