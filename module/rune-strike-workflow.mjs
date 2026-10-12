/**
 * WHAT A REGISTERED WEAPON RUNE DOES AFTER THE BLOW (3.626.0). The
 * Foundry half of rune-declarations.mjs's `afterStrike` and `onCritical`:
 *
 *   Soulchain  "Once per round after a successful Strike … The target must
 *               make a Will saving throw against your Level DC" — a ladder.
 *   Banishing  "Once per round when the weapon inflicts a Critical hit upon a
 *               disembodied spirit, incorporeal Undead or possessing entity …
 *               must attempt a Will saving throw against your Level DC."
 *   Remembrance "Once per round when you inflict a Critical hit … You may
 *               immediately attempt a Recall Knowledge check" — a line.
 *
 * The save is rolled for the struck creature through TRGCheck, the way
 * the end-of-turn condition saves are; the ladder's printed line for the
 * degree is said, and the conditions the declaration names for that degree
 * are applied through the ordinary condition door. The once-per-round
 * marker lives in the same per-round map the strike riders burn.
 */

import { afterStrikeFires, afterStrikeMarkerKey, afterStrikeOutcome, mercifulApplies, runeAfterStrikes, runeCriticalLines, runeStabilisesAtZero } from "./rune-declarations.mjs";
import { levelDC } from "./dice/resolution.mjs";
import { creatureTypesOf } from "./aligned.mjs";
import { creatureTraits } from "./creature-traits.mjs";

const SYSTEM_ID = "trg-prime";
const USED_FLAG = "strikeRidersUsed";

/**
 * @returns {Promise<string[]>} lines for the damage card
 */
export async function applyRuneAfterStrikes(actor, weapon, targetActor, { critical = false } = {}) {
  const lines = [];
  if (!actor || !weapon || !targetActor) return lines;
  if (critical) for (const text of runeCriticalLines(weapon)) lines.push(`<em>${text}</em>`);
  const specs = runeAfterStrikes(weapon);
  if (!specs.length) return lines;
  const used = actor.getFlag?.(SYSTEM_ID, USED_FLAG) ?? {};
  const ctx = {
    critical: Boolean(critical),
    used,
    targetTypes: creatureTypesOf(targetActor.system ?? {}),
    targetTraits: creatureTraits(targetActor.system ?? {})
  };
  let next = null;
  for (const spec of specs) {
    const marker = afterStrikeMarkerKey(spec, weapon);
    if (!afterStrikeFires(spec, { ...ctx, marker })) continue;
    const save = String(spec.save ?? "will").toLowerCase();
    const dc = levelDC(Math.max(0, Math.floor(Number(actor.system?.identity?.level ?? 0) || 0)));
    const { TRGCheck } = await import("./dice/check.mjs");
    const check = await TRGCheck.roll({
      actor: targetActor,
      label: `${targetActor.name} — ${save.charAt(0).toUpperCase() + save.slice(1)} Save`,
      subtitle: `${spec.label} — against ${actor.name}'s Level DC ${dc}`,
      type: "save",
      save,
      dc
    });
    const degree = check?.outcome?.degree?.key ?? "failure";
    const outcome = afterStrikeOutcome(spec, degree);
    const label = check?.outcome?.degree?.label ?? degree;
    lines.push(`<strong>${spec.label}</strong> — ${targetActor.name} rolls ${save} against DC ${dc}: <strong>${label}</strong>.${outcome.text ? ` ${outcome.text}` : ""}`);
    if (outcome.conditions.length) {
      const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
      const { conditionLabel } = await import("./conditions/condition-rules.mjs");
      const tags = outcome.conditions.map((c) => ({ key: c.key, label: conditionLabel(c.key), value: c.value ?? null }));
      const applied = await applyConditionTags(targetActor, tags, {});
      lines.push(`Applied to ${targetActor.name}: ${formatAppliedTags(applied)}.`);
    }
    if (spec.oncePerRound) next = { ...(next ?? used), [marker]: true };
  }
  if (next && actor.setFlag) await actor.setFlag(SYSTEM_ID, USED_FLAG, next);
  return lines;
}

/**
 * MERCIFUL (3.626.0): "Whenever an attack with the weapon would reduce a
 * living creature to 0 HP, you may choose to have the creature become
 * Stable immediately after resolving the attack … it cannot kill the
 * target through excess damage from that Strike unless you choose not to
 * invoke the rune." Asked once the blow has landed; a yes clamps Dying
 * to 1 and sets the Stabilised marker the Dying Check reads (the same
 * marker Stabilise the spell leaves). The damage and any injury stand.
 * @returns {Promise<string[]>}
 */
export async function offerMerciful(actor, weapon, targetActor, damageResult) {
  if (!runeStabilisesAtZero(weapon) || !targetActor) return [];
  const { hasNoDeathState } = await import("./creature-type-rules.mjs");
  const { ownedCreatureTypeSystem } = await import("./creature-type-rules.mjs");
  if (!mercifulApplies(damageResult?.case, { noDeathState: hasNoDeathState(ownedCreatureTypeSystem(targetActor)) })) return [];
  const { DialogV2 } = foundry.applications.api;
  const yes = await DialogV2.confirm({
    window: { title: "Merciful" },
    content: `<p><strong>${targetActor.name}</strong> is reduced to 0 HP by ${weapon.name}. Invoke Merciful — the creature becomes <strong>Stable</strong> (Dying 1, and its Dying condition does not increase on the next Dying Check), and this Strike cannot kill it through excess damage?</p>`,
    rejectClose: false
  });
  if (!yes) return [`<em>Merciful not invoked — ${targetActor.name} suffers the full result.</em>`];
  const dying = Number(targetActor.getConditionValue?.("dying") ?? 0);
  if (dying > 1 || !targetActor.hasCondition?.("dying")) await targetActor.toggleStatusEffect("dying", { value: 1 });
  const { MARKERS, markerFlagData, findMarker } = await import("./magic/markers.mjs");
  if (!findMarker(targetActor, "stabilised")) {
    await targetActor.createEmbeddedDocuments("ActiveEffect", [{
      name: `Merciful — ${MARKERS.stabilised.label}`,
      img: weapon.img,
      origin: weapon.uuid,
      flags: { [SYSTEM_ID]: markerFlagData("stabilised") }
    }]);
  }
  return [`<strong>Merciful:</strong> ${targetActor.name} is Stable at 0 HP — Dying 1, and the next Dying Check cannot worsen it. The damage and any injury stand.`];
}
