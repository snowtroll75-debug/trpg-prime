/**
 * Throwing a bomb, and crafting an alchemical item at a higher level.
 *
 * Graham, 3.249.0: "Items with the Bomb trait are thrown in combat. I
 * cannot do that with alchemical items at the moment. Also I cannot
 * increase their level for greater effect."
 *
 * THE THROW IS AN ATTACK, and it goes through the machinery that already
 * exists: the same target prompt every attack uses, the same check roll,
 * and the same typed-damage pipeline that resolves a hit against the
 * target's own resistances. A bomb is not a weapon item, so it cannot go
 * through `rollWeaponAttack` — which reads load, magazine, ammunition
 * and a dozen weapon fields a flask does not have — but everything below
 * the attack roll is shared rather than rebuilt.
 *
 * "Alchemical weapons have a range increment of 20 feet and attack as
 * martial thrown weapons (with their own attack group)" — the chapter's
 * own sentence, and where the proficiency comes from.
 *
 * SPLASH IS APPLIED TO THE TARGET AND REPORTED FOR EVERYONE ELSE. This
 * system has no template for "adjacent to the target", and inventing a
 * radius the chapter does not print would be worse than saying so.
 *
 * THAT SENTENCE WAS FALSE UNTIL 3.482.0, and it is worth leaving above
 * this note rather than quietly rewriting it. Only `profile.damage` ever
 * reached `applyTypedDamage`: splash landed on NOBODY, the target
 * included, while this header claimed otherwise. Found on 3 September
 * 2026 while building the same rule for Orb Of Acid, whose splash
 * Graham had reported missing from his table. The code now does what
 * the comment always said. See magic/splash.mjs.
 */

import { attackCountOf, setAttackCount } from "./combat/turn-records.mjs";
import { bombAt, isBomb, scalingAt, alchemicalPrice, ALCHEMICAL_COST_TABLE } from "./alchemical.mjs";
import { alchemicalEffectOf, alchemicalLevelSummary, speedPlans } from "./elixirs.mjs";
import { splashAmount, hasSplash, splashIsDice } from "./magic/splash.mjs";
import { scatter, splashOnHit } from "./trait-rules.mjs";
import { promptTargetSelection } from "./combat/targeting.mjs";
import { targetPromptText } from "./combat/target-prompt.mjs";
import { TRGCheck } from "./dice/check.mjs";
import { isProficientWithAlchemical, proficiencyProfile } from "./proficiency-rules.mjs";
import { mapPenalty, rangedAbilityAdjustment } from "./combat/attack.mjs";
import { COVER_TYPES, ENGAGED_RANGED_PENALTY, FIRING_INTO_MELEE_COVER } from "./combat/ranged.mjs";
import {
  BOMB_STRIKE_AP, TANGLEFOOT_INTERACTS, bombAttackResult, bombCriticalDice, bombEffectsOf, bombRange,
  bombReaches, bombRidersFor, bombSaveDC, onlyVsText, recurringAfterHit, tanglefootInteract
} from "./bombs.mjs";
import { syntheticSpellData } from "./consumable-use-workflow.mjs";
import { actorHandle, resolveActorHandle } from "./actor-handle.mjs";
import { RECURRING_FLAT_CHECK_DC } from "./conditions/registry.mjs";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "trg-prime";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * The attack bonus for a thrown alchemical weapon.
 *
 * Martial proficiency and Dexterity, which is what "attack as martial
 * thrown weapons" means — read off the actor's own resolved numbers
 * rather than recomputed, so a feat or an effect that changes either is
 * already in it.
 *
 * AND THE -4 IF YOU ARE NOT PROFICIENT. The chapter's own sentence ends
 * "(with their own attack group)", confirmed by Graham on 13 Aug 2026 —
 * so Martial-weapon proficiency does NOT reach it, and the Alchemist
 * archetype's line is what grants it. Until 3.303.0 this function
 * returned a flat bonus with no proficiency term at all, which is the
 * same defect the weapon attack had before 3.215.0: a penalty that
 * could not fire, and a grant with nothing to attach to.
 *
 * The penalty is the same -4 the weapon path uses, and it is RETURNED
 * rather than silently folded in, so the card can say why.
 *
 * @returns {{total: number, bab: number, dexterity: number,
 *   proficient: boolean, penalty: number}}
 */
export const NON_PROFICIENT_PENALTY = -4;

/*
 * THE DEXTERITY HERE WAS BEING ADDED TWICE (fixed 3.489.0).
 *
 * `system.combat.attack.total` is not the BAB its old variable name
 * claimed. `documents/actor.mjs` builds it as base + ABILITY + slots —
 * its own additive label reads "BAB and ability" — so this function
 * returned BAB + Strength + Dexterity, and had since 3.303.0.
 *
 * It is worth naming why it was written this way: whoever built it knew
 * perfectly well that a thrown bomb is a Dexterity attack and added the
 * term explicitly. They were right about the rule and wrong about what
 * the field already contained. That is independent corroboration of the
 * ruling of 4 September 2026 — the expectation was already in the code,
 * a chapter away from the weapon path that contradicted it.
 *
 * FIXED WITH THE SAME DELTA THE WEAPON PATH USES, not by switching to
 * `bab.total`. Reading the raw BAB would have silently dropped every
 * other attack bonus on the actor — magic, feats, effects — which is a
 * second bug traded for the first. `rangedAbilityAdjustment` swaps the
 * ability component and leaves everything else exactly as resolved, so
 * a bomb and a sling now get their Dexterity by one shared rule.
 */
export function bombAttackBonus(actor) {
  const system = actor?.system ?? {};
  const dexterity = Number(system.attributes?.dexterity?.total ?? 0);
  const resolved = Number(system.combat?.attack?.total ?? system.combat?.bab ?? 0);
  const configured = Number(system.combat?.attack?.ability ?? 0);
  // A bomb is thrown, and Chapter 7 makes thrown a ranged attack.
  const swap = rangedAbilityAdjustment(true, configured, dexterity);
  const proficient = isProficientWithAlchemical(proficiencyProfile(actor));
  const penalty = proficient ? 0 : NON_PROFICIENT_PENALTY;
  return {
    total: resolved + swap + penalty,
    // REPORTED AS THE ATTACK BONUS IT ACTUALLY IS, ability included, so
    // the field name stops promising a BAB it never held.
    bab: resolved + swap,
    dexterity,
    proficient,
    penalty
  };
}

/**
 * Throw a bomb at someone.
 *
 * REBUILT AT 3.578.0 (the block-18 audit, D1–D6, and Graham's R4–R7). See
 * bombs.mjs for what was wrong and for every rule this function asks.
 * The order is the Strike's, and deliberately so:
 *
 *   target → range (refused out of range, before anything is spent) →
 *   1 AP → the roll against DB, with the multiple attack penalty, the
 *   range penalty and firing into melee → hit or miss, and the critical →
 *   damage, recurring damage and bleed → the riders → the burst around
 *   the target (Thunderstone) → the splash note → one flask gone.
 */
export async function throwBomb(actor, item) {
  if (!isBomb(item)) {
    ui.notifications.warn(`${item.name} does not have the Bomb trait.`);
    return null;
  }
  const profile = bombAt(item);
  if (!profile) {
    ui.notifications.warn(`${item.name} has no bomb data to throw with.`);
    return null;
  }
  if (Number(item.system?.quantity ?? 0) <= 0) {
    ui.notifications.warn(`No ${item.name} left to throw.`);
    return null;
  }
  const extras = bombEffectsOf(item);

  const confirmed = await promptTargetSelection(actor, {
    title: `${item.name} — Select Target`,
    prompt: targetPromptText({ isAttack: true })
  });
  if (!confirmed) return null;
  const targetToken = Array.from(game.user.targets ?? [])[0] ?? null;
  const targetActor = targetToken?.actor ?? null;
  const attackerToken = actor.getActiveTokens?.()?.[0] ?? null;

  const { distanceBetween, tokensEngaging } = await import("./combat/geometry.mjs");
  const distance = attackerToken && targetToken ? distanceBetween(attackerToken, targetToken) : null;
  const range = bombRange(distance, profile.rangeIncrement);
  // OUT OF RANGE IS REFUSED BEFORE THE AP IS SPENT, as a Strike's is.
  if (range.outOfRange) {
    ui.notifications.warn(`${item.name}: ${targetActor?.name ?? "the target"} is ${distance} ft away — beyond six range increments.`);
    return null;
  }

  // "Activate Strike (1 AP)" (D2).
  const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  await spendActionPoints(actor, String(BOMB_STRIKE_AP), `${item.name} — Strike`);

  // A DICE SPLASH IS ROLLED ONCE (3.622.1; the 3.622.0 drive's F5, Graham's
  // R5) — Shard Bomb's "1d4". Every reader below takes `splash`, never the
  // printed field. See magic/splash.mjs.
  let splash = profile.splash;
  let splashRoll = "";
  if (splashIsDice(profile.splash)) {
    const rolledSplash = await new Roll(String(profile.splash)).evaluate();
    splash = Math.max(0, Math.trunc(Number(rolledSplash.total) || 0));
    splashRoll = `${profile.splash} = ${rolledSplash.total}`;
  }

  const bonus = bombAttackBonus(actor);
  // THE MULTIPLE ATTACK PENALTY, both ways (D2): a bomb takes the penalty
  // the turn's earlier attacks earned, and counts toward the next one's.
  const attackIndex = attackCountOf(actor);
  const map = mapPenalty(attackIndex, false, false);
  const modifiers = [
    { label: "Thrown (martial)", value: bonus.total - bonus.penalty, type: "untyped" },
    ...(bonus.proficient ? [] : [{
      label: "Non-proficient — alchemical weapons are their own attack group",
      value: bonus.penalty,
      type: "untyped"
    }]),
    ...(map ? [{ label: "Multiple attack penalty", value: map, type: "untyped" }] : []),
    ...(range.penalty ? [{ label: `Range increment ${range.increments} (${distance} ft)`, value: range.penalty, type: "untyped" }] : [])
  ];
  // Chapter 7, as the Strike reads it: a thrower in melee is engaged, and
  // a target in melee has standard cover from a ranged attack.
  let coverBonus = 0;
  if (attackerToken && targetToken) {
    if (tokensEngaging(attackerToken).length) {
      modifiers.push({ label: "Engaged in melee", value: ENGAGED_RANGED_PENALTY, type: "untyped" });
    }
    const intoMelee = tokensEngaging(targetToken, { exclude: [attackerToken] }).length > 0;
    const preciseShot = Array.from(actor.items ?? [])
      .some((i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "precise shot");
    if (intoMelee && !preciseShot) coverBonus = COVER_TYPES[FIRING_INTO_MELEE_COVER].bonus;
  }

  // THE DEFENDER'S REACTION, BEFORE THE THROW IS ROLLED (3.666.1) — see
  // combat/defence-offer.mjs. Read before the DB below, which includes it.
  if (targetActor) {
    const { offerDefences } = await import("./combat/defence-offer-workflow.mjs");
    await offerDefences(actor, targetActor, { kind: "bomb", what: item.name });
  }

  let db = null;
  if (targetActor) {
    const { defenceDCBonus } = await import("./combat/defence-dc.mjs");
    const { alignedTraitsOf, creatureTypesOf } = await import("./aligned.mjs");
    const { creatureTraits } = await import("./creature-traits.mjs");
    const typed = defenceDCBonus(
      targetActor, "defence", "", creatureTypesOf(actor.system ?? {}), actor.uuid ?? "", alignedTraitsOf(actor.system ?? {}),
      creatureTraits(actor.system ?? {})
    );
    const base = Number(targetActor.system?.combat?.defence?.total ?? NaN);
    db = Number.isFinite(base) ? base + coverBonus + Number(typed?.total ?? 0) : null;
  }

  // A BOMB IS AN ATTACK (3.622.0; block 39's A12 and R7). The Word aftermath
  // reaches "all further spell and attack checks" in the turn, and the
  // target's conditions (advantage against the immobile, Prone's ±4,
  // flat-footed to a hidden thrower) reach every attack, as a Strike's do.
  const { wordAftermathModifier } = await import("./traits-workflow.mjs");
  const wordPenalty = wordAftermathModifier(actor);
  if (wordPenalty) modifiers.push(wordPenalty);
  const { attackTermsAgainst } = await import("./conditions/condition-events-workflow.mjs");
  const bombTerms = targetActor ? attackTermsAgainst(targetActor, actor, { distanceFeet: distance }) : null;
  modifiers.push(...(bombTerms?.rows ?? []));
  if (bombTerms?.advantage) modifiers.push({ label: `Advantage — ${bombTerms.advantage}`, value: 0, type: "untyped" });
  const check = await TRGCheck.roll({
    actor,
    ...(bombTerms?.advantage ? { bias: "advantage" } : {}),
    label: `${item.name} — Thrown`,
    subtitle: targetActor
      ? `vs ${targetActor.name}${distance !== null ? ` — ${distance} ft` : ""} · range increment ${profile.rangeIncrement} ft`
      : "No target selected",
    type: "attack",
    dc: db,
    targetUuid: targetActor?.uuid ?? "",
    suppressDegree: true,
    modifiers
  });
  if (!check) return null;
  await setAttackCount(actor, attackIndex + 1);
  // A DEFENCE THAT LASTED ONE ATTACK (3.666.0) — see combat/one-attack.mjs.
  if (targetActor) {
    const { consumeOneAttackEffects } = await import("./combat/target-relay-workflow.mjs");
    await consumeOneAttackEffects(targetActor, { kind: "bomb", attackerUuid: actor?.uuid ?? "" });
  }

  // THE RESULT (D1, R4): hit or miss against the DB, and the critical.
  const { actorDefences } = await import("./creature-traits.mjs");
  const { ownedCreatureTypeSystem } = await import("./creature-type-rules.mjs");
  const defences = targetActor ? actorDefences(targetActor.system, ownedCreatureTypeSystem(targetActor)) : null;
  const damageType = profile.damageType || "";
  const result = bombAttackResult({
    unmodified: check.dice?.unmodified ?? 0,
    total: check.outcome?.total ?? 0,
    db,
    proficient: bonus.proficient,
    criticalResistance: Number(targetActor?.system?.combat?.criticalResistance ?? 0),
    criticalImmune: Boolean(defences?.immunities?.has("critical") || (damageType && defences?.immunities?.has(damageType)))
  });
  // No target, or no DB to read: the GM decides, and nothing lands.
  const hit = result.hits === true;
  const critical = hit && result.critical ? result.critical : null;
  const reaches = targetActor ? bombReaches(extras, targetActor.system) : true;

  const lines = [
    line(result.hits === null
      ? `<strong>Total ${check.outcome?.total ?? "?"}</strong> — no target to resolve against; apply by hand.`
      : hit
        ? `<strong>${critical ? `Critical hit — ${critical.severity}` : "Hit"}</strong> — AV ${result.av}${result.autoHit ? " (unmodified 20)" : ""}.`
        : `<strong>Miss</strong>${result.autoMiss ? " (unmodified 1)" : result.av !== null ? ` by ${-result.av}` : ""}.`),
    ...(bonus.proficient ? [] : [line(
      "<em>Not proficient (-4)</em> — alchemical weapons form their own attack group, granted by the Alchemist archetype."
    )])
  ];

  const { applyTypedDamage } = await import("./combat/damage-workflow.mjs");
  let injury = null;
  if (hit && targetActor && !reaches) {
    // HOLY WATER (R5): the living, and anything not evil, take nothing.
    lines.push(line(`<em>${item.name} harms only ${onlyVsText(extras.onlyVs)} — ${targetActor.name} is untouched.</em>`));
  } else if (hit && targetActor) {
    const hasDamage = String(profile.damage ?? "0").trim() !== "0" && Boolean(damageType);
    if (hasDamage) {
      const critDice = critical ? bombCriticalDice(profile.damage, critical.bonusDice) : "";
      const formula = critDice ? `${profile.damage} + ${critDice}` : String(profile.damage);
      const rolled = await new Roll(formula).evaluate();
      // × THE CRITICAL'S SEVERITY (3.622.0; block 39's A20): "The target and
      // all targets in the splash radius take the weapons splash damage
      // multiplied by the severity level … of the critical."
      const splashOnTarget = splashOnHit(splashAmount(splash), critical?.severity ?? null);
      const total = rolled.total + splashOnTarget;
      // DR, RESISTANCE AND IMMUNITY BY DAMAGE TYPE, as every attack
      // (3.578.1, Graham's ruling on the 3.578.0 question). `null` asks the
      // pipeline to derive the target's armour and natural DR and apply the
      // per-type rule — full against physical, half against acid, cold,
      // electricity, fire and sonic, none against essence, mental and
      // poison. `applyTypedDamage`'s own default is 0, which is how 3.578.0
      // shipped a bomb that no armour ever slowed.
      const applied = await applyTypedDamage(targetActor, {
        amount: total,
        type: damageType,
        traits: extras.sourceTraits,
        dr: null,
        naturalArmourDr: null,
        isCritical: Boolean(critical)
      });
      lines.push(line(
        `<strong>${total} ${damageType}</strong> to ${targetActor.name} (${formula} = ${rolled.total}${
          splashOnTarget ? ` + ${splashOnTarget} splash` : ""})${
          applied.applied !== total ? ` — ${applied.applied} after defences` : ""}.`));
    }
    // RECURRING DAMAGE AND BLEED ARE CONDITIONS NOW (D3), dealt in the
    // target's end phase by the engine that already deals them.
    if (String(profile.persistent) !== "0") {
      const amount = (await new Roll(String(profile.persistent)).evaluate()).total;
      const existingEffect = Array.from(targetActor.effects ?? []).find((e) => e.statuses?.has?.("recurring"));
      const existing = existingEffect ? {
        value: Number(existingEffect.getFlag(SYSTEM_ID, "value") ?? 0),
        damageType: existingEffect.getFlag(SYSTEM_ID, "damageType") ?? ""
      } : null;
      const next = recurringAfterHit(existing, amount, damageType);
      await targetActor.toggleStatusEffect("recurring", { value: next.value, damageType: next.damageType });
      lines.push(line(`<strong>Recurring ${next.value} ${damageType}</strong> on ${targetActor.name} — dealt in its end phase until a DC ${RECURRING_FLAT_CHECK_DC} flat check ends it${
        next.replaced ? " (it replaces the recurring damage already there)" : ""}.`));
    }
    if (String(profile.bleed) !== "0") {
      const amount = (await new Roll(String(profile.bleed)).evaluate()).total;
      const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
      const applied = await applyConditionTags(targetActor, [{ key: "bleeding", label: "Bleeding", value: amount }]);
      lines.push(line(`${targetActor.name}: ${formatAppliedTags(applied)}.`));
    }

    // THE CRITICAL INJURY (R4), on the bomb's own damage type's table.
    // A creature immune to criticals takes the damage above and skips the
    // injury, as a Strike's target does.
    //
    // ROLLED AFTER THE THROW'S CARD (3.578.1, F5 of the 3.578.0 live test):
    // the injury posts a card of its own, and rolled here it arrived ABOVE
    // the card that says the bomb hit at all.
    if (critical && hasDamage && !critical.injuryImmune) {
      injury = async () => {
        const { rollCriticalInjury, rollQuickCrit } = await import("./combat/attack-workflow.mjs");
        const isMook = targetActor.type === "npc" && Boolean(targetActor.system?.gm?.isMook);
        if (isMook) {
          // `attacker` (3.580.0, R11): Chaos gives the Conviction to the
          // one who rolled, which is the thrower, not the mook.
          await rollQuickCrit(targetActor, { severity: critical.severity, baseDamage: profile.damage, damageType, attacker: actor });
        } else {
          await rollCriticalInjury(actor, {
            targetActor,
            damageType,
            severity: critical.severity,
            attackBonus: Number(actor.system?.combat?.attack?.total ?? 0),
            weaponIsRanged: true,
            withinFirstIncrement: range.increments === 1
          });
        }
      };
    } else if (critical?.injuryImmune) {
      lines.push(line(`<em>${targetActor.name} is immune to critical injuries — the injury roll is skipped.</em>`));
    }

    // THE RIDERS (D4, D5, R7).
    await applyBombRiders(actor, item, targetActor, targetToken, extras, { critical: Boolean(critical), lines });
  } else if (hit) {
    lines.push(line(`<em>Hit for ${profile.damage} ${damageType} — no target selected, apply by hand.</em>`));
  } else if (hasSplash(splash) && distance !== null) {
    // A MISS SCATTERS (3.622.0; block 39's A20): "The bomb lands off target
    // and scatters half the distance of the original throw in a random
    // direction." The direction is a d8, rolled here.
    const d8 = await new Roll("1d8").evaluate();
    const landed = scatter(distance, d8.total);
    lines.push(line(`<em>A miss — the flask lands <strong>${landed.feet} ft ${landed.direction}</strong> of `
      + `${targetActor?.name ?? "the target"} (half the ${distance} ft throw; d8 = ${d8.total}), and the splash lands there.</em>`));
  } else if (hasSplash(splash)) {
    // NO TOKEN TO MEASURE FROM: the throw has no distance to halve.
    lines.push(line("<em>A miss — the flask lands off target, and its splash lands where it breaks (place it by hand).</em>"));
  } else {
    // A FLASK WITH NO SPLASH SAYS SO (3.622.1, R5): Fire Oil and Tanglefoot
    // were told "the splash still lands" of a splash they do not have.
    lines.push(line(`<em>A miss — the flask breaks off target. ${item.name} has no splash.</em>`));
  }

  if (hasSplash(splash) && reaches) {
    lines.push(line(
      `<strong>Splash ${splashOnHit(splashAmount(splash), critical?.severity ?? null)} ${damageType}</strong>`
      + `${splashRoll ? ` (${splashRoll})` : ""}`
      + `${critical ? ` (${splashAmount(splash)} × the ${critical.severity} critical)` : ""} — to every creature adjacent to `
      + `where it landed${hit && targetActor ? " (the target's share is already applied above)" : ""}. `
      + "<em>Applied by hand: the book prints no radius for splash.</em>"
      + (extras.onlyVs.length ? ` <em>Only ${onlyVsText(extras.onlyVs)} are harmed by it.</em>` : "")));
  }
  for (const note of extras.notes) lines.push(line(`<em>${note}</em>`));

  // The flask is gone either way.
  const left = Math.max(0, Number(item.system.quantity ?? 1) - 1);
  await item.update({ "system.quantity": left });
  lines.push(line(`<em>${left} ${item.name} remaining.</em>`));

  const card = await postBombCard(actor, `${item.name} — Thrown`, lines, extras.escape && hit && targetActor && reaches
    ? tanglefootButtons(item, targetActor, targetToken)
    : null);

  // AFTER THE THROW'S CARD (3.578.1, F5): the injury, and the burst.
  // Each posts cards of its own — the injury its table row, the burst
  // every creature's save — and the throw that caused them comes first.
  // A Thunderstone "hits a creature or a hard surface", so it bursts on
  // a miss as well (R6).
  if (injury) await injury();
  if (extras.area && targetToken) {
    const burst = [];
    await resolveBombArea(actor, item, targetToken, extras.area, burst);
    if (burst.length) await postBombCard(actor, `${item.name} — Burst`, burst, null);
  }
  return { check, profile, hit, critical: critical?.severity ?? null, remaining: left, card };
}

/**
 * The riders that apply, through the effect applier the elixirs use —
 * one resolver for "−5 status to Speed for 1 round" wherever it is
 * printed. A creature still immune to this bomb (Sulphur Bomb: "hit
 * creatures are temporarily immune to the effects of the bomb for 1
 * minute") takes the damage but none of the riders.
 */
async function applyBombRiders(actor, item, targetActor, targetToken, extras, { critical, lines }) {
  const riders = bombRidersFor(extras, { hit: true, critical });
  if (!riders.length) return;
  const { IMMUNITY_FLAG, isTemporarilyImmune, immunityRemaining, describeRemaining, withImmunity, prunedImmunities } =
    await import("./temporary-immunity.mjs");
  const now = Number(game.time?.worldTime ?? 0);
  const key = `bomb:${item.name}`;
  if (extras.immunitySeconds) {
    const record = targetActor.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
    if (isTemporarilyImmune(record, key, now)) {
      lines.push(line(`<em>${targetActor.name} is still immune to ${item.name}'s effects — `
        + `${describeRemaining(immunityRemaining(record, key, now))} left.</em>`));
      return;
    }
  }
  const effects = riders.map((rider) => ({
    kind: rider.kind,
    target: "targets",
    ...(rider.kind === "bonus" ? { slot: rider.slot, bonusType: rider.bonusType, value: rider.value } : {}),
    ...(rider.kind === "condition" ? { condition: rider.condition, value: rider.value } : {}),
    ...(rider.duration ? { duration: rider.duration } : {}),
    ...(rider.note ? { note: rider.note } : {})
  }));
  const data = syntheticSpellData(item, { label: item.name, effects, duration: "" });
  const spell = new Item.implementation(data, { parent: actor });
  const { applySpellEffects } = await import("./magic/spell-effects.mjs");
  const before = new Set(Array.from(targetActor.effects ?? []).map((e) => e.id));
  await applySpellEffects(actor, spell, { targets: [targetActor], lines });
  if (extras.escape) {
    // THE TANGLEFOOT BAG'S EFFECTS CARRY ITS ESCAPE (R7), so the card's
    // two buttons can find and end exactly these and nothing else — the
    // Speed penalty and, on a critical, the Immobilised condition, which
    // the condition engine names after itself rather than after the bag.
    // Found by what the throw ADDED, not by name.
    const mine = Array.from(targetActor.effects ?? []).filter((e) => !before.has(e.id));
    for (const effect of mine) {
      await effect.setFlag(SYSTEM_ID, "tanglefoot", {
        dc: bombSaveDC(item.system?.itemLevel),
        left: Number(extras.escape.interacts ?? TANGLEFOOT_INTERACTS)
      });
    }
  }
  if (extras.immunitySeconds) {
    const record = targetActor.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
    await targetActor.setFlag?.(SYSTEM_ID, IMMUNITY_FLAG,
      withImmunity(prunedImmunities(record, now), key, extras.immunitySeconds, now));
    lines.push(line(`<em>${targetActor.name} is immune to ${item.name}'s effects for ${describeRemaining(extras.immunitySeconds)}.</em>`));
  }
}

/**
 * Thunderstone (R6): every creature within the radius of where it burst
 * rolls the save, at the vial's own level DC; a failure takes the
 * condition. Measured from the target's token — the stone burst on it,
 * or beside it on a miss.
 */
async function resolveBombArea(actor, item, targetToken, area, lines) {
  const { distanceBetween } = await import("./combat/geometry.mjs");
  const radius = Math.max(0, Number(area.radius) || 0);
  const caught = (canvas?.tokens?.placeables ?? [])
    .filter((token) => token.actor && (token.id === targetToken.id || distanceBetween(targetToken, token) <= radius));
  if (!caught.length) return;
  const dc = bombSaveDC(item.system?.itemLevel);
  const save = String(area.save ?? "fortitude");
  lines.push(line(`<strong>Burst</strong> — each creature within ${radius} ft: ${save[0].toUpperCase()}${save.slice(1)} save, DC ${dc}.`));
  const failed = [];
  for (const token of caught) {
    const creature = token.actor;
    const check = await TRGCheck.roll({
      actor: creature,
      label: `${item.name} — ${save[0].toUpperCase()}${save.slice(1)} Save`,
      subtitle: `The burst, within ${radius} ft`,
      type: "save",
      subject: save,
      traits: item.system?.traits ?? "",
      dc,
      modifiers: creature.system?.combat?.saves?.[save]?.checkModifiers
        ?? [{ label: save, value: Number(creature.system?.combat?.saves?.[save]?.total ?? 0), type: "untyped" }]
    });
    const success = Boolean(check?.outcome?.degree?.success);
    lines.push(line(`${creature.name}: ${success ? "saves" : "<strong>fails</strong>"} (${check?.outcome?.total ?? "?"}).`));
    if (!success) failed.push(creature);
  }
  if (!failed.length || !area.condition) return;
  const data = syntheticSpellData(item, {
    label: item.name,
    effects: [{ kind: "condition", target: "targets", condition: area.condition, ...(area.duration ? { duration: area.duration } : {}) }],
    duration: ""
  });
  const spell = new Item.implementation(data, { parent: actor });
  const { applySpellEffects } = await import("./magic/spell-effects.mjs");
  await applySpellEffects(actor, spell, { targets: failed, lines });
}

/** The card, with the Tanglefoot Bag's two buttons when it stuck. */
async function postBombCard(actor, title, lines, buttons) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}${buttons?.html ?? ""}</div>`,
    ...(buttons?.flags ? { flags: buttons.flags } : {})
  });
}

function tanglefootButtons(item, targetActor, targetToken) {
  const dc = bombSaveDC(item.system?.itemLevel);
  return {
    html: `<p style="margin:6px 0 2px;display:flex;gap:6px">`
      + `<button type="button" data-action="tanglefootEscape">Escape (DC ${dc})</button>`
      + `<button type="button" data-action="tanglefootScrape">Scrape off (Interact)</button></p>`,
    flags: { [SYSTEM_ID]: { tanglefoot: { target: actorHandle(targetActor, targetToken?.document ?? null), dc, name: item.name } } }
  };
}

/**
 * ESCAPE, from the card (R7): the stuck creature's better of Acrobatics
 * and Athletics against the bag's level DC. A success ends every effect
 * the bag left on it.
 */
export async function tanglefootEscape(message) {
  const raw = message?.getFlag?.(SYSTEM_ID, "tanglefoot");
  const target = raw?.target ? await resolveActorHandle(raw.target) : null;
  if (!target) return null;
  const stuck = tanglefootEffectsOn(target);
  if (!stuck.length) {
    ui.notifications.info(`${target.name} is no longer stuck.`);
    return null;
  }
  const skills = target.system?.skills ?? {};
  const pick = ["acrobatics", "athletics"]
    .filter((k) => skills[k])
    .sort((a, b) => Number(skills[b]?.total ?? 0) - Number(skills[a]?.total ?? 0))[0] ?? "athletics";
  const check = await TRGCheck.roll({
    actor: target,
    label: `Escape — ${raw.name}`,
    subtitle: `${skills[pick]?.label ?? pick} against DC ${raw.dc}`,
    type: "skill",
    subject: pick,
    dc: Number(raw.dc),
    modifiers: skills[pick]?.checkModifiers
      ?? [{ label: skills[pick]?.label ?? pick, value: Number(skills[pick]?.total ?? 0), type: "untyped" }]
  });
  if (check?.outcome?.degree?.success) {
    await target.deleteEmbeddedDocuments("ActiveEffect", stuck.map((e) => e.id));
    await postCard(target, `${raw.name} — Escaped`, [line(`<strong>${target.name}</strong> tears free — the bag's effects end.`)]);
    return { escaped: true };
  }
  await postCard(target, `${raw.name} — Still Stuck`, [line(`${target.name} fails to escape.`)]);
  return { escaped: false };
}

/**
 * SCRAPING IT OFF, from the card (R7): "spending a total of 3 Interact
 * actions … These Interact actions don't have to be consecutive, and
 * other creatures can provide the actions as well." Each press is one,
 * from whoever's token is selected — 1 AP from them in combat — and the
 * third ends the effects.
 */
export async function tanglefootScrape(message) {
  const raw = message?.getFlag?.(SYSTEM_ID, "tanglefoot");
  const target = raw?.target ? await resolveActorHandle(raw.target) : null;
  if (!target) return null;
  const stuck = tanglefootEffectsOn(target);
  if (!stuck.length) {
    ui.notifications.info(`${target.name} is no longer stuck.`);
    return null;
  }
  const helper = canvas?.tokens?.controlled?.[0]?.actor ?? target;
  const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  await spendActionPoints(helper, "1", "Interact — scrape off the tanglefoot bag");
  const before = Number(stuck[0].getFlag(SYSTEM_ID, "tanglefoot")?.left ?? TANGLEFOOT_INTERACTS);
  const next = tanglefootInteract(before);
  if (next.ended) {
    await target.deleteEmbeddedDocuments("ActiveEffect", stuck.map((e) => e.id));
    await postCard(helper, `${raw.name} — Scraped Off`, [line(`<strong>${helper.name}</strong> scrapes the last of it off ${target.name} — the bag's effects end.`)]);
  } else {
    for (const effect of stuck) {
      await effect.setFlag(SYSTEM_ID, "tanglefoot", { ...(effect.getFlag(SYSTEM_ID, "tanglefoot") ?? {}), left: next.left });
    }
    await postCard(helper, `${raw.name} — Scraping`, [line(`${helper.name} scrapes at ${target.name}: <strong>${next.left}</strong> more Interact action${next.left === 1 ? "" : "s"} to free them.`)]);
  }
  return next;
}

function tanglefootEffectsOn(actor) {
  return Array.from(actor?.effects ?? []).filter((e) => e.getFlag?.(SYSTEM_ID, "tanglefoot"));
}

/**
 * Craft this item at a higher level.
 *
 * "Most of the items here can be crafted to a higher level and details
 * of how an alchemical item's abilities are affected by a level increase
 * are explained in its description." So the level is a property of the
 * item, and changing it moves the price up the cost table and the effect
 * up the item's own ladder.
 *
 * The item is CHANGED rather than replaced, because a level is what it
 * was made at — not a different item.
 */
export async function craftAtLevel(actor, item) {
  const alchemical = item?.flags?.[SYSTEM_ID]?.alchemical;
  if (!alchemical) {
    ui.notifications.warn(`${item.name} is not an alchemical item.`);
    return null;
  }
  const baseLevel = Number(alchemical.baseLevel ?? item.system.itemLevel ?? 1);
  const current = Number(item.system.itemLevel ?? baseLevel);
  const scaling = alchemical.scaling;
  // THE LADDER IN THE NUMBERS IT WILL USE (3.577.0). An elixir that now has
  // its effect (elixirs.mjs) says what that effect is at each level; the
  // Speed elixir, whose extra levels buy a choice, lists the choices.
  const effectBlock = alchemicalEffectOf(item);
  const speed = effectBlock?.plan === "speed";
  const storedPlan = alchemical.plan ?? null;

  const options = speed
    ? speedPlans(baseLevel).map((plan) => {
      const chosenNow = plan.level === current
        && (!storedPlan || (storedPlan.bonus === plan.bonus && storedPlan.duration === plan.duration));
      return `<option value="${plan.level}|${plan.bonus}|${plan.duration}"${chosenNow ? " selected" : ""}>Level ${
        plan.level} — ${alchemicalPrice(plan.level)} gp — +${plan.bonus} ft for ${plan.duration}</option>`;
    }).join("")
    : ALCHEMICAL_COST_TABLE
    .map((price, index) => index + 1)
    .filter((level) => level >= baseLevel)
    .map((level) => {
      const bomb = alchemical.bomb ? bombAt(item, level) : null;
      const other = scalingAt(item, level);
      const effect = bomb
        ? `${bomb.damage} ${bomb.damageType}${
          String(bomb.splash) !== "0" ? `, splash ${bomb.splash}` : ""}`
        : (effectBlock ? alchemicalLevelSummary(item, level) : "") || other?.summary || "as printed";
      return `<option value="${level}"${level === current ? " selected" : ""}>Level ${level} — ${
        alchemicalPrice(level)} gp — ${effect}</option>`;
    })
    .join("");

  const chosen = await DialogV2.wait({
    window: { title: `${item.name} — Craft at Level`, icon: "fa-solid fa-flask" },
    classes: ["trg-prime", "trg-alchemical-level"],
    position: { width: 480 },
    content: `<div class="trg-prime trg-builder-body">
      <p class="hint">${scaling?.text
    ? scaling.text.replace(/^Higher Level /, "")
    : "This item prints no scaling; only its price changes."}</p>
      <div class="form-group"><label>Level</label>
        <select class="trg-alchemical-level-select">${options}</select></div>
      <p class="hint">Its base level is ${baseLevel}; a level below that is not a thing the chapter makes.</p>
    </div>`,
    buttons: [
      { action: "apply", label: "Craft", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => String(
          (button.form ?? button.closest("form")).querySelector(".trg-alchemical-level-select").value) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!chosen || chosen === "cancel") return null;

  // A SPEED CHOICE IS "level|bonus|duration"; anything else is a level.
  const [levelText, planBonus, planDuration] = String(chosen).split("|");
  const level = Number(levelText);
  if (!Number.isFinite(level)) return null;
  const price = alchemicalPrice(level);
  await item.update({
    "system.itemLevel": level,
    "system.price": price,
    ...(speed ? { [`flags.${SYSTEM_ID}.alchemical.plan`]: { bonus: Number(planBonus), duration: String(planDuration) } } : {})
  });

  const bomb = alchemical.bomb ? bombAt(item, level) : null;
  const other = scalingAt(item, level);
  const now = effectBlock ? alchemicalLevelSummary(item, level) : "";
  await postCard(actor, `${item.name} — Crafted at Level ${level}`, [
    line(`<strong>Level ${level}</strong>, <strong>${price} gp</strong>.`),
    ...(bomb
      ? [line(`Now deals <strong>${bomb.damage} ${bomb.damageType}</strong>${
        String(bomb.persistent) !== "0" ? `, recurring ${bomb.persistent}` : ""}${
        String(bomb.splash) !== "0" ? `, splash ${bomb.splash}` : ""}${
        String(bomb.bleed) !== "0" ? `, bleed ${bomb.bleed}` : ""}.`)]
      : []),
    ...(now
      ? [line(`Now <strong>${now}</strong>.`)]
      : other?.summary ? [line(`Improved by <strong>${other.summary}</strong>.`)] : []),
    ...((bomb?.problems ?? []).map((problem) => line(`<em>${problem}</em>`))),
    // "APPLIED BY HAND" ONLY WHERE IT STILL IS. An item whose effect is
    // built (elixirs.mjs) applies its own ladder when it is used.
    ...(!effectBlock && !other?.parsed && scaling
      ? [line(`<em>${scaling.text.replace(/^Higher Level /, "")} — applied by hand.</em>`)]
      : [])
  ]);
  return { level, price };
}
