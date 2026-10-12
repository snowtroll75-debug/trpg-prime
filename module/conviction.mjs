import { buildOutcome } from "./dice/resolution.mjs";
import { CHANGE_TYPE } from "./effect-change-types.mjs";

/**
 * Conviction (Core 3.1, Chapter 12 — Rewards).
 *
 * "Unless otherwise noted, spending a conviction point is a free action,
 * taking no time, and can be done at any time. You may spend only one
 * conviction point per round."
 *
 * The pure section (metadata and mathematics) is Foundry-free and covered by
 * test-conviction-spend.mjs; the workflow section drives the actual spends.
 */

const SYSTEM_ID = "trg-prime";
const SPENT_FLAG = "convictionSpent";
const BOOST_FLAG = "convictionBoost";
/** The last round this actor spent AP in — stamped by spendActionPoints. */
const AP_SPENT_FLAG = "apSpentRound";

/* ------------------------------------------------------------------ */
/* Pure rules                                                          */
/* ------------------------------------------------------------------ */

/**
 * The six spends. `checkTypes` lists the TRGCheck types a spend may attach
 * to, exactly as the rulebook words them: Advantage covers "any one d20
 * saving throw, or skill check"; Bonus covers "an attack roll, saving
 * throw, skill check or cast a spell check".
 */
export const CONVICTION_SPENDS = Object.freeze({
  advantage: {
    label: "Advantage",
    checkTypes: ["save", "skill"],
    rule: "Gain advantage on any one d20 saving throw or skill check."
  },
  bonus: {
    label: "Bonus (+1d6)",
    checkTypes: ["attack", "save", "skill", "spellcraft"],
    rule:
      "After rolling the d20 but before the outcome is revealed, roll a d6 and add its result to the check."
  },
  boostDefence: {
    label: "Boost Your Defence",
    rule:
      "At the start of any combat round, boost your DB by 2 for 1 minute. Only one conviction boost to defence at a time."
  },
  cancelFatigue: {
    label: "Cancel Fatigue",
    rule: "Reduce your Fatigued condition by 4. Requires 10 minutes of rest."
  },
  surge: {
    label: "Surge",
    rule: "Reduce your Stunned condition by up to 3 points."
  },
  // RENAMED AT 3.441.1, following Core 3.7: the book prints "Recurring
  // Healing" and the words "Persistent Healing" appear in it nowhere.
  // THE KEY STAYS `persistentHealing` — it is the action string a chat
  // card's button carries and the case a dispatch switch answers, so a
  // card already sitting in a live chat log would stop working the moment
  // the key moved. The player-facing name is what the book renamed; the
  // wire format is not the book's business.
  persistentHealing: {
    label: "Recurring Healing",
    rule:
      "Automatically succeed at a flat check to stop bleeding or recurring damage. Requires a 1 AP Concentrate action."
  }
});

/**
 * Maximum conviction pool: 1, plus 1 at 5th level and every 5 levels
 * thereafter. Feats and abilities adjust this through Active Effects, which
 * apply after base data.
 */
export function convictionMax(level) {
  const value = Math.max(0, Math.floor(Number(level) || 0));
  return 1 + Math.floor(value / 5);
}

/** Cancel Fatigue: reduce by 4, never below 0. */
export function cancelFatigueResult(current) {
  return Math.max(0, Math.floor(Number(current) || 0) - 4);
}

/** Surge: reduce Stunned by up to 3, never below 0. */
export function surgeResult(current, reduce) {
  const value = Math.max(0, Math.floor(Number(current) || 0));
  const amount = Math.min(3, Math.max(1, Math.floor(Number(reduce) || 1)));
  return Math.max(0, value - amount);
}

/**
 * May a point be spent? One per round while a combat is running; outside
 * combat there is no round structure, so the table adjudicates and the
 * system allows it.
 *
 * @param {object} state
 * @param {number} state.pool Current conviction points.
 * @param {{combatId: string, round: number}|null} state.spent Last spend.
 * @param {{combatId: string, round: number}|null} state.current Active
 *   combat context, or null outside combat.
 * @returns {{ok: boolean, reason: string|null}}
 */
export function convictionEligibility({ pool, spent, current }) {
  if (!(Number(pool) > 0)) {
    return { ok: false, reason: "No conviction points remain." };
  }
  if (spent && current) {
    if (spent.combatId === current.combatId && spent.round === current.round) {
      return {
        ok: false,
        reason: "Only one conviction point may be spent per round."
      };
    }
  }
  return { ok: true, reason: null };
}

/**
 * HERO'S FORTUNE (3.619.0; Chapter 12, page 390, Graham's R8): "Your
 * maximum conviction pool increases by 1." Read by name, in base data,
 * beside the three class abilities that print the same sentence.
 */
export const CONVICTION_FEATS = Object.freeze({
  fortune: "Hero's Fortune",
  resolve: "Hero's Resolve",
  luck: "Luck of Heroes"
});

/** Luck of Heroes: "make a DC 15 flat check to avoid losing the conviction point". */
const LUCK_OF_HEROES_DC = 15;

/** The two spends Luck of Heroes reaches: "the Advantage or Bonus options". */
const LUCK_OF_HEROES_SPENDS = Object.freeze(["advantage", "bonus"]);

const nameKey = (value) => String(value ?? "").trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");

/** Does this actor hold the named feat? */
export function hasConvictionFeat(actor, name) {
  const wanted = nameKey(name);
  return Array.from(actor?.items ?? []).some((item) => item?.type === "feat" && nameKey(item.name) === wanted);
}

/** Hero's Fortune's +1 to the maximum. */
export function heroesFortuneBonus(actor) {
  return hasConvictionFeat(actor, CONVICTION_FEATS.fortune) ? 1 : 0;
}

/**
 * THE POINT A NEW LEVEL BRINGS (3.619.0, R7): "A PC gains a conviction
 * point each time they gain a level" — one per level gained, never above
 * the pool's new maximum, and nothing for a level lost.
 *
 * @returns {number} the new value
 */
export function convictionAfterLevelling({ fromLevel, toLevel, value, max }) {
  const gained = Math.max(0, Math.floor(Number(toLevel) || 0) - Math.floor(Number(fromLevel) || 0));
  const current = Math.max(0, Math.floor(Number(value) || 0));
  if (!gained) return current;
  return Math.max(current, Math.min(Math.max(0, Math.floor(Number(max) || 0)), current + gained));
}

/**
 * BOOST YOUR DEFENCE'S MOMENT (3.619.0, R10): "At the start of any combat
 * round". In a combat only, and before the character has spent an action
 * point this round — the nearest thing to "the start" a round has for one
 * creature.
 *
 * @param {object} state
 * @param {boolean} state.inCombat
 * @param {{combatId: string, round: number}|null} state.apSpent the last
 *   round this character spent AP in
 * @param {{combatId: string, round: number}|null} state.current
 * @returns {{ok: boolean, reason: string|null}}
 */
export function boostDefenceTiming({ inCombat, apSpent, current }) {
  if (!inCombat || !current) {
    return { ok: false, reason: "Boost Your Defence is spent at the start of a combat round — only in combat." };
  }
  if (apSpent && apSpent.combatId === current.combatId && apSpent.round === current.round) {
    return { ok: false, reason: "Boost Your Defence is spent at the start of a round — you have already spent action points this round." };
  }
  return { ok: true, reason: null };
}

/** Recurring Healing's printed cost: "Requires a 1 AP Concentrate action". */
const RECURRING_HEALING_AP = 1;

/* ------------------------------------------------------------------ */
/* Foundry workflows                                                   */
/* ------------------------------------------------------------------ */

/** Whether this world uses the Conviction rules (R11). */
export function convictionEnabled() {
  try {
    return game.settings.get(SYSTEM_ID, "useConviction") !== false;
  } catch {
    return true;
  }
}

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines, rolls = []) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

function currentCombatContext() {
  const combat = game.combat;
  if (!combat?.started) return null;
  return { combatId: combat.id, round: combat.round };
}

/** The actor's pool, maximum, and per-round eligibility. */
export function getConvictionState(actor) {
  const resource = actor?.system?.resources?.conviction ?? {};
  if (!convictionEnabled()) {
    return {
      value: Number(resource.value ?? 0),
      max: Number(resource.max ?? 0),
      ok: false,
      reason: "Conviction is not used in this world."
    };
  }
  const eligibility = convictionEligibility({
    pool: Number(resource.value ?? 0),
    spent: actor?.getFlag(SYSTEM_ID, SPENT_FLAG) ?? null,
    current: currentCombatContext()
  });
  return {
    value: Number(resource.value ?? 0),
    max: Number(resource.max ?? 0),
    ...eligibility
  };
}

/** Deduct a point and stamp the per-round marker. */
export async function markConvictionSpent(actor) {
  const value = Number(actor.system.resources?.conviction?.value ?? 0);
  await actor.update({
    "system.resources.conviction.value": Math.max(0, value - 1)
  });
  await actor.setFlag(SYSTEM_ID, SPENT_FLAG, currentCombatContext());
}

/** Award conviction (chaos results, GM rewards), capped at the pool max. */
export async function awardConviction(actor, amount = 1) {
  const resource = actor?.system?.resources?.conviction;
  if (!resource || !convictionEnabled()) return;
  // A POOL OF NOTHING TAKES NOTHING (3.619.0, R11). This used to read a
  // maximum of 0 as 1, which handed an NPC the GM had given no conviction a
  // point from every critical's Chaos result.
  const max = Math.max(0, Number(resource.max ?? 0) || 0);
  const value = Math.min(max, Number(resource.value ?? 0) + Number(amount));
  await actor.update({ "system.resources.conviction.value": value });
}

/**
 * The Advantage spend, requested from the check configuration dialog.
 * Verifies eligibility at roll time; returns true if the point was spent.
 */
export async function spendConvictionAdvantage(actor) {
  const state = getConvictionState(actor);
  if (!state.ok) {
    ui.notifications.warn(state.reason);
    return false;
  }
  await markConvictionSpent(actor);
  return true;
}

/**
 * LUCK OF HEROES (3.619.0; Chapter 12, page 390, Graham's R8): "Whenever you
 * spend a conviction to use the Advantage or Bonus options … make a DC 15
 * flat check to avoid losing the conviction point."
 *
 * Rolled after the spend; on a success the point comes back. The spend
 * still counts as the round's one — the point was spent, and kept.
 *
 * @returns {Promise<boolean>} whether the point was kept
 */
export async function luckOfHeroes(actor, spend) {
  if (!actor || !LUCK_OF_HEROES_SPENDS.includes(spend)) return false;
  if (!hasConvictionFeat(actor, CONVICTION_FEATS.luck)) return false;
  const { TRGCheck } = await import("./dice/check.mjs");
  const check = await TRGCheck.roll({
    actor,
    label: "Luck of Heroes — Flat Check",
    subtitle: `Keep the conviction point spent on ${spend === "bonus" ? "the +1d6 Bonus" : "Advantage"}`,
    type: "flat",
    flat: true,
    dc: LUCK_OF_HEROES_DC
  });
  if (!check?.outcome?.degree?.success) return false;
  const value = Number(actor.system?.resources?.conviction?.value ?? 0);
  const max = Number(actor.system?.resources?.conviction?.max ?? 0);
  await actor.update({ "system.resources.conviction.value": Math.min(Math.max(max, value), value + 1) });
  await postCard(actor, "Luck of Heroes", [
    line(`The flat check succeeds: <strong>the conviction point is not lost</strong>.`),
    line("<em>It still counts as this round's spend.</em>")
  ]);
  return true;
}

/** The round's context for an actor in a running combat, or null. */
async function actorRoundContext(actor) {
  const { actorInCombat } = await import("./combat/action-points-workflow.mjs");
  return actorInCombat(actor) ? currentCombatContext() : null;
}

/** Boost Your Defence: +2 DB for 1 minute, one boost at a time. */
export async function spendBoostDefence(actor) {
  const existing = actor.effects.find((effect) =>
    effect.getFlag(SYSTEM_ID, BOOST_FLAG)
  );
  if (existing) {
    ui.notifications.warn(
      "Only one conviction boost to defence may be active at a time."
    );
    return;
  }
  const state = getConvictionState(actor);
  if (!state.ok) return ui.notifications.warn(state.reason);
  // AT THE START OF A COMBAT ROUND (3.619.0, R10).
  const current = await actorRoundContext(actor);
  const timing = boostDefenceTiming({
    inCombat: Boolean(current),
    apSpent: actor.getFlag(SYSTEM_ID, AP_SPENT_FLAG) ?? null,
    current
  });
  if (!timing.ok) return ui.notifications.warn(timing.reason);

  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: "Conviction: Defence Boost",
      img: "icons/svg/shield.svg",
      duration: { rounds: 10 },
      changes: [
        {
          key: "system.combat.defence.other",
          type: CHANGE_TYPE.CUSTOM,
          value: "2"
        }
      ],
      flags: { [SYSTEM_ID]: { [BOOST_FLAG]: true } }
    }
  ]);
  await markConvictionSpent(actor);
  await postCard(actor, "Conviction — Boost Your Defence", [
    line("<strong>+2 DB</strong> for 1 minute (10 rounds)."),
    line("<em>Spent at the start of the round, before any action points.</em>")
  ]);
}

/** Cancel Fatigue: −4 Fatigued, requires 10 minutes of rest. */
export async function spendCancelFatigue(actor) {
  const current = actor.getConditionValue?.("fatigued") ?? 0;
  if (!current) {
    return ui.notifications.warn(`${actor.name} is not Fatigued.`);
  }
  const state = getConvictionState(actor);
  if (!state.ok) return ui.notifications.warn(state.reason);
  // TEN MINUTES' REST (3.619.0, R10) — never in the middle of a fight. The
  // rest itself is the table's; the clock is not moved.
  if (await actorRoundContext(actor)) {
    return ui.notifications.warn("Cancel Fatigue requires 10 minutes of rest — not in combat.");
  }

  const value = cancelFatigueResult(current);
  if (value > 0) await actor.toggleStatusEffect("fatigued", { value });
  else await actor.toggleStatusEffect("fatigued", { active: false });

  await markConvictionSpent(actor);
  await postCard(actor, "Conviction — Cancel Fatigue", [
    line(`Fatigued ${current} → <strong>${value > 0 ? `Fatigued ${value}` : "removed"}</strong>.`),
    line("<em>Requires 10 minutes of rest.</em>")
  ]);
}

/** Surge: reduce Stunned by up to 3. */
export async function spendSurge(actor) {
  const current = actor.getConditionValue?.("stunned") ?? 0;
  if (!current) {
    return ui.notifications.warn(`${actor.name} is not Stunned.`);
  }
  const state = getConvictionState(actor);
  if (!state.ok) return ui.notifications.warn(state.reason);

  const value = surgeResult(current, 3);
  if (value > 0) await actor.toggleStatusEffect("stunned", { value });
  else await actor.toggleStatusEffect("stunned", { active: false });

  await markConvictionSpent(actor);
  await postCard(actor, "Conviction — Surge", [
    line(
      `Stunned ${current} → <strong>${value > 0 ? `Stunned ${value}` : "removed"}</strong> (reduced by up to 3).`
    )
  ]);
}

/** Recurring Healing: auto-succeed the flat check for one bleed/recurring source. */
export async function spendPersistentHealing(actor) {
  const candidates = actor.effects.filter((effect) =>
    ["bleeding", "recurring"].some((id) => effect.statuses?.has(id))
  );
  if (!candidates.length) {
    return ui.notifications.warn(
      `${actor.name} has no Bleeding or Recurring Damage to stop.`
    );
  }
  const state = getConvictionState(actor);
  if (!state.ok) return ui.notifications.warn(state.reason);
  // A 1 AP CONCENTRATE ACTION (3.619.0, R10), asked before anything is
  // chosen and paid once the effect ends.
  const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  if (!await ensureActionPoints(actor, RECURRING_HEALING_AP, "Recurring Healing")) return;

  const { DialogV2 } = foundry.applications.api;
  const options = candidates
    .map(
      (effect) => `<option value="${effect.id}">${effect.name}</option>`
    )
    .join("");
  const chosen = await DialogV2.prompt({
    window: { title: "Recurring Healing" },
    classes: ["trg-prime", "trg-check-dialog"],
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group"><label>Stop which effect?</label><select name="effectId">${options}</select></div></div>`,
    ok: {
      label: "Spend Conviction",
      callback: (event, button) =>
        button.form.elements.effectId?.value ?? null
    },
    rejectClose: false
  });
  if (!chosen) return;

  const effect = actor.effects.get(chosen);
  const name = effect?.name ?? "the effect";
  await effect?.delete();

  await markConvictionSpent(actor);
  await spendActionPoints(actor, RECURRING_HEALING_AP, "Recurring Healing");
  await postCard(actor, "Conviction — Recurring Healing", [
    line(`The flat check automatically succeeds: <strong>${name}</strong> ends.`),
    line(`<em>A ${RECURRING_HEALING_AP} AP Concentrate action (spent in combat).</em>`)
  ]);
}

/** The spend menu behind the sheet's conviction button. */
export async function openConvictionMenu(actor) {
  const state = getConvictionState(actor);
  const { DialogV2 } = foundry.applications.api;

  const rows = Object.entries(CONVICTION_SPENDS)
    .map(
      ([key, spend]) =>
        `<p style="margin:3px 0"><strong>${spend.label}:</strong> ${spend.rule}</p>`
    )
    .join("");

  const action = await DialogV2.wait({
    window: { title: `Conviction — ${state.value}/${state.max}` },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime">${rows}<p class="hint" style="margin-top:6px">Advantage and the +1d6 Bonus are offered in the roll dialogs themselves. ${state.ok ? "" : `<strong>${state.reason}</strong>`}</p></div>`,
    buttons: [
      { action: "boostDefence", label: "Boost Defence" },
      { action: "surge", label: "Surge" },
      { action: "cancelFatigue", label: "Cancel Fatigue" },
      { action: "persistentHealing", label: "Recurring Healing" },
      { action: "close", label: "Close" }
    ],
    rejectClose: false
  });

  switch (action) {
    case "boostDefence":
      return spendBoostDefence(actor);
    case "surge":
      return spendSurge(actor);
    case "cancelFatigue":
      return spendCancelFatigue(actor);
    case "persistentHealing":
      return spendPersistentHealing(actor);
    default:
      return null;
  }
}

/* Re-export for TRGCheck's outcome rebuild. */
export { buildOutcome };
