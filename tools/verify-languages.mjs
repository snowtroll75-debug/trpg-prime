#!/usr/bin/env node
/**
 * verify-languages — page 38, driven. NEW at 3.553.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS.
 *
 * The languages model is the most arithmetic in Chapter 2 and, until
 * now, the least driven: `verify-chapter2`'s E block asks five questions
 * about the Intelligence slots and four about which languages a race may
 * choose from, and every call it makes passes `linguisticsRanks: 0`.
 *
 * So nothing tested the printed rate ("for every 5 skill ranks you have
 * in the Linguistics skill, you may learn an additional language"),
 * nothing tested Linguist doubling it, nothing tested the two
 * language feats, nothing tested a background's slots, and nothing at
 * all tested `languageState` — the function that decides what the panel
 * shows a player: spent, remaining, over, and which picks fall outside
 * the list their race allows.
 *
 * It is a PURE module by design — "nothing here touches Foundry, so the
 * harness can check the awkward cases without a browser" — and that
 * invitation had gone unanswered for six weeks.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS PINS.
 *
 *   A. The catalogue against the printed page: 32 languages, their
 *      groups, and the typical speakers the book lists.
 *   B. The allowance arithmetic, every source of it.
 *   C. Graham's two rulings of 2 August 2026 (racial list binds at 1st
 *      level only; the Intelligence allowance tracks the score) and the
 *      background ruling of 3 August.
 *   D. languageState: core apart from chosen, over-allowance reported
 *      rather than prevented, and off-list picks flagged only when no
 *      free slot could account for them.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  LANGUAGES, LANGUAGE_GROUPS, LANGUAGE_FEAT_GRANTS, RANKS_PER_LANGUAGE,
  languageAllowance, languageState, resolveAllowedLanguages, parseLanguageChoice,
  canonicalLanguage, languageRarity, languagesInGroup, allLanguageNames, parseLanguageList
} from "../module/languages.mjs";

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

/* ================================================================== *
 * A. THE CATALOGUE, AGAINST THE PRINTED PAGE
 *
 * Transcribed from page 38 once. The typical speakers are checked too,
 * because they are what the picker shows a player — "Sharuk — Orcs,
 * Half Orcs" is the line that tells them what a language is for.
 * ================================================================== */
const PRINTED = [
  ["Aelvish", "common", "Elves, Half-Elves"],
  ["Gantish", "common", "Giants, Ogres, Trolls"],
  ["Glimbol", "common", "Gnomes"],
  ["High Tongue", "common", "Humans"],
  ["Low Tongue", "common", "Humans, Other Humanoids"],
  ["Mesnic", "common", "Catkin and Bestial Races"],
  ["Munblish", "common", "Halflings"],
  ["Nyxian", "common", "Kornargon"],
  ["Aeolian", "uncommon", "Air Elementals"],
  ["Aqualis", "uncommon", "Water Elementals"],
  ["Dengaris", "uncommon", "Dwarves"],
  ["Faechant", "uncommon", "Fey, Centaurs, Plants"],
  ["Gaian", "uncommon", "Earth Elementals"],
  ["Ignic", "uncommon", "Fire Elementals"],
  ["Sharuk", "uncommon", "Orcs, Half Orcs"],
  ["Wargle", "uncommon", "Goblins, Hobgoblins"],
  ["Wyrmish", "uncommon", "Ascendan, Dragons"],
  ["Abyssal", "rare", "Demons"],
  ["Aesirian", "rare", "Asgardian"],
  ["Aklo", "rare", "Aberrations"],
  ["Arboran", "rare", "Mystaron"],
  ["Druidic", "rare", "Druids"],
  ["Eudaimonic", "rare", "Maelstrum"],
  ["Ferric", "rare", "Eldravi"],
  ["Gaelic", "rare", "Agothians"],
  ["Harmonian", "rare", "Angels"],
  ["Luminal", "rare", "Thrae"],
  ["Nefari", "rare", "Infernus"],
  ["Pyroclan", "rare", "Vexora"],
  ["Solari", "rare", "Serenith"],
  ["Stygian", "rare", "Soulaess"],
  ["Thanatos", "rare", "Undead"]
];
{
  eq("A1 the catalogue holds the 32 named languages", Object.keys(LANGUAGES).length, PRINTED.length);
  const wrong = [];
  for (const [name, group, speakers] of PRINTED) {
    const entry = LANGUAGES[name];
    if (!entry) { wrong.push(`${name}: missing`); continue; }
    if (entry.rarity !== group) wrong.push(`${name}: group ${entry.rarity}, printed ${group}`);
    if (String(entry.speakers ?? "") !== speakers) {
      wrong.push(`${name}: speakers "${entry.speakers}", printed "${speakers}"`);
    }
  }
  eq("A2 each with the group and speakers the book prints", wrong, []);
  eq("A3 the group counts match the printed tables",
    LANGUAGE_GROUPS.filter((g) => g !== "regional").map((g) => `${g}:${languagesInGroup(g).length}`),
    ["common:8", "uncommon:9", "rare:15"]);
  // "Regional" is the fourth group and has no fixed membership — the
  // book leaves it to the GM, so the catalogue must NOT invent any.
  eq("A4 regional is a group with no printed members", languagesInGroup("regional"), []);
  ok("A5 and it is still offered as a group", LANGUAGE_GROUPS.includes("regional"));
  eq("A6 every catalogue name is reachable by name", allLanguageNames().length, PRINTED.length);
  // A player types what they type; the catalogue's spelling is what gets
  // stored, or two spellings of Dengaris become two languages.
  eq("A7 a name is canonicalised however it was typed", canonicalLanguage("  dEngaris "), "Dengaris");
  eq("A8 a campaign language keeps the spelling it was given",
    canonicalLanguage("Old Numarian"), "Old Numarian");
  eq("A9 and is rated regional rather than refused", languageRarity("Old Numarian"), "regional");
  eq("A10 a list parses on commas, whatever the spacing",
    parseLanguageList("Sharuk ,  Low Tongue,Gaian "), ["Sharuk", "Low Tongue", "Gaian"]);
}

/* ================================================================== *
 * B. THE ALLOWANCE
 * ================================================================== */
const countFor = (allowance, pattern) => (allowance.sources ?? [])
  .filter((s) => pattern.test(String(s.label ?? "")))
  .reduce((sum, s) => sum + s.count, 0);

{
  // "With a positive Intelligence score, you gain an extra number of
  // languages equal to its value."
  eq("B1 Intelligence adds its own value in slots",
    [0, 1, 3, 5].map((int) => languageAllowance({ intelligence: int }).total), [0, 1, 3, 5]);
  eq("B2 and a negative score takes none away",
    languageAllowance({ intelligence: -3 }).total, 0);

  // "Furthermore, for every 5 skill ranks you have in the Linguistics
  // skill, you may learn an additional language."
  eq("B3 Linguistics grants one language per five ranks",
    [0, 4, 5, 9, 10, 14, 20].map((ranks) => languageAllowance({ linguisticsRanks: ranks }).total),
    [0, 0, 1, 1, 2, 2, 4]);
  eq("B4 the rate is the printed five", RANKS_PER_LANGUAGE, 5);

  // Linguist "in addition to the one you normally get for every 5 ranks"
  // — a rate, not a number, and worth nothing until the fifth rank.
  eq("B5 Linguist doubles the rate rather than adding a language",
    [0, 4, 5, 10].map((ranks) =>
      languageAllowance({ linguisticsRanks: ranks, featureNames: ["Linguist"] }).total),
    [0, 0, 2, 4]);
  eq("B6 and adds nothing to a character with no ranks",
    languageAllowance({ intelligence: 2, featureNames: ["Linguist"] }).total, 2);

  // The two flat feats.
  eq("B7 Language Master grants two", countFor(
    languageAllowance({ featureNames: ["Language Master"] }), /Language Master/), 2);
  eq("B8 Polyglot Savant grants two", countFor(
    languageAllowance({ featureNames: ["Polyglot Savant"] }), /^Polyglot Savant$/), 2);
  eq("B9 Polyglot Savant's two are held to common and uncommon",
    LANGUAGE_FEAT_GRANTS["polyglot savant"].from, ["common", "uncommon"]);
  ok("B10 Language Master's two are held to nothing",
    LANGUAGE_FEAT_GRANTS["language master"].unrestricted === true,
    "the feat states no restriction, so none is invented");
  // "…and if you take the Linguist feat, you automatically gain an
  // additional language." Polyglot Savant and Lys-Fod word it the same.
  eq("B11 Polyglot Savant's Linguist clause pays only with Linguist held",
    languageAllowance({ featureNames: ["Polyglot Savant"] }).total, 2);
  eq("B12 and pays when it is",
    languageAllowance({ featureNames: ["Polyglot Savant", "Linguist"] }).total, 3);
  eq("B13 a heritage's own Linguist clause is carried, not hard-coded",
    languageAllowance({
      featureNames: ["Linguist"], linguistBonuses: [{ label: "Lys-Fod", count: 1 }]
    }).total, 1);
  eq("B14 and pays nothing without Linguist",
    languageAllowance({ linguistBonuses: [{ label: "Lys-Fod", count: 1 }] }).total, 0);

  // Race, heritage and background slots.
  eq("B15 a choice grant contributes its own count",
    languageAllowance({ choiceGrants: [{ label: "Diplomat", spec: "2 common|uncommon|rare|regional" }] }).total, 2);
  eq("B16 a malformed spec contributes nothing rather than guessing",
    languageAllowance({ choiceGrants: [{ label: "Broken", spec: "some languages" }] }).total, 0);
  eq("B17 the sources are itemised, because the panel has to say WHY",
    languageAllowance({
      intelligence: 2, linguisticsRanks: 10, featureNames: ["Language Master"],
      choiceGrants: [{ label: "Diplomat", spec: "2 common", scope: "free" }]
    }).sources.map((s) => `${s.label}=${s.count}`),
    ["Diplomat=2", "Intelligence +2=2", "Linguistics 10 ranks=2", "Language Master=2"]);
  eq("B18 and they add up to the total", languageAllowance({
    intelligence: 2, linguisticsRanks: 10, featureNames: ["Language Master"],
    choiceGrants: [{ label: "Diplomat", spec: "2 common", scope: "free" }]
  }).total, 8);
}

/* ================================================================== *
 * C. THE THREE RULINGS
 * ================================================================== */
{
  // 2 AUGUST, FIRST: the racial restriction binds at 1st level only, so
  // the allowance is two kinds of slot rather than one number.
  const ranked = languageAllowance({ intelligence: 2, linguisticsRanks: 5 });
  eq("C1 Intelligence slots are racially scoped",
    ranked.sources.find((s) => /Intelligence/.test(s.label))?.scope, "racial");
  eq("C2 Linguistics slots are free picks, earned in play",
    ranked.sources.find((s) => /Linguistics/.test(s.label))?.scope, "free");
  eq("C3 and a feat's are free too",
    languageAllowance({ featureNames: ["Language Master"] })
      .sources.find((s) => /Language Master/.test(s.label))?.scope, "free");

  // 3 AUGUST: a BACKGROUND's slots are free picks — upbringing, not
  // bloodline, and the Diplomat's whole trade is foreign tongues.
  eq("C4 a background's slots are free", languageAllowance({
    choiceGrants: [{ label: "Diplomat", spec: "2 common", scope: "free" }]
  }).sources[0].scope, "free");
  eq("C5 while a race's are held to the list it names", languageAllowance({
    choiceGrants: [{ label: "Human", spec: "1 regional" }]
  }).sources[0].scope, "racial");

  // 2 AUGUST, SECOND: the Intelligence allowance TRACKS the score rather
  // than locking at 1st level, so a rebuild corrects itself.
  eq("C6 raising Intelligence raises the allowance", languageAllowance({ intelligence: 4 }).total, 4);

  // The allowed SET, not a free choice: "from your character's racial
  // list or from those offered by your region".
  const named = (spec) => [...resolveAllowedLanguages(spec).names].map((n) => n.toLowerCase());
  ok("C7 a group brings its whole group", named("common").length === 8);
  ok("C8 a group plus a named exception keeps both",
    named("common, Gaelic").includes("gaelic") && named("common, Gaelic").length === 9,
    "the Gnome's exception is a RARE language, and a groups-only reading loses it");
  eq("C9 a choice spec parses into a count and a range",
    parseLanguageChoice("2 common|uncommon"), { count: 2, from: ["common", "uncommon"] });
}

/* ================================================================== *
 * D. THE PANEL'S OWN ARITHMETIC
 * ================================================================== */
{
  const allowance = languageAllowance({ intelligence: 2 });
  const allowed = resolveAllowedLanguages("common").names;
  const state = languageState({
    coreGrants: [{ label: "Dwarf", languages: "Dengaris, Low Tongue" }],
    chosen: "Aelvish, Munblish",
    allowance,
    allowedNames: allowed
  });
  eq("D1 core languages are kept apart from chosen ones",
    state.core.map((c) => c.name), ["Dengaris", "Low Tongue"]);
  eq("D2 and carry the race that granted them", state.core[0].source, "Dwarf");
  eq("D3 chosen languages are what the allowance is spent on", state.spent, 2);
  eq("D4 with the remainder shown", state.remaining, 0);
  eq("D5 and everything known listed once",
    state.known, ["Dengaris", "Low Tongue", "Aelvish", "Munblish"]);

  // A FREE LANGUAGE IS NOT A SECOND LANGUAGE. Picking one your race
  // already gave you must not cost a slot.
  eq("D6 a chosen language that is already core costs nothing", languageState({
    coreGrants: [{ label: "Dwarf", languages: "Dengaris" }],
    chosen: "Dengaris, Aelvish",
    allowance,
    allowedNames: allowed
  }).spent, 1);

  // OVER-ALLOWANCE IS REPORTED, NEVER PREVENTED: "Your GM may allow you
  // to select different languages based upon the campaign."
  const over = languageState({
    chosen: "Aelvish, Munblish, Glimbol",
    allowance: languageAllowance({ intelligence: 1 }),
    allowedNames: allowed
  });
  eq("D7 going over the allowance is counted", over.over, 2);
  eq("D8 and the picks are still kept", over.chosen.length, 3);
  eq("D9 remaining never goes negative", over.remaining, 0);

  // OFF THE RACIAL LIST IS NOT THE SAME AS WRONG. A pick outside the
  // race's list is flagged only when no free slot could account for it.
  const resolveRange = (groups) => resolveAllowedLanguages(groups.join(", ")).names;
  const covered = languageState({
    chosen: "Abyssal",
    allowance: languageAllowance({ linguisticsRanks: 5 }),
    allowedNames: resolveAllowedLanguages("common").names,
    racialNames: resolveAllowedLanguages("common").names,
    resolveRange
  });
  eq("D10 a free slot covers an off-list pick", covered.unknown, []);
  ok("D11 which is still reported as off the racial list",
    covered.offRacial.includes("Abyssal"),
    "the panel says where a pick came from; it does not accuse");
  const uncovered = languageState({
    chosen: "Abyssal",
    allowance: languageAllowance({ intelligence: 1 }),
    allowedNames: resolveAllowedLanguages("common").names,
    racialNames: resolveAllowedLanguages("common").names,
    resolveRange
  });
  eq("D12 with no free slot to sit in, it is flagged", uncovered.unknown, ["Abyssal"]);
  eq("D13 and the racial and free slots are counted separately",
    [uncovered.racialSlots, uncovered.freeSlots], [1, 0]);
}

/* ================================================================== *
 * E. THE PACK SIDE — every race declares what the book gives it
 * ================================================================== */
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "races"), {
    keyEncoding: "utf8", valueEncoding: "json"
  });
  await db.open();
  const races = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.type === "race") races.push(value);
    }
  } finally { await db.close(); }

  ok("E1 the races pack was read", races.length >= 8, `${races.length} races`);
  eq("E2 every race declares its core languages",
    races.filter((r) => !String(r.system?.coreLanguages ?? "").trim()).map((r) => r.name), []);
  eq("E3 and every race declares what else it may choose from",
    races.filter((r) => !String(r.system?.additionalLanguages ?? "").trim()).map((r) => r.name), []);
  // A declaration that resolves to nothing is the same as no declaration
  // — and so is one that resolves only to prose. `resolveAllowedLanguages`
  // keeps an unrecognised entry as a campaign language, which is right for
  // a PLAYER typing "Old Numarian" and wrong for a race's own spec: "any
  // of the usual" would read as a language nobody speaks. So the test is
  // that at least one CATALOGUE language comes back.
  const thin = races.filter((r) =>
    ![...resolveAllowedLanguages(r.system.additionalLanguages).names]
      .some((name) => Boolean(LANGUAGES[name])));
  eq("E4 every additional-language spec resolves to real languages",
    thin.map((r) => `${r.name}: "${r.system.additionalLanguages}"`), []);
  const unknownCore = [];
  for (const race of races) {
    for (const name of parseLanguageList(race.system.coreLanguages)) {
      if (!LANGUAGES[canonicalLanguage(name)]) unknownCore.push(`${race.name}: ${name}`);
    }
  }
  eq("E5 and every core language is one of the 32 the book names", unknownCore, []);
  // The Orc of page 31, checked by name because it is this block's race.
  const orc = races.find((r) => r.name === "Orc");
  eq("E6 the Orc's core language is Sharuk", String(orc?.system?.coreLanguages ?? "").trim(), "Sharuk");
  ok("E7 and its additional languages are the common group",
    resolveAllowedLanguages(orc?.system?.additionalLanguages).names.size === 8,
    "'Choose from any common language'");
}

console.log(`verify-languages: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-languages: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-languages: all pass");
