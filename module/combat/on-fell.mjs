/**
 * What a creature gains for felling a foe (3.627.0).
 *
 * Pillars of Faith, Chapter 9 — Hunger Beyond Pain (Unliving Zombie): "When
 * you reduce a living creature to 0 HP with your Bite or Slam, you regain HP
 * equal to your level plus your Constitution modifier, minimum 1. You can
 * gain this healing once per round."
 *
 * "REDUCE TO 0 HP" is read from the damage result's own case: reached zero,
 * knocked out at zero, or killed outright by massive damage at zero. A blow
 * on a creature already Dying reduced nothing, and a death guard that left it
 * at 1 HP did not fell it.
 *
 * Declaration, on any applied effect:
 *
 *   flags.trg-prime.onFell = {
 *     label, weaponNames: ["Grave Bite", "Corpse Slam"], living: true,
 *     heal: { level: true, ability: "constitution", min: 1 }, oncePerRound: true
 *   }
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const ON_FELL_FLAG = "onFell";
const FELLED_CASES = Object.freeze(["reached-zero", "knocked-out", "massive-damage-death"]);
const lower = (v) => String(v ?? "").trim().toLowerCase();

function normaliseOnFell(raw) {
  if (!raw || typeof raw !== "object" || !raw.heal || typeof raw.heal !== "object") return null;
  return {
    label: String(raw.label ?? "").trim() || "On felling a foe",
    weaponNames: (Array.isArray(raw.weaponNames) ? raw.weaponNames : []).map(lower).filter(Boolean),
    living: raw.living === true,
    heal: {
      level: raw.heal.level === true,
      ability: lower(raw.heal.ability),
      flat: Math.trunc(Number(raw.heal.flat) || 0),
      min: Math.max(0, Math.trunc(Number(raw.heal.min) || 0))
    },
    oncePerRound: raw.oncePerRound === true
  };
}

export function declaredOnFell(effects = []) {
  const out = [];
  for (const effect of Array.from(effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.[ON_FELL_FLAG];
    for (const row of Array.isArray(raw) ? raw : (raw ? [raw] : [])) {
      const spec = normaliseOnFell(row);
      if (spec && !out.some((s) => s.label === spec.label)) out.push(spec);
    }
  }
  return out;
}

/**
 * @param {object} spec
 * @param {{damageCase: string, weaponName: string, targetLiving: boolean, used?: object}} ctx
 */
export function onFellFires(spec, ctx = {}) {
  if (!spec || !FELLED_CASES.includes(String(ctx.damageCase ?? ""))) return false;
  if (spec.weaponNames.length && !spec.weaponNames.includes(lower(ctx.weaponName))) return false;
  if (spec.living && !ctx.targetLiving) return false;
  if (spec.oncePerRound && ctx.used?.[`fell:${spec.label}`]) return false;
  return true;
}

/** The healing: level + ability modifier + flat, never below the minimum. */
export function onFellHealing(spec, { level = 0, abilities = {} } = {}) {
  let total = spec?.heal?.flat ?? 0;
  if (spec?.heal?.level) total += Math.max(0, Math.floor(Number(level) || 0));
  if (spec?.heal?.ability) total += Math.trunc(Number(abilities?.[spec.heal.ability]?.total) || 0);
  return Math.max(spec?.heal?.min ?? 0, total);
}
