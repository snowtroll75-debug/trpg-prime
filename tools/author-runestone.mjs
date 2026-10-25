#!/usr/bin/env node
/**
 * author-runestone — the Runestone, added to the gear pack (3.666.2).
 *
 * Graham, 22 October 2026: "add Runestone as an item to the gear list", with
 * its entry:
 *
 *   RUNESTONE — MAGICAL — Level 1 — Price 80 gp — Usage held in 1 hand;
 *   Weight 1 lb.
 *
 * The description is his text, verbatim, but for one word: his "Transfer
 * Runes Crafting check" drops "Crafting", which he ruled a slip the same
 * morning (the action is rolled with a magical skill, Chapter 4). The stone says what it is with
 * `flags.trg-prime.runestone` as well as by name (rune-transfer.mjs asks the
 * flag first), so a renamed copy is still a runestone. Its one stored rune is
 * the ordinary `system.runes` field; runestone.mjs refuses a second rune and
 * keeps the stone's school and tradition traits in step with the rune.
 *
 * Re-runnable: it writes the same document under the same id.
 */
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

// Sixteen characters, which is what Foundry ids are.
export const RUNESTONE_ID = "trgRunestone0001";

export const RUNESTONE_DESCRIPTION = [
  "This smooth, granite like stone seems to reflect light and is etched with strange circular patterns. Its natural form makes it the perfect conduit for storing magic and be used to store magical runes.",
  "You can inscribe only one rune upon the stone at any one time. Once the stone is etched, it gains the school and tradition traits of the rune etched upon it. When a rune is transferred from the runestone to another object, the runestone loses these traits.",
  "<strong>Transferring Runes.</strong> If a rune has been inscribed onto a Runestone it may be transferred to an item at a later date. This process incurs no cost but requires a successful Transfer Runes check (see Chapter 4).",
  "<em>On the sheet: type the stored rune in the Runestone panel (one at a time). The stone takes that rune's school and tradition traits, and loses them when Transfer Runes moves the rune onto an item. Transfer Runes can also move a rune off an item onto an empty runestone. A stored rune does nothing for whoever carries the stone.</em>"
].join("\n\n");

export const RUNESTONE = Object.freeze({
  _id: RUNESTONE_ID,
  name: "Runestone",
  type: "gear",
  img: "icons/commodities/stone/engraved-symbol-water-grey.webp",
  system: {
    quantity: 1,
    weight: 1,
    price: 80,
    equipped: false,
    invested: false,
    hp: { value: 0, max: 0 },
    traits: "Magical",
    description: RUNESTONE_DESCRIPTION,
    slot: "",
    uses: { value: 0, max: 0 },
    itemSize: "T",
    itemLevel: 1,
    heldHands: 1,
    formulae: "",
    spellbookContainer: false,
    runes: "",
    gearCategory: "Goods"
  },
  effects: [],
  folder: null,
  sort: 0,
  ownership: { default: 0 },
  flags: { "trg-prime": { runestone: true } },
  _stats: {
    coreVersion: "14",
    systemId: "trg-prime",
    systemVersion: "3.666.2",
    createdTime: 1792641600000,
    modifiedTime: 1792641600000,
    lastModifiedBy: null,
    compendiumSource: null,
    duplicateSource: null
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "gear"), { valueEncoding: "json" });
  await db.open();
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!items!") && value?.name === "Runestone" && value?._id !== RUNESTONE_ID) {
      await db.close();
      throw new Error(`packs/gear already holds another Runestone (${value._id}); refusing to add a second`);
    }
  }
  await db.put(`!items!${RUNESTONE_ID}`, RUNESTONE);
  await db.close();
  console.log("Runestone written to packs/gear");
}
