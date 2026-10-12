#!/usr/bin/env node
/**
 * author-shape-stone — the last of block 31 (3.605.0).
 *
 * SHAPE STONE (PP 8, page 316) shipped `effects: []`.
 *
 *   "Creatures standing on the stone during its transformation must each
 *    make an Acrobatics check to maintain their balance.
 *      Success  The creature is unaffected.
 *      Failure  The creature falls prone atop the stone.
 *      Fumble   The creature falls off the stone (if applicable) and
 *               lands prone."
 *
 * THE SPELL ALSO NEEDS A SAVE DC TO ROLL AGAINST, and it had none: the
 * `defence` field was empty, because the check is not a saving throw. The
 * DC a Cast a Spell check produces is the spell's DC whatever kind of roll
 * it is being rolled against, so the ladder reads it from the cast rather
 * than from a `defence` string — see magic/skill-ladder-workflow.mjs. No
 * field on the item changes.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");

const PLAN = {
  "Shape Stone": (sy) => {
    sy.effects = [
      {
        kind: "skillLadder",
        label: "Shape Stone",
        skills: ["acrobatics"],
        degrees: {
          success: { text: "is unaffected" },
          failure: {
            text: "falls <strong>prone</strong> atop the stone",
            conditions: [{ key: "prone" }]
          },
          fumble: {
            text: "falls off the stone (if there is anywhere to fall) and lands <strong>prone</strong>",
            conditions: [{ key: "prone" }]
          }
        }
      },
      { kind: "note", text: "THE GM SAYS WHO WAS STANDING ON IT. The spell is Range touch "
        + "targeting a cube of stone up to 10 feet across — there is no template and no area, "
        + "and a token's square cannot tell standing ON the stone from standing BESIDE it. So "
        + "the picker lists the tokens nearest the caster, nearest first, with nobody ticked, "
        + "and the GM names whoever is up there. Every token is offered rather than only those "
        + "within some invented radius: a GM can ignore a name but cannot tick one that was "
        + "never on the list." },
      { kind: "note", text: "THREE RUNGS OF SEVEN ARE PRINTED, and the rest are read the way "
        + "every gated spell in the Grimoire is read. Heroic and Critical are better than the "
        + "Success rung, and Success is \"unaffected\" — so nothing happens, by the ordinary "
        + "route rather than a special case. A Partial falls to Failure and a Blunder to "
        + "Fumble, because letting the worst roll in the game fall off the bottom of a ladder "
        + "would make it safer than the second worst. The card names both the degree rolled "
        + "and the rung it was read at." },
      { kind: "note", text: "\"IF APPLICABLE\" IS THE TABLE'S. The spell cannot know whether "
        + "there is anywhere to fall off to — a boulder in a field and a floor being reshaped "
        + "are the same ten-foot cube to this system — so a Fumble applies prone and says the "
        + "rest out loud for the GM to settle." }
    ];
  }
};

const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
await db.open();
let applied = 0;
try {
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith("!items!") || value?.type !== "spell") continue;
    const plan = PLAN[String(value.name).trim()];
    if (!plan) continue;
    const next = JSON.parse(JSON.stringify(value));
    plan(next.system);
    await db.put(key, next);
    applied++;
    console.log(`  ${value.name}: ${next.system.effects.length} row(s)`);
  }
} finally {
  await db.close();
}
console.log(`author-shape-stone: ${applied} of ${Object.keys(PLAN).length} applied.`);
process.exit(applied === Object.keys(PLAN).length ? 0 : 1);
