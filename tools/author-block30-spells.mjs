#!/usr/bin/env node
/**
 * author-block30-spells — pages 301-310, Graham's rulings of 25 September
 * 2026 ("use recommendation when you have"; R6 and R8 "in full").
 *
 * R5 (Protection / Protective Circle) is NOT here. Its bonus is "+2 to DB
 * and saving throws against the chosen aligned trait", and two things
 * this system does not have stand in the way: `defence` is not one of the
 * axes a conditional can narrow along (the list is skill, save,
 * specialist, attribute, attack, cast, spellcraft, initiative, flat,
 * damage), so the DB half — the main benefit — cannot be expressed at
 * all; and the aligned trait is CHOSEN at the table, where the only
 * existing picker is metamagic's free text ("state which at the table").
 * Carried to its own release rather than bolted onto this one.
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();

const note = (text, onSave) => (onSave ? { kind: "note", onSave, text } : { kind: "note", text });

/** name -> (system) => description of what changed */
const WORK = {
  /* ── R1. Regenerate — the healingRate rail, three releases late ── */
  regenerate: (sy) => {
    sy.effects = [
      // BASE VALUE ZERO AND `fromWarp`: the page grants no healing at all
      // in its base text — the rate is the +1 PP option. See the
      // healingRate case in spell-effects.mjs for why an unbought row is
      // a choice rather than a malformed row.
      { kind: "healingRate", target: "targets", rate: "fastHealing", value: 0, fromWarp: true,
        label: "Regenerate" },
      note("Replaces a lost or destroyed limb, organ or body part; a severed part can be "
        + "reattached with an Interact action. The replacement is not immediately functioning "
        + "and heals normally — judged at the table."),
      note("CASTER LEVEL: at CL 15 the fast healing becomes REGENERATION (the same number, six "
        + "times faster against the Injured condition). Raised by hand — nothing reads a caster "
        + "level against a healing rate.")
    ];
    sy.warps[1].mods = { healingRateBump: 5 };
    return "healingRate row + the fast-healing warp wired";
  },

  /* ── R2. Rapid Repair — the same rail ──────────────────────────── */
  "rapid repair": (sy) => {
    sy.effects = [
      { kind: "healingRate", target: "targets", rate: "fastHealing", value: 1, label: "Rapid Repair" },
      note("CONSTRUCTS ONLY, and it does not stack with fast healing the construct already has — "
        + "both judged at the table. Fast healing has no effect on a destroyed construct.")
    ];
    sy.warps[0].mods = { healingRateBump: 1, healingRateMax: 5 };
    return "fast healing 1, warp raises it to the printed cap of 5";
  },

  /* ── R3. Three rows that fired on a Critical Success ───────────── */
  "phantasmal killer": (sy) => {
    sy.effects = [
      { kind: "condition", target: "targets", condition: "frightened", value: 1, onSave: ["success"] },
      { kind: "condition", target: "targets", condition: "frightened", value: 2, onSave: ["partial", "failure"] },
      { kind: "condition", target: "targets", condition: "frightened", value: 4, onSave: ["fumble"] },
      note("Unaffected.", ["critical"]),
      note("4d6 mental damage and frightened 1.", ["success"]),
      note("6d6 mental damage, a Minor Critical and frightened 2.", ["partial"]),
      note("8d6 mental damage, a Serious Critical and frightened 2.", ["failure"]),
      note("A Fortitude save or the target DIES. Surviving it: 12d6 mental, a Deadly Critical, "
        + "fleeing until the end of its next turn, and frightened 4.", ["fumble"]),
      note("The mental damage and the criticals are rolled by hand — this is a five-rung ladder "
        + "and the system's save ladder carries four.")
    ];
    return "frightened gated 1/2/2/4; every rung printed";
  },
  "portal maelstrom": (sy) => {
    sy.effects = [
      { kind: "condition", target: "targets", condition: "prone", onSave: ["failure"] },
      note("Leaps free — unaffected.", ["critical"]),
      note("4d8 force damage and slowed 1 for 1 round.", ["success"]),
      note("8d8 force damage, teleported 1d4×10 feet in a random direction, landing prone.", ["failure"]),
      note("12d8 force damage and shunted into an adjacent plane for 1 round.", ["fumble"]),
      note("Every target also takes a force critical as if the save were Basic, the save recurs at "
        + "the start of each turn, and the area is difficult terrain. Rolled by hand.")
    ];
    return "prone gated to a failure; the four rungs printed";
  },
  "ramirez rhythm": (sy) => {
    sy.effects = [
      { kind: "condition", target: "targets", condition: "slowed", value: 1, onSave: ["failure", "fumble"] },
      { kind: "condition", target: "targets", condition: "prone", onSave: ["fumble"] },
      note("Unaffected.", ["critical"]),
      note("Uncontrollable clapping — it can't use reactions.", ["success"]),
      note("Slowed 1, and it can't use reactions.", ["failure"]),
      note("Prone, and it can't use actions or reactions for 1 round; then as failure.", ["fumble"]),
      note("\"Can't use reactions\" is printed rather than applied — there is no condition for it.")
    ];
    return "slowed gated to failure/fumble, prone added on a fumble";
  },

  /* ── R4. Object Prowess — a warp with something to raise ───────── */
  "object prowess": (sy) => {
    // THE FIVE SKILLS THE CREATE ACTION USES, which is what "Create
    // (varies)" varies over — crafting, nature, arcana, occultism,
    // religion, exactly as skill-actions.mjs lists them.
    const bonus = (slot) => ({ kind: "bonus", target: "self", slot, bonusType: "status", value: 2,
      note: "(Create checks)" });
    sy.effects = [
      bonus("crafting"), bonus("nature"), bonus("arcana"), bonus("occultism"), bonus("religion"),
      note("You may dismiss the spell to DOUBLE this bonus on a single Create check — taken at the "
        + "table, since nothing reads a dismissal as a bonus to the next roll.")
    ];
    return "five Create skills at +2 status — the live warp now has rows to raise";
  },

  /* ── R6. Prayer, in full — both sides of one area ──────────────── */
  prayer: (sy) => {
    const luck = (target, slot, value) =>
      ({ kind: "bonus", target, slot, bonusType: "luck", value, label: "Prayer" });
    sy.effects = [
      luck("allies", "attack", 1),
      luck("allies", "allSkills", 1),
      luck("allies", "will", 1),
      /*
       * THE DAMAGE QUARTER IS PRINTED (3.594.1), and driving 3.594.0 in
       * Graham's world is what settled it. `weaponDamageBonus` was the
       * obvious rail and fails Prayer twice:
       *
       *   it PROMPTS FOR A WEAPON (Gravity Weapon's shape), so an area
       *   spell blessing four allies would ask four questions and, left
       *   unanswered, printed "No weapon was chosen for Prayer on … —
       *   nothing applied" for each of them;
       *
       *   and `normaliseWeaponDamageBonus` REFUSES a value of 0 or less,
       *   so the foes' -1 came back as "Prayer declares a malformed
       *   weapon bonus". The rail is a bonus to one chosen weapon; it has
       *   no notion of a penalty to everything a creature swings.
       *
       * The other three quarters — attacks, every skill, Will saves, on
       * both sides — are applied automatically. This one says so.
       */
      luck("enemies", "attack", -1),
      luck("enemies", "allSkills", -1),
      luck("enemies", "will", -1),

      note("Allies in the radius gain +1 luck to attacks, every skill and Will saves; foes in the "
        + "same radius take -1 on the same three. Both sides are applied automatically."),
      note("THE DAMAGE BONUS IS BY HAND: +1 luck to damage for allies and -1 for foes. The weapon "
        + "damage rail asks which weapon and refuses a penalty, so it can express neither an area "
        + "blessing nor a foe's -1.")
    ];
    sy.areaTargeting = "all";
    return "three rows for allies, three mirrored for foes, one area; damage printed";
  },

  /* ── R7. Pale Flame — carried, and here is why ─────────────────
   *
   * "The target takes 2d8 essence damage at the beginning of each of its
   * turns." Both recurring rails in this system are AREA mechanisms and
   * neither fits a single-target spell:
   *
   *   `saveLadder.recurring` lives on a REGION — its driver walks the
   *   region's occupants at the start of their turns (Incendiary Cloud).
   *   `perTurn` is driven only through the EMANATION workflow, which is
   *   why its two users are both auras (Aura Of Vitality, Luminance).
   *
   * A per-target recurring damage rail is a third mechanism, and this
   * release already carries four new ones. Printed honestly instead, and
   * carried with R5.
   */
  "pale flame": (sy) => {
    sy.effects = [
      note("2d8 essence damage at the START of each of the target's turns, rolled by hand: both "
        + "recurring rails in this system are area mechanisms (a region's ladder, an emanation's "
        + "per-turn effect) and this spell targets one creature."),
      note("The spell ENDS on a target that rolls Critical or better on its Basic Will save.")
    ];
    return "the recurring damage printed, with the reason it is not automated";
  },

  /* ── R8. Power Crystal, in full ────────────────────────────────── */
  "power crystal": (sy) => {
    sy.effects = [
      { kind: "conjureItem", target: "targets", pack: "consumables", itemName: "Power Crystal",
        label: "Power Crystal", crystalPP: 1 },
      note("The crystal's points are part of whoever is HOLDING it — hand it over and they go with "
        + "it. They are spent before that character's own, and the crystal dissolves the moment it "
        + "is emptied or when the spell ends.")
    ];
    sy.warps[0].mods = { crystalPP: 1 };
    return "conjured crystal carrying 1 PP, warp raises what it holds";
  },

  /* ── R9. Qualm — four degrees, each its own row ────────────────── */
  qualm: (sy) => {
    const pen = (value, onSave, duration) => ({ kind: "bonus", target: "targets", slot: "allSkills",
      bonusType: "status", value, onSave, label: "Qualm", ...(duration ? { duration } : {}) });
    sy.effects = [
      pen(-1, ["success"], "1 round"),
      pen(-2, ["failure"]),
      pen(-4, ["fumble"]),
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: -1,
        onSave: ["success"], duration: "1 round", label: "Qualm" },
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: -2,
        onSave: ["failure"], label: "Qualm" },
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: -4,
        onSave: ["fumble"], label: "Qualm" },
      note("Unaffected.", ["critical"]),
      note("\"All actions\" is applied as every skill and the attack pool — the two places this "
        + "system holds an action's bonuses. Saves are not included, which the page does not name.")
    ];
    return "-1/-2/-4 across skills and attacks, gated by degree";
  },

  /* ── R10. Resist Energy ────────────────────────────────────────
   *
   * The `defence` row grants a resistance from a fixed `values` list;
   * there is no chooser for it (`chooseFrom` belongs to bonus rows and
   * offers saves alone). So the row cannot express "choose acid, cold,
   * electricity, fire, or sonic" — the CHOICE is what is missing, not
   * the resistance.
   *
   * Printed rather than fixed to one element, because a Resist Energy
   * that always granted fire resistance would be wrong four times in
   * five and wrong silently.
   */
  "resist energy": (sy) => {
    sy.effects = [
      note("Choose acid, cold, electricity, fire or sonic when you cast it: the target and its "
        + "gear gain resistance to that type for 10 minutes. Applied by hand — the resistance rail "
        + "grants a named type and has no chooser."),
      note("The +4 PP option adds a SECOND energy type, chosen the same way.")
    ];
    // AND THE WARP GOES BACK TO INERT. An earlier draft of this script
    // gave it `defenceChoices`, a key the aggregator has never read —
    // the exact defect this block's audit found in Graham's pack, made
    // by me, three hours later. Caught by the census below rather than
    // by noticing.
    sy.warps[1].mods = {};
    return "the chosen-energy resistance printed, with the reason";
  },

  /* ── the smaller notes ─────────────────────────────────────────── */
  "orb of the void": (sy) => {
    sy.effects = [
      { kind: "resource", target: "targets", resource: "soulDrain", formula: "2d8",
        label: "Orb Of The Void", onSave: ["failure"] },
      { kind: "resource", target: "targets", resource: "soulDrain", formula: "4d8",
        label: "Orb Of The Void", onSave: ["fumble"] },
      note("The sphere is moved up to 30 feet as a 1 AP action; anything living that it enters, or "
        + "that passes through or ends its turn in its space, takes the drain. Undead are unaffected.")
    ];
    return "soul drain 2d8 / 4d8 on the resource rail";
  },
  "polar ray": (sy) => {
    sy.effects = [
      note("Beyond the 10d8 cold: the target also takes 10 Soul Drain on a CRITICAL attack and 5 on "
        + "a success. Applied by hand — an attack spell's degrees carry no rider rail.")
    ];
    return "the soul-drain rider printed";
  },
  "painful rebuke": (sy) => {
    sy.effects = [
      note("REACTIVE, and applied by hand: each time the target attacks you, targets you with a "
        + "harmful spell, or acts to harm you, it takes 2d6 mental (once only on a success, then "
        + "the spell ends; every time for 1 minute on a failure; a fumble adds a Minor Critical). "
        + "Nothing in this system watches one creature for actions aimed at another."),
      note("Unaffected.", ["critical"])
    ];
    return "the reactive trigger printed, with its reason";
  }
};

let done = 0;
const changed = [];
for await (const [key, value] of db.iterator()) {
  if (!key.startsWith("!items!") || value?.type !== "spell") continue;
  const fn = WORK[String(value.name).trim().toLowerCase()];
  if (!fn) continue;
  const next = JSON.parse(JSON.stringify(value));
  const what = fn(next.system);
  await db.put(key, next);
  changed.push(`  ${value.name}: ${what}`);
  done += 1;
}
await db.close();
process.stdout.write(changed.sort().join("\n") + "\n");
process.stdout.write(`author-block30-spells: ${done} of ${Object.keys(WORK).length} applied.\n`);
