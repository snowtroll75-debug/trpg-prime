/**
 * CONDITIONS HELD BY A CURSE (3.686.0, H17). Pure; no Foundry.
 *
 * Graham, 8 November 2026 (17:22), Eldritch Arts' Q183 "as recommended":
 * Symbols of Pain and Weakness — "These effects last for 1 hour after the
 * creature moves farther than 60 feet from the symbol and can only be removed
 * with a Remove Curse spell" — "while the hold lasts, nothing but Remove
 * Curse reduces or ends it. Remove Curse counteracts it against the symbol's
 * PP (as for any curse)."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A HOLD, AND NOT A SEAL.
 *
 * Resurrection's seal (conditions/sealed.mjs) is a record on the actor, by
 * condition, with an expiry: "cannot be removed or reduced by any means" for
 * a week. A curse's hold is different twice over. It is a THING that can be
 * removed — Remove Curse counteracts it, which needs an effect to find — and
 * its end is not a clock known at the start (the symbol's hour starts only
 * once the creature walks away). So the hold is an ActiveEffect:
 *
 *   flags["trg-prime"].heldConditions = {
 *     keys:    ["injured"],          the conditions nothing else may lower
 *     values:  { injured: 2 },       what this hold added to each (optional)
 *     endWith: true,                 when the effect goes, take `values` off
 *     label:   "Symbol of Pain"
 *   }
 *
 * The condition itself stays ORDINARY (the sheet shows Injured 2, its
 * penalties apply), as the seal's does, for the reason that file gives.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT A HOLD STOPS: condition relief (Restoration and its kin), rest and
 * recovery (the injury clock, Fast Healing and Regeneration, fatigue's hourly
 * save and a full night, Soul Drain and Doomed at a night's rest), the
 * `reduceCondition` helper and every reducer that asks the condition floor,
 * a creature ability's healing of injured or bleeding, and a counteract that
 * names the condition itself. WHAT IT DOES NOT STOP: a GM changing it on the
 * sheet or the token HUD — "only Remove Curse" is a claim about the fiction,
 * as the seal's "by any means" is — and the effect being counteracted, which
 * is exactly what Remove Curse does.
 *
 * DEFAULT-OFF: an effect without the flag holds nothing, and a creature with
 * no such effect is relieved, rested and recovered exactly as before.
 */

/** The flag a holding effect carries. */
export const HELD_FLAG = "heldConditions";
/** A counteract's level and DC, carried by the effect it may remove (3.686.0, H17). */
const COUNTERACT_AS_FLAG = "counteractAs";

const text = (v) => String(v ?? "").trim();

/**
 * A hold record, or null when it holds nothing. Keys are kept as declared
 * (condition keys are camelCase: `soulDrain`).
 * @returns {{keys: string[], values: Object<string, number>, endWith: boolean, label: string}|null}
 */
export function normaliseHeld(raw) {
  if (!raw || typeof raw !== "object") return null;
  const keys = (Array.isArray(raw.keys) ? raw.keys : []).map(text).filter(Boolean);
  if (!keys.length) return null;
  const values = {};
  for (const k of keys) {
    const v = Math.trunc(Number(raw.values?.[k]) || 0);
    if (v > 0) values[k] = v;
  }
  return { keys: [...new Set(keys)], values, endWith: raw.endWith === true, label: text(raw.label) };
}

/** The hold an effect carries, or null (a disabled effect holds nothing). */
export function heldOf(effect) {
  if (!effect || effect.disabled) return null;
  return normaliseHeld(effect.flags?.["trg-prime"]?.[HELD_FLAG] ?? effect.getFlag?.("trg-prime", HELD_FLAG));
}

/**
 * The holds on a creature that hold this condition, with their labels.
 * TAKES THE EFFECTS, not the actor, so the harness drives it without a world.
 * @param {Iterable<object>} effects
 * @param {string} key a condition key
 * @returns {Array<{label: string, held: object, effect: object}>}
 */
export function holdsOn(effects, key) {
  const k = text(key);
  if (!k) return [];
  const out = [];
  for (const effect of Array.from(effects ?? [])) {
    const held = heldOf(effect);
    if (held?.keys.includes(k)) out.push({ label: held.label || text(effect?.name) || "a curse", held, effect });
  }
  return out;
}

/** Is this condition held on a creature with these effects? */
function conditionHeld(effects, key) {
  return holdsOn(effects, key).length > 0;
}

/** The same, asked of an actor (its own effects, not derived ones). */
export function actorConditionHeld(actor, key) {
  return conditionHeld(actor?.effects ?? [], key);
}

/**
 * What a hold's end takes off: each key by the value the hold added, never
 * below 0, and never below what another hold still standing has added.
 * @param {object} held the ending hold (normalised)
 * @param {(key: string) => number} current the creature's raw value
 * @param {object[]} others the other holds still standing (normalised)
 * @returns {Array<{key: string, from: number, to: number}>}
 */
export function heldEndings(held, current, others = []) {
  if (!held?.endWith) return [];
  const out = [];
  for (const [key, value] of Object.entries(held.values ?? {})) {
    const from = Math.max(0, Math.trunc(Number(current(key)) || 0));
    const kept = (others ?? []).reduce((sum, o) => sum + (o?.keys?.includes(key) ? Math.max(0, Math.trunc(Number(o.values?.[key]) || 0)) : 0), 0);
    const to = Math.max(0, Math.min(from, Math.max(kept, from - value)));
    if (to !== from) out.push({ key, from, to });
  }
  return out;
}

/** What the card says when a hold refuses a relief. */
export function heldRefusedLine(targetName, label, by) {
  return `<em>${targetName}'s <strong>${label}</strong> is held by ${by || "a curse"} — only Remove Curse can end it.</em>`;
}

/**
 * A counteract's level and DC, when the effect it targets carries them (Remove
 * Curse against a symbol's curse: "against the symbol's PP"). Null otherwise,
 * so the counteract dialog asks as it always has.
 * @returns {{targetLevel: number, dc: number|null}|null}
 */
export function counteractAsOf(effect) {
  const raw = effect?.flags?.["trg-prime"]?.[COUNTERACT_AS_FLAG];
  if (!raw || typeof raw !== "object") return null;
  const pp = Math.max(0, Math.trunc(Number(raw.pp) || 0));
  const dc = Math.trunc(Number(raw.dc) || 0);
  if (!pp && !dc) return null;
  return { targetLevel: pp, dc: dc > 0 ? dc : null };
}
