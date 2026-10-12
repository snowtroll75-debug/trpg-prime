/**
 * A SPELL THAT PUTS A TRAIT ON A WEAPON.
 *
 * NEW at 3.590.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * KEEN EDGE (PP 8, Alteration, 10 minutes, one weapon or 50 projectiles)
 *
 *   "This transmutation grants the weapon the Keen quality."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE `trait` KIND COULD NOT DO IT, which is where it was authored
 * first and where the defect would have shipped from.
 *
 * `applyTraitEffect` writes `grantedTraits` onto an ActiveEffect on the
 * CREATURE — it is the polymorph channel, and what reads it is the
 * creature's own trait line. Keen has exactly three readers, all of them
 * in `attack-workflow`, and all three ask about the WEAPON:
 *
 *   /\bkeen\b/i on `weaponData.traits`
 *   materialGrantedWeaponTraits(weaponData)      (Densewood, Eaog, Mithril)
 *   improvedCriticalGroups.includes(weapon.group) (the Class feature)
 *
 * So `{kind:"trait", traits:"keen"}` makes the CASTER keen, which
 * nothing anywhere reads. It would have applied cleanly, printed
 * "gains the keen traits" on the card, and changed no roll — a spell
 * whose whole mechanism is one word, silently doing nothing, announced
 * as working.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SHAPE IS weaponDamageBonus's AND defencePierce's, deliberately: a
 * spec on an ActiveEffect on the actor carrying `weaponIds`, matched at
 * attack time. Three mechanisms already answer "which weapon does this
 * spell go on" through `promptRiderWeapon`, and this is the fourth
 * rather than a fourth way of asking.
 *
 * AND THE READER WIDENS THE EXISTING TEST rather than adding a channel —
 * the lesson 3.573.0 recorded when Keen's MATERIAL grant turned out to
 * be computed and read by nobody. `keen` is the one thing every
 * critical-severity rule consults; a second answer to "is this blow
 * keen" would be a second thing to keep in step.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A TRAIT NOBODY READS IS REFUSED, LOUDLY — the position `ward` takes
 * for a defence slot nobody implements, and for the same reason. A spell
 * that grants `razor` would look identical on the card and do nothing,
 * because Razor rides the RUNE channel (`runeBonusesFor(weapon)
 * .criticalAV`) and not the trait string. So this names the traits it
 * can actually make true, and refuses the rest where somebody can see
 * it. The list grows when a reader does.
 */

const text = (v) => String(v ?? "").trim();

/** The flag a weapon-trait effect carries its spec on. */
export const WEAPON_TRAIT_FLAG = "weaponTrait";

/**
 * Traits a spell may put on a weapon, because something reads them there.
 *
 * ONE ENTRY TODAY, and that is the honest size of it. `keen` is read by
 * combat/attack-workflow.mjs when it decides the AV a critical is scored
 * at. Every other weapon trait in the game is read off the weapon's own
 * printed string, which a spell does not edit, or off the rune layer,
 * which is not a trait at all.
 */
export const GRANTABLE_WEAPON_TRAITS = Object.freeze(["keen"]);

/**
 * A weapon-trait row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {{traits:string[], label:string, weapons:number}|null}
 */
export function normaliseWeaponTrait(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "weaponTrait") return null;

  const wanted = (Array.isArray(raw.traits) ? raw.traits : text(raw.traits).split(","))
    .map((t) => text(t).toLowerCase())
    .filter(Boolean);
  if (!wanted.length) return null;

  return {
    traits: [...new Set(wanted)],
    label: text(raw.label),
    // HOW MANY WEAPONS THIS CASTING COVERS. Keen Edge's "one weapon or
    // 50 projectiles" is one prompt either way: a stack of arrows is one
    // item, and its 50 are its quantity rather than 50 choices.
    weapons: Math.max(1, Math.trunc(Number(raw.weapons) || 1))
  };
}

/** The traits of a normalised row that nothing would read. */
export function unreadableWeaponTraits(spec) {
  return (spec?.traits ?? []).filter((t) => !GRANTABLE_WEAPON_TRAITS.includes(t));
}

/**
 * Does this weapon carry a spell-granted trait right now?
 *
 * TAKES THE EFFECTS AND THE WEAPON ID, not an actor, so the whole rule is
 * drivable without Foundry — the attack workflow has both in hand at the
 * moment it asks.
 *
 * A DISABLED EFFECT GRANTS NOTHING: an Antimagic Field switches a spell
 * off rather than deleting it (3.586.0), and a weapon whose enchantment
 * is suppressed must not still be keen.
 *
 * @param {Iterable<object>} effects the actor's effects
 * @param {string} weaponId the weapon being swung
 * @param {string} trait the trait asked about, lower case
 * @returns {boolean}
 */
export function weaponHasSpellTrait(effects, weaponId, trait) {
  const id = text(weaponId);
  const wanted = text(trait).toLowerCase();
  if (!id || !wanted) return false;
  for (const effect of effects ?? []) {
    if (effect?.disabled) continue;
    const spec = effect?.flags?.["trg-prime"]?.[WEAPON_TRAIT_FLAG];
    if (!spec) continue;
    const ids = Array.isArray(spec.weaponIds) ? spec.weaponIds.map(text) : [];
    if (!ids.includes(id)) continue;
    const traits = Array.isArray(spec.traits) ? spec.traits.map((t) => text(t).toLowerCase()) : [];
    if (traits.includes(wanted)) return true;
  }
  return false;
}

/** What the card says when the edge lands. */
export function weaponTraitLine(spec, targetName, weaponNames) {
  const which = weaponNames.length ? weaponNames.join(", ") : "a weapon";
  const traits = spec.traits.join(", ");
  return `<strong>${targetName}</strong>'s <strong>${which}</strong> gains the `
    + `<strong>${traits}</strong> trait${spec.traits.length === 1 ? "" : "s"}`;
}
