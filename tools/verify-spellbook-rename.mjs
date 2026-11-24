#!/usr/bin/env node
/**
 * verify-spellbook-rename — the Wizard's Spellbook becomes the Spellbook
 * (3.712.3; Graham, 24 November 2026: the Archmage and the Archivist keep
 * spell books too, so the core item is no longer the Wizard's alone).
 *
 *   A. THE PACKS. The gear item is named "Spellbook", is still the spell
 *      book container, and no item anywhere in the gear pack keeps the old
 *      name. The Wizard's grantedGear names it, and that name RESOLVES to
 *      exactly one gear item — the grant path matches by name.
 *   B. THE MIGRATION'S RULE, driven. An old owned book is renamed, its
 *      stamp moved and its stock description replaced; a GM's own renamed
 *      or re-described book is left alone; an old Wizard class copy has
 *      its grant entry moved without disturbing other entries; a migrated
 *      copy needs nothing (idempotent).
 *   C. THE WIRING. The pass is registered, gated at the schema stamp, and
 *      reported; the sheets no longer tell a player to look for the old
 *      name.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SPELLBOOK_NEW_DESCRIPTION,
  SPELLBOOK_NEW_NAME,
  SPELLBOOK_OLD_DESCRIPTION,
  SPELLBOOK_OLD_NAME,
  PRAYER_BOOK_OLD_DESCRIPTION,
  renamedGrantList,
  spellbookRenameUpdate
} from "../module/data/spellbook-rename.mjs";

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

async function loadPack(name) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const out = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!")) out.push(value);
    }
  } finally {
    await db.close();
  }
  return out;
}

/* A — the packs */
const gear = await loadPack("gear");
const classes = await loadPack("classes");
const book = gear.find((g) => g._id === "6useCNgleUx3BiUw");
eq("A1 the core book is named Spellbook", book?.name, "Spellbook");
eq("A2 ...and is still the spell book container", book?.system?.spellbookContainer, true);
eq("A3 ...its description no longer says only the Wizard grants it", book?.system?.description, SPELLBOOK_NEW_DESCRIPTION);
eq("A4 no gear item keeps the old name", gear.filter((g) => g.name === SPELLBOOK_OLD_NAME).length, 0);
const wizard = classes.find((c) => c.name === "Wizard");
eq("A5 the Wizard grants the Spellbook", wizard?.system?.grantedGear, "Spellbook");
const granted = String(wizard?.system?.grantedGear ?? "").split(",").map((s) => s.trim()).filter(Boolean);
for (const name of granted) {
  eq(`A6 the Wizard's grant "${name}" resolves to exactly one gear item`,
    gear.filter((g) => g.name.toLowerCase() === name.toLowerCase()).length, 1);
}
const anyOld = classes.filter((c) => /wizard.s spell ?book/i.test(String(c.system?.grantedGear ?? "")));
eq("A7 no class still grants the old name", anyOld.map((c) => c.name), []);

/* B — the migration's rule */
const oldBook = {
  type: "gear", name: SPELLBOOK_OLD_NAME,
  system: { description: SPELLBOOK_OLD_DESCRIPTION, spellbookContainer: true },
  flags: { "trg-prime": { grantedBy: { sourceId: "cls1", sourceName: "Wizard", requested: SPELLBOOK_OLD_NAME } } }
};
eq("B1 an old owned book: name, description and stamp all move", spellbookRenameUpdate(oldBook), {
  name: SPELLBOOK_NEW_NAME,
  "system.description": SPELLBOOK_NEW_DESCRIPTION,
  "flags.trg-prime.grantedBy.requested": SPELLBOOK_NEW_NAME
});
eq("B2 a re-described old book keeps the GM's description",
  spellbookRenameUpdate({ ...oldBook, system: { description: "Elara's battered grimoire." } }),
  { name: SPELLBOOK_NEW_NAME, "flags.trg-prime.grantedBy.requested": SPELLBOOK_NEW_NAME });
eq("B3 a book the GM renamed is left with its name (only the stamp moves)",
  spellbookRenameUpdate({ ...oldBook, name: "Elara's Grimoire" }),
  { "flags.trg-prime.grantedBy.requested": SPELLBOOK_NEW_NAME });
eq("B4 a hand-dragged old book with no stamp is still renamed",
  spellbookRenameUpdate({ ...oldBook, flags: {} }),
  { name: SPELLBOOK_NEW_NAME, "system.description": SPELLBOOK_NEW_DESCRIPTION });
eq("B5 a weapon that happens to share the name is not gear and is left alone",
  spellbookRenameUpdate({ type: "weapon", name: SPELLBOOK_OLD_NAME, system: {}, flags: {} }), null);
eq("B6 an old Wizard class copy has its grant moved",
  spellbookRenameUpdate({ type: "class", name: "Wizard", system: { grantedGear: SPELLBOOK_OLD_NAME }, flags: {} }),
  { "system.grantedGear": SPELLBOOK_NEW_NAME });
eq("B7 other entries in a grant list are kept, in order",
  renamedGrantList("Lantern, Wizard's Spellbook, Ink Pen"), "Lantern, Spellbook, Ink Pen");
eq("B8 a grant list without a former book is not touched", renamedGrantList("Lantern, Ink Pen"), null);
const migrated = { ...oldBook, name: SPELLBOOK_NEW_NAME, system: { description: SPELLBOOK_NEW_DESCRIPTION },
  flags: { "trg-prime": { grantedBy: { requested: SPELLBOOK_NEW_NAME } } } };
eq("B9 a migrated book needs nothing (idempotent)", spellbookRenameUpdate(migrated), null);
eq("B10 a migrated class copy needs nothing",
  spellbookRenameUpdate({ type: "class", name: "Wizard", system: { grantedGear: "Spellbook" }, flags: {} }), null);

/* D — one book for every book caster (3.712.4) */
const prayer = {
  type: "gear", name: "Prayer Book",
  system: { description: PRAYER_BOOK_OLD_DESCRIPTION, spellbookContainer: true },
  flags: { "trg-prime": { grantedBy: { sourceId: "cls2", sourceName: "Archivist", requested: "Prayer Book" } } }
};
eq("D1 an owned Prayer Book becomes the Spellbook: name, description and stamp", spellbookRenameUpdate(prayer), {
  name: SPELLBOOK_NEW_NAME,
  "system.description": SPELLBOOK_NEW_DESCRIPTION,
  "flags.trg-prime.grantedBy.requested": SPELLBOOK_NEW_NAME
});
eq("D2 a gear item merely called Prayer Book, not a spell book, is left alone",
  spellbookRenameUpdate({ type: "gear", name: "Prayer Book", system: { spellbookContainer: false }, flags: {} }), null);
eq("D3 an owned Archivist class copy grants the Spellbook instead of the Prayer Book",
  spellbookRenameUpdate({ type: "class", name: "Archivist", system: { grantedGear: "Prayer Book", memorisationStyle: "book" }, flags: {} }),
  { "system.grantedGear": SPELLBOOK_NEW_NAME });
for (const name of ["Archmage", "Spellblade"]) {
  eq(`D4 an owned ${name} class copy that granted no book gains the Spellbook`,
    spellbookRenameUpdate({ type: "class", name, system: { grantedGear: "", memorisationStyle: "book" }, flags: {} }),
    { "system.grantedGear": SPELLBOOK_NEW_NAME });
}
eq("D5 an Archmage copy a GM gave other gear keeps it",
  spellbookRenameUpdate({ type: "class", name: "Archmage", system: { grantedGear: "Ley Crystal", memorisationStyle: "book" }, flags: {} }), null);
eq("D6 a class that is not a book caster gains nothing",
  spellbookRenameUpdate({ type: "class", name: "Sorcerer", system: { grantedGear: "", memorisationStyle: "repertoire" }, flags: {} }), null);
eq("D7 the Liturgist's Liturgical Book is a different book and is not touched",
  spellbookRenameUpdate({ type: "gear", name: "Liturgical Book", system: { spellbookContainer: true },
    flags: { "trg-prime": { grantedBy: { requested: "Liturgical Book" } } } }), null);
eq("D8 two former books in one list leave one Spellbook", renamedGrantList("Wizard's Spellbook, Prayer Book"), "Spellbook");

/* C — the wiring */
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");
const migration = read("module/migration.mjs");
const schema = migration.match(/export const TRG_SCHEMA_VERSION = "([^"]+)"/)?.[1];
const gate = migration.match(/runIf\("([^"]+)", "the Wizard's Spellbook renamed Spellbook on owned copies"/)?.[1];
ok("C1 the migration pass is registered", Boolean(gate));
eq("C2 ...gated at the schema stamp, so every older world is offered it", gate, schema);
ok("C3 ...over actors, unlinked tokens and world items",
  /migrateSpellbookRename\(\[\.\.\.actors, \.\.\.tokenActors\], Array\.from\(game\.items \?\? \[\]\)\)/.test(migration));
ok("C4 ...and what it changed is reported to the GM", /result\.spellbookRenamed\?\.length/.test(migration));
ok("C5 the Magic tab hint points at the Spellbook item",
  /open the Spellbook item in your inventory/.test(read("templates/actor/actor-sheet.hbs")));
const itemSheet = read("templates/item/item-sheet.hbs");
ok("C6 the item sheet no longer names the Wizard's Spellbook anywhere", !/Wizard.s Spellbook/.test(itemSheet));
ok("C6b ...and its Granted Gear example names the Spellbook", /placeholder="e\.g\. Spellbook"/.test(itemSheet));
const fixes = JSON.parse(read("tools/data-fixes.json")).fixes;
eq("C7 the pack edits are declared data fixes",
  ["spellbook-rename-name", "spellbook-rename-description", "spellbook-rename-wizard-grant"]
    .map((id) => fixes.some((f) => f.id === id)), [true, true, true]);

if (failures.length) {
  process.stderr.write(`verify-spellbook-rename: FAILED ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-spellbook-rename: OK — ${checks} checks.\n`);
