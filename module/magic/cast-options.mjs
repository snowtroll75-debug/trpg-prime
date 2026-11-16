/**
 * A CASTING OPTION A MODULE OFFERS (3.679.0; Eldritch Arts Block 2b).
 *
 * Two of Eldritch Arts' rules are choices the caster makes as they cast,
 * which neither a warp (bought with PP, owned by a feat) nor a spell-check
 * gate (always on, never asked) can carry:
 *
 *   - SPELL TRICKERY: "Using Spell Trickery requires you to increase the DC
 *     of your casting check by 2";
 *   - A TRUE NAME: "Invoking a true name during a summoning increases the
 *     Save DC of your spell by +4".
 *
 * And one that is not a choice but rides the same channel: a summoning
 * circle's Critical, "the creature takes a -2-circumstance penalty to all
 * attempts to resist binding" — offered as `required`, said on the prompt
 * and applied without a tick.
 *
 * The rules are the module's; this file asks, in registration order, and
 * cleans the answers. A module that throws costs its own option, never the
 * casting.
 */
import { registeredCastOptions } from "../module-api.mjs";
import { creatureTraits } from "../creature-traits.mjs";

const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/** The form field name an option's tick carries. Keys are lower-case already. */
export const castOptionField = (key) => `castOption-${String(key).replace(/[^a-z0-9_-]/gi, "_")}`;

/**
 * The options offered for this casting.
 * @returns {Promise<Array<{key: string, label: string, hint: string, required: boolean}>>}
 */
export async function offeredCastOptions(ctx) {
  const out = [];
  for (const { key, spec } of registeredCastOptions()) {
    try {
      const offer = await spec.offer(ctx);
      if (!offer || !str(offer.label)) continue;
      out.push({ key, label: str(offer.label), hint: str(offer.hint), required: offer.required === true });
    } catch (err) {
      console.error(`TRG Prime | cast option "${key}": offer failed`, err);
    }
  }
  return out;
}

/**
 * THE CAST'S AP WITH ITS OPTIONS' (3.683.0, C14). `castAP` is what the cast
 * spends without them (`totalCastTime`: a number, or a label such as
 * "reaction" that sits outside the AP economy). The cast's own cost is left
 * exactly as it is — a reaction cast stays a reaction — and the options' AP
 * is spent beside it (`option`), so the rune still costs its action. `total`
 * is what the pool must hold for both. Pure.
 *
 * @param {number|string} castAP
 * @param {number} optionAP
 * @returns {{cast: number|string, option: number, total: number}}
 */
export function castAPWithOptions(castAP, optionAP = 0) {
  const option = Math.max(0, num(optionAP));
  const own = typeof castAP === "number" && Number.isFinite(castAP) ? castAP : 0;
  return { cast: castAP, option, total: own + option };
}

/*
 * AN OPTION ON THE ATTACK ONLY, OR ON ONE TARGET'S SAVE (3.684.0; Eldritch
 * Arts Block 6, G14). Sanguine Channel: "you may increase your Bleed by a
 * further +1 to gain +1 to the spell's attack roll or save DC (if the spell
 * targets more than one creature, only one target benefits)".
 *
 *   attack: n            added to the spell attack's total against DB, and
 *                        not to the casting check (a spell attack IS the
 *                        casting check, so its DC is not moved): stacked in
 *                        the attack's pool as `attackType` (untyped default).
 *   saveDCTarget: { uuid, value }   that one creature's Save DC; every other
 *                        target keeps the cast's.
 *
 * Neither is a way round the casting: an option still cannot lower the
 * casting DC through these, and a target the cast does not reach gains
 * nothing.
 */
export function castOptionTargetDC(raw, label = "") {
  const value = num(raw?.value);
  if (!value) return null;
  const uuid = str(raw?.uuid);
  if (uuid) return { uuid, value, label: str(label) || "Casting option" };
  // EVERY TARGET WITH A TRAIT (3.690.0; Eldritch Arts Block 9c, H24): the Rod
  // of Soul's Echo's "The spell's save DC is increased by 2 for undead targets
  // of this casting". `traits` are creature traits (`creatureTraits`, the type
  // included), matched against each target as it saves — so a target chosen
  // after the prompt is read, and one that is not undead keeps the cast's DC.
  const traits = (Array.isArray(raw?.traits) ? raw.traits : raw?.traits ? [raw.traits] : [])
    .map((t) => str(t).toLowerCase()).filter(Boolean);
  if (traits.length) return { traits, value, label: str(label) || "Casting option" };
  return null;
}

/** An option's `saveDCTarget`, one row or several, cleaned. */
export function castOptionTargetDCs(raw, label = "") {
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).map((r) => castOptionTargetDC(r, label)).filter(Boolean);
}

/**
 * What one target's Save DC is moved by, from the taken options' `saveDCTarget`s.
 * `target` is the saving actor (its uuid and its traits are read), or a uuid.
 */
export function castOptionDCFor(targets = [], target = "") {
  const id = typeof target === "string" ? str(target) : str(target?.uuid);
  const traits = typeof target === "string" ? [] : creatureTraits(target?.system ?? {}).map((t) => str(t).toLowerCase());
  if (!id && !traits.length) return { value: 0, labels: [] };
  const mine = (targets ?? []).filter((t) => (t?.uuid && t.uuid === id)
    || (Array.isArray(t?.traits) && t.traits.some((x) => traits.includes(x))));
  return { value: mine.reduce((sum, t) => sum + num(t.value), 0), labels: mine.map((t) => `${t.label} ${t.value > 0 ? "+" : ""}${t.value}`) };
}

/** Which offered options were taken: the required ones, and the ticked. */
export function takenCastOptions(offered, form) {
  return (offered ?? []).filter((o) => o.required || Boolean(form?.[castOptionField(o.key)])).map((o) => o.key);
}

/**
 * What the taken options do.
 *
 * AND WHAT THEY COST IN ACTIONS (3.683.0; Eldritch Arts Block 5, C14): an
 * option's `apply` may answer `ap`, a whole number of AP the option adds to
 * the cast. Runic Stabiliser: "When attempting a High Magic check, you may
 * spend 1 AP inscribing a stabilizing rune." The cast charges it with its own
 * AP (cast-workflow.mjs), so it is spent only in an encounter, refunded with a
 * refunded cast, and never on a cast someone else paid for. A negative or
 * broken answer adds nothing: an option is not a way to make a cast cheaper.
 *
 * @returns {Promise<{keys: string[], castingDC: Array<{label: string, value: number}>, saveDC: number, ap: number, apParts: Array<{label: string, value: number}>, lines: string[]}>}
 */
export async function appliedCastOptions(ctx, keys = []) {
  const out = { keys: [], castingDC: [], saveDC: 0, ap: 0, apParts: [], lines: [], attackRows: [], saveDCTargets: [], rods: [] };
  const wanted = new Set((keys ?? []).map((k) => str(k).toLowerCase()));
  for (const { key, spec } of registeredCastOptions()) {
    if (!wanted.has(key)) continue;
    let got;
    try {
      got = await spec.apply(ctx);
    } catch (err) {
      console.error(`TRG Prime | cast option "${key}": apply failed`, err);
      out.lines.push("<em>A module's casting option failed — see the console.</em>");
      continue;
    }
    out.keys.push(key);
    const label = str(got?.label) || key;
    const dc = num(got?.castingDC);
    if (dc) out.castingDC.push({ label, value: dc });
    out.saveDC += num(got?.saveDC);
    const ap = num(got?.ap);
    if (ap > 0) { out.ap += ap; out.apParts.push({ label, value: ap }); }
    // THE ATTACK ONLY, AND ONE TARGET'S SAVE DC (3.684.0; Block 6, G14).
    const attack = num(got?.attack);
    if (attack) out.attackRows.push({ label, value: attack, type: str(got?.attackType) || "untyped" });
    // ONE ROW OR SEVERAL (3.690.0, H24): a creature, or every target with a trait.
    out.saveDCTargets.push(...castOptionTargetDCs(got?.saveDCTarget, label));
    for (const text of Array.isArray(got?.lines) ? got.lines : []) if (str(text)) out.lines.push(str(text));
    // AN OPTION THAT IS A ROD'S POWER (3.691.0) names it, for the one-Rod rule.
    if (str(got?.rodItemId)) out.rods.push({ itemId: str(got.rodItemId), name: str(got?.rodName) || label });
  }
  return out;
}
