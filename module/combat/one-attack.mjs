/**
 * one-attack — a defence that lasts for the next attack against you only.
 *
 * NEW at 3.666.0 (Graham's rulings of 21 October 2026, Inner Tempest Block 2).
 *
 * THE GAP. Nimble Dodge prints "+2 dodge bonus to your DB against the
 * triggering attack", and core gave its +2 as an effect that stayed on the
 * sheet until somebody deleted it by hand: its own description said so. The
 * Core Rulebook had been signed off as fully automated, and that one was
 * not. Inner Tempest's Evade (a Bonus Check's worth of dodge against the
 * attack) and Impact Absorption (+1 Base DR against it) have the same shape.
 *
 * THE RULE, ruled with Evade: a reaction to being attacked is declared when
 * you are targeted, before the attacker rolls, and the bonus it gives lasts
 * for that attack. So an effect may declare `flags.trg-prime.oneAttack` and
 * the next attack against its bearer that it applies to removes it:
 *
 *   true                        any attack against your DB (a Strike, a
 *                               spell attack, a bomb, a spiritual weapon)
 *   {against: "attack"}         the same
 *   {against: "weapon"}         a weapon or natural-weapon Strike only
 *                               (Impact Absorption: "a targeted physical
 *                               attack")
 *   {actions: ["shoveAttack"]}  one of these actions resolved against you
 *                               (Root the Body's raised DC, ruled as Storgar's)
 *
 * and any of them may add `fromUuids`: only an attack by one of those
 * creatures spends it (Observe Technique's "your next defence against that
 * ability"). The event carries the attacker's uuid for that.
 *
 * Pure: the decisions live here, so the harness drives them without Foundry.
 */

const ONE_ATTACK_FLAG = "oneAttack";

/** The attacks a DB-based one-attack effect is spent by. */
const ATTACK_KINDS = Object.freeze(["weapon", "spell", "bomb", "spiritualWeapon"]);

const lower = (v) => String(v ?? "").trim().toLowerCase();

/**
 * An effect's declaration, normalised, or null when it declares none.
 *
 * @param {*} raw the flag's value
 * @returns {{against: "attack"|"weapon"|null, actions: string[]}|null}
 */
export function oneAttackSpec(raw) {
  if (raw === true) return { against: "attack", actions: [] };
  if (!raw || typeof raw !== "object") return null;
  const actions = (Array.isArray(raw.actions) ? raw.actions : []).map(lower).filter(Boolean);
  const declared = lower(raw.against);
  const against = declared === "weapon" ? "weapon"
    : declared === "attack" ? "attack"
    : actions.length ? null : "attack";
  const fromUuids = (Array.isArray(raw.fromUuids) ? raw.fromUuids : []).map((u) => String(u ?? "").trim()).filter(Boolean);
  return fromUuids.length ? { against, actions, fromUuids } : { against, actions };
}

/**
 * Is this attack the one the declaration lasts for?
 *
 * @param {object|null} spec from oneAttackSpec
 * @param {{kind: string, actionKey?: string}} event
 */
export function oneAttackUsedBy(spec, event) {
  if (!spec || !event) return false;
  // NOT CASE-FOLDED: a Foundry uuid is case-sensitive.
  if (spec.fromUuids?.length && !spec.fromUuids.includes(String(event.attackerUuid ?? ""))) return false;
  const kind = String(event.kind ?? "");
  if (kind === "action") return spec.actions.includes(lower(event.actionKey));
  if (spec.against === "weapon") return kind === "weapon";
  if (spec.against === "attack") return ATTACK_KINDS.includes(kind);
  return false;
}

/**
 * The ids of the effects this attack spends.
 *
 * @param {Iterable<object>} effects the bearer's own effects
 * @param {{kind: string, actionKey?: string}} event
 * @param {string} systemId
 * @returns {string[]}
 */
export function oneAttackEffectIds(effects, event, systemId = "trg-prime") {
  const ids = [];
  for (const effect of Array.from(effects ?? [])) {
    if (!effect?.id || effect.disabled) continue;
    const spec = oneAttackSpec(effect.flags?.[systemId]?.[ONE_ATTACK_FLAG]);
    if (oneAttackUsedBy(spec, event)) ids.push(effect.id);
  }
  return ids;
}
