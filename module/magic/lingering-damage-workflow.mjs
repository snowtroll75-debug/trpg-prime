/**
 * The Foundry half of lingering damage (3.650.0). See lingering-damage.mjs.
 *
 *   recordLingering        stamped by an area on each creature it damaged
 *   applyLingeringDamage   Phase 1 of that creature's turn: the save, the
 *                          damage again, and the record kept or ended
 */
import { LINGERING_FLAG, lingeringAfterTurn, lingeringRecord } from "./lingering-damage.mjs";

const SYSTEM_ID = "trg-prime";

/** Lay the record on a creature, as an effect of its own (relayed to the GM when unowned). */
export async function recordLingering(actor, raw) {
  const record = lingeringRecord(raw);
  if (!actor || !record) return null;
  const { createEffectsOn } = await import("../combat/target-relay-workflow.mjs");
  await createEffectsOn(actor, [{
    name: `${record.label} (lingering)`,
    img: "icons/svg/poison.svg",
    flags: { [SYSTEM_ID]: { [LINGERING_FLAG]: record } }
  }]);
  return record;
}

/**
 * At the start of the creature's turn: each lingering record's save, and its
 * damage again under that save.
 *
 * @returns {Promise<string[]>} the turn card's lines
 */
export async function applyLingeringDamage(actor) {
  const lines = [];
  const effects = Array.from(actor?.effects ?? []).filter((e) => e.getFlag?.(SYSTEM_ID, LINGERING_FLAG));
  if (!effects.length) return lines;
  const { TRGCheck } = await import("../dice/check.mjs");
  const { withCheckModifiers } = await import("../dice/check-modifiers.mjs");
  const { basicSavingThrow, levelDC } = await import("../dice/resolution.mjs");
  const { applyTypedDamage, describeDamage } = await import("../combat/damage-workflow.mjs");
  for (const effect of effects) {
    const record = effect.getFlag(SYSTEM_ID, LINGERING_FLAG);
    const dc = Number(record.dc) || levelDC(record.sourceLevel || 0);
    const save = record.save;
    const check = await TRGCheck.roll(withCheckModifiers({
      actor, label: `${actor.name} — ${save.charAt(0).toUpperCase()}${save.slice(1)} Save`,
      subtitle: `${record.label} lingers — DC ${dc}`, type: "save", save, dc
    }));
    const key = check?.outcome?.degree?.key ?? "failure";
    const multiplier = record.basic
      ? Number(basicSavingThrow(key, check?.outcome?.margin ?? null)?.damageMultiplier ?? 1)
      : (check?.outcome?.degree?.success ? 0 : 1);
    const amount = Math.floor(record.amount * multiplier);
    let dealt = 0;
    if (amount > 0) {
      const result = await applyTypedDamage(actor, { amount, type: record.type, sourceLevel: record.sourceLevel, sourceName: record.sourceName });
      dealt = Number(result?.applied ?? 0) || 0;
      lines.push(`<strong>${record.label}</strong> lingers: ${describeDamage(result.packet, actor.name)}`);
    } else {
      lines.push(`<strong>${record.label}</strong> lingers: ${actor.name} takes no damage.`);
    }
    const next = lingeringAfterTurn(record, dealt);
    if (next) {
      await effect.setFlag(SYSTEM_ID, LINGERING_FLAG, next);
      lines.push(`<em>${next.roundsLeft} round(s) of ${record.label} left.</em>`);
    } else {
      await effect.delete();
      lines.push(`<em>${record.label} has run its course on ${actor.name}.</em>`);
    }
  }
  return lines;
}
