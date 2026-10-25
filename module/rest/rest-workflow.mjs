/**
 * Rest & Recovery — the GM-facing workflow behind the Rest macro.
 * Per Graham directly: since resting is a shared, party-wide
 * circumstance (one person resting an hour while others don't makes
 * no sense), this lives as a single macro the GM runs for the whole
 * group at once, not a per-actor sheet button — the opposite of how
 * every other piece of this audit has worked so far.
 *
 * Rolls happen per hour, matching how the rulebook actually states
 * these rules ("after every hour of rest," Healing Trance's own
 * 1-hour AP cost) rather than as a single aggregate formula — but per
 * Graham directly, the many individual rolls per actor collapse into
 * one consolidated summary card each, not a message per hour per
 * mechanic. Every check involved is rolled with toMessage: false for
 * exactly this reason.
 */

import { TRGCheck, levelDC } from "../dice/check.mjs";
import { rollFatigueRecovery } from "../combat/exhaustion-workflow.mjs";
import { doomedRecovery, soulDrainRecovery } from "../combat/turn-economy.mjs";
import { setDoomed, setSoulDrain } from "../combat/dying-workflow.mjs";
import { getActiveSpells, hasSustained } from "../magic/active-spells.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";
import { DAILY_FIRSTS_FLAG, dailyFirstMultiplier, dailyFirstSpent, hasDailyFirst } from "../daily-firsts.mjs";

const SYSTEM_ID = "trg-prime";
import {
  naturalHealingHP,
  activePPRecovery,
  restingPPRecovery,
  sleepingPPRecovery,
  excessSleepHoursAsResting,
  powerRecoveryBonus,
  powerRecoveryExtras,
  healingTranceMultiplier,
  fullRestHours,
  FULL_NIGHT_HOURS
} from "./recovery.mjs";

/**
 * Runs a full rest period for one actor, applying every recovery
 * mechanic that activity level qualifies for, and returns a summary
 * rather than posting anything itself — the caller (performRest)
 * owns turning that into the one consolidated card per actor.
 *
 * @param {Actor} actor
 * @param {object} options
 * @param {number} options.hours
 * @param {"active"|"resting"|"sleeping"} options.activity
 * @param {boolean} options.safeEnvironment Natural Healing requires
 *   "rest in a safe environment" — a shared, GM-judged circumstance
 *   for the whole rest period.
 * @param {boolean} options.attemptHealingTrance
 * @param {boolean} options.attemptPowerRecovery
 * @param {boolean} options.sustainingASpell "You cannot recover Power
 *   Points while sustaining a spell" — this project has no live
 *   tracker for that state (a known, existing gap noted elsewhere in
 *   this codebase), so it's a manual flag here rather than detected.
 * @returns {Promise<object>} A summary of everything that happened.
 */
export async function performRestForActor(actor, {
  hours,
  activity,
  safeEnvironment,
  attemptHealingTrance,
  attemptPowerRecovery,
  sustainingASpell,
  ate = true,
  drank = true
}) {
  /*
   * HAUNTED (3.606.0). Speak With Dead's Critical: a spirit "relentlessly
   * haunts you for a full day … preventing any chance of rest or respite".
   * "ANY chance" is read as no benefit from ANY hour of it — the hours the
   * table spent still pass on the party's clock, but nothing is recovered,
   * which is exactly what the rest would have been for. Found, not spent:
   * the marker lasts its day whatever the party does with the night.
   */
  const { findMarker } = await import("../magic/markers.mjs");
  const haunted = Boolean(findMarker(actor, "haunted"));
  const tableHours = Math.max(0, Math.floor(Number(hours) || 0));
  const realHours = haunted ? 0 : tableHours;
  // TRANCE (Chapter 2, the Elf's Immortal): "You don't need to sleep and
  // will gain the benefits of a night's rest simply by entering a trance
  // state for 4 hours."
  //
  // Graham's ruling, 16 Aug 2026: a 4-hour trance pays a FULL night —
  // eight hours' worth of Power Points, Natural Healing and Fatigue
  // Recovery, in four hours of game time. So the hours the benefits are
  // computed from are the real hours scaled up, while the clock the table
  // keeps stays the real ones.
  //
  // Declared as a flag naming the hours a full rest takes, rather than by
  // matching the ability's name, so a later feature with the same clause
  // (or a different trance length) works unchanged.
  const restHours = fullRestHours(actor);
  const trance = activity === "sleeping" && restHours > 0 && restHours < FULL_NIGHT_HOURS
    ? FULL_NIGHT_HOURS / restHours
    : 1;
  const wholeHours = Math.floor(realHours * trance);
  const maxHP = Number(actor.system?.resources?.hp?.max ?? 0);
  const maxPP = Number(actor.system?.resources?.pp?.max ?? 0);
  // Extended-duration PP locking + "no recovery while sustaining" (Chapter 9):
  // locked PP is set aside from the recoverable ceiling, and any active
  // sustained spell blocks recovery outright (as does the manual checkbox).
  const lockedPPValue = Number(actor.system?.resources?.pp?.locked ?? 0);
  const isSustaining = Boolean(sustainingASpell) || hasSustained(getActiveSpells(actor));
  const casterLevel = Number(
    actor.system?.magic?.casterLevelValue ??
      actor.system?.magic?.casterLevel ??
      actor.system?.identity?.level ??
      0
  );
  const level = Number(actor.system?.identity?.level ?? 0);

  let hpHealed = 0;
  let ppRecovered = 0;
  const healingTranceRolls = [];
  const powerRecoveryRolls = [];
  const fatigueResults = [];

  const meditation = actor.system?.skills?.meditation;
  const meditationModifiers = meditation?.checkModifiers ?? [
    { label: meditation?.label ?? "Meditation", value: Number(meditation?.total ?? 0), type: "untyped" }
  ];

  if (activity === "active") {
    // "If you are active, the amount of power points that you regain
    // is one every three hours." No Natural Healing, no Fatigue
    // Recovery — both require actually resting, not just being
    // nearby while others do.
    ppRecovered = activePPRecovery(wholeHours);
  } else {
    for (let hour = 0; hour < wholeHours; hour++) {
      if (safeEnvironment) {
        let multiplier = 1;
        if (attemptHealingTrance) {
          const check = await TRGCheck.roll({
            actor,
            label: "Healing Trance",
            subtitle: `Level-based check, hour ${hour + 1} of rest`,
            type: "skill",
            // WHICH SKILL AND WHICH ACTION. Both are read by the conditional
            // engine, and neither was passed until 3.317.2 — see the note on
            // Power Recovery below, which is the same omission and the one
            // that was caught live.
            subject: "meditation",
            actionKey: "healingTrance",
            dc: levelDC(level),
            // "An Easy (DC +2) level-based check" — was rolling with no
            // difficulty (Medium) here, the path that actually applies the
            // healing. Power Recovery below is correctly Medium and stays so.
            difficulty: "easy",
            modifiers: [...meditationModifiers],
            toMessage: false
          });
          const degree = check.outcome?.degree?.key ?? "failure";
          multiplier = healingTranceMultiplier(degree);
          healingTranceRolls.push({ hour: hour + 1, degree, multiplier });
        }
        // Quick Recovery (Chapter 5): "You regain double the amount of
        // Hit Points when resting" — multiplies Natural Healing (and any
        // Healing Trance multiplier on top of it).
        const quickRecovery = Array.from(actor.items ?? []).some(
          (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "quick recovery"
        ) ? 2 : 1;
        hpHealed += naturalHealingHP(maxHP, 1) * multiplier * quickRecovery;
      }

      const fatigueResult = await rollFatigueRecovery(actor, { postCard: false });
      fatigueResults.push({ hour: hour + 1, ...fatigueResult });

      if (attemptPowerRecovery && !isSustaining) {
        const check = await TRGCheck.roll({
          actor,
          label: "Power Recovery",
          subtitle: `Level-based check, hour ${hour + 1} of rest`,
          type: "skill",
          // WHICH SKILL AND WHICH ACTION, and this is the whole of the
          // Pelora fix. The heritage's "+2 racial bonus to all Power
          // Recovery (Meditation) checks" is a conditional scoped
          // `actions: ["powerRecovery"]` with `auto: true` — correct, and
          // never asked, because this roll named neither. Caught live on
          // 3.317.1 by capturing the config this call actually passes:
          // `subject: null, actionKey: null`, and a modifier list holding
          // only "Wisdom and ranks" and the Fatigued penalty.
          //
          // Same shape as Forbidden Magic's -2 one release earlier: the
          // rule was authored properly and the roll it applies to never
          // said what it was. A conditional can only be as good as the
          // context handed to the check.
          subject: "meditation",
          actionKey: "powerRecovery",
          dc: levelDC(level),
          modifiers: [...meditationModifiers],
          toMessage: false
        });
        const degree = check.outcome?.degree?.key ?? "failure";
        let bonus = powerRecoveryBonus(degree, casterLevel,
          // What a feat adds on a good result (3.625.0) — see recovery.mjs.
          powerRecoveryExtras(Array.from(actor.appliedEffects ?? actor.effects ?? [])));
        // THE FIRST TIME EACH DAY (3.664.0; Inner Tempest's Centred Recovery:
        // "double the amount of PP restored"). See daily-firsts.mjs.
        const carriers = declarationCarriers(actor);
        if (hasDailyFirst(carriers, "powerRecovery", "multiplier") && !dailyFirstSpent(actor.flags?.[SYSTEM_ID], "powerRecovery")) {
          bonus *= dailyFirstMultiplier(carriers, "powerRecovery", false);
          await actor.setFlag(SYSTEM_ID, DAILY_FIRSTS_FLAG, { ...(actor.getFlag(SYSTEM_ID, DAILY_FIRSTS_FLAG) ?? {}), powerRecovery: true });
        }
        powerRecoveryRolls.push({ hour: hour + 1, degree, bonus });
        ppRecovered += bonus;
      }
    }

    if (!isSustaining) {
      if (activity === "resting") {
        ppRecovered += restingPPRecovery(casterLevel, wholeHours);
      } else if (activity === "sleeping") {
        ppRecovered += sleepingPPRecovery(maxPP, wholeHours);
        const excessHours = excessSleepHoursAsResting(wholeHours);
        if (excessHours > 0) ppRecovered += restingPPRecovery(casterLevel, excessHours);
      }
    }
  }

  const hp = actor.system?.resources?.hp;
  const pp = actor.system?.resources?.pp;
  const oldHPValue = Number(hp?.value ?? 0);
  const oldPPValue = Number(pp?.value ?? 0);
  // Rest is non-magical healing, which "has no effect on you" while Dying
  // (Graham, 13 Aug 2026). Power Point recovery is untouched — the rule is
  // about hit points, and a dying caster's reserves refill regardless.
  const dyingBlocksHealing = Boolean(actor.hasCondition?.("dying"));
  const newHPValue = dyingBlocksHealing
    ? oldHPValue
    : Math.min(maxHP, oldHPValue + hpHealed);
  const newPPValue = Math.min(Math.max(0, maxPP - lockedPPValue), oldPPValue + ppRecovered);

  const updates = {};
  if (newHPValue !== oldHPValue) updates["system.resources.hp.value"] = newHPValue;
  if (newPPValue !== oldPPValue) updates["system.resources.pp.value"] = newPPValue;
  // NATURAL RECOVERY DOES NOT WAKE A SLEEPER (3.621.0): "Receiving healing,
  // barring the natural recovery gained through rest". Marked on the write,
  // so the condition watcher can tell it from a potion.
  if (Object.keys(updates).length) await actor.update(updates, { trgRest: true });

  // SOUL DRAIN (Appendix 2): "Each time you get a full night's rest, you
  // are healed of 5 Soul Drain damage."
  //
  // WIRED AT 3.363.0, AND IT HAD NEVER FIRED. `soulDrainRecovery` was
  // written, tested and called by nothing, so Soul Drain only ever went
  // down when a human edited the condition by hand — and because Soul
  // Drain permanently reduces maximum HP, a forgotten subtraction leaves
  // a character quietly weakened for the rest of the campaign. The
  // dying workflow's own hint still told the GM to subtract it manually.
  // Found by tools/verify-rules-have-callers.mjs.
  //
  // A TRANCE COUNTS, because `wholeHours` is already the scaled figure —
  // an Elf's four hours pay a full night here exactly as they do for
  // Power Points and Natural Healing.
  let soulDrainHealed = 0;
  const soulDrainBefore = Number(actor.getConditionValue?.("soulDrain") ?? 0);
  // DREAM LICHEN (page 180; 3.577.0): "A creature that sleeps for at least
  // 8 hours with a dose of dream lichen in contact with its body ... can
  // attempt a new saving throw against a single curse or mind-affecting
  // effect ... Additionally, the user automatically doubles the amount of
  // the Soul Drain condition they remove after a night's rest." The herb
  // leaves a marker; a full night's sleep spends it.
  let dreamLichen = false;
  if (activity === "sleeping" && wholeHours >= FULL_NIGHT_HOURS) {
    const { consumeMarker } = await import("../magic/markers.mjs");
    dreamLichen = await consumeMarker(actor, "dreamLichen");
  }
  if (soulDrainBefore > 0 && activity === "sleeping" && wholeHours >= FULL_NIGHT_HOURS) {
    const after = dreamLichen
      ? soulDrainRecovery(soulDrainRecovery(soulDrainBefore))
      : soulDrainRecovery(soulDrainBefore);
    if (after !== soulDrainBefore) {
      // Written through `setSoulDrain`, not by toggling the condition
      // here: it is the one place that keeps the condition, the max-HP
      // consequence and the card in step.
      await setSoulDrain(actor, after);
      soulDrainHealed = soulDrainBefore - after;
    }
  }

  // DOOMED (Appendix 2): "decreases by 1 each full night's rest" — the
  // same shape, unwired for the same reason, and found by the comment in
  // `setDoomed` that explained why it had been left out.
  let doomedHealed = 0;
  const doomedBefore = Number(actor.getConditionValue?.("doomed") ?? 0);
  if (doomedBefore > 0 && activity === "sleeping" && wholeHours >= FULL_NIGHT_HOURS) {
    const after = doomedRecovery(doomedBefore);
    if (after !== doomedBefore) {
      await setDoomed(actor, after);
      doomedHealed = doomedBefore - after;
    }
  }

  // A FULL NIGHT CLEARS FATIGUE (3.621.0; block 39's A5): "If you have a
  // full nights rest you automatically reduce your fatigue value to 0." After
  // the hourly saves, which still say what each hour did. The page leaves
  // the GM "the final say", naming food and water — so a night without
  // either does not clear it (sustenance-workflow keeps that clock).
  let fatigueCleared = 0;
  if (activity === "sleeping" && wholeHours >= FULL_NIGHT_HOURS && ate && drank) {
    const left = Number(actor.getConditionValue?.("fatigued") ?? 0);
    if (left > 0) {
      await actor.toggleStatusEffect("fatigued", { active: false });
      fatigueCleared = left;
    }
  }

  // PERSISTENCE, AND THE INJURY DAY CLOCK (page 193/194; the block-19
  // audit's D7 and D9, Graham's R7 and R9 of 21 September 2026).
  //
  // FR ends on "eight hours' sleep"; UH ends when the creature is at full
  // HP and has then rested ten minutes — the non-magical half of the
  // sentence, which is exactly what a rest is. The day clock is separate:
  // a day of rest moves a treated injury toward its next band, and
  // "fighting or exerting themselves will prevent any recovery for that
  // day", which is why only Resting and Sleeping count.
  const { settlePersistence } = await import("../injury-workflow.mjs");
  const persistenceCleared = await settlePersistence(actor, {
    fullHP: Number(newHPValue) >= Number(actor.system?.resources?.hp?.max ?? 0)
      && Number(actor.system?.resources?.hp?.max ?? 0) > 0,
    restMinutes: activity === "active" ? 0 : realHours * 60,
    sleepHours: activity === "sleeping" ? wholeHours : 0
  });

  const { advanceInjuryRest } = await import("../injury-workflow.mjs");
  const injuryProgress = activity === "active"
    ? []
    : await advanceInjuryRest(actor, { hours: realHours });

  /*
   * THE REST IS RECORDED, so Daily Preparation can ask whether one
   * happened (3.582.0; the pages 221-230 audit's D9, Graham's R13).
   * Page 229: "To use daily preparation you must have fully rested
   * (typically 8 hours)." Nothing asked, because nothing knew — a rest
   * changed hit points and fatigue and left no trace of its own length.
   *
   * `benefitHours` IS WHAT IS STAMPED, NOT `realHours`. A tranced Elf
   * rests four hours and receives a full night; the precondition is
   * about having rested fully, which is the benefit figure, and stamping
   * the wall-clock number would refuse them their own racial trait.
   */
  await actor.setFlag(SYSTEM_ID, "lastRest", {
    hours: wholeHours,
    at: Number(globalThis.game?.time?.worldTime ?? 0)
  });

  /*
   * A DAY PASSES (3.582.1; page 230's two clocks, Graham's R12).
   *
   * ONLY ON A FULL NIGHT. A day passing is not a Foundry event, and a
   * full rest is the moment the table agrees one has — gating on
   * anything shorter would starve a party that caught its breath four
   * times in an afternoon. The same `wholeHours >= restHours` test the
   * daily-preparation gate uses, for the same reason.
   */
  const sustenanceLines = [];
  if (wholeHours >= restHours) {
    const { advanceSustenanceDay } = await import("../sustenance-workflow.mjs");
    sustenanceLines.push(...await advanceSustenanceDay(actor, { ate, drank }));
  }

  return {
    sustenanceLines,
    actor,
    persistenceCleared,
    injuryProgress,
    // The hours the TABLE spent, not the hours the benefits were computed
    // from — a tranced Elf rested four, and the summary card must say four
    // or the party's clock drifts. `benefitHours` carries the other number
    // so the card can explain the difference rather than hide it.
    hours: tableHours,
    benefitHours: wholeHours,
    haunted,
    tranced: trance > 1,
    restHours,
    activity,
    hpHealedActual: newHPValue - oldHPValue,
    ppRecoveredActual: newPPValue - oldPPValue,
    healingTranceRolls,
    powerRecoveryRolls,
    fatigueResults,
    fatigueCleared,
    soulDrainHealed,
    soulDrainRemaining: Math.max(0, soulDrainBefore - soulDrainHealed),
    doomedHealed,
    doomedRemaining: Math.max(0, doomedBefore - doomedHealed),
    dreamLichen
  };
}

function summaryLine(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/** "injured" -> "Injured", for the injury lines on the summary card. */
function label(key) {
  return String(key ?? "").charAt(0).toUpperCase() + String(key ?? "").slice(1);
}

/**
 * Works out who the Rest dialog should offer, in order of specificity.
 *
 * Resting is party-wide (see this file's header), so the default scope
 * is the party proper — every player-owned character. Two other tiers
 * exist around it because that one rule alone left the macro unusable:
 *
 * 1. Selected tokens win outright, so a single character, or an NPC
 *    ally or mount the party is resting alongside, can be rested on
 *    its own without first reassigning ownership.
 * 2. Player-owned characters — the intended default.
 * 3. Every character the current user owns. `hasPlayerOwner` is only
 *    ever true when a non-GM User actually exists *and* owns the
 *    actor, so a GM building or testing a world solo — no player users
 *    created yet — matched nothing at all under tier 2 and got a bare
 *    "no player characters" warning with no way forward.
 *
 * @returns {{actors: Actor[], scopeNote: string}}
 */
export function restCandidates() {
  const byName = (a, b) => a.name.localeCompare(b.name);

  const selected = [
    ...new Set(
      (canvas?.tokens?.controlled ?? [])
        .map((token) => token.actor)
        .filter((actor) => actor && ["character", "npc"].includes(actor.type))
    )
  ].sort(byName);
  if (selected.length) {
    return {
      actors: selected,
      scopeNote: `Resting the ${selected.length} selected token(s). Deselect all to rest the whole party instead.`
    };
  }

  const playerOwned = game.actors
    .filter((actor) => actor.type === "character" && actor.hasPlayerOwner)
    .sort(byName);
  if (playerOwned.length) {
    return {
      actors: playerOwned,
      scopeNote: "Resting every player-owned character. Select token(s) first to rest a subset, or an NPC."
    };
  }

  const owned = game.actors
    .filter((actor) => actor.type === "character" && actor.isOwner)
    .sort(byName);
  return {
    actors: owned,
    scopeNote:
      "No character in this world is owned by a player user, so every character is listed. Select token(s) first to rest a subset, or an NPC."
  };
}

/**
 * Opens the GM-facing Rest dialog: a form listing every player-owned
 * character, with shared hours/safe-environment settings and
 * per-actor activity/toggle controls, feeding straight into
 * performRest. This is the entry point the Rest macro itself calls.
 *
 * @returns {Promise<Array|null>} The rest summaries, or null if
 *   cancelled.
 */
export async function openRestDialog() {
  const { DialogV2 } = foundry.applications.api;
  const { actors, scopeNote } = restCandidates();

  if (!actors.length) {
    ui.notifications.warn(
      "No characters found to rest. Create a character actor, or select the token(s) you want to rest."
    );
    return null;
  }

  const rows = actors
    .map(
      (actor) => `
        <tr data-actor-id="${actor.id}">
          <td><label><input type="checkbox" name="include-${actor.id}" checked> ${actor.name}</label></td>
          <td>
            <select name="activity-${actor.id}">
              <option value="resting" selected>Resting</option>
              <option value="sleeping">Sleeping</option>
              <option value="active">Active</option>
            </select>
          </td>
          <td><label><input type="checkbox" name="healingTrance-${actor.id}"> Healing Trance</label></td>
          <td><label><input type="checkbox" name="powerRecovery-${actor.id}"> Power Recovery</label></td>
          <td><label><input type="checkbox" name="sustaining-${actor.id}"> Sustaining a Spell</label></td>
          <td><label><input type="checkbox" name="ate-${actor.id}" checked> Ate</label></td>
          <td><label><input type="checkbox" name="drank-${actor.id}" checked> Drank</label></td>
        </tr>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Rest", icon: "fa-solid fa-bed" },
    classes: ["trg-prime"],
    position: { width: 640 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="notes" style="margin:0 0 6px">${scopeNote}</p>
        <div class="form-group">
          <label for="trg-rest-hours">Hours resting</label>
          <input id="trg-rest-hours" type="number" name="hours" value="1" min="1">
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="safeEnvironment" checked> Safe environment (required for Natural Healing)</label>
        </div>
        <table style="width:100%;text-align:left;font-size:0.85rem">
          <thead><tr><th>Include</th><th>Activity</th><th></th><th></th><th></th><th></th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
    buttons: [
      {
        action: "rest",
        label: "Rest",
        icon: "fa-solid fa-bed",
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

  const entries = actors
    .filter((actor) => result[`include-${actor.id}`])
    .map((actor) => ({
      actor,
      activity: result[`activity-${actor.id}`],
      attemptHealingTrance: Boolean(result[`healingTrance-${actor.id}`]),
      attemptPowerRecovery: Boolean(result[`powerRecovery-${actor.id}`]),
      sustainingASpell: Boolean(result[`sustaining-${actor.id}`]),
      // FOOD AND WATER (3.582.1; page 230, Graham's R12). Ticked by
      // default, because the common case is a party with rations — the
      // GM unticks the day the packs ran out.
      ate: Boolean(result[`ate-${actor.id}`]),
      drank: Boolean(result[`drank-${actor.id}`])
    }));

  if (!entries.length) {
    ui.notifications.warn("No characters selected to rest.");
    return null;
  }

  return performRest(entries, {
    hours: Number(result.hours ?? 1),
    safeEnvironment: Boolean(result.safeEnvironment)
  });
}

/**
 * Builds and posts the one consolidated card for an actor's rest
 * summary, per Graham directly.
 *
 * @param {object} summary As returned by performRestForActor.
 * @returns {Promise<ChatMessage>}
 */
export async function postRestSummaryCard(summary) {
  const { actor, hours, activity, hpHealedActual, ppRecoveredActual, healingTranceRolls, powerRecoveryRolls, fatigueResults, soulDrainHealed, soulDrainRemaining, doomedHealed, doomedRemaining } = summary;
  const lines = [
    summaryLine(`Rested <strong>${hours}</strong> hour${hours === 1 ? "" : "s"} (${activity}).`)
  ];
  // Say so when the two clocks differ, rather than posting a night's worth
  // of healing under a four-hour heading and leaving the table to wonder.
  if (summary.tranced) {
    lines.push(summaryLine(
      `<em>Trance: ${summary.restHours} hours count as a full ${FULL_NIGHT_HOURS}-hour night — ` +
      `benefits below are for <strong>${summary.benefitHours}</strong> hours.</em>`
    ));
  }

  // SAID FIRST, because it is the reason every line below it is missing.
  if (summary.haunted) {
    lines.push(summaryLine(
      "<strong>Haunted</strong>: a spirit torments them through every hour of it — no rest or "
      + "respite, and <strong>nothing is recovered</strong> (Speak With Dead)."
    ));
  }
  if (hpHealedActual > 0) lines.push(summaryLine(`Natural Healing: <strong>+${hpHealedActual} HP</strong>.`));
  if (ppRecoveredActual > 0) lines.push(summaryLine(`PP Recovery: <strong>+${ppRecoveredActual} PP</strong>.`));
  // NAMED ON THE CARD, because it is the one benefit here that raises
  // maximum HP rather than current, and a number that moves on the sheet
  // with nothing saying why is how a table stops trusting the automation.
  if (soulDrainHealed > 0) {
    lines.push(summaryLine(
      `Soul Drain: healed <strong>${soulDrainHealed}</strong>` +
      `${soulDrainRemaining > 0 ? ` — ${soulDrainRemaining} remaining` : " — none remaining"}.`
    ));
  }
  if (summary.dreamLichen) {
    lines.push(summaryLine(
      "<strong>Dream Lichen</strong>: Soul Drain healed at double the rate, and a new saving throw "
      + "may be attempted against a single curse or mind-affecting effect."
    ));
  }
  if (doomedHealed > 0) {
    lines.push(summaryLine(
      `Doomed: reduced by <strong>${doomedHealed}</strong>` +
      `${doomedRemaining > 0 ? ` — Doomed ${doomedRemaining} remaining` : " — no longer Doomed"}.`
    ));
  }

  // THE INJURY CLOCK (page 194; R7) and the two Persistence kinds a rest
  // ends (page 193; R9). Printed here rather than on cards of their own:
  // a rest already posts one consolidated summary, per Graham.
  for (const cleared of summary.persistenceCleared ?? []) {
    lines.push(summaryLine(`<strong>Injury ended</strong> — <em>${cleared}</em>.`));
  }
  for (const row of summary.injuryProgress ?? []) {
    lines.push(summaryLine(row.stepped
      ? `<strong>${label(row.condition)} ${row.from} → ${row.to || "healed"}</strong> `
        + `after ${row.needed} day${row.needed === 1 ? "" : "s"} of rest.`
      : `${label(row.condition)} ${row.from}: <strong>${row.days.toFixed(2)}</strong> of `
        + `${row.needed} day${row.needed === 1 ? "" : "s"} of rest.`));
  }

  if (healingTranceRolls.length) {
    const best = healingTranceRolls.filter((r) => r.multiplier > 1).length;
    lines.push(summaryLine(`Healing Trance attempted ${healingTranceRolls.length} time(s), boosted healing on ${best}.`));
  }
  if (powerRecoveryRolls.length) {
    const totalBonus = powerRecoveryRolls.reduce((sum, r) => sum + r.bonus, 0);
    lines.push(summaryLine(`Power Recovery attempted ${powerRecoveryRolls.length} time(s), +${totalBonus} PP from it.`));
  }
  if (fatigueResults.length) {
    const netFatigue = fatigueResults.reduce((sum, r) => sum + r.delta, 0);
    if (netFatigue < 0) lines.push(summaryLine(`Fatigue Recovery: net <strong>-${-netFatigue}</strong> over the rest.`));
    else if (netFatigue > 0) lines.push(summaryLine(`Fatigue Recovery: net <strong>+${netFatigue}</strong> over the rest.`));
    else lines.push(summaryLine("Fatigue held steady throughout the rest."));
  }
  if (summary.fatigueCleared) {
    lines.push(summaryLine(`A full night's rest: the remaining <strong>Fatigue ${summary.fatigueCleared}</strong> is cleared.`));
  }
  // FOOD AND WATER (3.582.1). Only a full night produces these, so a
  // one-hour breather's card is unchanged.
  for (const said of summary.sustenanceLines ?? []) lines.push(summaryLine(said));

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Rest — Summary</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * Runs a full rest period for every selected actor, posting one
 * consolidated summary card each.
 *
 * @param {Array} entries Each `{actor, activity, attemptHealingTrance,
 *   attemptPowerRecovery, sustainingASpell}`.
 * @param {object} shared `{hours, safeEnvironment}` — shared across
 *   the whole rest period.
 * @returns {Promise<Array>} The summaries, in case a caller wants them.
 */
export async function performRest(entries, shared) {
  const summaries = [];
  for (const entry of entries) {
    const summary = await performRestForActor(entry.actor, { ...shared, ...entry });
    await postRestSummaryCard(summary);
    summaries.push(summary);
  }
  return summaries;
}
