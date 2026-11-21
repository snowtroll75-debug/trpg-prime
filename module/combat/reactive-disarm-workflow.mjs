/**
 * REACTIVE DISARM (Creature Codex, Chapter 2; 3.631.0).
 *
 * "Action Reaction; Frequency 1/rnd; Trigger A target fumbles a weapon
 * Strike against the creature. The creature attempts a disarm attempt
 * against the triggering attack. This action is not subject to multiple
 * attack penalty."
 *
 * Offered on the defender's card when the fumble lands (the shape every
 * reaction feat takes — Graham's ruling of 21 August 2026: buttons on the
 * card), once a round. Pressed, it spends the reaction and rolls the Disarm
 * basic action against the fumbler with the Attack trait struck from it, so
 * the multiple attack penalty is not counted.
 */
import { bindOnce } from "../dice/check-card-interactions.mjs";

const SYSTEM_ID = "trg-prime";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;

function hasReactiveDisarm(items = []) {
  return Array.from(items ?? []).some((i) => i?.type === "ability" && String(i.name ?? "").trim().toLowerCase() === "reactive disarm");
}

export async function offerReactiveDisarm(defender, attacker, weapon) {
  if (!defender || !attacker || !hasReactiveDisarm(Array.from(defender.items ?? []))) return null;
  const round = Number(game.combat?.round ?? 0);
  if (Number(defender.getFlag?.(SYSTEM_ID, "reactiveDisarmRound")) === round && game.combat?.started) return null;
  if (game.combat?.started && Number(defender.system?.resources?.reactions?.value ?? 0) < 1) return null;
  // THE DEFENDER'S OFFER, NOT THE FUMBLER'S TO READ (3.706.0): whispered to
  // the GM and the defender's own players. See offer-card.mjs.
  const { postOfferCard } = await import("./offer-card.mjs");
  return postOfferCard({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${defender.name}</span><h3>Reactive Disarm</h3></div></header>${
      line(`<strong>${attacker.name} fumbled${weapon ? ` with ${weapon.name}` : ""}.</strong> Reaction: a Disarm attempt against ${attacker.name}, with no multiple attack penalty.`)
    }<p style="margin:6px 0 2px"><button type="button" data-action="reactiveDisarm">Disarm ${attacker.name}</button></p></div>`,
    flags: { [SYSTEM_ID]: { reactiveDisarm: { defenderUuid: defender.uuid, attackerUuid: attacker.uuid, round } } }
  }, { reactors: [defender] });
}

async function pressReactiveDisarm(message) {
  const raw = message.getFlag(SYSTEM_ID, "reactiveDisarm");
  if (!raw || raw.used) return null;
  const d = await fromUuid(raw.defenderUuid).catch(() => null);
  const a = await fromUuid(raw.attackerUuid).catch(() => null);
  const defender = d?.actor ?? d; const attacker = a?.actor ?? a;
  if (!defender || !attacker) return null;
  const { BASIC_ACTIONS } = await import("../data/basic-actions.mjs");
  const base = BASIC_ACTIONS.find((x) => x.key === "disarmAttack");
  if (!base) return null;
  // The attacker is the target, whoever the user had targeted.
  // TARGETED AS EVERY OTHER REACTION TARGETS (3.705.2): `Token#setTarget`.
  // This called `game.user.updateTokenTargets`, which Foundry V14 does not
  // have, so the button threw before anything happened and Reactive Disarm
  // could never be taken. Found in the player-perspective live test of
  // 3.705.1.
  const token = attacker.getActiveTokens?.(true, true)?.[0]?.object ?? null;
  if (token && game.user) token.setTarget(true, { user: game.user, releaseOthers: true });
  const action = { ...base, name: "Reactive Disarm", apCost: "Reaction",
    traits: String(base.traits ?? "").split(",").map((t) => t.trim()).filter((t) => t && t.toLowerCase() !== "attack").join(", ") };
  const { resolveAction } = await import("./action-workflow.mjs");
  // DISARM USES REACH (3.705.0; Graham, 20 Nov 2026: "Yes disarm does use
  // reach"): a fumbler beyond the defender's reach is refused, as any Disarm.
  const result = await resolveAction(defender, action, {});
  // SPENT ONLY WHEN TAKEN (3.705.2). The card and the 1/round frequency were
  // marked before the Disarm was attempted, so a fumbler out of reach (a
  // Lunge, a reach weapon) or a cancelled dialog used up the round's Reactive
  // Disarm for nothing. See `reactiveDisarmTaken`.
  if (!reactiveDisarmTaken(result)) return null;
  await message.setFlag(SYSTEM_ID, "reactiveDisarm", { ...raw, used: true });
  await defender.setFlag(SYSTEM_ID, "reactiveDisarmRound", raw.round);
  return result;
}

/**
 * Whether the Disarm was taken: `resolveAction` returns nothing when it
 * refused the action (out of reach, no reaction left) or the dialog was
 * cancelled, and the reaction is then still the creature's to use. Pure.
 *
 * @param {*} result what `resolveAction` returned
 * @returns {boolean}
 */
export function reactiveDisarmTaken(result) {
  return result !== null && result !== undefined;
}

export function registerReactiveDisarmHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const raw = message.getFlag?.(SYSTEM_ID, "reactiveDisarm");
    if (!raw) return;
    const button = html.querySelector?.('[data-action="reactiveDisarm"]');
    if (!button) return;
    if (raw.used) { button.disabled = true; button.textContent = "✓ Disarm attempted"; return; }
    bindOnce(button, "click", async (event) => {
      event.preventDefault(); button.disabled = true;
      // NOT TAKEN, STILL OFFERED (3.705.2): refused or cancelled leaves the
      // button usable, as the reaction is.
      try { if (!(await pressReactiveDisarm(message))) button.disabled = false; } catch (err) { button.disabled = false; throw err; }
    });
  });
}
