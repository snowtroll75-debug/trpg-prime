/**
 * AMBUSH DICE (3.668.0): precision dice on a Strike against a creature that
 * is flat-footed to you because of what you did. Inner Tempest's Ghostwalker:
 *
 *   Unseen Assault: "Once per round, when you Strike a creature that is
 *   flat-footed to you as a direct result of your own Stealth, Deception or
 *   Ghostwalker abilities, you inflict an additional 1d6 precision damage.
 *   The attack must be … an agile or finesse melee attack, a thrown weapon
 *   attack, [or] a ranged weapon attack made within its first range
 *   increment. Simply flanking a creature is not sufficient … The additional
 *   damage increases by 1d6 at 5th level and every 4 levels thereafter."
 *
 * The rogue's Sneak Attack is the neighbour (rogue.mjs); this differs in
 * the cause, flanking, the ranged band and the once-per-round limit.
 *
 * WHY THE TARGET IS FLAT-FOOTED (Graham's ruling B4-3, 23 October 2026):
 * automatic when you are hidden from or undetected by it, or it is
 * flat-footed from your own Feint or Ghost Art; asked when it is
 * flat-footed for another reason; never from flanking alone.
 *
 * Declared on the granting item:
 *
 *   flags.trg-prime.ambushDice = {
 *     label: "Unseen Assault", die: "d6", oncePerRound: true,
 *     byLevel: [{ level: 1, count: 1 }, { level: 5, count: 2 }, …]
 *   }
 *
 * and extras on other items (feats that build on it):
 *
 *   flags.trg-prime.ambushExtras = [
 *     { label: "Ghost Blade", ar: [{ level: 6, value: 1 }, { level: 12, value: 2 }, { level: 18, value: 3 }] },
 *     { label: "Ambusher's Patience", dice: 2, whenUndetected: true, oncePerCreature: true }
 *   ]
 *
 * Pure: no Foundry.
 */

const FLAG = "trg-prime";
const norm = (v) => String(v ?? "").trim().toLowerCase();

/** The first ambush declaration among these carriers, or null. */
export function declaredAmbush(carriers = []) {
  for (const c of carriers ?? []) {
    if (!c || c.disabled) continue;
    const raw = c.flags?.[FLAG]?.ambushDice;
    if (raw && typeof raw === "object" && Array.isArray(raw.byLevel)) {
      return { label: String(raw.label ?? c.name ?? "Ambush"), die: String(raw.die ?? "d6"), byLevel: raw.byLevel, oncePerRound: raw.oncePerRound !== false };
    }
  }
  return null;
}

/** Every ambush extra among these carriers. */
export function declaredAmbushExtras(carriers = []) {
  const out = [];
  for (const c of carriers ?? []) {
    if (!c || c.disabled) continue;
    const raw = c.flags?.[FLAG]?.ambushExtras;
    for (const row of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      if (row && typeof row === "object") out.push({ ...row, label: String(row.label ?? c.name ?? "Ambush") });
    }
  }
  return out;
}

/** A level table's value at this level: the last step reached. */
function byLevel(table = [], level = 0, key = "count") {
  let best = 0;
  for (const step of table ?? []) if (Number(level) >= Number(step?.level ?? Infinity)) best = Number(step?.[key] ?? step?.value) || 0;
  return best;
}

/** How many dice at this level. */
export function ambushDiceCount(declared, level = 0) {
  return declared ? byLevel(declared.byLevel, level, "count") : 0;
}

/**
 * The weapon half: an agile or finesse melee Strike, a thrown Strike, or a
 * ranged Strike within its first range increment.
 *
 * @param {{isRanged?: boolean, isThrown?: boolean, traits?: string, rangeBand?: string}} args
 */
export function ambushWeaponEligible({ isRanged = false, isThrown = false, traits = "", rangeBand = "" } = {}) {
  if (isThrown) return true;
  if (isRanged) return norm(rangeBand) === "first";
  return /\b(agile|finesse)\b/i.test(String(traits ?? ""));
}

/**
 * Why the target is flat-footed to you, as B4-3 sorts it.
 *
 * @param {object} args
 * @param {string|null} args.flatFootedBy the attacker's condition that makes
 *   the target flat-footed to it ("hidden", "undetected", "invisible"), or null
 * @param {boolean} args.targetFlatFooted the target has the flat-footed condition
 * @param {boolean} args.fromOwnAbility that condition is from this attacker's
 *   own Feint, Create a Diversion or Ghost Art
 * @param {boolean} args.otherwiseFlatFooted flat-footed to you some other way
 *   (Surprise Attack, a Strike that treats it so)
 * @returns {"auto"|"ask"|null}
 */
export function ambushCause({ flatFootedBy = null, targetFlatFooted = false, fromOwnAbility = false, otherwiseFlatFooted = false } = {}) {
  if (flatFootedBy) return "auto";
  if (targetFlatFooted && fromOwnAbility) return "auto";
  if (targetFlatFooted || otherwiseFlatFooted) return "ask";
  return null;
}

/** The round key for "once per round": the combat and round, or null out of combat. */
export function ambushRoundKey(combatId = "", round = 0) {
  return combatId && Number(round) > 0 ? `${combatId}:${Number(round)}` : null;
}

/**
 * The extras that join this ambush: AR by level, and extra dice when the
 * target has not detected you and has not been ambushed this encounter.
 *
 * @param {object[]} extras declaredAmbushExtras(...)
 * @param {{level: number, undetected: boolean, alreadyAmbushed: boolean}} state
 * @returns {{ar: number, dice: number, labels: string[], spendsCreature: boolean, asks: object[]}}
 */
export function ambushExtrasFor(extras = [], { level = 0, undetected = false, alreadyAmbushed = false } = {}) {
  let ar = 0; let dice = 0; const labels = []; let spendsCreature = false; const asks = [];
  for (const row of extras ?? []) {
    if (Array.isArray(row.ar)) {
      const value = byLevel(row.ar, level, "value");
      if (value > 0) { ar += value; labels.push(`${row.label}: AR ${value}`); }
    }
    if (Number(row.dice) > 0) {
      if (row.oncePerCreature && alreadyAmbushed) continue;
      if (row.whenUndetected && !undetected) { asks.push(row); continue; }
      dice += Number(row.dice);
      labels.push(`${row.label}: +${Number(row.dice)}d6`);
      if (row.oncePerCreature) spendsCreature = true;
    }
  }
  return { ar, dice, labels, spendsCreature, asks };
}
