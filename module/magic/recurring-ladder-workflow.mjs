/**
 * THE SECOND LADDER — rolled on a turn boundary, for whoever is still
 * standing in the area.
 *
 * NEW at 3.587.0, for Graham's R2 of 24 September 2026. The Foundry
 * side; the rule itself is `normaliseRecurringLadder` in save-ladder.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DISTURBING TENTACLES PRINTS TWO SAVES AND MEANS TWO MOMENTS.
 *
 *   "All creatures are affected based upon their reflex saving throw"
 *      — at the cast, for everyone the template caught.
 *   "Whenever a creature ENDS ITS TURN in the area, the sheer horror …
 *    forces a Will save"
 *      — every turn after, for whoever is still there.
 *
 * Graham's ruling of 24 September 2026, in full: *"the first save is
 * made upon the casting of the spell for all creatures in the area. The
 * second save is made at the end of each turn for a creature that is
 * still in the area of the spell."*
 *
 * ─────────────────────────────────────────────────────────────────────
 * A REGION, ASKED FROM THE TURN CLOCK — the shape `elemental-nexus-
 * workflow.mjs` established and the reasoning transfers exactly:
 *
 *   IT IS A PLACE. "Area 20-foot radius adjacent to a flat surface" is a
 *   Region, not an emanation — it does not follow its caster, and
 *   `runningEmanations()` can never see it.
 *
 *   IT ASKS "WHO IS STILL HERE", which movement cannot answer. A
 *   creature that walked in and out twice owes nothing; one that has not
 *   moved all turn owes a save, and no movement hook fires for standing
 *   still.
 *
 * THE ONE DIFFERENCE FROM THE NEXUS is the boundary: the nexus asks at
 * the START of a turn ("any creature that begins their turn within"),
 * this asks at the END. Both moments are named in the data rather than
 * baked in here, because the page's wording is the only thing that
 * decides it and the next spell may say the other one.
 */

import { RECURRING_LADDER_FLAG } from "./save-ladder.mjs";
import { normaliseRecurringLadder, saveLadderOutcome, saveLadderLine } from "./save-ladder.mjs";

const SYSTEM_ID = "trg-prime";

/** Every region on the scene carrying a recurring ladder, with its spec. */
function ladderRegions() {
  const out = [];
  for (const region of canvas?.scene?.regions ?? []) {
    const raw = region.getFlag?.(SYSTEM_ID, RECURRING_LADDER_FLAG) ?? null;
    const spec = normaliseRecurringLadder(raw);
    if (spec) {
      out.push({
        region, spec,
        name: String(raw?.name ?? "This spell"),
        saveDC: Number(raw?.saveDC) || 0,
        casterUuid: String(raw?.casterUuid ?? "")
      });
    }
  }
  return out;
}

/**
 * Roll every recurring ladder this creature is standing in.
 *
 * SWALLOWS ITS OWN FAILURE, for the reason the nexus sweep does: this
 * runs inside the turn-advance path, and a throw here would leave the
 * encounter mid-turn to report a bad flag.
 *
 * @param {Actor|null} actor the creature whose turn is ending
 * @param {Token|null} token its token
 * @param {"endOfTurn"|"startOfTurn"} moment which boundary this is
 * @returns {Promise<string[]>} lines for the turn card
 */
export async function applyRecurringLadders(actor, token, moment = "endOfTurn") {
  const lines = [];
  try {
    if (!actor || !token) return lines;
    const zones = ladderRegions();
    if (!zones.length) return lines;

    const { TRGCheck } = await import("../dice/check.mjs");
    const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
    const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
    const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");

    for (const { region, spec, name, saveDC, casterUuid } of zones) {
      // THE MOMENT THE DATA NAMES, not the one this function was called
      // at. One sweep serves both boundaries and each zone answers for
      // itself, so a start-of-turn ladder cannot fire at the end.
      if (spec.on !== moment) continue;

      // ASKED OF THE REGION rather than recomputed from a radius — a
      // region a GM has reshaped by hand still answers for where it is.
      let inside = false;
      try {
        inside = region.testPoint({
          x: token.center?.x ?? token.x,
          y: token.center?.y ?? token.y,
          elevation: token.document?.elevation ?? 0
        });
      } catch {
        inside = false;
      }
      if (!inside) continue;

      const check = await TRGCheck.roll({
        actor,
        label: `${actor.name} — ${spec.save.charAt(0).toUpperCase() + spec.save.slice(1)} Save`,
        subtitle: `${name} — still in the area`,
        type: "save",
        save: spec.save,
        dc: saveDC
      });
      const rolled = check?.outcome?.degree?.key ?? "failure";
      const { basicSavingThrow } = await import("../dice/resolution.mjs");
      const outcome = saveLadderOutcome(spec, rolled, {
        basicSeverity: spec.basicCriticals ? basicSavingThrow(rolled, check?.outcome?.margin ?? null).criticalSeverity : null
      });

      let taken = 0;
      if (!outcome.harmless && outcome.dice) {
        const roll = await new Roll(outcome.dice).evaluate();
        const packet = resolveAgainstDefences(actor.system ?? {}, {
          amount: roll.total,
          type: spec.damageType,
          creatureTypeSystem: ownedCreatureTypeSystem(actor),
          // A SPELL IS A MAGICAL SOURCE (3.548.0) — see magic/spell-source.mjs.
          // Caught by `verify-defence-vocabulary` W1 on the full sweep,
          // which names every spell damage path that has not said so:
          // without this, mundane resistance halves the tentacles as if
          // they were a rock. The nexus and flat-ladder workflows this
          // file was modelled on both carry it; I copied the shape and
          // not the line.
          magical: true,
          // A REGION EVERY CREATURE INSIDE IS SUBJECTED TO, which is
          // what `area` means — the same reading the nexus takes, and
          // for the same reason: the save is owed for standing there.
          area: true
        });
        taken = packet.taken;
        if (taken > 0) {
          await applyDamageAndCheckDying(actor, taken, { isCritical: Boolean(outcome.severity) });
        }
      }
      lines.push(`<strong>${name}</strong> — ${saveLadderLine(actor.name, rolled, outcome, taken, spec.damageType)}`);

      if (outcome.severity && taken > 0) {
        /*
         * AIMED AT THE CREATURE IN THE AREA (3.609.1, the 3.609.0 live test's
         * F1). This passed the saving creature as the ATTACKER and no target,
         * so the critical was rolled and printed and applied to nobody —
         * Portal Maelstrom's minor criticals and Incendiary Cloud's Fatal one
         * all touched no one. The caster recorded on the Region rolls it;
         * with no caster left to find, the creature itself stands in, which
         * only changes whose name heads the card.
         */
        let caster = null;
        try { caster = casterUuid ? ((await fromUuid(casterUuid)) ?? null) : null; } catch { caster = null; }
        if (caster && caster.documentName !== "Actor") caster = caster.actor ?? null;
        const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
        await rollCriticalInjury(caster ?? actor, {
          targetActor: actor,
          damageType: spec.damageType,
          severity: outcome.severity,
          attackBonus: saveDC
        });
      }
    }
  } catch (error) {
    console.error("TRG Prime | a recurring save ladder could not be rolled this turn", error);
  }
  return lines;
}

/** Record a recurring ladder on the Region a spell's template just created. */
export async function recordRecurringLadder(region, descriptor) {
  if (!region?.setFlag) return null;
  const spec = normaliseRecurringLadder(descriptor);
  if (!spec) return null;
  await region.setFlag(SYSTEM_ID, RECURRING_LADDER_FLAG, descriptor);
  return spec;
}
