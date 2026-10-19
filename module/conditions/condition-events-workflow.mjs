/**
 * condition-events-workflow — Appendix 2's clauses, wired to the table.
 *
 * NEW at 3.621.0 (block 39; Graham's R5–R7 of 5 October 2026). The rules
 * themselves are in condition-rules.mjs, pure; this file reads actors,
 * tokens and the combat, and writes the consequences:
 *
 * - what an attack gains against a creature under a condition (advantage
 *   when it cannot move, Prone's ±4, flat-footed to a hidden attacker);
 * - the flat checks Deafened and Grabbed put on an action once it is paid;
 * - the moments: Soul Drain's hit point damage, Stunned gained mid-turn,
 *   falling prone and dropping what you hold on going Unconscious, waking
 *   on damage or healing, Fixated ending on a hostile act, and the
 *   Frightened save offered at the end of each turn.
 *
 * The moments that must hold whichever route wrote the condition are
 * watched from the acting GM's client (`registerConditionEventHooks`),
 * keyed on a flag on the actor so each fires once and survives a reload.
 */

import {
  RETCH_AP, actionFlatChecks, attackAdvantageAgainst, conditionLabel, flatFootedToAttackerBy,
  proneTargetModifier, soulDrainDamage, stunnedDeduction, wakesOnHpChange
} from "./condition-rules.mjs";

const SYSTEM_ID = "trg-prime";

/** Set while a creature's going-Unconscious has been dealt with. */
const FELL_UNCONSCIOUS_FLAG = "fellUnconscious";
/** The round and turn this creature last regained AP in (combat.mjs). */
const AP_GRANTED_FLAG = "apGrantedTurn";
/** The rest option that keeps natural healing from waking a sleeper. */
const REST_OPTION = "trgRest";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines, extra = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`,
    ...extra
  });
}

function effectiveOf(actor) {
  return actor?.conditions?.effective ?? new Set();
}

function directEffects(actor, id) {
  return Array.from(actor?.effects ?? [])
    .filter((e) => !e.disabled && (e.statuses?.has?.(id) || Array.from(e.statuses ?? []).includes(id)));
}

/* ------------------------------------------------------------------ */
/* Attacks                                                              */
/* ------------------------------------------------------------------ */

/**
 * What the target's conditions, and the attacker's, add to one attack.
 *
 * "Flat-footed to you" costs the target its Dexterity and dodge bonuses to
 * DB against this attacker only, so — as Surprise Attack does — it is paid
 * as a bonus on the attack rather than written onto the target. A target
 * already flat-footed has nothing left to lose, and the figures read 0.
 *
 * @returns {{advantage:string, rows:object[], flatFootedBy:string|null}}
 */
export function attackTermsAgainst(targetActor, attackerActor, { distanceFeet = null, melee = false } = {}) {
  const out = { advantage: "", rows: [], flatFootedBy: null };
  if (!targetActor) return out;
  const target = effectiveOf(targetActor);
  const stuck = attackAdvantageAgainst(target);
  if (stuck) out.advantage = `${targetActor.name} is ${conditionLabel(stuck)} and cannot move`;
  const prone = proneTargetModifier(target, distanceFeet, { melee });
  if (prone) out.rows.push(prone);
  const by = flatFootedToAttackerBy(effectiveOf(attackerActor));
  if (by) {
    out.flatFootedBy = by;
    const bonus = flatFootedToYouBonus(targetActor.system);
    if (bonus > 0) {
      out.rows.push({
        label: `${targetActor.name} is flat-footed to you (${conditionLabel(by)})`,
        value: bonus,
        type: "circumstance"
      });
    }
  }
  return out;
}

/** The Dexterity and dodge a target would lose by being flat-footed. */
function flatFootedToYouBonus(targetSystem) {
  const defence = targetSystem?.combat?.defence ?? {};
  const dex = Math.max(0, Number(defence.ability) || 0);
  const dodge = Math.max(0, Number(defence.breakdown?.byType?.dodge) || 0);
  return dex + dodge;
}

/** The distance between two creatures' tokens, or null. */
export async function distanceBetweenActors(a, b) {
  const { activeToken, distanceBetween } = await import("../combat/geometry.mjs");
  const ta = activeToken(a);
  const tb = activeToken(b);
  return ta && tb ? distanceBetween(ta, tb) : null;
}

/* ------------------------------------------------------------------ */
/* Flat checks on a paid action (Deafened, Grabbed)                     */
/* ------------------------------------------------------------------ */

/**
 * "Attempt the check after spending the action but before any effects are
 * applied." True when the action goes ahead.
 */
export async function passActionFlatChecks(actor, action) {
  try {
    const checks = actionFlatChecks(effectiveOf(actor), action?.traits ?? "");
    if (!checks.length) return true;
    const { TRGCheck } = await import("../dice/check.mjs");
    for (const spec of checks) {
      const check = await TRGCheck.roll({
        actor,
        label: `${action?.name ?? "Action"} — ${conditionLabel(spec.condition)} Flat Check`,
        subtitle: `${spec.trait} action while ${conditionLabel(spec.condition)} — DC ${spec.dc}`,
        type: "flat",
        flat: true,
        dc: spec.dc
      });
      if (!check.outcome?.degree?.success) {
        await postCard(actor, action?.name ?? "Action", [
          line(`<strong>The action is lost</strong> — ${actor.name} is ${conditionLabel(spec.condition)} `
            + `and failed the DC ${spec.dc} flat check for ${/^[aeiou]/i.test(String(spec.trait)) ? "an" : "a"} ${spec.trait} action. The AP stays spent.`)
        ]);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("TRG Prime | a condition flat check could not be rolled", error);
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Fixated: "ceases to exist if you or any of your allies are subjected */
/* to hostile actions by another creature"                              */
/* ------------------------------------------------------------------ */

/**
 * End Fixated on each creature on the receiving end of a hostile act, and
 * on its allies (same disposition, on the canvas).
 */
export async function endFixationOnHostileAct(targets = [], attacker = null) {
  try {
    const { tokensAlliedWith } = await import("../combat/geometry.mjs");
    const seen = new Set();
    const ended = [];
    for (const target of targets) {
      if (!target) continue;
      const token = target.getActiveTokens?.()?.[0] ?? null;
      const group = [target, ...(token ? tokensAlliedWith(token).map((t) => t.actor) : [])];
      for (const actor of group) {
        if (!actor || seen.has(actor.uuid) || actor === attacker) continue;
        seen.add(actor.uuid);
        if (!directEffects(actor, "fixated").length) continue;
        const { relayStatus } = await import("../combat/target-relay-workflow.mjs");
        await relayStatus(actor, "fixated", { active: false },
          () => actor.toggleStatusEffect("fixated", { active: false }));
        ended.push(actor.name);
      }
    }
    if (ended.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">${line(
          `<strong>Fixated ends</strong> for ${ended.join(", ")} — a hostile act against them or an ally.`)}</div>`
      });
    }
    return ended;
  } catch (error) {
    console.error("TRG Prime | Fixated could not be ended", error);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* After a valued condition is written                                  */
/* ------------------------------------------------------------------ */

/**
 * Called by `#applyValuedCondition` once the new value is on the actor —
 * the one write every valued condition passes through, whichever helper
 * asked for it.
 */
export async function afterValuedCondition(actor, id, before, after) {
  try {
    if (id === "soulDrain") await soulDrainStrikes(actor, before, after);
    if (id === "stunned" && Number(after) > Number(before)) await stunnedMidTurn(actor);
  } catch (error) {
    console.error(`TRG Prime | the consequences of ${id} could not be applied`, error);
  }
}

/**
 * SOUL DRAIN (A7): "This amount is applied directly to your character as
 * Hit Point damage but also reduces your maximum hit points." The max falls
 * in preparation; the damage is dealt here, once, for the rise.
 */
async function soulDrainStrikes(actor, before, after) {
  const damage = soulDrainDamage(before, after);
  if (!damage) return;
  const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
  // THE FALLEN MAXIMUM IS NOT A SECOND BLOW (3.660.1; found live testing
  // 3.660.0 — a Brave at 79/79 drained 17 ended at 45/62, not 62/62). The max
  // falls in preparation, and preparation clamps the current HP under it; that
  // clamp already took part of this drain, so only the rest is dealt here.
  const stored = Number(actor._source?.system?.resources?.hp?.value ?? actor.system?.resources?.hp?.value ?? 0);
  const derived = Number(actor.system?.resources?.hp?.value ?? 0);
  const { soulDrainDamageAfterClamp } = await import("./soul-drain.mjs");
  const owed = soulDrainDamageAfterClamp(damage, stored, derived);
  const hpBefore = Math.max(stored, derived);
  let hpAfter = derived;
  if (owed > 0) {
    const result = await applyDamageAndCheckDying(actor, owed);
    hpAfter = Number(result?.newHP ?? actor.system?.resources?.hp?.value ?? 0);
  } else if (stored !== derived) {
    await actor.update({ "system.resources.hp.value": derived });
  }
  await postCard(actor, "Soul Drain", [
    line(`Soul Drain ${before || 0} → <strong>${after}</strong>: <strong>${damage}</strong> hit point damage, `
      + `and the maximum falls by the same. HP ${hpBefore} → ${hpAfter}.`)
  ]);
}

/**
 * STUNNED ON YOUR OWN TURN: "you immediately deduct the Stunned value from
 * any remaining AP". Only once this creature has regained its AP for the
 * turn — a Stunned that arrives in Phase 1, before the regain, is spent by
 * the regain itself.
 */
async function stunnedMidTurn(actor) {
  const combat = game.combat;
  if (!combat?.started) return;
  const active = combat.combatant?.actor;
  if (!active || active.id !== actor.id) return;
  const stamp = actor.getFlag?.(SYSTEM_ID, AP_GRANTED_FLAG);
  if (!stamp || stamp.combatId !== combat.id || stamp.round !== combat.round || stamp.turn !== combat.turn) return;
  const stunned = Number(actor.getConditionValue?.("stunned") ?? 0);
  const ap = Number(actor.system?.resources?.ap?.value ?? 0);
  const result = stunnedDeduction(ap, stunned);
  if (!result.lost) return;
  await actor.update({ "system.resources.ap.value": result.ap });
  if (result.stunned > 0) await actor.toggleStatusEffect("stunned", { value: result.stunned });
  else await actor.toggleStatusEffect("stunned", { active: false });
  await postCard(actor, "Stunned", [
    line(`Stunned during its own turn: <strong>${result.lost} AP</strong> lost at once `
      + `(AP ${ap} → ${result.ap}); Stunned ${stunned} → ${result.stunned}.`)
  ]);
}

/* ------------------------------------------------------------------ */
/* Sickened's Retch                                                     */
/* ------------------------------------------------------------------ */

/** Retch is "a 1 AP manipulate action": asked first, paid once rolled. */
export async function retchCost(actor) {
  const { ensureActionPoints } = await import("../combat/action-points-workflow.mjs");
  return ensureActionPoints(actor, RETCH_AP, "Retch");
}

export async function payRetch(actor) {
  const { spendActionPoints } = await import("../combat/action-points-workflow.mjs");
  await spendActionPoints(actor, RETCH_AP, "Retch");
}

/* ------------------------------------------------------------------ */
/* Frightened: "At the end of each of your turns, you may make a Will   */
/* Saving Throw"                                                        */
/* ------------------------------------------------------------------ */

/** The end-of-turn offer, as a card with a button. */
export async function offerFrightenedRecovery(actor) {
  const value = Number(actor?.getConditionValue?.("frightened") ?? 0);
  if (!value) return null;
  return postCard(actor, "Frightened — End of Turn", [
    line(`Frightened ${value}: at the end of each turn ${actor.name} may make a Will save against the fear effect's DC.`),
    `<button type="button" class="trg-frightened-recovery" data-actor-uuid="${actor.uuid}">`
      + `<i class="fa-solid fa-dice-d20"></i> Roll the Will save</button>`
  ], { flags: { [SYSTEM_ID]: { frightenedRecovery: actor.uuid } } });
}

/* ------------------------------------------------------------------ */
/* The watcher                                                          */
/* ------------------------------------------------------------------ */

const busy = new Set();

/**
 * UNCONSCIOUS (A10): "Upon gaining this condition, you fall prone and drop
 * any items you are currently holding or wielding." A moment, not a state:
 * Prone is written as its own condition, which Standing ends, and the held
 * items are unequipped (as Release does). Fires once per spell of
 * unconsciousness, whatever put the creature down.
 */
async function settleUnconscious(actor) {
  const down = effectiveOf(actor).has("unconscious");
  const marked = Boolean(actor.getFlag?.(SYSTEM_ID, FELL_UNCONSCIOUS_FLAG));
  if (down === marked) return;
  if (!down) {
    await actor.unsetFlag(SYSTEM_ID, FELL_UNCONSCIOUS_FLAG);
    return;
  }
  await actor.setFlag(SYSTEM_ID, FELL_UNCONSCIOUS_FLAG, true);
  const lines = [];
  if (!directEffects(actor, "prone").length) {
    await actor.toggleStatusEffect("prone", { active: true });
    lines.push(line(`${actor.name} falls <strong>prone</strong>.`));
  }
  const { itemRequiredHands } = await import("../held-items.mjs");
  const size = actor.system?.identity?.size ?? "medium";
  const held = Array.from(actor.items ?? [])
    .filter((item) => item.system?.equipped && itemRequiredHands(item, size) > 0);
  if (held.length) {
    await actor.updateEmbeddedDocuments("Item", held.map((item) => ({ _id: item.id, "system.equipped": false })));
    lines.push(line(`Drops ${held.map((i) => i.name).join(", ")} (unequipped).`));
  }
  if (lines.length) {
    lines.push(line("<em>Unconscious. The GM may rule the creature's position spares it the fall — remove Prone and re-equip by hand.</em>"));
    await postCard(actor, "Unconscious", lines);
  }
}

/**
 * WAKING: "Damage inflicted to you can awaken you, given that it doesn't
 * invoke the dying condition. Receiving healing, barring the natural
 * recovery gained through rest, can rouse you".
 */
async function wakeOnHpChange(actor, options) {
  const direct = directEffects(actor, "unconscious");
  if (!wakesOnHpChange({
    directlyUnconscious: direct.length > 0,
    dying: effectiveOf(actor).has("dying"),
    hpAfter: Number(actor.system?.resources?.hp?.value ?? 0),
    rest: Boolean(options?.[REST_OPTION])
  })) return;
  // RACED BY THE DEATH STATE'S OWN CLEAR (3.630.1, F3 of the 3.630.0 live
  // test): healing from 0 HP wakes the creature here and in
  // `clearUnconsciousIfConscious` at once, and the loser's delete threw
  // "ActiveEffect … does not exist" — aborting every row after the heal
  // (Divine Nectar's conditions and re-save). Only what is still there is
  // deleted, and a delete lost to the other path is no failure.
  for (const effect of direct) {
    if (!actor.effects?.get?.(effect.id)) continue;
    try { await effect.delete(); } catch (_e) { /* already gone */ }
  }
  await postCard(actor, "Wakes", [line(`${actor.name} <strong>wakes</strong> — the damage or healing rouses them.`)]);
}

/** Shaking a sleeper awake: the Interact action on an Unconscious target. */
export async function shakeAwake(waker, target) {
  const direct = directEffects(target, "unconscious");
  if (!direct.length || effectiveOf(target).has("dying")) return false;
  if (Number(target.system?.resources?.hp?.value ?? 0) <= 0) return false;
  const { relayStatus } = await import("../combat/target-relay-workflow.mjs");
  await relayStatus(target, "unconscious", { active: false },
    async () => { for (const e of direct) await e.delete(); });
  await postCard(waker, "Interact — Wake", [line(`${waker.name} shakes <strong>${target.name}</strong> awake.`)]);
  return true;
}

function schedule(actor, work) {
  if (!actor?.id) return;
  const key = actor.uuid;
  if (busy.has(key)) return;
  busy.add(key);
  setTimeout(async () => {
    try {
      await work();
    } catch (error) {
      console.error("TRG Prime | a condition event could not be settled", error);
    } finally {
      busy.delete(key);
    }
  }, 0);
}

export function registerConditionEventHooks() {
  const acting = async () => (await import("../acting-gm.mjs")).isActingGM();
  const onEffect = (effect) => {
    const actor = effect?.parent;
    if (actor?.documentName !== "Actor") return;
    schedule(actor, async () => {
      if (await acting()) await settleUnconscious(actor);
    });
  };
  Hooks.on("createActiveEffect", onEffect);
  Hooks.on("updateActiveEffect", onEffect);
  Hooks.on("deleteActiveEffect", onEffect);

  Hooks.on("preUpdateActor", (actor, changes, options) => {
    const next = foundry.utils.getProperty(changes, "system.resources.hp.value");
    if (next === undefined) return;
    options.trgHpBefore = Number(actor.system?.resources?.hp?.value ?? 0);
  });
  Hooks.on("updateActor", (actor, changes, options) => {
    const next = foundry.utils.getProperty(changes, "system.resources.hp.value");
    if (next === undefined) return;
    void (async () => {
      if (!(await acting())) return;
      try {
        await wakeOnHpChange(actor, options);
        // Damage is the plainest hostile act there is.
        const before = Number(options?.trgHpBefore);
        if (Number.isFinite(before) && Number(next) < before && !options?.[REST_OPTION]) {
          await endFixationOnHostileAct([actor]);
        }
      } catch (error) {
        console.error("TRG Prime | a hit point change could not be settled", error);
      }
    })();
  });

  // The Frightened card's button.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const button = html?.querySelector?.(".trg-frightened-recovery");
    if (!button) return;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const actor = await fromUuid(button.dataset.actorUuid);
      if (!actor?.isOwner) return ui.notifications.warn("Only the frightened creature's owner can roll this.");
      const { rollFrightenedRecovery } = await import("../combat/conditions-workflow.mjs");
      await rollFrightenedRecovery(actor);
    });
  });
}
