import { TRGCheck } from "../dice/check.mjs";
import { DEGREES } from "../dice/resolution.mjs";
import { immuneToEffect } from "../traits.mjs";
import { ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import {
  afflictionSaveDC,
  afflictionSpan,
  conditionRemovalAllowed,
  applyStageChange,
  deadlineDue,
  exposureStartingStage,
  initialExposureOutcome,
  spanSeconds,
  stageDelta
} from "../afflictions.mjs";
import { rollCriticalInjury } from "./attack-workflow.mjs";
import {
  POISON_FLAG, conditionsToWithdraw, exposureResult, poisonCriticalSeverity, stageIntervalRounds
} from "../poisons.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

function saveLabel(key) {
  return { fortitude: "Fortitude", reflex: "Reflex", will: "Will" }[key] ?? "Fortitude";
}

/** Roll the affliction's saving throw for whichever ability it specifies. */
async function rollAfflictionSave(actor, item, { label, subtitle }) {
  const saveKey = ["fortitude", "reflex", "will"].includes(item.system.savingThrow)
    ? item.system.savingThrow
    : "fortitude";
  const save = actor.system?.combat?.saves?.[saveKey];
  const modifiers = save?.checkModifiers ?? [
    { label: saveLabel(saveKey), value: Number(save?.total ?? 0), type: "untyped" }
  ];

  return TRGCheck.roll({
    actor,
    label,
    subtitle,
    type: "save",
    // The affliction's own traits (Poison, Disease) reach the conditional
    // engine, which is what lets the Dwarf's "+2 against poison" and the
    // Elf's "advantage against disease" apply here without asking — this
    // save never opens a configuration dialog to ask in.
    traits: item.system?.traits ?? "",
    subject: saveKey,
    dc: afflictionSaveDC(item.system.level, item.system),
    modifiers: [...modifiers]
  });
}

/**
 * Quick Recovery (Chapter 5): "when making saving throws against disease
 * or poison, you treat the result of the saving throw as one degree
 * higher." Applied to the DEGREE both affliction save consumers read,
 * only when the affliction actually carries the Poison or Disease trait.
 */
function quickRecoveryDegree(actor, item, check) {
  const rolled = check.outcome?.degree?.key ?? "failure";
  const traits = String(item.system?.traits ?? "").toLowerCase();
  if (!/\bpoison\b|\bdisease\b/.test(traits)) return rolled;
  const owned = Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "quick recovery"
  );
  if (!owned) return rolled;
  const index = DEGREES.findIndex((d) => d.key === rolled);
  if (index <= 0) return rolled;
  const raised = DEGREES[index - 1].key;
  ui.notifications.info(`Quick Recovery: ${rolled} treated as ${raised}.`);
  return raised;
}

/* ─────────────────────── what a poison's stage does ─────────────────────
 *
 * NEW at 3.578.0 (the block-18 audit's D7; Graham's R1 and R13). A stage
 * from a poison carries what it deals and inflicts — `damage`,
 * `conditions`, `conditionDuration` — and `criticalOnFailure` for its
 * "poison critical". An affliction with none of those (every one written
 * by hand before this release) still posts its text and nothing more, as
 * it always did: the fields are opt-in.
 */

/** The poison half of an affliction item, or null. */
function poisonOf(item) {
  return item?.flags?.["trg-prime"]?.[POISON_FLAG] ?? null;
}

/* ─────────────────────── the affliction's own record ────────────────
 *
 * NEW at 3.583.0 (the pages 231-240 audit's D1, Graham's R1 and R2:
 * "same as Poison").
 *
 * THE RECORD USED TO LIVE IN THE POISON FLAG, and that is why a disease
 * did nothing. `applyPoisonConditions` computed exactly the right list of
 * conditions and then wrote it only `if (poison)`; a hand-written
 * affliction had no poison half, so the list was discarded and
 * `withdrawStageConditions` returned on its first line. The comment above
 * called the fields "opt-in" — they were opt-in to a converter nobody
 * else could reach, and the item template had no room for them at all.
 *
 * One flag now, set for both, holding what this affliction has put on
 * and the three deadlines page 232 gives it.
 * ─────────────────────────────────────────────────────────────────── */

const AFFLICTION_FLAG = "affliction";

/*
 * Set while an affliction takes its own conditions back, so the page-232
 * lock lets its own withdrawal through. Declared here beside the record
 * it guards rather than beside the hook, because `withdrawStageConditions`
 * — several hundred lines above that hook — is its most important setter.
 */
let releasing = false;

/** This affliction's record: what it applied, and when its clocks ring. */
function recordOf(item) {
  const own = item?.flags?.["trg-prime"]?.[AFFLICTION_FLAG];
  if (own) return own;
  // ONE-TIME FALLBACK for a poison already mid-progression in a live
  // world when this release lands: its `applied` list was written to the
  // poison flag, and losing it would strand the conditions it put on.
  const poison = poisonOf(item);
  return { applied: poison?.applied ?? [], incubationEndsAt: null, stageDueAt: null, endsAt: null };
}

async function setRecord(item, patch) {
  if (!item?.id) return;
  await item.setFlag("trg-prime", AFFLICTION_FLAG, { ...recordOf(item), ...patch });
}

/** Take back the conditions the affliction's current stage put on. */
async function withdrawStageConditions(actor, item) {
  const applied = recordOf(item).applied ?? [];
  if (!applied.length) return;
  /*
   * THE AFFLICTION'S OWN HAND (3.583.1; F1 of the 3.583.0 live drive).
   *
   * This function IS the affliction taking its conditions back, and
   * until this release the lock added for page 232's closing sentence
   * refused it — `releasing` was set only by `releaseAffliction`, and a
   * stage change does not go through that. Driven live: Filth Fever
   * climbed from Stage 2 to Stage 4 on a Fumble, applied Paralyzed, and
   * the Stage 2 Sickened stayed on beside it because the withdrawal was
   * silently blocked by the rule protecting it.
   *
   * A lock whose own key is refused is a lock on the wrong door.
   */
  releasing = true;
  try {
    const plan = conditionsToWithdraw(applied, (key) => {
      if (!actor.hasCondition?.(key)) return null;
      return CONDITIONS[key]?.valued ? Number(actor.getConditionValue?.(key) ?? 0) : 1;
    });
    for (const step of plan) {
      if (step.remove) await actor.toggleStatusEffect(step.key, { active: false });
      else if (step.value !== null) await actor.toggleStatusEffect(step.key, { value: step.value, force: true });
    }
    if (item?.id && actor.items?.get?.(item.id)) await setRecord(item, { applied: [] });
  } finally {
    releasing = false;
  }
}

/** Put on the conditions a stage (or a one-save outcome) inflicts, and record them. */
async function applyPoisonConditions(actor, item, entry) {
  const tags = (entry?.conditions ?? [])
    .filter((c) => CONDITIONS[c?.key])
    .map((c) => ({ key: c.key, label: CONDITIONS[c.key].label, value: CONDITIONS[c.key].valued ? Number(c.value ?? 1) : null }));
  if (!tags.length) return [];
  // A TIMED CONDITION (Oil of Taggit's "Unconscious … 1d3 hours", Kamarsk's
  // "blinded for 1 hour") carries its own clock; a stage's conditions last
  // as long as the stage does, and are taken back when it changes.
  let timing = {};
  const durationText = String(entry.conditionDuration ?? entry.duration ?? "").trim();
  if (durationText && !/permanent/i.test(durationText)) {
    const m = /^(\d+d\d+|\d+)\s*(round|minute|hour)s?$/i.exec(durationText);
    if (m) {
      const amount = /d/i.test(m[1]) ? (await new Roll(m[1]).evaluate()).total : Number(m[1]);
      const unit = m[2].toLowerCase();
      const seconds = amount * (unit === "round" ? 6 : unit === "minute" ? 60 : 3600);
      timing = { spellEffect: true, spellEffectEnd: Number(game.time?.worldTime ?? 0) + seconds };
      if (unit === "round" && game.combat?.started) timing.expiresRound = Number(game.combat.round ?? 0) + amount;
    }
  }
  const { applyConditionTags, formatAppliedTags } = await import("./effect-application-workflow.mjs");
  const before = Object.fromEntries(tags.map((t) => [t.key, Boolean(actor.hasCondition?.(t.key))]));
  const applied = await applyConditionTags(actor, tags, timing);
  const record = applied
    .filter((a) => !a.immune)
    .map((a) => ({ key: a.key, value: tags.find((t) => t.key === a.key)?.value ?? null, added: !before[a.key] }));
  if (item?.id && actor.items?.get?.(item.id)) await setRecord(item, { applied: record });
  return [line(`${actor.name}: ${formatAppliedTags(applied)}${durationText ? ` (${durationText})` : ""}.`)];
}

/**
 * The poison critical (R13): a critical injury on the poison table, its
 * severity the margin the save failed by — the same bands a spell's
 * failed save reads, and, as for a spell, nothing below a failure by 5.
 */
async function poisonCritical(actor, item, check) {
  const margin = check?.outcome?.margin ?? null;
  const severity = poisonCriticalSeverity(margin);
  if (!severity) {
    return [line(`<em>Poison critical — the save failed by ${Math.max(0, -Number(margin ?? 0))}, too little for a critical injury (a failure by 5 or more, as a spell's).</em>`)];
  }
  const { actorDefences } = await import("../creature-traits.mjs");
  const defences = actorDefences(actor.system, ownedCreatureTypeSystem(actor));
  if (defences.immunities.has("critical")) {
    return [line(`<em>Poison critical (${severity}) — ${actor.name} is immune to critical injuries.</em>`)];
  }
  await rollCriticalInjury(actor, { targetActor: actor, damageType: "poison", severity, attackBonus: 0 });
  return [line(`<strong>Poison critical — ${severity}</strong> (the save failed by ${-Number(margin)}).`)];
}

/**
 * The affliction's own end, stamped once (D4, Graham's R5).
 *
 * "An affliction will always have a duration. This determines the
 * maximum amount of time an affliction can last if no successful saving
 * throws are made." The code read this in ROUNDS and stored every other
 * shape as a string it never consulted, so a disease measured in days
 * ran for ever.
 *
 * "UNTIL CURED" STAYS OPEN, deliberately — that is a duration with no
 * end, not a duration of nothing, and both printed diseases have it.
 *
 * @returns {Promise<number|null>} the world time it ends, or null
 */
async function stampDuration(item) {
  const span = afflictionSpan(item?.system?.duration);
  if (span?.kind !== "span") return null;
  const amount = span.seconds === null ? (await new Roll(span.formula).evaluate()).total : null;
  const seconds = span.seconds ?? spanSeconds(amount, span.unit);
  return Number(globalThis.game?.time?.worldTime ?? 0) + seconds;
}

/**
 * When the next stage save falls due, stamped on entering a stage
 * (D3, Graham's R4: "advance on the world clock").
 *
 * A STAGE IN ROUNDS KEEPS THE END PHASE. That sweep already deals the
 * interval's damage before the save and has been right since 3.578.0;
 * stamping a world-time deadline beside it would roll the same save
 * twice, once per clock — the defect shape block 21 found when a
 * condition owned two clocks.
 *
 * @returns {Promise<number|null>}
 */
async function stampStageDue(item, entry) {
  if (stageIntervalRounds(entry, poisonOf(item)?.durationRounds ?? null)) return null;
  const span = afflictionSpan(entry?.interval);
  if (span?.kind !== "span") return null;
  const amount = span.seconds === null ? (await new Roll(span.formula).evaluate()).total : null;
  const seconds = span.seconds ?? spanSeconds(amount, span.unit);
  return Number(globalThis.game?.time?.worldTime ?? 0) + seconds;
}

/**
 * ENTER A STAGE — ONE PATH, FOR A DISEASE AS MUCH AS A POISON.
 *
 * There were two of these until 3.583.0. `enterPoisonStage` applied the
 * stage's conditions, clocked the timed ones and withdrew the last
 * stage's; `applyStageEffect` — the path every hand-written affliction
 * took — printed the effect string and rolled a critical if a tickbox
 * was set, and applied nothing whatsoever. Filth Fever's "Stage 2:
 * Sickened 1 (1 day)" posted a card reading exactly that and left the
 * character unsickened.
 *
 * Graham's R2, asked which behaviour a disease should have: "Same as
 * Poison". So there is one function and no second chance to get it wrong
 * — the lesson block 20 learned from a sentence that lived in the branch
 * it never reached.
 */
async function enterStage(actor, item, stage, check = null) {
  const entry = item.system.stages?.[stage - 1];
  if (!entry) return;
  await withdrawStageConditions(actor, item);
  const lines = [line(`<strong>Stage ${stage}:</strong> ${entry.effect || "(no effect text set)"}`)];
  const interval = stageIntervalRounds(entry, poisonOf(item)?.durationRounds ?? null);
  lines.push(...await applyPoisonConditions(actor, item, entry));
  if (entry.damage) {
    lines.push(line(`<em>${entry.damage} ${stageDamageType(entry)} damage at the end of ${interval
      ? `each ${interval === 1 ? "round" : `${interval} rounds`} — dealt in ${actor.name}'s end phase, before the save`
      : `this stage (${entry.interval || "its interval"}) — press the stage save when it comes`}.</em>`));
  } else if (interval) {
    lines.push(line(`<em>The next save comes in ${actor.name}'s end phase${interval > 1 ? ` in ${interval} rounds` : ""}.</em>`));
  } else if (entry.interval) {
    lines.push(line(`<em>Next save at the end of: ${entry.interval}</em>`));
  }
  const failed = check && !check.outcome?.degree?.success;
  if (entry.criticalOnFailure && failed) lines.push(...await poisonCritical(actor, item, check));
  // THE NEXT SAVE IS ARMED HERE, once, on entering the stage — not
  // recomputed by the sweep, which would restart the interval every tick.
  const due = await stampStageDue(item, entry);
  if (due !== null) {
    await setRecord(item, { stageDueAt: due });
    lines.push(line(`<em>The next save comes on its own when ${entry.interval} has passed.</em>`));
  }
  await postCard(actor, `${item.name} — Stage ${stage}`, lines);
}

/**
 * THE TYPE A STAGE DEALS (3.627.0). Every affliction before Pillars of
 * Faith's Chapter 9 dealt poison — the field was never needed. Ghoul Fever
 * ("2d8 essence") and Mummy Rot ("4d6 essence damage") are diseases that do
 * not, so a stage may declare `damageType`; without one it is poison, as
 * every existing affliction was written.
 */
function stageDamageType(entry) {
  const t = String(entry?.damageType ?? "").trim().toLowerCase();
  return t || "poison";
}

/** A stage's damage for the interval just ended (p.190: "you take damage from them"). */
async function dealStageDamage(actor, item) {
  const stage = Number(item.system.currentStage ?? 0);
  const entry = item.system.stages?.[stage - 1];
  if (!entry?.damage) return null;
  const roll = await new Roll(String(entry.damage)).evaluate();
  const { applyTypedDamage } = await import("./damage-workflow.mjs");
  const type = stageDamageType(entry);
  const applied = await applyTypedDamage(actor, { amount: roll.total, type, traits: type === "poison" ? ["poison"] : [] });
  await postCard(actor, `${item.name} — Stage ${stage} Damage`, [
    line(`<strong>${roll.total} ${type}</strong> (${entry.damage})${applied.applied !== roll.total ? ` — ${applied.applied} after defences` : ""}.`)
  ]);
  return applied;
}

/** The affliction is over: its conditions come off, and the item goes. */
async function endPoison(actor, item, reason) {
  await withdrawStageConditions(actor, item);
  await item.delete();
  await postCard(actor, `${item.name} — Ended`, [line(reason)]);
}

/**
 * THE END PHASE'S AFFLICTIONS (p.190, and Graham's R1): "If you have …
 * any ongoing afflictions you take damage from them and then may make
 * checks to remove them." For every poison whose stage runs in rounds —
 * damage for the interval, then the stage save; and when the poison's own
 * duration in rounds is spent, it simply ends. A stage measured in
 * minutes or hours keeps its button on the sheet.
 *
 * @param {Actor} actor whose end phase this is
 * @returns {Promise<number>} how many afflictions were advanced
 */
export async function advanceAfflictionsAtEndPhase(actor) {
  let advanced = 0;
  const afflictions = Array.from(actor?.items ?? []).filter((i) => i.type === "affliction" && poisonOf(i));
  for (const item of afflictions) {
    const stage = Number(item.system.currentStage ?? 0);
    if (item.system.incubating || stage < 1) continue;
    const poison = poisonOf(item);
    const entry = item.system.stages?.[stage - 1];
    const interval = stageIntervalRounds(entry, poison.durationRounds ?? null);
    if (!interval) continue;
    const elapsed = Number(poison.elapsedRounds ?? 0) + 1;
    const inStage = Number(poison.stageRounds ?? 0) + 1;
    const due = inStage >= interval;
    await item.setFlag("trg-prime", POISON_FLAG, { ...poison, elapsedRounds: elapsed, stageRounds: due ? 0 : inStage });
    advanced += 1;
    if (due) await dealStageDamage(actor, item);
    if (poison.durationRounds && elapsed >= poison.durationRounds) {
      await endPoison(actor, item, `Its ${poison.durationRounds} rounds are over — the poison has run its course.`);
      continue;
    }
    if (due) await rollAfflictionStageSave(actor, actor.items.get(item.id) ?? item, { withDamage: false });
  }
  return advanced;
}

/**
 * The initial exposure save (Chapter 8): Success/Critical/Heroic means
 * unaffected; Failure/Partial starts at stage 1 once incubation ends;
 * Fumble/Blunder starts at stage 2. See afflictions.mjs for the sparse
 * table's documented interpolations.
 */
export async function rollInitialExposureSave(actor, item) {
  const check = await rollAfflictionSave(actor, item, {
    label: `${item.name} — Saving Throw`,
    subtitle: `Initial exposure${item.system.incubation ? ` — incubation ${item.system.incubation}` : ""}`
  });

  const degree = quickRecoveryDegree(actor, item, check);
  const poison = poisonOf(item);

  // ONE SAVE, FOUR OUTCOMES (Kamarsk Oil, Sumark Oil): no stages to enter.
  if (poison?.outcomes) {
    const result = exposureResult(poison, degree);
    if (!result.affected) {
      await item.delete();
      await postCard(actor, `${item.name} — Resisted`, [line("<strong>Unaffected.</strong>")]);
      return { affected: false };
    }
    const lines = [line(`<strong>${result.outcome.degree[0].toUpperCase()}${result.outcome.degree.slice(1)}:</strong> ${result.outcome.effect ?? ""}`)];
    lines.push(...await applyPoisonConditions(actor, item, result.outcome));
    if (item.system?.incubation) lines.push(line(`<em>Incubation ${item.system.incubation} — the table decides whether it has passed.</em>`));
    // THE ITEM HAS DONE ITS WORK: the condition carries its own clock, and
    // a permanent one is the GM's to lift.
    await item.delete();
    await postCard(actor, `${item.name} — Affected`, lines);
    return { affected: true, outcome: result.outcome.degree };
  }

  const rolled = initialExposureOutcome(degree);
  const outcome = { ...rolled, startingStage: exposureStartingStage(rolled.startingStage, item.system.maxStage) };

  if (!outcome.affected) {
    // A POISON THAT FAILED TO TAKE HOLD IS GONE (3.578.0) rather than left
    // on the sheet at stage 0 for somebody to tidy away.
    if (poison) {
      await item.delete();
    } else {
      await item.update({ "system.incubating": false, "system.currentStage": 0 });
    }
    await postCard(actor, `${item.name} — Resisted`, [
      line("<strong>Unaffected.</strong> No further saves are needed against this exposure.")
    ]);
    return { affected: false };
  }

  /*
   * INCUBATION IS A CLOCK NOW (3.583.0; D2, Graham's R3).
   *
   * Until this release the two lines below set `incubating: false` and
   * the stage was entered immediately, while the card said "once
   * incubation passes" — the card and the code disagreeing, which is
   * this project's most-repeated defect. Page 232: "during this time,
   * the target of the affliction suffers no adverse conditions."
   *
   * The span is ROLLED ONCE and stamped. Filth Fever's "1d4 hours" must
   * be a number the moment it is caught, or every reader of the text
   * gets a different answer to "has it passed yet?".
   */
  const incubation = afflictionSpan(item.system.incubation);
  const incubates = incubation?.kind === "span" || incubation?.kind === "open";
  let incubationEndsAt = null;
  let incubationSaid = "";

  if (incubation?.kind === "span") {
    const amount = incubation.seconds === null
      ? (await new Roll(incubation.formula).evaluate()).total
      : null;
    const seconds = incubation.seconds ?? spanSeconds(amount, incubation.unit);
    incubationEndsAt = Number(globalThis.game?.time?.worldTime ?? 0) + seconds;
    incubationSaid = amount === null
      ? `${incubation.formula} ${incubation.unit}${Number(incubation.formula) === 1 ? "" : "s"}`
      : `${incubation.formula} → <strong>${amount} ${incubation.unit}${amount === 1 ? "" : "s"}</strong>`;
  } else if (incubation?.kind === "open") {
    // "Until full moon" (Lycanthropy) — no clock can count it, so the
    // affliction waits for the GM rather than arriving at once (R15).
    incubationSaid = incubation.reason;
  }

  await item.update({
    "system.incubating": incubates,
    "system.currentStage": outcome.startingStage
  });
  await setRecord(actor.items.get(item.id) ?? item, {
    incubationEndsAt,
    endsAt: await stampDuration(item),
    stageDueAt: null
  });

  if (!incubates) {
    // Wyvern Poison has no incubation; Graveroot's is "Instant".
    await postCard(actor, `${item.name} — Affected`, [
      line(`The affliction begins at <strong>Stage ${outcome.startingStage}</strong>.`)
    ]);
    await enterStage(actor, actor.items.get(item.id) ?? item, outcome.startingStage, check);
    return { affected: true, stage: outcome.startingStage };
  }

  await postCard(actor, `${item.name} — Incubating`, [
    line(`<strong>Incubation ${incubationSaid}.</strong> No effect until it passes — page 232.`),
    line(incubationEndsAt === null
      ? `<em>Nothing can count "${incubation.reason}" — begin it from the affliction's card when the fiction says so. It will start at <strong>Stage ${outcome.startingStage}</strong>.</em>`
      : `<em>It will begin at <strong>Stage ${outcome.startingStage}</strong> on its own.</em>`)
  ]);

  return { affected: true, stage: outcome.startingStage, incubating: true };
}

/**
 * A stage saving throw, attempted "at the end of each stage's interval."
 * The GM/player judges when that interval has elapsed — matching how
 * Exhaustion Check and Daily Preparation intervals are also
 * table-adjudicated rather than clock-driven in this system.
 */
export async function rollAfflictionStageSave(actor, item, { withDamage = true } = {}) {
  const currentStage = Number(item.system.currentStage ?? 0);
  if (item.system.incubating || currentStage < 1) {
    ui.notifications.warn(
      `${item.name} hasn't progressed past initial exposure yet.`
    );
    return null;
  }
  const poison = poisonOf(item);
  // THE INTERVAL'S DAMAGE COMES FIRST (p.190: "you take damage from them
  // and then may make checks to remove them"). Pressed from the sheet,
  // this is the end of an interval. An immediate new save — Anti-Plague's,
  // Antitoxin's — is not, and passes `withDamage: false`.
  if (poison && withDamage) await dealStageDamage(actor, item);
  // …AND A DISEASE'S, which never was (3.627.0). The stage damage half was
  // only ever reached through a poison's own record, and every disease the
  // core prints deals none — Ghoul Fever's "2d8 essence" and Mummy Rot's
  // "4d6 essence damage" are the first. The interval's damage, then the save.
  if (!poison && withDamage && item.system.stages?.[currentStage - 1]?.damage) await dealStageDamage(actor, item);

  const check = await rollAfflictionSave(actor, item, {
    label: `${item.name} — Saving Throw`,
    subtitle: `Stage ${currentStage} interval save`
  });

  const degree = quickRecoveryDegree(actor, item, check);
  const delta = stageDelta(degree);
  const result = applyStageChange(currentStage, delta, item.system.maxStage);

  if (result.ended) {
    if (poison) {
      await endPoison(actor, item, "The affliction's stage drops below 1: it ends.");
      return { ended: true };
    }
    await item.delete();
    await postCard(actor, `${item.name} — Ended`, [
      line("The affliction's stage drops below 1: it ends.")
    ]);
    return { ended: true };
  }

  await item.update({ "system.currentStage": result.stage });
  const direction =
    result.stage > currentStage ? "worsens" : result.stage < currentStage ? "improves" : "holds";
  await postCard(actor, `${item.name} — ${direction === "worsens" ? "Worsens" : direction === "improves" ? "Improves" : "Holds"}`, [
    line(`Stage ${currentStage} \u2192 <strong>Stage ${result.stage}</strong>.`)
  ]);
  await enterStage(actor, actor.items.get(item.id) ?? item, result.stage, check);

  return { ended: false, stage: result.stage };
}

/**
 * Apply an affliction to every currently targeted token: a fresh tracked
 * copy is created on each target's actor (currentStage 0, incubating),
 * then its initial exposure save is rolled immediately — "initial
 * exposure to an affliction grants you a saving throw."
 */
export async function applyAffliction(sourceItem) {
  const targets = [...(game.user.targets ?? [])];
  if (!targets.length) {
    ui.notifications.warn("Target at least one token to apply this affliction.");
    return [];
  }

  const results = [];
  for (const token of targets) {
    const targetActor = token.actor;
    if (!targetActor) continue;

    // Afflictions carry Appendix 3 traits — Poison, Disease, Curse,
    // Injury — and are the thing a GM is most likely to want a creature
    // immune to. There was no gate here at all: a construct caught
    // diseases. Refused before the affliction is even copied onto the
    // actor, so an immune creature is not left carrying an inert item.
    const immunity = immuneToEffect(sourceItem.system, targetActor.system, ownedCreatureTypeSystem(targetActor));
    if (immunity) {
      ui.notifications.info(
        `${targetActor.name} is immune to the ${immunity.trait} trait — ${sourceItem.name} has no effect.`
      );
      results.push({ actor: targetActor.name, immune: true, trait: immunity.trait });
      continue;
    }

    const data = foundry.utils.mergeObject(sourceItem.toObject(), {
      system: { incubating: true, currentStage: 0 }
    });
    delete data._id;

    const [copy] = await targetActor.createEmbeddedDocuments("Item", [data]);

    results.push(await rollInitialExposureSave(targetActor, copy));
  }
  return results;
}

/**
 * A POISON REACHES A CREATURE (3.578.0; the block-18 audit's D7, Graham's
 * R1). The poison's affliction is copied onto the creature — refused
 * first if it is immune to the poison's traits, as `applyAffliction`
 * refuses — and its exposure save is rolled at once.
 *
 * @param {Actor} targetActor
 * @param {object} data the affliction item data (`afflictionItemData`)
 * @returns {Promise<object>}
 */
export async function exposeToAffliction(targetActor, data) {
  if (!targetActor || !data) return null;
  const immunity = immuneToEffect(data.system, targetActor.system, ownedCreatureTypeSystem(targetActor));
  if (immunity) {
    await postCard(targetActor, `${data.name} — No Effect`, [
      line(`${targetActor.name} is immune to the ${immunity.trait} trait — ${data.name} has no effect.`)
    ]);
    return { actor: targetActor.name, immune: true, trait: immunity.trait };
  }
  const [copy] = await targetActor.createEmbeddedDocuments("Item", [foundry.utils.deepClone(data)]);
  return rollInitialExposureSave(targetActor, copy);
}

/**
 * THE AFFLICTION'S OWN CLOCK (3.583.0; D2, D3 and D4 — Graham's R3, R4
 * and R5 of 22 September 2026).
 *
 * The end-phase sweep advances a stage measured in ROUNDS and has done
 * since 3.578.0. Both of page 232's printed diseases use an interval of
 * a DAY, and Filth Fever incubates for 1d4 HOURS — neither of which a
 * round clock can ever reach. So the whole progression of the two
 * afflictions the book prints was a button somebody had to remember.
 *
 * This is the other clock, beside the one that now charges an hourly
 * Exhaustion check for thirst. Three deadlines, in the order they can
 * fall due within a single tick:
 *
 *   INCUBATION ends  → the stage the exposure save chose begins.
 *   A STAGE'S INTERVAL ends → its saving throw is rolled.
 *   THE DURATION ends → "the maximum amount of time an affliction can
 *                       last if no successful saving throws are made".
 *
 * ORDER MATTERS AND IS NOT ARBITRARY. A long jump of the world clock can
 * ring all three; an affliction whose duration expired must not first
 * roll a stage save it is no longer subject to, and one still incubating
 * has no stage to save against.
 *
 * @param {Actor} actor
 * @param {number} worldTime
 * @returns {Promise<string[]>} what happened, for the caller to post
 */
export async function sweepAfflictions(actor, worldTime) {
  const said = [];
  const items = Array.from(actor?.items ?? []).filter((i) => i.type === "affliction");

  for (const item of items) {
    const record = recordOf(item);

    // THE DURATION FIRST. An affliction that has run its course does not
    // get one last stage save on the way out.
    if (deadlineDue(record.endsAt, worldTime)) {
      await withdrawStageConditions(actor, item);
      said.push(`<strong>${item.name}</strong> has run its full duration and ends.`);
      await item.delete();
      continue;
    }

    if (deadlineDue(record.incubationEndsAt, worldTime)) {
      const stage = Number(item.system.currentStage ?? 0);
      await item.update({ "system.incubating": false });
      await setRecord(item, { incubationEndsAt: null });
      said.push(`<strong>${item.name}</strong>'s incubation has passed — it begins at Stage ${stage}.`);
      await enterStage(actor, actor.items.get(item.id) ?? item, stage);
      continue;
    }

    if (item.system.incubating) continue;

    if (deadlineDue(record.stageDueAt, worldTime)) {
      await setRecord(item, { stageDueAt: null });
      const live = actor.items.get(item.id);
      if (!live) continue;
      said.push(`<strong>${item.name}</strong>'s interval has passed — a new saving throw.`);
      await rollAfflictionStageSave(actor, live, { withDamage: true });
    }
  }
  return said;
}

/** Does this actor have anything for the world clock to sweep? */
export function hasAfflictions(actor) {
  return Array.from(actor?.items ?? []).some((i) => i.type === "affliction");
}

/* ══════════════════════════════════════════════════════════════════════
 * WHAT AN AFFLICTION HOLDS (3.583.0; D5, Graham's R6: "Yes, but allow GM
 * to remove them manually").
 *
 * Page 232's closing sentence, and the only hard mechanical statement on
 * the page that was not implemented at all:
 *
 *   "Any condition that you gain from an affliction lasts beyond its
 *    duration and cannot be removed while the affliction persists."
 *
 * It could not be implemented before this release, because there were no
 * conditions to protect — a disease applied none (D1). Now that it does,
 * a Sickened from Filth Fever refuses every ordinary route that would
 * lift it: a spell, a rest, a recovery roll, a condition sweep.
 *
 * THE GM'S ROUTE IS THE AFFLICTION ITSELF. Graham's carve-out is kept by
 * the fiction's own logic rather than by asking who is clicking: deleting
 * the affliction cures it, and its conditions go with it. `game.user.isGM`
 * would have been the obvious test and the wrong one — nearly every rule
 * in this system runs on the active GM's client, so "allow the GM" would
 * have allowed the spells and rests the sentence exists to refuse.
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Set while an affliction takes its own conditions back, so the lock
 * below lets its own withdrawal through. A module-scoped flag rather
 * than an option threaded through `toggleStatusEffect`, which does not
 * carry one.
 */
/** Which live afflictions on this actor are holding this condition? */
function afflictionsHolding(actor, statusKey) {
  const key = String(statusKey ?? "");
  if (!key) return [];
  return Array.from(actor?.items ?? [])
    .filter((i) => i.type === "affliction")
    .filter((i) => (recordOf(i).applied ?? []).some((a) => a.key === key));
}

/** Release everything an affliction holds — its cure, and the GM's route. */
async function releaseAffliction(actor, item) {
  /*
   * NO FLAG HERE (3.583.1). This function used to raise `releasing`
   * around the call below, and after F1 moved that job into
   * `withdrawStageConditions` itself — where the stage change also
   * needs it — the two were nested: the inner `finally` lowered the flag
   * while the outer still believed it raised. Harmless while this is the
   * only statement, and exactly the arrangement that stops being
   * harmless when a second one is added.
   */
  await withdrawStageConditions(actor, item);
}

export function registerAfflictionConditionLock() {
  Hooks.on("preDeleteActiveEffect", (effect) => {
    if (releasing) return true;
    const actor = effect?.parent;
    if (!actor?.items) return true;
    const statuses = Array.from(effect.statuses ?? []);
    if (!statuses.length) return true;

    for (const key of statuses) {
      const holders = afflictionsHolding(actor, key);
      const verdict = conditionRemovalAllowed({
        heldByAffliction: holders.length > 0,
        // EVERYTHING THAT REACHES THIS HOOK IS A RULE. `releasing` above
        // is the affliction's own withdrawal and has already returned;
        // the affliction's deletion is the GM's route, and it goes
        // through that same withdrawal. So anything still here is a
        // spell, a rest, a recovery or a sweep — exactly what page 232's
        // sentence refuses.
        fromRule: true,
        byGM: Boolean(globalThis.game?.user?.isGM)
      });
      if (verdict.allowed) continue;
      ui.notifications?.warn(
        `${effect.name} cannot be removed — ${verdict.reason}. `
        + `Held by ${holders.map((h) => h.name).join(", ")}; delete the affliction to cure it.`
      );
      return false;
    }
    return true;
  });

  /*
   * DELETING THE AFFLICTION IS ITS CURE. Without this the conditions
   * would outlive the thing the lock pointed at, and nothing could ever
   * lift them — a lock with no key.
   *
   * ON `deleteItem`, NOT `preDeleteItem` (3.583.1). Foundry calls a
   * pre-hook synchronously and does not await what it returns, so an
   * async release racing the deletion happened to finish first in the
   * live drive and had no reason to keep doing so. After the delete
   * there is no race: the document object is still readable for its
   * record, and the conditions live on the actor either way.
   */
  Hooks.on("deleteItem", async (item) => {
    if (item?.type !== "affliction") return;
    const actor = item.parent;
    if (!actor?.items) return;
    if (!(recordOf(item).applied ?? []).length) return;
    await releaseAffliction(actor, item);
  });
}
