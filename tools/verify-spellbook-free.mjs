#!/usr/bin/env node
/**
 * verify-spellbook-free — the Spellbook's Free Spell button (3.714.0;
 * Graham, 25 November 2026: "an additional button [on] the spellbook that
 * allows a PC (with GM approval) to add a spell for free. These free spells
 * would be tallied separately to the slots filled box.").
 *
 *   A. THE TALLY (driven). A free spell is a book spell, is off the ladder,
 *      and is counted on its own; a Learn a Spell addition is neither.
 *   B. THE FLAGS AND THE QUESTION (driven).
 *   C. THE GM'S SAY-SO (driven, with stub Foundry globals). The ask's own
 *      title and question reach the GM's dialog, on the GM's own screen and
 *      across the socket from a player; the off-turn strike's dialog is
 *      word for word what it was; no GM means refused.
 *   D. THE WIRING (source). The button, the action, the Free spells box,
 *      the row mark; the GM is asked before anything is created; the
 *      browser is Add to Book's later-slot filter.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

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
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

// Stub globals the workflow modules touch at import time.
const dialogs = [];
const emitted = [];
const notices = [];
globalThis.foundry = {
  applications: { api: { DialogV2: { confirm: async (opts) => { dialogs.push(opts); return globalThis.__answer ?? true; } } } },
  utils: { randomID: () => "req1" }
};
globalThis.ui = { notifications: { info: (m) => notices.push(m), warn: (m) => notices.push(m) } };
globalThis.game = { user: { isGM: true, id: "gm", name: "Gamemaster" }, users: { activeGM: null }, socket: { emit: (_s, d) => emitted.push(d), on: () => {} } };

const book = await import("../module/magic/spellbook.mjs");
const free = await import("../module/magic/spellbook-free-workflow.mjs");
const auth = await import("../module/combat/gm-authorisation.mjs");

/* A — the tally */
const spell = (name, flags = {}) => ({ type: "spell", name, flags: { "trg-prime": { spellBookPick: true, ...flags } } });
const actor = {
  items: [
    spell("Sleep"),
    spell("Shield"),
    spell("Fly", { freeBookSpell: true }),
    spell("Fireball", { learnedExtra: true }),
    spell("Mage Hand", { cantripBook: true, freeBookSpell: true }),
    { type: "spell", name: "Bless", flags: {} }
  ]
};
eq("A1 every book spell is listed, the free one included",
  book.spellBookSpells(actor).map((s) => s.name), ["Sleep", "Shield", "Fly", "Fireball"]);
eq("A2 the free spell is off the ladder (Slots filled counts the slot picks only)",
  book.spellBookLadderSpells(actor).map((s) => s.name), ["Sleep", "Shield"]);
eq("A3 Free spells counts the GM-approved one, not a Learn a Spell addition or a cantrip",
  book.spellBookFreeSpells(actor).map((s) => s.name), ["Fly"]);
eq("A4 isFreeBookSpell reads the flag", [book.isFreeBookSpell(actor.items[2]), book.isFreeBookSpell(actor.items[0])], [true, false]);
eq("A6 Learned counts the Learn a Spell addition only (3.714.1, its own box)",
  book.spellBookLearnedSpells(actor).map((s) => s.name), ["Fireball"]);
eq("A7 a spell flagged both ways counts as free, not learned",
  book.spellBookLearnedSpells({ items: [spell("Haste", { freeBookSpell: true, learnedExtra: true })] }).length, 0);
const state = book.spellBookState({ level: 1, firstPicks: 6, owned: book.spellBookLadderSpells(actor).length });
eq("A5 ...so a free spell leaves a slot owed", [state.owned, state.remaining], [2, 4]);

/* B — the flags and the question */
const flags = free.freeSpellFlags({ keep: 1 }, { classItem: { id: "cls1" }, spellName: "Fly", approvedBy: "Gamemaster" });
eq("B1 the free spell's flags", flags, {
  keep: 1, spellBookPick: true, freeBookSpell: true, freeApprovedBy: "Gamemaster",
  grantedBy: { sourceId: "cls1", sourceName: free.FREE_SPELL_SOURCE_NAME, requested: "Fly" }
});
ok("B2 ...not learnedExtra (that is Learn a Spell's, which is not a free spell)", !("learnedExtra" in flags));
const q = free.freeSpellQuestion({ name: "Fly", system: { ppCost: 6, tradition: "arcane, verdant" } });
ok("B3 the GM is told the spell, its PP and tradition, and that it is free", /Fly \(PP 6, arcane, verdant\)/.test(q) && /for free/.test(q) && /no slot/.test(q));

/* C — the GM's say-so */
globalThis.__answer = true;
const yes = await auth.requestGMAuthorisation({ name: "Elara" }, "a free Fly", { title: "Free Spell — GM Approval", question: q, label: "free spell (Fly)" });
eq("C1 a GM's own press is asked on the GM's own screen and a yes allows it", yes, true);
eq("C2 ...with the ask's own title", dialogs.at(-1)?.window?.title, "Free Spell — GM Approval");
ok("C3 ...and its own question, escaped, naming who", /<strong>Elara<\/strong>: asks to add Fly/.test(dialogs.at(-1)?.content ?? ""));
globalThis.__answer = false;
eq("C4 a GM's no refuses it", await auth.requestGMAuthorisation({ name: "Elara" }, "a free Fly", { title: "T", question: q }), false);
globalThis.__answer = true;
await auth.requestGMAuthorisation({ name: "Orc" }, "a Strike with Longsword");
eq("C5 the off-turn strike's dialog is unchanged: its title", dialogs.at(-1)?.window?.title, "Off-Turn Strike — GM Authorisation");
ok("C6 ...and its text", /wants to make a Strike with Longsword outside their turn/.test(dialogs.at(-1)?.content ?? "") && /It costs no AP/.test(dialogs.at(-1)?.content ?? ""));
globalThis.game.user = { isGM: false, id: "p1", name: "Player" };
const before = notices.length;
eq("C7 a player's press with no GM connected is refused", await auth.requestGMAuthorisation({ name: "Elara" }, "a free Fly", { question: q, label: "free spell (Fly)" }), false);
ok("C8 ...and says it was the free spell that needed the GM", /Elara's free spell \(Fly\) needs the GM's authorisation, and no GM is connected/.test(notices.slice(before).join(" ")));
globalThis.game.users.activeGM = { id: "gm" };
const pending = auth.requestGMAuthorisation({ name: "Elara" }, "a free Fly", { title: "Free Spell — GM Approval", question: q, label: "free spell (Fly)" });
const sent = emitted.at(-1);
eq("C9 a player's press carries the title and question across the socket",
  [sent?.action, sent?.title, sent?.question === q], ["gm.authorise", "Free Spell — GM Approval", true]);
// Answer it the way the GM's client does, through the registered listener.
let listener = null;
globalThis.game.socket.on = (_s, fn) => { listener = fn; };
auth.registerGMAuthorisation();
await listener({ action: "gm.authorised", requestId: sent.requestId, userId: "p1", allowed: true });
eq("C10 ...and the GM's yes comes back as allowed", await pending, true);

/* D — the wiring */
const tpl = read("templates/item/item-sheet.hbs");
ok("D1 the book card has a Free Spell button", /data-action="addFreeSpellToBook"[\s\S]{0,300}Free Spell/.test(tpl));
ok("D2 ...behind the same editable gate as Add to Book",
  /\{\{#if editable\}\}[\s\S]{0,200}data-action="addToSpellBook"[\s\S]{0,500}data-action="addFreeSpellToBook"[\s\S]{0,400}\{\{\/if\}\}/.test(tpl));
ok("D3 a Free spells box beside Slots filled shows the tally", /<span>Free spells<\/span>[\s\S]{0,200}\{\{spellBook\.free\}\}/.test(tpl));
ok("D4 a free spell's row is marked", /\{\{#if spell\.free\}\}[\s\S]{0,120}\(free\)/.test(tpl));
const sheet = read("module/sheets/item-sheet.mjs");
ok("D5 the item sheet registers the action", /addFreeSpellToBook: TRGItemSheet\.addFreeSpellToBook/.test(sheet));
ok("D6 ...whose handler opens the free pick for the owner", /static async addFreeSpellToBook\(\) \{[\s\S]{0,400}return openFreeSpellPick\(actor\);/.test(sheet));
ok("D7 ...and marks each row's free state", /free: isFreeBookSpell\(spell\)/.test(sheet));
const wf = read("module/magic/spellbook-workflow.mjs");
ok("D8 the book's context carries the free count", /free: spellBookFreeSpells\(actor\)\.length/.test(wf));
const fw = read("module/magic/spellbook-free-workflow.mjs");
const askAt = fw.indexOf("await requestGMAuthorisation(");
const createAt = fw.indexOf("createEmbeddedDocuments");
ok("D9 the GM is asked BEFORE anything is created", askAt > 0 && createAt > askAt);
ok("D10 ...and a no stops it", /if \(!approved\) return null;/.test(fw.slice(askAt, createAt)));
ok("D11 the browser is Add to Book's later-slot filter with the PP cap lifted (3.714.1)", /filter: eligibilityFor\(actor, \{ firstPick: false, anyPP: true \}\)/.test(fw));
ok("D11b ...anyPP lifts only the cap: tradition rule and already-known tests stay",
  /export function eligibilityFor\(actor, \{ firstPick, anyPP = false \}\)/.test(wf)
  && /firstPick: firstPick && !anyPP, casterLevel: anyPP \? Number\.MAX_SAFE_INTEGER - 1 : casterLevel/.test(wf)
  && /!alreadyKnownSpell\(owned, entry\) &&\s*\n\s*pickAllowed\(pickRule, entry\.system\?\.tradition\)/.test(wf));
eq("D11c ...and a PP 9 spell of the tradition passes the lifted cap, a specialist one still does not",
  [book.spellBookPickEligible({ tradition: "arcane", ppCost: 9 }, { casterLevel: Number.MAX_SAFE_INTEGER - 1 }),
   book.spellBookPickEligible({ tradition: "arcane", ppCost: 9, specialist: true }, { casterLevel: Number.MAX_SAFE_INTEGER - 1 }),
   book.spellBookPickEligible({ tradition: "arcane", ppCost: 9 }, { casterLevel: 1 })], [true, false, false]);
ok("D12 the spell is created with the free flags", /\[SYSTEM_ID\]: freeSpellFlags\(/.test(fw));
ok("D13 a Learned box shows Learn a Spell's tally (3.714.1)", /<span>Learned<\/span>[\s\S]{0,250}\{\{spellBook\.learned\}\}/.test(tpl));
ok("D14 ...the card's five boxes sit in a five-column grid", /<div class="field-grid five-column">\s*<label>\s*<span>Slots filled<\/span>/.test(tpl));
ok("D15 the context carries the learned count", /learned: spellBookLearnedSpells\(actor\)\.length/.test(wf));
ok("D16 a learned spell's row is marked", /learned: Boolean\(spell\.flags\?\.\["trg-prime"\]\?\.learnedExtra\) && !isFreeBookSpell\(spell\)/.test(sheet)
  && /\{\{#if spell\.learned\}\}[\s\S]{0,140}\(learned\)/.test(tpl));

if (failures.length) {
  process.stderr.write(`verify-spellbook-free: FAILED ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-spellbook-free: OK — ${checks} checks.\n`);
// The ask's two-minute timer would otherwise hold the process open.
process.exit(0);
