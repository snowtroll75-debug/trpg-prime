#!/usr/bin/env node
/**
 * Author the pages 248-250 spell effects settled in block 24.
 *
 * Graham's R12-R16, 22 September 2026. Idempotent: re-running it writes
 * the same rows, so it can be replayed against a fresh pack.
 */

import { ClassicLevel } from "classic-level";

const EDITS = {
  /*
   * R12 — Acid Cloud's four printed rungs (page 248). The -20 rides as a
   * MODIFIER on the injury roll rather than a weaker severity, because
   * that is exactly how the page distinguishes its Failure ("a -20
   * critical injury") from its Fumble ("critical injury").
   */
  "Acid Cloud": (y) => {
    y.effects = [
      {
        kind: "saveLadder",
        target: "targets",
        damageType: "acid",
        ladder: { critical: "", success: "1d6", failure: "2d6", fumble: "3d6" },
        criticalOn: { failure: "minor", fumble: "minor" },
        criticalModifier: { failure: -20 }
      },
      {
        kind: "note",
        text: "Creatures within the fog are concealed, and conceal those outside from within it. The cloud may be stationary or move 10 ft. away from you each round — chosen when the spell is cast."
      }
    ];
  },

  /*
   * R13 — Abjurers Strike. "The weapon treats all targets as unarmoured
   * and ignores all magical bonuses to DB."
   */
  "Abjurers Strike": (y) => {
    y.effects = [
      {
        kind: "defencePierce",
        target: "self",
        label: "Abjurers Strike",
        /*
         * TWO MECHANISMS, because the sentence is two rules. Armour in
         * this system is DAMAGE REDUCTION and touches Defence Bonus
         * nowhere — measured against a live character in Full Leather,
         * whose defence.item was 0. See defence-pierce.mjs.
         */
        unarmoured: true,
        slots: ["item"]
      },
      {
        kind: "note",
        text: "Cast on a missile weapon, the spell affects the ammunition fired from it."
      }
    ];
  },

  /*
   * R14 — Align Weapon. The aligned trait is CHOSEN from the caster's
   * deity rather than fixed, so the row names the choice instead of
   * guessing a trait the character may not have.
   */
  "Align Weapon": (y) => {
    y.effects = [
      {
        kind: "trait",
        target: "targets",
        label: "Align Weapon",
        /*
         * `picks: 1`, NOT `choose: "aligned"`.
         *
         * The first draft used `choose`, a key nothing reads.
         * `traitPickCount` counts `picks` and `grantedTraitsFor` unions
         * the typed answer in — so the row would have prompted for
         * nothing, granted nothing, and still printed a cast card. The
         * trait is the CASTER'S deity's, which no data in this system
         * knows, so it is a pick rather than a fixed `traits` list.
         */
        picks: 1,
        /*
         * A SHORT BRACKETED SCOPE, because that is what this field is.
         * `effectName` APPENDS `note` to the effect's name, so a
         * sentence here reads as a run-on on the sheet —
         * `verify-spell-narration` E2 caught exactly that. The prose
         * belongs in a note row of its own, below.
         */
        note: "(for overcoming resistances)"
      },
      {
        kind: "note",
        text: "The weapon or 50 projectiles gain one of your deity's aligned traits; attacks with them count as that type for overcoming resistances. Cannot be cast on a natural weapon."
      }
    ];
  },

  /*
   * R15 — Animal Growth. One size category, two with the +4 PP warp,
   * maximum Huge, and no effect on a Huge or larger animal.
   */
  "Animal Growth": (y) => {
    y.effects = [
      {
        kind: "note",
        text: "The animal grows by one size category. Its equipment grows with it and returns to natural size if removed. No effect on a Huge or larger animal."
      }
    ];
    /*
     * NO `sizeSteps` WARP MOD, AND THE STALE ONE IS CLEARED.
     *
     * The first draft invented one. `sizeSteps` is a DISTANCE helper in
     * combat/space.mjs that no warp reader has ever looked at, so the
     * warp would have been inert while looking authored.
     *
     * DROPPING IT FROM THIS SCRIPT WAS NOT ENOUGH. The first run had
     * already written it into the pack, and a script that stops writing
     * a field does not unwrite it — `verify-warp-area` E5 and
     * `verify-emanation` E2b both went red on the leftover, and two
     * more runners failed downstream of them. An authoring script has
     * to be idempotent in both directions.
     */
    y.warps = (y.warps ?? []).map((w) => {
      if (!w?.mods || !("sizeSteps" in w.mods)) return w;
      const { sizeSteps, ...rest } = w.mods;
      return { ...w, mods: rest };
    });
  },

  /*
   * R16 — Acid Arrow's Sustain buys another arrow, not more time.
   * "At the beginning of each turn, you may Sustain the Spell to make an
   * Attack action using your Spellcraft skill to launch an additional
   * arrow of acid at one target within range."
   *
   * The Luminance shape: a Sustain whose purchase is something other
   * than duration. `sustainChoices` is what the sustain workflow already
   * reads to offer one.
   */
  "Acid Arrow": (y) => {
    /*
     * IT STAYS A "duration" SUSTAIN. An earlier draft set
     * `sustainType: "attack"`, and `sustainedLapses` returns false for
     * anything that is not "duration" — so Acid Arrow would have become
     * a spell that could NEVER lapse, running until the world ended.
     * MEASURED across the pack afterwards: 51 spells are "duration", 20
     * are "round", and "attack" was a value of one that I had just
     * invented. What the Sustain BUYS is `sustainChoices`; what makes it
     * lapse is the type, and those are different questions.
     */
    y.sustainType = "duration";
    // AND NO BARE `emanation`. The same draft left one behind carrying
    // only these choices, which `growthRefusal` and `growEmanation` would
    // have read as a live emanation with no radius and no growth.
    delete y.emanation;
    // ON THE SPELL, NOT UNDER `emanation`. cast-workflow reads
    // `spellData.sustainChoices` and COPIES it onto the registry entry's
    // emanation descriptor; authoring it under `emanation` here would
    // have put it where only the copy lives and the source is read.
    y.sustainChoices = [
      {
        key: "arrow",
        label: "Launch another arrow of acid (Attack action, Spellcraft)",
        note: "launches another arrow of acid at one target within range"
      }
    ];
  }
};

const db = new ClassicLevel("packs/spells", { valueEncoding: "json" });
await db.open();
const done = [];
for await (const [key, value] of db.iterator()) {
  const edit = EDITS[value?.name];
  if (!edit) continue;
  edit(value.system);
  await db.put(key, value);
  done.push(value.name);
}
await db.close();
console.log(`authored ${done.length}: ${done.join(", ")}`);
const missing = Object.keys(EDITS).filter((n) => !done.includes(n));
if (missing.length) {
  console.error(`MISSING from the pack: ${missing.join(", ")}`);
  process.exit(1);
}
