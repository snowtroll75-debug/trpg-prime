/**
 * verify-companions-familiars-137-140 — animal companions and familiars.
 *
 * WHY THIS FILE EXISTS. The pages 131-140 audit found this subsystem
 * effectively unguarded. Seven verify files mention companions or
 * familiars, but every one of them arrives from somewhere else — the
 * proficiency sweep noting the companion class's deliberately empty
 * proficiencies, the ranged-ability check confirming companion attacks
 * are melee, missile-storm borrowing the size ladder. Nothing asked
 * whether the NUMBERS were right, and the numbers are four pages of
 * them. Graham asked for the gap closed on 18 September 2026.
 *
 * EVERY EXPECTED VALUE HERE IS TRANSCRIBED FROM THE PRINTED PAGE, never
 * read from the module under test. That is not pedantry: it is the only
 * reason this file found anything. The Animal Companion class item said
 * 4 skill points per level, module/companion.mjs said 4, and the doc
 * comment above the constant quoted a rulebook sentence saying 4 which
 * appears in neither revision of the book. Three things agreeing, all
 * wrong, and a harness that took any of them as its expected value would
 * have agreed too, for ever. The book says 2 plus Wisdom.
 *
 * THE TWO ROUNDINGS ARE THE OTHER REASON. A familiar's hit points are
 * half the master's rounded UP; its Effective Level is half its level
 * rounded DOWN. Three printed lines apart, deliberately different, and
 * the sort of asymmetry a tidying edit flattens without anyone noticing
 * — at which point every familiar in every world is quietly wrong and
 * nothing throws.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  COMPANION_CLASS_NAME,
  COMPANION_CLASS_SKILLS,
  COMPANION_HP_PER_LEVEL,
  COMPANION_SKILL_POINTS,
  SIZE_STEPS,
  sizeStepUp,
  sizeStepDown,
  canIncreaseSize,
  companionEffectiveLevel,
  companionSyncState,
  changeTouchesLevel,
  LEVEL_CHANGE_PATHS,
  resizedNaturalDamage
} from "../module/companion.mjs";
import {
  FAMILIAR_STAT_BLOCK,
  FAMILIAR_TRAITS,
  FAMILIAR_AP,
  FAMILIAR_FOCUS_AP,
  familiarBaseAbilities,
  familiarInitiative,
  familiarEffectiveLevel,
  familiarMaxHP,
  familiarActionPoints,
  familiarAbilityAllowance,
  familiarAbilityBudget,
  familiarProgression,
  familiarSyncState,
  familiarLossOutcome,
  familiarComponentCost,
  familiarActorName
} from "../module/familiar.mjs";
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

async function packItems(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, value] of db.iterator()) out.push(value);
  await db.close();
  return out;
}

/* ================================================================== */
/* THE PRINTED PAGE — transcribed, page 137-139                        */
/* ================================================================== */

/**
 * ANIMAL COMPANION STATISTICS TABLE, page 138, typed out from the book:
 * [level, EL, feats, BAB, BDB, Fort, Reflex, Will].
 *
 * Twenty rows of seven hand-typed numbers. The whole point of having
 * them here is that they came from the page and not from the pack.
 */
const PRINTED_COMPANION_TABLE = [
  [1, 0, 1, 0, 1, 6, 6, 0],
  [2, 1, 1, 1, 2, 7, 7, 1],
  [3, 2, 2, 2, 3, 8, 8, 2],
  [4, 2, 2, 3, 4, 9, 9, 3],
  [5, 3, 3, 3, 5, 10, 10, 4],
  [6, 4, 3, 4, 6, 11, 11, 5],
  [7, 4, 4, 5, 7, 12, 12, 6],
  [8, 5, 4, 6, 8, 13, 13, 7],
  [9, 6, 5, 6, 9, 14, 14, 8],
  [10, 7, 5, 7, 10, 15, 15, 9],
  [11, 7, 6, 8, 11, 16, 16, 10],
  [12, 8, 6, 9, 12, 17, 17, 11],
  [13, 9, 7, 9, 13, 18, 18, 12],
  [14, 9, 7, 10, 14, 19, 19, 13],
  [15, 10, 8, 11, 15, 20, 20, 14],
  [16, 11, 8, 12, 16, 21, 21, 15],
  [17, 11, 9, 12, 17, 22, 22, 16],
  [18, 12, 9, 13, 18, 23, 23, 17],
  [19, 13, 10, 14, 19, 24, 24, 18],
  [20, 14, 10, 15, 20, 25, 25, 19]
];

/** ANIMAL COMPANION HP TABLE, page 137 — bonus HP by size. */
const PRINTED_COMPANION_HP = { tiny: 10, small: 20, medium: 30, large: 50, huge: 80 };

/** The Special column, page 138. */
const PRINTED_SPECIAL = {
  1: "Share Spells", 2: "Evasion", 14: "Improved Evasion",
  3: "Ability Score Increase", 6: "Ability Score Increase",
  9: "Ability Score Increase", 12: "Ability Score Increase",
  15: "Ability Score Increase", 18: "Ability Score Increase"
};

/** "An animal companion gains 10 + Con per level hit points." p.137 */
const PRINTED_HP_PER_LEVEL = 10;
/** "…gains 2 skill points plus wisdom ability score per level." p.137 */
const PRINTED_SKILL_POINTS = 2;
const PRINTED_SKILL_POINT_ABILITY = "wisdom";
/** "Acrobatics, Athletics, Climbing, Intimidate, Perception, Stealth and
 *  Survival", p.137. */
const PRINTED_CLASS_SKILLS = [
  "Acrobatics", "Athletics", "Climbing", "Intimidate", "Perception", "Stealth", "Survival"
];

/* ================================================================== */
/* A — THE COMPANION TABLE                                             */
/* ================================================================== */

const companions = await packItems("companions");
const companionClass = companions.find(
  (c) => c.name === COMPANION_CLASS_NAME && c.type === "class"
);

ok("A1 the Animal Companion class item exists", Boolean(companionClass));
eq("A2 its progression has one row per level, 1 to 20",
  companionClass?.system?.progression?.length, PRINTED_COMPANION_TABLE.length);

/* 140 CELLS, ONE CHECK EACH ROW. Reported per row rather than as a
 * single "the table matches" boolean, because a single boolean tells
 * whoever broke it only that something is wrong somewhere in 140
 * numbers. */
for (const [level, el, feats, bab, bdb, fort, reflex, will] of PRINTED_COMPANION_TABLE) {
  const row = companionClass?.system?.progression?.[level - 1];
  eq(`A3.${level} the printed row for level ${level}`,
    [row?.level, row?.effectiveLevel, row?.bonusFeats, row?.bab, row?.bdb,
      row?.fortitude, row?.reflex, row?.will],
    [level, el, feats, bab, bdb, fort, reflex, will]);
}

/* THE EL COLUMN IS READ BY A FUNCTION OF ITS OWN, because it is the one
 * progression column the shared resolver does not carry. Driven through
 * that function rather than off the row, so the reader is tested and not
 * just the data. */
for (const [level, el] of PRINTED_COMPANION_TABLE.map((r) => [r[0], r[1]])) {
  eq(`A4.${level} companionEffectiveLevel reads EL ${el} at level ${level}`,
    companionEffectiveLevel(companionClass, level), el);
}
eq("A5 above the table it clamps to the last row rather than inventing one",
  companionEffectiveLevel(companionClass, 25), 14);
eq("A6 and with no class item at all it answers null, not 0",
  companionEffectiveLevel(null, 5), null,
  "a 0 would be indistinguishable from the printed EL at 1st level");

/* THE SPECIAL COLUMN. Ability Score Increase every third level is a
 * rule, so it is checked as one rather than as six coincidences. */
eq("A7 the printed Ability Score Increase levels are every 3rd",
  Object.entries(PRINTED_SPECIAL)
    .filter(([, v]) => v === "Ability Score Increase")
    .map(([k]) => Number(k))
    .sort((a, b) => a - b),
  [3, 6, 9, 12, 15, 18],
  "transcription check on my own reading of the page, before anything is compared to it");

/* ================================================================== */
/* B — COMPANION HIT POINTS, SKILLS AND POINTS                         */
/* ================================================================== */

eq("B1 hit points per level match the printed 10 + Con",
  COMPANION_HP_PER_LEVEL, PRINTED_HP_PER_LEVEL);
eq("B2 and the class item carries the same figure",
  companionClass?.system?.hitPoints, PRINTED_HP_PER_LEVEL);

/* THE DEFECT THIS FILE WAS WRITTEN TO FIND. The book says 2 plus
 * Wisdom; the module said 4 above a comment quoting a sentence the book
 * does not contain, and the class item said 4 to match. Both are
 * asserted against the PRINTED figure, separately, so neither can
 * satisfy the check by agreeing with the other. */
eq("B3 skill points per level match the printed 2 (NOT the 4 that shipped)",
  COMPANION_SKILL_POINTS, PRINTED_SKILL_POINTS,
  "printed: 'gains 2 skill points plus wisdom ability score per level'");
eq("B4 and the class item carries the printed 2 as well",
  companionClass?.system?.skillPoints, PRINTED_SKILL_POINTS,
  "this is the value the sheet actually spends; the constant above is not read by anything but this check");
eq("B5 the 'plus wisdom' half is authored as the skill-point ability",
  String(companionClass?.system?.skillPointAbility ?? "").toLowerCase(),
  PRINTED_SKILL_POINT_ABILITY);

eq("B6 the seven printed class skills, in the printed order",
  COMPANION_CLASS_SKILLS, PRINTED_CLASS_SKILLS);
eq("B7 and the class item lists the same seven",
  String(companionClass?.system?.classSkills ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean),
  PRINTED_CLASS_SKILLS);

/* THE SIZE HP TABLE. Checked against the printed rows only — the sizes
 * above and below (diminutive, gargantuan, colossal) are not printed on
 * this table and are the creature codex's business, not this page's. */
for (const [size, hp] of Object.entries(PRINTED_COMPANION_HP)) {
  eq(`B8.${size} the printed companion HP for ${size}`, SIZE_TABLE[size]?.baseHP, hp);
}

/* ================================================================== */
/* C — THE SIZE LADDER                                                 */
/* ================================================================== */

eq("C1 the ladder runs smallest to largest, eight rungs",
  SIZE_STEPS,
  ["diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"]);
eq("C2 and holds the same keys as the size table it must agree with",
  [...SIZE_STEPS].sort(), Object.keys(SIZE_TABLE).sort(),
  "a rung with no size table entry would resize a companion into a creature with no statistics");

eq("C3 one step up from medium is large", sizeStepUp("medium"), "large");
eq("C4 one step down from medium is small", sizeStepDown("medium"), "small");
eq("C5 the top of the ladder clamps rather than falling off",
  sizeStepUp("colossal"), "colossal");
eq("C6 and so does the bottom", sizeStepDown("diminutive"), "diminutive");
eq("C7 an unknown size is refused, not treated as medium",
  [sizeStepUp("enormous"), sizeStepDown("enormous")], [null, null],
  "indexOf returns -1 for an unknown name, which compares as smaller than everything");
eq("C8 the ladder is matched case-insensitively", sizeStepUp("MEDIUM"), "large");

ok("C9 a companion below its maximum may grow", canIncreaseSize("small", "large"));
ok("C10 one already at its maximum may not", !canIncreaseSize("large", "large"));
ok("C11 nor may one above it", !canIncreaseSize("huge", "large"));
ok("C12 and an unknown size refuses BEFORE comparing",
  !canIncreaseSize("enormous", "large") && !canIncreaseSize("small", "enormous"),
  "unknown falling through to -1 would read as 'smaller than everything' and always permit growth");

/* Natural damage across sizes — the ladder the companion attacks ride. */
eq("C13 a Medium bite grown to Large steps up one rung",
  resizedNaturalDamage("1d8", "medium", "large"), "1d10");
eq("C14 a Small bite grown to Large steps up TWO, from where it is",
  resizedNaturalDamage("1d6", "small", "large"), "1d10");
eq("C15 an unknown size returns null rather than assuming medium",
  resizedNaturalDamage("1d6", "small", "enormous"), null);
eq("C16 no movement returns the damage unchanged",
  resizedNaturalDamage("1d6", "small", "small"), "1d6");

/* ================================================================== */
/* D — COMPANION LEVEL SYNC                                            */
/* ================================================================== */

eq("D1 a companion at its master's level is in sync",
  companionSyncState({ masterLevel: 7, companionLevel: 7, hasMaster: true }),
  { bound: true, inSync: true, masterLevel: 7, companionLevel: 7 });
eq("D2 one behind its master is not, and says both levels",
  companionSyncState({ masterLevel: 7, companionLevel: 5, hasMaster: true }),
  { bound: true, inSync: true === false, masterLevel: 7, companionLevel: 5 });
eq("D3 an unbound companion is not 'out of date' — it is unbound",
  companionSyncState({ masterLevel: 7, companionLevel: 5, hasMaster: false }),
  { bound: false, inSync: true, masterLevel: null, companionLevel: 5 });

/* THE FAILURE THAT MATTERS. A player character's level is DERIVED from
 * XP and never appears in an update diff, so a trigger watching only
 * `level` would never fire for the actor type that owns almost every
 * companion in a world. */
ok("D4 the XP path is watched, not just the level path",
  LEVEL_CHANGE_PATHS.includes("system.identity.xp"),
  "a Ranger levels by gaining XP; without this the companion never follows");
ok("D5 a level write is seen",
  changeTouchesLevel({ system: { identity: { level: 8 } } }));
ok("D6 an XP write is seen",
  changeTouchesLevel({ system: { identity: { xp: 40000 } } }));
ok("D7 an unrelated write is not",
  !changeTouchesLevel({ system: { resources: { hp: { value: 3 } } } }),
  "firing on every update would resync a companion on every hit point lost");

/* ================================================================== */
/* E — THE FAMILIAR STAT BLOCK, page 140                               */
/* ================================================================== */

/* PRINTED: Size Tiny; Initiative +25; Speed 25; Senses Nightvision;
 * Str -2, Dex 3, Con 0, Int -2, Wis 2, Cha 0; DB 15; DR 1 (base);
 * Bite (Tiny) +3 (1d4-2 piercing). */
eq("E1 size is Tiny", FAMILIAR_STAT_BLOCK.size, "tiny");
eq("E2 speed is 25", FAMILIAR_STAT_BLOCK.speed, 25);
eq("E3 senses are Nightvision", FAMILIAR_STAT_BLOCK.senses, "Nightvision");
eq("E4 the printed ability scores",
  FAMILIAR_STAT_BLOCK.abilities,
  { strength: -2, dexterity: 3, constitution: 0, intelligence: -2, wisdom: 2, charisma: 0 });
eq("E5 DR 1 (base)", FAMILIAR_STAT_BLOCK.naturalArmourBase, 1);
eq("E6 the printed attack", FAMILIAR_STAT_BLOCK.attack,
  { name: "Bite (Tiny)", damage: "1d4", damageType: "piercing" });
eq("E7 the printed DB", FAMILIAR_STAT_BLOCK.printedDB, 15);
eq("E8 the printed initiative", FAMILIAR_STAT_BLOCK.initiative, 25);
eq("E9 'A familiar gains the Minion Trait'", FAMILIAR_TRAITS, "Minion");

/* THE ROUND TRIP THAT CAUGHT A SHIPPED BUG. This system adds a size
 * modifier to Str and Dex on top of whatever is authored, and Tiny is
 * -2 / +2. Writing the printed scores straight into `.base` produced
 * Dex 5 and an initiative of 35 against a printed 25 — which shipped at
 * 3.234.1. The authored scores are derived by subtracting the size
 * modifier, so the printed block stays the single source of truth. */
const authored = familiarBaseAbilities();
const tiny = SIZE_TABLE.tiny;
eq("E10 the AUTHORED scores are the printed ones less the Tiny modifiers",
  [authored.strength, authored.dexterity],
  [FAMILIAR_STAT_BLOCK.abilities.strength - tiny.strMod,
    FAMILIAR_STAT_BLOCK.abilities.dexterity - tiny.dexMod]);
eq("E11 and adding the size modifiers back gives the printed block",
  [authored.strength + tiny.strMod, authored.dexterity + tiny.dexMod],
  [FAMILIAR_STAT_BLOCK.abilities.strength, FAMILIAR_STAT_BLOCK.abilities.dexterity],
  "the round trip is the whole guarantee; without it the block drifts from the page");
eq("E12 nothing but Strength and Dexterity is touched by size",
  [authored.constitution, authored.intelligence, authored.wisdom, authored.charisma],
  [0, -2, 2, 0]);

/* The printed +25 initiative must FALL OUT of the general rule rather
 * than be typed beside it. */
eq("E13 the printed initiative falls out of (Dex + Wis) x 5",
  familiarInitiative(FAMILIAR_STAT_BLOCK.abilities), FAMILIAR_STAT_BLOCK.initiative);
eq("E14 initiative with nothing passed is 0, not NaN", familiarInitiative(), 0);

/* ================================================================== */
/* F — THE TWO ROUNDINGS                                               */
/* ================================================================== */

/* "A familiar has an amount of hit points equal to half of your
 * characters (round up)" — the only halving in this system that rounds
 * up, three printed lines from one that rounds down. */
eq("F1 half of an ODD maximum rounds UP", familiarMaxHP({ masterMaxHP: 21 }), 11);
eq("F2 half of an even maximum is exact", familiarMaxHP({ masterMaxHP: 20 }), 10);
eq("F3 half of 1 is 1, not 0", familiarMaxHP({ masterMaxHP: 1 }), 1);
eq("F4 a master with no hit points gives none", familiarMaxHP({ masterMaxHP: 0 }), 0);
eq("F5 Tough adds 2 per level AFTER the halving, not before",
  familiarMaxHP({ masterMaxHP: 21, level: 5, hasTough: true }), 11 + 10,
  "halving 21+10 would give 16; the familiar's own hit points increase, not the master's");
eq("F6 and Tough is not applied when the ability is absent",
  familiarMaxHP({ masterMaxHP: 21, level: 5, hasTough: false }), 11);

/* "A familiar has an Effective Level (EL) of half your level (round
 * down)." THE OPPOSITE ROUNDING, deliberately. */
eq("F7 EL halves and rounds DOWN",
  [1, 2, 3, 7, 20].map(familiarEffectiveLevel), [0, 1, 1, 3, 10]);
eq("F8 EL at 1st is 0, matching the companion table's own 1st row",
  familiarEffectiveLevel(1), PRINTED_COMPANION_TABLE[0][1]);
ok("F9 the two roundings genuinely differ — this asymmetry is the rule",
  familiarMaxHP({ masterMaxHP: 7 }) === 4 && familiarEffectiveLevel(7) === 3,
  "if a tidying edit ever makes both round the same way, this is the check that says so");

/* ================================================================== */
/* G — FAMILIAR ACTIONS, ABILITIES AND LOSS                            */
/* ================================================================== */

eq("G1 'a familiar only gains 2 AP a round'", FAMILIAR_AP, 2);
eq("G2 'unless the Familiar Focus ability is selected'", FAMILIAR_FOCUS_AP, 3);
eq("G3 a plain familiar gets 2 AP", familiarActionPoints([]), 2);
eq("G4 one with Familiar Focus gets 3", familiarActionPoints(["Familiar Focus"]), 3);
eq("G5 the ability is matched however it is cased",
  familiarActionPoints(["familiar focus"]), 3);
eq("G6 another ability does not grant it", familiarActionPoints(["Scent", "Tough"]), 2);

/* "begins at 1st level with 2 abilities and the Empathic Link ability…
 * At 4th level and then every 4 levels thereafter, you may select an
 * additional ability." Empathic Link is FREE and not one of the two. */
eq("G7 the allowance is 2 at 1st, and rises at 4, 8, 12, 16, 20",
  [1, 3, 4, 7, 8, 12, 16, 20].map((level) => familiarAbilityAllowance({ level })),
  [2, 2, 3, 3, 4, 5, 6, 7]);
eq("G8 Empower Familiar adds two picks, and stacks per copy",
  [0, 1, 2].map((empowerPicks) => familiarAbilityAllowance({ level: 1, empowerPicks })),
  [2, 4, 6]);
eq("G9 Empathic Link is free — it does not spend a pick",
  familiarAbilityBudget({ abilityNames: ["Empathic Link", "Scent"], level: 1 }),
  { spent: 1, available: 2 });
eq("G10 and a familiar holding only Empathic Link has spent nothing",
  familiarAbilityBudget({ abilityNames: ["Empathic Link"], level: 1 }).spent, 0);

/* "You must expend 100 gp per level in magical components." */
eq("G11 components cost 100 gp per level",
  [1, 5, 20].map(familiarComponentCost), [100, 500, 2000]);
eq("G12 and never less than one level's worth", familiarComponentCost(0), 100);

/* The printed loss table — four rows where this system has five degrees. */
eq("G13 a critical lets you replace the familiar at once",
  familiarLossOutcome("critical"), { summary: familiarLossOutcome("critical").summary, fatigue: 0, waitDays: 0 });
eq("G14 a failure costs fatigue 2", familiarLossOutcome("failure").fatigue, 2);
eq("G15 a fumble costs fatigue 2 AND a week",
  [familiarLossOutcome("fumble").fatigue, familiarLossOutcome("fumble").waitDays], [2, 7]);
eq("G16 a PARTIAL resolves as the failure row, not as a success",
  familiarLossOutcome("partial"), familiarLossOutcome("failure"),
  "the book prints four rows and this system rolls five degrees; the middle must not beat its own name");
eq("G17 an unknown degree is null, not a silent success",
  familiarLossOutcome("nonsense"), null);

/* ================================================================== */
/* H — WHAT A FAMILIAR DOES NOT GET                                    */
/* ================================================================== */

/* "A familiar develops no skill ranks of its own" and "gains no
 * additional feats as you advance in level". Both are ABSENCES, which
 * is exactly the kind of rule that gets quietly filled in. */
const mirror = {
  source: "Theolan's Wizard", level: 7, bab: 3, bdb: 7,
  fortitude: 5, reflex: 5, will: 9, maxHP: 41, skills: {}
};
const progression = familiarProgression(mirror);
eq("H1 a familiar gains NO hit points per level of its own",
  progression.hitPoints, 0,
  "its maximum is half its master's; a per-level figure would be a second source");
eq("H2 and NO skill points of its own", progression.skillPoints, 0);
eq("H3 and no bonus feats", progression.bonusFeats, null);
eq("H4 while BAB, BDB and the three saves are its master's exactly",
  [progression.bab, progression.bdb, progression.fortitude, progression.reflex, progression.will],
  [mirror.bab, mirror.bdb, mirror.fortitude, mirror.reflex, mirror.will]);
eq("H5 and no mirror at all gives null rather than a blank progression",
  familiarProgression(null), null);

/* Drift detection compares the WHOLE snapshot, not just the level. */
eq("H6 an identical snapshot is in sync",
  familiarSyncState({ stored: mirror, current: mirror, hasMaster: true }),
  { bound: true, inSync: true, drifted: [] });
eq("H7 a master who gained hit points has drifted, though the level did not move",
  familiarSyncState({
    stored: mirror, current: { ...mirror, maxHP: 48 }, hasMaster: true
  }).drifted, ["maxHP"],
  "watching the level alone would miss every change a player would not announce");
eq("H8 a changed skill rank is drift too",
  familiarSyncState({
    stored: { ...mirror, skills: { arcana: { ranks: 4 } } },
    current: { ...mirror, skills: { arcana: { ranks: 5 } } },
    hasMaster: true
  }).drifted, ["skills"]);
eq("H9 an unbound familiar is not drifting",
  familiarSyncState({ stored: mirror, current: null, hasMaster: false }),
  { bound: false, inSync: true, drifted: [] });

eq("H10 a familiar is named for its master and its form",
  familiarActorName("Theolan", "Owl"), "Theolan's Owl");
eq("H11 and falls back when the form is not given",
  familiarActorName("Theolan", ""), "Theolan's Familiar");

/* ================================================================== */
/* I — THE +2 AGAINST MAGIC IS AUTHORED, NOT POOLED                    */
/* ================================================================== */

/* "A familiar gains a special +2 racial bonus to any saving throws made
 * to resist magic." CONDITIONAL, so it must NOT be pooled into the save
 * totals — a pooled bonus would give a familiar +2 against a pit trap.
 * It is authored as a conditional the player ticks in the check dialog.
 * familiar-derive.mjs says exactly this in a comment; this asserts the
 * comment is true, which is the check that block 12 taught me to write. */
const familiars = await packItems("familiars");
const familiarRace = familiars.find((f) => f.name === "Familiar" && f.type === "race");
ok("I1 the Familiar race item exists", Boolean(familiarRace));
const conditionals = familiarRace?.flags?.["trg-prime"]?.conditionals ?? [];
const magicSave = conditionals.find((c) => /magic/i.test(String(c?.label ?? c?.scope ?? "")));
ok("I2 the +2 against magic is authored as a CONDITIONAL", Boolean(magicSave),
  "a pooled bonus would apply to every save, including a pit trap");
eq("I3 it is +2", magicSave?.value, 2);
eq("I4 typed as racial, as the book words it", magicSave?.type, "race");
eq("I5 scoped to saving throws", magicSave?.when?.checkTypes, ["save"]);
ok("I6 and NOT automatic — the player says whether the save was against magic",
  magicSave?.auto === false,
  "the system cannot tell a spell from a pit trap, so the tick belongs to the player");

/* The unconditional half, by contrast, IS pooled. */
const { familiarSaveEntries } = await import("../module/familiar-derive.mjs");
eq("I7 Resilience's unconditional +2 IS pooled across all three saves",
  Object.keys(familiarSaveEntries(["Resilience"])).sort(),
  ["system.combat.saves.fortitude", "system.combat.saves.reflex", "system.combat.saves.will"]);
eq("I8 and a familiar without it pools nothing",
  familiarSaveEntries([]), {});

/* ================================================================== */
/* J — THE COMPANION FEATS AND ABILITIES                               */
/* ================================================================== */

const feats = await packItems("feats");
const companionFeats = feats.filter(
  (f) => /\bCompanion\b/i.test(String(f.system?.traits ?? ""))
);
ok(`J1 the Companion-trait feats are present (${companionFeats.length} found)`,
  companionFeats.length >= 19,
  "pages 138-139 print nineteen");
ok("J2 and every one is categorised General, as the page prints them",
  companionFeats.every((f) => f.system?.category === "General"),
  companionFeats.filter((f) => f.system?.category !== "General").map((f) => f.name).join(", "));

/* THE LADDERS, AND THE CONVENTION THEY ARE NAMED BY.
 *
 * The pack spells these "Natural Defence, Improved" — the base name
 * first, the rung after a comma — so the four rungs sort together in an
 * alphabetical list, which is how a player finds them on the sheet. The
 * first version of this check looked for "Improved Natural Defence" and
 * reported three rungs missing from a ladder that was complete. My
 * search was wrong, not the data; a negative result from a search I
 * wrote myself is a question, not a finding.
 *
 * The convention is now asserted rather than assumed, because renaming
 * one rung to the other form would scatter the ladder without breaking
 * anything that would complain. */
const RUNGS = ["", ", Improved", ", Master", ", Supremacy"];
for (const base of ["Natural Defence", "Tough Hide"]) {
  const missing = RUNGS
    .map((suffix) => `${base}${suffix}`)
    .filter((name) => !feats.some((f) => f.name === name));
  ok(`J3.${base.replace(/\s+/g, "-")} all four rungs of the ${base} ladder exist`,
    missing.length === 0, `${missing.join(", ")} missing`);
}
ok("J3.convention the rungs are suffixed, not prefixed — they must sort together",
  companionFeats.some((f) => f.name === "Natural Defence, Improved")
    && !companionFeats.some((f) => f.name === "Improved Natural Defence"),
  "the sheet lists these alphabetically; a prefixed rung would sit pages from its own ladder");

const abilities = await packItems("abilities");
const PRINTED_COMPANION_ABILITIES = [
  "Acute Sense", "Animal Rage", "Constrict", "Gallop", "Monstrous Grab",
  "Monstrous Knockdown", "Pack Attack", "Pounce", "Trample"
];
for (const name of PRINTED_COMPANION_ABILITIES) {
  ok(`J4.${name.replace(/\s+/g, "-")} the ${name} companion ability is in the pack`,
    abilities.some((a) => a.name === name));
}

console.log(
  failures
    ? `verify-companions-familiars-137-140: ${failures} FAILED of ${checks}`
    : `verify-companions-familiars-137-140: ${checks} checks passed`
);
process.exit(failures ? 1 : 0);
