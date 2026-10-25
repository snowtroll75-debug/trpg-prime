/**
 * A SHEATHED WEAPON (3.671.0; Inner Tempest's Iaijutsu Master). Pure; no
 * Foundry.
 *
 * "When you roll Initiative with a sword sheathed, you gain a +25-class
 * bonus to Initiative" — and Drawn Verdict: "Requirements … you have a
 * sword sheathed. Draw your sword and make a melee Strike."
 *
 * Graham's ruling B7-5: a sword is sheathed when you CARRY a weapon of the
 * Sword group that you are NOT WIELDING — on you (quantity at least 1),
 * not equipped, and not packed away (`system.stowed`, the Stash Sack).
 * Natural attacks are never sheathed. The system has no scabbard; this is
 * the state its two flags can say.
 */

const lower = (v) => String(v ?? "").trim().toLowerCase();

/**
 * The weapons sheathed among these items, optionally of one group.
 *
 * @param {Iterable<object>} items
 * @param {string} [group] e.g. "sword"; blank for any group
 * @returns {object[]}
 */
export function sheathedWeapons(items = [], group = "") {
  const g = lower(group);
  return Array.from(items ?? []).filter((item) => item?.type === "weapon"
    && !item.system?.natural
    && !item.system?.equipped
    && !item.system?.stowed
    && Number(item.system?.quantity ?? 1) > 0
    && (!g || lower(item.system?.group) === g));
}

/** The groups that have a sheathed weapon, lowercased, for the conditionals' `sheathedGroups` axis. */
export function sheathedGroups(items = []) {
  return [...new Set(sheathedWeapons(items).map((w) => lower(w.system?.group)).filter(Boolean))];
}
