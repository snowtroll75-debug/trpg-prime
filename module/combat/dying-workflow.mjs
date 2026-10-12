import { DAMAGE_TYPES } from "../config.mjs";
import { isPeril } from "../peril.mjs";
import {
  RESPITE_FLAG, normaliseDelayedRespite, respiteCatches, respitePacket
} from "../magic/delayed-respite.mjs";
import {
  SHIELD_FLAG, normaliseSacrificingShield, shieldCatches, shieldSplit,
  shieldAbsorbedLine, shieldCasterGoneLine
} from "../magic/sacrificing-shield.mjs";
import { clearUnconsciousIfConscious, healingWhileDying, reapDead } from "./death-state.mjs";
import { resolveAgainstDefences } from "./damage-workflow.mjs";
import {
  hasNoDeathState,
  isCritOnlyDamage,
  ownedCreatureTypeSystem
} from "../creature-type-rules.mjs";
import {
  applyDyingChange,
  doomedInstantDeath,
  effectiveDeathState,
  massiveDamageInstantDeath,
  soulDrainInstantDeath,
  zeroHPDyingValue
} from "./turn-economy.mjs";
import { naturalHPHealing } from "../config.mjs";
import { spendTemporaryHP } from "./temporary-hp.mjs";
import {
  defensiveRollDamage, defensiveRollEligibility
} from "../companion-feats.mjs";

const { DialogV2 } = foundry.applications.api;

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
 * Applies a damage instance to an actor's HP, correctly branching
 * between three cases the rulebook treats very differently (Chapter 7,
 * Death & Dying):
 *
 * 1. Already Dying: damage does NOT reduce HP at all — it worsens the
 *    Dying condition instead (+1, or +2 on a critical).
 * 2. Not yet Dying, but this damage reaches or passes 0 HP: check
 *    Massive Damage first (instant death); otherwise clamp to 0 HP and
 *    apply Unconscious + Dying (1, or 2 on a critical).
 * 3. Not yet Dying, damage doesn't reach 0: a plain HP reduction.
 *
 * Returns a small result object describing what happened; the caller
 * is responsible for posting any chat output, matching how the rest of
 * this system separates mechanics from presentation.
 */
export async function applyDamageAndCheckDying(
  actor, damage, { isCritical = false, nonlethal = false, redirected = false, damageTypes = [], sourceLevel = null, sourceName = "" } = {}
) {
  // THE PERMISSION BOUNDARY (3.339.4). Writing HP to a target the current
  // user does not own is refused by Foundry, and the exception unwinds
  // the whole damage step — which is why a player's attack produced an
  // attack card, a critical injury card, and no damage card at all.
  // Wrapped HERE, at the shared primitive, so every route that damages
  // something — weapon attacks, spell effects, runes, bleed, criticals —
  // crosses the boundary through the same code rather than each call
  // site remembering to.
  //
  // A GM, and a player who genuinely owns the target, still write
  // directly: `relayDamage` only reaches for the socket when it must.
  if (actor && !actor.isOwner) {
    const { relayDamage } = await import("./target-relay-workflow.mjs");
    return relayDamage(actor, damage, { isCritical, nonlethal, redirected, damageTypes, sourceLevel, sourceName }, () =>
      applyDamageDirect(actor, damage, { isCritical, nonlethal, redirected, damageTypes, sourceLevel, sourceName }));
  }
  // A HEAL THAT ANSWERS THE BLOW (3.614.0, R9 — Wellspring Of Valour). Asked
  // after the blow lands, on whichever client wrote it.
  const hpBefore = Number(actor?.system?.resources?.hp?.value ?? 0);
  const result = await applyDamageDirect(actor, damage, { isCritical, nonlethal, redirected, damageTypes, sourceLevel, sourceName });
  await healAfterDamage(actor, hpBefore);
  // A KILL, FOR WHOEVER LISTENS (3.631.0): Souldrinker — "Trigger The
  // creature kills a living creature". The case names the death; the
  // source is who the damage said it was.
  if (["died-while-dying", "destroyed-no-death-state", "massive-damage-death"].includes(String(result?.case ?? ""))) {
    Hooks.callAll("trgPrimeCreatureSlain", { victim: actor, sourceName, sourceLevel, deathCase: result.case });
  }
  return result;
}

/**
 * Wellspring Of Valour's heal, the first time a creature in the aura takes
 * damage each round. See magic/damage-heal.mjs.
 */
async function healAfterDamage(actor, hpBefore) {
  const effects = Array.from(actor?.effects ?? []).filter((e) => !e.disabled && e.flags?.["trg-prime"]?.damageHeal);
  if (!effects.length) return;
  const { damageHealVerdict, DAMAGE_HEAL_FLAG, DAMAGE_HEAL_ROUND_FLAG } = await import("../magic/damage-heal.mjs");
  const { heldRoundKey } = await import("../magic/held-bonus.mjs");
  const combat = game.combat?.started ? game.combat : null;
  const nowKey = heldRoundKey({ combatId: combat?.id ?? null, round: combat?.round ?? null, worldTime: game.time?.worldTime ?? 0 });
  for (const effect of effects) {
    const spec = effect.flags["trg-prime"][DAMAGE_HEAL_FLAG];
    const hpAfter = Number(actor.system?.resources?.hp?.value ?? 0);
    const verdict = damageHealVerdict({
      hpBefore, hpAfter,
      dying: Boolean(actor.hasCondition?.("dying")),
      dead: Boolean(actor.hasCondition?.("dead")),
      spentKey: effect.flags["trg-prime"][DAMAGE_HEAL_ROUND_FLAG] ?? null,
      nowKey
    });
    if (verdict === "none" || verdict === "spent") continue;
    await effect.setFlag("trg-prime", DAMAGE_HEAL_ROUND_FLAG, nowKey);
    if (verdict === "withheld") {
      await ChatMessage.create({ content: `<div class="trg-prime"><p><em>${spec.label}: ${actor.name} is dying, so the wellspring's heal is withheld — the table decides.</em></p></div>` });
      continue;
    }
    const roll = await new Roll(spec.dice).evaluate();
    const max = Number(actor.system?.resources?.hp?.max ?? 0);
    const healed = Math.max(0, Math.min(roll.total, max - hpAfter));
    if (healed) await actor.update({ "system.resources.hp.value": hpAfter + healed });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime"><p><strong>${spec.label}</strong>: ${actor.name} first takes damage this round and regains <strong>${healed}</strong> HP (${spec.dice} = ${roll.total}).</p></div>`
    });
  }
}


/**
 * Store an incoming blow on a live Delayed Respite, if one is waiting.
 *
 * RETURNS THE PACKET OR NULL, so the primitive above can say "delayed"
 * rather than "none" — two different facts that would otherwise both
 * read as nothing having happened.
 */
const RESPITE_SYSTEM_ID = "trg-prime";

async function catchWithRespite(actor, damage, { isCritical, nonlethal }) {
  const effect = Array.from(actor?.effects ?? []).find((e) => {
    if (e.disabled) return false;
    const record = normaliseDelayedRespite(e.getFlag?.(RESPITE_SYSTEM_ID, RESPITE_FLAG));
    return respiteCatches(record, damage);
  });
  if (!effect) return null;
  const packet = respitePacket(damage, { isCritical, nonlethal });
  await effect.setFlag(RESPITE_SYSTEM_ID, RESPITE_FLAG, {
    ...(effect.getFlag(RESPITE_SYSTEM_ID, RESPITE_FLAG) ?? {}), packet
  });
  return packet;
}

/**
 * The caster a ward names, or null when they are no longer on the scene.
 *
 * A TOKEN UUID RESOLVES TO ITS ACTOR, because a ward placed from a token
 * on the canvas records the token and the HP lives on the actor. An
 * unlinked token has its own actor, which is exactly the one that should
 * take the wound.
 */
async function resolveShieldCaster(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    return doc?.actor ?? doc ?? null;
  } catch {
    return null;
  }
}

/**
 * Move part of this blow onto a Sacrificing Shield's caster.
 *
 * @returns {Promise<{absorbed: number, remaining: number}|null>} null when
 *   no ward fired, or when it fired and found nobody to take the wound —
 *   in both cases the target takes the whole blow.
 */
async function redirectWithShield(actor, damage) {
  const effect = Array.from(actor?.effects ?? []).find((e) => {
    if (e.disabled) return false;
    const record = normaliseSacrificingShield(e.getFlag?.(RESPITE_SYSTEM_ID, SHIELD_FLAG));
    return shieldCatches(record, damage);
  });
  if (!effect) return null;

  const record = normaliseSacrificingShield(effect.getFlag(RESPITE_SYSTEM_ID, SHIELD_FLAG));
  const split = shieldSplit(record, damage);

  // THE SPELL ENDS FIRST. This is the lesson Delayed Respite taught live
  // on 4 September, where the blow it released walked straight back into
  // its own gate and was caught a second time. The ward is spent by this
  // blow whatever follows, and deleting it before anything is applied is
  // what makes that true rather than hoped for.
  if (actor?.effects?.get?.(effect.id)) await effect.delete();

  const caster = await resolveShieldCaster(record.casterUuid);
  if (!caster) {
    // THE ONE CASE THAT STOPS THE REDIRECT, per Graham's ruling of
    // 5 September: dying, unconscious and out of range all still absorb;
    // a caster who no longer exists has no HP to absorb with. The ward is
    // spent all the same — it fired — and the card says why the blow
    // landed whole.
    await postCard(actor, record.label, [line(shieldCasterGoneLine(actor.name, record.label))]);
    return null;
  }

  // `redirected: true` IS THE LOOP GUARD. Two casters warding each other
  // would otherwise hand the same five points back and forth forever, and
  // a Delayed Respite on the caster would hold a wound that was never an
  // attack on them. A redirected wound crosses no ward of its own.
  await applyDamageAndCheckDying(caster, split.absorbed, { redirected: true });
  await postCard(caster, record.label, [
    line(shieldAbsorbedLine(caster.name, actor.name, split.absorbed, split.remaining))
  ]);
  return split;
}

/** The application itself, once the permission question is settled. */
async function applyDamageDirect(
  actor, damage, { isCritical = false, nonlethal = false, redirected = false, damageTypes = [], sourceLevel = null, sourceName = "" } = {}
) {
  // EVERY PATH RETURNS newHP. Five of them did not, and all five were
  // cases where the target had just reached 0 — so the damage card read
  // "Now undefined / 30 HP" at exactly the dramatic moment. Found live
  // at 3.239.0 by killing a Raider Thug with a critical.
  const incoming = Math.max(0, Math.floor(Number(damage) || 0));
  if (!incoming) return { case: "none", newHP: Number(actor.system?.resources?.hp?.value ?? 0) };
  // DAMAGE SINCE ITS LAST TURN (3.631.0): what Regeneration's lockout reads
  // — "damage of an amount equal to or greater than its regeneration in a
  // given round". Summed here, at the one primitive every route crosses;
  // cleared when its turn begins (creature-turn-start-workflow.mjs).
  if (actor.setFlag) {
    const since = Number(actor.getFlag?.("trg-prime", "damageSinceTurn") ?? 0) || 0;
    await actor.setFlag("trg-prime", "damageSinceTurn", since + incoming);
  }

  // IMPERVIOUS IN STASIS (3.614.0, R2): "the target becomes impervious to
  // all forms of damage". At the shared primitive, for the reason Delayed
  // Respite gives below — every route that damages something crosses here.
  if (Array.from(actor?.effects ?? []).some((e) => !e.disabled && e.flags?.["trg-prime"]?.stasis)) {
    return { case: "stasis", newHP: Number(actor.system?.resources?.hp?.value ?? 0) };
  }

  // A PERIL IS AN OBJECT (3.620.0; Chapter 12, Graham's R17): "Dealing damage
  // to a mechanical trap or another physical peril follows the rules for
  // damaging objects" — broken at 0 HP, destroyed at a negative half. It
  // never dies, so none of the machinery below runs for it. ONLY WITH ITS
  // PERIL SECTION SWITCHED ON: a creature that merely carries the `trap` tag
  // (a monster that lays snares) still bleeds and dies as a creature.
  if (isPeril(actor) && actor.system?.gm?.peril?.enabled) {
    const { perilTakesDamage } = await import("../peril-workflow.mjs");
    return perilTakesDamage(actor, incoming);
  }

  /*
   * DELAYED RESPITE CATCHES THE BLOW HERE (3.493.0).
   *
   * AT THE SHARED PRIMITIVE, for the reason the permission relay above
   * gives in its own comment: every route that damages something —
   * weapon attacks, spell effects, runes, bleed, criticals — crosses this
   * one place, so the spell is one gate rather than sixteen call sites
   * remembering to ask.
   *
   * ONLY THE DAMAGE. "No other effects of the attack take hold" is not
   * deferred: conditions are a separate path and a critical injury is
   * rolled inline in the attack workflow. Graham's ruling of 4 September
   * 2026 is to defer the number and print the rest, and the card says so
   * on every cast rather than letting a table infer it.
   *
   * ONE ATTACK, ONE PACKET — `respiteCatches` refuses a Respite that has
   * already caught one, so the second blow of a round lands now.
   */
  const held = await catchWithRespite(actor, incoming, { isCritical, nonlethal });
  if (held) {
    return {
      case: "delayed",
      newHP: Number(actor.system?.resources?.hp?.value ?? 0),
      delayed: held
    };
  }

  const creatureTypeSystem = ownedCreatureTypeSystem(actor);

  // Creature Type: Plant — "only take damage and bleed from critical
  // injuries." Non-critical damage never reaches HP at all. The book's own
  // exception (a critical description that wouldn't "directly affect
  // their anatomy") is a GM judgement call with nothing in a critical's
  // data to test automatically, so it isn't automated here — see
  // isCritOnlyDamage in creature-type-rules.mjs.
  if (isCritOnlyDamage(creatureTypeSystem) && !isCritical) {
    return {
      case: "no-damage-not-critical",
      newHP: Number(actor.system?.resources?.hp?.value ?? 0)
    };
  }

  // Temporary HP absorbs first, before any of the dying machinery runs:
  // damage stopped by a temporary pool never reached the character, so
  // it can't worsen a Dying value or trigger Massive Damage either.
  const absorbed = await spendTemporaryHP(actor, incoming);
  let amount = absorbed.damageRemaining;
  if (!amount) {
    return {
      case: "absorbed",
      absorbed: absorbed.absorbed,
      newHP: Number(actor.system?.resources?.hp?.value ?? 0)
    };
  }

  /*
   * SACRIFICING SHIELD TAKES ITS SHARE HERE (3.499.0).
   *
   * BELOW TEMPORARY HP, AND THAT IS THE DELIBERATE HALF. "The HP damage
   * that would have been inflicted upon them is reduced by 5" — damage a
   * temporary pool swallowed inflicted no HP damage at all, so a ward
   * placed above the pool would be spent on a blow its ally shrugged off.
   * A one-round ward lost to a scratch that never landed is the same
   * waste `shieldCatches` refuses for a zero blow.
   *
   * BELOW THE PLANT CHECK FOR THE SAME REASON: non-critical damage to a
   * Plant never reaches HP, so there is nothing there to redirect.
   *
   * AND ABOVE THE DYING MACHINERY, because the caster's five points are
   * meant to be the five the ally does not take — deciding Massive Damage
   * or a Dying value on a number the ward has already reduced is the
   * whole point of the spell.
   */
  if (!redirected) {
    const redirect = await redirectWithShield(actor, amount);
    if (redirect) {
      amount = redirect.remaining;
      if (!amount) {
        return {
          case: "redirected",
          redirected: redirect.absorbed,
          newHP: Number(actor.system?.resources?.hp?.value ?? 0)
        };
      }
    }
  }

  /*
   * A SHARE A MODULE TAKES (3.630.0) — Pillars of Faith's Martyr's Aegis:
   * "when an ally within 10 feet takes HP damage, you may take up to half of
   * what remains after their defences". Asked where Sacrificing Shield is,
   * for the same reasons: below temporary HP, above the dying machinery.
   * A module's `share(actor, amount, ctx)` returns `{ taken }` — what it
   * moved elsewhere — and writes the other creature's damage itself.
   */
  if (!redirected && amount > 0) {
    const { registeredDamageShares } = await import("../module-api.mjs");
    for (const share of registeredDamageShares()) {
      try {
        const out = await share(actor, amount, { damageTypes, sourceName, isCritical, nonlethal });
        const taken = Math.max(0, Math.min(amount, Math.trunc(Number(out?.taken) || 0)));
        amount -= taken;
      } catch (err) {
        console.warn("TRG Prime | a module's damage share failed", err);
      }
      if (!amount) {
        return { case: "redirected", redirected: 0, newHP: Number(actor.system?.resources?.hp?.value ?? 0) };
      }
    }
  }

  const hp = actor.system?.resources?.hp;
  const maxHP = Number(hp?.max ?? 0);
  const alreadyDying = Boolean(actor.hasCondition?.("dying"));

  if (alreadyDying) {
    // Subdual (Chapter 7) is damage "delivered to purposefully disable an
    // opponent rather than kill them", and explicitly never inflicts
    // Dying. A creature already Dying is already at 0 HP, so there is
    // nothing for nonlethal damage to reduce and nothing it may worsen.
    // The rulebook doesn't state this case; recorded as an
    // interpolation from the rule's own intent rather than assumed.
    if (nonlethal) {
      return { case: "nonlethal-no-effect", nonlethal: true, newHP: 0 };
    }

    const currentDying = Number(actor.getConditionValue?.("dying") ?? 1);
    const deathState = effectiveDeathState(
      actor.system?.combat?.deathState ?? 5,
      actor.getConditionValue?.("doomed") ?? 0
    );
    const result = applyDyingChange({
      dying: currentDying,
      delta: isCritical ? 2 : 1,
      deathState
    });

    if (result.dead) {
      await actor.toggleStatusEffect("dying", { value: result.dying });
      // Skull on, out of the initiative order. Every death path reaps, so
      // that none of them can be the one that leaves a corpse taking turns.
      const reaped = await reapDead(actor);
      // A "would die" guard (3.630.0) answered at the reaper.
      if (reaped.spared) return { case: "spared", guard: reaped.spared.label, newHP: reaped.spared.hp };
      return { case: "died-while-dying", dying: result.dying, deathState, newHP: 0 };
    }

    await actor.toggleStatusEffect("dying", { value: result.dying });
    return { case: "worsened-while-dying", dying: result.dying, delta: isCritical ? 2 : 1, newHP: 0 };
  }

  const hpBefore = Number(hp?.value ?? 0);

  if (amount < hpBefore) {
    const newValue = hpBefore - amount;
    await actor.update({ "system.resources.hp.value": newValue });
    return { case: "reduced", newHP: newValue };
  }

  // This damage reaches or passes 0 HP.

  // Subdual (Chapter 7): "any target you reduce to 0 hit points gains the
  // unconscious condition and does not gain the dying condition." Checked
  // before Massive Damage, since instant death is exactly what damage
  // meant to disable rather than kill must not cause.
  if (nonlethal) {
    await actor.update({ "system.resources.hp.value": 0 });
    await actor.toggleStatusEffect("unconscious", { active: true });
    return { case: "knocked-out", nonlethal: true, newHP: 0 };
  }

  // A DEATH GUARD (3.627.0): "if damage would reduce you to 0 HP … you drop
  // to 1 HP instead" — Unliving Fortitude, Zombie Fortitude, Gaseous Escape.
  // Asked after subdual and before everything below, because a creature left
  // at 1 HP neither dies of massive damage nor is destroyed nor is Dying.
  // See combat/death-guard.mjs.
  {
    const { tryDeathGuards } = await import("./death-guard-workflow.mjs");
    const guarded = await tryDeathGuards(actor, {
      damageTypes, sourceLevel, sourceName,
      // Second Heart (3.630.0) answers neither of these.
      massive: massiveDamageInstantDeath(amount, hpBefore, maxHP),
      noDeathState: hasNoDeathState(creatureTypeSystem)
    });
    if (guarded) return guarded;
  }

  // Creature Type: Construct, Elemental, Undead — "has no Death State and
  // is destroyed when it reaches 0 HP" (Construct's own line, "When a
  // construct is reduced to 0 hit points it is destroyed," is the same
  // rule without repeating the phrase — see hasNoDeathState's own docs).
  // This system has no separate "dead"/"destroyed" status at all: setting
  // Dying one past effective Death State IS how "the character has died"
  // is represented everywhere else, so instant destruction reuses that
  // exact shape rather than inventing new state — the same call Massive
  // Damage makes just below.
  if (hasNoDeathState(creatureTypeSystem)) {
    const deathState = effectiveDeathState(
      actor.system?.combat?.deathState ?? 5,
      actor.getConditionValue?.("doomed") ?? 0
    );
    await actor.update({ "system.resources.hp.value": 0 });
    await actor.toggleStatusEffect("dying", { value: deathState + 1 });
    const reaped = await reapDead(actor);
    if (reaped.spared) return { case: "spared", guard: reaped.spared.label, newHP: reaped.spared.hp };
    return { case: "destroyed-no-death-state", maxHP, newHP: 0 };
  }

  if (massiveDamageInstantDeath(amount, hpBefore, maxHP)) {
    const deathState = effectiveDeathState(
      actor.system?.combat?.deathState ?? 5,
      actor.getConditionValue?.("doomed") ?? 0
    );
    await actor.update({ "system.resources.hp.value": 0 });
    await actor.toggleStatusEffect("dying", { value: deathState + 1 });
    const reaped = await reapDead(actor);
    if (reaped.spared) return { case: "spared", guard: reaped.spared.label, newHP: reaped.spared.hp };
    return { case: "massive-damage-death", excess: amount - hpBefore, maxHP, newHP: 0 };
  }

  const dying = zeroHPDyingValue(isCritical);
  await actor.update({ "system.resources.hp.value": 0 });
  await actor.toggleStatusEffect("dying", { value: dying });
  return { case: "reached-zero", dying, newHP: 0 };
}

/**
 * A creature put AT a stated hit-point total at or below zero, rather
 * than damaged down to one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY IT IS NOT `applyDamageAndCheckDying`.
 *
 * Word Of Death's Failure reads "otherwise it drops to -10 HP". That is
 * a DESTINATION, not an amount: nothing was dealt, so there is nothing
 * for resistance to halve and nothing for Massive Damage to measure. A
 * creature on 300 HP dropped to -10 has not taken a massive blow, and
 * asking the instant-death rule a second question would let hit points
 * the spell deliberately ignored decide the outcome anyway.
 *
 * GRAHAM'S RULING, 4 September 2026, having been shown that 3.485.0 wrote
 * the hit points and told the dying machinery nothing — a creature
 * sitting at -10 with no Dying condition at all: the drop goes through
 * the same dying check as any other route to zero or below. The creature
 * is Dying, and its own Death State decides whether it survives. -10 is
 * simply where the spell leaves the body.
 *
 * SO THIS MIRRORS THE `reached-zero` BRANCH DIRECTLY ABOVE, and sits
 * beside it on purpose: same `zeroHPDyingValue`, same no-Death-State
 * destruction, same reaper. `verify-flat-ladder` asserts the two agree,
 * because two copies of a rule agree right up until somebody edits one.
 *
 * @param {Actor} actor
 * @param {number} finalHP where the effect states the creature ends up
 * @param {object} [options]
 * @param {boolean} [options.isCritical]
 * @returns {Promise<object>}
 */
export async function enterDyingAt(actor, finalHP, { isCritical = false } = {}) {
  if (!actor) return { case: "none", newHP: 0 };
  const hp = Math.trunc(Number(finalHP) || 0);

  // ABOVE ZERO IS NOT A DROP INTO DYING. A ladder naming a positive
  // destination is setting hit points and nothing more; routing that
  // through the dying rule would invent a condition the effect never
  // mentioned.
  if (hp > 0) {
    await actor.update({ "system.resources.hp.value": hp });
    return { case: "set-above-zero", newHP: hp };
  }

  const deathState = effectiveDeathState(
    actor.system?.combat?.deathState ?? 5,
    actor.getConditionValue?.("doomed") ?? 0
  );

  // A construct, elemental or undead has no Death State and is destroyed
  // the moment it reaches 0. Reaching -10 is no different.
  if (hasNoDeathState(ownedCreatureTypeSystem(actor))) {
    await actor.update({ "system.resources.hp.value": hp });
    await actor.toggleStatusEffect("dying", { value: deathState + 1 });
    const reaped = await reapDead(actor);
    if (reaped.spared) return { case: "spared", guard: reaped.spared.label, newHP: reaped.spared.hp };
    return { case: "destroyed-no-death-state", deathState, newHP: hp };
  }

  const dropped = zeroHPDyingValue(isCritical);
  await actor.update({ "system.resources.hp.value": hp });
  await actor.toggleStatusEffect("dying", { value: dropped });
  return { case: "dropped-below-zero", dying: dropped, deathState, newHP: hp };
}

/**
 * Sheet entry point: prompts for the damage amount and whether it was a
 * critical hit, applies it via applyDamageAndCheckDying, and posts a
 * result card. This is the general-purpose counterpart to the
 * bleed/recurring damage handling already automated in Phase 3 of the
 * turn — for weapon and spell damage, where application to HP is a
 * deliberate, separate step the GM triggers once a hit is confirmed.
 */
/** Every feat name on an actor, for the Companion-feat gates below. */
function ownedFeatNames(actor) {
  return Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => i.name);
}

/**
 * The Defensive Roll tickbox, or nothing at all.
 *
 * Rendered only when the actor owns the feat, so the dialog every other
 * creature in the world sees is unchanged. The row is offered whatever
 * damage type is currently selected — the dropdown has not been touched
 * when this string is built — and `applyDamage` re-checks eligibility
 * against the type actually chosen before halving anything.
 */
function defensiveRollRow(actor) {
  const { available, tier } = defensiveRollEligibility({
    featNames: ownedFeatNames(actor), damageType: ""
  });
  if (!available) return "";
  return `
        <div class="form-group">
          <label><input type="checkbox" name="defensiveRoll"> Spend a reaction: <strong>${tier}</strong> (halve the damage)</label>
        </div>
        <p class="hint">Halved after DR and resistances. Never applies to Mental or Poison${
    tier === "Defensive Roll" ? "; the base feat covers physical attacks only" : ""
  }.</p>`;
}

export async function applyDamage(actor) {
  const result = await DialogV2.wait({
    window: { title: `${actor.name} — Apply Damage`, icon: "fa-solid fa-heart-crack" },
    classes: ["trg-prime"],
    position: { width: 340 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label for="trg-apply-damage-amount">Damage amount</label>
          <input id="trg-apply-damage-amount" type="number" name="amount" value="0" min="0">
        </div>
        <div class="form-group">
          <label for="trg-apply-damage-type">Damage type</label>
          <select id="trg-apply-damage-type" name="damageType">
            <option value="">Untyped (ignores resistances)</option>
            ${Object.entries(DAMAGE_TYPES)
              .map(([key, meta]) => `<option value="${key}">${meta.label}</option>`)
              .join("")}
          </select>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="isCritical"> This was a critical hit</label>
        </div>
        ${defensiveRollRow(actor)}
        <p class="hint">A typed amount is run through the target's DR, immunities, weaknesses and resistances. Untyped is applied exactly as entered.</p>
      </div>`,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  const entered = Number(result.amount || 0);
  const isCritical = Boolean(result.isCritical);
  const damageType = String(result.damageType || "");

  // Typed damage goes through the pipeline; untyped is applied as
  // entered, which is what a GM asking for "8 damage" means. Before this
  // the dialog was always untyped and there was no way to say otherwise.
  const packet = damageType
    ? resolveAgainstDefences(actor.system, {
        amount: entered,
        type: damageType,
        creatureTypeSystem: ownedCreatureTypeSystem(actor)
      })
    : null;
  const afterDefences = packet ? packet.taken : entered;

  const lines = [];
  if (packet) {
    lines.push(line(`<em>${packet.steps.join(" \u2192 ")}</em>`));
  }
  if (packet && packet.immune) {
    await postCard(actor, `${actor.name} — Apply Damage`, lines);
    return { case: "immune", newHP: Number(actor.system?.resources?.hp?.value ?? 0) };
  }

  // Defensive Roll (Companion feat): "it can use its reaction to halve
  // the damage... the damage is halved after applying DR and other
  // applicable resistances." AFTER the pipeline, which is why this lives
  // here rather than anywhere in the attack workflow — nothing between
  // an attack's roll and the target's HP asks the target anything, so a
  // defensive reaction has to be taken where the damage is entered.
  //
  // Re-checked against the type actually chosen rather than trusting the
  // tickbox: the row was rendered before the player touched the dropdown,
  // and they may have ticked it and then selected Poison.
  const eligibility = defensiveRollEligibility({
    featNames: ownedFeatNames(actor), damageType
  });
  const halved = Boolean(result.defensiveRoll) && eligibility.available;
  const amount = halved ? defensiveRollDamage(afterDefences) : afterDefences;
  if (result.defensiveRoll && !eligibility.available) {
    lines.push(line(`<em>Defensive Roll not applied — ${eligibility.reason}</em>`));
  }
  if (halved) {
    lines.push(line(
      `<strong>${eligibility.tier}</strong> — reaction spent, ${afterDefences} halved to <strong>${amount}</strong> after DR and resistances.`
    ));
  }

  const outcome = await applyDamageAndCheckDying(actor, amount, { isCritical });

  switch (outcome.case) {
    case "none":
      lines.push(line("No damage applied."));
      break;
    case "reduced":
      lines.push(line(`Takes <strong>${amount}</strong> damage. Now <strong>${outcome.newHP}</strong> HP.`));
      break;
    case "reached-zero":
      lines.push(
        line(`Takes <strong>${amount}</strong> damage, reduced to 0 HP. Gains <strong>Unconscious and Dying ${outcome.dying}</strong>${isCritical ? " (critical hit)" : ""}.`)
      );
      break;
    case "massive-damage-death":
      lines.push(
        line(`<strong>Massive Damage.</strong> ${amount} damage against ${outcome.maxHP} max HP — excess of ${outcome.excess} meets or exceeds max HP. <strong>The character dies instantly.</strong>`)
      );
      break;
    case "worsened-while-dying":
      lines.push(
        line(`<strong>Already Dying — no HP lost.</strong> Dying rises to <strong>${outcome.dying}</strong> instead${isCritical ? " (critical hit, +2)" : " (+1)"}.`)
      );
      break;
    case "died-while-dying":
      lines.push(
        line(`Dying rises to ${outcome.dying}, exceeding Death State ${outcome.deathState}. <strong>The character has died.</strong>`)
      );
      break;
    case "spared":
      lines.push(line(`Takes <strong>${amount}</strong> damage — the blow would have killed, but <strong>${outcome.guard}</strong> answers it. Now <strong>${outcome.newHP}</strong> HP.`));
      break;
    default:
      break;
  }

  await postCard(actor, "Apply Damage — Result", lines);
  return outcome;
}

/**
 * Sets the Doomed condition value and checks for instant death
 * immediately — "If your Death State is reduced to 0, you instantly
 * die" is independent of any Dying check, so this needs to be checked
 * the moment Doomed changes rather than only during the next dying
 * roll. Doomed's own recovery ("decreases by 1 each full night's rest")
 * is applied by the rest workflow at 3.363.0 — this comment used to say
 * it was left to the GM because "there's no dedicated rest workflow
 * anywhere in this system to hook into", which had stopped being true
 * and went on explaining the omission anyway.
 */
export async function setDoomed(actor, value) {
  const doomed = Math.max(0, Math.floor(Number(value) || 0));
  const baseDeathState = Number(actor.system?.combat?.deathState ?? 5);

  if (doomed <= 0) {
    await actor.toggleStatusEffect("doomed", { active: false });
    await postCard(actor, "Doomed", [line("No longer Doomed.")]);
    return { doomed: 0, died: false };
  }

  await actor.toggleStatusEffect("doomed", { value: doomed });

  const effective = effectiveDeathState(baseDeathState, doomed);
  const lines = [
    line(`Doomed ${doomed}. Death State ${baseDeathState} \u2192 <strong>${effective}</strong>.`)
  ];

  if (doomedInstantDeath(baseDeathState, doomed)) {
    lines.push(line("<strong>Death State reduced to 0 — the character dies instantly.</strong>"));
    await actor.toggleStatusEffect("dying", { value: baseDeathState + 1 });
    await postCard(actor, "Doomed", lines);
    return { doomed, died: true };
  }

  await postCard(actor, "Doomed", lines);
  return { doomed, died: false };
}

/** Sheet entry point: prompts for the new Doomed value, then applies it. */
export async function promptSetDoomed(actor) {
  const current = Number(actor.getConditionValue?.("doomed") ?? 0);

  const result = await DialogV2.wait({
    window: { title: `${actor.name} — Doomed` },
    classes: ["trg-prime"],
    position: { width: 320 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label for="trg-doomed-value">Doomed value</label>
          <input id="trg-doomed-value" type="number" name="doomed" value="${current}" min="0">
        </div>
      </div>`,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  return setDoomed(actor, result.doomed);
}

/**
 * Sets the Soul Drain condition value and checks for instant death
 * immediately — "if the amount of Soul Drain damage reduces your
 * maximum hit points to less than 0, you die" is an immediate
 * consequence of the value changing, not something that waits for a
 * later check. Because derived hp.max already has the *current* Soul
 * Drain subtracted (Chapter documents/actor.mjs), the base max HP is
 * reconstructed by adding that current value back before evaluating
 * the new one.
 */
export async function setSoulDrain(actor, value) {
  const newDrain = Math.max(0, Math.floor(Number(value) || 0));
  const currentDrain = Number(actor.getConditionValue?.("soulDrain") ?? 0);
  const baseMaxHP = Number(actor.system?.resources?.hp?.max ?? 0) + currentDrain;

  if (newDrain <= 0) {
    await actor.toggleStatusEffect("soulDrain", { active: false });
    await postCard(actor, "Soul Drain", [line("No longer suffering Soul Drain.")]);
    return { soulDrain: 0, died: false };
  }

  await actor.toggleStatusEffect("soulDrain", { value: newDrain });

  const lines = [
    line(`Soul Drain ${newDrain}. Max HP ${baseMaxHP} \u2192 <strong>${Math.max(0, baseMaxHP - newDrain)}</strong>.`)
  ];

  if (soulDrainInstantDeath(baseMaxHP, newDrain)) {
    lines.push(line("<strong>Max HP reduced below 0 — the character dies.</strong>"));
    const deathState = effectiveDeathState(
      actor.system?.combat?.deathState ?? 5,
      actor.getConditionValue?.("doomed") ?? 0
    );
    await actor.toggleStatusEffect("dying", { value: deathState + 1 });
    await postCard(actor, "Soul Drain", lines);
    return { soulDrain: newDrain, died: true };
  }

  await postCard(actor, "Soul Drain", lines);
  return { soulDrain: newDrain, died: false };
}

/** Sheet entry point: prompts for the new Soul Drain value, then applies it. */
export async function promptSetSoulDrain(actor) {
  const current = Number(actor.getConditionValue?.("soulDrain") ?? 0);

  const result = await DialogV2.wait({
    window: { title: `${actor.name} — Soul Drain` },
    classes: ["trg-prime"],
    position: { width: 320 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">A full night's rest heals 5 Soul Drain automatically. Set a new value here for anything else that changes it.</p>
        <div class="form-group">
          <label for="trg-soul-drain-value">Soul Drain value</label>
          <input id="trg-soul-drain-value" type="number" name="soulDrain" value="${current}" min="0">
        </div>
      </div>`,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  return setSoulDrain(actor, result.soulDrain);
}

/**
 * Natural Healing (Chapter 7): "You recover one tenth of your Total
 * HPs for every full hour of rest in a safe environment." Prompts for
 * hours rested, applies the healing (capped at max HP).
 */
export async function rollNaturalHealing(actor) {
  const result = await DialogV2.wait({
    window: { title: `${actor.name} — Natural Healing`, icon: "fa-solid fa-bed" },
    classes: ["trg-prime"],
    position: { width: 320 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">1/10 of max HP per full hour of rest in a safe environment.</p>
        <div class="form-group">
          <label for="trg-heal-hours">Hours rested</label>
          <input id="trg-heal-hours" type="number" name="hours" value="8" min="0">
        </div>
      </div>`,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  const hours = Number(result.hours || 0);
  const hp = actor.system?.resources?.hp;
  const maxHP = Number(hp?.max ?? 0);
  const current = Number(hp?.value ?? 0);
  const healed = naturalHPHealing(maxHP, hours);

  // Natural healing is non-magical, so it "has no effect on you" while Dying
  // (Graham, 13 Aug 2026). A dying character does not quietly rest it off.
  const rule = healingWhileDying({
    dying: Boolean(actor.hasCondition?.("dying")),
    magical: false
  });
  if (!rule.healsHP) {
    await postCard(actor, "Natural Healing", [
      line(`<strong>${actor.name} is Dying</strong> — non-magical healing has no effect. Use the Resuscitation (Medicine) action, or magical healing.`)
    ]);
    return { healed: 0, newValue: current };
  }

  const newValue = Math.min(maxHP, current + healed);

  await actor.update({ "system.resources.hp.value": newValue });
  if (newValue > 0 && current <= 0) await clearUnconsciousIfConscious(actor);

  await postCard(actor, "Natural Healing", [
    line(`Rests ${hours} hour${hours === 1 ? "" : "s"}, recovering <strong>${newValue - current}</strong> HP. Now <strong>${newValue} / ${maxHP}</strong> HP.`)
  ]);
  return { healed: newValue - current, newValue };
}
