/**
 * The Foundry side of aspect-rules.mjs (3.623.0, block 40).
 *
 * Reads the world — the divine-aspects pack, the actor's items — and
 * hands the pure rules what they need. Nothing here decides a rule.
 */

import { SYSTEM_ID, contentPack } from "./content-packs.mjs";
import { effectiveClasses } from "./feats.mjs";
import { parseLevelledGrantList } from "./grants.mjs";
import { aspectSpellKeys, bonusSpellsAboveLevel, effectiveClassKeys } from "./aspect-rules.mjs";

/** The divine-aspect items an actor holds. */
function aspectsHeld(actor) {
  return Array.from(actor?.items ?? []).filter((i) => i.type === "divine-aspect");
}

/**
 * Every specialist spell ANY aspect lists — the system's ten, a module's
 * (Pillars of Faith federates twenty-two more into the same pack), and
 * any homebrew aspect on this actor's own sheet.
 */
async function allAspectSpellKeys(actor = null) {
  const keys = aspectSpellKeys(aspectsHeld(actor));
  const pack = contentPack("divine-aspects");
  if (!pack) return keys;
  const index = await pack.getIndex({ fields: ["system.specialistSpells"] });
  for (const key of aspectSpellKeys(Array.from(index.values()))) keys.add(key);
  return keys;
}

/**
 * What specialistSpellAccess needs to know about this actor.
 *
 * @returns {Promise<{myClasses: string[], myAspectKeys: Set<string>, allAspectKeys: Set<string>, holdsAspect: boolean}>}
 */
export async function specialistAccessFor(actor) {
  const myClasses = effectiveClassKeys(Array.from(actor?.items ?? []), effectiveClasses);
  const aspects = aspectsHeld(actor);
  return {
    myClasses,
    myAspectKeys: aspectSpellKeys(aspects),
    allAspectKeys: await allAspectSpellKeys(actor),
    holdsAspect: aspects.length > 0
  };
}

/**
 * R7: after a level change, remove the bonus spells each aspect granted
 * above the new level. Returns the card/notification lines.
 */
export async function pruneAspectBonusSpells(actor) {
  if (!actor?.items) return [];
  const level = Number(actor.system?.identity?.level ?? 1) || 1;
  const spells = Array.from(actor.items).filter((i) => i.type === "spell").map((i) => ({
    id: i.id,
    name: i.name,
    grantedBy: i.flags?.[SYSTEM_ID]?.grantedBy ?? null,
    specialistPick: Boolean(i.flags?.[SYSTEM_ID]?.aspectSpecialistSpell)
  }));
  const ids = [];
  for (const aspect of aspectsHeld(actor)) {
    ids.push(...bonusSpellsAboveLevel({
      aspect: { id: aspect.id, entries: parseLevelledGrantList(aspect.system?.bonusSpells) },
      spells,
      level
    }));
  }
  if (!ids.length) return [];
  const names = ids.map((id) => actor.items.get(id)?.name).filter(Boolean);
  await actor.deleteEmbeddedDocuments("Item", ids);
  return [`Bonus spells above level ${level} removed: ${names.join(", ")}.`];
}
