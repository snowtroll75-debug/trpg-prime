/**
 * EXTRAPLANAR CREATURES (3.633.0; Fiends & Fables 3.0 block 3, ruling R14 —
 * Graham, 11 October 2026). Bestiary page 7:
 *
 *   "Any creature that is considered to be extraplanar (one that hails from a
 *    plane other than the material plane), is immediately destroyed when it
 *    dies on the material plane and its essence returns to its home plane.
 *    What happens beyond this is determined by your campaign (GM discretion).
 *    WADE THROUGH THE MOOKS — If you are using this optional rule from the
 *    core rulebook, you may also assume that any creature that falls into
 *    this category dies at 0 HP and does not use the death state rules."
 *
 * The category is the Extraplanar TRAIT. Whether the party is on the
 * material plane is the world setting `extraplanarDestruction`. "Wade
 * Through the Mooks" in this system is per creature (`system.gm.isMook`),
 * so an Extraplanar mook dies at 0 HP.
 *
 * Pure.
 */
import { hasCreatureTrait } from "./creature-traits.mjs";

/** Is this creature Extraplanar? */
function isExtraplanar(actorSystem) {
  return hasCreatureTrait(actorSystem ?? {}, "extraplanar");
}

/** Does this creature die at 0 HP, skipping the death states? */
export function extraplanarMookDiesAtZero(actor, { enabled = true } = {}) {
  return Boolean(enabled) && actor?.type === "npc" && Boolean(actor?.system?.gm?.isMook) && isExtraplanar(actor?.system);
}

/** The destruction card's line, or "" when the rule does not reach it. */
export function extraplanarDestructionLine(actor, { enabled = true } = {}) {
  if (!enabled || !isExtraplanar(actor?.system)) return "";
  return `<strong>${actor?.name ?? "The creature"}</strong> is Extraplanar: it is destroyed, and its essence returns to its home plane.`;
}
