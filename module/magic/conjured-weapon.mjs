/**
 * conjured-weapon — a weapon a spell makes out of nothing.
 *
 * NEW at 3.543.0, for Eldritch Weapon, whose weapon did not exist.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG.
 *
 * "You create a one-handed simple melee weapon of pure magic sized
 * appropriately for you that you can wield or give to another creature.
 * The weapon requires any usual proficiencies but inflicts force damage
 * rather than its normal type."
 *
 * The spell shipped with `effects: []`. Not a missing warp — a missing
 * SPELL. Casting it spent 6 PP and produced nothing at all, and its three
 * warping options were all inert because there was no weapon for any of
 * them to modify.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NOT `conjureItem`.
 *
 * Bless Water names its item — "Holy Water" — and copies that one entry.
 * This spell names a CLASS of item and lets the caster pick: any
 * one-handed simple melee weapon, widened to martial by a warp. A row
 * that named one weapon would be a different spell.
 *
 * So the row carries a FILTER and the workflow asks. The filter is here,
 * pure, and the asking is not.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DAMAGE TYPE IS AN OVERRIDE, NOT AN ADDITION.
 *
 * "inflicts force damage RATHER THAN its normal type" — a conjured mace
 * does no bludgeoning at all. Written as a replacement here so nothing
 * downstream has to remember to drop the original, which is the mistake
 * `warpedHealFormula` made once by adding where it should have replaced.
 */

/** Where a conjured weapon is copied from. One pack, named, so a typo cannot reach another. */
export const CONJURED_WEAPON_PACK = "weapons";

/** What every weapon this spell makes deals, whatever it was copied from. */
export const CONJURED_WEAPON_DAMAGE = "force";

const text = (v) => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);

/**
 * A conjuredWeapon row, or null when it is malformed.
 *
 * REFUSED RATHER THAN DEFAULTED, like every other `normalise*` here: a
 * row with no categories would silently offer the caster every weapon in
 * the pack, which is a bigger spell than the one that was written.
 */
export function normaliseConjuredWeapon(raw = {}) {
  if (raw?.kind !== "conjuredWeapon") return null;
  const categories = list(raw.categories);
  if (!categories.length) return null;
  return {
    label: text(raw.label) || "Conjured Weapon",
    target: text(raw.target) || "self",
    categories,
    hands: Number.isFinite(Number(raw.hands)) ? Math.trunc(Number(raw.hands)) : 1,
    melee: raw.melee !== false,
    damageType: text(raw.damageType) || CONJURED_WEAPON_DAMAGE
  };
}

/**
 * Which weapon categories the caster may choose from, after warps.
 *
 * THE WARP WIDENS, IT DOES NOT REPLACE. Eldritch Weapon's first option
 * reads "the weapon CAN BE a martial weapon" — the simple weapons are
 * still on the table, so this is a union. Replacing would take away
 * something already paid for, which no warp in the pack does.
 */
export function conjuredWeaponCategories(spec, warpMods = {}) {
  const base = list(spec?.categories);
  const added = list(warpMods?.weaponCategories);
  const seen = new Set();
  return [...base, ...added].filter((c) => {
    const k = c.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Is this pack weapon one the spell may make?
 *
 * TAKES THE ITEM'S OWN FIELDS rather than a name list, so a weapon added
 * to the pack tomorrow is offered without this file changing — the same
 * reason the proficiency table stores rules instead of names.
 */
export function conjuredWeaponAllows(spec, warpMods, item) {
  const rule = normaliseConjuredWeapon(spec) ?? spec;
  if (!rule) return false;
  const cats = conjuredWeaponCategories(rule, warpMods).map((c) => c.toLowerCase());
  const category = text(item?.system?.category).toLowerCase();
  if (!cats.includes(category)) return false;
  if (rule.hands != null && Number(item?.system?.hands ?? 1) !== Number(rule.hands)) return false;
  if (rule.melee) {
    /* A THROWN WEAPON IS STILL A MELEE WEAPON, and a bow is not.
     *
     * THE `range` FIELD IS NOT WHERE THIS LIVES, which the harness found
     * on its first run: every weapon in the pack carries `range: 0` and
     * states its reach in TRAITS instead — "Range 60 ft" on a Composite
     * Shortbow, "Thrown 20 ft" on a Trident. Filtering on the field
     * offered the caster a bow.
     *
     * So the trait decides, and the two words are not synonyms: Thrown
     * describes a melee weapon you may also throw and stays eligible;
     * Range describes a weapon that only works at distance and does not. */
    const traits = String(item?.system?.traits ?? "");
    if (/\brange\b/i.test(traits)) return false;
  }
  return true;
}

/**
 * The weapons a caster may pick from, in pack order.
 *
 * PURE, AND IT TAKES THE LIST. The workflow reads the pack; this decides
 * what is eligible, so the harness can drive the whole choice without a
 * world.
 */
export function conjuredWeaponChoices(spec, warpMods, items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((i) => i?.type === "weapon")
    .filter((i) => conjuredWeaponAllows(spec, warpMods, i));
}

/**
 * What the conjured copy should look like, given the pack weapon chosen.
 *
 * THE COPY IS THE PACK ENTRY, CHANGED IN TWO PLACES — the damage type,
 * and a flag saying where it came from. Everything else is left alone on
 * purpose: proficiency, quality, weight and traits all still apply,
 * because the spell says the weapon "requires any usual proficiencies".
 */
export function conjuredWeaponData(spec, base = {}) {
  const rule = normaliseConjuredWeapon(spec) ?? spec;
  const data = foundryClone(base);
  data.system = data.system ?? {};
  data.system.damageType = rule?.damageType ?? CONJURED_WEAPON_DAMAGE;
  data.system.equipped = false;
  return data;
}

/* A DEEP COPY THAT WORKS IN BOTH PLACES — a plain object in the harness
 * and a document's toObject() in the world.
 *
 * DELIBERATELY NOT `structuredClone`: verify-no-undefined-names does not
 * carry it as a declared global, and adding a browser global to that list
 * to save one line would weaken a check that exists to catch typos in
 * every other file. The round trip is enough for effect data, which is
 * JSON by definition. */
function foundryClone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}
