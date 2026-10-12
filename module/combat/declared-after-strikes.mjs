/**
 * After-strike effects a CREATURE declares (3.627.0).
 *
 * 3.626.0 gave a registered rune an `afterStrike`: a save the struck
 * creature rolls against the wielder's Level DC, a ladder, conditions. The
 * Unliving feats of Pillars of Faith, Chapter 9 are the same shape carried
 * by the attacker rather than the blade, and narrowed to named natural
 * attacks and to a CRITICAL INJURY:
 *
 *   Ghoulish Venom   "When you inflict a critical injury with your Bite or
 *                    Claws, the target must attempt a Fortitude save" —
 *                    Partial slowed 1 for 1 round; Failure paralyzed for 1
 *                    round; Fumble paralyzed for 1 minute, a new save at
 *                    the end of each of its turns.
 *   Paralytic Touch  Bony Hand; Failure paralysed 1 round; Fumble 1 minute
 *                    and prone; Blunder permanently and prone. "Hard (DC +2)
 *                    if the critical injury is Serious and Very Hard (DC +5)
 *                    if … Deadly."
 *   Plague Carrier, Ghoul Fever, Mummy Rot — "the target must attempt a
 *                    Fortitude save against <disease>. The disease level is
 *                    equal to your level. A creature can be exposed to your
 *                    <disease> only once per day."
 *
 * "INFLICT A CRITICAL INJURY" is a critical hit on a creature not immune to
 * criticals: in this system every critical rolls on an injury table unless
 * the target is immune, and a critical that rolls none has inflicted none.
 *
 * Declaration, on any applied effect (a feat's transferred one):
 *
 *   flags.trg-prime.afterStrikes = [{
 *     key, label, weaponNames: ["Ghoul Claws", …], onCriticalInjury: true,
 *     save: "fortitude", dcBySeverity: { serious: 2, deadly: 5 },
 *     outcomes: { failure: "…" },
 *     conditions: { failure: [{ key: "paralyzed", rounds: 1 }],
 *                   fumble: [{ key: "paralyzed", minutes: 1, resave: true }] },
 *     expose: { affliction: "Ghoul Fever", level: "actorLevel", oncePerDay: true }
 *   }]
 *
 * Pure. The workflow (rune-strike-workflow.mjs) rolls and applies, and runs
 * these beside a rune's own after-strikes.
 */

const SYSTEM_ID = "trg-prime";
const AFTER_STRIKES_FLAG = "afterStrikes";
/** Target flag: `${sourceUuid}:${affliction}` → worldTime of the exposure. */
export const EXPOSED_FLAG = "declaredExposures";
export const DAY_SECONDS = 86400;

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const lower = (v) => String(v ?? "").trim().toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []).map(lower).filter(Boolean);

/** One declaration, normalised; null when it neither saves nor exposes. */
function normaliseDeclaredAfterStrike(raw) {
  if (!raw || typeof raw !== "object") return null;
  const expose = raw.expose && typeof raw.expose === "object" && String(raw.expose.affliction ?? "").trim()
    ? {
      affliction: String(raw.expose.affliction).trim(),
      level: raw.expose.level === "actorLevel" || raw.expose.level === undefined ? "actorLevel" : Math.max(0, Math.trunc(Number(raw.expose.level) || 0)),
      oncePerDay: raw.expose.oncePerDay === true
    }
    : null;
  const save = SAVES.includes(lower(raw.save)) ? lower(raw.save) : "";
  if (!expose && !save && !raw.selfHeal && raw.dispel !== true) return null;
  const sev = raw.dcBySeverity && typeof raw.dcBySeverity === "object" ? raw.dcBySeverity : {};
  return {
    key: String(raw.key ?? raw.label ?? "").trim() || "afterStrike",
    label: String(raw.label ?? "").trim() || "After the strike",
    save,
    weaponNames: list(raw.weaponNames),
    onCritical: raw.onCritical === true,
    onCriticalInjury: raw.onCriticalInjury === true,
    oncePerRound: raw.oncePerRound === true,
    targetTypes: list(raw.targetTypes),
    targetTraits: list(raw.targetTraits),
    dcBySeverity: {
      minor: Math.trunc(Number(sev.minor) || 0),
      serious: Math.trunc(Number(sev.serious) || 0),
      deadly: Math.trunc(Number(sev.deadly) || 0)
    },
    outcomes: raw.outcomes && typeof raw.outcomes === "object" ? raw.outcomes : {},
    conditions: raw.conditions && typeof raw.conditions === "object" ? raw.conditions : {},
    expose,
    // THE CODEX'S OWN AFTER-STRIKES (3.631.0; Fiends & Fables 3.0 block 1):
    //   livingOnly        Life Drain — "damages a living target"
    //   selfHeal          Life Drain — "the creature is healed of 3 HP"
    //   drain             Life Drain — "Soul Drain 5. Further damage dealt by
    //                     the creature increases the amount … by 5": the
    //                     failed save's condition, escalating per target
    //   amountBySeverity  Shadow Hand — "1d6 soul drain … 2d6 if the critical
    //                     was serious or deadly": rolled, as the condition's value
    //   dispel            Dispelling Strike — a Dispel attempt at 0 PP on a hit
    livingOnly: raw.livingOnly === true,
    selfHeal: Math.max(0, Math.trunc(Number(raw.selfHeal) || 0)),
    drain: raw.drain && typeof raw.drain === "object" && raw.drain.key
      ? { key: String(raw.drain.key).trim(), base: Math.max(0, Number(raw.drain.base) || 0), perHit: Math.max(0, Number(raw.drain.perHit) || 0), onFailureOnly: raw.drain.onFailureOnly !== false }
      : null,
    amountBySeverity: raw.amountBySeverity && typeof raw.amountBySeverity === "object"
      ? { key: String(raw.amountBySeverity.key || "soulDrain").trim(), minor: String(raw.amountBySeverity.minor ?? ""), serious: String(raw.amountBySeverity.serious ?? ""), deadly: String(raw.amountBySeverity.deadly ?? "") }
      : null,
    dispel: raw.dispel === true
  };
}

/** Every after-strike on these effects. */
export function declaredAfterStrikes(effects = []) {
  const out = [];
  for (const effect of Array.from(effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.[AFTER_STRIKES_FLAG];
    for (const row of Array.isArray(raw) ? raw : (raw ? [raw] : [])) {
      const spec = normaliseDeclaredAfterStrike(row);
      if (spec && !out.some((s) => s.key === spec.key)) out.push(spec);
    }
  }
  return out;
}

/**
 * A WEAPON'S OWN AFTER-STRIKES (3.633.0; F&F 3.0 block 3, R3). Declared on
 * the weapon item under the same flag, and narrowed to that weapon — "Tentacle
 * +18 … plus Slime" is the tentacle's.
 */
export function weaponAfterStrikes(weapon) {
  if (!weapon || weapon.type !== "weapon") return [];
  return declaredAfterStrikes([weapon]).map((spec) => ({ ...spec, weaponNames: [lower(weapon.name)] }));
}

/**
 * The attacker's own affliction item of this name, if it carries one (the
 * Aboleth's Slime); null otherwise — the shared pack is then asked.
 */
export function ownAfflictionItem(actor, name) {
  const want = lower(name);
  if (!want) return null;
  return Array.from(actor?.items ?? []).find((i) => i?.type === "affliction" && lower(i?.name) === want) ?? null;
}

/**
 * Does this declaration fire on this hit?
 *
 * @param {object} spec normalised
 * @param {{weaponName?: string, critical?: string|boolean|null, criticalImmune?: boolean,
 *   used?: object, marker?: string, targetTypes?: string[], targetTraits?: string[]}} ctx
 */
export function declaredAfterStrikeFires(spec, ctx = {}) {
  if (!spec) return false;
  if (spec.weaponNames.length && !spec.weaponNames.includes(lower(ctx.weaponName))) return false;
  if ((spec.onCritical || spec.onCriticalInjury) && !ctx.critical) return false;
  if (spec.onCriticalInjury && ctx.criticalImmune) return false;
  if (spec.oncePerRound && ctx.used?.[ctx.marker]) return false;
  if (spec.targetTypes.length || spec.targetTraits.length) {
    const have = new Set([...(ctx.targetTypes ?? []), ...(ctx.targetTraits ?? [])].map(lower));
    if (!spec.targetTypes.some((t) => have.has(t)) && !spec.targetTraits.some((t) => have.has(t))) return false;
  }
  return true;
}

/** The DC: the attacker's Level DC, raised by the injury's severity where printed. */
export function declaredAfterStrikeDC(spec, baseDC, severity) {
  return Math.trunc(Number(baseDC) || 0) + (spec?.dcBySeverity?.[lower(severity)] ?? 0);
}

/**
 * The once-a-day exposure key, and whether it is still closed.
 *
 * NO DOTS (3.627.1). The key is a property name inside an actor flag, and
 * Foundry reads every dot in an update path as a level of nesting: the
 * 3.627.0 key, `Actor.<id>:ghoul fever`, landed as `{Actor: {"<id>:ghoul
 * fever": …}}`, the flat lookup below never found it, and a second bite the
 * same day exposed the target again — found live on 7 October 2026. A dot
 * in a uuid or an affliction's name becomes "_".
 */
export function exposureKey(sourceUuid, affliction) {
  return `${String(sourceUuid ?? "")}:${lower(affliction)}`.replace(/\./g, "_");
}
export function exposureBlocked(exposures = {}, key = "", now = 0) {
  const at = Number(exposures?.[key]);
  return Number.isFinite(at) && now - at < DAY_SECONDS;
}

/**
 * A declared condition as the tag `applyConditionTags` takes, with its own
 * clock: `rounds` against the running combat, or six seconds a round of
 * world time outside one (the core's own reckoning, critical-ap-watch.mjs);
 * `minutes` against world time; neither, no clock ("paralysed permanently").
 *
 * @returns {{key, value, expiresRound?, expiresTime?, resave: boolean}}
 */
export function declaredConditionTag(row, { combatRound = null, worldTime = 0 } = {}) {
  const tag = { key: String(row?.key ?? "").trim(), value: row?.value ?? null };
  const rounds = Math.trunc(Number(row?.rounds) || 0);
  const minutes = Math.trunc(Number(row?.minutes) || 0);
  if (rounds > 0) {
    if (Number.isFinite(Number(combatRound)) && combatRound !== null) tag.expiresRound = Number(combatRound) + rounds;
    else tag.expiresTime = Number(worldTime || 0) + rounds * 6;
  }
  if (minutes > 0) tag.expiresTime = Number(worldTime || 0) + minutes * 60;
  // "FOR AS LONG AS IT REMAINS SICKENED" — the clock is another condition's
  // (combat/linked-conditions-workflow.mjs reads `endsWith`).
  if (row?.endsWith) tag.endsWith = String(row.endsWith).trim();
  // "REDUCED TO 0 HIT POINTS" — not a condition; the applier writes the HP.
  // Written as a row keyed `zeroHP`, because the ladder reader keeps only
  // keyed rows (rune-declarations.mjs `afterStrikeOutcome`).
  if (row?.zeroHP === true || tag.key === "zeroHP") tag.zeroHP = true;
  tag.resave = row?.resave === true;
  return tag;
}

/**
 * Life Drain's escalation: the value the failed save inflicts on THIS
 * target, from how many times this creature has drained it before.
 * `{ value, hits }` — hits is the new count to store.
 */
export function escalatingDrainValue(drain, priorHits = 0) {
  const hits = Math.max(0, Math.trunc(Number(priorHits) || 0));
  return { value: drain.base + drain.perHit * hits, hits: hits + 1 };
}

/** Shadow Hand's die by the strike's severity, or "". */
export function amountFormulaBySeverity(spec, severity) {
  const s = lower(severity);
  if (!spec?.amountBySeverity) return "";
  return spec.amountBySeverity[s] || spec.amountBySeverity.minor || "";
}
