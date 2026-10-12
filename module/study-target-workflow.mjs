/**
 * Study Target — the Foundry side: the studied-target list on the actor,
 * the pre-roll time prompt, the subject prompt, the outcome application,
 * and the manager that shows used/available and lets a character forget a
 * target (there is no automatic forgetting — per Graham, going over
 * capacity warns and the player removes one by hand).
 */
import {
  STUDY_TIME_OPTIONS,
  studiedTargetCapacity,
  studyDegreeResult
} from "./study-target.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "studiedTargets";

/** A minimal HTML-escape for user-typed subject names shown in the manager. */
function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** The actor's studied-target list (a copy). */
export function getStudiedTargets(actor) {
  return foundry.utils.deepClone(actor?.getFlag?.(SYSTEM_ID, FLAG) ?? []);
}

export async function setStudiedTargets(actor, list) {
  await actor.setFlag(SYSTEM_ID, FLAG, list);
}

export async function addStudiedTarget(actor, entry) {
  const list = getStudiedTargets(actor);
  list.push(entry);
  await setStudiedTargets(actor, list);
  return list;
}

export async function removeStudiedTarget(actor, index) {
  const list = getStudiedTargets(actor);
  if (index >= 0 && index < list.length) list.splice(index, 1);
  await setStudiedTargets(actor, list);
  return list;
}

/** Capacity + usage snapshot for display. */
export function studiedTargetStatus(actor) {
  const breakdown = studiedTargetCapacity(actor.system);
  const used = getStudiedTargets(actor).length;
  return {
    breakdown,
    capacity: breakdown.total,
    used,
    available: breakdown.total - used,
    over: used > breakdown.total
  };
}

/** Pre-roll: how long do you study? Returns a STUDY_TIME_OPTIONS entry, or null if cancelled. */
export async function promptStudyTime() {
  const { DialogV2 } = foundry.applications.api;
  // A radio list in the content rather than one footer button per option —
  // five footer buttons crammed together and wrapped their labels to three
  // lines in the chat-width dialog. Radios stack cleanly and read at a
  // glance, with a single Study button to confirm.
  const rows = STUDY_TIME_OPTIONS.map(
    (o) =>
      `<label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">` +
      `<input type="radio" name="studyTime" value="${o.key}"${o.key === "minute" ? " checked" : ""} style="margin:0">` +
      `<span>${o.label} <span style="opacity:.7">(${o.modifier > 0 ? "+" : ""}${o.modifier})</span></span>` +
      `</label>`
  ).join("");
  const result = await DialogV2.wait({
    window: { title: "Study Target — time spent", icon: "fa-solid fa-book-open-reader" },
    classes: ["trg-prime"],
    position: { width: 340 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">How long do you spend studying? Lingering makes the check easier; rushing makes it harder.</p>
      ${rows}
    </div>`,
    buttons: [
      {
        action: "study",
        label: "Study",
        icon: "fa-solid fa-book-open-reader",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          const picked = root?.querySelector?.('input[name="studyTime"]:checked')?.value;
          return picked ?? "minute";
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return STUDY_TIME_OPTIONS.find((o) => o.key === result) ?? null;
}

/** Post-success: name the person, place or thing studied (when no token is targeted). */
export async function promptStudySubject(defaultName = "") {
  const { DialogV2 } = foundry.applications.api;
  const value = await DialogV2.wait({
    window: { title: "Study Target — subject", icon: "fa-solid fa-book-open-reader" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint">What did you study — a person, place, or thing?</p>
      <input type="text" name="subject" value="${esc(defaultName)}" style="width:100%" autofocus>
    </div>`,
    buttons: [
      {
        action: "ok",
        label: "Record",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          const field = root?.querySelector?.('[name="subject"]') ?? button?.form?.elements?.subject;
          return field?.value?.trim() || null;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!value || value === "cancel") return null;
  return value;
}

/**
 * The manager: shows used/available and lets the character forget targets.
 * Each target is a Forget button (rather than DOM-bound remove buttons via
 * a render hook) so it depends only on DialogV2's buttons array; forgetting
 * one reopens the manager with the fresh list.
 */
export async function openStudiedTargetManager(actor) {
  if (!actor) return;
  const { DialogV2 } = foundry.applications.api;
  const status = studiedTargetStatus(actor);
  const list = getStudiedTargets(actor);
  const b = status.breakdown;

  const rows = list.length
    ? `<ol style="margin:4px 0 0;padding-left:20px;max-height:240px;overflow:auto">${list
        .map(
          (entry) =>
            `<li style="margin:2px 0">${entry.flawed ? "⚠ " : ""}${esc(entry.name)}${
              entry.flawed ? ' <em style="opacity:.7">(flawed)</em>' : ""
            }</li>`
        )
        .join("")}</ol>`
    : `<p><em>No studied targets yet.</em></p>`;

  const content = `<div class="trg-prime trg-check-dialog">
    <p style="margin:0 0 2px"><strong>${esc(actor.name)}</strong> — Studied Targets <strong>${status.used} / ${status.capacity}</strong>${
      status.over ? ` <span style="color:#b00">(over by ${status.used - status.capacity})</span>` : ""
    }</p>
    <p class="hint" style="font-size:.82em;margin:0">Capacity = Int ${b.int} + level ${b.level} + ⌊${b.ranks} knowledge ranks ÷ 5⌋ (${b.bonus}).</p>
    ${rows}
    ${list.length ? '<p class="hint" style="font-size:.82em;margin:6px 0 0">Forget a target to free capacity:</p>' : ""}
  </div>`;

  const buttons = list.map((entry, index) => ({
    action: `forget-${index}`,
    label: `Forget: ${entry.name}`,
    icon: "fa-solid fa-eraser"
  }));
  buttons.push({ action: "close", label: "Close", icon: "fa-solid fa-xmark", default: true });

  const result = await DialogV2.wait({
    window: { title: "Studied Targets", icon: "fa-solid fa-book-open-reader" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content,
    buttons,
    rejectClose: false
  });

  if (typeof result === "string" && result.startsWith("forget-")) {
    await removeStudiedTarget(actor, Number(result.slice("forget-".length)));
    return openStudiedTargetManager(actor);
  }
}

/**
 * Apply a resolved Study Target check to the actor's list, and return the
 * card lines describing what happened. Adds the target on a Success (a
 * flawed entry on a Fumble); a retry degree changes nothing.
 *
 * @param {Actor} actor
 * @param {string} degreeKey
 * @param {{targetActor?: Actor|null}} options
 * @returns {Promise<{result:string, lines:string[]}>}
 */
export async function applyStudyOutcome(actor, degreeKey, { targetActor = null } = {}) {
  const result = studyDegreeResult(degreeKey);
  if (result === "retry") {
    return { result, lines: ["The target was not studied — you may try again."] };
  }

  let name = targetActor?.name ?? null;
  const ref = targetActor ? { type: "creature", id: targetActor.id } : { type: "named" };
  if (!name) {
    name = await promptStudySubject();
    if (!name) {
      return { result: "retry", lines: ["No subject recorded — nothing was studied."] };
    }
  }

  await addStudiedTarget(actor, { name, ...ref, flawed: result === "flawed" });
  const status = studiedTargetStatus(actor);

  const lines = [];
  if (result === "flawed") {
    lines.push(
      `<em>You believe you have studied <strong>${esc(name)}</strong>, but something has gone wrong — a spell later linked to this target will not go to plan (GM discretion).</em>`
    );
  } else {
    lines.push(`<strong>${esc(name)}</strong> is now a Studied Target.`);
  }
  lines.push(`Studied Targets: <strong>${status.used} / ${status.capacity}</strong>.`);
  if (status.over) {
    lines.push(
      `<em style="color:#b00">Over capacity by ${status.used - status.capacity} — forget a target below to bring it back in line.</em>`
    );
  }
  return { result, lines };
}
