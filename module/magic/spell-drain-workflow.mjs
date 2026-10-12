/**
 * The Foundry half of Spell Drain (see spell-drain.mjs).
 *
 * NEW at 3.608.0. TWO SIDES:
 *   - the drainer's cast leaves a rung waiting on the target
 *     (`recordSpellDrain`, from the spell applier);
 *   - the target's next casting takes it (`takeSpellDrain`, then
 *     `settleSpellDrain`, from cast-workflow.mjs).
 */

import {
  SPELL_DRAIN_FLAG, drainedDegree, drainedPP, normaliseSpellDrain, spellDrainLine, spellDrainRecord
} from "./spell-drain.mjs";

const SYSTEM_ID = "trg-prime";

/** Leave a rung waiting on the target. */
export async function recordSpellDrain(target, row, drainer) {
  const spec = normaliseSpellDrain(row);
  if (!spec || !target?.setFlag) return null;
  const record = spellDrainRecord(spec, {
    drainerUuid: drainer?.uuid ?? "",
    drainerName: drainer?.name ?? "",
    worldTime: Number(game.time?.worldTime ?? 0)
  });
  await target.setFlag(SYSTEM_ID, SPELL_DRAIN_FLAG, record);
  return record;
}

/** The rung waiting on a caster, or null. Read, not spent. */
export function pendingSpellDrain(actor) {
  const raw = actor?.getFlag?.(SYSTEM_ID, SPELL_DRAIN_FLAG) ?? null;
  if (!raw) return null;
  const spec = normaliseSpellDrain(raw);
  return spec ? { ...raw, ...spec } : null;
}

/**
 * Spend a waiting drain on the casting that is resolving now.
 *
 * SPENT WHATEVER HAPPENS NEXT: the drain was aimed at one announced
 * casting, and this is it.
 *
 * @returns {Promise<{degree: string, line: string}>}
 */
export async function settleSpellDrain(actor, record, { rolledDegree, ppSpent = 0, castName = "" }) {
  const degree = drainedDegree(record, rolledDegree);
  let gained = 0;
  if (record.forced && record.absorb && ppSpent > 0 && record.drainerUuid) {
    const found = await fromUuid(record.drainerUuid).catch(() => null);
    const drainer = found?.actor ?? found;
    if (drainer?.update) {
      const pool = Number(drainer.system?.resources?.pp?.value ?? 0);
      const max = Number(drainer.system?.resources?.pp?.max ?? 0);
      gained = drainedPP(ppSpent, pool, max);
      if (gained) await drainer.update({ "system.resources.pp.value": pool + gained });
    }
  }
  await actor.unsetFlag?.(SYSTEM_ID, SPELL_DRAIN_FLAG);
  return { degree, line: spellDrainLine(record, { castName, degree, gained, spent: ppSpent }) };
}
