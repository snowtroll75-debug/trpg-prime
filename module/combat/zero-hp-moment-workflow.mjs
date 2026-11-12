/**
 * The 0 HP moment, the Foundry half (3.684.0; Eldritch Arts Block 6, G7). The
 * rule is in zero-hp-moment.mjs; this asks the modules' "would fall
 * unconscious" offers (module-api.mjs `registerUnconsciousOffer`) and reads
 * the hit points they leave.
 *
 * Called from `applyDamageDirect` (dying-workflow.mjs) at the moment a blow
 * reaches 0, after a creature already Dying and before the subdual knock-out,
 * the death guards, destruction, massive damage and Dying. Returns a damage
 * result in that function's shape, or null to let the blow go on.
 */
import { registeredUnconsciousOffers } from "../module-api.mjs";
import { unconsciousOfferHeld, unconsciousOfferLines, unconsciousOffersAsked } from "./zero-hp-moment.mjs";

const line = (html) => `<p style="margin:2px 0">${html}</p>`;

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * @param {Actor} actor the creature the blow takes to 0
 * @param {object} blow
 * @param {string[]} [blow.damageTypes]
 * @param {string} [blow.sourceName]
 * @param {boolean} [blow.subdual]
 * @param {number} [blow.hpBefore]
 * @param {number} [blow.amount]
 * @param {boolean} [blow.massive] it kills outright
 * @param {boolean} [blow.noDeathState] it destroys a creature with no Death State
 * @returns {Promise<object|null>}
 */
export async function tryUnconsciousOffers(actor, { damageTypes = [], sourceName = "", subdual = false, hpBefore = 0, amount = 0, massive = false, noDeathState = false } = {}) {
  const offers = registeredUnconsciousOffers();
  if (!offers.length || !actor) return null;
  if (!unconsciousOffersAsked({ subdual, massive, noDeathState })) return null;
  const ctx = { actor, damageTypes: [...(damageTypes ?? [])], subdual: Boolean(subdual), hpBefore: Number(hpBefore) || 0, amount: Number(amount) || 0, sourceName: String(sourceName ?? "") };

  // Who could answer at all. Only then does the blow land early.
  const live = [];
  for (const spec of offers) {
    try {
      if (!spec.applies || await spec.applies(ctx)) live.push(spec);
    } catch (err) {
      console.warn(`TRG Prime | a module's unconscious offer (${spec.key}) failed to say whether it applies`, err);
    }
  }
  if (!live.length) return null;

  // THE BLOW LANDS: the heal the ruling counts from 0 is counted from 0.
  await actor.update({ "system.resources.hp.value": 0 });
  const lines = [];
  for (const spec of live) {
    let answer = null;
    try {
      answer = await spec.offer(ctx);
    } catch (err) {
      console.warn(`TRG Prime | a module's unconscious offer (${spec.key}) failed`, err);
    }
    lines.push(...unconsciousOfferLines(answer));
    const hp = Number(actor.system?.resources?.hp?.value ?? 0);
    if (unconsciousOfferHeld(hp)) {
      lines.push(line(`${actor.name} is at <strong>${hp} HP</strong>: they do not fall unconscious, and do not gain Dying from this blow.`));
      await postCard(actor, "Still standing", lines);
      return { case: "unconscious-offer", offer: spec.key, newHP: hp };
    }
  }
  if (lines.length) await postCard(actor, "Falling unconscious", lines);
  return null;
}
