/**
 * unarmed-profile — what a creature's own training does to its unarmed
 * Strikes (and, by Inner Tempest's Chapter 6 rule, to Monastic weapons).
 *
 * NEW at 3.667.0, for Inner Tempest Block 3 (core dependencies D11 and D12;
 * Graham's rulings of 22 October 2026).
 *
 * POWERFUL FISTS (Disciple): "The damage of your unarmed attacks is 1d6
 * rather than the usual 1d4 … your unarmed attacks gain the versatile
 * bludgeoning trait. … When your BAB becomes 3 and for every 3 it increases
 * thereafter you inflict an additional point of total unarmed damage. Be
 * aware that this is total unarmed damage and not base. … When your BAB
 * reaches 3, your strikes class as magical. When your BAB reaches 8 your
 * unarmed strikes are treated as cold iron and silver and at BAB 16 they
 * are treated as adamantine."
 *
 * DECLARED, NOT NAMED: an item or effect carries
 *
 *   flags.trg-prime.unarmedDamage = {
 *     die: "1d6",                      // the Unarmed Strike's own die
 *     versatile: "B",                  // a Versatile letter it gains
 *     perBAB: { every: 3, value: 1 },  // flat, added to the total
 *     countsAs: { magical: 3, "cold iron": 8, silver: 8, adamantine: 16 },
 *     label: "Powerful Fists"
 *   }
 *
 * THE DIE AND THE TRAIT are the Unarmed Strike's alone: a Monastic weapon
 * keeps its own die. The flat bonus and what the blow counts as reach every
 * Strike that counts as unarmed (`countsAsUnarmed`), which is the Chapter 6
 * rule: "any ability, feat or spell which can only be applied to an unarmed
 * strike can also be used with a monastic weapon".
 *
 * Pure: no Foundry.
 */

const FLAG = "trg-prime";
const norm = (v) => String(v ?? "").trim().toLowerCase();

/** The trait that makes a weapon count as unarmed (Inner Tempest, Chapter 6). */
const MONASTIC_TRAIT = "monastic";

/** The materials a blow may be "treated as", as the defence layer spells them. */
const COUNTS_AS_MATERIALS = Object.freeze(["cold iron", "silver", "adamantine"]);

/**
 * The fists themselves: the natural, unarmed-category attack whose damage is
 * subdual — the same test Fist of Rock uses (elixirs.mjs), so a heritage's
 * claws or a raptorial blade are not "unarmed attacks" here.
 */
export function isUnarmedStrike(weaponSystem) {
  const s = weaponSystem ?? {};
  return Boolean(s.natural) && norm(s.category) === "unarmed" && norm(s.damageType) === "subdual";
}

/** Does this weapon carry the Monastic trait? */
function hasMonasticTrait(weaponSystem) {
  return new RegExp(`\\b${MONASTIC_TRAIT}\\b`, "i").test(String(weaponSystem?.traits ?? ""));
}

/**
 * Does a Strike with this weapon count as an unarmed Strike (D11)? The
 * fists; a weapon the core already declares an unarmed attack (the
 * Gauntlet family, Brass Knuckles, Cestus: `system.unarmed`, see
 * unarmed.mjs); or a weapon with the Monastic trait. A claw or a bite is a
 * natural attack, not the fists Powerful Fists trains.
 */
export function countsAsUnarmed(weaponSystem) {
  return isUnarmedStrike(weaponSystem) || weaponSystem?.unarmed === true || hasMonasticTrait(weaponSystem);
}

/**
 * WHAT A WEAPON ATTACK IS STRUCK WITH (3.667.3), for the conditionals'
 * `attackForms` axis: "unarmed" when the Strike counts as unarmed (above),
 * "natural" for any other natural attack (a claw, a bite), and "weapon"
 * for everything else. Inner Strike's "+1 status bonus to unarmed attack
 * rolls" is scoped to the first.
 *
 * @param {object} weaponSystem
 * @returns {"unarmed"|"natural"|"weapon"}
 */
export function attackFormOf(weaponSystem) {
  if (countsAsUnarmed(weaponSystem)) return "unarmed";
  if (weaponSystem?.natural) return "natural";
  return "weapon";
}

/**
 * Every `unarmedDamage` declaration among these carriers (items and
 * effects), disabled effects skipped.
 *
 * @param {Iterable<object>} carriers
 * @returns {Array<object>}
 */
export function declaredUnarmedRows(carriers = []) {
  const out = [];
  for (const c of carriers ?? []) {
    if (!c || c.disabled) continue;
    const raw = c.flags?.[FLAG]?.unarmedDamage;
    if (!raw || typeof raw !== "object") continue;
    for (const row of Array.isArray(raw) ? raw : [raw]) {
      if (row && typeof row === "object") out.push({ ...row, label: String(row.label ?? c.name ?? "Unarmed training") });
    }
  }
  return out;
}

/** "+1 at BAB 3 and every 3 thereafter": floor(BAB / every) × value. */
function perBABBonus(perBAB, bab) {
  const every = Math.floor(Number(perBAB?.every) || 0);
  const value = Number(perBAB?.value) || 0;
  if (every <= 0 || !value) return 0;
  return Math.floor(Math.max(0, Number(bab) || 0) / every) * value;
}

/** A die that is larger than another ("1d6" over "1d4"); null if either is not one die. */
function dieSides(die) {
  const m = /^1?d(\d+)$/i.exec(String(die ?? "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * What the declarations do to one Strike.
 *
 * @param {object} weaponSystem
 * @param {Array<object>} rows from `declaredUnarmedRows`
 * @param {number} bab the attacker's BAB total
 * @returns {null|{damage: string|null, versatile: string|null, flat: number, flatLabel: string, magical: boolean, materials: string[], labels: string[]}}
 */
export function unarmedProfile(weaponSystem, rows = [], bab = 0) {
  if (!countsAsUnarmed(weaponSystem) || !rows?.length) return null;
  const fists = isUnarmedStrike(weaponSystem);
  let damage = null;
  let versatile = null;
  let flat = 0;
  const flatLabels = [];
  let magical = false;
  const materials = new Set();
  const labels = new Set();
  for (const row of rows) {
    // THE DIE: the largest declared, and only on the fists.
    if (fists && row.die) {
      const sides = dieSides(row.die);
      const current = dieSides(damage ?? weaponSystem?.damage);
      if (sides && (!current || sides > current)) { damage = `1d${sides}`; labels.add(row.label); }
    }
    if (fists && row.versatile) {
      const letter = String(row.versatile).trim().toUpperCase().slice(0, 1);
      if (["B", "P", "S"].includes(letter)) { versatile = letter; labels.add(row.label); }
    }
    const extra = perBABBonus(row.perBAB, bab);
    if (extra) { flat += extra; flatLabels.push(`${row.label} +${extra}`); labels.add(row.label); }
    for (const [what, at] of Object.entries(row.countsAs ?? {})) {
      if (Math.max(0, Number(bab) || 0) < Math.max(0, Number(at) || 0)) continue;
      const key = norm(what);
      if (key === "magical") { magical = true; labels.add(row.label); }
      else if (COUNTS_AS_MATERIALS.includes(key)) { materials.add(key); labels.add(row.label); }
    }
  }
  if (!damage && !versatile && !flat && !magical && !materials.size) return null;
  return {
    damage, versatile, flat,
    flatLabel: flatLabels.join(", "),
    magical,
    materials: [...materials],
    labels: [...labels]
  };
}

/**
 * The weapon data a Strike reads, with the fists' die and Versatile letter
 * applied (the rest of the profile is applied at damage).
 *
 * @param {object} weaponSystem
 * @param {object|null} profile
 * @returns {object}
 */
export function withUnarmedProfile(weaponSystem, profile) {
  if (!profile) return weaponSystem;
  const out = { ...weaponSystem };
  if (profile.damage) out.damage = profile.damage;
  if (profile.versatile && !/\bversatile\b/i.test(String(out.traits ?? ""))) {
    out.traits = [String(out.traits ?? "").trim(), `Versatile ${profile.versatile}`].filter(Boolean).join(", ");
  }
  return out;
}

/**
 * UNARMED ABILITIES WITH ANOTHER WEAPON (3.671.0; Inner Tempest's Soul
 * Weapon Master and Zen Archer, ruling B7-6). "Any ability that may be
 * used with unarmed strikes (such as Flurry of Blows) may also be used with
 * your Soul-Bound Weapon" — and, for the Zen Archer, "with a bow weapon".
 *
 * Declared on an item or effect the actor carries, as
 * `flags.trg-prime.unarmedAbilityWeapons: { itemIds, names, groups }`:
 * the bonded weapon's id, or the bows by name (the Bow group also holds
 * the crossbows, which are not bows). Any one matching is enough.
 *
 * ABILITIES ONLY. What reads this is what an ability asks — the strike
 * riders' unarmed scope, a stance's unarmed traits and damage type, the
 * conditionals' unarmed attack form, Savage Strikes, Death Mark. The
 * fists' own damage profile (Powerful Fists' die, Versatile, scaling and
 * materials) does not, and neither does anything that is not the
 * holder's ability (Vibrant Thorns, the unarmed fumble table).
 *
 * @param {Iterable<object>} carriers the actor's items and effects
 * @param {object} weapon the weapon item (or {id, name, system})
 * @returns {boolean}
 */
export function declaresUnarmedAbilities(carriers = [], weapon = null) {
  if (!weapon) return false;
  const id = String(weapon.id ?? weapon._id ?? "");
  const name = String(weapon.name ?? "").trim().toLowerCase();
  const group = String(weapon.system?.group ?? "").trim().toLowerCase();
  for (const carrier of carriers ?? []) {
    if (carrier?.disabled) continue;
    const spec = carrier?.flags?.["trg-prime"]?.unarmedAbilityWeapons;
    if (!spec || typeof spec !== "object") continue;
    const list = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).map((x) => String(x).trim());
    if (id && list(spec.itemIds).includes(id)) return true;
    if (name && list(spec.names).some((n) => n.toLowerCase() === name)) return true;
    if (group && list(spec.groups).some((g) => g.toLowerCase() === group)) return true;
  }
  return false;
}

/**
 * The weapon's data as the holder's ABILITIES see it: unarmed when
 * declaresUnarmedAbilities says so, otherwise unchanged (the same object).
 * Never hand this to the unarmed damage profile.
 */
export function abilityStrikeView(weaponSystem, declared) {
  if (!declared || !weaponSystem || countsAsUnarmed(weaponSystem)) return weaponSystem;
  return { ...weaponSystem, unarmed: true };
}

/** The actor's carriers, items and live effects, as the readers above take them. */
export function unarmedAbilityCarriers(actor) {
  return [...Array.from(actor?.items ?? []), ...Array.from(actor?.appliedEffects ?? actor?.effects ?? [])];
}

/**
 * ONE BONDED WEAPON'S SCALING (3.671.0; Inner Tempest's Soul-Bound Weapon):
 * "When your BAB becomes 3 and for every 3 it increases thereafter you
 * inflict an additional point of damage … this is total damage and not
 * base … When your BAB reaches 3, your strikes class as magical. When your
 * BAB reaches 8 … cold iron and silver and at BAB 16 … adamantine."
 *
 * Powerful Fists' shape scoped to one item: `flags.trg-prime.weaponScaling:
 * { itemId, perBAB: {every, value}, countsAs: {magical, "cold iron", …},
 * label }` on an item or effect. Matched by the weapon's id only.
 *
 * @returns {null|{flat: number, flatLabel: string, magical: boolean, materials: string[], labels: string[]}}
 */
export function weaponScalingProfile(carriers = [], weapon = null, bab = 0) {
  const id = String(weapon?.id ?? weapon?._id ?? "");
  if (!id) return null;
  const reached = Math.max(0, Number(bab) || 0);
  let flat = 0;
  const flatLabels = [];
  let magical = false;
  const materials = new Set();
  const labels = new Set();
  for (const c of carriers ?? []) {
    if (!c || c.disabled) continue;
    const raw = c.flags?.[FLAG]?.weaponScaling;
    for (const row of Array.isArray(raw) ? raw : (raw ? [raw] : [])) {
      if (!row || typeof row !== "object" || String(row.itemId ?? "") !== id) continue;
      const label = String(row.label ?? c.name ?? "Bonded weapon");
      const extra = perBABBonus(row.perBAB, bab);
      if (extra) { flat += extra; flatLabels.push(`${label} +${extra}`); labels.add(label); }
      for (const [what, at] of Object.entries(row.countsAs ?? {})) {
        if (reached < Math.max(0, Number(at) || 0)) continue;
        const key = norm(what);
        if (key === "magical") { magical = true; labels.add(label); }
        else if (COUNTS_AS_MATERIALS.includes(key)) { materials.add(key); labels.add(label); }
      }
    }
  }
  if (!flat && !magical && !materials.size) return null;
  return { flat, flatLabel: flatLabels.join(", "), magical, materials: [...materials], labels: [...labels] };
}
