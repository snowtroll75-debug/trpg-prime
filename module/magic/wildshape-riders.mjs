/**
 * The Foundry side of the two Wild Shape feats that ride on a change of
 * form (see wildshape-feats.mjs for the rules).
 *
 *   Elemental Shape / Wyrm Shape
 *     "Furthermore, whenever you use Wildshape to change into a
 *      different form, you gain resistance to either acid, cold,
 *      electricity or fire for the duration." (Wyrm Shape adds poison.)
 *
 *   Ferocious Shape
 *     "+2-circumstance bonus to all natural attacks and a +2-dodge bonus
 *      to DB when using your Wildshape ability."
 *
 * WHY THE DODGE BONUS IS HERE AND THE ATTACK BONUS IS NOT. Both halves
 * of Ferocious Shape apply "when using your Wildshape ability", but they
 * are answered in different places, and each is answered where that
 * question is already decided. The attack bonus is per-strike and scoped
 * to natural weapons, so it belongs beside Wild Shape's own +1 in the
 * attack path. The dodge bonus is a flat number for as long as the form
 * lasts, so it belongs on an effect that expires with the form. Putting
 * either one in the other's place would mean a second thing deciding a
 * question that already has an owner.
 *
 * A RIDER ON A CAST THAT WORKED. Called after the spell has resolved, so
 * a failed shapeshift grants nothing.
 */

import { CHANGE_TYPE } from "../effect-change-types.mjs";
import { parseSpellDuration } from "./spell-effects.mjs";
import {
  ferociousDefenceBonus,
  isFormSpell,
  shapeResistanceChoices
} from "./wildshape-feats.mjs";

const SYSTEM_ID = "trg-prime";
const RIDER_FLAG = "wildShapeRider";

const { DialogV2 } = foundry.applications.api;

const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const featNamesOf = (actor) => Array.from(actor?.items ?? [])
  .filter((i) => i.type === "feat")
  .map((i) => i.name);

/**
 * Ask which resistance this change of form grants.
 *
 * A CHOICE, NOT A DEFAULT. Graham's ruling of 21 August 2026 was that
 * the pick happens at shapeshift time; silently taking the first of the
 * list would satisfy the letter and lose the point, since the whole
 * value of the clause is choosing against what you are about to face.
 *
 * Cancelling declines the resistance rather than aborting anything — the
 * cast has already happened by the time this runs, and a rider that
 * could undo it would be a worse bargain than one that can be skipped.
 */
async function chooseResistance(spellName, choices) {
  const opts = choices
    .map((c) => `<option value="${c}">${c[0].toUpperCase()}${c.slice(1)}</option>`)
    .join("");
  const result = await DialogV2.wait({
    window: { title: `${spellName} — resistance`, icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked">`
      + `<label>Changing form grants resistance for the duration. Choose one:</label>`
      + `<select name="choice">${opts}</select></div></div>`,
    buttons: [
      {
        action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")
          ).object
      },
      { action: "cancel", label: "No resistance", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result.choice ?? null;
}

/**
 * Clear the riders left by a previous form.
 *
 * ONE FORM AT A TIME. A Druid who shapeshifts twice in a day would
 * otherwise stack a second resistance and a second dodge bonus on top of
 * the first — and because both are ADD-mode changes on the same fields,
 * nothing downstream would notice. The riders are flagged so this can
 * find its own and leave everything else alone.
 */
async function clearPreviousRiders(actor) {
  const stale = Array.from(actor?.effects ?? []).filter(
    (e) => e.getFlag?.(SYSTEM_ID, RIDER_FLAG)
  );
  if (stale.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map((e) => e.id));
  }
}

/**
 * Apply whichever Wild Shape riders this actor's feats grant.
 *
 * @param {Actor} actor
 * @param {Item} spell        the form spell just cast
 * @param {object} options
 * @param {object} options.spellData    the spell's `system`
 * @param {string} options.durationText the cast's duration, warps included
 * @param {string[]} options.lines      card lines, appended to in place
 * @returns {Promise<{resistance: string|null, defence: number}>}
 */
export async function applyWildShapeRiders(actor, spell, { spellData = {}, durationText = "", lines = [] } = {}) {
  const none = { resistance: null, defence: 0 };
  if (!isFormSpell(spellData?.traits)) return none;

  const feats = featNamesOf(actor);
  const choices = shapeResistanceChoices(feats);
  const defence = ferociousDefenceBonus(feats);
  if (!choices.length && !defence) return none;

  await clearPreviousRiders(actor);

  const parsed = parseSpellDuration(durationText || spellData?.duration);
  const duration = {};
  if (parsed?.seconds != null) {
    duration.seconds = parsed.seconds;
    duration.startTime = Number(game.time?.worldTime ?? 0);
  }
  if (parsed?.rounds != null) duration.rounds = parsed.rounds;

  const resistance = choices.length ? await chooseResistance(spell?.name ?? "Wild Shape", choices) : null;

  const changes = [];
  if (resistance) {
    // A COMMA-LED STRING, which is how every other source of resistance
    // in this system writes to this field — `prepareTextLists` tidies the
    // leading comma when nothing wrote first.
    changes.push({
      key: "system.combat.resistances",
      type: CHANGE_TYPE.ADD,
      value: `, ${resistance}`,
      priority: 20
    });
  }
  if (defence) {
    changes.push({
      key: "system.combat.db",
      type: CHANGE_TYPE.ADD,
      value: String(defence),
      priority: 20
    });
  }
  if (!changes.length) return none;

  const names = [
    resistance ? `${resistance} resistance` : "",
    defence ? `+${defence} dodge DB` : ""
  ].filter(Boolean);

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${spell?.name ?? "Wild Shape"} — ${names.join(", ")}`,
    img: spell?.img ?? "icons/svg/pawprint.svg",
    description: "Granted by your Wild Shape feats for as long as this form lasts.",
    changes,
    duration: Object.keys(duration).length ? duration : undefined,
    flags: { [SYSTEM_ID]: { [RIDER_FLAG]: true } }
  }]);

  if (resistance) {
    lines.push(line(`<em>Changing form grants <strong>${resistance} resistance</strong> for the duration.</em>`));
  }
  if (defence) {
    lines.push(line(`<em>Ferocious Shape — <strong>+${defence} dodge bonus to DB</strong> while in this form, and <strong>+${defence}</strong> to natural attacks.</em>`));
  }
  return { resistance: resistance ?? null, defence };
}
