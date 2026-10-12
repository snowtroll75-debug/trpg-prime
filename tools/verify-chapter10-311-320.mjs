#!/usr/bin/env node
/**
 * verify-chapter10-311-320 — the Grimoire, Restoration to Shapechange.
 *
 * NEW at 3.595.0. Graham's rulings of 26 September 2026: R1-R10, with R2
 * and R3 left to my recommendation and both built.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BLOCK'S FINDING IS THAT THE MOST HEAVILY BUILT FAMILY IN THE
 * GRIMOIRE COULD NOT MOVE.
 *
 * Twenty-seven forms across nine Shape Of The … spells carry traits,
 * temporary HP, ability scores, DR, immunities, weaknesses, natural
 * attacks and — for the Wyrm — six castable breath weapons. Every one of
 * them printed its movement in a `note`. A druid in dragon form with a
 * printed Fly 60 could not fly; a plant form whose Speed is 20 moved at
 * whatever the character's own legs did.
 *
 * `speedGrant` had existed for six releases and three spells used it.
 *
 * AND EIGHTEEN WARPS SAID THE SAME SENTENCE. "You may increase or
 * decrease the size of the form by one step" / "…by two steps", on all
 * nine spells and on nothing else, every one inert — the most-repeated
 * inert warp text in the Grimoire.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { normaliseSpeedSet, speedSetDerive, speedSetLine } from "../module/magic/speed-set.mjs";
import { SET_SPEED_PATH, setSpeeds } from "../module/combat/granted-speeds.mjs";
import { SPEED_KEYS } from "../module/combat/speed-pool.mjs";
import { sizeStepChange, sizeStepTarget } from "../module/magic/size-step.mjs";
import {
  EXTRA_ATTACK_CAP, extraAttackCount, extraAttackRow, sizeStepRow, sizeStepsBought
} from "../module/magic/polymorph-warps.mjs";
import {
  normaliseVsTraitDamage, vsTraitMatches, vsTraitSourceTraits
} from "../module/magic/vs-trait-damage.mjs";
import { normaliseConditionRelief, reliefPlan } from "../module/magic/condition-relief.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const eq = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const applier = strip(read("module", "magic", "spell-effects.mjs"));
const caster = strip(read("module", "magic", "cast-workflow.mjs"));

async function spells() {
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [k, v] of db.iterator()) {
      if (k.startsWith("!items!") && v?.type === "spell") out.set(String(v.name).trim().toLowerCase(), v);
    }
  } finally { await db.close(); }
  return out;
}
const pack = await spells();
ok("A0 the spells pack could be read", pack.size > 0);
const sysOf = (n) => pack.get(n.toLowerCase())?.system ?? null;
const warpsOf = (n) => sysOf(n)?.warps ?? [];
const formsOf = (n) => sysOf(n)?.apOptions ?? [];
const notesOf = (n) => (sysOf(n)?.effects ?? []).filter((r) => r.kind === "note")
  .map((r) => String(r.text ?? "")).join(" ");

const SHAPES = [
  "Shape Of The Aberrant", "Shape Of The Animal", "Shape Of The Beast",
  "Shape Of The Elemental", "Shape Of The Eternal", "Shape Of The Fey",
  "Shape Of The Plant", "Shape Of The Wyrm"
];
const allForms = SHAPES.flatMap((n) => formsOf(n).map((o) => ({ spell: n, ...o })));
const rowsIn = (form, kind) => (form.effects ?? []).filter((e) => e.kind === kind);

/* ================================================================== *
 * S. THE FORMS' OWN SPEEDS (R2)
 * ================================================================== */

eq("S1 TWENTY-SEVEN FORMS, which is the number that had no speeds", allForms.length, 27);
ok("S2 EVERY FORM SETS A LAND SPEED",
  allForms.every((f) => rowsIn(f, "speedSet").some((r) => r.key === "land")),
  allForms.filter((f) => !rowsIn(f, "speedSet").some((r) => r.key === "land"))
    .map((f) => f.label).join("; "));
/*
 * S3 IS THE CHECK THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT. The figures
 * were transcribed from the printed stat lines, and the LABELS are the
 * system's own prose — so the two are compared against each other rather
 * than one being trusted. A label reading "Speed 30 ft." beside a row
 * setting 25 means one of them is a typo, and this says which form.
 */
{
  const disagree = [];
  for (const f of allForms) {
    const label = String(f.label ?? "");
    const set = rowsIn(f, "speedSet").find((r) => r.key === "land");
    const printed = /(?:^|,)\s*Speed\s*(\d+)\s*ft/i.exec(label);
    if (!set) continue;
    if (!printed) {
      // Air is the one form whose stat line prints no land Speed at all.
      if (Number(set.feet) !== 0) disagree.push(`${f.label} sets land ${set.feet} with no printed Speed`);
      continue;
    }
    if (Number(printed[1]) !== Number(set.feet)) {
      disagree.push(`${f.label} sets land ${set.feet}, label says ${printed[1]}`);
    }
  }
  ok("S3 AND EVERY LAND FIGURE MATCHES THE FORM'S OWN LABEL", disagree.length === 0, disagree.join("; "));
}
{
  const disagree = [];
  for (const f of allForms) {
    for (const key of ["fly", "swim", "climb", "burrow"]) {
      const row = rowsIn(f, "speedGrant").find((r) => r.key === key);
      const printed = new RegExp(`${key}\\s*(\\d+)\\s*ft`, "i").exec(String(f.label ?? ""));
      if (row && !printed) disagree.push(`${f.label} grants ${key} ${row.feet}, label does not print it`);
      if (!row && printed) disagree.push(`${f.label} prints ${key} ${printed[1]} and grants nothing`);
      if (row && printed && Number(row.feet) !== Number(printed[1])) {
        disagree.push(`${f.label} grants ${key} ${row.feet}, label says ${printed[1]}`);
      }
    }
  }
  ok("S3b and so does every fly, swim, climb and burrow", disagree.length === 0, disagree.join("; "));
}
eq("S4 AIR HAS NO LAND SPEED, which is the one interpretation in the family",
  rowsIn(allForms.find((f) => /^Air/.test(f.label)), "speedSet").find((r) => r.key === "land")?.feet, 0,
  "its stat line reads \"Speed: Fly 60 ft.\" and nothing else");
eq("S4b and flies at sixty",
  rowsIn(allForms.find((f) => /^Air/.test(f.label)), "speedGrant").find((r) => r.key === "fly")?.feet, 60);
ok("S5 THE NOTES NO LONGER CARRY THE FIGURES the sheet now shows",
  !allForms.some((f) => rowsIn(f, "note").some((r) => /\b(?:Speed|Fly|Swim|Climb|Burrow)\s*\d+\s*ft/i.test(String(r.text ?? "")))),
  "a card printing a real speed line and a note repeating it is two answers to one question");
ok("S5b but they keep what is still prose",
  allForms.some((f) => rowsIn(f, "note").some((r) => /Hover/i.test(String(r.text ?? "")))),
  "Air's Hover is not modelled and must not be trimmed away with the figures");
ok("S6 land is a speedSet and the rest are grants",
  allForms.every((f) => rowsIn(f, "speedSet").every((r) => r.key === "land"))
  && allForms.every((f) => rowsIn(f, "speedGrant").every((r) => r.key !== "land")),
  "a grant is a floor and cannot slow a character the form is supposed to slow");

/* The rule itself. */
/*
 * S7 CHANGED MECHANISM AT 3.595.1, AND THE LIVE DRIVE IS WHY.
 *
 * It first pinned an ActiveEffect OVERRIDE of
 * `system.combat.movement.land.base` at priority 30. Graham's world holds 22
 * race-item effects written in the PRE-POOLING spelling — the bare node
 * `system.combat.movement.land` set to the number 30 — and two changes on one
 * node race: ours loses, or ours THROWS ("Cannot create property 'base' on
 * number '30'") and that exception aborts the whole of `prepareDerivedData`.
 * Measured on the first cast: the land pool left as `{base: 35}` with no
 * total, the fly grant from the same cast never read, and every rule below
 * movement silently skipped.
 *
 * A replaced speed now travels as an ability item the derivation reads, beside
 * a granted one, and is applied inside `resolveMovement`.
 */
eq("S7 a replaced speed is a derived payload, not an effect change",
  JSON.stringify(speedSetDerive({ key: "land", feet: 25 })),
  JSON.stringify({ key: "land", feet: 25 }));
/*
 * S7a ASSERTS AN ABSENCE, WHICH IS WHY IT ALSO ASSERTS A PRESENCE.
 * `verify-checks-read-source` B1 caught the first version as VACUOUS: two
 * negated patterns pass just as happily on an empty file, so the check would
 * have kept passing if `speed-set.mjs` were deleted. The rule it is really
 * making is "this file replaces a speed and does it without an effect
 * change", and both halves of that have to be said.
 */
{
  const rule = strip(read("module", "magic", "speed-set.mjs"));
  ok("S7a AND NOTHING WRITES THE MOVEMENT POOL WITH AN EFFECT CHANGE",
    /export function speedSetDerive/.test(rule)
    && !/system\.combat\.movement\.[a-z]*\.base/.test(rule)
    && !/CHANGE_TYPE/.test(rule),
    "a stale bare-number change on the same node aborts the whole preparation");
}
eq("S7b ZERO IS A REAL FIGURE, unlike a grant of nothing",
  speedSetDerive({ key: "land", feet: 0 })?.feet, 0,
  "Air prints no land Speed and refusing the row would leave the character walking");
eq("S7c a speed this system does not have is refused", speedSetDerive({ key: "teleport", feet: 30 }), null);
eq("S7d and so is a malformed row", normaliseSpeedSet(null), null);
{
  const item = { flags: { "trg-prime": { creatureAbility: { derives: { [SET_SPEED_PATH]: { key: "land", feet: 20 } } } } } };
  eq("S7e the reader finds it on an item", JSON.stringify(setSpeeds([item], SPEED_KEYS)),
    JSON.stringify([{ key: "land", feet: 20 }]));
  eq("S7f and ignores a key this system has no pool for",
    setSpeeds([{ flags: { "trg-prime": { creatureAbility: { derives: { [SET_SPEED_PATH]: { key: "teleport", feet: 20 } } } } } }], SPEED_KEYS).length, 0);
}
{
  const pool = strip(read("module", "combat", "speed-pool.mjs"));
  ok("S7g THE RESOLVER ASSIGNS A SET AND MAXES A GRANT, which is the whole difference",
    /for \(const set of setSpeeds\)[\s\S]{0,400}?movement\.land\.total = set\.feet;/.test(pool)
    && /movement\[grant\.key\]\.total = Math\.max/.test(pool),
    "a 20-foot plant form must slow a 30-foot character, and a grant may never lower anything");
  ok("S7h and the land figure is replaced BEFORE armour and encumbrance apply",
    pool.indexOf("movement.land.total = set.feet;") < pool.indexOf("const result = landSpeed({"),
    "the penalties belong to the Speed the creature now has");
  /*
   * S7i EXISTS BECAUSE ITS MUTATION SURVIVED. Emptying the non-land loop
   * changed nothing any check could see: S3 and S3b compare the authored
   * ROWS against the printed labels, which is the data half, and nothing
   * asked whether the resolver ever applies a fly, swim, climb or burrow
   * set. Two of the family's speeds out of three are non-land.
   */
  ok("S7i AND THE FORM'S OTHER SPEEDS ARE REPLACED TOO, not only its land Speed",
    /for \(const set of setSpeeds\) \{\s*if \(!SPEED_KEYS\.includes\(set\?\.key\) \|\| set\.key === "land"\) continue;[\s\S]{0,240}?movement\[set\.key\]\.total = set\.feet;/
      .test(pool),
    "a Wyrm form that flies at 60 flies at 60, even for a caster already flying at 40 by another spell");
}
ok("S8 the card says the figure is the form's, in place of the character's",
  /in place of/.test(speedSetLine("X", { key: "land", feet: 25 }, 25))
  && /no land Speed/.test(speedSetLine("X", { key: "land", feet: 0 }, 0)));
ok("S9 the applier handles both kinds", HANDLED_EFFECT_KINDS.includes("speedSet")
  && /case "speedSet": \{/.test(applier));
/*
 * S9b MOVED WITH ITS SUBJECT. It first pinned `Number(...movement[key].total)`
 * — and `verify-speed-pool` J2 refuses exactly that: a movement pool is an
 * object, and every reader goes through `speedValue`. So the check now pins
 * the reader rather than the spelling, which is what it meant all along.
 */
ok("S9b and reads the figure back through speedValue, not off the row",
  /const \{ speedValue \} = await import\("\.\.\/combat\/speed-pool\.mjs"\);/.test(applier)
  && /speedValue\(target\.system\?\.combat\?\.movement\?\.\[set\.key\]\) \|\| set\.feet/.test(applier),
  "the number on the card is the number the player will see, and a pool is not a number");
ok("S9c the item it creates is the kind the derivation reads",
  /creatureAbility: \{ derives: \{ \[SET_SPEED_PATH\]: derive \} \}/.test(applier));
ok("S9d and the spell takes it back, through the one lifecycle that does that",
  /grantedItems: \[madeSet\.id\]/.test(applier)
  && /if \(grantedItems\?\.length\) flags\[SYSTEM_ID\]\.grantedItems = \[\.\.\.grantedItems\];/.test(applier),
  "a form that ends must give the character their own Speed back");

/* ================================================================== *
 * Z. THE SIZE STEPS (R3) — eighteen warps, one key
 * ================================================================== */

{
  const wired = SHAPES.concat(["Shape Of The Humanoid"]).flatMap((n) =>
    warpsOf(n).filter((w) => /size of the form/i.test(String(w.text ?? ""))));
  eq("Z1 EIGHTEEN SIZE WARPS, on nine spells", wired.length, 18);
  eq("Z1b and every one of them is wired", wired.filter((w) => w.mods?.sizeSteps > 0).length, 18,
    "they were the most-repeated inert warp text in the Grimoire");
  eq("Z1c one step where the page says one",
    wired.filter((w) => /one step/i.test(w.text)).every((w) => w.mods.sizeSteps === 1), true);
  eq("Z1d two where it says two",
    wired.filter((w) => /two steps/i.test(w.text)).every((w) => w.mods.sizeSteps === 2), true);
}
eq("Z2 THE DEARER OFFER WINS rather than the purchases adding",
  aggregateWarpSelection([{ mods: { sizeSteps: 1 } }, { mods: { sizeSteps: 2 } }],
    { "warp-0": 1, "warp-1": 1 }).mods.sizeSteps, 2,
  "one step and two steps are alternatives printed as separate lines; buying both is two steps, not three");
eq("Z2b and an unbought step is none",
  aggregateWarpSelection([{ mods: { sizeSteps: 2 } }], {}).mods.sizeSteps, 0);
eq("Z3 medium grows one step to large", sizeStepTarget("medium", 1), "large");
eq("Z3b and shrinks two to tiny", sizeStepTarget("medium", -2), "tiny");
eq("Z3c the table clamps at the top", sizeStepChange("colossal", 1), null,
  "a colossal form asked to grow has nothing above it, and the card says the size did not move");
eq("Z3d and at the bottom", sizeStepChange("diminutive", -1), null);
eq("Z3e a size the table does not know is refused", sizeStepTarget("enormous", 1), null);
/*
 * Z3f IS WHERE THE `SIZE_STEPS.indexOf` GUARD EARNS ITS PLACE, and it was
 * added because a mutation removing that guard SURVIVED: for any non-zero
 * step `sizeStepUp` already answers null for an unknown size and the loop
 * carries it out, so the guard changed nothing on the path being tested. It
 * bites on the ZERO-step path, which returns the starting size — and "no
 * steps asked" must still not answer "enormous is a size".
 */
eq("Z3f and refused even when no steps were asked", sizeStepTarget("enormous", 0), null,
  "the only path where the table check is the thing doing the refusing");
eq("Z4 THE CHANGE IS AN OVERRIDE AT PRIORITY 30",
  JSON.stringify(sizeStepChange("medium", 1)),
  JSON.stringify({ key: "system.identity.size", type: "override", value: "large", priority: 30 }),
  "a race sets the same field by override at priority 10; anything lower is a coin toss");
eq("Z5 the direction is the caster's, not the mod's",
  JSON.stringify(sizeStepRow(1, "smaller")),
  JSON.stringify({ kind: "sizeStep", target: "self", steps: -1 }),
  "the page says \"increase or decrease\"");
eq("Z5b larger is the other sign", sizeStepRow(2, "larger").steps, 2);
eq("Z5c and nothing bought is no row", sizeStepRow(0, "larger"), null);
ok("Z6 the applier handles the kind", HANDLED_EFFECT_KINDS.includes("sizeStep")
  && /case "sizeStep": \{/.test(applier));
ok("Z6b and tells the two refusals apart",
  /is not a size/.test(applier) && /sizeStepRefusedLine/.test(applier),
  "an unreadable size and a table with no room left are different problems");

/* ================================================================== *
 * N. THE EXTRA NATURAL ATTACKS (R4) — and the key that looked right
 * ================================================================== */

{
  const wired = SHAPES.flatMap((n) =>
    warpsOf(n).filter((w) => /additional natural attack/i.test(String(w.text ?? ""))));
  eq("N1 FIVE SPELLS BUY AN EXTRA NATURAL ATTACK", wired.length, 5);
  eq("N1b and all five carry the key", wired.filter((w) => w.mods?.extraFormAttacks === 1).length, 5);
  /*
   * N1c IS THE TRAP, PINNED. `morphForms` is read, capped, and its text is
   * one word from these five — and it is read at exactly one place, inside
   * the `wildMorph` case, which grows an attack copied from a STUDIED
   * TARGET and refuses without one. A Shape spell wired to it would charge
   * a PP and then ask for a studied creature that has nothing to do with
   * the form. That is the `targetTypes` mistake, which cost two spells four
   * PP each at 3.590.0.
   */
  eq("N1c AND NONE OF THEM IS WIRED TO `morphForms`",
    wired.filter((w) => "morphForms" in (w.mods ?? {})).length, 0,
    "morphForms belongs to wildMorph, which refuses without a Studied Target");
  eq("N1d which still belongs to exactly one spell",
    [...pack.values()].filter((v) => (v.system?.warps ?? []).some((w) => w.mods?.morphForms)).map((v) => v.name)
      .join(", "), "Wild Morph");
}
eq("N2 the purchases add", aggregateWarpSelection([{ mods: { extraFormAttacks: 1 } }], { "warp-0": 2 })
  .mods.extraFormAttacks, 2);
eq("N3 AND THE PRINTED CAP HOLDS", extraAttackCount({ extraFormAttacks: 9 }), EXTRA_ATTACK_CAP,
  "\"max of two additional attacks\" — capped in the rule, not in the dialog");
eq("N3b unbought is none", extraAttackCount({}), 0);
eq("N4 an extra attack is magical, like the form's own",
  extraAttackRow("Bite")?.extraTraits, "magical",
  "every Shape spell prints \"Natural attacks automatically gain the Magical trait\"");
eq("N4b and it is an attack row, so the pack supplies its die",
  extraAttackRow("Bite")?.kind, "attack");
eq("N4c an unnamed attack is no row", extraAttackRow("  "), null);
ok("N5 THE PROMPTS READ THE PACK rather than a list in the code",
  /contentPack\("creature-attacks"\)/.test(strip(read("module", "magic", "polymorph-warps-workflow.mjs"))),
  "a name this system invented would print \"no such creature attack\" at the table");
ok("N6 both are asked before the roll, beside the trait picks",
  /warpMods\.sizeSteps > 0 \|\| warpMods\.extraFormAttacks > 0/.test(caster)
  && caster.indexOf("polymorphWarpRows") < caster.indexOf("const traitPicks = traitPickCount"),
  "a cast abandoned at one of these prompts must cost nothing");
ok("N6b and the rows join the form's own rather than being applied on the side",
  /effEffects = \[\.\.\.\(Array\.isArray\(effEffects\) \? effEffects : \[\]\), \.\.\.added\]/.test(caster),
  "a warped form has to end exactly as an unwarped one does");

/* ================================================================== *
 * V. EXTRA DAMAGE AGAINST A KIND OF CREATURE (the first extra)
 * ================================================================== */

eq("V1 SEARING RAY'S HOLY HALF IS AUTHORED",
  JSON.stringify(sysOf("Searing Ray")?.damage?.vsTrait),
  JSON.stringify({ traits: ["demon", "undead"], formula: "5d6", type: "good" }),
  "\"If the target is a demon or undead, you deal an extra 5d6 good damage\"");
ok("V1b and Frostbound Shadow's, which is the same sentence",
  normaliseVsTraitDamage(sysOf("Frostbound Shadow")?.damage?.vsTrait)?.type === "evil");
eq("V2 exactly two spells in the pack carry it",
  [...pack.values()].filter((v) => v.system?.damage?.vsTrait).length, 2,
  "measured before the rail was built, so it serves both or neither");
eq("V3 the traits are matched, not assumed",
  JSON.stringify(vsTraitMatches(normaliseVsTraitDamage({ traits: ["demon", "undead"], formula: "5d6", type: "good" }),
    (t) => t === "undead")), JSON.stringify(["undead"]));
eq("V3b and a creature of neither kind takes nothing extra",
  vsTraitMatches(normaliseVsTraitDamage({ traits: ["demon"], formula: "5d6", type: "good" }), () => false).length, 0);
eq("V4 a row with no traits is refused", normaliseVsTraitDamage({ formula: "5d6", type: "good" }), null,
  "without them it would apply to everybody, which is a bigger first packet wearing this one's clothes");
eq("V4b and one with no type", normaliseVsTraitDamage({ traits: ["demon"], formula: "5d6" }), null);
ok("V5 IT IS A SECOND PACKET, resolved against its own type",
  /resolveAgainstDefences\(targetSystem, \{\s*amount: vsRoll\.total,\s*type: vsSpec\.type/.test(caster),
  "good damage folded into fire would be halved by fire resistance");
ok("V5b applied after the main blow", caster.indexOf("applyDamageAndCheckDying(targetActor, packet.taken")
  < caster.indexOf("applyDamageAndCheckDying(targetActor, vsPacket.taken"));
ok("V5c and read with the trait reader every other rule uses",
  /hasCreatureTrait\(targetActor\.system, t\)/.test(caster),
  "creatureTraits resolves granted traits and synonyms");

/*
 * V6 IS GRAHAM'S RULING OF 26 SEPTEMBER 2026 (R11), and what it cost to
 * find. A Skeleton Warrior resisting FIRE halved Searing Ray's GOOD dice —
 * 30 to 15 — because a spell's traits travel with every packet and the
 * skeleton's resistance matched the SPELL rather than the damage:
 *
 *   good with the spell's traits   30 -> 15
 *   good without them              30 -> 30
 *
 * The trait match is right and stays (verify-defence-vocabulary S3/S5, a
 * Shadow weak to divine). What is narrowed is this packet: a second packet
 * whose type is named separately is resolved without the spell's OTHER
 * damage words.
 */
eq("V6 THE SPELL'S OTHER DAMAGE WORDS DO NOT REACH THE SECOND PACKET",
  JSON.stringify(vsTraitSourceTraits(["fire", "good", "invocation", "light", "divinity"], "good")),
  JSON.stringify(["good", "invocation", "light", "divinity"]),
  "a fire-resistant undead must not halve the holy dice printed to punish it");
eq("V6b the packet's OWN type survives, so a creature weak to good still suffers",
  vsTraitSourceTraits(["fire", "good"], "good").includes("good"), true);
eq("V6c and everything describing the SOURCE survives with it",
  JSON.stringify(vsTraitSourceTraits(["cold", "evil", "invocation"], "evil")),
  JSON.stringify(["evil", "invocation"]),
  "Frostbound Shadow is the other spell on this rail");
eq("V6d an aligned word is a damage word, though DAMAGE_TYPES has no entry for it",
  vsTraitSourceTraits(["good", "fire"], "fire").includes("good"), false,
  "\"good\" and \"evil\" are damage in this book; the config's aligned entry is one key");
ok("V6e the narrowing is applied at the packet, and the call still declares itself magical",
  /\.\.\.spellDamageSource\(spell, \{ targeted: true \}\),[\s\S]{0,200}?sourceTraits: vsTraitSourceTraits\(spellSourceTraits\(spell\), vsSpec\.type\)/
    .test(caster),
  "W1 of verify-defence-vocabulary reads this call site; a spread it cannot see is a claim nobody can check");

/* ================================================================== *
 * H. SHAPE OF THE HUMANOID, and R. A CORRECTION TO MY OWN AUDIT
 * ================================================================== */

{
  const row = (sysOf("Shape Of The Humanoid")?.effects ?? [])
    .find((e) => e.kind === "bonus" && e.slot === "deception");
  eq("H1 the +4 to pass as that ancestry is a real row", row?.value, 4);
  eq("H1b as a status bonus", row?.bonusType, "status");
  /*
   * H1c IS A DISTINCTION TWO SPELLS IN THIS BLOCK NEARLY LOST. Self
   * Mirage raises the DC others roll to see THROUGH a disguise
   * (`defenceDC`); this raises the caster's OWN Deception check. Using
   * Self Mirage's shape here would have put the +4 on the wrong side of
   * the table.
   */
  eq("H1c ON THE CASTER'S OWN CHECK, not on a DC others roll against",
    (sysOf("Shape Of The Humanoid")?.effects ?? []).some((e) => e.kind === "defenceDC"), false);
  ok("H1d and the form still grants the traits", (sysOf("Shape Of The Humanoid")?.effects ?? [])
    .some((e) => e.kind === "trait"));
  ok("H1e with the Study Target gate named as still missing",
    /STUDY TARGET \(Culture\) IS REQUIRED/.test(notesOf("Shape Of The Humanoid")),
    "an unbuilt requirement is said out loud rather than left to be discovered");
  eq("H2 it has no forms, because the page prints none", formsOf("Shape Of The Humanoid").length, 0);
}
/*
 * R1 PINS A CORRECTION TO THE BLOCK-31 AUDIT ITSELF.
 *
 * The audit reported that Restoration's soul-drain warps cure one point
 * where the page says five, and offered to fix it. They already cured
 * five: `RELIEVABLE.soulDrain.step` is 5, `reliefPlan` uses the
 * CONDITION'S OWN STEP for a warped condition and for the bump, so the
 * +4 PP option cures 5 and the +2 PP bump raises it to 10. I read
 * `amount: 1` on the row — which belongs to the fatigued base — and
 * believed a name instead of measuring it, which is this project's
 * defect shape (a), in an audit warning about defect shape (a).
 *
 * Graham corrected it on 26 September 2026 ("supposed to be in blocks of
 * 5") and the answer is that it is. Pinned so nobody "fixes" it into
 * ones.
 */
{
  const row = normaliseConditionRelief((sysOf("Restoration")?.effects ?? [])
    .find((e) => e.kind === "conditionRelief"));
  eq("R1 SOUL DRAIN IS RELIEVED IN BLOCKS OF FIVE",
    reliefPlan(row, { reliefConditions: ["soulDrain"] }, "soulDrain").amount, 5,
    "\"instead cure 5 points of soul drain\"");
  eq("R1b and the bump adds another five, not one",
    reliefPlan(row, { reliefConditions: ["soulDrain"], reliefBump: 1 }, "soulDrain").amount, 10,
    "\"increase the amount of a condition reduced by 1 (or 5 for soul drain)\"");
  eq("R1c while the base row still moves fatigued by one", reliefPlan(row, {}).amount, 1);
  eq("R1d and injured by one more when bumped",
    reliefPlan(row, { reliefConditions: ["injured"], reliefBump: 1 }, "injured").amount, 2);
}

/* ================================================================== *
 * W. SHADOW WALK'S NUMBER
 * ================================================================== */

eq("W1 a natural 13 draws unwanted attention", sysOf("Shadow Walk")?.resonanceOnNatural, 13,
  "\"a Resonance Event occurs if you roll a 13 on the Spellcraft check\"");
ok("W1b read off the UNMODIFIED FACE, like chaos and the 66",
  /Number\(check\?\.dice\?\.faces\?\.\[0\] \?\? 0\) === resonanceFace/.test(caster),
  "\"roll a 13\" is the die, not the total");
ok("W1c and it fires the event every other trigger fires",
  /rollResonanceEvent\(actor, \{\s*reason: `\$\{spell\.name\} — a natural/.test(caster));
eq("W1d exactly one spell prints a number like this",
  [...pack.values()].filter((v) => v.system?.resonanceOnNatural).map((v) => v.name).join(", "), "Shadow Walk");

if (failures.length) {
  process.stderr.write(`verify-chapter10-311-320: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter10-311-320: OK — ${checks} checks. Twenty-seven forms can move, `
  + `eighteen size warps do something, and a holy ray burns demons.\n`);
