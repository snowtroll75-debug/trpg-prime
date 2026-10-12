/**
 * Swift Pursuit (Ranger, 6th; 13th) — the automatic half.
 *
 * "When your hunted prey moves away from you, you may Step 5 feet as a
 * reaction. At 13th level, you may instead Stride up to half your Speed
 * as a reaction, but this movement must move you closer to your hunted
 * prey."
 *
 * Watches the same token movement the Attack of Opportunity detection
 * watches (movement-workflow calls both, side by side) — but with the
 * OPPOSITE trigger shape: an AoO fires on any provoking move leaving a
 * reach; Swift Pursuit fires only when the mover IS a Ranger's
 * designated prey and the move takes it FARTHER from that Ranger. A
 * Step is not a provoking move but absolutely can be a move away, so
 * this detection runs regardless of whether the move provokes.
 *
 * The offer is a chat card with a button for the Ranger (mirroring the
 * AoO card, but visible to the Ranger's owner — it is their reaction to
 * claim, not the GM's). The button spends the reaction and prints the
 * movement granted; the movement itself is made by hand, the same
 * guidance-not-geometry treatment Press the Advantage's free Step
 * already gets — including the 13th-level "must move you closer"
 * clause, which stays printed on the card rather than enforced.
 *
 * Pure trigger arithmetic lives in ranger.mjs (swiftPursuitOffer);
 * this file is canvas geometry and card plumbing.
 */

import { huntedPrey, swiftPursuitMode, swiftPursuitOffer } from "../ranger.mjs";
import { hasClassAbility } from "../crusader.mjs";
import { feetFromPointToToken, pathSquareCentres } from "./opportunity.mjs";
import { spendReaction } from "./action-points-workflow.mjs";

const SYSTEM_ID = "trg-prime";
const PURSUIT_FLAG = "swiftPursuitCard";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/** Rangers on the scene whose designated prey is this moving token and
 * whose distance to it increased over the move. */
function pursuitReactors(moverToken, movement) {
  const centres = pathSquareCentres(moverToken, movement);
  if (centres.length < 2) return [];
  const reactors = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    const ranger = token?.actor;
    if (!ranger || token.id === moverToken.id) continue;
    const prey = huntedPrey(ranger);
    if (!prey) continue;
    const preyMatches = prey.tokenId
      ? prey.tokenId === moverToken.id
      : Boolean(prey.actorId && prey.actorId === moverToken.actor?.id);
    const mode = swiftPursuitOffer({
      hasAbility: hasClassAbility(ranger, "Swift Pursuit"),
      level: Number(ranger.system?.identity?.level ?? 0),
      preyMatches,
      distanceBefore: feetFromPointToToken(centres[0], token),
      distanceAfter: feetFromPointToToken(centres.at(-1), token),
      reactions: Number(ranger.system?.resources?.reactions?.value ?? 0)
    });
    if (mode) reactors.push({ ranger, token, mode });
  }
  return reactors;
}

/** Post the offer card — one button per pursuing Ranger. */
async function offerSwiftPursuit(moverToken, reactors) {
  if (!reactors.length) return null;
  const preyName = moverToken?.actor?.name ?? moverToken?.name ?? "Your prey";
  const buttons = reactors
    .map(
      ({ ranger }) =>
        `<div style="margin:3px 0"><button type="button" class="trg-pursuit-button" data-action="takeSwiftPursuit" data-reactor="${ranger.id}">${ranger.name} — Swift Pursuit (reaction)</button></div>`
    )
    .join("");
  return ChatMessage.create({
    speaker: { alias: "Swift Pursuit" },
    content:
      `<div class="trg-prime trg-check-card">` +
      line(`<strong>${preyName}</strong> moves away from its hunter${reactors.length === 1 ? "" : "s"}.`) +
      buttons +
      `</div>`,
    flags: {
      [SYSTEM_ID]: {
        [PURSUIT_FLAG]: {
          preyName,
          reactors: reactors.map(({ ranger, mode }) => ({
            actorId: ranger.id,
            name: ranger.name,
            mode
          })),
          used: []
        }
      }
    }
  });
}

/** The button: re-check the reaction, spend it, print the movement. */
async function executeSwiftPursuit(message, reactorActorId) {
  const card = message.getFlag(SYSTEM_ID, PURSUIT_FLAG);
  const entry = card?.reactors?.find((r) => r.actorId === reactorActorId);
  const ranger = game.actors.get(reactorActorId);
  if (!entry || !ranger) return;
  if ((card.used ?? []).includes(reactorActorId)) return;
  if (Number(ranger.system?.resources?.reactions?.value ?? 0) <= 0) {
    ui.notifications.warn(`Swift Pursuit: ${ranger.name} has no reaction left this round.`);
    return;
  }
  // The mode is re-derived rather than trusted from the card — a level
  // edit between the prompt and the click should not stale the grant.
  const mode = swiftPursuitMode(Number(ranger.system?.identity?.level ?? 0)) ?? entry.mode;
  await spendReaction(ranger, "Swift Pursuit");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: ranger }),
    content:
      `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">Swift Pursuit</h3>` +
      line(`<strong>${card.preyName}</strong> moved away — reaction spent.`) +
      line(
        mode === "stride"
          ? "<strong>Stride</strong> up to half your Speed. The movement must bring you closer to your prey — move the token by hand."
          : "<strong>Step 5 feet</strong> — move the token by hand."
      ) +
      `</div>`
  });
  await message.setFlag(SYSTEM_ID, PURSUIT_FLAG, {
    ...card,
    used: [...(card.used ?? []), reactorActorId]
  });
}

/**
 * Detection entry point — called from the movement workflow for EVERY
 * permitted move (provoking or not), beside the AoO detection. Wrapped
 * defensively for the same reason: never disturb the move itself.
 */
export function detectSwiftPursuit(tokenDocument, movement) {
  try {
    if (!game.combat?.started) return;
    const moverToken = tokenDocument?.object;
    if (!moverToken) return;
    const reactors = pursuitReactors(moverToken, movement);
    if (reactors.length) {
      offerSwiftPursuit(moverToken, reactors).catch(() => {});
    }
  } catch (_e) {
    /* detection is best-effort */
  }
}

const BOUND = Symbol("trgPursuitBound");

/** Registers the pursuit card button handler. Called once, from init. */
export function registerSwiftPursuitHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.getFlag?.(SYSTEM_ID, PURSUIT_FLAG);
    if (!card) return;
    const used = new Set(card.used ?? []);
    html.querySelectorAll?.('[data-action="takeSwiftPursuit"]').forEach((btn) => {
      const actorId = btn.dataset?.reactor;
      if (used.has(actorId)) {
        btn.disabled = true;
        btn.textContent = btn.textContent.replace(/—.*/, "— reacted");
        return;
      }
      // The Ranger's own reaction: their owner (or the GM) claims it.
      const ranger = game.actors.get(actorId);
      if (!ranger?.isOwner) {
        btn.style.display = "none";
        return;
      }
      if (btn[BOUND]) return;
      btn[BOUND] = true;
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        btn.disabled = true;
        try {
          await executeSwiftPursuit(message, actorId);
        } finally {
          btn.disabled = false;
        }
      });
    });
  });
}
