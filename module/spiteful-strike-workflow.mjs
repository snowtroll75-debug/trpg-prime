/**
 * SPITEFUL STRIKE, THE WORKFLOW (3.663.0; F&F 3.0 block 33 R5). See
 * combat/spiteful-strike.mjs for the reading.
 *
 * On the kill (codex-hooks-workflow's trgPrimeCreatureSlain), a card with
 * one button. Its owner targets whoever is in reach and presses it: the
 * Strike is made with its reaction, the damage it inflicts on the targets
 * is measured, half is healed, and a creature lifted above 0 HP is no
 * longer destroyed — the skull and Dying come off, and it is put back in
 * the encounter it was reaped from.
 */
import { spitefulStrikeRule, spitefulWeapon, spitefulHeal } from "./combat/spiteful-strike.mjs";

const SYSTEM_ID = "trg-prime";
const CARD_FLAG = "spitefulStrike";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;

/** The card, offered when a creature with Spiteful Strike is killed. */
export async function offerSpitefulStrike(victim) {
  const rule = spitefulStrikeRule(Array.from(victim?.items ?? []));
  if (!rule) return null;
  const weapon = spitefulWeapon(Array.from(victim.items ?? []), rule.weapon);
  if (!weapon) return null;
  const tokenId = victim.token?.id ?? victim.getActiveTokens?.()?.[0]?.document?.id ?? null;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: victim }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${victim.name}</span><h3>${rule.item.name}</h3></div></header>`
      + line(`${victim.name} is killed — it makes one <strong>${weapon.name}</strong> Strike (its reaction) before it is destroyed. If the Strike inflicts damage, it heals half the amount.`)
      + line(`<em>Target the creature in reach, then press the button.</em>`)
      + `<button type="button" data-action="trgSpitefulStrike"><i class="fa-solid fa-skull"></i> ${weapon.name} — Spiteful Strike</button></div>`,
    flags: { [SYSTEM_ID]: { [CARD_FLAG]: { uuid: victim.uuid, weapon: weapon.name, tokenId, combatId: game.combat?.id ?? null, used: false } } }
  });
}

async function strike(message, data) {
  const actor = await fromUuid(data.uuid);
  if (!actor) return;
  const weapon = spitefulWeapon(Array.from(actor.items ?? []), data.weapon);
  if (!weapon) return;
  await message.setFlag(SYSTEM_ID, CARD_FLAG, { ...data, used: true });
  const targets = Array.from(game.user?.targets ?? []).map((t) => t.actor).filter(Boolean);
  const before = targets.map((a) => Number(a.system?.resources?.hp?.value ?? 0) + Number(a.system?.resources?.hp?.temp ?? 0));
  // "BEFORE BEING DESTROYED" (3.663.1, found live): the Strike is made by the
  // Wight as it stood, not by the corpse its death left. Its Dying (and the
  // Unconscious and Blinded that follow from it), the skull and Prone are
  // lifted for the Strike, and put back if it is destroyed after all.
  const lying = { dying: Number(actor.getConditionValue?.("dying") ?? 0) || 0, dead: Boolean(actor.statuses?.has?.("dead")), unconscious: Boolean(actor.statuses?.has?.("unconscious")), prone: Boolean(actor.statuses?.has?.("prone")) };
  for (const key of ["dead", "dying", "unconscious", "prone"]) if (actor.statuses?.has?.(key)) await actor.toggleStatusEffect(key, { active: false });
  const { spendReaction } = await import("./combat/action-points-workflow.mjs");
  await spendReaction(actor, "Spiteful Strike", { traits: "attack" });
  const { rollWeaponAttack } = await import("./combat/attack-workflow.mjs");
  await rollWeaponAttack(actor, weapon);
  const dealt = targets.reduce((sum, a, i) => sum + Math.max(0, before[i] - (Number(a.system?.resources?.hp?.value ?? 0) + Number(a.system?.resources?.hp?.temp ?? 0))), 0);
  const maxHP = Number(actor.system?.resources?.hp?.max ?? 0);
  const outcome = spitefulHeal(dealt, maxHP);
  const lines = [];
  if (!outcome.survives) {
    if (lying.prone) await actor.toggleStatusEffect("prone", { active: true });
    if (lying.unconscious) await actor.toggleStatusEffect("unconscious", { active: true });
    if (lying.dying) await actor.toggleStatusEffect("dying", { value: lying.dying });
    if (lying.dead) await actor.toggleStatusEffect("dead", { active: true, overlay: true });
    lines.push(line(dealt > 0 ? `It inflicted ${dealt} — too little to heal. ${actor.name} is destroyed.` : `The Strike inflicted no damage. ${actor.name} is destroyed.`));
  } else {
    await actor.update({ "system.resources.hp.value": outcome.hp });
    // AFTER THE HP, NOT BEFORE (3.663.2, found live): lifted at 0 HP, the
    // death watch skulled it again before the Strike was made, and a Wight
    // healed to 9 HP stood there dead. Above 0 the watch leaves it be.
    for (const key of ["dead", "dying", "unconscious", "prone"]) if (actor.statuses?.has?.(key)) await actor.toggleStatusEffect(key, { active: false });
    lines.push(line(`It inflicted <strong>${dealt}</strong>: ${actor.name} heals <strong>${outcome.heal}</strong> and stands at <strong>${outcome.hp} HP</strong> — no longer destroyed.`));
    const combat = (data.combatId && game.combats?.get?.(data.combatId)) || null;
    if (combat && data.tokenId && !combat.combatants.some((c) => c.tokenId === data.tokenId)) {
      await combat.createEmbeddedDocuments("Combatant", [{ tokenId: data.tokenId, sceneId: combat.scene?.id ?? canvas.scene?.id, actorId: actor.id }]);
      lines.push(line(`<em>Returned to the encounter; roll its initiative again.</em>`));
    }
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Spiteful Strike</h3></div></header>${lines.join("")}</div>`
  });
}

export function registerSpitefulStrike() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const data = message?.getFlag?.(SYSTEM_ID, CARD_FLAG);
    if (!data) return;
    html.querySelectorAll?.('[data-action="trgSpitefulStrike"]').forEach((btn) => {
      if (data.used) { btn.disabled = true; return; }
      if (!(game.user?.isGM || message.isOwner)) { btn.style.display = "none"; return; }
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        btn.disabled = true;
        strike(message, data).catch((e) => console.error(`${SYSTEM_ID} | Spiteful Strike`, e));
      });
    });
  });
}
