#!/usr/bin/env node
/**
 * author-block38-feats — 3.619.0, block 38 (Chapter 12, page 390).
 *
 * "The conviction rules bring forth a collection of new feats, which are
 * described in this section instead of Chapter 5, as they rely entirely on
 * the Conviction mechanic." None of the three was in the feats pack.
 *
 *   Hero's Fortune   Conviction, General — maximum pool +1
 *   Hero's Resolve   Conviction, General — Hero's Fortune, Level 8; a point
 *                    at the beginning of each game session
 *   Luck of Heroes   Class, Conviction, Martial — Hero's Fortune, Level 5;
 *                    a DC 15 flat check keeps an Advantage or Bonus point
 *
 * Their automation is in code, read by name (conviction.mjs): the maximum
 * in base data, the session point from the Party sheet's Begin Session
 * (party-rewards-workflow.mjs), the flat check at the two spends.
 *
 * IDEMPOTENT: fixed ids, replaced wholesale.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

export const BLOCK38_FEATS = [
  {
    _id: "trgHerosFortune1",
    name: "Hero's Fortune",
    category: "General",
    traits: "Conviction",
    prerequisites: "",
    img: "systems/trg-prime/assets/feats/general.png",
    description: "You have always been able to control your own fate better than others. Your maximum conviction pool increases by 1."
  },
  {
    _id: "trgHerosResolve1",
    name: "Hero's Resolve",
    category: "General",
    traits: "Conviction",
    prerequisites: "Hero's Fortune, Level 8",
    img: "systems/trg-prime/assets/feats/general.png",
    description: "You have always been able to control your own fate better than others. You regain a conviction point at the beginning of each game session.\n\nAutomated: the GM's Begin Session button on the Party sheet's Rewards tab gives each member with this feat their point, never above the maximum."
  },
  {
    _id: "trgLuckOfHeroes1",
    name: "Luck of Heroes",
    category: "Class",
    traits: "Conviction, Martial",
    prerequisites: "Hero's Fortune, Level 5",
    img: "systems/trg-prime/assets/feats/class.png",
    description: "Whenever you spend a conviction to use the Advantage or Bonus options, there is a chance that the conviction point is not spent. Whenever you spend a conviction point, make a DC 15 flat check to avoid losing the conviction point.\n\nAutomated: the flat check is rolled when the point goes on Advantage or the +1d6 Bonus. A kept point still counts as the round's one spend."
  }
];

function featDocument(row) {
  return {
    _id: row._id,
    name: row.name,
    type: "feat",
    img: row.img,
    system: {
      source: "Chapter 12",
      category: row.category,
      tier: "",
      level: 0,
      prerequisites: row.prerequisites,
      active: true,
      description: row.description,
      usesPerDay: "",
      bonusUses: 0,
      usesValue: 0,
      sourceRace: "",
      sourceClass: "",
      sourceArchetype: "",
      traits: row.traits,
      grantedSpells: "",
      grantedAbilities: "",
      grantedFeats: ""
    },
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: {
      coreVersion: "14",
      systemId: "trg-prime",
      systemVersion: "3.619.0",
      createdTime: 1791100000000,
      modifiedTime: 1791100000000,
      lastModifiedBy: null,
      compendiumSource: null,
      duplicateSource: null
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "feats"), { valueEncoding: "json" });
  await db.open();
  try {
    for (const row of BLOCK38_FEATS) {
      await db.put(`!items!${row._id}`, featDocument(row));
      console.log(`  feats: ${row.name} (${row._id})`);
    }
  } finally {
    await db.close();
  }
}
