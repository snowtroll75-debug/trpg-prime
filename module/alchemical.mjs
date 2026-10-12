/**
 * Alchemical items at the table (Chapter 6).
 *
 * Two things Graham asked for at 3.249.0: "Items with the Bomb trait are
 * thrown in combat. I cannot do that with alchemical items at the
 * moment. Also I cannot increase their level for greater effect."
 *
 * Both are printed rules that had nowhere to go. The chapter says:
 *
 *   "Alchemical weapons have a range increment of 20 feet and attack as
 *    martial thrown weapons (with their own attack group)."
 *
 * and every scaling item carries its own ladder — "for every additional
 * 3 levels of the vial, the damage increases by 1d4, the persistent
 * damage by 1 and the splash damage by 1."
 *
 * THE COST TABLE IS HAND-TYPED HERE and diffed against the machine
 * transcription in the harness, so the numbers the system uses and the
 * numbers on the page have independent provenance (lesson 6).
 */

const SYSTEM_ID = "trg-prime";

/** ALCHEMICAL ITEM COST — level 1 to 20. */
export const ALCHEMICAL_COST_TABLE = Object.freeze([
  25, 50, 85, 130, 215, 350, 525, 785, 1135, 1575,
  2185, 3060, 4375, 6560, 9625, 14000, 21875, 35000, 56875, 96250
]);

/** What an alchemical item costs at a level. */
export function alchemicalPrice(level) {
  const wanted = Math.max(1, Math.floor(Number(level) || 1));
  if (wanted > ALCHEMICAL_COST_TABLE.length) return null;
  return ALCHEMICAL_COST_TABLE[wanted - 1];
}

/** The chapter's own range increment for a thrown alchemical weapon. */
export const ALCHEMICAL_RANGE_INCREMENT = 20;

/** Does it have the Bomb trait, and something to do when it lands? */
export function isBomb(item) {
  const alchemical = item?.flags?.[SYSTEM_ID]?.alchemical;
  if (!alchemical) return false;
  return /\bbomb\b/i.test(String(item?.system?.traits ?? ""));
}

/**
 * Multiply a die expression: "1d4" three times over is "3d4".
 *
 * The chapter's scaling always adds whole dice of the same size, so this
 * multiplies the COUNT and leaves the face alone — "increases by 1d4"
 * twice is 2d4, not 1d8. A flat number simply multiplies.
 */
export function scaleAmount(amount, times) {
  const steps = Math.max(0, Math.floor(Number(times) || 0));
  const text = String(amount ?? "0").trim();
  if (!steps || !text || text === "0") return text || "0";
  const dice = /^(\d+)d(\d+)(?:\+(\d+))?$/i.exec(text);
  if (!dice) {
    const flat = Number(text);
    return Number.isFinite(flat) ? String(flat * steps) : text;
  }
  const count = Number(dice[1]) * steps;
  const bonus = dice[3] ? Number(dice[3]) * steps : 0;
  return `${count}d${dice[2]}${bonus ? `+${bonus}` : ""}`;
}

/** Add two amounts, either of which may be dice or flat. */
export function addAmounts(a, b) {
  const first = String(a ?? "0").trim() || "0";
  const second = String(b ?? "0").trim() || "0";
  if (first === "0") return second;
  if (second === "0") return first;
  const dieA = /^(\d+)d(\d+)$/i.exec(first);
  const dieB = /^(\d+)d(\d+)$/i.exec(second);
  // Same die size: add the counts, which is what "increases by 1d4"
  // means when the base is already 1d4.
  if (dieA && dieB && dieA[2] === dieB[2]) {
    return `${Number(dieA[1]) + Number(dieB[1])}d${dieA[2]}`;
  }
  if (!dieA && !dieB) return String(Number(first) + Number(second));
  return `${first} + ${second}`;
}

/**
 * How many steps up the ladder a level is.
 *
 * "For every additional 3 levels" from a base of 1 means level 4 is one
 * step, level 7 is two — and level 5 is still one, since a partial step
 * buys nothing.
 */
export function scalingSteps(baseLevel, level, perLevels) {
  const per = Math.max(0, Math.floor(Number(perLevels) || 0));
  if (!per) return 0;
  const above = Math.max(0, Math.floor(Number(level) || 0) - Math.floor(Number(baseLevel) || 0));
  return Math.floor(above / per);
}

/**
 * What a bomb does when crafted at a given level.
 *
 * @param {Item} item
 * @param {number} [level] Defaults to the item's own.
 * @returns {{level, damage, damageType, persistent, splash, bleed,
 *   steps, price, rangeIncrement, problems}|null}
 */
export function bombAt(item, level = null) {
  const alchemical = item?.flags?.[SYSTEM_ID]?.alchemical;
  const bomb = alchemical?.bomb;
  if (!bomb) return null;
  const baseLevel = Number(alchemical.baseLevel ?? item?.system?.itemLevel ?? 1);
  const at = Math.max(baseLevel, Math.floor(Number(level ?? item?.system?.itemLevel ?? baseLevel) || baseLevel));
  const scaling = alchemical.scaling ?? null;
  const steps = scaling?.parsed ? scalingSteps(baseLevel, at, scaling.perLevels) : 0;
  const problems = [];
  if (scaling && !scaling.parsed && at > baseLevel) {
    problems.push(`${item.name} scales, but not in numbers this can add up: ${scaling.text}`);
  }
  const price = alchemicalPrice(at);
  if (price === null) problems.push(`Level ${at} is past the alchemical cost table.`);
  return {
    level: at,
    steps,
    damage: steps ? addAmounts(bomb.damage, scaleAmount(scaling.damage, steps)) : bomb.damage,
    damageType: bomb.damageType,
    persistent: steps ? addAmounts(bomb.persistent, scaleAmount(scaling.persistent, steps)) : bomb.persistent,
    splash: steps ? addAmounts(bomb.splash, scaleAmount(scaling.splash, steps)) : bomb.splash,
    bleed: steps ? addAmounts(bomb.bleed, scaleAmount(scaling.bleed, steps)) : bomb.bleed,
    price,
    rangeIncrement: Number(alchemical.rangeIncrement ?? ALCHEMICAL_RANGE_INCREMENT),
    problems
  };
}

/**
 * What crafting an item at a higher level changes, for anything that is
 * not a bomb — an elixir's bonus, a potion's healing.
 *
 * Returned as a SENTENCE rather than applied, because "the bonus
 * increases by +1" is a bonus to something the chapter names in prose
 * and this system has no field for.
 */
export function scalingAt(item, level = null) {
  const alchemical = item?.flags?.[SYSTEM_ID]?.alchemical;
  const scaling = alchemical?.scaling;
  if (!scaling) return null;
  const baseLevel = Number(alchemical.baseLevel ?? item?.system?.itemLevel ?? 1);
  const at = Math.max(baseLevel, Math.floor(Number(level ?? item?.system?.itemLevel ?? baseLevel) || baseLevel));
  const steps = scaling.parsed ? scalingSteps(baseLevel, at, scaling.perLevels) : 0;
  const parts = [];
  if (steps && scaling.bonus) parts.push(`+${scaling.bonus * steps} to its bonus`);
  if (steps && scaling.healing) parts.push(`+${scaleAmount(scaling.healing, steps)} healed`);
  return {
    level: at,
    steps,
    price: alchemicalPrice(at),
    summary: parts.join(", "),
    parsed: Boolean(scaling.parsed),
    text: scaling.text
  };
}
