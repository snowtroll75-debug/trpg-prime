#!/usr/bin/env node
/**
 * One-shot: the Wizard's Spellbook becomes the Spellbook (3.712.3).
 *
 * Graham, 24 November 2026: other classes keep a spell book now (Eldritch
 * Arts' Archmage, Pillars of Faith's Archivist), so the core gear item is
 * renamed "Spellbook". Three rows, all in the packs the core ships:
 *
 *   - the gear item's own name (replayable through `formerName`);
 *   - its description, which said it was granted by "the Wizard class";
 *   - the Wizard class's `grantedGear`, which names the item it hands over
 *     — resolved BY NAME from the gear pack, so it must move with it.
 *
 * Owned copies on characters are the migration's job (migrateSpellbookRename
 * in module/migration.mjs); this only declares the pack side.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

export const OLD_NAME = "Wizard's Spellbook";
export const NEW_NAME = "Spellbook";
export const OLD_DESCRIPTION = "Granted for free the moment a character takes the Wizard class. Open this item's own sheet to see the book grow — six PP 2 arcane spells at 1st level, two more every level after — and to add spells to it as slots open up. Being in the book isn't the same as knowing it for the day: memorise from it at daily preparation (the Magic tab's Memorisation card) before a spell in it can actually be cast.";
export const NEW_DESCRIPTION = "Granted for free the moment a character takes a class that keeps a spell book, such as the Wizard. Open this item's own sheet to see the book grow — for a Wizard, six PP 2 arcane spells at 1st level and two more every level after — and to add spells to it as slots open up. Being in the book isn't the same as knowing it for the day: memorise from it at daily preparation (the Magic tab's Memorisation card) before a spell in it can actually be cast.";

const REASON = "Graham, 24 Nov 2026: other classes now use a spell book (Archmage, Archivist), so the "
  + "core item is no longer the Wizard's alone and is renamed Spellbook.";

const FIXES = [
  { id: "spellbook-rename-name", pack: "gear", name: NEW_NAME, formerName: OLD_NAME, path: "name",
    from: OLD_NAME, to: NEW_NAME, reason: REASON },
  { id: "spellbook-rename-description", pack: "gear", name: NEW_NAME, formerName: OLD_NAME,
    path: "system.description", from: OLD_DESCRIPTION, to: NEW_DESCRIPTION,
    reason: "The description named the Wizard as the only class that grants it." },
  { id: "spellbook-rename-wizard-grant", pack: "classes", name: "Wizard", path: "system.grantedGear",
    from: OLD_NAME, to: NEW_NAME,
    reason: "grantedGear is resolved by NAME from the gear pack; left on the old name, a new Wizard "
      + "would be granted nothing and the card would report it unresolved." }
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
  const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let added = 0;
  for (const fix of FIXES) {
    if (file.fixes.some((f) => f.id === fix.id)) continue;
    file.fixes.push({ ...fix, declaredAt: "2026-11-24", systemVersion: "3.712.3" });
    added += 1;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`declare-spellbook-rename: ${added} declared, ${file.fixes.length} total.\n`);
}
