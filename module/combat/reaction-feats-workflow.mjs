/**
 * The Foundry side of the thirteen reaction feats.
 *
 * See reaction-feats.mjs for the rules and why they are one table. This
 * file is the half that needs a world: it reads gear and stances to
 * answer the requirement questions, posts the offer card, and runs
 * whatever the pressed button does.
 *
 * THE CARD PATTERN IS BORROWED, NOT INVENTED. `opportunity.mjs` and
 * `swift-pursuit.mjs` already answer "somebody else did a thing, offer a
 * reaction" — a whispered card with a button per eligible reactor, a
 * flag recording who was offered and who has answered, eligibility
 * RE-CHECKED when the button is pressed (the reaction may be gone by
 * then), and a `BOUND` symbol so a re-render does not stack listeners.
 * Copying that shape rather than inventing a fourth one is the point.
 *
 * AND THE ANTI-SILENCE RULE WITH IT. Both of those files carry a hard-won
 * comment: an offer that is silently suppressed reads as the feature
 * being broken. So a feat whose requirement is unmet is NAMED on the
 * card with the reason, rather than quietly missing.
 */

import { activeToken, distanceBetween, tokensAlliedWith } from "./geometry.mjs";
import { armourCategory } from "../donning.mjs";
import { hasFreeHandAvailable, itemRequiredHands } from "../held-items.mjs";
import { spendReaction } from "./action-points-workflow.mjs";
import { actorReactionBlock } from "./reactions.mjs";
import { reactorEligibility } from "./opportunity-rules.mjs";
import { chooseMeleeAttack, usableAttacks, getOrCreateUnarmedStrike } from "./strike.mjs";
import { speedValue } from "./speed-pool.mjs";
import { actorHandle, resolveActorHandle } from "../actor-handle.mjs";
import {
  REACTION_FEATS,
  TRIGGERS,
  chanceOfRedemption,
  cleaveContinues,
  offeredReactionFeats,
  reducedAttack,
  selfPreservationDR,
  shadowingFollow,
  standingFoe,
  strikeOptionsFor
} from "./reaction-feats.mjs";

const SYSTEM_ID = "trg-prime";
const CARD_FLAG = "reactionFeatCard";
export const CHAIN_FLAG = "cleaveChain";
const BOUND = Symbol("trgReactionFeatBound");

const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const esc = (text) => String(text ?? "").replace(
  /[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const featNamesOf = (actor) => Array.from(actor?.items ?? [])
  .filter((i) => i.type === "feat")
  .map((i) => i.name);

/* ------------------------------------------------------------------ */
/* Reading the actor for the requirement questions                     */
/* ------------------------------------------------------------------ */

/**
 * The gear-and-stance state `meetsRequirement` asks about.
 *
 * EXPORTED, and deliberately returning plain values — the harness drives
 * this against stub actors, which is the only way to see that "one-handed
 * weapon with the other hand free" really means what the feat's
 * Requirements line says.
 */
export function actorReactionState(actor) {
  const items = Array.from(actor?.items ?? []);
  const size = actor?.system?.identity?.size ?? "medium";
  const equipped = items.filter((i) => i.system?.equipped);

  const wornArmour = equipped.find((i) => i.type === "armour");
  const shield = equipped.find((i) => i.type === "shield") ?? null;
  // ONE-HANDED means the weapon costs exactly one hand for THIS
  // character — `itemRequiredHands` already answers that against the
  // actor's size, which is why a Small character's longsword is not
  // quietly counted as one-handed here.
  const oneHandedWeapon = equipped.some(
    (i) => i.type === "weapon" && itemRequiredHands(i, size) === 1
  );

  return {
    armourCategory: armourCategory(wornArmour?.system?.category),
    oneHandedWeapon,
    shield: Boolean(shield),
    freeHand: hasFreeHandAvailable(items, size),
    stances: Array.from(actor?.effects ?? [])
      .filter((e) => !e.disabled)
      .map((e) => e.name)
  };
}

/** May this actor spend a reaction at all, and if not, why not? */
export function actorCanReact(actor) {
  const elig = reactorEligibility({
    inCombat: Boolean(game.combat?.started && actor?.inCombat),
    reactions: Number(actor?.system?.resources?.reactions?.value ?? 0),
    blockReason: actorReactionBlock(actor),
    hasMeleeStrike: true
  });
  return { can: Boolean(elig.eligible), reason: elig.reason ?? null };
}

/**
 * Everything one actor is offered on one trigger.
 *
 * Wraps the pure rule with the two things only a world can answer.
 */
export function reactionOffersFor(actor, trigger, context = {}) {
  const { can, reason } = actorCanReact(actor);
  return offeredReactionFeats({
    featNames: featNamesOf(actor),
    trigger,
    // FACTS ABOUT THE TRIGGER JOIN THE FACTS ABOUT THE ACTOR. Armoured
    // Counter's "with no critical" is a property of the blow, not of the
    // armour, and it is a REQUIREMENT like any other — so the trigger
    // context is merged in rather than becoming an `if` in the detection
    // code that no harness could reach.
    state: { ...actorReactionState(actor), ...context },
    canReact: can,
    blockReason: reason
  });
}

/* ------------------------------------------------------------------ */
/* The offer card                                                      */
/* ------------------------------------------------------------------ */

/**
 * Post one card offering whatever this trigger turned up.
 *
 * @param {object} opts
 * @param {string} opts.trigger
 * @param {string} opts.headline     what happened, in the card's own words
 * @param {Array}  opts.candidates   [{ actor, token }] who might react
 * @param {object} opts.context      what the button will need later
 */
export async function offerReactionFeats({ trigger, headline, candidates = [], context = {} } = {}) {
  const rows = [];
  const heldRows = [];
  // THE TOKEN WAS ALREADY IN THE TUPLE AND WAS BEING THROWN AWAY
  // (3.469.0). `reaction-feat-detection.mjs` builds `{actor, token}` for
  // every candidate; this loop destructured only the actor, so each row
  // named the creature by species. For an unlinked NPC that meant the
  // reaction was spent on the SIDEBAR SHEET — the token's pool never
  // emptied, so the same creature could react every round for ever.
  // See module/actor-handle.mjs.
  for (const { actor, token } of candidates) {
    if (!actor) continue;
    const { offered, held } = reactionOffersFor(actor, trigger, context);
    const handle = actorHandle(actor, token ?? null);
    for (const feat of offered) {
      rows.push({ actorId: actor.id, handle, actorName: actor.name, ...feat });
    }
    for (const h of held) heldRows.push({ actorName: actor.name, ...h });
  }

  // NOTHING TO OFFER AND NOTHING TO EXPLAIN — say nothing. A card every
  // time anybody swings would be noise, and noise is how a genuinely
  // useful card stops being read.
  if (!rows.length && !heldRows.length) return null;

  const buttons = rows.map((r) =>
    `<div style="margin:3px 0"><button type="button" class="trg-reaction-feat"`
    + ` data-action="takeReactionFeat" data-reactor="${r.actorId}" data-feat="${r.key}">`
    + `${esc(r.actorName)} — ${esc(r.label)}${r.extendedLabel ? ` (+${esc(r.extendedLabel)})` : ""}`
    + `</button><div style="font-size:0.9em;opacity:0.8">${esc(r.summary)}</div></div>`
  ).join("");

  const heldText = heldRows.length
    ? heldRows.map((h) => line(`<em>${esc(h.actorName)} — ${esc(h.label)}: ${esc(h.reason)}.</em>`)).join("")
    : "";

  return ChatMessage.create({
    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
    content:
      `<div class="trg-prime trg-check-card">`
      + `<header class="check-header"><div class="check-heading"><h3>Reaction</h3></div></header>`
      + line(headline)
      + buttons
      + heldText
      + `</div>`,
    flags: { [SYSTEM_ID]: { [CARD_FLAG]: { trigger, context, rows, used: [] } } }
  });
}

/* ------------------------------------------------------------------ */
/* Running one                                                         */
/* ------------------------------------------------------------------ */

function tokenById(id, sceneId) {
  const scene = sceneId ? game.scenes.get(sceneId) : canvas?.scene;
  const doc = scene?.tokens?.get?.(id);
  return doc?.object ?? canvas?.tokens?.placeables?.find((t) => t.id === id) ?? null;
}

function bestMeleeWeapon(actor) {
  const attacks = usableAttacks(Array.from(actor?.items ?? []));
  return attacks.find((w) => w.system?.attackMode === "melee")
    ?? attacks.find((w) => w.system?.attackMode !== "missile")
    ?? null;
}

/**
 * Point the reactor's attack at somebody and roll it.
 *
 * THE TWO MAP RULES ARE NOT THE SAME RULE, and getting that wrong is
 * what a live pass caught on 21 August 2026.
 *
 *   "exempt"  — the ripostes, Armoured Counter, Strike of Retribution.
 *               "Your multiple attack penalty does not apply." That is
 *               `isReaction: true`, which sets the penalty to zero.
 *
 *   "frozen"  — Cleave. "This strike uses your CURRENT multiple attack
 *               penalty but does not count towards increasing it
 *               further." That is `mapFrozen: true` with the penalty
 *               still applied — a different thing, and the whole reason
 *               the table carries two values.
 *
 * The first build passed `isReaction: true` for both, so Cleave came out
 * exempt: a Fighter on their third swing cleaved at no penalty instead
 * of at -10, and the card showed no penalty row at all to say so.
 *
 * `apPaid` is what keeps a frozen strike from ALSO charging AP —
 * `isReaction` was doing that job as a side effect, and dropping it
 * without this would have billed a Reaction for action points too.
 */
async function reactionStrike(reactor, targetToken, { map = "exempt", label = "Reaction" } = {}) {
  if (targetToken) targetToken.setTarget(true, { user: game.user, releaseOthers: true });
  // WHICH WEAPON, ASKED when more than one is ready (3.645.0, F6).
  const picked = await chooseMeleeAttack(reactor, label);
  if (picked === null) return null;
  const weapon = picked ?? bestMeleeWeapon(reactor) ?? (await getOrCreateUnarmedStrike(reactor));
  if (!weapon) {
    ui.notifications.warn(`${label}: ${reactor.name} has no weapon to strike with.`);
    return null;
  }
  const { rollWeaponAttack } = await import("./attack-workflow.mjs");
  return rollWeaponAttack(reactor, weapon, strikeOptionsFor(map));
}

/** Everything the card needs to say after a feat has run. */
async function report(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">${esc(title)}</h3>${lines.join("")}</div>`
  });
}

/**
 * Each feat's own step, keyed the same way the rules table is.
 *
 * Every entry receives the same three things and is responsible for
 * nothing except its own effect — the reaction has already been spent by
 * the caller, and the card has already been marked used. Keeping the
 * spend OUT of these means a feat cannot forget to pay for itself, which
 * is the mistake the six hand-rolled reaction feats in feats-workflow
 * each had to remember separately.
 */
const RUN = {
  async cleave(reactor, ctx) {
    const foes = adjacentFoes(reactor, ctx);
    if (!foes.length) {
      await report(reactor, "Cleave", [line("<em>No other foe is in reach.</em>")]);
      return;
    }
    const chain = cleaveContinues({
      hasGreatCleave: featNamesOf(reactor).some((n) => n.trim().toLowerCase() === "great cleave"),
      lastIncapacitated: true,
      adjacentRemaining: foes.length
    });
    await reactionStrike(reactor, foes[0], { map: REACTION_FEATS.cleave.map, label: "Cleave" });
    await report(reactor, chain ? "Great Cleave" : "Cleave", [
      line(`<strong>${esc(reactor.name)}</strong> cuts on into <strong>${esc(foes[0].actor?.name ?? "the next foe")}</strong>.`),
      line("<em>This Strike uses your current multiple attack penalty and does not increase it.</em>"),
      ...(chain
        ? [line(`<em>Great Cleave: if that dropped them too, strike again — the chain costs no further reaction. ${foes.length - 1} other foe${foes.length - 1 === 1 ? "" : "s"} in reach.</em>`)]
        : [])
    ]);
  },

  async "allied strike"(reactor, ctx) {
    const ally = await pickAlly(reactor, 30);
    if (!ally) return;
    await report(reactor, "Allied Strike", [
      line(`<strong>${esc(ally.name)}</strong> is spurred to strike — a bonus free attack against any target in range.`),
      line("<em>It ignores multiple attack penalties, and costs the ally nothing.</em>")
    ]);
  },

  async "armoured counter"(reactor, ctx) {
    const attacker = tokenById(ctx.attackerTokenId, ctx.sceneId);
    await reactionStrike(reactor, attacker, { map: REACTION_FEATS["armoured counter"].map, label: "Armoured Counter" });
    await report(reactor, "Armoured Counter", [
      line(`<strong>${esc(reactor.name)}</strong> locks the weapon and answers.`),
      line("<em>Any 1 AP attack action, ignoring the multiple attack penalty.</em>")
    ]);
  },

  async "self preservation"(reactor, ctx) {
    const level = Number(reactor.system?.identity?.level ?? 0);
    const dr = selfPreservationDR(level);
    await report(reactor, "Self Preservation", [
      line(`<strong>DR +${dr}</strong> against the triggering attack (2 + half your ${level}th level).`),
      line("<em>Your Strikes against that creature deal +1 aligned (evil) or essence damage until the end of your next turn — choose the type each time.</em>")
    ]);
  },

  async "chance of redemption"(reactor, ctx) {
    const foe = tokenById(ctx.attackerTokenId, ctx.sceneId)?.actor ?? null;
    const { TRGCheck } = await import("../dice/check.mjs");
    const check = await TRGCheck.roll({
      actor: foe ?? reactor,
      label: "Chance of Redemption — Will Save",
      subject: "will",
      subtitle: `opposed by ${reactor.name}`,
      type: "save",
      dc: 10 + Number(reactor.system?.identity?.level ?? 0)
    });
    const result = chanceOfRedemption(check?.outcome?.degree?.key);
    const adjusted = reducedAttack({ total: ctx.attackTotal ?? 0, dc: ctx.attackDC ?? 0, reduction: result.reduction });
    await report(reactor, "Chance of Redemption", [
      line(`<strong>${esc(foe?.name ?? "The foe")}</strong> hesitates — ${esc(result.text)}.`),
      ...(result.reduction
        ? [line(`Attack <strong>${adjusted.before}</strong> becomes <strong>${adjusted.after}</strong> against DC ${adjusted.dc}`
          + (adjusted.turnedAside ? " — <strong>now a miss</strong>." : "."))]
        : []),
      ...(result.stunned ? [line(`<em>The foe is also <strong>Stunned ${result.stunned}</strong>.</em>`)] : [])
    ]);
  },

  async "strike of retribution"(reactor, ctx) {
    const attacker = tokenById(ctx.attackerTokenId, ctx.sceneId);
    const db = Number(reactor.system?.combat?.db?.total ?? reactor.system?.combat?.db ?? 0);
    const intercepted = reducedAttack({ total: ctx.attackTotal ?? 0, dc: db, reduction: 0 });
    await report(reactor, "Strike of Retribution", [
      line(`<strong>${esc(reactor.name)}</strong> steps in without provoking and takes the blow meant for their ally.`),
      line(`The attack is worked out against <strong>your</strong> Defensive Bonus: <strong>${intercepted.before}</strong> vs DB ${db} — `
        + (intercepted.hitAfter ? "<strong>it hits you</strong>." : "<strong>it misses</strong>.")),
      ...(intercepted.hitAfter ? [line("<em>Because it hit, you may strike back now — the Strike ignores your multiple attack penalty.</em>")] : [])
    ]);
    if (intercepted.hitAfter) {
      await reactionStrike(reactor, attacker, { map: REACTION_FEATS["strike of retribution"].map, label: "Strike of Retribution" });
    }
  },

  async "guardian defence"(reactor, ctx) {
    const ally = tokenById(ctx.targetTokenId, ctx.sceneId)?.actor ?? null;
    const attackerActor = tokenById(ctx.attackerTokenId, ctx.sceneId)?.actor ?? null;
    const { resolveAction } = await import("./action-workflow.mjs");
    const { BASIC_ACTIONS } = await import("../data/basic-actions.mjs");
    const aid = BASIC_ACTIONS.find((a) => a.key === "aidDefensive");
    await report(reactor, "Guardian Defence", [
      line(`<strong>${esc(reactor.name)}</strong> throws in a guard for <strong>${esc(ally?.name ?? "their ally")}</strong>.`),
      line("<em>An immediate Aid Defensive — its bonus reduces the triggering attack.</em>")
    ]);
    if (aid) await resolveAction(reactor, { ...aid, apCost: "0" });
  },

  async "duelling riposte"(reactor, ctx) {
    await riposte(reactor, ctx, "Duelling Riposte");
  },

  async "twin riposte"(reactor, ctx) {
    await riposte(reactor, ctx, "Twin Riposte");
  },

  async "disarm block"(reactor, ctx) {
    const attacker = tokenById(ctx.attackerTokenId, ctx.sceneId);
    if (attacker) attacker.setTarget(true, { user: game.user, releaseOthers: true });
    const { resolveAction } = await import("./action-workflow.mjs");
    const { BASIC_ACTIONS } = await import("../data/basic-actions.mjs");
    const disarm = BASIC_ACTIONS.find((a) => a.key === "disarmAttack");
    await report(reactor, "Disarm Block", [
      line(`<strong>${esc(reactor.name)}</strong> turns the blow and grabs for the weapon.`),
      line("<em>A Disarm attempt — and this one needs no free hand.</em>")
    ]);
    if (disarm) await resolveAction(reactor, { ...disarm, apCost: "0" });
  },

  async "offensive parry"(reactor, ctx) {
    const attacker = tokenById(ctx.attackerTokenId, ctx.sceneId);
    if (attacker) attacker.setTarget(true, { user: game.user, releaseOthers: true });
    const { resolveAction } = await import("./action-workflow.mjs");
    const { BASIC_ACTIONS } = await import("../data/basic-actions.mjs");
    const shove = BASIC_ACTIONS.find((a) => a.key === "shoveAttack");
    await report(reactor, "Offensive Parry", [
      line(`<strong>${esc(reactor.name)}</strong> shoves behind the block.`),
      line("<em>If the Shove would drive them into a solid object, difficult terrain or another creature's space, they are left <strong>flat-footed</strong> instead of being moved.</em>")
    ]);
    if (shove) await resolveAction(reactor, { ...shove, apCost: "0" });
  },

  async shadowing(reactor, ctx) {
    // speedValue, not Number(): a pooled speed reads NaN — see combat/movement.mjs.
    const speed = speedValue(reactor.system?.combat?.movement?.land) || 30;
    const follow = shadowingFollow({ quarryMovedFeet: ctx.movedFeet ?? 0, speedFeet: speed });
    await report(reactor, "Shadowing", [
      line(`<strong>${esc(reactor.name)}</strong> follows — a 1 AP Stride, taken as this reaction.`),
      follow.keptUp
        ? line(`<strong>${follow.follow} ft</strong> keeps them in reach.`)
        : line(`<strong>${follow.follow} ft</strong> is your full Speed — they break away by <strong>${follow.shortBy} ft</strong>.`),
      line("<em>Use any movement type you have. Move your token to match.</em>")
    ]);
  }
};

/** The two ripostes differ only in what let you take them. */
async function riposte(reactor, ctx, label) {
  const fumbler = tokenById(ctx.attackerTokenId, ctx.sceneId);
  await report(reactor, label, [
    line(`<strong>${esc(reactor.name)}</strong> punishes the slip.`),
    line("<em>Attack or Disarm — your multiple attack penalty does not apply. Rolling the Attack; use the Disarm action instead if you prefer.</em>")
  ]);
  await reactionStrike(reactor, fumbler, { map: REACTION_FEATS[label.toLowerCase()].map, label });
}

/** What `standingFoe` needs to know about a live actor. */
export function foeState(actor) {
  return {
    hp: Number(actor?.system?.resources?.hp?.value ?? NaN),
    unconscious: Boolean(actor?.hasCondition?.("unconscious")),
    dying: Boolean(actor?.hasCondition?.("dying"))
  };
}

/** Foes adjacent to the reactor, still standing, excluding the one just dropped. */
function adjacentFoes(reactor, ctx) {
  const mine = activeToken(reactor);
  if (!mine) return [];
  const reach = 5 + Number(mine.document?.width ?? 1) * 0 + (Number(reactor.system?.combat?.reach ?? 0) || 0);
  const dropped = ctx.targetTokenId;
  return (canvas?.tokens?.placeables ?? []).filter((t) => {
    if (!t.actor || t.id === mine.id || t.id === dropped) return false;
    if (Number(t.document?.disposition ?? 0) === Number(mine.document?.disposition ?? 0)) return false;
    // A CORPSE IS NOT ANOTHER FOE. See `standingFoe` — found live when a
    // Cleaver was offered a chain into creatures already on the floor.
    if (!standingFoe(foeState(t.actor))) return false;
    const feet = distanceBetween(mine, t);
    return feet !== null && feet <= Math.max(5, reach);
  });
}

/** Choose an ally within range for Allied Strike. */
async function pickAlly(actor, rangeFeet) {
  const mine = activeToken(actor);
  const allies = tokensAlliedWith(mine, [mine]).filter((t) => {
    const feet = distanceBetween(mine, t);
    return feet !== null && feet <= rangeFeet;
  });
  if (!allies.length) {
    ui.notifications.warn(`Allied Strike: no ally within ${rangeFeet} ft.`);
    return null;
  }
  if (allies.length === 1) return allies[0].actor;
  const { DialogV2 } = foundry.applications.api;
  const opts = allies.map((t) => `<option value="${t.id}">${esc(t.actor.name)}</option>`).join("");
  const result = await DialogV2.wait({
    window: { title: "Allied Strike", icon: "fa-solid fa-people-group" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked">`
      + `<label>Which ally strikes? They must see and hear you.</label>`
      + `<select name="choice">${opts}</select></div></div>`,
    buttons: [
      { action: "ok", label: "Confirm", default: true,
        callback: (e, b) => new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(b.form ?? b.closest("form")).object },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return allies.find((t) => t.id === result.choice)?.actor ?? null;
}

/**
 * Press one button: re-check, pay, run, and mark it used.
 *
 * THE RE-CHECK IS NOT OPTIONAL. A card can sit in the log while the
 * reaction it offers is spent on something else — `opportunity.mjs` and
 * `swift-pursuit.mjs` both re-check for exactly that reason, and a feat
 * that skipped it would let one reaction be spent twice.
 */
export async function executeReactionFeat(message, reactorActorId, featKey) {
  const card = message?.getFlag?.(SYSTEM_ID, CARD_FLAG);
  if (!card) return null;
  const usedKey = `${reactorActorId}:${featKey}`;
  if ((card.used ?? []).includes(usedKey)) return null;

  // RESOLVED FROM THE ROW'S OWN HANDLE, the bare id only as a fallback
  // for a card written before 3.469.0.
  const row = (card.rows ?? []).find(
    (r) => String(r?.actorId ?? "") === String(reactorActorId) && r?.key === featKey);
  const reactor = (await resolveActorHandle(row?.handle))
    ?? game.actors.get(reactorActorId);
  const entry = REACTION_FEATS[featKey];
  if (!reactor || !entry) return null;

  // Requirements and the reaction pool, asked again now rather than
  // trusted from when the card was posted.
  const { offered } = reactionOffersFor(reactor, card.trigger, card.context ?? {});
  if (!offered.some((o) => o.key === featKey)) {
    ui.notifications.warn(`${entry.label}: ${reactor.name} can no longer take this reaction.`);
    return null;
  }

  // THE OFFER DECIDED WHAT THIS COSTS, not the table alone — a Cleave
  // continuation is free even though Cleave's printed cost is a
  // reaction. Reading the offer rather than the table is what keeps the
  // chain to the one reaction Graham ruled it costs.
  const thisOffer = offered.find((o) => o.key === featKey);
  if ((thisOffer?.cost ?? entry.cost) === "reaction") {
    await spendReaction(reactor, entry.label, { traits: entry.traits ?? "" });
  }

  // A CHAIN IS NOW RUNNING. Set for Great Cleave only, and cleared when
  // the reaction pool refills — see documents/combat.mjs. Without the
  // clear this would be a permanently free Cleave, which is exactly the
  // kind of stuck flag this project has been bitten by before.
  if (featKey === "cleave" && featNamesOf(reactor).some((n) => n.trim().toLowerCase() === "great cleave")) {
    await reactor.setFlag(SYSTEM_ID, CHAIN_FLAG, true);
  }

  const run = RUN[featKey];
  if (run) await run(reactor, card.context ?? {});

  await message.setFlag(SYSTEM_ID, CARD_FLAG, { ...card, used: [...(card.used ?? []), usedKey] });
  return true;
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

export function registerReactionFeatHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.getFlag?.(SYSTEM_ID, CARD_FLAG);
    if (!card) return;
    const used = new Set(card.used ?? []);
    html.querySelectorAll?.('[data-action="takeReactionFeat"]').forEach((btn) => {
      const actorId = btn.dataset?.reactor;
      const featKey = btn.dataset?.feat;
      if (used.has(`${actorId}:${featKey}`)) {
        btn.disabled = true;
        btn.textContent = `${btn.textContent} — taken`;
        return;
      }
      if (!game.user.isGM) { btn.style.display = "none"; return; }
      if (btn[BOUND]) return;
      btn[BOUND] = true;
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        btn.disabled = true;
        try { await executeReactionFeat(message, actorId, featKey); }
        finally { btn.disabled = false; }
      });
    });
  });
}
