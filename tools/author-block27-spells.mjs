#!/usr/bin/env node
/**
 * Author the pages 271-280 work settled in block 27.
 *
 * Graham's R1-R8, 25 September 2026 — all eight "your recommendation".
 *
 * IDEMPOTENT. Every edit REPLACES the field it owns, and no warp edit
 * spreads the mods object it is replacing — block 25 shipped that bug and
 * Ball Lightning carried two contradictory keys for two runs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SIX SPELLS THIS FIXES ARE NOT THE GAPS. THEY ARE THE WRONG ANSWERS.
 *
 * The block's worst finding was not the thirteen unmodelled ladders; it
 * was that six of those spells carried ONE FLAT CONDITION ROW, applied on
 * every failing degree. A spell with no rows does nothing visible. These
 * did something confident:
 *
 *   DOMINATE      applied `controlled` on a SUCCESSFUL Will save, where
 *                 the page says stunned 1. A successful save dominated
 *                 the target.
 *   ENTHRALL      applied `fixated` on a Success the page calls
 *                 "unaffected".
 *   DIVINE DECREE applied `injured 2` on a Success that should take half
 *                 damage and nothing else.
 *   DULLING CLOUD applied `stunned 2` always — too much on a Success and
 *                 too little on a Fumble.
 *   FATIGUE       applied `fatigued 1` with no duration against a spell
 *                 duration of "varies", which parses to nothing. Every
 *                 Fatigue was PERMANENT; the Success rung is one round.
 *   FLARE         the same, for `dazzled`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND ALMOST NONE OF IT NEEDED BUILDING.
 *
 * `onSave` gating works on ANY kind — `declaredDegrees` reads the field
 * generically, and Fear has been five gated `condition` rows since it was
 * authored. A per-row duration has existed since Luminous Flare ("1 round
 * on a success, 1 minute on a failure"), and 28 rows in the pack use it.
 * So the eight ladders below are authoring, not machinery.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY LEFT AS A NOTE, so a later reader does not think
 * it was forgotten. Each was measured, not assumed:
 *
 *   ELDRITCH SHIELD, ENTROPIC SHIELD — "+4 to DB against spell attacks"
 *     and "-4 to incoming ranged attacks". `defenceDC` is the right
 *     channel and CANNOT carry either: the spell-attack path never calls
 *     `defenceDCBonus` at all, and the weapon path passes no axis saying
 *     whether the attack was ranged. A row would have been silently
 *     inert. Named as a gap with two customers.
 *   EFFORTLESS ARMOUR — `prepareArmourCheckPenalty` ASSIGNS `acp.total`
 *     from equipment and feats, so a bonus written to it is overwritten.
 *     It needs a `derives.acp` read of the same shape as the granted
 *     speed, which is a fourth mechanism this release does not need.
 *   ETERNAL ASPECT — four heterogeneous benefits, one chosen. Slot choice
 *     handles a list of SLOTS (`CHOOSABLE` holds `saves` and nothing
 *     else); "take a move action without provoking reactions" is not one.
 *   FAIRY FIRE — "visible creatures can't be concealed" is the negation
 *     of an UNVALUED condition, and `suppress` works by subtracting from
 *     a value.
 *   ENTANGLE's per-turn escape — the recurring-save clock built at
 *     3.587.0 takes a Fortitude, Reflex or Will save; this is an Escape
 *     check. Its difficult terrain IS authored.
 *   FOE TO FRIEND's redirect and EARTH PRISON's burial — R5, as ruled:
 *     each one's Success rung is built and the rest printed.
 */

import { ClassicLevel } from "classic-level";

const note = (text) => ({ kind: "note", text });
const say = (onSave, text) => ({ kind: "note", onSave, text });
/** A condition on named rungs, with its own duration when the page gives one. */
const cond = (condition, onSave, extra = {}) =>
  ({ kind: "condition", target: "targets", condition, onSave, ...extra });

const EDITS = {

  /* ─── R1 + R2: Divine Decree ─────────────────────────────────────── */

  "Divine Decree": (y) => {
    // R1. The header prints "Fortitude"; the ladder prints half / full /
    // double, which IS the basic-save pattern, and `parseSpellDefence`
    // reads the word "basic" out of this string to decide whether damage
    // scales by degree. Without it a SUCCESSFUL save took the full 10d8.
    // Third spell of this shape: Flaming Sphere and Surge Of The Tempest
    // were ruled the same way on 29 August and are declared differences.
    y.defence = "Basic Fortitude";
    y.effects = [
      // GATED NOW. `injured 2 for 1 minute` on the two rungs that print
      // it, with the duration the page gives rather than the spell's
      // (which is blank).
      cond("injured", ["failure", "fumble"], { value: 2, duration: "1 minute" }),
      say(["success"], "Half damage, and no injury."),
      say(["failure"], "Full damage and injured 2 for 1 minute."),
      say(["fumble"], "Double damage and injured 2 for 1 minute."),
      note("On your home plane a fumbling creature is also banished as a failed banishment save; a creature of 10th level or lower makes a Will save or is paralyzed for 1 minute, and dies on a fumble. Apply that half by hand.")
    ];
  },

  /* ─── R2: the seven other ladders ────────────────────────────────── */

  "Dominate": (y) => {
    y.effects = [
      // "The target RESISTS your control but becomes stunned 1."
      cond("stunned", ["success"], { value: 1 }),
      cond("controlled", ["failure", "fumble"]),
      say(["success"], "Resists your control, but is stunned 1."),
      say(["failure"], "Controlled — it may attempt a Will save at the end of each of its turns to break free, ending the spell on a success."),
      say(["fumble"], "Controlled, and it only gets another save if you issue an order that contradicts its nature.")
    ];
  },

  "Dulling Cloud": (y) => {
    y.effects = [
      cond("stunned", ["success"], { value: 1 }),
      cond("stunned", ["failure"], { value: 2 }),
      cond("stunned", ["fumble"], { value: 3 })
    ];
  },

  "Enthrall": (y) => {
    y.effects = [
      cond("fixated", ["failure", "fumble"]),
      say(["critical"], "Unaffected, and may make a check to notice your use of magic."),
      say(["failure"], "Fixated with you. A new saving throw if you or your allies do something it does not agree with."),
      say(["fumble"], "Fixated, and it cannot save to end the fixation even if it disagrees with you.")
    ];
  },

  "Fatigue": (y) => {
    // THREE RUNGS THAT DIFFER ONLY IN HOW LONG. The value is 1 on all
    // three; the page's lengths are 1 round, 1 minute and unstated —
    // and "unstated" here means it does not wear off, which the absence
    // of a duration already means to `spellExpiryTiming`.
    y.effects = [
      cond("fatigued", ["success"], { value: 1, duration: "1 round" }),
      cond("fatigued", ["failure"], { value: 1, duration: "1 minute" }),
      cond("fatigued", ["fumble"], { value: 1 }),
      say(["fumble"], "Fatigued 1 with no stated end — it lasts until something removes it.")
    ];
    y.warps = (y.warps ?? []).map((w) =>
      /increase the level of fatigue/i.test(String(w.text))
        ? { ...w, mods: { bonusValue: 1, bonusMax: 5 } } : w);
  },

  "Flare": (y) => {
    y.effects = [
      cond("dazzled", ["failure"], { duration: "1 round" }),
      cond("dazzled", ["fumble"], { duration: "1 minute" }),
      say(["failure"], "Dazzled until the end of its next turn.")
    ];
  },

  "False Mire": (y) => {
    y.effects = [
      { kind: "difficultTerrain", label: "False Mire", target: "area", illusory: true },
      { kind: "bonus", target: "targets", slot: "allSpeeds", bonusType: "circumstance",
        value: -10, onSave: ["failure", "fumble"] },
      cond("immobilised", ["fumble"]),
      say(["failure"], "Believes it is being sucked under: -10 feet circumstance to all Speeds."),
      say(["fumble"], "As failure, and also immobilised."),
      note("An affected target can attempt to escape the illusion.")
    ];
  },

  "Earth Bind": (y) => {
    y.effects = [
      // THE FALL IS SAFE ON EVERY FAILING RUNG — "if the creature manages
      // to safely reach the ground, it avoids taking any falling damage"
      // is the spell's own preamble, so no rung deals falling damage.
      cond("immobilised", ["failure"], { duration: "1 round" }),
      cond("immobilised", ["fumble"], { duration: "1 minute" }),
      say(["success"], "Falls safely up to 120 feet."),
      say(["failure"], "Falls safely up to 120 feet; on the ground it cannot Fly, levitate or leave the ground for 1 round."),
      say(["fumble"], "As failure, but grounded for 1 minute."),
      note("Immobilised stands in for \"cannot Fly, levitate or otherwise leave the ground\": it stops the movement the sentence forbids, and nothing in the system suppresses a flight mode on its own.")
    ];
  },

  /* ─── R3: Doubt, on the channel Disorient needed ─────────────────── */

  "Doubt": (y) => {
    y.effects = [
      {
        kind: "pending", target: "targets", onSave: ["failure"],
        swing: "disadvantage", span: "endOfNextTurn",
        scope: "the next check it makes"
      },
      {
        // ALL CHECKS, SO PRE-TICKED AND NOT SPENT — the same two axes
        // Disorient's Fumble rung sets, for the same reason.
        kind: "pending", target: "targets", onSave: ["fumble"],
        swing: "disadvantage", span: "endOfNextTurn",
        oneShot: false, auto: true,
        scope: "all checks"
      },
      say(["failure"], "Minor doubt: its next check is made with DISADVANTAGE."),
      say(["fumble"], "Serious doubt: ALL of its checks are made with DISADVANTAGE."),
      note("Sustained: each time you sustain the spell the target makes a new save. The save is made in SECRET, so the target does not learn the result.")
    ];
  },

  /* ─── R4: the two resource ladders ───────────────────────────────── */

  "Eldritch Disruption": (y) => {
    // The 6d10 force already worked — the header says "Basic Will". This
    // is the SECOND ladder the entry prints, on top of it.
    y.effects = [
      { kind: "resource", target: "targets", resource: "pp", formula: "1d6",
        label: "Eldritch Disruption", onSave: ["success"] },
      { kind: "resource", target: "targets", resource: "pp", formula: "2d6",
        label: "Eldritch Disruption", onSave: ["failure"] },
      { kind: "resource", target: "targets", resource: "pp", formula: "4d6",
        label: "Eldritch Disruption", onSave: ["fumble"] },
      note("Only a target that has Power Points is affected by the drain. Excess drain below 0 PP becomes Soul Drain at 5 per point, which Chapter 4's own rule applies.")
    ];
    y.warps = (y.warps ?? []).map((w) => {
      if (/gain half the PP/i.test(String(w.text))) return { ...w, mods: { casterGains: "half" } };
      if (/gain all of the PP/i.test(String(w.text))) return { ...w, mods: { casterGains: "all" } };
      return w;
    });
  },

  "Enervation": (y) => {
    y.effects = [
      // RECURRING DAMAGE CARRIES ITS TYPE. Without it the actor defaults
      // to FIRE — deliberately, so nothing untyped is ever applied — and
      // an essence line would have burned its targets all encounter.
      cond("recurring", ["success"], { formula: "1d8", damageType: "essence" }),
      cond("recurring", ["failure"], { formula: "2d8", damageType: "essence" }),
      cond("recurring", ["fumble"], { formula: "4d8", damageType: "essence" }),
      { kind: "resource", target: "targets", resource: "soulDrain", formula: "2d8",
        label: "Enervation", onSave: ["failure"] },
      { kind: "resource", target: "targets", resource: "soulDrain", formula: "4d8",
        label: "Enervation", onSave: ["fumble"] },
      cond("doomed", ["fumble"], { value: 1 })
    ];
    y.warps = (y.warps ?? []).map((w) =>
      /recurring essence damage increases/i.test(String(w.text))
        ? { ...w, mods: {} } : w);
  },

  /* ─── R5: the Success rung, and the rest printed ─────────────────── */

  "Foe To Friend": (y) => {
    y.effects = [
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "circumstance",
        value: -5, onSave: ["success"] },
      say(["success"], "Hesitates: -5 circumstance to the triggering attack."),
      say(["failure"], "The attack is made against a valid target of your choice instead, or is negated; the target counts as an ally for flanking for 1 round."),
      say(["fumble"], "As failure, and it spends all its actions this round attacking the new target."),
      note("The redirect is applied by hand: nothing in the attack workflow can be handed a new target once the roll has been made.")
    ];
  },

  "Earth Prison": (y) => {
    y.effects = [
      cond("slowed", ["success"], { value: 1 }),
      say(["success"], "Slowed 1 for the duration."),
      say(["failure"], "Dragged 100 feet beneath the earth in suspended animation — not aging, needing no air, food or drink. It can be dug out if it can be found."),
      say(["fumble"], "As failure, and attempts to locate it suffer a -5 circumstance penalty."),
      note("The burial is applied by hand: it is a place the token is not, and nothing in the system moves a creature off the map and back.")
    ];
  },

  /* ─── R6: the spells with a rail ─────────────────────────────────── */

  "Fleeting Speed": (y) => {
    y.effects = [
      { kind: "bonus", target: "self", slot: "allSpeeds", bonusType: "status", value: 30 }
    ];
  },

  "Divine Favour": (y) => {
    y.effects = [
      { kind: "bonus", target: "self", slot: "attack", bonusType: "circumstance", value: 1 },
      { kind: "weaponDamageBonus", target: "self", value: 1, bonusType: "circumstance" },
      note("The bonus does not apply to attack SPELLS — the attack pool is the weapon one, so a spell attack is unaffected.")
    ];
  },

  "False Health": (y) => {
    // "temporary HP equal to your spellcasting ability score x2" — the
    // first formula in the pack to need the casting ability score, which
    // is now passed in the roll data beside level and PP.
    y.effects = [
      { kind: "tempHP", target: "self", formula: "@castingAbility * 2" }
    ];
    y.warps = (y.warps ?? []).map((w) =>
      /ability score multiplier/i.test(String(w.text))
        ? { ...w, mods: {} } : w);
  },

  "Echolocation": (y) => {
    // GRANTED FROM THE PACK'S OWN BLINDSIGHT, not redefined — the rail
    // built for Darkvision at 3.587.0, for the same reason.
    y.effects = [
      { kind: "grantAbility", target: "self", uuid: "Compendium.trg-prime.abilities.Item.9Nu1GU1jAUWLfs2s", label: "Blindsight" }
    ];
  },

  "Fly": (y) => {
    y.effects = [
      // A SPEED THE CREATURE DOES NOT HAVE. A bonus row cannot do this:
      // a speed pool with no base yields nothing. See granted-speeds.mjs.
      { kind: "speedGrant", target: "targets", key: "fly", feet: 20, orLand: true },
      note("If the target is still airborne when the spell ends, is countered or is suppressed, they drift to the ground as Feather Fall.")
    ];
  },

  "Earth Glide": (y) => {
    y.effects = [
      { kind: "speedGrant", target: "targets", key: "burrow", feet: 5 },
      note("No tunnel, hole or ripple is left behind. The spell does not let the target breathe underground, so it must hold its breath while inside solid material.")
    ];
    y.warps = (y.warps ?? []).map((w) =>
      /increase the speed by 5 feet/i.test(String(w.text))
        ? { ...w, mods: { bonusValue: 5, bonusMax: 20 } } : w);
  },

  "Entangle": (y) => {
    y.effects = [
      { kind: "difficultTerrain", label: "Entangle", target: "area" },
      note("Each round a creature STARTS its turn in the area it attempts an Escape check at the spell's DC: on a failure a -10-foot circumstance penalty to its Speeds until it leaves, and on a critical failure it is also immobilised for 1 round. Creatures may Escape at the same DC to remove these. Rolled by hand — the per-turn clock takes a Fortitude, Reflex or Will save, and this is a skill check.")
    ];
  },

  /* ─── R7: Embrace Destiny ────────────────────────────────────────── */

  "Embrace Destiny": (y) => {
    y.effects = [
      {
        // THE SAME KIND SEER'S VISION USES, which forces the first die
        // face rather than substituting a total — Graham's ruling of
        // 31 August 2026 that a recorded 20 IS a natural 20. The one
        // difference is the list, which this row declares.
        kind: "seersVision", target: "self",
        types: ["attack", "save", "skill"]
      },
      note("One instance at a time: recasting it replaces the recorded number. Using the result ends the spell, and it cannot replace a roll already made.")
    ];
  },

  /* ─── The four the audit expected and measurement refused ───────── */

  /*
   * EACH OF THESE WAS NAMED IN R6 AS HAVING A RAIL, AND EACH MEASURED
   * OTHERWISE. A note is not a consolation prize here: it is the only
   * honest output, because a row that reached a card and did nothing is
   * the exact defect this project keeps finding. Every one names WHY, so
   * the next reader is not tempted to build the row I did not.
   */

  "Eldritch Shield": (y) => {
    y.effects = [
      note("+4 status bonus to DB against all spell attacks — judge it at the table. The DB channel (defenceDC) cannot carry it: the spell-attack path never consults defenceDCBonus at all, so a row here would be silently inert.")
    ];
  },

  "Entropic Shield": (y) => {
    y.effects = [
      note("-4 circumstance penalty to incoming RANGED attacks — judge it at the table. defenceDC reaches the weapon-attack path, but nothing it is passed says whether the attack was ranged, so the penalty could not be scoped to the half the spell covers.")
    ];
  },

  "Effortless Armour": (y) => {
    y.effects = [
      note("Armour no longer reduces your speed, and ACP is reduced by 1 (a further 1 per +1 PP, max 4) — apply by hand. prepareArmourCheckPenalty ASSIGNS acp.total from equipment and feats, so a bonus written to it is overwritten; it needs a derived read of the same shape as a granted speed.")
    ];
  },

  "Eternal Aspect": (y) => {
    y.effects = [
      note("Choose ONE: take a move action without provoking reactions; +2 circumstance to Acrobatics; +1 luck to saving throws; +1 luck to ranged attacks. Chosen and applied by hand — the slot-choice dialog offers a list of SLOTS, and \"a move action without provoking reactions\" is not one.")
    ];
  },

  /* ─── R8: Divine Might's base spell, so its warp has something ───── */

  "Divine Might": (y) => {
    // THE WARP WAS NEVER THE PROBLEM. "+2 PP: increase status bonus to
    // Str & Con by +1 (max +4)" carried `mods: {}` and the key it wanted
    // (`bonusValue`/`bonusMax`) has existed for months — but the base
    // spell's only row was a NOTE, so there was no bonus to raise. The
    // key existed; the row it would act on did not.
    y.effects = [
      { kind: "bonus", target: "self", slot: "strength", bonusType: "status", value: 1 },
      { kind: "bonus", target: "self", slot: "constitution", bonusType: "status", value: 1 },
      note("Your Base Attack Bonus becomes equal to your level for the duration — set by hand; nothing in the system overrides a derived BAB.")
    ];
    y.warps = (y.warps ?? []).map((w) =>
      /increase status bonus to Str & Con/i.test(String(w.text))
        ? { ...w, mods: { bonusValue: 1, bonusMax: 4 } } : w);
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
