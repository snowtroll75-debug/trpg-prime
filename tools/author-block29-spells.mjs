#!/usr/bin/env node
/**
 * Author the pages 291-300 work settled in block 29.
 *
 * Graham's R1-R10 of 25 September 2026, "your recommendations", plus the
 * Regeneration rules he supplied for R9.
 *
 * IDEMPOTENT. Every edit REPLACES the field it owns, and a warp edit
 * never spreads the mods object it is replacing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE OF R6's FIVE LOST ITS RAIL ON INSPECTION, and it is recorded here
 * rather than half-built:
 *
 *   MARK OF FAITH gives the CASTER +1 to attacks against the marked
 *   creature and the MARKED CREATURE -1 to saves against the caster's
 *   spells. Both halves are uuid-scoped conditionals, and the `ward`
 *   kind fills uuids in exactly one direction — it gives the WARDED
 *   creature a bonus against named enemies. Mark Of Faith needs the
 *   mirror of that in one half and a conditional on a NON-target in the
 *   other, and the `conditional` kind does not fill uuids at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * R8 IS NOT HERE ON PURPOSE. Long Arm's +5 reach and Lighten Object's
 * -1 ACP are both ASSIGNED during derivation, so a bonus written to
 * either is overwritten. Graham agreed they should not be made additive
 * inside a spell block: both are one-line changes that touch every
 * character in the world and deserve their own harness and live test.
 */

import { ClassicLevel } from "classic-level";

const note = (text) => ({ kind: "note", text });
const say = (onSave, text) => ({ kind: "note", onSave, text });
const cond = (condition, onSave, extra = {}) =>
  ({ kind: "condition", target: "targets", condition, onSave, ...extra });

const EDITS = {

  /* ─── R1: Massacre ───────────────────────────────────────────────── */

  "Massacre": (y) => {
    /*
     * PP 18, AND IT DID NOTHING AT ALL.
     *
     * `defence: "Fortitude"` without the word "basic", so `isBasic` was
     * false and the 9d6 damage block never rolled; with no effect rows
     * there was nothing else to apply. The most expensive spell in the
     * block resolved to a saving throw and a card saying nothing
     * happened.
     *
     * AND IT IS NOT A BASIC SAVE. Basic is half / full / double; this is
     * the FULL printed pool on a SUCCESS and double on a failure. Read
     * as basic, a successful save would have taken about 4d6 where the
     * page gives nine.
     */
    y.effects = [
      {
        kind: "saveLadder", target: "targets", damageType: "essence",
        ladder: { critical: "", success: "9d6", failure: "18d6", fumble: "" },
        // THE FUMBLE IS FOUR WORDS: "The creature dies." See the
        // `slaysOn` comment in magic/save-ladder.mjs for why a rung with
        // no dice is not harmless when it kills.
        slaysOn: ["fumble"]
      },
      note("If this damage reduces a creature to 0 HP it is instantly killed — taken at the table, since the damage path routes a creature at 0 into dying."),
      note("BACKLASH: if Massacre kills nobody, the energy explodes back down the line — 6d6 essence to every living creature in it whatever their level, and 6d6 to YOU. Rolled by hand: nothing reads whether a spell killed anyone."),
      note("Only creatures of 17th level or lower are affected (+1 PP raises that by 1) — checked at the table, since no gate reads a target's level against a spell's ceiling.")
    ];
  },

  /* ─── R2: Nightmare ──────────────────────────────────────────────── */

  "Nightmare": (y) => {
    /*
     * THE SEVENTH FLAT UNGATED CONDITION ROW, after the six block 27
     * found. One `fatigued 1`, applied on every degree — including the
     * Critical the page calls "no adverse effects and temporarily immune
     * for 1 week".
     *
     * AND THE FAILURE RUNG NEEDED A MECHANISM. "Fatigued 1 PER POINT OF
     * FAILURE (max 5)" scales a condition's VALUE by the save margin,
     * where Holy Shout scales a DURATION. See `valueFromMargin` in
     * magic/condition-timing-rules.mjs — same margin, same floor, a
     * printed ceiling this one has to honour.
     */
    y.effects = [
      cond("fatigued", ["failure", "fumble"], { value: 1, valuePerMargin: 1, valueMax: 5 }),
      say(["critical"], "No adverse effects, and temporarily immune to Nightmare for 1 week — tracked by hand."),
      say(["success"], "The nightmares come but leave nothing behind but unpleasant memories."),
      say(["failure"], "Awakens fatigued 1 per point of failure, to a maximum of 5."),
      say(["fumble"], "As failure, and Soul Drain 20 until no longer fatigued — applied by hand, because it lifts on a condition rather than on a clock."),
      note("Only takes effect when the target sleeps. Known only by name: +4 circumstance to their save; stored with Study Target: −4.")
    ];
  },

  /* ─── R4: the second damage pool ─────────────────────────────────── */

  "Meteor Swarm": (y) => {
    // 6d10 bludgeoning in the inner radius and 14d6 FIRE in the outer,
    // on ONE save — "the saving throw applies to both". The pack had the
    // first pool only, so an 18 PP spell delivered about a third of what
    // it prints. See magic/secondary-damage.mjs.
    y.secondaryDamage = { formula: "14d6", type: "fire" };
    y.effects = [
      note("Four meteors, whose inner 10-foot bursts cannot overlap. A creature caught in more than one explosion takes the fire damage ONCE — placement and overlap are settled at the table; the card resolves one save and both pools."),
      note("The 6d10 bludgeoning is the inner burst; the 14d6 fire is the 40-foot eruption.")
    ];
  },

  "Sunburst": (y) => {
    // 8d10 fire to everyone, 8d4 essence to UNDEAD. Its `baseDamage` has
    // read "1d10/1d4" since it was entered — two base dice in one field,
    // read by nothing.
    y.secondaryDamage = { formula: "8d4", type: "essence", onlyCreatureTypes: ["undead"] };
  },

  "Umbral Blast": (y) => {
    y.secondaryDamage = { formula: "8d4", type: "essence" };
  },

  /* ─── R3: the printed ladders ────────────────────────────────────── */

  "Lullaby": (y) => {
    y.effects = [
      { kind: "bonus", target: "targets", slot: "perception", bonusType: "status",
        value: -2, onSave: ["failure"] },
      { kind: "bonus", target: "targets", slot: "perception", bonusType: "status",
        value: -5, onSave: ["fumble"] },
      say(["success"], "Unaffected."),
      say(["failure"], "−2 status to all Perception checks while the spell is sustained."),
      say(["fumble"], "As failure, but the penalty is −5.")
    ];
    y.warps = (y.warps ?? []).map((w) =>
      /no longer have to Sustain/i.test(String(w.text))
        ? { ...w, mods: { durationText: "1 minute" } } : w);
  },

  "Maze": (y) => {
    // FOUR DURATIONS AND NOTHING TO HANG THEM ON. There is no condition
    // for "imprisoned in a labyrinth between worlds", and inventing one
    // would need a clock, a sheet entry and a way back. The rungs are
    // printed so the card says which one happened.
    y.effects = [
      say(["critical"], "Trapped until the end of their next turn."),
      say(["success"], "Trapped for 1d4+1 rounds."),
      say(["failure"], "Trapped for 1 minute."),
      say(["fumble"], "Trapped for 10 minutes."),
      note("While trapped the target is hunted by an equal-level creature. If they defeat it they are freed at once and YOU are Stunned 2.")
    ];
  },

  "Memory Lapse": (y) => {
    y.effects = [
      say(["success"], "Unaffected."),
      say(["failure"], "Forgets everything from the casting back to the start of its last turn."),
      say(["fumble"], "As failure, and has no idea who you are for the next minute."),
      note("A forgotten exchange may allow a retry on a Diplomacy, Intimidate or opposed skill check — against this target only, not anyone else who was watching.")
    ];
  },

  "Mind Reading": (y) => {
    y.effects = [
      say(["critical"], "The TARGET reads vague surface thoughts from YOU."),
      say(["success"], "You learn whether their Intelligence modifier is higher, equal or lower than yours."),
      say(["failure"], "You perceive their vague surface thoughts, and learn how their Intelligence modifier compares to yours."),
      say(["fumble"], "As failure, and you may Sustain the Spell to read them again for the duration with no further save."),
      note("A target who succeeds is immune to further Mind Reading FROM YOU for 1 hour — tracked by hand.")
    ];
  },

  "Mana Drain": (y) => {
    y.effects = [
      say(["critical"], "Unaffected."),
      say(["success"], "You may spend their PP as your own until the end of your next turn."),
      say(["failure"], "You may spend their PP as your own for the duration. After their first drained turn they may spend a 3 AP concentrate action on a new save to break the link."),
      say(["fumble"], "As failure, and the link cannot be broken."),
      note("SPENDING ANOTHER CREATURE'S PP IS NOT AUTOMATED: no pool in this system may be drawn on by a second caster, and the link's range becoming 1 mile once established has no rail either. Tracked at the table.")
    ];
  },

  /* ─── R5: Mage Armour's DR ───────────────────────────────────────── */

  "Mage Armour": (y) => {
    /*
     * THE DR IS THE HALF THAT CHANGES A ROLL, and it goes through the
     * pool-only Bonus DR target proven live in block 28 (0 -> 8, and a
     * 20-point hit -> 12). `system.combat.armour.dr` is ASSIGNED from
     * the wearer's armour items during derivation, so a bonus written
     * there would be overwritten — the same finding as Iron Body's.
     *
     * ITS +4 PP WARP ALREADY CARRIED `bonusValue: 1` AND POINTED AT NO
     * ROW. That is the Divine Might shape recorded in
     * inert-warps-families.md: the key existed, the row it would raise
     * did not. It raises this one.
     */
    y.effects = [
      { kind: "bonus", target: "self", slot: "dr", bonusType: "status", value: 1 },
      note("THE DR SCALES WITH YOUR BSB, as armour DR scales with a non-caster's BDB: a BSB of 6 gives DR 2, and the +4 PP warp raises that total. The row grants the printed 1; add the BSB step by hand until the scaling is built."),
      note("The armour also has 20 HP and is destroyed at 0, after which the spell cannot be cast again for 1 hour. Tracked at the table: this is a durable object with its own hit points, which no spell effect models."),
      note("CASTER LEVEL: CL 4+ adds 20 armour HP; CL 6+ raises the DR multiplier by 1; CL 8+ grants CR 1; CL 10 makes the armour rigid for injury purposes.")
    ];
  },

  /* ─── R6: the rails that already exist ───────────────────────────── */

  "Nightvision": (y) => {
    // "You gain Nightvision" — and Nightvision is in the abilities pack,
    // exactly as Darkvision is. `grantAbility` was built at 3.587.0 for
    // that spell and has been used by two entries since.
    y.effects = [{ kind: "grantAbility", target: "self", ability: "Nightvision" }];
    y.warps = (y.warps ?? []).map((w) =>
      /range is touch and it targets 1 willing/i.test(String(w.text))
        ? { ...w, mods: { rangeOverride: "touch", retargetSelfRows: true } } : w);
  },

  "Natural Defence": (y) => {
    /*
     * "+1 RESISTANCE BONUS TO THE TRIGGERING SAVING THROW" is a held
     * bonus in as many words: granted now, spent on one later roll. The
     * mechanism has served twelve spells since 3.411.0 and this is the
     * first cantrip to use it.
     */
    y.effects = [
      { kind: "heldBonus", target: "self", label: "Natural Defence",
        value: 1, bonusType: "resistance", checkTypes: ["save"] },
      note("CASTER LEVEL: at CL 10 the bonus increases to +2 — raised by hand, since a held bonus carries no caster-level step.")
    ];
  },

  "Long Stride": (y) => {
    y.effects = [{ kind: "bonus", target: "self", slot: "speed", bonusType: "status", value: 10 }];
  },

  "Mind Blank": (y) => {
    y.effects = [
      {
        kind: "conditional", label: "Mind Blank", target: "targets",
        grants: [{
          kind: "modifier", value: 4, type: "status", label: "Mind Blank",
          scope: "saving throws against mental effects",
          when: { checkTypes: ["save"], traits: ["mental"] },
          auto: true
        }]
      },
      note("It also counters insight spells cast on the target as though they cost 4 PP more. A countered divination still functions but learns nothing about the target or their belongings — the counteract check is rolled at the table.")
    ];
  },

  "Mark Of Faith": (y) => {
    /*
     * R6 NAMED THIS AS A `ward` AND IT IS NOT ONE.
     *
     * A ward gives the WARDED creature a bonus against named enemies,
     * and fills their uuids at the cast. Mark Of Faith runs the other
     * way in one half and sideways in the other: the CASTER gets +1 to
     * attacks against the marked creature, and the MARKED CREATURE takes
     * -1 to saves against the CASTER's spells.
     *
     * Both halves are uuid-scoped conditionals — `sourceUuids` and
     * `targetUuids` are real axes in conditionals.mjs — but nothing
     * fills those uuids except the ward case, in its one direction. So
     * this is printed rather than half-built, and the correction is
     * recorded here rather than left as a silently dropped promise.
     */
    y.effects = [
      note("You gain +1 circumstance to attacks against the marked creature, and it takes −1 circumstance to saves against YOUR spells. Applied by hand: both halves are scoped to particular creatures, and nothing fills those in this direction."),
      note("The mark raises the illumination level by one step FOR YOU ONLY — which no light rule can express, since light is a property of the scene rather than of a viewer.")
    ];
  },

  /* ─── R7: Make Whole ─────────────────────────────────────────────── */

  "Make Whole": (y) => {
    y.warps = (y.warps ?? []).map((w) =>
      /increase the amount healed by 5/i.test(String(w.text))
        ? { ...w, mods: { healBonus: 5 } } : w);
  },

  /* ─── R9: Metabolism ─────────────────────────────────────────────── */

  "Metabolism": (y) => {
    /*
     * THE FIRST SPELL TO GRANT A HEALING RATE. Both rates have been read
     * by the turn clock and the injury clock for months; the only writer
     * of either, anywhere, is the Fast Healer feat.
     *
     * REGENERATION, NOT FAST HEALING. Identical for hit points and six
     * times apart on the Injured condition — every hour against every
     * ten minutes. See magic/healing-rate.mjs.
     */
    y.effects = [
      { kind: "healingRate", target: "self", rate: "regeneration", value: 5, label: "Metabolism" },
      { kind: "conditionRelief", target: "self", label: "Metabolism",
        condition: "injured", amount: 1, choices: ["dazed", "injured", "weakened"] },
      note("All bleeding RESULTS are reduced by 3 — applied by hand, since the bleed clock rolls its own damage and nothing reduces the figure it produces."),
      note("You can regrow lost limbs and organs, one minute each. No benefit at all against an effect that kills you instantly.")
    ];
  },

  /* ─── R10: Masterwork Item ───────────────────────────────────────── */

  "Masterwork Item": (y) => {
    y.effects = [
      { kind: "itemQuality", target: "targets", quality: "expert", label: "Masterwork Item" },
      note("Any item that can take a quality tier — weapons, armour, tools. The tier lasts for the spell and the item returns to what it was when it ends.")
    ];
    y.warps = (y.warps ?? []).map((w) => {
      if (/classed as master quality/i.test(String(w.text))) return { ...w, mods: { qualityTier: "master" } };
      if (/classed as legendary quality/i.test(String(w.text))) return { ...w, mods: { qualityTier: "legendary" } };
      return w;
    });
  },

  "Neutralise Poison": (y) => {
    y.effects = [
      note("Make a COUNTERACT CHECK against the poison affecting the target — rolled at the table, because which affliction is being countered is chosen there.")
    ];
  }
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
