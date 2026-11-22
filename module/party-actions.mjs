/**
 * THE PARTY ACTIONS (Party Sheet V2, Stage 3; 3.710.0).
 *
 * The Party sheet as the launcher for the group workflows the system
 * already has. Nothing here is a rule of its own:
 *
 *   Rest           rest-workflow.mjs openRestDialog / performRest
 *   Travel         travel-dialog.mjs openTravelDialog (travel.mjs arithmetic)
 *   Begin Session  party-rewards-workflow.mjs beginSession (Hero's Resolve)
 *   Award XP       party-rewards-workflow.mjs awardPartyXP (rewards.mjs splitXP)
 *
 * What this file adds is WHO takes part: the members of THIS party,
 * resolved through party-members.mjs, each actor once, missing and
 * ineligible entries left out and named. The workflows were written for
 * "the whole table"; handed this list, they act on one party and nobody
 * else.
 *
 * The pure half (participants, the XP preview, the toolbar's list, the
 * repeat guard) is first, for the harness. The Foundry half is below.
 */

import { MEMBER_STATUS } from "./party-members.mjs";
import { ACCOMPLISHMENT_AWARDS, splitXP } from "./rewards.mjs";

const str = (value) => String(value ?? "").trim();

/* ------------------------------------------------------------------ */
/* Who takes part                                                      */
/* ------------------------------------------------------------------ */

/**
 * The party's participants for a group action.
 *
 * Only members that resolved and may be on a roster take part (the same
 * eligibility as the roster itself: characters and NPCs). Each actor once:
 * a roster that names the same actor twice cannot rest it twice. Anyone
 * left out is named, so the dialog can say so rather than shrink silently.
 *
 * @param {Array<{uuid: string, actor: object|null, status: string}>} roster
 * @returns {{actors: object[], excluded: Array<{name: string, reason: string}>}}
 */
export function partyParticipants(roster = []) {
  const actors = [];
  const seen = new Set();
  const excluded = [];
  for (const entry of roster) {
    if (entry.status === MEMBER_STATUS.OK && entry.actor) {
      const key = str(entry.actor.uuid) || str(entry.uuid);
      if (seen.has(key)) continue;
      seen.add(key);
      actors.push(entry.actor);
    } else if (entry.status === MEMBER_STATUS.INELIGIBLE) {
      excluded.push({ name: str(entry.actor?.name) || entry.uuid, reason: `a ${str(entry.actor?.type) || "document"} cannot take part` });
    } else {
      excluded.push({ name: entry.uuid, reason: entry.status === MEMBER_STATUS.ERROR ? "could not be looked up" : "no longer exists" });
    }
  }
  return { actors, excluded };
}

/** The line the Rest and Travel dialogs print above their list. */
export function partyScopeNote(partyName, action, { actors = [], excluded = [] } = {}) {
  const who = `${actors.length} member${actors.length === 1 ? "" : "s"} of ${str(partyName) || "this party"}`;
  const left = excluded.length
    ? ` Not included: ${excluded.map((e) => `${e.name} (${e.reason})`).join("; ")}.`
    : "";
  return `${action} the ${who}. No one outside the party is included.${left}`;
}

/* ------------------------------------------------------------------ */
/* Award XP: the preview the GM confirms                               */
/* ------------------------------------------------------------------ */

/**
 * What an award will do, before it is done.
 *
 * The same split `awardPartyXP` makes (`splitXP` over every member counted
 * in the APL, NPCs included), and the same distinction: a character's
 * share is written to its XP; an NPC's level does not come from XP, so
 * its share is counted and nothing is written.
 *
 * @param {object[]} members the party's participating actors
 * @param {number} total
 */
export function xpAwardPreview(members = [], total = 0) {
  const xp = Math.max(0, Math.floor(Number(total) || 0));
  const { each, remainder } = splitXP(xp, members.length);
  const rows = members.map((actor) => {
    const written = str(actor?.type) === "character";
    const before = Number(actor?.system?.identity?.xp?.value ?? 0) || 0;
    return { name: str(actor?.name), written, before, after: written ? before + each : null };
  });
  return { xp, each, remainder, count: members.length, rows, ok: xp > 0 && members.length > 0 };
}

/** The award sources the toolbar's Award XP offers. */
export function xpSources({ encounterTotal = 0 } = {}) {
  return [
    { key: "encounter", label: `The encounter (${Math.max(0, Number(encounterTotal) || 0)} XP)`, xp: Math.max(0, Number(encounterTotal) || 0), reason: "the encounter" },
    ...ACCOMPLISHMENT_AWARDS.map((a) => ({ key: a.key, label: `${a.label} accomplishment (${a.xp} XP)`, xp: a.xp, reason: `a ${a.label} accomplishment` })),
    { key: "custom", label: "A custom amount", xp: null, reason: "the GM's award" }
  ];
}

/* ------------------------------------------------------------------ */
/* One at a time                                                       */
/* ------------------------------------------------------------------ */

/**
 * Run `work` unless the same action for the same party is already running
 * on this client. A double-click, or a second press while a dialog is
 * still open, does nothing rather than resting or awarding twice.
 *
 * Per client, deliberately: these actions run on the pressing GM's own
 * client and are not relayed, so another client cannot start one by
 * accident. Two GMs who each choose to press are each doing it on purpose.
 *
 * @template T
 * @param {Set<string>} running
 * @param {string} key
 * @param {() => Promise<T>} work
 * @returns {Promise<T|null>} null when it was already running
 */
export async function runOnce(running, key, work) {
  if (running.has(key)) return null;
  running.add(key);
  try {
    return await work();
  } finally {
    running.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* The toolbar                                                         */
/* ------------------------------------------------------------------ */

/**
 * The Party Actions toolbar, in order. An action is drawn only when it is
 * `implemented`, so a planned one has its place and its id without a
 * button that does nothing.
 *
 * GROUP CHECK is that place (Stage 5): its id, label, icon and order are
 * set here, and the sheet will offer it the day `implemented` is true and
 * a `groupCheck` action exists on the sheet. Until then it is not drawn.
 */
export const PARTY_TOOLBAR_ACTIONS = Object.freeze([
  { id: "rollPartyInitiative", label: "Roll Initiative", icon: "fa-solid fa-dice-d20", gmOnly: false, implemented: true },
  { id: "partyRest", label: "Rest", icon: "fa-solid fa-bed", gmOnly: true, implemented: true },
  { id: "partyTravel", label: "Travel", icon: "fa-solid fa-person-hiking", gmOnly: true, implemented: true },
  { id: "groupCheck", label: "Group Check", icon: "fa-solid fa-people-group", gmOnly: true, implemented: false },
  { id: "beginSession", label: "Begin Session", icon: "fa-solid fa-sun", gmOnly: true, implemented: true },
  { id: "partyAwardXP", label: "Award XP", icon: "fa-solid fa-trophy", gmOnly: true, implemented: true }
]);

/** The toolbar this user sees: implemented actions, GM ones for a GM. */
export function toolbarFor({ isGM = false } = {}) {
  return PARTY_TOOLBAR_ACTIONS.filter((a) => a.implemented && (isGM || !a.gmOnly));
}

/* ------------------------------------------------------------------ */
/* Foundry                                                             */
/* ------------------------------------------------------------------ */

function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * The confirmation shown before any party XP award (3.710.0): the amount,
 * the share, who is written and who only counted, and what is not
 * awarded. Returns true only on Award.
 */
export async function confirmXPAward(party, preview, reason) {
  const { DialogV2 } = foundry.applications.api;
  const rows = preview.rows.map((r) => `<tr><td>${escapeHTML(r.name)}</td><td style="text-align:right">${preview.each}</td>`
    + `<td>${r.written ? `${r.before} → <strong>${r.after}</strong>` : "<em>share counted; an NPC's level does not come from XP, so nothing is written</em>"}</td></tr>`).join("");
  const answer = await DialogV2.wait({
    window: { title: `${party.name}: Award XP`, icon: "fa-solid fa-trophy" },
    classes: ["trg-prime"],
    position: { width: 520 },
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>${preview.xp} XP</strong> for ${escapeHTML(reason)}: <strong>${preview.each} XP</strong> each across ${preview.count} member${preview.count === 1 ? "" : "s"}${preview.remainder ? `. ${preview.remainder} XP does not divide evenly and is not awarded` : ""}.</p>
      <table style="width:100%;text-align:left;font-size:0.85rem"><thead><tr><th>Member</th><th style="text-align:right">Share</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="hint">Split by Chapter 12's rule: every member counted in the APL takes a share.</p></div>`,
    buttons: [
      { action: "award", label: "Award", icon: "fa-solid fa-check", default: true },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  return answer === "award";
}

/** The toolbar's Award XP: choose what to award, then confirm it. */
export async function chooseXPAward({ encounterTotal = 0 } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const sources = xpSources({ encounterTotal });
  const options = sources.map((s) => `<option value="${s.key}"${s.key === "encounter" && !s.xp ? " disabled" : ""}>${escapeHTML(s.label)}</option>`).join("");
  const picked = await DialogV2.wait({
    window: { title: "Award XP", icon: "fa-solid fa-trophy" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">
      <div class="form-group stacked"><label>Award</label><select name="source">${options}</select></div>
      <div class="form-group"><label>Custom amount</label><input type="number" name="custom" min="1" placeholder="XP"></div>
      <p class="hint">You will see the split before anything is written.</p></div>`,
    buttons: [
      { action: "next", label: "Next", icon: "fa-solid fa-arrow-right", default: true,
        callback: (e, button) => ({ source: button.form.elements.source.value, custom: Number(button.form.elements.custom.value) || 0 }) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!picked || picked === "cancel") return null;
  const source = sources.find((s) => s.key === picked.source);
  if (!source) return null;
  const xp = source.key === "custom" ? Math.max(0, Math.floor(picked.custom)) : source.xp;
  if (!xp) {
    ui.notifications?.warn("There is no XP to award.");
    return null;
  }
  return { xp, reason: source.reason };
}
