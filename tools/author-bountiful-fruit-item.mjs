#!/usr/bin/env node
/**
 * THE FOOD NATURE'S BOUNTY MAKES (3.614.0, Graham's R10 of block 35: "Yes").
 *
 * Page 354: "You conjure a fresh and natural palm-sized fruit or vegetable,
 * which materializes in your open hand. … When a creature eats the food
 * using a 1 AP (Interact) action, they regain 3d10+12 Hit Points, while also
 * receiving the nourishment equivalent to having consumed a meal. If the food
 * remains uneaten, it deteriorates and disintegrates into dust after 1
 * minute."
 *
 * GOODBERRY'S SHAPE, EXACTLY (author-goodberry-item.mjs): a consumable whose
 * own `effect` heals, copied by the spell's `conjureItem` row and kept on a
 * one-minute clock by the companion effect. The warp's +1d10 is stamped onto
 * the copy at the cast — the pack entry prints the base.
 *
 * IDEMPOTENT: fixed _id, replaced wholesale on every run.
 */

import { ClassicLevel } from "classic-level";

const ID = "trgBountyFruit01";
const doc = {
  _id: ID,
  name: "Bountiful Fruit",
  type: "consumable",
  img: "icons/svg/item-bag.svg",
  system: {
    quantity: 1,
    weight: 0,
    price: 0,
    equipped: false,
    invested: false,
    hp: { value: 0, max: 0 },
    traits: "Consumable Essence Healing",
    description:
      "A fresh, palm-sized fruit or vegetable conjured by Nature's Bounty — the caster chooses which.\n\n"
      + "A creature that eats it with a 1 AP (Interact) action regains 3d10+12 Hit Points and receives the "
      + "nourishment of a meal.\n\n"
      + "Uneaten, it deteriorates and disintegrates into dust after 1 minute.",
    uses: { value: 1, max: 1 },
    activation: "Interact (1 AP)",
    itemLevel: 7
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
          label: "Bountiful Fruit — eaten",
          pp: 7,
          duration: "",
          effects: [{ kind: "heal", target: "self", formula: "3d10 + 12" }]
        }
      }
    }
  },
  _stats: {
    coreVersion: "14",
    systemId: "trg-prime",
    systemVersion: "3.614.0",
    createdTime: 1791000000000,
    modifiedTime: 1791000000000,
    lastModifiedBy: null,
    compendiumSource: null,
    duplicateSource: null
  }
};

const db = new ClassicLevel("packs/consumables", { valueEncoding: "json" });
await db.open();
await db.put(`!items!${ID}`, doc);
await db.close();
console.log("Bountiful Fruit consumable written to packs/consumables");
