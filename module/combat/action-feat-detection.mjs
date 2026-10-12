/**
 * The one action feat that is triggered rather than pressed.
 *
 * Knife Flurry: "After a successful attack with a knife weapon, you may
 * make a Feint (Deception) check against your opponent as a 0 AP
 * action."
 *
 * WHY IT IS A CARD. Graham's ruling, 21 August 2026. Everything else in
 * this batch is something you decide to do on your turn and press a
 * button for; this one only exists in the moment after your own knife
 * lands, and a feat that must be remembered at exactly that moment is a
 * feat that goes unused.
 *
 * WHY IT IS ITS OWN CARD RATHER THAN A ROW ON THE REACTION ONE. The
 * first attempt handed it to `offerReactionFeats`, which builds its rows
 * from REACTION_FEATS — a table that deliberately holds exactly the
 * thirteen reaction feats and asserts as much in its harness. Knife
 * Flurry is not one of them: it costs no reaction, and its only price is
 * that the Feint carries the attack trait and so advances the multiple
 * attack penalty. Bending that table to fit would have cost more than
 * the forty lines below.
 *
 * The SHAPE is still borrowed — whispered card, one button, a flag
 * recording that it has been taken, re-checked on press, and a BOUND
 * symbol so a re-render does not stack listeners.
 */

import { featStateFor, runKnifeFlurry } from "./action-feats-workflow.mjs";
import { actorHandle, resolveActorHandle } from "../actor-handle.mjs";

const SYSTEM_ID = "trg-prime";
const CARD_FLAG = "knifeFlurryCard";
const BOUND = Symbol("trgKnifeFlurryBound");

const esc = (text) => String(text ?? "").replace(
  /[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const hasKnifeFlurry = (actor) => Array.from(actor?.items ?? []).some(
  (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "knife flurry"
);

/**
 * Offer Knife Flurry, if this actor has it.
 *
 * SILENT WITHOUT THE FEAT — that is not a held-back offer, it is simply
 * not this character's feat, and a card on every hit in the game would
 * drown the ones that matter. But a Rogue who HAS it and has sheathed
 * the knife is told why, which is the anti-silence rule the reaction
 * feats follow.
 */
export async function offerKnifeFlurry(actor, attackerToken, context = {}) {
  try {
    if (!hasKnifeFlurry(actor)) return null;
    const state = featStateFor(actor, "Knife Flurry");
    const whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);

    if (!state.usable) {
      return ChatMessage.create({
        whisper,
        content: `<div class="trg-prime trg-check-card">`
          + `<header class="check-header"><div class="check-heading"><h3>Knife Flurry</h3></div></header>`
          + `<p style="margin:2px 0"><em>${esc(actor.name)} — ${esc(state.reason)}.</em></p></div>`
      });
    }

    return ChatMessage.create({
      whisper,
      content: `<div class="trg-prime trg-check-card">`
        + `<header class="check-header"><div class="check-heading"><h3>Knife Flurry</h3></div></header>`
        + `<p style="margin:2px 0"><strong>${esc(actor.name)}</strong>'s knife lands — a feint may follow.</p>`
        + `<div style="margin:3px 0"><button type="button" data-action="takeKnifeFlurry" data-reactor="${actor.id}">`
        + `${esc(actor.name)} — Feint (0 AP)</button>`
        + `<div style="font-size:0.9em;opacity:0.8">Free, but it carries the attack trait — your multiple attack penalty applies and then climbs.</div></div>`
        + `</div>`,
      // THE CREATURE, NOT ITS SHEET (3.612.1, H1 of the 3.612.0 drive).
      flags: { [SYSTEM_ID]: { [CARD_FLAG]: { actorId: actor.id, handle: actorHandle(actor, actor.token ?? null), context, used: false } } }
    });
  } catch (_error) {
    // Fire and forget, like everything hanging off a resolved attack: a
    // missing card must never disturb the swing that caused it.
    return null;
  }
}

/** Press it: re-check, run, and mark it taken. */
export async function executeKnifeFlurry(message) {
  const card = message?.getFlag?.(SYSTEM_ID, CARD_FLAG);
  if (!card || card.used) return null;
  const actor = (await resolveActorHandle(card.handle)) ?? game.actors.get(card.actorId);
  if (!actor) return null;
  // RE-CHECKED ON PRESS. The card can sit in the log while the knife is
  // sheathed — the same reason the reaction cards re-check.
  const state = featStateFor(actor, "Knife Flurry");
  if (!state.usable) {
    ui.notifications.warn(`Knife Flurry: ${state.reason}.`);
    return null;
  }
  await runKnifeFlurry(actor);
  await message.setFlag(SYSTEM_ID, CARD_FLAG, { ...card, used: true });
  return true;
}

export function registerActionFeatHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.getFlag?.(SYSTEM_ID, CARD_FLAG);
    if (!card) return;
    html.querySelectorAll?.('[data-action="takeKnifeFlurry"]').forEach((btn) => {
      if (card.used) {
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
        try { await executeKnifeFlurry(message); } finally { btn.disabled = false; }
      });
    });
  });
}
