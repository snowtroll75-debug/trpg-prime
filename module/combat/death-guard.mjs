/**
 * Death guards (3.627.0): "if damage would reduce you to 0 HP, …".
 *
 * Pillars of Faith, Chapter 9:
 *   Unliving Fortitude — "If damage would reduce you to 0 HP, make an
 *     opposed, level-based Fortitude saving throw. On a success, you drop to
 *     1 HP instead. This feat has no effect if the triggering damage is
 *     essence damage or a damage type to which you have Weakness."
 *   Zombie Fortitude — the same, "+2 racial bonus on the saving throw".
 *   Gaseous Escape — "Once per day, when you would be reduced to 0 HP, you
 *     may immediately become gaseous as if affected by Gaseous Form. This
 *     effect occurs before you resolve dying or destruction."
 *
 * NOTHING CAUGHT THIS MOMENT BEFORE. The core's Undead Fortitude creature
 * ability has always been text, and the damage path went straight from "this
 * reaches 0" to Dying, massive damage or destruction. The guard is asked
 * there, after subdual (an unconscious creature was never going to die) and
 * before everything else, because "drop to 1 HP instead" means none of the
 * zero-HP consequences happen.
 *
 * "OPPOSED, LEVEL-BASED" follows the core's own precedent — Resilience of
 * Stone and aligned control roll the defender's save against the OPPONENT's
 * Level DC. With no known source (a fall, a trap with no level) the
 * defender's own Level DC stands in, and the card says so.
 *
 * GASEOUS ESCAPE'S HIT POINTS. The page says what the vampire becomes, not
 * where its HP lands. Read, and said on the release notes for Graham: the
 * blow leaves it at 1 HP, gaseous — "before you resolve dying or
 * destruction" is only meaningful if neither then happens.
 *
 * Declaration, on any applied effect (a feat's transferred one):
 *
 *   flags.trg-prime.deathGuard = {
 *     label: "Unliving Fortitude",
 *     save: "fortitude",                  // a save guard rolls; omit for an offer
 *     exceptDamageTypes: ["essence"],
 *     exceptWeakness: true,
 *     frequency: "daily",                 // optional
 *     offer: true,                        // optional: asked rather than automatic
 *     spell: "Gaseous Form"               // optional: applied to self on success
 *   }
 *
 * Pure. The workflow rolls, asks and writes.
 */

const SYSTEM_ID = "trg-prime";
const DEATH_GUARD_FLAG = "deathGuard";
/** The action key a guard's save carries, so a conditional can scope to it. */
export const DEATH_GUARD_ACTION = "deathGuard";
/** Actor flag: label → true, for a guard used today. Cleared at daily preparation. */
export const DECLARED_USED_TODAY_FLAG = "declaredUsedToday";

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const lower = (v) => String(v ?? "").trim().toLowerCase();

/** One declaration, normalised; null when it is neither a save nor an offer. */
function normaliseDeathGuard(raw) {
  if (!raw || typeof raw !== "object") return null;
  const save = SAVES.includes(lower(raw.save)) ? lower(raw.save) : "";
  const offer = raw.offer === true;
  // AN UNCONDITIONAL GUARD (3.630.0): Second Heart, Phoenix Root, Prism
  // Lotus hold with no save and no question — the spell or herb already
  // decided. A guard must still be one of the three.
  const auto = raw.auto === true && !save && !offer;
  if (!save && !offer && !auto) return null;
  const out = {
    label: String(raw.label ?? "").trim() || "Death guard",
    save,
    offer,
    exceptDamageTypes: (Array.isArray(raw.exceptDamageTypes) ? raw.exceptDamageTypes : []).map(lower).filter(Boolean),
    exceptWeakness: raw.exceptWeakness === true,
    frequency: ["daily", "1/day"].includes(lower(raw.frequency)) ? "daily" : "",
    spell: String(raw.spell ?? "").trim()
  };
  // Keys added only when set, so a 3.627.0 declaration reads exactly as it did.
  if (auto) out.auto = true;
  // WHEN IT ANSWERS. "zeroHp" (the default): damage would reduce you to 0.
  // "death" (3.630.0): you would die — Phoenix Root's "Dying would exceed
  // your Death State", Prism Lotus's "the first time you would die".
  if (lower(raw.trigger) === "death") out.trigger = "death";
  // ONE USE: the effect carrying it is deleted when it fires.
  if (raw.once === true) out.once = true;
  // What a "death" guard leaves you on: 1 HP, or half your maximum.
  if (out.trigger === "death") out.heal = lower(raw.heal) === "half" ? "half" : "1";
  // Second Heart: "cannot prevent an effect that kills the target outright"
  // (massive damage) "or destruction of a creature that does not use the
  // normal Dying rules".
  if (raw.notOutright === true) out.notOutright = true;
  if (raw.needsDeathState === true) out.needsDeathState = true;
  return out;
}

/**
 * Every guard on these effects, saves first: an automatic save is tried
 * before anyone is asked. `trigger` picks the 0-HP guards (the default) or
 * the "would die" ones (3.630.0).
 */
export function declaredDeathGuards(effects = [], { trigger = "zeroHp" } = {}) {
  return declaredDeathGuardSources(effects, { trigger }).map((row) => row.spec);
}

/** The same, each with the effect that carries it, so a one-use guard can be spent. */
export function declaredDeathGuardSources(effects = [], { trigger = "zeroHp" } = {}) {
  const out = [];
  const want = trigger === "death" ? "death" : "zeroHp";
  for (const effect of Array.from(effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.[DEATH_GUARD_FLAG];
    for (const row of Array.isArray(raw) ? raw : (raw ? [raw] : [])) {
      const spec = normaliseDeathGuard(row);
      if (!spec || (spec.trigger ?? "zeroHp") !== want) continue;
      // The same guard granted twice (Zombie Fortitude grants Unliving
      // Fortitude, which the character may also hold) is one guard.
      if (!out.some((g) => g.spec.label === spec.label)) out.push({ spec, effect });
    }
  }
  return out.sort((a, b) => Number(Boolean(a.spec.offer)) - Number(Boolean(b.spec.offer)));
}

/** What a "death" guard restores: 1 HP, or half the maximum (at least 1). */
export function deathGuardHealTo(spec, maxHP) {
  if (spec?.heal === "half") return Math.max(1, Math.floor((Number(maxHP) || 0) / 2));
  return 1;
}

/**
 * Why this guard does not answer this blow, or null when it does.
 *
 * @param {object} spec normalised
 * @param {{damageTypes?: string[], weaknesses?: Iterable<string>, usedToday?: object, massive?: boolean, noDeathState?: boolean}} ctx
 */
export function deathGuardExcepted(spec, ctx = {}) {
  if (!spec) return "no guard";
  if (spec.frequency === "daily" && ctx.usedToday?.[spec.label]) return "already used today";
  if (spec.notOutright && ctx.massive) return "the blow kills outright (massive damage)";
  if (spec.needsDeathState && ctx.noDeathState) return "the creature has no Death State";
  const types = (Array.isArray(ctx.damageTypes) ? ctx.damageTypes : []).map(lower).filter(Boolean);
  const hit = types.find((t) => spec.exceptDamageTypes.includes(t));
  if (hit) return `the damage is ${hit}`;
  if (spec.exceptWeakness) {
    const weak = new Set(Array.from(ctx.weaknesses ?? []).map(lower));
    const w = types.find((t) => weak.has(t));
    if (w) return `${w} is a damage type it is weak to`;
  }
  return null;
}

/**
 * Whose Level DC the save is against: the source's when known, else the
 * defender's own.
 *
 * @param {number|null} sourceLevel
 * @param {number} ownLevel
 * @param {(level: number) => number} levelDC
 */
export function deathGuardDC(sourceLevel, ownLevel, levelDC) {
  const known = Number.isFinite(Number(sourceLevel)) && sourceLevel !== null && sourceLevel !== "";
  const level = Math.max(0, Math.floor(Number(known ? sourceLevel : ownLevel) || 0));
  return { dc: levelDC(level), level, from: known ? "source" : "own" };
}

/** Did this degree save the creature? Success or better. */
export function deathGuardHolds(degreeKey) {
  return ["heroic", "critical", "success"].includes(lower(degreeKey));
}

/** Does the card need to say the type was not known? */
export function deathGuardTypeUnknown(spec, damageTypes = []) {
  return Boolean(spec && (spec.exceptDamageTypes.length || spec.exceptWeakness)
    && !(Array.isArray(damageTypes) && damageTypes.some((t) => lower(t))));
}
