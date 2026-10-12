/**
 * A BLOW THAT ARRIVES LATE.
 *
 * NEW at 3.493.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DELAYED RESPITE (PP 1, Cleric, Essence / Utility / Warding)
 *
 *   Cast R; Trigger a creature or object within range takes damage from
 *   an attack; Range 30 feet; Duration 1 round (D)
 *
 *   "You manipulate the flow of time, causing the impact of the attack to
 *    be delayed. Although damage and critical hits are determined as
 *    usual, the target's HP remain unaffected, and no other effects of
 *    the attack take hold until the spell's duration has passed. Once the
 *    spell ends, the results of the attack manifest instantly, subjecting
 *    the target to the full damage and any additional effects."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DAMAGE IS DEFERRED. THE REST IS PRINTED. Graham's ruling,
 * 4 September 2026, on the scoping done on 29 August.
 *
 * All sixteen damage routes cross one shared primitive,
 * `applyDamageAndCheckDying`, and the 3.339.4 permission relay is the
 * precedent for intercepting exactly there. So the HP half is ONE gate.
 *
 * "No other effects of the attack take hold" is not: conditions are a
 * separate path with twelve call sites, and critical injuries are rolled
 * inline in the attack workflow. Three hooks across three subsystems for
 * one PP 1 spell — and three places for the release to disagree with
 * itself. So the card names the critical, the conditions and the bleed
 * for the GM to hold alongside the damage, and this defers the number.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FOUR RULINGS, all 4 September 2026.
 *
 *   DISMISSAL FIRES IT. "Once the spell ends, the results manifest
 *     instantly" — a dismissal is an ending. That makes dismissing a
 *     WEAPON rather than a mercy: the caster chooses when the blow lands.
 *
 *   DEATH FIRST DOES NOT SAVE YOU. The packet still lands, on a corpse if
 *     need be. A delay, not an escape.
 *
 *   HEALING DOES NOT REDUCE IT. "The results manifest IN FULL." Healing
 *     during the round raises the hit points the packet then eats into;
 *     it is not subtracted from the packet. That is the difference
 *     between a delay and a negation.
 *
 *   ONE ATTACK, ONE PACKET. "The triggering creature" and "the impact of
 *     THE attack" both read singular, so once a Respite has caught a blow
 *     it catches no more — a second blow in the same round lands now.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/** The flag a Respite effect carries. */
export const RESPITE_FLAG = "delayedRespite";

/** A Delayed Respite row, or null when it is malformed. */
export function normaliseDelayedRespite(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && String(raw.kind ?? "").trim() !== "delayedRespite") return null;
  return { label: String(raw.label ?? "").trim() || "Delayed Respite", packet: raw.packet ?? null };
}

/**
 * Should this Respite catch the blow now arriving?
 *
 * ONE ATTACK, ONE PACKET. A Respite that has already caught one is spent
 * and lets everything after it through — so the test is whether it is
 * still empty, not merely whether it is present.
 *
 * ZERO DAMAGE IS NOT A BLOW. `applyDamageDirect` returns early on it
 * anyway, and catching it would spend the spell on nothing.
 */
export function respiteCatches(record, damage) {
  if (!record) return false;
  if (record.packet) return false;
  return int(damage) > 0;
}

/** The packet a caught blow stores. */
export function respitePacket(damage, { isCritical = false, nonlethal = false } = {}) {
  return {
    damage: Math.max(0, int(damage)),
    isCritical: Boolean(isCritical),
    nonlethal: Boolean(nonlethal)
  };
}

/** What the card says when a blow is caught. */
export function respiteCaughtLine(actorName, packet) {
  return `<strong>${actorName}</strong>: the blow is held out of time — `
    + `<strong>${packet.damage}</strong>${packet.isCritical ? " (critical)" : ""} damage will `
    + "arrive when the spell ends.";
}

/** What the card says when it arrives. */
export function respiteReleasedLine(actorName, packet, dismissed = false) {
  return `<strong>${actorName}</strong>: the delayed blow lands`
    + `${dismissed ? " — released early" : ""} — <strong>${packet.damage}</strong>`
    + `${packet.isCritical ? " (critical)" : ""} damage.`;
}

/**
 * The half the table holds, named on every cast.
 *
 * SAID EVERY TIME, and this is the whole honesty of the spell. A card
 * that deferred the number and said nothing else would let a table
 * believe the critical injury had been held too — and the critical will
 * have landed already, in front of them, a moment earlier. Better to
 * name what is not deferred than to be believed about it.
 */
export function respiteRemainderLine() {
  return "<em>The damage is held. Everything else the attack did — a critical injury, conditions, "
    + "bleed, forced movement — resolved as usual and is the GM's to hold alongside it. Dismiss "
    + "the spell to release the blow early.</em>";
}
