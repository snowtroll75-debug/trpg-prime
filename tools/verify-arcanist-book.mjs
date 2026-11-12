#!/usr/bin/env node
/**
 * verify-arcanist-book — TRG Prime 3.676.0: the Arcanist's spellbook, levelled
 * half. Graham, 29 October 2026: the Arcanist feats' slots "should also ask for
 * the memorised spells to also come from the spellbook". His rulings that day:
 *
 *   R1  as printed — each Minor/Major/Master arcane slot also adds one spell to
 *       the book free, of a PP the slot could hold; Learn a Spell adds more.
 *   R2  Arcane Knight's PP 2 slot fills from the book too, and adds nothing.
 *
 *   A  whose book, and which slots it binds
 *   B  the free additions (R1, and R2's "none for the Knight")
 *   C  what may go into the book, and what a slot may take from it
 *   D  a book spell is castable only while its slot exists (derived)
 *   E  a book spell is never reported as orphaned
 *   F  Learn a Spell's route
 *   G  the workflows read the rules (structure)
 *   Z  the release
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

const ab = await imp("magic/arcanist-book.mjs");
const fc = await imp("magic/feat-casting.mjs");
const sa = await imp("magic/spell-availability.mjs");

const feat = (name, id = name) => ({ type: "feat", name, id });
const spell = (name, pp, extra = {}) => ({
  type: "spell", name, id: extra.id ?? name,
  system: { ppCost: pp, tradition: extra.tradition ?? "arcane", specialist: Boolean(extra.specialist), prepared: Boolean(extra.prepared) },
  flags: { "trg-prime": { ...(extra.book ? { archetypeBook: { source: "arcanist", via: extra.book } } : {}), ...(extra.slot ? { featSpellSlot: { slotId: extra.slot, tradition: "arcane" } } : {}) } }
});
// A level-8 Fighter (no class tradition) with the whole lower chain. The
// Knight's floor is half of 8 = caster level 4, so a tier slot holds PP 5.
const actorLike = (items, level = 8) => ({ items, system: { identity: { level }, magic: { casterLevelValue: Math.ceil(level / 2) }, progression: {} } });

/* A — whose book, and which slots it binds -------------------------------- */
{
  const items = [feat("Arcanist"), feat("Arcane Knight"), feat("Minor Arcane Caster")];
  equal("A1 the Arcanist keeps the book", ab.bookArchetype(items)?.key, "arcanist");
  equal("A2 ...of the arcane tradition", ab.bookArchetype(items)?.tradition, "arcane");
  equal("A3 an ABILITY named Arcanist is not the archetype", ab.bookArchetype([{ type: "ability", name: "Arcanist" }]), null);
  equal("A4 a Priest keeps no book (list style)", ab.bookArchetype([feat("Priest")]), null);
  const slots = fc.featSpellSlots({ items, level: 8, casterLevel: 4, ownTradition: "" });
  equal("A5 the Knight's slot and three Minor slots exist at 8th",
    slots.map((s) => `${s.id}@${s.maxPP}`), ["arcane knight:0@2", "tier:arcane:0@5", "tier:arcane:1@5", "tier:arcane:2@5"]);
  const book = ab.bookArchetype(items);
  ok("A6 every one of them is filled from the book (R2 includes the Knight)", slots.every((s) => ab.slotIsBookBound(s, book)));
  ok("A7 a divinity slot is not", !ab.slotIsBookBound({ tradition: "divinity" }, book));
  ok("A8 and with no book, nothing is bound", !ab.slotIsBookBound({ tradition: "arcane" }, null));
  equal("A9 actorFeatSpellSlots reads the same slots off a sheet",
    fc.actorFeatSpellSlots(actorLike(items)).map((s) => s.id), slots.map((s) => s.id));
}

/* B — the free additions -------------------------------------------------- */
{
  const minor = ["Arcanist", "Minor Arcane Caster"];
  equal("B1 one free addition per Minor slot, on its ladder",
    [3, 4, 6, 8].map((l) => ab.freeBookAllowance(minor, l, "arcane")), [0, 1, 2, 3]);
  equal("B2 Arcane Knight adds none (R2: no such sentence)",
    ab.freeBookAllowance(["Arcanist", "Arcane Knight"], 8, "arcane"), 0);
  equal("B3 Major adds its own three",
    ab.freeBookAllowance([...minor, "Major Arcane Caster"], 16, "arcane"), 6);
  equal("B4 Master's TWO at 18th and one more at 20th",
    [18, 20].map((l) => ab.freeBookAllowance([...minor, "Major Arcane Caster", "Master Arcane Caster"], l, "arcane")), [8, 9]);
  equal("B5 a tier feat of the class's own tradition grants no additions (it grants no slots)",
    ab.freeBookAllowance(minor, 8, "arcane", "arcane"), 0);
  equal("B6 another tradition's tier feat adds nothing to an arcane book",
    ab.freeBookAllowance(["Arcanist", "Minor Divinity Caster"], 8, "arcane"), 0);
  equal("B7 state: owed, used, remaining", ab.freeBookState({ allowed: 3, used: 1 }), { allowed: 3, used: 1, remaining: 2 });
  equal("B8 never negative", ab.freeBookState({ allowed: 1, used: 4 }).remaining, 0);
}

/* C — into the book, and out of it into a slot ---------------------------- */
{
  const elig = (s, cl = 4) => ab.bookAdditionEligible(s, { tradition: "arcane", casterLevel: cl });
  ok("C1 an arcane PP 5 spell, at caster level 4 (ceiling 5)", elig({ ppCost: 5, tradition: "arcane" }));
  ok("C2 not PP 6 — above what a slot could hold", !elig({ ppCost: 6, tradition: "arcane" }));
  ok("C3 not a cantrip — those are the book's other half", !elig({ ppCost: 0, tradition: "arcane" }));
  ok("C4 not a specialist spell", !elig({ ppCost: 2, tradition: "arcane", specialist: true }));
  ok("C5 not another tradition's", !elig({ ppCost: 2, tradition: "divinity" }));
  ok("C6 a shared tradition list counts", elig({ ppCost: 2, tradition: "divinity, arcane" }));
  ok("C7 an empty tradition belongs to nobody", !elig({ ppCost: 2, tradition: "" }));
  ok("C8 caster level 0 can write nothing above PP 1", !elig({ ppCost: 2, tradition: "arcane" }, 0));

  const knight = { id: "arcane knight:0", tradition: "arcane", maxPP: 2 };
  const tier = { id: "tier:arcane:0", tradition: "arcane", maxPP: 5 };
  const live = new Set([knight.id, tier.id]);
  ok("C9 a PP 2 book spell fits the Knight's slot", ab.bookSlotEligible(spell("Sleep", 2, { book: "free" }), knight, live));
  ok("C10 a PP 3 one does not", !ab.bookSlotEligible(spell("Fly", 3, { book: "free" }), knight, live));
  ok("C11 a spell that is not in the book cannot fill a book slot", !ab.bookSlotEligible(spell("Sleep", 2), knight, live));
  ok("C12 one already memorised in ANOTHER live slot is not offered",
    !ab.bookSlotEligible(spell("Sleep", 2, { book: "free", slot: tier.id }), knight, live));
  ok("C13 ...but one whose old slot has gone may be memorised again",
    ab.bookSlotEligible(spell("Sleep", 2, { book: "free", slot: "tier:arcane:9" }), knight, live));

  const data = ab.bookSpellData({ name: "Sleep", system: { ppCost: 2, prepared: true }, flags: {} },
    { feat: { id: "F1", name: "Arcanist" }, source: "arcanist", via: "free", requested: "Sleep" });
  equal("C14 a book entry arrives unprepared", data.system.prepared, false);
  equal("C15 ...marked as the Arcanist's, by free addition", ab.archetypeBookMark(data), { source: "arcanist", via: "free" });
  equal("C16 ...and owned by the Arcanist feat, so the book goes with it", data.flags["trg-prime"].grantedBy.sourceId, "F1");
  ok("C17 it is NOT the Wizard's book flag", !data.flags["trg-prime"].spellBookPick);
  equal("C18 a learned one says so",
    ab.bookSpellData({ system: {}, flags: {} }, { feat: { id: "F1" }, source: "arcanist", via: "learned" }).flags["trg-prime"].grantedBy.sourceName,
    "Learn a Spell");
  equal("C19 a mark with an unknown route is not a mark", ab.archetypeBookMark({ flags: { "trg-prime": { archetypeBook: { source: "arcanist", via: "stolen" } } } }), null);
}

/* D — castable only while the slot exists --------------------------------- */
{
  const live = new Set(["arcane knight:0"]);
  const slotted = spell("Sleep", 2, { book: "free", slot: "arcane knight:0" });
  const loose = spell("Fly", 3, { book: "learned" });
  const dead = spell("Haste", 5, { book: "free", slot: "tier:arcane:2" });
  equal("D1 memorised in a live slot: on the table, castable", sa.spellAvailability(slotted, { liveSlotIds: live }), { key: "memorised", label: "Memorised", onTable: true, castable: true });
  equal("D2 merely in the book: off the table, not castable", sa.spellAvailability(loose, { liveSlotIds: live }), { key: "book", label: "Spellbook", onTable: false, castable: false });
  equal("D3 its slot gone: back to being a book entry", sa.spellAvailability(dead, { liveSlotIds: live }).castable, false);
  ok("D4 a book spell counts as a book-pool spell", sa.isBookPoolSpell(loose));
  ok("D5 PREPARED DOES NOT MAKE IT CASTABLE — the slot does",
    !sa.spellAvailability(spell("Fly", 3, { book: "learned", prepared: true }), { liveSlotIds: live }).castable);

  // DERIVED FROM THE SPELL'S OWN ACTOR when no ids are passed — the cast
  // gate's path. Removing the feat that grants the slot is enough.
  const sleep = spell("Sleep", 2, { book: "free", slot: "arcane knight:0" });
  const withKnight = actorLike([feat("Arcanist"), feat("Arcane Knight"), sleep]);
  sleep.parent = withKnight;
  ok("D6 through its actor: castable while Arcane Knight is held", sa.spellAvailability(sleep).castable);
  equal("D7 ...and the gate lets it through", sa.spellCastBlocked(sleep), null);
  withKnight.items = [feat("Arcanist"), sleep];
  ok("D8 Arcane Knight removed: not castable, with nothing written to the spell", !sa.spellAvailability(sleep).castable);
  ok("D9 ...and the gate says to memorise it in a slot",
    /not memorised in a spell slot/.test(String(sa.spellCastBlocked(sleep) ?? "")));
  ok("D10 an ordinary feat-slot copy is unaffected (still Granted)",
    sa.spellAvailability(spell("Bless", 2, { slot: "arcane knight:0" }), { liveSlotIds: live }).castable);
}

/* E — never orphaned ------------------------------------------------------ */
{
  const slots = [{ id: "tier:arcane:0", tradition: "arcane", maxPP: 5 }];
  const state = fc.featSlotState(slots, [
    spell("Haste", 5, { book: "free", slot: "tier:arcane:7" }),
    spell("Fireball", 5, { slot: "tier:arcane:7" }),
    spell("Fly", 3, { book: "learned", slot: "tier:arcane:0" })
  ]);
  equal("E1 a book spell whose slot has gone is not orphaned; a legacy copy still is",
    state.orphaned.map((i) => i.name), ["Fireball"]);
  equal("E2 a book spell fills its live slot", state.slots[0].filled?.name, "Fly");
  const twice = fc.featSlotState(slots, [
    spell("Fly", 3, { book: "learned", slot: "tier:arcane:0" }),
    spell("Haste", 5, { book: "free", slot: "tier:arcane:0" })
  ]);
  equal("E3 a second book spell claiming a filled slot is simply in the book", twice.orphaned.length, 0);
  // 3.676.1 — the slot's ceiling fell under the spell (caster level lost).
  const outgrown = fc.featSlotState([{ id: "tier:arcane:0", tradition: "arcane", maxPP: 1 }], [
    spell("Grease", 4, { book: "free", slot: "tier:arcane:0" })
  ]);
  equal("E4 a book spell above its slot's ceiling does not fill it", outgrown.slots[0].filled, null);
  equal("E5 ...and is not reported as orphaned either", outgrown.orphaned.length, 0);
}

/* H — a slot holds what fits in it (3.676.1, found driving 3.676.0) ------- */
{
  const live = new Map([["tier:arcane:0", 1], ["tier:arcane:1", 4]]);
  ok("H1 a spell within the live slot's ceiling is held", ab.liveSlotHolds(live, "tier:arcane:1", 4));
  ok("H2 one above it is not", !ab.liveSlotHolds(live, "tier:arcane:0", 4));
  ok("H3 a slot that does not exist holds nothing", !ab.liveSlotHolds(live, "tier:arcane:9", 1));
  ok("H4 a bare Set of ids still answers existence", ab.liveSlotHolds(new Set(["tier:arcane:0"]), "tier:arcane:0", 99));
  ok("H5 an outgrown book spell is not castable",
    !sa.spellAvailability(spell("Grease", 4, { book: "free", slot: "tier:arcane:0" }), { liveSlotIds: live }).castable);
  ok("H6 a spell its old slot has outgrown may move to one it fits",
    ab.bookSlotEligible(spell("Grease", 4, { book: "free", slot: "tier:arcane:0" }), { id: "tier:arcane:1", tradition: "arcane", maxPP: 4 }, live));
  ok("H7 ...but one its slot still holds may not",
    !ab.bookSlotEligible(spell("Shield", 1, { book: "free", slot: "tier:arcane:0" }), { id: "tier:arcane:1", tradition: "arcane", maxPP: 4 }, live));
  // THE LIVE CASE, replayed: Fighter 6 / Arcanist, Grease in a Minor slot,
  // Arcane Knight removed — caster level 3 → 0, ceiling PP 4 → PP 1.
  const grease = spell("Grease", 4, { book: "free", slot: "tier:arcane:0" });
  const pc = actorLike([feat("Arcanist"), feat("Arcane Knight"), feat("Minor Arcane Caster"), grease], 6);
  grease.parent = pc;
  ok("H8 with Arcane Knight (caster level 3, PP 4 slots) Grease is castable", sa.spellAvailability(grease).castable);
  pc.items = [feat("Arcanist"), feat("Minor Arcane Caster"), grease];
  pc.system.magic.casterLevelValue = 0;
  ok("H9 THE LIVE DEFECT: without it (PP 1 slots) Grease is a book entry again", !sa.spellAvailability(grease).castable);
  equal("H10 liveFeatSlotIds carries each slot's ceiling", [...fc.liveFeatSlotIds(pc)], [["tier:arcane:0", 1], ["tier:arcane:1", 1]]);
}

/* F — Learn a Spell's route ----------------------------------------------- */
{
  const book = { key: "arcanist", tradition: "arcane" };
  equal("F1 the Wizard's own book", ab.learnSpellRoute({ classBook: true }), "class");
  equal("F2 an Arcanist's book", ab.learnSpellRoute({ book }), "archetype");
  equal("F3 no book, no learning", ab.learnSpellRoute({}), null);
  equal("F4 the class book wins if both exist", ab.learnSpellRoute({ classBook: true, book }), "class");
}

/* G — the workflows read the rules ---------------------------------------- */
{
  const fcw = read("module", "magic", "feat-casting-workflow.mjs");
  ok("G1 a book-bound slot is filled from the book, not the pack",
    /if \(slotIsBookBound\(slot, book\)\) return memoriseFromBook\(actor, slot, book, slots\);/.test(fcw));
  ok("G2 the book picker offers only what bookSlotEligible allows", /\.filter\(\(i\) => bookSlotEligible\(i, slot, live\)\)/.test(fcw));
  ok("G3 memorising MARKS the book entry",
    /await item\.update\(\{ \[`flags\.\$\{SYSTEM_ID\}\.featSpellSlot`\]: \{ slotId: slot\.id, tradition: slot\.tradition \} \}\);/.test(fcw));
  ok("G4 clearing a book spell un-marks it rather than deleting it",
    /if \(archetypeBookMark\(slot\.filled\)\) \{\s*await slot\.filled\.update\(\{ \[`flags\.\$\{SYSTEM_ID\}\.-=featSpellSlot`\]: null \}\);/.test(fcw));
  const acw = read("module", "magic", "archetype-casting-workflow.mjs");
  ok("G5 free additions are counted by the R1 rule", /allowed: freeBookAllowance\(/.test(acw));
  ok("G6 ...picked with the book's eligibility", /bookAdditionEligible\(\s*\{ tradition: entry\.system\?\.tradition/.test(acw));
  ok("G7 ...and written as a free book entry", /bookSpellData\(packItemData\(document\), \{ feat, source: source\.key, via: "free"/.test(acw));
  ok("G8 a free addition is refused when none is owed", /if \(!free\.remaining\) \{/.test(acw));
  const lsw = read("module", "magic", "learn-spell-workflow.mjs");
  ok("G9 Learn a Spell is open to whoever has a route", /return routeFor\(actor\)\.kind !== null;/.test(lsw));
  ok("G10 ...and writes into the Arcanist's book as learned", /via: "learned", requested: document\.name/.test(lsw));
  ok("G11 ...choosing from the book's tradition, not the class's", /tradition: route\.book\.tradition, casterLevel/.test(lsw));
  ok("G12 the outcome card names the book it landed in", /added to \$\{result\.bookLabel \?\? "your Spell Library"\}/.test(read("module", "combat", "action-workflow.mjs")));
  const sheet = read("module", "sheets", "actor-sheet.mjs");
  ok("G13 the spells table works the live slots out once", /bookSlotIds \?\?= liveFeatSlotIds\(this\.actor\);/.test(sheet));
  ok("G14 the sheet offers the free addition", /addArchetypeBookSpell: TRGActorSheet\.addArchetypeBookSpell,/.test(sheet));
  const hbs = read("templates", "actor", "actor-sheet.hbs");
  ok("G15 the card has the button, shown only while one is owed",
    /\{\{#if arch\.freeRemaining\}\}[\s\S]{0,200}data-action="addArchetypeBookSpell"/.test(hbs));
  ok("G16 the card lists the book", /\{\{#each arch\.levelled as \|b\|\}\}/.test(hbs));
  ok("G18 the book's sub-heading sits flush left (3.676.1, seen live centred)",
    /\.trg-prime \.archetype-book-heading h3 \{[^}]*text-align: left;/.test(read("styles", "trg-prime.css")));
  ok("G19 the card's 'memorised' mark reads the same rule as the cast gate",
    /memorised: bookSpellSlotted\(i, live\)/.test(acw));
  ok("G17 Learn a Spell's card text names the Arcanist's book",
    /an Arcanist's spellbook \(arcane spells/.test(read("module", "data", "skill-actions.mjs")));
}

/* Z — the release --------------------------------------------------------- */
{
  const sys = JSON.parse(read("system.json"));
  const [za, zb] = String(sys.version).split(".").map(Number);
  const zc = Number(String(sys.version).split(".")[2]);
  ok("Z the system is 3.676.1 or later", za > 3 || (za === 3 && (zb > 676 || (zb === 676 && zc >= 1))), sys.version);
}

if (failures.length) {
  console.log(`verify-arcanist-book: ${checks} checks — ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log(`verify-arcanist-book: ${checks} checks — all green.`);
}
