#!/usr/bin/env node
/**
 * verify-chapter2 — the races on pages 18-30 of Core 3.8.
 *
 * NEW at 3.552.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FILE THE CODE ALREADY CLAIMED EXISTED.
 *
 * `module/conditionals.mjs:222` says, of a pack entry that fails to
 * normalise: "The harness (tools/verify-races.mjs) is what makes a
 * dropped entry loud at build time." There was no such file. Nor was
 * there `verify-forbidden-traditions.mjs`, named at
 * `module/magic/tradition-gate.mjs:38` as the check keeping the
 * divine/`divinity` spelling trap dead. Both were lost with the container
 * and never rebuilt, and both were still being cited as though they ran.
 *
 * That is the exact shape that let the Halfling double-count ship: a rule
 * believed to be watched, and not watched.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS PINS. The pages 18-30 audit found the racial and heritage
 * mechanics to be genuinely automated and almost entirely unpinned — 41
 * heritages, 16 racial abilities, every language field and every
 * specialist-skill grant, none of them read by any harness. This drives
 * the numbers that are printed in the book, and asserts that every
 * conditional in the two packs survives `normaliseConditional`, which is
 * the silent failure the cited file was supposed to catch.
 *
 * It also pins the five defects the audit found and 3.552.0 fixed, so
 * none of them can come back quietly:
 *   D1  the beneficial-spell save belongs to the ability that prints it
 *   D2  Sorini grants Scent
 *   D4  the terrain rule is reachable by a heritage
 *   D6  Gnome Resistance triggers on spells only
 *   D10 a "cantrip" chooser offers cantrips
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

import { normaliseConditional, matchesCheck } from "../module/conditionals.mjs";
import { languageAllowance, resolveAllowedLanguages } from "../module/languages.mjs";
import { RACIAL_PP_PER_LEVEL, HERITAGE_PP_PER_LEVEL } from "../module/racial-pp.mjs";
import { saveAdvantageDecision } from "../module/combat/save-advantage.mjs";
import { wildStrideCost, ignoresDifficultTerrain } from "../module/combat/passive-feats.mjs";
import { beneficialSaveTraditionsOf, forbiddenTraditionsOf } from "../module/magic/tradition-gate.mjs";
import { beneficialSaveRequired } from "../module/magic/beneficial-save.mjs";
import { isCantripSpell } from "../module/magic/casting.mjs";
import { firstLevelChoiceRefusal } from "../module/feats.mjs";

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
    for await (const [key, value] of db.iterator()) rows.push({ key, ...value });
  } finally {
    await db.close();
  }
  return rows;
}

const races = await dump("races");
const heritages = await dump("heritages");
const abilities = await dump("abilities");
const feats = await dump("feats");
const spells = await dump("spells");
// Read for J7's classification of the spell choosers: a class's own pick
// (the Bard's, the Druid's) is made when the class feature arrives, not
// at 1st level.
const classes = await dump("classes");
// Read for I11d–I11f: the population the Apply Grants nudge can ever
// name is whatever the four FOUNDATION types grant.
const backgrounds = await dump("backgrounds");
const origins = await dump("origins");
const FOUNDATION_TYPES = ["race", "heritage", "background", "origin"];

const byName = (rows, name, type = null) =>
  rows.find((r) => r.name === name && (type === null || r.type === type));
const flagsOf = (row) => row?.flags?.["trg-prime"] ?? {};

/* ================================================================== *
 * A. EVERY CONDITIONAL IN BOTH PACKS SURVIVES NORMALISATION
 *
 * The silent failure the cited-but-missing harness existed for: a zero
 * value, a missing `kind`, a renamed axis, and the entry is dropped on
 * the floor. The rule then costs nothing and says nothing.
 * ================================================================== */
{
  const carriers = [...races, ...heritages, ...abilities];
  let seen = 0;
  const dropped = [];
  for (const row of carriers) {
    const entries = flagsOf(row).conditionals;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      seen += 1;
      if (!normaliseConditional(entry)) dropped.push(`${row.name}: ${entry?.label ?? "(unlabelled)"}`);
    }
  }
  ok("A1 the race, heritage and ability packs carry conditionals at all", seen > 30,
    `found ${seen}`);
  eq("A2 none of them is silently dropped by normaliseConditional", dropped, []);
}

/* ================================================================== *
 * B. THE PRINTED NUMBERS ON THE RACIAL ABILITIES
 *
 * Driven through `matchesCheck`, which is what decides at roll time, so
 * a rule scoped to the wrong axis fails here rather than at the table.
 * ================================================================== */
{
  const conditionalsOf = (name) =>
    (flagsOf(byName(abilities, name, "ability")).conditionals ?? []).map(normaliseConditional).filter(Boolean);

  const firing = (entries, context) => entries.filter((e) => matchesCheck(e, context));

  // Dwarf, Hardy: "+2 racial bonus on saving throws against poison and magic"
  const hardy = conditionalsOf("Hardy");
  ok("B1 Hardy is authored", hardy.length > 0);
  const hardyPoison = firing(hardy, { checkType: "save", traits: "poison" });
  eq("B2 Hardy gives +2 against poison", hardyPoison.map((e) => e.value), [2]);
  eq("B3 ...as a race bonus", hardyPoison.map((e) => e.type), ["race"]);
  const hardyMagic = firing(hardy, { checkType: "save", traditions: "arcane" });
  eq("B4 Hardy gives +2 against magic", hardyMagic.map((e) => e.value), [2]);
  ok("B5 Hardy does not fire on an ordinary skill check",
    firing(hardy, { checkType: "skill", subject: "athletics" }).length === 0);

  // Dwarf, Lead Boots: "-4 racial penalty to all swim checks"
  const boots = conditionalsOf("Lead Boots");
  const swimming = firing(boots, { checkType: "skill", subject: "athletics", actionKey: "swim" });
  eq("B6 Lead Boots is -4 on Swim", swimming.map((e) => e.value), [-4]);
  ok("B7 Lead Boots does not fire on Climb",
    firing(boots, { checkType: "skill", subject: "athletics", actionKey: "climb" })
      .filter((e) => e.auto).length === 0);

  // Gnome, Detect Magic: "+2 racial bonus to all Sense Power checks"
  const detect = conditionalsOf("Detect Magic");
  eq("B8 Detect Magic is +2 on Sense Power (Broad)",
    firing(detect, { checkType: "skill", actionKey: "senseMagicBroad" }).map((e) => e.value), [2]);
  eq("B9 ...and on Sense Power (Focused)",
    firing(detect, { checkType: "skill", actionKey: "senseMagicFocused" }).map((e) => e.value), [2]);

  // Halfling, Extremely Nimble: "+2 racial bonus to all Balance and Sneak checks"
  const nimble = conditionalsOf("Extremely Nimble");
  eq("B10 Extremely Nimble is +2 on Balance",
    firing(nimble, { checkType: "skill", actionKey: "balance" }).filter((e) => e.auto).map((e) => e.value), [2]);
  eq("B11 ...and +2 on Sneak",
    firing(nimble, { checkType: "skill", actionKey: "sneak" }).filter((e) => e.auto).map((e) => e.value), [2]);

  // Halfling, Foolhardy: "advantage to all fear-based saving throws"
  const foolhardy = conditionalsOf("Foolhardy");
  const feared = firing(foolhardy, { checkType: "save", traits: "fear" }).filter((e) => e.auto);
  eq("B12 Foolhardy is an advantage, not a modifier", feared.map((e) => e.kind), ["advantage"]);

  // Elf, Fey Blood: "advantage to all saving throws made against sleep magic"
  const fey = conditionalsOf("Fey Blood");
  eq("B13 Fey Blood is advantage against sleep",
    firing(fey, { checkType: "save", traits: "sleep" }).filter((e) => e.auto).map((e) => e.kind), ["advantage"]);
}

/* ================================================================== *
 * C. THE EFFECT-BORNE BONUSES, READ OFF THE PACK
 *
 * These are ActiveEffect changes rather than conditionals, so the number
 * is asserted where it is written.
 * ================================================================== */
{
  const changeValue = (rows, owner, key) => {
    const effects = rows.filter((r) => r.type === "base" && Array.isArray(r.changes));
    for (const effect of effects) {
      if (!String(effect.name ?? "").startsWith(owner)) continue;
      const hit = effect.changes.find((c) => c.key === key);
      if (hit) return Number(hit.value);
    }
    return null;
  };

  // Elf, Keen Senses: "a special +1 racial bonus to your Perception Skill"
  eq("C1 Keen Senses is +1 Perception",
    changeValue(abilities, "Keen Senses", "system.skills.perception.racial"), 1);

  // Kornargon, Skilled in Shadow: "+1 racial bonus to the Planes and Stealth skills"
  eq("C2 Skilled in Shadow is +1 Planes",
    changeValue(abilities, "Skilled in Shadow", "system.skills.planes.racial"), 1);
  eq("C3 ...and +1 Stealth",
    changeValue(abilities, "Skilled in Shadow", "system.skills.stealth.racial"), 1);

  // Heritages that CANCEL a racial penalty. The arithmetic is what
  // matters: the heritage line plus the race line must equal the printed
  // net, and modelling it additively is what keeps that true.
  const racialMod = (rows, owner, ability) =>
    changeValue(rows, owner, `system.attributes.${ability}.racial`);

  eq("C4 Drelvarni adds Con +1 to the Elf's -1 (net 0)",
    racialMod(heritages, "Drelvarni", "constitution"), 1);
  eq("C5 Erui-Iar adds Wis +1 to the Kornargon's -1 (net 0)",
    racialMod(heritages, "Erui-Iar", "wisdom"), 1);
  eq("C6 Gul-Fyr takes the Halfling's Con +1 back to 0",
    racialMod(heritages, "Gul-Fyr", "constitution"), -1);
  eq("C7 ...and gives Int +1",
    racialMod(heritages, "Gul-Fyr", "intelligence"), 1);
  eq("C8 Nerini swaps the Gnome's Cha for Wis — Wis +1",
    racialMod(heritages, "Nerini", "wisdom"), 1);
  eq("C9 ...and Cha -1, for a net Wis +1 / Cha 0",
    racialMod(heritages, "Nerini", "charisma"), -1);
}

/* ================================================================== *
 * D. PER-LEVEL GRANTS
 *
 * Stout-Fyr's HP is the one per-level row no harness read — its value is
 * written inline in PP_GRANTS rather than sourced from racial-pp.mjs,
 * which is the same flat-vs-per-level shape the Sharuk-Xal incident cost.
 * ================================================================== */
{
  eq("D1 Urloch grants 1 PP per level", HERITAGE_PP_PER_LEVEL.urloch, 1);
  eq("D2 Gul-Fyr grants 1 PP per level", HERITAGE_PP_PER_LEVEL["gul-fyr"], 1);
  eq("D3 Fey grants 1 PP per level", HERITAGE_PP_PER_LEVEL.fey, 1);

  const workflow = strip(read("module", "feats-workflow.mjs"));
  ok("D4 Stout-Fyr grants HP per level, not a flat lump",
    /\{ heritage: "Stout-Fyr", stat: "hp", value: 1 \}/.test(workflow),
    "the row exists and the value is 1");
  ok("D5 ...and that row is charged per level like its PP siblings",
    /due: \(actor\) => value \* racialPPLevels\(actor\)/.test(workflow),
    "a flat grant here is the Sharuk-Xal error");

  // The eight races, against the printed Power Points column.
  const printedPP = { ascendan: 1, dwarf: 0, elf: 1, gnome: 1, halfling: 0, human: 0, kornargon: 0, orc: -1 };
  for (const [race, pp] of Object.entries(printedPP)) {
    eq(`D6 ${race} Power Points per level`, RACIAL_PP_PER_LEVEL[race], pp);
  }
}

/* ================================================================== *
 * E. LANGUAGES (p20, and Graham's ruling of 10 September 2026)
 *
 * Page 20 prints "If your Intelligence ability modifier is 5 or higher";
 * Chapter 2's own Bonus Languages section prints "With a positive
 * Intelligence score, you gain an extra number of languages equal to its
 * value". Graham ruled page 20 a typo: it should read 1 or higher. The
 * code already implemented Chapter 2, so the ruling changed nothing —
 * which is exactly why it needs pinning rather than remembering.
 * ================================================================== */
{
  const intSlots = (intelligence) => {
    const sources = languageAllowance({ intelligence, linguisticsRanks: 0, sources: [] })?.sources ?? [];
    const hit = sources.find((s) => /Intelligence/i.test(String(s.label ?? "")));
    return hit ? Number(hit.count) : 0;
  };
  eq("E1 Intelligence 0 grants no extra languages", intSlots(0), 0);
  eq("E2 Intelligence 1 grants one", intSlots(1), 1);
  eq("E3 Intelligence 3 grants three", intSlots(3), 3);
  eq("E4 Intelligence 5 grants five", intSlots(5), 5);
  ok("E5 a negative Intelligence takes none away", intSlots(-2) === 0);

  // Every race declares its core languages; nothing is silently blank.
  for (const race of races.filter((r) => r.type === "race")) {
    ok(`E6 ${race.name} declares core languages`,
      String(race.system?.coreLanguages ?? "").trim().length > 0);
  }

  // The shapes a groups-only model would have quietly dropped: a group
  // PLUS a specific language that is not in it. `names` is a Set, so it
  // is asked rather than serialised — the first draft of this check
  // JSON.stringify'd it, got "{}", and accused working code.
  const named = (spec) => Array.from(resolveAllowedLanguages(spec).names).map((n) => String(n).toLowerCase());

  const gnome = byName(races, "Gnome", "race");
  ok("E7 the Gnome's 'any common language and Gaelic' keeps the rare name",
    named(gnome.system.additionalLanguages).includes("gaelic"),
    `Gaelic is rare, and would be lost by a groups-only reading — got ${named(gnome.system.additionalLanguages).length} names`);

  const dwarf = byName(races, "Dwarf", "race");
  ok("E8 the Dwarf's 'any common language and Gaian' keeps the uncommon name",
    named(dwarf.system.additionalLanguages).includes("gaian"));

  const elf = byName(races, "Elf", "race");
  ok("E9 the Elf keeps both of its named exceptions",
    named(elf.system.additionalLanguages).includes("faechant")
    && named(elf.system.additionalLanguages).includes("gaelic"));

  ok("E10 a group still brings its whole group in",
    named("common").length >= 8, `${named("common").length} common languages`);
}

/* ================================================================== *
 * F. SPECIALIST SKILLS
 * ================================================================== */
{
  const printed = {
    Ascendan: "Ascendan Lore, Dragon Lore",
    Dwarf: "Dwarven Lore, Stone Lore",
    Elf: "Elven Lore",
    Gnome: "Fey Lore, Gnome Lore",
    Halfling: "Halfling Lore",
    Kornargon: "Kornargon Lore, Shadow Lore"
  };
  for (const [race, list] of Object.entries(printed)) {
    eq(`F1 ${race} specialist skills`, byName(races, race, "race")?.system?.specialistSkills, list);
  }
  // Human's is a CHOICE ("lore based upon your ethnicity"), and is the one
  // race whose field is empty. Recorded as a known gap rather than
  // asserted either way — see the audit's D3.
  eq("F2 Human's ethnicity lore is still unbuilt (known gap, audit D3)",
    byName(races, "Human", "race")?.system?.specialistSkills, "");
}

/* ================================================================== *
 * G. THE FIVE DEFECTS 3.552.0 FIXED
 * ================================================================== */
{
  const asItem = (row) => ({ name: row.name, flags: row.flags ?? {} });

  // D1 — the beneficial-spell save belongs to the ability that prints it.
  const forbiddenMagic = byName(abilities, "Forbidden Magic", "ability");
  const nerini = byName(heritages, "Nerini", "heritage");
  const ascendanActor = { items: [asItem(forbiddenMagic)], effects: [] };
  const nerinActor = { items: [asItem(nerini)], effects: [] };

  eq("G1 the Ascendan's Forbidden Magic imposes the beneficial-spell save",
    beneficialSaveTraditionsOf(ascendanActor).map((f) => f.tradition).sort(),
    ["divinity", "verdant"]);
  eq("G2 a Nerini gnome does NOT — it prints no such clause",
    beneficialSaveTraditionsOf(nerinActor), [],
    "reading it off `forbiddenTraditions` made a Nerini roll to be healed");
  eq("G3 ...while still being unable to CAST those traditions",
    forbiddenTraditionsOf(nerinActor).map((f) => f.tradition).sort(),
    ["ethereal", "verdant"]);

  // DRIVEN THROUGH THE CONSUMER, not just the resolver. The first draft
  // asserted only `beneficialSaveTraditionsOf`, and mutate-chapter2's G1
  // walked past it by swapping the call inside beneficialSaveRequired —
  // the resolver stayed right and the rule stayed wrong. This is the
  // question the workflow actually asks.
  const healingSpell = {
    tradition: "verdant",
    effects: [{ kind: "heal", formula: "2d8" }]
  };
  ok("G3a a verdant heal is recognised as beneficial at all",
    beneficialSaveRequired(ascendanActor, healingSpell).required === true,
    "an Ascendan must roll for it — that is the printed clause");
  ok("G3b a Nerini gnome is healed without rolling for permission",
    beneficialSaveRequired(nerinActor, healingSpell).required === false,
    "this is the defect: an unprinted Will save cancelling a heal");
  const arcaneHeal = { tradition: "arcane", effects: [{ kind: "heal", formula: "2d8" }] };
  ok("G3c and a tradition nobody forbids never asks",
    beneficialSaveRequired(ascendanActor, arcaneHeal).required === false);

  // D2 — Sorini grants Scent, and Scent is a wired sense.
  eq("G4 Sorini grants Scent", byName(heritages, "Sorini", "heritage")?.system?.racialAbilities, "Scent");
  const scent = byName(abilities, "Scent", "ability");
  eq("G5 ...and Scent declares a secondary olfactory sense",
    flagsOf(scent)?.creatureAbility?.derives?.sense?.category, "secondary");

  // D4 — the terrain rule is reachable by a heritage.
  ok("G6 Wild Stride declares the terrain flag",
    flagsOf(byName(feats, "Wild Stride", "feat")).ignoresDifficultTerrain === true);
  ok("G7 Silvarni declares it too — the heritage that prints the same rule",
    flagsOf(byName(heritages, "Silvarni", "heritage")).ignoresDifficultTerrain === true);
  const flagged = { flags: { "trg-prime": { ignoresDifficultTerrain: true } } };
  ok("G8 the rule reads the flag off an ITEM",
    ignoresDifficultTerrain({ items: [flagged], effects: [] }),
    "keying it on the feat NAME is what left Silvarni unable to reach it");
  ok("G8a ...and off an EFFECT, which is how a heritage carries it",
    ignoresDifficultTerrain({ items: [], effects: [flagged] }),
    "a transferred effect is one of the two carriers, and the one Silvarni uses");
  ok("G8b ...and a disabled effect does not count",
    !ignoresDifficultTerrain({ items: [], effects: [{ ...flagged, disabled: true }] }));
  ok("G8c nothing flagged, nothing eased",
    !ignoresDifficultTerrain({ items: [{ flags: {} }], effects: [] }));
  eq("G9 difficult terrain (2x) is eased to normal",
    wildStrideCost({ cost: 20, distance: 10, eases: true }), { cost: 10, eased: true });
  eq("G10 formidable terrain (3x) is eased to difficult (2x)",
    wildStrideCost({ cost: 30, distance: 10, eases: true }), { cost: 20, eased: true });
  eq("G11 without the flag, nothing is eased",
    wildStrideCost({ cost: 20, distance: 10, eases: false }), { cost: 20, eased: false });
  eq("G12 magical terrain is never eased",
    wildStrideCost({ cost: 20, distance: 10, eases: true, magical: true }), { cost: 20, eased: false });

  // D6 — Gnome Resistance triggers on spells only.
  const gnomeResist = flagsOf(byName(abilities, "Gnome Resistance", "ability")).saveReaction;
  ok("G13 Gnome Resistance declares its spell trigger", gnomeResist?.spellOnly === true,
    "it prints 'when targeted by a spell'");
  ok("G14 ...and its area exemption", gnomeResist?.areaExempt === true);
  const decide = (isSpell, isArea) => saveAdvantageDecision({
    entries: [gnomeResist], save: "fortitude", isSpell, isArea, reactions: 1, featNames: []
  });
  ok("G15 it is offered on a spell's save", Boolean(decide(true, false).chosen));
  ok("G16 it is held on a save no spell forced", !decide(false, false).chosen);
  ok("G17 ...for the printed reason",
    /only triggers when a spell targets you/.test(decide(false, false).held.map((h) => h.reason).join(" ")));
  ok("G18 it is still held on an area spell", !decide(true, true).chosen);
  ok("G19 a reaction that declares no trigger keeps the any-source behaviour",
    Boolean(saveAdvantageDecision({
      entries: [{ label: "Evasion", save: "reflex" }], save: "reflex", isSpell: false, reactions: 1, featNames: []
    }).chosen),
    "Evasion and its kin print no spell trigger and must not be narrowed");

  // D10 — a "cantrip" chooser offers cantrips.
  const workflow = strip(read("module", "feats-workflow.mjs"));
  const casting = strip(read("module", "magic", "casting.mjs"));
  ok("G20 the one cantrip test lives where Node can reach it",
    /export function isCantripSpell\(spell\)/.test(casting) &&
      !/function isCantripSpell/.test(workflow),
    "the test must be importable on its own — feats-workflow drags in Foundry globals");
  ok("G20a and every cantrip chooser routes through it",
    /import \{[^}]*isCantripSpell[^}]*\} from "\.\/magic\/casting\.mjs";/.test(workflow) &&
      (workflow.match(/isCantripSpell\(s\)/g) ?? []).length >= 6,
    "six choosers filtered on PP 0 alone and five of them offered Guidance");
  // DRIVEN, not read. Both halves of the test matter and each is asked
  // for on its own, because a mutation that drops either one is a real
  // regression a source regex would sail past.
  const spellLike = (ppCost, traits) => ({ system: { ppCost, traits } });
  ok("G21 a PP-0 spell carrying the Cantrip trait is a cantrip",
    isCantripSpell(spellLike(0, "Cantrip, Invocation")) === true);
  ok("G21a a PP-0 spell WITHOUT the Cantrip trait is not — this is Guidance",
    isCantripSpell(spellLike(0, "Insight")) === false,
    "PP 0 and cantrip are not the same set");
  ok("G21b a costed spell is not a cantrip however it is traited",
    isCantripSpell(spellLike(2, "Cantrip")) === false,
    "Arcane Knowledge prints 'cantrip (PP 0)', so the cost is part of its own rule");
  ok("G21c a spell with no cost recorded is not assumed to be one",
    isCantripSpell(spellLike(undefined, "Cantrip")) === false);

  // Driven against the pack: exactly one PP-0 spell is not a cantrip.
  const ppZero = spells.filter((s) => s.type === "spell" && Number(s.system?.ppCost) === 0);
  const notCantrips = ppZero.filter((s) => !/\bcantrip\b/i.test(String(s.system?.traits ?? "")));
  ok("G22 the pack still holds PP-0 spells to choose from", ppZero.length > 20, `${ppZero.length}`);
  eq("G23 and exactly one of them is not a cantrip",
    notCantrips.map((s) => s.name), ["Guidance"]);
}

/* ================================================================== *
 * H. HERITAGE / RACE PAIRING
 * ================================================================== */
{
  const list = heritages.filter((h) => h.type === "heritage");
  eq("H1 the pack holds 45 heritages", list.length, 45);
  const blank = list.filter((h) => !String(h.system?.sourceRace ?? "").trim());
  eq("H2 every one declares which race it belongs to", blank.map((h) => h.name), [],
    "a blank sourceRace passes the picker filter for every race");

  const raceNames = new Set(races.filter((r) => r.type === "race").map((r) => r.name.toLowerCase()));
  const orphans = list.filter((h) =>
    !String(h.system.sourceRace).split(",").some((n) => raceNames.has(n.trim().toLowerCase())));
  eq("H3 and that race exists", orphans.map((h) => h.name), []);

  const picker = strip(read("module", "picker-filters.mjs"));
  ok("H4 the picker filters heritages by source race",
    /case "heritage":\s*return \(entry\) => matchesSource\(entry\.system\?\.sourceRace, race\);/.test(picker),
    "without it an Ascendan is offered Dwarf heritages");
  ok("H5 the slot asks the index for sourceRace",
    /fields: \[[^\]]*"system\.sourceRace"/.test(picker),
    "an unrequested index field reads undefined for every entry, which passes everyone");
}

/* ================================================================== *
 * I. THE FOUR REMAINING AUDIT DEFECTS, fixed at 3.552.0.
 *
 * D3  a Human never got their ethnicity lore
 * D7  Shadow Stance applied Concealed with no clock on it
 * D8  a race's granted Use action was never mentioned on the card
 * D11 Storgar's forced-movement clause reached only Shove
 * ================================================================== */
{
  const human = byName(races, "Human", "race");
  const choice = flagsOf(human).specialistChoice;
  ok("I1 the Human declares an ethnicity-lore choice", Boolean(choice),
    "page 28 prints a specialist skill, and Human's specialistSkills field is empty by design");
  eq("I2 named as a lore", String(choice?.label ?? ""), "Ethnicity Lore");
  eq("I3 and suffixed the way the background choosers are", String(choice?.suffix ?? ""), "Lore");
  ok("I4 with a prompt and an example, since the player types the answer",
    Boolean(String(choice?.prompt ?? "").trim()) && Boolean(String(choice?.placeholder ?? "").trim()));
  ok("I5 the Human's own Use button reaches the chooser",
    /"human": \{ hint: "[^"]+", use: useBackground \}/.test(strip(read("module", "feats-workflow.mjs"))),
    "the flag alone grants nothing — something has to ask the question");

  const workflow = strip(read("module", "feats-workflow.mjs"));
  const stance = workflow.slice(workflow.indexOf('"shadow stance"'), workflow.indexOf('"adoptive race"'));
  ok("I6 Shadow Stance puts Concealed on a clock",
    /applyConditionTags\(actor, \[\{ key: "concealed", label: "Concealed" \}\], \{ expiresRound \}\)/.test(stance),
    "it printed 'until the start of your next turn' and applied a condition that never ended");
  ok("I7 counting to the START of the next round",
    /Number\(game\.combat\?\.round \?\? 0\) \+ 1/.test(stance));
  ok("I8 and nothing is invented out of combat",
    /const expiresRound = inCombat \? /.test(stance) && /: null;/.test(stance),
    "a stance entered in a corridor has no round to count to");
  ok("I9 the old untimed toggle is gone",
    !/toggleStatusEffect\("concealed"/.test(stance));

  const grants = strip(read("module", "grants-workflow.mjs"));
  // WIDENED AGAIN AT 3.553.0, and for the third time in the same place.
  // It read `type === "heritage"`, then `["race", "heritage"]`, and each
  // time the case it missed was the one that cost the most. Now it asks
  // every FOUNDATION type, because "did this identity item leave a choice
  // unmade" has nothing to do with which of the four it is — the Soldier's
  // Weapon Focus was the background that proved it.
  ok("I10 an identity item's own Use action is named on the Apply Grants card",
    /if \(FOUNDATION_ITEM_TYPES\.includes\(sourceItem\.type\)\) \{[\s\S]{0,600}?featAutomationHint/.test(grants),
    "a Human's only ability modifiers, and a Soldier's attack bonus, are behind a grant's own button");
  // FOUND IN LIVE TESTING, 15 Sep 2026 (3.552.3). Both of these were
  // true of all eight backgrounds and became false the moment a RACE
  // reached the same mechanism — which is the shape this whole section
  // exists for.
  ok("I11a the card names one button once",
    // Re-anchored at 3.665.0, which added a fourth choice flag
    // (specialistAlternative) that names its own button too.
    /const alreadyNamed = \["specialistChoice", "skillChoice", "spellChoice", "specialistAlternative"\]/.test(grants) &&
      /if \(!alreadyNamed && setupChoicePending\(actor, sourceItem\)\)/.test(grants),
    "the choice blocks already say 'press Use on <item>'; the generic nudge said it again, differently");
  const fw = strip(read("module", "feats-workflow.mjs"));
  ok("I11b and the specialist-choice card names the thing that actually carries the choice",
    /function carrierLabel\(item\)/.test(fw) &&
      /It leaves"\} with \$\{carrierLabel\(item\)\}/.test(fw),
    "a race's card told the player their lore leaves with a background they have not got");
  ok("I11c with a real answer for each identity type",
    /type === "background"\) return "the background";/.test(fw) &&
      /type === "race"\) return "the race";/.test(fw) &&
      /type === "heritage"\) return "the heritage";/.test(fw));

  ok("I11 and so is a Use action on something that identity item granted",
    /grantedBy\?\.sourceId !== sourceItem\.id\) continue;[\s\S]{0,300}?if \(!setupChoicePending\(actor, granted\)\) continue;/.test(grants),
    "Versatile's button is on the ability, not on the race; Weapon Focus's is on the feat, not on the Soldier");

  /*
   * I11d — THE SPLIT THE NUDGE TURNS ON (3.553.0).
   *
   * Graham's R1 ruling of 15 September 2026: nudge for a Use action that
   * RECORDS a choice, never for one you take in play. Both kinds are
   * granted by identity items, so the population is computed from the
   * packs rather than listed here — every feat or ability any race,
   * heritage, background or origin grants, that has a Use action at all —
   * and only the verdict for each is written down.
   *
   * Battle Medic and Quick Donning are the argument: both are granted by
   * backgrounds, both have buttons, and naming them on every Apply Grants
   * press is the noise that makes the Soldier's line get skimmed past.
   */
  const SETUP_VERDICT = {
    "arcane knowledge": true,
    "favoured terrain": true,
    "flawless performance": true,
    "magical crafting": true,
    "skill focus": true,
    "versatile": true,
    "weapon focus": true,
    "battle medic": false,
    "gnome resistance": false,
    "quick donning": false,
    "shadow stance": false
  };
  const hintFor = new Map(
    [...fw.matchAll(/\n {2}"([^"]+)": \{[\s\S]{0,260}?hint: "([^"]*)"/g)].map((m) => [m[1], m[2]])
  );
  const setupFlagged = new Set(
    [...fw.matchAll(/\n {2}"([^"]+)": \{[\s\S]{0,400}?\n {4}setup: true,/g)].map((m) => [m[1]][0])
  );
  const grantedNames = new Set();
  for (const row of [...races, ...heritages, ...backgrounds, ...origins]) {
    if (!FOUNDATION_TYPES.includes(row.type)) continue;
    for (const field of ["grantedFeats", "racialAbilities"]) {
      for (const name of String(row.system?.[field] ?? "").split(",")) {
        const trimmed = name.trim().toLowerCase();
        if (trimmed) grantedNames.add(trimmed);
      }
    }
  }
  const nudgeable = [...grantedNames].filter((n) => hintFor.has(n)).sort();
  ok("I11d the scan found the identity-granted Use actions", nudgeable.length >= 8,
    `found ${nudgeable.length}`);
  eq("I11e every one of them has a recorded verdict — a new one cannot join silently",
    nudgeable.filter((n) => !(n in SETUP_VERDICT)), []);
  eq("I11f and each is flagged setup exactly as the ruling says",
    nudgeable.filter((n) => setupFlagged.has(n) !== SETUP_VERDICT[n]), []);

  const storgar = byName(heritages, "Storgar", "heritage");
  ok("I12 Storgar carries a table prompt for involuntary movement",
    Boolean(String(flagsOf(storgar).involuntaryMovementNote ?? "").trim()),
    "R6: 'create this as a text prompt for the character… gauged at the time'");
  ok("I13 and still carries its Shove DC bonus, which is the automated half",
    (flagsOf(storgar).defenceDC ?? []).some((e) => Number(e?.value) === 2),
    "the prompt is for the routes with no contest to attach a bonus to, not a replacement");

  const forced = strip(read("module", "combat", "forced-movement.mjs"));
  ok("I14 the prompt is collected off a flag, not a name",
    /flags\?\.\["trg-prime"\]\?\.involuntaryMovementNote/.test(forced));
  ok("I15 from effects as well as items",
    /appliedEffects \?\? actor\?\.effects/.test(forced));
  const pushWorkflow = strip(read("module", "combat", "forced-movement-workflow.mjs"));
  ok("I16 and it reaches the card the push buttons are on",
    /export function pushButtonsHtml\(push, gridDistance = 5, prompts = \[\]\)/.test(pushWorkflow) &&
      /prompts \?\? \[\]/.test(pushWorkflow));
  const attack = strip(read("module", "combat", "attack-workflow.mjs"));
  const action = strip(read("module", "combat", "action-workflow.mjs"));
  ok("I17 on the critical-table push",
    /involuntaryMovementPrompts\(targetActor\)/.test(attack));
  ok("I18 and on the basic action's push",
    /involuntaryMovementPrompts\(targetActor\)/.test(action));
}

/* ================================================================== *
 * J. THE THREE RULINGS OF 15 SEPTEMBER 2026
 *
 * R2  a 1st-level choice is locked above 1st level, GM exempt
 * R3  Wash Away Sin runs d8 on both sides
 * R4  Shadow Stance's printed traits are Open and Stance — and the
 *     audit's "Open Stance is missing" was a misreading of that line
 * ================================================================== */
{
  /* ── R2: the gate, driven ─────────────────────────────────────── */
  eq("J1 a 1st-level character may change their choice",
    firstLevelChoiceRefusal({ level: 1, alreadyChosen: true, label: "Versatile" }), "");
  ok("J2 a higher-level player may not",
    firstLevelChoiceRefusal({ level: 12, alreadyChosen: true, label: "Versatile" })
      .includes("chosen at 1st level"));
  eq("J3 the GM always may",
    firstLevelChoiceRefusal({ level: 12, alreadyChosen: true, isGM: true, label: "Versatile" }), "");
  // A LOCK, NOT A TRAP. A Human who levelled without ever pressing Use
  // has no answer to change, and refusing them is the D8 defect again.
  eq("J4 a choice never made is never locked",
    firstLevelChoiceRefusal({ level: 12, alreadyChosen: false, label: "Versatile" }), "");
  ok("J5 and the refusal names the level, so it reads as a rule not a bug",
    /level 12/.test(firstLevelChoiceRefusal({ level: 12, alreadyChosen: true, label: "Versatile" })));

  const workflow = strip(read("module", "feats-workflow.mjs"));
  const versatile = workflow.slice(workflow.indexOf('"versatile"'), workflow.indexOf('"shadow stance"'));
  ok("J6 Versatile consults the gate before asking anything",
    /const refusal = firstLevelChoiceRefusal\(\{/.test(versatile) &&
      versatile.indexOf("firstLevelChoiceRefusal") < versatile.indexOf("chooseFromList"),
    "a gate that runs after the dialog is a gate the player has already answered");
  // AND THE REFUSAL ACTUALLY REFUSES. Asking where the call sits says
  // nothing about what its answer does: `if (refusal) { }` keeps the
  // call, keeps the order, and walks straight into the dialog.
  ok("J6a and a refusal stops the press rather than being computed and dropped",
    /if \(refusal\) \{\s*ui\.notifications\.warn\(refusal\);\s*return;\s*\}/.test(versatile));
  ok("J7 and decides 'already chosen' from the effect the chooser writes",
    /FEAT_SOURCE_FLAG\) === item\.id/.test(versatile));

  // EXTENDED TO THE CANTRIP CHOOSERS, 15 Sep 2026: "R2 should also
  // extend to the cantrip choosers." Three of them pick a cantrip as a
  // racial or heritage choice — Noldorni, Gul-Fyr and the Ascendan's
  // Arcane Knowledge — and each now opts in. The FEAT choosers
  // deliberately do not: Ethereal Trick, Verdant Gnome, Unusual Magic
  // and Elven Magic Greater are chosen when the feat is taken, and a
  // feat taken at 5th level is chosen at 5th.
  ok("J7a the shared spell chooser can be locked, per chooser",
    /firstLevelChoice = false,/.test(workflow) &&
      /if \(firstLevelChoice\) \{[\s\S]{0,400}?ui\.notifications\.warn\(refusal\);\s*return null;/.test(workflow));

  /*
   * WHICH CHOOSERS ARE LOCKED IS A RULE, NOT A LIST (3.552.8).
   *
   * Extended a second time on 15 September 2026 — "the Tirvni, Urloch
   * and Menora racial spell choosers should follow the same pattern" —
   * and a hand-kept list of three names had already needed editing
   * twice in one day. So the question is asked of the PACKS instead:
   *
   *   a HERITAGE's spell is chosen when the heritage is taken, and a
   *   character takes their heritage at 1st level — locked;
   *   a RACIAL ABILITY's spell is the same choice one step removed
   *   (the Ascendan's Arcane Knowledge) — locked;
   *   a FEAT's spell is chosen when the feat is taken, and a feat taken
   *   at 5th level is chosen at 5th — NOT locked;
   *   a CLASS or archetype pick arrives with the class feature — NOT
   *   locked.
   *
   * A chooser whose key names none of those fails as unclassified,
   * which is the point: a new one cannot join silently in either
   * direction.
   */
  const CHOOSER_KEY = /^ {2}"([^"]+)": \{$/gm;
  const registryKeys = [...workflow.matchAll(CHOOSER_KEY)];
  const choosers = [];
  for (let i = 0; i < registryKeys.length; i += 1) {
    const start = registryKeys[i].index;
    const end = i + 1 < registryKeys.length ? registryKeys[i + 1].index : workflow.length;
    const block = workflow.slice(start, end);
    if (!/grantChosenSpell\(actor, \{/.test(block)) continue;
    choosers.push({ key: registryKeys[i][1], locked: /firstLevelChoice: true,/.test(block) });
  }
  ok("J7b the scan found the spell choosers to classify", choosers.length >= 15,
    `found ${choosers.length}`);

  const sameName = (rows, key, type) =>
    rows.find((r) => r.type === type && String(r.name).toLowerCase() === key);
  // Every ability any race or heritage hands out, lower-cased.
  const racialAbilityNames = new Set();
  for (const row of [...races, ...heritages]) {
    for (const name of String(row.system?.racialAbilities ?? "").split(",")) {
      const trimmed = name.trim().toLowerCase();
      if (trimmed) racialAbilityNames.add(trimmed);
    }
  }
  const classify = (key) => {
    if (sameName(heritages, key, "heritage")) return "first-level";
    if (sameName(abilities, key, "ability") && racialAbilityNames.has(key)) return "first-level";
    if (sameName(feats, key, "feat")) return "when-taken";
    if (sameName(classes, key, "class")) return "when-taken";
    return "unclassified";
  };

  const unclassified = choosers.filter((c) => classify(c.key) === "unclassified").map((c) => c.key);
  eq("J7c every chooser's source is findable in the packs", unclassified, []);
  const wronglyOpen = choosers
    .filter((c) => classify(c.key) === "first-level" && !c.locked).map((c) => c.key);
  eq("J7d every race or heritage chooser is locked to 1st level", wronglyOpen, []);
  const wronglyLocked = choosers
    .filter((c) => classify(c.key) === "when-taken" && c.locked).map((c) => c.key);
  eq("J7e and no feat or class chooser is", wronglyLocked, []);
  // The ruling's own three, named once, so the file records what was
  // asked for on the day even though the rule above is what enforces it.
  eq("J7f the three racial choosers of the 15 Sep ruling are locked",
    ["menora", "urloch", "tirvni"].filter((k) =>
      choosers.find((c) => c.key === k)?.locked !== true), []);

  /* ── R3: Wash Away Sin ────────────────────────────────────────── */
  const wash = byName(spells, "Wash Away Sin", "spell");
  ok("J8 Wash Away Sin is in the pack", Boolean(wash));
  eq("J9 its damage is d8, matching its healing", wash?.system?.damage?.formula, "1d8");
  eq("J10 and the base damage field agrees", wash?.system?.baseDamage, "1d8");
  eq("J11 the heal side is unchanged at 1d8",
    (wash?.system?.effects ?? []).find((e) => e.kind === "heal")?.formula, "1d8");
  // THE WARP STAYS INERT, AND THE REASON MOVED ON THE SAME DAY.
  //
  // R3 settled the DICE. It did not settle the targeting — and the warp
  // had been reverted at 3.531.1 for the targeting: the cone was
  // areaTargeting "allies", so the damage could only ever land on the
  // people the spell heals. Applying R3 to the mods made
  // verify-warped-healing D3 go red, correctly.
  //
  // Asked directly, Graham then chose to build the missing half rather
  // than drop the clause ("Needs to be option 1"), so the cone now
  // catches everyone and the damage declares an opposed-aura scope. The
  // mods stay empty until that has been driven at a table: re-arming a
  // warp on the same day its foundation changed is exactly how 3.531.0
  // happened. See verify-damage-scope section A for the new rule, and
  // verify-warped-healing D3 for the history.
  // RE-ARMED AT 3.613.0 (block 35's B5). The targeting this waited on was
  // driven live on 15 September 2026 — the damage found the one opposed
  // creature and, after 3.552.6, the heal found the ally — and the warp is
  // driven again in the 3.613.0 live test. One die on each side, as R3 ruled.
  eq("J12 the +2 PP warp grows both the heal and the damage by a d8",
    (wash?.system?.warps ?? [])[0]?.mods, { damageDice: "1d8" });
  eq("J12a and the cone now catches everyone, so the damage has somebody to find",
    wash?.system?.areaTargeting, "all",
    "it was allies-only, which is what made the damage land on the party");
  eq("J12b with the damage scoped to opposed auras",
    wash?.system?.damageScope, "opposedAura");
  eq("J12c and the heal row narrowed to allies, so a wider cone heals no enemies",
    (wash?.system?.effects ?? []).find((e) => e.kind === "heal")?.target, "allies");
  ok("J13 and the printed text says d8 on both",
    !/1d6/.test(String(wash?.system?.description ?? "")) &&
      !(wash?.system?.effects ?? []).some((e) => /1d6/.test(String(e.text ?? ""))),
    "text that disagrees with the dice gets reported as the maths being wrong");

  /* ── R4: the traits line that was read as a missing ability ───── */
  const stance = byName(abilities, "Shadow Stance", "ability");
  const stanceTraits = String(stance?.system?.traits ?? "").toLowerCase();
  ok("J14 Shadow Stance carries its printed traits", Boolean(stanceTraits.trim()),
    "the block's second line, OPEN STANCE, is the traits line — not a second ability");
  ok("J15 Open among them", /\bopen\b/.test(stanceTraits));
  ok("J16 and Stance", /\bstance\b/.test(stanceTraits));

  const stanceBody = workflow.slice(workflow.indexOf('"shadow stance"'), workflow.indexOf('"adoptive race"'));
  ok("J17 the button gates on those traits BEFORE spending the AP",
    /if \(!traitGate\(actor, item\.system, item\.name\)\) return;/.test(stanceBody) &&
      stanceBody.indexOf("traitGate") < stanceBody.indexOf("resources?.ap?.value"),
    "an Open action must be your first, and a Stance waits a round — both were unreachable");
  ok("J18 and records the use, so the next Stance is held for a round",
    /await recordTraitUsage\(actor, item\.system\);/.test(stanceBody));
}

/* ================================================================== */

process.stdout.write(`verify-chapter2: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\nverify-chapter2: ${failures.length} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("verify-chapter2: all pass\n");
