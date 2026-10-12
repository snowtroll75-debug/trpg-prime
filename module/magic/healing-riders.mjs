/**
 * RIDERS ON THE CASTER'S OWN HEALING (3.625.0). Pure; no Foundry.
 *
 * Three Pillars of Faith rules change WHAT A HEAL DOES according to the
 * creature it lands on, and every one of them was a card note:
 *
 *   NO LIFE ABANDONED (Rhevani feat)
 *     "Whenever you restore HP to another living creature with a spell …
 *      if that creature currently has half its maximum HP or fewer,
 *      increase the healing by an amount equal to half your level,
 *      minimum 1. This additional healing applies only once per creature
 *      from each spell or action."
 *   RESURGENT HEALING (Healer class feat)
 *     "If you magically heal a creature that has the Dying condition, it
 *      regains half the normal amount of HP restored by the spell rather
 *      than being restored to 1 HP."
 *   VITAL SURGE (the Lifebinder's Gift of Healing)
 *     "Once per round, when Gift of Healing applies to a creature, you may
 *      maximise the result of one healing die rolled by the triggering
 *      spell."
 *
 * THE SHAPE IS THE DAMAGE RIDERS' (combat/damage-riders.mjs): data on an
 * effect the feat or ability carries, read at the moment the system
 * already has the number in hand. `flags["trg-prime"].healingRider`:
 *
 *   {
 *     label: "No Life Abandoned",
 *     lowHalfBonus: "halfLevel" | <number>,   // +N when the target is at half HP or fewer
 *     dyingHalf: true,                         // a Dying target also regains half the heal
 *     maximiseOneDie: true,                    // the first die of the formula is maximised
 *     oncePerRound: true                       // burns a marker (maximiseOneDie's "once per round")
 *   }
 *
 * `lowHalfBonus` is "once per creature from each spell", which one heal
 * entry per cast per target already is. `maximiseOneDie` is a FORMULA
 * TRANSFORM rather than a post-roll fudge: "3d6+6" becomes "2d6+6+6", so
 * the roll the card shows is the roll that was made. `dyingHalf` is
 * honoured by healActor's dying path, which otherwise restores nothing.
 */

const SYSTEM_ID = "trg-prime";

/** The per-round marker map on the caster: effect id → true. */
export const HEALING_RIDERS_USED_FLAG = "healingRidersUsed";

/**
 * Every well-formed healing rider the caster's effects declare.
 * @param {Array<{id, name, disabled, flags}>} effects `actor.appliedEffects`.
 */
export function declaredHealingRiders(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.healingRider;
    if (!raw || typeof raw !== "object") continue;
    const lowHalfBonus = raw.lowHalfBonus === "halfLevel" ? "halfLevel" : Math.max(0, Math.trunc(Number(raw.lowHalfBonus) || 0));
    const rider = {
      id: String(effect.id ?? ""),
      label: String(raw.label ?? effect.name ?? "Healing rider"),
      lowHalfBonus,
      dyingHalf: Boolean(raw.dyingHalf),
      maximiseOneDie: Boolean(raw.maximiseOneDie),
      oncePerRound: Boolean(raw.oncePerRound)
    };
    if (!rider.lowHalfBonus && !rider.dyingHalf && !rider.maximiseOneDie) continue;
    out.push(rider);
  }
  return out;
}

/** "3d6+6" → "2d6+6+6": the first die term's one die maximised. Returns the formula unchanged when it rolls no dice. */
export function maximiseFirstDie(formula) {
  const text = String(formula ?? "").trim();
  const m = /(\d+)d(\d+)/.exec(text);
  if (!m) return text;
  const n = Number(m[1]), faces = Number(m[2]);
  if (!n || !faces) return text;
  const rest = n - 1;
  const replacement = rest > 0 ? `${rest}d${faces} + ${faces}` : `${faces}`;
  return text.slice(0, m.index) + replacement + text.slice(m.index + m[0].length);
}

/**
 * What the riders do to THIS heal.
 *
 * @param {Array} riders declaredHealingRiders(...)
 * @param {object} p
 * @param {string} p.formula the heal's formula after warps
 * @param {number} p.casterLevel
 * @param {number} p.targetHp
 * @param {number} p.targetMax
 * @param {boolean} p.targetDying
 * @param {boolean} [p.self] the caster is healing itself (No Life Abandoned says "another living creature")
 * @param {object} [p.used] the per-round marker map
 * @returns {{formula: string, extra: number, dyingHalf: boolean, lines: string[], burn: string[]}}
 */
export function applyHealingRiders(riders = [], { formula = "", casterLevel = 0, targetHp = 0, targetMax = 0, targetDying = false, self = false, used = {} } = {}) {
  let out = String(formula ?? "").trim();
  let extra = 0;
  let dyingHalf = false;
  const lines = [];
  const burn = [];
  const low = targetMax > 0 && targetHp <= Math.floor(targetMax / 2);
  for (const r of riders ?? []) {
    if (r.oncePerRound && used?.[r.id]) continue;
    let fired = false;
    if (r.lowHalfBonus && low && !self) {
      const add = r.lowHalfBonus === "halfLevel" ? Math.max(1, Math.floor(Math.max(0, Number(casterLevel) || 0) / 2)) : r.lowHalfBonus;
      extra += add;
      lines.push(`${r.label}: +${add} (the target is at half HP or fewer)`);
      fired = true;
    }
    if (r.dyingHalf && targetDying) {
      dyingHalf = true;
      lines.push(`${r.label}: a Dying creature regains half the healing`);
      fired = true;
    }
    if (r.maximiseOneDie && /\d+d\d+/.test(out)) {
      const next = maximiseFirstDie(out);
      if (next !== out) { out = next; lines.push(`${r.label}: one healing die maximised`); fired = true; }
    }
    if (fired && r.oncePerRound) burn.push(r.id);
  }
  return { formula: out, extra, dyingHalf, lines, burn };
}

/** The marker map after this heal burnt the once-per-round riders. */
export function healingRidersBurnUpdate(burn = [], used = {}) {
  const next = { ...(used ?? {}) };
  for (const id of burn ?? []) if (id) next[id] = true;
  return next;
}

/* ───────────── Riders an ITEM carries (3.626.0) ───────────── */

/**
 * A healing rider an invested wondrous item or a held charged item
 * declares — `flags.trg-prime.healingRider` on the ITEM:
 *
 *   Hands of Mercy (Steady Gift)   { label, maximiseDice: 1, frequency: "daily",
 *                                    maximiseDiceWith: { feat: "Lifebinder", dice: 2 } }
 *   Rod of Merciful Channeling     { label, extraDice: "1d8", oneTarget: true, ppCost: 1 }
 *
 * OFFERED, not applied: both are activations ("Activate Reaction",
 * "Expend 1 PP from the rod"), so the heal case asks. An item rider is
 * read while the item is active — invested and worn for a wondrous item,
 * held for a charged one — and a daily one is marked on the item in the
 * same map a rune's daily use writes (`runeUsedToday.healingRider`).
 */
export function itemHealingRiders(items = [], { featNames = [] } = {}) {
  const feats = new Set((featNames ?? []).map((n) => String(n).trim().toLowerCase()));
  const out = [];
  for (const item of items ?? []) {
    const raw = item?.flags?.[SYSTEM_ID]?.healingRider;
    if (!raw || typeof raw !== "object") continue;
    const charged = Boolean(item?.flags?.[SYSTEM_ID]?.chargedItem);
    const active = charged ? Boolean(item?.system?.equipped) : Boolean(item?.system?.invested && item?.system?.equipped);
    if (!active) continue;
    let maximiseDice = Math.max(0, Math.trunc(Number(raw.maximiseDice) || 0));
    const withFeat = raw.maximiseDiceWith;
    if (withFeat?.feat && feats.has(String(withFeat.feat).toLowerCase())) maximiseDice = Math.max(maximiseDice, Math.trunc(Number(withFeat.dice) || 0));
    const extraDice = /^\d+d\d+$/.test(String(raw.extraDice ?? "").trim()) ? String(raw.extraDice).trim() : "";
    if (!maximiseDice && !extraDice) continue;
    out.push({
      id: `item:${item.id ?? item._id ?? ""}`,
      itemId: String(item.id ?? item._id ?? ""),
      label: String(raw.label ?? item.name ?? "Item"),
      maximiseDice,
      extraDice,
      oneTarget: raw.oneTarget !== false,
      ppCost: charged ? Math.max(0, Math.trunc(Number(raw.ppCost) || 0)) : 0,
      charged,
      frequency: String(raw.frequency ?? (charged ? "atWill" : "daily")),
      usedToday: Boolean(item?.flags?.[SYSTEM_ID]?.runeUsedToday?.healingRider)
    });
  }
  return out;
}

/** The formula with its first N dice maximised, one at a time. */
export function maximiseDice(formula, count = 1) {
  let out = String(formula ?? "").trim();
  for (let i = 0; i < Math.max(0, Math.trunc(Number(count) || 0)); i += 1) {
    const next = maximiseFirstDie(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Is an item rider still offerable: a daily one unspent, any other always. */
export function itemRiderAvailable(rider) {
  if (!rider) return false;
  if (["daily", "1/day"].includes(String(rider.frequency).toLowerCase())) return !rider.usedToday;
  return true;
}
