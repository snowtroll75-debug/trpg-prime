#!/usr/bin/env node
/** mutate-arcanist-book — the mutation half of verify-arcanist-book (3.676.0). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AB = m("magic", "arcanist-book.mjs"), FC = m("magic", "feat-casting.mjs"), FCW = m("magic", "feat-casting-workflow.mjs"),
  SA = m("magic", "spell-availability.mjs"), ACW = m("magic", "archetype-casting-workflow.mjs"), LSW = m("magic", "learn-spell-workflow.mjs"),
  AW = m("combat", "action-workflow.mjs"), SHEET = m("sheets", "actor-sheet.mjs"), SKD = m("data", "skill-actions.mjs"),
  HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs"), SJ = path.join(SYSTEM_ROOT, "system.json"),
  CSS = path.join(SYSTEM_ROOT, "styles", "trg-prime.css");

const MUTATIONS = [
  // A
  { name: "the book belongs to every archetype", file: AB, from: "return archetypeCastingSources(items).find((s) => s.style === \"book\") ?? null;", to: "return archetypeCastingSources(items)[0] ?? null;", breaks: "A4" },
  { name: "THE COMPLAINT: no slot is ever bound to the book", file: AB, from: "  if (!book) return false;\n  return String(slot?.tradition", to: "  return false;\n  return String(slot?.tradition", breaks: "A6" },
  { name: "every tradition's slot is bound to the arcane book", file: AB, from: "  if (!book) return false;\n  return String(slot?.tradition ?? \"\").trim().toLowerCase() === String(book.tradition ?? \"\").trim().toLowerCase();", to: "  if (!book) return false;\n  return true;", breaks: "A7" },
  { name: "the shared slot reader drops the class tradition", file: FC, from: "    ownTradition: classTradition(actor?.system?.progression)\n  });\n}", to: "    ownTradition: \"arcane\"\n  });\n}", breaks: "A9/D6" },
  // B
  { name: "R1 DROPPED: the tier feats owe no free additions", file: AB, from: "  return Math.max(0, Math.floor(Number(casterTierSlots(featNames, level)?.[tradition] ?? 0)));", to: "  return 0;", breaks: "B1/B3/B4" },
  { name: "the own-tradition exclusion is lost", file: AB, from: "  if (tradition === String(ownTradition ?? \"\").trim().toLowerCase()) return 0;\n", to: "", breaks: "B5" },
  { name: "remaining goes negative", file: AB, from: "remaining: Math.max(0, a - u) };", to: "remaining: a - u };", breaks: "B8" },
  // C
  { name: "the book takes spells above what a slot could hold", file: AB, from: "  if (pp > maxPPPerCast(casterLevel)) return false;\n  if (spell?.specialist) return false;\n  const wanted = String(tradition", to: "  if (spell?.specialist) return false;\n  const wanted = String(tradition", breaks: "C2/C8" },
  { name: "the book takes cantrips", file: AB, from: "  if (!Number.isFinite(pp) || pp < 1) return false;\n  if (pp > maxPPPerCast(casterLevel)) return false;", to: "  if (!Number.isFinite(pp) || pp < 0) return false;\n  if (pp > maxPPPerCast(casterLevel)) return false;", breaks: "C3" },
  { name: "the book takes specialist spells", file: AB, from: "  if (pp > maxPPPerCast(casterLevel)) return false;\n  if (spell?.specialist) return false;", to: "  if (pp > maxPPPerCast(casterLevel)) return false;", breaks: "C4" },
  { name: "a slot takes a spell that is not in the book", file: AB, from: "export function bookSlotEligible(item, slot, liveSlotIds = new Set()) {\n  if (!archetypeBookMark(item)) return false;", to: "export function bookSlotEligible(item, slot, liveSlotIds = new Set()) {", breaks: "C11" },
  { name: "a slot ignores its own ceiling", file: AB, from: "  if (pp > Math.max(0, Number(slot?.maxPP) || 0)) return false;\n  const current", to: "  const current", breaks: "C10" },
  { name: "one book spell may sit in two slots", file: AB, from: "  if (current && current !== slot?.id && liveSlotHolds(liveSlotIds, current, pp)) return false;\n", to: "", breaks: "C12/H7" },
  { name: "a book entry arrives prepared", file: AB, from: "    system: { ...data?.system, prepared: false },", to: "    system: { ...data?.system, prepared: true },", breaks: "C14" },
  { name: "the book stops belonging to the Arcanist feat", file: AB, from: "          sourceId: feat?.id ?? null,", to: "          sourceId: null,", breaks: "C16" },
  // D
  { name: "THE STAMP COMES BACK: a book spell is castable whatever its slot", file: SA, from: "    return bookSpellSlotted(item, live)\n      ? at(SPELL_SOURCES.memorised, true, true)\n      : at(SPELL_SOURCES.book, false, false);", to: "    return at(SPELL_SOURCES.memorised, true, true);", breaks: "D2/D3/D8" },
  { name: "a book spell's castability reads `prepared`", file: SA, from: "  if (archetypeBookMark(item)) {\n    const live = liveSlotIds ?? liveFeatSlotIds(item?.parent);", to: "  if (archetypeBookMark(item) && false) {\n    const live = liveSlotIds ?? liveFeatSlotIds(item?.parent);", breaks: "D5" },
  { name: "a dead slot still counts", file: AB, from: "  if (!id || !live?.has?.(id)) return false;", to: "  if (!id) return false;", breaks: "D3/D8/H3" },
  { name: "THE LIVE DEFECT (3.676.1): a slot holds whatever is marked in it", file: AB, from: "  return Number(pp ?? 0) <= Math.max(0, Number(live.get(id)) || 0);", to: "  return true;", breaks: "H2/H5/H9" },
  { name: "the slot table counts an outgrown book spell as filling it", file: FC, from: "    if (inBook && Number(item?.system?.ppCost ?? 0) > Math.max(0, Number(slot.maxPP) || 0)) continue;\n", to: "", breaks: "E4" },
  { name: "the live slots lose their ceilings", file: FC, from: "  return new Map(actorFeatSpellSlots(actor).map((s) => [s.id, s.maxPP]));", to: "  return new Set(actorFeatSpellSlots(actor).map((s) => s.id));", breaks: "H9/H10" },
  { name: "an outgrown spell stays pinned to its old slot", file: AB, from: "  if (current && current !== slot?.id && liveSlotHolds(liveSlotIds, current, pp)) return false;", to: "  if (current && current !== slot?.id && liveSlotIds.has(current)) return false;", breaks: "H6" },
  { name: "the card's memorised mark goes back to slot existence", file: ACW, from: "      memorised: bookSpellSlotted(i, live)", to: "      memorised: live.has(String(i.flags?.[SYSTEM_ID]?.featSpellSlot?.slotId ?? \"\"))", breaks: "G19" },
  { name: "the sub-heading is centred again", file: CSS, from: "  .trg-prime .archetype-book-heading h3 {\n    margin: 2px 0 0;\n    text-align: left;", to: "  .trg-prime .archetype-book-heading h3 {\n    margin: 2px 0 0;", breaks: "G18" },
  { name: "the gate's message stops naming the slot card", file: SA, from: "is in your spellbook but is not memorised in a spell slot — memorise it from the Spell Slots card", to: "is in your spellbook but is not prepared today — prepare it on the Magic tab. (", breaks: "D9" },
  { name: "the book is no longer a book pool", file: SA, from: "  if (archetypeBookMark(item)) return true;\n", to: "", breaks: "D4" },
  // E
  { name: "a book spell is reported as orphaned again", file: FC, from: "    if (!slot) {\n      if (!inBook) orphaned.push(item);", to: "    if (!slot) {\n      orphaned.push(item);", breaks: "E1" },
  { name: "a second claim on a slot is orphaned even from the book", file: FC, from: "    if (byId.has(mark.slotId)) {\n      if (!inBook) orphaned.push(item);", to: "    if (byId.has(mark.slotId)) {\n      orphaned.push(item);", breaks: "E3" },
  // F
  { name: "the Arcanist route is lost", file: AB, from: "  if (book) return \"archetype\";\n", to: "", breaks: "F2" },
  { name: "the Arcanist's book outranks the Wizard's", file: AB, from: "  if (classBook) return \"class\";\n  if (book) return \"archetype\";", to: "  if (book) return \"archetype\";\n  if (classBook) return \"class\";", breaks: "F4" },
  // G
  { name: "THE COMPLAINT, in the workflow: the slot opens the pack", file: FCW, from: "  if (slotIsBookBound(slot, book)) return memoriseFromBook(actor, slot, book, slots);\n", to: "", breaks: "G1" },
  { name: "the book picker offers the whole book", file: FCW, from: "    .filter((i) => bookSlotEligible(i, slot, live))\n", to: "", breaks: "G2" },
  { name: "clearing deletes the page from the book", file: FCW, from: "  if (archetypeBookMark(slot.filled)) {\n    await slot.filled.update", to: "  if (false) {\n    await slot.filled.update", breaks: "G4" },
  { name: "a free addition is offered when none is owed", file: ACW, from: "  if (!free.remaining) {", to: "  if (false) {", breaks: "G8" },
  { name: "Learn a Spell stays Wizard-only", file: LSW, from: "  return routeFor(actor).kind !== null;", to: "  return routeFor(actor).kind === \"class\";", breaks: "G9" },
  { name: "Learn a Spell writes the Arcanist's spell as free", file: LSW, from: "via: \"learned\", requested: document.name", to: "via: \"free\", requested: document.name", breaks: "G10" },
  { name: "Learn a Spell offers the class's tradition to a Cleric/Arcanist", file: LSW, from: "{ tradition: route.book.tradition, casterLevel }", to: "{ tradition: String(actor.system?.magic?.tradition ?? \"\"), casterLevel }", breaks: "G11" },
  { name: "the card always says Spell Library", file: AW, from: "added to ${result.bookLabel ?? \"your Spell Library\"}", to: "added to your Spell Library", breaks: "G12" },
  { name: "the sheet loses the free-addition handler", file: SHEET, from: "      addArchetypeBookSpell: TRGActorSheet.addArchetypeBookSpell,\n", to: "", breaks: "G14" },
  { name: "the card stops listing the book", file: HBS, from: "{{#each arch.levelled as |b|}}", to: "{{#each arch.nothing as |b|}}", breaks: "G16" },
  { name: "Learn a Spell's text forgets the Arcanist", file: SKD, from: "an Arcanist's spellbook (arcane spells", to: "a second book (spells", breaks: "G17" },
  // Z
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.676.0\"", breaks: "Z" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-arcanist-book.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
function runCheck() {
  try {
    const out = execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-arcanist-book.mjs")], { stdio: ["ignore", "pipe", "pipe"] });
    return !/FAILED/.test(String(out));
  } catch { return false; }
}
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run() || !runCheck()) { process.stderr.write("mutate-arcanist-book: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = runCheck();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-arcanist-book: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-arcanist-book: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
