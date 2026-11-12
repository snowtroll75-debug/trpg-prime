/**
 * THE DAMAGE CARD'S ONE LINE SAYS WHO WAS HURT (3.681.2).
 *
 * Graham, 3 November 2026, on a Vhalendar Resonance Soldier's thrown Spear:
 * "the attack is made against Borin but damages himself!" It did not. The
 * damage landed on Borin, as the card's expanded breakdown said ("vs Borin
 * Slatevein: 4 Piercing, DR 2 → 2 taken. Now 50 / 54 HP"). But the card's
 * header is the ATTACKER's name — it is the attacker's card — and its
 * collapsed line read only "2 Piercing taken". Read together, the card
 * said "Resonance Soldier of 2221 (2) … 2 Piercing taken", which is a
 * sentence about the Soldier.
 *
 * So the line now names the creature that took the damage: "Borin
 * Slatevein takes 2 Piercing". A stray shot names the bystander it struck,
 * because that is who `resolveWeaponDamage` resolved it against. A roll with
 * no target says so, as the attack card's "no target" does, rather than
 * leaving a bare number a reader will pin on the name above it.
 *
 * Pure, so it is checked by driving it rather than by reading it.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

/** A name for the card's HTML: a token named "<b>Ogre" prints as typed. */
function escapeName(name) {
  return String(name ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * @param {object} args
 * @param {string|null} args.targetName the creature the damage was resolved against, or null
 * @param {number|null} args.taken what it took after its defences, or null when nothing was applied
 * @param {number} args.total the damage rolled
 * @param {string} args.typeLabel e.g. "Piercing"
 * @returns {string} the card's collapsed line (HTML-safe)
 */
export function damageCardSummary({ targetName = null, taken = null, total = 0, typeLabel = "" } = {}) {
  const type = escapeName(typeLabel);
  const name = String(targetName ?? "").trim();
  if (taken !== null && taken !== undefined && name) return `${escapeName(name)} takes ${taken} ${type}`;
  if (taken !== null && taken !== undefined) return `${taken} ${type} taken`;
  return `${total} ${type} — no target`;
}
