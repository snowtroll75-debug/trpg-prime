import { TRGCheck } from "../dice/check.mjs";
import { frightenedRecoveryDelta, sickenedRetchDelta } from "../conditions/registry.mjs";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

const { DialogV2 } = foundry.applications.api;

/** A small shared dialog: ask for the original effect's DC, since this
 * system doesn't track "what caused this condition" anywhere. */
async function promptForDC(title, hint) {
  const result = await DialogV2.wait({
    window: { title },
    classes: ["trg-prime"],
    position: { width: 320 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">${hint}</p>
        <div class="form-group">
          <label for="trg-effect-dc">Original effect DC</label>
          <input id="trg-effect-dc" type="number" name="dc" value="15" min="1">
        </div>
      </div>`,
    buttons: [
      {
        action: "roll",
        label: "Roll",
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

  if (!result || result === "cancel") return null;
  return Number(result.dc || 15);
}

/**
 * Frightened's recovery check (Appendix 2): "At the end of each of
 * your turns, you may make a Will Saving Throw against the original DC
 * of the fear effect."
 */
export async function rollFrightenedRecovery(actor) {
  const dc = await promptForDC(
    "Frightened — Recovery",
    "Will Saving Throw against the original DC of the fear effect."
  );
  if (dc === null) return null;

  const will = actor.system?.combat?.saves?.will;
  const modifiers = will?.checkModifiers ?? [
    { label: "Will", value: Number(will?.total ?? 0), type: "untyped" }
  ];

  const check = await TRGCheck.roll({
    actor,
    label: "Frightened — Recovery",
    subject: "will",
    subtitle: `Will Saving Throw, DC ${dc}`,
    type: "save",
    dc,
    modifiers: [...modifiers]
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const delta = frightenedRecoveryDelta(degree);
  const current = Number(actor.getConditionValue?.("frightened") ?? 0);
  // "CANNOT REDUCE THEIR FRIGHTENED CONDITION BELOW 1 AS LONG AS THEY
  // REMAIN WITHIN THE AREA" — Song Of Despair (3.429.0). The floor is
  // read from where the creature is standing at the moment it rolls, so
  // stepping outside first is exactly what the spell asks it to do.
  const { conditionFloorFor } = await import("../magic/emanation-workflow.mjs");
  const floor = conditionFloorFor(actor, "frightened");
  const next = Math.max(0, Math.max(current + delta, floor));

  const lines = [];
  if (delta !== 0) {
    if (next > 0) await actor.toggleStatusEffect("frightened", { value: next });
    else await actor.toggleStatusEffect("frightened", { active: false });
  }

  // SAID OUT LOUD when the floor is what stopped it. A recovery that
  // succeeds and changes nothing is the kind of result a player reads as
  // the system being broken.
  if (floor && next === floor && current + delta < floor) {
    lines.push(line(
      `<em>Held at <strong>${floor}</strong> — an area effect prevents Frightened `
      + "falling below that while you remain inside it.</em>"));
  }
  // WHAT ACTUALLY CHANGED, not what the degree offered.
  //
  // This printed the RAW delta, so a creature frightened 1 rolling a
  // Heroic recovery read "reduces by 3, to 0" — it had one point to
  // lose. The floor made the same defect absurd rather than merely
  // loose: "Held at 1" immediately followed by "reduces by 3, to 1".
  //
  // Pre-existing, and clamping at zero had hidden it: the FINAL number
  // was always right, so nothing looked wrong until a second clamp
  // arrived and the two sentences contradicted each other on one card.
  const moved = next - current;
  if (moved < 0) lines.push(line(`Frightened reduces by <strong>${-moved}</strong>, to <strong>${next}</strong>.`));
  else if (moved > 0) lines.push(line(`Frightened increases by <strong>${moved}</strong>, to <strong>${next}</strong>.`));
  else lines.push(line(`Frightened holds steady at <strong>${next}</strong>.`));

  await postCard(actor, "Frightened — Recovery Result", lines);
  return { check, delta, next };
}

/**
 * Sickened's retch action (Appendix 2): "You have the option to spend
 * a 1 AP manipulate action to try and alleviate your discomfort by
 * retching. This action allows you to make a Fortitude save against
 * the DC of the effect that induced your sickness."
 */
export async function rollSickenedRetch(actor) {
  // ARSENIC (page 183; 3.578.0): "You can't reduce your sickened condition
  // while affected." Refused before the DC is asked for or anything spent.
  const { conditionLockedBy } = await import("../poisons.mjs");
  const lockedBy = conditionLockedBy(Array.from(actor?.items ?? []), "sickened");
  if (lockedBy) {
    ui.notifications.warn(`${actor.name} can't reduce Sickened while affected by ${lockedBy}.`);
    return null;
  }
  // "A 1 AP MANIPULATE ACTION" (3.621.0; block 39's R7). Asked before the
  // DC, paid once the save is rolled — the same order Recurring Healing
  // keeps (conviction.mjs). Out of combat it costs nothing to track.
  const { passActionFlatChecks, payRetch, retchCost } = await import("../conditions/condition-events-workflow.mjs");
  if (!(await retchCost(actor))) return null;
  const dc = await promptForDC(
    "Retch — Sickened",
    "1 AP Manipulate action. Fortitude save against the DC of the effect that induced your sickness."
  );
  if (dc === null) return null;

  // A MANIPULATE ACTION, so Grabbed's DC 5 flat check is owed once it is
  // paid for: a lost Retch spends its AP and rolls no save.
  if (!(await passActionFlatChecks(actor, { name: "Retch", traits: "Manipulate" }))) {
    await payRetch(actor);
    return null;
  }
  const fortitude = actor.system?.combat?.saves?.fortitude;
  const modifiers = fortitude?.checkModifiers ?? [
    { label: "Fortitude", value: Number(fortitude?.total ?? 0), type: "untyped" }
  ];

  const check = await TRGCheck.roll({
    actor,
    label: "Retch — Sickened",
    subject: "fortitude",
    subtitle: `Fortitude save, DC ${dc}`,
    type: "save",
    dc,
    modifiers: [...modifiers]
  });

  await payRetch(actor);
  const degree = check.outcome?.degree?.key ?? "failure";
  const delta = sickenedRetchDelta(degree);
  const current = Number(actor.getConditionValue?.("sickened") ?? 0);
  const next = Math.max(0, current + delta);

  const lines = [];
  if (delta !== 0) {
    if (next > 0) await actor.toggleStatusEffect("sickened", { value: next });
    else await actor.toggleStatusEffect("sickened", { active: false });
    lines.push(line(`Sickened reduces by <strong>${-delta}</strong>, to <strong>${next}</strong>.`));
  } else {
    lines.push(line("No change to Sickened."));
  }

  await postCard(actor, "Retch — Result", lines);
  return { check, delta, next };
}
