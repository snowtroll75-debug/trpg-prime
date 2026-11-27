/**
 * WRITES A SPELL MAKES ON DOCUMENTS ITS CASTER'S USER MAY NOT OWN (3.718.0).
 *
 * FOUND IN THE PLAYER-SEAT SWEEP OF EVERY CORE SPELL, 27 November 2026. A GM
 * can write to anything, so every one of these passed every GM-side test:
 *
 *   Doubt, Delay Consequence…   pendingModifiers  → "lacks permission to update Actor"
 *   False Arrogance             temporaryImmunity
 *   Flame Prison, Force Prison  imprisoned
 *   Fly, Earth Glide            a granted Speed   → "lacks permission to create Item"
 *   Entangle, False Mire        difficult ground  → "lacks permission to create RegionBehavior"
 *   Cutting Words, Spell Drain  their records on the target
 *   Serenity                    flatLadderCurse
 *   Petrification, Speed…       a stamp on the condition just laid → "update ActiveEffect"
 *   Stasis                      its effect created directly → "create ActiveEffect"
 *   Startle                     a forced Step → "update Token"
 *
 * Each threw out of the effects loop, so the PP were spent, the save was
 * rolled, and no Result card posted. These helpers write directly when this
 * client may, and otherwise ask the GM's client through the target relay —
 * WRAPPED LOW, as the relay's own header puts it, so every caller of the
 * primitive is carried, not just the spell that was caught.
 *
 * A DOCUMENT WITH NO OWNERSHIP TO ASK (a harness mock, a plain object) is
 * written directly, as it always was: `isOwner` must be exactly false.
 */

const SYSTEM_ID = "trg-prime";

function mustRelay(doc) {
  return doc?.isOwner === false && typeof game !== "undefined" && game?.user?.isGM !== true;
}

/** setFlag (or, with null, unsetFlag) on the target, through the GM when it is not ours. */
export async function setTargetFlag(doc, key, value) {
  if (!mustRelay(doc)) {
    return value === null ? doc.unsetFlag(SYSTEM_ID, key) : doc.setFlag(SYSTEM_ID, key, value);
  }
  const { relaySpellFlag } = await import("./target-relay-workflow.mjs");
  return relaySpellFlag(doc, key, value);
}

/**
 * A spell's granted ability items on the target. Answers what
 * createEmbeddedDocuments would: the made items — or, across the relay,
 * `{id, name}` for each, which is all any caller reads.
 */
export async function createTargetSpellItems(doc, items) {
  if (!mustRelay(doc)) return doc.createEmbeddedDocuments("Item", items);
  const { relaySpellItems } = await import("./target-relay-workflow.mjs");
  return relaySpellItems(doc, items);
}

/**
 * Behaviours on a spell's Region. A player who placed the Region owns it and
 * still may not create its behaviours, so this asks whether the USER may,
 * not whether the region is owned. Answers false when refused.
 */
export async function createSpellRegionBehaviours(region, behaviours, name = "") {
  const BehaviorClass = globalThis.foundry?.documents?.RegionBehavior;
  const mayCreate = game?.user?.isGM === true || BehaviorClass?.canUserCreate?.(game.user) === true;
  if (mayCreate) {
    if (name) await region.update({ name });
    await region.createEmbeddedDocuments("RegionBehavior", behaviours);
    return true;
  }
  const { relayRegionBehaviours } = await import("./target-relay-workflow.mjs");
  return (await relayRegionBehaviours(region, behaviours, name)) !== null;
}

/**
 * Named flags stamped on an effect a spell just laid on the target — the
 * escape save, the end save, a held value. Through the GM when the effect
 * is not ours.
 */
export async function setEffectFlags(effect, flags) {
  if (!effect) return false;
  if (!mustRelay(effect)) {
    await effect.update(Object.fromEntries(Object.entries(flags).map(([k, v]) => [`flags.${SYSTEM_ID}.${k}`, v])));
    return true;
  }
  const { relayEffectStamp } = await import("./target-relay-workflow.mjs");
  return relayEffectStamp(effect, { flags });
}

/** A spell's own effect removed from the target, through the GM when it is not ours. */
export async function removeSpellEffect(effect) {
  if (!effect) return false;
  if (!mustRelay(effect)) {
    await effect.delete();
    return true;
  }
  const { relayEffectStamp } = await import("./target-relay-workflow.mjs");
  return relayEffectStamp(effect, { remove: true });
}
