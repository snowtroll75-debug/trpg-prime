#!/usr/bin/env node
/**
 * author-block31b-spells — the second half of pages 311-320: the spells
 * that did nothing at all.
 *
 * Graham's rulings of 26 September 2026, R1-R10. THIS TOOL CARRIES FOUR of
 * the twelve — the four whose mechanisms now exist. The rest need machinery
 * that does not: Sanctuary's attack-time gate (R1), Scorching Ray's rays
 * and deferred MAP (R5), Resurrection's aftermath (R6), Shadow Tether's
 * distance watcher (R8), Shadow Blast's two choosers (R9), the Runes'
 * designated membership and entry watcher (R10), and Shape Stone's
 * bystander skill check. Those are their own release.
 *
 * SEE INVISIBLE IS NOT HERE EITHER, and the reason is worth reading: the
 * `invisible` condition exists in the registry and NOTHING in the combat
 * rules reads it. `missChanceAvoidance` asks about `hidden` and
 * `concealed`; an invisible creature therefore gets no avoidance check at
 * all. See Invisible would counter a state that has no mechanical effect,
 * so what invisibility DOES at attack time has to be ruled on first —
 * R12, put to Graham rather than invented here.
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();

const note = (text, onSave) => (onSave ? { kind: "note", onSave, text } : { kind: "note", text });

const WORK = {
  /* ── R7a. Restore Senses — the counteract check it never asked for ── */
  "restore senses": (sy) => {
    sy.effects = [
      { kind: "counteract", target: "targets", conditions: ["blinded", "deafened"],
        label: "Restore Senses" },
      note("The counteract check addresses TEMPORARY OR PERMANENT effects alike, and its DC is "
        + "the DC of whatever inflicted the condition — which this system does not record, so the "
        + "check asks for it."),
      note("IT CANNOT HEAL A PHYSICAL INJURY OR NATURAL LOSS: a creature blinded by losing its "
        + "eyes is not restored by this. The +4 PP option regenerates one damaged or destroyed "
        + "eye or ear and changes the casting time to 10 minutes — judged at the table.")
    ];
    return "a real counteract row against blinded and deafened";
  },

  /* ── R7b. Scrying — two degrees that buy immunity ─────────────────── */
  scrying: (sy) => {
    sy.effects = [
      { kind: "tempImmunity", target: "targets", onSave: ["critical"], length: "1 week",
        label: "Scrying" },
      { kind: "tempImmunity", target: "targets", onSave: ["success"], length: "1 day",
        label: "Scrying" },
      note("The spell fails, and the target gains a glimpse of YOU and learns its rough distance "
        + "and direction from you.", ["critical"]),
      note("The spell fails.", ["success"]),
      note("The spell succeeds: place the sensor within 30 feet of the target. 1 AP "
        + "(Concentrate) to perceive through it; it does not move, but you may rotate its "
        + "viewpoint as part of that action, and you may Search (Perception) through it.",
        ["failure"]),
      note("The spell succeeds AND THE EYE FOLLOWS the target if it moves, travelling up to "
        + "60 feet.", ["fumble"]),
      note("STUDY TARGET MAKES IT WORSE BY ONE DEGREE: a target you have stored with the Study "
        + "Target action treats its saving throw as one degree worse. Nothing in this system "
        + "shifts a save degree — the mechanism does not exist for any spell — so this is applied "
        + "at the table."),
      note("The sensor is invisible, intangible and cannot be interacted with or detected by "
        + "normal means; spells and effects that reveal invisible or hidden objects find it.")
    ];
    return "immune 1 week on a critical, 1 day on a success, and every degree printed";
  },

  /* ── Shadow Weapon — the conjured-weapon rail, unused by it ───────── */
  "shadow weapon": (sy) => {
    sy.effects = [
      /*
       * "A MELEE WEAPON OF YOUR CHOICE" is both categories, which is wider
       * than Eldritch Weapon's Simple-only base and is what the page says.
       * The rail asks which weapon and copies the pack's own statistics, so
       * the shadow blade hits for whatever the real weapon does.
       */
      { kind: "conjuredWeapon", label: "Shadow Weapon", target: "self",
        categories: ["Simple", "Martial"], hands: 1, melee: true, damageType: "force" },
      note("The weapon is MAGICAL and IGNORES THE CONCEALED CONDITION when striking. The magical "
        + "half is on the weapon; the concealment half is applied by skipping the defender's "
        + "avoidance flat check, because nothing in this system can waive that check for one "
        + "weapon."),
      note("+4 PP: the weapon gains a +1 magical bonus to attacks and treats all armour DR as "
        + "half (round up). Both by hand: the conjured-weapon rail copies a pack weapon and has "
        + "no channel for a bonus or for halving DR.")
    ];
    return "a real conjured weapon, both halves of the warp printed";
  },

  /* ── Scintillating Pattern — a save with two rolled durations ─────── */
  "scintillating pattern": (sy) => {
    sy.effects = [
      // DAZZLED IS UNGATED, as printed: "Creatures are dazzled while inside
      // the pattern" is not an outcome of the save at all.
      { kind: "condition", target: "targets", condition: "dazzled", label: "Scintillating Pattern" },
      { kind: "condition", target: "targets", condition: "confused", onSave: ["failure"],
        durationRoll: "1d4 rounds", label: "Scintillating Pattern" },
      { kind: "condition", target: "targets", condition: "stunned", onSave: ["fumble"],
        durationRoll: "1d4 rounds", label: "Scintillating Pattern" },
      { kind: "condition", target: "targets", condition: "confused", onSave: ["fumble"],
        label: "Scintillating Pattern" },
      note("Unaffected.", ["critical", "success"]),
      note("ON A FUMBLE THE CONFUSION FOLLOWS THE STUN: both are applied now, the stun for its "
        + "1d4 rounds and the confusion for the spell's remaining duration. Nothing in this "
        + "system starts one condition when another ends, so the overlap is the table's to trim."),
      note("THE DAZZLE REACHES 20 FEET BEYOND THE PATTERN as well as inside it. Only the "
        + "pattern's own 20-foot radius is placed — a spell has one area — so dazzle the ring "
        + "by hand."),
      note("A creature attempts the save if it is inside when you cast it, enters, ends its turn "
        + "inside, or uses Search or Interact on the pattern; a creature already affected does "
        + "not save again. The re-save triggers are the table's: this system rolls the save for "
        + "everyone the area catches at the cast.")
    ];
    return "confused 1d4 on a failure, stunned 1d4 then confused on a fumble";
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
process.stdout.write(`author-block31b-spells: ${done} of ${Object.keys(WORK).length} applied.\n`);
