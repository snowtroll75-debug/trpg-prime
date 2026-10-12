/**
 * A spell that hands its target an ability the pack already defines.
 *
 * NEW at 3.587.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY BY UUID AND NOT BY DESCRIPTION.
 *
 * Darkvision (page 261) says, in full, "You gain Darkvision." The system
 * already knows what Darkvision is: an ability in the abilities pack
 * carrying `creatureAbility.derives.light.raisesLevelBy = 2` and a
 * primary visual sense, which `bestLightStep` and `visualRangeReport`
 * both read.
 *
 * The obvious build was a new effect kind carrying that derives block on
 * the spell's own row — and it would have put a second definition of
 * Darkvision in the pack, in a different file, free to drift from the
 * first the next time Chapter 8 is touched. This project has a name for
 * that ("two places deciding one question") and a list of the times it
 * has cost a release. So the row names the ability and the ability stays
 * where it is defined.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ABILITY IS COPIED, NOT LINKED, and then torn down by castId like
 * every other item a spell builds — the `grantedItems` lifecycle that
 * `sense`, `conjuredWeapon` and the natural attacks all use. A spell
 * that ends must take back what it gave.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A DUPLICATE IS NOT GRANTED TWICE. A creature that already has
 * Darkvision innately gains nothing from the spell — its light step is
 * the better of the two, not the sum — and stacking a second copy would
 * put a second identical row on its sheet for an hour. The refusal is
 * reported rather than swallowed: "you already have this" is a true and
 * useful thing for a card to say, and a spell that silently did nothing
 * is the shape this project keeps finding.
 */

const text = (v) => String(v ?? "").trim();

/**
 * Read a `grantAbility` row.
 *
 * @returns {{uuid: string, label: string}|null}
 */
export function normaliseGrantedAbility(raw) {
  if (!raw || typeof raw !== "object") return null;
  const uuid = text(raw.uuid);
  // A row with no uuid has nothing to fetch. It is refused here rather
  // than reaching `fromUuid` as an empty string, which resolves to null
  // and is indistinguishable from a compendium that has moved.
  if (!uuid) return null;
  // WHAT THE COPY CHANGES (3.613.0, R5 — Shifting Form's claws: "medium,
  // agile finesse unarmed attacks that inflict slashing damage"). The pack's
  // Claw is a creature's, printed with Versatile (P); the spell's are not.
  // Plain `system` fields laid over the copy, never a second definition.
  const system = raw.system && typeof raw.system === "object" && !Array.isArray(raw.system)
    ? { ...raw.system } : null;
  return system ? { uuid, label: text(raw.label), system } : { uuid, label: text(raw.label) };
}

/**
 * Does this creature already have it?
 *
 * Matched on NAME, because the granted copy is a copy: its id is new
 * every time, and an innate Darkvision and a spell's Darkvision are the
 * same ability by the only identity a sheet shows.
 *
 * @param {Array<{name: string}>} items
 * @param {string} name
 */
export function alreadyHasAbility(items = [], name = "") {
  const wanted = text(name).toLowerCase();
  if (!wanted) return false;
  return (items ?? []).some((item) => text(item?.name).toLowerCase() === wanted);
}

/** The card line, for each of the three things that can happen. */
export function grantedAbilityLine(spellName, targetName, { name = "", already = false, missing = false } = {}) {
  if (missing) {
    return `<em>${spellName} names an ability the pack does not hold — nothing applied.</em>`;
  }
  if (already) {
    return `${targetName} already has <strong>${name}</strong> — ${spellName} adds nothing.`;
  }
  return `${targetName} gains <strong>${name}</strong>`;
}
