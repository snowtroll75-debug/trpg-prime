import { TRGCheck } from "../dice/check.mjs";
import { levelDC } from "../dice/resolution.mjs";
import { exhaustionCheckModifiers } from "../feats.mjs";
import {
  combatDurationModifier,
  deprivationModifier,
  EXHAUSTION_CRITICAL_BONUS,
  exhaustionFatigue,
  exhaustionLoadPenalty,
  exhaustionSave,
  fatigueRecoveryDelta,
  fatigueStatus
} from "../exhaustion.mjs";
import { encumbranceSteps, weightAllowance } from "../encumbrance.mjs";
import { ENVIRONMENTAL_DAMAGE, coldProtection } from "../environment.mjs";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "trg-prime";
const RESOLVE_FLAG = "exhaustionResolve";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/** An unexpired "Exhaustion Resolve" bonus from a recent Critical result. */
function activeResolveBonus(actor) {
  const effect = actor.effects.find((e) => e.getFlag(SYSTEM_ID, RESOLVE_FLAG));
  if (!effect) return 0;
  // Foundry expires seconds-duration effects lazily; treat a present, not
  // yet swept, effect as still active — its own duration governs removal.
  return Number(effect.getFlag(SYSTEM_ID, RESOLVE_FLAG)) || 0;
}

/**
 * Roll an Exhaustion Check: an easy (DC -2) level-based Fortitude save.
 * Existing Fatigue and Injury already apply automatically through the
 * ordinary condition-modifier pipeline; this adds any recent Critical
 * bonus and whatever extra modifier the caller supplies (combat-duration
 * creep, deprivation) as a labelled situational modifier.
 *
 * @param {Actor} actor
 * @param {object} [options]
 * @param {number} [options.modifier] Combined DC/penalty adjustment from
 *   combatDurationModifier/deprivationModifier, applied as a modifier so a
 *   positive value here is a bonus and a negative value a penalty.
 * @param {string} [options.activity] A short label for the chat card.
 */
export async function rollExhaustionCheck(actor, { modifier = 0, activity = "", save = "fortitude", dc = null, environment = "" } = {}) {
  // WHICH SAVE (page 195; the block-19 audit's D18, Graham's R18 of 21
  // September 2026). Fortitude is what the page prints and what this
  // defaults to; the GM may call for Will instead, chosen in the prompt.
  const saveKey = exhaustionSave(save);
  const saveData = actor.system?.combat?.saves?.[saveKey];
  const saveLabel = saveKey === "will" ? "Will" : "Fortitude";
  const modifiers = [...(saveData?.checkModifiers ?? [
    { label: saveLabel, value: Number(saveData?.total ?? 0), type: "untyped" }
  ])];

  // ACP AND ENCUMBRANCE (page 195's own modifier table). The Armour Check
  // Penalty reaches Dexterity- and Strength-based skills and no save, so
  // it had never touched this check; encumbrance had no route to it at
  // all. Both are read from what the sheet already derived.
  const load = exhaustionLoadPenalty({
    acp: Number(actor.system?.combat?.acp?.total ?? 0),
    // THE SHEET'S OWN NUMBERS (`system.encumbrance`), which
    // prepareEncumbrance already derived with Hauler and a Backpack folded
    // in — re-deriving them here is how the two would come to disagree.
    encumbranceSteps: encumbranceSteps(
      Number(actor.system?.encumbrance?.value ?? 0),
      Number(actor.system?.encumbrance?.max
        ?? weightAllowance(Number(actor.system?.attributes?.strength?.total ?? 0))))
  });
  if (load) {
    modifiers.push({ label: "ACP / Encumbrance", value: load, type: "untyped" });
  }

  const resolve = activeResolveBonus(actor);
  if (resolve) {
    modifiers.push({
      label: "Recent success (Chapter 7)",
      value: resolve,
      type: "circumstance"
    });
  }
  // Feat bonuses to exhaustion checks (Inner Reserve +2, Mettle +4 —
  // class stacks, so both together are +6). Map-driven; later feats
  // extend EXHAUSTION_CHECK_BONUS_FEATS rather than this code.
  modifiers.push(...exhaustionCheckModifiers(
    Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name)
  ));
  if (modifier) {
    modifiers.push({ label: "Situational", value: modifier, type: "untyped" });
  }

  // THE COLD-WEATHER GEAR, IN THE COLD (3.620.0; block 38's A4). Furs,
  // Winter clothing and the Bedroll are conditionals offered in the check
  // dialog, which this roll never opens — so they were unreachable from the
  // one check they exist for. In a cold environment the bonus plainly
  // applies: the best one is taken (item bonuses do not stack).
  const row = ENVIRONMENTAL_DAMAGE[environment] ?? null;
  if (row?.cold) {
    const gear = coldProtection(actor.system?.combat?.runeConditionals ?? [], saveKey);
    if (gear) modifiers.push({ label: gear.label, value: gear.value, type: gear.type });
  }

  // THE GM'S DC (3.620.0; Chapter 12, page 396, Graham's R13): "The DC
  // should be set according to the severity of the condition and the
  // players' level." Without one, Chapter 7's Easy level-based save.
  const gmDC = Math.floor(Number(dc) || 0) > 0 ? Math.floor(Number(dc)) : null;
  const check = await TRGCheck.roll({
    actor,
    label: row ? `Exhaustion Check — ${row.label}` : "Exhaustion Check",
    subject: saveKey,
    subtitle: activity || (gmDC ? `${saveLabel} save, the GM's DC` : `Easy (DC -2) level-based ${saveLabel} save`),
    type: "save",
    dc: gmDC ?? levelDC(Number(actor.system?.identity?.level ?? 0)),
    ...(gmDC ? {} : { difficulty: "easy" }),
    modifiers
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const fatigue = exhaustionFatigue(degree);

  const lines = [];
  if (fatigue > 0) {
    const current = actor.getConditionValue?.("fatigued") ?? 0;
    await actor.toggleStatusEffect("fatigued", { value: current + fatigue });
    lines.push(line(`Gains <strong>${fatigue} Fatigue</strong>.`));
  } else {
    lines.push(line("No Fatigue gained."));
  }

  if (degree === "critical" || degree === "heroic") {
    await actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: "Exhaustion Resolve",
        img: "icons/svg/upgrade.svg",
        duration: { seconds: EXHAUSTION_CRITICAL_BONUS.durationSeconds },
        flags: { [SYSTEM_ID]: { [RESOLVE_FLAG]: EXHAUSTION_CRITICAL_BONUS.value } }
      }
    ]);
    lines.push(
      line(
        `<strong>+${EXHAUSTION_CRITICAL_BONUS.value} circumstance</strong> to further exhaustion checks for the next 10 minutes.`
      )
    );
  }

  // THE ENVIRONMENT'S DAMAGE (R13): the row's Failure column on a failure,
  // its Fumble column on a fumble or blunder — on top of the Fatigue above.
  if (row) {
    const { applyEnvironment } = await import("../environment-workflow.mjs");
    lines.push(...await applyEnvironment(actor, environment, degree));
  }

  await postCard(actor, "Exhaustion Check — Result", lines);
  return { check, fatigue };
}

/**
 * Prompt for the situational pieces (combat duration, deprivation) before
 * rolling. The interval and existence of these modifiers are the table's
 * call — this only computes the numbers once told which apply.
 */
export async function promptExhaustionCheck(actor) {
  const result = await DialogV2.wait({
    window: { title: "Exhaustion Check", icon: "fa-solid fa-person-running" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Easy (DC -2) level-based save unless the GM sets a DC. Existing Fatigue, Injury, Armour Check Penalty and Encumbrance already apply automatically (page 195). An environment adds its damage on a failure or fumble (Chapter 12), and in the cold the best cold-weather gear counts.</p>
        <div class="form-group">
          <label for="trg-ec-rounds">Combat just ended — total rounds (0 if not applicable)</label>
          <input id="trg-ec-rounds" type="number" name="rounds" value="0" min="0">
        </div>
        <div class="form-group">
          <label for="trg-ec-nosleep">Days with no sleep</label>
          <input id="trg-ec-nosleep" type="number" name="daysNoSleep" value="0" min="0">
        </div>
        <div class="form-group">
          <label for="trg-ec-halfsleep">Days with half sleep (4 hours)</label>
          <input id="trg-ec-halfsleep" type="number" name="daysHalfSleep" value="0" min="0">
        </div>
        <div class="form-group">
          <label for="trg-ec-nowater">Hours (after a day) with no water</label>
          <input id="trg-ec-nowater" type="number" name="hoursNoWaterAfterDay" value="0" min="0">
        </div>
        <div class="form-group">
          <label for="trg-ec-nofood">Days with no food</label>
          <input id="trg-ec-nofood" type="number" name="daysNoFood" value="0" min="0">
        </div>
        <div class="form-group">
          <label for="trg-ec-env">Environment <span class="hint">(Chapter 12)</span></label>
          <select id="trg-ec-env" name="environment">
            <option value="" selected>None</option>
            ${Object.entries(ENVIRONMENTAL_DAMAGE).map(([key, row]) => `<option value="${key}">${row.label}${row.failure ? ` — ${row.type} ${row.failure}/${row.fumble}` : " — suffocation"}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label for="trg-ec-dc">GM DC <span class="hint">(blank: Easy, level-based)</span></label>
          <input id="trg-ec-dc" type="number" name="dc" min="1" placeholder="Easy">
        </div>
        <div class="form-group">
          <label for="trg-ec-save">Save</label>
          <select id="trg-ec-save" name="save">
            <option value="fortitude" selected>Fortitude (as printed)</option>
            <option value="will">Will (GM's call)</option>
          </select>
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

  const rounds = Number(result.rounds || 0);
  const combatPenalty = rounds ? -combatDurationModifier(rounds) : 0;
  const deprivation = deprivationModifier({
    daysNoSleep: Number(result.daysNoSleep || 0),
    daysHalfSleep: Number(result.daysHalfSleep || 0),
    hoursNoWaterAfterDay: Number(result.hoursNoWaterAfterDay || 0),
    daysNoFood: Number(result.daysNoFood || 0)
  });

  return rollExhaustionCheck(actor, {
    modifier: combatPenalty + deprivation,
    save: result.save,
    dc: Number(result.dc) || null,
    environment: result.environment || ""
  });
}

/**
 * Fatigue Recovery (Chapter 8, Rest & Sleep): "After every hour of rest,
 * you make a Level based Fortitude Saving Throw to recover from
 * fatigue." A level-based DC, no difficulty adjustment (unlike the Easy
 * Exhaustion Check), against the character's own level.
 */
export async function rollFatigueRecovery(actor, { postCard = true } = {}) {
  const fortitude = actor.system?.combat?.saves?.fortitude;
  const modifiers = fortitude?.checkModifiers ?? [
    { label: "Fortitude", value: Number(fortitude?.total ?? 0), type: "untyped" }
  ];

  const check = await TRGCheck.roll({
    actor,
    label: "Fatigue Recovery",
    subject: "fortitude",
    subtitle: "Level-based Fortitude save, after an hour of rest",
    type: "save",
    dc: levelDC(Number(actor.system?.identity?.level ?? 0)),
    modifiers: [...modifiers],
    toMessage: postCard
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const delta = fatigueRecoveryDelta(degree);
  const current = actor.getConditionValue?.("fatigued") ?? 0;
  const next = Math.max(0, current + delta);

  if (delta !== 0) {
    if (next > 0) await actor.toggleStatusEffect("fatigued", { value: next });
    else await actor.toggleStatusEffect("fatigued", { active: false });
  }

  if (postCard) {
    const lines = [];
    if (delta < 0) lines.push(`<p style="margin:2px 0">Fatigue reduces by <strong>${-delta}</strong>, to <strong>${next}</strong>.</p>`);
    else if (delta > 0) lines.push(`<p style="margin:2px 0">Fatigue increases by <strong>${delta}</strong>, to <strong>${next}</strong>.</p>`);
    else lines.push(`<p style="margin:2px 0">Fatigue holds steady at <strong>${next}</strong>.</p>`);

    const status = fatigueStatus(next);
    if (status === "unconscious") {
      lines.push('<p style="margin:2px 0"><strong>Fatigue 10+ — the GM should apply Unconscious.</strong></p>');
    } else if (status === "dead") {
      lines.push('<p style="margin:2px 0"><strong>Fatigue 20+ — the GM should treat this as fatal.</strong></p>');
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Fatigue Recovery — Result</h3></div></header>${lines.join("")}</div>`
    });
  }

  return { check, delta, next };
}
