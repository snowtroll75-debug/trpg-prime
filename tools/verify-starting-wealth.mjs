#!/usr/bin/env node
/**
 * verify-starting-wealth — Chapter 6's STARTING WEALTH, new at 3.552.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL.
 *
 * Before 3.552.0 the system carried NO starting wealth data of any kind.
 * Not a wrong number — no number. A player rolling a character had a
 * purse of zeroes and a rule in the book that nothing on the sheet knew
 * about. Graham ruled the whole section into place on 10 September 2026
 * and supplied the Background Wealth table with the pack's own names.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IT PINS.
 *
 *   A. THE ARITHMETIC, driven. Charisma clamped at zero from below, the
 *      background, the class, ×50 gp.
 *   B. THE DATA. All 42 backgrounds and all 8 classes carry the printed
 *      value, checked against the table transcribed from Graham's own
 *      revised image rather than from the rulebook — the rulebook's
 *      names disagree with the pack's for four rows, which is the exact
 *      shape of mismatch that would have silently zeroed them.
 *   C. THE FORMULA. The Gambler's 1d4-2 resolves from the RECORDED
 *      roll, and reads as pending — never as zero — until one exists.
 *   D. THE DEBT CASE. A score of 0 or less is not clamped, not paid out,
 *      and is reported as a conversation with the GM.
 *   E. THE WIRING. The roll happens in _preCreate, the score is derived
 *      after attributes, and the payout is a one-time flag.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

import {
  CLASS_WEALTH,
  GP_PER_WEALTH_POINT,
  backgroundItemOf,
  charismaWealth,
  classItemForWealth,
  classWealth,
  declaredWealth,
  isWealthFormula,
  purseAfterGrant,
  startingWealthGranted,
  wealthRollNeeded,
  wealthScore
} from "../module/starting-wealth.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

async function dump(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), {
    keyEncoding: "utf8",
    valueEncoding: "json"
  });
  await db.open();
  const rows = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || key.slice(7).includes("!")) continue;
      rows.push({ key, ...value });
    }
  } finally {
    await db.close();
  }
  return rows;
}

/* The table as Graham supplied it on 10 September 2026, with the pack's
 * own background names. Transcribed here so a pack edit that drifts is
 * a failure rather than a new truth. */
const BACKGROUND_WEALTH = {
  Acolyte: "0", Acrobat: "1", "Animal Friend": "0", Apprentice: "0",
  "Arcane Apprentice": "1", Archaeologist: "1", Barbarian: "-2", Barkeep: "1",
  "Bounty Hunter": "2", Charlatan: "1", Cook: "0", Criminal: "0", Cultist: "0",
  Detective: "2", Diplomat: "2", Entertainer: "2", Farmhand: "0",
  "Field Medic": "1", "Fortune Teller": "1", Gambler: "1d4-2", Gladiator: "2",
  Guard: "1", Herbalist: "0", Hermit: "-2", Highwayman: "0", Hunter: "1",
  Labourer: "0", "Lay Healer": "0", "Martial Artist": "2", Merchant: "2",
  Miner: "0", Outrider: "1", Prisoner: "-1", Sailor: "1", Scholar: "1",
  Scout: "1", "Servant Of Nature": "-1", Soldier: "2", Squire: "2",
  "Street Urchin": "-1", Templar: "1", Weaver: "-1"
};

/** A stand-in character: items and a resolved Charisma total. */
const actorWith = ({ cha = 0, background = null, klass = null, flags = {} } = {}) => ({
  type: "character",
  name: "Test",
  system: { attributes: { charisma: { total: cha } }, currency: { gp: 0 } },
  items: [background, klass].filter(Boolean),
  flags
});
const backgroundItem = (name, wealth, roll = undefined) => ({
  type: "background",
  name,
  system: { wealth },
  flags: roll === undefined ? {} : { "trg-prime": { wealthRoll: roll } }
});
const classItem = (name, wealth = "") => ({ type: "class", name, system: { wealth } });

/* ================================================================== *
 * A. THE ARITHMETIC
 *
 * Driven end to end rather than read, because every one of these is a
 * one-token mutation away from plausible: a clamp on the wrong side, a
 * multiplier of 5 or 500, a background counted twice.
 * ================================================================== */
{
  eq("A1 Charisma +3 contributes 3", charismaWealth({ attributes: { charisma: { total: 3 } } }), 3);
  eq("A2 Charisma 0 contributes 0", charismaWealth({ attributes: { charisma: { total: 0 } } }), 0);
  // The one asymmetry in the whole rule: "Ignore any negative modifiers
  // to Charisma." A -2 Charisma character is not POORER for it.
  eq("A3 Charisma -2 contributes 0, not -2",
    charismaWealth({ attributes: { charisma: { total: -2 } } }), 0);
  eq("A4 a character with no attributes at all contributes 0", charismaWealth({}), 0);

  eq("A5 the multiplier is 50 gp per point", GP_PER_WEALTH_POINT, 50);

  const merchantRogue = wealthScore(actorWith({
    cha: 2, background: backgroundItem("Merchant", "2"), klass: classItem("Rogue", "2")
  }));
  eq("A6 Cha 2 + Merchant 2 + Rogue 2 = 6", merchantRogue.score, 6);
  eq("A7 and 6 × 50 = 300 gp", merchantRogue.gp, 300);
  ok("A8 a positive score is not flagged as debt", merchantRogue.indebted === false);

  const brokeDruid = wealthScore(actorWith({
    cha: -3, background: backgroundItem("Hermit", "-2"), klass: classItem("Druid", "0")
  }));
  // -3 Cha contributes 0, so this is 0 + -2 + 0.
  eq("A9 a negative Charisma does not deepen the hole", brokeDruid.score, -2);
  eq("A10 and the gold follows the score into the negative", brokeDruid.gp, -100);
  ok("A11 a score below zero is flagged as debt", brokeDruid.indebted === true);

  const exactlyZero = wealthScore(actorWith({
    cha: 0, background: backgroundItem("Acolyte", "0"), klass: classItem("Druid", "0")
  }));
  // Chapter 6: "a wealth score of 0 OR LESS" is the debt conversation.
  ok("A12 a score of exactly 0 is the debt case too", exactlyZero.indebted === true);
  eq("A13 and it is not silently raised to something spendable", exactlyZero.gp, 0);

  const noIdentity = wealthScore(actorWith({ cha: 1 }));
  eq("A14 a character with neither background nor class scores their Charisma alone",
    noIdentity.score, 1);
  eq("A15 and the breakdown still names all three contributions",
    noIdentity.parts.length, 3);
}

/* ================================================================== *
 * B. THE PACK DATA
 * ================================================================== */
{
  const backgrounds = await dump("backgrounds");
  const classes = await dump("classes");

  eq("B1 all 42 backgrounds are present", backgrounds.length, 42);
  const missing = backgrounds
    .filter((row) => !String(row.system?.wealth ?? "").trim())
    .map((row) => row.name);
  eq("B2 every background carries a wealth value", missing, []);

  const wrong = backgrounds
    .filter((row) => String(row.system?.wealth) !== BACKGROUND_WEALTH[row.name])
    .map((row) => `${row.name}: ${row.system?.wealth} (table says ${BACKGROUND_WEALTH[row.name]})`);
  eq("B3 and every one of them matches the printed table", wrong, []);

  // THE FOUR ROWS THAT USED TO DIVERGE, and no longer do. Through
  // rulebook 3.7 the Background Wealth table on page 145 named four
  // backgrounds that existed nowhere else in the book — Animal
  // Whisperer, Guild Apprentice, Artisan, Bandit — while the
  // backgrounds chapter used the names the pack uses. The table was the
  // stale thing, and the 3.8 revision corrects all four.
  //
  // Still named one at a time, because a rename is exactly how these
  // would go quiet, and because these four have moved once already.
  eq("B4 Animal Friend is 0",
    backgrounds.find((r) => r.name === "Animal Friend")?.system?.wealth, "0");
  eq("B5 Apprentice is 0",
    backgrounds.find((r) => r.name === "Apprentice")?.system?.wealth, "0");
  eq("B6 Arcane Apprentice is 1",
    backgrounds.find((r) => r.name === "Arcane Apprentice")?.system?.wealth, "1");
  eq("B7 Highwayman is 0",
    backgrounds.find((r) => r.name === "Highwayman")?.system?.wealth, "0");

  eq("B8 all 8 classes are present", classes.length, 8);
  const classWrong = classes
    .filter((row) => Number(row.system?.wealth) !== CLASS_WEALTH[row.name.toLowerCase()])
    .map((row) => `${row.name}: ${row.system?.wealth}`);
  eq("B9 every class carries its printed wealth", classWrong, []);
  eq("B10 the Crusader is the richest class at 3", CLASS_WEALTH.crusader, 3);
  eq("B11 and the Druid the poorest at 0", CLASS_WEALTH.druid, 0);

  // Driven: the item's own value is what counts, and the table is only
  // the fallback for an item that carries none.
  eq("B12 a class item's own value wins over the table",
    classWealth(classItem("Fighter", "1")).value, 1);
  eq("B13 and a class item with no value falls back to the printed table",
    classWealth(classItem("Fighter")).value, 3);
  eq("B14 an unrecognised class with no value contributes 0",
    classWealth(classItem("Skald")).value, 0);
}

/* ================================================================== *
 * C. THE GAMBLER'S FORMULA
 *
 * The only row in the table that is not a number, and the only place
 * this rule can produce a different answer twice for the same character.
 * ================================================================== */
{
  ok("C1 a plain number is not a formula", isWealthFormula("2") === false);
  ok("C2 a negative number is not a formula", isWealthFormula("-2") === false);
  ok("C3 an empty value is not a formula", isWealthFormula("") === false);
  ok("C4 1d4-2 is a formula", isWealthFormula("1d4-2") === true);
  // The field holds a ROLL FORMULA, so "is this a number" is the
  // question — not "does it contain a d". A formula that names no die
  // is still a formula, and a test that looked for the letter would
  // hand it back as the number zero.
  ok("C4a a formula with no die in it is still a formula", isWealthFormula("1+1") === true);
  ok("C4b and a two-die formula is one too", isWealthFormula("2d6-3") === true);

  const unrolled = declaredWealth(backgroundItem("Gambler", "1d4-2"));
  ok("C5 an unrolled formula reads as pending", unrolled.pending === true);
  // The honest answer is "not yet known". Reading it as 0 would make a
  // Gambler who rolled a 4 (score +2) look identical to one who has not
  // rolled at all, and the sheet would show a wrong total confidently.
  eq("C6 and contributes nothing until it is rolled", unrolled.value, 0);
  eq("C7 while still reporting the formula it is waiting on", unrolled.formula, "1d4-2");

  const rolled = declaredWealth(backgroundItem("Gambler", "1d4-2", 2));
  ok("C8 a recorded roll is not pending", rolled.pending === false);
  eq("C9 and is the value that counts", rolled.value, 2);

  // 1d4-2 runs from -1 to +2, so the recorded number can legitimately be
  // negative and must not be clamped or treated as absent.
  const unlucky = declaredWealth(backgroundItem("Gambler", "1d4-2", -1));
  eq("C10 a roll of -1 is a real recorded value", unlucky.value, -1);
  ok("C11 and is not mistaken for an unrolled formula", unlucky.pending === false);

  const zero = declaredWealth(backgroundItem("Gambler", "1d4-2", 0));
  ok("C12 a recorded roll of 0 is not mistaken for an unrolled one", zero.pending === false);

  // The decision the item document makes at creation, driven here
  // rather than read out of a file that cannot be imported.
  eq("C16 a Gambler with no roll recorded needs one",
    wealthRollNeeded(backgroundItem("Gambler", "1d4-2")), "1d4-2");
  eq("C17 a Gambler who has already rolled does not",
    wealthRollNeeded(backgroundItem("Gambler", "1d4-2", 2)), "");
  eq("C18 nor does one whose recorded roll was 0",
    wealthRollNeeded(backgroundItem("Gambler", "1d4-2", 0)), "");
  eq("C19 a printed number is never rolled",
    wealthRollNeeded(backgroundItem("Merchant", "2")), "");
  eq("C20 a background with no wealth at all is not rolled",
    wealthRollNeeded(backgroundItem("Homebrew", "")), "");
  eq("C21 a class may carry a formula too", wealthRollNeeded(classItem("Skald", "1d4")), "1d4");
  eq("C22 and nothing else in the system rolls for wealth",
    wealthRollNeeded({ type: "feat", name: "Rich", system: { wealth: "1d4" } }), "");

  const character = wealthScore(actorWith({
    cha: 1, background: backgroundItem("Gambler", "1d4-2"), klass: classItem("Bard", "1")
  }));
  ok("C13 a character waiting on the roll reports the whole score as pending",
    character.pending === true);

  const settled = wealthScore(actorWith({
    cha: 1, background: backgroundItem("Gambler", "1d4-2", 2), klass: classItem("Bard", "1")
  }));
  eq("C14 and once rolled the score is settled arithmetic", settled.score, 4);
  ok("C15 with nothing left pending", settled.pending === false);
}

/* ================================================================== *
 * D. THE PAYOUT
 * ================================================================== */
{
  ok("D1 a fresh character has not taken their starting wealth",
    startingWealthGranted(actorWith({})) === false);
  ok("D2 and one that has is recorded on the actor, not inferred from the purse",
    startingWealthGranted(actorWith({ flags: { "trg-prime": { startingWealthGranted: true } } })) === true);

  eq("D3 gold is ADDED to whatever is already in the purse",
    purseAfterGrant({ gp: 12, sp: 5 }, 300), { gp: 312, sp: 5 });
  eq("D4 and the rest of the purse is left alone",
    purseAfterGrant({ mp: 1, pp: 2, gp: 0, sp: 3, cp: 4 }, 50).sp, 3);
  eq("D5 an empty purse still works", purseAfterGrant(undefined, 100), { gp: 100 });

  const workflow = strip(read("module", "starting-wealth-workflow.mjs"));
  ok("D6 the debt case posts a card and pays nothing",
    /if \(wealth\.indebted\)/.test(workflow) &&
      /startingWealthGranted", true\)[\s\S]{0,600}?Settle the exact details with your GM/.test(workflow),
    "Chapter 6 sends a score of 0 or less to the GM, not to the purse");
  ok("D6a and the payout branch is the only place currency is written",
    (workflow.match(/system\.currency/g) ?? []).length === 1);
  ok("D7 a second payout is refused",
    /if \(startingWealthGranted\(actor\)\) \{[\s\S]{0,200}?ui\.notifications\.warn/.test(workflow),
    "asked as the WHOLE condition — `false && guard` is still a guard by any looser reading");
  ok("D8 a character whose formula is unrolled is not paid a wrong amount",
    /if \(wealth\.pending\) \{[\s\S]{0,300}?return null;/.test(workflow));
}

/* ================================================================== *
 * E. THE WIRING
 *
 * Read from source, because these are the joins that decide whether any
 * of the above ever runs. Each is asked as "is it REACHED", not "is it
 * defined" — the lesson from chapter 1's N3/N4, where a mutation walked
 * past a guard that was still defined and no longer called.
 * ================================================================== */
{
  const item = strip(read("module", "documents", "item.mjs"));
  const preCreate = item.slice(item.indexOf("async _preCreate"), item.indexOf("async _preDelete"));
  // Asked as "is it REACHED, unconditionally": a call still present but
  // wrapped in a guard is the chapter-1 N3/N4 failure, where a mutation
  // walked past a check that only asked whether a thing was defined.
  const statements = preCreate.split("\n").map((l) => l.trim());
  ok("E1 the wealth roll is taken during _preCreate, on its own",
    statements.includes("await this._recordWealthRoll();"),
    "rolled before the document exists, so nothing is written from inside a hook");
  ok("E2 and the decision it acts on is the one the harness can run",
    /const printed = wealthRollNeeded\(this\);/.test(item) &&
      /if \(!printed\) return;/.test(item),
    "type, formula and already-rolled gates live in starting-wealth.mjs");

  const actor = strip(read("module", "documents", "actor.mjs"));
  // 3.619.0: through startingWealthFor, which keeps the score's parts and adds
  // Chapter 12's table above 1st level (block 38's R5).
  ok("E5 the score is derived on the actor", /system\.wealth = startingWealthFor\(this\);/.test(actor));
  const derived = actor.slice(actor.indexOf("prepareDerivedData() {"));
  const attributesAt = derived.indexOf("prepareAttributes(system, this)");
  const wealthAt = derived.indexOf("system.wealth = startingWealthFor(this)");
  ok("E6 AFTER attributes, so Charisma is the resolved total",
    attributesAt > -1 && wealthAt > attributesAt,
    "a race's or an item's Charisma counts towards starting coin");
  ok("E7 and derived, never written to the database",
    !/update\(\{[^}]*system\.wealth/.test(actor));

  const sheet = strip(read("module", "sheets", "actor-sheet.mjs"));
  ok("E8 the sheet offers the payout as an action",
    /grantStartingWealth: TRGActorSheet\.grantStartingWealth/.test(sheet));
  ok("E9 and stops offering it once taken",
    /!context\.startingWealthTaken/.test(sheet));
  ok("E10 offered to characters only",
    /actor\.type === "character"/.test(sheet));

  const template = read("templates", "actor", "actor-sheet.hbs");
  ok("E11 the button reaches the template",
    /data-action="grantStartingWealth"/.test(template));
  ok("E12 and the breakdown is shown, not just the total",
    /startingWealthBreakdown/.test(template));

  const itemTemplate = read("templates", "item", "item-sheet.hbs");
  ok("E13 a GM can see and edit the value on a background or class",
    (itemTemplate.match(/name="system\.wealth"/g) ?? []).length === 2);

  const schema = JSON.parse(read("template.json"));
  ok("E14 the field is declared for both item types",
    schema.Item.background.wealth === "" && schema.Item.class.wealth === "",
    "an undeclared field is dropped on save");

  // The helpers exist to be used: a resolver nobody calls is the shape
  // §5.1 keeps finding.
  const module = strip(read("module", "starting-wealth.mjs"));
  ok("E15 the score reads the background through the resolver",
    /backgroundItemOf\(actor\)/.test(module) && typeof backgroundItemOf === "function");
  ok("E16 and the class through its own",
    /classItemForWealth\(actor\)/.test(module) && typeof classItemForWealth === "function");
  eq("E17 the background resolver finds the one background a character may have",
    backgroundItemOf(actorWith({ background: backgroundItem("Cook", "0") }))?.name, "Cook");
  eq("E18 and the class resolver the one class",
    classItemForWealth(actorWith({ klass: classItem("Bard", "1") }))?.name, "Bard");
}

/* ================================================================== *
 * F. THE MIGRATION, AND THE FACT THAT IT SAYS SO
 *
 * Added at 3.552.3 after the pass ran live on Graham's world and wrote
 * to fifteen characters in silence. migration.mjs's own comments call a
 * silent write "the wrong shape whatever it writes"; this one was mine,
 * and it was silent.
 * ================================================================== */
{
  const migration = strip(read("module", "migration.mjs"));

  ok("F1 the backfill pass exists",
    /export async function migrateStartingWealthValues\(actors = \[\]\)/.test(migration));
  /*
   * F2 COMPARES THE TWO VERSIONS INSTEAD OF PINNING BOTH (3.595.2).
   *
   * It asserted the constant was literally "3.552.1", which was true the
   * day it was written and false the next time anything raised the
   * constant — 3.595.2 raised it for the movement-effect-key pass, and this
   * check failed on a release that had not touched starting wealth at all.
   * A check that fails on unrelated work teaches everybody to edit checks
   * without reading them.
   *
   * The RULE is "this pass's gate is at or below the constant, so a world
   * can reach it". That is what is asked now.
   */
  const gate = /runIf\("([\d.]+)", "starting wealth on owned backgrounds and classes"/.exec(migration);
  const constant = /TRG_SCHEMA_VERSION = "([\d.]+)"/.exec(migration);
  const parts = (v) => String(v ?? "0").split(".").map((n) => Number(n) || 0);
  const atOrBelow = (a, b) => {
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
    }
    return true;
  };
  ok("F2 and is registered at a version the schema constant admits",
    Boolean(gate) && Boolean(constant) && atOrBelow(gate[1], constant[1]),
    `pass gated at ${gate?.[1] ?? "(not found)"}, schema constant ${constant?.[1] ?? "(not found)"} `
    + "— a pass registered above the constant is written, checked, released and dead");
  ok("F3 it runs on unlinked token actors too",
    /migrateStartingWealthValues\(\[\.\.\.actors, \.\.\.tokenActors\]\)/.test(migration),
    "an unlinked token carries its own copies of the background and class");
  ok("F4 only EMPTY values are filled",
    /if \(String\(item\.system\?\.wealth \?\? ""\)\.trim\(\)\) continue;/.test(migration),
    "a GM's house-ruled value must survive the pass, and the pass must be safe to re-run");
  ok("F5 matched by name, like every other owned-copy repair",
    /printed\[item\.type\]\.get\(String\(item\.name \?\? ""\)\.trim\(\)\.toLowerCase\(\)\)/.test(migration),
    "a dragged copy keeps its own id and a hand-built one never had the compendium's");
  ok("F6 a formula arriving this way is rolled once and recorded",
    /if \(!Number\.isFinite\(Number\(value\)\)\)[\s\S]{0,300}?wealthRoll`\] = rolled;/.test(migration),
    "the roll normally happens in _preCreate, and these items were created releases ago");

  // THE ANTI-SILENCE RULE, applied to my own pass.
  // ASKED AS THE WHOLE CONDITION. `if (false && result.wealthBackfill…)`
  // still contains the flag name, and a looser regex reads a disabled
  // guard as a live one — the same slip D7 had to be rewritten for.
  ok("F7 and it reports every value it wrote",
    /if \(result\.wealthBackfill\?\.length\) \{/.test(migration) &&
      /Starting wealth values filled in/.test(migration),
    "fifteen characters changed and nothing said so on its first live run");
  ok("F8 naming the character and the item, not just a count",
    /escapeHTML\(e\.actor\)[\s\S]{0,120}?escapeHTML\(e\.item\)/.test(migration));
  ok("F9 the rolled value included when there was one",
    /rolled <strong>\$\{e\.rolled\}<\/strong>, recorded once/.test(migration));
  ok("F10 and it says what it deliberately left alone",
    /Only empty values were filled/.test(migration),
    "a repair that names what it refused to touch is the shape Graham ruled for on 28 Aug 2026");
  ok("F11 whispered to the GM, like its neighbours",
    /Starting wealth values filled in[\s\S]{0,1200}?whisper: ChatMessage\.getWhisperRecipients\("GM"\)/.test(migration));
}

console.log(`verify-starting-wealth: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-starting-wealth: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-starting-wealth: all pass");
