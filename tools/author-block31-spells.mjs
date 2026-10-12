#!/usr/bin/env node
/**
 * author-block31-spells — pages 311-320, Graham's rulings of 26 September
 * 2026 (R1-R10 approved, R2 and R3 "your recommendation").
 *
 * THIS TOOL IS THE FIRST HALF of the block: everything whose machinery
 * already exists or needed one small key. The spells that do nothing at
 * all — Sanctuary, Resurrection, Restore Senses, Scrying, both Runes,
 * Shadow Weapon, See Invisible, Shadow Tether, Shadow Blast, Scorching
 * Ray, Scintillating Pattern, Shape Stone — are their own release.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SPEEDS ARE TRANSCRIBED FROM THE PAGE, NOT FROM THE LABELS.
 *
 * Every form already carried its speeds twice: in its apOption label and
 * in a `note`. Both are the system's own prose, so authoring rows from
 * them would copy any mistake they contain. The table below is typed from
 * the printed stat lines on pages 316-320 and the labels were then
 * compared against it — see verify-chapter10-311-320 section S.
 *
 * ONE FORM PRINTS NO LAND SPEED: Elemental Air, whose stat line reads
 * "Speed: Fly 60 ft." It is authored as land 0 with fly 60, which is what
 * the page says and the reading a hovering air elemental deserves. It is
 * the one figure in the family that is an interpretation.
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();

/* ── the printed speeds, by spell and form label ──────────────────── */
const SPEEDS = {
  "shape of the aberrant": {
    "Mind Leech": { land: 30 },
    "Chitin Horror": { land: 25 }
  },
  "shape of the animal": {
    Agile: { land: 35 },
    Brawn: { land: 25 }
  },
  "shape of the beast": {
    Predator: { land: 40 },
    Brawn: { land: 30 }
  },
  "shape of the elemental": {
    Air: { land: 0, fly: 60 },
    Earth: { land: 25, burrow: 20 },
    Fire: { land: 30 },
    Water: { land: 20, swim: 50 }
  },
  "shape of the eternal": {
    Balance: { land: 30 },
    Chaos: { land: 35 },
    Evil: { land: 30 },
    Good: { land: 30, fly: 40 },
    Order: { land: 30 }
  },
  "shape of the fey": {
    "Glade Warden": { land: 35, climb: 20, swim: 20 },
    "Thorn Knight": { land: 25 },
    Trickster: { land: 40 }
  },
  "shape of the plant": {
    Bulwark: { land: 20 },
    "Spore Warden": { land: 30 },
    Vine: { land: 35, climb: 30 }
  },
  "shape of the wyrm": {
    Cave: { land: 30, burrow: 20, climb: 20 },
    Cold: { land: 25, fly: 40 },
    Fire: { land: 30, fly: 50 },
    Forest: { land: 40, climb: 30, fly: 40 },
    Light: { land: 35, fly: 60 },
    Sea: { land: 20, swim: 50 }
  }
};

/** The form name out of an apOption label ("Cave — Str +5, …" -> "Cave"). */
const formNameOf = (label) => String(label ?? "").split("—")[0].trim();

/**
 * The speed rows for one form.
 *
 * LAND IS A `speedSet` AND THE REST ARE `speedGrant`s, which is the whole
 * distinction in magic/speed-set.mjs: a form REPLACES the Speed you had
 * and ADDS the movement you did not.
 */
function speedRows(speeds, formName) {
  const rows = [];
  if (speeds.land !== undefined) {
    rows.push({ kind: "speedSet", target: "self", key: "land", feet: speeds.land, note: `${formName} form` });
  }
  for (const key of ["fly", "swim", "climb", "burrow"]) {
    if (speeds[key] === undefined) continue;
    rows.push({ kind: "speedGrant", target: "self", key, feet: speeds[key], note: `${formName} form` });
  }
  return rows;
}

/**
 * The speed clause out of a form's note, now that the rows carry it.
 *
 * TRIMS ONLY THE SPEEDS. Everything else in these notes is real and
 * unmodelled — Hover, "6-inch squeeze", tremorsense prose — so the note
 * stays and loses exactly the sentence the sheet now shows.
 */
function trimSpeedNote(text, formName) {
  return String(text ?? "")
    .replace(new RegExp(`^${formName}:\\s*`, "i"), `${formName}: `)
    .replace(/\b(?:Speed|Fly|Swim|Climb|Burrow)\s*\d+\s*ft\.?,?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/:\s*;/, ":")
    .replace(/:\s*$/, "")
    .trim();
}

const WORK = {};

/* ── R2: the forms' own speeds ────────────────────────────────────── */
for (const [spellKey, forms] of Object.entries(SPEEDS)) {
  WORK[spellKey] = (sy) => {
    let touched = 0;
    for (const option of sy.apOptions ?? []) {
      const name = formNameOf(option.label);
      const speeds = forms[name];
      if (!speeds) continue;
      option.effects = (option.effects ?? []).filter((e) => e.kind !== "speedSet" && e.kind !== "speedGrant");
      const rows = speedRows(speeds, name);
      // BEFORE THE NOTE, so the card reads stats, speeds, then prose.
      const noteAt = option.effects.findIndex((e) => e.kind === "note");
      if (noteAt < 0) option.effects.push(...rows);
      else option.effects.splice(noteAt, 0, ...rows);
      for (const e of option.effects) {
        if (e.kind === "note" && new RegExp(`^${name}:`, "i").test(String(e.text ?? ""))) {
          e.text = trimSpeedNote(e.text, name);
        }
      }
      touched += 1;
    }
    // R3 and R4 ride the same spells; both are warp mods rather than rows.
    let wired = 0;
    for (const w of sy.warps ?? []) {
      const t = String(w.text ?? "").toLowerCase();
      if (/size of the form by one step/.test(t)) {
        w.mods = { ...(w.mods ?? {}), sizeSteps: 1 }; wired += 1;
      } else if (/size of the form by two steps/.test(t)) {
        w.mods = { ...(w.mods ?? {}), sizeSteps: 2 }; wired += 1;
      } else if (/additional natural attack/.test(t)) {
        w.mods = { ...(w.mods ?? {}), extraFormAttacks: 1 }; wired += 1;
      }
    }
    return `${touched} forms given their printed speeds, ${wired} warps wired`;
  };
}

/*
 * R3 ON THE ONE SHAPE SPELL WITH NO FORMS OF ITS OWN.
 *
 * SHAPECHANGE IS NOT HERE, measured rather than assumed: its three warps
 * are a level cap and two durations, and it prints no size step at all. A
 * loop that included it would have been a branch that could never fire.
 */
for (const spellKey of ["shape of the humanoid"]) {
  WORK[spellKey] = (sy) => {
    let wired = 0;
    for (const w of sy.warps ?? []) {
      const t = String(w.text ?? "").toLowerCase();
      if (/size of the form by one step/.test(t)) { w.mods = { ...(w.mods ?? {}), sizeSteps: 1 }; wired += 1; }
      else if (/size of the form by two steps/.test(t)) { w.mods = { ...(w.mods ?? {}), sizeSteps: 2 }; wired += 1; }
    }
    if (spellKey === "shape of the humanoid") {
      /*
       * THE ONE BONUS THE PAGE PRINTS. "Gain a +4-status bonus to
       * Deception checks to pass as a member of that ancestry" — the
       * spell carried a single `trait` row and nothing else.
       *
       * A `bonus` ROW, NOT Self Mirage's `defenceDC`: that spell raises
       * the DC others roll against to see through a disguise; this one
       * raises the caster's own Deception check. Two different sentences
       * that read alike, and using the wrong one would put the +4 on the
       * wrong side of the table.
       */
      sy.effects = [
        ...(sy.effects ?? []).filter((e) => !(e.kind === "bonus" && e.slot === "deception")),
        { kind: "bonus", target: "self", slot: "deception", value: 4, bonusType: "status",
          // BRACKETED, because the effect-name builder adds none: every note
          // scope in the pack carries its own pair (verify-spell-narration E2).
          note: "(passing as that ancestry)" },
        { kind: "note", text: "STUDY TARGET (Culture) IS REQUIRED for the ancestry, and this "
          + "spell does not yet refuse a cast without one — the same gate Shapechange needs. "
          + "This form has no effect on ability scores, combat stats or senses." }
      ];
      return `+4 Deception authored, ${wired} size warps wired`;
    }
    return `${wired} size warps wired`;
  };
}

/* ── the two extras, and Shadow Walk's number ─────────────────────── */
WORK["searing ray"] = (sy) => {
  sy.damage = { ...(sy.damage ?? {}), vsTrait: { traits: ["demon", "undead"], formula: "5d6", type: "good" } };
  return "extra 5d6 good vs demons and undead";
};
WORK["frostbound shadow"] = (sy) => {
  sy.damage = { ...(sy.damage ?? {}), vsTrait: { traits: ["good eternal", "eternal"], formula: "5d6", type: "evil" } };
  return "extra 5d6 evil vs good eternals";
};
WORK["shadow walk"] = (sy) => {
  sy.resonanceOnNatural = 13;
  sy.effects = [
    ...(sy.effects ?? []).filter((e) => !/Resonance Event/i.test(String(e.text ?? ""))),
    { kind: "note", text: "A Resonance Event fires automatically on a natural 13 on the "
      + "Spellcraft check. Travel is 50 miles per hour along the Plane of Shadow; the party "
      + "arrives roughly 1 mile from where they intended, and the journey shows them nothing "
      + "usable for scouting." }
  ];
  return "resonance on a natural 13";
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
process.stdout.write(`author-block31-spells: ${done} of ${Object.keys(WORK).length} applied.\n`);
