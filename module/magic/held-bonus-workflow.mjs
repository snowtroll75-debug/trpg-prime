/**
 * Spending a held bonus, against real documents.
 *
 * NEW at 3.411.0. The Foundry half of `held-bonus.mjs`, kept apart so the
 * rule stays importable by the harness — the split this project has now
 * paid for six times.
 *
 * ONE FUNCTION, NOT TWO. "Is it still there?" and "consume it" as
 * separate calls is the shape `consumeMarker` was written to avoid: two
 * cards rendered at the same moment would both find it and both spend
 * it. Deleting and reporting whether there was anything to delete makes
 * the correct use the only use.
 */

import { HELD_BONUS_FLAG, HELD_SPENT_ROUND_FLAG, normaliseHeldBonus } from "./held-bonus.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Spend one held bonus by its effect id.
 *
 * @returns {Promise<boolean>} whether it was there to spend
 */
export async function spendHeldBonus(actor, effectId) {
  const effect = actor?.effects?.get?.(effectId);
  if (!effect || effect.disabled) return false;
  const spec = normaliseHeldBonus(effect.flags?.[SYSTEM_ID]?.[HELD_BONUS_FLAG]);
  if (!spec) return false;

  // A PER-ROUND BONUS IS NOT USED UP (3.612.0, R8). Inspire Heroics' advantage
  // comes back each round while the creature stands in the composition, so
  // the round is recorded on the effect and the effect stays.
  if (spec.perRound) {
    const { heldRoundKey, heldBonusSpentThisRound } = await import("./held-bonus.mjs");
    const combat = game.combat?.started ? game.combat : null;
    const key = heldRoundKey({ combatId: combat?.id ?? null, round: combat?.round ?? null, worldTime: game.time?.worldTime ?? 0 });
    if (heldBonusSpentThisRound(spec, effect.getFlag?.(SYSTEM_ID, HELD_SPENT_ROUND_FLAG), key)) return false;
    // NOR BY A SECOND CASTING OF IT (3.613.0, R4): another effect of the same
    // name already spent this round refuses this one too, so two cards drawn
    // before either was clicked cannot buy two advantages.
    const sameName = spec.label.trim().toLowerCase();
    const siblingSpent = Array.from(actor.effects ?? []).some((other) => {
      if (other.id === effect.id || other.disabled) return false;
      const o = normaliseHeldBonus(other.flags?.[SYSTEM_ID]?.[HELD_BONUS_FLAG]);
      return o?.perRound && o.label.trim().toLowerCase() === sameName
        && heldBonusSpentThisRound(o, other.getFlag?.(SYSTEM_ID, HELD_SPENT_ROUND_FLAG), key);
    });
    if (siblingSpent) return false;
    await effect.setFlag(SYSTEM_ID, HELD_SPENT_ROUND_FLAG, key);
    return true;
  }

  // THE IMMUNITY IS STAMPED BEFORE THE DELETE, and the order is the
  // point — Guidance's "the target is THEN temporarily immune for 1
  // hour". If the delete throws, the holder has already had the benefit,
  // so the immunity they earned by spending it must be recorded too, or
  // a failure to tidy up becomes a second free casting.
  if (spec.immunitySeconds > 0) {
    try {
      const { withImmunity, IMMUNITY_FLAG, prunedImmunities } =
        await import("../temporary-immunity.mjs");
      const now = Number(game.time?.worldTime ?? 0);
      const record = actor?.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
      const key = spec.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await actor.setFlag(SYSTEM_ID, IMMUNITY_FLAG,
        withImmunity(prunedImmunities(record, now), key, spec.immunitySeconds, now));
    } catch (err) {
      console.warn(`${SYSTEM_ID} | could not stamp the immunity for "${spec.label}"`, err);
    }
  }

  try {
    await effect.delete();
  } catch (err) {
    // IT STILL COUNTS AS SPENT. The holder has already had the benefit
    // this call is reporting; returning false would hand it to them a
    // second time. Logged rather than swallowed.
    console.warn(`${SYSTEM_ID} | could not delete spent held bonus "${spec.label}"`, err);
  }
  return true;
}
