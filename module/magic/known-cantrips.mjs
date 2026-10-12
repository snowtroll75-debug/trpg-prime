/**
 * KNOWN CANTRIPS — cantrips a class LEARNS once, not ones it prepares
 * daily (Chapter 3).
 *
 * WHY THIS IS A SEPARATE CONCEPT, and not a number added to the
 * memorisation code. The chapter describes cantrips two different ways
 * and they are not the same mechanic:
 *
 *   THE LEARNED CASTERS PREPARE THEM. Cleric: "Each day when you
 *   prepare your spells you may also learn any four divinity cantrips…
 *   and may change them each day during daily preparation." Druid and
 *   Wizard say the same with their own tradition. That is an allowance
 *   refreshed every morning, it belongs to daily preparation, and
 *   `cantripsPerDay` on the class item already carries it.
 *
 *   THE BARD LEARNS THEM ONCE. "You learn any two cantrips at 1st
 *   level. These cantrips may be selected from the ethereal magical
 *   tradition. These cantrips may be cast at any time and do not need to
 *   be memorised." No daily preparation, no changing them, no
 *   memorisation at all — a small permanent list, exactly like the
 *   instinctive repertoire sitting next to it.
 *
 * FOUND BY AUDIT on 17 Aug 2026 (3.322.0): a Bard's Magic tab did not
 * contain the word "cantrip" anywhere. `cantripsPerDay` was 0 — which
 * was CORRECT, because the Bard has no daily allowance — and there was
 * no second concept for the thing they actually have. The line was not
 * mis-implemented; it had no home.
 *
 * SO THIS MIRRORS THE REPERTOIRE rather than the memorisation code
 * (Graham's ruling, 17 Aug 2026), because that is the mechanic it
 * resembles: a fixed number of permanent picks from one tradition, held
 * as items on the actor, counted against an allowance, and taken away
 * with the class item like every other class grant. A future instinctive
 * caster with known cantrips sets one number and gets all of it.
 */

const SYSTEM_ID = "trg-prime";

/**
 * How many cantrips this class LEARNS permanently.
 *
 * Zero is the answer for every class that prepares them daily instead,
 * and zero means "this class has no such pool" rather than "a pool of
 * none" — the panel does not appear at all. Deliberately NOT falling
 * back to a printed default the way `cantripsPerDay` does: a default
 * there is safe because all three learned casters print the same four,
 * whereas a default here would invent a pool for the Fighter.
 */
export function knownCantripCount(classItem) {
  return Math.max(0, Math.floor(Number(classItem?.system?.cantripsKnown) || 0));
}

/** The cantrips already picked into the pool. */
export function knownCantrips(actor) {
  return Array.from(actor?.items ?? []).filter(
    (item) => item.type === "spell" && Boolean(item.flags?.[SYSTEM_ID]?.cantripPick)
  );
}

/**
 * Allowance, picks made, and what is still owed.
 *
 * NOT LEVELLED. The Bard's sentence grants both at 1st and never
 * mentions another, so unlike `repertoirePickCount` there is no schedule
 * here — and inventing one would quietly hand out cantrips the book does
 * not.
 */
export function knownCantripState({ allowed = 0, picked = 0 } = {}) {
  const total = Math.max(0, Math.floor(Number(allowed) || 0));
  const made = Math.max(0, Math.floor(Number(picked) || 0));
  return { allowed: total, picked: made, remaining: Math.max(0, total - made) };
}

/**
 * May this pack spell be taken as a known cantrip?
 *
 * PP 0 AND THE CLASS'S TRADITION — "These cantrips may be selected from
 * the ethereal magical tradition." Specialist spells are excluded for
 * the same reason the repertoire excludes them (Graham, 15 Aug 2026): a
 * free pick must not take what a class, heritage or school is meant to
 * grant.
 *
 * A spell's tradition may name several ("arcane, divinity, ethereal"),
 * so the class's one has to be found among them rather than compared
 * whole — the mistake that would make every multi-tradition cantrip
 * invisible while single-tradition ones worked, which reads as "the
 * pack is thin" rather than as a bug.
 */
export function cantripPickEligible(spell, { tradition = "" } = {}) {
  if (Number(spell?.ppCost ?? -1) !== 0) return false;
  if (spell?.specialist) return false;
  const wanted = String(tradition).trim().toLowerCase();
  if (!wanted) return false;
  return String(spell?.tradition ?? "")
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase())
    .includes(wanted);
}
