#!/usr/bin/env node
/**
 * verify-backgrounds — the 42 backgrounds of pages 32–37, field by
 * field, and the effects that carry their skill bonuses. NEW at 3.553.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS.
 *
 * Auditing pages 31–40 on 15 September 2026 I found the backgrounds in
 * excellent shape — 42 of 42 present, every bonus feat resolving, every
 * skill-bonus effect landing on exactly the declared skills — and
 * nothing whatsoever checking any of it. `verify-chapter1` pins the 42
 * NAMES and the identity lock; `verify-starting-wealth` pins the wealth
 * column. Between them sits 42 rows of hand-authored pack data whose
 * failure mode is silence: an effect that writes
 * `system.skills.senseMotive.class` grants the bonus, and one that
 * writes `system.skills.sensemotive.class` grants nothing at all, and
 * both look identical in the compendium browser.
 *
 * So the printed register below is the BOOK's, transcribed once, and
 * everything else is checked against it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FOUR ERRATA, ruled by Graham on 15 September 2026 (R4) — and
 * THREE OF THE FOUR ARE NOW FIXED IN THE BOOK. The 3.8 revision, read
 * on 16 September 2026, carries his corrections:
 *
 *   - Squire printed "Athletics, Culture Handle Animal" — a missing
 *     comma, three skills. FIXED: the book now prints the comma.
 *   - Martial Artist printed "Weapon Focus (Unarmed)". There is no
 *     Unarmed weapon group; unarmed strikes live in BRAWLING, and the
 *     pack grants Weapon Focus qualified to it. FIXED: the book now
 *     prints "Weapon Focus (Brawling)".
 *   - Miner prints "Favoured Terrain (Underground)", granted and
 *     qualified the same way. STILL PRINTED THAT WAY — the one of the
 *     four the revision did not touch, so this note is still live.
 *   - Outrider printed "Terrain Lore (Plains)"; the pack names it Plains
 *     Lore, matching every other terrain lore in the system. FIXED: the
 *     book now prints "Plains Lore".
 *
 * Kept rather than deleted, marked rather than rewritten. A reader who
 * meets one of these pack rows wants to know it was once a divergence
 * and how it stopped being one; a reader who finds "Weapon Focus
 * (Unarmed)" in an old note and the book saying Brawling wants to know
 * which way round the fix went.
 *
 * AND TWO DELIBERATE SHAPES, also ruled that day:
 *
 *   - R2: the Entertainer's "Bonus Perform Specialty" is a skill
 *     SPECIALTY, not a specialist skill, and it is the one background
 *     with no specialist skill at all. "The entertainer is working
 *     correctly."
 *   - R3: the Cook's "+1 to Crafting (Cooking)" stays a tick in the
 *     check dialog. The conditional engine has no specialty axis and a
 *     skill roll never records which specialty is in use, so the honest
 *     options were a manual tick or a wrong automatic bonus.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { SKILLS } from "../module/config.mjs";

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

/**
 * THE PRINTED REGISTER, pages 32–37. A blank `feat` is a background the
 * book gives no bonus feat (it trades it for something else); a blank
 * `specialist` is one whose specialist skill is a CHOICE rather than a
 * name, checked as such below.
 */
const PRINTED = [
  { name: "Acolyte", feat: "Theologian", skills: "Culture, Religion, Meditation", specialist: "Religious Doctrine" },
  { name: "Acrobat", feat: "Sure Feet", skills: "Acrobatics, Athletics, Perform", specialist: "Circus Lore" },
  { name: "Animal Friend", feat: "Animal Affinity", skills: "Handle Animal, Nature, Survival", specialist: "Animal Lore" },
  { name: "Apprentice", feat: "Specialist Crafter", skills: "Artistry, Crafting, Culture", specialist: "" },
  { name: "Arcane Apprentice", feat: "Magical Crafting", skills: "Arcana, Mental Focus, Power Manipulation", specialist: "Spell Lore" },
  { name: "Archaeologist", feat: "", skills: "Culture, Linguistics, Survival", specialist: "Archaeology" },
  { name: "Barbarian", feat: "Toughness", skills: "Athletics, Nature, Survival", specialist: "Hunting" },
  { name: "Barkeep", feat: "Keen Insight", skills: "Diplomacy, Culture, Sense Motive", specialist: "Barkeeping" },
  { name: "Bounty Hunter", feat: "Experienced Tracker", skills: "Culture, Sense Motive, Survival", specialist: "Legal Lore" },
  { name: "Charlatan", feat: "Silver Tongue", skills: "Culture, Deception, Diplomacy", specialist: "Underworld" },
  { name: "Cook", feat: "Seasoned", skills: "Crafting (Cooking), Culture, Survival", specialist: "Culinary Lore" },
  { name: "Criminal", feat: "Canny Smuggler", skills: "Deception, Stealth, Thievery", specialist: "Underworld" },
  { name: "Cultist", feat: "Schooled in Secrets", skills: "Deception, Religion, Sense Motive", specialist: "" },
  { name: "Detective", feat: "Streetwise", skills: "Culture, Perception, Sense Motive", specialist: "Law Enforcement" },
  { name: "Diplomat", feat: "", skills: "Culture, Diplomacy, Sense Motive", specialist: "Regional Lore" },
  { name: "Entertainer", feat: "Flawless Performance", skills: "Acrobatics, Culture, Perform", specialist: "" },
  { name: "Farmhand", feat: "Great Fortitude", skills: "Athletics, Culture, Survival", specialist: "Farmer" },
  { name: "Field Medic", feat: "Battle Medic", skills: "Medicine, Sense Motive, Survival", specialist: "Warfare" },
  { name: "Fortune Teller", feat: "Visions", skills: "Meditation, Perform, Sense Motive", specialist: "Fortune Telling" },
  { name: "Gambler", feat: "Deft Hands", skills: "Deception, Sense Motive, Thievery", specialist: "Gambling" },
  { name: "Gladiator", feat: "Impressive Performance", skills: "Acrobatics, Athletics, Perform", specialist: "Arena Lore" },
  { name: "Guard", feat: "Urban Tracker", skills: "Diplomacy, Intimidate, Perception", specialist: "Law Enforcement" },
  { name: "Herbalist", feat: "Natural Medicine", skills: "Crafting, Nature, Survival", specialist: "Herb Lore" },
  { name: "Hermit", feat: "Questionable Source", skills: "Culture, Nature, Survival", specialist: "" },
  { name: "Highwayman", feat: "Group Coercion", skills: "Deception, Intimidate, Stealth", specialist: "" },
  { name: "Hunter", feat: "Survey Wildlife", skills: "Nature, Perception, Survival", specialist: "Hunting" },
  { name: "Labourer", feat: "Mettle", skills: "Athletics, Crafting, Mental Focus", specialist: "Manual Labour" },
  { name: "Lay Healer", feat: "", skills: "Medicine", specialist: "Herb Lore" },
  { name: "Martial Artist", feat: "Weapon Focus", skills: "Acrobatics, Meditation, Mental Focus", specialist: "Combat Styles", qualifier: "Brawling" },
  { name: "Merchant", feat: "Wheeler Dealer", skills: "Culture, Deception, Diplomacy", specialist: "Trading" },
  { name: "Miner", feat: "Favoured Terrain", skills: "Crafting, Occultism, Survival", specialist: "Mining", qualifier: "Underground" },
  { name: "Outrider", feat: "Born to Ride", skills: "Handle Animal, Perception, Survival", specialist: "Plains Lore" },
  { name: "Prisoner", feat: "Canny Smuggler", skills: "Deception, Intimidate, Stealth", specialist: "Underworld" },
  { name: "Sailor", feat: "Sure Feet", skills: "Acrobatics, Athletics, Climbing", specialist: "Sailing" },
  { name: "Scholar", feat: "", skills: "", specialist: "" },
  { name: "Scout", feat: "Experienced Tracker", skills: "Nature, Perception, Survival", specialist: "" },
  { name: "Servant Of Nature", feat: "Survey Wildlife", skills: "Handle Animal, Nature, Survival", specialist: "Animal Lore" },
  { name: "Soldier", feat: "Weapon Focus", skills: "Athletics, Culture, Intimidate", specialist: "Warfare" },
  { name: "Squire", feat: "Quick Donning", skills: "Athletics, Culture, Handle Animal", specialist: "Heraldry" },
  { name: "Street Urchin", feat: "Streetwise", skills: "Perception, Stealth, Thievery", specialist: "Urban Lore" },
  { name: "Templar", feat: "Theologian", skills: "Diplomacy, Religion, Mental Focus", specialist: "" },
  { name: "Weaver", feat: "", skills: "Meditation, Mental Focus, Power Manipulation", specialist: "Aberrant Lore" },
];

/* ================================================================== *
 * READ BOTH PACKS ONCE
 * ================================================================== */
async function dump(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), {
    keyEncoding: "utf8", valueEncoding: "json"
  });
  await db.open();
  const items = new Map();
  const effects = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!")) items.set(value._id, value);
      else if (key.startsWith("!items.effects!")) {
        const parent = key.slice("!items.effects!".length).split(".")[0];
        if (!effects.has(parent)) effects.set(parent, []);
        effects.get(parent).push(value);
      }
    }
  } finally { await db.close(); }
  return { items, effects };
}

const bgPack = await dump("backgrounds");
const featPack = await dump("feats");
const backgrounds = [...bgPack.items.values()].filter((v) => v.type === "background");
const byName = new Map(backgrounds.map((b) => [b.name.toLowerCase(), b]));
const featNames = new Set(
  [...featPack.items.values()].filter((v) => v.type === "feat").map((v) => v.name.toLowerCase())
);
const flagsOf = (row) => row?.flags?.["trg-prime"] ?? {};
const SKILL_KEYS = Object.keys(SKILLS);
const skillKeyFor = (label) => {
  const wanted = String(label).replace(/\(.*\)/, "").trim().toLowerCase().replace(/\s+/g, "");
  return SKILL_KEYS.find((k) => k.toLowerCase() === wanted) ?? null;
};

/* ================================================================== *
 * A. THE REGISTER ITSELF
 * ================================================================== */
eq("A1 the pack holds one background per printed entry", backgrounds.length, PRINTED.length);
{
  const missing = PRINTED.filter((p) => !byName.has(p.name.toLowerCase())).map((p) => p.name);
  eq("A2 and every printed background is one of them", missing, []);
  const extra = backgrounds
    .filter((b) => !PRINTED.some((p) => p.name.toLowerCase() === b.name.toLowerCase()))
    .map((b) => b.name);
  eq("A3 with nothing in the pack the book does not print", extra, []);
}

/* ================================================================== *
 * B. BONUS FEAT — and that it RESOLVES
 *
 * A grant names a feat by name and `matchGrants` looks it up. A name
 * with a typo in it grants nothing and says "unresolved" on a card
 * nobody re-reads, so the name existing in the feats pack is the half
 * of this that actually bites.
 * ================================================================== */
{
  const wrong = [];
  const unresolvable = [];
  for (const printed of PRINTED) {
    const row = byName.get(printed.name.toLowerCase());
    if (!row) continue;
    const granted = String(row.system?.grantedFeats ?? "").trim();
    if (granted.toLowerCase() !== printed.feat.toLowerCase()) {
      wrong.push(`${printed.name}: printed "${printed.feat}", pack "${granted}"`);
    }
    for (const name of granted.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!featNames.has(name.toLowerCase())) unresolvable.push(`${printed.name} -> ${name}`);
    }
  }
  eq("B1 every background grants the feat the book prints", wrong, []);
  eq("B2 and every granted feat is a real feat in the pack", unresolvable, []);
  // The five that trade their bonus feat away, named so that filling one
  // in by accident fails rather than passing quietly.
  eq("B3 exactly the five backgrounds that trade their feat away have none",
    PRINTED.filter((p) => !p.feat).map((p) => p.name),
    ["Archaeologist", "Diplomat", "Lay Healer", "Scholar", "Weaver"]);
}

/* ================================================================== *
 * C. SKILL BONUSES — DECLARED AND DELIVERED
 *
 * Two different failures. The declaration can disagree with the book,
 * and the EFFECT can disagree with the declaration — and only the
 * second one is invisible, because an effect keyed on a skill that does
 * not exist applies silently to nothing.
 * ================================================================== */
{
  const declared = [];
  for (const printed of PRINTED) {
    const row = byName.get(printed.name.toLowerCase());
    if (!row || !printed.skills) continue;
    const packText = String(row.system?.skillBonuses ?? "").replace(/\s+/g, " ").trim();
    if (packText.toLowerCase() !== printed.skills.toLowerCase()) {
      declared.push(`${printed.name}: printed "${printed.skills}", pack "${packText}"`);
    }
  }
  eq("C1 every background declares the skills the book prints", declared, []);

  const delivered = [];
  let effectsSeen = 0;
  for (const row of backgrounds) {
    const text = String(row.system?.skillBonuses ?? "");
    if (!text.trim() || /choose/i.test(text)) continue;          // Scholar picks its three
    const want = text.split(",").map((s) => s.trim()).filter(Boolean).map(skillKeyFor);
    if (want.some((w) => !w)) { delivered.push(`${row.name}: unreadable skill label in "${text}"`); continue; }
    const changes = (bgPack.effects.get(row._id) ?? [])
      .filter((e) => !e.disabled)
      .flatMap((e) => e.changes ?? [])
      .filter((c) => /^system\.skills\.[A-Za-z]+\.class$/.test(c.key));
    effectsSeen += changes.length;
    const got = changes.map((c) => c.key.split(".")[2]);
    // Cook is the one exception, and it is R3: its Crafting bonus is
    // scoped to the Cooking specialty, so it lives as a conditional
    // rather than as a flat +1 to every Crafting check.
    const expect = row.name === "Cook" ? want.filter((w) => w !== "crafting") : want;
    const missing = expect.filter((w) => !got.includes(w));
    const extra = got.filter((g) => !expect.includes(g));
    const malformed = changes.filter((c) => String(c.value) !== "1" || c.mode !== 0)
      .map((c) => `${c.key}=${c.value}/mode ${c.mode}`);
    if (missing.length || extra.length || malformed.length) {
      delivered.push(`${row.name}: missing [${missing}] unexpected [${extra}] malformed [${malformed}]`);
    }
  }
  ok("C2 the sweep read the skill-bonus effects", effectsSeen >= 100, `${effectsSeen} changes`);
  eq("C3 and each grants +1 class to exactly the skills it declares", delivered, []);
}

/* ================================================================== *
 * D. SPECIALIST SKILLS — A NAME, OR A PROMPT
 * ================================================================== */
{
  const wrong = [];
  for (const printed of PRINTED) {
    const row = byName.get(printed.name.toLowerCase());
    if (!row) continue;
    const flags = flagsOf(row);
    const named = String(flags.grantedSpecialistSkills ?? "").trim();
    if (printed.specialist) {
      if (named.toLowerCase() !== printed.specialist.toLowerCase()) {
        wrong.push(`${printed.name}: printed "${printed.specialist}", grants "${named}"`);
      }
    } else if (!named && !flags.specialistChoice && !flags.skillChoice && row.name !== "Entertainer") {
      wrong.push(`${printed.name}: names no specialist skill and asks for none`);
    }
  }
  eq("D1 every background grants the specialist skill it prints, or asks for it", wrong, []);

  // A PROMPT NOBODY CAN REACH IS NOT A PROMPT. Every choice flag must
  // have a Use handler behind it, or the card's "press Use on X" is a
  // lie — which is exactly the shape the Human's ethnicity lore was in.
  const fw = strip(read("module", "feats-workflow.mjs"));
  const registry = new Set([...fw.matchAll(/\n {2}"([^"]+)": \{/g)].map((m) => m[1]));
  const unreachable = backgrounds
    .filter((b) => ["specialistChoice", "skillChoice", "spellChoice"].some((f) => flagsOf(b)[f]))
    .filter((b) => !registry.has(b.name.toLowerCase()))
    .map((b) => b.name);
  eq("D2 every background that asks a question has a Use handler", unreachable, []);

  // ARCHAEOLOGIST IS TWO SPECIALIST SKILLS, not one: "Archaeology, One
  // Ancient Civilisation Lore". A named one AND a prompt.
  const arch = byName.get("archaeologist");
  ok("D3 Archaeologist grants Archaeology and asks for the civilisation",
    String(flagsOf(arch).grantedSpecialistSkills ?? "").toLowerCase() === "archaeology"
      && Boolean(flagsOf(arch).specialistChoice));
  // SCHOLAR IS TWO LORES, from one prompt.
  eq("D4 Scholar's prompt asks for two", Number(flagsOf(byName.get("scholar")).specialistChoice?.count), 2);
}

/* ================================================================== *
 * E. THE SPECIALS — what five backgrounds trade their feat for
 * ================================================================== */
{
  const diplomat = byName.get("diplomat");
  ok("E1 the Diplomat begins play with two additional languages",
    /^2\s/.test(String(diplomat.system?.languageChoices ?? "")),
    `languageChoices is "${diplomat.system?.languageChoices ?? ""}"`);

  const layHealer = byName.get("lay healer");
  eq("E2 the Lay Healer is granted Lay On Hands",
    String(layHealer.system?.grantedSpells ?? "").trim(), "Lay On Hands");
  const fw = strip(read("module", "feats-workflow.mjs"));
  ok("E3 and the additional power point is a recorded grant, not prose",
    /\{ background: "Lay Healer", value: 1 \}/.test(fw)
      && /path: `?"?system\.resources\.pp\.base"?`?,/.test(fw),
    "the same stored-delta mechanism the racial PP lines use");

  const weaver = byName.get("weaver");
  const spellChoice = flagsOf(weaver).spellChoice;
  ok("E4 the Weaver chooses an ethereal cantrip",
    spellChoice?.tradition === "ethereal" && Number(spellChoice?.ppCost) === 0);
  ok("E5 cast with their own Spellcraft bonus, so NOT innate",
    !spellChoice?.innate && /spellcraft/i.test(String(spellChoice?.note ?? "")),
    "an innate spell resolves from ability and level and never touches Spellcraft");
}

/* ================================================================== *
 * F. THE TWO RULINGS OF 15 SEPTEMBER 2026
 * ================================================================== */
{
  // R2 — "the entertainer is working correctly".
  const ent = byName.get("entertainer");
  const grant = (bgPack.effects.get(ent._id) ?? [])
    .flatMap((e) => flagsOf(e).specialtyGrant ?? []);
  eq("F1 the Entertainer's bonus is a PERFORM SPECIALTY slot",
    grant.map((g) => `${g.skill} x${g.count}`), ["perform x1"]);
  eq("F2 and it names no specialist skill, deliberately",
    String(flagsOf(ent).grantedSpecialistSkills ?? "").trim(), "");

  // R3 — the Cook's bonus stays a tick.
  const cook = byName.get("cook");
  const conditional = (flagsOf(cook).conditionals ?? [])[0];
  ok("F3 the Cook's Crafting bonus is scoped to the Cooking specialty",
    /cooking/i.test(String(conditional?.scope ?? "")) && Number(conditional?.value) === 1
      && conditional?.type === "class");
  eq("F4 offered as a tick rather than applied automatically", conditional?.auto, false);
  const select = (bgPack.effects.get(cook._id) ?? [])
    .flatMap((e) => flagsOf(e).specialtySelect ?? []);
  eq("F5 and the Cooking specialty itself is granted, so the tick has a subject",
    select.map((s) => `${s.skill}:${s.key}`), ["crafting:cooking"]);
}

console.log(`verify-backgrounds: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-backgrounds: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-backgrounds: all pass");
