/**
 * A RELAYED COUNTERACT, CARRIED OUT ON THE GM'S CLIENT (3.686.0; the Block 8a
 * review, finding 1). A player's Remove Curse on the GM's NPC: the caster's
 * client asks by `counteractEffectOn` (combat/target-relay-workflow.mjs), and
 * the GM's client deletes the effect here — only when the row's traits reach
 * the effect's own traits, read here (its flag, else its origin spell's), never
 * a bare delete by id, whatever the request says.
 */

const SYSTEM_ID = "trg-prime";

/** @returns {Promise<boolean>} whether the effect is gone */
export async function counteractEffectAsGM(target, effectId, traits) {
  const effect = target?.effects?.get?.(effectId);
  if (!effect || effect.disabled) return false;
  const { SOURCE_TRAITS_FLAG } = await import("../combat/effect-application-workflow.mjs");
  let sourceTraits = effect.flags?.[SYSTEM_ID]?.[SOURCE_TRAITS_FLAG] ?? null;
  if (!sourceTraits && effect.origin) {
    const origin = await (globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid)?.(effect.origin)?.catch?.(() => null);
    sourceTraits = origin?.type === "spell" ? origin.system?.traits ?? "" : "";
  }
  const { counteractReachesEffect } = await import("./counteract-row.mjs");
  if (!counteractReachesEffect(traits, { id: effect.id, name: effect.name, sourceTraits })) return false;
  await effect.delete();
  return true;
}
