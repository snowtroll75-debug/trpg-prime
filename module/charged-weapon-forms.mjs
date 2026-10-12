/**
 * A STAFF IS ALSO A STAFF — NEW at 3.616.0, Graham's R15 of block 36
 * (page 369).
 *
 * Several charged items print a weapon they can be swung as:
 *   Staff of Fire            "This expert quality staff is also engraved with
 *                            a Potency I rune."
 *   Staff of the Coast Runner  a Potency I rune
 *   Staff of Salinor Alshar  expert quality, densewood
 *   Sceptre of the Clergy    "may be used to attack as a light mace (expert,
 *                            potency I)"
 * and every staff is a staff. They are all `gear`, so none of them could
 * attack at all.
 *
 * The pack declares the form on `flags.trg-prime.chargedItem.weaponForm`:
 * `{base, quality, material, runes}`, where `base` names the weapon in the
 * weapons compendium ("Staff", "Light Mace"). While the charged item is
 * equipped, the wielder carries a GRANTED WEAPON of that form — the same
 * shape a Spell Effect rune's spell takes (`grantedBy.sourceId`), so it
 * goes when the item is unequipped or deleted.
 *
 * THE GRANTED WEAPON TAKES NO HAND OF ITS OWN: it is the charged item, held
 * in the hand the item already occupies (held-items.mjs reads
 * `weaponFormOf`).
 *
 * Pure; no Foundry. The documents half is charged-weapon-forms-workflow.mjs.
 */

const SYSTEM_ID = "trg-prime";
export const WEAPON_FORM_FLAG = "weaponFormOf";

/** The weapon form each equipped charged item grants. */
export function weaponFormGrants(items = []) {
  const out = [];
  for (const item of items ?? []) {
    if (!item?.system?.equipped) continue;
    const form = item?.flags?.[SYSTEM_ID]?.chargedItem?.weaponForm;
    if (!form?.base) continue;
    out.push({
      itemId: item.id ?? item._id ?? "",
      itemName: item.name ?? "",
      base: String(form.base),
      quality: String(form.quality ?? "standard") || "standard",
      material: String(form.material ?? ""),
      runes: String(form.runes ?? "")
    });
  }
  return out;
}

/** What identifies one form, so a changed form is a new grant. */
export function weaponFormSignature(grant) {
  return [grant?.itemId, grant?.base, grant?.quality, grant?.material, grant?.runes]
    .map((part) => String(part ?? "").toLowerCase()).join("|");
}

/**
 * What to create and what to remove.
 * @param {Array} desired from `weaponFormGrants`
 * @param {Array<{id: string, signature: string}>} existing granted weapons on the actor
 */
export function reconcileWeaponForms(desired = [], existing = []) {
  const wanted = new Map((desired ?? []).map((g) => [weaponFormSignature(g), g]));
  const kept = new Set();
  const remove = [];
  for (const entry of existing ?? []) {
    if (wanted.has(entry.signature) && !kept.has(entry.signature)) {
      kept.add(entry.signature);
      continue;
    }
    remove.push(entry.id);
  }
  return {
    create: Array.from(wanted.entries()).filter(([sig]) => !kept.has(sig)).map(([, g]) => g),
    remove
  };
}

/**
 * THE WEAPON A FORM IS (3.616.1, Graham's R2 of the 3.616.0 drive: "Wizards
 * are proficient with the staff and dagger"). The form is named after its
 * item — "Staff of Fire (Staff)" — so a proficiency named for the Staff
 * never matched it and a Wizard swung their own staff at -4. Proficiency
 * asks this as well as the name. The flag carries `base` from 3.616.1; a
 * form made at 3.616.0 still has it inside its signature.
 * @returns {string} the base weapon's name, or ""
 */
export function weaponFormBaseOf(item) {
  const flag = item?.flags?.[SYSTEM_ID]?.[WEAPON_FORM_FLAG];
  if (!flag) return "";
  if (flag.base) return String(flag.base);
  return String(flag.signature ?? "").split("|")[1] ?? "";
}

/** The granted weapon's name: "Staff of Fire (Staff)". */
export function weaponFormName(grant) {
  return `${grant?.itemName ?? ""} (${grant?.base ?? ""})`;
}

/** The fields the granted weapon carries over its base. */
export function weaponFormSystem(grant) {
  return {
    quality: grant.quality || "standard",
    material: grant.material || "",
    runes: grant.runes || "",
    equipped: true,
    price: 0,
    weight: 0
  };
}
