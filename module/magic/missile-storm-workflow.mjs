/**
 * The Foundry side of the missile storm (see missile-storm.mjs).
 *
 * NEW at 3.478.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT RESOLVES AT CAST, AGAINST WHAT THE TEMPLATE CAUGHT.
 *
 * Unlike the elemental nexus — which is a PLACE, and therefore a Region
 * read from the turn clock — this is a single salvo fired once. There is
 * nothing to remember afterwards: no region, no flag, no duration. So it
 * runs in the effects pass of the cast, reading the `caught` list the
 * area block has already computed, line of effect and kind gate and
 * disposition filter all applied.
 *
 * THE ONE THING IT MUST NOT DO IS RECOMPUTE WHO IS INSIDE. The area
 * block spares creatures behind walls and prunes by kind; a second
 * geometry pass here would quietly re-include them, and the card would
 * still read correctly because it prints its own list.
 */

import {
  normaliseMissileStorm, stormCountFormula, stormFormula, stormLine,
  stormEmptyLine, stormAutomaticLine
} from "./missile-storm.mjs";
import { automaticHitNoteApplies } from "./cast-result-line.mjs";

/**
 * Fire one storm at every creature caught in the area.
 *
 * @param {object|null} row the effect row as authored
 * @param {Actor[]} targets the actors the template caught
 * @returns {Promise<string[]>} lines for the cast card
 */
export async function applyMissileStorm(row, targets) {
  const spec = normaliseMissileStorm(row);
  if (!spec) return [];

  const caught = (targets ?? []).filter(Boolean);
  /*
   * THE AUTOMATIC-HIT NOTE IS A PROMISE ABOUT DAMAGE (3.481.0).
   *
   * It exists so a 50-foot area spell resolving with no save prompt does
   * not read as a broken save. With nobody targeted there is no
   * resolution to explain and the sentence becomes a claim about
   * missiles that never flew — which is exactly how it read on the
   * refunded card driving 3.480.0 produced: "the missiles simply land"
   * printed directly above "finds nothing in the area to answer".
   */
  const lines = [];
  if (!caught.length) {
    lines.push(stormEmptyLine(spec));
    return lines;
  }
  if (automaticHitNoteApplies(caught.length)) lines.push(stormAutomaticLine(spec));

  const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
  const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");

  for (const target of caught) {
    // THE TARGET'S OWN SIZE — Graham's ruling of 3 September 2026. Read
    // from the creature template's `identity.size`, which defaults to
    // "medium" for every actor, so a sheet nobody has touched behaves as
    // the printed base salvo rather than as an error.
    const size = String(target.system?.identity?.size ?? "");
    const countFormula = stormCountFormula(spec, size);

    // THE COUNT IS ROLLED FIRST AND IN ITS OWN RIGHT. It is not a step
    // towards the damage roll that can be folded into it — the card
    // prints it, because "84 force damage" from an unstated number of
    // missiles is a number no player can check.
    const countRoll = await new Roll(countFormula).evaluate();
    const missiles = Math.max(0, Math.trunc(countRoll.total));

    const formula = stormFormula(spec, missiles);
    if (!formula) {
      // A COUNT OF ZERO IS ARITHMETICALLY IMPOSSIBLE for the printed row
      // (2d6+6 has a floor of 8), so this is only reachable through a
      // row somebody has edited. It says so rather than rolling "0d4".
      lines.push(stormLine(spec, target.name, size, missiles, countFormula, 0, 0, "—"));
      continue;
    }

    const damageRoll = await new Roll(formula).evaluate();
    const packet = resolveAgainstDefences(target.system ?? {}, {
      amount: damageRoll.total,
      type: spec.damageType,
      creatureTypeSystem: ownedCreatureTypeSystem(target),
      // A SPELL IS A MAGICAL SOURCE (3.548.0) — see magic/spell-source.mjs.
      // NEITHER area NOR targeted: missiles strike chosen targets with
      // no attack roll and no area, which is exactly the case both of
      // Graham's definitions exclude. Left at the defaults rather than
      // forced into whichever is nearer.
      magical: true
    });
    if (packet.taken > 0) {
      await applyDamageAndCheckDying(target, packet.taken, { isCritical: false });
    }
    lines.push(stormLine(
      spec, target.name, size, missiles, countFormula,
      packet.taken, damageRoll.total, formula, Boolean(packet.immune)
    ));
  }
  return lines;
}
