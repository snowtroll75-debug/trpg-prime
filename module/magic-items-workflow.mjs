import {
  UNTRACKED_BROKEN_HP, depletionExplosion, depletionRefill, itemDepletionResult
} from "./magic-items.mjs";
import { breakItemValue } from "./items.mjs";
import { chargedItemLevelOf } from "./charged-items.mjs";
import { levelDC } from "./dice/resolution.mjs";

const SYSTEM_ID = "trg-prime";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * Invest Item (Chapter 11, Investment): Concentrate, 10 minutes.
 * Toggles the item's own Invested flag, warning (but not blocking —
 * the GM has final say) if it would exceed the actor's investment
 * slots. Ending investment (toggling off) is always allowed regardless
 * of slot count, matching "you can also voluntarily end investment by
 * using this action."
 */
export async function investItem(actor, item) {
  const currentlyInvested = Array.from(actor.items ?? []).filter(
    (i) => i.system?.invested
  ).length;
  const slots = Number(actor.system?.magic?.investmentSlots ?? 3);

  if (item.system.invested) {
    await item.update({ "system.invested": false });
    await postCard(actor, `${item.name} — Investment Ended`, [
      line("Investment ended. This frees an investment slot.")
    ]);
    return { invested: false };
  }

  // ONE STAFF (3.622.0; Graham's R11 of block 39): "Only one item with the
  // Staff trait may be invested by you at any one time."
  {
    const { staffInvestRefusal } = await import("./trait-rules.mjs");
    const refused = staffInvestRefusal(item, Array.from(actor.items ?? []));
    if (refused) {
      ui.notifications.warn(`${item.name}: ${refused}.`);
      return null;
    }
  }

  if (currentlyInvested >= slots) {
    ui.notifications.warn(
      `${actor.name} is already invested in ${currentlyInvested} of ${slots} items. Investing ${item.name} would exceed the limit.`
    );
    return null;
  }

  await item.update({ "system.invested": true });
  await postCard(actor, `${item.name} — Invested`, [
    line(`Spends 10 minutes investing. Now invested in <strong>${currentlyInvested + 1} / ${slots}</strong> items.`),
    line("Investment ends if prerequisites are no longer met, the item is more than 100 feet away for at least 24 hours, you die, or another creature successfully invests it.")
  ]);
  return { invested: true };
}

/**
 * Activate Item (Chapter 11): requires the item to be invested (if it
 * has the Invested trait) — refused otherwise since 3.622.0 (R12).
 * Posts the item's own Activation/Effect text as a reference card rather than resolving a specific mechanical effect, since that
 * varies entirely by item.
 *
 * A CHARGED ITEM IS THE EXCEPTION, now that the rods, staves and wands
 * exist: it goes to its own workflow, which picks what to release,
 * offers both check paths, spends the ITEM's power points and rolls the
 * depletion table when the pool goes below zero. The import is dynamic
 * because that workflow needs `rollItemDepletion` from this file.
 */
export async function activateItem(actor, item) {
  const system = item.system ?? {};
  // REFUSED, NOT WARNED (3.622.0; Graham's R12 of block 39): an item with
  // the Invested trait "must be invested using the Invest Item action before
  // its abilities can be fully utilised".
  const { investedRefusal } = await import("./trait-rules.mjs");
  const notInvested = investedRefusal(item);
  if (notInvested) {
    ui.notifications.warn(`${item.name}: ${notInvested} — use Invest Item first.`);
    return null;
  }

  if (item.flags?.["trg-prime"]?.chargedItem) {
    const { castFromChargedItem } = await import("./charged-items-workflow.mjs");
    return castFromChargedItem(actor, item);
  }

  // A WONDROUS ITEM WITH A USE (3.617.1, F2 of the 3.617.0 drive): the
  // Gloves of Vitality's heal. Their use button had gone into the Gear row,
  // and wondrous items are listed in a section of their own whose Activate
  // button only posted the description.
  const { wondrousUseOf } = await import("./wondrous-use.mjs");
  if (wondrousUseOf(item)) {
    const { useWondrousItem } = await import("./wondrous-use-workflow.mjs");
    return useWondrousItem(actor, item);
  }

  await postCard(actor, `${item.name} — Activate Item`, [
    line(system.description || "No activation details recorded on this item yet.")
  ]);
  return { activated: true };
}

/**
 * Charge Depletion (Chapter 11): rolled whenever a charged item's PP is
 * reduced below 0. A plain d100 (not open-ended, per the rulebook's own
 * table format) against the Item Depletion table.
 */
export async function rollItemDepletion(actor, item) {
  const roll = await new Roll("1d100").evaluate();
  const row = itemDepletionResult(roll.total);

  const lines = [
    line(`Rolled <strong>${roll.total}</strong>.`),
    line(`<em>${row.effect}</em>`)
  ];

  // THE BREAK IS NOW CARRIED OUT, not just announced (3.573.0).
  // Chapter 6: "if an effect makes an item broken automatically it is
  // reduced to 0 HP." This row says the item "gains the broken
  // condition", and until now it changed nothing — the card said broken
  // and the item went on working, which since this release also means it
  // went on granting its bonuses.
  //
  // AND AN ITEM WITH NO HIT POINTS BREAKS TOO (3.616.0, R16). Every charged
  // item in the pack is untracked, so the row did nothing to any of them.
  // It is given one hit point, at 0 — broken, as any item is, and mended by
  // Repair, as the row says it may be. A broken charged item casts nothing
  // (`castFromChargedItem`).
  const hp = item?.system?.hp;
  const tracked = Math.max(0, Math.floor(Number(hp?.max) || 0)) > 0;
  if (row?.breaks && tracked) {
    const before = Number(hp?.value ?? 0);
    const after = breakItemValue(before);
    if (after !== before) {
      await item.update({ "system.hp.value": after });
      lines.push(line(
        `<strong>${item.name}</strong> is reduced to <strong>0 HP</strong> and is now `
        + `<strong>broken</strong> — it grants no bonuses until it is Repaired.`
      ));
    }
  } else if (row?.breaks) {
    await item.update({ "system.hp.max": UNTRACKED_BROKEN_HP.max, "system.hp.value": UNTRACKED_BROKEN_HP.value });
    lines.push(line(`<strong>${item.name}</strong> is now <strong>broken</strong> — it casts nothing until it is Repaired.`));
  }

  // THE REST OF THE TABLE (3.616.0, Graham's R16 of block 36).
  const charged = item?.flags?.[SYSTEM_ID]?.chargedItem ?? {};
  const refill = depletionRefill(row?.kind, charged.maximumPP);
  if (refill) {
    const updates = { "system.uses": refill.uses };
    if (refill.maximumPP !== Number(charged.maximumPP ?? 0)) {
      updates[`flags.${SYSTEM_ID}.chargedItem.maximumPP`] = refill.maximumPP;
    }
    await item.update(updates);
    lines.push(line(`<strong>${item.name}</strong> holds <strong>${refill.uses}</strong> of ${refill.maximumPP} PP.`));
  }
  const level = chargedItemLevelOf(item);
  const explosion = row?.kind === "explode" ? depletionExplosion(level, levelDC) : null;
  if (explosion) {
    lines.push(line(`A <strong>${explosion.radiusFeet}-foot</strong> burst around ${actor.name}: `
      + `<strong>${explosion.formula} force</strong>, basic Reflex save against DC ${explosion.dc}.`));
  }
  const crumbles = row?.kind === "crumble";
  if (crumbles) lines.push(line(`<strong>${item.name}</strong> is gone.`));
  if (explosion) lines.push(line(`<strong>${item.name}</strong> is destroyed in the blast.`));

  await postCard(actor, `${item.name} — Charge Depletion`, lines);

  if (explosion) await explodeItem(actor, item, explosion);
  // AN ITEM THAT EXPLODES IS GONE (3.616.1, Graham's R1 of the 3.616.0
  // drive: "Yes"), as one that crumbles is. The drive's wand blew up and
  // stayed in its owner's pack at 0 PP.
  if (crumbles || explosion) await item.delete();
  if (row?.kind === "resonance") {
    const { rollResonanceEvent } = await import("./magic/cast-workflow.mjs");
    await rollResonanceEvent(actor, {
      reason: `${item.name} changes into another charged item (Charge Depletion, +20).`,
      modifiers: { extra: 20 }
    });
  }
  return { roll: roll.total, row };
}

/**
 * The 01–10 explosion: "affecting all creatures within a 10-foot radius per
 * item level. 1d4 force damage per level of the item, Basic Reflex Save
 * (level-based)." The holder is at the centre, and is in it. One damage
 * roll for the burst, as an area spell rolls one; each creature saves.
 */
async function explodeItem(actor, item, explosion) {
  // THE SHARED BURST (3.617.0) — see burst-workflow.mjs.
  const { burstDamage } = await import("./burst-workflow.mjs");
  const holder = actor.token?.object ?? actor.getActiveTokens?.()?.[0] ?? null;
  const { lines } = await burstDamage({
    center: holder,
    radiusFeet: explosion.radiusFeet,
    formula: explosion.formula,
    damageType: explosion.damageType,
    dc: explosion.dc,
    label: `${item.name} explodes`,
    fallback: [actor]
  });
  await postCard(actor, `${item.name} — Explosion`, lines);
}
