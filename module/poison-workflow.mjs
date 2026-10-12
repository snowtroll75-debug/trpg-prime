/**
 * Applying a poison, wired up (Chapter 6, page 183).
 *
 * NEW at 3.578.0 (the block-18 audit's D7; Graham's rulings R1–R3, 20
 * September 2026). The rules are in poisons.mjs; the affliction they
 * become is run by combat/affliction-workflow.mjs. This is the order a
 * dose is used in, and every refusal comes before anything is spent:
 *
 *   1  the printed activation — its AP, or a refusal if it cannot fit
 *      inside an encounter
 *   2  where it goes: an INJURY poison coats one of your weapons (two
 *      free hands, R3); any other poison reaches the ONE creature you
 *      target (one free hand, p.183)
 *   3  the AP, the dose, and the card
 *   4  for a poison applied to a creature, its exposure save at once
 *
 * A coated weapon carries the poison as a flag, and `rollWeaponAttack`
 * hands it to `deliverWeaponPoison` on the weapon's next hit (R2: the
 * first hit spends the dose; a coat nothing was hit with dries after a
 * minute).
 */

import {
  POISON_COAT_FLAG, afflictionItemData, applyHandsCheck, coatActive, coatHandsCheck, poisonAfflictionOf
} from "./poisons.mjs";
import { activationCost } from "./elixirs.mjs";
import { consumeOneUse } from "./consumable-use.mjs";

const SYSTEM_ID = "trg-prime";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${esc(actor.name)}</span><h3>${esc(title)}</h3></div></header>${lines.join("")}</div>`
  });
}

/** Which of the actor's weapons to coat — equipped ones first. */
async function chooseWeapon(actor, item) {
  const weapons = Array.from(actor.items ?? []).filter((i) => i.type === "weapon")
    .sort((a, b) => Number(Boolean(b.system?.equipped)) - Number(Boolean(a.system?.equipped)));
  if (!weapons.length) return null;
  if (weapons.length === 1) return weapons[0];
  const { DialogV2 } = foundry.applications.api;
  const rows = weapons.map((w, i) => `<label style="display:flex;gap:8px;align-items:center;padding:2px 0">`
    + `<input type="radio" name="weapon" value="${w.id}"${i === 0 ? " checked" : ""}>`
    + `<span>${esc(w.name)}${w.system?.equipped ? "" : " <em>(not equipped)</em>"}</span></label>`).join("");
  const id = await DialogV2.wait({
    window: { title: `${item.name} — Coat a Weapon`, icon: "fa-solid fa-flask" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog"><p>Which weapon does ${esc(item.name)} coat?</p>${rows}</div>`,
    buttons: [
      { action: "coat", label: "Coat", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => button.form?.querySelector?.('input[name="weapon"]:checked')?.value ?? "" },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!id || id === "cancel") return null;
  return actor.items.get(id) ?? null;
}

/** One dose spent: the stack or the item, as every consumable is. */
async function spendDose(item) {
  const after = consumeOneUse({
    uses: item.system?.uses?.value,
    max: item.system?.uses?.max,
    quantity: item.system?.quantity
  });
  if (after.destroy) await item.delete();
  else await item.update({ "system.quantity": after.quantity, "system.uses.value": after.uses });
  return after;
}

function remainingLine(item, after) {
  return after.destroy
    ? line(`The last dose is gone — ${esc(item.name)} is removed from the sheet.`)
    : line(`${after.quantity} remaining.`);
}

/**
 * Use a poison: coat a weapon with it, or apply it to the targeted creature.
 *
 * @param {Actor} actor
 * @param {Item} item the poison
 * @returns {Promise<object|null>}
 */
export async function usePoison(actor, item) {
  const poison = poisonAfflictionOf(item);
  const data = afflictionItemData(item);
  if (!poison || !data) return null;
  const size = actor.system?.identity?.size ?? "medium";

  // 1. THE PRINTED ACTIVATION.
  const inCombat = Boolean(game.combat?.started);
  const cost = activationCost(item.system?.activation, { inCombat });
  if (!cost.allowed) {
    ui.notifications.warn(`${item.name} ${cost.reason}.`);
    return null;
  }

  // 2a. AN INJURY POISON COATS A WEAPON.
  if (poison.delivery === "injury") {
    const weapon = await chooseWeapon(actor, item);
    if (!weapon) {
      if (!Array.from(actor.items ?? []).some((i) => i.type === "weapon")) {
        ui.notifications.warn(`${item.name} is an injury poison, and ${actor.name} has no weapon to coat.`);
      }
      return null;
    }
    // R3: "If you are applying a poison to a weapon or item, this requires
    // two hands" — the rule over the usage line, which is the hands to
    // hold the vial.
    const hands = coatHandsCheck(actor.items, weapon, item, size);
    if (!hands.ok) {
      ui.notifications.warn(`Coating a weapon takes two hands (p.183); ${actor.name} has ${hands.free} free.`);
      return null;
    }
    if (cost.ap > 0) {
      const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
      await spendActionPoints(actor, cost.ap, item.name);
    }
    const previous = weapon.getFlag?.(SYSTEM_ID, POISON_COAT_FLAG) ?? null;
    await weapon.setFlag(SYSTEM_ID, POISON_COAT_FLAG, {
      name: item.name,
      data,
      appliedAt: Number(game.time?.worldTime ?? 0),
      combatId: game.combat?.started ? game.combat.id : null,
      round: game.combat?.started ? Number(game.combat.round ?? 0) : null
    });
    const after = await spendDose(item);
    const lines = [
      line(`<strong>${esc(actor.name)}</strong> coats <strong>${esc(weapon.name)}</strong> with ${esc(item.name)}.`),
      line("Its next hit delivers the poison and spends the dose; with nothing hit, it dries after a minute.")
    ];
    if (cost.ap) lines.push(line(`<em>${esc(item.system?.activation ?? "")} — ${cost.ap} AP.</em>`));
    if (previous?.name) lines.push(line(`<em>The ${esc(previous.name)} already on it is wiped away.</em>`));
    lines.push(remainingLine(item, after));
    await postCard(actor, `${item.name} — Coat`, lines);
    return { used: true, coated: weapon.id };
  }

  // 2b. ANY OTHER POISON REACHES ONE CREATURE.
  const targets = Array.from(game.user?.targets ?? []);
  if (targets.length !== 1 || !targets[0]?.actor) {
    ui.notifications.warn(`Target the one creature ${item.name} is given to.`);
    return null;
  }
  const hands = applyHandsCheck(actor.items, item, size);
  if (!hands.ok) {
    ui.notifications.warn(`Applying a poison takes at least one free hand (p.183); ${actor.name} has none.`);
    return null;
  }
  const target = targets[0].actor;

  // 3. THE AP, THE DOSE, THE CARD.
  if (cost.ap > 0) {
    const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
    await spendActionPoints(actor, cost.ap, item.name);
  }
  const after = await spendDose(item);
  const how = { ingested: "is given", contact: "is exposed to", inhaled: "breathes in" }[poison.delivery] ?? "is given";
  const lines = [line(`<strong>${esc(target.name)}</strong> ${how} ${esc(item.name)}.`)];
  if (cost.ap) lines.push(line(`<em>${esc(item.system?.activation ?? "")} — ${cost.ap} AP.</em>`));
  if (poison.incubation && !/instant/i.test(poison.incubation)) {
    lines.push(line(`<em>Incubation ${esc(poison.incubation)} — the save is rolled now; the table decides when its effects arrive.</em>`));
  }
  lines.push(remainingLine(item, after));
  await postCard(actor, `${item.name} — ${poison.delivery[0].toUpperCase()}${poison.delivery.slice(1)}`, lines);

  // 4. THE EXPOSURE SAVE.
  const { exposeToAffliction } = await import("./combat/affliction-workflow.mjs");
  const result = await exposeToAffliction(target, data);
  return { used: true, target: target.id, result };
}

/**
 * A coated weapon hits (R2). The coat comes off whatever happens — the
 * first hit spends the dose — and a coat older than a minute has dried
 * and delivers nothing.
 *
 * @param {Actor} attacker
 * @param {Item} weapon
 * @param {Actor} targetActor
 * @returns {Promise<object|null>}
 */
export async function deliverWeaponPoison(attacker, weapon, targetActor) {
  const coat = weapon?.getFlag?.(SYSTEM_ID, POISON_COAT_FLAG) ?? null;
  if (!coat || !targetActor) return null;
  await weapon.unsetFlag(SYSTEM_ID, POISON_COAT_FLAG);
  const wet = coatActive(coat, {
    worldTime: Number(game.time?.worldTime ?? 0),
    combatId: game.combat?.id ?? null,
    round: game.combat ? Number(game.combat.round ?? 0) : null
  });
  if (!wet) {
    await postCard(attacker, `${coat.name ?? "Poison"} — Dried`, [
      line(`The ${esc(coat.name ?? "poison")} on ${esc(weapon.name)} had dried — nothing is delivered.`)
    ]);
    return { delivered: false, dried: true };
  }
  await postCard(attacker, `${coat.name ?? "Poison"} — Delivered`, [
    line(`<strong>${esc(weapon.name)}</strong> delivers its ${esc(coat.name ?? "poison")} to <strong>${esc(targetActor.name)}</strong>.`)
  ]);
  const { exposeToAffliction } = await import("./combat/affliction-workflow.mjs");
  const result = await exposeToAffliction(targetActor, coat.data);
  return { delivered: true, result };
}
