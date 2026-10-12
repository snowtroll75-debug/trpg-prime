/**
 * Turning combat events into reaction-feat offers.
 *
 * `attack-workflow.mjs` calls in here once, at the seam where a swing has
 * fully resolved — the attacker, the defender, the outcome, whether a
 * fumble was confirmed and what the damage did are all known together
 * exactly once, and this is the only place that is true.
 *
 * ONE CALL, FIVE TRIGGERS. Five separate hooks into that function would
 * be five things to keep in step with it, and the attack workflow is the
 * single busiest file in the system. See reaction-feats.mjs for what
 * each trigger means.
 *
 * NOTHING HERE MAY THROW INTO THE ATTACK. Every entry point is wrapped;
 * the caller fires and forgets. A reaction offer that failed to build is
 * a missing button, which is a nuisance; an exception escaping into
 * `rollWeaponAttack` would abort a resolved attack, which is a disaster.
 * `opportunity.mjs` swallows for the same reason and says so.
 */

import { activeToken, distanceBetween } from "./geometry.mjs";
import { foeState, offerReactionFeats } from "./reaction-feats-workflow.mjs";
import { TRIGGERS, incapacitated, standingFoe } from "./reaction-feats.mjs";

const SYSTEM_ID = "trg-prime";
const CHAIN_FLAG = "cleaveChain";

const esc = (text) => String(text ?? "").replace(
  /[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Tokens whose actor could plausibly react, excluding the ones named. */
function candidatesNear(token, feet, { exclude = [], side = null } = {}) {
  const excluded = new Set(exclude.filter(Boolean).map((t) => t.id));
  const out = [];
  for (const other of canvas?.tokens?.placeables ?? []) {
    if (!other.actor || excluded.has(other.id)) continue;
    if (side !== null) {
      const same = Number(other.document?.disposition ?? 0) === side;
      if (!same) continue;
    }
    const distance = distanceBetween(token, other);
    if (distance === null || distance > feet) continue;
    out.push({ actor: other.actor, token: other });
  }
  return out;
}

/** Melee reach in feet, defaulting to the 5 ft everything has. */
function reachFeet(actor) {
  return Math.max(5, Number(actor?.system?.combat?.reach ?? 0) || 5);
}

/**
 * Every offer a resolved attack can produce.
 *
 * @param {object} ctx  everything `rollWeaponAttack` knows at its seam
 */
export async function detectAttackReactions({
  actor, attackerToken, targetActor, targetToken, outcome, confirmedFumble, damageOutcome, check
} = {}) {
  try {
    const attackerTok = attackerToken ?? activeToken(actor);
    if (!attackerTok) return;
    const sceneId = attackerTok.scene?.id ?? canvas?.scene?.id ?? null;
    const attackTotal = Number(check?.outcome?.total ?? 0);
    const attackDC = Number(check?.outcome?.dc ?? 0);
    const base = {
      sceneId,
      attackerTokenId: attackerTok.id,
      targetTokenId: targetToken?.id ?? null,
      attackTotal,
      attackDC
    };

    /* --- the attacker's own side ---------------------------------- */

    // ALLIED STRIKE fires on taking an attack action at all — hit or
    // miss. "Trigger You take an action with the attack trait."
    await offerReactionFeats({
      trigger: TRIGGERS.youAttacked,
      headline: `<strong>${esc(actor?.name)}</strong> attacks — an ally may be spurred to strike.`,
      candidates: [{ actor, token: attackerTok }],
      context: base
    });

    // CLEAVE needs the Strike to have DROPPED its target, and another
    // foe to be in reach. Both are asked here rather than on the button,
    // so a card that appears is a card worth pressing.
    const dropped = incapacitated({
      damageCase: damageOutcome?.damageCase ?? "",
      newHP: damageOutcome?.newHP ?? null,
      unconscious: Boolean(targetActor?.hasCondition?.("unconscious")),
      dying: Boolean(targetActor?.hasCondition?.("dying"))
    });
    // PRESS THE ADVANTAGE (Fighter, 4th) fires on the same moment, and
    // needs nothing else — no second foe, no reach. "Once per round, when
    // you achieve one of the following... You disable an enemy (either
    // reducing to 0 HP, killing them or rendering them unconscious)."
    //
    // WIRED HERE AT 3.555.0, and it should have been from the start. The
    // ability's own comment said the Use button covered "the two [the
    // system] cannot [see] — the enemy you disabled, the enemy who
    // fumbled at you", and the pages 51-60 audit caught that the first
    // half stopped being true: `dropped` above is exactly that fact, and
    // it is already computed on this line for Cleave.
    //
    // THE SAME `incapacitated` BOTH FEATS ASK, deliberately: Graham's
    // ruling of 21 August 2026 fixed "0 HP, Unconscious or Dying" as
    // what dropping a creature means, and a second definition here would
    // be a second thing to keep in step with it. The enemy-fumble
    // trigger stays on the button — that is a fumble on somebody else's
    // attack, measured against your reach.
    if (dropped) {
      import("./attack-workflow.mjs")
        .then((m) => m.maybePromptPressTheAdvantage(
          actor,
          `${targetActor?.name ?? "an enemy"} disabled`
        ))
        .catch(() => {});
    }
    if (dropped) {
      const others = candidatesNear(attackerTok, reachFeet(actor), { exclude: [attackerTok, targetToken] })
        .filter(({ token }) =>
          Number(token.document?.disposition ?? 0) !== Number(attackerTok.document?.disposition ?? 0))
        // …AND STILL STANDING. Counting the fallen told a Cleaver there
        // were "2 other foes still in reach" when both were corpses.
        .filter(({ actor: other }) => standingFoe(foeState(other)));
      if (others.length) {
        await offerReactionFeats({
          trigger: TRIGGERS.incapacitatedInReach,
          headline: `<strong>${esc(actor?.name)}</strong> drops <strong>${esc(targetActor?.name ?? "a foe")}</strong>`
            + ` — <strong>${others.length}</strong> other foe${others.length === 1 ? "" : "s"} still in reach.`,
          candidates: [{ actor, token: attackerTok }],
          // A CHAIN ALREADY RUNNING MAKES THIS OFFER FREE. The flag is
          // set when Cleave is first taken and cleared when the reaction
          // pool refills.
          context: { ...base, chainFree: Boolean(actor?.getFlag?.(SYSTEM_ID, CHAIN_FLAG)) }
        });
      }
    }

    // KNIFE FLURRY (Chapter 5) is not a reaction, but it is TRIGGERED the
    // same way — "after a successful attack with a knife weapon, you may
    // make a Feint as a 0 AP action". Graham's ruling, 21 August 2026:
    // deliver it as a card, because a feat that only fires after your own
    // hit is one you forget you have.
    //
    // It rides this file's machinery rather than growing a second copy —
    // but it is offered through its own module, since it costs no
    // reaction and belongs to the action-feat family.
    if (outcome?.hits) {
      import("./action-feat-detection.mjs")
        .then((m) => m.offerKnifeFlurry(actor, attackerTok, base))
        .catch(() => {});
    }

    /* --- the defender's side --------------------------------------- */

    // ARMOURED COUNTER is explicitly "inflicts HP damage with NO
    // critical"; Self Preservation only asks that the attack damaged
    // you. Both need real HP damage, which is why `taken` is checked
    // rather than `outcome.hits` — a blow entirely absorbed by DR hit,
    // and inflicted nothing.
    const tookDamage = Number(damageOutcome?.taken ?? 0) > 0;
    if (targetActor && tookDamage) {
      const noCritical = !outcome?.critical;
      await offerReactionFeats({
        trigger: TRIGGERS.damagedYou,
        headline: `<strong>${esc(targetActor.name)}</strong> is wounded by <strong>${esc(actor?.name)}</strong>`
          + (noCritical ? "." : " — <em>a critical, so Armoured Counter does not apply</em>."),
        candidates: [{ actor: targetActor, token: targetToken }],
        context: { ...base, noCritical }
      });

      /* --- everyone standing near the victim ----------------------- */

      // "An enemy damages your ally, and both are within 10 feet of
      // you" — Chance of Redemption and Strike of Retribution.
      if (targetToken) {
        const nearby = candidatesNear(targetToken, 10, { exclude: [targetToken, attackerTok] })
          .filter(({ token }) =>
            Number(token.document?.disposition ?? 0) === Number(targetToken.document?.disposition ?? 0))
          .filter(({ token }) => {
            const toAttacker = distanceBetween(token, attackerTok);
            return toAttacker !== null && toAttacker <= 10;
          });
        if (nearby.length) {
          await offerReactionFeats({
            trigger: TRIGGERS.damagedAlly,
            headline: `<strong>${esc(actor?.name)}</strong> wounds <strong>${esc(targetActor.name)}</strong>`
              + " — an ally within 10 ft of both may answer.",
            candidates: nearby,
            context: base
          });
        }
      }
    }

    // GUARDIAN DEFENCE is about being HIT, not about damage — "an ally
    // within your melee reach is hit by an attack". A blow that hits and
    // is soaked entirely still needs guarding against next time, and the
    // Aid reduces the attack rather than the damage.
    if (targetActor && targetToken && outcome?.hits) {
      const guards = candidatesNear(targetToken, 5, { exclude: [targetToken, attackerTok] })
        .filter(({ token }) =>
          Number(token.document?.disposition ?? 0) === Number(targetToken.document?.disposition ?? 0));
      if (guards.length) {
        await offerReactionFeats({
          trigger: TRIGGERS.allyHit,
          headline: `<strong>${esc(targetActor.name)}</strong> is hit — an ally in reach may throw in a guard.`,
          candidates: guards,
          context: base
        });
      }
    }

    /* --- the shield turned it -------------------------------------- */

    // DISARM BLOCK: "an attack fails to inflict damage to you due to
    // missing by your Shield DB" — not any miss, but a miss the shield
    // is responsible for. Without the shield's contribution the blow
    // would have landed, which is exactly the arithmetic below and the
    // reason `system.combat.shield.db` had to be published.
    if (targetActor && targetToken && outcome?.hits === false) {
      const shieldDB = Number(targetActor.system?.combat?.shield?.db ?? 0);
      const withoutShield = attackDC - shieldDB;
      if (shieldDB > 0 && attackTotal < attackDC && attackTotal >= withoutShield) {
        await offerReactionFeats({
          trigger: TRIGGERS.missedByShield,
          headline: `<strong>${esc(targetActor.name)}</strong>'s shield turns the blow — `
            + `${attackTotal} would have beaten DB ${withoutShield} without it.`,
          candidates: [{ actor: targetActor, token: targetToken }],
          context: base
        });
      }
    }

    /* --- the fumble ------------------------------------------------- */

    // "A creature within your reach fumbles a Strike." Offered to
    // everyone who threatens the fumbler, not only to their target — the
    // clause is about reach, and a Fighter beside the pair qualifies.
    if (confirmedFumble) {
      const riposters = candidatesNear(attackerTok, 5, { exclude: [attackerTok] })
        .filter(({ token }) =>
          Number(token.document?.disposition ?? 0) !== Number(attackerTok.document?.disposition ?? 0))
        .filter(({ actor: other }) => distanceBetween(activeToken(other), attackerTok) <= reachFeet(other));
      if (riposters.length) {
        await offerReactionFeats({
          trigger: TRIGGERS.fumbleInReach,
          headline: `<strong>${esc(actor?.name)}</strong> fumbles — anyone with them in reach may punish it.`,
          candidates: riposters,
          context: base
        });
      }
    }
  } catch (_error) {
    // Deliberately swallowed. See the file comment: a missing button is
    // a nuisance, an exception here would abort a resolved attack.
  }
}

/**
 * A creature moved away from somebody who threatens it — Shadowing.
 *
 * Called from the movement workflow beside the Attack of Opportunity and
 * Swift Pursuit detection, which answer the same event for their own
 * reasons.
 */
export async function detectShadowing(moverToken, movement) {
  try {
    if (!game.combat?.started || !moverToken) return;
    const movedFeet = Number(movement?.distance ?? 0);
    if (!(movedFeet > 0)) return;
    const watchers = candidatesNear(moverToken, 5, { exclude: [moverToken] })
      .filter(({ token }) =>
        Number(token.document?.disposition ?? 0) !== Number(moverToken.document?.disposition ?? 0));
    if (!watchers.length) return;
    await offerReactionFeats({
      trigger: TRIGGERS.movedAway,
      headline: `<strong>${esc(moverToken.actor?.name ?? "A creature")}</strong> pulls away`
        + ` — <strong>${movedFeet} ft</strong>.`,
      candidates: watchers,
      context: {
        sceneId: moverToken.scene?.id ?? canvas?.scene?.id ?? null,
        attackerTokenId: moverToken.id,
        movedFeet
      }
    });
  } catch (_error) { /* see above */ }
}

/**
 * A shield turned a blow, or blocked one — Disarm Block and Offensive
 * Parry, the batch's two Free actions.
 *
 * `missedByShield` is the narrower trigger: "an attack fails to inflict
 * damage to you due to missing by your Shield DB", i.e. it would have
 * landed without the shield's contribution.
 */
export async function detectShieldReactions(defender, attackerToken, { missedByShield = false, blocked = false } = {}) {
  try {
    const token = activeToken(defender);
    if (!token) return;
    const context = {
      sceneId: token.scene?.id ?? canvas?.scene?.id ?? null,
      attackerTokenId: attackerToken?.id ?? null
    };
    if (missedByShield) {
      await offerReactionFeats({
        trigger: TRIGGERS.missedByShield,
        headline: `<strong>${esc(defender.name)}</strong>'s shield turns the blow aside.`,
        candidates: [{ actor: defender, token }],
        context
      });
    }
    if (blocked) {
      await offerReactionFeats({
        trigger: TRIGGERS.shieldBlocked,
        headline: `<strong>${esc(defender.name)}</strong> blocks with their shield.`,
        candidates: [{ actor: defender, token }],
        context
      });
    }
  } catch (_error) { /* see above */ }
}
