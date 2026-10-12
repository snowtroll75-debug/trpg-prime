/**
 * A CHOICE OFFERED AT THE START OF EACH OF THE TARGET'S TURNS — NEW at 3.614.0,
 * Graham's R8 of 2 October 2026 (block 35): "Build it".
 *
 * Renewal's Touch (page 356):
 *   "at the beginning of each of the targets turns, it may choose to use one
 *    of the following effects for 2 AP (concentrate):
 *      Heal 1d8+8 HP
 *      Stop 1 point of bleeding
 *      Reduce the fatigued condition by 1
 *      As part of a recovery check (Free Action) ignore fumble and blunder results
 *    +2 PP: increase the healing by 1d8+8.
 *    +2 PP: target may reduce bleeding by an additional 1.
 *    +2 PP: the target may also reduce the injured condition by 1 or the dazed
 *           and weakened conditions by 2.
 *    +2 PP: reduce the fatigued condition (or another condition if you have
 *           used that option) by an additional 1.
 *    +4 PP: the target may also reduce the soul drain condition by 5."
 *
 * HOW IT IS OFFERED. A card at the start of the target's turn with one button
 * per option, pressed by whoever owns the creature — the turn clock runs on
 * the GM's client and a player's character must not be chosen for. Pressing
 * one spends the 2 AP and applies it; one a turn.
 *
 * WHAT THE WARPS FEED, read once at the cast and stored with the choice:
 *   healDice / healBonus  the heal ("increase the healing by 1d8+8"), the same
 *                         keys the cast's own 2d8+16 grows by
 *   bleedBump             one more point of bleeding per purchase
 *   unlocks               "injuredOption" and "soulDrainOption" add options
 *   conditionBump         one more off every condition reduction per purchase
 *
 * THE RECOVERY-CHECK OPTION IS THE TABLE'S. Nothing in this system lets a
 * recovery check be told to ignore its own degree, so the button says what to
 * do rather than doing it — the anti-silence rule, not an automation.
 *
 * Pure; no Foundry.
 */

export const TURN_OPTIONS_FLAG = "turnOptions";

const int = (v) => Math.max(0, Math.trunc(Number(v) || 0));

/**
 * The options one casting offers, after its warps.
 * @param {object} raw the authored `turnOptions` row
 * @param {object} warpMods the aggregated warp mods
 * @param {(formula: string, warpMods: object) => string} growHeal `warpedHealFormula`, injected
 * @returns {object|null}
 */
export function turnOptionsSpec(raw, warpMods = {}, growHeal = (f) => f) {
  if (!raw || typeof raw !== "object") return null;
  const bump = int(warpMods?.conditionBump);
  const unlocked = Array.isArray(warpMods?.unlocks) ? warpMods.unlocks.map(String) : [];
  const reduce = {};
  const add = (map) => {
    for (const [k, v] of Object.entries(map ?? {})) if (int(v)) reduce[k] = int(v) + bump;
  };
  add(raw.reduce);
  for (const [name, map] of Object.entries(raw.unlockable ?? {})) if (unlocked.includes(name)) add(map);
  const heal = String(raw.heal ?? "").trim();
  const spec = {
    label: String(raw.label ?? "Turn options"),
    apCost: int(raw.apCost) || 2,
    heal: heal ? growHeal(heal, warpMods) : "",
    bleed: int(raw.bleed) ? int(raw.bleed) + int(warpMods?.bleedBump) : 0,
    reduce,
    recovery: raw.recovery === true
  };
  return spec.heal || spec.bleed || Object.keys(reduce).length || spec.recovery ? spec : null;
}

/** The buttons a card offers: `{key, label}`, in the page's order. */
export function turnOptionChoices(spec) {
  if (!spec) return [];
  const out = [];
  if (spec.heal) out.push({ key: "heal", label: `Heal ${spec.heal}` });
  if (spec.bleed) out.push({ key: "bleed", label: `Stop ${spec.bleed} bleeding` });
  for (const [condition, n] of Object.entries(spec.reduce ?? {})) {
    out.push({ key: `reduce:${condition}`, label: `Reduce ${condition === "soulDrain" ? "soul drain" : condition} by ${n}` });
  }
  if (spec.recovery) out.push({ key: "recovery", label: "Ignore fumble and blunder on a recovery check" });
  return out;
}

/** Whether this creature has already chosen this turn. */
export function turnOptionUsed(usedKey, nowKey) {
  return Boolean(usedKey) && usedKey === nowKey;
}

/** The round a choice is recorded against. */
export function turnOptionKey(combatId, round) {
  return `${combatId ?? ""}:${round ?? ""}`;
}
