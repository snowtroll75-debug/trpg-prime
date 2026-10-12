/**
 * The Foundry side of the elemental nexus (see elemental-nexus.mjs).
 *
 * NEW at 3.477.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * REGIONS, ASKED FROM THE TURN CLOCK.
 *
 * Two facts decide where this lives, and they pull in different
 * directions:
 *
 *   IT IS A PLACE — "Area 10-foot radius, Range 60 feet" — so the zone
 *   is a Region and NOT an emanation. `runningEmanations()` can never
 *   see it, which is the mistake the first draft of area riders made.
 *
 *   IT ASKS "WHO BEGINS A TURN HERE" — which movement cannot answer, so
 *   it is swept from the turn clock beside Luminance rather than from a
 *   `moveToken` hook like hazardous terrain.
 *
 * So: a region flag, read at the start of every creature's turn.
 */

import {
  NEXUS_FLAG, normaliseNexus, nexusDegree, nexusOutcome, nexusSave, nexusLine
} from "./elemental-nexus.mjs";

const SYSTEM_ID = "trg-prime";

/** Every nexus region on the scene, with its spec. */
function nexusRegions() {
  const out = [];
  for (const region of canvas?.scene?.regions ?? []) {
    const raw = region.getFlag?.(SYSTEM_ID, NEXUS_FLAG) ?? null;
    const spec = normaliseNexus(raw);
    if (spec) out.push({ region, spec, element: String(raw?.element ?? ""), saveDC: Number(raw?.saveDC) || 0 });
  }
  return out;
}

/**
 * Charge every nexus this creature is standing in, at the start of its
 * turn.
 *
 * SWALLOWS ITS OWN FAILURE. This runs inside the turn-advance path; a
 * throw here would leave the encounter mid-turn to report a bad flag.
 *
 * @param {Actor|null} actor the creature whose turn is starting
 * @param {Token|null} token its token
 * @returns {Promise<string[]>} lines for the turn card
 */
export async function applyElementalNexus(actor, token) {
  const lines = [];
  try {
    if (!actor || !token) return lines;
    const zones = nexusRegions();
    if (!zones.length) return lines;

    const { TRGCheck } = await import("../dice/check.mjs");
    const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
    const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
    const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");

    for (const { region, spec, element, saveDC } of zones) {
      // ASKED OF THE REGION, not recomputed from a radius — a region a
      // GM has reshaped by hand still answers for where it now is.
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

      const save = nexusSave(element);
      if (!save) continue;

      const check = await TRGCheck.roll({
        actor,
        label: `${actor.name} — ${save} Save`,
        subtitle: `${spec.label} (${element}) — DC ${saveDC}`,
        type: "save",
        save: save.toLowerCase(),
        dc: saveDC
      });
      const rolled = check?.outcome?.degree?.key ?? "failure";
      const outcome = nexusOutcome(spec, nexusDegree(rolled));
      if (!outcome) continue;

      let taken = 0;
      let total = 0;
      if (!outcome.harmless) {
        const roll = await new Roll(outcome.dice).evaluate();
        total = roll.total;
        const packet = resolveAgainstDefences(actor.system ?? {}, {
          amount: roll.total,
          type: element,
          creatureTypeSystem: ownedCreatureTypeSystem(actor),
          // A SPELL IS A MAGICAL SOURCE (3.548.0) — see magic/spell-source.mjs.
          // Until this release no spell path in the system set this, so
          // mundane resistance halved spell damage as if it were a rock.
          // The nexus is a region every creature inside is subjected to,
          // which is what `area` means.
          magical: true,
          area: true
        });
        taken = packet.taken;
        if (taken > 0) await applyDamageAndCheckDying(actor, taken, { isCritical: false });
      }
      lines.push(nexusLine(spec, actor.name, element, rolled, taken, total, outcome));

      // "AND A MINOR CRITICAL" — rolled on the zone's own element, through
      // the same door every other critical in the system goes through.
      // A Light Critical reads as Serious: see elemental-nexus.mjs.
      if (outcome.severity) {
        const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
        await rollCriticalInjury(actor, {
          damageType: element,
          severity: outcome.severity,
          attackBonus: 0
        });
      }
    }
  } catch (error) {
    console.error("TRG Prime | an elemental nexus could not be applied this turn", error);
  }
  return lines;
}

/** Record a nexus on the Region a spell's template just created. */
export async function recordNexus(region, descriptor) {
  if (!region?.setFlag) return null;
  const spec = normaliseNexus(descriptor);
  if (!spec) return null;
  await region.setFlag(SYSTEM_ID, NEXUS_FLAG, descriptor);
  return spec;
}
