#!/usr/bin/env node
/**
 * verify-block39-conditions — block 39's bonus types and conditions
 * (Appendices 1 and 2, pages 401–405), 3.621.0.
 *
 * Graham's rulings of 5 October 2026 on claude/audit-pages-401-409.md:
 * R1–R5 "your recommendation", R6 "Lets automate these", R7 "Lets
 * automate"; and the audit's A1–A10.
 *
 *   A  bonus types: one shield pool (A1/R4), one suit of armour (A2/R3),
 *      natural armour increases add (R2)
 *   B  values: which add and which take the higher (A4/R5); Stunned and
 *      Slowed (A3)
 *   C  thresholds and deaths: Fatigue 10 and 20 (R6), Doomed (A8), Soul
 *      Drain (A7), a full night (A5), Weakened's damage (A6)
 *   D  movement: who cannot move, Prone's Crawl, the blind's terrain
 *   E  attacks: advantage, Prone ±4, flat-footed to the hidden, the
 *      attacker's senses, Undetected (A9)
 *   F  checks: Reflex auto-fail, Perception without a sense
 *   G  actions: Deafened and Grabbed flat checks, sense immunity, Fleeing,
 *      Fixated, Sickened
 *   H  moments: going Unconscious (A10), waking, Fixated ending, Stunned
 *      mid-turn, the Frightened save
 *   I  Defence: Paralyzed, Unconscious, Petrified
 *   J  3.620.0's G1, and the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const R = await import("../module/conditions/condition-rules.mjs");
const REG = await import("../module/conditions/registry.mjs");
const ARM = await import("../module/armour-stacking.mjs");
const EV = await import("../module/conditions/condition-events-workflow.mjs");
const { shieldBonusInForce } = await import("../module/combat/shield-bash.mjs");
const { computeAPRegain } = await import("../module/combat/turn-economy.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTOR = strip(read("module", "documents", "actor.mjs"));
const COMBAT = strip(read("module", "documents", "combat.mjs"));
const APPLY = strip(read("module", "combat", "effect-application-workflow.mjs"));
const DEATH = strip(read("module", "combat", "death-state.mjs"));
const WATCH = strip(read("module", "combat", "death-watch-workflow.mjs"));
const EVENTS = strip(read("module", "conditions", "condition-events-workflow.mjs"));
const MOVE = strip(read("module", "combat", "movement-workflow.mjs"));
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));
const TARGETING = strip(read("module", "combat", "targeting.mjs"));
const CAST = strip(read("module", "magic", "cast-workflow.mjs"));
const EFFECTS = strip(read("module", "magic", "spell-effects.mjs"));
const ACTION = strip(read("module", "combat", "action-workflow.mjs"));
const CHECK = strip(read("module", "dice", "check.mjs"));
const REST = strip(read("module", "rest", "rest-workflow.mjs"));
const CONDWF = strip(read("module", "combat", "conditions-workflow.mjs"));
const CONSUME = strip(read("module", "consumable-use-workflow.mjs"));
const ENVWF = strip(read("module", "environment-workflow.mjs"));
const MAIN = strip(read("scripts", "trg-prime.mjs"));
const SHEET_HBS = read("templates", "actor", "actor-sheet.hbs");

/* A — bonus types */
{
  ok("A1 A1/R4 — a pooled shield bonus joins the carried shields, highest wins",
    shieldBonusInForce({ shieldBonuses: [2, 1] }).bonus === 2
    && /const pooledShield = Math\.max\(0, \.\.\.actor\.getBonusPool\("system\.combat\.defence"\)\s*\.filter\(\(entry\) => entry\?\.type === "shield"\)/.test(ACTOR)
    && /shieldBonuses: pooledShield > 0 \? \[\.\.\.shieldPieces, pooledShield\] : shieldPieces,/.test(ACTOR));
  ok("A2 A1 — and it leaves the typed pool, flat-footed or not, so it is stripped with the shield",
    /\? \(entry\) => entry\.type !== "dodge" && !\(entry\.type === "shield" && Number\(entry\.value\) > 0\)\s*: \(entry\) => !\(entry\.type === "shield" && Number\(entry\.value\) > 0\)/.test(ACTOR)
    && shieldBonusInForce({ shieldBonuses: [2, 1], suppressed: true }).bonus === 0);
  const two = ARM.stackedArmourDR([
    { name: "Chain Shirt", suit: true, dr: 3 }, { name: "Breastplate", suit: true, dr: 4 },
    { name: "Metal Bracers", suit: false, dr: 1 }, { name: "Metal Helmet", suit: false, dr: 1 }
  ]);
  ok("A3 A2/R3 — the best suit counts and the fittings add", two.dr === 6 && two.suits === 2 && two.counted === "Breastplate"
    && two.ignored.join() === "Chain Shirt", JSON.stringify(two));
  ok("A4 A2 — a suit is torso armour; an Other piece is a fitting",
    ARM.isBodyArmour({ type: "armour", system: { category: "Medium", coversTorso: true } })
    && !ARM.isBodyArmour({ type: "armour", system: { category: "Other", coversTorso: false } })
    && !ARM.isBodyArmour({ type: "armour", system: { category: "Other", coversTorso: true } })
    && ARM.isBodyArmour({ type: "armour", system: { category: "Heavy" } }));
  ok("A5 A2 — the sheet warns when two suits are worn",
    /2 suits of body armour are worn — only the best \(Breastplate\) counts; Chain Shirt adds nothing\./.test(ARM.suitsWarning(two))
    && ARM.suitsWarning(ARM.stackedArmourDR([{ suit: true, dr: 4 }])) === ""
    && /system\.combat\.armour\.suitsWarning = suitsWarning\(armourStack\);/.test(ACTOR)
    && /\{\{#if system\.combat\.armour\.suitsWarning\}\}/.test(SHEET_HBS));
  ok("A6 A2 — the sheet and the damage pipeline both stack this way",
    /const armourStack = stackedArmourDR\(armourItems\.map\(/.test(ACTOR) && /suit: isBodyArmour\(item\),/.test(ACTOR)
    && /const wornArmourDR = stackedArmourDR\(coveringArmour\.map\(/.test(ATTACK) && /suit: isBodyArmour\(item\),/.test(ATTACK));
  ok("A7 R2 — an increase to natural armour adds to the winning value, untyped",
    /const naturalIncrease = actor\.getBonusPool\("system\.combat\.naturalArmourFlat"\)\s*\.filter\(\(entry\) => entry\?\.type !== "naturalArmour"\)/.test(ACTOR)
    && /poolFilter: \(entry\) => entry\?\.type === "naturalArmour"/.test(ACTOR)
    && /\) \+ naturalIncrease\);/.test(ACTOR));
}

/* B — values */
{
  ok("B1 A4/R5 — Bleeding, Injured, Recurring, Fatigue and Soul Drain add",
    ["bleeding", "injured", "recurring", "fatigued", "soulDrain"].every((id) => R.combinedConditionValue(id, 2, 3) === 5));
  ok("B2 A4/R5 — Slowed and the other severities take the higher",
    ["slowed", "stunned", "frightened", "sickened", "dazed", "weakened", "doomed"]
      .every((id) => R.combinedConditionValue(id, 2, 1) === 2 && R.combinedConditionValue(id, 1, 3) === 3));
  ok("B3 A4 — applyConditionTags combines through the rule, not by adding",
    /const newValue = combinedConditionValue\(tag\.key, existingValue, incomingValue\);/.test(APPLY) && /let incomingValue = Number\(tag\.value \?\? 1\);/.test(APPLY)
    && !/const newValue = existingValue \+/.test(APPLY));
  ok("B4 A3 — the AP regain reads Slowed as applied, under Stunned",
    /const slowed = Number\(actor\.conditions\?\.direct\?\.get\?\.\("slowed"\)/.test(COMBAT)
    && /direct \};/.test(ACTOR));
  ok("B5 A3 — the page's example: Stunned 1 and Slowed 2 leave 1 AP",
    computeAPRegain({ stunned: 1, slowed: 2 }).ap === 1);
}

/* C — thresholds and deaths */
{
  const { effective, granted } = REG.resolveConditions(["fatigued"], { grants: [["unconscious", "fatigued"]] });
  ok("C1 R6 — a granted Unconscious, with its includes",
    effective.has("unconscious") && effective.has("blinded") && granted.get("unconscious") === "fatigued");
  ok("C2 R6 — Fatigue 10 grants it in preparation, and the threshold is fatigueStatus's",
    /const grants = fatigueStatus\(direct\.get\("fatigued"\) \?\? 0\) \? \[\["unconscious", "fatigued"\]\] : \[\];/.test(ACTOR)
    && /resolveConditions\(direct\.keys\(\), \{ withhold, grants \}\)/.test(ACTOR));
  ok("C3 R6/A8/A7 — the instant deaths",
    /^Doomed 3/.test(R.instantDeathCause({ baseDeathState: 3, doomed: 3 }))
    && R.instantDeathCause({ baseDeathState: 5, doomed: 4 }) === ""
    && /^Fatigue reaches 20/.test(R.instantDeathCause({ fatigued: 20 }))
    && R.instantDeathCause({ fatigued: 19 }) === ""
    && /^Soul Drain 31/.test(R.instantDeathCause({ soulDrain: 31, maxBeforeSoulDrain: 30 }))
    && R.instantDeathCause({ soulDrain: 30, maxBeforeSoulDrain: 30 }) === ""
    && R.instantDeathCause({ soulDrain: 50, maxBeforeSoulDrain: null }) === "");
  ok("C4 A8 — isDead asks them, whatever wrote the value",
    /if \(instantDeathOf\(actor\)\) return true;/.test(DEATH)
    && /maxBeforeSoulDrain: actor\.system\?\.resources\?\.hp\?\.maxBeforeSoulDrain \?\? null/.test(DEATH)
    && /hp\.maxBeforeSoulDrain = hp\.max;/.test(ACTOR));
  ok("C5 A8 — \"When you die, you're no longer doomed\": Dying past the base, then Doomed off",
    /if \(\/\^Doomed\/\.test\(out\.cause\)\) \{[\s\S]{0,200}toggleStatusEffect\("dying", \{ value: base \+ 1 \}\);\s*await actor\.toggleStatusEffect\("doomed", \{ active: false \}\);/.test(DEATH));
  ok("C6 the death card names the cause, in or out of combat",
    /if \(result\.removed \|\| result\.cause\) \{/.test(WATCH));
  ok("C7 A7 — Soul Drain's rise is hit point damage",
    R.soulDrainDamage(2, 6) === 4 && R.soulDrainDamage(6, 2) === 0 && R.soulDrainDamage(0, 5) === 5
    && /const damage = soulDrainDamage\(before, after\);[\s\S]{0,1200}const owed = soulDrainDamageAfterClamp\(damage, stored, derived\);[\s\S]{0,200}applyDamageAndCheckDying\(actor, owed\)/.test(EVENTS));
  ok("C8 A7 — every valued write reports its before and after",
    /const before = existing \? Number\(existing\.getFlag\?\.\("trg-prime", "value"\) \?\? 1\) : 0;/.test(ACTOR)
    && /await afterValuedCondition\(this, id, before, Number\(value\) \|\| 0\);/.test(ACTOR)
    && (ACTOR.match(/await settle\(\);/g) ?? []).length === 2
    && /if \(id === "soulDrain"\) await soulDrainStrikes\(actor, before, after\);/.test(EVENTS));
  ok("C9 A5 — a full night's sleep, fed and watered, clears Fatigue",
    /if \(activity === "sleeping" && wholeHours >= FULL_NIGHT_HOURS && ate && drank\) \{[\s\S]{0,200}toggleStatusEffect\("fatigued", \{ active: false \}\)/.test(REST)
    && /fatigueCleared,/.test(REST));
  ok("C10 A6 — Weakened comes off a Strength-based damage roll",
    /if \(weakened > 0 && isStrengthBasedAttack\(weaponData\)\) formula \+= ` - \$\{weakened\}`;/.test(ATTACK));
  ok("C11 the sheet's Fatigue lines say what now happens",
    /Fatigue 20\+<\/strong> — the character dies\./.test(SHEET_HBS) && /Fatigue 10\+<\/strong> — Unconscious until Fatigue falls below 10\./.test(SHEET_HBS));
}

/* D — movement */
{
  ok("D1 R7 — Immobilised, Paralyzed and Petrified cannot move",
    ["immobilised", "paralyzed", "petrified"].every((id) => /cannot move$/.test(R.movementRefusal("Bo", new Set([id])))));
  ok("D2 R7 — Grabbed and Unconscious reach it through Immobilised",
    REG.resolveConditions(["grabbed"]).effective.has("immobilised")
    && REG.resolveConditions(["unconscious"]).effective.has("immobilised"));
  ok("D3 R7 — Prone moves only by Crawl", /Crawl and Stand/.test(R.movementRefusal("Bo", new Set(["prone"])))
    && R.movementRefusal("Bo", new Set(["prone"]), { armed: "crawl" }) === "");
  ok("D4 teleportation is not a move action", R.movementRefusal("Bo", new Set(["paralyzed"]), { governed: false }) === "");
  ok("D5 the refusal is asked of the creature's own moves, before anything is charged",
    /const refusal = conditionMoveRefusal\(tokenDocument, movement\);\s*if \(refusal\) \{\s*ui\.notifications\.warn\(`\$\{refusal\}\.`\);\s*return false;/.test(MOVE)
    && /if \(!\["dragging", "keyboard"\]\.includes\(method\)\) return "";/.test(MOVE)
    && /if \(!active \|\| active\.id !== actor\.id\) return "";/.test(MOVE));
  ok("D6 R7 — all terrain is difficult to the Blinded",
    R.allTerrainDifficult(new Set(["blinded"])) && !R.allTerrainDifficult(new Set(["dazzled"]))
    && /const allDifficult = bound\.difficult \|\| blindDifficult;/.test(MOVE));
}

/* E — attacks */
const target = (defence, conds = []) => ({ name: "T", conditions: { effective: new Set(conds) }, system: { combat: { defence } } });
const ffRow = (defence) => EV.attackTermsAgainst(target(defence), { conditions: { effective: new Set(["hidden"]) } })
  .rows.find((r) => /flat-footed to you/.test(r.label))?.value ?? null;
{
  ok("E1 R7 — advantage against a creature that cannot move",
    R.attackAdvantageAgainst(new Set(["paralyzed"])) === "paralyzed" && R.attackAdvantageAgainst(new Set(["prone"])) === null);
  const close = R.proneTargetModifier(new Set(["prone"]), 5);
  const far = R.proneTargetModifier(new Set(["prone"]), 30);
  ok("E2 R7 — Prone: +4 within 5 ft, −4 beyond, circumstance",
    close.value === 4 && far.value === -4 && close.type === "circumstance"
    && R.proneTargetModifier(new Set(["prone"]), null, { melee: true }).value === 4
    && R.proneTargetModifier(new Set(["prone"]), null).value === -4
    && R.proneTargetModifier(new Set(["prone"]), 10).value === -4
    && R.proneTargetModifier(new Set([]), 5) === null);
  ok("E3 R7 — a hidden or undetected attacker's target is flat-footed to it",
    ["hidden", "undetected", "unnoticed", "invisible"].every((id) => R.flatFootedToAttackerBy(new Set([id])) === id)
    && R.flatFootedToAttackerBy(new Set(["concealed"])) === null);
  const und = R.senseMissChance({ targetConds: new Set(["undetected"]) });
  const blind = R.senseMissChance({ attackerConds: new Set(["blinded"]) });
  const dazz = R.senseMissChance({ attackerConds: new Set(["dazzled"]) });
  ok("E4 A9 — Undetected is attacked as hidden (DC 10)", und.hidden && !und.concealed);
  ok("E5 R7 — a Blinded attacker treats all as hidden, a Dazzled one as concealed",
    blind.hidden && !blind.concealed && dazz.concealed && !dazz.hidden);
  ok("E6 the avoidance check reads them",
    /const hidden = Boolean\(targetActor\.hasCondition\("hidden"\)\) \|\| senses\.hidden;/.test(TARGETING)
    && /\|\| Boolean\(screened\) \|\| senses\.concealed\);/.test(TARGETING));
  ok("E7 the Strike: the rows, the advantage as its starting bias, and Sneak Attack",
    /attackTermsAgainst\(targetActor, actor, \{ distanceFeet: distanceToTarget, melee: !isRanged \}\)/.test(ATTACK)
    && /\.\.\.\(conditionTerms\?\.advantage \? \{ bias: "advantage" \} : \{\}\),/.test(ATTACK)
    // RE-ANCHORED 3.668.0: Formless Cut's "treated as flat-footed" joins it.
    && /\|\| Boolean\(conditionTerms\?\.flatFootedBy\)( \|\| Boolean\(treatAsFlatFooted\))?,/.test(ATTACK));
  ok("E8 a spell attack: the advantage on the casting check, the rows in its pool",
    /if \(firstTarget && attackTermsAgainst\(firstTarget, actor\)\.advantage\) castContext\.bias = "advantage";/.test(CAST)
    && /\.concat\(conditionRows\)/.test(CAST));
  ok("E9 an attack action (Trip, Grapple…) meets them too",
    /actionAttackTerms = attackTermsAgainst\(targetActor, actor, \{/.test(ACTION)
    // Re-anchored at 3.665.0: the advantage now joins the bias in the same
    // reconciliation as a defender's disadvantage row (rollBiasWith).
    && /rollBiasWith\(tracklessBias\(situational\?\.bias, tracklessQuarry\), \[\s*\.\.\.\(actionAttackTerms\?\.advantage \? \["advantage"\] : \[\]\),/.test(ACTION)
    && /\.\.\.\(actionAttackTerms\?\.rows \?\? \[\]\),/.test(ACTION));
  ok("E10 flat-footed to you is the Dexterity and dodge the target would lose",
    ffRow({ ability: 3, breakdown: { byType: { dodge: 2 } } }) === 5
    && ffRow({ ability: -1, breakdown: { byType: {} } }) === null
    && EV.attackTermsAgainst(target({}), { conditions: { effective: new Set() } }).rows.length === 0);
}

/* F — checks */
{
  const outcome = { dc: 15, total: 40, margin: 25, degree: { key: "heroic" } };
  const para = R.autoFailedOutcome(outcome, R.reflexAutoFail(new Set(["paralyzed", "immobilised"])));
  const imm = R.autoFailedOutcome(outcome, R.reflexAutoFail(new Set(["immobilised"])));
  ok("F1 R7 — Paralyzed fails Reflex by 25, Immobilised by 20", para.margin === -25 && para.total === -10
    && imm.margin === -20 && para.degree.key === "blunder" && imm.degree.key === "blunder"
    && R.reflexAutoFail(new Set(["prone"])) === null);
  ok("F2 the check forces it on a Reflex save, after any shift",
    /this\.outcome = this\.#conditionForced\(applyDegreeShift\(buildOutcome\(/.test(CHECK)
    // 3.645.0: four — the late modifier and the Conviction probe force it too.
    && (CHECK.match(/this\.#conditionForced\(applyDegreeShift/g) ?? []).length === 4
    && /if \(this\.type === "save" && String\(this\.subject \?\? ""\)\.toLowerCase\(\) === "reflex" && this\.actor\)/.test(CHECK));
  ok("F3 R7 — Perception without the sense it needs",
    R.perceptionBySense(new Set(["blinded"]), "sight").fumble
    && R.perceptionBySense(new Set(["blinded"]), "other").harder && !R.perceptionBySense(new Set(["blinded"]), "other").fumble
    && R.perceptionBySense(new Set(["deafened"]), "hearing").fumble
    && R.perceptionBySense(new Set(["deafened"]), "sound").penalty === -4
    && !R.perceptionBySense(new Set([]), "sight").fumble);
  ok("F4 the check asks which sense, of the Blinded or Deafened only, and acts on it",
    /if \(check\.actor && check\.type === "skill" && check\.subject === "perception" && !check\.flat && !check\.senseResolved\)/.test(CHECK)
    && /if \(result\.fumble\) check\.senseFumble = result\.condition;/.test(CHECK)
    && /check\.difficulty = stepDifficultyHarder\(check\.difficulty\);/.test(CHECK));
}

/* G — actions */
{
  const deaf = R.actionFlatChecks(new Set(["deafened"]), "Auditory, Concentrate");
  const grab = R.actionFlatChecks(new Set(["grabbed"]), ["Manipulate"]);
  ok("G1 R7 — Deafened on Auditory, Grabbed on Manipulate: DC 5",
    deaf.length === 1 && deaf[0].dc === 5 && grab.length === 1 && grab[0].condition === "grabbed"
    && R.actionFlatChecks(new Set(["deafened"]), "Manipulate").length === 0);
  ok("G2 at every action commit point, after the AP and before the effect",
    (ACTION.match(/if \(!\(await conditionCommitGate\(actor, action\)\)\) return null;/g) ?? []).length === 2
    && /if \(!\(await passActionFlatChecks\(actor, action\)\)\) return false;/.test(ACTION)
    && /passActionFlatChecks\(actor, \{ name: spell\.name, traits: spellData\.traits \?\? "" \}\)\)\) degree = "failure";/.test(CAST));
  ok("G3 R7 — sense immunity",
    R.senseImmunityBy(new Set(["blinded"]), "Visual, Illusion") === "blinded"
    && R.senseImmunityBy(new Set(["deafened"]), "Auditory") === "deafened"
    && R.senseImmunityBy(new Set(["deafened"]), "Visual") === null
    && /const by = senseImmunityBy\(recipient\?\.conditions\?\.effective, traits\);/.test(EFFECTS));
  ok("G4 R7 — Fleeing and Confused cannot Ready or Delay",
    /Fleeing/.test(R.deliberateRefusal(new Set(["fleeing"]), "delay")) && R.deliberateRefusal(new Set(["fleeing"]), "stride") === ""
    && /: deliberateRefusal\(conds, action\.key\);/.test(ACTION));
  ok("G5 R7 — Fixated blocks Concentrate actions and spells",
    /Concentrate/.test(R.concentrateRefusal(new Set(["fixated"]), "Concentrate, Manipulate"))
    && R.concentrateRefusal(new Set(["fixated"]), "Attack") === ""
    && /const fixated = concentrateRefusal\(conds, action\.traits\);/.test(ACTION)
    && /concentrateRefusal\(actor\.conditions\?\.effective, spellData\.traits \?\? ""\)/.test(CAST));
  ok("G6 R7 — Sickened cannot ingest; Retch costs 1 AP",
    R.ingestRefusal(new Set(["sickened"])) !== "" && R.ingestRefusal(new Set([])) === "" && R.RETCH_AP === 1
    && /const refused = ingested && !toAnother \? ingestRefusal\(actor\.conditions\?\.effective\) : "";/.test(CONSUME)
    && /if \(!\(await retchCost\(actor\)\)\) return null;/.test(CONDWF) && /await payRetch\(actor\);\s*const degree/.test(CONDWF));
}

/* H — moments */
{
  ok("H1 A10 — Unconscious no longer includes Prone",
    !(REG.CONDITIONS.unconscious.includes ?? []).includes("prone")
    && ["blinded", "flatFooted", "immobilised"].every((id) => REG.CONDITIONS.unconscious.includes.includes(id)));
  ok("H2 A10 — going Unconscious writes Prone and drops what is held, once",
    /if \(!directEffects\(actor, "prone"\)\.length\) \{\s*await actor\.toggleStatusEffect\("prone", \{ active: true \}\);/.test(EVENTS)
    && /await actor\.updateEmbeddedDocuments\("Item", held\.map\(\(item\) => \(\{ _id: item\.id, "system\.equipped": false \}\)\)\);/.test(EVENTS)
    && /if \(down === marked\) return;/.test(EVENTS)
    && /registerConditionEventHooks\(\);/.test(MAIN));
  ok("H3 R7 — damage or healing wakes a sleeper; rest, Dying or 0 HP do not",
    R.wakesOnHpChange({ directlyUnconscious: true, hpAfter: 5 })
    && !R.wakesOnHpChange({ directlyUnconscious: true, hpAfter: 0 })
    && !R.wakesOnHpChange({ directlyUnconscious: true, hpAfter: 5, dying: true })
    && !R.wakesOnHpChange({ directlyUnconscious: true, hpAfter: 5, rest: true })
    && !R.wakesOnHpChange({ directlyUnconscious: false, hpAfter: 5 })
    && /await actor\.update\(updates, \{ trgRest: true \}\);/.test(REST));
  ok("H4 R7 — an Interact shakes a sleeper awake",
    /if \(action\.key === "interact"\) \{[\s\S]{0,300}await shakeAwake\(actor, token\.actor\);/.test(ACTION));
  ok("H5 R7 — a hostile act ends Fixated, on the target and its allies",
    /if \(targetActor\) await endFixationOnHostileAct\(\[targetActor\], actor\);/.test(ATTACK)
    && /await endFixationOnHostileAct\(\[targetActor\], actor\);/.test(CAST)
    && /if \(isOffensiveAction\(action\)\) \{/.test(ACTION)
    && /const group = \[target, \.\.\.\(token \? tokensAlliedWith\(token\)\.map\(\(t\) => t\.actor\) : \[\]\)\];/.test(EVENTS));
  const mid = R.stunnedDeduction(2, 3);
  ok("H6 R7 — Stunned on your own turn deducts at once, and spends itself",
    mid.lost === 2 && mid.ap === 0 && mid.stunned === 1 && R.stunnedDeduction(3, 1).ap === 2
    && /if \(id === "stunned" && Number\(after\) > Number\(before\)\) await stunnedMidTurn\(actor\);/.test(EVENTS)
    && /stamp\.round !== combat\.round \|\| stamp\.turn !== combat\.turn\) return;/.test(EVENTS)
    && /\[`flags\.\$\{SYSTEM_ID\}\.apGrantedTurn`\]: \{ combatId: this\.id, round: this\.round, turn: this\.turn \},/.test(COMBAT));
  ok("H7 R7 — the Frightened save is offered at the end of each turn",
    /if \(actor\.hasCondition\?\.\("frightened"\)\) \{[\s\S]{0,200}await offerFrightenedRecovery\(actor\);/.test(COMBAT)
    && COMBAT.indexOf("offerFrightenedRecovery") < COMBAT.indexOf("if (!bleeds.length && !recurrings.length) return;")
    && /trg-frightened-recovery/.test(EVENTS));
}

/* I — Defence */
{
  ok("I1 R7 — the restrictions", R.defenceRestriction(new Set(["petrified", "paralyzed"])) === "zero"
    && R.defenceRestriction(new Set(["paralyzed"])) === "magicArmour"
    && R.defenceRestriction(new Set(["unconscious"])) === "magicArmour"
    && R.defenceRestriction(new Set(["prone"])) === null);
  ok("I2 R7 — magic and armour survive; Dexterity, class and the rest do not",
    R.keepsMagicOrArmour({ type: "armour" }) && R.keepsMagicOrArmour({ type: "item" })
    && !R.keepsMagicOrArmour({ type: "dodge" }) && !R.keepsMagicOrArmour({ type: "class", source: "sheet" })
    && !R.keepsMagicOrArmour({ type: "status", source: "Actor.x.ActiveEffect.y" }));
  ok("I3 the actor applies them after the Defence is resolved",
    /const restriction = defenceRestriction\(actor\.conditions\?\.effective\);\s*if \(restriction === "zero"\) \{\s*combat\.defence\.total = 0;/.test(ACTOR)
    && /return keepsMagicOrArmour\(entry\) \|\| magic\.has\(entry\.source\) \? sum \+ value : sum;/.test(ACTOR));
  ok("I4 R7 — Petrified: Hardness 8 joins the DR that always adds",
    R.PETRIFIED_HARDNESS === 8
    && /if \(actor\?\.hasCondition\?\.\("petrified"\)\) \{\s*system\.combat\.dr\.total = \(Number\(system\.combat\.dr\.total\) \|\| 0\) \+ PETRIFIED_HARDNESS;/.test(ACTOR));
}

/* J — G1, and the version */
{
  ok("J1 G1 — the Region weather fields go into the Appearance tab",
    /inject\(app, html, \["appearance", "identity", "basics"\]\)/.test(ENVWF));
  const sys = JSON.parse(read("system.json"));
  ok("J2 the version is 3.621.0 or later", String(sys.version).localeCompare("3.621.0", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-block39-conditions: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block39-conditions: OK — ${checks} checks. One shield pool and one suit of armour; which conditions add; Fatigue, Doomed and Soul Drain's deaths; movement, attacks, checks and actions under conditions; going Unconscious and waking; Defence under Paralyzed, Unconscious and Petrified.`);
