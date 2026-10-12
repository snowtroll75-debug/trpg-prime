/**
 * Ammunition — the Foundry side: choosing which rounds to fire, and
 * spending them.
 *
 * Selection follows the same pattern the rest of this project already
 * uses for a choice the player has to make before a roll (Strike's
 * weapon picker, Versatile's damage type): prompt only when there is
 * genuinely something to choose, and never at all when there isn't.
 */
import {
  AMMUNITION_SPENT_FLAG, foundAmmunitionPenalty, recoveryPlan, roundsRemaining,
  usableAmmunition, weaponUsesAmmunition, withShotRecorded
} from "./ammunition.mjs";
import { isActingGM } from "../acting-gm.mjs";
import { actorHandle, resolveActorHandle } from "../actor-handle.mjs";

const SYSTEM_ID = "trg-prime";
const RECOVERY_FLAG = "ammunitionRecovery";
const FOUND = "__found";

/**
 * Which ammunition this shot uses.
 *
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {object} [options]
 * @param {boolean} [options.skipPrompt] Skip the picker and take the
 *   first compatible stack (held-modifier fast path).
 * @returns {Promise<{ammo: Item|null, cancelled: boolean, blocked: boolean,
 *   found: {penalty: number}|null}>}
 *   `blocked` when the weapon needs ammunition and the actor has none;
 *   `found` when the shot is a found rock (a sling, 3.576.0).
 */
export async function selectAmmunition(actor, weapon, { skipPrompt = false } = {}) {
  const none = { ammo: null, cancelled: false, blocked: false, found: null };
  if (!weaponUsesAmmunition(weapon?.system)) return none;

  const options = usableAmmunition(Array.from(actor.items ?? []), weapon.system);
  // A FOUND ROCK (3.576.0): "A sling can be used to throw found rocks at a
  // -2-attack bonus." Offered beside the real rounds, and taken without a
  // prompt when there are none — an empty pouch is exactly when it matters.
  const rockPenalty = foundAmmunitionPenalty(weapon.system);
  const found = rockPenalty === null ? null : { penalty: rockPenalty };
  if (!options.length) {
    return found ? { ...none, found } : { ...none, blocked: true };
  }
  if ((options.length === 1 && !found) || skipPrompt) {
    return { ...none, ammo: options[0] };
  }

  const { DialogV2 } = foundry.applications.api;
  const rows = options
    .map(
      (item, index) => `
        <div class="form-group">
          <label>
            <input type="radio" name="ammo" value="${item.id}" ${index === 0 ? "checked" : ""}>
            ${item.name} <span class="hint">(${roundsRemaining(item.system)} left)</span>
          </label>
        </div>`
    )
    .join("")
    + (found
      ? `
        <div class="form-group">
          <label>
            <input type="radio" name="ammo" value="${FOUND}">
            Found rock <span class="hint">(${found.penalty} to attack)</span>
          </label>
        </div>`
      : "");

  const result = await DialogV2.wait({
    window: { title: `${weapon.name} — Ammunition`, icon: "fa-solid fa-arrow-right-to-bracket" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
    buttons: [
      {
        action: "fire",
        label: "Fire",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return { ...none, cancelled: true };
  if (found && result.ammo === FOUND) return { ...none, found };

  const chosen = options.find((item) => item.id === result.ammo) ?? options[0];
  return { ...none, ammo: chosen };
}

/**
 * Spends one round.
 *
 * The stack is left in place at zero rather than deleted: an empty
 * quiver is a real thing a character carries and refills, and silently
 * removing an item from someone's inventory is worse than showing it
 * empty.
 *
 * @param {Item|null} ammo
 * @returns {Promise<number>} Rounds remaining after the shot.
 */
export async function consumeAmmunition(ammo) {
  if (!ammo) return 0;
  const remaining = roundsRemaining(ammo.system);
  if (remaining <= 0) return 0;
  const left = remaining - 1;
  await ammo.update({ "system.quantity": left });
  // COUNTED FOR RECOVERY (3.576.0) — see `recordAmmunitionSpent`.
  await recordAmmunitionSpent(ammo.parent, ammo);
  return left;
}

/**
 * Count one spent round (or thrown shuriken) toward this combat's recovery.
 *
 * ONLY WHILE A COMBAT RUNS. The rule is "at the end of the battle", and a
 * shot fired at a target on the practice range has no battle to end.
 * Swallows its own failure: a count that cannot be written must never
 * stop the shot that has already been fired.
 *
 * @param {Actor} actor the shooter
 * @param {Item} item the stack spent from
 * @param {{source?: object|null}} [options] a copy of the item, when this
 *   was the last one and the item is about to be removed
 */
export async function recordAmmunitionSpent(actor, item, { source = null } = {}) {
  try {
    const combatId = game.combat?.started ? game.combat.id : null;
    if (!actor?.setFlag || !combatId || !item?.id) return;
    const record = actor.getFlag(SYSTEM_ID, AMMUNITION_SPENT_FLAG) ?? null;
    const next = withShotRecorded(record, combatId, { id: item.id, name: item.name, source });
    await actor.setFlag(SYSTEM_ID, AMMUNITION_SPENT_FLAG, next);
  } catch (error) {
    console.warn("TRG Prime | Could not count spent ammunition for recovery", error);
  }
}

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/**
 * Posts the recovery card for each character that fired in a combat that
 * has just ended (3.576.0; Graham's R3). Characters only: an NPC's arrows
 * go wherever the GM says, as its javelins already do.
 */
async function offerRecovery(combat) {
  for (const actor of game.actors ?? []) {
    if (actor.type !== "character") continue;
    const record = actor.getFlag?.(SYSTEM_ID, AMMUNITION_SPENT_FLAG) ?? null;
    const plan = recoveryPlan(record, combat.id);
    if (!plan.length) {
      // NOTHING TO GIVE BACK — one arrow fired rounds down to none — but
      // the count for this combat is spent either way.
      if (record?.combatId === combat.id) await actor.unsetFlag(SYSTEM_ID, AMMUNITION_SPENT_FLAG);
      continue;
    }
    const rows = plan.map((row) =>
      line(`<strong>${row.name}</strong> — ${row.recover} of ${row.fired} spent`)).join("");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
        + `<span class="check-actor">${actor.name}</span><h3>Recover Ammunition</h3></div></header>`
        + line("At the end of the battle, half your expended ammunition (rounded down) can be recovered by taking a minute to search the battlefield.")
        + rows
        + `<button type="button" data-action="trgRecoverAmmunition">`
        + `<i class="fa-solid fa-arrows-rotate"></i> Recover</button></div>`,
      // A HANDLE, NOT A BARE ID (verify-actor-handle S3): the card names the
      // creature, and a later click finds that one.
      flags: { [SYSTEM_ID]: { [RECOVERY_FLAG]: { handle: actorHandle(actor), combatId: combat.id } } }
    });
  }
}

/** Puts the recoverable rounds back, and closes the count. */
async function recoverAmmunition(actor, combatId) {
  if (!actor) return;
  const plan = recoveryPlan(actor.getFlag(SYSTEM_ID, AMMUNITION_SPENT_FLAG) ?? null, combatId);
  const lines = [];
  for (const row of plan) {
    const item = actor.items.get(row.id);
    if (item) {
      await item.update({ "system.quantity": roundsRemaining(item.system) + row.recover });
    } else if (row.source) {
      // THE LAST ONE WAS THROWN AND THE ITEM WENT WITH IT (a shuriken);
      // it comes back as it was, holding what was found.
      const data = foundry.utils.deepClone(row.source);
      delete data._id;
      data.system = { ...(data.system ?? {}), quantity: row.recover, equipped: false };
      await actor.createEmbeddedDocuments("Item", [data]);
    } else {
      continue;
    }
    lines.push(line(`<strong>${row.name}</strong> — ${row.recover} recovered.`));
  }
  await actor.unsetFlag(SYSTEM_ID, AMMUNITION_SPENT_FLAG);
  if (lines.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
        + `<span class="check-actor">${actor.name}</span><h3>Ammunition Recovered</h3></div></header>`
        + line("A minute spent searching the battlefield.") + lines.join("") + `</div>`
    });
  }
}

const BOUND = Symbol("trgRecoveryBound");

/** Registers the end-of-combat offer and its button. Called once, from init. */
export function registerAmmunitionRecoveryHooks() {
  Hooks.on("deleteCombat", async (combat) => {
    // ONE POSTER: the acting GM, as for every GM-side automation.
    if (!isActingGM()) return;
    try {
      await offerRecovery(combat);
    } catch (error) {
      console.error("TRG Prime | Could not offer ammunition recovery", error);
    }
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.getFlag?.(SYSTEM_ID, RECOVERY_FLAG);
    if (!card) return;
    html.querySelectorAll?.('[data-action="trgRecoverAmmunition"]').forEach((btn) => {
      wireRecoveryButton(btn, card).catch(() => {});
    });
  });
}

/** The Recover button: its owner's to press, once. */
async function wireRecoveryButton(btn, card) {
  const actor = await resolveActorHandle(card.handle);
  const open = recoveryPlan(actor?.getFlag?.(SYSTEM_ID, AMMUNITION_SPENT_FLAG) ?? null, card.combatId).length > 0;
  if (!actor?.isOwner) {
    btn.style.display = "none";
    return;
  }
  if (!open) {
    btn.disabled = true;
    btn.textContent = "Recovered";
    return;
  }
  if (btn[BOUND]) return;
  btn[BOUND] = true;
  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    btn.disabled = true;
    await recoverAmmunition(actor, card.combatId);
    btn.textContent = "Recovered";
  });
}
