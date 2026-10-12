#!/usr/bin/env node
/**
 * verify-chapter10-291-300 — the Grimoire, Levitate to Nondetection.
 *
 * NEW at 3.591.0. Graham's R1-R10 of 25 September 2026, "your
 * recommendations", plus the Regeneration rules he supplied for R9.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BLOCK'S FINDING IS THAT FOUR RAILS EXISTED AND NOTHING DROVE THEM.
 *
 * 36 of the block's 62 entries carried no effect rows. Half of those are
 * genuinely narrative and a note is the honest automation. The other
 * half were waiting on machinery that had been sitting there for months:
 *
 *   THE REGENERATION RATE. `injury-workflow.mjs` has read a
 *   `regeneration` flag against the Injured condition on its ten-minute
 *   cadence since it was written, and its own comment says it reads it
 *   "FROM THE SAME PLACE THE HP HALF READS THEM (documents/combat.mjs,
 *   Phase 1)". Phase 1 summed `fastHealing` and nothing else. So a
 *   creature with Regeneration 5 healed its injuries on the right clock
 *   and NO HIT POINTS AT ALL. Measured live in Graham's world on 25
 *   September: the shipped sum answered 0 where the fixed one answers 5,
 *   and the injury card read "Regeneration 5 over 1 ten-minute period —
 *   Injured 3 → 0" in the same breath.
 *
 *   THE QUALITY TIERS. `QUALITY_TIERS` has implemented expert, master
 *   and legendary for months — the per-die weapon damage reaches the
 *   damage roll through `attack.mjs`, measured live at 0/1/2/3. The
 *   spell that grants them had no row and both its warps were inert.
 *
 *   `grantAbility` AND `heldBonus`, built for earlier blocks, unused by
 *   Nightvision and Natural Defence — the second a PP 0 cantrip.
 *
 * Nothing here needed inventing. It needed connecting.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND ONE SPELL DID NOTHING AT ALL. Massacre, at PP 18, carried
 * `defence: "Fortitude"` without the word "basic" and no effect rows, so
 * `isBasic` was false, its 9d6 never rolled, and the card said nothing
 * happened. It is also not a basic save: the page gives the FULL printed
 * pool on a SUCCESS and doubles it on a failure.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A CORRECTION I MADE TO MY OWN AUDIT, recorded because the audit is
 * what Graham answered. R6 listed MARK OF FAITH as a `ward` and it is
 * not one: a ward gives the WARDED creature a bonus against named
 * enemies and fills their uuids at the cast, while Mark Of Faith gives
 * the CASTER a bonus against the marked creature and the marked creature
 * a penalty against the CASTER. Section M pins that it stayed a note.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  HEALING_RATES, INJURY_CADENCE, healingRateLine, healingRateName, normaliseHealingRate
} from "../module/magic/healing-rate.mjs";
import {
  normaliseSecondaryDamage, secondaryDamageLine, secondaryReaches
} from "../module/magic/secondary-damage.mjs";
import {
  GRANTABLE_QUALITIES, itemQualityLine, normaliseItemQuality, qualityGrantFor, qualityRank
} from "../module/magic/item-quality-grant.mjs";
import { QUALITY_TIERS, computeWeaponModifiers } from "../module/item-quality.mjs";
import { normaliseSaveLadder, saveLadderOutcome } from "../module/magic/save-ladder.mjs";
import { aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import { valueFromMargin } from "../module/magic/condition-timing-rules.mjs";
import {
  RELIEVABLE, normaliseConditionRelief, reliefChoices, reliefNeedsPrompt
} from "../module/magic/condition-relief.mjs";
import { declaredDegrees, effectAppliesOnDegree } from "../module/magic/spell-degrees.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { parseSpellDuration } from "../module/magic/effect-duration.mjs";
import { bonusTargetFor } from "../module/magic/spell-effects.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { SELF_ENDING } from "./lib/self-ending-conditions.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const equal = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want),
    `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const code = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
// COMMENTS STRIPPED BEFORE ASKING SOURCE ANYTHING — a comment about a
// defect always contains the defect.
const codeOnly = (...p) => code(...p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.set(String(value.name).trim().toLowerCase(), value);
    }
  } finally { await db.close(); }
  return out;
}
const spells = await spellsPack();
ok("A0 the spells pack could be read", spells !== null);

const sysOf = (n) => spells?.get(n.toLowerCase())?.system ?? null;
const rowsOf = (n) => sysOf(n)?.effects ?? [];
const rowOf = (n, kind) => rowsOf(n).find((r) => r.kind === kind) ?? null;
const rowsKind = (n, kind) => rowsOf(n).filter((r) => r.kind === kind);
const warpsOf = (n) => sysOf(n)?.warps ?? [];
const notesOf = (n) => rowsKind(n, "note").map((r) => String(r.text ?? "")).join(" ");
const onDegree = (n, degree) => rowsOf(n)
  .filter((r) => r.kind !== "note" && effectAppliesOnDegree(r, degree));
/** Notes gated to a degree count as a printed rung. */
const saysOn = (n, degree) => rowsKind(n, "note")
  .some((r) => Array.isArray(r.onSave) && r.onSave.includes(degree));

const applier = codeOnly("module", "magic", "spell-effects.mjs");
const combat = codeOnly("module", "documents", "combat.mjs");
const cast = codeOnly("module", "magic", "cast-workflow.mjs");

/* ================================================================== *
 * A. THE REGENERATION RATE, AND THE DRIVER IT NEVER HAD
 * ================================================================== */

ok("A1 \"healingRate\" is declared handled", HANDLED_EFFECT_KINDS.includes("healingRate"));
ok("A2 the applier has a case for it", applier.includes('case "healingRate": {'));

/*
 * A3 IS THE DEFECT. Phase 1 named one flag; the injury half named two,
 * and said in a comment that both were read in the same place.
 */
ok("A3 PHASE 1 SUMS THE REGENERATION RATE TOO",
  /healingRate\("regeneration"\)/.test(combat) && /healingRate\("fastHealing"\)/.test(combat),
  "measured live: the shipped sum answered 0 for a Regeneration 5 effect while the "
  + "injury card read \"Regeneration 5 over 1 ten-minute period\" in the same breath");
ok("A3b and both go into the same heal",
  /const fastHealing = fastHealingRate \+ regenerationRate;/.test(combat),
  "page 193: a creature with fast healing OR REGENERATION regains the listed amount each round");
ok("A3c the card names whichever granted it",
  /regenerationRate && fastHealingRate/.test(combat) && /"Regeneration"/.test(combat),
  "a player whose sheet says Regeneration should not read \"Fast Healing\"");
ok("A3d the injury half still reads both rates on their own cadences",
  /rates\.fastHealing[\s\S]{0,200}FAST_HEALING_INJURY_SECONDS/.test(
    codeOnly("module", "injury-workflow.mjs"))
  && /rates\.regeneration[\s\S]{0,200}REGENERATION_INJURY_SECONDS/.test(
    codeOnly("module", "injury-workflow.mjs")),
  "every hour against every ten minutes — a factor of six, which is why they are two flags");

ok("A3e a SUPPRESSED healing effect grants no rate",
  /\.filter\(\(e\) => !e\.disabled\)[\s\S]{0,200}?getFlag\?\.\(SYSTEM_ID, flag\)/.test(combat),
  "the shape Indomitable's suppression rail exists to respect");

equal("A4 the grantable rates are the two the readers read",
  JSON.stringify(HEALING_RATES), JSON.stringify(["fastHealing", "regeneration"]));
equal("A4b and each names its injury cadence",
  `${INJURY_CADENCE.fastHealing}|${INJURY_CADENCE.regeneration}`,
  "every hour|every 10 minutes");
{
  const spec = normaliseHealingRate({ kind: "healingRate", rate: "regeneration", value: 5 });
  equal("A5 a rate normalises", JSON.stringify(spec), JSON.stringify({ rate: "regeneration", value: 5, label: "" }));
  equal("A5b a rate nobody reads is refused",
    normaliseHealingRate({ kind: "healingRate", rate: "regen", value: 5 }), null,
    "a third spelling for a thing two files agree on would be silent");
  equal("A5c a rate of zero is not a grant",
    normaliseHealingRate({ kind: "healingRate", rate: "fastHealing", value: 0 }), null);
  equal("A5d nor a negative one",
    normaliseHealingRate({ kind: "healingRate", rate: "fastHealing", value: -3 }), null);
  equal("A5e the wrong kind is not this one",
    normaliseHealingRate({ kind: "heal", rate: "fastHealing", value: 5 }), null);
  equal("A5f the name is the reader's spelling, not the row's",
    normaliseHealingRate({ kind: "healingRate", rate: "REGENERATION", value: 2 })?.rate, "regeneration");
  equal("A6 the card says both halves of what it does",
    /HP at the start of each of their turns/.test(healingRateLine(spec, "X"))
    && /Injured condition every 10 minutes/.test(healingRateLine(spec, "X")), true);
  equal("A6b and calls it by its own name", healingRateName("regeneration"), "Regeneration");
  equal("A6c the other one too", healingRateName("fastHealing"), "Fast Healing");
}

/* ── Metabolism ─────────────────────────────────────────────────── */
{
  const row = rowOf("Metabolism", "healingRate");
  ok("A7 METABOLISM GRANTS REGENERATION 5", normaliseHealingRate(row) !== null);
  equal("A7b regeneration, not fast healing", row?.rate, "regeneration",
    "identical for hit points and six times apart on injuries");
  equal("A7c of five", row?.value, 5);
  /*
   * A8 IS THE CHOICE IN THE BASE TEXT. "Restore 1 point of the dazed,
   * injured OR weakened condition" — three rows would take down all
   * three, and one row naming one of them would flatten a choice the
   * page makes.
   */
  const relief = normaliseConditionRelief(rowOf("Metabolism", "conditionRelief"));
  ok("A8 its relief offers the three the page names",
    relief !== null && reliefNeedsPrompt(relief)
    && ["dazed", "injured", "weakened"].every((c) => reliefChoices(relief).includes(c)));
  equal("A8b and all three are relievable at all",
    ["dazed", "injured", "weakened"].every((c) => Boolean(RELIEVABLE[c])), true);
  equal("A8c a row with no choices still offers its one condition",
    JSON.stringify(reliefChoices(normaliseConditionRelief(
      { kind: "conditionRelief", condition: "fatigued", amount: 1 }))),
    JSON.stringify(["fatigued"]),
    "the 150-odd relief rows that came before must be untouched");
  equal("A8d and a WARP's \"instead\" still wins over the row's own offer",
    JSON.stringify(reliefChoices(relief, { reliefConditions: ["soulDrain"] })),
    JSON.stringify(["soulDrain"]));
  ok("A9 the bleed reduction and the regrown limbs are printed, not pretended",
    /bleeding RESULTS/i.test(notesOf("Metabolism")) && /regrow/i.test(notesOf("Metabolism")));
}

/* ================================================================== *
 * B. MASSACRE — AN 18 PP SPELL THAT DID NOTHING
 * ================================================================== */

{
  const spec = normaliseSaveLadder(rowOf("Massacre", "saveLadder"));
  ok("B1 MASSACRE HAS A LADDER AT LAST", spec !== null,
    "`defence: \"Fortitude\"` without \"basic\" meant isBasic was false and its 9d6 never rolled");
  equal("B1b a critical is unaffected", spec?.ladder?.critical, "");
  equal("B1c A SUCCESS TAKES THE FULL PRINTED POOL", spec?.ladder?.success, "9d6",
    "not half of it — this is not a basic save, whatever the header's silence suggests");
  equal("B1d and a failure doubles it", spec?.ladder?.failure, "18d6");
  equal("B1e in essence", spec?.damageType, "essence");
  /*
   * B2 IS THE RUNG THAT IS NOT DAMAGE. "The creature dies" — four words,
   * and the only rung in the Grimoire that is an outcome rather than a
   * number.
   */
  equal("B2 THE FUMBLE KILLS", JSON.stringify(spec?.slaysOn), JSON.stringify(["fumble"]));
  ok("B2b and a killing rung is never \"harmless\" for having no dice",
    saveLadderOutcome(spec, "fumble").slays === true
    && saveLadderOutcome(spec, "fumble").harmless === false,
    "reading \"no dice\" as \"unaffected\" would have made the worst rung the best one");
  ok("B2c while an empty rung with no kill still is harmless",
    saveLadderOutcome(spec, "critical").harmless === true);
  ok("B2d an unknown degree is dropped rather than voiding the ladder",
    JSON.stringify(normaliseSaveLadder({ kind: "saveLadder", damageType: "fire",
      ladder: { success: "1d6" }, slaysOn: ["nonsense"] })?.slaysOn) === "[]");
  /*
   * B3 IS HOW IT KILLS. There is no separate "dead" condition —
   * `isDead` is deliberately one question with one answer — so a second
   * death path would be a second thing to keep in step.
   */
  ok("B3 THE KILL IS SPELLED THE WAY THIS SYSTEM SPELLS DEATH",
    /if \(outcome\.slays\) \{[\s\S]{0,300}?toggleStatusEffect\("dying", \{ value: actorDeathState\(target\) \+ 1 \}\)/.test(cast),
    "the same three lines a Death critical uses in attack-workflow");
  ok("B3b and the corpse is reaped",
    /if \(outcome\.slays\) \{[\s\S]{0,400}?reapDead\(target/.test(cast));
  ok("B4 the backlash and the level gate are printed rather than pretended",
    /BACKLASH/i.test(notesOf("Massacre")) && /17th level/i.test(notesOf("Massacre")),
    "nothing reads whether a spell killed anyone, or a target's level against a ceiling");
}

/* ================================================================== *
 * C. NIGHTMARE — THE SEVENTH FLAT UNGATED ROW
 * ================================================================== */

{
  equal("C1 A CRITICAL SUCCESS IS NO LONGER FATIGUED", onDegree("Nightmare", "critical").length, 0,
    "the rung that grants a WEEK'S IMMUNITY used to apply fatigued 1");
  equal("C1b nor a plain success", onDegree("Nightmare", "success").length, 0,
    "\"suffers no adverse effects other than unpleasant memories\"");
  equal("C1c a failure is fatigued", onDegree("Nightmare", "failure").length, 1);
  equal("C1d and so is a fumble", onDegree("Nightmare", "fumble").length, 1);
  const row = rowOf("Nightmare", "condition");
  equal("C2 SCALED BY THE MARGIN", row?.valuePerMargin, 1,
    "\"fatigued 1 per point of failure\"");
  equal("C2b with the printed ceiling", row?.valueMax, 5, "\"(max 5)\"");
  equal("C2c and the condition is fatigued", row?.condition, "fatigued");
  ok("C3 all four rungs are said", ["critical", "success", "failure", "fumble"]
    .every((d) => saysOn("Nightmare", d)));
  ok("C4 the soul drain and the save modifiers are printed",
    /Soul Drain 20/i.test(notesOf("Nightmare")) && /Study Target/i.test(notesOf("Nightmare")),
    "it lifts on a condition rather than on a clock");

  /* ── the arithmetic ─────────────────────────────────────────── */
  equal("C5 failed by 3, one per point", valueFromMargin(-3, 1, 5), 3);
  equal("C5b failed by 9 clamps to the printed five", valueFromMargin(-9, 1, 5), 5);
  equal("C5c FAILED BY ONE STILL COSTS A POINT", valueFromMargin(-1, 2, 5), 1,
    "at one per TWO, failing by one floors to zero without the floor \u2014 and zero is a "
    + "condition applied and instantly gone. A rate of ONE cannot witness this: floor(1/1) "
    + "is already 1, which is how the first draft of this check survived a mutation that "
    + "removed the floor outright.");
  equal("C5d AN UNMEASURED MARGIN IS NOT A MARGIN OF ZERO", valueFromMargin(null, 1, 5), null,
    "Number(null) is 0 and 0 is finite; the two must not be one answer");
  equal("C5e nor an absent one", valueFromMargin(undefined, 1, 5), null);
  equal("C5f no printed ceiling is not a ceiling of zero", valueFromMargin(-20, 1, 0), 20,
    "the shape landedTier had to get right at 3.524.0");
  equal("C5g a rate of one per two", valueFromMargin(-7, 2, 5), 3);
  equal("C5h a step of zero is refused", valueFromMargin(-7, 0, 5), null);
  /*
   * C6 GUARDS THE SAME LATENT TRAP `roundsPerMargin` has: the floor
   * means a row gated onto a SUCCESS would silently get the minimum
   * rather than refusing, because a success has no failure margin.
   */
  ok("C6 EVERY margin-scaled VALUE is gated to failure or fumble", (() => {
    const stray = [];
    for (const [, doc] of spells ?? []) {
      for (const row2 of doc?.system?.effects ?? []) {
        if (row2?.valuePerMargin == null) continue;
        const gates = declaredDegrees(row2) ?? [];
        if (gates.some((g) => g !== "failure" && g !== "fumble")) stray.push(`${doc.name}: ${JSON.stringify(gates)}`);
      }
    }
    return stray.length === 0;
  })(), "a success has no failure margin, and the floor would hand it the minimum");
  ok("C6b the applier refuses an unmeasured margin out loud",
    /valuePerMargin[\s\S]{0,420}?no save margin to scale/.test(applier),
    "falling back to the authored value would give the condition a size the page never granted");
}

/* ================================================================== *
 * D. ONE SAVE, TWO DAMAGE POOLS
 * ================================================================== */

{
  const meteor = normaliseSecondaryDamage(sysOf("Meteor Swarm"));
  ok("D1 METEOR SWARM HAS ITS MISSING HALF", meteor !== null,
    "the pack had 6d10 bludgeoning; the 14d6 fire, in the larger radius, was absent");
  equal("D1b fourteen d6", meteor?.formula, "14d6");
  equal("D1c of fire", meteor?.type, "fire");
  equal("D1d reaching everyone", JSON.stringify(meteor?.onlyCreatureTypes), "[]");

  const sun = normaliseSecondaryDamage(sysOf("Sunburst"));
  ok("D2 SUNBURST'S 8d4 IS ROLLED AT LAST", sun !== null,
    "its baseDamage has read \"1d10/1d4\" since it was entered — two base dice in one field, read by nothing");
  equal("D2b against undead only", JSON.stringify(sun?.onlyCreatureTypes), JSON.stringify(["undead"]));
  ok("D2c so it spares a humanoid", !secondaryReaches(sun, ["humanoid"]));
  ok("D2d and reaches an undead", secondaryReaches(sun, ["undead"]));
  const umbral = normaliseSecondaryDamage(sysOf("Umbral Blast"));
  ok("D3 UMBRAL BLAST'S TOO", umbral !== null);
  ok("D3b reaching everyone, as its page says", secondaryReaches(umbral, ["humanoid"]));

  equal("D4 a pool with no dice is refused",
    normaliseSecondaryDamage({ secondaryDamage: { formula: "lots", type: "fire" } }), null);
  equal("D4b a pool with no TYPE is refused",
    normaliseSecondaryDamage({ secondaryDamage: { formula: "8d4" } }), null,
    "an empty type means \"the weapon's own\" elsewhere");
  equal("D4c a spell with none has none", normaliseSecondaryDamage({}), null);

  ok("D5 THE SAME SAVE SCALES BOTH POOLS",
    /secondaryBase \* bs\.damageMultiplier/.test(cast),
    "\"the saving throw applies to both\" — not a second save, and not a flat rider");
  // RE-READ 3.609.0: the pool now rolls its own warp (block 33's R4) —
  // `secondaryFormula` is the declared dice plus `warpMods.secondaryDice`.
  ok("D5b rolled once, beside the primary",
    /const secondRoll = await new Roll\(secondaryFormula\)\.evaluate\(\);/.test(cast)
    && /const secondaryFormula = addDice\(secondary\.formula, warpMods\?\.secondaryDice\);/.test(cast));
  ok("D5c and resolved against defences on its own",
    /type: secondary\.type/.test(cast),
    "a creature resistant to fire and not to bludgeoning must take the two halves differently");
  /*
   * D5d ASKS WHETHER THE LINE IS REACHED, not whether the words are
   * present. Its first draft grepped for the sentence and survived a
   * mutation that put `if (false)` in front of it \u2014 defect shape (g),
   * presence measured instead of reachability, in a check written to
   * catch defect shape (f).
   */
  ok("D5d a pool with no basic save to scale it is SAID, not dropped",
    new RegExp("\\} else if \\(secondary\\) \\{[\\s\\S]{0,200}?\\n {4}lines\\.push\\(line\\("
      + "`<em>\\$\\{spell\\.name\\} declares secondary damage but has no basic save ").test(cast),
    "a fourth spell authored without the word would lose the pool in silence");
  ok("D6 all three carriers are basic saves, which is what makes D5d a guard rather than a fault",
    ["Meteor Swarm", "Sunburst", "Umbral Blast"]
      .every((n) => /basic/i.test(String(sysOf(n)?.defence ?? ""))));
}

/* ================================================================== *
 * E. AN ITEM MADE BETTER FOR A WHILE
 * ================================================================== */

ok("E1 \"itemQuality\" is declared handled", HANDLED_EFFECT_KINDS.includes("itemQuality"));
ok("E1b the applier has a case for it", applier.includes('case "itemQuality": {'));
{
  const row = rowOf("Masterwork Item", "itemQuality");
  const base = normaliseItemQuality(row);
  ok("E2 MASTERWORK ITEM GRANTS A TIER", base !== null);
  equal("E2b expert, unwarped", base?.quality, "expert");
  equal("E3 its master warp is wired", warpsOf("Masterwork Item")
    .find((w) => /master quality/i.test(String(w.text)))?.mods?.qualityTier, "master");
  equal("E3b and its legendary one", warpsOf("Masterwork Item")
    .find((w) => /legendary quality/i.test(String(w.text)))?.mods?.qualityTier, "legendary");
  equal("E3c a warp replaces the tier rather than stepping it",
    normaliseItemQuality(row, { qualityTier: "legendary" })?.quality, "legendary");
  /*
   * E3d IS THE CHECK E3a-c STEPPED OVER, and the sweep supplied it.
   *
   * The three above hand `{ qualityTier }` STRAIGHT to the reader, which
   * measures the reader and says nothing about whether a caster ticking
   * the warp on the cast dialog ever produces that object. They did not,
   * because `aggregateWarpSelection` had never heard of the key: offered
   * on the card, charged for, and dropped on the way to the applier.
   *
   * Found by `verify-warp-area` E5 and `verify-emanation` E2b, two
   * surveys of every mod key the pack authors against the ones the
   * aggregator reads \u2014 in the release whose own notes name "a
   * vocabulary entry with no driver" as this project's most-repeated
   * defect. Presence measured instead of reachability, one more time.
   */
  {
    /*
     * THE DEARER WARP IS LISTED FIRST, deliberately. Written the other
     * way round, "the last one read" and "the dearest" give the same
     * answer, and the check cannot see the difference it claims to
     * measure \u2014 which is how its first draft survived a mutation that
     * removed the ordering outright.
     */
    const both = aggregateWarpSelection(
      [{ mods: { qualityTier: "legendary" } }, { mods: { qualityTier: "master" } }],
      { "warp-0": 1, "warp-1": 1 });
    equal("E3d A TICKED WARP REACHES THE APPLIER, not just the reader",
      normaliseItemQuality(row, both.mods)?.quality, "legendary");
    equal("E3e and buying both gives the DEARER tier, not the last one read",
      both.mods.qualityTier, "legendary",
      "`targetCap`'s rule: these are offers, and the cheaper must not overwrite the dearer");
    equal("E3f while a caster who ticked nothing gets the base grant",
      normaliseItemQuality(row, aggregateWarpSelection([], {}).mods)?.quality, "expert");
  }
  /*
   * E4 IS THE VERB. "Improve an object's quality" — an item that is
   * already master must not become expert because a 6 PP spell was cast
   * on it.
   */
  equal("E4 IT RAISES, IT DOES NOT SET",
    JSON.stringify(qualityGrantFor(base, "master")),
    JSON.stringify({ quality: "master", raised: false, from: "master" }));
  equal("E4b and raises what it can", qualityGrantFor(base, "standard").quality, "expert");
  equal("E4c an unknown tier on the item is still raised", qualityGrantFor(base, "wibble").raised, true);
  equal("E4e AN ITEM WITH NO TIER AT ALL RESTORES TO STANDARD", qualityGrantFor(base, "").from, "standard",
    "`from` is written onto the flag and put back on the item at expiry, so an empty string "
    + "here would leave the sword wearing no tier at all");
  ok("E4d and the card says so when it does nothing",
    /already/.test(itemQualityLine(qualityGrantFor(base, "master"), "X")));
  equal("E5 a tier nobody implements is refused",
    normaliseItemQuality({ kind: "itemQuality", quality: "shiny" }), null);
  equal("E5b the grantable tiers are the ones QUALITY_TIERS implements",
    GRANTABLE_QUALITIES.every((q) => Boolean(QUALITY_TIERS[q])), true);
  equal("E5c and rank follows the tier order",
    `${qualityRank("standard")}${qualityRank("expert")}${qualityRank("master")}${qualityRank("legendary")}`,
    "0123");
  /*
   * E6 IS WHY THE GRANT IS WORTH MAKING AT ALL — measured live: the
   * per-die damage bonus reaches the damage roll through attack.mjs.
   */
  equal("E6 the tiers really move a weapon's damage",
    GRANTABLE_QUALITIES.map((q) => computeWeaponModifiers(q, null, []).damageBonusPerDie).join(""),
    "123", "measured live in Graham's world: 0/1/2/3 for standard through legendary");
  ok("E7 THE OLD TIER TRAVELS WITH THE GRANT, because the spell ends",
    /itemQuality: \{ itemId: qItemId, from: grant\.from, to: grant\.quality \}/.test(applier),
    "reading the tier back at expiry would find the spell's own and leave it there for good");
  ok("E7b and it is put back when the effect goes",
    /itemQuality[\s\S]{0,400}?quality\.from \|\| "standard"/.test(applier));
  ok("E7c but only if the item still wears what this spell gave it",
    /String\(item\.system\?\.quality \?\? ""\) === String\(quality\.to \?\? ""\)/.test(applier),
    "a second Masterwork, or a GM's own upgrade, must not be undone by the first spell ending");
}

/* ================================================================== *
 * F. THE RAILS THAT EXISTED AND WERE NOT USED
 * ================================================================== */

{
  const row = rowOf("Nightvision", "grantAbility");
  ok("F1 NIGHTVISION GRANTS NIGHTVISION", row !== null,
    "grantAbility was built at 3.587.0 for Darkvision and the ability is in the pack");
  equal("F1b by name", row?.ability, "Nightvision");

  /*
   * F2 IS A CORRECTION, AND THE SECOND ONE IN THIS FILE.
   *
   * R6 named NATURAL DEFENCE among the spells whose rails already
   * existed, and I gave it a `heldBonus` row with a note saying its
   * CL 10 step had to be "raised by hand, since a held bonus carries no
   * caster-level step".
   *
   * Every word of that note was wrong about the system it was written
   * into. Natural Defence has had its own workflow since 3.560.0 \u2014
   * `magic/natural-defence-workflow.mjs`, a 43-check harness, a reaction
   * cast, a declared somatic component, a typed resistance modifier that
   * reports whether it ACTUALLY landed rather than whether it was
   * printed, and `naturalDefenceSaveBonus`, which is the caster-level
   * step I said was manual. `verify-natural-defence` C5 has said since
   * then that the absent row is CORRECT RATHER THAN MISSING, and that
   * check is what caught this, in the full sweep, on the afternoon the
   * row was authored.
   *
   * THIRD TIME IN TWO BLOCKS (Heal's warp and Indomitable's base were
   * the others). An absent row is one of the commonest shapes a finished
   * decision takes, and the evidence lives in a check rather than in the
   * pack \u2014 so the pack alone cannot tell you it was a decision.
   */
  equal("F2 NATURAL DEFENCE CARRIES NO EFFECT ROW, AND THAT IS THE DECISION",
    rowsOf("Natural Defence").length, 0,
    "its whole mechanic is the card offer the workflow makes; a heldBonus row beside it "
    + "would be a second, worse copy of a bonus that already steps with caster level");
  ok("F2b and the workflow that IS the mechanism is still wired",
    /naturalDefenceSaveBonus\(/.test(codeOnly("module", "magic", "natural-defence-workflow.mjs")),
    "the check that caught the mistake would pass on a spell nothing implemented at all");

  equal("F3 LONG STRIDE'S +10 LANDS ON SPEED", rowOf("Long Stride", "bonus")?.slot, "speed");
  equal("F3b ten feet of it", rowOf("Long Stride", "bonus")?.value, 10);
  equal("F3c status-typed", rowOf("Long Stride", "bonus")?.bonusType, "status");
  ok("F3d and speed is a slot a bonus can land on", bonusTargetFor("speed") !== null);

  {
    const c = rowOf("Mind Blank", "conditional");
    equal("F4 MIND BLANK WARDS THE MIND", c?.grants?.[0]?.value, 4);
    equal("F4b status-typed", c?.grants?.[0]?.type, "status");
    equal("F4c on saves", JSON.stringify(c?.grants?.[0]?.when?.checkTypes), JSON.stringify(["save"]));
    equal("F4d against mental effects", JSON.stringify(c?.grants?.[0]?.when?.traits), JSON.stringify(["mental"]));
    ok("F4e and its counter is printed", /counteract/i.test(notesOf("Mind Blank")));
  }
}

/* ================================================================== *
 * M. THE CORRECTION I MADE TO MY OWN AUDIT
 * ================================================================== */

/*
 * R6 listed MARK OF FAITH among the five spells whose rails already
 * existed, and named `ward`. It is not a ward. A ward gives the WARDED
 * creature a bonus against named enemies and fills their uuids at the
 * cast; Mark Of Faith gives the CASTER a bonus against the marked
 * creature and the marked creature a penalty against the CASTER — the
 * mirror in one half and a conditional on a non-target in the other.
 * `conditional` fills no uuids at all.
 *
 * Pinned so the correction is a decision a later release can read rather
 * than a promise that quietly went missing.
 */
ok("M1 MARK OF FAITH IS A NOTE, AND THAT IS A CORRECTION",
  rowsOf("Mark Of Faith").every((r) => r.kind === "note"),
  "the audit called it a ward; a ward runs the other way");
ok("M1b and it says which halves are by hand",
  /by hand/i.test(notesOf("Mark Of Faith")) && /FOR YOU ONLY/i.test(notesOf("Mark Of Faith")),
  "light is a property of the scene rather than of a viewer");
ok("M1c AND THE SECOND CORRECTION IS NATURAL DEFENCE (see section F)",
  rowsOf("Natural Defence").length === 0,
  "R6 named it a rail waiting to be used; it was a finished spell with its own workflow");
ok("M2 Long Arm and Lighten Object were left alone on purpose",
  rowsKind("Long Arm", "bonus").length === 0 && rowsKind("Lighten Object", "bonus").length === 0,
  "reach and ACP are both ASSIGNED during derivation; making them additive touches every "
  + "character in the world and wants its own harness and live test (R8)");

/* ================================================================== *
 * G. MAGE ARMOUR, AND THE FIVE PRINTED LADDERS
 * ================================================================== */

{
  // REBUILT AT 3.617.2 (Graham, 4 October 2026: MA1–MA4). The 3.591.0 row
  // was a status bonus to the Bonus DR pool, which ADDED to worn armour and
  // ignored BSB — R5 asked for the BSB scaling and it shipped as a note.
  // Mage Armour is now Base DR armour on the Bracers' channel; the rule is
  // run in verify-mage-armour.
  const armour = rowsKind("Mage Armour", "spellArmour")[0] ?? null;
  ok("G1 MAGE ARMOUR IS ARMOUR: a spellArmour row, not a bonus that adds", armour !== null
    && rowsKind("Mage Armour", "bonus").length === 0,
    "the 3.591.0 status bonus stacked with worn armour and ignored BSB");
  equal("G1b Armour DR 1 with 20 HP, as printed", `${armour?.baseDR}/${armour?.hp}`, "1/20");
  ok("G1c and dr is a slot a bonus can land on", bonusTargetFor("dr") !== null);
  equal("G2 ITS +4 PP WARP NOW HAS A ROW TO RAISE", warpsOf("Mage Armour")
    .find((w) => /DR increases by \+1/i.test(String(w.text)))?.mods?.bonusValue, 1,
    "the key existed and pointed at nothing — the Divine Might shape");
  ok("G3 the caster-level ladder and the hour's lockout are rows, not notes",
    armour?.hpStep?.every === 4 && armour?.multiplierStep?.every === 6 && armour?.crStep?.every === 8
    && armour?.rigidAt === 10 && armour?.lockoutMinutes === 60 && !/BSB/i.test(notesOf("Mage Armour")),
    "a note saying \"add the BSB step by hand\" is the spell not being automated");

  /* ── the printed ladders ──────────────────────────────────────── */
  equal("G4 LULLABY'S PENALTY IS REAL", rowsKind("Lullaby", "bonus").length, 2);
  equal("G4b −2 on a failure", rowsKind("Lullaby", "bonus")
    .find((r) => effectAppliesOnDegree(r, "failure"))?.value, -2);
  equal("G4c −5 on a fumble", rowsKind("Lullaby", "bonus")
    .find((r) => effectAppliesOnDegree(r, "fumble"))?.value, -5);
  equal("G4d on Perception", rowOf("Lullaby", "bonus")?.slot, "perception");
  equal("G4e and a success takes nothing", onDegree("Lullaby", "success").length, 0);
  {
    const sustainWarp = warpsOf("Lullaby")
      .find((w) => /no longer have to Sustain/i.test(String(w.text)))?.mods ?? {};
    equal("G4f its sustain warp buys the duration outright", sustainWarp.durationText, "1 minute");
    /*
     * G4g WAS MISSING and `verify-warped-duration` S2 supplied it. A
     * duration warp on a SUSTAINED spell that does not also clear the
     * sustain charges PP for a length the caster still has to hold up
     * every turn \u2014 the contradiction that check exists to end. Only two
     * warps in the pack may leave a sustained spell sustained, and both
     * say so in their own wording; "you no longer have to Sustain the
     * Spell" says the opposite as plainly as English allows.
     */
    equal("G4g AND IT ENDS THE SUSTAIN IT BUYS OUT OF", sustainWarp.endsSustain, true,
      "durationText alone bought a length the caster was still sustaining through");
  }

  for (const [name, degrees] of [
    ["Maze", ["critical", "success", "failure", "fumble"]],
    ["Memory Lapse", ["success", "failure", "fumble"]],
    ["Mind Reading", ["critical", "success", "failure", "fumble"]],
    ["Mana Drain", ["critical", "success", "failure", "fumble"]]
  ]) {
    ok(`G5 ${name} prints every rung it has`, degrees.every((d) => saysOn(name, d)),
      "a printed rung still gates: the card shows the outcome that happened rather than all four");
    ok(`G5b ${name} applies no condition it cannot end`,
      rowsKind(name, "condition").length === 0,
      "a labyrinth, a forgotten hour, a borrowed spell pool — none is a condition this sheet holds");
  }
  ok("G6 Mana Drain says its mechanism is not automated",
    /NOT AUTOMATED/i.test(notesOf("Mana Drain")),
    "no pool in this system may be drawn on by a second caster");
}

/* ================================================================== *
 * L. NOTHING THIS BLOCK AUTHORED CAN OUTLIVE ITS SPELL
 * ================================================================== */

{
  const BLOCK = [
    "Long Stride", "Lullaby", "Mage Armour", "Make Whole", "Mana Drain", "Mark Of Faith",
    "Massacre", "Masterwork Item", "Maze", "Memory Lapse", "Metabolism", "Meteor Swarm",
    "Mind Blank", "Mind Reading", "Natural Defence", "Neutralise Poison", "Nightmare",
    "Nightvision", "Sunburst", "Umbral Blast"
  ];
  equal("L1 every spell this block touched is in the pack",
    BLOCK.filter((n) => sysOf(n) === null).join(", "), "");
  const unknownKind = [];
  const unknownCondition = [];
  const clockless = [];
  for (const name of BLOCK) {
    for (const row of rowsOf(name)) {
      if (!HANDLED_EFFECT_KINDS.includes(row.kind)) unknownKind.push(`${name}: ${row.kind}`);
      if (row.kind !== "condition") continue;
      if (!CONDITIONS[row.condition]) { unknownCondition.push(`${name}: ${row.condition}`); continue; }
      if (row.duration || row.durationRoll || row.roundsPerMargin) continue;
      if (SELF_ENDING.has(row.condition)) continue;
      if (parseSpellDuration(sysOf(name)?.duration) === null) clockless.push(`${name}: ${row.condition}`);
    }
  }
  equal("L2 every kind is one the applier handles", unknownKind.join("; "), "");
  equal("L3 every condition named is a real one", unknownCondition.join("; "), "");
  equal("L4 NO CONDITION IS APPLIED WITHOUT A CLOCK", clockless.join("; "), "",
    "a condition with no timing never comes off, and the first to notice is a GM three sessions later");
  equal("L5 Make Whole's warp has its key AND a row to raise",
    `${warpsOf("Make Whole").find((w) => /amount healed by 5/i.test(String(w.text)))?.mods?.healBonus}`
    + `|${rowsKind("Make Whole", "heal").length}`, "5|1",
    "unlike Heal's, which was left inert on purpose because its other half cannot be delivered");
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-chapter10-291-300: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter10-291-300: OK — ${checks} checks. `
  + "The regeneration rate heals hit points, Massacre does something, a second pool rides "
  + "the same save, and an item can be made better for a while.\n");
