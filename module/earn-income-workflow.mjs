/**
 * Earn Income — the Foundry side: the multi-day task carried on the actor, and
 * the manager that works another day or finishes it. One active task at a time.
 * The check itself (day one) runs through action-workflow.mjs.
 */
import { earnIncomeForDegree } from "./earn-income.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "earnIncomeTask";

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** The character's ranks in a skill. */
export function skillRanks(actor, skillKey) {
  return Number(actor?.system?.skills?.[skillKey]?.ranks ?? 0);
}

/** Earn Income requires being trained — at least one rank. */
export function isSkillTrained(actor, skillKey) {
  return skillRanks(actor, skillKey) >= 1;
}

/** The active task, or null. */
export function earnIncomeStatus(actor) {
  const task = actor?.getFlag?.(SYSTEM_ID, FLAG) ?? null;
  return task && task.active ? task : null;
}

export async function clearEarnIncomeTask(actor) {
  if (actor?.getFlag?.(SYSTEM_ID, FLAG) === undefined) return;
  await actor.unsetFlag(SYSTEM_ID, FLAG);
}

/**
 * Begin a task from the day-one roll. Returns the task record (also stored on
 * the actor). A Fumble means fired: the task is not made active and earns
 * nothing, but the record is returned so the card can say so.
 *
 * @param {Actor} actor
 * @param {object} opts {skillKey, skillLabel, taskLevel, degreeKey, ranks}
 */
export async function startEarnIncomeTask(actor, { skillKey, skillLabel, taskLevel, degreeKey, ranks }) {
  const day = earnIncomeForDegree(degreeKey, taskLevel, ranks);
  const task = {
    skillKey,
    skillLabel,
    taskLevel: Math.max(0, Math.trunc(Number(taskLevel) || 0)),
    ranks: Math.max(0, Math.trunc(Number(ranks) || 0)),
    degree: degreeKey,
    degreeLabel: day.label,
    perDay: day.perDay,
    fired: day.fired,
    daysWorked: 1,
    totalEarned: day.fired ? 0 : day.perDay,
    active: !day.fired
  };
  await actor.setFlag(SYSTEM_ID, FLAG, task);
  return task;
}

/** Work one more day at the same rate — no new check. */
export async function workAnotherDay(actor) {
  const task = earnIncomeStatus(actor);
  if (!task) return null;
  const updated = {
    ...task,
    daysWorked: task.daysWorked + 1,
    totalEarned: task.totalEarned + task.perDay
  };
  await actor.setFlag(SYSTEM_ID, FLAG, updated);
  return updated;
}

/** End the task. Returns the final record before clearing. */
export async function finishEarnIncomeTask(actor) {
  const task = actor?.getFlag?.(SYSTEM_ID, FLAG) ?? null;
  await clearEarnIncomeTask(actor);
  return task;
}

/** Pre-roll: the GM-assigned task level. Returns a non-negative integer, or null if cancelled. */
export async function promptTaskLevel() {
  const { DialogV2 } = foundry.applications.api;
  const value = await DialogV2.wait({
    window: { title: "Earn Income — task level", icon: "fa-solid fa-coins" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">The GM assigns a task level (the most rewarding job available). Income = task level × your skill ranks.</p>
      <label style="display:flex;align-items:center;gap:8px">Task level <input type="number" name="taskLevel" value="1" min="0" style="width:80px"></label>
    </div>`,
    buttons: [
      {
        action: "ok",
        label: "Set task",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          const raw = root?.querySelector?.('[name="taskLevel"]')?.value;
          const n = Math.max(0, Math.trunc(Number(raw) || 0));
          return String(n);
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (value === null || value === undefined || value === "cancel") return null;
  return Math.max(0, Math.trunc(Number(value) || 0));
}

/** The manager: the active task, with Work Another Day / Finish. */
export async function openEarnIncomeManager(actor) {
  if (!actor) return;
  const { DialogV2 } = foundry.applications.api;
  const task = earnIncomeStatus(actor);

  if (!task) {
    await DialogV2.wait({
      window: { title: "Earn Income", icon: "fa-solid fa-coins" },
      classes: ["trg-prime"],
      position: { width: 400 },
      content: `<div class="trg-prime trg-check-dialog"><p><em>No active Earn Income task. Roll Earn Income from a trained skill to begin one.</em></p></div>`,
      buttons: [{ action: "close", label: "Close", icon: "fa-solid fa-xmark", default: true }],
      rejectClose: false
    });
    return;
  }

  const content = `<div class="trg-prime trg-check-dialog">
    <p style="margin:0 0 4px"><strong>${esc(actor.name)}</strong> — Earn Income</p>
    <p style="margin:0 0 2px">${esc(task.skillLabel)}, task level <strong>${task.taskLevel}</strong> (${task.ranks} ranks) — <strong>${task.perDay} gp/day</strong>.</p>
    <p class="hint" style="font-size:.85em;margin:0">${esc(task.degreeLabel)}. Income = task level × skill ranks.</p>
    <p style="margin:6px 0 0">Days worked: <strong>${task.daysWorked}</strong> · Total earned: <strong>${task.totalEarned} gp</strong></p>
  </div>`;

  const result = await DialogV2.wait({
    window: { title: "Earn Income", icon: "fa-solid fa-coins" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content,
    buttons: [
      { action: "work", label: `Work another day (+${task.perDay} gp)`, icon: "fa-solid fa-hammer", default: true },
      { action: "finish", label: `Finish task (${task.totalEarned} gp)`, icon: "fa-solid fa-flag-checkered" },
      { action: "close", label: "Close", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (result === "work") {
    await workAnotherDay(actor);
    return openEarnIncomeManager(actor);
  }
  if (result === "finish") {
    const done = await finishEarnIncomeTask(actor);
    ui.notifications.info(
      `${actor.name} finished earning income: ${done?.totalEarned ?? 0} gp over ${done?.daysWorked ?? 0} day(s).`
    );
  }
}
