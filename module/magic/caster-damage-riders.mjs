/**
 * A RIDER ON THE CASTER'S OWN SPELL DAMAGE (3.625.0). Pure; no Foundry.
 *
 * CONSECRATED FLAME (Ashen feat, Pillars of Faith):
 *   "Whenever one of your spells or abilities inflicts Fire damage against
 *    an Undead creature, the first successful damaging effect you create
 *    against that creature each round inflicts an additional 1d6
 *    secondary Essence damage."
 *
 * Strike riders (magic/strike-riders.mjs) hang secondary damage on a
 * weapon; this hangs it on the caster's SPELL damage, read where the
 * spell's own packet has just landed — the attack path and the save path
 * both — and resolved against the target's defences as its own type, the
 * way a vs-trait pool is. Data on an effect the feat carries:
 *
 *   flags["trg-prime"].spellDamageRider = {
 *     label: "Consecrated Flame",
 *     dice: "1d6",
 *     damageType: "essence",
 *     when: { damageTypes: ["fire"], targetTypes: ["undead"] },  // every named axis must hold
 *     oncePerRound: true          // per creature: a marker keyed by rider and target
 *   }
 *
 * AT 3.684.0 (Eldritch Arts Block 6, G12 and G25) a rider may say
 * `perPP: 1` in place of `dice` (the Demonic Pact's "an additional point of
 * secondary fire damage per PP expended", valued per Graham's Q101 — see
 * magic/cast-pp.mjs), and `when.targetUuids` / `when.attackOnly`
 * (Spellblade's Mark: "your attacks against your Mark").
 *
 * "SUCCESSFUL damaging effect" — the rider fires only when the blow it
 * rides actually took hit points, so an immune or fully-resisted target
 * does not also eat the essence.
 */

const SYSTEM_ID = "trg-prime";

/** The per-round marker map on the caster: "<effect id>:<target uuid>" → true. */
export const SPELL_RIDERS_USED_FLAG = "spellDamageRidersUsed";

const DICE = /^([1-9]\d*)d([1-9]\d*)$/i;
const list = (v) => (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean);

/** Every well-formed rider the caster's effects declare. */
export function declaredSpellDamageRiders(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.spellDamageRider;
    if (!raw || typeof raw !== "object") continue;
    const dice = String(raw.dice ?? "").trim();
    const damageType = String(raw.damageType ?? "").trim().toLowerCase();
    // PER PP, IN PLACE OF DICE (3.684.0; Eldritch Arts Block 6, G12) — the
    // Demonic Pact: "an additional point of secondary fire damage per PP
    // expended". A flat amount, `perPP` × the PP the spell is cast at
    // (Graham's Q101: base + warps and metamagic; the innate spell's own PP
    // for a Warlock; not reduced by a Partial's refund; a cantrip 0). See
    // magic/cast-pp.mjs. A row with dice is read exactly as before.
    const perPP = DICE.test(dice) ? 0 : Math.max(0, Math.trunc(Number(raw.perPP) || 0));
    if ((!DICE.test(dice) && !perPP) || !damageType) continue;
    const row = {
      id: String(effect.id ?? ""),
      label: String(raw.label ?? effect.name ?? "Spell rider"),
      dice: perPP ? "" : dice,
      damageType,
      damageTypes: list(raw.when?.damageTypes),
      targetTypes: list(raw.when?.targetTypes),
      oncePerRound: Boolean(raw.oncePerRound)
    };
    // TWO MORE GATES (3.630.0), present only when declared — Pillars of
    // Faith's Elemental Mantle: "once per round, when a VERDANT spell of
    // yours inflicts [your element] damage, ONE damaged target suffers
    // +1d6 secondary". The spell's tradition, and a once-a-round that is
    // the rider's own rather than one per creature.
    const traditions = list(raw.when?.traditions);
    if (traditions.length) row.traditions = traditions;
    if (raw.oncePerRoundAny === true) { row.oncePerRound = true; row.oncePerRoundAny = true; }
    if (perPP) row.perPP = perPP;
    // ONE NAMED CREATURE, AND ATTACKS ONLY (3.684.0; Block 6, G25) —
    // Spellblade's Mark: "Your attacks against your Mark deal 1d6 secondary
    // force damage" (EA-M26). The uuids are case-sensitive, as every
    // creature axis in the system is; "your attacks" leaves a save spell out.
    const targetUuids = (Array.isArray(raw.when?.targetUuids) ? raw.when.targetUuids : [])
      .map((u) => String(u ?? "").trim()).filter(Boolean);
    if (targetUuids.length) row.targetUuids = targetUuids;
    if (raw.when?.attackOnly === true) row.attackOnly = true;
    out.push(row);
  }
  return out;
}

/**
 * The marker key for one rider against one creature.
 *
 * NO DOTS (3.625.1, found live on 0.7.0). A token actor's uuid is
 * "Scene.X.Token.Y.Actor.Z", and `setFlag` expands a dotted key into
 * nested objects — the marker was written as a tree and read back as a
 * flat key, so it was never found and Consecrated Flame fired on every
 * fire spell in the round. The dots are swapped for a character no uuid
 * contains; the key is only ever compared with itself.
 */
function spellRiderKey(rider, targetUuid) {
  if (rider?.oncePerRoundAny) return `${rider?.id ?? ""}:any`;
  return `${rider?.id ?? ""}:${String(targetUuid ?? "").trim().replace(/\./g, "|")}`;
}

/**
 * The riders that join THIS damage.
 * @param {Array} riders declaredSpellDamageRiders(...)
 * @param {object} ctx
 * @param {string} ctx.damageType the type of the blow that landed
 * @param {string[]} ctx.targetTypes the struck creature's types
 * @param {number} ctx.taken hit points the blow took (0 → nothing rides it)
 * @param {string} [ctx.targetUuid]
 * @param {object} [ctx.used] the marker map
 */
export function spellDamageRidersFor(riders = [], { damageType = "", targetTypes = [], taken = 0, targetUuid = "", used = {}, tradition = "", attack = false, castPP = 0 } = {}) {
  if (!(Number(taken) > 0)) return [];
  const type = String(damageType ?? "").trim().toLowerCase();
  const types = list(targetTypes);
  const traditions = String(tradition ?? "").toLowerCase().split(/[,;/]/).map((t) => t.trim()).filter(Boolean);
  const uuid = String(targetUuid ?? "").trim();
  return (riders ?? []).filter((r) => {
    // A PER-PP RIDER ON A CAST OF NO PP (a cantrip) ADDS NOTHING (3.684.0).
    if (r.perPP && !(Math.trunc(Number(castPP) || 0) > 0)) return false;
    if (r.targetUuids?.length && !r.targetUuids.includes(uuid)) return false;
    if (r.attackOnly && !attack) return false;
    if (r.damageTypes.length && !r.damageTypes.includes(type)) return false;
    if (r.traditions?.length && !r.traditions.some((t) => traditions.includes(t))) return false;
    if (r.targetTypes.length && !r.targetTypes.some((t) => types.includes(t))) return false;
    if (r.oncePerRound && used?.[spellRiderKey(r, targetUuid)]) return false;
    return true;
  });
}

/** The marker map after these riders fired against this creature. */
export function spellRidersBurnUpdate(riders = [], targetUuid = "", used = {}) {
  const next = { ...(used ?? {}) };
  for (const r of riders ?? []) if (r.oncePerRound) next[spellRiderKey(r, targetUuid)] = true;
  return next;
}

/**
 * What a rider rolls on this cast: its dice, or for a per-PP rider (3.684.0)
 * the flat amount, `perPP` × the cast's PP, as a formula.
 */
export function spellRiderFormula(rider, castPP = 0) {
  if (rider?.perPP) return String(Math.max(0, Math.trunc(Number(rider.perPP) || 0)) * Math.max(0, Math.trunc(Number(castPP) || 0)));
  return String(rider?.dice ?? "");
}

/** The card line for a rider that landed. */
export function spellRiderLine(targetName, rider, taken, immune = false, castPP = 0) {
  const how = rider?.perPP ? `${rider.perPP} per PP × ${Math.max(0, Math.trunc(Number(castPP) || 0))} PP` : rider.dice;
  return immune
    ? `${targetName}: <strong>immune</strong> to ${rider.damageType} (${rider.label}).`
    : `${targetName}: <strong>${taken}</strong> ${rider.damageType} (${rider.label}, ${how}).`;
}
