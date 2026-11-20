/**
 * rooted-movement-workflow — rolls the Storgar's DC 5 flat check when a
 * friendly spell with the Movement trait is cast upon them (3.701.0). The
 * rule and its reading are in rooted-movement.mjs.
 *
 * ASKED AFTER THE CAST HAS SUCCEEDED AND BEFORE ANYTHING LANDS: beside the
 * Teleportation trait's own arrival check, which it runs ahead of, so a
 * Storgar the spell does not work on is never told to roll Spatial
 * Awareness. The PP and AP stay spent: the spell was cast, and simply does
 * not work on them.
 */

import { hasTrait } from "../traits.mjs";
import { sameSide } from "../combat/aid-bonus.mjs";
import { rootedFlatCheckDC, rootedCheckDue, rootedCandidates, rootedFailureLine, rootedSuccessLine } from "./rooted-movement.mjs";

/** The disposition of a creature's token on the canvas, or null. */
function dispositionOf(actor) {
  const token = actor?.getActiveTokens?.()?.[0] ?? null;
  const value = token?.document?.disposition ?? actor?.prototypeToken?.disposition;
  return value === undefined || value === null ? null : Number(value);
}

/**
 * Roll the flat check for every rooted creature this cast reaches.
 *
 * @param {Actor} caster
 * @param {Item} spell
 * @param {object} p
 * @param {Actor[]} p.targeted the actors the caster targeted
 * @param {boolean} p.isArea   the spell has an area
 * @returns {Promise<{failed: Set<string>, casterFailed: boolean, lines: string[]}>}
 *   `failed` holds the uuids of the creatures the spell does not work on.
 */
export async function rootedMovementChecks(caster, spell, { targeted = [], isArea = false } = {}) {
  const result = { failed: new Set(), casterFailed: false, lines: [] };
  const traits = String(spell?.system?.traits ?? "");
  if (!hasTrait(traits, "movement")) return result;
  try {
    const casterSide = dispositionOf(caster);
    for (const actor of rootedCandidates(caster, targeted, { isArea, targetsText: spell?.system?.targets ?? "" })) {
      const dc = rootedFlatCheckDC(Array.from(actor.items ?? []));
      const isSelf = actor === caster || (actor.uuid && actor.uuid === caster?.uuid);
      const due = rootedCheckDue({
        spellTraits: traits, dc, isSelf, chosen: true,
        sameSide: sameSide(casterSide, dispositionOf(actor))
      });
      if (!due) continue;
      const { TRGCheck } = await import("../dice/check.mjs");
      const check = await TRGCheck.roll({
        actor,
        label: `${spell.name}: Storgar Flat Check`,
        subtitle: `A friendly spell with the Movement trait. DC ${dc}`,
        type: "flat",
        flat: true,
        dc
      });
      const total = check?.outcome?.total ?? check?.total ?? "?";
      if (check?.outcome?.degree?.success) {
        result.lines.push(rootedSuccessLine(actor.name, spell.name, dc, total));
        continue;
      }
      result.failed.add(actor.uuid);
      if (isSelf) result.casterFailed = true;
      result.lines.push(rootedFailureLine(actor.name, spell.name, dc, total));
    }
  } catch (error) {
    console.error("TRG Prime | the Storgar flat check could not be rolled", error);
  }
  return result;
}
