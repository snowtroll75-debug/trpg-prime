#!/usr/bin/env node
/**
 * Author the pages 281-290 work settled in block 28.
 *
 * Graham's R1-R7 of 25 September 2026, all seven "your recommendation".
 * The twelve pack-wide clock fixes are in author-block28-clocks.mjs; this
 * is the block's own work.
 *
 * IDEMPOTENT. Every edit REPLACES the field it owns, and no warp edit
 * spreads the mods object it is replacing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY LEFT AS A NOTE, each measured rather than assumed:
 *
 *   INVULNERABILITY (R5) — "immune to any effect or damage that would
 *     cause you harm, EXCEPT effects stemming from artifacts, deific
 *     power, or other immensely potent sources." The exception is the
 *     whole rule and it is a judgement; there is no rail for it and
 *     there should not be.
 *   GASEOUS FORM and IRON BODY's SUBTRACTIVE HALVES (R3) — "loses any
 *     item bonus to DB and all other effects from armour", "can't cast
 *     spells", "-8 ACP". Nothing in the effect vocabulary REMOVES a
 *     bonus a creature already has, and ACP measured unreachable in
 *     block 27 (prepareArmourCheckPenalty ASSIGNS it). The additive
 *     halves are built.
 *   HOLY SHOUT's UNCONSCIOUS rung — "1 round per 4 failure" is built,
 *     but unconscious is not a condition this system's clock can bound
 *     in the same breath as the stun; see its rows.
 *   HEAL's SOUL DRAIN HALF (R7) — the warp reads "+1 PP: heal an
 *     additional 10 HP OR 5 soul drain", a choice between two
 *     currencies, and no warp mod expresses a choice. The HP half is
 *     wired; one spell does not justify a choosing warp.
 */

import { ClassicLevel } from "classic-level";

const note = (text) => ({ kind: "note", text });
const say = (onSave, text) => ({ kind: "note", onSave, text });
const cond = (condition, onSave, extra = {}) =>
  ({ kind: "condition", target: "targets", condition, onSave, ...extra });

const EDITS = {

  /* ─── R1: the ladders ────────────────────────────────────────────── */

  "Forget": (y) => {
    // A MEMORY SUPPRESSION IS NOT A CONDITION. Three lengths, nothing
    // the sheet holds — so the rungs are printed and the length is the
    // only thing automation could add, which it cannot without a
    // condition to hang it on.
    y.effects = [
      say(["success"], "The memories are suppressed for 1 week."),
      say(["failure"], "The memories are suppressed for 1 month."),
      say(["fumble"], "The memories are suppressed for 1 year."),
      note("Tracked by hand: the system has no condition for a suppressed memory, so there is nothing to put a clock on.")
    ];
  },

  "Jolts": (y) => {
    // HALF / FULL / FULL-PLUS-A-RIDER is the basic-save pattern, and the
    // header omits the word. Third spell of this shape after Flaming
    // Sphere and Surge Of The Tempest, and the fourth after Divine
    // Decree last block — `parseSpellDefence` reads /basic/ out of this
    // string to decide whether damage scales, so as printed a SUCCESSFUL
    // save took the full 2d6.
    y.defence = "Basic Will";
    y.effects = [
      cond("stunned", ["fumble"], { value: 1 }),
      say(["success"], "Half damage."),
      say(["fumble"], "Full damage and stunned 1.")
    ];
  },

  "Haze Of Dreams": (y) => {
    y.effects = [
      { kind: "bonus", target: "targets", slot: "allSpeeds", bonusType: "circumstance",
        value: -15, onSave: ["failure", "fumble"] },
      cond("slowed", ["fumble"], { value: 1 }),
      say(["failure"], "Moves at half speed for the duration."),
      say(["fumble"], "As failure, and also slowed 1."),
      note("\"Half its normal speed\" is applied as a -15-foot circumstance penalty, which is half of the commonest Speed in the game. A creature whose Speed is not 30 should have the penalty adjusted by hand — nothing in the bonus vocabulary halves a number.")
    ];
  },

  "Hand Of The Reaper": (y) => {
    y.effects = [
      {
        kind: "saveLadder", target: "targets", damageType: "essence",
        ladder: { critical: "", success: "4d10", partial: "6d10", failure: "8d10", fumble: "12d10" },
        criticalOn: { failure: "serious", fumble: "deadly" }
      },
      note("If this damage reduces the target to 0 HP, the target DIES INSTANTLY \u2014 no dying state, no death saves. Taken at the table: the damage path routes a creature at 0 into dying, and nothing in it accepts \"and this one does not get up\". (The page calls the spell \"finger of death\" in this sentence; it means this spell.)")
    ];
  },

  "Incendiary Cloud": (y) => {
    /*
     * THE SAVE IS NOT ROLLED AT THE CAST. "Each creature that STARTS ITS
     * TURN in the spell's area must make a saving throw" \u2014 so the
     * ladder is the RECURRING one and there is no top-level `ladder`,
     * which is what keeps `normaliseSaveLadder` from resolving a cast-
     * time ladder that the page does not print. A creature standing in
     * the cloud when it appears has not started a turn there yet; it
     * burns when its turn comes round.
     *
     * "startOfTurn" HAD NEVER FIRED. The moment was in the vocabulary
     * since 3.587.0 and only `_onEndTurn` ever called the sweep \u2014 see
     * documents/combat.mjs, where the driver is now beside the nexus.
     * Authoring this spell is what found it.
     *
     * EVERY RUNG BURNS, including the Critical: this spell prints no
     * harmless outcome, so there is no empty rung.
     */
    y.effects = [
      {
        kind: "saveLadder", target: "targets",
        recurring: {
          save: "fortitude", on: "startOfTurn", damageType: "fire",
          ladder: { critical: "2d6", success: "4d6", partial: "4d6", failure: "6d6", fumble: "8d6" },
          criticalOn: { partial: "minor", failure: "serious", fumble: "deadly" }
        }
      },
      note("All creatures inside the cloud are concealed, and creatures outside it are concealed to those within \u2014 applied by hand."),
      note("The cloud is stationary or moves 10 feet away from you each round, chosen when the spell is cast; the Region is dragged by hand.")
    ];
  },

  "Holy Shout": (y) => {
    y.effects = [
      cond("stunned", ["success"], { value: 1 }),
      cond("stunned", ["partial"], { value: 2 }),
      /*
       * "STUNNED 1 ROUND PER 2 FAILURE" — a duration computed from how
       * badly the save was missed. The only spell in the Grimoire that
       * does it; see magic/condition-timing-rules.mjs.
       */
      cond("stunned", ["failure"], { value: 1, roundsPerMargin: 2 }),
      cond("unconscious", ["fumble"], { roundsPerMargin: 4 }),
      say(["failure"], "Stunned, 1 round per 2 points of failure."),
      say(["fumble"], "Unconscious, 1 round per 4 points of failure."),
      note("Only affects your enemies.")
    ];
  },

  "Gust": (y) => {
    y.effects = [
      /*
       * NO `difficultTerrain` ROW, AND THAT IS MEASURED. A terrain row is
       * written onto the REGION in cast-workflow, which never sees a save
       * degree \u2014 so an `onSave: ["partial"]` on it would make the whole
       * blast difficult ground for EVERYONE, including the creatures who
       * critically succeeded, and say nothing about it. The rung is also
       * DIRECTIONAL ("moving against the wind"), which a region cannot
       * express at all. Printed instead.
       */
      cond("prone", ["failure", "fumble"]),
      say(["success"], "Cannot move against the wind."),
      say(["partial"], "Moving against the wind counts as difficult terrain."),
      say(["failure"], "Knocked prone. A FLYING creature suffers the fumble result instead."),
      say(["fumble"], "Pushed 30 feet downwind, knocked prone, and takes 2d6 bludgeoning."),
      note("The push and the flyer's worse result are applied by hand: nothing reads whether a target is airborne at the moment a rung is chosen.")
    ];
  },

  /* ─── R3: the additive halves of the two transformations ─────────── */

  "Gaseous Form": (y) => {
    y.effects = [
      { kind: "defence", target: "targets", field: "resistance", value: "physical" },
      /*
       * "BLEED" IS A CONDITION HERE, NOT A DAMAGE TYPE, and the row is
       * right anyway. Measured live: `resolveAgainstDefences` does not
       * know the word at all \u2014 20 bleed damage against an actor immune
       * to "bleed" still lands 20 \u2014 but `isImmuneToCondition("bleeding")`
       * answers true for BOTH spellings, and bleeding is applied as a
       * condition from some forty-five places, all of which ask that.
       * Recorded because the damage-layer probe looks like a defect and
       * is not: do not "fix" this row.
       */
      { kind: "defence", target: "targets", field: "immunity", value: "bleed, precision" },
      { kind: "speedGrant", target: "targets", key: "fly", feet: 10 },
      note("Also amorphous, and it LOSES any item bonus to DB and every other effect from armour, and cannot cast spells, activate items, or use actions with the attack or manipulate trait. Those are applied by hand: nothing in the effect vocabulary removes a bonus a creature already has.")
    ];
  },

  "Iron Body": (y) => {
    y.effects = [
      /*
       * DR IS A BONUS SLOT, NOT A DEFENCE FIELD. Authored here first as
       * `{kind:"defence", field:"dr"}` — and `DEFENCE_FIELDS` holds
       * exactly three, immunity/resistance/weakness, so the row resolved
       * to null and the applier said NOTHING AT ALL. `system.combat.dr`
       * is a real pool-only bonus target (TARGET_SLOTS.dr is `{}`,
       * reached only by a CUSTOM-mode change), which is what a bonus row
       * writes. The silent nothing that hid it is fixed in the applier.
       */
      { kind: "bonus", target: "self", slot: "dr", bonusType: "status", value: 8 },
      { kind: "defence", target: "self", field: "resistance", value: "physical (adamantine)" },
      { kind: "bonus", target: "self", slot: "strength", bonusType: "racial", value: 3 },
      { kind: "bonus", target: "self", slot: "dexterity", bonusType: "racial", value: -3 },
      note("Also grants the construct type and a Slam attack, halves your movement (rounding up), applies a -8 ACP as if armoured, and multiplies your weight by 10. Applied by hand: the ACP total is ASSIGNED during derivation, so a bonus written to it is overwritten, and nothing halves a speed."),
      note("The book says your Base DR CHANGES TO 8; the DR pool only ever adds, so a creature that already has DR will come out higher than 8 and should have this adjusted by hand. For anyone starting at 0 \u2014 which is almost everyone \u2014 the two readings agree.")
    ];
  },

  /* ─── R4: the eight with a rail ──────────────────────────────────── */

  "Ice Slick": (y) => {
    /*
     * THE PAGE PRINTS NO DURATION, AND THE REGION NEEDS ONE.
     *
     * "Slick ice coats the area, causing it to become difficult terrain"
     * is the whole entry, with no Duration line \u2014 and a difficult-
     * terrain row is written onto a REGION, which without a clock is
     * created and never removed. A permanent patch of ice on the map,
     * which is precisely the failure this release is about.
     *
     * Caught by `verify-region-expiry` C2 ("every claimant prints a
     * duration this can count") the moment Ice Slick became the eleventh
     * claimant. Not by reading the page; by placing the thing.
     *
     * GRAHAM RULED 1 MINUTE, 25 September 2026, on the comparison:
     * Warped Terrain, False Mire and Entangle all print 1 minute and are
     * the ordinary low-tier terrain spells; Verdant Snare's 1 round is
     * the outlier and Spike Stones' 1 hour is PP-heavier. Declared in
     * verify-spell-book-fields, because the reference records what the
     * book SAYS and the book says nothing here.
     */
    y.duration = "1 minute";
    y.effects = [
      { kind: "difficultTerrain", label: "Ice Slick", target: "area" },
      note("The page prints no duration; 1 minute is Graham's ruling of 25 September 2026, matching Warped Terrain, False Mire and Entangle.")
    ];
  },

  "Hypercognition": (y) => {
    y.effects = [
      { kind: "bonus", target: "self", slot: "senseMotive", bonusType: "status", value: 5 },
      { kind: "bonus", target: "self", slot: "perception", bonusType: "status", value: 5 },
      note("Once per round you may make a Detect Deception, Pierce Disguise, Recall Knowledge or Search check as a FREE action with no penalty, and all such checks gain the +5. You may dismiss the spell to gain advantage on one of them, which still gains the bonus. The four named checks run off Sense Motive and Perception, which carry the bonus; a Recall Knowledge on another skill wants it added by hand.")
    ];
  },

  "Indomitable": (y) => {
    /*
     * THE BASE IS A TRIGGER, NOT A SUPPRESSION, and the difference is the
     * whole spell. Authored here first as a `suppress` row with the Delay
     * Pain choice shape \u2014 which IGNORES points of a chosen condition
     * continuously for the duration. Indomitable waits for dazed or
     * weakened to ARRIVE, reduces it by 2, and then the spell ENDS. A
     * suppression would have given a standing "ignore 2 dazed AND 2
     * weakened for ten minutes", never consumed and applying to both at
     * once: strictly better than printed, in a spell that is supposed to
     * be spent.
     *
     * `verify-condition-suppression`'s section X2 had already pinned that
     * this spell keeps its base in a note ON PURPOSE, with the reason:
     * "warping an unbuilt base is the trap this project has walked into
     * twice". Its two warps therefore stay inert, as they were.
     *
     * The mechanism it wants \u2014 watch for a condition, reduce it once,
     * end \u2014 exists nowhere: `ward` is a scoped bonus against named
     * enemies, and `suppress` is standing. Left for a ruling.
     *
     * THE WARPS ARE RESET EXPLICITLY, not merely left alone. An earlier
     * run of this script wrote `suppressBump`/`suppressMax` onto them,
     * and deleting the edit does not delete what it already wrote \u2014
     * "idempotent" only covers the fields the script still owns. Caught
     * by `verify-condition-suppression` B3, which reported a capped bump
     * sitting on a spell with no suppression row at all.
     */
    y.warps = (y.warps ?? []).map((w) =>
      /instead ignore the injured|increase the amount condition ignored/i.test(String(w.text))
        ? { ...w, mods: {} } : w);
    y.effects = [
      note("The first time you gain dazed or weakened while active, reduce it by 2 (warpable), then the spell ends (or ignore injured with the warp).")
    ];
  },

  "Inner Sanctum": (y) => {
    y.effects = [
      {
        kind: "conditional", label: "Inner Sanctum", target: "allies",
        grants: [{
          kind: "modifier", value: 2, type: "status", label: "Inner Sanctum",
          scope: "saving throws against possession, fear and translocation spells",
          when: { checkTypes: ["save"], traits: ["possession", "fear", "translocation"] },
          auto: true
        }]
      },
      /*
       * `radiusFeet` IS REQUIRED. Authored here first without one, and
       * `normaliseLightShift` refuses a radius of zero \u2014 the card would
       * have read "declares a malformed light shift". `follows: false`
       * because a sanctum is a placed area, not a glow that trails the
       * caster; `target: "self"` because that is where the template is
       * centred, and "area" is not a recipient the applier knows (it
       * falls through to the targets list, which an area spell with no
       * save does not have).
       */
      { kind: "lightShift", target: "self", label: "Inner Sanctum",
        steps: 1, radiusFeet: 20, follows: false },
      note("A translocation spell cast within the area must make a counteract check against your Spell DC or fail — rolled by hand.")
    ];
  },

  "Keen Edge": (y) => {
    y.effects = [
      /*
       * `weaponTrait`, NOT `trait`. The latter is the polymorph channel
       * and writes onto the CREATURE, where nothing reads Keen; all three
       * of Keen's readers ask the WEAPON. See magic/weapon-trait.mjs,
       * built for this spell.
       */
      { kind: "weaponTrait", target: "targets", label: "Keen Edge", traits: ["keen"], weapons: 1 },
      note("Piercing or slashing weapons only, and not one that is already Keen \u2014 the prompt offers the target's EQUIPPED weapons and excludes natural attacks, so the last of those three is the caster's to get right."),
      note("The 50-PROJECTILES HALF IS BY HAND. Measured live: arrows and bolts are `ammunition` items, and the weapon prompt offers `weapon` items only, so a quiver can never be chosen. The per-projectile spending (\"the edge on a particular projectile ends after one use, whether or not the missile strikes\") is counted at the table in either case.")
    ];
  },

  "Freedom": (y) => {
    /*
     * NO BONUS ROW, BECAUSE THE SPELL PRINTS NO NUMBER. Authored here
     * first as a +4 status conditional on Escape attempts \u2014 a figure
     * that appears nowhere on the page. The spell grants an AUTOMATIC
     * SUCCESS against non-magical restraint and COUNTERS magical
     * impairment; a +4 is neither, and a fabricated modifier that reads
     * as printed is worse than an honest note, because nobody checks a
     * number the system already seems to know.
     */
    y.effects = [
      note("Counters any magical effect that would impair your speed or move you."),
      note("Escaping a NON-MAGICAL immobilise, grab or restrain AUTOMATICALLY SUCCEEDS \u2014 take it rather than rolling. Nothing in the check engine grants an automatic success, so it is taken at the table.")
    ];
  },

  "Grace": (y) => {
    y.effects = [
      note("You immediately take a MOVE ACTION as part of casting, and until the end of your turn your movement does not provoke reactions. Both are taken at the table: the cast cannot spend a move action for you, and reaction-provoking is decided per move.")
    ];
  },

  "Goodberry": (y) => {
    /*
     * `conjureItem` COPIES A COMPENDIUM ENTRY — it does not describe
     * one. Authored here first with `name` and `description`, which
     * `normaliseConjuredItem` does not read: the row was malformed, so
     * the spell would have printed "declares a malformed conjured item"
     * and made nothing at all. There was also no Goodberry in any
     * conjurable pack; the berry is authored by
     * tools/author-goodberry-item.mjs and carries its own 1-point
     * healing on the consumable rail the Potions of Cure use.
     */
    y.effects = [
      { kind: "conjureItem", label: "Goodberry", target: "self",
        pack: "consumables", itemName: "Goodberry", quantity: 5 },
      note("Five of a freshly picked handful become magical, and you can tell which. Each berry cures 1 point when eaten, from its own Use button."),
      note("The 8-POINT DAILY CAP is counted by hand: it spans casts, eaters and handfuls, and no per-item rail can see across all three."),
      note("Combined with the Medicine skill to treat disease or poison, the berries give a +2 circumstance bonus — added by hand, since it belongs to whoever is treating rather than to the berries.")
    ];
  },

  /* ─── R5: unbuildable as printed ─────────────────────────────────── */

  "Invulnerability": (y) => {
    y.effects = [
      note("You become immune to any effect or damage that would harm you, EXCEPT from artifacts, deific power or other immensely potent sources — and you remain susceptible to anything you willingly allow. Judged at the table: the exception is the whole rule, and there is no rail for \"immune to everything except what the GM considers potent\".")
    ];
  },

  /* ─── R7: Heal's HP half ─────────────────────────────────────────── */

  "Heal": (y) => {
    /*
     * R7's ANSWER IS "NO", AND IT WAS ALREADY WRITTEN DOWN.
     *
     * I wired `healBonus: 10` here — and `verify-warped-healing` X1 has
     * pinned this exact warp as deliberately inert since 3.531.0, with
     * the reasoning I did not read first:
     *
     *   "heal an additional 10 HP OR 5 soul drain" is the same either/or
     *   shape as the bleed alternative Graham ruled on 7 September ("each
     *   target gets whichever applies"), but SOUL DRAIN HAS NO RELIEF
     *   PATH IN THE HEAL CASE AT ALL. A healBonus alone would SELL the
     *   soul-drain half and deliver the HP half, which is worse than the
     *   warp doing nothing.
     *
     * That is right, and it is the second decision this block overturned
     * without reading it — Indomitable's was the first. Reverted, and
     * the warp is reset explicitly rather than merely left alone, because
     * deleting an edit does not delete what it already wrote.
     */
    y.warps = (y.warps ?? []).map((w) =>
      /heal an additional 10 HP/i.test(String(w.text)) ? { ...w, mods: {} } : w);
  },

  /* ─── R6: the warps that had a key waiting ───────────────────────── */

  /*
   * GRANT SPELL and LAY OF THE LAND were on R6's list and are NOT edited
   * here. Both warps were already `mods: {}`, which is this pack's
   * spelling for "inert, deliberately" (see verify-condition-suppression
   * X1), so writing `mods: {}` over `mods: {}` would have been an edit
   * that claimed to wire something and changed nothing. "Increase the PP
   * of the granted spell by 1" needs a spell chosen by hand at the table;
   * "increase the radius by 5 miles" needs a radius the spell never
   * placed. Both are recorded in inert-warps-families.md instead.
   */
};

const db = new ClassicLevel("packs/spells", { valueEncoding: "json" });
await db.open();
const done = [];
for await (const [key, value] of db.iterator()) {
  if (!Object.prototype.hasOwnProperty.call(EDITS, value?.name)) continue;
  EDITS[value.name](value.system);
  await db.put(key, value);
  done.push(value.name);
}
await db.close();
console.log(`authored ${done.length}: ${done.sort().join(", ")}`);
const missing = Object.keys(EDITS).filter((n) => !done.includes(n));
if (missing.length) { console.error(`MISSING from the pack: ${missing.join(", ")}`); process.exit(1); }
