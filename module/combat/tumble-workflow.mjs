/**
 * TUMBLE, the Foundry half (3.715.1). The rules are in tumble.mjs.
 *
 *   chooseTumbleEnemy     before the roll: which enemy, and past it or
 *                         through its space (+2 DC); it becomes the target
 *   armTumbleStride       after a passed check: the Stride the action
 *                         includes, free of AP, no reaction from that enemy
 *   tumbleFailureReactions after a failed one: reactions as if leaving the
 *                         starting square
 */
import {
  TUMBLE_THROUGH, parseTumbleChoice, tumbleCandidates, tumbleChoiceValue,
  tumbleDefaultChoice, tumbleLeg
} from "./tumble.mjs";

const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

/** The land Speed a Tumble's Stride moves with. */
export function tumbleLandSpeed(actor) {
  const v = actor?.system?.combat?.movement?.land;
  return Number(typeof v === "object" ? v?.total ?? v?.base : v) || 0;
}

/**
 * WHICH ENEMY (page 198: "against the enemy's Fortitude DC or Acrobatics DC").
 *
 * Asked before anything is spent. Offers each enemy your Stride can bring you
 * into the threatened area of, twice: past it, or through its space (+2 DC).
 * The choice becomes the user's target, so the DC, the card and anything that
 * reads the target afterwards (Inner Tempest's Pinnacle of Motion and
 * Tumbling Reversal) see the same creature.
 *
 * @param {Actor} actor
 * @param {{skip?: boolean}} [opts] skip: the roll dialog is being skipped
 *   (Shift-click); a targeted candidate is then taken, past it, unasked
 * @returns {Promise<{cancelled?: boolean, setup: {tokenId: string, through: string, name: string}|null}>}
 *   `setup: null` leaves the Tumble as it was (no token on the scene, or no
 *   enemy in range): the target, if any, sets the DC
 */
export async function chooseTumbleEnemy(actor, { skip = false } = {}) {
  const { activeToken, distanceBetween } = await import("./geometry.mjs");
  const mine = activeToken(actor);
  if (!mine || !globalThis.canvas?.tokens) return { setup: null };
  const { keepByDisposition } = await import("../magic/spell-template.mjs");
  const { opportunityReachOf } = await import("./opportunity.mjs");
  const myDisposition = Number(mine.document?.disposition ?? 0);
  const enemies = (canvas.tokens.placeables ?? []).filter((t) => t?.actor && t.id !== mine.id
    && keepByDisposition(Number(t.document?.disposition ?? 0), myDisposition, "enemies")
    && (game.user?.isGM || !t.document?.hidden));
  const speed = tumbleLandSpeed(actor);
  const candidates = tumbleCandidates(
    enemies.map((t) => ({ id: t.id, token: t, feet: distanceBetween(mine, t), reach: opportunityReachOf(t) })), speed);
  if (!candidates.length) return { setup: null };

  const targetedId = game.user?.targets?.first?.()?.id ?? null;
  let picked = null;
  if (skip && targetedId && candidates.some((c) => c.id === targetedId)) {
    picked = { tokenId: targetedId, through: TUMBLE_THROUGH.area };
  } else {
    const options = candidates.flatMap((c) => [
      [tumbleChoiceValue(c.id, TUMBLE_THROUGH.area), `${esc(c.token.name)} (${c.feet} ft): past it, through its threatened area`],
      [tumbleChoiceValue(c.id, TUMBLE_THROUGH.space), `${esc(c.token.name)} (${c.feet} ft): through its space (+2 DC)`]
    ]);
    const selected = tumbleDefaultChoice(candidates, targetedId);
    const opts = options.map(([v, l]) => `<option value="${v}"${v === selected ? " selected" : ""}>${l}</option>`).join("");
    const { DialogV2 } = foundry.applications.api;
    const result = await DialogV2.wait({
      window: { title: "Tumble", icon: "fa-solid fa-person-falling" },
      classes: ["trg-prime"],
      position: { width: 460 },
      content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked">`
        + `<label>Tumble past which enemy? Acrobatics against its Fortitude DC or Acrobatics DC, whichever is higher (your Stride: ${speed} ft).</label>`
        + `<select name="choice">${opts}</select></div></div>`,
      buttons: [
        {
          action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true,
          callback: (event, button) => new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")).object
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (!result || result === "cancel") return { cancelled: true, setup: null };
    picked = parseTumbleChoice(result.choice);
    if (!picked) return { cancelled: true, setup: null };
  }
  const token = candidates.find((c) => c.id === picked.tokenId)?.token ?? null;
  if (!token) return { setup: null };
  token.setTarget?.(true, { user: game.user, releaseOthers: true });
  return { setup: { tokenId: token.id, through: picked.through, name: token.name } };
}

/**
 * THE STRIDE THE ACTION INCLUDES, armed after a passed check, in combat. The
 * Tumble's AP is already spent, so the leg costs none; it must be the next
 * action (as Agile Display's Step), and the Tumbled enemy gets no reaction.
 */
export async function armTumbleStride(actor, setup) {
  if (!game.combat?.started) return false;
  const { armCompoundLeg } = await import("./compound-action-workflow.mjs");
  await armCompoundLeg(actor, {
    ...tumbleLeg({ speedFeet: tumbleLandSpeed(actor), exemptTokenId: setup?.tokenId ?? null }),
    apAtArm: Number(actor.system?.resources?.ap?.value ?? 0)
  }, "Tumble");
  return true;
}

/**
 * A FAILURE'S REACTIONS: "Your movement ends, and you trigger reactions as if
 * you had moved out of the square you started in." The enemies whose reach
 * covers that square are offered their Attack of Opportunity. Combat only.
 */
export async function tumbleFailureReactions(actor) {
  if (!game.combat?.started) return;
  const { detectDepartureAoO } = await import("./opportunity.mjs");
  await detectDepartureAoO(actor);
}
