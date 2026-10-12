#!/usr/bin/env node
/**
 * mutate-chapter10-291-300 — can the pages 291-300 checks fail?
 *
 * NEW at 3.591.0. SURVIVED and an unmatched anchor are both failures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS BLOCK'S DEFECTS WERE RAILS THAT EXISTED AND WERE NOT DRIVEN, so
 * the mutations that matter most are the ones that put the UNDRIVEN
 * version back and ask whether anything notices:
 *
 *   A3  Phase 1 sums `fastHealing` and nothing else, while the injury
 *       half goes on reading `regeneration` on its ten-minute clock —
 *       the shipped 3.590.0 behaviour, measured live in Graham's world
 *       on 25 September: 0 HP and a card reading "Regeneration 5".
 *   B1  Massacre back to `defence: "Fortitude"` with no ladder: an
 *       18 PP spell whose 9d6 never rolls.
 *   E7  the old tier NOT carried on the flag, so expiry reads the
 *       spell's own quality back and leaves it there for good.
 *
 * Four of them are SURVIVAL mutations in the strict sense: they leave
 * every name in place and remove only the driving. A vocabulary entry
 * with no driver is this project's most-repeated defect — three in two
 * blocks — and it is invisible to any check that greps for a name.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION P MUTATES THE PACK. Most of this block is authored data, and
 * a check that reads a pack field must be shown to fail when the field
 * is wrong or it is asserting that the file loaded.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const EFFECTS = at("magic", "spell-effects.mjs");
const CAST = at("magic", "cast-workflow.mjs");
const COMBAT = at("documents", "combat.mjs");
const INJURY = at("injury-workflow.mjs");
const RATE = at("magic", "healing-rate.mjs");
const SECOND = at("magic", "secondary-damage.mjs");
const QUALITY = at("magic", "item-quality-grant.mjs");
const TIERS = at("item-quality.mjs");
const TIMING = at("magic", "condition-timing-rules.mjs");
const LADDER = at("magic", "save-ladder.mjs");
const RELIEF = at("magic", "condition-relief.mjs");
const KINDS = at("magic", "effect-kinds.mjs");
const VERIFY = path.join(SYSTEM_ROOT, "tools", "verify-chapter10-291-300.mjs");

const MUTATIONS = [
  /* ── A: the regeneration rate ──────────────────────────────────── */
  { file: KINDS, name: "A: healingRate is authored but never declared handled",
    from: `  "healingRate",`, to: ``, breaks: "A1" },
  { file: COMBAT, name: "A THE ORIGINAL DEFECT: Phase 1 reads fastHealing and nothing else",
    from: `    const regenerationRate = healingRate("regeneration");`, to: `    const regenerationRate = 0;`,
    breaks: "A3" },
  { file: COMBAT, name: "A THE SURVIVAL SHAPE: the rate is read, named, and left out of the heal",
    from: `    const fastHealing = fastHealingRate + regenerationRate;`,
    to: `    const fastHealing = fastHealingRate;`, breaks: "A3b" },
  { file: COMBAT, name: "A: Regeneration is announced as Fast Healing",
    from: `        const source = regenerationRate && fastHealingRate
          ? "Fast Healing and Regeneration"
          : regenerationRate ? "Regeneration" : "Fast Healing";`,
    to: `        const source = "Fast Healing";`, breaks: "A3c" },
  { file: INJURY, name: "A: the two injury cadences collapse into one",
    from: `    rates.regeneration, delta + Number(carried.regen ?? 0), REGENERATION_INJURY_SECONDS);`,
    to: `    rates.regeneration, delta + Number(carried.regen ?? 0), FAST_HEALING_INJURY_SECONDS);`,
    breaks: "A3d" },
  { file: RATE, name: "A: a third spelling of the rate is accepted, and read by nobody",
    from: `  const rate = HEALING_RATES.find((r) => r.toLowerCase() === text(raw.rate).toLowerCase()) ?? null;
  if (!rate) return null;`,
    to: `  const rate = text(raw.rate) || null;
  if (!rate) return null;`, breaks: "A5b" },
  { file: RATE, name: "A: a rate of zero is granted",
    from: `  if (value <= 0) return null;`, to: `  ;`, breaks: "A5c" },
  { file: RATE, name: "A THE Number(): a negative rate heals backwards",
    from: `  if (value <= 0) return null;`, to: `  if (value === 0) return null;`, breaks: "A5d" },
  { file: RATE, name: "A: the polymorph kind is accepted here too",
    from: `  if (text(raw.kind) !== "healingRate") return null;`, to: `  ;`, breaks: "A5e" },
  { file: RATE, name: "A: the card promises hit points and forgets the injuries",
    from: "    + ` &mdash; ${spec.value} HP at the start of each of their turns, and `\n"
      + "    + `${spec.value} off the Injured condition ${INJURY_CADENCE[spec.rate]}.`;",
    to: "    + ` &mdash; ${spec.value} HP at the start of each of their turns.`;", breaks: "A6" },
  { file: RATE, name: "A: every rate is called Fast Healing",
    from: `  return rate === "regeneration" ? "Regeneration" : "Fast Healing";`,
    to: `  return "Fast Healing";`, breaks: "A6b" },
  { file: COMBAT, name: "A: a suppressed regeneration still heals",
    from: `    const healingRate = (flag) => Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .filter((e) => !e.disabled)`,
    to: `    const healingRate = (flag) => Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .filter(() => true)`, breaks: "A3e" },

  /* ── B: Massacre ───────────────────────────────────────────────── */
  { file: LADDER, name: "B: a killing rung with no dice is \"harmless\"",
    // RE-ANCHORED AT 3.606.0: the line grew three more terms for block 32.
    // RE-ANCHORED 3.609.0: a rung's recurring rider is not harmless either.
    from: `    harmless: !dice && !slays && !severity && dropsTo === null && !soulDestroyed && !persistent,`, to: `    harmless: !dice && !severity && dropsTo === null && !soulDestroyed && !persistent,`, breaks: "B2b" },
  { file: LADDER, name: "B: slaysOn accepts a degree that is not one",
    from: `    .filter((d) => DEGREE_ORDER.includes(d));`, to: `    .filter(Boolean);`, breaks: "B2d" },
  { file: LADDER, name: "B: the rung that kills is not the rung that was rolled",
    from: `  const slays = (spec.slaysOn ?? []).includes(rung);`,
    to: `  const slays = (spec.slaysOn ?? []).length > 0;`, breaks: "B2c" },
  { file: CAST, name: "B THE SILENT KILL: the death is printed and never applied",
    from: `        await target.toggleStatusEffect("dying", { value: actorDeathState(target) + 1 });
        const reaped = await reapDead(target, game.combat ?? null);`,
    to: `        const reaped = { removed: false };`, breaks: "B3" },
  { file: CAST, name: "B: the corpse stays in the initiative order",
    from: `        const reaped = await reapDead(target, game.combat ?? null);`,
    to: `        const reaped = { removed: false };`, breaks: "B3b" },

  /* ── C: the margin-scaled value ────────────────────────────────── */
  { file: TIMING, name: "C THE SIGN: a failure margin is read as if it were positive",
    from: `  const failedBy = Math.max(0, -Math.round(Number(margin)));`,
    to: `  const failedBy = Math.max(0, Math.round(Number(margin)));`, breaks: "C5" },
  { file: TIMING, name: "C: failing by one costs nothing",
    from: `  const wanted = Math.max(1, Math.floor(failedBy / step));`,
    to: `  const wanted = Math.floor(failedBy / step);`, breaks: "C5c" },
  { file: TIMING, name: "C THE Number(null): an unmeasured margin becomes a margin of zero",
    from: `  if (margin === null || margin === undefined || !Number.isFinite(Number(margin))) return null;
  const failedBy = Math.max(0, -Math.round(Number(margin)));`,
    to: `  if (!Number.isFinite(Number(margin))) return null;
  const failedBy = Math.max(0, -Math.round(Number(margin)));`, breaks: "C5d" },
  { file: TIMING, name: "C: no ceiling becomes a ceiling of zero",
    from: `  return ceiling > 0 ? Math.min(wanted, ceiling) : wanted;`,
    to: `  return Math.min(wanted, ceiling);`, breaks: "C5f" },
  { file: TIMING, name: "C: a step of zero divides by nothing",
    from: `  if (step < 1) return null;
  // AN UNMEASURED MARGIN IS NOT A MARGIN OF ZERO`, to: `  // AN UNMEASURED MARGIN IS NOT A MARGIN OF ZERO`,
    breaks: "C5h" },
  { file: EFFECTS, name: "C THE QUIET HALF: an unmeasured margin falls back to the authored value in silence",
    from: "            if (scaled === null) {\n"
      + "              lines.push(line(\n"
      + "                `<em>${spell.name}: no save margin to scale ${cond.label} from \u2014 `\n"
      + "                + `applied at ${conditionValue}.</em>`));\n"
      + "            } else {",
    to: "            if (scaled === null) {\n            } else {", breaks: "C6b" },

  /* ── D: two pools, one save ────────────────────────────────────── */
  { file: SECOND, name: "D: a prose \"formula\" is rolled",
    from: `  if (!formula || !DICE.test(formula)) return null;`, to: `  if (!formula) return null;`,
    breaks: "D4" },
  { file: SECOND, name: "D: a pool with no damage type is accepted",
    from: `  if (!type) return null;`, to: `  ;`, breaks: "D4b" },
  { file: SECOND, name: "D THE WILDCARD: an undead-only pool reaches everyone",
    from: `  if (!spec.onlyCreatureTypes.length) return true;`, to: `  return true;`, breaks: "D2c" },
  { file: SECOND, name: "D: the creature-type gate stops gating",
    from: `  return spec.onlyCreatureTypes.some((t) => theirs.has(t));`, to: `  return false;`,
    breaks: "D2d" },
  { file: CAST, name: "D THE SECOND SAVE: the second pool ignores the degree that was rolled",
    from: `          amount: Math.floor(secondaryBase * bs.damageMultiplier),`,
    to: `          amount: secondaryBase,`, breaks: "D5" },
  { file: CAST, name: "D: the second pool is folded into the first, and the resistances blur",
    from: `          type: secondary.type,
          creatureTypeSystem: ownedCreatureTypeSystem(target),`,
    to: `          type: damageType,
          creatureTypeSystem: ownedCreatureTypeSystem(target),`, breaks: "D5c" },
  { file: CAST, name: "D SILENT NOTHING: a pool with no basic save is dropped without a word",
    from: "    lines.push(line(`<em>${spell.name} declares secondary damage but has no basic save `",
    to: "    if (false) lines.push(line(`<em>${spell.name} declares secondary damage but has no basic save `",
    breaks: "D5d" },

  /* ── E: the item made better ───────────────────────────────────── */
  { file: at("magic", "spell-warp.mjs"),
    name: "E THE DRIVERLESS KEY: the aggregator forgets qualityTier again",
    from: `    if (m.qualityTier) {`, to: `    if (false) {`, breaks: "E3d" },
  { file: at("magic", "spell-warp.mjs"),
    name: "E: buying both tiers gives the LAST read rather than the dearest",
    from: `      if (order.indexOf(asked) > order.indexOf(String(mods.qualityTier ?? ""))) {
        mods.qualityTier = asked;
      }`, to: `      mods.qualityTier = asked;`, breaks: "E3e" },
  { file: KINDS, name: "E: itemQuality is authored but never declared handled",
    from: `  "itemQuality",`, to: ``, breaks: "E1" },
  { file: QUALITY, name: "E THE VERB: the spell SETS the tier instead of raising it",
    from: `  return want > have
    ? { quality: spec.quality, raised: true, from }
    : { quality: from, raised: false, from };`,
    to: `  return { quality: spec.quality, raised: true, from };`, breaks: "E4" },
  { file: QUALITY, name: "E THE EMPTY TIER: an item with no quality restores to none at all",
    from: `  const from = text(current) || "standard";`, to: `  const from = text(current);`,
    breaks: "E4e" },
  { file: QUALITY, name: "E: a tier nobody implements is grantable",
    from: `  if (!GRANTABLE_QUALITIES.includes(asked)) return null;`, to: `  ;`, breaks: "E5" },
  { file: QUALITY, name: "E: the warp stops replacing the tier",
    from: `  const asked = GRANTABLE_QUALITIES.includes(text(warpMods?.qualityTier))
    ? text(warpMods.qualityTier)
    : text(raw.quality);`, to: `  const asked = text(raw.quality);`, breaks: "E3c" },
  { file: QUALITY, name: "E: the rank order stops following the tier order",
    from: `  return at < 0 ? -1 : at + 1;`, to: `  return at < 0 ? -1 : GRANTABLE_QUALITIES.length - at;`,
    breaks: "E5c" },
  { file: TIERS, name: "E: the tiers stop moving a weapon's damage",
    from: `damageBonusPerDie: 1`, to: `damageBonusPerDie: 0`, breaks: "E6" },
  { file: EFFECTS, name: "E THE PERMANENT UPGRADE: the old tier is not carried on the flag",
    from: `            itemQuality: { itemId: qItemId, from: grant.from, to: grant.quality } } };`,
    to: `            itemQuality: { itemId: qItemId, to: grant.quality } } };`, breaks: "E7" },
  { file: EFFECTS, name: "E: expiry restores nothing, and the sword stays legendary",
    from: `          item.update({ "system.quality": quality.from || "standard" }).catch(() => {});`,
    to: `          ;`, breaks: "E7b" },
  { file: EFFECTS, name: "E: the first spell to end undoes a SECOND Masterwork's upgrade",
    from: `        if (item && String(item.system?.quality ?? "") === String(quality.to ?? "")) {`,
    to: `        if (item) {`, breaks: "E7c" },

  /* ── F/G: the relief choice and the pooled DR ──────────────────── */
  { file: RELIEF, name: "F: a relief row's own choices are dropped, flattening Metabolism's three",
    from: `    choices: (Array.isArray(raw.choices) ? raw.choices : [])
      .map((c) => text(c))
      .filter((c) => RELIEVABLE[c])`, to: `    choices: []`, breaks: "A8" },
  { file: RELIEF, name: "F: a row with no choices offers nothing at all",
    from: `  if (!own.length) return [spec.condition];`, to: `  if (!own.length) return [];`, breaks: "A8c" },
  { file: RELIEF, name: "F: the row's own offer outranks the warp's \"instead\"",
    from: `  if (swap.length) return swap;`, to: `  ;`, breaks: "A8d" }
];

/*
 * THE PACK PASS. Most of this block is authored rows, so the code above
 * can only prove the readers are sound. These prove the checks read what
 * was actually authored.
 */
const PACK_MUTATIONS = [
  /* the regeneration grant */
  { spell: "Metabolism", name: "P: Metabolism grants FAST healing, and the injury clock slows six-fold",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "healingRate").rate = "fastHealing"; },
    breaks: "A7b" },
  { spell: "Metabolism", name: "P: the rate is authored at zero",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "healingRate").value = 0; }, breaks: "A7" },
  { spell: "Metabolism", name: "P: the three-way relief choice is flattened to one",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conditionRelief").choices = ["injured"]; },
    breaks: "A8" },

  /* Massacre */
  { spell: "Massacre", name: "P THE ORIGINAL DEFECT: Massacre loses its ladder again",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "saveLadder"); }, breaks: "B1" },
  { spell: "Massacre", name: "P: a success takes HALF, as a basic save would",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "saveLadder").ladder.success = "4d6"; },
    breaks: "B1c" },
  { spell: "Massacre", name: "P: the fumble stops killing and becomes the damage it never was",
    mutate: (sy) => {
      const l = sy.effects.find((e) => e.kind === "saveLadder");
      l.slaysOn = [];
      l.ladder.fumble = "18d6";
    }, breaks: "B2" },
  { spell: "Massacre", name: "P: the kill moves to the rung that SUCCEEDS",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "saveLadder").slaysOn = ["critical"]; },
    breaks: "B2" },

  /* Nightmare */
  { spell: "Nightmare", name: "P THE UNGATED ROW: a critical success is fatigued again",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "condition").onSave; }, breaks: "C1" },
  { spell: "Nightmare", name: "P: the scaling is dropped and every failure costs the same",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "condition").valuePerMargin; },
    breaks: "C2" },
  { spell: "Nightmare", name: "P: the printed ceiling is removed",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "condition").valueMax; }, breaks: "C2b" },
  { spell: "Nightmare", name: "P THE LATENT TRAP: a margin-scaled row is gated onto a SUCCESS",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "condition").onSave = ["success", "failure"]; },
    breaks: "C6" },

  /* the second pool */
  { spell: "Sunburst", name: "P: the 8d4 goes back to being half of a baseDamage string",
    mutate: (sy) => { delete sy.secondaryDamage; }, breaks: "D2" },
  { spell: "Sunburst", name: "P: the undead-only pool reaches the living too",
    mutate: (sy) => { sy.secondaryDamage.onlyCreatureTypes = []; }, breaks: "D2b" },
  { spell: "Meteor Swarm", name: "P: the fire half is typed as the bludgeoning half",
    mutate: (sy) => { sy.secondaryDamage.type = "bludgeoning"; }, breaks: "D1c" },
  { spell: "Meteor Swarm", name: "P: the fire half is gated to a creature type it never named",
    mutate: (sy) => { sy.secondaryDamage.onlyCreatureTypes = ["undead"]; }, breaks: "D1d" },
  { spell: "Umbral Blast", name: "P: the second pool's formula is prose",
    mutate: (sy) => { sy.secondaryDamage.formula = "as the first"; }, breaks: "D3" },
  { spell: "Umbral Blast", name: "P: the carrier stops being a basic save, and D5d becomes live",
    mutate: (sy) => { sy.defence = "Reflex"; }, breaks: "D6" },

  /* the quality grant */
  { spell: "Masterwork Item", name: "P: the tier is one QUALITY_TIERS does not implement",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "itemQuality").quality = "mythic"; },
    breaks: "E2" },
  { spell: "Masterwork Item", name: "P: the base grant jumps straight to master",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "itemQuality").quality = "master"; },
    breaks: "E2b" },
  { spell: "Masterwork Item", name: "P THE INERT WARP: the master warp's key points at nothing again",
    mutate: (sy) => {
      const w = sy.warps.find((x) => /master quality/i.test(String(x.text)));
      w.mods = {};
    }, breaks: "E3" },
  { spell: "Masterwork Item", name: "P: the legendary warp grants master",
    mutate: (sy) => {
      sy.warps.find((x) => /legendary quality/i.test(String(x.text))).mods.qualityTier = "master";
    }, breaks: "E3b" },

  /* the rails that existed */
  { spell: "Nightvision", name: "P: the ability granted is spelled a way the pack does not hold",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "grantAbility").ability = "Night Vision"; },
    breaks: "F1b" },
  { spell: "Natural Defence", name: "P THE CORRECTION UNDONE: the heldBonus row I added comes back",
    mutate: (sy) => {
      sy.effects.push({ kind: "heldBonus", target: "self", label: "Natural Defence",
        value: 1, bonusType: "resistance", checkTypes: ["save"] });
    }, breaks: "F2" },
  { spell: "Masterwork Item", name: "P: the warps keep the key and the aggregator loses it",
    mutate: (sy) => {
      sy.warps.forEach((w) => { if (w.mods?.qualityTier) w.mods = { ppDelta: 0 }; });
    }, breaks: "E3" },
  { spell: "Lullaby", name: "P THE CONTRADICTION: the warp buys a duration and keeps sustaining",
    mutate: (sy) => { delete sy.warps[0].mods.endsSustain; }, breaks: "G4g" },
  { spell: "Long Stride", name: "P: the +10 lands on a slot that resolves to nothing",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "bonus").slot = "movement"; }, breaks: "F3" },
  { spell: "Mind Blank", name: "P: the ward stops naming the trait it wards against",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conditional").grants[0].when.traits = []; },
    breaks: "F4d" },

  /* Mage Armour, and the ladders */
  // 3.617.2: Mage Armour is a spellArmour row (MA1–MA4).
  { spell: "Mage Armour", name: "P THE 3.591.0 ROW: a status bonus that adds to worn armour",
    mutate: (sy) => { sy.effects = [{ kind: "bonus", target: "self", slot: "dr", bonusType: "status", value: 1 }]; }, breaks: "G1" },
  { spell: "Mage Armour", name: "P: the caster-level ladder goes back to a note",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "spellArmour").multiplierStep; }, breaks: "G3" },
  { spell: "Mage Armour", name: "P: the +4 PP warp goes back to having no row to raise",
    mutate: (sy) => {
      sy.warps.find((w) => /DR increases by \+1/i.test(String(w.text))).mods = {};
    }, breaks: "G2" },
  { spell: "Lullaby", name: "P: the two penalties become one, and a fumble costs what a failure does",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "bonus" || !/fumble/.test(JSON.stringify(e.onSave ?? []))); },
    breaks: "G4" },
  { spell: "Lullaby", name: "P: the penalty becomes a BONUS",
    mutate: (sy) => { sy.effects.filter((e) => e.kind === "bonus").forEach((e) => { e.value = Math.abs(e.value); }); },
    breaks: "G4b" },
  { spell: "Lullaby", name: "P: the ungated penalty hits a success too",
    mutate: (sy) => { sy.effects.filter((e) => e.kind === "bonus").forEach((e) => { delete e.onSave; }); },
    breaks: "G4e" },
  { spell: "Maze", name: "P: a rung stops being printed, and the card says nothing happened",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => !/fumble/.test(JSON.stringify(e.onSave ?? []))); },
    breaks: "G5" },
  { spell: "Memory Lapse", name: "P: a condition this sheet cannot end is applied anyway",
    mutate: (sy) => {
      sy.effects.push({ kind: "condition", target: "targets", condition: "confused", onSave: ["failure"] });
    }, breaks: "G5b" },
  { spell: "Make Whole", name: "P: the heal warp keeps its key and loses the row it raises",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "heal"); }, breaks: "L5" },
  { spell: "Mark Of Faith", name: "P: the correction is undone and a ward is authored after all",
    mutate: (sy) => { sy.effects.push({ kind: "ward", target: "targets", value: 1 }); }, breaks: "M1" },
  { spell: "Long Stride", name: "P: a clockless condition is applied and never comes off",
    mutate: (sy) => {
      sy.duration = "";
      sy.effects.push({ kind: "condition", target: "targets", condition: "slowed" });
    }, breaks: "L4" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!run()) {
  console.error("verify-chapter10-291-300 does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

const { ClassicLevel } = await import("classic-level");
const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");

async function withSpell(name, fn) {
  const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
  await db.open();
  let key = null;
  let pristine = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() !== name.toLowerCase()) continue;
      key = k;
      pristine = JSON.parse(JSON.stringify(v));
      break;
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(pristine));
    fn(mutated);
    await db.put(key, mutated);
  } finally { if (db.status === "open") await db.close(); }
  /* RESTORED IN A FINALLY, so a crash between here and the restore
   * cannot leave Graham's Grimoire mutated. */
  try {
    return run() ? "SURVIVED" : "caught";
  } finally {
    const db2 = new ClassicLevel(SPELLS, { valueEncoding: "json" });
    await db2.open();
    try { await db2.put(key, pristine); } finally { await db2.close(); }
  }
}

for (const m of PACK_MUTATIONS) {
  let state;
  try {
    state = await withSpell(m.spell, (doc) => m.mutate(doc.system));
  } catch (err) { state = `ERROR ${err.message}`; }
  if (state === "caught") console.log(`  caught    ${m.name}`);
  else if (state === "SURVIVED") {
    console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`);
    survived++;
  } else {
    console.error(`  ${state}  ${m.name} (${m.spell})`);
    unmatched++;
  }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

const TOTAL = MUTATIONS.length + PACK_MUTATIONS.length;
process.stdout.write(survived + unmatched
  ? `\nmutate-chapter10-291-300: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-291-300: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK_MUTATIONS.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
