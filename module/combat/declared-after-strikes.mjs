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
  const selfCondition = raw.selfCondition && typeof raw.selfCondition === "object" && String(raw.selfCondition.key ?? "").trim()
    ? { key: String(raw.selfCondition.key).trim(), rounds: Math.max(0, Math.trunc(Number(raw.selfCondition.rounds ?? 1) || 0)), onDamage: raw.selfCondition.onDamage !== false }
    : null;
  // A CHOICE OF SPELLS CAST AT THE TARGET (3.654.0; F&F 3.0 block 21 R7 —
  // the Fancalia's Enchanting Touch: "subjected to the effects of either a
  // sleep, hold kind or confusion spell"), at a printed DC.
  const castChoice = raw.castChoice && typeof raw.castChoice === "object"
    && (Array.isArray(raw.castChoice.spells) ? raw.castChoice.spells : []).some((n) => String(n ?? "").trim())
    ? { spells: raw.castChoice.spells.map((n) => String(n ?? "").trim()).filter(Boolean), dc: Math.max(0, Math.trunc(Number(raw.castChoice.dc) || 0)) }
    : null;
  if (!expose && !save && !raw.selfHeal && raw.dispel !== true && !selfCondition && !castChoice) return null;
  const sev = raw.dcBySeverity && typeof raw.dcBySeverity === "object" ? raw.dcBySeverity : {};
  return {
    key: String(raw.key ?? raw.label ?? "").trim() || "afterStrike",
    label: String(raw.label ?? "").trim() || "After the strike",
    save,
    weaponNames: list(raw.weaponNames),
    // ONLY IN CERTAIN FORMS (3.651.0, block 18 R11 — Huanling Venom: "when
    // it is in spider or serpent form"): Change Shape form keys.
    requiresForm: list(raw.requiresForm),
    // ONLY ON A TARGET LEFT IN A CONDITION (3.652.0; F&F 3.0 block 19 R8 —
    // the Lycanthropic Curse: "Any humanoid creature that suffers bleed
    // damage from one of the lycanthropes natural attacks"; Graham, 16
    // October 2026, "Go with your recommendations": the critical injury that
    // left it Bleeding). Read after the injury and the damage have landed.
    requiresTargetCondition: list(raw.requiresTargetCondition),
    // ONLY A BLOW THAT GOT THROUGH (3.653.0; F&F 3.0 block 20 R2 and R7 —
    // Graham, 16 October 2026: "Go with your recommendations"). The Medusa's
    // Snake Venom, "any creature that takes damage from the bite", and Mummy
    // Rot, "any creature that takes hit point damage from the mummy's slam":
    // the declaration fires only when the Strike dealt damage.
    requiresDamage: raw.requiresDamage === true,
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
    dispel: raw.dispel === true,
    //   dc                Petrifying Bite (3.639.0, F&F 3.0 block 9 R5) — "a DC 19
    //                     Fortitude save": a PRINTED DC in place of the attacker's
    //                     Level DC (the Cockatrice's is 17)
    //   stack             "Subsequent failed saves intensify the Slowed
    //                     condition": the declared value ADDS to what the target
    //                     already has, where Slowed would otherwise keep the higher
    //   thresholds        "Once a creature's actions are reduced to 0, it becomes
    //                     petrified": [{ key: "slowed", atLeast: 3, apply:
    //                     "petrified" }] — once the condition reaches the value,
    //                     the named one is applied too
    dc: Math.max(0, Math.trunc(Number(raw.dc) || 0)),
    stack: raw.stack === true,
    thresholds: (Array.isArray(raw.thresholds) ? raw.thresholds : [])
      .map((t) => ({ key: String(t?.key ?? "").trim(), atLeast: Math.trunc(Number(t?.atLeast) || 0), apply: String(t?.apply ?? "").trim() }))
      .filter((t) => t.key && t.apply && t.atLeast > 0),
    //   selfCondition     Dusty Haze (3.635.0, F&F 3.0 block 5 R5) — "Requirements
    //                     A target the broom has just struck takes damage … granting
    //                     it the concealed condition until the beginning of its next
    //                     turn": a condition on the STRIKER, one round by default,
    //                     only when the blow dealt damage unless `onDamage: false`
    selfCondition,
    castChoice,
    //   damageAsDrain     Corruption (3.659.0→3.660.0; F&F 3.0 block 29 R3 — the
    //                     Spectre): "Success The damage of the attack becomes Soul
    //                     Drain" — on these degrees the HP the hit took is given
    //                     back and laid as Soul Drain instead
    //   immuneOn          "Critical The creature is unaffected and is temporarily
    //                     immune to spectral corruption for 1 minute": on these
    //                     degrees the target is immune to THIS rider from THIS
    //                     creature for `seconds`
    damageAsDrain: list(raw.damageAsDrain),
    immuneOn: raw.immuneOn && typeof raw.immuneOn === "object" && list(raw.immuneOn.degrees).length
      ? { degrees: list(raw.immuneOn.degrees), seconds: Math.max(1, Math.trunc(Number(raw.immuneOn.seconds) || 60)) }
      : null
  };
}

/** The immunity record's key for one creature's rider (3.660.0). */
export function afterStrikeImmunityKey(actorUuid, specKey) {
  return `${String(actorUuid ?? "")}|${lower(specKey)}`.replace(/\./g, "_");
}

/** Is the target still immune to this creature's rider? */
export function afterStrikeImmune(record, key, now) {
  return Number(record?.[key] ?? 0) > Number(now || 0);
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
 *   used?: object, marker?: string, targetTypes?: string[], targetTraits?: string[], damageTaken?: number}} ctx
 */
export function declaredAfterStrikeFires(spec, ctx = {}) {
  if (!spec) return false;
  if (spec.weaponNames.length && !spec.weaponNames.includes(lower(ctx.weaponName))) return false;
  if (spec.requiresForm?.length && !spec.requiresForm.includes(lower(ctx.form ?? "own"))) return false;
  if ((spec.onCritical || spec.onCriticalInjury) && !ctx.critical) return false;
  if (spec.onCriticalInjury && ctx.criticalImmune) return false;
  if (spec.requiresTargetCondition?.length) {
    const has = new Set(list(ctx.targetConditions));
    if (!spec.requiresTargetCondition.some((c) => has.has(c))) return false;
  }
  if (spec.oncePerRound && ctx.used?.[ctx.marker]) return false;
  // A REACTION TO DAMAGE DEALT (3.635.0): a self-condition that asks for it
  // fires only when the blow got through.
  if (spec.selfCondition?.onDamage && !(Number(ctx.damageTaken) > 0)) return false;
  if (spec.requiresDamage && !(Number(ctx.damageTaken) > 0)) return false;
  if (spec.targetTypes.length || spec.targetTraits.length) {
    const have = new Set([...(ctx.targetTypes ?? []), ...(ctx.targetTraits ?? [])].map(lower));
    if (!spec.targetTypes.some((t) => have.has(t)) && !spec.targetTraits.some((t) => have.has(t))) return false;
  }
  return true;
}

/** The DC: the printed DC if one is declared, else the attacker's Level DC; raised by the injury's severity where printed. */
export function declaredAfterStrikeDC(spec, baseDC, severity) {
  const base = Number(spec?.dc) > 0 ? Math.trunc(Number(spec.dc)) : Math.trunc(Number(baseDC) || 0);
  return base + (spec?.dcBySeverity?.[lower(severity)] ?? 0);
}

/**
 * "SUBSEQUENT FAILED SAVES INTENSIFY" (3.639.0): with `stack`, the value a
 * failed save lays is what the target already has plus the declared one.
 */
export function stackedConditionValue(spec, existing, incoming) {
  const add = Math.max(0, Number(incoming ?? 1) || 0);
  return spec?.stack ? Math.max(0, Number(existing) || 0) + add : add;
}

/**
 * The conditions a threshold adds, given the values the target now has:
 * `[{ key: "slowed", atLeast: 3, apply: "petrified" }]` with slowed 3 →
 * ["petrified"]. Each applied once.
 */
export function thresholdConditions(spec, values = {}) {
  const out = [];
  for (const t of spec?.thresholds ?? []) {
    if ((Number(values?.[t.key]) || 0) >= t.atLeast && !out.includes(t.apply)) out.push(t.apply);
  }
  return out;
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
  // "DEAFENED FOR 1d4 ROUNDS" (3.662.0; F&F 3.0 block 31 R2 — the Storm
  // Crow's Thunder Strike): a duration that is dice is carried unrolled, and
  // the workflow that lays the condition rolls it once (`withRolledRounds`).
  if (diceRounds(row?.rounds)) tag.roundsDice = String(row.rounds).replace(/\s+/g, "").toLowerCase();
  const rounds = tag.roundsDice ? 0 : Math.trunc(Number(row?.rounds) || 0);
  const minutes = Math.trunc(Number(row?.minutes) || 0);
  if (rounds > 0) {
    if (Number.isFinite(Number(combatRound)) && combatRound !== null) tag.expiresRound = Number(combatRound) + rounds;
    else tag.expiresTime = Number(worldTime || 0) + rounds * 6;
  }
  if (minutes > 0) tag.expiresTime = Number(worldTime || 0) + minutes * 60;
  // "FOR AS LONG AS IT REMAINS SICKENED" — the clock is another condition's
  // (combat/linked-conditions-workflow.mjs reads `endsWith`).
  if (row?.endsWith) tag.endsWith = String(row.endsWith).trim();
  // "2d8 RECURRING PIERCING" (3.640.0, F&F 3.0 block 10 R6 — the Vrock's
  // Cloud of Spores): a recurring row names its damage type.
  if (row?.damageType) tag.damageType = String(row.damageType).trim().toLowerCase();
  // "REDUCED TO 0 HIT POINTS" — not a condition; the applier writes the HP.
  // Written as a row keyed `zeroHP`, because the ladder reader keeps only
  // keyed rows (rune-declarations.mjs `afterStrikeOutcome`).
  if (row?.zeroHP === true || tag.key === "zeroHP") tag.zeroHP = true;
  tag.resave = row?.resave === true;
  // AN ESCAPE SAVE ON THE CONDITION (3.650.0; block 17 R4): the Gorgon's
  // Partial — "a new save at the end of each of its turns". The applier
  // stamps it (effect-application-workflow, 3.627.0); the area sets its DC.
  if (row?.conditionSave && typeof row.conditionSave === "object") tag.conditionSave = { ...row.conditionSave };
  // WHAT FOLLOWS IT (3.660.0; block 29 R3 — the spectral thrall "is no longer
  // controlled but becomes injured 10 for 1 hour"): core's follow-on rail.
  if (row?.followOn && typeof row.followOn === "object" && Array.isArray(row.followOn.tags) && row.followOn.tags.length) tag.followOn = { ...row.followOn };
  return tag;
}

/** Is this declared duration dice ("1d4", "2d6+1") rather than a number? */
function diceRounds(value) {
  return typeof value === "string" && /^\s*\d*d\d+\s*([+-]\s*\d+)?\s*$/i.test(value);
}

/**
 * A dice duration, rolled: the tag takes the clock a fixed `rounds` would
 * have given it — the running combat's round, or six seconds a round of
 * world time outside one — and loses `roundsDice`.
 *
 * @returns {object} the tag with `expiresRound` or `expiresTime`
 */
export function withRolledRounds(tag, rolled, { combatRound = null, worldTime = 0 } = {}) {
  const { roundsDice, ...rest } = tag ?? {};
  const rounds = Math.max(1, Math.trunc(Number(rolled) || 0));
  if (Number.isFinite(Number(combatRound)) && combatRound !== null) rest.expiresRound = Number(combatRound) + rounds;
  else rest.expiresTime = Number(worldTime || 0) + rounds * 6;
  return rest;
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
