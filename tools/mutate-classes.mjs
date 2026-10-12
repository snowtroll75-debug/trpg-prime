#!/usr/bin/env node
/**
 * mutate-classes — can verify-classes fail? NEW at 3.554.0.
 *
 * The ones that matter most are the PACK mutations at the bottom. Every
 * source mutation here breaks a formula, and a broken formula is loud —
 * it moves twenty rows at once. A single digit changed in one cell of
 * one class's progression array is the failure this whole file exists
 * for: it moves one number, on one class, at one level, and nothing at
 * the table would ever say so.
 *
 * And A10b, which is R1 reversed by one line: the ruling of 15 September
 * 2026 was warn, NEVER refuse, and the distance between that and its
 * opposite is a `return false` in a method that already has the actor,
 * the class and the answer in hand.
 *
 * EXTENDED AT 3.555.0 for the block 5 fixes. The three that matter most
 * there are B6, B9 and B13 — each restores exactly the defect the pages
 * 51-60 audit found, and each of the three was invisible for releases:
 * a DB term computed and never added, a flag written on the wrong side
 * of a toggle, and a trigger that prompts the victim instead of the
 * fighter who earned it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CONFIG = path.join(SYSTEM_ROOT, "module", "config.mjs");
const FEATS = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const ATTRS = path.join(SYSTEM_ROOT, "module", "attributes.mjs");
const PROG = path.join(SYSTEM_ROOT, "module", "class-progression.mjs");
const ITEM = path.join(SYSTEM_ROOT, "module", "documents", "item.mjs");
const ACTOR = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const MEMO = path.join(SYSTEM_ROOT, "module", "magic", "memorisation.mjs");
const REP = path.join(SYSTEM_ROOT, "module", "magic", "repertoire.mjs");
const BARD = path.join(SYSTEM_ROOT, "module", "bard.mjs");
const DRUID = path.join(SYSTEM_ROOT, "module", "druid.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const ITEM_HBS = path.join(SYSTEM_ROOT, "templates", "item", "item-sheet.hbs");
const ROGUE_M = path.join(SYSTEM_ROOT, "module", "rogue.mjs");
const FIGHTER_M = path.join(SYSTEM_ROOT, "module", "fighter.mjs");
const WIZARD_M = path.join(SYSTEM_ROOT, "module", "wizard.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const PASSIVE = path.join(SYSTEM_ROOT, "module", "combat", "passive-feats.mjs");
const DETECT = path.join(SYSTEM_ROOT, "module", "combat", "reaction-feat-detection.mjs");
const FEATCAST = path.join(SYSTEM_ROOT, "module", "magic", "feat-casting.mjs");
const FW = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const SPELLBOOK = path.join(SYSTEM_ROOT, "module", "magic", "spellbook.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-classes.mjs");

const MUTATIONS = [
  /* ---------------- the Level Table ---------------- */
  {
    file: CONFIG,
    name: "A1 the Class Bonus band moves one level up",
    from: "  if (lvl >= 15) return 5;",
    to: "  if (lvl >= 16) return 5;",
    breaks: "A3/A7 — the table steps at 15th, and every 15th-level character's class skills drop a point"
  },
  {
    file: CONFIG,
    name: "A2 the twentieth row stops rising",
    from: "  if (lvl >= 20) return 6;",
    to: "  if (lvl >= 20) return 5;",
    breaks: "A3/A7/A8 — the last band is the one no character reaches until it matters most"
  },
  {
    file: CONFIG,
    name: "A3 the XP step is a tenth of the printed one",
    from: "XP_PER_LEVEL = 10000;",
    to: "XP_PER_LEVEL = 1000;",
    breaks: "A2/A10/A11 — level is DERIVED from XP, so this moves every character's level at once"
  },
  {
    file: CONFIG,
    name: "A4 the table gains rows it does not print",
    from: "MAX_CHARACTER_LEVEL = 20;",
    to: "MAX_CHARACTER_LEVEL = 30;",
    breaks: "A1/A13 — there is no 21st row for any class to resolve against"
  },
  {
    file: FEATS,
    name: "A5 General Feats follows the Class Feats schedule",
    from: "  return 1 + Math.floor(Math.max(0, lvl - 1) / 2);",
    to: "  return 1 + Math.floor(lvl / 2);",
    breaks: "A5 — the two columns differ at 2nd level and at every even level after"
  },
  {
    file: FEATS,
    name: "A6 Class Feats gains one level too slowly",
    from: "  return 1 + Math.floor(lvl / 2);",
    to: "  return 1 + Math.floor((lvl - 1) / 2);",
    breaks: "A6 — the printed column reads 2 at 2nd level, not 1"
  },
  {
    file: ATTRS,
    name: "A7 ability increases arrive every fourth level",
    from: "  return Math.max(0, Math.floor(Number(level ?? 0) / 3));",
    to: "  return Math.max(0, Math.floor(Number(level ?? 0) / 4));",
    breaks: "A4/A15 — 'At 3rd level and then every three levels thereafter'"
  },
  {
    file: ATTRS,
    name: "A8 the printed ceiling of 6 rises to 8",
    from: "const ABSOLUTE_MAX = 6;",
    to: "const ABSOLUTE_MAX = 8;",
    breaks: "A14 — 'you may not increase the base value of an ability score above 6'"
  },

  /* ---------------- the progression tables ---------------- */
  {
    file: PROG,
    name: "A9 a table with no Bonus Feats column reads it as zero",
    from: 'export const NULLABLE_COLUMNS = Object.freeze(["bonusFeats"]);',
    to: 'export const NULLABLE_COLUMNS = Object.freeze([]);',
    breaks: "D3/D4/D5 — a Cleric would gain a feat allowance the book prints no column for"
  },
  {
    file: PROG,
    name: "A9b a blank cell becomes a zero everywhere",
    from: '  if (value === null || value === undefined || value === "") return null;',
    to: '  if (value === null || value === undefined || value === "") return 0;',
    breaks: "D4 — a Fighter would be a caster who can never afford a spell, rather than not a caster"
  },
  {
    file: PROG,
    name: "A9c a level above the table stops admitting it is clamped",
    from: "  if (wanted > Number(highest?.level ?? 0)) return { row: highest, capped: true };",
    to: "  if (wanted > Number(highest?.level ?? 0)) return { row: highest, capped: false };",
    breaks: "D7 — 'and possibly beyond' is a clamp the sheet has to be able to say out loud"
  },

  /* ---------------- the minimum ability score, R1 ---------------- */
  {
    file: PROG,
    name: "A10 an unreadable ability name is skipped instead of refusing the line",
    from: "    if (!key) return null;",
    to: "    if (!key) continue;",
    breaks: "F6 — half a requirement understood is a warning about an ability nobody printed"
  },
  {
    file: PROG,
    name: "A10a the comma inside the requirement is tidied away and then guessed at",
    from: '  const subject = before.slice(before.lastIndexOf(",") + 1);',
    to: '  const subject = before.replace(/,/g, " ");',
    breaks: "F5 — E2's printed shape names nothing, and guessing it is worse than saying nothing"
  },
  {
    file: PROG,
    name: "A10b an either-or requirement is read as one ability",
    from: "  const names = subject.split(EITHER_PATTERN).map((part) => part.trim()).filter(Boolean);",
    to: "  const names = [subject.trim()].filter(Boolean);",
    breaks: "F3 — the Fighter is the only class with one, and it would stop parsing at all"
  },
  {
    file: PROG,
    name: "A10c meeting the minimum exactly counts as missing it",
    from: "  if (best.value >= requirement.minimum) return null;",
    to: "  if (best.value > requirement.minimum) return null;",
    breaks: "F7 — every Bard built to the printed Charisma +2 would be warned about it forever"
  },
  {
    file: PROG,
    name: "A10d the first of two abilities decides, rather than the better",
    from: "  const best = held.reduce((a, b) => (b.value > a.value ? b : a), held[0]);",
    to: "  const best = held[0];",
    breaks: "F11/F12 — a Dexterity Fighter meets 'Strength or Dexterity' and would be told otherwise"
  },
  {
    file: PROG,
    name: "A10e the warning is computed from base scores instead of the sheet's",
    from: "    scores[key] = Number(actor?.system?.attributes?.[key]?.total ?? 0);",
    to: "    scores[key] = Number(actor?.system?.attributes?.[key]?.base ?? 0);",
    breaks: "F25 — a Dwarf Druid whose racial Constitution meets it would be told it does not"
  },
  {
    file: ITEM,
    name: "A11 nothing warns when the class is added",
    from: "    this._warnBelowClassMinimum();",
    to: "    void 0;",
    breaks: "F18 — the rule exists and the moment it is for goes past in silence"
  },
  {
    file: ITEM,
    name: "A11b THE RULING REVERSED: the class is refused instead of warned",
    from: "    ui.notifications?.warn(classMinimumWarning(shortfall));",
    to: "    ui.notifications?.warn(classMinimumWarning(shortfall));\n    return false;",
    breaks: "F19 — Graham ruled warn-never-refuse on 15 Sept 2026; this is option C, one line away"
  },
  {
    file: ITEM,
    name: "A11c every NPC and companion is scolded too",
    from: '    if (actor?.documentName !== "Actor" || actor.type !== "character") return;',
    to: '    if (actor?.documentName !== "Actor") return;',
    breaks: "F20 — a stat block is not a player building a character against the class entry"
  },
  {
    file: SHEET,
    name: "A12 the banner reads the display row rather than the actor",
    from: "      ? classMinimumShortfall(classItemOf(actor), abilityScoresOf(actor))",
    to: "      ? classMinimumShortfall(context.identitySummary.class, abilityScoresOf(actor))",
    breaks: "F21/F22 — that row's name is whatever the feat display rule rewrote it to"
  },
  {
    file: SHEET,
    name: "A12b the banner gets its own sentence",
    from: "    context.classMinimumWarning = classMinimumWarning(context.classMinimum);",
    to: '    context.classMinimumWarning = context.classMinimum ? "Check your ability scores." : "";',
    breaks: "F21a — two wordings for one rule is how the notification and the banner start disagreeing"
  },
  {
    file: HBS,
    name: "A13 the sheet stops showing it",
    from: "      {{#if classMinimumWarning}}",
    to: "      {{#if neverSetByAnything}}",
    breaks: "F23 — a notification lasts five seconds and the character lasts a campaign"
  },
  {
    file: ITEM_HBS,
    name: "A13b the class field goes back to claiming nothing reads it",
    from: "The &quot;(min +N)&quot; bracket is READ",
    to: "Guidance for the player — not enforced",
    breaks: "F24 — a tooltip that contradicts the code teaches the next reader to stop looking"
  },

  /* ---------------- the entries and their mechanisms ---------------- */
  {
    file: ACTOR,
    name: "A14 the tradition's ability wins over the class's own",
    from: "      system.magic.castingAbility = system.progression.magicalAbility;",
    to: "      system.magic.castingAbility = TRADITIONS[system.magic.tradition]?.ability\n        ?? system.progression.magicalAbility;",
    breaks: "C5b — the Crusader is a DIVINITY caster on Charisma, and would silently cast off Wisdom"
  },
  {
    file: MEMO,
    name: "A15 the memorisation budget loses its doubling",
    from: "  return 2 + 2 * Math.max(0, Math.floor(Number(level) || 0));",
    to: "  return 2 + Math.max(0, Math.floor(Number(level) || 0));",
    breaks: "E4 — '2 + (level x 2)', printed in both learned casters' entries"
  },
  {
    file: REP,
    name: "A16 the repertoire schedule starts counting from 2nd level",
    // Repointed at 3.563.0: the schedule is data now, and the core
    // default is where "from 3rd" lives.
    from: "  pickStep: 2, pickFrom: 3, swapStep: 2, swapFrom: 5",
    to: "  pickStep: 2, pickFrom: 2, swapStep: 2, swapFrom: 5",
    breaks: "E5 — 'At 3rd level and then every two levels thereafter (5th, 7th etc)'"
  },
  {
    file: BARD,
    name: "A17 Book of Notations gains a slot every fourth level",
    from: "  return 1 + Math.floor(value / 5);",
    to: "  return 1 + Math.floor(value / 4);",
    breaks: "E6 — 'At 5th level and then every 5 levels thereafter'"
  },
  /* ---------------- block 5: Trap Finder's DB third (D2/R1) ---------------- */
  {
    file: ROGUE_M,
    name: "B1 every attacker counts as a trap",
    from: "  if (!attackerIsTrap) return 0;",
    to: "  if (false) return 0;",
    breaks: "K4 — a permanent +2 DB against everything is not what the book printed"
  },
  {
    file: ROGUE_M,
    name: "B2 the bonus is handed to characters who never took Trap Finder",
    from: '  if (!hasClassAbility(actor, "Trap Finder")) return 0;',
    to: "  if (false) return 0;",
    breaks: "K5 — it is a class ability, not a house rule about traps"
  },
  {
    file: ROGUE_M,
    name: "B3 the DB third stops rising at 10 Perception ranks",
    from: "  return trapFinderValue(perceptionRanks);",
    to: "  return 2;",
    breaks: "K3 — the printed +4 band governs all three bonuses, not two of them"
  },
  {
    file: ROGUE_M,
    name: "B4 a trap tagged on its own statblock is not recognised",
    from: "  if (attackerSystem && hasCreatureTrait(attackerSystem, TRAP_TRAIT)) return true;",
    to: "  if (false) return true;",
    breaks: "K6/K7 — the trait line and the creature type are two of the three places a GM marks one"
  },
  {
    file: ROGUE_M,
    name: "B5 a trap tagged on the ATTACK is not recognised",
    from: '  return hasTrait(String(weaponTraits ?? ""), TRAP_TRAIT);',
    to: "  return false;",
    breaks: "K8 — a trapped chest is an ordinary actor whose attack is the trap"
  },
  {
    file: ATTACK,
    name: "B6 THE SILENT ONE: the bonus is computed and never added",
    from: "      + trapFinderDB + (aidDefence?.amount ?? 0)",
    to: "      + (aidDefence?.amount ?? 0)",
    breaks: "K13 — every unit test of the rule still passes and the attack still rolls against the old DB"
  },
  {
    file: ATTACK,
    name: "B7 the card stops naming the bonus it applied",
    from: '        `<em>${targetActor?.name ?? "The target"} has Trap Finder and this attack carries the trap trait: +${trapFinderDB} DB (circumstance).</em>`',
    to: '        `<em>${targetActor?.name ?? "The target"} defends.</em>`',
    breaks: "K14 — a number that moves with no line explaining it is how a player stops trusting the sheet"
  },
  {
    file: FW,
    name: "B8 the hint stops saying which word turns the rule on",
    from: '    + "carries the <strong>trap</strong> trait — put it on the trap\'s own <strong>Traits</strong> "',
    to: '    + "trait is set correctly — ask your GM. "',
    breaks: "K15/K15a — R1 was 'read the trait, and say how to set it'; this drops the second half"
  },

  {
    file: FW,
    name: "B8b the hint points at the channel a GM cannot set",
    from: '    + "line, or on the attack it makes, and the attack card will name the bonus."',
    to: '    + "line, its creature type, or the attack it makes, and the attack card will name the bonus."',
    breaks: "K15a — creatureType is derived from a creature-type item, and no Trap one exists"
  },

  /* ---------------- block 5: Terrain Mastery (D1) ---------------- */
  {
    file: FW,
    name: "B9 THE ORIGINAL DEFECT: the toggle stops carrying the terrain flag",
    from: '      await item?.setFlag?.(SYSTEM_ID, "ignoresDifficultTerrain", true);',
    to: "      void 0;",
    breaks: "J1 — back to a card that states the rule while the system does nothing about it"
  },
  {
    file: FW,
    name: "B10 the relief never goes away again",
    from: '        await item?.unsetFlag?.(SYSTEM_ID, "ignoresDifficultTerrain");',
    to: "        void 0;",
    breaks: "J2 — a Ranger would ignore difficult ground for the rest of the campaign"
  },
  {
    file: FW,
    name: "B11 the card goes back to telling the player to do it themselves",
    from: '        line("You ignore natural difficult terrain and treat natural formidable terrain as difficult terrain — <strong>applied to your movement automatically</strong> while this is on."),',
    to: '        line("You ignore natural difficult terrain and treat natural formidable terrain as difficult terrain — apply to your own movement."),',
    breaks: "J4 — the exact sentence the audit found, restored"
  },
  {
    file: PASSIVE,
    name: "B12 the movement rule stops reading the flag off items",
    from: "  for (const item of Array.from(actor?.items ?? [])) if (carries(item)) return named(item);",
    to: "  for (const item of []) if (carries(item)) return named(item);",
    breaks: "J5 — Terrain Mastery, Wild Stride and the Silvarni all write there; this is the reading end"
  },

  /* ---------------- block 5: Press the Advantage (D3) ---------------- */
  {
    file: DETECT,
    name: "B13 the prompt goes to the creature that was just dropped",
    from: "        .then((m) => m.maybePromptPressTheAdvantage(\n          actor,",
    to: "        .then((m) => m.maybePromptPressTheAdvantage(\n          targetActor,",
    breaks: "L1 — the Fighter earned the free action, not their victim"
  },
  {
    file: DETECT,
    name: "B14 the prompt is gated on a second foe, as Cleave is",
    from: '    if (dropped) {\n      import("./attack-workflow.mjs")',
    to: '    if (dropped && others?.length) {\n      import("./attack-workflow.mjs")',
    breaks: "L3 — the book asks only that you disabled an enemy"
  },
  {
    file: ATTACK,
    name: "B15 the critical trigger stops firing",
    from: "  if (outcome.critical) {\n    await maybePromptPressTheAdvantage(",
    to: "  if (false) {\n    await maybePromptPressTheAdvantage(",
    breaks: "L4 — the new trigger must be added TO the old one, not instead of it"
  },

  /* ---------------- block 5: the scaling (M) ---------------- */
  {
    file: FIGHTER_M,
    name: "B16 Armour Exemplar keeps climbing past its printed cap",
    from: "  return Math.min(4, 1 + Math.floor((value - 3) / 4));",
    to: "  return 1 + Math.floor((value - 3) / 4);",
    breaks: "M1a — 'to a maximum -4 reduction... and a +4 increase'"
  },
  {
    file: ROGUE_M,
    name: "B17 Sneak Attack scales every four Stealth ranks",
    from: "  return 1 + Math.floor(ranks / 3);",
    to: "  return 1 + Math.floor(ranks / 4);",
    breaks: "M10 — 'when your stealth skill reaches rank 3 and then for every 3 additional ranks'"
  },
  {
    file: SPELLBOOK,
    name: "B18 the Wizard's book gains two spells at 1st level as well",
    from: "  return opening + 2 * (value - 1);",
    to: "  return opening + 2 * value;",
    breaks: "M16/M17 — the six are the opening batch; the two arrive when you GAIN a level"
  },
  {
    file: WIZARD_M,
    name: "B19 Warding's immunity arrives a level early",
    from: '  return Math.floor(Number(level) || 0) >= 20 ? "immunities" : "resistances";',
    to: '  return Math.floor(Number(level) || 0) >= 19 ? "immunities" : "resistances";',
    breaks: "M15 — 'At 20th level, this resistance changes to immunity'"
  },
  {
    file: DRUID,
    name: "A18 Wild Shape's extra uses start at 3rd rather than 5th",
    from: "  return 1 + Math.floor((value - 3) / 2);",
    to: "  return 1 + Math.floor((value - 1) / 2);",
    breaks: "E7 — 'At 5th level and then every two levels thereafter... an additional time each day'"
  },

  /* ---- N: what replaced the blank cell (R1, 16 September 2026) ---- */
  {
    file: PROG,
    name: "N1 THE TRADITION STOPS ADDING ITS ABILITY TO A NON-CASTER",
    from: '  if (!String(tradition ?? "").trim()) return 0;\n  return Number(abilityTotal) || 0;',
    to: "  return 0;",
    breaks: "N5/N5b — Graham, 16 Sept 2026: a Magical Tradition always adds it, caster or not"
  },
  {
    file: PROG,
    name: "N1b it adds the ability to everyone, tradition or not",
    from: '  if (!String(tradition ?? "").trim()) return 0;',
    to: "  if (false) return 0;",
    breaks: "N6 — a monster or a half-built sheet would collect the schema's default ability"
  },
  {
    file: PROG,
    name: "N2 having a class at all is enough to make it a caster",
    from: '  return Boolean(String(progression?.magicalAbility ?? "").trim());',
    to: "  return Boolean(progression);",
    breaks: "N2/N5 — the Fighter and the Rogue would both start adding an ability score to their power points"
  },
  {
    file: PROG,
    name: "N2b THE TRADITION IS MISTAKEN FOR THE ABILITY",
    from: '  return Boolean(String(progression?.magicalAbility ?? "").trim());',
    to: '  return Boolean(String(progression?.magicalTradition ?? "").trim());',
    breaks: "N3b — page 52 REQUIRES a non-caster to pick a tradition, so a tradition can never be the test"
  },
  {
    file: PROG,
    name: "N3 casterLevel and pp go back to being absences",
    from: 'export const NULLABLE_COLUMNS = Object.freeze(["bonusFeats"]);',
    to: 'export const NULLABLE_COLUMNS = Object.freeze(["casterLevel", "pp", "bonusFeats"]);',
    breaks: "D5 — no dash is left in any class table in the 3.8 book"
  },
  {
    file: FEATCAST,
    name: "N4 a printed zero becomes a caster level the class granted",
    from: "  if (classCasts && classCasterLevel !== null && classCasterLevel !== undefined) {",
    to: "  if (classCasterLevel !== null && classCasterLevel !== undefined) {",
    breaks: "N8 — a Fighter's sheet would lock its caster-level box and the archetype note would vanish"
  },
  {
    file: ACTOR,
    name: "N5 the actor stops telling resolvedCasterLevel whether the class casts",
    from: "      classCasts: classCasts(system.progression),",
    to: "      classCasts: true,",
    breaks: "N8 via the actor — the same regression, arriving through the call instead of the rule"
  },
  {
    file: ACTOR,
    name: "N6 THE 3.558.0 SHAPE RETURNS: the PP bonus is gated on the class again",
    from: "      const abilityBonus = powerPointAbilityBonus({",
    to: "      const abilityBonus = classCasts(system.progression) && powerPointAbilityBonus({",
    breaks: "N12 — a Fighter would add its tradition's ability to Spellcraft and be refused it on the PP line"
  }
];

/* ────────────────────────────────────────────────────────────────── *
 * THE PACKS. Sections B, C, D, E and G read them, and a class table is
 * hand-authored data whose failure mode is one plausible digit.
 * ────────────────────────────────────────────────────────────────── */
async function withPack(pack, name, mutate, body) {
  const dir = path.join(SYSTEM_ROOT, "packs", pack);
  const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  let key = null;
  let original = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (v?.name === name && k.startsWith("!items!") && !k.slice(7).includes("!")) {
        key = k; original = JSON.parse(JSON.stringify(v)); break;
      }
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(original));
    mutate(mutated);
    await db.put(key, mutated);
    await db.close();
    return await body();
  } finally {
    const restore = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
    await restore.open();
    if (key && original) await restore.put(key, original);
    const back = key ? await restore.get(key).catch(() => null) : null;
    await restore.close();
    if (key && JSON.stringify(back) !== JSON.stringify(original)) {
      process.stderr.write(`mutate-classes: FAILED TO RESTORE ${pack}/${name} — the pack is dirty.\n`);
      process.exit(3);
    }
  }
}

const PACK_MUTATIONS = [
  {
    name: "P1 ONE DIGIT: the Bard's 10th-level attack bonus reads 8",
    pack: "classes", item: "Bard",
    mutate: (doc) => { doc.system.progression[9].bab = 8; },
    breaks: "D2 — the whole reason this file exists; nothing at the table would ever disagree"
  },
  {
    name: "P2 the Crusader's 20th-level power points lose a digit",
    pack: "classes", item: "Crusader",
    mutate: (doc) => { doc.system.progression[19].pp = 4; },
    breaks: "D2 — a twentieth-level Crusader casting on four power points"
  },
  {
    name: "P3 a table with no Bonus Feats column is given a zero in one",
    pack: "classes", item: "Cleric",
    mutate: (doc) => { doc.system.progression[0].bonusFeats = 0; },
    breaks: "D2/D4 — an absence written down as a number stops being an absence"
  },
  {
    name: "P4 a class row is numbered out of sequence",
    pack: "classes", item: "Druid",
    mutate: (doc) => { doc.system.progression[12].level = 14; },
    breaks: "D1/D2 — rows are matched on their OWN level, so this hands 13th the 14th's numbers"
  },
  {
    name: "P5 the Crusader becomes an Adept",
    pack: "classes", item: "Crusader",
    mutate: (doc) => { doc.system.classType = "Adept"; },
    breaks: "B3 — the class-type table is what every class feat's trait match reads"
  },
  {
    name: "P6 the Bard's hit points per level rise by two",
    pack: "classes", item: "Bard",
    mutate: (doc) => { doc.system.hitPoints = 10; },
    breaks: "C1 — '8 + Con per level', multiplied by every level the character has"
  },
  {
    name: "P7 E2 RETURNS: the Druid's key abilities regain the comma",
    pack: "classes", item: "Druid",
    mutate: (doc) => { doc.system.keyAbilityScores = "Constitution, (min +2), Dexterity, Wisdom"; },
    breaks: "C1/F1 — the parser refuses that shape, so the Druid alone would get no warning"
  },
  {
    name: "P8 Bardic Performance stops being a Charisma +1 pool",
    pack: "abilities", item: "Bardic Performance",
    mutate: (doc) => { doc.system.usesPerDay = "Charisma"; },
    breaks: "E1 — 'an amount of times equal to your Cha +1 each day', and the +1 is the whole of a 0-Cha Bard's"
  },
  {
    name: "P9 a class table loses a row",
    pack: "classes", item: "Wizard",
    mutate: (doc) => { doc.system.progression = doc.system.progression.slice(0, 19); },
    breaks: "D1 — twenty printed rows, and the twentieth is the one nobody notices missing"
  },
  {
    name: "P10 ONE DIGIT: the Wizard's 20th-level attack bonus reads 15",
    pack: "classes", item: "Wizard",
    mutate: (doc) => { doc.system.progression[19].bab = 15; },
    breaks: "D2 — the Wizard has the slowest BAB in the book and 15 is the Druid's"
  },
  {
    name: "P11 a non-caster is given power points",
    pack: "classes", item: "Rogue",
    // REWRITTEN AT 3.558.0. This used to set a null cell to 0, because
    // the book printed "-" and the two meant different things. They do
    // not any more: the 3.8 revision prints 0, Graham ruled it a real
    // zero, and `pp` left NULLABLE_COLUMNS — so a null in that cell is
    // now coerced to 0 and reads correctly, which makes the old edit
    // invisible rather than caught. The edit that still matters is the
    // one that puts a NUMBER there.
    mutate: (doc) => { doc.system.progression[0].pp = 4; },
    breaks: "D2 — the Rogue's table prints 0 at every level, and page 56 gives it no spell casting abilities"
  },
  {
    name: "P12 a class loses one of its printed abilities",
    pack: "classes", item: "Fighter",
    mutate: (doc) => {
      doc.system.classAbilities = String(doc.system.classAbilities)
        .replace(", 13: Weapon Supremacy", "");
    },
    breaks: "G1 — a 13th-level Fighter would simply never be given it"
  },
  {
    name: "P13 an ability register loses an apostrophe",
    pack: "classes", item: "Rogue",
    mutate: (doc) => {
      doc.system.classAbilities = String(doc.system.classAbilities)
        .replace("Scoundrel's Luck", "Scoundrels Luck");
    },
    breaks: "G1/G2 — it resolves to nothing, and looks exactly like a correct register"
  },
  {
    name: "P14 a Wizard school's class skill changes",
    pack: "wizard-schools", item: "Alteration",
    mutate: (doc) => { doc.system.classSkill = "Arcana"; },
    breaks: "H2 — 'Skill Crafting', and the school grants it automatically"
  },
  {
    name: "P15 a school loses its 7th-level specialist spell",
    pack: "wizard-schools", item: "Insight",
    mutate: (doc) => { doc.system.specialistSpells = "1: Seer's Vision"; },
    breaks: "H2/H3 — 'a unique Specialist Spell at 1st level and another at 7th'"
  },
  {
    name: "P16 the school picker stops offering one of the eight",
    pack: "abilities", item: "Wizard School",
    mutate: (doc) => {
      doc.flags["trg-prime"].schoolChoices =
        doc.flags["trg-prime"].schoolChoices.filter((s) => s !== "Translocation");
    },
    breaks: "H4 — a school in the pack that nothing offers is a school no Wizard can take"
  },
  {
    name: "P17 a path ability offers an archetype that is not a feat",
    pack: "abilities", item: "Martial Training",
    mutate: (doc) => { doc.flags["trg-prime"].archetypeChoices.push("Swashbuckler"); },
    breaks: "I1/I2 — the chooser grants it directly, so a wrong name hands over nothing"
  },
  {
    name: "P18 a named grant is misspelt",
    pack: "classes", item: "Ranger",
    mutate: (doc) => { doc.system.grantedFeats = "1: Favored Terrain"; },
    breaks: "C1/I3 — one letter, and a 1st-level Ranger gets no feat at all"
  },
  {
    name: "P19 the Rogue's Evasion is folded into its Bonus Feats column",
    pack: "classes", item: "Rogue",
    mutate: (doc) => {
      for (const row of doc.system.progression) {
        if (Number(row.level) >= 2) row.bonusFeats = Number(row.bonusFeats) + 1;
      }
    },
    breaks: "D2/I5 — a named grant is free and sits OUTSIDE the column; this pays for it twice"
  },
  {
    name: "P20 the Wizard's spell book opens with four instead of six",
    pack: "classes", item: "Wizard",
    mutate: (doc) => { doc.system.spellBookFirstPicks = 4; },
    breaks: "C1/M17 — 'any six PP 2 arcane spells' at 1st level"
  },
  {
    name: "P21 the Ranger's repertoire stops being narrowed to utility",
    pack: "classes", item: "Ranger",
    mutate: (doc) => { doc.system.repertoireCategory = ""; },
    breaks: "C1 — 'any two PP 2 UTILITY verdant spells'; without it a Ranger picks attack spells"
  },
  {
    name: "P22 a class skill drops off the printed line",
    pack: "classes", item: "Fighter",
    mutate: (doc) => {
      doc.system.classSkills = String(doc.system.classSkills).replace("Diplomacy, ", "");
    },
    breaks: "C1 — the class bonus is applied from this line, so the skill silently loses it"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([
  CONFIG, FEATS, ATTRS, PROG, ITEM, ACTOR, SHEET, MEMO, REP, BARD, DRUID, HBS, ITEM_HBS,
  ROGUE_M, FIGHTER_M, WIZARD_M, ATTACK, PASSIVE, DETECT, FEATCAST, FW, SPELLBOOK, CHECK
]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-classes: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

for (const m of PACK_MUTATIONS) {
  const outcome = await withPack(m.pack, m.item, m.mutate, async () => (run() ? "SURVIVED" : "caught"));
  results.push({ name: m.name, state: outcome, breaks: m.breaks });
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-classes: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-classes: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
