import { MAGAZINE_RELOAD_AP, SPIN_MAX_BONUS, applyReloadProgress, extractLoadValue, extractMagazine, hasQuickLoadTrait, hasSpinTrait, needsReloading, reloadApCost, spinDamageBonus, spinHeadroom } from "./reload.mjs";

import { generalAP } from "./restricted-ap.mjs";
import { reloadHandsCheck } from "../held-items.mjs";

const { DialogV2 } = foundry.applications.api;

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * Reload (Chapter 6, Load): spends what AP the actor actually has
 * this turn toward the weapon's Load cost — "may be carried over
 * rounds if necessary," so this deliberately never blocks on
 * insufficient AP the way a normal action would; it just spends what's
 * available and reports the remaining progress.
 *
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Promise<{loaded: boolean}|null>} null if the weapon has
 *   no Load trait at all, or reload isn't applicable right now.
 */
export async function reloadWeapon(actor, weapon) {
  const weaponData = weapon.system;
  // BOTH HANDS TO RELOAD (3.576.0): the Hand Crossbow "can be fired with
  // one hand" but "necessitates the use of both hands for reloading".
  // Refused before any AP is spent. See `reloadHandsCheck`.
  const hands = reloadHandsCheck(Array.from(actor.items ?? []), weapon, actor.system?.identity?.size ?? "medium");
  if (!hands.ok) {
    ui.notifications.warn(
      `${weapon.name} needs ${hands.needed} hands to reload, and only ${hands.free} ${hands.free === 1 ? "is" : "are"} free — put something down first.`
    );
    return null;
  }
  const magazineCap = extractMagazine(weaponData.traits);
  if (magazineCap > 0) {
    return reloadMagazine(actor, weapon, magazineCap);
  }
  // A WEAPON THAT NEEDS RELOADING IS NOT ONLY A "Load N" WEAPON (3.311.5).
  // A Short Bow ships with Quick Load and no printed Load value, so this
  // refused to reload it — which, once the fire gate started honouring
  // Quick Load too, would have left it fireable once and then stuck.
  // Worse, it means the whole Quick Load branch below has never been
  // reachable: every weapon carrying the trait was turned away here.
  if (!needsReloading(weaponData.traits)) {
    ui.notifications.warn(`${weapon.name} doesn't have the Load trait — nothing to reload.`);
    return null;
  }
  const hasQuickLoad = hasQuickLoadTrait(weaponData.traits);
  // Quick Load REPLACES the Load cost rather than reducing it
  // (`reloadApCost`), so a weapon carrying it need not print one. Its
  // second reload in a round costs 1 AP, and that 1 is the work the
  // progress accounting below measures against.
  const loadValue = extractLoadValue(weaponData.traits) || (hasQuickLoad ? 1 : 0);
  if (weaponData.loaded) {
    ui.notifications.info(`${weapon.name} is already loaded.`);
    return { loaded: true };
  }
  if (!game.combat?.started) {
    ui.notifications.warn("Reloading spends Action Points, which only apply during combat.");
    return null;
  }

  // Quick Reload (Class, Chapter 5): "reduce the AP cost to reload your
  // missile by one AP (min 0)" — the weapon's TOTAL Load cost drops by 1
  // for this actor (a Load 1 bow becomes a free reload).
  const quickReloadFeat = Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "quick reload"
  ) ? 1 : 0;
  const effectiveLoad = Math.max(0, loadValue - quickReloadFeat);
  if (effectiveLoad === 0) {
    await weapon.update({ "system.reloadProgress": 0, "system.loaded": true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${weapon.name}</strong> reloaded for free (Quick Reload).</p>`
    });
    return { loaded: true };
  }
  const { apCost, isFree } = reloadApCost(effectiveLoad, hasQuickLoad, Boolean(weaponData.usedQuickLoadThisRound));

  // A FREE ACTION RELOADS IT, it does not make free progress towards
  // reloading it. Quick Load is "reload this weapon as a free action once
  // per round"; run through the AP accounting below it would have spent 0
  // AP, advanced the progress bar by 0, and left the weapon empty for
  // ever. Nobody had hit that because the refusal above meant no Quick
  // Load weapon ever got this far.
  if (isFree) {
    await weapon.update({
      "system.reloadProgress": 0,
      "system.loaded": true,
      "system.usedQuickLoadThisRound": true
    });
    await postCard(actor, "Reload", [
      line(`<strong>${weapon.name}</strong> reloaded as a free action (Quick Load).`),
      line(`<strong>${weapon.name} is now loaded.</strong>`)
    ]);
    return { loaded: true };
  }

  const currentAP = Number(actor.system?.resources?.ap?.value ?? 0);
  const remainingNeeded = Math.max(0, effectiveLoad - Number(weaponData.reloadProgress ?? 0));
  const thisAttempt = Math.min(apCost, remainingNeeded);
  const apSpent = Math.min(thisAttempt, generalAP(actor));

  await actor.update({ "system.resources.ap.value": currentAP - apSpent });

  const result = applyReloadProgress(weaponData.reloadProgress ?? 0, apSpent, effectiveLoad);

  const updates = { "system.reloadProgress": result.progress, "system.loaded": result.complete };
  if (hasQuickLoad) {
    updates["system.usedQuickLoadThisRound"] = true;
  }
  await weapon.update(updates);

  const lines = [];
  if (apSpent < remainingNeeded) {
    lines.push(
      line(
        `<strong>${weapon.name}</strong> partially reloaded — ${apSpent} AP spent, ${remainingNeeded - apSpent} AP still needed. Progress carries over.`
      )
    );
  } else {
    lines.push(line(`<strong>${weapon.name}</strong> spent ${apSpent} AP to reload.`));
  }
  if (result.complete) {
    lines.push(line(`<strong>${weapon.name} is now loaded.</strong>`));
  }

  await postCard(actor, "Reload", lines);
  return { loaded: result.complete };
}

/**
 * Reload a repeating weapon's whole magazine (Repeater). It auto-loads each
 * shot from the magazine and only needs reloading once the magazine runs dry;
 * reloading refills it to capacity and costs a full round (MAGAZINE_RELOAD_AP),
 * carried over rounds like Load if the actor can't spend it all at once.
 *
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {number} capacity
 * @returns {Promise<{loaded: boolean}|null>}
 */
async function reloadMagazine(actor, weapon, capacity) {
  const weaponData = weapon.system;
  if (Number(weaponData.magazine ?? 0) >= capacity) {
    ui.notifications.info(`${weapon.name}'s magazine is already full (${capacity}).`);
    return { loaded: true };
  }
  if (!game.combat?.started) {
    ui.notifications.warn("Reloading a magazine spends Action Points, which only apply during combat.");
    return null;
  }

  const currentAP = Number(actor.system?.resources?.ap?.value ?? 0);
  const remainingNeeded = Math.max(0, MAGAZINE_RELOAD_AP - Number(weaponData.reloadProgress ?? 0));
  const apSpent = Math.min(remainingNeeded, generalAP(actor));
  if (apSpent > 0) {
    await actor.update({ "system.resources.ap.value": currentAP - apSpent });
  }

  const result = applyReloadProgress(weaponData.reloadProgress ?? 0, apSpent, MAGAZINE_RELOAD_AP);
  const updates = { "system.reloadProgress": result.progress };
  if (result.complete) updates["system.magazine"] = capacity;
  await weapon.update(updates);

  const lines = [];
  if (!result.complete) {
    lines.push(
      line(
        `<strong>${weapon.name}</strong> — magazine reload in progress: ${apSpent} AP spent, ${remainingNeeded - apSpent} of ${MAGAZINE_RELOAD_AP} AP (a full round) still needed. Progress carries over.`
      )
    );
  } else {
    lines.push(line(`<strong>${weapon.name}</strong>'s magazine is reloaded — <strong>${capacity}</strong> bolts ready.`));
  }
  await postCard(actor, "Reload Magazine", lines);
  return { loaded: result.complete };
}

/**
 * Reset Quick Load's per-round free-reload availability at the start
 * of each of the actor's turns — called from TRGCombat._onStartTurn
 * alongside the other per-turn resets already there.
 */
export async function resetQuickLoadForTurn(actor) {
  const weapons = Array.from(actor.items ?? []).filter(
    (item) => item.type === "weapon" && item.system?.usedQuickLoadThisRound
  );
  for (const weapon of weapons) {
    await weapon.update({ "system.usedQuickLoadThisRound": false });
  }
}

/**
 * Spin (Chapter 6): "use a special spin action to increase base
 * damage." A separate action from firing itself — spends AP now,
 * building up a bonus that the next attack with this weapon consumes.
 * Only offered for weapons that actually have the Spin trait.
 *
 * @param {Actor} actor
 * @param {Item} weapon
 */
export async function spinWeapon(actor, weapon) {
  if (!hasSpinTrait(weapon.system?.traits)) {
    ui.notifications.warn(`${weapon.name} doesn't have the Spin trait.`);
    return null;
  }
  if (!game.combat?.started) {
    ui.notifications.warn("Spinning spends Action Points, which only apply during combat.");
    return null;
  }

  const currentAP = Number(actor.system?.resources?.ap?.value ?? 0);
  // AT MOST +2 ON ONE SHOT (3.575.0). See SPIN_MAX_BONUS.
  const already = Number(weapon.system?.spinBonus ?? 0);
  const headroom = spinHeadroom(already);
  if (!headroom) {
    ui.notifications.warn(`${weapon.name} is already spun to +${SPIN_MAX_BONUS} — the most one shot can carry. Fire it.`);
    return null;
  }
  const maxSpend = Math.min(generalAP(actor), headroom);
  const result = await DialogV2.wait({
    window: { title: `${weapon.name} — Spin`, icon: "fa-solid fa-compact-disc" },
    classes: ["trg-prime"],
    position: { width: 340 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label for="trg-spin-ap">AP to spend spinning (you have ${currentAP}; up to ${maxSpend} more)</label>
          <input id="trg-spin-ap" type="number" name="apSpent" min="0" max="${maxSpend}" value="0">
        </div>
        <p class="hint">Spin (Chapter 6): 1 AP adds +1 to this weapon's next base damage, 2 AP adds +2 — no more than +${SPIN_MAX_BONUS} on one shot. The next shot uses it up, hit or miss.</p>
      </div>`,
    buttons: [
      {
        action: "spin",
        label: "Spin",
        icon: "fa-solid fa-compact-disc",
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
  if (!result || result === "cancel") return null;

  const apSpent = Math.max(0, Math.min(maxSpend, Math.floor(Number(result.apSpent) || 0)));
  if (!apSpent) return null;

  await actor.update({ "system.resources.ap.value": currentAP - apSpent });

  const bonus = spinDamageBonus(true, apSpent);
  const newBonus = Math.min(SPIN_MAX_BONUS, already + bonus);
  await weapon.update({ "system.spinBonus": newBonus });

  await postCard(actor, "Spin", [
    line(`<strong>${weapon.name}</strong> spun for ${apSpent} AP — next attack's base damage is up by <strong>${newBonus}</strong> in total.`)
  ]);
  return { spinBonus: newBonus };
}
