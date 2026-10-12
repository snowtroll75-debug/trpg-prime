import { TRGCheck } from "./dice/check.mjs";
import { applyItemDamage, itemStatus, sleepingInArmourFatigue, sleepingInArmourModifier } from "./items.mjs";

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
 * Item Damage (Chapter 6): applies damage to a physical item, reduced
 * by the item's own DR, and reports the resulting status (intact,
 * broken, destroyed). Items with no Max HP set are untracked — the
 * dialog still asks, but the result is a no-op with a clear note,
 * rather than silently treating an unconfigured item as already broken.
 */
export async function damageItem(actor, item) {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${item.name} — Damage` },
    classes: ["trg-prime"],
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label for="trg-item-damage">Damage amount</label>
          <input id="trg-item-damage" type="number" name="amount" value="0" min="0">
        </div>
      </div>`,
    ok: {
      label: "Apply",
      callback: (event, button) => Number(button.form.elements.amount?.value ?? 0)
    },
    rejectClose: false
  });

  if (result === null || result === undefined) return null;

  const hp = item.system?.hp;
  if (!hp || Number(hp.max) <= 0) {
    await postCard(actor, `${item.name} — Damage`, [
      line(`${item.name} has no Max HP set — item damage isn't tracked for it.`)
    ]);
    return null;
  }

  const itemDR = Number(item.system.dr ?? 0);
  const newValue = applyItemDamage(hp.value, result, itemDR);
  const status = itemStatus(newValue, hp.max);

  await item.update({ "system.hp.value": newValue });

  const lines = [
    line(`Takes <strong>${result}</strong> damage, reduced by DR ${itemDR}. Now <strong>${newValue} / ${hp.max}</strong> HP.`)
  ];
  if (status === "broken") {
    lines.push(line("<strong>Broken.</strong> Can't be used for its normal function or grant bonuses, except armour, which keeps working at half DR."));
  } else if (status === "destroyed") {
    lines.push(line("<strong>Destroyed.</strong> Can't be repaired."));
  }

  await postCard(actor, `${item.name} — Damage`, lines);
  return { newValue, status };
}

/**
 * Sleeping in Armour (Chapter 6): a DC 20 Fortitude save after a
 * night's rest, modified by whatever armour is currently equipped
 * (Light +5, Heavy -5, Rigid -1, Metal -2 — Medium carries no category
 * modifier of its own). Multiple equipped armour pieces each
 * contribute their own modifier, matching how the Casting in Armour
 * penalty already treats multiple prohibited pieces.
 */
export async function rollSleepingInArmour(actor) {
  const equippedArmour = Array.from(actor.items ?? []).filter(
    (item) => item.type === "armour" && item.system?.equipped
  );

  if (!equippedArmour.length) {
    await postCard(actor, "Sleeping in Armour", [
      line("No armour is currently equipped — this check doesn't apply.")
    ]);
    return null;
  }

  const modifier = equippedArmour.reduce((sum, item) => {
    const traits = String(item.system.traits ?? "").toLowerCase();
    return (
      sum +
      sleepingInArmourModifier({
        category: String(item.system.category ?? "").toLowerCase(),
        rigid: traits.includes("rigid"),
        metal: traits.includes("metal")
      })
    );
  }, 0);

  const fortitude = actor.system?.combat?.saves?.fortitude;
  const modifiers = fortitude?.checkModifiers ?? [
    { label: "Fortitude", value: Number(fortitude?.total ?? 0), type: "untyped" }
  ];
  if (modifier) {
    modifiers.push({ label: "Armour", value: modifier, type: "circumstance" });
  }

  const check = await TRGCheck.roll({
    actor,
    label: "Sleeping in Armour",
    subject: "fortitude",
    subtitle: "DC 20 Fortitude Saving Throw",
    type: "save",
    dc: 20,
    modifiers: [...modifiers]
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const delta = sleepingInArmourFatigue(degree);

  if (delta > 0) {
    const current = actor.getConditionValue?.("fatigued") ?? 0;
    await actor.toggleStatusEffect("fatigued", { value: current + delta });
  }

  await postCard(actor, "Sleeping in Armour — Result", [
    line(
      delta > 0
        ? `Gains <strong>Fatigue ${delta}</strong>.`
        : "<strong>No fatigue gained.</strong>"
    )
  ]);
  return { check, delta };
}
