#!/usr/bin/env node
/**
 * verify-spell-book-fields — the compiled pack says what the book prints.
 *
 * NEW at 3.389.0.
 *
 * WHY THIS EXISTS. The pack is a COMPILATION of the rulebook, and a
 * compilation cannot tell you what it meant to say. Every rule in this
 * system was reverse-engineered from pack data for months while the core
 * book sat unread — and the cost was measurable: a specialist spell's
 * blank tradition read as corruption when it was the printed rule, and
 * sixteen spells silently lost their Targets line on import.
 *
 * Thirteen of those sixteen COULD NOT BE AIMED AT ANYTHING.
 * `spellNeedsTarget` returns `Boolean(targets) || category === "attack"`,
 * so Hold Animal, Hold Kind, Memory Lapse, Qualm and Sleepwalker — save
 * spells that need a victim — never prompted for one. Nothing errored.
 *
 * `tools/spell-book-fields.json` is every printed field of all 691 spell
 * entries, parsed from the book by `tools/parse-spell-book.mjs`. This
 * check diffs the pack against it, so the book is the authority and drift
 * from it is a failure rather than a discovery six months later.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO RULES AND THREE DECLARED EXCEPTIONS
 *
 * Where a difference has a REASON that generalises, it is a rule here
 * rather than a list of names — a list would grow silently as the pack
 * grows, and hide the day a genuinely new difference appears.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const key = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
// SPACE BEFORE A COMMA IS TYPESETTING, NOT DATA. Stone Shield prints
// "arcane , verdant" in the book and "arcane, verdant" in the pack.
const norm = (v) => String(v ?? "").trim().toLowerCase()
  .replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1").replace(/[.;,]+$/, "");

/* ================================================================== *
 * The two rules
 * ================================================================== */

/**
 * RULE 1 — "Tradition all" is written out in the pack.
 *
 * The book prints `Tradition all` on 31 spells; the pack expands it to
 * the four traditions by name. Equivalent, and the expansion is the more
 * useful form because every gate matches on a named tradition.
 */
const ALL_TRADITIONS = "arcane, divinity, ethereal, verdant";
const traditionsAgree = (packV, bookV) => {
  if (norm(packV) === norm(bookV)) return true;
  return norm(bookV) === "all" && norm(packV) === norm(ALL_TRADITIONS);
};

/**
 * RULE 2 — a SAVE-trait spell may carry a save the header does not print.
 *
 * Eight spells have **SAVE** in their trait line, no `Saving Throw` line
 * in the header, and state the save in their body ("invokes a Will
 * save"). The pack extracted it. That is the pack being MORE complete
 * than the header, not inventing data, and all eight fit the same shape —
 * so it is a rule, not eight names.
 */
const saveTraitPresent = (bookEntry) => /\bS\s*AVE\b/i.test(String(bookEntry?.traits ?? ""));
const savesAgree = (packV, bookV, bookEntry) => {
  if (norm(packV) === norm(bookV)) return true;
  return !norm(bookV) && Boolean(norm(packV)) && saveTraitPresent(bookEntry);
};

/* ================================================================== *
 * The declared exceptions — each with a reason, none of them a shrug
 * ================================================================== */

/*
 * ENTRIES RETIRE WHEN THE BOOK CATCHES UP, and Core 3.7 retired FIVE of
 * them on 29 August 2026: Deific Presence's two lines, Shadow Blast's
 * save and Fatigue's trailing comma now print what the pack already held,
 * and Protective Ward's area prints "10-foot-emanation" exactly. Removing a declaration is not
 * losing the evidence — the ruling lives in claude/rulings.md and in the
 * data fix that made the change; what a stale exception costs is a check
 * that has stopped asking a real question, which D1 is here to prevent.
 */
const DECLARED = {
  "NATURESBOUNTY|duration": {
    pack: "1 minute", book: "",
    why: "RULED 2 October 2026 (block 35's R10). The page prints no Duration line, and its body says the food \"deteriorates and disintegrates into dust after 1 minute\" if uneaten — the clock the conjured fruit keeps. Without it the fruit would be permanent, the Goodberry fault of 3.590.0."
  },
  "PROTECTORSSPHERE|area": {
    pack: "15-foot emanation", book: "15-foot radius",
    why: "RULED 2 October 2026 (block 35's R3, \"Yes\"). \"A shielding aura radiates from you, providing protection to both you and your allies\" — the radius is centred on the caster and travels with them. The word is load-bearing: `emanationIsLive` tests the area string for \"emanation\", so as printed the resistance could never follow the caster or leave a creature that walked out. The reference records what the book SAYS, so the difference is declared here."
  },
  "WEAPONSURGE|duration": {
    pack: "until the start of your next turn", book: "",
    why: "RULED 2 October 2026 (block 35's R12). The page prints no Duration line, and its body says \"On your next Strike with that weapon BEFORE THE START OF YOUR NEXT TURN\" — the length the held +1 and the extra die must end on, or both would wait for ever."
  },
  "RESILIENTFORTITUDE|duration": {
    pack: "until the end of the current turn", book: "",
    why: "As WINDYESCAPE|duration (block 34's R3): a reaction resistance \"against the triggering attack or effect\", until the end of the turn it was cast in. Block 35's A5, which needed no ruling — it is the R3 shape exactly."
  },
  "DEATHSDEFIANCE|area": {
    pack: "", book: "20-foot radius",
    why: "RULED 2 October 2026 (block 34's R7, \"Your recommendation\"). The page prints \"Area 20-foot radius\" AND \"Targets 1 living creature per action spent to cast this spell\" — a count of chosen creatures within a circle, not a template that heals whoever stands in it. As an area it healed every creature in the radius, foes included, at 1 AP. It is a targeted spell now, with the radius as its reach (see the range entry beside this one) and a 1/2/3 AP chooser setting how many."
  },
  "DEATHSDEFIANCE|range": {
    pack: "20 feet", book: "",
    why: "The other half of DEATHSDEFIANCE|area: the 20-foot radius the page prints, as the reach of the creatures it targets. Graham's R7 of 2 October 2026."
  },
  "WINDYESCAPE|duration": {
    pack: "until the end of the current turn", book: "",
    why: "RULED 2 October 2026 (block 34's R3, \"Your recommendation\"). A reaction against one attack: cast between the announced hit and its damage (Graham's Cutting Words sequence), and the resistance lasts until the end of the turn it was cast in. The page prints no Duration line because it means \"against this attack\"; a resistance with no duration at all would never end."
  },
  "ELEMENTWARD|duration": {
    pack: "until the end of the current turn", book: "",
    why: "As WINDYESCAPE|duration: a resistance of the chosen type \"from the triggering effect\", until the end of the turn it was cast in (R3)."
  },
  "DEFLECTFLAME|duration": {
    pack: "until the end of the current turn", book: "",
    why: "As WINDYESCAPE|duration: \"fire resistance against the triggering effect\", until the end of the turn it was cast in (R3). Its +4 PP option, \"the resistance lasts for 1 minute\", replaces this through the warp's durationText."
  },
  "RUNEOFWARDING|area": {
    pack: "10-foot radius", book: "10-radius",
    why: "RULED 29 September 2026 (block 31's R10). THE UNIT IS LOAD-BEARING AND ITS ABSENCE MADE THE SPELL IMPOSSIBLE. `parseSpellArea` requires a unit word to read a distance, so \"10-radius\" returned null, no Region could ever be drawn, and the ward built at 3.604.0 would have run against a rune that cannot exist \u2014 a whole release doing nothing behind a screen of green checks. This was very nearly shipped: the authoring tool's first draft carried a comment asserting that both strings parsed, written before anybody measured them. Every other radius spell in the pack \u2014 all 150 \u2014 writes the unit; these two were transcribed without it and nothing had needed to draw them until now. The reference records what the book SAYS, so the difference is declared here rather than corrected there.",
  },
  "RUNEOFWARNING|area": {
    pack: "30-foot radius centred on the object", book: "30-radius centred on the object",
    why: "The same missing unit as Rune Of Warding's, ruled the same day and for the same reason: without it `parseSpellArea` reads nothing, no Region is drawn, and the rune can never glow because it has no area to be entered. See RUNEOFWARDING|area for the measurement.",
  },
  "ICESLICK|duration": {
    pack: "1 minute", book: "",
    why: "RULED 25 September 2026 (block 28). The page prints NO Duration line for Ice Slick \u2014 the whole entry is \"Slick ice coats the area, causing it to become difficult terrain\" \u2014 and the spell's only mechanism is a difficult-terrain REGION, which without a clock is created and never removed. `verify-region-expiry` C2 refuses a claimant whose duration cannot be counted, and it is right to: a permanent patch of ice on a scene, with nothing that will ever take it away, is the exact failure this release exists to remove. Graham ruled 1 minute on the comparison with the other low-tier terrain spells \u2014 Warped Terrain, False Mire and Entangle all print 1 minute; Verdant Snare's 1 round is the outlier and Spike Stones' 1 hour sits at a heavier PP. The pack therefore says something the book does not, which is declared here rather than corrected in the reference, because the reference records what the book SAYS. The spell also carries a note saying whose ruling the minute is."
  },
  "JOLTS|save": {
    pack: "Basic Will", book: "Will",
    why: "RULED 25 September 2026 (block 28, \"your recommendation for all\"), and the FOURTH spell of this exact shape after FLAMINGSPHERE and SURGEOFTHETEMPEST on 29 August and DIVINEDECREE the week before. The header names a save without the word \"basic\" and the body then prints the basic ladder rung by rung: \"Critical The creature is unaffected. Success The target half damage. Failure The creature takes full damage. Fumble As a failure and the target is Stunned 1.\" The word is load-bearing rather than cosmetic \u2014 `parseSpellDefence` reads /basic/ out of this exact string to decide whether damage scales by degree \u2014 so as printed a SUCCESSFUL Will save against Jolts took the full 2d6. Note that Jolts prints only four rungs and no Partial, which is the basic-save machinery's own business and not a reason to withhold the word. The reference records what the book SAYS, so the difference is declared here rather than corrected there."
  },
  "DIVINEDECREE|save": {
    pack: "Basic Fortitude", book: "Fortitude",
    why: "RULED 25 September 2026 (block 27's R1), and the THIRD spell of this exact shape after FLAMINGSPHERE and SURGEOFTHETEMPETST were ruled on 29 August: the header names a save without the word \"basic\" and the prose then prints the basic ladder. Divine Decree's is unambiguous — \"Critical The creature is unaffected. Success The creature takes half damage. Failure ... full damage. Fumble ... double damage\" — which is the basic pattern spelt out rung by rung. The word is load-bearing rather than cosmetic: `parseSpellDefence` reads /basic/ out of this exact string to decide whether damage scales by degree, so as printed a SUCCESSFUL Fortitude save against Divine Decree took the FULL 10d8. Core 3.7 did not amend the header, so the difference stands and is declared here rather than corrected in the reference, which records what the book SAYS."
  },
  "DEFERFATALITY|duration": {
    pack: "1 hour", book: "",
    why: "NOT A DIFFERENCE AT ALL — an extractor limitation, declared rather than papered over. Page 262 prints the duration on the SAME LINE as the trigger: \"Trigger you die; Duration 1 hour\". Every other entry in the Grimoire puts Duration on its own line, so the reference builder finds nothing and records \"\". The book says 1 hour; the pack now says 1 hour (Graham's R5, 24 September 2026, \"Should be 1 hour\"); only the reference disagrees, and it is the reference that is wrong. Left as a declared difference rather than fixed in the extractor because the extractor is deliberately literal — it records what it can see on a line — and teaching it to split a semicolon would change how it reads 4844 other comparisons to fix one."
  },
  "DEFLECTIONS|range": {
    pack: "see text", book: "",
    why: "CHANGED DELIBERATELY at 3.587.0, and it is the one printed parameter block 26 moved. The page gives Deflections a Trigger and a Target (\"1 missile\") and no Range line. Since 3.532.0 a spell printing neither a range nor an area MEANS THE CASTER (Graham's ruling of 8 September 2026), and the gate turns that into a reach of zero feet — so this spell's -4 circumstance penalty, which belongs on the creature that shot at you, would have been refused for every attacker except yourself. Automated and unreachable. Found by `verify-spell-range` S4b naming Deflections as a third self-bound spell carrying a row that reaches another creature. The entry's real limit is AWARENESS, not distance — \"Trigger You are aware of the physical ranged attack\" — and a shooter can be at any distance; the two warping options then name \"within 30 feet\" for melee and spell attacks. `spellRangeFeet` already reads \"see text\" as no limit to enforce, which is what this entry says rather than a number invented to get past a gate. FLAGGED TO GRAHAM in the 3.587.0 notes rather than slipped in."
  },
  "FLAMINGSPHERE|save": {
    pack: "Basic Reflex", book: "Reflex",
    why: "RULED 29 August 2026, by the same ruling as SURGEOFTHETEMPEST and found by sweeping Core 3.7 for its shape: the header names a save without the word basic, the prose says \"each creature must attempt a basic Reflex save\", and the pack rolls 3d6 for the ladder to scale. Earthquake was the third of the shape and needed no entry here, because its header prints no save at all and RULE 2 above already covers a spell whose save is stated only in its body. Storm Of Vengeance is a FOURTH candidate deliberately left alone: its prose disagrees with the pack on the save type and the damage die as well as the word, which is a different question and Graham's to answer."
  },
  "SURGEOFTHETEMPEST|save": {
    pack: "Basic Reflex", book: "Reflex",
    why: "RULED 29 August 2026: \"Surge of the tempest should be basic reflex\". The spell's stat block prints \"Saving Throw Reflex\" and its prose two lines later says \"must make a BASIC Reflex save to partially avoid the effects\"; 65 other spells print \"Basic X\" in the header, so this header is the odd one out and the pack is right. The word is not cosmetic: `parseSpellDefence` reads /basic/ out of this exact string to decide whether damage scales by degree, so as printed a SUCCESSFUL Reflex save would have taken the full 1d12. Core 3.7 did not amend the header, so the difference stands and is declared here rather than corrected in the reference, which records what the book SAYS."
  },
  "AURAOFVITALITY|area": {
    pack: "20-foot emanation (B)", book: "20\u2019 radius (B)",
    why: "RULED 1 September 2026, and NARROWED at 3.586.0 (Graham's R3) after half its reasoning turned out to be wrong. THE CONCLUSION STANDS AND IS LOAD-BEARING: the word must be \"emanation\", because `emanationIsLive` tests the area string for it, so as printed this spell could never have become a live emanation and its per-turn heal would never have run at all. Its own text says \"You EMIT a comforting glow\" and heals \"at the beginning of YOUR turn\" — something carried, not a template left where it was lit. WHAT WAS WRONG was the rest of the original entry, which read the printed \"(B)\" as a transcription error on the grounds that the notation means Burst everywhere else in the pack, and dropped it. It does not mean Burst. Page 247 says in as many words: \"If the area or range has a (B) next to it, the spell is considered to breach and bypasses barriers.\" 3.585.0 measured that against the live pack — 0 spells carrying a Breach trait, 7 carrying \"(B)\" — and made the mark functional, at which point dropping it here stopped being cosmetic and started costing this spell its breach. The mark is restored and Aura Of Vitality is the eighth. So the declared difference is now ONLY the noun, which is the part that was ever load-bearing; the reference still records what the book SAYS.",
  },
  "MAGNIFICENTDAWN|save": {
    pack: "", book: "see below",
    why: "RULED 25 August 2026: leave manual and do not state a save. The save genuinely differs by creature type — every creature rolls Reflex against blinding, and for Ooze and Undead the same roll is ALSO a Basic save against 100 Essence damage. The pack named it Reflex, right for most and wrong for the two that matter, and data fix magnificent-dawn-defence cleared it. A blank here is a DECLARED REFUSAL: the engine rolls nothing rather than rolling the wrong thing for an Undead."
  },
  "VERDANTSNARE|duration": {
    pack: "1 round", book: "",
    why: "RULED 5 September 2026. The printed entry has NO duration line; its prose says \"creating natural difficult terrain until the start of your next turn\", and the transcription copied the empty field faithfully. It cannot stand in the pack for two reasons that both arrived with 3.500.0 and 3.501.0: the spell now lays a Foundry `modifyMovementCost` Region, and a claimed Region is expired on its duration stamp - so an empty field means vines that never go away. The +3 PP warp that buys \"1 minute\" would also have been the only version of the spell with a clock at all. Graham chose 1 round over inventing an until-your-next-turn duration shape: the system stamps rounds already, in initiative a round from now IS the start of your next turn, and a duration that ends on a specific creature's turn is a shape nothing else in the system uses. Slightly generous when cast mid-turn, and consistent with every other round-stamped spell. THE REFERENCE STILL RECORDS WHAT WAS PRINTED, the same shape as LUMINANCE|area and SACRIFICINGSHIELD|duration."
  },
  "SACRIFICINGSHIELD|duration": {
    pack: "1 round (D)", book: "",
    why: "RULED 5 September 2026. The printed entry has NO duration line at all, and the transcription copied that faithfully. It cannot stand in the pack: the spell is a Reaction ward that waits for an incoming blow — Foundry cannot let a reaction interrupt damage already being applied — and a ward with no duration is one nothing can ever expire, cast at leisure every morning and carried all day, which is the one thing a reaction cost exists to prevent. One round is what Delayed Respite prints, the only other Reaction ward in the pack and the spell this one's whole gate is modelled on, so the two spells that both wait for a blow wait the same length of time. The (D) is not decoration either: 3.494.0 taught the system to register and honour dismissible spells, so it is what lets a caster end the ward deliberately. THE REFERENCE STILL RECORDS WHAT WAS PRINTED, the same shape as LUMINANCE|area."
  },
  "SACRIFICINGSHIELD|targets": {
    pack: "1 ally", book: "",
    why: "RULED 5 September 2026, and inseparable from the duration above. The printed entry has no Target line, but its first sentence is \"You shield YOUR ALLY by absorbing their wounds\" — the target is stated in the description rather than in the field. As printed, `spellNeedsTarget` was false, nothing ever prompted, and the ward had nobody to sit on: the spell did nothing whatsoever. \"1 ally\" is what the sentence says and it parses to a cap of one under 3.498.0, so the ward can no longer be spread across a party by ticking boxes. THE REFERENCE RECORDS WHAT WAS PRINTED."
  },
  "SPEAKWITHDEAD|save": {
    pack: "Will", book: "",
    why: "RULED 29 September 2026 (block 32's R1, \"go with your recommendation\"). The stat block prints no Saving Throw line, and the body then says \"An unwilling corpse can attempt a Will saving using its original statistics\" and prints four rungs — Critical, Success, Failure, Fumble — the worst of which HAUNTS THE CASTER FOR A DAY. With an empty field no save was ever rolled, so none of the four could be reached. The save is stated in the description rather than in the field, the same shape as LUMINANCE|area and SACRIFICINGSHIELD|targets. A WILLING corpse does not save; the spell's own note tells the table to ignore the roll and play the Fumble rung, and that reading is flagged to Graham rather than settled here. THE REFERENCE RECORDS WHAT WAS PRINTED."
  },
  "LUMINANCE|area": {
    pack: "10-foot emanation", book: "",
    why: "RULED 29 August 2026. The printed entry has no Area LINE, but its first sentence is \"A bright light emanates from you in a 10-foot radius\" — the area is stated in the description rather than in the field, which the transcription copied faithfully. THE PACK IS RIGHT AND THE REFERENCE RECORDS WHAT WAS PRINTED, the same shape as SHADOWBLAST|save and PROTECTIVEWARD|area. The word matters far past its wording: `emanationIsLive` asks /emanation/i of this exact string, so an empty area meant the spell was never an emanation, no Region was placed, membership was never computed, and the per-turn healing had nowhere to happen. Luminance did nothing at all."
  }
};

const DECLARED_MISSING = {
  DRAININGBURST: "Present in both. The book writes the name with a trailing &emsp; entity; the parser now decodes it, and this entry is kept only so the decode is not silently removed.",
  // NEXUS OF ELEMENTAL ENERGY was declared here as "not found in the
  // book" and is NOT an exception at all — the parser could not see its
  // heading, which merges the trait line into the same <h3> as the name
  // and PP cost. Fixed in parse-spell-book.mjs; the entry now matches the
  // pack on every field. The declaration is gone rather than reworded,
  // because a resolved exception left in place is a slot a real
  // difference can later hide in.
};

/* ================================================================== *
 * Read both sides
 * ================================================================== */

const REF = path.join(SYSTEM_ROOT, "tools", "spell-book-fields.json");
ok("A0 the parsed book reference is present", fs.existsSync(REF));
const book = JSON.parse(fs.readFileSync(REF, "utf8"));
ok("A1 it holds the whole spell chapter", book.length > 650, `${book.length} entries`);

const dir = path.join(SYSTEM_ROOT, "packs", "spells");
ok("A2 the spells pack could be read", fs.existsSync(dir));
const db = new ClassicLevel(dir, { valueEncoding: "json" });
await db.open();
const pack = [];
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") pack.push({ name: v.name, ...v.system });
  }
} finally {
  await db.close();
}
ok("A3 the pack holds the whole chapter", pack.length > 650, `${pack.length} spells`);

const bookBy = new Map(book.map((s) => [key(s.name), s]));
const packBy = new Map(pack.map((s) => [key(s.name), s]));

/* ================================================================== *
 * B. Every printed spell is in the pack, and vice versa
 * ================================================================== */

const missingFromPack = book.filter((s) => !packBy.has(key(s.name)) && !DECLARED_MISSING[key(s.name)]);
ok("B1 every printed spell is in the pack", missingFromPack.length === 0,
  missingFromPack.map((s) => s.name).join(", "));
const missingFromBook = pack.filter((s) => !bookBy.has(key(s.name)) && !DECLARED_MISSING[key(s.name)]);
ok("B2 every packed spell has a printed entry", missingFromBook.length === 0,
  missingFromBook.map((s) => s.name).join(", "));

/* ================================================================== *
 * C. Field by field
 * ================================================================== */

const FIELDS = [
  ["pp", (p) => p.ppCost, (b) => b.pp],
  ["tradition", (p) => p.tradition, (b) => b.tradition],
  ["duration", (p) => p.duration, (b) => b.duration],
  ["save", (p) => p.defence, (b) => b.save],
  ["range", (p) => p.range, (b) => b.range],
  ["area", (p) => p.area, (b) => b.area],
  ["targets", (p) => p.targets, (b) => b.targets]
];

const undeclared = [];
let compared = 0;
for (const [k, p] of packBy) {
  const b = bookBy.get(k);
  if (!b) continue;
  for (const [label, fromPack, fromBook] of FIELDS) {
    compared += 1;
    const pv = fromPack(p);
    const bv = fromBook(b);
    if (label === "tradition" ? traditionsAgree(pv, bv)
      : label === "save" ? savesAgree(pv, bv, b)
        : norm(pv) === norm(bv)) continue;
    const declared = DECLARED[`${k}|${label}`];
    if (declared && norm(declared.pack) === norm(pv) && norm(declared.book) === norm(bv)) continue;
    undeclared.push(`${p.name}.${label}: pack ${JSON.stringify(pv)} vs book ${JSON.stringify(bv)}`);
  }
}

ok(`C1 no undeclared difference across ${compared} field comparisons`,
  undeclared.length === 0,
  `${undeclared.length}:\n      ${undeclared.slice(0, 12).join("\n      ")}`);

// THE ONE THAT COST THIRTEEN SPELLS. A blank targets field on a
// single-target spell is not cosmetic — spellNeedsTarget reads it, and
// without it the cast never asks who.
const lostTargets = [];
for (const [k, p] of packBy) {
  const b = bookBy.get(k);
  if (!b) continue;
  if (norm(b.targets) && !norm(p.targets)) lostTargets.push(p.name);
}
ok("C2 no spell has lost its Targets line", lostTargets.length === 0,
  `${lostTargets.length}: ${lostTargets.slice(0, 10).join(", ")} — spellNeedsTarget reads this field`);

// A FIELD MAY NOT SWALLOW THE NEXT ONE. Four entries arrived with their
// Range run together with the following field, because the book's own
// markup separated them with a space or a colon instead of "; ".
const LABEL_IN_VALUE = /\b(Area|Targets|Duration|Saving Throw|Base Damage|Tradition|Cast)\b/;
const runOns = [];
for (const p of pack) {
  for (const f of ["range", "area", "targets", "duration", "defence", "baseDamage"]) {
    const v = String(p[f] ?? "");
    if (v && LABEL_IN_VALUE.test(v)) runOns.push(`${p.name}.${f} = ${JSON.stringify(v)}`);
  }
}
ok("C3 no field holds another field's label", runOns.length === 0, runOns.join("; "));

/* ================================================================== *
 * D. The declarations are live, not stale
 * ================================================================== */

// A DECLARED EXCEPTION THAT NO LONGER APPLIES is a comment pretending to
// be a guard — and it would silently absorb a real difference that
// happened to land on the same spell and field.
for (const [k, entry] of Object.entries(DECLARED)) {
  const [name, field] = k.split("|");
  const p = packBy.get(name);
  const b = bookBy.get(name);
  ok(`D1 the declared exception for ${name}.${field} still describes reality`,
    Boolean(p && b) && norm(entry.pack) === norm(field === "save" ? p.defence : p[field]),
    "the pack no longer holds the value this exception was written for — remove it or update it");
  ok(`D2 ${name}.${field} carries a reason`, Boolean(entry.why) && entry.why.length > 40);
  // AND THE BOOK SIDE HAS TO STILL DISAGREE. D1 asks only about the pack,
  // so a declaration survived a NEW BOOK that had adopted the pack's
  // value: the difference was gone, C1 found nothing, D1 was satisfied,
  // and the entry sat on looking like a live exception. Core 3.7 retired
  // three at once on 29 August 2026 — Deific Presence's two lines and
  // Shadow Blast's save — and none of them said so. An exception whose
  // difference has healed is a comment pretending to be a guard, which is
  // the very thing this section was written to catch.
  const bookNow = b ? (field === "save" ? b.save : b[field]) : null;
  const packNow = p ? (field === "save" ? p.defence : p[field]) : null;
  ok(`D1b the difference behind ${name}.${field} has not healed`,
    !(p && b) || norm(packNow) !== norm(bookNow),
    "the book now prints what the pack holds — delete this exception, it is no longer one");
}
for (const [k, why] of Object.entries(DECLARED_MISSING)) {
  ok(`D3 the declared name exception ${k} carries a reason`, Boolean(why) && why.length > 40);
}

/* ================================================================== */

process.stdout.write(`verify-spell-book-fields: ${checks} checks over ${compared} field comparisons\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
