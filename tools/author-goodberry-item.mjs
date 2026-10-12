#!/usr/bin/env node
/**
 * THE BERRY GOODBERRY MAKES (3.590.0).
 *
 * Goodberry's whole mechanism is five items: *"makes 5 of them magical
 * ... The berry also cures 1 point of damage when eaten"*. The spell's
 * `conjureItem` row COPIES a compendium entry rather than describing one
 * (see magic/conjured-item.mjs for why a hand-built imitation would be a
 * second, subtly different item) -- and there was no Goodberry in any
 * conjurable pack, so the row named nothing and the spell made nothing.
 *
 * THE CONSUMABLE RAIL ALREADY DOES THE REST. A consumable may carry
 * `flags.trg-prime.consumable.effect`, in exactly the shape a spell's
 * `system.effects` takes, resolved by the same `applySpellEffects` --
 * which is how the five Potions of Cure print their own healing rather
 * than borrowing the Cure spell's. A berry is that mechanism with a
 * formula of 1. Nothing new was needed; it had to be measured to be
 * found.
 *
 * kind "other" rather than "potion": both are check-free to use, and the
 * verb printed on the sheet's Use button is the difference -- "Use" a
 * berry, "Drink" a potion.
 *
 * IDEMPOTENT: fixed _id, replaced wholesale on every run.
 */

import { ClassicLevel } from "classic-level";

// SIXTEEN CHARACTERS, WHICH IS WHAT FOUNDRY IDS ARE. The first version
// of this file used a 17-character id and the document then loaded with
// `_id: null` — harmless, since creation assigns a fresh one, but wrong,
// and the kind of wrong that costs somebody an afternoon of bisection.
const ID = "trgGoodberry0001";
const doc = {
  _id: ID,
  name: "Goodberry",
  type: "consumable",
  img: "icons/svg/item-bag.svg",
  system: {
    quantity: 1,
    weight: 0,
    price: 0,
    equipped: false,
    invested: false,
    hp: { value: 0, max: 0 },
    traits: "Alteration Consumable Healing",
    description:
      "A berry transmuted by the goodberry spell, plump and faintly luminous.\n\n"
      + "Each transmuted berry provides nourishment as if it were a normal meal for a Medium creature. "
      + "The berry also cures 1 point of damage when eaten, subject to a maximum of 8 points of such "
      + "curing in any 24-hour period.\n\n"
      + "If combined with the Medicine skill to treat disease or poison, the berries give you a "
      + "+2 circumstance bonus.\n\n"
      + "A berry stops being magical when the spell's duration ends.",
    uses: { value: 1, max: 1 },
    activation: "Interact (1 AP)",
    itemLevel: 1
  },
  effects: [],
  folder: null,
  sort: 0,
  ownership: { default: 0 },
  flags: {
    "trg-prime": {
      consumable: {
        kind: "other",
        costColumn: "consumable",
        hands: 1,
        traitOmitsConsumable: false,
        effect: {
          label: "Goodberry — eaten",
          pp: 2,
          duration: "",
          // THE EIGHT-POINT DAILY CAP IS NOT HERE, and could not be: it
          // spans casts, eaters and berries from different handfuls, and
          // no per-item rail counts across all three. It is printed on
          // the item and on the spell's card, and counted at the table.
          effects: [{ kind: "heal", target: "self", formula: "1" }]
        }
      }
    }
  },
  _stats: {
    coreVersion: "14",
    systemId: "trg-prime",
    systemVersion: "3.590.0",
    createdTime: 1788000000000,
    modifiedTime: 1788000000000,
    lastModifiedBy: null,
    compendiumSource: null,
    duplicateSource: null
  }
};

const db = new ClassicLevel("packs/consumables", { valueEncoding: "json" });
await db.open();
await db.put(`!items!${ID}`, doc);
await db.close();
console.log("Goodberry consumable written to packs/consumables");
