/**
 * Charge — the Foundry side of charge.mjs.
 *
 * Charge ARMS the next move rather than resolving one itself, which is
 * the shape this project already uses for Step, Crawl and Reposition:
 * "rather than spending AP for a card that describes moving, these arm
 * the next token move so the movement itself carries the action's rules
 * and its cost." Charge is the same idea with a target on the end of it.
 */
import { feetFromPointToToken } from "./geometry.mjs";
import { reachOf } from "./opportunity.mjs";
import { chargeStrikeAvailable, chargeStrikeModifier, validateChargeMove } from "./charge.mjs";

const SYSTEM_ID = "trg-prime";

/** Where the target and the starting distance are remembered mid-charge. */
export const CHARGE_FLAG = "chargeTarget";

/**
 * Remember what is being charged, and how far away it was when the
 * character set off — "directly towards your target" can only be judged
 * against where you started.
 *
 * @param {Actor} actor
 * @param {TokenDocument} chargerToken
 * @param {TokenDocument} targetToken
 */
export async function armCharge(actor, chargerToken, targetToken) {
  const startDistance = measure(chargerToken, targetToken);
  await actor.setFlag(SYSTEM_ID, CHARGE_FLAG, {
    tokenId: targetToken?.id ?? null,
    sceneId: targetToken?.parent?.id ?? null,
    name: targetToken?.name ?? "your target",
    startDistance
  });
  return startDistance;
}

export function chargeState(actor) {
  return actor?.getFlag?.(SYSTEM_ID, CHARGE_FLAG) ?? null;
}

export async function clearCharge(actor) {
  if (actor?.getFlag?.(SYSTEM_ID, CHARGE_FLAG) !== undefined) {
    await actor.unsetFlag(SYSTEM_ID, CHARGE_FLAG);
  }
}

/**
 * The centre of a token's footprint, given the top-left corner a
 * movement path reports.
 *
 * Foundry's coordinates — both a token's own `x`/`y` and a movement's
 * `destination` — are TOP-LEFT CORNERS, while `feetFromPointToToken`
 * measures to the centre of each square its subject occupies. Handing it
 * a corner therefore measures from half a square away in each axis: on
 * the live world that turned two adjacent tokens into "8 ft apart" and
 * a charge that plainly landed refused to offer its Strike.
 */
export function centreOf(point, token) {
  const grid = canvas?.grid?.size ?? 100;
  const doc = token?.document ?? token;
  const width = (Number(doc?.width) || 1) * grid;
  const height = (Number(doc?.height) || 1) * grid;
  return { x: (Number(point?.x) || 0) + width / 2, y: (Number(point?.y) || 0) + height / 2 };
}

/**
 * Feet from where the charger is (or will be) to the target.
 *
 * ONE RULER FOR BOTH ENDS. The start and end distances are compared to
 * each other to decide whether the charge moved TOWARDS anything, so
 * measuring one token-to-token and the other point-to-token would be
 * comparing two different rulers — which is exactly what 3.336.0 did.
 */
function measureFrom(point, chargerToken, targetToken) {
  try {
    const target = targetToken?.object ?? targetToken;
    if (!point || !target) return null;
    const feet = feetFromPointToToken(centreOf(point, chargerToken), target);
    return Number.isFinite(feet) ? feet : null;
  } catch (_e) {
    return null;
  }
}

/** Feet between two token documents, measured the same way. */
function measure(a, b) {
  const doc = a?.document ?? a;
  if (!doc) return null;
  return measureFrom({ x: doc.x, y: doc.y }, a, b);
}

/** The target token of a charge in progress, if it is still findable. */
export function chargeTargetToken(actor) {
  const state = chargeState(actor);
  if (!state?.tokenId) return null;
  const scene = state.sceneId ? game.scenes.get(state.sceneId) : canvas.scene;
  return scene?.tokens?.get(state.tokenId) ?? null;
}

/**
 * How far the target will be once this move lands.
 *
 * MEASURED FROM THE DESTINATION, NOT FROM THE TOKEN. `preMoveToken`
 * fires before anything has moved, so asking the token where it is
 * would answer "where it started" — and every charge would then look
 * like it had ended no closer than it began. This is the same class of
 * mistake as the stale `token.x` read that made Take Cover-on-move look
 * broken during 3.334.1's testing.
 *
 * @param {object} movement
 * @param {TokenDocument} chargerToken The token whose footprint is moving.
 * @param {TokenDocument} targetToken
 * @returns {number|null}
 */
export function chargeEndDistance(movement, chargerToken, targetToken) {
  return measureFrom(movement?.destination, chargerToken, targetToken);
}

/**
 * Whether a proposed move is a legal Charge, measured against the target
 * this charge was armed on.
 *
 * @param {Actor} actor
 * @param {object} args
 * @param {number} args.moveCost
 * @param {number} args.speed
 * @param {number|null} [args.endDistance]
 * @returns {{allowed: boolean, reason: string, limit: number}}
 */
export function validateCharge(actor, { moveCost, speed, endDistance = null } = {}) {
  const state = chargeState(actor);
  return validateChargeMove({
    moveCost,
    speed,
    startDistance: state?.startDistance ?? null,
    endDistance
  });
}

/**
 * The melee weapons a Charge could finish with.
 *
 * "you may make a MELEE Strike action against them" — so a bow is not on
 * this list however it is held.
 */
export function chargeWeapons(actor) {
  return Array.from(actor?.items ?? []).filter(
    (item) =>
      item.type === "weapon"
      && item.system?.equipped
      && item.system?.attackMode !== "missile"
  );
}

/** Which weapon finishes the charge? Skipped when there is only one. */
async function promptChargeWeapon(weapons) {
  if (weapons.length === 1) return weapons[0];
  const { DialogV2 } = foundry.applications.api;
  const options = weapons
    .map((w) => `<option value="${w.id}">${w.name}</option>`)
    .join("");
  const result = await DialogV2.wait({
    window: { title: "Charge — finish with which weapon?", icon: "fa-solid fa-person-running" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group">
      <label for="trg-charge-weapon">Melee weapon</label>
      <select id="trg-charge-weapon" name="weapon" style="width:100%">${options}</select>
    </div><p class="hint" style="margin:6px 0 0">The Strike carries a +4 circumstance bonus and costs no further AP — Charge's 3 AP already paid for it.</p></div>`,
    buttons: [
      {
        action: "strike",
        label: "Strike",
        icon: "fa-solid fa-hand-fist",
        default: true,
        callback: (event, button, dialog) =>
          (dialog?.element ?? button?.form)?.querySelector?.('[name="weapon"]')?.value ?? null
      },
      { action: "cancel", label: "Hold the blow", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return weapons.find((w) => w.id === result) ?? null;
}

/**
 * After the charge move: if the target is in reach, offer the Strike.
 *
 * Detached and best-effort, like the Attack of Opportunity detection it
 * sits beside — a charge that lands should never be undone because the
 * follow-up could not be offered.
 *
 * @param {Actor} actor
 * @param {TokenDocument} chargerToken
 */
/**
 * Wait until the token has actually arrived where the move was going.
 *
 * WHY THIS EXISTS. The Strike is launched off the back of
 * `preMoveToken`, which fires BEFORE anything has moved — and the attack
 * workflow measures the distance to the target itself, from the token's
 * own position. Offered immediately, that measurement answers "where the
 * charge began": on the live world a charge that landed adjacent was
 * refused with "AUDIT Quarry is 50 ft away — beyond Longsword's reach".
 *
 * POLLED RATHER THAN HOOKED, deliberately. Foundry has several movement
 * lifecycle hooks and this session has already been caught twice
 * assuming the shape of an engine API; "has the document reached the
 * coordinates the path was heading for" is a question about state rather
 * than about a callback's name, and it cannot go stale.
 *
 * @param {TokenDocument} tokenDocument
 * @param {{x:number, y:number}|null} destination
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} whether it arrived before the deadline.
 */
export async function awaitArrival(tokenDocument, destination, timeoutMs = 4000) {
  if (!tokenDocument || !destination) return false;
  const wanted = { x: Number(destination.x) || 0, y: Number(destination.y) || 0 };
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() < deadline) {
    if (tokenDocument.x === wanted.x && tokenDocument.y === wanted.y) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

export async function resolveChargeStrike(actor, chargerToken, { endDistance = null, destination = null } = {}) {
  // The move has to land before the Strike is offered — see awaitArrival.
  await awaitArrival(chargerToken, destination);

  const targetToken = chargeTargetToken(actor);
  const state = chargeState(actor);
  await clearCharge(actor);
  if (!targetToken) return null;

  // THE DISTANCE IS PASSED IN, not measured here. This runs off the back
  // of `preMoveToken`, where the token has not moved yet and may still be
  // animating — measuring from it would answer "where the charge began".
  // The hook computed the destination's distance already; it is the only
  // honest number available at this moment.
  const reach = reachOf(chargerToken?.object ?? chargerToken);
  if (!chargeStrikeAvailable(endDistance, reach)) {
    ui.notifications.info(
      `Charge: ${state?.name ?? "your target"} is ${endDistance ?? "?"} ft away, beyond your ${reach} ft reach — no Strike.`
    );
    return null;
  }

  const weapons = chargeWeapons(actor);
  if (!weapons.length) {
    ui.notifications.warn("Charge: no equipped melee weapon to finish with.");
    return null;
  }
  const weapon = await promptChargeWeapon(weapons);
  if (!weapon) return null;

  const { rollWeaponAttack } = await import("./attack-workflow.mjs");
  return rollWeaponAttack(actor, weapon, {
    // Charge's own 3 AP bought the Strike; charging again charges twice.
    apPaid: true,
    // The target was chosen when the Charge was armed and has just been
    // moved towards — asking for it again would be asking twice.
    skipTargetPrompt: true,
    extraModifiers: [chargeStrikeModifier()]
  });
}
