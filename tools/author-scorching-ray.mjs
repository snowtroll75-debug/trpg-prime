#!/usr/bin/env node
/**
 * author-scorching-ray — R5 of block 31, wired at last by R13's ruling.
 *
 * Graham, 26 September 2026: "R5. Build." Then R13, 28 September: one Cast a
 * Spell check compared against each target's Defence Bonus separately.
 *
 * PRINTED (page 317), PP 4, ATTACK FIRE INVOCATION, Cast 1-3 AP, range 30 feet,
 * "Targets 1 or more creatures", Base Damage 1d6, and on a hit 2d6 fire:
 *
 *   "FOR EACH ADDITIONAL ACTION you use when Casting the Spell, you can fire an
 *   additional ray AT A DIFFERENT TARGET, to a maximum of three rays targeting
 *   three different targets for 3 actions. These attacks each increase your
 *   multiple attack penalty, but YOU DON'T INCREASE YOUR MULTIPLE ATTACK
 *   PENALTY UNTIL AFTER YOUR SPELL ATTACKS HAVE BEEN RESOLVED."
 *   +2 PP: the damage to each target increases by 1d6.
 *
 * WHAT WAS THERE: no `apOptions` at all, so the extra actions bought NOTHING,
 * while the penalty counter advanced immediately — one ray fired and three
 * actions' worth of penalty charged. See magic/ray-volley.mjs.
 *
 * THE `rays` FIELD ON EACH AP OPTION is what the volley reads. The damage row is
 * untouched by the mode: every ray deals the spell's 2d6, and the +2 PP warp
 * grows all of them, because it says "the damage to EACH target".
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();

let applied = 0;
try {
  for await (const [key, doc] of db.iterator()) {
    if (!key.startsWith("!items!") || doc?.type !== "spell") continue;
    if (String(doc.name).trim().toLowerCase() !== "scorching ray") continue;
    const sys = doc.system;
    /*
     * NO `effects` KEY ON THE MODES, AND THAT IS LOAD-BEARING.
     *
     * The cast workflow reads `apMode?.effects ?? spellData.effects`, and `[]`
     * is not nullish — so an AP option carrying an EMPTY effects array replaces
     * the spell's own rows with nothing, and the three notes below would vanish
     * from the card the moment anybody picked a mode. My first draft had
     * `effects: []` on all three and measured it across the pack: Scorching Ray
     * was the only spell in 692 with that shape, which is why nothing had
     * caught it. `verify-scorching-ray` V5 refuses it now.
     *
     * These modes differ ONLY in how many rays fly, so they inherit every row.
     */
    sys.apOptions = [
      { ap: 1, label: "1 AP — 1 ray (2d6 fire)", rays: 1, range: "30 feet", area: "" },
      { ap: 2, label: "2 AP — 2 rays at 2 different targets", rays: 2, range: "30 feet", area: "" },
      { ap: 3, label: "3 AP — 3 rays at 3 different targets", rays: 3, range: "30 feet", area: "" }
    ];
    sys.effects = [
      {
        kind: "note",
        text: "ONE RAY PER ACTION, EACH AT A DIFFERENT TARGET — mark every creature you mean to "
          + "hit before casting, then pick the AP mode. Two tokens of one creature count as one "
          + "target, so a three-ray volley needs three different creatures; if fewer are marked, "
          + "only that many rays fly and only that many attacks are counted."
      },
      {
        kind: "note",
        text: "ONE CAST A SPELL CHECK, COMPARED AGAINST EACH TARGET SEPARATELY. In this system the "
          + "Cast a Spell check IS the attack roll, so a volley rolls once and measures that total "
          + "against each creature's Defence Bonus — one ray can hit while another misses. Because "
          + "the multiple attack penalty does not move until every ray has resolved, three separate "
          + "rolls would share one penalty anyway; the only thing they would add is three chances at "
          + "the dice, which the page does not offer."
      },
      {
        kind: "note",
        text: "THE PENALTY CLIMBS AFTERWARDS, BY THE NUMBER OF RAYS. A three-ray volley leaves you "
          + "three attacks further up the ladder for anything else you do this turn — the half of "
          + "this rule that used to be charged before the rays flew rather than after."
      }
    ];
    await db.put(key, doc);
    applied += 1;
  }
} finally { await db.close(); }

process.stdout.write(applied
  ? "  Scorching Ray: 1-3 rays at distinct targets, one check, penalty deferred\n"
    + "author-scorching-ray: 1 of 1 applied.\n"
  : "author-scorching-ray: Scorching Ray not found.\n");
process.exit(applied === 1 ? 0 : 1);
