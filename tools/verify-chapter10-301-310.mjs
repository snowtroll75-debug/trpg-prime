#!/usr/bin/env node
/**
 * verify-chapter10-301-310 — the Grimoire, Oasis to Resonance
 * Manipulation.
 *
 * NEW at 3.594.0. Graham's rulings of 25 September 2026: "use
 * recommendation when you have", plus R6 and R8 "in full".
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BLOCK'S FINDING IS THAT PRAYER COULD ONLY BLESS HALF A ROOM.
 *
 * A spell could bless the allies in its area or curse the enemies in it,
 * but not both: `target: "allies"` drew from the area and every other
 * row drew from the save list. So Prayer — "You and each ally gain a
 * +1-luck bonus… All foes within the radius suffer the same modifiers
 * as a penalty" — had nowhere to author its second half, and shipped
 * with two rows on the CASTER and a note admitting the rest was applied
 * by hand. Three quarters of a printed spell, done from the sheet.
 *
 * The other half of that sentence was "skill checks", which `slot` could
 * not say either: there are twenty-six skills and no word for all of
 * them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THREE MORE ROWS FIRED ON A CRITICAL SUCCESS. Phantasmal Killer,
 * Portal Maelstrom and Ramirez Rhythm all applied a condition on every
 * degree including the one their page calls unaffected — the Nightmare
 * defect from block 29, three more times in one block.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { ALL_SKILLS_SLOT, bonusTargetFor } from "../module/magic/spell-effects.mjs";
import { normaliseHealingRate } from "../module/magic/healing-rate.mjs";
import { aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import { effectAppliesOnDegree } from "../module/magic/spell-degrees.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";

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
const rowsOf = (n) => sysOf(n)?.effects ?? [];
const warpsOf = (n) => sysOf(n)?.warps ?? [];
const notesOf = (n) => rowsOf(n).filter((r) => r.kind === "note").map((r) => String(r.text ?? "")).join(" ");
const onDegree = (n, d) => rowsOf(n).filter((r) => r.kind !== "note" && effectAppliesOnDegree(r, d));
const saysOn = (n, d) => rowsOf(n).some((r) => r.kind === "note" && Array.isArray(r.onSave) && r.onSave.includes(d));

/* ================================================================== *
 * A. BOTH SIDES OF ONE AREA (R6 — Prayer, in full)
 * ================================================================== */

ok("A1 AN ENEMIES ROW DRAWS FROM THE AREA, as an allies row does",
  /: effect\.target === "enemies"\s*\?\s*\(areaCaught\.length \? areaCaught : targets\)\s*\.filter\(\(t\) => t\?\.uuid && hostileUuids\.includes\(t\.uuid\)\)/
    .test(applier),
  "without this a spell could bless the allies in its area or curse the enemies in it, never both");
/*
 * A1b IS THE POINT OF WRITING IT AS A MIRROR. Both halves read the same
 * source list and the same `hostileUuids`, so the two sides of one area
 * cannot disagree about who is a foe.
 */
ok("A1b and from the same list of foes the allies row excludes",
  (applier.match(/hostileUuids\.includes\(t\.uuid\)/g) ?? []).length === 2,
  "two different answers to \"who is hostile\" in one cast is how half a room gets blessed twice");

eq("A2 PRAYER BLESSES THREE THINGS FOR ALLIES",
  JSON.stringify(rowsOf("Prayer").filter((r) => r.target === "allies")
    .map((r) => r.slot ?? r.kind).sort()),
  JSON.stringify(["allSkills", "attack", "will"]),
  "attack checks, skill checks and Will saves; the damage quarter is printed \u2014 see A3");
eq("A2b AND PENALISES THE SAME THREE FOR FOES",
  JSON.stringify(rowsOf("Prayer").filter((r) => r.target === "enemies")
    .map((r) => r.slot ?? r.kind).sort()),
  JSON.stringify(["allSkills", "attack", "will"]),
  "\"All foes within the radius suffer the same modifiers as a penalty\"");
/*
 * A3 PINS A DECISION THE LIVE DRIVE MADE (3.594.1). `weaponDamageBonus`
 * was the obvious rail for the damage quarter and fails Prayer twice: it
 * PROMPTS for a weapon, so an area spell asks once per ally and applies
 * nothing when nobody answers; and it refuses a value of 0 or less, so
 * the foes' -1 came back as "declares a malformed weapon bonus". Both
 * were printed on a card in Graham's world before this was written.
 */
eq("A3 THE DAMAGE QUARTER CARRIES NO ROW",
  rowsOf("Prayer").filter((r) => r.kind === "weaponDamageBonus").length, 0,
  "the rail asks which weapon and refuses a penalty; it can express neither half of this");
ok("A3b and the card says so, with both reasons",
  /THE DAMAGE BONUS IS BY HAND/.test(notesOf("Prayer"))
  && /asks which weapon and refuses a penalty/.test(notesOf("Prayer")));
/*
 * A4 IS A CARD-WORDING DEFECT THE LIVE DRIVE READ OUT LOUD (3.594.2):
 * "Probe 3594 Ally: +1 luck bonus to allSkills". The slot's KEY, not its
 * words — which is precisely what 3.578.1 fixed for `allSpeeds` after the
 * Tanglefoot Bag printed "-10 status penalty to allSpeeds", pinned by K5
 * of verify-chapter6-gear-181-190. The same defect, one slot later, so
 * the entry is keyed off the constant rather than spelled out: rename the
 * slot and the words follow it.
 */
ok("A4 THE CARD SAYS 'every skill check', not the slot's key",
  /\[ALL_SKILLS_SLOT\]: "to every skill check",/.test(applier),
  "Prayer is the first spell to put this slot on a card");
/*
 * A5 RECORDS GRAHAM'S RULING OF 26 SEPTEMBER 2026 ("Yes go with your idea
 * on Power Crystal") where the spell it came from lives. The rule itself is
 * general and is pinned beside the other conjuring rules in
 * verify-pp1-batch (C-D5..C-D9, C-E1b..C-E1d); what belongs HERE is the
 * property of this spell's row that lets the ruling reach it.
 *
 * A DEGREE-GATED ROW IS DELIBERATELY EXEMPT from the fallback, so a
 * Power Crystal row that ever acquired an `onSave` would go back to
 * printing "finds nobody to affect" and spending the PP for nothing.
 */
{
  const rows = rowsOf("Power Crystal").filter((r) => r.kind === "conjureItem");
  eq("A5 Power Crystal conjures exactly one thing", rows.length, 1);
  ok("A5b AND ITS ROW IS NOT DEGREE-GATED, so an untargeted cast reaches the caster",
    rows.every((r) => !r.onSave),
    "the fallback is exempt for gated rows; gate this one and the spell makes nothing again");
}
ok("A2c the ally rows are +1 and the foe rows are -1",
  rowsOf("Prayer").filter((r) => r.target === "allies").every((r) => r.value === 1)
  && rowsOf("Prayer").filter((r) => r.target === "enemies").every((r) => r.value === -1));
ok("A2d all of them luck, which is the type the page names",
  rowsOf("Prayer").filter((r) => r.kind !== "note").every((r) => r.bonusType === "luck"));
eq("A2e and the area reaches both sides", sysOf("Prayer")?.areaTargeting, "all",
  "an area scoped to allies would never hand the foe rows anybody to land on");

/* ================================================================== *
 * B. "SKILL CHECKS", ALL OF THEM
 * ================================================================== */

eq("B1 the slot has a name", ALL_SKILLS_SLOT, "allSkills");
eq("B1b and no single pool of its own", bonusTargetFor(ALL_SKILLS_SLOT), null,
  "a slot with nowhere pooled to land is refused where a harness can see it");
/*
 * B1c IS B1b MADE FALSIFIABLE. `bonusTargetFor` answers null for
 * `allSkills` twice over — the early refusal returns first, and no slot
 * set contains the name anyway — so B1b above cannot be made to fail by
 * any single change, which makes it an assertion rather than a check.
 * What can fail, and what actually matters, is the second of those two:
 * the moment `allSkills` becomes a pool somewhere, the expansion below
 * is dead code and every Prayer and Qualm row lands on one bogus path.
 */
ok("B1c AND IT IS NOT A MEMBER OF ANY SLOT SET",
  !/_SLOTS = new Set\(\[[^\]]*"allSkills"/.test(applier)
  && !/_KEYS = new Set\(\[[^\]]*"allSkills"/.test(applier),
  "a name that is both a pool and an expansion resolves to whichever is checked first");
ok("B2 IT EXPANDS INTO ONE CHANGE PER SKILL THE SHEET HAS",
  /if \(effect\.slot === ALL_SKILLS_SLOT\) \{[\s\S]{0,300}?Object\.keys\(target\?\.system\?\.skills \?\? \{\}\)\.filter\(\(k\) => SKILL_SLOTS\.has\(k\)\)/
    .test(applier),
  "resolved against the TARGET, as allSpeeds is — it is their training being sharpened");
ok("B2b and refuses out loud when there are none",
  /if \(!keys\.length\) return \{ applied: false, reason: "no skills to modify" \};/.test(applier),
  "an effect with an empty changes array is the shape this file treats as \"looks applied and does nothing\"");
ok("B2c the expansion is reached before the single-slot path",
  applier.indexOf("effect.slot === ALL_SKILLS_SLOT") < applier.indexOf("effect.slot === ALL_SPEEDS_SLOT")
  || applier.indexOf("effect.slot === ALL_SKILLS_SLOT") < applier.indexOf("const key = bonusTargetFor"));

/* ================================================================== *
 * C. A HEALING RATE A WARP CAN BUY OR RAISE (R1, R2)
 * ================================================================== */

{
  const regen = rowsOf("Regenerate").find((r) => r.kind === "healingRate");
  ok("C1 REGENERATE HAS THE RAIL BUILT THREE RELEASES AGO", Boolean(regen));
  eq("C1b its base grants nothing, because the page's base text does not", regen?.value, 0);
  ok("C1c and it is marked as a warp's to switch on", regen?.fromWarp === true,
    "without this an unbought row would be announced as malformed on every cast");
  eq("C1d the warp supplies the whole rate",
    warpsOf("Regenerate").find((w) => /fast healing 5/i.test(String(w.text)))?.mods?.healingRateBump, 5);
  ok("C1e and the CL 15 upgrade to regeneration is printed",
    /CL 15[\s\S]{0,120}REGENERATION/i.test(notesOf("Regenerate")),
    "nothing reads a caster level against a healing rate");

  const rapid = rowsOf("Rapid Repair").find((r) => r.kind === "healingRate");
  eq("C2 RAPID REPAIR GRANTS FAST HEALING 1", rapid?.value, 1);
  eq("C2b and its warp raises that", warpsOf("Rapid Repair")[0]?.mods?.healingRateBump, 1);
  eq("C2c to the printed ceiling of five", warpsOf("Rapid Repair")[0]?.mods?.healingRateMax, 5);
  ok("C2d constructs only, and the no-stacking clause, are printed",
    /CONSTRUCTS ONLY/i.test(notesOf("Rapid Repair")) && /does not stack/i.test(notesOf("Rapid Repair")));

  /* ── the arithmetic, as the applier does it ─────────────────────── */
  const resolve = (base, bump, cap) => normaliseHealingRate({
    kind: "healingRate", rate: "fastHealing",
    value: cap > 0 ? Math.min(base + bump, cap) : base + bump
  });
  eq("C3 an unbought Regenerate grants nothing", resolve(0, 0, 0), null);
  eq("C3b a bought one grants five", resolve(0, 5, 0)?.value, 5);
  eq("C3c Rapid Repair unwarped is one", resolve(1, 0, 5)?.value, 1);
  eq("C3d bought four times it reaches five", resolve(1, 4, 5)?.value, 5);
  eq("C3e AND CANNOT PASS THE PRINTED CEILING", resolve(1, 9, 5)?.value, 5);
  ok("C4 THE WARP IS FOLDED IN BEFORE THE ROW IS VALIDATED",
    /const rateSpec = normaliseHealingRate\(\{\s*\.\.\.effect,\s*value: rateCap > 0 \? Math\.min\(rateRaw, rateCap\) : rateRaw/
      .test(applier),
    "the order weaponDamageBonus and the resource drain both take");
  ok("C4b an unbought warp-only row is not announced as malformed",
    /if \(!effect\.fromWarp\) \{\s*lines\.push\(line\(`<em>\$\{spell\.name\} declares a malformed healing rate\./
      .test(applier),
    "announcing a choice as a fault trains readers to ignore the one message that means something");
  {
    const w = [{ mods: { healingRateBump: 1, healingRateMax: 5 } }];
    eq("C5 buying it four times adds four", aggregateWarpSelection(w, { "warp-0": 4 }).mods.healingRateBump, 4);
    eq("C5b while the ceiling is a state, not a purchase",
      aggregateWarpSelection(w, { "warp-0": 4 }).mods.healingRateMax, 5);
  }
}

/* ================================================================== *
 * D. THREE ROWS THAT FIRED ON A CRITICAL SUCCESS (R3)
 * ================================================================== */

for (const [name, degrees] of [
  ["Phantasmal Killer", ["critical", "success", "partial", "failure", "fumble"]],
  ["Portal Maelstrom", ["critical", "success", "failure", "fumble"]],
  ["Ramirez Rhythm", ["critical", "success", "failure", "fumble"]]
]) {
  // A LADDER AND A TERRAIN ROW ARE UNGATED BY CONSTRUCTION (3.609.0, block
  // 33's R2): the ladder reads its own rungs, and terrain lies on the Region.
  // Both are left out of the gated count; the ladders' Criticals are asserted
  // by verify-chapter10-331-340.
  eq(`D1 ${name} does nothing on a critical success`,
    onDegree(name, "critical").filter((r) => !["saveLadder", "difficultTerrain"].includes(r.kind)).length, 0,
    "every one of these pages says the target is unaffected");
  ok(`D1b ${name} prints every rung`, degrees.every((d) => saysOn(name, d)));
}
// RE-READ 3.609.0 (block 33's R2): the Fumble's "fleeing until the end of its
// next turn" is a row now, and the five rungs are a ladder rather than a note.
eq("D2 Phantasmal Killer's fear scales with the rung", JSON.stringify(
  rowsOf("Phantasmal Killer").filter((r) => r.kind === "condition" && r.condition === "frightened")
    .map((r) => `${r.onSave.join("/")}:${r.value}`)),
  JSON.stringify(["success:1", "partial/failure:2", "fumble:4"]));
ok("D2b and its five rungs are a ladder now",
  ["critical", "success", "partial", "failure", "fumble"].every((d) =>
    Object.prototype.hasOwnProperty.call(rowsOf("Phantasmal Killer").find((r) => r.kind === "saveLadder")?.ladder ?? {}, d)));
// RE-READ 3.609.0: Portal Maelstrom's saves are owed at the start of a turn,
// so nothing is laid at the cast — the prone that was is printed on its rung.
eq("D3 Portal Maelstrom lays no prone at the cast",
  JSON.stringify(rowsOf("Portal Maelstrom").find((r) => r.condition === "prone")?.onSave),
  JSON.stringify(undefined));
eq("D4 Ramirez Rhythm is slowed on a failure or a fumble",
  JSON.stringify(rowsOf("Ramirez Rhythm").find((r) => r.condition === "slowed")?.onSave),
  JSON.stringify(["failure", "fumble"]));
eq("D4b and prone only on a fumble",
  JSON.stringify(rowsOf("Ramirez Rhythm").find((r) => r.condition === "prone")?.onSave),
  JSON.stringify(["fumble"]));

/* ================================================================== *
 * E. A WARP WITH SOMETHING TO RAISE (R4), AND A GATED PENALTY (R9)
 * ================================================================== */

eq("E1 OBJECT PROWESS HAS ROWS FOR ITS LIVE WARP TO RAISE",
  JSON.stringify(rowsOf("Object Prowess").filter((r) => r.kind === "bonus").map((r) => r.slot).sort()),
  JSON.stringify(["arcana", "crafting", "nature", "occultism", "religion"]),
  "the five skills the Create action varies over; the warp's bonusValue pointed at nothing");
ok("E1b all +2 status, as printed",
  rowsOf("Object Prowess").filter((r) => r.kind === "bonus")
    .every((r) => r.value === 2 && r.bonusType === "status"));
eq("E1c and the warp is still live", warpsOf("Object Prowess")[0]?.mods?.bonusValue, 1);

eq("E2 QUALM PENALISES BY DEGREE", JSON.stringify(
  rowsOf("Qualm").filter((r) => r.kind === "bonus" && r.slot === "allSkills")
    .map((r) => `${r.onSave.join("/")}:${r.value}`)),
  JSON.stringify(["success:-1", "failure:-2", "fumble:-4"]));
ok("E2b and the same on the attack pool",
  rowsOf("Qualm").filter((r) => r.slot === "attack").length === 3);
eq("E2c the success penalty lasts a round, as printed",
  rowsOf("Qualm").find((r) => r.slot === "allSkills" && r.onSave?.includes("success"))?.duration,
  "1 round");
ok("E2d a critical is unaffected", saysOn("Qualm", "critical") && onDegree("Qualm", "critical").length === 0);
ok("E2e and what \"all actions\" was read as is said out loud",
  /every skill and the attack pool/i.test(notesOf("Qualm")));

/* ================================================================== *
 * F. THE SOUL DRAIN, AND WHAT STAYED PRINTED
 * ================================================================== */

eq("F1 ORB OF THE VOID DRAINS SOULS", JSON.stringify(
  rowsOf("Orb Of The Void").filter((r) => r.kind === "resource")
    .map((r) => `${r.onSave.join("/")}:${r.formula}`)),
  JSON.stringify(["failure:2d8", "fumble:4d8"]));
ok("F1b through the resource rail, so Chapter 4's below-zero charge applies",
  rowsOf("Orb Of The Void").filter((r) => r.kind === "resource")
    .every((r) => r.resource === "soulDrain"));
ok("F2 and undead being unaffected is printed", /Undead are unaffected/i.test(notesOf("Orb Of The Void")));

/*
 * F3 PINS WHAT WAS DELIBERATELY NOT BUILT, with the reason, so a later
 * reader finds a decision rather than a gap. Every one of these is a
 * mechanism this system does not have, not a spell nobody got to.
 */
ok("F3 Pale Flame says why its recurring damage is by hand",
  /both[\s\S]{0,80}recurring rails[\s\S]{0,90}area mechanisms/i.test(notesOf("Pale Flame")),
  "a region's ladder and an emanation's per-turn effect; this spell targets one creature");
ok("F3b Resist Energy says the CHOICE is what is missing, not the resistance",
  /has no chooser/i.test(notesOf("Resist Energy")));
ok("F3c and its second-type warp is inert rather than wired to a key nobody reads",
  Object.keys(warpsOf("Resist Energy")[1]?.mods ?? {}).length === 0);
ok("F4 Polar Ray's soul-drain rider is printed", /Soul Drain/i.test(notesOf("Polar Ray")));
// RE-READ 3.609.0 (block 33's R2): the attack gate watches it now.
ok("F5 Painful Rebuke bites through the attack gate",
  rowsOf("Painful Rebuke").filter((r) => r.kind === "rebuke").length === 3);

/* ================================================================== *
 * L. NOTHING THIS BLOCK AUTHORED IS UNREACHABLE
 * ================================================================== */

{
  const BLOCK = ["Regenerate", "Rapid Repair", "Phantasmal Killer", "Portal Maelstrom",
    "Ramirez Rhythm", "Object Prowess", "Prayer", "Power Crystal", "Qualm", "Orb Of The Void",
    "Pale Flame", "Resist Energy", "Polar Ray", "Painful Rebuke"];
  eq("L1 every spell this block touched is in the pack",
    BLOCK.filter((n) => sysOf(n) === null).join(", "), "");
  const unknownKind = [];
  const unknownCondition = [];
  const strayKey = [];
  for (const name of BLOCK) {
    for (const row of rowsOf(name)) {
      if (!HANDLED_EFFECT_KINDS.includes(row.kind)) unknownKind.push(`${name}: ${row.kind}`);
      if (row.kind === "condition" && !CONDITIONS[row.condition]) {
        unknownCondition.push(`${name}: ${row.condition}`);
      }
    }
    const agg = aggregateWarpSelection(warpsOf(name),
      Object.fromEntries(warpsOf(name).map((w, i) => [`warp-${i}`, 1])));
    for (const [i, w] of warpsOf(name).entries()) {
      for (const key of Object.keys(w.mods ?? {})) {
        if (!(key in agg.mods)) strayKey.push(`${name} warp${i}: ${key}`);
      }
    }
  }
  eq("L2 every kind is one the applier handles", unknownKind.join("; "), "");
  eq("L3 every condition named is a real one", unknownCondition.join("; "), "");
  /*
   * L4 IS THE CHECK THAT CAUGHT ME. An earlier draft of the author
   * script gave Resist Energy's warp `defenceChoices`, a key the
   * aggregator has never read — the exact defect this block's audit
   * found in Graham's pack, committed by me three hours after writing it
   * up. Found by this census, not by noticing.
   */
  eq("L4 NO WARP NAMES A KEY THE AGGREGATOR DROPS", strayKey.join("; "), "");
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-chapter10-301-310: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter10-301-310: OK — ${checks} checks. `
  + "Prayer reaches both sides of its own area, and three more rows stopped firing on a critical.\n");
