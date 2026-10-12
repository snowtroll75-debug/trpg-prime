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
    if (!match) continue;
    const count = Number(match[1]);
    const faces = Number(match[2]);
    if (!count || !faces) continue;
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
      dice: `${count}d${faces}`,
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
    out.push(row);
  }
  return out;
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
export function damageRidersFor(riders = [], { targetUuid = "", used = {}, targetHp = NaN, targetMax = 0, targetTypes = [], targetTraits = [] } = {}) {
  const types = (targetTypes ?? []).map((t) => String(t).toLowerCase());
  const traits = (targetTraits ?? []).map((t) => String(t).toLowerCase());
  const uuid = String(targetUuid ?? "").trim();
  const max = Number(targetMax) || 0;
  const hp = Number(targetHp);
  const low = max > 0 && Number.isFinite(hp) && hp <= Math.floor(max / 2);
  return (riders ?? []).filter((r) => {
    if (r.targetUuids.length && (!uuid || !r.targetUuids.includes(uuid))) return false;
    if (r.oncePerRound && used?.[r.id]) return false;
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

/** The formula fragment the damage roll appends: " + 1d6 + 2d6". */
export function riderFormula(riders = []) {
  return (riders ?? []).map((r) => ` + ${r.dice}`).join("");
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
