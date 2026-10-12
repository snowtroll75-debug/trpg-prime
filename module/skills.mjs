import { TRGCheck } from "./dice/check.mjs";
import { autoCheckTotal, buildOutcome } from "./dice/resolution.mjs";
import { SKILLS } from "./config.mjs";
import { addPendingModifier } from "./pending-modifiers.mjs";
import { sameSide } from "./combat/aid-bonus.mjs";
import { activeToken } from "./combat/geometry.mjs";
import { aidBoosts, aidGrant, aidRecipientPool, innateTeamworkExtends } from "./skill-aid.mjs";

/**
 * Aid (Chapter 4, Skill Checks — "AID"): the general, non-combat form.
 * One character is the lead on a check; anyone else may help by making
 * an Easy check with the skill of their choice, comparing it to the
 * Bonus Check Table, and the result is added as a circumstance bonus to
 * the lead's check.
 *
 * This is deliberately separate from the Aid Defensive/Aid Offensive
 * Basic Actions, which are the combat-specific forms using an attack
 * check against the target's DB — this is the general form, usable with
 * any skill for any kind of check, matching the rulebook's own framing
 * ("Aid can also be used as a combat action using the Aid Defensive and
 * Aid Offensive skill actions" — implying this is the non-combat default).
 */

const { DialogV2 } = foundry.applications.api;

/** The actor an Aid recipient id names: a uuid (3.617.1), or a bare world id. */
function aidRecipientActor(id) {
  const key = String(id ?? "");
  if (!key) return null;
  if (key.includes(".")) {
    const doc = globalThis.fromUuidSync?.(key) ?? null;
    return doc?.documentName === "Actor" ? doc : null;
  }
  return game.actors.get(key) ?? null;
}

export async function rollAidAnother(actor, { extraModifiers = [] } = {}) {
  // WHO CAN RECEIVE IT — worked out before anything is asked, so a roll
  // is never made into the void. Until 3.380.0 this action rolled, posted
  // a card and delivered the result to nobody at all; refusing early is
  // the smallest part of the fix but the one that stops it silently
  // regressing to that.
  // ITS OWN TOKEN (3.622.3; the 3.622.2 drive's F1, Graham's R1): by actor id,
  // a second unlinked copy of the same actor found the first copy's token.
  const myToken = activeToken(actor);
  const myDisposition = myToken?.document?.disposition ?? myToken?.disposition;
  const sceneAllies = (canvas?.tokens?.placeables ?? [])
    .filter((t) => t.actor && t.actor.uuid !== actor.uuid
      && sameSide(myDisposition, t.document?.disposition ?? t.disposition))
    // BY THE TOKEN'S OWN ACTOR (3.617.1, O1 of the 3.617.0 drive; Graham:
    // "Token yes"). An unlinked token's actor shares its id with the world
    // actor, so `game.actors.get(id)` handed the bonus to the world actor and
    // the token on the scene never saw it. The uuid names the token's actor;
    // a linked token's is the world actor's, so it still de-duplicates
    // against the party list below.
    .map((t) => ({ id: t.actor.uuid, name: t.name }));
  const partyCharacters = (game.actors ?? [])
    .filter((a) => a.type === "character" && a.hasPlayerOwner)
    .map((a) => ({ id: a.uuid, name: a.name }));

  const pool = aidRecipientPool({ sceneAllies, partyCharacters, selfId: actor.uuid });
  if (!pool.candidates.length) {
    ui.notifications.warn(`Aid Another: ${pool.reason}.`);
    return null;
  }

  const skillOptions = Object.entries(SKILLS)
    .map(([key, entry]) => `<option value="${key}">${entry.label}</option>`)
    .join("");
  const allyOptions = pool.candidates
    .map((a) => `<option value="${a.id}">${a.name}</option>`)
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Aid Another", icon: "fa-solid fa-hands-helping" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Assist a lead character's check with a skill of your choice. Compared against the Bonus Check Table; the result becomes a circumstance bonus waiting on their next roll.</p>
        <div class="form-group">
          <label for="trg-aid-ally">Who are you helping?</label>
          <select id="trg-aid-ally" name="allyId">
            ${allyOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="trg-aid-skill">Skill</label>
          <select id="trg-aid-skill" name="skillKey">
            ${skillOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="trg-aid-purpose">What are they attempting?</label>
          <input id="trg-aid-purpose" type="text" name="purpose" placeholder="e.g. force the door">
        </div>
        <div class="form-group">
          <label for="trg-aid-dc">Lead's DC</label>
          <input id="trg-aid-dc" type="number" name="dc" value="0">
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

  const dc = Number(result.dc || 0);
  const skillKey = result.skillKey;
  const purpose = String(result.purpose ?? "").trim();
  const skill = actor.system?.skills?.[skillKey];
  const label = skill?.label || SKILLS[skillKey]?.label || "Skill";

  const modifiers = skill?.checkModifiers ?? [
    { label, value: Number(skill?.total ?? 0), type: "untyped" }
  ];

  const check = await TRGCheck.roll({
    actor,
    label: `Aid Another — ${label}`,
    subtitle: purpose
      ? `Easy check vs the lead's DC ${dc} — to ${purpose}`
      : `Easy check vs the lead's DC ${dc}`,
    type: "skill",
    subject: skillKey,
    dc,
    difficulty: "easy",
    bonusCheck: true,
    // AN EXTRA HAND (3.617.0, C4 of block 37): Assisting Gloves' "+2 when
    // making the check to see if aid is successful".
    modifiers: [...modifiers, ...(Array.isArray(extraModifiers) ? extraModifiers : [])]
  });

  const grant = aidGrant({
    degree: check?.outcome?.degree?.key ?? "",
    skillLabel: label,
    purpose,
    aiderName: actor.name,
    // Practical Counsel's +1 (3.625.0) — see skill-aid.mjs `aidBoosts`.
    boost: aidBoosts(Array.from(actor.appliedEffects ?? actor.effects ?? []))
  });

  // A PLAIN FAILURE GRANTS NOTHING, and says so rather than leaving the
  // lead to wonder whether a bonus is waiting for them.
  if (!grant) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime"><p><em>${actor.name}'s help comes to nothing — no bonus or penalty is carried forward.</em></p></div>`
    });
    return check;
  }

  const first = aidRecipientActor(result.allyId);
  const delivered = [];
  if (first) {
    await addPendingModifier(first, grant);
    delivered.push(first.name);
  }

  // INNATE TEAMWORK extends a SUCCESSFUL aid to further allies. A fumbled
  // Aid hands out a penalty, and the feat must not spread that around the
  // party — `innateTeamworkExtends` gates on the grant having helped.
  const featNames = Array.from(actor.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => i.name);
  if (innateTeamworkExtends({ featNames, grant })) {
    const others = pool.candidates.filter((a) => a.id !== result.allyId);
    if (others.length) {
      const extra = await promptExtraAidRecipients(others, grant, label, purpose);
      for (const id of extra) {
        const ally = aidRecipientActor(id);
        if (!ally) continue;
        await addPendingModifier(ally, grant);
        delivered.push(ally.name);
      }
    }
  }

  const sign = grant.value > 0 ? `+${grant.value}` : String(grant.value);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime"><p>`
      + `<strong>${sign} circumstance</strong> ${grant.helpful ? "waiting for" : "hanging over"} `
      + `<strong>${delivered.join("</strong>, <strong>")}</strong> — `
      + `<em>${grant.scope}</em>.</p>`
      + (delivered.length > 1
        ? `<p><em>Innate Teamwork: the same help extends to every ally making that check this round.</em></p>`
        : "")
      + `</div>`
  });

  return check;
}

/**
 * Innate Teamwork's second and later recipients.
 *
 * MULTI-SELECT, because the feat says "additional allies" — plural — and
 * asking once per ally would make a feat that is meant to save effort
 * cost more of it than doing without.
 */
async function promptExtraAidRecipients(others, grant, skillLabel, purpose) {
  const rows = others.map((a) =>
    `<label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">`
    + `<input type="checkbox" name="ally" value="${a.id}" style="margin:0">`
    + `<span>${a.name}</span></label>`
  ).join("");
  const sign = grant.value > 0 ? `+${grant.value}` : String(grant.value);
  const chosen = await DialogV2.wait({
    window: { title: "Innate Teamwork — extend your help", icon: "fa-solid fa-people-group" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog">`
      + `<p class="hint" style="margin:0 0 6px">Anyone else making the same `
      + `<strong>${skillLabel}</strong> check${purpose ? ` to ${purpose}` : ""} this round `
      + `may receive the same <strong>${sign}</strong>.</p>${rows}</div>`,
    buttons: [
      {
        action: "extend",
        label: "Extend",
        icon: "fa-solid fa-people-group",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return Array.from(root?.querySelectorAll?.('input[name="ally"]:checked') ?? [])
            .map((n) => n.value);
        }
      },
      { action: "cancel", label: "Nobody else", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  return Array.isArray(chosen) ? chosen : [];
}

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * Auto Check (Chapter 4, Using Skills — an optional rule, governed by
 * its own world setting): forgo rolling a trained skill to instead take
 * a flat 10 + rank bonus. No dice involved, so this doesn't go through
 * TRGCheck at all — just the outcome resolution it's built on, with a
 * card that's honest about what happened (a flat result, not a roll).
 */
export async function rollAutoCheck(actor, skillKey) {
  const skill = actor.system?.skills?.[skillKey];
  const label = skill?.label || SKILLS[skillKey]?.label || "Skill";
  const ranks = Number(skill?.ranks ?? 0);
  const total = autoCheckTotal(ranks);

  const result = await DialogV2.wait({
    window: { title: `Auto Check — ${label}`, icon: "fa-solid fa-check-double" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Taking a flat ${total} (10 + ${ranks} rank${ranks === 1 ? "" : "s"}) instead of rolling.</p>
        <div class="form-group">
          <label for="trg-auto-dc">DC</label>
          <input id="trg-auto-dc" type="number" name="dc" value="0">
        </div>
      </div>`,
    buttons: [
      {
        action: "resolve",
        label: "Resolve",
        icon: "fa-solid fa-check",
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

  const dc = Number(result.dc || 0);
  const outcome = buildOutcome({ dieTotal: total, modifiers: [], dc });

  const lines = [
    line(`<strong>Auto Check</strong> — no roll, a flat 10 + ${ranks} rank${ranks === 1 ? "" : "s"}.`),
    line(`Total <strong>${total}</strong> vs DC ${dc}.`)
  ];
  if (outcome.degree) {
    lines.push(line(`<strong>${outcome.degree.label}</strong>`));
  }

  await postCard(actor, `${label} — Auto Check`, lines);
  return outcome;
}
