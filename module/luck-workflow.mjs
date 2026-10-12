import { BIAS, TRGCheck } from "./dice/check.mjs";
import {
  LUCK_CHECK_TYPES, applyLuckReduction, hasHalflingLuck, injuryRegainsLuck, luckCheckDC, luckCheckOutcome,
  luckEligibility
} from "./luck.mjs";

const SYSTEM_ID = "trg-prime";
/** The last round luck was used, in combat: {combatId, round}. */
const SPENT_FLAG = "luckSpent";
/** Luck armed from the sheet for the next skill check, attack or save. */
const ARMED_FLAG = "luckArmed";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

const luckEnabled = () => Boolean(globalThis.game?.settings?.get?.(SYSTEM_ID, "enableLuck"));

function currentRound() {
  const combat = globalThis.game?.combat;
  return combat?.started ? { combatId: combat.id, round: combat.round } : null;
}

/** The luck score's DC for this actor (Halfling Luck: −2). */
function dcFor(actor) {
  const halfling = hasHalflingLuck(Array.from(actor?.items ?? []).map((i) => i.name));
  return { dc: luckCheckDC(halfling), halfling };
}

/**
 * Roll the luck check itself: d20 + luck score against DC 20.
 *
 * ITS OWN CHECK TYPE, "luck" (3.624.0, block 40's A8). As a `generic` check
 * it picked up and SPENT automatic conditionals and pending modifiers meant
 * for the check luck was about to change. `conditionalsResolved` keeps both
 * away; no Cutting Words, Seer's Vision or conviction reads a "luck" check.
 *
 * OPEN-ENDED LIKE EVERY OTHER CHECK (R13): the world's setting decides. It
 * was forced off, and at luck 10 or more a Fumble could not happen.
 */
async function rollTheLuckCheck(actor, forLabel = "") {
  const { dc, halfling } = dcFor(actor);
  const currentLuck = Number(actor.system?.resources?.luck?.value ?? 0);
  const check = await TRGCheck.roll({
    actor,
    label: "Luck Check",
    subtitle: `DC ${dc}${halfling ? " (Halfling Luck: −2)" : ""} — current luck ${currentLuck}${forLabel ? ` — for ${forLabel}` : ""}`,
    type: "luck",
    dc,
    conditionalsResolved: true,
    allowConviction: false,
    modifiers: [{ label: "Luck Score", value: currentLuck, type: "untyped" }]
  });
  const degree = check.outcome?.degree?.key ?? "failure";
  const outcome = luckCheckOutcome(degree);
  const newLuck = applyLuckReduction(currentLuck, outcome.reduceLuck);
  if (newLuck !== currentLuck) await actor.update({ "system.resources.luck.value": newLuck });
  return { check, outcome, currentLuck, newLuck };
}

/**
 * LUCK ON THE CHECK ITSELF (3.624.0, R11 and R12). Called by TRGCheck.roll
 * before the dice, when the dialog's "Use Luck" box was ticked or luck was
 * armed from the sheet. Rolls the luck check and changes THIS check:
 *
 *   - Success or Critical: Advantage (a fortune effect);
 *   - Failure: nothing;
 *   - Fumble: the worse of Disadvantage and −5, decided on the check's own
 *     dice (`check.luckFumble`, read in TRGCheck's d20 roll).
 *
 * Marks the check (`luckUsed`, `chanceUsed`) so no other fortune or Chance
 * effect and no Conviction spend touches it, and stamps the round.
 *
 * @returns {Promise<string[]>} lines for the check's card
 */
export async function applyLuckToCheck(check, { requested = false } = {}) {
  const actor = check?.actor;
  if (!actor || !LUCK_CHECK_TYPES.includes(check.type) || check.flat) return [];
  const armed = Boolean(actor.getFlag?.(SYSTEM_ID, ARMED_FLAG));
  if (!requested && !armed) return [];
  if (armed) await actor.unsetFlag(SYSTEM_ID, ARMED_FLAG);
  const verdict = luckEligibility({
    enabled: luckEnabled(),
    checkType: check.type,
    flat: check.flat,
    spent: actor.getFlag?.(SYSTEM_ID, SPENT_FLAG) ?? null,
    current: currentRound(),
    convictionTouched: Boolean(check.convictionAdvantage),
    chanceUsed: check.chanceUsed ?? ""
  });
  if (!verdict.ok) {
    ui.notifications?.warn?.(`Luck: ${verdict.reason}`);
    return [`Luck not used — ${verdict.reason}`];
  }
  const round = currentRound();
  if (round) await actor.setFlag(SYSTEM_ID, SPENT_FLAG, round);
  const { outcome, currentLuck, newLuck } = await rollTheLuckCheck(actor, check.label);
  check.luckUsed = true;
  check.chanceUsed = "Luck";
  const score = `luck ${currentLuck} → ${newLuck}`;
  if (outcome.success) {
    const { resolveBias } = await import("./conditionals.mjs");
    check.bias = resolveBias(check.bias, ["advantage"], BIAS);
    check.modifiers.push({ label: "Luck: fortune (Advantage)", value: 0, type: "untyped" });
    return [`Luck is on your side — fortune: Advantage (${score}).`];
  }
  if (outcome.penalizeCheck) {
    check.luckFumble = true;
    return [`Luck fumbled — this check takes the worse of Disadvantage and −5 (${score}).`];
  }
  return [`Luck deserted you — the check is unchanged (${score}).`];
}

/**
 * THE SHEET'S LUCK BUTTON (3.624.0). Arms luck for the character's next
 * skill check, attack or saving throw — the only way to reach an attack,
 * which opens no dialog — or rolls a luck check now for a use the table
 * adjudicates by hand.
 */
export async function rollLuckCheck(actor) {
  if (!luckEnabled()) {
    ui.notifications.warn("Luck (Appendix 5) is an optional rule — enable it in the system's Game Settings first.");
    return null;
  }
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  const armed = Boolean(actor.getFlag?.(SYSTEM_ID, ARMED_FLAG));
  const choice = DialogV2 ? await DialogV2.wait({
    window: { title: "Luck" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime"><p>Luck applies fortune to a skill check, an attack or a saving throw: `
      + `d20 + your luck score against DC ${dcFor(actor).dc}, up to once per round.</p>`
      + `${armed ? "<p><strong>Luck is already armed for your next check.</strong></p>" : ""}</div>`,
    buttons: [
      { action: armed ? "disarm" : "arm", label: armed ? "Disarm" : "Use on my next check", default: true },
      { action: "now", label: "Roll now (by hand)" },
      { action: "close", label: "Close" }
    ],
    rejectClose: false
  }) : "now";
  if (choice === "arm") {
    await actor.setFlag(SYSTEM_ID, ARMED_FLAG, true);
    ui.notifications.info(`${actor.name}: luck is armed for the next skill check, attack or saving throw.`);
    return { armed: true };
  }
  if (choice === "disarm") {
    await actor.unsetFlag(SYSTEM_ID, ARMED_FLAG);
    return { armed: false };
  }
  if (choice !== "now") return null;

  // BY HAND, UNDER THE SAME ROUND STAMP.
  const verdict = luckEligibility({
    enabled: true, checkType: "skill", spent: actor.getFlag?.(SYSTEM_ID, SPENT_FLAG) ?? null, current: currentRound()
  });
  if (!verdict.ok) {
    ui.notifications.warn(`Luck: ${verdict.reason}`);
    return null;
  }
  const round = currentRound();
  if (round) await actor.setFlag(SYSTEM_ID, SPENT_FLAG, round);
  const { check, outcome, currentLuck, newLuck } = await rollTheLuckCheck(actor);
  const lines = [
    line(outcome.success
      ? "<strong>Luck is on your side.</strong> Fortune applies to the check you named — roll it with Advantage."
      : "<strong>Your luck has deserted you.</strong> The check fails.")
  ];
  if (outcome.penalizeCheck) {
    lines.push(line("The check luck was for takes <strong>Disadvantage or −5, whichever is worse</strong>."));
  }
  lines.push(line(`Luck score: ${currentLuck} → <strong>${newLuck}</strong>.`));
  await postCard(actor, "Luck Check — Result", lines);
  return { check, outcome, newLuck };
}

/** Award 1 luck, with a card. */
export async function awardLuck(actor, reason) {
  if (!actor) return null;
  const before = Number(actor.system?.resources?.luck?.value ?? 0);
  await actor.update({ "system.resources.luck.value": before + 1 });
  await postCard(actor, "Luck Regained", [line(`${reason}: luck ${before} → <strong>${before + 1}</strong>.`)]);
  return before + 1;
}

/**
 * A CRITICAL INJURY OVER 90 (R15). Returns the card line, or "" when
 * nothing is regained. Characters only — luck is a player's.
 */
export async function regainLuckFromInjury(struck, modifiedResult) {
  if (!luckEnabled() || struck?.type !== "character") return "";
  if (!injuryRegainsLuck(modifiedResult)) return "";
  const before = Number(struck.system?.resources?.luck?.value ?? 0);
  await struck.update({ "system.resources.luck.value": before + 1 });
  return `<strong>Luck:</strong> a critical injury over 90 — ${struck.name} regains 1 luck (${before} → ${before + 1}).`;
}

/**
 * WAS THIS ACTOR'S LAST CHECK CHANGED BY LUCK? (R12.) Luck of the Small
 * Folk rerolls "the triggering check", which is the last one rolled; a
 * check luck has touched may not be rerolled.
 */
export function lastCheckTouchedByLuck(actor) {
  const messages = Array.from(globalThis.game?.messages?.contents ?? []).reverse();
  const last = messages.find((m) => {
    const raw = m.getFlag?.(SYSTEM_ID, "checkCard");
    if (!raw || raw.type === "luck") return false;
    return raw.actorUuid ? raw.actorUuid === actor?.uuid : raw.actorId === actor?.id;
  });
  return Boolean(last?.getFlag?.(SYSTEM_ID, "checkCard")?.luckUsed);
}
