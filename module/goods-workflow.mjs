/**
 * THE GOODS — the Foundry side (3.576.0). The rules are in goods.mjs.
 *
 *   improvisedAttack  Chapter 6, Improvised Attacks (Graham's R5)
 *   useGoodsItem      Caltrops and Oil (Graham's R9); the Grappling
 *                     Hook's anchoring throw (block 17, R2; 3.577.0)
 *
 * The chat-card buttons caltrops leave behind are wired by
 * `registerGoodsHooks`, called once from the system's init.
 */

import {
  CALTROPS, OIL, OIL_PREPARED_FLAG, GOODS_USE_FLAG, GRAPPLING_HOOK,
  canImproviseWith, caltropsAfterEntry, grapplingHookOutcome, improvisedWeaponProfile,
  improvisesAsNamedWeapon, oilPrepared
} from "./goods.mjs";
import { BLIND_ROLL_MODE } from "./traits.mjs";
import { basicSavingThrow } from "./dice/resolution.mjs";
import { actorHandle, resolveActorHandle } from "./actor-handle.mjs";
import { TRGCheck } from "./dice/check.mjs";

const SYSTEM_ID = "trg-prime";
const CALTROPS_FLAG = "caltropsCard";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines, flags = null) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor?.name ?? ""}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`,
    ...(flags ? { flags: { [SYSTEM_ID]: flags } } : {})
  });
}

function firstTarget() {
  return Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
}

/* ─────────────────────────── improvised attack ──────────────────────── */

/**
 * Ask which held item, and — for anything that names no weapon — which
 * damage type ("the GM will have the final say on this, as well as the
 * type of damage inflicted"; bludgeoning unless changed).
 *
 * @returns {Promise<{item: Item, damageType: string}|null>}
 */
async function chooseImprovised(candidates) {
  const { DialogV2 } = foundry.applications.api;
  const rows = candidates.map((item, index) => `
      <label style="display:flex;align-items:center;gap:8px;padding:2px 0">
        <input type="radio" name="item" value="${item.id}" ${index === 0 ? "checked" : ""}>
        <span>${item.name}${improvisesAsNamedWeapon(item) ? ` <span class="hint">(as a ${improvisedWeaponProfile(item).improvisedAs})</span>` : ""}</span>
      </label>`).join("");
  const result = await DialogV2.wait({
    window: { title: "Improvised Attack", icon: "fa-solid fa-hammer" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog">
        <p class="hint" style="margin:0 0 6px">Attack with something held that is not a weapon: -4 circumstance, 1d4 damage (Chapter 6). An item that names a weapon uses that weapon's damage.</p>
        ${rows}
        <div class="form-group"><label>Damage type (for an item that names no weapon)</label>
          <select name="damageType">
            <option value="bludgeoning" selected>Bludgeoning</option>
            <option value="piercing">Piercing</option>
            <option value="slashing">Slashing</option>
          </select>
        </div></div>`,
    buttons: [
      {
        action: "attack", label: "Attack", icon: "fa-solid fa-dice-d20", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  const item = candidates.find((i) => i.id === result.item) ?? candidates[0];
  return { item, damageType: String(result.damageType ?? "bludgeoning") };
}

/**
 * An improvised attack with something held (Graham's R5).
 *
 * THE WHOLE WEAPON PIPELINE, NOT A SECOND ONE. The item is presented to
 * `rollWeaponAttack` as the weapon its description names (or the generic
 * 1d4), so reach, the multiple attack penalty, criticals, fumbles, DR and
 * the target's defences are the same ones every Strike uses. The -4 and
 * the torch's fire ride on the profile; nothing on the gear item is
 * written, because nothing about swinging a torch changes the torch.
 *
 * @param {Actor} actor
 * @param {{event?: Event, item?: Item}} [options]
 */
export async function improvisedAttack(actor, { event = null, item = null } = {}) {
  const candidates = item ? [item].filter(canImproviseWith)
    : Array.from(actor.items ?? []).filter(canImproviseWith);
  if (!candidates.length) {
    ui.notifications.warn(
      `${actor.name} is holding nothing to attack with — equip the item first (only something held in the hand can be swung).`
    );
    return null;
  }
  const chosen = candidates.length === 1 && improvisesAsNamedWeapon(candidates[0])
    ? { item: candidates[0], damageType: "bludgeoning" }
    : await chooseImprovised(candidates);
  if (!chosen) return null;

  const profile = improvisedWeaponProfile(chosen.item, { damageType: chosen.damageType });
  const standIn = {
    id: chosen.item.id,
    uuid: chosen.item.uuid,
    name: chosen.item.name,
    img: chosen.item.img,
    type: "weapon",
    parent: actor,
    flags: {},
    system: profile,
    getFlag: () => undefined,
    toObject: () => ({ name: chosen.item.name, type: "weapon", system: { ...profile } }),
    // AN IMPROVISED WEAPON KEEPS NO WEAPON STATE — no spin, no parry
    // record, no load. The pipeline's writes land nowhere, by design.
    update: async () => null
  };
  const { rollWeaponAttack } = await import("./combat/attack-workflow.mjs");
  return rollWeaponAttack(actor, standIn, { event });
}

/* ─────────────────────────────── caltrops ───────────────────────────── */

/**
 * "You can scatter caltrops in an empty square adjacent to you with a
 * 1 AP (Interact) action." The caltrops leave the pack for the square, and
 * the card holds what happens next.
 */
async function scatterCaltrops(actor, item) {
  const quantity = Math.max(0, Math.floor(Number(item.system?.quantity ?? 0)));
  if (quantity <= 0) {
    ui.notifications.warn(`No ${item.name} left to scatter.`);
    return null;
  }
  const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  await spendActionPoints(actor, 1, `Scatter ${item.name}`);
  await item.update({ "system.quantity": quantity - 1 });
  return postCard(actor, "Caltrops", [
    line(`<strong>${actor.name}</strong> scatters ${item.name} in an adjacent square.`),
    line(`The first creature that moves into it makes a <strong>DC ${CALTROPS.dc} basic Reflex save</strong> or takes <strong>${CALTROPS.damage} ${CALTROPS.damageType}</strong>.`),
    `<div class="card-buttons">`
      + `<button type="button" data-action="trgCaltropsEntered"><i class="fa-solid fa-person-walking"></i> A creature moved in (target it)</button>`
      + `<button type="button" data-action="trgCaltropsSalvage"><i class="fa-solid fa-hand-holding"></i> Salvage</button>`
      + `</div>`
  ], { [CALTROPS_FLAG]: { handle: actorHandle(actor, actor.token ?? null), itemId: item.id, itemName: item.name, ruined: false, done: false } });
}

/**
 * The targeted creature walks onto the caltrops: its basic Reflex save,
 * and the damage (Chapter 7's basic-save ladder, as the spell path uses).
 */
async function caltropsEntered(message) {
  const card = message.getFlag(SYSTEM_ID, CALTROPS_FLAG);
  if (!card || card.done) return;
  if (card.ruined) {
    ui.notifications.info("These caltrops are already ruined — the square is safe.");
    return;
  }
  const target = firstTarget();
  if (!target) {
    ui.notifications.warn("Target the creature that moved into the caltrops first.");
    return;
  }
  const reflex = target.system?.combat?.saves?.reflex;
  const save = await TRGCheck.roll({
    actor: target,
    label: "Reflex Save — Caltrops",
    subject: "reflex",
    subtitle: `DC ${CALTROPS.dc} basic Reflex save`,
    type: "save",
    dc: CALTROPS.dc,
    modifiers: [...(reflex?.checkModifiers ?? [{ label: "Reflex", value: Number(reflex?.total ?? 0), type: "untyped" }])]
  });
  if (!save) return;
  const degree = save.outcome?.degree?.key ?? "failure";
  const margin = save.outcome?.margin ?? null;
  const basic = basicSavingThrow(degree, margin);
  const rolled = await new Roll(CALTROPS.damage).evaluate();
  let total = rolled.total;
  const lines = [];
  if (basic.bonusBaseDamage > 0) {
    const bonus = await new Roll(`${basic.bonusBaseDamage}d${CALTROPS.die}`).evaluate();
    total += bonus.total;
    lines.push(line(`Missed the save by <strong>${Math.abs(Math.round(Number(margin ?? 0)))}</strong> — `
      + `<strong>${basic.criticalSeverity}</strong>: +${basic.bonusBaseDamage} base (<strong>${bonus.total}</strong> more).`));
  }
  const dealt = Math.floor(total * basic.damageMultiplier);
  let taken = 0;
  if (dealt > 0) {
    const { applyTypedDamage } = await import("./combat/damage-workflow.mjs");
    const applied = await applyTypedDamage(target, { amount: dealt, type: CALTROPS.damageType });
    taken = Number(applied?.applied ?? 0);
  }
  lines.unshift(line(`<strong>${target.name}</strong> moves onto the caltrops — `
    + `${dealt > 0 ? `<strong>${taken}</strong> ${CALTROPS.damageType} taken${taken !== dealt ? ` (${dealt} before defences)` : ""}` : "no damage"}.`));
  const after = caltropsAfterEntry(card, taken);
  if (after.ruined) {
    lines.push(line("<em>Enough caltrops are ruined that other creatures moving into the square are safe, and they can't be salvaged.</em>"));
  }
  await message.setFlag(SYSTEM_ID, CALTROPS_FLAG, { ...card, ...after });
  await postCard(target, "Caltrops", lines);
}

/** "Deployed caltrops can be salvaged and reused if no creatures took damage from them." */
async function caltropsSalvage(message) {
  const card = message.getFlag(SYSTEM_ID, CALTROPS_FLAG);
  if (!card || card.done) return;
  if (card.ruined) {
    ui.notifications.warn("These caltrops were ruined when a creature took damage from them — they can't be salvaged.");
    return;
  }
  const actor = await resolveActorHandle(card.handle);
  const item = actor?.items?.get(card.itemId);
  if (item) {
    await item.update({ "system.quantity": Math.max(0, Math.floor(Number(item.system?.quantity ?? 0))) + 1 });
  }
  await message.setFlag(SYSTEM_ID, CALTROPS_FLAG, { ...card, done: true });
  await postCard(actor, "Caltrops", [line(`<strong>${card.itemName}</strong> salvaged and back in the pack.`)]);
}

/* ────────────────────────────────── oil ─────────────────────────────── */

/**
 * OIL: "You must first spend an Interact action preparing the oil, then
 * throw it with another action as a ranged attack. If you hit, it
 * splatters on the creature ... You must succeed at a DC 10 flat check
 * for the oil to ignite successfully when it hits. If the oil ignites,
 * the target takes 5 fire damage."
 *
 * THE ATTACK IS AN IMPROVISED THROWN ONE — a flask is not a weapon — so
 * it carries the improvised -4 unless the thrower has Throw Anything
 * ("no penalties for using an improvised thrown weapon", and +1 to any
 * thrown weapon). A reading, recorded in the release notes. No range
 * increment is printed for a flask, so none is applied.
 */
async function prepareOrThrowOil(actor, item) {
  const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  if (!oilPrepared(item)) {
    await spendActionPoints(actor, 1, `Prepare ${item.name}`);
    await item.setFlag(SYSTEM_ID, OIL_PREPARED_FLAG, true);
    return postCard(actor, "Oil", [line(`<strong>${actor.name}</strong> prepares ${item.name} to throw. Throwing it is another action.`)]);
  }
  const target = firstTarget();
  if (!target) {
    ui.notifications.warn("Target the creature to throw the oil at first.");
    return null;
  }
  await spendActionPoints(actor, 1, `Throw ${item.name}`);
  const throwAnything = Array.from(actor.items ?? [])
    .some((i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "throw anything");
  const modifiers = [{ label: "Ranged attack", value: Number(actor.system?.combat?.attack?.ranged ?? 0), type: "untyped" }];
  modifiers.push(throwAnything
    ? { label: "Throw Anything", value: 1, type: "circumstance" }
    : { label: "Improvised thrown (a flask of oil)", value: -4, type: "circumstance" });
  const db = Number(target.system?.combat?.defence?.total ?? 10);
  const attack = await TRGCheck.roll({
    actor,
    label: `${item.name} — Thrown`,
    subtitle: `vs ${target.name} (DB ${db})`,
    type: "attack",
    dc: db,
    targetUuid: target.uuid ?? "",
    modifiers
  });
  if (!attack) return null;
  // THE FLASK IS GONE EITHER WAY.
  const left = Math.max(0, Math.floor(Number(item.system?.quantity ?? 1)) - 1);
  await item.update({ "system.quantity": left, [`flags.${SYSTEM_ID}.${OIL_PREPARED_FLAG}`]: false });
  const lines = [];
  if (!attack.outcome?.degree?.success) {
    lines.push(line(`<strong>Miss</strong> — the oil splashes harmlessly. ${left} left.`));
    return postCard(actor, "Oil", lines);
  }
  lines.push(line(`<strong>Hit</strong> — the oil splatters on ${target.name}.`));
  const ignite = await TRGCheck.roll({
    actor, label: `${item.name} — Ignite`, subtitle: `DC ${OIL.igniteDC} flat check`,
    type: "flat", flat: true, dc: OIL.igniteDC
  });
  if (!ignite?.outcome?.degree?.success) {
    lines.push(line(`The oil fails to ignite (DC ${OIL.igniteDC} flat check). ${left} left.`));
    return postCard(actor, "Oil", lines);
  }
  const { applyTypedDamage } = await import("./combat/damage-workflow.mjs");
  const applied = await applyTypedDamage(target, { amount: OIL.damage, type: OIL.damageType });
  lines.push(line(`<strong>It ignites</strong> — ${target.name} takes <strong>${Number(applied?.applied ?? 0)}</strong> ${OIL.damageType}`
    + `${Number(applied?.applied ?? 0) !== OIL.damage ? ` (${OIL.damage} before defences)` : ""}. ${left} left.`));
  return postCard(actor, "Oil", lines);
}

/* ───────────────────────────── grappling hook ───────────────────────── */

/**
 * THE GRAPPLING HOOK (page 168; Graham's R2 of the block-17 audit — the
 * description wins). The rule is `grapplingHookOutcome` in goods.mjs.
 *
 * THE DC IS THE ANCHOR POINT'S, so it is asked for, pre-filled with the
 * printed "typically DC 20". The roll is SECRET — the check is rolled
 * blind, as every Secret action's is (traits.mjs) — and the thrower is
 * told only what they would see: a hook that holds, or one that does not.
 * The GM is told the truth in a whisper, because a fumble is the one
 * result that must look like a success.
 */
async function anchorGrapplingHook(actor, item) {
  const { DialogV2 } = foundry.applications.api;
  const dc = await DialogV2.wait({
    window: { title: `${item.name} — Anchor`, icon: "fa-solid fa-anchor" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">
        <p class="hint" style="margin:0 0 6px">An attack roll with the secret trait against a DC set by the anchor point — typically 20 or higher (Chapter 6).</p>
        <label>Anchor point DC <input type="number" name="dc" value="${GRAPPLING_HOOK.defaultDC}" min="0" style="width:5em"></label>
      </div>`,
    buttons: [
      { action: "throw", label: "Throw", icon: "fa-solid fa-anchor", default: true,
        callback: (event, button) => Number(button.form?.elements?.dc?.value) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!Number.isFinite(dc) || dc === null) return null;

  const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  await spendActionPoints(actor, GRAPPLING_HOOK.ap, `Throw ${item.name}`);
  const attack = await TRGCheck.roll({
    actor,
    label: `${item.name} — Anchor`,
    subtitle: `Secret — anchor point DC ${dc}`,
    type: "attack",
    dc,
    rollMode: BLIND_ROLL_MODE,
    modifiers: [{ label: "Ranged attack", value: Number(actor.system?.combat?.attack?.ranged ?? 0), type: "untyped" }]
  });
  if (!attack) return null;
  const outcome = grapplingHookOutcome(attack.outcome?.degree?.key);
  await postCard(actor, item.name, [line(outcome.seemsToHold
    ? `<strong>${actor.name}</strong> throws ${item.name}. It catches and <strong>seems to hold</strong>.`
    : `<strong>${actor.name}</strong> throws ${item.name}. It <strong>fails to catch</strong> and comes back when pulled.`)]);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id),
    content: `<div class="trg-prime trg-check-card"><p style="margin:2px 0"><strong>${item.name} (GM only):</strong> `
      + (outcome.secure
        ? "the hold is <strong>secure</strong>."
        : outcome.dislodges
          ? "<strong>fumbled</strong> — it only looks secure, and will dislodge partway up the climb."
          : "it did not catch.")
      + "</p></div>"
  });
  return outcome;
}

/**
 * The item row's "use" button.
 *
 * @param {Actor} actor
 * @param {Item} item
 */
export async function useGoodsItem(actor, item) {
  const use = String(item?.flags?.[SYSTEM_ID]?.[GOODS_USE_FLAG] ?? "").trim();
  if (use === "caltrops") return scatterCaltrops(actor, item);
  if (use === "oil") return prepareOrThrowOil(actor, item);
  if (use === GRAPPLING_HOOK.use) return anchorGrapplingHook(actor, item);
  return null;
}

const BOUND = Symbol("trgGoodsBound");

/** Wires the caltrops card's buttons. Called once, from init. */
export function registerGoodsHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.getFlag?.(SYSTEM_ID, CALTROPS_FLAG);
    if (!card) return;
    const entered = html.querySelector?.('[data-action="trgCaltropsEntered"]');
    const salvage = html.querySelector?.('[data-action="trgCaltropsSalvage"]');
    // THE GM RUNS THE SQUARE; the scatterer picks the caltrops back up.
    if (entered) {
      if (!game.user?.isGM) entered.style.display = "none";
      else if (card.ruined || card.done) entered.disabled = true;
      else if (!entered[BOUND]) {
        entered[BOUND] = true;
        entered.addEventListener("click", (event) => { event.preventDefault(); caltropsEntered(message); });
      }
    }
    if (salvage) {
      // WHOEVER SCATTERED THEM picks them up — the card's author — or the GM.
      const owner = message.isAuthor || game.user?.isGM;
      if (!owner) salvage.style.display = "none";
      else if (card.ruined || card.done) salvage.disabled = true;
      else if (!salvage[BOUND]) {
        salvage[BOUND] = true;
        salvage.addEventListener("click", (event) => { event.preventDefault(); caltropsSalvage(message); });
      }
    }
  });
}
