/**
 * The Foundry side of barrier.mjs — Stone Shield's slab of stone.
 *
 * NEW at 3.707.0. What lives here:
 *
 *   - `barrierInTheWay`: the shield a miss by the warded foe strikes.
 *   - `damageBarrier`: damage to the shield, through its Hardness, off its
 *     Hits, and the spell ended at 0 — through the GM when the client that
 *     rolled does not own the shielded caster (a player's Strike on the
 *     GM's NPC), as every other write on somebody else's creature is.
 *   - `postBarrierCard`: the shield's own card, with the GM's
 *     "Damage the shield" button (Graham, 21 November 2026: area damage
 *     "does not attack against your DB … A damage the shield button for
 *     the GM would however be useful").
 *   - `castQuestionGate`: "You cannot use this spell if you are not
 *     adjacent to a large area of earth or stone" — asked, and refused on
 *     No before anything is spent.
 *   - the Stone Shield reaction offer, registered with the defence offers
 *     Nimble Dodge uses: asked of the caster's player before an attack
 *     against them rolls, and cast with the attacker as the chosen foe.
 */
import {
  BARRIER_FLAG,
  barrierAfterDamage,
  barrierAgainst,
  barrierCatches,
  barrierDamageLine,
  barriersOn,
  castQuestionRefusal,
  castQuestionsOf
} from "./barrier.mjs";

const SYSTEM_ID = "trg-prime";
const esc = (v) => globalThis.foundry?.utils?.escapeHTML?.(String(v ?? "")) ?? String(v ?? "");
const line = (text) => `<p style="margin:2px 0">${text}</p>`;

/**
 * The barrier this attack's miss strikes, or null.
 *
 * @param {Actor} defender the creature attacked
 * @param {Actor} attacker
 * @param {{missBy: number|null, hits: boolean}} attack
 * @returns {{effectId: string, barrier: object}|null}
 */
export function barrierInTheWay(defender, attacker, { missBy = null, hits = false } = {}) {
  if (!defender || !attacker) return null;
  const found = barrierAgainst(Array.from(defender.effects ?? []), attacker.uuid, SYSTEM_ID);
  if (!found) return null;
  return barrierCatches(found.barrier, { attackerUuid: attacker.uuid, missBy, hits }) ? found : null;
}

/**
 * Deal damage to a barrier on THIS client, which must own the defender.
 * The GM's relay and the GM's button both end here.
 *
 * @returns {Promise<{ok: boolean, result?: object, barrier?: object, reason?: string}>}
 */
export async function damageBarrierDirect(defender, effectId, damage) {
  const effect = defender?.effects?.get?.(String(effectId ?? "")) ?? null;
  const barrier = effect?.getFlag?.(SYSTEM_ID, BARRIER_FLAG) ?? null;
  if (!effect || !barrier) return { ok: false, reason: "the shield is no longer there" };
  const result = barrierAfterDamage(barrier, damage);
  if (!result.destroyed) {
    if (result.taken > 0) await effect.setFlag(SYSTEM_ID, BARRIER_FLAG, { ...barrier, hits: result.after });
    return { ok: true, result, barrier };
  }
  // DESTROYED: "the spell ends and the shield crumbles away into
  // nothingness". The cast is ended where it is registered, which removes
  // its effects; the ward is deleted after in case it was not registered.
  const castId = barrier.castId ?? effect.getFlag?.(SYSTEM_ID, "castId") ?? null;
  if (castId) {
    const { endActiveSpell } = await import("./active-spells.mjs");
    await endActiveSpell(defender, castId, { dismissed: false });
  }
  if (defender.effects?.get?.(effect.id)) await effect.delete();
  return { ok: true, result, barrier };
}

/**
 * Deal damage to a barrier from whichever client is resolving the blow.
 *
 * @param {Actor} defender
 * @param {string} effectId
 * @param {number} damage
 */
export async function damageBarrier(defender, effectId, damage) {
  const { needsRelay } = await import("../combat/target-relay.mjs");
  if (!needsRelay(defender)) return damageBarrierDirect(defender, effectId, damage);
  const { relayBarrierDamage } = await import("../combat/target-relay-workflow.mjs");
  return relayBarrierDamage(defender, effectId, damage);
}

/**
 * The shield's card: what happened to it, and the GM's button while it
 * still stands.
 *
 * @param {Actor} defender
 * @param {string} title
 * @param {string[]} lines already wrapped
 * @param {{effectId?: string, standing?: boolean}} [opts]
 */
export function barrierButton(defender, effectId) {
  if (!defender?.uuid || !effectId) return "";
  return `<button type="button" data-action="barrierDamage" data-defender-uuid="${esc(defender.uuid)}" `
    + `data-effect-id="${esc(effectId)}" style="width:100%">`
    + `<i class="fa-solid fa-hammer"></i> Damage the shield (GM)</button>`;
}

export async function postBarrierCard(defender, title, lines, { effectId = "", standing = true } = {}) {
  const button = standing ? barrierButton(defender, effectId) : "";
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${esc(defender.name)}</span><h3>${esc(title)}</h3></div></header>`
      + `${lines.join("")}${button}</div>`
  });
}

/**
 * A blow that struck the shield, said and dealt: the damage the caller
 * rolled goes through the shield's Hardness, and the shield's card says
 * what is left.
 *
 * @param {Actor} defender
 * @param {{effectId: string, barrier: object}} inTheWay
 * @param {number} damage
 * @param {string} how "Ogre's Club misses by 3"
 * @returns {Promise<string>} the line for the attack's own card
 */
export async function strikeBarrierWith(defender, inTheWay, damage, how = "") {
  const answer = await damageBarrier(defender, inTheWay.effectId, damage);
  const barrier = answer.barrier ?? inTheWay.barrier;
  const name = barrier?.label || "The shield";
  if (!answer.ok) {
    const said = `<em>${esc(name)} could not take the damage: ${esc(answer.reason ?? "unknown")}. `
      + "Apply it by hand.</em>";
    await postBarrierCard(defender, name, [line(said)], { effectId: inTheWay.effectId });
    return said;
  }
  const said = barrierDamageLine(barrier, answer.result, { how });
  await postBarrierCard(defender, `${name} — struck`, [line(said)], {
    effectId: inTheWay.effectId, standing: !answer.result.destroyed
  });
  return said;
}

/** The line an attack card prints when its miss strikes the shield. */
export function barrierCatchLine(inTheWay, missBy, defenderName = "") {
  const name = inTheWay?.barrier?.label || "the shield";
  return `<strong>${esc(name)}!</strong> The attack misses ${esc(defenderName || "the target")} by ${missBy} `
    + `and strikes the shield instead — its damage is rolled against the shield.`;
}

/* ------------------------------------------------------------------ *
 * The question before the cast.
 * ------------------------------------------------------------------ */

/**
 * Ask every question the spell declares; false (and a notification) on a
 * No. `answered` is a reaction offer whose prompt already stated it.
 */
export async function castQuestionGate(actor, spellData, spellName, { answered = false } = {}) {
  const questions = castQuestionsOf(spellData);
  if (!questions.length || answered) return true;
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return true;
  for (const question of questions) {
    const yes = await DialogV2.confirm({
      window: { title: `${spellName} — ${actor?.name ?? ""}` },
      content: `<p>${esc(question)}</p>`,
      rejectClose: false
    });
    if (!yes) {
      ui.notifications?.warn?.(castQuestionRefusal(spellName, question));
      return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * The GM's button.
 * ------------------------------------------------------------------ */

async function pressBarrierDamage(defenderUuid, effectId) {
  if (!game.user?.isGM) {
    ui.notifications?.warn?.("Only the GM can damage the shield from here.");
    return false;
  }
  const doc = defenderUuid ? await fromUuid(defenderUuid) : null;
  const defender = doc?.actor ?? doc ?? null;
  const effect = defender?.effects?.get?.(String(effectId ?? ""));
  const barrier = effect?.getFlag?.(SYSTEM_ID, BARRIER_FLAG);
  if (!defender || !barrier) {
    ui.notifications?.info?.("That shield is gone.");
    return false;
  }
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return false;
  const amount = await DialogV2.prompt({
    window: { title: `Damage the ${barrier.label}` },
    content: `<p>${esc(barrier.label)}: Hardness ${barrier.hardness}, ${barrier.hits}/${barrier.max} Hits.</p>`
      + `<p>Damage dealt to the shield (before Hardness):</p>`
      + `<input type="number" name="amount" min="0" step="1" value="0" autofocus style="width:100%">`,
    ok: { label: "Damage", callback: (event, button) => Number(button.form?.elements?.amount?.value ?? 0) },
    rejectClose: false
  });
  if (amount === null || amount === undefined || !(Number(amount) >= 0)) return false;
  await strikeBarrierWith(defender, { effectId: effect.id, barrier }, Number(amount), "The GM's damage");
  return true;
}

/** Bind the button. Called once from the ready hooks. */
export function registerBarrierHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    // THE BUTTON NAMES ITS SHIELD, so it works on the cast card as well as on
    // the shield's own cards. Hidden from players: it is the GM's.
    for (const button of html?.querySelectorAll?.('[data-action="barrierDamage"]') ?? []) {
      if (!game.user?.isGM) { button.style.display = "none"; continue; }
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        try { await pressBarrierDamage(button.dataset.defenderUuid, button.dataset.effectId); } finally { button.disabled = false; }
      });
    }
  });
}

/** The standing barrier a cast just wrote on this creature, or null. */
export function barrierWrittenBy(actor, castId = null) {
  const standing = barriersOn(Array.from(actor?.effects ?? []), SYSTEM_ID);
  const mine = castId ? standing.filter((s) => s.barrier.castId === castId) : standing;
  return mine.at(-1) ?? null;
}

/** Every standing barrier on a creature (for a module or a macro). */
export function standingBarriers(actor) {
  return barriersOn(Array.from(actor?.effects ?? []), SYSTEM_ID);
}

/* ------------------------------------------------------------------ *
 * STONE SHIELD AS A REACTION TO BEING ATTACKED (Graham, 21 November 2026:
 * "this spell is a reaction cast so a GM prompt (similar to what is used
 * for Nimble Dodge) could work").
 *
 * The prompt states the requirement, so taking it is the caster's Yes to
 * the earth-or-stone question; the cast that follows is not asked again
 * (a second dialog would run against the attack's 30-second wait).
 * ------------------------------------------------------------------ */

export const STONE_SHIELD = "Stone Shield";

/** The caster's Stone Shield, by name. */
export function stoneShieldSpellOf(actor) {
  return Array.from(actor?.items ?? []).find((i) => i.type === "spell"
    && String(i.name ?? "").trim().toLowerCase() === STONE_SHIELD.toLowerCase()) ?? null;
}

/**
 * Why Stone Shield cannot be taken against this attack, or null. Pure over
 * the facts, so the harness runs it.
 *
 * @param {object} facts
 * @param {number} facts.pp the caster's PP
 * @param {number} facts.ppCost the spell's
 * @param {string} facts.blocked the spell's own cast refusal ("not prepared today"), or ""
 * @param {boolean} facts.alreadyAgainst a shield already stands against this attacker
 */
export function stoneShieldRefusal({ pp = 0, ppCost = 0, blocked = "", alreadyAgainst = false } = {}) {
  if (blocked) return String(blocked);
  if (alreadyAgainst) return "a stone shield already stands against this attacker";
  if (Number(pp) < Number(ppCost)) return `needs ${Number(ppCost)} PP`;
  return null;
}

/** Cast Stone Shield, aimed at the attacker, on the caster's client. */
async function castStoneShieldAgainst(caster, spell, attack) {
  const doc = attack?.attackerUuid ? await fromUuid(attack.attackerUuid) : null;
  const attacker = doc?.actor ?? doc ?? null;
  const token = attacker?.getActiveTokens?.()?.[0] ?? null;
  if (!token) {
    ui.notifications?.warn?.("Stone Shield: the attacker has no token on this scene to raise the shield against.");
    return null;
  }
  const { castAsReaction } = await import("./save-reaction-spells-workflow.mjs");
  return castAsReaction(caster, spell, [token.id], { castQuestionsAnswered: true });
}

/** Registered once, beside Nimble Dodge. */
export async function registerStoneShieldOffer() {
  const { registerDefenceOffer } = await import("../combat/defence-offer.mjs");
  const { spellCastBlocked } = await import("./spell-availability.mjs");
  registerDefenceOffer(STONE_SHIELD, {
    summary: "+4 circumstance to your DB against this attacker until the start of your next turn; "
      + "its misses by 4 or less strike the shield (Hardness 8, 15 Hits). "
      + "Only if you are adjacent to a large area of earth or stone, such as the ground or a wall. "
      + "Spends your reaction and its PP.",
    against: "attack",
    find: (actor) => stoneShieldSpellOf(actor),
    requires: (actor, item, event) => stoneShieldRefusal({
      pp: Number(actor?.system?.resources?.pp?.value ?? 0),
      ppCost: Number(item?.system?.ppCost ?? 0),
      blocked: spellCastBlocked(item) || "",
      alreadyAgainst: Boolean(event?.attackerUuid
        && barrierAgainst(Array.from(actor?.effects ?? []), event.attackerUuid, SYSTEM_ID))
    }),
    use: (actor, item, attack) => castStoneShieldAgainst(actor, item, attack)
  });
}
