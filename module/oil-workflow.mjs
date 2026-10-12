/**
 * Applying an oil, wired up (Chapter 6, page 182).
 *
 * NEW at 3.578.0 (the block-18 audit's D8; Graham's R8 and R9). The rules
 * are in oils.mjs. Every refusal comes before anything is spent:
 *
 *   1  the printed activation — its AP, or a refusal if it cannot fit
 *      inside an encounter
 *   2  what it goes on — a weapon or ammunition for a blanch, armour, a
 *      shield or a weapon for Armourguard — chosen, and refused if it
 *      cannot take the oil
 *   3  the AP, the coat, the dose, and the card
 *
 * Nulladir goes on nothing the system tracks (a cubic foot of acid); what
 * it does to the one applying it — its vapours' Fortitude save — is the
 * part there is to automate.
 *
 * `sweepExpiredCoats` takes a coat off when its time is up: from the
 * world-clock hook, which Foundry also moves on each combat round.
 */

import {
  OIL_COAT_FLAG, ammoSplit, armourguardAt, hpAfterArmourguard, oilCoatLive, oilCoatOf, oilOf, oilSeconds, oilTarget
} from "./oils.mjs";
import { POISON_COAT_FLAG, coatActive } from "./poisons.mjs";
import { MATERIALS } from "./item-quality.mjs";
import { activationCost } from "./elixirs.mjs";
import { consumeOneUse } from "./consumable-use.mjs";
import { TRGCheck } from "./dice/check.mjs";

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

function materialLabel(key) {
  return MATERIALS[key]?.label ?? String(key ?? "");
}

function nowClock() {
  return {
    worldTime: Number(game.time?.worldTime ?? 0),
    combatId: game.combat?.started ? game.combat.id : null,
    round: game.combat?.started ? Number(game.combat.round ?? 0) : null
  };
}

/** Which of the actor's items the oil goes on — only those it can. */
async function chooseTarget(actor, item, oil) {
  const candidates = Array.from(actor.items ?? []).filter((i) => oilTarget(oil, i).ok)
    .sort((a, b) => Number(Boolean(b.system?.equipped)) - Number(Boolean(a.system?.equipped)));
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const { DialogV2 } = foundry.applications.api;
  const rows = candidates.map((c, i) => `<label style="display:flex;gap:8px;align-items:center;padding:2px 0">`
    + `<input type="radio" name="target" value="${c.id}"${i === 0 ? " checked" : ""}>`
    + `<span>${esc(c.name)}${c.type === "ammunition" ? ` <em>×${Number(c.system?.quantity ?? 0)}</em>` : ""}`
    + `${c.system?.equipped || c.type === "ammunition" ? "" : " <em>(not equipped)</em>"}</span></label>`).join("");
  const id = await DialogV2.wait({
    window: { title: `${item.name} — Apply`, icon: "fa-solid fa-droplet" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog"><p>What does ${esc(item.name)} go on?</p>${rows}</div>`,
    buttons: [
      { action: "apply", label: "Apply", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => button.form?.querySelector?.('input[name="target"]:checked')?.value ?? "" },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!id || id === "cancel") return null;
  return actor.items.get(id) ?? null;
}

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
    ? line(`The last of it is gone — ${esc(item.name)} is removed from the sheet.`)
    : line(`${after.quantity} remaining.`);
}

/** A coat's clock, from a duration phrase. */
function coatClock(duration) {
  const seconds = oilSeconds(duration);
  const clock = nowClock();
  return {
    appliedAt: clock.worldTime,
    endsAt: seconds === null ? null : clock.worldTime + seconds,
    combatId: clock.combatId,
    round: clock.round,
    rounds: seconds === null ? null : Math.ceil(seconds / 6)
  };
}

/** Take an Armourguard coat off an item: the bonus leaves its HP. */
async function removeArmourguard(target, coat) {
  const hp = hpAfterArmourguard(target.system?.hp ?? {}, Number(coat?.hpAdded ?? 0));
  await target.update({
    "system.hp.max": hp.max,
    "system.hp.value": hp.value,
    [`flags.${SYSTEM_ID}.-=${OIL_COAT_FLAG}`]: null
  });
}

/**
 * R8: TEN PIECES, SPLIT INTO A STACK OF THEIR OWN — or the whole stack coated
 * when it is ten or fewer. One helper for the material oils and the unguents
 * (3.617.0), so the split is written once.
 * @returns {Promise<Item>} the coated stack
 */
async function coatAmmunition(actor, target, item, coat, split) {
  if (!split.split) {
    await target.update({ name: `${target.name} (${item.name})`, [`flags.${SYSTEM_ID}.${OIL_COAT_FLAG}`]: coat });
    return target;
  }
  const data = target.toObject();
  delete data._id;
  data.name = `${target.name} (${item.name})`;
  data.system.quantity = split.coated;
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [SYSTEM_ID]: { [OIL_COAT_FLAG]: coat } });
  const [coated] = await actor.createEmbeddedDocuments("Item", [data]);
  await target.update({ "system.quantity": split.left });
  return coated;
}

/**
 * Use an oil.
 *
 * @param {Actor} actor
 * @param {Item} item the oil
 * @returns {Promise<object|null>}
 */
export async function useOil(actor, item) {
  const oil = oilOf(item);
  if (!oil) return null;

  // 1. THE PRINTED ACTIVATION.
  const inCombat = Boolean(game.combat?.started);
  const cost = activationCost(item.system?.activation, { inCombat });
  if (!cost.allowed) {
    ui.notifications.warn(`${item.name} ${cost.reason}.`);
    return null;
  }
  const spendAP = async () => {
    if (cost.ap > 0) {
      const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
      await spendActionPoints(actor, cost.ap, item.name);
    }
  };
  const apLine = cost.ap ? line(`<em>${esc(item.system?.activation ?? "")} — ${cost.ap} AP.</em>`) : "";

  // NULLADIR: the acid is the table's; the vapours are the applier's.
  if (oil.kind === "vapour") {
    await spendAP();
    const after = await spendDose(item);
    const lines = [line(`<strong>${esc(actor.name)}</strong> uses ${esc(item.name)}.`)];
    if (apLine) lines.push(apLine);
    lines.push(line(esc(item.system?.description ?? "")));
    lines.push(remainingLine(item, after));
    const save = oil.save;
    const Save = `${save[0].toUpperCase()}${save.slice(1)}`;
    const check = await TRGCheck.roll({
      actor,
      label: `${item.name} — ${Save} Save`,
      subtitle: "The vapours, on close exposure",
      type: "save",
      subject: save,
      traits: item.system?.traits ?? "",
      dc: oil.dc,
      modifiers: actor.system?.combat?.saves?.[save]?.checkModifiers
        ?? [{ label: Save, value: Number(actor.system?.combat?.saves?.[save]?.total ?? 0), type: "untyped" }]
    });
    const success = Boolean(check?.outcome?.degree?.success);
    lines.push(line(success
      ? `The vapours: <strong>negated</strong> (${Save} DC ${oil.dc}).`
      : `The vapours: <strong>failed</strong> (${Save} DC ${oil.dc}).`));
    if (!success && oil.conditions.length) {
      const { syntheticSpellData } = await import("./consumable-use-workflow.mjs");
      const data = syntheticSpellData(item, {
        label: item.name,
        effects: oil.conditions.map((c) => ({
          kind: "condition", target: "targets", condition: c.key,
          ...(c.value ? { value: Number(c.value) } : {}),
          ...(oil.duration ? { duration: oil.duration } : {})
        })),
        duration: ""
      });
      const spell = new Item.implementation(data, { parent: actor });
      const { applySpellEffects } = await import("./magic/spell-effects.mjs");
      await applySpellEffects(actor, spell, { targets: [actor], lines });
    }
    await postCard(actor, `${item.name} — Used`, lines);
    return { used: true, saved: success };
  }

  // 2. WHAT IT GOES ON.
  const target = await chooseTarget(actor, item, oil);
  if (!target) {
    if (!Array.from(actor.items ?? []).some((i) => oilTarget(oil, i).ok)) {
      ui.notifications.warn(`${actor.name} has nothing ${item.name} can go on (${oilTarget(oil, null).reason || "no fitting item"}).`);
    }
    return null;
  }
  const fits = oilTarget(oil, target);
  if (!fits.ok) {
    ui.notifications.warn(`${item.name} goes on ${fits.reason}.`);
    return null;
  }

  // 3. THE AP, THE COAT, THE DOSE, THE CARD.
  await spendAP();
  const lines = [];
  if (oil.kind === "material") {
    const label = materialLabel(oil.material);
    if (fits.as === "ammunition") {
      // R8: TEN PIECES, SPLIT INTO A STACK OF THEIR OWN.
      const split = ammoSplit(target.system?.quantity, oil.ammoCount);
      const clock = coatClock(oil.ammoDuration);
      const coat = { kind: "material", material: oil.material, name: item.name, originalName: target.name, ...clock };
      const coated = await coatAmmunition(actor, target, item, coat, split);
      lines.push(line(`<strong>${esc(actor.name)}</strong> coats <strong>${split.coated}</strong> of ${esc(target.name)} with ${esc(item.name)} — they count as <strong>${esc(label)}</strong>`
        + `${clock.endsAt === null ? ", each until it is fired" : ` for ${esc(oil.ammoDuration)}`}.`));
      if (split.split) lines.push(line(`<em>A stack of their own: ${esc(coated?.name ?? "")}. ${split.left} uncoated remain.</em>`));
    } else {
      const clock = coatClock(oil.weaponDuration);
      await target.setFlag(SYSTEM_ID, OIL_COAT_FLAG, { kind: "material", material: oil.material, name: item.name, ...clock });
      lines.push(line(`<strong>${esc(actor.name)}</strong> coats <strong>${esc(target.name)}</strong> with ${esc(item.name)} — it counts as <strong>${esc(label)}</strong> for the damage it deals, for ${esc(oil.weaponDuration)}.`));
    }
  } else if (oil.kind === "rider") {
    // THE UNGUENTS (3.617.0, C1 of block 37) — see oils.mjs.
    const ridesOn = { kind: "rider", name: item.name, attack: oil.attack, damage: oil.damage, secondary: oil.secondary,
      ...(oil.strikes ? { strikesLeft: oil.strikes } : {}) };
    const what = [
      oil.attack || oil.damage ? `+${Math.max(oil.attack, oil.damage)} item to attack and damage` : "",
      oil.secondary ? `${esc(oil.secondary.dice)} secondary ${esc(oil.secondary.type)} on ${oil.strikes ? `the next ${oil.strikes} hits` : "each hit"}` : ""
    ].filter(Boolean).join(", ");
    if (fits.as === "ammunition") {
      const split = ammoSplit(target.system?.quantity, oil.ammoCount);
      const clock = coatClock(oil.ammoDuration);
      const coat = { ...ridesOn, originalName: target.name, ...clock };
      const coated = await coatAmmunition(actor, target, item, coat, split);
      lines.push(line(`<strong>${esc(actor.name)}</strong> coats <strong>${split.coated}</strong> of ${esc(target.name)} with ${esc(item.name)}: ${what}, for ${esc(oil.ammoDuration)}.`));
      if (split.split) lines.push(line(`<em>A stack of their own: ${esc(coated?.name ?? "")}. ${split.left} uncoated remain.</em>`));
    } else {
      const clock = coatClock(oil.weaponDuration);
      await target.setFlag(SYSTEM_ID, OIL_COAT_FLAG, { ...ridesOn, ...clock });
      lines.push(line(`<strong>${esc(actor.name)}</strong> coats <strong>${esc(target.name)}</strong> with ${esc(item.name)}: ${what}, for ${esc(oil.weaponDuration)}.`));
    }
    if (oil.attack || oil.damage) lines.push(line("<em>An item bonus: it does not stack with the weapon's own item bonus — the higher stands.</em>"));
  } else {
    // ARMOURGUARD (R9).
    const previous = oilCoatOf(target);
    if (previous?.kind === "armourguard") await removeArmourguard(target, previous);
    const fresh = actor.items.get(target.id) ?? target;
    const at = armourguardAt(oil, item.system?.itemLevel, item.flags?.[SYSTEM_ID]?.alchemical?.baseLevel ?? item.system?.itemLevel);
    const tracked = Number(fresh.system?.hp?.max ?? 0) > 0;
    const coat = {
      kind: "armourguard",
      name: item.name,
      hp: at.hp,
      hpAdded: tracked ? at.hp : 0,
      dr: fits.as === "armour" ? at.dr : 0,
      db: fits.as === "shield" ? at.db : 0,
      ...coatClock(oil.duration)
    };
    await fresh.update({
      ...(tracked ? {
        "system.hp.max": Number(fresh.system.hp.max) + at.hp,
        "system.hp.value": Number(fresh.system.hp.value ?? 0) + at.hp
      } : {}),
      [`flags.${SYSTEM_ID}.${OIL_COAT_FLAG}`]: coat
    });
    const parts = [`+${at.hp} item HP`];
    if (coat.dr) parts.push(`+${coat.dr} item DR`);
    if (coat.db) parts.push(`+${coat.db} item DB`);
    lines.push(line(`<strong>${esc(actor.name)}</strong> treats <strong>${esc(fresh.name)}</strong> with ${esc(item.name)}: ${parts.join(", ")} for ${esc(oil.duration)}.`));
    if (!tracked) lines.push(line(`<em>${esc(fresh.name)} has no hit points recorded, so there is nothing to add them to.</em>`));
    if (previous?.kind === "armourguard") lines.push(line("<em>The old coat is replaced, not added to.</em>"));
    if (fits.as === "weapon") lines.push(line("<em>Armourguard is for metal items — whether this one is, is the table's.</em>"));
  }
  if (apLine) lines.push(apLine);
  const after = await spendDose(item);
  lines.push(remainingLine(item, after));
  await postCard(actor, `${item.name} — Applied`, lines);
  return { used: true, target: target.id, as: fits.as };
}

/**
 * The uncoated stack a coated split came from, if the actor still has it:
 * the same type and name, and no coat of its own.
 */
function ammoHome(actor, split, originalName) {
  if (split?.type !== "ammunition") return null;
  return Array.from(actor?.items ?? []).find((i) => i.id !== split.id && i.type === split.type
    && i.name === originalName && !oilCoatOf(i)) ?? null;
}

/**
 * Take off every coat on this actor's items whose time is up — an oil's,
 * and a poison's that dried with nothing hit (R2).
 *
 * @param {Actor} actor
 * @returns {Promise<string[]>} a line for each
 */
export async function sweepExpiredCoats(actor) {
  const said = [];
  const clock = nowClock();
  for (const target of Array.from(actor?.items ?? [])) {
    const coat = oilCoatOf(target);
    if (coat && !oilCoatLive(coat, clock)) {
      if (coat.kind === "armourguard") {
        await removeArmourguard(target, coat);
      } else if (coat.originalName && target.name !== coat.originalName) {
        // BACK INTO THE STACK IT CAME FROM (3.578.1, F7 of the 3.578.0 live
        // test): ten arrows that stop being silver are ordinary arrows
        // again, and two stacks of the same arrows is clutter.
        const home = ammoHome(actor, target, coat.originalName);
        if (home) {
          await home.update({ "system.quantity": Number(home.system?.quantity ?? 0) + Number(target.system?.quantity ?? 0) });
          await target.delete();
        } else {
          await target.update({ name: coat.originalName, [`flags.${SYSTEM_ID}.-=${OIL_COAT_FLAG}`]: null });
        }
      } else {
        await target.unsetFlag(SYSTEM_ID, OIL_COAT_FLAG);
      }
      said.push(`The ${esc(coat.name ?? "oil")} on ${esc(coat.originalName ?? target.name)} has worn off.`);
    }
    const poison = target.getFlag?.(SYSTEM_ID, POISON_COAT_FLAG) ?? null;
    if (poison && !coatActive(poison, clock)) {
      await target.unsetFlag(SYSTEM_ID, POISON_COAT_FLAG);
      said.push(`The ${esc(poison.name ?? "poison")} on ${esc(target.name)} has dried.`);
    }
  }
  return said;
}

/**
 * A hit spends one strike of a counted unguent (3.617.0, R4). The coat comes
 * off with its last strike.
 * @param {Item} item the coated weapon or ammunition
 * @returns {Promise<string|null>} a card line, or null
 */
export async function spendRiderStrike(item) {
  const { riderAfterHit } = await import("./oils.mjs");
  const coat = oilCoatOf(item);
  const now = { worldTime: Number(game.time?.worldTime ?? 0), combatId: game.combat?.id ?? null, round: game.combat ? Number(game.combat.round ?? 0) : null };
  const after = riderAfterHit(coat, now);
  if (!after) return null;
  if (after.gone) {
    if (coat.originalName) await item.update({ name: coat.originalName, [`flags.${SYSTEM_ID}.-=${OIL_COAT_FLAG}`]: null });
    else await item.unsetFlag(SYSTEM_ID, OIL_COAT_FLAG);
    return `<em>${esc(coat.name ?? "The unguent")} is spent.</em>`;
  }
  await item.setFlag(SYSTEM_ID, `${OIL_COAT_FLAG}.strikesLeft`, after.strikesLeft);
  return `<em>${esc(coat.name ?? "The unguent")}: ${after.strikesLeft} hit${after.strikesLeft === 1 ? "" : "s"} left.</em>`;
}
