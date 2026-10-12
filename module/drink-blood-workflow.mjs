/**
 * Drink Blood, the Foundry half (3.627.0). See drink-blood.mjs.
 */
import { drinkBloodAmount, drinkBloodRequirement } from "./drink-blood.mjs";

const line = (html) => `<p style="margin:2px 0">${html}</p>`;

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

export async function useDrinkBlood(actor, item) {
  const targets = Array.from(game.user?.targets ?? []);
  if (targets.length !== 1 || !targets[0].actor) {
    ui.notifications?.warn(`${item.name}: target exactly one creature within reach.`);
    return null;
  }
  const targetToken = targets[0];
  const target = targetToken.actor;

  // WITHIN REACH — the drinker's melee reach, measured.
  const { activeToken, distanceBetween } = await import("./combat/geometry.mjs");
  const { reachOf } = await import("./combat/opportunity.mjs");
  const ownToken = activeToken(actor);
  if (ownToken) {
    const feet = distanceBetween(ownToken, targetToken);
    const reach = reachOf(ownToken);
    if (Number.isFinite(feet) && feet > reach) {
      ui.notifications?.warn(`${item.name}: ${target.name} is ${feet} ft away — beyond ${actor.name}'s ${reach}-ft reach.`);
      return null;
    }
  }

  const conditions = Array.from(target.statuses ?? []);
  let requirement = drinkBloodRequirement(conditions);
  if (!requirement.ok) {
    const { DialogV2 } = foundry.applications.api;
    const willing = await DialogV2.confirm({
      window: { title: item.name },
      content: `<p><strong>${target.name}</strong> is not grabbed, immobilised, paralysed or unconscious. Is it <strong>willing</strong>?</p>`,
      rejectClose: false
    });
    requirement = drinkBloodRequirement(conditions, { willing: Boolean(willing) });
    if (!requirement.ok) {
      ui.notifications?.warn(`${item.name}: the target must be grabbed, immobilised, paralysed, unconscious or willing.`);
      return null;
    }
  }

  const { ensureActionPoints, spendActionCost } = await import("./combat/action-points-workflow.mjs");
  if (!(await ensureActionPoints(actor, 1, item.name))) return null;
  await spendActionCost(actor, 1, item.name, { traits: "Soul" });

  const lines = [];
  if (requirement.needsCheck) {
    const dc = Number(target.system?.combat?.saves?.fortitude?.dc ?? NaN);
    const { TRGCheck } = await import("./dice/check.mjs");
    const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
    const check = await TRGCheck.roll(withCheckModifiers({
      actor,
      label: `${actor.name} — Athletics`,
      subtitle: `${item.name} — against ${target.name}'s Fortitude DC ${Number.isFinite(dc) ? dc : "?"} (grabbed)`,
      type: "skill",
      subject: "athletics",
      dc: Number.isFinite(dc) ? dc : null
    }));
    if (!check?.outcome?.degree?.success) {
      lines.push(line(`${actor.name} cannot reach the vein — the Athletics check is a <strong>${check?.outcome?.degree?.label ?? "failure"}</strong>.`));
      await postCard(actor, item.name, lines);
      return null;
    }
    lines.push(line(`Athletics <strong>${check.outcome.degree.label}</strong> against the grabbed target's Fortitude DC.`));
  } else {
    lines.push(line(`<em>Automatic — ${target.name} is ${requirement.via}.</em>`));
  }

  const { amount, lines: bonusLines } = drinkBloodAmount(Array.from(actor.appliedEffects ?? actor.effects ?? []), actor.system?.identity?.level ?? 0);
  const before = Number(target.getConditionValue?.("soulDrain") ?? 0);
  const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
  const { relayConditionTags } = await import("./combat/target-relay-workflow.mjs");
  const tags = [{ key: "soulDrain", label: "Soul Drain", value: amount }];
  // Through the relay when the drinker does not own the target (a player's vampire).
  const applied = await relayConditionTags(target, tags, {}, () => applyConditionTags(target, tags, {}));
  // What LANDED: the applied tag's own new value where it says one (the relay
  // returns it before this client's copy of the target catches up).
  const reported = applied.find((a) => a.key === "soulDrain");
  const after = Number.isFinite(Number(reported?.value)) ? Number(reported.value) : Number(target.getConditionValue?.("soulDrain") ?? 0);
  const landed = applied.some((a) => a.immune) ? 0 : Math.max(0, after - before);
  lines.push(line(`${target.name}: ${formatAppliedTags(applied)}${bonusLines.length ? ` <em>(Soul Drain ${amount}: 10, ${bonusLines.join(", ")})</em>` : ""}.`));
  if (landed > 0) {
    const { healActor } = await import("./magic/spell-effects.mjs");
    const healed = await healActor(actor, landed, { magical: false });
    lines.push(line(`${actor.name} is healed <strong>${Number(healed) || 0}</strong> HP (the ${landed} Soul Drain that landed).`));
  } else {
    lines.push(line(`<em>No Soul Drain landed, so ${actor.name} heals nothing.</em>`));
  }
  await postCard(actor, item.name, lines);
  return { amount, landed };
}
