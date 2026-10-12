/**
 * The Foundry side of Reaper's Resonance (see death-resonance.mjs).
 *
 * NEW at 3.487.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS NEW EXCEPT THE ARRANGEMENT.
 *
 *   the dead      the `dead` status the reaper sets (3.457.0/3.459.0) —
 *                 the same fact `needsReaping` reads.
 *   the distance  `distanceBetween` in combat/geometry.mjs, which is the
 *                 one place this system measures token to token and
 *                 which records the three attempts it took to get right.
 *   the level     `system.identity.level`, the field Chapter 3's whole
 *                 level table derives from.
 *   undead        `isUndead` in aligned.mjs — the same answer Turn
 *                 Undead, Luminance and Alignment Channel all use, so a
 *                 creature cannot be undead for one spell and not for
 *                 another.
 *   the heal      `healActor`, which caps at the missing hit points and
 *                 reports what it actually restored.
 *   the bleed     `toggleStatusEffect("bleeding", …)`, exactly as
 *                 Luminance's own bleed clause writes it.
 */

import {
  RESONANCE_RADIUS_FEET, resonanceHeal, resonanceBleedReduction, resonanceReason,
  resonanceLine, resonanceBleedLine, resonanceNoBleedLine
} from "./death-resonance.mjs";
import { activeToken, distanceBetween } from "../combat/geometry.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Everything on the scene the caster could name, with its reason.
 *
 * EVERY CREATURE, NOT THE ELIGIBLE ONES. The list is annotated and not
 * filtered — Graham's ruling of 27 August 2026, and the same shape the
 * target picker gained at 3.443.2. A filtered list cannot be argued with
 * by the person reading it.
 *
 * SORTED SO THE ANSWER IS USUALLY FIRST: unobjectionable rows lead, then
 * the rest, each by distance. A picker whose likely answer is fourteenth
 * is a picker nobody reads.
 *
 * NOT EXPORTED. `promptResonanceSource` is this module's public form,
 * and `verify-rules-have-callers` was right to flag the exported version:
 * the only thing outside this file that wanted it was a mutation trying
 * to skip the prompt.
 *
 * @param {Actor} caster
 * @returns {Array<{actor: Actor, name: string, feet: number|null, reason: string|null}>}
 */
function resonanceCandidates(caster) {
  const rows = [];
  try {
    const casterToken = activeToken(caster);
    for (const token of canvas?.tokens?.placeables ?? []) {
      const actor = token?.actor;
      if (!actor) continue;
      const feet = casterToken && token !== casterToken
        ? Math.round(Number(distanceBetween(casterToken, token)))
        : (token === casterToken ? 0 : null);
      rows.push({
        actor,
        name: token.name || actor.name,
        feet: Number.isFinite(feet) ? feet : null,
        reason: resonanceReason({
          isSelf: actor.id === caster?.id && actor.isToken === caster?.isToken,
          isDead: Boolean(actor.statuses?.has?.("dead")),
          feet: Number.isFinite(feet) ? feet : null,
          radiusFeet: RESONANCE_RADIUS_FEET
        })
      });
    }
  } catch (error) {
    console.error("TRG Prime | could not build the resonance list", error);
  }
  rows.sort((a, b) => {
    if (Boolean(a.reason) !== Boolean(b.reason)) return a.reason ? 1 : -1;
    return (a.feet ?? 9999) - (b.feet ?? 9999);
  });
  return rows;
}

/**
 * Ask which creature's death is being drawn on.
 *
 * ASKED, because the system cannot know WHICH nearby death this reaction
 * answers — several creatures can die in a round, and the spell names
 * one. It is the same question `promptIncomingSaveDC` asks for Counter
 * Perform: a fact the player has and the engine does not.
 *
 * @returns {Promise<Actor|null>} null on cancel
 */
export async function promptResonanceSource(caster, spellName) {
  const rows = resonanceCandidates(caster);
  if (!rows.length) return null;
  const options = rows.map((r, i) => {
    const distance = r.feet === null ? "" : ` — ${r.feet} ft`;
    const why = r.reason ? ` <em>&mdash; ${r.reason}</em>` : "";
    return `<label style="display:block;margin:3px 0"><input type="radio" name="src" value="${i}"${i === 0 ? " checked" : ""}> `
      + `${r.name}${distance}${why}</label>`;
  }).join("");
  const chosen = await DialogV2.wait({
    window: { title: `${spellName} — Whose death?`, icon: "fa-solid fa-skull" },
    classes: ["trg-prime"],
    content: `<p>The essence of which creature answers?</p>${options}`
      + `<p class="hint">Every creature on the scene is listed. The ones that look wrong say why, `
      + `and can still be chosen — the picker offers, it does not adjudicate.</p>`,
    buttons: [
      {
        action: "ok", label: "Draw", icon: "fa-solid fa-skull", default: true,
        // READ THE SAME WAY EVERY OTHER PROMPT IN THIS SYSTEM READS ITS
        // FORM. `FormData` is a browser global this project deliberately
        // does not declare — `verify-no-undefined-names` caught the first
        // draft using it, and its own rule is that a global added to make
        // a check pass is talking the check out of its job.
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return String(new FDE(form).object.src ?? "");
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);
  if (chosen === null || chosen === undefined || chosen === "" || chosen === "cancel") return null;
  return rows[Number(chosen)]?.actor ?? null;
}

/**
 * Apply the resonance: heal the caster, and ease their bleeding if the
 * warp was bought.
 *
 * THE CASTER IS HEALED, NOT THE TARGET. "The essence of the departed
 * creature heals YOUR wounds" — the creature that died is the source,
 * and the only thing that happens to it is that it is read.
 *
 * @param {Actor} caster
 * @param {Actor} source the creature whose death is drawn on
 * @param {boolean} bleedWarp whether the +2 PP option was taken
 * @returns {Promise<string[]>} lines for the card
 */
export async function applyDeathResonance(caster, source, bleedWarp = false) {
  const lines = [];
  if (!caster || !source) return lines;

  const { isUndead } = await import("../aligned.mjs");
  const { healActor } = await import("./spell-effects.mjs");

  const undead = Boolean(isUndead(source.system ?? {}));
  const owed = resonanceHeal({
    level: Number(source.system?.identity?.level ?? 0),
    undead
  });
  const healed = await healActor(caster, owed);

  lines.push(resonanceLine({
    casterName: caster.name, sourceName: source.name, owed, healed, undead
  }));

  if (!bleedWarp) return lines;

  // MEASURED AGAINST WHAT WAS HEALED, not against what was owed. See
  // `resonanceBleedReduction` — "for every 5 HP healed" names the heal.
  const reduce = resonanceBleedReduction(healed);
  const current = Number(caster.getConditionValue?.("bleeding") ?? 0);
  if (reduce <= 0 || current <= 0) {
    lines.push(resonanceNoBleedLine(caster.name));
    return lines;
  }
  const next = Math.max(0, current - reduce);
  await caster.toggleStatusEffect("bleeding", { active: next > 0, value: next || undefined });
  lines.push(resonanceBleedLine(caster.name, current - next, current, next));
  return lines;
}
