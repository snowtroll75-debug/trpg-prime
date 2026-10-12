#!/usr/bin/env node
/**
 * author-power-crystal-item — the thing Power Crystal conjures (3.594.0).
 *
 * `conjureItem` COPIES a pack entry; it does not describe one. Goodberry
 * needed the same treatment at 3.590.0 and the reason is recorded there:
 * a hand-built imitation is a second item missing whatever the first one
 * carries. So the crystal is a real consumable in the pack, and the
 * casting stamps it with the points that casting paid for.
 *
 * THE ENTRY CARRIES NO POINTS ITSELF. `flags["trg-prime"].powerCrystal`
 * is written by the cast, because two crystals made by two castings hold
 * different numbers and a template cannot know either.
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "consumables"), { valueEncoding: "json" });
await db.open();

// SIXTEEN CHARACTERS, which is what Foundry requires of a document id —
// the Goodberry entry shipped with seventeen at 3.590.0 and had to be
// corrected in the same release.
const ID = "trgPowerCrystal1";
const KEY = `!items!${ID}`;

const existing = await db.get(KEY).catch(() => null);
const doc = {
  _id: ID,
  name: "Power Crystal",
  type: "consumable",
  img: "icons/commodities/gems/gem-faceted-octagon-purple.webp",
  system: {
    description: "<p>A small crystal of raw magical energy. The power points it contains may be "
      + "spent by whoever is holding it, exactly as if they were part of their own reserve — and "
      + "they are spent first. It dissolves the moment it is emptied, or when the spell that made "
      + "it ends.</p>",
    quantity: 1,
    weight: 0,
    price: 0,
    rarity: "common",
    traits: "Magical",
    consumable: { uses: 0 }
  },
  flags: { "trg-prime": { powerCrystalTemplate: true } }
};
await db.put(KEY, doc);
await db.close();
process.stdout.write(`author-power-crystal-item: ${existing ? "updated" : "created"} `
  + `"${doc.name}" (${ID}, ${ID.length} chars).\n`);
