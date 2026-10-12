/**
 * Is this creature in sunlight? (3.627.0)
 *
 * The core's turn-start card has said, since it was written, "Only if the
 * creature begins its turn in sunlight" — because "Foundry knows scene
 * darkness and token light; it does not know whether the fiction is
 * outdoors at noon" (creature-turn-start.mjs). That is still true, and
 * nothing here infers it from a darkness value.
 *
 * GRAHAM'S RULING, 7 October 2026 (Pillars of Faith, Chapter 9): the GM
 * SAYS. A scene is marked Sunlit or Not sunlit, and a token may override its
 * scene — in sunlight (a shaft through a window) or in shade (under an
 * awning). A scene marked neither is the old behaviour: the card, applied by
 * the GM. So a table that never touches the setting loses nothing.
 *
 *   Scene  flags.trg-prime.sunlight = "sunlit" | "dark" | ""   (unset)
 *   Token  flags.trg-prime.sunlight = "sun" | "shade" | ""     (as the scene)
 *
 * Sunlight Weakness: "If this creature begins its turn in sunlight, it is
 * injured 2 and slowed 2 for as long as it remains in the sunlight." Pillars
 * of Faith's Fast Healing: "suppressed while Sunlight Weakness applies".
 *
 * Pure.
 */
export const SUNLIGHT_FLAG = "sunlight";
/** The actor flag recording that Sunlight Weakness is on it, and what it replaced. */
export const SUNLIGHT_STATE_FLAG = "sunlightWeakness";
/** What Sunlight Weakness applies. */
export const SUNLIGHT_CONDITIONS = Object.freeze([
  Object.freeze({ key: "injured", value: 2 }),
  Object.freeze({ key: "slowed", value: 2 })
]);

/**
 * "sun", "shade", or "unknown" when nobody has said.
 *
 * @param {{sceneFlag?: string, tokenFlag?: string}} flags
 */
export function sunlightState({ sceneFlag = "", tokenFlag = "" } = {}) {
  const token = String(tokenFlag ?? "").trim().toLowerCase();
  if (token === "sun") return "sun";
  if (token === "shade") return "shade";
  const scene = String(sceneFlag ?? "").trim().toLowerCase();
  if (scene === "sunlit") return "sun";
  if (scene === "dark") return "shade";
  return "unknown";
}

/**
 * The values to put back when the creature leaves the sunlight.
 *
 * What it held before is restored — unless something else has since raised
 * a condition past what the sunlight set, in which case that is left alone:
 * the sun is not taking away an injury the sun did not give.
 *
 * @param {object} before {key: value} held when the sunlight was applied
 * @param {object} current {key: value} held now
 * @returns {object} {key: value} to set (0 = remove)
 */
export function sunlightRestore(before = {}, current = {}) {
  const out = {};
  for (const { key, value } of SUNLIGHT_CONDITIONS) {
    const now = Math.max(0, Math.trunc(Number(current?.[key]) || 0));
    const was = Math.max(0, Math.trunc(Number(before?.[key]) || 0));
    if (now > value) continue;
    if (now !== was) out[key] = was;
  }
  return out;
}

/** Is this effect's healing rate one the sunlight suppresses? */
export function suppressedInSunlight(effect) {
  return effect?.flags?.["trg-prime"]?.suppressedInSunlight === true;
}
