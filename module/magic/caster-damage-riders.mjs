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
    if (!DICE.test(dice) || !damageType) continue;
    const row = {
      id: String(effect.id ?? ""),
      label: String(raw.label ?? effect.name ?? "Spell rider"),
      dice,
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
export function spellDamageRidersFor(riders = [], { damageType = "", targetTypes = [], taken = 0, targetUuid = "", used = {}, tradition = "" } = {}) {
  if (!(Number(taken) > 0)) return [];
  const type = String(damageType ?? "").trim().toLowerCase();
  const types = list(targetTypes);
  const traditions = String(tradition ?? "").toLowerCase().split(/[,;/]/).map((t) => t.trim()).filter(Boolean);
  return (riders ?? []).filter((r) => {
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

/** The card line for a rider that landed. */
export function spellRiderLine(targetName, rider, taken, immune = false) {
  return immune
    ? `${targetName}: <strong>immune</strong> to ${rider.damageType} (${rider.label}).`
    : `${targetName}: <strong>${taken}</strong> ${rider.damageType} (${rider.label}, ${rider.dice}).`;
}
