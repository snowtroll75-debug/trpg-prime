/**
 * A REROLL AFTER YOUR OWN FUMBLE (3.669.0; Inner Tempest's Fortune's
 * Reversal: "Action R; Trigger you fumble an attack check, skill check or
 * saving throw. Reroll the triggering check and use the second result, even
 * if it is worse."). Pure: which of the actor's items offer it.
 *
 * Declared on a feat or ability:
 *
 *   flags.trg-prime.fumbleReroll: {
 *     checkTypes: ["attack", "skill", "save"],   // which fumbles it answers
 *     reaction: true,                            // costs the reaction in combat
 *     label: "Fortune's Reversal"
 *   }
 *
 * An item with a counted use (a Focus ability) needs one left; the workflow
 * spends it. An attack's fumble is the confirmed one (the fumble check
 * failed), asked before the fumble table; a skill check's or a save's is the
 * Fumble degree, asked before the result is read.
 */

const KINDS = Object.freeze(["attack", "skill", "save"]);

/** The fumble-reroll rows an item list offers for one kind of check. */
export function fumbleRerollRows(items = [], kind = "") {
  const want = String(kind ?? "").trim().toLowerCase();
  if (!KINDS.includes(want)) return [];
  const out = [];
  for (const item of Array.isArray(items) ? items : Array.from(items ?? [])) {
    if (!item || !["feat", "ability"].includes(item.type)) continue;
    if (item.type === "ability" && item.system?.active === false) continue;
    const raw = item.flags?.["trg-prime"]?.fumbleReroll;
    if (!raw || typeof raw !== "object") continue;
    const types = (Array.isArray(raw.checkTypes) ? raw.checkTypes : KINDS).map((t) => String(t).trim().toLowerCase());
    if (!types.includes(want)) continue;
    out.push({ item, label: String(raw.label ?? item.name).trim() || item.name, reaction: raw.reaction !== false });
  }
  return out;
}

/**
 * WHAT IT IS CALLED (3.669.2; found live): a Blunder offered the reroll
 * (B5-5) was told "You fumbled", and its card said "the fumble is
 * rerolled". The word follows the degree; anything but a Blunder is a
 * fumble, as before.
 *
 * @param {string} degree the first result's degree key
 * @returns {{verb: string, noun: string}}
 */
export function fumbleWords(degree = "") {
  return String(degree ?? "").trim().toLowerCase() === "blunder"
    ? { verb: "blundered", noun: "blunder" }
    : { verb: "fumbled", noun: "fumble" };
}
