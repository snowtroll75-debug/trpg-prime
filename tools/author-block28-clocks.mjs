#!/usr/bin/env node
/**
 * The twelve conditions that never ended — pack-wide.
 *
 * Graham's ruling of 25 September 2026: fix them all, and keep the
 * census as a standing check.
 *
 * IDEMPOTENT. Every edit REPLACES the field it owns.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN SCRIPT AND NOT PART OF BLOCK 28'S.
 *
 * Eight of the twelve are on pages this audit has never reached. They
 * were found by sweeping the pack after the SAME SHAPE turned up in
 * three consecutive blocks — six spells in block 27, six more in block
 * 28 — at which point it stopped being a block's problem and became a
 * census.
 *
 * The census excluded conditions that end by themselves before counting:
 * `stunned` is spent as AP and reduced at the start of its owner's turn,
 * `frightened` and `sickened` are shed by Recover and Retch, `prone` by
 * standing, `flatFooted` at the turn's start, `bleeding` and `recurring`
 * by their own flat check, `fatigued` by resting. What is left below has
 * NO clock, NO self-reduction and NO shedding action.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE OF THE SIXTEEN ARE CORRECT AND ARE LEFT ALONE.
 *
 * Blindness's fumble ("blinded permanently"), Deafness's fumble and
 * Warp Mind's, Word Of Blinding's and Word Of Deafening's fumbles all
 * PRINT the word permanent. Block 25 made permanence something a spell
 * can say rather than something inferred from a failure to parse, and
 * these say it. Their other rungs did not, which is what is fixed here.
 */

import { ClassicLevel } from "classic-level";

const cond = (condition, onSave, extra = {}) =>
  ({ kind: "condition", target: "targets", condition, onSave, ...extra });
const say = (onSave, text) => ({ kind: "note", onSave, text });
const note = (text) => ({ kind: "note", text });

const EDITS = {

  /* ─── On pages 281-290 ───────────────────────────────────────────── */

  "Hold Animal": (y) => {
    y.effects = [
      cond("stunned", ["success"], { value: 1 }),
      cond("paralyzed", ["failure"], { duration: "1 round" }),
      cond("paralyzed", ["fumble"], {
        duration: "4 rounds",
        // "A NEW WILL SAVE AT THE END OF EACH OF ITS TURNS to reduce the
        // remaining duration by 1 round, or end it entirely on a
        // critical success." See magic/condition-save.mjs.
        conditionSave: { save: "will", onSuccess: "shorten", amount: 1, label: "Hold Animal" }
      }),
      say(["success"], "Stunned 1."),
      say(["failure"], "Paralyzed for 1 round."),
      say(["fumble"], "Paralyzed for 4 rounds, with a new Will save at the end of each of its turns to shorten it by 1 round — or end it on a critical success.")
    ];
    /*
     * "+4 PP: you can target a creature of the beast type" STAYS INERT,
     * and the reason is the mistake I made reaching for it.
     *
     * I wired `mods: { targetTypes: ["beast"] }` because `targetTypes`
     * greps as PRESENT — it has existed since 3.567.0. It is a scoping
     * axis in `conditionals.mjs`, for deciding whether a conditional
     * bonus applies against the creature in front of you.
     * `aggregateWarpSelection` has never heard of it, so the option was
     * offered, charged four PP for, and silently dropped.
     *
     * Caught by `verify-emanation` E2b, which is the check that exists
     * because I did the identical thing with `casterGains` last week: a
     * name that exists SOMEWHERE is the most convincing kind of wrong
     * name, because it survives every search.
     *
     * The real channel would widen `kindGate`, and there is none: the
     * gate is read straight off `spellData.kindGate` in kind-gate.mjs,
     * and the only thing that widens it today is the Alignment Channel
     * FEAT. Recorded in inert-warps-families.md rather than invented.
     */
    y.warps = (y.warps ?? []).map((w) =>
      /creature of the beast type/i.test(String(w.text)) ? { ...w, mods: {} } : w);
  },

  "Hold Kind": (y) => {
    y.effects = [
      cond("stunned", ["success"], { value: 1 }),
      cond("paralyzed", ["failure"], { duration: "1 round" }),
      cond("paralyzed", ["fumble"], {
        duration: "4 rounds",
        conditionSave: { save: "will", onSuccess: "shorten", amount: 1, label: "Hold Kind" }
      }),
      say(["success"], "Stunned 1."),
      say(["failure"], "Paralyzed for 1 round."),
      say(["fumble"], "Paralyzed for 4 rounds, with a new Will save at the end of each of its turns to shorten it by 1 round — or end it on a critical success.")
    ];
    // THE SAME INERT WARP, for the same reason — see Hold Animal above.
    y.warps = (y.warps ?? []).map((w) =>
      /different race type/i.test(String(w.text)) ? { ...w, mods: {} } : w);
  },

  "Ghoul Touch": (y) => {
    y.effects = [
      cond("stunned", ["success"], { value: 1 }),
      cond("slowed", ["failure"], { value: 1, duration: "1 minute" }),
      cond("paralyzed", ["fumble"], { duration: "1 minute" }),
      say(["success"], "Stunned 1."),
      say(["failure"], "Slowed 1 for 1 minute."),
      say(["fumble"], "Paralyzed for 1 minute."),
      note("A paralyzed subject exudes a carrion stench: all living creatures except you within 10 feet are sickened (Fortitude negates). Applied by hand — the stench follows the paralyzed creature, which is an emanation nothing places from a rung.")
    ];
  },

  "Glitterdust": (y) => {
    y.effects = [
      cond("dazzled", ["failure"], { duration: "1 minute" }),
      cond("blinded", ["fumble"], { duration: "1 round" }),
      cond("dazzled", ["fumble"], { duration: "10 minutes" }),
      say(["success"], "Invisibility negated for 2 rounds."),
      say(["failure"], "Dazzled for 1 minute; invisibility negated for 1 minute."),
      say(["fumble"], "Blinded for 1 round, dazzled for 10 minutes; invisibility negated for 10 minutes."),
      note("A creature whose invisibility this negates is CONCEALED rather than invisible, for the stated window — including invisibility gained later in it. Tracked by hand: nothing suppresses an invisibility a later spell grants.")
    ];
  },

  /* ─── Outside this block, found by the census ─────────────────────── */

  "Sleep": (y) => {
    y.effects = [
      { kind: "bonus", target: "targets", slot: "perception", bonusType: "status",
        value: -1, onSave: ["success"], duration: "1 round" },
      cond("unconscious", ["failure"], { duration: "1 minute" }),
      cond("unconscious", ["fumble"], { duration: "1 hour" }),
      say(["success"], "-1 status to Perception for 1 round."),
      say(["failure"], "Falls unconscious; wakes automatically after 1 minute."),
      say(["fumble"], "Falls unconscious; wakes automatically after 1 hour."),
      note("A creature that falls unconscious from this spell does not fall prone or drop what it is holding, and a successful Perception check wakes it.")
    ];
  },

  "Warp Mind": (y) => {
    y.effects = [
      cond("confused", ["failure"], { duration: "1 minute" }),
      // THE PAGE SAYS PERMANENT, so the row says permanent — the shape
      // block 25 built for Blindness rather than an absent duration.
      cond("confused", ["fumble"], { duration: "permanent" }),
      say(["success"], "Spends the first action of its next turn confused."),
      say(["failure"], "Confused for 1 minute."),
      say(["fumble"], "Confused PERMANENTLY."),
      note("Whatever the result, the target is immune to this spell for 10 minutes.")
    ];
  },

  "Word Of Blinding": (y) => {
    y.effects = [
      cond("dazzled", ["critical"], { duration: "1 round" }),
      cond("dazzled", ["success"], { duration: "1 minute" }),
      // A ROLLED LENGTH. Written as a duration string this parsed as
      // FOUR minutes — the parser found the die's face. See
      // magic/condition-timing-rules.mjs.
      cond("blinded", ["failure"], { durationRoll: "1d4 minutes" }),
      cond("blinded", ["fumble"], { duration: "permanent" }),
      say(["failure"], "Blinded for 1d4 minutes."),
      say(["fumble"], "Blinded PERMANENTLY."),
      note("Once affected, the target is immune to this spell for 10 minutes.")
    ];
  },

  "Word Of Deafening": (y) => {
    y.effects = [
      cond("deafened", ["critical"], { duration: "1 round" }),
      cond("deafened", ["success"], { duration: "1 minute" }),
      cond("deafened", ["failure"], { duration: "10 minutes" }),
      cond("deafened", ["fumble"], { duration: "permanent" }),
      say(["fumble"], "Deafened PERMANENTLY.")
    ];
  },

  "Shout": (y) => {
    y.effects = [
      cond("deafened", ["failure"], { duration: "1 round" }),
      cond("deafened", ["fumble"], { duration: "1 minute" }),
      say(["failure"], "Deafened until the end of its next turn."),
      say(["fumble"], "Deafened for 1 minute."),
      note("Exposed brittle or crystalline objects may shatter — the GM's call.")
    ];
  },

  "Sound Burst": (y) => {
    y.effects = [
      cond("deafened", ["failure", "fumble"], { duration: "1 round" }),
      say(["failure"], "Full damage and deafened for 1 round."),
      say(["fumble"], "Full damage, deafened, and a Minor critical.")
    ];
  },

  "Magnificent Dawn": (y) => {
    y.effects = [
      // "BLINDED FOR 3d6 ROUNDS" — as a duration string this parsed as
      // SIX rounds, the die's face.
      cond("blinded", ["failure", "fumble"], { durationRoll: "3d6 rounds" }),
      note("Raises the illumination level in the area to 9. Against Ooze and Undead the same roll is ALSO a Basic save against 100 Essence damage — rolled by hand, since one save cannot be two kinds at once here. Undead with a weakness to natural light suffer it as usual.")
    ];
  },

  "Petrification": (y) => {
    y.effects = [
      cond("slowed", ["success"], { value: 1, duration: "1 round" }),
      /*
       * A TUG OF WAR, NOT A COUNTDOWN — and my first authoring of it was
       * wrong in two ways that the page states plainly:
       *
       *   "A successful save REDUCES the slowed condition by 1"
       *      — not "ends it", which is what I first wrote.
       *   "On a failed save, the slowed condition increases by 1
       *    (OR 2 ON A CRITICAL FAILURE)"
       *      — two magnitudes, not one.
       *
       * "The spell ends if the creature is petrified or the slowed
       * condition is removed", so reaching 0 is the escape and there is
       * no fixed length to give it.
       */
      cond("slowed", ["failure"], {
        value: 1,
        conditionSave: { save: "fortitude", onSuccess: "reduceValue",
          onFailure: "increaseValue", amount: 1, fumbleAmount: 2, label: "Petrification" }
      }),
      cond("slowed", ["fumble"], {
        value: 2,
        conditionSave: { save: "fortitude", onSuccess: "reduceValue",
          onFailure: "increaseValue", amount: 1, fumbleAmount: 2, label: "Petrification" }
      }),
      say(["success"], "Slowed 1 for 1 round."),
      say(["failure"], "Slowed 1, with a Fortitude save at the end of each of its turns: a success reduces the slow by 1, a failure increases it by 1, a critical failure by 2. This ongoing save has the incapacitation trait."),
      say(["fumble"], "As failure, but slowed 2 to begin with."),
      note("When the creature can no longer act because of the slow, it is PERMANENTLY petrified — judged at the table, since that threshold depends on the actions it had. The spell ends when the creature is petrified or the slow is removed.")
    ];
  },

  "Fear": (y) => {
    // THE ONLY CHANGE HERE IS THE FLEEING'S CLOCK. The four frightened
    // rungs were authored correctly and are left exactly as they are.
    y.effects = (y.effects ?? []).map((e) =>
      e.kind === "condition" && e.condition === "fleeing"
        ? { ...e, duration: "1 round" } : e);
  },

  "Cognitive Collapse": (y) => {
    y.effects = (y.effects ?? []).map((e) =>
      e.kind === "condition" && e.condition === "dazed" && (e.onSave ?? []).includes("failure")
        ? { ...e, duration: "1 minute" } : e);
    y.effects = [...y.effects, note("The failure's daze lasts 1 minute — the page prints no length, and an unbounded daze is the defect this release swept for. Say otherwise and it will be changed.")];
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
