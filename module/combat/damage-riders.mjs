/**
 * DECLARED STRIKE DAMAGE RIDERS (3.564.0).
 *
 * "Once per round, the first time you successfully inflict HP damage
 * upon the Subject with a Strike or Grimward spell, you inflict +1d6
 * secondary damage" — Pillars of Faith's Judgement, and the exact shape
 * of the Ranger's Precision Hunter, which is wired by name through
 * ranger.mjs and the attack workflow. Graham (17 Sep 2026): "Judgement
 * secondary damage should be automated." A module cannot reach the
 * damage formula, so the rider is DATA on an effect the module creates:
 *
 *   flags["trg-prime"].strikeDamageRider = {
 *     dice: "1d6",              // NdM, added to the weapon's own formula
 *     label: "Judgement",       // the card line
 *     targetUuids: [uuid],      // optional: only against these creatures
 *     oncePerRound: true        // optional: burns a marker on the first hit
 *   }
 *
 * AND, 3.696.0 (CD2/CD12 of the Pillars of Faith audit), all optional:
 *     weaponNames: ["Bite", "Fangs"],   // only Strikes with these weapons
 *     damageType: "essence",            // dice of THIS type, a packet of its own
 *     targetLiving: true,               // only against a living creature
 *     spells: true,                     // also a spell's damage (Judgement's
 *                                       //   "with a Strike or Grimward spell")
 *     onCritical: {                     // a critical injury it scores, or a
 *       conditions: [{ key, value }],   //   critical hit against the target:
 *       effect: { name, changes, … }    //   laid on the creature (Hunter's
 *     }                                 //   Fangs' Bleed 1, Final Sanction's −1)
 *   Blood Awakened: Bite or Fangs, +1d6 essence once a round against a living
 *   creature. `onCritical` is not limited by `oncePerRound`: the burn governs
 *   the dice alone.
 *
 * The attack workflow asks `damageRidersFor` which riders apply to THIS
 * strike (target, and whether the round's marker is already burnt),
 * appends their dice to the damage formula in the weapon's own damage
 * type, prints a line per rider, and burns the marker on a hit — the
 * same three moments Precision Hunter has. The marker map resets each
 * round beside `precisionHunterUsed` in documents/combat.mjs.
 *
 * Pure; no Foundry. Harness: verify-damage-riders.mjs.
 */

const SYSTEM_ID = "trg-prime";

/** The per-round marker map on the actor: effect id → true. */
export const RIDERS_USED_FLAG = "damageRidersUsed";

/**
 * Every well-formed rider an actor's effects declare.
 *
 * @param {Array<{id, name, disabled, flags}>} effects `actor.appliedEffects`.
 * @returns {Array<{id, dice, count, faces, label, targetUuids, oncePerRound}>}
 */
export function declaredDamageRiders(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.strikeDamageRider;
    if (!raw || typeof raw !== "object") continue;
    const match = /^\s*(\d{1,2})d(\d{1,3})\s*$/i.exec(String(raw.dice ?? ""));
    // A CRITICAL-ONLY RIDER (3.696.0, CD2): Hunter's Fangs' "Bleed 1 on a
    // critical injury" adds no dice. It declares `onCritical` and no `dice`;
    // it reaches criticalRiders only — damageRidersFor never offers it.
    const critOnly = !match && raw.onCritical && typeof raw.onCritical === "object" && !String(raw.dice ?? "").trim();
    if (!match && !critOnly) continue;
    const count = critOnly ? 0 : Number(match[1]);
    const faces = critOnly ? 0 : Number(match[2]);
    if (!critOnly && (!count || !faces)) continue;
    const targetUuids = Array.isArray(raw.targetUuids)
      ? raw.targetUuids.map((u) => String(u ?? "").trim()).filter(Boolean)
      : [];
    // MORE DICE AGAINST A WOUNDED TARGET (3.625.0): Final Sanction's
    // "if that creature currently has half its maximum Hit Points or
    // fewer, increase the Judgement damage by 1d6". Read by damageRidersFor
    // against the HP the damage path knows.
    const extraMatch = /^\s*(\d{1,2})d(\d{1,3})\s*$/i.exec(String(raw.lowHalfExtraDice ?? ""));
    const row = {
      id: String(effect.id ?? ""),
      dice: critOnly ? "" : `${count}d${faces}`,
      count,
      faces,
      label: String(raw.label ?? effect.name ?? "Rider"),
      targetUuids,
      oncePerRound: Boolean(raw.oncePerRound),
      lowHalfExtraDice: extraMatch ? `${Number(extraMatch[1])}d${Number(extraMatch[2])}` : ""
    };
    // MORE DICE AGAINST A KIND OF CREATURE (3.630.0): Pillars of Faith's
    // Restless End — "Essence Judgement damage against Undead or Unliving
    // creatures increases by 1d6". Present only when declared.
    const vs = raw.extraVs && typeof raw.extraVs === "object" ? raw.extraVs : null;
    const vsMatch = vs ? /^\s*(\d{1,2})d(\d{1,3})\s*$/i.exec(String(vs.dice ?? "")) : null;
    if (vsMatch) {
      row.extraVs = {
        dice: `${Number(vsMatch[1])}d${Number(vsMatch[2])}`,
        label: String(vs.label ?? ""),
        targetTypes: (Array.isArray(vs.targetTypes) ? vs.targetTypes : []).map((t) => String(t).toLowerCase()),
        targetTraits: (Array.isArray(vs.targetTraits) ? vs.targetTraits : []).map((t) => String(t).toLowerCase())
      };
    }
    // THE 3.696.0 FILTERS (CD2/CD12). Absent, a rider behaves exactly as before.
    const names = (Array.isArray(raw.weaponNames) ? raw.weaponNames : []).map((n) => String(n ?? "").trim().toLowerCase()).filter(Boolean);
    if (names.length) row.weaponNames = names;
    const type = String(raw.damageType ?? "").trim().toLowerCase();
    if (/^[a-z]+$/.test(type)) row.damageType = type;
    if (raw.targetLiving === true) row.targetLiving = true;
    if (raw.spells === true) row.spells = true;
    // ONE CLASS'S SPECIALIST SPELLS (3.696.0): Judgement's "the first Strike or
    // Grimward spell" — `spellClasses: ["Grimward"]` with `spells: true`.
    const classes = (Array.isArray(raw.spellClasses) ? raw.spellClasses : []).map((c) => String(c ?? "").trim().toLowerCase()).filter(Boolean);
    if (classes.length) row.spellClasses = classes;
    const crit = raw.onCritical && typeof raw.onCritical === "object" ? raw.onCritical : null;
    if (crit) {
      const conditions = (Array.isArray(crit.conditions) ? crit.conditions : [])
        .filter((c) => String(c?.key ?? "").trim())
        .map((c) => ({ key: String(c.key).trim(), ...(c.value !== undefined && c.value !== null ? { value: Number(c.value) } : {}), label: String(c.label ?? c.key) }));
      const effect = crit.effect && typeof crit.effect === "object" ? crit.effect : null;
      if (conditions.length || effect) row.onCritical = { conditions, effect, label: String(crit.label ?? row.label) };
    }
    if (critOnly && !row.onCritical) continue;
    out.push(row);
  }
  return out;
}

/**
 * Whether a rider's 3.696.0 filters admit this blow. Pure.
 * `weaponName` "" is a spell's damage (no weapon); `living` the struck
 * creature's (isLivingCreature).
 */
/**
 * WHOSE SPELL IS IT (3.696.3; found testing Judgement live). "A Grimward
 * spell" is a spell the Grimward casts as a Grimward — the Divinity spells it
 * prepares as well as its specialist spells — not only a spell whose
 * `specialistClass` is Grimward (none of those deal damage). Pure:
 *   - a specialist spell belongs to its specialist class;
 *   - an innate spell (a race's, a feat's, an item's) belongs to no class;
 *   - any other spell belongs to the caster's classes. A multiclass caster's
 *     list spell is admitted for each of its classes: the core does not
 *     record which class prepared it.
 *
 * @param {object} spellSystem the spell item's `system`
 * @param {string[]} casterClasses the caster's class names
 * @returns {string[]}
 */
export function spellCastingClasses(spellSystem = {}, casterClasses = []) {
  if (spellSystem?.specialist) return [String(spellSystem.specialistClass ?? "")].filter(Boolean);
  if (spellSystem?.innate) return [];
  return (casterClasses ?? []).map((c) => String(c ?? "")).filter(Boolean);
}

function riderAdmits(rider, { weaponName = "", living = true, spell = false, targetUuid = "", spellClass = "" } = {}) {
  if (!rider) return false;
  const uuid = String(targetUuid ?? "").trim();
  if ((rider.targetUuids ?? []).length && (!uuid || !rider.targetUuids.includes(uuid))) return false;
  if (spell && !rider.spells) return false;
  if (spell && (rider.spellClasses ?? []).length) {
    // `spellClass` is one class or several (3.696.3): see spellCastingClasses.
    const by = (Array.isArray(spellClass) ? spellClass : [spellClass]).map((c) => String(c ?? "").trim().toLowerCase()).filter(Boolean);
    if (!rider.spellClasses.some((c) => by.includes(c))) return false;
  }
  const name = String(weaponName ?? "").trim().toLowerCase();
  if ((rider.weaponNames ?? []).length && (spell || !rider.weaponNames.some((n) => name === n || name.startsWith(`${n} `) || name.startsWith(`${n}(`)))) return false;
  if (rider.targetLiving && !living) return false;
  return true;
}

/** The riders whose `onCritical` a critical against this creature lays. Pure; not limited by the round's burn. */
export function criticalRiders(riders = [], ctx = {}) {
  return (riders ?? []).filter((r) => r.onCritical && riderAdmits(r, ctx));
}

/**
 * The riders that apply to one strike.
 *
 * A rider naming targets applies only when THIS target is one of them;
 * a rider naming none applies to every strike. A once-per-round rider
 * whose marker is burnt sits out until the round resets.
 *
 * @param {object[]} riders From declaredDamageRiders.
 * @param {object} ctx
 * @param {string} [ctx.targetUuid] The struck creature's actor uuid.
 * @param {object} [ctx.used] The actor's marker map (effect id → true).
 */
export function damageRidersFor(riders = [], { targetUuid = "", used = {}, targetHp = NaN, targetMax = 0, targetTypes = [], targetTraits = [], weaponName = "", living = true, spell = false, spellClass = "" } = {}) {
  const types = (targetTypes ?? []).map((t) => String(t).toLowerCase());
  const traits = (targetTraits ?? []).map((t) => String(t).toLowerCase());
  const uuid = String(targetUuid ?? "").trim();
  const max = Number(targetMax) || 0;
  const hp = Number(targetHp);
  const low = max > 0 && Number.isFinite(hp) && hp <= Math.floor(max / 2);
  return (riders ?? []).filter((r) => {
    // A critical-only rider adds nothing to a blow (3.696.0).
    if (r.count === 0) return false;
    // The named-target filter lives in riderAdmits (3.696.0).
    if (r.oncePerRound && used?.[r.id]) return false;
    // THE 3.696.0 FILTERS: the weapon, a living target, a spell's damage.
    if (!riderAdmits(r, { weaponName, living, spell, targetUuid: uuid, spellClass })) return false;
    return true;
  }).map((r) => (r.lowHalfExtraDice && low
    // The rider grows for this strike only; the stored rider is untouched.
    ? { ...r, dice: `${r.dice} + ${r.lowHalfExtraDice}`, grown: true }
    : r)).map((r) => {
    const vs = r.extraVs;
    if (!vs) return r;
    const hits = vs.targetTypes.some((t) => types.includes(t)) || vs.targetTraits.some((t) => traits.includes(t));
    // NAMED ON THE CARD (3.630.1, F14): "+1d6 + 1d6" with no word for the
    // second die read as a doubled Judgement, not Restless End.
    return hits ? { ...r, dice: `${r.dice} + ${vs.dice}`, grown: true, ...(vs.label ? { grownBy: vs.label } : {}) } : r;
  });
}

/** The formula fragment the damage roll appends: " + 1d6 + 2d6". A typed rider (3.696.0) is its own packet, not here. */
export function riderFormula(riders = []) {
  return (riders ?? []).filter((r) => !r.damageType).map((r) => ` + ${r.dice}`).join("");
}

/**
 * A TYPED RIDER'S PACKET (3.696.0, CD2): Blood Awakened's "+1d6 essence" on a
 * piercing Bite is essence, met by the target's defences as essence. The shape
 * the attack workflow's typed extras take (creature-secondary.mjs). Pure.
 */
export function typedRiderPackets(riders = []) {
  return (riders ?? []).filter((r) => r.damageType).map((r) => ({
    label: `${r.label} (${r.dice} ${r.damageType})`,
    dice: String(r.dice).replace(/\s+/g, ""), type: r.damageType, secondaryCritical: null, conditional: false,
    resolved: false, applies: true, why: "", parameter: "", against: "", mundane: false, rider: true
  }));
}

/** The marker-map update that burns the once-per-round riders after a hit. */
export function ridersBurnUpdate(riders = [], used = {}) {
  const next = { ...(used ?? {}) };
  let changed = false;
  for (const r of riders ?? []) {
    if (r.oncePerRound && !next[r.id]) { next[r.id] = true; changed = true; }
  }
  return changed ? next : null;
}
