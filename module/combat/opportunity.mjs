/**
 * Attack of Opportunity — Foundry glue (Chapter 4, Reactions).
 *
 * Detects when a creature provokes (leaves/moves through an enemy's reach,
 * uses a Manipulate-trait action in reach, or makes a ranged attack in
 * reach), works out which enemies may answer with an Attack of Opportunity,
 * and posts a GM-whispered card with a button per eligible reactor. Clicking
 * a button spends that reactor's reaction and makes a MAP-exempt melee
 * strike against the provoker; a critical answer to a manipulate action
 * disrupts it.
 *
 * Everything here is DETECTION ONLY and defensive — a canvas/API hiccup
 * degrades to "no offer" and never blocks the move, attack, or action that
 * triggered it. The rules decisions live in the pure opportunity-rules.mjs.
 */
import { activeToken, distanceBetween, feetFromPointToToken } from "./geometry.mjs";
import { keepByDisposition } from "../magic/spell-template.mjs";
import { actorReactionBlock, FLAT_FOOTED_BLOCK } from "./reactions.mjs";
import { chooseMeleeAttack, usableAttacks, getOrCreateUnarmedStrike } from "./strike.mjs";
import { weaponReachExtension } from "./attack.mjs";
import { spendReaction } from "./action-points-workflow.mjs";
import {
  effectiveReach,
  movementProvokes,
  reactorEligibility,
  disruptsOnCritical,
  flatFootedOpportunityAllowed
} from "./opportunity-rules.mjs";

const SYSTEM_ID = "trg-prime";
const AOO_FLAG = "aooCard";

const TRIGGER_LABEL = {
  movement: "moving through your reach",
  manipulate: "using a manipulate action in your reach",
  ranged: "making a ranged attack in your reach"
};

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/* -------------------------------------------- */
/*  Reach & weapon helpers                        */
/* -------------------------------------------- */

/**
 * The furthest an equipped melee weapon extends this actor's reach, in
 * feet: 0 without a reach weapon, 5 for the trait, 10 for a whip
 * (3.576.0 — it was a yes/no worth +5, so a whip threatened 10 ft).
 */
function equippedReachExtension(actor) {
  return usableAttacks(Array.from(actor?.items ?? []))
    .filter((w) => w.system?.attackMode !== "missile")
    .reduce((best, w) => Math.max(best, weaponReachExtension(w.system)), 0);
}

/** A token's melee reach in feet (size reach + a reach weapon's extension). */
export function reachOf(token) {
  const actor = token?.actor;
  const base = Number(actor?.system?.combat?.reach) || 5;
  return effectiveReach(base, equippedReachExtension(actor));
}

/** The reactor's best melee weapon for an AoO (never a missile weapon). */
function bestMeleeWeapon(actor) {
  const attacks = usableAttacks(Array.from(actor?.items ?? []));
  return (
    attacks.find((w) => w.system?.attackMode === "melee") ??
    attacks.find((w) => w.system?.attackMode !== "missile") ??
    null
  );
}

/* -------------------------------------------- */
/*  Eligibility                                   */
/* -------------------------------------------- */

/**
 * The reaction block this actor is under, after any feat that waives it.
 *
 * ONE FUNCTION, because `eligibleReactor` and `blockedReactor` below ask
 * the same question for opposite purposes — one to offer the card, one to
 * explain why there is no card. If the waiver lived in only one of them,
 * a Flat-Footed character with Improved Combat Reflexes would either be
 * refused the attack or told they were refused while taking it.
 *
 * IMPROVED COMBAT REFLEXES (3.378.0) waives ONLY the Flat-Footed block,
 * and only once a round. Confused and Full Defence are untouched: the feat
 * names Flat-Footed and nothing else.
 */
function effectiveReactionBlock(actor) {
  const raw = actorReactionBlock(actor);
  if (raw !== FLAT_FOOTED_BLOCK) return raw;
  const allowed = flatFootedOpportunityAllowed({
    featNames: Array.from(actor?.items ?? [])
      .filter((i) => i.type === "feat")
      .map((i) => i.name),
    usedThisRound: Boolean(actor?.getFlag?.(SYSTEM_ID, "flatFootedOpportunityUsed"))
  });
  return allowed ? null : raw;
}

/** Resolve a reactor token to {token, actor} if it may take an AoO now. */
function eligibleReactor(token) {
  const actor = token?.actor;
  if (!actor) return null;
  const elig = reactorEligibility({
    inCombat: Boolean(game.combat?.started && actor.inCombat),
    reactions: Number(actor.system?.resources?.reactions?.value ?? 0),
    blockReason: effectiveReactionBlock(actor),
    hasMeleeStrike: true // every creature falls back to an Unarmed Strike
  });
  return elig.eligible ? { token, actor } : null;
}

/**
 * Why this threat could NOT react, or null if it could.
 *
 * WHY THIS EXISTS. Graham, 14 Aug 2026: "Attack of Opportunity not
 * triggering."
 *
 * It was triggering, and correctly — but the commonest reason for no card
 * is `reactions.mjs`'s own rule that "Flat-Footed creatures cannot use
 * Reactions", and everyone is Flat-Footed in round 1 until they have
 * acted (surprise.mjs, Chapter 4 Step 4). So for the whole of the first
 * round, a provoke walked past every enemy in reach and posted NOTHING —
 * because `offerAttacksOfOpportunity` returns null on an empty reactor
 * list and says not a word.
 *
 * Verified live in Graham's world: a Target Dummy one square away, in
 * combat, reaction 1/1, reach 5, distance 5 — and blocked purely by
 * Flat-Footed. Advance past its first turn and the card appears.
 *
 * A rule working silently is indistinguishable from a rule not working.
 * This is what lets the card say which it was.
 */
function blockedReactor(token) {
  const actor = token?.actor;
  if (!actor) return null;
  const elig = reactorEligibility({
    inCombat: Boolean(game.combat?.started && actor.inCombat),
    reactions: Number(actor.system?.resources?.reactions?.value ?? 0),
    blockReason: effectiveReactionBlock(actor),
    hasMeleeStrike: true
  });
  return elig.eligible ? null : { token, actor, reason: elig.reason ?? "cannot react" };
}

/** Hostile-to-the-provoker tokens (opposite disposition), placed on canvas. */
function hostileTokens(provokerToken) {
  const provDisp = Number(provokerToken?.document?.disposition ?? 0);
  return (canvas?.tokens?.placeables ?? []).filter(
    (t) => t?.id !== provokerToken?.id && t?.actor && keepByDisposition(Number(t.document?.disposition ?? 0), provDisp, "enemies")
  );
}

/* -------------------------------------------- */
/*  Movement path geometry                        */
/* -------------------------------------------- */

/** Centre points of every grid square the mover's path crosses, in order.
 * Exported since 3.224.0: Swift Pursuit's detection (swift-pursuit.mjs)
 * measures the same path this file's AoO detection walks. */
export function pathSquareCentres(moverToken, movement) {
  try {
    const grid = canvas?.grid;
    if (!grid) return [];
    const halfW = (moverToken?.w ?? grid.size) / 2;
    const halfH = (moverToken?.h ?? grid.size) / 2;
    const waypoints = [
      ...(movement?.passed?.waypoints ?? []),
      ...(movement?.pending?.waypoints ?? [])
    ]
      .filter((w) => Number.isFinite(w?.x) && Number.isFinite(w?.y))
      .map((w) => ({ x: w.x + halfW, y: w.y + halfH }));
    if (waypoints.length < 2) return waypoints;

    // Expand each straight segment into the grid squares it crosses so a
    // pure pass-through (start and end both outside reach) is still seen.
    if (typeof grid.getDirectPath === "function" && typeof grid.getCenterPoint === "function") {
      const offsets = grid.getDirectPath(waypoints);
      const centres = offsets.map((o) => grid.getCenterPoint(o)).filter((p) => p);
      if (centres.length) return centres;
    }
    return waypoints;
  } catch (_e) {
    return [];
  }
}

// `feetFromPointToToken` used to live here and is now geometry.mjs's, so
// that this file, swift-pursuit and the spell range clamp cannot drift
// apart about where a creature is. Re-exported because swift-pursuit.mjs
// has imported it from here since 3.224.0.
export { feetFromPointToToken };

/**
 * Enemies whose reach the mover leaves (or crosses) during this move.
 *
 * Returns BOTH the ones who may answer and the ones who threatened the
 * move but cannot react — see `blockedReactor` for why the second list
 * matters.
 */
export function movementReactors(moverToken, movement) {
  const centres = pathSquareCentres(moverToken, movement);
  if (centres.length < 2) return { reactors: [], blocked: [] };
  const departed = centres.slice(0, -1); // every square left behind
  const reactors = [];
  const blocked = [];
  for (const enemy of hostileTokens(moverToken)) {
    const reach = reachOf(enemy);
    const departedFeet = departed.map((p) => feetFromPointToToken(p, enemy));
    // THREATENED FIRST, ELIGIBLE SECOND. The old order asked whether the
    // enemy could react before asking whether it was even involved, which
    // is why a blocked one could never be reported: it was discarded
    // before the distance was measured.
    if (!movementProvokes(departedFeet, reach)) continue;
    const elig = eligibleReactor(enemy);
    if (elig) reactors.push(elig);
    else {
      const why = blockedReactor(enemy);
      if (why) blocked.push(why);
    }
  }
  return { reactors, blocked };
}

/**
 * Enemies who threaten the mover's current square (manipulate / ranged).
 *
 * Exported for the harness (3.311.5), which drives it with stub tokens
 * rather than grepping this file: the two things that went wrong here —
 * asking eligibility before threat, and dropping the blocked list — are
 * both invisible to a regex and obvious to a caller.
 */
export function stationaryReactors(moverToken) {
  const reactors = [];
  const blocked = [];
  for (const enemy of hostileTokens(moverToken)) {
    const feet = distanceBetween(moverToken, enemy);
    if (feet === null || feet > reachOf(enemy)) continue;
    const elig = eligibleReactor(enemy);
    if (elig) reactors.push(elig);
    else {
      const why = blockedReactor(enemy);
      if (why) blocked.push(why);
    }
  }
  return { reactors, blocked };
}

/* -------------------------------------------- */
/*  Card posting & execution                      */
/* -------------------------------------------- */

/** Post a GM-whispered card offering an AoO to each eligible reactor. */
async function offerAttacksOfOpportunity(provokerToken, found, triggerKind) {
  const reactors = found?.reactors ?? [];
  const blocked = found?.blocked ?? [];

  // NOBODY COULD ANSWER — say so, rather than nothing at all.
  //
  // Only when someone was actually threatening: a provoke in an empty room
  // is not news, and whispering about it every time anyone moves would be
  // noise. But an enemy standing in reach who cannot react is exactly the
  // case that reads as "Attacks of Opportunity are broken", and in round 1
  // that is every enemy on the board.
  if (!reactors.length) {
    if (!blocked.length) return null;
    const provoker = provokerToken?.actor?.name ?? provokerToken?.name ?? "A creature";
    return ChatMessage.create({
      whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
      speaker: ChatMessage.getSpeaker({ actor: provokerToken?.actor ?? null }),
      content:
        `<div class="trg-prime trg-check-card">` +
        `<header class="check-header"><div class="check-heading"><span class="check-actor">${provoker}</span><h3>No Attack of Opportunity</h3></div></header>` +
        line(`<strong>${provoker}</strong> provokes — ${TRIGGER_LABEL[triggerKind] ?? "provoking"} — but nobody in reach can answer:`) +
        blocked
          .map((b) => line(`<em>${b.actor.name} — ${b.reason}.</em>`))
          .join("") +
        `</div>`
    });
  }
  const provokerName = provokerToken?.actor?.name ?? provokerToken?.name ?? "A creature";
  const buttons = reactors
    .map(
      ({ token, actor }) =>
        `<div style="margin:3px 0"><button type="button" class="trg-aoo-button" data-action="takeAoO" data-reactor="${actor.id}">${actor.name} — Attack of Opportunity</button></div>`
    )
    .join("");

  const content =
    `<div class="trg-prime trg-check-card">` +
    `<header class="check-header"><div class="check-heading"><span class="check-actor">${provokerName}</span><h3>Attack of Opportunity</h3></div></header>` +
    line(`<strong>${provokerName}</strong> provokes — ${TRIGGER_LABEL[triggerKind] ?? "provoking"}.`) +
    line("<em>Each eligible reactor may spend their reaction to strike:</em>") +
    buttons +
    `</div>`;

  // AND TO EACH REACTOR'S OWN PLAYER (3.646.0). The offer was GM-only, so
  // the button the 3.645.0 fix showed to a reactor's owner was on a card that
  // owner never received — found live on 15 October 2026.
  const reactorOwners = (game.users?.contents ?? Array.from(game.users ?? []))
    .filter((u) => !u.isGM && reactors.some(({ actor }) => actor?.testUserPermission?.(u, "OWNER")))
    .map((u) => u.id);
  return ChatMessage.create({
    content,
    whisper: [...new Set([...ChatMessage.getWhisperRecipients("GM").map((u) => u.id), ...reactorOwners])],
    speaker: ChatMessage.getSpeaker({ actor: provokerToken?.actor ?? null }),
    flags: {
      [SYSTEM_ID]: {
        [AOO_FLAG]: {
          provokerTokenId: provokerToken?.id ?? null,
          provokerSceneId: provokerToken?.scene?.id ?? canvas?.scene?.id ?? null,
          triggerKind,
          reactors: reactors.map(({ token, actor }) => ({ actorId: actor.id, tokenId: token.id, name: actor.name })),
          used: []
        }
      }
    }
  });
}

/**
 * Execute one reactor's Attack of Opportunity from a card button.
 * Re-checks eligibility (the reaction may have been spent since the card
 * was posted), spends the reaction, targets the provoker, and rolls a
 * MAP-exempt melee strike; a critical answer to a manipulate action posts
 * the disruption note.
 */
/**
 * WHAT AN ATTACK OF OPPORTUNITY IS — the one place it happens.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO DOORS ONTO ONE RULE (3.430.2), and the second one did nothing.
 *
 * Graham, 28 August 2026: "Attack of Opportunity is spending a reaction
 * but not prompting an attack." He was clicking the action ON THE
 * CHARACTER SHEET, and that is a different door from the offer card's
 * button — one this file had never been told about.
 *
 * `useFeat` dispatches on `FEAT_AUTOMATION`, and there was no entry for
 * Attack of Opportunity. So the click fell through to the generic
 * Creature Codex activation card: it printed the feat's own trigger and
 * effect text, said "Resolved by the GM", and applied nothing. Everything
 * below — the eligibility re-check, the reaction, the strike, the refund
 * — was reachable only from a card that a provoking move had to post
 * first.
 *
 * THE EXACT SHAPE OF THE SUSTAIN DEFECT, one release earlier: a button
 * that is real, a rule that is real, and no wire between them. The fix is
 * the same one — write down what the thing IS, and have both doors ask
 * it, rather than each implementing the half its author was looking at.
 *
 * @param {Actor} reactor
 * @param {object} [options]
 * @param {Token|null} [options.provokerToken] the creature that provoked,
 *   when a card knows it; null when a GM invoked this by hand.
 * @param {string|null} [options.triggerKind] "movement" | "manipulate" | …
 * @returns {Promise<object|null>} the attack result, or null if none happened.
 */
async function performOpportunityStrike(reactor, { provokerToken = null, triggerKind = null } = {}) {
  const reactorToken = activeToken(reactor);

  // Re-check: the reaction may already be gone, or a condition applied.
  const recheck = eligibleReactor(reactorToken ?? { actor: reactor });
  if (!recheck) {
    const why = actorReactionBlock(reactor) ?? "no reaction available";
    ui.notifications.warn(`${reactor.name} can no longer take that reaction (${why}).`);
    return null;
  }

  // Target the provoker so the strike resolves against the right creature.
  if (provokerToken?.setTarget) {
    try {
      provokerToken.setTarget(true, { user: game.user, releaseOthers: true });
    } catch (_e) {
      /* targeting is best-effort; the strike prompt still lets the GM choose */
    }
  }

  // WHICH WEAPON, ASKED when more than one is ready (3.645.0, F6).
  const picked = await chooseMeleeAttack(reactor, "Attack of Opportunity");
  if (picked === null) return null;
  const weapon = picked ?? bestMeleeWeapon(reactor) ?? (await getOrCreateUnarmedStrike(reactor));

  // Attack trait: an AoO always qualifies for the Battle Readiness
  // reaction, which is rather the point of the ability.
  // The Flat-Footed allowance is spent HERE, not when the card is offered:
  // an offer nobody accepts must not consume a once-per-round rule. It is
  // marked before the strike for the same reason the reaction is — so a
  // second provoke in the same instant cannot slip through — and the
  // refund path below returns it if no attack happened.
  const wasFlatFooted = actorReactionBlock(reactor) === FLAT_FOOTED_BLOCK;
  if (wasFlatFooted) await reactor.setFlag(SYSTEM_ID, "flatFootedOpportunityUsed", true);

  await spendReaction(reactor, "Attack of Opportunity", { traits: "Attack" });

  const { rollWeaponAttack } = await import("./attack-workflow.mjs");
  // SHIELDED STRIDE is the defender's, and only against movement: the card
  // already recorded WHY this attack was provoked, so the one fact the
  // attack path cannot work out for itself travels with it.
  // WRAPPED, because a THROW must return the reaction too. The first
  // 3.374.0 attempt made every AoO throw inside `rollWeaponAttack`, and the
  // reaction was gone with no card, no warning and no refund — strictly
  // worse than the defect being fixed. A refund guarded only by `!result`
  // never runs when the call raises.
  let result = null;
  let attackFailed = false;
  try {
    result = await rollWeaponAttack(reactor, weapon, {
      isReaction: true,
      provokedByMovement: triggerKind === "movement",
      // The offer was only made because this reactor threatened the
      // provoker, and `movementReactors`/`stationaryReactors` measured that
      // before the card existed. By the time the button is clicked the
      // provoker has finished moving, so re-measuring would refuse the very
      // attack its own departure provoked (Graham, 23 Aug 2026).
      reachAlreadyEstablished: true
    });
  } catch (err) {
    attackFailed = true;
    console.error("TRG Prime | Attack of Opportunity failed", err);
    ui.notifications.error(`${reactor.name}'s Attack of Opportunity could not be rolled — see the console.`);
  }
  if (attackFailed) result = null;

  // THE REACTION IS GIVEN BACK IF NO ATTACK HAPPENED. `spendReaction` runs
  // above so Battle Readiness sees an Attack-trait spend, but
  // `rollWeaponAttack` can still bow out — a cancelled target prompt, an
  // unloaded weapon, no free hand. Every one of those paths used to eat the
  // reaction and give nothing back, which is how the out-of-reach refusal
  // cost a reactor their reaction for no roll at all.
  if (!result) {
    const current = Number(reactor.system?.resources?.reactions?.value ?? 0);
    const max = Number(reactor.system?.resources?.reactions?.max ?? 1);
    await reactor.update({ "system.resources.reactions.value": Math.min(max, current + 1) });
    // ...AND SO IS THE FLAT-FOOTED ALLOWANCE (3.378.0), for exactly the
    // same reason. It is once per round, so an attack that never happened
    // must not consume it — otherwise a cancelled target prompt would
    // silently cost a Flat-Footed character the only opportunity attack
    // the feat gives them all round.
    if (wasFlatFooted) await reactor.unsetFlag(SYSTEM_ID, "flatFootedOpportunityUsed");
    ui.notifications.info(`${reactor.name} kept their reaction — no attack was made.`);
    return null;
  }

  // Critical AoO vs a manipulate action disrupts it.
  const isCritical = /critical/i.test(String(result?.compactSummary ?? ""));
  if (disruptsOnCritical(triggerKind, isCritical)) {
    await ChatMessage.create({
      whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
      speaker: ChatMessage.getSpeaker({ actor: reactor }),
      content:
        `<div class="trg-prime trg-check-card">` +
        line(`<strong>Disruption!</strong> ${reactor.name}'s critical Attack of Opportunity disrupts the manipulate action — <strong>it fails</strong>.`) +
        `</div>`
    });
  }

  return result;
}

/**
 * Door one: the offer card's per-reactor button.
 *
 * Everything card-shaped lives here — finding the reactor the card named,
 * the provoker it recorded, and marking the offer spent so the button
 * disables. The strike itself is `performOpportunityStrike`.
 */
export async function executeAttackOfOpportunity(message, reactorActorId) {
  const card = message?.getFlag?.(SYSTEM_ID, AOO_FLAG);
  if (!card) return null;
  const used = new Set(card.used ?? []);
  if (used.has(reactorActorId)) return null;

  const entry = (card.reactors ?? []).find((r) => r.actorId === reactorActorId);
  if (!entry) return null;

  const reactorToken = canvas?.tokens?.get?.(entry.tokenId) ?? null;
  const reactor = reactorToken?.actor ?? game.actors.get(reactorActorId) ?? null;
  if (!reactor) {
    ui.notifications.warn("That reactor's token could not be found on the canvas.");
    return null;
  }

  const result = await performOpportunityStrike(reactor, {
    provokerToken: canvas?.tokens?.get?.(card.provokerTokenId) ?? null,
    triggerKind: card.triggerKind
  });
  if (!result) return null;

  // MARKED SPENT ONLY IF A STRIKE HAPPENED. An offer refused, cancelled
  // or refunded leaves the button live, for the same reason the reaction
  // is given back: nothing was used up.
  const nextUsed = Array.from(new Set([...(card.used ?? []), reactorActorId]));
  // A PLAYER MAY NOT WRITE TO ANOTHER'S CARD; their reaction is spent, which
  // already refuses a second click, so the mark is only the GM's to make.
  if (message.canUserModify?.(game.user, "update") ?? game.user.isGM) {
    await message.setFlag(SYSTEM_ID, AOO_FLAG, { ...card, used: nextUsed });
  }
  return result;
}

/**
 * Door two: the Attack of Opportunity action on the character sheet.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DOOR GRAHAM WAS ACTUALLY USING, and the one that did nothing.
 *
 * NO PROVOKER IS NAMED, and that is the honest difference between the
 * two doors rather than a shortcoming of this one. The card knows who
 * provoked because a move posted it; a GM reaching for the sheet is
 * asserting that a trigger happened, and picks the target in the prompt
 * `performOpportunityStrike` already opens.
 *
 * REACH IS NOT RE-MEASURED, for Graham's own reason of 23 August 2026:
 * an Attack of Opportunity is provoked BY leaving reach, so measuring at
 * the moment of the click refuses the very attack the departure
 * provoked. A GM invoking it by hand is the judge of the trigger.
 */
export async function useAttackOfOpportunity(actor) {
  return performOpportunityStrike(actor, { triggerKind: null });
}

/* -------------------------------------------- */
/*  Public detection entry points                 */
/* -------------------------------------------- */

/** Movement provoke: called from the movement hook for a provoking move. */
export async function detectMovementAoO(tokenDocument, movement) {
  try {
    const moverToken = tokenDocument?.object ?? activeToken(tokenDocument?.actor);
    if (!moverToken) return;
    await offerAttacksOfOpportunity(moverToken, movementReactors(moverToken, movement), "movement");
  } catch (_e) {
    /* detection is best-effort — never disturb the move */
  }
}

/** Manipulate / ranged provoke: called from the action & attack workflows. */
export async function detectStationaryAoO(actor, triggerKind) {
  try {
    const moverToken = activeToken(actor);
    if (!moverToken) return;
    await offerAttacksOfOpportunity(moverToken, stationaryReactors(moverToken), triggerKind);
  } catch (_e) {
    /* detection is best-effort */
  }
}

/* -------------------------------------------- */
/*  Card button wiring                            */
/* -------------------------------------------- */

const BOUND = Symbol("trgAooBound");

/** Registers the AoO card button handler. Called once, from init. */
export function registerOpportunityHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.getFlag?.(SYSTEM_ID, AOO_FLAG);
    if (!card) return;
    const used = new Set(card.used ?? []);
    html.querySelectorAll?.('[data-action="takeAoO"]').forEach((btn) => {
      const actorId = btn.dataset?.reactor;
      if (used.has(actorId)) {
        btn.disabled = true;
        btn.textContent = btn.textContent.replace(/—.*/, "— reacted");
        return;
      }
      // THE GM, OR THE REACTOR'S OWN PLAYER (3.645.0, F4). This read "only
      // the GM triggers enemy Attacks of Opportunity" and hid the button
      // from everyone else — including the player whose character was
      // offered the strike, who then swung from the weapon row as an
      // ordinary Strike, paying AP and the multiple attack penalty.
      const reactorActor = canvas?.tokens?.get?.((card.reactors ?? []).find((r) => r.actorId === actorId)?.tokenId)?.actor
        ?? game.actors?.get?.(actorId) ?? null;
      if (!game.user.isGM && !reactorActor?.isOwner) {
        btn.style.display = "none";
        return;
      }
      if (btn[BOUND]) return;
      btn[BOUND] = true;
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        btn.disabled = true;
        try {
          await executeAttackOfOpportunity(message, actorId);
        } finally {
          btn.disabled = false;
        }
      });
    });
  });
}
