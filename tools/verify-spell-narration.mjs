#!/usr/bin/env node
/**
 * verify-spell-narration — a spell that does nothing mechanical still
 * tells the player what it does.
 *
 * NEW at 3.392.0.
 *
 * THE GAP. `spellData.description` appeared exactly ONCE in the whole of
 * cast-workflow.mjs, inside a regex looking for the word "disbelieve".
 * The cast card has never printed a spell's own text. For a spell the
 * engine automates that is fine; for one it does not, the card said the
 * spell was cast and then nothing — a player learned only that they had
 * spent an action.
 *
 * Graham's ruling, 25 August 2026, choosing between three options: post
 * the spell's text. NOT a "no mechanical effect" disclaimer, which reads
 * as a broken system to anybody who does not know it is deliberate.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION C IS THE ONE THAT MATTERS: the rule is DERIVED from what the
 * spell carries, never from a flag. So a spell automated tomorrow stops
 * narrating the same day with nothing to update, and the set cannot rot,
 * because there is no list to maintain.
 *
 * SECTION D READS THE PACK, because a rule about a category is only as
 * good as its reach — and because two of its numbers were measured, not
 * assumed, and one of them changed the design. Printing the text for
 * every unautomated spell would have said everything twice on the 69
 * spells whose `note` effect is already a summary of their own
 * description. Checked against real entries; the note wins.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { narrationLines, spellHasNoMechanics, spellNarration } from "../module/magic/spell-narration.mjs";
import { effectName } from "../module/magic/spell-effects.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== *
 * A. What counts as mechanical
 * ================================================================== */

ok("A1 a spell with nothing at all narrates", spellHasNoMechanics({ description: "x" }));

for (const kind of ["heal", "tempHP", "condition", "bonus", "defence", "spell", "trait", "attack", "damage"]) {
  ok(`A2 a ${kind} effect suppresses narration`,
    !spellHasNoMechanics({ effects: [{ kind }] }),
    "the card already reports what was applied");
}

// A NOTE IS ALREADY THE NARRATION. Sixty-nine spells carry one that
// summarises their own description; printing both says it twice.
ok("A3 a note effect suppresses narration", !spellHasNoMechanics({ effects: [{ kind: "note", text: "x" }] }));

ok("A4 a damage formula suppresses it", !spellHasNoMechanics({ damage: { formula: "2d6" } }));
ok("A5 a base damage suppresses it", !spellHasNoMechanics({ baseDamage: "1d6" }));
ok("A6 caster level mods suppress it", !spellHasNoMechanics({ casterLevelMods: [{ x: 1 }] }));
// A SAVE OR AN ATTACK IS RESOLVED AND REPORTED, so the card is not silent.
ok("A7 a save suppresses it", !spellHasNoMechanics({ defence: "Will" }));
ok("A8 an attack category suppresses it", !spellHasNoMechanics({ category: "attack" }));
ok("A9 a utility category does not", spellHasNoMechanics({ category: "utility" }));
ok("A10 an empty damage formula does not suppress it", spellHasNoMechanics({ damage: { formula: "" } }));
ok("A11 an empty effects array does not", spellHasNoMechanics({ effects: [] }));
ok("A12 rubbish input does not throw", spellHasNoMechanics());

/* ================================================================== *
 * B. What the card carries
 * ================================================================== */

// THE WARPING OPTIONS ARE CUT. The player was shown them, and chose from
// them, in the Warp dialog two steps earlier.
equal("B1 the warping block is stripped",
  spellNarration("The spell does a thing.\n\nWarping Options:\n+2 PP: more of it."),
  "The spell does a thing.");
equal("B2 a description with no warps is unchanged",
  spellNarration("Just the text."), "Just the text.");
equal("B3 nothing in, nothing out", spellNarration(""), "");
equal("B4 rubbish does not throw", spellNarration(), "");

// ONE PARAGRAPH PER PRINTED PARAGRAPH. Scribers Chant's second paragraph
// is a requirement ("You must concentrate upon the material"), not a
// flourish, and running them together buries it.
equal("B5 paragraphs are kept apart",
  narrationLines({ description: "First.\n\nSecond." }).length, 2);
equal("B6 a mechanical spell narrates nothing",
  narrationLines({ description: "x", effects: [{ kind: "heal" }] }).length, 0);
equal("B7 a spell with no text narrates nothing",
  narrationLines({ description: "" }).length, 0);
equal("B8 a description that is only warps narrates nothing",
  narrationLines({ description: "Warping Options:\n+2 PP: more." }).length, 0);

/* ================================================================== *
 * C. Derived, never flagged
 * ================================================================== */

// THE WHOLE DESIGN. There is no `narrative: true` anywhere, and adding
// one would create a list that rots. These two assertions are what keep
// the rule self-correcting.
// C1 WAS A GREP AND IT FAILED ON THE MODULE'S OWN COMMENT — which says
// "There is no `narrative: true` on these spells", explaining the very
// absence the check was looking for. A string literal is not behaviour,
// and a check that reads vocabulary is the mistake this project has made
// often enough to name. Asserted as behaviour instead: a flag, however
// spelled, must not be able to override what the spell carries.
ok("C1a a narrative flag cannot make a mechanical spell narrate",
  narrationLines({ description: "x", narrative: true, effects: [{ kind: "heal" }] }).length === 0);
ok("C1b nor can its absence silence one that has nothing",
  narrationLines({ description: "x", narrative: false }).length === 1);

const before = { description: "Toggles a switch." };
const after = { description: "Toggles a switch.", effects: [{ kind: "condition", condition: "prone" }] };
ok("C2 automating a spell silently stops its narration",
  narrationLines(before).length === 1 && narrationLines(after).length === 0,
  "this is what makes the set shrink on its own");

const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
ok("C3 the cast actually calls it", /narrationLines\(spellData\)/.test(cast));
// PRINTED ONLY ON A SUCCESSFUL CAST. A spell that fizzled did not do the
// thing its text describes, and printing the text anyway would say it did.
ok("C4 and only when the spell took effect",
  /if \(outcome\.cast\) \{\s*\n\s*for \(const paragraph of narrationLines\(spellData\)\)/.test(cast),
  "a failed cast must not print what the spell would have done");

/* ================================================================== *
 * D. Reach, measured against the real pack
 * ================================================================== */

const dir = path.join(SYSTEM_ROOT, "packs", "spells");
ok("D0 the spells pack could be read", fs.existsSync(dir));
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

const narrating = pack.filter((s) => spellHasNoMechanics(s));
ok("D1 the pack was read", pack.length > 650, `${pack.length}`);
/*
 * D2 IS A NUMBER THAT ONLY EVER FALLS, and that is the point of it.
 *
 * `spellHasNoMechanics` counts the entries with nothing structured to
 * say, which print their description instead. Every block of the audit
 * that wires a spell takes one off the pile \u2014 so the floor is a guard
 * against the FUNCTION breaking and returning nothing, not a target.
 *
 * 250 \u2192 245 at 3.590.0 (pages 281-290, plus the pack-wide clock sweep).
 * Twelve spells gained condition ladders and seven gained rails, and
 * the count went 256 \u2192 247. Lowered by more than the drop so the next
 * block does not have to touch it, and it will keep falling.
 */
/*
 * 245 → 235 AT 3.591.0 (pages 291-300). Eighteen of the block's twenty
 * spells gained structured rows — four ladders, a healing rate, three
 * secondary pools, an item-quality grant and nine rails — and the count
 * went 247 → 242. Lowered by ten rather than five for the reason above:
 * the floor guards against `spellHasNoMechanics` breaking and returning
 * nothing. It is not a target to be edged down once a block.
 */
/*
 * 235 → 225 AT 3.596.0 (pages 311-320, second half). Four spells that
 * narrated because they had NOTHING — Restore Senses, Scrying, Shadow
 * Weapon and Scintillating Pattern — gained real rows, and the count went
 * 239 → 235. Lowered by ten rather than four for the reason above: this is
 * a floor guarding `spellHasNoMechanics` against returning nothing, not a
 * target to be edged down once a block.
 */
/*
 * 225 → 215 AT 3.608.0 (block 32, R3–R8). Spell Turning, Spell Drain, Size
 * Alteration, Solid Fog, Spider Climb, Spiritual Weapon and Smash narrated
 * because they carried nothing, and the count went 230 → 223. Lowered by
 * ten for the reason above.
 */
// 223 → 214 AT 3.609.0: block 33 gave effects of their own to spells that
// had carried nothing and so narrated (True Strike, Wake and Time Stop
// among them). Lowered by ten, as before.
// 214 → 203 AT 3.611.0: block 34 gave rows to spells that had carried
// nothing (Waves Of Fatigue, Wits, Gustborn Movement, the three reaction
// resistances among them). Lowered by ten, as before.
// 203 → 194 AT 3.613.0: block 35 gave rows to spells that had carried
// nothing (Stasis, Protector's Sphere, Resilient Fortitude, Shifting Form,
// Veiled Secret among them). Lowered by ten, as before.
ok("D2 a substantial number of spells narrate", narrating.length > 185, `${narrating.length}`);
// EVERY ONE OF THEM HAS SOMETHING TO SAY. A spell that qualifies for the
// fallback and has no text would print an empty line, which is worse
// than the silence this replaces.
const empty = narrating.filter((s) => narrationLines(s).length === 0);
ok("D3 every narrating spell has text to print", empty.length === 0,
  `${empty.length}: ${empty.slice(0, 5).map((s) => s.name).join(", ")}`);

// THE PP 0 TIER, which this release worked through by hand.
const click = pack.find((s) => s.name === "Click");
const message = pack.find((s) => s.name === "Message");
const scribers = pack.find((s) => s.name === "Scribers Chant");
ok("D4 Click narrates", narrationLines(click).length === 1);
ok("D5 Message narrates", narrationLines(message).length === 1);
ok("D6 Scribers Chant narrates both its paragraphs", narrationLines(scribers).length === 2,
  `${narrationLines(scribers).length} — the second is a requirement, not a flourish`);

// AND THE TWO THIS RELEASE AUTOMATED must have stopped narrating.
const orientate = pack.find((s) => s.name === "Orientate");
const spook = pack.find((s) => s.name === "Spook");
ok("D7 Orientate now carries a bonus", (orientate?.effects ?? []).some((e) => e.kind === "bonus" && e.slot === "survival"));
ok("D8 and its north-sensing half is kept", (orientate?.effects ?? []).some((e) => e.kind === "note"));
ok("D9 Spook grants its DB bonus", (spook?.effects ?? []).some((e) => e.kind === "bonus" && e.slot === "defence" && e.value === 1));
// THREE SAVES, NOT ONE. The slot vocabulary has no combined save, so
// "a +1 status bonus on Saving Throws" is three entries.
for (const slot of ["fortitude", "reflex", "will"]) {
  ok(`D10 Spook grants its ${slot} bonus`,
    (spook?.effects ?? []).some((e) => e.kind === "bonus" && e.slot === slot && e.value === 1));
}
// AND THE CONDITION IT CANNOT WATCH IS DECLARED. The bonuses are
// conditional on how the target spent its movement; nothing tracks that,
// so the note says so rather than the effects applying in silence.
ok("D11 Spook declares the condition it cannot enforce",
  (spook?.effects ?? []).some((e) => e.kind === "note" && /does not move closer/i.test(String(e.text ?? ""))));

/* ================================================================== *
 * E. Effect names carry ONE pair of brackets
 * ================================================================== */

// THE CONVENTION IS THE DATA'S. Every `note` scope in the pack is written
// with its own brackets — measured 25 August 2026, eight of eight, none
// bare — so the effect-name builder must not add a second pair. Three
// spells shipped with double brackets (Aura, Stone Shield, Zealous
// Conviction) because five separate sites each wrapped the note again.
const notes = [];
for (const s of pack) {
  for (const e of s.effects ?? []) {
    if (e.kind === "note") continue;
    const scope = String(e.note ?? "").trim();
    if (scope) notes.push({ spell: s.name, scope });
  }
}
ok("E1 the pack has notes to check", notes.length > 0, `${notes.length}`);
const bare = notes.filter((n) => !/^\(.*\)$/.test(n.scope));
ok("E2 every effect note supplies its own brackets", bare.length === 0,
  `${bare.length} bare: ${bare.slice(0, 5).map((n) => `${n.spell} ${JSON.stringify(n.scope)}`).join(", ")}`
  + " — the name builder adds none, so a bare note reads as a run-on");

// E3 WAS A GREP FOR THE OLD STRING and two mutations walked straight
// past it: reintroducing the double-wrap inside `effectName` reads
// nothing like the pattern it searched for. Vocabulary, not behaviour —
// the mistake this project has now made in four separate checks. The
// rule is a function, so the check calls it.
ok("E3 a note keeps exactly one pair of brackets",
  effectName("Aura", "(foes attack you at -2)") === "Aura (foes attack you at -2)",
  `got ${JSON.stringify(effectName("Aura", "(foes attack you at -2)"))}`);
ok("E3b no name doubles a bracket",
  !/\(\(|\)\)/.test(effectName("Spook", "(while you do not close with enemies)")));
ok("E3c the note's own brackets are not stripped",
  /\(vs mental effects\)/.test(effectName("Zealous Conviction", "(vs mental effects)")));
ok("E4 a suffix still lands after the scope",
  effectName("Shape Of The Wyrm", "(Fire form)", " — traits") === "Shape Of The Wyrm (Fire form) — traits");
ok("E5 no note means no stray spacing", effectName("Bless") === "Bless");

// EVERY REAL NOTE IN THE PACK, through the real builder.
const doubled = notes.filter((n) => /\(\(|\)\)/.test(effectName(n.spell, n.scope)));
ok("E6 no spell in the pack produces a doubled bracket", doubled.length === 0,
  doubled.slice(0, 4).map((n) => effectName(n.spell, n.scope)).join("; "));

const effectsSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
ok("E7 the name is built in one place",
  (effectsSrc.match(/name: effectName\(/g) ?? []).length >= 5,
  "five places deciding one question is how the fault survived in three spells");

/* ================================================================== */

process.stdout.write(`verify-spell-narration: ${checks} checks; ${narrating.length} spells narrate\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
